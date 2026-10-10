/* Handouts and the Journal.
   GM side: a handout is an image from the campaign with a title and a caption. The GM shows it to
   the whole table or to one player, or attaches it to a room so a player whose token enters that
   room sees it ("you discovered this location"). Reveals are recorded on the campaign
   (camp.handouts, camp.handoutReveals) — GM bookkeeping that never ships in the snapshot.
   Player side: a revealed handout arrives as bytes over the data channel and is saved into the
   player's OWN saves folder (saves/images/journal/<campaignId>/), with the caption and their own
   notes, so the Journal works with no session and no GM online. Nothing here touches data.json
   on a player's machine. */
import { state } from './state.js';
import { net } from './net.js';
import { getActiveCampaign, getActiveMap } from './models.js';
import { save, toast, historyBarrier } from './io.js';
import { esc } from './inspector.js';
import { picRef } from './safecore.js';   // a handout's picture is the app's own (a web address from a file never loads)
import { fillLinked } from './linkgate.js';   // a web address in a text that is read is a link; whether a click on it asks first is decided there

// [netcheck:journal-start]
var ui = function(id) { return document.getElementById(id); };
var JOURNAL_DIR = 'images/journal';                 // under saves/ (the shell only writes inside images/)
var MAX_EDGE = 1600, JPEG_Q = 0.86, MAX_BYTES = 6 * 1024 * 1024;
var safeId = function(s) { return String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60); };

/* ================= player side: the Journal ================= */
function journalPath(campId, file) { return '/saves/' + JOURNAL_DIR + '/' + safeId(campId) + '/' + file; }
function lsKey(campId) { return 'journal_' + safeId(campId); }   // fallback store (no shell endpoint) — not a wp_ key, never mirrored

// An index is a file on disk (this app wrote it, but a saves folder can be copied from anywhere): what is read back is taken as data.
// Its rows are objects, its names are text, and it is the journal of the key it was read by, whatever it says of itself
function cleanIndex(j, campId) {
    j.entries = j.entries.filter(function(e) { return e && typeof e === 'object' && !Array.isArray(e); });
    ['gm', 'campaign', 'gmId'].forEach(function(k) { if (j[k] !== undefined && typeof j[k] !== 'string') j[k] = ''; });
    if (j.sentNotes !== undefined && (!j.sentNotes || typeof j.sentNotes !== 'object' || Array.isArray(j.sentNotes))) delete j.sentNotes;
    j.campId = campId;
    return j;
}
async function readIndex(campId) {
    try {
        var r = await fetch(journalPath(campId, 'journal.json'), { cache: 'no-store' });
        if (r.ok) { var j = await r.json(); if (j && Array.isArray(j.entries)) return cleanIndex(j, campId); }
    } catch (e) {}
    try { var l = localStorage.getItem(lsKey(campId)); if (l) { var lj = JSON.parse(l); if (lj && Array.isArray(lj.entries)) return cleanIndex(lj, campId); } } catch (e) {}
    return { campId: campId, gm: '', entries: [] };
}
async function writeIndex(campId, idx) {
    var body = JSON.stringify(idx), ok = false;
    try {
        var r = await fetch('/api/upload-exact?path=' + encodeURIComponent(JOURNAL_DIR + '/' + safeId(campId) + '/journal.json'), { method: 'POST', body: body });
        ok = r.ok;
    } catch (e) {}
    if (ok) { journalWrote(campId, body.length); try { localStorage.removeItem(lsKey(campId)); } catch (e) {} return true; }   // the file holds it: a copy here would only fill the browser's storage (readIndex never reaches it while the file is there)
    if (body.length <= 256 * 1024) { try { localStorage.setItem(lsKey(campId), body); ok = true; } catch (e) {} }   // no shell endpoint: the browser's storage keeps a small index
    return ok;
}
// Every change to a journal goes through one queue per campaign: read, change, write, in order.
// Two handouts arriving close together (replays come 0.4 s apart) used to read the same index and
// the later write dropped the earlier entry — and its notes with it, on the next replay.
var indexQueues = {};
// [netcheck:notesave-start]
// A note's save waits half a second after the last key. A redraw of the Journal inside that wait read the index from disk, where the typing
// was not yet written, and drew the older words, which the next key then saved over the new (the owed review, 2026-10-09). Every waiting
// save is kept with its own work, so that a redraw can run them all first
var noteTimers = {};
function noteLater(key, run) {
    if (noteTimers[key]) clearTimeout(noteTimers[key].t);
    var go = function() { if (noteTimers[key] && noteTimers[key].go === go) delete noteTimers[key]; return run(); };
    noteTimers[key] = { t: setTimeout(go, 500), go: go };
}
function flushNotes() {
    var waits = [];
    Object.keys(noteTimers).forEach(function(k) { var n = noteTimers[k]; delete noteTimers[k]; if (!n) return; clearTimeout(n.t); try { waits.push(Promise.resolve(n.go()).then(function() {}, function() {})); } catch (e) {} });   // a save that fails stops no other, and the redraw waits for every one
    return Promise.all(waits).then(function() {});
}
// [netcheck:notesave-end]
function withIndex(campId, change) {
    var prev = indexQueues[campId] || Promise.resolve();
    var next = prev.catch(function() {}).then(async function() {
        var idx = await readIndex(campId);
        var r = await change(idx);
        if (r !== false) { idx.updated = Date.now(); await writeIndex(campId, idx); }
        return idx;
    });
    indexQueues[campId] = next;
    return next;
}
async function putFile(campId, file, bytes, mime) {
    try {
        var r = await fetch('/api/upload-exact?path=' + encodeURIComponent(JOURNAL_DIR + '/' + safeId(campId) + '/' + file), { method: 'POST', headers: { 'Content-Type': mime }, body: bytes });
        if (r.ok) { if (_jDisk) _jDisk.n += bytes.length; return journalPath(campId, file); }
    } catch (e) {}
    // fallback: keep the picture inside the index as a data URL (small ones only)
    if (bytes.length > 1500000) return null;
    return await new Promise(function(res) { var fr = new FileReader(); fr.onload = function() { res(fr.result); }; fr.onerror = function() { res(null); }; fr.readAsDataURL(new Blob([bytes], { type: mime })); });
}
// What the Journal holds on this disk, every journal together: its pictures (the saves folder's own list) and each journal's index (its
// length, by a HEAD), measured at the first handout of a run and kept in step after that. What one run accepts from a table (the budgets
// below) starts afresh with every run of the app; this total does not — so a table that keeps sending, run after run or under a new
// campaign each time, stops filling the disk at the cap. Past it a handout is refused, said once a run, until pages are cleared.
// Your own notes are never refused.
var JOURNAL_DISK_MAX = 1024 * 1024 * 1024, JOURNAL_INDEX_MAX = 16 * 1024 * 1024, JOURNALS_MAX = 500;   // every journal together, in bytes; one journal's index, in characters; journals on one machine
var _jDisk = null, _jDiskP = null, _jFullSaid = false;
function journalDisk() {
    if (!_jDiskP) _jDiskP = (async function() {
        var d = { n: 0, idx: Object.create(null) };
        try { var imgs = await (await fetch('/api/list-images')).json(); (Array.isArray(imgs) ? imgs : []).forEach(function(i) { var sz = i ? Number(i.size) : 0; if (i && /^journal(\/|$)/.test(String(i.folder || '')) && sz > 0 && isFinite(sz)) d.n += sz; }); } catch (e) {}
        try {
            var keys = Object.keys(await readRegistry());
            for (var k = 0; k < keys.length; k++) {
                var len = 0;
                try { var h = await fetch(journalPath(keys[k], 'journal.json'), { method: 'HEAD', cache: 'no-store' }); if (h.ok) len = Number(h.headers.get('content-length')) || 0; } catch (e) {}
                d.idx[keys[k]] = len; d.n += len;
            }
        } catch (e) {}
        _jDisk = d;
    })();
    return _jDiskP;
}
// Is there room for this much more — bytes of picture on disk, characters into the journal's index?
function journalRoom(campId, bytes, chars) {
    var d = _jDisk; if (!d) return true;
    var key = safeId(campId);
    if (!(key in d.idx) && Object.keys(d.idx).length >= JOURNALS_MAX) return false;
    if ((d.idx[key] || 0) + chars > JOURNAL_INDEX_MAX) return false;
    return d.n + bytes + chars <= JOURNAL_DISK_MAX;
}
function journalFull() { if (_jFullSaid) return; _jFullSaid = true; toast('Your Journal on this computer is full. Nothing more is saved to it until you clear some pages: open the Journal and use Clear.'); }
function journalWrote(campId, len) { var d = _jDisk; if (!d) return; var key = safeId(campId); d.n += len - (d.idx[key] || 0); d.idx[key] = len; }
// A picture's type is read from its own first bytes, never from what the sender calls it: a PNG, a JPEG or a WebP, or it is no handout
function picKind(b) {
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return { mime: 'image/png', ext: 'png' };
    if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' };
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { mime: 'image/webp', ext: 'webp' };
    return null;
}
// The picture file of a journal page, by the page's own id and type — never the address the page carries
function entryFile(campId, en) {
    if (!en || typeof en !== 'object' || en.kind === 'text' || en.kind === 'note') return '';
    var id = safeId(en.id), ext = en.mime === 'image/png' ? 'png' : en.mime === 'image/webp' ? 'webp' : en.mime === 'image/jpeg' ? 'jpg' : '';
    return id && ext && safeId(campId) ? journalPath(campId, id + '.' + ext) : '';
}
// Pages removed from a journal take their picture files with them (the Journal's own word to the saves folder: only a page's picture
// under images/journal is ever deleted this way). The disk total is measured afresh at the next handout
async function dropEntryFiles(campId, entries) {
    var n = 0, list = Array.isArray(entries) ? entries : [];
    for (var i = 0; i < list.length; i++) {
        var p = entryFile(campId, list[i]); if (!p) continue;
        try { var r = await fetch('/api/delete-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p, journal: true }) }); if (r.ok) n++; } catch (e) {}
    }
    if (n) { _jDisk = null; _jDiskP = null; _jFullSaid = false; }
    return n;
}
// The picture a page may send on: the Journal's own — its file in this machine's journal folder, or the small picture kept inside the
// index — never any other address an index names (a planted index could name the save itself, and Send would hand it to the table)
function ownPicSrc(src) {
    if (typeof src !== 'string') return '';
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(src)) return src;
    return /^\/saves\/images\/journal\/[A-Za-z0-9_-]{1,60}\/[A-Za-z0-9_-]{1,60}\.(png|jpg|webp)$/.test(src) ? src : '';
}
// Registry of journals on this machine: a file beside them, mirrored in localStorage. (Scanning for
// pictures is not enough — a text-only handout has no picture file.)
async function readRegistry() {
    var keys = {};
    try { var r = await fetch('/saves/' + JOURNAL_DIR + '/journals.json', { cache: 'no-store' }); if (r.ok) { var j = await r.json(); (j.keys || []).forEach(function(k) { keys[safeId(k)] = true; }); } } catch (e) {}
    try { JSON.parse(localStorage.getItem('journal_registry') || '[]').forEach(function(k) { keys[safeId(k)] = true; }); } catch (e) {}
    delete keys['']; return keys;
}
async function registerJournal(key) {
    var keys = await readRegistry(); keys[safeId(key)] = true;
    var list = Object.keys(keys);
    try { await fetch('/api/upload-exact?path=' + encodeURIComponent(JOURNAL_DIR + '/journals.json'), { method: 'POST', body: JSON.stringify({ keys: list }) }); } catch (e) {}
    try { localStorage.setItem('journal_registry', JSON.stringify(list.slice(-200))); } catch (e) {}   // the 200 newest here; the file holds them all
}
// Every campaign that has a journal on this machine
async function listJournals() {
    var ids = await readRegistry();
    try {
        var imgs = await (await fetch('/api/list-images')).json();
        (imgs || []).forEach(function(i) { var m = /^journal\/([A-Za-z0-9_-]+)/.exec(i.folder || ''); if (m) ids[m[1]] = true; });
    } catch (e) {}
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('journal_') === 0 && k !== 'journal_registry') ids[k.slice(8)] = true; } } catch (e) {}
    var out = [];
    for (var id in ids) { var idx = await readIndex(id); if (idx.entries.length) out.push(idx); }
    out.sort(function(a, b) { return (b.updated || 0) - (a.updated || 0); });
    return out;
}

