/* librarywin.js — the GM's Library window (Stage 6, library L2a, L2a2): a campaign's packs of item entries, browsed and edited on the
   GM's own machine. The packs on the left (new, import, rename, icon, who may see it, export, delete); the chosen pack's entries in the
   middle (a search, and a list drawn only where it shows, so thousands stay quick; Ctrl-click, Shift-click and Ctrl+A choose several);
   on the right the chosen entry's form, the bulk panel for several, or an import's dry run. A saved entry goes into the pack's working
   copy at once and the pack is written a second later (one revision for a burst of edits); closing the window writes what is pending.
   A pack not read (still loading, or unreadable) cannot change: writing it would replace what is on disk with nothing. Built with text
   nodes only. The rules are librarycore's (librarycheck); the store is library.js's. */
import { getActiveCampaign } from './models.js';
import { toast } from './io.js';
import { showPrompt, showConfirm } from './dialogs.js';
import { searchEntries, entryFromForm, newEntryId, keyClashes, cleanLibEntry, libCtx, LIB, packFile, readPackImport, packImportPlan, bulkSet, bulkMove } from './librarycore.js';

var ROW_H = 28, FLUSH_MS = 1000, FORM_KEYS = ['name', 'key', 'category', 'icon', 'vis', 'notes', 'desc', 'ref', 'gmNotes', 'damage', 'cost', 'throwSkill', 'tags', 'lvl', 'stats', 'area', 'rm', 'rmMsg', 'eq', 'eqMsg'];
var VIS = [['all', 'Players can see it'], ['gm', 'GM only']];
var st = { open: false, campId: null, packId: null, entryId: null, q: '', shown: [], work: map(), dirty: map(), timer: null, draftNew: null, sel: map(), anchor: null, imp: null };
var byName = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }).compare : function(a, b) { return String(a).localeCompare(String(b)); };
function map() { return Object.create(null); }
function ui(id) { return document.getElementById(id); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
function LB() { return window.wpLibrary; }
function camp() { var c = getActiveCampaign(); return c && c.id === st.campId ? c : null; }   // the campaign the window opened on, or none
function F() { return window.wpFormula; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function gmHere() { var n = window.wpNet; if (n && n.active && n.role === 'client') return false; if (n && (n.foreign || n.stream)) return false; return !window.wpStream && !!(window.wpCanPersistLocal ? window.wpCanPersistLocal() : true); }
function gmCtx() { var c = camp(); return libCtx(c && c.system, F(), true); }
function packs() { var c = camp(); return c && c.library ? c.library.packs : []; }
function packById(id) { return packs().filter(function(p) { return p.id === id; })[0] || null; }
function ready(packId) { return !!(camp() && LB() && LB().ready && LB().ready(packId)); }
function workOf(packId) { if (st.work[packId]) return st.work[packId]; var list = (LB() ? LB().entriesOf(packId) : []).map(clone); if (ready(packId)) st.work[packId] = list; return list; }
function allEntries() { var out = []; packs().forEach(function(p) { out = out.concat(workOf(p.id)); }); return out; }
function sysItems() { var c = camp(); return (c && c.system && Array.isArray(c.system.items)) ? c.system.items : []; }
function taken() { var m = map(); allEntries().forEach(function(e) { m[e.id] = 1; }); sysItems().forEach(function(it) { if (it && it.id) m[it.id] = 1; }); return m; }
function itemLists() { var c = camp(); return ((c && c.system && c.system.fields) || []).filter(function(f) { return f && f.kind === 'item-list' && f.list; }); }
function plural(n) { return n + (n === 1 ? ' entry' : ' entries'); }
function tagList(v) { return String(v || '').split(',').map(function(t) { return t.trim(); }).filter(Boolean); }
// the stats an entry can carry: the item lists' stat keys, each once, as the first list spells and labels it (a pick offers its choices)
function statDefs() {
    var out = [], seen = map();
    itemLists().forEach(function(f) { (Array.isArray(f.list.stats) ? f.list.stats : []).forEach(function(s) { var k = s && typeof s.key === 'string' ? s.key : ''; if (!k || seen[k.toLowerCase()]) return; seen[k.toLowerCase()] = 1; out.push({ key: k, label: s.label || k, opts: s.kind === 'pick' && Array.isArray(s.opts) ? s.opts.map(function(o) { return o && typeof o.label === 'string' ? o.label : ''; }).filter(Boolean) : null }); }); });
    return out;
}
function catOptions() { var out = [], seen = map(); itemLists().forEach(function(f) { (Array.isArray(f.list.cats) ? f.list.cats : []).forEach(function(c) { if (typeof c === 'string' && c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; out.push(c); } }); }); return out; }
function catList(form) { var dl = el('datalist'); dl.id = 'libCats'; catOptions().forEach(function(c) { var o = el('option'); o.value = c; dl.appendChild(o); }); form.appendChild(dl); }

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
    st.open = true; st.campId = c.id; st.work = map(); st.dirty = map(); st.q = ''; st.entryId = null; st.draftNew = null; st.sel = map(); st.anchor = null; st.imp = null;
    if (!packById(st.packId)) st.packId = packs().length ? packs()[0].id : null;
    var cn = ui('libCampName'); if (cn) cn.textContent = c.name || '';
    var s = ui('libSearch'); if (s) s.value = '';
    m.style.display = 'flex'; state(''); renderAll();
    if (s) try { s.focus({ preventScroll: true }); } catch (e) {}
}
async function close() { if (!st.open) return; await flush(); st.open = false; st.work = map(); st.imp = null; var m = ui('libraryModal'); if (m) m.style.display = 'none'; var b = ui('sysOpenLibrary'); if (b) try { b.focus({ preventScroll: true }); } catch (e) {} }   // back to the System editor, whose keys (Esc) then work
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
        b.addEventListener('click', function() { st.packId = p.id; st.entryId = null; st.draftNew = null; st.sel = map(); st.anchor = null; st.q = ''; var s = ui('libSearch'); if (s) s.value = ''; var l = ui('libList'); if (l) l.scrollTop = 0; renderAll(); });
        box.appendChild(b);
    });
}
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
    var ex = select([['', 'Export…'], ['gm', 'The GM’s copy'], ['players', 'A players’ copy']], ''); ex.classList.add('lib-pack-export');
    ex.title = 'Save this pack as a .wppack.json file: the GM’s copy holds everything; a players’ copy holds only what players may see (no GM-only entries, GM notes or formulas)';
    if (p.vis === 'gm') ex.options[2].disabled = true;   // a GM-only pack's entries count as GM-only: its players' copy would be empty
    ex.disabled = !ready(p.id); ex.addEventListener('change', function() { var v = ex.value; ex.value = ''; if (v) exportPack(v); });
    var del = el('button', 'tool ghost lib-pack-del', 'Delete pack'); del.type = 'button'; del.title = 'Delete this pack and its entries (characters keep the copies they carry)';
    del.addEventListener('click', function() { showConfirm('Delete the pack “' + p.name + '” and its ' + plural(ready(p.id) ? workOf(p.id).length : p.count) + '? Characters keep the copies they carry.', async function(yes) { if (!yes || !st.open) return; delete st.dirty[p.id]; delete st.work[p.id]; var r = await LB().deletePack(p.id); if (r && r.error) toast(r.error); st.packId = packs().length ? packs()[0].id : null; st.entryId = null; st.draftNew = null; st.sel = map(); renderAll(); }); });
    bar.appendChild(nm); bar.appendChild(ic); bar.appendChild(vis); bar.appendChild(ex); bar.appendChild(del);
    if (!ready(p.id)) bar.appendChild(el('div', 'lib-warn', LB().state() === 'loading' ? 'Reading this pack…' : 'This pack could not be read, so it cannot change here. Its file is kept as it is.'));
}
function newPack() {
    showPrompt('Name the new pack', 'Gear', async function(name) { if (name === null || name === undefined || !st.open) return; var r = await LB().createPack(name); if (!r || r.error) { toast((r && r.error) || 'The pack could not be made.'); return; } st.packId = r.id; st.entryId = null; st.draftNew = null; st.sel = map(); renderAll(); });
}
// L2a2: a pack saved as a file — the GM's copy as held, or a players' copy as the players' view holds it (librarycore packFile)
function exportPack(which) {
    var p = packById(st.packId), c = camp(); if (!p || !c || !ready(p.id)) return;
    var players = which === 'players', pv = players && window.wpSheets && window.wpSheets.playerSystem ? window.wpSheets.playerSystem(c) : null;
    var file = packFile(p, workOf(p.id), players ? libCtx(pv || { fields: [] }, F(), false) : gmCtx());
    var base = String(p.name || '').replace(/[^A-Za-z0-9_ -]+/g, '').trim().replace(/ +/g, '_').slice(0, 40) || 'pack';
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' })); a.download = base + (players ? '.players' : '') + '.wppack.json';
    document.body.appendChild(a); a.click(); setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast((players ? 'A players’ copy of “' : '“') + p.name + '” exported: ' + plural(file.entries.length) + '.');
}

