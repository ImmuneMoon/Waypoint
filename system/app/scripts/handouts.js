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
import { save, toast } from './io.js';
import { esc } from './inspector.js';

var ui = function(id) { return document.getElementById(id); };
var JOURNAL_DIR = 'images/journal';                 // under saves/ (the shell only writes inside images/)
var MAX_EDGE = 1600, JPEG_Q = 0.86, MAX_BYTES = 6 * 1024 * 1024;
var safeId = function(s) { return String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60); };

/* ================= player side: the Journal ================= */
function journalPath(campId, file) { return '/saves/' + JOURNAL_DIR + '/' + safeId(campId) + '/' + file; }
function lsKey(campId) { return 'journal_' + safeId(campId); }   // fallback store (no shell endpoint) — not a wp_ key, never mirrored

async function readIndex(campId) {
    try {
        var r = await fetch(journalPath(campId, 'journal.json'), { cache: 'no-store' });
        if (r.ok) { var j = await r.json(); if (j && Array.isArray(j.entries)) return j; }
    } catch (e) {}
    try { var l = localStorage.getItem(lsKey(campId)); if (l) { var lj = JSON.parse(l); if (lj && Array.isArray(lj.entries)) return lj; } } catch (e) {}
    return { campId: campId, gm: '', entries: [] };
}
async function writeIndex(campId, idx) {
    var body = JSON.stringify(idx), ok = false;
    try {
        var r = await fetch('/api/upload-exact?path=' + encodeURIComponent(JOURNAL_DIR + '/' + safeId(campId) + '/journal.json'), { method: 'POST', body: body });
        ok = r.ok;
    } catch (e) {}
    try { localStorage.setItem(lsKey(campId), body); ok = true; } catch (e) {}   // mirror (and fallback when there is no shell)
    return ok;
}
// Every change to a journal goes through one queue per campaign: read, change, write, in order.
// Two handouts arriving close together (replays come 0.4 s apart) used to read the same index and
// the later write dropped the earlier entry — and its notes with it, on the next replay.
var indexQueues = {};
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
        if (r.ok) return journalPath(campId, file);
    } catch (e) {}
    // fallback: keep the picture inside the index as a data URL (small ones only)
    if (bytes.length > 1500000) return null;
    return await new Promise(function(res) { var fr = new FileReader(); fr.onload = function() { res(fr.result); }; fr.onerror = function() { res(null); }; fr.readAsDataURL(new Blob([bytes], { type: mime })); });
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
    try { localStorage.setItem('journal_registry', JSON.stringify(list)); } catch (e) {}
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
function journalKey(msg) { var c = safeId(msg.campId), g = safeId(msg.gmId); return c && g ? c + '__' + g : c; }
// FNV-1a over the picture bytes: enough to tell "the same picture again" from "a new picture"
function hashBytes(bytes) {
    var h = 0x811c9dc5;
    for (var i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16) + '-' + bytes.length.toString(16);
}
// The newest journal entry that came from handout <id> (the original or any later version)
function latestOf(idx, id) {
    var best = null;
    idx.entries.forEach(function(e) { if ((e.id === id || e.from === id) && (!best || (e.receivedAt || 0) > (best.receivedAt || 0))) best = e; });
    return best;
}
function versionId(id) { return safeId(id).slice(0, 44) + '-v' + Date.now().toString(36); }
// A shared entry remembers who sent it and what they wrote under it
function stampShared(en, msg) {
    if (!msg.sharedBy) return;
    en.sharedBy = String(msg.sharedBy).slice(0, 60);
    en.sharedById = safeId(msg.sharedById);
    en.sharedNotes = String(msg.sharedNotes || '').slice(0, 20000);
}
function stampHead(idx, msg) {
    idx.gm = String(msg.gm || idx.gm || '').slice(0, 60); idx.gmId = safeId(msg.gmId) || idx.gmId || '';
    idx.campaign = String(msg.campaign || idx.campaign || '').slice(0, 120);
}
async function receiveHandout(msg) {
    var campId = journalKey(msg), id = safeId(msg.id);
    if (!campId || !id) return;
    if (msg.kind === 'text') return receiveTextHandout(msg, campId, id);
    if (!(msg.data && msg.data.byteLength !== undefined)) return;
    var bytes = msg.data instanceof Uint8Array ? msg.data : new Uint8Array(msg.data);
    if (bytes.length > MAX_BYTES) return;
    var mime = ({ 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1 })[msg.mime] ? msg.mime : 'image/jpeg';
    var ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    var title = String(msg.title || 'Handout').slice(0, 120), caption = String(msg.caption || '').slice(0, 4000);
    var hash = hashBytes(bytes);
    var existing, added = false, failed = false, src, shownId = id;
    await withIndex(campId, async function(idx) {
        stampHead(idx, msg);
        existing = latestOf(idx, id);
        if (existing && existing.hash === undefined) {
            // first time this entry meets a hash (journal from before versions): same picture assumed, file refreshed
            src = await putFile(campId, existing.id + '.' + ext, bytes, mime);
            if (!src) { failed = true; return false; }
            existing.hash = hash; existing.src = src; existing.mime = mime;
        }
        if (existing && existing.hash === hash) {
            // the same picture again: title and caption follow the GM, the player's notes stay
            existing.title = title; existing.caption = caption; existing.updatedAt = Date.now(); if (existing.notes === undefined) existing.notes = '';
            stampShared(existing, msg);
            src = existing.src; shownId = existing.id;
            return;
        }
        // a new picture (or the first one): a new entry with its own file and its own notes box
        var nid = existing ? versionId(id) : id;
        src = await putFile(campId, nid + '.' + ext, bytes, mime);
        if (!src) { failed = true; return false; }
        var en = { id: nid, title: title, caption: caption, src: src, mime: mime, hash: hash, receivedAt: Date.now(), notes: '' };
        if (existing) en.from = id;
        stampShared(en, msg);
        idx.entries.push(en); added = true; shownId = nid;
    });
    if (failed) { toast('The GM showed you something, but it could not be saved.'); return; }
    await registerJournal(campId);
    if (msg.replay && !added) return;   // already in the journal, unchanged: refreshed, no fanfare
    badge(unseen + 1);
    showHandout({ title: title, caption: caption, src: src, fresh: true, entry: { campId: campId, id: shownId } });
}
async function receiveTextHandout(msg, campId, id) {
    var title = String(msg.title || 'Handout').slice(0, 120), caption = String(msg.caption || '').slice(0, 4000);
    var text = String(msg.text || '').slice(0, 60000);
    var existing, added = false, shownId = id;
    await withIndex(campId, function(idx) {
        stampHead(idx, msg);
        existing = latestOf(idx, id);
        if (existing && String(existing.text || '') === text) {
            // same words again: title and caption follow the GM, the player's notes stay
            existing.title = title; existing.caption = caption; existing.kind = 'text'; existing.updatedAt = Date.now(); if (existing.notes === undefined) existing.notes = '';
            stampShared(existing, msg);
            shownId = existing.id;
            return;
        }
        // new or changed text: a new entry beside the old one, which keeps its notes
        var en = { id: existing ? versionId(id) : id, kind: 'text', title: title, caption: caption, text: text, receivedAt: Date.now(), notes: '' };
        if (existing) en.from = id;
        stampShared(en, msg);
        idx.entries.push(en); added = true; shownId = en.id;
    });
    await registerJournal(campId);
    if (msg.replay && !added) return;
    badge(unseen + 1);
    showHandout({ title: title, caption: caption, text: text, fresh: true, entry: { campId: campId, id: shownId } });
}
window.wpJournalReceive = receiveHandout;

