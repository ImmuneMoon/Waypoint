/* Furnishing packs (1.6.2, backlog 222, folds 2 and 3), the GM's window and the pack maker. The owner, 2026-11-12, by prompt: a pack lives in
   the campaign it was brought into and is shared with another campaign only when asked, a pack gives looks only, and a pack as a file is "give
   the option on either on export, and have import allow the same": one .wpfurn file with its pictures inside, or a folder of pictures named
   kind-era (chest-fantasy.png). Fold 4 (2026-11-13): a pack may also hold texture blocks, its own picture for any of Waypoint's 32 patterns
   (tex-bricks.png) and blocks of its own, each a name and the material it lays as (block-floor-Marble.png), made on the maker's Blocks tab. Fold 3, the maker: "Both, maker and guide", laid out as "A. Grid + picked one", a template of "A. Reference +
   empty" (one .zip, which Import a file takes back), its size "up to the user, defaulting to 200" a cell, and a picture with no clear part
   "A. Kept, with a word".

   A pack is kept as camp.furnPacks, cleaned by furncore cleanPacks, never sent (net.js deletes it). Each picture is saved as one of the
   campaign's own pictures under images/<pack id>/, and is checked on the way in by its first bytes (png, jpeg or webp), its size and the kind and
   era it names. A placed look keeps its picture, so a pack removed or renamed changes nothing on a map. Everything here is the GM's, words are
   text nodes alone, and every step is logged ('furnpack v1'). */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save, toast, pressHold } from './io.js';
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
    var T = j.tiles && typeof j.tiles === 'object' && !Array.isArray(j.tiles) ? j.tiles : {}, B = Object.create(null);
    (Array.isArray(j.blocks) ? j.blocks.slice(0, 400) : []).forEach(function(b) { if (b && typeof b === 'object' && typeof b.id === 'string' && !B[b.id]) B[b.id] = { name: F.blockName(b.name), mat: F.MAT_IDS.indexOf(b.mat) >= 0 ? b.mat : '' }; });
    Object.keys(L).slice(0, 400).forEach(function(key) {
        var m = /^([a-z]+)\.([a-z0-9]+)$/.exec(key), it = null;
        if (m && F.lookKey(m[1], m[2])) it = { k: m[1], era: m[2] };
        else if (m && m[1] === 'tex' && F.texKey(m[2])) it = { key: key };   // fold 4: a pattern
        else if (m && m[1] === 'blk' && F.blockKey(m[2]) && B[m[2]] && B[m[2]].name && B[m[2]].mat) it = { blk: { name: B[m[2]].name, mat: B[m[2]].mat } };   // fold 4: a block, by the name and material the file gives it
        if (!it) { out.left.kind++; return; }
        var v = L[key];
        if (typeof v !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > PIC_MAX * 1.4) { out.left.picture++; return; }
        if (!it.k && (T[key] === 2 || T[key] === 4)) it.t = T[key];
        it.data = v; out.looks.push(it);
    });
    return out;
}
// The words that say what an import did. A picture with no clear part is kept, and said apart from what was left out
function importWords(name, n, left) {
    var w = n ? 'Brought in ' + name + ': ' + n + (n === 1 ? ' picture.' : ' pictures.') : 'Nothing of ' + name + ' could be brought in.';
    var bits = [];
    if (left.kind) bits.push(left.kind + (left.kind === 1 ? ' names' : ' name') + ' no furnishing, pattern or block');
    if (left.picture) bits.push(left.picture + (left.picture === 1 ? ' is' : ' are') + ' no png, jpeg or webp picture of 4 MB or less');
    if (left.twice) bits.push(left.twice + (left.twice === 1 ? ' is a second picture' : ' are second pictures') + ' for the same thing');
    if (left.upload) bits.push(left.upload + ' could not be saved');
    if (left.over) bits.push(left.over + (left.over === 1 ? ' file' : ' files') + ' past what a pack holds');
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
// Where a picture of a pack is saved among the campaign's own: a furnishing's chest-fantasy.png, a pattern's tex-bricks.png, a block's
// block-<id>.png (furncore storeFile)
async function upload(packId, key, u) {
    var F = FU(), kind = F.picKind(u); if (!kind || u.length > PIC_MAX) return '';
    var ext = kind === 'jpeg' ? 'jpg' : kind, blob = new Blob([u], { type: 'image/' + kind }), file = F.storeFile(key, ext);
    if (!file || typeof window.wpUploadBlob !== 'function') return '';
    try { var url = await window.wpUploadBlob(packId, file, blob), r = srcRule(); return r ? (r(url) || '') : ''; } catch (e) { return ''; }
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
// An item a file or a folder gave: a furnishing { k, era }, a pattern { key: 'tex.<name>' }, or a block { blk: { name, mat } }, each with its
// bytes and the cells one picture covers (fold 4)
function itemOf(l, bytes) { var o = { k: l.k, era: l.era, key: l.key, t: l.t, bytes: bytes }; if (l.blk) o.blk = l.blk; return o; }
async function bringIn(name, items, pre) {   // items: [itemOf]; pre: what the file or the folder already left out
    var F = FU(), c = campNow(); if (!F || !c) return;
    if (packsOf(c).length >= F.PACK_MAX) { toast('This campaign holds as many packs as it can, ' + F.PACK_MAX + '.'); return; }
    var id = packIdOf(allIds(), Math.random() * 2176782336), looks = {}, tiles = {}, blocks = [], names = Object.create(null), n = 0;
    var left = { kind: pre && pre.kind || 0, picture: pre && pre.picture || 0, upload: 0, twice: pre && pre.twice || 0, over: pre && pre.over || 0, solid: 0 };
    for (var i = 0; i < items.length; i++) {
        var it = items[i], bn = it.blk ? F.blockName(it.blk.name) : '', key;
        if (it.blk) { if (!bn || F.MAT_IDS.indexOf(it.blk.mat) < 0) { left.kind++; continue; } if (names[bn.toLowerCase()]) { left.twice++; continue; } if (blocks.length >= F.BLOCK_MAX) { left.over++; continue; } key = 'blk.' + F.newBlockId(blocks); }
        else key = typeof it.key === 'string' && it.key.slice(0, 4) === 'tex.' ? F.texKey(it.key.slice(4)) : F.lookKey(it.k, it.era);
        if (!key) { left.kind++; continue; } if (looks[key]) { left.twice++; continue; }
        if (!F.picKind(it.bytes) || it.bytes.length > PIC_MAX) { left.picture++; continue; }
        var src = await upload(id, key, it.bytes); if (!src) { left.upload++; continue; }
        if (key.slice(0, 4) !== 'tex.' && key.slice(0, 4) !== 'blk.') { var inf = await picInfo(new Blob([it.bytes])); if (inf && !inf.clear) left.solid++; }   // kept, and said; a pattern or a block covers its square anyway
        looks[key] = src; n++;
        if (it.blk) { names[bn.toLowerCase()] = 1; blocks.push({ id: key.slice(4), name: bn, mat: it.blk.mat }); }
        if ((it.t === 2 || it.t === 4) && key.indexOf('.') > 0 && (key.slice(0, 4) === 'tex.' || key.slice(0, 4) === 'blk.')) tiles[key] = it.t;
    }
    var nm = F.packName(name) || 'A pack';
    if (n && !campLive(c)) { log('import-refused', { why: 'campaign gone' }); toast('The campaign ' + nm + ' was brought into is gone, so the pack was not kept.'); return; }
    var now = packsOf(c);   // read again: a rename or a removal made while the pictures were saved stands
    if (n && now.length >= F.PACK_MAX) { log('import-refused', { why: 'full' }); toast('This campaign holds as many packs as it can, ' + F.PACK_MAX + '.'); return; }
    if (n) { var pk = F.cleanPack({ id: id, name: nm, looks: looks, tiles: tiles, blocks: blocks }, srcRule()); if (pk) { c.furnPacks = now.concat([pk]); save(); if (window.wpFurnish) window.wpFurnish.draw(); bdraw(); } }   // written to the campaign it began in, whichever is on screen now
    log('import', { n: n, blocks: blocks.length, left: left.kind + left.picture + left.upload + left.twice + left.over, solid: left.solid });
    toast(importWords(nm, n, left));
    draw();
}
// Build's palette and its Looks list follow a pack that changes (fold 4)
function bdraw() { if (typeof window.wpBuildSync === 'function') { try { window.wpBuildSync(); } catch (e) {} } }
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
    var items = got.looks.map(function(l) { var b; try { b = bytesOf(l.data); } catch (e) { b = new Uint8Array(0); } return itemOf(l, b); });
    await bringIn(got.name || String(file.name || '').replace(/\.[^.]*$/, ''), items, got.left);
}
// A .zip, such as the template filled in: its pack folder's pictures, never the reference folder's (furncore pickLooks)
async function importZip(file) {
    var F = FU(), z; try { var zip = await import('./zip.js'); z = await zip.zipOpen(file); } catch (e) { z = null; }
    if (!z) { toast('That .zip could not be read.'); log('import-refused', { why: 'zip' }); return; }
    var ents = z.entries.slice(0, FOLDER_MAX), pick = F.pickLooks(ents.map(function(e) { return e.name; })), items = [];
    for (var i = 0; i < pick.looks.length; i++) {
        var l = pick.looks[i], e = ents[l.i];
        if (!(e.size >= 0) || e.size > PIC_MAX) { items.push(itemOf(l, new Uint8Array(0))); continue; }
        var b; try { b = await e.bytes(); } catch (er) { b = new Uint8Array(0); }
        items.push(itemOf(l, b));
    }
    if (!items.length) { toast('No picture in that .zip is named for a furnishing, a pattern or a block, such as pack/chest-fantasy.png or pack/tex-bricks.png.'); log('import-refused', { why: 'no names', files: ents.length }); return; }
    await bringIn(String(file.name || '').replace(/\.zip$/i, ''), items, { kind: pick.left.kind, twice: pick.left.twice, over: Math.max(0, z.entries.length - FOLDER_MAX) });
}
async function importFolder(files) {
    var F = FU(); if (!F || !files || !files.length) return;
    var L = files.slice(0, FOLDER_MAX), name = '', items = [];
    L.forEach(function(f) { var rel = String(f.webkitRelativePath || ''); if (!name && rel.indexOf('/') > 0) name = rel.slice(0, rel.indexOf('/')); });
    var pick = F.pickLooks(L.map(function(f) { var rel = String(f.webkitRelativePath || f.name || ''), at = rel.indexOf('/'); return at >= 0 ? rel.slice(at + 1) : rel; }));   // the folder picked is the pack, whatever it is called
    for (var i = 0; i < pick.looks.length; i++) {
        var l = pick.looks[i], f = L[l.i];
        if (f.size > PIC_MAX) { items.push(itemOf(l, new Uint8Array(0))); continue; }
        items.push(itemOf(l, new Uint8Array(await f.arrayBuffer())));
    }
    if (!items.length) { toast('No picture in that folder is named for a furnishing, a pattern or a block, such as chest-fantasy.png or tex-bricks.png.'); log('import-refused', { why: 'no names', files: files.length }); return; }
    await bringIn(name || 'A pack', items, { kind: pick.left.kind, twice: pick.left.twice, over: Math.max(0, files.length - FOLDER_MAX) });
}
// Each picture's bytes, read from the campaign's own picture, as items that say what they are: a furnishing, a pattern with its tile, a block
// with its name, material and tile
async function looksOf(p) {
    var F = FU(), out = [], blocks = F.packBlocks(p), tiles = p.tiles || {};
    var keys = Object.keys(p.looks || {});
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i], src = p.looks[key], bits = key.split('.'), it = { key: key, t: tiles[key] === 2 || tiles[key] === 4 ? tiles[key] : 1 };
        if (bits[0] === 'blk') { var b = blocks.filter(function(x) { return x.key === key; })[0]; if (!b) continue; it.blk = { id: b.id, name: b.name, mat: b.mat }; }
        else if (bits[0] !== 'tex') { it.k = bits[0]; it.era = bits[1]; }
        try { var r = await fetch(src); if (!r.ok) continue; var u = new Uint8Array(await r.arrayBuffer()), kind = F.picKind(u); if (kind) { it.kind = kind; it.bytes = u; out.push(it); } } catch (er) {}
    }
    return out;
}
// A picture's file name in an exported folder
function fileOfItem(F, l) {
    var ext = l.kind === 'jpeg' ? 'jpg' : l.kind;
    if (l.blk) return F.blockFile(l.blk, ext, l.t);
    if (typeof l.key === 'string' && l.key.slice(0, 4) === 'tex.') return F.texFile(l.key.slice(4), ext, l.t);
    return F.lookFile(l.k, l.era, ext);
}
function b64(u) { var s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function fileName(name) { return String(name || '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'pack'; }
function download(blob, name) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 2000);
}
function exportLooksFile(name, looks) {
    var out = { wpfurn: 1, name: name, looks: {} }, tiles = {}, blocks = [];
    looks.forEach(function(l) {
        out.looks[l.key] = 'data:image/' + l.kind + ';base64,' + b64(l.bytes);
        if (l.t === 2 || l.t === 4) tiles[l.key] = l.t;
        if (l.blk) blocks.push({ id: l.key.slice(4), name: l.blk.name, mat: l.blk.mat });
    });
    if (Object.keys(tiles).length) out.tiles = tiles; if (blocks.length) out.blocks = blocks;   // fold 4: a pack of furnishings alone is written as it always was
    download(new Blob([JSON.stringify(out)], { type: 'application/json' }), fileName(name) + '.wpfurn');
    log('export', { as: 'file', n: looks.length }); toast('Exported ' + name + ' as one file, ' + looks.length + (looks.length === 1 ? ' picture.' : ' pictures.'));
}
async function exportLooksFolder(name, getLooks) {   // getLooks: a function that reads the pictures, asked once the folder is picked
    var F = FU();
    if (typeof window.showDirectoryPicker !== 'function') { toast('This window cannot write a folder. Export it as one file instead.'); return; }
    var dir; try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { if (!e || e.name !== 'AbortError') { log('export-failed', { as: 'folder', why: 'picker' }); toast('No folder could be picked here. Export it as one file instead.'); } return; }
    try {
        var looks = await getLooks(); if (!looks.length) { toast('There is no picture to export.'); return; }
        var sub = await dir.getDirectoryHandle(fileName(name), { create: true });
        for (var i = 0; i < looks.length; i++) { var l = looks[i], fn = fileOfItem(F, l); if (!fn) continue; var fh = await sub.getFileHandle(fn, { create: true }), wr = await fh.createWritable(); await wr.write(l.bytes); await wr.close(); }
        log('export', { as: 'folder', n: looks.length }); toast('Exported ' + name + ' as a folder of ' + looks.length + (looks.length === 1 ? ' picture.' : ' pictures.'));
    } catch (e) { log('export-failed', { as: 'folder' }); toast('The folder could not be written. Export it as one file instead.'); }
}
async function exportFile(p) { exportLooksFile(p.name, await looksOf(p)); }
async function exportFolder(p) { exportLooksFolder(p.name, function() { return looksOf(p); }); }

// ---- the template (fold 3): Waypoint's drawings at the size you pick, in a reference folder, beside an empty pack folder ----
function tplPx() { var F = FU(), v = ''; try { v = localStorage.getItem('wp_furnTplPx') || ''; } catch (e) {} return F.cleanTplPx(v); }
async function pngOf(svgSrc, w, h) {
    var im = new Image(); im.src = svgSrc; await im.decode();
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(im, 0, 0, w, h);
    var b = await new Promise(function(r) { cv.toBlob(r, 'image/png'); }); return new Uint8Array(await b.arrayBuffer());
}
// Fold 4: a pattern's own colour, the first material that wears it, else a stone grey
function texColor(BC, n) { var hit = ''; (BC.MATERIAL_IDS || []).some(function(id) { var M = BC.MATERIALS[id]; if (M && M.texture === n) { hit = M.color; return true; } return false; }); return /^#[0-9a-f]{6}$/i.test(hit) ? hit : '#6b6672'; }
// One cell of a pattern as Waypoint draws it, px by px: its colour, then its tile repeated as on the map, 50 board pixels a cell
async function texPng(n, px) {
    var BC = window.wpBuildCore, css = BC && BC.TEX_CSS && BC.TEX_CSS[n], T = BC && BC.TEX && BC.TEX[n]; if (!css || !T) return null;
    var m = /^url\("(.*)"\)$/.exec(css.image); if (!m) return null;
    var im = new Image(); im.src = m[1]; await im.decode();
    var cv = document.createElement('canvas'), g = cv.getContext('2d'), s = px / 50; cv.width = px; cv.height = px;
    g.fillStyle = texColor(BC, n); g.fillRect(0, 0, px, px);
    var pt = g.createPattern(im, 'repeat');   // the tile at its own size, scaled with the canvas below
    g.save(); g.scale(s, s); g.fillStyle = pt; g.fillRect(0, 0, 50, 50); g.restore();
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
        for (var t = 0; t < F.TEX_NAMES.length; t++) { var tb = await texPng(F.TEX_NAMES[t], px); if (tb) ents.push({ name: 'reference/' + F.texFile(F.TEX_NAMES[t], 'png'), data: tb }); }   // fold 4: each pattern, one cell
        ents.push({ name: 'pack/Put your pictures here.txt', data: enc.encode('Put your pictures in this folder, named as the ones in the reference folder, such as chest-fantasy.png or tex-bricks.png.\r\nA block of your own is named block, the material it lays as, and its name, such as block-floor-Marble.png.\r\n') });
        ents.push({ name: 'How to make a pack.txt', data: enc.encode(F.tplGuide(px)) });
        var zip = await import('./zip.js');
        download(zip.zipCreate(ents), 'Furnishing pack template.zip');
        log('template', { px: px }); toast('The template is downloaded, ' + px + ' pixels a cell.');
    } catch (er) { log('template-failed', {}); toast('The template could not be made.'); }
}

// ---- the pack maker (fold 3): a grid of every kind and era, the picked one beside it at its real size. Fold 4 (the owner: "Blocks tab in the
// maker"): a Blocks tab of Waypoint's 32 patterns beside yours, the pack's own blocks under them and + Block, the picked one shown 3 by 3 with
// its seams marked ----
var _m = null;   // { camp, id, name, looks: { key: { src } or { bytes, kind, url } }, info: { key: { w, h, clear } or null }, tiles: { key: 2 or 4 }, blocks: [{ id, name, mat }], tab, sel, selF, selB, dirty }
function mkUrl(L) { if (!L) return ''; if (L.bytes) { if (!L.url) L.url = URL.createObjectURL(new Blob([L.bytes], { type: 'image/' + L.kind })); return L.url; } return L.src || ''; }
function mkFree() { if (_m) Object.keys(_m.looks).forEach(function(k) { var L = _m.looks[k]; if (L && L.url) URL.revokeObjectURL(L.url); }); }
function mkKeys() {
    var F = FU(), out = [];
    if (_m && _m.tab === 'blk') { F.TEX_NAMES.forEach(function(n) { out.push('tex.' + n); }); _m.blocks.forEach(function(b) { out.push('blk.' + b.id); }); return out; }
    F.FURN_KINDS.forEach(function(k) { F.FURN_ERAS.forEach(function(e) { out.push(k.key + '.' + e.id); }); }); return out;
}
function mkIsBlock(key) { return typeof key === 'string' && (key.slice(0, 4) === 'tex.' || key.slice(0, 4) === 'blk.'); }
function mkBlock(key) { return _m && key.slice(0, 4) === 'blk.' ? _m.blocks.filter(function(b) { return 'blk.' + b.id === key; })[0] || null : null; }
function mkTile(key) { var t = _m && _m.tiles[key]; return t === 2 || t === 4 ? t : 1; }
function makerOpen(p) {
    var F = FU(); if (!F) return;
    if (!packMay(net(), window)) { toast('Furnishing packs are the GM’s.'); return; }
    if (_m && _m.saving) { toast('A pack is still being saved. Try again when it is done.'); return; }
    mkFree();
    _m = { camp: campNow(), id: p ? p.id : '', name: p ? p.name : '', looks: {}, info: {}, tiles: {}, blocks: [], tab: 'furn', sel: '', selF: '', selB: 'tex.' + F.TEX_NAMES[0], dirty: false, rev: 0, saving: false };
    if (p) { Object.keys(p.looks || {}).forEach(function(k) { _m.looks[k] = { src: p.looks[k] }; }); Object.keys(p.tiles || {}).forEach(function(k) { _m.tiles[k] = p.tiles[k]; }); (p.blocks || []).forEach(function(b) { _m.blocks.push({ id: b.id, name: b.name, mat: b.mat }); }); }
    _m.sel = _m.selF = mkKeys()[0];
    var m = $('furnMakerModal'); if (!m) return;
    m.style.display = 'flex'; makerDraw(); log('maker-open', { edit: p ? 1 : 0, n: Object.keys(_m.looks).length });
    var nm = $('furnMakerName'); if (nm && !p) nm.focus();
}
function makerShut() { mkFree(); _m = null; var m = $('furnMakerModal'); if (m) m.style.display = 'none'; draw(); }
function makerClose() {
    if (!_m) return makerShut();
    if (_m.saving) { toast('The pack is still being saved. Close it when that is done.'); return; }
    if (!_m.dirty) return makerShut();
    showConfirm('Close the pack maker? What you changed since the last save is lost.', function(ok) { if (ok) { log('maker-close', { saved: 0 }); makerShut(); } });
}
function makerTab(tab) {
    if (!_m || (tab !== 'furn' && tab !== 'blk') || _m.tab === tab) return;
    if (_m.tab === 'furn') _m.selF = _m.sel; else _m.selB = _m.sel;
    _m.tab = tab; _m.sel = tab === 'blk' ? (mkKeys().indexOf(_m.selB) >= 0 ? _m.selB : mkKeys()[0]) : _m.selF;
    log('maker-tab', { tab: tab }); makerDraw();
}
// Waypoint's own swatch of a pattern, as a box of the size asked: its colour under its tile, the tile scaled to the box's cell
function texSwatch(n, size) {
    var BC = window.wpBuildCore, d = el('div', 'fm-swatch'), css = BC && BC.TEX_CSS && BC.TEX_CSS[n], T = BC && BC.TEX && BC.TEX[n];
    d.style.width = d.style.height = size + 'px';
    if (BC) d.style.backgroundColor = texColor(BC, n);
    if (css && T) { var s = size / 50; d.style.backgroundImage = css.image; d.style.backgroundSize = (T.w * s) + 'px ' + (T.h * s) + 'px'; }
    return d;
}
function makerDraw() {
    var F = FU(); if (!F || !_m) return;
    var tt = $('furnMakerTitle'); if (tt) tt.textContent = _m.id ? 'Edit a pack' : 'Make a pack';
    var nm = $('furnMakerName'); if (nm && document.activeElement !== nm) nm.value = _m.name;
    var keys = Object.keys(_m.looks), cnt = $('furnMakerCount');
    if (cnt) cnt.textContent = _m.tab === 'blk' ? keys.filter(function(k) { return k.slice(0, 4) === 'tex.'; }).length + ' of ' + F.TEX_NAMES.length + ' patterns, ' + _m.blocks.length + (_m.blocks.length === 1 ? ' block' : ' blocks')
        : keys.filter(function(k) { return !mkIsBlock(k); }).length + ' of ' + (F.FURN_KINDS.length * F.FURN_ERAS.length) + ' pictures';
    ['furn', 'blk'].forEach(function(t) { var b = $(t === 'furn' ? 'furnMakerTabFurn' : 'furnMakerTabBlk'); if (b) { b.classList.toggle('on', _m.tab === t); b.setAttribute('aria-selected', _m.tab === t ? 'true' : 'false'); b.tabIndex = _m.tab === t ? 0 : -1; } });
    var grid = $('furnMakerGrid'); if (!grid) return;
    var had = document.activeElement && grid.contains(document.activeElement) ? document.activeElement.dataset.key || document.activeElement.dataset.act || '' : '', sideEl = $('furnMakerSide'), act = document.activeElement && sideEl && sideEl.contains(document.activeElement) ? document.activeElement.dataset.act || '' : '';
    grid.textContent = '';
    grid.classList.toggle('fm-grid-blk', _m.tab === 'blk');
    grid.setAttribute('aria-label', _m.tab === 'blk' ? 'Waypoint’s patterns and your blocks. Pick one to give it a picture.' : 'Every kind in the four looks. Pick one to give it a picture.');
    var cell = function(key, label) {
        var L = _m.looks[key], b = el('button', 'fm-cell' + (L ? ' has' : '') + (key === _m.sel ? ' sel' : ''));
        b.type = 'button'; b.dataset.key = key; b.setAttribute('aria-pressed', key === _m.sel ? 'true' : 'false');
        b.setAttribute('aria-label', label + (L ? ': your picture' : ': none yet'));
        if (L) { var im = el('img'); im.alt = ''; im.src = mkUrl(L); b.appendChild(im); }
        return b;
    };
    if (_m.tab === 'blk') {
        grid.appendChild(el('div', 'fm-corner')); grid.appendChild(el('div', 'fm-era', 'Waypoint')); grid.appendChild(el('div', 'fm-era', 'Yours'));
        grid.appendChild(el('div', 'fm-group', 'Waypoint’s patterns'));
        var BC = window.wpBuildCore;
        F.TEX_NAMES.forEach(function(n) {
            var lab = (BC && BC.texName ? BC.texName(n) : n);
            grid.appendChild(el('div', 'fm-kind', lab)); grid.appendChild(texSwatch(n, 42));
            grid.appendChild(cell('tex.' + n, lab));
        });
        grid.appendChild(el('div', 'fm-group', 'Your blocks'));
        _m.blocks.forEach(function(b) {
            var M = BC && BC.MATERIALS[b.mat];
            grid.appendChild(el('div', 'fm-kind', b.name)); grid.appendChild(M ? texSwatch(M.texture, 42) : el('div'));
            grid.appendChild(cell('blk.' + b.id, b.name));
        });
        var add = btn('tool ghost fm-addblk', '+ Block', 'A block of this pack’s own: a name, the material it lays as, and its picture.'); add.dataset.act = 'addblock';
        add.addEventListener('click', makerAddBlock); grid.appendChild(add);
    } else {
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
    }
    if (had) { var back = grid.querySelector('[data-key="' + had + '"]') || grid.querySelector('[data-act="' + had + '"]'); if (back) back.focus(); }
    sideDraw();
    if (act && sideEl) { var to = sideEl.querySelector('[data-act="' + act + '"]'); if (!to || to.disabled) to = sideEl.querySelector('[data-act="use"]'); if (to) to.focus(); }
}
function sideDraw() {
    var F = FU(), side = $('furnMakerSide'); if (!F || !side || !_m) return;
    if (mkIsBlock(_m.sel)) return sideBlock(F, side);
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
    side.appendChild(useBar(L));
    var st = el('div', 'fm-state'); side.appendChild(st);
    if (!L) return;
    var inf = readInfo(L, sideDraw); if (inf === undefined) { st.textContent = 'Reading the picture…'; return; }
    if (!inf) { st.className = 'fm-state fm-bad'; st.textContent = 'This picture could not be read.'; return; }
    st.appendChild(el('div', 'fm-ok', (L.kind || (L.src.split('.').pop() || '')).toLowerCase() + ', ' + inf.w + ' by ' + inf.h + (inf.clear ? ', has a clear part' : '')));
    if (!inf.clear) st.appendChild(el('div', 'fm-warn', 'This picture has no clear part, so it covers its whole square.'));
    if (!F.fitsCells(p[0], inf.w, inf.h)) st.appendChild(el('div', 'fm-warn', 'Its shape is not its cells’ shape, so it is drawn whole in their middle.'));
}
// Use a picture and Clear, under the picked square
function useBar(L) {
    var bar = el('div', 'fm-btns'), use = btn('tool', 'Use a picture…', 'A png, jpeg or webp picture of 4 MB or less'), clr = btn('tool ghost', 'Clear', mkIsBlock(_m.sel) ? 'Take your picture off.' : 'Take your picture off. Waypoint’s drawing stands in for it.');
    use.dataset.act = 'use'; clr.dataset.act = 'clear';
    use.addEventListener('click', function() { var i = $('furnMakerFile'); if (i) { i.value = ''; i.click(); } });
    clr.disabled = !L; clr.addEventListener('click', function() { if (!_m.looks[_m.sel]) return; var o = _m.looks[_m.sel]; if (o.url) URL.revokeObjectURL(o.url); delete _m.looks[_m.sel]; delete _m.info[_m.sel]; _m.dirty = true; _m.rev++; log('maker-clear', {}); makerDraw(); });
    bar.appendChild(use); bar.appendChild(clr);
    return bar;
}
// A picture's size and clear part, read once for the draft it was picked in, then drawn again; undefined while it is read
function readInfo(L, again) {
    var key = _m.sel, inf = _m.info[key];
    if (inf !== undefined) return inf;
    (L.bytes ? Promise.resolve(new Blob([L.bytes])) : fetch(L.src).then(function(r) { return r.ok ? r.blob() : null; })).then(function(b) { return b ? picInfo(b) : null; }).then(function(v) { if (_m && _m.looks[key] === L) { _m.info[key] = v; if (_m.sel === key) again(); } }).catch(function() {});
    return undefined;
}
// Fold 4: a pattern or a block beside Waypoint's own, shown 3 by 3 with gold lines where one picture meets the next, its tile chips, and for a
// block its name, the material it lays as and Remove
function sideBlock(F, side) {
    side.textContent = '';
    var BC = window.wpBuildCore, key = _m.sel, L = _m.looks[key], b = mkBlock(key), n = key.slice(4), t = mkTile(key), px = tplPx();
    var lab = b ? b.name : (BC && BC.texName ? BC.texName(n) : n);
    side.appendChild(el('div', 'fm-label', lab));
    if (b) {
        var nr = el('div', 'fm-field'), nl = el('label', 'fm-mini', 'Name'), ni = el('input'); ni.type = 'text'; ni.maxLength = 40; ni.value = b.name; ni.id = 'furnMakerBlkName'; nl.htmlFor = 'furnMakerBlkName'; ni.dataset.act = 'bname';
        ni.addEventListener('change', function() { var v = F.blockName(ni.value); if (!v) { ni.value = b.name; return; } if (_m.blocks.some(function(x) { return x !== b && x.name.toLowerCase() === v.toLowerCase(); })) { toast('Another block of this pack is called ' + v + '.'); ni.value = b.name; return; } b.name = v; _m.dirty = true; _m.rev++; makerDraw(); });
        nr.appendChild(nl); nr.appendChild(ni); side.appendChild(nr);
        var mr = el('div', 'fm-field'), ml = el('label', 'fm-mini', 'Lays as'), ms = el('select'); ms.id = 'furnMakerBlkMat'; ml.htmlFor = 'furnMakerBlkMat'; ms.dataset.act = 'bmat';
        ms.title = 'The material it lays as. The block takes that material’s rules: a wall stops sight and tokens, water costs movement.';
        (BC ? BC.MAT_KINDS : []).forEach(function(k) { var og = document.createElement('optgroup'); og.label = k.name; k.ids.forEach(function(id) { var o = el('option', '', BC.MATERIALS[id].name); o.value = id; og.appendChild(o); }); ms.appendChild(og); });
        ms.value = b.mat;
        ms.addEventListener('change', function() { if (F.MAT_IDS.indexOf(ms.value) < 0) return; b.mat = ms.value; _m.dirty = true; _m.rev++; log('maker-block-mat', {}); makerDraw(); });
        mr.appendChild(ml); mr.appendChild(ms); side.appendChild(mr);
    }
    var row = el('div', 'fm-cmp'), wcol = el('div', 'fm-col'), ycol = el('div', 'fm-col');
    var wn = b ? (BC && BC.MATERIALS[b.mat] ? BC.MATERIALS[b.mat].texture : '') : n;
    wcol.appendChild(el('div', 'fm-mini', b ? 'Its material, as Waypoint draws it' : 'Waypoint’s pattern'));
    if (wn) wcol.appendChild(texSwatch(wn, 64));
    ycol.appendChild(el('div', 'fm-mini', 'Yours, 3 by 3'));
    var prev = el('div', 'fm-tile3'), u = mkUrl(L), c = 32;   // three cells of 32 px a side
    if (u) { prev.style.backgroundImage = 'url("' + u.replace(/["\\]/g, '') + '")'; prev.style.backgroundSize = (c * t) + 'px ' + (c * t) + 'px'; prev.appendChild(el('div', 'fm-seams')); prev.lastChild.style.backgroundSize = (c * t) + 'px ' + (c * t) + 'px'; }
    else prev.appendChild(el('span', 'fm-none', 'None yet'));
    ycol.appendChild(prev);
    row.appendChild(wcol); row.appendChild(ycol); side.appendChild(row);
    var tr = el('div', 'fm-tiles'); tr.setAttribute('role', 'group'); tr.setAttribute('aria-label', 'How many cells one picture covers');
    [1, 2, 4].forEach(function(v) {
        var tb = btn('tile-chip' + (t === v ? ' on' : ''), v === 1 ? '1 cell' : v + ' cells', v === 1 ? 'One picture covers one cell, as Waypoint’s patterns do.' : 'One picture covers ' + v + ' by ' + v + ' cells, for large stones or big tiles.');
        tb.dataset.act = 'tile' + v; tb.setAttribute('aria-pressed', t === v ? 'true' : 'false');
        tb.addEventListener('click', function() { if (v === 1) delete _m.tiles[key]; else _m.tiles[key] = v; _m.dirty = true; _m.rev++; log('maker-tile', { t: v }); makerDraw(); });
        tr.appendChild(tb);
    });
    side.appendChild(tr);
    side.appendChild(el('div', 'fm-line', 'Gold lines show where one picture meets the next: make its edges meet without a seam. ' + (t * px) + ' by ' + (t * px) + ' pixels is a good size. A piece’s Tile size can still change it on the map.'));
    var bar = useBar(L);
    if (b) { var rm = btn('tool ghost danger', 'Remove block', 'Take this block out of the pack. Pieces already laid keep their picture.'); rm.dataset.act = 'bremove'; rm.addEventListener('click', function() { makerRemoveBlock(b); }); bar.appendChild(rm); }
    side.appendChild(bar);
    var st = el('div', 'fm-state'); side.appendChild(st);
    if (!L) return;
    var inf = readInfo(L, sideDraw); if (inf === undefined) { st.textContent = 'Reading the picture…'; return; }
    if (!inf) { st.className = 'fm-state fm-bad'; st.textContent = 'This picture could not be read.'; return; }
    st.appendChild(el('div', 'fm-ok', (L.kind || (L.src.split('.').pop() || '')).toLowerCase() + ', ' + inf.w + ' by ' + inf.h));
    if (Math.abs(inf.w - inf.h) > Math.max(inf.w, inf.h) / 20) st.appendChild(el('div', 'fm-warn', 'It is not square, so it is stretched to a square on the map.'));
}
function makerAddBlock() {
    var F = FU(); if (!F || !_m) return;
    if (_m.blocks.length >= F.BLOCK_MAX) { toast('A pack holds ' + F.BLOCK_MAX + ' blocks at most.'); return; }
    var n = 1, name = 'New block'; while (_m.blocks.some(function(x) { return x.name.toLowerCase() === name.toLowerCase(); })) name = 'New block ' + (++n);
    var b = { id: F.newBlockId(_m.blocks), name: name, mat: 'floor' }; _m.blocks.push(b);
    _m.sel = 'blk.' + b.id; _m.dirty = true; _m.rev++; log('maker-block-add', {});
    makerDraw(); var ni = $('furnMakerBlkName'); if (ni) { ni.focus(); ni.select(); }
}
function makerRemoveBlock(b) {
    if (!_m) return;
    var key = 'blk.' + b.id, o = _m.looks[key]; if (o && o.url) URL.revokeObjectURL(o.url);
    delete _m.looks[key]; delete _m.info[key]; delete _m.tiles[key];
    _m.blocks = _m.blocks.filter(function(x) { return x !== b; });
    _m.sel = mkKeys()[0]; _m.dirty = true; _m.rev++; log('maker-block-remove', {}); makerDraw();
    var g = $('furnMakerGrid'), a = g ? g.querySelector('[data-act="addblock"]') : null; if (a) a.focus();
}
async function makerUse(file) {
    var F = FU(); if (!F || !_m || !file) return;
    if (file.size > PIC_MAX) { toast('That picture is larger than 4 MB.'); return; }
    var u = new Uint8Array(await file.arrayBuffer()), kind = F.picKind(u);
    if (!kind) { toast('That is no png, jpeg or webp picture.'); log('maker-refused', { why: 'kind' }); return; }
    var d = _m; if (!d) return;
    var key = d.sel, o = d.looks[key]; if (o && o.url) URL.revokeObjectURL(o.url);
    var L = { bytes: u, kind: kind }; d.looks[key] = L; d.info[key] = undefined; d.dirty = true; d.rev++;
    var inf = await picInfo(new Blob([u])); if (d.looks[key] === L) d.info[key] = inf;   // the picture it was read for, on the draft it was picked in
    log('maker-use', { clear: inf && inf.clear ? 1 : 0, block: mkIsBlock(key) ? 1 : 0 });
    if (_m === d) makerDraw();
}
function gridKey(ev) {
    var t = ev.target; if (!t || !t.dataset || !t.dataset.key) return;
    var F = FU(), keys = mkKeys(), i = keys.indexOf(t.dataset.key), cols = _m && _m.tab === 'blk' ? 1 : F.FURN_ERAS.length, j = -1;
    if (ev.key === 'ArrowRight') j = i + 1; else if (ev.key === 'ArrowLeft') j = i - 1; else if (ev.key === 'ArrowDown') j = i + cols; else if (ev.key === 'ArrowUp') j = i - cols;
    else if (ev.key === 'Home') j = cols === 1 ? 0 : i - (i % cols); else if (ev.key === 'End') j = cols === 1 ? keys.length - 1 : i - (i % cols) + cols - 1; else return;
    ev.preventDefault(); ev.stopPropagation();
    if (j < 0 || j >= keys.length) return;
    _m.sel = keys[j]; makerDraw(); var b = $('furnMakerGrid').querySelector('[data-key="' + keys[j] + '"]'); if (b) b.focus();
}
// Save: new pictures are saved as the campaign's own, kept ones stay, and the pack is written to the campaign the maker began in
async function makerSave() {
    var F = FU(), d = _m; if (!F || !d) return;
    var nm = F.packName(d.name); if (!nm) { toast('Give the pack a name.'); var ni = $('furnMakerName'); if (ni) ni.focus(); return; }
    var keys = Object.keys(d.looks); if (!keys.length) { toast('Add at least one picture.'); return; }
    var bare = d.blocks.filter(function(b) { return !d.looks['blk.' + b.id]; })[0];   // fold 4: a block needs its picture
    if (bare) { toast('The block ' + bare.name + ' has no picture yet. Give it one, or remove it.'); if (d.tab !== 'blk') makerTab('blk'); d.sel = 'blk.' + bare.id; makerDraw(); return; }
    var c = d.camp; if (!campLive(c)) { toast('The campaign this pack was begun in is gone.'); return; }
    var list = packsOf(c); if (!d.id && list.length >= F.PACK_MAX) { toast('This campaign holds as many packs as it can, ' + F.PACK_MAX + '.'); return; }
    var id = d.id || packIdOf(allIds(), Math.random() * 2176782336), looks = {}, failed = 0, snap = {}, rev = d.rev, tiles = Object.assign({}, d.tiles), blocks = d.blocks.map(function(b) { return { id: b.id, name: b.name, mat: b.mat }; });
    keys.forEach(function(k) { snap[k] = d.looks[k]; });   // what the draft held when Save was pressed
    d.id = id; d.saving = true;
    try {
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i], L = snap[key];
            if (L.src) { looks[key] = L.src; continue; }
            var src = await upload(id, key, L.bytes); if (!src) { failed++; continue; }
            looks[key] = src;
            if (d.looks[key] === L) { if (L.url) URL.revokeObjectURL(L.url); d.looks[key] = { src: src, kind: L.kind }; }   // a picture changed meanwhile stays as it is now
        }
    } finally { d.saving = false; }
    var here = _m === d;
    if (failed) { log('maker-save-failed', { failed: failed }); toast(failed + (failed === 1 ? ' picture' : ' pictures') + ' could not be saved. Nothing was changed. Try Save again.'); if (here) makerDraw(); return; }
    if (!campLive(c)) { toast('The campaign this pack was begun in is gone.'); return; }
    var now = packsOf(c), pk = F.cleanPack({ id: id, name: nm, looks: looks, tiles: tiles, blocks: blocks }, srcRule()); if (!pk) return;
    var at = now.findIndex(function(x) { return x.id === id; });
    if (at < 0 && now.length >= F.PACK_MAX) { toast('This campaign holds as many packs as it can, ' + F.PACK_MAX + '.'); return; }
    if (at >= 0) now[at] = pk; else now.push(pk);
    c.furnPacks = now; save(); if (window.wpFurnish) window.wpFurnish.draw(); bdraw();
    if (d.rev === rev) d.dirty = false;   // a change made while it saved is still to be saved
    log('maker-save', { n: keys.length, blocks: blocks.length, edit: at >= 0 ? 1 : 0, changedSince: d.rev === rev ? 0 : 1 });
    toast('Saved ' + nm + ', ' + keys.length + (keys.length === 1 ? ' picture.' : ' pictures.') + ' Pieces already placed keep the pictures they have.');
    if (here) makerDraw(); draw();
}
async function makerLooks() {   // the draft's pictures as bytes, for an export, each saying what it is
    var F = FU(), out = [];
    for (var i = 0, keys = Object.keys(_m.looks); i < keys.length; i++) {
        var key = keys[i], L = _m.looks[key], p = key.split('.'), u = L.bytes, b = mkBlock(key);
        if (!u) { try { var r = await fetch(L.src); u = r.ok ? new Uint8Array(await r.arrayBuffer()) : null; } catch (e) { u = null; } }
        var kind = u ? F.picKind(u) : ''; if (!kind) continue;
        var it = { key: key, kind: kind, bytes: u, t: mkTile(key) };
        if (p[0] === 'blk') { if (!b) continue; it.blk = { id: b.id, name: b.name, mat: b.mat }; } else if (p[0] !== 'tex') { it.k = p[0]; it.era = p[1]; }
        out.push(it);
    }
    return out;
}
async function makerExport(asFolder) {
    var F = FU(); if (!_m) return;
    var nm = F.packName(_m.name) || 'A pack'; if (!Object.keys(_m.looks).length) { toast('Add at least one picture.'); return; }
    if (asFolder) { await exportLooksFolder(nm, makerLooks); return; }
    var looks = await makerLooks(); if (!looks.length) { toast('Add at least one picture.'); return; }
    exportLooksFile(nm, looks);
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
    nm.addEventListener('change', function() { var v = F.packName(nm.value); if (!v) { nm.value = p.name; return; } store(packsOf(campNow()).map(function(x) { return x.id === p.id ? Object.assign({}, x, { name: v }) : x; })); log('rename', {}); drawSoon(); });
    txt.appendChild(nm); txt.appendChild(el('small', '', F.packCount(p) + (F.packCount(p) === 1 ? ' picture' : ' pictures')));
    top.appendChild(txt);
    var cur = function() { return packsOf(campNow()).find(function(x) { return x.id === p.id; }) || p; };   // the pack as it is now: a rename may land in the same press
    var ed = btn('tool ghost', 'Edit', 'Open it in the pack maker'); ed.addEventListener('click', function() { makerOpen(cur()); });
    var ef = btn('tool ghost', 'Export a file', 'One .wpfurn file with its pictures inside, to keep or to send.'); ef.addEventListener('click', function() { exportFile(cur()); });
    var eo = btn('tool ghost', 'Export a folder', 'A folder of its pictures, each named for what it is, such as chest-fantasy.png or tex-bricks.png.'); eo.addEventListener('click', function() { exportFolder(cur()); });
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
// Drawn again once a press that began in the list has landed, so a button pressed right after a rename is pressed (the review of fold 3)
function drawSoon() { var box = $('furnPackList'), h = box ? pressHold(box, window) : null; if (h && h.busy()) h.then(draw); else draw(); }
function open() {
    if (!packMay(net(), window)) { toast('Furnishing packs are the GM’s.'); return; }
    var m = $('furnPackModal'); if (!m) return;
    _w.from = false; draw(); m.style.display = 'flex'; log('open', {});
}
function close() { var m = $('furnPackModal'); if (m) m.style.display = 'none'; }
function wire() {
    var on = function(id, fn) { var e = $(id); if (e) e.addEventListener('click', fn); };
    on('furnPackClose', close);
    var pl = $('furnPackList'); if (pl) pressHold(pl, window);   // listening from the start, so the press that ends a rename is known as it begins
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
    on('furnMakerTabFurn', function() { makerTab('furn'); });
    on('furnMakerTabBlk', function() { makerTab('blk'); });
    var tabs = $('furnMakerTabs'); if (tabs) tabs.addEventListener('keydown', function(ev) { if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return; ev.preventDefault(); ev.stopPropagation(); if (!_m) return; makerTab(_m.tab === 'furn' ? 'blk' : 'furn'); var b = $(_m.tab === 'furn' ? 'furnMakerTabFurn' : 'furnMakerTabBlk'); if (b) b.focus(); });   // fold 4: the arrow keys move between the two tabs
    on('furnMakerExportFile', function() { makerExport(false); });
    on('furnMakerExportFolder', function() { makerExport(true); });
    var mn = $('furnMakerName'); if (mn) mn.addEventListener('input', function() { if (_m) { _m.name = mn.value; _m.dirty = true; _m.rev++; } });
    // 3. Delete and Backspace pressed in the maker are the maker's: on the map they delete what is selected behind it. On a picked square they clear it
    var mm = $('furnMakerModal'); if (mm) mm.addEventListener('keydown', function(ev) {
        if ((ev.key !== 'Delete' && ev.key !== 'Backspace') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        var t = ev.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) { ev.stopPropagation(); return; }
        ev.preventDefault(); ev.stopPropagation();
        if (t && t.dataset && t.dataset.key && _m && _m.looks[t.dataset.key]) { var o = _m.looks[t.dataset.key]; if (o.url) URL.revokeObjectURL(o.url); delete _m.looks[t.dataset.key]; delete _m.info[t.dataset.key]; _m.dirty = true; _m.rev++; log('maker-clear', { key: 1 }); makerDraw(); }
    });
    var mf = $('furnMakerFile'); if (mf) mf.addEventListener('change', function() { var f = mf.files && mf.files[0]; if (f) makerUse(f); });
    var g = $('furnMakerGrid'); if (g) {
        g.addEventListener('click', function(ev) { var b = ev.target && ev.target.closest ? ev.target.closest('.fm-cell') : null; if (!b || !_m) return; _m.sel = b.dataset.key; makerDraw(); });
        g.addEventListener('keydown', gridKey);
    }
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
window.wpFurnPacks = { open: open, close: close, draw: draw, maker: makerOpen };
