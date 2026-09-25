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
    fields: 300, rolls: 50, sections: 20, tabs: 12, placements: 200, options: 50, optionChars: 60,
    key: 64, label: 60, formula: 300,       // 300 = the dice path's expression cap, so a sheet roll never dies there
    text: 200, notes: 20000, name: 60, charName: 60, names: 200,
    items: 200, carried: 100, category: 40, maxBlastFt: 3000, maxQty: 99,   // item library (Stage 5)
    cols: 4, editsPerWindow: 20, editWindowMs: 5000, editTimeoutMs: 5000, valueChars: 20000,
    band: 12,                                // Stage 5c: placements on the pinned band (one row under the name)
    identity: 12, ledger: 8,                 // Stage 5d: the header block — identity rows and ledger figures (read-only)
    icon: 8, unit: 8                         // Stage 5g: a tab's or a section's icon (code points: an emoji or a glyph or two), a number's unit ("pts")
});
// item-list is a STORED, non-numeric list kind (a character's carried items); never in NUMERIC/DEF_PROP.
var KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1, text: 1, notes: 1, select: 1, 'item-list': 1 });
var STORED = Object.freeze({ number: 1, resource: 1, skill: 1, toggle: 1, text: 1, notes: 1, select: 1, 'item-list': 1 });
var NUMERIC = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1 });   // kinds a formula may name
var DEF_PROP = Object.freeze({ formula: 'formula', resource: 'maxFormula', skill: 'base' });   // a kind's definition formula (no dice allowed)
var LAYOUT = Object.freeze({ heading: 1, divider: 1, portrait: 1, link: 1 });   // link (Stage 5f): a button that opens a handbook page
var BAND_KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1 });   // Stage 5c: what the pinned band can hold — kinds that read in one row (text, notes, selects and item lists stay in sections)
var IDENTITY_KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1, text: 1, select: 1 });   // Stage 5d: what an identity row can show, read-only (notes and item lists stay in sections)
var LEDGER_KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1 });   // Stage 5d: what a ledger figure can show — a number over its label
var RESERVED_SUFFIX = Object.freeze({ max: 1, ranks: 1, cur: 1, base: 1 });
var FUNC_NAMES = Object.freeze({ floor: 1, ceil: 1, trunc: 1, round: 1, abs: 1, sqrt: 1, min: 1, max: 1, clamp: 1, mod: 1, 'if': 1, and: 1, or: 1, not: 1, 'true': 1, 'false': 1 });
// Stage 5f: a handbook page id as a sheet names it. Pages' ids are free-form by contract (CAMPAIGN_INTEGRATION.md), capped at 80 by
// docrender.cleanDoc; never an Object.prototype name. The system cannot see the campaign, so this is the format only — which pages a
// player may see is decided by the host (cleanSystem's opts.pages) and again when the sheet is drawn.
var PAGE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
function validPageId(id) { return typeof id === 'string' && PAGE_ID.test(id) && !(id in Object.prototype); }
var FIELD_ID = /^f_[A-Za-z0-9_]{1,24}$/, ROLL_ID = /^r_[A-Za-z0-9_]{1,24}$/, SECTION_ID = /^s_[A-Za-z0-9_]{1,24}$/, TAB_ID = /^t_[A-Za-z0-9_]{1,24}$/, CHAR_ID = /^c_[A-Za-z0-9_]{1,24}$/, ITEM_ID = /^i_[A-Za-z0-9_]{1,24}$/, RID_RE = /^[A-Za-z0-9_-]{1,24}$/;
var SHAPES = Object.freeze({ circle: 1 }), BLAST_AUTO = Object.freeze({ full: 1, roll: 1, measure: 1 }), ITEM_OP = Object.freeze({ add: 1, remove: 1, setQty: 1 });
var CTRL_RE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');
var CTRL_RE_G = new RegExp(CTRL_RE.source, 'g');   // for replace(): every control character, not just the first
var CTRL_KEEP_NL = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(8) + String.fromCharCode(11) + String.fromCharCode(12) + String.fromCharCode(14) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g');
var PATH_RE = /^[/]saves[/]images[/][^?#]{1,300}$/;
var DENY = Object.freeze({ off: 1, slow: 1, owner: 1, field: 1, value: 1, missing: 1, paused: 1 });

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function str(v, cap) { return typeof v === 'string' ? v.slice(0, cap) : ''; }
// Stage 5g: a short label cut by code points — control characters become rep, a lone surrogate is dropped (never half an emoji)
function cutPoints(v, cap, rep) { if (typeof v !== 'string') return ''; return Array.from(v.slice(0, 256).replace(CTRL_RE_G, rep).trim()).filter(function(ch) { return !/^[\uD800-\uDFFF]$/.test(ch); }).slice(0, cap).join('').trim(); }
function cleanIcon(v) { return cutPoints(v, LIMITS.icon, ''); }   // a tab's or a section's icon; '' when none
function fin(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e15; }   // bounded: the wire's packer refuses a whole number past 64 bits (1e20 typed into a field once stopped every join)
function map() { return Object.create(null); }
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
    var vis = f.vis === 'gm' ? 'gm' : 'all';
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
    if (f.roll !== undefined) { var r = cleanFormulaText(f.roll); if (r) out.roll = r; }
    if (f.tile === true && (k === 'number' || k === 'formula' || k === 'skill' || k === 'resource')) out.tile = true;   // Stage 3: render this numeric field as a stat tile
    if ((k === 'number' || k === 'formula' || k === 'skill' || k === 'resource') && typeof f.unit === 'string') { var un = cutPoints(f.unit, LIMITS.unit, ' '); if (un) out.unit = un; }   // Stage 5g: a unit after the value ("pts", "kg")
    if ((k === 'number' || k === 'formula' || k === 'skill') && f.sign === true) out.sign = true;   // Stage 5g: colour the value by its sign (green above zero, red below)
    if (k === 'number' && (f.slider === true || isObj(f.slider))) out.slider = cleanSlider(f.slider);   // Stage 5e: a gradient slider (end labels, track colours) — drawn once the field has a min and a max (the sheet checks), kept either way so nothing the GM set is lost on Save; a plain number everywhere else
    return out;
}
function clampNum(v, lo, hi) { if (lo !== undefined && v < lo) v = lo; if (hi !== undefined && v > hi) v = hi; return v; }
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
    var out = { id: r.id, label: str(r.label, LIMITS.label).replace(CTRL_RE, ' ').trim() || 'Roll', formula: fm, vis: vis };
    if (r.init === true) out.init = true;
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
        name: str(it.name, LIMITS.name).replace(CTRL_RE, ' ').trim() || 'Item',
        category: str(it.category, LIMITS.category).replace(CTRL_RE, ' ').trim(),
        icon: str(it.icon, 8).replace(CTRL_RE, ''),
        notes: str(it.notes, LIMITS.text).replace(CTRL_RE, ' '),
        vis: vis, area: null, damage: '', cost: '', throwSkill: ''
    };
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
// Stage 5g: the sheet's own shape — headline section titles, filled (angled) tabs, one accent colour, the portrait and the name leading
// the header block. Whitelisted values only; absent (or nothing valid) = today's look, and the key is left out.
function cleanLook(v) {
    if (!isObj(v)) return null;
    var out = {};
    if (v.titles === 'headline') out.titles = 'headline';
    if (v.tabs === 'filled') out.tabs = 'filled';
    if (typeof v.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.accent)) out.accent = v.accent.toLowerCase();
    if (v.portrait === true) out.portrait = true;
    return Object.keys(out).length ? out : null;
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
function cleanSheet(sheet, fieldIds, rollIds, pages) {   // pages: null (format only) or a prototype-free set of the page ids players may see (Stage 5f)
    var out = { tabs: [], sections: [] }, placed = map(), total = 0, tabIds = map();
    if (!isObj(sheet)) return out;
    // Optional named tabs (Stage 1): ordered, labels only for v1. Absent ⇒ sections stack (as before).
    if (Array.isArray(sheet.tabs)) {
        for (var t = 0; t < sheet.tabs.length && out.tabs.length < LIMITS.tabs; t++) {
            var tb = sheet.tabs[t];
            if (!isObj(tb) || typeof tb.id !== 'string' || !TAB_ID.test(tb.id) || tabIds[tb.id]) continue;
            tabIds[tb.id] = 1;
            var tabOut = { id: tb.id, label: str(tb.label, LIMITS.label).replace(CTRL_RE, ' ').trim() }, tabIcon = cleanIcon(tb.icon);
            if (tabIcon) tabOut.icon = tabIcon;   // Stage 5g: an icon before the label
            out.tabs.push(tabOut);
        }
    }
    // Stage 5c: the pinned band — a few placements shown under the name on every tab (and on a stacked sheet). Its own cap and
    // its own once-per-item map: a field may be on the band AND in a section. Only what reads in one row (BAND_KINDS + rolls);
    // fieldIds carries each field's kind, and in the players' view it lacks GM-only fields, so those pins drop with no extra code.
    if (Array.isArray(sheet.band)) {
        var band = [], onBand = map();
        for (var b = 0; b < sheet.band.length && band.length < LIMITS.band; b++) {
            var q = sheet.band[b]; if (!isObj(q)) continue;
            if (typeof q.id === 'string' && BAND_KINDS[fieldIds[q.id]] === 1 && !onBand[q.id]) { onBand[q.id] = 1; band.push({ id: q.id }); }
            else if (typeof q.roll === 'string' && rollIds[q.roll] && !onBand[q.roll]) { onBand[q.roll] = 1; band.push({ roll: q.roll }); }
        }
        if (band.length) out.band = band;   // absent when empty: a system without a band is byte-for-byte what it was
    }
    // Stage 5d: the header block — identity rows and ledger figures are read-only lists of field ids (no rolls), each with its own
    // cap and once-per-id map, kind-gated like the band (so the players' view loses GM-only fields for free); absent when empty.
    function idList(list, kinds, cap) {
        if (!Array.isArray(list)) return null;
        var outL = [], seenL = map();
        for (var n = 0; n < list.length && outL.length < cap; n++) { var it = list[n]; if (!isObj(it) || typeof it.id !== 'string' || kinds[fieldIds[it.id]] !== 1 || seenL[it.id]) continue; seenL[it.id] = 1; outL.push({ id: it.id }); }
        return outL.length ? outL : null;
    }
    var identity = idList(sheet.identity, IDENTITY_KINDS, LIMITS.identity); if (identity) out.identity = identity;
    var ledger = idList(sheet.ledger, LEDGER_KINDS, LIMITS.ledger); if (ledger) out.ledger = ledger;
    var look = cleanLook(sheet.look); if (look) out.look = look;   // Stage 5g: the sheet's shape (headline titles, filled tabs, an accent, the portrait + name)
    if (!Array.isArray(sheet.sections)) return out;
    for (var i = 0; i < sheet.sections.length && out.sections.length < LIMITS.sections; i++) {
        var s = sheet.sections[i];
        if (!isObj(s) || typeof s.id !== 'string' || !SECTION_ID.test(s.id)) continue;
        var cols = Math.max(1, Math.min(LIMITS.cols, cleanNum(s.cols, 1) | 0));
        var sec = { id: s.id, title: str(s.title, LIMITS.label).replace(CTRL_RE, ' ').trim(), cols: cols, fields: [] };
        if (typeof s.tab === 'string' && tabIds[s.tab]) sec.tab = s.tab;   // keep only a tab ref that exists
        if (s.collapsible) sec.collapsible = true;                          // Stage 2: a collapsible <details> section
        if (validPageId(s.chip) && (!pages || pages[s.chip] === 1)) sec.chip = s.chip;   // Stage 5f: a handbook chip in the header (a page the players' view can open)
        if (s.pinned) sec.pinned = true;                                    // Stage 5d: a dashboard section — stays above the tab strip on every tab
        if (s.open === false) sec.open = false;                            // default open; store only an explicit "closed by default"
        if (typeof s.meta === 'string' && fieldIds[s.meta]) sec.meta = s.meta;   // a field whose value shows in the section header (e.g. a points total)
        if (typeof s.parent === 'string' && SECTION_ID.test(s.parent) && s.parent !== s.id) sec.parent = s.parent;   // nest under another section (the render enforces one level)
        var secStyle = cleanSecStyle(s.style); if (secStyle) sec.style = secStyle;   // Stage 3: per-section colors (accent/bg/border)
        var secIcon = cleanIcon(s.icon); if (secIcon) sec.icon = secIcon;   // Stage 5g: an icon before the title
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
            }
            if (item) { sec.fields.push(item); total++; }
        });
        out.sections.push(sec);
    }
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
            return F.names(text).some(function(n) { var l = lower(n), dot = l.lastIndexOf('.'); if (isDropped[l]) return true; return dot > 0 && RESERVED_SUFFIX[l.slice(dot + 1)] && isDropped[l.slice(0, dot)]; });
        };
        out.fields.forEach(function(f) { var p = DEF_PROP[f.kind]; if (p && f[p] && mentions(f[p])) f[p] = null; if (f.roll && mentions(f.roll)) delete f.roll; });
        out.rolls = out.rolls.filter(function(r) { return !mentions(r.formula); });
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
    out.combat = cleanCombat(sys.combat, resIds);
    var pages = null;   // Stage 5f: the host passes the ids of the pages players may read, so a chip or link to any other page never travels
    if (opts.pages !== undefined) { pages = map(); (Array.isArray(opts.pages) ? opts.pages : []).forEach(function(id) { if (validPageId(id)) pages[id] = 1; }); }
    out.sheet = cleanSheet(sys.sheet, fieldIds, rollIds, pages);
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
    if (k === 'item-list') {   // [{defId,qty}] — drop unknown/dup defIds, cap, clamp qty; opts.items is a proto-safe id set
        if (!Array.isArray(v)) return undefined;
        var items = (opts && opts.items) || map(), seen = map(), list = [];
        for (var i = 0; i < v.length && list.length < LIMITS.carried; i++) {
            var e = v[i];
            if (!isObj(e) || typeof e.defId !== 'string' || !ITEM_ID.test(e.defId) || !items[e.defId] || seen[e.defId]) continue;
            seen[e.defId] = 1; list.push({ defId: e.defId, qty: clampNum(cleanNum(e.qty, 1) | 0, 1, LIMITS.maxQty) });
        }
        return list;
    }
    return undefined;
}
function stepRound(n, field) { var step = field.step > 0 ? field.step : 1, base = field.min !== undefined ? field.min : 0; return base + Math.round((n - base) / step) * step; }
function cleanChar(c, sys) {
    if (!isObj(c) || typeof c.id !== 'string' || !CHAR_ID.test(c.id) || !sys) return null;
    var out = { id: c.id, name: str(c.name, LIMITS.charName).replace(CTRL_RE, ' ').trim() || 'Character', ownerId: str(c.ownerId, 60).replace(CTRL_RE, ''), portrait: '', npc: c.npc === true, values: {}, updated: fin(Number(c.updated)) ? Number(c.updated) : 0 };
    if (out.npc) out.ownerId = '';
    if (typeof c.portrait === 'string' && PATH_RE.test(c.portrait) && c.portrait.indexOf('..') < 0 && !CTRL_RE.test(c.portrait)) out.portrait = c.portrait;
    var vals = isObj(c.values) ? c.values : {};
    var itemIx = map(); (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) { if (it && typeof it.id === 'string') itemIx[it.id] = 1; });
    Object.keys(vals).forEach(function(fid) { var f = fieldById(sys, fid); if (!f || !STORED[f.kind]) return; var v = cleanValue(f, vals[fid], { items: itemIx }); if (v !== undefined) out.values[fid] = v; });
    return out;
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
// A per-entry inventory edit (item-list can't ride cleanCharEdit — arrays are refused there). { op, defId, qty }
function cleanCharItem(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId) || typeof msg.fieldId !== 'string' || !FIELD_ID.test(msg.fieldId)) return null;
    if (!ITEM_OP[msg.op] || typeof msg.defId !== 'string' || !ITEM_ID.test(msg.defId)) return null;
    var qty = msg.qty === undefined ? 1 : (cleanNum(msg.qty, NaN) | 0);
    if (!(qty >= 0)) return null;
    return { rid: msg.rid, charId: msg.charId, fieldId: msg.fieldId, op: msg.op, defId: msg.defId, qty: clampNum(qty, 0, LIMITS.maxQty) };
}
function cleanDenyReason(r) { return typeof r === 'string' && DENY[r] ? r : 'value'; }

