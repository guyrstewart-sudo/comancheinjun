/**
 * OPERATION NIGHTSHIFT — the string table.
 * Every user-visible word on this site lives in this file. No literals in components.
 *
 * WHAT: single source of truth for copy — STRINGS (normal + afterhours), REGULARS
 *       (ghost-tape chat cast), LEGENDS (wall seeds), BLOTTER (EXIF captions).
 * WHY:  the voice is a design token. One file means one register, one review surface,
 *       and the AFTERHOURS mutation (00:00–06:00 viewer-local) is a data swap, not a rewrite.
 * HOW — LOOKUP-WITH-FALLBACK CONVENTION (binding on all consumers):
 *       STRINGS.afterhours contains ONLY the keys that get looser after midnight.
 *       Resolve every LEAF key through `t(path, mode)` below: it checks
 *       STRINGS[mode] first and falls back to STRINGS.normal. Never read an
 *       OBJECT node out of STRINGS.afterhours directly — it is sparse by design
 *       and you will get partial objects. Leaf lookups only.
 *       PLACEHOLDERS: a few strings carry `{handle}` slots — fill them with a plain
 *       `.replace('{handle}', value)`. No template engine, no eval, ever.
 * GOTCHA: canon lines (marked `// CANON`) are verbatim from docs/01-direction.md §9
 *       and are FINAL. Changing one is a P4 finding. The client name "Cőmånčhé INjüń"
 *       carries diacritics — this file is UTF-8 and must stay UTF-8.
 *       No emoji anywhere. The glyphs ▶ ● × · are signage, not emoji, and are canon.
 *
 * Register (constitution §9): lowercase warmth with mono bones. debauched but warm,
 * feral but never cruel. specificity is charisma. never corporate, never twee.
 * Full commandments + inventory: docs/02-voice.md.
 */

/** @typedef {'normal'|'afterhours'} StringMode */

/**
 * @typedef {Object} RankDef
 * @property {string} id      stable engine id, never shown
 * @property {string} name    signage name, rendered as SVG neon at rank-up
 * @property {string} desc    one-line description (canon, constitution §7)
 * @property {string} toast   rank-up toast — mono, lower-left, 4s
 */

/**
 * @typedef {Object} Regular  a ghost-tape chat regular (fictional, demo mode only)
 * @property {string} handle       chat display name
 * @property {number} colorSeed    seed for mulberry32 → name color (Determinism Law)
 * @property {string} persona      one line, who they are
 * @property {string[]} lineBank   8–14 messages in their voice (typos are THEIRS, not the site's)
 * @property {string} arrivalStyle how the DemoAdapter introduces them
 * @property {string} tics         typing quirks the DemoAdapter may lean on
 */

/**
 * @typedef {Object} Legend   a Wall seed entry — lore, never a live user
 * @property {string} handle
 * @property {number} watts        frozen forever; legends don't earn
 * @property {string} rank         rank name at retirement (see STRINGS.normal.ranks)
 * @property {string} sharpieTag   handwritten tag on the polaroid (SHARPIE stack)
 * @property {string} era          when they held the room
 * @property {string} oneLineStory why the wall keeps them
 */

/**
 * @typedef {Object} BlotterEntry  EXIF police-blotter caption for a print in THE TAKE
 * @property {string} time    'HH:MM', 24h, the night runs 23:00 → 04:59
 * @property {string} street  real Asheville only — no invented geography, ever
 * @property {string} lens    'f/2, full flash' style (canon entry keeps 'flash fired')
 * @property {string} line    the finding — deadpan procedure, poetry smuggled in
 * Rendered as: `${time} · ${street} · ${lens} · ${line}` in the BLOTTER mono stack.
 */

