/* Build a Waypoint release: app zip + checksum + manifest + installer, then (optionally) publish
   it as a GitHub Release with the assets attached.

   Usage:
     node tools/release.js                 build into dist/<version>/ and print what to upload
     node tools/release.js --publish       also create the GitHub Release (needs GITHUB_TOKEN with
                                           "contents: write" on the repo) and upload the assets

   Reads the version from system/resources/app/package.json, the repo slug from UPDATE_REPO in
   system/resources/app/main.js, and the release notes from the top section of WHATSNEW.txt.
   The manifest's minShell is the version in which main.js last changed — set MIN_SHELL below
   when a release changes the shell; otherwise it is left as is. */
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
const MIN_SHELL = '1.1.2';   // keep low: the app files reach every shell as a one-click update, and the app itself walks an old core through the installer (settings.js SHELL_WANTED)   // bump to the current version whenever main.js / updater.js change
const mainSrc = fs.readFileSync(path.join(SYSTEM, 'resources', 'app', 'main.js'), 'utf8');
const REPO = (mainSrc.match(/const UPDATE_REPO = '([^']+)'/) || [])[1];
const ISCC = process.env.ISCC || 'D:\\Files\\Programs\\Inno Setup 6\\ISCC.exe';
const PUBLISH = process.argv.includes('--publish');
const NOTES_ONLY = process.argv.includes('--notes-only');   // just regenerate RELEASE_NOTES.md

const dist = path.join(ROOT, 'dist', VERSION);
fs.mkdirSync(dist, { recursive: true });
const zipName = 'waypoint-app-' + VERSION + '.zip';
const zipPath = path.join(dist, zipName);

if (!NOTES_ONLY) {
// 0a. README names this release (pushed together with the published release)
{
    const readmePath = path.join(ROOT, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    const updated = readme.replace(/Current release: \*\*[^*]+\*\*/, 'Current release: **' + VERSION + '**');
    if (updated !== readme) fs.writeFileSync(readmePath, updated);
}

// 0. the app folder carries its version (a hot update swaps system/app only, so this is what moves the number)
fs.writeFileSync(path.join(SYSTEM, 'app', 'version.json'), JSON.stringify({ version: VERSION }) + '\n');

// 0b. the interactive tutorial must still point at real controls (a moved button fails the build)
execSync('node "' + path.join(__dirname, 'tutorialcheck.js') + '"', { stdio: 'inherit' });

// 1. app zip (PowerShell's Compress-Archive: deflate entries, which updater.js reads)
console.log('Zipping system/app ->', zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(`powershell -NoProfile -Command "Compress-Archive -Force -Path '${path.join(SYSTEM, 'app', '*')}' -DestinationPath '${zipPath}'"`, { stdio: 'inherit' });
const sha = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
fs.writeFileSync(zipPath + '.sha256', sha + '  ' + zipName + '\n');

// 2. manifest
fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify({ version: VERSION, minShell: MIN_SHELL, built: new Date().toISOString() }, null, 2));

// 3. installer
console.log('Compiling installer with Inno Setup...');
execSync(`"${ISCC}" "${path.join(ROOT, 'installer.iss')}"`, { stdio: 'inherit' });
fs.copyFileSync(path.join(ROOT, 'Waypoint_Setup.exe'), path.join(dist, 'Waypoint_Setup.exe'));
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
    console.log('\nCreating release', VERSION, 'on', REPO);
    const rel = await api('POST', 'https://api.github.com/repos/' + REPO + '/releases', { tag_name: VERSION, name: 'Waypoint ' + VERSION, body: notes, draft: false, prerelease: false });
    const uploadBase = String(rel.upload_url).replace(/\{.*$/, '');
    for (const f of ['Waypoint_Setup.exe', zipName, zipName + '.sha256', 'manifest.json']) {
        const p = path.join(dist, f);
        console.log('Uploading', f, '(' + Math.round(fs.statSync(p).size / 1024) + ' KB)');
        await api('POST', uploadBase + '?name=' + encodeURIComponent(f), fs.readFileSync(p), 'application/octet-stream');
    }
    console.log('Published:', rel.html_url);
})().catch(e => { console.error(e.message); process.exit(1); });
