/* Waypoint — the kinds of card a planner's node block can be (backlog 107 step 3, with backlog 147's aliases).

   The owner, 2026-10-16, by prompt: "Person, Place, Clue (Recommended)": the scene node's Mode list gains three kinds, each
   reusing today's fields under a name that fits it, so that switching keeps every field. And 2026-11-06, by prompt: aliases
   "Build the cards first (Recommended)" and "Every kind of card (Recommended)": every card has an Also known as, and search
   finds a card by any of its names. The drawings: Place wears the map pin a scene's Open map link already wears (wi-marker),
   a Person the Characters drawing, a Clue the magnifying glass with a cross inside (the owner: "the magnifying glass is good").

   Stored on a node block, each only where it says something, so a node with none is stored and drawn byte for byte as before:
     mode   absent (a scene), 'table', 'person', 'place', 'clue'
     aka    other names, a list of short texts
     done   true only: Played on a scene, Found on a clue
     sheet  a person's character sheet, a plain id

   Pure: no imports, nothing touched at load time. Planners never travel, so none of this is ever sent. */

var VERSION = 1;
var AKA_MAX = 12;       // names a card may have besides its title
var AKA_CHARS = 80;     // one name's length

// What each kind calls its fields. ico: the drawing before a card's title (a scene has none, so a scene is drawn as before)
var KINDS = Object.freeze({
    scene: Object.freeze({ key: 'scene', mode: '', label: 'Scene node', word: 'Scene', title: 'Scene title', tag: 'Tag', must: 'Must resolve', mustPh: 'What must be settled (optional)', map: 'Map', cols: Object.freeze(['Action', 'Why', 'Cost', 'Returns via']), tick: 'Played', ico: '', sheet: false }),
    person: Object.freeze({ key: 'person', mode: 'person', label: 'Person', word: 'Person', title: 'Name', tag: 'Role', must: 'Wants', mustPh: 'What they want (optional)', map: 'Where they are', cols: Object.freeze(['If asked about', 'Says', 'The truth']), tick: '', ico: 'wi-person', sheet: true }),
    place: Object.freeze({ key: 'place', mode: 'place', label: 'Place', word: 'Place', title: 'Place', tag: 'Area', must: 'When they arrive', mustPh: 'What they find when they arrive (optional)', map: 'Map', cols: Object.freeze(['If they', 'Then']), tick: '', ico: 'wi-marker', sheet: false }),
    clue: Object.freeze({ key: 'clue', mode: 'clue', label: 'Clue', word: 'Clue', title: 'Clue', tag: 'Tag', must: 'Points to', mustPh: 'What it leads to (optional)', map: 'Where it can be found', cols: Object.freeze(['Can turn up', 'How']), tick: 'Found', ico: 'wi-clue', sheet: false }),
    table: Object.freeze({ key: 'table', mode: 'table', label: 'Plain table', word: '', title: 'Table title', tag: '', must: '', mustPh: '', map: '', cols: Object.freeze(['Item', 'Detail', 'Notes']), tick: '', ico: '', sheet: false })
});
var ORDER = Object.freeze(['scene', 'person', 'place', 'clue', 'table']);   // the Mode list's order
var MODES = Object.freeze(['table', 'person', 'place', 'clue']);           // the words a node's mode may hold

function own(o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }

// A stored mode as the app reads it: one of the four words, or nothing (a scene)
function cleanMode(v) { return typeof v === 'string' && MODES.indexOf(v) >= 0 ? v : undefined; }
// The kind of a node block: its mode, else a scene
function cardKind(b) { var m = b && typeof b === 'object' ? cleanMode(b.mode) : undefined; return m || 'scene'; }
function kindOf(b) { return KINDS[cardKind(b)]; }
// A kind by its key, the Mode list's value; anything else is a scene
function kindBy(k) { return typeof k === 'string' && own(KINDS, k) ? KINDS[k] : KINDS.scene; }

