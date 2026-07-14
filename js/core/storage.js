/**
 * core/storage.js — StorageBackend interface + LocalStorageBackend v1.
 * (OPERATION NIGHTSHIFT)
 *
 * WHAT: Namespaced async-shaped persistence: get/set/merge/remove/keys.
 * WHY:  The WATTS engine and Wall must not care WHERE state lives. v1 is
 *       LocalStorage (per-browser tallies); a SupabaseBackend later makes
 *       them communal with ZERO engine rework — the swap point is one
 *       line at the bottom of this file.
 * HOW:  import { storage } from './core/storage.js';
 *       await storage.get('tab', 'state'); await storage.merge('tab','state',{total:900});
 *       Keys on disk: `night.v1.<ns>.<key>`. Values are JSON envelopes
 *       {v: schemaVersion, t: clock.now(), d: data}.
 * GOTCHA: Everything returns Promises even though v1 is synchronous —
 *       callers MUST await (engine code written today survives a network
 *       backend tomorrow). Migration stance: v < CURRENT runs MIGRATIONS
 *       chain (empty in v1, hook exists); corrupt/unknown → discard and
 *       start fresh. WATTS are jokes, not currency — loss is survivable,
 *       silent corruption is not. READ-ONLY to all builders.
 */

import { clock } from './clock.js';

const PREFIX = 'night';
const CURRENT_VERSION = 1;

/**
 * Physical-key generation. Stays fixed across schema bumps — the
 * envelope's `v` field (CURRENT_VERSION) is what drives the MIGRATIONS[]
 * chain (§6); the disk key must NOT move when `v` moves, or a version
 * bump would orphan every previously-written key and "migration" would
 * just be silent data loss.
 */
const KEY_GENERATION = 1;

/**
 * Ordered migration chain. MIGRATIONS[n] upgrades an envelope from
 * version n to n+1 and returns the new data payload.
 * @type {Array<(data: any) => any>}
 */
const MIGRATIONS = [];

/** @param {string} ns @param {string} key @returns {string} */
function diskKey(ns, key) { return `${PREFIX}.v${KEY_GENERATION}.${ns}.${key}`; }

/**
 * LocalStorageBackend — v1, ships today.
 * Implements the StorageBackend typedef (core/contracts.js).
 */
export class LocalStorageBackend {
  /**
   * @param {string} ns @param {string} key
   * @returns {Promise<any|null>} stored data or null (missing/corrupt)
   */
  async get(ns, key) {
    let raw;
    try { raw = localStorage.getItem(diskKey(ns, key)); }
    catch { return null; } // storage blocked (private mode) → ephemeral site
    if (raw === null) return null;
    try {
      const env = JSON.parse(raw);
      if (!env || typeof env.v !== 'number') return null;
      if (env.v === CURRENT_VERSION) return env.d;
      if (env.v < CURRENT_VERSION) {
        let d = env.d;
        for (let v = env.v; v < CURRENT_VERSION; v++) {
          const step = MIGRATIONS[v];
          if (!step) return null;      // no path forward → start fresh
          d = step(d);
        }
        await this.set(ns, key, d);    // persist upgraded shape
        return d;
      }
      return null;                      // future version → treat as unknown
    } catch {
      return null;                      // corrupt JSON → start fresh
    }
  }

  /** @param {string} ns @param {string} key @param {any} value */
  async set(ns, key, value) {
    const env = { v: CURRENT_VERSION, t: clock.now(), d: value };
    try { localStorage.setItem(diskKey(ns, key), JSON.stringify(env)); }
    catch { /* quota/blocked: the night goes on, unremembered */ }
  }

  /**
   * Shallow merge into the stored object (creates it if absent).
   * @param {string} ns @param {string} key @param {Object} partial
   * @returns {Promise<any>} the merged value
   */
  async merge(ns, key, partial) {
    const cur = (await this.get(ns, key)) || {};
    const next = { ...cur, ...partial };
    await this.set(ns, key, next);
    return next;
  }

  /** @param {string} ns @param {string} key */
  async remove(ns, key) {
    try { localStorage.removeItem(diskKey(ns, key)); } catch { /* fine */ }
  }

  /**
   * List bare key names within a namespace.
   * @param {string} ns
   * @returns {Promise<string[]>}
   */
  async keys(ns) {
    const out = [];
    const prefix = `${PREFIX}.v${KEY_GENERATION}.${ns}.`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length));
      }
    } catch { /* blocked → empty */ }
    return out;
  }
}

/**
 * Thin wrapper so call sites never hold a backend class directly.
 * (Also the seam for later cross-tab sync or write batching.)
 * @param {import('./contracts.js').StorageBackend} backend
 */
function createStorage(backend) {
  return Object.freeze({
    get: (ns, key) => backend.get(ns, key),
    set: (ns, key, value) => backend.set(ns, key, value),
    merge: (ns, key, partial) => backend.merge(ns, key, partial),
    remove: (ns, key) => backend.remove(ns, key),
    keys: (ns) => backend.keys(ns),
  });
}

/* ======================================================================
 * THE ONE-LINE SWAP POINT (architecture §6).
 * SUPABASE LATER:
 *   export const storage = createStorage(new SupabaseBackend(CONFIG.SUPABASE));
 * Nothing else in the site changes.
 * ==================================================================== */
export const storage = createStorage(new LocalStorageBackend());
