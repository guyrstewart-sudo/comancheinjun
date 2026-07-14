/**
 * core/contracts.js — the typedef law book. (OPERATION NIGHTSHIFT)
 *
 * WHAT: Every cross-module shape — bus event payloads, adapter interface,
 *       tab state, ranks, storage backend, debug API — as JSDoc typedefs.
 * WHY:  No tsc on this machine (recon §2). JSDoc typedefs give builders
 *       TypeScript-grade contracts that editors check via `// @ts-check`
 *       without a build step. This file is the single source of truth:
 *       if a shape isn't here, it is private and may not cross a module
 *       boundary (architecture doc §1, §3).
 * HOW:  Import for editor tooling only: `import './core/contracts.js'` or
 *       reference types via `@typedef {import('./core/contracts.js').X}`.
 *       The file exports one frozen marker object; it carries no logic.
 * GOTCHA: READ-ONLY to all builders. New events/types require an
 *       architecture-doc amendment FIRST (event catalog §3), then a change
 *       here by the orchestrator — never by a builder mid-build.
 */

/* ========================================================================
 * SURFACE STATE (architecture §2)
 * ===================================================================== */

/**
 * The only three surface states. AFTERHOURS is a viewer-local 00:00–06:00
 * mutation that becomes the surface ONLY when nothing is live; when live
 * during 00–06, surface is 'LIVE' and `afterhoursActive` is true.
 * @typedef {'LIVE'|'OFFLINE'|'AFTERHOURS'} SurfaceState
 */

/**
 * Payload of `state:change` (emitted by state.js ONLY).
 * @typedef {Object} StateChange
 * @property {SurfaceState} surface           current derived surface state
 * @property {SurfaceState|null} prev         previous surface (null on boot)
 * @property {'LIVE'|'OFFLINE'} broadcast     raw broadcast axis (live-detector)
 * @property {boolean} afterhoursActive       the 00–06 mutation flag — key ALL
 *                                            afterhours visuals/×2 off this,
 *                                            never off the clock directly
 * @property {'boot'|'clock'|'live-detector'|'debug'} source what changed it
 */

/**
 * Payload of `live:online` / `live:offline` (live-detector → state.js only).
 * @typedef {Object} LiveSignal
 * @property {'twitch-player'|'debug'} source
 */

/* ========================================================================
 * CHAT (architecture §4)
 * ===================================================================== */

/**
 * One chat emote span. Indices are UTF-16 code units into `text`,
 * inclusive both ends (Twitch wire format, brief §1.6).
 * @typedef {Object} EmoteSpan
 * @property {string} id     Twitch emote id (CDN: static-cdn.jtvnw.net/emoticons/v2/<id>/default/dark/1.0)
 * @property {number} start
 * @property {number} end
 */

/**
 * Payload of `chat:message`.
 * @typedef {Object} ChatMessage
 * @property {string} id            unique message id (wire id or rng-derived)
 * @property {Object} user
 * @property {string} user.login    lowercase login / stable key
 * @property {string} user.displayName
 * @property {string|null} user.color  '#rrggbb' or null → renderer derives via rng.hashString(login)
 * @property {string} user.badges   raw badges CSV ('' if none)
 * @property {string} text          raw message text
 * @property {EmoteSpan[]} emotes
 * @property {number} ts            clock.now() at receipt/replay
 * @property {'twitch'|'ghost'|'debug'} source
 * @property {boolean} isGhost      true for Ghost Tape replay — dock renders
 *                                  ghost styling; HONESTY law: never false
 *                                  for replayed content
 */

/**
 * Payload of `chat:system` — slate lines, connect notices, stub confessions.
 * @typedef {Object} ChatSystem
 * @property {string} text
 * @property {number} ts
 * @property {'connect'|'disconnect'|'slate'|'notice'|'stub'} kind
 */

/**
 * Payload of `chat:status`.
 * @typedef {Object} ChatStatus
 * @property {boolean} connected
 * @property {'twitch'|'demo'|'kick'|'youtube'} adapter
 */

