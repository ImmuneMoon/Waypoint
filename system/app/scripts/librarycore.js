/* librarycore.js — the item library at scale (Stage 6, library L1a). Pure: no DOM, no network, no disk; it loads under Node.
   A campaign's library is a set of PACKS of item entries, kept beside the save (saves/library/<dir>/<packId>.<rev>.json) and
   listed by a MANIFEST in the campaign (camp.library). An entry IS an item definition (systemcore's cleanItemDef, so a row and
   the sheet read it as they read sys.items) plus text only a picker or a preview needs (desc, tags, ref) and the GM's own notes
   (gmNotes: never in the players' view). Everything that enters goes through here — a pack file read from disk, an imported
   .wppack.json, a manifest in a loaded save, and later (L3) every message on the wire — and comes out as plain arrays and objects
   (prototype-free maps inside). Build plan: docs/STAGE_6_LIBRARY_BUILD.md. */
import { cleanItemDef, statKeys, statPicks, cleanIcon, fieldKinds, cleanLvls, hideNeeds, cleanNeeds, needRule } from './systemcore.js';

export var VERSION = 1;
export var LIB = Object.freeze({
    packs: 64, entries: 10000, total: 50000,          // packs per campaign, entries per pack, entries per library
    desc: 4000, gmNotes: 2000, tags: 8, tag: 24, ref: 40, packName: 60,
    fileBytes: 16 * 1024 * 1024, keepRevs: 5,          // a pack file (or an import) at most; revisions of a pack kept on disk
    reasons: 20, lostStats: 8,                         // the reasons an import lists (the rest counted); the stats it names as left out
    page: 400, getIds: 50, answerBytes: 48 * 1024,     // L3 on the wire: index rows a page, ids an ask, an answer's entries at most (behind them: dice and chat)
    hostBudget: 64 * 1024 * 1024, clientBudget: 32 * 1024 * 1024, cache: 2000   // bytes a profile may draw from a host a session; a player takes; entries a player keeps
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
export function libCtx(sys, F, gmView, shown, ruleShown) { var fields = isObj(sys) && Array.isArray(sys.fields) ? sys.fields : null; return { F: F, gmView: !!gmView, shown: shown, ruleShown: ruleShown, keys: fields ? statKeys(fields) : undefined, picks: fields ? statPicks(fields) : undefined, kinds: fields ? fieldKinds(sys) : undefined }; }
export function cleanLibEntry(e, ctx) {
    ctx = ctx || {};
    var out = cleanItemDef(e, ctx.F, !!ctx.gmView, ctx.keys, ctx.picks, ctx.kinds); if (!out) return null;
    if (!ctx.gmView && ctx.shown !== true) hideNeeds(out, ctx.shown, ctx.ruleShown);   // 126b: a players' view never names an entry players cannot see. ctx.shown: the host's judge (library.js needShown); true on a player's own app, which keeps what its host sent; absent: every need is hidden. Here, before the library's own text, so that the keys keep the cleaner's order
    var d = prose(e.desc, LIB.desc); if (d.trim()) out.desc = d;
    var lv = cleanLvls(e.lvls); if (lv) out.lvls = lv;   // 1.5.4: what each of its levels gives (a row's details show it as a small table)
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
export function addPack(manifest, name, rnd, wantId) {   // wantId (L2b): a fixed id (the migration's Items pack), when free
    rnd = rnd || Math.random;
    var m = cleanManifest(manifest) || { v: VERSION, dir: newDir(rnd), packs: [] }; if (m.packs.length >= LIB.packs) return null;
    var id = '', taken = map(); m.packs.forEach(function(p) { taken[p.id] = 1; });
    if (typeof wantId === 'string' && PACK_RE.test(wantId)) { if (taken[wantId]) return null; id = wantId; }
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
export function queryWords(q) { return fold(q).split(/\s+/).filter(Boolean).slice(0, 12); }   // L2c: what a search looks for (the picker folds each entry once: entryHay)
export function entryHay(e) { return isObj(e) ? fold([e.name, e.key, e.category, (Array.isArray(e.tags) ? e.tags : []).join(' '), e.ref].join(' ')) : ''; }
export function searchEntries(entries, q) {
    var list = Array.isArray(entries) ? entries : [], words = queryWords(q); if (!words.length) return list.slice();
    return list.filter(function(e) { if (!isObj(e)) return false; var hay = entryHay(e); return words.every(function(w) { return hay.indexOf(w) >= 0; }); });
}
// 1.5.4: an entry's levels as the Library window's box holds them, one level a line: "2: what it gives", or "2 (a few words): what it
// gives" for the words shown beside the level; a word before the number is passed over ("Level 2: ..."). A line that is not written so
// is passed over whole. And back, for the box
export function lvlsFromText(text) {
    var out = [];
    String(text == null ? '' : text).split(/\r\n?|\n/).forEach(function(ln) {
        var m = /^\s*(?:[A-Za-z]{1,12}\.?\s*)?(-?\d+(?:\.\d+)?)\s*(?:\((.*?)\)\s*)?:\s*(.*\S)\s*$/.exec(ln); if (!m) return;
        var o = { lvl: Number(m[1]), text: m[3] }; if (m[2] && m[2].trim()) o.tag = m[2].trim();
        out.push(o);
    });
    return out;
}
export function lvlsToText(lvls) { return (Array.isArray(lvls) ? lvls : []).filter(isObj).map(function(r) { return String(r.lvl) + (r.tag ? ' (' + r.tag + ')' : '') + ': ' + String(r.text == null ? '' : r.text); }).join('\n'); }
export function entryFromForm(f) {
    f = isObj(f) ? f : {}; var s = function(v) { return typeof v === 'string' ? v : v == null ? '' : String(v); };
    var out = { id: s(f.id), name: s(f.name), key: s(f.key).trim(), category: s(f.category), icon: s(f.icon), vis: f.vis === 'gm' ? 'gm' : 'all', notes: s(f.notes), desc: s(f.desc), ref: s(f.ref), gmNotes: s(f.gmNotes), damage: s(f.damage), cost: s(f.cost), throwSkill: s(f.throwSkill).trim() };
    var tags = s(f.tags).split(',').map(function(t) { return t.trim(); }).filter(Boolean); if (tags.length) out.tags = tags;
    var lvs = lvlsFromText(s(f.lvls)); if (lvs.length) out.lvls = lvs;   // 1.5.4: one level a line
    var lv = s(f.lvl).trim(); if (/^-?\d+$/.test(lv)) out.lvl = Number(lv);
    if (isObj(f.stats)) { var st = {}, n = 0; Object.keys(f.stats).forEach(function(k) { var v = s(f.stats[k]).trim(); if (!v) return; st[k] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v; n++; }); if (n) out.stats = st; }
    var ft = s(f.areaFt).trim(); if (/^\d+$/.test(ft) && Number(ft) > 0) out.area = { ft: Number(ft), shape: s(f.areaShape) || 'circle', name: s(f.areaName) };   // the shape as it was (the cleaner keeps a known one)
    if (f.rm === 'bound' || f.rm === 'curse') { out.rm = f.rm; if (s(f.rmMsg).trim()) out.rmMsg = s(f.rmMsg); }   // L2b: a player's removal (bound / curse on contact) and its message, as the Items tab has them
    if (f.eq === 'bound' || f.eq === 'curse') { out.eq = f.eq; if (s(f.eqMsg).trim()) out.eqMsg = s(f.eqMsg); }   // and switching it off
    if (Array.isArray(f.mods) && f.mods.length) out.mods = JSON.parse(JSON.stringify(f.mods)); if (f.modsOn === true) out.modsOn = true;   // F6: its changes to the character (cleaned as an entry's are)
    var hasN = Array.isArray(f.needs) && f.needs.length > 0, rlF = s(f.needsIf).trim();
    if (hasN) out.needs = JSON.parse(JSON.stringify(f.needs));
    if (rlF) out.needsIf = rlF;   // ... its rule, a formula that must be true
    var frT = s(f.needsFrom).trim(), frF = Number(frT); if (rlF && frT !== '' && isFinite(frF)) out.needsFrom = frF;   // ... and the level of this entry from which the rule applies (a level's own prerequisite), only beside a rule
    if ((hasN || rlF) && s(f.needsMsg).trim()) out.needsMsg = s(f.needsMsg);   // 126b: what it needs, and the GM's own words for a refusal (cleaned as an entry's are)
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
// L2a2: a pack as a file to share (.wppack.json): its name, icon and entries, each as the given view holds it — the GM's copy as held
// (with who may see the pack), a players' copy as the players' view holds it (no GM-only entry, no GM notes, no formula text; a
// GM-only pack's entries count as GM-only, so its players' copy is empty). One entry per id, at most LIB.entries
export function packFile(meta, entries, ctx) {
    meta = isObj(meta) ? meta : {}; ctx = ctx || {};
    var out = { format: 'waypoint-pack', v: VERSION, id: typeof meta.id === 'string' && PACK_RE.test(meta.id) ? meta.id : 'p_pack', name: line(meta.name, LIB.packName) || 'Pack' };
    var ic = cleanIcon(meta.icon); if (ic) out.icon = ic;
    if (ctx.gmView && meta.vis === 'gm') out.vis = 'gm';
    var seen = map(), list = !ctx.gmView && meta.vis === 'gm' ? [] : Array.isArray(entries) ? entries : [];
    out.entries = list.map(function(e) { return cleanLibEntry(e, ctx); }).filter(function(c) { if (!c || seen[c.id]) return false; seen[c.id] = 1; return true; }).slice(0, LIB.entries);
    return out;
}
// L2a2: a .wppack.json (or a pack file from disk) read to import — at most LIB.fileBytes, JSON, a pack (its own id is not needed);
// its entries cleaned in the GM's view, one per id, the rest counted with reasons. { name, icon?, vis, entries, dropped, reasons } or { error }
export function readPackImport(text, ctx) {
    if (typeof text !== 'string') return { error: 'That is not a pack file.' };
    if (text.length > LIB.fileBytes) return { error: 'That file is too large (16 MB at most).' };
    var j = null; try { j = JSON.parse(text); } catch (e) { return { error: 'That file is not JSON.' }; }
    if (!isObj(j) || (j.format !== undefined && j.format !== 'waypoint-pack') || !Array.isArray(j.entries)) return { error: 'That file is not a Waypoint pack.' };
    var cp = cleanPack({ format: 'waypoint-pack', id: 'p_import', rev: 0, entries: j.entries }, ctx);
    var out = { name: line(j.name, LIB.packName) || 'Imported pack', vis: j.vis === 'gm' ? 'gm' : 'all', entries: cp.pack.entries, dropped: cp.dropped, reasons: cp.reasons };
    var ic = cleanIcon(j.icon); if (ic) out.icon = ic;
    var ls = lostStats(j.entries, cp.pack.entries); if (ls.length) out.lostStats = ls;   // Stage 6 F3: never left out silently
    return out;
}
// Stage 6 F3: the stats an import leaves out — a stat no list of this system has (or a value it cannot hold): [{ key, n }], the most
// common first, at most LIB.lostStats. Each entry counted once, as the first of its id (the one kept); keys compared ignoring case
function lostStats(raw, kept) {
    var byId = map(), seen = map(), n = map(), spell = map();
    (Array.isArray(kept) ? kept : []).forEach(function(c) { byId[c.id] = c; });
    raw.forEach(function(e) {
        if (!isObj(e) || typeof e.id !== 'string' || !own(byId, e.id) || own(seen, e.id)) return; seen[e.id] = 1;
        if (!isObj(e.stats)) return;
        var have = map(); Object.keys(isObj(byId[e.id].stats) ? byId[e.id].stats : {}).forEach(function(k) { have[k.toLowerCase()] = 1; });
        Object.keys(e.stats).slice(0, 64).forEach(function(k) { var l = k.toLowerCase(); if (have[l] === 1) return; n[l] = (n[l] || 0) + 1; if (!own(spell, l)) spell[l] = line(k, 24) || '?'; });
    });
    return Object.keys(n).sort(function(a, b) { return n[b] - n[a] || (a < b ? -1 : a > b ? 1 : 0); }).slice(0, LIB.lostStats).map(function(l) { return { key: spell[l], n: n[l] }; });
}
// L2a2: the dry run of an import: what it would do, nothing changed. library: every pack as { id, name, entries } (the target among
// them); incoming: readPackImport's result; mode 'id' merges by id into the target (the entry of that id replaced; an id another pack
// holds is skipped), 'key' merges by key (case aside) into the target (the entry of that key replaced, keeping its own id), 'new' adds
// every entry as a new pack. An added entry whose id the library already uses gets a fresh one; the target holds at most LIB.entries.
// { entries (the target's after), add, update, same, skip, invalid, clash (imported entries whose key another entry also has), reasons }
export function packImportPlan(library, targetId, incoming, mode, rnd) {
    var packs = (Array.isArray(library) ? library : []).filter(function(p) { return isObj(p) && Array.isArray(p.entries); }), inc = isObj(incoming) && Array.isArray(incoming.entries) ? incoming : { entries: [] };
    mode = mode === 'key' || mode === 'new' ? mode : 'id';
    var where = map(), taken = map(), target = null;
    packs.forEach(function(p) { p.entries.forEach(function(e) { if (isObj(e) && typeof e.id === 'string') { where[e.id] = p; taken[e.id] = 1; } }); if (mode !== 'new' && p.id === targetId) target = p; });
    var res = { entries: target ? target.entries.slice() : [], add: 0, update: 0, same: 0, skip: 0, invalid: inc.dropped > 0 ? inc.dropped | 0 : 0, clash: 0, reasons: (Array.isArray(inc.reasons) ? inc.reasons : []).slice(0, LIB.reasons) };
    var why = function(r) { res.skip++; if (res.reasons.length < LIB.reasons) res.reasons.push(r); };
    if (mode !== 'new' && !target) { inc.entries.forEach(function(e) { why((isObj(e) ? e.name : '') + ': no pack to merge into'); }); return res; }
    var at = map(), byKey = map(), mine = map(), lk = function(e) { return isObj(e) && typeof e.key === 'string' ? e.key.toLowerCase() : ''; };
    res.entries.forEach(function(e, i) { at[e.id] = i; var k = lk(e); if (k && byKey[k] === undefined) byKey[k] = i; });
    inc.entries.forEach(function(e) {
        if (!isObj(e) || typeof e.id !== 'string') return;
        var k = lk(e), i = mode === 'id' && at[e.id] !== undefined ? at[e.id] : mode === 'key' && k && byKey[k] !== undefined ? byKey[k] : -1;
        if (i >= 0) {
            var old = res.entries[i], d = mode === 'key' ? Object.assign({}, e, { id: old.id }) : e;
            if (entryHash(d) === entryHash(old)) res.same++; else { res.entries[i] = d; res.update++; }
            mine[old.id] = 1; return;
        }
        if (mode === 'id' && where[e.id]) { why(e.name + ': its id is already in the pack ' + where[e.id].name); return; }
        if (res.entries.length >= LIB.entries) { why(e.name + ': past ' + LIB.entries + ' entries in one pack'); return; }
        var d2 = e; if (taken[e.id]) { var id = newEntryId(taken, rnd); if (!id) { why(e.name + ': no free id'); return; } d2 = Object.assign({}, e, { id: id }); }
        taken[d2.id] = 1; at[d2.id] = res.entries.length; if (k && byKey[k] === undefined) byKey[k] = res.entries.length; res.entries.push(d2); mine[d2.id] = 1; res.add++;
    });
    var keys = map(), count = function(e) { var k = lk(e); if (k) keys[k] = (keys[k] || 0) + 1; };
    packs.forEach(function(p) { if (p !== target) p.entries.forEach(count); }); res.entries.forEach(count);
    res.entries.forEach(function(e) { var k = lk(e); if (mine[e.id] && k && keys[k] > 1) res.clash++; });
    return res;
}
// L2a2: a bulk change to a pack's chosen entries (ids): a category, tags added or replacing theirs, who may see them — each entry
// cleaned again (ctx), the others untouched. { entries, changed }
export function bulkSet(entries, ids, change, ctx) {
    var pick = map(), n = 0; (Array.isArray(ids) ? ids : []).forEach(function(id) { pick[id] = 1; }); change = isObj(change) ? change : {};
    var list = (Array.isArray(entries) ? entries : []).map(function(e) {
        if (!isObj(e) || !pick[e.id]) return e;
        var d = JSON.parse(JSON.stringify(e));
        if (typeof change.category === 'string') d.category = change.category;
        if (change.vis === 'gm' || change.vis === 'all') d.vis = change.vis;
        if (Array.isArray(change.tags)) d.tags = change.tags.slice(); else if (Array.isArray(change.addTags)) d.tags = (Array.isArray(d.tags) ? d.tags : []).concat(change.addTags);
        var c = cleanLibEntry(d, ctx); if (!c) return e;
        if (JSON.stringify(c) !== JSON.stringify(e)) n++;
        return c;
    });
    return { entries: list, changed: n };
}
// L2a2: the chosen entries (ids) of one pack moved or copied to another (or copied within it): a move keeps their ids; a copy gets fresh
// ones none of taken uses, no key (a copy would share it) and the name suffix given; at most LIB.entries in the target — the rest are
// left where they are, counted. opts { copy, taken, rnd, suffix }. { src, dst, done, left }
export function bulkMove(src, dst, ids, opts) {
    opts = isObj(opts) ? opts : {}; var pick = map(), has = map(), out = { src: [], dst: (Array.isArray(dst) ? dst : []).slice(), done: 0, left: 0 };
    (Array.isArray(ids) ? ids : []).forEach(function(id) { pick[id] = 1; });
    if (isObj(opts.taken)) Object.keys(opts.taken).forEach(function(k) { has[k] = 1; });
    var room = LIB.entries - out.dst.length;
    (Array.isArray(src) ? src : []).forEach(function(e) {
        var chosen = isObj(e) && pick[e.id] === 1;
        if (chosen && room > 0) {
            if (!opts.copy) { out.dst.push(e); room--; out.done++; return; }
            var id = newEntryId(has, opts.rnd);
            if (id) { has[id] = 1; var d = JSON.parse(JSON.stringify(e)); d.id = id; delete d.key; if (typeof opts.suffix === 'string' && opts.suffix) d.name = (d.name + opts.suffix).slice(0, 60); out.dst.push(d); room--; out.done++; }
            else out.left++;
        } else if (chosen) out.left++;
        out.src.push(e);
    });
    return out;
}
// L3: a pack as players see it — its entries as the players' view holds them (a GM-only one gone), their index rows (what a picker
// lists), by id, and a hash over the rows (a GM-only edit never moves it). { rows, byId, hash }
export function playerIndex(entries, plCtx) {
    var rows = [], byId = map();
    (Array.isArray(entries) ? entries : []).forEach(function(e) { var c = cleanLibEntry(e, plCtx); if (!c || byId[c.id]) return; byId[c.id] = c; rows.push(indexRow(c)); });
    return { rows: rows, byId: byId, hash: hashText(rows.map(function(r) { return r[6]; }).join(',')) };
}
// L3: one page of a pack's index for the wire (size rows at most); a page out of range (or not a whole number): null
export function indexPage(rows, page, size) {
    var n = Array.isArray(rows) ? rows.length : 0, pages = Math.max(1, Math.ceil(n / size));
    if (typeof page !== 'number' || page !== Math.floor(page) || page < 0 || page >= pages) return null;
    return { page: page, pages: pages, rows: rows.slice(page * size, page * size + size) };
}
// L3: the entries an ask may take (ids of that pack only, each once, at most LIB.getIds), in the order asked, within cap bytes — one
// always goes; the rest are left for another ask
export function getAnswer(byId, ids, cap) {
    var out = [], bytes = 0, seen = map();
    (Array.isArray(ids) ? ids : []).slice(0, LIB.getIds).forEach(function(id) {
        if (typeof id !== 'string' || !ITEM_RE.test(id) || seen[id] || !byId || !own(byId, id)) return; seen[id] = 1;
        var n = JSON.stringify(byId[id]).length; if (out.length && bytes + n > cap) return;
        bytes += n; out.push(byId[id]);
    });
    return out;
}
// L3: the manifest a player takes from the host: the campaign it is for, at most LIB.packs packs, each an id, a name on one line, an
// icon, a count and a hash (nothing else: no folder, no revision). null when it is not one
export function cleanPlayerManifest(m) {
    if (!isObj(m) || typeof m.campId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(m.campId) || !Array.isArray(m.packs)) return null;
    var out = { campId: m.campId, packs: [] }, seen = map();
    m.packs.forEach(function(p) {
        if (out.packs.length >= LIB.packs || !isObj(p) || typeof p.id !== 'string' || !PACK_RE.test(p.id) || seen[p.id] || typeof p.hash !== 'string' || !HASH_RE.test(p.hash)) return;
        seen[p.id] = 1; var o = { id: p.id, name: line(p.name, LIB.packName) || 'Pack', count: typeof p.count === 'number' && isFinite(p.count) ? Math.max(0, Math.min(LIB.entries, Math.floor(p.count))) : 0, hash: p.hash };
        var ic = cleanIcon(p.icon); if (ic) o.icon = ic; out.packs.push(o);
    });
    return out;
}
// L2b (owner decision 3): the system's own items as library entries — each cleaned as an entry in the GM's view (lossless: an item
// definition is an entry); kept: the ids asked to stay (the tutorial's) and any id the library already holds in another pack (never two
// of one id); an id already in the Items pack is only dropped from the system (a move that was cut short, finished). Pure.
// { move: entries to add, drop: ids that leave the system, keep: items that stay, left: ids that stay because of a clash }
export function itemsToMove(sys, keepIds, taken, inPack, ctx) {
    var out = { move: [], drop: [], keep: [], left: [] }, stay = map(); (Array.isArray(keepIds) ? keepIds : []).forEach(function(id) { stay[id] = 1; });
    (isObj(sys) && Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {
        if (!isObj(it) || typeof it.id !== 'string') return;
        if (stay[it.id]) { out.keep.push(it); return; }
        if (inPack && own(inPack, it.id)) { out.drop.push(it.id); return; }
        if (taken && own(taken, it.id)) { out.keep.push(it); out.left.push(it.id); return; }
        var e = cleanLibEntry(it, ctx); if (!e) { out.keep.push(it); out.left.push(it.id); return; }
        out.move.push(e); out.drop.push(it.id);
    });
    return out;
}
// L3's index row (a picker lists thousands of these): [id, key, name, category, icon, tags, hash] from a players'-view entry, and
// its cleaner (a client takes nothing else from a host). 126b: an entry that needs something players may see has an eighth place, those
// needs, so a player's picker greys the row before the entry is opened; an entry that needs nothing keeps its row of seven. A client
// takes a row of eight only when that place cleans to at least one need
export function indexRow(e) { var r = [e.id, e.key || '', e.name, e.category || '', e.icon || '', Array.isArray(e.tags) ? e.tags.slice() : [], entryHash(e)], nd = cleanNeeds(e.needs), rl = typeof e.needsIf === 'string' && e.needsIf && typeof e.needsFrom !== 'number' ? e.needsIf : ''; if (rl) { r.push(nd || null); r.push(rl); } else if (nd) r.push(nd); return r; }   // a ninth place: the entry's rule, after its needs or null
export function cleanIndexRow(r, F) {   // F: the formula engine, for a row of nine (its rule must be a formula with no dice)
    if (!Array.isArray(r) || r.length < 7 || r.length > 9 || typeof r[0] !== 'string' || !ITEM_RE.test(r[0])) return null;
    var key = typeof r[1] === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(r[1]) ? r[1] : '', tags = Array.isArray(r[5]) ? r[5].map(function(t) { return line(t, LIB.tag); }).filter(Boolean).slice(0, LIB.tags) : [];
    if (typeof r[6] !== 'string' || !HASH_RE.test(r[6])) return null;
    var out = [r[0], key, line(r[2], 60) || 'Item', line(r[3], 40), cleanIcon(r[4]), tags, r[6]];
    if (r.length === 8) { var nd = cleanNeeds(r[7]); if (!nd) return null; out.push(nd); }
    if (r.length === 9) { var nd9 = r[7] === null ? null : cleanNeeds(r[7]), rl9 = needRule(r[8], F); if ((r[7] !== null && !nd9) || !rl9) return null; out.push(nd9); out.push(rl9); }
    return out;
}

var API = { VERSION: VERSION, queryWords: queryWords, entryHay: entryHay, searchEntries: searchEntries, entryFromForm: entryFromForm, newEntryId: newEntryId, keyClashes: keyClashes, setPackMeta: setPackMeta, keyIndex: keyIndex, packFile: packFile, readPackImport: readPackImport, playerIndex: playerIndex, indexPage: indexPage, itemsToMove: itemsToMove, getAnswer: getAnswer, cleanPlayerManifest: cleanPlayerManifest, packImportPlan: packImportPlan, bulkSet: bulkSet, bulkMove: bulkMove, libImportPlan: libImportPlan, manifestSig: manifestSig, addPack: addPack, removePack: removePack, nextRev: nextRev, packMeta: packMeta, LIB: LIB, DIR_RE: DIR_RE, PACK_RE: PACK_RE, ITEM_RE: ITEM_RE, HASH_RE: HASH_RE, hashText: hashText, libCtx: libCtx, cleanLibEntry: cleanLibEntry, entryHash: entryHash, cleanPack: cleanPack, readPackFile: readPackFile, cleanManifest: cleanManifest, newDir: newDir, packFileName: packFileName, indexRow: indexRow, cleanIndexRow: cleanIndexRow };
if (typeof window !== 'undefined') window.wpLibraryCore = API;
