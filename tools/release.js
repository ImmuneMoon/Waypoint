/* Build a Waypoint release: app zip + checksum + signature + manifest + installer + its signature, then
   (optionally) publish it as a GitHub Release with the assets attached.

   Usage:
     node tools/release.js                 build into dist/<version>/ and print what to upload
     node tools/release.js --publish       also create the GitHub Release (needs GITHUB_TOKEN with
                                           "contents: write" on the repo) and upload the assets

   Reads the version from system/resources/app/package.json, the repo slug from UPDATE_REPO in
   system/resources/app/main.js, and the release notes from the top section of WHATSNEW.txt.
   The manifest's minShell is the version in which the core last changed (everything under
   system/resources/app, and installer.iss): an install whose core is older takes the installer, not the
   one-click update. It is a recorded fact, not a constant to remember: tools/shellrev.json, kept by
   tools/shellrev.js. While that record is stale nothing is built. The app's own version.json carries
   the same minShell, inside what is signed, and an install holds an update to it.

   Signing. Every install takes a one-click update only when it is signed by the key whose public half
   its shell carries (system/resources/app/updatekey.js). So a release is built only with the private
   half at hand: the file named by the WAYPOINT_SIGNING_KEY environment variable (made once with
   tools/signkey.js, kept outside this repository). Without it nothing is built. The signature goes out
   as waypoint-app-<version>.zip.sig beside the checksum. The installer is signed with the same key
   (Waypoint_Setup.exe.sig: its name, its digest, the version): an install that updates its own core
   checks it before running it.
   The installer is code-signed only when WAYPOINT_SIGNTOOL is set: a whole command line, in which
   {file} stands for the installer's path (the path is appended when the command has no {file}).

   The installer is compiled from a clean copy, never from this folder. installer.iss packs every file that lies
   beside it, and this folder holds more than an install needs. So the build copies what an install needs, by name,
   into dist/<version>/stage (stageList, stageCopy), compiles the copy of installer.iss that lies there and takes
   the installer out of it. installer.iss itself is not changed, so the core is not either.

   The runtime. The Electron under system/ is not in the repository and reaches an install only through
   the installer. Which version that is is recorded as "electron" in system/resources/app/package.json
   and published in the manifest. The build compares the record with system/version and says so in one
   line when they differ — a warning, never a refusal, and nothing is looked up on the network. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { execSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SYSTEM = path.join(ROOT, 'system');
const pkg = JSON.parse(fs.readFileSync(path.join(SYSTEM, 'resources', 'app', 'package.json'), 'utf8'));
const VERSION = pkg.version;
const mainSrc = fs.readFileSync(path.join(SYSTEM, 'resources', 'app', 'main.js'), 'utf8');
const REPO = (mainSrc.match(/const UPDATE_REPO = '([^']+)'/) || [])[1];
const ISCC = process.env.ISCC || 'D:\\Files\\Programs\\Inno Setup 6\\ISCC.exe';
const PUBLISH = process.argv.includes('--publish');
const NOTES_ONLY = process.argv.includes('--notes-only');   // just regenerate RELEASE_NOTES.md
const SIGNTOOL = process.env.WAYPOINT_SIGNTOOL;
const signkey = require('./signkey.js');
const shellrev = require('./shellrev.js');
const updater = require('../system/resources/app/updater.js');
const { UPDATE_PUBKEY } = require('../system/resources/app/updatekey.js');

// The Electron this build packs (system/version, written by the runtime's own package) against the one the shell's
// package.json records: null when they agree, else one plain line for the builder to read.
// [servercheck:runtime-start]
function runtimeNote(recorded, bundled) {
    const rec = typeof recorded === 'string' ? recorded.trim() : '', got = typeof bundled === 'string' ? bundled.trim() : '';
    if (!rec) return 'Warning: system/resources/app/package.json records no "electron" version' + (got ? ' (system/version says ' + got + ')' : '') + ': record the one the installer packs.';
    if (!got) return 'Warning: system/version could not be read, so the Electron this build packs cannot be compared with the recorded ' + rec + '.';
    if (rec !== got) return 'Warning: this build packs Electron ' + got + ' (system/version) but system/resources/app/package.json records ' + rec + ': correct the record, or the runtime under system/.';
    return null;
}
// [servercheck:runtime-end]
function bundledElectron() { try { return fs.readFileSync(path.join(SYSTEM, 'version'), 'utf8'); } catch (e) { return null; } }
const RUNTIME_NOTE = runtimeNote(pkg.electron, bundledElectron());

// Before the first thing this build writes: the update signing key is the committed public key's own pair, or nothing is built.
let SIGNKEY = null;
if (!NOTES_ONLY) {
    const k = signkey.releaseKey(process.env.WAYPOINT_SIGNING_KEY, ROOT);
    if (!k.ok) {
        console.error('Not built: ' + k.why + '.');
        console.error('A release is signed with the update signing key, or installs would refuse it. Make the key once with\n  node tools/signkey.js <a path outside this repository>\nthen set WAYPOINT_SIGNING_KEY to that file (node tools/signkey.js --check <path> says whether a key file is the right one).');
        process.exit(1);
    }
    SIGNKEY = k.key;
}
// And the core's record is the core's: minShell is read from it, so a stale one would send app files to cores too old for them.
let SHELL_SINCE = null;
if (!NOTES_ONLY) {
    const rev = shellrev.status(ROOT);
    if (!rev.ok) { console.error('Not built: ' + rev.why + '.'); process.exit(1); }
    if (updater.cmpVersion(rev.since, VERSION) > 0) { console.error('Not built: tools/shellrev.json says the core last changed in ' + rev.since + ', which is newer than this release (' + VERSION + '). Correct the version in package.json, or the record (node tools/shellrev.js writes it).'); process.exit(1); }
    SHELL_SINCE = rev.since;
}

// The repository's private/ folder (an outside sheet reader of the owner's own, git-ignored) never ships. A build is refused while the app
// folder holds one, since the update zip packs the app folder whole; and while what the installer packs holds one that installer.iss does
// not exclude. The installer packs the stage alone (below), so the build asks that half of the stage's list, never of this folder.
// Null where a build may go on, else one plain line
// [servercheck:privateguard-start]
function privateGuard(rootHasPrivate, appHasPrivate, iss) {
    if (appHasPrivate) return 'Not built: system/app/private exists. Nothing private may stand in the app folder, which every update packs whole.';
    if (!rootHasPrivate) return null;
    const m = /^Source: "\*";[^\n]*Excludes: "([^"]*)"/m.exec(typeof iss === 'string' ? iss : ''), ex = m ? m[1].split(',').map(s => s.trim().toLowerCase()) : [];
    return ex.indexOf('private') >= 0 && ex.indexOf('private\\*') >= 0 ? null : 'Not built: the private folder stands beside this build and installer.iss does not exclude it (private,private\\*). The installer would pack it.';
}
// [servercheck:privateguard-end]

// The installer is compiled from a clean copy of what an install needs, never from this folder. installer.iss packs every file that
// lies beside it, less its own excludes, and this folder holds more than an install needs: the maintainer's own notes, working copies
// of the repository, a private folder, and whatever else comes. So the build copies into dist/<version>/stage by name, never by
// leaving things out: at the top only what an install needs (the launcher, the license and the notes the installer shows, the README)
// and installer.iss itself, and the folder system/ whole but for the per-install settings, the updater's own working folders and a
// private folder. Then it compiles the copy of installer.iss that lies there, as it is. A link or a junction anywhere in what would be
// copied refuses the build and is named, so nothing outside this folder is ever packed. So does a file of the list that is missing,
// and a file or folder that Windows marks hidden: the installer leaves out what is hidden, and a copy of a hidden folder is not hidden,
// so the stage would pack what this folder never did.
// [servercheck:stage-start]
const STAGE_FILES = ['Waypoint.exe', 'license.txt', 'README.md', 'WHATSNEW.txt', 'installer.iss'];
const STAGE_SKIP = ['system/userdata', 'system/app.prev', 'system/app.new', 'system/app.bad', 'system/app/private'];
// Which of rels (paths under root, written with forward slashes) Windows marks hidden. One PowerShell, named by its full path, reads
// the marks of exactly the paths handed in and nothing inside a folder that is passed over. Each path goes over as plain ASCII and
// comes back as its place in the list. [] where the system has no such mark; null where the marks could not be read.
function hiddenOf(root, rels) {
    if (process.platform !== 'win32' || !rels.length) return [];
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = "$ErrorActionPreference = 'Stop'; $i = 0; foreach ($b in [Console]::In.ReadToEnd().Split([char]10)) { if ($b.Trim()) { if ([IO.File]::GetAttributes([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($b.Trim()))) -band [IO.FileAttributes]::Hidden) { $i }; $i++ } }";
    const input = rels.map(r => Buffer.from(path.join(root, r), 'utf16le').toString('base64')).join('\n') + '\n';
    let out = ''; try { out = execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command', script], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 120000 }); } catch (e) { return null; }
    const at = String(out).split(/\s+/).filter(Boolean);
    return at.every(s => /^\d+$/.test(s) && +s < rels.length) ? at.map(s => rels[+s]) : null;
}
// What the stage will hold, read from root: { files, dirs }, each a path under root written with forward slashes (the folders from
// system/ down, each before the ones inside it), or { why }, one plain line. A skipped folder is passed over by its name, in any
// letter case, before anything in it is read. Nothing is written. Whether a path of the list is marked hidden is asked of
// hidden(root, paths), and of hiddenOf where none is handed in.
function stageList(root, hidden) {
    const files = [], dirs = [], skip = STAGE_SKIP.map(s => s.toLowerCase());
    const kindOf = rel => {
        let st = null; try { st = fs.lstatSync(path.join(root, rel)); } catch (e) { return e && e.code === 'ENOENT' ? null : 'unreadable'; }
        return st.isSymbolicLink() ? 'link' : st.isFile() ? 'file' : st.isDirectory() ? 'dir' : 'other';
    };
    const odd = (rel, k) => ({ why: 'Not built: ' + rel + (k === 'link' ? ' is a link or a junction. Nothing reached through one is packed: put the real file or folder there.'
        : k === 'dir' ? ' is a folder where the installer needs a file.' : k === 'file' ? ' is a file where the installer needs a folder.'
        : k === 'other' ? ' is not a plain file or folder.' : ' could not be read.') });
    for (const f of STAGE_FILES) {
        const k = kindOf(f);
        if (k === null) return { why: 'Not built: ' + f + ' is missing, and the installer needs it.' };
        if (k !== 'file') return odd(f, k);
        files.push(f);
    }
    const sk = kindOf('system');
    if (sk === null) return { why: 'Not built: the folder system is missing, and the installer needs it.' };
    if (sk !== 'dir') return odd('system', sk);
    for (let i = 0, todo = ['system']; i < todo.length; i++) {
        const dir = todo[i];
        let names = null; try { names = fs.readdirSync(path.join(root, dir)).sort(); } catch (e) { return odd(dir, 'unreadable'); }
        dirs.push(dir);
        for (const n of names) {
            const rel = dir + '/' + n;
            if (skip.indexOf(rel.toLowerCase()) >= 0) continue;
            const k = kindOf(rel);
            if (k === 'dir') todo.push(rel); else if (k === 'file') files.push(rel); else return odd(rel, k);
        }
    }
    let h = null; try { h = (typeof hidden === 'function' ? hidden : hiddenOf)(root, files.concat(dirs)); } catch (e) { h = null; }
    if (!Array.isArray(h) || !h.every(r => typeof r === 'string')) return { why: 'Not built: the hidden marks of what would be copied could not be read.' };
    if (h.length) return { why: 'Not built: ' + h[0] + ' is marked hidden' + (h.length > 1 ? ', and ' + (h.length - 1) + ' more' : '') + '. The installer leaves out what is hidden, and a copy of a hidden folder is not hidden: take the mark off, or take it away.' };
    return { files, dirs };
}
// Copies what stageList names into stage, made fresh: whatever was there before goes first. Every file byte for byte, keeping its own
// times (the installer stores them). The stage is a folder of its own: never root, a folder that holds root, or one inside what is
// copied. A refusal writes nothing. { files, bytes } or { why }, one plain line. hidden: as for stageList.
function stageCopy(root, stage, hidden) {
    const R = path.resolve(root), S = path.resolve(stage);
    const under = (a, b) => { const r = path.relative(a, b); return r === '' || (r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r)); };
    if (under(S, R) || STAGE_FILES.concat(['system']).some(e => under(path.join(R, e), S))) return { why: 'Not built: the stage (' + S + ') may not be this folder, hold it, or lie inside what is copied.' };
    const list = stageList(R, hidden);
    if (list.why) return list;
    let bytes = 0;
    try {
        fs.rmSync(S, { recursive: true, force: true });
        fs.mkdirSync(S, { recursive: true });
        for (const d of list.dirs) fs.mkdirSync(path.join(S, d));
        for (const f of list.files) {
            const from = path.join(R, f), to = path.join(S, f), st = fs.lstatSync(from);
            if (!st.isFile()) return { why: 'Not built: ' + f + ' changed while the stage was made. It is no longer a plain file.' };
            fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
            fs.utimesSync(to, st.atime, st.mtime);
            bytes += st.size;
        }
    } catch (e) { return { why: 'Not built: the stage could not be made (' + (e && e.message || String(e)) + ').' }; }
    return { files: list.files.length, bytes };
}
// [servercheck:stage-end]
// Before the first thing this build writes: what the stage will hold is read (a file of the list that is missing, or a link, refuses
// the build here), and no private folder is in it or in the app folder.
if (!NOTES_ONLY) {
    const sl = stageList(ROOT);
    if (sl.why) { console.error(sl.why); process.exit(1); }
    let issP = ''; try { issP = fs.readFileSync(path.join(ROOT, 'installer.iss'), 'utf8'); } catch (e) { issP = ''; }
    const pg = privateGuard(sl.files.concat(sl.dirs).some(f => /^private(\/|$)/i.test(f)), fs.existsSync(path.join(SYSTEM, 'app', 'private')), issP);
    if (pg) { console.error(pg); process.exit(1); }
    // 1.5.6 (the owner's ruling of 2026-10-24): a starter kept out of every build. Basic 3d6 lives in the tests' fixtures until it is rebuilt
    // from the handbook's design spec; one found back in the app folder refuses the build
    const HELD_OUT = ['system/app/assets/systems/3d6.json'], heldOut = HELD_OUT.filter(f => fs.existsSync(path.join(ROOT, f)));
    if (heldOut.length) { console.error('Refusing to build: ' + heldOut.join(', ') + ' is kept out of every release. Take it out of the app folder.'); process.exit(1); }
}

const dist = path.join(ROOT, 'dist', VERSION);
fs.mkdirSync(dist, { recursive: true });
const zipName = 'waypoint-app-' + VERSION + '.zip';
const zipPath = path.join(dist, zipName);
const ASSETS = ['Waypoint_Setup.exe', 'Waypoint_Setup.exe.sig', zipName, zipName + '.sha256', zipName + '.sig', 'manifest.json'];   // what a release carries: all of it, or it is not published

if (!NOTES_ONLY) {
// 0a. README names this release (pushed together with the published release)
{
    const readmePath = path.join(ROOT, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    const updated = readme.replace(/Current release: \*\*[^*]+\*\*/, 'Current release: **Waypoint Alpha ' + VERSION + '**');   // 1.5.6: the release's name (backlog 177); the tag stays the plain number
    if (updated !== readme) fs.writeFileSync(readmePath, updated);
}

