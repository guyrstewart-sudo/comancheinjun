/**
 * config.js — THE one-constant file. (OPERATION NIGHTSHIFT)
 *
 * WHAT: Every deploy-time knob for the site lives here and ONLY here.
 * WHY:  Going live must be a paste, not a refactor. Empty TWITCH_HANDLE
 *       means demo mode: Ghost Tape runs, zero external requests are made,
 *       the TwitchAdapter and live-detector are never even imported.
 * HOW:  Paste the channel login (lowercase) into TWITCH_HANDLE and add the
 *       production hostname to EMBED_PARENTS. That is the entire go-live.
 * GOTCHA: File must stay UTF-8 — the artist name carries diacritics that
 *       are load-bearing brand ("Cőmånčhé INjüń"). Do not "fix" them.
 *       This file is READ-ONLY to all builders (architecture doc §1).
 */

export const CONFIG = Object.freeze({
  /**
   * Twitch channel login, lowercase, no '#'. '' (empty) = demo mode.
   * Setting this activates: tab/live-detector.js (Twitch.Player script,
   * lazy) + tab/adapters/twitch.js (anonymous IRC WebSocket, lazy).
   */
  TWITCH_HANDLE: '',

  /** Artist display name — render verbatim, UTF-8 end to end. */
  ARTIST_NAME: 'Cőmånčhé INjüń', // "Cőmånčhé INjüń"

  /** The city. Named streets are charisma; the city is home. */
  CITY: 'Asheville, NC',

  /** Social doors (footer). */
  SOCIAL: Object.freeze({
    instagram: 'https://www.instagram.com/comancheinjun/',
    facebook: 'https://www.facebook.com/rudyaguil',
  }),

  /**
   * Tip jar — the footer "buy the man a coffee/beer · $5" link. Points at a
   * payment page COMANCHE controls (his own account — never created here).
   * '' (empty) = the button is hidden entirely, so nothing broken ever ships.
   * Paste the full destination once, e.g.:
   *   Cash App:  'https://cash.app/$cashtag/5.00'   (pre-fills $5)
   *   PayPal:    'https://paypal.me/handle/5'         (pre-fills $5)
   *   Venmo:     'https://venmo.com/u/handle'         (amount typed in-app)
   *   BuyMeCoffee:'https://buymeacoffee.com/handle'   (needs his signup first)
   */
  TIP: Object.freeze({
    url: 'https://cash.app/$RudeCashus/5.00', // Rudy Aguilar's Cash App — opens with $5.00 pre-filled
  }),

  /**
   * Twitch embed `parent` list (hostname-only, no scheme/port/path).
   * localhost + 127.0.0.1 are for dev (forum-confirmed, brief §2.3).
   * ADD THE PRODUCTION HOSTNAME HERE ON GO-LIVE, e.g. 'guyrstewart-sudo.github.io'.
   */
  EMBED_PARENTS: Object.freeze(['localhost', '127.0.0.1']),

  /** Hero tape: tape-seconds per real second (18000 tape-s night in ~45s). */
  TAPE_RATE: 400,
});
