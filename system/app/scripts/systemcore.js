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
var ROW_ID = /^w_[A-Za-z0-9_]{1,24}$/, ROW_OPS = Object.freeze({ add: 1, remove: 1, setQty: 1, keep: 1, undo: 1 });   // undo (Stage 6): a pickup taken back
// Stage 6: what a player's removal of an item does. bound: it stays (only the GM removes it); curse (on contact): it leaves their sheet and
// the GM keeps it on the character, out of their sight, until the GM removes it. Absent: an ordinary removal. The GM's secret: never in the
// players' view, so every item looks and behaves the same on a player's sheet until they try.
var RM_MODES = Object.freeze({ bound: 1, curse: 1 });
var GROUP_ID = /^g_[A-Za-z0-9_]{1,24}$/;   // Stage 6 look fold: a band group
var CTRL_RE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');
var CTRL_RE_G = new RegExp(CTRL_RE.source, 'g');   // for replace(): every control character, not just the first
var CTRL_KEEP_NL = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(8) + String.fromCharCode(11) + String.fromCharCode(12) + String.fromCharCode(14) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g');
var PATH_RE = /^[/]saves[/]images[/][^?#]{1,300}$/;
var DENY = Object.freeze({ off: 1, slow: 1, owner: 1, field: 1, value: 1, missing: 1, paused: 1, stays: 1 });   // stays (Stage 6): a bound item did not come off

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
    else if (k === 'item-list') { var tbl = cleanItemTable(f.table); if (tbl) out.table = tbl; }   // Stage 4: optional rich table (columns/chips/footer)
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
function cleanRollDef(r, gmView) {
    if (!isObj(r) || typeof r.id !== 'string' || !ROLL_ID.test(r.id)) return null;
    var vis = r.vis === 'gm' ? 'gm' : 'all';
    if (!gmView && vis === 'gm') return null;
    var fm = cleanFormulaText(r.formula); if (!fm) return null;
    var out = { id: r.id, label: str(r.label, LIMITS.label).replace(CTRL_RE_G, ' ').trim() || 'Roll', formula: fm, vis: vis };   // HUD frame (HF5a): every control character (the non-global pattern replaced only the first, and the dice path then refused the whole roll)
    if (r.init === true) out.init = true;
    if (typeof r.tone === 'string' && Object.prototype.hasOwnProperty.call(ROLL_TONES, r.tone)) out.tone = r.tone;   // Stage 6 look fold
    var rIcon = cleanIcon(r.icon); if (rIcon) out.icon = rIcon;
    return out;
}
// An item definition (camp.system.items). gmView false: a vis:'gm' item is dropped, and a visible item's
// formula/skill text (damage/cost/throwSkill) is stripped — the host resolves every roll, so players never
// need the formula, which also removes the GM-only-field-leak surface (cleanSystem's blanking is fields/rolls only).
function cleanItemDef(it, F, gmView) {
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
    if (isObj(it.area)) {
        var ft = cleanNum(it.area.ft, 0) | 0;
        if (ft > 0) out.area = { ft: clampNum(ft, 1, LIMITS.maxBlastFt), shape: SHAPES[it.area.shape] ? it.area.shape : 'circle', name: str(it.area.name, LIMITS.label).replace(CTRL_RE, ' ').trim() };
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
        if (s.inline === true) sec.inline = true;   // HUD frame (HF4a, H2): each field on one line (label and value, its Roll on the right)
        if (s.resetAll === true) { sec.resetAll = true; var rtx = cutText(s.resetText, LIMITS.label); if (rtx) sec.resetText = rtx; }   // HUD frame (HF4b, H13): a Reset all button in the header (its own words, e.g. Long rest)
        (Array.isArray(s.fields) ? s.fields : []).forEach(function(p) {
            if (!isObj(p) || total >= LIMITS.placements) return;
            var w = p.w === 'row' ? 'row' : 1, item = null;
            if (typeof p.id === 'string' && fieldIds[p.id] && !placed[p.id]) { placed[p.id] = 1; item = { id: p.id, w: w }; }
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
            if (item) { sec.fields.push(item); total++; }
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
    var seenId = map(), seenKey = map(), dropped = [];
    (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (out.fields.length >= LIMITS.fields) return;
        var c = cleanField(f, F, gmView);
        if (!c) { if (isObj(f) && typeof f.key === 'string' && f.vis === 'gm' && !gmView) dropped.push(lower(f.key)); return; }
        if (seenId[c.id] || seenKey[lower(c.key)]) return;
        seenId[c.id] = 1; seenKey[lower(c.key)] = 1; out.fields.push(c);
    });
    var seenR = map();
    (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (out.rolls.length >= LIMITS.rolls) return; var c = cleanRollDef(r, gmView); if (!c || seenR[c.id]) return; seenR[c.id] = 1; out.rolls.push(c); });
    if (!gmView && dropped.length) {   // a visible formula that named a GM-only key is blanked: the player sees "GM only", never the name
        var isDropped = map(); dropped.forEach(function(k) { isDropped[k] = 1; });
        var mentions = function(text) {
            if (!text) return false;
            var hit = function(n) { var l = lower(n), dot = l.lastIndexOf('.'); if (isDropped[l]) return true; return dot > 0 && RESERVED_SUFFIX[l.slice(dot + 1)] && isDropped[l.slice(0, dot)]; };
            if (F.parse(text).ok) return F.names(text).some(hit);
            return (String(text).match(/[A-Za-z_][A-Za-z0-9_.]*/g) || []).some(function(t) { return hit(t) || hit(t.split('.')[0]); });   // Stage 6: text that does not parse is checked word by word — a typo never carries a GM-only name to players
        };
        var capMentions = function(t) { return String(t).split('{').slice(1).some(function(p) { return mentions(capExpr(p.split('}')[0]).expr); }); };   // Stage 6: after every "{" (closed or not, drawn or not), the ± stripped   // Fold B: a caption's {formula} is formula text too
        out.fields.forEach(function(f) { var p = DEF_PROP[f.kind]; if (p && f[p] && mentions(f[p])) f[p] = null; if (f.roll && mentions(f.roll)) delete f.roll; if (f.caption && capMentions(f.caption)) delete f.caption; });
        out.rolls = out.rolls.filter(function(r) { return !mentions(r.formula); });
        out.rolls.forEach(function(r) { if (r.label.indexOf('{') >= 0 && capMentions(r.label)) r.label = labelHead(r.label); });   // HUD frame (HF5a, H3): a label naming a GM-only value keeps only its plain text before the first {...} (fail closed, as a caption)
    }
    var fieldIds = map(), rollIds = map(), resIds = map();
    out.fields.forEach(function(f) { fieldIds[f.id] = f.kind; if (f.kind === 'resource') resIds[f.id] = 1; }); out.rolls.forEach(function(r) { rollIds[r.id] = 1; });   // fieldIds: id -> kind (always truthy; the band gates on the kind)
    var seenIt = map();
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {
        if (out.items.length >= LIMITS.items) return;
        var c = cleanItemDef(it, F, gmView);
        if (!c || seenIt[c.id]) return;
        seenIt[c.id] = 1; out.items.push(c);
    });
    var seenFx = map(), effs = [];   // 5h: the status-effect library, after the fields (its changes are checked against them); absent when empty
    (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (effs.length >= LIMITS.effects) return; var c = cleanEffectDef(d, fieldIds, gmView); if (!c || seenFx[c.id]) return; seenFx[c.id] = 1; effs.push(c); });
    if (effs.length) out.effects = effs;
    out.combat = cleanCombat(sys.combat, resIds);
    var pages = null;   // Stage 5f: the host passes the ids of the pages players may read, so a chip or link to any other page never travels
    if (opts.pages !== undefined) { pages = map(); (Array.isArray(opts.pages) ? opts.pages : []).forEach(function(id) { if (validPageId(id)) pages[id] = 1; }); }
    out.sheet = cleanSheet(sys.sheet, fieldIds, rollIds, pages, gmView);
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
            var rw = cleanRow(v[i], items); if (!rw) continue;
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
// — the keys each op uses, checked by shape only (applyRowOp judges the rest). Every op names its row: a player's add brings its new row's id
function cleanCharItem(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId) || typeof msg.fieldId !== 'string' || !FIELD_ID.test(msg.fieldId)) return null;
    if (typeof msg.op !== 'string' || !ROW_OPS[msg.op]) return null;
    var out = { rid: msg.rid, charId: msg.charId, fieldId: msg.fieldId, op: msg.op };
    if (msg.op === 'add') { if (typeof msg.defId !== 'string' || !ITEM_ID.test(msg.defId)) return null; out.defId = msg.defId; }
    if (typeof msg.rowId !== 'string' || !ROW_ID.test(msg.rowId)) return null; out.rowId = msg.rowId;
    if (msg.op === 'add' || msg.op === 'setQty' || msg.op === 'undo') { var qty = msg.qty === undefined ? 1 : (cleanNum(msg.qty, NaN) | 0); if (!(qty >= 0)) return null; out.qty = clampNum(qty, 0, LIMITS.maxQty); }
    return out;
}
function cleanDenyReason(r) { return typeof r === 'string' && DENY[r] ? r : 'value'; }
function cleanItemMsg(v) { return cutText(v, LIMITS.rmMsg); }   // Stage 6: a bound or cursed item's message as a player receives it (shown as text)

