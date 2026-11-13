/* Furnishing packs (1.6.2, backlog 222, folds 2 and 3), the GM's window and the pack maker. The owner, 2026-11-12, by prompt: a pack lives in
   the campaign it was brought into and is shared with another campaign only when asked, a pack gives looks only, and a pack as a file is "give
   the option on either on export, and have import allow the same": one .wpfurn file with its pictures inside, or a folder of pictures named
   kind-era (chest-fantasy.png). Fold 3, the maker: "Both, maker and guide", laid out as "A. Grid + picked one", a template of "A. Reference +
   empty" (one .zip, which Import a file takes back), its size "up to the user, defaulting to 200" a cell, and a picture with no clear part
   "A. Kept, with a word".

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
// The words that say what an import did. A picture with no clear part is kept, and said apart from what was left out
function importWords(name, n, left) {
    var w = n ? 'Brought in ' + name + ': ' + n + (n === 1 ? ' picture.' : ' pictures.') : 'Nothing of ' + name + ' could be brought in.';
    var bits = [];
    if (left.kind) bits.push(left.kind + (left.kind === 1 ? ' names' : ' name') + ' no kind and era');
    if (left.picture) bits.push(left.picture + (left.picture === 1 ? ' is' : ' are') + ' no png, jpeg or webp picture of 4 MB or less');
    if (left.twice) bits.push(left.twice + (left.twice === 1 ? ' is a second picture' : ' are second pictures') + ' for the same kind and era');
    if (left.upload) bits.push(left.upload + ' could not be saved');
    if (left.over) bits.push(left.over + (left.over === 1 ? ' file' : ' files') + ' past the first 400');
    if (bits.length) w += ' Left out: ' + bits.join(', ') + '.';
    if (left.solid) w += ' ' + left.solid + (left.solid === 1 ? ' has no clear part, so it covers' : ' have no clear part, so each covers') + ' its whole square.';
    return w;
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
// A picture's size and whether any of it is clear, read from its pixels; null where it cannot be read
async function picInfo(blob) {
    var F = FU();
    try {
        var bm = await createImageBitmap(blob), w = bm.width, h = bm.height, s = Math.min(1, 128 / Math.max(w, h));
        var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
        var g = cv.getContext('2d'); g.drawImage(bm, 0, 0, cv.width, cv.height); if (bm.close) bm.close();
        return { w: w, h: h, clear: F.hasClear(g.getImageData(0, 0, cv.width, cv.height).data) };
    } catch (e) { return null; }
}
function campLive(c) { var cs = state.appState && state.appState.campaigns; return !!c && !!cs && Object.keys(cs).some(function(k) { return cs[k] === c; }); }
async function bringIn(name, items, pre) {   // items: [{ k, era, bytes }]; pre: what the file or the folder already left out
    var F = FU(), c = campNow(); if (!F || !c) return;
    if (packsOf(c).length >= F.PACK_MAX) { toast('This campaign holds as many packs as it can, ' + F.PACK_MAX + '.'); return; }
    var id = packIdOf(allIds(), Math.random() * 2176782336), looks = {}, n = 0;
    var left = { kind: pre && pre.kind || 0, picture: pre && pre.picture || 0, upload: 0, twice: pre && pre.twice || 0, over: pre && pre.over || 0, solid: 0 };
    for (var i = 0; i < items.length; i++) {
        var it = items[i], key = F.lookKey(it.k, it.era); if (!key) { left.kind++; continue; } if (looks[key]) { left.twice++; continue; }
        if (!F.picKind(it.bytes) || it.bytes.length > PIC_MAX) { left.picture++; continue; }
        var src = await upload(id, it.k, it.era, it.bytes); if (!src) { left.upload++; continue; }
        var inf = await picInfo(new Blob([it.bytes])); if (inf && !inf.clear) left.solid++;   // kept, and said
        looks[key] = src; n++;
    }
    var nm = F.packName(name) || 'A pack';
    if (n && !campLive(c)) { log('import-refused', { why: 'campaign gone' }); toast('The campaign ' + nm + ' was brought into is gone, so the pack was not kept.'); return; }
    var now = packsOf(c);   // read again: a rename or a removal made while the pictures were saved stands
    if (n && now.length >= F.PACK_MAX) { log('import-refused', { why: 'full' }); toast('This campaign holds as many packs as it can, ' + F.PACK_MAX + '.'); return; }
    if (n) { var pk = F.cleanPack({ id: id, name: nm, looks: looks }, srcRule()); if (pk) { c.furnPacks = now.concat([pk]); save(); if (window.wpFurnish) window.wpFurnish.draw(); } }   // written to the campaign it began in, whichever is on screen now
    log('import', { n: n, left: left.kind + left.picture + left.upload + left.twice + left.over, solid: left.solid });
    toast(importWords(nm, n, left));
    draw();
}
// Every pack id held in any campaign, so that a new pack's pictures never share a folder with another's
function allIds() { var cs = state.appState && state.appState.campaigns, out = []; Object.keys(cs && typeof cs === 'object' ? cs : {}).forEach(function(k) { var c = cs[k]; if (c && Array.isArray(c.furnPacks)) out.push(c.furnPacks); }); return out; }
// One import or one save at a time: a second waits for nothing and is said
async function once(fn) {
    if (_w.busy) { toast('A pack is still being brought in. Try again when it is done.'); return; }
    _w.busy = true; try { await fn(); } finally { _w.busy = false; }
}
function isZip(u) { return u.length >= 4 && u[0] === 0x50 && u[1] === 0x4b && u[2] === 0x03 && u[3] === 0x04; }
async function importFile(file) {
    var F = FU(); if (!F || !file) return;
    if (file.size > FILE_MAX) { toast('That file is too large to be a pack.'); return; }
    var head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (isZip(head)) return importZip(file);
    var j; try { j = JSON.parse(await file.text()); } catch (e) { j = null; }
    var got = j ? readPackFile(F, j) : null;
    if (!got) { toast('That is no furnishing pack.'); log('import-refused', { why: 'not a pack' }); return; }
    var items = got.looks.map(function(l) { try { return { k: l.k, era: l.era, bytes: bytesOf(l.data) }; } catch (e) { return { k: l.k, era: l.era, bytes: new Uint8Array(0) }; } });
    await bringIn(got.name || String(file.name || '').replace(/\.[^.]*$/, ''), items, got.left);
}
// A .zip, such as the template filled in: its pack folder's pictures, never the reference folder's (furncore pickLooks)
async function importZip(file) {
    var F = FU(), z; try { var zip = await import('./zip.js'); z = await zip.zipOpen(file); } catch (e) { z = null; }
    if (!z) { toast('That .zip could not be read.'); log('import-refused', { why: 'zip' }); return; }
    var ents = z.entries.slice(0, FOLDER_MAX), pick = F.pickLooks(ents.map(function(e) { return e.name; })), items = [];
    for (var i = 0; i < pick.looks.length; i++) {
        var l = pick.looks[i], e = ents[l.i];
        if (!(e.size >= 0) || e.size > PIC_MAX) { items.push({ k: l.k, era: l.era, bytes: new Uint8Array(0) }); continue; }
        var b; try { b = await e.bytes(); } catch (er) { b = new Uint8Array(0); }
        items.push({ k: l.k, era: l.era, bytes: b });
    }
    if (!items.length) { toast('No picture in that .zip is named for a kind and an era, such as pack/chest-fantasy.png.'); log('import-refused', { why: 'no names', files: ents.length }); return; }
    await bringIn(String(file.name || '').replace(/\.zip$/i, ''), items, { kind: pick.left.kind, twice: pick.left.twice, over: Math.max(0, z.entries.length - FOLDER_MAX) });
}
async function importFolder(files) {
    var F = FU(); if (!F || !files || !files.length) return;
    var L = files.slice(0, FOLDER_MAX), name = '', items = [];
    L.forEach(function(f) { var rel = String(f.webkitRelativePath || ''); if (!name && rel.indexOf('/') > 0) name = rel.slice(0, rel.indexOf('/')); });
    var pick = F.pickLooks(L.map(function(f) { return String(f.webkitRelativePath || f.name || ''); }));
    for (var i = 0; i < pick.looks.length; i++) {
        var l = pick.looks[i], f = L[l.i];
        if (f.size > PIC_MAX) { items.push({ k: l.k, era: l.era, bytes: new Uint8Array(0) }); continue; }
        items.push({ k: l.k, era: l.era, bytes: new Uint8Array(await f.arrayBuffer()) });
    }
    if (!items.length) { toast('No picture in that folder is named for a kind and an era, such as chest-fantasy.png.'); log('import-refused', { why: 'no names', files: files.length }); return; }
    await bringIn(name || 'A pack', items, { kind: pick.left.kind, twice: pick.left.twice, over: Math.max(0, files.length - FOLDER_MAX) });
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
function fileName(name) { return String(name || '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'pack'; }
function download(blob, name) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
}
function exportLooksFile(name, looks) {
    var out = { wpfurn: 1, name: name, looks: {} };
    looks.forEach(function(l) { out.looks[l.k + '.' + l.era] = 'data:image/' + l.kind + ';base64,' + b64(l.bytes); });
    download(new Blob([JSON.stringify(out)], { type: 'application/json' }), fileName(name) + '.wpfurn');
    log('export', { as: 'file', n: looks.length }); toast('Exported ' + name + ' as one file, ' + looks.length + (looks.length === 1 ? ' picture.' : ' pictures.'));
}
async function exportLooksFolder(name, looks) {
    var F = FU();
    if (typeof window.showDirectoryPicker !== 'function') { toast('This window cannot write a folder. Export it as one file instead.'); return; }
    var dir; try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { return; }
    try {
        var sub = await dir.getDirectoryHandle(fileName(name), { create: true });
        for (var i = 0; i < looks.length; i++) { var l = looks[i], fh = await sub.getFileHandle(F.lookFile(l.k, l.era, l.kind === 'jpeg' ? 'jpg' : l.kind), { create: true }), wr = await fh.createWritable(); await wr.write(l.bytes); await wr.close(); }
        log('export', { as: 'folder', n: looks.length }); toast('Exported ' + name + ' as a folder of ' + looks.length + (looks.length === 1 ? ' picture.' : ' pictures.'));
    } catch (e) { log('export-failed', { as: 'folder' }); toast('The folder could not be written. Export it as one file instead.'); }
}
async function exportFile(p) { exportLooksFile(p.name, await looksOf(p)); }
async function exportFolder(p) { exportLooksFolder(p.name, await looksOf(p)); }

// ---- the template (fold 3): Waypoint's drawings at the size you pick, in a reference folder, beside an empty pack folder ----
function tplPx() { var F = FU(), v = ''; try { v = localStorage.getItem('wp_furnTplPx') || ''; } catch (e) {} return F.cleanTplPx(v); }
async function pngOf(svgSrc, w, h) {
    var im = new Image(); im.src = svgSrc; await im.decode();
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(im, 0, 0, w, h);
    var b = await new Promise(function(r) { cv.toBlob(r, 'image/png'); }); return new Uint8Array(await b.arrayBuffer());
}
async function template() {
    var F = FU(), px = tplPx(), enc = new TextEncoder(), ents = [];
    toast('Making the template…');
    try {
        for (var i = 0; i < F.FURN_KINDS.length; i++) for (var j = 0; j < F.FURN_ERAS.length; j++) {
            var k = F.FURN_KINDS[i], e = F.FURN_ERAS[j].id;
            ents.push({ name: 'reference/' + F.lookFile(k.key, e, 'png'), data: await pngOf(F.furnSrc({ k: k.key, era: e }), k.w * px, k.h * px) });
        }
        ents.push({ name: 'pack/Put your pictures here.txt', data: enc.encode('Put your pictures in this folder, named as the ones in the reference folder, such as chest-fantasy.png.\r\n') });
        ents.push({ name: 'How to make a pack.txt', data: enc.encode(F.tplGuide(px)) });
        var zip = await import('./zip.js');
        download(zip.zipCreate(ents), 'Furnishing pack template.zip');
        log('template', { px: px }); toast('The template is downloaded, ' + px + ' pixels a cell.');
    } catch (er) { log('template-failed', {}); toast('The template could not be made.'); }
}

// ---- the pack maker (fold 3): a grid of every kind and era, the picked one beside it at its real size ----
var _m = null;   // { camp, id, name, looks: { key: { src } or { bytes, kind, url } }, info: { key: { w, h, clear } or null }, sel, dirty }
function mkUrl(L) { if (!L) return ''; if (L.bytes) { if (!L.url) L.url = URL.createObjectURL(new Blob([L.bytes], { type: 'image/' + L.kind })); return L.url; } return L.src || ''; }
function mkFree() { if (_m) Object.keys(_m.looks).forEach(function(k) { var L = _m.looks[k]; if (L && L.url) URL.revokeObjectURL(L.url); }); }
function mkKeys() { var F = FU(), out = []; F.FURN_KINDS.forEach(function(k) { F.FURN_ERAS.forEach(function(e) { out.push(k.key + '.' + e.id); }); }); return out; }
function makerOpen(p) {
    var F = FU(); if (!F) return;
    if (!packMay(net(), window)) { toast('Furnishing packs are the GM’s.'); return; }
    mkFree();
    _m = { camp: campNow(), id: p ? p.id : '', name: p ? p.name : '', looks: {}, info: {}, sel: mkKeys()[0], dirty: false };
    if (p) Object.keys(p.looks || {}).forEach(function(k) { _m.looks[k] = { src: p.looks[k] }; });
    var m = $('furnMakerModal'); if (!m) return;
    m.style.display = 'flex'; makerDraw(); log('maker-open', { edit: p ? 1 : 0, n: Object.keys(_m.looks).length });
    var nm = $('furnMakerName'); if (nm && !p) nm.focus();
}
function makerShut() { mkFree(); _m = null; var m = $('furnMakerModal'); if (m) m.style.display = 'none'; draw(); }
function makerClose() {
    if (!_m) return makerShut();
    if (!_m.dirty) return makerShut();
    showConfirm('Close the pack maker? What you changed since the last save is lost.', function(ok) { if (ok) { log('maker-close', { saved: 0 }); makerShut(); } });
}
function makerDraw() {
    var F = FU(); if (!F || !_m) return;
    var tt = $('furnMakerTitle'); if (tt) tt.textContent = _m.id ? 'Edit a pack' : 'Make a pack';
    var nm = $('furnMakerName'); if (nm && document.activeElement !== nm) nm.value = _m.name;
    var n = Object.keys(_m.looks).length, cnt = $('furnMakerCount'); if (cnt) cnt.textContent = n + ' of ' + mkKeys().length + ' pictures';
    var grid = $('furnMakerGrid'); if (!grid) return;
    var had = document.activeElement && grid.contains(document.activeElement) ? document.activeElement.dataset.key : '';
    grid.textContent = '';
    grid.appendChild(el('div', 'fm-corner'));
    F.FURN_ERAS.forEach(function(e) { grid.appendChild(el('div', 'fm-era', e.label)); });
    F.FURN_GROUPS.forEach(function(g) {
        grid.appendChild(el('div', 'fm-group', g));
        F.FURN_KINDS.filter(function(k) { return k.group === g; }).forEach(function(k) {
            grid.appendChild(el('div', 'fm-kind', k.label));
            F.FURN_ERAS.forEach(function(e) {
                var key = k.key + '.' + e.id, L = _m.looks[key], b = el('button', 'fm-cell' + (L ? ' has' : '') + (key === _m.sel ? ' sel' : '')), im = el('img');
                b.type = 'button'; b.dataset.key = key; b.setAttribute('aria-pressed', key === _m.sel ? 'true' : 'false');
                b.setAttribute('aria-label', k.label + ', ' + e.label + (L ? ': your picture' : ': Waypoint’s drawing'));
                im.alt = ''; im.src = mkUrl(L) || F.furnSrc({ k: k.key, era: e.id }); if (!L) im.className = 'fm-ghost';
                b.appendChild(im); grid.appendChild(b);
            });
        });
    });
    if (had) { var back = grid.querySelector('[data-key="' + had + '"]'); if (back) back.focus(); }
    sideDraw();
}
function sideDraw() {
    var F = FU(), side = $('furnMakerSide'); if (!F || !side || !_m) return;
    side.textContent = '';
    var p = _m.sel.split('.'), kind = F.furnKind(p[0]), L = _m.looks[_m.sel], px = tplPx();
    side.appendChild(el('div', 'fm-label', kind.label + ', ' + F.eraLabel(p[1])));
    var s = Math.min(64, Math.floor(150 / Math.max(kind.w, kind.h))), row = el('div', 'fm-cmp');
    [['Waypoint’s drawing', F.furnSrc({ k: p[0], era: p[1] })], ['Your picture', mkUrl(L)]].forEach(function(x) {
        var box = el('div', 'fm-col'), chk = el('div', 'fm-chk'); chk.style.width = kind.w * s + 'px'; chk.style.height = kind.h * s + 'px';
        if (x[1]) { var im = el('img'); im.alt = ''; im.src = x[1]; chk.appendChild(im); } else chk.appendChild(el('span', 'fm-none', 'None yet'));
        box.appendChild(el('div', 'fm-mini', x[0])); box.appendChild(chk); row.appendChild(box);
    });
    side.appendChild(row);
    side.appendChild(el('div', 'fm-line', (kind.w === 1 && kind.h === 1 ? 'One cell' : kind.w + ' by ' + kind.h + ' cells') + ' on the map. ' + kind.w * px + ' by ' + kind.h * px + ' pixels is a good size. Clear parts show the checker.'));
    var bar = el('div', 'fm-btns'), use = btn('tool', 'Use a picture…', 'A png, jpeg or webp picture of 4 MB or less'), clr = btn('tool ghost', 'Clear', 'Take your picture off. Waypoint’s drawing stands in for it.');
    use.addEventListener('click', function() { var i = $('furnMakerFile'); if (i) { i.value = ''; i.click(); } });
    clr.disabled = !L; clr.addEventListener('click', function() { if (!_m.looks[_m.sel]) return; var o = _m.looks[_m.sel]; if (o.url) URL.revokeObjectURL(o.url); delete _m.looks[_m.sel]; delete _m.info[_m.sel]; _m.dirty = true; log('maker-clear', {}); makerDraw(); });
    bar.appendChild(use); bar.appendChild(clr); side.appendChild(bar);
    var st = el('div', 'fm-state'); side.appendChild(st);
    if (!L) return;
    var inf = _m.info[_m.sel];
    if (inf === undefined) {   // read once, then drawn again
        var key = _m.sel; st.textContent = 'Reading the picture…';
        (L.bytes ? Promise.resolve(new Blob([L.bytes])) : fetch(L.src).then(function(r) { return r.ok ? r.blob() : null; })).then(function(b) { return b ? picInfo(b) : null; }).then(function(v) { if (_m && _m.looks[key] === L) { _m.info[key] = v; if (_m.sel === key) sideDraw(); } }).catch(function() {});
        return;
    }
    if (!inf) { st.className = 'fm-state fm-bad'; st.textContent = 'This picture could not be read.'; return; }
    st.appendChild(el('div', 'fm-ok', (L.kind || (L.src.split('.').pop() || '')).toLowerCase() + ', ' + inf.w + ' by ' + inf.h + (inf.clear ? ', has a clear part' : '')));
    if (!inf.clear) st.appendChild(el('div', 'fm-warn', 'This picture has no clear part, so it covers its whole square.'));
    if (!F.fitsCells(p[0], inf.w, inf.h)) st.appendChild(el('div', 'fm-warn', 'Its shape is not its cells’ shape, so it is drawn whole in their middle.'));
}
async function makerUse(file) {
    var F = FU(); if (!F || !_m || !file) return;
    if (file.size > PIC_MAX) { toast('That picture is larger than 4 MB.'); return; }
    var u = new Uint8Array(await file.arrayBuffer()), kind = F.picKind(u);
    if (!kind) { toast('That is no png, jpeg or webp picture.'); log('maker-refused', { why: 'kind' }); return; }
    var key = _m.sel, o = _m.looks[key]; if (o && o.url) URL.revokeObjectURL(o.url);
    _m.looks[key] = { bytes: u, kind: kind }; _m.info[key] = await picInfo(new Blob([u])); _m.dirty = true;
    log('maker-use', { clear: _m.info[key] && _m.info[key].clear ? 1 : 0 });
    makerDraw();
}
function gridKey(ev) {
    var t = ev.target; if (!t || !t.dataset || !t.dataset.key) return;
    var F = FU(), keys = mkKeys(), i = keys.indexOf(t.dataset.key), cols = F.FURN_ERAS.length, j = -1;
    if (ev.key === 'ArrowRight') j = i + 1; else if (ev.key === 'ArrowLeft') j = i - 1; else if (ev.key === 'ArrowDown') j = i + cols; else if (ev.key === 'ArrowUp') j = i - cols;
    else if (ev.key === 'Home') j = i - (i % cols); else if (ev.key === 'End') j = i - (i % cols) + cols - 1; else return;
    ev.preventDefault(); ev.stopPropagation();
    if (j < 0 || j >= keys.length) return;
    _m.sel = keys[j]; makerDraw(); var b = $('furnMakerGrid').querySelector('[data-key="' + keys[j] + '"]'); if (b) b.focus();
}
// Save: new pictures are saved as the campaign's own, kept ones stay, and the pack is written to the campaign the maker began in
async function makerSave() {
    var F = FU(); if (!F || !_m) return;
    var nm = F.packName(_m.name); if (!nm) { toast('Give the pack a name.'); var ni = $('furnMakerName'); if (ni) ni.focus(); return; }
    var keys = Object.keys(_m.looks); if (!keys.length) { toast('Add at least one picture.'); return; }
    var c = _m.camp; if (!campLive(c)) { toast('The campaign this pack was begun in is gone.'); return; }
    var list = packsOf(c); if (!_m.id && list.length >= F.PACK_MAX) { toast('This campaign holds as many packs as it can, ' + F.PACK_MAX + '.'); return; }
    var id = _m.id || packIdOf(allIds(), Math.random() * 2176782336), looks = {}, failed = 0;
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i], L = _m.looks[key], p = key.split('.');
        if (L.src) { looks[key] = L.src; continue; }
        var src = await upload(id, p[0], p[1], L.bytes); if (!src) { failed++; continue; }
        if (L.url) URL.revokeObjectURL(L.url); _m.looks[key] = { src: src }; looks[key] = src;
    }
    if (failed) { log('maker-save-failed', { failed: failed }); toast(failed + (failed === 1 ? ' picture' : ' pictures') + ' could not be saved. Nothing was changed. Try Save again.'); makerDraw(); return; }
    if (!campLive(c)) { toast('The campaign this pack was begun in is gone.'); return; }
    var now = packsOf(c), pk = F.cleanPack({ id: id, name: nm, looks: looks }, srcRule()); if (!pk) return;
    var at = now.findIndex(function(x) { return x.id === id; });
    if (at < 0 && now.length >= F.PACK_MAX) { toast('This campaign holds as many packs as it can, ' + F.PACK_MAX + '.'); return; }
    if (at >= 0) now[at] = pk; else now.push(pk);
    c.furnPacks = now; save(); if (window.wpFurnish) window.wpFurnish.draw();
    _m.id = id; _m.name = nm; _m.dirty = false;
    log('maker-save', { n: keys.length, edit: at >= 0 ? 1 : 0 });
    toast('Saved ' + nm + ', ' + keys.length + (keys.length === 1 ? ' picture.' : ' pictures.') + ' Pieces already placed keep the pictures they have.');
    makerDraw(); draw();
}
async function makerLooks() {   // the draft's looks as bytes, for an export
    var F = FU(), out = [];
    for (var i = 0, keys = Object.keys(_m.looks); i < keys.length; i++) {
        var key = keys[i], L = _m.looks[key], p = key.split('.'), u = L.bytes;
        if (!u) { try { var r = await fetch(L.src); u = r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch (e) { u = null; } }
        var kind = u ? F.picKind(u) : ''; if (kind) out.push({ k: p[0], era: p[1], kind: kind, bytes: u });
    }
    return out;
}
async function makerExport(asFolder) {
    var F = FU(); if (!_m) return;
    var nm = F.packName(_m.name) || 'A pack', looks = await makerLooks();
    if (!looks.length) { toast('Add at least one picture.'); return; }
    if (asFolder) await exportLooksFolder(nm, looks); else exportLooksFile(nm, looks);
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
    var ed = btn('tool ghost', 'Edit', 'Open it in the pack maker'); ed.addEventListener('click', function() { makerOpen(p); });
    var ef = btn('tool ghost', 'Export a file', 'One .wpfurn file with its pictures inside, to keep or to send.'); ef.addEventListener('click', function() { exportFile(p); });
    var eo = btn('tool ghost', 'Export a folder', 'A folder of its pictures, each named for its kind and era, such as chest-fantasy.png.'); eo.addEventListener('click', function() { exportFolder(p); });
    var rm = btn('tool ghost danger', 'Remove', 'Take it out of this campaign. Pieces already placed keep their pictures.');
    rm.addEventListener('click', function() { showConfirm('Remove ' + p.name + ' from this campaign? Pieces already placed keep their pictures.', function(ok) { if (!ok) return; store(packsOf(campNow()).filter(function(x) { return x.id !== p.id; })); log('remove', {}); draw(); }); });   // showConfirm answers through its callback
    top.appendChild(ed); top.appendChild(ef); top.appendChild(eo); top.appendChild(rm);
    r.appendChild(top);
    return r;
}
function draw() {
    var F = FU(), box = $('furnPackList'); if (!F || !box) return;
    box.textContent = '';
    var list = packsOf(campNow());
    if (!list.length) box.appendChild(el('div', 'obj-none', 'No pack in this campaign yet. Make one, or bring one in from a file or a folder below.'));
    list.forEach(function(p) { box.appendChild(rowOf(F, p)); });
    var px = $('furnTplPx'); if (px && document.activeElement !== px) px.value = String(tplPx());
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
    on('furnPackMake', function() { makerOpen(null); });
    on('furnPackTemplate', function() { template(); });
    on('furnPackImportFile', function() { var i = $('furnPackFile'); if (i) { i.value = ''; i.click(); } });
    on('furnPackImportFolder', function() { var i = $('furnPackDir'); if (i) { i.value = ''; i.click(); } });
    on('furnPackFromOther', function() { _w.from = !_w.from; draw(); });
    var px = $('furnTplPx'); if (px) px.addEventListener('change', function() { var F = FU(), v = F.cleanTplPx(px.value); px.value = String(v); try { localStorage.setItem('wp_furnTplPx', String(v)); } catch (e) {} log('template-size', { px: v }); });
    var fi = $('furnPackFile'); if (fi) fi.addEventListener('change', function() { var f = fi.files && fi.files[0]; if (f) once(function() { return importFile(f); }); });
    var di = $('furnPackDir'); if (di) di.addEventListener('change', function() { var L = di.files && di.files.length ? Array.prototype.slice.call(di.files) : null; if (L) once(function() { return importFolder(L); }); });
    on('furnMakerClose', makerClose);
    on('furnMakerSave', function() { once(makerSave); });
    on('furnMakerExportFile', function() { makerExport(false); });
    on('furnMakerExportFolder', function() { makerExport(true); });
    var mn = $('furnMakerName'); if (mn) mn.addEventListener('input', function() { if (_m) { _m.name = mn.value; _m.dirty = true; } });
    var mf = $('furnMakerFile'); if (mf) mf.addEventListener('change', function() { var f = mf.files && mf.files[0]; if (f) makerUse(f); });
    var g = $('furnMakerGrid'); if (g) {
        g.addEventListener('click', function(ev) { var b = ev.target && ev.target.closest ? ev.target.closest('.fm-cell') : null; if (!b || !_m) return; _m.sel = b.dataset.key; makerDraw(); });
        g.addEventListener('keydown', gridKey);
    }
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
window.wpFurnPacks = { open: open, close: close, draw: draw, maker: makerOpen };