// 0. the app folder carries its version (a hot update swaps system/app only, so this is what moves the number)
//    and the core it needs: this file is inside the signed zip, so an install holds the update to it whatever the manifest says
fs.writeFileSync(path.join(SYSTEM, 'app', 'version.json'), JSON.stringify({ version: VERSION, minShell: SHELL_SINCE }) + '\n');

// 0b. the interactive tutorial must still point at real controls (a moved button fails the build)
execSync('node "' + path.join(__dirname, 'tutorialcheck.js') + '"', { stdio: 'inherit' });

// 1. app zip (PowerShell's Compress-Archive: deflate entries, which updater.js reads)
console.log('Zipping system/app ->', zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(`powershell -NoProfile -Command "Compress-Archive -Force -Path '${path.join(SYSTEM, 'app', '*')}' -DestinationPath '${zipPath}'"`, { stdio: 'inherit' });
const sha = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
fs.writeFileSync(zipPath + '.sha256', sha + '  ' + zipName + '\n');

// 1b. the signature over the zip's name, its digest and the version — then checked exactly as an install will check it
const sig = signkey.signZip(zipName, sha, VERSION, SIGNKEY);
if (!updater.verifyUpdate(UPDATE_PUBKEY, zipName, sha, VERSION, sig)) { console.error('Not built: the signature just made does not check against the public key in updatekey.js.'); process.exit(1); }
fs.writeFileSync(zipPath + '.sig', sig + '\n');

// 2. manifest
fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify({ version: VERSION, minShell: SHELL_SINCE, built: new Date().toISOString(), electron: typeof pkg.electron === 'string' ? pkg.electron : null }, null, 2));   // electron: the runtime the installer packs, as package.json records it