/* ---- import (L2a2): a .wppack.json read, its dry run shown, then applied ---- */
function importPick() {
    var fi = el('input'); fi.type = 'file'; fi.accept = '.json,application/json';
    fi.addEventListener('change', function() {
        var f = fi.files && fi.files[0]; if (!f || !st.open) return;
        if (f.size > LIB.fileBytes) { toast('That file is too large (16 MB at most).'); return; }
        f.text().then(function(text) {
            if (!st.open) return;
            var d = readPackImport(text, gmCtx()); if (d.error) { toast(d.error); return; }
            st.imp = { file: String(f.name || '').slice(0, 80), data: d, mode: 'new', target: st.packId }; st.sel = map(); st.entryId = null; st.draftNew = null; drawRows(); renderForm();
        }).catch(function() { toast('That file could not be read.'); });
    });
    fi.click();
}
function planFor(im) { return packImportPlan(packs().map(function(p) { return { id: p.id, name: p.name, entries: workOf(p.id) }; }), im.target, im.data, im.mode); }
function renderImport(form) {
    var im = st.imp, d = im.data, targets = packs().filter(function(p) { return ready(p.id); });
    if (!targets.some(function(p) { return p.id === im.target; })) im.target = targets.length ? targets[0].id : null;
    form.appendChild(el('div', 'lib-fhead', 'Import “' + d.name + '”'));
    form.appendChild(el('div', 'lib-note', im.file + ' · ' + plural(d.entries.length) + (d.dropped ? ' (and ' + d.dropped + ' not valid)' : '') + '. Nothing changes until you press Import.'));
    var md = field(form, 'imMode', 'Import as', im.mode, { pairs: [['new', 'A new pack'], ['id', 'Merged into a pack, by id'], ['key', 'Merged into a pack, by key']], title: 'By id: an entry of the same id is replaced. By key: an entry of the same key is replaced and keeps its id. Either way the rest are added.' });
    md.addEventListener('change', function() { im.mode = md.value; renderForm(); });
    if (im.mode !== 'new') {
        if (targets.length) { var tg = field(form, 'imTarget', 'Into', im.target, { pairs: targets.map(function(p) { return [p.id, p.name]; }) }); tg.addEventListener('change', function() { im.target = tg.value; renderForm(); }); }
        else form.appendChild(el('div', 'lib-warn', 'There is no pack to merge into yet.'));
    }
    var plan = planFor(im), sum = el('div', 'lib-imsum');
    [['Added', plan.add], ['Updated', plan.update], ['Unchanged', plan.same], ['Skipped', plan.skip], ['Not valid', plan.invalid]].forEach(function(x) { var c = el('div', 'lib-imcell' + (x[1] ? '' : ' zero')); c.appendChild(el('b', null, String(x[1]))); c.appendChild(el('span', null, x[0])); sum.appendChild(c); });
    form.appendChild(sum);
    if (plan.clash) form.appendChild(el('div', 'lib-warn', plural(plan.clash) + ' would share a key with another entry (a system item wins in formulas).'));
    if (plan.reasons.length) { var ul = el('ul', 'lib-reasons'); plan.reasons.forEach(function(r) { ul.appendChild(el('li', null, r)); }); form.appendChild(ul); }
    var btns = el('div', 'lib-fbtns');
    var go = el('button', 'tool lib-save', 'Import'); go.type = 'button'; go.disabled = !(plan.add || plan.update); go.addEventListener('click', doImport);
    var no = el('button', 'tool ghost', 'Cancel'); no.type = 'button'; no.addEventListener('click', function() { st.imp = null; renderForm(); });
    btns.appendChild(go); btns.appendChild(no); form.appendChild(btns);
}
async function doImport() {
    var im = st.imp; if (!im || !st.open) return;
    var plan = planFor(im), pid = im.target; if (!plan.add && !plan.update) return;
    if (im.mode === 'new') {
        var r = await LB().createPack(im.data.name); if (!r || r.error) { toast((r && r.error) || 'The pack could not be made.'); return; }
        pid = r.id; LB().setMeta(pid, { icon: im.data.icon || '', vis: im.data.vis }); plan = planFor(im);
    } else if (!ready(pid)) return;
    st.work[pid] = plan.entries; st.imp = null; st.packId = pid; st.sel = map(); st.entryId = null; st.q = ''; var s = ui('libSearch'); if (s) s.value = '';
    schedule(pid); await flush();
    toast('Imported into “' + ((packById(pid) || {}).name || '') + '”: ' + plan.add + ' added, ' + plan.update + ' updated' + (plan.skip ? ', ' + plan.skip + ' skipped' : '') + '.');
    renderAll();
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
        var r = el('button', 'lib-row' + (st.sel[e.id] ? ' on' : '')); r.type = 'button'; r.style.top = (i * ROW_H) + 'px';
        r.appendChild(el('span', 'lib-row-ico', e.icon && !/^icon:/.test(e.icon) ? e.icon : ''));
        r.appendChild(el('span', 'lib-row-name', e.name)); if (e.key && e.key !== e.name) r.appendChild(el('span', 'lib-row-key', e.key));
        r.appendChild(el('span', 'lib-row-cat', e.category || '')); if (e.vis === 'gm') r.appendChild(el('span', 'sheet-chip sheet-chip-gm', 'GM'));
        r.addEventListener('click', function(ev) { pickRow(e, ev); });
        lb.sp.appendChild(r);
    })(list[i], i);
}
// L2a2: choosing — a click one entry (its form), Ctrl-click adds or removes one, Shift-click the run from the last one clicked, Ctrl+A every
// entry shown; several chosen show the bulk panel. What the search hides is never acted on
function chosen() { return st.shown.filter(function(e) { return st.sel[e.id]; }).map(function(e) { return e.id; }); }
function afterPick() { var ids = chosen(); st.entryId = ids.length === 1 ? ids[0] : null; st.draftNew = null; st.imp = null; drawRows(); renderForm(); }
function pickRow(e, ev) {
    var ids = st.shown.map(function(x) { return x.id; }), a = st.anchor ? ids.indexOf(st.anchor) : -1, b = ids.indexOf(e.id);
    if (ev && ev.shiftKey && a >= 0 && b >= 0) { st.sel = map(); for (var i = Math.min(a, b); i <= Math.max(a, b); i++) st.sel[ids[i]] = 1; }
    else if (ev && (ev.ctrlKey || ev.metaKey)) { if (st.sel[e.id]) delete st.sel[e.id]; else st.sel[e.id] = 1; st.anchor = e.id; }
    else { st.sel = map(); st.sel[e.id] = 1; st.anchor = e.id; }
    afterPick();
}
function pickAll() { st.sel = map(); st.shown.forEach(function(x) { st.sel[x.id] = 1; }); afterPick(); }
function current() { if (st.draftNew) return st.draftNew; if (!st.entryId) return null; var list = st.packId ? workOf(st.packId) : []; return list.filter(function(e) { return e.id === st.entryId; })[0] || null; }
function newEntry() {
    if (!st.packId) { toast('Make a pack first.'); return; } if (!ready(st.packId)) return;
    var id = newEntryId(taken()); if (!id) return;
    st.draftNew = { id: id, name: '', category: '', vis: 'all' }; st.entryId = id; st.sel = map(); st.imp = null; drawRows(); renderForm(); var n = ui('libF_name'); if (n) try { n.focus(); } catch (e) {}
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
    if (st.imp) { renderImport(form); return; }
    var many = st.draftNew ? [] : chosen(); if (many.length > 1) { renderBulk(form, many); return; }
    var e = current(); if (!e) { form.appendChild(el('div', 'lib-empty', st.packId && ready(st.packId) ? 'Choose an entry, or + Entry to add one. Ctrl-click, Shift-click or Ctrl+A choose several.' : '')); return; }
    form.appendChild(el('div', 'lib-fhead', st.draftNew && !e.name ? 'New entry' : e.name));
    field(form, 'name', 'Name', e.name, { max: 60 });
    field(form, 'key', 'Key', e.key, { max: 40, ph: 'e.g. Stealth', title: 'The name formulas use for it (List.Key.stat): unique within the lists that draw on it' });
    var clash = keyClashes(allEntries().concat(sysItems()), e); if (clash.length) form.appendChild(el('div', 'lib-warn', 'Also the key of ' + clash.slice(0, 3).map(function(c) { return c.name; }).join(', ') + (clash.length > 3 ? '…' : '') + ' (an item of the system wins in formulas).'));
    catList(form);
    field(form, 'category', 'Category', e.category, { max: 40, list: 'libCats', title: 'Which item lists offer it (a list names the categories it draws on)' });
    field(form, 'icon', 'Icon', e.icon || '', { max: 32, ph: 'An emoji', title: 'An emoji, or a bundled icon as icon:name (kept as it is)' });
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
    form.appendChild(el('div', 'lib-fsub', 'Locks (yours alone)'));
    field(form, 'rm', 'When removed', e.rm === 'bound' || e.rm === 'curse' ? e.rm : '', { pairs: [['', 'A player may remove it'], ['bound', 'Bound: only the GM removes it'], ['curse', 'Curse on contact: you keep it']], title: 'When a player removes it from their character. Bound: it stays, with your message. Curse on contact: it leaves their sheet but you keep it on the character, out of their sight' });
    field(form, 'rmMsg', 'Message', e.rmMsg, { max: 200, ph: 'Shown to the player (optional)' });
    if (itemLists().some(function(f) { return f.list && f.list.on; })) {   // only once a list has a switch (Readied, Equipped…)
        field(form, 'eq', 'When switched off', e.eq === 'bound' || e.eq === 'curse' ? e.eq : '', { pairs: [['', 'A player may switch it off'], ['bound', 'Bound: it stays on'], ['curse', 'Curse on contact: you keep it on']], title: 'When a player switches it off. Bound: it stays on, with your message. Curse on contact: it looks off to them and stays on' });
        field(form, 'eqMsg', 'Message', e.eqMsg, { max: 200, ph: 'Shown to the player (optional)' });
    }
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
    var typed = entryFromForm({ id: e.id, name: g('name'), key: g('key'), category: g('category'), icon: g('icon'), vis: g('vis'), lvl: g('lvl'), stats: stats, notes: g('notes'), desc: g('desc'), tags: g('tags'), ref: g('ref'), damage: g('damage'), cost: g('cost'), throwSkill: g('throwSkill'), areaFt: g('areaFt'), areaShape: e.area && e.area.shape, areaName: e.area && e.area.name, gmNotes: g('gmNotes'), rm: g('rm'), rmMsg: g('rmMsg'), eq: g('eq'), eqMsg: g('eqMsg') });
    var out = clone(e), eqShown = !!ui('libF_eq'); FORM_KEYS.forEach(function(k) { if (eqShown || (k !== 'eq' && k !== 'eqMsg')) delete out[k]; }); return Object.assign(out, typed);   // a switch lock the form does not show (no list has a switch) is kept
}
function saveEntry() {
    var e = current(); if (!e || !st.packId || !ready(st.packId)) return;
    var raw = readForm(); if (!raw.name.trim()) { toast('Give the entry a name.'); return; }
    var c = cleanLibEntry(raw, gmCtx()); if (!c) { toast('That entry could not be kept.'); return; }
    var list = workOf(st.packId), i = -1; list.forEach(function(x, k) { if (x.id === c.id) i = k; });
    if (i < 0) { if (list.length >= LIB.entries) { toast('A pack holds at most ' + LIB.entries + ' entries.'); return; } list.push(c); } else list[i] = c;
    st.draftNew = null; st.entryId = c.id; st.sel = map(); st.sel[c.id] = 1; st.anchor = c.id; schedule(st.packId); renderPacks(); renderList(); renderForm();
}
function duplicateEntry() { var e = current(); if (!e || st.draftNew) return; var id = newEntryId(taken()); if (!id) return; var d = clone(e); d.id = id; d.name = (e.name + ' (copy)').slice(0, 60); delete d.key; st.draftNew = d; st.entryId = id; st.sel = map(); drawRows(); renderForm(); }
function deleteEntry() {
    var e = current(); if (!e) return;
    if (st.draftNew) { st.draftNew = null; st.entryId = null; drawRows(); renderForm(); return; }
    var pid = st.packId;
    showConfirm('Delete “' + e.name + '” from this pack? Characters keep the copies they carry.', function(yes) { if (!yes || !st.open || !ready(pid)) return; st.work[pid] = workOf(pid).filter(function(x) { return x.id !== e.id; }); delete st.sel[e.id]; if (st.entryId === e.id) st.entryId = null; schedule(pid); renderPacks(); renderList(); renderForm(); });
}

