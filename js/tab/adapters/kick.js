/**
 * tab/adapters/kick.js — honest stub. (NIGHTSHIFT, B4)
 *
 * WHAT: The full ChatAdapter surface for Kick with zero wire behind it.
 *       connect() confesses once, in voice, via chat:system kind 'stub';
 *       it never fakes a message, a status, or a connection.
 * WHY:  Proves the adapter seam (arch §4) so a real KickAdapter later is a
 *       drop-in, and keeps the Honesty Law intact meanwhile.
 * HOW:  connected stays false forever; connect()/disconnect() idempotent.
 * NOTE: The confession looks up 'stubs.kick' and stays silent if the key is
 *       ever absent (zero-hardcoded-copy law beats the confession) — but
 *       strings.js ships STRINGS.normal.stubs.kick today, so it renders.
 */
import { bus } from '../../core/bus.js';
import { clock } from '../../core/clock.js';
import { t } from '../../data/strings.js';

/** @implements {import('../../core/contracts.js').ChatAdapter} */
export class KickAdapter {
  constructor() {
    this.name = 'kick';
    this.connected = false;
    this._confessed = false;
  }

  /** Emits the one in-voice "not wired yet" line (if the string exists), nothing else. */
  connect() {
    if (this._confessed) return;
    this._confessed = true;
    const text = t('stubs.kick');
    if (typeof text === 'string') {
      bus.emit('chat:system', { text, ts: clock.now(), kind: 'stub' });
    }
  }

  /** Nothing to tear down — there was never a wire. */
  disconnect() {}
}
