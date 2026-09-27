/* librarywin.js — the GM's Library window (Stage 6, library L2a): a campaign's packs of item entries, browsed and edited on the GM's
   own machine. The packs on the left (new, rename, icon, who may see it, delete); the chosen pack's entries in the middle (a search, and a
   list drawn only where it shows, so thousands stay quick); the chosen entry's form on the right. A saved entry goes into the pack's
   working copy at once and the pack is written a second later (one revision for a burst of edits); closing the window writes what is
   pending. A pack not read (still loading, or unreadable) cannot change: writing it would replace what is on disk with nothing. Built
   with text nodes only. The rules are librarycore's (librarycheck); the store is library.js's. */
import { getActiveCampaign } from './models.js';
import { toast } from './io.js';
import { showPrompt, showConfirm } from './dialogs.js';
import { searchEntries, entryFromForm, newEntryId, keyClashes, cleanLibEntry, libCtx, LIB } from './librarycore.js';

var ROW_H = 28, FLUSH_MS = 1000, FORM_KEYS = ['name', 'key', 'category', 'icon', 'vis', 'notes', 'desc', 'ref', 'gmNotes', 'damage', 'cost', 'throwSkill', 'tags', 'lvl', 'stats', 'area'];
var VIS = [['all', 'Players can see it'], ['gm', 'GM only']];
var st = { open: false, campId: null, packId: null, entryId: null, q: '', shown: [], work: Object.create(null), dirty: Object.create(null), timer: null, draftNew: null };
var byName = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }).compare : function(a, b) { return String(a).localeCompare(String(b)); };
function ui(id) { return document.getElementById(id); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
function LB() { return window.wpLibrary; }
function camp() { var c = getActiveCampaign(); return c && c.id === st.campId ? c : null; }   // the campaign the window opened on, or none
function F() { return window.wpFormula; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function gmHere() { var n = window.wpNet; if (n && n.active && n.role === 'client') return false; if (n && (n.foreign || n.stream)) return false; return !window.wpStream && !!(window.wpCanPersistLocal ? window.wpCanPersistLocal() : true); }
function packs() { var c = camp(); return c && c.library ? c.library.packs : []; }
function packById(id) { return packs().filter(function(p) { return p.id === id; })[0] || null; }
function ready(packId) { return !!(camp() && LB() && LB().ready && LB().ready(packId)); }
function workOf(packId) { if (st.work[packId]) return st.work[packId]; var list = (LB() ? LB().entriesOf(packId) : []).map(clone); if (ready(packId)) st.work[packId] = list; return list; }
function allEntries() { var out = []; packs().forEach(function(p) { out = out.concat(workOf(p.id)); }); return out; }
function sysItems() { var c = camp(); return (c && c.system && Array.isArray(c.system.items)) ? c.system.items : []; }
function taken() { var m = Object.create(null); allEntries().forEach(function(e) { m[e.id] = 1; }); sysItems().forEach(function(it) { if (it && it.id) m[it.id] = 1; }); return m; }
function itemLists() { var c = camp(); return ((c && c.system && c.system.fields) || []).filter(function(f) { return f && f.kind === 'item-list' && f.list; }); }
// the stats an entry can carry: the item lists' stat keys, each once, as the first list spells and labels it (a pick offers its choices)
function statDefs() {
    var out = [], seen = Object.create(null);
    itemLists().forEach(function(f) { (Array.isArray(f.list.stats) ? f.list.stats : []).forEach(function(s) { var k = s && typeof s.key === 'string' ? s.key : ''; if (!k || seen[k.toLowerCase()]) return; seen[k.toLowerCase()] = 1; out.push({ key: k, label: s.label || k, opts: s.kind === 'pick' && Array.isArray(s.opts) ? s.opts.map(function(o) { return o && typeof o.label === 'string' ? o.label : ''; }).filter(Boolean) : null }); }); });
    return out;
}
function catOptions() { var out = [], seen = Object.create(null); itemLists().forEach(function(f) { (Array.isArray(f.list.cats) ? f.list.cats : []).forEach(function(c) { if (typeof c === 'string' && c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; out.push(c); } }); }); return out; }

/* ---- writing ---- */
function state(t) { var s = ui('libState'); if (s) s.textContent = t || ''; }
function schedule(packId) { st.dirty[packId] = 1; state('Saving…'); clearTimeout(st.timer); st.timer = setTimeout(flush, FLUSH_MS); }
async function flush() {
    clearTimeout(st.timer); st.timer = null;
    var ids = Object.keys(st.dirty); if (!ids.length) return true;
    var ok = true;
    for (var i = 0; i < ids.length; i++) {
        var pid = ids[i]; if (!packById(pid) || !ready(pid)) { delete st.dirty[pid]; continue; }   // gone, or the campaign changed under the window
        var r = await LB().savePack(pid, st.work[pid] || []);
        if (r && r.ok) { delete st.dirty[pid]; if (r.dropped) toast(r.dropped + (r.dropped === 1 ? ' entry was' : ' entries were') + ' left out: ' + (r.reasons || []).slice(0, 3).join('; ') + '.'); }
        else { ok = false; toast((r && r.error) || 'The pack could not be written.'); }
    }
    state(Object.keys(st.dirty).length ? 'Not saved' : 'Saved'); if (st.open) renderPacks();
    return ok;
}

/* ---- open and close ---- */
function open() {
    if (!gmHere() || !LB()) { toast('The library is the GM’s: open it on your own machine.'); return; }
    var m = ui('libraryModal'), c = getActiveCampaign(); if (!m || !c) return;
    st.open = true; st.campId = c.id; st.work = Object.create(null); st.dirty = Object.create(null); st.q = ''; st.entryId = null; st.draftNew = null;
    if (!packById(st.packId)) st.packId = packs().length ? packs()[0].id : null;
    var cn = ui('libCampName'); if (cn) cn.textContent = c.name || '';
    var s = ui('libSearch'); if (s) s.value = '';
    m.style.display = 'flex'; state(''); renderAll();
    if (s) try { s.focus({ preventScroll: true }); } catch (e) {}
}
async function close() { if (!st.open) return; await flush(); st.open = false; st.work = Object.create(null); var m = ui('libraryModal'); if (m) m.style.display = 'none'; var b = ui('sysOpenLibrary'); if (b) try { b.focus({ preventScroll: true }); } catch (e) {} }   // back to the System editor, whose keys (Esc) then work
function renderAll() { renderPacks(); renderPackBar(); renderList(); renderForm(); }
// the library finished reading (library.js): what was loading can be shown now; an entry being edited stays as typed
function refresh() { if (!st.open) return; renderPacks(); renderPackBar(); renderList(); if (!current()) renderForm(); }

/* ---- packs ---- */
function renderPacks() {
    var box = ui('libPacks'); if (!box) return; box.textContent = '';
    if (!packs().length) box.appendChild(el('div', 'lib-empty', 'No packs yet. A pack holds entries — weapons, gear, spells, skills — by the thousand if you like.'));
    packs().forEach(function(p) {
        var b = el('button', 'lib-pack' + (p.id === st.packId ? ' on' : '')); b.type = 'button';
        b.appendChild(el('span', 'lib-pack-ico', p.icon && !/^icon:/.test(p.icon) ? p.icon : ''));
        b.appendChild(el('span', 'lib-pack-name', p.name));
        if (p.vis === 'gm') b.appendChild(el('span', 'sheet-chip sheet-chip-gm', 'GM'));
        b.appendChild(el('span', 'lib-pack-n', ready(p.id) ? String(workOf(p.id).length) : String(p.count)));
        b.addEventListener('click', function() { st.packId = p.id; st.entryId = null; st.draftNew = null; st.q = ''; var s = ui('libSearch'); if (s) s.value = ''; var l = ui('libList'); if (l) l.scrollTop = 0; renderAll(); });
        box.appendChild(b);
    });
}
function plural(n) { return n + (n === 1 ? ' entry' : ' entries'); }
function select(pairs, value) { var s = el('select', 'field'); pairs.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; s.appendChild(op); }); s.value = value; return s; }
function renderPackBar() {
    var bar = ui('libPackBar'); if (!bar) return; bar.textContent = '';
    var p = packById(st.packId); if (!p) return;
    var meta = function(m) { var r = LB().setMeta(p.id, m); if (r && r.error) toast(r.error); renderPacks(); renderPackBar(); };
    var nm = el('input', 'field lib-pack-namein'); nm.type = 'text'; nm.value = p.name; nm.maxLength = LIB.packName; nm.title = 'The pack’s name';
    nm.addEventListener('change', function() { meta({ name: nm.value }); });
    var ic = el('input', 'field lib-pack-icon'); ic.type = 'text'; ic.value = p.icon && !/^icon:/.test(p.icon) ? p.icon : ''; ic.maxLength = 16; ic.placeholder = 'Icon'; ic.title = 'An emoji for the pack';
    ic.addEventListener('change', function() { meta({ icon: ic.value }); });
    var vis = select(VIS, p.vis === 'gm' ? 'gm' : 'all'); vis.classList.add('lib-pack-vis');
    vis.title = 'A GM-only pack is yours: its entries count as GM-only, so no player sees or picks them and formulas read them on your screen only';
    vis.addEventListener('change', function() { meta({ vis: vis.value }); });
    var del = el('button', 'tool ghost lib-pack-del', 'Delete pack'); del.type = 'button'; del.title = 'Delete this pack and its entries (characters keep the copies they carry)';
    del.addEventListener('click', function() { showConfirm('Delete the pack “' + p.name + '” and its ' + plural(ready(p.id) ? workOf(p.id).length : p.count) + '? Characters keep the copies they carry.', async function(yes) { if (!yes || !st.open) return; delete st.dirty[p.id]; delete st.work[p.id]; var r = await LB().deletePack(p.id); if (r && r.error) toast(r.error); st.packId = packs().length ? packs()[0].id : null; st.entryId = null; st.draftNew = null; renderAll(); }); });
    bar.appendChild(nm); bar.appendChild(ic); bar.appendChild(vis); bar.appendChild(del);
    if (!ready(p.id)) bar.appendChild(el('div', 'lib-warn', LB().state() === 'loading' ? 'Reading this pack…' : 'This pack could not be read, so it cannot change here. Its file is kept as it is.'));
}
function newPack() {
    showPrompt('Name the new pack', 'Gear', async function(name) { if (name === null || name === undefined || !st.open) return; var r = await LB().createPack(name); if (!r || r.error) { toast((r && r.error) || 'The pack could not be made.'); return; } st.packId = r.id; st.entryId = null; st.draftNew = null; renderAll(); });
}