// One name: a line of text, spaces folded, no control or direction characters, 80 at most
function cleanName(v) {
    if (typeof v !== 'string') return '';
    var s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > AKA_CHARS) { s = s.slice(0, AKA_CHARS); if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1); s = s.trim(); }
    return s;
}
// Other names: a list of names, each once whatever its capitals, 12 at most; nothing when none is left
function cleanAka(v) {
    if (typeof v === 'string') v = akaFrom(v);
    if (!Array.isArray(v)) return undefined;
    var out = [], seen = Object.create(null);
    for (var i = 0; i < v.length && i < AKA_MAX * 4 && out.length < AKA_MAX; i++) {
        var n = cleanName(v[i]); if (!n) continue;
        var k = n.toLowerCase(); if (seen[k]) continue;
        seen[k] = 1; out.push(n);
    }
    return out.length ? out : undefined;
}
// The box's text read as names: separated by commas or semicolons
function akaFrom(s) { return typeof s === 'string' ? s.split(/[,;]/) : []; }
// The names as the box shows them
function akaText(v) { var a = cleanAka(v); return a ? a.join(', ') : ''; }
// Every name a card goes by, its title first
// A title as the words the page shows for it: its typed tags left out (a < opens a tag only before a letter, a /, a ! or a ?, so "DC < 15"
// keeps its words) and the few entities a title may hold read as their characters, each once
var TITLE_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ', '#160': ' ' };
function titleWords(s) {
    if (typeof s !== 'string') return '';
    var t = s.indexOf('<') < 0 ? s : s.replace(/<\/?[a-zA-Z!?][^<>]*>/g, '');
    return t.indexOf('&') < 0 ? t : t.replace(/&(amp|lt|gt|quot|apos|#39|nbsp|#160);/gi, function(all, k) { return TITLE_ENT[k.toLowerCase()]; });
}
function cardNames(b) {
    if (!b || typeof b !== 'object') return [];
    var out = [], t = cleanName(titleWords(b.title));
    if (t) out.push(t);
    (cleanAka(b.aka) || []).forEach(function(n) { if (out.every(function(o) { return o.toLowerCase() !== n.toLowerCase(); })) out.push(n); });
    return out;
}
// Played or Found: true only, and only on a kind that has the tick
function cleanDone(v, kind) { return v === true && !!kindBy(kind).tick ? true : undefined; }
// 1.6.2 (backlog 166 d; the owner, 2026-11-09, by prompt: the state goes on each scene node): a scene's session, Tonight or Ahead. Played is the
// scene's own tick (done), so a scene is Ahead, Tonight or Played and never two of them; a word only on a scene
var WHEN = Object.freeze(['ahead', 'tonight']);
function cleanWhen(v, kind) { return cardKindOf(kind) === 'scene' && typeof v === 'string' && WHEN.indexOf(v) >= 0 ? v : undefined; }
function cardKindOf(k) { return typeof k === 'string' ? k : cardKind(k); }
// A scene's session as one word: 'played', 'tonight', 'ahead' or '' (none, or a card that is no scene)
function sessionOf(b) { if (!b || typeof b !== 'object' || b.type !== 'node' || cardKind(b) !== 'scene') return ''; return b.done === true ? 'played' : cleanWhen(b.when, 'scene') || ''; }
// Sets a scene's session in place: 'played' is the tick, 'tonight' and 'ahead' the word, anything else neither
function setSession(b, s) { if (!b || typeof b !== 'object') return b; delete b.when; delete b.done; if (cardKind(b) !== 'scene') return b; if (s === 'played') b.done = true; else if (WHEN.indexOf(s) >= 0) b.when = s; return b; }
// 1.6.2 (backlog 166 g; the owner, 2026-11-09, by prompt: "Sound, music or effect"): what a card's Play button starts for the table, { k, id }:
// k 's' a sound of the Sound panel, 'm' a song, 'p' a playlist, 'f' a saved effect; id a plain id. Never on a plain table
var CUE_K = Object.freeze(['s', 'm', 'p', 'f']), CUE_ID = /^[A-Za-z0-9_-]{1,64}$/;
function cleanCue(v, kind) { if (cardKindOf(kind) === 'table' || !v || typeof v !== 'object' || CUE_K.indexOf(v.k) < 0 || typeof v.id !== 'string' || !CUE_ID.test(v.id)) return undefined; return { k: v.k, id: v.id }; }
// A person's sheet: a plain id, and where the characters are handed in, one of them
var SHEET_ID = /^[A-Za-z0-9_-]{1,64}$/;
function cleanSheet(v, chars) {
    if (typeof v !== 'string' || !SHEET_ID.test(v)) return undefined;
    if (chars && typeof chars === 'object' && !own(chars, v)) return undefined;
    return v;
}
// A node block's card keys, cleaned in place: what does not clean goes, and what its kind does not have goes (the editor keeps
// every field when the kind is switched, so a switch back finds them; a file is cleaned to what its kind reads)
function cleanCard(b, chars) {
    if (!b || typeof b !== 'object' || b.type !== 'node') return b;
    var m = cleanMode(b.mode); if (m) b.mode = m; else delete b.mode;
    var k = cardKind(b);
    var a = cleanAka(b.aka); if (a && k !== 'table') b.aka = a; else delete b.aka;
    if (cleanDone(b.done, k)) b.done = true; else delete b.done;
    var wn = b.done === true ? undefined : cleanWhen(b.when, k); if (wn) b.when = wn; else delete b.when;   // 1.6.2 (backlog 166 d)
    var cu = cleanCue(b.cue, k); if (cu) b.cue = cu; else delete b.cue;   // 1.6.2 (backlog 166 g)
    var s = k === 'person' ? cleanSheet(b.sheet, chars) : undefined; if (s) b.sheet = s; else delete b.sheet;
    return b;
}
// Cards side by side (1.6.2, backlog 107 (a); docs/PLANNER_ORG_DESIGN.md 4.6). A section heading of a planner may say cards, one of three
// sizes: the blocks under it, up to the next section or title, then sit side by side, as many in a row as the place has room for. A card,
// a note and a picture are cards there. Text, a chart and Raw HTML take the whole row, and so does a card or a picture ticked Wide card,
// which is the page's own key layout.span, only as true. Opt-in: a planner with neither key is stored and drawn as it always was.
var CARD_SIZES = ['small', 'medium', 'large'], CARD_BLOCKS = { node: 1, callout: 1, flare: 1, image: 1 }, WIDE_BLOCKS = { node: 1, image: 1 };
function cleanCards(v) { return typeof v === 'string' && CARD_SIZES.indexOf(v) >= 0 ? v : undefined; }
function wideMay(b) { return !!b && typeof b === 'object' && WIDE_BLOCKS[b.type] === 1; }   // a block that may be ticked Wide card
function wideOn(b) { return wideMay(b) && !!b.layout && typeof b.layout === 'object' && b.layout.span === true; }
function wideSet(b, on) {
    if (!wideMay(b)) return b;
    if (on === true) b.layout = Object.assign({}, b.layout && typeof b.layout === 'object' && !Array.isArray(b.layout) ? b.layout : {}, { span: true });
    else if (b.layout && typeof b.layout === 'object') { delete b.layout.span; if (!Object.keys(b.layout).length) delete b.layout; }
    return b;
}
// in a card section: true for a block that takes the whole row
function cardWide(b) { return !b || typeof b !== 'object' || CARD_BLOCKS[b.type] !== 1 || wideOn(b); }
// a section heading's cards key, cleaned in place: one of the three sizes, on a section heading alone
function cleanSection(b) { if (!b || typeof b !== 'object') return b; var c = b.type === 'h2' ? cleanCards(b.cards) : undefined; if (c) b.cards = c; else delete b.cards; return b; }
// The default columns of a node with none of its own
function defaultCols(b) { return kindOf(b).cols.slice(); }

var api = { VERSION: VERSION, AKA_MAX: AKA_MAX, AKA_CHARS: AKA_CHARS, KINDS: KINDS, ORDER: ORDER, MODES: MODES, cleanMode: cleanMode, cardKind: cardKind, kindOf: kindOf, kindBy: kindBy, cleanName: cleanName, cleanAka: cleanAka, akaFrom: akaFrom, akaText: akaText, cardNames: cardNames, cleanDone: cleanDone, WHEN: WHEN, cleanWhen: cleanWhen, CUE_K: CUE_K, cleanCue: cleanCue, sessionOf: sessionOf, setSession: setSession, CARD_SIZES: CARD_SIZES, cleanCards: cleanCards, wideMay: wideMay, wideOn: wideOn, wideSet: wideSet, cardWide: cardWide, cleanSection: cleanSection, cleanSheet: cleanSheet, cleanCard: cleanCard, defaultCols: defaultCols };
if (typeof window !== 'undefined') window.wpCardCore = api;

export { CARD_SIZES, cleanCards, wideMay, wideOn, wideSet, cardWide, cleanSection, CUE_K, cleanCue, WHEN, cleanWhen, sessionOf, setSession, VERSION, AKA_MAX, AKA_CHARS, KINDS, ORDER, MODES, cleanMode, cardKind, kindOf, kindBy, cleanName, cleanAka, akaFrom, akaText, cardNames, cleanDone, cleanSheet, cleanCard, defaultCols };
