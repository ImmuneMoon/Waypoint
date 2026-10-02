/* The key that signs Waypoint's one-click updates.

   A one-click update replaces the app's own files, so the shell takes one only when it is signed by the key whose public
   half the shell carries (system/resources/app/updatekey.js; updater.js checks it). The private half is the owner's alone:
   it is made here once, written to a file OUTSIDE this repository, and read by tools/release.js from the file named by the
   WAYPOINT_SIGNING_KEY environment variable. It is never committed, never copied into system/, never printed.

   Usage:
     node tools/signkey.js <path-to-private-key.pem>            make the pair: the private key at that path (which must
                                                                not exist yet and must lie outside the repository), the
                                                                public key into updatekey.js
     node tools/signkey.js --replace <path-to-private-key.pem>  the same over a public key that is already there — every
                                                                install then needs a new installer before it can update
     node tools/signkey.js --check <path-to-private-key.pem>    is that file the private half of the committed public key?
                                                                (exit 0 yes, 1 no; writes nothing)

   Ed25519, the private key as PKCS8 PEM, the public key as SPKI PEM. Plain Node, no dependencies. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');   // the repository this tool lies in
const KEY_FILE = ['system', 'resources', 'app', 'updatekey.js'];
const NL = '\n';

/* ---- updatekey.js: the one file the shell reads the public key from, always exactly as written here ---- */
const KEY_HEAD = [
    "/* The public half of the key that signs Waypoint's one-click updates: updater.js takes an update only when its signature",
    '   checks against this key. It lives in the shell, which only the installer replaces, so an update cannot bring a key of',
    '   its own. Written by tools/signkey.js: never edit it by hand, and never put a private key here.',
    "   Empty ('') means no key has been made yet: no one-click update is taken at all. */",
    "'use strict';",
].join(NL) + NL;
const KEY_TAIL = 'module.exports = { UPDATE_PUBKEY };' + NL;
function pemLines(pem) {   // a public key in PEM as its lines, or null when it is not one (nothing else may reach the file)
    if (typeof pem !== 'string') return null;
    const lines = pem.replace(/\r\n/g, NL).trim().split(NL);
    if (lines.length < 3 || lines.length > 40) return null;
    if (lines[0] !== '-----BEGIN PUBLIC KEY-----' || lines[lines.length - 1] !== '-----END PUBLIC KEY-----') return null;
    if (!lines.slice(1, -1).every(l => /^[A-Za-z0-9+/]{1,76}={0,2}$/.test(l))) return null;
    return lines;
}
function keyFileText(pubPem) {   // the whole text of updatekey.js for a public key ('' for none), with LF line ends
    if (pubPem === '' || pubPem == null) return KEY_HEAD + "const UPDATE_PUBKEY = '';" + NL + KEY_TAIL;
    const lines = pemLines(pubPem);
    if (!lines) throw new Error('not a public key in PEM');
    return KEY_HEAD + 'const UPDATE_PUBKEY = [' + NL + lines.map(l => "    '" + l + "'," + NL).join('') + "    ''," + NL + "].join('\\n');" + NL + KEY_TAIL;
}
// the public key a repository's updatekey.js holds: { ok, pem ('' for none), crlf } — ok only for a file exactly as written above
function readPubKey(root) {
    const file = path.join.apply(path, [root].concat(KEY_FILE));
    let raw; try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { return { ok: false, file, why: 'cannot read ' + file }; }
    const text = raw.replace(/\r\n/g, NL);
    let pem = null;
    if (text === keyFileText('')) pem = '';
    else {
        const m = /^const UPDATE_PUBKEY = \[\n((?: {4}'[^'\n]*',\n)+)\]\.join\('\\n'\);$/m.exec(text);
        if (m) { const lines = m[1].split(NL).filter(Boolean).map(l => l.slice(5, -2)); try { const p = lines.join(NL); if (keyFileText(p) === text) pem = p; } catch (e) { pem = null; } }
    }
    if (pem === null) return { ok: false, file, why: file + ' is not as tools/signkey.js writes it' };
    return { ok: true, file, pem, crlf: raw.indexOf('\r\n') >= 0 };
}

/* ---- where a private key may lie: anywhere but inside the repository ---- */
function realish(p) {   // the path with every link followed, as far along it as the disk goes
    let cur = path.resolve(p); const tail = [];
    for (;;) {
        try { return path.join.apply(path, [fs.realpathSync.native(cur)].concat(tail)); } catch (e) { /* not there yet: try its folder */ }
        const up = path.dirname(cur);
        if (up === cur) return path.join.apply(path, [cur].concat(tail));
        tail.unshift(path.basename(cur)); cur = up;
    }
}
function insideRepo(file, root) {
    const fold = s => (process.platform === 'win32' || process.platform === 'darwin') ? s.toLowerCase() : s;   // a disk that ignores letter case names the same folder either way
    const rel = path.relative(fold(realish(root)), fold(realish(file)));
    return rel === '' || !(rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel));
}

/* ---- the release build's key: the private half of the committed public key, read from the file the variable names ---- */
function samePair(privKey, pubPem) {
    try { return crypto.createPublicKey(privKey).export({ type: 'spki', format: 'der' }).equals(crypto.createPublicKey(pubPem).export({ type: 'spki', format: 'der' })); } catch (e) { return false; }
}
// keyPath: what WAYPOINT_SIGNING_KEY holds. Returns { ok: true, key, file, pub } or { ok: false, why }.
function releaseKey(keyPath, root) {
    root = root || ROOT;
    if (typeof keyPath !== 'string' || !keyPath.trim()) return { ok: false, why: 'WAYPOINT_SIGNING_KEY is not set (it names the file that holds the update signing key)' };
    const pub = readPubKey(root);
    if (!pub.ok) return { ok: false, why: pub.why };
    if (!pub.pem) return { ok: false, why: 'no public key in system/resources/app/updatekey.js yet: the update signing key has not been made' };
    const file = path.resolve(keyPath);
    if (insideRepo(file, root)) return { ok: false, why: 'the signing key file lies inside the repository (' + file + '): keep it outside, where it cannot be committed or packed' };
    let text; try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return { ok: false, why: 'cannot read the signing key file ' + file }; }
    let key; try { key = crypto.createPrivateKey(text); } catch (e) { return { ok: false, why: 'the file ' + file + ' holds no private key' }; }
    if (key.asymmetricKeyType !== 'ed25519') return { ok: false, why: 'the key in ' + file + ' is not an Ed25519 key' };
    if (!samePair(key, pub.pem)) return { ok: false, why: 'the key in ' + file + ' is not the pair of the public key in system/resources/app/updatekey.js: installs would refuse the update' };
    return { ok: true, key, file, pub: pub.pem };
}
// a release file's signature (the app zip's, the installer's): Ed25519 over the words the shell rebuilds (updater.js signedText:
// the file's name as the release lists it, its digest, the version), base64
function signZip(zipName, sha256hex, version, key) {
    const text = require('../system/resources/app/updater.js').signedText(zipName, sha256hex, version);
    return crypto.sign(null, Buffer.from(text, 'utf8'), key).toString('base64');
}

