/* librarycore.js — the item library at scale (Stage 6, library L1a). Pure: no DOM, no network, no disk; it loads under Node.
   A campaign's library is a set of PACKS of item entries, kept beside the save (saves/library/<dir>/<packId>.<rev>.json) and
   listed by a MANIFEST in the campaign (camp.library). An entry IS an item definition (systemcore's cleanItemDef, so a row and
   the sheet read it as they read sys.items) plus text only a picker or a preview needs (desc, tags, ref) and the GM's own notes
   (gmNotes: never in the players' view). Everything that enters goes through here — a pack file read from disk, an imported
   .wppack.json, a manifest in a loaded save, and later (L3) every message on the wire — and comes out as plain arrays and objects
   (prototype-free maps inside). Build plan: docs/STAGE_6_LIBRARY_BUILD.md. */
import { cleanItemDef, statKeys, statPicks, cleanIcon } from './systemcore.js';

export var VERSION = 1;
export var LIB = Object.freeze({
    packs: 64, entries: 10000, total: 50000,          // packs per campaign, entries per pack, entries per library
    desc: 4000, gmNotes: 2000, tags: 8, tag: 24, ref: 40, packName: 60,
    fileBytes: 16 * 1024 * 1024, keepRevs: 5,          // a pack file (or an import) at most; revisions of a pack kept on disk
    reasons: 20                                        // the reasons an import lists (the rest counted)
});
export var DIR_RE = /^l_[a-z0-9]{8}$/, PACK_RE = /^p_[A-Za-z0-9_]{1,24}$/, ITEM_RE = /^i_[A-Za-z0-9_]{1,24}$/, HASH_RE = /^[0-9a-f]{8}$/;
var CTRL_LINE = /[\u0000-\u001f\u007f]/g, CTRL_TEXT = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

