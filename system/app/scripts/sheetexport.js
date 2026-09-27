/* Onboarding F2: a character to take away — the pure half (no DOM, no state), so tools/systemcheck.js runs it under Node.
   charToJson(sys, view, all, opts): the character file ({ format: 'waypoint-character', v: 1, … }) of what the viewer's sheet holds — a
     player's own copy (never a GM-only value, row or effect they cannot see; the rows a library pack or a GM-only entry gave them travel
     inline, as their copy holds them), or on the GM's machine the players' view of any character unless the GM includes GM-only fields.
   sheetToMarkdown(sys, view, all, opts): a readable page in the handbook's dialect (docmd.js docToMarkdown, so it imports back as a
     page), the sheet walked as it is laid out: the header, the dashboard, the band as one line, every tab, every section.
   fileBase(name): a character's name as a file name. isCharFile(j): a character file. The caller (sheets.js) picks the view, works out
   `all` (resolveAll) on that same view and saves the file. */
import { STORED, fmtNum, headerEntry, autoLayout, rowDef, rowIdOf, rowLvl, rowOn, rowStat, rowPaid, showsIf, POSTURE_NAMES } from './systemcore.js';
import { docToMarkdown, mdEscapeText } from './docmd.js';
import { hashText } from './librarycore.js';
import { esc } from './safecore.js';

var FORMAT = 'waypoint-character', VERSION = 1, PICTURE_MAX = 200000, MD_COLS = 8;
var ITEM_COL_LABEL = { category: 'Category', cost: 'Cost', damage: 'Damage', area: 'Area' };   // a list's table columns (sheets.js ITEM_COL_LABEL; notes is a row of its own there)
var PIC_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/;
var COMPUTED = { number: 1, formula: 1, resource: 1, skill: 1, toggle: 1 };
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }

// A character's name as a file name: letters, digits, space, _ and - (the rule of the system and pack exports), at most 40, never a name
// Windows keeps for a device (CON, NUL, COM1…: "CON.md" cannot be saved there); nothing left → the fallback
function fileBase(name, fallback) {
    var s = String(name == null ? '' : name).replace(/[^A-Za-z0-9_ -]+/g, '').trim().replace(/ +/g, '_').slice(0, 40);
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s += '_';
    return s || fallback || 'character';
}
function isCharFile(j) { return isObj(j) && j.format === FORMAT; }
// A value the players' view cannot work out: its formula names a GM-only value ('GM only'), or reads one that does ('B: GM only')
function gmOnlyError(err) { return typeof err === 'string' && /(^|: )GM only$/.test(err); }
// The system a file was made against: the stored fields as the exporter's view holds them (id, key, kind) — a reader matches by id when it agrees
function systemSig(sys) {
    var rows = ((sys && Array.isArray(sys.fields)) ? sys.fields : []).filter(function(f) { return isObj(f) && STORED[f.kind]; }).map(function(f) { return f.id + '|' + f.key + '|' + f.kind; }).sort();
    return hashText(rows.join('\n'));
}
function computedOf(f, e) {
    if (e.error) return gmOnlyError(String(e.error)) ? 'GM only' : null;
    if (f.kind === 'resource') return { cur: typeof e.value === 'number' ? e.value : null, max: typeof e.max === 'number' ? e.max : null };
    if (f.kind === 'toggle') return !!e.value;
    return typeof e.value === 'number' && isFinite(e.value) ? e.value : (e.text != null && e.text !== '' ? String(e.text) : null);
}
// opts: { exported (an ISO time), gm (the GM's own copy: GM-only fields included), picture (a data URL of at most 200,000 characters) }
function charToJson(sys, view, all, opts) {
    opts = opts || {};
    var fields = {}, values = {}, computed = {}, vals = view && isObj(view.values) ? view.values : {};
    ((sys && Array.isArray(sys.fields)) ? sys.fields : []).forEach(function(f) {
        if (!isObj(f) || typeof f.id !== 'string') return;
        if (STORED[f.kind]) {
            fields[f.id] = { key: String(f.key || ''), kind: f.kind, label: String(f.label || f.key || '') };
            if (vals[f.id] !== undefined) {
                var v = clone(vals[f.id]);
                if (f.kind === 'effects' && Array.isArray(v)) v.forEach(function(r) { if (isObj(r)) delete r.t; });   // a countdown runs on the GM's clock: never in a file
                values[f.id] = v;   // a pool left full stays absent (read back, {cur: null} would be an empty pool)
            }
        }
        var e = all ? all[f.id] : null;
        if (COMPUTED[f.kind] && e && typeof f.key === 'string' && f.key) computed[f.key] = computedOf(f, e);
    });
    var out = { format: FORMAT, v: VERSION, exported: typeof opts.exported === 'string' ? opts.exported : '' };
    if (opts.gm === true) out.gm = true;
    out.system = { name: String((sys && sys.name) || ''), sig: systemSig(sys), fields: fields };
    out.name = String((view && view.name) || 'Character');
    if (view && typeof view.face === 'string' && view.face) out.face = view.face;
    if (typeof opts.picture === 'string' && opts.picture.length <= PICTURE_MAX && PIC_RE.test(opts.picture)) out.picture = opts.picture;
    out.values = values;
    out.computed = computed;
    return out;
}

