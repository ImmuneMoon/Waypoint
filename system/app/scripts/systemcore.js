/* Character sheets and the rules model (1.5.0) — the pure half: a campaign's SYSTEM (named fields with defaults or
   formulas, rolls, a sheet layout), its CHARACTERS (values keyed by field id), the cleaners for what comes off the
   wire or out of a file, the validator behind the editor's carets, the resolver that lets the formula engine read
   a character's names (STR, Skill.Stealth, HP.max), the per-recipient view a player receives, the hover lines,
   the auto layout and the ShadowBase bridge. No DOM, no state, no engine import: the engine API (window.wpFormula
   or a stub) is passed in as F, so tools/systemcheck.js runs this under Node. Published as window.wpSystemCore.
   Design of record: docs/SHEET_BUILDER_PLAN.md. */
'use strict';

var VERSION = '1.5.0';
var LIMITS = Object.freeze({
    fields: 300, rolls: 50, sections: 40, tabs: 12, placements: 300, options: 50, optionChars: 60,   // Stage 6: room for a big sheet (one section per section of a Foundry-sized sheet)
    key: 64, label: 60, formula: 300,       // 300 = the dice path's expression cap, so a sheet roll never dies there
    text: 200, notes: 20000, name: 60, charName: 60, names: 200,
    items: 200, carried: 150, category: 40, maxBlastFt: 3000, maxQty: 99,   // item library (Stage 5); Stage 6: 150 rows a list (a big sheet's skills)
    rmMsg: 200, undoMs: 10000, undoGraceMs: 15000,   // Stage 6: a bound or cursed item's message; a pickup's Undo (the host allows a little longer: the round trip)
    listCats: 20, rowNote: 200, lvlAbs: 1e6,     // Stage 6 F4b: a list's categories, a row's note, the size of a row level
    listStats: 10, entryStats: 16, statAbs: 1e9,   // Stage 6 F4c1: a list's stats, the stats an item carries, the size of a stat (a price, a weight: 99,999,999 fits)
    listCols: 6,                             // Stage 6 F5a1: a list's columns (a formula per row)
    pickOpts: 48,                            // Stage 6 F5a2: a choice stat's options
    rowRolls: 4,                             // Stage 6 F5b: a list's rolls (a button on each row)
    applyChanges: 4,                         // Stage 6 HUD H7: an apply action's changes (a pool or a number each)
    rowCounters: 4,                          // Stage 6 HUD R2: a list's counters (a number each row keeps: Charges, Hits)
    cols: 4, editsPerWindow: 20, editWindowMs: 5000, editTimeoutMs: 5000, valueChars: 20000, editBatch: 10,   // HUD frame (HF4b): values in one batched edit (a section's Reset all)
    band: 12, bandGroups: 6,                 // Stage 5c: placements on the pinned band (one row under the name); Stage 6: named groups of them, each pinned by its viewer
    identity: 12, ledger: 8,                 // Stage 5d: the header block — identity rows and ledger figures (read-only)
    icon: 8, unit: 8,                        // Stage 5g: a tab's or a section's icon (code points: an emoji or a glyph or two), a number's unit ("pts")
    caption: 200, captionExprs: 8,           // Stage 5g Fold B: a field's caption line and the {formula} values in it
    labels: 10,                              // Stage 6: names for a number's values (a dropdown) or a formula's (shown instead of the number)
    effects: 100, effectRows: 30, effectMods: 12, effectAmount: 1e6, effectDur: 40,  // Stage 5h: the library, a character's list, changes per effect, a change's size, a duration note
    threats: 6                               // Stage 5h Fold 3: threat marks on a token (world bearings; the first is the active one)
});
// item-list is a STORED, non-numeric list kind (a character's carried items); never in NUMERIC/DEF_PROP.
var KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1, text: 1, notes: 1, select: 1, 'item-list': 1, effects: 1 });
var STORED = Object.freeze({ number: 1, resource: 1, skill: 1, toggle: 1, text: 1, notes: 1, select: 1, 'item-list': 1, effects: 1 });   // effects (5h): a character's status effects — rows, never a number
var NUMERIC = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1 });   // kinds a formula may name
var DEF_PROP = Object.freeze({ formula: 'formula', resource: 'maxFormula', skill: 'base' });   // a kind's definition formula (no dice allowed)
var LAYOUT = Object.freeze({ heading: 1, divider: 1, portrait: 1, link: 1, facing: 1, stance: 1, pin: 1, hud: 1 });   // hud (HUD frame HF2b): a button that opens the character's HUD   // pin (Stage 6): the Pin button of a band group   // link (Stage 5f): a button that opens a handbook page; facing (5h): the token's facing dial; stance (Stage 6): the token's posture and elevation
var BAND_KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1 });   // Stage 5c: what the pinned band can hold — kinds that read in one row (text, notes, selects and item lists stay in sections)
var IDENTITY_KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1, text: 1, select: 1 });   // Stage 5d: what an identity row can show, read-only (notes and item lists stay in sections)
var LEDGER_KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1 });   // Stage 5d: what a ledger figure can show — a number over its label
var RESERVED_SUFFIX = Object.freeze({ max: 1, ranks: 1, cur: 1, base: 1 });
var FUNC_NAMES = Object.freeze({ floor: 1, ceil: 1, trunc: 1, round: 1, abs: 1, sqrt: 1, min: 1, max: 1, clamp: 1, mod: 1, 'if': 1, and: 1, or: 1, not: 1, 'true': 1, 'false': 1 });
// Stage 5f: a handbook page id as a sheet names it. Pages' ids are free-form by contract (CAMPAIGN_INTEGRATION.md), capped at 80 by
// docrender.cleanDoc; never an Object.prototype name. The system cannot see the campaign, so this is the format only — which pages a
// player may see is decided by the host (cleanSystem's opts.pages) and again when the sheet is drawn.
var PAGE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
var EFFECT_ID = /^e_[A-Za-z0-9_]{1,24}$/, FXROW_ID = /^x_[A-Za-z0-9_]{1,24}$/;   // 5h: a library effect, a row on a character's list
var FX_OPS = Object.freeze({ add: 1, adhoc: 1, on: 1, remove: 1 });
function validPageId(id) { return typeof id === 'string' && PAGE_ID.test(id) && !(id in Object.prototype); }
var FIELD_ID = /^f_[A-Za-z0-9_]{1,24}$/, ROLL_ID = /^r_[A-Za-z0-9_]{1,24}$/, SECTION_ID = /^s_[A-Za-z0-9_]{1,24}$/, TAB_ID = /^t_[A-Za-z0-9_]{1,24}$/, CHAR_ID = /^c_[A-Za-z0-9_]{1,24}$/, ITEM_ID = /^i_[A-Za-z0-9_]{1,24}$/, RID_RE = /^[A-Za-z0-9_-]{1,24}$/;
var SHAPES = Object.freeze({ circle: 1 }), BLAST_AUTO = Object.freeze({ full: 1, roll: 1, measure: 1 });
// Stage 6 F4a: a carried row's id (w_…; a legacy {defId, qty} row's is derived from its item) and the row ops a change may carry
var ROW_ID = /^w_[A-Za-z0-9_]{1,24}$/, ROW_OPS = Object.freeze({ add: 1, remove: 1, setQty: 1, keep: 1, undo: 1, set: 1, ov: 1, custom: 1 });   // undo (Stage 6): a pickup taken back; set (F4b): a row's facts; ov (F4c2): a copy's own values; custom (F4c3): a character's own row, made or changed
// Stage 6 F4b: an item's key in formulas (F5a: Skills.<Key>.lvl) — never a row word, which a row's own names use
var ITEM_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/, ROW_WORDS = Object.freeze({ count: 1, qty: 1, on: 1, has: 1, lvl: 1, paid: 1, row: 1 });
// Stage 6 F4c1: a list's stat key (F5a reads Row.<key>) — never an Object.prototype name in either case (the wire's packer refuses one, and the
// engine takes Row.toString as a name) or BYTES_PER_ELEMENT (the packer sends an object holding it as an empty typed array: every stat of that
// item gone for players), a row word, a reserved suffix (base is refused: his Advantages use cpBase) or a function name; with the
// engine, one a formula can address. A stat's value: a number (never a numeric string), within 1e9 either way (0.0001 lb, -0.5, 99,999,999)
var STAT_KEY = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
function statKey(k, F) { if (typeof k !== 'string' || !STAT_KEY.test(k)) return ''; var l = lower(k); if ((k in Object.prototype) || (l in Object.prototype) || ROW_WORDS[l] || RESERVED_SUFFIX[l] || FUNC_NAMES[l] || l === 'bytes_per_element') return ''; return F && F.parse && !validKey('Row.' + k, F) ? '' : k; }
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
var DENY = Object.freeze({ off: 1, slow: 1, owner: 1, field: 1, value: 1, missing: 1, paused: 1, stays: 1, none: 1, error: 1 });   // none, error (Stage 6 HUD H7): an apply action with nothing to apply, or an amount that could not be worked out (its message rides along)   // stays (Stage 6): a bound item did not come off

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
var APPLY_KINDS = Object.freeze({ resource: 1, number: 1 });   // Stage 6 HUD H7: what an apply action moves (a pool's current value, a number's stored value)
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
function cleanField(f, F, gmView) {
    if (!isObj(f) || typeof f.id !== 'string' || !FIELD_ID.test(f.id) || !KINDS[f.kind]) return null;
    if (!validKey(f.key, F)) return null;
    var vis = f.vis === 'gm' && f.kind !== 'effects' ? 'gm' : 'all';   // 5h: a Status effects list is always visible — GM-only is a property of an effect, never of the list (a hidden list moved the GM's numbers but not the owner's)
    if (!gmView && vis === 'gm') return null;
    var out = { id: f.id, key: f.key, label: str(f.label, LIMITS.label).replace(CTRL_RE, ' ').trim() || f.key, kind: f.kind, vis: vis, hover: f.hover === true };
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
    else if (k === 'text') { out.max = Math.max(1, Math.min(LIMITS.text, cleanNum(f.max, LIMITS.text) | 0)); out.def = str(f.def, out.max).replace(CTRL_RE, ''); }
    else if (k === 'notes') { /* no default, no cap below the limit */ }
    else if (k === 'select') {
        var seen = map(), opts = [];
        (Array.isArray(f.options) ? f.options : []).forEach(function(o) { if (typeof o !== 'string') return; o = o.slice(0, LIMITS.optionChars).replace(CTRL_RE, '').trim(); if (!o || seen[lower(o)] || opts.length >= LIMITS.options) return; seen[lower(o)] = 1; opts.push(o); });
        out.options = opts;
        out.def = typeof f.def === 'string' && opts.indexOf(f.def) >= 0 ? f.def : (opts[0] || '');
    }
    else if (k === 'item-list') { var tbl = cleanItemTable(f.table); if (tbl) out.table = tbl; var lsp = cleanListSpec(f.list, gmView, F); if (lsp) out.list = lsp; }   // Stage 4: optional rich table (columns/chips/footer); Stage 6 F4b: the list's options (F4c1: its stats, checked with the engine)
    if (typeof f.caption === 'string') { var cap = cutPoints(f.caption, LIMITS.caption, ' '); if (cap) out.caption = cap; }   // Stage 5g Fold B: a line under the field ({formula} values worked out when drawn)
    if (k === 'resource') {   // Stage 5g Fold B: a pool's icon, a fill-to-max button, and the bar (shown unless turned off)
        var poolIcon = cleanIcon(f.icon); if (poolIcon) out.icon = poolIcon;
        if (f.reset === true) out.reset = true;
        if (f.bar === false) out.bar = false;
    }
    if (f.roll !== undefined) { var r = cleanFormulaText(f.roll); if (r) out.roll = r; }
    if (f.tile === true && (k === 'number' || k === 'formula' || k === 'skill' || k === 'resource')) out.tile = true;   // Stage 3: render this numeric field as a stat tile
    if ((k === 'number' || k === 'formula' || k === 'skill' || k === 'resource') && typeof f.unit === 'string') { var un = cutPoints(f.unit, LIMITS.unit, ' '); if (un) out.unit = un; }   // Stage 5g: a unit after the value ("pts", "kg")
    if ((k === 'number' || k === 'formula' || k === 'skill') && f.sign === true) out.sign = true;   // Stage 5g: colour the value by its sign (green above zero, red below)
    if ((k === 'number' || k === 'formula') && Array.isArray(f.labels)) {   // Stage 6: names for the values 0, 1, 2… — a number becomes a dropdown that stores the position, a formula shows the name for its value; formulas always read the number
        var lbs = cleanLabels(f.labels);
        if (lbs) { out.labels = lbs; if (k === 'number') { out.min = 0; out.max = lbs.length - 1; out.step = 1; out.def = clampNum(Math.round(out.def), 0, out.max); } }
    }
    if (k === 'formula' && f.badge === true) out.badge = true;   // Stage 6 look fold (L7): the value drawn as a pill
    if (k === 'formula' && out.labels) { var tones = cleanTones(f.tones, out.labels.length); if (tones) out.tones = tones; }   // L7: a colour per value name (parallel to labels)
    if (k === 'resource' && typeof f.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(f.color)) out.color = f.color.toLowerCase();   // L7: a pool's own colour (icon, bar, band value)
    if (k === 'number' && (f.slider === true || isObj(f.slider))) out.slider = cleanSlider(f.slider);   // Stage 5e: a gradient slider (end labels, track colours) — drawn once the field has a min and a max (the sheet checks), kept either way so nothing the GM set is lost on Save; a plain number everywhere else
    if ((k === 'number' || k === 'skill') && f.counter === true && !out.labels && !out.slider) out.counter = true;   // HUD frame (HF4a, H8): a counter — minus and plus either side of the box (a named number is a dropdown and a slider a range, never a counter)
    return out;
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
    ['lowColor', 'highColor'].forEach(function(k) { if (typeof v[k] === 'string' && HEX.test(v[k])) out[k] = v[k].toLowerCase(); });
    return out;
}
// Stage 6 HUD H7: an apply action — a roll entry of a second kind: changes (a pool or a number moved by a formula, no dice) in place of a
// formula; never the initiative roll. A change: { f: fieldId, formula, add? }; each field once, four at most. An unfinished one (no field,
// no formula) is kept for the GM's editor, where the validator names it; the players' view drops the whole action (applyTargets)
function cleanApplyChanges(list, withWhen) {   // withWhen (R1): a roll's consequences, each always / on success / on failure (a field once per when)
    var out = [], seen = map();
    (Array.isArray(list) ? list : []).forEach(function(c) {
        if (out.length >= LIMITS.applyChanges || !isObj(c)) return;
        var f = typeof c.f === 'string' && FIELD_ID.test(c.f) ? c.f : '', wh = withWhen && (c.when === 'hit' || c.when === 'miss') ? c.when : '', sk = f + '|' + wh;
        if (f && seen[sk]) return; if (f) seen[sk] = 1;
        var o = { f: f, formula: cleanFormulaText(c.formula) || '' }; if (c.set === true) o.set = true; else if (c.add === true) o.add = true;   // Stage 6 HUD R1: Set to (the amount is the new value)
        if (wh) o.when = wh;
        out.push(o);
    });
    return out;
}
function cleanApplyDef(r, vis) {
    var out = { id: r.id, label: str(r.label, LIMITS.label).replace(CTRL_RE_G, ' ').trim() || 'Apply', apply: cleanApplyChanges(r.apply), vis: vis };
    if (typeof r.tone === 'string' && Object.prototype.hasOwnProperty.call(ROLL_TONES, r.tone)) out.tone = r.tone;
    var aIcon = cleanIcon(r.icon); if (aIcon) out.icon = aIcon;
    return out;
}
// Stage 6 HUD H7: each apply action's targets against this view's fields — the GM's: a change whose field is no longer a pool or a number
// (deleted, or its kind changed) keeps its amount and loses the field (the validator asks for one); the players': an action with any change
// unfinished or out of their view is dropped whole (half an action would mislead)
function applyTargets(out, fieldIds, gmView) {
    var keep = function(r) {
        if (r.then) { r.then.forEach(function(c) { if (c.f && APPLY_KINDS[fieldIds[c.f]] !== 1) c.f = ''; }); if (!gmView && !r.then.every(function(c) { return !!c.f && !!c.formula; })) delete r.then; }   // R1: a roll's consequences, the same rules (players' view: all of them or none)
        if (!r.apply) return true;
        r.apply.forEach(function(c) { if (c.f && APPLY_KINDS[fieldIds[c.f]] !== 1) c.f = ''; });
        return gmView || (r.apply.length > 0 && r.apply.every(function(c) { return !!c.f && !!c.formula; }));
    };
    out.rolls = out.rolls.filter(keep);
    out.fields.forEach(function(f) {   // HUD H7b: a list's apply actions by the same rules; a list spec left with nothing goes (as a load would read it)
        if (f.kind !== 'item-list' || !isObj(f.list)) return;
        if (Array.isArray(f.list.rolls)) { f.list.rolls = f.list.rolls.filter(keep); if (!f.list.rolls.length) delete f.list.rolls; }
        if (!Object.keys(f.list).length) delete f.list;
    });
}
function cleanRollDef(r, gmView) {
    if (!isObj(r) || typeof r.id !== 'string' || !ROLL_ID.test(r.id)) return null;
    var vis = r.vis === 'gm' ? 'gm' : 'all';
    if (!gmView && vis === 'gm') return null;
    if (Array.isArray(r.apply)) return cleanApplyDef(r, vis);   // Stage 6 HUD H7: an apply action
    var fm = cleanFormulaText(r.formula); if (!fm) return null;
    var out = { id: r.id, label: str(r.label, LIMITS.label).replace(CTRL_RE_G, ' ').trim() || 'Roll', formula: fm, vis: vis };   // HUD frame (HF5a): every control character (the non-global pattern replaced only the first, and the dice path then refused the whole roll)
    if (r.init === true) out.init = true;
    if (typeof r.tone === 'string' && Object.prototype.hasOwnProperty.call(ROLL_TONES, r.tone)) out.tone = r.tone;   // Stage 6 look fold
    var rIcon = cleanIcon(r.icon); if (rIcon) out.icon = rIcon;
    if (Array.isArray(r.then)) { var th = cleanApplyChanges(r.then, true); if (th.length) out.then = th; }   // Stage 6 HUD R1: its consequences on the character (after the roll)
    return out;
}
// An item definition (camp.system.items). gmView false: a vis:'gm' item is dropped, and a visible item's
// formula/skill text (damage/cost/throwSkill) is stripped — the host resolves every roll, so players never
// need the formula, which also removes the GM-only-field-leak surface (cleanSystem's blanking is fields/rolls only).
function cleanItemDef(it, F, gmView, keys, picks) {   // keys (F4c1): the stat keys of the view's item lists (statKeys); none: the key rule alone. picks (F5a2): their choices' labels (statPicks)
    if (!isObj(it) || typeof it.id !== 'string' || !ITEM_ID.test(it.id)) return null;
    var vis = it.vis === 'gm' ? 'gm' : 'all';
    if (!gmView && vis === 'gm') return null;
    var out = {
        id: it.id,
        name: str(it.name, LIMITS.name).replace(CTRL_RE_G, ' ').trim() || 'Item',   // Stage 6: every control character (the non-global pattern replaced only the first)
        category: str(it.category, LIMITS.category).replace(CTRL_RE_G, ' ').trim(),
        icon: cleanIcon(it.icon),                                                    // Stage 6: cut by code points (never half an emoji)
        notes: str(it.notes, LIMITS.text).replace(CTRL_RE_G, ' '),
        vis: vis, area: null, damage: '', cost: '', throwSkill: ''
    };
    if (gmView && RM_MODES[it.rm] === 1) { out.rm = it.rm; var rmm = cutText(it.rmMsg, LIMITS.rmMsg); if (rmm) out.rmMsg = rmm; }   // Stage 6: a player's removal (bound / curse on contact) and its message — the GM's secret, never in the players' view
    if (gmView && RM_MODES[it.eq] === 1) { out.eq = it.eq; var eqm = cutText(it.eqMsg, LIMITS.rmMsg); if (eqm) out.eqMsg = eqm; }   // Stage 6 F4b: a player's switching it off (bound: it stays on; curse on contact: you keep it on) and its message — as secret
    var ik = cleanItemKey(it.key, F); if (ik) out.key = ik;   // F4b: its key in formulas, unique inside each list it can be on (the validator)
    var il = lvlNum(it.lvl); if (il !== undefined) out.lvl = il;   // F4b: the level a new row of it starts at (else the list's)
    var ist = cleanEntryStats(it.stats, keys, picks); if (ist) out.stats = ist;   // F4c1: its stats — under a key some item list of this view defines (any list, never scoped by category: a category changed later loses nothing, and the GM's sheet and the owner's read the same)
    if (isObj(it.area)) {
        var ft = cleanNum(it.area.ft, 0) | 0;
        if (ft > 0) out.area = { ft: clampNum(ft, 1, LIMITS.maxBlastFt), shape: SHAPES[it.area.shape] ? it.area.shape : 'circle', name: cutText(it.area.name, LIMITS.label) };   // F4c1: every control character (as a copy's)
    }
    if (gmView) {   // formula/skill text is GM-only on the wire
        var dmg = cleanFormulaText(it.damage); out.damage = dmg === null ? '' : dmg;
        var cost = cleanFormulaText(it.cost); out.cost = cost === null ? '' : cost;
        out.throwSkill = (typeof it.throwSkill === 'string' && validKey(it.throwSkill, F)) ? it.throwSkill : '';
    }
    return out;
}
// camp.system.combat.cover — the per-system cover rule (1.5.0, v1). Built-in tier sets, chosen by `style`; no custom
// thresholds in v1. on=false → no cover. Whitelisted here so host and client (both run cleanSystem) agree; carries
// no vis:'gm' and no field refs, so the player view is identical to the GM's.
function cleanCover(c) {
    if (!isObj(c)) return { on: false, style: 'graded' };
    return { on: c.on === true, style: c.style === 'binary' ? 'binary' : 'graded' };
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
// camp.system.combat — blast automation, who rolls, the resource damage subtracts from, and the cover rule. resIds: map of resource field ids.
function cleanCombat(c, resIds) {
    c = isObj(c) ? c : {};
    var out = { blastAuto: BLAST_AUTO[c.blastAuto] ? c.blastAuto : 'full', blastRoller: c.blastRoller === 'gm' ? 'gm' : 'owner', hpResource: '', cover: cleanCover(c.cover) };
    if (typeof c.hpResource === 'string' && resIds && resIds[c.hpResource]) out.hpResource = c.hpResource;
    return out;
}
// Stage 6 F4c2: the system's rules for item lists (the Lists tab's Rules box) — ownerStats: players may change the stats of their own copies
// (Setting A). Both views carry it: a player's sheet draws its ✎ and their own check judges by it, the host by the full system. null when unset
function cleanListRules(v) { return isObj(v) && v.ownerStats === true ? { ownerStats: true } : null; }
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
    if (m.op !== 'add') return null;
    var v = typeof m.v === 'number' ? m.v : Number(m.v); if (!isFinite(v) || Math.abs(v) > LIMITS.effectAmount) return null;
    if (m.part === 'max') return k === 'resource' ? { f: m.f, op: 'add', v: v, part: 'max' } : null;
    return (k === 'number' || k === 'skill' || k === 'formula') ? { f: m.f, op: 'add', v: v } : null;
}
// 5h: what a library effect and an ad hoc row share — name, icon, tone, duration note, notes, changes (plain literals, fixed key order)
function cleanEffectCore(d, fieldKinds) {
    var mods = [];
    (Array.isArray(d.mods) ? d.mods : []).forEach(function(m) { if (mods.length >= LIMITS.effectMods) return; var c = cleanMod(m, fieldKinds); if (c) mods.push(c); });
    return { name: str(d.name, LIMITS.name).replace(CTRL_RE_G, ' ').trim() || 'Effect', icon: cleanIcon(d.icon), tone: d.tone === 'buff' || d.tone === 'debuff' ? d.tone : '',
             dur: cutPoints(d.dur, LIMITS.effectDur, ' '), notes: str(d.notes, LIMITS.text).replace(CTRL_RE_G, ' ').trim(), mods: mods };
}
// 5h: a library effect (camp.system.effects). A GM-only one never reaches the players' library (it can still reach its owner inline, once
// applied: see charFor).
function cleanEffectDef(d, fieldKinds, gmView) {
    if (!isObj(d) || typeof d.id !== 'string' || !EFFECT_ID.test(d.id)) return null;
    var vis = d.vis === 'gm' ? 'gm' : 'all'; if (!gmView && vis === 'gm') return null;
    var c = cleanEffectCore(d, fieldKinds);
    return { id: d.id, name: c.name, icon: c.icon, tone: c.tone, dur: c.dur, notes: c.notes, vis: vis, mods: c.mods };
}
// Stage 5g: the sheet's own shape — headline section titles, filled (angled) tabs, one accent colour, the portrait and the name leading
// the header block. Whitelisted values only; absent (or nothing valid) = today's look, and the key is left out.
function cleanLook(v) {
    if (!isObj(v)) return null;
    var out = {};
    if (v.titles === 'headline' || v.titles === 'accordion') out.titles = v.titles;   // Stage 6 look fold (L5): accordion titles
    if (v.tabs === 'filled' || v.tabs === 'angular') out.tabs = v.tabs;   // L5: angular tabs ('angled' stays invalid)
    if (typeof v.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.accent)) out.accent = v.accent.toLowerCase();
    if (v.portrait === true) out.portrait = true;
    if (v.labels === 'caps') out.labels = 'caps';   // Fold B: field labels in small bold capitals
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
    var lv = cleanLvlSpec(v.lvl); if (lv) out.lvl = lv;
    if (isObj(v.on)) { var sw = { label: cutText(v.on.label, LIMITS.label) || 'On' }; if (v.on.def === true) sw.def = true; out.on = sw; }
    if (Array.isArray(v.stats)) {   // F4c1: its stats — a number every item of it carries (Acc, Wt, Cost), ten at most, each key once ignoring case (the first wins; a key is never trimmed or fixed)
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
            var slb = cleanLabels(s.labels); if (slb) so.labels = slb;
            }   // names for the values 0, 1, 2... (a value past them shows as the number: no clamp, so lists sharing a key never fight)
            if (s.show === true) so.show = true;   // On the row: a chip beside the name, a column in a rich table
            sts.push(so);
        }
        if (sts.length) out.stats = sts;
    }
    if (out.stats && typeof v.price === 'string') { var pl = lower(v.price); for (var pi = 0; pi < out.stats.length; pi++) if (lower(out.stats[pi].key) === pl) { if (out.stats[pi].kind !== 'pick') out.price = out.stats[pi].key; break; } }   // F5a2: never a choice   // F4c1: the price is one of its stats (stored as its key): a row records it as paid when it is added
    if (v.custom === true) out.custom = true;   // F4c3: Custom rows — players may add rows of their own (+ Custom…); the GM may on any list shaped here
    if (Array.isArray(v.cols)) {   // F5a1: its columns — a formula worked out for each row (Row.lvl, Row.<stat>…), six at most; a key shares the stats' names (unique ignoring case)
        var cls = [], seenK = map(); (out.stats || []).forEach(function(x) { seenK[lower(x.key)] = 1; });
        for (var ci = 0; ci < v.cols.length && cls.length < LIMITS.listCols; ci++) {
            var cv = v.cols[ci]; if (!isObj(cv)) continue;
            var ck = statKey(cv.key, F); if (!ck || seenK[lower(ck)]) continue;
            seenK[lower(ck)] = 1;
            var co = { key: ck, label: cutText(cv.label, LIMITS.label) || ck, formula: cv.formula === null ? null : (cleanFormulaText(cv.formula) || '') };   // null: the players' view blanked it (a GM-only name) — kept, so the view is a fixed point
            var cu = cutText(cv.unit, LIMITS.unit); if (cu) co.unit = cu;
            var clb = cleanLabels(cv.labels); if (clb) co.labels = clb;
            if (cv.hide === true) co.hide = true;   // worked out (totals, other columns) but not drawn on the row
            if (cv.foot === true) co.foot = true;   // its total under the list
            cls.push(co);
        }
        if (cls.length) out.cols = cls;
    }
    if (Array.isArray(v.counters)) {   // Stage 6 HUD R2: its counters — a whole number each row keeps (Charges, Hits), four at most: a key of its own (never a stat's or a
        // column's), a label, where a row starts (0..1e6) and its most (a formula, Row.* read; null: the players' view blanked a GM-only name)
        var cts = [], seenT = map(); (out.stats || []).concat(out.cols || []).forEach(function(x) { seenT[lower(x.key)] = 1; });
        for (var ti = 0; ti < v.counters.length && cts.length < LIMITS.rowCounters; ti++) {
            var tv = v.counters[ti]; if (!isObj(tv)) continue;
            var tk = statKey(tv.key, F); if (!tk || seenT[lower(tk)]) continue; seenT[lower(tk)] = 1;
            var to = { key: tk, label: cutText(tv.label, LIMITS.label) || tk }, tdn = Number(tv.def); if (typeof tv.def === 'number' && fin(tdn) && tdn > 0) to.def = Math.min(1e6, Math.round(tdn));
            if (tv.max === null) to.max = null; else { var tmx = cleanFormulaText(tv.max); if (tmx) to.max = tmx; }
            cts.push(to);
        }
        if (cts.length) out.counters = cts;
    }
    if (Array.isArray(v.rolls)) {   // F5b: its rolls — a button on each row, the formula worked out with the row's names (Row.*; dice allowed), four at most
        var rls = [];
        v.rolls.forEach(function(rv) { if (rls.length >= LIMITS.rowRolls || !isObj(rv)) return; if (Array.isArray(rv.apply)) { rls.push({ label: cutText(rv.label, LIMITS.label) || 'Apply', apply: cleanApplyChanges(rv.apply) }); return; } rls.push({ label: cutText(rv.label, LIMITS.label) || 'Roll', formula: cleanFormulaText(rv.formula) || '' }); });   // HUD H7b: or an apply action on each row (its amounts read the row as Row.*)
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
    fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.stats)) return; f.list.stats.forEach(function(s) { var k = first[lower(s.key)]; if (k && k !== s.key) { if (f.list.price === s.key) f.list.price = k; s.key = k; } }); });
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
    return out;
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
    var l = lower(k); if (ROW_WORDS[l] || RESERVED_SUFFIX[l] || FUNC_NAMES[l] || (k in Object.prototype) || (l in Object.prototype)) return '';
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
// titles: the Foundry HUD has none). null when there is no HUD. The input is never mutated.
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
        var tabOut = { id: tb.id, label: str(tb.label, LIMITS.label).replace(CTRL_RE, ' ').trim() }, tabIcon = cleanIcon(tb.icon);
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
// A layout's sections. ctx: { fieldIds, rollIds, pages (null: format only), tabIds, groupIds, hudTabs } — the tabs and groups of THIS layout;
// hudTabs (HF2b): the HUD's tab ids when a HUD button may point at it (the sheet's own layout, with a HUD that survived), else null (the HUD's
// own layout, or no HUD in this view: the button is dropped)
function cleanSections(list, ctx) {
    var out = [], placed = map(), total = 0, fieldIds = ctx.fieldIds, rollIds = ctx.rollIds, pages = ctx.pages, tabIds = ctx.tabIds, groupIds = ctx.groupIds;
    for (var i = 0; i < list.length && out.length < LIMITS.sections; i++) {
        var s = list[i];
        if (!isObj(s) || typeof s.id !== 'string' || !SECTION_ID.test(s.id)) continue;
        var cols = Math.max(1, Math.min(LIMITS.cols, cleanNum(s.cols, 1) | 0));
        var sec = { id: s.id, title: str(s.title, LIMITS.label).replace(CTRL_RE, ' ').trim(), cols: cols, fields: [] };
        if (typeof s.tab === 'string' && tabIds[s.tab]) sec.tab = s.tab;   // keep only a tab ref that exists (in this layout)
        if (s.collapsible) sec.collapsible = true;                          // Stage 2: a collapsible <details> section
        if (validPageId(s.chip) && (!pages || pages[s.chip] === 1)) sec.chip = s.chip;   // Stage 5f: a handbook chip in the header (a page the players' view can open)
        if (s.pinned) sec.pinned = true;                                    // Stage 5d: a dashboard section — stays above the tab strip on every tab
        if (s.open === false) sec.open = false;                            // default open; store only an explicit "closed by default"
        if (typeof s.meta === 'string' && fieldIds[s.meta]) sec.meta = s.meta;   // a field whose value shows in the section header (e.g. a points total)
        if (typeof s.parent === 'string' && SECTION_ID.test(s.parent) && s.parent !== s.id) sec.parent = s.parent;   // nest under another section (the render enforces one level)
        var secStyle = cleanSecStyle(s.style); if (secStyle) sec.style = secStyle;   // Stage 3: per-section colors (accent/bg/border)
        var secIcon = cleanIcon(s.icon); if (secIcon) sec.icon = secIcon;   // Stage 5g: an icon before the title
        if (typeof s.pin === 'string' && groupIds[s.pin] === 1) sec.pin = s.pin;   // Stage 6 look fold: a band group's Pin in the header
        var sif = cleanFormulaText(s.showIf); if (sif) sec.showIf = sif;   // Stage 6 HUD C8: shown only while this formula is true
        if (s.inline === true) sec.inline = true;   // HUD frame (HF4a, H2): each field on one line (label and value, its Roll on the right)
        if (s.resetAll === true) { sec.resetAll = true; var rtx = cutText(s.resetText, LIMITS.label); if (rtx) sec.resetText = rtx; }   // HUD frame (HF4b, H13): a Reset all button in the header (its own words, e.g. Long rest)
        (Array.isArray(s.fields) ? s.fields : []).forEach(function(p) {
            if (!isObj(p) || total >= LIMITS.placements) return;
            var w = p.w === 'row' ? 'row' : 1, item = null;
            if (typeof p.id === 'string' && fieldIds[p.id] && !placed[p.id]) { placed[p.id] = 1; item = { id: p.id, w: w }; if (p.on === true && fieldIds[p.id] === 'item-list') item.on = true; }   // on (F4b): only the rows switched on (the HUD's readied weapons)
            else if (typeof p.roll === 'string' && rollIds[p.roll]) item = { roll: p.roll, w: w };
            else if (typeof p.kind === 'string' && LAYOUT[p.kind]) {
                item = { kind: p.kind, w: w }; if (p.kind === 'heading') item.text = str(p.text, LIMITS.label).replace(CTRL_RE, ' ').trim();
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
    out.name = str(sys.name, LIMITS.name).replace(CTRL_RE, ' ').trim();
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
    if (!gmView && gmFields.length && out.fields.some(function(f) { return f.kind === 'resource' && !!f.maxFormula; })) {   // a pool whose max is GM-only is GM-only as a whole: gone, as a GM-only field is (the GM-only fields last: one wins a key both use)
        var gmP = gmPools({ fields: out.fields.concat(gmFields) }, F);
        out.fields = out.fields.filter(function(f) { if (gmP[f.id] !== 1) return true; dropped.push(lower(f.key)); return false; });
    }
    if (gmView) oneSpelling(out.fields);   // Stage 6 F4c1 (critic 2): one spelling per stat key, the first list's in field order
    var seenR = map();
    (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (out.rolls.length >= LIMITS.rolls) return; var c = cleanRollDef(r, gmView); if (!c || seenR[c.id]) return; seenR[c.id] = 1; out.rolls.push(c); });
    var gmKeys = gmView ? map() : gmEntryKeys(sys, out.fields), hasGmKeys = Object.keys(gmKeys).length > 0;   // F5a1: per visible list, the keys of the GM-only entries in its scope
    var hasPicks = out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.stats) && f.list.stats.some(function(x) { return x.kind === 'pick'; }); });   // F5a2
    if (!gmView && (dropped.length || hasGmKeys || hasPicks)) {   // a visible formula that named a GM-only key is blanked: the player sees "GM only", never the name
        var isDropped = map(); dropped.forEach(function(k) { isDropped[k] = 1; });
        var mentions = function(text) {
            if (!text) return false;
            var hit = function(n) { var l = lower(n), dot = l.lastIndexOf('.'); if (isDropped[l]) return true; var sg = l.split('.'); if (sg.length > 1 && (droppedList[sg[0]] === 1 || (sg.length > 2 && gmKeys[sg[0]] && gmKeys[sg[0]][sg[1]] === 1))) return true; return dot > 0 && RESERVED_SUFFIX[l.slice(dot + 1)] && isDropped[l.slice(0, dot)]; };   // F5a1: a GM-only list by its first segment, L.<a GM-only entry's key> (critic 5)
            if (F.parse(text).ok) return F.names(text).some(hit);
            return (String(text).match(/[A-Za-z_][A-Za-z0-9_.]*/g) || []).some(function(t) { return hit(t) || hit(t.split('.')[0]); });   // Stage 6: text that does not parse is checked word by word — a typo never carries a GM-only name to players
        };
        var showMention = mentions;   // Stage 6 HUD C8: the sheet's show-ifs are checked once the sheet is cleaned (below)
        var capMentions = function(t) { return String(t).split('{').slice(1).some(function(p) { return mentions(capExpr(p.split('}')[0]).expr); }); };   // Stage 6: after every "{" (closed or not, drawn or not), the ± stripped   // Fold B: a caption's {formula} is formula text too
        out.fields.forEach(function(f) { var p = DEF_PROP[f.kind]; if (p && f[p] && mentions(f[p])) f[p] = null; if (f.roll && mentions(f.roll)) delete f.roll; if (f.caption && capMentions(f.caption)) delete f.caption; if (f.list && Array.isArray(f.list.cols)) f.list.cols.forEach(function(c) { if (c.formula && mentions(c.formula)) c.formula = null; }); if (f.list && Array.isArray(f.list.stats)) f.list.stats.forEach(function(x) { if (x.kind !== 'pick') return; x.opts = x.opts.filter(function(o) { return !mentions(o.name); }); if (x.def && !x.opts.some(function(o) { return lower(o.label) === lower(x.def); })) delete x.def; }); if (f.list && Array.isArray(f.list.counters)) f.list.counters.forEach(function(t) { if (t.max && mentions(t.max)) t.max = null; }); if (f.list && Array.isArray(f.list.rolls)) { f.list.rolls = f.list.rolls.filter(function(r) { return r.apply ? !r.apply.some(function(c) { return mentions(c.formula); }) : !mentions(r.formula); }); if (!f.list.rolls.length) delete f.list.rolls; } });   // F5b: a list roll naming a GM-only value is dropped   // F5a2: a choice's option naming a GM-only value is dropped (critic 3: never a blanked one)   // F5a1: a list column too (it reads "GM only")
        out.rolls = out.rolls.filter(function(r) { return r.apply ? !r.apply.some(function(c) { return mentions(c.formula); }) : !mentions(r.formula); });   // H7: an apply action naming a GM-only value goes whole
        out.rolls.forEach(function(r) { if (r.then && r.then.some(function(c) { return mentions(c.formula); })) delete r.then; });   // R1: a consequence naming a GM-only value takes them all (players' rolls then change nothing)
        out.rolls.forEach(function(r) { if (r.label.indexOf('{') >= 0 && capMentions(r.label)) r.label = labelHead(r.label); });   // HUD frame (HF5a, H3): a label naming a GM-only value keeps only its plain text before the first {...} (fail closed, as a caption)
    }
    var fieldIds = map(), rollIds = map(), resIds = map();
    out.fields.forEach(function(f) { fieldIds[f.id] = f.kind; if (f.kind === 'resource') resIds[f.id] = 1; }); applyTargets(out, fieldIds, gmView); out.rolls.forEach(function(r) { rollIds[r.id] = 1; });   // H7: an apply action's targets first   // fieldIds: id -> kind (always truthy; the band gates on the kind)
    var seenIt = map(), stKeys = statKeys(out.fields), stPicks = statPicks(out.fields);   // F4c1: the stats this view's item lists define (the players' view: visible lists only, so a GM-only list's stat never travels)
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {
        if (out.items.length >= LIMITS.items) return;
        var c = cleanItemDef(it, F, gmView, stKeys, stPicks);
        if (!c || seenIt[c.id]) return;
        seenIt[c.id] = 1; out.items.push(c);
    });
    if (!gmView) {   // Stage 6 F4b: a list's categories in the players' view — only those an item they can see has (a GM-only item's category never travels)
        var visCat = map(); out.items.forEach(function(it) { if (it.category) visCat[lower(it.category)] = 1; });
        out.fields.forEach(function(f) { if (f.list && Array.isArray(f.list.cats)) f.list.cats = f.list.cats.filter(function(c) { return visCat[lower(c)] === 1; }); });
    }
    var seenFx = map(), effs = [];   // 5h: the status-effect library, after the fields (its changes are checked against them); absent when empty
    (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (effs.length >= LIMITS.effects) return; var c = cleanEffectDef(d, fieldIds, gmView); if (!c || seenFx[c.id]) return; seenFx[c.id] = 1; effs.push(c); });
    if (effs.length) out.effects = effs;
    out.combat = cleanCombat(sys.combat, resIds);
    var lr = cleanListRules(sys.listRules); if (lr) out.listRules = lr;   // Stage 6 F4c2: Setting A, in both views (absent: GM only)
    var pages = null;   // Stage 5f: the host passes the ids of the pages players may read, so a chip or link to any other page never travels
    if (opts.pages !== undefined) { pages = map(); (Array.isArray(opts.pages) ? opts.pages : []).forEach(function(id) { if (validPageId(id)) pages[id] = 1; }); }
    out.sheet = cleanSheet(sys.sheet, fieldIds, rollIds, pages, gmView);
    if (!gmView && typeof showMention === 'function') [out.sheet, out.sheet && out.sheet.hud].forEach(function(lay) {   // Stage 6 HUD C8: a show-if naming a GM-only value goes (the part simply shows): whether it showed would tell the value
        (lay && Array.isArray(lay.sections) ? lay.sections : []).forEach(function(s) { if (s.showIf && showMention(s.showIf)) delete s.showIf; (s.fields || []).forEach(function(p) { if (p.showIf && showMention(p.showIf)) delete p.showIf; }); });
    });
    var ss = cleanSheetStyle(sys.sheetStyle); if (ss) out.sheetStyle = ss;   // the sheet's own look (doc theming), players' view included
    return out;
}
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
// Stage 6 F5a1: the keys of the GM-only library entries, per visible item list whose scope has them (lower-case list key -> lower-case entry
// key -> 1) — a visible formula naming L.<such a key> reads a secret (critic 5: per list and key, never all keys everywhere). Local
function gmEntryKeys(sys, fields) {
    var out = map();
    (Array.isArray(fields) ? fields : []).forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list' || f.vis === 'gm') return;
        var cats = isObj(f.list) && Array.isArray(f.list.cats) && f.list.cats.length ? f.list.cats : null;
        (Array.isArray(sys && sys.items) ? sys.items : []).forEach(function(it) { if (isObj(it) && it.vis === 'gm' && typeof it.key === 'string' && it.key && (!cats || catIn(cats, it.category))) { var lk = lower(f.key); (out[lk] = out[lk] || map())[lower(it.key)] = 1; } });
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
                seenRow[row.id] = 1; seenRef[row.ref] = 1; rows.push({ id: row.id, ref: row.ref, on: on }); continue;
            }
            var core = cleanEffectCore(row, fk); seenRow[row.id] = 1;
            rows.push({ id: row.id, name: core.name, icon: core.icon, tone: core.tone, dur: core.dur, notes: core.notes, on: on, mods: core.mods });
        }
        return rows;
    }
    if (k === 'item-list') {   // Stage 6 F4a: rows (cleanRow) — at most LIMITS.carried; one id-less row per item (the rule before Stage 6); a row id once; nothing minted. opts.items is a proto-safe id set
        if (!Array.isArray(v)) return undefined;
        var items = (opts && opts.items) || map(), seenD = map(), seenR = map(), list = [], nVis = 0, nHid = 0;
        for (var i = 0; i < v.length && i < LIMITS.carried * 4 && (nVis < LIMITS.carried || nHid < LIMITS.carried); i++) {   // Stage 6: visible rows and kept curses counted apart (a kept row never pushes out, or blocks, a visible one)
            var rw = cleanRow(v[i], items, field.list); if (!rw) continue;
            var rk = rowIdOf(rw); if (!rk || seenR[rk] || (!rw.id && rw.defId && seenD[rw.defId])) continue;
            if (rw.hid === 1 ? nHid >= LIMITS.carried : nVis >= LIMITS.carried) continue;
            seenR[rk] = 1; if (rw.defId && rw.hid !== 1) seenD[rw.defId] = 1; if (rw.hid === 1) nHid++; else nVis++; list.push(rw);
        }
        return list;
    }
    return undefined;
}
function stepRound(n, field) { var step = field.step > 0 ? field.step : 1, base = field.min !== undefined ? field.min : 0; return base + Math.round((n - base) / step) * step; }
function cleanChar(c, sys) {
    if (!isObj(c) || typeof c.id !== 'string' || !CHAR_ID.test(c.id) || !sys) return null;
    var out = { id: c.id, name: str(c.name, LIMITS.charName).replace(CTRL_RE, ' ').trim() || 'Character', ownerId: str(c.ownerId, 60).replace(CTRL_RE, ''), portrait: '', npc: c.npc === true, values: {}, updated: fin(Number(c.updated)) ? Number(c.updated) : 0 };
    if (out.npc || !PID_RE.test(out.ownerId) || out.ownerId in Object.prototype) out.ownerId = '';   // a profile id or nobody (never a prototype key)
    if (typeof c.portrait === 'string' && PATH_RE.test(c.portrait) && c.portrait.indexOf('..') < 0 && !CTRL_RE.test(c.portrait)) out.portrait = c.portrait;
    var vals = isObj(c.values) ? c.values : {}, vo = valueOpts(sys);
    Object.keys(vals).forEach(function(fid) { var f = fieldById(sys, fid); if (!f || !STORED[f.kind]) return; var v = cleanValue(f, vals[fid], vo); if (v !== undefined) out.values[fid] = v; });
    // 5h: a teammate's copy (partial) carries the host's worked-out hover lines — text only, at most 12 of 120 characters
    if (c.partial === true && Array.isArray(c.lines)) { var ln = []; c.lines.forEach(function(s) { if (typeof s === 'string' && ln.length < 12) ln.push(s.slice(0, 120).replace(CTRL_RE_G, ' ')); }); out.lines = ln; }
    return out;
}
// What a value is checked against, the same on every machine (5h): the system's item ids (a prototype-free set). A client re-cleaning a
// delta with no options used to check an item list against nothing and drop every entry.
function valueOpts(sys) {
    var items = map(), effects = map(), fields = map();
    (sys && Array.isArray(sys.items) ? sys.items : []).forEach(function(it) { if (it && typeof it.id === 'string') items[it.id] = 1; });
    (sys && Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (d && typeof d.id === 'string') effects[d.id] = 1; });   // 5h: a library row must name one of these
    (sys && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && typeof f.id === 'string') fields[f.id] = f.kind; });   // 5h: an ad hoc row's changes are checked against these
    return { items: items, effects: effects, fields: fields };
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
// [{ name, value }] } — lines: the label, the amount (signed), the new value — or { ok: false, reason: field|value|none|error, message? }
function applyAct(sys, char, act, vars, F, tctx) {
    if (!sys || !Array.isArray(sys.fields) || !char || !isObj(act) || !Array.isArray(act.apply) || !act.apply.length || typeof vars !== 'function' || !F) return { ok: false, reason: 'field' };
    var amts = [], names = [], seenN = map();
    for (var i = 0; i < act.apply.length; i++) {
        var c = act.apply[i], f = isObj(c) && typeof c.f === 'string' ? fieldById(sys, c.f) : null;
        if (!f || APPLY_KINDS[f.kind] !== 1 || typeof c.formula !== 'string' || !c.formula) return { ok: false, reason: 'field' };
        var p = F.parse(c.formula); if (!p.ok) return { ok: false, reason: 'error', message: p.error.message };
        if (hasDice(p.ast.body)) return { ok: false, reason: 'error', message: 'An amount cannot roll dice.' };
        var res = F.evaluate(c.formula, { vars: vars });
        if (!res.ok) return { ok: false, reason: 'error', message: res.error.message };
        var v = typeof res.value === 'boolean' ? (res.value ? 1 : 0) : res.value;
        if (typeof v !== 'number' || !fin(v)) return { ok: false, reason: 'error', message: 'That amount is not a number.' };
        ((res.breakdown && Array.isArray(res.breakdown.names)) ? res.breakdown.names : []).forEach(function(n) { if (n && typeof n.name === 'string' && !seenN[lower(n.name)]) { seenN[lower(n.name)] = 1; names.push(n); } });
        if (f.kind === 'resource') v = Math.round(v);
        amts.push({ f: f, amt: c.set === true ? v : (v > 0 ? v : 0), add: c.add === true, set: c.set === true });   // R1: Set to takes the amount as it is
    }
    if (!amts.some(function(a) { return a.set || a.amt > 0; })) return { ok: false, reason: 'none' };
    var work = Object.assign({}, char, { values: JSON.parse(JSON.stringify(char.values || {})) }), out = {}, lines = [];
    for (var j = 0; j < amts.length; j++) {
        var a = amts[j]; if (!a.set && !(a.amt > 0)) continue;
        var cur = 0;
        if (a.f.kind === 'resource') { var rv = makeResolver(sys, work, F, tctx || null)(a.f.key); if (typeof rv === 'number' && fin(rv)) cur = rv; }   // full (nothing stored) reads as the max
        else { var sv = storedOf(a.f, work); if (typeof sv === 'number' && fin(sv)) cur = sv; }
        var next = a.set ? a.amt : a.add ? cur + a.amt : cur - a.amt;
        var ed = applyEdit(sys, work, a.f.id, a.f.kind === 'resource' ? { cur: next } : next, F, {});
        if (!ed.ok) return { ok: false, reason: ed.reason };
        work.values[a.f.id] = ed.value; out[a.f.id] = ed.value;
        var nv = a.f.kind === 'resource' ? ed.value.cur : ed.value;
        lines.push({ f: a.f.id, n: a.f.label || a.f.key, d: a.set ? nv - cur : a.add ? a.amt : -a.amt, v: nv });   // a Set's line says what it moved
    }
    return { ok: true, values: out, lines: lines, names: names };
}
// Stage 6 HUD H7 (owner, 2026-09-26): who sees an apply action's card — 'table' when every field it moves is shown to teammates on hover (the
// card tells them nothing new), else 'owner' (the character's player and the GM); 'gm' for an NPC, a GM-only action or field, and when the
// caller says the amount read a GM-only value (gm) — the GM only (and the player who pressed it on a GM-only row: the caller's)
function applyScope(sys, char, act, gm, F) {
    if (gm || !sys || !Array.isArray(sys.fields) || !isObj(act) || act.vis === 'gm' || !char || char.npc || !char.ownerId || !Array.isArray(act.apply) || !act.apply.length) return 'gm';
    var gmP = F ? gmPools(sys, F) : map(), fs = act.apply.map(function(c) { return isObj(c) && typeof c.f === 'string' ? fieldById(sys, c.f) : null; });
    if (fs.some(function(f) { return !f || f.vis === 'gm' || gmP[f.id] === 1; })) return 'gm';
    return fs.every(function(f) { return f.hover === true; }) ? 'table' : 'owner';
}
// Stage 6 HUD R1: the consequences one roll makes — a check's verdict (pass: true | false; null when the roll tests nothing) picks its "on
// success" or "on failure" changes; "always" ones apply either way
function thenChanges(entry, pass) { return (isObj(entry) && Array.isArray(entry.then) ? entry.then : []).filter(function(c) { return isObj(c) && (!c.when || (pass === true && c.when === 'hit') || (pass === false && c.when === 'miss')); }); }
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
function cleanCharApply(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId)) return null;
    var out = { rid: msg.rid, charId: msg.charId };
    if (msg.row !== undefined) {   // HUD H7b: a list's action on one row — { f: the list field, r: the row, i: the list's action }, never with an act
        var rw = msg.row; if (msg.act !== undefined || !isObj(rw) || typeof rw.f !== 'string' || !FIELD_ID.test(rw.f) || typeof rw.r !== 'string' || !ROW_ID.test(rw.r) || typeof rw.i !== 'number' || Math.floor(rw.i) !== rw.i || rw.i < 0 || rw.i >= LIMITS.rowRolls) return null;
        out.row = { f: rw.f, r: rw.r, i: rw.i };
    } else if (typeof msg.act !== 'string' || !ROLL_ID.test(msg.act)) return null;
    else out.act = msg.act;
    if (msg.label !== undefined) { if (typeof msg.label !== 'string' || msg.label.length > LIMITS.label || CTRL_RE.test(msg.label)) return null; var lb = msg.label.trim(); if (lb) out.label = lb; }
    return out;
}
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
        if (char.partial || !(who.gm || (who.own && f.edit === 'owner' && f.vis === 'all'))) continue;
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
    if (typeof msg.rowId !== 'string' || !ROW_ID.test(msg.rowId)) return null; out.rowId = msg.rowId;
    if (msg.op === 'add' || msg.op === 'setQty' || msg.op === 'undo') { var qty = msg.qty === undefined ? 1 : (cleanNum(msg.qty, NaN) | 0); if (!(qty >= 0)) return null; out.qty = clampNum(qty, 0, LIMITS.maxQty); }
    if (msg.op === 'set') { var fx = cleanFacts(msg.facts); if (!fx) return null; out.facts = fx; }   // F4b
    if (msg.op === 'ov') { if (msg.ov === null) out.ov = null; else { var ovm = cleanOvMsg(msg.ov); if (!ovm) return null; out.ov = ovm; } }   // F4c2: back to the library only when the wire says null; a patch malformed, or holding nothing, refuses the message
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
// mode (none lifts the library's), a blast null or { ft, name? }, stats null or up to 16 keys (a stat key, never a prototype name in either case),
// each null or a number within 1e9. held never comes from the wire (the host keeps it); other keys are dropped; a wrong type refuses the whole
// message. A plain object; null when it is malformed or nothing is left
var OV_KEYS = ['name', 'icon', 'category', 'notes', 'stats', 'area', 'damage', 'cost', 'rm', 'rmMsg', 'eq', 'eqMsg'], OV_CAP = Object.freeze({ name: 240, icon: 256, category: 160, notes: 800, damage: 1200, cost: 1200, rmMsg: 800, eqMsg: 800 });
function cleanOvMsg(v) { var out = patchOf(v, OV_KEYS, OV_CAP); return out && Object.keys(out).length ? out : null; }
// Stage 6 F4c3: a custom op's definition patch, by the same shape rules (key: a string within 160, vis within 8; applyRowOp judges who may send
// what — the GM's keys are kept, so that a player sending one hears "field"). A plain object, {} allowed (a new blank row); null when it is not
// an object or a key has the wrong type
var DEF_KEYS = ['name', 'icon', 'category', 'notes', 'key', 'stats', 'vis', 'area', 'damage', 'cost', 'rm', 'rmMsg', 'eq', 'eqMsg'], DEF_CAP = Object.freeze({ name: 240, icon: 256, category: 160, notes: 800, key: 160, vis: 8, damage: 1200, cost: 1200, rmMsg: 800, eqMsg: 800 });
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
function cleanDenyReason(r) { return typeof r === 'string' && DENY[r] ? r : 'value'; }
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
    var out = { name: cutText(d.name, LIMITS.name) || 'Item', category: cutText(d.category, LIMITS.category), icon: cleanIcon(d.icon), notes: str(d.notes, LIMITS.text).replace(CTRL_RE_G, ' '), vis: vis };
    if (isObj(d.area) && (gmView || vis === 'all')) { var ft = cleanNum(d.area.ft, 0) | 0; if (ft > 0) out.area = { ft: clampNum(ft, 1, LIMITS.maxBlastFt), shape: SHAPES[d.area.shape] ? d.area.shape : 'circle', name: cutText(d.area.name, LIMITS.label) }; }
    if (gmView && RM_MODES[d.rm] === 1) { out.rm = d.rm; var rmm = cutText(d.rmMsg, LIMITS.rmMsg); if (rmm) out.rmMsg = rmm; }   // Stage 6: secret, the GM's copy only
    if (gmView && RM_MODES[d.eq] === 1) { out.eq = d.eq; var eqm = cutText(d.eqMsg, LIMITS.rmMsg); if (eqm) out.eqMsg = eqm; }   // F4b: the equip lock, as secret
    if (gmView || vis === 'all') { var rk = cleanItemKey(d.key); if (rk) out.key = rk; }   // F4b: a GM-only copy's key stays the GM's (critic 2)
    var rl = lvlNum(d.lvl); if (rl !== undefined) out.lvl = rl;
    var ds = cleanEntryStats(d.stats, null, 'labels'); if (ds) out.stats = ds;   // F4c1: its stats by the key rule (a snapshot keeps every one; a custom or inline copy's are narrowed to its list's: rowStats)
    if (gmView) {   // formula text stays on the GM's machine, as an item's does
        var dmg = cleanFormulaText(d.damage); if (dmg) out.damage = dmg;
        var cst = cleanFormulaText(d.cost); if (cst) out.cost = cst;
        if (typeof d.throwSkill === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(d.throwSkill)) out.throwSkill = d.throwSkill;
    }
    return out;
}
function cleanRow(e, items, spec) {   // spec (F4b): the list's options (f.list), for the level
    if (!isObj(e)) return null;
    var id = typeof e.id === 'string' && ROW_ID.test(e.id) ? e.id : null, qty = clampNum(cleanNum(e.qty, 1) | 0, 1, LIMITS.maxQty);
    if (typeof e.defId === 'string' && ITEM_ID.test(e.defId)) {
        var known = items[e.defId] === 1, snap = !known && isObj(e.snap) ? cleanRowDef(e.snap, true) : null;   // a copy of a deleted entry keeps its snapshot; once the entry is back the row reads the library again
        if (!known && !snap) return null;   // an unknown item with no copy is dropped (the rule before Stage 6)
        var o = {}; if (id) o.id = id; o.defId = e.defId; o.qty = qty; rowFacts(o, e, spec); var ov = cleanOv(e.ov, spec); if (ov) o.ov = ov; if (snap) o.snap = snap; if (id && e.hid === 1) o.hid = 1; if (e.keptOn === 1 && o.on === true) o.keptOn = 1; return o;   // F4c2: its own values (a custom row never has any: its definition is its own)
    }
    if (!id || !isObj(e.def)) return null;
    var d = cleanRowDef(e.def, e.lnk !== 1); if (!d) return null;
    var cs = rowStats(e.def.stats, spec); if (cs) d.stats = cs; else delete d.stats;   // F4c1: a custom or inline copy carries its list's stats only
    var c = { id: id, qty: qty }; rowFacts(c, e, spec); c.def = d; if (e.lnk === 1) c.lnk = 1; else { if (e.own === 1) c.own = 1; if (e.hid === 1) c.hid = 1; if (e.keptOn === 1 && c.on === true) c.keptOn = 1; } return c;   // F4c3: own (a row its owner made), never on an inline copy
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
function rowCt(r, t) { return isObj(r) && isObj(r.ct) && typeof r.ct[t.key] === 'number' ? r.ct[t.key] : (typeof t.def === 'number' ? t.def : 0); }   // R2: a row's counter (none stored: its start)
function rowFacts(o, e, spec) {
    var lv = lvlNum(e.lvl); if (lv !== undefined && typeof e.lvl === 'number') o.lvl = isObj(spec) && isObj(spec.lvl) ? lvlClamp(spec.lvl, lv) : lv;
    if (typeof e.on === 'boolean') o.on = e.on;
    var nt = cutText(e.note, LIMITS.rowNote); if (nt) o.note = nt;
    if (typeof e.paid === 'number' && fin(e.paid) && e.paid >= 0 && e.paid <= LIMITS.statAbs) o.paid = e.paid;
    var ct = cleanCt(e.ct, spec); if (ct) o.ct = ct;   // Stage 6 HUD R2: its counters   // F4c1: what one cost when it was added (kept while the list has no price, as a level is)
}
// Stage 6 F4c2: a linked copy's own values (ov), by shape — only the fields deliberately changed on this copy (the host drops one equal to the
// copy's base): its name, icon, category, notes, its list's stats (held: the ones the GM set, which its owner's Setting A leaves alone), a
// blast, the damage and cost formulas, its own removal and switch locks (none: free, whatever the library says) and their messages. Never vis,
// key, level or throw skill: secrecy and addressing stay the library's. spec: the list's options (no stats without them); spec true: compare
// only (every stat by the key rule). A plain object in this key order, each key only when set; null when nothing is left
function cleanOv(v, spec) {
    if (!isObj(v)) return null;
    var o = {}, nm = cutText(v.name, LIMITS.name), ic = cleanIcon(v.icon), ca = cutText(v.category, LIMITS.category);
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
function rowDef(sys, row) {
    if (!isObj(row)) return null;
    if (typeof row.defId === 'string') { var it = itemDef(sys, row.defId); if (it) return { def: mergeOv(it, row.ov), src: 'lib', base: it }; if (isObj(row.snap)) return { def: mergeOv(row.snap, row.ov), src: 'lost', base: row.snap }; return null; }
    if (isObj(row.def)) return { def: row.def, src: row.lnk === 1 ? 'inline' : 'custom', base: row.def };
    return null;
}
// The owner's copy of a carried list (charFor): a visible entry as a pointer; a GM-only entry, or a deleted one's copy, inline with its
// players' fields only (the 5h rule: the owner's sheet, their rolls and the host agree); a custom row without its GM texts; a kept curse
// (hid) not at all. lib: the host's full items by id — without it a GM-only row is left out (fail closed). F4b: the facts go as stored, a
// curse the GM keeps on (keptOn) as switched off.
function projFacts(o, r) { if (isObj(r.ct)) o.ct = JSON.parse(JSON.stringify(r.ct));   // R2: its counters go as stored
 if (typeof r.lvl === 'number') o.lvl = r.lvl; if (typeof r.on === 'boolean') o.on = r.keptOn === 1 ? false : r.on; if (typeof r.note === 'string' && r.note) o.note = r.note; if (typeof r.paid === 'number') o.paid = r.paid; }   // F4c1: paid
// F4c1: an inline or custom copy's stats as its owner holds them — its list's (spec: the view's list options; none: no stats); spec true is compare
// only (sheets.js ownerSeesSame): every stat as the GM's machine holds it, so a change to one is never taken for "the same"
function ownStats(pd, src, spec) { if (spec === true) return; var st = isObj(src) ? rowStats(src.stats, spec) : null; if (st) pd.stats = st; else delete pd.stats; }
function projectRows(rows, view, lib, spec) {
    if (!Array.isArray(rows)) return undefined;
    var vis = map(); (view && Array.isArray(view.items) ? view.items : []).forEach(function(it) { if (isObj(it) && typeof it.id === 'string') vis[it.id] = 1; });
    var out = [];
    rows.forEach(function(r) {
        if (!isObj(r) || r.hid === 1) return;
        var rid = rowIdOf(r); if (!rid) return;
        if (typeof r.defId === 'string') {
            if (vis[r.defId] === 1 && !r.snap) { var o = {}; if (r.id) o.id = r.id; o.defId = r.defId; o.qty = r.qty; projFacts(o, r); var oo = ownOv(r.ov, spec); if (oo) o.ov = oo; out.push(o); return; }   // F4c2: its own values the owner may see
            var d = mergeOv((lib && Object.prototype.hasOwnProperty.call(lib, r.defId)) ? lib[r.defId] : r.snap, r.ov), pd = cleanRowDef(d, false); if (!pd) return;   // F4c2: inline, with its own values folded in (then reduced to the players' fields)
            ownStats(pd, d, spec);
            var io = { id: rid, qty: r.qty }; projFacts(io, r); io.def = pd; io.lnk = 1; out.push(io); return;
        }
        if (r.id && isObj(r.def)) { var cd = cleanRowDef(r.def, false); if (cd) { ownStats(cd, r.def, spec); var co = { id: r.id, qty: r.qty }; projFacts(co, r); co.def = cd; if (r.own === 1) co.own = 1; out.push(co); } }   // F4c3: own — a row they made (theirs to change while the list takes custom rows)
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
    if (opts.player && (f.edit !== 'owner' || f.vis !== 'all')) return { ok: false, reason: 'field' };
    if (!isObj(q) || !ROW_OPS[q.op]) return { ok: false, reason: 'value' };
    var src = char && char.values && Array.isArray(char.values[fieldId]) ? char.values[fieldId] : [];
    var list = JSON.parse(JSON.stringify(src)), vo = valueOpts(sys), extra = {}, spec = isObj(f.list) ? f.list : null;   // spec (F4b): the list's options
    var at = function(rid) { for (var i = 0; i < list.length; i++) if (rowIdOf(list[i]) === rid) return i; return -1; };
    if (q.op === 'add') {
        if (typeof q.defId !== 'string' || !ITEM_ID.test(q.defId)) return { ok: false, reason: 'value' };
        var ent = itemDef(sys, q.defId), inView = opts.player ? valueOpts(opts.view || null).items[q.defId] === 1 : !!ent;
        if (!ent || !inView || (opts.player && ent.vis === 'gm')) return { ok: false, reason: 'missing' };
        if (opts.player && spec && Array.isArray(spec.cats) && !catIn(spec.cats, ent.category)) return { ok: false, reason: 'missing' };   // F4b: outside the list's categories reads as gone
        var n = spec && spec.noQty ? 1 : clampNum((q.qty | 0) || 1, 1, LIMITS.maxQty), have = -1;
        if (!(spec && spec.multi && q.rowId !== undefined)) for (var j = 0; j < list.length; j++) if (isObj(list[j]) && list[j].defId === q.defId && !list[j].snap && list[j].hid !== 1) { have = j; break; }   // never into a kept curse; F4b: a list that takes the same item more than once makes a new row
        if (have >= 0 && spec && spec.noQty) return { ok: false, reason: 'value' };   // F4b: no quantity — once each
        if (have >= 0) { extra.base = list[have].qty | 0; list[have].qty = clampNum(extra.base + n, 1, LIMITS.maxQty); extra.row = rowIdOf(list[have]); extra.qty = list[have].qty; extra.added = extra.qty - extra.base; }   // the same item again raises its quantity
        else {
            if (list.filter(function(r) { return !(isObj(r) && r.hid === 1); }).length >= LIMITS.carried) return { ok: false, reason: 'field' };   // kept curses never count against what the player sees
            var row = { defId: q.defId, qty: n };
            if (q.rowId !== undefined) {   // a new row's id: never one already in the list, never one an item's legacy row would derive (checked against the player's own view: a GM-only item's id is never confirmed)
                if (!rowIdFree(list, q.rowId, knownItems(sys, opts))) return { ok: false, reason: 'value' };
                row = { id: q.rowId, defId: q.defId, qty: n };
            }
            if (spec && isObj(spec.lvl)) row.lvl = lvlClamp(spec.lvl, typeof ent.lvl === 'number' ? ent.lvl : spec.lvl.def);   // F4b: the facts are written as it is added (a later default moves no row)
            if (spec && isObj(spec.on)) row.on = spec.on.def === true;
            if (spec && spec.price) row.paid = clampNum(rowStat(spec, ent, spec.price), 0, LIMITS.statAbs);   // F4c1: what one cost, from the host's own entry (its price stat, else the stat's default, else 0) — a recorded fact: a merged add keeps the first
            list.push(row); extra.base = 0; extra.row = rowIdOf(row); extra.qty = n; extra.added = n;
            if (row.on === true && RM_MODES[ent.eq] === 1 && opts.player) { extra.onRow = extra.row; extra.eqNote = ent.eq; }   // F4b: picked up already on — the equip lock's grace opens
        }
        var dN = have >= 0 ? ((rowDef(sys, list[have]) || {}).def || ent) : ent;   // F4c2 review: merged into a copy, its own lock and name tell the GM (a new row has no ov: the entry)
        if (RM_MODES[dN.rm] === 1) { extra.note = dN.rm; extra.name = dN.name || 'Item'; }
        if (extra.eqNote) extra.name = ent.name || 'Item';
    } else if (q.op === 'custom') {   // F4c3: a character's own row, made or changed
        var cu = applyCustom(sys, list, q, spec, F, opts, extra, actorSpec(sys, fieldId, spec, opts)); if (cu) return cu;
    } else {
        if (typeof q.rowId !== 'string' || !ROW_ID.test(q.rowId)) return { ok: false, reason: 'value' };
        if (q.op === 'ov' && (!spec || (opts.player && !(isObj(sys.listRules) && sys.listRules.ownerStats === true)))) return { ok: false, reason: 'field' };   // F4c2: a copy's own values need a list shaped in the Lists tab; its owner changes them only under Setting A (the rules of the system judged on: the host's, the client's view)
        var idx = at(q.rowId); if (idx < 0 || (opts.player && list[idx].hid === 1)) return { ok: false, reason: 'missing' };   // a kept curse reads as gone to a player
        extra.row = q.rowId;
        if (q.op === 'keep') {   // "Make custom" — a deleted entry's copy becomes the character's own item
            if (opts.player || !isObj(list[idx].snap)) return { ok: false, reason: 'field' };
            var wasHid = list[idx].hid === 1;
            var kr = { id: q.rowId, qty: list[idx].qty }; ['lvl', 'on', 'note', 'paid', 'keptOn'].forEach(function(k) { if (list[idx][k] !== undefined) kr[k] = list[idx][k]; }); kr.def = isObj(list[idx].ov) ? mergeOv(list[idx].snap, list[idx].ov) : list[idx].snap;   // F4b: its facts go with it (F4c1: what it cost; F4c2: its own values folded into its definition, the ov itself not kept)
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
            if (fx.lvl !== undefined) { if (!spec || !isObj(spec.lvl)) return { ok: false, reason: 'value' }; if (fx.lvl === null) delete rw.lvl; else { var nl = lvlNum(fx.lvl); if (nl === undefined || typeof fx.lvl !== 'number') return { ok: false, reason: 'value' }; rw.lvl = lvlClamp(spec.lvl, nl); } }
            if (fx.note !== undefined) { if (typeof fx.note !== 'string') return { ok: false, reason: 'value' }; var nn = cutText(fx.note, LIMITS.rowNote); if (nn) rw.note = nn; else delete rw.note; }
            if (fx.ct !== undefined) {   // Stage 6 HUD R2: its counters — each one its list has, a whole number from 0 to the row's own most
                var cst = spec && Array.isArray(spec.counters) ? spec.counters : null; if (!cst || !isObj(fx.ct)) return { ok: false, reason: 'value' };
                var nct = isObj(rw.ct) ? JSON.parse(JSON.stringify(rw.ct)) : {}, lfR = fieldById(sys, fieldId), rsR = null;
                for (var ckk in fx.ct) {
                    if (!Object.prototype.hasOwnProperty.call(fx.ct, ckk)) continue;
                    var tt = null; cst.forEach(function(t) { if (!tt && lower(t.key) === lower(ckk)) tt = t; }); if (!tt) return { ok: false, reason: 'value' };
                    var nvv = Number(fx.ct[ckk]); if (!fin(nvv)) return { ok: false, reason: 'value' }; nvv = Math.max(0, Math.min(1e6, Math.round(nvv)));
                    if (tt.max) { rsR = rsR || makeResolver(sys, char, F); var mxv = rsR.ctMax(lfR, rw, tt.key); if (typeof mxv === 'number') nvv = Math.min(nvv, mxv); }
                    nct[tt.key] = nvv;
                }
                rw.ct = nct;
            }
            if (fx.on !== undefined) {
                if (!spec || !isObj(spec.on) || typeof fx.on !== 'boolean') return { ok: false, reason: 'value' };
                var rdS = rowDef(sys, rw), emode = rdS && rdS.def && RM_MODES[rdS.def.eq] === 1 ? rdS.def.eq : '', wasOn = rw.on === true, enm = emode ? (rdS.def.name || 'Item') : '';   // stored: a row on only by the list's "starts on" was never switched on, so no lock holds it
                if (!opts.player) { rw.on = fx.on; delete rw.keptOn; }
                else if (fx.on) { rw.on = true; if (rw.keptOn === 1) delete rw.keptOn; else if (!wasOn && emode) { extra.onRow = q.rowId; extra.eqNote = emode; extra.name = enm; } }
                else if (rw.keptOn === 1) { /* they already see it off */ }
                else if (wasOn) {
                    var emsg = emode && typeof rdS.def.eqMsg === 'string' ? rdS.def.eqMsg : '';
                    if (emode === 'bound' && !opts.onGrace) return { ok: false, reason: 'stays', msg: emsg, name: enm, eq: true };
                    if (emode === 'curse') { rw.on = true; rw.keptOn = 1; extra.keptOn = true; extra.msg = emsg; extra.name = enm; }
                    else { rw.on = false; if (emode === 'bound') extra.onGraceUsed = true; }   // the grace let it go: spent
                } else rw.on = false;
            }
            extra.qty = rw.qty | 0;
        } else if (q.op === 'ov') {   // F4c2: a copy's own values — the GM's on a linked copy (the library's, or a deleted one's copy); its owner's on a library copy they can see, stats only (Setting A, above)
            var rwO = list[idx], rdO = rowDef(sys, rwO), pq = q.ov;
            if (!rdO || rdO.src === 'custom' || (!opts.player && rdO.src !== 'lib' && rdO.src !== 'lost')) return { ok: false, reason: 'field' };   // a custom row changes with its own op
            if (opts.player && (rdO.src !== 'lib' || valueOpts(opts.view || null).items[rwO.defId] !== 1)) return { ok: false, reason: 'missing' };   // an inline copy on the client is a GM-only entry or a deleted one's copy on the host: gone to both alike
            if (pq !== null && !isObj(pq)) return { ok: false, reason: 'value' };
            if (opts.player && pq !== null && Object.keys(pq).some(function(k) { return k !== 'stats'; })) return { ok: false, reason: 'field' };
            var prP = spec && typeof spec.price === 'string' && spec.price ? lower(spec.price) : '';   // F4c2 review: paid is the GM's — a player's stat change that can move the price first records what the row read (a recorded Paid never moves)
            if (opts.player && prP && typeof rwO.paid !== 'number' && (pq === null || (isObj(pq) && (pq.stats === null || (isObj(pq.stats) && Object.keys(pq.stats).some(function(k) { return lower(k) === prP; })))))) rwO.paid = clampNum(rowPaid(spec, rwO, rdO.def), 0, LIMITS.statAbs);
            var ovr = applyOv(rwO, rdO.base, pq, spec, F, !!opts.player, actorSpec(sys, fieldId, spec, opts)); if (ovr) return ovr;
            extra.qty = rwO.qty | 0;
        } else {
            var cur = list[idx].qty | 0, nq = 0, gr = isObj(opts.grace) ? Math.max(0, opts.grace.added | 0) : -1;   // gr: what the open pickup window may still take back (-1: none open)
            if (q.op === 'setQty') { nq = cleanNum(q.qty, NaN); if (!isFinite(nq)) return { ok: false, reason: 'value' }; nq = Math.min(Math.max(0, nq | 0), LIMITS.maxQty); }
            else if (q.op === 'undo') { var back = clampNum(cleanNum(q.qty, 0) | 0, 0, LIMITS.maxQty); if (gr >= 0) back = Math.min(back, gr); nq = Math.max(0, cur - back); }   // the host's own count wins: never more than was picked up
            var rd = rowDef(sys, list[idx]), rmode = rd && rd.def && RM_MODES[rd.def.rm] === 1 ? rd.def.rm : '';
            var eqOn = spec && isObj(spec.on) && list[idx].on === true && rd && rd.def && RM_MODES[rd.def.eq] === 1 ? rd.def.eq : '';   // F4b (owner, after the review): while it is on, its switch lock covers dropping it too
            var lmode = rmode === 'bound' || eqOn === 'bound' ? 'bound' : (rmode === 'curse' || eqOn === 'curse') ? 'curse' : '', byEq = !!lmode && rmode !== lmode, mode = opts.player ? lmode : '';
            var msg = mode ? ((byEq ? rd.def.eqMsg : rd.def.rmMsg) || '') : '', nm = lmode ? (rd.def.name || 'Item') : '';
            if (nq > cur) { extra.added = nq - cur; if (opts.player && rmode) { extra.note = rmode; extra.name = rd.def.name || 'Item'; } }   // more of it: a pickup (the Undo, the GM's notice)
            var inGr = gr >= 0 && cur - nq <= gr;
            if (mode === 'bound' && nq < cur && !inGr) {
                if (!(byEq && opts.onGrace)) { var st0 = { ok: false, reason: 'stays', msg: msg, name: nm }; if (byEq) st0.eq = true; return st0; }
                extra.onGraceUsed = true;   // the switch's grace let it go: spent
            }
            if (nq < cur) extra.undone = cur - nq;
            if (mode === 'curse' && nq <= 0) {   // it leaves their sheet; the GM keeps it on the character, under an id the player never held
                var kept = JSON.parse(JSON.stringify(list[idx])); kept.id = uid('w_'); kept.hid = 1; list[idx] = kept;
                extra.hid = true; extra.msg = msg; extra.name = nm; extra.qty = 0;
            } else if (nq <= 0) { list.splice(idx, 1); extra.qty = 0; }
            else { list[idx].qty = clampNum(nq, 1, LIMITS.maxQty); extra.qty = list[idx].qty; }
        }
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
function actorSpec(sys, fieldId, spec, opts) { if (!opts || !opts.player || !isObj(opts.view)) return spec; var vf = fieldById(opts.view, fieldId); return vf && isObj(vf.list) ? vf.list : null; }
function statDefOf(spec, key) { var st = null; (isObj(spec) && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(x) { if (!st && isObj(x) && typeof x.key === 'string' && lower(x.key) === lower(key)) st = x; }); return st; }
// F5a2: a choice's value as the list spells its label, or '' (not a string, or no option of the actor's has it)
function pickLabel(aspec, key, v) { var st = statDefOf(aspec, key), out = ''; if (!st || st.kind !== 'pick' || typeof v !== 'string') return ''; (st.opts || []).forEach(function(o) { if (!out && lower(o.label) === lower(v.trim())) out = o.label; }); return out; }
function applyOv(rw, base, pq, spec, F, player, aspec) {   // aspec (F5a2): the actor's own list options (a choice's label is judged against them)
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
                var t = k === 'icon' ? cleanIcon(v) : k === 'notes' ? str(v, LIMITS.text).replace(CTRL_RE_G, ' ') : cutText(v, k === 'name' ? LIMITS.name : k === 'category' ? LIMITS.category : LIMITS.rmMsg);
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
                    if (player && isHeld(canon)) return { ok: false, reason: 'field' };   // Q1 (A): a stat the GM set holds
                    if (sx === null) { dropStat(canon); unHold(canon); continue; }
                    var sPick = (statDefOf(spec, canon) || {}).kind === 'pick';   // F5a2: a choice's value is one of the actor's option labels
                    if (sPick) { sx = pickLabel(aspec === undefined ? spec : aspec, canon, sx); if (!sx) return bad; }
                    else if (statNum(sx) === undefined) return bad;
                    dropStat(canon); unHold(canon);
                    if (sPick ? lower(sx) !== lower(rowStat(spec, base, canon)) : sx !== rowStat(spec, base, canon)) { cur.stats = isObj(cur.stats) ? cur.stats : {}; cur.stats[canon] = sx; if (!player) held.push(canon); }
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
function rowIdFree(list, rid, known) { return typeof rid === 'string' && ROW_ID.test(rid) && !list.some(function(r) { return rowIdOf(r) === rid; }) && !known.some(function(it) { return isObj(it) && typeof it.id === 'string' && 'w_' + it.id.slice(2) === rid; }); }
function knownItems(sys, opts) { return opts.player ? (opts.view && Array.isArray(opts.view.items) ? opts.view.items : []) : (Array.isArray(sys.items) ? sys.items : []); }
// F4c3 (D2): whether a key is taken in a list — by another row's definition (rowDef: a library copy, a deleted item's copy, a custom row) or by
// an item the list offers (its categories; a players' view's empty list offers none; none named: every item). Judged on what the actor can see:
// a player never counts a row kept out of their sight or a GM-only one and reads the items of their own view, so a GM-only key is never
// confirmed and the host and their client agree. The row itself (rid) never counts
function keyClash(sys, list, rid, key, spec, opts) {
    var lk = lower(key), pl = !!opts.player, cats = isObj(spec) && Array.isArray(spec.cats) ? spec.cats : null;
    var inRows = list.some(function(r) {
        if (!isObj(r) || rowIdOf(r) === rid || (pl && r.hid === 1)) return false;
        var rd = rowDef(sys, r), d = rd ? rd.def : null; if (!isObj(d) || (pl && d.vis === 'gm')) return false;
        return typeof d.key === 'string' && lower(d.key) === lk;
    });
    return inRows || knownItems(sys, opts).some(function(it) { return isObj(it) && !(pl && it.vis === 'gm') && typeof it.key === 'string' && lower(it.key) === lk && (!cats || catIn(cats, it.category)); });
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
var CUSTOM_OWN = Object.freeze({ name: 1, icon: 1, category: 1, notes: 1, key: 1, stats: 1 });
function applyCustom(sys, list, q, spec, F, opts, extra, aspec) {   // aspec (F5a2): the actor's own list options
    var pl = !!opts.player, pd = q.def, rid = q.rowId, bad = { ok: false, reason: 'value' };
    var blank = function(x) { return x === null || (typeof x === 'string' && !x.trim()); }, said = function(x) { return typeof x === 'string' && !!x.trim(); };
    if (!spec || (pl && spec.custom !== true)) return { ok: false, reason: 'field' };   // a list shaped in the Lists tab (the GM); its Custom rows ticked (a player)
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
            var t = k === 'icon' ? cleanIcon(v) : k === 'notes' ? str(v, LIMITS.text).replace(CTRL_RE_G, ' ') : cutText(v, k === 'name' ? LIMITS.name : k === 'category' ? LIMITS.category : LIMITS.rmMsg);
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
    rw.def = d; extra.row = rid; extra.qty = rw.qty | 0;   // critic 9d: every answer carries its quantity (without it the pickup's Undo would come down on the first change)
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
var REACH_KEYS = ['name', 'icon', 'category', 'notes', 'area', 'damage', 'cost', 'throwSkill', 'rm', 'rmMsg', 'eq', 'eqMsg', 'key', 'lvl', 'vis'];
var REACH_WORD = Object.freeze({ name: 'name', icon: 'icon', category: 'category', notes: 'notes', area: 'blast', damage: 'damage', cost: 'cost formula', rm: 'removal lock', rmMsg: 'removal message', eq: 'switch lock', eqMsg: 'switch message' });
function itemReach(prevSys, sys, chars) {
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
                    if (!isObj(r) || r.defId !== it.id || r.snap) return;
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
function fxIndex(sys, char) {
    var idx = null, lib = null, byId = null, seenRef = map();   // a library effect counts once per character, whichever list holds it
    (sys && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (f.kind !== 'effects') return;
        var rows = char && char.values && Array.isArray(char.values[f.id]) ? char.values[f.id] : null; if (!rows || !rows.length) return;
        if (!byId) { byId = map(); sys.fields.forEach(function(x) { byId[x.id] = x; }); }
        rows.forEach(function(r) {
            if (!isObj(r) || r.on === false) return;
            var def = r;
            if (typeof r.ref === 'string') { if (seenRef[r.ref]) return; if (!lib) { lib = map(); (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (d && typeof d.id === 'string') lib[d.id] = d; }); } def = lib[r.ref]; if (!def) return; seenRef[r.ref] = 1; }
            (Array.isArray(def.mods) ? def.mods : []).forEach(function(m) {
                var tf = isObj(m) ? byId[m.f] : null; if (!tf) return;
                if (m.op === 'on') { if (tf.kind !== 'toggle') return; }
                else if (m.op === 'add') { if (typeof m.v !== 'number' || !isFinite(m.v)) return; if (m.part === 'max' ? tf.kind !== 'resource' : !(tf.kind === 'number' || tf.kind === 'skill' || tf.kind === 'formula')) return; }
                else return;
                var key = lower(tf.key) + (m.part === 'max' ? '.max' : '');
                idx = idx || map(); var slot = idx[key] || (idx[key] = { add: 0, on: false, src: [] });
                if (m.op === 'on') slot.on = true; else slot.add += m.v;
                if (slot.src.length < 12) slot.src.push({ name: def.name || 'Effect', op: m.op, v: m.op === 'add' ? m.v : 0, gm: def.vis === 'gm' });
            });
        });
    });
    return idx;
}
// Stage 5h Fold 3: facing. A token faces rot + front (0 = up, clockwise, as in fog.js and whiteboard.js); threat marks are world bearings on
// the token (w.threats, the first the active one), one per side of the dial (6 on a hex or gridless map, 4 on a square one). A threat's arc
// counts sides from the one the token faces, so a free-angle token reads the side the dial shows: on a hex grid that side and the two beside
// it are front, the next two side, the back one rear (ShadowBase's 3 / 2 / 1); on a square grid 1 / 2 / 1. Pure; a token's values from a
// save or the wire are re-checked here.
var FACING_NAMES = Object.freeze(['Facing', 'Arc', 'Arc.front', 'Arc.side', 'Arc.rear', 'Threats', 'Threats.front', 'Threats.side', 'Threats.rear']);
// Stage 6: the token's stance — Posture (the index of its posture below; 0 standing) and Elevation (yards), each 0 while its VTT feature is off
var POSTURE_IDS = Object.freeze(['standing', 'crouching', 'sitting', 'kneeling', 'crawling', 'lying-prone', 'lying-face-up']);
var POSTURE_NAMES = Object.freeze(['Standing', 'Crouching', 'Sitting', 'Kneeling', 'Crawling', 'Lying prone', 'Lying face up']);
var TOKEN_NAMES = Object.freeze(FACING_NAMES.concat(['Posture', 'Elevation', 'CombatRound']));   // HUD frame (HF5b): CombatRound, the round of the combat on the token's map (round is the rounding function)
function postureIndex(v) {   // the same reading as the map's chip (whiteboard.js normalizePosture): the ids, the 1.4.6 ids, the handbook's long names
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
    return { posture: flags.posture ? postureIndex(tok.posture) : 0, elevation: flags.elevation ? e : 0 };
}
function tokenCtx(map, tok, flags) {   // everything a token gives the built-in names: { facing, stance } (flags: { turning, posture, elevation }), or null with no token
    if (!isObj(tok) || !isObj(flags)) return null;
    return { facing: facingCtx(map, tok, !!flags.turning), stance: stanceCtx(tok, flags) };
}
// HUD frame (HF5b): the combat round merged into a token context (tokenCtx stays pure) — a NEW object, or the context unchanged with no token
// (CombatRound reads 0 then) or no valid round. The round is whole and within 0..9999, as the wire's combats are
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
function facingCtx(map, tok, on) {   // what the facing names read for one token on one map: { deg, sides, threats }, or null (facing off, no token, a facing that is not a number)
    if (!on || !isObj(tok)) return null;
    var rot = tok.rot === undefined || tok.rot === null ? 0 : tok.rot, fr = tok.front === undefined || tok.front === null ? 0 : tok.front;   // numbers only: a host's object is refused, never converted (its valueOf can throw)
    if (typeof rot !== 'number' || typeof fr !== 'number' || !isFinite(rot) || !isFinite(fr) || Math.abs(rot) > 1e6 || Math.abs(fr) > 1e6) return null;
    var gt = isObj(map) && isObj(map.meta) ? map.meta.gridType : null, sides = gt === 'square' ? 4 : 6, deg = (rot + fr) % 360; if (deg < 0) deg += 360;
    var th = [];   // each mark on its side, one per side (a mark set on a hex map keeps meaning one side after the grid turns square)
    cleanThreats(tok.threats).forEach(function(b) { var s = sideOf(b, sides); if (th.some(function(x) { return sideOf(x, sides) === s; })) return; var v = norm180(s * 360 / sides); th.push(v === -180 ? 180 : v); });
    return { deg: deg, sides: sides, threats: th };
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
// What a player may have in play: their characters that are not NPCs and not drafts
function playableChars(camp, pid) {
    var cs = charsIn(camp), out = [];
    if (typeof pid !== 'string' || !pid) return out;
    Object.keys(cs).forEach(function(id) { var c = cs[id]; if (isObj(c) && c.id === id && c.npc !== true && !c.draft && c.ownerId === pid) out.push(c); });
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
// copy back). Tokens of a kept character, an NPC, a draft or an unowned character have no owner; a token linked to a missing character is
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
                if (!(c.ownerId && c.npc !== true && !c.draft && (!act || act[c.ownerId] === c.id))) { if (w.ownerId) ops.push({ mapId: m.id, wbId: w.id, ownerId: '' }); return; }
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
        if ((t = find(wb, function(w) { return named(w) && !w.ownerId && !w.hidden && !w.charRef; }))) return { op: 'link', tok: t, mapId: m.id, here: true, charId: cid };
        if ((e = elsewhere(namedMine))) return { op: 'link', tok: e.tok, mapId: e.mapId, here: false, charId: cid };   // an unowned namesake elsewhere (a GM's NPC, a room roster token) is never captured for good
        return opts && opts.noSpawn ? { op: 'none' } : { op: 'spawn', charId: cid };
    }
    if ((t = find(wb, function(w) { return w.isChar && w.ownerId === pid; }))) return { op: 'keep', tok: t, mapId: m.id };
    if (prefer && prefer.isChar && prefer.ownerId === pid && !prefer.charId) return { op: 'clone', tok: prefer, mapId: null };
    var rec = playerRec(camp, pid), nm = rec && typeof rec.charName === 'string' ? rec.charName : '';
    if (!nm) return { op: 'none' };
    var legacy = function(w) { return w.isChar && w.charName === nm && (!w.charId || w.ownerId === pid) && (!w.ownerId || w.ownerId === pid); };
    if ((t = find(wb, function(w) { return legacy(w) && !w.ownerId && !w.hidden; }))) return { op: 'adopt', tok: t, mapId: m.id };
    if ((e = elsewhere(function(w) { return legacy(w) && w.ownerId === pid; }) || elsewhere(legacy))) return { op: 'clone', tok: e.tok, mapId: e.mapId };
    return { op: 'none' };
}
// "What a player plays", for labels: the character in play, else the old name binding
function playsAs(camp, pid) { var a = activeCharOf(camp, pid); if (a.id) return charsIn(camp)[a.id].name; var rec = playerRec(camp, pid); return rec && typeof rec.charName === 'string' ? rec.charName : ''; }
// The dial's ring click (ShadowBase's cycle): a side with no mark is marked (the active threat when it is the first, else queued); the
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
function makeResolver(sys, char, F, ropts) {   // ropts.noFx: the values with no effect applied (the breakdown's true base); ropts.facing / ropts.stance: tokenCtx(...) for the built-in token names
    var ix = keyIndex(sys), cache = map(), chain = [], fx = (ropts && ropts.noFx) ? null : fxIndex(sys, char), detail = map();
    var lctx = map(), asts = map(), pretty = map();   // Stage 6 F5a1: each list's rows (once a render), each column formula parsed once, readable names for a loop's message
    // 5h: where a derived value's effects came from — the sources recorded on the names its formula read (theirs and their own "via")
    function viaOf(names) {
        if (!fx || !Array.isArray(names)) return null;
        var out = [], seen = map();
        names.forEach(function(n) {
            var nm = n && typeof n.name === 'string' ? n.name : null, d = nm ? detail[lower(nm)] : null; if (!d) return;
            d.mods.forEach(function(m) { var sk = nm + '|' + m.name + '|' + m.op + '|' + m.v; if (seen[sk] || out.length >= 12) return; seen[sk] = 1; out.push({ through: nm, name: m.name, op: m.op, v: m.v, gm: m.gm }); });
            d.via.forEach(function(m) { var sk = m.through + '|' + m.name + '|' + m.op + '|' + m.v; if (seen[sk] || out.length >= 12) return; seen[sk] = 1; out.push(m); });
        });
        return out.length ? out : null;
    }
    // 5h: a value with its effects applied (a toggle switched on; a number added to, kept within the wire-safe range), the sources recorded
    function withFx(l, v, via) {
        var s = fx ? fx[l] : null; if (!s && !via) return v;
        var out = v;
        if (s) { if (s.on) out = true; else if (typeof out === 'number') { out = out + s.add; if (out > 1e15) out = 1e15; else if (out < -1e15) out = -1e15; } }
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
        if (w === 'on') return x.virt ? false : rowOn(L.spec, x.r);
        if (w === 'has') return !x.virt;
        if (w === 'paid') return rowPaid(L.spec, x.r, x.d);
        if (L.st[w]) { if (L.st[w].kind !== 'pick') return rowStat(L.spec, x.d, L.st[w].key); var lb = rowStat(L.spec, x.d, L.st[w].key), op = null; (L.st[w].opts || []).forEach(function(o) { if (!op && lower(o.label) === lower(lb)) op = o; }); if (!op) return 0; var ov = fn(op.name); return ov === undefined ? { error: { message: 'Unknown name "' + op.name + '"', pos: 0, len: 0 } } : ov; }   // F5a2: a choice reads its option's value (ST); none chosen: 0
        if (L.cl[w]) return colVal(L, x, L.cl[w]);
        if (L.ct && L.ct[w]) return x.virt ? 0 : rowCt(x.r, L.ct[w]);   // Stage 6 HUD R2: a counter (a row not carried: 0)
        return undefined;
    }
    function rowVars(L, x) {   // a column's names: Row.* reads this row, every other name the resolver (one cache)
        var v = function(name) { var l = lower(name); if (l.slice(0, 4) === 'row.') { var w = l.slice(4); return w.indexOf('.') < 0 ? rowVal(L, x, w) : undefined; } return fn(name); };
        v.detail = function(name) { return detail[lower(name)] || null; };
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
        cache[canon] = res.value; return res.value;
    }
    function totalOf(L, l, w, onlyOn) {   // L.count | L.qty | L.paid | L.<stat> | L.<col> (L.on.* over the rows switched on): a stat and paid per unit × qty, a column summed (true counts 1); the first row error wins
        if (l in cache) return cache[l];
        if (w !== 'count' && w !== 'qty' && w !== 'paid' && !L.st[w] && !L.cl[w]) return undefined;
        if (L.st[w] && L.st[w].kind === 'pick') return undefined;   // F5a2: a choice has no total
        if (chain.indexOf(l) >= 0) return loopError(l);
        chain.push(l);
        var sum = 0, err = null;
        for (var i = 0; i < L.rows.length && !err; i++) {
            var x = L.rows[i]; if (onlyOn && !rowOn(L.spec, x.r)) continue;
            var qn = L.spec && L.spec.noQty ? 1 : (x.r.qty | 0);
            if (w === 'count') { sum += 1; continue; }
            if (w === 'qty') { sum += qn; continue; }
            var v = rowVal(L, x, w);
            if (v && typeof v === 'object' && v.error) { err = v; break; }
            var nv = v === true ? 1 : (typeof v === 'number' && isFinite(v) ? v : 0);
            sum += (w === 'paid' || L.st[w]) ? nv * qn : nv;
        }
        chain.pop();
        if (err) return err;
        if (sum > 1e15) sum = 1e15; else if (sum < -1e15) sum = -1e15;
        cache[l] = sum; return sum;
    }
    function findRow(L, key) {   // L.<Key>.*: the first carried row with that key, the rows its owner can see first (critic 7); else the library entry with it in L's scope; else a row of defaults
        var hit = null, gmHit = null;
        L.rows.forEach(function(x) { if (hit || !x.d || typeof x.d.key !== 'string' || lower(x.d.key) !== key) return; if (x.d.vis === 'gm') { if (!gmHit) gmHit = x; } else hit = x; });
        if (hit || gmHit) return hit || gmHit;
        var cats = L.spec && Array.isArray(L.spec.cats) ? L.spec.cats : null, ent = null;
        (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) { if (!ent && isObj(it) && typeof it.key === 'string' && lower(it.key) === key && (!cats || catIn(cats, it.category))) ent = it; });
        return ent ? { r: { defId: ent.id, qty: 0 }, d: ent, id: 'k:' + key, virt: true } : { r: { qty: 0 }, d: null, id: 'k:' + key, virt: true };
    }
    function listName(l, name) {   // a name on a carried list, or undefined (then the rest of the lookup); name: as written (a loop's message)
        var segs = l.split('.'), f = ix[segs[0]]; if (!f || f.kind !== 'item-list' || segs.length < 2 || segs.length > 3) return undefined;
        var L = listCtx(f); if (typeof name === 'string' && !pretty[l]) pretty[l] = name;
        if (segs.length === 2) return totalOf(L, l, segs[1], false);
        if (segs[1] === 'on') return totalOf(L, l, segs[2], true);
        var w = segs[2]; if (w !== 'lvl' && w !== 'qty' && w !== 'on' && w !== 'has' && w !== 'paid' && !L.st[w] && !L.cl[w] && !(L.ct && L.ct[w])) return undefined;   // R2: or a counter
        if (l in cache) return cache[l];
        var v = rowVal(L, findRow(L, segs[1]), w);
        if (v && typeof v === 'object' && v.error) return v;
        cache[l] = v; return v;
    }
    function builtin(l) {   // 5h Fold 3: Facing, Arc, Arc.front|side|rear, Threats, Threats.front|side|rear — a field named Facing, Arc or Threats keeps its whole family
        var fam = l.split('.')[0]; if (ix[fam]) return undefined;
        if (l === 'combatround') { var cb = ropts && isObj(ropts.combat) ? ropts.combat : null; return cb && fin(cb.round) ? Math.max(0, Math.floor(cb.round)) : 0; }   // HUD frame (HF5b): the round of the combat on the token's map; 0 with no token, no combat, or offline (a field of the system's own keeps the name, above)
        if (l === 'posture' || l === 'elevation') { var stc = ropts && isObj(ropts.stance) ? ropts.stance : null; return stc && typeof stc[l] === 'number' ? stc[l] : 0; }   // Stage 6: the token's stance
        if (fam !== 'facing' && fam !== 'arc' && fam !== 'threats') return undefined;
        return facingValue(ropts && ropts.facing ? ropts.facing : null, l);
    }
    function fn(name) {
        var l = lower(name);
        if (l in cache) return cache[l];
        var field = ix[l], suffix = null;
        if (!field && l.indexOf('.') > 0) { var lnv = listName(l, name); if (lnv !== undefined) return lnv; }   // Stage 6 F5a1: a carried list's totals and addressed rows (after the exact key, before the suffixes)
        if (!field) { var dot = l.lastIndexOf('.'); if (dot > 0 && RESERVED_SUFFIX[l.slice(dot + 1)]) { field = ix[l.slice(0, dot)]; suffix = l.slice(dot + 1); } }
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
            if (suffix && suffix !== 'max' && suffix !== 'cur') return undefined;
            var stored = storedOf(field, char);   // { cur } — cur null means "full" (def: 'max')
            if (suffix === 'max') { r = (field.maxFormula || field.maxFormula === null) ? evalDef(l, field.maxFormula) : { value: field.min || 0 }; if (r.error) return r; out = withFx(l, r.value, r.via || null); }   // l is already "key.max": one chain name, so a max naming itself is reported as the loop it is
            else if (stored.cur === null) { var mxv = fn(field.key + '.max'); if (mxv && typeof mxv === 'object' && mxv.error) return mxv; out = withFx(l, mxv, viaOf([{ name: field.key + '.max' }])); }   // a full pool reads its max through the resolver (worked out once, cached)
            else out = stored.cur;
        } else if (k === 'formula') { if (suffix) return undefined; r = evalDef(l, field.formula); if (r.error) return r; out = withFx(l, r.value, r.via || null); }
        else return undefined;
        cache[l] = out;   // values only; an error is path-dependent and is never cached
        return out;
    }
    fn.reset = function() { cache = map(); chain = []; detail = map(); lctx = map(); pretty = map(); };
    fn.row = function(fieldId, rowId) { var f = null; sys.fields.forEach(function(x) { if (!f && x.id === fieldId && x.kind === 'item-list') f = x; }); if (!f) return null; var L = listCtx(f); for (var i = 0; i < L.rows.length; i++) if (L.rows[i].id === rowId) return rowVars(L, L.rows[i]); return null; };   // F5b: a row's own names for a roll on it (a kept curse has none)
    fn.ctMax = function(f, row, key) { var L = f ? listCtx(f) : null, t = L && L.ct ? L.ct[lower(key)] : null; if (!t || !t.max || !isObj(row)) return null; var rd = rowDef(sys, row), v = F.evaluate(t.max, { vars: rowVars(L, { r: row, d: rd ? rd.def : null, id: rowIdOf(row) || '' }), random: noDice }); return v.ok && typeof v.value === 'number' && fin(v.value) ? Math.max(0, Math.floor(v.value)) : null; };   // Stage 6 HUD R2: a counter's most for this row (none: null)
    fn.cell = function(f, row, colKey) { var L = listCtx(f), c = L.cl[lower(colKey)]; if (!c || !isObj(row)) return undefined; var rd = rowDef(sys, row); return colVal(L, { r: row, d: rd ? rd.def : null, id: rowIdOf(row) || '' }, c); };   // F5a1: one row's column (the sheet's cells)
    fn.chain = function() { return chain.slice(); };
    fn.detail = function(name) { return detail[lower(name)] || null; };   // 5h: { base, mods: [{name, op, v, gm}], via: [{through, name, op, v, gm}] } or null
    return fn;
}
// Stage 6: a caption's {…} — "±X" (or "+/-X") shows X with its sign (+2, -1, +0); the sign is never formula syntax, so no older caption reads differently
function capExpr(s) { var t = String(s).trim(), m = /^(\u00b1|\+\/-)\s*/.exec(t); return m ? { expr: t.slice(m[0].length), signed: true } : { expr: t, signed: false }; }
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
function captionParts(sys, char, F, text, vars) {   // vars: the render's own resolver (resolveAll(...).vars), so a caption reads values already worked out
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
        out.push({ value: v, text: typeof v === 'number' ? (ce.signed ? (v < 0 && mag !== '0' ? '-' : '+') + mag : fmtNum(v)) : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v).slice(0, 60) });
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
}
// Every field's value for a render: { fieldId: { value, text, error, max } } (max for resources)
function resolveAll(sys, char, F, tctx, ropts) {   // tctx: tokenCtx(...) = { facing, stance } for the built-in token names (Facing, Arc, Threats, Posture, Elevation); none reads them neutral; ropts.noRows (F5a1): no list cells or totals (the hover card)
    var ro = isObj(tctx) ? { facing: tctx.facing || null, stance: tctx.stance || null, combat: isObj(tctx.combat) ? tctx.combat : null } : null;   // HF5b: the combat's round too
    var r = makeResolver(sys, char, F, ro), out = map(), r0 = null;
    var base0 = function(name) { r0 = r0 || makeResolver(sys, char, F, { noFx: true, facing: ro ? ro.facing : null, stance: ro ? ro.stance : null, combat: ro ? ro.combat : null }); var v = r0(name); return (typeof v === 'number' || typeof v === 'boolean') ? v : undefined; };
    Object.defineProperty(out, 'vars', { value: r });   // Fold B: the warm resolver, for captions (not enumerable: every field loop over the result is unchanged)
    sys.fields.forEach(function(f) {
        var e = { value: undefined, text: '', error: null };
        var k = f.kind;
        if (k === 'text' || k === 'select' || k === 'notes') { e.value = storedOf(f, char); e.text = String(e.value); }
        else if (k === 'item-list') { e.value = storedOf(f, char); e.text = ''; if (!(ropts && ropts.noRows) && f.list && Array.isArray(f.list.cols) && f.list.cols.length) listCells(f, e, r); if (!(ropts && ropts.noRows) && f.list && Array.isArray(f.list.counters) && f.list.counters.length) listCts(f, e, r); }   // a carried list; sheets.js renders it, not a number. F5a1: its columns' cells and totals
        else if (k === 'effects') { e.value = storedOf(f, char); e.text = ''; e.active = activeEffects(sys, e.value); }   // 5h: the rows; e.active names the ones switched on
        else if (k === 'toggle' || k === 'number') { var tv = r(f.key); e.value = (tv === undefined || (tv && typeof tv === 'object')) ? storedOf(f, char) : tv; e.text = fmtNum(e.value); }   // 5h: through the resolver, so an effect shows
        else {
            var v = r(f.key);
            if (v && typeof v === 'object' && v.error) { e.error = v.error.message; e.text = '—'; }
            else { e.value = v; e.text = fmtNum(v); }
            if (k === 'resource') { var m = r(f.key + '.max'); if (m && typeof m === 'object' && m.error) { e.max = null; if (!e.error) e.error = m.error.message; } else { e.max = m; e.text = fmtNum(e.value) + ' / ' + fmtNum(m); } }
            if (k === 'skill') { var rk = r(f.key + '.ranks'); e.ranks = rk; }
        }
        var dt = (k === 'number' || k === 'toggle' || k === 'formula' || k === 'skill') ? r.detail(f.key) : null;   // 5h: where the value came from — only when an effect touched it
        if (dt) { var b0 = base0(f.key); e.base = b0 !== undefined ? b0 : dt.base; e.mods = dt.mods; e.via = dt.via; }
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
function listCells(f, e, r) {
    var rows = Array.isArray(e.value) ? e.value : [], cells = map(), foot = map();
    rows.forEach(function(row) {
        var id = rowIdOf(row); if (!id) return;
        cells[id] = f.list.cols.map(function(c) { var v = r.cell(f, row, c.key); return v && typeof v === 'object' && v.error ? { key: c.key, error: String(v.error.message || 'error'), text: '\u2014' } : { key: c.key, value: v, text: colText(c, v) }; });
    });
    var tot = function(k) { var v = r(f.key + '.' + k); return v && typeof v === 'object' && v.error ? { error: String(v.error.message || 'error'), text: '\u2014' } : v === undefined ? null : { value: v, text: statNumText(v) }; };
    f.list.cols.forEach(function(c) { if (c.foot === true) { var t = tot(c.key); if (t) foot[c.key] = t; } });
    (Array.isArray(f.list.stats) ? f.list.stats : []).forEach(function(s) { if (s.show === true && !(Array.isArray(s.labels) && s.labels.length)) { var t = tot(s.key); if (t) foot[s.key] = t; } });
    e.cells = cells; e.foot = foot;
}
// Stage 6 HUD R2: a list's counters for the sheet — e.cts: rowId -> [{ key, label, value, max }] (max: the row's own most worked out, else null)
function listCts(f, e, r) {
    var cts = map();
    (Array.isArray(e.value) ? e.value : []).forEach(function(row) { var id = rowIdOf(row); if (!id) return; cts[id] = f.list.counters.map(function(t) { return { key: t.key, label: t.label || t.key, value: rowCt(row, t), max: r.ctMax(f, row, t.key) }; }); });
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
// 5h: a value's breakdown as plain text — "12 = 10 base · Rage +2", and on a derived value "· Rage +2 on ST"
function fxText(e, max) {
    var base = max ? e.maxBase : e.base, mods = (max ? e.maxMods : e.mods) || [], via = (max ? e.maxVia : e.via) || [];
    if (!mods.length && !via.length) return '';
    var amt = function(m) { return (m.v >= 0 ? '+' : '\u2212') + fmtNum(Math.abs(m.v)); };
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
function headerEntry(f, e) {
    if (!f || !e) return null;
    if (f.kind === 'toggle') return e.value === true ? { chip: true, text: f.label } : null;
    if (e.error) return { text: '\u2014', error: String(e.error) };
    if (e.text === undefined || e.text === null || e.text === '') return { text: '\u2014', empty: true };
    var numeric = (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill') && typeof e.value === 'number' && !e.label;   // a named value is a word, never red or green
    var out = { text: f.unit && !e.label ? e.text + ' ' + f.unit : e.text };   // Stage 6: a named value is a word (no unit)
    if (numeric && e.value < 0) out.neg = true; else if (numeric && f.sign && e.value > 0) out.pos = true;
    var why = fxText(e) || (f.kind === 'resource' ? fxText(e, true) : ''); if (why) out.why = why;   // 5h: where the number came from
    return out;
}
// "HP 7 / 14 · Prone" — the hover card and the party strip; a field that errors here is skipped, never printed as an error
function hoverLines(sys, char, F, tctx) {
    var all = resolveAll(sys, char, F, tctx, { noRows: true }), lines = [];   // F5a1: no list cells (critic 17)
    sys.fields.forEach(function(f) {
        if (!f.hover) return;
        var e = all[f.id]; if (!e || e.error) return;
        if (f.kind === 'toggle') { if (e.value === true) lines.push(f.label); return; }
        if (f.kind === 'notes') return;
        if (f.kind === 'effects') { if (e.active && e.active.length) lines.push(f.label + ' ' + e.active.map(function(a) { return a.name; }).join(', ')); return; }   // 5h
        if (e.text) lines.push(f.label + ' ' + e.text);
    });
    return lines;
}

/* ---------- the validator behind the editor ---------- */
function validateSystem(sys, F) {
    var errors = [], warnings = [];
    if (!sys || !F) return { ok: false, errors: [{ message: 'No system.' }], warnings: warnings };
    var keys = sys.fields.map(function(f) { return f.key; }), lowerKeys = keys.map(lower), ix = keyIndex(sys);
    var known = map(); sys.fields.forEach(function(f) { known[lower(f.key)] = f; if (f.kind === 'resource') { known[lower(f.key) + '.max'] = f; known[lower(f.key) + '.cur'] = f; } if (f.kind === 'skill') { known[lower(f.key) + '.ranks'] = f; known[lower(f.key) + '.base'] = f; } if (f.kind === 'number') known[lower(f.key) + '.base'] = f; });   // 5h: "ST.base" is the stored number, before effects (a points cost reads it)
    TOKEN_NAMES.forEach(function(n) { var l = lower(n), fam = l.split('.')[0]; if (!ix[fam] && !known[l]) known[l] = { id: '', key: n, kind: fam === 'arc' && l !== 'arc' ? 'toggle' : 'number', vis: 'all' }; });   // 5h Fold 3: the facing names (a field named Facing, Arc or Threats keeps the family)
    var edges = map(), gmP = gmPools(sys, F);   // a pool whose max is GM-only: players see none of it
    // Stage 6 F5a1: the names a carried list offers — totals (L.count|qty|paid|<stat>|<col>), L.on.<same>, an addressed row (L.<Key>.lvl|qty|on|has|
    // paid|<stat>|<col>) — and a row's own inside its list's columns (Row.<word>): a target like a field's (key: the loop graph's node, a column's
    // own; noEdge: nothing worked out behind it), or null. A Row.* name outside a list's columns reads { rowOutside }
    var lsts = map(), gmKsV = gmEntryKeys(sys, sys.fields); sys.fields.forEach(function(f) { if (f.kind === 'item-list') lsts[lower(f.key)] = f; });
    function listWords(lf) { var w = map(), sp = isObj(lf.list) ? lf.list : {}; (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') w[lower(x.key)] = x.kind === 'pick' ? 'pick' : 'stat'; }); (Array.isArray(sp.cols) ? sp.cols : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') w[lower(x.key)] = 'col'; }); (Array.isArray(sp.counters) ? sp.counters : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string' && !w[lower(x.key)]) w[lower(x.key)] = 'ctr'; }); return w; }   // R2: counters
    function wordTarget(lf, word, total) {
        var w = listWords(lf), node = 'l#' + lower(lf.key);
        if (w[word] === 'col') return { id: '', key: node + '.' + word, kind: 'number', vis: lf.vis, list: lf };
        if (w[word] === 'ctr') return total ? { ctrTotal: true, list: lf } : { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // Stage 6 HUD R2: a counter is one row's; it has no total
        if (w[word] === 'pick') return total ? { pickTotal: true, list: lf } : { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // F5a2: a choice reads its option's value; it has no total
        if (w[word] === 'stat' || word === 'qty' || word === 'paid' || (total ? word === 'count' : word === 'lvl')) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };
        if (!total && (word === 'on' || word === 'has')) return { id: '', key: node, kind: 'toggle', vis: lf.vis, list: lf, noEdge: true };
        return null;
    }
    function listTarget(n, rowList) {
        var sg = lower(n).split('.');
        if (sg[0] === 'row' && sg.length === 2 && !ix.row) return rowList ? wordTarget(rowList, sg[1], false) : { rowOutside: true };
        var lf = lsts[sg[0]]; if (!lf || sg.length < 2 || sg.length > 3) return null;
        if (sg.length === 2) return wordTarget(lf, sg[1], true);
        if (sg[1] === 'on') { var to = wordTarget(lf, sg[2], true); if (to) to.onTotal = true; return to; }
        var ta = wordTarget(lf, sg[2], false); if (!ta) return null;
        ta.addr = sg[1]; if (gmKsV[lower(lf.key)] && gmKsV[lower(lf.key)][sg[1]] === 1) ta.gmKey = true;
        return ta;
    }
    function listT(n) { var t = listTarget(n, null); return t && !t.rowOutside ? t : null; }   // captions and labels: never inside a column
    function isRollProp(p) { return p === 'roll' || p === 'rollFormula' || (typeof p === 'string' && p.indexOf('list.roll.') === 0); }   // F5b: a list's roll is a roll
    function isApplyProp(p) { return typeof p === 'string' && (p.indexOf('apply.') === 0 || p.indexOf('list.apply.') === 0 || p.indexOf('then.') === 0); }   // R1: a roll's consequence too   // Stage 6 HUD H7: an apply action's amount (no dice, no loop edge: nothing reads an action)
    function checkFormula(owner, prop, text, allowDice, vis, rowList) {   // rowList (F5a1): the list whose column this is (Row.* is known there)
        if (text === null) return;
        if (!text) { errors.push({ id: owner.id, prop: prop, message: 'Missing formula', pos: 0, len: 0 }); return; }
        var p = F.parse(text);
        if (!p.ok) { errors.push({ id: owner.id, prop: prop, message: p.error.message, pos: p.error.pos, len: p.error.len }); return; }
        if (!allowDice && hasDice(p.ast.body)) { errors.push({ id: owner.id, prop: prop, message: isApplyProp(prop) ? 'An amount cannot roll dice: roll first, and let the amount read the field the result goes in.' : 'Dice are not allowed in a definition; put the dice in a roll.', pos: 0, len: text.length }); }
        p.names.forEach(function(n) {
            var l = lower(n), target = known[l];
            if (!target) { var lt = listTarget(n, rowList); if (lt && lt.rowOutside) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" names a row, so it is known only in a list\u2019s own columns.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = lt; }   // F5a1
            if (target && target.ctrTotal) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is a counter, so it has no total: read one row (' + target.list.key + '.<key>.' + n.split('.').pop() + ').', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // R2
            if (target && target.pickTotal) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is a choice, so it has no total: read one row (' + target.list.key + '.<key>.' + n.split('.').pop() + ').', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // F5a2
            if (isRollProp(prop) && n.length > 64) { errors.push({ id: owner.id, prop: prop, message: 'A roll carries names of 64 characters at most: "' + n + '" has ' + n.length + '.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // F5a1 (critic 8): the dice path refuses a longer one
            if (!target) { var s = suggest(n, keys); errors.push({ id: owner.id, prop: prop, message: 'Unknown name "' + n + '"' + (s ? ' — did you mean "' + s + '"?' : ''), pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (!NUMERIC[target.kind]) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is ' + (target.kind === 'notes' ? 'a notes field' : (target.kind === 'effects' || target.kind === 'item-list') ? 'a list' : 'text') + ', not a number.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (target.list) {   // F5a1: what a list name reads
                if (target.onTotal && !(isObj(target.list.list) && isObj(target.list.list.on))) warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" counts rows switched on, but ' + (target.list.label || target.list.key) + ' has no switch, so it reads as none.' });
                if (target.addr) { var tc = isObj(target.list.list) && Array.isArray(target.list.list.cats) && target.list.list.cats.length ? target.list.list.cats : null, has = (Array.isArray(sys.items) ? sys.items : []).some(function(it) { return isObj(it) && typeof it.key === 'string' && lower(it.key) === target.addr && (!tc || catIn(tc, it.category)); }); if (!has) warnings.push({ id: owner.id, prop: prop, message: 'No item in ' + (target.list.label || target.list.key) + ' has the key "' + n.split('.')[1] + '": it reads as not carried until a row has it.' }); }
                if (vis === 'all' && target.gmKey && gmP[owner.id] !== 1) warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" names a GM-only item: ' + (isApplyProp(prop) ? (prop.indexOf('then.') === 0 ? 'players\u2019 rolls will not apply it.' : 'players will not get this action.') : 'players will see an error for this ' + (prop === 'roll' || prop === 'rollFormula' ? 'roll' : 'field') + '.') });
            }
            if (vis === 'all' && (target.vis === 'gm' || gmP[target.id] === 1) && gmP[owner.id] !== 1) warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" is GM only: ' + (isApplyProp(prop) ? (prop.indexOf('then.') === 0 ? 'players\u2019 rolls will not apply it.' : 'players will not get this action.') : 'players will see an error for this ' + (prop === 'roll' || prop === 'rollFormula' ? 'roll' : 'field') + '.') });
            if (!isRollProp(prop) && !isApplyProp(prop) && !target.noEdge) { var from = lower(owner.key); (edges[from] = edges[from] || []).push(lower(target.key)); }
        });
    }
    sys.fields.forEach(function(f) {
        var p = DEF_PROP[f.kind];
        if (gmP[f.id] === 1) warnings.push({ id: f.id, prop: 'maxFormula', message: 'The max reads a GM-only value, so this pool is GM only: players will not see it.' });
        if (p && !(p === 'base' && f.base === '')) checkFormula(f, p, f[p], false, f.vis);   // a skill with no base is ranks alone
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
    sys.rolls.forEach(function(r) {
        if (!r.apply) {
            checkFormula({ id: r.id, key: r.id }, 'rollFormula', r.formula, true, r.vis);
            if (Array.isArray(r.then)) {   // Stage 6 HUD R1: its consequences — as an apply action's changes; On success / On failure need a test
                var rp0 = F.parse(r.formula || ''), tests = !!(rp0.ok && rp0.ast && rp0.ast.body && rp0.ast.body.t === 'cmp');
                r.then.forEach(function(c, i) {
                    var tp = 'then.' + i, tf0 = c.f ? fieldById(sys, c.f) : null;
                    if (!tf0 || APPLY_KINDS[tf0.kind] !== 1) errors.push({ id: r.id, prop: tp, message: 'Pick the pool or number this changes.' });
                    else if (r.vis === 'all' && (tf0.vis === 'gm' || gmP[tf0.id] === 1)) warnings.push({ id: r.id, prop: tp, message: '"' + tf0.key + '" is GM only: players\u2019 rolls will not change it.' });
                    if (c.when && !tests) warnings.push({ id: r.id, prop: tp, message: 'This roll tests nothing (no comparison, like 3d6 <= Skill), so ' + (c.when === 'hit' ? 'On success' : 'On failure') + ' never happens.' });
                    checkFormula({ id: r.id, key: r.id }, tp, c.formula, false, r.vis);
                });
            }
            return;
        }
        if (!r.apply.length) { errors.push({ id: r.id, prop: 'apply', message: 'An apply action needs a change: the pool or number it moves, and by how much.' }); return; }   // Stage 6 HUD H7
        r.apply.forEach(function(c, i) {
            var pr = 'apply.' + i, tf = c.f ? fieldById(sys, c.f) : null;
            if (!tf || APPLY_KINDS[tf.kind] !== 1) errors.push({ id: r.id, prop: pr, message: 'Pick the pool or number this changes.' });
            else if (r.vis === 'all' && (tf.vis === 'gm' || gmP[tf.id] === 1)) warnings.push({ id: r.id, prop: pr, message: '"' + tf.key + '" is GM only: players will not get this action.' });
            checkFormula({ id: r.id, key: r.id }, pr, c.formula, false, r.vis);
        });
    });
    // Stage 6 F5a1: each list's columns (no dice; Row.* known there), and field keys that would hide a list's names
    sys.fields.forEach(function(f) {
        if (lower(f.key) === 'row') errors.push({ id: f.id, prop: 'key', message: 'Row is the name a list\u2019s columns read their row by: give this field another key.' });
        var dp = lower(f.key).indexOf('.'); if (dp > 0 && lsts[lower(f.key).slice(0, dp)] && lsts[lower(f.key).slice(0, dp)] !== f) errors.push({ id: f.id, prop: 'key', message: 'A key starting "' + f.key.slice(0, dp) + '." would hide that list\u2019s own names: give this field another key.' });
        if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.cols)) return;
        f.list.cols.forEach(function(c) { if (isObj(c) && typeof c.key === 'string') checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '.' + lower(c.key) }, 'list.col.' + c.key, c.formula, false, f.vis, f); });
    });
    sys.fields.forEach(function(f) {   // F5b: a list's rolls — dice allowed, Row.* known
        if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.rolls)) return;
        f.list.rolls.forEach(function(r, i) {
            if (!isObj(r)) return;
            if (!Array.isArray(r.apply)) { checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#roll' }, 'list.roll.' + i + '.' + (r.label || 'Roll'), r.formula, true, f.vis, f); return; }
            var al = r.label || 'Apply';   // HUD H7b: an apply action on each row — each change as the system's (a pool or a number, no dice), Row.* known
            if (!r.apply.length) { errors.push({ id: f.id, prop: 'list.apply.' + i + '.x.' + al, message: 'An apply action needs a change: the pool or number it moves, and by how much.' }); return; }
            r.apply.forEach(function(c, k) {
                var cp = 'list.apply.' + i + '.' + k + '.' + al, tf = c.f ? fieldById(sys, c.f) : null;
                if (!tf || APPLY_KINDS[tf.kind] !== 1) errors.push({ id: f.id, prop: cp, message: 'Pick the pool or number this changes.' });
                else if (f.vis === 'all' && (tf.vis === 'gm' || gmP[tf.id] === 1)) warnings.push({ id: f.id, prop: cp, message: '"' + tf.key + '" is GM only: players will not get this action.' });
                checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#apply' }, cp, c.formula, false, f.vis, f);
            });
        });
    });
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
            else if (!kindOf[lk]) kindOf[lk] = { kd: kd, f: f };
            if (kd !== 'pick') return;
            if (!Array.isArray(st.opts) || !st.opts.length) errors.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d is a choice with no options yet.' });
            (st.opts || []).forEach(function(o) {
                var t = known[lower(o.name)], ok = false; try { var p = F.parse(o.name); ok = !!p.ok && p.names.length === 1 && lower(p.names[0]) === lower(o.name); } catch (e) { ok = false; }
                if (!ok || !t || !NUMERIC[t.kind]) { errors.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d: the option \u201c' + o.label + '\u201d reads \u201c' + o.name + '\u201d, which is not a number formulas know.' }); return; }
                if (f.vis === 'all' && (t.vis === 'gm' || gmP[t.id] === 1)) warnings.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d: the option \u201c' + o.label + '\u201d reads a GM-only value, so players do not get that option.' });
            });
        });
    });
    function listNode(k) { if (k.slice(0, 2) !== 'l#') return null; var rest = k.slice(2), d = rest.indexOf('.'), lf = lsts[d > 0 ? rest.slice(0, d) : rest]; if (!lf) return null; var ck = d > 0 ? rest.slice(d + 1) : '', col = null; ((lf.list && lf.list.cols) || []).forEach(function(c) { if (!col && lower(c.key) === ck) col = c; }); return { f: lf, col: col }; }
    function nodeName(x) { if (ix[x]) return ix[x].key; var ln = listNode(x); return ln ? ln.f.key + '.' + (ln.col ? ln.col.key : '') + ' (column)' : x; }
    lowerKeys.forEach(function(k) { if (!state[k]) visit(k); });
    Object.keys(edges).forEach(function(k) { if (!state[k]) visit(k); });   // F5a1: the list columns' own nodes
    [errors, warnings].forEach(function(a) { a.forEach(function(e) { if (typeof e.prop === 'string' && e.prop.indexOf('list.col.') === 0) { e.message = 'Column \u201c' + e.prop.slice(9) + '\u201d: ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && e.prop.indexOf('list.ctr.') === 0) { e.message = 'Counter \u201c' + e.prop.slice(9) + '\u201d, its most: ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && e.prop.indexOf('list.apply.') === 0) { var apq = e.prop.slice(11).split('.'); e.message = 'Apply \u201c' + apq.slice(2).join('.') + '\u201d' + (apq[1] === 'x' ? '' : ', change ' + (+apq[1] + 1)) + ': ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && e.prop.indexOf('list.roll.') === 0) { var rp = e.prop.slice(10), rd2 = rp.indexOf('.'); e.message = 'Roll \u201c' + (rd2 >= 0 ? rp.slice(rd2 + 1) : rp) + '\u201d: ' + e.message; e.prop = 'list'; } }); });   // F5b: a list roll's too   // F5a1: a column's messages under its list's card
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

/* ---------- what a player receives ---------- */
// An NPC or an ownerless character: nothing. The owner: every visible value. Another player: the hover fields only.
// 5h: a character's effects rows as one recipient may hold them (sys = the players' view; lib = the FULL library by id). The owner gets a
// visible library row as a reference, a GM-only one INLINE (so their sheet and rolls agree with the GM's), ad hoc rows as they are — every
// change filtered to fields in the view. A teammate (hover only) gets names, never changes. A row with no definition anywhere is dropped.
function projectEffects(rows, sys, own, lib) {
    if (!Array.isArray(rows)) return undefined;
    var view = map(), vf = map(); (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { view[d.id] = d; }); sys.fields.forEach(function(x) { vf[x.id] = 1; });
    var out = [];
    rows.forEach(function(r) {
        if (!isObj(r) || typeof r.id !== 'string') return;
        var on = r.on !== false, d = r;
        if (typeof r.ref === 'string') {
            if (own && view[r.ref]) { out.push({ id: r.id, ref: r.ref, on: on }); return; }
            d = view[r.ref] || (lib && lib[r.ref]) || null; if (!d) return;
        }
        var mods = own ? (Array.isArray(d.mods) ? d.mods : []).filter(function(m) { return isObj(m) && vf[m.f] === 1; }).map(function(m) { var o = { f: m.f, op: m.op }; if (m.op === 'add') o.v = m.v; if (m.part) o.part = m.part; return o; }) : [];
        out.push({ id: r.id, name: d.name || 'Effect', icon: d.icon || '', tone: d.tone || '', dur: own ? (d.dur || '') : '', notes: own ? (d.notes || '') : '', on: on, mods: mods });
    });
    return out;
}
function fitsKind(k, v) {   // a list only in a list kind, a pool's {cur} only in a pool (a value from before a kind change never travels; the client's cleaner does the rest)
    if (k === 'effects' || k === 'item-list') return Array.isArray(v);
    if (k === 'resource') return isObj(v) || typeof v === 'number';
    return !Array.isArray(v) && !isObj(v);
}
function charFor(c, sys, recipientId, opts) {
    if (!c || c.npc || !c.ownerId) return null;
    var own = c.ownerId === recipientId, values = {}, libFull = opts && opts.lib ? opts.lib : null, probe = !!(opts && opts.probe);   // probe: which fields a recipient may see (syncCharDelta), values as given
    var itemsFull = opts && opts.items ? opts.items : null;   // Stage 6 F4a: the host's items by id — a GM-only row reaches its owner inline
    sys.fields.forEach(function(f) { if (!STORED[f.kind] || f.vis !== 'all') return; if (f.kind === 'item-list' && !own) return; if (!own && !f.hover) return; if (c.values && c.values[f.id] !== undefined) { var cv = c.values[f.id]; if (!probe && !fitsKind(f.kind, cv)) return; values[f.id] = (f.kind === 'item-list' && Array.isArray(cv) && !probe) ? projectRows(cv, sys, itemsFull, f.list || null) : (f.kind === 'effects' && Array.isArray(cv) && !probe) ? projectEffects(cv, sys, own, libFull) : cv; } });   // 5h: effects rows projected per recipient   // a carried list never travels to another player, hover flag or not
    return { id: c.id, name: c.name, ownerId: c.ownerId, portrait: c.portrait || '', npc: false, values: values, updated: c.updated || 0, partial: !own };
}
// The host's answer to one edit (its own or a player's): { ok, value } or { ok: false, reason }
function applyEdit(sys, char, fieldId, value, F, opts) {
    opts = opts || {};
    var f = fieldById(sys, fieldId); if (!f || !STORED[f.kind] || f.kind === 'effects') return { ok: false, reason: 'field' };   // 5h: an effects list changes only through applyEffectOp
    if (opts.player && f.edit !== 'owner') return { ok: false, reason: 'field' };
    if (opts.player && f.vis !== 'all') return { ok: false, reason: 'field' };
    if (opts.player && f.kind === 'resource' && gmPools(sys, F)[f.id] === 1) return { ok: false, reason: 'field' };   // a pool whose max is GM-only is GM-only: the answer to 999 would be the max
    var max = null;
    if (f.kind === 'resource') { var r = makeResolver(sys, char, F)(f.key + '.max'); max = typeof r === 'number' && isFinite(r) ? r : null; }
    var v = cleanValue(f, value, { max: max });
    if (v === undefined) return { ok: false, reason: 'value' };
    return { ok: true, value: v };
}
// 5h: the host's (or the GM's own) answer to one change of a character's status effects: { ok, value, clamp } or { ok: false, reason }.
// q = { op: add|adhoc|on|remove, rowId, ref?, on?, row? }. Rights follow the list field (Player may edit / GM edits, visible); a player can
// add only what their view holds (opts.view: the players' system). clamp: a resource whose effective max fell below its current value
// is brought down in the same change (fieldId -> { cur }).
function applyEffectOp(sys, char, fieldId, q, F, opts) {
    opts = opts || {};
    var f = fieldById(sys, fieldId); if (!f || f.kind !== 'effects') return { ok: false, reason: 'field' };
    if (opts.player && (f.edit !== 'owner' || f.vis !== 'all')) return { ok: false, reason: 'field' };
    if (!isObj(q) || !FX_OPS[q.op]) return { ok: false, reason: 'value' };
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
        if (had >= 0) list[had].on = true;   // once per character: adding it again turns it back on
        else if (idx >= 0) return { ok: false, reason: 'value' };
        else if (list.length >= LIMITS.effectRows) return { ok: false, reason: 'field' };
        else list.push({ id: rowId, ref: q.ref, on: true });
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
        if (idx >= 0) list[idx] = nr; else if (list.length >= LIMITS.effectRows) return { ok: false, reason: 'field' }; else list.push(nr);
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
        var mods = Array.isArray(msg.row.mods) ? msg.row.mods.slice(0, LIMITS.effectMods).map(function(m) { return isObj(m) ? { f: typeof m.f === 'string' ? m.f.slice(0, 40) : '', op: m.op === 'on' ? 'on' : 'add', v: Number(m.v), part: m.part === 'max' ? 'max' : undefined } : null; }) : [];
        q.row = { id: msg.row.id, name: str(msg.row.name, LIMITS.name), icon: str(msg.row.icon, 32), tone: msg.row.tone === 'buff' || msg.row.tone === 'debuff' ? msg.row.tone : '', dur: str(msg.row.dur, 200), notes: str(msg.row.notes, LIMITS.text), on: msg.row.on !== false, mods: mods };
        return q;
    }
    if (typeof msg.rowId !== 'string' || !FXROW_ID.test(msg.rowId)) return null; q.rowId = msg.rowId;
    if (msg.op === 'add') { if (typeof msg.ref !== 'string' || !EFFECT_ID.test(msg.ref)) return null; q.ref = msg.ref; }
    if (msg.op === 'on') { if (typeof msg.on !== 'boolean') return null; q.on = msg.on; }
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

/* ---------- the ShadowBase bridge: copy once into matching keys ---------- */
// ShadowBase paths and the keys they may land on, first match wins (ST or STR, HT or CON, IQ or INT — the common spellings)
var SB_MAP = [
    { path: ['attributes', 'strength'], keys: ['st', 'str', 'strength'] }, { path: ['attributes', 'dexterity'], keys: ['dx', 'dex', 'dexterity'] },
    { path: ['attributes', 'iq'], keys: ['iq', 'int', 'intelligence'] }, { path: ['attributes', 'health'], keys: ['ht', 'con', 'health', 'constitution'] },
    { path: ['characteristics', 'hitPoints'], keys: ['hp', 'hitpoints'] }, { path: ['characteristics', 'endurancePoints'], keys: ['fp', 'ep', 'fatigue', 'endurance'] },
    { path: ['characteristics', 'forcePoints'], keys: ['force', 'forcepoints'] }, { path: ['characteristics', 'will'], keys: ['will'] }, { path: ['characteristics', 'perception'], keys: ['per', 'perception'] },
    { path: ['characteristics', 'basicSpeed'], keys: ['speed', 'basicspeed'] }, { path: ['characteristics', 'basicMove'], keys: ['move', 'basicmove'] },
    { path: ['characteristics', 'defenses', 'dodge'], keys: ['dodge'] }, { path: ['characteristics', 'defenses', 'parry'], keys: ['parry'] }
];
function pick(obj, path) { var cur = obj; for (var i = 0; i < path.length; i++) { if (!isObj(cur)) return undefined; cur = cur[path[i]]; } return cur; }
function numOf(v) { if (typeof v === 'number') return v; if (isObj(v)) { var c = [v.effective, v.final, v.value, v.level, v.current]; for (var i = 0; i < c.length; i++) if (typeof c[i] === 'number' && isFinite(c[i])) return c[i]; } return undefined; }
function aliasFromShadowBase(json, sys, F) {
    var values = {}, matched = 0;
    if (!isObj(json) || !sys) return { values: values, matched: 0 };
    var ix = keyIndex(sys);
    SB_MAP.forEach(function(m) {
        var f = null; for (var i = 0; i < m.keys.length && !f; i++) if (ix[m.keys[i]] && STORED[ix[m.keys[i]].kind]) f = ix[m.keys[i]];
        if (!f) return;
        var raw = pick(json, m.path);
        if (f.kind === 'resource') { var cur = isObj(raw) && typeof raw.current === 'number' ? raw.current : numOf(raw); if (cur === undefined) return; var rv = cleanValue(f, { cur: cur }); if (!rv) return; values[f.id] = rv; matched++; return; }
        var n = numOf(raw); if (n === undefined) return;
        var nv = cleanValue(f, n); if (nv === undefined) return;   // the field's own rules (bounds, step, the wire-safe range), as an edit would
        values[f.id] = nv; matched++;
    });
    var temp = { id: 'c_tmp', name: '', ownerId: '', npc: true, values: values };
    (Array.isArray(json.skills) ? json.skills : []).forEach(function(s) {
        if (!isObj(s) || typeof s.name !== 'string') return;
        var lvl = typeof s.level === 'number' ? s.level : (typeof s.level === 'string' && /^-?\d{1,6}(\.\d+)?$/.test(s.level.trim()) ? Number(s.level.trim()) : NaN);   // Stage 6: the website exports the level as text ("11")
        if (!fin(lvl)) return;
        var want = lower(s.name).replace(/[^a-z0-9]/g, '');
        var f = null;
        for (var i = 0; i < sys.fields.length; i++) { var c = sys.fields[i]; if (c.kind !== 'skill') continue; var last = lower(c.key).split('.').pop().replace(/[^a-z0-9]/g, ''), lab = lower(c.label).replace(/[^a-z0-9]/g, ''); if (last === want || lab === want) { f = c; break; } }
        if (!f) return;
        var base = 0;
        if (f.base) { var r = makeResolver(sys, temp, F)(f.key + '.base'); if (typeof r === 'number' && isFinite(r)) base = r; }
        values[f.id] = cleanValue(f, lvl - base, null);
        if (values[f.id] === undefined) delete values[f.id]; else matched++;
    });
    return { values: values, matched: matched };
}

// Stage 6 F5b: a row roll for the GM's privacy checks — gm: the list or the row's item is GM-only (the roll stays the GM's); names: what its Row.*
// names read — a column as the list's name for it (gmDerivedNames sees its formula through the list) and the names its formula reads (gmEffectNames),
// a choice as its option's name — beside the roll's other names. Never throws; an unknown field or row reads gm (fail closed)
function rowRollNames(sys, char, fieldId, rowId, names, F) {
    var out = [], gm = false, seen = map(), push = function(n) { if (typeof n === 'string' && n && !seen[lower(n)]) { seen[lower(n)] = 1; out.push({ name: n }); } };
    try {
        var f = sys ? fieldById(sys, fieldId) : null; if (!f || f.kind !== 'item-list') return { gm: true, names: out };
        if (f.vis === 'gm') gm = true;
        var rows = storedOf(f, char), row = null; (Array.isArray(rows) ? rows : []).forEach(function(r) { if (!row && rowIdOf(r) === rowId) row = r; });
        var rd = row ? rowDef(sys, row) : null; if (!rd || !rd.def || rd.def.vis === 'gm' || row.hid === 1) gm = true;
        var spec = isObj(f.list) ? f.list : {};
        var expand = function(ns, depth) { (Array.isArray(ns) ? ns : []).forEach(function(n) {
            var nm = typeof n === 'string' ? n : (n && n.name); if (typeof nm !== 'string') return;
            var l = lower(nm); if (l.slice(0, 4) !== 'row.') { push(nm); return; }
            var w = l.slice(4), c = null, st = null;
            (Array.isArray(spec.cols) ? spec.cols : []).forEach(function(x) { if (!c && isObj(x) && lower(x.key) === w) c = x; });
            (Array.isArray(spec.stats) ? spec.stats : []).forEach(function(x) { if (!st && isObj(x) && lower(x.key) === w) st = x; });
            if (c) { push(f.key + '.' + c.key); if (depth < 4 && typeof c.formula === 'string' && c.formula && F && F.names) expand(F.names(c.formula), depth + 1); }
            else if (st && st.kind === 'pick' && rd) { var lb = rowStat(spec, rd.def, st.key); (st.opts || []).forEach(function(o) { if (lower(o.label) === lower(lb)) push(o.name); }); }
        }); };
        expand(names, 0);
    } catch (e) { return { gm: true, names: out }; }
    return { gm: gm, names: out };
}
// The names a roll used (the engine's breakdown.names) that belong to a GM-only field, by key or by a reserved suffix: a GM's public roll must not carry them
function gmOnlyNames(sys, names) {
    if (!sys || !Array.isArray(sys.fields) || !Array.isArray(names)) return [];
    var ix = keyIndex(sys), out = [], gmKs = gmEntryKeys(sys, sys.fields);
    names.forEach(function(n) {
        var l = lower(n && n.name || ''), f = ix[l];
        if (!f) { var dot = l.lastIndexOf('.'); if (dot > 0 && RESERVED_SUFFIX[l.slice(dot + 1)]) f = ix[l.slice(0, dot)]; }
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
    var out = [], seen = map(), nameOf = function(n) { return typeof n === 'string' ? n : (n && typeof n.name === 'string' ? n.name : ''); };
    var keep = function(n) { if (n && !seen[lower(n)]) { seen[lower(n)] = 1; out.push(n); } };
    try {
        var ix = keyIndex(sys), hot = map(), readBy = map(), queue = [], gmKs = gmEntryKeys(sys, sys.fields);
        var reads = function(name) {   // the field a name reads (the resolver's lookup) and whether its value is that field's definition worked out
            var l = lower(name), f = ix[l], sfx = '';
            if (!f) { var dot = l.lastIndexOf('.'); if (dot > 0 && RESERVED_SUFFIX[l.slice(dot + 1)]) { f = ix[l.slice(0, dot)]; sfx = l.slice(dot + 1); } }
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
        sys.fields.forEach(function(f) {   // F5a1: a visible list's columns — reading a GM-only value makes the list's names derived from one
            if (f.kind !== 'item-list' || f.vis === 'gm' || !isObj(f.list) || !Array.isArray(f.list.cols)) return;
            var node = 'l#' + lower(f.key);
            f.list.cols.forEach(function(c) { if (!isObj(c) || typeof c.formula !== 'string' || !c.formula) return; (F.names(c.formula) || []).forEach(function(n) { var r = reads(nameOf(n)); if (!r) return; if (r.f.vis === 'gm') { if (!hot[node]) { hot[node] = 1; queue.push(node); } } else if (r.def) (readBy[r.f.id] = readBy[r.f.id] || []).push(node); }); });
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
// The system's initiative roll (the one flagged init) or null
function initRoll(sys) { if (!sys || !Array.isArray(sys.rolls)) return null; for (var i = 0; i < sys.rolls.length; i++) if (sys.rolls[i] && sys.rolls[i].init) return sys.rolls[i]; return null; }
var API = { VERSION: VERSION, thenChanges: thenChanges, showsIf: showsIf, rowRollNames: rowRollNames, applyAct: applyAct, applyScope: applyScope, cleanCharApply: cleanCharApply, APPLY_KINDS: APPLY_KINDS, hudView: hudView, hudHasContent: hudHasContent, pinTargetsAll: pinTargetsAll, TONES: TONES, valueTone: valueTone, cleanTones: cleanTones, playableChars: playableChars, activeCharOf: activeCharOf, activeChars: activeChars, ownedTokenPlan: ownedTokenPlan, applyOwnerOps: applyOwnerOps, migrateBindings: migrateBindings, tokenSourceFor: tokenSourceFor, playsAs: playsAs, stackZ: stackZ, LIMITS: LIMITS, PALETTE_KEYS: PALETTE_KEYS, headerEdits: headerEdits, pinTargets: pinTargets, pruneGroups: pruneGroups, GROUP_ID: GROUP_ID, GLYPHS: GLYPHS, glyphPath: glyphPath, ROLL_TONES: ROLL_TONES, KINDS: KINDS, STORED: STORED, DEF_PROP: DEF_PROP, LAYOUT: LAYOUT, validPageId: validPageId, BAND_KINDS: BAND_KINDS, IDENTITY_KINDS: IDENTITY_KINDS, LEDGER_KINDS: LEDGER_KINDS, headerEntry: headerEntry, captionParts: captionParts, capExpr: capExpr, labelNames: labelNames, labelGmNames: labelGmNames, valueOpts: valueOpts, rowIdOf: rowIdOf, cleanRowDef: cleanRowDef, rowDef: rowDef, projectRows: projectRows, cleanListSpec: cleanListSpec, STAT_KEY: STAT_KEY, statKey: statKey, cleanEntryStats: cleanEntryStats, rowStats: rowStats, rowStat: rowStat, rowPaid: rowPaid, cleanListRules: cleanListRules, cleanOv: cleanOv, mergeOv: mergeOv, itemReach: itemReach, OV_LOCK: OV_LOCK, lvlClamp: lvlClamp, rowLvl: rowLvl, rowOn: rowOn, cleanItemKey: cleanItemKey, ROW_WORDS: ROW_WORDS, applyRowOp: applyRowOp, orphanRows: orphanRows, stampRows: stampRows, cleanItemMsg: cleanItemMsg, RM_MODES: RM_MODES, applyEffectOp: applyEffectOp, cleanCharEffect: cleanCharEffect, gmEffectNames: gmEffectNames, fxText: fxText, activeEffects: activeEffects, projectEffects: projectEffects, FACING_NAMES: FACING_NAMES, TOKEN_NAMES: TOKEN_NAMES, POSTURE_IDS: POSTURE_IDS, POSTURE_NAMES: POSTURE_NAMES, stanceCtx: stanceCtx, tokenCtx: tokenCtx, withRound: withRound, sideOf: sideOf, threatArc: threatArc, cleanThreats: cleanThreats, facingCtx: facingCtx, charTokenOn: charTokenOn, cycleThreat: cycleThreat, RESERVED_SUFFIX: RESERVED_SUFFIX, emptySystem: emptySystem, uid: uid, validKey: validKey, cleanFormulaText: cleanFormulaText, hasDice: hasDice, cleanField: cleanField, cleanRollDef: cleanRollDef, cleanItemDef: cleanItemDef, cleanCombat: cleanCombat, cleanCover: cleanCover, coverTier: coverTier, cleanSystem: cleanSystem, cleanValue: cleanValue, cleanChar: cleanChar, cleanCharEdit: cleanCharEdit, cleanCharEdits: cleanCharEdits, resetTargets: resetTargets, cleanCharItem: cleanCharItem, cleanDenyReason: cleanDenyReason, cleanSheetStyle: cleanSheetStyle, fieldById: fieldById, itemDef: itemDef, keyIndex: keyIndex, makeResolver: makeResolver, resolveAll: resolveAll, hoverLines: hoverLines, gmOnlyNames: gmOnlyNames, gmDerivedNames: gmDerivedNames, gmPools: gmPools, initRoll: initRoll, validateSystem: validateSystem, charFor: charFor, applyEdit: applyEdit, autoLayout: autoLayout, aliasFromShadowBase: aliasFromShadowBase, fmtNum: fmtNum, suggest: suggest };
if (typeof window !== 'undefined') window.wpSystemCore = API;
export { VERSION, thenChanges, showsIf, rowRollNames, applyAct, applyScope, cleanCharApply, APPLY_KINDS, hudView, hudHasContent, pinTargetsAll, TONES, valueTone, cleanTones, playableChars, activeCharOf, activeChars, ownedTokenPlan, applyOwnerOps, migrateBindings, tokenSourceFor, playsAs, stackZ, LIMITS, PALETTE_KEYS, headerEdits, pinTargets, pruneGroups, GROUP_ID, GLYPHS, glyphPath, ROLL_TONES, KINDS, STORED, DEF_PROP, LAYOUT, validPageId, BAND_KINDS, IDENTITY_KINDS, LEDGER_KINDS, headerEntry, captionParts, capExpr, labelNames, labelGmNames, valueOpts, rowIdOf, cleanRowDef, rowDef, projectRows, cleanListSpec, STAT_KEY, statKey, cleanEntryStats, rowStats, rowStat, rowPaid, cleanListRules, cleanOv, mergeOv, itemReach, OV_LOCK, lvlClamp, rowLvl, rowOn, cleanItemKey, ROW_WORDS, applyRowOp, orphanRows, stampRows, cleanItemMsg, RM_MODES, applyEffectOp, cleanCharEffect, gmEffectNames, fxText, activeEffects, projectEffects, FACING_NAMES, TOKEN_NAMES, POSTURE_IDS, POSTURE_NAMES, stanceCtx, tokenCtx, withRound, sideOf, threatArc, cleanThreats, facingCtx, charTokenOn, cycleThreat, RESERVED_SUFFIX, emptySystem, uid, validKey, cleanFormulaText, hasDice, cleanField, cleanRollDef, cleanItemDef, cleanCombat, cleanCover, coverTier, cleanSystem, cleanValue, cleanChar, cleanCharEdit, cleanCharEdits, resetTargets, cleanCharItem, cleanDenyReason, cleanSheetStyle, fieldById, itemDef, keyIndex, makeResolver, resolveAll, hoverLines, gmOnlyNames, gmDerivedNames, gmPools, initRoll, validateSystem, charFor, applyEdit, autoLayout, aliasFromShadowBase, fmtNum, suggest };
