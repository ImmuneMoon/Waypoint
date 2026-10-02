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
   {file} stands for the installer's path (the path is appended when the command has no {file}). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { execSync } = require('child_process');

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
    const updated = readme.replace(/Current release: \*\*[^*]+\*\*/, 'Current release: **' + VERSION + '**');
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
fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify({ version: VERSION, minShell: SHELL_SINCE, built: new Date().toISOString() }, null, 2));

// 3. installer
console.log('Compiling installer with Inno Setup...');
execSync(`"${ISCC}" "${path.join(ROOT, 'installer.iss')}"`, { stdio: 'inherit' });
// 3b. code-signing the installer is optional (a certificate is a separate purchase): only when WAYPOINT_SIGNTOOL says how
if (SIGNTOOL) {
    const exe = '"' + path.join(ROOT, 'Waypoint_Setup.exe') + '"';
    console.log('Code-signing the installer (WAYPOINT_SIGNTOOL)...');
    execSync(SIGNTOOL.includes('{file}') ? SIGNTOOL.split('{file}').join(exe) : SIGNTOOL + ' ' + exe, { stdio: 'inherit' });
} else {
    console.log('The installer is not code-signed (WAYPOINT_SIGNTOOL is not set): Windows will say it does not recognise the publisher.');
}
// 3c. the installer's own signature, over its bytes as they now are (after any code-signing): an install that updates its
//     own core checks this before it runs the file. The name is part of what is signed, so it never passes for the zip's.
const setupSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'Waypoint_Setup.exe'))).digest('hex');
const setupSig = signkey.signZip('Waypoint_Setup.exe', setupSha, VERSION, SIGNKEY);
if (!updater.verifyUpdate(UPDATE_PUBKEY, 'Waypoint_Setup.exe', setupSha, VERSION, setupSig)) { console.error('Not built: the installer\'s signature does not check against the public key in updatekey.js.'); process.exit(1); }
fs.copyFileSync(path.join(ROOT, 'Waypoint_Setup.exe'), path.join(dist, 'Waypoint_Setup.exe'));
fs.writeFileSync(path.join(dist, 'Waypoint_Setup.exe.sig'), setupSig + '\n');
}

// 4. notes: the top section of WHATSNEW.txt, turned into markdown for the GitHub Release body.
//    Just this version's notes — installing and updating are documented once, in the README.
function buildNotes() {
    const all = fs.readFileSync(path.join(ROOT, 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n');
    const top = (all.split(/\n(?=WAYPOINT \d)/)[0] || '').trim().split('\n');
    const out = ['# Waypoint ' + VERSION];
    let bullet = null;
    const flush = () => { if (bullet) { out.push('- ' + bullet); bullet = null; } };
    for (const raw of top.slice(2)) {                       // skip the title and its ==== underline
        const line = raw.replace(/\s+$/, '');
        if (!line) { flush(); continue; }
        if (/^- /.test(line)) { flush(); bullet = line.slice(2).trim(); continue; }
        if (/^\s/.test(line) && bullet) { bullet += ' ' + line.trim(); continue; }   // wrapped bullet line
        flush(); out.push('', '### ' + line.trim(), '');
    }
    flush();
    return out.join('\n') + '\n';
}
const notes = buildNotes();
fs.writeFileSync(path.join(dist, 'RELEASE_NOTES.md'), notes);

console.log('\nBuilt', dist);
console.log('  ' + fs.readdirSync(dist).join('\n  '));

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
    const rel = await api('POST', 'https://api.github.com/repos/' + REPO + '/releases', { tag_name: VERSION, name: 'Waypoint ' + VERSION, body: notes, draft: false, prerelease: false });
    const uploadBase = String(rel.upload_url).replace(/\{.*$/, '');
    for (const f of ASSETS) {
        const p = path.join(dist, f);
        console.log('Uploading', f, '(' + Math.round(fs.statSync(p).size / 1024) + ' KB)');
        await api('POST', uploadBase + '?name=' + encodeURIComponent(f), fs.readFileSync(p), 'application/octet-stream');
    }
    console.log('Published:', rel.html_url);
})().catch(e => { console.error(e.message); process.exit(1); });
