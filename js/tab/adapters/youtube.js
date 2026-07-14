/**
 * tab/adapters/youtube.js — honest stub. (NIGHTSHIFT, B4)
 *
 * WHAT: The full ChatAdapter surface for YouTube with zero wire behind it.
 *       connect() confesses once, in voice, via chat:system kind 'stub';
 *       it never fakes a message, a status, or a connection.
 * WHY:  Proves the adapter seam (arch §4) so a real YouTubeAdapter later
 *       is a drop-in, and keeps the Honesty Law intact meanwhile.
 * HOW:  connected stays false forever; connect()/disconnect() idempotent.
 * GOTCHA: strings.js currently ships NO stub line bank. The confession
 *       looks up 'stubs.youtube' and stays silent if absent (zero-
 *       hardcoded-copy law beats the confession). Flagged in the build
 *       report: add STRINGS.normal.stubs.{kick,youtube}.
 */
import { bus } from '../../core/bus.js';
import { clock } from '../../core/clock.js';
import { t } from '../../data/strings.js';

/** @implements {import('../../core/contracts.js').ChatAdapter} */
export class YouTubeAdapter {
  constructor() {
    this.name = 'youtube';
    this.connected = false;
    this._confessed = false;
  }

  /** Emits the one in-voice "not wired yet" line (if the string exists), nothing else. */
  connect() {
    if (this._confessed) return;
    this._confessed = true;
    const text = t('stubs.youtube');
    if (typeof text === 'string') {
      bus.emit('chat:system', { text, ts: clock.now(), kind: 'stub' });
    }
  }

  /** Nothing to tear down — there was never a wire. */
  disconnect() {}
}