/* ---- make the pair ---- */
// Returns { ok: true, file, replaced } or { ok: false, why }. Writes nothing unless everything may be written.
function makeKey(target, root, replace) {
    root = root || ROOT;
    if (typeof target !== 'string' || !target.trim()) return { ok: false, why: 'no path given for the private key' };
    const file = path.resolve(target);
    if (insideRepo(file, root)) return { ok: false, why: 'that path lies inside the repository (' + file + '). The private key must be kept outside it, where it cannot be committed or packed into a release.' };
    let there = true; try { fs.lstatSync(file); } catch (e) { there = false; }
    if (there) return { ok: false, why: 'something is already at ' + file + ' and is never overwritten. Name a file that does not exist yet.' };
    const pub = readPubKey(root);
    if (!pub.ok) return { ok: false, why: pub.why };
    if (pub.pem && !replace) return { ok: false, why: 'system/resources/app/updatekey.js already holds a public key. To check a private key against it: node tools/signkey.js --check <path>. To make a new pair over it, pass --replace (every install then needs a new installer before it can update).' };
    const pair = crypto.generateKeyPairSync('ed25519');
    const privPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), pubPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
    const keyText = keyFileText(pubPem);
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });   // a folder that is there (a drive's root too) is left alone
    fs.writeFileSync(file, privPem, { flag: 'wx', mode: 0o600 });   // wx: fails rather than replace a file that appeared meanwhile
    try { fs.writeFileSync(pub.file, pub.crlf ? keyText.replace(/\n/g, '\r\n') : keyText); }
    catch (e) { try { fs.unlinkSync(file); } catch (_) {} return { ok: false, why: 'could not write ' + pub.file + ' (' + (e && e.message || e) + '); no key was kept' }; }
    // the public key lies in the core, so the core just changed: its record (tools/shellrev.json) is written again, where the repository keeps one
    let recorded = null;
    try { if (fs.existsSync(path.join(root, 'tools', 'shellrev.json'))) recorded = require('./shellrev.js').record(root); } catch (e) { recorded = null; }
    return { ok: true, file, replaced: !!pub.pem, recorded };
}

