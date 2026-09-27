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

// L3's index row (a picker lists thousands of these): [id, key, name, category, icon, tags, hash] from a players'-view entry, and
// its cleaner (a client takes nothing else from a host)
export function indexRow(e) { return [e.id, e.key || '', e.name, e.category || '', e.icon || '', Array.isArray(e.tags) ? e.tags.slice() : [], entryHash(e)]; }
export function cleanIndexRow(r) {
    if (!Array.isArray(r) || r.length !== 7 || typeof r[0] !== 'string' || !ITEM_RE.test(r[0])) return null;
    var key = typeof r[1] === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(r[1]) ? r[1] : '', tags = Array.isArray(r[5]) ? r[5].map(function(t) { return line(t, LIB.tag); }).filter(Boolean).slice(0, LIB.tags) : [];
    if (typeof r[6] !== 'string' || !HASH_RE.test(r[6])) return null;
    return [r[0], key, line(r[2], 60) || 'Item', line(r[3], 40), cleanIcon(r[4]), tags, r[6]];
}

var API = { VERSION: VERSION, LIB: LIB, DIR_RE: DIR_RE, PACK_RE: PACK_RE, ITEM_RE: ITEM_RE, HASH_RE: HASH_RE, hashText: hashText, libCtx: libCtx, cleanLibEntry: cleanLibEntry, entryHash: entryHash, cleanPack: cleanPack, readPackFile: readPackFile, cleanManifest: cleanManifest, newDir: newDir, packFileName: packFileName, indexRow: indexRow, cleanIndexRow: cleanIndexRow };
if (typeof window !== 'undefined') window.wpLibraryCore = API;