// 3. installer, compiled from the stage: a clean copy of what an install needs (stageCopy, above), made fresh, so installer.iss packs
//    nothing else. Its OutputDir=. puts the installer beside it in the stage, and every step after this one takes it from there.
const STAGE = path.join(dist, 'stage');
console.log('Copying what an install needs into ' + path.relative(ROOT, STAGE) + '...');
const staged = stageCopy(ROOT, STAGE);
if (staged.why) { console.error(staged.why); process.exit(1); }
console.log('  ' + staged.files + ' files, ' + Math.round(staged.bytes / 1048576) + ' MB');
console.log('Compiling installer with Inno Setup...');
execSync(`"${ISCC}" "${path.join(STAGE, 'installer.iss')}"`, { stdio: 'inherit' });
const SETUP = path.join(STAGE, 'Waypoint_Setup.exe');
// 3b. code-signing the installer is optional (a certificate is a separate purchase): only when WAYPOINT_SIGNTOOL says how
if (SIGNTOOL) {
    const exe = '"' + SETUP + '"';
    console.log('Code-signing the installer (WAYPOINT_SIGNTOOL)...');
    execSync(SIGNTOOL.includes('{file}') ? SIGNTOOL.split('{file}').join(exe) : SIGNTOOL + ' ' + exe, { stdio: 'inherit' });
} else {
    console.log('The installer is not code-signed (WAYPOINT_SIGNTOOL is not set): Windows will say it does not recognize the publisher.');
}
// 3c. the installer's own signature, over its bytes as they now are (after any code-signing): an install that updates its
//     own core checks this before it runs the file. The name is part of what is signed, so it never passes for the zip's.
const setupSha = crypto.createHash('sha256').update(fs.readFileSync(SETUP)).digest('hex');
const setupSig = signkey.signZip('Waypoint_Setup.exe', setupSha, VERSION, SIGNKEY);
if (!updater.verifyUpdate(UPDATE_PUBKEY, 'Waypoint_Setup.exe', setupSha, VERSION, setupSig)) { console.error('Not built: the installer\'s signature does not check against the public key in updatekey.js.'); process.exit(1); }
fs.copyFileSync(SETUP, path.join(dist, 'Waypoint_Setup.exe'));
fs.writeFileSync(path.join(dist, 'Waypoint_Setup.exe.sig'), setupSig + '\n');
// the stage is a copy, and goes once the installer is out of it. A build that stops before here leaves it to be looked at; the next one makes it fresh.
fs.rmSync(STAGE, { recursive: true, force: true });
}