/* ---- entries ---- */
function listBox() { var box = ui('libList'); if (!box) return null; var sp = box.querySelector('.lib-spacer'); if (!sp) { box.textContent = ''; sp = el('div', 'lib-spacer'); box.appendChild(sp); } return { box: box, sp: sp }; }
function renderList() {
    var lb = listBox(); if (!lb) return;
    var list = st.packId ? searchEntries(workOf(st.packId), st.q).sort(function(a, b) { return byName(a.name, b.name); }) : [];
    st.shown = list; lb.sp.style.height = (list.length * ROW_H) + 'px';
    var old = lb.box.querySelector('.lib-empty'); if (old) old.parentNode.removeChild(old);
    var cnt = ui('libCount'); if (cnt) cnt.textContent = st.packId ? (st.q ? list.length + ' found' : plural(list.length)) : '';
    if (st.packId && !list.length && ready(st.packId)) lb.box.appendChild(el('div', 'lib-empty', st.q ? 'Nothing matches.' : 'This pack is empty: + Entry adds one.'));
    drawRows();
}
// only the rows that show (and ten either side): the spacer keeps the scroll height, so scrolling never rebuilds more than about forty rows
function drawRows() {
    var lb = listBox(); if (!lb) return; var list = st.shown, top = lb.box.scrollTop, h = lb.box.clientHeight || 400;
    lb.sp.textContent = '';
    var from = Math.max(0, Math.floor(top / ROW_H) - 10), to = Math.min(list.length, Math.ceil((top + h) / ROW_H) + 10);
    for (var i = from; i < to; i++) (function(e, i) {
        var r = el('button', 'lib-row' + (e.id === st.entryId ? ' on' : '')); r.type = 'button'; r.style.top = (i * ROW_H) + 'px';
        r.appendChild(el('span', 'lib-row-ico', e.icon && !/^icon:/.test(e.icon) ? e.icon : ''));
        r.appendChild(el('span', 'lib-row-name', e.name)); if (e.key && e.key !== e.name) r.appendChild(el('span', 'lib-row-key', e.key));
        r.appendChild(el('span', 'lib-row-cat', e.category || '')); if (e.vis === 'gm') r.appendChild(el('span', 'sheet-chip sheet-chip-gm', 'GM'));
        r.addEventListener('click', function() { st.entryId = e.id; st.draftNew = null; drawRows(); renderForm(); });
        lb.sp.appendChild(r);
    })(list[i], i);
}
function current() { if (st.draftNew) return st.draftNew; var list = st.packId ? workOf(st.packId) : []; return list.filter(function(e) { return e.id === st.entryId; })[0] || null; }
function newEntry() {
    if (!st.packId) { toast('Make a pack first.'); return; } if (!ready(st.packId)) return;
    var id = newEntryId(taken()); if (!id) return;
    st.draftNew = { id: id, name: '', category: '', vis: 'all' }; st.entryId = id; drawRows(); renderForm(); var n = ui('libF_name'); if (n) try { n.focus(); } catch (e) {}
}
function field(form, id, label, value, opts) {
    opts = opts || {}; var row = el('label', 'lib-frow' + (opts.area ? ' lib-frow-area' : '')); row.appendChild(el('span', 'lib-flabel', label));
    var v = value == null ? '' : String(value), inp;
    if (opts.pairs) inp = select(opts.pairs, v);
    else if (opts.choices) { var pairs = [['', '—']].concat(opts.choices.map(function(c) { return [c, c]; })); if (v && opts.choices.indexOf(v) < 0) pairs.push([v, v]); inp = select(pairs, v); }
    else { inp = el(opts.area ? 'textarea' : 'input', 'field'); if (opts.area) inp.rows = opts.rows || 3; else inp.type = 'text'; inp.value = v; if (opts.max) inp.maxLength = opts.max; if (opts.ph) inp.placeholder = opts.ph; if (opts.list) inp.setAttribute('list', opts.list); }
    inp.id = 'libF_' + id; if (opts.title) row.title = opts.title;
    row.appendChild(inp); form.appendChild(row); return inp;
}
function renderForm() {
    var form = ui('libForm'); if (!form) return; form.textContent = '';
    var e = current(); if (!e) { form.appendChild(el('div', 'lib-empty', st.packId && ready(st.packId) ? 'Choose an entry, or + Entry to add one.' : '')); return; }
    form.appendChild(el('div', 'lib-fhead', st.draftNew && !e.name ? 'New entry' : e.name));
    field(form, 'name', 'Name', e.name, { max: 60 });
    field(form, 'key', 'Key', e.key, { max: 40, ph: 'e.g. Stealth', title: 'The name formulas use for it (List.Key.stat): unique within the lists that draw on it' });
    var clash = keyClashes(allEntries().concat(sysItems()), e); if (clash.length) form.appendChild(el('div', 'lib-warn', 'Also the key of ' + clash.slice(0, 3).map(function(c) { return c.name; }).join(', ') + (clash.length > 3 ? '…' : '') + ' (an item of the system wins in formulas).'));
    var dl = el('datalist'); dl.id = 'libCats'; catOptions().forEach(function(c) { var o = el('option'); o.value = c; dl.appendChild(o); }); form.appendChild(dl);
    field(form, 'category', 'Category', e.category, { max: 40, list: 'libCats', title: 'Which item lists offer it (a list names the categories it draws on)' });
    field(form, 'icon', 'Icon', e.icon && !/^icon:/.test(e.icon) ? e.icon : '', { max: 16, ph: 'An emoji' });
    field(form, 'vis', 'Who sees it', e.vis === 'gm' ? 'gm' : 'all', { pairs: VIS, title: 'A GM-only entry stays out of the players’ lists (one you give a character reaches its owner by name and notes)' });
    field(form, 'lvl', 'Starts at level', typeof e.lvl === 'number' ? e.lvl : '', { max: 4, title: 'A new row of it starts at this level (else the list’s)' });
    var sd = statDefs(); if (sd.length) { form.appendChild(el('div', 'lib-fsub', 'Stats')); sd.forEach(function(s) { var inp = field(form, 'st_' + s.key.toLowerCase(), s.label, e.stats && e.stats[s.key] !== undefined ? e.stats[s.key] : '', s.opts ? { choices: s.opts } : { max: 40 }); inp.dataset.stat = s.key; }); }
    field(form, 'notes', 'Notes', e.notes, { area: true, rows: 2, max: 200, title: 'Shown with the row on the sheet (copied onto characters)' });
    field(form, 'desc', 'Description', e.desc, { area: true, rows: 5, max: LIB.desc, title: 'The full text, read in the library (never copied onto characters)' });
    field(form, 'tags', 'Tags', (e.tags || []).join(', '), { max: 220, ph: 'comma, separated', title: 'Words the search finds it by' });
    field(form, 'ref', 'Reference', e.ref, { max: LIB.ref, ph: 'e.g. Core p. 152' });
    form.appendChild(el('div', 'lib-fsub', 'At the table'));
    field(form, 'damage', 'Damage', e.damage, { max: 300, ph: 'e.g. 2d6 + 1' });
    field(form, 'cost', 'Cost', e.cost, { max: 300 });
    field(form, 'areaFt', 'Blast (ft)', e.area && e.area.ft ? e.area.ft : '', { max: 5, title: 'A blast radius in feet: the character can throw it from the sheet' });
    field(form, 'throwSkill', 'Thrown with', e.throwSkill, { max: 40, ph: 'A skill key', title: 'The skill a throw of it rolls' });
    field(form, 'gmNotes', 'GM notes', e.gmNotes, { area: true, rows: 3, max: LIB.gmNotes, title: 'Yours alone: never on a player’s screen' });
    var btns = el('div', 'lib-fbtns');
    var sv = el('button', 'tool lib-save', 'Save entry'); sv.type = 'button'; sv.addEventListener('click', saveEntry);
    var dup = el('button', 'tool ghost', 'Duplicate'); dup.type = 'button'; dup.disabled = !!st.draftNew; dup.addEventListener('click', duplicateEntry);
    var del = el('button', 'tool ghost lib-del', st.draftNew ? 'Discard' : 'Delete entry'); del.type = 'button'; del.addEventListener('click', deleteEntry);
    btns.appendChild(sv); btns.appendChild(dup); btns.appendChild(del); form.appendChild(btns);
}
// the form as an entry: what the form shows replaced, anything it does not show (a bound item's secrets) kept as it was
function readForm() {
    var g = function(id) { var n = ui('libF_' + id); return n ? n.value : ''; }, e = current(), stats = {};
    Array.prototype.forEach.call(document.querySelectorAll('#libForm [data-stat]'), function(n) { stats[n.dataset.stat] = n.value; });
    var typed = entryFromForm({ id: e.id, name: g('name'), key: g('key'), category: g('category'), icon: g('icon'), vis: g('vis'), lvl: g('lvl'), stats: stats, notes: g('notes'), desc: g('desc'), tags: g('tags'), ref: g('ref'), damage: g('damage'), cost: g('cost'), throwSkill: g('throwSkill'), areaFt: g('areaFt'), areaShape: e.area && e.area.shape, areaName: e.area && e.area.name, gmNotes: g('gmNotes') });
    var out = clone(e); FORM_KEYS.forEach(function(k) { delete out[k]; }); return Object.assign(out, typed);
}
function saveEntry() {
    var e = current(); if (!e || !st.packId || !ready(st.packId)) return;
    var raw = readForm(); if (!raw.name.trim()) { toast('Give the entry a name.'); return; }
    var c = cleanLibEntry(raw, libCtx(camp() && camp().system, F(), true)); if (!c) { toast('That entry could not be kept.'); return; }
    var list = workOf(st.packId), i = -1; list.forEach(function(x, k) { if (x.id === c.id) i = k; });
    if (i < 0) { if (list.length >= LIB.entries) { toast('A pack holds at most ' + LIB.entries + ' entries.'); return; } list.push(c); } else list[i] = c;
    st.draftNew = null; st.entryId = c.id; schedule(st.packId); renderPacks(); renderList(); renderForm();
}
function duplicateEntry() { var e = current(); if (!e || st.draftNew) return; var id = newEntryId(taken()); if (!id) return; var d = clone(e); d.id = id; d.name = (e.name + ' (copy)').slice(0, 60); delete d.key; st.draftNew = d; st.entryId = id; drawRows(); renderForm(); }
function deleteEntry() {
    var e = current(); if (!e) return;
    if (st.draftNew) { st.draftNew = null; st.entryId = null; drawRows(); renderForm(); return; }
    var pid = st.packId;
    showConfirm('Delete “' + e.name + '” from this pack? Characters keep the copies they carry.', function(yes) { if (!yes || !st.open || !ready(pid)) return; st.work[pid] = workOf(pid).filter(function(x) { return x.id !== e.id; }); if (st.entryId === e.id) st.entryId = null; schedule(pid); renderPacks(); renderList(); renderForm(); });
}

/* ---- wiring ---- */
(function wire() {
    var m = ui('libraryModal'); if (!m) return;
    var c = ui('libClose'); if (c) c.addEventListener('click', close);
    var np = ui('libNewPack'); if (np) np.addEventListener('click', newPack);
    var ne = ui('libNewEntry'); if (ne) ne.addEventListener('click', newEntry);
    var s = ui('libSearch'); if (s) s.addEventListener('input', function() { st.q = s.value.slice(0, 120); var b = ui('libList'); if (b) b.scrollTop = 0; renderList(); });
    var lst = ui('libList'); if (lst) lst.addEventListener('scroll', drawRows, { passive: true });
    var ob = ui('sysOpenLibrary'); if (ob) ob.addEventListener('click', open);
    // its keys stay its own (as the System editor's), and Esc closes it, unless a question above it is open: that one answers first
    m.addEventListener('keydown', function(e) { var q = ui('customConfirm'), p = ui('customPrompt'); if ((q && q.style.display === 'flex') || (p && p.style.display === 'flex')) return; e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } });
})();

window.wpLibraryWin = { open: open, close: close, flush: flush, refresh: refresh, isOpen: function() { return st.open; } };
