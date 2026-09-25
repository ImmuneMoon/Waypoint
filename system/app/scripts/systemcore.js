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
    icon: 8, unit: 8,                        // Stage 5g: a tab's or a section's icon (code points: an emoji or a glyph or two), a number's unit ("pts")
    caption: 200, captionExprs: 8,           // Stage 5g Fold B: a field's caption line and the {formula} values in it
    effects: 100, effectRows: 30, effectMods: 12, effectAmount: 1e6, effectDur: 40   // Stage 5h: the library, a character's list, changes per effect, a change's size, a duration note
});
// item-list is a STORED, non-numeric list kind (a character's carried items); never in NUMERIC/DEF_PROP.
var KINDS = Object.freeze({ number: 1, formula: 1, resource: 1, skill: 1, toggle: 1, text: 1, notes: 1, select: 1, 'item-list': 1, effects: 1 });
var STORED = Object.freeze({ number: 1, resource: 1, skill: 1, toggle: 1, text: 1, notes: 1, select: 1, 'item-list': 1, effects: 1 });   // effects (5h): a character's status effects — rows, never a number
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
var EFFECT_ID = /^e_[A-Za-z0-9_]{1,24}$/, FXROW_ID = /^x_[A-Za-z0-9_]{1,24}$/;   // 5h: a library effect, a row on a character's list
var FX_OPS = Object.freeze({ add: 1, adhoc: 1, on: 1, remove: 1 });
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
    if (v.titles === 'headline') out.titles = 'headline';
    if (v.tabs === 'filled') out.tabs = 'filled';
    if (typeof v.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.accent)) out.accent = v.accent.toLowerCase();
    if (v.portrait === true) out.portrait = true;
    if (v.labels === 'caps') out.labels = 'caps';   // Fold B: field labels in small bold capitals
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
        var capMentions = function(t) { var re = /\{([^{}]{1,300})\}/g, m, n = 0; while (n++ < LIMITS.captionExprs && (m = re.exec(t))) { if (mentions(m[1].trim())) return true; } return false; };   // Fold B: a caption's {formula} is formula text too
        out.fields.forEach(function(f) { var p = DEF_PROP[f.kind]; if (p && f[p] && mentions(f[p])) f[p] = null; if (f.roll && mentions(f.roll)) delete f.roll; if (f.caption && capMentions(f.caption)) delete f.caption; });
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
    var seenFx = map(), effs = [];   // 5h: the status-effect library, after the fields (its changes are checked against them); absent when empty
    (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (effs.length >= LIMITS.effects) return; var c = cleanEffectDef(d, fieldIds, gmView); if (!c || seenFx[c.id]) return; seenFx[c.id] = 1; effs.push(c); });
    if (effs.length) out.effects = effs;
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
function makeResolver(sys, char, F, ropts) {   // ropts.noFx: the values with no effect applied (the breakdown's true base)
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
// Stage 5g Fold B: a field's caption as parts for the sheet to draw — plain text, and each {formula} worked out for this character (no
// dice; at most LIMITS.captionExprs, the rest stays text). [{ text }] | [{ value, text }] | [{ error }]; the sheet draws them as text only.
function captionParts(sys, char, F, text, vars) {   // vars: the render's own resolver (resolveAll(...).vars), so a caption reads values already worked out
    var out = []; if (typeof text !== 'string' || !text || !sys || !F) return out;
    var re = /\{([^{}]{1,300})\}/g, last = 0, m, n = 0, fn = null;
    while (n < LIMITS.captionExprs && (m = re.exec(text))) {
        if (m.index > last) out.push({ text: text.slice(last, m.index) });
        n++; last = re.lastIndex;
        if (!fn) fn = typeof vars === 'function' ? vars : makeResolver(sys, char, F);
        var res = F.evaluate(m[1].trim(), { vars: fn, random: noDice });
        if (!res || !res.ok) { out.push({ error: String((res && res.error && res.error.message) || 'error') }); continue; }
        var v = res.value;
        out.push({ value: v, text: typeof v === 'number' ? fmtNum(v) : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v).slice(0, 60) });
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
}
// Every field's value for a render: { fieldId: { value, text, error, max } } (max for resources)
function resolveAll(sys, char, F) {
    var r = makeResolver(sys, char, F), out = map(), r0 = null;
    var base0 = function(name) { r0 = r0 || makeResolver(sys, char, F, { noFx: true }); var v = r0(name); return (typeof v === 'number' || typeof v === 'boolean') ? v : undefined; };
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
    var numeric = (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill') && typeof e.value === 'number';
    var out = { text: f.unit ? e.text + ' ' + f.unit : e.text };
    if (numeric && e.value < 0) out.neg = true; else if (numeric && f.sign && e.value > 0) out.pos = true;
    var why = fxText(e) || (f.kind === 'resource' ? fxText(e, true) : ''); if (why) out.why = why;   // 5h: where the number came from
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
            while (cn++ < LIMITS.captionExprs && (cm = cre.exec(f.caption))) {
                var cp = F.parse(cm[1].trim());
                if (!cp.ok) { warnings.push({ id: f.id, prop: 'caption', message: 'Caption: ' + cp.error.message }); continue; }
                if (hasDice(cp.ast.body)) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: dice are not worked out in a caption; put them in a roll.' });
                cp.names.forEach(function(nm) {
                    var tg = known[lower(nm)];
                    if (!tg) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: unknown name "' + nm + '".' });
                    else if (!NUMERIC[tg.kind]) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: "' + nm + '" is not a number.' });
                    else if (f.vis === 'all' && tg.vis === 'gm') warnings.push({ id: f.id, prop: 'caption', message: 'Caption: "' + nm + '" is GM only, so players will not see this caption.' });
                });
            }
        }
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
    var viewItems = valueOpts(sys).items;   // the recipient's view (players' system): a GM-only item in the list never travels
    sys.fields.forEach(function(f) { if (!STORED[f.kind] || f.vis !== 'all') return; if (f.kind === 'item-list' && !own) return; if (!own && !f.hover) return; if (c.values && c.values[f.id] !== undefined) { var cv = c.values[f.id]; if (!probe && !fitsKind(f.kind, cv)) return; values[f.id] = (f.kind === 'item-list' && Array.isArray(cv)) ? cv.filter(function(e) { return isObj(e) && typeof e.defId === 'string' && viewItems[e.defId] === 1; }) : (f.kind === 'effects' && Array.isArray(cv) && !probe) ? projectEffects(cv, sys, own, libFull) : cv; } });   // 5h: effects rows projected per recipient   // a carried list never travels to another player, hover flag or not
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
function autoLayout(sys) {
    var groups = [['number', 'Attributes'], ['formula', 'Derived'], ['resource', 'Resources'], ['skill', 'Skills'], ['toggle', 'Conditions'], ['item-list', 'Items'], ['effects', 'Effects'], ['text', 'Details'], ['select', 'Details'], ['notes', 'Notes']];
    var secs = [], byTitle = map();
    groups.forEach(function(g) {
        sys.fields.forEach(function(f) {
            if (f.kind !== g[0]) return;
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
// The system's initiative roll (the one flagged init) or null
function initRoll(sys) { if (!sys || !Array.isArray(sys.rolls)) return null; for (var i = 0; i < sys.rolls.length; i++) if (sys.rolls[i] && sys.rolls[i].init) return sys.rolls[i]; return null; }
var API = { VERSION: VERSION, LIMITS: LIMITS, KINDS: KINDS, STORED: STORED, DEF_PROP: DEF_PROP, LAYOUT: LAYOUT, validPageId: validPageId, BAND_KINDS: BAND_KINDS, IDENTITY_KINDS: IDENTITY_KINDS, LEDGER_KINDS: LEDGER_KINDS, headerEntry: headerEntry, captionParts: captionParts, valueOpts: valueOpts, applyEffectOp: applyEffectOp, cleanCharEffect: cleanCharEffect, gmEffectNames: gmEffectNames, fxText: fxText, activeEffects: activeEffects, projectEffects: projectEffects, RESERVED_SUFFIX: RESERVED_SUFFIX, emptySystem: emptySystem, uid: uid, validKey: validKey, cleanFormulaText: cleanFormulaText, hasDice: hasDice, cleanField: cleanField, cleanRollDef: cleanRollDef, cleanItemDef: cleanItemDef, cleanCombat: cleanCombat, cleanCover: cleanCover, coverTier: coverTier, cleanSystem: cleanSystem, cleanValue: cleanValue, cleanChar: cleanChar, cleanCharEdit: cleanCharEdit, cleanCharItem: cleanCharItem, cleanDenyReason: cleanDenyReason, cleanSheetStyle: cleanSheetStyle, fieldById: fieldById, itemDef: itemDef, keyIndex: keyIndex, makeResolver: makeResolver, resolveAll: resolveAll, hoverLines: hoverLines, gmOnlyNames: gmOnlyNames, initRoll: initRoll, validateSystem: validateSystem, charFor: charFor, applyEdit: applyEdit, applyItemOp: applyItemOp, autoLayout: autoLayout, aliasFromShadowBase: aliasFromShadowBase, fmtNum: fmtNum, suggest: suggest };
if (typeof window !== 'undefined') window.wpSystemCore = API;
export { VERSION, LIMITS, KINDS, STORED, DEF_PROP, LAYOUT, validPageId, BAND_KINDS, IDENTITY_KINDS, LEDGER_KINDS, headerEntry, captionParts, valueOpts, applyEffectOp, cleanCharEffect, gmEffectNames, fxText, activeEffects, projectEffects, RESERVED_SUFFIX, emptySystem, uid, validKey, cleanFormulaText, hasDice, cleanField, cleanRollDef, cleanItemDef, cleanCombat, cleanCover, coverTier, cleanSystem, cleanValue, cleanChar, cleanCharEdit, cleanCharItem, cleanDenyReason, cleanSheetStyle, fieldById, itemDef, keyIndex, makeResolver, resolveAll, hoverLines, gmOnlyNames, initRoll, validateSystem, charFor, applyEdit, applyItemOp, autoLayout, aliasFromShadowBase, fmtNum, suggest };
