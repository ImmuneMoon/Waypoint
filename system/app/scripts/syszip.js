/* syszip.js: a system exported whole, and read back (1.6.4; held over from the System editor review of 2026-11-21, built at Fulllion's pick
   of 2026-11-23). A .wpsystem.json carries the system alone, and a .wppack.json one pack: the packs a system's grants, needs and lists draw
   on, and the pictures entries name (paths under this computer's saves/images), stayed behind. This module makes one .zip of all of it, with
   zip.js, and reads such a .zip back through the checks every import already has.

   The file (format 'waypoint-system-zip', v 1), every entry stored as it is:
     manifest.json          { format, v, name, packs: [the pack entries' names, in order], pictures: how many }
     system.wpsystem.json   the cleaned system, the very text Export's "System alone" writes
     packs/<n>.wppack.json  each library pack of the campaign, 1 up, in the library's order: the Library window's GM copy (librarycore packFile)
     images/<path>          each picture the system and the packs name, at its path under saves/, as a Full export names it
   Each part is a file the app already reads alone: the system by the System editor's Import, a pack by the Library window's Import.

   Export takes everything, with no ticks. The plainest way for a GM to hand a whole system to another GM is one press, and the sheet of
   ticks Full export has is for a campaign, which holds far more. Two things stay home, and the closing words say so: a picture that wears
   a private tag of the Image Library (as on Full export, where such a tag starts unticked; sharecore picTags, privOff), and a pack this
   computer could not read.

   Import reads the .zip without unpacking it (zip.js zipOpen) and judges each entry before anything is written:
     - only system.wpsystem.json, packs/<n>.wppack.json and images/<path> are read; anything else is counted and passed over
     - every entry is read through check() (its checksum the archive's), against the import's budget: never more than twenty times the
       archive's own size in all, and no compressed entry said to grow out of proportion (main.js's import copy, the same rule)
     - the system is cleaned by the caller (systemcore cleanSystem), as a .wpsystem.json is
     - a pack is read by the Library window's own reader (librarycore readPackImport); one it refuses is counted, never kept
     - a picture's path must be a plain picture path (fogcore cleanTexSrc, the one rule a picture's path meets everywhere in the app):
       under images/, no walking segment, no escape, no Journal, video or sound folder, a picture's own extension. Any other is refused
   Nothing is written at import. The packs and pictures wait with the draft until Save, as a starter's packs do (sysedtabs.js
   starterSaved): the pictures are then written with keep=1, so never over a file already there, and the packs merged into the library by
   its own import plan (library.js starterPacks with byId: into the pack of the same id, else of the same name, else a new pack; librarycore
   packImportPlan by id, nothing removed).

   Every step writes one line to the app's log through D.log (steplog.js stepLog), area "syszip v1": counts and step names only, never a
   system's name or content. A failure is traced there: export-start, export-pack, export-pics, export-done or export-fail; import-start,
   import-refused, import-ready or import-fail; save-start, save-pics, save-done.

   Pure but for what it is handed: D is { fetch, log, ... } as each function says, so tools/syszipcheck.js runs all of it in Node. */

import { zipCreate, zipOpen, blobCrc32 } from './zip.js';
import { packFile, readPackImport, libCtx, LIB } from './librarycore.js';
import { cleanTexSrc } from './fogcore.js';
import { picTags, privOff } from './sharecore.js';

var FORMAT = 'waypoint-system-zip', V = 1;
var MANIFEST = 'manifest.json', SYSTEM = 'system.wpsystem.json';
var PACK_NAME = /^packs\/([0-9]{1,3})\.wppack\.json$/;
var MAX_PACKS = 32;                     // as many as a starter may bring (library.js starterPacks reads at most 32)
var MAX_PICS = 4096;                    // pictures one file may carry; past it the rest are counted as left out
var SYS_BYTES = 16 * 1024 * 1024;       // a system's file at most, as a pack's (LIB.fileBytes)
var MANIFEST_BYTES = 64 * 1024;         // the manifest is a few lines
var MIB = 1048576;

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function count(n, one, many) { return n + ' ' + (n === 1 ? one : many); }   // a count in real words (CLAUDE.md: "1 picture", "3 pictures")
function logOf(D) { return function(step, o) { try { if (D && typeof D.log === 'function') D.log('syszip v1', step, o || {}); } catch (e) {} }; }

/* ---- what a system names ---- */