var unseen = 0;
function badge(n) { var b = ui('journalBadge'); if (!b) return; unseen = Math.max(0, n); b.textContent = unseen ? String(unseen) : ''; b.style.display = unseen ? 'block' : 'none'; }

// A handout arrived from the GM (validated here, never trusted as-is)
// One journal per campaign per GM: a campaign id can be copied between installs, a GM's id cannot
// Onboarding F0: what a player plays, by id (the character in play), else their old name binding
function playsOf(camp, pid, p) { var S = window.wpSystemCore; return (S && S.playsAs ? S.playsAs(camp, pid) : '') || (p && typeof p.charName === 'string' ? p.charName : ''); }
function journalKey(msg) { var c = safeId(msg.campId), g = safeId(msg.gmId); return c && g ? c + '__' + g : c; }
// FNV-1a over the picture bytes: enough to tell "the same picture again" from "a new picture"
function hashBytes(bytes) {
    var h = 0x811c9dc5;
    for (var i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16) + '-' + bytes.length.toString(16);
}
// The newest journal entry that came from handout <id> (the original or any later version) from the same sender — the GM ('') or one player by
// their exact id. Two players' shares under one id (a host cleaned 'u_x' and 'u_.x' alike once) never find each other's page: a page is replaced
// in place only by its own sender
function exactId(v) { return typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(v) ? v : ''; }
function sharerOf(msg) { return msg && msg.sharedBy ? (exactId(msg.sharedById) || null) : ''; }   // null: a named sender whose id is none or does not read. It matches no page, so each such share is a page of its own (it had read as the GM's, '')
// Who a received page came from, for the links in it (linkgate.js asks before one opens and says who): the GM — a handout, or a page the GM
// shared — or one player, by the name the Journal shows
function cameFrom(msg) { return !msg.sharedBy || (exactId(msg.sharedById) && exactId(msg.sharedById) === safeId(msg.gmId)) ? { gm: true } : { who: String(msg.sharedBy).slice(0, 60) }; }
function latestOf(idx, id, who) {
    var best = null; if (who === null) return null;   // who: '' for the GM's own page, which is one with no sender named; else the sender's exact id
    // never a page the player wrote themselves (the owed review, 2026-10-09): a note has no sender, so it read as the GM's, and a host that
    // sent a handout under a note's id replaced the player's own words with it
    idx.entries.forEach(function(e) { if (e.kind !== 'note' && (e.id === id || e.from === id) && (who === '' ? !e.sharedBy : e.sharedById === who) && (!best || (e.receivedAt || 0) > (best.receivedAt || 0))) best = e; });
    return best;
}
function idTaken(idx, id) { return idx.entries.some(function(e) { return e.id === id; }); }
function versionId(id) { return safeId(id).slice(0, 44) + '-v' + Date.now().toString(36); }
// A shared entry remembers who sent it and what they wrote under it
// Tags: short lowercase words, at most eight, from "faces, places" or an array
function tagList(v) {
    var arr = Array.isArray(v) ? v : String(v || '').split(/[,;]+/);
    var out = [], seen = {};
    arr.forEach(function(t) { t = String(t || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 24); if (t && !seen[t]) { seen[t] = true; out.push(t); } });
    return out.slice(0, 8);
}
function tagChips(tags, cls) { return (Array.isArray(tags) && tags.length) ? '<div class="tag-row">' + tags.map(function(t) { return '<span class="' + (cls || 'journal-tag') + '" data-tag="' + esc(t) + '" title="Show everything tagged ' + esc(t) + '">' + esc(t) + '</span>'; }).join('') + '</div>' : ''; }
function stampShared(en, msg) {
    en.tags = tagList(msg.tags);
    if (!msg.sharedBy) return;
    en.sharedBy = String(msg.sharedBy).slice(0, 60);
    en.sharedById = exactId(msg.sharedById);   // exactly as the host names the sender: cleaned, 'u_.x' would read as 'u_x'
    en.sharedNotes = String(msg.sharedNotes || '').slice(0, 20000);
}
function stampHead(idx, msg) {
    var g = safeId(msg.gmId);
    if (!idx.gmId) idx.gmId = g;   // set once: a journal is one GM's
    if (g && idx.gmId && g !== idx.gmId) return;   // a message naming another GM renames nothing here
    idx.gm = String(msg.gm || idx.gm || '').slice(0, 60); idx.campaign = String(msg.campaign || idx.campaign || '').slice(0, 120);
}
var _hoSaid = false, _shSaid = false;   // each budget's refusal is said once a run, not once per refused handout
var _hoCount = 0, _hoBytes = 0, _shCount = 0, _shBytes = 0;   // what one run of the app accepts from tables — the GM's handouts and, apart from them, the pages players share: a host that keeps sending fills no disk, and a player who keeps sharing never spends what the GM's handouts live on
function handoutBudget(msg) {
    var n = (msg && msg.data && msg.data.byteLength) || (msg && typeof msg.text === 'string' ? msg.text.length : 0) || 0;
    if (msg && typeof msg.sharedBy === 'string' && msg.sharedBy) {
        if (_shCount >= 200 || _shBytes + n > 100 * 1024 * 1024) { if (!_shSaid) { _shSaid = true; toast('Players are sharing more than this session can hold — the rest are skipped.'); } return false; }
        _shCount++; _shBytes += n; return true;
    }
    if (_hoCount >= 1000 || _hoBytes + n > 500 * 1024 * 1024) { if (!_hoSaid) { _hoSaid = true; toast('The GM is sending more handouts than this session can hold — the rest are skipped.'); } return false; }
    _hoCount++; _hoBytes += n; return true;
}
async function receiveHandout(msg) {
    var campId = journalKey(msg), id = safeId(msg.id);
    if (!campId || !id) return;
    if (!handoutBudget(msg)) return;
    await journalDisk();
    if (msg.kind === 'text') return receiveTextHandout(msg, campId, id);
    if (!(msg.data && msg.data.byteLength !== undefined)) return;
    var bytes = msg.data instanceof Uint8Array ? msg.data : new Uint8Array(msg.data);
    if (bytes.length > MAX_BYTES) return;
    var kind = picKind(bytes); if (!kind) return;   // bytes that are no picture are not stored under a picture's name, whatever the sender calls them
    var mime = kind.mime, ext = kind.ext;
    var title = String(msg.title || 'Handout').slice(0, 120), caption = String(msg.caption || '').slice(0, 4000);
    if (!journalRoom(campId, bytes.length, title.length + caption.length + 1024)) { journalFull(); return; }
    var hash = hashBytes(bytes);
    var existing, added = false, failed = false, src, shownId = id, stale = [];
    await withIndex(campId, async function(idx) {
        stampHead(idx, msg);
        existing = latestOf(idx, id, sharerOf(msg));
        if (existing && existing.hash === undefined) {
            // first time this entry meets a hash (journal from before versions): same picture assumed, file refreshed
            src = await putFile(campId, existing.id + '.' + ext, bytes, mime);
            if (!src) { failed = true; return false; }
            if (existing.mime && existing.mime !== mime) stale.push({ id: existing.id, mime: existing.mime });   // the file under its old type is no page's any more
            existing.hash = hash; existing.src = src; existing.mime = mime;
        }
        var hasNotes = existing && String(existing.notes || '').trim() !== '';
        if (existing && !hasNotes) {
            // nothing written on it yet: the latest replaces it, whatever changed
            if (existing.hash !== hash) {
                src = await putFile(campId, existing.id + '.' + ext, bytes, mime);
                if (!src) { failed = true; return false; }
                if (existing.mime && existing.mime !== mime) stale.push({ id: existing.id, mime: existing.mime });
                existing.hash = hash; existing.src = src; existing.mime = mime; added = true;
            } else src = existing.src;
            existing.title = title; existing.caption = caption; existing.updatedAt = Date.now(); existing.notes = '';
            stampShared(existing, msg);
            shownId = existing.id;
            return;
        }
        if (existing && existing.hash === hash && msg.replay) {
            // the same picture coming back on reconnect: refreshed quietly, the notes stay
            existing.title = title; existing.caption = caption; existing.updatedAt = Date.now();
            stampShared(existing, msg);
            src = existing.src; shownId = existing.id;
            return;
        }
        // first time, or a re-queue / re-show / new picture on top of a noted copy: a new entry of its own (under an id of its own where another sender's page holds this one)
        var nid = existing || idTaken(idx, id) ? versionId(id) : id;
        src = await putFile(campId, nid + '.' + ext, bytes, mime);
        if (!src) { failed = true; return false; }
        var en = { id: nid, title: title, caption: caption, src: src, mime: mime, hash: hash, receivedAt: Date.now(), notes: '' };
        if (existing) en.from = id;
        stampShared(en, msg);
        idx.entries.push(en); added = true; shownId = nid;
    });
    if (failed) { toast('The GM showed you something, but it could not be saved.'); return; }
    if (stale.length) await dropEntryFiles(campId, stale);
    await registerJournal(campId);
    if (msg.replay && !added) return;   // already in the journal, unchanged: refreshed, no fanfare
    badge(unseen + 1);
    if (handoutPopup()) showHandout({ title: title, caption: caption, src: src, fresh: true, entry: { campId: campId, id: shownId }, from: cameFrom(msg) });
    else toast((msg.sharedBy ? msg.sharedBy + ' shared' : 'New handout') + ': "' + (title || 'Handout') + '" — in your Journal.');
}
async function receiveTextHandout(msg, campId, id) {
    var title = String(msg.title || 'Handout').slice(0, 120), caption = String(msg.caption || '').slice(0, 4000);
    var text = String(msg.text || '').slice(0, 60000);
    if (!journalRoom(campId, 0, text.length + title.length + caption.length + 1024)) { journalFull(); return; }
    var existing, added = false, shownId = id;
    await withIndex(campId, function(idx) {
        stampHead(idx, msg);
        existing = latestOf(idx, id, sharerOf(msg));
        var hasNotes = existing && String(existing.notes || '').trim() !== '';
        if (existing && !hasNotes) {
            // nothing written on it yet: the latest replaces it, whatever changed
            if (String(existing.text || '') !== text) added = true;
            existing.title = title; existing.caption = caption; existing.kind = 'text'; existing.text = text; existing.updatedAt = Date.now(); existing.notes = '';
            stampShared(existing, msg);
            shownId = existing.id;
            return;
        }
        if (existing && String(existing.text || '') === text && msg.replay) {
            // the same words coming back on reconnect: refreshed quietly, the notes stay
            existing.title = title; existing.caption = caption; existing.kind = 'text'; existing.updatedAt = Date.now();
            stampShared(existing, msg);
            shownId = existing.id;
            return;
        }
        // first time, or a re-queue / re-show / changed text on top of a noted copy: a new entry of its own (under an id of its own where another sender's page holds this one)
        var en = { id: existing || idTaken(idx, id) ? versionId(id) : id, kind: 'text', title: title, caption: caption, text: text, receivedAt: Date.now(), notes: '' };
        if (existing) en.from = id;
        stampShared(en, msg);
        idx.entries.push(en); added = true; shownId = en.id;
    });
    await registerJournal(campId);
    if (msg.replay && !added) return;
    badge(unseen + 1);
    if (handoutPopup()) showHandout({ title: title, caption: caption, text: text, fresh: true, entry: { campId: campId, id: shownId }, from: cameFrom(msg) });
    else toast((msg.sharedBy ? msg.sharedBy + ' shared' : 'New handout') + ': "' + (title || 'Handout') + '" — in your Journal.');
}
window.wpJournalReceive = receiveHandout;
// [netcheck:journal-end]

