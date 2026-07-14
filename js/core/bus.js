/**
 * core/bus.js — the event bus. (OPERATION NIGHTSHIFT)
 *
 * WHAT: Tiny synchronous pub/sub. The ONLY way zones talk to each other.
 * WHY:  Eight builders, zero shared-file edits — modules coordinate through
 *       events with contract-typed payloads (core/contracts.js), so any
 *       zone can be absent/broken and the rest of the bar stays open.
 * HOW:  bus.on('chat:message', fn) / bus.emit('chat:message', payload).
 *       Handlers run synchronously in subscription order. Handler errors
 *       are caught + logged, never propagated (one dead lamp ≠ closed bar).
 *       '*' wildcard receives (type, payload) — debug.js event log ONLY;
 *       production logic on '*' is a P4 finding.
 * GOTCHA: Synchronous means no re-entrancy games: emitting from inside a
 *       handler is allowed but keep chains shallow (emit → emit → emit is
 *       a smell). Events emitted with no listeners are silently fine.
 *       READ-ONLY to all builders.
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

export const bus = Object.freeze({
  /**
   * Subscribe. Returns an unsubscribe function (prefer it over off()).
   * @param {string} type  event name from the canonical catalog, or '*'
   * @param {(payload: any, type?: string) => void} fn
   * @returns {() => void} unsubscribe
   */
  on(type, fn) {
    let set = listeners.get(type);
    if (!set) { set = new Set(); listeners.set(type, set); }
    set.add(fn);
    return () => { set.delete(fn); };
  },

  /**
   * Subscribe for exactly one delivery.
   * @param {string} type
   * @param {(payload: any) => void} fn
   * @returns {() => void} unsubscribe (in case it never fires)
   */
  once(type, fn) {
    const off = this.on(type, (payload) => { off(); fn(payload); });
    return off;
  },

  /**
   * Unsubscribe a specific handler.
   * @param {string} type
   * @param {Function} fn
   */
  off(type, fn) {
    const set = listeners.get(type);
    if (set) set.delete(fn);
  },

  /**
   * Emit synchronously. Wildcard '*' handlers fire after typed handlers.
   * @param {string} type
   * @param {any} [payload]
   */
  emit(type, payload) {
    const typed = listeners.get(type);
    if (typed) {
      for (const fn of [...typed]) { // copy: handlers may unsubscribe mid-emit
        try { fn(payload, type); }
        catch (err) { console.error(`[bus] handler for "${type}" threw:`, err); }
      }
    }
    const wild = listeners.get('*');
    if (wild) {
      for (const fn of [...wild]) {
        try { fn(payload, type); }
        catch (err) { console.error('[bus] wildcard handler threw:', err); }
      }
    }
  },
});
