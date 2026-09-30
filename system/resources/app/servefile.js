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

module.exports = { MEDIA, mediaType, parseRange, serveFile };