// 4. notes: the top section of WHATSNEW.txt, turned into markdown for the GitHub Release body.
//    Just this version's notes — installing and updating are documented once, in the README.
//    The notes are plain text and name Markdown's own marks and tags as examples (**, ~~, <u>, [text](address)): every character
//    Markdown or its HTML would read as markup is escaped, so the release page shows the words exactly as written.
// [updatercheck:notes-start]
function mdText(s) { return String(s).replace(/[\\`*_~\[\]<>#|&!]/g, '\\$&'); }
// [updatercheck:notes-end]
function buildNotes() {
    const all = fs.readFileSync(path.join(ROOT, 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n');
    const top = (all.split(/\n(?=WAYPOINT \d)/)[0] || '').trim().split('\n');
    const out = ['# Waypoint Alpha ' + VERSION];
    let bullet = null;
    const flush = () => { if (bullet) { out.push('- ' + mdText(bullet)); bullet = null; } };
    for (const raw of top.slice(2)) {                       // skip the title and its ==== underline
        const line = raw.replace(/\s+$/, '');
        if (!line) { flush(); continue; }
        if (/^- /.test(line)) { flush(); bullet = line.slice(2).trim(); continue; }
        if (/^\s/.test(line) && bullet) { bullet += ' ' + line.trim(); continue; }   // wrapped bullet line
        flush(); out.push('', '### ' + mdText(line.trim()), '');
    }
    flush();
    return out.join('\n') + '\n';
}
const notes = buildNotes();
fs.writeFileSync(path.join(dist, 'RELEASE_NOTES.md'), notes);

console.log('\nBuilt', dist);
console.log('  ' + fs.readdirSync(dist).join('\n  '));
if (RUNTIME_NOTE) console.warn(RUNTIME_NOTE);   // said last, where it is read: the build goes on either way

if (!PUBLISH) {
    console.log('\nTo publish: create a GitHub Release tagged', VERSION, 'on', REPO || '<set UPDATE_REPO in main.js>', 'and attach every file above,\nor run again with --publish and GITHUB_TOKEN set.');
    process.exit(0);
}

// 5. publish via the GitHub API
if (!REPO) { console.error('UPDATE_REPO is not set in main.js'); process.exit(1); }
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('GITHUB_TOKEN is not set'); process.exit(1); }
function api(method, url, body, contentType) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const data = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)));
        const req = https.request(u, { method, headers: { 'User-Agent': 'Waypoint-release', 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json', 'Content-Type': contentType || 'application/json', 'Content-Length': data ? data.length : 0 } }, res => {
            const chunks = []; res.on('data', c => chunks.push(c));
            res.on('end', () => { const txt = Buffer.concat(chunks).toString('utf8'); if (res.statusCode >= 300) return reject(new Error(method + ' ' + url + ' -> ' + res.statusCode + ' ' + txt.slice(0, 300))); try { resolve(JSON.parse(txt)); } catch (e) { resolve(txt); } });
        });
        req.on('error', reject); if (data) req.write(data); req.end();
    });
}
(async () => {
    const missing = ASSETS.filter(f => !fs.existsSync(path.join(dist, f)));
    if (missing.length) throw new Error('Not published: ' + missing.join(', ') + ' missing from ' + dist + ' (build first, without --notes-only)');   // never a release without its signature: no install would take it
    console.log('\nCreating release', VERSION, 'on', REPO);
    const rel = await api('POST', 'https://api.github.com/repos/' + REPO + '/releases', { tag_name: VERSION, name: 'Waypoint Alpha ' + VERSION, body: notes, draft: false, prerelease: false });
    const uploadBase = String(rel.upload_url).replace(/\{.*$/, '');
    for (const f of ASSETS) {
        const p = path.join(dist, f);
        console.log('Uploading', f, '(' + Math.round(fs.statSync(p).size / 1024) + ' KB)');
        await api('POST', uploadBase + '?name=' + encodeURIComponent(f), fs.readFileSync(p), 'application/octet-stream');
    }
    console.log('Published:', rel.html_url);
})().catch(e => { console.error(e.message); process.exit(1); });