/* ---------- the viewer (used for a fresh reveal and from the journal) ---------- */
function showHandout(h) {
    var m = ui('handoutModal'); if (!m) return;
    ui('handoutTitle').textContent = h.title || 'Handout';
    var im = ui('handoutImg'), tx = ui('handoutText');
    if (h.src) { im.src = /^(data:|blob:)/.test(h.src) ? h.src : encodeURI(h.src); im.style.display = 'block'; } else { im.removeAttribute('src'); im.style.display = 'none'; }
    if (tx) { tx.textContent = h.text || ''; tx.style.display = h.text ? 'block' : 'none'; }
    ui('handoutCaption').textContent = h.caption || '';
    ui('handoutCaption').style.display = h.caption ? 'block' : 'none';
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
var _hNotes = ui('handoutNotes');
if (_hNotes) {
    _hNotes.addEventListener('keydown', function(e) { e.stopPropagation(); });
    _hNotes.addEventListener('input', function() {
        if (!viewerEntry) return;
        var en = viewerEntry, val = _hNotes.value;
        // keep the journal list's box in step if it is open behind the viewer
        var row = document.querySelector('.journal-entry[data-camp="' + en.campId + '"][data-id="' + en.id + '"] .journal-notes');
        if (row && row.value !== val) row.value = val;
        clearTimeout(viewerNoteTimer);
        viewerNoteTimer = setTimeout(function() {
            withIndex(en.campId, function(idx) {
                var x = idx.entries.find(function(y) { return y.id === en.id; });
                if (!x) return false;
                x.notes = val.slice(0, 20000);
            });
        }, 500);
    });
}
var _hJournal = ui('handoutOpenJournalBtn');
if (_hJournal) _hJournal.addEventListener('click', function() { ui('handoutModal').style.display = 'none'; openJournal(); });
var _hClose = ui('handoutCloseBtn');
if (_hClose) _hClose.addEventListener('click', function() { ui('handoutModal').style.display = 'none'; });

/* ---------- the Journal window ---------- */
async function openJournal() {
    var m = ui('journalModal'); if (!m) return;
    m.style.display = 'flex';
    badge(0);
    var list = ui('journalList');
    list.innerHTML = '<div style="color:var(--dim); padding:14px;">Loading your journal…</div>';
    var journals = await listJournals();
    var own = ownCampaignKey();
    if (own && !journals.some(function(j) { return j.campId === own.key; }) && sentRecords(own.key).length) journals.unshift({ campId: own.key, campaign: own.camp.name || '', gm: '', gmId: window.wpNet.myId, entries: [], updated: 0 });
    if (!journals.length) { list.innerHTML = '<div style="color:var(--dim); padding:14px; line-height:1.5;">Nothing here yet. When a GM shows you a handout — a place, a face, a letter — it is saved here with its caption, and you can add your own notes. It stays on this computer and works without a session.</div><div style="padding:0 14px;"><button class="tool ghost journal-add" data-camp="personal">+ Note</button> <span style="color:var(--dim); font-size:11px;">Start a personal notebook now; campaign sections appear as GMs show you things.</span></div>'; return; }
    list.innerHTML = journals.map(function(j) {
        var nMine = j.entries.filter(function(e) { return e.kind === 'note'; }).length, nParty = j.entries.filter(function(e) { return e.sharedBy; }).length, nGm = j.entries.length - nMine - nParty;
        var personal = j.campId === 'personal';
        var iRunIt = !!(j.gmId && window.wpNet && j.gmId === window.wpNet.myId);   // my own campaign: nothing here is "from the GM"
        var sent = iRunIt ? sentRecords(j.campId) : [];
        var page = personal ? 'mine' : (journalPage[j.campId] || journalDefaultPage());
        if (iRunIt && page === 'gm') page = 'all';
        var runBy = j.gm && !iRunIt && !/^gm$/i.test(j.gm.trim()) ? ' <span style="color:var(--dim); font-weight:normal; font-size:11px;">run by ' + esc(j.gm) + '</span>' : '';
        // a player's sent records: one per send
        var mySent = [];
        j.entries.forEach(function(e) { (e.sentTo || []).forEach(function(t) { mySent.push({ e: e, to: t.to, name: t.name, at: t.at }); }); });
        mySent.sort(function(a, b) { return b.at - a.at; });
        var nSent = iRunIt ? sent.length : mySent.length;
        var from = journalFrom[j.campId] || '';
        function tab(id, label, count, title) { return '<button class="tool ghost journal-tab' + (page === id ? ' active' : '') + '" data-tab="' + id + '" title="' + title + '">' + label + ' <span class="journal-count">' + count + '</span></button>'; }
        var tabs = personal ? '' : '<span class="journal-tabs">' + tab('all', 'All', j.entries.length, 'Everything you have received, and your own pages, newest first')
            + (iRunIt ? '' : tab('gm', 'From the GM', nGm, 'Handouts the GM has shown you'))
            + tab('party', 'From the party', nParty, 'Notes and handouts other players shared with you; a chip narrows it to one person, sent and received')
            + tab('mine', 'My notes', nMine, 'Your own pages')
            + tab('sent', 'Sent', nSent, iRunIt ? 'Handouts you have shown, and to whom' : 'Pages you have shared, with whom and when') + '</span>';
        // one chip per party member you have received from or sent to
        var members = {};
        function member(id, name) { if (!id || id === '*') return; var m = members[id] || (members[id] = { id: id, name: name || id, n: 0 }); if (name && (m.name === id || !m.name)) m.name = name; m.n++; }
        j.entries.forEach(function(e) { if (e.sharedBy) member(e.sharedById || e.sharedBy, e.sharedBy); });
        mySent.forEach(function(s) { member(s.to, s.to === 'gm' ? 'The GM' : s.name); });
        var fromRow = personal || !Object.keys(members).length ? '' : '<div class="journal-from-row" data-for="party"><button class="journal-from' + (!from ? ' active' : '') + '" data-for="party" data-from="">Everyone <span class="journal-count">' + nParty + '</span></button>' +
            Object.values(members).sort(function(a, b) { return a.name.localeCompare(b.name); }).map(function(m) { return '<button class="journal-from' + (from === m.id ? ' active' : '') + '" data-for="party" data-from="' + esc(m.id) + '" title="What ' + esc(m.name) + ' sent you, and what you sent them">' + esc(m.name) + ' <span class="journal-count">' + m.n + '</span></button>'; }).join('') + '</div>';
        // Sent page sections: everyone you have sent to (players: from sentTo; GM: from the delivery log)
        var recips = {};
        function recip(id, name) { if (!id) return; var r = recips[id] || (recips[id] = { id: id, name: name || id, n: 0 }); if (name && (r.name === id || !r.name)) r.name = name; r.n++; }
        if (iRunIt) sent.forEach(function(s) { s.to.forEach(function(t) { recip(t.pid, t.name); }); });
        else mySent.forEach(function(s) { recip(s.to, s.to === '*' ? 'Everyone at once' : s.to === 'gm' ? 'The GM' : s.name); });
        var to = sentOpensTo(j.campId, recips);
        var toRow = personal || !Object.keys(recips).length ? '' : '<div class="journal-from-row" data-for="sent"><button class="journal-from' + (!to ? ' active' : '') + '" data-for="sent" data-to="">All <span class="journal-count">' + nSent + '</span></button>' +
            Object.values(recips).sort(function(a, b) { return a.id === 'gm' ? -1 : b.id === 'gm' ? 1 : a.name.localeCompare(b.name); }).map(function(r) { return '<button class="journal-from' + (to === r.id ? ' active' : '') + '" data-for="sent" data-to="' + esc(r.id) + '" title="What you sent ' + esc(r.name) + '">' + esc(r.name) + ' <span class="journal-count">' + r.n + '</span></button>'; }).join('') + '</div>';
        var mySentRows = mySent.map(function(s) {
            var e = s.e, kind = e.kind === 'note' || e.kind === 'text' ? 'text' : 'image', text = e.kind === 'note' ? (e.text || '') : (e.text || '');
            var thumb = kind === 'text' ? '<div class="journal-thumb journal-thumb-text" title="Open">' + esc(String(text).slice(0, 160)) + '</div>' : '<img class="journal-thumb" src="' + esc(e.src) + '" alt="" title="Open">';
            return '<div class="journal-entry journal-sentrow" data-page="sent" data-to="' + esc(s.to) + '" data-camp="' + esc(j.campId) + '" data-id="sent:' + esc(e.id) + ':' + s.at + '" data-kind="' + kind + '" data-sent="1"' + (kind === 'text' ? ' data-text="' + esc(String(text)) + '"' : '') + '>' + thumb +
                '<div class="journal-body"><div class="journal-title">' + esc(e.title || (e.kind === 'note' ? 'A note' : 'Handout')) + '</div>' + (e.caption ? '<div class="journal-caption">' + esc(e.caption) + '</div>' : '') +
                '<div class="journal-when">Sent to <b>' + esc(s.to === 'gm' ? 'the GM' : s.name) + '</b> <span style="opacity:.7;">' + new Date(s.at).toLocaleString() + '</span>' + (e.kind !== 'note' && e.notes ? ' · with your notes' : '') + '</div></div></div>';
        }).join('');
        var head = '<div class="journal-camp"><b>' + esc(j.campaign || (personal ? 'Personal notes' : 'Campaign')) + '</b>' + runBy + tabs + ' <button class="tool ghost journal-add" data-camp="' + esc(j.campId) + '" title="Write a page of your own">+ Note</button></div>';
        var entries = j.entries.slice().sort(function(a, b) { return (b.receivedAt || 0) - (a.receivedAt || 0); }).map(function(e) {
            if (e.kind === 'note') {
                return '<div class="journal-entry journal-own" data-page="mine" data-camp="' + esc(j.campId) + '" data-id="' + esc(e.id) + '" data-kind="note">' +
                    '<div class="journal-body">' +
                    '<div style="display:flex; gap:6px; align-items:center;"><input class="field journal-note-title" value="' + esc(e.title || '') + '" placeholder="Title"><button class="tool ghost danger journal-del" title="Delete this note" style="padding:2px 8px;">&times;</button></div>' +
                    '<textarea class="journal-notes journal-note-body" placeholder="Write…">' + esc(e.text || '') + '</textarea>' +
                    '<div class="journal-when">' + new Date(e.receivedAt || 0).toLocaleString() + ' · your note</div>' + sentLine(e) + shareControls() + '</div></div>';
            }
            var thumb = e.kind === 'text'
                ? '<div class="journal-thumb journal-thumb-text" title="Open">' + esc(String(e.text || '').slice(0, 160)) + '</div>'
                : '<img class="journal-thumb" src="' + esc(e.src) + '" alt="" title="Open">';
            return '<div class="journal-entry" data-page="' + (e.sharedBy ? 'party' : 'gm') + '"' + (e.sharedBy ? ' data-from="' + esc(e.sharedById || e.sharedBy) + '"' : '') + ' data-camp="' + esc(j.campId) + '" data-id="' + esc(e.id) + '" data-kind="' + esc(e.kind || 'image') + '"' + (e.kind === 'text' ? ' data-text="' + esc(String(e.text || '')) + '"' : '') + '>' + thumb +
                '<div class="journal-body"><div class="journal-title" style="display:flex; align-items:center; gap:6px;"><span style="flex:1;">' + esc(e.title || 'Handout') + '</span><button class="tool ghost danger journal-del" title="Remove this from your journal (the GM keeps theirs)" style="padding:2px 8px;">&times;</button></div>' +
                (e.caption ? '<div class="journal-caption">' + esc(e.caption) + '</div>' : '') +
                '<div class="journal-when">' + new Date(e.receivedAt || 0).toLocaleString() + (e.from ? ' · updated version — the earlier one is kept below' : '') + (e.sharedBy ? ' · shared by <b>' + esc(e.sharedBy) + '</b>' : '') + '</div>' +
                (e.sharedBy && e.sharedNotes ? '<div class="journal-shared"><div class="journal-shared-who">' + esc(e.sharedBy) + ' wrote</div>' + esc(e.sharedNotes) + '</div>' : '') +
                '<textarea class="journal-notes" placeholder="Your notes about this…">' + esc(e.notes || '') + '</textarea>' + sentLine(e) + shareControls() + '</div></div>';
        }).join('');
        var empty = (!nMine ? '<div class="journal-empty" data-page="mine">No pages of your own here yet — press + Note.</div>' : '')
                  + (!nGm && !personal && !iRunIt ? '<div class="journal-empty" data-page="gm">Nothing from the GM yet.</div>' : '')
                  + (iRunIt && !sent.length ? '<div class="journal-empty" data-page="sent">Nothing shown to the players yet.</div>' : '')
                  + (!iRunIt && !personal && !mySent.length ? '<div class="journal-empty" data-page="sent">Nothing sent yet — while in a session, pick "Share with…" on any page.</div>' : '')
                  + (!nParty && !personal ? '<div class="journal-empty" data-page="party">Nothing shared by the party yet.</div>' : '');
        var sentRows = sent.map(function(s) {
            var thumb = s.kind === 'text' ? '<div class="journal-thumb journal-thumb-text" title="Open">' + esc(String(s.text || '').slice(0, 160)) + '</div>'
                      : s.src ? '<img class="journal-thumb" src="' + esc(s.src) + '" alt="" title="Open">' : '<div class="journal-thumb journal-thumb-text">(removed)</div>';
            return '<div class="journal-entry journal-sentrow" data-page="sent" data-to="' + esc(s.to.map(function(t) { return t.pid || ''; }).join(' ')) + '" data-camp="' + esc(j.campId) + '" data-id="sent:' + esc(s.hid) + '" data-kind="' + (s.kind === 'text' ? 'text' : 'image') + '" data-sent="1"' + (s.kind === 'text' ? ' data-text="' + esc(String(s.text || '')) + '"' : '') + '>' + thumb +
                '<div class="journal-body"><div class="journal-title">' + esc(s.title) + '</div>' + (s.caption ? '<div class="journal-caption">' + esc(s.caption) + '</div>' : '') +
                '<div class="journal-when">Shown to ' + s.to.map(function(t) { return esc(t.name) + ' <span style="opacity:.7;">' + new Date(t.at).toLocaleString() + '</span>'; }).join(', ') + '</div></div></div>';
        }).join('');
        return '<div class="journal-section" data-camp="' + esc(j.campId) + '" data-page="' + page + '" data-from="' + esc(from) + '" data-to="' + esc(to) + '">' + head + fromRow + toRow + empty + sentRows + mySentRows + entries + '</div>';
    }).join('');
    journalFilter();
}
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
function sentLine(e, inner) {
    var s = e && e.sentTo && e.sentTo.length ? 'Sent to ' + e.sentTo.slice().reverse().map(function(t) { return esc(t.name) + ' <span style="opacity:.7;">' + new Date(t.at).toLocaleString() + '</span>'; }).join(', ') : '';
    return inner ? s : '<div class="journal-when journal-sent">' + s + '</div>';
}
function shareControls() {
    var n = window.wpNet; if (!(n && n.active && n.role === 'client')) return '';
    var others = Object.values(n.roster || {}).filter(function(p) { return p && p.id && p.id !== n.myId; });
    var opts = '<option value="">Share with…</option>' + (others.length ? '<option value="*">Everyone in the party</option>' : '') + '<option value="gm">The GM</option>' +
        others.map(function(p) { return '<option value="' + esc(p.id) + '">' + esc(p.name || p.id) + '</option>'; }).join('');
    return '<div class="journal-share-row"><select class="journal-share" title="Send this page, with your notes, to someone at the table">' + opts + '</select><button class="tool ghost journal-share-send" disabled>Send</button></div>';
}
async function shareEntry(campId, id, to, btn) {
    var idx = await readIndex(campId);
    var e = idx.entries.find(function(x) { return x.id === id; }); if (!e) return;
    var entry;
    if (e.kind === 'note') entry = { id: e.id, kind: 'text', title: e.title || 'A note', caption: '', text: e.text || '', notes: '' };
    else if (e.kind === 'text') entry = { id: e.id, kind: 'text', title: e.title || 'Handout', caption: e.caption || '', text: e.text || '', notes: e.notes || '' };
    else {
        var bytes = null;
        try { var r = await fetch(/^(data:|blob:)/.test(e.src || '') ? e.src : encodeURI(e.src || ''), { cache: 'no-store' }); if (r.ok) bytes = new Uint8Array(await r.arrayBuffer()); } catch (err) {}
        if (!bytes || !bytes.length) { toast('That picture could not be read from your journal.'); return; }
        entry = { id: e.id, kind: 'image', title: e.title || 'Handout', caption: e.caption || '', mime: e.mime || 'image/jpeg', data: bytes, notes: e.notes || '' };
    }
    if (window.wpNet.shareEntry({ to: to, entry: entry })) {
        var who = to === '*' ? 'everyone in the party' : to === 'gm' ? 'the GM' : ((Object.values(window.wpNet.roster || {}).find(function(p) { return p && p.id === to; }) || {}).name || 'them');
        toast('"' + (entry.title || 'Note') + '" sent to ' + who + '.');
        await withIndex(campId, function(idx) {
            var x = idx.entries.find(function(y) { return y.id === id; }); if (!x) return false;
            x.sentTo = (x.sentTo || []).concat([{ to: to, name: who, at: Date.now() }]).slice(-40);
        });
        var line = document.querySelector('.journal-entry[data-camp="' + campId + '"][data-id="' + id + '"] .journal-sent');
        if (line) line.innerHTML = sentLine(await readIndex(campId).then(function(ix) { return ix.entries.find(function(y) { return y.id === id; }); }), true);
    }
    if (btn) { btn.disabled = true; var s = btn.parentNode.querySelector('.journal-share'); if (s) s.value = ''; }
}
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
        r.title = h.title || '(removed handout)'; r.caption = h.caption || ''; r.kind = h.kind || 'image'; r.text = h.text || ''; r.src = h.src || '';
        r.to.sort(function(a, b) { return b.at - a.at; });
        return r;
    }).sort(function(a, b) { return b.last - a.last; });
}
var journalPage = {};   // page chosen per campaign in this window
var journalFrom = {};   // party member chosen on the From the party page, per campaign
var journalTo = {};     // recipient chosen on the Sent page, per campaign
function sentOpensTo(campId, recips) {
    if (journalTo[campId] !== undefined) return recips[journalTo[campId]] ? journalTo[campId] : '';
    var pref = 'all'; try { pref = localStorage.getItem('wp_sentOpens') || 'all'; } catch (e) {}
    if (pref === 'gm' && recips.gm) return 'gm';
    if (pref === 'remember') { try { var last = localStorage.getItem('journal_sentTo_' + campId) || ''; if (recips[last]) return last; } catch (e) {} }
    return '';
}
// Does this row belong on the page its section is showing?
function onPage(row) {
    var sec = row.closest('.journal-section'); if (!sec) return true;
    var page = sec.dataset.page || 'all', from = sec.dataset.from || '', rp = row.dataset.page, isEmpty = row.className.indexOf('journal-empty') >= 0;
    if (page === 'all') return !isEmpty && rp !== 'sent';
    if (page === 'party' && from) {
        if (isEmpty) return false;
        if (rp === 'party') return row.dataset.from === from;
        if (rp === 'sent') return (' ' + (row.dataset.to || '') + ' ').indexOf(' ' + from + ' ') >= 0;
        return false;
    }
    var to = sec.dataset.to || '';
    if (page === 'sent' && to) return !isEmpty && rp === 'sent' && (' ' + (row.dataset.to || '') + ' ').indexOf(' ' + to + ' ') >= 0;
    return rp === page;
}
function journalDefaultPage() { try { var p = localStorage.getItem('wp_journalPage'); return p === 'gm' || p === 'mine' || p === 'party' || p === 'sent' ? p : 'all'; } catch (e) { return 'all'; } }
window.wpJournalDefaultPage = journalDefaultPage;
function journalFilter() {
    var box = ui('journalSearch'), list = ui('journalList'); if (!box || !list) return;
    var terms = normWords(box.value);
    var q = terms.length, phrase = terms.join(' ');
    list.classList.toggle('searching', q > 0);   // a search looks across both pages
    var scored = [];
    list.querySelectorAll('.journal-entry').forEach(function(row, i) { if (!row.dataset.i) row.dataset.i = String(i + 1); });   // the rendered (date) order, to come back to
    if (!q) {
        list.querySelectorAll('.journal-section').forEach(function(sec) {
            Array.prototype.slice.call(sec.querySelectorAll('.journal-entry')).sort(function(a, b) { return +a.dataset.i - +b.dataset.i; }).forEach(function(r) { sec.appendChild(r); });
        });
    }
    list.querySelectorAll('.journal-empty').forEach(function(el) { el.style.display = !q && onPage(el) ? '' : 'none'; });
    list.querySelectorAll('.journal-from-row').forEach(function(el) { el.style.display = !q && el.parentNode.dataset.page === (el.dataset.for || 'party') ? '' : 'none'; });
    list.querySelectorAll('.journal-entry').forEach(function(row) {
        if (!q) { row.style.display = onPage(row) ? '' : 'none'; return; }
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
        sec.style.display = any ? '' : 'none';
    });
}
var _jSearch = ui('journalSearch');
if (_jSearch) {
    _jSearch.addEventListener('input', journalFilter);
    _jSearch.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Escape') { _jSearch.value = ''; journalFilter(); } });
}
var _jBtn = ui('journalBtn');
if (_jBtn) _jBtn.addEventListener('click', openJournal);
var _jClose = ui('journalCloseBtn');
if (_jClose) _jClose.addEventListener('click', function() { ui('journalModal').style.display = 'none'; });
var _jList = ui('journalList');
if (_jList) {
    _jList.addEventListener('click', function(e) {
        var t = e.target.closest && e.target.closest('.journal-thumb'); if (!t) return;
        var row = t.closest('.journal-entry');
        if (row.dataset.sent) {
            showHandout({ title: row.querySelector('.journal-title').textContent, caption: (row.querySelector('.journal-caption') || {}).textContent || '', src: row.dataset.kind === 'text' ? null : t.getAttribute('src'), text: row.dataset.kind === 'text' ? row.dataset.text : '' });
            return;
        }
        var base = { title: row.querySelector('.journal-title').textContent.replace(/\s*\u00d7\s*$/, '').trim(), caption: (row.querySelector('.journal-caption') || {}).textContent || '', entry: { campId: row.dataset.camp, id: row.dataset.id } };
        if (row.dataset.kind === 'text') {
            readIndex(row.dataset.camp).then(function(idx) { var en = idx.entries.find(function(x) { return x.id === row.dataset.id; }); showHandout(Object.assign(base, { text: en ? en.text : '' })); });
        } else showHandout(Object.assign(base, { src: t.getAttribute('src') }));
    });
    var noteTimers = {};
    _jList.addEventListener('input', function(e) {
        var ta = e.target.closest && e.target.closest('.journal-notes'); if (!ta || ta.classList.contains('journal-note-body')) return;
        var row = ta.closest('.journal-entry'), campId = row.dataset.camp, id = row.dataset.id, val = ta.value;
        if (viewerEntry && viewerEntry.campId === campId && viewerEntry.id === id && _hNotes && _hNotes.value !== val) _hNotes.value = val;
        clearTimeout(noteTimers[campId + '/' + id]);
        noteTimers[campId + '/' + id] = setTimeout(function() {
            withIndex(campId, function(idx) {
                var en = idx.entries.find(function(x) { return x.id === id; });
                if (!en) return false;
                en.notes = val.slice(0, 20000);
            });
        }, 500);
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
        var chip = e.target.closest && e.target.closest('.journal-from');
        if (chip) {
            var secF = chip.closest('.journal-section'); if (!secF) return;
            if (chip.dataset.for === 'sent') {
                journalTo[secF.dataset.camp] = chip.dataset.to; secF.dataset.to = chip.dataset.to;
                try { localStorage.setItem('journal_sentTo_' + secF.dataset.camp, chip.dataset.to); } catch (err) {}
            } else {
                journalFrom[secF.dataset.camp] = chip.dataset.from; secF.dataset.from = chip.dataset.from;
            }
            chip.parentNode.querySelectorAll('.journal-from').forEach(function(b) { b.classList.toggle('active', b === chip); });
            journalFilter();
            return;
        }
        var add = e.target.closest && e.target.closest('.journal-add');
        if (add) {
            var campId = safeId(add.dataset.camp) || 'personal';
            if (journalPage[campId] === 'gm') journalPage[campId] = 'all';   // the new page must be visible
            var id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
            await withIndex(campId, function(idx) {
                if (campId === 'personal') idx.campaign = idx.campaign || 'Personal notes';
                idx.entries.push({ id: id, kind: 'note', title: '', text: '', receivedAt: Date.now(), notes: '' });
            });
            await registerJournal(campId);
            await openJournal();
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
            var ix = await withIndex(cId, function(idx) { idx.entries = idx.entries.filter(function(x) { return x.id !== nId; }); });
            row.remove();
            if (!ix.entries.length) await openJournal();
        }
    });
    _jList.addEventListener('input', function(e) {
        var fld = e.target.closest && e.target.closest('.journal-note-title, .journal-note-body'); if (!fld) return;
        var row = fld.closest('.journal-entry'), campId = row.dataset.camp, id = row.dataset.id;
        var title = (row.querySelector('.journal-note-title') || {}).value || '', text = (row.querySelector('.journal-note-body') || {}).value || '';
        clearTimeout(noteTimers['own:' + campId + '/' + id]);
        noteTimers['own:' + campId + '/' + id] = setTimeout(function() {
            withIndex(campId, function(idx) {
                var en = idx.entries.find(function(x) { return x.id === id; });
                if (!en) return false;
                en.title = title.slice(0, 120); en.text = text.slice(0, 60000);
            });
        }, 500);
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
        img.src = /^(data:|blob:)/.test(h.src) ? h.src : encodeURI(h.src);
    });
};

