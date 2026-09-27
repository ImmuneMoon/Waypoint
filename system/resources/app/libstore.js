/* Waypoint library storage (Stage 6, library L1b) — shared by the Electron shell (main.js) and tools/dev-server.js, like updater.js.
   A campaign's library packs live beside the save: saves/library/<dir>/<packId>.<rev>.json. <dir> is the name the campaign's
   manifest generated (l_ + 8 lower-case letters or digits, never a campaign id); a pack file is written once per revision and never
   rewritten under the same name, so the manifest in data.json pins exactly the files it was saved with. The newest KEEP revisions
   of each pack stay on disk; every backup of the save also keeps the library files as they were (hard links where the disk allows,
   copies otherwise), and restoring a backup brings back any of them that are gone.

   Routes (behind the server's own localRequest gate):
     GET    /api/library?dir=D                   { packs: { <packId>: [revs, newest first] } }
     GET    /api/library?dir=D&pack=P[&rev=N]    that revision's file (the newest without rev), as it was written
     POST   /api/library?dir=D&pack=P&rev=N      body: the pack file (JSON, format waypoint-pack, its own id and rev), at most MAX_BYTES
     DELETE /api/library?dir=D[&pack=P]          that pack's files, or the whole folder's
   Names are checked by pattern before any path is made, and every path must resolve inside saves/library. */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR_RE = /^l_[a-z0-9]{8}$/, PACK_RE = /^p_[A-Za-z0-9_]{1,24}$/, REV_RE = /^(0|[1-9][0-9]{0,8}|1000000000)$/, FILE_RE = /^(p_[A-Za-z0-9_]{1,24})\.(0|[1-9][0-9]{0,9})\.json$/;
const MAX_BYTES = 16 * 1024 * 1024, KEEP = 5;