/* ---- bulk (L2a2): several chosen entries at once ---- */
function renderBulk(form, ids) {
    var pid = st.packId, others = packs().filter(function(p) { return p.id !== pid && ready(p.id); });
    form.appendChild(el('div', 'lib-fhead', plural(ids.length) + ' chosen'));
    form.appendChild(el('div', 'lib-note', 'Ctrl-click adds or removes one, Shift-click a run, Ctrl+A every entry shown.'));
    var row = function(label, title) { var r = el('div', 'lib-frow'); r.appendChild(el('span', 'lib-flabel', label)); var c = el('div', 'lib-ctl'); r.appendChild(c); if (title) r.title = title; form.appendChild(r); return c; };
    var btn = function(parent, text, fn, cls) { var b = el('button', 'tool' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.addEventListener('click', fn); parent.appendChild(b); return b; };
    var c1 = row('To a pack', 'A move keeps each entry’s id, so rows that point at it still find it; a copy gets a new id and no key');
    if (others.length) { var to = select(others.map(function(p) { return [p.id, p.name]; }), others[0].id); c1.appendChild(to); btn(c1, 'Move', function() { moveTo(to.value, false); }); btn(c1, 'Copy', function() { moveTo(to.value, true); }, 'ghost'); }
    else c1.appendChild(el('span', 'lib-note', 'Make another pack to move or copy to.'));
    catList(form);
    var c2 = row('Category'), cat = el('input', 'field'); cat.type = 'text'; cat.maxLength = 40; cat.setAttribute('list', 'libCats'); c2.appendChild(cat); btn(c2, 'Set', function() { bulk({ category: cat.value }); });
    var c3 = row('Tags', 'Comma separated: Add puts them beside each entry’s own, Replace puts them instead'), tg = el('input', 'field'); tg.type = 'text'; tg.maxLength = 220; tg.placeholder = 'comma, separated'; c3.appendChild(tg);
    btn(c3, 'Add', function() { bulk({ addTags: tagList(tg.value) }); }); btn(c3, 'Replace', function() { bulk({ tags: tagList(tg.value) }); }, 'ghost');
    var c4 = row('Who sees them'), vs = select(VIS, 'all'); c4.appendChild(vs); btn(c4, 'Set', function() { bulk({ vis: vs.value }); });
    var btns = el('div', 'lib-fbtns');
    btn(btns, 'Duplicate', dupMany, 'ghost'); btn(btns, 'Delete ' + plural(ids.length), delMany, 'ghost lib-del'); btn(btns, 'Clear the choice', function() { st.sel = map(); afterPick(); }, 'ghost');
    form.appendChild(btns);
}
function bulk(change) {
    var pid = st.packId, ids = chosen(); if (!ids.length || !ready(pid)) return;
    var r = bulkSet(workOf(pid), ids, change, gmCtx()); st.work[pid] = r.entries; if (r.changed) schedule(pid);
    toast(r.changed ? plural(r.changed) + ' changed.' : 'Nothing changed.'); renderList(); renderForm();
}
function moveTo(dst, copy) {
    var src = st.packId, ids = chosen(); if (!ids.length || !ready(src) || !ready(dst) || src === dst) return;
    var r = bulkMove(workOf(src), workOf(dst), ids, { copy: copy, taken: taken() });
    if (!copy) { st.work[src] = r.src; schedule(src); st.sel = map(); } st.work[dst] = r.dst; if (r.done) schedule(dst);
    toast((copy ? 'Copied ' : 'Moved ') + plural(r.done) + ' to “' + ((packById(dst) || {}).name || '') + '”' + (r.left ? '; ' + r.left + ' stayed: that pack is full' : '') + '.');
    renderPacks(); renderList(); renderForm();
}
function dupMany() {
    var pid = st.packId, ids = chosen(); if (!ids.length || !ready(pid)) return;
    var r = bulkMove(workOf(pid), workOf(pid), ids, { copy: true, taken: taken(), suffix: ' (copy)' }); st.work[pid] = r.dst; if (r.done) schedule(pid);
    toast(plural(r.done) + ' duplicated' + (r.left ? '; ' + r.left + ' not: the pack is full' : '') + '.'); renderPacks(); renderList(); renderForm();
}
function delMany() {
    var pid = st.packId, ids = chosen(); if (!ids.length) return;
    showConfirm('Delete ' + plural(ids.length) + ' from this pack? Characters keep the copies they carry.', function(yes) { if (!yes || !st.open || !ready(pid)) return; var gone = map(); ids.forEach(function(id) { gone[id] = 1; }); st.work[pid] = workOf(pid).filter(function(x) { return !gone[x.id]; }); st.sel = map(); st.entryId = null; schedule(pid); renderPacks(); renderList(); renderForm(); });
}

/* ---- wiring ---- */
(function wire() {
    var m = ui('libraryModal'); if (!m) return;
    var c = ui('libClose'); if (c) c.addEventListener('click', close);
    var np = ui('libNewPack'); if (np) np.addEventListener('click', newPack);
    var im = ui('libImport'); if (im) im.addEventListener('click', importPick);
    var ne = ui('libNewEntry'); if (ne) ne.addEventListener('click', newEntry);
    var s = ui('libSearch'); if (s) s.addEventListener('input', function() { st.q = s.value.slice(0, 120); var b = ui('libList'); if (b) b.scrollTop = 0; renderList(); if (!st.imp && !st.draftNew && Object.keys(st.sel).length > 1) afterPick(); });   // the bulk panel counts what shows; an entry's form, being typed in, stays
    var lst = ui('libList'); if (lst) { lst.addEventListener('scroll', drawRows, { passive: true }); lst.addEventListener('keydown', function(e) { if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); pickAll(); } }); }
    var ob = ui('sysOpenLibrary'); if (ob) ob.addEventListener('click', open);
    // its keys stay its own (as the System editor's), and Esc closes it, unless a question above it is open: that one answers first
    m.addEventListener('keydown', function(e) { var q = ui('customConfirm'), p = ui('customPrompt'); if ((q && q.style.display === 'flex') || (p && p.style.display === 'flex')) return; e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } });
})();

window.wpLibraryWin = { open: open, close: close, flush: flush, refresh: refresh, isOpen: function() { return st.open; } };
