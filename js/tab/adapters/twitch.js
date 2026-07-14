/**
 * tab/adapters/twitch.js — anonymous Twitch IRC over native WebSocket. (NIGHTSHIFT, B4)
 *
 * WHAT: A ChatAdapter (arch §4) that reads a channel's chat read-only via
 *       wss://irc-ws.chat.twitch.tv:443, anonymous justinfan login, tags +
 *       commands caps, and publishes chat:message / chat:system /
 *       chat:status to the bus. Wire facts: docs/twitch-protocol-brief.md.
 * WHY:  Zero dependencies — the parser is ~40 lines, tmi.js is a building
 *       we don't need to rent.
 * HOW:  connect() opens the socket and starts ONE clock subscription that
 *       runs both the reconnect backoff (1s→30s exponential, clock-driven,
 *       never a browser timer — clock law §7.2) and the 4.5-minute dead-air
 *       watchdog. PING→PONG is reactive. Server RECONNECT → teardown +
 *       backoff. disconnect() is idempotent and silences everything.
 * GOTCHA: This module is only ever dynamically import()ed when
 *       CONFIG.TWITCH_HANDLE is truthy (arch §4) — demo mode never parses
 *       this file. Empty color tag ships as null; the RENDERER derives the
 *       fallback HSL via rng.hashString(login) (contracts.js ChatMessage).
 */
import { bus } from '../../core/bus.js';
import { clock } from '../../core/clock.js';
import { makeRng, hashString } from '../../core/rng.js';
import { t } from '../../data/strings.js';

const WSS_URL = 'wss://irc-ws.chat.twitch.tv:443';
const SILENCE_WATCHDOG_MS = 270000; // 4.5 min without any inbound line → assume dead socket
const BACKOFF_START_MS = 1000, BACKOFF_CAP_MS = 30000;

/** Track the string-table mode for in-voice notices. */
let mode = 'normal';
bus.on('state:change', (sc) => { mode = sc.afterhoursActive ? 'afterhours' : 'normal'; });

/** Unescape IRCv3 tag values (\s space, \: semicolon, \\ backslash, \r, \n). */
function unescTag(v) {
  return v.replace(/\\(.)/g, (m, c) => (c === 's' ? ' ' : c === ':' ? ';' : c === 'r' ? '\r' : c === 'n' ? '\n' : c));
}

/**
 * Minimal IRC line parser (brief §1.6 shape).
 * @param {string} line one wire line, no CRLF
 * @returns {{command:string, tags:Object<string,string>, login:string, text:string}}
 */
