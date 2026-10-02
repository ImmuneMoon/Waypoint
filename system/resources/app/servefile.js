/* Serving a file from disk, the same way for the local server (main.js) and the dev server (tools/dev-server.js) — backlog item 21 V1:
   a media file's own content type (a video or a sound the browser plays by its type, never guessed: saves/ answers nosniff), and a
   byte range when one is asked for, so a long video or track loads in parts and seeks without being read whole. The callers resolve
   and check the path first (inside its root, never a page from saves/); this only reads the file they hand it. */
'use strict';
const fs = require('fs');

const MEDIA = Object.freeze({ '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.ogv': 'video/ogg',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4' });
function mediaType(ext) { return typeof ext === 'string' && Object.prototype.hasOwnProperty.call(MEDIA, ext.toLowerCase()) ? MEDIA[ext.toLowerCase()] : null; }

// A Range header against a file's size: { start, end } (inclusive), 'bad' (nothing of it inside the file: 416), or null (none, several
// ranges or another unit: the whole file, as a server may answer)
function parseRange(header, size) {
    if (typeof header !== 'string' || !header || typeof size !== 'number' || !(size >= 0)) return null;
    const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim()); if (!m || (!m[1] && !m[2])) return null;
    let start, end;
    if (m[1] === '') { const n = Number(m[2]); if (!(n > 0) || !Number.isSafeInteger(n)) return 'bad'; start = Math.max(0, size - n); end = size - 1; }   // the last n bytes
    else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return 'bad';
    return { start: start, end: end };
}

// Answer with the file: the caller's headers (its type, its cache and sandbox rules), Accept-Ranges, the length, and a 206 part or a 416
// when a range was asked for. A file that cannot be read answers 404 and a read that fails mid-way ends the response
function serveFile(req, res, filePath, headers) {
    let size; try { const st = fs.statSync(filePath); if (!st.isFile()) throw new Error('not a file'); size = st.size; } catch (e) { res.writeHead(404); return res.end('Not Found'); }
    const r = parseRange(req && req.headers ? req.headers.range : null, size), h = Object.assign({}, headers, { 'Accept-Ranges': 'bytes' });
    if (r === 'bad') { res.writeHead(416, Object.assign(h, { 'Content-Range': 'bytes */' + size })); return res.end(); }
    if (r) res.writeHead(206, Object.assign(h, { 'Content-Range': 'bytes ' + r.start + '-' + r.end + '/' + size, 'Content-Length': r.end - r.start + 1 }));
    else res.writeHead(200, Object.assign(h, { 'Content-Length': size }));
    if (req && req.method === 'HEAD') return res.end();
    const rs = fs.createReadStream(filePath, r ? { start: r.start, end: r.end } : undefined);
    rs.on('error', () => { try { res.destroy(); } catch (e) {} });
    rs.pipe(res);
}

// Write a request's body to a file, whole or not at all (an import copying a large video back, an upload into the library): the
// bytes go to a .part file beside the target and are moved into place only when the request ended complete and as long as it said it
// would be. A request cut short, or a write that fails, leaves the target as it was — a good copy is never replaced by half of one —
// and no .part behind. Answers 200 with okBody once the file is in place, else 500.
// opts.keep (an import copying an archive's files back): a file already there is never replaced — the finished .part is linked into
// place, which fails where a file exists (409, the file as it was, no .part); a filesystem without hard links copies exclusively instead,
// and a copy that fails part-way takes its own half away, never a file that was there first.
// opts.max (the kind of file's size, reqguard.js): a request that says it is longer answers 413 before a byte is read or a .part made;
// one that only keeps coming past it is stopped there (413, the .part dropped, the target as it was). None, or Infinity: any size.
function placeKept(tmp, savePath) {   // 'placed' | 'exists' | 'failed'
    const existed = fs.existsSync(savePath);
    try { fs.linkSync(tmp, savePath); return 'placed'; } catch (e) { if (e && e.code === 'EEXIST') return 'exists'; }
    try { fs.copyFileSync(tmp, savePath, fs.constants.COPYFILE_EXCL); return 'placed'; }
    catch (e) { if (e && e.code === 'EEXIST') return 'exists'; if (!existed) { try { fs.unlinkSync(savePath); } catch (e2) {} } return 'failed'; }
}
function saveUpload(req, res, savePath, okBody, opts) {
    const keep = !!(opts && opts.keep === true), max = opts && typeof opts.max === 'number' && opts.max >= 0 ? opts.max : Infinity;
    const tmp = savePath + '.' + process.pid + '-' + Math.random().toString(36).slice(2, 10) + '.part';
    let answered = false, failed = false, tooBig = false, got = 0;
    const answer = (code, body) => { if (answered) return; answered = true; try { res.writeHead(code, code === 413 ? { 'Content-Type': 'application/json', 'Connection': 'close' } : { 'Content-Type': 'application/json' }); res.end(body); } catch (e) {} };
    if (req.headers && Number(req.headers['content-length']) > max) { try { req.on('error', () => {}); req.resume(); } catch (e) {} return answer(413, '{"error":"too large"}'); }
    const drop = () => { try { fs.unlinkSync(tmp); } catch (e) {} };
    let ws;
    try { ws = fs.createWriteStream(tmp); } catch (e) { return answer(500, '{"error":"upload failed"}'); }
    ws.on('error', () => { failed = true; });   // a bad write answers (on close), never crashes the process
    req.on('error', () => { failed = true; try { ws.destroy(); } catch (e) {} });
    req.on('close', () => { if (!req.complete) { failed = true; try { ws.destroy(); } catch (e) {} } });
    if (max !== Infinity) req.on('data', c => { got += c.length; if (got > max && !tooBig) { tooBig = true; failed = true; try { req.unpipe(ws); ws.destroy(); req.resume(); } catch (e) {} } });
    ws.on('close', () => {   // the file is closed by now (a rename over an open file fails on Windows)
        const len = req.headers ? req.headers['content-length'] : undefined;
        const whole = !failed && req.complete === true && (len === undefined || Number(len) === ws.bytesWritten);
        if (!whole) { drop(); return tooBig ? answer(413, '{"error":"too large"}') : answer(500, '{"error":"write failed"}'); }
        if (keep) {
            const placed = placeKept(tmp, savePath); drop();
            if (placed === 'exists') return answer(409, '{"error":"already there"}');
            if (placed !== 'placed') return answer(500, '{"error":"write failed"}');
            return answer(200, okBody);
        }
        try { fs.renameSync(tmp, savePath); } catch (e) { drop(); return answer(500, '{"error":"write failed"}'); }
        answer(200, okBody);
    });
    req.pipe(ws);
}

module.exports = { MEDIA, mediaType, parseRange, serveFile, saveUpload };