/* ---------- Stage 6 F4a: carried rows ----------
   A row of an item list is a carried item: a legacy {defId, qty}; a linked {id, defId, qty, snap?} (snap: the entry as it was when it left
   the library — the character keeps the item); a custom {id, qty, def} (the character's own item: the GM's "Make custom"). An owner's copy of
   a GM-only entry, or of a deleted one, arrives inline {id, qty, def, lnk:1} with its players' fields only. A cleaner never mints an id: a
   legacy row's id is derived from its item (rowIdOf); a new row's id comes from whoever made it, and the host refuses a taken one. A row the
   player dropped of a curse-on-contact item stays on the host with hid:1 under a fresh id (the GM's; never projected to its owner). */
function rowIdOf(r) { if (!isObj(r)) return null; if (typeof r.id === 'string' && ROW_ID.test(r.id)) return r.id; return typeof r.defId === 'string' && ITEM_ID.test(r.defId) ? 'w_' + r.defId.slice(2) : null; }
function cutText(v, n) { return str(v, n).replace(CTRL_RE_G, ' ').trim(); }
function cleanRowDef(d, gmView) {   // an item's definition carried on a row, by the item rules; a GM-only one keeps no area (it is never thrown by a player)
    if (!isObj(d)) return null;
    var vis = d.vis === 'gm' ? 'gm' : 'all';
    var out = { name: cutText(d.name, LIMITS.name) || 'Item', category: cutText(d.category, LIMITS.category), icon: cleanIcon(d.icon), notes: str(d.notes, LIMITS.text).replace(CTRL_RE_G, ' '), vis: vis };
    if (isObj(d.area) && (gmView || vis === 'all')) { var ft = cleanNum(d.area.ft, 0) | 0; if (ft > 0) out.area = { ft: clampNum(ft, 1, LIMITS.maxBlastFt), shape: SHAPES[d.area.shape] ? d.area.shape : 'circle', name: cutText(d.area.name, LIMITS.label) }; }
    if (gmView && RM_MODES[d.rm] === 1) { out.rm = d.rm; var rmm = cutText(d.rmMsg, LIMITS.rmMsg); if (rmm) out.rmMsg = rmm; }   // Stage 6: secret, the GM's copy only
    if (gmView) {   // formula text stays on the GM's machine, as an item's does
        var dmg = cleanFormulaText(d.damage); if (dmg) out.damage = dmg;
        var cst = cleanFormulaText(d.cost); if (cst) out.cost = cst;
        if (typeof d.throwSkill === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(d.throwSkill)) out.throwSkill = d.throwSkill;
    }
    return out;
}
function cleanRow(e, items) {
    if (!isObj(e)) return null;
    var id = typeof e.id === 'string' && ROW_ID.test(e.id) ? e.id : null, qty = clampNum(cleanNum(e.qty, 1) | 0, 1, LIMITS.maxQty);
    if (typeof e.defId === 'string' && ITEM_ID.test(e.defId)) {
        var known = items[e.defId] === 1, snap = !known && isObj(e.snap) ? cleanRowDef(e.snap, true) : null;   // a copy of a deleted entry keeps its snapshot; once the entry is back the row reads the library again
        if (!known && !snap) return null;   // an unknown item with no copy is dropped (the rule before Stage 6)
        var o = {}; if (id) o.id = id; o.defId = e.defId; o.qty = qty; if (snap) o.snap = snap; if (id && e.hid === 1) o.hid = 1; return o;
    }
    if (!id || !isObj(e.def)) return null;
    var d = cleanRowDef(e.def, e.lnk !== 1); if (!d) return null;
    var c = { id: id, qty: qty, def: d }; if (e.lnk === 1) c.lnk = 1; else if (e.hid === 1) c.hid = 1; return c;
}
// The definition a row draws and throws from: the library entry, else the deleted entry's copy, else the row's own. { def, src } or null.
function rowDef(sys, row) {
    if (!isObj(row)) return null;
    if (typeof row.defId === 'string') { var it = itemDef(sys, row.defId); if (it) return { def: it, src: 'lib' }; if (isObj(row.snap)) return { def: row.snap, src: 'lost' }; return null; }
    if (isObj(row.def)) return { def: row.def, src: row.lnk === 1 ? 'inline' : 'custom' };
    return null;
}
// The owner's copy of a carried list (charFor): a visible entry as a pointer; a GM-only entry, or a deleted one's copy, inline with its
// players' fields only (the 5h rule: the owner's sheet, their rolls and the host agree); a custom row without its GM texts; a kept curse
// (hid) not at all. lib: the host's full items by id — without it a GM-only row is left out (fail closed).
function projectRows(rows, view, lib) {
    if (!Array.isArray(rows)) return undefined;
    var vis = map(); (view && Array.isArray(view.items) ? view.items : []).forEach(function(it) { if (isObj(it) && typeof it.id === 'string') vis[it.id] = 1; });
    var out = [];
    rows.forEach(function(r) {
        if (!isObj(r) || r.hid === 1) return;
        var rid = rowIdOf(r); if (!rid) return;
        if (typeof r.defId === 'string') {
            if (vis[r.defId] === 1 && !r.snap) { var o = {}; if (r.id) o.id = r.id; o.defId = r.defId; o.qty = r.qty; out.push(o); return; }
            var d = (lib && Object.prototype.hasOwnProperty.call(lib, r.defId)) ? lib[r.defId] : r.snap, pd = cleanRowDef(d, false); if (!pd) return;
            out.push({ id: rid, qty: r.qty, def: pd, lnk: 1 }); return;
        }
        if (r.id && isObj(r.def)) { var cd = cleanRowDef(r.def, false); if (cd) out.push({ id: r.id, qty: r.qty, def: cd }); }
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
function applyRowOp(sys, char, fieldId, q, F, opts) {
    opts = opts || {};
    var f = fieldById(sys, fieldId); if (!f || f.kind !== 'item-list') return { ok: false, reason: 'field' };
    if (opts.player && (f.edit !== 'owner' || f.vis !== 'all')) return { ok: false, reason: 'field' };
    if (!isObj(q) || !ROW_OPS[q.op]) return { ok: false, reason: 'value' };
    var src = char && char.values && Array.isArray(char.values[fieldId]) ? char.values[fieldId] : [];
    var list = JSON.parse(JSON.stringify(src)), vo = valueOpts(sys), extra = {};
    var at = function(rid) { for (var i = 0; i < list.length; i++) if (rowIdOf(list[i]) === rid) return i; return -1; };
    if (q.op === 'add') {
        if (typeof q.defId !== 'string' || !ITEM_ID.test(q.defId)) return { ok: false, reason: 'value' };
        var ent = itemDef(sys, q.defId), inView = opts.player ? valueOpts(opts.view || null).items[q.defId] === 1 : !!ent;
        if (!ent || !inView || (opts.player && ent.vis === 'gm')) return { ok: false, reason: 'missing' };
        var n = clampNum((q.qty | 0) || 1, 1, LIMITS.maxQty), have = -1;
        for (var j = 0; j < list.length; j++) if (isObj(list[j]) && list[j].defId === q.defId && !list[j].snap && list[j].hid !== 1) { have = j; break; }   // never into a kept curse
        if (have >= 0) { extra.base = list[have].qty | 0; list[have].qty = clampNum(extra.base + n, 1, LIMITS.maxQty); extra.row = rowIdOf(list[have]); extra.qty = list[have].qty; extra.added = extra.qty - extra.base; }   // the same item again raises its quantity
        else {
            if (list.filter(function(r) { return !(isObj(r) && r.hid === 1); }).length >= LIMITS.carried) return { ok: false, reason: 'field' };   // kept curses never count against what the player sees
            var row = { defId: q.defId, qty: n };
            if (q.rowId !== undefined) {   // a new row's id: never one already in the list, never one an item's legacy row would derive (checked against the player's own view: a GM-only item's id is never confirmed)
                var known = opts.player ? (opts.view && Array.isArray(opts.view.items) ? opts.view.items : []) : (Array.isArray(sys.items) ? sys.items : []);
                if (typeof q.rowId !== 'string' || !ROW_ID.test(q.rowId) || at(q.rowId) >= 0 || known.some(function(it) { return isObj(it) && typeof it.id === 'string' && 'w_' + it.id.slice(2) === q.rowId; })) return { ok: false, reason: 'value' };
                row = { id: q.rowId, defId: q.defId, qty: n };
            }
            list.push(row); extra.base = 0; extra.row = rowIdOf(row); extra.qty = n; extra.added = n;
        }
        if (RM_MODES[ent.rm] === 1) { extra.note = ent.rm; extra.name = ent.name || 'Item'; }
    } else {
        if (typeof q.rowId !== 'string' || !ROW_ID.test(q.rowId)) return { ok: false, reason: 'value' };
        var idx = at(q.rowId); if (idx < 0 || (opts.player && list[idx].hid === 1)) return { ok: false, reason: 'missing' };   // a kept curse reads as gone to a player
        extra.row = q.rowId;
        if (q.op === 'keep') {   // "Make custom" — a deleted entry's copy becomes the character's own item
            if (opts.player || !isObj(list[idx].snap)) return { ok: false, reason: 'field' };
            var wasHid = list[idx].hid === 1;
            list[idx] = { id: q.rowId, qty: list[idx].qty, def: list[idx].snap }; if (wasHid) list[idx].hid = 1;
            extra.qty = list[idx].qty;
        } else {
            var cur = list[idx].qty | 0, nq = 0, gr = isObj(opts.grace) ? Math.max(0, opts.grace.added | 0) : -1;   // gr: what the open pickup window may still take back (-1: none open)
            if (q.op === 'setQty') { nq = cleanNum(q.qty, NaN); if (!isFinite(nq)) return { ok: false, reason: 'value' }; nq = Math.min(Math.max(0, nq | 0), LIMITS.maxQty); }
            else if (q.op === 'undo') { var back = clampNum(cleanNum(q.qty, 0) | 0, 0, LIMITS.maxQty); if (gr >= 0) back = Math.min(back, gr); nq = Math.max(0, cur - back); }   // the host's own count wins: never more than was picked up
            var rd = rowDef(sys, list[idx]), rmode = rd && rd.def && RM_MODES[rd.def.rm] === 1 ? rd.def.rm : '', mode = opts.player ? rmode : '';
            var msg = mode && typeof rd.def.rmMsg === 'string' ? rd.def.rmMsg : '', nm = rmode ? (rd.def.name || 'Item') : '';
            if (nq > cur) { extra.added = nq - cur; if (opts.player && rmode) { extra.note = rmode; extra.name = nm; } }   // more of it: a pickup (the Undo, the GM's notice)
            if (mode === 'bound' && nq < cur && !(gr >= 0 && cur - nq <= gr)) return { ok: false, reason: 'stays', msg: msg, name: nm };
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
        var res = F.evaluate(text, { vars: fn, random: noDice, depth: chain.length, stack: chain.slice() });
        chain.pop();
        if (res.ok) return { value: res.value, via: viaOf(res.breakdown && res.breakdown.names) };
        return { error: res.error };
    }
    function loopError(name) { return { error: { message: 'Formulas refer to each other in a loop: ' + chain.concat(name).join(' → '), pos: 0, len: 0 } }; }
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
            else if (suffix === 'base' || !suffix) { var b = field.base ? evalDef(l, field.base) : { value: 0 }; if (b.error) return b; out = suffix === 'base' ? withFx(l, b.value, b.via || null) : withFx(l, ranks + b.value, b.via || null); }   // 5h: effects reach the total; ranks and base stay raw
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
    fn.reset = function() { cache = map(); chain = []; detail = map(); };
    fn.chain = function() { return chain.slice(); };
    fn.detail = function(name) { return detail[lower(name)] || null; };   // 5h: { base, mods: [{name, op, v, gm}], via: [{through, name, op, v, gm}] } or null
    return fn;
}
// Stage 6: a caption's {…} — "±X" (or "+/-X") shows X with its sign (+2, -1, +0); the sign is never formula syntax, so no older caption reads differently
function capExpr(s) { var t = String(s).trim(), m = /^(\u00b1|\+\/-)\s*/.exec(t); return m ? { expr: t.slice(m[0].length), signed: true } : { expr: t, signed: false }; }
// HUD frame (HF5a, H3): a roll's label may show values like a caption. What players see of a label that names a GM-only value: its plain
// text before the first "{", less a trailing separator ("Trap save ({GMFig})" -> "Trap save"), or Roll
function labelHead(text) { return String(text).split('{')[0].replace(/[\s(\[:\u00b7-]+$/, '') || 'Roll'; }
// The names a label's {...} values read, as a roll's breakdown names them ([{ name }]) for the GM's privacy check; the first LIMITS.captionExprs, as drawn
function labelNames(F, text) {
    var out = [], seen = map(); if (typeof text !== 'string' || !F || !F.names) return out;
    var re = /\{([^{}]{1,300})\}/g, m, n = 0;
    while (n < LIMITS.captionExprs && (m = re.exec(text))) { n++; var ns = []; try { ns = F.names(capExpr(m[1]).expr) || []; } catch (e) {} ns.forEach(function(nm) { var l = lower(nm); if (!seen[l]) { seen[l] = 1; out.push({ name: nm }); } }); }
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
function resolveAll(sys, char, F, tctx) {   // tctx: tokenCtx(...) = { facing, stance } for the built-in token names (Facing, Arc, Threats, Posture, Elevation); none reads them neutral
    var ro = isObj(tctx) ? { facing: tctx.facing || null, stance: tctx.stance || null, combat: isObj(tctx.combat) ? tctx.combat : null } : null;   // HF5b: the combat's round too
    var r = makeResolver(sys, char, F, ro), out = map(), r0 = null;
    var base0 = function(name) { r0 = r0 || makeResolver(sys, char, F, { noFx: true, facing: ro ? ro.facing : null, stance: ro ? ro.stance : null, combat: ro ? ro.combat : null }); var v = r0(name); return (typeof v === 'number' || typeof v === 'boolean') ? v : undefined; };
    Object.defineProperty(out, 'vars', { value: r });   // Fold B: the warm resolver, for captions (not enumerable: every field loop over the result is unchanged)
    sys.fields.forEach(function(f) {
        var e = { value: undefined, text: '', error: null };
        var k = f.kind;
        if (k === 'text' || k === 'select' || k === 'notes') { e.value = storedOf(f, char); e.text = String(e.value); }
        else if (k === 'item-list') { e.value = storedOf(f, char); e.text = ''; }   // a carried list; sheets.js renders it, not a number
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
    var all = resolveAll(sys, char, F, tctx), lines = [];
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
    var edges = map();
    function checkFormula(owner, prop, text, allowDice, vis) {
        if (text === null) return;
        if (!text) { errors.push({ id: owner.id, prop: prop, message: 'Missing formula', pos: 0, len: 0 }); return; }
        var p = F.parse(text);
        if (!p.ok) { errors.push({ id: owner.id, prop: prop, message: p.error.message, pos: p.error.pos, len: p.error.len }); return; }
        if (!allowDice && hasDice(p.ast.body)) { errors.push({ id: owner.id, prop: prop, message: 'Dice are not allowed in a definition; put the dice in a roll.', pos: 0, len: text.length }); }
        p.names.forEach(function(n) {
            var l = lower(n), target = known[l];
            if (!target) { var s = suggest(n, keys); errors.push({ id: owner.id, prop: prop, message: 'Unknown name "' + n + '"' + (s ? ' — did you mean "' + s + '"?' : ''), pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (!NUMERIC[target.kind]) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is ' + (target.kind === 'notes' ? 'a notes field' : (target.kind === 'effects' || target.kind === 'item-list') ? 'a list' : 'text') + ', not a number.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (vis === 'all' && target.vis === 'gm') warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" is GM only: players will see an error for this ' + (prop === 'roll' || prop === 'rollFormula' ? 'roll' : 'field') + '.' });
            if (prop !== 'roll' && prop !== 'rollFormula') { var from = lower(owner.key); (edges[from] = edges[from] || []).push(lower(target.key)); }
        });
    }
    sys.fields.forEach(function(f) {
        var p = DEF_PROP[f.kind];
        if (p && !(p === 'base' && f.base === '')) checkFormula(f, p, f[p], false, f.vis);   // a skill with no base is ranks alone
        if (f.roll) checkFormula(f, 'roll', f.roll, true, f.vis);
        if (f.caption) {   // Fold B: each {formula} in the caption, as warnings
            var cre = /\{([^{}]{1,300})\}/g, cm, cn = 0;
            while ((cm = cre.exec(f.caption))) {
                var drawn = ++cn <= LIMITS.captionExprs, cp = F.parse(capExpr(cm[1]).expr);
                if (!cp.ok) { if (drawn) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: ' + cp.error.message }); continue; }
                if (drawn && hasDice(cp.ast.body)) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: dice are not worked out in a caption; put them in a roll.' });
                cp.names.forEach(function(nm) {
                    var tg = known[lower(nm)];
                    if (!tg) { if (drawn) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: unknown name "' + nm + '".' }); }
                    else if (!NUMERIC[tg.kind]) { if (drawn) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: "' + nm + '" is not a number.' }); }
                    else if (f.vis === 'all' && tg.vis === 'gm') warnings.push({ id: f.id, prop: 'caption', message: 'Caption: "' + nm + '" is GM only, so players will not see this caption.' });
                });
            }
            if (cn > LIMITS.captionExprs) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: only the first ' + LIMITS.captionExprs + ' {\u2026} values are worked out; the rest show as written.' });   // Stage 6
        }
    });
    sys.rolls.forEach(function(r) { checkFormula({ id: r.id, key: r.id }, 'rollFormula', r.formula, true, r.vis); });
    sys.rolls.forEach(function(r) {   // HUD frame (HF5a, H3): each {formula} in a roll's label, as the caption checks (warnings); a GM-only name says what players see instead
        if (typeof r.label !== 'string' || r.label.indexOf('{') < 0) return;
        var lre = /\{([^{}]{1,300})\}/g, lm, ln = 0, lgm = map();   // lgm: the GM-only names already warned about in this label (each once)
        while ((lm = lre.exec(r.label))) {
            var ldrawn = ++ln <= LIMITS.captionExprs, lp = F.parse(capExpr(lm[1]).expr);
            if (!lp.ok) { if (ldrawn) warnings.push({ id: r.id, prop: 'label', message: 'Label: ' + lp.error.message }); continue; }
            if (ldrawn && hasDice(lp.ast.body)) warnings.push({ id: r.id, prop: 'label', message: 'Label: dice are not worked out in a label; put them in the formula.' });
            lp.names.forEach(function(nm) {
                var tg = known[lower(nm)];
                if (!tg) { if (ldrawn) warnings.push({ id: r.id, prop: 'label', message: 'Label: unknown name "' + nm + '".' }); }
                else if (!NUMERIC[tg.kind]) { if (ldrawn) warnings.push({ id: r.id, prop: 'label', message: 'Label: "' + nm + '" is not a number.' }); }
                else if (r.vis === 'all' && tg.vis === 'gm' && !lgm[lower(nm)]) { lgm[lower(nm)] = 1; warnings.push({ id: r.id, prop: 'label', message: 'Label: "' + nm + '" is GM only, so players see only "' + labelHead(r.label) + '".' }); }
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
    // loops: DFS over the definition graph
    var state = map(), stack = [];
    function visit(k) {
        state[k] = 1; stack.push(k);
        (edges[k] || []).forEach(function(to) {
            if (state[to] === 1) { var at = stack.indexOf(to), cyc = stack.slice(at).concat(to).map(function(x) { return ix[x] ? ix[x].key : x; }); errors.push({ id: ix[k] ? ix[k].id : k, prop: DEF_PROP[ix[k] ? ix[k].kind : ''] || 'formula', message: 'Formulas refer to each other in a loop: ' + cyc.join(' → '), pos: 0, len: 0 }); }
            else if (!state[to]) visit(to);
        });
        stack.pop(); state[k] = 2;
    }
    lowerKeys.forEach(function(k) { if (!state[k]) visit(k); });
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
    sys.fields.forEach(function(f) { if (!STORED[f.kind] || f.vis !== 'all') return; if (f.kind === 'item-list' && !own) return; if (!own && !f.hover) return; if (c.values && c.values[f.id] !== undefined) { var cv = c.values[f.id]; if (!probe && !fitsKind(f.kind, cv)) return; values[f.id] = (f.kind === 'item-list' && Array.isArray(cv) && !probe) ? projectRows(cv, sys, itemsFull) : (f.kind === 'effects' && Array.isArray(cv) && !probe) ? projectEffects(cv, sys, own, libFull) : cv; } });   // 5h: effects rows projected per recipient   // a carried list never travels to another player, hover flag or not
    return { id: c.id, name: c.name, ownerId: c.ownerId, portrait: c.portrait || '', npc: false, values: values, updated: c.updated || 0, partial: !own };
}
// The host's answer to one edit (its own or a player's): { ok, value } or { ok: false, reason }
function applyEdit(sys, char, fieldId, value, F, opts) {
    opts = opts || {};
    var f = fieldById(sys, fieldId); if (!f || !STORED[f.kind] || f.kind === 'effects') return { ok: false, reason: 'field' };   // 5h: an effects list changes only through applyEffectOp
    if (opts.player && f.edit !== 'owner') return { ok: false, reason: 'field' };
    if (opts.player && f.vis !== 'all') return { ok: false, reason: 'field' };
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

// The names a roll used (the engine's breakdown.names) that belong to a GM-only field, by key or by a reserved suffix: a GM's public roll must not carry them
function gmOnlyNames(sys, names) {
    if (!sys || !Array.isArray(sys.fields) || !Array.isArray(names)) return [];
    var ix = keyIndex(sys), out = [];
    names.forEach(function(n) {
        var l = lower(n && n.name || ''), f = ix[l];
        if (!f) { var dot = l.lastIndexOf('.'); if (dot > 0 && RESERVED_SUFFIX[l.slice(dot + 1)]) f = ix[l.slice(0, dot)]; }
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
// the pool or .cur while it is full, when they read the max). The players' view blanks such a value ("GM only"), so the GM's public roll must
// not show it. char: the character whose pools are asked about (none: every pool counts as full). Worked back from the GM-only fields over
// each definition once (a visited set, linear in the fields, so a loop ends). The names as spelled, each once; never throws (fail closed: an
// error lists every name)
function gmDerivedNames(sys, F, names, char) {
    if (!sys || !Array.isArray(sys.fields) || !F || typeof F.names !== 'function' || !Array.isArray(names)) return [];
    var out = [], seen = map(), nameOf = function(n) { return typeof n === 'string' ? n : (n && typeof n.name === 'string' ? n.name : ''); };
    var keep = function(n) { if (n && !seen[lower(n)]) { seen[lower(n)] = 1; out.push(n); } };
    try {
        var ix = keyIndex(sys), hot = map(), readBy = map(), queue = [];
        var reads = function(name) {   // the field a name reads (the resolver's lookup) and whether its value is that field's definition worked out
            var l = lower(name), f = ix[l], sfx = '', st;
            if (!f) { var dot = l.lastIndexOf('.'); if (dot > 0 && RESERVED_SUFFIX[l.slice(dot + 1)]) { f = ix[l.slice(0, dot)]; sfx = l.slice(dot + 1); } }
            if (!f) return null;
            var def = false;
            if (f.kind === 'formula') def = !sfx;   // a suffix on a formula is an unknown name
            else if (f.kind === 'skill') def = !sfx || sfx === 'base';
            else if (f.kind === 'resource') def = sfx === 'max' || ((!sfx || sfx === 'cur') && (!char || !isObj(st = storedOf(f, char)) || st.cur === null));   // a full pool reads its max
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
        while (queue.length) (readBy[queue.shift()] || []).forEach(function(id) { if (!hot[id]) { hot[id] = 1; queue.push(id); } });
        names.forEach(function(n) { var nm = nameOf(n), r = nm ? reads(nm) : null; if (r && (r.f.vis === 'gm' || (r.def && hot[r.f.id]))) keep(nm); });
    } catch (e) { out = []; seen = map(); names.forEach(function(n) { keep(nameOf(n)); }); }
    return out;
}
// The system's initiative roll (the one flagged init) or null
function initRoll(sys) { if (!sys || !Array.isArray(sys.rolls)) return null; for (var i = 0; i < sys.rolls.length; i++) if (sys.rolls[i] && sys.rolls[i].init) return sys.rolls[i]; return null; }
var API = { VERSION: VERSION, hudView: hudView, hudHasContent: hudHasContent, pinTargetsAll: pinTargetsAll, TONES: TONES, valueTone: valueTone, cleanTones: cleanTones, playableChars: playableChars, activeCharOf: activeCharOf, activeChars: activeChars, ownedTokenPlan: ownedTokenPlan, applyOwnerOps: applyOwnerOps, migrateBindings: migrateBindings, tokenSourceFor: tokenSourceFor, playsAs: playsAs, stackZ: stackZ, LIMITS: LIMITS, PALETTE_KEYS: PALETTE_KEYS, headerEdits: headerEdits, pinTargets: pinTargets, pruneGroups: pruneGroups, GROUP_ID: GROUP_ID, GLYPHS: GLYPHS, glyphPath: glyphPath, ROLL_TONES: ROLL_TONES, KINDS: KINDS, STORED: STORED, DEF_PROP: DEF_PROP, LAYOUT: LAYOUT, validPageId: validPageId, BAND_KINDS: BAND_KINDS, IDENTITY_KINDS: IDENTITY_KINDS, LEDGER_KINDS: LEDGER_KINDS, headerEntry: headerEntry, captionParts: captionParts, capExpr: capExpr, labelNames: labelNames, labelGmNames: labelGmNames, valueOpts: valueOpts, rowIdOf: rowIdOf, cleanRowDef: cleanRowDef, rowDef: rowDef, projectRows: projectRows, applyRowOp: applyRowOp, orphanRows: orphanRows, stampRows: stampRows, cleanItemMsg: cleanItemMsg, RM_MODES: RM_MODES, applyEffectOp: applyEffectOp, cleanCharEffect: cleanCharEffect, gmEffectNames: gmEffectNames, fxText: fxText, activeEffects: activeEffects, projectEffects: projectEffects, FACING_NAMES: FACING_NAMES, TOKEN_NAMES: TOKEN_NAMES, POSTURE_IDS: POSTURE_IDS, POSTURE_NAMES: POSTURE_NAMES, stanceCtx: stanceCtx, tokenCtx: tokenCtx, withRound: withRound, sideOf: sideOf, threatArc: threatArc, cleanThreats: cleanThreats, facingCtx: facingCtx, charTokenOn: charTokenOn, cycleThreat: cycleThreat, RESERVED_SUFFIX: RESERVED_SUFFIX, emptySystem: emptySystem, uid: uid, validKey: validKey, cleanFormulaText: cleanFormulaText, hasDice: hasDice, cleanField: cleanField, cleanRollDef: cleanRollDef, cleanItemDef: cleanItemDef, cleanCombat: cleanCombat, cleanCover: cleanCover, coverTier: coverTier, cleanSystem: cleanSystem, cleanValue: cleanValue, cleanChar: cleanChar, cleanCharEdit: cleanCharEdit, cleanCharEdits: cleanCharEdits, resetTargets: resetTargets, cleanCharItem: cleanCharItem, cleanDenyReason: cleanDenyReason, cleanSheetStyle: cleanSheetStyle, fieldById: fieldById, itemDef: itemDef, keyIndex: keyIndex, makeResolver: makeResolver, resolveAll: resolveAll, hoverLines: hoverLines, gmOnlyNames: gmOnlyNames, gmDerivedNames: gmDerivedNames, initRoll: initRoll, validateSystem: validateSystem, charFor: charFor, applyEdit: applyEdit, autoLayout: autoLayout, aliasFromShadowBase: aliasFromShadowBase, fmtNum: fmtNum, suggest: suggest };
if (typeof window !== 'undefined') window.wpSystemCore = API;
export { VERSION, hudView, hudHasContent, pinTargetsAll, TONES, valueTone, cleanTones, playableChars, activeCharOf, activeChars, ownedTokenPlan, applyOwnerOps, migrateBindings, tokenSourceFor, playsAs, stackZ, LIMITS, PALETTE_KEYS, headerEdits, pinTargets, pruneGroups, GROUP_ID, GLYPHS, glyphPath, ROLL_TONES, KINDS, STORED, DEF_PROP, LAYOUT, validPageId, BAND_KINDS, IDENTITY_KINDS, LEDGER_KINDS, headerEntry, captionParts, capExpr, labelNames, labelGmNames, valueOpts, rowIdOf, cleanRowDef, rowDef, projectRows, applyRowOp, orphanRows, stampRows, cleanItemMsg, RM_MODES, applyEffectOp, cleanCharEffect, gmEffectNames, fxText, activeEffects, projectEffects, FACING_NAMES, TOKEN_NAMES, POSTURE_IDS, POSTURE_NAMES, stanceCtx, tokenCtx, withRound, sideOf, threatArc, cleanThreats, facingCtx, charTokenOn, cycleThreat, RESERVED_SUFFIX, emptySystem, uid, validKey, cleanFormulaText, hasDice, cleanField, cleanRollDef, cleanItemDef, cleanCombat, cleanCover, coverTier, cleanSystem, cleanValue, cleanChar, cleanCharEdit, cleanCharEdits, resetTargets, cleanCharItem, cleanDenyReason, cleanSheetStyle, fieldById, itemDef, keyIndex, makeResolver, resolveAll, hoverLines, gmOnlyNames, gmDerivedNames, initRoll, validateSystem, charFor, applyEdit, autoLayout, aliasFromShadowBase, fmtNum, suggest };