function parseLine(line) {
  let rest = line;
  const tags = {};
  if (rest[0] === '@') {
    const sp = rest.indexOf(' ');
    for (const pair of rest.slice(1, sp).split(';')) {
      const eq = pair.indexOf('=');
      tags[pair.slice(0, eq)] = unescTag(pair.slice(eq + 1));
    }
    rest = rest.slice(sp + 1);
  }
  let prefix = '';
  if (rest[0] === ':') {
    const sp = rest.indexOf(' ');
    prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  const sp = rest.indexOf(' ');
  const command = sp < 0 ? rest : rest.slice(0, sp);
  let text = '';
  if (command === 'PRIVMSG') {
    const colon = rest.indexOf(' :');
    text = colon >= 0 ? rest.slice(colon + 2) : '';
  }
  return { command, tags, login: prefix.split('!')[0], text };
}

/**
 * 'emoteID:start-end,start-end/emoteID:…' → EmoteSpan[] (UTF-16 units, inclusive).
 * @param {string} raw
 * @returns {import('../../core/contracts.js').EmoteSpan[]}
 */
function parseEmotes(raw) {
  if (!raw) return [];
  const out = [];
  for (const grp of raw.split('/')) {
    const ci = grp.indexOf(':');
    if (ci < 0) continue;
    const id = grp.slice(0, ci);
    for (const r of grp.slice(ci + 1).split(',')) {
      const dash = r.indexOf('-');
      if (dash < 0) continue;
      out.push({ id, start: Number(r.slice(0, dash)), end: Number(r.slice(dash + 1)) });
    }
  }
  return out;
}

/** @implements {import('../../core/contracts.js').ChatAdapter} */
export class TwitchAdapter {
  /** @param {string} handle channel login, lowercase, no '#' */
  constructor(handle) {
    this.name = 'twitch';
    this.connected = false;
    this._handle = (handle || '').toLowerCase();
    this._ws = null;
    this._active = false;
    this._unsubClock = null;
    this._backoffMs = BACKOFF_START_MS;
    this._reconnectAt = 0;   // virtual-clock timestamp; 0 = nothing pending
    this._lastRxAt = 0;
    this._lossNotified = false;
  }

  /** Idempotent: opens the socket and starts the clock-driven supervisor. */
  connect() {
    if (this._active || !this._handle) return;
    this._active = true;
    this._unsubClock = clock.subscribe((deltaMs, now) => this._supervise(now));
    this._open();
  }

  /** Idempotent: stops emission, closes the socket, kills the supervisor. */
  disconnect() {
    if (!this._active) return;
    this._active = false;
    this._reconnectAt = 0;
    if (this._unsubClock) { this._unsubClock(); this._unsubClock = null; }
    const ws = this._ws;
    this._ws = null;
    if (ws) { ws.onclose = null; try { ws.close(); } catch { /* already dead */ } }
    if (this.connected) {
      this.connected = false;
      bus.emit('chat:status', { connected: false, adapter: 'twitch' });
    }
  }

  _open() {
    let ws;
    try { ws = new WebSocket(WSS_URL); }
    catch { this._scheduleReconnect(); return; }
    this._ws = ws;
    ws.onopen = () => {
      this._backoffMs = BACKOFF_START_MS;
      // session-seeded digits — determinism law applies outside render too (arch §4)
      const digits = String(10000 + Math.floor(makeRng('irc:' + clock.now())() * 80000));
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('NICK justinfan' + digits);
      ws.send('JOIN #' + this._handle);
      this.connected = true;
      this._lastRxAt = clock.now();
      this._lossNotified = false;
      bus.emit('chat:status', { connected: true, adapter: 'twitch' });
    };
    ws.onmessage = (ev) => this._rx(String(ev.data), ws);
    ws.onclose = () => { if (this._active && ws === this._ws) this._down(); };
    ws.onerror = () => { try { ws.close(); } catch { /* closing anyway */ } };
  }

  _down() {
    this.connected = false;
    bus.emit('chat:status', { connected: false, adapter: 'twitch' });
    if (!this._lossNotified) {
      this._lossNotified = true; // one in-voice confession per outage, not per retry
      bus.emit('chat:system', { text: t('errors.chatLost', mode), ts: clock.now(), kind: 'notice' });
    }
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    this._reconnectAt = clock.now() + this._backoffMs;
    this._backoffMs = Math.min(this._backoffMs * 2, BACKOFF_CAP_MS);
  }

  /** Clock tick: fire due reconnects + the silence watchdog (brief §1.4). */
  _supervise(now) {
    if (this._reconnectAt && now >= this._reconnectAt) {
      this._reconnectAt = 0;
      this._open();
    }
    if (this.connected && this._ws && now - this._lastRxAt > SILENCE_WATCHDOG_MS) {
      try { this._ws.close(); } catch { /* onclose handles the rest */ }
    }
  }

  /** @param {string} data raw frame (may batch lines) @param {WebSocket} ws the frame's own socket */
  _rx(data, ws) {
    if (ws !== this._ws) return; // stale socket from before a reconnect — ignore
    this._lastRxAt = clock.now();
    for (const line of data.split('\r\n')) {
      if (!line) continue;
      if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }
      const msg = parseLine(line);
      if (msg.command === 'PRIVMSG') this._emitChat(msg);
      else if (msg.command === 'RECONNECT') { try { ws.close(); } catch { /* backoff takes over */ } }
    }
  }

  _emitChat(p) {
    bus.emit('chat:message', {
      id: p.tags.id || 'tw' + hashString(p.login + p.text + clock.now()).toString(36),
      user: {
        login: p.login,
        displayName: p.tags['display-name'] || p.login,
        color: p.tags.color || null, // renderer derives fallback (contracts.js)
        badges: p.tags.badges || '',
      },
      text: p.text,
      emotes: parseEmotes(p.tags.emotes || ''),
      ts: clock.now(),
      source: 'twitch',
      isGhost: false,
    });
  }
}