/**
 * ChatAdapter — the seam that makes platforms interchangeable.
 * Adapters publish `chat:message` / `chat:system` / `chat:status` to the
 * bus and NOTHING else (never state events). No callback API.
 * connect()/disconnect() are idempotent.
 * @typedef {Object} ChatAdapter
 * @property {'twitch'|'demo'|'kick'|'youtube'} name
 * @property {boolean} connected   readonly
 * @property {() => void} connect
 * @property {() => void} disconnect
 */

/* ========================================================================
 * DROPS + TAPE (architecture §3, §7.2)
 * ===================================================================== */

/**
 * Payload of `drop:photo` — a flash fired somewhere in the night.
 * @typedef {Object} DropPhoto
 * @property {string} id          stable drop id (seeds captions, prints)
 * @property {number} tapeTime    tape-seconds since 23:00 (0..18000)
 * @property {number} ts          clock.now() when the event fired
 * @property {string} caption     blotter line (from strings.js banks)
 * @property {string} seed        rng seed key for the print's generative art
 * @property {boolean} isGhost    replayed from the tape vs. genuinely live
 */

/**
 * Payload of `tape:seek` (hero jog gesture or debug seek()).
 * @typedef {Object} TapeSeek
 * @property {number} tapeTime    destination, tape-seconds (0..18000)
 * @property {1|-1} direction     -1 = rewind (pins UN-flash; grain never reverses)
 */

/**
 * Payload of `tape:progress` — emitted by hero when tapeTime crosses a
 * whole tape-minute (NOT every frame; the bus is not a frame loop).
 * @typedef {Object} TapeProgress
 * @property {number} tapeTime
 */

/**
 * Public read API of ghost/tape.js (the ONE sanctioned cross-builder
 * import besides fx — hero needs the full drop list to render pins on
 * scrub without waiting for events).
 * @typedef {Object} TapeAPI
 * @property {() => DropPhoto[]} getDrops   full scripted drop list, tapeTime-sorted
 * @property {() => number} getDurationS    tape length in tape-seconds (18000)
 */

/* ========================================================================
 * TAB / WATTS (architecture §5 — THE NUMBERS live in the arch doc)
 * ===================================================================== */

/**
 * One rank rung. NIGHT MAYOR is positional (threshold = floor 30000 AND
 * strictly-highest total), everything else is a plain threshold.
 * @typedef {Object} RankDef
 * @property {string} name        e.g. 'FIXTURE'
 * @property {number} index       0-based ladder position (0 = MOTH)
 * @property {number} threshold   total WATTS to hold the rank
 * @property {boolean} positional true only for NIGHT MAYOR
 */

/**
 * Payload of `tab:earn` — one receipt line item.
 * @typedef {Object} TabEarn
 * @property {number} delta       WATTS credited (post-multiplier, integer)
 * @property {number} base        pre-multiplier points
 * @property {'presence'|'message'|'streak'|'emoteCombo'|'dropWitness'|'firstBlood'|'lastCall'} reason
 * @property {string} multiplier  '' | 'WITCHING HOUR ×2' | 'AFTERHOURS ×2' | 'LAST CALL ×3'
 *                                (MAX rule — never stacked, architecture §5.2)
 * @property {number} total       new running total
 * @property {string} lineItem    preformatted receipt text (from strings.js labels)
 */

/**
 * Payload of `tab:rankup`.
 * @typedef {Object} TabRankup
 * @property {RankDef} rank
 * @property {RankDef} prevRank
 * @property {number} total
 */

/**
 * Payload of `tab:mayor` — the seat changed hands.
 * @typedef {Object} TabMayor
 * @property {{id: string, name: string, total: number}} newMayor
 * @property {{id: string, name: string, total: number}|null} oldMayor  null = first coronation
 */