export const STRINGS = {
  normal: {
    // ------------------------------------------------------------ meta
    meta: {
      titles: {
        home: 'Cőmånčhé INjüń — asheville after midnight',
        route: 'THE ROUTE · Cőmånčhé INjüń',
        bunker: 'THE BUNKER · Cőmånčhé INjüń',
        take: 'THE TAKE · Cőmånčhé INjüń',
        wall: 'THE WALL · Cőmånčhé INjüń',
        rules: 'THE RULES · Cőmånčhé INjüń',
        notFound: "this block ain't lit · Cőmånčhé INjüń",
      },
      description:
        'Two wheels, no permission. Asheville after midnight, lit one flash at a time. ' +
        'Live rides, photo drops, and the wall of regulars. Get home safe.',
    },

    // ------------------------------------------------------------ nav (5 waypoints, taped top-left)
    nav: {
      ariaLabel: 'site navigation — five waypoints',
      waypoints: [
        { id: 'route', label: 'THE ROUTE' },
        { id: 'bunker', label: 'THE BUNKER' },
        { id: 'take', label: 'THE TAKE' },
        { id: 'wall', label: 'THE WALL' },
        { id: 'rules', label: 'THE RULES' },
      ],
    },

    // ------------------------------------------------------------ zone signage + gutter sublines
    zones: {
      route: { sign: 'THE ROUTE', sub: 'tonight, on a loop. the bike never stops.' },
      bunker: { sign: 'THE BUNKER', sub: "live when the bike's out. honest when it isn't." },
      take: { sign: 'THE TAKE', sub: 'prints on the table. blotter attached.', seeMore: 'ONE MORE ROUND ↓' },
      wall: { sign: 'THE WALL', sub: 'the congregation, by wattage.' },
      rules: { sign: 'THE RULES', sub: 'three rules and a bicycle.' },
    },

    // ------------------------------------------------------------ hero + OSD (DOM, not canvas)
    hero: {
      tagline: 'Two wheels, no permission. Asheville after midnight, lit one flash at a time.', // CANON
    },
    osd: {
      play: 'PLAY ▶', // CANON glyph
      rec: 'REC ●', // CANON glyph — renders ONLY when genuinely live (Honesty Law)
      liveLabel: 'LIVE', // ditto — never decorative
      checking: 'checking if the bike is out...',
      ghostBadge: 'GHOST TAPE',
      slate:
        'GHOST TAPE — NOT LIVE. This is last night riding again, every flash exactly ' +
        "where it fell. The bike's asleep. The city never was.", // CANON
      nightOf: 'NIGHT OF', // prefix for the tape date, e.g. NIGHT OF 07·13
      counterLabel: 'TAPE', // prefix for the running tape counter
      scrubHint: 'drag sideways — the night obeys',
      rewindHint: 'backwards un-happens. the grain never does.',
    },

    // ------------------------------------------------------------ chat (THE RAIL)
    chat: {
      placeholderLive: "say it. the night's listening.",
      placeholderGhost: "talking to last night (it can't hear you, but it gets it)", // CANON
      send: 'SEND',
      ghostLocalNote:
        "you're talking to the tape — your words stay on your side of the glass. " +
        'the tab counts them anyway. presence is presence.',
      // the login strip that rides just above the chat box — a name is a
      // lightweight local account (no password, no twitch), auto-remembered.
      sign: {
        label: 'sign the tab',
        placeholder: 'pick a name',
        go: 'TAKE IT',
        hint: 'or stay a ghost — the tab counts you either way',
        as: 'on the tab as',
        change: 'not you?',
        aria: 'name yourself — a local account, remembered next time',
        addPhoto: '+ add a photo',
        changePhoto: 'change photo',
        photoHint: 'top the wall and your face runs the marquee.',
      },
    },

    // ------------------------------------------------------------ points HUD — the receipt
    hud: {
      receipt: {
        header: ['CŐMÅNČHÉ INJÜŃ', 'THE TAB', 'asheville nc · open til we say'],
        stamp: 'standard rates',
        footer: 'gratuity refused — presence is the tip.',
      },
      // line-item labels — printed like `DROP WITNESS .... 40`
      earn: {
        presence: 'PRESENCE',
        firstBlood: 'FIRST BLOOD',
        dropWitness: 'DROP WITNESS',
        witchingHour: 'WITCHING HOUR',
        lastCall: 'LAST CALL',
        streak: 'STREAK',
        emoteCombo: 'EMOTE COMBO',
        afterhours: 'AFTERHOURS',
      },
      // margin stamps — printed beside the line item like the bartender comped you
      margins: {
        witchingHour: '×2',
        lastCall: '×3',
        afterhours: '×2',
      },
      // suffix for the live-stream LAST CALL line (arch §5.6 — we refuse to fake foreknowledge)
      backCredited: "back-credited — nobody knows it's last call till it is",
      wattsUnit: 'WATTS',
    },

    // ------------------------------------------------------------ ranks (ladder canon, constitution §7)
    ranksIntro: "you don't earn points, you feed the sign. your name burns exactly as bright as the watts behind it.",
    ranks: [
      {
        id: 'moth',
        name: 'MOTH',
        desc: 'you crossed the street toward the glow', // CANON
        toast: 'welcome, moth. the glow noticed.',
      },
      {
        id: 'regular',
        name: 'REGULAR',
        desc: 'the stool already knows your shape', // CANON
        toast: "the bartender didn't ask. the bartender just poured.",
      },
      {
        id: 'fixture',
        name: 'FIXTURE',
        desc: 'you come with the building now', // CANON
        toast: "You come with the building now — when you're gone, the corner looks wrong.", // CANON
      },
      {
        id: 'streetlamp',
        name: 'STREETLAMP',
        desc: 'half of Haywood navigates by you', // CANON
        toast: "people you've never met use you to find their way home. carry that.",
      },
      {
        id: 'lastCallLegend',
        name: 'LAST CALL LEGEND',
        desc: 'the night ends when you say it does', // CANON
        toast: "nobody says last call until you nod. that's the arrangement now.",
      },
      {
        id: 'gutterSaint',
        name: 'GUTTER SAINT',
        desc: 'patron of every puddle on Lexington', // CANON
        toast: 'every puddle on Lexington holds your reflection on retainer.',
      },
      {
        id: 'nightMayor',
        name: 'NIGHT MAYOR',
        desc: 'one holder, dethronable; the only real neon on the Wall', // CANON
        toast: 'the wall wires your name in neon. one holder. govern gently.',
      },
    ],

    // ------------------------------------------------------------ dethroning + dead mayors
    dethrone: {
      oldSignDying: 'the old sign goes dark one letter at a time. nobody claps. everybody watches.',
      newMayor: '{handle} holds the neon now. one holder. govern gently.',
      deadMayorCaption: "dethroned, not demolished. the sign stays up, unlit — that's the arrangement.",
    },

    // ------------------------------------------------------------ the wall
    wall: {
      legendsSlate:
        'LEGENDS OF THE WALL — these eight are lore, not live users. they earned it ' +
        'before the tape ran. the wall remembers them so nobody has to take our word ' +
        'for it. (take our word for it anyway.)',
    },

    // ------------------------------------------------------------ THE RULES page
    rules: {
      plate: 'THE CODE',
      code: [
        'ask the person, never the property.', // CANON
        'everybody gets home.', // CANON
        "the flash is honest or it doesn't fire.", // CANON
      ],
      stack: ['NO CAR.', 'NO TRIPOD.', 'NO PERMISSION.'], // CANON
      bioTitle: 'THE MAN',
      bio:
        "he's a photographer in asheville who works from a bicycle. no car to park, " +
        'no tripod to plant, no permission slip in the bag — a camera, a flash, and ' +
        "legs that know every hill between the bars. he's at the scene before the " +
        'sirens: dive bars, loading docks, house shows, after-hours diners, the whole ' +
        "3am parade of beautiful disasters. the flash is the city's lie detector, and " +
        'it only fires on a yes. he streams the rides live, drops the photos mid-ride, ' +
        'and the chat that gathers is a congregation — night owls, barflies, ' +
        'insomniacs, people whose day starts when yours quits.',
      bicycleAlt: 'a single continuous-line drawing of a bicycle parked under one street lamp',
      closer: "get home safe. that's the whole religion.", // CANON
    },

    // ------------------------------------------------------------ 404
    fourOhFour: {
      headline: "THIS BLOCK AIN'T LIT",
      body:
        "this block ain't lit. Lamp's dead or you're early. Walk back toward the glow. " +
        "It's the orange one. It's always the orange one.", // CANON
      backLink: '← back toward the glow',
    },

    // ------------------------------------------------------------ empty states
    empty: {
      chat: "nobody's said a word yet. FIRST BLOOD is sitting right there — first message of the night gets paid.",
      wall: "no names on the wall yet. plaster's fresh. somebody has to be first across the street, and the glow keeps records.",
      take: "no prints on the table tonight. the camera's still holding them. they come out when the flash says they're ready.",
    },

    // ------------------------------------------------------------ error states (in voice, but USEFUL first)
    errors: {
      chatLost:
        "lost the wire to chat — that's our end, not yours. reconnecting automatically " +
        'every few seconds. your watts are safe; nothing you earned is lost. the tab ' +
        'survives worse than this nightly.',
      embedBlocked:
        "the player couldn't get in — usually an ad-blocker or a strict privacy setting " +
        'playing bouncer (respect). watch directly at twitch.tv/{handle} and keep this ' +
        'window open: chat and the tab keep running right here.',
    },

    // ------------------------------------------------------------ adapter stubs (honest, confessed once)
    stubs: {
      kick: "kick isn't wired to this bar yet — the stool's there, nobody's on it. twitch or the ghost tape for now.",
      youtube: "youtube isn't plumbed in either — one wall, one tap. the adapter's built; the keg isn't tapped.",
    },

    // ------------------------------------------------------------ footer
    footer: {
      instagram: { label: 'instagram — @comancheinjun', url: 'https://www.instagram.com/comancheinjun/' },
      facebook: { label: 'facebook', url: 'https://www.facebook.com/rudyaguil' },
      ridingGhost: 'riding as a ghost tonight.',   // no name chosen
      ridingAs: 'riding as {name}.',               // {name} filled in
      changeName: 'name yourself',
      changeAgain: 'not you?',
      integrity: 'points are jokes, not currency. no purchases, no scarcity, no tricks — just watts and warmth.',
      signoff: 'get home safe.',
    },

    // ------------------------------------------------------------ accessibility (inform FIRST, charm second)
    aria: {
      skipToContent: 'skip to main content',
      heroCanvas:
        "animated map of downtown Asheville drawing tonight's bike route. decorative — " +
        'every photo drop is also listed as text below the map.',
      heroScrub:
        'ride timeline. drag left or right, or use the arrow keys, to move through the night from 11pm to 4am.',
      gutterMirror:
        'decorative reflection of the map above. press and hold to preview the latest photo drop.',
      liveStatus: 'stream status',
      chatLog: 'chat messages',
      chatInput: 'chat message input',
      hudReceipt: 'your points receipt — watts earned this session',
      wallList: 'the wall — regulars ranked by watts, highest first',
      print: 'photo print. open to view it full size.',
      developScrub: 'brightness — up/down arrows or drag sideways; the photo starts fully lit. click anywhere off the photo, or press escape, to close.',
      closeLightbox: 'close the print viewer',
      reducedMotion:
        'reduced motion is on: no flashes, no flicker, nothing shakes. everything still ' +
        'happens — it just happens gently. same night, steadier hands.',
    },
  },

  // ============================================================== AFTERHOURS
  // The loose set. 00:00–06:00 viewer-local, one drink looser — never sloppier.
  // SPARSE ON PURPOSE: only keys that change live here. Everything else falls
  // back to `normal` via t(). Canon lines are never loosened.
  afterhours: {
    zones: {
      route: { sub: 'still riding. of course still riding.' },
      bunker: { sub: 'the deep end of the night. watts pay double til three.' },
      take: { sub: 'the prints get stranger after midnight. so do the subjects.' },
      wall: { sub: 'squint. the bright ones are the ones who stayed.' },
      rules: { sub: "same three rules. they don't loosen. that's what makes them rules." },
    },
    osd: {
      checking: "checking the street... it's late, give it a second.",
      scrubHint: 'drag sideways. time is negotiable this late.',
    },
    chat: {
      placeholderLive: "say it slower. the night's still listening.",
    },
    hud: {
      receipt: {
        stamp: 'WITCHING HOUR — everything ×2',
      },
    },
    dethrone: {
      deadMayorCaption: "the wall keeps your body when you fall. that's what a bar does.", // CANON (loose set)
    },
    empty: {
      chat: "quiet in here. witching hour pays double and FIRST BLOOD is still on the table. just saying.",
      take: 'no prints yet. the good ones happen after midnight and the great ones happen after that.',
    },
    errors: {
      chatLost:
        'the wire to chat went down — our end, not yours. reconnecting every few ' +
        "seconds. nobody's watts got hurt. this deep in the night the wires get sleepy too.",
    },
  },
};