/* ---------- the viewer (used for a fresh reveal and from the journal) ---------- */
// [sinkcheck:viewer-start]
// Whose the shown thing is, kept on the viewer for the links in it (linkgate.js reads it at a click). from: { own: true } — yours (your own
// note, your own handout's preview): its links open directly; { gm: true } — it came from the GM; { who: name } — from a player. Anything
// else is not known to be yours either: a link in it asks first.
function viewerFrom(m, from) {
    var f = from && typeof from === 'object' ? from : {}, own = f.own === true, gm = !own && f.gm === true;
    m.dataset.linksOwn = own ? '1' : '';
    m.dataset.linksGm = gm ? '1' : '';
    m.dataset.linksWho = !own && !gm && typeof f.who === 'string' ? f.who.slice(0, 60) : '';
}
// The text and the caption are plain text. Where they are read, a web address in them is a link whose text is the address itself
// (fillLinked: text nodes and <a> elements, never markup); the stream window shows the words alone — nobody clicks there.
function showHandout(h) {
    var m = ui('handoutModal'); if (!m) return;
    viewerFrom(m, h.from);
    var linked = !window.wpStream;
    ui('handoutTitle').textContent = h.title || 'Handout';
    var im = ui('handoutImg'), tx = ui('handoutText');
    var hSrc = picRef(h.src);
    if (hSrc) { im.src = /^(data:|blob:)/.test(hSrc) ? hSrc : encodeURI(hSrc); im.style.display = 'block'; } else { im.removeAttribute('src'); im.style.display = 'none'; }
    if (tx) { if (linked) fillLinked(tx, h.text || '', document); else tx.textContent = h.text || ''; tx.style.display = h.text ? 'block' : 'none'; }
    var cp = ui('handoutCaption');
    if (linked) fillLinked(cp, h.caption || '', document); else cp.textContent = h.caption || '';
    cp.style.display = h.caption ? 'block' : 'none';
    ui('handoutFresh').style.display = h.fresh ? 'flex' : 'none';
    var nw = ui('handoutNotesWrap'), nt = ui('handoutNotes');
    viewerEntry = h.entry || null;
    if (nw && nt) {
        nw.style.display = viewerEntry ? 'flex' : 'none';
        nt.value = '';
        if (viewerEntry) readIndex(viewerEntry.campId).then(function(idx) {
            var en = idx.entries.find(function(x) { return x.id === viewerEntry.id; });
            if (en && viewerEntry === (h.entry || null)) nt.value = en.notes || '';
        });
    }
    m.style.display = 'flex';
}
var viewerEntry = null, viewerNoteTimer = null;
// [sinkcheck:viewer-end]
var _hNotes = ui('handoutNotes');
if (_hNotes) {
    _hNotes.addEventListener('keydown', function(e) { e.stopPropagation(); });
    _hNotes.addEventListener('input', function() {
        if (!viewerEntry) return;
        var en = viewerEntry, val = _hNotes.value;
        // keep the journal list's box in step if it is open behind the viewer
        var row = document.querySelector('.journal-entry[data-camp="' + en.campId + '"][data-id="' + en.id + '"] .journal-notes');
        if (row && row.value !== val) row.value = val;
        noteLater('viewer:' + en.campId + '/' + en.id, function() {
            return withIndex(en.campId, function(idx) {
                var x = idx.entries.find(function(y) { return y.id === en.id; });
                if (!x) return false;
                x.notes = val.slice(0, 20000);
            });
        });
    });
}
var _hJournal = ui('handoutOpenJournalBtn');
if (_hJournal) _hJournal.addEventListener('click', function() { ui('handoutModal').style.display = 'none'; openJournal(); });
var _hClose = ui('handoutCloseBtn');
if (_hClose) _hClose.addEventListener('click', function() { ui('handoutModal').style.display = 'none'; });

