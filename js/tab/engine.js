/**
 * tab/engine.js — the WATTS engine. Pure earning logic, no DOM. (NIGHTSHIFT, B4)
 *
 * WHAT: Turns bus traffic (chat:message, drop:photo, state:change,
 *       clock:minute, tape:progress/seek) plus clock ticks into WATTS:
 *       emits tab:earn line items, tab:rankup, tab:mayor. THE NUMBERS are
 *       architecture §5.1–§5.6 verbatim — changing one is an amendment.
 * WHY:  The tab is the heart. Every zone reads its output; none of them
 *       need to know whether a message came from Twitch, the tape, or debug.
 * HOW:  initTabEngine() hydrates TabState from storage ns 'tab', then
 *       subscribes. All earning funnels through award(): night/streak roll →
 *       multiplier (MAX, never stacked: LAST CALL ×3 > WITCHING ×2 =
 *       AFTERHOURS ×2, label tie-break prints WITCHING HOUR) → persist →
 *       emit → rank/mayor checks. LAST CALL is honest (§5.6): live streams
 *       get one ×3 back-credit line on the LIVE→not-LIVE transition from a
 *       rolling 10-minute buffer; the ghost tape applies ×3 in real time
 *       only while tapeTime sits in [17400, 18000) — the tape knows its own
 *       end, the hold at 18000 is not last call.
 *       EMOTE COMBO WINDOW (defined here, once): a chain for emote id E =
 *       consecutive COUNTED messages each containing E, with no gap >30s;
 *       a counted message WITHOUT E breaks E's chain; at length 3 every
 *       distinct contributor is paid +15 once and E disarms; E re-arms only
 *       after 60s of silence on E.
 * GOTCHA: tab:earn.reason uses ruling R5's canonical ids (presence,
 *       firstBlood, dropWitness, streak, emoteCombo, lastCall) PLUS
 *       'message' — messages are too frequent to print, so strings.js has
 *       no hud.earn.message label on purpose and the receipt treats them
 *       as silent count-up ticks (lineItem is '' for them).
 */
import { bus } from '../core/bus.js';
import { clock } from '../core/clock.js';
import { storage } from '../core/storage.js';
import { makeRng } from '../core/rng.js';
import { t } from '../data/strings.js';
import { ladder, rankIndexFor, rankInfo, evaluateMayor } from './ranks.js';

/* THE NUMBERS — architecture §5.1/§5.2, canonical. */
const PRESENCE_TICK_MS = 300000, PRESENCE_PTS = 5;
const MSG_PTS = 8, MSG_WINDOW_MS = 60000, MSG_MAX_PER_WINDOW = 6, DUP_TEXT_MS = 300000;
const STREAK_PTS = 40, STREAK_CAP = 5;
const COMBO_PTS = 15, COMBO_GAP_MS = 30000, COMBO_REARM_MS = 60000, COMBO_LEN = 3;
const DROP_WITNESS_PTS = 40, FIRST_BLOOD_PTS = 60;
const LAST_CALL_BUFFER_MS = 600000;                       // rolling live buffer (§5.6)
const TAPE_END_S = 18000, TAPE_LAST_CALL_S = TAPE_END_S - 600; // ghost window (§7.2 tape length)

/*
 * FLAGGED: strings.js ships no afterhours multiplier label (hud.earn has
 * witchingHour/lastCall but no afterhours key). This literal is the exact
 * token core/contracts.js enumerates for TabEarn.multiplier — swap to a
 * strings lookup the moment the voice writer adds one.
 */
const AFTERHOURS_LABEL = 'AFTERHOURS ×2';

/** Persisted engine state (TabState + private extensions streakNight/comboState/lastCallBuffer). */
const state = {
  total: 0, rankIndex: 0, nightKey: '', streak: 0,
  lastMsgTimes: [], firstBloodClaimed: false, mayor: null,
  streakNight: '', comboState: {}, lastCallBuffer: [],
};
/** Local visitor identity (ns 'identity'). No auth — dive bar rules (§5.4). */
let identity = { id: '', name: '' };
/** senderKey → {times:number[], lastText:string, lastTextTs:number} (anti-spam, per sender). */
const perUser = new Map();
/** 'twitch:<login>' → {total:number, name:string}. In-memory shadow tallies for the Wall. */
const shadows = new Map();

let surface = 'OFFLINE', afterhoursActive = false, witching = false;
let tapeTimeS = 0, presenceAccMs = 0, pageVisible = true, inited = false;