/**
 * Resolve a dotted LEAF path against the active mode, falling back to normal.
 * `t('zones.bunker.sub', 'afterhours')` → loose copy; `t('chat.send', 'afterhours')`
 * → falls back to normal (buttons never change). Leaf keys only — see file docstring.
 * @param {string} path dotted path, e.g. 'zones.bunker.sub'
 * @param {StringMode} [mode='normal']
 * @returns {*} the string (or array) at that path
 */
export function t(path, mode = 'normal') {
  const dig = (root) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), root);
  if (mode === 'afterhours') {
    const loose = dig(STRINGS.afterhours);
    if (loose !== undefined) return loose;
  }
  return dig(STRINGS.normal);
}

/**
 * THE REGULARS — the ghost-tape congregation. All fictional, demo mode only.
 * Their typos and lowercase are CHARACTER, not site voice. In-jokes are shared
 * lore: "yes deb" (hydration compliance), CHAIN'S DRY (wrenchpigeon's vigil),
 * the parking meter proposal (see BLOTTER 03:12), kenny's eternal exit,
 * gladys's administration, the orange lamppost (see the 404).
 * @type {Regular[]}
 */
export const REGULARS = [
  {
    handle: 'stool_51',
    colorSeed: 51,
    persona: 'assigned himself a stool number in a bar with no assigned stools; asks the big ones at the wrong volume',
    arrivalStyle: 'arrives mid-thought, as if the conversation started three blocks ago',
    tics: 'no capitals, no question marks — his questions just trail off into the night',
    lineBank: [
      'anyway so if the bar closes while youre still in it. is it closed. or are you the bar now',
      'the flash proves you were somewhere. but who proves the flash was somewhere. thinkin about this',
      'deb before you say it, yes water. water is just the river practicing being small',
      'gladys tell them about the weight of the sign. they should know about the weight',
      'a puddle is the street remembering rain. this site gets it. i get it. we get it',
      'the meter never said no. everyone forgets the meter never said no',
      'kenny leaving is a state of mind. kenny himself is the proof',
      'watts. we are literally measured in light. nobody else is bothered by how beautiful that is',
      'teo whats the best exit youve ever seen. take your time. i have all night. thats the other thing i have',
      'i was gonna go home but then i thought about it',
    ],
  },
  {
    handle: 'wrenchpigeon',
    colorSeed: 227,
    persona: 'bike mechanic, off-shift; can diagnose a drivetrain through a phone mic',
    arrivalStyle: "first message is always a verdict on the bike's sound",
    tics: 'ALL CAPS for mechanical emergencies only; measures affection in chain lube',
    lineBank: [
      "CHAIN'S DRY. i can hear it. i can HEAR it",
      'chains dry again. comanche i will ride to wherever you are. i keep lube in my jacket like a flask',
      'that freewheel sounds like a card in the spokes of god',
      'everyone hydrates tonight per deb. bikes included. thats what lube is. yes deb',
      'he shifted under load on that hill. i felt it in my teeth',
      'left the shop at 11. the shop never closes it just gets dark. same as me',
      'spoke arcs on this site run 2hz. thats a slow cadence. hes coasting. i checked. i always check',
      'kenny your bike has been outside one bar for three hours. i can see it in the frame',
      'clean track stand at the light on patton. no foot down. thats church',
      "CHAIN'S DRY count tonight: three. im starting a tab of my own",
    ],
  },
  {
    handle: 'nightshiftRN_deb',
    colorSeed: 12,
    persona: 'insomniac nurse; charge-nurse energy, break-room thumbs; loves this chat like a wayward ward',
    arrivalStyle: 'appears on the hour, exactly, like rounds',
    tics: 'clinical abbreviations for feelings; signs off with -deb when it matters',
    lineBank: [
      'on break. 12 minutes. what did i miss',
      'pts (all of you) advised: water. noncompliance noted and forgiven',
      'that flash pop spiked my hr and i work in the business of hr spikes',
      'kenny leaving ama again i see',
      'moth honey you can talk here. this is the talking place. -deb',
      'the man rides a bike at 2am with a camera and MY sleep schedule is the concerning one. ok',
      'witching hour. double watts. the body keeps the score and apparently so does the site',
      'gladys we know. eight nights. we know, gladys',
      'break over. keep him on your screens. -deb',
      'i have seen every 3am this city has. this is the only good one',
    ],
  },
  {
    handle: 'iwasthere_iswear',
    colorSeed: 86,
    persona: 'was there. for all of it. including the parts happening right now, somewhere else',
    arrivalStyle: 'joins late insisting he never left',
    tics: 'opens with "i was there"; escalating detail that proves nothing',
    lineBank: [
      'i was there when the meter thing happened. she was NOT still thinking it over. she said maybe',
      'i was there the night gladys got dethroned. quietest room i ever stood in',
      'im literally in this chat and i was also there. these are not contradictions',
      'i was there when the sign got its bad filament. sounded like a wasp learning respect',
      'the eulogy for the pizza slice. i was one of the nine. i bowed the hardest',
      'i was there when teo gave the only 10. he says he never gave a 10. i was THERE',
      'lexington used to be brighter. or i was younger. i was there either way',
      'you werent there kenny. you were leaving. as usual',
      'i was there the one time the river said something. i wont repeat it',
      'ok i wasnt there for that one. feels weird to lie about this specific chat',
    ],
  },
  {
    handle: 'xmayor_gladys',
    colorSeed: 8,
    persona: 'held the neon for eight nights in the era of the broken heaters; governs from the back row now',
    arrivalStyle: 'enters like she still has keys',
    tics: 'refers to "my administration"; corrects the record; exclamation points are undignified',
    lineBank: [
      'under my administration the puddles were deeper. richer. this is not nostalgia, it is hydrology',
      'eight nights. some of you were not even moths yet',
      'i do not miss the neon. i miss the buzz. there is a difference and it is everything',
      'the current mayor is doing fine. fine is a word i chose carefully',
      'my sign is still on the wall. unlit. that is not defeat, that is archive',
      'stool, i will not discuss the weight of the sign again. (it was heavy. it was warm. next question)',
      'deb was my surgeon general. this is true and binding forever',
      'i was dethroned at 3:41am by someone with better streaks and worse posture. democracy',
      'the wall keeps everything. that is why i trust it more than people',
      'yes deb. water. even ex mayors comply',
    ],
  },
  {
    handle: 'frenchbroadjoe',
    colorSeed: 173,
    persona: 'fishes the French Broad after dark; measures everything in river',
    arrivalStyle: 'no greeting. one observation, dropped like a stone',
    tics: 'lowercase, short, no punctuation at the end. types like skipping stones',
    lineBank: [
      'river high tonight',
      'flash off the water looks like lightning that changed its mind',
      'caught nothing. kept the nothing. good night',
      'the site draws the river as a dark spot. correct. thats what she is from shore',
      'he rode the greenway once at 2am. i waved. the headlight waved back',
      'yall talk a lot for 2am. river never does',
      'the meter and the man. river heard about it. river laughed. one ripple',
      'deb i drink river amounts of water. its fine',
      'witching hour on the water is just hour',
      'kenny theres a bench down here for when you actually leave',
    ],
  },
  {
    handle: 'lastbus_charlene',
    colorSeed: 64,
    persona: 'closes the cafe on Haywood, sprints for the last bus, narrates the sprint live',
    arrivalStyle: 'arrives out of breath in text form',
    tics: 'keysmash under duress; counts down blocks; espresso metaphors',
    lineBank: [
      'CLOSED. chairs up. floor mopped. nine minutes to the bus. watch this',
      'three blocks. the loading dock guys waved. told them yall said hi',
      'MADE IT. driver held the door. dennis you legend, muffin tomorrow',
      'watching from the back seat. flash just went off near patton and i saw it irl AND on stream. double vision. double watts',
      'asdlkfjs the bus just went past him. HI. HI. he cant hear me. HI',
      'i smell like espresso and ambition',
      'missed it. next one in 40. its fine. bunker time. its fine',
      'kenny i sprint six blocks nightly and you cannot leave one bar',
      'yes deb i drink water. its just usually been steamed first',
      'if this site ever draws the bus on the map i will cry actual foam',
    ],
  },
  {
    handle: 'doorguy_teo',
    colorSeed: 44,
    persona: 'checks IDs on Lexington, checks on people everywhere; rates exits out of ten',
    arrivalStyle: 'greets each regular by name, in order, like a guest list',
    tics: 'rates things out of 10; short sentences; endless patience',
    lineBank: [
      'evening stool. deb. gladys. joe. charlene. everyone. good roster tonight',
      'that exit at the taco spot. clean push, held the door, nod to the room. 9.2',
      'i have never given a 10. a 10 means you never come back. i want everyone back',
      'kenny. buddy. that is eleven goodbyes. the exit is a door, not a lifestyle',
      'this site tells everybody to get home safe and means it. nobody leaves alone. 9.7. you know i dont hand those out',
      'saw a guy hug a lamppost tonight. checked on him. he was fine. he just loved the lamppost',
      'moth you talk whenever you are ready. no cover charge on words',
      'the meter thing was before my door. the story checks id everywhere though',
      'flash went off outside just now. even off shift i stood up straighter',
      'yes deb. water. i tell my whole line the same thing',
    ],
  },
  {
    handle: 'moth_no_1',
    colorSeed: 1,
    persona: 'first-ever chat; found the stream at 1am by accident and stayed on purpose',
    arrivalStyle: 'lurks twenty minutes, then a very small hello',
    tics: 'apologizes, then slowly stops apologizing — the lineBank is an arc, play it in order',
    lineBank: [
      'hi sorry. is it ok to just watch',
      'ok cool. sorry. thank you',
      'the map is drawing itself?? did everyone know it does that. sorry if old news',
      'i said one thing and got watts for it. points for TALKING. what kind of bar pays you',
      'deb told me to drink water. i drank water. i have never followed advice that fast',
      'FIRST BLOOD was me tonight. i said the first thing. me',
      'update: im a REGULAR now. the stool knows my shape. i have a shape',
      'i live two blocks off haywood and i heard the flash tonight irl. im in the show. we are all in the show',
      'not sorry for talking anymore. deb calls it growth. teo rated my arrival 8.8',
      'one day im getting on that wall. writing it here so it counts',
    ],
  },
  {
    handle: 'onemorekenny',
    colorSeed: 199,
    persona: 'has been leaving the same bar since roughly february',
    arrivalStyle: "arrives by announcing he's leaving somewhere else",
    tics: 'every message contains a departure that does not happen; timestamps his goodbyes',
    lineBank: [
      'ok leaving after this song',
      'that was the song. one more song',
      '1:47am status: leaving for real. saying bye to marcus first. marcus has a lot going on',
      'im at the DOOR. teo rate this. im basically outside',
      '2:15 status: found a dog outside. cant leave now. legally',
      'charlene the bus and i have an understanding. it leaves. i dont',
      'the site keeps gently telling me to get home safe. i heard it. im honoring it emotionally. from this stool',
      'ok NOW leaving. watch the map. if a flash pops near eagle st in twenty minutes thats me getting photographed leaving. legacy',
      '3am note: never made it past the second lamppost. it was the orange one. you know how it is',
      'leaving was invented by people who never found a good corner',
    ],
  },
  {
    handle: 'puddlewatcher',
    colorSeed: 400,
    persona: 'watches the bottom seventy-two pixels of the stream exclusively; the reflection is the real show',
    arrivalStyle: 'comments on the reflection of your arrival before your arrival',
    tics: 'describes everything upside down; obsessed with the 400ms delay',
    lineBank: [
      'the gutter runs 400ms behind. i live in that 400ms. rent free',
      'flash just fired. wait for it. wait for it. there it is in the water. god',
      'yall watch the sky version. thats fine. the street tells it slower and truer',
      'held the puddle just now and last nights photo came up like a fish. i let it go',
      'upside down the sign says the same thing. thats how you know its honest',
      'the puddle remembers. its in the documentation. its in my heart',
      'kenny in the reflection you have already left. something to aspire to',
      'rain tonight means more screen for me. condolences to the sky people',
      'deb the puddle is water. i am basically hydrating visually',
      'when the ripple settles and the lamp comes back together. thats the whole reason. right there',
    ],
  },
];