function renderHandouts() {
    var camp = getActiveCampaign(), list = ui('handoutsList'); if (!camp || !list) return;
    var hs = Object.values(handoutsOf(camp)).sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var roster = (net.active && net.role === 'host') ? Object.values(net.roster) : [];
    if (!hs.length) { list.innerHTML = '<div style="color:var(--dim); padding:12px; line-height:1.5;">No handouts yet. Press <b>New handout</b> and pick a picture from your campaign — a place, a face, a letter. Then show it to the table, to one player, or attach it to a room so whoever walks in sees it.</div>'; return; }
    var rooms = [];
    Object.values(camp.items).forEach(function(m) { if (m.type !== 'map') return; (m.rooms || []).forEach(function(r) { if (r.handoutId) rooms.push({ hid: r.handoutId, label: (r.name || 'room') + ' · ' + (m.meta && m.meta.title || m.id) }); }); });
    list.innerHTML = hs.map(function(h) {
        var seen = Object.keys(camp.handoutReveals).filter(function(pid) { return camp.handoutReveals[pid] && camp.handoutReveals[pid][h.id]; })
            .map(function(pid) { var p = (camp.players || {})[pid]; return p && p.name ? p.name : pid; });
        var attached = rooms.filter(function(r) { return r.hid === h.id; }).map(function(r) { return r.label; });
        var who = roster.map(function(p) { return '<option value="' + esc(p.id) + '">' + esc(p.name || p.id) + '</option>'; }).join('');
        var thumb = h.kind === 'text'
            ? '<div class="handout-thumb handout-thumb-text" title="Preview">' + esc(String(h.text || '').slice(0, 140)) + '</div>'
            : '<img class="handout-thumb" src="' + encodeURI(h.src || '') + '" alt="" title="Preview">';
        return '<div class="handout-row" data-id="' + esc(h.id) + '">' + thumb +
            '<div class="handout-body">' +
            '<input class="field handout-title" value="' + esc(h.title || '') + '" placeholder="Title">' +
            (h.kind === 'text' ? '<textarea class="field handout-text" placeholder="The text the players read">' + esc(h.text || '') + '</textarea>' : '') +
            '<textarea class="field handout-caption" placeholder="' + (h.kind === 'text' ? 'Short note under it (optional)' : 'Caption the players see (optional)') + '">' + esc(h.caption || '') + '</textarea>' +
            '<div class="handout-meta">' + (seen.length ? 'Seen by ' + esc(seen.join(', ')) : 'Not shown to anyone yet') + (attached.length ? ' · attached to ' + esc(attached.join('; ')) : '') + '</div>' +
            '<label class="handout-auto" title="Every player receives this the next time they connect (once each), without you pressing anything"><input type="checkbox" class="handout-auto-box"' + (h.autoOnJoin ? ' checked' : '') + '> Give to every player when they join</label>' +
            '<div class="handout-actions">' +
            '<button class="tool" data-act="table" title="Show it to everyone connected now">Show to table</button>' +
            (roster.length ? '<select class="handout-who" title="Pick a player, then press Send"><option value="">Show to one player…</option>' + who + '</select>' : '') +
            '<button class="tool ghost" data-act="preview">Preview</button>' +
            '<button class="tool ghost danger" data-act="delete" title="Remove this handout (players keep what they were already shown)">Delete</button>' +
            (roster.length ? '<button class="tool handout-send" data-act="send" disabled title="Show it to the player picked in the dropdown">Send</button>' : '') +
            '</div></div></div>';
    }).join('');
}
window.wpRenderHandouts = renderHandouts;

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
    var q = (ui('handoutPickSearch').value || '').toLowerCase();
    var draw = function() {
        var rows = imgs.filter(function(i) { return !q || (i.name + ' ' + i.folder).toLowerCase().indexOf(q) >= 0; });
        grid.innerHTML = rows.length ? rows.map(function(i) { return '<div class="img-lib-cell handout-pick-cell" data-src="' + esc(i.path) + '" title="' + esc(i.folder + '/' + i.name) + '"><img src="' + encodeURI(i.path) + '" loading="lazy" alt=""><div class="img-lib-name">' + esc(niceName(i.name)) + '</div></div>'; }).join('') : '<div style="color:var(--dim); padding:10px;">No pictures match.</div>';
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
        if (e.target.classList.contains('handout-text')) h.text = e.target.value.slice(0, 60000);
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
        var sel = e.target.closest && e.target.closest('.handout-who'); if (!sel) return;
        var sendBtn = sel.parentNode.querySelector('.handout-send'); if (sendBtn) sendBtn.disabled = !sel.value;
    });
    _hList.addEventListener('click', function(e) {
        var b = e.target.closest && e.target.closest('[data-act]'); var thumb = e.target.closest && e.target.closest('.handout-thumb');
        var row = e.target.closest && e.target.closest('.handout-row'); if (!row) return;
        var camp = getActiveCampaign(); var h = camp && handoutsOf(camp)[row.dataset.id]; if (!h) return;
        if (thumb || (b && b.dataset.act === 'preview')) { showHandout({ title: h.title, caption: h.caption, src: h.kind === 'text' ? null : h.src, text: h.kind === 'text' ? h.text : '' }); return; }
        if (!b) return;
        if (b.dataset.act === 'table') { net.revealHandout(h.id, null); }
        else if (b.dataset.act === 'send') {
            var selS = row.querySelector('.handout-who'); var pidS = selS && selS.value; if (!pidS) return;
            net.revealHandout(h.id, [pidS]);
            selS.value = ''; b.disabled = true;
        }
        else if (b.dataset.act === 'delete') {
            delete handoutsOf(camp)[h.id];
            Object.values(camp.items).forEach(function(m) { if (m.type === 'map') (m.rooms || []).forEach(function(r) { if (r.handoutId === h.id) delete r.handoutId; }); });
            save(true); renderHandouts(); toast('Handout removed. Players keep what they were already shown.');
        }
    });
}
// GM: keep the panel current when a reveal is recorded
document.addEventListener('wp-handout-revealed', function() { if (ui('handoutsModal') && ui('handoutsModal').style.display === 'flex') renderHandouts(); });