/* ---------- the Journal window ---------- */
// [sinkcheck:journal-start]
// The journal the window shows (the owner, by prompt, 2026-10-07: "A. One campaign at a time"): a journal's key, or 'personal'. The window
// opens on the journal of the campaign on screen, and the name in its title is a list of the others. Of the notebook that belongs to no
// campaign the owner said: "personal notes can transcend campaigns then and be available from each campaign as they are and as they update.
// they will be the only exception". So Personal notes is a tab of every journal, the same notebook each time, and a journal of its own
var journalAt = '';
// The journal of the campaign on screen: the GM's own campaign, or the table this app sits at (one journal per campaign per GM)
function journalHere() {
    var n = window.wpNet, own = ownCampaignKey();
    if (own) return { key: own.key, campaign: String(own.camp.name || '').slice(0, 120), gmId: n.myId, mine: true };
    if (!n || !(n.foreign || (n.active && n.role === 'client'))) return null;
    var camp = typeof getActiveCampaign === 'function' ? getActiveCampaign() : null, key = camp && n.gmId ? journalKey({ campId: camp.id, gmId: n.gmId }) : '';
    return key ? { key: key, campaign: String(camp.name || '').slice(0, 120), gmId: safeId(n.gmId), mine: false } : null;
}
function journalName(j) { return j.campaign || (j.campId === 'personal' ? 'Personal notes' : 'Campaign'); }
// The picker in the window's title: the journal of the campaign on screen, then the others, then Personal notes. Its options are made as
// elements with text: a campaign's or a GM's name read from an index on disk is never markup here
function journalPickFill(journals, here) {
    var sel = ui('journalPick'); if (!sel || typeof document.createElement !== 'function') return;
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    var me = window.wpNet ? window.wpNet.myId : '';
    var group = function(label, items) {
        if (!items.length) return;
        var g = document.createElement('optgroup'); g.label = label;
        items.forEach(function(j) {
            var o = document.createElement('option'); o.value = j.campId;
            o.textContent = journalName(j) + (j.gm && j.gmId !== me && !/^gm$/i.test(String(j.gm).trim()) ? ', run by ' + j.gm : '');
            g.appendChild(o);
        });
        sel.appendChild(g);
    };
    group('This campaign', journals.filter(function(j) { return !!here && j.campId === here.key; }));
    group('Your other journals', journals.filter(function(j) { return j.campId !== 'personal' && !(here && j.campId === here.key); }));
    group('Across every campaign', journals.filter(function(j) { return j.campId === 'personal'; }));
    sel.value = journalAt;
}
async function openJournal(keep) {   // keep (true only): drawn again where it stands, after a note was added or a page removed. Else it opens on the campaign on screen
    var m = ui('journalModal'); if (!m) return;
    if (typeof flushNotes === 'function') await flushNotes();   // what was typed in the last half second is on disk before the rows are drawn from it
    m.style.display = 'flex';
    badge(0);
    var list = ui('journalList');
    list.innerHTML = '<div style="color:var(--dim); padding:14px;">Loading your journal…</div>';
    var journals = await listJournals();
    var here = journalHere();
    // The campaign on screen always has its journal, empty or not, under the name the campaign has now. The GM's own is the GM's
    if (here) {
        var hj = journals.filter(function(j) { return j.campId === here.key; })[0];
        if (!hj) {   // not listed, so it holds no page yet. Only the GM's own can still hold something: the notes written under what was shown
            hj = here.mine && sentRecords(here.key).length ? await readIndex(here.key) : { campId: here.key, gm: '', entries: [] };
            hj.campId = here.key; hj.entries = hj.entries || []; hj.updated = hj.updated || 0; journals.push(hj);
        }
        if (here.campaign) hj.campaign = here.campaign;
        if (here.mine) { hj.gm = ''; hj.gmId = here.gmId; } else if (!hj.gmId) hj.gmId = here.gmId;
    }
    // Personal notes is always there: a tab of every journal, and a journal of its own
    var pj = journals.filter(function(j) { return j.campId === 'personal'; })[0];
    if (!pj) { pj = { campId: 'personal', campaign: 'Personal notes', gm: '', entries: [] }; journals.push(pj); }
    var nPersonal = pj.entries.filter(function(e) { return e.kind === 'note'; }).length;
    var rank = function(j) { return here && j.campId === here.key ? 0 : j.campId === 'personal' ? 2 : 1; };   // this campaign, the others as they were listed, Personal notes
    journals = journals.map(function(j, i) { return { j: j, i: i }; }).sort(function(a, b) { return rank(a.j) - rank(b.j) || a.i - b.i; }).map(function(x) { return x.j; });
    var has = function(k) { return !!k && journals.some(function(j) { return j.campId === k; }); };
    if (!(keep === true && has(journalAt))) journalAt = here ? here.key : has(journalAt) ? journalAt : journals[0].campId;
    list.innerHTML = journals.map(function(j) {
        var personal = j.campId === 'personal';
        var iRunIt = !!(j.gmId && window.wpNet && j.gmId === window.wpNet.myId);   // my own campaign: nothing here is "from the GM"
        var sent = iRunIt ? sentRecords(j.campId) : [];
        var page = personal ? 'mine' : (journalPage[j.campId] || journalDefaultPage());
        var runBy = j.gm && !iRunIt && !/^gm$/i.test(j.gm.trim()) ? ' <span style="color:var(--dim); font-weight:normal; font-size:11px;">run by ' + esc(j.gm) + '</span>' : '';
        // inbox: everything received (the GM's handouts, other players' shares); own pages are the rest
        var inbox = j.entries.filter(function(e) { return e.kind !== 'note'; });
        var nMine = j.entries.length - inbox.length;
        // sent: players from each entry's sentTo, the GM from the delivery log — one record per send
        var mySent = [];
        j.entries.forEach(function(e) { (Array.isArray(e.sentTo) ? e.sentTo : []).forEach(function(t) { if (!t || typeof t !== 'object') return; mySent.push({ e: e, to: t.to, name: t.name, at: Number(t.at) || 0 }); }); });   // from the index on disk: a time is a number, a row an object
        mySent.sort(function(a, b) { return b.at - a.at; });
        var nSent = sent.length + mySent.length, nAll = j.entries.length + nSent;
        function tab(id, label, count, title) { return '<button class="tool ghost journal-tab' + (page === id ? ' active' : '') + '" data-tab="' + id + '" title="' + title + '">' + label + ' <span class="journal-count">' + count + '</span></button>'; }
        var tabs = personal ? '' : '<span class="journal-tabs">'
            + tab('all', 'Journal', nAll, 'Everything — your own pages, what you received and what you sent — newest first')
            + tab('mine', 'My notes', nMine, 'Your own pages')
            + tab('inbox', 'Inbox', inbox.length, iRunIt ? 'Pages players shared with you' : 'Handouts from the GM and pages other players shared with you')
            + tab('sent', 'Sent', nSent, iRunIt ? 'Every handout you have shown, to whom and when' : 'Every page you have shared, with whom and when')
            + tab('personal', 'Personal notes', nPersonal, 'Your notes that belong to no campaign. It is the same notebook in every journal.') + '</span>';
        var inTag = ' <span class="journal-in">' + esc(journalName(j)) + '</span>';   // the row's own campaign, shown while a search takes in every journal
        // people: who sent you things (From) and whom you sent things (To)
        var senders = Object.create(null), recips = Object.create(null);   // keyed by ids from the index: no inherited name is ever a sender
        function bump(map, id, name, n) { if (!id) return; var m = map[id] || (map[id] = { id: id, name: name || id, n: 0 }); if (name && (m.name === id || !m.name)) m.name = name; m.n += (n || 1); }
        // who a received page is from: the GM (a handout, or a page the GM shared) or one player
        var fromOf = function(e) { return !e.sharedBy || (e.sharedById && e.sharedById === j.gmId) ? 'gm' : (e.sharedById || e.sharedBy); };
        var fromName = function(e) { return fromOf(e) === 'gm' ? 'GM' : e.sharedBy; };
        // whose a row's page is, for the links in it once it is opened to be read: your own note, the GM's (a handout, a page the GM shared, the table's notepad a player saved), or a player's by name
        var whose = function(e) { return e.kind === 'note' && e.table !== true ? ' data-mine="1"' : e.kind === 'note' || fromOf(e) === 'gm' ? ' data-gm="1"' : ' data-who="' + esc(String(e.sharedBy || '').slice(0, 60)) + '"'; };
        inbox.forEach(function(e) { bump(senders, fromOf(e), fromOf(e) === 'gm' ? 'GM' : e.sharedBy); });
        sent.forEach(function(s) { var once = {}; s.to.forEach(function(t) { if (once[t.pid]) return; once[t.pid] = true; bump(recips, t.pid, t.name); }); });
        mySent.forEach(function(s) { bump(recips, s.to, s.to === '*' ? 'Everyone at once' : s.to === 'gm' ? 'GM' : s.name); });
        // the Journal page separates by kind: my notes / received / sent
        var kinds = { mine: { id: 'mine', name: 'My notes', n: nMine }, inbox: { id: 'inbox', name: 'Received', n: inbox.length }, sent: { id: 'sent', name: 'Sent', n: nSent } };
        var show = journalShow[j.campId] !== undefined ? journalShow[j.campId] : journalShowDefault(), from = chipOpensTo('inbox', j.campId, senders), to = chipOpensTo('sent', j.campId, recips);
        function chips(forKey, label, items, current, attr, allLabel, allCount, keepOrder) {
            var list = Object.values(items); if (!list.length) return '';
            if (!keepOrder) list.sort(function(a, b) { return a.id === 'gm' ? -1 : b.id === 'gm' ? 1 : a.id === '*' ? 1 : b.id === '*' ? -1 : String(a.name).localeCompare(String(b.name)); });
            return '<div class="journal-from-row" data-for="' + forKey + '"><span class="journal-chip-label">' + label + '</span>'
                + '<button class="journal-from' + (!current ? ' active' : '') + '" data-for="' + forKey + '" data-' + attr + '="">' + allLabel + ' <span class="journal-count">' + allCount + '</span></button>'
                + list.map(function(p) { return '<button class="journal-from' + (current === p.id ? ' active' : '') + '" data-for="' + forKey + '" data-' + attr + '="' + esc(p.id) + '">' + esc(p.name) + ' <span class="journal-count">' + p.n + '</span></button>'; }).join('') + '</div>';
        }
        function clearBtn(scope, label, title) { return '<button class="tool ghost danger journal-clear" data-scope="' + scope + '" title="' + title + '">' + label + '</button>'; }
        var chipRows = personal
            ? '<div class="journal-from-row" data-for="mine">' + clearBtn('mine', 'Clear my notes', 'Delete every page of your own in this section') + '</div>'
            : chips('all', 'Show', kinds, show, 'show', 'Everything', nAll, true).replace(/<\/div>$/, clearBtn('all', 'Clear journal', 'Empty this campaign\'s journal on this computer') + '</div>')
              + (inbox.length ? chips('inbox', 'From', senders, from, 'from', 'Anyone', inbox.length).replace(/<\/div>$/, clearBtn('inbox', 'Clear', 'Remove what is listed here — everything received, or only the chosen sender\'s') + '</div>') : '')
              + chips('sent', 'To', recips, to, 'to', 'Anyone', nSent)
              + '<div class="journal-from-row" data-for="mine">' + clearBtn('mine', 'Clear my notes', 'Delete every page of your own in this campaign') + '</div>';
        var mySentRows = mySent.map(function(s) {
            var e = s.e, kind = e.kind === 'note' || e.kind === 'text' ? 'text' : 'image', text = e.text || '';
            var thumb = kind === 'text' ? '<div class="journal-thumb journal-thumb-text" title="Open">' + esc(String(text).slice(0, 160)) + '</div>' : '<img class="journal-thumb" src="' + esc(picRef(e.src)) + '" alt="" title="Open">';
            return '<div class="journal-entry journal-sentrow" data-page="sent" data-to="' + esc(s.to) + '" data-camp="' + esc(j.campId) + '" data-id="sent:' + esc(e.id) + ':' + esc(s.at) + '" data-kind="' + kind + '" data-sent="1"' + whose(e) + (kind === 'text' ? ' data-text="' + esc(String(text)) + '"' : '') + '>' + thumb +
                '<div class="journal-body"><div class="journal-title">' + esc(e.title || (e.kind === 'note' ? 'A note' : 'Handout')) + '</div>' + (e.caption ? '<div class="journal-caption">' + esc(e.caption) + '</div>' : '') +
                '<div class="journal-when">Sent to <b>' + esc(s.to === 'gm' ? 'GM' : s.to === '*' ? 'everyone at once' : s.name) + '</b> <span style="opacity:.7;">' + new Date(s.at).toLocaleString() + '</span>' + (e.kind !== 'note' && e.notes ? ' · with your notes' : '') + inTag + '</div>' +
                '<textarea class="journal-notes" placeholder="Your notes about this send…">' + esc((j.sentNotes || {})['sent:' + e.id + ':' + s.at] || '') + '</textarea></div></div>';
        }).join('');
        var head = '<div class="journal-camp"><b>' + esc(journalName(j)) + '</b>' + runBy + tabs + ' <button class="tool ghost journal-add" data-camp="' + esc(j.campId) + '" title="Write a page of your own">+ Note</button></div>';
        var entries = j.entries.slice().sort(function(a, b) { return (b.receivedAt || 0) - (a.receivedAt || 0); }).map(function(e) {
            if (e.kind === 'note') {
                return '<div class="journal-entry journal-own" data-page="mine" data-camp="' + esc(j.campId) + '" data-id="' + esc(e.id) + '" data-kind="note"' + whose(e) + '>' +
                    '<div class="journal-body">' +
                    '<div style="display:flex; gap:6px; align-items:center;"><input class="field journal-note-title" value="' + esc(e.title || '') + '" placeholder="Title"><button class="tool ghost journal-open" title="Open this note to read it: a web address in it is a link there" style="padding:2px 8px;">Open</button><button class="tool ghost danger journal-del" title="Delete this note" style="padding:2px 8px;">&times;</button></div>' +
                    '<textarea class="journal-notes journal-note-body" placeholder="Write…">' + esc(e.text || '') + '</textarea>' +
                    '<div class="journal-when">' + new Date(e.receivedAt || 0).toLocaleString() + ' · your note' + inTag + '</div>' + sentLine(e) + shareControls() + '</div></div>';
            }
            var thumb = e.kind === 'text'
                ? '<div class="journal-thumb journal-thumb-text" title="Open">' + esc(String(e.text || '').slice(0, 160)) + '</div>'
                : '<img class="journal-thumb" src="' + esc(picRef(e.src)) + '" alt="" title="Open">';
            return '<div class="journal-entry" data-page="inbox" data-from="' + esc(fromOf(e)) + '" data-camp="' + esc(j.campId) + '" data-id="' + esc(e.id) + '" data-kind="' + esc(e.kind || 'image') + '"' + whose(e) + (e.kind === 'text' ? ' data-text="' + esc(String(e.text || '')) + '"' : '') + '>' + thumb +
                '<div class="journal-body"><div class="journal-title" style="display:flex; align-items:center; gap:6px;"><span style="flex:1;">' + esc(e.title || 'Handout') + '</span><button class="tool ghost danger journal-del" title="Remove this from your journal (the sender keeps theirs)" style="padding:2px 8px;">&times;</button></div>' +
                (e.caption ? '<div class="journal-caption">' + esc(e.caption) + '</div>' : '') + tagChips(e.tags) +
                '<div class="journal-when">' + new Date(e.receivedAt || 0).toLocaleString() + (e.from ? ' · updated version — the earlier one is kept below' : '') + ' · from <b>' + esc(fromName(e)) + '</b>' + inTag + '</div>' +
                (e.sharedBy && e.sharedNotes ? '<div class="journal-shared"><div class="journal-shared-who">' + esc(fromOf(e) === 'gm' ? 'The GM' : e.sharedBy) + ' wrote</div>' + esc(e.sharedNotes) + '</div>' : '') +
                '<textarea class="journal-notes" placeholder="Your notes about this…">' + esc(e.notes || '') + '</textarea>' + sentLine(e) + shareControls() + '</div></div>';
        }).join('');
        var empty = (!nAll && !personal ? '<div class="journal-empty" data-page="all">' + (iRunIt ? 'Nothing in this journal yet. What you show your players is listed here, and + Note writes a page of your own.' : 'Nothing in this journal yet. What a GM shows you is kept here with its caption, and + Note writes a page of your own. It stays on this computer and works without a session.') + '</div>' : '')
                  + (!nMine ? '<div class="journal-empty" data-page="mine">No pages of your own here yet — press + Note.</div>' : '')
                  + (!inbox.length && !personal ? '<div class="journal-empty" data-page="inbox">' + (iRunIt ? 'Nothing shared with you yet.' : 'Nothing received yet.') + '</div>' : '')
                  + (!nSent && !personal ? '<div class="journal-empty" data-page="sent">' + (iRunIt ? 'Nothing shown to the players yet.' : 'Nothing sent yet — while in a session, pick "Share with…" on any page.') + '</div>' : '');
        var sentRows = sent.map(function(s) {
            var thumb = s.kind === 'text' ? '<div class="journal-thumb journal-thumb-text" title="Open">' + esc(String(s.text || '').slice(0, 160)) + '</div>'
                      : picRef(s.src) ? '<img class="journal-thumb" src="' + esc(picRef(s.src)) + '" alt="" title="Open">' : '<div class="journal-thumb journal-thumb-text">(removed)</div>';
            return '<div class="journal-entry journal-sentrow" data-page="sent" data-to="' + esc(s.to.map(function(t) { return t.pid || ''; }).join(' ')) + '" data-camp="' + esc(j.campId) + '" data-id="sent:' + esc(s.hid) + '" data-kind="' + (s.kind === 'text' ? 'text' : 'image') + '" data-sent="1" data-mine="1"' + (s.kind === 'text' ? ' data-text="' + esc(String(s.text || '')) + '"' : '') + '>' + thumb +
                '<div class="journal-body"><div class="journal-title">' + esc(s.title) + '</div>' + (s.caption ? '<div class="journal-caption">' + esc(s.caption) + '</div>' : '') + tagChips(s.tags) +
                '<div class="journal-when">Shown to ' + s.to.map(function(t) { return esc(t.name) + ' <span style="opacity:.7;">' + new Date(t.at).toLocaleString() + '</span>'; }).join(', ') + inTag + '</div>' +
                '<textarea class="journal-notes" placeholder="Your notes about this handout…">' + esc((j.sentNotes || {})['sent:' + s.hid] || '') + '</textarea></div></div>';
        }).join('');
        return '<div class="journal-section' + (here && j.campId === here.key ? ' here' : '') + '" data-camp="' + esc(j.campId) + '" data-page="' + page + '" data-show="' + esc(show) + '" data-from="' + esc(from) + '" data-to="' + esc(to) + '">' + head + chipRows + empty + sentRows + mySentRows + entries + '</div>';
    }).join('');
    journalPickFill(journals, here);
    journalFilter();
}
// [sinkcheck:journal-end]
// Search: forgiving rather than literal. Every word of the query has to be found somewhere in the
// entry (any order), a word matches by prefix ("sel" finds Selkath), accents and punctuation are
// ignored, and a word of four letters or more survives one typo (two from eight letters up).
function normWords(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}
function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
        cur = [i]; var rowMin = i;
        for (j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev[j - 1] + 1);   // swapped letters
            if (cur[j] < rowMin) rowMin = cur[j];
        }
        if (rowMin > max) return max + 1;
        prev = cur;
    }
    return prev[b.length];
}
// crude stemming so "trials" meets "trial" and "dismissed" meets "dismiss"
function stem(w) {
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /(ed|es)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
}
// How well one query word is found among an entry's words: 0 = not at all
function wordScore(term, words) {
    var slack = term.length >= 8 ? 2 : term.length >= 4 ? 1 : 0, best = 0, ts = stem(term);
    for (var i = 0; i < words.length; i++) {
        var w = words[i], s;
        if (w === term) return 10;                                                         // the very word
        if (stem(w) === ts) s = 9;                                                         // same word, other ending
        else if (w.indexOf(term) === 0) s = 8;                                             // prefix ("sel" → selkath)
        else if (term.length >= 3 && w.indexOf(term) > 0) s = 5;                           // inside a longer word
        else if (slack && editDistance(term, w.length > term.length + slack ? w.slice(0, term.length + slack) : w, slack) <= slack) s = 6;   // a typo or two
        else s = 0;
        if (s > best) best = s;
    }
    return best;
}
// "Share with…" + Send on every entry, for a player in a session: one party member, everyone, or the GM
// [sinkcheck:journalshare-start]
function sentLine(e, inner) {
    var to = e && Array.isArray(e.sentTo) ? e.sentTo.filter(function(t) { return t && typeof t === 'object'; }) : [];
    var s = to.length ? 'Sent to ' + to.slice().reverse().map(function(t) { return esc(t.name) + ' <span style="opacity:.7;">' + new Date(Number(t.at) || 0).toLocaleString() + '</span>'; }).join(', ') : '';
    return inner ? s : '<div class="journal-when journal-sent">' + s + '</div>';
}
function shareControls() {
    var n = window.wpNet; if (!(n && n.active && (n.role === 'client' || n.role === 'host'))) return '';
    var others = Object.values(n.roster || {}).filter(function(p) { return p && p.id && p.id !== n.myId; });
    if (n.role === 'host' && !others.length) return '';
    var opts = '<option value="">Share with…</option>' + (others.length ? '<option value="*">Everyone in the party</option>' : '') + (n.role === 'host' ? '' : '<option value="gm">GM</option>') +
        others.map(function(p) { return '<option value="' + esc(p.id) + '">' + esc(p.name || p.id) + '</option>'; }).join('');
    return '<div class="journal-share-row"><select class="journal-share" title="Send this page, with your notes, to someone at the table">' + opts + '</select><button class="tool ghost journal-share-send" disabled>Send</button></div>';
}
async function shareEntry(campId, id, to, btn) {
    var idx = await readIndex(campId);
    var e = idx.entries.find(function(x) { return x.id === id; }); if (!e) return;
    var entry;
    if (e.kind === 'note') entry = { id: e.id, kind: 'text', title: e.title || 'A note', caption: '', text: e.text || '', notes: '', tags: e.tags || [] };
    else if (e.kind === 'text') entry = { id: e.id, kind: 'text', title: e.title || 'Handout', caption: e.caption || '', text: e.text || '', notes: e.notes || '', tags: e.tags || [] };
    else {
        var bytes = null;
        var eSrc = ownPicSrc(picRef(e.src));   // only the Journal's own picture is ever read and sent
        try { var r = eSrc ? await fetch(/^data:/.test(eSrc) ? eSrc : encodeURI(eSrc), { cache: 'no-store' }) : null; if (r && r.ok) bytes = new Uint8Array(await r.arrayBuffer()); } catch (err) {}
        if (!bytes || !bytes.length) { toast('That picture could not be read from your journal.'); return; }
        entry = { id: e.id, kind: 'image', title: e.title || 'Handout', caption: e.caption || '', mime: e.mime || 'image/jpeg', data: bytes, notes: e.notes || '', tags: e.tags || [] };
    }
    if (window.wpNet.shareEntry({ to: to, entry: entry })) {
        var who = to === '*' ? 'everyone in the party' : to === 'gm' ? 'GM' : ((Object.values(window.wpNet.roster || {}).find(function(p) { return p && p.id === to; }) || {}).name || 'them');
        toast('"' + (entry.title || 'Note') + '" sent to ' + who + '.');
        await withIndex(campId, function(idx) {
            var x = idx.entries.find(function(y) { return y.id === id; }); if (!x) return false;
            x.sentTo = (Array.isArray(x.sentTo) ? x.sentTo : []).concat([{ to: to, name: who, at: Date.now() }]).slice(-40);
        });
        var line = document.querySelector('.journal-entry[data-camp="' + campId + '"][data-id="' + id + '"] .journal-sent');
        if (line) line.innerHTML = sentLine(await readIndex(campId).then(function(ix) { return ix.entries.find(function(y) { return y.id === id; }); }), true);
    }
    if (btn) { btn.disabled = true; var s = btn.parentNode.querySelector('.journal-share'); if (s) s.value = ''; }
}
// [sinkcheck:journalshare-end]
// [sinkcheck:journalnote-start]
// Save a page of text (the table notepad) to the journal: the campaign's section for a player, the GM's own
window.wpJournalAddNote = async function(meta, title, text) {
    var n = window.wpNet, key;
    if (n && n.role === 'host') { var own = ownCampaignKey(); key = own ? own.key : 'personal'; }
    else key = journalKey(meta || {}) || 'personal';
    var id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    var theirs = atSomeonesTable();   // a player saving the table's notepad: the page is theirs to keep and edit, its words came from the GM — a link in it asks first (table: true, kept on this machine only)
    await withIndex(key, function(idx) {
        if (key === 'personal') idx.campaign = idx.campaign || 'Personal notes';
        else if (meta && meta.campaign) stampHead(idx, meta);
        var en = { id: id, kind: 'note', title: String(title || '').slice(0, 120), text: String(text || '').slice(0, 60000), receivedAt: Date.now(), notes: '' };
        if (theirs) en.table = true;
        idx.entries.push(en);
    });
    await registerJournal(key);
    badge(unseen + 1);
    toast('Saved to your Journal as "' + String(title || 'Note').slice(0, 60) + '".');
};
// Is this app a player at someone's table (the campaign in memory came from a host)?
function atSomeonesTable() { var n = window.wpNet; return !!(n && (n.foreign || (n.active && n.role === 'client'))); }
// [sinkcheck:journalnote-end]
// The GM's own campaign, keyed the way players' journals key it (campaign id + GM id)
function ownCampaignKey() {
    var n = window.wpNet; if (!n || !n.myId || n.foreign || (n.active && n.role === 'client')) return null;
    var camp = getActiveCampaign(); if (!camp) return null;
    return { key: safeId(camp.id) + '__' + safeId(n.myId), camp: camp };
}
// What the GM has shown from this campaign, newest first: read from the reveal record on the save
function sentRecords(key) {
    var own = ownCampaignKey(); if (!own || own.key !== key) return [];
    var camp = own.camp, rev = camp.handoutReveals || {}, hs = camp.handouts || {}, by = {}, seen = {};
    function nameOf(pid, fallback) { var pl = (camp.players || {})[pid]; return pl && pl.name ? pl.name : (fallback || pid); }
    function add(hid, pid, name, at) {
        var k = hid + '|' + pid + '|' + at; if (seen[k]) return; seen[k] = true;
        var r = by[hid] || (by[hid] = { hid: hid, to: [], last: 0 });
        r.to.push({ name: name, at: at, pid: pid }); if (at > r.last) r.last = at;
    }
    (camp.handoutLog || []).forEach(function(l) { if (l && l.hid) add(l.hid, l.pid, nameOf(l.pid, l.name), l.at || 0); });
    Object.keys(rev).forEach(function(pid) { Object.keys(rev[pid] || {}).forEach(function(hid) { add(hid, pid, nameOf(pid), rev[pid][hid]); }); });
    return Object.values(by).map(function(r) {
        var h = hs[r.hid] || {};
        r.title = h.title || '(removed handout)'; r.caption = h.caption || ''; r.kind = h.kind || 'image'; r.text = h.text || ''; r.src = h.src || ''; r.tags = h.tags || [];
        r.to.sort(function(a, b) { return b.at - a.at; });
        return r;
    }).sort(function(a, b) { return b.last - a.last; });
}
var journalPage = {};   // page chosen per campaign in this window
var journalFrom = {};   // party member chosen on the From the party page, per campaign
var journalTo = {};     // recipient chosen on the Sent page, per campaign
var journalShow = {};   // kind chosen on the Journal page (my notes / received / sent), per campaign
function journalShowDefault() { try { var p = localStorage.getItem('wp_journalShow'); return p === 'mine' || p === 'inbox' || p === 'sent' ? p : ''; } catch (e) { return ''; } }
// An arriving handout: open it at once (default) or only mark the Journal
function handoutPopup() { try { return localStorage.getItem('wp_handoutArrive') !== 'quiet'; } catch (e) { return true; } }
// Which chip a page opens to: All, the GM, or the one picked last time (Settings: wp_inboxOpens / wp_sentOpens)
function chipOpensTo(which, campId, items) {
    var mem = which === 'inbox' ? journalFrom : journalTo;
    if (mem[campId] !== undefined) return items[mem[campId]] ? mem[campId] : '';
    var pref = 'all'; try { pref = localStorage.getItem(which === 'inbox' ? 'wp_inboxOpens' : 'wp_sentOpens') || 'all'; } catch (e) {}
    if (pref === 'gm' && items.gm) return 'gm';
    if (pref === 'remember') { try { var last = localStorage.getItem('journal_' + which + 'Last_' + campId) || ''; if (items[last]) return last; } catch (e) {} }
    return '';
}
// [sinkcheck:journalfilter-start]
// What a look at the window takes in. One journal is shown at a time (journalAt). With its Personal notes tab in front, the one notebook
// that spans every campaign stands in that journal's place, under the journal's own head. A search reads what is shown, or every journal
function journalScope(list, every) {
    var secs = Array.prototype.slice.call(list.querySelectorAll('.journal-section'));
    var at = secs.filter(function(s) { return s.dataset.camp === journalAt; })[0] || null;
    var pers = at && at.dataset.camp !== 'personal' && at.dataset.page === 'personal' ? secs.filter(function(s) { return s.dataset.camp === 'personal'; })[0] || null : null;
    return { at: at, pers: pers, shown: function(s) { return every || s === at || s === pers; }, read: function(s) { return every || (pers ? s === pers : s === at); } };
}
// Does this row belong on the page its section is showing?
function onPage(row) {
    var sec = row.closest('.journal-section'); if (!sec) return true;
    var page = sec.dataset.page || 'all', rp = row.dataset.page, isEmpty = row.className.indexOf('journal-empty') >= 0;
    var has = function(list, id) { return (' ' + (list || '') + ' ').indexOf(' ' + id + ' ') >= 0; };
    if (page === 'all') {
        var show = sec.dataset.show || '';
        if (isEmpty) return rp === 'all';   // the one line of a journal that holds nothing yet
        return !show || rp === show;
    }
    if (page === 'inbox') { var from = sec.dataset.from || ''; return rp === 'inbox' && (isEmpty || !from || row.dataset.from === from); }
    if (page === 'sent') { var to = sec.dataset.to || ''; return rp === 'sent' && (isEmpty || !to || has(row.dataset.to, to)); }
    return rp === page;
}
function journalDefaultPage() { try { var p = localStorage.getItem('wp_journalPage'); if (p === 'gm' || p === 'party') p = 'inbox'; return p === 'inbox' || p === 'sent' || p === 'mine' ? p : 'all'; } catch (e) { return 'all'; } }
window.wpJournalDefaultPage = journalDefaultPage;
function journalFilter() {
    var box = ui('journalSearch'), list = ui('journalList'); if (!box || !list) return;
    var terms = normWords(box.value);
    var q = terms.length, phrase = terms.join(' ');
    var allBox = ui('journalAll'), every = q > 0 && !!(allBox && allBox.checked === true), sc = journalScope(list, every);
    list.classList.toggle('searching', q > 0);   // a search looks across both pages
    list.classList.toggle('everywhere', every);   // it takes in every journal: each row then names its campaign
    var scored = [];
    list.querySelectorAll('.journal-entry').forEach(function(row, i) { if (!row.dataset.i) row.dataset.i = String(i + 1); });   // the rendered (date) order, to come back to
    if (!q) {
        list.querySelectorAll('.journal-section').forEach(function(sec) {
            Array.prototype.slice.call(sec.querySelectorAll('.journal-entry')).sort(function(a, b) { return +a.dataset.i - +b.dataset.i; }).forEach(function(r) { sec.appendChild(r); });
        });
    }
    list.querySelectorAll('.journal-empty').forEach(function(el) { el.style.display = !q && onPage(el) ? '' : 'none'; });
    list.querySelectorAll('.journal-from-row').forEach(function(el) { el.style.display = !q && el.parentNode.dataset.page === el.dataset.for ? '' : 'none'; });
    list.querySelectorAll('.journal-entry').forEach(function(row) {
        if (!q) { row.style.display = onPage(row) ? '' : 'none'; return; }
        if (!sc.read(row.closest('.journal-section'))) { row.style.display = 'none'; return; }   // a search reads what is shown, and nothing else
        var hay = row.textContent + ' ' + (row.dataset.text || '');
        row.querySelectorAll('input, textarea').forEach(function(f) { hay += ' ' + f.value; });
        var words = normWords(hay), hit = 0, score = 0;
        terms.forEach(function(t) { var s = wordScore(t, words); if (s) hit++; score += s; });
        if (q > 1 && (' ' + words.join(' ') + ' ').indexOf(' ' + phrase + ' ') >= 0) score += 100;   // the exact wording, first
        else if (hit === q) score += 40;                                                             // every word, in any order
        var ok = hit === q || (q >= 3 && hit >= Math.ceil(q * 0.6));                                 // or most of the words when there are several
        row.style.display = ok ? '' : 'none';
        if (ok) scored.push({ row: row, score: score });
    });
    // best matches first inside each section (rows are moved, not re-rendered, so typed notes are safe)
    if (q) {
        var groups = {};
        scored.forEach(function(s) { var sec = s.row.parentNode; var k = sec.dataset.k || (sec.dataset.k = 'g' + Math.random()); (groups[k] = groups[k] || []).push(s); });
        Object.keys(groups).forEach(function(k) {
            var g = groups[k].slice().sort(function(a, b) { return b.score - a.score; });
            var sec = g[0].row.parentNode;
            g.forEach(function(s) { sec.appendChild(s.row); });
        });
    }
    list.querySelectorAll('.journal-section').forEach(function(sec) {
        var any = !q || Array.prototype.some.call(sec.querySelectorAll('.journal-entry'), function(r) { return r.style.display !== 'none'; });
        sec.classList.toggle('as-tab', sec === sc.pers && !every);
        sec.style.display = sc.shown(sec) && (any || sec === sc.at) ? '' : 'none';   // the journal shown keeps its head and its tabs when a search finds nothing in it
    });
}
// [sinkcheck:journalfilter-end]
var _jSearch = ui('journalSearch');
if (_jSearch) {
    _jSearch.addEventListener('input', journalFilter);
    _jSearch.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Escape') { _jSearch.value = ''; journalFilter(); } });
}
var _jBtn = ui('journalBtn');
if (_jBtn) _jBtn.addEventListener('click', function() { openJournal(); });   // opened by its button: on the campaign on screen
// The picker: another journal of this computer, or Personal notes. Nothing is read again, since every journal is drawn and one is shown
var _jPick = ui('journalPick');
if (_jPick) {
    _jPick.addEventListener('change', function() {
        var list = ui('journalList'), v = _jPick.value; if (!list) return;
        if (Array.prototype.some.call(list.querySelectorAll('.journal-section'), function(s) { return s.dataset.camp === v; })) journalAt = v; else _jPick.value = journalAt;
        journalFilter(); list.scrollTop = 0;
    });
    _jPick.addEventListener('keydown', function(e) { e.stopPropagation(); });
}
var _jAll = ui('journalAll');
if (_jAll) { _jAll.addEventListener('change', journalFilter); _jAll.addEventListener('keydown', function(e) { e.stopPropagation(); }); }
var _jClose = ui('journalCloseBtn');
if (_jClose) _jClose.addEventListener('click', function() { ui('journalModal').style.display = 'none'; });
// [sinkcheck:journalopen-start]
// A row of the Journal opened to be read — a click on its thumbnail, or on a note's Open. The viewer is told whose the page is, as the row
// says (openJournal wrote that from the index): your own, the GM's, or a player's by name; a row that says nothing is not known to be yours.
function rowFrom(r) { return r.dataset.mine === '1' ? { own: true } : r.dataset.gm === '1' ? { gm: true } : r.dataset.who ? { who: r.dataset.who } : null; }
function openRow(target) {
    var op = target.closest && target.closest('.journal-open');
    if (op) {   // a note of your own, opened to be read: what its boxes hold right now
        var rowN = op.closest('.journal-entry'); if (!rowN) return;
        showHandout({ title: (rowN.querySelector('.journal-note-title') || {}).value || 'A note', caption: '', src: null, text: (rowN.querySelector('.journal-note-body') || {}).value || '', from: rowFrom(rowN) });
        return;
    }
    var t = target.closest && target.closest('.journal-thumb'); if (!t) return;
    var row = t.closest('.journal-entry');
    if (row.dataset.sent) {
        showHandout({ title: row.querySelector('.journal-title').textContent, caption: (row.querySelector('.journal-caption') || {}).textContent || '', src: row.dataset.kind === 'text' ? null : t.getAttribute('src'), text: row.dataset.kind === 'text' ? row.dataset.text : '', from: rowFrom(row) });
        return;
    }
    var base = { title: row.querySelector('.journal-title').textContent.replace(/\s*\u00d7\s*$/, '').trim(), caption: (row.querySelector('.journal-caption') || {}).textContent || '', entry: { campId: row.dataset.camp, id: row.dataset.id }, from: rowFrom(row) };
    if (row.dataset.kind === 'text') {
        readIndex(row.dataset.camp).then(function(idx) { var en = idx.entries.find(function(x) { return x.id === row.dataset.id; }); showHandout(Object.assign(base, { text: en ? en.text : '' })); });
    } else showHandout(Object.assign(base, { src: t.getAttribute('src') }));
}
// [sinkcheck:journalopen-end]
var _jList = ui('journalList');
if (_jList) {
    _jList.addEventListener('click', function(e) {
        var tg = e.target.closest && e.target.closest('.journal-tag');
        if (tg) { var sb = ui('journalSearch'); if (sb) { sb.value = tg.dataset.tag; journalFilter(); sb.focus(); } return; }
        openRow(e.target);
    });
    _jList.addEventListener('input', function(e) {
        var ta = e.target.closest && e.target.closest('.journal-notes'); if (!ta || ta.classList.contains('journal-note-body')) return;
        var row = ta.closest('.journal-entry'), campId = row.dataset.camp, id = row.dataset.id, val = ta.value;
        if (viewerEntry && viewerEntry.campId === campId && viewerEntry.id === id && _hNotes && _hNotes.value !== val) _hNotes.value = val;
        noteLater(campId + '/' + id, function() {
            return withIndex(campId, function(idx) {
                if (row.dataset.sent) { idx.sentNotes = idx.sentNotes || {}; if (val.trim()) idx.sentNotes[id] = val.slice(0, 20000); else delete idx.sentNotes[id]; return; }
                var en = idx.entries.find(function(x) { return x.id === id; });
                if (!en) return false;
                en.notes = val.slice(0, 20000);
            });
        });
    });
    _jList.addEventListener('keydown', function(e) { e.stopPropagation(); });
    _jList.addEventListener('change', function(e) {
        var s = e.target.closest && e.target.closest('.journal-share'); if (!s) return;
        var b = s.parentNode.querySelector('.journal-share-send'); if (b) b.disabled = !s.value;
    });
    // own notes: add / edit / delete
    _jList.addEventListener('click', async function(e) {
        var sendB = e.target.closest && e.target.closest('.journal-share-send');
        if (sendB) {
            var rowS = sendB.closest('.journal-entry'), selS = sendB.parentNode.querySelector('.journal-share');
            if (!rowS || !selS || !selS.value) return;
            shareEntry(rowS.dataset.camp, rowS.dataset.id, selS.value, sendB);
            return;
        }
        var tab = e.target.closest && e.target.closest('.journal-tab');
        if (tab) {
            var secT = tab.closest('.journal-section'); if (!secT) return;
            journalPage[secT.dataset.camp] = tab.dataset.tab;
            secT.dataset.page = tab.dataset.tab;
            secT.querySelectorAll('.journal-tab').forEach(function(b) { b.classList.toggle('active', b === tab); });
            journalFilter();
            return;
        }
        var clr = e.target.closest && e.target.closest('.journal-clear');
        if (clr) {
            var secC = clr.closest('.journal-section'); if (!secC) return;
            var campC = secC.dataset.camp, scope = clr.dataset.scope, fromC = secC.dataset.from || '';
            var fromChip = fromC ? Array.prototype.filter.call(secC.querySelectorAll('.journal-from[data-for="inbox"]'), function(c) { return !!c.dataset && c.dataset.from === fromC; })[0] || null : null;   // by its own value: a sender keyed by a name that holds a quote made the selector no selector, and Clear did nothing (the owed review, 2026-10-09)
            var fromName = fromChip ? fromChip.textContent.replace(/\s*\d+\s*$/, '').trim() : '';
            var idxC = await readIndex(campC), campName = idxC.campaign || (campC === 'personal' ? 'Personal notes' : 'this campaign');
            var senderOf = function(x) { return !x.sharedBy || (x.sharedById && x.sharedById === idxC.gmId) ? 'gm' : (x.sharedById || x.sharedBy); };
            var goes = idxC.entries.filter(function(x) {
                if (scope === 'all') return true;
                if (scope === 'mine') return x.kind === 'note';
                return x.kind !== 'note' && (!fromC || senderOf(x) === fromC);
            });
            if (!goes.length) { toast('Nothing to clear there.'); return; }
            // spell out what goes: counts by kind, and who sent them
            var nH = goes.filter(function(x) { return x.kind !== 'note' && !x.sharedBy; }).length, nS = goes.filter(function(x) { return x.sharedBy; }).length, nN = goes.filter(function(x) { return x.kind === 'note'; }).length;
            var nNotes = goes.filter(function(x) { return x.kind !== 'note' && String(x.notes || '').trim(); }).length, nSent = goes.reduce(function(a, x) { return a + ((x.sentTo || []).length); }, 0);
            var parts = [];
            if (nH) parts.push(nH + ' handout' + (nH === 1 ? '' : 's') + ' from the GM');
            if (nS) { var who = {}; goes.forEach(function(x) { if (x.sharedBy) who[x.sharedBy] = true; }); parts.push(nS + ' shared page' + (nS === 1 ? '' : 's') + ' from ' + Object.keys(who).join(', ')); }
            if (nN) parts.push(nN + ' page' + (nN === 1 ? '' : 's') + ' of your own');
            var what = scope === 'all' ? 'the whole journal for ' + campName : scope === 'mine' ? 'your own pages in ' + campName : fromC ? 'everything from ' + fromName + ' in the inbox for ' + campName : 'the whole inbox for ' + campName;
            var msg = 'Clear ' + what + '?\n\nThis removes ' + goes.length + ' item' + (goes.length === 1 ? '' : 's') + ': ' + parts.join('; ') + '.'
                + (nNotes ? '\nYour notes under ' + nNotes + ' of them go too.' : '')
                + (nSent ? '\nYour sent record for ' + nSent + ' send' + (nSent === 1 ? '' : 's') + ' goes too.' : '')
                + '\n\nThis computer only. Senders keep their copies, and the GM can show a handout again.';
            if (!confirm(msg)) return;
            var goneC = [];
            await withIndex(campC, function(idx) {
                var before = idx.entries;
                if (scope === 'all') idx.entries = [];
                else if (scope === 'mine') idx.entries = idx.entries.filter(function(x) { return x.kind !== 'note'; });
                else idx.entries = idx.entries.filter(function(x) { return x.kind === 'note' || (fromC ? senderOf(x) !== fromC : false); });
                goneC = before.filter(function(x) { return idx.entries.indexOf(x) < 0; });
            });
            await dropEntryFiles(campC, goneC);   // the pages' picture files go with them
            if (scope === 'all' || scope === 'inbox') { journalFrom[campC] = undefined; }
            toast(scope === 'all' ? 'Journal cleared.' : scope === 'mine' ? 'Your pages are gone.' : 'Inbox cleared.');
            await openJournal(true);
            return;
        }
        var chip = e.target.closest && e.target.closest('.journal-from');
        if (chip) {
            var secF = chip.closest('.journal-section'); if (!secF) return;
            var camp = secF.dataset.camp;
            if (chip.dataset.for === 'sent') { journalTo[camp] = chip.dataset.to; secF.dataset.to = chip.dataset.to; try { localStorage.setItem('journal_sentLast_' + camp, chip.dataset.to); } catch (err) {} }
            else if (chip.dataset.for === 'inbox') { journalFrom[camp] = chip.dataset.from; secF.dataset.from = chip.dataset.from; try { localStorage.setItem('journal_inboxLast_' + camp, chip.dataset.from); } catch (err) {} }
            else { journalShow[camp] = chip.dataset.show; secF.dataset.show = chip.dataset.show; }
            chip.parentNode.querySelectorAll('.journal-from').forEach(function(b) { b.classList.toggle('active', b === chip); });
            journalFilter();
            return;
        }
        var add = e.target.closest && e.target.closest('.journal-add');
        if (add) {
            var campId = safeId(add.dataset.camp) || 'personal', secA = add.closest('.journal-section');
            if (secA && secA.dataset.page === 'personal') campId = 'personal';   // the Personal notes tab is in front: the new page goes into that notebook
            else if (journalPage[campId] === 'inbox' || journalPage[campId] === 'sent') journalPage[campId] = 'all';   // the new page must be visible
            var id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), hereA = journalHere();
            await withIndex(campId, function(idx) {
                if (campId === 'personal') idx.campaign = idx.campaign || 'Personal notes';
                else if (hereA && hereA.key === campId) stampHead(idx, { gmId: hereA.gmId, gm: idx.gm, campaign: hereA.campaign });   // a journal begun by a note of your own knows its campaign's name, so the picker can name it from any other campaign
                idx.entries.push({ id: id, kind: 'note', title: '', text: '', receivedAt: Date.now(), notes: '' });
            });
            await registerJournal(campId);
            await openJournal(true);
            var t = document.querySelector('.journal-entry[data-id="' + id + '"] .journal-note-title'); if (t) t.focus();
            return;
        }
        var del = e.target.closest && e.target.closest('.journal-del');
        if (del) {
            var row = del.closest('.journal-entry'); var cId = row.dataset.camp, nId = row.dataset.id;
            if (row.dataset.kind === 'note') {
                var body = (row.querySelector('.journal-note-body') || {}).value || '';
                if (body.trim() && !confirm('Delete this note?')) return;
            } else {
                var nm = ((row.querySelector('.journal-title') || {}).textContent || 'this handout').replace(/\s*\u00d7\s*$/, '').trim() || 'this handout';
                var hasNotes = ((row.querySelector('.journal-notes') || {}).value || '').trim();
                if (!confirm('Remove "' + nm + '" from your journal?' + (hasNotes ? ' Your notes under it go with it.' : '') + ' The GM can show it again later.')) return;
            }
            var goneD = [];
            var ix = await withIndex(cId, function(idx) { goneD = idx.entries.filter(function(x) { return x.id === nId; }); idx.entries = idx.entries.filter(function(x) { return x.id !== nId; }); });
            dropEntryFiles(cId, goneD);   // the page's picture file goes with it
            row.remove();
            if (!ix.entries.length) await openJournal(true);
        }
    });
    _jList.addEventListener('input', function(e) {
        var fld = e.target.closest && e.target.closest('.journal-note-title, .journal-note-body'); if (!fld) return;
        var row = fld.closest('.journal-entry'), campId = row.dataset.camp, id = row.dataset.id;
        var title = (row.querySelector('.journal-note-title') || {}).value || '', text = (row.querySelector('.journal-note-body') || {}).value || '';
        noteLater('own:' + campId + '/' + id, function() {
            return withIndex(campId, function(idx) {
                var en = idx.entries.find(function(x) { return x.id === id; });
                if (!en) return false;
                en.title = title.slice(0, 120); en.text = text.slice(0, 60000);
            });
        });
    });
}

