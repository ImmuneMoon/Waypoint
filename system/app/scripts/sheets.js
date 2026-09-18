/* Character sheets (1.5.0) — the UI half, slice SB1: the System editor (#systemModal — fields, rolls, Start from a
   preset, export / import as JSON) for the campaign on screen, the feature switch `sheets` (wpSheetsSync), and the
   glue net.js calls (playerSystem for the wire). Characters, the sheet panel and the layout editor arrive in the
   next slices (docs/SHEET_BUILDER_PLAN.md §9). The pure half is systemcore.js; the engine is formula.js. */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { showConfirm } from './dialogs.js';
import { LIMITS, KINDS, STORED, DEF_PROP, emptySystem, uid, validKey, cleanSystem, validateSystem, resolveAll, fmtNum } from './systemcore.js';

var ui = function(id) { return document.getElementById(id); };
var NL = String.fromCharCode(10);
function F() { return window.wpFormula || null; }
function net() { return window.wpNet || null; }
function featureOn() { return window.wpVtt ? !!window.wpVtt.on('sheets') : true; }
function canWrite() { return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !window.wpStream; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function opt(value, text, selected) { var o = el('option', null, text); o.value = value; if (selected) o.selected = true; return o; }
function pref(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }

/* ---------- the wire's view of the campaign's system (net.js calls this) ---------- */
function playerSystem(camp) {
    camp = camp || getActiveCampaign();
    if (!camp || !camp.system || !F()) return null;
    return cleanSystem(camp.system, { F: F(), gmView: false });
}
function systemOf(camp) { camp = camp || getActiveCampaign(); return camp && camp.system && typeof camp.system === 'object' ? camp.system : null; }

/* ---------- the editor: a draft of the campaign's system, saved as a whole ---------- */
var draft = null, dirty = false, tab = 'fields', errorsById = {}, warningsById = {};
var KIND_LABEL = { number: 'Number', formula: 'Formula', resource: 'Resource', skill: 'Skill', toggle: 'Toggle', text: 'Text', notes: 'Notes', select: 'Select' };
var KIND_HELP = { number: 'A stored number (an attribute): default, min, max, step.', formula: 'Computed from other fields; never stored, never edited.', resource: 'A current value with a formula for its max (HP): a bar with - and + on the sheet.', skill: 'Stored ranks plus a base formula; its value is ranks + base.', toggle: 'On or off (a condition); true or false in formulas.', text: 'A short text (up to 200 characters); not a number for formulas.', notes: 'A long text; never read by formulas.', select: 'One of a fixed list of options.' };
function open() {
    if (!canWrite()) { toast('Not while you are at someone else\'s table.'); return; }
    var camp = getActiveCampaign(); if (!camp) return;
    draft = clone(systemOf(camp) || emptySystem());
    if (!Array.isArray(draft.fields)) draft.fields = []; if (!Array.isArray(draft.rolls)) draft.rolls = []; if (!draft.sheet || !Array.isArray(draft.sheet.sections)) draft.sheet = { sections: [] };
    dirty = false; tab = 'fields';
    var m = ui('systemModal'); if (!m) return;
    ui('sysCampName').textContent = camp.name || 'Campaign';
    ui('sysName').value = draft.name || '';
    m.style.display = 'flex';
    renderAll();
}
function close(force) {
    var m = ui('systemModal'); if (!m || m.style.display === 'none') return;
    if (dirty && !force) { showConfirm('Close the System editor without saving? Your changes since the last Save are lost.', function(yes) { if (yes) { dirty = false; close(true); } }); return; }
    m.style.display = 'none'; draft = null;
}
function markDirty() { dirty = true; var s = ui('sysSaveBtn'); if (s) s.classList.add('on'); }
function saveDraft() {
    if (!draft || !canWrite()) return;
    var camp = getActiveCampaign(); if (!camp) return;
    draft.name = (ui('sysName').value || '').trim().slice(0, LIMITS.name);
    var clean = cleanSystem(draft, { F: F(), gmView: true });
    if (!clean) { toast('The system could not be saved.'); return; }
    var dropped = draft.fields.length - clean.fields.length;
    clean.updated = Date.now();
    camp.system = clean;
    draft = clone(clean); dirty = false; var s = ui('sysSaveBtn'); if (s) s.classList.remove('on');
    save(true);
    var n = net(); if (n && n.syncSystem) n.syncSystem();
    var v = validateSystem(clean, F());
    toast('System saved: ' + clean.fields.length + ' field' + (clean.fields.length === 1 ? '' : 's') + ', ' + clean.rolls.length + ' roll' + (clean.rolls.length === 1 ? '' : 's') + (dropped ? '; ' + dropped + ' with a bad key or kind dropped' : '') + (v.ok ? '.' : '; ' + v.errors.length + ' error' + (v.errors.length === 1 ? '' : 's') + ' to fix.'));
    renderAll();
}
/* ---------- validation of the draft (the caret cells) ---------- */
function refreshErrors() {
    errorsById = {}; warningsById = {};
    if (!draft || !F()) return;
    var seenKey = Object.create(null);
    draft.fields.forEach(function(f) {
        var errs = [];
        if (!validKey(f.key || '', F())) errs.push({ prop: 'key', message: !f.key ? 'A key is needed.' : 'Not a usable key: letters, digits, _ and dots; no spaces; not a function, reserved word or dice.' });
        else { var l = String(f.key).toLowerCase(); if (seenKey[l]) errs.push({ prop: 'key', message: 'Another field has this key.' }); seenKey[l] = 1; }
        if (!KINDS[f.kind]) errs.push({ prop: 'kind', message: 'Pick a kind.' });
        if (errs.length) errorsById[f.id] = errs;
    });
    var clean = cleanSystem(draft, { F: F(), gmView: true });
    if (!clean) return;
    var v = validateSystem(clean, F());
    v.errors.forEach(function(e) { (errorsById[e.id] = errorsById[e.id] || []).push(e); });
    v.warnings.forEach(function(w) { (warningsById[w.id] = warningsById[w.id] || []).push(w); });
}
function errorCell(id) {
    var cell = el('div', 'sys-err');
    (errorsById[id] || []).forEach(function(e) {
        var line = el('div', 'sys-err-line', (e.prop && e.prop !== 'formula' && e.prop !== 'rollFormula' ? e.prop + ': ' : '') + e.message);
        cell.appendChild(line);
        if (e.pos !== undefined && e.len > 0) { var src = formulaTextFor(id, e.prop); if (src) { var pre = el('pre', 'dice-caret'); pre.textContent = src + NL + new Array(Math.min(e.pos, src.length) + 1).join(' ') + new Array(Math.min(e.len, 200) + 1).join('^'); cell.appendChild(pre); } }
    });
    (warningsById[id] || []).forEach(function(w) { cell.appendChild(el('div', 'sys-warn-line', w.message)); });
    if (!cell.childNodes.length) cell.style.display = 'none';
    return cell;
}
function formulaTextFor(id, prop) {
    var f = draft.fields.find(function(x) { return x.id === id; });
    if (f) return prop === 'roll' ? f.roll || '' : f[DEF_PROP[f.kind]] || '';
    var r = draft.rolls.find(function(x) { return x.id === id; });
    return r ? r.formula || '' : '';
}
function patchErrors() {
    refreshErrors();
    document.querySelectorAll('#systemModal [data-err-for]').forEach(function(old) { var id = old.dataset.errFor; var fresh = errorCell(id); fresh.dataset.errFor = id; old.parentNode.replaceChild(fresh, old); });
    var total = Object.keys(errorsById).reduce(function(n, k) { return n + errorsById[k].length; }, 0), warns = Object.keys(warningsById).reduce(function(n, k) { return n + warningsById[k].length; }, 0);
    var foot = ui('sysFoot'); if (foot) foot.textContent = draft.fields.length + ' field' + (draft.fields.length === 1 ? '' : 's') + ' · ' + draft.rolls.length + ' roll' + (draft.rolls.length === 1 ? '' : 's') + (total ? ' · ' + total + ' error' + (total === 1 ? '' : 's') : ' · no errors') + (warns ? ' · ' + warns + ' warning' + (warns === 1 ? '' : 's') : '') + (dirty ? ' · unsaved changes' : '');
}

/* ---------- rows ---------- */
function input(cls, value, title, placeholder) { var i = el('input', cls); i.type = 'text'; i.value = value === undefined || value === null ? '' : String(value); if (title) i.title = title; if (placeholder) i.placeholder = placeholder; i.spellcheck = false; i.autocomplete = 'off'; return i; }
function numInput(cls, value, title) { var i = el('input', cls); i.type = 'number'; i.value = value === undefined || value === null ? '' : String(value); i.title = title || ''; return i; }
function select(cls, options, value, title) { var s = el('select', cls); options.forEach(function(o) { s.appendChild(opt(o[0], o[1], o[0] === value)); }); if (title) s.title = title; return s; }
function fieldRow(f) {
    var row = el('div', 'sys-row'); row.dataset.id = f.id;
    var top = el('div', 'sys-row-main');
    var key = input('sys-key field', f.key, 'The name formulas use: STR, Skill.Stealth. Letters, digits, _ and dots.', 'Key'); top.appendChild(key);
    var label = input('sys-label field', f.label, 'Shown on the sheet', 'Label'); top.appendChild(label);
    var kind = select('sys-kind', Object.keys(KIND_LABEL).map(function(k) { return [k, KIND_LABEL[k]]; }), f.kind, KIND_HELP[f.kind] || ''); top.appendChild(kind);
    var def = el('div', 'sys-def'); top.appendChild(def);
    buildDefCell(def, f);
    var flags = el('div', 'sys-flags');
    if (STORED[f.kind]) flags.appendChild(select('sys-edit', [['owner', 'Player may edit'], ['gm', 'GM edits']], f.edit || 'owner', 'Who may change the value at the table'));
    flags.appendChild(select('sys-vis', [['all', 'Visible to players'], ['gm', 'GM only']], f.vis || 'all', 'GM only: the field and its value never leave your machine'));
    var hov = el('label', 'sys-hover'); var hc = el('input'); hc.type = 'checkbox'; hc.checked = !!f.hover; hc.className = 'sys-hover-chk'; hov.appendChild(hc); hov.appendChild(document.createTextNode(' Hover')); hov.title = 'Show on the token\'s hover card and the party strip'; flags.appendChild(hov);
    if (f.kind !== 'notes' && f.kind !== 'text' && f.kind !== 'select') { var roll = input('sys-roll field', f.roll, 'A roll button for this field (dice allowed): d20 + ' + (f.key || 'Key'), 'Roll (optional)'); flags.appendChild(roll); }
    var btns = el('span', 'sys-btns');
    [['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['dup', 'Duplicate', '&#10697;'], ['del', 'Delete this field', '&times;']].forEach(function(b) { var x = el('button', 'tool ghost sys-btn'); x.dataset.act = b[0]; x.title = b[1]; x.innerHTML = b[2]; btns.appendChild(x); });
    flags.appendChild(btns);
    row.appendChild(top); row.appendChild(flags);
    var err = errorCell(f.id); err.dataset.errFor = f.id; row.appendChild(err);
    return row;
}
function buildDefCell(def, f) {
    def.textContent = '';
    var k = f.kind;
    if (k === 'number' || k === 'skill') {
        if (k === 'skill') def.appendChild(input('sys-formula field', f.base, 'The base added to the ranks (a formula, no dice): DEXmod. Empty = ranks alone.', 'Base formula'));
        def.appendChild(numInput('sys-def-num', f.def, k === 'skill' ? 'Default ranks' : 'Default value'));
        def.appendChild(numInput('sys-min', f.min, 'Minimum (empty = none)'));
        def.appendChild(numInput('sys-max', f.max, 'Maximum (empty = none)'));
        def.appendChild(numInput('sys-step', f.step === undefined ? 1 : f.step, 'Step'));
    } else if (k === 'formula') def.appendChild(input('sys-formula field', f.formula, 'Computed from other fields; no dice here: floor((STR - 10) / 2)', 'Formula'));
    else if (k === 'resource') {
        def.appendChild(input('sys-formula field', f.maxFormula, 'The maximum, as a formula (no dice): 10 + CONmod * 2', 'Max formula'));
        var d = input('sys-def-res field', f.def === 'max' || f.def === undefined ? 'max' : f.def, 'Starting value: a number, or "max" for full', 'Default'); def.appendChild(d);
        def.appendChild(numInput('sys-min', f.min === undefined ? 0 : f.min, 'Minimum'));
    } else if (k === 'toggle') { var t = el('label', 'sys-toggle-def'); var c = el('input'); c.type = 'checkbox'; c.className = 'sys-def-bool'; c.checked = f.def === true; t.appendChild(c); t.appendChild(document.createTextNode(' On by default')); def.appendChild(t); }
    else if (k === 'text') { def.appendChild(input('sys-def-text field', f.def, 'Default text', 'Default')); def.appendChild(numInput('sys-max', f.max === undefined ? 200 : f.max, 'Most characters (up to 200)')); }
    else if (k === 'notes') def.appendChild(el('span', 'sys-note', 'A long text on the sheet; not read by formulas.'));
    else if (k === 'select') { def.appendChild(input('sys-options field', (f.options || []).join(', '), 'The options, separated by commas', 'Options, separated by commas')); def.appendChild(input('sys-def-text field', f.def, 'Default option', 'Default')); }
}
function rollRow(r) {
    var row = el('div', 'sys-row'); row.dataset.id = r.id;
    var top = el('div', 'sys-row-main');
    top.appendChild(input('sys-label field', r.label, 'The button\'s label', 'Label'));
    top.appendChild(input('sys-formula field', r.formula, 'The roll: d20 + STRmod, 3d6 <= Skill.Stealth', 'Roll formula'));
    top.appendChild(select('sys-vis', [['all', 'Visible to players'], ['gm', 'GM only']], r.vis || 'all', 'GM only: players never see this roll'));
    var il = el('label', 'sys-hover'); var ic = el('input'); ic.type = 'checkbox'; ic.className = 'sys-init-chk'; ic.checked = !!r.init; il.appendChild(ic); il.appendChild(document.createTextNode(' Initiative')); il.title = 'The combat roster rolls this for initiative'; top.appendChild(il);
    var btns = el('span', 'sys-btns');
    [['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['del', 'Delete this roll', '&times;']].forEach(function(b) { var x = el('button', 'tool ghost sys-btn'); x.dataset.act = b[0]; x.title = b[1]; x.innerHTML = b[2]; btns.appendChild(x); });
    top.appendChild(btns);
    row.appendChild(top);
    var err = errorCell(r.id); err.dataset.errFor = r.id; row.appendChild(err);
    return row;
}
function renderAll() {
    if (!draft) return;
    refreshErrors();
    document.querySelectorAll('#systemModal .sys-tabs button').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
    ui('sysFields').style.display = tab === 'fields' ? '' : 'none';
    ui('sysRolls').style.display = tab === 'rolls' ? '' : 'none';
    var fr = ui('sysFieldRows'); fr.textContent = '';
    if (!draft.fields.length) fr.appendChild(el('div', 'sys-empty', 'No fields yet. Add one, or Start from a preset.'));
    draft.fields.forEach(function(f) { fr.appendChild(fieldRow(f)); });
    var rr = ui('sysRollRows'); rr.textContent = '';
    if (!draft.rolls.length) rr.appendChild(el('div', 'sys-empty', 'No rolls yet. A roll is a formula with dice, as a button on the sheet: d20 + STRmod.'));
    draft.rolls.forEach(function(r) { rr.appendChild(rollRow(r)); });
    var note = ui('sysFeatureNote'); if (note) note.style.display = featureOn() ? 'none' : '';
    patchErrors();
}
/* ---------- input handling: the model changes, the rows stay; only error cells are patched ---------- */
function fieldOfRow(target) { var row = target.closest('.sys-row'); if (!row) return null; return { row: row, f: draft.fields.find(function(x) { return x.id === row.dataset.id; }), r: draft.rolls.find(function(x) { return x.id === row.dataset.id; }) }; }
function onInput(e) {
    if (!draft) return;
    var t = e.target, ctx = fieldOfRow(t); if (!ctx) return;
    var f = ctx.f, r = ctx.r, c = t.className || '';
    if (f) {
        if (c.indexOf('sys-key') >= 0) f.key = t.value.trim();
        else if (c.indexOf('sys-label') >= 0) f.label = t.value.slice(0, LIMITS.label);
        else if (c.indexOf('sys-formula') >= 0) { var p = DEF_PROP[f.kind]; if (p) f[p] = t.value; }
        else if (c.indexOf('sys-roll') >= 0) f.roll = t.value.trim() || undefined;
        else if (c.indexOf('sys-def-num') >= 0) f.def = t.value === '' ? 0 : Number(t.value);
        else if (c.indexOf('sys-def-res') >= 0) f.def = t.value.trim().toLowerCase() === 'max' ? 'max' : Number(t.value) || 0;
        else if (c.indexOf('sys-def-text') >= 0) f.def = t.value;
        else if (c.indexOf('sys-min') >= 0) { if (t.value === '') delete f.min; else f.min = Number(t.value); }
        else if (c.indexOf('sys-max') >= 0) { if (t.value === '') delete f.max; else f.max = Number(t.value); }
        else if (c.indexOf('sys-step') >= 0) f.step = Number(t.value) || 1;
        else if (c.indexOf('sys-options') >= 0) f.options = t.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    } else if (r) {
        if (c.indexOf('sys-label') >= 0) r.label = t.value.slice(0, LIMITS.label);
        else if (c.indexOf('sys-formula') >= 0) r.formula = t.value;
    } else return;
    markDirty(); patchErrors();
}
function onChange(e) {
    if (!draft) return;
    var t = e.target, ctx = fieldOfRow(t); if (!ctx) return;
    var f = ctx.f, r = ctx.r, c = t.className || '';
    if (f) {
        if (c.indexOf('sys-kind') >= 0) { f.kind = t.value; delete f.formula; delete f.maxFormula; delete f.base; delete f.options; f.def = f.kind === 'toggle' ? false : f.kind === 'text' || f.kind === 'select' ? '' : f.kind === 'resource' ? 'max' : 0; if (f.kind === 'resource' && f.min === undefined) f.min = 0; markDirty(); renderAll(); return; }
        if (c.indexOf('sys-edit') >= 0) f.edit = t.value;
        else if (c.indexOf('sys-vis') >= 0) f.vis = t.value;
        else if (c.indexOf('sys-hover-chk') >= 0) f.hover = t.checked;
        else if (c.indexOf('sys-def-bool') >= 0) f.def = t.checked;
        else return;
    } else if (r) {
        if (c.indexOf('sys-vis') >= 0) r.vis = t.value;
        else if (c.indexOf('sys-init-chk') >= 0) { r.init = t.checked; if (t.checked) draft.rolls.forEach(function(o) { if (o !== r) delete o.init; }); markDirty(); renderAll(); return; }
        else return;
    } else return;
    markDirty(); patchErrors();
}
function onClick(e) {
    if (!draft) return;
    var b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.id === 'sysAddField') { draft.fields.push({ id: uid('f_'), key: '', label: '', kind: 'number', def: 0, step: 1, edit: 'owner', vis: 'all', hover: false }); markDirty(); renderAll(); var last = ui('sysFieldRows').lastElementChild; if (last) { var k = last.querySelector('.sys-key'); if (k) k.focus(); last.scrollIntoView({ block: 'nearest' }); } return; }
    if (b.id === 'sysAddRoll') { draft.rolls.push({ id: uid('r_'), label: '', formula: '', vis: 'all' }); markDirty(); renderAll(); var lr = ui('sysRollRows').lastElementChild; if (lr) { var l = lr.querySelector('.sys-label'); if (l) l.focus(); } return; }
    if (b.dataset.tab) { tab = b.dataset.tab; renderAll(); return; }
    if (!b.dataset.act) return;
    var ctx = fieldOfRow(b); if (!ctx) return;
    var list = ctx.f ? draft.fields : draft.rolls, item = ctx.f || ctx.r; if (!item) return;
    var i = list.indexOf(item), act = b.dataset.act;
    if (act === 'up' && i > 0) { list.splice(i, 1); list.splice(i - 1, 0, item); }
    else if (act === 'down' && i < list.length - 1) { list.splice(i, 1); list.splice(i + 1, 0, item); }
    else if (act === 'dup') { var d = clone(item); d.id = uid(ctx.f ? 'f_' : 'r_'); if (d.key) d.key = d.key + '2'; list.splice(i + 1, 0, d); }
    else if (act === 'del') { list.splice(i, 1); }
    else return;
    markDirty(); renderAll();
}
/* ---------- test row, presets, export / import ---------- */
function runTest() {
    if (!draft || !F()) return;
    var clean = cleanSystem(draft, { F: F(), gmView: true }); if (!clean) return;
    var all = resolveAll(clean, null, F()), out = ui('sysTestOut'); out.textContent = '';
    clean.fields.forEach(function(f) { var e = all[f.id]; var line = el('div', 'sys-test-line' + (e.error ? ' sys-err-line' : '')); line.textContent = f.key + ' = ' + (e.error ? 'error: ' + e.error : e.text); out.appendChild(line); });
    if (!clean.fields.length) out.appendChild(el('div', 'sys-note', 'Nothing to compute yet.'));
}
function startFrom(id) {
    if (!draft) return;
    var apply = function(sys) { draft = clone(sys); draft.updated = 0; ui('sysName').value = draft.name || ''; markDirty(); renderAll(); toast(id === 'blank' ? 'Starting from a blank system.' : 'Starting from ' + draft.name + '. Save to keep it.'); };
    var go = function() {
        if (id === 'blank') { apply(emptySystem()); return; }
        fetch('assets/systems/' + id + '.json', { cache: 'no-store' }).then(function(r) { if (!r.ok) throw new Error('missing'); return r.json(); }).then(function(j) { var c = cleanSystem(j, { F: F(), gmView: true }); if (!c) throw new Error('bad'); apply(c); }).catch(function() { toast('That preset could not be loaded.'); });
    };
    if (draft.fields.length || draft.rolls.length) showConfirm('Replace the current fields, rolls and layout with this preset? Values your characters keep under other field ids stay stored but hidden until a field with that id exists again.', function(yes) { if (yes) go(); });
    else go();
}
function exportSystem() {
    if (!draft) return;
    var clean = cleanSystem(draft, { F: F(), gmView: true }); if (!clean) return;
    clean.name = (ui('sysName').value || '').trim().slice(0, LIMITS.name) || clean.name;
    var blob = new Blob([JSON.stringify(clean, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (clean.name || 'system').replace(/[^A-Za-z0-9_ -]+/g, '').trim().replace(/ +/g, '_').slice(0, 40) + '.wpsystem.json';
    document.body.appendChild(a); a.click(); setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('System exported.');
}
function importFile(file) {
    if (!file || !draft) return;
    file.text().then(function(text) {
        var j = JSON.parse(text);
        var c = cleanSystem(j, { F: F(), gmView: true }); if (!c) throw new Error('not a system');
        var v = validateSystem(c, F());
        draft = c; draft.updated = 0; ui('sysName').value = draft.name || ''; markDirty(); renderAll();
        toast('Imported ' + (c.name || 'a system') + ': ' + c.fields.length + ' fields, ' + c.rolls.length + ' rolls' + (v.ok ? '.' : ', ' + v.errors.length + ' error' + (v.errors.length === 1 ? '' : 's') + ' to fix.'));
    }).catch(function() { toast('That file is not a Waypoint system.'); });
}
/* ---------- wiring ---------- */
(function wire() {
    var m = ui('systemModal'); if (!m) return;
    var b = ui('systemBtn'); if (b) b.addEventListener('click', function() { open(); });
    var c = ui('sysClose'); if (c) c.addEventListener('click', function() { close(false); });
    var s = ui('sysSaveBtn'); if (s) s.addEventListener('click', saveDraft);
    var nm = ui('sysName'); if (nm) nm.addEventListener('input', function() { markDirty(); patchErrors(); });
    m.addEventListener('input', onInput);
    m.addEventListener('change', onChange);
    m.addEventListener('click', onClick);
    m.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(false); } });
    var t = ui('sysTestBtn'); if (t) t.addEventListener('click', runTest);
    var st = ui('sysStartSel'); if (st) st.addEventListener('change', function() { var v = st.value; st.value = ''; if (v) startFrom(v); });
    var ex = ui('sysExportBtn'); if (ex) ex.addEventListener('click', exportSystem);
    var im = ui('sysImportBtn'), fi = ui('sysImportFile'); if (im && fi) { im.addEventListener('click', function() { fi.value = ''; fi.click(); }); fi.addEventListener('change', function() { importFile(fi.files && fi.files[0]); }); }
})();
function sync() {
    var b = ui('systemBtn'); if (b) b.style.display = canWrite() ? '' : 'none';
    var note = ui('sysFeatureNote'); if (note) note.style.display = featureOn() ? 'none' : '';
}
window.wpSheetsSync = sync;
setTimeout(sync, 0);
window.wpSheets = { open: open, close: close, playerSystem: playerSystem, systemOf: systemOf, save: saveDraft, startFrom: startFrom, sync: sync, draft: function() { return draft; }, LIMITS: LIMITS };
