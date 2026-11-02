/* A campaign's safety net, the pure half (1.6.0; the owner, 2026-10-26: "save backups would be nice if you run a campaign to test
   something but dont want to make it a permanent save change", and by prompt: "best of all options combo"). Three ways in, all the GM's:
     a restore point    a snapshot of the save (saves/backups, as Settings takes one), from which ONE campaign can be rolled back;
     a trial run        a restore point taken as it begins; ending it keeps the changes or puts the campaign back as it was;
     a test copy        the campaign copied whole as "Name (test)", its library packs into a folder of its own.
   What the save keeps of them sits at the top of the save, never in a campaign (so no export of a campaign carries it):
     restorePts  { <snapshot file>: { camp, kind: 'point' | 'trial' | 'before', at } }   which campaign a point was made for, and why
     trials      { <campaign id>: { file, at } }                                         a trial run under way, by campaign
   Rolling back reads the snapshot through the static /saves/backups/ path (as cleanup.js does), runs it through the load's normaliser,
   and takes that one campaign from it. A library pack the snapshot pins may be gone from disk (a pack keeps its newest five revisions): it
   is read from the snapshot's own copy of the library and written back as a new revision. No DOM, no state: Node runs it (campsafecheck
   in systemcheck). Published as window.wpCampSafeCore. */

import { stepLine } from './steplog.js';   // the one format every feature's step log writes

var VERSION = 1;
var BACKUP_FILE = /^(data|keep)-[A-Za-z0-9_-]+\.json$/;   // the shell's own rule for a snapshot's name (reqguard BACKUP_NAME)
var CAMP_ID = /^[A-Za-z0-9_-]{1,80}$/;
var KINDS = ['point', 'trial', 'before'];
var LIMITS = { notes: 200, rows: 60 };
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function stamp(v) { return typeof v === 'number' && isFinite(v) && v > 0 && v < 1e14 ? Math.floor(v) : 0; }

// The save's notes of the restore points: a snapshot's name, the campaign it was made for, why, when. Anything else is dropped, and only
// the newest LIMITS.notes stay
function cleanNotes(raw) {
    var out = Object.create(null); if (!isObj(raw)) return out;
    var rows = Object.keys(raw).filter(function(f) { return BACKUP_FILE.test(f) && isObj(raw[f]) && typeof raw[f].camp === 'string' && CAMP_ID.test(raw[f].camp) && KINDS.indexOf(raw[f].kind) >= 0 && stamp(raw[f].at) > 0; });
    rows.sort(function(a, b) { return stamp(raw[b].at) - stamp(raw[a].at); }).slice(0, LIMITS.notes).forEach(function(f) { out[f] = { camp: raw[f].camp, kind: raw[f].kind, at: stamp(raw[f].at) }; });
    return out;
}
// The trial runs under way, by campaign: the snapshot taken as each began
function cleanTrials(raw) {
    var out = Object.create(null); if (!isObj(raw)) return out;
    Object.keys(raw).forEach(function(id) { var t = raw[id]; if (CAMP_ID.test(id) && isObj(t) && typeof t.file === 'string' && BACKUP_FILE.test(t.file) && stamp(t.at) > 0) out[id] = { file: t.file, at: stamp(t.at) }; });
    return out;
}

// What a snapshot is called in the list: a point made for this campaign by its kind, else by how the save took it
function pointLabel(row, notes, campId) {
    var n = row && notes && own(notes, row.file) ? notes[row.file] : null;
    if (n && n.camp === campId) return n.kind === 'trial' ? 'Start of a trial run' : n.kind === 'before' ? 'Before a roll back' : 'Restore point';
    if (/before-restore/.test(row.file)) return 'Before a restore';
    return /^data-/.test(row.file) ? 'At launch' : 'Taken by hand';
}
// The snapshots the dialog lists, newest first: the server's list ({ file, size, at }) kept to good names, each with its words. At most
// LIMITS.rows
function pointRows(list, notes, campId) {
    return (Array.isArray(list) ? list : []).filter(function(r) { return isObj(r) && typeof r.file === 'string' && BACKUP_FILE.test(r.file) && stamp(r.at) > 0; })
        .sort(function(a, b) { return stamp(b.at) - stamp(a.at); }).slice(0, LIMITS.rows)
        .map(function(r) { return { file: r.file, at: stamp(r.at), label: pointLabel(r, notes, campId), mine: !!(notes && own(notes, r.file) && notes[r.file].camp === campId) }; });
}