/**
 * LEGENDS OF THE WALL — seed entries. Lore, never live users (Honesty Law);
 * render them under STRINGS.normal.wall.legendsSlate. Watts frozen forever.
 * xmayor_gladys appears here AND in REGULARS on purpose: the ghost tape is
 * her retirement, the wall is her term. Filament Pete is why every bad
 * filament in the SIGN BUZZ is "named pete" — builders may reference this.
 * @type {Legend[]}
 */
export const LEGENDS = [
  {
    handle: 'wanda_walksyouhome',
    watts: 91208,
    rank: 'GUTTER SAINT',
    sharpieTag: 'nobody walks alone',
    era: 'the winter the heaters broke',
    oneLineStory: "ended every single night at somebody else's door first; the puddles on Lexington still part for her.",
  },
  {
    handle: 'xmayor_gladys',
    watts: 73404,
    rank: 'NIGHT MAYOR (dethroned)',
    sharpieTag: 'my administration',
    era: 'the eight nights of gladys',
    oneLineStory: 'held the neon for eight nights and governed like the city was a houseplant she was watering; her sign stays on the wall, unlit, exactly as she left it.',
  },
  {
    handle: 'tallboy_orbison',
    watts: 61990,
    rank: 'LAST CALL LEGEND',
    sharpieTag: 'one more for the room',
    era: 'the summer of the busted jukebox',
    oneLineStory: 'sang the last song a cappella every night the jukebox was down; the night genuinely did not end until he nodded.',
  },
  {
    handle: 'the_walnut_st_kid',
    watts: 48752,
    rank: 'STREETLAMP',
    sharpieTag: 'ask me where anything is',
    era: 'before the map drew itself',
    oneLineStory: 'gave directions to strangers so reliably that half of downtown still navigates by where he used to stand.',
  },
  {
    handle: 'hotplate_ramona',
    watts: 33017,
    rank: 'FIXTURE',
    sharpieTag: "kitchen's closed. sit down anyway",
    era: 'the after-hours diner years',
    oneLineStory: 'fed the whole congregation off two burners after close; when she was gone the corner looked wrong, which is the entire definition.',
  },
  {
    handle: 'quarters4thejuke',
    watts: 19340,
    rank: 'REGULAR',
    sharpieTag: 'B-17 forever',
    era: 'every era, somehow',
    oneLineStory: "refused every promotion the tab ever offered; some stools retire at REGULAR, and that isn't failure, that's tenure.",
  },
  {
    handle: 'filament_pete',
    watts: 12066,
    rank: 'FIXTURE',
    sharpieTag: '85% lit is still lit',
    era: 'when the sign got its buzz',
    oneLineStory: 'stood under the sign the night its first letter started misfiring and declared it perfect; every bad filament since is named pete.',
  },
  {
    handle: 'moth_zero',
    watts: 1,
    rank: 'MOTH',
    sharpieTag: 'crossed first',
    era: 'the first night, allegedly',
    oneLineStory: 'the first one to cross the street toward the glow; one watt, never spent, never topped.',
  },
];