/* ---------- the readable page ---------- */
// A list's stat as the sheet shows it (sheets.js statFmt / statText: systemcheck holds the two alike): whole, two decimals from 1 up, three
// significant digits below; a value name for a whole value inside the stat's names
function statFmt(v) { if (typeof v !== 'number' || !isFinite(v)) return ''; if (Math.floor(v) === v) return String(v); return Math.abs(v) >= 1 ? String(Number(v.toFixed(2))) : String(Number(v.toPrecision(3))); }
function statText(st, v) { if (typeof v === 'string') return v || '—'; var L = st && Array.isArray(st.labels) ? st.labels : null; return L && typeof v === 'number' && Math.floor(v) === v && v >= 0 && v < L.length && L[v] ? L[v] : statFmt(v); }
// An effect's change as short text ("ST +2", "HP max +5", "Prone on"; sheets.js fxChangeText)
function fxChangeText(m, labels) { var nm = labels[m.f] || '?'; if (m.op === 'on') return nm + ' on'; return nm + (m.part === 'max' ? ' max ' : ' ') + (m.v >= 0 ? '+' : '−') + fmtNum(Math.abs(m.v)); }
function valueText(f, e) {
    if (!e) return '—';
    if (e.error) return gmOnlyError(String(e.error)) ? 'GM only' : '—';
    var unit = f.unit && !e.label ? ' ' + f.unit : '';
    if (f.kind === 'toggle') return e.value ? 'on' : 'off';
    if (f.kind === 'text' || f.kind === 'select') return e.value == null || e.value === '' ? '—' : String(e.value);
    if (f.kind === 'resource') return (e.text != null && e.text !== '' ? String(e.text) : '—') + unit;
    var t = e.text != null && e.text !== '' ? String(e.text) : typeof e.value === 'number' ? fmtNum(e.value) : '—';
    if ((f.kind === 'number' || f.kind === 'skill') && typeof e.base === 'number' && typeof e.value === 'number' && e.base !== e.value) return t + unit + ' (base ' + fmtNum(e.base) + ')';
    return t + unit;
}
// Text for the page: never a control character (a CR in a name would end a line, or the front matter, where the text did not)
function plain(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' '); }
function li(label, value) { return '<li><b>' + esc(plain(label)) + ':</b> ' + esc(plain(value)) + '</li>'; }
function textBlock(html) { return { type: 'text', content: html }; }
function lines(s) { return String(s).split(/\r\n|\r|\n/).map(function(x) { return esc(plain(x)); }).join('<br>'); }
// A cell: one line, the dialect's marks escaped (a name like *x* or <b> stays text), then docmd's table writer escapes the pipes
function cell(s) { return mdEscapeText(plain(s).replace(/\s+/g, ' ').trim()); }
// A list's table column as the sheet shows it (sheets.js itemCellText: systemcheck holds the two alike)
function itemCellText(col, def) {
    if (col === 'category') return def.category || '';
    if (col === 'cost') return def.cost || '';
    if (col === 'damage') return def.damage || '';
    if (col === 'area') return def.area ? (def.area.ft + ' ft' + (def.area.shape && def.area.shape !== 'circle' ? ' ' + def.area.shape : '')) : '';
    return '';
}