/** Active string-table mode — receipt shares this. @returns {'normal'|'afterhours'} */
export function stringsMode() { return afterhoursActive ? 'afterhours' : 'normal'; }

/** Compose a multiplier label from the string table, e.g. 'WITCHING HOUR ×2'. */
function multLabel(id) { return t('hud.earn.' + id, stringsMode()) + ' ' + t('hud.margins.' + id, stringsMode()); }

/**
 * The single active multiplier — MAX, never stacked (§5.2).
 * Ghost LAST CALL is real-time only inside the tape's final 10 minutes.
 */
function multiplier() {
  if (surface !== 'LIVE' && tapeTimeS >= TAPE_LAST_CALL_S && tapeTimeS < TAPE_END_S) {
    return { f: 3, label: multLabel('lastCall') };
  }
  if (witching) return { f: 2, label: multLabel('witchingHour') };
  if (afterhoursActive) return { f: 2, label: AFTERHOURS_LABEL };
  return { f: 1, label: '' };
}

/** Whole-day difference between two 'YYYY-MM-DD' night keys (no wall-clock read). */
function dayDiff(a, b) {
  const ms = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((ms(b) - ms(a)) / 86400000);
}

/** Roll the night forward if nightKey changed: streak counter + FIRST BLOOD reset. */
function rollNight() {
  const nk = clock.nightKey();
  if (nk === state.nightKey) return;
  const consecutive = state.nightKey !== '' && dayDiff(state.nightKey, nk) === 1;
  state.streak = consecutive ? state.streak + 1 : 1;
  state.nightKey = nk;
  state.firstBloodClaimed = false;
}

/** Pay the streak bonus once per night, on the local visitor's first earning action. */
function payStreakIfDue() {
  if (state.streakNight === state.nightKey) return;
  state.streakNight = state.nightKey;
  award('streak', STREAK_PTS * Math.min(state.streak, STREAK_CAP), { skipNight: true });
}

function pruneBuffer() {
  const cutoff = clock.now() - LAST_CALL_BUFFER_MS;
  state.lastCallBuffer = state.lastCallBuffer.filter((e) => e.t >= cutoff);
}

/** Fire-and-forget persistence (storage is async-shaped; WATTS survive worse). */
function persist() {
  storage.merge('tab', 'state', {
    total: state.total, rankIndex: state.rankIndex, nightKey: state.nightKey,
    streak: state.streak, lastMsgTimes: state.lastMsgTimes,
    firstBloodClaimed: state.firstBloodClaimed, mayor: state.mayor,
    streakNight: state.streakNight, comboState: state.comboState,
    lastCallBuffer: state.lastCallBuffer,
  });
}

/**
 * The one earning funnel for the LOCAL visitor.
 * @param {string} reason  R5 earn id (or 'message')
 * @param {number} base    pre-multiplier points
 * @param {{skipNight?:boolean, ghost?:boolean, rawDelta?:number, forceMult?:{f:number,label:string}}} [o]
 */
function award(reason, base, o = {}) {
  if (!o.skipNight) { rollNight(); payStreakIfDue(); }
  const m = o.forceMult || multiplier();
  const delta = o.rawDelta != null ? o.rawDelta : base * m.f;
  state.total += delta;
  if (surface === 'LIVE' && reason !== 'lastCall') {
    state.lastCallBuffer.push({ t: clock.now(), base, delta });
    pruneBuffer();
  }
  const label = t('hud.earn.' + reason, stringsMode()); // undefined for 'message' — by design
  const ghostTag = o.ghost ? ' · ' + t('osd.ghostBadge', stringsMode()) : '';
  const lineItem = label ? label + ghostTag + ' .... ' + delta : '';
  persist();
  bus.emit('tab:earn', { delta, base, reason, multiplier: m.label, total: state.total, lineItem });
  checkMayorLocal();
  checkRank();
}

function holdsSeat() { return !!(state.mayor && identity.id && state.mayor.id === identity.id); }

function checkRank() {
  const idx = rankIndexFor(state.total, holdsSeat());
  if (idx > state.rankIndex) {
    const defs = ladder();
    const prevRank = defs[state.rankIndex];
    state.rankIndex = idx;
    persist();
    bus.emit('tab:rankup', { rank: defs[idx], prevRank, total: state.total });
  }
}