function main(argv) {
    const args = argv.filter(a => a !== '--replace' && a !== '--check'), replace = argv.includes('--replace'), check = argv.includes('--check');
    const usage = 'Usage:\n  node tools/signkey.js <path-to-private-key.pem>            make the update signing key (the path: outside the repository, not there yet)\n  node tools/signkey.js --check <path-to-private-key.pem>    is that file the pair of the committed public key?\n  node tools/signkey.js --replace <path-to-private-key.pem>  make a new pair over a committed public key';
    if (args.length !== 1 || (check && replace)) { console.error(usage); return 1; }
    if (check) {
        const k = releaseKey(args[0], ROOT);
        if (!k.ok) { console.error('No: ' + k.why + '.'); return 1; }
        console.log('Yes: ' + k.file + ' is the pair of the public key in system/resources/app/updatekey.js.');
        return 0;
    }
    let r; try { r = makeKey(args[0], ROOT, replace); } catch (e) { r = { ok: false, why: String(e && e.message || e) }; }
    if (!r.ok) { console.error('Nothing written: ' + r.why); return 1; }
    console.log([
        'The update signing key is made.',
        '',
        '  The signing key (keep it secret): ' + r.file,
        '  Its public half:                  system/resources/app/updatekey.js  (commit this file)',
        r.recorded && r.recorded.wrote ? '  The core\'s record:                tools/shellrev.json  (written again: the key is part of the core; commit it too)' : '  The core\'s record:                run node tools/shellrev.js (the key is part of the core), then commit tools/shellrev.json',
        '',
        'Back it up somewhere safe and offline, and never commit it or copy it into this folder.',
        'If it is lost, no one-click update can be signed any more: a new pair has to be made (--replace)',
        'and every install needs a new installer before it can update again.',
        '',
        'To build a release, set the variable to the key file, for example in PowerShell:',
        '  $env:WAYPOINT_SIGNING_KEY = "' + r.file + '"',
        'then run: node tools/release.js',
    ].join(NL));
    if (r.replaced) console.log(NL + 'WARNING: the public key was replaced. Installs that carry the old key refuse every update signed with the new one:' + NL + 'each needs a new installer (which carries the new key) before it can take a one-click update again.');
    return 0;
}

module.exports = { keyFileText, readPubKey, insideRepo, releaseKey, signZip, makeKey };
if (require.main === module) process.exit(main(process.argv.slice(2)));