function map() { return Object.create(null); }
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function line(v, n) { return typeof v === 'string' ? v.slice(0, n * 2).replace(CTRL_LINE, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : ''; }   // one line
function prose(v, n) { return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(CTRL_TEXT, ' ').slice(0, n) : ''; }   // line breaks and tabs kept
// 8 hex characters (FNV-1a, 32 bits): a cheap fingerprint to tell two copies apart, never a secret
export function hashText(s) { s = String(s); var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }

// An entry, cleaned for a view: the item definition (the view's stat keys and choices), then the library's own text. The players'
// view never holds a GM-only entry, its GM-only parts (cleanItemDef's), or gmNotes. ctx = { F, gmView, sys } (sys: the view the
// stats are read against; none: the key rule alone). Keys absent from the source stay absent (a plain item stays byte-identical).
export function libCtx(sys, F, gmView) { var fields = isObj(sys) && Array.isArray(sys.fields) ? sys.fields : null; return { F: F, gmView: !!gmView, keys: fields ? statKeys(fields) : undefined, picks: fields ? statPicks(fields) : undefined }; }
export function cleanLibEntry(e, ctx) {
    ctx = ctx || {};
    var out = cleanItemDef(e, ctx.F, !!ctx.gmView, ctx.keys, ctx.picks); if (!out) return null;
    var d = prose(e.desc, LIB.desc); if (d.trim()) out.desc = d;
    if (Array.isArray(e.tags)) { var seen = map(), tg = []; e.tags.forEach(function(t) { var x = line(t, LIB.tag); if (x && !seen[x.toLowerCase()] && tg.length < LIB.tags) { seen[x.toLowerCase()] = 1; tg.push(x); } }); if (tg.length) out.tags = tg; }
    var r = line(e.ref, LIB.ref); if (r) out.ref = r;
    if (ctx.gmView) { var g = prose(e.gmNotes, LIB.gmNotes); if (g.trim()) out.gmNotes = g; }
    return out;
}
// the fingerprint of an entry as a view holds it (players' view: what a player's cache and badge compare — a GM-only edit never moves it)
export function entryHash(entry) { return hashText(JSON.stringify(entry)); }

// A pack as stored: { format, v, id, rev, entries }. Its entries cleaned in the GM's view, one per id (the first), at most
// LIB.entries; `seen` (optional, a map shared across the library) keeps an id unique across packs. The name, icon and who may see
// it live in the manifest, so a file names no campaign. Returns { pack, dropped, reasons } or null when it is not a pack at all.
export function cleanPack(p, ctx, seen) {
    if (!isObj(p) || (p.format !== undefined && p.format !== 'waypoint-pack') || typeof p.id !== 'string' || !PACK_RE.test(p.id)) return null;
    var rev = typeof p.rev === 'number' && isFinite(p.rev) ? Math.max(0, Math.min(1e9, Math.floor(p.rev))) : 0;
    var out = { format: 'waypoint-pack', v: VERSION, id: p.id, rev: rev, entries: [] }, dropped = 0, reasons = [], ids = seen || map();
    var why = function(r) { dropped++; if (reasons.length < LIB.reasons) reasons.push(r); };
    (Array.isArray(p.entries) ? p.entries : []).forEach(function(e, i) {
        if (out.entries.length >= LIB.entries) { why('entry ' + (i + 1) + ': past ' + LIB.entries + ' entries in one pack'); return; }
        var c = cleanLibEntry(e, ctx); if (!c) { why('entry ' + (i + 1) + ': not a valid item (it needs an id like i_name)'); return; }
        if (ids[c.id]) { why('entry ' + (i + 1) + ': the id ' + c.id + ' is already used'); return; }
        ids[c.id] = 1; out.entries.push(c);
    });
    return { pack: out, dropped: dropped, reasons: reasons };
}
// A pack file's text read: at most LIB.fileBytes, JSON, a pack. { pack, dropped, reasons } or { error }
export function readPackFile(text, ctx, seen) {
    if (typeof text !== 'string') return { error: 'That is not a pack file.' };
    if (text.length > LIB.fileBytes) return { error: 'That pack is larger than ' + Math.round(LIB.fileBytes / 1048576) + ' MB.' };
    var j; try { j = JSON.parse(text); } catch (e) { return { error: 'That pack file is not valid JSON.' }; }
    if (!isObj(j) || j.format !== 'waypoint-pack') return { error: 'That is not a Waypoint pack file.' };
    return cleanPack(j, ctx, seen) || { error: 'That pack file has no valid id (p_name).' };
}

// The manifest a campaign carries: { v, dir, packs: [{ id, name, icon, vis, rev, count, bytes, hash }] } — at most LIB.packs,
// one per id. dir names the pack folder (generated, never a campaign id: campaign ids come from imported files). null when it
// is not one (a campaign without a library stays as it was).
export function cleanManifest(m) {
    if (!isObj(m) || typeof m.dir !== 'string' || !DIR_RE.test(m.dir)) return null;
    var out = { v: VERSION, dir: m.dir, packs: [] }, ids = map();
    (Array.isArray(m.packs) ? m.packs : []).forEach(function(p) {
        if (!isObj(p) || typeof p.id !== 'string' || !PACK_RE.test(p.id) || ids[p.id] || out.packs.length >= LIB.packs) return;
        ids[p.id] = 1;
        var q = { id: p.id, name: line(p.name, LIB.packName) || 'Pack', vis: p.vis === 'gm' ? 'gm' : 'all', rev: 0, count: 0, bytes: 0, hash: '' }, ic = cleanIcon(p.icon); if (ic) q.icon = ic;
        ['rev', 'count', 'bytes'].forEach(function(k) { var n = p[k]; if (typeof n === 'number' && isFinite(n)) q[k] = Math.max(0, Math.min(k === 'bytes' ? LIB.fileBytes : 1e9, Math.floor(n))); });
        if (typeof p.hash === 'string' && HASH_RE.test(p.hash)) q.hash = p.hash;
        out.packs.push(q);
    });
    return out;
}
// a new folder name for a library (l_ + 8 lower-case letters and digits); rnd: a function returning [0, 1)
export function newDir(rnd) { rnd = rnd || Math.random; var s = 'l_'; for (var i = 0; i < 8; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(rnd() * 36) % 36); return s; }
// a pack file's name on disk for a revision
export function packFileName(packId, rev) { return PACK_RE.test(String(packId)) && typeof rev === 'number' && rev >= 0 && rev <= 1e9 && Math.floor(rev) === rev ? packId + '.' + rev + '.json' : ''; }

// The manifest's operations (L1c), pure: a campaign's manifest with a new empty pack (its folder made the first time), without one, and
// a pack's facts once written — how many entries, the file's size, and the fingerprint of what players see of it (their view of each
// entry, a GM-only one left out: adding a hidden entry never moves it)
export function manifestSig(camp) { var m = isObj(camp) ? camp.library : null; return isObj(m) && Array.isArray(m.packs) ? String(camp.id) + '|' + m.dir + '|' + m.packs.map(function(p) { return p.id + '.' + p.rev; }).join(',') : ''; }
export function addPack(manifest, name, rnd) {
    rnd = rnd || Math.random;
    var m = cleanManifest(manifest) || { v: VERSION, dir: newDir(rnd), packs: [] }; if (m.packs.length >= LIB.packs) return null;
    var id = '', taken = map(); m.packs.forEach(function(p) { taken[p.id] = 1; });
    for (var k = 0; k < 20 && (!id || taken[id]); k++) { id = 'p_'; for (var i = 0; i < 8; i++) id += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(rnd() * 36) % 36); }
    if (taken[id]) return null;
    m.packs.push({ id: id, name: line(name, LIB.packName) || 'Pack', vis: 'all', rev: 0, count: 0, bytes: 0, hash: '' });
    return { manifest: m, id: id };
}
export function removePack(manifest, id) { var m = cleanManifest(manifest); if (!m) return null; m.packs = m.packs.filter(function(p) { return p.id !== id; }); return m; }
export function nextRev(manifest, id) { var m = cleanManifest(manifest), p = m ? m.packs.filter(function(x) { return x.id === id; })[0] : null; return p ? Math.min(1e9, p.rev + 1) : 0; }
export function packMeta(entries, plCtx, bytes) {
    var hs = []; (Array.isArray(entries) ? entries : []).forEach(function(e) { var p = cleanLibEntry(e, plCtx); if (p) hs.push(p.id + ':' + entryHash(p)); });
    return { count: Array.isArray(entries) ? entries.length : 0, bytes: typeof bytes === 'number' && bytes > 0 ? Math.min(LIB.fileBytes, Math.floor(bytes)) : 0, hash: hs.length ? hashText(hs.join('|')) : '' };
}
// L1c2: how an imported campaign's library lands here. A manifest from a file is used only with its pack files (a zip carries them as
// library/<its dir>/<id>.<rev>.json). Into a campaign with no library it gets a fresh folder (never the file's, which may be one this
// machine already uses); into one that has a library, its packs join that folder — a pack id already there takes a revision past both,
// since a revision is never rewritten with other content. At most LIB.packs (the rest counted). A pack never written (revision 0) copies
// nothing. { manifest, uploads: [{ dir, pack, rev, from }], left } or null when there is nothing to bring
export function libImportPlan(existing, imported, rnd) {
    var im = cleanManifest(imported); if (!im || !im.packs.length) return null;
    var out = cleanManifest(existing) || { v: VERSION, dir: newDir(rnd), packs: [] }, uploads = [], left = 0;
    im.packs.forEach(function(p) {
        var from = 'library/' + im.dir + '/' + p.id + '.' + p.rev + '.json', have = out.packs.filter(function(q) { return q.id === p.id; })[0];
        if (have) {
            var rev = p.rev ? Math.min(1e9, Math.max(have.rev, p.rev) + 1) : have.rev;
            if (p.rev) { have.name = p.name; have.vis = p.vis; if (p.icon) have.icon = p.icon; else delete have.icon; have.rev = rev; have.count = p.count; have.bytes = p.bytes; have.hash = p.hash; uploads.push({ dir: out.dir, pack: p.id, rev: rev, from: from }); }
            return;
        }
        if (out.packs.length >= LIB.packs) { left++; return; }
        out.packs.push(JSON.parse(JSON.stringify(p))); if (p.rev) uploads.push({ dir: out.dir, pack: p.id, rev: p.rev, from: from });
    });
    return { manifest: out, uploads: uploads, left: left };
}
// L2a: the Library window's rules, pure. A search matches when every word appears in an entry's name, key, category, tags or reference
// (case and accents aside); an entry is built from the window's form as typed text (tags comma-separated, a stat a number or a choice's
// name) and then cleaned like any entry; a new entry gets a fresh i_ id; a key another entry of the library also uses is reported
// (a warning: a key only has to be unique within the lists that draw on it); a pack's name, icon and who may see it change in the manifest
function fold(s) { s = s == null ? '' : String(s); return (s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s).toLowerCase(); }
export function searchEntries(entries, q) {
    var list = Array.isArray(entries) ? entries : [], words = fold(q).split(/\s+/).filter(Boolean).slice(0, 12); if (!words.length) return list.slice();
    return list.filter(function(e) { if (!isObj(e)) return false; var hay = fold([e.name, e.key, e.category, (e.tags || []).join(' '), e.ref].join(' ')); return words.every(function(w) { return hay.indexOf(w) >= 0; }); });
}
export function entryFromForm(f) {
    f = isObj(f) ? f : {}; var s = function(v) { return typeof v === 'string' ? v : v == null ? '' : String(v); };
    var out = { id: s(f.id), name: s(f.name), key: s(f.key).trim(), category: s(f.category), icon: s(f.icon), vis: f.vis === 'gm' ? 'gm' : 'all', notes: s(f.notes), desc: s(f.desc), ref: s(f.ref), gmNotes: s(f.gmNotes), damage: s(f.damage), cost: s(f.cost), throwSkill: s(f.throwSkill).trim() };
    var tags = s(f.tags).split(',').map(function(t) { return t.trim(); }).filter(Boolean); if (tags.length) out.tags = tags;
    var lv = s(f.lvl).trim(); if (/^-?\d+$/.test(lv)) out.lvl = Number(lv);
    if (isObj(f.stats)) { var st = {}, n = 0; Object.keys(f.stats).forEach(function(k) { var v = s(f.stats[k]).trim(); if (!v) return; st[k] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; n++; }); if (n) out.stats = st; }
    var ft = s(f.areaFt).trim(); if (/^\d+$/.test(ft) && Number(ft) > 0) out.area = { ft: Number(ft), shape: s(f.areaShape) || 'circle', name: s(f.areaName) };   // the shape as it was (the cleaner keeps a known one)
    return out;
}
export function newEntryId(taken, rnd) {
    rnd = rnd || Math.random; var has = typeof taken === 'function' ? taken : function(id) { return !!(taken && taken[id]); };
    for (var k = 0; k < 50; k++) { var id = 'i_'; for (var i = 0; i < 8; i++) id += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(rnd() * 36) % 36); if (!has(id)) return id; }
    return '';
}
export function keyClashes(entries, entry) { var k = isObj(entry) && typeof entry.key === 'string' ? entry.key.toLowerCase() : ''; if (!k) return []; return (Array.isArray(entries) ? entries : []).filter(function(e) { return isObj(e) && e.id !== entry.id && typeof e.key === 'string' && e.key.toLowerCase() === k; }); }
export function setPackMeta(manifest, id, meta) {
    var m = cleanManifest(manifest); if (!m || !isObj(meta)) return null; var p = m.packs.filter(function(x) { return x.id === id; })[0]; if (!p) return null;
    if (meta.name !== undefined) p.name = line(meta.name, LIB.packName) || 'Pack';
    if (meta.vis !== undefined) p.vis = meta.vis === 'gm' ? 'gm' : 'all';
    if (meta.icon !== undefined) { var ic = cleanIcon(meta.icon); if (ic) p.icon = ic; else delete p.icon; }
    return m;
}
// L2a: the library by key (lower case) for the core (systemcore coreOf): each pack's entries in the manifest's order; a GM-only pack's
// entries count as GM-only (copies marked so: the players' view of the core drops them, as it drops any GM-only entry)
export function keyIndex(manifest, entriesOf) {
    var m = map(), packs = isObj(manifest) && Array.isArray(manifest.packs) ? manifest.packs : []; if (typeof entriesOf !== 'function') return m;
    packs.forEach(function(p) { if (!isObj(p)) return; var list = entriesOf(p.id); (Array.isArray(list) ? list : []).forEach(function(e) { var k = isObj(e) && typeof e.key === 'string' ? e.key.toLowerCase() : ''; if (!k) return; (m[k] = m[k] || []).push(p.vis === 'gm' && e.vis !== 'gm' ? Object.assign({}, e, { vis: 'gm' }) : e); }); });
    return m;
}
// L3's index row (a picker lists thousands of these): [id, key, name, category, icon, tags, hash] from a players'-view entry, and
// its cleaner (a client takes nothing else from a host)
export function indexRow(e) { return [e.id, e.key || '', e.name, e.category || '', e.icon || '', Array.isArray(e.tags) ? e.tags.slice() : [], entryHash(e)]; }
export function cleanIndexRow(r) {
    if (!Array.isArray(r) || r.length !== 7 || typeof r[0] !== 'string' || !ITEM_RE.test(r[0])) return null;
    var key = typeof r[1] === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(r[1]) ? r[1] : '', tags = Array.isArray(r[5]) ? r[5].map(function(t) { return line(t, LIB.tag); }).filter(Boolean).slice(0, LIB.tags) : [];
    if (typeof r[6] !== 'string' || !HASH_RE.test(r[6])) return null;
    return [r[0], key, line(r[2], 60) || 'Item', line(r[3], 40), cleanIcon(r[4]), tags, r[6]];
}

var API = { VERSION: VERSION, searchEntries: searchEntries, entryFromForm: entryFromForm, newEntryId: newEntryId, keyClashes: keyClashes, setPackMeta: setPackMeta, keyIndex: keyIndex, libImportPlan: libImportPlan, manifestSig: manifestSig, addPack: addPack, removePack: removePack, nextRev: nextRev, packMeta: packMeta, LIB: LIB, DIR_RE: DIR_RE, PACK_RE: PACK_RE, ITEM_RE: ITEM_RE, HASH_RE: HASH_RE, hashText: hashText, libCtx: libCtx, cleanLibEntry: cleanLibEntry, entryHash: entryHash, cleanPack: cleanPack, readPackFile: readPackFile, cleanManifest: cleanManifest, newDir: newDir, packFileName: packFileName, indexRow: indexRow, cleanIndexRow: cleanIndexRow };
if (typeof window !== 'undefined') window.wpLibraryCore = API;