function checkMayorLocal() {
  if (holdsSeat()) { state.mayor.total = state.total; return; } // reigning; no event
  const seat = evaluateMayor(state.mayor, {
    id: identity.id, name: identity.name || identity.id.slice(0, 8), total: state.total,
  });
  if (!seat) return;
  const oldMayor = state.mayor;
  state.mayor = seat;
  persist();
  bus.emit('tab:mayor', { newMayor: seat, oldMayor: oldMayor || null });
}

/** Shadow entries (twitch chatters) can take the seat too — and dethrone the local. */
function checkMayorShadow(key, s) {
  if (state.mayor && state.mayor.id === key) { state.mayor.total = s.total; return; }
  const seat = evaluateMayor(state.mayor, { id: key, name: s.name, total: s.total });
  if (!seat) return;
  const oldMayor = state.mayor;
  const localDethroned = !!(oldMayor && oldMayor.id === identity.id);
  state.mayor = seat;
  if (localDethroned) state.rankIndex = rankIndexFor(state.total, false); // keeps WATTS, loses neon (R1)
  persist();
  bus.emit('tab:mayor', { newMayor: seat, oldMayor: oldMayor || null });
}

/** Credit a shadow entry (already multiplied). Session memory only — flagged for a Wall contract. */
function creditShadow(key, pts, name) {
  const s = shadows.get(key) || { total: 0, name: name || key.slice(7) };
  s.total += pts;
  if (name) s.name = name;
  shadows.set(key, s);
  checkMayorShadow(key, s);
}

/**
 * chat:message → counted-message earning. Credit routing (§5.4): source
 * 'debug' credits the LOCAL visitor (the testing seam — B3's chat dock
 * should emit the local visitor's own lines with source 'debug' too);
 * 'twitch' credits shadow entries; 'ghost' never earns — the cast is lore.
 */
function onChat(msg) {
  const creditKey = msg.source === 'debug' ? 'local'
    : msg.source === 'twitch' ? 'twitch:' + msg.user.login : null;
  if (!creditKey) return;
  const now = clock.now();
  const senderKey = msg.source + ':' + msg.user.login;
  const u = perUser.get(senderKey) || { times: [], lastText: '', lastTextTs: 0 };
  u.times = u.times.filter((ts) => now - ts < MSG_WINDOW_MS);
  const dup = msg.text === u.lastText && now - u.lastTextTs < DUP_TEXT_MS;
  u.lastText = msg.text; u.lastTextTs = now;
  const counted = !dup && u.times.length < MSG_MAX_PER_WINDOW;
  if (counted) u.times.push(now);
  perUser.set(senderKey, u);
  if (!counted) return; // excess earns 0 and is excluded from combos (§5.1)

  rollNight();
  // FIRST BLOOD — one seat per nightKey, ANY surface (orchestrator ruling:
  // empty.chat literally promises it during ghost mode — the copy is the
  // contract; points are jokes that love you). Ghost cast can't claim it:
  // source 'ghost' never reaches here (lore never earns, §5.4).
  if (!state.firstBloodClaimed) {
    state.firstBloodClaimed = true;
    if (creditKey === 'local') award('firstBlood', FIRST_BLOOD_PTS);
    else creditShadow(creditKey, FIRST_BLOOD_PTS * multiplier().f, msg.user.displayName);
  }
  if (creditKey === 'local') {
    state.lastMsgTimes = [...u.times];
    award('message', MSG_PTS);
  } else {
    creditShadow(creditKey, MSG_PTS * multiplier().f, msg.user.displayName);
  }
  trackCombos(msg, creditKey, now);
}

/** Emote-combo chains — window defined in the file docstring. */
function trackCombos(msg, creditKey, now) {
  const ids = [...new Set((msg.emotes || []).map((e) => e.id))];
  const cs = state.comboState;
  for (const id of Object.keys(cs)) {
    const c = cs[id];
    if (now - c.last > COMBO_REARM_MS * 5) { delete cs[id]; continue; } // stale bookkeeping
    if (!c.armed && now - c.last > COMBO_REARM_MS) { c.armed = true; c.n = 0; c.users = []; }
    if (!ids.includes(id)) { c.n = 0; c.users = []; }   // counted message without E breaks E
  }
  for (const id of ids) {
    const c = cs[id] || (cs[id] = { n: 0, users: [], last: 0, armed: true });
    if (now - c.last > COMBO_GAP_MS) { c.n = 0; c.users = []; }
    c.n += 1; c.last = now;
    if (!c.users.includes(creditKey)) c.users.push(creditKey);
    if (c.armed && c.n >= COMBO_LEN) {
      c.armed = false; // re-arms after 60s quiet on this emote
      for (const uk of c.users) {
        if (uk === 'local') award('emoteCombo', COMBO_PTS);
        else creditShadow(uk, COMBO_PTS * multiplier().f);
      }
    }
  }
}

