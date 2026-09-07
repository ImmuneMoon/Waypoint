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
    var body = JSON.stringify(idx);
    try {
        var r = await fetch('/api/upload-exact?path=' + encodeURIComponent(JOURNAL_DIR + '/' + safeId(campId) + '/journal.json'), { method: 'POST', body: body });
        if (r.ok) return true;
    } catch (e) {}
    try { localStorage.setItem(lsKey(campId), body); return true; } catch (e) { return false; }
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
    var src = await putFile(campId, id + '.' + ext, bytes, mime);
    if (!src) { toast('The GM showed you something, but it could not be saved.'); return; }
    var idx = await readIndex(campId);
    idx.gm = String(msg.gm || idx.gm || '').slice(0, 60); idx.gmId = safeId(msg.gmId) || idx.gmId || '';
    idx.campaign = String(msg.campaign || idx.campaign || '').slice(0, 120);
    var existing = idx.entries.find(function(e) { return e.id === id; });
    if (existing) { existing.title = title; existing.caption = caption; existing.src = src; existing.mime = mime; existing.updatedAt = Date.now(); }
    else idx.entries.push({ id: id, title: title, caption: caption, src: src, mime: mime, receivedAt: Date.now(), notes: '' });
    idx.updated = Date.now();
    await writeIndex(campId, idx);
    await registerJournal(campId);
    if (msg.replay && existing) return;   // already in the journal: refreshed, no fanfare
    badge(unseen + 1);
    showHandout({ title: title, caption: caption, src: src, fresh: true });
}
async function receiveTextHandout(msg, campId, id) {
    var title = String(msg.title || 'Handout').slice(0, 120), caption = String(msg.caption || '').slice(0, 4000);
    var text = String(msg.text || '').slice(0, 60000);
    var idx = await readIndex(campId);
    idx.gm = String(msg.gm || idx.gm || '').slice(0, 60); idx.gmId = safeId(msg.gmId) || idx.gmId || '';
    idx.campaign = String(msg.campaign || idx.campaign || '').slice(0, 120);
    var existing = idx.entries.find(function(e) { return e.id === id; });
    if (existing) { existing.title = title; existing.caption = caption; existing.text = text; existing.kind = 'text'; existing.updatedAt = Date.now(); }
    else idx.entries.push({ id: id, kind: 'text', title: title, caption: caption, text: text, receivedAt: Date.now(), notes: '' });
    idx.updated = Date.now();
    await writeIndex(campId, idx);
    await registerJournal(campId);
    if (msg.replay && existing) return;
    badge(unseen + 1);
    showHandout({ title: title, caption: caption, text: text, fresh: true });
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
    m.style.display = 'flex';
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
    if (!journals.length) { list.innerHTML = '<div style="color:var(--dim); padding:14px; line-height:1.5;">Nothing here yet. When a GM shows you a handout — a place, a face, a letter — it is saved here with its caption, and you can add your own notes. It stays on this computer and works without a session.</div><div style="padding:0 14px;"><button class="tool ghost journal-add" data-camp="personal">+ Note</button> <span style="color:var(--dim); font-size:11px;">Start a personal notebook now; campaign sections appear as GMs show you things.</span></div>'; return; }
    list.innerHTML = journals.map(function(j) {
        var head = '<div class="journal-camp"><b>' + esc(j.campaign || (j.campId === 'personal' ? 'Personal notes' : 'Campaign')) + '</b>' + (j.gm ? ' <span style="color:var(--dim);">— GM ' + esc(j.gm) + '</span>' : '') + ' <button class="tool ghost journal-add" data-camp="' + esc(j.campId) + '" title="Write a note of your own in this section">+ Note</button></div>';
        var entries = j.entries.slice().sort(function(a, b) { return (b.receivedAt || 0) - (a.receivedAt || 0); }).map(function(e) {
            if (e.kind === 'note') {
                return '<div class="journal-entry journal-own" data-camp="' + esc(j.campId) + '" data-id="' + esc(e.id) + '" data-kind="note">' +
                    '<div class="journal-body">' +
                    '<div style="display:flex; gap:6px; align-items:center;"><input class="field journal-note-title" value="' + esc(e.title || '') + '" placeholder="Title"><button class="tool ghost danger journal-del" title="Delete this note" style="padding:2px 8px;">&times;</button></div>' +
                    '<textarea class="journal-notes journal-note-body" placeholder="Write…">' + esc(e.text || '') + '</textarea>' +
                    '<div class="journal-when">' + new Date(e.receivedAt || 0).toLocaleString() + ' · your note</div></div></div>';
            }
            var thumb = e.kind === 'text'
                ? '<div class="journal-thumb journal-thumb-text" title="Open">' + esc(String(e.text || '').slice(0, 160)) + '</div>'
                : '<img class="journal-thumb" src="' + esc(e.src) + '" alt="" title="Open">';
            return '<div class="journal-entry" data-camp="' + esc(j.campId) + '" data-id="' + esc(e.id) + '" data-kind="' + esc(e.kind || 'image') + '">' + thumb +
                '<div class="journal-body"><div class="journal-title">' + esc(e.title || 'Handout') + '</div>' +
                (e.caption ? '<div class="journal-caption">' + esc(e.caption) + '</div>' : '') +
                '<div class="journal-when">' + new Date(e.receivedAt || 0).toLocaleString() + '</div>' +
                '<textarea class="journal-notes" placeholder="Your notes about this…">' + esc(e.notes || '') + '</textarea></div></div>';
        }).join('');
        return head + entries;
    }).join('');
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
        var base = { title: row.querySelector('.journal-title').textContent, caption: (row.querySelector('.journal-caption') || {}).textContent || '' };
        if (row.dataset.kind === 'text') {
            readIndex(row.dataset.camp).then(function(idx) { var en = idx.entries.find(function(x) { return x.id === row.dataset.id; }); showHandout(Object.assign(base, { text: en ? en.text : '' })); });
        } else showHandout(Object.assign(base, { src: t.getAttribute('src') }));
    });
    var noteTimers = {};
    _jList.addEventListener('input', function(e) {
        var ta = e.target.closest && e.target.closest('.journal-notes'); if (!ta || ta.classList.contains('journal-note-body')) return;
        var row = ta.closest('.journal-entry'), campId = row.dataset.camp, id = row.dataset.id, val = ta.value;
        clearTimeout(noteTimers[campId + '/' + id]);
        noteTimers[campId + '/' + id] = setTimeout(async function() {
            var idx = await readIndex(campId);
            var en = idx.entries.find(function(x) { return x.id === id; });
            if (en) { en.notes = val.slice(0, 20000); idx.updated = Date.now(); await writeIndex(campId, idx); }
        }, 500);
    });
    _jList.addEventListener('keydown', function(e) { e.stopPropagation(); });
    // own notes: add / edit / delete
    _jList.addEventListener('click', async function(e) {
        var add = e.target.closest && e.target.closest('.journal-add');
        if (add) {
            var campId = safeId(add.dataset.camp) || 'personal';
            var idx = await readIndex(campId);
            if (campId === 'personal') idx.campaign = idx.campaign || 'Personal notes';
            var id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
            idx.entries.push({ id: id, kind: 'note', title: '', text: '', receivedAt: Date.now(), notes: '' });
            idx.updated = Date.now();
            await writeIndex(campId, idx); await registerJournal(campId);
            await openJournal();
            var t = document.querySelector('.journal-entry[data-id="' + id + '"] .journal-note-title'); if (t) t.focus();
            return;
        }
        var del = e.target.closest && e.target.closest('.journal-del');
        if (del) {
            var row = del.closest('.journal-entry'); var cId = row.dataset.camp, nId = row.dataset.id;
            var body = (row.querySelector('.journal-note-body') || {}).value || '';
            if (body.trim() && !confirm('Delete this note?')) return;
            var ix = await readIndex(cId);
            ix.entries = ix.entries.filter(function(x) { return x.id !== nId; }); ix.updated = Date.now();
            await writeIndex(cId, ix);
            row.remove();
            if (!ix.entries.length) await openJournal();
        }
    });
    _jList.addEventListener('input', function(e) {
        var fld = e.target.closest && e.target.closest('.journal-note-title, .journal-note-body'); if (!fld) return;
        var row = fld.closest('.journal-entry'), campId = row.dataset.camp, id = row.dataset.id;
        var title = (row.querySelector('.journal-note-title') || {}).value || '', text = (row.querySelector('.journal-note-body') || {}).value || '';
        clearTimeout(noteTimers['own:' + campId + '/' + id]);
        noteTimers['own:' + campId + '/' + id] = setTimeout(async function() {
            var idx = await readIndex(campId);
            var en = idx.entries.find(function(x) { return x.id === id; });
            if (en) { en.title = title.slice(0, 120); en.text = text.slice(0, 60000); idx.updated = Date.now(); await writeIndex(campId, idx); }
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
            (roster.length ? '<select class="handout-who"><option value="">Show to one player…</option>' + who + '</select>' : '') +
            '<button class="tool ghost" data-act="preview">Preview</button>' +
            '<button class="tool ghost danger" data-act="delete" title="Remove this handout (players keep what they were already shown)">Delete</button>' +
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
        grid.innerHTML = rows.length ? rows.map(function(i) { return '<div class="img-lib-cell handout-pick-cell" data-src="' + esc(i.path) + '" title="' + esc(i.folder + '/' + i.name) + '"><img src="' + encodeURI(i.path) + '" loading="lazy" alt=""><div class="img-lib-name">' + esc(i.name) + '</div></div>'; }).join('') : '<div style="color:var(--dim); padding:10px;">No pictures match.</div>';
    };
    draw();
    ui('handoutPickSearch').oninput = function() { q = this.value.toLowerCase(); draw(); };
});
var _pickGrid = ui('handoutPickGrid');
if (_pickGrid) _pickGrid.addEventListener('click', function(e) {
    var cell = e.target.closest && e.target.closest('.handout-pick-cell'); if (!cell) return;
    var camp = getActiveCampaign(); if (!camp) return;
    var hs = handoutsOf(camp);
    var id = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var name = decodeURIComponent(cell.dataset.src.split('/').pop() || 'Handout').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');
    hs[id] = { id: id, title: name.slice(0, 120), caption: '', src: cell.dataset.src, createdAt: Date.now() };
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
        var sel = e.target.closest && e.target.closest('.handout-who'); if (!sel || !sel.value) return;
        var row = sel.closest('.handout-row'); var pid = sel.value; sel.value = '';
        net.revealHandout(row.dataset.id, [pid]);
    });
    _hList.addEventListener('click', function(e) {
        var b = e.target.closest && e.target.closest('[data-act]'); var thumb = e.target.closest && e.target.closest('.handout-thumb');
        var row = e.target.closest && e.target.closest('.handout-row'); if (!row) return;
        var camp = getActiveCampaign(); var h = camp && handoutsOf(camp)[row.dataset.id]; if (!h) return;
        if (thumb || (b && b.dataset.act === 'preview')) { showHandout({ title: h.title, caption: h.caption, src: h.kind === 'text' ? null : h.src, text: h.kind === 'text' ? h.text : '' }); return; }
        if (!b) return;
        if (b.dataset.act === 'table') { net.revealHandout(h.id, null); }
        else if (b.dataset.act === 'delete') {
            delete handoutsOf(camp)[h.id];
            Object.values(camp.items).forEach(function(m) { if (m.type === 'map') (m.rooms || []).forEach(function(r) { if (r.handoutId === h.id) delete r.handoutId; }); });
            save(true); renderHandouts(); toast('Handout removed. Players keep what they were already shown.');
        }
    });
}
// GM: keep the panel current when a reveal is recorded
document.addEventListener('wp-handout-revealed', function() { if (ui('handoutsModal') && ui('handoutsModal').style.display === 'flex') renderHandouts(); });
