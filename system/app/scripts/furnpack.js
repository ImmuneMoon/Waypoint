/* Furnishing packs (1.6.2, backlog 222, fold 2), the GM's window. The owner, 2026-11-12, by prompt: a pack lives in the campaign it was brought
   into and is shared with another campaign only when asked, a pack gives looks only, and a pack as a file is "give the option on either on
   export, and have import allow the same": one .wpfurn file with its pictures inside, or a folder of pictures named kind-era (chest-fantasy.png).

   A pack is kept as camp.furnPacks, cleaned by furncore cleanPacks, never sent (net.js deletes it). Each picture is saved as one of the
   campaign's own pictures under images/<pack id>/, and is checked on the way in by its first bytes (png, jpeg or webp), its size and the kind and
   era it names. A placed look keeps its picture, so a pack removed or renamed changes nothing on a map. Everything here is the GM's, words are
   text nodes alone, and every step is logged ('furnpack v1'). */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { showConfirm } from './dialogs.js';
import './objcore.js';   // brings furncore.js

var PIC_MAX = 4 * 1024 * 1024, FILE_MAX = 96 * 1024 * 1024, FOLDER_MAX = 400;
function FU() { return window.wpFurnCore || null; }
function srcRule() { var FC = window.wpFogCore; return FC && FC.cleanTexSrc ? FC.cleanTexSrc : null; }
function log(step, facts) { if (window.wpStepLog) window.wpStepLog('furnpack v1', step, facts || {}); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function btn(cls, text, tip) { var b = el('button', cls, text); b.type = 'button'; if (tip) b.dataset.tip = tip; return b; }
function $(id) { return document.getElementById(id); }

// [furncheck:packwin-start]
// May this machine change them? The campaign's own machine, never at someone's table, never the stream window
function packMay(n, w) { if (n && n.active === true && n.role === 'client') return false; if ((n && n.stream) || (w && w.wpStream)) return false; return !(w && typeof w.wpCanPersistLocal === 'function' && w.wpCanPersistLocal() !== true); }
// A new pack id no pack of these lists holds, from a number the caller rolled
function packIdOf(lists, n) {
    var seen = Object.create(null); (Array.isArray(lists) ? lists : []).forEach(function(l) { (Array.isArray(l) ? l : []).forEach(function(p) { if (p && typeof p.id === 'string') seen[p.id] = 1; }); });
    var base = 'fp_' + (Math.abs(Math.floor(Number(n) || 0)) % 2176782336).toString(36).padStart(4, '0'), id = base, i = 1;
    while (seen[id]) id = base + (i++).toString(36);
    return id;
}
// What a .wpfurn file holds, read as data: its name and each look's picture as a data address, by the kind and era it names. Every refusal is
// counted by its reason, never thrown
function readPackFile(F, j) {
    var out = { name: '', looks: [], left: { kind: 0, picture: 0 } };
    if (!j || typeof j !== 'object' || Array.isArray(j) || j.wpfurn !== 1) return null;
    out.name = F.packName(j.name);
    var L = j.looks && typeof j.looks === 'object' && !Array.isArray(j.looks) ? j.looks : {};
    Object.keys(L).slice(0, 400).forEach(function(key) {
        var m = /^([a-z]+)\.([a-z]+)$/.exec(key);
        if (!m || !F.lookKey(m[1], m[2])) { out.left.kind++; return; }
        var v = L[key];
        if (typeof v !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > PIC_MAX * 1.4) { out.left.picture++; return; }
        out.looks.push({ k: m[1], era: m[2], data: v });
    });
    return out;
}
// The words that say what an import did
function importWords(name, n, left) {
    var w = n ? 'Brought in ' + name + ': ' + n + (n === 1 ? ' picture.' : ' pictures.') : 'Nothing of ' + name + ' could be brought in.';
    var bits = [];
    if (left.kind) bits.push(left.kind + (left.kind === 1 ? ' names' : ' name') + ' no kind and era');
    if (left.picture) bits.push(left.picture + (left.picture === 1 ? ' is' : ' are') + ' no png, jpeg or webp picture of 4 MB or less');
    if (left.twice) bits.push(left.twice + (left.twice === 1 ? ' is a second picture' : ' are second pictures') + ' for the same kind and era');
    if (left.upload) bits.push(left.upload + ' could not be saved');
    if (left.over) bits.push(left.over + (left.over === 1 ? ' file' : ' files') + ' past the first 400');
    return bits.length ? w + ' Left out: ' + bits.join(', ') + '.' : w;
}
// [furncheck:packwin-end]

var _w = { from: false, busy: false };
function net() { return window.wpNet || null; }
function campNow() { return getActiveCampaign(); }
function packsOf(c) { var F = FU(), r = srcRule(); return F && r && c && c.furnPacks ? F.cleanPacks(c.furnPacks, r) : []; }
function store(list) { var c = campNow(); if (!c) return false; if (list.length) c.furnPacks = list; else delete c.furnPacks; save(); if (window.wpFurnish) window.wpFurnish.draw(); return true; }
function bytesOf(data) { var b64 = data.slice(data.indexOf(',') + 1), s = atob(b64), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
async function upload(packId, k, era, u) {
    var F = FU(), kind = F.picKind(u); if (!kind || u.length > PIC_MAX) return '';
    var ext = kind === 'jpeg' ? 'jpg' : kind, blob = new Blob([u], { type: 'image/' + kind });
    if (typeof window.wpUploadBlob !== 'function') return '';
    try { var url = await window.wpUploadBlob(packId, F.lookFile(k, era, ext), blob), r = srcRule(); return r ? (r(url) || '') : ''; } catch (e) { return ''; }
}
function campLive(c) { var cs = state.appState && state.appState.campaigns; return !!c && !!cs && Object.keys(cs).some(function(k) { return cs[k] === c; }); }
async function bringIn(name, items, pre) {   // items: [{ k, era, bytes }]; pre: what the file or the folder already left out
    var F = FU(), c = campNow(); if (!F || !c) return;
    if (packsOf(c).length >= F.PACK_MAX) { toast('This campaign holds as many packs as it can, ' + F.PACK_MAX + '.'); return; }
    var id = packIdOf(allIds(), Math.random() * 2176782336), looks = {}, left = { kind: pre && pre.kind || 0, picture: pre && pre.picture || 0, upload: 0, twice: pre && pre.twice || 0, over: pre && pre.over || 0 }, n = 0;
    for (var i = 0; i < items.length; i++) {
        var it = items[i], key = F.lookKey(it.k, it.era); if (!key) { left.kind++; continue; } if (looks[key]) { left.twice++; continue; }
        if (!F.picKind(it.bytes) || it.bytes.length > PIC_MAX) { left.picture++; continue; }
        var src = await upload(id, it.k, it.era, it.bytes); if (!src) { left.upload++; continue; }
        looks[key] = src; n++;
    }
    var nm = F.packName(name) || 'A pack';
    if (n && !campLive(c)) { log('import-refused', { why: 'campaign gone' }); toast('The campaign ' + nm + ' was brought into is gone, so the pack was not kept.'); return; }
    var now = packsOf(c);   // read again: a rename or a removal made while the pictures were saved stands
    if (n && now.length >= F.PACK_MAX) { log('import-refused', { why: 'full' }); toast('This campaign holds as many packs as it can, ' + F.PACK_MAX + '.'); return; }
    if (n) { var pk = F.cleanPack({ id: id, name: nm, looks: looks }, srcRule()); if (pk) { c.furnPacks = now.concat([pk]); save(); if (window.wpFurnish) window.wpFurnish.draw(); } }   // written to the campaign it began in, whichever is on screen now
    log('import', { n: n, left: left.kind + left.picture + left.upload + left.twice + left.over });
    toast(importWords(nm, n, left));
    draw();
}
// Every pack id held in any campaign, so that a new pack's pictures never share a folder with another's
function allIds() { var cs = state.appState && state.appState.campaigns, out = []; Object.keys(cs && typeof cs === 'object' ? cs : {}).forEach(function(k) { var c = cs[k]; if (c && Array.isArray(c.furnPacks)) out.push(c.furnPacks); }); return out; }
// One import at a time: a second waits for nothing and is said
async function once(fn) {
    if (_w.busy) { toast('A pack is still being brought in. Try again when it is done.'); return; }
    _w.busy = true; try { await fn(); } finally { _w.busy = false; }
}
async function importFile(file) {
    var F = FU(); if (!F || !file) return;
    if (file.size > FILE_MAX) { toast('That file is too large to be a pack.'); return; }
    var j; try { j = JSON.parse(await file.text()); } catch (e) { j = null; }
    var got = j ? readPackFile(F, j) : null;
    if (!got) { toast('That is no furnishing pack.'); log('import-refused', { why: 'not a pack' }); return; }
    var items = got.looks.map(function(l) { try { return { k: l.k, era: l.era, bytes: bytesOf(l.data) }; } catch (e) { return { k: l.k, era: l.era, bytes: new Uint8Array(0) }; } });
    await bringIn(got.name || String(file.name || '').replace(/\.[^.]*$/, ''), items, got.left);
}
async function importFolder(files) {
    var F = FU(); if (!F || !files || !files.length) return;
    var name = '', items = [], left = 0, over = Math.max(0, files.length - FOLDER_MAX);
    for (var i = 0; i < files.length && i < FOLDER_MAX; i++) {
        var f = files[i], rel = String(f.webkitRelativePath || ''); if (!name && rel.indexOf('/') > 0) name = rel.slice(0, rel.indexOf('/'));
        var lk = F.lookOfFile(f.name); if (!lk) { left++; continue; }
        if (f.size > PIC_MAX) { items.push({ k: lk.k, era: lk.era, bytes: new Uint8Array(0) }); continue; }
        items.push({ k: lk.k, era: lk.era, bytes: new Uint8Array(await f.arrayBuffer()) });
    }
    if (!items.length) { toast('No picture in that folder is named for a kind and an era, such as chest-fantasy.png.'); log('import-refused', { why: 'no names', files: files.length }); return; }
    await bringIn(name || 'A pack', items, { kind: left, over: over });
}
async function looksOf(p) {   // each look's bytes, read from the campaign's own picture
    var F = FU(), out = [];
    for (var i = 0; i < F.FURN_KINDS.length; i++) for (var j = 0; j < F.FURN_ERAS.length; j++) {
        var k = F.FURN_KINDS[i].key, e = F.FURN_ERAS[j].id, src = F.packLook(p, k, e); if (!src) continue;
        try { var r = await fetch(src); if (!r.ok) continue; var u = new Uint8Array(await r.arrayBuffer()), kind = F.picKind(u); if (kind) out.push({ k: k, era: e, kind: kind, bytes: u }); } catch (er) {}
    }
    return out;
}
function b64(u) { var s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function exportFile(p) {
    var looks = await looksOf(p), out = { wpfurn: 1, name: p.name, looks: {} };
    looks.forEach(function(l) { out.looks[l.k + '.' + l.era] = 'data:image/' + l.kind + ';base64,' + b64(l.bytes); });
    var blob = new Blob([JSON.stringify(out)], { type: 'application/json' }), a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = p.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.wpfurn'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
    log('export', { as: 'file', n: looks.length }); toast('Exported ' + p.name + ' as one file, ' + looks.length + (looks.length === 1 ? ' picture.' : ' pictures.'));
}
async function exportFolder(p) {
    var F = FU();
    if (typeof window.showDirectoryPicker !== 'function') { toast('This window cannot write a folder. Export it as one file instead.'); return; }
    var dir; try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { return; }
    try {
        var sub = await dir.getDirectoryHandle(p.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'pack', { create: true }), looks = await looksOf(p);
        for (var i = 0; i < looks.length; i++) { var l = looks[i], fh = await sub.getFileHandle(F.lookFile(l.k, l.era, l.kind === 'jpeg' ? 'jpg' : l.kind), { create: true }), wr = await fh.createWritable(); await wr.write(l.bytes); await wr.close(); }
        log('export', { as: 'folder', n: looks.length }); toast('Exported ' + p.name + ' as a folder of ' + looks.length + (looks.length === 1 ? ' picture.' : ' pictures.'));
    } catch (e) { log('export-failed', { as: 'folder' }); toast('The folder could not be written. Export it as one file instead.'); }
}
function othersOf() {
    var out = [], camps = state.appState && state.appState.campaigns, here = campNow();
    Object.keys(camps && typeof camps === 'object' ? camps : {}).forEach(function(id) {
        var c = camps[id]; if (!c || typeof c !== 'object' || c === here || id === (here && here.id)) return;
        var nm = typeof c.name === 'string' && c.name ? c.name : 'A campaign';
        packsOf(c).forEach(function(p) { out.push({ camp: nm, p: p }); });
    });
    return out;
}
function rowOf(F, p) {
    var r = el('div', 'obj-row'), top = el('div', 'obj-top'), txt = el('div', 'obj-txt'), nm = el('input', 'furn-pack-name');
    nm.type = 'text'; nm.maxLength = 60; nm.value = p.name; nm.setAttribute('aria-label', 'The pack’s name');
    nm.addEventListener('change', function() { var v = F.packName(nm.value); if (!v) { nm.value = p.name; return; } store(packsOf(campNow()).map(function(x) { return x.id === p.id ? Object.assign({}, x, { name: v }) : x; })); log('rename', {}); draw(); });
    txt.appendChild(nm); txt.appendChild(el('small', '', F.packCount(p) + (F.packCount(p) === 1 ? ' picture' : ' pictures')));
    top.appendChild(txt);
    var ef = btn('tool ghost', 'Export a file', 'One .wpfurn file with its pictures inside, to keep or to send.'); ef.addEventListener('click', function() { exportFile(p); });
    var ed = btn('tool ghost', 'Export a folder', 'A folder of its pictures, each named for its kind and era, such as chest-fantasy.png.'); ed.addEventListener('click', function() { exportFolder(p); });
    var rm = btn('tool ghost danger', 'Remove', 'Take it out of this campaign. Pieces already placed keep their pictures.');
    rm.addEventListener('click', function() { showConfirm('Remove ' + p.name + ' from this campaign? Pieces already placed keep their pictures.', function(ok) { if (!ok) return; store(packsOf(campNow()).filter(function(x) { return x.id !== p.id; })); log('remove', {}); draw(); }); });   // showConfirm answers through its callback
    top.appendChild(ef); top.appendChild(ed); top.appendChild(rm);
    r.appendChild(top);
    return r;
}
function draw() {
    var F = FU(), box = $('furnPackList'); if (!F || !box) return;
    box.textContent = '';
    var list = packsOf(campNow());
    if (!list.length) box.appendChild(el('div', 'obj-none', 'No pack in this campaign yet. Bring one in from a file or a folder below.'));
    list.forEach(function(p) { box.appendChild(rowOf(F, p)); });
    var from = $('furnPackFromList'); if (!from) return;
    from.textContent = ''; from.hidden = !_w.from;
    if (_w.from) {
        var all = othersOf();
        if (!all.length) from.appendChild(el('div', 'obj-none', 'No other campaign holds a pack.'));
        all.forEach(function(x) {
            var r = el('div', 'obj-top'), t = el('div', 'obj-txt'); t.appendChild(el('span', 'obj-name', x.p.name)); t.appendChild(el('small', '', x.camp + ' · ' + F.packCount(x.p) + (F.packCount(x.p) === 1 ? ' picture' : ' pictures'))); r.appendChild(t);
            var b = btn('tool ghost', 'Import', 'Copy it into this campaign. The other campaign keeps its own.');
            b.addEventListener('click', function() {
                var L = packsOf(campNow());
                if (L.some(function(q) { return q.name === x.p.name && JSON.stringify(q.looks) === JSON.stringify(x.p.looks); })) { toast('This campaign already has ' + x.p.name + '.'); return; }
                if (L.length >= F.PACK_MAX) { toast('This campaign holds as many packs as it can, ' + F.PACK_MAX + '.'); return; }
                store(L.concat([Object.assign({}, x.p, { id: packIdOf([L], Math.random() * 2176782336) })])); log('share', {}); toast('Imported ' + x.p.name + '.'); draw();
            });
            r.appendChild(b); from.appendChild(r);
        });
    }
}
function open() {
    if (!packMay(net(), window)) { toast('Furnishing packs are the GM’s.'); return; }
    var m = $('furnPackModal'); if (!m) return;
    _w.from = false; draw(); m.style.display = 'flex'; log('open', {});
}
function close() { var m = $('furnPackModal'); if (m) m.style.display = 'none'; }
function wire() {
    var on = function(id, fn) { var e = $(id); if (e) e.addEventListener('click', fn); };
    on('furnPackClose', close);
    on('furnPackImportFile', function() { var i = $('furnPackFile'); if (i) { i.value = ''; i.click(); } });
    on('furnPackImportFolder', function() { var i = $('furnPackDir'); if (i) { i.value = ''; i.click(); } });
    on('furnPackFromOther', function() { _w.from = !_w.from; draw(); });
    var fi = $('furnPackFile'); if (fi) fi.addEventListener('change', function() { var f = fi.files && fi.files[0]; if (f) once(function() { return importFile(f); }); });
    var di = $('furnPackDir'); if (di) di.addEventListener('change', function() { var L = di.files && di.files.length ? Array.prototype.slice.call(di.files) : null; if (L) once(function() { return importFolder(L); }); });
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
window.wpFurnPacks = { open: open, close: close, draw: draw };
