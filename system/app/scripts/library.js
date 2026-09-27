/* library.js — the GM machine's copy of the active campaign's item library (Stage 6, library L1c). The packs the campaign's
   manifest pins (camp.library) are read from the local server once the campaign is open on the GM's own machine — never at another's
   table: a player holds no library, only the copies the host puts on their rows — cleaned through librarycore and kept in memory by
   id, so rowDef (systemcore) and the host's projections read an entry at once. A pack is written as a new revision, then the manifest
   pins it and the save follows. An older Waypoint core has no library route (404): the library is then unavailable, said once.
   Pure rules live in librarycore.js (librarycheck); this file only fetches, holds and hands out. Build plan:
   docs/STAGE_6_LIBRARY_BUILD.md. */
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { libCtx, readPackFile, cleanPack, packMeta, manifestSig, addPack, removePack, nextRev, libImportPlan, setPackMeta, keyIndex } from './librarycore.js';
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
    var r = libSnaps(camp.system, camp.chars, entry); if (r.rows) save(true);
    return r.rows;
}
function after() {   // the sheets redraw; a host's players get their rows' copies from the library now in memory
    try { refreshCore(); } catch (e) { console.error(e); }
    try { syncSnaps(); } catch (e) { console.error(e); }
    try { if (window.wpSheetsSync) window.wpSheetsSync(); } catch (e) { console.error(e); }
    var n = window.wpNet; try { if (n && n.active && n.role === 'host' && n.syncChars) n.syncChars(); } catch (e) { console.error(e); }
}
async function load(camp) {
    camp = camp || getActiveCampaign();
    var m = camp && camp.library, mine = { campId: camp ? camp.id : null, sig: manifestSig(camp), byId: map(), packs: map(), n: 0, state: m && m.packs.length ? 'loading' : 'none', error: '' };
    cur = mine;
    if (!m || !m.packs.length || !gmHere()) { if (m && m.packs.length) mine.state = 'none'; return mine; }
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
async function createPack(name) {
    var camp = getActiveCampaign(); if (!camp || !gmHere()) return { error: 'No campaign here.' };
    var ap = addPack(camp.library, name); if (!ap) return { error: 'This campaign holds as many packs as it can.' };
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
function entry(id) { var camp = getActiveCampaign(); return camp && cur.campId === camp.id && typeof id === 'string' && Object.prototype.hasOwnProperty.call(cur.byId, id) ? cur.byId[id] : null; }
function entriesOf(packId) { return (cur.packs[packId] || []).map(function(id) { return cur.byId[id]; }).filter(Boolean); }
// L2a: a pack read for the campaign on screen (made, written or loaded): one still loading or unreadable is not, so nothing writes over it
function ready(packId) { var camp = getActiveCampaign(); return !!camp && cur.campId === camp.id && typeof packId === 'string' && Object.prototype.hasOwnProperty.call(cur.packs, packId); }
setLibraryFind(entry);
// the campaign on screen, or its manifest, changed (a load, a switch, a restore): read it again
setInterval(function() { if (busy) return; var camp = getActiveCampaign(), sig = manifestSig(camp); if (sig !== cur.sig || (camp ? camp.id : null) !== cur.campId) load(camp); }, 1000);

window.wpLibrary = { load: load, entry: entry, entriesOf: entriesOf, size: function() { return cur.n; }, state: function() { return cur.state; }, error: function() { return cur.error; }, savePack: savePack, createPack: createPack, deletePack: deletePack, importFiles: importFiles, importPlan: libImportPlan, refreshCore: refreshCore, syncSnaps: syncSnaps, ready: ready, setMeta: setMeta };
