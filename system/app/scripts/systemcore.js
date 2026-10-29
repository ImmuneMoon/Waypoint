/* Character sheets and the rules model (1.5.0) — the pure half: a campaign's SYSTEM (named fields with defaults or
   formulas, rolls, a sheet layout), its CHARACTERS (values keyed by field id), the cleaners for what comes off the
   wire or out of a file, the validator behind the editor's carets, the resolver that lets the formula engine read
   a character's names (STR, Skill.Stealth, HP.max), the per-recipient view a player receives, the hover lines,
   the auto layout and the hook an outside sheet reader registers through. No DOM, no state, no engine import: the engine API (window.wpFormula
   or a stub) is passed in as F, so tools/systemcheck.js runs this under Node. Published as window.wpSystemCore.
   Design of record: docs/SHEET_BUILDER_PLAN.md. */
'use strict';
import { cleanCalendar } from './calendarcore.js';   // item 20 K1: the system's calendar (a pure module of its own: calendarcheck runs it)
import { cleanRec, makeRec, textSig, RULES as LOOK_RULES } from './lookcore.js';   // item 35: the look of a text outside a planner, a record that names its text (pure; textcheck runs it)

var VERSION = '1.5.0';
// 1.5.8, backlog 149 (the owner, by prompt: "From the formula, GM can change it (Recommended)"): the die a roll is drawn with. DIE_NAMES is the
// set drawn for Waypoint (scripts/dieicons.js draws each, in this order); a roll's die, a list roll's and a field's rollDie is one of them or
// absent, and absent reads the roll's own formula (dieOf). cleanDie: a name of the set, else ''
var DIE_NAMES = Object.freeze(['d2', 'd4', 'd6', '2d6', '3d6', 'd8', 'd10', 'd12', 'd20', 'd100', 'dF', '4dF']);
var DIE_DEFAULT = 'd6';
function cleanDie(v) { return typeof v === 'string' && DIE_NAMES.indexOf(v) >= 0 ? v : ''; }
// The die a formula rolls: its dice terms read as the dice roller writes them (2d6, d20, 4d6kh3, 1d%, 4dF), never a name that holds the letters
// (Skill.d20, Bd6). One kind of die: a d6 by how many (1, 2, or 3 and more), a Fate die by how many (1, or more), any other kind of the set as
// itself. No dice, several kinds, or a die the set does not draw (d3, d7): the d6
function dieOf(text) {
    var s = typeof text === 'string' ? text.slice(0, 4000) : '', re = /(^|[^A-Za-z0-9_.])(\d*)[dD](\d+|%|[Ff](?![A-Za-z0-9_]))/g, m, kind = '', n = 0;
    while ((m = re.exec(s)) !== null) {
        var k = m[3] === '%' ? '100' : /^[Ff]$/.test(m[3]) ? 'F' : String(Number(m[3])), c = m[2] ? Number(m[2]) : 1;
        if (kind && kind !== k) return DIE_DEFAULT;
        kind = k; n += c > 0 && isFinite(c) ? c : 0;
    }
    if (!kind || n < 1) return DIE_DEFAULT;
    if (kind === '6') return n >= 3 ? '3d6' : n === 2 ? '2d6' : 'd6';
    if (kind === 'F') return n >= 2 ? '4dF' : 'dF';
    return DIE_NAMES.indexOf('d' + kind) >= 0 ? 'd' + kind : DIE_DEFAULT;
}
// The die a roll entry is drawn with: the GM's pick (its die, or a field's rollDie), else its formula's
function rollDie(pick, formula) { return cleanDie(pick) || dieOf(formula); }
var LIMITS = Object.freeze({
    fields: 400, rolls: 80, sections: 100, tabs: 12, placements: 400, options: 50, optionChars: 60,   // Stage 6: room for a big sheet (one section per section of a large VTT sheet); 1.5.4: 400 fields, 60 sections and 400 placements (a website's whole sheet: 300, 40 and 300 before); 1.6.0: 100 sections (a sheet folded by body slot, asked by the campaign build's session)
    key: 64, label: 60, formula: 1000,      // 1000 = the dice path's expression cap, so a sheet roll never dies there (300 before 1.6.0, backlog 200)
    text: 200, notes: 20000, name: 60, itemName: 240, charName: 60, names: 200,   // 1.6.0, backlog 194: an item's and a library entry's name 240 (60 before), as a row's own name; every other name and a character's stay 60
    makingMax: 12,   // Onboarding F3: characters in the making at one table at once (each a player's own, on the GM's disk)
    core: 1000, coreBytes: 256 * 1024,       // Stage 6 library L1d: library entries a formula addresses by key, copied into the system
    items: 200, carried: 150, category: 40, maxBlastFt: 3000, maxQty: 99,   // item library (Stage 5); Stage 6: 150 rows a list (a big sheet's skills)
    rmMsg: 200, undoMs: 10000, undoGraceMs: 15000,   // Stage 6: a bound or cursed item's message; a pickup's Undo (the host allows a little longer: the round trip)
    listCats: 20, rowNote: 200, lvlAbs: 1e6, lvlCaps: 4,     // Stage 6 F4b: a list's categories, a row's note, the size of a row level; 1.6.0: a level's caps (At most at a level)
    placeCats: 8,                            // 1.5.5: the categories one placement of an item list shows (a list placed once a category)
    rollSw: 4, swTo: 8,                      // 1.6.0: the roll switches one item or effect offers (a bonus ticked in a roll's ± window), and the rolls one names
    areaAffs: 2,                             // 1.5.9 (the book's (es)): the afflictions one explosive carries (Affliction (HT-2) and a second one)
    desc: 4000, lvls: 20, lvlText: 600, lvlTag: 40, rowsText: 400000,   // 1.5.4: an entry's description, the levels it describes, a level's text and the words beside it; the long text one list's rows carry to their owner in all
    ownText: 200000,                         // 1.5.5 (155): the long text the character's own rows of one list may hold in all, as rowText counts it (stored and sent)
    listStats: 48, entryStats: 48, statAbs: 1e9,   // Stage 6 F4c1: a list's stats (12 since range penalties: a weapons list with Half and MaxRange; 24 since 1.5.4: a whole weapon line; 32 since 1.6.0, the SotMW build: a full list and a figure an outside reader fills; 48 since the v2 combat module: a weapons and an armour list), the stats an item carries (32 since 1.5.4, 48 with a list's in 1.6.0: a copy's own values hold every stat of its list), the size of a stat (a price, a weight: 99,999,999 fits)
    listCols: 24,                            // Stage 6 F5a1: a list's columns (a formula per row; 6 before 1.5.4, 12 before 1.6.0)
    colPlus: 8,                              // 1.5.4 With: the stats a column names as adding to it in a case of their own (a DR of 15 that is 35 against energy)
    pickOpts: 48,                            // Stage 6 F5a2: a choice stat's options
    rowRolls: 10,                            // Stage 6 F5b: a list's rolls (a button on each row; 4 before 1.5.4, 8 before 1.6.0)
    applyChanges: 8,                         // Stage 6 HUD H7: an apply action's changes (a pool or a number each), and a roll's consequences (4 before 1.5.4)
    rowCounters: 8,                          // Stage 6 HUD R2: a list's counters (a number each row keeps: Charges, Hits; 4 before 1.5.4)
    turnActs: 6,                             // turn-based combat T1: what one turn allows (Action, Bonus action, Maneuver)
    turnUnits: 6,                            // turn-based combat T1: the system's own time units (a segment, a watch)
    lightPresets: 24,                        // lighting L4: the system's light presets (a torch, a lantern)
    rangeSteps: 40,                          // range penalties R1: the range table's steps (a Size and Speed/Range table from 2 to 1,000,000 yards is 38)
    heightSteps: 40,                         // item 19 H2: the height table's steps
    senses: 8,                               // senses S1: the system's senses besides the eyes (Tremorsense, Ether Sight)
    cols: 4, editsPerWindow: 20, editWindowMs: 5000, editTimeoutMs: 5000, valueChars: 20000, editBatch: 10,   // HUD frame (HF4b): values in one batched edit (a section's Reset all)
    band: 12, bandGroups: 6,                 // Stage 5c: placements on the pinned band (one row under the name); Stage 6: named groups of them, each pinned by its viewer
    identity: 12, ledger: 8,                 // Stage 5d: the header block — identity rows and ledger figures (read-only)
    icon: 8, unit: 8,                        // Stage 5g: a tab's or a section's icon (code points: an emoji or a glyph or two), a number's unit ("pts")
    caption: 200, captionExprs: 8,           // Stage 5g Fold B: a field's caption line and the {formula} values in it
    ruleText: 2000,                          // Stage 6 HUD H11: a rules-text placement (plain text, its line breaks kept)
    labels: 32,                              // Stage 6: names for a number's values (a dropdown) or a formula's (shown instead of the number); 10 before 1.6.0, now a list's stat may name one value per damage type
    effects: 100, effectRows: 30, effectMods: 12, effectAmount: 1e6, effectDur: 40,  // Stage 5h: the library, a character's list, changes per effect, a change's size, a duration note
    uploadChanges: 600,                      // Stage 6 U1: the changes one upload may propose
    uploadBytes: 1048576, uploads: 20,       // Stage 6 U2: a sheet file on the wire (as JSON, its portrait dropped); uploads the GM's queue keeps
    threats: 6,                              // Stage 5h Fold 3: threat marks on a token (world bearings; the first is the active one)
    postures: 12, postureTag: 4, postureNotes: 200,  // conditions C3: the system's own postures, a chip's tag (code points), a posture's notes
    initTies: 3,                             // initiative O2: the steps that break a tie of initiative (a value or a roll each)
    budgets: 8,                              // 126: the system's point budgets (a name and two formulas each)
    links: 8, linkNames: 64,                 // 1.6.0: a system's linked sheets, and the figures under one link a player's copy carries
    env: 8,                                  // 1.6.0: the environment readings a system names (a temperature, a gravity)
    needs: 8                                 // 126b: the entries one entry needs
});
// item-list is a STORED, non-numeric list kind (a character's carried items); never in NUMERIC/DEF_PROP.
var KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1, text: 1, notes: 1, select: 1, 'item-list': 1, effects: 1 });
var STORED = Object.freeze({ number: 1, resource: 1, skill: 1, toggle: 1, text: 1, notes: 1, select: 1, 'item-list': 1, effects: 1 });   // effects (5h): a character's status effects — rows, never a number
var NUMERIC = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1 });   // kinds a formula may name
var DEF_PROP = Object.freeze({ formula: 'formula', resource: 'maxFormula', skill: 'base' });   // a kind's definition formula (no dice allowed)
var LAYOUT = Object.freeze({ heading: 1, divider: 1, portrait: 1, link: 1, facing: 1, stance: 1, pin: 1, hud: 1, search: 1, text: 1, roller: 1 });   // text (H11): a block of rules text; roller (H9): a custom roll box   // search (Stage 6 HUD H12): a handbook search over the viewer's own pages   // hud (HUD frame HF2b): a button that opens the character's HUD   // pin (Stage 6): the Pin button of a band group   // link (Stage 5f): a button that opens a handbook page; facing (5h): the token's facing dial; stance (Stage 6): the token's posture and elevation
var BAND_KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1 });   // Stage 5c: what the pinned band can hold — kinds that read in one row (text, notes, selects and item lists stay in sections)
var IDENTITY_KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1, text: 1, select: 1 });   // Stage 5d: what an identity row can show, read-only (notes and item lists stay in sections)
var LEDGER_KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1 });   // Stage 5d: what a ledger figure can show — a number over its label
var RESERVED_SUFFIX = Object.freeze({ max: 1, ranks: 1, cur: 1, base: 1 });
// 1.6.0: the endings a formula reads as a part of a field: the reserved four and full (a pool's Pool.full). full is not reserved, so a key may end in it
var NAME_SUFFIX = Object.freeze({ max: 1, ranks: 1, cur: 1, base: 1, full: 1 });
var FUNC_NAMES = Object.freeze({ floor: 1, ceil: 1, trunc: 1, round: 1, abs: 1, sqrt: 1, min: 1, max: 1, clamp: 1, mod: 1, 'if': 1, and: 1, or: 1, not: 1, 'true': 1, 'false': 1 });
// Stage 5f: a handbook page id as a sheet names it. Pages' ids are free-form by contract (CAMPAIGN_INTEGRATION.md), capped at 80 by
// docrender.cleanDoc; never an Object.prototype name. The system cannot see the campaign, so this is the format only — which pages a
// player may see is decided by the host (cleanSystem's opts.pages) and again when the sheet is drawn.
var PAGE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
var EFFECT_ID = /^e_[A-Za-z0-9_]{1,24}$/, FXROW_ID = /^x_[A-Za-z0-9_]{1,24}$/;   // 5h: a library effect, a row on a character's list
var FX_OPS = Object.freeze({ add: 1, adhoc: 1, on: 1, remove: 1, timer: 1 });   // timer (turn-based combat T5b): pause, resume, reset or dismiss a row's countdown
var FX_TIMER_ACTS = Object.freeze({ pause: 1, resume: 1, reset: 1, dismiss: 1 });
function validPageId(id) { return typeof id === 'string' && PAGE_ID.test(id) && !(id in Object.prototype); }
var FIELD_ID = /^f_[A-Za-z0-9_]{1,24}$/, ROLL_ID = /^r_[A-Za-z0-9_]{1,24}$/, SECTION_ID = /^s_[A-Za-z0-9_]{1,24}$/, TAB_ID = /^t_[A-Za-z0-9_]{1,24}$/, CHAR_ID = /^c_[A-Za-z0-9_]{1,24}$/, ITEM_ID = /^i_[A-Za-z0-9_]{1,24}$/, RID_RE = /^[A-Za-z0-9_-]{1,24}$/;
var SHAPES = Object.freeze({ circle: 1 }), BLAST_AUTO = Object.freeze({ full: 1, roll: 1, measure: 1 });
// Stage 6 F4a: a carried row's id (w_…; a legacy {defId, qty} row's is derived from its item) and the row ops a change may carry
var ROW_ID = /^w_[A-Za-z0-9_]{1,24}$/, ROW_OPS = Object.freeze({ add: 1, remove: 1, setQty: 1, keep: 1, undo: 1, set: 1, ov: 1, custom: 1, load: 1, restore: 1, chamber: 1, unchamber: 1, split: 1 });   // 1.5.9 Chambers from: chamber, one unit of a round into a row's chamber; unchamber, the last one in back to its list   // restore (1.5.8): a removed row put back whole at its place (its Undo)   // undo (Stage 6): a pickup taken back; set (F4b): a row's facts; ov (F4c2): a copy's own values; custom (F4c3): a character's own row, made or changed
var CHAMBER_CAP = 8;   // 1.5.9 Chambers from: the most rounds a chamber holds
// Stage 6 F4b: an item's key in formulas (F5a: Skills.<Key>.lvl) — never a row word, which a row's own names use
var ITEM_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/, ROW_WORDS = Object.freeze({ count: 1, qty: 1, on: 1, has: 1, lvl: 1, paid: 1, row: 1, opened: 1, loaded: 1, loadmax: 1, once: 1, oncecost: 1, oncefree: 1, chambered: 1, setall: 1, parts: 1, again: 1, needsmet: 1, made: 1, startlvl: 1 });   // 1.6.0 (v2, B5): made, 1 for a row added while its character was in the making
// 1.6.0 (the owner, 2026-10-29: "this is additive functionality, we arent removing usable features that other campaign systems can utilize"): a row word
// added after systems were built takes no key away from them. A list that keys a stat or a column so keeps it, and its formulas read that stat or
// column under the name (the validator finds the stat first); the row word answers only in a list with none of that key
var ROW_SOFT = Object.freeze({ made: 1, startlvl: 1 });   // 1.6.0: startlvl, the level a row started at (Keeps the starting level)
function listKeyed(spec, l) { var has = function(a) { return Array.isArray(a) && a.some(function(s) { return isObj(s) && typeof s.key === 'string' && s.key.toLowerCase() === l; }); }; return isObj(spec) && (has(spec.stats) || has(spec.cols)); }   // 1.6.0 R14 Parts from: parts, how many parts a row holds   // 1.6.0 R15 Sets by: setall, 1 while the row's whole set is on   // 1.5.9 Chambers from: chambered, how many rounds a row holds   // 1.5.8 Loads from: loaded, a row that holds a loaded copy; loadmax, that copy's full level   // 1.5.8: opened, a row another row opens (openSync)   // 1.5.8 Counted once: once, oncecost, oncefree
// 1.5.4: the words a list's names put between the list and what they read — List.on.Wt (the rows switched on), List.max.Parry and List.min.Wt
// (the highest and the lowest one row gives), List.on.max.Parry — so never an item's key or a stat's: List.<word>.<name> never reads a row by its key.
// max and min were refused as keys already (a reserved suffix, a function's name); they are named here so that stays so whatever those lists hold
var LIST_WORDS = Object.freeze({ on: 1, max: 1, min: 1 });
// Stage 6 F4c1: a list's stat key (F5a reads Row.<key>) — never an Object.prototype name in either case (the wire's packer refuses one, and the
// engine takes Row.toString as a name) or BYTES_PER_ELEMENT (the packer sends an object holding it as an empty typed array: every stat of that
// item gone for players), a row word, a reserved suffix (base is refused: his Advantages use cpBase) or a function name; with the
// engine, one a formula can address. A stat's value: a number (never a numeric string), within 1e9 either way (0.0001 lb, -0.5, 99,999,999)
var STAT_KEY = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
function statKey(k, F) { if (typeof k !== 'string' || !STAT_KEY.test(k)) return ''; var l = lower(k); if ((k in Object.prototype) || (l in Object.prototype) || (ROW_WORDS[l] && !ROW_SOFT[l]) || LIST_WORDS[l] === 1 || RESERVED_SUFFIX[l] || FUNC_NAMES[l] || l === 'bytes_per_element') return ''; return F && F.parse && !validKey('Row.' + k, F) ? '' : k; }
function statNum(x) { return typeof x === 'number' && fin(x) && Math.abs(x) <= LIMITS.statAbs ? x : undefined; }
// Stage 6: what a player's removal of an item does. bound: it stays (only the GM removes it); curse (on contact): it leaves their sheet and
// the GM keeps it on the character, out of their sight, until the GM removes it. Absent: an ordinary removal. The GM's secret: never in the
// players' view, so every item looks and behaves the same on a player's sheet until they try.
var RM_MODES = Object.freeze({ bound: 1, curse: 1 });
// Stage 6 F4c2: a copy's own removal or switch lock (ov.rm, ov.eq) — a mode, or none: this copy is free whatever the library says. Always tested === 1
var OV_LOCK = Object.freeze({ bound: 1, curse: 1, none: 1 });
var GROUP_ID = /^g_[A-Za-z0-9_]{1,24}$/;   // Stage 6 look fold: a band group
var CTRL_RE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');
var CTRL_RE_G = new RegExp(CTRL_RE.source, 'g');   // for replace(): every control character, not just the first
var CTRL_KEEP_NL = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(8) + String.fromCharCode(11) + String.fromCharCode(12) + String.fromCharCode(14) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g');
var PATH_RE = /^[/]saves[/]images[/][^?#]{1,300}$/;
var DENY = Object.freeze({ money: 1, change: 1, max: 1, off: 1, slow: 1, owner: 1, field: 1, value: 1, missing: 1, paused: 1, stays: 1, none: 1, error: 1, making: 1, budget: 1, needs: 1, stale: 1, style: 1 });   // making (Onboarding F3): a character in the making does not act at the table yet   // none, error (Stage 6 HUD H7): an apply action with nothing to apply, or an amount that could not be worked out (its message rides along)   // stays (Stage 6): a bound item did not come off

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function str(v, cap) { return typeof v === 'string' ? v.slice(0, cap) : ''; }
// Stage 5g: a short label cut by code points — control characters become rep, a lone surrogate is dropped (never half an emoji)
function cutPoints(v, cap, rep) { if (typeof v !== 'string') return ''; return Array.from(v.slice(0, 256).replace(CTRL_RE_G, rep).trim()).filter(function(ch) { return !/^[\uD800-\uDFFF]$/.test(ch); }).slice(0, cap).join('').trim(); }
// Stage 6 look fold (L2): the bundled icons — the name after "icon:" → its file under assets/icons/fa/ (no extension). The ONLY names a sheet
// may carry and the ONLY paths the renderer builds (a prototype-free table: "constructor" and "__proto__" never match). A fixed, licensed
// list: a new one needs its file, an entry here and the bundled-files test.
var GLYPHS = Object.freeze(Object.assign(Object.create(null), {
    'anchor': 'solid/anchor', 'arrow-left': 'solid/arrow-left', 'arrow-right': 'solid/arrow-right', 'arrows-left-right': 'solid/arrows-left-right', 'arrows-rotate': 'solid/arrows-rotate', 'ban': 'solid/ban',
    'bars': 'solid/bars', 'battery-full': 'solid/battery-full', 'battery-half': 'solid/battery-half', 'bed': 'solid/bed', 'bell': 'solid/bell', 'bolt': 'solid/bolt',
    'bomb': 'solid/bomb', 'book': 'solid/book', 'book-atlas': 'solid/book-atlas', 'book-open': 'solid/book-open', 'book-skull': 'solid/book-skull', 'box': 'solid/box',
    'box-archive': 'solid/box-archive', 'box-open': 'solid/box-open', 'brain': 'solid/brain', 'broom': 'solid/broom', 'bullseye': 'solid/bullseye', 'burst': 'solid/burst',
    'calculator': 'solid/calculator', 'campground': 'solid/campground', 'car': 'solid/car', 'check': 'solid/check', 'chevron-down': 'solid/chevron-down', 'chevron-right': 'solid/chevron-right',
    'chevron-up': 'solid/chevron-up', 'circle': 'regular/circle', 'circle-arrow-up': 'solid/circle-arrow-up', 'circle-check': 'solid/circle-check', 'circle-dot': 'regular/circle-dot', 'circle-exclamation': 'solid/circle-exclamation',
    'circle-info': 'solid/circle-info', 'circle-minus': 'solid/circle-minus', 'circle-plus': 'solid/circle-plus', 'circle-user': 'solid/circle-user', 'circle-xmark': 'solid/circle-xmark', 'clock': 'regular/clock',
    'clock-rotate-left': 'solid/clock-rotate-left', 'cloud-arrow-down': 'solid/cloud-arrow-down', 'code': 'solid/code', 'code-fork': 'solid/code-fork', 'coins': 'solid/coins', 'comment': 'solid/comment',
    'compass': 'solid/compass', 'compress': 'solid/compress', 'copy': 'regular/copy', 'credit-card': 'solid/credit-card', 'crosshairs': 'solid/crosshairs', 'crown': 'solid/crown',
    'database': 'solid/database', 'diagram-project': 'solid/diagram-project', 'dice': 'solid/dice', 'dice-d20': 'solid/dice-d20', 'dice-d6': 'solid/dice-d6', 'dizzy': 'solid/dizzy',
    'download': 'solid/download', 'dragon': 'solid/dragon', 'droplet': 'solid/droplet', 'dungeon': 'solid/dungeon', 'ellipsis-vertical': 'solid/ellipsis-vertical', 'envelope': 'regular/envelope',
    'eraser': 'solid/eraser', 'expand': 'solid/expand', 'eye': 'solid/eye', 'feather-pointed': 'solid/feather-pointed', 'file-code': 'solid/file-code', 'file-import': 'solid/file-import',
    'file-magnifying-glass': 'solid/file-magnifying-glass', 'fire': 'solid/fire', 'flask': 'solid/flask', 'floppy-disk': 'solid/floppy-disk', 'forward-step': 'solid/forward-step', 'gear': 'solid/gear',
    'gem': 'solid/gem', 'glasses': 'solid/glasses', 'globe': 'solid/globe', 'graduation-cap': 'solid/graduation-cap', 'hammer': 'solid/hammer', 'hand': 'solid/hand',
    'hand-fist': 'solid/hand-fist', 'hand-sparkles': 'solid/hand-sparkles', 'hat-wizard': 'solid/hat-wizard', 'heart': 'solid/heart', 'heart-pulse': 'solid/heart-pulse', 'helmet-safety': 'solid/helmet-safety',
    'hourglass-half': 'solid/hourglass-half', 'house': 'solid/house', 'khanda': 'solid/khanda', 'layer-group': 'solid/layer-group', 'leaf': 'solid/leaf', 'link': 'solid/link',
    'list': 'solid/list', 'list-check': 'solid/list-check', 'lock': 'solid/lock', 'lock-open': 'solid/lock-open', 'magnifying-glass': 'solid/magnifying-glass', 'masks-theater': 'solid/masks-theater',
    'microchip': 'solid/microchip', 'minus': 'solid/minus', 'minus-circle': 'solid/minus-circle', 'moon': 'solid/moon', 'paw': 'solid/paw', 'pen': 'solid/pen',
    'pencil': 'solid/pencil', 'person-running': 'solid/person-running', 'person-walking': 'solid/person-walking', 'play': 'solid/play', 'plug-circle-xmark': 'solid/plug-circle-xmark', 'plus': 'solid/plus',
    'right-from-bracket': 'solid/right-from-bracket', 'right-to-bracket': 'solid/right-to-bracket', 'ring': 'solid/ring', 'robot': 'solid/robot', 'rocket': 'solid/rocket', 'rotate-left': 'solid/rotate-left',
    'ruler': 'solid/ruler', 'scale-balanced': 'solid/scale-balanced', 'scissors': 'solid/scissors', 'scroll': 'solid/scroll', 'shield': 'solid/shield', 'shield-halved': 'solid/shield-halved',
    'shield-heart': 'solid/shield-heart', 'shield-virus': 'solid/shield-virus', 'ship': 'solid/ship', 'shirt': 'solid/shirt', 'shoe-prints': 'solid/shoe-prints', 'skull': 'solid/skull',
    'skull-crossbones': 'solid/skull-crossbones', 'sliders': 'solid/sliders', 'spinner': 'solid/spinner', 'square': 'regular/square', 'star': 'solid/star', 'stethoscope': 'solid/stethoscope',
    'stopwatch': 'solid/stopwatch', 'sun': 'solid/sun', 'table-list': 'solid/table-list', 'temperature-half': 'solid/temperature-half', 'thumbtack': 'solid/thumbtack', 'thumbtack-slash': 'solid/thumbtack-slash',
    'trash': 'solid/trash', 'trash-can': 'solid/trash-can', 'triangle-exclamation': 'solid/triangle-exclamation', 'truck': 'solid/truck', 'turn-down': 'solid/turn-down', 'up-right-from-square': 'solid/up-right-from-square',
    'upload': 'solid/upload', 'user': 'solid/user', 'volume-high': 'solid/volume-high', 'wallet': 'solid/wallet', 'wand-magic-sparkles': 'solid/wand-magic-sparkles', 'wand-sparkles': 'solid/wand-sparkles',
    'wave-square': 'solid/wave-square', 'weight-hanging': 'solid/weight-hanging', 'wind': 'solid/wind', 'wrench': 'solid/wrench', 'xmark': 'solid/xmark'
}));
function glyphPath(v) { if (typeof v !== 'string') return ''; var m = /^icon:([a-z0-9-]{1,40})$/.exec(v); return m && typeof GLYPHS[m[1]] === 'string' ? GLYPHS[m[1]] : ''; }
// An icon (a tab, a section, a pool, an effect, an item, a roll): a bundled glyph as "icon:<name>", or an emoji or a symbol (at most 8 code
// points, never half a surrogate pair); '' when none. An "icon:" name that is not bundled is dropped, never kept as text.
function cleanIcon(v) {
    if (typeof v === 'string') { var t = v.slice(0, 256).replace(CTRL_RE_G, '').trim(); if (/^icon:/i.test(t)) { t = t.toLowerCase(); return glyphPath(t) ? t : ''; } }
    return cutPoints(v, LIMITS.icon, '');
}
var TONES = Object.freeze({ good: 1, warn: 1, danger: 1, accent: 1, primary: 1 });   // Stage 6 look fold (L7): a value name's colour on a badge (one vocabulary with the palette keys)
var APPLY_KINDS = Object.freeze({ resource: 1, number: 1, toggle: 1 });   // 1.5.7: and a toggle (on above 0, off at 0 or below), so a roll can switch one on (the owner: a successful Meditation roll enters the trance)   // Stage 6 HUD H7: what an apply action moves (a pool's current value, a number's stored value)
var ROLL_TONES = Object.freeze({ primary: 1, danger: 1, neutral: 1, outline: 1 });   // Stage 6 look fold: a roll button's tone (filled, red, grey, outline)
function fin(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e15; }   // bounded: the wire's packer refuses a whole number past 64 bits (1e20 typed into a field once stopped every join)
function map() { return Object.create(null); }
var PID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;   // a player's profile id (net.js validProfileId)
function lower(s) { return String(s).toLowerCase(); }
function uid(prefix) { return prefix + Math.random().toString(36).slice(2, 10); }
function emptySystem() { return { v: 1, name: '', preset: '', updated: 0, fields: [], rolls: [], items: [], combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', cover: { on: false, style: 'graded' } }, sheet: { sections: [] } }; }

/* ---------- keys and formulas ---------- */
// A key is exactly one name to the engine: parse(key) must give a bare name node (that tracks every lexer decision —
// reserved words, function names, d6 / dF / d% / d( are all refused by the engine itself); the dotted suffixes
// .max .ranks .cur .base are ours.
function validKey(key, F) {
    if (typeof key !== 'string' || !key || key.length > LIMITS.key || /[ ]/.test(key) || CTRL_RE.test(key)) return false;
    var p = F && F.parse ? F.parse(key) : null;
    if (!p || !p.ok || !p.ast || !p.ast.body || p.ast.body.t !== 'name' || p.ast.body.paren) return false;
    var segs = key.split('.');
    if (segs.length > 1 && RESERVED_SUFFIX[lower(segs[segs.length - 1])]) return false;
    if (FUNC_NAMES[lower(key)]) return false;   // a function name lexes as a name when no "(" follows; never a key
    return true;
}
function cleanFormulaText(s) {
    if (typeof s !== 'string') return null;
    s = s.trim();
    if (!s || s.length > LIMITS.formula || CTRL_RE.test(s)) return null;
    return s;
}
function hasDice(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.t === 'dice') return true;
    var keys = Object.keys(node);
    for (var i = 0; i < keys.length; i++) { var v = node[keys[i]]; if (v && typeof v === 'object' && hasDice(v)) return true; }
    return false;
}
function editDistance(a, b) {
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev.push(j);
    for (i = 1; i <= m; i++) { cur = [i]; for (j = 1; j <= n; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))); prev = cur; }
    return prev[n];
}
function suggest(name, keys) {
    var best = null, bd = 3, l = lower(name);
    if (l.length > 64) return null;
    for (var i = 0; i < keys.length && i < 5000; i++) { var k = keys[i]; if (Math.abs(k.length - l.length) > 2) continue; var d = editDistance(l, lower(k)); if (d < bd) { bd = d; best = k; } }
    return best;
}

/* ---------- cleaners ---------- */
function cleanNum(v, dflt) { v = Number(v); return fin(v) ? v : dflt; }
// 1.5.4, a field's display unit (the website's v1.0.4; the owner, 2026-10-17: "my system should match the site while letting the user pick
// metric or imperial"). A field keeps its unit as the words shown after its value (Stage 5g). Where those words are a measure of the book's
// own, the sheet also shows the figure in metric while the viewer's Measurement system is Metric: "7 yd (6.4 m)", "32 lbs (14.5 kg)". The
// measures are yd, ft, in, lb and mi, and lbs and yds as the website writes them. A text field may carry the unit height and is read as a
// height: the website's pair "6'7\" / 2.00 m" by the half of the viewer's setting. DISPLAY ONLY: a field holds its figure in the book's unit,
// and nothing here reaches a formula, a roll, a stored value or a file. A field with no such unit is drawn exactly as before. Both views alike.
// The gaps the review of that fold found, closed as options of the builder (the owner, 2026-10-17: "match the website"): a speed, yd/s, which
// is Move's yards a second and metres a second in metric; a text field's unit weight, read as the website's showWeightText reads one; how a
// measure reads under Metric (unitShow: beside its figure as before, swap for the metric figure in its place, bare for the book's figure with
// no word under Imperial, as the website shows a Move); a field's decimals and thousands (decMin, decMax, group: Basic Lift 32.0 lbs, a total
// 1,234.57 lbs); a caption's {formula|unit}; and a list stat's or column's unit, converted as a field's is
var FIELD_MEASURE = Object.freeze(Object.assign(Object.create(null), { yd: 'yd', yds: 'yd', ft: 'ft', 'in': 'in', lb: 'lb', lbs: 'lb', mi: 'mi', 'yd/s': 'yd/s' }));
// A measure in metric: what one of it is, and the metric word (the exact international definitions, as the website's display-units.ts)
var MEASURES = Object.freeze(Object.assign(Object.create(null), { yd: Object.freeze({ per: 0.9144, word: 'm' }), ft: Object.freeze({ per: 0.3048, word: 'm' }), 'in': Object.freeze({ per: 2.54, word: 'cm' }), lb: Object.freeze({ per: 0.45359237, word: 'kg' }), mi: Object.freeze({ per: 1.609344, word: 'km' }), 'yd/s': Object.freeze({ per: 0.9144, word: 'm/s' }) }));
var MEASURE_KINDS = Object.freeze(Object.assign(Object.create(null), { number: 1, formula: 1, skill: 1, resource: 1 }));
// A field's display unit, by its unit's words and its kind: yd, ft, in, lb, mi or yd/s for a number, a formula, a skill or a pool; height or
// weight for a text field; '' for anything else (a unit such as pts is shown as it is, in both settings)
function cleanFieldUnit(v, kind) {
    if (typeof v !== 'string' || typeof kind !== 'string') return '';
    if (kind === 'text') return v === 'height' || v === 'weight' ? v : '';
    return MEASURE_KINDS[kind] === 1 && Object.prototype.hasOwnProperty.call(FIELD_MEASURE, v) ? FIELD_MEASURE[v] : '';
}
// The sheet's text of a figure with its thousands grouped by commas read as the figure it is ("1,234.57"); any other text as it is
var GROUPED = /^([-+\u2212]?)(\d{1,3}(?:,\d{3})+)(\.\d+)?$/;
function shownPlain(shown) { var s = typeof shown === 'string' && shown.length <= 40 ? shown.trim() : '', g = GROUPED.exec(s); return g ? g[1] + g[2].replace(/,/g, '') + (g[3] || '') : s; }
// The decimals a number is written to (the website's decimalsShown): trailing zeros taken off, four at most, or max (a list's own most)
function decShown(n, max) { var t = Math.abs(n).toFixed(typeof max === 'number' ? max : 4).replace(/\.?0+$/, ''), dot = t.indexOf('.'); return dot < 0 ? 0 : t.length - dot - 1; }
// The decimals a figure shows: as the sheet wrote it (its own text, trailing zeros taken off), else as the number is written; four at most.
// fixed: the figure's own count of decimals, zeros and all (a field that shows a fixed count or a least count: 32.0 is one), six at most
function placesShown(shown, value, fixed) {
    var s = shownPlain(shown), m = /^[-+\u2212]?\d+(?:\.(\d+))?$/.exec(s);
    if (m) return m[1] ? (fixed === true ? Math.min(6, m[1].length) : Math.min(4, m[1].replace(/0+$/, '').length)) : 0;
    return decShown(value);
}
// A figure of a measure in metric, its number alone: to the decimals the website shows (display-units.ts): as many as the figure shows, one
// more where the metric unit is ten times the size (a metre is 3.28 ft), at least one for a whole figure (Move 5 is 4.6 m and Move 6 is
// 5.5 m), trailing zeros taken off, and never 0 for a figure that is not. It is the figure AS SHOWN that is turned, where the sheet's text of
// it reads as a number, since the website turns the figure it shows (the review of the v1.0.4 merge: a load of 1.86438 lb, shown as 1.86,
// read 0.85 kg, where 1.86 lb is 0.84 kg and the website says 0.84). '' for no measure or no number
function shownFig(shown) { var s = shownPlain(shown); return /^[-+\u2212]?\d+(?:\.\d+)?$/.test(s) ? Number(s.replace(/^\u2212/, '-')) : NaN; }   // the sheet's text of a figure as a number; NaN where it is none
// fmt (1.5.4, the field's decimals): fixed keeps the metric figure to the rule's decimals, zeros and all, as the website fixes a figure with a
// set count (Basic Lift 22.0 lbs is 10.0 kg); group groups its thousands by commas. upTo (a list's stat or column in one of the website's
// forms, listWords): the figure is the website's own of the number itself, to that many decimals at most, so the number is turned and never
// its text, as the website turns a row's weight (units.number). Absent, as before
function metricNum(unit, value, shown, fmt) {
    var m = typeof unit === 'string' && Object.prototype.hasOwnProperty.call(MEASURES, unit) ? MEASURES[unit] : null;
    if (!m || typeof value !== 'number' || !isFinite(value) || Math.abs(value) > 1e15) return '';
    var fixed = isObj(fmt) && fmt.fixed === true, raw = isObj(fmt) && typeof fmt.upTo === 'number', s = raw ? NaN : shownFig(shown), d = raw ? decShown(value, fmt.upTo) : placesShown(shown, value, fixed), up = Math.max(0, Math.round(Math.log10(1 / m.per))), dm = d + Math.max(up, d === 0 ? 1 : 0), v = (isFinite(s) ? s : value) * m.per;
    dm = decNonZero(v, dm);
    var t = v.toFixed(dm); if (!fixed && t.indexOf('.') >= 0) t = t.replace(/\.?0+$/, ''); if (/^-0(\.0*)?$/.test(t)) t = t.slice(1);
    return isObj(fmt) && fmt.group === true ? groupThousands(t) : t;
}
// A figure that is not zero is never shown as zero: the decimals its first digit needs, six at most (the website's decimalsForNonZero)
function decNonZero(v, d) { while (v !== 0 && d < 6 && Number(Math.abs(v).toFixed(d)) === 0) d++; return d; }
// A number's text to d decimals, trimmed where asked, never -0 (the website's numberText); a number's whole part grouped in thousands
function numFixed(v, d, trim) { var t = v.toFixed(d); if (trim && t.indexOf('.') >= 0) t = t.replace(/\.?0+$/, ''); return /^-0(\.0*)?$/.test(t) ? t.slice(1) : t; }
function groupThousands(t) { return String(t).replace(/^(-?)(\d+)/, function(x, sg, w) { return sg + w.replace(/\B(?=(\d{3})+$)/g, ','); }); }
// A field's decimals (1.5.4): { lo, hi }, the fewest and the most it shows, from decMin and decMax (whole numbers 0 to 5, as the cleaner keeps
// them; with only the fewest, at most two or that many), or null for a field that sets neither, which reads as it always did (fmtNum)
function fieldDec(f) {
    if (!isObj(f) || (typeof f.decMin !== 'number' && typeof f.decMax !== 'number')) return null;
    var lo = typeof f.decMin === 'number' ? f.decMin : 0, hi = typeof f.decMax === 'number' ? f.decMax : Math.max(2, lo);
    return { lo: lo, hi: Math.max(lo, hi) };
}
// A field's figure as the sheet writes it: to its most decimals, its trailing zeros taken off down to its fewest (32.0, 5.88, 9.8), its
// thousands grouped where it says so (1,234.57); a field that sets neither as fmtNum writes it. Display only: no formula reads it
function figText(f, v) {
    if (typeof v !== 'number' || !isFinite(v)) return fmtNum(v);
    var d = fieldDec(f), t = fmtNum(v);
    if (d && Math.abs(v) < 1e15) { t = v.toFixed(d.hi); if (d.hi > d.lo) t = t.replace(new RegExp('0{1,' + (d.hi - d.lo) + '}$'), '').replace(/\.$/, ''); if (/^-0(\.0*)?$/.test(t)) t = t.slice(1); }
    return isObj(f) && f.group === true ? groupThousands(t) : t;
}
// How a field's figure in metric is written: fixed where the field shows a least count or one count of decimals, grouped where it groups
function figFmt(f) { var d = fieldDec(f); return { fixed: !!d && (d.lo > 0 || d.lo === d.hi), group: isObj(f) && f.group === true }; }
function metricOf(unit, value, shown) { var n = metricNum(unit, value, shown); return n ? n + ' ' + MEASURES[unit].word : ''; }   // "6.4 m", or ''
// What a sheet draws after a field's unit for the viewer's setting: under Metric (only true counts) a measure's figure in metric, in brackets,
// " (6.4 m)"; a pool's two figures as one, " (4.6/9.1 m)"; else ''. value / shown: the figure drawn before the unit and its text. The words
// after a box the viewer types in: a box holds the book's figure, so this is its one form whatever the field's unitShow says
function unitTail(f, value, shown, metric, max, shownMax) {
    if (metric !== true || !isObj(f)) return '';
    var u = cleanFieldUnit(f.unit, f.kind); if (!u || u === 'height' || u === 'weight') return '';
    if (f.kind === 'resource') { var a = metricNum(u, value, shown), b = metricNum(u, max, shownMax); return a && b ? ' (' + a + '/' + b + ' ' + MEASURES[u].word + ')' : ''; }
    var t = metricOf(u, value, shown); return t ? ' (' + t + ')' : '';
}
// A figure READ with its unit, whole (1.5.4, the website's three forms of a measure). how: '' (as before) Imperial "7 yd", Metric "7 yd
// (6.4 m)", the metric figure beside the book's as the website writes a yard of the book's text; swap: Imperial "32 lbs", Metric "14.5 kg",
// the metric figure in its place as the website writes a weight; bare: Imperial "5", Metric "4.6 m/s", the book's figure alone and the
// metric one with its word, as the website writes a Move. A unit that is no measure reads "3 pts" in both, and no unit the figure alone.
// shown: the figure's text as the sheet writes it; kind: the field's kind (a stat or a column is a number); metric: true for Metric only;
// fmt: figFmt's. Plain text, for a text node
function measureWords(unit, how, kind, value, shown, metric, fmt) {
    var t = String(shown), u = typeof unit === 'string' ? unit : '', m = u ? cleanFieldUnit(u, kind) : '';
    if (!u) return t;
    if (!m || m === 'height' || m === 'weight') return t + ' ' + u;
    var hw = how === 'swap' || how === 'bare' ? how : '';
    if (metric !== true) return hw === 'bare' ? t : t + ' ' + u;
    var n = metricNum(m, value, shown, fmt);
    if (!n) return hw === 'bare' ? t : t + ' ' + u;
    return hw ? n + ' ' + MEASURES[m].word : t + ' ' + u + ' (' + n + ' ' + MEASURES[m].word + ')';
}
function unitWords(f, value, shown, metric) { return isObj(f) ? measureWords(f.unit, f.unitShow, f.kind, value, shown, metric, figFmt(f)) : String(shown); }
// A list's stat or column read in one of the website's forms (1.5.4: a measure Instead or Bare, or with its own most decimals): its figure as
// the website writes a row's figure, to four decimals or its own most, trailing zeros taken off and never 0 for a figure that is not (the
// website's number, upTo: a weapon's 18.675 lbs, an implant's 0.11438 lbs at five). Null for any other stat or column, which the sheet writes
// as it always did (statFmt), and for a figure that is no number
function listUp(x) { return typeof x.decMax === 'number' ? x.decMax : 4; }
function listFig(x, v) {
    if (!isObj(x) || typeof v !== 'number' || !isFinite(v) || Math.abs(v) > 1e15 || !cleanFieldUnit(x.unit, 'number')) return null;
    if (x.unitShow !== 'swap' && x.unitShow !== 'bare' && typeof x.decMax !== 'number') return null;
    return numFixed(v, decNonZero(v, decShown(v, listUp(x))), true);
}
// A list's stat or column with its unit, whole, for the setting, as unitWords reads a field: in a website form its own figure (listFig) and
// that number turned; else the sheet's figure (shown) as before. asShown (only true: a list's total under it) keeps the sheet's figure and
// turns it as shown, as the website turns a total it has rounded. Plain text, for a text node
function listWords(x, value, shown, metric, asShown) {
    if (!isObj(x)) return String(shown);
    var lf = asShown === true ? null : listFig(x, value);
    return lf === null ? measureWords(x.unit, x.unitShow, 'number', value, shown, metric) : measureWords(x.unit, x.unitShow, 'number', value, lf, metric, { upTo: listUp(x) });
}
// A unit's words as the cleaner keeps them (1.5.4): a field's and a list stat's cut by code points, a column's as its text is cut. The System
// editor reads a unit by this alone, so what it says Save does is what Save does
function unitOf(v, col) { return col === true ? cutText(v, LIMITS.unit) : cutPoints(v, LIMITS.unit, ' '); }
// The unit a column's head names: its words as written, or the metric word where the figures under it read in metric (swap and bare)
function unitHead(unit, how, metric) { var m = typeof unit === 'string' ? cleanFieldUnit(unit, 'number') : ''; return metric === true && m && (how === 'swap' || how === 'bare') ? MEASURES[m].word : (typeof unit === 'string' ? unit : ''); }
// A height or a weight written as text, read in ONE place as the website reads one (lib/display-units.ts readHeightText and readWeightText):
// the sheet's display of a height (heightWords) and an outside sheet reader (readerKit) both ask readMeasure. A half is folded
// (curly quote marks straight, lower case) and read by the forms of its kind: a height's feet from centimetres, metres, inches, or feet with
// inches; a weight's pounds from kilograms or pounds; a bare figure is the book's own unit, feet or pounds, with no unit said. Two halves are
// the book's pair, "6'7\" / 2.00 m" or the order a file before v1.0.4 may hold, "2.00 m / 6'7\"": each half says its unit, one of each system,
// and the pair is read by its imperial half. { v, metric, pair }: the figure read (feet or pounds), whether it is metric, and a pair's two
// halves as written, trimmed; null where nothing reads, a kind that is none, or a text that is no text
var M_PER_FT = 0.3048, KG_PER_LB = 0.45359237, MEASURE_NUM = '(\\d+(?:\\.\\d*)?|\\.\\d+)', MEASURE_BARE = new RegExp('^' + MEASURE_NUM + '$');
var MEASURE_BARE_PER = Object.freeze(Object.assign(Object.create(null), { height: M_PER_FT, weight: KG_PER_LB }));   // a bare TYPED figure under Metric: metres, kilograms
var MEASURE_FORMS = Object.freeze(Object.assign(Object.create(null), {
    height: [[new RegExp('^' + MEASURE_NUM + '\\s*(?:cm|centimet(?:re|er)s?)$'), function(n) { return n / 100 / M_PER_FT; }, true], [new RegExp('^' + MEASURE_NUM + '\\s*(?:m|metres?|meters?)$'), function(n) { return n / M_PER_FT; }, true],
        [new RegExp('^' + MEASURE_NUM + '\\s*(?:in|inch|inches|")$'), function(n) { return n / 12; }, false], [new RegExp('^' + MEASURE_NUM + "\\s*(?:'|ft|foot|feet)\\s*(?:" + MEASURE_NUM + '\\s*(?:in|inch|inches|")?)?$'), function(n, i) { return n + (i ? Number(i) / 12 : 0); }, false]],
    weight: [[new RegExp('^' + MEASURE_NUM + '\\s*(?:kg|kgs|kilograms?|kilos?)\\.?$'), function(n) { return n / KG_PER_LB; }, true], [new RegExp('^' + MEASURE_NUM + '\\s*(?:lb|lbs|pounds?)\\.?$'), function(n) { return n; }, false]]
}));
function tidyNum(t) { if (t.charAt(t.length - 1) === '.') t = t.slice(0, -1); return t.charAt(0) === '.' ? '0' + t : t; }   // a number as typed, its stray point taken off (the website's tidyNumber)
function measureHalf(text, forms, barePer) {   // one half: { v, metric, said, d, num } or null. barePer: a bare figure is metric, that many of the book's unit a metric one
    var t = String(text).replace(/[\u2018\u2019\u02bc\u2032]/g, "'").replace(/[\u201c\u201d\u2033]/g, '"').trim().toLowerCase(), m; if (!t) return null;
    for (var i = 0; i < forms.length; i++) if ((m = forms[i][0].exec(t))) return { v: forms[i][1](Number(m[1]), m[2]), metric: forms[i][2], said: true, d: decShown(Number(m[1])), num: tidyNum(m[1]) };
    return (m = MEASURE_BARE.exec(t)) ? { v: barePer ? Number(m[1]) / barePer : Number(m[1]), metric: !!barePer, said: false, d: decShown(Number(m[1])), num: tidyNum(m[1]) } : null;
}
// d (1.5.4): the decimals the half read was written to, as the website's decimalsShown counts them. bareMetric: only true reads a bare figure
// in the metric unit (metres, kilograms), as a box typed under Metric is read; a stored text's bare figure is the book's
function readMeasure(text, kind, bareMetric) {
    var forms = typeof kind === 'string' && Object.prototype.hasOwnProperty.call(MEASURE_FORMS, kind) ? MEASURE_FORMS[kind] : null, s = typeof text === 'string' ? text.trim() : '', bp = bareMetric === true && forms ? MEASURE_BARE_PER[kind] : 0;
    if (!forms || !s) return null;
    var h = s.split('/'), a, b;
    if (h.length === 2) {
        a = measureHalf(h[0], forms, bp); b = measureHalf(h[1], forms, bp);
        if (!a || !b || !a.said || !b.said || a.metric === b.metric) return null;
        return { v: (a.metric ? b : a).v, metric: false, pair: { metric: (a.metric ? h[0] : h[1]).trim(), imperial: (a.metric ? h[1] : h[0]).trim() }, d: (a.metric ? b : a).d };
    }
    if (h.length !== 1) return null;
    a = measureHalf(s, forms, bp); return a && isFinite(a.v) ? { v: a.v, metric: a.metric, pair: null, d: a.d } : null;
}
// The inches a height read so stands for, as the website's height rule works from them (handoffs (39) and (41)): an imperial height as written, a tenth kept
// ("5'6.9\"" is 66.9), a metric one to the nearest whole inch, a half rounding up ("2.00 m" is 79); the float's own noise taken off first
function measureInches(r) { var inches = Number((r.v * 12).toPrecision(12)); return r.metric ? Math.floor(inches + 0.5) : inches; }
// A height as the viewer's setting reads it (the website's showHeightText, display-units.ts): its pair, "6'7\" / 2.00 m" or "2.00 m / 6'7\"",
// by the half of that setting; a single height as written where it is in that setting, else converted: metres to the centimetre, or feet and
// inches to the nearest whole inch, a half rounding up. A text that is no height is shown as it is. A text of any length is read, as the
// website's showHeightText and a reader read it (the review of the v1.0.4 merge: a cap of 64 characters showed a pair padded past it whole,
// where both read its half): readMeasure is one pass, and a stored text is held to LIMITS.text
function heightWords(text, metric) {
    if (typeof text !== 'string') return text === undefined || text === null ? '' : String(text);
    var r = readMeasure(text, 'height'), want = metric === true; if (!r) return text;
    if (r.pair) return want ? r.pair.metric : r.pair.imperial;
    if (r.metric === want) return text.trim();
    if (want) return (r.v * M_PER_FT).toFixed(2) + ' m';
    var inch = measureInches(r);
    return Math.floor(inch / 12) + "'" + (inch % 12) + '"';
}
// A weight as the viewer's setting reads it (1.5.4, the website's showWeightText): its pair by the half of that setting; a single weight as
// written where it is in that setting, else converted: pounds to kilograms, its decimals the precision rule's and kept (169 lb is 76.7 kg), or
// kilograms to pounds to the decimals written (77 kg is 170 lb). A text that is no weight is shown as it is
function weightWords(text, metric) {
    if (typeof text !== 'string') return text === undefined || text === null ? '' : String(text);
    var r = readMeasure(text, 'weight'), want = metric === true; if (!r) return text;
    if (r.pair) return want ? r.pair.metric : r.pair.imperial;
    if (r.metric === want) return text.trim();
    if (want) { var kg = r.v * KG_PER_LB; return numFixed(kg, decNonZero(kg, r.d + (r.d === 0 ? 1 : 0)), false) + ' kg'; }
    return numFixed(r.v, decNonZero(r.v, r.d), true) + ' lb';
}
// A text field's measure (height or weight) as the viewer's setting reads it; any other text as it is
function textWords(f, text, metric) { var u = isObj(f) && f.kind === 'text' ? cleanFieldUnit(f.unit, 'text') : ''; return u === 'height' ? heightWords(text, metric) : u === 'weight' ? weightWords(text, metric) : text; }
// What the sheet stores for a height or a weight typed in its box (1.5.4, the website's storeHeightText and storeWeightText): a figure in the
// book's units as typed; a metric one as the book's pair, imperial half first and the metric half as typed, "2.00 m" stored 6'7" / 2.00 m and
// 77 typed under Metric 170 lb / 77 kg. A bare figure is in the viewer's unit (metric: only true is Metric). A text that is no figure, a pair,
// and a weight with a slash in it are stored as typed. This is the one way a typed figure is turned, and it writes the book's pair
function inchesWords(inches) { var tenths = Math.round(Number((Number(inches) * 10).toPrecision(12))), ft = Math.floor(tenths / 120); return ft + "'" + ((tenths - ft * 120) / 10) + '"'; }   // the website's inchesAsFeetAndInches
function measureStore(typed, kind, metric) {
    if (typeof typed !== 'string' || (kind !== 'height' && kind !== 'weight')) return typed;
    var want = metric === true, bp = want ? MEASURE_BARE_PER[kind] : 0;
    if (kind === 'height') {
        var r = readMeasure(typed, 'height', want); if (!r || r.pair || !r.metric) return typed;
        var hh = measureHalf(typed, MEASURE_FORMS.height, bp); if (!hh) return typed;
        return inchesWords(measureInches(r)) + ' / ' + (hh.said ? typed.trim() : hh.num + ' m');
    }
    var w = measureHalf(typed, MEASURE_FORMS.weight, bp);
    if (!w || !w.metric || typed.indexOf('/') >= 0) return typed;
    return numFixed(w.v, w.d, false) + ' lb / ' + (w.said ? typed.trim() : w.num + ' kg');
}
function cleanField(f, F, gmView) {
    if (!isObj(f) || typeof f.id !== 'string' || !FIELD_ID.test(f.id) || !KINDS[f.kind]) return null;
    if (!validKey(f.key, F)) return null;
    var vis = f.vis === 'gm' && f.kind !== 'effects' ? 'gm' : 'all';   // 5h: a Status effects list is always visible — GM-only is a property of an effect, never of the list (a hidden list moved the GM's numbers but not the owner's)
    if (!gmView && vis === 'gm') return null;
    var out = { id: f.id, key: f.key, label: str(f.label, LIMITS.label).replace(CTRL_RE_G, ' ').trim() || f.key, kind: f.kind, vis: vis, hover: f.hover === true };
    if (STORED[f.kind]) out.edit = f.edit === 'gm' ? 'gm' : 'owner';
    var k = f.kind;
    if (k === 'number' || k === 'skill') {
        if (fin(Number(f.min))) out.min = Number(f.min);
        if (fin(Number(f.max))) out.max = Number(f.max);
        if (out.min !== undefined && out.max !== undefined && out.min > out.max) out.max = out.min;
        var step = cleanNum(f.step, 1); out.step = step > 0 ? step : 1;
        out.def = clampNum(cleanNum(f.def, 0), out.min, out.max);
        if (k === 'skill') { var b = cleanFormulaText(f.base); out.base = b === null ? (f.base === null ? null : '') : b; }
    } else if (k === 'formula') {
        var fm = cleanFormulaText(f.formula); out.formula = fm === null ? (f.formula === null ? null : '') : fm;
    } else if (k === 'resource') {
        var mf = cleanFormulaText(f.maxFormula); out.maxFormula = mf === null ? (f.maxFormula === null ? null : '') : mf;
        out.min = fin(Number(f.min)) ? Number(f.min) : 0;
        out.def = f.def === 'max' ? 'max' : clampNum(cleanNum(f.def, 0), out.min, undefined);
    } else if (k === 'toggle') { out.def = f.def === true; }
    else if (k === 'text') { out.max = Math.max(1, Math.min(LIMITS.text, cleanNum(f.max, LIMITS.text) | 0)); out.def = str(f.def, out.max).replace(CTRL_RE_G, ''); }
    else if (k === 'notes') { /* no default, no cap below the limit */ }
    else if (k === 'select') {
        var seen = map(), opts = [];
        (Array.isArray(f.options) ? f.options : []).forEach(function(o) { if (typeof o !== 'string') return; o = o.slice(0, LIMITS.optionChars).replace(CTRL_RE_G, '').trim(); if (!o || seen[lower(o)] || opts.length >= LIMITS.options) return; seen[lower(o)] = 1; opts.push(o); });
        out.options = opts;
        out.def = typeof f.def === 'string' && opts.indexOf(f.def) >= 0 ? f.def : (opts[0] || '');
    }
    else if (k === 'item-list') { var tbl = cleanItemTable(f.table); if (tbl) out.table = tbl; var lsp = cleanListSpec(f.list, gmView, F); if (lsp) out.list = lsp; }   // Stage 4: optional rich table (columns/chips/footer); Stage 6 F4b: the list's options (F4c1: its stats, checked with the engine)
    if (typeof f.caption === 'string') { var cap = cutPoints(f.caption, LIMITS.caption, ' '); if (cap) out.caption = cap; }   // Stage 5g Fold B: a line under the field ({formula} values worked out when drawn)
    if (k === 'resource') {   // Stage 5g Fold B: a pool's icon, a fill-to-max button, and the bar (shown unless turned off)
        var poolIcon = cleanIcon(f.icon); if (poolIcon) out.icon = poolIcon;
        if (f.reset === true) out.reset = true;
        if (f.bar === false) out.bar = false;
        if (isObj(f.spill) && typeof f.spill.to === 'string' && FIELD_ID.test(f.spill.to) && f.spill.to !== f.id) {   // 1.6.0 Spills into: another pool (cleanSystem keeps it only where that pool is in the view), and from where (spillPast)
            var spo = { to: f.spill.to }; if (f.spill.at === 'neg') spo.at = 'neg'; else if (f.spill.at === 'f') { var spb = cleanFormulaText(f.spill.below); if (spb) { spo.at = 'f'; spo.below = spb; } }
            out.spill = spo;
        }
    }
    if (f.roll !== undefined) { var r = cleanFormulaText(f.roll); if (r) { out.roll = r; var rDie = cleanDie(f.rollDie); if (rDie) out.rollDie = rDie; } }   // 1.5.8: and the die its button wears, where the GM picked one
    if (f.tile === true && (k === 'number' || k === 'formula' || k === 'skill' || k === 'resource')) out.tile = true;   // Stage 3: render this numeric field as a stat tile
    if ((k === 'number' || k === 'formula' || k === 'skill' || k === 'resource') && typeof f.unit === 'string') { var un = unitOf(f.unit); if (un) out.unit = un; }   // Stage 5g: a unit after the value ("pts", "kg")
    else if (k === 'text' && cleanFieldUnit(f.unit, k)) out.unit = cleanFieldUnit(f.unit, k);   // 1.5.4: a text read as a height or a weight (the two units a text field takes)
    if ((k === 'number' || k === 'formula' || k === 'skill') && out.unit && cleanFieldUnit(out.unit, k) && (f.unitShow === 'swap' || f.unitShow === 'bare')) out.unitShow = f.unitShow;   // 1.5.4: how a measure reads under Metric (absent: beside its figure)
    if (k === 'number' || k === 'formula' || k === 'skill') { var dlo = decCount(f.decMin), dhi = decCount(f.decMax); if (dlo !== null) out.decMin = dlo; if (dhi !== null) out.decMax = dlo !== null && dhi < dlo ? dlo : dhi; if (f.group === true) out.group = true; }   // 1.5.4: the decimals a figure shows and its thousands (display only)
    if ((k === 'formula' || k === 'resource') && Object.prototype.hasOwnProperty.call(ROUNDS, f.round)) { out.round = f.round; var rto = Math.round(Number(f.roundTo)); if (rto >= 1 && rto <= ROUND_TO) out.roundTo = rto; if (f.round === 'from') out.roundAt = roundAtOf(f.roundAt); }   // clarity package: how its value is rounded (formulas, rolls and the sheet read it rounded)
    if ((k === 'number' || k === 'formula' || k === 'skill') && f.sign === true) out.sign = true;   // Stage 5g: colour the value by its sign (green above zero, red below)
    if ((k === 'number' || k === 'formula') && Array.isArray(f.labels)) {   // Stage 6: names for the values 0, 1, 2… — a number becomes a dropdown that stores the position, a formula shows the name for its value; formulas always read the number
        var lbs = cleanLabels(f.labels);
        if (lbs) { out.labels = lbs; if (k === 'number') { out.min = 0; out.max = lbs.length - 1; out.step = 1; out.def = clampNum(Math.round(out.def), 0, out.max); } }
    }
    if (k === 'formula' && f.badge === true) out.badge = true;   // Stage 6 look fold (L7): the value drawn as a pill
    if (k === 'formula' && out.labels) { var tones = cleanTones(f.tones, out.labels.length); if (tones) out.tones = tones; }   // L7: a colour per value name (parallel to labels)
    if (k === 'resource' && typeof f.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(f.color)) out.color = f.color.toLowerCase();   // L7: a pool's own colour (icon, bar, band value)
    if (out.color && f.colorBand === true) out.colorBand = true;   // 1.6.0: that colour on the pinned band alone, the pool plain in its own section
    if (k === 'number' && (f.slider === true || isObj(f.slider))) out.slider = cleanSlider(f.slider);   // Stage 5e: a gradient slider (end labels, track colours) — drawn once the field has a min and a max (the sheet checks), kept either way so nothing the GM set is lost on Save; a plain number everywhere else
    if (k !== 'formula' && typeof f.live === 'boolean') out.live = f.live;   // the sheet's lock (1.5.4): this field's own word on it — true: its control works on a locked sheet and in the HUD; false: it needs Edit sheet; absent: by its kind (sheets.js liveField). The same in both views
    if ((k === 'number' || k === 'skill') && f.counter === true && !out.labels && !out.slider) out.counter = true;   // HUD frame (HF4a, H8): a counter — minus and plus either side of the box (a named number is a dropdown and a slider a range, never a counter)
    return out;
}
// 1.5.4: a count of decimals a figure shows, a whole number 0 to 5 (rounded, held there; five, the website's most, for an implant's weight),
// or null for none set
function decCount(v) { return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(5, Math.round(v))) : null; }
// Clarity package: a formula field's rounding, picked from a list so a GM never writes the arithmetic. round: near (half up, as round()), down,
// up, or from (up only when what lies past the kept place is roundAt or more: a Dodge that drops its decimals unless they are .95 or more);
// roundTo: the decimals kept, 1 to ROUND_TO (absent: whole numbers). Worked in whole millionths of the kept place, so a figure the computer
// holds as 8.9499999… rounds as the 8.95 it was written as (mod(x, 1) >= 0.95 in a formula misses it); a value that is no number passes as it is
var ROUNDS = Object.freeze({ near: 1, down: 1, up: 1, from: 1 });
var ROUND_TO = 3;
function roundAtOf(v) { var n = Math.round(Number(v) * 100) / 100; return isFinite(n) && n > 0 ? Math.min(0.99, Math.max(0.01, n)) : 0.5; }   // a from's point, 0.01 to 0.99 in hundredths; none: 0.5 (as near)
function roundBy(v, how, to, at) {
    if (typeof v !== 'number' || !isFinite(v) || !Object.prototype.hasOwnProperty.call(ROUNDS, how)) return v;
    var p = Math.pow(10, to >= 1 && to <= ROUND_TO ? Math.round(to) : 0), x = v * p;
    if (Math.abs(x) > 1e9) return (how === 'down' ? Math.floor(x) : how === 'up' ? Math.ceil(x) : Math.round(x)) / p;   // past a billion the millionths would not fit a double: the figure has no stray decimals to fear
    var n = Math.round(x * 1e6), lo = Math.floor(n / 1e6), past = n - lo * 1e6;
    var r = how === 'down' ? lo : how === 'up' ? (past > 0 ? lo + 1 : lo) : past >= (how === 'near' ? 500000 : Math.round(roundAtOf(at) * 1e6)) ? lo + 1 : lo;
    return r / p;
}
// ... and in words, for the value's tooltip on the sheet: what it worked out to and how it was rounded, as "7.95, rounded up from .95"
// (raw: the resolver's unrounded figure, to four decimals at most); '' when the field rounds nothing
var ROUND_PLACE = ['', ' to tenths', ' to hundredths', ' to thousandths'];
function roundSays(f, raw) {
    if (!f || !Object.prototype.hasOwnProperty.call(ROUNDS, f.round) || typeof raw !== 'number' || !isFinite(raw)) return '';
    var to = f.roundTo >= 1 && f.roundTo <= ROUND_TO ? Math.round(f.roundTo) : 0, now = roundBy(raw, f.round, to, f.roundAt), place = ROUND_PLACE[to];
    var was = String(Number(raw.toFixed(4))), at = String(roundAtOf(f.roundAt)).replace(/^0(?=\.)/, '');
    if (f.round === 'from') return was + (now > raw ? ', rounded up' + place + ' from ' + at : ', rounded down' + place + ', below ' + at);
    return was + ', rounded' + (f.round === 'down' ? ' down' : f.round === 'up' ? ' up' : '') + place;
}
// L7: tones run parallel to a formula's value names — '' or one of TONES each, at most one per name, trailing blanks trimmed; null when all blank
function cleanTones(v, n) {
    if (!Array.isArray(v)) return null;
    var out = v.slice(0, n).map(function(t) { return typeof t === 'string' && Object.prototype.hasOwnProperty.call(TONES, t) ? t : ''; });
    while (out.length && !out[out.length - 1]) out.pop();
    return out.length ? out : null;
}
// L7: the tone of a formula's worked-out value — its value name's colour, '' when there is none (an error, no name, an unknown tone)
function valueTone(f, e) {
    if (!f || !Array.isArray(f.tones) || !e || e.error || !e.label || typeof e.value !== 'number') return '';
    var i = e.value;
    return (i === Math.floor(i) && i >= 0 && i < f.tones.length && typeof f.tones[i] === 'string' && Object.prototype.hasOwnProperty.call(TONES, f.tones[i])) ? f.tones[i] : '';
}
function clampNum(v, lo, hi) { if (lo !== undefined && v < lo) v = lo; if (hi !== undefined && v > hi) v = hi; return v; }
// Stage 6: a field's value names — at most LIMITS.labels, each a short plain label (a blank keeps its place and shows the number); null when none is set
function cleanLabels(v) {
    if (!Array.isArray(v)) return null;
    var out = v.slice(0, LIMITS.labels).map(function(s) { return typeof s === 'string' ? str(s, LIMITS.label).replace(CTRL_RE_G, ' ').replace(/,/g, ' ').replace(/\s{2,}/g, ' ').trim() : ''; });   // no commas: the editor separates names with them
    while (out.length && !out[out.length - 1]) out.pop();
    return out.some(function(s) { return !!s; }) ? out : null;
}
// Stage 5e: the slider's own bits — two end labels and two hex track colours, each optional; {} = a slider with the defaults
function cleanSlider(v) {
    var out = {}; if (!isObj(v)) return out;
    var HEX = /^#[0-9a-fA-F]{6}$/;
    ['low', 'high'].forEach(function(k) { if (typeof v[k] === 'string') { var t = str(v[k], LIMITS.label).replace(CTRL_RE_G, ' ').trim(); if (t) out[k] = t; } });
    ['lowColor', 'midColor', 'highColor'].forEach(function(k) { if (typeof v[k] === 'string' && HEX.test(v[k])) out[k] = v[k].toLowerCase(); });   // midColor (1.5.4): a third colour at the track's middle, as an alignment's grey
    return out;
}
// Stage 6 HUD H7: an apply action — a roll entry of a second kind: changes (a pool or a number moved by a formula, no dice) in place of a
// formula; never the initiative roll. A change: { f: fieldId, formula, add? }; each field once, LIMITS.applyChanges at most. An unfinished one (no field,
// no formula) is kept for the GM's editor, where the validator names it; the players' view drops the whole action (applyTargets)
function cleanApplyChanges(list, withWhen, withCounters) {   // withWhen (R1): a roll's consequences, each always / on success / on failure (a field once per when); withCounters (R2b): a list's — a change may move one of the row's counters ({ c: key })
    var out = [], seen = map();
    (Array.isArray(list) ? list : []).forEach(function(c) {
        if (out.length >= LIMITS.applyChanges || !isObj(c)) return;
        if (c.fire === true && withWhen && withCounters) { var fw = c.when === 'hit' || c.when === 'miss' || c.when === 'malf' || c.when === 'crit' || c.when === 'fumble' ? c.when : '', fk = 'fire|' + fw; if (seen[fk]) return; seen[fk] = 1; var fo = { fire: true }; if (fw) fo.when = fw; out.push(fo); return; }   // 1.5.9 Chambers from: a list roll's Then may fire the first chambered round (once per when)
        var whX = withWhen && (c.when === 'hit' || c.when === 'miss' || c.when === 'malf' || c.when === 'crit' || c.when === 'fumble') ? c.when : '';
        if (typeof c.fx === 'string') {   // 1.6.0: switch a library effect on (or off, on: false), once per effect and when; no amount
            if (!EFFECT_ID.test(c.fx)) return; var xk = 'fx:' + c.fx + '|' + whX; if (seen[xk]) return; seen[xk] = 1;
            var xo = { fx: c.fx, on: c.on !== false }; if (whX) xo.when = whX; out.push(xo); return;
        }
        if (withCounters && (c.q === true || typeof c.s === 'string')) {   // 1.6.0: a list's own row: its quantity (q), or one of its number stats (s), with an amount as a counter's
            var sq = c.q === true ? '' : STAT_KEY.test(c.s) ? c.s : null; if (sq === null) return; var qk = (c.q === true ? 'q' : 's:' + lower(sq)) + '|' + whX; if (seen[qk]) return; seen[qk] = 1;
            var qo = c.q === true ? { q: true, formula: cleanFormulaText(c.formula) || '' } : { s: sq, formula: cleanFormulaText(c.formula) || '' }; if (c.set === true) qo.set = true; else if (c.add === true) qo.add = true;
            if (whX) qo.when = whX; if (c.roll === true && qo.formula) qo.roll = true; out.push(qo); return;
        }
        var ck = withCounters && typeof c.c === 'string' && STAT_KEY.test(c.c) ? c.c : '', f = !ck && typeof c.f === 'string' && FIELD_ID.test(c.f) ? c.f : '', wh = withWhen && (c.when === 'hit' || c.when === 'miss' || c.when === 'malf' || c.when === 'crit' || c.when === 'fumble') ? c.when : '',   /* R3: on malfunction; 1.5.8: on a critical success or failure */ sk = (ck ? 'c:' + lower(ck) : f) + '|' + wh;
        if ((f || ck) && seen[sk]) return; if (f || ck) seen[sk] = 1;
        var o = ck ? { c: ck, formula: cleanFormulaText(c.formula) || '' } : { f: f, formula: cleanFormulaText(c.formula) || '' }; if (c.set === true) o.set = true; else if (c.add === true) o.add = true;   // Stage 6 HUD R1: Set to (the amount is the new value)
        if (wh) o.when = wh;
        if (c.roll === true && (f || ck) && o.formula) o.roll = true;   // 1.5.9 (book es/et plan, section 0): Rolled, its amount may roll dice, which only the host rolls (applyAct's D); only as true, only with a target and an amount
        out.push(o);
    });
    return out;
}
// 1.5.4 (SITE_EQUIVALENT_PLAN fold 2): what a system roll or apply action needs before it may be used, as a list roll's needs: a formula with
// no dice that must be true for the character, and the words its greyed button says. Kept as a list roll's are, the same in both views (the
// players' view drops one that names a GM-only value, as a list roll's: their presses are then not held back by it)
function rollNeedsInto(out, r) { var nd = cleanFormulaText(r.needs); if (!nd) return; out.needs = nd; var nt = cutText(r.needsText, LIMITS.label); if (nt) out.needsText = nt; }
// The one reading of those needs: true when the entry needs nothing; else whether its formula, worked out with the character's names (vars), is
// true, a number other than 0 or yes. No dice are rolled, and a formula that cannot be worked out holds it back, as a list roll's does. 1.5.5: more,
// where it is handed in, is asked for a second resolver only where the formula could not be worked out with vars, handed the reading that failed
// (null where it threw), and that one's reading is the answer (needsHeld: a lazy resolver first, then resolveAll's, as the run reads it where
// chainsShallow fails, and only for the engine's refusal of a chain past its depth); without it, exactly as before
function rollNeedsOk(entry, vars, F, more) {
    if (!isObj(entry) || typeof entry.needs !== 'string' || !entry.needs) return true;
    if (!F || typeof vars !== 'function') return false;
    var v = null; try { v = F.evaluate(entry.needs, { vars: vars, random: noDice }); } catch (e) { v = null; }
    if (!(v && v.ok) && typeof more === 'function') { var mv = null; try { mv = more(v); } catch (e) { mv = null; } if (typeof mv === 'function') { try { v = F.evaluate(entry.needs, { vars: mv, random: noDice }); } catch (e) { v = null; } } }
    return !!(v && v.ok && (v.value === true || (typeof v.value === 'number' && v.value !== 0)));
}
function rollNeedsSays(entry) { return (isObj(entry) && typeof entry.needsText === 'string' && entry.needsText) || ('Not now: it needs ' + (isObj(entry) ? entry.needs : '')); }   // the words a refusal says, as a list roll's
// 1.5.9 (docs/BOOK_ES_ET_PLAN.md section 3; the book: medical items are applied "to oneself or an adjacent ally"): a roll or an apply action, the
// system's or a list's, may carry to: 'near', Applies to: The user or an adjacent character. Only that word, the same in both views, never on the
// initiative roll; absent, the user as ever. Its formula, its needs and every amount are still worked out with the user's names; the changes that
// name a field land on the character it is used on, and a row's own counters and Fire stay on the user's row (applyAct's on). OnSelf reads 1
// when it is used on its user and 0 on another (withOnSelf), where the system has no field of that very key
function cleanApplyDef(r, vis, gmView) {
    var out = { id: r.id, label: str(r.label, LIMITS.label).replace(CTRL_RE_G, ' ').trim() || 'Apply', apply: cleanApplyChanges(r.apply), vis: vis };
    if (typeof r.tone === 'string' && Object.prototype.hasOwnProperty.call(ROLL_TONES, r.tone)) out.tone = r.tone;
    var aIcon = cleanIcon(r.icon); if (aIcon) out.icon = aIcon;
    var aCost = costKey(r.cost); if (aCost) out.cost = aCost;   // turn-based combat T1: the action one press costs
    rollNeedsInto(out, r);   // 1.5.4: what it needs before it may be pressed or run
    var ea = r.each === 'round' || r.each === 'turn' || r.each === 'turnEnd' ? r.each : r.round === true ? 'round' : '';   // 1.6.0: or at its turn's end   // Stage 6 HUD G10 + turn-based combat T2b: it also runs by itself on every new round of a combat, or when its character's turn begins (an older round: true reads as each round)
    if (ea) { out.each = ea; if (r.by === 'gm' || r.by === 'owner') out.by = r.by; }   // T2b: or it waits for the GM's or its player's press (a reminder card); absent: automatically
    var aEv = cleanEvery(r.every, out.needs); if (aEv) out.every = aEv;   // item 20 K5: it also runs by the campaign's clock (1.5.5: Only while its needs hold, beside its needs)
    fightRuleInto(out, r, gmView);   // backlog 152: and in a fight, and whether its runs wait for the GM's word
    if (gmView) { var crO = cleanCross(r.cross); if (crO) out.cross = crO; }   // 1.5.9 (book es/et plan 4a): it also runs when a value crosses a step; the GM's view alone, since only the machine that owns the campaign runs it
    if (r.to === 'near') out.to = 'near';   // 1.5.9 (book es/et plan, section 3): Applies to the user or an adjacent character, written last
    return out;
}
// 1.5.9 (docs/BOOK_ES_ET_PLAN.md 4a; the book (et): death checks at minus HP and each further multiple; (eu): "a death check is rolled EVERY time HP
// falls past -HP or a further multiple, even at a line already rolled; rising back above a line re-arms it"): a roll or an apply action that also
// runs when a value crosses a step. f: the pool or number it watches, as the sheet reads it; dir: down (falls to) or up (rises to); at: the first
// step, a formula of the character's names with no dice; step: how far apart the steps are, with count of them (2 to 20; absent, one step); one:
// once however many steps one change passes, only beside step; by: a reminder for its player or the GM, else it runs at once
function cleanCross(v) {
    if (!isObj(v) || typeof v.f !== 'string' || !FIELD_ID.test(v.f)) return null;
    var at = cleanFormulaText(v.at); if (!at) return null;
    var o = { f: v.f, dir: v.dir === 'up' ? 'up' : 'down', at: at }, st = cleanFormulaText(v.step);
    if (st) { o.step = st; var n = typeof v.count === 'number' && Math.floor(v.count) === v.count && v.count >= 2 && v.count <= 20 ? v.count : 0; if (n) o.count = n; if (v.one === true) o.one = true; }
    if (v.by === 'owner' || v.by === 'gm') o.by = v.by;
    return o;
}
// 1.6.0 (the campaign build: a per-period cost each time a counter the clock moves steps): a list's roll or action may watch one of the list's
// own counters on each row (ct, spelled as the list spells it), its steps read with that row's names. The rest as a field's crossing, but no
// reminder: it runs on the row, as the GM's own press. The GM's view alone, as a field's crossing is
function cleanRowCross(v, cts) {
    if (!isObj(v) || typeof v.ct !== 'string' || !Array.isArray(cts)) return null;
    var k = null; cts.forEach(function(c) { if (!k && isObj(c) && typeof c.key === 'string' && lower(c.key) === lower(v.ct)) k = c.key; }); if (!k) return null;
    var o = cleanCross(Object.assign({}, v, { f: 'f_ct' })); if (!o) return null; delete o.f; delete o.by;
    return Object.assign({ ct: k }, o);
}
// The one judge of a crossing, pure: the steps worked out with the character's names as they stand after the change, and the steps the value
// passed, by their number (1 the first), in the order passed: falling, from above a step to at or below it; rising, from below to at or above.
// So a fall past two steps at once crosses both, a value that goes back up and falls again crosses again, and a step that moves crosses nothing
function crossSteps(rule, vars, F) {
    var cr = isObj(rule) ? rule.cross : null, out = []; if (!isObj(cr) || !F || typeof F.evaluate !== 'function' || typeof vars !== 'function') return out;
    var ev = function(t) { var r = null; try { r = F.evaluate(t, { vars: vars, random: noDice }); } catch (e) { r = null; } return r && r.ok && typeof r.value === 'number' && isFinite(r.value) ? r.value : null; };
    var at = ev(cr.at); if (at === null) return out;
    var st = cr.step ? ev(cr.step) : null, n = typeof st === 'number' && st > 0 ? (cr.count || 1) : 1;
    for (var i = 0; i < n; i++) out.push(cr.dir === 'up' ? at + i * st : at - i * (st || 0));
    return out;
}
function crossings(rule, before, after, vars, F) {
    if (typeof before !== 'number' || typeof after !== 'number' || !isFinite(before) || !isFinite(after)) return [];
    var up = isObj(rule) && isObj(rule.cross) && rule.cross.dir === 'up', out = [];
    crossSteps(rule, vars, F).forEach(function(s, i) { if (up ? (before < s && after >= s) : (before > s && after <= s)) out.push(i + 1); });
    return out;
}
// Backlog 152 (the fight clock): a time rule's In a fight, written right after its By the clock, then its Ask me first (true only, only where one
// of the two is kept, and only in the GM's view: nothing on a player's app runs a rule). A rule with In a fight alone keeps no By the clock
function fightRuleInto(out, r, gmView) {
    var inF = cleanInFight(r.inFight, out.needs); if (inF) out.inFight = inF;
    if (r.ask === true && gmView && (out.every || out.inFight)) out.ask = true;
    if ((r.notes === 'panel' || r.notes === 'quiet') && gmView && (out.every || out.inFight)) out.notes = r.notes;   // 1.6.0, backlog 173: where its runs are said, Panel only or Panel only with its players never told (absent: in chat); the GM's view alone, as the host alone runs a rule
}
// Stage 6 HUD H7: each apply action's targets against this view's fields — the GM's: a change whose field is no longer a pool or a number
// (deleted, or its kind changed) keeps its amount and loses the field (the validator asks for one); the players': an action with any change
// unfinished or out of their view is dropped whole (half an action would mislead)
function applyTargets(out, fieldIds, gmView, fxSeen) {   // fxSeen (1.6.0): the effects this view holds, by id
    out.rolls.forEach(function(r) { if (isObj(r.cross) && fieldIds[r.cross.f] !== 'resource' && fieldIds[r.cross.f] !== 'number') delete r.cross; });   // 1.5.9 (book es/et plan 4a): a crossing watches a pool or a number of the system, else it goes
    var keep = function(r, spec) {   // spec (R2b): the list's options, for a change that moves one of its counters
        if (!gmView && spec && r.gm === true) return false;   // 1.6.0: a list's roll or action only the GM presses never reaches players, so their press of it names nothing their view holds and the host refuses it
        var fix = function(c) { var tC = null; if (c.c && spec && Array.isArray(spec.counters)) spec.counters.forEach(function(t) { if (!tC && isObj(t) && lower(t.key) === lower(c.c)) tC = t; }); if (tC) c.c = tC.key; var ok = c.c ? !!tC : (!c.f || APPLY_KINDS[fieldIds[c.f]] === 1); if (ok) return c; var o = { f: '', formula: c.formula }; if (c.set) o.set = true; else if (c.add) o.add = true; if (c.when) o.when = c.when; return o; };
        var stOk = function(k) { return !!spec && Array.isArray(spec.stats) && spec.stats.some(function(t) { return isObj(t) && t.kind !== 'pick' && typeof t.key === 'string' && lower(t.key) === lower(k); }); };   // 1.6.0: a row's own number stat
        var dn = function(c) { return c.fire === true || (typeof c.fx === 'string' && (gmView || (!!fxSeen && fxSeen[c.fx] === 1))) || ((!!c.f || !!c.c || c.q === true || (typeof c.s === 'string' && stOk(c.s))) && !!c.formula); };   // 1.5.9: fire has no amount; 1.6.0: nor a switched effect
        if (r.then) { r.then = r.then.map(fix); if (!gmView && !r.then.every(dn)) delete r.then; }   // R1: a roll's consequences, the same rules (players' view: all of them or none)
        if (!r.apply) return true;
        r.apply = r.apply.map(fix);
        return gmView || (r.apply.length > 0 && r.apply.every(dn));
    };
    out.rolls = out.rolls.filter(function(r) { return keep(r, null); });
    out.fields.forEach(function(f) {   // HUD H7b: a list's apply actions by the same rules; a list spec left with nothing goes (as a load would read it)
        if (f.kind !== 'item-list' || !isObj(f.list)) return;
        if (Array.isArray(f.list.rolls)) { f.list.rolls = f.list.rolls.filter(function(r) { return keep(r, f.list); }); if (!f.list.rolls.length) delete f.list.rolls; }
        if (!Object.keys(f.list).length) delete f.list;
    });
}
function cleanRollDef(r, gmView) {
    if (!isObj(r) || typeof r.id !== 'string' || !ROLL_ID.test(r.id)) return null;
    var vis = r.vis === 'gm' ? 'gm' : 'all';
    if (!gmView && vis === 'gm') return null;
    if (Array.isArray(r.apply)) return cleanApplyDef(r, vis, gmView);   // Stage 6 HUD H7: an apply action
    var fm = cleanFormulaText(r.formula); if (!fm) return null;
    var out = { id: r.id, label: str(r.label, LIMITS.label).replace(CTRL_RE_G, ' ').trim() || 'Roll', formula: fm, vis: vis };   // HUD frame (HF5a): every control character (the non-global pattern replaced only the first, and the dice path then refused the whole roll)
    if (r.init === true) out.init = true;
    if (r.dmg === true) { out.dmg = true; var rdt0 = cleanFormulaText(r.dtype); if (rdt0) out.dtype = rdt0; }   // chat cards (owner 2026-09-27): a damage roll — its card the damage colour, a larger total and a "damage" tag; 1.5.7: and the damage type it names
    if (typeof r.tone === 'string' && Object.prototype.hasOwnProperty.call(ROLL_TONES, r.tone)) out.tone = r.tone;   // Stage 6 look fold
    var rIcon = cleanIcon(r.icon); if (rIcon) out.icon = rIcon;
    var rDie2 = cleanDie(r.die); if (rDie2) out.die = rDie2;   // 1.5.8: the die its button wears, where the GM picked one (absent: its formula's)
    if (Array.isArray(r.then)) { var th = cleanApplyChanges(r.then, true); if (th.length) out.then = th; }   // Stage 6 HUD R1: its consequences on the character (after the roll)
    var rmf = cleanFormulaText(r.malf); if (rmf) out.malf = rmf;   // Stage 6 HUD R3: its malfunction threshold (a natural total at or past it)
    critRangeInto(out, r);   // 1.6.0: its own critical range, under criticals at fixed rolls
    var rbg = cleanFormulaText(r.bigAt); if (rbg) out.bigAt = rbg;   // 1.6.0 (the book's ruling of 2026-10-29): what lands as a Big Hit, no critical
    rollNeedsInto(out, r);   // 1.5.4: what it needs before it may be rolled
    var rCost = costKey(r.cost); if (rCost) out.cost = rCost;   // turn-based combat T1: the action it costs
    var rEa = r.each === 'round' || r.each === 'turn' || r.each === 'turnEnd' ? r.each : ''; if (rEa && out.init !== true && (r.by === 'gm' || r.by === 'owner')) { out.each = rEa; out.by = r.by; }   // 1.5.9 (book es/et plan 4b; the owner: "Reminder card"): a roll is also due each round or at its turn's start, as a reminder card with its roll button for the GM or its player; a roll never runs by itself, and the initiative roll never carries it
    var rEv = cleanEvery(r.every, out.needs); if (rEv) out.every = rEv;   // item 20 K5: it also runs by the campaign's clock (1.5.5: Only while its needs hold, beside its needs)
    fightRuleInto(out, r, gmView);   // backlog 152: and in a fight, and whether its runs wait for the GM's word
    if (gmView) { var crO = cleanCross(r.cross); if (crO) out.cross = crO; }   // 1.5.9 (book es/et plan 4a): it also runs when a value crosses a step; the GM's view alone, since only the machine that owns the campaign runs it
    if (r.to === 'near' && out.init !== true) out.to = 'near';   // 1.5.9 (book es/et plan, section 3): Applies to the user or an adjacent character; the initiative roll is always its own character's
    if (r.resist === true && out.init !== true) out.resist = true;   // 1.6.0 (the SotMW v2 sort, B2): Resists an attempt, so it reads AttemptMargin
    resistByInto(out, r, gmView);   // 1.6.0 (B2): and Resisted by, the roll its target resists it with
    return out;
}
// 1.6.0 (the SotMW v2 sort, B2: "resist at minus the attempt's margin"): a roll's Resisted by names a system roll ticked Resists an attempt. Where
// such a roll succeeds against the roller's target, the host posts that roll to the target's character as a reminder, and it reads the
// attempt's margin as AttemptMargin. The GM's view keeps the roll's id; a players' view says only that it is resisted (resisted: true), so
// their sheet names the entry and no id of a roll they may not see travels
function resistByInto(out, r, gmView) {
    if (!isObj(r)) return;
    if (gmView) { if (typeof r.resistBy === 'string' && ROLL_ID.test(r.resistBy)) out.resistBy = r.resistBy; }
    else if ((typeof r.resistBy === 'string' && ROLL_ID.test(r.resistBy)) || r.resisted === true) out.resisted = true;
}
// 1.6.0 (B2): the attempt's margin a resist roll reads as AttemptMargin, laid on its token context by the host (never a player's word)
function withAttempt(tctx, m) { return Object.assign({}, isObj(tctx) ? tctx : {}, { att: { m: fin(m) ? Math.max(-9999, Math.min(9999, m)) : 0 } }); }
// An item definition (camp.system.items). gmView false: a vis:'gm' item is dropped, and a visible item's
// formula/skill text (damage/cost/throwSkill) is stripped — the host resolves every roll, so players never
// need the formula, which also removes the GM-only-field-leak surface (cleanSystem's blanking is fields/rolls only).
// 126b, prerequisites (the owner, by prompt: "Both", the entries something needs by ticking and a formula for anything else; "the picker greys
// out what cannot be taken and says why; the host judges a player's pick"). These are the ticked ones: the entries a character must carry
// before it may take this one, each by its id and, where one is given, at a level at least. At most LIMITS.needs, an id once. names: true
// only for the needs on an owner's copy of a row, where each may carry the needed entry's name as text; a definition never keeps one
function cleanNeeds(v, names) {
    var out = [], seen = map();
    (Array.isArray(v) ? v : []).forEach(function(n) {
        if (out.length >= LIMITS.needs || !isObj(n) || typeof n.id !== 'string' || !ITEM_ID.test(n.id) || seen[n.id]) return;
        seen[n.id] = 1; var o = { id: n.id }, l = typeof n.lvl === 'number' ? lvlNum(n.lvl) : undefined; if (l !== undefined) o.lvl = l;
        var fr = typeof n.from === 'number' ? lvlNum(n.from) : undefined; if (fr !== undefined) o.from = fr;   // from: the level of the entry that needs it from which this need applies (a level's own prerequisite); with none it applies to taking the entry at all
        if (names === true && typeof n.name === 'string') { var nn = cutText(n.name, LIMITS.itemName); if (nn) o.name = nn; }
        out.push(o);
    });
    return out.length ? out : null;
}
// 126b, the rule (the owner: "Both", the entries something needs by ticking and a formula for anything else): a prerequisite written as a
// formula, which must be true for the character. No dice. '' when the text is no such formula
function needRule(text, F) { return budgetFormula(text, F); }
// A players' view of a definition never names an entry players cannot see (even that such an id exists is the GM's): a need of one is left
// out, and the view says that more is needed than it names (needsHid). shown(id): whether players may see that entry. With no judge every
// need is hidden. The rule is treated alike: ruleShown(text) says whether a player's own app could work it out, which it cannot when the
// rule reads a value players may not read, and with no judge it is hidden. The host asks this wherever it makes a players' view; a player's
// own app keeps what its host sent
function hideNeeds(def, shown, ruleShown) {
    if (!isObj(def) || (!Array.isArray(def.needs) && typeof def.needsIf !== 'string')) return def;
    var had = Array.isArray(def.needs) ? def.needs : [], keep = had.filter(function(n) { return typeof shown === 'function' && shown(n.id) === true; });
    var rule = typeof def.needsIf === 'string' ? def.needsIf : '', ruleOk = !!rule && typeof ruleShown === 'function' && ruleShown(rule) === true;
    var hid = def.needsHid === true || keep.length !== had.length || (!!rule && !ruleOk), msg = def.needsMsg;
    var from = def.needsFrom;
    delete def.needs; delete def.needsIf; delete def.needsFrom; delete def.needsHid; delete def.needsMsg;   // written again in the cleaner's own order, as the definition's last keys
    if (keep.length) def.needs = keep; if (ruleOk) { def.needsIf = rule; if (from !== undefined) def.needsFrom = from; } if (hid) def.needsHid = true; if (msg !== undefined) def.needsMsg = msg;   // a rule that is left out takes its level with it
    return def;
}
// Whether a rule holds for a character: worked out by the sheet's own resolver, with no dice, it gives true or a number other than 0. A rule
// that cannot be worked out does not hold. vars: a resolver already made for this character (a sheet that asks for many rows makes one)
function ruleTrue(sys, char, rule, F, vars) {
    if (typeof rule !== 'string' || !rule || !F || typeof F.evaluate !== 'function' || !isObj(sys) || !Array.isArray(sys.fields) || !isObj(char)) return false;
    var r = null; try { r = F.evaluate(rule, { vars: typeof vars === 'function' ? vars : makeResolver(sys, char, F, null), random: noDice }); } catch (e) { r = null; }
    if (!r || !r.ok) return false;
    return r.value === true || (typeof r.value === 'number' && fin(r.value) && r.value !== 0);
}
// The one judge of an entry's prerequisites for one character: each needed entry is carried on some list of the character, and where the need
// names a level and the row has one, at that level or above. A row hidden from its player (a kept curse) never counts, and neither does a
// row of the character's own. And the entry's rule, where it has one, holds. { ok, missing: the needs not met, and { rule: its text } where
// the rule does not hold }. def: the entry as the judge holds it (the host: whole; a player's app: what it may see). copy: true on a
// player's own app, whose copy of a library row is inline and names its entry as src. The host never says it: a row on the host names its
// entry itself, and a src that stands on one of its own rows (a file could write one) is not believed. F: the formula engine, for a rule
// (with none, a rule does not hold)
function needsMet(sys, char, def, copy, F, vars, lvl) {
    var out = { ok: true, missing: [] }; if (!isObj(def)) return out;
    // lvl: the level the row has, or would have. A need, or the rule, that begins at a level of this entry counts only once the row is at that level or above;
    // with no level told (a list whose rows have none, a picker that knows no row yet) it does not count
    var at = typeof lvl === 'number' && fin(lvl) ? lvl : null, due = function(from) { return typeof from !== 'number' || (at !== null && at >= from); };
    var nds = (Array.isArray(def.needs) ? def.needs : []).filter(function(n) { return isObj(n) && due(n.from); }), rule = typeof def.needsIf === 'string' && due(def.needsFrom) ? def.needsIf : '';
    if (!nds.length && !rule) return out;
    var have = map();   // id -> the highest level a carried row of it has; true where its list has no level
    if (nds.length) (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list') return;
        var rows = isObj(char) && isObj(char.values) && Array.isArray(char.values[f.id]) ? char.values[f.id] : [], lv = isObj(f.list) && isObj(f.list.lvl);
        rows.forEach(function(r) {
            var eid = isObj(r) ? (typeof r.defId === 'string' ? r.defId : copy === true && r.lnk === 1 && typeof r.src === 'string' ? r.src : null) : null;   // the host's row names its entry; an owner's inline copy names it as src, read only on the owner's own app
            if (!eid || r.hid === 1) return;
            var l = lv ? rowLvl(f.list, r, null) : true, h = have[eid];
            if (h === undefined || (typeof l === 'number' && (h === true || l > h))) have[eid] = l;
        });
    });
    nds.forEach(function(n) { if (!isObj(n)) return; var h = have[n.id]; if (h === undefined || (typeof n.lvl === 'number' && typeof h === 'number' && h < n.lvl)) out.missing.push(n); });
    if (rule && !ruleTrue(sys, char, rule, F, vars)) out.missing.push({ rule: rule });
    out.ok = out.missing.length === 0; return out;
}
// What a refusal says: the GM's own words where the entry has them, else the needs not met by name, each with its level, and a rule by its
// own text. nameOf(id): the name of an entry the reader may know, or nothing, which is then said once as something else; a rule whose text
// the reader may not read is handed in as { rule: true } and said the same way
function needsSays(def, missing, nameOf) {
    var own = isObj(def) ? cutText(def.needsMsg, LIMITS.rmMsg) : ''; if (own) return own;
    var parts = [], other = false;
    (Array.isArray(missing) ? missing : []).forEach(function(n) {
        if (isObj(n) && n.rule !== undefined) { var rt = typeof n.rule === 'string' ? cutText(n.rule, LIMITS.formula) : ''; if (rt) parts.push(rt); else other = true; return; }
        var nm = isObj(n) && typeof nameOf === 'function' ? nameOf(n.id) : null; if (typeof nm !== 'string' || !nm) { other = true; return; } parts.push(cutText(nm, LIMITS.itemName) + (typeof n.lvl === 'number' ? ' at level ' + fmtNum(n.lvl) : ''));
    });
    if (other) parts.push(parts.length ? 'something else' : 'something you do not have');
    if (!parts.length) return 'Your character does not meet what that needs.';
    return 'That needs ' + (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]) + '.';
}
// 1.5.8 (book handoff 90, a Form opens techniques; the owner: follow the website, where an opened technique "shows by itself in the Combat
// Techniques section" while the Form holds and is gone when it does not): what an entry opens — at most 8 of { f: the list's field id, id: the
// entry it opens there, from: the level of THIS entry from which it opens (1 if none) }, each entry once. None: undefined
function cleanOpens(v) {
    if (!Array.isArray(v)) return undefined;
    var out = [], seen = map();
    v.slice(0, 32).forEach(function(o) {
        if (out.length >= 8 || !isObj(o) || typeof o.f !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(o.f) || typeof o.id !== 'string' || !ITEM_ID.test(o.id)) return;
        var k = o.f + '|' + o.id; if (seen[k]) return; seen[k] = 1;
        var fr = typeof o.from === 'number' && fin(o.from) ? Math.max(1, Math.min(99, Math.round(o.from))) : 1;
        out.push({ f: o.f, id: o.id, from: fr });
    });
    return out.length ? out : undefined;
}
function cleanItemDef(it, F, gmView, keys, picks, kinds) {   // kinds (F6): the view's fields by id (fieldKinds), for its mods   // keys (F4c1): the stat keys of the view's item lists (statKeys); none: the key rule alone. picks (F5a2): their choices' labels (statPicks)
    if (!isObj(it) || typeof it.id !== 'string' || !ITEM_ID.test(it.id)) return null;
    var vis = it.vis === 'gm' ? 'gm' : 'all';
    if (!gmView && vis === 'gm') return null;
    var out = {
        id: it.id,
        name: str(it.name, LIMITS.itemName).replace(CTRL_RE_G, ' ').trim() || 'Item',   // Stage 6: every control character (the non-global pattern replaced only the first)
        category: str(it.category, LIMITS.category).replace(CTRL_RE_G, ' ').trim(),
        icon: cleanIcon(it.icon),                                                    // Stage 6: cut by code points (never half an emoji)
        notes: str(it.notes, LIMITS.text).replace(CTRL_RE_G, ' '),
        vis: vis, area: null, damage: '', cost: '', throwSkill: ''
    };
    if (gmView && RM_MODES[it.rm] === 1) { out.rm = it.rm; var rmm = cutText(it.rmMsg, LIMITS.rmMsg); if (rmm) out.rmMsg = rmm; }   // Stage 6: a player's removal (bound / curse on contact) and its message — the GM's secret, never in the players' view
    if (gmView && RM_MODES[it.eq] === 1) { out.eq = it.eq; var eqm = cutText(it.eqMsg, LIMITS.rmMsg); if (eqm) out.eqMsg = eqm; }   // Stage 6 F4b: a player's switching it off (bound: it stays on; curse on contact: you keep it on) and its message — as secret
    var ik = cleanItemKey(it.key, F); if (ik) out.key = ik;   // F4b: its key in formulas, unique inside each list it can be on (the validator)
    var il = lvlNum(it.lvl); if (il !== undefined) out.lvl = il;   // F4b: the level a new row of it starts at (else the list's)
    var imd = cleanItemMods(it.mods, kinds); if (imd) { out.mods = imd; if (it.modsOn === true) out.modsOn = true; }   // Stage 6 F6: what it changes on the character carrying it (none: no key at all)
    var ist = cleanEntryStats(it.stats, keys, picks); if (ist) out.stats = ist;   // F4c1: its stats — under a key some item list of this view defines (any list, never scoped by category: a category changed later loses nothing, and the GM's sheet and the owner's read the same)
    if (isObj(it.area)) {
        var ft = cleanNum(it.area.ft, 0) | 0;
        if (ft > 0) out.area = areaExtra({ ft: clampNum(ft, 1, LIMITS.maxBlastFt), shape: SHAPES[it.area.shape] ? it.area.shape : 'circle', name: cutText(it.area.name, LIMITS.label) }, it.area, gmView);   // F4c1: every control character (as a copy's); 1.5.8: its blast extras (1.5.9: its fragmentation in the GM's view alone)
    }
    if (gmView) {   // formula/skill text is GM-only on the wire
        var dmg = cleanFormulaText(it.damage); out.damage = dmg === null ? '' : dmg;
        var cost = cleanFormulaText(it.cost); out.cost = cost === null ? '' : cost;
        out.throwSkill = (typeof it.throwSkill === 'string' && validKey(it.throwSkill, F)) ? it.throwSkill : '';
    }
    var opn = cleanOpens(it.opens); if (opn) out.opens = opn;
    var isw = cleanRollSw(it.rollSw, kinds); if (isw) out.rollSw = isw;   // 1.6.0: the bonuses it offers a roll, ticked in the roll's ± window
    if (it.again === 'name') out.again = 'name';   // 1.6.0: a list that holds it once may hold it again as another row, each copy under a name of its own (applyRowOp's add with a name)   // 1.5.8: the entries this one opens on another list while its row is on, each from a level (openSync)
    var igr = cleanGrants(it.grants, kinds, out.id); if (igr) out.grants = igr;   // 1.6.0 (v2, B4): the rows a row of it grants on a list, each from a level of its own
    // 126b: its needs, the LAST keys of a definition and always in this order (hideNeeds writes them again the same way): a players' view cleaned again reads, and hashes, the same
    var ind = cleanNeeds(it.needs); if (ind) out.needs = ind;   // 126b: what a character must carry before it may take this one, in both views (a player's picker says why)
    var inr = needRule(it.needsIf, F); if (inr) out.needsIf = inr;   // ... its rule, a formula that must be true for the character (a players' view that could not work it out does not hold it: hideNeeds)
    var inf = inr && typeof it.needsFrom === 'number' ? lvlNum(it.needsFrom) : undefined; if (inf !== undefined) out.needsFrom = inf;   // ... the level of this entry from which the rule applies, only beside a rule
    if (!gmView && it.needsHid === true) out.needsHid = true;   // ... a players' view may say that more is needed than it names (hideNeeds); the GM's own never holds the mark
    if (out.needs || out.needsIf || out.needsHid) { var inm = cutText(it.needsMsg, LIMITS.rmMsg); if (inm) out.needsMsg = inm; }   // ... and the GM's own words for a refusal
    return out;
}
// camp.system.combat.cover — the per-system cover rule (1.5.0, v1). Built-in tier sets, chosen by `style`; no custom
// thresholds in v1. on=false → no cover. Whitelisted here so host and client (both run cleanSystem) agree; carries
// no vis:'gm' and no field refs, so the player view is identical to the GM's.
function cleanCover(c) {
    if (!isObj(c)) return { on: false, style: 'graded' };
    var out = { on: c.on === true, style: c.style === 'binary' ? 'binary' : 'graded' };
    if (isObj(c.area)) { var ar = {}; COVER_GRADES.forEach(function(g) { var x = Object.prototype.hasOwnProperty.call(c.area, g) ? c.area[g] : undefined; if (x === 'half' || x === 'none') ar[g] = x; }); if (Object.keys(ar).length) out.area = ar; }   // cover follow-ups (owner 2026-09-28): what a full-auto blast does behind each grade — full (absent), half or none
    return out;
}
var COVER_GRADES = ['half', 'threeq', 'cover', 'total'];
// Cover follow-ups: what a system does to a blast's damage behind a token's cover (tier: coverTier's) — 'full', 'half' or 'none', its outcome
// for that grade; with cover off, no tier or no outcome set, 'full'
function coverOutcome(sys, tier) {
    var cv = sys && isObj(sys.combat) && isObj(sys.combat.cover) ? sys.combat.cover : null;
    if (!cv || cv.on !== true || !tier || !isObj(cv.area)) return 'full';
    var g = tier.block ? 'total' : tier.name === 'Three-quarters cover' ? 'threeq' : tier.name === 'Half cover' ? 'half' : tier.name === 'Cover' ? 'cover' : '';
    var o = g && Object.prototype.hasOwnProperty.call(cv.area, g) ? cv.area[g] : 'full';
    return o === 'none' || o === 'half' ? o : 'full';
}
// What a blast's total does to that token: the whole, half (rounded down) or none, by coverOutcome
function coverDamage(sys, tier, total) {
    var t = typeof total === 'number' && isFinite(total) ? total : 0, o = coverOutcome(sys, tier);
    return o === 'none' ? 0 : o === 'half' ? Math.floor(t / 2) : t;
}
// Map the system-neutral cover metric (coverBetween's coverage 0..<1 + lineOfEffect) to this system's cover tier,
// or null for none. Pure: the SAME inputs give the SAME tier on host and client. block = "removes the target as a
// DIRECT attack/spell target" only (not "immune to AoE"); v1 is informational so block is advisory today.
function coverTier(sys, coverage, lineOfEffect) {
    var cov = sys && sys.combat && sys.combat.cover;
    if (!cov || cov.on !== true) return null;
    if (lineOfEffect === false) return { name: 'Total cover', block: true };
    if (cov.style === 'binary') return (coverage > 0) ? { name: 'Cover', block: false } : null;
    if (coverage >= 0.75) return { name: 'Three-quarters cover', block: false };
    if (coverage >= 0.25) return { name: 'Half cover', block: false };
    return null;   // below a quarter → negligible, report no cover
}
// Lighting L4 (owner answers 3 and 4, 2026-09-28): camp.system.combat.light, the system's light rules, absent when it holds none. names: what
// the system calls a dim and a dark place (with whatever penalty it words into them: the ruler and a target mark show them; bright has no
// name). presets: its lights (a torch, a lantern) — a name and the two radii a light takes (dim, the outer edge, at least bright), unit what
// they count in when not yards (ft, m or cells), pick: true where a player may pick it for their own token (net.js tok-light). A light's
// Properties offer them; one is copied onto the item, so a later change to the list rewrites no light on the board. Names are cut by code
// points (never half an emoji), as a light's own name is (fogcore cleanName). No vis and no field refs: both views carry it whole
var LIGHT_UNITS = Object.freeze({ ft: 1, m: 1, cells: 1 });
function cleanLightRules(l) {
    if (!isObj(l)) return null;
    var out = {}, nm = {}, ps = [];
    if (isObj(l.names)) ['dim', 'dark'].forEach(function(k) { var t = hasOwn(l.names, k) ? cutPoints(l.names[k], LIMITS.label, ' ') : ''; if (t) nm[k] = t; });
    if (Object.keys(nm).length) out.names = nm;
    (Array.isArray(l.presets) ? l.presets : []).forEach(function(p) {
        if (ps.length >= LIMITS.lightPresets || !isObj(p)) return;
        var name = cutPoints(p.name, LIMITS.label, ' '); if (!name) return;
        var b = typeof p.bright === 'number' && fin(p.bright) ? clampNum(p.bright, 0, 1000) : 0, d = typeof p.dim === 'number' && fin(p.dim) ? clampNum(p.dim, 0, 1000) : 0;
        if (d < b) d = b;
        if (b <= 0 && d <= 0) return;
        var o = { name: name, bright: b, dim: d };
        if (typeof p.unit === 'string' && hasOwn(LIGHT_UNITS, p.unit)) o.unit = p.unit;
        if (p.pick === true) o.pick = true;
        ps.push(o);
    });
    if (ps.length) out.presets = ps;
    return Object.keys(out).length ? out : null;
}
// The name a system gives a light level (0 dark, 1 dim): '' when it names none, or for any other level (bright has no name)
function lightName(sys, level) {
    var lr = sys && isObj(sys.combat) ? cleanLightRules(sys.combat.light) : null, k = level === 0 ? 'dark' : level === 1 ? 'dim' : '';
    return lr && lr.names && k && hasOwn(lr.names, k) ? lr.names[k] : '';
}
// A system's light presets, cleaned (a copy: a caller may keep it)
function lightPresets(sys) { var lr = sys && isObj(sys.combat) ? cleanLightRules(sys.combat.light) : null; return lr && lr.presets ? lr.presets : []; }
// Range penalties R1 (docs/RANGE_PLAN.md; owner's answers 2026-09-29: a table or a formula, shown on the ruler and at a target mark):
// camp.system.combat.range, the system's range rule, absent when it holds none. unit: what its distances count in when not yards (ft, m or
// cells). formula: the modifier worked out from Distance alone (no dice, no other name); kept, it wins and the steps go. steps: the table,
// each { to, mod } ("up to 10: -4"), sorted by distance, the first of each distance kept; a distance above 0 and at most 1,000,000, a
// modifier within 1000 either way, to the hundredth. No vis and no field refs: both views carry it whole. F: the formula engine (no engine:
// no formula is kept, fail closed)
var RANGE_UNITS = Object.freeze({ ft: 1, m: 1, cells: 1 });
function rangeFormulaOk(text, F) {
    if (!F || typeof F.parse !== 'function') return false;
    var p = F.parse(text); if (!p || !p.ok || !p.ast || hasDice(p.ast.body)) return false;
    return (Array.isArray(p.names) ? p.names : []).every(function(n) { return typeof n === 'string' && lower(n) === 'distance'; });
}
function rangeModNum(v) { var q = Math.max(-1000, Math.min(1000, Math.round(v * 100) / 100)); return q === 0 ? 0 : q; }   // never -0
function cleanRangeRules(r, F) {
    if (!isObj(r)) return null;
    var out = {}, fm = cleanFormulaText(r.formula);
    if (typeof r.unit === 'string' && hasOwn(RANGE_UNITS, r.unit)) out.unit = r.unit;
    if (fm && rangeFormulaOk(fm, F)) out.formula = fm;
    else {
        var st = [], seen = map();
        (Array.isArray(r.steps) ? r.steps : []).forEach(function(s) {
            if (st.length >= LIMITS.rangeSteps || !isObj(s) || !fin(s.to) || !(s.to > 0) || s.to > 1e6 || !fin(s.mod)) return;
            var k = String(s.to); if (seen[k]) return;
            seen[k] = 1; var sn = typeof s.name === 'string' ? s.name.replace(CTRL_RE_G, ' ').trim().slice(0, 30).trim() : ''; var o = { to: s.to, mod: rangeModNum(s.mod) }; if (sn) o.name = sn; st.push(o);   // 1.6.0, backlog 30: a band's own name (Melee, Close, Far)
        });
        st.sort(function(a, b) { return a.to - b.to; });
        if (st.length) out.steps = st;
    }
    return out.formula || out.steps ? out : null;
}
// The modifier a cleaned range rule gives at a distance in its unit: the table's first step that reaches it (past the last, the last one's
// holds), or the formula with Distance; null with no rule, a distance that is no number, or a formula whose answer is no finite number
function rangeModOf(rr, dist, F) {
    if (!isObj(rr) || typeof dist !== 'number' || !isFinite(dist) || dist < 0) return null;
    var v = null;
    if (rr.formula) {
        if (!F || typeof F.evaluate !== 'function') return null;
        var res = F.evaluate(rr.formula, { vars: function(l) { return l === 'distance' ? dist : undefined; } });
        if (res && res.ok && typeof res.value === 'number' && isFinite(res.value)) v = res.value;
    } else if (Array.isArray(rr.steps) && rr.steps.length) {
        for (var i = 0; i < rr.steps.length && v === null; i++) if (dist <= rr.steps[i].to) v = rr.steps[i].mod;
        if (v === null) v = rr.steps[rr.steps.length - 1].mod;
    }
    return v === null ? null : rangeModNum(v);
}
// The hex a board point falls in (flat-top, 30 px sides, 52 px rows): whiteboard.js hexCellOf's rounding, so range counts the hexes the ruler does
function hexCellAt(x, y) {
    var s = 30, h = 52, q = (x - s / 2) / (1.5 * s), r = y / h - q / 2;
    var rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r);
    var dx = Math.abs(rx - q), dy = Math.abs(ry - r), dz = Math.abs(rz - (-q - r));
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz;
    return { q: rx, r: ry };
}
// The distance between two points of a map, in a range rule's unit (yards with none), as the ruler counts it: a hex grid counts hexes, a
// square one follows the system's diagonal rule (combat.turn.diag), a gridless map the straight line over 50 px cells; the map's scale converts
// (mapCellScale). dz: yards of height between the two (the elevation feature on), for the 3D distance the ruler's 3D line and a blast count.
// To the millionth (30 ft on 5 ft squares is 30); null for a point that is not two numbers
function rangeDist(sys, mp, a, b, unit, dz) {
    var num = function(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e9; };
    if (!isObj(a) || !isObj(b) || !num(a.x) || !num(a.y) || !num(b.x) || !num(b.y)) return null;
    var g = mapGridOf(mp), cells;
    if (g === 'hex') { var ha = hexCellAt(a.x, a.y), hb = hexCellAt(b.x, b.y), dq = ha.q - hb.q, dr = ha.r - hb.r; cells = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); }
    else if (g === 'square') { var dg = sys && isObj(sys.combat) && isObj(sys.combat.turn) ? sys.combat.turn.diag : ''; cells = gridCells((b.x - a.x) / 50, (b.y - a.y) / 50, dg === 'one' || dg === 'alt' ? dg : ''); }
    else cells = Math.hypot(b.x - a.x, b.y - a.y) / 50;
    var sc = mapCellScale(mp), cellYd = sc.per * MAP_UNITS[sc.unit], u = typeof unit === 'string' && hasOwn(RANGE_UNITS, unit) ? unit : 'yd';
    var d = u === 'cells' ? cells : u === sc.unit ? cells * sc.per : cells * cellYd / MAP_UNITS[u];
    var h = typeof dz === 'number' && isFinite(dz) && dz !== 0 ? (u === 'cells' ? dz / cellYd : dz / MAP_UNITS[u]) : 0;
    if (h) d = Math.hypot(d, h);
    return Math.round(d * 1e6) / 1e6;
}
// What the system's range rule says between two points of a map: { mod, dist, unit } (unit: yd, ft, m or cells), or null with no rule or no
// modifier. opts: { F, dz } (dz as rangeDist takes it). The ruler, a target mark and (R2) a roll's names read this one rule
function rangeOf(sys, mp, a, b, opts) {
    opts = isObj(opts) ? opts : {};
    var rr = sys && isObj(sys.combat) ? cleanRangeRules(sys.combat.range, opts.F) : null; if (!rr) return null;
    var u = rr.unit || 'yd', d = rangeDist(sys, mp, a, b, u, opts.dz); if (d === null) return null;
    var m = rangeModOf(rr, d, opts.F); if (m === null) return null;
    var out = { mod: m, dist: d, unit: u }, bn = rangeBandOf(rr, d); if (bn) out.band = bn;   // 1.6.0, backlog 30
    return out;
}
// 1.6.0, backlog 30 (the owner's ruling: the ruler keeps its numbers and gains a switch that shows the band's name instead): the name of the
// table's step a distance falls in, by rangeModOf's own rule (past the last, the last's); '' with a formula, no name or no distance
function rangeBandOf(rr, dist) {
    if (!isObj(rr) || rr.formula || !Array.isArray(rr.steps) || !rr.steps.length || typeof dist !== 'number' || !isFinite(dist) || dist < 0) return '';
    var s = null; for (var i = 0; i < rr.steps.length && !s; i++) if (dist <= rr.steps[i].to) s = rr.steps[i];
    if (!s) s = rr.steps[rr.steps.length - 1];
    return typeof s.name === 'string' ? s.name : '';
}
// Senses S1 (docs/SENSES_PLAN.md 3.1): camp.system.combat.senses, the system's senses besides the eyes, absent when it holds none. list: each
// sense an id (sn_ + 8), a name (cut by code points; text sinks only), a range (a field of the character, or a number every character has; a
// range of 0 or less is not having it), the unit it counts in when not yards (ft, m or cells), its grade (full: sees the cells; mark: shows a
// nameless mark where a creature is), walls: 'pass' (absent: the sight blockers stop it), arc: 'all' (absent: its token's eyes' arc), eyes: a
// sense of the eyes (off while blind), off: a field that switches it off (Deafened), shows: 'dim' (a full sense sees the dark as dim), glyph
// (a mark sense's mark) and veil (it sees through smoke). blind: a field whose tick (or a value above 0) switches the eyes off. The schema is
// whole from S1 so no saved shape changes later. A range, an off or a blind that reads a value its player cannot read truthfully
// (secretFieldIds) takes the sense (or blind) with it in BOTH views, so host and player judge by one rule; fieldIds: id -> kind, as the GM's
// view has them; no secretIds (fail closed): every field counts as secret
// The eyes' arc (the owner's ruling of 2026-10-03: ordinary sight the front arc, a wider one for a character whose traits give it): arc, a
// number or formula field that gives a character's own sight arc in degrees (fog.js tokenSenses reads it, eyesArc says where it counts).
// Kept as blind is: one field of an allowed kind its player can read truthfully, the same in both views; anything else leaves it out
var SENSE_ID = /^sn_[a-z0-9]{8}$/;
var SENSE_GRADES = Object.freeze({ full: 1, mark: 1 }), SENSE_GLYPHS = Object.freeze({ sound: 1, tremor: 1, presence: 1, heat: 1 });
var SENSE_RANGE_KINDS = Object.freeze({ number: 1, formula: 1, skill: 1, resource: 1 }), SENSE_SWITCH_KINDS = Object.freeze({ toggle: 1, number: 1, formula: 1 }), SENSE_ARC_KINDS = Object.freeze({ number: 1, formula: 1 });
function senseField(v, kinds, fieldIds, secretIds) {   // { field }: its id; '' when it names no field of an allowed kind; null when its player cannot read it truthfully
    if (!isObj(v) || typeof v.field !== 'string' || !FIELD_ID.test(v.field)) return '';
    if (!isObj(secretIds) || hasOwn(secretIds, v.field)) return null;
    return isObj(fieldIds) && hasOwn(fieldIds, v.field) && hasOwn(kinds, fieldIds[v.field]) ? v.field : '';
}
function cleanSenses(s, fieldIds, secretIds) {
    if (!isObj(s)) return null;
    var out = {}, list = [], seen = map();
    if (s.blind !== undefined) { var bf = senseField(s.blind, SENSE_SWITCH_KINDS, fieldIds, secretIds); if (bf) out.blind = { field: bf }; }
    if (s.arc !== undefined) { var af = senseField(s.arc, SENSE_ARC_KINDS, fieldIds, secretIds); if (af) out.arc = { field: af }; }   // the eyes' own arc, from the sheet
    (Array.isArray(s.list) ? s.list : []).forEach(function(x) {
        if (list.length >= LIMITS.senses || !isObj(x) || typeof x.id !== 'string' || !SENSE_ID.test(x.id) || seen[x.id]) return;
        var name = cutPoints(x.name, LIMITS.label, ' '); if (!name) return;
        if (typeof x.grade !== 'string' || !hasOwn(SENSE_GRADES, x.grade)) return;
        var r = x.range, range = null;
        if (isObj(r) && r.by === 'field') { var rf = senseField(r, SENSE_RANGE_KINDS, fieldIds, secretIds); if (!rf) return; range = { by: 'field', field: rf }; }
        else if (isObj(r) && r.by === 'n' && fin(r.n)) range = { by: 'n', n: clampNum(r.n, 0, 100000) };   // fin: a number (never text), finite
        else return;
        var o = { id: x.id, name: name, range: range };
        if (typeof x.unit === 'string' && hasOwn(LIGHT_UNITS, x.unit)) o.unit = x.unit;
        o.grade = x.grade;
        if (x.walls === 'pass') o.walls = 'pass';
        if (x.arc === 'all') o.arc = 'all';
        if (x.eyes === true) o.eyes = true;
        if (x.off !== undefined) { var of = senseField(x.off, SENSE_SWITCH_KINDS, fieldIds, secretIds); if (of === null) return; if (of) o.off = { field: of }; }
        if (x.grade === 'full' && x.shows === 'dim') o.shows = 'dim';
        if (x.grade === 'mark' && typeof x.glyph === 'string' && hasOwn(SENSE_GLYPHS, x.glyph)) o.glyph = x.glyph;
        if (x.veil === true) o.veil = true;
        seen[x.id] = 1; list.push(o);
    });
    if (list.length) out.list = list;
    return Object.keys(out).length ? out : null;
}
// Turn-based combat T1 (owner, 2026-09-26): the system's turn rules, absent when none. move: how far a character moves in one turn (a formula,
// no dice, worked out for each character) and the unit it counts in (each map's scale converts it; cells: grid cells); diag: how a square grid
// counts a diagonal (line: the straight distance, as the ruler measured; one: every diagonal 1 square; alt: alternating 1-2); secs: how long a
// round lasts in the game, in seconds; units: the system's own time units by their length in seconds (never a built-in word); acts: what one
// turn allows (Action 1, Bonus action 1), which a roll or an apply action may cost. Both views carry them (the players' drops a GM-only move)
var TURN_UNITS = Object.freeze({ cells: 1, ft: 1, yd: 1, m: 1 });
var TIME_WORDS = Object.freeze({ turn: 1, turns: 1, round: 1, rounds: 1, s: 1, sec: 1, secs: 1, second: 1, seconds: 1, min: 1, mins: 1, minute: 1, minutes: 1, h: 1, hr: 1, hrs: 1, hour: 1, hours: 1, d: 1, day: 1, days: 1 });
// Item 20 K5 (the owner's answers of 2026-09-30): a roll or an apply action that also runs by the campaign's clock — every n minutes, hours,
// days or weeks of the calendar, or n of the system's own time units by key (a watch), during rest only or any time. { n: 1 to 1000, u, rest? }
// Backlog 152: wait? (Waits in a fight, true only, after rest): its count waits while its character is in a fight and goes on after it (a fight
// still breaks a rest). The unit round is never By the clock's: a round is In a fight's alone
// 1.5.5: whileNeeds? (Only while its needs hold, true only, written last): its count adds only the time the rule's needs hold for its character
// (calendarcore ruleFires' need). Kept only where needs, the rule's own needs text as rollNeedsInto reads it, cleans to a formula: a rule with
// no needs has nothing to count by. The same in both views, but the players' view drops it with the needs where it drops them (cleanSystem)
var EVERY_UNITS = Object.freeze({ min: 1, hour: 1, day: 1, week: 1 });
// 1.6.0 Counts by the game clock (the handoff's per-row timer, and the campaign build's count while a switch holds): a counter of an item list
// that moves with its character's own game time (calendar.js ownTime: every stretch lived once, a fight's rounds too; rowTimers). { dir: 'down'
// (the default) or 'up'; per: one step every n minutes, hours, days, weeks or n of the system's own time unit by key (cleanEvery's units, never a
// round); on: true, it counts only while its row is switched on; reset: true (with on), a row switched off goes back to its start; end: the word
// a row shows once a count down reaches 0 (Spoiled) }. Down stops at 0 and the row stays; up stops at 1e6. The same in both views: no secret
function cleanRowTimer(v) {
    if (!isObj(v)) return null;
    var p = isObj(v.per) ? v.per : null, n = p && typeof p.n === 'number' && fin(p.n) && Math.floor(p.n) === p.n && p.n >= 1 && p.n <= 1000 ? p.n : 0, u = p && typeof p.u === 'string' && (EVERY_UNITS[p.u] === 1 || STAT_KEY.test(p.u)) && lower(p.u) !== 'round' ? p.u : '';
    if (!n || !u) return null;
    var o = { dir: v.dir === 'up' ? 'up' : 'down', per: { n: n, u: u } };
    if (v.on === true) { o.on = true; if (v.reset === true) o.reset = true; }
    var w = o.dir === 'down' ? cutText(v.end, LIMITS.label) : ''; if (w) o.end = w;
    return o;
}
function cleanEvery(v, needs) {
    if (!isObj(v)) return null;
    var n = typeof v.n === 'number' && fin(v.n) && Math.floor(v.n) === v.n && v.n >= 1 && v.n <= 1000 ? v.n : 0, u = typeof v.u === 'string' && (EVERY_UNITS[v.u] === 1 || STAT_KEY.test(v.u)) && lower(v.u) !== 'round' ? v.u : '';
    if (!n || !u) return null;
    var o = { n: n, u: u }; if (v.rest === true) o.rest = true; if (v.wait === true) o.wait = true; if (v.whileNeeds === true && !!cleanFormulaText(needs)) o.whileNeeds = true; return o;
}
// Backlog 152 (the fight clock, docs/FIGHT_CLOCK_DESIGN.md 2 and 13): a roll or an apply action that also runs in a fight, In a fight — every n
// rounds (the round's length, the Combat card's Turns box), minutes or hours, or n of the system's own time units by key, with fresh (Each fight
// starts again, true only) its count begun anew with each fight. { n: 1 to 1000, u, fresh? }. A time word other than those three is no unit
// of the system's (cleanTurn refuses them), so it is no unit here either. 1.5.5: whileNeeds? as By the clock's (cleanEvery), written last
var FIGHT_UNITS = Object.freeze({ round: 1, min: 1, hour: 1 });
function cleanInFight(v, needs) {
    if (!isObj(v)) return null;
    var n = typeof v.n === 'number' && fin(v.n) && Math.floor(v.n) === v.n && v.n >= 1 && v.n <= 1000 ? v.n : 0, u = typeof v.u === 'string' && (FIGHT_UNITS[v.u] === 1 || (STAT_KEY.test(v.u) && TIME_WORDS[lower(v.u)] !== 1)) ? v.u : '';
    if (!n || !u) return null;
    var o = { n: n, u: u }; if (v.fresh === true) o.fresh = true; if (v.whileNeeds === true && !!cleanFormulaText(needs)) o.whileNeeds = true; return o;
}
// the unit of each roll's every against the system's own time units (as costTargets does an action): a unit of the calendar stays, a unit key
// takes the unit's own spelling; one the system no longer has stays in the GM's view (the editor asks for one) and goes from the players'.
// Backlog 152: In a fight's unit the same way (a round, minutes and hours as they are)
function everyTargets(out, gmView) {
    var us = map(); (out.combat && out.combat.turn && Array.isArray(out.combat.turn.units) ? out.combat.turn.units : []).forEach(function(u) { us[lower(u.key)] = u.key; });
    out.rolls.forEach(function(r) {
        if (!isObj(r)) return;
        if (r.every && EVERY_UNITS[r.every.u] !== 1) { var k = us[lower(r.every.u)]; if (k) r.every.u = k; else if (!gmView) delete r.every; }
        if (r.inFight && FIGHT_UNITS[r.inFight.u] !== 1) { var kf = us[lower(r.inFight.u)]; if (kf) r.inFight.u = kf; else if (!gmView) delete r.inFight; }
    });
}
function cleanTurn(t) {
    if (!isObj(t)) return null;
    var out = {}, mv = cleanFormulaText(t.move), secs = function(v, most) { if (typeof v !== 'number' || !fin(v) || v <= 0 || v > most) return 0; var q = Math.round(v * 1000) / 1000; return q > 0 ? q : 0; };
    if (mv) { out.move = mv; out.unit = typeof t.unit === 'string' && TURN_UNITS[t.unit] === 1 ? t.unit : 'cells'; }
    if (t.diag === 'one' || t.diag === 'alt') out.diag = t.diag;
    var rs = secs(t.secs, 86400); if (rs) out.secs = rs;
    var us = [], seenU = map(), as = [], seenA = map();
    (Array.isArray(t.units) ? t.units : []).forEach(function(u) {
        if (us.length >= LIMITS.turnUnits || !isObj(u) || typeof u.key !== 'string' || !STAT_KEY.test(u.key) || seenU[lower(u.key)] || TIME_WORDS[lower(u.key)] === 1) return;
        var us0 = secs(u.secs, 1e9); if (!us0) return;
        seenU[lower(u.key)] = 1; var o = { key: u.key, secs: us0 }, lb = cutText(u.label, LIMITS.label); if (lb) o.label = lb; us.push(o);
    });
    (Array.isArray(t.acts) ? t.acts : []).forEach(function(a) {
        if (as.length >= LIMITS.turnActs || !isObj(a) || typeof a.key !== 'string' || !STAT_KEY.test(a.key) || seenA[lower(a.key)]) return;
        seenA[lower(a.key)] = 1; var o = { key: a.key, n: typeof a.n === 'number' && Math.floor(a.n) === a.n && a.n >= 1 && a.n <= 9 ? a.n : 1 }, lb = cutText(a.label, LIMITS.label); if (lb) o.label = lb; var nfA = cleanFormulaText(a.nf); if (nfA) o.nf = nfA; as.push(o);   // 192 (the owner, by prompt: "Count is a formula (Recommended)"): how many a turn allows may be a formula of the character's names, worked out for each character at their turn's start (n where it gives no number)
    });
    if (us.length) out.units = us;
    if (as.length) out.acts = as;
    return Object.keys(out).length ? out : null;
}
// T1 (D8): how far a straight move goes on a square grid by the system's rule, dx and dy in cells — line (or none): the straight distance; one:
// every diagonal 1 square (the longer side); alt: alternating 1-2 (the longer side and half the shorter, rounded down)
function gridCells(dx, dy, diag) {
    var a = Math.abs(Number(dx)), b = Math.abs(Number(dy)); if (!fin(a) || !fin(b)) return 0;
    if (diag === 'one') return Math.max(a, b);
    if (diag === 'alt') return Math.max(a, b) + Math.floor(Math.min(a, b) / 2);
    return Math.hypot(a, b);
}
// Turn-based combat T3b: a map's scale — how much one grid cell is (meta.cellValue + meta.cellUnit; else 1 yd a hex, 5 ft a square), as the
// ruler reads it — and a Move per turn (D1: a number in its unit) as that map's cells (cells: as it is)
var MAP_UNITS = Object.freeze({ yd: 1, ft: 1 / 3, m: 1.0936133, km: 1093.6133, mi: 1760 });
// Grid-shaped tokens (owner, 2026-09-27: "when tokens come in, lets have them come in in the grid shape, only using circles when theres no
// grid"): a map's grid ('hex' | 'square' | 'off' — missing or unknown is 'off') and the one-cell token it takes (a hexagon 60x52, a square
// 50x50, a circle 60x52). shapeStandIn reshapes a token the app places or brings onto a map — a character token or a waiting token, ONE cell
// at most (a token the GM sized up keeps its shape) — its centre kept: a plain shape becomes the cell's shape and size; a picture keeps its
// art and takes the cell as its outline (tok.shape: clipped on screen), its size too on a grid; the app's own bundled hexagon art becomes its
// square twin (the outline cuts it). Anything else is left alone. Returns true when it changed the token
var TOKEN_CELL = Object.freeze({ hex: Object.freeze({ type: 'hexagon', w: 60, h: 52 }), square: Object.freeze({ type: 'rect', w: 50, h: 50 }), off: Object.freeze({ type: 'circle', w: 60, h: 52 }) });
var STAND_IN = Object.freeze({ circle: 1, rect: 1, hexagon: 1 });
function mapGridOf(mp) { var g = isObj(mp) && isObj(mp.meta) ? mp.meta.gridType : null; return g === 'hex' || g === 'square' ? g : 'off'; }
function tokenCell(mp) { var c = TOKEN_CELL[mapGridOf(mp)]; return { type: c.type, w: c.w, h: c.h }; }
function shapeStandIn(tok, mp) {
    if (!isObj(tok) || !(tok.isChar || tok.waiting)) return false;
    var pic = tok.type === 'image' && typeof tok.src === 'string' && tok.src !== '';
    if (!pic && !(typeof tok.type === 'string' && hasOwn(STAND_IN, tok.type))) return false;
    var num0 = function(v, d) { return typeof v === 'number' && fin(v) && v > 0 ? v : d; }, w0 = num0(tok.w, 60), h0 = num0(tok.h, 52);
    if (Math.max(w0, h0) > 64) return false;
    var g = mapGridOf(mp), c = TOKEN_CELL[g], sig = function() { return [tok.type, tok.shape, tok.w, tok.h, tok.src, tok.x, tok.y].join('|'); }, before = sig();
    var w = pic && g === 'off' ? w0 : c.w, h = pic && g === 'off' ? h0 : c.h;
    if (pic) {
        tok.shape = c.type;
        var bm = /^(?:\/saves\/images|assets)\/tutorial\/([a-z_]{1,40})_hex\.png$/.exec(tok.src);
        if (bm && FACE_PICS.indexOf(bm[1]) >= 0) tok.src = 'assets/tutorial/' + bm[1] + '_sq.jpg';   // the bundled square twin: every install has it (a saves-folder copy may have been deleted)
    } else tok.type = c.type;
    if (typeof tok.x === 'number' && fin(tok.x)) tok.x = tok.x + w0 / 2 - w / 2;
    if (typeof tok.y === 'number' && fin(tok.y)) tok.y = tok.y + h0 / 2 - h / 2;
    tok.w = w; tok.h = h;
    return sig() !== before;
}
function mapCellScale(mp) { var meta = isObj(mp) && isObj(mp.meta) ? mp.meta : {}, hex = meta.gridType === 'hex'; return { per: typeof meta.cellValue === 'number' && fin(meta.cellValue) && meta.cellValue > 0 ? meta.cellValue : (hex ? 1 : 5), unit: typeof meta.cellUnit === 'string' && Object.prototype.hasOwnProperty.call(MAP_UNITS, meta.cellUnit) ? meta.cellUnit : (hex ? 'yd' : 'ft'), hex: hex }; }
// 1.5.9 (book es/et plan, section 3): the board pixels of a yard on a map, by its scale over the 50 px cell a gridless map measures in (rangeDist),
// so that "next to" on a map with no grid is within a yard (fogcore nearTokens)
function mapYardPx(mp) { var sc = mapCellScale(mp), yd = sc.per * MAP_UNITS[sc.unit]; return typeof yd === 'number' && fin(yd) && yd > 0 ? 50 / yd : 50; }
function moveAllowCells(v, unit, scale) {
    if (typeof v !== 'number' || !fin(v) || v <= 0) return 0;
    if (unit !== 'ft' && unit !== 'yd' && unit !== 'm') return v;
    var sc = isObj(scale) && typeof scale.per === 'number' && scale.per > 0 && Object.prototype.hasOwnProperty.call(MAP_UNITS, scale.unit) ? scale : { per: 5, unit: 'ft' };
    return Math.round(v * MAP_UNITS[unit] / (sc.per * MAP_UNITS[sc.unit]) * 1e6) / 1e6;   // to the millionth: 30 ft on 5 ft squares is 6, not 6.000000000000001
}
function costKey(v) { return typeof v === 'string' && STAT_KEY.test(v) ? v : ''; }   // T1: the action a roll costs (checked against the actions once they are cleaned)
// T1: each roll's cost against the Combat card's actions, in the action's spelling; one naming no action stays in the GM's view (the validator
// names it) and goes from the players'
function costTargets(out, gmView) {
    var acts = map(); (out.combat && out.combat.turn && Array.isArray(out.combat.turn.acts) ? out.combat.turn.acts : []).forEach(function(a) { acts[lower(a.key)] = a.key; });
    var fix = function(r) { if (!isObj(r) || !r.cost) return; var k = acts[lower(r.cost)]; if (k) r.cost = k; else if (!gmView) delete r.cost; };
    out.rolls.forEach(fix);
    out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.rolls)) f.list.rolls.forEach(fix); });
}
// Turn-based combat T5a (owner D9, D10): an effect lasts what its duration note says when the note reads cleanly as an amount and a unit of the
// system's time — turns or rounds (one round each: the System's A round is, else 6 s), seconds, minutes, hours, days, or the system's own units
// by key or label (a plural s dropped); "next turn" is one. Any other note (until dawn) never runs out by itself
var TIME_ALIAS = Object.freeze({ turn: 'turns', turns: 'turns', round: 'turns', rounds: 'turns', s: 'seconds', sec: 'seconds', secs: 'seconds', second: 'seconds', seconds: 'seconds', min: 'minutes', mins: 'minutes', minute: 'minutes', minutes: 'minutes', h: 'hours', hr: 'hours', hrs: 'hours', hour: 'hours', hours: 'hours', d: 'days', day: 'days', days: 'days' });
var TIME_SECS = Object.freeze({ seconds: 1, minutes: 60, hours: 3600, days: 86400 });
function roundSecs(sys) { var t = isObj(sys) && isObj(sys.combat) && isObj(sys.combat.turn) ? sys.combat.turn : null; return t && typeof t.secs === 'number' && fin(t.secs) && t.secs > 0 ? t.secs : 6; }
function parseLasts(text, sys) {
    if (typeof text !== 'string') return null;
    var s = lower(text).replace(/\s+/g, ' ').trim(); if (s === 'next turn' || s === 'until next turn' || s === 'until your next turn') return { n: 1, u: 'turns' };
    var m = /^(\d+(?:\.\d+)?) ?([a-z][a-z ]{0,30})$/.exec(s); if (!m) return null;
    var n = Number(m[1]), w = m[2].trim(); if (!(n > 0) || n > 1e6) return null;
    if (Object.prototype.hasOwnProperty.call(TIME_ALIAS, w)) return { n: n, u: TIME_ALIAS[w] };
    var t = isObj(sys) && isObj(sys.combat) && isObj(sys.combat.turn) ? sys.combat.turn : null, ws = [w, w.replace(/s$/, ''), w.replace(/es$/, '')], hit = null;   // watches, segments
    (t && Array.isArray(t.units) ? t.units : []).forEach(function(x) { if (hit || !isObj(x)) return; [x.key, x.label].forEach(function(nm) { if (!hit && typeof nm === 'string' && ws.indexOf(lower(nm)) >= 0) hit = x; }); });
    return hit ? { n: n, u: hit.key, secs: hit.secs } : null;
}
function lastsSecs(core, sys) {   // in game seconds, or 0 (never runs out by itself)
    var l = isObj(core) ? parseLasts(core.dur, sys) : null; if (!l) return 0;
    var us = l.u === 'turns' ? roundSecs(sys) : Object.prototype.hasOwnProperty.call(TIME_SECS, l.u) ? TIME_SECS[l.u] : (typeof l.secs === 'number' ? l.secs : 0);
    return us > 0 ? Math.round(l.n * us * 1000) / 1000 : 0;
}
// D10: a row's timer — ONE remaining amount in game seconds (left), and the host's clock time it last started running out of combat (at; 0:
// stopped — in combat, or paused: p). It rides with the row, so it survives saves, reloads and the end of a combat
function cleanFxTimer(t) {
    if (!isObj(t) || typeof t.left !== 'number' || !fin(t.left)) return null;
    var o = { left: Math.max(0, Math.min(1e9, Math.round(t.left * 1000) / 1000)), at: typeof t.at === 'number' && fin(t.at) && t.at > 0 && t.at < 1e14 ? Math.floor(t.at) : 0 };
    if (t.p === 1) o.p = 1;
    return o;
}
function fxLeftNow(t, now) { if (!isObj(t) || typeof t.left !== 'number') return Infinity; return t.at > 0 && typeof now === 'number' ? t.left - Math.max(0, (now - t.at) / 1000) : t.left; }
// T5a: one character's timed effects at a moment. kind: 'turn' — its turn began in a combat (a running clock is banked, then one round
// passes); 'bank' — a combat began (the clock stops; what ran is kept); 'resume' — a combat ended (the clock starts again unless paused);
// 'clock' — out of combat, real time; 'game' (item 20 K4: the Calendar on, out of combat) — the game clock moved on secs seconds: a row not paused
// loses that much (a clock still running is banked first) and stops. A row whose time is up comes off. { values: { fieldId: list } (changed lists
// only), expired: [names] }
function fxTick(sys, char, kind, now, secs) {
    var out = { values: {}, expired: [] }; if (!isObj(sys) || !Array.isArray(sys.fields) || !isObj(char) || !isObj(char.values) || typeof now !== 'number') return out;
    var rs = roundSecs(sys), defs = map(); (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (isObj(d) && typeof d.id === 'string') defs[d.id] = d; });
    sys.fields.forEach(function(f) {
        var src = f.kind === 'effects' ? char.values[f.id] : null; if (!Array.isArray(src)) return;
        var changed = false, list = [];
        src.forEach(function(r) {
            if (!isObj(r) || !isObj(r.t)) { list.push(r); return; }
            var t = { left: r.t.left, at: r.t.at || 0 }; if (r.t.p === 1) t.p = 1;
            var left = fxLeftNow(t, now);
            if (kind === 'turn') { t.left = left - rs; t.at = 0; changed = true; }
            else if (kind === 'bank') { if (t.at > 0) { t.left = left; t.at = 0; changed = true; } }
            else if (kind === 'resume') { if (!t.p && !(t.at > 0)) { t.at = now; changed = true; } }
            else if (kind === 'game') { if (!t.p && typeof secs === 'number' && fin(secs) && secs > 0) { t.left = left - secs; t.at = 0; changed = true; } }   // item 20 K4: the game clock's move
            var endL = kind === 'resume' ? t.left : fxLeftNow(t, now);
            if (kind !== 'resume' && endL <= 0.0005) { out.expired.push(typeof r.ref === 'string' ? (defs[r.ref] ? defs[r.ref].name : 'An effect') : (r.name || 'An effect')); changed = true; return; }
            var nr = Object.assign({}, r, { t: cleanFxTimer(t) }); list.push(nr);
        });
        if (changed) out.values[f.id] = list;
    });
    return out;
}
// 1.6.0 Counts by the game clock: secs of a character's own game time on its item lists' timed counters (cleanRowTimer), on a copy. perOf(per):
// a step's length in seconds (calendarcore everySecs on the campaign's calendar and units; 0 counts nothing). A counter carries the part of a
// step it has lived (tt), so short stretches add up. { values: fieldId -> the list's new rows, ended: [{ name, word, label, gm }] each count down
// that reached 0: the row's name, its end word ('' none), the counter's label and gm, true where its player may not see it (a GM-only list or
// entry, a kept curse); moved: the field ids whose counts changed, where values may hold a list whose rows only lived part of a step }
function rowTimers(sys, char, secs, perOf, F) {   // F (1.6.0): the formula engine, so a count up stops at its row's most (a counter's max); none: no most
    var out = { values: {}, ended: [], moved: [] }, RT = null; if (!isObj(sys) || !Array.isArray(sys.fields) || !isObj(char) || !isObj(char.values) || typeof perOf !== 'function' || !fin(secs) || !(secs > 0)) return out;
    sys.fields.forEach(function(f) {
        var spec = isObj(f) && f.kind === 'item-list' && isObj(f.list) ? f.list : null, tms = spec && Array.isArray(spec.counters) ? spec.counters.filter(function(t) { return isObj(t) && isObj(t.timer) && typeof t.key === 'string'; }) : [], src = tms.length ? char.values[f.id] : null;
        if (!Array.isArray(src)) return;
        var changed = false, moved = false, list = src.map(function(r) {
            if (!isObj(r)) return r;
            var ct = isObj(r.ct) ? Object.assign({}, r.ct) : {}, tt = isObj(r.tt) ? Object.assign({}, r.tt) : {}, did = false;
            tms.forEach(function(t) {
                var tm = t.timer, per = Number(perOf(tm.per)), cur = rowCt(r, t), start = typeof t.def === 'number' ? t.def : 0, had = typeof tt[t.key] === 'number' ? tt[t.key] : 0;
                if (tm.on && !rowOn(spec, r)) { if (tm.reset && (cur !== start || had)) { ct[t.key] = start; delete tt[t.key]; did = true; if (cur !== start) moved = true; } return; }   // switched off: it waits, or goes back to its start
                if (!fin(per) || !(per > 0)) return;
                if (tm.dir === 'down' && cur <= 0) { if (had) { delete tt[t.key]; did = true; } return; }   // run down: the row stays as it is
                var mxT = null; if (tm.dir === 'up' && t.max && F && typeof F.evaluate === 'function') { try { RT = RT || makeResolver(sys, char, F, null); mxT = RT && typeof RT.ctMax === 'function' ? RT.ctMax(f, r, t.key) : null; } catch (x) { mxT = null; } }
                if (typeof mxT === 'number' && fin(mxT) && cur >= mxT) { if (had) { delete tt[t.key]; did = true; } return; }   // 1.6.0: at its most it stands, and a row whose most is 0 never starts
                var acc = had + secs, steps = Math.floor(acc / per + 1e-9), rem = acc - steps * per, nv = tm.dir === 'up' ? Math.min(1e6, typeof mxT === 'number' && fin(mxT) ? Math.max(0, mxT) : 1e6, cur + steps) : Math.max(0, cur - steps);
                if (tm.dir === 'down' && nv === 0) { rem = 0; var rd = rowDef(sys, r), d = rd && isObj(rd.def) ? rd.def : null; out.ended.push({ name: cutText(d && d.name, LIMITS.label) || 'A row', word: tm.end || '', label: t.label || t.key, gm: f.vis === 'gm' || r.hid === 1 || !!(d && d.vis === 'gm') }); }
                if (nv !== cur) { ct[t.key] = nv; moved = true; }
                if (rem > 1e-6) tt[t.key] = Math.min(1e9, rem); else delete tt[t.key];
                did = true;
            });
            if (!did) return r;
            changed = true; var nr = Object.assign({}, r); if (Object.keys(ct).length) nr.ct = ct; else delete nr.ct; if (Object.keys(tt).length) nr.tt = tt; else delete nr.tt; return nr;
        });
        if (changed) out.values[f.id] = list;
        if (moved) out.moved.push(f.id);
    });
    return out;
}
// [systemcheck:damage-start]
// 1.5.6, the damage step (the owner, 2026-10-24: "taking damage and running down HP and running through anything that provides DR first, DR
// degradation and DUR degradation. all of this generalized for waypoint"): camp.system.combat.damage, absent when a system takes no damage by it.
//   pool    the resource a wound comes off (the Combat card's hpResource where none is named)
//   major   a formula: a wound at or above it, in one blow, is a Major Wound ('' none). 1.6.0 (the SotMW v2 sort, B3): it reads the hit location's
//           own names as Hit.<name> beside the character's (0 where no location was struck), so a threshold may be a third on the head
//   onMajor { fx, roll }, only beside major and in the GM's view alone: what a Major Wound does. fx, a library effect switched on (as an apply
//           action switches one: once per character, its timer); roll, a system roll whose reminder is posted to the wounded character's
//           player (a Vitality roll). An id that is no effect or roll of the system does nothing
//   locs    { list, dr, crip, vital, mult }: the list of hit locations, the column or stat that is a location's DR, the column or stat at which a wound there
//           may cripple it, a formula of the location's own names (Row.) that is true at a vital location, and a formula of the location's names and the
//           character's that is the location's own multiplier for a wound to the main pool, whatever the type (0: none; the skull's x4, a droid's head x2)
//   types   [{ key, label, mult, vital, plus, noDr, pool, alt, noWear, cuts }]: a damage type, its wounding multiplier, its multiplier at a vital location
//           (0: as anywhere), the location's stats or columns added to its DR (typed DR), ignoring DR, the pool it comes off where not the main one, a
//           second reading where a formula holds ({ if, pool, mult, noWear }: ion on a droid), wearing nothing (end, stun), and destroying a weapon at 20 over.
//           1.6.0 (the v2 combat module): the dice the blow rolled (the step's inp.dice) may count, each a figure a die, -10 to 10 to the hundredth:
//           dieDr (added to the DR at the location for this blow alone), dieWound (added to a wound that gets through), dieVital (added there at a vital
//           location) and dieWear (0 to 10: worn off each layer at the location for good, whether or not the blow gets through)
//   layers  [{ list, at, wear }]: what wears where a hit gets through: a list whose rows are worn (switched on where it has a switch), a formula of the
//           row's names (Row.) and the hit location's (Hit.) that is the row's listed figure there (its DR, or a garment's Dur), and its stat of wear.
//           A layer wears only where the damage rolled is more than its figure as it stands (the listed figure less its wear, never below 0).
//           1.6.0 (the v2 combat module): 8 layers at most, and a layer may wear another stat by location: wears, up to 8 number stats of its list,
//           and pick, a formula read as at is that gives the place in wears of the stat worn there, 1 for the first; any other figure wears wear.
//           locs.die (1.6.0): a formula of the location's names and the character's, added to a wound that gets through for each die the blow rolled
//   weapons [{ list, dur, wear, cond }]: a weapon tested by a blow: its listed Dur (a formula of Row.), its stat of wear and its stat of condition
// The players' view keeps what the window asks (the pool, the types by name, the location list) and no formula: the host works the blow out.
var DMG_LIM = Object.freeze({ types: 24, layers: 8, weapons: 4, plus: 8, mult: 10, amt: 1000000, wears: 8, dice: 100 });
function dmgStatOk(fl, listId, key) {   // a number stat of that list, value names or not (a stat its rows may hold as their own), never a pick
    var f = fl ? fl(listId) : null, sp = f && isObj(f.list) ? f.list : null; if (!sp || typeof key !== 'string' || !STAT_KEY.test(key)) return '';
    var hit = ''; (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(s) { if (!hit && isObj(s) && lower(s.key) === lower(key) && s.kind !== 'pick') hit = s.key; });
    return hit;
}
function dmgNameOk(fl, listId, key) {   // a stat or a column of that list
    var f = fl ? fl(listId) : null, sp = f && isObj(f.list) ? f.list : null; if (!sp || typeof key !== 'string' || !STAT_KEY.test(key)) return '';
    var hit = ''; (Array.isArray(sp.stats) ? sp.stats : []).concat(Array.isArray(sp.cols) ? sp.cols : []).forEach(function(s) { if (!hit && isObj(s) && lower(s.key) === lower(key)) hit = s.key; });
    return hit;
}
function dmgNum(v, lo, hi, d) { return typeof v === 'number' && fin(v) ? Math.round(clampNum(v, lo, hi) * 100) / 100 : d; }
var DMG_DIE = Object.freeze([['dieDr', -10], ['dieWound', -10], ['dieVital', -10], ['dieWear', 0]]);   // 1.6.0: a type's figures a die, and each one's least
function dmgDiceRead(d) {   // 1.6.0: whether these rules read the dice a blow rolled (the window asks for them only then)
    if (!isObj(d)) return false;
    if (isObj(d.locs) && !!cleanFormulaText(d.locs.die)) return true;
    return (Array.isArray(d.types) ? d.types : []).some(function(y) { return isObj(y) && DMG_DIE.some(function(k) { return dmgNum(y[k[0]], k[1], 10, 0) !== 0; }); });
}
function cleanDamageRules(d, kinds, resIds, fl, pl) {
    if (!isObj(d)) return null;
    var isList = function(id) { return typeof id === 'string' && FIELD_ID.test(id) && !!kinds && kinds[id] === 'item-list'; }, isPool = function(id) { return typeof id === 'string' && !!resIds && resIds[id] === 1; };
    var fx = function(s) { return pl ? '' : cleanFormulaText(s) || ''; };
    var out = {}; if (isPool(d.pool)) out.pool = d.pool;
    var mj = fx(d.major); if (mj) out.major = mj;
    if (mj && !pl && isObj(d.onMajor)) { var om = {}; if (typeof d.onMajor.fx === 'string' && EFFECT_ID.test(d.onMajor.fx)) om.fx = d.onMajor.fx; if (typeof d.onMajor.roll === 'string' && ROLL_ID.test(d.onMajor.roll)) om.roll = d.onMajor.roll; if (om.fx || om.roll) out.onMajor = om; }
    if (isObj(d.locs) && isList(d.locs.list)) {
        var lc = { list: d.locs.list };
        if (!pl) { var dr = dmgNameOk(fl, lc.list, d.locs.dr); if (dr) lc.dr = dr; var cr = dmgNameOk(fl, lc.list, d.locs.crip); if (cr) lc.crip = cr; var vt = fx(d.locs.vital); if (vt) lc.vital = vt; var lm = fx(d.locs.mult); if (lm) lc.mult = lm; var ldi = fx(d.locs.die); if (ldi) lc.die = ldi; }
        out.locs = lc;
    }
    var seen = map(), types = [];
    (Array.isArray(d.types) ? d.types : []).forEach(function(y) {
        if (types.length >= DMG_LIM.types || !isObj(y) || typeof y.key !== 'string' || !STAT_KEY.test(y.key) || seen[lower(y.key)]) return; seen[lower(y.key)] = 1;
        var o = { key: y.key, label: cutText(y.label, LIMITS.label) || y.key };
        if (isPool(y.pool)) o.pool = y.pool;
        if (!pl) {
            o.mult = dmgNum(y.mult, 0, DMG_LIM.mult, 1);
            var vm = dmgNum(y.vital, 0, DMG_LIM.mult, 0); if (vm > 0) o.vital = vm;
            var pls = []; if (out.locs) (Array.isArray(y.plus) ? y.plus : []).forEach(function(k) { var n = dmgNameOk(fl, out.locs.list, k); if (n && pls.indexOf(n) < 0 && pls.length < DMG_LIM.plus) pls.push(n); }); if (pls.length) o.plus = pls;
            if (y.noDr === true) o.noDr = true;
            if (isObj(y.alt)) { var ai = cleanFormulaText(y.alt.if); if (ai) { var al = { if: ai }; if (isPool(y.alt.pool)) al.pool = y.alt.pool; if (typeof y.alt.mult === 'number' && fin(y.alt.mult)) al.mult = dmgNum(y.alt.mult, 0, DMG_LIM.mult, 1); if (y.alt.noWear === true) al.noWear = true; o.alt = al; } }
            if (y.noWear === true) o.noWear = true;
            if (y.cuts === true) o.cuts = true;
            DMG_DIE.forEach(function(k) { var dv = dmgNum(y[k[0]], k[1], 10, 0); if (dv) o[k[0]] = dv; });   // 1.6.0: its figures a die
        }
        types.push(o);
    });
    if (types.length) out.types = types;
    if (!pl) {
        var lys = []; (Array.isArray(d.layers) ? d.layers : []).forEach(function(l) {
            if (lys.length >= DMG_LIM.layers || !isObj(l) || !isList(l.list)) return;
            var at = cleanFormulaText(l.at), w = dmgStatOk(fl, l.list, l.wear); if (!at || !w) return;
            var lo = { list: l.list, at: at, wear: w }, ws = [], pk = cleanFormulaText(l.pick);   // 1.6.0: the stat worn by location
            (Array.isArray(l.wears) ? l.wears : []).forEach(function(k) { var n = dmgStatOk(fl, l.list, k); if (n && ws.indexOf(n) < 0 && ws.length < DMG_LIM.wears) ws.push(n); });
            if (ws.length && pk) { lo.wears = ws; lo.pick = pk; }
            lys.push(lo);
        }); if (lys.length) out.layers = lys;
        var wps = []; (Array.isArray(d.weapons) ? d.weapons : []).forEach(function(l) {
            if (wps.length >= DMG_LIM.weapons || !isObj(l) || !isList(l.list)) return;
            var du = cleanFormulaText(l.dur), w = dmgStatOk(fl, l.list, l.wear), c = dmgStatOk(fl, l.list, l.cond); if (!du || !w || !c) return;
            wps.push({ list: l.list, dur: du, wear: w, cond: c });
        }); if (wps.length) out.weapons = wps;
    } else {   // the window offers the weapons the blow may test; the host reads their Dur
        var wpl = []; (Array.isArray(d.weapons) ? d.weapons : []).forEach(function(l) { if (wpl.length < DMG_LIM.weapons && isObj(l) && isList(l.list)) wpl.push({ list: l.list }); }); if (wpl.length) out.weapons = wpl;
        if (dmgDiceRead(d)) out.dice = true;   // 1.6.0: the window asks a player for the dice the blow rolled, and the host works out what they do
    }
    return out.pool || out.types || out.locs ? out : null;
}
// What a blow does: the pure step, the same on the host and on the GM's own screen. inp = { amt, type, loc, ad, weapon, only }: the damage rolled,
// the type's key, the hit location's row id, the armour divisor (1: none), a weapon row tested by the blow and whether only that weapon was hit.
// 1.6.0: inp.dice, the dice the blow rolled (0 to 100, absent 0), read by the figures a die of the type and the location (info.dice, info.dieAdd).
// Returns { ok, values, lines, info } — values: the fields changed (the pool, each list a row of which wore), lines: what it did in words, info:
// the figures — or { ok: false, reason }. The rule (the handbook's own order): DR at the location (typed DR added, divided by the armour divisor,
// rounded down), what gets through times the type's multiplier (its vital one at a vital location), at least 1 when anything gets through, off
// the type's pool; a Major Wound where the formula says; each worn layer at the location loses 1 of its listed figure, or a quarter of it rounded
// up on a Major Wound, down to minus its listed figure; a weapon's Dur less the damage: 1 to 10 over wears it 1 and makes it Damaged, 11 to 19
// takes it one condition down, 20 or more destroys it where the type cuts and else takes it one condition down (conditions 0 Fine, 1 Damaged,
// 2 Broken, 3 Destroyed)
function dmgRowPut(row, key, v) {   // a row's own stat: a library or system row's own values (held as the GM's), a row of the character's own its own
    if (isObj(row.def) && typeof row.defId !== 'string') { row.def.stats = isObj(row.def.stats) ? row.def.stats : {}; row.def.stats[key] = v; return; }
    row.ov = isObj(row.ov) ? row.ov : {}; row.ov.stats = isObj(row.ov.stats) ? row.ov.stats : {}; row.ov.stats[key] = v;
    var held = Array.isArray(row.ov.held) ? row.ov.held : []; if (!held.some(function(h) { return lower(h) === lower(key); })) held.push(key); row.ov.held = held;
}
var DMG_CONDS = ['Fine', 'Damaged', 'Broken', 'Destroyed'];
// 1.6.0 (B3): what a Major Wound does, into the step's own values and lines: its effect switched on through applyEffectOp (with the values the
// blow has written so far, so a pool the effect brings down is brought down from the wounded figure), and its roll named in info.majorRoll for
// the caller to post (wpSheets.majorFollow). Nothing where the system has no such effect or roll, or the effect is already on
function dmgOnMajor(sys, char, om, values, lines, info, F, fxo) {
    if (!isObj(om)) return;
    if (typeof om.roll === 'string' && (Array.isArray(sys.rolls) ? sys.rolls : []).some(function(r) { return isObj(r) && r.id === om.roll; })) info.majorRoll = om.roll;
    if (typeof om.fx !== 'string') return;
    var def = null; (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(e) { if (!def && isObj(e) && e.id === om.fx) def = e; }); if (!def) return;
    var wk = Object.assign({}, char, { values: Object.assign({}, char.values || {}, values) }), fxF = null, fxRow = null;
    var fxs = sys.fields.filter(function(x) { return isObj(x) && x.kind === 'effects' && typeof x.id === 'string'; });
    fxs.forEach(function(x) { (Array.isArray(wk.values[x.id]) ? wk.values[x.id] : []).forEach(function(r0) { if (!fxRow && isObj(r0) && r0.ref === def.id) { fxRow = r0; fxF = x; } }); });
    if (!fxF) fxF = fxs[0] || null; if (!fxF || (fxRow && fxRow.on !== false)) return;
    var rows = Array.isArray(wk.values[fxF.id]) ? wk.values[fxF.id] : [], rid = fxRow && typeof fxRow.id === 'string' ? fxRow.id : '';
    if (!rid) { var bse = ('x_' + def.id.slice(2)).slice(0, 20), n = 0; rid = bse; while (rows.some(function(r0) { return isObj(r0) && r0.id === rid; })) rid = bse + '_' + (++n); }
    var eo = applyEffectOp(sys, wk, fxF.id, { op: 'add', rowId: rid, ref: def.id }, F, { now: isObj(fxo) && typeof fxo.now === 'number' ? fxo.now : 0, inCombat: !!(isObj(fxo) && fxo.inCombat) });
    if (!eo.ok) return;
    values[fxF.id] = eo.value; if (isObj(eo.clamp)) Object.keys(eo.clamp).forEach(function(k) { values[k] = eo.clamp[k]; });
    info.majorFx = def.id; lines.push((def.name || 'An effect') + ' goes on.');
}
// 1.6.0 Spills into (the owner, by prompt, 2026-10-29: "The pool's own option", "A pick, with a formula"): a pool's spill, { to, at, below }.
// What a loss takes it past its spill point goes on into the pool to, and on from that one where it spills too, each pool once. at: absent, its
// least value; 'neg', minus its full value; 'f', the formula below (the character's names, no dice). The pool's own value stays where its least
// value holds it. Only a loss spills: the damage step's wound and an apply action's Subtract (its each-round, each-turn and time-rule runs too);
// a value typed, a Set to, an Add and an effect's clamp never do, and what spills is no wound (no Major Wound, no wear). spillPast: how much of
// loss goes on, from cur as R read it, or { error }. poolSpill: each pool it reaches, written onto w.values (a working copy, its values as the
// loss left them): { steps: [{ f, label, amt, v, value }] } or { error }
function spillPast(pf, cur, loss, R, F) {
    var sp = isObj(pf) && isObj(pf.spill) ? pf.spill : null; if (!sp || !(loss > 0) || typeof cur !== 'number' || !fin(cur)) return 0;
    var at = null;
    if (sp.at === 'neg') { var mx = R(pf.key + '.max'); if (typeof mx === 'number' && fin(mx)) at = -mx; }
    else if (sp.at === 'f') { var ev = F.evaluate(sp.below, { vars: R, random: noDice }); if (ev && ev.ok && typeof ev.value === 'number' && fin(ev.value)) at = ev.value; }
    else at = typeof pf.min === 'number' && fin(pf.min) ? pf.min : 0;
    if (at === null) return { error: 'Where ' + (pf.label || pf.key) + ' spills could not be worked out.' };
    var left = cur - loss; return left >= at ? 0 : Math.max(0, Math.round(Math.min(loss, at - left)));
}
function poolSpill(sys, w, pf, cur, loss, F, tctx) {
    var steps = [], seen = map(), f = pf, c = cur, l = loss; seen[pf.id] = 1;
    for (var hop = 0; hop < LIMITS.fields && isObj(f) && isObj(f.spill); hop++) {
        var n = spillPast(f, c, l, makeResolver(sys, w, F, tctx || null), F); if (isObj(n)) return n; if (!(n > 0)) break;
        var tf = fieldById(sys, f.spill.to); if (!tf || tf.kind !== 'resource' || seen[tf.id] === 1) break; seen[tf.id] = 1;
        var Rt = makeResolver(sys, w, F, tctx || null), ct = Rt(tf.key); ct = typeof ct === 'number' && fin(ct) ? ct : 0;
        var ed = applyEdit(sys, w, tf.id, { cur: ct - n }, F, { vars: Rt }); if (!ed.ok) return { error: 'It could not spill into ' + (tf.label || tf.key) + '.' };
        w.values[tf.id] = ed.value; steps.push({ f: tf.id, label: tf.label || tf.key, amt: n, v: ed.value.cur, value: ed.value });
        f = tf; c = ct; l = n;
    }
    return { steps: steps };
}
function damageStep(sys, char, inp, F, ropts, fxo) {   // 1.6.0 (B3): fxo, the clock an effect a Major Wound switches on starts its timer by ({ now, inCombat }, as applyAct's)
    var rules = sys && isObj(sys.combat) && isObj(sys.combat.damage) ? sys.combat.damage : null; if (!rules || !F || !isObj(char)) return { ok: false, reason: 'field' };
    if (!isObj(inp) || typeof inp.amt !== 'number' || !fin(inp.amt) || inp.amt < 0 || inp.amt > DMG_LIM.amt) return { ok: false, reason: 'value' };
    var amt = Math.floor(inp.amt), ad = typeof inp.ad === 'number' && fin(inp.ad) && inp.ad > 0 ? clampNum(inp.ad, 0.1, 100) : 1;
    var dice = typeof inp.dice === 'number' && fin(inp.dice) && inp.dice > 0 ? Math.min(DMG_LIM.dice, Math.floor(inp.dice)) : 0;   // 1.6.0: the dice the blow rolled
    var R = makeResolver(sys, char, F, ropts), num = function(v) { return typeof v === 'number' && fin(v) ? v : 0; }, yes = function(v) { return v === true || (typeof v === 'number' && v !== 0); };
    var ev = function(text, vars) { var r = F.evaluate(text, { vars: vars, random: noDice }); return r && r.ok ? r.value : null; };
    var ty = null; (rules.types || []).forEach(function(y) { if (!ty && typeof inp.type === 'string' && lower(y.key) === lower(inp.type)) ty = y; });
    if (inp.type && !ty) return { ok: false, reason: 'value' };
    var pool = (ty && ty.pool) || rules.pool || (sys.combat.hpResource || ''), mult = ty ? (typeof ty.mult === 'number' ? ty.mult : 1) : 1, noWear = !!(ty && ty.noWear);
    if (ty && ty.alt && yes(ev(ty.alt.if, R))) { if (ty.alt.pool) pool = ty.alt.pool; if (typeof ty.alt.mult === 'number') mult = ty.alt.mult; noWear = ty.alt.noWear === true; }
    var pf = pool ? fieldById(sys, pool) : null; if (!pf || pf.kind !== 'resource') return { ok: false, reason: 'field' };
    var values = {}, lines = [], info = { amt: amt, ad: ad, dr: 0, through: 0, wound: 0, pool: pf.key, major: false, crip: false, wear: [], weapon: null };
    if (dice) info.dice = dice;
    var dWear = dice && ty && ty.dieWear > 0 && !noWear ? Math.floor(dice * ty.dieWear) : 0;   // 1.6.0: worn off each layer for good, by the dice
    var lf = rules.locs ? fieldById(sys, rules.locs.list) : null, lrows = lf && char.values && Array.isArray(char.values[lf.id]) ? char.values[lf.id] : [], lrow = null;
    if (typeof inp.loc === 'string' && inp.loc) { lrows.forEach(function(r) { if (!lrow && rowIdOf(r) === inp.loc) lrow = r; }); if (!lrow) return { ok: false, reason: 'missing' }; }
    var hitV = lrow ? R.row(lf.id, inp.loc) : null, lname = '';
    var hitR = function(l, text) { if (/^hit\./.test(l)) return hitV ? hitV(l.replace(/^hit\./, 'row.'), text) : 0; return R(l, text); };   // 1.6.0 (B3): the Major Wound's threshold reads Hit.<name> of the location struck
    if (lrow) { var lrd = rowDef(sys, lrow); lname = lrd && lrd.def && typeof lrd.def.name === 'string' ? lrd.def.name : 'the location'; }
    var err = '', get = function(f, row, key) { var v = R.cell(f, row, key); if (v === undefined) v = R.stat(f, row, key); if (isObj(v) && v.error) { err = err || String(v.error.message || 'an error'); return 0; } return num(v); };
    if (!inp.only) {
        var dr = 0;
        if (lrow && !(ty && ty.noDr)) { if (rules.locs.dr) dr = get(lf, lrow, rules.locs.dr); (ty && ty.plus ? ty.plus : []).forEach(function(k) { dr += get(lf, lrow, k); }); if (dice && ty && ty.dieDr) dr += dice * ty.dieDr; }   // 1.6.0: and its DR a die, for this blow
        if (err) return { ok: false, reason: 'error', message: 'The DR there could not be worked out: ' + err };
        dr = Math.max(0, dr); var eff = Math.floor(dr / ad), through = Math.max(0, amt - eff);
        var mainPool = pool === (rules.pool || sys.combat.hpResource), lmv = lrow && mainPool && rules.locs.mult && hitV ? num(ev(rules.locs.mult, hitV)) : 0;
        if (lmv > 0) mult = clampNum(lmv, 0, DMG_LIM.mult);   // the location's own multiplier (the skull's x4) before a type's vital one
        else if (lrow && ty && ty.vital > 0 && rules.locs.vital && hitV && yes(ev(rules.locs.vital, hitV))) mult = ty.vital;
        var dieAdd = 0;   // 1.6.0: what the dice add to a wound that gets through: the type's figure a die, its vital one at a vital location, and the location's own
        if (dice && through > 0 && mult > 0) {
            var per = ty && ty.dieWound ? ty.dieWound : 0;
            if (lrow && ty && ty.dieVital && rules.locs.vital && hitV && yes(ev(rules.locs.vital, hitV))) per += ty.dieVital;
            if (lrow && rules.locs.die && hitV) per += num(ev(rules.locs.die, hitV));
            dieAdd = Math.floor(dice * per); if (dieAdd) info.dieAdd = dieAdd;
        }
        var wound = through > 0 && mult > 0 ? Math.max(1, Math.floor(through * mult) + dieAdd) : 0;
        info.dr = eff; info.through = through; info.wound = wound;
        lines.push((ty ? ty.label + ' ' : '') + amt + (lrow ? ' to ' + lname : '') + (eff ? ', DR ' + eff : '') + ': ' + (through ? through + ' through' + (mult !== 1 ? ' \u00d7' + mult : '') + (dieAdd ? ' ' + (dieAdd > 0 ? '+' : '\u2212') + Math.abs(dieAdd) + ' for ' + dice + (dice === 1 ? ' die' : ' dice') : '') + ', ' + wound + ' ' + (pf.label || pf.key) : 'nothing gets through'));
        if (wound > 0) {
            var cur = num(R(pf.key)), mn = typeof pf.min === 'number' ? pf.min : 0, nv = Math.max(mn, cur - wound);
            var ed = applyEdit(sys, char, pf.id, nv, F, { vars: R }); if (!ed.ok) return { ok: false, reason: ed.reason || 'value' };
            values[pf.id] = ed.value;
            if (isObj(pf.spill)) {   // 1.6.0 Spills into: what the wound takes it past its spill point goes on into another pool (no wound of its own)
                var spW = Object.assign({}, char, { values: Object.assign({}, char.values || {}, values) }), spD = poolSpill(sys, spW, pf, cur, wound, F, ropts); if (spD.error) return { ok: false, reason: 'error', message: spD.error };
                var spHid = spD.steps.length ? gmPools(sys, F) : null;   // a GM-only pool is never named in the lines, which reach the wounded character's player
                spD.steps.forEach(function(s) { values[s.f] = s.value; var sf = fieldById(sys, s.f); if (sf && sf.vis !== 'gm' && spHid[s.f] !== 1) lines.push(s.amt + ' spill' + (s.amt === 1 ? 's' : '') + ' into ' + s.label + '.'); (info.spill = info.spill || []).push({ f: s.f, amt: s.amt }); });
            }
            if (pool === (rules.pool || sys.combat.hpResource) && rules.major) { var th = num(ev(rules.major, hitR)); if (th > 0 && wound >= th) { info.major = true; lines.push('A Major Wound.'); dmgOnMajor(sys, char, rules.onMajor, values, lines, info, F, fxo); } }
            if (lrow && rules.locs.crip) { var cp = get(lf, lrow, rules.locs.crip); if (cp > 0 && wound > cp) { info.crip = true; lines.push('Enough to cripple ' + lname + '.'); } }
        }
        if (lrow && !noWear && (wound > 0 || dWear > 0)) (rules.layers || []).forEach(function(ly) {   // 1.6.0: a type that wears by the dice wears whether or not the blow gets through
            var f = fieldById(sys, ly.list), src = f && char.values && Array.isArray(char.values[f.id]) ? char.values[f.id] : null; if (!src || !f.list) return;
            var list = JSON.parse(JSON.stringify(src)), changed = false, hasOn = isObj(f.list.on);
            list.forEach(function(row) {
                if (!isObj(row) || row.hid === 1 || (hasOn && row.on !== true)) return;
                var rid = rowIdOf(row), rv = rid ? R.row(f.id, rid) : null; if (!rv) return;
                var both = function(l, text) { if (/^hit\./.test(l)) return hitV(l.replace(/^hit\./, 'row.'), text); return rv(l, text); };
                var listed = Math.floor(num(ev(ly.at, both))); if (listed <= 0) return;
                var wk = ly.wear; if (Array.isArray(ly.wears) && ly.pick) { var pi = Math.round(num(ev(ly.pick, both))); if (pi >= 1 && pi <= ly.wears.length) wk = ly.wears[pi - 1]; }   // 1.6.0: the stat worn where it struck
                var w = num(R.stat(f, row, wk)), beats = wound > 0 && amt > Math.max(0, listed - w); if (!beats && !dWear) return;   // the blow is more than it as it stands
                var step = (beats ? (info.major ? Math.ceil(listed / 4) : 1) : 0) + dWear, nw = Math.min(listed * 2, w + step); if (nw === w) return;
                dmgRowPut(row, wk, nw); changed = true;
                var rd = rowDef(sys, row), nm = rd && rd.def && rd.def.name ? rd.def.name : 'A piece';
                var wi = { list: f.id, row: rid, from: listed - w, to: listed - nw }; if (wk !== ly.wear) wi.stat = wk; info.wear.push(wi);
                lines.push(nm + ': ' + (listed - w) + ' \u2192 ' + (listed - nw) + (listed - nw <= -listed ? ', destroyed' : listed - nw <= 0 ? ', broken' : ', damaged') + '.');
            });
            if (changed) values[f.id] = list;
        });
    }
    if (typeof inp.weapon === 'string' && inp.weapon) {
        var hit = null; (rules.weapons || []).forEach(function(wp) { if (hit) return; var f = fieldById(sys, wp.list), src = f && char.values && Array.isArray(char.values[f.id]) ? char.values[f.id] : null; if (src && src.some(function(r) { return rowIdOf(r) === inp.weapon; })) hit = { wp: wp, f: f, src: src }; });
        if (!hit) return { ok: false, reason: 'missing' };
        var wl = values[hit.f.id] || JSON.parse(JSON.stringify(hit.src)), wrow = null; wl.forEach(function(r) { if (!wrow && rowIdOf(r) === inp.weapon) wrow = r; });
        var wv = R.row(hit.f.id, inp.weapon), ld = wv ? Math.floor(num(ev(hit.wp.dur, wv))) : 0, wear = num(R.stat(hit.f, wrow, hit.wp.wear)), cond = clampNum(Math.floor(num(R.stat(hit.f, wrow, hit.wp.cond))), 0, 3);
        var over = amt - (ld - wear), nc = cond, nw2 = wear, wrd = rowDef(sys, wrow), wn = wrd && wrd.def && wrd.def.name ? wrd.def.name : 'The weapon';
        if (ld > 0 && over >= 1 && cond < 3) {
            if (over <= 10) { nw2 = Math.min(ld * 2, wear + 1); nc = Math.max(cond, 1); }
            else if (over >= 20 && ty && ty.cuts) nc = 3;
            else nc = cond >= 2 ? 3 : 2;
            if (ld - nw2 <= -ld) nc = 3; else if (ld - nw2 <= 0) nc = Math.max(nc, 2);
        }
        if (nw2 !== wear) dmgRowPut(wrow, hit.wp.wear, nw2);
        if (nc !== cond) dmgRowPut(wrow, hit.wp.cond, nc);
        if (nw2 !== wear || nc !== cond) values[hit.f.id] = wl;
        info.weapon = { list: hit.f.id, row: inp.weapon, dur: ld - nw2, cond: nc, over: over };
        lines.push(wn + (ld > 0 ? ': Dur ' + (ld - wear) + (nw2 !== wear ? ' \u2192 ' + (ld - nw2) : '') : '') + ', ' + DMG_CONDS[nc] + (nc === cond ? ' still' : '') + '.');
    }
    return { ok: true, values: values, lines: lines, info: info };
}
// A player's blow on their own character, as it rides the wire: { rid, charId, q: damageStep's inp } or null
function cleanCharDamage(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId)) return null;
    if (typeof msg.amt !== 'number' || !fin(msg.amt) || msg.amt < 0 || msg.amt > DMG_LIM.amt) return null;
    var q = { amt: Math.floor(msg.amt) };
    if (msg.dtype !== undefined) { if (typeof msg.dtype !== 'string' || !STAT_KEY.test(msg.dtype)) return null; q.type = msg.dtype; }   // the damage type rides as dtype: type is the message's own
    if (msg.loc !== undefined) { if (typeof msg.loc !== 'string' || !ROW_ID.test(msg.loc)) return null; q.loc = msg.loc; }
    if (msg.ad !== undefined) { if (typeof msg.ad !== 'number' || !fin(msg.ad) || msg.ad < 0.1 || msg.ad > 100) return null; q.ad = msg.ad; }
    if (msg.dice !== undefined) { if (typeof msg.dice !== 'number' || !fin(msg.dice) || Math.floor(msg.dice) !== msg.dice || msg.dice < 0 || msg.dice > DMG_LIM.dice) return null; if (msg.dice) q.dice = msg.dice; }   // 1.6.0: the dice the blow rolled
    if (msg.weapon !== undefined) { if (typeof msg.weapon !== 'string' || !ROW_ID.test(msg.weapon)) return null; q.weapon = msg.weapon; if (msg.only === true) q.only = true; }
    return { rid: msg.rid, charId: msg.charId, q: q };
}
// [systemcheck:damage-end]
// [systemcheck:trade-start]
// 1.5.6 trading (backlog 157; the owner, 2026-10-18: "a barter screen the gm/ players put items and/or money into on their side. both people
// trading see the other's offer and when both sides confirm, the trade is completed", and 2026-10-24: "using npcs as merchants with inventories of
// items they sell"). Pure: what a side may put on the table (tradeOfferable), an offer cleaned against it (cleanTradeOffer), and the trade itself,
// all or none, on copies (tradeApply). A row moves by its quantity, or a part of a figure ticked Split in trades (a list's level or a number stat)
// moves as an amount. Only what players may see is ever offered: a list players see and a row whose definition is not GM-only, on both sides,
// since the other side holds it afterwards. who 'player': only a list its owner may change (edit owner)
var TRADE_LINES = 40;
function tradeEntry(a, b) { if (!isObj(a) || !isObj(b)) return false; if (typeof a.defId === 'string') return a.defId === b.defId; return typeof b.defId !== 'string' && isObj(a.def) && isObj(b.def) && lower(a.def.name || '') === lower(b.def.name || ''); }
function tradeFields(sys, who) { return (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list' && isObj(f.list) && f.list.trade === true && f.vis === 'all' && (who !== 'player' || f.edit === 'owner'); }); }   // only a list ticked Tradable
function tradeOfferable(sys, char, who) {
    var out = []; if (!isObj(sys) || !isObj(char)) return out;
    tradeFields(sys, who).forEach(function(f) {
        var spec = isObj(f.list) ? f.list : {}, rows = isObj(char.values) && Array.isArray(char.values[f.id]) ? char.values[f.id] : [];
        rows.forEach(function(r) {
            if (!isObj(r) || r.hid === 1) return; var rid = rowIdOf(r), rd = rowDef(sys, r); if (!rid || !rd || !isObj(rd.def) || rd.def.vis === 'gm') return;
            var q = clampNum(cleanNum(r.qty, 1) | 0, 1, LIMITS.maxQty), e = { fid: f.id, list: f.label || 'List', rowId: rid, name: cutText(rd.def.name, LIMITS.itemName) || 'Item', qty: q, split: [] };
            if (q === 1 && isObj(spec.lvl) && spec.lvl.split === true) e.split.push({ key: '@lvl', label: spec.lvl.label || 'Level', max: rowLvl(spec, r, rd.def), step: spec.lvl.step > 0 ? spec.lvl.step : 1 });
            if (q === 1) (Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (isObj(s) && s.split === true && s.kind !== 'pick') e.split.push({ key: s.key, label: s.label || s.key, max: rowStat(spec, rd.def, s.key), step: 0.01 }); });
            if (spec.price) { var pr = rowStat(spec, rd.def, spec.price); if (fin(pr) && pr !== 0) e.price = pr; }
            var kids = tradeCarry(sys, char.values, rid), gby = typeof r.gr === 'string' ? tradeRowAt(sys, char.values, r.gr) : null, kn = tradeKidsSeen(sys, kids);
            if (kn) { e.with = kn; e.name += ', with ' + kn + ' more'; }
            if (r.keptOn === 1) e.no = 'It cannot be taken off.';
            else if (gby) { var gd = rowDef(sys, gby); e.no = 'It came with ' + (gd && isObj(gd.def) && gd.def.vis !== 'gm' ? cutText(gd.def.name, LIMITS.itemName) || 'another row' : 'another row') + ', and goes with it.'; }
            else if (rowOn(spec, r) && RM_MODES[rd.def.eq] === 1 && who === 'player') e.no = 'It cannot be taken off while it is on.';
            else if (RM_MODES[rd.def.rm] === 1 && who === 'player') e.no = 'It cannot be given away.';
            else kids.forEach(function(k) { if (e.no) return; var kd = rowDef(sys, k.row), ks = tradeSpec(sys, k.f); if (k.row.keptOn === 1 || k.row.hid === 1) e.no = 'Something with it cannot be taken off.'; else if (who === 'player' && k.how === 'in' && kd && isObj(kd.def) && (RM_MODES[kd.def.rm] === 1 || (rowOn(ks, k.row) && RM_MODES[kd.def.eq] === 1))) e.no = 'Something with it cannot be given away.'; });
            out.push(e);
        });
    });
    return out;
}
// 1.6.0 (v2): what goes with a row that changes hands whole: the rows it granted (gr, B4) and the parts it holds (in, R14), and theirs in turn,
// as they stand, each found after the row it goes with; [{ f, row, by, how }], how 'gr' or 'in'. A granted row goes only with its granter
function tradeCarry(sys, values, rid) {
    var out = [], ids = map(), fids = itemListIds(sys), grew = true, n = 0; if (typeof rid !== 'string') return out; ids[rid] = 1;
    while (grew && n++ < 8 && out.length < LIMITS.carried) {
        grew = false; var add = [];
        fids.forEach(function(fid) { (isObj(values) && Array.isArray(values[fid]) ? values[fid] : []).forEach(function(r) {
            var id = rowIdOf(r); if (!isObj(r) || !id || ids[id] === 1) return;
            var how = typeof r.gr === 'string' && ids[r.gr] === 1 ? 'gr' : typeof r.in === 'string' && ids[r.in] === 1 ? 'in' : ''; if (how) add.push({ f: fid, row: r, by: r[how], how: how });
        }); });
        add.forEach(function(a) { if (ids[rowIdOf(a.row)] === 1) return; ids[rowIdOf(a.row)] = 1; out.push(a); grew = true; });
    }
    return out;
}
function tradeRowAt(sys, values, rid) { var hit = null; itemListIds(sys).forEach(function(fid) { (isObj(values) && Array.isArray(values[fid]) ? values[fid] : []).forEach(function(r) { if (!hit && isObj(r) && rowIdOf(r) === rid) hit = r; }); }); return hit; }
function tradeSpec(sys, fid) { var f = fieldById(sys, fid); return isObj(f && f.list) ? f.list : {}; }
function tradeKidsSeen(sys, kids) { return kids.filter(function(k) { var d = rowDef(sys, k.row); return k.row.hid !== 1 && !!(d && isObj(d.def)) && d.def.vis !== 'gm'; }).length; }   // what is said goes with it: never a GM-only entry
function tradeRound(n, step) { var s = step > 0 ? step : 0.01, x = Math.round(n / s) * s; return Math.round(x * 1e6) / 1e6; }
// an offer as the side may make it NOW: each line names a row tradeOfferable lists without a reason; qty a whole number 1..its quantity; amt a
// number above 0 and no more than the figure holds, on the figure's step; a row once by quantity, or once for each figure by amount, never both
function cleanTradeOffer(sys, char, offer, who) {
    var can = map(), out = [], used = map(); tradeOfferable(sys, char, who).forEach(function(e) { can[e.fid + '|' + e.rowId] = e; });
    (Array.isArray(offer) ? offer.slice(0, TRADE_LINES * 2) : []).forEach(function(l) {
        if (out.length >= TRADE_LINES || !isObj(l) || typeof l.fid !== 'string' || typeof l.rowId !== 'string') return;
        var k = l.fid + '|' + l.rowId, e = Object.prototype.hasOwnProperty.call(can, k) ? can[k] : null; if (!e || e.no) return;
        if (l.key === undefined) {
            var q = typeof l.qty === 'number' && fin(l.qty) ? Math.floor(l.qty) : NaN; if (!(q >= 1) || q > e.qty || used[k] || used[k + '|amt']) return;
            used[k] = 1; out.push({ fid: e.fid, rowId: e.rowId, qty: q });
        } else {
            var sp = null; e.split.forEach(function(s) { if (!sp && typeof l.key === 'string' && lower(s.key) === lower(l.key)) sp = s; }); if (!sp || used[k] || used[k + '|' + lower(sp.key)]) return;
            var a = typeof l.amt === 'number' && fin(l.amt) ? tradeRound(l.amt, sp.step) : NaN; if (!(a > 0) || a > sp.max + 1e-9) return;
            used[k + '|amt'] = 1; used[k + '|' + lower(sp.key)] = 1; out.push({ fid: e.fid, rowId: e.rowId, key: sp.key, amt: a });
        }
    });
    return out;
}
// 1.5.6, the receiver picks a chip (docs/TRADE_PLAN.md: "The receiver picks a chip (Recommended)", the first by default): the rows of the
// receiver's own list an amount of key from the giver's row like may land on. A level (a chip's money) any row of that list of quantity 1, a stat
// only a row of the same entry; never a hidden row, a kept curse or a GM-only entry. [{ rowId, name, cur }], 40 at most
function tradeInto(sys, char, fid, key, like) {
    var f = fieldById(sys, fid), spec = isObj(f && f.list) ? f.list : null, out = []; if (!spec || !isObj(char) || typeof key !== 'string') return out;
    var isL = key === '@lvl'; if (isL && !isObj(spec.lvl)) return out;
    (isObj(char.values) && Array.isArray(char.values[fid]) ? char.values[fid] : []).forEach(function(r) {
        if (out.length >= TRADE_LINES || !isObj(r) || r.hid === 1 || r.keptOn === 1 || (r.qty | 0 || 1) !== 1) return; var rid = rowIdOf(r), rd = rowDef(sys, r); if (!rid || !rd || !isObj(rd.def) || rd.def.vis === 'gm') return;
        if (!isL && !tradeEntry(r, like)) return;
        out.push({ rowId: rid, name: cutText(rd.def.name, LIMITS.itemName) || 'Item', cur: isL ? rowLvl(spec, r, rd.def) : rowStat(spec, rd.def, key) });
    });
    return out;
}
function tradeNewId(list) { for (var i = 0; i < 50; i++) { var id = uid('w_'); if (!list.some(function(r) { return rowIdOf(r) === id; })) return id; } return null; }
// the trade, all or none, on copies of both sides' lists. offA is what A gives, offB what B gives, each as cleanTradeOffer gave it when it was put
// on the table: cleaned again against both characters as they are now, and a line that no longer holds refuses the whole trade
function tradeApply(sys, a, b, offA, offB, whoA, whoB, into) {   // into { a: { fid: rowId | '+' }, b: ... }: where what each side receives lands, its own pick; '+' a row of its own
    var ca = cleanTradeOffer(sys, a, offA, whoA), cb = cleanTradeOffer(sys, b, offB, whoB);
    var same = function(x, y) { return JSON.stringify(x) === JSON.stringify(Array.isArray(y) ? y : []); };
    if (!same(ca, offA) || !same(cb, offB)) return { ok: false, reason: 'changed', msg: 'Something on the table changed. Look again and confirm.' };
    if (!ca.length && !cb.length) return { ok: false, reason: 'empty', msg: 'Nothing is on the table.' };
    var vals = { a: map(), b: map() }, lines = { a: [], b: [] }, err = null;
    var listOf = function(side, ch, fid) { if (!Object.prototype.hasOwnProperty.call(vals[side], fid)) vals[side][fid] = JSON.parse(JSON.stringify(isObj(ch.values) && Array.isArray(ch.values[fid]) ? ch.values[fid] : [])); return vals[side][fid]; };
    var at = function(list, rid) { for (var i = 0; i < list.length; i++) if (rowIdOf(list[i]) === rid) return i; return -1; };
    // each side's lines are taken off the giver first, all of them, so that what one side receives never feeds what it gives
    var moving = { a: [], b: [] }, gone = { a: map(), b: map() };
    var seenOf = function(side, ch) { var v = map(); itemListIds(sys).forEach(function(fid) { v[fid] = Object.prototype.hasOwnProperty.call(vals[side], fid) ? vals[side][fid] : isObj(ch.values) && Array.isArray(ch.values[fid]) ? ch.values[fid] : []; }); return v; };
    [['a', a, ca], ['b', b, cb]].forEach(function(s) {
        s[2].forEach(function(l) {
            if (err || gone[s[0]][l.rowId] === 1) return;   // 1.6.0: a part already gone with its host
            var f = fieldById(sys, l.fid), spec = isObj(f && f.list) ? f.list : {}, list = listOf(s[0], s[1], l.fid), i = at(list, l.rowId); if (i < 0) { err = 'changed'; return; }
            var r = list[i], rd = rowDef(sys, r), nm = (rd && rd.def && rd.def.name) || 'Item';
            if (l.key === undefined) {
                var mv = JSON.parse(JSON.stringify(r)), kids = []; mv.qty = l.qty; delete mv.keptOn; delete mv.hid; delete mv.gr; delete mv.in; if (isObj(spec.on)) mv.on = false;   // 1.6.0: alone, it is no one's grant or part there
                if (l.qty >= (r.qty | 0 || 1)) {
                    list.splice(i, 1);
                    tradeCarry(sys, seenOf(s[0], s[1]), l.rowId).forEach(function(k) { var kl = listOf(s[0], s[1], k.f), ki = at(kl, rowIdOf(k.row)); if (ki < 0) return; kids.push({ f: k.f, how: k.how, by: k.by, old: rowIdOf(k.row), row: JSON.parse(JSON.stringify(kl[ki])) }); kl.splice(ki, 1); gone[s[0]][rowIdOf(k.row)] = 1; });
                } else { r.qty = (r.qty | 0) - l.qty; delete mv.id; }
                var kn = tradeKidsSeen(sys, kids), wn = kn ? ', with ' + kn + ' more' : '';
                moving[s[0]].push({ fid: l.fid, row: mv, kids: kids, oid: l.rowId }); s[0] === 'a' ? lines.a.push(nm + (l.qty > 1 ? ' x' + l.qty : '') + wn) : lines.b.push(nm + (l.qty > 1 ? ' x' + l.qty : '') + wn);
            } else {
                var isL = l.key === '@lvl', have = isL ? rowLvl(spec, r, rd && rd.def) : rowStat(spec, rd && rd.def, l.key), left = tradeRound(have - l.amt, isL ? spec.lvl.step : 0.01);
                if (left < -1e-9 || (isL && spec.lvl.min !== undefined && left < spec.lvl.min - 1e-9)) { err = 'changed'; return; }
                if (isL) r.lvl = left; else if (typeof r.defId === 'string') { r.ov = isObj(r.ov) ? r.ov : {}; r.ov.stats = isObj(r.ov.stats) ? r.ov.stats : {}; r.ov.stats[l.key] = left; } else { r.def.stats = isObj(r.def.stats) ? r.def.stats : {}; r.def.stats[l.key] = left; }
                var lab = isL ? (spec.lvl.label || 'Level') : ((spec.stats || []).filter(function(x) { return x.key === l.key; })[0] || {}).label || l.key;
                moving[s[0]].push({ fid: l.fid, amt: l.amt, key: l.key, like: r }); lines[s[0]].push(fmtNum(l.amt) + ' ' + lab + ' from ' + nm);
            }
        });
    });
    if (err) return { ok: false, reason: 'changed', msg: 'Something on the table changed. Look again and confirm.' };
    // then each lands on the other side
    [['a', 'b', b], ['b', 'a', a]].forEach(function(s) {
        moving[s[0]].forEach(function(m) {
            if (err) return; var f = fieldById(sys, m.fid), spec = isObj(f && f.list) ? f.list : {}, list = listOf(s[1], s[2], m.fid), live = function(r) { return isObj(r) && r.hid !== 1 && r.keptOn !== 1; };
            if (m.row) {
                var mv = m.row, j = -1;
                if (typeof mv.defId === 'string' && !isObj(mv.ov) && !m.kids.length) for (var k = 0; k < list.length; k++) { var r = list[k]; if (live(r) && r.defId === mv.defId && !isObj(r.ov) && !(isObj(spec.on) && rowOn(spec, r)) && (r.lvl === mv.lvl) && !isObj(r.ct) && !isObj(r.ld) && !Array.isArray(r.rd) && !isObj(r.fd)) { j = k; break; } }   // 1.5.8: never onto a row that holds a loaded copy
                if (j >= 0 && spec.noQty) { err = 'one'; return; }
                if (j >= 0 && !isObj(mv.ct) && !isObj(mv.ld) && !Array.isArray(mv.rd) && !isObj(mv.fd)) { list[j].qty = clampNum((list[j].qty | 0) + mv.qty, 1, LIMITS.maxQty); return; }
                if (spec.noQty && list.some(function(r) { return live(r) && tradeEntry(r, mv); })) { err = 'one'; return; }
                if (list.filter(live).length >= LIMITS.carried) { err = 'full'; return; }
                if (!mv.id || at(list, mv.id) >= 0) { var nid = tradeNewId(list); if (!nid) { err = 'full'; return; } mv.id = nid; }
                list.push(mv);
                // 1.6.0: what it granted and the parts it holds come in with it, each a row of its own linked to its new id. A grant the
                // receiver's list holds once already is not granted again (as an add's), and what it granted with it; a part whose host
                // did not come lands loose
                var nids = map(); nids[m.oid] = mv.id;
                m.kids.forEach(function(k) {
                    if (err) return; var ks = tradeSpec(sys, k.f), kl = listOf(s[1], s[2], k.f), kr = JSON.parse(JSON.stringify(k.row));
                    if (k.how === 'gr' && !nids[k.by]) return;
                    delete kr.keptOn; delete kr.hid; if (isObj(ks.on)) kr.on = false;
                    ['gr', 'in'].forEach(function(w) { if (typeof kr[w] === 'string') { if (nids[kr[w]]) kr[w] = nids[kr[w]]; else delete kr[w]; } });
                    if (ks.noQty && kl.some(function(r) { return live(r) && tradeEntry(r, kr); })) { if (k.how === 'gr' && !ks.multi) return; if (k.how !== 'gr') { err = 'one'; return; } }
                    if (kl.filter(live).length >= LIMITS.carried) { err = 'full'; return; }
                    if (!kr.id || at(kl, kr.id) >= 0) { kr.id = k.old && at(kl, k.old) < 0 ? k.old : tradeNewId(kl); if (!kr.id) { err = 'full'; return; } }
                    nids[k.old] = kr.id; kl.push(kr);
                });
            } else {
                var isL = m.key === '@lvl', tgt = -1, pick = function(test) { for (var k2 = 0; tgt < 0 && k2 < list.length; k2++) if (live(list[k2]) && (list[k2].qty | 0 || 1) === 1 && test(list[k2])) tgt = k2; };
                var mineIn = isObj(into) && isObj(into[s[1]]) ? into[s[1]] : null, want = mineIn && Object.prototype.hasOwnProperty.call(mineIn, m.fid) && typeof mineIn[m.fid] === 'string' ? mineIn[m.fid] : '';
                if (want && want !== '+') {   // the receiver's own pick: gone or no longer fit refuses, a stat whose entry it is not lands as it would
                    var wi = at(list, want), wr = wi >= 0 ? list[wi] : null, wd = wr ? rowDef(sys, wr) : null;
                    if (!wr || !live(wr) || (wr.qty | 0 || 1) !== 1 || !wd || !isObj(wd.def) || wd.def.vis === 'gm') { err = 'changed'; return; }
                    if (isL || tradeEntry(wr, m.like)) tgt = wi;
                }
                if (want !== '+') { pick(function(r) { return tradeEntry(r, m.like) && !rowOn(spec, r); }); pick(function(r) { return tradeEntry(r, m.like); }); if (isL) pick(function(r) { return !rowOn(spec, r); }); }   // a level (a chip's money) may land on another chip of the list; a stat only on the same entry, else a row of its own
                if (tgt < 0) {
                    if (list.filter(live).length >= LIMITS.carried) { err = 'full'; return; }
                    var nr = JSON.parse(JSON.stringify(m.like)); delete nr.keptOn; delete nr.hid; delete nr.ct; delete nr.ld; delete nr.rd; delete nr.fd; delete nr.note; nr.qty = 1; nr.id = tradeNewId(list); if (!nr.id) { err = 'full'; return; } if (isObj(spec.on)) nr.on = false;
                    if (isL) nr.lvl = 0; else if (typeof nr.defId === 'string') { nr.ov = isObj(nr.ov) ? nr.ov : {}; nr.ov.stats = isObj(nr.ov.stats) ? nr.ov.stats : {}; nr.ov.stats[m.key] = 0; } else { nr.def.stats = isObj(nr.def.stats) ? nr.def.stats : {}; nr.def.stats[m.key] = 0; }
                    list.push(nr); tgt = list.length - 1;
                }
                var tr = list[tgt], rdT = rowDef(sys, tr), cur = isL ? rowLvl(spec, tr, rdT && rdT.def) : rowStat(spec, rdT && rdT.def, m.key), nv = tradeRound(cur + m.amt, isL ? spec.lvl.step : 0.01);
                if (isL && spec.lvl.max !== undefined && nv > spec.lvl.max + 1e-9) { err = 'max'; return; }
                if (isL) tr.lvl = nv; else if (typeof tr.defId === 'string') { tr.ov = isObj(tr.ov) ? tr.ov : {}; tr.ov.stats = isObj(tr.ov.stats) ? tr.ov.stats : {}; tr.ov.stats[m.key] = nv; } else { tr.def.stats = isObj(tr.def.stats) ? tr.def.stats : {}; tr.def.stats[m.key] = nv; }
            }
        });
    });
    if (err === 'one') return { ok: false, reason: 'one', msg: 'A list there holds one of each, and that one is already there.' };
    if (err === 'full') return { ok: false, reason: 'full', msg: 'A list there is full.' };
    if (err === 'max') return { ok: false, reason: 'max', msg: 'That would take a figure past its most.' };
    if (err) return { ok: false, reason: 'changed', msg: 'Something on the table changed. Look again and confirm.' };
    var plain = function(m) { var o = {}; Object.keys(m).forEach(function(k) { o[k] = m[k]; }); return o; };
    return { ok: true, valuesA: plain(vals.a), valuesB: plain(vals.b), linesA: lines.a, linesB: lines.b };
}
// [systemcheck:trade-end]
// [systemcheck:groupweak-start]
// 1.6.0 (v2, B7a; the owner, 2026-10-29, by prompt: who rolls "Lowest target (Recommended)", where "Right-click menu (Recommended)"): a group
// roll by its weakest member. rollTargetOf: a check's target, the right side of its formula's one comparison, read with no dice (null where the
// formula is no check, or its target rolls dice or does not read). groupRolls: the system's rolls a group may roll, each a check, never an
// action, the initiative roll or one used on an ally. groupWeakest works the target out for each character picked, with its own token's
// context, and answers the lowest, the first picked on a tie: { roll, pick: { id, target }, all: [{ id, target }] }, or null where none reads one
var GROUP_MAX = 40;
function rollCheckAst(F, formula) { if (!F || typeof F.parse !== 'function' || typeof formula !== 'string') return null; var p = F.parse(formula); return p && p.ok && isObj(p.ast) && isObj(p.ast.body) && p.ast.body.t === 'cmp' && isObj(p.ast.body.r) ? p.ast : null; }
function rollTargetOf(F, formula, vars) {
    var ast = rollCheckAst(F, formula); if (!ast || typeof F.evaluateAst !== 'function') return null;
    var res = F.evaluateAst(Object.assign({}, ast, { body: ast.body.r }), vars ? { vars: vars, random: noDice } : { random: noDice });
    return res && res.ok && typeof res.value === 'number' && fin(res.value) ? res.value : null;
}
function groupRolls(sys, F) { return (isObj(sys) && Array.isArray(sys.rolls) ? sys.rolls : []).filter(function(r) { return isObj(r) && typeof r.id === 'string' && !Array.isArray(r.apply) && r.init !== true && r.to !== 'near' && !!rollCheckAst(F, r.formula); }); }
function groupWeakest(sys, list, rollId, F) {
    var r = null; groupRolls(sys, F).forEach(function(x) { if (!r && x.id === rollId) r = x; }); if (!r || !Array.isArray(list)) return null;
    var all = [], seen = map();
    list.slice(0, GROUP_MAX).forEach(function(m) {
        if (!isObj(m) || typeof m.id !== 'string' || seen[m.id] === 1 || !isObj(m.char)) return; seen[m.id] = 1;
        var t = null; try { t = rollTargetOf(F, r.formula, resolveAll(sys, m.char, F, isObj(m.tctx) ? m.tctx : null).vars); } catch (e) { t = null; }
        all.push({ id: m.id, target: t });
    });
    var pick = null; all.forEach(function(a) { if (a.target !== null && (!pick || a.target < pick.target)) pick = a; });
    return pick ? { roll: r, pick: pick, all: all } : null;
}
// [systemcheck:groupweak-end]
// [systemcheck:money-start]
// 1.5.6 buying and selling (docs/TRADE_PLAN.md B1 and B2; the site's own rules, its currency-transaction, as the site session gave them on
// 2026-10-24). A list with a Money box (spec.money) holds money: '@lvl', each row holds its level (a chip's stored amount, times its quantity),
// or the key of a number stat, each piece worth that stat (a bar's denomination, times its quantity). moneyHeld sums it; moneyMove adds or takes
// an amount by the site's rules: what comes in lands on the largest chip (with no chip in the list, a new one), or where no list holds chips in
// the fewest pieces; what goes out drains the smallest chips first, then breaks the largest pieces and hands the change back in the fewest pieces,
// and change no piece can hold goes onto a chip. A chip or a stack spent to nothing goes, as the site has it. One currency: every Money box counts
// in the same unit. A hidden row and a kept curse never count. Pure, on copies
function moneyBoxes(sys) {
    return (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list' && isObj(f.list) && typeof f.list.money === 'string' && f.list.money; })
        .map(function(f) { return { f: f, spec: f.list, chip: f.list.money === '@lvl' }; });
}
function moneyR(n) { return Math.round(n * 100) / 100; }
function moneyLive(r) { return isObj(r) && r.hid !== 1 && r.keptOn !== 1; }
function moneyRowVal(sys, b, r) {
    var rd = rowDef(sys, r); if (!rd || !isObj(rd.def)) return null;
    var q = clampNum(cleanNum(r.qty, 1) | 0, 0, LIMITS.maxQty), u = b.chip ? rowLvl(b.spec, r, rd.def) : rowStat(b.spec, rd.def, b.spec.money);
    return fin(u) ? { unit: u, qty: q, val: u * q } : null;
}
function moneyHeld(sys, char) {
    var t = 0; if (!isObj(char)) return 0;
    moneyBoxes(sys).forEach(function(b) { (isObj(char.values) && Array.isArray(char.values[b.f.id]) ? char.values[b.f.id] : []).forEach(function(r) { if (!moneyLive(r)) return; var v = moneyRowVal(sys, b, r); if (v && v.val > 0) t += v.val; }); });
    return moneyR(t);
}
function moneyMove(sys, char, delta) {
    var boxes = moneyBoxes(sys); if (!boxes.length || !isObj(char)) return { ok: false, reason: 'money', msg: 'This sheet keeps no money.' };
    if (typeof delta !== 'number' || !fin(delta) || Math.abs(delta) > LIMITS.statAbs) return { ok: false, reason: 'value', msg: 'That is not an amount.' };
    if (Math.abs(delta) < 0.005) return { ok: true, values: {} };
    var vals = map(), listOf = function(fid) { if (!Object.prototype.hasOwnProperty.call(vals, fid)) vals[fid] = JSON.parse(JSON.stringify(isObj(char.values) && Array.isArray(char.values[fid]) ? char.values[fid] : [])); return vals[fid]; };
    var held = function(chip) { var out = []; boxes.forEach(function(b) { if (b.chip !== chip) return; listOf(b.f.id).forEach(function(r) { if (!moneyLive(r)) return; var v = moneyRowVal(sys, b, r); if (v) out.push({ b: b, r: r, v: v }); }); }); return out; };
    var drop = function(b, r) { var l = listOf(b.f.id), i = l.indexOf(r); if (i >= 0) l.splice(i, 1); };
    var chipBox = boxes.filter(function(b) { return b.chip; })[0] || null, err = null;
    var lvlSet = function(b, r, n) { var lv = b.spec.lvl || {}, st = lv.step > 0 ? lv.step : 0.01, x = Math.round(moneyR(n) / st) * st; x = Math.round(x * 1e6) / 1e6; if (lv.max !== undefined && x > lv.max + 1e-9) { err = { ok: false, reason: 'max', msg: 'That is more than a chip holds.' }; return; } r.lvl = x; };
    var gainChip = function(amt) {   // onto the largest chip; none in the list: a new one, named as the list's first category
        var cs = held(true).sort(function(a, z) { return z.v.val - a.v.val; });
        if (cs.length) { var c = cs[0], qn = c.v.qty || 1; lvlSet(c.b, c.r, c.v.unit + amt / qn); return; }
        if (!chipBox) { err = { ok: false, reason: 'change', msg: 'There is no way to hold that in whole pieces.' }; return; }
        var l = listOf(chipBox.f.id); if (l.filter(moneyLive).length >= LIMITS.carried) { err = { ok: false, reason: 'field', msg: 'A list there is full.' }; return; }
        var id = null; for (var i = 0; i < 50 && !id; i++) { var t = uid('w_'); if (!l.some(function(r) { return rowIdOf(r) === t; })) id = t; } if (!id) { err = { ok: false, reason: 'field', msg: 'A list there is full.' }; return; }
        var nm = (Array.isArray(chipBox.spec.cats) && chipBox.spec.cats[0]) || chipBox.f.label || 'Chip', nr = { id: id, def: { name: cutText(nm, LIMITS.itemName) || 'Chip' }, qty: 1, lvl: 0 };
        if (Array.isArray(chipBox.spec.cats) && chipBox.spec.cats[0]) nr.def.category = chipBox.spec.cats[0];
        if (isObj(chipBox.spec.on)) nr.on = false; l.push(nr); lvlSet(chipBox, nr, amt);
    };
    var gainPieces = function(amt) {   // in the fewest pieces of the worths the sheet already holds; what none can hold is handed back
        var ps = held(false), byU = map(); ps.forEach(function(p) { if (p.v.unit > 0 && !byU[p.v.unit]) byU[p.v.unit] = p; });
        Object.keys(byU).map(Number).sort(function(a, z) { return z - a; }).forEach(function(u) { var n = Math.floor((amt + 1e-9) / u); if (n > 0) { var p = byU[u]; p.r.qty = clampNum((p.r.qty | 0) + n, 1, LIMITS.maxQty); amt = moneyR(amt - n * u); } });
        return amt;
    };
    if (delta > 0) {
        if (chipBox) gainChip(delta); else { var left = gainPieces(delta); if (left > 0.005) err = { ok: false, reason: 'change', msg: 'There is no way to hold that in whole pieces.' }; }
    } else {
        var need = moneyR(-delta), have = moneyHeld(sys, char);
        if (have + 0.005 < need) return { ok: false, reason: 'money', msg: 'Not enough money: ' + fmtNum(have) + ' held, ' + fmtNum(need) + ' needed.' };
        held(true).sort(function(a, z) { return a.v.val - z.v.val; }).forEach(function(c) {   // the smallest chips first
            if (need <= 0.005 || err) return; var qn = c.v.qty || 1;
            if (c.v.val >= need - 1e-9) { lvlSet(c.b, c.r, c.v.unit - need / qn); need = 0; if (!err && !(c.r.lvl > 0.005)) drop(c.b, c.r); }
            else { need = moneyR(need - c.v.val); drop(c.b, c.r); }
        });
        held(false).sort(function(a, z) { return z.v.unit - a.v.unit; }).forEach(function(p) {   // then the largest pieces, broken, the change handed back
            if (need <= 0.005 || err || !(p.v.unit > 0)) return;
            if (p.v.val >= need - 1e-9) {
                var take = Math.ceil(need / p.v.unit - 1e-9), over = moneyR(take * p.v.unit - need); need = 0;
                p.r.qty = (p.r.qty | 0) - take; if (!(p.r.qty > 0)) drop(p.b, p.r);
                if (over > 0.005) { var back = gainPieces(over); if (back > 0.005) gainChip(back); }
            } else { need = moneyR(need - p.v.val); drop(p.b, p.r); }
        });
        if (!err && need > 0.005) err = { ok: false, reason: 'money', msg: 'Not enough money.' };
    }
    if (err) return err;
    var plain = {}; Object.keys(vals).forEach(function(k) { plain[k] = vals[k]; });
    return { ok: true, values: plain };
}
// what a row op paid or was paid moves the money with it, on the result of applyRowOp (res) for that op (q): q.pay on an add (the agreed total,
// taken by moneyMove, each unit's Paid stamped as that total over the units bought, averaged into a stack it joined), q.get on a remove or a
// lowered quantity (the agreed price, paid in). Answers { ok, values } with the row's list and every money list it moved, or a refusal
function rowOpMoney(sys, char, fieldId, q, res) {
    var vals = {}; if (!isObj(res) || !res.ok) return { ok: false, reason: 'value' }; vals[fieldId] = res.value;
    if (isObj(res.also)) Object.keys(res.also).forEach(function(k) { if (k !== fieldId && FIELD_ID.test(k)) vals[k] = res.also[k]; });   // 1.5.8 Loads from: the other list a load or an unload changed
    var amt = q && q.op === 'add' ? q.pay : q && (q.op === 'remove' || q.op === 'setQty') ? q.get : undefined;
    if (typeof amt !== 'number' || !fin(amt) || amt < 0) return { ok: true, values: vals };
    if (q.op !== 'add') {   // a sale needs a quantity that went down
        var was = (isObj(char) && isObj(char.values) && Array.isArray(char.values[fieldId]) ? char.values[fieldId] : []).filter(function(r) { return rowIdOf(r) === q.rowId; })[0], now = (Array.isArray(res.value) ? res.value : []).filter(function(r) { return rowIdOf(r) === q.rowId; })[0];
        if (!was || (now ? (now.qty | 0) : 0) >= (was.qty | 0 || 1)) return { ok: true, values: vals };
    }
    var ch2 = { values: Object.assign({}, isObj(char) && isObj(char.values) ? char.values : {}) }; ch2.values[fieldId] = res.value;
    var mv = amt > 0 ? moneyMove(sys, ch2, q.op === 'add' ? -amt : amt) : { ok: true, values: {} }; if (!mv.ok) return mv;
    Object.keys(mv.values).forEach(function(k) { vals[k] = mv.values[k]; });
    if (q.op === 'add' && typeof res.row === 'string' && res.added > 0) {
        var f = fieldById(sys, fieldId), spec = isObj(f && f.list) ? f.list : null;
        if (spec && spec.price) {
            var l = vals[fieldId] === res.value ? (vals[fieldId] = JSON.parse(JSON.stringify(res.value))) : vals[fieldId], r = l.filter(function(x) { return rowIdOf(x) === res.row; })[0];
            if (r) { var qn = r.qty | 0 || 1, old = qn - res.added, before = old > 0 ? rowPaid(spec, r, (rowDef(sys, r) || {}).def) : 0; r.paid = clampNum(moneyR((before * old + amt) / qn), 0, LIMITS.statAbs); }
        }
    }
    return { ok: true, values: vals };
}
// [systemcheck:money-end]
// 1.6.0 (the v2 sort's B1): a critical range, kept on the Combat card under criticals at fixed rolls and on a system roll or a list roll of any
// system (a technique that widens it): critAt and fumbleAt, each a formula of the roller's names with no dice, each absent where it does not clean
function critRangeInto(out, r) { var a = cleanFormulaText(r.critAt), b = cleanFormulaText(r.fumbleAt); if (a) out.critAt = a; if (b) out.fumbleAt = b; }
// 1.6.0 (the book's ruling of 2026-10-29: only a natural 3 or 18 is a critical; a technique's widened range lands as a Big Hit instead): a system
// roll or a list roll may carry bigAt, what lands as a Big Hit, a formula of the roller's names (a list roll's row's too) with no dice, under any
// rule. Its cleaner and the players' view treat it as critAt. bigOf is its one reading
// 1.6.0: a named tier, { name, at }: a success whose margin is at least at (1 to 1,000,000) reads name on its card, as Strong success at 5. null
// where either part does not clean
function cleanTier(v) {
    if (!isObj(v) || typeof v.at !== 'number' || Math.floor(v.at) !== v.at || v.at < 1 || v.at > 1000000) return null;
    var n = cutText(v.name, 30); return n ? { name: n, at: v.at } : null;
}
// camp.system.combat — blast automation, who rolls, the resource damage subtracts from, and the cover rule. resIds: map of resource field ids.
function cleanCombat(c, resIds, fieldIds, secretIds, F, viewKinds, pl, fl) {   // 1.5.6: pl, the players' view; fl, a field of this view by id (the damage step)   // senses S1: fieldIds (id -> kind, the GM's view) and secretIds (secretFieldIds) for the senses; range R1: F for the range formula; conditions C3: viewKinds (id -> kind, this view's fields) for a posture's changes
    c = isObj(c) ? c : {};
    var out = { blastAuto: BLAST_AUTO[c.blastAuto] ? c.blastAuto : 'full', blastRoller: c.blastRoller === 'gm' ? 'gm' : 'owner', hpResource: '', cover: cleanCover(c.cover) };
    if (typeof c.hpResource === 'string' && resIds && resIds[c.hpResource]) out.hpResource = c.hpResource;
    var tn = cleanTurn(c.turn); if (tn) out.turn = tn;   // turn-based combat T1: the system's turn rules (absent: none)
    if (c.checks === 'under3d6') out.checks = 'under3d6';   // Stage 6 F8: 3d6 roll-under criticals (absent: success or failure by the margin)
    else if (c.checks === 'fixed') { out.checks = 'fixed'; critRangeInto(out, c); }   // 1.6.0 (the v2 sort's B1): criticals at fixed rolls, at or under critAt and at or over fumbleAt, each a formula with no dice (absent: 3 and 18)
    var tr = cleanTier(c.tier); if (tr) out.tier = tr;   // 1.6.0: a success at or past a margin is named on its card
    var lt = cleanLightRules(c.light); if (lt) out.light = lt;   // lighting L4: the system's light rules (absent: none)
    var sn = cleanSenses(c.senses, fieldIds, secretIds); if (sn) out.senses = sn;   // senses S1: the system's senses (absent: none)
    var rg = cleanRangeRules(c.range, F); if (rg) out.range = rg;   // range penalties R1: the system's range rule (absent: none)
    if (c.targetSize !== undefined) { var tsz = senseField({ field: c.targetSize }, SENSE_RANGE_KINDS, fieldIds, secretIds); if (tsz) out.targetSize = tsz; }   // 1.6.0 (the v2 combat module): the field of a target's sheet TargetSize reads, a number its viewer can read truthfully, the same in both views
    var ps = cleanPostures(c.postures, viewKinds); if (ps) out.postures = ps;   // conditions C3: the system's own postures (absent: the seven)
    var ir = cleanInitRules(c.initiative, F); if (ir) out.initiative = ir;   // initiative O2: how ties of initiative break (absent: they keep their place)
    var hr = cleanHeightRules(c.height, F); if (hr) out.height = hr;   // item 19 H1: what height does (absent: nothing, as before); H2: its table or formula
    var dm = cleanDamageRules(c.damage, viewKinds, resIds, fl, pl === true); if (dm) out.damage = dm;   // 1.5.6: the damage step (absent: none)
    var bl = pl === true ? null : cleanBlastRules(c.blast, F); if (bl) out.blast = bl;   // 1.5.8 explosives: the GM's own (the host throws, places and applies)
    return out;
}
// 1.5.8 explosives (the owner, 2026-10-25, by prompt: "Blast damage by the book", "Throw like the site"): combat.blast, the GM's view alone, each
// part a formula and each absent where it does not clean (with none a blast is what it always was):
//   fall     a token's share of a blast, read with BlastDamage, BlastDistance (yards, height counted), BlastDice and Direct only, no dice; with
//            it, each share goes through the damage step where the system has one (its DR, the blast's damage type, the pool), else off the
//            damage resource as before
//   roll     the throw's roll, a check: ThrowSkill stands for the item's throw skill, and RangeMod and TargetDistance read the throw's aim;
//            with none a throw lands where it is aimed
//   scatter  how many yards a miss lands from its aim, read with Margin (how far it missed) and ThrowDistance (yards to the aim), dice
//            allowed; with none, Margin yards and never more than half the distance thrown
//   ways     how many ways a miss may go, 6 (the six sides of a hex, a d6) or 8; with none, 6
//   fuse     'turn': a thrown explosive goes off at the start of the next turn of the fight on its map (with none, or no fight there, at once)
//   hand     where a throw's critical failure goes off in the thrower's hand, read with Natural (its dice) alone, no dice; else it drops
//            at the thrower's feet
//   max, min how far and how near a thing may be thrown, in yards: the thrower's sheet and the item's row (Row.) read, no dice
//   launch   1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 1): how a launched round that misses lands, each part absent for the
//            book's reading where it has ruled (fix log (eu), H1) and the plan's where it has not: now (true: a round that scatters goes off
//            where it lands at once; absent: it waits for the fuse, on a thrown grenade's timing, as the book rules), fumble ('feet':
//            a critical failure goes off at the shooter's feet; 'none': it spends the round and goes nowhere; absent: a miss by its margin),
//            stop ('past': a round that flies straight passes the characters before the target it missed; 'walls': it stops at walls alone;
//            absent: at the first wall or character) and glance (true: a character it stops on is not struck directly)
//   frag     1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2): how an item's fragmentation is rolled, each part absent for the plan's
//            reading where the book is open: reach (how far it reaches in yards, read with FragDice, the dice it rolls, alone, no dice; absent:
//            the blast's own radius, and never less), type (the damage type's key of a fragmentation whose item names none; absent: the blast's),
//            cover ('total': only total cover stops it, and a token partly behind cover takes it all; absent: the system's cover outcomes, as
//            the blast), each (true: each token rolls its own; absent: one roll for every token, H5), direct (true: the token struck directly
//            takes a hit of its own roll; absent: it takes the same roll as the others) and ad (true: the item's armour divisor counts against
//            it too; absent: none, H6)
//   resist   1.5.9 (the book's (es), section 2's affliction half): the resist roll an affliction makes each character it reaches roll, a check,
//            dice allowed: Resist stands for the item's resist target (3d6 <= Resist); with none an affliction is not rolled and the GM is told
//            who must resist and against what
//   hurt     'share': an affliction that reaches those the blast hurt reaches those any share of the blast or its fragmentation reached;
//            absent: those it wounded, after DR (H7, the plan's reading)
var FRAG_NAMES = Object.freeze({ fragdice: 1, blastdice: 1 });   // 1.6.0: and BlastDice, the dice the blast's own damage rolls
var BLAST_FALL =Object.freeze({ blastdamage: 1, blastdistance: 1, blastdice: 1, direct: 1, centre: 1 });   // Centre: 1 for a token in the blast's own cell
function blastFormula(text, F, names, dice) {
    var t = cleanFormulaText(text); if (!t) return '';
    if (!F || typeof F.parse !== 'function') return '';
    var p = F.parse(t); if (!p || !p.ok || !p.ast || (!dice && hasDice(p.ast.body))) return '';
    if (names && !(Array.isArray(p.names) ? p.names : []).every(function(n) { return typeof n === 'string' && names[lower(n)] === 1; })) return '';
    return t;
}
function cleanBlastRules(v, F) {
    if (!isObj(v)) return null;
    var out = {}, fa = blastFormula(v.fall, F, BLAST_FALL, false), ro = blastFormula(v.roll, F, null, true), sc = blastFormula(v.scatter, F, { margin: 1, throwdistance: 1 }, true), mx = blastFormula(v.max, F, null, false), mn = blastFormula(v.min, F, null, false), hd = blastFormula(v.hand, F, { natural: 1 }, false);
    if (fa) out.fall = fa; if (ro) out.roll = ro; if (sc) out.scatter = sc; if (mx) out.max = mx; if (mn) out.min = mn; if (hd) out.hand = hd;
    if (v.ways === 6 || v.ways === 8) out.ways = v.ways; if (v.fuse === 'turn') out.fuse = 'turn';
    if (isObj(v.launch)) { var lo = {}; if (v.launch.now === true) lo.now = true; if (v.launch.fumble === 'feet' || v.launch.fumble === 'none') lo.fumble = v.launch.fumble; if (v.launch.stop === 'past' || v.launch.stop === 'walls') lo.stop = v.launch.stop; if (v.launch.glance === true) lo.glance = true; if (Object.keys(lo).length) out.launch = lo; }   // 1.5.9 (es): what a launched round's miss does where the book is open
    if (isObj(v.frag)) {   // 1.5.9 (es): how an explosive's fragmentation is rolled and whom it reaches
        var fo = {}, frc = blastFormula(v.frag.reach, F, FRAG_NAMES, false); if (frc) fo.reach = frc;
        if (typeof v.frag.type === 'string' && STAT_KEY.test(v.frag.type) && v.frag.type.length <= 24) fo.type = v.frag.type;
        if (v.frag.cover === 'total') fo.cover = 'total'; if (v.frag.each === true) fo.each = true; if (v.frag.direct === true) fo.direct = true; if (v.frag.ad === true) fo.ad = true;
        if (Object.keys(fo).length) out.frag = fo;
    }
    var rsv = blastFormula(v.resist, F, null, true); if (rsv) out.resist = rsv;   // 1.5.9 (es): an affliction's resist roll, Resist standing for its target
    if (v.hurt === 'share') out.hurt = 'share';   // H7: those it hurt are those any share reached (absent: those it wounded, after DR)
    return Object.keys(out).length ? out : null;
}
// 1.5.9 (es): a launcher list's Flies at most (spec.chamber.reach): the yards a round that flies straight goes, a formula of the launcher row's
// own names, no dice; '' where it does not clean
function cleanReach(text, F) { return blastFormula(text, F, null, false); }
// ... and an item's blast extras, kept in its area beside its radius: its damage type's key (a key of the Combat card's types), whether
// going off uses one up (use, true only), whether it is placed, not thrown (place, true only: a mine), and the trigger radius in yards (trig,
// 0.5 to 100 to the tenth, only beside place), and its armour divisor (ad, 0.1 to 100 to the tenth, never 1). 1.5.9 (es): how a round fired
// from a launcher lands when the roll misses (flight: 'scatter', as a missed throw; 'line', straight on to the first wall or character; never
// beside place; absent: the GM places it). The same in both views (none of it is secret: the damage formula is). 1.5.9 (the book's (es),
// docs/BOOK_ES_ET_PLAN.md section 2): its fragmentation (frag: a dice formula's text, as the damage's) and that fragmentation's damage type
// (fragType, a key, only beside frag), kept in the GM's view alone (gmView), as the damage formula is: only the host rolls it
function areaExtra(out, src, gmView) {
    if (!isObj(out) || !isObj(src)) return out;
    if (typeof src.type === 'string' && STAT_KEY.test(src.type) && src.type.length <= 24) out.type = src.type;
    if (src.use === true) out.use = true;
    if (typeof src.ad === 'number' && fin(src.ad) && src.ad > 0) { var adv = Math.max(0.1, Math.min(100, Math.round(src.ad * 10) / 10)); if (adv !== 1) out.ad = adv; }
    if (src.place === true) { out.place = true; var tg = typeof src.trig === 'number' && fin(src.trig) && src.trig > 0 ? Math.max(0.5, Math.min(100, Math.round(src.trig * 10) / 10)) : 0; if (tg) out.trig = tg; }
    else if (src.flight === 'scatter' || src.flight === 'line') out.flight = src.flight;   // 1.5.9 (es): a placed mine is never launched
    if (gmView === true) { var fg = cleanFormulaText(src.frag); if (fg) { out.frag = fg; if (typeof src.fragType === 'string' && STAT_KEY.test(src.fragType) && src.fragType.length <= 24) out.fragType = src.fragType; } }   // 1.5.9 (es) fragmentation: the GM's view alone
    if (gmView === true) { var af = cleanAffs(src.aff); if (af) out.aff = af; }   // 1.5.9 (es) afflictions: the GM's view alone, as the damage formula
    return out;
}
// 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2, its affliction half): an explosive's afflictions (area.aff), at most
// LIMITS.areaAffs, each { vs, fx, who, needs, lasts }: vs, the resist target, a formula of the VICTIM's names (HT-2; the validator reads it with
// no dice); fx, the id of an effect of the system's library put on at a failed resist (cleanSystem drops one its view does not hold); who, 'all'
// (every character in the blast) or absent (those it hurt); needs, a formula of the victim's names that must hold for it to touch them at all
// (not Droid, no dice); lasts, { n, u }: how long the effect lasts, a formula that may roll dice and a unit (turns, seconds, minutes, hours, days
// or the key of one of the system's own time units), absent for the effect's own duration. Anything else is no key; null where none is left
var AFF_UNITS = Object.freeze({ turns: 1, seconds: 1, minutes: 1, hours: 1, days: 1 });
function affUnit(u) { return typeof u === 'string' && (Object.prototype.hasOwnProperty.call(AFF_UNITS, u) || (STAT_KEY.test(u) && TIME_WORDS[lower(u)] !== 1)) ? u : ''; }
function cleanAffs(v) {
    if (!Array.isArray(v)) return null;
    var out = [];
    for (var i = 0; i < v.length && i < 40 && out.length < LIMITS.areaAffs; i++) {
        var a = v[i]; if (!isObj(a)) continue;
        var vs = cleanFormulaText(a.vs), fx = typeof a.fx === 'string' && EFFECT_ID.test(a.fx) ? a.fx : ''; if (!vs || !fx) continue;
        var o = { vs: vs, fx: fx }; if (a.who === 'all') o.who = 'all';
        var nd = cleanFormulaText(a.needs); if (nd) o.needs = nd;
        if (isObj(a.lasts)) { var ln = cleanFormulaText(a.lasts.n), lu = affUnit(a.lasts.u); if (ln && lu) o.lasts = { n: ln, u: lu }; }
        out.push(o);
    }
    return out.length ? out : null;
}
// how many game seconds n of an affliction's unit is: a turn the system's round, the four plain words, else one of the system's own time units by
// key; 0 where it is no time (the effect's own duration then stands)
function affLastsSecs(sys, n, u) {
    if (typeof n !== 'number' || !fin(n) || n <= 0) return 0;
    var us = u === 'turns' ? roundSecs(sys) : Object.prototype.hasOwnProperty.call(TIME_SECS, u) ? TIME_SECS[u] : 0;
    if (!us && typeof u === 'string') { var t = isObj(sys) && isObj(sys.combat) && isObj(sys.combat.turn) ? sys.combat.turn : null; (t && Array.isArray(t.units) ? t.units : []).forEach(function(x) { if (!us && isObj(x) && typeof x.key === 'string' && lower(x.key) === lower(u) && typeof x.secs === 'number' && fin(x.secs) && x.secs > 0) us = x.secs; }); }
    return us > 0 ? Math.min(1e9, Math.round(n * us * 1000) / 1000) : 0;
}
// Item 19 H1 (the owner's answer, 2026-09-30: a rule of the system's): the system's height rules (combat.height) — rule 'clears'
// (height clears low cover: looked at from higher than a see-over piece it gives no cover; from below the target it hides them, as total
// cover; walls block at any height), or absent: flat, height changes no cover (every existing system, as before). Nothing: absent
// H2 (the owner's answer: a table like the Range box): the height modifier's table or formula — unit (ft or m; absent: yards), formula (a
// modifier from HeightDiff alone: the roller's height over the target's in that unit, negative looking up; no dice, no other name; kept, it
// wins and the steps go), steps (each { to, mod }: "up to 2 yards above: 0", a height difference within 1,000,000 either way, below 0
// looking up, sorted, the first of each kept; a modifier within 1000 either way, to the hundredth). A unit with neither: none
// Item 19b H4 (the owner's answer of 2026-10-01): line3d (true only) — the true 3D sightline: a piece with a height stops a line of sight or
// of cover only where the straight line from the eye to the target runs at or below it (fog.js); eye — the standing height, in yards: how
// far above its elevation a token's eye sits (above 0, at most 100, to the hundredth; kept only with the line; absent: the eye is at the
// token's elevation). The same in both views: a player's own screen judges as the host does
var HEIGHT_UNITS = Object.freeze({ ft: 1, m: 1 });
function heightFormulaOk(text, F) {
    if (!F || typeof F.parse !== 'function') return false;
    var p = F.parse(text); if (!p || !p.ok || !p.ast || hasDice(p.ast.body)) return false;
    return (Array.isArray(p.names) ? p.names : []).every(function(n) { return typeof n === 'string' && lower(n) === 'heightdiff'; });
}
function cleanHeightRules(v, F) {
    if (!isObj(v)) return null;
    var out = {}; if (v.rule === 'clears') out.rule = 'clears';
    if (typeof v.unit === 'string' && hasOwn(HEIGHT_UNITS, v.unit)) out.unit = v.unit;
    var fm = cleanFormulaText(v.formula);
    if (fm && heightFormulaOk(fm, F)) out.formula = fm;
    else {
        var st = [], seen = map();
        (Array.isArray(v.steps) ? v.steps : []).forEach(function(s) {
            if (st.length >= LIMITS.heightSteps || !isObj(s) || !fin(s.to) || Math.abs(s.to) > 1e6 || !fin(s.mod)) return;
            var k = String(s.to); if (seen[k]) return;
            seen[k] = 1; st.push({ to: s.to === 0 ? 0 : s.to, mod: rangeModNum(s.mod) });
        });
        st.sort(function(a, b) { return a.to - b.to; });
        if (st.length) out.steps = st;
    }
    if (!out.formula && !out.steps) delete out.unit;
    if (v.line3d === true) { out.line3d = true; var ey = fin(v.eye) ? Math.round(Math.min(v.eye, 100) * 100) / 100 : 0; if (ey > 0) out.eye = ey; }
    return Object.keys(out).length ? out : null;
}
// ... the modifier its table or formula gives at a height difference in its unit (the table's first step that reaches it; below the first,
// the first; past the last, the last), or null with neither, a difference that is no number, or a formula that gives no finite number
function heightModOf(hr, diff, F) {
    if (!isObj(hr) || typeof diff !== 'number' || !isFinite(diff)) return null;
    var v = null;
    if (hr.formula) {
        if (!F || typeof F.evaluate !== 'function') return null;
        var res = F.evaluate(hr.formula, { vars: function(l) { return l === 'heightdiff' ? diff : undefined; } });
        if (res && res.ok && typeof res.value === 'number' && isFinite(res.value)) v = res.value;
    } else if (Array.isArray(hr.steps) && hr.steps.length) {
        for (var i = 0; i < hr.steps.length && v === null; i++) if (diff <= hr.steps[i].to) v = hr.steps[i].mod;
        if (v === null) v = hr.steps[hr.steps.length - 1].mod;
    }
    return v === null ? null : rangeModNum(v);
}
function heightIn(yd, unit) { var u = typeof unit === 'string' && hasOwn(HEIGHT_UNITS, unit) ? unit : 'yd', d = typeof yd === 'number' && isFinite(yd) ? yd / MAP_UNITS[u] : 0; d = Math.round(d * 1e6) / 1e6; return d === 0 ? 0 : d; }   // yards, in a height rule's unit
// What the system's height table or formula says between two tokens: { mod, diff, unit } (diff: the first's height over the second's, in the
// rule's unit; unit yd, ft or m), or null with no table or formula. opts: { F, elev } (elev: the elevation feature on; off, the difference is 0)
function heightOf(sys, from, to, opts) {
    opts = isObj(opts) ? opts : {};
    var hr = sys && isObj(sys.combat) ? cleanHeightRules(sys.combat.height, opts.F) : null; if (!hr || !(hr.formula || hr.steps)) return null;
    var el = function(t) { var s = stanceCtx(t, { elevation: true }); return (s ? s.elevation : 0) + groundYd(opts, t); }, u = hr.unit || 'yd';   // item 19b H5: on the ground it stands on
    var d = opts.elev && isObj(from) && isObj(to) ? heightIn(el(from) - el(to), u) : 0, m = heightModOf(hr, d, opts.F);
    return m === null ? null : { mod: m, diff: d, unit: u };
}
// 1.5.5: statsAsk (true only, in place of ownerStats): players ASK for a change of their own copies' stats, and the GM approves it in the Review
// (statAsk); an older Waypoint drops the key and reads the stats as the GM's alone, so no ask is ever sent to a host that cannot take it
// Stage 6 F4c2: the system's rules for item lists (the Lists tab's Rules box) — ownerStats: players may change the stats of their own copies
// (Setting A). Both views carry it: a player's sheet draws its ✎ and their own check judges by it, the host by the full system. null when unset
// 1.6.0: two names of copies held again are the same name where they read alike as the site's organisation key reads them: lower case,
// each run of characters that are no letter or digit one space, trimmed, so Republic-Navy and Republic  Navy are one
function againFold(s) { return String(typeof s === 'string' ? s : '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
// 1.6.0: a list roll's, an action's or a counter's other names, each shown on the rows where its formula holds (the first that holds wins; none:
// its own label). A name and a formula with no dice each, ALT_MAX at most
var ALT_MAX = 4;
// 1.6.0 R4 (backlog 180; the owner, by prompt: "A. After the name", "A. Tint and an edge", "A. The badge itself"): a list's row badges, each
// words shown on a row only while a formula of the row holds (no dice), in a tone of TONES or plain, as a pill after the name or as a line under
// the row (line), tinting its row in its tone (tint) or pulsing (pulse), with a tip in words. BADGE_MAX at most; the same in both views but where
// the players' view drops one that reads a GM-only name
var BADGE_MAX = 12;   // 1.6.0, backlog 195: twelve (eight before)
function cleanBadges(v, F) { if (!Array.isArray(v)) return null; var out = []; for (var i = 0; i < v.length && i < BADGE_MAX * 4 && out.length < BADGE_MAX; i++) { var b = v[i]; if (!isObj(b)) continue; var w = cutText(b.words, LIMITS.text), fi = budgetFormula(b.if, F); if (!w || !fi) continue; var o = { words: w, if: fi }; if (typeof b.tone === 'string' && Object.prototype.hasOwnProperty.call(TONES, b.tone)) o.tone = b.tone; if (b.line === true) o.line = true; if (b.tint === true) o.tint = true; if (b.pulse === true) o.pulse = true; var tp = cutText(b.tip, LIMITS.text); if (tp) o.tip = tp; out.push(o); } return out.length ? out : null; }
// 1.6.0 R7 (backlog 180; the owner, by prompt: "B. In a small box at the end", "A. Its target or its dice"): what a list roll's button shows after
// its name: '@fig', its own figure, or a column of the list by its key; anything else none
function rollShowOf(v, cols) { if (v === '@fig') return '@fig'; if (typeof v !== 'string' || !v || !Array.isArray(cols)) return ''; var lv = lower(v); for (var i = 0; i < cols.length; i++) if (isObj(cols[i]) && typeof cols[i].key === 'string' && lower(cols[i].key) === lv) return cols[i].key; return ''; }
// R7: a roll's own figure, worked out with the names handed in: a check whose one side is rolled says the number it rolls against; any other roll
// its dice as plain groups and a number ("2d6+1"), told from what it gives at every die's least and most, so a roll that is no sum of dice and a
// number (a die taken away, kept, rerolled or exploding, a die times something) says nothing ('')
function rollFigOf(text, vars, F) {
    if (typeof text !== 'string' || !text || !F || typeof F.evaluate !== 'function') return '';
    var lo, hi; try { lo = F.evaluate(text, { vars: vars, random: function() { return 1; } }); hi = F.evaluate(text, { vars: vars, random: function(n) { return n; } }); } catch (x) { return ''; }
    if (!lo || !hi || !lo.ok || !hi.ok || !lo.breakdown || !hi.breakdown) return '';
    var topOf = function(r) { var cs = Array.isArray(r.breakdown.checks) ? r.breakdown.checks : []; for (var i = 0; i < cs.length; i++) if (cs[i] && cs[i].top) return cs[i]; return null; }, tl = topOf(lo), th = topOf(hi);
    if (tl || th) { if (!tl || !th) return ''; if (tl.right === th.right && tl.left !== th.left) return fmtNum(tl.right); if (tl.left === th.left && tl.right !== th.right) return fmtNum(tl.left); return ''; }
    if (typeof lo.value !== 'number' || typeof hi.value !== 'number' || !isFinite(lo.value) || !isFinite(hi.value)) return '';
    var plain = function(d) { return isObj(d) && typeof d.faces === 'number' && d.faces >= 2 && typeof d.count === 'number' && d.count >= 1 && Math.floor(d.count) === d.count && ['dropped', 'rerolled', 'exploded'].every(function(k) { return Array.isArray(d[k]) ? !d[k].length : !d[k]; }) && !(Array.isArray(d.kept) && d.kept.length !== d.count) && !d.capped; };
    var dl = Array.isArray(lo.breakdown.dice) ? lo.breakdown.dice : [], dh = Array.isArray(hi.breakdown.dice) ? hi.breakdown.dice : [];
    if (dl.length !== dh.length) return '';
    var order = [], by = map(), nLo = 0, nHi = 0;
    for (var i = 0; i < dl.length; i++) { if (!plain(dl[i]) || !plain(dh[i]) || dl[i].count !== dh[i].count || dl[i].faces !== dh[i].faces) return ''; var fk = String(dl[i].faces); if (!by[fk]) { by[fk] = 0; order.push(dl[i].faces); } by[fk] += dl[i].count; nLo += dl[i].count; nHi += dl[i].count * dl[i].faces; }
    var kLo = lo.value - nLo, kHi = hi.value - nHi; if (Math.abs(kLo - kHi) > 1e-9) return '';
    if (!order.length) return fmtNum(lo.value);
    var out = order.map(function(fc) { return by[String(fc)] + 'd' + fc; }).join('+'), k = Math.round(kLo * 100) / 100;
    return k > 0 ? out + '+' + fmtNum(k) : k < 0 ? out + '-' + fmtNum(-k) : out;
}
function cleanAlt(v, F) { if (!Array.isArray(v)) return null; var out = []; v.forEach(function(a) { if (out.length >= ALT_MAX || !isObj(a)) return; var fi = budgetFormula(a.if, F), lb = cutText(a.label, LIMITS.label); if (fi && lb) out.push({ if: fi, label: lb }); }); return out.length ? out : null; }
function cleanListRules(v) { if (!isObj(v)) return null; var o = {}; if (v.statsAsk === true) o.statsAsk = true; else if (v.ownerStats === true) o.ownerStats = true; if (v.uploadFacts === true) o.uploadFacts = true; return Object.keys(o).length ? o : null; }   // Stage 6 U2: uploadFacts (setting B) — a player's own row facts from an upload apply at once
// 126, point budgets (the owner, by prompt, 2026-10-06: "A budget you define", and of what a breach does and of when it is watched, "per system
// dictation"). A budget is a name and two formulas, the points a character HAS and the points it has SPENT, with what happens when a player's
// own change would take the character over (refuse, warn or off) and when it is watched (always, while the character is being made, or in
// play). A formula rolls no dice. The same in both views: cleanSystem drops a budget that reads what a player cannot read, so the host and the
// player's own app work out the same figures. At most LIMITS.budgets; absent when there is none
var BUDGET_ID = /^b_[A-Za-z0-9_]{1,24}$/, BUDGET_OVER = Object.freeze({ refuse: 1, warn: 1, off: 1 }), BUDGET_WHEN = Object.freeze({ always: 1, making: 1, play: 1 });
function budgetFormula(text, F) { var t = cleanFormulaText(text), p = t && F && typeof F.parse === 'function' ? F.parse(t) : null; return p && p.ok && p.ast && !hasDice(p.ast.body) ? t : ''; }
// 1.6.0, the map environment (docs/MAP_ENVIRONMENT_PLAN.md 11 to 13; the owner, by prompt: "Any reading a system names", "As the field
// shows", "No reading at all"): the readings a system names, each a key, a label, the NUMBER field the host writes it into, and optionally a
// TOGGLE field the host keeps on while the character's token stands on a map (placed: off, and the number cleared, with no token), a unit
// (temp: stored in degrees Celsius, shown by each viewer's Imperial or Metric; else a few words shown after it) and four bands, each a formula of
// the character's names with no dice in the reading's stored unit (warnLow, dangerLow, warnHigh, dangerHigh), so a trait can widen them. kinds:
// the view's fields by id and kind. At most LIMITS.env; absent when there is none
var ENV_KEY = /^[A-Za-z][A-Za-z0-9_]{0,23}$/, ENV_BANDS = ['warnLow', 'dangerLow', 'warnHigh', 'dangerHigh'];
function cleanEnv(v, kinds, F) {
    var out = [], seen = map(), seenF = map();
    (Array.isArray(v) ? v : []).forEach(function(e) {
        if (out.length >= LIMITS.env || !isObj(e) || typeof e.key !== 'string' || !ENV_KEY.test(e.key) || seen[lower(e.key)]) return;
        if (typeof e.field !== 'string' || !isObj(kinds) || kinds[e.field] !== 'number' || seenF[e.field]) return;
        var o = { key: e.key, label: cutText(e.label, LIMITS.label) || e.key, field: e.field };
        if (typeof e.placed === 'string' && kinds[e.placed] === 'toggle') o.placed = e.placed;
        var u = e.unit === 'temp' ? 'temp' : cutText(e.unit, 12); if (u) o.unit = u;
        ENV_BANDS.forEach(function(k) { var b = budgetFormula(e[k], F); if (b) o[k] = b; });
        seen[lower(e.key)] = 1; seenF[e.field] = 1; out.push(o);
    });
    return out.length ? out : null;
}
// 1.6.0, the map environment, fold 4 (docs/MAP_ENVIRONMENT_PLAN.md 11 and 12; the owner, by prompt: "As drawn"): where a character's readings
// stand against their bands, judged here alone. Each band is a formula of the character's names (Temperature Tolerance shifts them), read with
// the sheet's resolver in the reading's stored unit, and a reading is judged only where its field holds a number: the danger bands first, below
// dangerLow or above dangerHigh, then the warning bands, below warnLow or above warnHigh. A band that cannot be worked out counts for nothing.
// Answers [{ key, label, field, unit, v, band: '' | 'warn' | 'danger', side: '' | 'low' | 'high' }] in the system's order
function envBands(sys, char, F, vars) {
    var out = [], env = isObj(sys) && Array.isArray(sys.env) ? sys.env : [];
    if (!env.length || !isObj(char) || !isObj(char.values) || !F || typeof F.evaluate !== 'function') return out;
    var num = function(text) { var r = null; try { r = F.evaluate(text, { vars: vars, random: noDice }); } catch (e) { r = null; } if (!r || !r.ok) return null; var x = typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value; return typeof x === 'number' && fin(x) ? x : null; };
    env.forEach(function(e) {
        if (!isObj(e) || typeof e.field !== 'string' || typeof e.key !== 'string') return;
        var v = hasOwn(char.values, e.field) ? char.values[e.field] : undefined; if (typeof v !== 'number' || !fin(v)) return;
        if (!vars) { try { vars = makeResolver(sys, char, F); } catch (er) { vars = null; } }
        var b = {}; if (vars) ENV_BANDS.forEach(function(k) { if (typeof e[k] === 'string') { var x = num(e[k]); if (x !== null) b[k] = x; } });
        var band = '', side = '';
        if (hasOwn(b, 'dangerLow') && v < b.dangerLow) { band = 'danger'; side = 'low'; }
        else if (hasOwn(b, 'dangerHigh') && v > b.dangerHigh) { band = 'danger'; side = 'high'; }
        else if (hasOwn(b, 'warnLow') && v < b.warnLow) { band = 'warn'; side = 'low'; }
        else if (hasOwn(b, 'warnHigh') && v > b.warnHigh) { band = 'warn'; side = 'high'; }
        out.push({ key: e.key, label: typeof e.label === 'string' && e.label ? e.label : e.key, field: e.field, unit: typeof e.unit === 'string' ? e.unit : '', v: v, band: band, side: side });
    });
    return out;
}
function envWorst(list) {   // the reading a token's badge speaks for: the first at a danger band, else the first at a warning band, else none
    var w = null; (Array.isArray(list) ? list : []).forEach(function(r) { if (!r || !r.band) return; if (!w || (r.band === 'danger' && w.band !== 'danger')) w = r; }); return w;
}
function cleanBudgets(v, F) {
    var out = [], seen = map();
    (Array.isArray(v) ? v : []).forEach(function(b) {
        if (out.length >= LIMITS.budgets || !isObj(b)) return;
        var id = typeof b.id === 'string' && BUDGET_ID.test(b.id) ? b.id : '', name = cutText(b.name, LIMITS.name), has = budgetFormula(b.has, F), spent = budgetFormula(b.spent, F);
        if (!id || seen[id] || !name || !has || !spent) return;
        seen[id] = 1; out.push({ id: id, name: name, has: has, spent: spent, over: hasOwn(BUDGET_OVER, b.over) ? b.over : 'refuse', when: hasOwn(BUDGET_WHEN, b.when) ? b.when : 'always' });
    });
    return out.length ? out : null;
}
// What a budget is worked out from (the owed review, 2026-10-09). NO EFFECT counts in it. Not one made on the spot, in which a player may
// name any field in their view and any amount, the points a character has among them. And not one of the system either: an effect is
// switched with no budget asked, a GM-only one reaches its player as a row of its own that their app could not tell from one made on the
// spot, and a figure that follows a passing effect could be raised, spent against and dropped again. Neither do the changes of a row a
// PLAYER made on the sheet (`own`: a custom row, whose changes its player writes as freely). The changes of an item of the system or its
// library count, and those of a row the GM made: taking, dropping and switching one are each judged. So the figures are the character's
// own values with its effects lists emptied and the changes of its players' own rows left out, and no automatic effect is applied
// (budgetsOf). The host's record and its owner's copy hold the same of all that, so both machines work out the same figures
function budgetChar(sys, char) {
    var vals = isObj(char.values) ? char.values : null, out = null, put = function(id, v) { out = out || Object.assign({}, vals); out[id] = v; };
    if (vals) sys.fields.forEach(function(f) {
        if (!isObj(f) || typeof f.id !== 'string' || !hasOwn(vals, f.id) || !Array.isArray(vals[f.id])) return;
        var rows = vals[f.id];
        if (f.kind === 'effects') { if (rows.length) put(f.id, []); return; }
        var moved = false, kept = rows.map(function(r) {
            if (!isObj(r) || r.own !== 1 || !isObj(r.def) || r.lnk === 1 || typeof r.defId === 'string' || !Array.isArray(r.def.mods) || !r.def.mods.length) return r;
            moved = true; var d = Object.assign({}, r.def); delete d.mods; return Object.assign({}, r, { def: d });
        });
        if (moved) put(f.id, kept);
    });
    return out ? Object.assign({}, char, { values: out }) : char;
}
// The figures of every budget for one character: [{ id, name, has, spent, left, over, rule, when }]. A figure is a number, or null where its
// formula could not be worked out for this character: such a budget is shown without figures. over: spent is past has
function budgetsOf(sys, char, F) {
    var out = [], list = isObj(sys) && Array.isArray(sys.budgets) ? sys.budgets : [];
    if (!list.length || !isObj(char) || !Array.isArray(sys.fields) || !F || typeof F.evaluate !== 'function') return out;
    var vars = makeResolver(sys, budgetChar(sys, char), F, { noAuto: true });
    var num = function(text) { var r = null; try { r = F.evaluate(text, { vars: vars, random: noDice }); } catch (e) { r = null; } if (!r || !r.ok) return null; var x = typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value; return typeof x === 'number' && fin(x) ? x : null; };
    list.forEach(function(b) {
        if (!isObj(b) || typeof b.id !== 'string' || typeof b.has !== 'string' || typeof b.spent !== 'string') return;
        var h = num(b.has), s = num(b.spent), ok = h !== null && s !== null;
        out.push({ id: b.id, name: typeof b.name === 'string' ? b.name : '', has: h, spent: s, left: ok ? h - s : null, over: ok && s - h > 1e-9, rule: b.over, when: b.when });
    });
    return out;
}
// The host's judgement of a player's own change, asked BEFORE the change is stored. changes: { fieldId: the new value }, as the edit and the
// row gates answer them. A budget is breached when, with the change, it is over AND further over than it was: a change that leaves an overrun
// the same or smaller goes through, so a character that is over can be put right a step at a time. A budget is watched by its `when`; one set
// to off is not judged. A figure that cannot be worked out (the owed review, 2026-10-09: a player could make one fail, by a division by a field
// of their own, and was then judged by nothing): a change that takes a budget from worked out to not is a breach (`lost`, with the figures
// it had); one that brings it back is judged as if nothing had been over before, so over at all is a breach; one that cannot be worked out
// before or after is not judged. { refuse: the first breached budget set to refuse, or null; warn: the breached budgets set to warn }, each
// { id, name, has, spent, by } and, for a figure lost, lost: true
function budgetWatch(sys, char, changes, F) {
    var out = { refuse: null, warn: [] }, list = isObj(sys) && Array.isArray(sys.budgets) ? sys.budgets : [];
    if (!list.length || !isObj(char) || !isObj(changes)) return out;
    var mk = openChar(char) === 'making', live = map(), any = false;
    list.forEach(function(b) { if (isObj(b) && typeof b.id === 'string' && (b.over === 'refuse' || b.over === 'warn') && (b.when === 'always' || (b.when === 'making' ? mk : b.when === 'play' && !mk))) { live[b.id] = b.over; any = true; } });
    if (!any) return out;
    var vals = {}, old = isObj(char.values) ? char.values : {};
    Object.keys(old).forEach(function(k) { if (FIELD_ID.test(k)) vals[k] = old[k]; });
    Object.keys(changes).forEach(function(k) { if (FIELD_ID.test(k)) vals[k] = changes[k]; });
    var was = map(); budgetsOf(sys, char, F).forEach(function(x) { was[x.id] = x; });
    budgetsOf(sys, Object.assign({}, char, { values: vals }), F).forEach(function(x) {
        var rule = live[x.id], w = was[x.id], hit = null;
        if (!rule || !w) return;
        if (x.left === null) { if (w.left === null) return; hit = { id: x.id, name: x.name, has: w.has, spent: w.spent, by: 0, lost: true }; }
        else {
            var d1 = x.spent - x.has, d0 = w.left === null ? 0 : w.spent - w.has;
            if (!(d1 > 1e-9) || !(d1 > d0 + 1e-9)) return;
            hit = { id: x.id, name: x.name, has: x.has, spent: x.spent, by: d1 };
        }
        if (rule === 'refuse') { if (!out.refuse) out.refuse = hit; } else out.warn.push(hit);
    });
    return out;
}
// What a breach says, to the player and to the GM alike: the budget's name and its figures, as text
function budgetSays(hit) { return !isObj(hit) ? '' : hit.lost === true ? cutText(hit.name, LIMITS.name) + ' cannot be worked out with that change.' : cutText(hit.name, LIMITS.name) + ': ' + fmtNum(hit.spent) + ' of ' + fmtNum(hit.has) + ' spent. That is ' + fmtNum(hit.by) + ' over.'; }
// Stage 3: optional per-section colors — hex only (accent = title + left stripe, bg = panel, border = box), like the doc-theming whitelist.
function cleanSecStyle(v) {
    if (!isObj(v)) return null;
    var HEX = /^#[0-9a-fA-F]{6}$/, out = {};
    ['accent', 'bg', 'border'].forEach(function(k) { if (typeof v[k] === 'string' && HEX.test(v[k])) out[k] = v[k].toLowerCase(); });
    if (out.accent && v.stripe === false) out.stripe = false;   // Stage 5g: the accent colours the title only, without the left stripe (kept only beside an accent)
    return Object.keys(out).length ? out : null;
}
// 5h: one change an effect makes — ADD a number to a number, a skill's total, a formula or a resource's max, or switch a toggle ON. The
// target must exist (fieldKinds: id -> kind; in the players' view GM-only fields are absent, so such a change is dropped) and fit its kind.
function cleanMod(m, fieldKinds) {
    if (!isObj(m) || typeof m.f !== 'string' || !FIELD_ID.test(m.f) || !fieldKinds || !fieldKinds[m.f]) return null;
    var k = fieldKinds[m.f];
    if (m.op === 'on') return k === 'toggle' ? { f: m.f, op: 'on' } : null;
    if (m.op !== 'add' && !MOD_LIM[m.op]) return null;
    var op = m.op, v = typeof m.v === 'number' ? m.v : Number(m.v); if (!isFinite(v) || Math.abs(v) > LIMITS.effectAmount) return null;   // 1.6.0: max, at least v; min, at most v
    if (m.part === 'max') return k === 'resource' ? { f: m.f, op: op, v: v, part: 'max' } : null;
    if (k === 'item-list') return rowModAim(m) ? { f: m.f, op: op, v: v, key: m.key, col: m.col } : null;   // 1.5.8: one row of a list, by its key
    return (k === 'number' || k === 'skill' || k === 'formula') ? { f: m.f, op: op, v: v } : null;
}
// 1.6.0 (the campaign build: two effects that each mean "state 1" on a coded field added up to 2, another state): a change may set a floor or a
// ceiling. op 'max' holds the value at least v and op 'min' at most v, after every change that adds; of several floors the highest counts and of
// several ceilings the lowest. Neither is multiplied by a row's level. MOD_LIM names them; limFx applies them
var MOD_LIM = Object.freeze({ max: 1, min: 1 });
function limFx(v, s) { if (typeof s.lo === 'number' && v < s.lo) v = s.lo; if (typeof s.hi === 'number' && v > s.hi) v = s.hi; if (v > 1e15) v = 1e15; else if (v < -1e15) v = -1e15; return v; }
// 1.5.8 (the owner, by prompt: "A change on one skill"): a change aimed at one row of an item list names the entry's key and one of the list's
// columns; it adds to that column as it is worked out for every row whose entry has that key (a skill not bought, read at its default, too)
function rowModAim(m) { return isObj(m) && typeof m.key === 'string' && ITEM_KEY.test(m.key) && typeof m.col === 'string' && STAT_KEY.test(m.col); }
// 5h: what a library effect and an ad hoc row share — name, icon, tone, duration note, notes, changes (plain literals, fixed key order)
function cleanEffectCore(d, fieldKinds) {
    var mods = [];
    (Array.isArray(d.mods) ? d.mods : []).forEach(function(m) { if (mods.length >= LIMITS.effectMods) return; var c = cleanMod(m, fieldKinds); if (c) mods.push(c); });
    return { name: str(d.name, LIMITS.name).replace(CTRL_RE_G, ' ').trim() || 'Effect', icon: cleanIcon(d.icon), tone: d.tone === 'buff' || d.tone === 'debuff' ? d.tone : '',
             dur: cutPoints(d.dur, LIMITS.effectDur, ' '), notes: str(d.notes, LIMITS.text).replace(CTRL_RE_G, ' ').trim(), mods: mods };
}
// 5h: a library effect (camp.system.effects). A GM-only one never reaches the players' library (it can still reach its owner inline, once
// applied: see charFor).
function cleanEffectDef(d, fieldKinds, gmView, F) {   // conditions C4: F, for an automatic effect's formula (none: it is left out)
    if (!isObj(d) || typeof d.id !== 'string' || !EFFECT_ID.test(d.id)) return null;
    var vis = d.vis === 'gm' ? 'gm' : 'all'; if (!gmView && vis === 'gm') return null;
    var c = cleanEffectCore(d, fieldKinds), o = { id: d.id, name: c.name, icon: c.icon, tone: c.tone, dur: c.dur, notes: c.notes, vis: vis, mods: c.mods };
    var au = vis === 'gm' ? null : cleanFormulaText(d.auto); if (au && autoFormulaOk(au, F)) o.auto = au;   // conditions C4: only a visible effect applies itself (the owner's answer, "Only public ones")
    var fxP = typeof d.posture === 'string' && (POSTURE_ID.test(d.posture) || POSTURE_IDS.indexOf(d.posture) >= 0) ? d.posture : ''; if (fxP) { o.posture = fxP; if (d.postureBack === true) o.postureBack = true; if (Array.isArray(d.postureKeep)) { var fxK = []; d.postureKeep.forEach(function(x) { if (fxK.length < LIMITS.postures && typeof x === 'string' && x !== fxP && (POSTURE_ID.test(x) || POSTURE_IDS.indexOf(x) >= 0) && fxK.indexOf(x) < 0) fxK.push(x); }); if (fxK.length) o.postureKeep = fxK; } }   // 1.5.9 (book es/et plan, the owner's O6): the posture its token takes the moment it comes on (a posture of the list by its id), and, ticked, back when it ends; absent, as ever
    var esw = cleanRollSw(d.rollSw, fieldKinds); if (esw) o.rollSw = esw;   // 1.6.0: the bonuses it offers a roll while it is on
    return o;
}
// Conditions C4: an automatic effect's formula — one that reads, rolls no dice (whether it names a GM-only value is judged over the whole system)
function autoFormulaOk(text, F) { if (!F || typeof F.parse !== 'function') return false; var p = F.parse(text); return !!(p && p.ok && p.ast && !hasDice(p.ast.body)); }
// Stage 5g: the sheet's own shape — headline section titles, filled (angled) tabs, one accent colour, the portrait and the name leading
// the header block. Whitelisted values only; absent (or nothing valid) = today's look, and the key is left out.
var LABEL_PX = Object.freeze([13, 14, 16]);
function cleanLook(v) {
    if (!isObj(v)) return null;
    var out = {};
    if (v.titles === 'headline' || v.titles === 'accordion') out.titles = v.titles;   // Stage 6 look fold (L5): accordion titles
    if (v.tabs === 'filled' || v.tabs === 'angular') out.tabs = v.tabs;   // L5: angular tabs ('angled' stays invalid)
    if (typeof v.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.accent)) out.accent = v.accent.toLowerCase();
    if (v.portrait === true) out.portrait = true;
    if (v.labels === 'caps' || v.labels === 'plain') out.labels = v.labels;   // Fold B: field labels in small bold capitals; 1.6.0: 'plain', the header's labels plain too
    if (v.labelInk === 'text') out.labelInk = 'text';   // 1.6.0: labels in the sheet's text colour, not the muted one
    if (LABEL_PX.indexOf(v.labelSize) >= 0) out.labelSize = v.labelSize;   // 1.6.0: labels at a size of their own (the sheet; the HUD keeps its own)
    if (v.sticky === true) out.sticky = true;   // L5: a section's title stays at the top while that section scrolls
    if (v.numbers === 'mono') out.numbers = 'mono';   // L8: figures in a monospaced face
    if (v.band === 'inline' || v.band === 'chips') out.band = v.band;   // L8: the band as one inline row, or as chips
    if (v.steppers === 'inside') out.steppers = 'inside';   // L8: a number box's arrows inside its right edge
    if (v.values === 'boxed') out.values = 'boxed';   // L8: a worked-out result in a box
    if (v.effects === 'cards') out.effects = 'cards';   // L6: status effects as cards, a pill per change
    if (v.rows === 'cards') out.rows = 'cards';   // L8: carried items as cards
    var pal = cleanPalette(v.palette); if (pal) out.palette = pal;   // Stage 6 look fold: every part of the sheet in ten colours
    return Object.keys(out).length ? out : null;
}
// Stage 6 look fold (L1): a sheet palette — ten colours, all or nothing (a partial one would leave theme colours mixed in and read
// differently under each theme); a plain object, since the wire's packer refuses a prototype-free one
var PALETTE_KEYS = ['text', 'muted', 'panel', 'card', 'field', 'edge', 'primary', 'danger', 'good', 'warn'];
function cleanPalette(v) {
    if (!isObj(v)) return null;
    var out = {};
    for (var i = 0; i < PALETTE_KEYS.length; i++) { var k = PALETTE_KEYS[i], x = v[k]; if (typeof x !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(x)) return null; out[k] = x.toLowerCase(); }
    return out;
}
// Stage 4: an item-list field's optional rich-table config. Whitelisted strings + booleans only — no field refs,
// no vis — so host and client agree and there is nothing to inject. Absent ⇒ the plain carried-items list (as before).
// (damage/cost are GM-only on the wire, so those columns simply read blank for players — no leak.)
var ITEM_COL = Object.freeze({ category: 1, cost: 1, damage: 1, area: 1, notes: 1 });
function cleanItemTable(v) {
    if (!isObj(v)) return null;
    var out = {}, cols = [], seen = map();
    (Array.isArray(v.columns) ? v.columns : []).forEach(function(c) { if (typeof c === 'string' && ITEM_COL[c] && !seen[c] && cols.length < 5) { seen[c] = 1; cols.push(c); } });
    if (cols.length) out.columns = cols;
    if (v.chips === true) out.chips = true;
    if (v.footer === true) out.footer = true;
    return Object.keys(out).length ? out : null;
}
// Stage 6 F4b: an item list's options — the categories its picker offers, the same item more than once, no quantity, a level per row (its
// names count from the level's minimum: Powers 1–4) and a switch per row (Readied, Equipped…). Plain values; null when nothing is set. An
// empty categories list survives only in the players' view (none of the list's categories has an item they can see: nothing to pick); the
// GM's empty list means every category.
// 1.6.0 (backlog 180, R2; the owner, by prompt: "A Shows list beside each part"): where a part of a list's row stands. Absent is On the row,
// as every part stood before; 'details' is the row's details (its 📝 line, or the body of a row that opens), 'hide' is drawn nowhere (worked
// with all the same). Only those two words are kept, the same in both views
function partPlaceIn(o, v) { if (isObj(o) && isObj(v) && (v.place === 'details' || v.place === 'hide')) o.place = v.place; return o; }
function cleanListSpec(v, gmView, F) {   // F (F4c1): the engine, for a stat key (validKey('Row.' + key))
    if (!isObj(v)) return null;
    var out = {};
    if (Array.isArray(v.cats)) {
        var cs = [], seenC = map();
        v.cats.forEach(function(c) { var t = cutText(c, LIMITS.category); if (!t || seenC[lower(t)] || cs.length >= LIMITS.listCats) return; seenC[lower(t)] = 1; cs.push(t); });
        if (cs.length || (!gmView && v.cats.length === 0)) out.cats = cs;
    }
    if (v.multi === true) out.multi = true;
    if (v.noQty === true) out.noQty = true;
    var lv = cleanLvlSpec(v.lvl); if (lv) out.lvl = partPlaceIn(lv, v.lvl);
    if (isObj(v.on)) { var sw = { label: cutText(v.on.label, LIMITS.label) || 'On' }; if (v.on.def === true) sw.def = true; var swOff = cutText(v.on.offLabel, LIMITS.label); if (swOff) { sw.offLabel = swOff; var swIc = cleanIcon(v.on.icon); if (swIc) sw.icon = swIc; }   // 1.6.0 R6: the switch as a button with two words (the word while off, then on), and an icon of the bundled set before them
    rollNeedsInto(sw, v.on); var swSh = cleanFormulaText(v.on.showIf); if (swSh) sw.showIf = swSh; out.on = partPlaceIn(sw, v.on); }   // 1.5.8: what a row needs before it is switched on (Row.* read, no dice), and the words a refusal says, as a roll's needs
    if (Array.isArray(v.stats)) {   // F4c1: its stats — a number every item of it carries (Acc, Wt, Cost), LIMITS.listStats at most, each key once ignoring case (the first wins; a key is never trimmed or fixed)
        var sts = [], seenS = map();
        for (var si = 0; si < v.stats.length && sts.length < LIMITS.listStats; si++) {
            var s = v.stats[si], pick = isObj(s) && s.kind === 'pick'; if (!isObj(s) || (s.kind !== undefined && s.kind !== 'num' && !pick)) continue;   // F5a2: a number, or a choice (pick) of named options
            var sk = statKey(s.key, F); if (!sk || seenS[lower(sk)]) continue;
            seenS[lower(sk)] = 1;
            var so = { key: sk, label: cutText(s.label, LIMITS.label) || sk };
            if (pick) {   // F5a2: a choice — options { label, name } (the name: one numeric name formulas read, ST); its default is an option's label
                so.kind = 'pick'; so.opts = cleanPickOpts(s.opts);
                var pdl = typeof s.def === 'string' ? lower(cutText(s.def, LIMITS.label)) : ''; for (var po = 0; pdl && po < so.opts.length; po++) if (lower(so.opts[po].label) === pdl) { so.def = so.opts[po].label; break; }
            } else {
            var sd = statNum(s.def); if (sd !== undefined && sd !== 0) so.def = sd;
            var slb = cleanLabels(s.labels); if (slb) { so.labels = slb; var stn = cleanTones(s.tones, slb.length); if (stn) so.tones = stn; }   // 1.6.0 R5: a tone per value name, as a field's
            var sun = unitOf(s.unit); if (sun) { so.unit = sun; if (cleanFieldUnit(sun, 'number')) { if (s.unitShow === 'swap' || s.unitShow === 'bare') so.unitShow = s.unitShow; var sdm = decCount(s.decMax); if (sdm !== null) so.decMax = sdm; } }   // 1.5.4: a unit after its figure, a measure in metric under Metric as a field's is, and a measure's most decimals
            }   // names for the values 0, 1, 2... (a value past them shows as the number: no clamp, so lists sharing a key never fight)
            if (!pick && s.split === true) so.split = true;   // 1.5.6 Split in trades: a trade may take part of this figure of a row (a chip's stored money)
            if (s.hide === true) so.hide = true;   // 1.5.4 Hidden: a figure the row only works with (a cost per level, a step) — never drawn on a row, in its details, in a table or in the picker; formulas read it and the row's own-values form shows it. It wins over On the row, and it is no secret (the players' view holds it alike)
            else if (s.show === true) so.show = true;   // On the row: a chip beside the name, a column in a rich table
            sts.push(so);
        }
        if (sts.length) out.stats = sts;
    }
    if (out.on && isObj(v.on)) {   // 1.5.4 One at a time: one row of the list on (one), or one for each value of a stat of the list, a number or a choice (per: its key as the list spells it). Never both: per wins, and one that names no stat leaves one. The same in both views
        var opw = typeof v.on.per === 'string' ? lower(v.on.per.trim()) : '', ops = null, ovw = typeof v.on.over === 'string' ? lower(v.on.over.trim()) : '', ovs = null;
        for (var opi = 0; opw && out.stats && opi < out.stats.length; opi++) if (lower(out.stats[opi].key) === opw) { ops = out.stats[opi]; break; }
        for (var ovi = 0; ovw && out.stats && ovi < out.stats.length; ovi++) if (out.stats[ovi].kind !== 'pick' && lower(out.stats[ovi].key) === ovw) { ovs = out.stats[ovi]; break; }   // 1.6.0 O1: over, a number stat read as a set of places
        if (ovs) { out.on.over = ovs.key; ovs.set = true; } else if (ops) out.on.per = ops.key; else if (v.on.one === true) out.on.one = true;
    }
    if (out.stats && typeof v.price === 'string') { var pl = lower(v.price); for (var pi = 0; pi < out.stats.length; pi++) if (lower(out.stats[pi].key) === pl) { if (out.stats[pi].kind !== 'pick') out.price = out.stats[pi].key; break; } }   // F5a2: never a choice   // F4c1: the price is one of its stats (stored as its key): a row records it as paid when it is added
    if (v.money === '@lvl' && isObj(out.lvl) && !Array.isArray(out.lvl.labels)) out.money = '@lvl';   // 1.5.6 a Money box: each row holds its level (a chip's money)
    else if (out.stats && typeof v.money === 'string') { var mk = lower(v.money); for (var mi = 0; mi < out.stats.length; mi++) if (lower(out.stats[mi].key) === mk) { if (out.stats[mi].kind !== 'pick') out.money = out.stats[mi].key; break; } }   // ... or each piece is worth a number stat (a bar's denomination)
    if (out.price && (v.paidPlace === 'details' || v.paidPlace === 'hide')) out.paidPlace = v.paidPlace;   // 1.6.0 R2: where Paid stands
    var bdg = cleanBadges(v.badges, F); if (bdg) out.badges = bdg;   // 1.6.0 R4: its row badges
    if (v.boxes === true) out.boxes = true;   // 1.6.0 R3 (the owner, by prompt: "A. A list ticks it"): Figures as boxes in a row's details
    if (isObj(out.lvl) && typeof v.unheld === 'string') { var uhT = cleanFormulaText(v.unheld); if (uhT) out.unheld = uhT; }   // 1.6.0 Rolls unheld entries (the owner, by prompt: "On the list (Recommended)", "GM and owner, by a tick (Recommended)"): the level an entry nobody holds is rolled at, a formula of its own names, on a list with a level
    if (v.edge === true) out.edge = true;   // 1.6.0 R16: Edge follows its state, a row's edge in the tone of its strongest badge, else the accent while it is switched on
    if (v.menus === true) out.menus = true;
    if (typeof v.sets === 'string' && v.sets && isObj(out.on)) { var stS = (Array.isArray(out.stats) ? out.stats : []).filter(function(s) { return isObj(s) && lower(s.key) === lower(v.sets) && s.set !== true && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length > 0 : Array.isArray(s.labels) && s.labels.length > 0); })[0]; if (stS) out.sets = stS.key; }   // 1.6.0 R15: Sets by a choice stat, the rows of one value a set switched on together
    if (typeof v.placeBy === 'string' && v.placeBy) { var pbS = (Array.isArray(out.stats) ? out.stats : []).filter(function(s) { return isObj(s) && lower(s.key) === lower(v.placeBy) && s.set !== true && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length > 0 : Array.isArray(s.labels) && s.labels.length > 0); })[0]; if (pbS) out.placeBy = pbS.key; }   // 1.6.0 R13: Places split by a choice stat, its value names in place of categories   // 1.6.0 R10: Choices as menus, a choice stat a menu on its row for whoever may set the copy's own stats
    if (v.open === true) out.open = true;   // 1.6.0 R1 (the owner, by prompt: "A tick the builder sets"): Rows open for their details
    if (v.trade === true) out.trade = true;   // 1.5.6 Tradable: rows of this list may be traded between characters (gear, money; never a skill)
    if (v.custom === true) out.custom = true;   // F4c3: Custom rows — players may add rows of their own (+ Custom…); the GM may on any list shaped here
    if (Array.isArray(v.cols)) {   // F5a1: its columns — a formula worked out for each row (Row.lvl, Row.<stat>…), LIMITS.listCols at most; a key shares the stats' names (unique ignoring case)
        var cls = [], seenK = map(); (out.stats || []).forEach(function(x) { seenK[lower(x.key)] = 1; });
        for (var ci = 0; ci < v.cols.length && cls.length < LIMITS.listCols; ci++) {
            var cv = v.cols[ci]; if (!isObj(cv)) continue;
            var ck = statKey(cv.key, F); if (!ck || seenK[lower(ck)]) continue;
            seenK[lower(ck)] = 1;
            var co = { key: ck, label: cutText(cv.label, LIMITS.label) || ck, formula: cv.formula === null ? null : (cleanFormulaText(cv.formula) || '') };   // null: the players' view blanked it (a GM-only name) — kept, so the view is a fixed point
            var cu = unitOf(cv.unit, true); if (cu) { co.unit = cu; if (cleanFieldUnit(cu, 'number')) { if (cv.unitShow === 'swap' || cv.unitShow === 'bare') co.unitShow = cv.unitShow; var cdm = decCount(cv.decMax); if (cdm !== null) co.decMax = cdm; } }   // 1.5.4: how a measure reads under Metric, and its most decimals
            var clb = cleanLabels(cv.labels); if (clb) { co.labels = clb; var ctn = cleanTones(cv.tones, clb.length); if (ctn) co.tones = ctn; }   // 1.6.0 R5
            if (cv.hide === true) co.hide = true;   // worked out (totals, other columns) but not drawn on the row
            else if (cv.place === 'details') co.place = 'details';   // 1.6.0 R2: drawn in the row's details (Hidden stays the column's own hide)
            if (cv.foot === true) co.foot = true;   // its total under the list
            if (Array.isArray(cv.plus)) {   // 1.5.4 With: number stats of this list that add to the column in a case of their own, by the list's own spelling, each once, LIMITS.colPlus at most. The same in both views: a stat is no secret
                var cps = [], seenW = map();
                for (var wi = 0; wi < cv.plus.length && wi < 64 && cps.length < LIMITS.colPlus; wi++) {
                    var wk = typeof cv.plus[wi] === 'string' ? lower(cv.plus[wi].trim()) : '', ws = null;
                    for (var wj = 0; wk && out.stats && wj < out.stats.length; wj++) if (out.stats[wj].kind !== 'pick' && lower(out.stats[wj].key) === wk) { ws = out.stats[wj]; break; }
                    if (ws && !seenW[wk]) { seenW[wk] = 1; cps.push(ws.key); }
                }
                if (cps.length) co.plus = cps;
            }
            cls.push(co);
        }
        if (cls.length) out.cols = cls;
    }
    if (Array.isArray(v.counters)) {   // Stage 6 HUD R2: its counters — a whole number each row keeps (Charges, Hits), LIMITS.rowCounters at most: a key of its own (never a stat's or a
        // column's), a label, where a row starts (0..1e6) and its most (a formula, Row.* read; null: the players' view blanked a GM-only name)
        var cts = [], seenT = map(); (out.stats || []).concat(out.cols || []).forEach(function(x) { seenT[lower(x.key)] = 1; });
        for (var ti = 0; ti < v.counters.length && cts.length < LIMITS.rowCounters; ti++) {
            var tv = v.counters[ti]; if (!isObj(tv)) continue;
            var tk = statKey(tv.key, F); if (!tk || seenT[lower(tk)]) continue; seenT[lower(tk)] = 1;
            var to = { key: tk, label: cutText(tv.label, LIMITS.label) || tk }, tdn = Number(tv.def); if (typeof tv.def === 'number' && fin(tdn) && tdn > 0) to.def = Math.min(1e6, Math.round(tdn));
            if (tv.max === null) to.max = null; else { var tmx = cleanFormulaText(tv.max); if (tmx) to.max = tmx; }
            var ttm = cleanRowTimer(tv.timer); if (ttm) { if (!out.on) { delete ttm.on; delete ttm.reset; } to.timer = ttm; }   // 1.6.0 Counts by the game clock (Only while on needs the list's switch)
            var tal = cleanAlt(tv.alt, F); if (tal) to.alt = tal;   // 1.6.0: its other names, row by row
            if (tv.roll === true) to.roll = true;   // 1.5.7: Set by rolls only (a roll's change, an action and the GM set it; a player never by hand)
            partPlaceIn(to, tv);   // 1.6.0 R2
            if (tv.turn === true) to.turn = true;   // 1.6.0 (the v2 combat module): Starts again each turn, at its character's turn start in a fight
            cts.push(to);
        }
        if (cts.length) out.counters = cts;
    }
    if (isObj(v.load) && out.counters) {   // 1.5.8 Loads from: a row of this list loads one unit of a row of another item list (from, a field id; cleanSystem keeps it only where that is another item list with a level); ct, one of this list's counters, holds what the loaded row has left; cats, the categories of that list it takes (none: any row). The same in both views
        var ldF = typeof v.load.from === 'string' && FIELD_ID.test(v.load.from) ? v.load.from : '', ldK = typeof v.load.ct === 'string' ? lower(v.load.ct.trim()) : '', ldT = '';
        out.counters.forEach(function(x) { if (!ldT && lower(x.key) === ldK) ldT = x.key; });
        if (ldF && ldT) {
            var ldo = { from: ldF, ct: ldT }; rollNeedsInto(ldo, v.load);
            var ldBy = typeof v.load.by === 'string' ? statKey(v.load.by.trim(), F) : '', ldTo = typeof v.load.to === 'string' ? statKey(v.load.to.trim(), F) : '', ldByS = '';   // Matched by: a stat of this list (spelled as it is) and a stat key of the source list
            (out.stats || []).forEach(function(s) { if (!ldByS && ldBy && lower(s.key) === lower(ldBy)) ldByS = s.key; });
            if (ldByS && ldTo) { ldo.by = ldByS; ldo.to = ldTo; }   // Loads only where: what a row must meet before it may load, and its words
            if (Array.isArray(v.load.cats)) { var ldc = [], seenL = map(); v.load.cats.forEach(function(c) { var lt = cutText(c, LIMITS.category); if (!lt || seenL[lower(lt)] || ldc.length >= LIMITS.listCats) return; seenL[lower(lt)] = 1; ldc.push(lt); }); if (ldc.length || (!gmView && v.load.cats.length === 0)) ldo.cats = ldc; }
            out.load = ldo;
        }
    }
    if (isObj(v.parts)) {   // 1.6.0, backlog 180 R14 (the owner, by prompt: "A. A row of a list", "A. Pills under the row", "A. Count and totals"): this list's rows hold parts, rows of an item list (from, a field id: another list or this one; cleanSystem keeps it only where that list is in the view); cats, the categories a part may be; label, the word on its add button. The same in both views
        var ptF = typeof v.parts.from === 'string' && FIELD_ID.test(v.parts.from) ? v.parts.from : '';
        if (ptF) {
            var pto = { from: ptF };
            if (Array.isArray(v.parts.cats)) { var ptc = [], seenPt = map(); v.parts.cats.forEach(function(c) { var pc2 = cutText(c, LIMITS.category); if (!pc2 || seenPt[lower(pc2)] || ptc.length >= LIMITS.listCats) return; seenPt[lower(pc2)] = 1; ptc.push(pc2); }); if (ptc.length) pto.cats = ptc; }
            var ptLb = cutText(v.parts.label, LIMITS.label); if (ptLb) pto.label = ptLb;
            var ptCb = typeof v.parts.capBy === 'string' ? lower(statKey(v.parts.capBy.trim(), F)) : '';   // 1.6.0 (v2, B6): a host holds as many parts as one of its number stats reads, spelled as this list spells it
            (out.stats || []).forEach(function(s) { if (!pto.capBy && ptCb && s.kind !== 'pick' && s.set !== true && lower(s.key) === ptCb) pto.capBy = s.key; });
            if (Array.isArray(v.parts.hosts)) { var pth = [], seenPh = map(); v.parts.hosts.forEach(function(c) { var ph2 = cutText(c, LIMITS.category); if (!ph2 || seenPh[lower(ph2)] || pth.length >= LIMITS.listCats) return; seenPh[lower(ph2)] = 1; pth.push(ph2); }); if (pth.length) pto.hosts = pth; }   // 198: the categories a row may be to hold parts (none named: every row that is no part)
            out.parts = pto;
        }
    }
    if (isObj(v.chamber)) {   // 1.5.9 Chambers from: a row of this list chambers rounds, one unit at a time, from an item list (from, a field id: another list or this one; cleanSystem keeps it only where that list is in the view). cap, how many it holds (1 to CHAMBER_CAP); label, its button's word; by and to, Matched by, as a load's; cats, the categories it takes. The same in both views
        var chF = typeof v.chamber.from === 'string' && FIELD_ID.test(v.chamber.from) ? v.chamber.from : '';
        if (chF) {
            var chN = typeof v.chamber.cap === 'number' && fin(v.chamber.cap) ? Math.round(v.chamber.cap) : 1, cho = { from: chF, cap: Math.max(1, Math.min(CHAMBER_CAP, chN)) };
            var chCb = typeof v.chamber.capBy === 'string' ? lower(statKey(v.chamber.capBy.trim(), F)) : '';   // 1.5.9 (the review of fold 2, docs/BOOK_ES_ET_PLAN.md: "Chambers from's cap should be able to come from the ROW"): a number stat of this list, spelled as it is; a row whose figure there is 1 or more holds that many (chamberCap)
            (out.stats || []).forEach(function(s) { if (!cho.capBy && chCb && s.kind !== 'pick' && lower(s.key) === chCb) cho.capBy = s.key; });
            var chBy = typeof v.chamber.by === 'string' ? statKey(v.chamber.by.trim(), F) : '', chTo = typeof v.chamber.to === 'string' ? statKey(v.chamber.to.trim(), F) : '', chByS = '';
            (out.stats || []).forEach(function(s) { if (!chByS && chBy && lower(s.key) === lower(chBy)) chByS = s.key; });
            if (chByS && chTo) { cho.by = chByS; cho.to = chTo; }
            var chLb = cutText(v.chamber.label, LIMITS.label); if (chLb) cho.label = chLb;
            if (Array.isArray(v.chamber.cats)) { var chc = [], seenCh = map(); v.chamber.cats.forEach(function(c) { var ct2 = cutText(c, LIMITS.category); if (!ct2 || seenCh[lower(ct2)] || chc.length >= LIMITS.listCats) return; seenCh[lower(ct2)] = 1; chc.push(ct2); }); if (chc.length || (!gmView && v.chamber.cats.length === 0)) cho.cats = chc; }
            rollNeedsInto(cho, v.chamber);   // Chambers only where (1.5.9): what a row must meet before it may chamber, and its words, kept as Loads only where's
            var chRc = cleanReach(v.chamber.reach, F); if (chRc) cho.reach = chRc;   // 1.5.9 (es) Flies at most: how far a round that flies straight goes, from the row's own names
            out.chamber = cho;
        }
    }
    if (isObj(v.once)) {   // 1.5.8 Counted once: rows whose group stat reads the same figure, not 0, are one thing held two ways (onceOf). by and free a number stat, rank the level or a number stat, cost a number stat or a column, each as the list spells it. The same in both views: none of them is a secret
        var onum = function(k) { if (typeof k !== 'string') return ''; var lk = lower(k.trim()); for (var oi = 0; lk && out.stats && oi < out.stats.length; oi++) if (out.stats[oi].kind !== 'pick' && lower(out.stats[oi].key) === lk) return out.stats[oi].key; return ''; };
        var ocol = function(k) { if (typeof k !== 'string') return ''; var lk = lower(k.trim()); for (var oj = 0; lk && out.cols && oj < out.cols.length; oj++) if (lower(out.cols[oj].key) === lk) return out.cols[oj].key; return ''; };
        var oby = onum(v.once.by), ork = v.once.rank === 'lvl' && out.lvl ? 'lvl' : onum(v.once.rank);
        if (oby && ork) { var oo = { by: oby, rank: ork }, oc = onum(v.once.cost) || ocol(v.once.cost), ofr = onum(v.once.free); if (oc) oo.cost = oc; if (ofr) oo.free = ofr; out.once = oo; }
    }
    if (Array.isArray(v.rolls)) {   // F5b: its rolls — a button on each row, the formula worked out with the row's names (Row.*; dice allowed), LIMITS.rowRolls at most
        var rls = [];
        v.rolls.forEach(function(rv) { if (rls.length >= LIMITS.rowRolls || !isObj(rv)) return; if (Array.isArray(rv.apply)) { var lap = { label: cutText(rv.label, LIMITS.label) || 'Apply', apply: cleanApplyChanges(rv.apply, false, true) }, lac = costKey(rv.cost); if (lac) lap.cost = lac; if (rv.to === 'near') lap.to = 'near'; if (rv.gm === true) lap.gm = true; var lsh = cleanFormulaText(rv.showIf); if (lsh) lap.showIf = lsh; var lal = cleanAlt(rv.alt, F); if (lal) lap.alt = lal; var lic = cleanIcon(rv.icon); if (lic) lap.icon = lic; if (gmView) { var lxc = cleanRowCross(rv.cross, out.counters); if (lxc) lap.cross = lxc; } partPlaceIn(lap, rv); rls.push(lap); return; } var rro = { label: cutText(rv.label, LIMITS.label) || 'Roll', formula: cleanFormulaText(rv.formula) || '' }; if (Array.isArray(rv.then)) { var rth = cleanApplyChanges(rv.then, true, true); if (rth.length) rro.then = rth; } var rmf2 = cleanFormulaText(rv.malf); if (rmf2) rro.malf = rmf2; critRangeInto(rro, rv); var rbg2 = cleanFormulaText(rv.bigAt); if (rbg2) rro.bigAt = rbg2; if (rv.dmg === true) { rro.dmg = true; var rdt = cleanFormulaText(rv.dtype); if (rdt) rro.dtype = rdt; var rad = cleanFormulaText(rv.ad); if (rad) rro.ad = rad; } var rnd = cleanFormulaText(rv.needs); if (rnd) { rro.needs = rnd; var rnt = cutText(rv.needsText, LIMITS.label); if (rnt) rro.needsText = rnt; } var lrc = costKey(rv.cost); if (lrc) rro.cost = lrc; var lrd = cleanDie(rv.die); if (lrd) rro.die = lrd; if (rv.to === 'near') rro.to = 'near'; if (rv.gm === true) rro.gm = true; var rsh = cleanFormulaText(rv.showIf); if (rsh) rro.showIf = rsh; var ral = cleanAlt(rv.alt, F); if (ral) rro.alt = ral; var rshw = rollShowOf(rv.show, out.cols); if (rshw) rro.show = rshw; var ric = cleanIcon(rv.icon); if (ric) rro.icon = ric; if (rv.askLvl === true && out.lvl) rro.askLvl = true; if (gmView) { var rxc = cleanRowCross(rv.cross, out.counters); if (rxc) rro.cross = rxc; } resistByInto(rro, rv, gmView); partPlaceIn(rro, rv); rls.push(rro); });   // cross (1.6.0): it also runs on a row whose counter crosses a step   // showIf (1.6.0): Shown where, a formula of the row's names; its button only on rows where it holds   // 1.6.0: gm, only the GM presses it (the players' view drops it: applyTargets)   // R2b: a list roll's consequences (a counter too) and what it needs   // HUD H7b: or an apply action on each row (its amounts read the row as Row.*)
        if (rls.length) out.rolls = rls;
    }
    return Object.keys(out).length ? out : null;
}
// Stage 6 F5a2: a choice stat's options — { label ≤60, name } each, at most LIMITS.pickOpts, a label once ignoring case; the name one formula name
// (letters, digits, _ and dots, 64 at most: the dice path's cap). An option without a usable name (the players' view drops a GM-only one) is left out
function cleanPickOpts(v) {
    var out = [], seen = map();
    (Array.isArray(v) ? v : []).forEach(function(o) {
        if (out.length >= LIMITS.pickOpts || !isObj(o)) return;
        var lb = cutText(o.label, LIMITS.label), nm = typeof o.name === 'string' ? o.name.trim() : '';
        if (!lb || seen[lower(lb)] || !/^[A-Za-z_][A-Za-z0-9_.]{0,63}$/.test(nm)) return;
        seen[lower(lb)] = 1; out.push({ label: lb, name: nm });
    });
    return out;
}
// F5a2: the choice stats of a view's item lists — lower-case key -> (lower-case label -> the label as the list spells it), the first list's; a key a
// list defines as a number first is a number. Local, never sent
function statPicks(fields) {
    var m = map(), kind = map();
    (Array.isArray(fields) ? fields : []).forEach(function(f) { if (isObj(f) && f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.stats)) f.list.stats.forEach(function(s) { var k = isObj(s) ? statKey(s.key) : ''; if (!k || kind[lower(k)]) return; kind[lower(k)] = s.kind === 'pick' ? 'pick' : 'num'; if (s.kind === 'pick') { var lm = map(); (s.opts || []).forEach(function(o) { if (isObj(o) && typeof o.label === 'string') lm[lower(o.label)] = o.label; }); m[lower(k)] = lm; } }); });
    return m;
}
function picksOf(spec) { var m = null; (isObj(spec) && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { var k = isObj(s) && s.kind === 'pick' ? statKey(s.key) : ''; if (k && !(m && m[lower(k)])) { m = m || map(); var lm = map(); (s.opts || []).forEach(function(o) { if (isObj(o) && typeof o.label === 'string') lm[lower(o.label)] = o.label; }); m[lower(k)] = lm; } }); return m; }
// F4c1: the stat keys of a view's item lists — lower-case key -> the key as the first list (field order) spells it. Local, never sent
function statKeys(fields) {
    var m = map();
    (Array.isArray(fields) ? fields : []).forEach(function(f) { if (isObj(f) && f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.stats)) f.list.stats.forEach(function(s) { var k = isObj(s) ? statKey(s.key) : ''; if (k && !m[lower(k)]) m[lower(k)] = k; }); });
    return m;
}
// F4c1 (critic 2): one spelling per stat key per system — a later list's cost where an earlier one says Cost becomes Cost (its price with it), so
// every list, entry and row reads one key. The GM's view only: the players' view is drawn from it (a GM-only list first keeps its spelling)
function oneSpelling(fields) {
    var first = statKeys(fields);
    fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.stats)) return; f.list.stats.forEach(function(s) { var k = first[lower(s.key)]; if (k && k !== s.key) { if (f.list.price === s.key) f.list.price = k; if (isObj(f.list.on) && f.list.on.per === s.key) f.list.on.per = k; if (isObj(f.list.on) && f.list.on.over === s.key) f.list.on.over = k; if (Array.isArray(f.list.cols)) f.list.cols.forEach(function(c) { if (isObj(c) && Array.isArray(c.plus)) c.plus = c.plus.map(function(p) { return p === s.key ? k : p; }); }); s.key = k; } }); });
}
// F4c1: stats (an item's, a carried copy's) — numbers within 1e9 under keys a list defines (keys: lower-case -> its spelling; none: the key rule
// alone, a copy's own), at most LIMITS.entryStats, a plain object (the wire's packer refuses a prototype-free one); null when none. One spelling
// a key (F4c1 review): a copy's cost and Cost keep the first, as a list's keys do, so the GM's sheet and its owner's read one value
function cleanEntryStats(v, keys, picks) {   // picks (F5a2): lower key -> the choice's labels (a label no option has is dropped); none: numbers only under keys
    if (!isObj(v)) return null;
    var out = {}, seen = map(), n = 0, ks = Object.keys(v);
    for (var i = 0; i < ks.length && n < LIMITS.entryStats; i++) {
        var kk = keys ? keys[lower(ks[i])] : statKey(ks[i]), raw = v[ks[i]], pk = kk && picks ? picks[lower(kk)] : null;
        var x = pk ? (typeof raw === 'string' ? pk[lower(cutText(raw, LIMITS.label))] : undefined) : (!keys && picks === 'labels' && typeof raw === 'string' ? (cutText(raw, LIMITS.label) || undefined) : statNum(raw));   // picks 'labels': a copy's own (a snapshot, a custom row) may hold a choice's label
        if (!kk || x === undefined || seen[lower(kk)]) continue;
        out[kk] = x; seen[lower(kk)] = 1; n++;
    }
    return n ? out : null;
}
function keysOf(spec) { var m = null; (isObj(spec) && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { var k = isObj(s) ? statKey(s.key) : ''; if (k) { m = m || map(); if (!m[lower(k)]) m[lower(k)] = k; } }); return m; }
function rowStats(v, spec) { var k = keysOf(spec); return k ? cleanEntryStats(v, k, picksOf(spec)) : null; }   // F4c1: a custom or inline copy's stats as its list holds them (a list with no stats: none)
function lvlNum(x) { if (typeof x !== 'number' && typeof x !== 'string') return undefined; if (typeof x === 'string' && !x.trim()) return undefined; var n = Number(x); return fin(n) && Math.abs(n) <= LIMITS.lvlAbs ? n : undefined; }
// 1.5.4 (the owner, 2026-10-05, of a power's details: "theres no actually useful info here about the ability"; by prompt: "On the row
// itself"): an entry's long text, read in a row's details. Its description is prose with its line breaks; what each of its levels gives is
// [{ lvl, text, tag? }], one row a level in level order, at most LIMITS.lvls: text one line, tag a few words shown beside the level (a
// rank's name, a cost). null when nothing is left. The text lives in the library: a stored row and its snapshot never keep a copy of it
// (cleanRowDef drops it), and an owner's inline copy of a row carries it only for an entry players may see (rowText). 1.5.5 (155): a row of
// the character's own is the one exception: it keeps a description and levels of its own (ownLong), as many as LIMITS.ownText a list
// (ownLongOf), and they reach its owner only while the row is not GM-only (projectRows, through rowText's own gate)
function cleanDesc(v) { if (typeof v !== 'string') return ''; var d = v.slice(0, LIMITS.desc * 2).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, LIMITS.desc); return d.trim() ? d : ''; }
function cleanLvls(v) {
    if (!Array.isArray(v)) return null;
    var out = [], seen = map();
    for (var i = 0; i < v.length && i < LIMITS.lvls * 4 && out.length < LIMITS.lvls; i++) {
        var r = v[i]; if (!isObj(r) || typeof r.lvl !== 'number') continue;
        var lv = lvlNum(r.lvl), tx = cutText(r.text, LIMITS.lvlText); if (lv === undefined || !tx || seen[lv] === 1) continue;
        var o = { lvl: lv, text: tx }, tg = cutText(r.tag, LIMITS.lvlTag); if (tg) o.tag = tg;
        seen[lv] = 1; out.push(o);
    }
    out.sort(function(a, b) { return a.lvl - b.lvl; });
    return out.length ? out : null;
}
// The long text an owner's inline copy of a row carries: the entry's, cleaned, for an entry players may see and only while it fits what is
// left of its list's room (room: characters; none given: no limit). Never a GM-only entry's. Returns the characters it added
function rowText(pd, src, room) {
    if (!isObj(pd) || pd.vis !== 'all' || !isObj(src)) return 0;
    var d = cleanDesc(src.desc), l = cleanLvls(src.lvls), n = d.length; if (l) l.forEach(function(r) { n += r.text.length + (r.tag ? r.tag.length : 0) + 8; });
    if (!n || (typeof room === 'number' && n > room)) return 0;
    if (d) pd.desc = d;
    if (l) pd.lvls = l;
    return n;
}
function longSize(def) { if (!isObj(def)) return 0; var d = cleanDesc(def.desc), l = cleanLvls(def.lvls), n = d.length; if (l) l.forEach(function(r) { n += r.text.length + (r.tag ? r.tag.length : 0) + 8; }); return n; }   // 155: a definition's long text, as rowText counts it
function ownLong(d, src) { if (!isObj(d) || !isObj(src)) return; delete d.desc; delete d.lvls; var t = cleanDesc(src.desc), l = cleanLvls(src.lvls); if (t) d.desc = t; if (l) d.lvls = l; }   // 155: a row of the character's own keeps its own long text as stored, whatever its vis (projectRows is the gate), as its last keys
function ownLongOf(list, skip, def) { var n = def ? longSize(def) : 0; (Array.isArray(list) ? list : []).forEach(function(r) { if (!isObj(r) || r === skip || r.hid === 1 || typeof r.defId === 'string' || r.lnk === 1 || !isObj(r.def)) return; n += longSize(r.def); }); return n; }   // 155: the long text a list's own rows hold (a kept curse's copy not counted); skip and def: one row as it would be
function cleanLvlSpec(v) {
    if (!isObj(v)) return null;
    var out = { label: cutText(v.label, LIMITS.label) || 'Level' }, lbs = cleanLabels(v.labels), mn = lvlNum(v.min), mx = lvlNum(v.max), st = lvlNum(v.step);
    if (lbs) { out.min = Math.min(mn === undefined ? 0 : Math.round(mn), LIMITS.lvlAbs - (lbs.length - 1)); out.max = out.min + lbs.length - 1; out.step = 1; }
    else {
        if (mn !== undefined) out.min = mn;
        if (mx !== undefined) out.max = mn !== undefined && mx < mn ? mn : mx;
        out.step = st !== undefined && st >= 1e-6 ? st : 1;
    }
    var d = lvlNum(v.def); out.def = lvlClamp(out, d === undefined ? (out.min !== undefined ? out.min : 0) : d);
    if (lbs) out.labels = lbs;
    else if (v.split === true) out.split = true;   // 1.5.6 Split in trades: a trade may take part of a row's level (a money chip's stored amount); never a level of named values
    if (v.entry === true) out.entry = true;   // 1.6.0 R8 (the owner, by prompt: "A list ticks it"): Levels from the entry, a row's level a menu of its entry's own By level rows
    if (Array.isArray(v.caps)) {   // 1.6.0 At most at a level: { at, n, up }, a level on the list's own terms, a whole number of rows 0 to LIMITS.carried, and or higher; each level and up once, LIMITS.lvlCaps at most. The same in both views
        var cps = [], seenCp = map();
        v.caps.slice(0, 64).forEach(function(c) {
            if (cps.length >= LIMITS.lvlCaps || !isObj(c)) return; var ca = lvlNum(c.at), cn = typeof c.n === 'number' && fin(c.n) ? Math.round(c.n) : NaN; if (ca === undefined || !(cn >= 0)) return;
            var co = { at: lvlClamp(out, ca), n: Math.min(LIMITS.carried, cn) }; if (c.up === true) co.up = true;
            var ck = co.at + '|' + (co.up ? 1 : 0); if (seenCp[ck]) return; seenCp[ck] = 1; cps.push(co);
        });
        if (cps.length) out.caps = cps;
    }
    if (v.start === true) out.start = true;   // 1.6.0 (the owner, by prompt: "Row.startlvl (Recommended)"): Keeps the starting level, each new row stamped with the level it starts at (startStamp)
    return out;
}
// 1.6.0 Keeps the starting level: a new row remembers the level it starts at as sl, read as Row.startlvl. Only where its list ticks it, so a
// list that does not stores what it always did
function startStamp(spec, row) { if (isObj(spec) && isObj(spec.lvl) && spec.lvl.start === true && isObj(row) && typeof row.lvl === 'number') row.sl = row.lvl; }
// 1.6.0 Rolls unheld entries (the owner, by prompt: "On the list (Recommended)", "The library picker (Recommended)", "GM and owner, by a tick
// (Recommended)"): whether a character may roll one entry of a list that they hold none of, at the list's Unheld level. The one judge, asked by the
// GM's own roll (net.diceRoll), the host's roll-req branch and the picker's button. sys: the roller's view of the system; def: the entry as that
// view has it (the players' copy for a player: a GM-only entry is never one); char: the character as the caller holds it. { ok: true, f } or
// { ok: false, msg }, the words naming the entry
function unheldJudge(sys, char, fieldId, def) {
    var f = isObj(sys) && Array.isArray(sys.fields) ? fieldById(sys, fieldId) : null, sp = f && f.kind === 'item-list' && isObj(f.list) ? f.list : null, nm = isObj(def) && typeof def.name === 'string' && def.name ? def.name : 'That entry';
    if (!sp || typeof sp.unheld !== 'string' || !sp.unheld || !isObj(sp.lvl)) return { ok: false, msg: 'That list does not roll entries nobody holds.' };
    if (!isObj(def) || typeof def.id !== 'string' || !ITEM_ID.test(def.id)) return { ok: false, msg: 'That entry is not there now.' };
    if (Array.isArray(sp.cats) && sp.cats.length && !catIn(sp.cats, def.category)) return { ok: false, msg: nm + ' is not an entry of ' + (f.label || f.key || 'that list') + '.' };
    var rows = isObj(char) && isObj(char.values) && Array.isArray(char.values[f.id]) ? char.values[f.id] : [];
    if (rows.some(function(r) { return isObj(r) && r.hid !== 1 && (r.defId === def.id || (r.lnk === 1 && r.src === def.id)); })) return { ok: false, msg: (isObj(char) && typeof char.name === 'string' && char.name ? char.name : 'This character') + ' holds ' + nm + '. Roll it from its row.' };
    return { ok: true, f: f };
}
// A level on a list's terms: stepped from its minimum, clamped to its range (a bound left out is open, within LIMITS.lvlAbs)
function lvlClamp(spec, n) {
    var st = spec.step > 0 ? spec.step : 1, b = spec.min !== undefined ? spec.min : 0, k = Math.round((n - b) / st), e = st * 1e-9;
    var hi = spec.max !== undefined ? Math.min(spec.max, LIMITS.lvlAbs) : LIMITS.lvlAbs, lo = spec.min !== undefined ? Math.max(spec.min, -LIMITS.lvlAbs) : -LIMITS.lvlAbs;
    if (!isFinite(k)) k = 0;
    if (b + k * st > hi + e) k = Math.floor((hi - b) / st + 1e-9);   // the grid's last value inside the bound (never the bound itself when it is off the grid:
    if (b + k * st < lo - e) k = Math.ceil((lo - b) / st - 1e-9);    // a second clamp would move it again, and the GM's and the players' views would disagree)
    var x = b + k * st; if (x > hi + e || x < lo - e) x = hi;   // no grid point inside (no min, a max off the grid): the max
    return fin(x) ? Number(x.toFixed(Math.max(decOf(st), decOf(b)))) : (spec.min !== undefined ? spec.min : 0);   // on the grid's own decimals, no float noise (0.30000000000000004 reads 0.3): a stored level is its own fixed point
}
function decOf(v) { for (var d = 0; d < 12; d++) { var s = v * Math.pow(10, d); if (Math.abs(s - Math.round(s)) < 1e-9 * Math.max(1, Math.abs(s))) return d; } return 12; }   // the decimals a number needs (0.25: 2)
function cleanItemKey(k, F) {   // F4b: '' when it is not a usable key (with the engine: also one a formula can address, L.<key>.lvl)
    if (typeof k !== 'string' || !ITEM_KEY.test(k)) return '';
    var l = lower(k); if ((ROW_WORDS[l] && !ROW_SOFT[l]) || LIST_WORDS[l] === 1 || RESERVED_SUFFIX[l] || FUNC_NAMES[l] || (k in Object.prototype) || (l in Object.prototype)) return '';   // 1.5.4: never on, max or min (List.max.<name> is the list's highest)
    return F && F.parse && !validKey('L.' + k + '.x', F) ? '' : k;
}
// Stage 6 look fold (L4): band groups — { id, label }, at most LIMITS.bandGroups, ids once. { list, ids } (ids a prototype-free set).
function cleanBandGroups(list) {
    var out = [], ids = map();
    if (Array.isArray(list)) for (var i = 0; i < list.length && out.length < LIMITS.bandGroups; i++) { var g = list[i]; if (!isObj(g) || typeof g.id !== 'string' || !GROUP_ID.test(g.id) || ids[g.id]) continue; ids[g.id] = 1; out.push({ id: g.id, label: cutText(g.label, LIMITS.label) || 'Group' }); }
    return { list: out, ids: ids };
}
// The players' view keeps a group only while a band entry of it survives (a group's label is the GM's text: it never travels with nothing
// visible under it); bands: every band a group may be used on
function pruneGroups(groups, bands) {
    var used = map();
    (bands || []).forEach(function(b) { if (Array.isArray(b)) b.forEach(function(q) { if (isObj(q) && typeof q.g === 'string' && groups.ids[q.g] === 1) used[q.g] = 1; }); });
    return { list: groups.list.filter(function(g) { return used[g.id] === 1; }), ids: used };
}
// Which groups have a Pin button anywhere in a layout (a placement, or a section's header): a group with none is always shown
function pinTargets(sections) {
    var t = map();
    (Array.isArray(sections) ? sections : []).forEach(function(s) { if (!isObj(s)) return; if (typeof s.pin === 'string') t[s.pin] = 1; (Array.isArray(s.fields) ? s.fields : []).forEach(function(pl) { if (isObj(pl) && pl.kind === 'pin' && typeof pl.g === 'string') t[pl.g] = 1; }); });
    return t;
}
// Stage 6 HUD frame (HF1): a Pin in either view pins the group on both bands
function pinTargetsAll(sheet) { return pinTargets((isObj(sheet) && Array.isArray(sheet.sections) ? sheet.sections : []).concat(isObj(sheet) && isObj(sheet.hud) && Array.isArray(sheet.hud.sections) ? sheet.hud.sections : [])); }
// HF1: does the (cleaned) system's HUD hold anything to draw — a band or ledger figure, or a placement in a section?
function hudHasContent(sys) { var h = sys && isObj(sys.sheet) && isObj(sys.sheet.hud) ? sys.sheet.hud : null; return !!(h && ((Array.isArray(h.band) && h.band.length) || (Array.isArray(h.ledger) && h.ledger.length) || (Array.isArray(h.sections) && h.sections.some(function(s) { return isObj(s) && Array.isArray(s.fields) && s.fields.length > 0; })))); }
// HF1: the system as the HUD draws it — the same fields, rolls, effects and sheetStyle (by reference), the HUD's own layout in the sheet's
// place, the shared groups, and the look without the sheet-only traits (the header portrait + name: the HUD's head has its own; sticky
// titles: the reference HUD has none). null when there is no HUD. The input is never mutated.
function hudView(sys) {
    var sh = sys && isObj(sys.sheet) ? sys.sheet : null, h = sh && isObj(sh.hud) ? sh.hud : null; if (!h) return null;
    var v = Object.assign({}, sys), s2 = { tabs: Array.isArray(h.tabs) ? h.tabs : [], sections: Array.isArray(h.sections) ? h.sections : [] };
    if (Array.isArray(h.band)) s2.band = h.band; if (Array.isArray(h.ledger)) s2.ledger = h.ledger; if (Array.isArray(sh.bandGroups)) s2.bandGroups = sh.bandGroups;
    if (isObj(sh.look)) { var lk = Object.assign({}, sh.look); delete lk.portrait; delete lk.sticky; if (Object.keys(lk).length) s2.look = lk; }
    v.sheet = s2; return v;
}
// Stage 6 HUD frame (HF1): one set of cleaners for every layout of the sheet (the sheet, its HUD); each call keeps its OWN once-per-field
// lists and caps, so a field may be on the sheet AND in the HUD, and once within each
function cleanTabs(list) {   // Optional named tabs (Stage 1): ordered, labels only for v1. Absent ⇒ sections stack (as before).
    var out = [], ids = map();
    if (Array.isArray(list)) for (var t = 0; t < list.length && out.length < LIMITS.tabs; t++) {
        var tb = list[t];
        if (!isObj(tb) || typeof tb.id !== 'string' || !TAB_ID.test(tb.id) || ids[tb.id]) continue;
        ids[tb.id] = 1;
        var tabOut = { id: tb.id, label: str(tb.label, LIMITS.label).replace(CTRL_RE_G, ' ').trim() }, tabIcon = cleanIcon(tb.icon);
        if (tabIcon) tabOut.icon = tabIcon;   // Stage 5g: an icon before the label
        out.push(tabOut);
    }
    return { list: out, ids: ids };
}
// Stage 5c: the pinned band — a few placements shown under the name on every tab (and on a stacked sheet). Its own cap and its own
// once-per-item map: a field may be on the band AND in a section. Only what reads in one row (BAND_KINDS + rolls); fieldIds carries each
// field's kind, and in the players' view it lacks GM-only fields, so those pins drop with no extra code. null when absent or empty.
function cleanBand(list, fieldIds, rollIds, groupIds) {
    if (!Array.isArray(list)) return null;
    var band = [], onBand = map();
    for (var b = 0; b < list.length && band.length < LIMITS.band; b++) {
        var q = list[b]; if (!isObj(q)) continue;
        var be = null;
        if (typeof q.id === 'string' && BAND_KINDS[fieldIds[q.id]] === 1 && !onBand[q.id]) { onBand[q.id] = 1; be = { id: q.id }; }
        else if (typeof q.roll === 'string' && rollIds[q.roll] && !onBand[q.roll]) { onBand[q.roll] = 1; be = { roll: q.roll }; }
        if (!be) continue;
        if (typeof q.g === 'string' && groupIds[q.g] === 1) be.g = q.g;   // Stage 6: in a band group (only one that exists)
        band.push(be);
    }
    return band.length ? band : null;   // absent when empty: a system without a band is byte-for-byte what it was
}
// Stage 5d: the header block — identity rows and ledger figures are read-only lists of field ids (no rolls), each with its own cap and
// once-per-id map, kind-gated like the band (so the players' view loses GM-only fields for free); null when empty.
function idList(list, kinds, cap, fieldIds) {
    if (!Array.isArray(list)) return null;
    var outL = [], seenL = map();
    for (var n = 0; n < list.length && outL.length < cap; n++) { var it = list[n]; if (!isObj(it) || typeof it.id !== 'string' || kinds[fieldIds[it.id]] !== 1 || seenL[it.id]) continue; seenL[it.id] = 1; outL.push({ id: it.id }); }
    return outL.length ? outL : null;
}
// [systemcheck:placecats-start]
// 1.5.5: a list placed once a category (the owner, 2026-10-23, by prompt: "A new builder option (Recommended)"). An item list may stand in
// more than one placement of a layout, each placement naming the categories it shows (cats). A category is read as the list's own scope
// reads one (catIn): its first LIMITS.category characters, ignoring case. One placement's categories: each a cleaned text, each once,
// LIMITS.placeCats at most, the first 200 read; null when none is kept
function cleanPlaceCats(v) {
    if (!Array.isArray(v)) return null;
    var out = [], seen = map();
    for (var i = 0; i < v.length && i < 200 && out.length < LIMITS.placeCats; i++) { var t = cutText(v[i], LIMITS.category), l = lower(t); if (!t || seen[l]) continue; seen[l] = 1; out.push(t); }
    return out.length ? out : null;
}
function catKey(c) { return typeof c === 'string' ? lower(cutText(c, LIMITS.category)) : ''; }
// The item lists of one layout that may stand in more than one placement: every placement of the list, in a section the cleaner reads,
// names categories of its own, and no category is named by two of them. Any other list keeps its first placement only, as before this
// fold, and that placement keeps no categories. The first LIMITS.placements placements of item lists are read; cleanSections keeps a later
// one only where it names categories no earlier one names, so what it keeps holds the rule whatever is past that. { fieldId: 1 }
function catSplits(list, fieldIds) {
    var seen = map(), bad = map(), named = map(), secs = 0, n = 0;
    for (var i = 0; i < list.length && secs < LIMITS.sections; i++) {
        var s = list[i]; if (!isObj(s) || typeof s.id !== 'string' || !SECTION_ID.test(s.id)) continue; secs++;
        var pls = Array.isArray(s.fields) ? s.fields : [];
        for (var k = 0; k < pls.length && n < LIMITS.placements; k++) {
            var p = pls[k]; if (!isObj(p) || typeof p.id !== 'string' || fieldIds[p.id] !== 'item-list') continue; n++;
            var cs = cleanPlaceCats(p.cats), nm = named[p.id] || (named[p.id] = map()); seen[p.id] = 1;
            if (!cs) { bad[p.id] = 1; continue; }
            cs.forEach(function(c) { var l = lower(c); if (nm[l]) bad[p.id] = 1; nm[l] = 1; });
        }
    }
    var out = map(); Object.keys(seen).forEach(function(id) { if (!bad[id]) out[id] = 1; });
    return out;
}
// The list's home placement in a layout: the one that shows the rows of a category no placement of the list names, and the whole list's
// totals. Its first placement that shows every row it is given: not set to the rows switched on while the list has a switch, and with no
// show-if of its own, of its section or of the section that section stands under (as the renderer nests one, buildSections childParent).
// With none such, its first placement. So a placement that may hide rows never takes in the rows no placement names while another can
// show them. sections: the layout; id: the list's field id; spec: the list's options (undefined: read as a list with a switch); strict:
// true answers null where no placement shows every row (the Layout tab says so). null where the list is not placed there
function catHome(sections, id, spec, strict) {
    var secs = Array.isArray(sections) ? sections : [], byId = map(), first = null, home = null, sw = spec === undefined || (isObj(spec) && isObj(spec.on));
    var hasIf = function(x) { return isObj(x) && typeof x.showIf === 'string' && !!x.showIf.trim(); };
    secs.forEach(function(s) { if (isObj(s) && typeof s.id === 'string') byId[s.id] = s; });
    secs.forEach(function(s) {
        if (!isObj(s)) return;
        var par = typeof s.parent === 'string' && byId[s.parent] && !byId[s.parent].parent ? byId[s.parent] : null, off = hasIf(s) || hasIf(par);
        (Array.isArray(s.fields) ? s.fields : []).forEach(function(p) {
            if (!isObj(p) || typeof id !== 'string' || p.id !== id) return;
            if (!first) first = p;
            if (!home && !off && !hasIf(p) && !(p.on === true && sw)) home = p;
        });
    });
    return strict === true ? home : (home || first);
}
// Which rows one placement shows, for the sheet, the HUD, a print, a window of its own, the Layout preview and the readable page.
// sections: the cleaned layout the placement stands in; plc: the placement itself; spec: the list's options (catHome). null: every row (a
// placement that names no category, or one that is not in that layout). Else a test of a row's category: true where this placement names
// it, and for a category no placement of the list names, true in the list's home placement alone (catHome). So each row stands in exactly
// one placement of a layout. test.home: this placement is the list's home, which draws the whole list's totals
function catPlace(sections, plc, spec) {
    if (!isObj(plc) || typeof plc.id !== 'string' || !Array.isArray(plc.cats) || !plc.cats.length) return null;
    var named = map(), found = false;
    (Array.isArray(sections) ? sections : []).forEach(function(s) {
        (isObj(s) && Array.isArray(s.fields) ? s.fields : []).forEach(function(p) {
            if (!isObj(p) || p.id !== plc.id) return;
            if (p === plc) found = true;
            (Array.isArray(p.cats) ? p.cats : []).forEach(function(c) { var l = catKey(c); if (l && !named[l]) named[l] = p; });
        });
    });
    if (!found) return null;
    var home = catHome(sections, plc.id, spec);
    var test = function(cat) { var l = catKey(cat), at = l ? named[l] : undefined; return at ? at === plc : home === plc; };
    test.home = home === plc;
    return test;
}
// 1.6.0, backlog 180 R13: what a row is placed by in a list placed once a category: its category, or where the list splits its places by a
// choice stat (placeBy) that stat's value name on the row (a pick its label, a number its value name; '' for none). The one reader: the sheet,
// a print, the HUD, a count in a title and the readable page all ask it
function placeVal(sys, spec, row) {
    var rd = rowDef(sys, row), d = rd ? rd.def : null; if (!d) return '';
    if (!isObj(spec) || typeof spec.placeBy !== 'string' || !spec.placeBy) return typeof d.category === 'string' ? d.category : '';
    return statName(spec, d, spec.placeBy);
}
// 1.6.0: a row's choice stat read as a name: a pick its label, a number its value name; '' for none (placeVal, setOf, Row.setall)
function statName(spec, d, key) {
    if (!isObj(d) || typeof key !== 'string' || !key) return '';
    var st = (isObj(spec) && Array.isArray(spec.stats) ? spec.stats : []).filter(function(s) { return isObj(s) && typeof s.key === 'string' && lower(s.key) === lower(key); })[0]; if (!st) return '';
    var v = rowStat(spec, d, st.key);
    if (st.kind === 'pick') return typeof v === 'string' ? v : '';
    return typeof v === 'number' && v === Math.floor(v) && Array.isArray(st.labels) && typeof st.labels[v] === 'string' ? st.labels[v] : '';
}
// 1.6.0, backlog 180 R15: a list's sets (Sets by a choice stat): rows whose stat names the same set, compared ignoring case, are one set. setOf the
// set a row is in ('' for none); setsOf every set of the rows given, in the order first met: { name, rows, n, on, all } (on: rows switched on as
// their owner holds them, a curse kept on read off; all: every row on). Rows the GM keeps from the owner (hid) are in none, so both machines count alike
function setOf(sys, spec, row) { if (!isObj(spec) || typeof spec.sets !== 'string' || !spec.sets || !isObj(spec.on) || !isObj(row) || row.hid === 1) return ''; var rd = rowDef(sys, row); return rd ? statName(spec, rd.def, spec.sets) : ''; }
function setsOf(sys, spec, rows) {
    var by = map(), out = [];
    (Array.isArray(rows) ? rows : []).forEach(function(r) { var nm = setOf(sys, spec, r); if (!nm) return; var k = lower(nm), g = by[k]; if (!g) { g = by[k] = { name: nm, rows: [], n: 0, on: 0, all: false }; out.push(g); } g.rows.push(r); g.n++; if (r.keptOn !== 1 && rowOn(spec, r)) g.on++; });
    out.forEach(function(g) { g.all = g.n > 0 && g.on === g.n; });
    return out;
}
// A placement's categories in the players' view (cleanSystem), by the test a list's own categories are judged by (ok): a category only
// GM-only things carry never travels. A placement left with none goes, its rows then standing in the list's home placement as for any
// category no placement names; where every placement of a list is left with none, its first stays, with no categories, and shows every row
function placeCatsSeen(lay, ok, wait) {   // wait (191): the library is not read yet, so a category that does not judge as seen may still be one: such a list's places wait, each marked, with no category, until it is
    if (!isObj(lay) || !Array.isArray(lay.sections) || typeof ok !== 'function') return;
    var by = map();
    lay.sections.forEach(function(s) { (isObj(s) && Array.isArray(s.fields) ? s.fields : []).forEach(function(p) { if (isObj(p) && typeof p.id === 'string' && Array.isArray(p.cats)) (by[p.id] = by[p.id] || []).push({ s: s, p: p }); }); });
    Object.keys(by).forEach(function(id) {
        var ps = by[id], left = 0;
        if (wait === true && ps.some(function(x) { return x.p.cats.some(function(c) { return !(typeof c === 'string' && ok(c, id)); }); })) { ps.forEach(function(x) { delete x.p.cats; x.p.wait = true; }); return; }
        ps.forEach(function(x) { x.p.cats = x.p.cats.filter(function(c) { return typeof c === 'string' && ok(c, id); }); if (x.p.cats.length) left++; });   // id (1.6.0 R13): the list, so one placed by a stat keeps its value names
        ps.forEach(function(x, i) { if (x.p.cats.length) return; if (!left && i === 0) delete x.p.cats; else x.s.fields.splice(x.s.fields.indexOf(x.p), 1); });
    });
}
// [systemcheck:placecats-end]
// A layout's sections. ctx: { fieldIds, rollIds, pages (null: format only), tabIds, groupIds, hudTabs } — the tabs and groups of THIS layout;
// hudTabs (HF2b): the HUD's tab ids when a HUD button may point at it (the sheet's own layout, with a HUD that survived), else null (the HUD's
// own layout, or no HUD in this view: the button is dropped)
function cleanSections(list, ctx) {
    var out = [], placed = map(), total = 0, fieldIds = ctx.fieldIds, rollIds = ctx.rollIds, pages = ctx.pages, tabIds = ctx.tabIds, groupIds = ctx.groupIds;
    var catOk = catSplits(list, fieldIds), catNamed = map();   // 1.5.5: the item lists that may stand in several placements, and the categories their kept placements name
    for (var i = 0; i < list.length && out.length < LIMITS.sections; i++) {
        var s = list[i];
        if (!isObj(s) || typeof s.id !== 'string' || !SECTION_ID.test(s.id)) continue;
        var cols = Math.max(1, Math.min(LIMITS.cols, cleanNum(s.cols, 1) | 0));
        var sec = { id: s.id, title: str(s.title, LIMITS.label).replace(CTRL_RE_G, ' ').trim(), cols: cols, fields: [] };
        if (typeof s.tab === 'string' && tabIds[s.tab]) sec.tab = s.tab;   // keep only a tab ref that exists (in this layout)
        if (s.collapsible) sec.collapsible = true;                          // Stage 2: a collapsible <details> section
        if (validPageId(s.chip) && (!pages || pages[s.chip] === 1)) sec.chip = s.chip;   // Stage 5f: a handbook chip in the header (a page the players' view can open)
        if (s.pinned) sec.pinned = true;                                    // Stage 5d: a dashboard section — stays above the tab strip on every tab
        if (s.open === false && sec.collapsible) sec.open = false;          // default open; store only an explicit "closed by default" (1.5.5: Starts closed), only on a collapsible section: a fixed one is always open
        if (typeof s.meta === 'string' && fieldIds[s.meta]) sec.meta = s.meta;   // a field whose value shows in the section header (e.g. a points total)
        if (typeof s.parent === 'string' && SECTION_ID.test(s.parent) && s.parent !== s.id) sec.parent = s.parent;   // nest under another section (the render enforces one level)
        if (sec.parent && s.first === true) sec.first = true;   // 1.5.5: a sub-section set Before its fields stands before its parent's own fields (true only, only beside a parent)
        var secStyle = cleanSecStyle(s.style); if (secStyle) sec.style = secStyle;   // Stage 3: per-section colors (accent/bg/border)
        var secIcon = cleanIcon(s.icon); if (secIcon) sec.icon = secIcon;   // Stage 5g: an icon before the title
        if (typeof s.pin === 'string' && groupIds[s.pin] === 1) sec.pin = s.pin;   // Stage 6 look fold: a band group's Pin in the header
        var sif = cleanFormulaText(s.showIf); if (sif) sec.showIf = sif;   // Stage 6 HUD C8: shown only while this formula is true
        if (s.inline === true) sec.inline = true;   // HUD frame (HF4a, H2): each field on one line (label and value, its Roll on the right)
        if (s.resetAll === true) { sec.resetAll = true; var rtx = cutText(s.resetText, LIMITS.label); if (rtx) sec.resetText = rtx; }   // HUD frame (HF4b, H13): a Reset all button in the header (its own words, e.g. Long rest)
        (Array.isArray(s.fields) ? s.fields : []).forEach(function(p) {
            if (!isObj(p) || total >= LIMITS.placements) return;
            var w = p.w === 'row' ? 'row' : 1, item = null;
            var pcs = typeof p.id === 'string' && catOk[p.id] === 1 ? cleanPlaceCats(p.cats) : null, again = (!!pcs && placed[p.id] === 1 && pcs.every(function(x) { return !(catNamed[p.id] && catNamed[p.id][lower(x)]); })) || (p.wait === true && !pcs && placed[p.id] === 1 && fieldIds[p.id] === 'item-list');   // 1.5.5: a list placed again, for categories no earlier placement of it names
            if (typeof p.id === 'string' && fieldIds[p.id] && (!placed[p.id] || again)) {
                placed[p.id] = 1; item = { id: p.id, w: w }; if (p.on === true && fieldIds[p.id] === 'item-list') item.on = true;   // on (F4b): only the rows switched on (the HUD's readied weapons)
                if (pcs) { item.cats = pcs; var cnm = catNamed[p.id] || (catNamed[p.id] = map()); pcs.forEach(function(x) { cnm[lower(x)] = 1; }); }   // 1.5.5: the categories this placement shows
                if (p.count === true && fieldIds[p.id] === 'item-list') item.count = true;   // 1.6.0, backlog 180 R9: its rows counted in its section's title
                if (fieldIds[p.id] === 'item-list') { var emT = cutText(p.empty, LIMITS.label); if (emT) item.empty = emT; if (p.wait === true) item.wait = true; }   // 191: the words it shows with no row (none: No items.); wait, a players' view made before the library's categories could be judged
            }
            else if (typeof p.roll === 'string' && rollIds[p.roll]) item = { roll: p.roll, w: w };
            else if (typeof p.kind === 'string' && LAYOUT[p.kind]) {
                item = { kind: p.kind, w: w }; if (p.kind === 'heading') item.text = str(p.text, LIMITS.label).replace(CTRL_RE_G, ' ').trim();
                if (p.kind === 'roller') { var rlt = cutText(p.text, LIMITS.label), rlf = cleanFormulaText(p.formula); if (rlt) item.text = rlt; if (rlf) item.formula = rlf; }   // Stage 6 HUD H9: its name on the card and the formula it starts with (both optional)
                if (p.kind === 'text') item.text = str(p.text, LIMITS.ruleText).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ');   // Stage 6 HUD H11: rules text — plain, line breaks and tabs kept (drawn as text)
                if (p.kind === 'link') {   // Stage 5f: a handbook link — its own label (blank = the page's title when drawn) and the page; a link with no page yet is kept for the GM (nothing set is lost on Save), dropped from the players' view
                    item.text = str(p.text, LIMITS.label).replace(CTRL_RE_G, ' ').trim();
                    item.page = validPageId(p.page) ? p.page : '';
                    if (pages && pages[item.page] !== 1) item = null;
                }
                if (p.kind === 'pin') {   // Stage 6 look fold: a band group's Pin button — only for a group that exists (in this view); its own label is optional
                    if (typeof p.g === 'string' && groupIds[p.g] === 1) { item.g = p.g; var ptx = cutText(p.text, LIMITS.label); if (ptx) item.text = ptx; }
                    else item = null;
                }
                if (p.kind === 'hud') {   // HUD frame (HF2b): a button that opens this character's HUD, at one of its tabs (the reference's in-sheet HUD buttons)
                    if (!ctx.hudTabs) item = null;
                    else { var htx = cutText(p.text, LIMITS.label); if (htx) item.text = htx; if (typeof p.tab === 'string' && ctx.hudTabs[p.tab] === 1) item.tab = p.tab; }
                }
            }
            if (item) { var pif = cleanFormulaText(p.showIf); if (pif) item.showIf = pif; sec.fields.push(item); total++; }   // C8: a placement's own show-if
        });
        out.push(sec);
    }
    return out;
}
// Stage 6 HUD frame (HF1): the HUD — a second layout of the same sheet ({ title?, tabs, sections, band?, ledger? }; no identity rows: its
// head carries the portrait and the name). The GM view keeps a HUD with anything set (nothing is lost on Save); the players' view keeps it
// only while something in it is theirs to see (the GM's title never travels alone). { hud } or null.
function cleanHud(h, hb, fieldIds, rollIds, pages, groupIds, gmView) {
    var tabs = cleanTabs(h.tabs), out = {}, title = cutText(h.title, LIMITS.label);
    if (title) out.title = title;
    out.tabs = tabs.list;
    out.sections = Array.isArray(h.sections) ? cleanSections(h.sections, { fieldIds: fieldIds, rollIds: rollIds, pages: pages, tabIds: tabs.ids, groupIds: groupIds }) : [];
    if (hb) out.band = hb;
    var ledger = idList(h.ledger, LEDGER_KINDS, LIMITS.ledger, fieldIds); if (ledger) out.ledger = ledger;
    var shown = !!(hb || ledger || out.sections.some(function(x) { return x.fields.length > 0; }));
    var kept = gmView === false ? shown : !!(shown || title || out.tabs.length || out.sections.length);
    return kept ? { hud: out, tabIds: tabs.ids } : null;   // tabIds (HF2b): what the sheet's HUD buttons may point at
}
function cleanSheet(sheet, fieldIds, rollIds, pages, gmView) {   // pages: null (format only) or a prototype-free set of the page ids players may see (Stage 5f); gmView false: the players' view
    var out = { tabs: [], sections: [] };
    if (!isObj(sheet)) return out;
    var groups = cleanBandGroups(sheet.bandGroups);   // Stage 6 look fold: before the band and the sections that name them
    var tabs = cleanTabs(sheet.tabs); out.tabs = tabs.list;
    var band = cleanBand(sheet.band, fieldIds, rollIds, groups.ids); if (band) out.band = band;
    var hs = isObj(sheet.hud) ? sheet.hud : null, hb = hs ? cleanBand(hs.band, fieldIds, rollIds, groups.ids) : null;   // HUD frame HF1: the HUD's own band
    if (gmView === false) groups = pruneGroups(groups, [out.band, hb]);   // Stage 6: the players' view keeps only groups with a visible entry, on either band (the GM keeps an empty one: nothing set is lost on Save)
    if (groups.list.length) out.bandGroups = groups.list;
    var identity = idList(sheet.identity, IDENTITY_KINDS, LIMITS.identity, fieldIds); if (identity) out.identity = identity;
    var ledger = idList(sheet.ledger, LEDGER_KINDS, LIMITS.ledger, fieldIds); if (ledger) out.ledger = ledger;
    var look = cleanLook(sheet.look); if (look) out.look = look;   // Stage 5g: the sheet's shape (shared by the sheet and its HUD)
    var hc = hs ? cleanHud(hs, hb, fieldIds, rollIds, pages, groups.ids, gmView) : null;   // HF2b: before the sheet's sections, whose HUD buttons need to know the HUD survived (and its tabs)
    if (Array.isArray(sheet.sections)) out.sections = cleanSections(sheet.sections, { fieldIds: fieldIds, rollIds: rollIds, pages: pages, tabIds: tabs.ids, groupIds: groups.ids, hudTabs: hc ? hc.tabIds : null });
    if (hc) out.hud = hc.hud;   // HF1: the last key, absent when dropped
    return out;
}
// The system as stored, or as a player receives it (gmView false: GM-only fields and rolls gone, formulas that named them nulled)
function cleanSystem(sys, opts) {
    opts = opts || {}; var F = opts.F, gmView = opts.gmView !== false;
    if (!isObj(sys) || !F) return null;
    var out = emptySystem();
    out.name = str(sys.name, LIMITS.name).replace(CTRL_RE_G, ' ').trim();
    out.preset = /^[a-z0-9_-]{1,20}$/.test(String(sys.preset || '')) ? String(sys.preset) : '';
    out.updated = fin(Number(sys.updated)) && Number(sys.updated) >= 0 ? Number(sys.updated) : 0;
    var seenId = map(), seenKey = map(), dropped = [], gmFields = [], droppedList = map();   // droppedList (F5a1): the GM-only item lists' keys   // gmFields: the GM-only fields as the GM has them (the players' view only), for gmPools
    (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (out.fields.length >= LIMITS.fields) return;
        var c = cleanField(f, F, gmView);
        if (!c) { if (isObj(f) && typeof f.key === 'string' && f.vis === 'gm' && !gmView) { dropped.push(lower(f.key)); if (f.kind === 'item-list') droppedList[lower(f.key)] = 1; var g = cleanField(f, F, true); if (g) gmFields.push(g); } return; }
        if (seenId[c.id] || seenKey[lower(c.key)]) return;
        seenId[c.id] = 1; seenKey[lower(c.key)] = 1; out.fields.push(c);
    });
    var gmEnt = (Array.isArray(sys.items) ? sys.items : []).concat(Array.isArray(sys.core) ? sys.core : []).some(function(it) { return isObj(it) && it.vis === 'gm'; });   // owed review leftover (b): a GM-only entry a pool's max reads is a secret too
    if (!gmView && (gmFields.length || gmEnt) && out.fields.some(function(f) { return f.kind === 'resource' && !!f.maxFormula; })) {   // a pool whose max is GM-only is GM-only as a whole: gone, as a GM-only field is (the GM-only fields last: one wins a key both use)
        var gmP = gmPools({ fields: out.fields.concat(gmFields), items: sys.items, core: sys.core }, F);
        out.fields = out.fields.filter(function(f) { if (gmP[f.id] !== 1) return true; dropped.push(lower(f.key)); return false; });
    }
    var ldLv = map(); out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.lvl)) ldLv[f.id] = 1; });   // 1.5.8 Loads from: another item list of this view, with a level (the players' view: a GM-only list is not there, so its load goes)
    out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.load) && (f.list.load.from === f.id || ldLv[f.list.load.from] !== 1)) delete f.list.load; });
    var chIl = map(); out.fields.forEach(function(f) { if (f.kind === 'item-list') chIl[f.id] = 1; });   // 1.5.9 Chambers from: an item list of this view, this very list too (the players' view: a GM-only list is not there, so its chamber goes)
    out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.chamber) && chIl[f.list.chamber.from] !== 1) delete f.list.chamber; });
    out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.parts) && chIl[f.list.parts.from] !== 1) delete f.list.parts; });   // 1.6.0 R14: parts from an item list of this view, this very list too
    if (gmView) oneSpelling(out.fields);   // Stage 6 F4c1 (critic 2): one spelling per stat key, the first list's in field order
    var seenR = map();
    (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (out.rolls.length >= LIMITS.rolls) return; var c = cleanRollDef(r, gmView); if (!c || seenR[c.id]) return; seenR[c.id] = 1; out.rolls.push(c); });
    var gmKeys = gmView ? map() : gmEntryKeys(sys, out.fields), hasGmKeys = Object.keys(gmKeys).length > 0;   // F5a1: per visible list, the keys of the GM-only entries in its scope
    var hasPicks = out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.stats) && f.list.stats.some(function(x) { return x.kind === 'pick'; }); });   // F5a2
    if (!gmView && (dropped.length || hasGmKeys || hasPicks)) {   // a visible formula that named a GM-only key is blanked: the player sees "GM only", never the name
        var isDropped = map(); dropped.forEach(function(k) { isDropped[k] = 1; });
        var mentions = function(text) {
            if (!text) return false;
            var hit = function(n) { var l = lower(n); if (l.length > 3 && l.indexOf('on.') === 0) l = l.slice(3); l = lower(linkBare(sys, null, l)); var dot = l.lastIndexOf('.'); if (isDropped[l]) return true; var sg = l.split('.'); if (sg.length > 1 && (droppedList[sg[0]] === 1 || (sg.length > 2 && gmKeys[sg[0]] && gmKeys[sg[0]][sg[1]] === 1))) return true; return dot > 0 && NAME_SUFFIX[l.slice(dot + 1)] && isDropped[l.slice(0, dot)]; };   // F5a1: a GM-only list by its first segment, L.<a GM-only entry's key> (critic 5)
            if (F.parse(text).ok) return F.names(text).some(hit);
            return (String(text).match(/[A-Za-z_][A-Za-z0-9_.]*/g) || []).some(function(t) { return hit(t) || hit(t.split('.')[0]); });   // Stage 6: text that does not parse is checked word by word — a typo never carries a GM-only name to players
        };
        var showMention = mentions;   // Stage 6 HUD C8: the sheet's show-ifs are checked once the sheet is cleaned (below)
        var capMentions = function(t) { return String(t).split('{').slice(1).some(function(p) { return mentions(capExpr(p.split('}')[0]).expr); }); };   // Stage 6: after every "{" (closed or not, drawn or not), the ± stripped   // Fold B: a caption's {formula} is formula text too
        out.fields.forEach(function(f) { var p = DEF_PROP[f.kind]; if (p && f[p] && mentions(f[p])) f[p] = null; if (f.roll && mentions(f.roll)) delete f.roll; if (f.caption && capMentions(f.caption)) delete f.caption; if (f.list && Array.isArray(f.list.cols)) f.list.cols.forEach(function(c) { if (c.formula && mentions(c.formula)) c.formula = null; }); if (f.list && Array.isArray(f.list.stats)) f.list.stats.forEach(function(x) { if (x.kind !== 'pick') return; x.opts = x.opts.filter(function(o) { return !mentions(o.name); }); if (x.def && !x.opts.some(function(o) { return lower(o.label) === lower(x.def); })) delete x.def; }); if (f.list && Array.isArray(f.list.counters)) f.list.counters.forEach(function(t) { if (t.max && mentions(t.max)) t.max = null; }); if (f.list && Array.isArray(f.list.rolls)) { f.list.rolls = f.list.rolls.filter(function(r) { return r.apply ? !r.apply.some(function(c) { return mentions(c.formula); }) : !mentions(r.formula); }); if (!f.list.rolls.length) delete f.list.rolls; } });   // F5b: a list roll naming a GM-only value is dropped   // F5a2: a choice's option naming a GM-only value is dropped (critic 3: never a blanked one)   // F5a1: a list column too (it reads "GM only")
        out.fields.forEach(function(f) { if (f.list && Array.isArray(f.list.rolls)) f.list.rolls.forEach(function(r) { if (r.then && r.then.some(function(c) { return mentions(c.formula); })) delete r.then; if (r.needs && mentions(r.needs)) { delete r.needs; delete r.needsText; } if (r.malf && mentions(r.malf)) delete r.malf; if (r.ad && mentions(r.ad)) delete r.ad; if (r.showIf && mentions(r.showIf)) delete r.showIf; if (r.alt) { r.alt = r.alt.filter(function(a) { return !mentions(a.if); }); if (!r.alt.length) delete r.alt; } }); if (f.list && Array.isArray(f.list.counters)) f.list.counters.forEach(function(t) { if (t.alt) { t.alt = t.alt.filter(function(a) { return !mentions(a.if); }); if (!t.alt.length) delete t.alt; } }); if (f.list && Array.isArray(f.list.badges)) { f.list.badges = f.list.badges.filter(function(b) { return !mentions(b.if); }); if (!f.list.badges.length) delete f.list.badges; } });   // 1.6.0 R4: a badge too   // 1.6.0: another name chosen by a GM-only value would tell it
        out.fields.forEach(function(f) { if (f.list && isObj(f.list.on) && f.list.on.needs && mentions(f.list.on.needs)) { delete f.list.on.needs; delete f.list.on.needsText; } if (f.list && isObj(f.list.on) && f.list.on.showIf && mentions(f.list.on.showIf)) delete f.list.on.showIf; });
        out.fields.forEach(function(f) { if (f.list && typeof f.list.unheld === 'string' && mentions(f.list.unheld)) delete f.list.unheld; });   // 1.6.0 Rolls unheld entries: an Unheld level read from a GM-only value goes, and players then roll no entry unheld there
        out.fields.forEach(function(f) { if (f.list && isObj(f.list.chamber) && f.list.chamber.needs && mentions(f.list.chamber.needs)) { delete f.list.chamber.needs; delete f.list.chamber.needsText; } });   // 1.5.9 Chambers only where, as Loads only where
        out.fields.forEach(function(f) { if (f.list && isObj(f.list.chamber) && f.list.chamber.reach && mentions(f.list.chamber.reach)) delete f.list.chamber.reach; });   // 1.5.9 (es) Flies at most, alike: only the host flies a round
        out.fields.forEach(function(f) { if (f.list && isObj(f.list.load) && f.list.load.needs && mentions(f.list.load.needs)) { delete f.list.load.needs; delete f.list.load.needsText; } });   // 1.5.8 Loads only where, alike   // 1.5.8: a switch's needs naming a GM-only value go, as a list roll's (players' switches are then not held back by them)   // R2b: a list roll's consequences, or its needs, naming a GM-only value go (players' rolls then change nothing / are not held back)
        out.rolls = out.rolls.filter(function(r) { return r.apply ? !r.apply.some(function(c) { return mentions(c.formula); }) : !mentions(r.formula); });   // H7: an apply action naming a GM-only value goes whole
        out.rolls.forEach(function(r) { if (r.then && r.then.some(function(c) { return mentions(c.formula); })) delete r.then; if (r.malf && mentions(r.malf)) delete r.malf; if (r.needs && mentions(r.needs)) { delete r.needs; delete r.needsText; if (r.every) delete r.every.whileNeeds; if (r.inFight) delete r.inFight.whileNeeds; } });   // 1.5.4: its needs naming one go, as a list roll's (players' presses are then not held back by them); 1.5.5: and Only while its needs hold with them   // R3: a Malf naming one too   // R1: a consequence naming a GM-only value takes them all (players' rolls then change nothing)
        var critGo = function(r) { if (r.critAt && mentions(r.critAt)) delete r.critAt; if (r.fumbleAt && mentions(r.fumbleAt)) delete r.fumbleAt; if (r.bigAt && mentions(r.bigAt)) delete r.bigAt; };   // 1.6.0: a roll's own critical range naming a GM-only value goes, as its Malf does (their rolls then read the Combat card's)
        out.rolls.forEach(critGo); out.fields.forEach(function(f) { if (f.list && Array.isArray(f.list.rolls)) f.list.rolls.forEach(critGo); });
        out.rolls.forEach(function(r) { if (r.label.indexOf('{') >= 0 && capMentions(r.label)) r.label = labelHead(r.label); });   // HUD frame (HF5a, H3): a label naming a GM-only value keeps only its plain text before the first {...} (fail closed, as a caption)
    }
    var fieldIds = map(), rollIds = map(), resIds = map();
    var fxSeenT = map(); (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (isObj(d) && typeof d.id === 'string' && EFFECT_ID.test(d.id) && (gmView || d.vis !== 'gm')) fxSeenT[d.id] = 1; });   // 1.6.0: the effects this view holds, for a change that switches one
    out.fields.forEach(function(f) { fieldIds[f.id] = f.kind; if (f.kind === 'resource') resIds[f.id] = 1; });
    out.fields.forEach(function(f) { if (f.kind === 'resource' && isObj(f.spill) && (resIds[f.spill.to] !== 1 || f.spill.to === f.id || (!gmView && typeof mentions === 'function' && f.spill.below && mentions(f.spill.below)))) delete f.spill; });   // 1.6.0 Spills into: a pool of this view; a spill point naming a GM-only value takes the spill from the players' view (the host still spills)
    applyTargets(out, fieldIds, gmView, fxSeenT); out.rolls.forEach(function(r) { rollIds[r.id] = 1; });   // H7: an apply action's targets first   // fieldIds: id -> kind (always truthy; the band gates on the kind)
    var seenIt = map(), stKeys = statKeys(out.fields), stPicks = statPicks(out.fields);   // F4c1: the stats this view's item lists define (the players' view: visible lists only, so a GM-only list's stat never travels)
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {
        if (out.items.length >= LIMITS.items) return;
        var c = cleanItemDef(it, F, gmView, stKeys, stPicks, fieldIds);
        if (!c || seenIt[c.id]) return;
        seenIt[c.id] = 1; out.items.push(c);
    });
    var core = [], coreBytes = 0;   // Stage 6 library L1d: the core — library entries a formula addresses by key (coreOf), cleaned as items are; one per id, none an item's; absent when empty
    (Array.isArray(sys.core) ? sys.core : []).forEach(function(it) {
        if (core.length >= LIMITS.core) return;
        var c = cleanItemDef(it, F, gmView, stKeys, stPicks, fieldIds); if (!c || seenIt[c.id]) return;
        var nb = JSON.stringify(c).length; if (coreBytes + nb > LIMITS.coreBytes) return;
        seenIt[c.id] = 1; coreBytes += nb; core.push(c);
    });
    if (core.length) out.core = core;
    if (!gmView && opts.needShown !== true) {   // 126b: a need that names an entry players cannot see is left out of their view. opts.needShown: the host's judge of a library entry (sheets.js playerSystem); true on a player's own app, which keeps what its host sent; absent (fail closed): only this view's own items are known
        var visIt = map(), nsF = opts.needShown, sysNd = null; out.items.concat(core).forEach(function(it) { visIt[it.id] = 1; });
        var ruleOkS = function(t) { try { var pr = F.parse(t); if (!pr || !pr.ok || !Array.isArray(pr.names)) return false; sysNd = sysNd || { fields: gmViewFields(sys, F), items: sys.items, core: sys.core }; return !gmDerivedNames(sysNd, F, pr.names).length; } catch (e) { return false; } };   // a rule is shown only where a player's own app could work it out: it reads no GM-only value at any depth, judged over the GM's view as a budget is
        out.items.concat(core).forEach(function(it) { hideGrants(it, function(id) { return visIt[id] === 1 || (typeof nsF === 'function' && nsF(id) === true); }); });   // 1.6.0 (v2, B4): a grant of an entry players cannot see is left out of their view
        out.items.concat(core).forEach(function(it) { hideNeeds(it, function(id) { return visIt[id] === 1 || (typeof nsF === 'function' && nsF(id) === true); }, typeof opts.ruleShown === 'function' ? opts.ruleShown : ruleOkS); if (!it.needs && !it.needsIf && !it.needsHid) delete it.needsMsg; });   // opts.ruleShown: the library's judge, which also knows its own GM-only keys
    }
    var placeCatOk = null;   // 1.5.5: the test below, read again for a placement's categories once the sheet is cleaned (placeCatsSeen)
    if (!gmView) {   // Stage 6 F4b: a list's categories in the players' view — a GM-only item's category never travels. opts.libCats (the GM's machine: the library's
        // { show, hide }, library.js catsFor; a client's re-clean of the host's view: {}) keeps one a visible item or entry has, or none has; absent (fail closed): only a visible item's
        var visCat = map(), gmCat = null, lcs = opts.libCats; out.items.concat(core).forEach(function(it) { if (it.category) visCat[lower(it.category)] = 1; });
        if (isObj(lcs)) {
            gmCat = map(); var catL = function(a, m) { (Array.isArray(a) ? a : []).slice(0, 4000).forEach(function(c) { var t = cutText(c, LIMITS.category); if (t) m[lower(t)] = 1; }); };
            catL(lcs.show, visCat); catL(lcs.hide, gmCat);
            (Array.isArray(sys.items) ? sys.items : []).concat(Array.isArray(sys.core) ? sys.core : []).forEach(function(it) { if (isObj(it) && it.vis === 'gm') catL([it.category], gmCat); });
        }
        placeCatOk = function(c) { return visCat[lower(c)] === 1 || (gmCat !== null && gmCat[lower(c)] !== 1); };
        out.fields.forEach(function(f) { if (f.list && Array.isArray(f.list.cats)) f.list.cats = f.list.cats.filter(placeCatOk); if (f.list && isObj(f.list.load) && Array.isArray(f.list.load.cats)) f.list.load.cats = f.list.load.cats.filter(placeCatOk); if (f.list && isObj(f.list.chamber) && Array.isArray(f.list.chamber.cats)) f.list.chamber.cats = f.list.chamber.cats.filter(placeCatOk); });   // 1.5.9: a chamber's alike   // 1.5.8: a load's categories too (one left with none takes none)
    }
    var seenFx = map(), effs = [];   // 5h: the status-effect library, after the fields (its changes are checked against them); absent when empty
    (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (effs.length >= LIMITS.effects) return; var c = cleanEffectDef(d, fieldIds, gmView, F); if (!c || seenFx[c.id]) return; seenFx[c.id] = 1; effs.push(c); });
    if (effs.some(function(d) { return typeof d.auto === 'string'; })) {   // conditions C4 ("Only public ones"): a formula that reads a GM-only value, at any depth, goes — judged over the GM's view, in both views alike
        var sysAu = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core };
        effs.forEach(function(d) { if (typeof d.auto !== 'string') return; var pa = F.parse(d.auto), nm = pa && pa.ok && Array.isArray(pa.names) ? pa.names : null; if (!nm || gmDerivedNames(sysAu, F, nm).length) delete d.auto; });
    }
    if (effs.length) out.effects = effs;
    out.items.concat(core).forEach(function(it) { var ar = it && it.area; if (!ar || !Array.isArray(ar.aff)) return; ar.aff = ar.aff.filter(function(a) { return seenFx[a.fx] === 1; }); if (!ar.aff.length) delete ar.aff; });   // 1.5.9 (es): an affliction whose effect this view does not hold goes (the GM's view alone holds any)
    var gmF = isObj(sys.combat) && (sys.combat.senses !== undefined || sys.combat.targetSize !== undefined) ? gmViewFields(sys, F) : null, gmKinds = map(), secret = null;   // senses S1: judged on the fields as the GM's view has them, in both views (1.6.0: TargetSize's field too)
    if (gmF) { gmF.forEach(function(f) { gmKinds[f.id] = f.kind; }); secret = secretFieldIds({ fields: gmF, items: sys.items, core: sys.core }, F); }
    out.combat = cleanCombat(sys.combat, resIds, gmKinds, secret, F, fieldIds, !gmView, function(id) { var hitF = null; out.fields.forEach(function(x) { if (!hitF && x.id === id) hitF = x; }); return hitF; });
    if (!gmView && typeof mentions === 'function') ['critAt', 'fumbleAt'].forEach(function(k) { if (out.combat[k] && mentions(out.combat[k])) delete out.combat[k]; });   // 1.6.0: the Combat card's critical range naming a GM-only value goes from the players' view (their rolls then read 3 and 18)
    if (out.combat.initiative && Array.isArray(out.combat.initiative.ties)) {   // initiative O2: a step that reads a GM-only value goes (the order is public: a player would learn which is higher), judged over the GM's view, in both views alike
        var sysTi = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core };
        out.combat.initiative.ties = out.combat.initiative.ties.filter(function(t) { var pt = F.parse(t); return !!(pt && pt.ok && Array.isArray(pt.names)) && !gmDerivedNames(sysTi, F, pt.names).length; });
        if (!out.combat.initiative.ties.length) { delete out.combat.initiative.ties; if (!Object.keys(out.combat.initiative).length) delete out.combat.initiative; }
    }
    costTargets(out, gmView);   // turn-based combat T1: what each roll costs, against the actions just cleaned
    everyTargets(out, gmView);   // item 20 K5: what each clock rule counts in, against the time units just cleaned
    if (!gmView && typeof showMention === 'function' && out.combat.turn && Array.isArray(out.combat.turn.acts)) out.combat.turn.acts.forEach(function(a) { if (a && a.nf && showMention(a.nf)) delete a.nf; });   // 192: a count naming a GM-only value goes, as a move's does
    if (!gmView && typeof showMention === 'function' && out.combat.turn && out.combat.turn.move && showMention(out.combat.turn.move)) { delete out.combat.turn.move; delete out.combat.turn.unit; if (!Object.keys(out.combat.turn).length) delete out.combat.turn; }   // T1: a move naming a GM-only value goes (their moves are then not limited by it)
    var lr = cleanListRules(sys.listRules); if (lr) out.listRules = lr;   // Stage 6 F4c2: Setting A, in both views (absent: GM only)
    var srS = cleanSheetRev(sys.sheetRev); if (srS) out.sheetRev = srS;   // 1.6.0 (backlog 190): the sheet revision, in both views (absent: none)
    var bud = cleanBudgets(sys.budgets, F);   // 126: the point budgets, the same in both views (absent: none)
    if (bud) {   // one that reads a GM-only value, at any depth, goes: a player's own app must work out the very figures the host judges by. Judged over the GM's view, in both views alike
        var sysBu = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core };
        bud = bud.filter(function(b) { return [b.has, b.spent].every(function(t) { var pb = F.parse(t); return !!(pb && pb.ok && Array.isArray(pb.names)) && !gmDerivedNames(sysBu, F, pb.names).length; }); });
        if (bud.length) out.budgets = bud;
    }
    var envR = cleanEnv(sys.env, fieldIds, F);   // 1.6.0: the environment readings, against this view's fields (a reading whose field players do not hold is not theirs)
    if (envR && !gmView && typeof showMention === 'function') envR.forEach(function(e) { ENV_BANDS.forEach(function(k) { if (e[k] && showMention(e[k])) delete e[k]; }); });   // a band that reads a GM-only value goes from the players' view: where it showed would tell the value
    if (envR) out.env = envR;
    var pages = null;   // Stage 5f: the host passes the ids of the pages players may read, so a chip or link to any other page never travels
    if (opts.pages !== undefined) { pages = map(); (Array.isArray(opts.pages) ? opts.pages : []).forEach(function(id) { if (validPageId(id)) pages[id] = 1; }); }
    out.sheet = cleanSheet(sys.sheet, fieldIds, rollIds, pages, gmView);
    if (!gmView && typeof placeCatOk === 'function' && isObj(out.sheet)) [out.sheet, out.sheet.hud].forEach(function(lay) { placeCatsSeen(lay, function(c, id) { var fpb = null; out.fields.forEach(function(x) { if (!fpb && x && x.id === id) fpb = x; }); return fpb && isObj(fpb.list) && typeof fpb.list.placeBy === 'string' && fpb.list.placeBy ? true : placeCatOk(c); }, opts.libWait === true); });   // 1.5.5: a placement's categories, judged as a list's own (a GM-only item's category never travels)
    if (!gmView && typeof showMention === 'function') [out.sheet, out.sheet && out.sheet.hud].forEach(function(lay) {   // Stage 6 HUD C8: a show-if naming a GM-only value goes (the part simply shows): whether it showed would tell the value
        (lay && Array.isArray(lay.sections) ? lay.sections : []).forEach(function(s) { if (s.showIf && showMention(s.showIf)) delete s.showIf; (s.fields || []).forEach(function(p) { if (p.showIf && showMention(p.showIf)) delete p.showIf; if (p.kind === 'roller' && p.formula && showMention(p.formula)) delete p.formula; }); });   // H9: a roller's starting formula naming a GM-only value goes too (the box starts empty)
    });
    var ss = cleanSheetStyle(sys.sheetStyle); if (ss) out.sheetStyle = ss;   // the sheet's own look (doc theming), players' view included
    var lnk = cleanLinks(sys.links, F); if (lnk) out.links = lnk;   // 1.6.0: the linked sheets, the same in both views (absent: none)
    var cal = cleanCalendar(sys.calendar); if (cal) out.calendar = cal;   // item 20 K1: the calendar, the same in both views (absent: a plain count of days)
    if (gmView) Object.defineProperty(out, 'gmSide', { value: true });   // 1.6.0 linked sheets: a system cleaned for the GM, never written or sent (not enumerable), so the link source reads the GM's own character with it
    return out;
}
// Stage 6 library L0: what a system file had that cleaning left out — past a limit, or not valid — per kind, for the import's notice
// (only kinds that lost something; a file's own count, never more than the file had)
function droppedCounts(raw, clean) {
    var out = {}; if (!isObj(raw) || !isObj(clean)) return out;
    ['fields', 'rolls', 'items', 'effects'].forEach(function(k) { var n = Array.isArray(raw[k]) ? raw[k].length : 0, m = Array.isArray(clean[k]) ? clean[k].length : 0; if (n > m) out[k] = n - m; });
    // 1.6.0 (the owner, 2026-10-28: "count dropped sections and placements, sheet and HUD"): a layout's sections, and the placements of the sections it kept (a section left out takes its own with it, so they are not counted twice)
    var lay = function(r, c, pre) {
        var rs = isObj(r) && Array.isArray(r.sections) ? r.sections : [], cs = isObj(c) && Array.isArray(c.sections) ? c.sections : [], kept = map(), lost = 0;
        cs.forEach(function(s) { if (isObj(s) && typeof s.id === 'string') kept[s.id] = Array.isArray(s.fields) ? s.fields.length : 0; });
        rs.forEach(function(s) { if (isObj(s) && typeof s.id === 'string' && kept[s.id] !== undefined) lost += Math.max(0, (Array.isArray(s.fields) ? s.fields.length : 0) - kept[s.id]); });
        if (rs.length > cs.length) out[pre + 'sections'] = rs.length - cs.length;
        if (lost > 0) out[pre + 'placements'] = lost;
    };
    var rsh = isObj(raw.sheet) ? raw.sheet : null, csh = isObj(clean.sheet) ? clean.sheet : null;
    lay(rsh, csh, ''); lay(rsh && rsh.hud, csh && csh.hud, 'HUD ');
    return out;
}
// 1.6.0: what a cleaned system holds at its limit, so that one more would be left out: fields, rolls, and for the sheet and its HUD sections and
// placements, each { what, n, max } in that order (the System editor's note says them)
function capsAt(sys) {
    var out = []; if (!isObj(sys)) return out;
    var at = function(what, n, max) { if (n >= max) out.push({ what: what, n: n, max: max }); };
    at('fields', Array.isArray(sys.fields) ? sys.fields.length : 0, LIMITS.fields); at('rolls', Array.isArray(sys.rolls) ? sys.rolls.length : 0, LIMITS.rolls);
    var lay = function(l, pre) { var ss = isObj(l) && Array.isArray(l.sections) ? l.sections : [], p = 0; ss.forEach(function(s) { p += isObj(s) && Array.isArray(s.fields) ? s.fields.length : 0; }); at(pre + 'sections', ss.length, LIMITS.sections); at(pre + 'placements', p, LIMITS.placements); };
    var sh = isObj(sys.sheet) ? sys.sheet : null; lay(sh, ''); lay(sh && sh.hud, 'HUD ');
    return out;
}
// The words for what was left out (droppedCounts' answer): "1 section, 3 HUD placements"; '' for none
function droppedWords(dr) { return Object.keys(isObj(dr) ? dr : {}).filter(function(k) { return typeof dr[k] === 'number' && dr[k] > 0; }).map(function(k) { return dr[k] + ' ' + (dr[k] === 1 ? k.slice(0, -1) : k); }).join(', '); }
// The sheet's own look (doc theming, 1.5.0): the fields a page's look has, kept as plain bounded values here —
// docrender's cleanDocStyle validates them strictly at render, on every machine. Absent = the campaign default.
function cleanSheetStyle(v) {
    if (!isObj(v)) return undefined;
    var out = {};
    ['font', 'textColor', 'bgColor', 'bgImage'].forEach(function(k) { if (typeof v[k] === 'string' && v[k].length && v[k].length <= 400 && !CTRL_RE.test(v[k])) out[k] = v[k]; });
    if (fin(v.bgDim)) out.bgDim = Math.max(0, Math.min(90, Math.round(v.bgDim)));
    return Object.keys(out).length ? out : undefined;
}
function fieldById(sys, id) { for (var i = 0; i < sys.fields.length; i++) if (sys.fields[i].id === id) return sys.fields[i]; return null; }
function keyIndex(sys) { var ix = map(); sys.fields.forEach(function(f) { ix[lower(f.key)] = f; }); return ix; }
// 1.5.5: keyIndex for a resolver, kept for a fields array while each of its fields is the very object it was made from with the very key, so a
// draft edited in place (a field added, removed, replaced or given another key) is indexed again. Read only: every resolver of that array shares it
var _ixKept = typeof WeakMap === 'function' ? new WeakMap() : null;
function keyIndexOf(sys) {
    var fs = sys.fields, m = _ixKept ? _ixKept.get(fs) : null, i = 0;
    if (m && m.n === fs.length) { for (; i < fs.length; i++) if (fs[i] !== m.fs[i] || fs[i].key !== m.ks[i]) break; if (i === fs.length) return m.ix; }
    var ix = keyIndex(sys); if (_ixKept) _ixKept.set(fs, { n: fs.length, fs: fs.slice(), ks: fs.map(function(f) { return f.key; }), ix: ix });
    return ix;
}
// Stage 6 F5a1: the keys of the GM-only library entries, per visible item list whose scope has them (lower-case list key -> lower-case entry
// key -> 1) — a visible formula naming L.<such a key> reads a secret (critic 5: per list and key, never all keys everywhere). The system's items
// and its core (the library's addressed entries, a GM-only pack's marked GM-only: findRow reads both; owed review F5a1#1). Local
function gmEntryKeys(sys, fields) {
    var out = map();
    (Array.isArray(fields) ? fields : []).forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list' || f.vis === 'gm') return;
        var cats = isObj(f.list) && Array.isArray(f.list.cats) && f.list.cats.length ? f.list.cats : null;
        (Array.isArray(sys && sys.items) ? sys.items : []).concat(Array.isArray(sys && sys.core) ? sys.core : []).forEach(function(it) { if (isObj(it) && it.vis === 'gm' && typeof it.key === 'string' && it.key && (!cats || catIn(cats, it.category))) { var lk = lower(f.key); (out[lk] = out[lk] || map())[lower(it.key)] = 1; } });
    });
    return out;
}
// One stored value coerced to its field's kind, or undefined (drop). opts.max: an evaluated resource max (or null = unbounded)
function cleanValue(field, v, opts) {
    var k = field.kind;
    if (k === 'number' || k === 'skill') { var n = Number(v); if (!fin(n)) return undefined; n = clampNum(stepRound(n, field), field.min, field.max); return fin(n) ? n : undefined; }   // clamped, then checked: a tiny step can round past the bound
    if (k === 'toggle') return v === true ? true : v === false ? false : undefined;
    if (k === 'text') { if (typeof v !== 'string') return undefined; return v.slice(0, field.max || LIMITS.text).replace(CTRL_RE_G, ''); }
    if (k === 'notes') { if (typeof v !== 'string') return undefined; return v.slice(0, LIMITS.notes).replace(CTRL_KEEP_NL, ''); }
    if (k === 'select') return typeof v === 'string' && field.options.indexOf(v) >= 0 ? v : undefined;
    if (k === 'resource') {
        var cur = isObj(v) ? Number(v.cur) : Number(v); if (!fin(cur)) return undefined;
        cur = clampNum(Math.round(cur), field.min, opts && fin(opts.max) ? opts.max : undefined);
        return { cur: cur };
    }
    if (k === 'effects') {   // 5h: [{id, ref, on}] library rows or [{id, name, icon, tone, dur, notes, on, mods}] ad hoc rows; opts.effects / opts.fields from valueOpts
        if (!Array.isArray(v)) return undefined;
        var fxIds = (opts && opts.effects) || map(), fk = (opts && opts.fields) || map(), rows = [], seenRow = map(), seenRef = map();
        for (var ri = 0; ri < v.length && rows.length < LIMITS.effectRows; ri++) {
            var row = v[ri];
            if (!isObj(row) || typeof row.id !== 'string' || !FXROW_ID.test(row.id) || seenRow[row.id]) continue;
            var on = row.on !== false;
            if (row.ref !== undefined) {
                if (typeof row.ref !== 'string' || !EFFECT_ID.test(row.ref) || fxIds[row.ref] !== 1 || seenRef[row.ref]) continue;   // once per character (a second add turns it back on)
                seenRow[row.id] = 1; seenRef[row.ref] = 1; var rr0 = { id: row.id, ref: row.ref, on: on }, rt0 = cleanFxTimer(row.t); if (rt0) rr0.t = rt0; rows.push(rr0); continue;   // T5a: its timer
            }
            var core = cleanEffectCore(row, fk); seenRow[row.id] = 1;
            var ra0 = { id: row.id, name: core.name, icon: core.icon, tone: core.tone, dur: core.dur, notes: core.notes, on: on, mods: core.mods }, rt1 = cleanFxTimer(row.t); if (rt1) ra0.t = rt1; rows.push(ra0);   // T5a: its timer
        }
        return rows;
    }
    if (k === 'item-list') {   // Stage 6 F4a: rows (cleanRow) — at most LIMITS.carried; one id-less row per item (the rule before Stage 6); a row id once; nothing minted. opts.items is a proto-safe id set
        if (!Array.isArray(v)) return undefined;
        var items = (opts && opts.items) || map(), seenD = map(), seenR = map(), list = [], nVis = 0, nHid = 0;
        for (var i = 0; i < v.length && i < LIMITS.carried * 4 && (nVis < LIMITS.carried || nHid < LIMITS.carried); i++) {   // Stage 6: visible rows and kept curses counted apart (a kept row never pushes out, or blocks, a visible one)
            var rw = cleanRow(v[i], items, field.list, isObj(field.list) && isObj(field.list.load) && opts && opts.specs ? opts.specs[field.list.load.from] : undefined, isObj(field.list) && isObj(field.list.chamber) && opts && opts.specs ? opts.specs[field.list.chamber.from] : undefined); if (!rw) continue;   // 1.5.9: and the chamber's list, for its rounds   // 1.5.8: the source list's options, for a loaded copy
            var rk = rowIdOf(rw); if (!rk || seenR[rk] || (!rw.id && rw.defId && seenD[rw.defId])) continue;
            if (rw.hid === 1 ? nHid >= LIMITS.carried : nVis >= LIMITS.carried) continue;
            seenR[rk] = 1; if (rw.defId && rw.hid !== 1) seenD[rw.defId] = 1; if (rw.hid === 1) nHid++; else nVis++; list.push(rw);
        }
        return list;
    }
    return undefined;
}
function stepRound(n, field) { var step = field.step > 0 ? field.step : 1, base = field.min !== undefined ? field.min : 0; return base + Math.round((n - base) / step) * step; }
// Onboarding F1c: a character's own face — the rule of net.js cleanFace, word for word (netcheck compares the two): 'photo', 'default',
// 'pic:<name>' from this list, or ONE emoji; anything else is ''
var FACE_PICS = ['bren', 'chef', 'golems', 'innkeeper', 'king', 'liriel', 'minotaur_archer', 'minotaur_soldier', 'orc', 'priestess', 'sage', 'slime', 'smith', 'spriggan', 'tharic'];
function cleanFace(v) {
    if (typeof v !== 'string' || !v || v.length > 64) return '';
    if (v === 'photo' || v === 'default') return v;
    if (v.slice(0, 4) === 'pic:') return FACE_PICS.indexOf(v.slice(4)) >= 0 ? v : '';
    var cps = Array.from(v), i = 0; if (cps.length > 16) return '';
    var ep = function(c) { return /^\p{Extended_Pictographic}$/u.test(c); }, mod = function(c) { return c === '\uFE0F' || /^[\u{1F3FB}-\u{1F3FF}]$/u.test(c); };
    var unit = function() { if (i >= cps.length || !ep(cps[i])) return false; i++; while (i < cps.length && mod(cps[i])) i++; return true; };
    if (!unit()) return '';
    while (i < cps.length) { if (cps[i] !== '\u200D') return ''; i++; if (!unit()) return ''; }
    return v;
}
// The token creator's kept original (owner, 2026-09-27: the GM may keep it, a player never): the whole picture a framed one was cut from (a
// saved picture or a bundled square), the square chosen in it (picture pixels) and the framed file it made (of: it applies only while that
// file is still worn). GM-only: never in a player's view of a character (charView lists what it sends), stripped from a token on the wire
function cleanFrame(v) {
    if (!isObj(v)) return null;
    var saved = function(p) { return typeof p === 'string' && PATH_RE.test(p) && p.indexOf('..') < 0 && !CTRL_RE.test(p); };
    var num = function(x) { return typeof x === 'number' && fin(x) && x >= 0 && x <= 1e6; };
    if (!(saved(v.src) || (typeof v.src === 'string' && /^assets[/]tutorial[/][a-z_]{1,40}_sq[.]jpg$/.test(v.src))) || !saved(v.of) || !num(v.x) || !num(v.y) || !num(v.s) || !(v.s > 0)) return null;
    return { src: v.src, x: v.x, y: v.y, s: v.s, of: v.of };
}
// item 35: what the look of a field's text may hold (lookcore.js): a one-line text takes no size, notes do, neither takes a font; the text
// is at most as long as the field keeps it. null for a field whose value is no text
function lookRule(field) {
    if (!isObj(field) || (field.kind !== 'text' && field.kind !== 'notes')) return null;
    var base = field.kind === 'text' ? LOOK_RULES.LINE : LOOK_RULES.NOTES;
    return { size: base.size, link: base.link, font: false, multi: base.multi, max: field.kind === 'text' ? (field.max || LIMITS.text) : LIMITS.notes };
}
// Item 35: the look of a character's text AS IT STANDS: the cleaned record for the text stored in that field, or undefined (no look, or
// one made for other words). What a sheet draws, and what its text box starts from
function lookOf(field, char) {
    var rule = lookRule(field); if (!rule || !isObj(char) || !isObj(char.values) || !isObj(char.looks) || !hasOwn(char.looks, field.id)) return undefined;
    var v = char.values[field.id]; return typeof v === 'string' ? cleanRec(char.looks[field.id], v, rule) : undefined;
}
// A look record for a text of this field, from a format a text box made: by the field's own rule, or undefined where nothing of it is kept
function lookFor(field, text, fmt) { var rule = lookRule(field); return rule ? makeRec(fmt, '', text, rule) : undefined; }
// The looks of a character's text values, as { fieldId: record }, or null for none: only for a text or notes field of this system, only
// where the value kept beside it is a string, and only a record that is that very text's (the one stale rule: cleanRec). In the
// order of the system's fields, so that two machines keep the same object
function cleanLooks(looks, values, sys) {
    if (!isObj(looks) || !isObj(values) || !sys || !Array.isArray(sys.fields)) return null;
    var out = {}, any = false;
    sys.fields.forEach(function(f) {
        var rule = lookRule(f); if (!rule || !hasOwn(looks, f.id) || typeof values[f.id] !== 'string') return;
        var r = cleanRec(looks[f.id], values[f.id], rule); if (r) { out[f.id] = r; any = true; }
    });
    return any ? out : null;
}
function cleanChar(c, sys, opts) {
    if (!isObj(c) || typeof c.id !== 'string' || !CHAR_ID.test(c.id) || !sys) return null;
    var out = { id: c.id, name: str(c.name, LIMITS.charName).replace(CTRL_RE_G, ' ').trim() || 'Character', ownerId: str(c.ownerId, 60).replace(CTRL_RE_G, ''), portrait: '', npc: c.npc === true, values: {}, updated: fin(Number(c.updated)) ? Number(c.updated) : 0 };
    if (out.npc || !PID_RE.test(out.ownerId) || out.ownerId in Object.prototype) out.ownerId = '';   // a profile id or nobody (never a prototype key)
    if (typeof c.portrait === 'string' && PATH_RE.test(c.portrait) && c.portrait.indexOf('..') < 0 && !CTRL_RE.test(c.portrait)) out.portrait = c.portrait;
    var faceC = cleanFace(c.face); if (faceC && faceC !== 'photo' && !out.portrait) out.face = faceC;   // Onboarding F1c: its own face while it has no portrait (never 'photo': a photo is saved as its portrait)
    if (opts && opts.state === 'host') { var frC = cleanFrame(c.frame); if (frC) out.frame = frC; }   // the token creator: the GM's kept original (the GM loading or importing keeps it; nobody else)
    var vals = isObj(c.values) ? c.values : {}, vo = valueOpts(sys);
    Object.keys(vals).forEach(function(fid) { var f = fieldById(sys, fid); if (!f || !STORED[f.kind]) return; var v = cleanValue(f, vals[fid], vo); if (v !== undefined) out.values[fid] = v; });
    var lkC = cleanLooks(c.looks, out.values, sys); if (lkC) out.looks = lkC;   // item 35: the look of a text value, beside it (never an empty key)
    var lkL = c.partial !== true ? cleanCharLinks(c.links, sys, out.id) : null; if (lkL) out.links = lkL;   // 1.6.0: the sheets it links (absent: none)
    if (opts && opts.state === 'owner' && c.partial !== true) { var lkG = cleanLk(c.lk, sys); if (lkG) out.lk = lkG; }   // ... and on its owner's copy the figures its host worked out for them
    var srC = cleanSheetRev(c.sheetRev); if (srC) out.sheetRev = srC;   // 1.6.0 (backlog 190): the revision it was last made current at
    // 5h: a teammate's copy (partial) carries the host's worked-out hover lines — text only, at most 12 of 120 characters
    if (c.partial !== true && Array.isArray(c.unseen)) { var unC = cleanItemMods(c.unseen, fieldKinds(sys)); if (unC) out.unseen = unC.map(function(m) { var o = { f: m.f, op: m.op }; if (m.op === 'add' || MOD_LIM[m.op]) o.v = m.v; if (m.part) o.part = m.part; return o; }); }   // F6: the owner's copy — a kept curse's changes, nameless
    if (c.partial === true && Array.isArray(c.lines)) { var ln = []; c.lines.forEach(function(s) { if (typeof s === 'string' && ln.length < 12) ln.push(s.slice(0, 120).replace(CTRL_RE_G, ' ')); }); out.lines = ln; }
    // Onboarding F3: a player's character's state — in the making (theirs alone, not in play), unlocked (in play, theirs to fill in), the
    // GM's review of one a player made, and made by a player (it never takes a token by name) — kept only when the caller keeps state: the GM
    // loading or importing (all four: never dropped, or a reload would put an unfinished character in play), a player's own copy (making or
    // unlocked: the host sends them to the owner alone)
    if (opts && opts.state && out.ownerId && c.partial !== true) {
        if (c.making === 1 || c.making === true) out.making = 1; else if (c.unlocked === 1 || c.unlocked === true) out.unlocked = 1;
        if (out.making === 1 && (c.invited === 1 || c.invited === true)) out.invited = 1;   // invited (F3b): the GM asked for it — on Done it goes into play (its owner knows)
        if (opts.state === 'host') { if (c.review === 1 || c.review === true) out.review = 1; if (c.made === 1 || c.made === true) out.made = 1; }
    }
    return out;
}
// What a value is checked against, the same on every machine (5h): the system's item ids (a prototype-free set). A client re-cleaning a
// delta with no options used to check an item list against nothing and drop every entry.
function valueOpts(sys) {
    var items = map(), effects = map(), fields = map(), specs = map();
    (sys && Array.isArray(sys.items) ? sys.items : []).forEach(function(it) { if (it && typeof it.id === 'string') items[it.id] = 1; });
    (sys && Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (d && typeof d.id === 'string') effects[d.id] = 1; });   // 5h: a library row must name one of these
    (sys && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && typeof f.id === 'string') fields[f.id] = f.kind; });   // 5h: an ad hoc row's changes are checked against these
    (sys && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && f.kind === 'item-list' && typeof f.id === 'string' && isObj(f.list)) specs[f.id] = f.list; });   // 1.5.8 Loads from: the source list's options, for a loaded copy
    return { items: items, effects: effects, fields: fields, specs: specs };
}
// 1.6.0 linked sheets: a player's link set on their own character, as a request: { rid, charId, linkId, to } or null (to: '' takes the link off)
function cleanCharLink(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId) || typeof msg.linkId !== 'string' || !LINK_ID.test(msg.linkId)) return null;
    var to = msg.to === undefined || msg.to === null ? '' : msg.to; if (typeof to !== 'string' || (to !== '' && !CHAR_ID.test(to))) return null;
    return { rid: msg.rid, charId: msg.charId, linkId: msg.linkId, to: to };
}
function cleanCharEdit(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId) || typeof msg.fieldId !== 'string' || !FIELD_ID.test(msg.fieldId)) return null;
    var v = msg.value;
    if (typeof v === 'string') { if (v.length > LIMITS.valueChars) return null; }
    else if (typeof v === 'number') { if (!fin(v)) return null; }
    else if (typeof v === 'boolean') { /* fine */ }
    else if (isObj(v)) { if (!fin(Number(v.cur))) return null; v = { cur: Number(v.cur) }; }
    else return null;
    return { rid: msg.rid, charId: msg.charId, fieldId: msg.fieldId, value: v };
}
// Item 35: a player's look for one text of their character, as a request: { rid, charId, fieldId, look } or null. Only the ids' shape is
// judged here, in constant time. The record itself is judged by applyStyle, after the host's limiter (its shape test walks it): null takes
// the look off
function cleanCharStyle(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId) || typeof msg.fieldId !== 'string' || !FIELD_ID.test(msg.fieldId)) return null;
    if (msg.look !== null && !isObj(msg.look)) return null;
    return { rid: msg.rid, charId: msg.charId, fieldId: msg.fieldId, look: msg.look };
}
// HUD frame (HF4b): several values of one character in ONE message (a section's Reset all) — 1 to LIMITS.editBatch values, each field once,
// each value by cleanCharEdit's own shape rules. { rid, charId, values: [{ fieldId, value }] } or null
function cleanCharEdits(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId)) return null;
    if (!Array.isArray(msg.values) || !msg.values.length || msg.values.length > LIMITS.editBatch) return null;
    var out = [], seen = map();
    for (var i = 0; i < msg.values.length; i++) {
        var e = msg.values[i]; if (!isObj(e)) return null;
        var one = cleanCharEdit({ rid: msg.rid, charId: msg.charId, fieldId: e.fieldId, value: e.value }); if (!one || seen[one.fieldId]) return null;
        seen[one.fieldId] = 1; out.push({ fieldId: one.fieldId, value: one.value });
    }
    return { rid: msg.rid, charId: msg.charId, values: out };
}
// Stage 6 HUD H7: an apply action worked out for a character. Every amount first, through vars (the presser's resolver: a player's own view,
// the GM's full one), as his Apply Costs works the costs out before it moves a pool; then each target in order on one working copy of char:
// a pool's current value (full = its max) or a number's stored value (an effect's change stays the effect's), minus the amount (plus, for an
// add), clamped by the field (applyEdit: a pool's min is its floor). An amount is a number, no dice, a pool's rounded; below 0 it counts as 0
// (a subtract never raises, an add never lowers). All or nothing. { ok: true, values: { fieldId: value }, lines: [{ f, n, d, v }], names:
// [{ name, value }] } — lines: the label, the amount (signed), the new value — or { ok: false, reason: field|value|none|error, message? }.
// same (1.5.5, true only): vars is char's own resolver in tctx, in a system chainsShallow passes, so it reads a pool's current value and its
// most in place of a new resolver while no change is made yet (any resolver of one state answers alike there)
// D (1.5.9, book es/et plan, section 0): the host's dice core. A change ticked Rolled (roll: true) may then roll dice in its amount, drawn from
// D.random where it has one and else from the formula engine's own source, as the host's rolls are; its line carries what it drew (roll: "1d6: 4"),
// and the answer says drew: true. With no D an amount with dice is refused in the same words as ever, so nothing but the host rolls one
// on (1.5.9, book es/et plan, section 3): { char, tctx }, the character a roll or an action that Applies to an adjacent character is used on, and
// its own token's context. Every amount is still worked out through vars, the user's names; each change that names a field then lands on a
// working copy of that character, read and held to its field there, and a row's counters and Fire stay on the user's. All or none for both.
// The answer adds onValues and onLines, what moved on it (a Set's line marked set); values and lines are the user's own. Without on, as before
function rollWords(res) { var b = res && res.ok && res.breakdown && Array.isArray(res.breakdown.dice) ? res.breakdown.dice : []; return b.filter(function(d) { return isObj(d) && typeof d.count === 'number' && d.count > 0 && typeof d.total === 'number' && fin(d.total); }).map(function(d) { return String(d.text || 'dice').replace(CTRL_RE_G, ' ') + ': ' + String(Math.round(d.total * 1000) / 1000); }).join(', ').slice(0, 60); }
function applyAct(sys, char, act, vars, F, tctx, rowCtx, same, D, on, fxo) {   // rowCtx (R2b): { f: the list, r: the row } — a change may move one of that row's counters; fxo (1.6.0): { now, inCombat, onInCombat }, the clock an effect's timer starts by
    if (!sys || !Array.isArray(sys.fields) || !char || !isObj(act) || !Array.isArray(act.apply) || !act.apply.length || typeof vars !== 'function' || !F) return { ok: false, reason: 'field' };
    if (rowCtx && typeof act.showIf === 'string' && act.showIf && !rollNeedsOk({ needs: act.showIf }, vars, F)) return { ok: false, reason: 'error', message: 'That is not offered on this row.' };   // 1.6.0: Shown where, read with the row's names
    if (!rollNeedsOk(act, vars, F)) return { ok: false, reason: 'error', message: rollNeedsSays(act) };   // 1.5.4: what it needs, read with the same names its amounts read (a list's action has none)
    var amts = [], names = [], seenN = map();
    for (var i = 0; i < act.apply.length; i++) {
        var c = act.apply[i], f = isObj(c) && typeof c.f === 'string' ? fieldById(sys, c.f) : null, ctr = null, lfC = null;
        if (isObj(c) && c.fire === true) { amts.push({ fire: true, lf: rowCtx && typeof rowCtx.f === 'string' ? fieldById(sys, rowCtx.f) : null }); continue; }
        if (isObj(c) && typeof c.fx === 'string') { var fxD = null; (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (!fxD && isObj(d) && d.id === c.fx) fxD = d; }); if (!fxD) return { ok: false, reason: 'field' }; amts.push({ fx: fxD, on: c.on !== false }); continue; }   // 1.6.0: an effect switched on or off
        var rq = isObj(c) && c.q === true ? 'q' : isObj(c) && typeof c.s === 'string' ? 's' : '', lfQ = null, stQ = null;   // 1.6.0: the row's quantity or one of its own number stats
        if (rq) { lfQ = rowCtx && typeof rowCtx.f === 'string' ? fieldById(sys, rowCtx.f) : null; if (!lfQ || lfQ.kind !== 'item-list' || typeof rowCtx.r !== 'string') return { ok: false, reason: 'field' }; if (rq === 's') { (isObj(lfQ.list) && Array.isArray(lfQ.list.stats) ? lfQ.list.stats : []).forEach(function(t) { if (!stQ && isObj(t) && t.kind !== 'pick' && typeof t.key === 'string' && lower(t.key) === lower(c.s)) stQ = t; }); if (!stQ) return { ok: false, reason: 'field' }; } }   // 1.5.9 Chambers from: fire, no amount (a list with no chamber fires nothing)
        if (isObj(c) && typeof c.c === 'string') { lfC = rowCtx && typeof rowCtx.f === 'string' ? fieldById(sys, rowCtx.f) : null; (lfC && isObj(lfC.list) && Array.isArray(lfC.list.counters) ? lfC.list.counters : []).forEach(function(t) { if (!ctr && isObj(t) && lower(t.key) === lower(c.c)) ctr = t; }); if (!ctr) return { ok: false, reason: 'field' }; }   // R2b
        if ((!ctr && !rq && (!f || APPLY_KINDS[f.kind] !== 1)) || typeof c.formula !== 'string' || !c.formula) return { ok: false, reason: 'field' };
        var p = F.parse(c.formula); if (!p.ok) return { ok: false, reason: 'error', message: p.error.message };
        var rolled = c.roll === true && !!D && (typeof D === 'object' || typeof D === 'function'), rnd = rolled && typeof D.random === 'function' ? D.random : null;   // 1.5.9: Rolled, on the host
        if (!rolled && hasDice(p.ast.body)) return { ok: false, reason: 'error', message: 'An amount cannot roll dice.' };
        var res = F.evaluate(c.formula, rnd ? { vars: vars, random: rnd } : { vars: vars });
        if (!res.ok) return { ok: false, reason: 'error', message: res.error.message };
        var v = typeof res.value === 'boolean' ? (res.value ? 1 : 0) : res.value;
        if (typeof v !== 'number' || !fin(v)) return { ok: false, reason: 'error', message: 'That amount is not a number.' };
        ((res.breakdown && Array.isArray(res.breakdown.names)) ? res.breakdown.names : []).forEach(function(n) { if (n && typeof n.name === 'string' && !seenN[lower(n.name)]) { seenN[lower(n.name)] = 1; names.push(n); } });
        if (ctr || rq === 'q' || (f && f.kind === 'resource')) v = Math.round(v);
        amts.push({ f: f, ctr: ctr, rq: rq, st: stQ, lf: lfC || lfQ, amt: c.set === true ? v : (v > 0 ? v : 0), add: c.add === true, set: c.set === true, roll: rolled && res.diceRolled > 0 ? rollWords(res) : '' });   // R1: Set to takes the amount as it is; 1.5.9: what a Rolled amount drew
    }
    if (!amts.some(function(a) { return a.fire || a.fx || a.set || a.amt > 0; })) return { ok: false, reason: 'none' };
    var work = Object.assign({}, char, { values: JSON.parse(JSON.stringify(char.values || {})) }), out = {}, lines = [], asIs = same === true, fired = null;   // asIs: work still as char stands
    var onW = isObj(on) && isObj(on.char) ? Object.assign({}, on.char, { values: JSON.parse(JSON.stringify(on.char.values || {})) }) : null, onTc = onW ? (on.tctx || null) : null, onOut = {}, onLines = [], gone = [];   // gone (1.6.0): the rows a quantity used up took out, each as it was   // 1.5.9 (book es/et plan, section 3): the character it is used on, on a working copy of its own
    for (var j = 0; j < amts.length; j++) {
        var a = amts[j]; if (!a.fire && !a.fx && !a.set && !(a.amt > 0)) continue;
        if (a.fx) {   // 1.6.0 (the book's W-16): an effect goes on, or off, on the character it is used on (the user where none), through the effects' own rules (applyEffectOp: once per character, its timer)
            var twX = onW || work, fxF = null, fxRow = null, fxs = sys.fields.filter(function(x) { return isObj(x) && x.kind === 'effects' && typeof x.id === 'string'; });
            fxs.forEach(function(x) { var rs = isObj(twX.values) && Array.isArray(twX.values[x.id]) ? twX.values[x.id] : []; rs.forEach(function(r0) { if (!fxRow && isObj(r0) && r0.ref === a.fx.id) { fxRow = r0; fxF = x; } }); });
            if (!fxF) fxF = fxs[0] || null; if (!fxF) return { ok: false, reason: 'field' };
            var isOn = !!fxRow && fxRow.on !== false; if (isOn === a.on) continue;   // already as asked: nothing moves, nothing is said
            var rowsX = isObj(twX.values) && Array.isArray(twX.values[fxF.id]) ? twX.values[fxF.id] : [], ridX = fxRow && typeof fxRow.id === 'string' ? fxRow.id : '';
            if (!ridX) { var bse = ('x_' + a.fx.id.slice(2)).slice(0, 20), nX = 0; ridX = bse; while (rowsX.some(function(r0) { return isObj(r0) && r0.id === ridX; })) ridX = bse + '_' + (++nX); }
            var fxOpt = { now: isObj(fxo) && typeof fxo.now === 'number' ? fxo.now : 0, inCombat: !!(isObj(fxo) && (onW ? fxo.onInCombat : fxo.inCombat)) };
            var eo = applyEffectOp(sys, twX, fxF.id, a.on ? { op: 'add', rowId: ridX, ref: a.fx.id } : { op: 'on', rowId: ridX, on: false }, F, fxOpt); if (!eo.ok) return { ok: false, reason: eo.reason };
            twX.values[fxF.id] = eo.value; if (onW) onOut[fxF.id] = eo.value; else { out[fxF.id] = eo.value; asIs = false; }
            if (isObj(eo.clamp)) Object.keys(eo.clamp).forEach(function(k) { twX.values[k] = eo.clamp[k]; if (onW) onOut[k] = eo.clamp[k]; else out[k] = eo.clamp[k]; });   // a pool the effect's change brought down, in the same change
            (onW ? onLines : lines).push({ f: fxF.id, n: a.fx.name || 'An effect', fx: a.on ? 1 : 0 });
            continue;
        }
        if (a.rq) {   // 1.6.0: the row's own quantity (at 0 the row goes, as the sheet's minus takes it) or one of its own number stats, on the user's row
            asIs = false;
            var rowsQ = work.values[a.lf.id] = JSON.parse(JSON.stringify(Array.isArray(work.values[a.lf.id]) ? work.values[a.lf.id] : [])), rwQ = null, atQ = -1;
            rowsQ.forEach(function(r, ix) { if (!rwQ && isObj(r) && rowIdOf(r) === rowCtx.r) { rwQ = r; atQ = ix; } }); if (!rwQ && gone.some(function(g) { return g.f === a.lf.id && g.r === rowCtx.r; })) continue; if (!rwQ || rwQ.hid === 1) return { ok: false, reason: 'missing' };   // a row this very press used up: the changes after it pass it over
            var rdQ = rowDef(sys, rwQ), nmQ = (rdQ && rdQ.def && rdQ.def.name) || 'The item';
            if (a.rq === 'q') {
                var curQ = typeof rwQ.qty === 'number' && rwQ.qty > 0 ? rwQ.qty : 1, nxQ = Math.max(0, Math.min(LIMITS.maxQty, Math.round(a.set ? a.amt : a.add ? curQ + a.amt : curQ - a.amt)));
                if (nxQ <= 0) {
                    var gpQ = isObj(a.lf.list) && isObj(a.lf.list.parts) ? partsKept(sys, a.lf.list, work.values, rowCtx.r) : null, goQ = { f: a.lf.id, r: rowCtx.r, row: JSON.parse(JSON.stringify(rwQ)), at: atQ };   // 1.6.0 R14: its parts go with it, kept for its Undo
                    if (gpQ) goQ.parts = gpQ; gone.push(goQ); rowsQ.splice(atQ, 1);
                    var ggQ = grantsKept(sys, work.values, rowCtx.r); if (ggQ) { goQ.grants = ggQ; var gcQ = map(); ggQ.rows.forEach(function(p) { gcQ[p.f + '|' + rowIdOf(p.row)] = 1; }); itemListIds(sys).forEach(function(fid) { var lsG = Array.isArray(work.values[fid]) ? work.values[fid] : null; if (!lsG || !lsG.some(function(r) { return gcQ[fid + '|' + rowIdOf(r)] === 1; })) return; var kpG = lsG.filter(function(r) { return gcQ[fid + '|' + rowIdOf(r)] !== 1; }); lsG.length = 0; kpG.forEach(function(r) { lsG.push(r); }); out[fid] = lsG; }); }   // 1.6.0 (v2, B4): what it granted goes with it, kept for its Undo
                    if (gpQ) { var lsP = gpQ.f === a.lf.id ? rowsQ : (work.values[gpQ.f] = JSON.parse(JSON.stringify(Array.isArray(work.values[gpQ.f]) ? work.values[gpQ.f] : []))), keepQ = lsP.filter(function(r) { return !(isObj(r) && r.in === rowCtx.r); }); lsP.length = 0; keepQ.forEach(function(r) { lsP.push(r); }); if (gpQ.f !== a.lf.id) out[gpQ.f] = lsP; }
                } else rwQ.qty = nxQ;
                out[a.lf.id] = rowsQ; var lnQ = { f: a.lf.id, n: nmQ, d: nxQ - curQ, v: nxQ }; if (a.roll) lnQ.roll = a.roll; lines.push(lnQ);
                continue;
            }
            var spQ = isObj(a.lf.list) ? a.lf.list : null, curS = rowStat(spQ, rdQ ? rdQ.def : null, a.st.key); curS = typeof curS === 'number' && fin(curS) ? curS : 0;
            var nxS = a.set ? a.amt : a.add ? curS + a.amt : curS - a.amt; nxS = Math.max(-1e9, Math.min(1e9, nxS));
            if (typeof rwQ.defId === 'string') { rwQ.ov = isObj(rwQ.ov) ? rwQ.ov : {}; rwQ.ov.stats = Object.assign({}, isObj(rwQ.ov.stats) ? rwQ.ov.stats : {}); rwQ.ov.stats[a.st.key] = nxS; }   // a library row: its own figure over the entry's
            else if (isObj(rwQ.def)) { rwQ.def = Object.assign({}, rwQ.def); rwQ.def.stats = Object.assign({}, isObj(rwQ.def.stats) ? rwQ.def.stats : {}); rwQ.def.stats[a.st.key] = nxS; }   // a row of its own: its own copy
            else return { ok: false, reason: 'missing' };
            out[a.lf.id] = rowsQ; var lnS = { f: a.lf.id, n: a.st.label || a.st.key, d: nxS - curS, v: nxS }; if (a.roll) lnS.roll = a.roll; lines.push(lnS);
            continue;
        }
        if (a.fire) {   // 1.5.9 Chambers from: the first chambered round leaves the chamber and is kept on the row as the round last fired (one copy, replaced at each shot). Nothing chambered: nothing fires
            if (!a.lf || !isObj(a.lf.list) || !isObj(a.lf.list.chamber) || !rowCtx || typeof rowCtx.r !== 'string') continue;
            var rowsF = JSON.parse(JSON.stringify(Array.isArray(work.values[a.lf.id]) ? work.values[a.lf.id] : [])), rwF = null;
            rowsF.forEach(function(r) { if (!rwF && isObj(r) && rowIdOf(r) === rowCtx.r) rwF = r; }); if (!rwF || rwF.hid === 1) return { ok: false, reason: 'missing' };
            if (!Array.isArray(rwF.rd) || !rwF.rd.length) continue;
            var shot = rwF.rd[0]; rwF.rd = rwF.rd.slice(1); if (!rwF.rd.length) delete rwF.rd; rwF.fd = shot;
            work.values[a.lf.id] = rowsF; out[a.lf.id] = rowsF; asIs = false;
            var shD = rowDef(sys, shot), shN = (shD && shD.def && shD.def.name) || 'A round', left = Array.isArray(rwF.rd) ? rwF.rd.length : 0;
            fired = { f: a.lf.id, r: rowCtx.r, name: shN };
            lines.push({ f: a.lf.id, n: shN + ' fired, chambered', d: -1, v: left });
            continue;
        }
        if (a.ctr) {   // Stage 6 HUD R2b: one of the row's counters — from 0 to the row's own most, on the working copy of its list
            asIs = false;
            var rowsC = work.values[a.lf.id] = JSON.parse(JSON.stringify(Array.isArray(work.values[a.lf.id]) ? work.values[a.lf.id] : [])), rwC = null;
            rowsC.forEach(function(r) { if (!rwC && isObj(r) && rowIdOf(r) === rowCtx.r) rwC = r; }); if (!rwC && gone.some(function(g) { return g.f === a.lf.id && g.r === rowCtx.r; })) continue; if (!rwC || rwC.hid === 1) return { ok: false, reason: 'missing' };
            var curC = rowCt(rwC, a.ctr), nxC = Math.max(0, Math.min(1e6, Math.round(a.set ? a.amt : a.add ? curC + a.amt : curC - a.amt))), mxC = makeResolver(sys, work, F, tctx || null).ctMax(a.lf, rwC, a.ctr.key);
            if (typeof mxC === 'number') nxC = Math.min(nxC, mxC);
            rwC.ct = Object.assign({}, isObj(rwC.ct) ? rwC.ct : {}); rwC.ct[a.ctr.key] = nxC; out[a.lf.id] = rowsC;
            var lnC = { f: a.lf.id, n: a.ctr.label || a.ctr.key, d: a.set ? nxC - curC : a.add ? a.amt : -a.amt, v: nxC }; if (a.roll) lnC.roll = a.roll; lines.push(lnC);   // 1.5.9: and what a Rolled amount drew
            continue;
        }
        var tw = onW || work, tAs = !onW && asIs, ttc = onW ? onTc : tctx, cur = 0;   // 1.5.9: a field's change lands on the character it is used on, worked out on its own copy and in its own token's context
        if (a.f.kind === 'resource') { var rv = (tAs ? vars : makeResolver(sys, tw, F, ttc || null))(a.f.key); if (typeof rv === 'number' && fin(rv)) cur = rv; }   // full (nothing stored) reads as the max
        else if (a.f.kind === 'toggle') { var tv = storedOf(a.f, tw); cur = tv === true || (typeof tv === 'number' && tv > 0) ? 1 : 0; }   // 1.5.7: a toggle reads 1 on, 0 off
        else { var sv = storedOf(a.f, tw); if (typeof sv === 'number' && fin(sv)) cur = sv; }
        var next = a.set ? a.amt : a.add ? cur + a.amt : cur - a.amt;
        var ed = applyEdit(sys, tw, a.f.id, a.f.kind === 'resource' ? { cur: next } : a.f.kind === 'toggle' ? next > 0 : next, F, tAs ? { tctx: ttc, vars: vars } : { tctx: ttc });   // 152 (fold 1's review): held to the most as this context reads it, as cur was read
        if (!ed.ok) return { ok: false, reason: ed.reason };
        tw.values[a.f.id] = ed.value; if (onW) onOut[a.f.id] = ed.value; else { out[a.f.id] = ed.value; asIs = false; }
        var nv = a.f.kind === 'resource' ? ed.value.cur : a.f.kind === 'toggle' ? (ed.value ? 1 : 0) : ed.value;
        var lnF = { f: a.f.id, n: a.f.label || a.f.key, d: a.set ? nv - cur : a.add ? a.amt : -a.amt, v: nv }; if (a.roll) lnF.roll = a.roll; if (onW && a.set) lnF.set = true; (onW ? onLines : lines).push(lnF);
        if (a.f.kind === 'resource' && !a.set && !a.add && isObj(a.f.spill)) {   // 1.6.0 Spills into: a Subtract past the pool's spill point goes on into another pool, in this one change
            var spA = poolSpill(sys, tw, a.f, cur, a.amt, F, ttc); if (spA.error) return { ok: false, reason: 'error', message: spA.error };
            spA.steps.forEach(function(s) { if (onW) onOut[s.f] = s.value; else out[s.f] = s.value; (onW ? onLines : lines).push({ f: s.f, n: s.label, d: -s.amt, v: s.v }); });
        }   // a Set's line says what it moved; 1.5.9: and what a Rolled amount drew; a Set on another says so, for the card its user's player gets with no figure
    }
    if (!lines.length && !onLines.length) return { ok: false, reason: 'none' };   // 1.5.9: a Then that only fires, with nothing chambered
    var doneA = { ok: true, values: out, lines: lines, names: names }; if (fired) doneA.fired = fired; if (gone.length) doneA.gone = gone;   // 1.6.0: the rows used up, for their Undo   // 1.5.9: the round it fired, for the blast it places
    if (onW) { doneA.onValues = onOut; doneA.onLines = onLines; }   // 1.5.9: what moved on the character it was used on, all or none with the rest
    if (lines.concat(onLines).some(function(l) { return !!l.roll; })) doneA.drew = true;   // 1.5.9: a Rolled amount drew dice, so its card says so and a time rule's run counts as rolled
    return doneA;
}
// Stage 6 HUD G10 (his reference turn sweep, module/combat.mjs: when a combat's round changes, every combatant's Turn follows it and the sweep
// resets its tallies): the apply actions ticked Each round, which the host runs by itself on every character in a combat each time its round
// changes (the combat's start, Next turn past the last, a step back past the first); pressed, one is his "Sweep now"
function roundActs(sys, kind) { var k = kind === 'turn' || kind === 'turnEnd' ? kind : 'round'; return (sys && Array.isArray(sys.rolls) ? sys.rolls : []).filter(function(r) { return isObj(r) && r.each === k && !r.by && Array.isArray(r.apply) && r.apply.length > 0; }); }   // T2b: kind — each round (the default) or at its turn's start; those that run automatically
function dueActs(sys, kind) { var k = kind === 'turn' || kind === 'turnEnd' ? kind : 'round'; return (sys && Array.isArray(sys.rolls) ? sys.rolls : []).filter(function(r) { return isObj(r) && r.each === k && (r.by === 'gm' || r.by === 'owner') && ((Array.isArray(r.apply) && r.apply.length > 0) || (!Array.isArray(r.apply) && typeof r.formula === 'string' && r.formula !== '')); }); }   // T2b: those that wait for a press; 1.5.9: a roll due too (its reminder rolls it)
// the characters a combat holds: each row's token on the combat's map (a hidden one too: it is fighting), a character once (its first token)
// — [{ charId, tok }]
function combatChars(mp, combat, chars) {
    var out = [], seen = map();
    if (!isObj(mp) || !Array.isArray(mp.whiteboard) || !isObj(combat) || !Array.isArray(combat.rows) || !isObj(chars)) return out;
    combat.rows.forEach(function(r) {
        if (!isObj(r) || typeof r.tokId !== 'string' || !r.tokId) return;
        var tok = null; mp.whiteboard.forEach(function(w) { if (!tok && isObj(w) && w.id === r.tokId && w.isChar && typeof w.charId === 'string' && w.charId) tok = w; });
        if (!tok || seen[tok.charId] || !Object.prototype.hasOwnProperty.call(chars, tok.charId) || !isObj(chars[tok.charId])) return;
        seen[tok.charId] = 1; out.push({ charId: tok.charId, tok: tok });
    });
    return out;
}
// every Each round action on one character, in the System's order, each worked out on the values the one before left (varsFor(work): the
// resolver of that working copy; a Set to reads the round just begun through tctx: Turn := CombatRound). One that cannot run (nothing to move,
// an amount that fails) is passed over, as his sweep carries on. { values: { fieldId: value }, ran: n }
function applyRound(sys, char, varsFor, F, tctx, kind, D, fxo) {   // fxo (1.6.0): the clock an effect a run switches on starts its timer by   // kind (T2b): 'round' (the default) or 'turn' (1.6.0: or 'turnEnd'); D (1.5.9): the host's dice, for a Rolled amount
    var out = { values: {}, ran: 0 }; if (!sys || !isObj(char) || typeof varsFor !== 'function' || !F) return out;
    var work = Object.assign({}, char, { values: Object.assign({}, isObj(char.values) ? char.values : {}) });
    if (kind === 'turn') turnCounters(sys, work, out);   // 1.6.0: counters that start again each turn, before the turn's own actions run
    roundActs(sys, kind).forEach(function(act) {
        var vv = varsFor(work); if (typeof vv !== 'function') return;
        if (act.to === 'near') vv = withOnSelf(vv, true);   // 1.6.0 (the review of 96e39ae6): a run by itself is on its own character, so OnSelf reads 1
        var res = applyAct(sys, work, act, vv, F, tctx || null, null, undefined, D, null, fxo); if (!res.ok) return;
        Object.keys(res.values).forEach(function(k) { work.values[k] = res.values[k]; out.values[k] = res.values[k]; }); out.ran++;
    });
    return out;
}
// 1.6.0 (the v2 combat module): a list counter ticked Starts again each turn (turn) goes back to where a row starts (its def, else 0) at its
// character's turn start in a fight: its stored count is taken off, as a new row has none. A row already there is left as it is
function turnCounters(sys, work, out) {
    (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        var spec = isObj(f) && f.kind === 'item-list' && isObj(f.list) ? f.list : null, ts = spec && Array.isArray(spec.counters) ? spec.counters.filter(function(t) { return isObj(t) && t.turn === true && typeof t.key === 'string'; }) : [];
        var src = ts.length && Array.isArray(work.values[f.id]) ? work.values[f.id] : null; if (!src) return;
        var changed = false, list = src.map(function(r) {
            if (!isObj(r) || !isObj(r.ct)) return r;
            var ct = Object.assign({}, r.ct), did = false;
            ts.forEach(function(t) { if (typeof ct[t.key] === 'number' && ct[t.key] !== (typeof t.def === 'number' ? t.def : 0)) { delete ct[t.key]; did = true; } });
            if (!did) return r; changed = true; var nr = Object.assign({}, r); if (Object.keys(ct).length) nr.ct = ct; else delete nr.ct; return nr;
        });
        if (changed) { work.values[f.id] = list; out.values[f.id] = list; }
    });
}
// Stage 6 HUD H7 (owner, 2026-09-26): who sees an apply action's card — 'table' when every field it moves is shown to teammates on hover (the
// card tells them nothing new), else 'owner' (the character's player and the GM); 'gm' for an NPC, a GM-only action or field, and when the
// caller says the amount read a GM-only value (gm) — the GM only (and the player who pressed it on a GM-only row: the caller's)
// Item 20 K5: a time rule run n times on one character (at most 500), with the GM's full view and no token — an apply action's changes each
// time, or a roll made each time (D: the dice core; its malfunction and its verdict by the system's check rule choose its consequences) — each
// worked out on what the one before left. { values: { fieldId: value } (what changed), lines: [{ f, n, d, v }] (each field once: how far it
// really moved, a full pool's clamp counted, and where it ended), rolls: { made, pass, fail }, ran } ; a run that fails is passed over.
// Backlog 152: at = { round } runs it in a fight, so CombatRound reads that round (whole, within 0 to 9999, as withRound keeps it); the context is
// built here (ruleRunCtx), since withRound answers nothing with no token's context. Without it, CombatRound reads 0, as before. 1.5.5 (found
// live: one press of +1 hour on a campaign of 158 characters held the GM's screen for four seconds, nearly all of it here, working out every
// field of the sheet for every run): opt.vars, a resolver of char as it stands in this run's context, is the first run's, and each later run
// works out only the names it reads, with one resolver of its own state (ropts.reuse). A caller hands it in only for a system chainsShallow passes, where
// any resolver of one state answers every name alike, so nothing a run gives changes. Without it, as before. 1.5.5's review (a draw counted while a
// nap held its needs and lost, since the nap ran out before the run was made): opt.due, [{ n, fx }] in run order, makes each run of a fire of a rule
// ticked Only while its needs hold with the timed effects its character had where that run came due (fx: { effects field id: list }; dueFx), its
// needs judged and its changes worked out so; a part with no fx, or a run past what due names, is made as the character stands. With due, opt.flat
// (chainsShallow passes) works out only the names each run reads. What a run writes is never an effects list, so nothing of fx is ever stored
// 1.5.9 (book es/et plan, section 0): D also rolls a change ticked Rolled, and out.drew, where it is there, counts the runs whose Rolled amount drew dice
function ruleRunCtx(at) { return isObj(at) && fin(at.round) ? { combat: { round: Math.max(0, Math.min(9999, Math.floor(at.round))) } } : null; }
function timeRuleRun(sys, char, rule, n, F, D, at, opt) {
    var out = { values: {}, lines: [], rolls: { made: 0, pass: 0, fail: 0 }, ran: 0 }; if (!isObj(sys) || !isObj(char) || !isObj(rule) || !F) return out;
    var tctx = ruleRunCtx(at), own = isObj(opt) && typeof opt.vars === 'function', due = isObj(opt) && Array.isArray(opt.due) && opt.due.length ? opt.due : null, lazy = own || (!!due && opt.flat === true);
    var work = Object.assign({}, char, { values: JSON.parse(JSON.stringify(isObj(char.values) ? char.values : {})) }), tot = map(), init = map(), order = [], count = Math.max(0, Math.min(500, Math.floor(Number(n) || 0)));
    var chk = isObj(sys.combat) && sys.combat.checks === 'under3d6' ? 'under3d6' : '', efx = due && Array.isArray(sys.fields) ? sys.fields.filter(function(f) { return isObj(f) && f.kind === 'effects' && typeof f.id === 'string'; }).map(function(f) { return f.id; }) : null;
    for (var i = 0; i < count; i++) {
        var fx = due ? dueFx(due, efx, i) : null, wk = fx ? Object.assign({}, work, { values: Object.assign({}, work.values, fx) }) : work;   // 1.5.5's review: as its character stood where it came due
        var vars = lazy ? (i === 0 && own && !fx ? opt.vars : makeResolver(sys, wk, F, tctx ? { combat: tctx.combat, reuse: true } : { reuse: true })) : resolveAll(sys, wk, F, tctx).vars, act = null;
        if (rule.to === 'near') vars = withOnSelf(vars, true);   // 1.6.0 (the review of 96e39ae6): a run by the clock is on its own character, so OnSelf reads 1
        if (!rollNeedsOk(rule, vars, F)) { out.held = true; break; }   // 1.5.4: its needs not met, it is passed over (the next run would read the same)
        if (Array.isArray(rule.apply)) act = rule;
        else if (typeof rule.formula === 'string' && rule.formula) {
            var res = F.evaluate(rule.formula, { vars: vars }); if (!res.ok) break;
            out.rolls.made++;
            var mf = null; if (rule.malf) { var mq = F.evaluate(rule.malf, { vars: vars }); if (mq.ok && typeof mq.value === 'number' && fin(mq.value)) mf = Math.max(1, Math.min(1000000, Math.round(mq.value))); }
            var crg = critRange(sys, rule, vars, F), mfHit = mf !== null && D && D.naturalOf ? D.naturalOf(res) >= mf : false, vd = D && D.verdictOf ? D.verdictOf(res, crg ? { at: crg[0], fumble: crg[1] } : chk) : null, pass = mfHit ? false : (vd && vd.kind === 'check' ? vd.pass : null);   // 1.6.0: criticals at fixed rolls, by its own range
            if (pass === true) out.rolls.pass++; else if (pass === false) out.rolls.fail++;
            var cr = thenCrit(vd, mfHit), th = thenChanges(rule, pass, mfHit, cr); if (!th.length) continue; act = { apply: th }; vars = withRollCrit(vars, cr, thenMargin(vd, mfHit), bigOf(rule, vars, F, D, res, vd, mfHit));   // 1.5.8: its critical, and RollCrit and RollMargin in its amounts (1.6.0: and RollBig)
        }
        if (!act) break;
        act.apply.forEach(function(c) { if (isObj(c) && typeof c.f === 'string' && init[c.f] === undefined) { var fd = fieldById(sys, c.f), iv = fd ? vars(fd.key) : null; init[c.f] = typeof iv === 'number' && fin(iv) ? iv : 0; } });   // where each field began, for how far it really moved
        var r = applyAct(sys, wk, act, vars, F, tctx, null, lazy, D); if (!r.ok) continue;   // 1.5.9: D rolls a Rolled amount
        if (r.drew) out.drew = (out.drew || 0) + 1;   // and a run that drew dice says so (the flood rule counts it as rolled)
        Object.keys(r.values).forEach(function(k) { work.values[k] = r.values[k]; out.values[k] = r.values[k]; });
        r.lines.forEach(function(l) { if (!tot[l.f]) { tot[l.f] = { f: l.f, n: l.n, v: l.v }; order.push(l.f); } tot[l.f].v = l.v; });
        out.ran++;
    }
    out.lines = order.map(function(k) { var v = tot[k].v; return { f: k, n: tot[k].n, d: typeof v === 'number' && fin(v) ? Math.round((v - (init[k] || 0)) * 1000) / 1000 : 0, v: v }; });
    return out;
}
// the effects lists run i of a fire is made with (timeRuleRun's opt.due): the part of due that holds it, each part n runs in order; only a list of an
// effects field of the system (efx) is taken from its fx, so nothing else of the character is ever laid over. null: none named, or past what due names
function dueFx(due, efx, i) {
    var c = 0;
    for (var k = 0; k < due.length; k++) {
        var d = due[k]; if (!isObj(d) || typeof d.n !== 'number' || !fin(d.n) || !(d.n >= 1)) continue;
        c += Math.floor(d.n); if (i >= c) continue;
        if (!isObj(d.fx) || !Array.isArray(efx)) return null;
        var o = null; efx.forEach(function(id) { if (hasOwn(d.fx, id) && Array.isArray(d.fx[id])) (o = o || {})[id] = d.fx[id]; });
        return o;
    }
    return null;
}
// 1.5.5 (the owner, 2026-10-23, of a droid's draw taken only where it slept at the moment each day began: "everything needs to be accounted for, no
// shortcuts"): a time rule ticked Only while its needs hold counts only the time its needs hold (calendarcore ruleFires' need). needsHeld says how
// much of a stretch they held for one character: secs, the stretch of its own time; asks [{ key, rule, fight }], each count to judge (key: the count's
// own, the rule's id or x_ and its tail; fight true: the In a fight count, judged in the fight's round o.round, as its runs read CombatRound; else By
// the clock's, with no round, as its runs are). The needs are read as the run reads them (rollNeedsOk: a formula that cannot be worked out does not
// hold), with the character as it stands as the stretch is counted, and, with o.split true (a stretch outside a fight, where its timed effects run by
// the game clock: net.js fxSpans), again at each moment within it that one of its timed effects runs out (fxTick on a copy, at o.now), each piece
// counting whole or not at all. Each state is read through a lazy resolver (makeResolver: only the names the needs read are worked out); o.flat
// (chainsShallow passes) shares its first pass, as runTimeRules does, and without it a needs formula that a lazy resolver cannot work out is read
// again through resolveAll's, as timeRuleRun's own run reads it there, so the two never disagree and the whole sheet is worked out only then. 1.5.5's
// review (an hour of 160 characters judged in eight seconds where the needs named a name the sheet does not have): that second reading is asked only
// for the formula engine's refusal of a chain past its depth (heldDeep), the one failure resolveAll's may not share; any other failure is the run's
// too. o.keep, a list, is given each piece judged, in order: { t: where it begins, len, ok: { key: whether it held }, fx: the character's effects lists
// there (heldFx) }, so that a run is made where it came due (calendar.js dueOn, timeRuleRun's opt.due).
// { key: seconds held, 0 to secs, to the millisecond }; with nothing to judge by, 0 for each. The character is never changed
var HELD_KEY = /^[a-z]_[A-Za-z0-9_]{1,24}$/, HELD_CUTS = 200;
function heldDeep(v) { return isObj(v) && isObj(v.error) && typeof v.error.message === 'string' && v.error.message.indexOf('too deeply') >= 0; }   // the engine's own words for a chain past its depth
function heldFx(sys, ch) { var o = {}; sys.fields.forEach(function(f) { if (isObj(f) && f.kind === 'effects' && typeof f.id === 'string') o[f.id] = isObj(ch.values) && hasOwn(ch.values, f.id) && Array.isArray(ch.values[f.id]) ? ch.values[f.id] : []; }); return o; }
function needsHeld(sys, char, asks, F, secs, o) {
    var acc = map(), out = {}, list = (Array.isArray(asks) ? asks : []).filter(function(a) { return isObj(a) && typeof a.key === 'string' && HELD_KEY.test(a.key) && isObj(a.rule); });
    list.forEach(function(a) { acc[a.key] = 0; });
    var S = typeof secs === 'number' && fin(secs) && secs > 0 ? secs : 0; o = isObj(o) ? o : {};
    var keep = Array.isArray(o.keep) ? o.keep : null;
    if (list.length && S && isObj(sys) && isObj(char) && F) {
        var now = typeof o.now === 'number' && fin(o.now) ? o.now : 0, cuts = [];
        if (o.split === true && Array.isArray(sys.fields) && isObj(char.values)) sys.fields.forEach(function(f) {   // the moments a timed effect runs out within the stretch (fxTick's own reading)
            var src = isObj(f) && f.kind === 'effects' && hasOwn(char.values, f.id) ? char.values[f.id] : null; if (!Array.isArray(src)) return;
            src.forEach(function(r) { if (!isObj(r) || !isObj(r.t) || r.t.p === 1) return; var l = fxLeftNow(r.t, now); if (typeof l === 'number' && isFinite(l) && l > 0 && l < S && cuts.indexOf(l) < 0) cuts.push(l); });
        });
        cuts.sort(function(a, b) { return a - b; }); if (cuts.length > HELD_CUTS) cuts = cuts.slice(0, HELD_CUTS);
        var at = [0].concat(cuts), rd = ruleRunCtx({ round: o.round });
        var fl = o.flat === true, mk = function(ch, tc) { return makeResolver(sys, ch, F, tc ? (fl ? { combat: tc.combat, reuse: true } : { combat: tc.combat }) : (fl ? { reuse: true } : undefined)); };
        at.forEach(function(t0, i) {
            var len = (i + 1 < at.length ? at[i + 1] : S) - t0; if (!(len > 0)) return;
            var ch = char; if (t0 > 0) { var tk = fxTick(sys, char, 'game', now, t0), vs = Object.assign({}, char.values); Object.keys(tk.values).forEach(function(k) { vs[k] = tk.values[k]; }); ch = Object.assign({}, char, { values: vs }); }   // as the character stands once the effects due by then have run out
            var v0 = null, v1 = null, w0 = null, w1 = null, okP = {};
            list.forEach(function(a) {
                var ok = false, more = fl ? undefined : function(v) { return !heldDeep(v) ? null : a.fight === true ? (w1 = w1 || resolveAll(sys, ch, F, rd).vars) : (w0 = w0 || resolveAll(sys, ch, F, null).vars); };
                try { var vars = a.fight === true ? (v1 = v1 || mk(ch, rd)) : (v0 = v0 || mk(ch, null)); ok = rollNeedsOk(a.rule, vars, F, more); } catch (e) { ok = false; }
                if (ok) acc[a.key] += len;
                okP[a.key] = ok;
            });
            if (keep && Array.isArray(sys.fields)) keep.push({ t: t0, len: len, ok: okP, fx: heldFx(sys, ch) });
        });
    }
    list.forEach(function(a) { out[a.key] = Math.max(0, Math.min(S, Math.round(acc[a.key] * 1000) / 1000)); });
    return out;
}
// 1.5.5: whether no name of the system can be worked out through a loop or deeper than the formula engine allows (its LIMITS.maxDepth). The
// resolver keeps on its chain each definition it is working out (a formula, a skill's base, a pool's most, a list's total, highest or
// lowest, a column of one row, a choice's option), and the engine refuses a chain past that depth: so where a chain could pass it, a
// resolver whose cache already holds part of the chain (resolveAll's, which works out every field in order) may answer a name that a fresh
// one cannot. Where none can, every resolver of one state answers every name alike, and a caller may share one or work out only what it
// reads. Read from the definitions alone, each name its text reads followed to the node the resolver itself would work it out under (by
// key, a list's names, a reserved suffix, a column's Row.*), so it holds every chain the resolver can build and more. A loop, a chain past
// the depth or no engine: false. The review of 1.5.5: no path is walked past that depth, since a path that long already answers, so a long
// chain never runs the stack out and is never read cut short; and anything it cannot read (an engine that throws) is no proof: false too
function chainsShallow(sys, F) {
    if (!isObj(sys) || !Array.isArray(sys.fields) || !F || typeof F.names !== 'function') return false;
    try { return chainsWalk(sys, F); } catch (e) { return false; }
}
function chainsWalk(sys, F) {
    var lim = isObj(F.LIMITS) && typeof F.LIMITS.maxDepth === 'number' ? F.LIMITS.maxDepth : 64, ix = keyIndex(sys), lists = map(), info = map(), memo = map(), on = map();
    var node = function(id, texts, L, names, more) { if (!info[id]) info[id] = { texts: texts, L: L, names: names, more: more }; return id; };
    var listOf = function(f) {   // listCtx's own reading of a list's stats, columns and counters
        var lk = lower(f.key); if (lists[lk]) return lists[lk];
        var spec = isObj(f.list) ? f.list : null, st = map(), cl = map(), ct = map();
        (spec && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') st[lower(x.key)] = x; });
        (spec && Array.isArray(spec.cols) ? spec.cols : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') cl[lower(x.key)] = x; });
        (spec && Array.isArray(spec.counters) ? spec.counters : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') ct[lower(x.key)] = x; });
        var chs = spec && isObj(spec.chamber) ? chamberSrc(sys, spec) : null;   // 1.5.9: the list its chambered rounds come from (Row.round.*, Row.fired.*)
        var pts = spec && isObj(spec.parts) ? partsSrc(sys, spec) : null;   // 1.6.0 R14: the list its parts come from (Row.parts.*)
        return (lists[lk] = { k: lk, st: st, cl: cl, ct: ct, chs: chs, pts: pts });
    };
    var defNode = function(f, sfx) {   // a field's name: its definition worked out (a formula, a skill's base, a pool's most), '' for one read as stored
        var t = DEF_PROP[f.kind] ? f[DEF_PROP[f.kind]] : null; if (typeof t !== 'string' || !t) return '';   // none, GM only or missing: answered with nothing on the chain
        if (f.kind === 'formula' ? sfx : f.kind === 'skill' ? sfx && sfx !== 'base' : sfx && sfx !== 'max' && sfx !== 'cur') return '';   // a pool full or by .cur reads its most
        return node('f|' + lower(f.key), [t], null, [], []);
    };
    var rowNode = function(L, w) {   // a row's own name (Row.<w>, L.<Key>.<w>): a choice reads its option's value, a column is worked out
        if (w === 'lvl' || w === 'qty' || w === 'on' || w === 'has' || w === 'paid') return '';
        if (L.st[w]) return L.st[w].kind === 'pick' ? node('p|' + L.k + '|' + w, [], null, (Array.isArray(L.st[w].opts) ? L.st[w].opts : []).map(function(o) { return isObj(o) && typeof o.name === 'string' ? o.name : ''; }), []) : '';
        if (L.cl[w]) return typeof L.cl[w].formula === 'string' && L.cl[w].formula ? node('c|' + L.k + '|' + w, [L.cl[w].formula], L, [], []) : '';
        return '';
    };
    var totNode = function(L, w, ext) {   // a total of w (ext: a highest or lowest); undefined where the resolver has none and looks further
        if (ext ? !((L.st[w] && L.st[w].kind !== 'pick') || L.cl[w] || L.ct[w]) : ((w !== 'count' && w !== 'qty' && w !== 'paid' && !L.st[w] && !L.cl[w]) || (L.st[w] && L.st[w].kind === 'pick'))) return undefined;
        var c = L.cl[w] ? rowNode(L, w) : ''; return node('t|' + L.k + '|' + w, [], null, [], c ? [c] : []);
    };
    var listNode = function(l) {   // listName's own reading
        var segs = l.split('.'), f = ix[segs[0]]; if (!f || f.kind !== 'item-list' || segs.length < 2 || segs.length > 4) return undefined;
        var on4 = segs.length === 4 && segs[1] === 'on', ext = on4 ? segs[2] : segs[1];
        if (segs.length === 4 && ext !== 'max' && ext !== 'min') return undefined;
        var L = listOf(f);
        if (segs.length === 2) return totNode(L, segs[1], false);
        if ((ext === 'max' || ext === 'min') && segs.length === (on4 ? 4 : 3)) return totNode(L, segs[segs.length - 1], true);
        if (segs.length === 4) return undefined;
        if (segs[1] === 'on') return totNode(L, segs[2], false);
        var w = segs[2]; if (w !== 'lvl' && w !== 'qty' && w !== 'on' && w !== 'has' && w !== 'paid' && !L.st[w] && !L.cl[w] && !L.ct[w]) return undefined;
        return rowNode(L, w);
    };
    var nodeOf = function(name, L) {   // the resolver's own lookup (fn, and a column's rowVars): the node a name is worked out under, or ''
        var l = lower(name);
        if (L && l.slice(0, 4) === 'row.') { var w = l.slice(4), cw = w.split('.'); return w.indexOf('.') < 0 ? rowNode(L, w) : cw.length === 2 && (cw[0] === 'round' || cw[0] === 'fired') && L.chs ? rowNode(listOf(L.chs), cw[1]) : cw.length === 2 && cw[0] === 'parts' && L.pts ? rowNode(listOf(L.pts), cw[1]) : ''; }   // 1.5.9: a round's stat or column, on its own list; 1.6.0 R14: a part's
        if (ix[l]) return defNode(ix[l], '');
        if (l.indexOf('.') > 0) { var ln = listNode(l); if (ln !== undefined) return ln; }
        var dot = l.lastIndexOf('.'); if (dot > 0 && NAME_SUFFIX[l.slice(dot + 1)] && ix[l.slice(0, dot)]) return defNode(ix[l.slice(0, dot)], l.slice(dot + 1));
        return '';
    };
    var namesOf = function(t) { var ns = F.names(t); return (Array.isArray(ns) ? ns : []).map(function(x) { return typeof x === 'string' ? x : isObj(x) && typeof x.name === 'string' ? x.name : ''; }); };   // a throw goes to chainsShallow's own catch
    var over = false;   // a loop met, or a path walked past the depth: the answer is false, and nothing is walked further
    var depth = function(id, p) {   // the longest chain from id, in nodes (a loop: Infinity); p: the nodes on the path walked to it, id among them
        if (memo[id] !== undefined) return memo[id];
        if (on[id] === 1 || p > lim) { over = true; return Infinity; }
        on[id] = 1; var it = info[id], best = 0;
        var see = function(d) { if (!d || best > lim) return; var x = depth(d, p + 1); if (x > best) best = x; };
        it.texts.forEach(function(t) { namesOf(t).forEach(function(nm) { if (nm) see(nodeOf(nm, it.L)); }); });
        it.names.forEach(function(nm) { if (nm) see(nodeOf(nm, null)); });
        it.more.forEach(see);
        on[id] = 0; return (memo[id] = best + 1);
    };
    var tops = [];
    Object.keys(ix).forEach(function(k) {
        var f = ix[k]; if (!isObj(f)) return; var d = defNode(f, ''); if (d) tops.push(d);
        if (f.kind !== 'item-list') return; var L = listOf(f);
        Object.keys(L.cl).forEach(function(w) { var t = totNode(L, w, false); if (t) tops.push(t); });
        Object.keys(L.st).forEach(function(w) { var p = rowNode(L, w); if (p) tops.push(p); });
    });
    for (var i = 0; i < tops.length; i++) if (depth(tops[i], 1) > lim || over) return false;
    return true;
}
function applyScope(sys, char, act, gm, F) {
    if (gm || !sys || !Array.isArray(sys.fields) || !isObj(act) || act.vis === 'gm' || !char || char.npc || !char.ownerId || !Array.isArray(act.apply) || !act.apply.length) return 'gm';
    var rowOwn = function(c) { return isObj(c) && (typeof c.c === 'string' || c.q === true || typeof c.s === 'string' || typeof c.fx === 'string'); };   // 1.6.0: a row's quantity or stat is its owner's, as a counter is, and so is a switched effect
    if (act.apply.some(function(c) { if (!isObj(c) || typeof c.fx !== 'string') return false; var d = null; (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(x) { if (!d && isObj(x) && x.id === c.fx) d = x; }); return !d || d.vis === 'gm'; })) return 'gm';   // 1.6.0: a GM-only effect's card is the GM's
    var gmP = F ? gmPools(sys, F) : map(), ctrs = act.apply.some(rowOwn), fs = act.apply.filter(function(c) { return !rowOwn(c); }).map(function(c) { return isObj(c) && typeof c.f === 'string' ? fieldById(sys, c.f) : null; });
    var spSeen = map(); fs.slice().forEach(function(f) { for (var g = f, n = 0; isObj(g) && isObj(g.spill) && spSeen[g.id] !== 1 && n < LIMITS.fields; n++) { spSeen[g.id] = 1; g = fieldById(sys, g.spill.to); fs.push(g); } });   // 1.6.0 Spills into: a pool a loss may spill into is moved too, so its card is judged with it
    if (fs.some(function(f) { return !f || f.vis === 'gm' || gmP[f.id] === 1; })) return 'gm';
    return !ctrs && fs.every(function(f) { return f.hover === true; }) ? 'table' : 'owner';   // R2b: a row's counter is its owner's (a list never reaches teammates)
}
// Stage 6 HUD R1: the consequences one roll makes — a check's verdict (pass: true | false; null when the roll tests nothing) picks its "on
// success" or "on failure" changes; "always" ones apply either way
// 1.5.7: the damage type a damage roll names, as a key of the system's damage types, or '': its dtype is such a key, or a formula read with the
// roll's own names (a list roll's row) that gives the type's place in the Combat card's list, 1 for the first. Nothing is rolled
function dmgTypeOf(sys, ent, vars, F) {
    var rules = sys && isObj(sys.combat) && isObj(sys.combat.damage) ? sys.combat.damage : null, types = rules && Array.isArray(rules.types) ? rules.types.filter(function(t) { return isObj(t) && typeof t.key === 'string' && t.key; }) : [];
    if (!isObj(ent) || ent.dmg !== true || typeof ent.dtype !== 'string' || !ent.dtype || !types.length) return '';
    var hit = types.filter(function(t) { return t.key === ent.dtype.trim(); })[0]; if (hit) return hit.key;
    if (!F || typeof vars !== 'function') return '';
    var p = F.parse(ent.dtype); if (!p.ok || hasDice(p.ast.body)) return '';
    var r = F.evaluate(ent.dtype, { vars: vars }); if (!r.ok || typeof r.value !== 'number' || !fin(r.value)) return '';
    var i = Math.round(r.value); return i >= 1 && i <= types.length ? types[i - 1].key : '';
}
// 1.6.0 (the v2 combat module): the armour divisor a list's damage roll reads from its row (its ad: a number, or a formula of the roll's own names,
// Row.ap), 0.1 to 100 to the tenth, or 0 for none (1 is none too). Nothing is rolled; a formula that cannot be worked out gives none
function dmgAdOf(ent, vars, F) {
    if (!isObj(ent) || ent.dmg !== true || typeof ent.ad !== 'string' || !ent.ad || !F || typeof vars !== 'function') return 0;
    var p = F.parse(ent.ad); if (!p.ok || hasDice(p.ast.body)) return 0;
    var r = F.evaluate(ent.ad, { vars: vars, random: noDice }); if (!r.ok || typeof r.value !== 'number' || !fin(r.value) || r.value <= 0) return 0;
    var a = Math.max(0.1, Math.min(100, Math.round(r.value * 10) / 10)); return a === 1 ? 0 : a;
}
// 1.5.8 (the owner, 2026-10-25: "a roll's Then gets critical success and critical failure beside success and failure"): crit, 'crit' or 'fumble' (the
// roll's verdict, thenCrit), adds the On a critical success or On a critical failure changes; On success still takes every success and On failure
// every failure, criticals included. A crit of anything else, or none, is no critical, so a system with no criticals reads exactly as before.
// 1.5.9 (the handbook's ruling, Charges Per Shot: a shot that jams is not fired and spends nothing): a fire never comes of a malfunction, whatever its
// When says, so a jam keeps its round chambered; every other change of a Then is as before. Every caller (the host's roll, the GM's own, a time rule) comes here
function thenChanges(entry, pass, malf, crit) { return (isObj(entry) && Array.isArray(entry.then) ? entry.then : []).filter(function(c) { return isObj(c) && !(malf === true && c.fire === true) && (!c.when || (pass === true && c.when === 'hit') || (pass === false && c.when === 'miss') || (malf === true && c.when === 'malf') || (pass === true && crit === 'crit' && c.when === 'crit') || (pass === false && crit === 'fumble' && c.when === 'fumble')); }); }   // R3: malf — the roll malfunctioned (it is then a failure too)
// 1.6.0 (the v2 sort's B1): the critical range one roll is judged by under criticals at fixed rolls (combat.checks 'fixed'), [at, fumble]: each the
// roll's own formula (entry.critAt, entry.fumbleAt: a system roll's or a list roll's), else the Combat card's, else 3 and 18, worked out with the
// roller's names (vars: a list roll's are its row's), no dice rolled, rounded; a formula that cannot be worked out gives way to the next. null
// under any other rule. Only the machine that rolls asks it (the host's roll-req, the GM's own net.diceRoll, a time rule), and the record carries
// the two numbers (dicecore ruleOf), so every card and consequence reads the same
function critRange(sys, entry, vars, F) {
    var cm = isObj(sys) && isObj(sys.combat) ? sys.combat : null; if (!cm || cm.checks !== 'fixed') return null;
    var ev = function(t) { if (typeof t !== 'string' || !t || !F || typeof F.evaluate !== 'function') return null; var r = null; try { r = F.evaluate(t, typeof vars === 'function' ? { vars: vars, random: noDice } : { random: noDice }); } catch (e) { r = null; } return r && r.ok && typeof r.value === 'number' && fin(r.value) ? Math.max(-1000000, Math.min(1000000, Math.round(r.value))) : null; };
    var pick = function(k, d) { var v = isObj(entry) ? ev(entry[k]) : null; if (v === null) v = ev(cm[k]); return v === null ? d : v; };
    return [pick('critAt', 3), pick('fumbleAt', 18)];
}
// 1.6.0 (the book's ruling of 2026-10-29): whether a roll lands as a Big Hit: a success (vd, the dice core's verdict; never a malfunction) whose
// natural roll (its dice alone, D.naturalOf) is at or under the roll's own bigAt, worked out with the roller's names, no dice. It is no critical:
// RollCrit, On a critical success and a target's Defense are as they were; the host marks the record (big: true) and a Then reads RollBig
function bigOf(entry, vars, F, D, res, vd, malf) {
    if (!isObj(entry) || typeof entry.bigAt !== 'string' || !entry.bigAt || malf === true || !isObj(vd) || vd.kind !== 'check' || vd.pass !== true) return false;
    if (!F || typeof F.evaluate !== 'function' || !D || typeof D.naturalOf !== 'function' || !isObj(res) || !res.ok || !isObj(res.breakdown) || !Array.isArray(res.breakdown.dice) || !res.breakdown.dice.length) return false;
    var r = null; try { r = F.evaluate(entry.bigAt, typeof vars === 'function' ? { vars: vars, random: noDice } : { random: noDice }); } catch (e) { r = null; }
    return !!(r && r.ok && typeof r.value === 'number' && fin(r.value) && D.naturalOf(res) <= r.value);
}
// 1.5.8: the critical a roll's consequences go by, from the dice core's verdict (verdictOf: only a check read by the system's Roll outcomes rule
// carries one, today 3d6 roll-under criticals): 'crit', 'fumble' or ''. A malfunction is a failure, so it is never a critical success
function thenCrit(vd, malf) { var c = isObj(vd) && vd.kind === 'check' && (vd.crit === 'crit' || vd.crit === 'fumble') ? vd.crit : ''; return malf === true && c === 'crit' ? '' : c; }
// 1.5.8: the margin a roll's consequences read as RollMargin, from the dice core's verdict: how far a check beat its target, a miss below 0; a value,
// no verdict or no margin 0. A malfunction is a failure, so it never reads above 0
function thenMargin(vd, malf) { var m = isObj(vd) && vd.kind === 'check' && typeof vd.margin === 'number' && fin(vd.margin) ? vd.margin : 0; return malf === true && m > 0 ? 0 : m; }
// 1.5.8: the names a roll's consequences read: vars, and RollCrit, 1 on a critical success, -1 on a critical failure, 0 otherwise. A field of the
// system with that very key keeps it (as the token's names give way to a field), so RollCrit is read only where vars knows no such name
// 1.5.8 (the owner, 2026-10-25): and RollMargin, how far the roll beat its target, a miss below 0, 0 with no target (thenMargin)
function withRollCrit(vars, crit, margin, big) {   // 1.6.0: and RollBig, 1 where the roll lands as a Big Hit (bigOf), else 0
    if (typeof vars !== 'function') return vars;
    var k = crit === 'crit' ? 1 : crit === 'fumble' ? -1 : 0, mg = typeof margin === 'number' && fin(margin) ? Math.max(-1e6, Math.min(1e6, margin)) : 0;
    var w = function(l, t) { var v = vars(l, t); if (v !== undefined) return v; var n = String(l).toLowerCase(); return n === 'rollcrit' ? k : n === 'rollmargin' ? mg : n === 'rollbig' ? (big === true ? 1 : 0) : v; };
    Object.keys(vars).forEach(function(p) { w[p] = vars[p]; });
    return w;
}
// 1.5.9 (book es/et plan, section 3): the names a roll or an action that Applies to an adjacent character reads: vars, and OnSelf, 1 when it is
// used on its user and 0 when it is used on another (self false). A field of the system with that very key keeps it, as RollCrit gives way.
// Laid over the row's own names where it is a list's (vars.row first). 1.6.0 (the owner, by prompt: "On.<name>"): On.<name> reads the one it is
// used on — onVars, its resolver, where it is another; one's own name where it is the user — so its needs can say "not on a droid"
function withOnSelf(vars, self, onVars) {
    if (typeof vars !== 'function') return vars;
    var k = self === false ? 0 : 1;
    var w = function(l, t) { var v = vars(l, t); if (v !== undefined) return v; var lo = String(l).toLowerCase(); if (lo === 'onself') return k; if (lo.length > 3 && lo.indexOf('on.') === 0) { var rest = String(l).slice(3); return self === false ? (typeof onVars === 'function' ? onVars(rest, t) : undefined) : vars(rest, t); } return v; };
    Object.keys(vars).forEach(function(p) { w[p] = vars[p]; });
    return w;
}
// 1.6.0: whether a formula reads the one an entry is used on (On.<name>): its button never greys by it, as only a press names that character
function readsOn(text, F) { if (typeof text !== 'string' || !text || !F || typeof F.names !== 'function') return false; try { return F.names(text).some(function(n) { return /^on\./i.test(String(n)); }); } catch (e) { return false; } }
var THEN_WHEN =Object.freeze({ hit: 'On success', miss: 'On failure', crit: 'On a critical success', fumble: 'On a critical failure', malf: 'On malfunction' });   // 1.5.8: a consequence's When, in the editor's words
// Stage 6 HUD C8: whether a part of the sheet shows for this character — its show-if worked out with the sheet's own resolver (vars). None, a
// formula that does not parse, dice (never rolled here), an error or a value that is not a number or yes/no shows it (fail open: a broken
// show-if never hides anything). Render only: the values still travel, so a show-if is never a secret (GM only is)
function showsIf(text, vars, F) {
    if (typeof text !== 'string' || !text || !F || typeof vars !== 'function') return true;
    var p = F.parse(text); if (!p.ok || hasDice(p.ast.body)) return true;
    var r = F.evaluate(text, { vars: vars }); if (!r.ok) return true;
    return typeof r.value === 'boolean' ? r.value : typeof r.value === 'number' ? r.value !== 0 : true;
}
// Stage 6 HUD H7: a player's press of an apply action on their own character — { rid, charId, act, label? }. The host finds the action in the
// player's own view and works everything out (nothing else rides along); the label is the button as drawn, the card's title as a roll's is
// 1.6.0: the host's word that a press of this player's used up rows of theirs (row-gone): { charId, items: [{ f, r }] }, at most 8, or null
function cleanRowGone(msg) {
    if (!isObj(msg) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId) || !Array.isArray(msg.items) || !msg.items.length || msg.items.length > 8) return null;
    var items = []; for (var i = 0; i < msg.items.length; i++) { var it = msg.items[i]; if (!isObj(it) || typeof it.f !== 'string' || !FIELD_ID.test(it.f) || typeof it.r !== 'string' || !ROW_ID.test(it.r)) return null; items.push({ f: it.f, r: it.r }); }
    return { charId: msg.charId, items: items };
}
function cleanCharApply(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId)) return null;
    var out = { rid: msg.rid, charId: msg.charId };
    if (msg.row !== undefined) {   // HUD H7b: a list's action on one row — { f: the list field, r: the row, i: the list's action }, never with an act
        var rw = msg.row; if (msg.act !== undefined || !isObj(rw) || typeof rw.f !== 'string' || !FIELD_ID.test(rw.f) || typeof rw.r !== 'string' || !ROW_ID.test(rw.r) || typeof rw.i !== 'number' || Math.floor(rw.i) !== rw.i || rw.i < 0 || rw.i >= LIMITS.rowRolls) return null;
        out.row = { f: rw.f, r: rw.r, i: rw.i };
    } else if (typeof msg.act !== 'string' || !ROLL_ID.test(msg.act)) return null;
    else out.act = msg.act;
    if (msg.label !== undefined) { if (typeof msg.label !== 'string' || msg.label.length > LIMITS.label || CTRL_RE.test(msg.label)) return null; var lb = msg.label.trim(); if (lb) out.label = lb; }
    if (msg.on !== undefined) { if (!tokOnOk(msg.on)) return null; out.on = msg.on; }   // 1.5.9 (book es/et plan, section 3): the token of the adjacent character it is used on, judged by the host (net.js allyOn)
    return out;
}
// 1.5.9: a token's id a press names as the one it is used on, by the rule the targets keep (1 to 80 characters, no control character)
function tokOnOk(v) { return typeof v === 'string' && v.length >= 1 && v.length <= 80 && !CTRL_RE.test(v); }
// HUD frame (HF4b, H13): what a section's Reset all resets for this viewer — the first LIMITS.editBatch pools and counters of its own placements
// (not a sub-section's) that the viewer may edit (the GM any; the owner a field Player may edit, visible). Counters first — their start (the
// default) — then pools back to full, each max read with the counters already reset (a max may read one) as applyEdit reads it, and every
// target the value the field would STORE (a default off the step grid, a fractional max), so one press leaves nothing to reset.
// { any, allowed, targets: [{ fieldId, value, label }] } — any: the section places a pool or a counter (its button shows); allowed: how many
// the viewer may reset; with no targets the button is inert
function resetTargets(sys, char, sec, F, who) {
    var out = { any: false, allowed: 0, targets: [] }; if (!sys || !char || !isObj(sec) || !Array.isArray(sec.fields)) return out;
    who = who || {}; var picked = [];
    for (var i = 0; i < sec.fields.length; i++) {
        var pl = sec.fields[i], f = isObj(pl) && typeof pl.id === 'string' ? fieldById(sys, pl.id) : null;
        if (!f || !(f.kind === 'resource' || (f.counter === true && (f.kind === 'number' || f.kind === 'skill')))) continue;
        out.any = true;
        if (char.partial || !(who.gm || (who.own && f.vis === 'all' && (f.edit === 'owner' || !!openChar(char))))) continue;   // Onboarding F3: a character in the making or unlocked: every field its owner can see
        out.allowed++; if (picked.length < LIMITS.editBatch) picked.push(f);
    }
    var vals = Object.assign({}, char.values || {}), R = null;
    picked.forEach(function(f) {   // counters first
        if (f.kind === 'resource') return;
        var d0 = cleanValue(f, f.def); if (d0 === undefined) return;
        var raw = char.values ? char.values[f.id] : undefined, now = raw === undefined ? d0 : cleanValue(f, raw);
        vals[f.id] = d0; if (now !== d0) out.targets.push({ fieldId: f.id, value: d0, label: f.label || f.key });
    });
    picked.forEach(function(f) {   // then pools, against the counters as reset
        if (f.kind !== 'resource') return;
        R = R || makeResolver(sys, Object.assign({}, char, { values: vals }), F);
        var mx = R(f.key + '.max'), cu = R(f.key); if (typeof mx !== 'number' || !isFinite(mx) || typeof cu !== 'number' || !isFinite(cu)) return;
        var tv = cleanValue(f, { cur: mx }, { max: mx }); if (tv && tv.cur !== cu) out.targets.push({ fieldId: f.id, value: tv, label: f.label || f.key });
    });
    return out;
}
// A per-row change of a carried list (an item list can't ride cleanCharEdit — arrays are refused there). Stage 6 F4a: { op, defId (add), rowId, qty }
// — the keys each op uses, checked by shape only (applyRowOp judges the rest). Every op names its row: a player's add brings its new row's id.
// F4b set: facts; F4c2 ov: a copy's own values (null: back to the library); F4c3 custom: a custom row's definition patch (def; {} makes a blank row)
function cleanCharItem(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId) || typeof msg.fieldId !== 'string' || !FIELD_ID.test(msg.fieldId)) return null;
    if (typeof msg.op !== 'string' || !ROW_OPS[msg.op]) return null;
    var out = { rid: msg.rid, charId: msg.charId, fieldId: msg.fieldId, op: msg.op };
    if (msg.op === 'add') { if (typeof msg.defId !== 'string' || !ITEM_ID.test(msg.defId)) return null; out.defId = msg.defId; }
    if ((msg.op === 'add' || msg.op === 'custom') && msg.in !== undefined) { if (typeof msg.in !== 'string' || !ROW_ID.test(msg.in)) return null; out.in = msg.in; }   // 1.6.0 R14: a part, added to its host row
    if (msg.op === 'add' && msg.name !== undefined) { if (typeof msg.name !== 'string') return null; var agW = cutText(msg.name, LIMITS.itemName); if (!agW) return null; out.name = agW; }   // 1.6.0: a copy's own name (an entry held again)
    if (typeof msg.rowId !== 'string' || !ROW_ID.test(msg.rowId)) return null; out.rowId = msg.rowId;
    if (msg.op === 'add' || msg.op === 'setQty' || msg.op === 'undo') { var qty = msg.qty === undefined ? 1 : (cleanNum(msg.qty, NaN) | 0); if (!(qty >= 0)) return null; out.qty = clampNum(qty, 0, LIMITS.maxQty); }
    if (msg.op === 'set') { var fx = cleanFacts(msg.facts); if (!fx) return null; out.facts = fx; }   // F4b
    if (msg.op === 'ov') { if (msg.ov === null) out.ov = null; else { var ovm = cleanOvMsg(msg.ov); if (!ovm) return null; out.ov = ovm; } }   // F4c2: back to the library only when the wire says null; a patch malformed, or holding nothing, refuses the message
    if (msg.op === 'add' && msg.pay !== undefined) { if (typeof msg.pay !== 'number' || !fin(msg.pay) || msg.pay < 0 || msg.pay > LIMITS.statAbs) return null; out.pay = moneyR(msg.pay); }   // 1.5.6: what a purchase paid, in total
    if ((msg.op === 'remove' || msg.op === 'setQty') && msg.get !== undefined) { if (typeof msg.get !== 'number' || !fin(msg.get) || msg.get < 0 || msg.get > LIMITS.statAbs) return null; out.get = moneyR(msg.get); }   // ... and what a sale is paid
    if (msg.op === 'load') { if (msg.from === null || msg.from === undefined) out.from = null; else if (typeof msg.from === 'string' && ROW_ID.test(msg.from)) out.from = msg.from; else return null; if (msg.back !== undefined) { if (typeof msg.back !== 'string' || !ROW_ID.test(msg.back)) return null; out.back = msg.back; } }   // 1.5.8 Loads from: the source row (null: unload), and a fresh id for a copy coming out as a row of its own
    if (msg.op === 'chamber') { if (typeof msg.from !== 'string' || !ROW_ID.test(msg.from)) return null; out.from = msg.from; }   // 1.5.9 Chambers from: the source row a round comes off
    if (msg.op === 'split') { var spn = cleanNum(msg.qty, NaN); if (!(spn >= 1) || spn !== Math.floor(spn) || spn > LIMITS.maxQty) return null; out.qty = spn; if (typeof msg.back !== 'string' || !ROW_ID.test(msg.back)) return null; out.back = msg.back; }   // 1.6.0, backlog 180 R11: how many come off the stack, and the new row's id
    if (msg.op === 'unchamber' && msg.back !== undefined) { if (typeof msg.back !== 'string' || !ROW_ID.test(msg.back)) return null; out.back = msg.back; }   // ... and a fresh id for a round coming back as a row of its own
    if (msg.op === 'custom') { var dfp = cleanDefPatch(msg.def); if (!dfp) return null; out.def = dfp; }   // F4c3: a patch (an object; {} is a new blank row), the GM's keys kept so that a player sending one hears "field"
    return out;
}
// Stage 6 F4b: a set op's facts — a level (a number, or null: back to the default), a switch, a note ('' clears it); F4c1: what one cost (a number
// 0..1e9, or null: the list price); at least one
function cleanFacts(v) {
    if (!isObj(v)) return null;
    var out = {};
    if (v.lvl === null) out.lvl = null; else if (v.lvl !== undefined) { if (typeof v.lvl !== 'number') return null; var n = lvlNum(v.lvl); if (n === undefined) return null; out.lvl = n; }
    if (v.on !== undefined) { if (typeof v.on !== 'boolean') return null; out.on = v.on; }
    if (v.note !== undefined) { if (typeof v.note !== 'string' || v.note.length > LIMITS.rowNote * 4) return null; out.note = cutText(v.note, LIMITS.rowNote); }
    if (v.ct !== undefined) { if (!isObj(v.ct)) return null; var ctk = Object.keys(v.ct); if (!ctk.length || ctk.length > LIMITS.rowCounters) return null; var cto = {}; for (var cti = 0; cti < ctk.length; cti++) { var cvv = v.ct[ctk[cti]]; if (typeof cvv !== 'number' || !fin(cvv) || ctk[cti].length > 24) return null; cto[ctk[cti]] = cvv; } out.ct = cto; }   // Stage 6 HUD R2: counters by key (applyRowOp judges them)
    if (v.paid === null) out.paid = null; else if (v.paid !== undefined) { if (typeof v.paid !== 'number' || !fin(v.paid) || v.paid < 0 || v.paid > LIMITS.statAbs) return null; out.paid = v.paid; }
    return Object.keys(out).length ? out : null;
}
// Stage 6 F4c2: an ov op's patch, by shape (applyRowOp judges the rest) — each text null or a string within four times its cap, a lock null or a
// mode (none lifts the library's), a blast null or { ft, name? }, stats null or up to LIMITS.entryStats keys (a stat key, never a prototype name in either case),
// each null or a number within 1e9. held never comes from the wire (the host keeps it); other keys are dropped; a wrong type refuses the whole
// message. A plain object; null when it is malformed or nothing is left
var OV_KEYS = ['name', 'icon', 'category', 'notes', 'stats', 'area', 'damage', 'cost', 'rm', 'rmMsg', 'eq', 'eqMsg'], OV_CAP = Object.freeze({ name: 240, icon: 256, category: 160, notes: 800, damage: 1200, cost: 1200, rmMsg: 800, eqMsg: 800 });
function cleanOvMsg(v) { var out = patchOf(v, OV_KEYS, OV_CAP); return out && Object.keys(out).length ? out : null; }
// Stage 6 F4c3: a custom op's definition patch, by the same shape rules (key: a string within 160, vis within 8; applyRowOp judges who may send
// what — the GM's keys are kept, so that a player sending one hears "field"). A plain object, {} allowed (a new blank row); null when it is not
// an object or a key has the wrong type
var DEF_KEYS = ['name', 'icon', 'category', 'notes', 'key', 'stats', 'vis', 'area', 'damage', 'cost', 'rm', 'rmMsg', 'eq', 'eqMsg', 'mods', 'modsOn', 'desc', 'lvls'], DEF_CAP = Object.freeze({ name: 240, icon: 256, category: 160, notes: 800, key: 160, vis: 8, damage: 1200, cost: 1200, rmMsg: 800, eqMsg: 800, desc: 16000 });   // 155: desc and lvls, a row of its own's long text
function cleanDefPatch(v) { return patchOf(v, DEF_KEYS, DEF_CAP); }
function patchOf(v, keys, cap) {   // the keys it knows, each null or of its type (a text within its cap); {} when none; null when malformed
    if (!isObj(v)) return null;
    var out = {};
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i], x = v[k]; if (x === undefined) continue;
        if (x === null) { out[k] = null; continue; }
        if (k === 'rm' || k === 'eq') { if (OV_LOCK[x] !== 1) return null; out[k] = x; }
        else if (k === 'area') { if (!isObj(x) || typeof x.ft !== 'number' || !fin(x.ft) || (x.name !== undefined && (typeof x.name !== 'string' || x.name.length > 240))) return null; out.area = { ft: x.ft }; if (typeof x.name === 'string') out.area.name = x.name; }
        else if (k === 'stats') { var sp = statsPatch(x); if (!sp) return null; if (Object.keys(sp).length) out.stats = sp; }
        else if (k === 'mods') {   // Stage 6 F6b: a custom row's changes by their shape only (applyCustom judges their fields); a malformed one refuses the message
            if (!Array.isArray(x) || x.length > LIMITS.effectMods) return null; var pm = [];
            for (var mi = 0; mi < x.length; mi++) { var mx = x[mi]; if (!isObj(mx) || typeof mx.f !== 'string' || !FIELD_ID.test(mx.f) || (mx.op !== 'add' && mx.op !== 'on')) return null; var po = { f: mx.f, op: mx.op }; if (mx.op === 'add') { if (typeof mx.v !== 'number' || !fin(mx.v)) return null; po.v = mx.v; if (mx.part === 'max') po.part = 'max'; else if (rowModAim(mx)) { po.key = mx.key; po.col = mx.col; } if (mx.lvl === true) po.lvl = true; } pm.push(po); }
            out.mods = pm;
        }
        else if (k === 'modsOn') { if (x !== true) return null; out.modsOn = true; }
        else if (k === 'lvls') {   // 155: what each level of a row of its own gives, by its shape only (applyCustom cleans it); a malformed one refuses the message
            if (!Array.isArray(x) || x.length > LIMITS.lvls * 4) return null; var pv = [];
            for (var vi = 0; vi < x.length; vi++) { var vx = x[vi]; if (!isObj(vx) || typeof vx.lvl !== 'number' || !fin(vx.lvl) || typeof vx.text !== 'string' || vx.text.length > LIMITS.lvlText * 4 || (vx.tag !== undefined && (typeof vx.tag !== 'string' || vx.tag.length > LIMITS.lvlTag * 4))) return null; var vo = { lvl: vx.lvl, text: vx.text }; if (typeof vx.tag === 'string') vo.tag = vx.tag; pv.push(vo); }
            out.lvls = pv;
        }
        else { if (typeof x !== 'string' || x.length > cap[k]) return null; out[k] = x; }
    }
    return out;
}
function statsPatch(v) {
    if (!isObj(v)) return null;
    var ks = Object.keys(v), out = {}; if (ks.length > LIMITS.entryStats) return null;
    for (var i = 0; i < ks.length; i++) { var k = ks[i], x = v[k]; if (!STAT_KEY.test(k) || (k in Object.prototype) || (lower(k) in Object.prototype)) return null; if (x !== null && statNum(x) === undefined && !(typeof x === 'string' && x.length <= LIMITS.label * 4 && x.trim())) return null; out[k] = x; }
    return out;
}
function cleanDenyReason(r) { return typeof r === 'string' && hasOwn(DENY, r) ? r : 'value'; }   // (by own key: a reason such as "constructor" is no reason)
function cleanItemMsg(v) { return cutText(v, LIMITS.rmMsg); }   // Stage 6: a bound or cursed item's message as a player receives it (shown as text)

/* ---------- Stage 6 F4a: carried rows ----------
   A row of an item list is a carried item: a legacy {defId, qty}; a linked {id, defId, qty, snap?} (snap: the entry as it was when it left
   the library — the character keeps the item); a custom {id, qty, def} (the character's own item: the GM's "Make custom"). An owner's copy of
   a GM-only entry, or of a deleted one, arrives inline {id, qty, def, lnk:1} with its players' fields only. A cleaner never mints an id: a
   legacy row's id is derived from its item (rowIdOf); a new row's id comes from whoever made it, and the host refuses a taken one. A row the
   player dropped of a curse-on-contact item stays on the host with hid:1 under a fresh id (the GM's; never projected to its owner). F4c3: a
   custom row its owner made carries own:1 (they may change it while the list takes custom rows; its owner's copy carries it too). */
function rowIdOf(r) { if (!isObj(r)) return null; if (typeof r.id === 'string' && ROW_ID.test(r.id)) return r.id; return typeof r.defId === 'string' && ITEM_ID.test(r.defId) ? 'w_' + r.defId.slice(2) : null; }
function cutText(v, n) { return str(v, n).replace(CTRL_RE_G, ' ').trim(); }
function cleanRowDef(d, gmView) {   // an item's definition carried on a row, by the item rules; a GM-only one keeps no area (it is never thrown by a player)
    if (!isObj(d)) return null;
    var vis = d.vis === 'gm' ? 'gm' : 'all';
    var out = { name: cutText(d.name, LIMITS.itemName) || 'Item', category: cutText(d.category, LIMITS.category), icon: cleanIcon(d.icon), notes: str(d.notes, LIMITS.text).replace(CTRL_RE_G, ' '), vis: vis };
    if (isObj(d.area) && (gmView || vis === 'all')) { var ft = cleanNum(d.area.ft, 0) | 0; if (ft > 0) out.area = areaExtra({ ft: clampNum(ft, 1, LIMITS.maxBlastFt), shape: SHAPES[d.area.shape] ? d.area.shape : 'circle', name: cutText(d.area.name, LIMITS.label) }, d.area, gmView); }
    if (gmView && RM_MODES[d.rm] === 1) { out.rm = d.rm; var rmm = cutText(d.rmMsg, LIMITS.rmMsg); if (rmm) out.rmMsg = rmm; }   // Stage 6: secret, the GM's copy only
    if (gmView && RM_MODES[d.eq] === 1) { out.eq = d.eq; var eqm = cutText(d.eqMsg, LIMITS.rmMsg); if (eqm) out.eqMsg = eqm; }   // F4b: the equip lock, as secret
    if (gmView || vis === 'all') { var rk = cleanItemKey(d.key); if (rk) out.key = rk; }   // F4b: a GM-only copy's key stays the GM's (critic 2)
    var rl = lvlNum(d.lvl); if (rl !== undefined) out.lvl = rl;
    var ds = cleanEntryStats(d.stats, null, 'labels'); if (ds) out.stats = ds;
    var dm = cleanItemMods(d.mods); if (dm) { out.mods = dm; if (d.modsOn === true) out.modsOn = true; }   // F6: its changes by their shape (a projection keeps the viewer's fields only: viewMods)   // F4c1: its stats by the key rule (a snapshot keeps every one; a custom or inline copy's are narrowed to its list's: rowStats)
    if (gmView) {   // formula text stays on the GM's machine, as an item's does
        var dmg = cleanFormulaText(d.damage); if (dmg) out.damage = dmg;
        var cst = cleanFormulaText(d.cost); if (cst) out.cost = cst;
        if (typeof d.throwSkill === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(d.throwSkill)) out.throwSkill = d.throwSkill;
    }
    return out;
}
// 1.5.8 Loads from: a loaded copy — one unit of a source row as it was taken, as a row of that list with no id, quantity, level, switch or counters
// (what it holds is the host row's counter). Cleaned on the source list's terms (srcSpec) with a stand-in id. Only on a row of quantity 1 of a
// list with a load, never on a kept curse
var LD_DROP = Object.freeze({ id: 1, qty: 1, lvl: 1, on: 1, ct: 1, hid: 1, keptOn: 1, opn: 1, ld: 1, rd: 1, fd: 1, in: 1 });   // 1.5.9: nor a chamber
function cleanLd(e, items, srcSpec) {
    if (!isObj(e)) return null;
    var x = {}; Object.keys(e).forEach(function(k) { if (LD_DROP[k] !== 1 && !(k in Object.prototype)) x[k] = e[k]; }); x.id = 'w_ld'; x.qty = 1;
    var r = cleanRow(x, items, isObj(srcSpec) ? srcSpec : null); if (!r) return null;
    delete r.id; delete r.qty; delete r.lvl; delete r.on; delete r.ct; delete r.hid; delete r.keptOn; return r;
}
function withLd(o, e, items, spec, srcSpec) { if (!isObj(spec) || !isObj(spec.load) || !isObj(e.ld) || o.qty !== 1 || o.hid === 1) return o; var ld = cleanLd(e.ld, items, srcSpec); if (ld) o.ld = ld; return o; }
// 1.5.9 Chambers from: a chambered round, and the round last fired — one unit of a source row as it was taken, as a row of that list with no id,
// quantity, switch or counters (its level kept: what it holds). Cleaned on the source list's terms (chSpec) with a stand-in id. Only on a row of
// quantity 1 of a list with a chamber, never on a kept curse; at most its cap of chambered rounds, in the order they go in (the first fires first)
var RD_DROP = Object.freeze({ id: 1, qty: 1, on: 1, ct: 1, hid: 1, keptOn: 1, opn: 1, ld: 1, rd: 1, fd: 1, in: 1 });
function cleanRd(e, items, chSpec) {
    if (!isObj(e)) return null;
    var x = {}; Object.keys(e).forEach(function(k) { if (RD_DROP[k] !== 1 && !(k in Object.prototype)) x[k] = e[k]; }); x.id = 'w_rd'; x.qty = 1;
    var r = cleanRow(x, items, isObj(chSpec) ? chSpec : null); if (!r) return null;
    delete r.id; delete r.qty; delete r.on; delete r.ct; delete r.hid; delete r.keptOn; return r;
}
// how many rounds a row holds: the list's Holds, or, where the list says the row holds as one of its number stats reads (capBy) and the row's
// figure there is 1 or more, that figure (whole, CHAMBER_CAP at most), as the site reads a launcher's own Shots (launcherCapacity). Without a
// row (or a system to read it by), the list's Holds
function chamberCap(spec, sys, row) {
    var ch = isObj(spec) && isObj(spec.chamber) ? spec.chamber : null, c = ch ? ch.cap : 1, base = typeof c === 'number' && fin(c) ? Math.max(1, Math.min(CHAMBER_CAP, Math.round(c))) : 1;
    if (!ch || typeof ch.capBy !== 'string' || !ch.capBy || !isObj(sys) || !isObj(row)) return base;
    var d = rowDef(sys, row), n = d ? rowStat(spec, d.def, ch.capBy) : null;
    return typeof n === 'number' && fin(n) && n >= 1 ? Math.min(CHAMBER_CAP, Math.floor(n)) : base;
}
function withRd(o, e, items, spec, chSpec) {
    if (!isObj(spec) || !isObj(spec.chamber) || o.qty !== 1 || o.hid === 1) return o;
    var cap = typeof spec.chamber.capBy === 'string' && spec.chamber.capBy ? CHAMBER_CAP : chamberCap(spec), rd = []; (Array.isArray(e.rd) ? e.rd : []).forEach(function(x) { if (rd.length >= cap) return; var c = cleanRd(x, items, chSpec); if (c) rd.push(c); });
    if (rd.length) o.rd = rd;
    var fd = isObj(e.fd) ? cleanRd(e.fd, items, chSpec) : null; if (fd) o.fd = fd;
    return o;
}
function cleanRow(e, items, spec, srcSpec, chSpec) {   // spec (F4b): the list's options (f.list), for the level; srcSpec (1.5.8): the list a loaded copy came from; chSpec (1.5.9): the list a chambered round came from
    if (!isObj(e)) return null;
    var id = typeof e.id === 'string' && ROW_ID.test(e.id) ? e.id : null, qty = clampNum(cleanNum(e.qty, 1) | 0, 1, LIMITS.maxQty);
    if (typeof e.defId === 'string' && ITEM_ID.test(e.defId)) {
        var known = items[e.defId] === 1, snap = !known && isObj(e.snap) ? cleanRowDef(e.snap, true) : null;   // a copy of a deleted entry keeps its snapshot; once the entry is back the row reads the library again
        if (!known && !snap) return null;   // an unknown item with no copy is dropped (the rule before Stage 6)
        var o = {}; if (id) o.id = id; o.defId = e.defId; o.qty = qty; rowFacts(o, e, spec); var ov = cleanOv(e.ov, spec); if (ov) o.ov = ov; if (snap) o.snap = snap; if (id && e.hid === 1) o.hid = 1; if (e.keptOn === 1 && o.on === true) o.keptOn = 1; return withRd(withLd(o, e, items, spec, srcSpec), e, items, spec, chSpec);   // F4c2: its own values (a custom row never has any: its definition is its own)
    }
    if (!id || !isObj(e.def)) return null;
    var d = cleanRowDef(e.def, e.lnk !== 1); if (!d) return null;
    var cs = rowStats(e.def.stats, spec); if (cs) d.stats = cs; else delete d.stats;   // F4c1: a custom or inline copy carries its list's stats only
    if (e.lnk === 1) rowText(d, e.def); else ownLong(d, e.def);   // 1.5.4: an owner's inline copy keeps the entry's long text, cleaned again (the host sends it for an entry players may see); 1.5.5 (155): a row of the character's own keeps its own
    var c = { id: id, qty: qty }; rowFacts(c, e, spec); c.def = d; if (e.lnk === 1) { c.lnk = 1; if (typeof e.src === 'string' && ITEM_ID.test(e.src)) { c.src = e.src; var cnR = cleanNeeds(e.needs, true); if (cnR) c.needs = cnR; var crR = cleanFormulaText(e.needsIf); if (crR) { c.needsIf = crR; var cfR = typeof e.needsFrom === 'number' ? lvlNum(e.needsFrom) : undefined; if (cfR !== undefined) c.needsFrom = cfR; } } } else { if (e.own === 1) c.own = 1; if (e.hid === 1) c.hid = 1; if (e.keptOn === 1 && c.on === true) c.keptOn = 1; } return withRd(withLd(c, e, items, spec, srcSpec), e, items, spec, chSpec);   // F4c3: own (a row its owner made), never on an inline copy
}
// Stage 6 F4b: a row's facts, after its quantity — the level on the list's terms (as stored while the list has none), the switch, the note.
// keptOn (after them, the GM's machine only): the owner switched a curse-on-contact item off and the GM keeps it on
// Stage 6 HUD R2: a row's counters — whole numbers 0..1e6 under its list's counter keys (spelled as the list spells them); a list with no counters
// keeps none. None stored: each reads its start (rowCt)
function cleanCt(v, spec) {
    var cs = isObj(spec) && Array.isArray(spec.counters) ? spec.counters : null; if (!isObj(v) || !cs) return null;
    var out = {}, n = 0;
    Object.keys(v).forEach(function(k) {
        var x = v[k], key = null; if (n >= LIMITS.rowCounters || typeof x !== 'number' || !fin(x)) return;
        cs.forEach(function(t) { if (!key && isObj(t) && typeof t.key === 'string' && lower(t.key) === lower(k)) key = t.key; });
        if (!key || Object.prototype.hasOwnProperty.call(out, key)) return;
        out[key] = Math.max(0, Math.min(1e6, Math.round(x))); n++;
    });
    return n ? out : null;
}
// 1.6.0 Counts by the game clock: the part of a step each timed counter of a row has lived, in seconds (above 0, at most 1e9), by the counter's
// key as its list spells it; a list with no timed counter keeps none. The GM's machine works it (rowTimers); the owner's copy never carries it
function cleanTt(v, spec) {
    var cs = isObj(spec) && Array.isArray(spec.counters) ? spec.counters : null; if (!isObj(v) || !cs) return null;
    var out = {}, n = 0;
    cs.forEach(function(t) { if (!isObj(t) || !isObj(t.timer) || typeof t.key !== 'string' || !Object.prototype.hasOwnProperty.call(v, t.key)) return; var x = v[t.key]; if (typeof x === 'number' && fin(x) && x > 0) { out[t.key] = Math.min(1e9, x); n++; } });
    return n ? out : null;
}
function rowCt(r, t) { return isObj(r) && isObj(r.ct) && typeof r.ct[t.key] === 'number' ? r.ct[t.key] : (typeof t.def === 'number' ? t.def : 0); }   // R2: a row's counter (none stored: its start)
function rowFacts(o, e, spec) {
    var lv = lvlNum(e.lvl); if (lv !== undefined && typeof e.lvl === 'number') o.lvl = isObj(spec) && isObj(spec.lvl) ? lvlClamp(spec.lvl, lv) : lv;
    if (typeof e.on === 'boolean') o.on = e.on;
    var nt = cutText(e.note, LIMITS.rowNote); if (nt) o.note = nt;
    if (typeof e.paid === 'number' && fin(e.paid) && e.paid >= 0 && e.paid <= LIMITS.statAbs) o.paid = e.paid;
    var ct = cleanCt(e.ct, spec); if (ct) o.ct = ct;   // Stage 6 HUD R2: its counters
    var tt = cleanTt(e.tt, spec); if (tt) o.tt = tt;   // 1.6.0: the part of a step its timed counters have lived
    if (typeof e.in === 'string' && ROW_ID.test(e.in)) o.in = e.in;   // 1.6.0 R14: a part, by its host row's id
    if (typeof e.gr === 'string' && ROW_ID.test(e.gr)) o.gr = e.gr;   // 1.6.0 (v2, B4): a row another row granted, by that row's id (applyRowOp)
    var slF = lvlNum(e.sl); if (slF !== undefined && typeof e.sl === 'number') o.sl = isObj(spec) && isObj(spec.lvl) ? lvlClamp(spec.lvl, slF) : slF;   // 1.6.0: the level it started at (Row.startlvl; applyRowOp stamps it where its list keeps the starting level, as a level is kept)
    if (e.mk === 1) o.mk = 1;   // 1.6.0 (v2, B5): added while its character was in the making (applyRowOp stamps it; nothing on the wire names it)
    if (e.ag === 1 && e.lnk === 1) o.ag = 1;   // 193: an owner's inline copy held again under a name (only there: the host reads its own row)
    if (typeof e.opn === 'string' && ROW_ID.test(e.opn)) o.opn = e.opn;   // 1.5.8: a row another row opens (openSync), by that row's id   // F4c1: what one cost when it was added (kept while the list has no price, as a level is)
}
// Stage 6 F4c2: a linked copy's own values (ov), by shape — only the fields deliberately changed on this copy (the host drops one equal to the
// copy's base): its name, icon, category, notes, its list's stats (held: the ones the GM set, which its owner's Setting A leaves alone), a
// blast, the damage and cost formulas, its own removal and switch locks (none: free, whatever the library says) and their messages. Never vis,
// key, level or throw skill: secrecy and addressing stay the library's. spec: the list's options (no stats without them); spec true: compare
// only (every stat by the key rule). A plain object in this key order, each key only when set; null when nothing is left
function cleanOv(v, spec) {
    if (!isObj(v)) return null;
    var o = {}, nm = cutText(v.name, LIMITS.itemName), ic = cleanIcon(v.icon), ca = cutText(v.category, LIMITS.category);
    if (nm) o.name = nm;
    if (ic) o.icon = ic;
    if (ca) o.category = ca;
    if (typeof v.notes === 'string') { var nt = str(v.notes, LIMITS.text).replace(CTRL_RE_G, ' '); if (nt.trim()) o.notes = nt; }
    var st = spec === true ? cleanEntryStats(v.stats, null, 'labels') : rowStats(v.stats, spec); if (st) o.stats = st;
    if (st && Array.isArray(v.held)) { var hs = map(), hl = []; v.held.slice(0, LIMITS.entryStats * 4).forEach(function(h) { if (typeof h === 'string') hs[lower(h)] = 1; }); Object.keys(st).forEach(function(k) { if (hs[lower(k)] === 1) hl.push(k); }); if (hl.length) o.held = hl; }
    if (isObj(v.area)) { var ft = cleanNum(v.area.ft, 0) | 0; if (ft > 0) o.area = { ft: clampNum(ft, 1, LIMITS.maxBlastFt), shape: 'circle', name: cutText(v.area.name, LIMITS.label) }; }
    var dm = cleanFormulaText(v.damage); if (dm) o.damage = dm;
    var co = cleanFormulaText(v.cost); if (co) o.cost = co;
    if (OV_LOCK[v.rm] === 1) o.rm = v.rm;
    var rmm = cutText(v.rmMsg, LIMITS.rmMsg); if (rmm) o.rmMsg = rmm;
    if (OV_LOCK[v.eq] === 1) o.eq = v.eq;
    var eqm = cutText(v.eqMsg, LIMITS.rmMsg); if (eqm) o.eqMsg = eqm;
    return Object.keys(o).length ? o : null;
}
// F4c2: what of a copy's own values its owner receives — the name, icon, category, notes, its list's stats (with which of them the GM set) and a
// blast; never the formulas or the locks (a whitelist: a later GM-only key stays home). In cleanOv's key order, never empty (null)
function ownOv(v, spec) { return isObj(v) ? cleanOv({ name: v.name, icon: v.icon, category: v.category, notes: v.notes, stats: v.stats, held: v.held, area: v.area }, spec) : null; }
// F4b: a row's level and switch as read (the sheet; F5a's formulas): a stored level, else the item's default level, else the list's; the
// switch as stored, else the list's "starts on" (an id-less legacy row follows it: critic 13). A kept-on curse is on.
function rowLvl(spec, row, def) { var l = isObj(spec) && isObj(spec.lvl) ? spec.lvl : null; if (isObj(row) && typeof row.lvl === 'number') return row.lvl; if (l && isObj(def) && typeof def.lvl === 'number') return lvlClamp(l, def.lvl); return l ? l.def : 0; }
function rowOn(spec, row) { if (isObj(row) && typeof row.on === 'boolean') return row.on; return !!(isObj(spec) && isObj(spec.on) && spec.on.def === true); }
// F4c1: a row's stat as read (the sheet; F5a's formulas) — the definition the row draws from (rowDef: the library entry, a deleted one's copy, its
// own), else the stat's default, else 0; the key as the list spells it. What one cost: as recorded when added (the GM may correct it), else the
// list price (never below 0), else 0
function rowStat(spec, def, key) {
    var k = typeof key === 'string' ? key : '', st = null; if (!k) return 0;
    (isObj(spec) && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (!st && isObj(s) && typeof s.key === 'string' && lower(s.key) === lower(k)) st = s; });
    if (st) k = st.key;
    var v, ds = isObj(def) && isObj(def.stats) ? def.stats : null;
    if (st && st.kind === 'pick') { var pv = ds && typeof ds[k] === 'string' ? ds[k] : ''; if (!pv && ds) Object.keys(ds).forEach(function(dk) { if (!pv && lower(dk) === lower(k) && typeof ds[dk] === 'string') pv = ds[dk]; }); var pm = null; (st.opts || []).forEach(function(o) { if (!pm && lower(o.label) === lower(pv)) pm = o.label; }); return pm || (typeof st.def === 'string' ? st.def : '');   // F5a2: a choice reads its option's label (else the default, else none)
    }
    if (ds && Object.prototype.hasOwnProperty.call(ds, k)) v = ds[k];
    else if (ds) { var lk = lower(k), dk = Object.keys(ds); for (var i = 0; i < dk.length; i++) if (lower(dk[i]) === lk) { v = ds[dk[i]]; break; } }   // another spelling of the key (one per system since critic 2; a file from before reads the same)
    if (typeof v === 'number' && fin(v)) return v;
    return st && typeof st.def === 'number' && fin(st.def) ? st.def : 0;
}
// 1.5.4 One row on at a time (SITE_EQUIVALENT_PLAN fold 2): a list's switch with one (the whole list) or per (one for each value of a stat of the
// list). onGroup: a row's group, the stat as the row reads it (rowStat: a number, or a choice's label), or null on a list with neither. read: the
// list options the stat is read by, else spec. A player's own change is grouped by their own view of the list (applyRowOp: actorSpec), on the
// host and on their own app alike (the review of fold 2): a choice's option that the players' view drops reads there as that view reads it, so
// both machines put a row in the same group
function onGroup(sys, spec, row, read) {
    var sw = isObj(spec) && isObj(spec.on) ? spec.on : null; if (!sw || !isObj(row)) return null;
    if (typeof sw.over === 'string' && sw.over) { var rdO = rowDef(sys, row), mO = overSet(rowStat(isObj(read) ? read : spec, rdO ? rdO.def : null, sw.over)); return mO ? 'm' + mO : null; }   // 1.6.0 O1: its set of places, none contending with nothing
    if (typeof sw.per === 'string' && sw.per) { var rd = rowDef(sys, row), v = rowStat(isObj(read) ? read : spec, rd ? rd.def : null, sw.per); return typeof v === 'number' ? 'n' + v : 's' + lower(String(v)); }
    return sw.one === true ? '*' : null;
}
// 1.6.0 O1 (the campaign build: two body plates both counted their DR): a switch's over names a number stat of the list read as a SET of
// places, one bit a place, place i named by the stat's value name i (OVER_PLACES at most). Switching a row on switches off every other row on
// that shares a place with it, and a row with no place contends with nothing (onGroup answers 'm' and the set, onClash the meeting). The rest
// of the one rule holds whole: a bound row refuses, a kept curse stays on, a row coming in on comes in off where it meets one. The same in both
// views. What came off is said (extra.offRows, overSays)
var OVER_PLACES = 16;
function overSet(v) { return typeof v === 'number' && fin(v) ? Math.floor(Math.abs(v)) & 0xFFFF : 0; }
function onClash(a, b) { if (a === null || b === null) return false; if (a.charAt(0) === 'm' && b.charAt(0) === 'm') return (Number(a.slice(1)) & Number(b.slice(1))) !== 0; return a === b; }
function overNames(st, set) { var L = isObj(st) && Array.isArray(st.labels) ? st.labels : [], out = []; for (var i = 0; i < OVER_PLACES; i++) if ((set >> i) & 1) out.push((typeof L[i] === 'string' && L[i]) || 'Place ' + (i + 1)); return out; }
function overSays(o) { return isObj(o) ? String(o.off) + ' came off: ' + String(o.on) + ' is worn on ' + String(o.at) + '.' : ''; }
function onName(sys, row) { var rd = rowDef(sys, row); return (rd && rd.def && typeof rd.def.name === 'string' && rd.def.name) || 'Item'; }
// What a player is told when a bound row of the group holds it (the review of fold 2: the words name both rows), and when a bound row that is
// on would be moved by a change of its stat into a group that holds one on. msg: the GM's own message for the lock, after them
function onStaysSays(bound, on, msg) { return bound + ' is bound and stays on, so ' + on + ' stays off.' + (msg ? ' ' + msg : ''); }
function onMovedSays(bound, msg) { return bound + ' is bound and stays on. Another row of that group is on, so that change is not made.' + (msg ? ' ' + msg : ''); }
// THE ONE RULE: row idx of the working list has just been switched on, so every other row of its group that is on is switched off, in the
// same change (applyRowOp's set of facts.on true is the only way a row is switched on: the GM's hand, a player's own change on the host and
// on their own app, a file that fills a character). A row the GM keeps on is never switched off by it: a kept curse (keptOn) or a row a
// player dropped and the GM keeps (hid). hand 'player': a player's own change of a character in play, so each row's equip lock holds as
// their own switch-off would: a bound row stays and the whole change is refused (words that name it and the row switched on, by: that row's
// name), unless it is inside its grace (o.grace(rowId), the host's own record), when it goes and the grace is spent (extra.graceSpent: their
// ids); a curse-on-contact row looks off to them and stays on, said in fields of its own (keptOn, keptMsg, keptName), apart from what the
// row switched on carries. A row on only by the list's "starts on" was never switched on, so no lock holds it. o.read: the list options its
// stat is read by (onGroup). null once done, else the refusal
// 1.5.8 (the owner, 2026-10-25): whether a row's switch may be switched on, by the list switch's needs (spec.on.needs), worked out with the
// character as it stands and the row's own names (Row.*), as a list roll's needs are: no dice, and a formula that cannot be worked out holds it back
function switchOk(sys, char, f, row, text, F) {
    if (typeof text !== 'string' || !text) return true; if (!F || typeof F.evaluate !== 'function') return false;
    try { var r = makeResolver(sys, char, F, null); return !!(r && typeof r.needsOk === 'function' && r.needsOk(f, row, text)); } catch (e) { return false; }
}
function onlyOne(sys, spec, list, idx, hand, extra, o) {
    o = isObj(o) ? o : {};
    var g = onGroup(sys, spec, list[idx], o.read), spent = []; if (g === null) return null;
    for (var j = 0; j < list.length; j++) {
        var r = list[j], gj = isObj(r) ? onGroup(sys, spec, r, o.read) : null; if (j === idx || !isObj(r) || r.hid === 1 || r.keptOn === 1 || !rowOn(spec, r) || !onClash(g, gj)) continue;
        var rd = hand === 'player' && r.on === true ? rowDef(sys, r) : null, em = rd && rd.def && RM_MODES[rd.def.eq] === 1 ? rd.def.eq : '', msg = em && typeof rd.def.eqMsg === 'string' ? rd.def.eqMsg : '';
        if (em === 'bound') { if (!(typeof o.grace === 'function' && o.grace(rowIdOf(r)) === true)) { var bn = rd.def.name || 'Item', on = onName(sys, list[idx]); return { ok: false, reason: 'stays', msg: onStaysSays(bn, on, msg), name: bn, eq: true, by: on }; } spent.push(rowIdOf(r)); }   // inside its grace it goes, as its own switch-off would
        else if (em === 'curse') { r.keptOn = 1; if (isObj(extra) && extra.keptOn !== true) { extra.keptOn = true; extra.keptMsg = msg; extra.keptName = rd.def.name || 'Item'; } continue; }
        r.on = false;
        if (g.charAt(0) === 'm' && isObj(extra)) { var ovSt = null; (Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (!ovSt && isObj(s) && s.key === spec.on.over) ovSt = s; }); (extra.offRows = extra.offRows || []).push({ off: onName(sys, r), on: onName(sys, list[idx]), at: overNames(ovSt, Number(g.slice(1)) & Number(gj.slice(1))).join(', ') }); }   // 1.6.0 O1: what came off, and where
    }
    if (spent.length && isObj(extra)) extra.graceSpent = spent;
    return null;
}
// ... and a row that comes in on (a new row of a list that starts on) comes in off while another row of its group is on (one the GM keeps on
// counts for nothing, as its owner sees it off). true: it starts off. read: as onGroup's
function onHeld(sys, spec, list, idx, read) {
    var g = onGroup(sys, spec, list[idx], read); if (g === null) return false;
    for (var j = 0; j < list.length; j++) { var r = list[j]; if (j !== idx && isObj(r) && r.hid !== 1 && r.keptOn !== 1 && rowOn(spec, r) && onClash(g, onGroup(sys, spec, r, read))) return true; }
    return false;
}
// ... and a row that is on, moved into another group by a change of its stat (an ov op, a custom op on a row that is there; the review of fold
// 2), comes into it as a new row does: off while that group holds one on (onHeld). g0: its group before the change. For a player's own change
// of a character in play its own equip lock holds as their own switch-off would: bound refuses the change (moved: true), unless it is inside
// its grace (o.onGrace), when it goes and the grace is spent; curse on contact keeps it on, out of their sight. A row the GM keeps on is left
// as it is. null once done, else the refusal
function onMoved(sys, spec, list, idx, g0, hand, extra, o) {
    o = isObj(o) ? o : {};
    var r = list[idx]; if (!isObj(r) || r.hid === 1 || r.keptOn === 1 || !rowOn(spec, r)) return null;
    var g = onGroup(sys, spec, r, o.read); if (g === null || g === g0 || !onHeld(sys, spec, list, idx, o.read)) return null;
    var rd = hand === 'player' && r.on === true ? rowDef(sys, r) : null, em = rd && rd.def && RM_MODES[rd.def.eq] === 1 ? rd.def.eq : '', msg = em && typeof rd.def.eqMsg === 'string' ? rd.def.eqMsg : '';
    if (em === 'bound') { if (o.onGrace !== true) { var bn = rd.def.name || 'Item'; return { ok: false, reason: 'stays', msg: onMovedSays(bn, msg), name: bn, eq: true, moved: true }; } if (isObj(extra)) extra.onGraceUsed = true; }
    else if (em === 'curse') { r.keptOn = 1; if (isObj(extra) && extra.keptOn !== true) { extra.keptOn = true; extra.keptMsg = msg; extra.keptName = rd.def.name || 'Item'; } return null; }
    r.on = false;
    return null;
}
// 1.6.0 At most at a level (the owner, by prompt, 2026-10-29: "Passes, and the GM is told", "At the level, or that and higher"): a list's level
// may cap how many of its rows stand at a level, spec.lvl.caps [{ at, n, up }]: at most n rows at the level at, or at it and higher (up).
// lvlCapHit is the one judge, asked by applyRowOp wherever a row comes to stand at a level: a new row (an add that makes a row, a split, a
// restore, a custom row made) and a level changed (set). A cap is judged only where the change brings that row into it (was: its level before,
// absent for a new row), so a list over a cap already refuses nothing else. A kept curse (hid) counts for nothing; a granted row counts, though
// a grant is never refused by it, nor a trade. null, or { cap, have }: the first cap broken. A player's change, a character in the making's
// too, is refused in lvlCapSays' words; the GM's hand passes and is told (extra.capSays). A file that fills a character is not judged
function lvlIn(c, v) { return typeof v === 'number' && fin(v) && (c.up === true ? v >= c.at - 1e-9 : Math.abs(v - c.at) < 1e-9); }
function lvlCapHit(sys, spec, list, idx, was) {
    var caps = isObj(spec) && isObj(spec.lvl) && Array.isArray(spec.lvl.caps) ? spec.lvl.caps : null; if (!caps || !caps.length || !isObj(list[idx])) return null;
    var lv = function(r) { var rd = rowDef(sys, r); return rowLvl(spec, r, rd ? rd.def : null); }, now = lv(list[idx]);
    for (var i = 0; i < caps.length; i++) {
        var c = caps[i]; if (!isObj(c) || !lvlIn(c, now) || lvlIn(c, was)) continue;
        var have = 0; list.forEach(function(r) { if (isObj(r) && r.hid !== 1 && lvlIn(c, lv(r))) have++; });
        if (have > c.n) return { cap: c, have: have };
    }
    return null;
}
function lvlCapSays(f, spec, hit, gm) {
    var c = hit.cap, L = isObj(spec) && isObj(spec.lvl) ? spec.lvl : {}, nm = '';
    if (Array.isArray(L.labels)) { var li = Math.round((c.at - (typeof L.min === 'number' ? L.min : 0)) / (L.step > 0 ? L.step : 1)); if (typeof L.labels[li] === 'string') nm = L.labels[li]; }
    var at = (nm || (L.label || 'Level') + ' ' + fmtNum(c.at)) + (c.up === true ? ' or higher' : '');
    return ((isObj(f) && f.label) || 'This list') + ' holds ' + (c.n === 0 ? 'no row' : 'at most ' + c.n + (c.n === 1 ? ' row' : ' rows')) + ' at ' + at + '.' + (gm ? ' Now it holds ' + hit.have + '.' : '');
}
function rowPaid(spec, row, def) { if (isObj(row) && typeof row.paid === 'number' && fin(row.paid)) return row.paid; return isObj(spec) && typeof spec.price === 'string' && spec.price ? Math.max(0, rowStat(spec, def, spec.price)) : 0; }
function catIn(cats, c) { var l = lower(cutText(c, LIMITS.category)); return !!l && cats.some(function(x) { return lower(x) === l; }); }
// Stage 6 F4c2: a definition with a copy's own values over it (the library entry, or a deleted one's copy) — a new object, base untouched; base
// itself when there are none. The texts and formulas set replace the base's, a blast replaces its blast, stats merge per key; a lock of none
// lifts the base's (with its message), a mode replaces it, a message replaces the base's while a lock holds. Never vis, key, level or throw skill
function mergeOv(base, ov) {
    if (!isObj(base) || !isObj(ov)) return base;
    var d = Object.assign({}, base);
    ['name', 'icon', 'category', 'notes', 'damage', 'cost'].forEach(function(k) { if (typeof ov[k] === 'string' && ov[k]) d[k] = ov[k]; });
    if (isObj(ov.area)) d.area = Object.assign({}, ov.area);
    if (isObj(ov.stats)) d.stats = Object.assign({}, isObj(base.stats) ? base.stats : {}, ov.stats);
    [['rm', 'rmMsg'], ['eq', 'eqMsg']].forEach(function(p) { var m = ov[p[0]]; if (m === 'none') { delete d[p[0]]; delete d[p[1]]; return; } if (RM_MODES[m] === 1) d[p[0]] = m; if (RM_MODES[d[p[0]]] === 1 && typeof ov[p[1]] === 'string' && ov[p[1]]) d[p[1]] = ov[p[1]]; });
    return d;
}
// The definition a row draws and throws from: the library entry, else the deleted entry's copy, else the row's own. { def, src, base } or null.
// F4c2: def carries the copy's own values over base (the entry, the copy); without them def is base itself (the library object)
// Stage 6 library L1d: which library entries the system's formulas address by key — every List.Key.<name> in any text of the system (fields,
// rolls, the sheet, the combat card, the effects, and since the review of the fold of 409 the point budgets; a stray match in a note only adds an entry), for each item list, not already one of the system's items in that list's
// scope — found through lookup(lowerKey) → the library's entries with that key (the first in the list's categories wins). At most
// LIMITS.core entries and LIMITS.coreBytes (the rest are left out: over: the count). Returns { core, over }. 126b: a rule (an entry's formula
// prerequisite) is such a text too: an item's own is read here, and more holds the rules of the library's entries, which the caller hands in.
// coreKeys: the keys each item list's names address in those texts, [{ f, keys }] in the system's order of fields, keys a map of lower-case keys
// in the order they are first met (coreOf; a reader of a sheet file, for a trait whose effects the system's own formulas work out)
function coreKeys(sys, more) {
    var out = []; if (!isObj(sys)) return out;
    var texts = []; var walk = function(v, d) { if (d > 12) return; if (typeof v === 'string') { if (v.indexOf('.') > 0) texts.push(v); return; } if (Array.isArray(v)) v.forEach(function(x) { walk(x, d + 1); }); else if (isObj(v)) Object.keys(v).forEach(function(k) { walk(v[k], d + 1); }); };
    ['fields', 'rolls', 'sheet', 'combat', 'effects', 'budgets'].forEach(function(k) { walk(sys[k], 0); });
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) { if (isObj(it) && typeof it.needsIf === 'string' && it.needsIf.indexOf('.') > 0) texts.push(it.needsIf); });
    (Array.isArray(more) ? more : []).forEach(function(t) { if (typeof t === 'string' && t.indexOf('.') > 0) texts.push(t); });
    var all = texts.join('\n');
    (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list' || typeof f.key !== 'string') return;
        var re = new RegExp('(^|[^A-Za-z0-9_.])' + f.key.replace(/[^A-Za-z0-9_]/g, '') + '\\.([A-Za-z][A-Za-z0-9_]{0,39})\\.[A-Za-z]', 'gi'), m, keys = map();
        while ((m = re.exec(all))) { var k = lower(m[2]); if (LIST_WORDS[k] !== 1) keys[k] = 1; }   // List.on.*, List.max.*, List.min.* address no entry (1.5.4: max and min, as on)
        out.push({ f: f, keys: keys });
    });
    return out;
}
function coreOf(sys, lookup, more) {
    var out = [], seen = map(), over = 0, bytes = 0; if (!isObj(sys) || typeof lookup !== 'function') return { core: out, over: 0 };
    var items = Array.isArray(sys.items) ? sys.items : [];
    coreKeys(sys, more).forEach(function(fk) {
        var f = fk.f, keys = fk.keys, cats = isObj(f.list) && Array.isArray(f.list.cats) && f.list.cats.length ? f.list.cats : null;
        Object.keys(keys).forEach(function(k) {
            var inScope = function(it) { return isObj(it) && typeof it.key === 'string' && lower(it.key) === k && (!cats || catIn(cats, it.category)); };
            if (items.some(inScope)) return;
            var found = lookup(k); (Array.isArray(found) ? found : []).some(function(e) {
                if (!inScope(e) || typeof e.id !== 'string' || seen[e.id]) return false;
                var nb = JSON.stringify(e).length; if (out.length >= LIMITS.core || bytes + nb > LIMITS.coreBytes) { over++; return true; }
                seen[e.id] = 1; bytes += nb; out.push(e); return true;
            });
        });
    });
    return { core: out, over: over };
}
// Stage 6 library L1c: the GM machine's library, looked up after the system's own items (library.js registers it; a player's machine
// has none: their rows carry the host's copies). Rows that point at a library entry keep their copy (snap), so they survive any load order
var _libFind = null;
function setLibraryFind(fn) { _libFind = typeof fn === 'function' ? fn : null; }
// 1.6.0 (v2, B4; the SotMW session's v2 sort, 2026-10-29: a trait tier's fixed kit, a species' free package rows, an implant's mandatory flaws):
// what a row of an entry grants. At most GRANT_MAX of { list: an item list's field id, entry: an item or a library entry by id, qty: how many,
// from: the level of THIS entry from which it grants (none: from the start) }, each list, entry and level once, never the entry itself. kinds:
// the view's fields by id (fieldKinds), so a grant on a list the view lacks goes; none: the key rule alone. None: undefined
var GRANT_MAX = 8, GRANT_DEPTH = 3;
function cleanGrants(v, kinds, self) {
    if (!Array.isArray(v)) return undefined;
    var out = [], seen = map();
    v.slice(0, 32).forEach(function(g) {
        if (out.length >= GRANT_MAX || !isObj(g) || typeof g.list !== 'string' || !FIELD_ID.test(g.list) || typeof g.entry !== 'string' || !ITEM_ID.test(g.entry) || g.entry === self) return;
        if (isObj(kinds) && kinds[g.list] !== 'item-list') return;
        var o = { list: g.list, entry: g.entry, qty: clampNum(Math.round(cleanNum(g.qty, 1)) || 1, 1, LIMITS.maxQty) }, fr = typeof g.from === 'number' ? lvlNum(g.from) : undefined; if (fr !== undefined) o.from = fr;
        var k = o.list + '|' + o.entry + '|' + (fr === undefined ? '' : fr); if (seen[k]) return; seen[k] = 1;
        out.push(o);
    });
    return out.length ? out : undefined;
}
// A players' view of a definition never names an entry players cannot see: a grant of one is left out of it (the host still grants it).
// shown(id): whether players may see that entry; with no judge every grant goes
function hideGrants(def, shown) {
    if (!isObj(def) || !Array.isArray(def.grants)) return def;
    var keep = def.grants.filter(function(g) { return isObj(g) && typeof shown === 'function' && shown(g.entry) === true; });
    if (keep.length) def.grants = keep; else delete def.grants;
    return def;
}
// What a definition's grants hold at a level: { 'list|entry': { list, entry, qty } }, the quantities of one entry on one list added. A grant
// with a from holds only at that level or above (a list with no levels reads 0)
function grantWant(def, lvl) {
    var at = typeof lvl === 'number' && fin(lvl) ? lvl : 0, out = map();
    (isObj(def) && Array.isArray(def.grants) ? def.grants : []).forEach(function(g) {
        if (!isObj(g) || typeof g.list !== 'string' || typeof g.entry !== 'string' || (typeof g.from === 'number' && at < g.from)) return;
        var k = g.list + '|' + g.entry, n = clampNum(cleanNum(g.qty, 1) | 0, 1, LIMITS.maxQty);
        if (out[k]) out[k].qty = clampNum(out[k].qty + n, 1, LIMITS.maxQty); else out[k] = { list: g.list, entry: g.entry, qty: n };
    });
    return out;
}
function itemListIds(sys) { return (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list' && typeof f.id === 'string'; }).map(function(f) { return f.id; }); }
// The rows a row granted, and the rows those granted in turn, by their ids: a seed of ids, grown over every item list of values
function grantIds(sys, values, seed) {
    var ids = Object.assign(map(), seed), fids = itemListIds(sys), grew = true, n = 0;
    while (grew && n++ < 8) { grew = false; fids.forEach(function(fid) { (isObj(values) && Array.isArray(values[fid]) ? values[fid] : []).forEach(function(r) { var id = rowIdOf(r); if (isObj(r) && typeof r.gr === 'string' && ids[r.gr] === 1 && id && ids[id] !== 1) { ids[id] = 1; grew = true; } }); }); }
    return ids;
}
// For a granting row's Undo (as partsKept is for a host's parts): the rows it granted, and theirs, as they stood, { rows: [{ f, row, at }] } by
// their places in each list, kept ones too; or null
function grantsKept(sys, values, rid) {
    if (!isObj(values) || typeof rid !== 'string') return null;
    var seed = map(); seed[rid] = 1; var ids = grantIds(sys, values, seed), rows = [];
    itemListIds(sys).forEach(function(fid) { (Array.isArray(values[fid]) ? values[fid] : []).forEach(function(r, ix) { if (isObj(r) && typeof r.gr === 'string' && ids[r.gr] === 1 && rowIdOf(r) !== rid) rows.push({ f: fid, row: JSON.parse(JSON.stringify(r)), at: ix }); }); });
    return rows.length ? { rows: rows } : null;
}
// The lists one row op's grants work on: the op's own list in place, another as a copy (as a part's or a load's change left it), each changed
// one written into extra.also by end
function grantLists(sys, char, f, list, extra) {
    var got = map(), W = { touched: map() };
    W.get = function(fid) {
        if (fid === f.id) return list;
        if (got[fid]) return got[fid];
        var tf = fieldById(sys, fid); if (!tf || tf.kind !== 'item-list') return null;
        var src = isObj(extra.also) && Array.isArray(extra.also[fid]) ? extra.also[fid] : isObj(char) && isObj(char.values) && Array.isArray(char.values[fid]) ? char.values[fid] : [];
        return (got[fid] = JSON.parse(JSON.stringify(src)));
    };
    W.end = function(vo) {
        var ok = true; Object.keys(W.touched).forEach(function(fid) { if (fid === f.id || !got[fid]) return; var v = cleanValue(fieldById(sys, fid), got[fid], vo); if (v === undefined) { ok = false; return; } extra.also = isObj(extra.also) ? extra.also : {}; extra.also[fid] = v; });
        return ok;
    };
    return W;
}
// Takes out the rows the seed's rows granted, and theirs (withSeed: the seed's own rows too). keptTo: a kept curse's id, the rows then kept as
// it is, hidden from its player under ids they never held, each still marked by the row that grants it
function grantCut(sys, W, seed, withSeed, keptTo) {
    var fids = itemListIds(sys), vals = map(); fids.forEach(function(fid) { var L = W.get(fid); if (L) vals[fid] = L; });
    var ids = grantIds(sys, vals, seed), hit = function(r) { return isObj(r) && ((typeof r.gr === 'string' && ids[r.gr] === 1) || (withSeed && seed[rowIdOf(r)] === 1)); }, nu = map();
    if (keptTo) { Object.keys(seed).forEach(function(k) { nu[k] = keptTo; }); fids.forEach(function(fid) { (vals[fid] || []).forEach(function(r) { if (hit(r)) nu[rowIdOf(r)] = uid('w_'); }); }); }
    fids.forEach(function(fid) {
        var L = vals[fid]; if (!L) return; var keep = [], did = false;
        L.forEach(function(r) { if (!hit(r)) { keep.push(r); return; } did = true; if (keptTo) { var kr = JSON.parse(JSON.stringify(r)); kr.id = nu[rowIdOf(r)]; kr.gr = nu[r.gr] || keptTo; kr.hid = 1; keep.push(kr); } });
        if (did) { L.length = 0; keep.forEach(function(r) { L.push(r); }); W.touched[fid] = 1; }
    });
}
// A row granted: a row of its own, at Paid 0, marked by the row that grants it (gr), its level, switch and making mark as an add writes them.
// On a list that holds each entry once, an entry already held is not granted again. Then what it grants in turn, GRANT_DEPTH deep at most.
// Answers null, or a refusal when the list has no room
function grantAdd(sys, W, g, qty, rid, ctx, depth) {
    var ent = itemDef(sys, g.entry), fromLib = false; if (!ent) { ent = libFind(g.entry); fromLib = isObj(ent); } if (!isObj(ent)) return null;   // an entry that is gone grants nothing
    var tf = fieldById(sys, g.list), sp = tf && isObj(tf.list) ? tf.list : null, L = W.get(g.list); if (!L) return null;
    if (sp && sp.noQty && !sp.multi && L.some(function(r) { return isObj(r) && r.defId === g.entry && r.hid !== 1 && typeof r.opn !== 'string'; })) return null;
    if (L.filter(function(r) { return !(isObj(r) && r.hid === 1); }).length >= LIMITS.carried) return { ok: false, reason: 'value', msg: 'No room on ' + (tf.label || 'that list') + ' for ' + (ent.name || 'what it grants') + '.' };
    var id = uid('w_'); while (L.some(function(r) { return rowIdOf(r) === id; })) id = uid('w_');
    var row = { id: id, defId: g.entry, qty: sp && sp.noQty ? 1 : clampNum(qty, 1, LIMITS.maxQty), gr: rid };
    if (ctx.mk) row.mk = 1;
    if (sp && isObj(sp.lvl)) row.lvl = lvlClamp(sp.lvl, typeof ent.lvl === 'number' ? ent.lvl : sp.lvl.def);
    startStamp(sp, row);   // 1.6.0: Keeps the starting level
    if (sp && isObj(sp.on)) row.on = sp.on.def === true;
    if (sp && sp.price) row.paid = 0;
    if (fromLib) row.snap = cleanRowDef(ent, true);
    L.push(row); W.touched[g.list] = 1;
    if (row.on === true && onHeld(sys, sp, L, L.length - 1, sp)) row.on = false;   // 1.5.4 One at a time: it starts off while its group holds one on
    if (depth < GRANT_DEPTH) { var w1 = grantWant(ent, rowLvl(sp, row, ent)); if (Object.keys(w1).length) return grantMove(sys, W, id, map(), w1, ctx, depth + 1); }
    return null;
}
// A granting row's grants moved from what they held (w0) to what they hold now (w1), each entry on each list: rows granted where none were,
// a quantity moved by the difference, rows taken out (with what they granted) where it holds none now
function grantMove(sys, W, rid, w0, w1, ctx, depth) {
    var keys = Object.keys(w0).concat(Object.keys(w1).filter(function(k) { return !w0[k]; }));
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i], a = w0[k] ? w0[k].qty : 0, b = w1[k] ? w1[k].qty : 0, g = w1[k] || w0[k]; if (a === b) continue;
        var L = W.get(g.list); if (!L) continue;
        var mine = L.filter(function(r) { return isObj(r) && r.gr === rid && r.defId === g.entry && r.hid !== 1; });
        if (b === 0 || (mine.length && (mine[0].qty | 0) + b - a <= 0)) { var sd = map(); mine.forEach(function(r) { sd[rowIdOf(r)] = 1; }); if (mine.length) grantCut(sys, W, sd, true, ''); continue; }
        if (mine.length) { var tf = fieldById(sys, g.list); if (!(tf && isObj(tf.list) && tf.list.noQty)) { mine[0].qty = clampNum((mine[0].qty | 0) + b - a, 1, LIMITS.maxQty); W.touched[g.list] = 1; } continue; }
        if (b > a) { var r0 = grantAdd(sys, W, g, a ? b - a : b, rid, ctx, depth); if (r0) return r0; }
    }
    return null;
}
// ... put back for a granting row's Undo: each kept row by its place, ascending, never one whose id its list already holds, and only rows
// granted by that row or by one put back with it
function grantsPut(sys, W, kept, rid) {
    if (!isObj(kept) || !Array.isArray(kept.rows)) return;
    var ok = map(); ok[rid] = 1; var rows = kept.rows.filter(function(p) { return isObj(p) && typeof p.f === 'string' && isObj(p.row) && typeof p.row.gr === 'string' && !!rowIdOf(p.row); }).slice(0, LIMITS.carried);
    rows.forEach(function(p) { ok[rowIdOf(p.row)] = 1; });
    rows.filter(function(p) { return ok[p.row.gr] === 1; }).sort(function(a, b) { return (cleanNum(a.at, 0) | 0) - (cleanNum(b.at, 0) | 0); }).forEach(function(p) {
        var L = W.get(p.f), pid = rowIdOf(p.row); if (!L || L.some(function(r) { return rowIdOf(r) === pid; })) return;
        L.splice(Math.max(0, Math.min(L.length, cleanNum(p.at, L.length) | 0)), 0, JSON.parse(JSON.stringify(p.row))); W.touched[p.f] = 1;
    });
}
// 1.6.0 (v2, B4): whether a player's own app sends a change and waits for its host's word (net.charItem), as a part's add does: an add of an
// entry that grants rows, as this app reads it, and a removal of a row that granted rows on this copy. The host grants; this app never does
function grantWaits(sys, char, q, lib) {
    if (!isObj(q)) return false;
    if (q.op === 'add' && typeof q.defId === 'string') { var e = itemDef(sys, q.defId) || (typeof lib === 'function' ? lib(q.defId) : null); return isObj(e) && Array.isArray(e.grants) && e.grants.length > 0; }
    if ((q.op === 'remove' || q.op === 'setQty') && typeof q.rowId === 'string') { var vs = isObj(char) && isObj(char.values) ? char.values : {}; return itemListIds(sys).some(function(fid) { return (Array.isArray(vs[fid]) ? vs[fid] : []).some(function(r) { return isObj(r) && r.gr === q.rowId; }); }); }
    return false;
}
function libFind(id) { if (!_libFind) return null; var e = _libFind(id); return isObj(e) ? e : null; }
// 126b: the GM machine's judge of whether players may read an entry's rule (library.js registers it; a player's machine has none)
var _ruleJudge = null;
function setRuleJudge(fn) { _ruleJudge = typeof fn === 'function' ? fn : null; }
// 1.5.8 (book handoff 90): the rows other rows open, kept in step, on the machine that owns the character. A row that is on (or of a list with
// no switch) whose entry opens entries (cleanOpens) at its level or above opens each on its list, unless that list holds a bought row of it: an
// opened row is { id, defId, qty: 1, lvl: the list's first level, snap, opn: the opening row's id }. One no longer opened goes. The first row
// that opens an entry is its source. Mutates char.values; answers the ids of the fields it changed (none: an empty list). lib: the entries
// by id (libFind on the GM's machine)
function openSync(sys, char, lib) {
    var changed = [];
    if (!isObj(sys) || !Array.isArray(sys.fields) || !isObj(char) || !isObj(char.values)) return changed;
    var look = typeof lib === 'function' ? lib : libFind, want = map();
    sys.fields.forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list') return;
        var spec = isObj(f.list) ? f.list : null, rows = Array.isArray(char.values[f.id]) ? char.values[f.id] : [];
        rows.forEach(function(r) {
            if (!isObj(r) || r.hid === 1 || typeof r.opn === 'string') return;
            var rd = rowDef(sys, r), d = rd ? rd.def : null; if (!isObj(d) || !Array.isArray(d.opens) || !d.opens.length) return;
            if (spec && isObj(spec.on) && !rowOn(spec, r)) return;
            var lv = rowLvl(spec, r, d); lv = typeof lv === 'number' && fin(lv) ? lv : 1;
            var rid = rowIdOf(r); if (!rid || !ROW_ID.test(rid)) return;
            d.opens.forEach(function(o) { if (!isObj(o) || lv < (o.from || 1)) return; var k = o.f + '|' + o.id; if (!want[k]) want[k] = { f: o.f, id: o.id, by: rid }; });
        });
    });
    sys.fields.forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list') return;
        var spec = isObj(f.list) ? f.list : null, rows = Array.isArray(char.values[f.id]) ? char.values[f.id] : [], next = [], did = false, held = map();
        rows.forEach(function(r) { if (isObj(r) && typeof r.opn !== 'string' && typeof r.defId === 'string' && r.hid !== 1) held[r.defId] = 1; });
        rows.forEach(function(r) {
            if (isObj(r) && typeof r.opn === 'string') { var w = want[f.id + '|' + r.defId]; if (!w || held[r.defId] || w.by !== r.opn) { did = true; return; } held['o|' + r.defId] = 1; }
            next.push(r);
        });
        Object.keys(want).forEach(function(k) {
            var w = want[k]; if (w.f !== f.id || held[w.id] || held['o|' + w.id]) return;
            var ent = itemDef(sys, w.id) || (look ? look(w.id) : null); if (!isObj(ent)) return;
            var base = 'w_o' + w.id.replace(/[^A-Za-z0-9]/g, '').slice(-21), id = base, n = 2;
            while (next.some(function(r) { return isObj(r) && rowIdOf(r) === id; }) && n < 100) id = (base.slice(0, 22) + n++);
            var row = { id: id, defId: w.id, qty: 1 };
            if (spec && isObj(spec.lvl)) row.lvl = lvlClamp(spec.lvl, typeof spec.lvl.min === 'number' ? spec.lvl.min : 1);
            startStamp(spec, row);   // 1.6.0: Keeps the starting level
            if (!itemDef(sys, w.id)) row.snap = cleanRowDef(ent, true);
            row.opn = w.by; next.push(row); did = true;
        });
        if (did) { char.values[f.id] = next; changed.push(f.id); }
    });
    return changed;
}
function rowDef(sys, row) {
    if (!isObj(row)) return null;
    if (typeof row.defId === 'string') { var it = itemDef(sys, row.defId) || libFind(row.defId); if (it) return { def: mergeOv(it, row.ov), src: 'lib', base: it }; if (isObj(row.snap)) return { def: mergeOv(row.snap, row.ov), src: 'lost', base: row.snap }; return null; }
    if (isObj(row.def)) return { def: row.def, src: row.lnk === 1 ? 'inline' : 'custom', base: row.def };
    return null;
}
// The owner's copy of a carried list (charFor): a visible entry as a pointer; a GM-only entry, or a deleted one's copy, inline with its
// players' fields only (the 5h rule: the owner's sheet, their rolls and the host agree); a custom row without its GM texts; a kept curse
// (hid) not at all. lib: the host's full items by id — without it a GM-only row is left out (fail closed). F4b: the facts go as stored, a
// curse the GM keeps on (keptOn) as switched off.
function projFacts(o, r) { if (isObj(r.ct)) o.ct = JSON.parse(JSON.stringify(r.ct)); if (typeof r.opn === 'string') o.opn = r.opn; if (typeof r.in === 'string') o.in = r.in; if (r.mk === 1) o.mk = 1; if (typeof r.sl === 'number') o.sl = r.sl; if (typeof r.gr === 'string') o.gr = r.gr;   // 1.6.0 R14: a part says its host on its owner's copy; 1.6.0 (v2, B5): a row made while making says so   // 1.5.8: an opened row says so on its owner's copy   // R2: its counters go as stored
 if (typeof r.lvl === 'number') o.lvl = r.lvl; if (typeof r.on === 'boolean') o.on = r.keptOn === 1 ? false : r.on; if (typeof r.note === 'string' && r.note) o.note = r.note; if (typeof r.paid === 'number') o.paid = r.paid; }   // F4c1: paid
// F4c1: an inline or custom copy's stats as its owner holds them — its list's (spec: the view's list options; none: no stats); spec true is compare
// only (sheets.js ownerSeesSame): every stat as the GM's machine holds it, so a change to one is never taken for "the same"
function ownStats(pd, src, spec) { if (spec === true) return; var st = isObj(src) ? rowStats(src.stats, spec) : null; if (st) pd.stats = st; else delete pd.stats; }
function projectRows(rows, view, lib, spec, ruleShown) {   // ruleShown (126b): the host's judge of whether a player's own app could work an entry's rule out; none: no rule travels
    if (!Array.isArray(rows)) return undefined;
    var chP1 = function(x) { var pl = projectRows([Object.assign({}, x, { id: 'w_rd', qty: 1 })], view, lib, null, ruleShown); if (!pl || !pl.length) return null; var y = pl[0]; delete y.id; delete y.qty; return y; };   // 1.5.9 Chambers from: a chambered round and the round last fired, as a row of their own list goes
    var chP = function(o, r) { if (!isObj(spec) || !isObj(spec.chamber)) return; var rr = (Array.isArray(r.rd) ? r.rd : []).map(chP1).filter(Boolean); if (rr.length) o.rd = rr; var ff = isObj(r.fd) ? chP1(r.fd) : null; if (ff) o.fd = ff; };
    var ldP = function(o, r) { chP(o, r); if (!isObj(spec) || !isObj(spec.load) || !isObj(r.ld)) return o; var pl = projectRows([Object.assign({}, r.ld, { id: 'w_ld', qty: 1 })], view, lib, null, ruleShown); if (pl && pl.length) { var x = pl[0]; delete x.id; delete x.qty; o.ld = x; } return o; };   // 1.5.8 Loads from: a loaded copy, as a row of its own list goes (a GM-only entry's inline, its players' fields only)
    var vis = map(); (view && Array.isArray(view.items) ? view.items : []).forEach(function(it) { if (isObj(it) && typeof it.id === 'string') vis[it.id] = 1; });
    var out = [], room = LIMITS.rowsText, ownRoom = LIMITS.ownText;   // 1.5.4: the long text this list's rows may carry in all (rows past it go without); 1.5.5 (155): the rows of the character's own, a room of their own
    rows.forEach(function(r) {
        if (!isObj(r) || r.hid === 1) return;
        var rid = rowIdOf(r); if (!rid) return;
        if (typeof r.defId === 'string') {
            if (vis[r.defId] === 1 && !r.snap) { var o = {}; if (r.id) o.id = r.id; o.defId = r.defId; o.qty = r.qty; projFacts(o, r); var oo = ownOv(r.ov, spec); if (oo) o.ov = oo; out.push(ldP(o, r)); return; }   // F4c2: its own values the owner may see
            var le = typeof lib === 'function' ? lib(r.defId) : (lib && Object.prototype.hasOwnProperty.call(lib, r.defId)) ? lib[r.defId] : null;   // L1c: the host's items, as a map or a lookup (the library's thousands are never copied into a map)
            var d = mergeOv(isObj(le) ? le : r.snap, r.ov), pd = cleanRowDef(d, false); if (!pd) return;   // F4c2: inline, with its own values folded in (then reduced to the players' fields)
            ownStats(pd, d, spec); viewMods(pd, view);
            if (isObj(le)) room -= rowText(pd, le, room);   // 1.5.4: the entry's description and levels, from the library as it is now — never a deleted entry's copy (it kept none), never a GM-only entry's
            var io = { id: rid, qty: r.qty }; projFacts(io, r); io.def = pd; io.lnk = 1;
            if (isObj(le) && le.again === 'name' && isObj(r.ov) && typeof r.ov.name === 'string' && r.ov.name.trim()) io.ag = 1;   // 193: Row.again on its owner's copy
            if (isObj(le) && le.vis !== 'gm') {   // 126b: for an entry players may see, src, the entry it came from: their own app then knows the character carries it (what another entry needs); a GM-only entry's id is never told
                io.src = r.defId;
                var cnP = cleanNeeds(le.needs), rnP = cnP ? hideNeeds({ needs: cnP }, function(id) { var x = typeof lib === 'function' ? lib(id) : (lib && Object.prototype.hasOwnProperty.call(lib, id)) ? lib[id] : null; return isObj(x) && x.vis !== 'gm'; }).needs : null;
                if (rnP) {   // ... and the needs of it that players may see, from the library as it is now, each with the needed entry's name: their sheet marks the row while one is not met, and says which, with nothing of the library loaded
                    rnP.forEach(function(n) { var x = typeof lib === 'function' ? lib(n.id) : (lib && Object.prototype.hasOwnProperty.call(lib, n.id)) ? lib[n.id] : null, nm = isObj(x) && typeof x.name === 'string' ? cutText(x.name, LIMITS.itemName) : ''; if (nm) n.name = nm; });
                    io.needs = rnP;
                }
                var rjP = typeof ruleShown === 'function' ? ruleShown : _ruleJudge; if (typeof le.needsIf === 'string' && le.needsIf && typeof rjP === 'function' && rjP(le.needsIf) === true) { io.needsIf = le.needsIf; var lfP = typeof le.needsFrom === 'number' ? lvlNum(le.needsFrom) : undefined; if (lfP !== undefined) io.needsFrom = lfP; }   // ... and its rule, where a player's own app could work it out
            }
            out.push(ldP(io, r)); return;
        }
        if (r.id && isObj(r.def)) { var cd = cleanRowDef(r.def, false); if (cd) { ownStats(cd, r.def, spec); viewMods(cd, view); ownRoom -= rowText(cd, r.def, ownRoom); var co = { id: r.id, qty: r.qty }; projFacts(co, r); co.def = cd; if (r.own === 1) co.own = 1; out.push(ldP(co, r)); } }   // F4c3: own — a row they made (theirs to change while the list takes custom rows)
    });
    return out;
}
// The host's (or the GM's own) answer to one change of a carried list: { ok, value, row, qty, … } or { ok: false, reason }. q = { op: add|remove|
// setQty|keep|undo, defId (add), rowId, qty }. Rights follow the list (Player may edit / GM edits, visible); a player adds only what their view
// holds (anything else reads as gone). A player's removal follows the item (RM_MODES): a bound item stays ({ reason: 'stays', msg, name }) —
// unless opts.grace (a pickup's Undo window, { added }: what its pickups added, by the host's own count) covers the drop; a curse-on-contact
// item leaves their sheet but stays on the character, hidden under a fresh id ({ hid: true, msg, name }). undo takes back up to q.qty, never
// more than the window's added (with a window open). A pickup (an add, a raised quantity) answers row, added (and base) for the Undo, note +
// name (the item's removal mode) for the GM's notice; a drop answers undone. "Make custom" (keep) is the GM's, on a deleted entry's copy.
// F4b set: facts; F4c2 ov: a copy's own values (applyOv); F4c3 custom: a custom row, made or changed (applyCustom). Every answer names its row and quantity
function applyRowOp(sys, char, fieldId, q, F, opts) {
    opts = opts || {};
    var f = fieldById(sys, fieldId); if (!f || f.kind !== 'item-list') return { ok: false, reason: 'field' };
    var mkR = !!(opts.player && openChar(char) === 'making');   // Onboarding F3: a character in the making: no lock holds an item on it, and nothing of it is noticed (it is not in play)
    var fl = mkR && opts.fill === true;   // Onboarding F4 (owner, 2026-09-27): a file filling a character in the making takes its rows as the file has them — a copy's own name and stats, rows of their own — the players' fields only (fillMaking; the host sets it)
    if (opts.player && ((f.edit !== 'owner' && !openChar(char)) || f.vis !== 'all')) return { ok: false, reason: 'field' };
    if (!isObj(q) || !ROW_OPS[q.op]) return { ok: false, reason: 'value' };
    var src = char && char.values && Array.isArray(char.values[fieldId]) ? char.values[fieldId] : [];
    var list = JSON.parse(JSON.stringify(src)), vo = valueOpts(sys), extra = {}, spec = isObj(f.list) ? f.list : null;   // spec (F4b): the list's options
    var grOn = opts.copy !== true && !fl, grSteps = [];   // 1.6.0 (v2, B4): the rows a row grants, moved in this same change on the machine that owns the character (a player's own app waits for its host; a file brings its granted rows as they come)
    var hnd = opts.player && !mkR ? 'player' : 'gm', gsp = opts.player ? (actorSpec(sys, fieldId, spec, opts) || spec) : spec;   // 1.5.4 One at a time: whose hand, and the list options a row's group is read by (a player's own view, on the host and on their own app alike)
    var at = function(rid) { for (var i = 0; i < list.length; i++) if (rowIdOf(list[i]) === rid) return i; return -1; };
    var capJudge = function(ix, was) { if (fl) return null; var ch = lvlCapHit(sys, spec, list, ix, was); if (!ch) return null; if (opts.player) return { ok: false, reason: 'value', msg: lvlCapSays(f, spec, ch, false), cap: true }; extra.capSays = lvlCapSays(f, spec, ch, true); return null; };   // 1.6.0 At most at a level: a player refused in words, the GM told
    if (q.op !== 'add' && typeof q.rowId === 'string') { var oxA = at(q.rowId); if (oxA >= 0 && isObj(list[oxA]) && typeof list[oxA].opn === 'string' && (opts.player || q.op !== 'remove')) return { ok: false, reason: 'opened' }; }   // 1.5.8: an opened row comes and goes with what opens it (openSync); only the GM may take one off, and it comes back while it is opened
    if (q.op === 'load') return rowLoad(sys, char, f, list, spec, q, opts, at, vo, F);   // 1.5.8 Loads from
    if (q.op === 'chamber' || q.op === 'unchamber') return rowChamber(sys, char, f, list, spec, q, opts, at, vo, F);   // 1.5.9 Chambers from
    if (q.op === 'add') {
        if (typeof q.defId !== 'string' || !ITEM_ID.test(q.defId)) return { ok: false, reason: 'value' };
        var ent = itemDef(sys, q.defId), fromLib = false;
        if (!ent) { var lk = opts.player ? opts.lib : libFind, le = typeof lk === 'function' ? lk(q.defId) : null; if (isObj(le)) { ent = le; fromLib = true; } }   // Stage 6 library: the GM's machine reads its library (L2c); a player's pick only through opts.lib (L3: the host's entries of packs players may see, the client's own copies)
        var inView = opts.player ? (fromLib || valueOpts(opts.view || null).items[q.defId] === 1) : !!ent;
        if (!ent || !inView || (opts.player && ent.vis === 'gm')) return { ok: false, reason: 'missing' };
        if (opts.player && spec && Array.isArray(spec.cats) && !catIn(spec.cats, ent.category)) return { ok: false, reason: 'missing' };   // F4b: outside the list's categories reads as gone
        if (opts.player && !fl) {   // 126b: what the entry needs, judged for a player's own pick (a character being made too; never a file that fills one, never the GM)
            var nmR = needsMet(sys, char, ent, opts.copy === true, F, null, spec && isObj(spec.lvl) ? lvlClamp(spec.lvl, typeof ent.lvl === 'number' ? ent.lvl : spec.lvl.def) : undefined);   // copy: a player's own app, judging its copy of the character. At the level the new row starts at
            var pvE = nmR.ok ? null : opts.copy === true ? ent : (itemDef(opts.view || null, q.defId) || (typeof opts.libPl === 'function' ? opts.libPl(q.defId) : null));   // the entry as players read it: a rule they may not read is never said
            var missR = nmR.ok ? [] : nmR.missing.map(function(n) { return isObj(n) && n.rule !== undefined && !(isObj(pvE) && pvE.needsIf === n.rule) ? { rule: true } : n; });
            if (!nmR.ok) return { ok: false, reason: 'needs', msg: needsSays(ent, missR, function(id) { var d2 = itemDef(sys, id); if (d2) return valueOpts(opts.view || null).items[id] === 1 ? d2.name : null; var l2 = typeof opts.lib === 'function' ? opts.lib(id) : null; return isObj(l2) && l2.vis !== 'gm' ? l2.name : null; }) };
        }
        var partIn = '';   // 1.6.0 R14: a part, added to its host (a row of a list whose parts come from this one), of a category it takes
        if (q.in !== undefined) { if (typeof q.in !== 'string' || !ROW_ID.test(q.in)) return { ok: false, reason: 'value' }; var phA = partHost(sys, char, f.id, q.in, !!opts.player); if (!phA) return { ok: false, reason: 'missing' }; var ptcA = phA.f.list.parts.cats; if (Array.isArray(ptcA) && ptcA.length && !catIn(ptcA, ent.category)) return { ok: false, reason: 'missing' }; partIn = q.in; }
        var agN = q.name !== undefined ? cutText(q.name, LIMITS.itemName) : '';   // 1.6.0: a copy held again under its own name: only for an entry ticked so, never a name another copy of it carries
        if (q.name !== undefined) { if (ent.again !== 'name' || !agN) return { ok: false, reason: 'value' }; var agL = againFold(agN); if (!agL) return { ok: false, reason: 'value', msg: 'A name needs a letter or a digit.' }; if (list.some(function(r) { if (!isObj(r) || r.hid === 1 || r.defId !== q.defId) return false; var rdA = rowDef(sys, r); return !!rdA && againFold(rdA.def.name) === agL; })) return { ok: false, reason: 'value', msg: 'Another ' + ent.name + ' already has that name.' }; }
        var n = spec && spec.noQty ? 1 : clampNum((q.qty | 0) || 1, 1, LIMITS.maxQty), have = -1;
        if (partIn && phA) { var roomA = partsRoom(sys, phA.f.list, phA.row, list, partIn); if (roomA && roomA.used + n > roomA.cap) return { ok: false, reason: 'value', msg: partsFullSays(roomA) }; }   // 1.6.0 (v2, B6)
        if (!agN && !(spec && spec.multi && q.rowId !== undefined) && !(fl && q.gr !== undefined)) for (var j = 0; j < list.length; j++) if (isObj(list[j]) && list[j].defId === q.defId && (fromLib || !list[j].snap) && list[j].hid !== 1 && typeof list[j].gr !== 'string' && (typeof list[j].in === 'string' ? list[j].in : '') === partIn && typeof list[j].opn !== 'string' && !isObj(list[j].ld) && !Array.isArray(list[j].rd) && !isObj(list[j].fd)) { have = j; break; }   // never into a kept curse; F4b: a list that takes the same item more than once makes a new row
        if (have < 0 && !agN && spec && spec.noQty && !spec.multi && list.some(function(r) { return isObj(r) && r.defId === q.defId && typeof r.gr === 'string' && r.hid !== 1 && (typeof r.in === 'string' ? r.in : '') === partIn; })) return { ok: false, reason: 'value' };   // 1.6.0 (v2, B4): held once, a granted row of it counts
        if (have >= 0 && spec && spec.noQty) return { ok: false, reason: 'value' };   // F4b: no quantity — once each
        if (have >= 0) { extra.base = list[have].qty | 0; list[have].qty = clampNum(extra.base + n, 1, LIMITS.maxQty); extra.row = rowIdOf(list[have]); extra.qty = list[have].qty; extra.added = extra.qty - extra.base; }   // the same item again raises its quantity
        else {
            if (list.filter(function(r) { return !(isObj(r) && r.hid === 1); }).length >= LIMITS.carried) return { ok: false, reason: 'field' };   // kept curses never count against what the player sees
            var row = { defId: q.defId, qty: n };
            if (q.rowId !== undefined) {   // a new row's id: never one already in the list, never one an item's legacy row would derive (checked against the player's own view: a GM-only item's id is never confirmed)
                if (!rowIdFree(list, q.rowId, knownItems(sys, opts))) return { ok: false, reason: 'value' };
                row = { id: q.rowId, defId: q.defId, qty: n };
            }
            if (partIn) row.in = partIn;   // 1.6.0 R14
            if (fl && q.gr !== undefined) { if (typeof q.gr !== 'string' || !ROW_ID.test(q.gr)) return { ok: false, reason: 'value' }; row.gr = q.gr; }   // 1.6.0 (v2, B4): a character file's granted row, still marked by the row that grants it
            if (char && (char.making === 1 || char.making === true)) row.mk = 1;   // 1.6.0 (v2, B5): Row.made; from the character as the host holds it, never from the message
            if (agN) row.ov = { name: agN };   // 1.6.0: the copy's own name, as the GM's own values name a row
            if (spec && isObj(spec.lvl)) row.lvl = lvlClamp(spec.lvl, typeof ent.lvl === 'number' ? ent.lvl : spec.lvl.def);   // F4b: the facts are written as it is added (a later default moves no row)
            startStamp(spec, row);   // 1.6.0: Keeps the starting level, the level it is added at
            if (spec && isObj(spec.on)) row.on = spec.on.def === true;
            if (spec && spec.price) row.paid = clampNum(rowStat(spec, ent, spec.price), 0, LIMITS.statAbs);
            if (typeof row.gr === 'string' && spec && spec.price) row.paid = 0;   // 1.6.0 (v2, B4): a file's granted row, at Paid 0 as a grant makes it
            if (fromLib) row.snap = cleanRowDef(ent, true);   // L2c: a library row always carries its copy (it draws with no library; libSnaps keeps it current)   // F4c1: what one cost, from the host's own entry (its price stat, else the stat's default, else 0) — a recorded fact: a merged add keeps the first
            for (var oj = list.length - 1; oj >= 0; oj--) if (isObj(list[oj]) && list[oj].defId === q.defId && typeof list[oj].opn === 'string') list.splice(oj, 1);   // 1.5.8: bought, it takes the place of the row a Form opened (the bought tier wins)
            var grA = grOn ? grantWant(ent, rowLvl(spec, row, ent)) : null;   // 1.6.0 (v2, B4): what it grants at the level its row starts at, under an id of its own
            if (grA && Object.keys(grA).length) { if (typeof row.id !== 'string') { var gidA = uid('w_'); while (list.some(function(r) { return rowIdOf(r) === gidA; })) gidA = uid('w_'); row = Object.assign({ id: gidA }, row); } grSteps.push({ rid: row.id, w0: map(), w1: grA }); }
            list.push(row); extra.base = 0; extra.row = rowIdOf(row); extra.qty = n; extra.added = n;
            if (row.on === true && onHeld(sys, spec, list, list.length - 1, gsp)) row.on = false;   // 1.5.4 One at a time: it starts off while its group holds one on
            if (row.on === true && RM_MODES[ent.eq] === 1 && opts.player && !mkR) { extra.onRow = extra.row; extra.eqNote = ent.eq; }   // F4b: picked up already on — the equip lock's grace opens
            var capA = capJudge(list.length - 1); if (capA) return capA;   // 1.6.0 At most at a level
        }
        var dN = have >= 0 ? ((rowDef(sys, list[have]) || {}).def || ent) : ent;   // F4c2 review: merged into a copy, its own lock and name tell the GM (a new row has no ov: the entry)
        if (RM_MODES[dN.rm] === 1 && !mkR) { extra.note = dN.rm; extra.name = dN.name || 'Item'; }
        if (extra.eqNote) extra.name = ent.name || 'Item';
    } else if (q.op === 'custom') {   // F4c3: a character's own row, made or changed
        var cx = at(q.rowId), g0C = cx >= 0 ? onGroup(sys, spec, list[cx], gsp) : null;   // 1.5.4 One at a time: a row that is there, and its group before the change
        var phC = null;   // 198: a row of the character's own made as a part of a host, judged as add judges one
        if (q.in !== undefined) { if (typeof q.in !== 'string' || !ROW_ID.test(q.in) || q.in === q.rowId) return { ok: false, reason: 'value' }; if (cx >= 0) { if (list[cx].in !== q.in) return { ok: false, reason: 'value' }; } else { phC = partHost(sys, char, f.id, q.in, !!opts.player); if (!phC) return { ok: false, reason: 'missing' }; } }
        var cu = applyCustom(sys, list, q, spec, F, opts, extra, actorSpec(sys, fieldId, spec, opts), fl); if (cu) return cu;
        if (phC) { var cxN = at(q.rowId), ptcC = phC.f.list.parts.cats; if (cxN < 0) return { ok: false, reason: 'value' }; if (Array.isArray(ptcC) && ptcC.length && !catIn(ptcC, (list[cxN].def || {}).category)) return { ok: false, reason: 'missing' }; var roomC = partsRoom(sys, phC.f.list, phC.row, list, q.in); if (roomC && roomC.used + Math.max(1, list[cxN].qty | 0) > roomC.cap) return { ok: false, reason: 'value', msg: partsFullSays(roomC) }; list[cxN].in = q.in; }   // 1.6.0 (v2, B6): the room it is made into
        if (cx < 0 && char && (char.making === 1 || char.making === true)) { var cxM = at(q.rowId); if (cxM >= 0) list[cxM].mk = 1; }   // 1.6.0 (v2, B5): a row of its own made while making
        if (cx < 0) { var cxK = at(q.rowId), capC = cxK >= 0 ? capJudge(cxK) : null; if (capC) return capC; if (cxK >= 0) startStamp(spec, list[cxK]); }   // 1.6.0 At most at a level, then Keeps the starting level: a row of its own made
        if (cx >= 0) { var mvC = onMoved(sys, spec, list, cx, g0C, hnd, extra, { read: gsp, onGrace: opts.onGrace === true }); if (mvC) return mvC; }   // ... moved by its stats into a group that holds one on: it goes off
    } else if (q.op === 'split') {   // 1.6.0, backlog 180 R11: n of a stack into a row of its own, right after it (the GM's hand and a player's alike: nothing leaves the character)
        var ixS = typeof q.rowId === 'string' && ROW_ID.test(q.rowId) ? at(q.rowId) : -1; if (ixS < 0 || (opts.player && list[ixS].hid === 1)) return { ok: false, reason: 'missing' };
        var rwS = list[ixS], curS = rwS.qty | 0, nS = cleanNum(q.qty, NaN);
        if (spec && spec.noQty) return { ok: false, reason: 'field' };
        if (!(nS >= 1) || nS !== Math.floor(nS) || nS >= curS) return { ok: false, reason: 'value', msg: 'Split off from 1 to ' + Math.max(1, curS - 1) + '.' };
        if (typeof q.back !== 'string' || !ROW_ID.test(q.back) || at(q.back) >= 0) return { ok: false, reason: 'value' };
        if (rwS.keptOn === 1 || typeof rwS.opn === 'string') return { ok: false, reason: 'field' };
        if (isObj(rwS.ld)) return { ok: false, reason: 'value', msg: 'Unload it first: what it holds stays with one row.' };
        if (list.filter(function(r) { return !(isObj(r) && r.hid === 1); }).length >= LIMITS.carried) return { ok: false, reason: 'field' };
        var cpS = JSON.parse(JSON.stringify(rwS)); cpS.id = q.back; cpS.qty = nS; delete cpS.tt; if (spec && isObj(spec.on) && cpS.on === true) cpS.on = false;   // the part split off starts off: a row on stays the one in use
        rwS.qty = curS - nS; list.splice(ixS + 1, 0, cpS); extra.row = q.back; extra.qty = nS; extra.split = true;
        var capP = capJudge(ixS + 1); if (capP) return capP;   // 1.6.0 At most at a level: the part split off is a row of its own
    } else if (q.op === 'restore') {   // 1.5.8: a removed row put back whole at its place, the very row (q.row, q.at) the caller kept from before it went: the GM's sheet, or the host's own record for a player (never the player's word)
        if (typeof q.rowId !== 'string' || !ROW_ID.test(q.rowId) || !isObj(q.row) || rowIdOf(q.row) !== q.rowId || at(q.rowId) >= 0) return { ok: false, reason: 'missing' };
        if (list.filter(function(r) { return !(isObj(r) && r.hid === 1); }).length >= LIMITS.carried) return { ok: false, reason: 'field' };
        var atR = Math.max(0, Math.min(list.length, cleanNum(q.at, list.length) | 0));
        list.splice(atR, 0, JSON.parse(JSON.stringify(q.row))); extra.row = q.rowId; extra.qty = q.row.qty | 0; extra.restored = true;
        var capR = capJudge(atR); if (capR) return capR;   // 1.6.0 At most at a level
        if (grOn && isObj(q.grants)) grSteps.push({ put: q.grants, rid: q.rowId });   // 1.6.0 (v2, B4): the rows it granted come back with it, as the caller kept them
        if (isObj(q.parts) && spec && isObj(spec.parts)) {   // 1.6.0 R14: its parts come back with it, as the caller kept them from before it went (never the player's word: the host's own record)
            var ptR = partsSrc(sys, spec);
            if (ptR && ptR.id === q.parts.f) {
                if (ptR.id === f.id) partsPut(list, q.parts, q.rowId);
                else { var plR = JSON.parse(JSON.stringify(isObj(char) && isObj(char.values) && Array.isArray(char.values[ptR.id]) ? char.values[ptR.id] : [])); if (partsPut(plR, q.parts, q.rowId)) { var vR = cleanValue(ptR, plR, vo); if (vR !== undefined) { extra.also = {}; extra.also[ptR.id] = vR; } } }
            }
        }
    } else {
        if (typeof q.rowId !== 'string' || !ROW_ID.test(q.rowId)) return { ok: false, reason: 'value' };
        if (q.op === 'ov' && (!spec || (opts.player && !fl && !(isObj(sys.listRules) && sys.listRules.ownerStats === true)))) return { ok: false, reason: 'field' };   // F4c2: a copy's own values need a list shaped in the Lists tab; its owner changes them only under Setting A (the rules of the system judged on: the host's, the client's view)
        var idx = at(q.rowId); if (idx < 0 || (opts.player && list[idx].hid === 1)) return { ok: false, reason: 'missing' };   // a kept curse reads as gone to a player
        extra.row = q.rowId;
        if (q.op === 'keep') {   // "Make custom" — a deleted entry's copy becomes the character's own item
            if (opts.player || !isObj(list[idx].snap)) return { ok: false, reason: 'field' };
            var wasHid = list[idx].hid === 1;
            var kr = { id: q.rowId, qty: list[idx].qty }; ['lvl', 'on', 'note', 'paid', 'keptOn'].forEach(function(k) { if (list[idx][k] !== undefined) kr[k] = list[idx][k]; }); kr.def = isObj(list[idx].ov) ? mergeOv(list[idx].snap, list[idx].ov) : list[idx].snap;   // F4b: its facts go with it (F4c1: what it cost; F4c2: its own values folded into its definition, the ov itself not kept)
            var leK = itemDef(sys, list[idx].defId) || libFind(list[idx].defId); if (isObj(leK)) { kr.def = Object.assign({}, kr.def); ownLong(kr.def, leK); }   // 155: an entry that is still there gives the row its long text, which the row now keeps as its own
            list[idx] = kr; if (wasHid) list[idx].hid = 1;
            extra.qty = list[idx].qty;
        } else if (q.op === 'set') {   // F4b: a row's facts, all or none. A player switching off an item with an equip lock: bound — it stays on
            // (their message; within the grace after it went on, it comes off); curse on contact — it looks off to them and stays on here
            var fx = isObj(q.facts) ? q.facts : null, rw = list[idx]; if (!fx || (fx.lvl === undefined && fx.on === undefined && fx.note === undefined && fx.paid === undefined && fx.ct === undefined)) return { ok: false, reason: 'value' };   // no fact: nothing to do
            if (fx.paid !== undefined) {   // F4c1: what one cost is the GM's to correct (a player's: field, before any fact applies); null: back to the list price
                if (opts.player) return { ok: false, reason: 'field' };
                if (!spec || !spec.price) return { ok: false, reason: 'value' };
                if (fx.paid === null) delete rw.paid; else { if (typeof fx.paid !== 'number' || !fin(fx.paid) || fx.paid < 0 || fx.paid > LIMITS.statAbs) return { ok: false, reason: 'value' }; rw.paid = fx.paid; }
            }
            var lvJ = !!(fx.lvl !== undefined && opts.player && !fl && spec && isObj(spec.lvl)), rdJ = lvJ ? rowDef(sys, rw) : null, dfJ = rdJ ? rdJ.def : null, wasL = lvJ ? rowLvl(spec, rw, dfJ) : undefined;   // the level the row reads at before the change: its own, else its entry's, else the list's
            var grL = grOn && fx.lvl !== undefined && spec && isObj(spec.lvl) ? rowDef(sys, rw) : null, grL0 = grL ? rowLvl(spec, rw, grL.def) : 0;   // 1.6.0 (v2, B4): a level that rises past a grant's from grants it; one that falls below takes it
            var capW = fx.lvl !== undefined && spec && isObj(spec.lvl) && Array.isArray(spec.lvl.caps) ? (function() { var dW = rowDef(sys, rw); return rowLvl(spec, rw, dW ? dW.def : null); })() : undefined;   // 1.6.0 At most at a level: the level it stood at
            var slW = fx.lvl !== undefined && spec && isObj(spec.lvl) && spec.lvl.start === true ? rowLvl(spec, rw, (rowDef(sys, rw) || {}).def) : undefined;   // 1.6.0 Keeps the starting level: the level before the change
            if (fx.lvl !== undefined) { if (!spec || !isObj(spec.lvl)) return { ok: false, reason: 'value' }; if (fx.lvl === null) delete rw.lvl; else { var nl = lvlNum(fx.lvl); if (nl === undefined || typeof fx.lvl !== 'number') return { ok: false, reason: 'value' }; rw.lvl = lvlClamp(spec.lvl, nl); } }
            if (capW !== undefined) { var capS = capJudge(idx, capW); if (capS) return capS; }
            if (slW !== undefined) { if (char && (char.making === 1 || char.making === true)) rw.sl = rowLvl(spec, rw, (rowDef(sys, rw) || {}).def); else if (typeof rw.sl !== 'number') rw.sl = slW; }   // while its character is being made the start follows the level; in play the first change keeps where a row made before the tick stood
            if (grL && isObj(grL.def) && Array.isArray(grL.def.grants)) { var grL1 = rowLvl(spec, rw, grL.def); if (grL1 !== grL0) grSteps.push({ rid: q.rowId, w0: grantWant(grL.def, grL0), w1: grantWant(grL.def, grL1) }); }
            var nowL = lvJ ? rowLvl(spec, rw, dfJ) : undefined;   // ... and after it. The owed review, 2026-10-09: a level handed back (null) reads at its entry's own, which is a raise for a row kept lower, and was judged by nothing
            if (lvJ && typeof wasL === 'number' && typeof nowL === 'number' && nowL > wasL) {   // 126b, a level's own needs: a player's raise is judged like a pick, at the level asked for. Never the GM's hand, a file that fills a character, or a level taken down
                var idL = typeof rw.defId === 'string' ? rw.defId : null;   // the host's row names its entry; an owner's inline copy on their own app carries the needs it may see itself
                var entL = idL ? (itemDef(sys, idL) || (typeof opts.lib === 'function' ? opts.lib(idL) : null) || (opts.copy !== true && typeof libFind === 'function' ? libFind(idL) : null)) : (opts.copy === true && rw.lnk === 1 && typeof rw.src === 'string' ? rw : null);
                var nmL = isObj(entL) ? needsMet(sys, char, entL, opts.copy === true, F, null, nowL) : null;
                if (nmL && !nmL.ok) {
                    var pvL = opts.copy === true ? entL : idL ? (itemDef(opts.view || null, idL) || (typeof opts.libPl === 'function' ? opts.libPl(idL) : null)) : null;   // the entry as players read it: a rule they may not read is never said
                    var missL = nmL.missing.map(function(n) { return isObj(n) && n.rule !== undefined && !(isObj(pvL) && pvL.needsIf === n.rule) ? { rule: true } : n; });
                    return { ok: false, reason: 'needs', msg: needsSays(entL, missL, function(id) { if (opts.copy === true) { var own = (Array.isArray(entL.needs) ? entL.needs : []).filter(function(n) { return isObj(n) && n.id === id && typeof n.name === 'string'; })[0]; if (own) return own.name; } var d3 = itemDef(sys, id); if (d3) return valueOpts(opts.view || null).items[id] === 1 ? d3.name : null; var l3 = typeof opts.lib === 'function' ? opts.lib(id) : null; return isObj(l3) && l3.vis !== 'gm' ? l3.name : null; }) };
                }
            }
            if (fx.note !== undefined) { if (typeof fx.note !== 'string') return { ok: false, reason: 'value' }; var nn = cutText(fx.note, LIMITS.rowNote); if (nn) rw.note = nn; else delete rw.note; }
            if (fx.ct !== undefined) {   // Stage 6 HUD R2: its counters — each one its list has, a whole number from 0 to the row's own most
                var cst = spec && Array.isArray(spec.counters) ? spec.counters : null; if (!cst || !isObj(fx.ct)) return { ok: false, reason: 'value' };
                var nct = isObj(rw.ct) ? JSON.parse(JSON.stringify(rw.ct)) : {}, lfR = fieldById(sys, fieldId), rsR = null;
                for (var ckk in fx.ct) {
                    if (!Object.prototype.hasOwnProperty.call(fx.ct, ckk)) continue;
                    var tt = null; cst.forEach(function(t) { if (!tt && lower(t.key) === lower(ckk)) tt = t; }); if (!tt) return { ok: false, reason: 'value' };
                    if ((tt.roll === true || isObj(tt.timer)) && opts.player && !mkR) return { ok: false, reason: 'field' };   // 1.6.0: a character in the making is not in play, so a file that fills it sets such a counter's start   // 1.6.0: nor one the game clock counts   // 1.5.7: a counter set by rolls only is never a player's to set by hand
                    var nvv = Number(fx.ct[ckk]); if (!fin(nvv)) return { ok: false, reason: 'value' }; nvv = Math.max(0, Math.min(1e6, Math.round(nvv)));
                    if (tt.max) { rsR = rsR || makeResolver(sys, char, F); var mxv = rsR.ctMax(lfR, rw, tt.key); if (typeof mxv === 'number') nvv = Math.min(nvv, mxv); }
                    nct[tt.key] = nvv;
                }
                rw.ct = nct;
            }
            if (fx.on !== undefined) {
                if (!spec || !isObj(spec.on) || typeof fx.on !== 'boolean') return { ok: false, reason: 'value' };
                var rdS = rowDef(sys, rw), emode = rdS && rdS.def && RM_MODES[rdS.def.eq] === 1 ? rdS.def.eq : '', wasOn = rw.on === true, enm = emode ? (rdS.def.name || 'Item') : '';   // stored: a row on only by the list's "starts on" was never switched on, so no lock holds it
                var onJ = playerNeeds(sys, fieldId, spec, opts, 'on'), swN = fx.on === true && rw.keptOn !== 1 && !rowOn(spec, rw) && isObj(onJ) && typeof onJ.needs === 'string' && onJ.needs ? onJ : null;   // the review of 1.5.9's fold: a player's by their own view's needs (playerNeeds)   // 1.5.8: a switch's needs, judged as a row that is off is switched on
                if (fx.on === true && rw.on !== true && opts.player && !mkR && typeof spec.on.showIf === 'string' && spec.on.showIf && !switchOk(sys, char, f, rw, spec.on.showIf, F)) return { ok: false, reason: 'field' };   // 1.6.0: a row whose switch is not shown is not a player's to switch on
                if (swN && !switchOk(sys, char, f, rw, swN.needs, F)) { if (!opts.player) extra.onNeeds = rollNeedsSays(swN); else if (!fl) return { ok: false, reason: 'needs', msg: rollNeedsSays(swN) }; }   // a player's own change is refused (a file that fills a character is not judged); the GM's hand passes, and is told
                if (!opts.player || mkR) { rw.on = fx.on; delete rw.keptOn; }
                else if (fx.on) { rw.on = true; if (rw.keptOn === 1) delete rw.keptOn; else if (!wasOn && emode) { extra.onRow = q.rowId; extra.eqNote = emode; extra.name = enm; } }
                else if (rw.keptOn === 1) { /* they already see it off */ }
                else if (wasOn) {
                    var emsg = emode && typeof rdS.def.eqMsg === 'string' ? rdS.def.eqMsg : '';
                    if (emode === 'bound' && !opts.onGrace) return { ok: false, reason: 'stays', msg: emsg, name: enm, eq: true };
                    if (emode === 'curse') { rw.on = true; rw.keptOn = 1; extra.keptOn = true; extra.msg = emsg; extra.name = enm; extra.keptMsg = emsg; extra.keptName = enm; }   // keptMsg, keptName: a curse kept on, as the one rule says one
                    else { rw.on = false; if (emode === 'bound') extra.onGraceUsed = true; }   // the grace let it go: spent
                } else rw.on = false;
                if (fx.on === true && rw.on === true) { var oo = onlyOne(sys, spec, list, idx, hnd, extra, { read: gsp, grace: typeof opts.graceOf === 'function' ? opts.graceOf : null }); if (oo) return oo; }   // 1.5.4 One at a time: the rest of its group off, in this one change (graceOf: the host's record of each row's equip-lock grace)
            }
            extra.qty = rw.qty | 0;
        } else if (q.op === 'ov') {   // F4c2: a copy's own values — the GM's on a linked copy (the library's, or a deleted one's copy); its owner's on a library copy they can see, stats only (Setting A, above)
            var rwO = list[idx], rdO = rowDef(sys, rwO), pq = q.ov, g0O = onGroup(sys, spec, rwO, gsp);   // g0O (1.5.4 One at a time): its group before the change
            if (!rdO || rdO.src === 'custom' || (!opts.player && rdO.src !== 'lib' && rdO.src !== 'lost')) return { ok: false, reason: 'field' };   // a custom row changes with its own op
            if (opts.player && (rdO.src !== 'lib' || (valueOpts(opts.view || null).items[rwO.defId] !== 1 && !(fl && typeof opts.lib === 'function' && isObj(opts.lib(rwO.defId)))))) return { ok: false, reason: 'missing' };   // F4: a file's fill, a copy of an entry of a pack they may see too   // an inline copy on the client is a GM-only entry or a deleted one's copy on the host: gone to both alike
            if (pq !== null && !isObj(pq)) return { ok: false, reason: 'value' };
            if (opts.player && pq !== null && Object.keys(pq).some(function(k) { return k !== 'stats' && !(fl && k === 'name'); })) return { ok: false, reason: 'field' };   // F4: a file's fill, its own name too
            var prP = spec && typeof spec.price === 'string' && spec.price ? lower(spec.price) : '';   // F4c2 review: paid is the GM's — a player's stat change that can move the price first records what the row read (a recorded Paid never moves)
            if (opts.player && prP && typeof rwO.paid !== 'number' && (pq === null || (isObj(pq) && (pq.stats === null || (isObj(pq.stats) && Object.keys(pq.stats).some(function(k) { return lower(k) === prP; })))))) rwO.paid = clampNum(rowPaid(spec, rwO, rdO.def), 0, LIMITS.statAbs);
            var noteO = {}, ovr = applyOv(rwO, rdO.base, pq, spec, F, !!opts.player, actorSpec(sys, fieldId, spec, opts), noteO); if (ovr) return ovr;
            var mvO = onMoved(sys, spec, list, idx, g0O, hnd, extra, { read: gsp, onGrace: opts.onGrace === true }); if (mvO) return mvO;   // 1.5.4 One at a time: moved by its stats into a group that holds one on, it goes off
            if (noteO.secret) { extra.secretPick = noteO.secret; extra.name = (rdO.def && rdO.def.name) || 'Item'; }   // the host tells the GM (never the player)
            extra.qty = rwO.qty | 0;
        } else {
            var cur = list[idx].qty | 0, nq = 0, gr = isObj(opts.grace) ? Math.max(0, opts.grace.added | 0) : -1;   // gr: what the open pickup window may still take back (-1: none open)
            if (q.op === 'setQty') { nq = cleanNum(q.qty, NaN); if (!isFinite(nq)) return { ok: false, reason: 'value' }; nq = Math.min(Math.max(0, nq | 0), LIMITS.maxQty); }
            if (nq > 1 && Array.isArray(list[idx].rd) && list[idx].rd.length) return { ok: false, reason: 'value', msg: 'Unchamber it first: a row with rounds in its chamber is one of its own.' };   // 1.5.9 Chambers from: a stack holds no chamber, so its rounds would be lost
            else if (q.op === 'undo') { var back = clampNum(cleanNum(q.qty, 0) | 0, 0, LIMITS.maxQty); if (gr >= 0) back = Math.min(back, gr); nq = Math.max(0, cur - back); }   // the host's own count wins: never more than was picked up
            var rd = rowDef(sys, list[idx]), rmode = rd && rd.def && RM_MODES[rd.def.rm] === 1 ? rd.def.rm : '';
            var eqOn = spec && isObj(spec.on) && list[idx].on === true && rd && rd.def && RM_MODES[rd.def.eq] === 1 ? rd.def.eq : '';   // F4b (owner, after the review): while it is on, its switch lock covers dropping it too
            var lmode = rmode === 'bound' || eqOn === 'bound' ? 'bound' : (rmode === 'curse' || eqOn === 'curse') ? 'curse' : '', byEq = !!lmode && rmode !== lmode, mode = opts.player && !mkR ? lmode : '';
            var msg = mode ? ((byEq ? rd.def.eqMsg : rd.def.rmMsg) || '') : '', nm = lmode ? (rd.def.name || 'Item') : '';
            if (nq > cur) { extra.added = nq - cur; if (opts.player && rmode && !mkR) { extra.note = rmode; extra.name = rd.def.name || 'Item'; } }   // more of it: a pickup (the Undo, the GM's notice)
            var inGr = gr >= 0 && cur - nq <= gr;
            if (mode === 'bound' && nq < cur && !inGr) {
                if (!(byEq && opts.onGrace)) { var st0 = { ok: false, reason: 'stays', msg: msg, name: nm }; if (byEq) st0.eq = true; return st0; }
                extra.onGraceUsed = true;   // the switch's grace let it go: spent
            }
            if (nq < cur) extra.undone = cur - nq;
            var hostWas = nq <= 0 ? rowIdOf(list[idx]) : '';   // 1.6.0 R14: a host that leaves takes its parts with it
            if (mode === 'curse' && nq <= 0) {   // it leaves their sheet; the GM keeps it on the character, under an id the player never held
                var kept = JSON.parse(JSON.stringify(list[idx])); kept.id = uid('w_'); kept.hid = 1; list[idx] = kept; extra.partsTo = kept.id;
                extra.hid = true; extra.msg = msg; extra.name = nm; extra.qty = 0;
            } else if (nq <= 0) { list.splice(idx, 1); extra.qty = 0; }
            else { list[idx].qty = clampNum(nq, 1, LIMITS.maxQty); extra.qty = list[idx].qty; }
        }
    }
    if (grOn && typeof hostWas === 'string' && hostWas) grSteps.push({ cut: hostWas, keptTo: typeof extra.partsTo === 'string' ? extra.partsTo : '' });   // 1.6.0 (v2, B4): what it granted goes too (a kept curse keeps it, kept from its player as it is)
    if (typeof hostWas === 'string' && hostWas && spec && isObj(spec.parts)) {   // 1.6.0 R14: its parts go too (a kept curse keeps them, kept from its player as it is)
        var ptS = partsSrc(sys, spec), keptTo = extra.partsTo; delete extra.partsTo;
        var dropP = function(rows) { var outP = []; rows.forEach(function(r) { if (!(isObj(r) && r.in === hostWas)) { outP.push(r); return; } if (keptTo) { var kr = JSON.parse(JSON.stringify(r)); kr.in = keptTo; kr.hid = 1; kr.id = uid('w_'); outP.push(kr); } }); return outP; };
        if (ptS && ptS.id === f.id) list = dropP(list);
        else if (ptS) { var pl0 = isObj(char) && isObj(char.values) && Array.isArray(char.values[ptS.id]) ? char.values[ptS.id] : [], pl1 = dropP(JSON.parse(JSON.stringify(pl0))); if (pl1.length !== pl0.length || keptTo) { var vP = cleanValue(ptS, pl1, vo); if (vP !== undefined) { extra.also = {}; extra.also[ptS.id] = vP; } } }
    }
    if (grSteps.length) {   // 1.6.0 (v2, B4): after a part's change, so another list is read as that left it
        var grW = grantLists(sys, char, f, list, extra), grCtx = { mk: !!(char && (char.making === 1 || char.making === true)) };
        for (var gi = 0; gi < grSteps.length; gi++) {
            var gs = grSteps[gi], grR = null;
            if (gs.put) grantsPut(sys, grW, gs.put, gs.rid);
            else if (gs.cut) { var sdC = map(); sdC[gs.cut] = 1; grantCut(sys, grW, sdC, false, gs.keptTo); }
            else grR = grantMove(sys, grW, gs.rid, gs.w0, gs.w1, grCtx, 1);
            if (grR) return grR;
        }
        if (!grW.end(vo)) return { ok: false, reason: 'value' };
    }
    var value = cleanValue(f, list, vo); if (value === undefined) return { ok: false, reason: 'value' };
    var out = { ok: true, value: value }; Object.keys(extra).forEach(function(k) { out[k] = extra[k]; });
    return out;
}
// Stage 6 F4c2: an ov patch applied to a row (in place, all or nothing): null once applied, else the refusal. A text or formula null or blank goes back to
// the base's; one equal to the base's is not stored ("only the fields deliberately changed", so a later library edit reaches it). The formulas
// must parse (a cost without dice); a blast is whole feet 1..3000; a lock a mode or none, the switch's only on a list with a switch. A stat is
// one of the list's; the GM's is held (Q1 A: its owner's Setting A leaves it alone), taken back only by the GM. null: everything back (the
// owner's: their own stats); stats null: every stat back (the owner's: their own)
// Stage 6 F5a2: the list options an actor judges a choice against — a player's own view (a GM-only option never confirmed), the GM's the full
function actorSpec(sys, fieldId, spec, opts) { if (!opts || !opts.player) return spec; if (!isObj(opts.view)) return null; var vf = fieldById(opts.view, fieldId); return vf && isObj(vf.list) ? vf.list : null; }   // no view: nothing of the GM's confirmed (owed review F5a2#7)
function statDefOf(spec, key) { var st = null; (isObj(spec) && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(x) { if (!st && isObj(x) && typeof x.key === 'string' && lower(x.key) === lower(key)) st = x; }); return st; }
// F5a2: a choice's value as the list spells its label, or '' (not a string, or no option of the actor's has it)
function pickLabel(aspec, key, v) { var st = statDefOf(aspec, key), out = ''; if (!st || st.kind !== 'pick' || typeof v !== 'string') return ''; (st.opts || []).forEach(function(o) { if (!out && lower(o.label) === lower(v.trim())) out = o.label; }); return out; }
function applyOv(rw, base, pq, spec, F, player, aspec, note) {   // aspec (F5a2): the actor's own list options (a choice's label is judged against them); note: filled with { secret: stat } when a player's pick replaced a hidden one
    base = isObj(base) ? base : {};
    var cur = isObj(rw.ov) ? JSON.parse(JSON.stringify(rw.ov)) : {}, held = Array.isArray(cur.held) ? cur.held.filter(function(h) { return typeof h === 'string'; }) : [];
    var isHeld = function(k) { return held.some(function(h) { return lower(h) === lower(k); }); };
    var unHold = function(k) { held = held.filter(function(h) { return lower(h) !== lower(k); }); };
    var dropStat = function(k) { if (isObj(cur.stats)) Object.keys(cur.stats).forEach(function(k2) { if (lower(k2) === lower(k)) delete cur.stats[k2]; }); };
    var dropOwn = function() { if (isObj(cur.stats)) Object.keys(cur.stats).forEach(function(k) { if (!isHeld(k)) delete cur.stats[k]; }); };   // the owner's take-back: their own stats, never the GM's
    var bad = { ok: false, reason: 'value' }, blank = function(x) { return x === null || (typeof x === 'string' && !x.trim()); };
    if (pq === null) { if (player) dropOwn(); else { cur = {}; held = []; } }
    else {
        var ks = Object.keys(pq);
        for (var i = 0; i < ks.length; i++) {
            var k = ks[i], v = pq[k];
            if (k === 'name' || k === 'icon' || k === 'category' || k === 'notes' || k === 'rmMsg' || k === 'eqMsg') {
                if (k === 'eqMsg' && !blank(v) && !(spec && isObj(spec.on))) return bad;
                if (blank(v)) { delete cur[k]; continue; }
                if (typeof v !== 'string') return bad;
                var t = k === 'icon' ? cleanIcon(v) : k === 'notes' ? str(v, LIMITS.text).replace(CTRL_RE_G, ' ') : cutText(v, k === 'name' ? LIMITS.itemName : k === 'category' ? LIMITS.category : LIMITS.rmMsg);
                if (!t || !t.trim()) return bad;   // text that cleans to nothing (an icon that is not bundled)
                if (t === (typeof base[k] === 'string' ? base[k] : '')) delete cur[k]; else cur[k] = t;
            } else if (k === 'damage' || k === 'cost') {
                if (blank(v)) { delete cur[k]; continue; }
                var fm = cleanFormulaText(v), pp = fm && F && F.parse ? F.parse(fm) : null;
                if (!pp || !pp.ok || (k === 'cost' && hasDice(pp.ast.body))) return { ok: false, reason: 'value', why: 'formula' };   // why: the GM's own toast (never travels)
                if (fm === (typeof base[k] === 'string' ? base[k] : '')) delete cur[k]; else cur[k] = fm;
            } else if (k === 'area') {
                if (v === null) { delete cur.area; continue; }
                if (!isObj(v) || typeof v.ft !== 'number' || v.ft !== Math.floor(v.ft) || v.ft < 1 || v.ft > LIMITS.maxBlastFt) return bad;
                var na = { ft: v.ft, shape: 'circle', name: cutText(v.name, LIMITS.label) };
                if (isObj(base.area) && base.area.ft === na.ft && (base.area.name || '') === na.name) delete cur.area; else cur.area = na;
            } else if (k === 'rm' || k === 'eq') {
                if (v === null) { delete cur[k]; continue; }
                if (OV_LOCK[v] !== 1 || (k === 'eq' && !(spec && isObj(spec.on)))) return bad;
                if (v === (RM_MODES[base[k]] === 1 ? base[k] : 'none')) delete cur[k]; else cur[k] = v;
            } else if (k === 'stats') {
                if (v === null) { if (player) dropOwn(); else { delete cur.stats; held = []; } continue; }
                if (!isObj(v)) return bad;
                var sks = Object.keys(v);
                for (var j = 0; j < sks.length; j++) {
                    var sk = sks[j], sx = v[sk], canon = '';
                    (spec && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (!canon && isObj(s) && typeof s.key === 'string' && lower(s.key) === lower(sk)) canon = s.key; });
                    if (!canon) return bad;
                    if (player && isHeld(canon)) {   // Q1 (A): a stat the GM set holds — unless it is a choice the player cannot see (owner 2026-09-27: their pick replaces it, the GM is told; a refusal would tell them it is there)
                        var hv = ''; if (isObj(cur.stats)) Object.keys(cur.stats).forEach(function(k2) { if (lower(k2) === lower(canon) && typeof cur.stats[k2] === 'string') hv = cur.stats[k2]; });
                        if (!((statDefOf(spec, canon) || {}).kind === 'pick' && hv && !pickLabel(aspec === undefined ? spec : aspec, canon, hv))) return { ok: false, reason: 'field' };
                        if (note) note.secret = canon;
                    }
                    if (sx === null) { dropStat(canon); unHold(canon); continue; }
                    var sPick = (statDefOf(spec, canon) || {}).kind === 'pick';   // F5a2: a choice's value is one of the actor's option labels
                    if (sPick) { sx = pickLabel(aspec === undefined ? spec : aspec, canon, sx); if (!sx) return bad; }
                    else if (statNum(sx) === undefined) return bad;
                    dropStat(canon); unHold(canon);
                    if (sPick ? lower(sx) !== lower(rowStat(aspec === undefined ? spec : aspec, base, canon)) : sx !== rowStat(spec, base, canon)) { cur.stats = isObj(cur.stats) ? cur.stats : {}; cur.stats[canon] = sx; if (!player) held.push(canon); }   // F5a2#2: a choice's no-op as the actor reads the base (a label they lack reads their default, as on their client)
                }
            } else return bad;
        }
    }
    held = held.filter(function(h) { return isObj(cur.stats) && Object.keys(cur.stats).some(function(k2) { return lower(k2) === lower(h); }); });
    if (isObj(cur.stats) && !Object.keys(cur.stats).length) delete cur.stats;
    if (held.length) cur.held = held; else delete cur.held;
    if (Object.keys(cur).length) rw.ov = cur; else delete rw.ov;
    return null;
}
// Stage 6 F4c3 (factored from add): a new row's id — well formed, never one already in the list, never one an item's legacy row would derive
// (known: the items the actor can see — a player's view, so a GM-only item's id is never confirmed)
// [systemcheck:load-start]
// 1.5.8 Loads from (the owner, 2026-10-25, by prompt: "Full pack swap now"; the site's loaded-pack.ts). A row of a list with spec.load loads one
// unit of a row of the source list: the unit comes off the stack (its quantity less 1, the row gone at 0), its copy is kept on the host row (ld)
// and the host's counter (spec.load.ct) is set to what the unit held (its level). What comes out first, at the counter's figure, stacks onto a
// row of the source list only where that row is the same thing in the same state (loadSame), else it is a row of its own under q.back. from
// null unloads. A player needs the right to change both lists. Answers the host list as value and the source list in also
var LD_SAME = ['defId', 'def', 'lnk', 'src', 'snap', 'ov', 'note', 'paid', 'own'];
function loadSame(sys, sl, a, b) {
    if (!isObj(a) || a.hid === 1 || typeof a.opn === 'string' || a.keptOn === 1 || isObj(a.ld) || Array.isArray(a.rd) || isObj(a.fd)) return false;   // 1.5.9: never a row that holds a chamber
    for (var i = 0; i < LD_SAME.length; i++) if (JSON.stringify(a[LD_SAME[i]]) !== JSON.stringify(b[LD_SAME[i]])) return false;
    var da = rowDef(sys, a), db = rowDef(sys, b);
    return rowLvl(sl, a, da && da.def) === rowLvl(sl, b, db && db.def) && rowOn(sl, a) === rowOn(sl, b);
}
function loadSrc(sys, spec) { var ld = isObj(spec) && isObj(spec.load) ? spec.load : null, sf = ld && isObj(sys) && Array.isArray(sys.fields) ? fieldById(sys, ld.from) : null; return sf && sf.kind === 'item-list' && isObj(sf.list) && isObj(sf.list.lvl) ? sf : null; }
function loadMax(sys, spec, row) { if (!isObj(row) || !isObj(row.ld)) return 0; var sf = loadSrc(sys, spec); if (!sf) return 0; var rd = rowDef(sys, row.ld); return rowLvl(sf.list, null, rd ? rd.def : null); }   // the copy's full level: its entry's own, else the source list's default
// Matched by (spec.load.by, a stat of the host list; to, a stat of the source list): a source row fits a host row only where the two read the same
// figure, each as its row reads it (its own values over its entry). With none named every row fits
function loadFits(sys, spec, h, sl, s) { var ld = isObj(spec) && isObj(spec.load) ? spec.load : null; if (!ld || !ld.by || !ld.to) return true; var hd = rowDef(sys, h), sd = rowDef(sys, s); return rowStat(spec, hd ? hd.def : null, ld.by) === rowStat(sl, sd ? sd.def : null, ld.to); }
function rowLoad(sys, char, f, list, spec, q, opts, at, vo, F) {
    var ld = isObj(spec) && isObj(spec.load) ? spec.load : null, sf = loadSrc(sys, spec), sl = sf ? sf.list : null;
    if (!ld || !sf || sf.id === f.id) return { ok: false, reason: 'field' };
    if (opts.player && ((sf.edit !== 'owner' && !openChar(char)) || sf.vis !== 'all')) return { ok: false, reason: 'field' };
    if (typeof q.rowId !== 'string' || !ROW_ID.test(q.rowId)) return { ok: false, reason: 'value' };
    var hi = at(q.rowId); if (hi < 0 || list[hi].hid === 1) return { ok: false, reason: 'missing' };
    var h = list[hi], t = null; (Array.isArray(spec.counters) ? spec.counters : []).forEach(function(x) { if (!t && isObj(x) && x.key === ld.ct) t = x; });
    if (!t) return { ok: false, reason: 'field' };
    if ((h.qty | 0) !== 1) return { ok: false, reason: 'value' };   // a stack of them is not one
    var from = typeof q.from === 'string' ? q.from : null; if (from === null && !isObj(h.ld)) return { ok: false, reason: 'value' };
    var ldN = playerNeeds(sys, f.id, spec, opts, 'load'); if (from !== null && ldN && typeof ldN.needs === 'string' && ldN.needs && !switchOk(sys, char, f, h, ldN.needs, F)) return { ok: false, reason: 'needs', msg: rollNeedsSays(ldN) };   // Loads only where: this row loads nothing (the GM's hand too: it is what the row is)
    var sList = JSON.parse(JSON.stringify(isObj(char) && isObj(char.values) && Array.isArray(char.values[sf.id]) ? char.values[sf.id] : [])), known = knownItems(sys, opts), name = '';
    h.ct = isObj(h.ct) ? h.ct : {};
    if (isObj(h.ld)) {   // what comes out first: the copy, at what the counter has left
        var bk = JSON.parse(JSON.stringify(h.ld)); bk.qty = 1; bk.lvl = lvlClamp(sl.lvl, rowCt(h, t)); if (isObj(sl.on)) bk.on = sl.on.def === true; else delete bk.on;
        var sj = -1; for (var j = 0; j < sList.length; j++) if (loadSame(sys, sl, sList[j], bk)) { sj = j; break; }
        if (sj >= 0) sList[sj].qty = clampNum((sList[sj].qty | 0 || 1) + 1, 1, LIMITS.maxQty);
        else {
            if (!rowIdFree(sList, q.back, known)) return { ok: false, reason: 'value' };
            if (sList.filter(function(r) { return !(isObj(r) && r.hid === 1); }).length >= LIMITS.carried) return { ok: false, reason: 'field' };
            var nr = { id: q.back }; Object.keys(bk).forEach(function(k) { if (!(k in Object.prototype)) nr[k] = bk[k]; }); var cr = cleanRow(nr, vo.items, sl); if (!cr) return { ok: false, reason: 'value' }; sList.push(cr);
        }
        delete h.ld; h.ct[t.key] = 0;
    }
    if (from !== null) {   // then one unit of the row picked
        var si = -1; for (var k2 = 0; k2 < sList.length; k2++) if (rowIdOf(sList[k2]) === from) { si = k2; break; }
        var s = si >= 0 ? sList[si] : null, sd = s ? rowDef(sys, s) : null;
        if (!s || !sd || !isObj(sd.def) || s.hid === 1 || typeof s.opn === 'string' || s.keptOn === 1 || isObj(s.ld)) return { ok: false, reason: 'missing' };
        if (Array.isArray(ld.cats) && !catIn(ld.cats, sd.def.category)) return { ok: false, reason: 'missing' };
        if (!loadFits(sys, spec, h, sl, s)) return { ok: false, reason: 'value', msg: 'That does not fit it.' };   // Matched by: the two stats read the same figure   // outside the categories it takes (the players' view left with none: none)
        var cp = cleanLd(s, vo.items, sl); if (!cp) return { ok: false, reason: 'value' };
        var held = rowLvl(sl, s, sd.def);
        if ((s.qty | 0) > 1) s.qty = (s.qty | 0) - 1; else sList.splice(si, 1);
        h.ld = cp; h.ct[t.key] = Math.max(0, Math.min(1e6, Math.round(fin(held) ? held : 0))); name = sd.def.name || 'Item';
    }
    var also = {}; also[sf.id] = sList;
    return { ok: true, value: list, also: also, row: q.rowId, qty: 1, name: name, from: sf.id };
}
// [systemcheck:load-end]
// [systemcheck:chamber-start]
// 1.5.9 Chambers from (the owner, by prompt on 2026-10-25: "A cell and a round", after a sheet website's own grenade launchers). A row of a list with
// spec.chamber holds rounds in a chamber of its own (rd, copies in the order they went in, at most its cap): chamber takes ONE unit off a row of
// the chamber's list (another list, or this very one: rounds may stand beside the weapons) that the chamber takes (chamberTakes: its categories and
// its Matched by), and unchamber gives the last one in back, onto a stack only where it is the same thing in the same state (loadSame), else as a
// row of its own under q.back. A roll's Then with fire takes the first one out and keeps it as the round last fired (fd; applyAct). A player needs
// the right to change both lists. Answers the host list as value and, where the round list is another, that list in also
// 1.6.0, backlog 180 R14: rows in rows. partsSrc, the item list a list's parts come from; partHost, the host a part is added to: a row of a list whose
// parts come from fieldId, by its id, never itself a part (one level), never a row kept from its player; partsOf, a host's parts on a character
function partsSrc(sys, spec) { var p = isObj(spec) && isObj(spec.parts) ? spec.parts : null, sf = p && isObj(sys) && Array.isArray(sys.fields) ? fieldById(sys, p.from) : null; return sf && sf.kind === 'item-list' ? sf : null; }
// 198 (the SotMW session, 2026-10-28): which rows of a list may hold parts. A list's parts.hosts names the categories a host may be; none
// named, every row that is no part itself. The sheet's add control and the host's judge (partHost) both ask it
function partHostOk(sys, hspec, row) {
    if (!isObj(row) || typeof row.in === 'string') return false;
    var hs = isObj(hspec) && isObj(hspec.parts) && Array.isArray(hspec.parts.hosts) ? hspec.parts.hosts : null; if (!hs || !hs.length) return true;
    var rd = rowDef(sys, row); return !!(rd && isObj(rd.def)) && catIn(hs, rd.def.category);
}
function partHost(sys, char, fieldId, rid, player) {
    var out = null;
    (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(hf) {
        if (out || !isObj(hf) || hf.kind !== 'item-list' || !isObj(hf.list) || !isObj(hf.list.parts) || hf.list.parts.from !== fieldId) return;
        (isObj(char) && isObj(char.values) && Array.isArray(char.values[hf.id]) ? char.values[hf.id] : []).forEach(function(r) { if (!out && isObj(r) && rowIdOf(r) === rid && partHostOk(sys, hf.list, r) && !(player && r.hid === 1)) out = { f: hf, row: r }; });
    });
    return out;
}
// 1.6.0 (v2, B6; the SotMW session's v2 sort, 2026-10-29: a limb's upgrade slots): where a list's parts say capBy, a host row holds as many parts
// (their quantities added) as its own figure in that number stat reads, 0 or more; none where the list says no capBy or the figure is no number.
// The add and the custom op ask it (the GM's hand and a player's alike, as a full launcher refuses a round), and the sheet's add control
function partsRoom(sys, hspec, hostRow, list, hostId) {
    var p = isObj(hspec) && isObj(hspec.parts) ? hspec.parts : null; if (!p || typeof p.capBy !== 'string' || !p.capBy || !isObj(hostRow)) return null;
    var d = rowDef(sys, hostRow), c = d ? rowStat(hspec, d.def, p.capBy) : null; if (typeof c !== 'number' || !fin(c)) return null;
    var used = 0; (Array.isArray(list) ? list : []).forEach(function(r) { if (isObj(r) && r.in === hostId) used += Math.max(1, r.qty | 0); });
    return { cap: Math.max(0, Math.floor(c)), used: used, name: d && d.def && d.def.name ? String(d.def.name) : 'That row' };
}
function partsFullSays(rm) { return rm.cap ? rm.name + ' holds ' + rm.cap + (rm.cap === 1 ? ' part' : ' parts') + ' at most, and ' + (rm.used ? 'has ' + rm.used + ' already.' : 'that would be more.') : rm.name + ' holds no parts.'; }
function partsOf(sys, char, spec, hostId) { var sf = partsSrc(sys, spec); if (!sf || typeof hostId !== 'string') return []; return (isObj(char) && isObj(char.values) && Array.isArray(char.values[sf.id]) ? char.values[sf.id] : []).filter(function(r) { return isObj(r) && r.in === hostId && r.hid !== 1; }); }
// 1.6.0 R14 (the owner, 2026-10-28: "make Undo after removing a row bring its parts back too, for the GM and for players"): a host's parts as they
// stood, for its Undo: { f, the parts' list; rows: [{ row, at }] } by their places in that list, kept ones too (removal takes them all), or null
function partsKept(sys, spec, values, hostId) {
    var sf = partsSrc(sys, spec); if (!sf || typeof hostId !== 'string' || !isObj(values)) return null;
    var rows = []; (Array.isArray(values[sf.id]) ? values[sf.id] : []).forEach(function(r, ix) { if (isObj(r) && r.in === hostId) rows.push({ row: JSON.parse(JSON.stringify(r)), at: ix }); });
    return rows.length ? { f: sf.id, rows: rows } : null;
}
// ... and put back into a list (in place): each row of that host, by its place, ascending, never one whose id the list already holds
function partsPut(list, kept, hostId) {
    if (!Array.isArray(list) || !isObj(kept) || !Array.isArray(kept.rows)) return 0; var n = 0;
    kept.rows.filter(function(p) { return isObj(p) && isObj(p.row) && p.row.in === hostId; }).slice(0, LIMITS.carried).sort(function(a, b) { return (cleanNum(a.at, 0) | 0) - (cleanNum(b.at, 0) | 0); }).forEach(function(p) {
        var pid = rowIdOf(p.row); if (!pid || list.some(function(r) { return rowIdOf(r) === pid; })) return;
        list.splice(Math.max(0, Math.min(list.length, cleanNum(p.at, list.length) | 0)), 0, JSON.parse(JSON.stringify(p.row))); n++;
    });
    return n;
}
function chamberSrc(sys, spec) { var ch = isObj(spec) && isObj(spec.chamber) ? spec.chamber : null, sf = ch && isObj(sys) && Array.isArray(sys.fields) ? fieldById(sys, ch.from) : null; return sf && sf.kind === 'item-list' ? sf : null; }
// Matched by (spec.chamber.by, a stat of the host list; to, a stat of the round list): a round fits a host row only where the two read the same figure
function chamberFits(sys, spec, h, sl, s) { var ch = isObj(spec) && isObj(spec.chamber) ? spec.chamber : null; if (!ch || !ch.by || !ch.to) return true; var hd = rowDef(sys, h), sd = rowDef(sys, s); return rowStat(spec, hd ? hd.def : null, ch.by) === rowStat(sl, sd ? sd.def : null, ch.to); }
// a row the chamber may take a unit of: live, no launcher itself (it holds no chamber, no fired round, nothing loaded), of a category it takes, a match
function chamberTakes(sys, spec, h, sl, s) {
    var ch = isObj(spec) && isObj(spec.chamber) ? spec.chamber : null; if (!ch || !isObj(s) || s === h) return false;
    if (s.hid === 1 || typeof s.opn === 'string' || s.keptOn === 1 || isObj(s.ld) || Array.isArray(s.rd) || isObj(s.fd)) return false;
    var sd = rowDef(sys, s); if (!sd || !isObj(sd.def)) return false;
    if (Array.isArray(ch.cats) && !catIn(ch.cats, sd.def.category)) return false;
    return chamberFits(sys, spec, h, sl, s);
}
// Chambers only where (spec.chamber.needs, 1.5.9): whether a row may take a round now, by a formula of its own names (Row.*), no dice, as Loads only
// where; a formula that cannot be worked out holds it back. Unchamber is never judged, so no round is ever stranded
function chamberHolds(sys, char, f, row, F, by) { var ch = by !== undefined ? by : isObj(f) && isObj(f.list) && isObj(f.list.chamber) ? f.list.chamber : null; return !isObj(ch) || typeof ch.needs !== 'string' || !ch.needs || switchOk(sys, char, f, row, ch.needs, F); }   // by: the needs judged by (playerNeeds), else the list's own
// the review of 1.5.9's fold: the needs (Loads only where, Chambers only where, a switch's needs) a PLAYER's own change is judged by on the host:
// their own view's, so needs that read a GM-only value, which their view does not hold, never hold them back, as a list roll's do not, and the
// words of such needs never reach them in a refusal; with no view (fail closed) the GM's needs, said in no words of theirs. The GM's hand: the list's
function playerNeeds(sys, fieldId, spec, opts, key) {
    var g = isObj(spec) && isObj(spec[key]) ? spec[key] : null; if (!opts || !opts.player) return g;
    if (!isObj(opts.view)) return g && typeof g.needs === 'string' && g.needs ? { needs: g.needs, needsText: 'Not now.' } : null;
    var a = actorSpec(sys, fieldId, spec, opts); return a && isObj(a[key]) ? a[key] : null;
}
// the words a chamber is refused in where its row does not meet Chambers only where, else '' (a player's own app asks it before it sends)
function chamberSays(sys, char, fieldId, rowId, F) {
    var f = isObj(sys) && Array.isArray(sys.fields) ? fieldById(sys, fieldId) : null, list = f && isObj(char) && isObj(char.values) && Array.isArray(char.values[fieldId]) ? char.values[fieldId] : [], row = null;
    list.forEach(function(r) { if (!row && isObj(r) && rowIdOf(r) === rowId) row = r; });
    return f && f.kind === 'item-list' && row && !chamberHolds(sys, char, f, row, F) ? rollNeedsSays(f.list.chamber) : '';
}
function rowChamber(sys, char, f, list, spec, q, opts, at, vo, F) {
    var ch = isObj(spec) && isObj(spec.chamber) ? spec.chamber : null, sf = chamberSrc(sys, spec), same = !!(sf && sf.id === f.id);
    if (!ch || !sf) return { ok: false, reason: 'field' };
    if (opts.player && !same && ((sf.edit !== 'owner' && !openChar(char)) || sf.vis !== 'all')) return { ok: false, reason: 'field' };
    if (typeof q.rowId !== 'string' || !ROW_ID.test(q.rowId)) return { ok: false, reason: 'value' };
    var hi = at(q.rowId); if (hi < 0 || !isObj(list[hi]) || list[hi].hid === 1) return { ok: false, reason: 'missing' };
    var h = list[hi]; if ((h.qty | 0) !== 1) return { ok: false, reason: 'value' };   // a stack of them is not one
    var sl = isObj(sf.list) ? sf.list : null, sList = same ? list : JSON.parse(JSON.stringify(isObj(char) && isObj(char.values) && Array.isArray(char.values[sf.id]) ? char.values[sf.id] : []));
    var cap = chamberCap(spec, sys, h), rd = Array.isArray(h.rd) ? h.rd.slice() : [], name = '';   // the review of fold 2: the row's own Holds where the list reads it from a stat
    if (q.op === 'chamber') {
        var chN = playerNeeds(sys, f.id, spec, opts, 'chamber'); if (!chamberHolds(sys, char, f, h, F, chN)) return { ok: false, reason: 'needs', msg: rollNeedsSays(chN) };   // Chambers only where: this row takes no round now (the GM's hand too: it is what the row is)
        if (rd.length >= cap) return { ok: false, reason: 'value', msg: 'It is full: it holds ' + cap + ' at most.' };
        var from = typeof q.from === 'string' ? q.from : '', si = -1; for (var k = 0; k < sList.length; k++) if (rowIdOf(sList[k]) === from) { si = k; break; }
        var s = si >= 0 ? sList[si] : null, sd = s ? rowDef(sys, s) : null;
        if (!s || s === h || !sd || !isObj(sd.def) || s.hid === 1 || typeof s.opn === 'string' || s.keptOn === 1) return { ok: false, reason: 'missing' };
        if (!chamberTakes(sys, spec, h, sl, s)) return { ok: false, reason: 'value', msg: 'That does not fit it.' };   // its categories, its Matched by, or a launcher itself
        var cp = cleanRd(s, vo.items, sl); if (!cp) return { ok: false, reason: 'value' };
        if ((s.qty | 0) > 1) s.qty = (s.qty | 0) - 1; else sList.splice(si, 1);
        rd.push(cp); h.rd = rd; name = sd.def.name || 'Item';
    } else {   // unchamber: the last one in comes out
        if (!rd.length) return { ok: false, reason: 'value', msg: 'Nothing is chambered.' };
        var bk = JSON.parse(JSON.stringify(rd[rd.length - 1])); bk.qty = 1; if (isObj(sl) && isObj(sl.on)) bk.on = sl.on.def === true; else delete bk.on;
        var sj = -1; if (!(sl && sl.noQty)) for (var j = 0; j < sList.length; j++) if (sList[j] !== h && loadSame(sys, sl, sList[j], bk)) { sj = j; break; }
        if (sj >= 0) sList[sj].qty = clampNum((sList[sj].qty | 0 || 1) + 1, 1, LIMITS.maxQty);
        else {
            if (!rowIdFree(sList, q.back, knownItems(sys, opts))) return { ok: false, reason: 'value' };
            if (sList.filter(function(r) { return !(isObj(r) && r.hid === 1); }).length >= LIMITS.carried) return { ok: false, reason: 'field' };
            var nr = { id: q.back }; Object.keys(bk).forEach(function(kk) { if (!(kk in Object.prototype)) nr[kk] = bk[kk]; }); var cr = cleanRow(nr, vo.items, sl); if (!cr) return { ok: false, reason: 'value' }; sList.push(cr);
        }
        rd.pop(); if (rd.length) h.rd = rd; else delete h.rd;
        var bd = rowDef(sys, bk); name = (bd && bd.def && bd.def.name) || 'Item';
    }
    var res = { ok: true, value: list, row: q.rowId, qty: 1, name: name, from: sf.id };
    if (!same) { var also = {}; also[sf.id] = sList; res.also = also; }
    return res;
}
// [systemcheck:chamber-end]
function rowIdFree(list, rid, known) { return typeof rid === 'string' && ROW_ID.test(rid) && !list.some(function(r) { return rowIdOf(r) === rid; }) && !known.some(function(it) { return isObj(it) && typeof it.id === 'string' && 'w_' + it.id.slice(2) === rid; }); }
function knownItems(sys, opts) { return opts.player ? (opts.view && Array.isArray(opts.view.items) ? opts.view.items : []) : (Array.isArray(sys.items) ? sys.items : []); }
// F4c3 (D2): whether a key is taken in a list — by another row's definition (rowDef: a library copy, a deleted item's copy, a custom row) or by
// an item or core entry the list offers (its categories; a players' view's empty list offers none; none named: every one — findRow's scope,
// owed review F4c3#1). Judged on what the actor can see:
// a player never counts a row kept out of their sight or a GM-only one and reads the items of their own view, so a GM-only key is never
// confirmed and the host and their client agree. The row itself (rid) never counts
function keyClash(sys, list, rid, key, spec, opts) {
    var lk = lower(key), pl = !!opts.player, cats = isObj(spec) && Array.isArray(spec.cats) ? spec.cats : null;
    var inRows = list.some(function(r) {
        if (!isObj(r) || rowIdOf(r) === rid || (pl && r.hid === 1)) return false;
        var rd = rowDef(sys, r), d = rd ? rd.def : null; if (!isObj(d) || (pl && d.vis === 'gm')) return false;
        return typeof d.key === 'string' && lower(d.key) === lk;
    });
    var src = pl ? (isObj(opts.view) ? opts.view : {}) : sys, its = (Array.isArray(src.items) ? src.items : []).concat(Array.isArray(src.core) ? src.core : []);   // a player's own view (its core has no GM-only entry), the GM's whole
    return inRows || its.some(function(it) { return isObj(it) && !(pl && it.vis === 'gm') && typeof it.key === 'string' && lower(it.key) === lk && (!cats || catIn(cats, it.category)); });
}
// Stage 6 F4c3: a custom row (the character's own item), made or changed — the GM's on any list shaped in the Lists tab; its owner's where the
// list takes custom rows (Custom rows): a new row (stored as theirs, own, and visible) or one they made (never one the GM made or made GM
// only), and only its name, icon, category, notes, key and stats (a partial merge: the GM's fields on it stay). A new row starts as "New item"
// with the list's level and switch defaults and answers added (a pickup's Undo, as any new item); a create replayed over the host's copy is a
// patch of the row it made. A key (D2): a usable item key that no row or item of the list uses, as the actor sees them (why badkey / key: the
// answer's own, never sent). The rest as the ov op's: a text null or blank clears (a blank name keeps the name), stats per key of the list
// (null clears one; stats null all), a blast in whole feet 1..3000, formulas that parse (a cost without dice; why formula), a lock bound or
// curse (null: none; the switch's only on a list with a switch; a message only with its lock), vis all or gm. Changes list in place and fills
// extra (the answer's row, qty; added and base for a new one); null once applied, else the refusal
var CUSTOM_OWN = Object.freeze({ name: 1, icon: 1, category: 1, notes: 1, key: 1, stats: 1, mods: 1, modsOn: 1, desc: 1, lvls: 1 });   // 155: and its own long text   // F6b: a player's own row may change their character, as their ad hoc effects may
function applyCustom(sys, list, q, spec, F, opts, extra, aspec, fill) {   // aspec (F5a2): the actor's own list options; fill (Onboarding F4): a file filling a character in the making
    var pl = !!opts.player, pd = q.def, rid = q.rowId, bad = { ok: false, reason: 'value' };
    var blank = function(x) { return x === null || (typeof x === 'string' && !x.trim()); }, said = function(x) { return typeof x === 'string' && !!x.trim(); };
    if (!spec || (pl && spec.custom !== true && fill !== true)) return { ok: false, reason: 'field' };   // a list shaped in the Lists tab (the GM); its Custom rows ticked (a player; a file filling one in the making, whatever the list)
    if (!isObj(pd)) return bad;
    var ks = Object.keys(pd); if (pl && ks.some(function(k) { return CUSTOM_OWN[k] !== 1; })) return { ok: false, reason: 'field' };   // the GM's fields: a blast, formulas, locks, vis
    var idx = -1; for (var i = 0; i < list.length; i++) if (isObj(list[i]) && rowIdOf(list[i]) === rid) { idx = i; break; }
    var rw;
    if (idx >= 0) {
        rw = list[idx];
        if (pl && rw.hid === 1) return { ok: false, reason: 'missing' };   // a kept curse reads as gone to a player
        if (typeof rw.defId === 'string' || rw.lnk === 1 || !isObj(rw.def)) return { ok: false, reason: 'field' };   // a library copy (or a deleted one's) changes with ov
        if (pl && (rw.own !== 1 || rw.def.vis === 'gm')) return { ok: false, reason: 'field' };   // a row the GM made, or made GM only, is the GM's
    } else {
        if (!rowIdFree(list, rid, knownItems(sys, opts))) return bad;
        if (list.filter(function(r) { return !(isObj(r) && r.hid === 1); }).length >= LIMITS.carried) return { ok: false, reason: 'field' };   // kept curses never count against what the player sees
        rw = { id: rid, qty: 1 };
        if (isObj(spec.lvl)) rw.lvl = lvlClamp(spec.lvl, spec.lvl.def);   // the facts as an add writes them (the list's defaults)
        if (isObj(spec.on)) rw.on = spec.on.def === true;
        rw.def = { name: 'New item', category: '', icon: '', notes: '', vis: 'all' }; if (pl) rw.own = 1;
        list.push(rw); extra.base = 0; extra.added = 1;
    }
    var d = JSON.parse(JSON.stringify(rw.def));
    for (var j = 0; j < ks.length; j++) {
        var k = ks[j], v = pd[k];
        if (k === 'name' || k === 'icon' || k === 'category' || k === 'notes' || k === 'rmMsg' || k === 'eqMsg') {
            if (k === 'eqMsg' && !blank(v) && !isObj(spec.on)) return bad;
            if (blank(v)) { if (k === 'rmMsg' || k === 'eqMsg') delete d[k]; else if (k !== 'name') d[k] = ''; continue; }
            if (typeof v !== 'string') return bad;
            var t = k === 'icon' ? cleanIcon(v) : k === 'notes' ? str(v, LIMITS.text).replace(CTRL_RE_G, ' ') : cutText(v, k === 'name' ? LIMITS.itemName : k === 'category' ? LIMITS.category : LIMITS.rmMsg);
            if (!t || !t.trim()) return bad;   // text that cleans to nothing (an icon that is not bundled)
            d[k] = t;
        } else if (k === 'key') {
            if (blank(v)) { delete d.key; continue; }
            if (typeof v !== 'string') return bad;
            var ck = cleanItemKey(v.trim(), F); if (!ck) return { ok: false, reason: 'value', why: 'badkey' };
            if (keyClash(sys, list, rid, ck, spec, opts)) return { ok: false, reason: 'value', why: 'key' };
            d.key = ck;
        } else if (k === 'damage' || k === 'cost') {
            if (blank(v)) { delete d[k]; continue; }
            var fm = typeof v === 'string' ? cleanFormulaText(v) : null, pp = fm && F && F.parse ? F.parse(fm) : null;
            if (!pp || !pp.ok || (k === 'cost' && hasDice(pp.ast.body))) return { ok: false, reason: 'value', why: 'formula' };
            d[k] = fm;
        } else if (k === 'area') {
            if (v === null) { delete d.area; continue; }
            if (!isObj(v) || typeof v.ft !== 'number' || v.ft !== Math.floor(v.ft) || v.ft < 1 || v.ft > LIMITS.maxBlastFt) return bad;
            d.area = { ft: v.ft, shape: 'circle', name: cutText(v.name, LIMITS.label) };
        } else if (k === 'rm' || k === 'eq') {
            if (v === null) { delete d[k]; continue; }
            if (RM_MODES[v] !== 1 || (k === 'eq' && !isObj(spec.on))) return bad;
            d[k] = v;
        } else if (k === 'vis') {
            if (v !== 'gm' && v !== 'all') return bad;
            d.vis = v;
        } else if (k === 'mods') {   // Stage 6 F6b: its changes to the character — a player's name fields of their own view only (as an ad hoc effect's)
            var fkC = pl ? fieldKinds(opts.view || null) : fieldKinds(sys);
            var fkS = pl ? fieldKinds(sys) : null, keepC = pl ? (Array.isArray(d.mods) ? d.mods : []).filter(function(mm) { return isObj(mm) && typeof mm.f === 'string' && !fkC[mm.f] && !!fkS[mm.f]; }) : [];   // F11b: a player's edit keeps the changes to fields they do not see (the host set them; their own list never names them), while those fields are the system's
            if (v === null || (Array.isArray(v) && !v.length)) { if (keepC.length) d.mods = keepC; else { delete d.mods; delete d.modsOn; } continue; }
            if (!Array.isArray(v) || v.length > LIMITS.effectMods || v.some(function(mm) { return !isObj(mm) || typeof mm.f !== 'string' || !fkC[mm.f]; })) return bad;
            var cmC = cleanItemMods(v, fkC); if (!cmC || cmC.length !== v.length) return bad;   // every one a change that field takes
            d.mods = cmC.concat(keepC).slice(0, LIMITS.effectMods);   // theirs first and whole: what they see never depends on what they do not (a hidden change gives way only when their own fill the row)
        } else if (k === 'desc') {   // 155: a row of its own's description, prose with its line breaks, as a library entry's
            if (blank(v)) { delete d.desc; continue; }
            if (typeof v !== 'string') return bad;
            var dsc = cleanDesc(v); if (dsc.trim()) d.desc = dsc; else delete d.desc;
        } else if (k === 'lvls') {   // ... and what each of its levels gives, as a library entry's
            if (v === null || (Array.isArray(v) && !v.length)) { delete d.lvls; continue; }
            if (!Array.isArray(v)) return bad;
            var lvC = cleanLvls(v); if (lvC) d.lvls = lvC; else delete d.lvls;
        } else if (k === 'modsOn') {
            if (v === null) { delete d.modsOn; continue; }
            if (v !== true || !isObj(spec.on)) return bad;   // only on a list with a switch
            d.modsOn = true;
        } else if (k === 'stats') {
            if (v === null) { delete d.stats; continue; }
            if (!isObj(v)) return bad;
            var st = isObj(d.stats) ? d.stats : {}, sks = Object.keys(v);
            for (var m = 0; m < sks.length; m++) {
                var sk = sks[m], sx = v[sk], canon = '';
                (Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (!canon && isObj(s) && typeof s.key === 'string' && lower(s.key) === lower(sk)) canon = s.key; });
                if (!canon) return bad;
                if (sx !== null && (statDefOf(spec, canon) || {}).kind === 'pick') { sx = pickLabel(aspec === undefined ? spec : aspec, canon, sx); if (!sx) return bad; }   // F5a2: a choice: one of the actor's option labels
                else if (sx !== null && statNum(sx) === undefined) return bad;
                Object.keys(st).forEach(function(k2) { if (lower(k2) === lower(canon)) delete st[k2]; });   // one spelling a key: the list's
                if (sx !== null) st[canon] = sx;
            }
            if (Object.keys(st).length) d.stats = st; else delete d.stats;
        } else return bad;
    }
    if ((said(pd.rmMsg) && RM_MODES[d.rm] !== 1) || (said(pd.eqMsg) && RM_MODES[d.eq] !== 1)) return bad;   // a message only with its lock (the cleaner keeps none without one)
    if (pd.desc !== undefined || pd.lvls !== undefined) { var lnN = ownLongOf(list, rw, d); if (lnN > LIMITS.ownText && lnN > ownLongOf(list, null, null)) return { ok: false, reason: 'long' }; }   // 155: a list's own rows hold LIMITS.ownText of long text in all; a change that takes them further past it is refused, one that brings them down never
    rw.def = d; if (idx < 0 && rw.on === true && onHeld(sys, spec, list, list.indexOf(rw), pl ? (aspec || spec) : spec)) rw.on = false;   // 1.5.4 One at a time: a new row starts off while its group holds one on (read with its stats)
    extra.row = rid; extra.qty = rw.qty | 0;   // critic 9d: every answer carries its quantity (without it the pickup's Undo would come down on the first change)
    return null;
}
// A copy of an entry that has just left the library keeps the entry as it was, so the character still has the item (prevSys: the system
// before the change). Returns how many rows were given a copy; the rows are changed in place.
function orphanRows(prevSys, sys, chars) {
    if (!isObj(prevSys) || !isObj(sys) || !isObj(chars)) return 0;
    var had = map(), now = map(), n = 0;
    (Array.isArray(prevSys.items) ? prevSys.items : []).forEach(function(it) { if (isObj(it) && typeof it.id === 'string') had[it.id] = it; });
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) { if (isObj(it) && typeof it.id === 'string') now[it.id] = 1; });
    var lists = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list'; });
    Object.keys(chars).forEach(function(cid) {
        var c = chars[cid]; if (!isObj(c) || !isObj(c.values)) return;
        lists.forEach(function(f) { var v = c.values[f.id]; if (!Array.isArray(v)) return; v.forEach(function(r) { if (isObj(r) && typeof r.defId === 'string' && !now[r.defId] && had[r.defId] && !r.snap) { r.snap = cleanRowDef(had[r.defId], true); n++; } }); });
    });
    return n;
}
// Stage 6 library L2c: the copies library rows carry (snap) kept current — every row whose entry the system's own items do not answer and
// the lookup does (the GM machine's library) takes the entry as the GM's view holds it. In place. A row whose entry is gone keeps its copy
// (the "not in library" copy). Returns { rows, chars } changed
function libSnaps(sys, chars, lookup) {
    var out = { rows: 0, chars: 0 }; if (!isObj(sys) || !isObj(chars) || typeof lookup !== 'function') return out;
    var lists = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list' && typeof f.id === 'string'; });
    Object.keys(chars).forEach(function(cid) {
        var c = chars[cid], hit = false; if (!isObj(c) || !isObj(c.values)) return;
        lists.forEach(function(f) { var v = c.values[f.id]; if (!Array.isArray(v)) return; v.forEach(function(r) {
            if (!isObj(r) || typeof r.defId !== 'string' || itemDef(sys, r.defId)) return;
            var e = lookup(r.defId); if (!isObj(e)) return;
            var want = cleanRowDef(e, true); if (!want || JSON.stringify(want) === JSON.stringify(r.snap)) return;
            r.snap = want; out.rows++; hit = true;
        }); });
        if (hit) out.chars++;
    });
    return out;
}
// Stage 6 library L4: how many rows, on how many characters, carry an entry (kept curses too: the GM's count) — the Library form's header
function carriedBy(sys, chars, id) {
    var out = { rows: 0, chars: 0 }; if (!isObj(sys) || !isObj(chars) || typeof id !== 'string') return out;
    var lists = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list'; });
    Object.keys(chars).forEach(function(cid) { var c = chars[cid], n = 0; if (!isObj(c) || !isObj(c.values)) return; lists.forEach(function(f) { var v = c.values[f.id]; if (Array.isArray(v)) v.forEach(function(r) { if (isObj(r) && r.defId === id) n++; }); }); if (n) { out.rows += n; out.chars++; } });
    return out;
}
// Stage 6: a legacy row (no id) of a GM-only item, or of a deleted one's GM-only copy, takes an id of its own — its derived id would show its
// owner the item's library id. Run on the GM's machine (a system save, the start of hosting). Returns how many rows were given one (in place).
function stampRows(sys, chars) {
    if (!isObj(sys) || !isObj(chars)) return 0;
    var secret = map(), n = 0;
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) { if (isObj(it) && typeof it.id === 'string' && it.vis === 'gm') secret[it.id] = 1; });
    var lists = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list'; });
    Object.keys(chars).forEach(function(cid) {
        var c = chars[cid]; if (!isObj(c) || !isObj(c.values)) return;
        lists.forEach(function(f) { var v = c.values[f.id]; if (!Array.isArray(v)) return; v.forEach(function(r) { if (isObj(r) && !r.id && typeof r.defId === 'string' && (secret[r.defId] === 1 || (isObj(r.snap) && r.snap.vis === 'gm'))) { r.id = uid('w_'); n++; } }); });
    });
    return n;
}
// Stage 6 F4c2: how far a library edit reaches (a Save) — for each entry both systems hold whose GM-view definition changed, the characters
// carrying it (a row of it without a copy of its own: a kept curse counts, a deleted one's copy does not; a character once however many rows)
// and how many of them have their own value of a changed field (a stat by its list's label). An entry nobody carries says nothing. Pure;
// prevSys may be absent (a first save). { lines: one per entry, text: the one line, or a summary of several }
var REACH_KEYS = ['name', 'icon', 'category', 'notes', 'area', 'damage', 'cost', 'throwSkill', 'rm', 'rmMsg', 'eq', 'eqMsg', 'key', 'lvl', 'vis', 'mods', 'modsOn'];   // F6: what it changes on the character too
var REACH_WORD = Object.freeze({ name: 'name', icon: 'icon', category: 'category', notes: 'notes', area: 'blast', damage: 'damage', cost: 'cost formula', rm: 'removal lock', rmMsg: 'removal message', eq: 'switch lock', eqMsg: 'switch message' });
function itemReach(prevSys, sys, chars, opts) {   // opts.lib (Stage 6 library L4): library entries — their rows always carry a copy (snap), which here is no deleted one's
    var out = { lines: [], text: '' }; if (!isObj(prevSys) || !isObj(sys)) return out;
    var had = map(), who = map(), nWho = 0, lists = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list' && typeof f.id === 'string'; });
    var sm = function(st) { var m = map(); if (isObj(st)) Object.keys(st).forEach(function(k) { m[lower(k)] = st[k]; }); return m; }, js = function(x) { return JSON.stringify(x === undefined ? null : x); };
    (Array.isArray(prevSys.items) ? prevSys.items : []).forEach(function(it) { if (isObj(it) && typeof it.id === 'string') had[it.id] = it; });
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {
        if (!isObj(it) || typeof it.id !== 'string' || !had[it.id]) return;
        var a = had[it.id], ch = REACH_KEYS.filter(function(k) { return js(a[k]) !== js(it[k]); }), sa = sm(a.stats), sb = sm(it.stats), sk = [];
        Object.keys(sa).concat(Object.keys(sb)).forEach(function(k) { if (sk.indexOf(k) < 0 && js(sa[k]) !== js(sb[k])) sk.push(k); });
        if (!ch.length && !sk.length) return;
        var n = 0, own = 0, words = [];
        Object.keys(isObj(chars) ? chars : {}).forEach(function(cid) {
            var c = chars[cid]; if (!isObj(c) || !isObj(c.values)) return;
            var carries = false, owns = false;
            lists.forEach(function(f) {
                var v = c.values[f.id]; if (!Array.isArray(v)) return;
                v.forEach(function(r) {
                    if (!isObj(r) || r.defId !== it.id || (r.snap && !(opts && opts.lib))) return;
                    carries = true; var ov = isObj(r.ov) ? r.ov : null; if (!ov) return;
                    ch.forEach(function(k) { if (REACH_WORD[k] && ov[k] !== undefined) { owns = true; if (words.indexOf(REACH_WORD[k]) < 0) words.push(REACH_WORD[k]); } });
                    if (isObj(ov.stats)) Object.keys(ov.stats).forEach(function(k) {
                        if (sk.indexOf(lower(k)) < 0) return;
                        var s = isObj(f.list) && Array.isArray(f.list.stats) ? f.list.stats.filter(function(x) { return isObj(x) && typeof x.key === 'string' && lower(x.key) === lower(k); })[0] : null, w = s && s.label ? s.label : k;
                        owns = true; if (words.indexOf(w) < 0) words.push(w);
                    });
                });
            });
            if (!carries) return;
            n++; if (owns) own++; if (!who[cid]) { who[cid] = 1; nWho++; }
        });
        if (!n) return;
        out.lines.push((it.name || 'Item') + ': affects ' + n + ' character' + (n === 1 ? '' : 's') + (own ? '; ' + own + (own === 1 ? ' has its own ' : ' have their own ') + words.join(', ') : '') + '.');
    });
    out.text = out.lines.length === 1 ? out.lines[0] : out.lines.length > 1 ? out.lines.length + ' changed items reach ' + nWho + ' character' + (nWho === 1 ? '' : 's') + ' (each is in the session log’s Items).' : '';
    return out;
}

/* ---------- the resolver: the engine reads a character's names through this ---------- */
function noDice() { return NaN; }   // a die inside a definition fails at the die: "The random source returned NaN"
function storedOf(field, char) {
    var v = char && char.values ? char.values[field.id] : undefined;
    if (v === undefined) return field.kind === 'resource' ? (field.def === 'max' ? { cur: null } : { cur: field.def }) : field.kind === 'notes' ? '' : (field.kind === 'item-list' || field.kind === 'effects') ? [] : field.def;
    return v;
}
// 5h: every change the character's active effects make, keyed by the name the resolver works it out under (a key, or "key.max" for a
// resource's max), in a fixed order (fields, then rows) so every machine adds in the same order. Null when nothing applies: the resolver
// then behaves exactly as before. Each change is checked against the field's CURRENT kind (the system may have moved on since the row).
function rowModSlot(listKey, key, col) { return lower(listKey) + '#k:' + lower(key) + '.' + lower(col); }   // 1.5.8: where a change aimed at one row is kept
// 1.5.8 Counted once (the owner, 2026-10-25, by prompt: "Paired traits counted once"): of a list whose options name a group stat (spec.once.by),
// the rows that read the same figure there, not 0, are one thing held two ways. Two rows or more make a group, and ONE of them applies: the
// higher by spec.once.rank (the row's level or a number stat), a tie going to the row with less given free (spec.once.free), then to the later
// row. items: [{ r: the stored row, d: its definition }]; inPlay (optional): which of them take part (a row whose changes are off by its switch
// does not, so the other row applies). A kept curse (hid) is in no group. Answers, item by item, null (no group) or { top, mem } (the index of
// the row that applies, and every member's), or null where the list counts nothing once. Read by fxIndex and unseenMods (a row that does not
// apply gives none of its changes), by the resolver's Row.once, Row.oncecost and Row.oncefree, and by the sheet's chip
function onceNum(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
function onceOf(spec, items, inPlay) {
    var o = isObj(spec) && isObj(spec.once) && typeof spec.once.by === 'string' && typeof spec.once.rank === 'string' ? spec.once : null; if (!o || !Array.isArray(items)) return null;
    var by = map(), keys = [], out = items.map(function() { return null; });
    items.forEach(function(it, i) {
        if (!isObj(it) || !isObj(it.r) || it.r.hid === 1 || (typeof inPlay === 'function' && !inPlay(it, i))) return;
        var g = rowStat(spec, it.d, o.by); if (typeof g !== 'number' || !isFinite(g) || g === 0) return;
        var gk = String(g); if (!by[gk]) { by[gk] = []; keys.push(gk); } by[gk].push(i);
    });
    var rk = function(i) { return onceNum(o.rank === 'lvl' ? rowLvl(spec, items[i].r, items[i].d) : rowStat(spec, items[i].d, o.rank)); }, fr = function(i) { return o.free ? onceNum(rowStat(spec, items[i].d, o.free)) : 0; };
    keys.forEach(function(gk) {
        var mem = by[gk]; if (mem.length < 2) return;
        var top = mem[0];
        for (var m = 1; m < mem.length; m++) { var i = mem[m], a = rk(i), b = rk(top); if (a > b || (a === b && (fr(i) < fr(top) || fr(i) === fr(top)))) top = i; }   // a tie: less given free, then the later row
        mem.forEach(function(i) { out[i] = { top: top, mem: mem.slice() }; });
    });
    return out;
}
function onceIn(sys, spec, rows) {   // a stored list's groups as its changes are gathered: a row whose changes are off by its switch takes no part
    if (!isObj(spec) || !isObj(spec.once) || !Array.isArray(rows)) return null;
    var items = rows.map(function(r) { var rd = isObj(r) ? rowDef(sys, r) : null; return { r: r, d: rd ? rd.def : null }; });
    return onceOf(spec, items, function(it) { return !(isObj(it.d) && it.d.modsOn === true && isObj(spec.on) && !rowOn(spec, it.r)); });
}
function fxIndex(sys, char, stance, autos) {   // conditions C3: stance (stanceCtx) — the posture the token takes, from the system's own list; C4: autos (autoEffectsOn) — the automatic effects on
    var idx = null, lib = null, byId = map(), seenRef = map();   // a library effect counts once per character, whichever list holds it
    (sys && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(x) { if (isObj(x) && typeof x.id === 'string') byId[x.id] = x; });
    var put = function(m, name, gm, mult) {   // one change onto the field it names (checked against that field's kind), with its source for the breakdown
        var tf = isObj(m) ? byId[m.f] : null; if (!tf) return;
        if (m.op === 'on') { if (tf.kind !== 'toggle') return; }
        else if (m.op === 'add' || MOD_LIM[m.op]) { if (typeof m.v !== 'number' || !isFinite(m.v)) return; if (tf.kind === 'item-list' ? m.part === 'max' || !rowModAim(m) : m.part === 'max' ? tf.kind !== 'resource' : !(tf.kind === 'number' || tf.kind === 'skill' || tf.kind === 'formula')) return; }
        else return;
        var v = m.op === 'add' ? m.v * mult : MOD_LIM[m.op] ? m.v : 0, key = tf.kind === 'item-list' ? rowModSlot(tf.key, m.key, m.col) : lower(tf.key) + (m.part === 'max' ? '.max' : '');
        idx = idx || map(); var slot = idx[key] || (idx[key] = { add: 0, on: false, src: [] });
        if (m.op === 'on') slot.on = true; else if (m.op === 'max') slot.lo = typeof slot.lo === 'number' ? Math.max(slot.lo, v) : v; else if (m.op === 'min') slot.hi = typeof slot.hi === 'number' ? Math.min(slot.hi, v) : v; else slot.add += v;
        srcKeep(slot.src, { name: name, op: m.op, v: v, gm: gm });   // 12 at most, a GM-only one kept past them
    };
    (sys && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (f.kind !== 'effects') return;
        var rows = char && char.values && Array.isArray(char.values[f.id]) ? char.values[f.id] : null; if (!rows || !rows.length) return;
        rows.forEach(function(r) {
            if (!isObj(r) || r.on === false) return;
            var def = r;
            if (typeof r.ref === 'string') { if (seenRef[r.ref]) return; if (!lib) { lib = map(); (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (d && typeof d.id === 'string') lib[d.id] = d; }); } def = lib[r.ref]; if (!def) return; seenRef[r.ref] = 1; }
            (Array.isArray(def.mods) ? def.mods : []).forEach(function(m) { put(m, def.name || 'Effect', def.vis === 'gm', 1); });
        });
    });
    // Conditions C4: the automatic effects on, after the hand-applied ones — a library effect counts once, whether a row applies it or not
    (Array.isArray(autos) ? autos : []).forEach(function(d) { if (!isObj(d) || typeof d.id !== 'string' || seenRef[d.id]) return; seenRef[d.id] = 1; (Array.isArray(d.mods) ? d.mods : []).forEach(function(m) { put(m, d.name || 'Effect', d.vis === 'gm', 1); }); });
    // Conditions C3: the token's posture, after the status effects — a posture of the system's own list other than the first (how a token stands
    // with none set) changes what its changes name, under its name; the Token posture feature off gives no posture (stanceCtx), so none
    if (isObj(stance) && typeof stance.pid === 'string' && ownPostures(sys)) { var atP = postureAt(sys, stance.pid); if (atP.i > 0 && isObj(atP.p) && Array.isArray(atP.p.mods)) atP.p.mods.forEach(function(m) { put(m, atP.p.name || 'Posture', false, 1); }); }
    // Stage 6 F6: item mods, after the status effects — every carried row's item (its own values folded in: rowDef) changes what its mods
    // name, once per row (a quantity does not multiply); a change marked per level times the row's level; an item that works "while switched
    // on" only while its row is on (a list with a switch). A kept curse keeps working (owner, 2026-09-27): here by its name, on its owner's
    // copy as char.unseen — nameless amounts the host works out (unseenMods)
    (sys && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (f.kind !== 'item-list') return;
        var rows = char && char.values && Array.isArray(char.values[f.id]) ? char.values[f.id] : null; if (!rows || !rows.length) return;
        var spec = isObj(f.list) ? f.list : null, onc = onceIn(sys, spec, rows);   // 1.5.8 Counted once: a row of a group that does not apply gives none of its changes
        rows.forEach(function(r, ri) {
            if (onc && onc[ri] && onc[ri].top !== ri) return;
            var rd = rowDef(sys, r), d = rd ? rd.def : null; if (!isObj(d) || !Array.isArray(d.mods) || !d.mods.length) return;
            if (d.modsOn === true && spec && isObj(spec.on) && !rowOn(spec, r)) return;
            var lv = rowLvl(spec, r, d); lv = typeof lv === 'number' && isFinite(lv) ? lv : 0;
            d.mods.forEach(function(m) { put(m, d.name || 'Item', d.vis === 'gm', isObj(m) && m.lvl === true ? lv : 1); });
        });
    });
    (char && Array.isArray(char.unseen) ? char.unseen : []).forEach(function(m) { put(m, 'An unseen effect', false, 1); });
    return idx;
}
// Stage 6 F6: an item's change — the status-effect change (a number, skill or formula +/−, a pool's max, a toggle on), checked against the
// view's fields when they are known (kinds: id -> kind; a GM-only field is not in the players' view), else by its shape only (a row's copy:
// the resolver skips a field that is not there); lvl: true multiplies it by the row's level. At most LIMITS.effectMods; none: null
function cleanItemMod(m, kinds) {
    if (!isObj(m) || typeof m.f !== 'string' || !FIELD_ID.test(m.f)) return null;
    var mo = MOD_LIM[m.op] ? m.op : 'add', c = kinds ? cleanMod(m, kinds) : m.op === 'on' ? { f: m.f, op: 'on' } : (m.op === 'add' || MOD_LIM[m.op]) && typeof m.v === 'number' && isFinite(m.v) && Math.abs(m.v) <= LIMITS.effectAmount ? (m.part === 'max' ? { f: m.f, op: mo, v: m.v, part: 'max' } : rowModAim(m) ? { f: m.f, op: mo, v: m.v, key: m.key, col: m.col } : m.key !== undefined || m.col !== undefined ? null : { f: m.f, op: mo, v: m.v }) : null;   // 1.5.8: an aim at a row that is no aim is no change
    if (c && c.op === 'add' && m.lvl === true) c.lvl = true;
    return c;
}
function cleanItemMods(v, kinds) { var out = []; (Array.isArray(v) ? v : []).forEach(function(m) { if (out.length >= LIMITS.effectMods) return; var c = cleanItemMod(m, kinds); if (c) out.push(c); }); return out.length ? out : null; }
function fieldKinds(sys) { var k = map(); (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (isObj(f) && typeof f.id === 'string') k[f.id] = f.kind; }); return k; }
// F6: a copy's changes as its viewer holds them — only those naming a field of the view (a GM-only field's change never travels)
function viewMods(pd, view) { if (!Array.isArray(pd.mods)) return; var vm = cleanItemMods(pd.mods, fieldKinds(view)); if (vm) pd.mods = vm; else { delete pd.mods; delete pd.modsOn; } }
// Stage 6 F6 (owner, 2026-09-27): what the rows its owner cannot see change — a kept curse (hidden from them), a curse kept switched on
// (it looks off to them: its "while switched on" changes), every row of a list they cannot see — as nameless amounts on the fields of their
// view, summed per field and kind: their sheet, their rolls and the host agree, and nothing names the item. full: the GM's system (the
// lists the view leaves out; without it only the view's are read). null when there is nothing
function unseenMods(c, view, full) {
    if (!isObj(c) || !isObj(c.values) || !isObj(view)) return null;
    var sysF = isObj(full) ? full : view, vk = fieldKinds(view), agg = map(), order = [];
    (Array.isArray(sysF.fields) ? sysF.fields : []).forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list') return;
        var rows = Array.isArray(c.values[f.id]) ? c.values[f.id] : null; if (!rows) return;
        var spec = isObj(f.list) ? f.list : null, seen = vk[f.id] === 'item-list' && f.vis === 'all', onc = onceIn(sysF, spec, rows);   // 1.5.8 Counted once, as fxIndex judges it
        rows.forEach(function(r, ri) {
            if (!isObj(r) || (onc && onc[ri] && onc[ri].top !== ri)) return;
            var hidden = !seen || r.hid === 1, keptOn = r.keptOn === 1 && r.on === true; if (!hidden && !keptOn) return;
            var rd = rowDef(sysF, r), d = rd ? rd.def : null; if (!isObj(d) || !Array.isArray(d.mods) || !d.mods.length) return;
            if (d.modsOn === true && spec && isObj(spec.on) && !rowOn(spec, r)) return;
            if (!hidden && d.modsOn !== true) return;   // a curse kept on, on their sheet as off: its other changes they already hold from the row
            var lv = rowLvl(spec, r, d); lv = typeof lv === 'number' && isFinite(lv) ? lv : 0;
            d.mods.forEach(function(m) {
                var cm = isObj(m) && vk[m.f] ? cleanMod(m, vk) : null; if (!cm) return;
                var key = cm.f + '|' + cm.op + '|' + (cm.part || '') + '|' + (cm.key || '') + '|' + (cm.col || '');
                if (!agg[key]) { agg[key] = { f: cm.f, op: cm.op }; if (cm.op === 'add') agg[key].v = 0; else if (MOD_LIM[cm.op]) agg[key].v = cm.v; if (cm.part) agg[key].part = cm.part; if (cm.key) { agg[key].key = cm.key; agg[key].col = cm.col; } order.push(key); }
                if (cm.op === 'add') agg[key].v += cm.v * (m.lvl === true ? lv : 1); else if (cm.op === 'max') agg[key].v = Math.max(agg[key].v, cm.v); else if (cm.op === 'min') agg[key].v = Math.min(agg[key].v, cm.v);
            });
        });
    });
    var outU = [];
    order.forEach(function(k) { var m = agg[k]; if (m.op === 'add') { if (!isFinite(m.v) || m.v === 0) return; m.v = Math.max(-LIMITS.effectAmount, Math.min(LIMITS.effectAmount, m.v)); } if (outU.length < LIMITS.effectMods * 4) outU.push(m); });
    return outU.length ? outU : null;
}
// Stage 5h Fold 3: facing. A token faces rot + front (0 = up, clockwise, as in fog.js and whiteboard.js); threat marks are world bearings on
// the token (w.threats, the first the active one), one per side of the dial (6 on a hex or gridless map, 4 on a square one). A threat's arc
// counts sides from the one the token faces, so a free-angle token reads the side the dial shows: on a hex grid that side and the two beside
// it are front, the next two side, the back one rear (the website's 3 / 2 / 1); on a square grid 1 / 2 / 1. Pure; a token's values from a
// save or the wire are re-checked here.
var FACING_NAMES = Object.freeze(['Facing', 'Arc', 'Arc.front', 'Arc.side', 'Arc.rear', 'Threats', 'Threats.front', 'Threats.side', 'Threats.rear']);
// Stage 6: the token's stance — Posture (its place in the system's own list of postures, 0 the first) and Elevation (yards), each 0 while its
// VTT feature is off. The ids below are only how a posture written before 1.6.0 is read: no list of postures is a default (the owner's legal
// ruling of 2026-10-24, backlog 183 (3))
var POSTURE_IDS = Object.freeze(['standing', 'crouching', 'sitting', 'kneeling', 'crawling', 'lying-prone', 'lying-face-up']);
// 1.6.0, linked sheets (the owner, by prompt: "Two kinds", "A menu on the sheet", "lets go with mount.name then", "Its owner and the GM",
// "Each keeps its own", "Only the figures read"). A system's links, sys.links: [{ id, key, label, kind, edit }], kind a Mount (one rider to
// one mount) or a Crew link (many people to one vehicle); a character holds links: { <link id>: <character id> }. A formula reads the sheet
// a link holds, live, as <Key>.<name> (Mount.Move, Vehicle.HP.max), and <Key>.has 1 while linked; with no link every name reads 0. A field
// of the system's own keyed like the link keeps the whole family. Absent: the system and its characters are as before
var LINK_ID = /^lk_[A-Za-z0-9_]{1,24}$/, LINK_KINDS = Object.freeze({ mount: 'Mount', crew: 'Crew' }), LINK_NOT = Object.freeze({ row: 1, on: 1, date: 1, facing: 1, arc: 1, threats: 1 }), _linkSrc = null;
function cleanLinks(raw, F) {
    if (!Array.isArray(raw)) return null;
    var out = [], ids = map(), ks = map();
    raw.forEach(function(k) {
        if (out.length >= LIMITS.links || !isObj(k) || typeof k.id !== 'string' || !LINK_ID.test(k.id) || ids[k.id] || !hasOwn(LINK_KINDS, k.kind)) return;
        if (typeof k.key !== 'string' || k.key.indexOf('.') >= 0 || LINK_NOT[lower(k.key)] || ks[lower(k.key)] || !validKey(k.key, F)) return;
        ids[k.id] = 1; ks[lower(k.key)] = 1;
        out.push({ id: k.id, key: k.key, label: str(k.label, LIMITS.label).replace(CTRL_RE_G, ' ').trim() || k.key, kind: k.kind, edit: k.edit === 'gm' ? 'gm' : 'owner' });
    });
    return out.length ? out : null;
}
function linkByKey(sys) { var m = map(); (sys && Array.isArray(sys.links) ? sys.links : []).forEach(function(k) { if (isObj(k) && typeof k.id === 'string' && typeof k.key === 'string' && k.key.indexOf('.') < 0 && hasOwn(LINK_KINDS, k.kind) && !m[lower(k.key)]) m[lower(k.key)] = k; }); return m; }
// A name read through a link (Mount.Move) judged as the name it reads on the linked sheet (Move), as On.<name> is: the GM-only judges and the
// players' view's mention check. Any other name as it is
function linkBare(sys, ix, name) {
    var s = String(name), d = s.indexOf('.'); if (d <= 0 || !sys || !Array.isArray(sys.links) || !sys.links.length) return s;
    var k = lower(s.slice(0, d)); if (!linkByKey(sys)[k]) return s;
    if ((ix || keyIndex(sys))[k]) return s;   // a field of the system's own keyed so keeps its name
    return s.slice(d + 1);
}
// The source of a linked sheet: fn(id, sys) answers the character a link holds, as it is to be read with that system (sheets.js: the GM's own
// for the system, the owner's projection for the players' view; on a player's app their own copy). None: every link reads as none
function setLinkSource(fn) { _linkSrc = typeof fn === 'function' ? fn : null; return !!_linkSrc; }
function cleanCharLinks(raw, sys, selfId) {
    if (!isObj(raw) || !sys || !Array.isArray(sys.links)) return null;
    var out = {}, n = 0;
    sys.links.forEach(function(k) { if (!isObj(k) || !hasOwn(raw, k.id)) return; var v = raw[k.id]; if (typeof v === 'string' && CHAR_ID.test(v) && v !== selfId) { out[k.id] = v; n++; } });
    return n ? out : null;
}
// The names under one link that a system's formulas, captions and labels write (Mount.Move -> move), each once, lower case, the first
// LIMITS.linkNames; never has (worked out on each machine)
function linkNamesIn(sys, key) {
    var s = ''; try { s = JSON.stringify(sys) || ''; } catch (e) { s = ''; }
    var esc = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), re = new RegExp('(^|[^A-Za-z0-9_.])' + esc + '\\.([A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*){0,3})', 'gi'), m, out = [], seen = map();
    while ((m = re.exec(s)) && out.length < LIMITS.linkNames) { var w = lower(m[2]); if (w === 'has' || seen[w] || w in Object.prototype) continue; seen[w] = 1; out.push(w); }
    return out;
}
// "Only the figures read": the figures a character's own copy carries for each link it holds, worked out by the host with the players' view
// through the source (the linked sheet as its owner holds it), so a GM-only value never travels: { <link id>: { id, name, v: { <name>: value } } }
// or null. A player's resolver reads these in place of the linked sheet
function linkFigs(sys, char, F) {
    var ks = sys && Array.isArray(sys.links) ? sys.links : null; if (!ks || !ks.length || !isObj(char) || !isObj(char.links) || !F || !_linkSrc) return null;
    var out = null, ixL = keyIndex(sys);
    ks.forEach(function(k) {
        var id = isObj(k) && hasOwn(char.links, k.id) ? char.links[k.id] : ''; if (typeof id !== 'string' || !CHAR_ID.test(id) || id === char.id || ixL[lower(k.key)]) return;
        var o = null; try { o = _linkSrc(id, sys); } catch (e) { o = null; } if (!isObj(o) || o.id !== id) return;
        var r = makeResolver(sys, o, F, { linkDepth: 1 }), v = {};   // a plain object: it travels (the wire's packer reads a prototype)
        linkNamesIn(sys, k.key).forEach(function(w) { var x; try { x = r(w); } catch (e) { x = undefined; } if (typeof x === 'number' && fin(x)) v[w] = x; else if (typeof x === 'boolean') v[w] = x; else if (typeof x === 'string') v[w] = x.slice(0, 120).replace(CTRL_RE_G, ' '); });
        (out = out || {})[k.id] = { id: id, name: str(o.name, LIMITS.charName).replace(CTRL_RE_G, ' ').trim() || 'Character', v: v };
    });
    return out;
}
var LINK_NAME = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*){0,3}$/;
function cleanLk(raw, sys) {
    if (!isObj(raw) || !sys || !Array.isArray(sys.links)) return null;
    var out = null;
    sys.links.forEach(function(k) {
        var e = isObj(k) && hasOwn(raw, k.id) ? raw[k.id] : null; if (!isObj(e) || typeof e.id !== 'string' || !CHAR_ID.test(e.id)) return;
        var v = {}, n = 0, src = isObj(e.v) ? e.v : {};   // a plain object, named only by names no prototype holds
        Object.keys(src).forEach(function(w) { if (n >= LIMITS.linkNames || !LINK_NAME.test(w) || w === 'has' || w in Object.prototype) return; var x = src[w]; if (typeof x === 'number' && fin(x)) { v[w] = x; n++; } else if (typeof x === 'boolean') { v[w] = x; n++; } else if (typeof x === 'string') { v[w] = x.slice(0, 120).replace(CTRL_RE_G, ' '); n++; } });
        (out = out || {})[k.id] = { id: e.id, name: str(e.name, LIMITS.charName).replace(CTRL_RE_G, ' ').trim() || 'Character', v: v };
    });
    return out;
}
// The one judge of a link set on a character, the GM's own and a player's on the host: { ok, links } (links null: none left) or
// { ok: false, reason, msg }. A player sets a link its Who edits gives them, or any while their character is open to them, and links only a
// character of their own. A Mount has one rider: a mount another character already rides is refused. A Crew link has no such rule
function linkSet(sys, chars, c, linkId, toId, opts) {
    opts = opts || {};
    var k = null; (sys && Array.isArray(sys.links) ? sys.links : []).forEach(function(x) { if (!k && isObj(x) && x.id === linkId) k = x; });
    if (!k || !isObj(c)) return { ok: false, reason: 'field', msg: 'That link is not in this system.' };
    if (opts.player && k.edit !== 'owner' && !openChar(c)) return { ok: false, reason: 'field', msg: 'Only the GM sets ' + k.label + ' here.' };
    var cur = isObj(c.links) ? c.links : {}, next = {}, n = 0;
    Object.keys(cur).forEach(function(id) { if (id !== linkId && LINK_ID.test(id) && typeof cur[id] === 'string') { next[id] = cur[id]; n++; } });
    if (toId === '' || toId === null) return { ok: true, links: n ? next : null };
    if (typeof toId !== 'string' || !CHAR_ID.test(toId)) return { ok: false, reason: 'value', msg: 'That is not a character.' };
    if (toId === c.id) return { ok: false, reason: 'value', msg: 'A sheet cannot link to itself.' };
    var t = isObj(chars) && hasOwn(chars, toId) ? chars[toId] : null; if (!isObj(t)) return { ok: false, reason: 'missing', msg: 'That character is not here now.' };
    if (opts.player && (t.npc || !t.ownerId || t.ownerId !== opts.pid || t.partial === true)) return { ok: false, reason: 'owner', msg: 'You can link only a character of your own.' };
    if (k.kind === 'mount') {
        var by = null; Object.keys(chars).forEach(function(id) { var x = chars[id]; if (!by && id !== c.id && isObj(x) && isObj(x.links) && x.links[linkId] === toId) by = x; });
        if (by) return { ok: false, reason: 'error', msg: (t.name || 'That mount') + ' already has a rider' + (opts.player ? '.' : ': ' + (by.name || 'another character') + '. Take that link off first.') };
    }
    next[linkId] = toId; return { ok: true, links: next };
}
// Who links to a character, for its sheet: [{ link, by: [{ id, name }] }] in the system's order (a Mount's rider, a vehicle's crew)
function linkedFrom(sys, chars, id) {
    var out = []; if (!isObj(chars) || typeof id !== 'string') return out;
    (sys && Array.isArray(sys.links) ? sys.links : []).forEach(function(k) { if (!isObj(k)) return; var by = []; Object.keys(chars).forEach(function(cid) { var x = chars[cid]; if (cid !== id && isObj(x) && x.partial !== true && isObj(x.links) && x.links[k.id] === id) by.push({ id: cid, name: x.name || 'Character' }); }); if (by.length) out.push({ link: k, by: by }); });
    return out;
}
// A character gone: every link to it goes. The ids of the characters whose links changed
function linksDrop(chars, id) {
    var out = []; if (!isObj(chars) || typeof id !== 'string') return out;
    Object.keys(chars).forEach(function(cid) { var x = chars[cid]; if (!isObj(x) || !isObj(x.links)) return; var hit = false; Object.keys(x.links).forEach(function(l) { if (x.links[l] === id) { delete x.links[l]; hit = true; } }); if (hit) { if (!Object.keys(x.links).length) delete x.links; out.push(cid); } });
    return out;
}
// 1.6.0: the campaign's date, read through one registered source (calendar.js: the clock on the system's calendar, or on a player's app the
// numbers its host sent while the date is kept from players); 0 with none. A field named Date keeps its family
var DATE_NAMES = Object.freeze(['Date.year', 'Date.day', 'Date.days', 'Date.hour', 'Date.minute']), _dateSrc = null;
function setDateSource(fn) { _dateSrc = typeof fn === 'function' ? fn : null; return !!_dateSrc; }
function dateReads(sys) { var s = ''; try { s = JSON.stringify(sys) || ''; } catch (e) { s = ''; } return /\bdate\.(year|days?|hour|minute)\b/i.test(s); }   // whether a system's formulas name the date at all
var TOKEN_NAMES = Object.freeze(FACING_NAMES.concat(['Posture', 'Elevation', 'CombatRound', 'RangeMod', 'TargetDistance', 'HeightMod', 'HeightDiff', 'TargetSize']));   // item 19 H2: HeightMod and HeightDiff   // range penalties R2: RangeMod and TargetDistance, the range to the roller's target (withRange)   // HUD frame (HF5b): CombatRound, the round of the combat on the token's map (round is the rounding function)
function postureIndex(v) {   // how a posture written before 1.6.0 reads: the old ids, the 1.4.6 ids, the long names
    if (typeof v !== 'string') return 0;
    var s = v.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    if (!s || s === 'standing' || s === 'stand') return 0;
    if (/face ?up|supine|on (the|their) back/.test(s)) return 6;
    if (/prone|face ?down/.test(s)) return 5;
    if (/crouch/.test(s)) return 1;
    if (/sit/.test(s)) return 2;
    if (/kneel/.test(s)) return 3;
    if (/crawl/.test(s)) return 4;
    return 0;
}
function stanceCtx(tok, flags) {   // { posture, elevation } for one token, or null (no token, both features off); a value that is not a number reads 0
    if (!isObj(tok) || !isObj(flags) || (!flags.posture && !flags.elevation)) return null;
    var e = tok.elevation; if (typeof e === 'string' && /^\s*-?\d{1,6}(\.\d+)?\s*$/.test(e)) e = Number(e);   // a drop's "3" reads as the chip shows it (only text is converted: an object's valueOf is never called)
    e = typeof e === 'number' && isFinite(e) ? Math.max(-999, Math.min(999, Math.round(e * 10) / 10)) : 0; if (e === 0) e = 0;
    var out = { posture: flags.posture ? postureIndex(tok.posture) : 0, elevation: flags.elevation ? e : 0 };
    if (flags.posture && typeof tok.posture === 'string' && tok.posture) out.pid = tok.posture.slice(0, 40);   // conditions C3: the posture as stored, found in the system's own list by postureAt (Posture, a posture's changes, its name)
    return out;
}
function tokenCtx(map, tok, flags) {   // everything a token gives the built-in names: { facing, stance } (flags: { turning, posture, elevation, viewer? }), or null with no token
    if (!isObj(tok) || !isObj(flags)) return null;
    return { facing: facingNow(map, tok, !!flags.turning, flags.viewer), stance: stanceCtx(tok, flags) };
}
// 158 (the owner by prompt, 2026-10-18: "Targeting marks the threat (Recommended)"): a target tells the facing rules where an attack comes
// from. Who targets a token is the table's: one source, registered by the sheet module (setAimSource, as an outside reader is registered),
// answers the attackers' tokens for a token on a map, judged for a viewer (a player's roll on the host: only the attackers that player sees;
// none named: every attacker this screen holds). Each attacker's bearing from the token is a threat standing BEFORE the marks set by hand, one
// a side, and it goes with the target: nothing of it is ever stored on the token. With no source, or nothing targeting, every reading is
// exactly as before
var _aimSrc = null;
function setAimSource(fn) { _aimSrc = typeof fn === 'function' ? fn : null; return !!_aimSrc; }
function bearingTo(from, to) {   // the world bearing from one piece's centre to another's: whole degrees in (-180, 180], 0 up and clockwise; null for no bearing
    var c = function(p) { if (!isObj(p)) return null; var x = p.x, y = p.y, w = typeof p.w === 'number' && p.w > 0 ? p.w : 60, h = typeof p.h === 'number' && p.h > 0 ? p.h : 52; return [x, y, w, h].every(function(n) { return typeof n === 'number' && isFinite(n) && Math.abs(n) < 1e9; }) ? [x + w / 2, y + h / 2] : null; };
    var a = c(from), b = c(to); if (!a || !b) return null;
    var dx = b[0] - a[0], dy = b[1] - a[1]; if (dx === 0 && dy === 0) return null;
    var d = Math.round(norm180(Math.atan2(dx, -dy) * 180 / Math.PI)); if (d === -180) d = 180; if (d === 0) d = 0;
    return d;
}
function aimsOf(map, tok, viewer) {   // the bearings of what targets this token, as the source answers them: at most LIMITS.threats, never its own; [] with none
    if (!_aimSrc || !isObj(tok)) return [];
    var at = null; try { at = _aimSrc(map, tok, typeof viewer === 'string' && viewer ? viewer : null); } catch (e) { at = null; }
    var out = []; if (Array.isArray(at)) at.slice(0, 64).forEach(function(p) { if (out.length >= LIMITS.threats || p === tok) return; var b = bearingTo(tok, p); if (b !== null) out.push(b); });
    return out;
}
function facingNow(map, tok, on, viewer) { return facingCtx(map, tok, on, on ? aimsOf(map, tok, viewer) : null); }   // a token's facing with what targets it
// Conditions C3 (docs/CONDITIONS_PLAN.md): the system's own postures (combat.postures) — how a token can stand, in order. The first is how a
// token stands with none set: it carries no changes and no ranged note. Posture reads each one's place in the list (0 the first). A system
// with no list of its own has posture switched off: no chip, no menu, Posture 0 (1.6.0, backlog 183 (3), the owner by prompt: "Posture switched
// off (Recommended)"). Each posture: its id (p_ and a word, or a plain word in lower case with hyphens, so a website sheet's ids still set it),
// a name, a tag for its chip (4 characters at most; absent: the name's first three letters or digits), notes, ranged (a whole number from -20
// to 20, not 0: what a foe's RANGED roll against a token in it takes, shown only, never rolled; "A ranged note per posture (Recommended)";
// a list written before 1.6.0 with the smaller target tick, small, reads as -2) and changes like an effect's, checked against the view's
// fields (a GM-only field's never reach the players' view). At least two, at most 12, each id once; else none
var POSTURE_ID = /^(?:p_[A-Za-z0-9_]{1,24}|[a-z][a-z0-9-]{0,23})$/;
var NO_POSTURES = Object.freeze([]);
function postureRangedOf(p) { var n = isObj(p) ? p.ranged : null; return typeof n === 'number' && isFinite(n) && n === Math.round(n) && n !== 0 && Math.abs(n) <= 20 ? n : 0; }   // a posture's ranged note, 0 for none
function cleanPostures(v, kinds) {
    if (!Array.isArray(v)) return null;
    var out = [], seen = map();
    v.forEach(function(p) {
        if (out.length >= LIMITS.postures || !isObj(p) || typeof p.id !== 'string' || seen[p.id] || !POSTURE_ID.test(p.id)) return;
        seen[p.id] = 1;
        var nm = cutText(p.name, LIMITS.name) || 'Posture', tg = cutPoints(p.tag, LIMITS.postureTag, ' ') || Array.from(nm.replace(/[^\p{L}\p{N}]+/gu, '')).slice(0, 3).join('').toUpperCase() || 'POS';
        var o = { id: p.id, name: nm, tag: tg }, nt = cutText(p.notes, LIMITS.postureNotes); if (nt) o.notes = nt;
        if (out.length) {   // the first carries neither
            var rg = postureRangedOf(p); if (!rg && p.ranged === undefined && p.small === true) rg = -2; if (rg) o.ranged = rg;   // 1.6.0: small, the tick before it, read as -2
            var mods = []; (Array.isArray(p.mods) ? p.mods : []).forEach(function(m) { if (mods.length >= LIMITS.effectMods) return; var c = cleanMod(m, kinds); if (c) mods.push(c); });
            if (mods.length) o.mods = mods;
        }
        out.push(o);
    });
    return out.length >= 2 ? out : null;
}
function postureList(sys) { return isObj(sys) && isObj(sys.combat) && Array.isArray(sys.combat.postures) && sys.combat.postures.length >= 2 ? sys.combat.postures : NO_POSTURES; }   // the system's own list, else none
function ownPostures(sys) { return postureList(sys).length > 0; }
// A token's posture (its stored text) in the system's own list: { i, p } — by its id; else read as a posture written before 1.6.0 (the old
// ids, the long names) and found by that id; else (a posture the list lacks), or with none stored, the first. With no list, { i: 0 } and no p
function postureAt(sys, v) {
    var pl = postureList(sys), i = -1, k, find = function(id) { for (k = 0; k < pl.length; k++) if (isObj(pl[k]) && pl[k].id === id) return k; return -1; };
    if (typeof v === 'string' && v) { i = find(v); var k7 = i < 0 ? postureIndex(v) : 0; if (k7 > 0) i = find(POSTURE_IDS[k7]); }
    if (i < 0) i = 0;
    return { i: i, p: pl[i] };
}
// One of the website's seven postures for a token's stored text, by its id: the ids themselves, the 1.4.6 ids and the handbook's long names, as
// the map reads them. '' for a text that is none of them (a posture of a system's own list, a word nobody knows, nothing). sys: the system
// in use. A posture of its own list, by its id, is never one of the seven, whatever letters the id holds: the reading below is by the words
// a text holds, and an id such as p_transit holds sit (the review of 2026-10-09)
function postureSeven(v, sys) {
    if (typeof v !== 'string' || !v) return '';
    if (POSTURE_IDS.indexOf(v) < 0 && ownPostures(sys)) { var plS = postureList(sys); for (var iS = 0; iS < plS.length; iS++) if (isObj(plS[iS]) && plS[iS].id === v) return ''; }
    var k = postureIndex(v); if (k > 0) return POSTURE_IDS[k];
    var s = v.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    return s === 'standing' || s === 'stand' ? POSTURE_IDS[0] : '';
}
// HUD frame (HF5b): the combat round merged into a token context (tokenCtx stays pure) — a NEW object, or the context unchanged with no token
// (CombatRound reads 0 then) or no valid round. The round is whole and within 0..9999, as the wire's combats are
// Range penalties R2 (docs/RANGE_PLAN.md 3): what RangeMod and TargetDistance read between a roller's token and its target on a map —
// { mod, dist }: the system's range modifier (0 with no rule, or a formula that gives no number) and the distance in the rule's unit (yards
// with no rule), centre to centre, with their heights when opts.elev (the elevation feature on) as the ruler and a target mark count them;
// null with no two tokens or a place that is no number. Whose target, and whether its player may know it, the caller decides
// Item 19b H5 (ground height): the ground under a token, when the caller knows it — opts.groundOf, a function of the token (whiteboard.js
// tokenGround on its map): yards within -1000 to 1000, 0 with none or an answer that is no number. A token's height is its own elevation plus
// this, in the range (its 3D distance), HeightDiff and HeightMod alike; without it, the elevation alone as before
function groundYd(opts, t) { if (!isObj(opts) || typeof opts.groundOf !== 'function') return 0; var g = opts.groundOf(t); return typeof g === 'number' && isFinite(g) ? Math.max(-1000, Math.min(1000, g)) : 0; }
function rangeCtx(sys, mp, from, to, opts) {
    if (!isObj(from) || !isObj(to)) return null;
    opts = isObj(opts) ? opts : {};
    var mid = function(t) { var w = typeof t.w === 'number' && fin(t.w) && t.w > 0 ? t.w : 60, h = typeof t.h === 'number' && fin(t.h) && t.h > 0 ? t.h : 52; return { x: t.x + w / 2, y: t.y + h / 2 }; };
    var el = function(t) { var s = stanceCtx(t, { elevation: true }); return (s ? s.elevation : 0) + groundYd(opts, t); };
    var rr = sys && isObj(sys.combat) ? cleanRangeRules(sys.combat.range, opts.F) : null, u = rr && rr.unit ? rr.unit : 'yd';
    var d = rangeDist(sys, mp, mid(from), mid(to), u, opts.elev ? el(to) - el(from) : 0); if (d === null) return null;
    var m = rr ? rangeModOf(rr, d, opts.F) : null, out = { mod: m === null ? 0 : m, dist: d };
    var hg = heightOf(sys, from, to, opts); if (hg) out.hmod = hg.mod;   // item 19 H2: HeightMod, the system's height modifier (none without its table or formula)
    var hd = opts.elev ? heightIn(el(from) - el(to), hg ? hg.unit : 'yd') : 0; if (hd) out.hdiff = hd;   // ...and HeightDiff, the roller's height over the target's (in its unit, else yards)
    var sz = targetSizeOf(sys, to, opts); if (sz) out.size = sz;   // 1.6.0: TargetSize, the target's own Size
    return out;
}
// 1.6.0 (the SotMW v2 combat module: "Size adds to attack rolls against the target"): what TargetSize reads, the target's own value of the field the
// Combat card names (combat.targetSize), worked out on the target's character as its sheet works it out; 0 with no such field, no character
// behind the token (opts.charOf, the caller's own lookup: the host holds every character, a player's app only its own), or a value that is no
// number. Held to within 1000 either way
function targetSizeOf(sys, to, opts) {
    var fid = sys && isObj(sys.combat) && typeof sys.combat.targetSize === 'string' ? sys.combat.targetSize : ''; if (!fid || !isObj(opts) || typeof opts.charOf !== 'function' || !opts.F) return 0;
    var f = fieldById(sys, fid), tc = null; try { tc = opts.charOf(to); } catch (e) { tc = null; } if (!f || !isObj(tc)) return 0;
    var v = null; try { v = makeResolver(sys, tc, opts.F)(lower(f.key)); } catch (e) { v = null; }
    return typeof v === 'number' && fin(v) ? Math.max(-1000, Math.min(1000, v)) : 0;
}
// ... merged into a token context as withRound merges the round: a NEW object, or the context unchanged with no token or no range (the
// names read 0 then)
function withRange(tctx, rc) {   // R3: the target's id and map ride along (tid, mapId: text), for the host's privacy check
    if (!isObj(tctx) || !isObj(rc) || !fin(rc.mod) || !fin(rc.dist)) return tctx;
    var rg = { mod: rc.mod, dist: rc.dist }; ['tid', 'mapId'].forEach(function(k) { if (typeof rc[k] === 'string' && rc[k].length <= 200) rg[k] = rc[k]; });
    ['hmod', 'hdiff', 'size'].forEach(function(k) { if (fin(rc[k])) rg[k] = rc[k]; });   // item 19 H2: HeightMod and HeightDiff ride with the range; 1.6.0: and TargetSize
    return Object.assign({}, tctx, { range: rg });
}
// 1.6.0 (docs/BOOK_ES_ET_PLAN.md 4a): the names a crossing's run reads, laid on the token context it is worked out in: CrossStep, the number of the
// step it runs for (1 the first; under Once however many the furthest passed), and Crossed, how many steps the change passed. Whole, 0 to 999
function withCross(tctx, cx) { if (!isObj(cx)) return tctx; var k = function(v) { return fin(v) ? Math.max(0, Math.min(999, Math.floor(v))) : 0; }; return Object.assign({}, isObj(tctx) ? tctx : {}, { cross: { step: k(cx.step), n: k(cx.n) } }); }
function withRound(tctx, combat) { if (!isObj(tctx) || !isObj(combat) || !fin(combat.round)) return tctx; return Object.assign({}, tctx, { combat: { round: Math.max(0, Math.min(9999, Math.floor(combat.round))) } }); }
function norm180(d) { d = d % 360; if (d <= -180) d += 360; if (d > 180) d -= 360; return d; }
function sideOf(deg, sides) { var n = sides === 4 ? 4 : 6, x = deg % 360; if (x < 0) x += 360; return Math.round(x / (360 / n)) % n; }   // the dial side a bearing falls on (side 0 = up)
function threatArc(fc, bearing) {   // 0 front, 1 side, 2 rear
    var n = fc && fc.sides === 4 ? 4 : 6, k = ((sideOf(bearing, n) - sideOf(fc ? fc.deg : 0, n)) % n + n) % n, d = Math.min(k, n - k);
    return n === 4 ? d : d <= 1 ? 0 : d === 2 ? 1 : 2;
}
function cleanThreats(v) {   // at most LIMITS.threats whole-degree bearings in (-180, 180], each once, in order; [] for anything else
    var out = []; if (!Array.isArray(v)) return out;
    for (var i = 0; i < v.length && i < 64 && out.length < LIMITS.threats; i++) {
        var n = v[i]; if (typeof n !== 'number' || !isFinite(n) || Math.abs(n) > 1e6) continue;
        n = Math.round(norm180(n)); if (n === -180) n = 180; if (n === 0) n = 0;   // the last one turns -0 into 0
        if (out.indexOf(n) < 0) out.push(n);
    }
    return out;
}
function facingCtx(map, tok, on, aims) {   // what the facing names read for one token on one map: { deg, sides, threats }, or null (facing off, no token, a facing that is not a number). aims (158): bearings of what targets it, before the marks set by hand: then also own (the hand's marks alone, what the dial writes back) and aims (how many lead)
    if (!on || !isObj(tok)) return null;
    var rot = tok.rot === undefined || tok.rot === null ? 0 : tok.rot, fr = tok.front === undefined || tok.front === null ? 0 : tok.front;   // numbers only: a host's object is refused, never converted (its valueOf can throw)
    if (typeof rot !== 'number' || typeof fr !== 'number' || !isFinite(rot) || !isFinite(fr) || Math.abs(rot) > 1e6 || Math.abs(fr) > 1e6) return null;
    var gt = isObj(map) && isObj(map.meta) ? map.meta.gridType : null, sides = gt === 'square' ? 4 : 6, deg = (rot + fr) % 360; if (deg < 0) deg += 360;
    var th = [];   // each mark on its side, one per side (a mark set on a hex map keeps meaning one side after the grid turns square)
    cleanThreats(tok.threats).forEach(function(b) { var s = sideOf(b, sides); if (th.some(function(x) { return sideOf(x, sides) === s; })) return; var v = norm180(s * 360 / sides); th.push(v === -180 ? 180 : v); });
    var lead = []; (Array.isArray(aims) ? aims : []).forEach(function(b) { if (typeof b !== 'number' || !isFinite(b) || lead.length >= LIMITS.threats) return; var s = sideOf(b, sides); if (lead.some(function(x) { return sideOf(x, sides) === s; })) return; var v = norm180(s * 360 / sides); lead.push(v === -180 ? 180 : v); });
    if (!lead.length) return { deg: deg, sides: sides, threats: th };
    return { deg: deg, sides: sides, threats: lead.concat(th.filter(function(b) { return !lead.some(function(x) { return sideOf(x, sides) === sideOf(b, sides); }); })), own: th, aims: lead.length };
}
// A character's token on a map: a character token, shown (opts.hidden: a hidden one too, for the GM's NPCs), the owner's first, else the
// first (opts.strict: the owner's only — what a player reads, and what the host reads for them)
function charTokenOn(map, charId, ownerId, opts) {
    if (!isObj(map) || !Array.isArray(map.whiteboard) || typeof charId !== 'string' || !charId) return null;
    var first = null, hid = !!(opts && opts.hidden), strict = !!(opts && opts.strict);
    for (var i = 0; i < map.whiteboard.length; i++) {
        var w = map.whiteboard[i]; if (!isObj(w) || !w.isChar || (w.hidden && !hid) || w.charId !== charId) continue;
        if (ownerId && w.ownerId === ownerId) return w;
        if (!first && !strict) first = w;
    }
    return first;
}
// ---- Onboarding F0: which character a player plays, and which token of it they hold ----
// A player plays the characters whose ownerId is theirs; camp.players[pid].charId (kept on the host, never sent) names the one IN PLAY and the
// others are KEPT: their sheets, rolls and downloads stay the player's, their tokens are the GM's to move. Pure — the host writes back what
// these derive. The legacy name binding (players[pid].charName) is read only for a player who owns no character.
var LAYER_Z = Object.freeze({ back: 10, 'back-mid': 15, middle: 20, 'front-mid': 25, front: 30 });
function hasOwn(o, k) { return !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); }
function stackZ(w) { var z = hasOwn(LAYER_Z, w.layer) ? LAYER_Z[w.layer] : (fin(Number(w.z)) && Number(w.z) ? Number(w.z) : 10); return w.aboveGrid ? z + 15020 : z; }   // the map's own stacking (whiteboard.js)
function playerRec(camp, pid) { var ps = camp && isObj(camp.players) ? camp.players : null; return ps && hasOwn(ps, pid) && isObj(ps[pid]) ? ps[pid] : null; }
function mapsOf(camp) { var out = []; if (camp && isObj(camp.items)) Object.keys(camp.items).forEach(function(k) { var m = camp.items[k]; if (isObj(m) && m.type === 'map' && Array.isArray(m.whiteboard)) out.push(m); }); return out; }
function charsIn(camp) { return camp && isObj(camp.chars) ? camp.chars : {}; }
// What a player may have in play: their characters that are not NPCs and not in the making
function playableChars(camp, pid) {
    var cs = charsIn(camp), out = [];
    if (typeof pid !== 'string' || !pid) return out;
    Object.keys(cs).forEach(function(id) { var c = cs[id]; if (isObj(c) && c.id === id && c.npc !== true && c.making !== 1 && c.ownerId === pid) out.push(c); });   // Onboarding F3: one in the making is not in play
    return out;
}
// The character in play: the record's charId when it is still theirs; else their only one; else a guess (the one named like their old name
// binding, then one with a token they hold on their last map, then the most recently changed) — the host writes it down and logs a guess
function activeCharOf(camp, pid) {
    var mine = playableChars(camp, pid); if (!mine.length) return { id: null, how: 'none' };
    var rec = playerRec(camp, pid);
    if (rec && typeof rec.charId === 'string') for (var i = 0; i < mine.length; i++) if (mine[i].id === rec.charId) return { id: rec.charId, how: 'record' };
    if (mine.length === 1) return { id: mine[0].id, how: 'only' };
    var cands = mine, byName = rec && typeof rec.charName === 'string' ? mine.filter(function(c) { return c.name === rec.charName; }) : [];
    if (byName.length) cands = byName;
    var lm = rec && hasOwn(camp.items, rec.lastMap) ? camp.items[rec.lastMap] : null;
    if (isObj(lm) && Array.isArray(lm.whiteboard)) { var on = cands.filter(function(c) { return lm.whiteboard.some(function(w) { return isObj(w) && w.isChar && w.charId === c.id && w.ownerId === pid; }); }); if (on.length) cands = on; }
    // with a record the guess is written down once, so "the most recently changed" is fine; without one (never joined, or forgotten) it is made
    // again at every change, and a recency order would follow whoever last touched a character — so it is by name, stable
    var byId = function(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; };
    cands = cands.slice().sort(rec ? function(a, b) { return ((Number(b.updated) || 0) - (Number(a.updated) || 0)) || byId(a, b); } : function(a, b) { return String(a.name).localeCompare(String(b.name)) || byId(a, b); });
    return { id: cands[0].id, how: 'guess' };
}
// { pid: charId } for every owner of a playable character (prototype-free)
function activeChars(camp) {
    var out = map(), seen = map(), cs = charsIn(camp);
    Object.keys(cs).forEach(function(id) { var c = cs[id]; if (!isObj(c) || typeof c.ownerId !== 'string' || !c.ownerId || seen[c.ownerId]) return; seen[c.ownerId] = 1; var a = activeCharOf(camp, c.ownerId); if (a.id) out[c.ownerId] = a.id; });
    return out;
}
// ONE rule for which tokens a player holds, shared by syncOwners, the loader and every arrival path, so no two places fight: per map, of the
// tokens linked to a character its owner has IN PLAY, one is owned — keep (passed only at a give) else one the owner already holds else the
// topmost — and every other stays LINKED and passes to the GM (never unlinked or deleted: an undo that restores a link cannot hand a second
// copy back). Tokens of a kept character, an NPC, one in the making or an unowned character have no owner; a token linked to a missing character is
// left alone. A token with no character keeps its owner, one per name per owner per map. opts: { keep, mapId (this map only), active,
// all (the campaign has sheets off: every owned character counts as in play, nothing is kept) }. Returns the changes: [{ mapId, wbId, ownerId ('' = the GM) }].
function ownedTokenPlan(camp, opts) {
    opts = opts || {};
    var keep = typeof opts.keep === 'string' ? opts.keep : '', act = opts.all ? null : (opts.active || activeChars(camp)), cs = charsIn(camp), ops = [];
    mapsOf(camp).forEach(function(m) {
        if (opts.mapId && m.id !== opts.mapId) return;
        var groups = map(), order = [];
        m.whiteboard.forEach(function(w, i) {
            if (!isObj(w) || typeof w.id !== 'string') return;
            var gk, want;
            if (typeof w.charId === 'string' && w.charId) {
                var c = hasOwn(cs, w.charId) ? cs[w.charId] : null; if (!isObj(c)) return;
                if (!(c.ownerId && c.npc !== true && c.making !== 1 && (!act || act[c.ownerId] === c.id))) { if (w.ownerId) ops.push({ mapId: m.id, wbId: w.id, ownerId: '' }); return; }
                want = c.ownerId; gk = 'c:' + c.id;
            } else if (w.isChar && typeof w.ownerId === 'string' && w.ownerId) { want = w.ownerId; gk = 'n:' + w.ownerId + '|' + String(w.charName || ''); }
            else return;
            if (!groups[gk]) { groups[gk] = { want: want, toks: [] }; order.push(gk); }
            groups[gk].toks.push({ w: w, i: i });
        });
        order.forEach(function(gk) {
            var g = groups[gk], win = null;
            g.toks.forEach(function(t) { if (keep && t.w.id === keep) win = t; });
            if (!win) {   // never hand out a hidden copy nobody holds (GM staging): the resolver makes a visible one instead; a hidden token they hold stays theirs
                var shown = function(l) { return l.filter(function(t) { return !t.w.hidden; }); }, held = g.toks.filter(function(t) { return t.w.ownerId === g.want; });
                win = held.length ? topmostOf(shown(held).length ? shown(held) : held) : topmostOf(shown(g.toks));
            }
            g.toks.forEach(function(t) { var to = t === win ? g.want : ''; if ((t.w.ownerId || '') !== to) ops.push({ mapId: m.id, wbId: t.w.id, ownerId: to }); });
        });
    });
    return ops;
}
function topmostOf(list) { var best = null; list.forEach(function(t) { var z = stackZ(t.w), bz = best ? stackZ(best.w) : 0; if (!best || z > bz || (z === bz && t.i > best.i)) best = t; }); return best; }
function applyOwnerOps(camp, ops) {
    var maps = [];   // the ids of the maps it changed, once each: a host save sends only the open item, so the caller sends these
    (Array.isArray(ops) ? ops : []).forEach(function(o) {
        var m = camp && hasOwn(camp.items, o.mapId) ? camp.items[o.mapId] : null; if (!isObj(m) || !Array.isArray(m.whiteboard)) return;
        for (var i = 0; i < m.whiteboard.length; i++) { var w = m.whiteboard[i]; if (!isObj(w) || w.id !== o.wbId) continue; if (o.ownerId) w.ownerId = o.ownerId; else delete w.ownerId; if (maps.indexOf(o.mapId) < 0) maps.push(o.mapId); break; }
    });
    return maps;
}
// Existing saves: each KNOWN player (one with a record) who owns characters gets the one in play written down once (their only one, else the
// guess above, listed for the GM), and each token THEY own that is bound to it only by name is linked to it. Never an unowned token or another player's (so a GM's
// same-named NPC token stays unlinked; arrival adopts by name, as it always has). Idempotent. opts.link false: the binding only (syncOwners
// heals with it at every change; linking by name is the loader's, once). Returns { bound, linked, guesses, several }.
function migrateBindings(camp, opts) {
    var out = { bound: 0, linked: 0, guesses: [], several: [] }, cs = charsIn(camp), seen = map(), owners = [], link = !opts || opts.link !== false;
    Object.keys(cs).forEach(function(id) { var c = cs[id]; if (isObj(c) && typeof c.ownerId === 'string' && c.ownerId && !seen[c.ownerId]) { seen[c.ownerId] = 1; owners.push(c.ownerId); } });
    owners.forEach(function(pid) {
        if (!PID_RE.test(pid) || pid in Object.prototype) return;
        var a = activeCharOf(camp, pid); if (!a.id) return;
        var c = cs[a.id], rec = playerRec(camp, pid);
        if (!rec) return;   // never a new record: a Forget stays forgotten, and a copy with no registry (another GM's table) is left exactly as it is
        if (a.how !== 'record') {
            rec.charId = a.id; out.bound++;
            if (a.how === 'guess') out.guesses.push({ pid: pid, id: a.id });
            var mine = playableChars(camp, pid);
            if (mine.length > 1) out.several.push({ pid: pid, id: a.id, kept: mine.filter(function(k) { return k.id !== a.id; }).map(function(k) { return k.id; }) });
        }
        if (rec.charName !== c.name) rec.charName = c.name;   // kept in step for older builds and generated campaigns
        if (link && a.how !== 'record') mapsOf(camp).forEach(function(m) { m.whiteboard.forEach(function(w) { if (isObj(w) && w.isChar && !w.charId && w.ownerId === pid && w.charName === c.name) { w.charId = c.id; out.linked++; } }); });
    });
    return out;
}
// Where a player's token on a map comes from — ONE resolver for arrival, a give, Bring and the GM walking them through a portal:
//   keep   their own token of the character in play, here            adopt  an unowned token of it, here (never a hidden one)
//   (then their own token here bound only by name is linked, before anything is copied in)
//   prefer the token the GM dragged (offline travel), copied          clone  a token of it on another map (theirs first, never another player's)
//   link   a token bound only by NAME (no charId): theirs, here or from afar; or an unowned, shown one here that no room roster placed
//   spawn  nothing anywhere: a new token from the character (not when the campaign has sheets off: opts.noSpawn)
// A player with no character: the old name binding, which only ever matches a token with no charId or one they hold, never another player's.
// Returns { op, tok, mapId, here, charId } or { op: 'none' }.
function tokenSourceFor(camp, pid, mapId, opts) {
    var m = camp && hasOwn(camp.items, mapId) ? camp.items[mapId] : null;
    if (!isObj(m) || m.type !== 'map' || typeof pid !== 'string' || !pid) return { op: 'none' };
    var wb = Array.isArray(m.whiteboard) ? m.whiteboard : [], prefer = opts && isObj(opts.prefer) ? opts.prefer : null;
    var others = mapsOf(camp).filter(function(o) { return o !== m; });
    function find(list, test) { for (var i = 0; i < list.length; i++) { var w = list[i]; if (isObj(w) && typeof w.id === 'string' && test(w)) return w; } return null; }
    function elsewhere(test) { var hit = null; others.some(function(o) { var w = find(o.whiteboard, test); if (w) hit = { tok: w, mapId: o.id }; return !!w; }); return hit; }
    var a = activeCharOf(camp, pid), t, e;
    if (a.id) {
        var c = charsIn(camp)[a.id], cid = c.id;
        if ((t = find(wb, function(w) { return w.charId === cid && w.ownerId === pid; }))) return { op: 'keep', tok: t, mapId: m.id, charId: cid };
        if ((t = find(wb, function(w) { return w.charId === cid && !w.ownerId && !w.hidden; }))) return { op: 'adopt', tok: t, mapId: m.id, charId: cid };
        var named = function(w) { return w.isChar && !w.charId && w.charName === c.name && (!w.ownerId || w.ownerId === pid); };
        var namedMine = function(w) { return named(w) && w.ownerId === pid; };
        if ((t = find(wb, namedMine))) return { op: 'link', tok: t, mapId: m.id, here: true, charId: cid };   // the token they already hold here, bound by name: linked, never a second one beside it
        if (prefer && prefer.charId === cid && (!prefer.ownerId || prefer.ownerId === pid)) return { op: 'clone', tok: prefer, mapId: null, charId: cid };
        if ((e = elsewhere(function(w) { return w.charId === cid && w.ownerId === pid; }) || elsewhere(function(w) { return w.charId === cid && !w.ownerId; }))) return { op: 'clone', tok: e.tok, mapId: e.mapId, charId: cid };
        if (c.made !== 1 && (t = find(wb, function(w) { return named(w) && !w.ownerId && !w.hidden && !w.charRef; }))) return { op: 'link', tok: t, mapId: m.id, here: true, charId: cid };   // Onboarding F3 (owner: same names allowed): a player-made character never takes a GM's token by its name
        if ((e = elsewhere(namedMine))) return { op: 'link', tok: e.tok, mapId: e.mapId, here: false, charId: cid };   // an unowned namesake elsewhere (a GM's NPC, a room roster token) is never captured for good
        return opts && opts.noSpawn ? { op: 'none' } : { op: 'spawn', charId: cid };
    }
    if ((t = find(wb, function(w) { return w.isChar && w.ownerId === pid; }))) return { op: 'keep', tok: t, mapId: m.id };
    if (prefer && prefer.isChar && prefer.ownerId === pid && !prefer.charId) return { op: 'clone', tok: prefer, mapId: null };
    var rec = playerRec(camp, pid), nm = rec && typeof rec.charName === 'string' ? rec.charName : '', chose = !!nm && rec.charMade === nm;   // Onboarding F3b: a name its player chose (Just a token) finds only tokens they hold — never a GM's namesake (owner: same names allowed)
    if (!nm) return { op: 'none' };
    var legacy = function(w) { return w.isChar && w.charName === nm && (!w.charId || w.ownerId === pid) && (!w.ownerId || w.ownerId === pid) && (!chose || w.ownerId === pid); };
    if ((t = find(wb, function(w) { return legacy(w) && !w.ownerId && !w.hidden; }))) return { op: 'adopt', tok: t, mapId: m.id };
    if ((e = elsewhere(function(w) { return legacy(w) && w.ownerId === pid; }) || elsewhere(legacy))) return { op: 'clone', tok: e.tok, mapId: e.mapId };
    return { op: 'none' };
}
// Onboarding F1a: the campaign's rules for a player who has no character — stored only where they differ from the defaults (a waiting
// token on, no sight of its own): { token: 'off' } and/or { sight: true }; null when nothing differs (anything else is dropped)
function cleanNewPlayers(v) { if (!isObj(v)) return null; var o = {}; if (v.token === 'off') o.token = 'off'; if (v.sight === true) o.sight = true; if (v.create === 'invite' || v.create === 'off') o.create = v.create; if (v.fromFile === false) o.fromFile = false; return Object.keys(o).length ? o : null; }   // Onboarding F3: making characters ({ create: 'invite' | 'off' }, { fromFile: false }) — stored only where they differ
function newPlayerRules(camp) { var n = cleanNewPlayers(camp && camp.newPlayers) || {}; return { token: n.token === 'off' ? 'off' : 'on', sight: n.sight === true }; }
// A player's waiting tokens anywhere in the campaign (the host keeps one and moves it from map to map); never a character token (a Properties
// tick cannot make one both)
function waitingTokensOf(camp, pid) {
    var out = []; if (typeof pid !== 'string' || !pid) return out;
    mapsOf(camp).forEach(function(m) { m.whiteboard.forEach(function(w, i) { if (isObj(w) && w.waiting && !w.isChar && !w.charId && w.ownerId === pid) out.push({ mapId: m.id, w: w, i: i }); }); });
    return out;
}
// What becomes of player pid's waiting token on a map. op: the resolver's answer on an arrival or a give (tokenSourceFor); null for a tidy
// (a setting changed: nothing is adopted, copied or made). 'place' (theirs moves here, or one is made): nothing was found, they hold no
// character token on that map, the campaign gives waiting tokens and the GM has not removed theirs this session (blocked); a tidy places
// one only for a player with no character and no name binding. 'remove' (every waiting token of theirs goes): they have a token now, or
// the table gives none. 'leave': a tidy for an assigned player whose token is gone (their waiting token, if any, stays as it is).
function waitingNeed(camp, pid, mapId, op, rules, blocked) {
    if (op && op !== 'none') return 'remove';
    var m = camp && hasOwn(camp.items, mapId) ? camp.items[mapId] : null;
    if (!isObj(m) || m.type !== 'map' || typeof pid !== 'string' || !pid) return 'remove';
    if ((Array.isArray(m.whiteboard) ? m.whiteboard : []).some(function(w) { return isObj(w) && w.isChar && w.ownerId === pid; })) return 'remove';
    if (!isObj(rules) || rules.token === 'off' || blocked) return 'remove';
    if (op === 'none') return 'place';
    var rec = playerRec(camp, pid);
    return activeCharOf(camp, pid).id || (rec && typeof rec.charName === 'string' && rec.charName) ? 'leave' : 'place';
}
// "What a player plays", for labels: the character in play, else the old name binding
function playsAs(camp, pid) { var a = activeCharOf(camp, pid); if (a.id) return charsIn(camp)[a.id].name; var rec = playerRec(camp, pid); return rec && typeof rec.charName === 'string' ? rec.charName : ''; }
// The dial's ring click (the website's cycle): a side with no mark is marked (the active threat when it is the first, else queued); the
// active one clicked is cleared and the next queued one takes over; a queued one clicked becomes active and the old active is queued
function cycleThreat(list, bearing, sides) {
    var cur = cleanThreats(list), n = sides === 4 ? 4 : 6;
    if (typeof bearing !== 'number' || !isFinite(bearing)) return cur;
    var segOf = function(b) { return sideOf(b, n); }, s = segOf(bearing), at = -1;
    cur.forEach(function(b, i) { if (at < 0 && segOf(b) === s) at = i; });
    if (at < 0) return cleanThreats(cur.concat([bearing]));
    if (at === 0) return cur.slice(1);
    return [cur[at]].concat(cur.filter(function(b, i) { return i !== at; }));
}
function facingValue(fc, l) {   // a built-in facing name's value; with no context it is neutral: facing up, the arc front, nothing marked
    var th = fc && Array.isArray(fc.threats) ? fc.threats : [], arcs = th.map(function(b) { return threatArc(fc, b); }), a0 = arcs.length ? arcs[0] : 0;
    var count = function(k) { return arcs.filter(function(a) { return a === k; }).length; };
    switch (l) {
        case 'facing': return fc ? Math.round(fc.deg) % 360 : 0;
        case 'arc': return a0;
        case 'arc.front': return a0 === 0;
        case 'arc.side': return a0 === 1;
        case 'arc.rear': return a0 === 2;
        case 'threats': return th.length;
        case 'threats.front': return count(0);
        case 'threats.side': return count(1);
        case 'threats.rear': return count(2);
    }
    return undefined;
}
// 5h: the sources a value's breakdown keeps, 12 at most (what a hover's line shows). A GM-only one is never the one the cap leaves out: gmEffectNames
// reads them to keep the GM's public roll private, and twelve rows read through one visible effect once filled a list's total before the one
// row a GM-only effect moved (the review of the fold of 409). It takes the place of the last source that is not GM-only. seen, where it is
// handed in, keeps each source once, by through|name|op|v
function srcKeep(list, m, seen) {
    if (seen) { var sk = m.through + '|' + m.name + '|' + m.op + '|' + m.v; if (seen[sk] === 1) return; seen[sk] = 1; }
    if (list.length < 12) { list.push(m); return; }
    if (!m.gm) return;
    for (var i = list.length - 1; i >= 0; i--) if (!list[i].gm) { list[i] = m; return; }
}
// 1.5.8 (book handoff 90, Part B): what changed the values a roll reads, for its card. names: the roll's names with their values (the engine's
// breakdown, as rec.names holds them); vars: the resolver the roll was made with (its detail). One entry a number the effects changed, at most
// 8: { n: the name, b: its figure before the effects on it, a: after, m?: [{ s: the source's name, v: the amount }] the effects on the value
// itself, which take b to a, w?: [{ s, v, t }] the effects on a value it is worked out from (t), already inside b (an effect of +1 on a skill
// moves a defence worked out from it by what its formula makes of that), at most 8 of each. A GM-only source is never named: its amount stays
// folded into the figure before, so nothing of it shows. A toggle switched on by an effect is no number and is passed over. None: null
// 1.6.0 roll switches (the owner, by prompt: "In the ± window"): a bonus an item or an effect offers to some rolls, which the roller ticks in
// the roll's ± window, off by default: { name, v (whole, 1 to 99 either way, how much it helps, as the window's modifier), to: [ { f } a field's
// own roll | { r } a system roll | { l, key?, roll? } any roll on a list's rows, or only on rows of that entry, or only the list roll of that label ] }. kinds (a view's fields by id, when
// known): a field or a list it does not hold is no target. LIMITS.rollSw a holder, LIMITS.swTo rolls a switch
function cleanRollSw(v, kinds) {
    if (!Array.isArray(v)) return null; var outS = [];
    v.forEach(function(s) {
        if (outS.length >= LIMITS.rollSw || !isObj(s)) return;
        var nm = cutText(s.name, LIMITS.label), n = typeof s.v === 'number' && fin(s.v) ? Math.round(s.v) : 0; if (!nm || !n || n < -99 || n > 99) return;
        var to = [], seen = map();
        (Array.isArray(s.to) ? s.to : []).forEach(function(t) {
            if (to.length >= LIMITS.swTo || !isObj(t)) return; var x = null;
            if (typeof t.f === 'string' && FIELD_ID.test(t.f)) { if (!kinds || hasOwn(kinds, t.f)) x = { f: t.f }; }
            else if (typeof t.r === 'string' && ROLL_ID.test(t.r)) x = { r: t.r };
            else if (typeof t.l === 'string' && FIELD_ID.test(t.l)) { if (!kinds || kinds[t.l] === 'item-list') { x = { l: t.l }; var k = cleanItemKey(t.key); if (k) x.key = k; var rl = cutText(t.roll, LIMITS.label); if (rl) x.roll = rl; } }   // 1.6.0: roll, one list roll by its label
            if (!x) return; var sk = JSON.stringify(x).toLowerCase(); if (seen[sk]) return; seen[sk] = 1; to.push(x);
        });
        if (to.length) outS.push({ name: nm, v: n, to: to });
    });
    return outS.length ? outS : null;
}
// Every switch a character holds: of each row of an item list it carries (never a kept curse; an item that works while switched on, only while
// its row is on; a row of a group Counted once that does not apply, none), and of each library effect switched on, once. Each { s: its
// holder ('<list>|<row>' or '<effects list>|<effect>'), i: its place there, name, v, to, gm: a GM-only holder }
function rollSwitchesAll(sys, char) {
    var outA = [], lib = null, seenRef = map(); if (!isObj(sys) || !Array.isArray(sys.fields) || !isObj(char) || !isObj(char.values)) return outA;
    var push = function(s, d) { (Array.isArray(d.rollSw) ? d.rollSw : []).forEach(function(w, i) { if (isObj(w) && typeof w.name === 'string' && typeof w.v === 'number' && Array.isArray(w.to)) outA.push({ s: s, i: i, name: w.name, v: w.v, to: w.to, gm: d.vis === 'gm' }); }); };
    sys.fields.forEach(function(f) {
        if (!isObj(f) || typeof f.id !== 'string' || !hasOwn(char.values, f.id) || !Array.isArray(char.values[f.id])) return; var rows = char.values[f.id];
        if (f.kind === 'effects') rows.forEach(function(r) {
            if (!isObj(r) || r.on === false || typeof r.ref !== 'string' || seenRef[r.ref]) return;
            if (!lib) lib = fxLibOf(sys); var d = hasOwn(lib, r.ref) ? lib[r.ref] : null; if (!isObj(d)) return; seenRef[r.ref] = 1; push(f.id + '|' + r.ref, d);
        });
        else if (f.kind === 'item-list') { var spec = isObj(f.list) ? f.list : null, onc = onceIn(sys, spec, rows); rows.forEach(function(r, ri) {
            if (!isObj(r) || typeof r.id !== 'string' || r.hid === 1 || (onc && onc[ri] && onc[ri].top !== ri)) return;
            var rd = rowDef(sys, r), d = rd ? rd.def : null; if (!isObj(d) || !Array.isArray(d.rollSw)) return;
            if (d.modsOn === true && spec && isObj(spec.on) && !rowOn(spec, r)) return;
            push(f.id + '|' + r.id, d);
        }); }
    });
    return outA;
}
// The switches that offer themselves to one roll: ref { f } a field's own roll, { r } a system roll, { l, row } a roll on that row of that list
// (a target with a key only where the row's entry has that key; one with a roll only where ref.i is that list's roll of that label, read in the
// view handed in, so a player's index reads their own list). all: rollSwitchesAll's answer, else worked out here
function rollSwitches(sys, char, ref, all) {
    if (!isObj(ref)) return []; var A = Array.isArray(all) ? all : rollSwitchesAll(sys, char), rk = null;
    if (typeof ref.l === 'string') { if (typeof ref.row !== 'string' || !isObj(char) || !isObj(char.values) || !hasOwn(char.values, ref.l) || !Array.isArray(char.values[ref.l])) return []; var rw = null; char.values[ref.l].forEach(function(r) { if (isObj(r) && r.id === ref.row) rw = r; }); if (!rw) return []; var rdk = rowDef(sys, rw); rk = rdk && isObj(rdk.def) && typeof rdk.def.key === 'string' ? lower(rdk.def.key) : ''; }
    return A.filter(function(w) { return w.to.some(function(t) {
        if (!isObj(t)) return false;
        if (typeof ref.f === 'string') return t.f === ref.f;
        if (typeof ref.r === 'string') return t.r === ref.r;
        if (typeof ref.l === 'string') return t.l === ref.l && (typeof t.key !== 'string' || (!!rk && lower(t.key) === rk)) && (typeof t.roll !== 'string' || swRollIs(sys, ref, t.roll));
        return false;
    }); });
}
// 1.6.0: whether ref.i is the list roll of that label (trimmed, any case) on ref.l's own list in this view; no index, no roll there: no
function swRollIs(sys, ref, label) {
    if (!isObj(ref) || typeof ref.i !== 'number' || !isObj(sys) || !Array.isArray(sys.fields)) return false; var lr = null;
    sys.fields.forEach(function(f) { if (!lr && isObj(f) && f.id === ref.l && f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.rolls)) lr = f.list.rolls[ref.i] || null; });
    return isObj(lr) && typeof lr.label === 'string' && lower(lr.label.trim()) === lower(String(label).trim());
}
// The one judge of what a roller ticked (the host's, on every roll that names its switches): each pick { s, i } a switch that offers itself to
// that roll now, once. { ok, v: their sum, names: [{ n, v, gm? }] } or { ok: false }
function swJudge(sys, char, ref, picks) {
    if (!Array.isArray(picks) || !picks.length) return { ok: true, v: 0, names: [] };
    var av = rollSwitches(sys, char, ref), took = map(), v = 0, names = [], bad = false;
    picks.forEach(function(p) {
        if (bad) return; var w = isObj(p) ? av.filter(function(x) { return x.s === p.s && x.i === p.i; })[0] : null; var k = w ? w.s + '#' + w.i : '';
        if (!w || took[k]) { bad = true; return; } took[k] = 1; v += w.v; var nm = { n: w.name, v: w.v }; if (w.gm) nm.gm = true; names.push(nm);
    });
    return bad ? { ok: false } : { ok: true, v: v, names: names };
}
function rollMods(vars, names) {
    if (typeof vars !== 'function' || typeof vars.detail !== 'function' || !Array.isArray(names)) return null;
    var out = [], seen = map();
    names.forEach(function(n) {
        if (out.length >= 8 || !isObj(n) || typeof n.name !== 'string' || typeof n.value !== 'number' || !fin(n.value)) return;
        var l = lower(n.name); if (seen[l]) return; seen[l] = 1;
        var d = null; try { d = vars.detail(n.name); } catch (e) { d = null; }
        if (!isObj(d)) return;
        var m = [], w = [], have = map(), add = function(to, x, t) {
            if (!isObj(x) || x.gm || x.op !== 'add' || typeof x.v !== 'number' || !fin(x.v) || !x.v || typeof x.name !== 'string' || to.length >= 8) return;
            var k = x.name + '|' + x.v + '|' + (t || ''); if (have[k]) return; have[k] = 1;
            var e = { s: cutPoints(x.name, 60, ''), v: x.v }; if (!e.s) return;
            if (to === w) { var tc = typeof t === 'string' ? cutPoints(t, 60, '') : ''; if (!tc || lower(tc) === l) return; e.t = tc; }
            to.push(e);
        };
        (Array.isArray(d.mods) ? d.mods : []).forEach(function(x) { add(m, x, ''); });
        (Array.isArray(d.via) ? d.via : []).forEach(function(x) { add(w, x, x && x.through); });
        if (!m.length && !w.length) return;
        var sum = m.reduce(function(s, x) { return s + x.v; }, 0), nn = cutPoints(n.name, 60, ''); if (!nn) return;
        var e0 = { n: nn, b: n.value - sum, a: n.value }; if (m.length) e0.m = m; if (w.length) e0.w = w; out.push(e0);
    });
    return out.length ? out : null;
}
function makeResolver(sys, char, F, ropts) {   // ropts.noFx: the values with no effect applied (the breakdown's true base); ropts.facing / ropts.stance: tokenCtx(...) for the built-in token names
    var first = {}, autoL = (ropts && (ropts.noFx || ropts.noAuto)) ? null : autoEffectsOn(sys, char, F, first);   // conditions C4: the automatic effects on, from a first pass that holds none
    if (ropts && ropts.reuse === true && autoL && !autoL.length && first.r && !ropts.facing && !ropts.stance && !ropts.combat && !ropts.range && !ropts.cross) return first.r;   // 1.5.5 (a time rule's run, in a system chainsShallow passes): with no automatic effect on and no token's context, that first pass answers every name as this resolver would, so it is this resolver
    var ix = keyIndexOf(sys), cache = map(), chain = [], fx = (ropts && ropts.noFx) ? null : fxIndex(sys, char, ropts ? ropts.stance : null, autoL), detail = map();
    var unr = map();   // clarity package: a value as it worked out before its rounding, kept only where the rounding changed it (the sheet says so)
    var lctx = map(), asts = map(), pretty = map();   // Stage 6 F5a1: each list's rows (once a render), each column formula parsed once, readable names for a loop's message
    var rangeRead = false;   // range penalties R3: whether anything this resolver worked out read RangeMod or TargetDistance (fn.rangeRead)
    var lkx = linkByKey(sys), linkC = map();   // 1.6.0 linked sheets: the system's links by key, and each link's reader once a resolver
    // 1.6.0 linked sheets: <Key>.<name> reads the sheet a link holds, live, with this very system (so a player's press judged through the
    // players' view reads only what players may see); <Key>.has 1 while linked; every name 0 with no link. A player's copy reads the figures its
    // host worked out (char.lk). The linked sheet's own links are not followed: each name reads 0 there
    function linkVal(k, rest, l) {
        var s = linkC[k.id];
        if (s === undefined) {
            s = null;
            var lid = isObj(char) && isObj(char.links) && hasOwn(char.links, k.id) && typeof char.links[k.id] === 'string' ? char.links[k.id] : '';
            if (lid && !(ropts && ropts.linkDepth > 0)) {
                var fg = isObj(char.lk) && hasOwn(char.lk, k.id) && isObj(char.lk[k.id]) ? char.lk[k.id] : null;
                if (fg) s = { figs: isObj(fg.v) ? fg.v : {} };
                else { var o = null; try { o = _linkSrc ? _linkSrc(lid, sys) : null; } catch (e) { o = null; } if (isObj(o) && o.id === lid && o.id !== char.id) s = { r: makeResolver(sys, o, F, { linkDepth: 1 }) }; }
            }
            linkC[k.id] = s;
        }
        if (rest === 'has' && !ix.has) return s ? 1 : 0;
        if (!s) return 0;
        if (s.figs) return hasOwn(s.figs, rest) ? s.figs[rest] : undefined;
        var v = s.r(rest), d = s.r.detail(rest);
        if (d) { var vv = []; d.mods.forEach(function(m) { vv.push({ through: k.key + '.' + rest, name: m.name, op: m.op, v: m.v, gm: m.gm }); }); d.via.forEach(function(m) { vv.push(m); }); detail[l] = { base: d.base, mods: [], via: vv }; }   // a GM-only effect on the linked sheet keeps a public roll private, as one of the character's own does
        return v;
    }
    // 5h: where a derived value's effects came from — the sources recorded on the names its formula read (theirs and their own "via")
    function viaOf(names) {
        if (!fx || !Array.isArray(names)) return null;
        var out = [], seen = map();
        names.forEach(function(n) {
            var nm = n && typeof n.name === 'string' ? n.name : null, d = nm ? detail[lower(nm)] : null; if (!d) return;
            d.mods.forEach(function(m) { srcKeep(out, { through: nm, name: m.name, op: m.op, v: m.v, gm: m.gm }, seen); });
            d.via.forEach(function(m) { srcKeep(out, m, seen); });
        });
        return out.length ? out : null;
    }
    // 5h: a value with its effects applied (a toggle switched on; a number added to, kept within the wire-safe range), the sources recorded
    function withFx(l, v, via) {
        var s = fx ? fx[l] : null; if (!s && !via) return v;
        var out = v;
        if (s) { if (s.on) out = true; else if (typeof out === 'number') out = limFx(out + s.add, s); }   // 1.6.0: a floor and a ceiling after the changes that add
        detail[l] = { base: v, mods: s ? s.src : [], via: via || [] };
        return out;
    }
    function evalDef(name, text) {
        if (text === null) return { error: { message: 'GM only', pos: 0, len: 0 } };
        if (!text) return { error: { message: 'Missing formula', pos: 0, len: 0 } };
        chain.push(name);
        var res = F.evaluate(text, { vars: fn, random: noDice, depth: chain.length, stack: chain.map(function(n) { return pretty[n] || n; }) });
        chain.pop();
        if (res.ok) return { value: res.value, via: viaOf(res.breakdown && res.breakdown.names) };
        return { error: res.error };
    }
    function loopError(name) { return { error: { message: 'Formulas refer to each other in a loop: ' + chain.concat(name).map(function(n) { return pretty[n] || n; }).join(' → '), pos: 0, len: 0 } }; }
    // Stage 6 F5a1: a carried list for formulas — its rows (a kept curse, hid, counts nowhere: the GM's sheet agrees with its owner's and the host's
    // roll path), each with the definition it draws from; its number stats and columns by lower-case key
    function listCtx(f) {
        var lk = lower(f.key); if (lctx[lk]) return lctx[lk];
        var spec = isObj(f.list) ? f.list : null, stored = storedOf(f, char), rows = [], st = map(), cl = map();
        (Array.isArray(stored) ? stored : []).forEach(function(r) { if (!isObj(r) || r.hid === 1) return; var rd = rowDef(sys, r); rows.push({ r: r, d: rd ? rd.def : null, id: rowIdOf(r) || '' }); });
        (spec && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') st[lower(x.key)] = x; });
        (spec && Array.isArray(spec.cols) ? spec.cols : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') cl[lower(x.key)] = x; });
        var ctm = map(); (spec && Array.isArray(spec.counters) ? spec.counters : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') ctm[lower(x.key)] = x; });   // R2: its counters
        return (lctx[lk] = { f: f, spec: spec, rows: rows, st: st, cl: cl, ct: ctm });
    }
    function astOf(text) { return asts[text] || (asts[text] = F.parse(text)); }
    function rowVal(L, x, w) {   // a row's own name: lvl, qty, on, has, paid, a stat, a column (x.virt: an addressed row not carried — has false, qty 0)
        if (w === 'lvl') return rowLvl(L.spec, x.r, x.d);
        if (w === 'qty') return x.virt ? 0 : (L.spec && L.spec.noQty ? 1 : (x.r.qty | 0));
        if (w === 'on') return x.virt ? false : (x.r.keptOn === 1 ? false : rowOn(L.spec, x.r));   // a curse kept on reads as its owner holds it: off (owed review F5a1#2)
        if (w === 'has') return !x.virt;
        if (w === 'paid') return rowPaid(L.spec, x.r, x.d);
        if (w === 'opened') return !x.virt && isObj(x.r) && typeof x.r.opn === 'string' ? 1 : 0;   // 1.5.8: a row another row opens, 1 (openSync)
        if (w === 'loaded') return !x.virt && isObj(x.r) && isObj(x.r.ld) ? 1 : 0;   // 1.5.8 Loads from: a row that holds a loaded copy, 1
        if (w === 'loadmax') return x.virt ? 0 : loadMax(sys, L.spec, x.r);   // ... and that copy's full level (0 with none)
        if (w === 'chambered') return !x.virt && isObj(x.r) && Array.isArray(x.r.rd) ? x.r.rd.length : 0;   // 1.5.9 Chambers from: how many rounds it holds
        if (w === 'once' || w === 'oncecost' || w === 'oncefree') return onceWord(L, x, w);   // 1.5.8 Counted once
        if (w === 'made' && !listKeyed(L.spec, 'made')) return x.virt || !isObj(x.r) ? 0 : x.r.mk === 1 ? 1 : 0;   // 1.6.0 (v2, B5): added while its character was in the making
        if (w === 'startlvl' && !listKeyed(L.spec, 'startlvl')) return !x.virt && isObj(x.r) && typeof x.r.sl === 'number' && isObj(L.spec) && isObj(L.spec.lvl) && L.spec.lvl.start === true ? x.r.sl : rowLvl(L.spec, x.r, x.d);   // 1.6.0: the level it started at where its list keeps it, else its level now
        if (w === 'again') return x.virt || !isObj(x.r) ? 0 : (x.r.lnk === 1 && x.r.ag === 1) || (isObj(x.d) && x.d.again === 'name' && isObj(x.r.ov) && typeof x.r.ov.name === 'string' && !!x.r.ov.name.trim()) ? 1 : 0;   // 193: a copy held again under a name of its own (an owner's inline copy says so as ag)
        if (w === 'needsmet') { if (!x.badge) return undefined; if (x.virt || !isObj(x.d)) return 0; return needsMet(sys, char, x.d, x.r.lnk === 1, F, fn, L.spec && isObj(L.spec.lvl) ? rowLvl(L.spec, x.r, x.d) : null).ok ? 1 : 0; }   // 193: its entry's needs met, at the row's level, by the definition this machine holds (the GM's, or the owner's copy); a badge alone reads it, since a badge is worked out on each machine for its own screen and never sent, where a column or a roll the host works out could tell a player of a need they may not see
        if (w === 'setall') { if (x.virt || !L.spec || typeof L.spec.sets !== 'string') return 0; if (!L.sets) { L.sets = map(); setsOf(sys, L.spec, L.rows.map(function(it) { return it.r; })).forEach(function(g) { L.sets[lower(g.name)] = g; }); } var sgN = setOf(sys, L.spec, x.r), sg = sgN ? L.sets[lower(sgN)] : null; return sg && sg.all ? 1 : 0; }   // 1.6.0 R15: 1 while every row of its set is on
        if (L.st[w]) { if (L.st[w].kind !== 'pick') return rowStat(L.spec, x.d, L.st[w].key); var lb = rowStat(L.spec, x.d, L.st[w].key), op = null; (L.st[w].opts || []).forEach(function(o) { if (!op && lower(o.label) === lower(lb)) op = o; }); if (!op) return 0; var pk = lower(L.f.key) + '#' + x.id + '.' + w; if (chain.indexOf(pk) >= 0) return loopError(pk); pretty[pk] = pretty[pk] || (L.f.key + '[' + ((x.d && typeof x.d.name === 'string' && x.d.name) || x.id) + '].' + L.st[w].key); chain.push(pk); var ov = fn(op.name); chain.pop(); if (!detail[pk]) { var pv0 = viaOf([{ name: op.name }]); if (pv0) detail[pk] = { base: 0, mods: [], via: pv0 }; } return ov === undefined ? { error: { message: 'Unknown name "' + op.name + '"', pos: 0, len: 0 } } : ov; }   // F5a2: a choice reads its option's value (ST); none chosen: 0
        if (L.cl[w]) return colVal(L, x, L.cl[w]);
        if (L.ct && L.ct[w]) return x.virt ? 0 : rowCt(x.r, L.ct[w]);   // Stage 6 HUD R2: a counter (a row not carried: 0)
        if (w === 'granted') return x.virt || !isObj(x.r) ? 0 : typeof x.r.gr === 'string' ? 1 : 0;   // 1.6.0 (v2, B4): 1 for a row another row granted. Never reserved: a list's own stat, column or counter of that name is read above
        return undefined;
    }
    function onceWord(L, x, w) {   // 1.5.8 Counted once: Row.once 1 where the row applies or is in no group, else 0; Row.oncecost the group's highest cost and Row.oncefree its largest free (a row in no group: its own; none named: 0). The build is priced as it is held: every row takes part
        var o = L.spec && isObj(L.spec.once) ? L.spec.once : null, gi = null;
        if (o && !x.virt) { if (L.once === undefined) L.once = onceOf(L.spec, L.rows, null); for (var oi = 0; L.once && oi < L.rows.length; oi++) if (L.rows[oi] === x || L.rows[oi].r === x.r) { gi = L.once[oi]; break; } }
        if (w === 'once') return gi ? (L.rows[gi.top] === x || L.rows[gi.top].r === x.r ? 1 : 0) : 1;
        var key = o ? (w === 'oncecost' ? o.cost : o.free) : ''; if (!key) return 0;
        var one = function(it) { var c = L.cl[lower(key)]; return c ? colVal(L, it, c) : rowStat(L.spec, it.d, key); };
        if (!gi) return one(x);
        var best = null; for (var mi = 0; mi < gi.mem.length; mi++) { var v = one(L.rows[gi.mem[mi]]); if (isObj(v) && v.error) return v; if (typeof v === 'number' && isFinite(v) && (best === null || v > best)) best = v; }
        return best === null ? 0 : best;
    }
    // 1.5.9 Chambers from: Row.round.<w>, a stat or a column of the next round to fire, and Row.fired.<w>, of the round last fired, else the next
    // (a website's launchedPayload: lastFired ?? loaded); 0 with none. Worked out on the round's own list, its copy a row of that list
    function roundVal(L, x, w) {
        var sg = w.split('.'); if (sg.length !== 2 || (sg[0] !== 'round' && sg[0] !== 'fired') || !L.spec || !isObj(L.spec.chamber)) return undefined;
        var sf = chamberSrc(sys, L.spec); if (!sf) return undefined;
        var SL = listCtx(sf); if (!SL.st[sg[1]] && !SL.cl[sg[1]]) return undefined;
        var rd = !x.virt && isObj(x.r) && Array.isArray(x.r.rd) ? x.r.rd : [], cp = sg[0] === 'fired' && !x.virt && isObj(x.r) && isObj(x.r.fd) ? x.r.fd : rd[0];
        if (!isObj(cp)) return 0;
        var cd = rowDef(sys, cp); return rowVal(SL, { r: Object.assign({}, cp, { qty: 1 }), d: cd ? cd.def : null, id: (x.id || '') + '~' + sg[0] }, sg[1]);
    }
    // 1.6.0 R14: Row.parts, how many parts a host holds (their quantities), and Row.parts.<w>, a stat or a column of the parts' list summed over them, each times its quantity
    function partsVal(L, x, w) {
        if (!L.spec || !isObj(L.spec.parts)) return undefined;
        var sf = partsSrc(sys, L.spec); if (!sf) return undefined;
        var SL = listCtx(sf); if (w && !(SL.st[w] && SL.st[w].kind !== 'pick') && !SL.cl[w]) return undefined;
        if (x.virt) return 0;
        var sum = 0; for (var pi = 0; pi < SL.rows.length; pi++) { var it = SL.rows[pi]; if (!isObj(it.r) || it.r.in !== x.id) continue; var q = SL.spec && SL.spec.noQty ? 1 : (it.r.qty | 0) || 1; if (!w) { sum += q; continue; } var pv = SL.cl[w] ? colVal(SL, it, SL.cl[w]) : rowVal(SL, it, w); if (isObj(pv) && pv.error) return pv; sum += (pv === true ? 1 : typeof pv === 'number' && isFinite(pv) ? pv : 0) * q; }
        return sum;
    }
    function rowVars(L, x) {   // a column's names: Row.* reads this row, every other name the resolver (one cache)
        var v = function(name) { var l = lower(name); if (l.slice(0, 4) === 'row.') { var w = l.slice(4); if (w === 'parts' || w.slice(0, 6) === 'parts.') return partsVal(L, x, w === 'parts' ? '' : w.slice(6)); return w.indexOf('.') < 0 ? rowVal(L, x, w) : roundVal(L, x, w); } return fn(name); };
        v.detail = function(name) { var l = lower(name); if (l.slice(0, 4) === 'row.' && l.indexOf('.', 4) < 0) return detail[lower(L.f.key) + '#' + x.id + '.' + l.slice(4)] || null; return detail[l] || null; };   // 1.5.8: a row's own column under its own key
        return v;
    }
    function colVal(L, x, c) {   // a column worked out for one row, under its own name on the chain (a loop reads as one); errors are never cached
        var canon = lower(L.f.key) + '#' + x.id + '.' + lower(c.key);
        if (canon in cache) return cache[canon];
        if (chain.indexOf(canon) >= 0) return loopError(canon);
        if (c.formula === null) return { error: { message: 'GM only', pos: 0, len: 0 } };
        if (!c.formula) return { error: { message: 'Missing formula', pos: 0, len: 0 } };
        var p = astOf(c.formula); if (!p.ok) return { error: p.error };
        pretty[canon] = L.f.key + '[' + ((x.d && typeof x.d.name === 'string' && x.d.name) || x.id) + '].' + c.key;
        chain.push(canon);
        var res = F.evaluateAst(p.ast, { vars: rowVars(L, x), random: noDice, depth: chain.length, stack: chain.map(function(n) { return pretty[n] || n; }) });   // the engine's own loop message reads Skills[Karate].Cost, never a row id
        chain.pop();
        if (!res.ok) return { error: res.error };
        var vv = viaOf(res.breakdown && res.breakdown.names), out = res.value;
        var rk = x.d && typeof x.d.key === 'string' && ITEM_KEY.test(x.d.key) ? x.d.key : x.virt && typeof x.id === 'string' && x.id.slice(0, 2) === 'k:' ? x.id.slice(2) : '';   // a row not carried: the key it was asked by
        var rs = fx && rk ? fx[rowModSlot(L.f.key, rk, c.key)] : null;   // 1.5.8: the changes aimed at this row's entry by its key
        if (rs && typeof out === 'number') out = limFx(out + rs.add, rs);
        if (rs || vv) detail[canon] = { base: res.value, mods: rs ? rs.src : [], via: vv || [] };   // owed review F5a1#4: gmEffectNames sees a GM-only effect through a column
        cache[canon] = out; return out;
    }
    function totalOf(L, l, w, onlyOn) {   // L.count | L.qty | L.paid | L.<stat> | L.<col> (L.on.* over the rows switched on): a stat and paid per unit × qty, a column summed (true counts 1); the first row error wins
        if (l in cache) return cache[l];
        if (w !== 'count' && w !== 'qty' && w !== 'paid' && !L.st[w] && !L.cl[w]) return undefined;
        if (L.st[w] && L.st[w].kind === 'pick') return undefined;   // F5a2: a choice has no total
        if (chain.indexOf(l) >= 0) return loopError(l);
        chain.push(l);
        var sum = 0, err = null, vias = [], seenV = map();
        for (var i = 0; i < L.rows.length && !err; i++) {
            var x = L.rows[i]; if (onlyOn && (x.r.keptOn === 1 || !rowOn(L.spec, x.r))) continue;   // a curse kept on: off, as its owner holds it
            var qn = L.spec && L.spec.noQty ? 1 : (x.r.qty | 0);
            if (w === 'count') { sum += 1; continue; }
            if (w === 'qty') { sum += qn; continue; }
            var v = rowVal(L, x, w);
            if (v && typeof v === 'object' && v.error) { err = v; break; }
            if (L.cl[w] || (L.st[w] && L.st[w].kind === 'pick')) { var dv = detail[lower(L.f.key) + '#' + x.id + '.' + w]; if (dv) dv.via.forEach(function(m) { srcKeep(vias, m, seenV); }); }   // each source once, a GM-only one past the cap
            var nv = v === true ? 1 : (typeof v === 'number' && isFinite(v) ? v : 0);
            sum += (w === 'paid' || L.st[w]) ? nv * qn : nv;
        }
        chain.pop();
        if (err) return err;
        if (sum > 1e15) sum = 1e15; else if (sum < -1e15) sum = -1e15;
        if (vias.length) detail[l] = { base: sum, mods: [], via: vias };
        cache[l] = sum; return sum;
    }
    // 1.5.4 (the site equivalent plan, option 1): L.max.<w> | L.min.<w> (L.on.max.* | L.on.min.* over the rows switched on) — the highest or the
    // lowest figure one row gives: a number stat as the row reads it (never times its quantity: it is the row's own figure), a column's value
    // (true reads 1), a counter's count (1.6.0: a count the clock moves, read at its highest); 0 with no row. A choice and the row words have none
// (undefined: an unknown name). The first row error wins, and a
    // column that reads its own list's highest is a loop, as for totals; a column's effects' sources are kept as a total keeps them
    function extremeOf(L, l, w, onlyOn, hi) {
        if (l in cache) return cache[l];
        if (!(L.st[w] && L.st[w].kind !== 'pick') && !L.cl[w] && !(L.ct && L.ct[w])) return undefined;
        if (chain.indexOf(l) >= 0) return loopError(l);
        chain.push(l);
        var best = null, err = null, vias = [], seenV = map();
        for (var i = 0; i < L.rows.length && !err; i++) {
            var x = L.rows[i]; if (onlyOn && (x.r.keptOn === 1 || !rowOn(L.spec, x.r))) continue;   // a curse kept on: off, as its owner holds it
            var v = rowVal(L, x, w);
            if (v && typeof v === 'object' && v.error) { err = v; break; }
            if (L.cl[w]) { var dv = detail[lower(L.f.key) + '#' + x.id + '.' + w]; if (dv) dv.via.forEach(function(m) { srcKeep(vias, m, seenV); }); }   // each source once, a GM-only one past the cap
            var nv = v === true ? 1 : (typeof v === 'number' && isFinite(v) ? v : 0);
            if (best === null || (hi ? nv > best : nv < best)) best = nv;
        }
        chain.pop();
        if (err) return err;
        var out = best === null ? 0 : best; if (out > 1e15) out = 1e15; else if (out < -1e15) out = -1e15;
        if (vias.length) detail[l] = { base: out, mods: [], via: vias };
        cache[l] = out; return out;
    }
    // Owed review leftover (a), the owner's ruling of 2026-10-01: a GM-only row is its key's row only where the players' view hides that
    // name — on a GM-only list, or where a GM-only entry in the list's scope has the key (the names cleanSystem blanks for players).
    // Anywhere else (a GM-only custom row whose key no such entry has, the copy a deleted GM-only entry left, one sharing its key with a
    // visible entry, a GM-only library entry the core does not hold) it reads as not carried on every machine: its owner's copy has no
    // key for it, so the GM's sheet would otherwise work out a number theirs cannot — and the host's clamp, or a public roll of the GM's,
    // would show it. Worked out once per list and resolver, and only when such a row is met.
    function gmKeyed(L, key) {
        if (L.f.vis === 'gm') return true;
        if (!L.gmK) L.gmK = gmEntryKeys(sys, [L.f])[lower(L.f.key)] || map();
        return L.gmK[key] === 1;
    }
    function findRow(L, key) {   // L.<Key>.*: the first carried row with that key, the rows its owner can see first (critic 7); else the library entry with it in L's scope; else a row of defaults
        var hit = null, gmHit = null, cats = L.spec && Array.isArray(L.spec.cats) ? L.spec.cats : null, ent = null;
        L.rows.forEach(function(x) { if (hit || !x.d || typeof x.d.key !== 'string' || lower(x.d.key) !== key) return; if (x.d.vis === 'gm') { if (!gmHit && gmKeyed(L, key) && (!cats || catIn(cats, x.d.category))) gmHit = x; } else hit = x; });   // owed review F5a1#5: a GM-only row out of the list's categories is not the key's (the players' view keeps that name)
        if (hit || gmHit) return hit || gmHit;
        var pick = function(it) { if (!ent && isObj(it) && typeof it.key === 'string' && lower(it.key) === key && (!cats || catIn(cats, it.category))) ent = it; };
        (Array.isArray(sys.items) ? sys.items : []).forEach(pick); if (!ent) (Array.isArray(sys.core) ? sys.core : []).forEach(pick);   // L1d: then the core (the library's addressed entries)
        return ent ? { r: { defId: ent.id, qty: 0 }, d: ent, id: 'k:' + key, virt: true } : { r: { qty: 0 }, d: null, id: 'k:' + key, virt: true };
    }
    function listName(l, name) {   // a name on a carried list, or undefined (then the rest of the lookup); name: as written (a loop's message)
        var segs = l.split('.'), f = ix[segs[0]]; if (!f || f.kind !== 'item-list' || segs.length < 2 || segs.length > 4) return undefined;
        var on4 = segs.length === 4 && segs[1] === 'on', ext = on4 ? segs[2] : segs[1];   // 1.5.4: L.max.<w>, L.min.<w>, and four parts only for L.on.max.<w> and L.on.min.<w>
        if (segs.length === 4 && ext !== 'max' && ext !== 'min') return undefined;
        var L = listCtx(f); if (typeof name === 'string' && !pretty[l]) pretty[l] = name;
        if (segs.length === 2) return totalOf(L, l, segs[1], false);
        if ((ext === 'max' || ext === 'min') && segs.length === (on4 ? 4 : 3)) return extremeOf(L, l, segs[segs.length - 1], on4, ext === 'max');
        if (segs.length === 4) return undefined;
        if (segs[1] === 'on') return totalOf(L, l, segs[2], true);
        var w = segs[2]; if (w !== 'lvl' && w !== 'qty' && w !== 'on' && w !== 'has' && w !== 'paid' && !L.st[w] && !L.cl[w] && !(L.ct && L.ct[w])) return undefined;   // R2: or a counter
        if (l in cache) return cache[l];
        var xr = findRow(L, segs[1]), v = rowVal(L, xr, w);
        if (v && typeof v === 'object' && v.error) return v;
        if (L.cl[w] || (L.st[w] && L.st[w].kind === 'pick')) { var dA = detail[lower(L.f.key) + '#' + xr.id + '.' + w]; if (dA) detail[l] = dA; }   // F5a1#4: an addressed column or choice carries its effects' sources
        cache[l] = v; return v;
    }
    function builtin(l) {   // 5h Fold 3: Facing, Arc, Arc.front|side|rear, Threats, Threats.front|side|rear — a field named Facing, Arc or Threats keeps its whole family
        var fam = l.split('.')[0]; if (ix[fam]) return undefined;
        if (lkx[fam] && l.length > fam.length + 1) return linkVal(lkx[fam], l.slice(fam.length + 1), l);   // 1.6.0: a linked sheet's names (a field keyed so keeps them, above)
        if (fam === 'date') { var dk = l.slice(5); if (dk !== 'year' && dk !== 'day' && dk !== 'days' && dk !== 'hour' && dk !== 'minute') return undefined; var dv = null; try { dv = _dateSrc ? _dateSrc() : null; } catch (e) { dv = null; } return isObj(dv) && fin(dv[dk]) ? dv[dk] : 0; }   // 1.6.0: the campaign's date
        // 1.6.0: TargetSize reads with the range, so the host's privacy rule counts it too
        if (l === 'rangemod' || l === 'targetdistance' || l === 'heightmod' || l === 'heightdiff' || l === 'targetsize') { rangeRead = true; var rgc = ropts && isObj(ropts.range) ? ropts.range : null, rgv = rgc ? (l === 'rangemod' ? rgc.mod : l === 'targetdistance' ? rgc.dist : l === 'heightmod' ? rgc.hmod : l === 'targetsize' ? rgc.size : rgc.hdiff) : 0; return typeof rgv === 'number' && isFinite(rgv) ? rgv : 0; }   // item 19 H2: HeightMod and HeightDiff read with the range, so the host's privacy rule counts them too   // range penalties R2: to the roller's target; 0 with none (a field of the system's own of that name keeps it)
        if (l === 'attemptmargin') { var atR = ropts && isObj(ropts.att) ? ropts.att.m : 0; return fin(atR) ? atR : 0; }   // 1.6.0 (B2): the margin of the attempt a resist roll answers (withAttempt); 0 for any other roll
        if (l === 'crossstep' || l === 'crossed') { var cxR = ropts && isObj(ropts.cross) ? ropts.cross : null, cxV = cxR ? cxR[l === 'crossstep' ? 'step' : 'n'] : 0; return fin(cxV) ? cxV : 0; }   // 1.6.0: a crossing's run (withCross); 0 for a press, a reminder or anything else (a field of the system's own of that name keeps it, above)
        if (l === 'making') return isObj(char) && (char.making === 1 || char.making === true) ? 1 : 0;   // 1.6.0: 1 while the character is in the making (its owner's copy carries it too), else 0; a field of the system's own named Making keeps the name, above
        if (l === 'combatround') { var cb = ropts && isObj(ropts.combat) ? ropts.combat : null; return cb && fin(cb.round) ? Math.max(0, Math.floor(cb.round)) : 0; }   // HUD frame (HF5b): the round of the combat on the token's map; 0 with no token, no combat, or offline (a field of the system's own keeps the name, above)
        if (l === 'posture' || l === 'elevation') { var stc = ropts && isObj(ropts.stance) ? ropts.stance : null; if (l === 'posture') return stc && ownPostures(sys) ? postureAt(sys, stc.pid).i : 0; return stc && typeof stc[l] === 'number' ? stc[l] : 0; }   // Stage 6: the token's stance; conditions C3: Posture is its place in the system's own list
        if (fam !== 'facing' && fam !== 'arc' && fam !== 'threats') return undefined;
        return facingValue(ropts && ropts.facing ? ropts.facing : null, l);
    }
    function fn(name) {
        var l = lower(name);
        if (l in cache) return cache[l];
        var field = ix[l], suffix = null;
        if (!field && l.indexOf('.') > 0) { var lnv = listName(l, name); if (lnv !== undefined) return lnv; }   // Stage 6 F5a1: a carried list's totals and addressed rows (after the exact key, before the suffixes)
        if (!field) { var dot = l.lastIndexOf('.'); if (dot > 0 && NAME_SUFFIX[l.slice(dot + 1)]) { field = ix[l.slice(0, dot)]; suffix = l.slice(dot + 1); } }
        if (!field) return builtin(l);
        if (chain.indexOf(l) >= 0) return loopError(l);
        var out, r, k = field.kind;
        if (k === 'text' || k === 'select') out = storedOf(field, char);
        else if (k === 'notes') return undefined;
        else if (k === 'number' || k === 'toggle') { var sv = storedOf(field, char); out = suffix ? sv : withFx(l, sv, null); }   // 5h: an effect adds to a number or switches a toggle on (a suffixed name reads the stored value, as before)
        else if (k === 'skill') {
            var ranks = storedOf(field, char);
            if (suffix === 'ranks') out = ranks;
            else if (suffix === 'base' || !suffix) { var b = (field.base || field.base === null) ? evalDef(l, field.base) : { value: 0 }; if (b.error) return b; out = suffix === 'base' ? withFx(l, b.value, b.via || null) : withFx(l, ranks + b.value, b.via || null); }   // 5h: effects reach the total; ranks and base stay raw. A base the players' view blanked (it names a GM-only field) reads "GM only" for the skill and .base, as a formula does (never ranks + 0); no base is ranks alone
            else return undefined;
        } else if (k === 'resource') {
            if (suffix && suffix !== 'max' && suffix !== 'cur' && suffix !== 'full') return undefined;   // 1.6.0: .full
            var stored = storedOf(field, char);   // { cur } — cur null means "full" (def: 'max')
            if (suffix === 'full') out = stored.cur === null ? 1 : 0;   // 1.6.0: 1 while nothing is stored (the pool reads its max), 0 once a current is stored, whatever it holds
            else if (suffix === 'max') { r = (field.maxFormula || field.maxFormula === null) ? evalDef(l, field.maxFormula) : { value: field.min || 0 }; if (r.error) return r; out = withFx(l, field.round && field.maxFormula ? roundKept(l, r.value, field) : r.value, r.via || null); }   // l is already "key.max": one chain name, so a max naming itself is reported as the loop it is
            else if (stored.cur === null) { var mxv = fn(field.key + '.max'); if (mxv && typeof mxv === 'object' && mxv.error) return mxv; out = withFx(l, mxv, viaOf([{ name: field.key + '.max' }])); }   // a full pool reads its max through the resolver (worked out once, cached)
            else out = stored.cur;
        } else if (k === 'formula') { if (suffix) return undefined; r = evalDef(l, field.formula); if (r.error) return r; out = withFx(l, field.round ? roundKept(l, r.value, field) : r.value, r.via || null); }   // clarity package: rounded as the GM picked, then the effects added
        else return undefined;
        cache[l] = out;   // values only; an error is path-dependent and is never cached
        return out;
    }
    function roundKept(l, v, field) { var rv = roundBy(v, field.round, field.roundTo, field.roundAt); if (rv !== v) unr[l] = v; else delete unr[l]; return rv; }   // clarity package
    fn.unrounded = function(name) { var l = lower(name); return Object.prototype.hasOwnProperty.call(unr, l) ? unr[l] : undefined; };   // ... the figure before its rounding, where the rounding changed it
    fn.reset = function() { linkC = map(); cache = map(); chain = []; detail = map(); unr = map(); lctx = map(); pretty = map(); rangeRead = false; };
    fn.rangeRead = function() { return rangeRead; };   // range R3: a fresh resolver asked for a roll's names says whether its value reads the range
    fn.row = function(fieldId, rowId, lv) { var f = null; sys.fields.forEach(function(x) { if (!f && x.id === fieldId && x.kind === 'item-list') f = x; }); if (!f) return null; var L = listCtx(f); for (var i = 0; i < L.rows.length; i++) if (L.rows[i].id === rowId) { if (lv === undefined) return rowVars(L, L.rows[i]); var lsp = isObj(f.list) ? f.list : null, x0 = L.rows[i], own = lsp && lsp.lvl ? rowLvl(lsp, x0.r, x0.d) : null, lmin = lsp && lsp.lvl && typeof lsp.lvl.min === 'number' ? lsp.lvl.min : 1; if (typeof lv !== 'number' || lv !== Math.floor(lv) || typeof own !== 'number' || lv < lmin || lv > own) return null; return rowVars(L, { r: Object.assign({}, x0.r, { lvl: lv }), d: x0.d, id: x0.id + '@' + lv }); } return null; };   // 1.6.0 R12: lv, a level to read Row.lvl at (a list roll that asks the level), from the list's lowest to the row's own; its columns worked out apart   // F5b: a row's own names for a roll on it (a kept curse has none)
    fn.unheld = function(fieldId, def) { var f = null; sys.fields.forEach(function(x) { if (!f && x.id === fieldId && x.kind === 'item-list') f = x; }); var sp = f && isObj(f.list) ? f.list : null; if (!sp || typeof sp.unheld !== 'string' || !sp.unheld || !isObj(sp.lvl) || !isObj(def) || typeof def.id !== 'string') return null; var L = listCtx(f), lv = F.evaluate(sp.unheld, { vars: rowVars(L, { r: { defId: def.id, qty: 0 }, d: def, id: 'u:' + def.id, virt: true }), random: noDice }); if (!lv.ok || typeof lv.value !== 'number' || !fin(lv.value)) return null; var n = Math.max(-LIMITS.lvlAbs, Math.min(LIMITS.lvlAbs, lv.value)); return rowVars(L, { r: { defId: def.id, qty: 0, lvl: n }, d: def, id: 'u:' + def.id + '@' + n, virt: true }); };   // 1.6.0 Rolls unheld entries: an entry nobody holds, its names with Row.lvl at the list's Unheld level (worked out first with its names at its own level) and Row.has 0; null where the list rolls none or the level cannot be worked out
    fn.needsOk = function(f, row, text, self, badge) { var L = f ? listCtx(f) : null; if (!L || !isObj(row) || typeof text !== 'string' || !text) return true; if (self === true && readsOn(text, F)) return true; var rd = rowDef(sys, row), xR = { r: row, d: rd ? rd.def : null, id: rowIdOf(row) || '' }; if (badge === true) xR.badge = true; var rv0 = rowVars(L, xR), v = F.evaluate(text, { vars: self === true ? withOnSelf(rv0, true) : rv0, random: noDice }); return !!(v.ok && (v.value === true || (typeof v.value === 'number' && v.value !== 0))); };   // Stage 6 HUD R2b: a list roll's needs on one row (an error holds it back)
    fn.cellDetail = function(f, row, colKey) { var id = rowIdOf(row); return f && id ? detail[lower(f.key) + '#' + id + '.' + lower(colKey)] || null : null; };   // 1.6.0 R3: what changed one row's column (the effects aimed at it, and those on the names it reads)
    fn.rollFig = function(f, row, text) { var L = f ? listCtx(f) : null; if (!L || !isObj(row) || typeof text !== 'string' || !text) return ''; var rd = rowDef(sys, row); return rollFigOf(text, rowVars(L, { r: row, d: rd ? rd.def : null, id: rowIdOf(row) || '' }), F); };   // 1.6.0 R7: a roll's own figure on one row
    fn.ctMax = function(f, row, key) { var L = f ? listCtx(f) : null, t = L && L.ct ? L.ct[lower(key)] : null; if (!t || !t.max || !isObj(row)) return null; var rd = rowDef(sys, row), v = F.evaluate(t.max, { vars: rowVars(L, { r: row, d: rd ? rd.def : null, id: rowIdOf(row) || '' }), random: noDice }); return v.ok && typeof v.value === 'number' && fin(v.value) ? Math.max(0, Math.floor(v.value)) : null; };   // Stage 6 HUD R2: a counter's most for this row (none: null)
    fn.cell = function(f, row, colKey) { var L = listCtx(f), c = L.cl[lower(colKey)]; if (!c || !isObj(row)) return undefined; var rd = rowDef(sys, row); return colVal(L, { r: row, d: rd ? rd.def : null, id: rowIdOf(row) || '' }, c); };   // F5a1: one row's column (the sheet's cells)
    fn.stat = function(f, row, key) { var L = listCtx(f), s = L.st[lower(key)]; if (!s || s.kind === 'pick' || !isObj(row)) return undefined; var rd = rowDef(sys, row); return rowStat(L.spec, rd ? rd.def : null, s.key); };   // 1.5.4 With: one row's number stat, as its columns read it (Row.<stat>)
    fn.chain = function() { return chain.slice(); };
    fn.detail = function(name) { return detail[lower(name)] || null; };   // 5h: { base, mods: [{name, op, v, gm}], via: [{through, name, op, v, gm}] } or null
    return fn;
}
// Stage 6: a caption's {…} — "±X" (or "+/-X") shows X with its sign (+2, -1, +0); the sign is never formula syntax, so no older caption reads differently.
// 1.5.4: "X|lbs" shows X with a unit (unit: the words after the last bar, cut as a field's unit); a bar is no formula syntax either, so a
// caption that holds one read as an error before. Every reader of a caption's formula asks this, so the unit is never read as formula text
function capExpr(s) {
    var t = String(s).trim(), bar = t.lastIndexOf('|'), unit = '';
    if (bar >= 0) { unit = cutPoints(t.slice(bar + 1), LIMITS.unit, ' '); t = t.slice(0, bar).trim(); }
    var m = /^(\u00b1|\+\/-)\s*/.exec(t), out = m ? { expr: t.slice(m[0].length), signed: true } : { expr: t, signed: false };
    if (unit) out.unit = unit;
    return out;
}
// A caption's figure with its unit (1.5.4): "32 lbs" under Imperial, and a measure in metric in its place under Metric, "14.5 kg", as the
// website writes a limit of its encumbrance table; a signed figure keeps its plus. shown: the figure as the caption writes it
function capWords(unit, v, shown, signed, metric) {
    var m = cleanFieldUnit(unit, 'number');
    if (metric === true && m) { var n = metricNum(m, v, String(shown).replace(/^\+/, '')); if (n) return (signed && Number(n) > 0 ? '+' : '') + n + ' ' + MEASURES[m].word; }
    return shown + ' ' + unit;
}
// HUD frame (HF5a, H3): a roll's label may show values like a caption. What players see of a label that names a GM-only value: its plain
// text before the first "{", less a trailing separator ("Trap save ({GMFig})" -> "Trap save"), or Roll
function labelHead(text) { return String(text).split('{')[0].replace(/[\s(\[:\u00b7-]+$/, '') || 'Roll'; }
// The names a label's {...} values read, as a roll's breakdown names them ([{ name }]) for the GM's privacy check; the first LIMITS.captionExprs, as drawn.
// vars: the resolver the label is worked out with (captionParts' own evaluation), and then only the names each value actually read — a branch
// if() does not take reads nothing, a value that fails shows a dash and reads nothing — as the roll's breakdown lists them; without it, every name written
function labelNames(F, text, vars) {
    var out = [], seen = map(); if (typeof text !== 'string' || !F || !F.names) return out;
    var re = /\{([^{}]{1,300})\}/g, m, n = 0;
    while (n < LIMITS.captionExprs && (m = re.exec(text))) {
        n++; var ex = capExpr(m[1]).expr, ns = null;
        if (typeof vars === 'function' && typeof F.evaluate === 'function') { try { var res = F.evaluate(ex, { vars: vars, random: noDice }); ns = res && res.ok ? ((res.breakdown && res.breakdown.names) || []).map(function(x) { return x && x.name; }) : []; } catch (e) { ns = null; } }   // a throw reads as every name written (fail closed)
        if (!ns) { try { ns = F.names(ex) || []; } catch (e) { ns = []; } }
        ns.forEach(function(nm) { if (typeof nm !== 'string') return; var l = lower(nm); if (!seen[l]) { seen[l] = 1; out.push({ name: nm }); } });
    }
    return out;
}
// HF5 review: the GM-only names a label shows ANYWHERE, read as the players' view scrubs it (fail closed): after every "{", closed or not,
// drawn or not, the sign stripped; a piece that is not a formula is read word by word. The names (each once), for the host's own public roll
// (which then goes to the GM alone) and the validator
function labelGmNames(sys, F, text) {
    if (typeof text !== 'string' || text.indexOf('{') < 0 || !sys || !Array.isArray(sys.fields) || !F || !F.parse || !F.names) return [];
    var ns = [], seen = map(), add = function(n) { var l = lower(n); if (!seen[l]) { seen[l] = 1; ns.push({ name: n }); } };
    text.split('{').slice(1).forEach(function(p) {
        var ex = capExpr(p.split('}')[0]).expr, ok = false;
        try { ok = !!F.parse(ex).ok; if (ok) F.names(ex).forEach(add); } catch (e) { ok = false; }
        if (!ok) (ex.match(/[A-Za-z_][A-Za-z0-9_.]*/g) || []).forEach(function(t) { add(t); if (t.indexOf('.') > 0) add(t.split('.')[0]); });
    });
    return gmOnlyNames(sys, ns);
}
// Stage 5g Fold B: a field's caption as parts for the sheet to draw — plain text, and each {formula} worked out for this character (no
// dice; at most LIMITS.captionExprs, the rest stays text). [{ text }] | [{ value, text }] | [{ error }]; the sheet draws them as text only.
function captionParts(sys, char, F, text, vars, metric) {   // vars: the render's own resolver (resolveAll(...).vars), so a caption reads values already worked out; metric (1.5.4): the viewer's setting, for a {formula|unit}
    var out = []; if (typeof text !== 'string' || !text || !sys || !F) return out;
    var re = /\{([^{}]{1,300})\}/g, last = 0, m, n = 0, fn = null;
    while (n < LIMITS.captionExprs && (m = re.exec(text))) {
        if (m.index > last) out.push({ text: text.slice(last, m.index) });
        n++; last = re.lastIndex;
        if (!fn) fn = typeof vars === 'function' ? vars : makeResolver(sys, char, F);
        var ce = capExpr(m[1]), res = F.evaluate(ce.expr, { vars: fn, random: noDice });
        if (!res || !res.ok) { out.push({ error: String((res && res.error && res.error.message) || 'error') }); continue; }
        var v = res.value;
        var mag = typeof v === 'number' ? fmtNum(Math.abs(v)) : '';
        var ctx = typeof v === 'number' ? (ce.signed ? (v < 0 && mag !== '0' ? '-' : '+') + mag : fmtNum(v)) : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v).slice(0, 60);
        out.push({ value: v, text: ce.unit && typeof v === 'number' && isFinite(v) ? capWords(ce.unit, v, ctx, ce.signed, metric) : ctx });
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
}
// Every field's value for a render: { fieldId: { value, text, error, max } } (max for resources)
function resolveAll(sys, char, F, tctx, ropts) {   // tctx: tokenCtx(...) = { facing, stance } for the built-in token names (Facing, Arc, Threats, Posture, Elevation); none reads them neutral; ropts.noRows (F5a1): no list cells or totals (the hover card)
    var ro = isObj(tctx) ? { facing: tctx.facing || null, stance: tctx.stance || null, combat: isObj(tctx.combat) ? tctx.combat : null, range: isObj(tctx.range) ? tctx.range : null, cross: isObj(tctx.cross) ? tctx.cross : null } : null;   // 1.6.0: a crossing's CrossStep and Crossed   // range R2: the range to the roller's target too   // HF5b: the combat's round too
    var r = makeResolver(sys, char, F, ro), out = map(), r0 = null;
    var base0 = function(name) { r0 = r0 || makeResolver(sys, char, F, { noFx: true, facing: ro ? ro.facing : null, stance: ro ? ro.stance : null, combat: ro ? ro.combat : null, range: ro ? ro.range : null, cross: ro ? ro.cross : null }); var v = r0(name); return (typeof v === 'number' || typeof v === 'boolean') ? v : undefined; };
    Object.defineProperty(out, 'vars', { value: r });   // Fold B: the warm resolver, for captions (not enumerable: every field loop over the result is unchanged)
    sys.fields.forEach(function(f) {
        var e = { value: undefined, text: '', error: null };
        var k = f.kind;
        if (k === 'text' || k === 'select' || k === 'notes') { e.value = storedOf(f, char); e.text = String(e.value); }
        else if (k === 'item-list') { e.value = storedOf(f, char); e.text = ''; if (!(ropts && ropts.noRows) && f.list && Array.isArray(f.list.cols) && f.list.cols.length) listCells(f, e, r); if (!(ropts && ropts.noRows) && f.list && Array.isArray(f.list.counters) && f.list.counters.length) listCts(f, e, r); if (!(ropts && ropts.noRows) && f.list && Array.isArray(f.list.rolls) && f.list.rolls.some(function(x) { return isObj(x) && x.needs; })) listNeeds(f, e, r); if (!(ropts && ropts.noRows) && f.list && Array.isArray(f.list.rolls) && f.list.rolls.some(function(x) { return isObj(x) && x.showIf; })) listRollShow(f, e, r); if (!(ropts && ropts.noRows) && f.list && [].concat(Array.isArray(f.list.rolls) ? f.list.rolls : [], Array.isArray(f.list.counters) ? f.list.counters : []).some(function(x) { return isObj(x) && Array.isArray(x.alt); })) listAltNames(f, e, r); if (!(ropts && ropts.noRows) && f.list && Array.isArray(f.list.badges) && f.list.badges.length) listBadges(f, e, r); if (!(ropts && ropts.noRows) && f.list && Array.isArray(f.list.rolls) && f.list.rolls.some(function(x) { return isObj(x) && x.show === '@fig'; })) listRollFigs(f, e, r); if (!(ropts && ropts.noRows) && f.list && isObj(f.list.on) && typeof f.list.on.needs === 'string' && f.list.on.needs) listOnNeeds(f, e, r); if (!(ropts && ropts.noRows) && f.list && isObj(f.list.on) && typeof f.list.on.showIf === 'string' && f.list.on.showIf) listOnShow(f, e, r); if (!(ropts && ropts.noRows) && f.list && isObj(f.list.load) && typeof f.list.load.needs === 'string' && f.list.load.needs) listLdNeeds(f, e, r); if (!(ropts && ropts.noRows) && f.list && isObj(f.list.chamber) && typeof f.list.chamber.needs === 'string' && f.list.chamber.needs) listChNeeds(f, e, r); }   // a carried list; sheets.js renders it, not a number. F5a1: its columns' cells and totals
        else if (k === 'effects') { e.value = storedOf(f, char); e.text = ''; e.active = activeEffects(sys, e.value); }   // 5h: the rows; e.active names the ones switched on
        else if (k === 'toggle' || k === 'number') { var tv = r(f.key); e.value = (tv === undefined || (tv && typeof tv === 'object')) ? storedOf(f, char) : tv; e.text = k === 'number' ? figText(f, e.value) : fmtNum(e.value); }   // 5h: through the resolver, so an effect shows; 1.5.4: a number by its decimals and grouping
        else {
            var v = r(f.key);
            if (v && typeof v === 'object' && v.error) { e.error = v.error.message; e.text = '—'; }
            else { e.value = v; e.text = k === 'resource' ? fmtNum(v) : figText(f, v); }   // 1.5.4: a formula and a skill by their decimals and grouping
            if (k === 'resource') { var m = r(f.key + '.max'); if (m && typeof m === 'object' && m.error) { e.max = null; if (!e.error) e.error = m.error.message; } else { e.max = m; e.text = fmtNum(e.value) + ' / ' + fmtNum(m); } }
            if (k === 'skill') { var rk = r(f.key + '.ranks'); e.ranks = rk; }
        }
        var dt = (k === 'number' || k === 'toggle' || k === 'formula' || k === 'skill') ? r.detail(f.key) : null;   // 5h: where the value came from — only when an effect touched it
        if (dt) { var b0 = base0(f.key); e.base = b0 !== undefined ? b0 : dt.base; e.mods = dt.mods; e.via = dt.via; }
        if (k === 'formula' || k === 'resource') { var ur = r.unrounded(k === 'resource' ? f.key + '.max' : f.key); if (ur !== undefined) e[k === 'resource' ? 'maxUnrounded' : 'unrounded'] = ur; }   // clarity package: only where the rounding changed it
        if (k === 'resource') { var dm = r.detail(f.key + '.max'); if (dm) { var bm = base0(f.key + '.max'); e.maxBase = bm !== undefined ? bm : dm.base; e.maxMods = dm.mods; e.maxVia = dm.via; } }
        if (f.labels && !e.error && typeof e.value === 'number' && e.value === Math.floor(e.value) && e.value >= 0 && e.value < f.labels.length && f.labels[e.value]) { e.text = f.labels[e.value]; e.label = true; }   // Stage 6: a named value shows its name (formulas still read the number)
        out[f.id] = e;
    });
    return out;
}
// Stage 6 F5a1: a list's columns for the sheet — e.cells: rowId -> [{ key, value, text, error }] for every row drawn (a kept curse too: the GM
// sees it), e.foot: key -> { value, text, error } for each column with Total and each stat shown on the row (the list's totals: kept curses out)
function colText(c, v) {
    var n = v === true ? 1 : v === false ? 0 : v;   // a yes/no column reads its names as 0 and 1 (low, high)
    if (typeof n === 'number' && Array.isArray(c.labels) && n === Math.floor(n) && n >= 0 && n < c.labels.length && c.labels[n]) return c.labels[n];
    return statNumText(v);
}
// F5a1: a list value as text, as the sheet writes a stat: whole numbers as they are, two decimals from 1 up, three significant digits below 1
// (a total weight of 0.0003 lb, never 0)
function statNumText(v) { if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) === v) return fmtNum(v); return Math.abs(v) >= 1 ? String(Number(v.toFixed(2))) : String(Number(v.toPrecision(3))); }
// 1.5.4 With: a column may name number stats of its list that add to it in a case of their own (a DR of 15 that is 35 against energy).
// Its cell then carries `more`: [{ key, label, text }], one for each named stat that is not 0 on this row, the two added, in the column's
// order. There is none where no named stat has a figure, where the column's own value is no number, and for a column that names none:
// such a cell is key for key what it was
function plusInto(o, f, row, c, v, r) {
    if (typeof v !== 'number' || !fin(v) || !Array.isArray(c.plus) || typeof r.stat !== 'function') return o;
    var more = [], sts = Array.isArray(f.list.stats) ? f.list.stats : [];
    c.plus.forEach(function(k) {
        var s = null; for (var i = 0; i < sts.length && !s; i++) if (isObj(sts[i]) && sts[i].kind !== 'pick' && typeof k === 'string' && lower(sts[i].key) === lower(k)) s = sts[i];
        var sv = s ? r.stat(f, row, s.key) : undefined;
        if (typeof sv === 'number' && fin(sv) && sv !== 0) more.push({ key: s.key, label: s.label || s.key, text: colText(c, v + sv) });   // through the column's own value names, as its own figure is
    });
    if (more.length) o.more = more;
    return o;
}
// What a cell's `more` adds after the column's own figure: " (35 vs. cold, 35 vs. energy)", or nothing. Plain text, for a text node
function plusText(cell) { return isObj(cell) && Array.isArray(cell.more) && cell.more.length ? ' (' + cell.more.map(function(m) { return String(m.text) + ' ' + String(m.label); }).join(', ') + ')' : ''; }
function listCells(f, e, r) {
    var rows = Array.isArray(e.value) ? e.value : [], cells = map(), foot = map();
    rows.forEach(function(row) {
        var id = rowIdOf(row); if (!id) return;
        cells[id] = f.list.cols.map(function(c) { var v = r.cell(f, row, c.key); return v && typeof v === 'object' && v.error ? { key: c.key, error: String(v.error.message || 'error'), text: '\u2014' } : plusInto({ key: c.key, value: v, text: colText(c, v) }, f, row, c, v, r); });
    });
    var tot = function(k) { var v = r(f.key + '.' + k); return v && typeof v === 'object' && v.error ? { error: String(v.error.message || 'error'), text: '\u2014' } : v === undefined ? null : { value: v, text: statNumText(v) }; };
    f.list.cols.forEach(function(c) { if (c.foot === true) { var t = tot(c.key); if (t) foot[c.key] = t; } });
    (Array.isArray(f.list.stats) ? f.list.stats : []).forEach(function(s) { if (s.show === true && !(Array.isArray(s.labels) && s.labels.length)) { var t = tot(s.key); if (t) foot[s.key] = t; } });
    e.cells = cells; e.foot = foot;
    var cfx = map(), anyFx = false;   // 1.6.0 R3: the effects on each cell, for its \u25b2 / \u25bc (e.cfx: rowId -> [{ base, mods, via } or null per column]; only where an effect reached one)
    rows.forEach(function(row) { var id = rowIdOf(row); if (!id || typeof r.cellDetail !== 'function') return; var arr = f.list.cols.map(function(c) { var d = r.cellDetail(f, row, c.key); return d ? { base: d.base, mods: d.mods, via: d.via } : null; }); if (arr.some(Boolean)) { cfx[id] = arr; anyFx = true; } });
    if (anyFx) e.cfx = cfx;
}
// Stage 6 HUD R2b: each row's answer to its list rolls' needs — e.rn: rowId -> [true | false per roll] (a roll that needs nothing: true)
function listLdNeeds(f, e, r) { var ok = map(); (Array.isArray(e.value) ? e.value : []).forEach(function(row) { var id = rowIdOf(row); if (!id) return; try { ok[id] = r.needsOk(f, row, f.list.load.needs); } catch (x) { ok[id] = false; } }); e.ldOk = ok; }   // 1.5.8 Loads only where, by row
function listChNeeds(f, e, r) { var ok = map(); (Array.isArray(e.value) ? e.value : []).forEach(function(row) { var id = rowIdOf(row); if (!id) return; try { ok[id] = r.needsOk(f, row, f.list.chamber.needs); } catch (x) { ok[id] = false; } }); e.chOk = ok; }   // 1.5.9 Chambers only where, by row
// 1.6.0 (the campaign build: a Going without switch only on rows of one kind): where a list's switch is shown, row by row (e.onShow: rowId -> true
// or false), read as its needs are; a formula that cannot be worked out shows it
function listOnShow(f, e, r) { var sh = map(); (Array.isArray(e.value) ? e.value : []).forEach(function(row) { var id = rowIdOf(row); if (!id) return; try { sh[id] = r.needsOk(f, row, f.list.on.showIf) !== false; } catch (x) { sh[id] = true; } }); e.onShow = sh; }
function listOnNeeds(f, e, r) { var ok = map(); (Array.isArray(e.value) ? e.value : []).forEach(function(row) { var id = rowIdOf(row); if (!id) return; try { ok[id] = r.needsOk(f, row, f.list.on.needs); } catch (x) { ok[id] = false; } }); e.onOk = ok; }   // 1.5.8: whether each row's switch may be switched on (its list switch's needs)
// 1.6.0: where each of a list's rolls and actions is shown, row by row (e.rs: rowId -> [true | false per roll]; one with no Shown where, or whose
// formula cannot be worked out, true)
// 1.6.0: each row's other names (e.rl: rowId -> { r: a roll's or action's name or '' each, in list order }), and a counter's on its cell in
// e.cts (label); a name only where its formula holds on that row, the first that holds
function listAltNames(f, e, r) {
    var rl = map(), pick = function(x, row) { if (!(isObj(x) && Array.isArray(x.alt))) return ''; for (var i = 0; i < x.alt.length; i++) { var ok = false; try { ok = r.needsOk(f, row, x.alt[i].if) === true; } catch (y) { ok = false; } if (ok) return x.alt[i].label; } return ''; };
    (Array.isArray(e.value) ? e.value : []).forEach(function(row) { var id = rowIdOf(row); if (!id) return; rl[id] = { r: (Array.isArray(f.list.rolls) ? f.list.rolls : []).map(function(x) { return pick(x, row); }) };
        if (e.cts && Array.isArray(e.cts[id]) && Array.isArray(f.list.counters)) f.list.counters.forEach(function(t) { var nm = pick(t, row); if (!nm) return; e.cts[id].forEach(function(cl) { if (isObj(cl) && cl.key === t.key) cl.label = nm; }); }); });
    e.rl = rl;
}
// 1.6.0 R4: the badges that hold on each row (e.bd: rowId -> [their places in the list's badges, in order]); one whose formula cannot be worked out
// does not show
function listBadges(f, e, r) { var bd = map(); (Array.isArray(e.value) ? e.value : []).forEach(function(row) { var id = rowIdOf(row); if (!id) return; var on = []; f.list.badges.forEach(function(b, i) { var ok = false; try { ok = isObj(b) && r.needsOk(f, row, b.if, false, true) === true; } catch (y) { ok = false; } if (ok) on.push(i); }); bd[id] = on; }); e.bd = bd; }
// 1.6.0 R7: the figure each roll that shows its own gives on each row (e.rf: rowId -> [text or '' per roll, in list order])
function listRollFigs(f, e, r) { var rf = map(); (Array.isArray(e.value) ? e.value : []).forEach(function(row) { var id = rowIdOf(row); if (!id) return; rf[id] = f.list.rolls.map(function(x) { if (!(isObj(x) && x.show === '@fig' && typeof x.formula === 'string')) return ''; try { return r.rollFig(f, row, x.formula); } catch (y) { return ''; } }); }); e.rf = rf; }
function listRollShow(f, e, r) { var rs = map(); (Array.isArray(e.value) ? e.value : []).forEach(function(row) { var id = rowIdOf(row); if (!id) return; rs[id] = f.list.rolls.map(function(x) { if (!(isObj(x) && typeof x.showIf === 'string' && x.showIf)) return true; try { return r.needsOk(f, row, x.showIf) !== false; } catch (y) { return true; } }); }); e.rs = rs; }
function listNeeds(f, e, r) { var rn = map(); (Array.isArray(e.value) ? e.value : []).forEach(function(row) { var id = rowIdOf(row); if (!id) return; rn[id] = f.list.rolls.map(function(x) { return !(isObj(x) && x.needs) || r.needsOk(f, row, x.needs, x.to === 'near'); }); }); e.rn = rn; }   // 1.5.9: one that Applies to an adjacent character reads OnSelf as 1 there, as it would on its user
// Stage 6 HUD R2: a list's counters for the sheet — e.cts: rowId -> [{ key, label, value, max }] (max: the row's own most worked out, else null)
function listCts(f, e, r) {
    var cts = map();
    (Array.isArray(e.value) ? e.value : []).forEach(function(row) { var id = rowIdOf(row); if (!id) return; cts[id] = f.list.counters.map(function(t) { var o = { key: t.key, label: t.label || t.key, value: rowCt(row, t), max: r.ctMax(f, row, t.key) }; if (isObj(t.timer)) { o.tm = t.timer.dir; if (t.timer.end && o.value <= 0) o.word = t.timer.end; } return o; }); });   // 1.6.0: a timed counter says so, and its end word at 0
    e.cts = cts;
}
// 5h: the rows of an effects list that are switched on, as { name, icon, tone } (a library row by its definition; a missing one is skipped)
function activeEffects(sys, rows) {
    var out = [], lib = null; if (!Array.isArray(rows)) return out;
    rows.forEach(function(r) {
        if (!isObj(r) || r.on === false) return;
        var d = r;
        if (typeof r.ref === 'string') { if (!lib) { lib = map(); (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(x) { if (x && typeof x.id === 'string') lib[x.id] = x; }); } d = lib[r.ref]; if (!d) return; }
        out.push({ name: d.name || 'Effect', icon: d.icon || '', tone: d.tone || '' });
    });
    return out;
}
// Conditions C1 (owner 2026-09-30, the reference VTT's model; docs/CONDITIONS_PLAN.md): the effects a character's token shows on the map — each
// switched-on row of its effects lists, in list order, as { n: name, i: icon, t: tone }, a library row by its definition (a missing one
// skipped). For the table (gm false) never a GM-only effect; for the GM (gm true) every one, a GM-only one marked g: 1. At most 8
function fxLibOf(sys) { var lib = map(); (isObj(sys) && Array.isArray(sys.effects) ? sys.effects : []).forEach(function(x) { if (isObj(x) && typeof x.id === 'string') lib[x.id] = x; }); return lib; }
function fxRowOut(lib, r, gm, out) {
    if (out.length >= 8 || !isObj(r) || r.on === false) return;
    var d = r, g = false;
    if (typeof r.ref === 'string') { d = lib[r.ref]; if (!isObj(d)) return; g = d.vis === 'gm'; if (g && gm !== true) return; }
    var e = { n: str(d.name, LIMITS.name).replace(CTRL_RE_G, ' ').trim() || 'Effect', i: cleanIcon(d.icon), t: d.tone === 'buff' || d.tone === 'debuff' ? d.tone : '' };
    if (g) e.g = 1;
    out.push(e);
}
function tokenEffects(sys, char, gm, F) {   // conditions C4: F (the formula engine) — the automatic effects on, after the rows (none without it)
    var out = []; if (!isObj(sys) || !Array.isArray(sys.fields) || !isObj(char) || !isObj(char.values)) return out;
    var lib = fxLibOf(sys), listed = map();
    sys.fields.forEach(function(f) {
        if (!isObj(f) || f.kind !== 'effects' || typeof f.id !== 'string') return;
        var rows = Object.prototype.hasOwnProperty.call(char.values, f.id) ? char.values[f.id] : null; if (!Array.isArray(rows)) return;
        rows.forEach(function(r) { fxRowOut(lib, r, gm, out); if (isObj(r) && r.on !== false && typeof r.ref === 'string') listed[r.ref] = 1; });
    });
    if (F) autoEffectsOn(sys, char, F).forEach(function(d) { if (listed[d.id]) return; listed[d.id] = 1; fxRowOut(lib, { ref: d.id }, gm, out); });
    return out;
}
// 1.5.9 (docs/BOOK_ES_ET_PLAN.md; the owner's O6: "An effect can set posture"): the effects on a character that set its token's posture, by
// their id: { p: the posture's id, back: true where it is put back when the effect ends } — the rows switched on of a library effect and the
// automatic effects on, as tokenEffects reads them. An empty map where none sets one, so a system with no such effect costs nothing
function postureFx(sys, char, F) {
    var out = map(); if (!isObj(sys) || !Array.isArray(sys.effects) || !Array.isArray(sys.fields) || !isObj(char) || !isObj(char.values)) return out;
    var has = function(d) { return isObj(d) && typeof d.posture === 'string' && d.posture !== '' && typeof d.id === 'string'; }; if (!sys.effects.some(has)) return out;
    var lib = fxLibOf(sys), put = function(d) { out[d.id] = { p: d.posture, back: d.postureBack === true }; if (Array.isArray(d.postureKeep) && d.postureKeep.length) out[d.id].keep = d.postureKeep.slice(); };   // keep (1.6.0): the postures it leaves a token in
    sys.fields.forEach(function(f) {
        if (!isObj(f) || f.kind !== 'effects' || typeof f.id !== 'string' || !Object.prototype.hasOwnProperty.call(char.values, f.id) || !Array.isArray(char.values[f.id])) return;
        char.values[f.id].forEach(function(r) { if (isObj(r) && r.on !== false && typeof r.ref === 'string' && has(lib[r.ref])) put(lib[r.ref]); });
    });
    if (F) autoEffectsOn(sys, char, F).forEach(function(d) { if (has(d)) put(d); });
    return out;
}
// Conditions C4 (docs/CONDITIONS_PLAN.md): the library effects that apply themselves to a character — each whose own formula (auto) gives true
// or a number other than 0, in library order. Worked out from the character's own values on a first pass that holds the hand-applied effects
// and item mods but no automatic effect (so none reads its own changes or another's) and no token (its names read 0 there, as the reference
// sheet works these out from the character alone): the sheet, the token, the wire and a roll agree. A formula that fails or gives anything
// else: off. Only a visible effect carries a formula, and never one reading a GM-only value (cleanSystem: the owner's "Only public ones")
function autoEffectsOn(sys, char, F, first) {   // first (1.5.5): an object handed in gets the first pass's resolver as r (makeResolver's ropts.reuse)
    var out = []; if (!isObj(sys) || !Array.isArray(sys.effects) || !Array.isArray(sys.fields) || !isObj(char) || !F || typeof F.evaluate !== 'function') return out;
    var list = sys.effects.filter(function(d) { return isObj(d) && typeof d.id === 'string' && typeof d.auto === 'string' && d.auto && d.vis !== 'gm'; }); if (!list.length) return out;
    var r1 = makeResolver(sys, char, F, { noAuto: true }); if (isObj(first)) first.r = r1;
    list.forEach(function(d) { var res = null; try { res = F.evaluate(d.auto, { vars: r1, random: noDice }); } catch (e) { res = null; } if (res && res.ok && (res.value === true || (typeof res.value === 'number' && isFinite(res.value) && res.value !== 0))) out.push(d); });
    return out;
}
// Conditions C2: the effects a token with no character sheet shows — its own rows (item.fx) read as a character's are: a library effect by its
// definition (never a GM-only one for the table, marked for the GM), one made on the spot as written; at most 8
function tokenOwnEffects(sys, rows, gm) {
    var out = []; if (!Array.isArray(rows)) return out;
    var lib = fxLibOf(sys); rows.forEach(function(r) { fxRowOut(lib, r, gm, out); });
    return out;
}
// 5h: a value's breakdown as plain text — "12 = 10 base · Rage +2", and on a derived value "· Rage +2 on ST"
function fxText(e, max) {
    var base = max ? e.maxBase : e.base, mods = (max ? e.maxMods : e.mods) || [], via = (max ? e.maxVia : e.via) || [];
    if (!mods.length && !via.length) return '';
    var amt = function(m) { return m.op === 'max' ? 'at least ' + fmtNum(m.v) : m.op === 'min' ? 'at most ' + fmtNum(m.v) : (m.v >= 0 ? '+' : '\u2212') + fmtNum(Math.abs(m.v)); };   // 1.6.0: a floor and a ceiling said as such
    var parts = [];
    if (typeof base === 'number') parts.push(fmtNum(base) + ' base');   // the value with no effect at all, so the parts add up to what is shown
    mods.forEach(function(m) { parts.push(m.op === 'on' ? m.name + ' (on)' : m.name + ' ' + amt(m)); });
    via.forEach(function(m) { parts.push(m.op === 'on' ? m.name + ' (' + m.through + ' on)' : m.name + ' ' + amt(m) + ' on ' + m.through); });
    return parts.slice(0, 13).join(' \u00b7 ');
}
function fmtNum(v) { if (typeof v === 'boolean') return v ? 'yes' : 'no'; if (typeof v !== 'number' || !isFinite(v)) return v === null || v === undefined ? '' : String(v); if (Math.floor(v) === v) return String(v); return String(Number(v.toFixed(2))); }
// Stage 5d: one read-only header-block entry (an identity row or a ledger figure) for a field: what the sheet prints for it, or null
// to leave it out. A toggle shows as a chip only while on; an error prints '—' with the message as a title (as the field itself does
// below); a negative number marks itself so the figure can read red. Stage 5g: an empty text/select keeps its place as a dash (a row
// that vanished read as a missing field), the field's unit follows the value, and a field coloured by sign marks a positive too.
function headerEntry(f, e, metric) {   // metric (1.5.4): the viewer's Measurement system, true for Metric and false for Imperial; absent, the field as stored (an export)
    if (!f || !e) return null;
    if (f.kind === 'toggle') return e.value === true ? { chip: true, text: f.label } : null;
    if (e.error) return { text: '\u2014', error: String(e.error) };
    if (e.text === undefined || e.text === null || e.text === '') return { text: '\u2014', empty: true };
    var numeric = (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill') && typeof e.value === 'number' && !e.label;   // a named value is a word, never red or green
    var ht = f.kind === 'text' && !!cleanFieldUnit(f.unit, 'text');   // 1.5.4: a height or a weight, by the half of the viewer's setting (with none told, as stored)
    var out = { text: ht ? (metric === true || metric === false ? textWords(f, String(e.text), metric) : e.text) : f.unit && !e.label ? (f.kind === 'resource' ? e.text + ' ' + f.unit + unitTail(f, e.value, e.text, metric, e.max, typeof e.max === 'number' ? fmtNum(e.max) : '') : unitWords(f, e.value, e.text, metric)) : e.text };   // Stage 6: a named value is a word (no unit); 1.5.4: a measure in metric too under Metric, in the field's own form
    if (numeric && e.value < 0) out.neg = true; else if (numeric && f.sign && e.value > 0) out.pos = true;
    var why = fxText(e) || (f.kind === 'resource' ? fxText(e, true) : ''); if (why) out.why = why;   // 5h: where the number came from
    return out;
}
// "HP 7 / 14 · Prone" — the hover card and the party strip; a field that errors here is skipped, never printed as an error
// names (secrets R2): the recipient's own projected rows by field id — a teammate's copy, which holds no GM-only effect — so the Effects line
// names only what they may see while the numbers stay the character's; absent, the character's own rows (the GM's and the owner's own cards)
function hoverLines(sys, char, F, tctx, names) {
    var all = resolveAll(sys, char, F, tctx, { noRows: true }), lines = [], theirs = names && typeof names === 'object' ? names : null;   // F5a1: no list cells (critic 17)
    sys.fields.forEach(function(f) {
        if (!f.hover) return;
        var e = all[f.id]; if (!e || e.error) return;
        if (f.kind === 'toggle') { if (e.value === true) lines.push(f.label); return; }
        if (f.kind === 'notes') return;
        if (f.kind === 'effects') { var act = theirs ? activeEffects(sys, theirs[f.id]) : e.active; if (act && act.length) lines.push(f.label + ' ' + act.map(function(a) { return a.name; }).join(', ')); return; }   // 5h
        if (e.text) lines.push(f.label + ' ' + e.text);
    });
    return lines;
}

/* ---------- the validator behind the editor ---------- */
function validateSystem(sys, F) {
    var errors = [], warnings = [], badgeNow = false;   // 193: Row.needsMet is known in a badge's Shown where alone
    if (!sys || !F) return { ok: false, errors: [{ message: 'No system.' }], warnings: warnings };
    var keys = sys.fields.map(function(f) { return f.key; }), lowerKeys = keys.map(lower), ix = keyIndex(sys);
    var known = map(); sys.fields.forEach(function(f) { known[lower(f.key)] = f; if (f.kind === 'resource') { known[lower(f.key) + '.max'] = f; known[lower(f.key) + '.cur'] = f; known[lower(f.key) + '.full'] = f; } if (f.kind === 'skill') { known[lower(f.key) + '.ranks'] = f; known[lower(f.key) + '.base'] = f; } if (f.kind === 'number') known[lower(f.key) + '.base'] = f; });   // 5h: "ST.base" is the stored number, before effects (a points cost reads it)
    if (!ix.making && !known.making) known.making = { id: '', key: 'Making', kind: 'number', vis: 'all' };   // 1.6.0: a character in the making
    DATE_NAMES.forEach(function(n) { var l = lower(n); if (!ix.date && !known[l]) known[l] = { id: '', key: n, kind: 'number', vis: 'all' }; });   // 1.6.0: the date
    TOKEN_NAMES.forEach(function(n) { var l = lower(n), fam = l.split('.')[0]; if (!ix[fam] && !known[l]) known[l] = { id: '', key: n, kind: fam === 'arc' && l !== 'arc' ? 'toggle' : 'number', vis: 'all' }; });   // 5h Fold 3: the facing names (a field named Facing, Arc or Threats keeps the family)
    var edges = map(), gmP = gmPools(sys, F);   // a pool whose max is GM-only: players see none of it
    var crits = isObj(sys.combat) && (sys.combat.checks === 'under3d6' || sys.combat.checks === 'fixed'), fixedC = crits && sys.combat.checks === 'fixed';   // 1.5.8: whether the system's Roll outcomes give criticals (1.6.0: or criticals at fixed rolls)
    function noRangeSays() { return 'Roll outcomes on the Combat card is not Criticals at fixed rolls, so this roll\u2019s critical range is never read.'; }
    function noCritSays(w) { return 'This system\u2019s rolls have no criticals (Roll outcomes on the Combat card), so ' + THEN_WHEN[w] + ' never happens.'; }
    // Stage 6 F5a1: the names a carried list offers — totals (L.count|qty|paid|<stat>|<col>), L.on.<same>, an addressed row (L.<Key>.lvl|qty|on|has|
    // paid|<stat>|<col>) — and a row's own inside its list's columns (Row.<word>): a target like a field's (key: the loop graph's node, a column's
    // own; noEdge: nothing worked out behind it), or null. A Row.* name outside a list's columns reads { rowOutside }
    var lsts = map(), gmKsV = gmEntryKeys(sys, sys.fields); sys.fields.forEach(function(f) { if (f.kind === 'item-list') lsts[lower(f.key)] = f; });
    function listWords(lf) { var w = map(), sp = isObj(lf.list) ? lf.list : {}; (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') w[lower(x.key)] = x.kind === 'pick' ? 'pick' : 'stat'; }); (Array.isArray(sp.cols) ? sp.cols : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') w[lower(x.key)] = 'col'; }); (Array.isArray(sp.counters) ? sp.counters : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string' && !w[lower(x.key)]) w[lower(x.key)] = 'ctr'; }); return w; }   // R2: counters
    function wordTarget(lf, word, total) {
        var w = listWords(lf), node = 'l#' + lower(lf.key);
        if (w[word] === 'col') return { id: '', key: node + '.' + word, kind: 'number', vis: lf.vis, list: lf };
        if (w[word] === 'ctr') return total ? { ctrTotal: true, list: lf } : { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // Stage 6 HUD R2: a counter is one row's; it has no total
        if (w[word] === 'pick') return total ? { pickTotal: true, list: lf } : { id: '', key: node + '.' + word, kind: 'number', vis: lf.vis, list: lf };   // F5a2: a choice reads its option's value; it has no total; a node of the loop graph (owed review F5a2#5)
        if (w[word] === 'stat' || word === 'qty' || word === 'paid' || (total ? word === 'count' : word === 'lvl')) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };
        if (!total && (word === 'on' || word === 'has')) return { id: '', key: node, kind: 'toggle', vis: lf.vis, list: lf, noEdge: true };
        if (!total && (word === 'opened' || word === 'loaded' || word === 'loadmax')) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.5.8: Row.opened; Row.loaded and Row.loadmax (Loads from)
        if (!total && word === 'granted') return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0 (v2, B4): Row.granted
        if (!total && word === 'made' && !listKeyed(lf.list, 'made')) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0 (v2, B5): Row.made
        if (!total && word === 'startlvl' && !listKeyed(lf.list, 'startlvl') && isObj(lf.list) && isObj(lf.list.lvl)) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0: Row.startlvl, on a list with a level
        if (!total && word === 'again') return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 193: Row.again
        if (!total && word === 'needsmet' && badgeNow) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // ... and Row.needsMet, in a badge alone
        if (!total && word === 'parts' && isObj(lf.list) && isObj(lf.list.parts)) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0 R14: Row.parts
        if (!total && word === 'setall' && isObj(lf.list) && typeof lf.list.sets === 'string') return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0 R15 Sets by: Row.setall
        if (!total && word === 'chambered' && isObj(lf.list) && isObj(lf.list.chamber)) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.5.9 Chambers from: Row.chambered
        if (!total && (word === 'once' || word === 'oncefree')) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.5.8 Counted once
        if (!total && word === 'oncecost') { var ocK = isObj(lf.list) && isObj(lf.list.once) && typeof lf.list.once.cost === 'string' ? lower(lf.list.once.cost) : ''; return ocK && w[ocK] === 'col' ? { id: '', key: node + '.' + ocK, kind: 'number', vis: lf.vis, list: lf } : { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true }; }
        return null;
    }
    function extTarget(lf, word) {   // 1.5.4: what L.max.<w> and L.min.<w> read — a number stat or a column, as its total does (a column a node of the loop graph), and a counter (1.6.0) as one row's; a choice and a row word have none
        var w = listWords(lf)[word];
        if (w === 'stat' || w === 'col') return wordTarget(lf, word, true);
        if (w === 'pick') return { pickTotal: true, ext: true, list: lf };
        if (w === 'ctr') return wordTarget(lf, word, false);   // 1.6.0: a counter's highest and lowest, read as one row's count is
        if (word === 'count' || word === 'qty' || word === 'paid' || word === 'lvl' || word === 'on' || word === 'has') return { extWord: true, list: lf };
        return null;
    }
    function listTarget(n, rowList) {
        var sg = lower(n).split('.');
        if (sg[0] === 'row' && sg.length === 2 && !ix.row) return rowList ? wordTarget(rowList, sg[1], false) : { rowOutside: true };
        if (sg[0] === 'row' && sg.length === 3 && sg[1] === 'parts' && !ix.row) {   // 1.6.0 R14: Row.parts.<w>, a number stat or a column of the parts' list, on a list that takes parts
            if (!rowList) return { rowOutside: true };
            var ptV = isObj(rowList.list) && isObj(rowList.list.parts) ? partsSrc(sys, rowList.list) : null; if (!ptV) return null;
            var pwV = listWords(ptV)[sg[2]]; return pwV === 'stat' || pwV === 'col' ? { id: '', key: 'l#' + lower(ptV.key), kind: 'number', vis: ptV.vis, noEdge: true } : null;
        }
        if (sg[0] === 'row' && sg.length === 3 && (sg[1] === 'round' || sg[1] === 'fired') && !ix.row) {   // 1.5.9 Chambers from: Row.round.<w>, Row.fired.<w> — a stat or a column of the chamber's list, on a list with a chamber
            if (!rowList) return { rowOutside: true };
            var chV = isObj(rowList.list) && isObj(rowList.list.chamber) ? chamberSrc(sys, rowList.list) : null; if (!chV) return { noChamber: true, list: rowList };
            var cwV = listWords(chV)[sg[2]]; return cwV === 'stat' || cwV === 'col' || cwV === 'pick' ? { id: '', key: 'l#' + lower(chV.key), kind: 'number', vis: chV.vis, noEdge: true } : null;
        }
        var lf = lsts[sg[0]]; if (!lf || sg.length < 2 || sg.length > 4) return null;
        if (sg.length === 2) return wordTarget(lf, sg[1], true);
        var on4 = sg.length === 4 && sg[1] === 'on', ex = on4 ? sg[2] : sg[1];   // 1.5.4: L.max.<w>, L.min.<w>, L.on.max.<w>, L.on.min.<w> (the resolver's listName)
        if (ex === 'max' || ex === 'min') { if (sg.length !== (on4 ? 4 : 3)) return null; var te = extTarget(lf, sg[sg.length - 1]); if (te && on4) te.onTotal = true; return te; }
        if (sg.length === 4) return null;
        if (sg[1] === 'on') { var to = wordTarget(lf, sg[2], true); if (to) to.onTotal = true; return to; }
        var ta = wordTarget(lf, sg[2], false); if (!ta) return null;
        ta.addr = sg[1]; if (gmKsV[lower(lf.key)] && gmKsV[lower(lf.key)][sg[1]] === 1) ta.gmKey = true;
        return ta;
    }
    function listT(n) { var t = listTarget(n, null); return t && !t.rowOutside ? t : linkT(n); }   // captions and labels: never inside a column (1.6.0: a linked sheet's names too)
    var lnkV = linkByKey(sys);   // 1.6.0: <Key>.<name> reads the system's own name on the sheet a link holds, and <Key>.has; never an edge of the loop graph, since it is another character
    function linkT(n) { var l = lower(n), d = l.indexOf('.'), k = d > 0 ? l.slice(0, d) : ''; if (!k || !lnkV[k] || ix[k]) return null; var w = l.slice(d + 1); if (w === 'has' && !ix.has) return { id: '', key: n, kind: 'number', vis: 'all', noEdge: true }; var t = known[w] || listTarget(w, null); return t && !t.rowOutside ? Object.assign({}, t, { noEdge: true }) : null; }
    function isRollProp(p) { return p === 'roll' || p === 'rollFormula' || (typeof p === 'string' && p.indexOf('list.roll.') === 0); }   // F5b: a list's roll is a roll
    function rolledWarn(id, prop, c) { if (!isObj(c) || c.roll !== true || typeof c.formula !== 'string' || !c.formula) return; var rp = F.parse(c.formula); if (rp.ok && !hasDice(rp.ast.body)) warnings.push({ id: id, prop: prop, message: 'Rolled, but this amount rolls no dice, so nothing is rolled.' }); }   // 1.5.9 (book es/et plan, section 0)
    var resistV = false;   // 1.6.0 (B2): the roll being read Resists an attempt, so AttemptMargin is known in it
    var crossV = false;   // 1.6.0: the entry being read runs When a value crosses, so CrossStep and Crossed are known in it (never in its own steps)
    var nearV = false;   // 1.5.9 (book es/et plan, section 3): the entry being read Applies to an adjacent character, so OnSelf is known in it
    function isApplyProp(p) { return typeof p === 'string' && (p.indexOf('apply.') === 0 || p.indexOf('list.apply.') === 0 || p.indexOf('then.') === 0 || p.indexOf('list.then.') === 0); }   // R2b: a list roll's consequence too   // R1: a roll's consequence too   // Stage 6 HUD H7: an apply action's amount (no dice, no loop edge: nothing reads an action)
    function checkFormula(owner, prop, text, allowDice, vis, rowList) {   // rowList (F5a1): the list whose column this is (Row.* is known there)
        if (text === null) return;
        if (!text) { errors.push({ id: owner.id, prop: prop, message: 'Missing formula', pos: 0, len: 0 }); return; }
        var p = F.parse(text);
        if (!p.ok) { errors.push({ id: owner.id, prop: prop, message: p.error.message, pos: p.error.pos, len: p.error.len }); return; }
        if (!allowDice && hasDice(p.ast.body)) { errors.push({ id: owner.id, prop: prop, message: isApplyProp(prop) ? 'An amount cannot roll dice: roll first, and let the amount read the field the result goes in.' : 'Dice are not allowed in a definition; put the dice in a roll.', pos: 0, len: text.length }); }
        p.names.forEach(function(n) {
            var l = lower(n), target = known[l];
            if (!target && l === 'rollcrit' && /(^|\.)then\./.test(prop)) target = { id: '', key: 'RollCrit', kind: 'number', vis: 'all', noEdge: true };   // 1.5.8: a roll's consequence reads its critical
            if (!target && l === 'rollmargin' && /(^|\.)then\./.test(prop)) target = { id: '', key: 'RollMargin', kind: 'number', vis: 'all', noEdge: true };   // 1.5.8: and how far it beat its target
            if (!target && l === 'rollbig' && /(^|\.)then\./.test(prop)) target = { id: '', key: 'RollBig', kind: 'number', vis: 'all', noEdge: true };   // 1.6.0: and whether it lands as a Big Hit
            if (!target && l === 'onself' && nearV) target = { id: '', key: 'OnSelf', kind: 'number', vis: 'all', noEdge: true };   // 1.5.9: a roll or an action that Applies to an adjacent character reads whom it is used on
            if (!target && l === 'attemptmargin') { if (!resistV) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in a roll ticked Resists an attempt.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'AttemptMargin', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.0 (B2)
            if (!target && (l === 'crossstep' || l === 'crossed')) { if (!crossV || /(^|\.)cross\./.test(prop)) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in a roll or an action that runs When a value crosses.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: l === 'crossstep' ? 'CrossStep' : 'Crossed', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.0
            if (!target && l === 'onself') { errors.push({ id: owner.id, prop: prop, message: '"OnSelf" is known only in a roll or an action that Applies to the user or an adjacent character.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (!target && l.length > 3 && l.indexOf('on.') === 0) { if (!nearV) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" reads the one it is used on, so it is known only in a roll or an action that Applies to the user or an adjacent character.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = known[l.slice(3)] || null; }   // 1.6.0: On.<name>, the one it is used on
            if (!target) { var lt = listTarget(n, rowList); if (lt && lt.rowOutside) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" names a row, so it is known only in a list\u2019s own columns.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = lt; } if (!target) target = linkT(n);   // F5a1; 1.6.0: a linked sheet's name
            if (target && target.noChamber) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" reads a chambered round, but ' + (target.list.label || target.list.key) + ' has no Chambers from.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // 1.5.9
            if (target && target.ctrTotal) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is a counter, so it has no ' + (target.ext ? 'highest or lowest' : 'total') + ': read one row (' + target.list.key + '.<key>.' + n.split('.').pop() + ').', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // R2
            if (target && target.pickTotal) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is a choice, so it has no ' + (target.ext ? 'highest or lowest' : 'total') + ': read one row (' + target.list.key + '.<key>.' + n.split('.').pop() + ').', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // F5a2
            if (target && target.extWord) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": the highest and the lowest read a number stat, a column or a counter of ' + (target.list.label || target.list.key) + ', not ' + n.split('.').pop() + '.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // 1.5.4
            if (isRollProp(prop) && n.length > 64) { errors.push({ id: owner.id, prop: prop, message: 'A roll carries names of 64 characters at most: "' + n + '" has ' + n.length + '.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // F5a1 (critic 8): the dice path refuses a longer one
            if (!target) { var s = suggest(n, keys); errors.push({ id: owner.id, prop: prop, message: 'Unknown name "' + n + '"' + (s ? ' — did you mean "' + s + '"?' : ''), pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (!NUMERIC[target.kind]) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is ' + (target.kind === 'notes' ? 'a notes field' : (target.kind === 'effects' || target.kind === 'item-list') ? 'a list' : 'text') + ', not a number.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (target.list) {   // F5a1: what a list name reads
                if (target.onTotal && !(isObj(target.list.list) && isObj(target.list.list.on))) warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" counts rows switched on, but ' + (target.list.label || target.list.key) + ' has no switch, so it reads as none.' });
                if (target.addr) { var tc = isObj(target.list.list) && Array.isArray(target.list.list.cats) && target.list.list.cats.length ? target.list.list.cats : null, has = (Array.isArray(sys.items) ? sys.items : []).concat(Array.isArray(sys.core) ? sys.core : []).some(function(it) { return isObj(it) && typeof it.key === 'string' && lower(it.key) === target.addr && (!tc || catIn(tc, it.category)); }); if (!has) warnings.push({ id: owner.id, prop: prop, message: 'No item in ' + (target.list.label || target.list.key) + ' has the key "' + n.split('.')[1] + '": it reads as not carried until a row its player can see has it.' }); }
                if (vis === 'all' && target.gmKey && gmP[owner.id] !== 1) warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" names a GM-only item: ' + (isApplyProp(prop) ? (/(^|\.)then\./.test(prop) ? 'players\u2019 rolls will not apply it.' : 'players will not get this action.') : prop === 'spill' ? 'their own apps do not show the spill, and the host still makes it.' : prop === 'needs' ? 'players are not held back by it.' : prop.indexOf('list.needs.') === 0 ? 'players\u2019 rolls are not held back by it.' : prop === 'turn.move' ? 'players\u2019 moves are not limited by it.' : (prop === 'malf' || prop.indexOf('list.malf.') === 0) ? 'players\u2019 rolls never malfunction by it.' : (prop === 'critAt' || prop === 'fumbleAt' || prop.indexOf('list.critAt.') === 0 || prop.indexOf('list.fumbleAt.') === 0) ? 'players\u2019 rolls read the usual critical range instead.' : (prop === 'bigAt' || prop.indexOf('list.bigAt.') === 0) ? 'players\u2019 rolls never land as a Big Hit by it.' : prop.indexOf('list.roll.') === 0 ? 'players will not get this roll.' : 'players will see an error for this ' + (prop === 'roll' || prop === 'rollFormula' ? 'roll' : 'field') + '.') });
            }
            if (vis === 'all' && (target.vis === 'gm' || gmP[target.id] === 1) && gmP[owner.id] !== 1) warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" is GM only: ' + (isApplyProp(prop) ? (/(^|\.)then\./.test(prop) ? 'players\u2019 rolls will not apply it.' : 'players will not get this action.') : prop === 'spill' ? 'their own apps do not show the spill, and the host still makes it.' : prop === 'needs' ? 'players are not held back by it.' : prop.indexOf('list.needs.') === 0 ? 'players\u2019 rolls are not held back by it.' : prop === 'turn.move' ? 'players\u2019 moves are not limited by it.' : (prop === 'malf' || prop.indexOf('list.malf.') === 0) ? 'players\u2019 rolls never malfunction by it.' : (prop === 'critAt' || prop === 'fumbleAt' || prop.indexOf('list.critAt.') === 0 || prop.indexOf('list.fumbleAt.') === 0) ? 'players\u2019 rolls read the usual critical range instead.' : (prop === 'bigAt' || prop.indexOf('list.bigAt.') === 0) ? 'players\u2019 rolls never land as a Big Hit by it.' : prop.indexOf('list.roll.') === 0 ? 'players will not get this roll.' : 'players will see an error for this ' + (prop === 'roll' || prop === 'rollFormula' ? 'roll' : 'field') + '.') });
            if (!isRollProp(prop) && !isApplyProp(prop) && prop !== 'spill' && !target.noEdge) { var from = lower(owner.key); (edges[from] = edges[from] || []).push(lower(target.key)); }
        });
    }
    sys.fields.forEach(function(f) {
        var p = DEF_PROP[f.kind];
        if (f.kind === 'item-list' && typeof f.key === 'string' && f.key.indexOf('.') >= 0) errors.push({ id: f.id, prop: 'key', message: 'An item list\u2019s key cannot contain a dot: formulas read it as ' + f.key.split('.')[0] + '.<name>, so its totals and rows have no names.' });   // owed review F5a1#6
        if (gmP[f.id] === 1) warnings.push({ id: f.id, prop: 'maxFormula', message: 'The max reads a GM-only value, so this pool is GM only: players will not see it.' });
        if (p && !(p === 'base' && f.base === '')) checkFormula(f, p, f[p], false, f.vis);   // a skill with no base is ranks alone
        if (f.kind === 'resource' && isObj(f.spill) && f.spill.at === 'f' && typeof f.spill.below === 'string' && f.spill.below) checkFormula(f, 'spill', f.spill.below, false, f.vis);   // 1.6.0 Spills into: below a formula
        if (f.roll) checkFormula(f, 'roll', f.roll, true, f.vis);
        if (f.caption) {   // Fold B: each {formula} in the caption, as warnings
            var cre = /\{([^{}]{1,300})\}/g, cm, cn = 0;
            while ((cm = cre.exec(f.caption))) {
                var drawn = ++cn <= LIMITS.captionExprs, cp = F.parse(capExpr(cm[1]).expr);
                if (!cp.ok) { if (drawn) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: ' + cp.error.message }); continue; }
                if (drawn && hasDice(cp.ast.body)) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: dice are not worked out in a caption; put them in a roll.' });
                cp.names.forEach(function(nm) {
                    var tg = known[lower(nm)] || listT(nm);   // F5a1: a list's names too
                    if (!tg) { if (drawn) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: unknown name "' + nm + '".' }); }
                    else if (!NUMERIC[tg.kind]) { if (drawn) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: "' + nm + '" is not a number.' }); }
                    else if (f.vis === 'all' && (tg.vis === 'gm' || gmP[tg.id] === 1) && gmP[f.id] !== 1) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: "' + nm + '" is GM only, so players will not see this caption.' });
                });
            }
            if (cn > LIMITS.captionExprs) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: only the first ' + LIMITS.captionExprs + ' {\u2026} values are worked out; the rest show as written.' });   // Stage 6
        }
    });
    // 1.6.0: what the editor says of a change that switches an effect, and of one that sets its row's quantity or one of its stats
    var fxSays = function(id, prop, c, vis) {
        var d = null; (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(x) { if (!d && isObj(x) && x.id === c.fx) d = x; });
        if (!d) { errors.push({ id: id, prop: prop, message: 'Pick the effect this switches: that one is gone.' }); return; }
        if (!sys.fields.some(function(x) { return isObj(x) && x.kind === 'effects'; })) errors.push({ id: id, prop: prop, message: 'The sheet has no status effects list, so "' + (d.name || d.id) + '" cannot go on.' });
        else if (vis === 'all' && d.vis === 'gm') warnings.push({ id: id, prop: prop, message: '"' + (d.name || d.id) + '" is GM only: players will not get this.' });
    };
    var rowSays = function(lf, prop, c) {
        if (typeof c.s === 'string' && !(isObj(lf.list) && Array.isArray(lf.list.stats) ? lf.list.stats : []).some(function(t) { return isObj(t) && t.kind !== 'pick' && typeof t.key === 'string' && lower(t.key) === lower(c.s); })) errors.push({ id: lf.id, prop: prop, message: 'Pick the stat this changes: "' + c.s + '" is no number stat of this list.' });
    };
    sys.rolls.forEach(function(r) {
        nearV = r.to === 'near'; crossV = isObj(r.cross); resistV = r.resist === true;   // 1.5.9; 1.6.0: crossV; B2: resistV
        if (typeof r.resistBy === 'string' && !sys.rolls.some(function(x) { return isObj(x) && x.id === r.resistBy && x.resist === true && !x.apply; })) warnings.push({ id: r.id, prop: 'resistBy', message: 'Resisted by names a roll that is not ticked Resists an attempt, so nothing is posted to the target.' });   // 1.6.0 (B2)
        if (nearV && !(Array.isArray(r.apply) ? r.apply : Array.isArray(r.then) ? r.then : []).some(function(c) { return isObj(c) && (!!c.f || typeof c.fx === 'string'); })) warnings.push({ id: r.id, prop: 'to', message: 'It applies to an adjacent character, but no change of it names a value, so nothing lands on the one it is used on.' });
        if (r.needs) checkFormula({ id: r.id, key: r.id }, 'needs', r.needs, false, r.vis);   // 1.5.4: what a roll or an apply action needs (no dice)
        if (!r.apply) {
            checkFormula({ id: r.id, key: r.id }, 'rollFormula', r.formula, true, r.vis);
            if (r.malf) checkFormula({ id: r.id, key: r.id }, 'malf', r.malf, false, r.vis);   // Stage 6 HUD R3: its Malf (no dice)
            ['critAt', 'fumbleAt'].forEach(function(k) { if (!r[k]) return; checkFormula({ id: r.id, key: r.id }, k, r[k], false, r.vis); if (!fixedC) warnings.push({ id: r.id, prop: k, message: noRangeSays() }); });   // 1.6.0: its own critical range (no dice)
            if (r.bigAt) checkFormula({ id: r.id, key: r.id }, 'bigAt', r.bigAt, false, r.vis);   // 1.6.0: what lands as a Big Hit (no dice)
            if (Array.isArray(r.then)) r.then.forEach(function(c, i) { if (c.when === 'malf' && !r.malf) warnings.push({ id: r.id, prop: 'then.' + i, message: 'This roll has no Malf, so On malfunction never happens.' }); });
            if (Array.isArray(r.then)) r.then.forEach(function(c, i) { if ((c.when === 'crit' || c.when === 'fumble') && !crits) warnings.push({ id: r.id, prop: 'then.' + i, message: noCritSays(c.when) }); });   // 1.5.8
            if (Array.isArray(r.then)) {   // Stage 6 HUD R1: its consequences — as an apply action's changes; On success / On failure need a test
                var rp0 = F.parse(r.formula || ''), tests = !!(rp0.ok && rp0.ast && rp0.ast.body && rp0.ast.body.t === 'cmp');
                r.then.forEach(function(c, i) {
                    var tp = 'then.' + i, tf0 = c.f ? fieldById(sys, c.f) : null;
                    if (typeof c.fx === 'string') { fxSays(r.id, tp, c, r.vis); return; }   // 1.6.0: an effect switched
                    if (!tf0 || APPLY_KINDS[tf0.kind] !== 1) errors.push({ id: r.id, prop: tp, message: 'Pick the pool or number this changes.' });
                    else if (r.vis === 'all' && (tf0.vis === 'gm' || gmP[tf0.id] === 1)) warnings.push({ id: r.id, prop: tp, message: '"' + tf0.key + '" is GM only: players\u2019 rolls will not change it.' });
                    if (c.when && !tests && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: r.id, prop: tp, message: 'This roll tests nothing (no comparison, like 3d6 <= Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' });
                    checkFormula({ id: r.id, key: r.id }, tp, c.formula, c.roll === true, r.vis); rolledWarn(r.id, tp, c);   // 1.5.9: a Rolled amount may roll dice
                });
            }
            return;
        }
        if (!r.apply.length) { errors.push({ id: r.id, prop: 'apply', message: 'An apply action needs a change: the pool or number it moves, and by how much.' }); return; }   // Stage 6 HUD H7
        r.apply.forEach(function(c, i) {
            var pr = 'apply.' + i, tf = c.f ? fieldById(sys, c.f) : null;
            if (typeof c.fx === 'string') { fxSays(r.id, pr, c, r.vis); return; }   // 1.6.0: an effect switched
            if (!tf || APPLY_KINDS[tf.kind] !== 1) errors.push({ id: r.id, prop: pr, message: 'Pick the pool or number this changes.' });
            else if (r.vis === 'all' && (tf.vis === 'gm' || gmP[tf.id] === 1)) warnings.push({ id: r.id, prop: pr, message: '"' + tf.key + '" is GM only: players will not get this action.' });
            checkFormula({ id: r.id, key: r.id }, pr, c.formula, c.roll === true, r.vis); rolledWarn(r.id, pr, c);   // 1.5.9: a Rolled amount may roll dice
        });
    });
    nearV = false; crossV = false; resistV = false;
    // Stage 6 F5a1: each list's columns (no dice; Row.* known there), and field keys that would hide a list's names
    sys.fields.forEach(function(f) {
        if (lower(f.key) === 'row') errors.push({ id: f.id, prop: 'key', message: 'Row is the name a list\u2019s columns read their row by: give this field another key.' });
        var dp = lower(f.key).indexOf('.'); if (dp > 0 && lsts[lower(f.key).slice(0, dp)] && lsts[lower(f.key).slice(0, dp)] !== f) errors.push({ id: f.id, prop: 'key', message: 'A key starting "' + f.key.slice(0, dp) + '." would hide that list\u2019s own names: give this field another key.' });
        if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.cols)) return;
        f.list.cols.forEach(function(c) { if (isObj(c) && typeof c.key === 'string') checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '.' + lower(c.key) }, 'list.col.' + c.key, c.formula, false, f.vis, f); });
    });
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.badges)) f.list.badges.forEach(function(b, j) { if (isObj(b) && typeof b.if === 'string') { badgeNow = true; try { checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#badge' }, 'list.badge.' + j + '.' + (b.words || 'badge'), b.if, false, f.vis, f); } finally { badgeNow = false; } } }); });   // 1.6.0 R4: a badge's Shown where (no dice, Row.* known)
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.on) && typeof f.list.on.needs === 'string' && f.list.on.needs) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#onneeds' }, 'list.onneeds', f.list.on.needs, false, f.vis, f); });
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.on) && typeof f.list.on.showIf === 'string' && f.list.on.showIf) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#onshow' }, 'list.onshow', f.list.on.showIf, false, f.vis, f); });   // 1.6.0: where a row's switch is shown (no dice, Row.* known)   // 1.5.8: what a row's switch needs (no dice, Row.* known)
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && typeof f.list.unheld === 'string' && f.list.unheld) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#unheld' }, 'list.unheld', f.list.unheld, false, f.vis, f); });   // 1.6.0 Rolls unheld entries: the Unheld level (no dice, Row.* known)
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.chamber) && typeof f.list.chamber.needs === 'string' && f.list.chamber.needs) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#chneeds' }, 'list.chneeds', f.list.chamber.needs, false, f.vis, f); });   // 1.5.9 Chambers only where: what a row must meet to chamber (no dice, Row.* known)
    sys.fields.forEach(function(f) {   // F5b: a list's rolls — dice allowed, Row.* known
        if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.rolls)) return;
        f.list.rolls.forEach(function(r, i) {
            if (!isObj(r)) return;
            nearV = r.to === 'near'; crossV = isObj(r.cross);   // 1.5.9; 1.6.0: crossV
            if (typeof r.resistBy === 'string' && !sys.rolls.some(function(x) { return isObj(x) && x.id === r.resistBy && x.resist === true && !x.apply; })) warnings.push({ id: f.id, prop: 'list.resistBy', message: 'Resisted by names a roll that is not ticked Resists an attempt, so nothing is posted to the target.' });   // 1.6.0 (B2)
            if (isObj(r.cross)) { var xLb = 'list.cross.' + i + '.' + (r.label || (Array.isArray(r.apply) ? 'Apply' : 'Roll')); checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#cross' }, xLb, r.cross.at, false, f.vis, f); if (r.cross.step) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#cross' }, xLb, r.cross.step, false, f.vis, f); }   // 1.6.0: a counter's crossing, its steps read with the row's names
            if (typeof r.showIf === 'string' && r.showIf) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#show' }, 'list.show.' + i + '.' + (r.label || (Array.isArray(r.apply) ? 'Apply' : 'Roll')), r.showIf, false, f.vis, f);
            if (Array.isArray(r.alt)) r.alt.forEach(function(a, j) { if (isObj(a) && typeof a.if === 'string') checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#alt' }, 'list.alt.' + i + '.' + j + '.' + (a.label || 'name'), a.if, false, f.vis, f); });   // 1.6.0: another name's formula (no dice, Row.* known)   // 1.6.0: Shown where (no dice, Row.* known)
            if (!Array.isArray(r.apply)) {
                var rl2 = r.label || 'Roll';
                checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#roll' }, 'list.roll.' + i + '.' + rl2, r.formula, true, f.vis, f);
                if (r.needs) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#needs' }, 'list.needs.' + i + '.' + rl2, r.needs, false, f.vis, f);
                if (r.malf) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#malf' }, 'list.malf.' + i + '.' + rl2, r.malf, false, f.vis, f);   // Stage 6 HUD R3
                if (r.ad) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#ad' }, 'list.ad.' + i + '.' + rl2, r.ad, false, f.vis, f);   // 1.6.0: its armour divisor (no dice, Row.* known)
                ['critAt', 'fumbleAt'].forEach(function(k) { if (!r[k]) return; checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#crit' }, 'list.' + k + '.' + i + '.' + rl2, r[k], false, f.vis, f); if (!fixedC) warnings.push({ id: f.id, prop: 'list.' + k + '.' + i + '.' + rl2, message: noRangeSays() }); });   // 1.6.0: its own critical range (no dice, Row.* known)
                if (r.bigAt) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#crit' }, 'list.bigAt.' + i + '.' + rl2, r.bigAt, false, f.vis, f);   // 1.6.0: what lands as a Big Hit (no dice, Row.* known)
                if (Array.isArray(r.then)) r.then.forEach(function(c, k) { if (c.when === 'malf' && !r.malf) warnings.push({ id: f.id, prop: 'list.then.' + i + '.' + k + '.' + rl2, message: 'This roll has no Malf, so On malfunction never happens.' }); });   // Stage 6 HUD R2b: what it needs (no dice, Row.* known)
                if (Array.isArray(r.then)) r.then.forEach(function(c, k) { if ((c.when === 'crit' || c.when === 'fumble') && !crits) warnings.push({ id: f.id, prop: 'list.then.' + i + '.' + k + '.' + rl2, message: noCritSays(c.when) }); });   // 1.5.8: On a critical success or failure where the system has no criticals
                if (Array.isArray(r.then)) {   // Stage 6 HUD R2b: its consequences — a pool, a number or one of the row's counters
                    var rp2 = F.parse(r.formula || ''), tests2 = !!(rp2.ok && rp2.ast && rp2.ast.body && rp2.ast.body.t === 'cmp');
                    r.then.forEach(function(c, k) {
                        var tp2 = 'list.then.' + i + '.' + k + '.' + rl2, tf2 = c.f ? fieldById(sys, c.f) : null;
                        if (typeof c.fx === 'string') { fxSays(f.id, tp2, c, f.vis); return; }   // 1.6.0: an effect switched, the row's quantity or one of its stats
                        if (c.q === true || typeof c.s === 'string') { rowSays(f, tp2, c); if (c.when && !tests2 && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: f.id, prop: tp2, message: 'This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' }); checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#then' }, tp2, c.formula, c.roll === true, f.vis, f); rolledWarn(f.id, tp2, c); return; }
                        if (c.fire === true) { if (c.when === 'malf') warnings.push({ id: f.id, prop: tp2, message: 'Fire never happens on a malfunction: a shot that jams is not fired and spends nothing.' }); if (!isObj(f.list.chamber)) errors.push({ id: f.id, prop: tp2, message: 'Fire takes a round out of the chamber, but this list has no Chambers from.' }); else if (c.when && c.when !== 'malf' && !tests2 && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: f.id, prop: tp2, message: 'This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' }); return; }   // 1.5.9: fire has no amount
                        if (!c.c && (!tf2 || APPLY_KINDS[tf2.kind] !== 1)) errors.push({ id: f.id, prop: tp2, message: 'Pick the pool, number or counter this changes.' });
                        else if (tf2 && f.vis === 'all' && (tf2.vis === 'gm' || gmP[tf2.id] === 1)) warnings.push({ id: f.id, prop: tp2, message: '"' + tf2.key + '" is GM only: players\u2019 rolls will not change it.' });
                        if (c.when && !tests2 && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: f.id, prop: tp2, message: 'This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' });
                        checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#then' }, tp2, c.formula, c.roll === true, f.vis, f); rolledWarn(f.id, tp2, c);   // 1.5.9
                    });
                }
                return;
            }
            var al = r.label || 'Apply';   // HUD H7b: an apply action on each row — each change as the system's (a pool or a number, no dice), Row.* known
            if (!r.apply.length) { errors.push({ id: f.id, prop: 'list.apply.' + i + '.x.' + al, message: 'An apply action needs a change: the pool or number it moves, and by how much.' }); return; }
            r.apply.forEach(function(c, k) {
                var cp = 'list.apply.' + i + '.' + k + '.' + al, tf = c.f ? fieldById(sys, c.f) : null;
                if (typeof c.fx === 'string') { fxSays(f.id, cp, c, f.vis); return; }   // 1.6.0: an effect switched, the row's quantity or one of its stats
                if (c.q === true || typeof c.s === 'string') { rowSays(f, cp, c); checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#apply' }, cp, c.formula, c.roll === true, f.vis, f); rolledWarn(f.id, cp, c); return; }
                if (!c.c && (!tf || APPLY_KINDS[tf.kind] !== 1)) errors.push({ id: f.id, prop: cp, message: 'Pick the pool, number or counter this changes.' });   // R2b: or one of the row's counters
                else if (tf && f.vis === 'all' && (tf.vis === 'gm' || gmP[tf.id] === 1)) warnings.push({ id: f.id, prop: cp, message: '"' + tf.key + '" is GM only: players will not get this action.' });
                checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#apply' }, cp, c.formula, c.roll === true, f.vis, f); rolledWarn(f.id, cp, c);   // 1.5.9
            });
        });
    });
    nearV = false; crossV = false;
    var trn = isObj(sys.combat) && isObj(sys.combat.turn) ? sys.combat.turn : null, actK = map();   // turn-based combat T1: the move (no dice) and what each roll costs
    if (trn && trn.move) checkFormula({ id: 'combat', key: '#turn' }, 'turn.move', trn.move, false, 'all');
    if (fixedC) ['critAt', 'fumbleAt'].forEach(function(k) { if (sys.combat[k]) checkFormula({ id: 'checks', key: '#checks' }, k, sys.combat[k], false, 'all'); });   // 1.6.0: the Combat card's critical range (no dice)
    (trn && Array.isArray(trn.acts) ? trn.acts : []).forEach(function(a) { if (isObj(a) && typeof a.nf === 'string' && a.nf) checkFormula({ id: 'combat', key: '#turn' }, 'turn.act.' + a.key, a.nf, false, 'all'); });   // 192: an action's count
    (trn && Array.isArray(trn.acts) ? trn.acts : []).forEach(function(a) { if (isObj(a) && typeof a.key === 'string') actK[lower(a.key)] = 1; });
    var costErr = function(id, prop, k) { errors.push({ id: id, prop: prop, message: 'No action \u201c' + k + '\u201d on the Combat card (System \u25b8 Items): add it there, or pick another.' }); };
    sys.rolls.forEach(function(r) { if (r.cost && !actK[lower(r.cost)]) costErr(r.id, 'cost', r.cost); });
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.rolls)) f.list.rolls.forEach(function(r, i) { if (isObj(r) && r.cost && !actK[lower(r.cost)]) costErr(f.id, 'list.cost.' + i + '.' + (r.label || (Array.isArray(r.apply) ? 'Apply' : 'Roll')), r.cost); }); });
    sys.fields.forEach(function(f) {   // Stage 6 HUD R2: a list's counters — each most a formula (no dice) that reads the row
        if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.counters)) return;
        f.list.counters.forEach(function(t) { if (isObj(t) && typeof t.key === 'string' && t.max) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#ct' }, 'list.ctr.' + t.key, t.max, false, f.vis, f); });
    });
    sys.rolls.forEach(function(r) {   // HUD frame (HF5a, H3): each {formula} in a roll's label, as the caption checks (warnings); a GM-only name says what players see instead
        if (typeof r.label !== 'string' || r.label.indexOf('{') < 0) return;
        var lre = /\{([^{}]{1,300})\}/g, lm, ln = 0, lgm = map();   // lgm: the GM-only names already warned about in this label (each once)
        while ((lm = lre.exec(r.label))) {
            var ldrawn = ++ln <= LIMITS.captionExprs, lp = F.parse(capExpr(lm[1]).expr);
            if (!lp.ok) { if (ldrawn) warnings.push({ id: r.id, prop: 'label', message: 'Label: ' + lp.error.message }); continue; }
            if (ldrawn && hasDice(lp.ast.body)) warnings.push({ id: r.id, prop: 'label', message: 'Label: dice are not worked out in a label; put them in the formula.' });
            lp.names.forEach(function(nm) {
                var tg = known[lower(nm)] || listT(nm);   // F5a1
                if (!tg) { if (ldrawn) warnings.push({ id: r.id, prop: 'label', message: 'Label: unknown name "' + nm + '".' }); }
                else if (!NUMERIC[tg.kind]) { if (ldrawn) warnings.push({ id: r.id, prop: 'label', message: 'Label: "' + nm + '" is not a number.' }); }
                else if (r.vis === 'all' && (tg.vis === 'gm' || gmP[tg.id] === 1) && !lgm[lower(nm)]) { lgm[lower(nm)] = 1; warnings.push({ id: r.id, prop: 'label', message: 'Label: "' + nm + '" is GM only, so players see only "' + labelHead(r.label) + '".' }); }
            });
        }
        if (ln > LIMITS.captionExprs) warnings.push({ id: r.id, prop: 'label', message: 'Label: only the first ' + LIMITS.captionExprs + ' {\u2026} values are worked out; the rest show as written.' });
        if ((r.label.match(/\{/g) || []).length > ln) warnings.push({ id: r.id, prop: 'label', message: 'Label: a "{" without its "}" shows as written.' });   // HF5 review
        if (r.vis === 'all') labelGmNames(sys, F, r.label).forEach(function(nm) { if (!lgm[lower(nm)]) { lgm[lower(nm)] = 1; warnings.push({ id: r.id, prop: 'label', message: 'Label: "' + nm + '" is GM only, so players see only "' + labelHead(r.label) + '".' }); } });   // HF5 review: one no {...} draws (left open, past the 8th, not a formula)
    });
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {   // item damage = a roll (dice ok); cost = a definition (no dice)
        if (it.damage) checkFormula({ id: it.id, key: it.id }, 'damage', it.damage, true, it.vis);
        if (isObj(it.area) && typeof it.area.frag === 'string' && it.area.frag) checkFormula({ id: it.id, key: it.id }, 'frag', it.area.frag, true, it.vis);   // 1.5.9 (es): its fragmentation, a roll as its damage is
        (isObj(it.area) && Array.isArray(it.area.aff) ? it.area.aff : []).forEach(function(a, ai) {   // 1.5.9 (es): an affliction's resist target and Only where read the victim's names with no dice, its Lasts may roll them; all the GM's own (vis gm: no warning that a name is GM only)
            if (!isObj(a)) return;
            if (typeof a.vs === 'string') checkFormula({ id: it.id, key: it.id }, 'aff.' + ai + '.vs', a.vs, false, 'gm');
            if (typeof a.needs === 'string' && a.needs) checkFormula({ id: it.id, key: it.id }, 'aff.' + ai + '.needs', a.needs, false, 'gm');
            if (isObj(a.lasts) && typeof a.lasts.n === 'string' && a.lasts.n) { checkFormula({ id: it.id, key: it.id }, 'aff.' + ai + '.lasts', a.lasts.n, true, 'gm'); if (!affLastsSecs(sys, 1, a.lasts.u)) warnings.push({ id: it.id, prop: 'aff.' + ai + '.lasts', message: 'Lasts names a time unit the Combat card does not have, so the effect lasts its own time.' }); }
        });
        if (it.cost) checkFormula({ id: it.id, key: it.id }, 'cost', it.cost, false, it.vis);
        if (it.throwSkill && !ix[lower(it.throwSkill)]) warnings.push({ id: it.id, prop: 'throwSkill', message: 'Throw skill "' + it.throwSkill + '" is not a field.' });
    });
    // Stage 6 F4b: an item's key names one row of each list it can be on (the list's categories, or every item): once there
    var keyErr = map();
    sys.fields.forEach(function(f) {
        if (f.kind !== 'item-list') return;
        var sc = f.list && Array.isArray(f.list.cats) && f.list.cats.length ? f.list.cats : null, byKey = map();
        (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {
            if (!isObj(it) || !it.key || (sc && !catIn(sc, it.category))) return;
            var o = byKey[lower(it.key)]; if (!o) { byKey[lower(it.key)] = it; return; }
            if (keyErr[it.id]) return; keyErr[it.id] = 1;   // once per item, whichever lists it shares
            errors.push({ id: it.id, prop: 'key', message: 'Key "' + it.key + '" is also used by "' + (o.name || 'Item') + '" in ' + (f.label || f.key) + '.' });
        });
    });
    // Stage 6 F4c1: a stat key a GM-only item list shares with a visible one — an item's value under it is in the players' view (the visible list's)
    var visSt = map();
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && f.vis === 'all' && isObj(f.list) && Array.isArray(f.list.stats)) f.list.stats.forEach(function(s) { if (isObj(s) && typeof s.key === 'string' && !visSt[lower(s.key)]) visSt[lower(s.key)] = f; }); });
    sys.fields.forEach(function(f) { if (f.kind !== 'item-list' || f.vis !== 'gm' || !isObj(f.list) || !Array.isArray(f.list.stats)) return; f.list.stats.forEach(function(s) { var vf = isObj(s) && typeof s.key === 'string' ? visSt[lower(s.key)] : null; if (vf) warnings.push({ id: f.id, prop: 'list', message: 'Stat “' + s.key + '” is also on ' + (vf.label || vf.key) + ': an item’s ' + s.key + ' reaches players.' }); }); });
    [sys.sheet, sys.sheet && sys.sheet.hud].forEach(function(lay) {
        (isObj(lay) && Array.isArray(lay.sections) ? lay.sections : []).forEach(function(s) { (isObj(s) && Array.isArray(s.fields) ? s.fields : []).forEach(function(pl) {
            if (!isObj(pl) || pl.on !== true) return; var lf = fieldById(sys, pl.id);
            if (lf && !(lf.list && lf.list.on)) warnings.push({ id: pl.id, prop: 'layout', message: (lf.label || lf.key) + ' is set to show only rows switched on, but its list has no switch, so every row shows.' });
        }); });
    });
    // Stage 6 look fold (L4): a band group with no Pin button anywhere is always shown — say so (it may be meant)
    var pinT = pinTargetsAll(sys.sheet);   // HUD frame HF1: a Pin in the HUD counts too
    (sys.sheet && Array.isArray(sys.sheet.bandGroups) ? sys.sheet.bandGroups : []).forEach(function(g) { if (isObj(g) && typeof g.id === 'string' && pinT[g.id] !== 1) warnings.push({ id: g.id, prop: 'layout', message: 'The band group "' + (g.label || 'Group') + '" has no Pin button yet, so it is always shown.' }); });
    // Stage 6 look fold: one field, once — a field the header edits in place and placed again in a section is flagged
    [[sys.sheet, ''], [sys.sheet && sys.sheet.hud, 'the HUD\u2019s ']].forEach(function(lv) {   // HUD frame HF1: per layout (the sheet's message unchanged)
        var lay = lv[0]; if (!isObj(lay)) return;
        var hdrEd = headerEdits(sys, lay);
        (Array.isArray(lay.sections) ? lay.sections : []).forEach(function(s) { (isObj(s) && Array.isArray(s.fields) ? s.fields : []).forEach(function(pl) { if (isObj(pl) && typeof pl.id === 'string' && hdrEd[pl.id] === 1) { var hf = fieldById(sys, pl.id); warnings.push({ id: pl.id, prop: 'layout', message: (hf && (hf.label || hf.key) || 'This field') + ' is edited in the header and placed again in ' + lv[1] + (s.title || 'a section') + '.' }); } }); });
    });
    // HUD frame (HF4b): a section's Reset all resets at most LIMITS.editBatch pools and counters (the rest are left as they are)
    [[sys.sheet, ''], [sys.sheet && sys.sheet.hud, 'the HUD\u2019s ']].forEach(function(lv) {
        var lay = lv[0]; if (!isObj(lay)) return;
        (Array.isArray(lay.sections) ? lay.sections : []).forEach(function(s) {
            if (!isObj(s) || s.resetAll !== true || !Array.isArray(s.fields)) return;
            var n = s.fields.filter(function(pl) { var f = isObj(pl) && typeof pl.id === 'string' ? fieldById(sys, pl.id) : null; return !!f && (f.kind === 'resource' || (f.counter === true && (f.kind === 'number' || f.kind === 'skill'))); }).length;
            if (n > LIMITS.editBatch) warnings.push({ id: s.id, prop: 'resetAll', message: 'Reset all resets the first ' + LIMITS.editBatch + ' in ' + lv[1] + (s.title || 'this section') + '.' });
        });
    });
    // Stage 6 HUD C8: a show-if on a section or a placement — a formula with no dice over known numbers; its messages are warnings (a bad one
    // shows the part), on the section; one reading a GM-only value is dropped from the players' view, so players always see that part
    [[sys.sheet, ''], [sys.sheet && sys.sheet.hud, 'the HUD\u2019s ']].forEach(function(lv) {
        var lay = lv[0]; if (!isObj(lay)) return;
        (Array.isArray(lay.sections) ? lay.sections : []).forEach(function(s) {
            if (!isObj(s)) return;
            var chk = function(text, prop) {
                if (typeof text !== 'string' || !text) return;
                var p = F.parse(text); if (!p.ok) { warnings.push({ id: s.id, prop: prop, message: 'Show if: ' + p.error.message + ' It shows until this is fixed.' }); return; }
                if (hasDice(p.ast.body)) { warnings.push({ id: s.id, prop: prop, message: 'Show if: dice are not rolled here, so it always shows.' }); return; }
                p.names.forEach(function(nm) {
                    var tg = known[lower(nm)] || listT(nm);
                    if (!tg) warnings.push({ id: s.id, prop: prop, message: 'Show if: unknown name "' + nm + '", so it shows.' });
                    else if (!NUMERIC[tg.kind]) warnings.push({ id: s.id, prop: prop, message: 'Show if: "' + nm + '" is not a number, so it shows.' });
                    else if (tg.vis === 'gm' || gmP[tg.id] === 1 || tg.gmKey) warnings.push({ id: s.id, prop: prop, message: 'Show if: "' + nm + '" is GM only, so players always see it.' });
                });
            };
            chk(s.showIf, 'showIf');
            (Array.isArray(s.fields) ? s.fields : []).forEach(function(pl, i) { if (isObj(pl)) chk(pl.showIf, 'showIf.' + i); });
            (Array.isArray(s.fields) ? s.fields : []).forEach(function(pl, i) {   // Stage 6 HUD H9: a custom roller's starting formula
                if (!isObj(pl) || pl.kind !== 'roller' || typeof pl.formula !== 'string' || !pl.formula.trim()) return;
                var p = F.parse(pl.formula); if (!p.ok) { var rlOpen = pl.formula.replace(/\s+$/, ''); if (/(<=|>=|<|>|=|\+|-|\*|\/)$/.test(rlOpen)) { var rlP = F.parse(rlOpen + ' 0'); if (rlP.ok) p = rlP; } }   // 1.6.0: a starting text that ends in a comparison or an operator is one the player finishes (3d6 <=), read as if a number followed
                if (!p.ok) { warnings.push({ id: s.id, prop: 'formula.' + i, message: 'Custom roller: ' + p.error.message }); return; }
                p.names.forEach(function(nm) { var tg = known[lower(nm)] || listT(nm); if (!tg) warnings.push({ id: s.id, prop: 'formula.' + i, message: 'Custom roller: unknown name "' + nm + '".' }); else if (tg.vis === 'gm' || gmP[tg.id] === 1 || tg.gmKey) warnings.push({ id: s.id, prop: 'formula.' + i, message: 'Custom roller: "' + nm + '" is GM only, so players\u2019 box starts empty.' }); });
            });
        });
    });
    // loops: DFS over the definition graph
    var state = map(), stack = [];
    function visit(k) {
        state[k] = 1; stack.push(k);
        (edges[k] || []).forEach(function(to) {
            if (state[to] === 1) { var at = stack.indexOf(to), cyc = stack.slice(at).concat(to).map(nodeName), lk = listNode(k); errors.push({ id: ix[k] ? ix[k].id : lk ? lk.f.id : k, prop: lk ? 'list' : (DEF_PROP[ix[k] ? ix[k].kind : ''] || 'formula'), message: 'Formulas refer to each other in a loop: ' + cyc.join(' → '), pos: 0, len: 0 }); }
            else if (!state[to]) visit(to);
        });
        stack.pop(); state[k] = 2;
    }
    // Stage 6 F5a2: choice stats — each option reads one number formulas know; one key one kind across lists; a GM-only option on a visible list warns
    var kindOf = map();
    sys.fields.forEach(function(f) {
        if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.stats)) return;
        f.list.stats.forEach(function(st) {
            if (!isObj(st) || typeof st.key !== 'string') return;
            var lk = lower(st.key), kd = st.kind === 'pick' ? 'pick' : 'num', word = function(x) { return x === 'pick' ? 'a choice' : 'a number'; };
            if (kindOf[lk] && kindOf[lk].kd !== kd) errors.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d is ' + word(kd) + ' here but ' + word(kindOf[lk].kd) + ' on ' + (kindOf[lk].f.label || kindOf[lk].f.key) + ': one key, one kind.' });
            else if (!kindOf[lk]) kindOf[lk] = { kd: kd, f: f, st: st };
            else if (kd === 'pick' && kindOf[lk].f !== f) { var lbs = function(x) { return (Array.isArray(x.opts) ? x.opts : []).map(function(o) { return lower(o.label); }).join('\n'); }; if (lbs(st) !== lbs(kindOf[lk].st)) warnings.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d is a choice on ' + (kindOf[lk].f.label || kindOf[lk].f.key) + ' too, with other options: an item holds one choice under a key, read against ' + (kindOf[lk].f.label || kindOf[lk].f.key) + '\u2019s options. Give this list its own key.' }); }   // Stage 6 F7: one key, one set of options
            if (kd !== 'pick') return;
            if (!Array.isArray(st.opts) || !st.opts.length) errors.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d is a choice with no options yet.' });
            (st.opts || []).forEach(function(o) {
                var t = known[lower(o.name)] || listT(o.name), ok = false; try { var p = F.parse(o.name); ok = !!p.ok && p.names.length === 1 && lower(p.names[0]) === lower(o.name); } catch (e) { ok = false; }   // Stage 6 F3: or a list's name — an addressed row (Skills.Guns.Target), a total
                if (!ok || !t || !NUMERIC[t.kind]) { errors.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d: the option \u201c' + o.label + '\u201d reads \u201c' + o.name + '\u201d, which is not a number formulas know.' }); return; }
                if (!t.noEdge) { var fromP = 'l#' + lower(f.key) + '.' + lower(st.key); (edges[fromP] = edges[fromP] || []).push(lower(t.key)); }   // a loop through a choice is named
                if (f.vis === 'all' && (t.vis === 'gm' || gmP[t.id] === 1 || t.gmKey)) warnings.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d: the option \u201c' + o.label + '\u201d reads a GM-only value, so players do not get that option.' });
            });
        });
    });
    // 126: a budget's two formulas are definitions like any other: a name nothing has, a text where a number is read. What Save DROPS of a budget
    // is the editor's to say (refreshErrors); with vis 'gm' nothing is said here of a GM-only name
    (Array.isArray(sys.env) ? sys.env : []).forEach(function(e) { if (!isObj(e) || typeof e.key !== 'string') return; ENV_BANDS.forEach(function(k) { if (typeof e[k] === 'string' && e[k]) checkFormula({ id: 'env', key: 'env#' + e.key }, 'env.' + e.key + '.' + k, e[k], false, 'all'); }); });   // 1.6.0: an environment reading's bands, the sheet's names
    (Array.isArray(sys.budgets) ? sys.budgets : []).forEach(function(b) { if (!isObj(b) || typeof b.id !== 'string') return; var own = { id: b.id, key: 'budget#' + b.id }; checkFormula(own, 'has', typeof b.has === 'string' ? b.has : '', false, 'gm'); checkFormula(own, 'spent', typeof b.spent === 'string' ? b.spent : '', false, 'gm'); });
    function listNode(k) { if (k.slice(0, 2) !== 'l#') return null; var rest = k.slice(2), d = rest.indexOf('.'), lf = lsts[d > 0 ? rest.slice(0, d) : rest]; if (!lf) return null; var ck = d > 0 ? rest.slice(d + 1) : '', col = null, pick = null; ((lf.list && lf.list.cols) || []).forEach(function(c) { if (!col && lower(c.key) === ck) col = c; }); if (!col && ck) ((lf.list && lf.list.stats) || []).forEach(function(x) { if (!pick && isObj(x) && x.kind === 'pick' && lower(x.key) === ck) pick = x; }); return { f: lf, col: col, pick: pick }; }
    function nodeName(x) { if (ix[x]) return ix[x].key; var ln = listNode(x); return ln ? (ln.pick ? ln.f.key + '.' + ln.pick.key + ' (choice)' : ln.f.key + '.' + (ln.col ? ln.col.key : '') + ' (column)') : x; }
    lowerKeys.forEach(function(k) { if (!state[k]) visit(k); });
    Object.keys(edges).forEach(function(k) { if (!state[k]) visit(k); });   // F5a1: the list columns' own nodes
    [errors, warnings].forEach(function(a) { a.forEach(function(e) { if (e.prop === 'list.onneeds') { e.message = 'Needs to switch on: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.chneeds') { e.message = 'Chambers only where: ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && e.prop.indexOf('list.col.') === 0) { e.message = 'Column \u201c' + e.prop.slice(9) + '\u201d: ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && (e.prop.indexOf('list.then.') === 0 || e.prop.indexOf('list.needs.') === 0 || e.prop.indexOf('list.malf.') === 0 || e.prop.indexOf('list.cost.') === 0 || e.prop.indexOf('list.critAt.') === 0 || e.prop.indexOf('list.fumbleAt.') === 0 || e.prop.indexOf('list.bigAt.') === 0)) { var thq = e.prop.split('.'), isN = thq[1] === 'needs' || thq[1] === 'malf' || thq[1] === 'cost' || thq[1] === 'critAt' || thq[1] === 'fumbleAt' || thq[1] === 'bigAt'; e.message = 'Roll \u201c' + thq.slice(isN ? 3 : 4).join('.') + '\u201d, ' + (isN ? (thq[1] === 'malf' ? 'Malf' : thq[1] === 'cost' ? 'costs' : thq[1] === 'critAt' ? 'critical at' : thq[1] === 'fumbleAt' ? 'critical failure at' : thq[1] === 'bigAt' ? 'lands as a Big Hit at' : 'needs') : 'then ' + (+thq[3] + 1)) + ': ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && e.prop.indexOf('list.ctr.') === 0) { e.message = 'Counter \u201c' + e.prop.slice(9) + '\u201d, its most: ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && e.prop.indexOf('list.apply.') === 0) { var apq = e.prop.slice(11).split('.'); e.message = 'Apply \u201c' + apq.slice(2).join('.') + '\u201d' + (apq[1] === 'x' ? '' : ', change ' + (+apq[1] + 1)) + ': ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && e.prop.indexOf('list.roll.') === 0) { var rp = e.prop.slice(10), rd2 = rp.indexOf('.'); e.message = 'Roll \u201c' + (rd2 >= 0 ? rp.slice(rd2 + 1) : rp) + '\u201d: ' + e.message; e.prop = 'list'; } }); });   // F5b: a list roll's too   // F5a1: a column's messages under its list's card
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

/* ---------- what a player receives ---------- */
// An NPC or an ownerless character: nothing. The owner: every visible value. Another player: the hover fields only.
// 5h: a character's effects rows as one recipient may hold them (sys = the players' view; lib = the FULL library by id). The owner gets a
// visible library row as a reference, a GM-only one INLINE (so their sheet and rolls agree with the GM's), ad hoc rows as they are — every
// change filtered to fields in the view. A teammate (hover only) gets names, never changes — and only of the effects in the players' view: a
// GM-only effect's name, icon and tone are the owner's and the GM's alone (conditions C1, the token's rule; secrets R2). A row with no
// definition the recipient may read is dropped.
function projectEffects(rows, sys, own, lib) {
    if (!Array.isArray(rows)) return undefined;
    var view = map(), vf = map(); (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { view[d.id] = d; }); sys.fields.forEach(function(x) { vf[x.id] = 1; });
    var out = [];
    rows.forEach(function(r) {
        if (!isObj(r) || typeof r.id !== 'string') return;
        var on = r.on !== false, d = r;
        if (typeof r.ref === 'string') {
            if (own && view[r.ref]) { var pr0 = { id: r.id, ref: r.ref, on: on }, pt0 = cleanFxTimer(r.t); if (pt0) pr0.t = pt0; out.push(pr0); return; }   // T5a: its timer to its owner
            d = view[r.ref] || (own && lib && lib[r.ref]) || null; if (!d) return;
        }
        var mods = own ? (Array.isArray(d.mods) ? d.mods : []).filter(function(m) { return isObj(m) && vf[m.f] === 1; }).map(function(m) { var o = { f: m.f, op: m.op }; if (m.op === 'add' || MOD_LIM[m.op]) o.v = m.v; if (m.part) o.part = m.part; else if ((m.op === 'add' || MOD_LIM[m.op]) && rowModAim(m)) { o.key = m.key; o.col = m.col; } return o; }) : [];
        var pr1 = { id: r.id, name: d.name || 'Effect', icon: d.icon || '', tone: d.tone || '', dur: own ? (d.dur || '') : '', notes: own ? (d.notes || '') : '', on: on, mods: mods }, pt1 = own ? cleanFxTimer(r.t) : null; if (pt1) pr1.t = pt1;   // T5a: the owner's timer (a teammate gets names only)
        out.push(pr1);
    });
    return out;
}
function fitsKind(k, v) {   // a list only in a list kind, a pool's {cur} only in a pool (a value from before a kind change never travels; the client's cleaner does the rest)
    if (k === 'effects' || k === 'item-list') return Array.isArray(v);
    if (k === 'resource') return isObj(v) || typeof v === 'number';
    return !Array.isArray(v) && !isObj(v);
}
// Onboarding F3: a player's character in the making ('making') or unlocked by the GM ('unlocked'), else '' — its owner may then set every field
// they can see (D3 = (a)); in the making, no lock holds an item and nothing is noticed
function openChar(c) { return isObj(c) ? (c.making === 1 ? 'making' : c.unlocked === 1 ? 'unlocked' : '') : ''; }
// Onboarding F3: what a player without a character may do here — make one (create 'live'; 'invite': only when the GM invites them; 'off'), start
// it from a file (fromFile), take just a token (justToken: it follows making where there are sheets and a system, always offered where there are
// not; owner, 2026-09-27). sheetsOn: the campaign's sheets feature (the GM's)
function newCharRules(camp, sheetsOn) {
    var n = cleanNewPlayers(camp && camp.newPlayers) || {}, sheets = !!sheetsOn && !!(camp && isObj(camp.system));
    var create = !sheets ? 'off' : n.create === 'invite' || n.create === 'off' ? n.create : 'live';
    return { create: create, fromFile: create !== 'off' && n.fromFile !== false, justToken: !sheets || create === 'live' };
}
// Onboarding F3 (owner, 2026-09-27: the same name on several characters is allowed): what else in the campaign goes by a name — for the GM's
// notice only (another character, a token bound by name, a room's character); the player is never told
function charClash(camp, name, exceptId) {
    var nm = lower(String(name || '').trim()), out = {}; if (!nm || !isObj(camp)) return [];
    var cs = charsIn(camp); Object.keys(cs).forEach(function(id) { var c = cs[id]; if (id !== exceptId && isObj(c) && lower(String(c.name || '').trim()) === nm) out.character = 1; });
    mapsOf(camp).forEach(function(m) {
        (Array.isArray(m.whiteboard) ? m.whiteboard : []).forEach(function(w) { if (isObj(w) && w.isChar && !w.charId && lower(String(w.charName || '').trim()) === nm) out.token = 1; });
        (Array.isArray(m.rooms) ? m.rooms : []).forEach(function(r) { (isObj(r) && Array.isArray(r.characters) ? r.characters : []).forEach(function(rc) { if (isObj(rc) && lower(String(rc.name || '').trim()) === nm) out.room = 1; }); });
    });
    return ['character', 'token', 'room'].filter(function(k) { return out[k] === 1; });
}
function charFor(c, sys, recipientId, opts) {
    if (!c || c.npc || !c.ownerId) return null;
    if (c.making === 1 && c.ownerId !== recipientId) return null;   // Onboarding F3: a character in the making is its owner's alone (no copy, no hover lines, no delta for anyone else)
    return charView(c, sys, c.ownerId === recipientId, opts);
}
// Onboarding F2a: the owner's own projection of any character — an NPC's and an unassigned one's too — for the GM's players'-view download
function charForView(c, sys, opts) { return isObj(c) && sys && Array.isArray(sys.fields) ? charView(c, sys, true, opts) : null; }
function charView(c, sys, own, opts) {
    var values = {}, libFull = opts && opts.lib ? opts.lib : null, probe = !!(opts && opts.probe);   // probe: which fields a recipient may see (syncCharDelta), values as given
    var itemsFull = opts && opts.items ? opts.items : null;   // Stage 6 F4a: the host's items by id — a GM-only row reaches its owner inline
    sys.fields.forEach(function(f) { if (!STORED[f.kind] || f.vis !== 'all') return; if (f.kind === 'item-list' && !own) return; if (!own && !f.hover) return; if (c.values && c.values[f.id] !== undefined) { var cv = c.values[f.id]; if (!probe && !fitsKind(f.kind, cv)) return; values[f.id] = (f.kind === 'item-list' && Array.isArray(cv) && !probe) ? projectRows(cv, sys, itemsFull, f.list || null, opts && typeof opts.ruleShown === 'function' ? opts.ruleShown : null) : (f.kind === 'effects' && Array.isArray(cv) && !probe) ? projectEffects(cv, sys, own, libFull) : cv; } });   // 5h: effects rows projected per recipient   // a carried list never travels to another player, hover flag or not
    var outC = { id: c.id, name: c.name, ownerId: c.ownerId, portrait: c.portrait || '', npc: false, values: values, updated: c.updated || 0, partial: !own };
    if (own && !probe) { var lkV = cleanLooks(c.looks, values, sys); if (lkV) outC.looks = lkV; }   // item 35: the look of a text value goes with the value on its owner's whole copy, and nowhere else (a teammate's hover copy is read as the host's plain lines)
    var faceF = cleanFace(c.face); if (faceF && faceF !== 'photo' && !outC.portrait) outC.face = faceF;   // Onboarding F1c: its own face (everyone sees it on its tokens anyway)
    if (own && !probe) { var lnV = cleanCharLinks(c.links, sys, c.id); if (lnV) outC.links = lnV; }   // 1.6.0: the sheets it links, to its owner (the host adds the figures they read: net.js withLinkFigs)
    if (own && !probe) { var srV = cleanSheetRev(c.sheetRev); if (srV) outC.sheetRev = srV; }   // 1.6.0 (backlog 190): its owner's app judges whether it is out of date
    if (own && !probe) { if (c.making === 1) { outC.making = 1; if (c.invited === 1) outC.invited = 1; } else if (c.unlocked === 1) outC.unlocked = 1; }   // Onboarding F3: its state, to its owner alone (the review and the made mark are the GM's)
    if (own && !probe) { var un = unseenMods(c, sys, opts && opts.full); if (un) outC.unseen = un; }   // F6 (owner, 2026-09-27): what rows they cannot see change, nameless
    return outC;
}
// The host's answer to one edit (its own or a player's): { ok, value } or { ok: false, reason }. Backlog 152 (fold 1's review): opts.tctx, an
// object, is the context a pool's most is read with (a token's, a fight's round: what applyAct reads the pool itself with); none, as before.
// opts.vars (1.5.5): a resolver of char as it stands in that context, which reads the most in place of a new one (applyAct's same)
function applyEdit(sys, char, fieldId, value, F, opts) {
    opts = opts || {};
    var f = fieldById(sys, fieldId); if (!f || !STORED[f.kind] || f.kind === 'effects') return { ok: false, reason: 'field' };   // 5h: an effects list changes only through applyEffectOp
    if (opts.player && f.edit !== 'owner' && !openChar(char)) return { ok: false, reason: 'field' };   // Onboarding F3: a character in the making or unlocked: every field its owner can see (D3 = (a))
    if (opts.player && f.vis !== 'all') return { ok: false, reason: 'field' };
    if (opts.player && f.kind === 'resource' && gmPools(sys, F)[f.id] === 1) return { ok: false, reason: 'field' };   // a pool whose max is GM-only is GM-only: the answer to 999 would be the max
    var max = null;
    if (f.kind === 'resource') { var r = (typeof opts.vars === 'function' ? opts.vars : makeResolver(sys, char, F, isObj(opts.tctx) ? opts.tctx : undefined))(f.key + '.max'); max = typeof r === 'number' && isFinite(r) ? r : null; }
    var v = cleanValue(f, value, { max: max });
    if (v === undefined) return { ok: false, reason: 'value' };
    return { ok: true, value: v };
}
// item 35: the host's (or the GM's own) answer to a look set on a field's text: { ok, look } (look null: the field is plain again) or
// { ok: false, reason }. The RIGHT is the right to set the very value that is stored: whoever may not edit the field may not style it.
// A look is for the text as it is stored NOW: one made for other words is stale (the text changed on its way), and one that holds
// nothing the rule keeps is no style. A field with no text stored takes none
function applyStyle(sys, char, fieldId, rec, F, opts) {
    var f = sys && Array.isArray(sys.fields) ? fieldById(sys, fieldId) : null, rule = f ? lookRule(f) : null; if (!rule) return { ok: false, reason: 'field' };
    var cur = isObj(char) && isObj(char.values) ? char.values[fieldId] : undefined;
    var right = applyEdit(sys, char, fieldId, typeof cur === 'string' ? cur : '', F, opts); if (!right.ok) return { ok: false, reason: right.reason };
    if (rec === null) return { ok: true, look: null };
    if (typeof cur !== 'string') return { ok: false, reason: 'stale' };
    var r = cleanRec(rec, cur, rule); if (r) return { ok: true, look: r };
    return { ok: false, reason: isObj(rec) && typeof rec.sig === 'string' && rec.sig !== textSig(cur) ? 'stale' : 'style' };
}
function fxTimerFor(core, sys, opts) { var s = lastsSecs(core, sys); if (!(s > 0)) return null; var now = opts && typeof opts.now === 'number' ? opts.now : 0; return { left: s, at: opts && opts.inCombat ? 0 : Math.max(0, Math.floor(now)) }; }   // T5a: opts.now (the host's clock), opts.inCombat
// 5h: the host's (or the GM's own) answer to one change of a character's status effects: { ok, value, clamp } or { ok: false, reason }.
// q = { op: add|adhoc|on|remove, rowId, ref?, on?, row? }. Rights follow the list field (Player may edit / GM edits, visible); a player can
// add only what their view holds (opts.view: the players' system). clamp: a resource whose effective max fell below its current value
// is brought down in the same change (fieldId -> { cur }).
function applyEffectOp(sys, char, fieldId, q, F, opts) {
    opts = opts || {};
    var f = fieldById(sys, fieldId); if (!f || f.kind !== 'effects') return { ok: false, reason: 'field' };
    if (opts.player && ((f.edit !== 'owner' && !openChar(char)) || f.vis !== 'all')) return { ok: false, reason: 'field' };
    if (!isObj(q) || !FX_OPS[q.op]) return { ok: false, reason: 'value' };
    if (q.op === 'timer' && opts.player && opts.timersGm) return { ok: false, reason: 'field' };   // T5b: the campaign keeps timers the GM's
    var src = char && char.values && Array.isArray(char.values[fieldId]) ? char.values[fieldId] : [];
    var list = JSON.parse(JSON.stringify(src)), idx = -1, rowId = q.op === 'adhoc' ? (isObj(q.row) ? q.row.id : null) : q.rowId;
    if (typeof rowId !== 'string' || !FXROW_ID.test(rowId)) return { ok: false, reason: 'value' };
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === rowId) { idx = i; break; }
    var vo = valueOpts(sys);
    if (q.op === 'add') {
        if (typeof q.ref !== 'string' || !EFFECT_ID.test(q.ref)) return { ok: false, reason: 'value' };
        if (opts.player) { var inView = false; (opts.view && Array.isArray(opts.view.effects) ? opts.view.effects : []).forEach(function(d) { if (d.id === q.ref) inView = true; }); if (!inView) return { ok: false, reason: 'missing' }; }   // outside the view reads exactly as gone (a GM-only id is never confirmed)
        var def = null; (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (d.id === q.ref) def = d; });
        if (!def || (opts.player && def.vis === 'gm')) return { ok: false, reason: 'missing' };
        var had = -1; for (var j = 0; j < list.length; j++) if (list[j] && list[j].ref === q.ref) { had = j; break; }
        var elsewhere = had < 0 && sys.fields.some(function(x) { var o = x.kind === 'effects' && x.id !== fieldId && char && char.values ? char.values[x.id] : null; return Array.isArray(o) && o.some(function(r0) { return r0 && r0.ref === q.ref; }); });
        if (elsewhere) return { ok: false, reason: 'value' };   // once per character, across every list (another list may have other rights)
        var tA = typeof opts.secs === 'number' && fin(opts.secs) && opts.secs > 0 ? { left: Math.min(1e9, Math.round(opts.secs * 1000) / 1000), at: opts.inCombat ? 0 : Math.max(0, Math.floor(typeof opts.now === 'number' ? opts.now : 0)) } : fxTimerFor(def, sys, opts);   // T5a: what it lasts, from now (added again: afresh); 1.5.9 (es): opts.secs, the host's own word (an affliction's rolled Lasts), in its place
        if (had >= 0) { list[had].on = true; if (tA) list[had].t = tA; else delete list[had].t; }   // once per character: adding it again turns it back on
        else if (idx >= 0) return { ok: false, reason: 'value' };
        else if (list.length >= LIMITS.effectRows) return { ok: false, reason: 'field' };
        else { var nA = { id: rowId, ref: q.ref, on: true }; if (tA) nA.t = tA; list.push(nA); }
    } else if (q.op === 'adhoc') {
        if (idx >= 0 && list[idx].ref !== undefined) return { ok: false, reason: 'value' };
        var fk = vo.fields;
        if (opts.player) {   // every change must name a field the player can see
            fk = map(); (opts.view && Array.isArray(opts.view.fields) ? opts.view.fields : []).forEach(function(x) { fk[x.id] = x.kind; });
            var bad = (Array.isArray(q.row.mods) ? q.row.mods : []).some(function(m) { return !isObj(m) || typeof m.f !== 'string' || !fk[m.f]; });
            if (bad) return { ok: false, reason: 'value' };
        }
        var core = cleanEffectCore(q.row, fk);
        var nr = { id: rowId, name: core.name, icon: core.icon, tone: core.tone, dur: core.dur, notes: core.notes, on: q.row.on !== false, mods: core.mods };
        var tH = idx >= 0 && list[idx].dur === core.dur && isObj(list[idx].t) ? list[idx].t : fxTimerFor(core, sys, opts); if (tH) nr.t = tH;   // T5a: a new row (or a changed duration) starts its timer; an edit keeps it
        if (idx >= 0) list[idx] = nr; else if (list.length >= LIMITS.effectRows) return { ok: false, reason: 'field' }; else list.push(nr);
    } else if (q.op === 'timer') {   // Turn-based combat T5b (D9): pause (what is left is held), resume (from now, or stopped in a combat), reset (its full time again), dismiss (no countdown: it stays until ended)
        if (idx < 0 || typeof q.act !== 'string' || FX_TIMER_ACTS[q.act] !== 1) return { ok: false, reason: idx < 0 ? 'missing' : 'value' };
        var rwT = list[idx], tT = isObj(rwT.t) ? rwT.t : null, nowT = typeof opts.now === 'number' ? opts.now : 0, defT = null;
        if (typeof rwT.ref === 'string') (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (d && d.id === rwT.ref) defT = d; });
        if (q.act === 'pause') { if (!tT || tT.p === 1) return { ok: false, reason: 'value' }; rwT.t = { left: Math.max(0, fxLeftNow(tT, nowT)), at: 0, p: 1 }; }
        else if (q.act === 'resume') { if (!tT || tT.p !== 1) return { ok: false, reason: 'value' }; rwT.t = { left: tT.left, at: opts.inCombat ? 0 : Math.max(0, Math.floor(nowT)) }; }
        else if (q.act === 'reset') { var fullT = lastsSecs(defT || rwT, sys); if (!(fullT > 0)) return { ok: false, reason: 'value' }; rwT.t = { left: fullT, at: (tT && tT.p === 1) || opts.inCombat ? 0 : Math.max(0, Math.floor(nowT)) }; if (tT && tT.p === 1) rwT.t.p = 1; }
        else { if (!tT) return { ok: false, reason: 'value' }; delete rwT.t; }
    } else if (q.op === 'on') {
        if (idx < 0 || typeof q.on !== 'boolean') return { ok: false, reason: idx < 0 ? 'missing' : 'value' };
        list[idx].on = q.on;
    } else {   // remove
        if (idx < 0) return { ok: false, reason: 'missing' };
        list.splice(idx, 1);
    }
    var value = cleanValue(f, list, vo); if (value === undefined) return { ok: false, reason: 'value' };
    var clamp = null;
    if (F) {   // a max this change lowered: a current value above it comes down with it — a whole number, at least the field's min
        var after = { id: char.id, values: Object.assign({}, char.values || {}) }; after.values[fieldId] = value;
        var rv = makeResolver(sys, after, F), rb = makeResolver(sys, char, F);
        sys.fields.forEach(function(rf) {
            if (rf.kind !== 'resource') return;
            var st = char.values ? char.values[rf.id] : undefined; if (!isObj(st) || typeof st.cur !== 'number') return;
            var mx = rv(rf.key + '.max'), mb = rb(rf.key + '.max');
            if (!fin(mx) || !(typeof mb === 'number' && mx < mb) || st.cur <= mx) return;
            var to = Math.floor(mx); if (fin(rf.min) && to < rf.min) to = rf.min;
            if (fin(to) && to < st.cur) { clamp = clamp || {}; clamp[rf.id] = { cur: to }; }
        });
    }
    return clamp ? { ok: true, value: value, clamp: clamp } : { ok: true, value: value };
}
// 5h: a player's effects change off the wire — shape only; the system's rules are applyEffectOp's
function cleanCharEffect(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId) || typeof msg.fieldId !== 'string' || !FIELD_ID.test(msg.fieldId) || !FX_OPS[msg.op]) return null;
    var q = { rid: msg.rid, charId: msg.charId, fieldId: msg.fieldId, op: msg.op };
    if (msg.op === 'adhoc') {
        if (!isObj(msg.row) || typeof msg.row.id !== 'string' || !FXROW_ID.test(msg.row.id)) return null;
        var mods = Array.isArray(msg.row.mods) ? msg.row.mods.slice(0, LIMITS.effectMods).map(function(m) { return isObj(m) ? { f: typeof m.f === 'string' ? m.f.slice(0, 40) : '', op: m.op === 'on' ? 'on' : 'add', v: Number(m.v), part: m.part === 'max' ? 'max' : undefined, key: m.op !== 'on' && m.part !== 'max' && rowModAim(m) ? m.key : undefined, col: m.op !== 'on' && m.part !== 'max' && rowModAim(m) ? m.col : undefined } : null; }) : [];
        q.row = { id: msg.row.id, name: str(msg.row.name, LIMITS.name), icon: str(msg.row.icon, 32), tone: msg.row.tone === 'buff' || msg.row.tone === 'debuff' ? msg.row.tone : '', dur: str(msg.row.dur, 200), notes: str(msg.row.notes, LIMITS.text), on: msg.row.on !== false, mods: mods };
        return q;
    }
    if (typeof msg.rowId !== 'string' || !FXROW_ID.test(msg.rowId)) return null; q.rowId = msg.rowId;
    if (msg.op === 'add') { if (typeof msg.ref !== 'string' || !EFFECT_ID.test(msg.ref)) return null; q.ref = msg.ref; }
    if (msg.op === 'on') { if (typeof msg.on !== 'boolean') return null; q.on = msg.on; }
    if (msg.op === 'timer') { if (typeof msg.act !== 'string' || FX_TIMER_ACTS[msg.act] !== 1) return null; q.act = msg.act; }   // T5b
    return q;
}
// The item def a token/character would throw, by id (host reads area.ft from here, never from the wire). Null if absent.
function itemDef(sys, defId) { var a = Array.isArray(sys && sys.items) ? sys.items : []; for (var i = 0; i < a.length; i++) if (a[i].id === defId) return a[i]; return null; }

/* ---------- the auto layout (SB2): one section per kind group, then the rolls ---------- */
// Stage 6 look fold (L3): the fields the header block edits in place — identity rows that are text, a select, a number or a toggle, and
// ledger numbers without value names (editable there since Stage 5d). Such a field needs no second copy in a section. A prototype-free set.
var IDN_EDIT_KINDS = Object.freeze({ text: 1, select: 1, number: 1, toggle: 1 });
function headerEdits(sys, lay) {   // lay: a layout (the HUD passes sys.sheet.hud); absent → the sheet's
    var out = map(); if (!sys || !Array.isArray(sys.fields)) return out;
    var Ly = lay === undefined ? sys.sheet : lay; if (!isObj(Ly)) return out;
    var byId = map(); sys.fields.forEach(function(f) { if (isObj(f) && typeof f.id === 'string') byId[f.id] = f; });
    (Array.isArray(Ly.identity) ? Ly.identity : []).forEach(function(q) { var f = isObj(q) && typeof q.id === 'string' ? byId[q.id] : null; if (f && IDN_EDIT_KINDS[f.kind] === 1) out[f.id] = 1; });
    (Array.isArray(Ly.ledger) ? Ly.ledger : []).forEach(function(q) { var f = isObj(q) && typeof q.id === 'string' ? byId[q.id] : null; if (f && f.kind === 'number' && !(Array.isArray(f.labels) && f.labels.length)) out[f.id] = 1; });
    return out;
}
function autoLayout(sys) {
    var groups = [['number', 'Attributes'], ['formula', 'Derived'], ['resource', 'Resources'], ['skill', 'Skills'], ['toggle', 'Conditions'], ['item-list', 'Items'], ['effects', 'Effects'], ['text', 'Details'], ['select', 'Details'], ['notes', 'Notes']];
    var secs = [], byTitle = map();
    var inHeader = headerEdits(sys);   // Stage 6: a field the header edits is never placed a second time
    groups.forEach(function(g) {
        sys.fields.forEach(function(f) {
            if (f.kind !== g[0] || inHeader[f.id] === 1) return;
            var s = byTitle[g[1]]; if (!s) { s = byTitle[g[1]] = { id: 's_auto_' + g[1].toLowerCase(), title: g[1], cols: g[0] === 'notes' || g[0] === 'item-list' || g[0] === 'effects' ? 1 : g[0] === 'toggle' ? 4 : g[0] === 'skill' ? 2 : 3, fields: [] }; secs.push(s); }
            s.fields.push({ id: f.id, w: f.kind === 'notes' || f.kind === 'item-list' || f.kind === 'effects' ? 'row' : 1 });
        });
    });
    if (sys.rolls.length) secs.push({ id: 's_auto_rolls', title: 'Rolls', cols: 3, fields: sys.rolls.map(function(r) { return { roll: r.id, w: 1 }; }) });
    return { sections: secs };
}

// Stage 6 U2: a player's sheet upload on the wire — { rid, charId, sheet }: a plain object of at most LIMITS.uploadBytes as JSON once its
// portrait is dropped (the token's art is the portrait); null for anything else. The sheet is only ever read by a reader (its own cleaners)
function cleanCharUpload(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId) || !isObj(msg.sheet)) return null;
    var s = null; try { var sh = Object.assign({}, msg.sheet); delete sh.portrait; delete sh.picture; s = JSON.stringify(sh); } catch (e) { return null; }
    if (typeof s !== 'string' || s.length > LIMITS.uploadBytes) return null;
    return { rid: msg.rid, charId: msg.charId, sheet: JSON.parse(s) };
}
// U2: the GM's queue of uploads to review (camp.uploads: the GM's, never sent; a save or an import may carry anything) as the review reads it —
// at most LIMITS.uploads, each { id, charId, from, name, at, changes, reader? } with its changes' texts cut and their shapes checked; applying
// still goes through each change's own cleaner (applyProposal). reader: the id of the outside reader that made it, which Apply needs
var UP_KINDS = Object.freeze({ value: 1, add: 1, fact: 1, stat: 1, def: 1, remove: 1 });
function cleanUploads(v) {
    var out = [], seen = map();
    (Array.isArray(v) ? v : []).slice(-LIMITS.uploads).forEach(function(u) {
        if (!isObj(u) || typeof u.id !== 'string' || !/^up_[a-z0-9]{1,24}$/.test(u.id) || seen[u.id] || typeof u.charId !== 'string' || !CHAR_ID.test(u.charId)) return; seen[u.id] = 1;
        var ch = [], cs = map();
        (Array.isArray(u.changes) ? u.changes : []).slice(0, LIMITS.uploadChanges).forEach(function(c) {
            if (!isObj(c) || typeof c.id !== 'string' || !/^u_[a-z0-9]{1,8}$/.test(c.id) || cs[c.id] || UP_KINDS[c.kind] !== 1 || typeof c.f !== 'string' || !FIELD_ID.test(c.f)) return; cs[c.id] = 1;
            var o = { id: c.id, kind: c.kind, f: c.f, label: cutText(c.label, 120) || 'A change', from: cutText(c.from, 80), to: cutText(c.to, 80), accept: c.accept === true, held: c.held === true };
            if (typeof c.row === 'string' && ROW_ID.test(c.row)) o.row = c.row;
            if (c.kind === 'value' && c.value !== undefined) o.value = c.value;
            if (c.kind === 'add' && Array.isArray(c.ops)) o.ops = c.ops.slice(0, 16).filter(isObj);
            if (c.kind === 'fact') { if (isObj(c.facts)) o.facts = c.facts; if (typeof c.qty === 'number' && fin(c.qty)) o.qty = c.qty; }
            if (c.kind === 'stat' && isObj(c.ov)) o.ov = c.ov;
            if (c.kind === 'def' && isObj(c.def)) o.def = c.def;
            if (c.kind === 'def' && typeof c.twin === 'string' && ITEM_ID.test(c.twin)) o.twin = c.twin;   // F11b: the entry a twin's changes are set from, on the host (an add's rides on its op)
            ch.push(o);
        });
        var uo = { id: u.id, charId: u.charId, from: typeof u.from === 'string' ? u.from.slice(0, 80) : '', name: cutText(u.name, 60) || 'A player', at: fin(u.at) ? u.at : 0, changes: ch };
        if (typeof u.reader === 'string' && READER_ID.test(u.reader)) uo.reader = u.reader;
        if (u.rev === true) uo.rev = true;   // 1.6.0 (backlog 190): a new sheet for an out-of-date character: applying it makes the character current
        if (u.ask === true) uo.ask = true;   // 1.5.5: a player's asks for their copies' stats (statAsk), one entry a character, never replaced by a sheet update
        out.push(uo);
    });
    return out;
}
// 1.5.5 (the owner at the table, 2026-10-18, of a player's own copy's stats: "lets allow it, but i approve the change after review"): under the
// list rule statsAsk a player's change of the stats of their own copy of an entry is not made. It comes back as ONE line of the GM's Review, an
// upload's stat change, which the GM's hand makes once it is ticked and applied; nothing of the character changes here. A player may ask about a
// copy on a list they may change (seen by players, owner-edited or the character open) of an entry they may see: an item of their own view of
// the system, or a library entry opts.shown says players may see. A stat must be one of the list's, a choice one of their own view's labels, a
// number a number, null the entry's own figure again. A stat the GM set (held) is offered unticked, marked as the GM's. { ok, change } (the change
// has no id yet), { ok: false, reason: 'same' } where the stats asked for are what the row reads already, or { ok: false, reason }
function statAsk(sys, char, fieldId, rowId, stats, F, opts) {
    opts = isObj(opts) ? opts : {};
    if (!isObj(sys) || !Array.isArray(sys.fields) || !isObj(sys.listRules) || sys.listRules.statsAsk !== true) return { ok: false, reason: 'field' };
    if (!isObj(char) || !isObj(stats) || typeof rowId !== 'string' || !ROW_ID.test(rowId)) return { ok: false, reason: 'value' };
    var keys = Object.keys(stats); if (!keys.length || keys.length > LIMITS.listStats) return { ok: false, reason: 'value' };
    var f = typeof fieldId === 'string' ? fieldById(sys, fieldId) : null; if (!f || f.kind !== 'item-list' || !isObj(f.list)) return { ok: false, reason: 'field' };
    if (f.vis !== 'all' || (f.edit !== 'owner' && !openChar(char))) return { ok: false, reason: 'field' };
    var list = isObj(char.values) && Array.isArray(char.values[fieldId]) ? char.values[fieldId] : [], rw = null;
    list.forEach(function(r) { if (!rw && isObj(r) && rowIdOf(r) === rowId) rw = r; });
    if (!rw || rw.hid === 1) return { ok: false, reason: 'missing' };   // a kept curse reads as gone to a player
    if (typeof rw.defId !== 'string') return { ok: false, reason: 'field' };   // a row of their own is theirs to change: an ask is for a copy's
    if (!(valueOpts(opts.view || null).items[rw.defId] === 1 || (typeof opts.shown === 'function' && opts.shown(rw.defId) === true))) return { ok: false, reason: 'missing' };   // never an entry kept from players
    var spec = f.list, asp = actorSpec(sys, fieldId, spec, Object.assign({}, opts, { player: true })) || spec, held = isObj(rw.ov) && Array.isArray(rw.ov.held) ? rw.ov.held.map(function(h) { return lower(String(h)); }) : [], heldAny = false;
    for (var i = 0; i < keys.length; i++) {
        var st = statDefOf(spec, keys[i]), v = stats[keys[i]]; if (!st || !statDefOf(asp, keys[i])) return { ok: false, reason: 'value' };   // a stat of the list as they see it
        if (v !== null && (st.kind === 'pick' ? !pickLabel(asp, st.key, v) : statNum(v) === undefined)) return { ok: false, reason: 'value' };
        if (held.indexOf(lower(st.key)) >= 0) heldAny = true;
    }
    var r = applyRowOp(sys, char, fieldId, { op: 'ov', rowId: rowId, ov: { stats: stats } }, F, {});   // what the GM's hand would make of it
    if (!r || !r.ok) return { ok: false, reason: r && typeof r.reason === 'string' ? r.reason : 'value' };
    var nw = null; (Array.isArray(r.value) ? r.value : []).forEach(function(x) { if (!nw && isObj(x) && rowIdOf(x) === rowId) nw = x; });
    var d0 = rowDef(sys, rw), d1 = nw ? rowDef(sys, nw) : null; if (!d0 || !d1) return { ok: false, reason: 'missing' };
    var seen = function(row) { var ovP = cleanOv(row.ov, asp), dP = rowDef(sys, Object.assign({}, row, { ov: ovP || undefined })); return { stats: (dP && rowStats(dP.def.stats, asp)) || {} }; }, p0 = seen(rw), p1 = seen(nw);   // the row as the owner's own copy reads it: a choice kept from players, set on the copy or held by the entry, reads as theirs does, so the answer never tells that one is set
    var fr = [], to = [], show = function(st, v) { return typeof v === 'number' ? fmtNum(v) : typeof v === 'string' && v ? v : st && st.kind === 'pick' ? '\u2014' : '0'; };
    keys.forEach(function(k) { var st = statDefOf(spec, k), lb = st ? (st.label || st.key) : k, x = rowStat(spec, d0.def, k), y = rowStat(spec, d1.def, k); if (JSON.stringify(rowStat(asp, p0, k)) === JSON.stringify(rowStat(asp, p1, k))) return; fr.push(lb + ' ' + show(st, x)); to.push(lb + ' ' + show(st, y)); });
    if (!fr.length) return { ok: false, reason: 'same' };
    return { ok: true, change: { kind: 'stat', f: fieldId, row: rowId, label: cutText((f.label || f.key) + ': ' + (d0.def.name || 'Item'), 120), from: cutText(fr.join(', '), 80), to: cutText(to.join(', '), 80), ov: { stats: stats }, accept: !heldAny, held: heldAny } };
}
// An OUTSIDE SHEET READER (2026-10-18): a module of the GM's own, kept beside the app and never shipped with it, may read a sheet file made
// elsewhere. It registers here (registerReader) and is asked through readerFor; while none is registered Waypoint reads Waypoint's own
// character files alone. A reader is { id, name, claims(json), fill(json, view, F, find), propose(sys, char, json, F, find), rowOp(sys, char,
// fieldId, q, F, opts), writeBack?, facing?, ui? }: claims says whether a file is one it reads; fill makes a fill for fillMaking (a character in
// the making); propose makes the proposed changes the GM reviews (an upload); rowOp is the row op its fills and proposals go through. ui is
// the reader's own page code, which the sheet and the map ask through typeof. readerKit hands a reader the internals it reads by
var READER_ID = /^[a-z]{1,12}$/, READER_FNS = ['claims', 'fill', 'propose', 'rowOp'], _readers = [];
function readerKit() {
    return Object.freeze({ LIMITS: LIMITS, STORED: STORED, NUMERIC: NUMERIC, ITEM_ID: ITEM_ID, isObj: isObj, fin: fin, map: map, lower: lower, hasOwn: hasOwn, cutText: cutText, fmtNum: fmtNum,
        cleanFieldUnit: cleanFieldUnit, readMeasure: readMeasure, measureInches: measureInches, lvlClamp: lvlClamp, cleanItemKey: cleanItemKey, fieldById: fieldById, keyIndex: keyIndex,
        cleanValue: cleanValue, valueOpts: valueOpts, rowIdOf: rowIdOf, rowStat: rowStat, catIn: catIn, rowDef: rowDef, ownStats: ownStats, applyRowOp: applyRowOp, statDefOf: statDefOf,
        pickLabel: pickLabel, keyClash: keyClash, storedOf: storedOf, cleanItemMods: cleanItemMods, fieldKinds: fieldKinds, POSTURE_IDS: POSTURE_IDS, cleanThreats: cleanThreats,
        makeResolver: makeResolver, itemDef: itemDef, applyProposal: applyProposal, libFinder: function() { return _libFind; } });
}
// A reader whose id is a few small letters, a name of 40 characters at most and the four functions; one of the same id is replaced. true or false
function registerReader(r) {
    if (!isObj(r) || typeof r.id !== 'string' || !READER_ID.test(r.id) || typeof r.name !== 'string' || !r.name.trim() || r.name.trim().length > 40) return false;
    if (READER_FNS.some(function(k) { return typeof r[k] !== 'function'; })) return false;
    var o = { id: r.id, name: r.name.trim() };
    READER_FNS.concat(['writeBack', 'facing']).forEach(function(k) { if (typeof r[k] === 'function') o[k] = r[k]; });
    if (isObj(r.ui)) o.ui = r.ui;
    _readers = _readers.filter(function(x) { return x.id !== o.id; }).concat([Object.freeze(o)]);
    return true;
}
function dropReader(id) { var n = _readers.length; _readers = _readers.filter(function(x) { return x.id !== id; }); return _readers.length !== n; }
function readers() { return Object.freeze(_readers.slice()); }
function readerById(id) { var out = null; if (typeof id === 'string') _readers.forEach(function(x) { if (!out && x.id === id) out = x; }); return out; }
// The first reader that claims a file (one whose claims throws claims nothing); never for a Waypoint character file
function readerFor(json) {
    if (!isObj(json) || json.format === 'waypoint-character') return null;
    for (var i = 0; i < _readers.length; i++) { var ok = false; try { ok = _readers[i].claims(json) === true; } catch (e) { ok = false; } if (ok) return _readers[i]; }
    return null;
}
// U1: the accepted changes of a proposal (a player's upload, or the GM's own file) applied to a copy of the character, each through its own
// cleaner (cleanValue, and a row op with the GM's rights): { values, done, failed }. accepted: change id -> true (the GM's ticks). opts
// (U2): applyRowOp's rights (absent: the GM's; setting B passes the owner's own) and rowOp, the row op of the reader that made the proposal
// (absent: applyRowOp, a reader's own mark on an op taken off)
function plainRowOp(sys, char, fieldId, q, F, opts) { if (isObj(q) && q.twin !== undefined) { q = JSON.parse(JSON.stringify(q)); delete q.twin; } return applyRowOp(sys, char, fieldId, q, F, opts); }
function applyProposal(sys, char, proposal, accepted, F, opts) {
    var ro = isObj(opts) ? Object.assign({}, opts) : {}, rowOp = typeof ro.rowOp === 'function' ? ro.rowOp : plainRowOp; delete ro.rowOp;
    var work = { id: char.id, name: char.name, ownerId: char.ownerId, npc: char.npc, values: JSON.parse(JSON.stringify(isObj(char.values) ? char.values : {})) }, done = 0, failed = 0, vo = valueOpts(sys);
    (isObj(proposal) && Array.isArray(proposal.changes) ? proposal.changes : []).forEach(function(ch) {
        if (!isObj(ch) || !isObj(accepted) || accepted[ch.id] !== true) return;
        var f = fieldById(sys, ch.f); if (!f) { failed++; return; }
        if (ch.kind === 'value') { var v = cleanValue(f, ch.value, vo); if (v === undefined) { failed++; return; } work.values[ch.f] = v; done++; return; }
        var qs = ch.kind === 'add' ? (Array.isArray(ch.ops) ? ch.ops : []) : ch.kind === 'fact' ? (isObj(ch.facts) ? [{ op: 'set', rowId: ch.row, facts: ch.facts }] : []).concat(ch.qty ? [{ op: 'setQty', rowId: ch.row, qty: ch.qty }] : [])
            : ch.kind === 'stat' ? [{ op: 'ov', rowId: ch.row, ov: ch.ov }] : ch.kind === 'def' ? [typeof ch.twin === 'string' ? { op: 'custom', rowId: ch.row, def: ch.def, twin: ch.twin } : { op: 'custom', rowId: ch.row, def: ch.def }] : ch.kind === 'remove' ? [{ op: 'remove', rowId: ch.row }] : [];
        var ok = qs.length > 0, before = work.values[ch.f];
        qs.forEach(function(q) { if (!ok) return; var r = rowOp(sys, work, ch.f, q, F, ro); if (r.ok) work.values[ch.f] = r.value; else ok = false; });
        if (ok) done++; else { work.values[ch.f] = before; failed++; }   // a change is all or nothing
    });
    return { values: work.values, done: done, failed: failed };
}
// Onboarding F4 (owner, 2026-09-27): a file fills a character in the making at once, with its owner's rights — past the list rules while making
// (a library copy's own name and stats, rows of their own on any list), never the GM's fields (a blast, formulas, locks, vis: CUSTOM_OWN; a
// copy's name and stats only; the list's own stats). fill = { values: { fieldId: value }, lists: [fieldId] (the lists the file carries: replaced,
// a kept curse stays), ops: [{ f, q }] (applyRowOp, a row's ops together: all or nothing, but a copy's own values, a fact or a count drop alone,
// and a key taken leaves the row without it), fxLists: [fieldId] (emptied), fx: [{ f, q }] (applyEffectOp) }; pools last (their max read with the
// rows and changes in place). opts: applyRowOp's (view, lib) and now. { ok, values, done, left } — counts only; not in the making: { ok: false }.
// fill.looks: { fieldId: a look record } for the texts in fill.values (item 35); the answer then holds looks, the character's looks after the fill.
// opts.rowOp: the row op of the reader that made the fill (absent: applyRowOp)
function fillMaking(sys, char, fill, F, opts) {
    if (!isObj(sys) || !Array.isArray(sys.fields) || !isObj(char) || openChar(char) !== 'making' || !isObj(fill)) return { ok: false, reason: 'notmaking' };
    var rowOp = isObj(opts) && typeof opts.rowOp === 'function' ? opts.rowOp : plainRowOp;
    opts = Object.assign({}, isObj(opts) ? opts : {}, { player: true, fill: true }); delete opts.rowOp;
    var work = { id: char.id, name: char.name, ownerId: char.ownerId, npc: false, making: 1, values: JSON.parse(JSON.stringify(isObj(char.values) ? char.values : {})) }, done = 0, left = 0;
    var mine = function(fid, kind) { var f = typeof fid === 'string' ? fieldById(sys, fid) : null; return f && f.kind === kind && f.vis === 'all' ? f : null; };   // making: every visible field is theirs (D3)
    var vals = isObj(fill.values) ? fill.values : {}, pools = [], lkIn = isObj(fill.looks) ? fill.looks : null, wrote = [];
    Object.keys(vals).slice(0, LIMITS.fields).forEach(function(fid) {
        var f = fieldById(sys, fid); if (!f || f.kind === 'item-list' || f.kind === 'effects') { left++; return; }   // rows and effects go by their own ops
        if (f.kind === 'resource') { pools.push(fid); return; }
        var r = applyEdit(sys, work, fid, vals[fid], F, opts); if (r.ok) { work.values[fid] = r.value; done++; if (lkIn && hasOwn(lkIn, fid)) wrote.push(fid); } else left++;
    });
    (Array.isArray(fill.lists) ? fill.lists : []).forEach(function(fid) { if (mine(fid, 'item-list')) work.values[fid] = (Array.isArray(work.values[fid]) ? work.values[fid] : []).filter(function(r) { return isObj(r) && r.hid === 1; }); });
    var groups = [], at = map(), per = map();
    (Array.isArray(fill.ops) ? fill.ops : []).forEach(function(o) { if (!isObj(o) || typeof o.f !== 'string' || !isObj(o.q) || typeof o.q.rowId !== 'string') return; var k = o.f + '|' + o.q.rowId; if (!at[k]) { at[k] = { f: o.f, ops: [] }; groups.push(at[k]); } at[k].ops.push(o.q); });
    groups.forEach(function(g) {
        var f = mine(g.f, 'item-list'); if (!f) { left++; return; }
        per[g.f] = (per[g.f] | 0) + 1; if (per[g.f] > LIMITS.carried) { left++; return; }   // no list holds more rows: the rest never reach applyRowOp (a file cannot keep the host busy)
        var aspec = actorSpec(sys, g.f, isObj(f.list) ? f.list : null, opts), keys = map(); (aspec && Array.isArray(aspec.stats) ? aspec.stats : []).forEach(function(s) { if (isObj(s) && typeof s.key === 'string') keys[lower(s.key)] = s.key; });
        var listStats = function(st) { var o = {}; if (isObj(st)) Object.keys(st).forEach(function(k) { if (Object.prototype.hasOwnProperty.call(st, k) && keys[lower(k)]) o[keys[lower(k)]] = st[k]; }); return Object.keys(o).length ? o : null; };
        var before = work.values[g.f], ok = true;
        g.ops.forEach(function(q0) {
            if (!ok) return;
            var q = JSON.parse(JSON.stringify(q0));
            if (q.op === 'custom' && isObj(q.def)) { var d = {}; Object.keys(q.def).forEach(function(k) { if (CUSTOM_OWN[k] === 1) d[k] = q.def[k]; }); var s2 = listStats(d.stats); if (s2) d.stats = s2; else delete d.stats; q.def = d; }   // the players' fields; the list's own stats
            if (q.op === 'ov') { var p = {}; if (isObj(q.ov) && typeof q.ov.name === 'string') p.name = q.ov.name; var s3 = listStats(isObj(q.ov) ? q.ov.stats : null); if (s3) p.stats = s3; if (!Object.keys(p).length || (p.name === undefined && Object.keys(p.stats).every(function(k) { return p.stats[k] === null; }))) return; q.ov = p; }   // a patch that states nothing — none of the list's stats, or each of them null, the entry's own (the bridge writes a ranged weapon's range so) — changes no row a fill made: passed over, never counted as left out
            if (q.op === 'set' && isObj(q.facts) && q.facts.ct !== undefined) { var ctc = cleanCt(q.facts.ct, aspec); if (ctc) q.facts.ct = ctc; else delete q.facts.ct; if (!Object.keys(q.facts).length) return; }   // the list's own counters
            if (q.op === 'add' && q.name === undefined && typeof q.defId === 'string') {   // 1.6.0: a copy held again under a name of its own comes back as a row of its own, never as one more of the copy before it
                var nmA = null; g.ops.forEach(function(o2) { if (!nmA && isObj(o2) && o2.op === 'ov' && isObj(o2.ov) && typeof o2.ov.name === 'string' && o2.ov.name.trim()) nmA = o2.ov.name; });
                var dA = nmA ? rowDef(sys, { defId: q.defId }) : null;
                if (dA && isObj(dA.def) && dA.def.again === 'name' && (Array.isArray(work.values[g.f]) ? work.values[g.f] : []).some(function(x) { return isObj(x) && x.defId === q.defId && x.hid !== 1; })) { q.name = nmA; g.agName = nmA; }
            }
            if (q.op === 'ov' && g.agName && isObj(q.ov) && q.ov.name === g.agName) { delete q.ov.name; if (!Object.keys(q.ov).length) return; }   // its name came with the add
            var r = rowOp(sys, work, g.f, q, F, opts);
            if (!r.ok && q.op === 'custom' && (r.why === 'badkey' || r.why === 'key') && isObj(q.def) && q.def.key !== undefined) { delete q.def.key; r = rowOp(sys, work, g.f, q, F, opts); }   // a key taken: the row without it
            if (!r.ok && q.op === 'set' && isObj(q.facts) && Object.keys(q.facts).length > 1) {   // one bad fact never takes the others: each alone
                var bad1 = false; Object.keys(q.facts).forEach(function(k) { var one = {}; one[k] = q.facts[k]; var r1 = applyRowOp(sys, work, g.f, { op: 'set', rowId: q.rowId, facts: one }, F, opts); if (r1.ok) work.values[g.f] = r1.value; else bad1 = true; });
                if (bad1) left++; return;
            }
            if (r.ok) { work.values[g.f] = r.value; return; }
            if (q.op === 'ov' || q.op === 'set' || q.op === 'setQty') { left++; return; }   // a copy's own values, a fact, a count: the row stays without them (counted)
            ok = false;
        });
        if (ok) done++; else { work.values[g.f] = before; left++; }
    });
    (Array.isArray(fill.fxLists) ? fill.fxLists : []).forEach(function(fid) { if (mine(fid, 'effects')) work.values[fid] = []; });
    (Array.isArray(fill.fx) ? fill.fx : []).slice(0, LIMITS.effectRows * 2).forEach(function(o) {
        if (!isObj(o) || typeof o.f !== 'string' || !isObj(o.q)) { left++; return; }
        var r = applyEffectOp(sys, work, o.f, o.q, F, opts); if (r.ok) { work.values[o.f] = r.value; if (o.q.op !== 'on') done++; } else left++;
    });
    pools.forEach(function(fid) { var r = applyEdit(sys, work, fid, vals[fid], F, opts); if (r.ok) { work.values[fid] = r.value; done++; } else left++; });
    // Item 35: the looks of the texts. A look the file gives a text this fill WROTE stands in for the character's own, and every look is then
    // cleaned against the value AS KEPT, by its field's own rule (cleanLooks): a fill that changes a text ends its old look.
    // `looks` is in the answer only when one is left; the counts say nothing of looks
    var grHave = map(); itemListIds(sys).forEach(function(fid) { (Array.isArray(work.values[fid]) ? work.values[fid] : []).forEach(function(r) { var id = rowIdOf(r); if (id) grHave[id] = 1; }); });   // 1.6.0 (v2, B4): a granted row whose granting row the file did not bring is an ordinary row
    itemListIds(sys).forEach(function(fid) { (Array.isArray(work.values[fid]) ? work.values[fid] : []).forEach(function(r) { if (isObj(r) && typeof r.gr === 'string' && grHave[r.gr] !== 1) delete r.gr; }); });
    var lkAll = {}, lkOld = isObj(char.looks) ? char.looks : null;
    if (lkOld) Object.keys(lkOld).forEach(function(k) { lkAll[k] = lkOld[k]; });
    wrote.forEach(function(fid) { lkAll[fid] = lkIn[fid]; });   // (cleaned just below with the rest: one that does not clean leaves no look for its text, the old one neither)
    var lkOut = cleanLooks(lkAll, work.values, sys), res = { ok: true, values: work.values, done: done, left: left };
    if (lkOut) res.looks = lkOut;
    return res;
}
// [systemcheck:sheetrev-start]
// 1.6.0, backlog 190 (the owner, 2026-10-27: "we do need a general contingency for if a gm changes their system in a campaign where people have
// characters and it changes how those characters function or makes their sheet incompatible with the system"; by prompt: "Next, before R4 and
// R5", and while out of date "Also chat and read pages"). A system may carry a sheet revision (sheetRev, a whole number 1 to 1e6; absent: 0),
// raised when its characters need new sheets; a character carries the revision it was last made current at (its own sheetRev; absent: 0). A
// player's character below the system's revision is OUT OF DATE (charStale): never an NPC, one with no player or one in the making (a sheet
// made now is made under this system). staleOf: a player's characters that are. The host holds such a player: chat and pages, and a new sheet
// sent for review, are all they can do until the GM approves one or marks the character current
function cleanSheetRev(v) { return typeof v === 'number' && isFinite(v) && v >= 1 && v <= 1e6 && Math.floor(v) === v ? v : undefined; }
function sheetRevOf(sys) { return isObj(sys) ? (cleanSheetRev(sys.sheetRev) || 0) : 0; }
function charStale(sys, c) {
    var r = sheetRevOf(sys);
    return r > 0 && isObj(c) && c.npc !== true && typeof c.ownerId === 'string' && c.ownerId !== '' && c.making !== 1 && c.partial !== true && (cleanSheetRev(c.sheetRev) || 0) < r;
}
function staleOf(sys, chars, pid) {
    var out = []; if (!sheetRevOf(sys) || !isObj(chars) || typeof pid !== 'string' || !pid) return out;
    Object.keys(chars).forEach(function(k) { var c = chars[k]; if (isObj(c) && c.ownerId === pid && charStale(sys, c)) out.push(c); });
    return out;
}
// Waypoint's own character file for an OUT-OF-DATE character in play (the owner, of a system that changed: "otherwise waypoint files can be
// uploaded"): read as a fill of a character in the making would read it (fillMaking, its owner's rights, on a copy), and offered to the GM as
// one Review line a field that differs (a 'value' change). An effects list is play, not a sheet: never offered. On a list, the rows its player
// does not hold (a kept curse, a GM-only row) stay as they are. { changes, left } or null where nothing could be read
function revBrief(f, v) {
    if (v === undefined || v === null || v === '') return '—';
    if (Array.isArray(v)) return v.length + (v.length === 1 ? ' row' : ' rows');
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (typeof v === 'number') return fmtNum(v);
    if (typeof v === 'string') return cutText(v.replace(CTRL_RE_G, ' '), 60);
    return f && f.kind === 'resource' && isObj(v) && typeof v.cur === 'number' ? fmtNum(v.cur) : 'set';
}
function revProposal(sys, char, fill, F, opts) {
    if (!isObj(sys) || !Array.isArray(sys.fields) || !isObj(char) || !isObj(fill)) return null;
    var cp = JSON.parse(JSON.stringify(char)); cp.making = 1; delete cp.unlocked; delete cp.invited;
    var r = fillMaking(sys, cp, fill, F, opts); if (!r || !r.ok) return null;
    var vals = isObj(char.values) ? char.values : {}, ch = [], n = 0;
    sys.fields.forEach(function(f) {
        if (!f || !STORED[f.kind] || f.kind === 'effects' || f.vis !== 'all' || !hasOwn(r.values, f.id) || ch.length >= LIMITS.uploadChanges) return;
        var nv = r.values[f.id], ov = vals[f.id], lost = false;
        if (f.kind === 'item-list' && Array.isArray(nv)) {
            var named = map(); (Array.isArray(fill.ops) ? fill.ops : []).forEach(function(o) { if (isObj(o) && o.f === f.id && isObj(o.q) && typeof o.q.rowId === 'string') named[o.q.rowId] = 1; });
            lost = nv.filter(function(x) { return isObj(x) && x.hid !== 1; }).length < Object.keys(named).length;   // the file named rows this list could not place: offered unticked, said so   // the rows its player does not hold stay: a kept curse (fillMaking keeps it) and a GM-only row
            var mkOld = map(); (Array.isArray(ov) ? ov : []).forEach(function(x) { if (isObj(x) && x.mk === 1 && typeof x.defId === 'string') mkOld[x.defId] = 1; });   // 1.6.0 (v2, B5): the fill stands in for the making, so a row is marked made only where the character's own row of that entry was
            nv.forEach(function(x) { if (isObj(x) && x.mk === 1 && !(typeof x.defId === 'string' && mkOld[x.defId] === 1)) delete x.mk; });
            var have = map(); nv.forEach(function(x) { if (isObj(x)) have[rowIdOf(x)] = 1; });
            (Array.isArray(ov) ? ov : []).forEach(function(x) { if (!isObj(x) || have[rowIdOf(x)]) return; var d = rowDef(sys, x); if (x.hid === 1 || !d || !d.def || d.def.vis === 'gm') nv.push(x); });
        }
        if (JSON.stringify(nv) === JSON.stringify(ov)) return;
        if (f.kind === 'item-list' && Array.isArray(nv) && Array.isArray(ov)) { var noId = function(a) { return JSON.stringify(a.map(function(x) { if (!isObj(x)) return x; var o = Object.assign({}, x); delete o.id; if (o.on === (isObj(f.list) && isObj(f.list.on) && f.list.on.def === true)) delete o.on; return o; })); }; if (noId(nv) === noId(ov)) return; }   // a switch at the list's own default reads as none   // the same rows under the new ids a file gives them: no change
        ch.push({ id: 'u_' + (n++).toString(36), kind: 'value', f: f.id, label: cutText((f.label || f.key) + (lost ? ' (the file has rows it could not place: check before applying)' : ''), 120), from: revBrief(f, ov), to: revBrief(f, nv), value: nv, accept: !lost });
    });
    return { changes: ch, left: r.left | 0 };
}
// [systemcheck:sheetrev-end]
// Stage 6 F5b: a row roll for the GM's privacy checks — gm: the list or the row's item is GM-only (the roll stays the GM's); kept: a curse the GM keeps
// on while its owner sees it off (the GM's roll of it stays private); names: what its Row.*
// names read — a column as the list's name for it (gmDerivedNames sees its formula through the list) and the names its formula reads (gmEffectNames),
// a choice as its option's name — beside the roll's other names. Never throws; an unknown field or row reads gm (fail closed)
function rowRollNames(sys, char, fieldId, rowId, names, F, uDef) {   // uDef (1.6.0 Rolls unheld entries): an entry nobody holds, read as that definition
    var out = [], gm = false, kept = false, seen = map(), done = map(), push = function(n) { if (typeof n === 'string' && n && !seen[lower(n)]) { seen[lower(n)] = 1; out.push({ name: n }); } };
    try {
        var f = sys ? fieldById(sys, fieldId) : null; if (!f || f.kind !== 'item-list') return { gm: true, names: out };
        if (f.vis === 'gm') gm = true;
        var rows = storedOf(f, char), row = null; (Array.isArray(rows) ? rows : []).forEach(function(r) { if (!row && rowIdOf(r) === rowId) row = r; });
        if (isObj(uDef) && typeof uDef.id === 'string') row = { defId: uDef.id, qty: 0 };
        var rd = isObj(uDef) && row ? { def: uDef } : row ? rowDef(sys, row) : null; if (!rd || !rd.def || rd.def.vis === 'gm' || row.hid === 1) gm = true;
        kept = !!(row && row.keptOn === 1 && row.on === true);   // owed review F5b#2: its owner sees it off (never folded into gm: the owner's own roll must not turn private)
        var spec = isObj(f.list) ? f.list : {};
        var expand = function(ns) { (Array.isArray(ns) ? ns : []).forEach(function(n) {
            var nm = typeof n === 'string' ? n : (n && n.name); if (typeof nm !== 'string') return;
            var l = lower(nm); if (l.slice(0, 4) !== 'row.') { push(nm); return; }
            var w = l.slice(4), c = null, st = null;
            if (/^(round|fired)\.[^.]+$/.test(w)) {   // 1.5.9 Chambers from: a round's names — a GM-only round, or a round list only the GM sees, keeps the roll the GM's
                var chS = isObj(spec.chamber) ? chamberSrc(sys, spec) : null, rdN = row && Array.isArray(row.rd) ? row.rd : [], cpN = w.indexOf('fired.') === 0 && row && isObj(row.fd) ? row.fd : rdN[0], cdN = cpN ? rowDef(sys, cpN) : null;
                if (!chS || chS.vis === 'gm' || (cdN && cdN.def && cdN.def.vis === 'gm')) gm = true;
                return;
            }
            (Array.isArray(spec.cols) ? spec.cols : []).forEach(function(x) { if (!c && isObj(x) && lower(x.key) === w) c = x; });
            (Array.isArray(spec.stats) ? spec.stats : []).forEach(function(x) { if (!st && isObj(x) && lower(x.key) === w) st = x; });
            if (c) { push(f.key + '.' + c.key); if (!done[lower(c.key)] && typeof c.formula === 'string' && c.formula && F && F.names) { done[lower(c.key)] = 1; expand(F.names(c.formula)); } }   // each column once, however deep (owed review F5b#1: a list has up to LIMITS.listCols)
            else if (st && st.kind === 'pick' && rd) { var lb = rowStat(spec, rd.def, st.key); (st.opts || []).forEach(function(o) { if (lower(o.label) === lower(lb)) push(o.name); }); }
        }); };
        expand(names);
    } catch (e) { return { gm: true, kept: false, names: out }; }
    return { gm: gm, kept: kept, names: out };
}
// The names a roll used (the engine's breakdown.names) that belong to a GM-only field, by key or by a reserved suffix: a GM's public roll must not carry them
function gmOnlyNames(sys, names) {
    if (!sys || !Array.isArray(sys.fields) || !Array.isArray(names)) return [];
    var ix = keyIndex(sys), out = [], gmKs = gmEntryKeys(sys, sys.fields);
    names.forEach(function(n) {
        var l = lower(n && n.name || ''), f = ix[l]; if (!f && l.length > 3 && l.indexOf('on.') === 0) { l = l.slice(3); f = ix[l]; } if (!f) { var lbN = lower(linkBare(sys, ix, l)); if (lbN !== l) { l = lbN; f = ix[l]; } }   // 1.6.0: a linked sheet's name, judged as that name   // 1.6.0: On.<name>, the one it is used on, is judged as that name
        if (!f) { var dot = l.lastIndexOf('.'); if (dot > 0 && NAME_SUFFIX[l.slice(dot + 1)]) f = ix[l.slice(0, dot)]; }
        if (!f) { var sg = l.split('.'), lf = sg.length > 1 ? ix[sg[0]] : null; if (lf && lf.kind === 'item-list' && (lf.vis === 'gm' || (sg.length > 2 && gmKs[lower(lf.key)] && gmKs[lower(lf.key)][sg[1]] === 1))) f = { vis: 'gm' }; }   // F5a1: a GM-only list, L.<a GM-only entry's key> (critic 4)
        if (f && f.vis === 'gm') out.push(n.name);
    });
    return out;
}
// 5h: the names a roll used whose value a GM-only effect changed (directly or through what they read) — such a public roll stays private
function gmEffectNames(vars, names) {
    if (typeof vars !== 'function' || typeof vars.detail !== 'function' || !Array.isArray(names)) return [];
    var out = [];
    names.forEach(function(n) {
        if (!n || typeof n.name !== 'string') return;
        var d = vars.detail(n.name); if (!d) { try { vars(n.name); } catch (e) {} d = vars.detail(n.name); }   // worked out now if this resolver has not yet
        if (d && d.mods.concat(d.via).some(function(m) { return m.gm; })) out.push(n.name);
    });
    return out;
}
// The names a roll or a label read whose value is GM-only: a GM-only field, by key or a reserved suffix (as gmOnlyNames), or a visible one
// worked out from one, however deep — through its formula, a skill's base (the skill and .base; .ranks is stored) or a pool's max (.max, and
// the pool and .cur, full or not: such a pool is GM-only as a whole, gmPools). The players' view blanks such a value ("GM only") or drops it,
// so the GM's public roll must not show it. Worked back from the GM-only fields over each definition once (a visited set, linear in the fields,
// so a loop ends). The names as spelled, each once; never throws (fail closed: an error lists every name)
function gmDerivedNames(sys, F, names) {
    if (!sys || !Array.isArray(sys.fields) || !F || typeof F.names !== 'function' || !Array.isArray(names)) return [];
    var out = [], seen = map(), nameOf = function(n) { var s = typeof n === 'string' ? n : (n && typeof n.name === 'string' ? n.name : ''); s = /^on\./i.test(s) && s.length > 3 ? s.slice(3) : s; return linkBare(sys, null, s); };   // 1.6.0: a linked sheet's name too   // 1.6.0: On.<name> judged as that name
    var keep = function(n) { if (n && !seen[lower(n)]) { seen[lower(n)] = 1; out.push(n); } };
    try {
        var ix = keyIndex(sys), hot = map(), readBy = map(), queue = [], gmKs = gmEntryKeys(sys, sys.fields);
        var reads = function(name) {   // the field a name reads (the resolver's lookup) and whether its value is that field's definition worked out
            var l = lower(name), f = ix[l], sfx = '';
            if (!f) { var dot = l.lastIndexOf('.'); if (dot > 0 && NAME_SUFFIX[l.slice(dot + 1)]) { f = ix[l.slice(0, dot)]; sfx = l.slice(dot + 1); } }
            if (!f) { var sg = l.split('.'), lf = sg.length > 1 ? ix[sg[0]] : null; if (lf && lf.kind === 'item-list') { if (lf.vis === 'gm' || (sg.length > 2 && gmKs[lower(lf.key)] && gmKs[lower(lf.key)][sg[1]] === 1)) return { f: { id: '#gm', vis: 'gm' }, def: false }; return { f: { id: 'l#' + lower(lf.key), vis: 'all' }, def: true }; } }   // F5a1: a list's names are worked out from its columns (one node per list)
            if (!f) return null;
            var def = false;
            if (f.kind === 'formula') def = !sfx;   // a suffix on a formula is an unknown name
            else if (f.kind === 'skill') def = !sfx || sfx === 'base';
            else if (f.kind === 'resource') def = !sfx || sfx === 'max' || sfx === 'cur';   // the pool's value goes with its max, full or stored (the players' view drops the pool)
            return { f: f, def: def };
        };
        sys.fields.forEach(function(f) {
            var p = DEF_PROP[f.kind], text = p ? f[p] : null; if (f.vis === 'gm' || typeof text !== 'string' || !text) return;
            (F.names(text) || []).forEach(function(n) {
                var r = reads(nameOf(n)); if (!r) return;
                if (r.f.vis === 'gm') { if (!hot[f.id]) { hot[f.id] = 1; queue.push(f.id); } }
                else if (r.def) (readBy[r.f.id] = readBy[r.f.id] || []).push(f.id);
            });
        });
        sys.fields.forEach(function(f) {   // F5a1: a visible list's columns — reading a GM-only value makes the list's names derived from one; a choice's options too (owed review F5a2#1)
            if (f.kind !== 'item-list' || f.vis === 'gm' || !isObj(f.list)) return;
            var node = 'l#' + lower(f.key), edge = function(nm) { var r = reads(nm); if (!r) return; if (r.f.vis === 'gm') { if (!hot[node]) { hot[node] = 1; queue.push(node); } } else if (r.def) (readBy[r.f.id] = readBy[r.f.id] || []).push(node); };
            (Array.isArray(f.list.stats) ? f.list.stats : []).forEach(function(st) { if (isObj(st) && st.kind === 'pick') (Array.isArray(st.opts) ? st.opts : []).forEach(function(o) { if (isObj(o) && typeof o.name === 'string' && o.name) edge(o.name); }); });
            (Array.isArray(f.list.cols) ? f.list.cols : []).forEach(function(c) { if (!isObj(c) || typeof c.formula !== 'string' || !c.formula) return; (F.names(c.formula) || []).forEach(function(n) { edge(nameOf(n)); }); });
        });
        while (queue.length) (readBy[queue.shift()] || []).forEach(function(id) { if (!hot[id]) { hot[id] = 1; queue.push(id); } });
        names.forEach(function(n) { var nm = nameOf(n), r = nm ? reads(nm) : null; if (r && (r.f.vis === 'gm' || (r.def && hot[r.f.id]))) keep(nm); });
    } catch (e) { out = []; seen = map(); names.forEach(function(n) { keep(nameOf(n)); }); }
    return out;
}
// The visible pools that are GM-only because their max is (it reads a GM-only field, directly or through visible values): a set of field ids.
// The players' view drops them as it drops a GM-only field and a player's edit of one is refused, so nothing worked out from the hidden max
// (the host's clamp of an edit, a fill, damage from full, an effect's clamp) reaches a player. Fails closed: no engine, or an error, hides every pool
function gmPools(sys, F) {
    var out = map(); if (!sys || !Array.isArray(sys.fields)) return out;
    var asks = [], idOf = map();
    sys.fields.forEach(function(f) { if (isObj(f) && f.kind === 'resource' && f.vis !== 'gm' && typeof f.key === 'string') { asks.push({ name: f.key + '.max' }); idOf[lower(f.key) + '.max'] = f.id; } });
    if (!asks.length) return out;
    (F && typeof F.names === 'function' ? gmDerivedNames(sys, F, asks) : asks.map(function(a) { return a.name; })).forEach(function(n) { var id = idOf[lower(n)]; if (id) out[id] = 1; });
    return out;
}
// Senses S1: the fields as the GM's view cleans them (the GM-only ones too, one per id and key, in field order), for an analysis both views share
function gmViewFields(sys, F) {
    var out = [], seenId = map(), seenKey = map();
    (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (out.length >= LIMITS.fields) return;
        var c = cleanField(f, F, true); if (!c || seenId[c.id] || seenKey[lower(c.key)]) return;
        seenId[c.id] = 1; seenKey[lower(c.key)] = 1; out.push(c);
    });
    return out;
}
// Senses S1: the ids of the fields a player's resolver cannot read truthfully — a GM-only field, and any field whose value is worked out from
// a GM-only value at any depth (gmDerivedNames on its bare name: a formula, a skill through its base, a pool through its max as gmPools asks;
// through another formula, a GM-only list's row, a GM-only entry, a column or a choice). A visible list's own rows (a kept curse among them)
// are not secret: the resolver skips hidden rows on both sides. Pass the fields as the GM's view has them. Fails closed: no engine, or an
// error, makes every field secret
function secretFieldIds(sys, F) {
    var out = map(); if (!isObj(sys) || !Array.isArray(sys.fields)) return out;
    var asks = [], idOf = map();
    sys.fields.forEach(function(f) {
        if (!isObj(f) || typeof f.id !== 'string') return;
        if (typeof f.key !== 'string' || !f.key) { out[f.id] = 1; return; }   // a GM-only field is asked too: gmDerivedNames names it
        asks.push({ name: f.key }); idOf[lower(f.key)] = f.id;
    });
    if (asks.length) (F && typeof F.names === 'function' ? gmDerivedNames(sys, F, asks) : asks.map(function(a) { return a.name; })).forEach(function(n) { var id = idOf[lower(n)]; if (id) out[id] = 1; });
    return out;
}
// The system's initiative roll (the one flagged init) or null
function initRoll(sys) { if (!sys || !Array.isArray(sys.rolls)) return null; for (var i = 0; i < sys.rolls.length; i++) if (sys.rolls[i] && sys.rolls[i].init) return sys.rolls[i]; return null; }
// Initiative & turn order O1 (docs/TURN_ORDER_PLAN.md): a combat's rows by initiative, high to low; a new array. O2 (the owner's note: 3d6
// systems order by Basic Speed and roll only to settle ties, d20 systems roll and roll again for ties): tie (initTie) breaks equal
// initiatives step by step — a value step puts the higher first (none: after those that have one); a roll step rolls only for the rows
// still tied there and keeps its rolls on the row (tb[step], in order, so a later sort never shuffles them) and, as the last step, rolls again
// for rows it left tied, each roll added to their list (five times at most). Rows tied past every step keep their place. Without tie, ties
// keep their place
function orderByInit(rows, tie) {
    var num = function(r) { return isObj(r) && typeof r.init === 'number' && fin(r.init) ? r.init : 0; };
    var list = (Array.isArray(rows) ? rows : []).map(function(r, i) { return { r: r, i: i }; }).sort(function(a, b) { return (num(b.r) - num(a.r)) || (a.i - b.i); });
    var steps = isObj(tie) && Array.isArray(tie.steps) ? tie.steps.slice(0, LIMITS.initTies) : [];
    if (!steps.length) return list.map(function(x) { return x.r; });
    var fnum = function(v) { return typeof v === 'number' && fin(v); };
    var cmpKey = function(a, b) {   // high to low, none last; a roll step's key is its rolls in order, compared in turn (one list ending first: tied there)
        var an = a === null, bn = b === null; if (an || bn) return an === bn ? 0 : (an ? 1 : -1);
        if (!Array.isArray(a)) return a === b ? 0 : b - a;
        for (var i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return b[i] - a[i];
        return 0;
    };
    var rollsOf = function(r, k) { var a = isObj(r) && Array.isArray(r.tb) && Array.isArray(r.tb[k]) ? r.tb[k].filter(fnum) : []; return a.length ? a : null; };
    var addRoll = function(r, k) { var v = typeof tie.rollFor === 'function' ? tie.rollFor(r, k) : null; if (!isObj(r) || !fnum(v)) return; if (!Array.isArray(r.tb)) r.tb = []; while (r.tb.length <= k) r.tb.push(null); if (!Array.isArray(r.tb[k])) r.tb[k] = []; if (r.tb[k].length < 8) r.tb[k].push(v); };
    var order = function(grp, key) {   // the rows by their key, grouped where tied
        var ys = grp.map(function(x) { return { x: x, key: key(x.r) }; }).sort(function(a, b) { return cmpKey(a.key, b.key) || (a.x.i - b.x.i); }), out = [], cur = null;
        ys.forEach(function(y) { if (cur && cmpKey(cur.key, y.key) === 0) cur.xs.push(y.x); else { cur = { key: y.key, xs: [y.x] }; out.push(cur); } });
        return out;
    };
    function breakTie(grp, k) {
        if (grp.length < 2 || k >= steps.length) return grp;
        var st = steps[k], roll = isObj(st) && st.roll === true, key;
        if (roll) { grp.forEach(function(x) { if (!rollsOf(x.r, k)) addRoll(x.r, k); }); key = function(r) { return rollsOf(r, k); }; }
        else key = function(r) { var v = typeof tie.valueOf === 'function' ? tie.valueOf(r, k) : null; return fnum(v) ? v : null; };
        var runs = order(grp, key);
        if (roll && k === steps.length - 1) for (var n = 0; n < 5 && runs.some(function(g) { return g.xs.length > 1 && g.key !== null; }); n++) {   // a roll-off: those it left tied roll again, each roll added to their own list
            runs = [].concat.apply([], runs.map(function(g) { if (g.xs.length < 2 || g.key === null) return [g]; g.xs.forEach(function(x) { addRoll(x.r, k); }); return order(g.xs, key); }));
        }
        return [].concat.apply([], runs.map(function(g) { return g.xs.length > 1 ? breakTie(g.xs, k + 1) : g.xs; }));
    }
    var out = [], grp = [], flush = function() { breakTie(grp, 0).forEach(function(x) { out.push(x.r); }); grp = []; };
    list.forEach(function(x) { if (grp.length && num(grp[0].r) !== num(x.r)) flush(); grp.push(x); }); if (grp.length) flush();
    return out;
}
// Initiative O2: the system's initiative rules (combat.initiative) — ties: up to three steps, each a formula: with no dice a value (DX: the
// higher goes first), with dice a roll (1d6, d20: made only for the rows still tied). cleanSystem then drops a step that reads a GM-only
// value (the order is public). Nothing: absent
function cleanInitRules(v, F) {
    if (!isObj(v)) return null;
    var out = {}, ties = [];
    (Array.isArray(v.ties) ? v.ties : []).forEach(function(t) { if (ties.length >= LIMITS.initTies) return; var ft = cleanFormulaText(t), pt = ft && F && typeof F.parse === 'function' ? F.parse(ft) : null; if (pt && pt.ok && pt.ast) ties.push(ft); });
    if (ties.length) out.ties = ties;
    if (v.every === true) out.every = true;   // initiative O4: the initiative roll made again at every new round
    if (v.chosen === true) out.chosen = true;   // initiative O5: Next is chosen, true only (a third order: it takes the sides' place)
    var sd = cleanFormulaText(v.side), ps = sd && F && typeof F.parse === 'function' ? F.parse(sd) : null;   // ... and the sides' roll, which reads no one's values (a side rolls it, never one character)
    if (ps && ps.ok && ps.ast && Array.isArray(ps.names) && !ps.names.length && out.chosen !== true) out.side = sd;
    return Object.keys(out).length ? out : null;
}
// ... and the tie orderByInit takes for one sort: each step's value or roll for a row's character (charOf(row): its character, or null), one
// resolver per character; a roll that reads no name needs none (a row with no character rolls it too). null: no steps or no engine
function initTie(sys, F, charOf) {
    var ir = isObj(sys) && isObj(sys.combat) && isObj(sys.combat.initiative) ? sys.combat.initiative : null, ties = ir && Array.isArray(ir.ties) ? ir.ties.slice(0, LIMITS.initTies) : [];
    if (!ties.length || !F || typeof F.parse !== 'function' || typeof F.evaluate !== 'function') return null;
    var steps = ties.map(function(t) { var p = F.parse(t); return { text: t, roll: !!(p && p.ok && p.ast && hasDice(p.ast.body)), names: !!(p && p.ok && Array.isArray(p.names) && p.names.length) }; });
    var rs = map(), resolverOf = function(ch) { var k = typeof ch.id === 'string' ? ch.id : ''; if (k && rs[k]) return rs[k]; var r = makeResolver(sys, ch, F, null); if (k) rs[k] = r; return r; };
    var ev = function(row, k, dice) {
        var st = steps[k], ch = typeof charOf === 'function' ? charOf(row) : null, o = dice ? {} : { random: noDice }, res = null;
        if (isObj(ch)) o.vars = resolverOf(ch); else if (st.names) return null;
        try { res = F.evaluate(st.text, o); } catch (e) { res = null; }
        if (!res || !res.ok) return null; if (typeof res.value === 'boolean') return res.value ? 1 : 0;
        return typeof res.value === 'number' && fin(res.value) ? res.value : null;
    };
    return { steps: steps.map(function(s) { return { roll: s.roll }; }), valueOf: function(row, k) { return steps[k] && !steps[k].roll ? ev(row, k, false) : null; }, rollFor: function(row, k) { return steps[k] && steps[k].roll ? ev(row, k, true) : null; } };
}
// Initiative O4 (the owner's answer, "Players vs the rest, each round"): a round's side roll-off. rollOf(side, k) makes a side's k-th roll
// ('pc', then 'rest'): a number, or null when it failed. Both roll; while they tie both roll again, five times at most, then the players go
// first. { first: 'pc' | 'rest', rolls: { pc, rest } }, or null when a roll failed
function sideFirst(rollOf) {
    if (typeof rollOf !== 'function') return null;
    var rolls = { pc: [], rest: [] }, ok = function(v) { return typeof v === 'number' && fin(v); };
    for (var k = 0; k < 6; k++) {
        var a = rollOf('pc', k); if (!ok(a)) return null;
        var b = rollOf('rest', k); if (!ok(b)) return null;
        rolls.pc.push(a); rolls.rest.push(b);
        if (a !== b) return { first: a > b ? 'pc' : 'rest', rolls: rolls };
    }
    return { first: 'pc', rolls: rolls };
}
// ... and a combat's rows with that side first: isPc(row) says whether a row is the players'; each side's rows keep their order (a held row
// that acted keeps its place). A new array; with no side named, the rows as they are
function orderBySide(rows, isPc, first) {
    var list = Array.isArray(rows) ? rows.slice() : [];
    if ((first !== 'pc' && first !== 'rest') || typeof isPc !== 'function') return list;
    var a = [], b = []; list.forEach(function(r) { (!!isPc(r) === (first === 'pc') ? a : b).push(r); });
    return a.concat(b);
}
// Initiative O5 (backlog 34; the owner, by prompt, 2026-10-29: "A Turn order choice", and of a new round: "the standing order repeats, but there
// should be the option to choose otherwise", the initiative setting "a set order that repeats"): Next is chosen. A fight's rows keep their standing
// order and a row that had its turn this round is marked dn. chosenPicks: the places that may go next, those not gone this round less the one on
// turn; with none left the round ends, and any row may open the next one, the one on turn too. { at: [places], round }
function chosenPicks(rows, turn) {
    var list = Array.isArray(rows) ? rows : [], out = [];
    list.forEach(function(r, i) { if (i !== turn && isObj(r) && r.dn !== 1) out.push(i); });
    if (out.length) return { at: out, round: false };
    return { at: list.map(function(r, i) { return i; }), round: true };
}
// ... and where play goes: the pick (a row's id) when it is one of those; with no pick, the first not gone after the one on turn in the standing
// order, else the first not gone, else a new round from the order's first. { at, round }, or null for a pick that may not go next
function chosenNext(rows, turn, pick) {
    var list = Array.isArray(rows) ? rows : [], p = chosenPicks(list, turn); if (!list.length) return null;
    if (pick !== undefined && pick !== null) {
        if (typeof pick !== 'string' || !pick) return null;
        var i = -1; list.forEach(function(r, k) { if (i < 0 && isObj(r) && r.id === pick) i = k; });
        return p.at.indexOf(i) >= 0 ? { at: i, round: p.round } : null;
    }
    if (p.round) return { at: 0, round: true };
    var after = p.at.filter(function(k) { return k > turn; });
    return { at: after.length ? after[0] : p.at[0], round: false };
}
var API = { unheldJudge: unheldJudge, GROUP_MAX: GROUP_MAX, rollTargetOf: rollTargetOf, groupRolls: groupRolls, groupWeakest: groupWeakest, dmgAdOf: dmgAdOf, dmgDiceRead: dmgDiceRead, turnCounters: turnCounters, cleanCharLink: cleanCharLink, LINK_KINDS: LINK_KINDS, LINK_NOT: LINK_NOT, cleanLinks: cleanLinks, linkByKey: linkByKey, linkBare: linkBare, setLinkSource: setLinkSource, cleanCharLinks: cleanCharLinks, linkNamesIn: linkNamesIn, linkFigs: linkFigs, cleanLk: cleanLk, linkSet: linkSet, linkedFrom: linkedFrom, linksDrop: linksDrop, withAttempt: withAttempt, bigOf: bigOf, critRange: critRange, cleanTier: cleanTier, grantWaits: grantWaits, cleanGrants: cleanGrants, hideGrants: hideGrants, grantWant: grantWant, grantsKept: grantsKept, GRANT_MAX: GRANT_MAX, rangeBandOf: rangeBandOf, partsRoom: partsRoom, partHostOk: partHostOk, partsKept: partsKept, partsPut: partsPut, partsSrc: partsSrc, partHost: partHost, partsOf: partsOf, capsAt: capsAt, droppedWords: droppedWords, setOf: setOf, setsOf: setsOf, statName: statName, placeVal: placeVal, rollFigOf: rollFigOf, rollShowOf: rollShowOf, cleanBadges: cleanBadges, BADGE_MAX: BADGE_MAX, cleanSheetRev: cleanSheetRev, sheetRevOf: sheetRevOf, charStale: charStale, staleOf: staleOf, revProposal: revProposal, cleanAlt: cleanAlt, ALT_MAX: ALT_MAX, againFold: againFold, cleanEnv: cleanEnv, ENV_BANDS: ENV_BANDS, envBands: envBands, envWorst: envWorst, cleanRollSw: cleanRollSw, rollSwitchesAll: rollSwitchesAll, rollSwitches: rollSwitches, swJudge: swJudge, DATE_NAMES: DATE_NAMES, setDateSource: setDateSource, dateReads: dateReads, VERSION: VERSION, overSays: overSays, overNames: overNames, overSet: overSet, onClash: onClash, rowTimers: rowTimers, cleanRowTimer: cleanRowTimer, readsOn: readsOn, cleanRowGone: cleanRowGone, cleanCross: cleanCross, crossings: crossings, crossSteps: crossSteps, postureFx: postureFx, withOnSelf: withOnSelf, tokOnOk: tokOnOk, mapYardPx: mapYardPx, loadFits: loadFits, DIE_NAMES: DIE_NAMES, cleanDie: cleanDie, dieOf: dieOf, rollDie: rollDie, tradeOfferable: tradeOfferable, tradeInto: tradeInto, moneyBoxes: moneyBoxes, moneyHeld: moneyHeld, moneyMove: moneyMove, rowOpMoney: rowOpMoney, cleanTradeOffer: cleanTradeOffer, tradeApply: tradeApply, TRADE_LINES: TRADE_LINES, cleanDamageRules: cleanDamageRules, damageStep: damageStep, cleanCharDamage: cleanCharDamage, DMG_CONDS: DMG_CONDS, cleanPlaceCats: cleanPlaceCats, catSplits: catSplits, catHome: catHome, catPlace: catPlace, cleanFieldUnit: cleanFieldUnit, metricOf: metricOf, unitTail: unitTail, readMeasure: readMeasure, heightWords: heightWords, MEASURES: MEASURES, measureWords: measureWords, unitWords: unitWords, unitHead: unitHead, listFig: listFig, listWords: listWords, unitOf: unitOf, figText: figText, figFmt: figFmt, weightWords: weightWords, textWords: textWords, measureStore: measureStore, rollNeedsOk: rollNeedsOk, rollNeedsSays: rollNeedsSays, onGroup: onGroup, onlyOne: onlyOne, onHeld: onHeld, cleanNeeds: cleanNeeds, hideNeeds: hideNeeds, needsMet: needsMet, needsSays: needsSays, needRule: needRule, ruleTrue: ruleTrue, setRuleJudge: setRuleJudge, cleanBudgets: cleanBudgets, budgetsOf: budgetsOf, budgetWatch: budgetWatch, budgetSays: budgetSays, cleanDesc: cleanDesc, cleanLvls: cleanLvls, EVERY_UNITS: EVERY_UNITS, cleanEvery: cleanEvery, FIGHT_UNITS: FIGHT_UNITS, cleanInFight: cleanInFight, timeRuleRun: timeRuleRun, ruleRunCtx: ruleRunCtx, needsHeld: needsHeld, chainsShallow: chainsShallow, cleanFace: cleanFace, charForView: charForView, mapGridOf: mapGridOf, tokenCell: tokenCell, shapeStandIn: shapeStandIn, cleanFrame: cleanFrame, openChar: openChar, newCharRules: newCharRules, charClash: charClash, coreOf: coreOf, setLibraryFind: setLibraryFind, statKeys: statKeys, statPicks: statPicks, cleanIcon: cleanIcon, droppedCounts: droppedCounts, parseLasts: parseLasts, lastsSecs: lastsSecs, roundSecs: roundSecs, fxLeftNow: fxLeftNow, fxTick: fxTick, mapCellScale: mapCellScale, moveAllowCells: moveAllowCells, dueActs: dueActs, gridCells: gridCells, cleanTurn: cleanTurn, TURN_UNITS: TURN_UNITS, TIME_WORDS: TIME_WORDS, roundActs: roundActs, combatChars: combatChars, applyRound: applyRound, thenChanges: thenChanges, thenCrit: thenCrit, withRollCrit: withRollCrit, THEN_WHEN: THEN_WHEN, dmgTypeOf: dmgTypeOf, rollMods: rollMods, openSync: openSync, cleanOpens: cleanOpens, showsIf: showsIf, rowRollNames: rowRollNames, applyAct: applyAct, applyScope: applyScope, cleanCharApply: cleanCharApply, APPLY_KINDS: APPLY_KINDS, hudView: hudView, hudHasContent: hudHasContent, pinTargetsAll: pinTargetsAll, TONES: TONES, valueTone: valueTone, cleanTones: cleanTones, playableChars: playableChars, activeCharOf: activeCharOf, activeChars: activeChars, ownedTokenPlan: ownedTokenPlan, applyOwnerOps: applyOwnerOps, migrateBindings: migrateBindings, tokenSourceFor: tokenSourceFor, playsAs: playsAs, cleanNewPlayers: cleanNewPlayers, newPlayerRules: newPlayerRules, waitingTokensOf: waitingTokensOf, waitingNeed: waitingNeed, stackZ: stackZ, LIMITS: LIMITS, PALETTE_KEYS: PALETTE_KEYS, headerEdits: headerEdits, pinTargets: pinTargets, pruneGroups: pruneGroups, GROUP_ID: GROUP_ID, GLYPHS: GLYPHS, glyphPath: glyphPath, ROLL_TONES: ROLL_TONES, KINDS: KINDS, STORED: STORED, DEF_PROP: DEF_PROP, LAYOUT: LAYOUT, validPageId: validPageId, BAND_KINDS: BAND_KINDS, IDENTITY_KINDS: IDENTITY_KINDS, LEDGER_KINDS: LEDGER_KINDS, headerEntry: headerEntry, captionParts: captionParts, capExpr: capExpr, labelNames: labelNames, labelGmNames: labelGmNames, valueOpts: valueOpts, rowIdOf: rowIdOf, cleanRowDef: cleanRowDef, rowDef: rowDef, projectRows: projectRows, cleanListSpec: cleanListSpec, STAT_KEY: STAT_KEY, statKey: statKey, cleanEntryStats: cleanEntryStats, rowStats: rowStats, rowStat: rowStat, plusText: plusText, rowPaid: rowPaid, cleanListRules: cleanListRules, cleanOv: cleanOv, mergeOv: mergeOv, itemReach: itemReach, OV_LOCK: OV_LOCK, lvlClamp: lvlClamp, rowLvl: rowLvl, rowOn: rowOn, cleanItemKey: cleanItemKey, ROW_WORDS: ROW_WORDS, applyRowOp: applyRowOp, orphanRows: orphanRows, stampRows: stampRows, libSnaps: libSnaps, carriedBy: carriedBy, cleanItemMods: cleanItemMods, fieldKinds: fieldKinds, unseenMods: unseenMods, cleanItemMsg: cleanItemMsg, RM_MODES: RM_MODES, applyEffectOp: applyEffectOp, cleanCharEffect: cleanCharEffect, gmEffectNames: gmEffectNames, fxText: fxText, activeEffects: activeEffects, tokenEffects: tokenEffects, autoEffectsOn: autoEffectsOn, tokenOwnEffects: tokenOwnEffects, projectEffects: projectEffects, FACING_NAMES: FACING_NAMES, TOKEN_NAMES: TOKEN_NAMES, POSTURE_IDS: POSTURE_IDS, postureRangedOf: postureRangedOf, cleanPostures: cleanPostures, postureList: postureList, ownPostures: ownPostures, postureAt: postureAt, postureSeven: postureSeven, stanceCtx: stanceCtx, tokenCtx: tokenCtx, setAimSource: setAimSource, bearingTo: bearingTo, aimsOf: aimsOf, facingNow: facingNow, withRound: withRound, withCross: withCross, rangeCtx: rangeCtx, withRange: withRange, sideOf: sideOf, threatArc: threatArc, cleanThreats: cleanThreats, facingCtx: facingCtx, charTokenOn: charTokenOn, cycleThreat: cycleThreat, RESERVED_SUFFIX: RESERVED_SUFFIX, emptySystem: emptySystem, uid: uid, validKey: validKey, cleanFormulaText: cleanFormulaText, hasDice: hasDice, cleanField: cleanField, ROUNDS: ROUNDS, ROUND_TO: ROUND_TO, roundBy: roundBy, roundSays: roundSays, cleanRollDef: cleanRollDef, cleanItemDef: cleanItemDef, cleanCombat: cleanCombat, cleanCover: cleanCover, cleanLightRules: cleanLightRules, lightName: lightName, lightPresets: lightPresets, LIGHT_UNITS: LIGHT_UNITS, cleanRangeRules: cleanRangeRules, rangeModOf: rangeModOf, rangeDist: rangeDist, rangeOf: rangeOf, RANGE_UNITS: RANGE_UNITS, cleanSenses: cleanSenses, secretFieldIds: secretFieldIds, gmViewFields: gmViewFields, coverTier: coverTier, coverOutcome: coverOutcome, coverDamage: coverDamage, cleanSystem: cleanSystem, cleanValue: cleanValue, cleanChar: cleanChar, cleanCharEdit: cleanCharEdit, cleanCharEdits: cleanCharEdits, resetTargets: resetTargets, cleanCharItem: cleanCharItem, cleanDenyReason: cleanDenyReason, cleanSheetStyle: cleanSheetStyle, fieldById: fieldById, itemDef: itemDef, keyIndex: keyIndex, makeResolver: makeResolver, resolveAll: resolveAll, hoverLines: hoverLines, gmOnlyNames: gmOnlyNames, gmDerivedNames: gmDerivedNames, gmPools: gmPools, initRoll: initRoll, orderByInit: orderByInit, cleanInitRules: cleanInitRules, cleanHeightRules: cleanHeightRules, heightModOf: heightModOf, heightOf: heightOf, HEIGHT_UNITS: HEIGHT_UNITS, initTie: initTie, sideFirst: sideFirst, orderBySide: orderBySide, validateSystem: validateSystem, charFor: charFor, applyEdit: applyEdit, autoLayout: autoLayout, cleanCharUpload: cleanCharUpload, cleanUploads: cleanUploads, fillMaking: fillMaking, applyProposal: applyProposal, statAsk: statAsk, readerKit: readerKit, registerReader: registerReader, dropReader: dropReader, readers: readers, readerById: readerById, readerFor: readerFor, fmtNum: fmtNum, suggest: suggest, lookRule: lookRule, cleanLooks: cleanLooks, applyStyle: applyStyle, cleanCharStyle: cleanCharStyle, lookOf: lookOf, lookFor: lookFor, loadSame: loadSame, loadMax: loadMax, cleanLd: cleanLd, chamberTakes: chamberTakes, chamberFits: chamberFits, chamberCap: chamberCap, chamberHolds: chamberHolds, chamberSays: chamberSays, cleanRd: cleanRd, CHAMBER_CAP: CHAMBER_CAP, thenMargin: thenMargin, onceOf: onceOf, cleanBlastRules: cleanBlastRules, BLAST_FALL: BLAST_FALL, cleanReach: cleanReach, cleanAffs: cleanAffs, affLastsSecs: affLastsSecs, AFF_UNITS: AFF_UNITS, chosenPicks: chosenPicks, chosenNext: chosenNext };
if (typeof window !== 'undefined') window.wpSystemCore = API;
export { unheldJudge, GROUP_MAX, rollTargetOf, groupRolls, groupWeakest, dmgAdOf, dmgDiceRead, turnCounters, cleanCharLink, LINK_KINDS, LINK_NOT, cleanLinks, linkByKey, linkBare, setLinkSource, cleanCharLinks, linkNamesIn, linkFigs, cleanLk, linkSet, linkedFrom, linksDrop, withAttempt, bigOf, critRange, cleanTier, grantWaits, cleanGrants, hideGrants, grantWant, grantsKept, GRANT_MAX, rangeBandOf, partsRoom, partHostOk, partsKept, partsPut, partsSrc, partHost, partsOf, capsAt, droppedWords, setOf, setsOf, statName, placeVal, rollFigOf, rollShowOf, cleanBadges, BADGE_MAX, cleanSheetRev, sheetRevOf, charStale, staleOf, revProposal, cleanAlt, ALT_MAX, againFold, cleanEnv, ENV_BANDS, envBands, envWorst, cleanRollSw, rollSwitchesAll, rollSwitches, swJudge, DATE_NAMES, setDateSource, dateReads, VERSION, overSays, overNames, overSet, onClash, rowTimers, cleanRowTimer, readsOn, cleanRowGone, cleanCross, crossings, crossSteps, postureFx, withOnSelf, tokOnOk, mapYardPx, loadFits, DIE_NAMES, cleanDie, dieOf, rollDie, tradeOfferable, tradeInto, moneyBoxes, moneyHeld, moneyMove, rowOpMoney, cleanTradeOffer, tradeApply, TRADE_LINES, cleanDamageRules, damageStep, cleanCharDamage, DMG_CONDS, cleanPlaceCats, catSplits, catHome, catPlace, cleanFieldUnit, metricOf, unitTail, readMeasure, heightWords, MEASURES, measureWords, unitWords, unitHead, listFig, listWords, unitOf, figText, figFmt, weightWords, textWords, measureStore, rollNeedsOk, rollNeedsSays, onGroup, onlyOne, onHeld, cleanNeeds, hideNeeds, needsMet, needsSays, needRule, ruleTrue, setRuleJudge, cleanBudgets, budgetsOf, budgetWatch, budgetSays, cleanDesc, cleanLvls, EVERY_UNITS, cleanEvery, FIGHT_UNITS, cleanInFight, timeRuleRun, ruleRunCtx, needsHeld, chainsShallow, cleanFace, charForView, mapGridOf, tokenCell, shapeStandIn, cleanFrame, openChar, newCharRules, charClash, coreOf, setLibraryFind, statKeys, statPicks, cleanIcon, droppedCounts, parseLasts, lastsSecs, roundSecs, fxLeftNow, fxTick, mapCellScale, moveAllowCells, dueActs, gridCells, cleanTurn, TURN_UNITS, TIME_WORDS, roundActs, combatChars, applyRound, thenChanges, thenCrit, withRollCrit, THEN_WHEN, dmgTypeOf, rollMods, openSync, cleanOpens, showsIf, rowRollNames, applyAct, applyScope, cleanCharApply, APPLY_KINDS, hudView, hudHasContent, pinTargetsAll, TONES, valueTone, cleanTones, playableChars, activeCharOf, activeChars, ownedTokenPlan, applyOwnerOps, migrateBindings, tokenSourceFor, playsAs, cleanNewPlayers, newPlayerRules, waitingTokensOf, waitingNeed, stackZ, LIMITS, PALETTE_KEYS, headerEdits, pinTargets, pruneGroups, GROUP_ID, GLYPHS, glyphPath, ROLL_TONES, KINDS, STORED, DEF_PROP, LAYOUT, validPageId, BAND_KINDS, IDENTITY_KINDS, LEDGER_KINDS, headerEntry, captionParts, capExpr, labelNames, labelGmNames, valueOpts, rowIdOf, cleanRowDef, rowDef, projectRows, cleanListSpec, STAT_KEY, statKey, cleanEntryStats, rowStats, rowStat, plusText, rowPaid, cleanListRules, cleanOv, mergeOv, itemReach, OV_LOCK, lvlClamp, rowLvl, rowOn, cleanItemKey, ROW_WORDS, applyRowOp, orphanRows, stampRows, libSnaps, carriedBy, cleanItemMods, fieldKinds, unseenMods, cleanItemMsg, RM_MODES, applyEffectOp, cleanCharEffect, gmEffectNames, fxText, activeEffects, tokenEffects, autoEffectsOn, tokenOwnEffects, projectEffects, FACING_NAMES, TOKEN_NAMES, POSTURE_IDS, postureRangedOf, cleanPostures, postureList, ownPostures, postureAt, postureSeven, stanceCtx, tokenCtx, setAimSource, bearingTo, aimsOf, facingNow, withRound, withCross, rangeCtx, withRange, sideOf, threatArc, cleanThreats, facingCtx, charTokenOn, cycleThreat, RESERVED_SUFFIX, emptySystem, uid, validKey, cleanFormulaText, hasDice, cleanField, ROUNDS, ROUND_TO, roundBy, roundSays, cleanRollDef, cleanItemDef, cleanCombat, cleanCover, cleanLightRules, lightName, lightPresets, LIGHT_UNITS, cleanRangeRules, rangeModOf, rangeDist, rangeOf, RANGE_UNITS, cleanSenses, secretFieldIds, gmViewFields, coverTier, coverOutcome, coverDamage, cleanSystem, cleanValue, cleanChar, cleanCharEdit, cleanCharEdits, resetTargets, cleanCharItem, cleanDenyReason, cleanSheetStyle, fieldById, itemDef, keyIndex, makeResolver, resolveAll, hoverLines, gmOnlyNames, gmDerivedNames, gmPools, initRoll, orderByInit, cleanInitRules, cleanHeightRules, heightModOf, heightOf, HEIGHT_UNITS, initTie, sideFirst, orderBySide, validateSystem, charFor, applyEdit, autoLayout, cleanCharUpload, cleanUploads, fillMaking, applyProposal, statAsk, readerKit, registerReader, dropReader, readers, readerById, readerFor, fmtNum, suggest, lookRule, cleanLooks, applyStyle, cleanCharStyle, lookOf, lookFor, loadSame, loadMax, cleanLd, chamberTakes, chamberFits, chamberCap, chamberHolds, chamberSays, cleanRd, CHAMBER_CAP, thenMargin, onceOf, cleanBlastRules, BLAST_FALL, cleanReach, cleanAffs, affLastsSecs, AFF_UNITS, chosenPicks, chosenNext };