/* ================= GM side: Handouts ================= */
function handoutsOf(camp) { camp.handouts = camp.handouts || {}; camp.handoutReveals = camp.handoutReveals || {}; return camp.handouts; }
window.wpHandoutList = function() { var c = getActiveCampaign(); return c ? Object.values(handoutsOf(c)) : []; };

// Bytes for the wire: the picture resized to MAX_EDGE on its long side
window.wpHandoutPayload = function(h) {
    if (h.kind === 'text') return Promise.resolve({ kind: 'text', text: String(h.text || '').slice(0, 60000) });
    return new Promise(function(resolve, reject) {
        var img = new Image();
        img.onload = function() {
            var s = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
            var w = Math.max(1, Math.round(img.naturalWidth * s)), hh = Math.max(1, Math.round(img.naturalHeight * s));
            var c = document.createElement('canvas'); c.width = w; c.height = hh;
            c.getContext('2d').drawImage(img, 0, 0, w, hh);
            var png = /\.png$/i.test(h.src);
            c.toBlob(function(blob) {
                if (!blob) return reject(new Error('encode failed'));
                blob.arrayBuffer().then(function(buf) { resolve({ mime: png ? 'image/png' : 'image/jpeg', data: new Uint8Array(buf) }); });
            }, png ? 'image/png' : 'image/jpeg', JPEG_Q);
        };
        img.onerror = function() { reject(new Error('image failed to load')); };
        var pSrc = picRef(h.src); img.src = /^(data:|blob:)/.test(pSrc) ? pSrc : encodeURI(pSrc);
    });
};

