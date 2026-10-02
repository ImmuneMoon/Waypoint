/* The core's revision: which release last changed what only the installer delivers.

   A one-click update replaces system/app and nothing else. Everything under system/resources/app (the shell: the local
   server, the updater, the key it checks updates with) and the installer's own script reach an install only through the
   installer. A release says which core its app files need in its manifest (minShell), and an install whose core is older
   is sent the installer instead of the one-click update. That number used to be a constant somebody had to remember to
   raise. Now it is a recorded fact: tools/shellrev.json holds a hash of the core's files and the version in which that
   hash last moved, tools/release.js publishes that version as minShell and refuses to build while the record is stale,
   and tools/updatercheck.js fails the moment a core file changes without the record being refreshed.

   Usage:
     node tools/shellrev.js           recompute; when the hash moved, record it with the version in package.json
     node tools/shellrev.js --check   exit 1 when the recorded hash is not the core's (writes nothing)

   What is hashed: every file under system/resources/app (a plain walk, node_modules left out), sorted by its path with
   forward slashes, each as "<path>\n<content>", then installer.iss the same way. A file with no NUL byte is text: its
   CRLF line ends are read as LF, so a Windows checkout and a Linux one agree. package.json is hashed without its version
   (it moves every release and is no change to the core) and installer.iss without its AppVer line, for the same reason.

   Raise the version in package.json BEFORE the first core edit of a new release: `since` is the version the tree said
   when the hash moved. Plain Node, no dependencies. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SHELL_DIR = 'system/resources/app';
const INSTALLER = 'installer.iss';
const RECORD = ['tools', 'shellrev.json'];
const NL = '\n';
const VERSION_OK = /^[0-9A-Za-z][0-9A-Za-z.-]{0,39}$/;
const STALE = 'the core changed since tools/shellrev.json was recorded: run node tools/shellrev.js';

// The bytes of a file as they are hashed. rel: its path from the repository's root, with forward slashes.
function hashedBytes(rel, buf) {
    if (buf.indexOf(0) >= 0) return buf;   // a NUL byte: not text (a picture, an icon) — its bytes as they are
    let text = buf.toString('latin1').replace(/\r\n/g, NL);   // latin1: every byte kept as it is, whatever the encoding
    if (rel === SHELL_DIR + '/package.json') {
        try { const j = JSON.parse(Buffer.from(text, 'latin1').toString('utf8')); if (j && typeof j === 'object' && !Array.isArray(j)) { delete j.version; return Buffer.from(JSON.stringify(j), 'utf8'); } } catch (e) { /* not JSON: hashed as it is, so a broken file shows */ }
    }
    if (rel === INSTALLER) text = text.replace(/^#define AppVer "[^"\n]*"\n/m, '');
    return Buffer.from(text, 'latin1');
}
// Every file under a folder, as paths from the repository's root with forward slashes, sorted by code unit (the same on every system).
function listFiles(root, relDir) {
    const out = [];
    (function walk(rel) {
        let names; try { names = fs.readdirSync(path.join(root, rel)); } catch (e) { return; }
        for (const n of names) {
            if (n === 'node_modules') continue;
            const r = rel + '/' + n, st = fs.statSync(path.join(root, r));
            if (st.isDirectory()) walk(r); else if (st.isFile()) out.push(r);
        }
    })(relDir);
    return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
function shellFiles(root) {
    const list = listFiles(root, SHELL_DIR);
    if (fs.existsSync(path.join(root, INSTALLER))) list.push(INSTALLER);
    return list;
}
function shellHash(root) {
    root = root || ROOT;
    const h = crypto.createHash('sha256');
    for (const rel of shellFiles(root)) { h.update(rel + NL, 'utf8'); h.update(hashedBytes(rel, fs.readFileSync(path.join(root, rel)))); }
    return h.digest('hex');
}
function recordFile(root) { return path.join.apply(path, [root || ROOT].concat(RECORD)); }
function readRecord(root) {
    try {
        const j = JSON.parse(fs.readFileSync(recordFile(root), 'utf8'));
        if (j && typeof j.hash === 'string' && /^[0-9a-f]{64}$/.test(j.hash) && typeof j.since === 'string' && VERSION_OK.test(j.since)) return { hash: j.hash, since: j.since };
    } catch (e) { /* no record, or not one */ }
    return null;
}
function packageVersion(root) {
    try { const v = JSON.parse(fs.readFileSync(path.join(root || ROOT, SHELL_DIR, 'package.json'), 'utf8')).version; return (typeof v === 'string' && VERSION_OK.test(v)) ? v : null; } catch (e) { return null; }
}
// Is the record the core's? { ok, hash (the core's now), since (the record's, when there is one), why (when not ok) }
function status(root) {
    const hash = shellHash(root), rec = readRecord(root);
    if (!rec) return { ok: false, hash, since: null, why: 'tools/shellrev.json is missing or unreadable: run node tools/shellrev.js' };
    if (rec.hash !== hash) return { ok: false, hash, since: rec.since, why: STALE };
    return { ok: true, hash, since: rec.since };
}
// Record the core as it is now. Writes only when the hash moved (or nothing was recorded). { wrote, hash, since }
function record(root) {
    root = root || ROOT;
    const st = status(root);
    if (st.ok) return { wrote: false, hash: st.hash, since: st.since };
    const since = packageVersion(root);
    if (!since) throw new Error('cannot read a plain version from ' + SHELL_DIR + '/package.json');
    const file = recordFile(root);
    let crlf = false; try { crlf = fs.readFileSync(file, 'utf8').indexOf('\r\n') >= 0; } catch (e) { crlf = false; }
    const text = JSON.stringify({ hash: st.hash, since }, null, 2) + NL;
    fs.writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
    return { wrote: true, hash: st.hash, since };
}

function main(argv) {
    if (argv.length > 1 || (argv.length === 1 && argv[0] !== '--check')) { console.error('Usage:\n  node tools/shellrev.js           record the core as it is now\n  node tools/shellrev.js --check   exit 1 when the record is stale'); return 1; }
    if (argv[0] === '--check') {
        const st = status(ROOT);
        if (!st.ok) { console.error(st.why); return 1; }
        console.log('The record is the core\'s: last changed in ' + st.since + '.');
        return 0;
    }
    let r; try { r = record(ROOT); } catch (e) { console.error('Nothing written: ' + String(e && e.message || e)); return 1; }
    console.log(r.wrote ? 'Recorded: the core last changed in ' + r.since + ' (tools/shellrev.json — commit it).' : 'Nothing to record: the core is as tools/shellrev.json says (last changed in ' + r.since + ').');
    return 0;
}

module.exports = { hashedBytes, shellFiles, shellHash, readRecord, status, record, STALE };
if (require.main === module) process.exit(main(process.argv.slice(2)));
