/* Waypoint game record (1.6.0) — shared by the Electron shell (main.js) and tools/dev-server.js, like libstore.js.
   The owner, 2026-10-31: "a complete record of the game for reference", sorted by session, and of how long it is kept, "Every session,
   for good". Each session is a file of its own beside the save, so the save stays small however long a campaign runs:
   saves/record/<campaign id>/<session id>.jsonl, one JSON line an event, only ever added to.

   Routes (behind the server's own localRequest gate):
     GET    /api/record?camp=C                 { sessions: [ { id, size, head, last, end }, newest first ] }
     GET    /api/record?camp=C&session=S       that session's file, as it was written
     POST   /api/record?camp=C&session=S       body: lines to add, each a JSON object on a line of its own
     DELETE /api/record?camp=C&session=S       that session's file
   Names are checked before any path is made, and every path must resolve inside saves/record. */
'use strict';
const fs = require('fs');
const path = require('path');
const reqguard = require('./reqguard');

const SESS_RE = /^s_[0-9]{13}_[a-z0-9]{6}$/, MAX_ADD = reqguard.BODY.prefs, MAX_LINE = 16 * 1024, TAIL = 64 * 1024, HEAD = 8 * 1024;

function recRoot(savesDir) { return path.resolve(savesDir, 'record'); }
function inside(root, p) { return p.startsWith(root + path.sep); }
function campDir(savesDir, camp) { if (!reqguard.safeSeg(camp)) return null; const root = recRoot(savesDir), p = path.resolve(root, camp); return inside(root, p) ? p : null; }
function fileOf(dir, session) { if (typeof session !== 'string' || !SESS_RE.test(session)) return null; const p = path.resolve(dir, session + '.jsonl'); return inside(dir, p) ? p : null; }
function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
function parseLine(s) { try { const o = JSON.parse(s); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; } }
// what the list of sessions says of one: its first line, the time of its last line and how it ended; only the file's two ends are read
function brief(file, id) {
    let st, fd; try { st = fs.statSync(file); fd = fs.openSync(file, 'r'); } catch (e) { return null; }
    try {
        const hn = Math.min(HEAD, st.size), hb = Buffer.alloc(hn); fs.readSync(fd, hb, 0, hn, 0);
        const tn = Math.min(TAIL, st.size), tb = Buffer.alloc(tn); fs.readSync(fd, tb, 0, tn, st.size - tn);
        const head = parseLine(hb.toString('utf8').split('\n')[0]);
        const lines = tb.toString('utf8').split('\n').map(parseLine).filter(Boolean);
        let last = 0, end = null;
        lines.forEach(o => { if (typeof o.t === 'number' && o.t > last) last = o.t; if (o.k === 'end') end = o; else if (o.k === 'open') end = null; });
        return { id: id, size: st.size, head: head, last: last, end: end };
    } finally { try { fs.closeSync(fd); } catch (e) {} }
}
function list(dir) {
    let names = []; try { names = fs.readdirSync(dir); } catch (e) { return []; }
    const out = [];
    names.forEach(n => { const m = /^(s_[0-9]{13}_[a-z0-9]{6})\.jsonl$/.exec(n); if (!m) return; const b = brief(path.join(dir, n), m[1]); if (b) out.push(b); });
    return out.sort((a, b) => (b.id > a.id ? 1 : b.id < a.id ? -1 : 0));
}
// each line whole and a plain object, or nothing is written: a torn line would cost the file its reader
function cleanAdd(body) {
    const lines = String(body).split('\n').filter(l => l.length);
    if (!lines.length || lines.some(l => l.length > MAX_LINE || !parseLine(l))) return null;
    return lines.join('\n') + '\n';
}
function handle(req, res, url, savesDir) {
    const q = url.searchParams, dir = campDir(savesDir, q.get('camp')), session = q.get('session');
    if (!dir) return send(res, 400, { error: 'bad campaign' });
    if (req.method === 'GET' && session === null) return send(res, 200, { sessions: list(dir) });
    const file = fileOf(dir, session); if (!file) return send(res, 400, { error: 'bad session' });
    if (req.method === 'GET') {
        fs.readFile(file, (err, data) => { if (err) return send(res, err.code === 'ENOENT' ? 404 : 500, { error: 'not there' }); res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(data); });
        return;
    }
    if (req.method === 'POST') {
        reqguard.readBody(req, res, MAX_ADD, body => {
            const text = cleanAdd(body); if (text === null) return send(res, 400, { error: 'bad lines' });
            fs.mkdir(dir, { recursive: true }, mkErr => {
                if (mkErr) return send(res, 500, { error: 'no folder' });
                fs.appendFile(file, text, 'utf8', err => send(res, err ? 500 : 200, err ? { error: 'not written' } : { ok: true }));
            });
        });
        return;
    }
    if (req.method === 'DELETE') {
        fs.unlink(file, err => send(res, err && err.code !== 'ENOENT' ? 500 : 200, { ok: !err || err.code === 'ENOENT' }));
        return;
    }
    send(res, 405, { error: 'method' });
}
module.exports = { handle, list, brief, cleanAdd, campDir, fileOf, SESS_RE };
