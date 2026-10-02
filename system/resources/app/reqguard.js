/* What the local server takes and refuses, the same way for the shell (main.js) and the dev server (tools/dev-server.js), kept here so
   tools/servercheck.js runs every rule for real under plain Node (the outside audit of 2026-10-01):
   - the launch secret: a value made at each launch that only this app's own windows send (the shell adds it to their requests as a
     header, never visible to a page's script), checked before anything else, so no other program on the machine reads or replaces the save;
   - a request body read with a cap (413 past it), never whole into memory first;
   - the error log kept bounded (a long line cut, the file moved aside once it is large);
   - names that become disk paths: plain segments, and of an upload only the kinds of file the app itself writes — a picture, a sound,
     a video, the Journal's own two index files — each with a size no honest file reaches (a video: any size);
   - what the Image Library may delete (never a Journal file; the Journal itself only a page's picture, never an index);
   - a launch backup "deleted" through the API is moved aside, never erased, so a page that goes wrong cannot take the save's last copies;
   - the save, the profile store and the log are never served as plain files. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const servefile = require('./servefile');

/* ---- the launch secret ---- */
const LAUNCH_HEADER = 'x-waypoint-launch';
function newSecret() { return crypto.randomBytes(32).toString('hex'); }
// Is this request this launch's own? A secret that is none (not a string, too short) passes nothing: the caller that runs without one
// (the dev server, in an ordinary browser) does not ask
function launchOk(req, secret) {
    if (typeof secret !== 'string' || secret.length < 32) return false;
    const got = req && req.headers ? req.headers[LAUNCH_HEADER] : undefined;
    if (typeof got !== 'string' || got.length !== secret.length) return false;
    const a = Buffer.from(got, 'utf8'), b = Buffer.from(secret, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// The shell's half: every request one of this app's windows makes to the app's own origin — and to no other address — carries the secret.
// ses is Electron's session; origin() gives the app's own origin as it is at that moment (the port is settled only once the server listens)
function sendLaunch(ses, origin, secret) {
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = Object.assign({}, details && details.requestHeaders);
        Object.keys(headers).forEach(k => { if (k.toLowerCase() === LAUNCH_HEADER) delete headers[k]; });   // a page's own word for it never travels, here or anywhere
        let mine = false;
        try { const u = new URL(details.url); mine = (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === origin(); } catch (e) { mine = false; }   // a blob: or filesystem: address has its maker's origin and is no request to the server
        if (mine) headers['X-Waypoint-Launch'] = secret;
        callback({ requestHeaders: headers });
    });
}

/* ---- a request body, bounded ---- */
const KB = 1024, MB = 1024 * 1024;
const BODY = Object.freeze({ small: 64 * KB, prefs: 2 * MB, data: 512 * MB });   // a name or a log line; the profile store; the save (what the engine can hold as one text at all)
// The whole body as text (UTF-8, decoded across chunks) handed to cb — or 413 and nothing kept once it passes max, whether it said so
// up front or just kept coming. A cb that throws answers 500: a request is never left without an answer
function readBody(req, res, max, cb) {
    let body = '', bytes = 0, over = false;
    const refuse = () => {
        over = true; body = '';
        try { res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close' }); res.end('{"error":"too large"}'); } catch (e) {}   // the connection closes after the answer: nobody reuses it mid-upload
    };
    req.on('error', () => {});
    const stated = req.headers ? Number(req.headers['content-length']) : NaN;
    if (stated > max) { refuse(); try { req.resume(); } catch (e) {} return; }
    req.setEncoding('utf8');
    req.on('data', c => {
        if (over) return;   // past the cap: the rest is read and dropped
        bytes += Buffer.byteLength(c, 'utf8');
        if (bytes > max) return refuse();
        try { body += c; } catch (e) { refuse(); }   // longer than a text can be
    });
    req.on('end', () => {
        if (over) return;
        try { cb(body); }
        catch (e) { try { if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"error":"failed"}'); } } catch (e2) {} }
    });
}

/* ---- the error log ---- */
const LOG_LINE = 64 * KB, LOG_ROTATE = 4 * MB;
// One line onto saves/error.log: cut to 64 KB, and a log past 4 MB is moved to error.log.1 first (one older file kept), so the two
// together stay bounded. Throws when the disk refuses — the caller answers
function appendLog(savesDir, text) {
    const file = path.join(savesDir, 'error.log');
    let line = String(text);
    if (Buffer.byteLength(line, 'utf8') > LOG_LINE) line = Buffer.from(line, 'utf8').subarray(0, LOG_LINE).toString('utf8');
    let size = 0; try { size = fs.statSync(file).size; } catch (e) { size = 0; }
    if (size > LOG_ROTATE) fs.renameSync(file, file + '.1');
    fs.appendFileSync(file, new Date().toISOString() + ': ' + line + '\n');
}

/* ---- names that become disk paths ---- */
// One path segment: no separator, no walk, nothing Windows reads as something else — a control character, a trailing dot or space
// (Explorer cannot open or delete such a file), a device name (NUL, CON.png, COM1 …)
const WIN_DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\.|$)/i;
function safeSeg(s) { return typeof s === 'string' && s.length > 0 && s.length <= 200 && s !== '.' && s !== '..' && !/[\/\\:*?"<>|\x00-\x1f]/.test(s) && !s.includes('..') && !/[. ]$/.test(s) && !WIN_DEVICE.test(s); }
// A map id is one plain segment (audio and video live one folder deeper: audio/<camp>)
const SAFE_MAP_ID = /^[A-Za-z0-9_.-]{1,80}(\/[A-Za-z0-9_.-]{1,80})?$/;
function safeMapId(m) { return typeof m === 'string' && SAFE_MAP_ID.test(m) && m.split('/').every(safeSeg); }
// What an upload may be, by its extension: the pictures the app shows, and the sounds and videos the server has a type for
const PICTURE_EXT = Object.freeze(['.png', '.apng', '.jpg', '.jpeg', '.jfif', '.gif', '.webp', '.avif', '.bmp', '.ico', '.svg']);
function extOf(name) { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i).toLowerCase() : ''; }
function safeFileName(n) { if (!safeSeg(n) || n.charAt(0) === '.') return false; const ext = extOf(n); return PICTURE_EXT.indexOf(ext) >= 0 || !!servefile.mediaType(ext); }
const JOURNAL_SEG = /^journal[. ]*$/i;   // the Journal's folder under images/, in any spelling the disk would read as it
const JOURNAL_KEY = /^[A-Za-z0-9_-]{1,60}$/;
// The kind of file a path under saves/ would be — segs from 'images' down to the name — or null for anything the app does not write:
// 'picture', 'sound', 'video' (a video file in the video folder), 'index' (the Journal's registry and a journal's index, at their own two places)
function uploadKind(segs) {
    if (!Array.isArray(segs) || segs.length < 2 || segs[0] !== 'images' || !segs.every(safeSeg)) return null;
    const name = segs[segs.length - 1]; if (name.charAt(0) === '.') return null;
    const ext = extOf(name);
    if (ext === '.json') return segs[1] === 'journal' && ((segs.length === 3 && name === 'journals.json') || (segs.length === 4 && JOURNAL_KEY.test(segs[2]) && name === 'journal.json')) ? 'index' : null;
    if (PICTURE_EXT.indexOf(ext) >= 0) return 'picture';
    const media = servefile.mediaType(ext); if (!media) return null;
    return segs[1] === 'video' && media.indexOf('video/') === 0 ? 'video' : 'sound';
}
// A size no honest file of its kind reaches (the app's own limits: a song 25 MB, a sound 4 MB; a picture and an index have none of
// their own). A video is as large as the GM's disk allows, as it always was
const UPLOAD_MAX = Object.freeze({ picture: 256 * MB, sound: 64 * MB, index: 64 * MB, video: Infinity });
// upload-exact (a file at its exact place): at most six segments; with keep (an import copying an archive's files back) never into the Journal
function exactKind(segs, keep) {
    if (!Array.isArray(segs) || segs.length > 6) return null;
    if (keep && typeof segs[1] === 'string' && JOURNAL_SEG.test(segs[1])) return null;
    return uploadKind(segs);
}
// upload (a new file into a folder, under a fresh prefix): a picture, a sound or a video — never an index
function freshKind(mapId, name) {
    if (!safeMapId(mapId) || !safeFileName(name)) return null;
    const kind = uploadKind(['images'].concat(mapId.split('/'), [name]));
    return kind === 'index' ? null : kind;
}

/* ---- what may be deleted under saves/images ---- */
// The segments of a path to delete, or null. Never a segment of only dots and spaces (a walk, or one Windows reads as one). A file of
// the Journal's is never deleted by the Image Library: only by the Journal's own word (journal true), and then only a page's picture
// at its own place — never an index. (Not safeSeg: a picture from before 1.5.0 may hold ".." inside its name and must stay deletable.)
function deleteTarget(p, journal) {
    if (typeof p !== 'string') return null;
    const segs = p.replace(/^\/saves\//, '').split('/').filter(Boolean);
    if (segs.length < 2 || segs[0] !== 'images') return null;
    if (segs.some(s => s.length > 200 || /[\\:*?"<>|\x00-\x1f]/.test(s) || /^[. ]+$/.test(s))) return null;
    if (JOURNAL_SEG.test(segs[1]) && !(journal === true && segs.length === 4 && segs[1] === 'journal' && JOURNAL_KEY.test(segs[2]) && /^[A-Za-z0-9_-]{1,60}\.(png|jpg|webp)$/.test(segs[3]))) return null;
    return segs;
}

/* ---- backups ---- */
const BACKUP_NAME = /^(data|keep)-[A-Za-z0-9_-]+\.json$/;
const REMOVED = 'removed', REMOVED_KEEP = 10;
// "Delete" a snapshot: one taken by hand (keep-…) goes, as asked. A launch backup (data-…) — the safety net — is moved into
// backups/removed with its library files instead, where no route lists, restores or deletes it: whatever a page does, the copies the
// app made by itself are still on disk. 'gone' | 'moved' | 'missing' | 'bad'
function removeBackup(bkDir, file, lib) {
    if (typeof file !== 'string' || !BACKUP_NAME.test(file)) return 'bad';
    const src = path.join(bkDir, file); if (!fs.existsSync(src)) return 'missing';
    const name = file.replace(/\.json$/, '');
    if (file.indexOf('data-') !== 0) { fs.unlinkSync(src); if (lib) lib.dropSnapshot(bkDir, name); return 'gone'; }
    const aside = path.join(bkDir, REMOVED); fs.mkdirSync(aside, { recursive: true });
    const dst = path.join(aside, file);
    try { fs.rmSync(dst, { force: true }); } catch (e) {}
    fs.renameSync(src, dst);
    const libSrc = path.join(bkDir, 'lib-' + name), libDst = path.join(aside, 'lib-' + name);
    if (fs.existsSync(libSrc)) { try { fs.rmSync(libDst, { recursive: true, force: true }); fs.renameSync(libSrc, libDst); } catch (e) {} }
    return 'moved';
}
// At launch: of the launch backups set aside, the newest ten stay (their names carry their time), the rest go with their library files
function pruneRemoved(bkDir, lib) {
    const aside = path.join(bkDir, REMOVED); if (!fs.existsSync(aside)) return 0;
    const old = fs.readdirSync(aside).filter(f => /^data-[A-Za-z0-9_-]+\.json$/.test(f)).sort().reverse().slice(REMOVED_KEEP);
    old.forEach(f => { try { fs.unlinkSync(path.join(aside, f)); } catch (e) {} if (lib) lib.dropSnapshot(aside, f.replace(/\.json$/, '')); });
    return old.length;
}

/* ---- files the static branch never serves ---- */
// The save, the profile store (table keys) and the log are read through their own routes only; as plain files under /saves/ they
// answer 404, so nothing that names a path under saves/ (an export's bundle, a picture reference) can fetch them
function savesHidden(pathname) {
    if (typeof pathname !== 'string') return false;
    const segs = pathname.split('/').filter(s => s && s !== '.');
    return segs.length === 2 && segs[0] === 'saves' && /^(data\.json|preferences\.json|error\.log(\.1)?)(\.tmp)?[. ]*$/i.test(segs[1]);
}

module.exports = { LAUNCH_HEADER, newSecret, launchOk, sendLaunch, BODY, readBody, LOG_LINE, LOG_ROTATE, appendLog, safeSeg, safeMapId, safeFileName, PICTURE_EXT, uploadKind, UPLOAD_MAX, exactKind, freshKind,
    deleteTarget, BACKUP_NAME, REMOVED, REMOVED_KEEP, removeBackup, pruneRemoved, savesHidden };