// [syszipcheck:pics-start]
// The plain picture paths the texts name (the system's file, each pack's file), each once, in the order first met. Any text may hold
// "/saves/images/" (a name typed by hand is enough), so a path counts only where cleanTexSrc keeps it whole: the trailing quote, bracket
// or comma a scan picks up is taken off first, as io.js collectImagePaths does
function picsNamed(texts) {
    var seen = Object.create(null), out = [];
    (Array.isArray(texts) ? texts : []).forEach(function(t) {
        if (typeof t !== 'string') return;
        t.replace(/\/saves\/images\/[^"\\]+/g, function(m) {
            var p = m.replace(/['")>,;]+$/, '');
            if (cleanTexSrc(p) === p && !seen[p]) { seen[p] = 1; out.push(p); }
            return m;
        });
    });
    return out;
}
// The pictures among paths that wear a private tag of the Image Library (stores: the shared store and the campaign's, as Full export
// reads them). Such a picture stays on this computer, its path kept where it is named, as a picture left out of a Full export does
function privatePics(paths, stores) {
    var st = (Array.isArray(stores) ? stores : []).filter(isObj), off = privOff(st);
    if (!Object.keys(off).length) return [];
    return (Array.isArray(paths) ? paths : []).filter(function(p) { return picTags(st, p).some(function(n) { return off[n] === true; }); });
}
// The archive entry's name for a picture path, and back: '/saves/images/a/b.png' is 'images/a/b.png'. entryPic answers the path an
// entry would land at, or '' where its name is no plain picture path (then it is refused, never written)
function picEntry(p) { return p.replace(/^\/saves\//, ''); }
function entryPic(name) {
    if (typeof name !== 'string' || name.indexOf('images/') !== 0) return '';
    var p = '/saves/' + name; return cleanTexSrc(p) === p ? p : '';
}
// [syszipcheck:pics-end]

/* ---- export ---- */

// [syszipcheck:plan-start]
// What a whole export would carry, before anything is fetched: the system's text (exactly what "System alone" writes), each pack's
// file as the Library window's GM copy writes it, and the pictures they name, less those under a private tag.
//   clean: the system, cleaned in the GM's view, its name set (sysedtabs.js exportSystem)
//   packs: [{ meta: the manifest's pack ({ id, name, icon, vis }), entries: its entries, or null where the pack could not be read }]
//   ctx: the library's GM context (librarycore libCtx of the campaign's saved system), stores: the Image Library's tag stores
// Answers { sysText, packs: [{ name, text }], pics: [paths], priv: [paths left home], unread: packs not read }
function wholePlan(clean, packs, ctx, stores) {
    var sysText = JSON.stringify(clean, null, 1), out = [], unread = 0;
    (Array.isArray(packs) ? packs : []).forEach(function(p) {
        if (!p || !isObj(p.meta) || !Array.isArray(p.entries)) { unread++; return; }
        if (out.length >= MAX_PACKS) { unread++; return; }
        out.push({ name: 'packs/' + (out.length + 1) + '.wppack.json', text: JSON.stringify(packFile(p.meta, p.entries, ctx), null, 1) });
    });
    var named = picsNamed([sysText].concat(out.map(function(x) { return x.text; }))), priv = privatePics(named, stores);
    var pics = named.filter(function(p) { return priv.indexOf(p) < 0; }).slice(0, MAX_PICS);
    return { sysText: sysText, packs: out, pics: pics, priv: priv, over: Math.max(0, named.length - priv.length - MAX_PICS), unread: unread };
}
// The manifest: what the file is, and what it holds, so a reader knows it at once
function manifestOf(clean, plan, nPics) {
    return { format: FORMAT, v: V, name: typeof clean.name === 'string' ? clean.name : '', packs: plan.packs.map(function(x) { return x.name; }), pictures: nPics };
}
// [syszipcheck:plan-end]

// The plan of the campaign on screen. D: { camp (the campaign), lib (window.wpLibrary), F (the formula module), stores (the tag stores) }.
// Each pack is taken as the library holds it now (wpLibrary.ready and entriesOf); one it has not read stays home. Export asks its question
// from this plan, and buildWhole makes the file from it
function campPlan(clean, D) {
    var camp = D && D.camp, lib = D && D.lib, listed = camp && camp.library && Array.isArray(camp.library.packs) ? camp.library.packs : [];
    var packs = listed.map(function(p) {
        var ok = !!p && typeof p.id === 'string' && !!lib && typeof lib.ready === 'function' && lib.ready(p.id) === true;
        return { meta: p, entries: ok ? lib.entriesOf(p.id) : null };
    });
    return wholePlan(clean, packs, libCtx(camp && camp.system, D && D.F, true), D && D.stores);
}
// [syszipcheck:build-start]
// The whole export as a .zip Blob. D: campPlan's, and fetch and log. Each picture is fetched from the saves folder as it lies, its checksum worked out once; one not there stays out and is counted.
// The archive is opened again before it is handed over (as io.js buildExport does), so a file that does not read back is never given.
// Answers { blob, packs, pics, unread, priv, missing, over } or throws, with where it stood in the log
async function buildWhole(clean, D) {
    var log = logOf(D), plan = campPlan(clean, D);
    log('export-start', { packs: plan.packs.length, unread: plan.unread, pics: plan.pics.length, priv: plan.priv.length });
    var enc = new TextEncoder(), pics = [], missing = 0;
    for (var i = 0; i < plan.pics.length; i++) {
        try {
            var r = await D.fetch(encodeURI(plan.pics[i]), { cache: 'no-store' });
            if (!r || !r.ok) { missing++; continue; }
            var b = await r.blob(); pics.push({ name: picEntry(plan.pics[i]), data: b, crc: await blobCrc32(b) });
        } catch (e) { missing++; }
    }
    log('export-pics', { got: pics.length, missing: missing });
    var entries = [{ name: MANIFEST, data: enc.encode(JSON.stringify(manifestOf(clean, plan, pics.length), null, 1)) }, { name: SYSTEM, data: enc.encode(plan.sysText) }];
    plan.packs.forEach(function(x, k) { entries.push({ name: x.name, data: enc.encode(x.text) }); log('export-pack', { at: k + 1, bytes: x.text.length }); });
    var blob;
    try {
        blob = zipCreate(entries.concat(pics));
        var back = await zipOpen(blob);
        if (back.entries.length !== entries.length + pics.length) throw new Error('its list of files did not read back');
    } catch (e) { log('export-fail', { where: 'archive' }); throw e; }
    log('export-done', { bytes: blob.size, packs: plan.packs.length, pics: pics.length });
    return { blob: blob, packs: plan.packs.length, pics: pics.length, unread: plan.unread, priv: plan.priv.length, missing: missing, over: plan.over };
}
// The file's name: the system's name, as "System alone" makes it, and .wpsystem.zip
function zipName(name) { return (String(name || 'system').replace(/[^A-Za-z0-9_ -]+/g, '').trim().replace(/ +/g, '_').slice(0, 40) || 'system') + '.wpsystem.zip'; }
// [syszipcheck:build-end]

// [syszipcheck:words-start]
// The question Export asks where there is more than the system to carry (a pack, or a picture the system names). "Whole system" makes
// the .zip, "System alone" the .wpsystem.json exactly as before
function askWords(nPacks, nPics) {
    var parts = []; if (nPacks) parts.push(count(nPacks, 'library pack', 'library packs')); if (nPics) parts.push(count(nPics, 'picture', 'pictures'));
    return 'Export this system whole, as one .zip with its ' + parts.join(' and ') + '? Another GM can Import it into any campaign. System alone saves only the .wpsystem.json, as before.';
}
// What a whole export made, and what stayed home, in plain words
function exportWords(r) {
    var s = 'System exported whole, with ' + count(r.packs, 'library pack', 'library packs') + ' and ' + count(r.pics, 'picture', 'pictures') + '.', left = [];
    if (r.unread) left.push(count(r.unread, 'pack', 'packs') + ' this computer could not read');
    if (r.missing) left.push(count(r.missing, 'picture', 'pictures') + ' not found in your saves folder');
    if (r.over) left.push(count(r.over, 'picture', 'pictures') + ' past the ' + MAX_PICS + ' one file holds');
    if (left.length) s += ' Left out: ' + left.join(', ') + '.';
    if (r.priv) s += ' ' + count(r.priv, 'picture', 'pictures') + ' under a private tag stayed on this computer.';
    return s;
}
// What an import brings, said once the system is in the editor. Nothing is written until Save
function importWords(b) {
    var s = '', left = [];
    if (b.texts.length || b.pics.length) {
        var parts = []; if (b.texts.length) parts.push(count(b.texts.length, 'library pack', 'library packs') + ' with ' + count(b.entries, 'entry', 'entries')); if (b.pics.length) parts.push(count(b.pics.length, 'picture', 'pictures'));
        s = 'It brings ' + parts.join(' and ') + '. They are added to this campaign when you Save, and nothing of yours is replaced.';
        if (b.texts.length) s += ' Until then, an entry the system names from them shows as missing.';   // the editor's error list says so too, and clears once Save brings the packs in
    }
    if (b.left.badPacks) left.push(count(b.left.badPacks, 'pack that is not a Waypoint pack', 'packs that are not Waypoint packs'));
    if (b.left.dropped) left.push(count(b.left.dropped, 'pack entry that is not valid', 'pack entries that are not valid'));
    if (b.left.badPics) left.push(count(b.left.badPics, 'picture whose path is not a plain picture path', 'pictures whose paths are not plain picture paths'));
    if (b.left.overPacks) left.push(count(b.left.overPacks, 'pack', 'packs') + ' past the ' + MAX_PACKS + ' one file may bring');
    if (b.left.overPics) left.push(count(b.left.overPics, 'picture', 'pictures') + ' past the ' + MAX_PICS + ' one file may bring');
    if (b.left.big) left.push(count(b.left.big, 'file', 'files') + ' larger than this file can hold');
    if (b.left.other) left.push(count(b.left.other, 'file', 'files') + ' a system file does not carry');
    if (left.length) s += (s ? ' ' : '') + 'Left out: ' + left.join(', ') + '.';
    return s;
}
// What Save wrote of an imported system's packs and pictures, in plain words. pr: savePictures' answer (null where there were none),
// lr: library.js starterPacks' answer (null where there were none)
function savedWords(pr, lr) {
    var s = [];
    if (lr && lr.error) s.push(lr.error);
    else if (lr) s.push('Library: ' + count(lr.packs, 'pack', 'packs') + ', ' + count(lr.add, 'entry', 'entries') + ' added' + (lr.update ? ', ' + lr.update + ' updated' : '') + (lr.skip ? ', ' + lr.skip + ' passed over, their ids already in another pack' : '') + (lr.bad ? '. ' + lr.bad + ' could not be added' : '') + '.');
    if (pr) s.push('Pictures: ' + pr.ok + ' added' + (pr.kept ? ', ' + pr.kept + ' already here' : '') + (pr.fail ? ', ' + pr.fail + ' failed (damaged in the file, or refused by the saves folder)' : '') + '.');
    return s.length ? 'From the imported system. ' + s.join(' ') : '';
}
// [syszipcheck:words-end]

/* ---- import ---- */

// [syszipcheck:read-start]
// One entry's bytes as text, through check(), under the budget. Throws on a refusal, with a short reason the log takes
async function entryText(en, budget) {
    if (en.method !== 0 && en.size > en.csize * 20 + MIB) throw new Error('inflates');   // a file said to grow twentyfold is no export's
    budget.used += en.size; if (budget.used > budget.cap) throw new Error('budget');
    return new TextDecoder().decode(new Uint8Array(await (await en.check()).arrayBuffer()));
}
// A system .zip read, nothing written. D: { F, log }; clean(json): the caller's cleaner (cleanSystem in the GM's view), answering the
// system or null. Answers { error } (plain words), or { system (cleaned), json (as read), texts: [pack files as text, in order],
// entries (how many entries those packs hold), pics: [archive entries, judged], budget: { cap, used }, left: { counts by reason } }
async function readWhole(file, clean, D) {
    var log = logOf(D), z;
    try { z = await zipOpen(file); } catch (e) { log('import-fail', { where: 'open' }); return { error: 'That file is not a zip Waypoint can read.' }; }
    var by = Object.create(null); z.entries.forEach(function(en) { by[en.name] = en; });
    log('import-start', { entries: z.entries.length, bytes: z.size });
    if (by['data.json'] && !by[SYSTEM]) { log('import-refused', { why: 'campaign' }); return { error: 'That is a campaign export. Bring it in with Import on the top bar.' }; }
    var budget = { cap: z.size * 20 + MIB, used: 0 };
    if (by[MANIFEST]) {
        var man = null;
        try { if (by[MANIFEST].size > MANIFEST_BYTES) throw new Error('big'); man = JSON.parse(await entryText(by[MANIFEST], budget)); } catch (e) { man = null; }
        if (!isObj(man) || man.format !== FORMAT) { log('import-refused', { why: 'manifest' }); return { error: 'That zip is not a Waypoint system.' }; }
    }
    var se = by[SYSTEM]; if (!se) { log('import-refused', { why: 'nosystem' }); return { error: 'That zip holds no system.wpsystem.json, so it is not a Waypoint system.' }; }
    var json = null, sys = null;
    try { if (se.size > SYS_BYTES) throw new Error('big'); json = JSON.parse(await entryText(se, budget)); sys = clean(json); } catch (e) { sys = null; }
    if (!sys) { log('import-refused', { why: 'system' }); return { error: 'The system in that zip could not be read.' }; }
    var left = { badPacks: 0, dropped: 0, badPics: 0, overPacks: 0, overPics: 0, big: 0, other: 0 }, texts = [], nEntries = 0, pics = [];
    var packEs = z.entries.filter(function(en) { return PACK_NAME.test(en.name); }).sort(function(a, b) { return Number(PACK_NAME.exec(a.name)[1]) - Number(PACK_NAME.exec(b.name)[1]); });
    var ctx = libCtx(sys, D.F, true);
    for (var i = 0; i < packEs.length; i++) {
        if (texts.length >= MAX_PACKS) { left.overPacks++; continue; }
        if (packEs[i].size > LIB.fileBytes) { left.big++; continue; }
        var t = null; try { t = await entryText(packEs[i], budget); } catch (e) { left.badPacks++; log('import-refused', { why: 'pack', at: i + 1 }); continue; }
        var d = readPackImport(t, ctx); if (d.error) { left.badPacks++; log('import-refused', { why: 'pack', at: i + 1 }); continue; }
        texts.push(t); nEntries += d.entries.length; left.dropped += d.dropped || 0;
    }
    z.entries.forEach(function(en) {
        if (en.name === MANIFEST || en.name === SYSTEM || PACK_NAME.test(en.name)) return;
        if (en.name.indexOf('images/') !== 0) { left.other++; return; }
        if (!entryPic(en.name)) { left.badPics++; return; }
        if (pics.length >= MAX_PICS) { left.overPics++; return; }
        pics.push(en);
    });
    log('import-ready', { packs: texts.length, entries: nEntries, pics: pics.length, badpics: left.badPics, badpacks: left.badPacks, other: left.other });
    return { system: sys, json: json, texts: texts, entries: nEntries, pics: pics, budget: budget, left: left };
}
// [syszipcheck:read-end]

// [syszipcheck:save-start]
// At Save: the waiting pictures written into the saves folder. The pictures there now are listed once (/api/list-images), and one already
// there is counted as already here with nothing sent. Each other is read through check() under the import's budget, then sent with
// keep=1, so a file already there is never replaced (the saves folder answers 409, counted as already here). D: { fetch, log }.
// Answers { ok, kept, fail }
async function savePictures(pics, budget, D) {
    var log = logOf(D), out = { ok: 0, kept: 0, fail: 0 }, have = Object.create(null), list = Array.isArray(pics) ? pics : [];
    budget = isObj(budget) ? budget : { cap: 0, used: 0 };
    log('save-start', { pics: list.length });
    if (list.length) { try { var lr = await D.fetch('/api/list-images'); var ll = lr && lr.ok ? await lr.json() : null; (Array.isArray(ll) ? ll : []).forEach(function(x) { if (x && typeof x.path === 'string') have[x.path] = true; }); } catch (e) {} }
    for (var i = 0; i < list.length; i++) {
        var en = list[i], p = entryPic(en && en.name);
        if (!p) { out.fail++; continue; }   // judged again where it is written: a name that is no plain picture path never reaches the saves folder
        if (have[p] === true) { out.kept++; continue; }
        try {
            if (en.method !== 0 && en.size > en.csize * 20 + MIB) throw new Error('inflates');
            budget.used += en.size; if (budget.used > budget.cap) throw new Error('budget');
            var body = await en.check();   // its bytes straight from the picked file, only once its checksum is the archive's
            var r = await D.fetch('/api/upload-exact?keep=1&path=' + encodeURIComponent(picEntry(p)), { method: 'POST', body: body });
            if (r && r.ok) out.ok++; else if (r && r.status === 409) out.kept++; else out.fail++;
        } catch (e) { out.fail++; }
    }
    log('save-pics', out);
    return out;
}
// [syszipcheck:save-end]

var API = { FORMAT: FORMAT, V: V, MANIFEST: MANIFEST, SYSTEM: SYSTEM, MAX_PACKS: MAX_PACKS, MAX_PICS: MAX_PICS, picsNamed: picsNamed, privatePics: privatePics, picEntry: picEntry, entryPic: entryPic, wholePlan: wholePlan, campPlan: campPlan, manifestOf: manifestOf, buildWhole: buildWhole, zipName: zipName, askWords: askWords, exportWords: exportWords, importWords: importWords, savedWords: savedWords, readWhole: readWhole, savePictures: savePictures };
export { FORMAT, V, MANIFEST, SYSTEM, MAX_PACKS, MAX_PICS, picsNamed, privatePics, picEntry, entryPic, wholePlan, campPlan, manifestOf, buildWhole, zipName, askWords, exportWords, importWords, savedWords, readWhole, savePictures };
export default API;