var handoutTag = '';   // the tag the Handouts panel is filtered to ('' = all)
function renderHandoutTags(camp) {
    var row = ui('handoutTagRow'); if (!row) return;
    var counts = {};
    Object.values(handoutsOf(camp)).forEach(function(h) { (Array.isArray(h.tags) ? h.tags : []).forEach(function(t) { counts[t] = (counts[t] || 0) + 1; }); });
    var tags = Object.keys(counts).sort();
    if (!tags.length) { row.style.display = 'none'; handoutTag = ''; return; }
    if (handoutTag && !counts[handoutTag]) handoutTag = '';
    row.style.display = 'flex';
    row.innerHTML = '<span class="journal-chip-label">Tags</span><button class="journal-from' + (!handoutTag ? ' active' : '') + '" data-tag="">All</button>'
        + tags.map(function(t) { return '<button class="journal-from' + (handoutTag === t ? ' active' : '') + '" data-tag="' + esc(t) + '">' + esc(t) + ' <span class="journal-count">' + counts[t] + '</span></button>'; }).join('');
}
function renderHandouts() {
    var camp = getActiveCampaign(), list = ui('handoutsList'); if (!camp || !list) return;
    renderHandoutTags(camp);
    var hs = Object.values(handoutsOf(camp)).sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    if (handoutTag) hs = hs.filter(function(h) { return (Array.isArray(h.tags) ? h.tags : []).indexOf(handoutTag) >= 0; });
    if (!hs.length) { list.innerHTML = '<div style="color:var(--dim); padding:12px; line-height:1.5;">No handouts yet. Press <b>New handout</b> and pick a picture from your campaign — a place, a face, a letter. Then show it to the table, to one player, or attach it to a room so whoever walks in sees it.</div>'; return; }
    var rooms = [];
    Object.values(camp.items).forEach(function(m) { if (m.type !== 'map') return; (m.rooms || []).forEach(function(r) { if (r.handoutId) rooms.push({ hid: r.handoutId, label: (r.name || 'room') + ' · ' + (m.meta && m.meta.title || m.id) }); }); });
    // Give-to targets: only THIS campaign's registered players (camp.players never crosses campaigns),
    // labelled by the character they play. Connected players get a handout at once; others when they join.
    var givePlayers = Object.keys(camp.players || {})
        .filter(function(pid) { return !(camp.bannedPlayers && camp.bannedPlayers[pid]); })
        .map(function(pid) { var p = camp.players[pid] || {}, pa = playsOf(camp, pid, p); return { id: pid, label: pa ? (pa + ' — ' + (p.name || pid)) : (p.name || pid) }; })
        .sort(function(a, b) { return String(a.label).localeCompare(String(b.label)); });
    var giveOpts = '<option value="">Give to…</option><option value="*">Anyone (the whole table)</option>'
        + givePlayers.map(function(p) { return '<option value="' + esc(p.id) + '">' + esc(p.label) + '</option>'; }).join('');
    list.innerHTML = hs.map(function(h) {
        var seen = Object.keys(camp.handoutReveals).filter(function(pid) { return camp.handoutReveals[pid] && camp.handoutReveals[pid][h.id]; })
            .map(function(pid) { var p = (camp.players || {})[pid]; return p && p.name ? p.name : pid; });
        var attached = rooms.filter(function(r) { return r.hid === h.id; }).map(function(r) { return r.label; });
        var queued = Object.keys(h.giveTo || {})   // assigned to a specific player but not delivered yet
            .filter(function(pid) { return !(camp.handoutReveals[pid] && camp.handoutReveals[pid][h.id]); })
            .map(function(pid) { var p = (camp.players || {})[pid] || {}; return playsOf(camp, pid, p) || p.name || pid; });
        var thumb = h.kind === 'text'
            ? '<div class="handout-thumb handout-thumb-text" title="Preview">' + esc(String(h.text || '').slice(0, 140)) + '</div>'
            : '<img class="handout-thumb" src="' + encodeURI(picRef(h.src)) + '" alt="" title="Preview">';
        return '<div class="handout-row" data-id="' + esc(h.id) + '">' + thumb +
            '<div class="handout-body">' +
            '<input class="field handout-title" value="' + esc(h.title || '') + '" placeholder="Title">' +
            (h.kind === 'text' ? '<textarea class="field handout-text" placeholder="The text the players read">' + esc(h.text || '') + '</textarea>' : '') +
            '<textarea class="field handout-caption" placeholder="' + (h.kind === 'text' ? 'Short note under it (optional)' : 'Caption the players see (optional)') + '">' + esc(h.caption || '') + '</textarea>' +
            '<input class="field handout-tags" value="' + esc((Array.isArray(h.tags) ? h.tags : []).join(', ')) + '" placeholder="Tags — faces, places, letters… (comma-separated; players see them and can search by them)" title="Tags sort the panel and travel with the handout">' +
            '<div class="handout-meta">' + (seen.length ? 'Seen by ' + esc(seen.join(', ')) : 'Not shown to anyone yet') + (queued.length ? ' · queued for ' + esc(queued.join(', ')) : '') + (attached.length ? ' · attached to ' + esc(attached.join('; ')) : '') + '</div>' +
            '<label class="handout-auto" title="Every player receives this the next time they connect (once each), without you pressing anything"><input type="checkbox" class="handout-auto-box"' + (h.autoOnJoin ? ' checked' : '') + '> Give to every player when they join</label>' +
            '<div class="handout-actions">' +
            '<button class="tool" data-act="table" title="Show it to everyone connected right now">Show to table</button>' +
            (givePlayers.length ? '<select class="handout-give" title="Give this handout to one player, or to the whole table. A connected player gets it now; anyone else the next time they join.">' + giveOpts + '</select><button class="tool handout-give-btn" data-act="give" disabled title="Give the handout to the chosen recipient">Give</button>' : '') +
            '<button class="tool ghost" data-act="preview">Preview</button>' +
            '<button class="tool ghost danger" data-act="delete" title="Remove this handout (players keep what they were already shown)">Delete</button>' +
            '</div></div></div>';
    }).join('');
}
window.wpRenderHandouts = renderHandouts;
var _hTagRow = ui('handoutTagRow');
if (_hTagRow) _hTagRow.addEventListener('click', function(e) {
    var b = e.target.closest && e.target.closest('[data-tag]'); if (!b) return;
    handoutTag = b.dataset.tag || ''; renderHandouts();
});