/* ---------- the resolver: the engine reads a character's names through this ---------- */
function noDice() { return NaN; }   // a die inside a definition fails at the die: "The random source returned NaN"
function storedOf(field, char) {
    var v = char && char.values ? char.values[field.id] : undefined;
    if (v === undefined) return field.kind === 'resource' ? (field.def === 'max' ? { cur: null } : { cur: field.def }) : field.kind === 'notes' ? '' : field.kind === 'item-list' ? [] : field.def;
    return v;
}
function makeResolver(sys, char, F) {
    var ix = keyIndex(sys), cache = map(), chain = [];
    function evalDef(name, text) {
        if (text === null) return { error: { message: 'GM only', pos: 0, len: 0 } };
        if (!text) return { error: { message: 'Missing formula', pos: 0, len: 0 } };
        chain.push(name);
        var res = F.evaluate(text, { vars: fn, random: noDice, depth: chain.length, stack: chain.slice() });
        chain.pop();
        if (res.ok) return { value: res.value };
        return { error: res.error };
    }
    function loopError(name) { return { error: { message: 'Formulas refer to each other in a loop: ' + chain.concat(name).join(' → '), pos: 0, len: 0 } }; }
    function fn(name) {
        var l = lower(name);
        if (l in cache) return cache[l];
        var field = ix[l], suffix = null;
        if (!field) { var dot = l.lastIndexOf('.'); if (dot > 0 && RESERVED_SUFFIX[l.slice(dot + 1)]) { field = ix[l.slice(0, dot)]; suffix = l.slice(dot + 1); } }
        if (!field) return undefined;
        if (chain.indexOf(l) >= 0) return loopError(l);
        var out, r, k = field.kind;
        if (k === 'text' || k === 'select') out = storedOf(field, char);
        else if (k === 'notes') return undefined;
        else if (k === 'number' || k === 'toggle') out = storedOf(field, char);
        else if (k === 'skill') {
            var ranks = storedOf(field, char);
            if (suffix === 'ranks') out = ranks;
            else if (suffix === 'base' || !suffix) { var b = field.base ? evalDef(l, field.base) : { value: 0 }; if (b.error) return b; out = suffix === 'base' ? b.value : ranks + b.value; }
            else return undefined;
        } else if (k === 'resource') {
            if (suffix && suffix !== 'max' && suffix !== 'cur') return undefined;
            var stored = storedOf(field, char);   // { cur } — cur null means "full" (def: 'max')
            if (suffix === 'max' || stored.cur === null) { r = field.maxFormula ? evalDef(l + '.max', field.maxFormula) : { value: field.min || 0 }; if (r.error) return r; out = r.value; }
            else out = stored.cur;
        } else if (k === 'formula') { if (suffix) return undefined; r = evalDef(l, field.formula); if (r.error) return r; out = r.value; }
        else return undefined;
        cache[l] = out;   // values only; an error is path-dependent and is never cached
        return out;
    }
    fn.reset = function() { cache = map(); chain = []; };
    fn.chain = function() { return chain.slice(); };
    return fn;
}
// Every field's value for a render: { fieldId: { value, text, error, max } } (max for resources)
function resolveAll(sys, char, F) {
    var r = makeResolver(sys, char, F), out = map();
    sys.fields.forEach(function(f) {
        var e = { value: undefined, text: '', error: null };
        var k = f.kind;
        if (k === 'text' || k === 'select' || k === 'notes') { e.value = storedOf(f, char); e.text = String(e.value); }
        else if (k === 'item-list') { e.value = storedOf(f, char); e.text = ''; }   // a carried list; sheets.js renders it, not a number
        else if (k === 'toggle' || k === 'number') { e.value = storedOf(f, char); e.text = fmtNum(e.value); }
        else {
            var v = r(f.key);
            if (v && typeof v === 'object' && v.error) { e.error = v.error.message; e.text = '—'; }
            else { e.value = v; e.text = fmtNum(v); }
            if (k === 'resource') { var m = r(f.key + '.max'); if (m && typeof m === 'object' && m.error) { e.max = null; if (!e.error) e.error = m.error.message; } else { e.max = m; e.text = fmtNum(e.value) + ' / ' + fmtNum(m); } }
            if (k === 'skill') { var rk = r(f.key + '.ranks'); e.ranks = rk; }
        }
        out[f.id] = e;
    });
    return out;
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
    var numeric = (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill') && typeof e.value === 'number';
    var out = { text: f.unit ? e.text + ' ' + f.unit : e.text };
    if (numeric && e.value < 0) out.neg = true; else if (numeric && f.sign && e.value > 0) out.pos = true;
    return out;
}
// "HP 7 / 14 · Prone" — the hover card and the party strip; a field that errors here is skipped, never printed as an error
function hoverLines(sys, char, F) {
    var all = resolveAll(sys, char, F), lines = [];
    sys.fields.forEach(function(f) {
        if (!f.hover) return;
        var e = all[f.id]; if (!e || e.error) return;
        if (f.kind === 'toggle') { if (e.value === true) lines.push(f.label); return; }
        if (f.kind === 'notes') return;
        if (e.text) lines.push(f.label + ' ' + e.text);
    });
    return lines;
}

/* ---------- the validator behind the editor ---------- */
function validateSystem(sys, F) {
    var errors = [], warnings = [];
    if (!sys || !F) return { ok: false, errors: [{ message: 'No system.' }], warnings: warnings };
    var keys = sys.fields.map(function(f) { return f.key; }), lowerKeys = keys.map(lower), ix = keyIndex(sys);
    var known = map(); sys.fields.forEach(function(f) { known[lower(f.key)] = f; if (f.kind === 'resource') { known[lower(f.key) + '.max'] = f; known[lower(f.key) + '.cur'] = f; } if (f.kind === 'skill') { known[lower(f.key) + '.ranks'] = f; known[lower(f.key) + '.base'] = f; } });
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
            if (!NUMERIC[target.kind]) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is ' + (target.kind === 'notes' ? 'a notes field' : 'text') + ', not a number.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (vis === 'all' && target.vis === 'gm') warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" is GM only: players will see an error for this ' + (prop === 'roll' || prop === 'rollFormula' ? 'roll' : 'field') + '.' });
            if (prop !== 'roll' && prop !== 'rollFormula') { var from = lower(owner.key); (edges[from] = edges[from] || []).push(lower(target.key)); }
        });
    }
    sys.fields.forEach(function(f) {
        var p = DEF_PROP[f.kind];
        if (p && !(p === 'base' && f.base === '')) checkFormula(f, p, f[p], false, f.vis);   // a skill with no base is ranks alone
        if (f.roll) checkFormula(f, 'roll', f.roll, true, f.vis);
    });
    sys.rolls.forEach(function(r) { checkFormula({ id: r.id, key: r.id }, 'rollFormula', r.formula, true, r.vis); });
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {   // item damage = a roll (dice ok); cost = a definition (no dice)
        if (it.damage) checkFormula({ id: it.id, key: it.id }, 'damage', it.damage, true, it.vis);
        if (it.cost) checkFormula({ id: it.id, key: it.id }, 'cost', it.cost, false, it.vis);
        if (it.throwSkill && !ix[lower(it.throwSkill)]) warnings.push({ id: it.id, prop: 'throwSkill', message: 'Throw skill "' + it.throwSkill + '" is not a field.' });
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
function charFor(c, sys, recipientId) {
    if (!c || c.npc || !c.ownerId) return null;
    var own = c.ownerId === recipientId, values = {};
    sys.fields.forEach(function(f) { if (!STORED[f.kind] || f.vis !== 'all') return; if (f.kind === 'item-list' && !own) return; if (!own && !f.hover) return; if (c.values && c.values[f.id] !== undefined) values[f.id] = c.values[f.id]; });   // a carried list never travels to another player, hover flag or not
    return { id: c.id, name: c.name, ownerId: c.ownerId, portrait: c.portrait || '', npc: false, values: values, updated: c.updated || 0, partial: !own };
}
// The host's answer to one edit (its own or a player's): { ok, value } or { ok: false, reason }
function applyEdit(sys, char, fieldId, value, F, opts) {
    opts = opts || {};
    var f = fieldById(sys, fieldId); if (!f || !STORED[f.kind]) return { ok: false, reason: 'field' };
    if (opts.player && f.edit !== 'owner') return { ok: false, reason: 'field' };
    if (opts.player && f.vis !== 'all') return { ok: false, reason: 'field' };
    var max = null;
    if (f.kind === 'resource') { var r = makeResolver(sys, char, F)(f.key + '.max'); max = typeof r === 'number' && isFinite(r) ? r : null; }
    var v = cleanValue(f, value, { max: max });
    if (v === undefined) return { ok: false, reason: 'value' };
    return { ok: true, value: v };
}
// The host's answer to one inventory op (its own or a player's): returns the new {defId,qty}[] or { ok:false, reason }.
// The item def is read from the system (never trusted from the client); a player may not touch a GM item or a locked list.
function applyItemOp(sys, char, fieldId, op, defId, qty, opts) {
    opts = opts || {};
    var f = fieldById(sys, fieldId); if (!f || f.kind !== 'item-list') return { ok: false, reason: 'field' };
    if (opts.player && (f.edit !== 'owner' || f.vis !== 'all')) return { ok: false, reason: 'field' };
    if (!ITEM_OP[op] || typeof defId !== 'string' || !ITEM_ID.test(defId)) return { ok: false, reason: 'value' };
    var def = null; for (var i = 0; i < (Array.isArray(sys.items) ? sys.items : []).length; i++) if (sys.items[i].id === defId) { def = sys.items[i]; break; }
    if (!def) return { ok: false, reason: 'missing' };
    if (opts.player && def.vis === 'gm') return { ok: false, reason: 'field' };
    var src = char && Array.isArray(char.values && char.values[fieldId]) ? char.values[fieldId] : [];
    var list = src.map(function(e) { return { defId: e.defId, qty: e.qty }; });
    var idx = -1; for (var j = 0; j < list.length; j++) if (list[j].defId === defId) { idx = j; break; }
    var n = clampNum((qty | 0) || 0, 0, LIMITS.maxQty);
    if (op === 'add') { if (idx >= 0) list[idx].qty = clampNum(list[idx].qty + (n || 1), 1, LIMITS.maxQty); else if (list.length < LIMITS.carried) list.push({ defId: defId, qty: n || 1 }); else return { ok: false, reason: 'field' }; }
    else if (op === 'remove') { if (idx >= 0) list.splice(idx, 1); }
    else if (op === 'setQty') { if (n <= 0) { if (idx >= 0) list.splice(idx, 1); } else if (idx >= 0) list[idx].qty = n; else if (list.length < LIMITS.carried) list.push({ defId: defId, qty: n }); else return { ok: false, reason: 'field' }; }
    return { ok: true, value: list };
}
// The item def a token/character would throw, by id (host reads area.ft from here, never from the wire). Null if absent.
function itemDef(sys, defId) { var a = Array.isArray(sys && sys.items) ? sys.items : []; for (var i = 0; i < a.length; i++) if (a[i].id === defId) return a[i]; return null; }

/* ---------- the auto layout (SB2): one section per kind group, then the rolls ---------- */
function autoLayout(sys) {
    var groups = [['number', 'Attributes'], ['formula', 'Derived'], ['resource', 'Resources'], ['skill', 'Skills'], ['toggle', 'Conditions'], ['item-list', 'Items'], ['text', 'Details'], ['select', 'Details'], ['notes', 'Notes']];
    var secs = [], byTitle = map();
    groups.forEach(function(g) {
        sys.fields.forEach(function(f) {
            if (f.kind !== g[0]) return;
            var s = byTitle[g[1]]; if (!s) { s = byTitle[g[1]] = { id: 's_auto_' + g[1].toLowerCase(), title: g[1], cols: g[0] === 'notes' || g[0] === 'item-list' ? 1 : g[0] === 'toggle' ? 4 : g[0] === 'skill' ? 2 : 3, fields: [] }; secs.push(s); }
            s.fields.push({ id: f.id, w: f.kind === 'notes' || f.kind === 'item-list' ? 'row' : 1 });
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
        if (!isObj(s) || typeof s.name !== 'string' || typeof s.level !== 'number') return;
        var want = lower(s.name).replace(/[^a-z0-9]/g, '');
        var f = null;
        for (var i = 0; i < sys.fields.length; i++) { var c = sys.fields[i]; if (c.kind !== 'skill') continue; var last = lower(c.key).split('.').pop().replace(/[^a-z0-9]/g, ''), lab = lower(c.label).replace(/[^a-z0-9]/g, ''); if (last === want || lab === want) { f = c; break; } }
        if (!f) return;
        var base = 0;
        if (f.base) { var r = makeResolver(sys, temp, F)(f.key + '.base'); if (typeof r === 'number' && isFinite(r)) base = r; }
        values[f.id] = cleanValue(f, s.level - base, null);
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
// The system's initiative roll (the one flagged init) or null
function initRoll(sys) { if (!sys || !Array.isArray(sys.rolls)) return null; for (var i = 0; i < sys.rolls.length; i++) if (sys.rolls[i] && sys.rolls[i].init) return sys.rolls[i]; return null; }
var API = { VERSION: VERSION, LIMITS: LIMITS, KINDS: KINDS, STORED: STORED, DEF_PROP: DEF_PROP, LAYOUT: LAYOUT, validPageId: validPageId, BAND_KINDS: BAND_KINDS, IDENTITY_KINDS: IDENTITY_KINDS, LEDGER_KINDS: LEDGER_KINDS, headerEntry: headerEntry, RESERVED_SUFFIX: RESERVED_SUFFIX, emptySystem: emptySystem, uid: uid, validKey: validKey, cleanFormulaText: cleanFormulaText, hasDice: hasDice, cleanField: cleanField, cleanRollDef: cleanRollDef, cleanItemDef: cleanItemDef, cleanCombat: cleanCombat, cleanCover: cleanCover, coverTier: coverTier, cleanSystem: cleanSystem, cleanValue: cleanValue, cleanChar: cleanChar, cleanCharEdit: cleanCharEdit, cleanCharItem: cleanCharItem, cleanDenyReason: cleanDenyReason, cleanSheetStyle: cleanSheetStyle, fieldById: fieldById, itemDef: itemDef, keyIndex: keyIndex, makeResolver: makeResolver, resolveAll: resolveAll, hoverLines: hoverLines, gmOnlyNames: gmOnlyNames, initRoll: initRoll, validateSystem: validateSystem, charFor: charFor, applyEdit: applyEdit, applyItemOp: applyItemOp, autoLayout: autoLayout, aliasFromShadowBase: aliasFromShadowBase, fmtNum: fmtNum, suggest: suggest };
if (typeof window !== 'undefined') window.wpSystemCore = API;
export { VERSION, LIMITS, KINDS, STORED, DEF_PROP, LAYOUT, validPageId, BAND_KINDS, IDENTITY_KINDS, LEDGER_KINDS, headerEntry, RESERVED_SUFFIX, emptySystem, uid, validKey, cleanFormulaText, hasDice, cleanField, cleanRollDef, cleanItemDef, cleanCombat, cleanCover, coverTier, cleanSystem, cleanValue, cleanChar, cleanCharEdit, cleanCharItem, cleanDenyReason, cleanSheetStyle, fieldById, itemDef, keyIndex, makeResolver, resolveAll, hoverLines, gmOnlyNames, initRoll, validateSystem, charFor, applyEdit, applyItemOp, autoLayout, aliasFromShadowBase, fmtNum, suggest };