// A rolled-back campaign's library against what is on disk now. snapLib: the snapshot campaign's manifest ({ dir, packs: [{ id, rev }] });
// have: { packId: [revisions on disk now] } of that folder. A pack whose revision is still on disk is kept as it is; one whose revision is
// gone is written back from the snapshot's copy as a revision past every one on disk, and the manifest pins that one. A pack never
// written (revision 0) needs nothing. { manifest, uploads: [{ pack, from, to }] }, or null for no library
function libRepair(snapLib, have) {
    if (!isObj(snapLib) || typeof snapLib.dir !== 'string' || !Array.isArray(snapLib.packs)) return null;
    var man = JSON.parse(JSON.stringify(snapLib)), uploads = [], h = isObj(have) ? have : {};
    man.packs.forEach(function(p) {
        if (!isObj(p) || typeof p.id !== 'string' || typeof p.rev !== 'number' || !(p.rev > 0)) return;
        var revs = Array.isArray(h[p.id]) ? h[p.id].filter(function(r) { return typeof r === 'number' && isFinite(r); }) : [];
        if (revs.indexOf(p.rev) >= 0) return;
        var to = Math.min(1e9, Math.max.apply(null, revs.concat([p.rev])) + 1);
        uploads.push({ pack: p.id, from: p.rev, to: to }); p.rev = to;
    });
    return { manifest: man, uploads: uploads };
}

// A test copy of a campaign: the whole campaign as it is, under a new id and name, its library in a new folder (the packs at the revisions
// it pins, copied there). The original is never touched. { camp, uploads: [{ pack, rev, fromDir, toDir }] }
function testCopy(camp, newId, newName, newDir) {
    if (!isObj(camp) || typeof newId !== 'string' || !CAMP_ID.test(newId)) return null;
    var c = JSON.parse(JSON.stringify(camp)), uploads = [];
    c.id = newId; c.name = typeof newName === 'string' && newName ? newName : (camp.name || 'Campaign') + ' (test)';
    if (isObj(c.library) && typeof c.library.dir === 'string' && Array.isArray(c.library.packs)) {
        var from = c.library.dir;
        if (typeof newDir !== 'string' || !newDir) delete c.library;
        else { c.library.dir = newDir; c.library.packs.forEach(function(p) { if (isObj(p) && typeof p.id === 'string' && typeof p.rev === 'number' && p.rev > 0) uploads.push({ pack: p.id, rev: p.rev, fromDir: from, toDir: newDir }); }); }
    }
    return { camp: c, uploads: uploads };
}

// A new campaign that starts with another's system (1.6.2; the owner: "Use the system of", and of its handbook, a tick on by default): the system, its library
// at the revisions it pins and its fog settings, which name the system's fields, and with pages its handbook pages under the same ids, so that a sheet's
// links stay good. Never a map, a planner or a character. A page under something that does not come stands at the top
function systemCopy(src, newDir, pages) {
    if (!isObj(src) || !isObj(src.system)) return null;
    var c = JSON.parse(JSON.stringify(src)), out = { system: c.system, items: {}, uploads: [] };
    if (isObj(c.library) && typeof c.library.dir === 'string' && Array.isArray(c.library.packs) && typeof newDir === 'string' && newDir) {
        var from = c.library.dir; c.library.dir = newDir; out.library = c.library;
        c.library.packs.forEach(function(p) { if (isObj(p) && typeof p.id === 'string' && typeof p.rev === 'number' && p.rev > 0) out.uploads.push({ pack: p.id, rev: p.rev, fromDir: from, toDir: newDir }); });
    }
    if (isObj(c.fog)) out.fog = c.fog;
    if (pages === true && isObj(c.items)) {
        Object.keys(c.items).forEach(function(id) { var it = c.items[id]; if (isObj(it) && it.type === 'doc') out.items[id] = it; });
        Object.keys(out.items).forEach(function(id) { var m = out.items[id].meta; if (isObj(m) && m.parentId && !out.items[m.parentId]) delete m.parentId; });
    }
    return out;
}
// The GM's own campaigns that hold a system, the one on screen first: never a copy of someone else's table
function systemRows(camps, activeId) {
    var rows = Object.keys(isObj(camps) ? camps : {}).filter(function(id) { var c = camps[id]; return isObj(c) && !c._foreign && isObj(c.system) && Array.isArray(c.system.fields) && c.system.fields.length > 0; }).map(function(id) {
        var c = camps[id], its = isObj(c.items) ? c.items : {};
        return { id: id, name: typeof c.name === 'string' && c.name ? c.name : 'Campaign', pages: Object.keys(its).filter(function(k) { return isObj(its[k]) && its[k].type === 'doc'; }).length, here: id === activeId };
    });
    return rows.filter(function(r) { return r.here; }).concat(rows.filter(function(r) { return !r.here; }));
}

// The words a step of the safety net writes to the app's log (saves/error.log), one line a step: the step's name and the facts that say
// where it stood (snapshot names, counts, an HTTP status), never a campaign's name or anything of its content; the shared step log's words
function logLine(step, facts) { return stepLine('campsafe v' + VERSION, step, facts); }

var API = { VERSION: VERSION, BACKUP_FILE: BACKUP_FILE, LIMITS: LIMITS, cleanNotes: cleanNotes, cleanTrials: cleanTrials, pointLabel: pointLabel, pointRows: pointRows, libRepair: libRepair, testCopy: testCopy, systemCopy: systemCopy, systemRows: systemRows, logLine: logLine };
if (typeof window !== 'undefined') window.wpCampSafeCore = API;
export { VERSION, BACKUP_FILE, LIMITS, cleanNotes, cleanTrials, pointLabel, pointRows, libRepair, testCopy, systemCopy, systemRows, logLine };