async function openHandouts() {
    var m = ui('handoutsModal'); if (!m) return;
    m.style.display = 'flex'; renderHandouts();
}
var _hbBtn = ui('handoutsBtn');
if (_hbBtn) _hbBtn.addEventListener('click', openHandouts);
var _hbClose = ui('handoutsCloseBtn');
if (_hbClose) _hbClose.addEventListener('click', function() { ui('handoutsModal').style.display = 'none'; });

// New handout: pick a picture from the campaign's images
var _newBtn = ui('handoutNewBtn');
if (_newBtn) _newBtn.addEventListener('click', async function() {
    var grid = ui('handoutPickGrid'), pick = ui('handoutPick');
    pick.style.display = 'flex';
    grid.innerHTML = '<div style="color:var(--dim); padding:10px;">Loading pictures…</div>';
    var imgs = [];
    try { imgs = await (await fetch('/api/list-images')).json(); } catch (e) {}
    imgs = (imgs || []).filter(function(i) { return !/^journal(\/|$)/.test(i.folder || ''); });
    var campH = getActiveCampaign(), allImgs = imgs, showAll = false;
    if (window.wpImgScope && campH) imgs = window.wpImgScope(allImgs, campH.id);   // this campaign's pictures first; a toggle shows every campaign's
    var q = (ui('handoutPickSearch').value || '').toLowerCase();
    var draw = function() {
        var pool = showAll ? allImgs : imgs;
        var rows = pool.filter(function(i) { return !q || (i.name + ' ' + i.folder).toLowerCase().indexOf(q) >= 0; });
        var toggle = window.wpImgScope && campH && allImgs.length !== imgs.length ? '<label style="display:block; font-size:11px; color:var(--dim); margin:0 0 6px;"><input type="checkbox" class="handout-pick-all"' + (showAll ? ' checked' : '') + '> Show every campaign\'s pictures (' + allImgs.length + ')</label>' : '';
        grid.innerHTML = toggle + rowsHtml(rows);
        var cb = grid.querySelector('.handout-pick-all'); if (cb) cb.addEventListener('change', function() { showAll = this.checked; draw(); });
    };
    var rowsHtml = function(rows) {
        return rows.length ? rows.map(function(i) { return '<div class="img-lib-cell handout-pick-cell" data-src="' + esc(i.path) + '" title="' + esc(i.folder + '/' + i.name) + '"><img src="' + encodeURI(i.path) + '" loading="lazy" alt=""><div class="img-lib-name">' + esc(niceName(i.name)) + '</div></div>'; }).join('') : '<div style="color:var(--dim); padding:10px;">No pictures match.</div>';
    };
    draw();
    ui('handoutPickSearch').oninput = function() { q = this.value.toLowerCase(); draw(); };
});
// A readable name for a stored picture: "k3j9x2ab_Ror'Chiir — token_160.png" → "Ror'Chiir"
function niceName(file) {
    var n = decodeURIComponent(String(file || '').split('/').pop() || '');
    n = n.replace(/\.[a-z0-9]{2,5}$/i, '');            // extension
    n = n.replace(/^[a-z0-9]{6,10}_(?=.)/, '');          // the uploader's random tag
    n = n.replace(/[_-]\d{2,4}$/, '');                   // a size suffix such as _160
    n = n.replace(/\s*[—–-]\s*token$/i, '').replace(/_token$/i, '');   // token pictures named after their character
    n = n.replace(/[_]+/g, ' ').replace(/\s+-\s+/g, ' — ').replace(/\s{2,}/g, ' ').trim();
    return n || 'Handout';
}
var _pickGrid = ui('handoutPickGrid');
if (_pickGrid) _pickGrid.addEventListener('click', function(e) {
    var cell = e.target.closest && e.target.closest('.handout-pick-cell'); if (!cell) return;
    var camp = getActiveCampaign(); if (!camp) return;
    var hs = handoutsOf(camp);
    var id = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    hs[id] = { id: id, title: niceName(cell.dataset.src).slice(0, 120), caption: '', src: cell.dataset.src, createdAt: Date.now() };
    save(true);
    ui('handoutPick').style.display = 'none';
    renderHandouts();
    toast('Handout added — give it a title and a caption, then show it.');
});
// New text handout: a title and a body
var _newTextBtn = ui('handoutNewTextBtn');
if (_newTextBtn) _newTextBtn.addEventListener('click', function() {
    var camp = getActiveCampaign(); if (!camp) return;
    var hs = handoutsOf(camp);
    var id = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    hs[id] = { id: id, kind: 'text', title: 'New handout', caption: '', text: '', createdAt: Date.now() };
    save(true); renderHandouts();
    var row = document.querySelector('.handout-row[data-id="' + id + '"] .handout-title'); if (row) { row.focus(); row.select(); }
});
var _pickClose = ui('handoutPickClose');
if (_pickClose) _pickClose.addEventListener('click', function() { ui('handoutPick').style.display = 'none'; });