function libRoot(savesDir) { return path.resolve(savesDir, 'library'); }
function inside(root, p) { return p === root || p.startsWith(root + path.sep); }
function dirPath(savesDir, dir) { if (typeof dir !== 'string' || !DIR_RE.test(dir)) return null; const root = libRoot(savesDir), p = path.resolve(root, dir); return inside(root, p) && p !== root ? p : null; }
function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
// { packId: [revs, newest first] } of the pack files in a folder (anything else there is ignored)
function listPacks(dirAbs) {
    const out = Object.create(null);
    let names = []; try { names = fs.readdirSync(dirAbs); } catch (e) { return out; }
    names.forEach(n => { const m = FILE_RE.exec(n); if (!m || Number(m[2]) > 1e9) return; (out[m[1]] = out[m[1]] || []).push(Number(m[2])); });
    Object.keys(out).forEach(k => out[k].sort((a, b) => b - a));
    return out;
}
// the newest `keep` revisions of a pack stay; older ones go
function prune(dirAbs, packId, keep) {
    const revs = listPacks(dirAbs)[packId] || [];
    revs.slice(keep === undefined ? KEEP : keep).forEach(r => { try { fs.unlinkSync(path.join(dirAbs, packId + '.' + r + '.json')); } catch (e) {} });
}
function handle(req, res, url, savesDir) {
    const q = url.searchParams, dir = q.get('dir') || '', pack = q.get('pack'), rev = q.get('rev');
    const d = dirPath(savesDir, dir);
    if (!d) return send(res, 400, { error: 'bad name' });
    if (pack !== null && !PACK_RE.test(pack)) return send(res, 400, { error: 'bad name' });
    if (rev !== null && !REV_RE.test(rev)) return send(res, 400, { error: 'bad name' });
    if (req.method === 'GET') {
        const list = listPacks(d);
        if (pack === null) return send(res, 200, { packs: list });
        const revs = list[pack] || [], r = rev === null ? revs[0] : Number(rev);
        if (r === undefined || revs.indexOf(r) < 0) return send(res, 404, { error: 'no such pack' });
        let text; try { text = fs.readFileSync(path.join(d, pack + '.' + r + '.json'), 'utf8'); } catch (e) { return send(res, 404, { error: 'no such pack' }); }
        res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(text);
    }
    if (req.method === 'POST') {
        if (pack === null || rev === null) return send(res, 400, { error: 'pack and rev needed' });
        let body = '', size = 0, over = false;
        req.setEncoding('utf8');   // decoded as UTF-8 across chunks (a character split between two chunks is never saved as �)
        req.on('data', c => {
            if (over) return;   // past the cap: the rest is read and dropped, never kept
            size += Buffer.byteLength(c, 'utf8');
            if (size > MAX_BYTES) { over = true; body = ''; res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' }); res.end('{"error":"too large"}'); return; }   // the connection closes after the answer: no client reuses it mid-upload
            body += c;
        });
        req.on('error', () => {});
        req.on('end', () => {
            if (over) return;
            let j; try { j = JSON.parse(body); } catch (e) { return send(res, 400, { error: 'invalid json' }); }
            if (!j || typeof j !== 'object' || Array.isArray(j) || j.format !== 'waypoint-pack' || j.id !== pack || j.rev !== Number(rev) || !Array.isArray(j.entries)) return send(res, 400, { error: 'not this pack' });
            try {
                fs.mkdirSync(d, { recursive: true });
                const file = path.join(d, pack + '.' + rev + '.json'), tmp = file + '.tmp';
                fs.writeFileSync(tmp, body, 'utf8'); fs.renameSync(tmp, file);   // atomic: a crash mid-write never leaves half a pack
                prune(d, pack);
                send(res, 200, { ok: true, file: pack + '.' + rev + '.json' });
            } catch (e) { send(res, 500, { error: 'write failed' }); }
        });
        return;
    }
    if (req.method === 'DELETE') {
        const list = listPacks(d), ids = pack === null ? Object.keys(list) : (list[pack] ? [pack] : []);
        ids.forEach(id => list[id].forEach(r => { try { fs.unlinkSync(path.join(d, id + '.' + r + '.json')); } catch (e) {} }));
        if (pack === null) { try { if (!fs.readdirSync(d).length) fs.rmdirSync(d); } catch (e) {} }   // the folder goes once nothing else is in it
        return send(res, 200, { ok: true, removed: ids.length });
    }
    return send(res, 405, { error: 'method' });
}

/* Backups. A backup of the save named <name>.json (data-…, keep-…) keeps the library files as they were in backups/lib-<name>/<dir>/.
   Pack files are never rewritten under one name, so a hard link is a true snapshot; a disk that cannot link gets a copy. */
function snapName(name) { return typeof name === 'string' && /^(data|keep)-[A-Za-z0-9_-]+$/.test(name) ? 'lib-' + name : ''; }
function snapshot(savesDir, bkDir, name) {
    const sn = snapName(name), root = libRoot(savesDir); if (!sn || !fs.existsSync(root)) return 0;
    let n = 0;
    fs.readdirSync(root).filter(dd => DIR_RE.test(dd)).forEach(dd => {
        const files = Object.keys(listPacks(path.join(root, dd))); if (!files.length) return;
        const to = path.join(bkDir, sn, dd); fs.mkdirSync(to, { recursive: true });
        fs.readdirSync(path.join(root, dd)).filter(f => FILE_RE.test(f)).forEach(f => {
            const a = path.join(root, dd, f), b = path.join(to, f);
            try { fs.linkSync(a, b); n++; } catch (e) { try { fs.copyFileSync(a, b); n++; } catch (e2) {} }
        });
    });
    return n;
}
// bring back the snapshot's files that are missing (a file already there is the same revision: it is left alone)
function restore(savesDir, bkDir, name) {
    const sn = snapName(name), from = sn ? path.join(bkDir, sn) : ''; if (!sn || !fs.existsSync(from)) return 0;
    let n = 0; const root = libRoot(savesDir);
    fs.readdirSync(from).filter(dd => DIR_RE.test(dd)).forEach(dd => {
        const to = path.join(root, dd); fs.mkdirSync(to, { recursive: true });
        fs.readdirSync(path.join(from, dd)).filter(f => FILE_RE.test(f)).forEach(f => { const b = path.join(to, f); if (fs.existsSync(b)) return; try { fs.copyFileSync(path.join(from, dd, f), b); n++; } catch (e) {} });
    });
    return n;
}
// a backup deleted or pruned takes its library snapshot with it
function dropSnapshot(bkDir, name) {
    const sn = snapName(name), p = sn ? path.join(bkDir, sn) : ''; if (!sn || !fs.existsSync(p)) return;
    try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {}
}

module.exports = { handle, listPacks, prune, snapshot, restore, dropSnapshot, DIR_RE, PACK_RE, FILE_RE, MAX_BYTES, KEEP };