/** LIVE → not-LIVE: ring the bell after close — one ×3 back-credit line (§5.6). */
function backCreditLastCall() {
  pruneBuffer();
  let base = 0, extra = 0;
  for (const e of state.lastCallBuffer) { base += e.base; extra += e.base * 3 - e.delta; }
  state.lastCallBuffer = [];
  if (extra > 0) {
    award('lastCall', base, { rawDelta: extra, skipNight: true, forceMult: { f: 3, label: multLabel('lastCall') } });
  } else {
    persist();
  }
}

/** Deterministic-enough visitor id — WATTS are jokes, not currency (§5.4). */
function freshIdentity() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const dims = typeof screen !== 'undefined' ? screen.width + 'x' + screen.height : '';
  const r = makeRng('identity:' + ua + ':' + dims + ':' + clock.now());
  return { id: 'v' + Math.floor(r() * 2821109907456).toString(36), name: '' };
}

function wire() {
  if (typeof document !== 'undefined') {
    pageVisible = !document.hidden;
    document.addEventListener('visibilitychange', () => { pageVisible = !document.hidden; });
  }
  // Presence: +5 / 300s accumulator; deterministic clock mode assumes visible (§5.1).
  clock.subscribe((deltaMs) => {
    if (!pageVisible && !clock.debugInfo().deterministic) return;
    presenceAccMs += deltaMs;
    while (presenceAccMs >= PRESENCE_TICK_MS) {
      presenceAccMs -= PRESENCE_TICK_MS;
      award('presence', PRESENCE_PTS);
    }
  });
  bus.on('chat:message', onChat);
  bus.on('drop:photo', (p) => award('dropWitness', DROP_WITNESS_PTS, { ghost: !!p.isGhost }));
  bus.on('state:change', (sc) => {
    const prev = surface;
    surface = sc.surface;
    afterhoursActive = sc.afterhoursActive;
    if (prev === 'LIVE' && sc.surface !== 'LIVE') backCreditLastCall();
  });
  bus.on('clock:minute', (m) => { witching = m.isWitchingHour; });
  bus.on('tape:progress', (p) => { tapeTimeS = p.tapeTime; });
  bus.on('tape:seek', (p) => { tapeTimeS = p.tapeTime; });
  // the visitor named themselves (main.js door / footer) — mirror it into the
  // WATTS identity and persist, so THE WALL shows the chosen name, not the id.
  bus.on('identity:name', ({ name }) => {
    identity.name = (name || '').trim();
    try { storage.set('identity', 'visitor', identity); } catch (_) { /* private mode */ }
  });
}

/**
 * Boot the engine: hydrate persisted state + identity, then subscribe.
 * Idempotent; receipt.js calls it defensively, main.js may too.
 * @returns {Promise<void>}
 */
export async function initTabEngine() {
  if (inited) return;
  inited = true;
  try {
    const [saved, vis, chosenName] = await Promise.all([
      storage.get('tab', 'state'),
      storage.get('identity', 'visitor'),
      storage.get('identity', 'name'), // the visitor's chosen display name (local account)
    ]);
    if (saved && typeof saved.total === 'number') Object.assign(state, saved);
    identity = (vis && vis.id) ? vis : freshIdentity();
    if (chosenName) identity.name = chosenName; // auto-login: their name persists
    storage.set('identity', 'visitor', identity);
  } catch (err) {
    console.error('[tab] hydrate failed, starting fresh:', err);
  }
  wire();
}

/** DebugAPI.getTab() — TabState snapshot + the currently active multiplier. */
export function getTab() {
  return {
    total: state.total, rankIndex: state.rankIndex,
    rank: rankInfo(state.total, holdsSeat()).name,
    nightKey: state.nightKey, streak: state.streak,
    lastMsgTimes: [...state.lastMsgTimes],
    firstBloodClaimed: state.firstBloodClaimed,
    mayor: state.mayor ? { ...state.mayor } : null,
    multiplier: multiplier().label,
  };
}

/** DebugAPI.getRank() — {name, index, threshold, next, progress}. */
export function getRank() {
  return rankInfo(state.total, holdsSeat());
}