/**
 * THE BLOTTER — 24 EXIF police-blotter captions for THE TAKE.
 * One entry per print, chronological, one night: 23:41 → 04:16.
 * Real Asheville geography only. The 03:12 entry is CANON, verbatim,
 * including its capitalization and its 'flash fired' lens slot.
 * Render: `${time} · ${street} · ${lens} · ${line}` in the BLOTTER stack.
 * @type {BlotterEntry[]}
 */
export const BLOTTER = [
  {
    time: '23:41',
    street: 'Lexington Ave',
    lens: 'f/2, full flash',
    line: "subject attempted to teach a stranger's dog the concept of last call. dog remains unconvinced.",
  },
  {
    time: '00:07',
    street: 'Broadway & Walnut St',
    lens: 'f/1.8, full flash',
    line: 'subject sang the wrong words to the right song loudly enough that they are now the right words.',
  },
  {
    time: '00:23',
    street: 'Patton Ave',
    lens: 'f/2.8, flash at half',
    line: "two subjects agreed to be best friends. neither asked the other's name. officials consider the matter settled.",
  },
  {
    time: '00:48',
    street: 'Haywood Rd',
    lens: 'f/2, full flash',
    line: 'subject held the door for eleven consecutive people and missed his own ride. no regrets reported at the scene.',
  },
  {
    time: '01:02',
    street: 'Eagle St',
    lens: 'f/2, full flash',
    line: 'subject delivered a eulogy for a dropped slice of pizza. attendance: nine. all heads bowed.',
  },
  {
    time: '01:17',
    street: 'the French Broad, west bank',
    lens: 'f/1.4, no flash',
    line: 'river declined to comment. river always declines to comment.',
  },
  {
    time: '01:29',
    street: 'Rankin Ave parking deck, level 3',
    lens: 'f/2, full flash',
    line: 'subject found the echo and gave it everything he had. echo gave it all back.',
  },
  {
    time: '01:36',
    street: 'College St',
    lens: 'f/2.8, full flash',
    line: 'subject applauded a closed hot dog cart for its body of work.',
  },
  {
    time: '01:44',
    street: 'Biltmore Ave',
    lens: 'f/2, full flash',
    line: 'bachelorette party absorbed two strangers and a busker. no survivors, only members.',
  },
  {
    time: '01:58',
    street: 'Wall St',
    lens: 'f/2, flash bounced',
    line: 'subject read a parking ticket aloud in the voice of a shakespearean king. the car remains unmoved, in every sense.',
  },
  {
    time: '02:03',
    street: 'Coxe Ave',
    lens: 'f/1.8, full flash',
    line: 'subject invented a handshake with a bouncer. both parties have already forgotten it. both parties know it happened.',
  },
  {
    time: '02:11',
    street: 'Lexington Ave & Walnut St',
    lens: 'f/2, full flash',
    line: 'subject asked the flash if it was god. flash fired. subject nodded like that settled it.',
  },
  {
    time: '02:19',
    street: 'Clingman Ave',
    lens: 'f/2.8, full flash',
    line: 'subject walked a fixed-gear up the hill and called it "us time."',
  },
  {
    time: '02:26',
    street: 'Depot St',
    lens: 'f/2, full flash',
    line: 'line cook exited through the kitchen door still in apron, lit a cigarette, and stood exactly like a renaissance painting. no charges. framed.',
  },
  {
    time: '02:31',
    street: 'Broadway',
    lens: 'f/2, full flash',
    line: 'subject gave directions to a town he has never been to. confidently. correctly.',
  },
  {
    time: '02:38',
    street: 'Market St',
    lens: 'f/2, flash at half',
    line: 'couple slow-danced to the sound of an ice machine. ice machine kept time.',
  },
  {
    time: '02:47',
    street: 'Haywood Rd',
    lens: 'f/2, full flash',
    line: 'subject attempted to pay for tacos with a poem. vendor countered: two poems. deal closed.',
  },
  {
    time: '02:52',
    street: 'Merrimon Ave',
    lens: 'f/1.8, full flash',
    line: 'possum crossed against the light carrying an entire bagel. no pursuit. professional respect.',
  },
  {
    time: '03:04',
    street: 'Patton Ave & Coxe Ave',
    lens: 'f/2, full flash',
    line: 'subject swore this was his exit, hugged everyone twice, and was observed at the next bar eight minutes later. the blotter notes a pattern.',
  },
  {
    time: '03:12',
    street: 'Broadway & Walnut',
    lens: 'flash fired',
    line: "subject proposed to a parking meter. Meter's still thinking it over.", // CANON — verbatim, capital M and all
  },
  {
    time: '03:26',
    street: 'Church St',
    lens: 'f/2, full flash',
    line: 'subject apologized to a statue for something "between us." statue kept his counsel.',
  },
  {
    time: '03:38',
    street: 'Southside Ave',
    lens: 'f/2.8, no flash',
    line: "third-floor window still lit. somebody's writing something. the blotter wishes them luck.",
  },
  {
    time: '03:51',
    street: 'Riverside Dr',
    lens: 'f/2, full flash',
    line: 'subject skipped a stone across the French Broad in the dark. three skips, heard not seen. the river confirmed.',
  },
  {
    time: '04:16',
    street: 'Lexington Ave',
    lens: 'f/1.4, last frame of the roll',
    line: 'street empty. lamp on. puddle holding the whole sign steady, like it practiced. end of tape.',
  },
];

// Freeze the top level — this table is data, not state. (Shallow on purpose:
// deep-freezing costs startup time for a file nobody is allowed to mutate anyway.)
Object.freeze(STRINGS);
Object.freeze(REGULARS);
Object.freeze(LEGENDS);
Object.freeze(BLOTTER);