/**
 * Persisted engine state (storage namespace 'tab').
 * @typedef {Object} TabState
 * @property {number} total          lifetime WATTS for the local visitor
 * @property {number} rankIndex      current ladder index
 * @property {string} nightKey       clock.nightKey() of last activity
 * @property {number} streak         consecutive nights (cap 5 for bonus math)
 * @property {number[]} lastMsgTimes rolling 60s anti-spam window (clock ms)
 * @property {boolean} firstBloodClaimed  for the current nightKey
 * @property {{id:string,name:string,total:number}|null} mayor  current seat
 */

/* ========================================================================
 * CLOCK + FX (architecture §7.2, §3)
 * ===================================================================== */

/**
 * Payload of `clock:minute` (core clock ONLY; also fired synchronously
 * during forceTick at each simulated minute crossing).
 * @typedef {Object} ClockMinute
 * @property {string} hhmm          viewer-local 'HHMM'
 * @property {boolean} isAfterhours 00:00–06:00
 * @property {boolean} isWitchingHour 00:00–03:00
 * @property {string} nightKey      −6h-shifted date key
 */

/**
 * Payload of `fx:flash` — a FLASH POP fired (mirror echoes it +400ms later).
 * @typedef {Object} FxFlash
 * @property {number} intensity   0..1 overlay alpha peak
 * @property {boolean} doubleFire true on every 7th pop (rhythm break law)
 * @property {number} ts          clock.now()
 */

/* ========================================================================
 * STORAGE (architecture §6)
 * ===================================================================== */

/**
 * StorageBackend — async-shaped so SupabaseBackend bolts on with zero
 * engine rework. v1 ships LocalStorageBackend (core/storage.js).
 * @typedef {Object} StorageBackend
 * @property {(ns: string, key: string) => Promise<any|null>} get
 * @property {(ns: string, key: string, value: any) => Promise<void>} set
 * @property {(ns: string, key: string, partial: Object) => Promise<any>} merge shallow-merge, resolves merged value
 * @property {(ns: string, key: string) => Promise<void>} remove
 * @property {(ns: string) => Promise<string[]>} keys
 */

/* ========================================================================
 * DEBUG (architecture §7.1 — verification browser is rAF-dead)
 * ===================================================================== */

/**
 * window.__NIGHT_DEBUG__ — assembled by debug.js from slices each module
 * registers via registerDebug(). Frozen at boot.
 * @typedef {Object} DebugAPI
 * @property {(ms: number) => void} forceTick     advance ALL time deterministically (synchronous)
 * @property {(s: SurfaceState|null) => void} setState  manual override / null = automatic
 * @property {(hhmm: string|null) => void} setClock     force viewer-local time-of-day
 * @property {(script: Array<{user:string,text:string,emotes?:EmoteSpan[],delayMs?:number}>|string) => void} seedChat
 * @property {() => TabState} getTab
 * @property {() => {name:string,index:number,threshold:number,next:number|null,progress:number}} getRank
 * @property {() => {surface:SurfaceState,broadcast:string,afterhoursActive:boolean,override:SurfaceState|null}} getState
 * @property {() => {now:number,hhmm:string,isAfterhours:boolean,isWitchingHour:boolean,nightKey:string,deterministic:boolean}} getClock
 * @property {(tapeTime: number) => void} seek
 * @property {() => Array<{id:string,tapeTime:number,x:number,y:number,flashed:boolean}>} listPins
 * @property {(n?: number) => Array<{type:string,payload:any}>} getEvents  last n bus events
 * @property {() => Object} snapshot   state+clock+tab+pins+chat in one call
 * @property {() => void} resumeClock  leave deterministic mode
 */

/**
 * Marker export so `import './contracts.js'` is legal and tree-obvious.
 * Carries the catalog for debug tooling; no runtime logic.
 */
export const CONTRACTS = Object.freeze({
  version: 1,
  events: Object.freeze([
    'chat:message', 'chat:system', 'chat:status',
    'drop:photo',
    'tab:earn', 'tab:rankup', 'tab:mayor',
    'state:change', 'live:online', 'live:offline',
    'tape:seek', 'tape:progress',
    'clock:minute',
    'fx:flash',
  ]),
});