// opts: { F (formula.js, for show-ifs), gm (the GM's own copy), sub (the line under the name), pageTitle(id) (a readable page's title or
// null), tctx ({ facing, stance }: the token the numbers read) }
function sheetToMarkdown(sys, view, all, opts) {
    opts = opts || {}; all = all || {};
    var sh = sys && isObj(sys.sheet) ? sys.sheet : {}, lay = Array.isArray(sh.sections) && sh.sections.length ? sh : autoLayout(sys);
    var byId = Object.create(null), labels = Object.create(null);
    ((sys && Array.isArray(sys.fields)) ? sys.fields : []).forEach(function(f) { if (isObj(f) && typeof f.id === 'string') { byId[f.id] = f; labels[f.id] = f.label || f.key || '?'; } });
    var vals = view && isObj(view.values) ? view.values : {}, vars = typeof all.vars === 'function' ? all.vars : null;
    var shown = function(x) { return !(isObj(x) && typeof x.showIf === 'string' && x.showIf) || showsIf(x.showIf, vars, opts.F || null); };
    var name = plain((view && view.name) || 'Character').trim() || 'Character', B = [{ type: 'h1', title: name, sub: typeof opts.sub === 'string' ? plain(opts.sub).trim() : '' }];
    if (opts.gm === true) B.push(textBlock('<p><i>The GM’s copy: it holds GM-only fields.</i></p>'));
    var hd = [];
    (Array.isArray(sh.identity) ? sh.identity : []).concat(Array.isArray(sh.ledger) ? sh.ledger : []).forEach(function(q) {
        var f = isObj(q) ? byId[q.id] : null; if (!f) return;
        var h = headerEntry(f, all[f.id]); if (!h) return;
        hd.push(li(f.label || f.key, h.chip ? 'on' : h.error ? (gmOnlyError(String(h.error)) ? 'GM only' : '—') : h.text));
    });
    if (hd.length) B.push(textBlock('<ul>' + hd.join('') + '</ul>'));
    var secs = (Array.isArray(lay.sections) ? lay.sections : []).filter(isObj), idx = Object.create(null);
    secs.forEach(function(s) { if (typeof s.id === 'string') idx[s.id] = s; });
    var parentOf = function(s) { var p = typeof s.parent === 'string' ? idx[s.parent] : null; return p && p !== s && !p.parent ? p : null; };   // one level, by the sheet's own rule (sheets.js childParent: a parent that has a parent of its own, even a gone one, holds none)
    var tops = secs.filter(function(s) { return !parentOf(s); });
    function listBlock(f, pl) {
        var spec = isObj(f.list) ? f.list : {}, e = all[f.id], cells = e && isObj(e.cells) ? e.cells : {}, cts = e && isObj(e.cts) ? e.cts : {}, tbl = isObj(f.table) ? f.table : null;
        var onOnly = !!(pl && pl.on === true && isObj(spec.on));   // as the sheet: 'only switched on' means nothing once the list has no switch
        var rows = (Array.isArray(vals[f.id]) ? vals[f.id] : []).filter(function(r) { return isObj(r) && (!onOnly || rowOn(spec, r)); });
        var label = plain(f.label || f.key || 'Items');
        if (!rows.length) { B.push(textBlock('<p><b>' + esc(label) + ':</b> none</p>')); return; }
        var defs = rows.map(function(r) { var d = rowDef(sys, r); return d ? d.def : null; }), cats = {};
        defs.forEach(function(d) { if (d && d.category) cats[d.category] = 1; });
        var colsA = [{ t: 'Item', g: function(r, d) { return ((d && d.name) || '?') + (d && isObj(d.area) && d.area.ft ? ' ' + d.area.ft + ' ft' : '') + (r.hid === 1 ? ' (hidden from the player)' : ''); } }];
        if (tbl) (Array.isArray(tbl.columns) ? tbl.columns : []).forEach(function(k) { if (typeof k !== 'string' || !ITEM_COL_LABEL[k] || (k === 'category' && tbl.chips)) return; colsA.push({ t: ITEM_COL_LABEL[k], g: function(r, d) { return itemCellText(k, d || {}); } }); });   // the table's own columns, as the sheet draws them
        else if (Object.keys(cats).length > 1) colsA.push({ t: 'Category', g: function(r, d) { return (d && d.category) || ''; } });
        (Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (isObj(s) && s.show === true) colsA.push({ t: s.label || s.key, g: function(r, d) { return statText(s, rowStat(spec, d, s.key)); } }); });
        (Array.isArray(spec.cols) ? spec.cols : []).forEach(function(c) {
            if (!isObj(c) || c.hide === true) return;
            colsA.push({ t: c.label || c.key, g: function(r) { var cs = cells[rowIdOf(r)], v = Array.isArray(cs) ? cs.find(function(x) { return x && x.key === c.key; }) : null; if (!v) return ''; if (v.error) return gmOnlyError(String(v.error)) ? 'GM only' : '—'; return String(v.text == null ? '' : v.text) + (c.unit && v.text ? ' ' + c.unit : ''); } });
        });
        if (isObj(spec.lvl)) colsA.push({ t: spec.lvl.label || 'Level', g: function(r, d) { var v = rowLvl(spec, r, d); return typeof v === 'number' ? statText(spec.lvl, v) : ''; } });
        if (isObj(spec.on)) colsA.push({ t: spec.on.label || 'On', g: function(r) { return rowOn(spec, r) ? 'yes' : 'no'; } });
        (Array.isArray(spec.counters) ? spec.counters : []).forEach(function(t) {   // a row's counters ("Charges 12/20"), as worked out for the sheet
            if (!isObj(t) || typeof t.key !== 'string') return;
            colsA.push({ t: t.label || t.key, g: function(r) { if (r.hid === 1) return ''; var cs = cts[rowIdOf(r)], x = Array.isArray(cs) ? cs.find(function(q) { return q && q.key === t.key; }) : null; return x && typeof x.value === 'number' ? fmtNum(x.value) + (typeof x.max === 'number' ? '/' + fmtNum(x.max) : '') : ''; } });
        });
        var tail = [];
        if (spec.noQty !== true) tail.push({ t: 'Qty', g: function(r) { return String(r.qty || 1); } });
        if (typeof spec.price === 'string' && spec.price) tail.push({ t: 'Paid', g: function(r, d) { return statFmt(rowPaid(spec, r, d)); } });
        var cols = colsA.slice(0, Math.max(1, MD_COLS - tail.length)).concat(tail);   // the dialect's tables hold 8 columns: the name and the quantity first
        B.push({ type: 'table', title: label, cols: cols.map(function(c) { return cell(c.t); }), rows: rows.map(function(r, i) { return cols.map(function(c) { return cell(c.g(r, defs[i])); }); }) });
        var notes = rows.map(function(r, i) { return typeof r.note === 'string' && r.note ? li((defs[i] && defs[i].name) || '?', r.note) : ''; }).filter(Boolean);
        if (notes.length) B.push(textBlock('<ul>' + notes.join('') + '</ul>'));
    }
    function fxBlock(f) {
        var lib = Object.create(null); ((sys && Array.isArray(sys.effects)) ? sys.effects : []).forEach(function(d) { if (isObj(d) && typeof d.id === 'string') lib[d.id] = d; });
        var items = (Array.isArray(vals[f.id]) ? vals[f.id] : []).map(function(r) {
            if (!isObj(r)) return '';
            var d = typeof r.ref === 'string' ? lib[r.ref] : r; if (!isObj(d)) return '';
            var ch = (Array.isArray(d.mods) ? d.mods : []).filter(isObj).map(function(m) { return fxChangeText(m, labels); }).join(' · ');
            return '<li>' + esc(plain(String(d.name || 'Effect') + (ch ? ' — ' + ch : '') + (r.on === false ? ' (suspended)' : ''))) + '</li>';
        }).filter(Boolean);
        var label = plain(f.label || f.key || 'Effects');
        B.push(textBlock(items.length ? '<p><b>' + esc(label) + '</b></p><ul>' + items.join('') + '</ul>' : '<p><b>' + esc(label) + ':</b> none</p>'));
    }
    function sectionBlocks(sec, child) {
        if (!shown(sec)) return;
        var start = B.length, mv = typeof sec.meta === 'string' ? all[sec.meta] : null, meta = '';
        if (isObj(mv) && !mv.error) meta = mv.text != null && mv.text !== '' ? String(mv.text) : typeof mv.value === 'number' ? mv.value + (typeof mv.max === 'number' ? ' / ' + mv.max : '') : '';
        var title = plain(String(sec.title || '').trim() + (sec.title && meta ? ' — ' + meta : meta)).trim();
        if (title) B.push(child ? textBlock('<p><b>' + esc(title) + '</b></p>') : { type: 'h3', title: title });   // an untitled section has no heading, as on the sheet
        var items = [];
        var flush = function() { if (items.length) { B.push(textBlock('<ul>' + items.join('') + '</ul>')); items = []; } };
        (Array.isArray(sec.fields) ? sec.fields : []).forEach(function(pl) {
            if (!isObj(pl) || !shown(pl)) return;
            if (typeof pl.id === 'string') {
                var f = byId[pl.id]; if (!f) return;
                if (f.kind === 'item-list') { flush(); listBlock(f, pl); return; }
                if (f.kind === 'effects') { flush(); fxBlock(f); return; }
                if (f.kind === 'notes') { flush(); var nt = all[f.id] && typeof all[f.id].value === 'string' ? all[f.id].value : typeof vals[f.id] === 'string' ? vals[f.id] : ''; B.push(textBlock('<p><b>' + esc(plain(f.label || f.key)) + (nt ? '</b><br>' + lines(nt) : ':</b> —') + '</p>')); return; }
                items.push(li(f.label || f.key, valueText(f, all[f.id])));
                return;
            }
            if (pl.kind === 'heading' && pl.text) { flush(); B.push(textBlock('<p><b>' + esc(plain(pl.text)) + '</b></p>')); }
            else if (pl.kind === 'text' && pl.text) { flush(); B.push(textBlock('<p>' + lines(pl.text) + '</p>')); }
            else if (pl.kind === 'link' && typeof opts.pageTitle === 'function') { var pt = pl.page ? opts.pageTitle(pl.page) : null; if (typeof pt === 'string') items.push('<li>' + esc(pl.text || pt) + '</li>'); }
            else if (pl.kind === 'facing' && opts.tctx && isObj(opts.tctx.facing) && typeof opts.tctx.facing.deg === 'number') { var fc = opts.tctx.facing, nth = Array.isArray(fc.threats) ? fc.threats.length : 0; items.push(li('Facing', Math.round(fc.deg) + '°' + (nth ? ' · ' + nth + (nth === 1 ? ' threat marked' : ' threats marked') : ''))); }
            else if (pl.kind === 'stance' && opts.tctx && isObj(opts.tctx.stance)) { var st = opts.tctx.stance, pn = POSTURE_NAMES[st.posture] || POSTURE_NAMES[0]; items.push(li('Posture', pn)); if (typeof st.elevation === 'number' && st.elevation) items.push(li('Elevation', fmtNum(st.elevation) + ' yd')); }
        });
        flush();
        secs.forEach(function(ch) { if (parentOf(ch) === sec) sectionBlocks(ch, true); });
        if (B.length === start + (title ? 1 : 0) && title) B.pop();   // nothing under it: left out, as the sheet leaves out an empty section
    }
    tops.forEach(function(s) { if (s.pinned === true) sectionBlocks(s, false); });   // the dashboard, above the band as on the sheet
    var band = (Array.isArray(sh.band) ? sh.band : []).map(function(q) { var f = isObj(q) && typeof q.id === 'string' ? byId[q.id] : null; return f ? plain((f.label || f.key) + ' ' + valueText(f, all[f.id])) : ''; }).filter(Boolean);
    if (band.length) B.push(textBlock('<p><b>At a glance:</b> ' + esc(band.join(' · ')) + '</p>'));
    var rest = tops.filter(function(s) { return s.pinned !== true; }), tabs = (Array.isArray(lay.tabs) ? lay.tabs : []).filter(function(t) { return isObj(t) && typeof t.id === 'string'; });
    if (tabs.length) {
        var tabOf = function(s) { return tabs.some(function(t) { return t.id === s.tab; }) ? s.tab : tabs[0].id; };   // no tab, or one gone: the first, as on the sheet
        tabs.forEach(function(t) {
            var mark = B.length; B.push({ type: 'h2', title: plain(t.label || 'Tab').trim() || 'Tab' });
            rest.forEach(function(s) { if (tabOf(s) === t.id) sectionBlocks(s, false); });
            if (B.length === mark + 1) B.pop();
        });
    } else rest.forEach(function(s) { sectionBlocks(s, false); });
    var meta = { title: name }; if (opts.gm === true) meta.players = false;   // brought in as a handbook page, the GM's copy stays the GM's
    return docToMarkdown({ type: 'doc', meta: meta, blocks: B }).text;
}

var API = { FORMAT: FORMAT, VERSION: VERSION, fileBase: fileBase, isCharFile: isCharFile, gmOnlyError: gmOnlyError, systemSig: systemSig, charToJson: charToJson, sheetToMarkdown: sheetToMarkdown, statFmt: statFmt, statText: statText, fxChangeText: fxChangeText, itemCellText: itemCellText, valueText: valueText };
if (typeof window !== 'undefined') window.wpSheetExport = API;
export { FORMAT, VERSION, fileBase, isCharFile, gmOnlyError, systemSig, charToJson, sheetToMarkdown, statFmt, statText, fxChangeText, itemCellText, valueText };
