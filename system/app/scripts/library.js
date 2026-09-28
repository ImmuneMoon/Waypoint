/* library.js — the GM machine's copy of the active campaign's item library (Stage 6, library L1c). The packs the campaign's
   manifest pins (camp.library) are read from the local server once the campaign is open on the GM's own machine — never at another's
   table: a player holds no library, only the copies the host puts on their rows — cleaned through librarycore and kept in memory by
   id, so rowDef (systemcore) and the host's projections read an entry at once. A pack is written as a new revision, then the manifest
   pins it and the save follows. An older Waypoint core has no library route (404): the library is then unavailable, said once.
   Pure rules live in librarycore.js (librarycheck); this file only fetches, holds and hands out. Build plan:
   docs/STAGE_6_LIBRARY_BUILD.md. */
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { libCtx, readPackFile, cleanPack, packMeta, manifestSig, addPack, removePack, nextRev, libImportPlan, setPackMeta, keyIndex, playerIndex, hashText, itemsToMove } from './librarycore.js';
import { setLibraryFind, coreOf, cleanSystem, libSnaps } from './systemcore.js';

function map() { return Object.create(null); }
var cur = { campId: null, sig: '', byId: map(), packs: map(), n: 0, state: 'none', error: '' };
var saidOld = false;
// the GM's own machine: never a player's, never the stream window, never someone else's table
function gmHere() {
    var n = window.wpNet; if (n && n.active && n.role === 'client') return false; if (n && (n.foreign || n.stream)) return false;
    return !window.wpStream && !!(window.wpCanPersistLocal ? window.wpCanPersistLocal() : true);
}
function F() { return window.wpFormula; }
function oldCore() { if (!saidOld) { saidOld = true; toast('This Waypoint core cannot store a library yet: update Waypoint to use it.'); } }
// L1d: the system's core — the library entries its formulas address by key (systemcore coreOf), recomputed after the library or the
// system changes on the GM's machine; stored (and so sent to the table) only when it changed
function byKey(camp) { return keyIndex(camp && camp.library, entriesOf); }   // L2a: in the manifest's pack order; a GM-only pack's entries count as GM-only
function refreshCore(camp) {
    camp = camp || getActiveCampaign(); if (!camp || !camp.system || !gmHere() || cur.campId !== camp.id || cur.state === 'loading') return false;
    var idx = byKey(camp), res = coreOf(camp.system, function(k) { return idx[k] || []; }), before = JSON.stringify(camp.system.core || []), nowT = JSON.stringify(res.core);
    if (before === nowT) return false;
    if (res.core.length) camp.system.core = res.core; else delete camp.system.core;
    var clean = F() ? cleanSystem(camp.system, { F: F(), gmView: true }) : null; if (clean) camp.system = clean;   // cleaned as any system is
    if (res.over) toast('The library core holds its first ' + (camp.system.core ? camp.system.core.length : 0) + ' addressed entries; ' + res.over + ' more are left out.');
    save(true);
    return true;
}
// L2c: the copies library rows carry kept current (systemcore libSnaps) on the GM's machine, never mid-load or at another's table; saved
// only when one changed (a row whose entry is gone, or whose pack could not be read, keeps its copy)
function syncSnaps(camp) {
    camp = camp || getActiveCampaign(); if (!camp || !camp.system || !camp.chars || !gmHere() || cur.campId !== camp.id || cur.state === 'loading') return 0;
    var r = libSnaps(camp.system, camp.chars, entryFor); if (r.rows) save(true);
    return r.rows;
}
function after() {   // the sheets redraw; a host's players get their rows' copies from the library now in memory, and the lists' categories it holds
    try { refreshCore(); } catch (e) { console.error(e); }
    try { syncSnaps(); } catch (e) { console.error(e); }
    try { if (window.wpSheetsSync) window.wpSheetsSync(); } catch (e) { console.error(e); }
    var n = window.wpNet; try { if (n && n.active && n.role === 'host') { if (n.syncSystem) n.syncSystem(); if (n.syncChars) n.syncChars(); } } catch (e) { console.error(e); }
}
async function load(camp) {
    camp = camp || getActiveCampaign();
    var m = camp && camp.library, mine = { campId: camp ? camp.id : null, sig: manifestSig(camp), byId: map(), packs: map(), n: 0, state: m && m.packs.length ? 'loading' : 'none', error: '' };
    cur = mine;
    if (!m || !m.packs.length || !gmHere()) { if (m && m.packs.length) mine.state = 'none'; else if (camp && gmHere()) migrateItems(camp); return mine; }   // L2b: a campaign with no library yet moves its items into one
    var ctx = libCtx(camp.system, F(), true), seen = map(), bad = [];
    for (var i = 0; i < m.packs.length; i++) {
        var p = m.packs[i]; if (!p.rev) { mine.packs[p.id] = []; continue; }   // made but never written
        var res = null; try { res = await fetch('/api/library?dir=' + m.dir + '&pack=' + p.id + '&rev=' + p.rev); } catch (e) { res = null; }
        if (cur !== mine) return cur;   // the campaign or its manifest moved on meanwhile
        if (!res || !res.ok) { if (res && res.status === 404 && /bad name|no such pack/.test(await res.text()) === false) oldCore(); bad.push(p.name); continue; }
        var rd = readPackFile(await res.text(), ctx, seen); if (cur !== mine) return cur;
        if (rd.error) { bad.push(p.name); continue; }
        mine.packs[p.id] = rd.pack.entries.map(function(e) { return e.id; });
        rd.pack.entries.forEach(function(e) { mine.byId[e.id] = e; mine.n++; });
    }
    mine.state = bad.length ? 'partial' : 'ready';
    if (bad.length) { mine.error = 'Could not read: ' + bad.join(', '); toast('The library could not read ' + bad.join(', ') + '.'); }
    after();
    if (window.wpLibraryWin && window.wpLibraryWin.refresh) { try { window.wpLibraryWin.refresh(); } catch (e) { console.error(e); } }   // L2a: an open Library window shows what was loading
    if (mine.state === 'ready') migrateItems(camp);   // L2b: every pack read: the system's items may move in
    return mine;
}
// Write a pack's entries as its next revision; the manifest pins it and the save follows. { ok } or { error }
async function savePack(packId, entries) {
    var camp = getActiveCampaign(); if (!camp || !camp.library || !gmHere()) return { error: 'No library here.' };
    var rev = nextRev(camp.library, packId); if (!rev) return { error: 'No such pack.' };
    var seen = map(); Object.keys(cur.packs).forEach(function(pid) { if (pid !== packId) cur.packs[pid].forEach(function(id) { seen[id] = 1; }); });
    var cp = cleanPack({ format: 'waypoint-pack', id: packId, rev: rev, entries: entries }, libCtx(camp.system, F(), true), seen); if (!cp) return { error: 'Not a pack.' };
    var body = JSON.stringify(cp.pack), res = null;
    try { res = await fetch('/api/library?dir=' + camp.library.dir + '&pack=' + packId + '&rev=' + rev, { method: 'POST', body: body }); } catch (e) { res = null; }
    if (!res || !res.ok) { if (res && res.status === 404) oldCore(); return { error: res && res.status === 413 ? 'That pack is too large (16 MB at most).' : 'The pack could not be written.' }; }
    var meta = packMeta(cp.pack.entries, libCtx(camp.system, F(), false), new Blob([body]).size);
    camp.library.packs.forEach(function(p) { if (p.id === packId) { p.rev = rev; p.count = meta.count; p.bytes = meta.bytes; p.hash = meta.hash; } });
    (cur.packs[packId] || []).forEach(function(id) { if (cur.byId[id]) { delete cur.byId[id]; cur.n--; } });
    cur.packs[packId] = cp.pack.entries.map(function(e) { return e.id; });
    cp.pack.entries.forEach(function(e) { cur.byId[e.id] = e; cur.n++; });
    cur.campId = camp.id; cur.sig = manifestSig(camp); if (cur.state === 'none') cur.state = 'ready';
    save(true); after();
    return { ok: true, dropped: cp.dropped, reasons: cp.reasons };
}
async function createPack(name, wantId) {
    var camp = getActiveCampaign(); if (!camp || !gmHere()) return { error: 'No campaign here.' };
    var ap = addPack(camp.library, name, undefined, wantId); if (!ap) return { error: 'This campaign holds as many packs as it can.' };
    var had = camp.library; camp.library = ap.manifest;
    var r = await savePack(ap.id, []);
    if (r.error) { if (had) camp.library = had; else delete camp.library; return r; }   // nothing half made
    return { ok: true, id: ap.id };
}
async function deletePack(packId) {
    var camp = getActiveCampaign(); if (!camp || !camp.library || !gmHere()) return { error: 'No library here.' };
    var dir = camp.library.dir, m = removePack(camp.library, packId); if (!m) return { error: 'No such pack.' };
    var last = !m.packs.length; if (last) delete camp.library; else camp.library = m;   // the last pack gone: no library at all (the campaign as it was)
    (cur.packs[packId] || []).forEach(function(id) { if (cur.byId[id]) { delete cur.byId[id]; cur.n--; } }); delete cur.packs[packId]; cur.sig = manifestSig(camp);
    save(true); after();
    try { await fetch('/api/library?dir=' + dir + (last ? '' : '&pack=' + packId), { method: 'DELETE' }); } catch (e) {}   // its files go, the folder with the last (a backup keeps its own)
    return { ok: true };
}
// L2a: a pack's name, icon and who may see it — the manifest only (no file is written); saved, and the core worked out again (a GM-only
// pack's entries leave the players' view at once). { ok } or { error }
function setMeta(packId, meta) {
    var camp = getActiveCampaign(); if (!camp || !camp.library || !gmHere()) return { error: 'No library here.' };
    var m = setPackMeta(camp.library, packId, meta); if (!m) return { error: 'No such pack.' };
    camp.library = m; cur.sig = manifestSig(camp);
    save(true); after();
    return { ok: true };
}
// L2b (owner decision 3): the campaign's own items (System ▸ Items) move into the library's Items pack, automatically, on the GM's
// machine once the library is read (never with a pack unread, never while the System editor is open). A safety copy first — none, and
// nothing moves (tried again the next time). The entries are written to the pack; every row that carried an item then keeps a copy of
// it (libSnaps) before the items leave the system; the core is worked out again (formulas that name them read the same); one save.
// Idempotent: nothing but the tutorial's Firepot left, nothing to do; an item made later in the Items tab moves the next time
var ITEMS_PACK = 'p_items', KEEP_ITEMS = ['i_tut_firepot'], _migrating = false;
async function migrateItems(camp) {
    camp = camp || getActiveCampaign();
    if (_migrating || !camp || !camp.system || !gmHere() || cur.campId !== camp.id || (cur.state !== 'ready' && cur.state !== 'none')) return 0;
    var sm = document.getElementById('systemModal'); if (sm && sm.style.display === 'flex') return 0;   // a draft open: the next load
    if (!(camp.system.items || []).some(function(it) { return it && KEEP_ITEMS.indexOf(it.id) < 0; })) return 0;
    _migrating = true;
    try {
        var bk = null; try { bk = await fetch('/api/backup-now', { method: 'POST' }); } catch (e) { bk = null; }
        if (!bk || !bk.ok || getActiveCampaign() !== camp || cur.campId !== camp.id) return 0;   // no safety copy: nothing moves
        var taken = map(), inPack = map(); Object.keys(cur.byId).forEach(function(id) { taken[id] = 1; }); (cur.packs[ITEMS_PACK] || []).forEach(function(id) { inPack[id] = 1; });
        var plan = itemsToMove(camp.system, KEEP_ITEMS, taken, inPack, libCtx(camp.system, F(), true)); if (!plan.drop.length) return 0;
        if (plan.move.length) {
            if (!(camp.library && camp.library.packs.some(function(p) { return p.id === ITEMS_PACK; }))) { var cr = await createPack('Items', ITEMS_PACK); if (!cr || cr.error) return 0; }
            if (!ready(ITEMS_PACK)) return 0;
            var sv = await savePack(ITEMS_PACK, entriesOf(ITEMS_PACK).concat(plan.move)); if (!sv || !sv.ok) return 0;
            if (plan.move.some(function(e) { return !cur.byId[e.id]; })) return 0;   // every one must be in the library before any leaves the system
        }
        var gone = map(); plan.drop.forEach(function(id) { gone[id] = 1; });
        var sysAfter = Object.assign({}, camp.system, { items: (camp.system.items || []).filter(function(it) { return !(it && gone[it.id]); }) });
        libSnaps(sysAfter, camp.chars || {}, entryFor);   // every row that carried one keeps a copy of it, before the item leaves
        camp.system = (F() ? cleanSystem(sysAfter, { F: F(), gmView: true }) : null) || sysAfter;
        refreshCore(camp); save(true); after();
        if (plan.move.length) toast('The campaign\u2019s ' + plan.move.length + (plan.move.length === 1 ? ' item' : ' items') + ' moved into the library\u2019s \u201cItems\u201d pack (a safety copy was taken first).' + (plan.left.length ? ' ' + plan.left.length + ' stayed: an entry of the library already has the same id.' : ''));
        return plan.move.length;
    } finally { _migrating = false; }
}
// L1c2: an import's pack files copied beside the save — each cleaned like any pack read (never trusted as it came), written at the
// revision its campaign's manifest now pins; the manifest watch waits until they are all there, then the library is read again.
// jobs: [{ camp, uploads }], files: the zip's entries by name
var busy = 0;
async function importFiles(jobs, files) {
    busy++; var ok = 0, bad = 0;
    try {
        for (var j = 0; j < jobs.length; j++) {
            var camp = jobs[j].camp, ctx = libCtx(camp && camp.system, F(), true);
            for (var k = 0; k < jobs[j].uploads.length; k++) {
                var u = jobs[j].uploads[k], fe = files && Object.prototype.hasOwnProperty.call(files, u.from) ? files[u.from] : null;
                var rd = fe ? readPackFile(new TextDecoder().decode(fe.data), ctx) : null; if (!rd || rd.error || rd.pack.id !== u.pack) { bad++; continue; }
                rd.pack.rev = u.rev;
                var res = null; try { res = await fetch('/api/library?dir=' + u.dir + '&pack=' + u.pack + '&rev=' + u.rev, { method: 'POST', body: JSON.stringify(rd.pack) }); } catch (e) { res = null; }
                if (res && res.ok) ok++; else { bad++; if (res && res.status === 404) oldCore(); }
            }
        }
    } finally { busy--; }
    if (ok || bad) toast('Library packs copied: ' + ok + (bad ? ', ' + bad + ' could not be' : '') + '.');
    load(getActiveCampaign());
    return { ok: ok, bad: bad };
}
// A list's categories in the players' view (systemcore cleanSystem opts.libCats): the categories of the entries players may see (show) and of
// those only the GM may (hide: a GM-only pack's, a GM-only entry's) — the GM's machine only, the campaign on screen; null while a pack is
// unread (the players' view then keeps only its visible items' categories)
var _cats = { sig: null, v: null };
function catsFor(camp) {
    camp = camp || getActiveCampaign(); if (!camp || !gmHere()) return null;
    var packs = camp.library && Array.isArray(camp.library.packs) ? camp.library.packs : [];
    if (!packs.length) return { show: [], hide: [] };
    if (cur.campId !== camp.id || cur.state === 'loading' || packs.some(function(p) { return !p || !ready(p.id); })) return null;
    var sig = manifestSig(camp) + '|' + cur.n; if (_cats.sig === sig) return _cats.v;
    var show = map(), hide = map();
    packs.forEach(function(p) { entriesOf(p.id).forEach(function(e) { if (e && typeof e.category === 'string' && e.category) ((p.vis === 'gm' || e.vis === 'gm') ? hide : show)[e.category] = 1; }); });
    _cats = { sig: sig, v: { show: Object.keys(show), hide: Object.keys(hide) } };
    return _cats.v;
}
function entry(id) { var camp = getActiveCampaign(); return camp && cur.campId === camp.id && typeof id === 'string' && Object.prototype.hasOwnProperty.call(cur.byId, id) ? cur.byId[id] : null; }
// The lookup the sheets, the rows' copies and the wire use (owed review F4c3#2): an entry of a GM-only pack reads as GM-only — a copy marked
// vis 'gm', as keyIndex, the core and the players' index already count it — so a row given from it projects to its owner without its key or
// blast, cannot be thrown, and its key is never confirmed; the pack file and the Library window keep the entry's own vis (entry above)
var _gmCopy = { sig: null, pack: null, copies: null };
function entryFor(id) {
    var e = entry(id); if (!e || e.vis === 'gm') return e;
    var camp = getActiveCampaign(), packs = camp && camp.library && Array.isArray(camp.library.packs) ? camp.library.packs : [];
    var sig = manifestSig(camp) + '|' + cur.n + '|' + packs.map(function(p) { return p.vis === 'gm' ? 'g' : 'a'; }).join('');
    if (_gmCopy.sig !== sig) { var pk = map(); Object.keys(cur.packs).forEach(function(pid) { cur.packs[pid].forEach(function(eid) { pk[eid] = pid; }); }); _gmCopy = { sig: sig, pack: pk, copies: map() }; }
    var pid = _gmCopy.pack[id], p = null; packs.forEach(function(x) { if (x && x.id === pid) p = x; });
    if (!p || p.vis !== 'gm') return e;
    return _gmCopy.copies[id] || (_gmCopy.copies[id] = Object.assign({}, e, { vis: 'gm' }));
}
function entriesOf(packId) { return (cur.packs[packId] || []).map(function(id) { return cur.byId[id]; }).filter(Boolean); }
// L2a: a pack read for the campaign on screen (made, written or loaded): one still loading or unreadable is not, so nothing writes over it
function ready(packId) { var camp = getActiveCampaign(); return !!camp && cur.campId === camp.id && typeof packId === 'string' && Object.prototype.hasOwnProperty.call(cur.packs, packId); }
// L3: the library as players see it — for each pack they may see, its entries in the players' view (librarycore playerIndex), worked out
// once per pack revision and players' fields; the manifest they get (visible packs, counted and hashed on that view: no folder, no
// revision, no GM-only pack); an entry of it by id. The GM's machine only, the campaign on screen, packs it has read
var _pidx = map();
function plSysOf(camp) { try { return window.wpSheets && window.wpSheets.playerSystem ? window.wpSheets.playerSystem(camp) : null; } catch (e) { return null; } }
function playerIndexOf(packId, plSys) {
    var camp = getActiveCampaign(); if (!camp || !camp.library || !gmHere() || !ready(packId)) return null;
    var p = camp.library.packs.filter(function(x) { return x.id === packId; })[0]; if (!p || p.vis === 'gm') return null;
    plSys = plSys || plSysOf(camp); var fields = plSys && Array.isArray(plSys.fields) ? plSys.fields : [];
    var sig = camp.id + '|' + p.rev + '|' + hashText(JSON.stringify(fields)), m = _pidx[packId]; if (m && m.sig === sig) return m;
    var ix = playerIndex(entriesOf(packId), libCtx({ fields: fields }, F(), false)); ix.sig = sig; _pidx[packId] = ix;
    return ix;
}
function playerManifest() {
    var camp = getActiveCampaign(); if (!camp || !gmHere() || cur.campId !== camp.id || cur.state === 'loading') return null;
    var pl = plSysOf(camp), packs = [];
    (camp.library ? camp.library.packs : []).forEach(function(p) { var ix = playerIndexOf(p.id, pl); if (!ix) return; var o = { id: p.id, name: p.name, count: ix.rows.length, hash: ix.hash }; if (p.icon) o.icon = p.icon; packs.push(o); });
    return { campId: camp.id, packs: packs };
}
function playerEntry(id) {
    var camp = getActiveCampaign(); if (!camp || !camp.library || typeof id !== 'string') return null; var pl = plSysOf(camp);
    for (var i = 0; i < camp.library.packs.length; i++) { var ix = playerIndexOf(camp.library.packs[i].id, pl); if (ix && Object.prototype.hasOwnProperty.call(ix.byId, id)) return ix.byId[id]; }
    return null;
}
setLibraryFind(entryFor);
// the campaign on screen, or its manifest, changed (a load, a switch, a restore): read it again
setInterval(function() { if (busy) return; var camp = getActiveCampaign(), sig = manifestSig(camp); if (sig !== cur.sig || (camp ? camp.id : null) !== cur.campId) load(camp); }, 1000);

window.wpLibrary = { load: load, entry: entry, entryFor: entryFor, entriesOf: entriesOf, size: function() { return cur.n; }, state: function() { return cur.state; }, error: function() { return cur.error; }, savePack: savePack, createPack: createPack, deletePack: deletePack, importFiles: importFiles, importPlan: libImportPlan, refreshCore: refreshCore, syncSnaps: syncSnaps, ready: ready, setMeta: setMeta, migrateItems: migrateItems, playerIndexOf: playerIndexOf, playerManifest: playerManifest, catsFor: catsFor, playerEntry: playerEntry };