var _hList = ui('handoutsList');
if (_hList) {
    _hList.addEventListener('input', function(e) {
        var row = e.target.closest && e.target.closest('.handout-row'); if (!row) return;
        var camp = getActiveCampaign(); var h = camp && handoutsOf(camp)[row.dataset.id]; if (!h) return;
        if (e.target.classList.contains('handout-title')) h.title = e.target.value.slice(0, 120);
        if (e.target.classList.contains('handout-caption')) h.caption = e.target.value.slice(0, 4000);
        if (e.target.classList.contains('handout-text')) {
            h.text = e.target.value.slice(0, 60000);
            var _thumb = row.querySelector('.handout-thumb-text');   // keep the preview thumbnail in step as you type (no full re-render, so the caret stays put)
            if (_thumb) _thumb.textContent = String(h.text || '').slice(0, 140);
        }
        if (e.target.classList.contains('handout-tags')) { h.tags = tagList(e.target.value); if (!h.tags.length) delete h.tags; clearTimeout(_hList._tg); _hList._tg = setTimeout(function() { renderHandoutTags(camp); }, 600); }
        clearTimeout(_hList._t); _hList._t = setTimeout(function() { save(true); }, 400);
    });
    _hList.addEventListener('keydown', function(e) { e.stopPropagation(); });
    _hList.addEventListener('change', function(e) {
        var box = e.target.closest && e.target.closest('.handout-auto-box');
        if (box) {
            var rowA = box.closest('.handout-row'); var campA = getActiveCampaign(); var hA = campA && handoutsOf(campA)[rowA.dataset.id];
            if (hA) { if (box.checked) hA.autoOnJoin = true; else delete hA.autoOnJoin; save(true); toast(box.checked ? 'Every player gets this when they next connect.' : 'No longer given automatically.'); }
            return;
        }
        var sel = e.target.closest && e.target.closest('.handout-give'); if (!sel) return;
        var giveBtn = sel.parentNode.querySelector('.handout-give-btn'); if (giveBtn) giveBtn.disabled = !sel.value;
    });
    _hList.addEventListener('click', function(e) {
        var b = e.target.closest && e.target.closest('[data-act]'); var thumb = e.target.closest && e.target.closest('.handout-thumb');
        var row = e.target.closest && e.target.closest('.handout-row'); if (!row) return;
        var camp = getActiveCampaign(); var h = camp && handoutsOf(camp)[row.dataset.id]; if (!h) return;
        if (thumb || (b && b.dataset.act === 'preview')) { showHandout({ title: h.title, caption: h.caption, src: h.kind === 'text' ? null : h.src, text: h.kind === 'text' ? h.text : '', from: atSomeonesTable() ? null : { own: true } }); return; }   // your own handout: its links open directly
        if (!b) return;
        if (b.dataset.act === 'table') { net.revealHandout(h.id, null); }
        else if (b.dataset.act === 'give') {
            var selG = row.querySelector('.handout-give'); var val = selG && selG.value; if (!val) return;
            if (val === '*') {                       // the whole table: now (if connected) and to each as they join
                h.autoOnJoin = true; save(true);
                if (net.active && net.role === 'host') net.revealHandout(h.id, null);
                else toast('“' + (h.title || 'This handout') + '” will go to every player — anyone connected now, and each player as they join.');
            } else {
                var connected = net.active && net.role === 'host' && Object.keys(net.roster || {}).some(function(k) { return net.roster[k] && net.roster[k].id === val; });
                if (connected) {                      // deliver right away
                    net.revealHandout(h.id, [val]);
                } else {                              // offline: queue it for their next join
                    h.giveTo = h.giveTo || {}; h.giveTo[val] = Date.now(); save(true);
                    var pg = (camp.players || {})[val] || {};
                    toast('Queued “' + (h.title || 'handout') + '” for ' + (playsOf(camp, val, pg) || pg.name || 'that player') + ' — they get it the next time they connect.');
                }
            }
            renderHandouts();
        }
        else if (b.dataset.act === 'delete') {
            delete handoutsOf(camp)[h.id];
            var swept = [];   // every map that lost a room's handout: undo there must not re-attach a handout that is gone
            Object.values(camp.items).forEach(function(m) { if (m.type === 'map') (m.rooms || []).forEach(function(r) { if (r.handoutId === h.id) { delete r.handoutId; if (swept.indexOf(m.id) < 0) swept.push(m.id); } }); });
            if (swept.length) historyBarrier(swept);
            save(true); renderHandouts(); toast('Handout removed. Players keep what they were already shown.');
        }
    });
}
// GM: keep the panel current when a reveal is recorded
document.addEventListener('wp-handout-revealed', function() { if (ui('handoutsModal') && ui('handoutsModal').style.display === 'flex') renderHandouts(); });
