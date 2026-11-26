/* Build a Waypoint release: app zip + checksum + signature + manifest + installer + its signature + the site's signed list,
   then (optionally) publish it on Waypoint's own website, and during the changeover on GitHub too.

   Usage:
     node tools/release.js                    build into dist/<version>/ and print what to publish
     node tools/release.js --github           build as above, then publish it as a GitHub Release with the GitHub command
                                              line tool (gh), signed in on this machine: the way to release while installs
                                              read GitHub (updater.js UPDATE_SOURCE 'github', 1.6.4; Fulllion, 2026-11-25).
                                              Refused where the source is not 'github', where gh is missing or not signed
                                              in, where the tag or a release of it is already on GitHub, and where any of
                                              the six assets is missing. It never touches the website's download host and
                                              sends no dispatch. Then node tools/ghlive.js says whether an install of
                                              1.6.3 sees it, as an install reads it (read only, no token).
     node tools/release.js --publish          also put the files and the signed list on Waypoint's download host
                                              (Cloudflare R2, through its S3 API: WAYPOINT_R2_ENDPOINT, WAYPOINT_R2_BUCKET,
                                              WAYPOINT_R2_KEY_ID, WAYPOINT_R2_SECRET) and wake the website
                                              (repository_dispatch waypoint-release, with WAYPOINT_DISPATCH_TOKEN, to
                                              WAYPOINT_DISPATCH_REPO, by default the website repository sitepub.js names)
     node tools/release.js --publish --github also create the GitHub Release as before (GITHUB_TOKEN with "contents:
                                              write" on the repo), after the site: installs of 1.6.3 and older still read
                                              their updates there, so it is kept while installs move (the safe order the
                                              owner approved on 2026-11-16: the December installer ships to both)
     node tools/sitepub.js --check            the checklist step after: does the live site name this release, as an
                                              install reads it? (exit 0 yes, 1 no; writes nothing)
   Any other option is refused, so a word mistyped never builds a release that is not published as it was meant to be.
   --github alone is the GitHub-only release above; --publish --github is the website's release with GitHub beside it, for
   later, once the source is 'site' and a code-signing certificate exists.

   Reads the version from system/resources/app/package.json and the release notes from the top section of WHATSNEW.txt,
   which must be this version's section (the build is refused otherwise, before it writes anything). From 1.6.4 an install
   reads its updates from Waypoint's own website (main.js UPDATE_SITE): the build writes dist/<version>/envelope.json, the
   signed list the site serves (tools/sitepub.js: the manifest of the zip and the installer, each with its address on the
   download host, its size, digest and own signature, the notes as plain text and the page that shows them,
   https://waypointvtt.com/whats-new#<version>, signed with Ed25519 over "waypoint-manifest\n" and its text), reads it back at
   once exactly as an install will and refuses to build where an install would not take it as written. --publish puts the
   five files on the download host first, then the list as waypoint/<version>/manifest.json, then, last of all, the same list
   as waypoint/latest.json (sitepub.sitePublish): a version already there is never written over, and a put that fails stops
   before either list, so no install is ever offered what is half there. The notes the app itself shows
   (system/app/assets/whatsnew.txt) must begin with the very section WHATSNEW.txt begins with, or nothing is built.
   Every setting a publication needs is asked for before the build writes anything, and each refusal is one plain line.

   Finishing, never rebuilding (the review of 2026-11-17). With --publish the bucket is looked at BEFORE anything is built. Where
   it holds nothing of this version, the build goes on. Where it holds the version, whole or in part, nothing is built, so
   dist/<version>/ (whose files are the very ones on the bucket: an installer compiled and signed again would differ in its
   bytes) is never written over: the run checks that the bucket holds this very build, puts only what is missing (latest.json
   among it, where an earlier run stopped on it), wakes the website where latest.json was put now, and with --github goes on
   to the GitHub Release. So a run stopped by a network blip, or a GitHub step that failed, is finished by running the same
   command again. The GitHub Release is made as a draft, its six assets uploaded, and only then published, so installs of 1.6.3
   never see a release short of its files; a draft an earlier run left is taken away first. Child processes (the tour's check,
   the archiver, Inno Setup, the code-signing command) are handed the environment without the bucket's token, the dispatch
   token, GITHUB_TOKEN and the signing key's path (CHILD_ENV).
   The checklist, in order, for a release that ships the installer: --publish --github (the site, then the dispatch, then
   GitHub); then node tools/sitepub.js --check must say the site names this version (an install of it reports up to date, an
   older one is offered it) before the release is announced.

   Stripped. The app folder that is zipped and packed into the installer is the stage's copy with its comments taken out
   (tools/stripcore.js stripTree, which keeps every name and every line, so an error report still points at the right
   function and line). Where stripTree refuses a file the build stops, naming it: nothing is zipped, compiled or published.
   The stage's copy keeps each file's own times.

   Test hosts. Only a test of this tool (tools/updatercheck.js) may point the dispatch or the GitHub Release at a stand-in on
   this machine (WAYPOINT_RELEASE_TEST_DISPATCH, WAYPOINT_RELEASE_TEST_GITHUB), or the bucket at an address of this machine,
   and only with WAYPOINT_RELEASE_TEST=1 set: a stand-in named without it refuses the build (sitepub.testHosts).
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
   {file} stands for the installer's path (the path is appended when the command has no {file}). 1.6.4 ships with an
   installer that is not code-signed (no certificate yet), so a plain build and --github leave it so and say it; --publish,
   the website's release, is refused without WAYPOINT_SIGNTOOL, since that release is meant to ship with a certificate.

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
const REPO = 'ImmuneMoon/Waypoint';   // the public GitHub repository releases are published to: every install of 1.6.4 and older reads it (updater.js UPDATE_REPO, which updatercheck holds to this)
const ISCC = process.env.ISCC || 'D:\\Files\\Programs\\Inno Setup 6\\ISCC.exe';
// The options this tool takes, and nothing else: an option it does not know (an old --publish-site among them) refuses the run before
// anything is read or written, so a mistyped word never builds a release that is not published as it was meant to be.
const OPTIONS = ['--publish', '--github', '--notes-only'];
{
    const odd = process.argv.slice(2).filter(a => OPTIONS.indexOf(a) < 0);
    if (odd.length) { console.error('Not built: ' + odd[0] + ' is no option of this tool (it takes ' + OPTIONS.join(', ') + (odd[0] === '--publish-site' ? '; --publish now puts the release on the site' : '') + ').'); process.exit(1); }
}
const PUBLISH = process.argv.includes('--publish');   // 1.6.4: put the files and the signed list on Waypoint's download host, and wake the website
const GITHUB = process.argv.includes('--github');     // with --publish: the GitHub Release too; alone: the GitHub-only release through gh (GH_ONLY)
const GH_ONLY = GITHUB && !PUBLISH;                   // while installs read GitHub (updater.js UPDATE_SOURCE 'github'): build, then gh release
const NOTES_ONLY = process.argv.includes('--notes-only');   // just regenerate RELEASE_NOTES.md
const SIGNTOOL = process.env.WAYPOINT_SIGNTOOL;
const sitepub = require('./sitepub.js');
const stripcore = require('./stripcore.js');
if (NOTES_ONLY && (PUBLISH || GITHUB)) { console.error('Not built: --notes-only builds no release to publish.'); process.exit(1); }
// Where a test's stand-ins are: { test: false } for every real run. A stand-in named without WAYPOINT_RELEASE_TEST=1 refuses the run.
const TEST = sitepub.testHosts(process.env);
if (TEST.why) { console.error(TEST.why); process.exit(1); }
const signkey = require('./signkey.js');
const shellrev = require('./shellrev.js');
const updater = require('../system/resources/app/updater.js');
const { UPDATE_PUBKEY } = require('../system/resources/app/updatekey.js');
// --github alone publishes to GitHub only, which is right only while installs read GitHub: once the switch says 'site', a
// release made on GitHub alone would reach no install of the new source, so it must go through --publish --github.
if (GH_ONLY && updater.UPDATE_SOURCE !== 'github') { console.error('Not built: --github alone publishes to GitHub only, and installs now read Waypoint\'s website (updater.js UPDATE_SOURCE is \'' + updater.UPDATE_SOURCE + '\'): use --publish --github.'); process.exit(1); }
// What every child process is handed (the review of 2026-11-17): this environment without the secrets only this process uses (the
// bucket's token, the dispatch token, GITHUB_TOKEN) and the signing key's path, so the tour's check, the archiver, Inno Setup (whose
// preprocessor can read the environment) and the owner's code-signing command never see them. Names are matched in any letter case,
// as Windows reads them.
const CHILD_ENV = (() => {
    const e = Object.assign({}, process.env);
    for (const k of Object.keys(e)) if (/^(WAYPOINT_R2_\w+|WAYPOINT_DISPATCH_TOKEN|GITHUB_TOKEN|WAYPOINT_SIGNING_KEY)$/i.test(k)) delete e[k];
    return e;
})();

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
// The publication needs the bucket and its token, the website's dispatch token and repository, and with --github GitHub's token:
// all asked for before the first thing the build writes, so a run never uploads half and then stops for a missing word.
let R2 = null, DISPATCH = null;
if (PUBLISH) {
    R2 = sitepub.r2Config(process.env, { test: TEST.test === true });
    if (R2.why) { console.error(R2.why); process.exit(1); }
    const token = typeof process.env.WAYPOINT_DISPATCH_TOKEN === 'string' ? process.env.WAYPOINT_DISPATCH_TOKEN.trim() : '';
    if (!token) { console.error('Not built: WAYPOINT_DISPATCH_TOKEN is not set (--publish tells the website that the release is there; the owner\'s token for the website repository).'); process.exit(1); }
    const repo = sitepub.repoOk(process.env.WAYPOINT_DISPATCH_REPO === undefined ? sitepub.WEBSITE_REPO : process.env.WAYPOINT_DISPATCH_REPO);
    if (!repo) { console.error('Not built: WAYPOINT_DISPATCH_REPO is not a repository\'s name (owner/name).'); process.exit(1); }
    DISPATCH = { token, repo, origin: TEST.dispatch || 'https://api.github.com' };
    if (GITHUB && !(typeof process.env.GITHUB_TOKEN === 'string' && process.env.GITHUB_TOKEN.trim())) { console.error('Not built: GITHUB_TOKEN is not set (--github): nothing built or uploaded.'); process.exit(1); }
    // --publish is the website's release, meant to ship once a code-signing certificate exists (Fulllion, 2026-11-23, and 2026-11-25:
    // 1.6.4 itself goes out on GitHub, not code-signed, through --github). So it is never built with an installer that is not
    // code-signed. A plain build, --github, and a test's run with its stand-ins may still leave it unsigned
    if (!SIGNTOOL && TEST.test !== true) { console.error('Not built: WAYPOINT_SIGNTOOL is not set, and --publish is the website\'s release, made with a code-signing certificate (to release on GitHub while installs read it, use --github alone).'); process.exit(1); }
}

// Before the build (the review of 2026-11-17): with --publish the bucket is looked at first (sitepub.siteState: each key of this version,
// its list where it is there, and latest.json; nothing is written), so a version the bucket holds, whole or in part, is never rebuilt over
// dist/<version>/, whose files are the very ones put there. Answers null where nothing of this version is in the bucket and the build goes
// on; else what the bucket holds, and the run then builds nothing and finishes the release from dist/<version>/ as it is (or, where dist
// holds no list and the bucket holds the version's own, puts latest.json alone). Each refusal is one plain line, before anything is
// written: a token the bucket refuses, a latest.json that names a newer version or is no list of the shell's key, a list on the bucket
// that is not dist's own, a part-way run whose build dist no longer holds, and --github where dist holds no list.
async function siteBefore() {
    const site = sitepub.siteOf(ROOT), distAt = path.join(ROOT, 'dist', VERSION), refuse = why => { console.error('Not built: ' + why); process.exit(1); };
    let st = null, lv = null;
    try { st = await sitepub.siteState({ cfg: R2, version: VERSION }); lv = sitepub.latestOf(st, UPDATE_PUBKEY, site); }
    catch (e) { refuse(String(e && e.message || e).replace(/^Not uploaded to the site: /, '')); }
    const there = Object.keys(st.there);
    if (!there.length) {
        if (lv !== null && updater.cmpVersion(lv, VERSION) >= 0) refuse('the site already names ' + lv + ' as the newest (' + sitepub.LATEST_KEY + '), and ' + VERSION + ' is not newer: build the next version.');
        return null;
    }
    let local = null; try { local = fs.readFileSync(path.join(distAt, sitepub.ENVELOPE_NAME)); } catch (e) { local = null; }
    if (st.env && local && !st.env.equals(local)) refuse('version ' + VERSION + ' is already on the site (' + st.envKey + ') from another build: dist/' + VERSION + '/' + sitepub.ENVELOPE_NAME + ' is not the list put there, and a release on the download host is never replaced. Nothing was built or put: build the next version.');
    if (!st.env && !local) refuse(there[0] + (there.length > 1 ? ' and ' + (there.length - 1) + ' more are' : ' is') + ' already in the bucket, though no list of ' + VERSION + ' is (an earlier run stopped part way, and no install has seen it), and dist/' + VERSION + '/ no longer holds that build. Nothing is rebuilt over it: delete ' + st.base + ' in the bucket by hand and run again, or build the next version.');
    if (!local && GITHUB) refuse('version ' + VERSION + ' is on the site, but dist/' + VERSION + '/ does not hold the build that was put there, so its GitHub Release cannot be made from here. Run --publish alone to finish the site, and --github where that build is.');
    console.log('Version ' + VERSION + ' is in the bucket already (' + there.length + ' of its ' + st.keys.length + ' keys' + (st.env ? ', its list among them' : '') + '): nothing is built, and the release is finished from ' + (local ? 'dist/' + VERSION + '/ as it is' : 'the list on the bucket') + '.');
    return st;
}

// The run itself, after the settings above (the review of 2026-11-17 made it a function, so the bucket can be asked before the build):
// the build's own checks, the build into dist/<version>/, the notes, and with --publish the site, the dispatch and the GitHub Release.
// Where the bucket already holds this version (RESUME) nothing is checked for a build or built: the release is finished from dist as it is.
// Called once, at the end of this file; whatever it throws is said in one line and ends the run with exit 1.
async function main() {
// With --github alone, gh is asked first whether it can publish at all, and whether GitHub already holds this version (ghBefore, below)
if (GH_ONLY) ghBefore();
// With --publish, what the bucket holds decides whether this run builds (siteBefore, above)
const RESUME = PUBLISH ? await siteBefore() : null;
// And the core's record is the core's: minShell is read from it, so a stale one would send app files to cores too old for them.
let SHELL_SINCE = null;
if (!NOTES_ONLY && !RESUME) {
    const rev = shellrev.status(ROOT);
    if (!rev.ok) { console.error('Not built: ' + rev.why + '.'); process.exit(1); }
    if (updater.cmpVersion(rev.since, VERSION) > 0) { console.error('Not built: tools/shellrev.json says the core last changed in ' + rev.since + ', which is newer than this release (' + VERSION + '). Correct the version in package.json, or the record (node tools/shellrev.js writes it).'); process.exit(1); }
    SHELL_SINCE = rev.since;
}
// The notes the site and GitHub show are WHATSNEW.txt's newest section, so that section must be this release's: written first. And the
// notes the app itself shows (system/app/assets/whatsnew.txt, which the zip and the installer carry) must begin with the very same
// section (the review of 2026-11-17), so the site and the app never say two things of one release.
if (!NOTES_ONLY && !RESUME) {
    let wn = ''; try { wn = fs.readFileSync(path.join(ROOT, 'WHATSNEW.txt'), 'utf8'); } catch (e) { wn = ''; }
    const top = sitepub.topVersion(wn);
    if (top !== VERSION) { console.error('Not built: WHATSNEW.txt\'s newest section is ' + (top ? 'for ' + top : 'missing') + ', not for this release (' + VERSION + '): write its notes first, under a heading WAYPOINT ' + VERSION + '.'); process.exit(1); }
    let wa = null; try { wa = fs.readFileSync(path.join(SYSTEM, 'app', 'assets', 'whatsnew.txt'), 'utf8'); } catch (e) { wa = null; }
    if (wa === null || sitepub.topSection(wa) !== sitepub.topSection(wn)) {
        const at = wa === null ? null : sitepub.topVersion(wa);
        console.error('Not built: system/app/assets/whatsnew.txt, the notes the app itself shows, ' + (wa === null ? 'is missing' : 'does not begin with the section WHATSNEW.txt begins with (its newest is ' + (at ? 'for ' + at : 'missing') + ')') + ': copy WHATSNEW.txt\'s newest section there too.');
        process.exit(1);
    }
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
    let out = ''; try { out = execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command', script], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 120000, env: typeof CHILD_ENV === 'object' && CHILD_ENV ? CHILD_ENV : process.env }); } catch (e) { return null; }
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
if (!NOTES_ONLY && !RESUME) {
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
if (!RESUME) fs.mkdirSync(dist, { recursive: true });   // a run that finishes a release writes nothing here
const zipName = 'waypoint-app-' + VERSION + '.zip';
const zipPath = path.join(dist, zipName);
let SITE_WANT = null, SITE = null;   // what the site's list names, once 3d has written and checked it: the upload holds the files on disk to it
const ASSETS = ['Waypoint_Setup.exe', 'Waypoint_Setup.exe.sig', zipName, zipName + '.sha256', zipName + '.sig', 'manifest.json'];   // what a release carries: all of it, or it is not published

if (!NOTES_ONLY && !RESUME) {
// 0a. README names this release (pushed together with the published release)
{
    const readmePath = path.join(ROOT, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    const updated = readme.replace(/Current release: \*\*[^*]+\*\*/, 'Current release: **Waypoint VTT Alpha ' + VERSION + '**');   // 1.5.6: the release's name (backlog 177); the tag stays the plain number
    if (updated !== readme) fs.writeFileSync(readmePath, updated);
}

// 0. the app folder carries its version (a hot update swaps system/app only, so this is what moves the number)
//    and the core it needs: this file is inside the signed zip, so an install holds the update to it whatever the manifest says
fs.writeFileSync(path.join(SYSTEM, 'app', 'version.json'), JSON.stringify({ version: VERSION, minShell: SHELL_SINCE }) + '\n');

// 0b. the interactive tutorial must still point at real controls (a moved button fails the build)
execSync('node "' + path.join(__dirname, 'tutorialcheck.js') + '"', { stdio: 'inherit', env: CHILD_ENV });

// 1. the stage: a clean copy of what an install needs (stageCopy, above), made fresh, so installer.iss packs nothing else. Its app
//    folder is then stripped of comments (1.6.4): the raw copy is moved aside into dist/<version>/app-unstripped, stripTree writes the
//    stripped one back in its place (refusing, by the file's name, where a stripped file would not read as its source does), each
//    file and folder keeps its own times, and the raw copy goes. Both the app zip and the installer are made from the stripped copy.
const STAGE = path.join(dist, 'stage');
console.log('Copying what an install needs into ' + path.relative(ROOT, STAGE) + '...');
const staged = stageCopy(ROOT, STAGE);
if (staged.why) { console.error(staged.why); process.exit(1); }
console.log('  ' + staged.files + ' files, ' + Math.round(staged.bytes / 1048576) + ' MB');
const STAGE_APP = path.join(STAGE, 'system', 'app');
{
    const RAW = path.join(dist, 'app-unstripped');
    fs.rmSync(RAW, { recursive: true, force: true });
    fs.renameSync(STAGE_APP, RAW);
    let rep = null;
    try { rep = stripcore.stripTree(RAW, STAGE_APP); } catch (e) { console.error('Not built: ' + String(e && e.message || e).replace(/\s+/g, ' ').replace(/\.$/, '') + '.'); process.exit(1); }
    // the folders stripTree does not make (it copies files: an empty folder would be lost) and every file's and folder's own times
    const keepTimes = rel => {
        const from = rel ? path.join(RAW, rel) : RAW, to = rel ? path.join(STAGE_APP, rel) : STAGE_APP;
        fs.mkdirSync(to, { recursive: true });
        for (const e of fs.readdirSync(from, { withFileTypes: true })) {
            const r = rel ? rel + '/' + e.name : e.name;
            if (e.isDirectory()) keepTimes(r);
            else { const st = fs.statSync(path.join(from, e.name)); fs.utimesSync(path.join(to, e.name), st.atime, st.mtime); }
        }
        const st = fs.statSync(from); fs.utimesSync(to, st.atime, st.mtime);
    };
    keepTimes('');
    fs.rmSync(RAW, { recursive: true, force: true });
    console.log('  comments taken out of ' + rep.stripped.length + ' files: ' + Math.round(rep.saved / 1024) + ' KB less');
}

// 2. app zip of the stage's stripped app folder (PowerShell's Compress-Archive: deflate entries, which updater.js reads)
console.log('Zipping the stripped system/app ->', zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
execSync(`powershell -NoProfile -Command "Compress-Archive -Force -Path '${path.join(STAGE_APP, '*')}' -DestinationPath '${zipPath}'"`, { stdio: 'inherit', env: CHILD_ENV });
const sha = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
fs.writeFileSync(zipPath + '.sha256', sha + '  ' + zipName + '\n');

// 2b. the signature over the zip's name, its digest and the version — then checked exactly as an install will check it
const sig = signkey.signZip(zipName, sha, VERSION, SIGNKEY);
if (!updater.verifyUpdate(UPDATE_PUBKEY, zipName, sha, VERSION, sig)) { console.error('Not built: the signature just made does not check against the public key in updatekey.js.'); process.exit(1); }
fs.writeFileSync(zipPath + '.sig', sig + '\n');

// 2c. the manifest GitHub's release carries, for installs of 1.6.3 and older
fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify({ version: VERSION, minShell: SHELL_SINCE, built: new Date().toISOString(), electron: typeof pkg.electron === 'string' ? pkg.electron : null }, null, 2));   // electron: the runtime the installer packs, as package.json records it

// 3. installer, compiled from the stage (made and stripped in step 1). Its OutputDir=. puts the installer beside it in the stage, and
//    every step after this one takes it from there.
console.log('Compiling installer with Inno Setup...');
// 1.6.4: the release's own version goes in as AppVer, which installer.iss reads for the installed-apps list and the file's version
execSync(`"${ISCC}" /DAppVer=${VERSION} "${path.join(STAGE, 'installer.iss')}"`, { stdio: 'inherit', env: CHILD_ENV });
const SETUP = path.join(STAGE, 'Waypoint_Setup.exe');
// 3b. code-signing the installer is optional (a certificate is a separate purchase): only when WAYPOINT_SIGNTOOL says how
if (SIGNTOOL) {
    const exe = '"' + SETUP + '"';
    console.log('Code-signing the installer (WAYPOINT_SIGNTOOL)...');
    execSync(SIGNTOOL.includes('{file}') ? SIGNTOOL.split('{file}').join(exe) : SIGNTOOL + ' ' + exe, { stdio: 'inherit', env: CHILD_ENV });
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

// 3d. the signed list Waypoint's website serves (1.6.4): the manifest of this release (the zip and the installer, each by its exact
//     name, with its address on the download host, its size, digest and own signature, and the notes as plain text), signed over
//     "waypoint-manifest\n" and its text, written as dist/<version>/envelope.json. It is read back at once exactly as an install
//     will read it, with the key the shell carries, and held to what was written: a list an install would refuse, or would read
//     otherwise, stops the build here, so the writer can never drift from the shell's cleanManifest.
{
    const site = sitepub.siteOf(ROOT), zipBytes = fs.readFileSync(zipPath), setupBytes = fs.readFileSync(path.join(dist, 'Waypoint_Setup.exe'));
    const files = [sitepub.fileEntry(site, VERSION, zipName, zipBytes, sig), sitepub.fileEntry(site, VERSION, 'Waypoint_Setup.exe', setupBytes, setupSig)];
    const want = { version: VERSION, minShell: SHELL_SINCE, electron: typeof pkg.electron === 'string' ? pkg.electron : null, published: new Date().toISOString(),
        notes: sitepub.notesText(fs.readFileSync(path.join(ROOT, 'WHATSNEW.txt'), 'utf8')), notesUrl: sitepub.notesUrlOf(site, VERSION), files };
    const envText = sitepub.envelopeOf(sitepub.siteManifest(want), SIGNKEY);
    want.files = {}; for (const f of files) want.files[f.name] = { size: f.size, sha256: f.sha256 };
    const why = sitepub.envelopeCheck(envText, UPDATE_PUBKEY, site, want);
    if (why) { console.error('Not built: the site\'s list is not one an install takes as written (' + why + ').'); process.exit(1); }
    fs.writeFileSync(path.join(dist, sitepub.ENVELOPE_NAME), envText);
    SITE_WANT = want; SITE = site;
}
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
    const top = (all.split(/\n(?=WAYPOINT (?:VTT )?\d)/)[0] || '').trim().split('\n');
    const out = ['# Waypoint VTT Alpha ' + VERSION];
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
// A run that builds nothing (a resume) writes no notes: the GitHub Release takes the ones its build wrote, read at that step.
const notes = RESUME ? null : buildNotes();
if (!RESUME) {
fs.writeFileSync(path.join(dist, 'RELEASE_NOTES.md'), notes);

console.log('\nBuilt', dist);
console.log('  ' + fs.readdirSync(dist).join('\n  '));
if (RUNTIME_NOTE) console.warn(RUNTIME_NOTE);   // said last, where it is read: the build goes on either way
}

if (!PUBLISH) {
    // 1.6.4 ships reading its updates from GitHub (updater.js UPDATE_SOURCE 'github'; Fulllion, 2026-11-25), so until that is
    // switched to 'site' a release is a GitHub Release of the six files above: --github makes it here, through gh.
    if (GH_ONLY) { ghPublish(dist, ASSETS); return; }
    if (!NOTES_ONLY) console.log('\nTo publish while installs read GitHub (updater.js UPDATE_SOURCE is \'github\'): run node tools/release.js --github, which builds again and makes the GitHub Release\ntagged ' + VERSION + ' with the six files above (' + ASSETS.join(', ') + '), then node tools/ghlive.js.\nOnce installs read the website: run with --publish (the R2 bucket, its token, WAYPOINT_DISPATCH_TOKEN and WAYPOINT_SIGNTOOL set), with --github too,\nthen node tools/sitepub.js --check.');
    process.exit(0);
}

// 5. publish: the site, then the dispatch, then (with --github) the GitHub Release through its API

const TOKEN = process.env.GITHUB_TOKEN;
// GitHub's API, and where its uploads may go: api.github.com and uploads.github.com, or a test's stand-in on this machine
// (read only with WAYPOINT_RELEASE_TEST=1). An upload address the release names anywhere else is refused, never followed.
const GH_API = TEST.github || 'https://api.github.com', GH_UPLOADS = TEST.github || 'https://uploads.github.com';
function api(method, url, body, contentType) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const data = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)));
        const req = (u.protocol === 'http:' ? require('http') : https).request(u, { method, headers: { 'User-Agent': 'Waypoint-release', 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json', 'Content-Type': contentType || 'application/json', 'Content-Length': data ? data.length : 0 } }, res => {
            const chunks = []; res.on('data', c => chunks.push(c));
            res.on('end', () => { const txt = Buffer.concat(chunks).toString('utf8'); if (res.statusCode >= 300) return reject(new Error(method + ' ' + url + ' -> ' + res.statusCode + ' ' + txt.slice(0, 300))); try { resolve(JSON.parse(txt)); } catch (e) { resolve(txt); } });
        });
        req.on('error', reject); if (data) req.write(data); req.end();
    });
}
    // 5a. the site first (1.6.4): the files, then the version's signed list, then latest.json, on the download host. Where this run
    //     built nothing (RESUME), sitePublish holds dist/<version>/ to what the bucket holds and puts only what is missing.
    if (!SITE_WANT && !RESUME) throw new Error('Not uploaded to the site: no list was built in this run.');
    console.log('\nPutting ' + VERSION + ' on Waypoint\'s download host');
    const up = await sitepub.sitePublish({ cfg: R2, dist, version: VERSION, pubKey: UPDATE_PUBKEY, site: SITE || sitepub.siteOf(ROOT), want: SITE_WANT, log: console.log });
    if (up.keys.length) console.log('On the download host: ' + up.keys.join(', '));
    if (up.latest === 'put') {
        // 5b. the website is woken to record it. The release is up whatever GitHub answers here: a dispatch that is not taken is said, the
        //     GitHub Release still follows, and the run ends with exit 1 so it is not missed (the site still records it at its daily look).
        let told = null;
        try { told = await sitepub.dispatch(DISPATCH.token, DISPATCH.repo, DISPATCH.origin); } catch (e) { told = String(e && e.message || e); }
        if (told === 204) console.log('The website was told (' + DISPATCH.repo + '): it records the release within minutes.');
        else { console.error('The release is on the download host, but the website was not told (' + (typeof told === 'number' ? 'GitHub answered ' + told : told) + '): it records the release at its daily look.'); process.exitCode = 1; }
    } else {
        // nothing new for the site's watcher: latest.json was this very list before the run, or names a newer version and is left alone
        console.log(up.latest === 'already' ? 'The site already names ' + VERSION + ' as the newest (' + sitepub.LATEST_KEY + ', this very list): the website is not woken again.'
            : 'The site names ' + up.newest + ', a newer version, as the newest: ' + sitepub.LATEST_KEY + ' is left as it is, and the list of ' + VERSION + ' stands in its own folder.');
        if (!GITHUB && !up.keys.length) throw new Error('Not uploaded to the site: version ' + VERSION + ' is already on the site' + (up.local ? ' as this very build' : '') + ', and nothing was built or put. To finish its GitHub Release, run with --publish --github; otherwise build the next version.');
    }
    console.log('Before the installer goes out: node tools/sitepub.js --check must say the site names ' + VERSION + '.');
    if (!GITHUB) return;
    // 5c. the GitHub Release, as before, for installs of 1.6.3 and older: only from the very build that is on the site
    if (!up.local) throw new Error('Not published to GitHub: dist/' + VERSION + '/ does not hold the build that is on the site.');
    const missing = ASSETS.filter(f => !fs.existsSync(path.join(dist, f)));
    if (missing.length) throw new Error('Not published: ' + missing.join(', ') + ' missing from ' + dist + ' (build first, without --notes-only)');   // never a release without its signature: no install would take it
    let body = notes;
    if (body === null) { try { body = fs.readFileSync(path.join(dist, 'RELEASE_NOTES.md'), 'utf8'); } catch (e) { throw new Error('Not published to GitHub: RELEASE_NOTES.md is missing from ' + dist + '.'); } }
    // A release of this tag already there (the review of 2026-11-17): a published one with every asset is done; one short of an asset
    // is the owner's to mend by hand; a draft an earlier run left (an upload that failed part way) is taken away and made again.
    const rels = await api('GET', GH_API + '/repos/' + REPO + '/releases?per_page=100');
    const old = Array.isArray(rels) ? rels.find(r => r && r.tag_name === VERSION) : null;
    if (old && !old.draft) {
        const have = (Array.isArray(old.assets) ? old.assets : []).map(a => a && a.name), lack = ASSETS.filter(f => have.indexOf(f) < 0);
        if (!lack.length) { console.log('The GitHub Release of ' + VERSION + ' is there already, with its six assets: ' + old.html_url); return; }
        throw new Error('Not published to GitHub: the release of ' + VERSION + ' is published there already but lacks ' + lack.join(', ') + ': upload them to it by hand from ' + dist + '.');
    }
    if (old) {
        if (!Number.isInteger(old.id)) throw new Error('Not published to GitHub: a draft of ' + VERSION + ' is there, and GitHub named no id for it.');
        console.log('Taking away the draft of ' + VERSION + ' an earlier run left');
        await api('DELETE', GH_API + '/repos/' + REPO + '/releases/' + old.id);
    }
    // Made as a draft, which no install sees, its six assets uploaded, and only then published (the review of 2026-11-17): an upload that
    // fails leaves a draft alone, which the next run takes away.
    console.log('\nCreating release', VERSION, 'on', REPO, '(a draft until its assets are up)');
    const rel = await api('POST', GH_API + '/repos/' + REPO + '/releases', { tag_name: VERSION, name: 'Waypoint VTT Alpha ' + VERSION, body, draft: true, prerelease: false });
    if (!Number.isInteger(rel.id)) throw new Error('Not published to GitHub: GitHub named no id for the draft it made.');
    const uploadBase = String(rel.upload_url).replace(/\{.*$/, '');
    if (uploadBase.indexOf(GH_UPLOADS + '/') !== 0) throw new Error('Not published to GitHub: the release names its uploads at ' + uploadBase.slice(0, 120) + ', which is not ' + GH_UPLOADS + '.');
    for (const f of ASSETS) {
        const p = path.join(dist, f);
        console.log('Uploading', f, '(' + Math.round(fs.statSync(p).size / 1024) + ' KB)');
        await api('POST', uploadBase + '?name=' + encodeURIComponent(f), fs.readFileSync(p), 'application/octet-stream');
    }
    const done = await api('PATCH', GH_API + '/repos/' + REPO + '/releases/' + rel.id, { draft: false });
    console.log('Published:', (done && done.html_url) || rel.html_url);
}
/* ---- The GitHub-only release, through the GitHub command line tool (--github alone; 1.6.4, Fulllion 2026-11-25) ----
   While installs read GitHub (updater.js UPDATE_SOURCE 'github'), a release is a GitHub Release tagged exactly VERSION, titled
   "Waypoint VTT Alpha <version>", its body dist/<version>/RELEASE_NOTES.md, not a prerelease, carrying the six assets. It is
   made as 1.6.3's was (the review of 2026-11-17's order): a DRAFT first, which no install sees, then the six assets
   uploaded, then the names on the draft read back, and only then published, so no install ever sees a release short of its
   files. This code never reads, prints, stores or passes a token: it only runs gh, which uses the sign-in gh keeps itself
   (gh auth login), and gh is handed CHILD_ENV, without GITHUB_TOKEN and the other secrets. It never touches the website's
   download host and sends no dispatch.
   gh is run through the shell (execSync), as Inno Setup and the archiver are, so a stand-in on PATH can answer for it in a
   test (gh.cmd on Windows). Every argument is quoted, and one that holds a character the shell would read ("%!$`^ or a
   line break) is refused rather than passed on. */
function ghArg(a) {
    const s = String(a);
    if (/["%!$`^\r\n]/.test(s)) throw new Error('Not published to GitHub: an argument for gh holds a character the shell would read (' + s.slice(0, 80) + ').');
    return '"' + s + '"';
}
// Run gh with these arguments. Answers { ok, out }: ok false where gh could not be run or answered with an error. Nothing gh says
// is printed here (gh auth status names the account and a masked token); a caller says what it means in its own words.
function gh(args) {
    const cmd = 'gh ' + args.map(ghArg).join(' ');   // a refusal of an argument is thrown here, never read as gh failing
    try { return { ok: true, out: execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], env: CHILD_ENV, encoding: 'utf8', timeout: 120000 }) }; }
    catch (e) { return { ok: false, out: String((e && e.stdout) || '') }; }
}
function ghJson(args, what) {
    const r = gh(args);
    if (!r.ok) return { why: 'GitHub could not be asked ' + what + ' (gh ' + args.slice(0, 2).join(' ') + ' failed)' };
    try { return { json: JSON.parse(r.out) }; } catch (e) { return { why: 'GitHub\'s answer ' + what + ' could not be read' }; }
}
// Does GitHub hold this version already, as a tag (VERSION or vVERSION) or as a release of it (a draft included)? Answers null where
// it holds neither, else one plain line. matching-refs answers every tag that begins with the name, so the exact ref is looked for.
function ghTaken() {
    for (const t of [VERSION, 'v' + VERSION]) {
        const r = ghJson(['api', 'repos/' + REPO + '/git/matching-refs/tags/' + t], 'about its tags');
        if (r.why) return r.why;
        if (!Array.isArray(r.json)) return 'GitHub\'s answer about its tags could not be read';
        if (r.json.some(x => x && x.ref === 'refs/tags/' + t)) return 'the tag ' + t + ' is already on GitHub (' + REPO + '): a published version is never made again. Build the next version.';
    }
    const rels = ghJson(['api', 'repos/' + REPO + '/releases?per_page=100'], 'about its releases');
    if (rels.why) return rels.why;
    if (!Array.isArray(rels.json)) return 'GitHub\'s answer about its releases could not be read';
    const old = rels.json.find(x => x && (x.tag_name === VERSION || x.tag_name === 'v' + VERSION));
    if (old) return old.draft ? 'a draft release of ' + VERSION + ' is on GitHub already (an earlier run stopped part way). Delete it on GitHub, or with gh release delete ' + VERSION + ' --repo ' + REPO + ', and run again.'
        : 'a release of ' + VERSION + ' is on GitHub already (' + REPO + '). Build the next version.';
    return null;
}
// Before anything is built: gh is there, signed in, and GitHub holds nothing of this version. Each refusal is one plain line, exit 1.
function ghBefore() {
    const refuse = why => { console.error('Not built: ' + why); process.exit(1); };
    if (!gh(['--version']).ok) refuse('--github publishes through the GitHub command line tool (gh), which could not be run here. Install it (https://cli.github.com) and sign in with gh auth login.');
    if (!gh(['auth', 'status', '--hostname', 'github.com']).ok) refuse('gh is not signed in to github.com. Sign in with gh auth login, then run again.');
    const taken = ghTaken();
    if (taken) refuse(taken);
}
// After the build: the GitHub Release, draft first, then the six assets, then published. A step that fails says where it stopped.
function ghPublish(dist, assets) {
    const taken = ghTaken();   // asked again, first: the build took a while
    if (taken) throw new Error('Not published to GitHub: ' + taken);
    const missing = assets.filter(f => !fs.existsSync(path.join(dist, f)));
    if (missing.length) throw new Error('Not published to GitHub: ' + missing.join(', ') + ' missing from ' + dist + '.');   // never a release without its signatures: no install would take it
    const notesFile = path.join(dist, 'RELEASE_NOTES.md');
    if (!fs.existsSync(notesFile)) throw new Error('Not published to GitHub: RELEASE_NOTES.md is missing from ' + dist + '.');
    const title = 'Waypoint VTT Alpha ' + VERSION;
    console.log('\nCreating release ' + VERSION + ' on ' + REPO + ' (a draft until its assets are up)');
    if (!gh(['release', 'create', VERSION, '--repo', REPO, '--draft', '--title', title, '--notes-file', notesFile]).ok) throw new Error('Not published to GitHub: gh could not make the draft release of ' + VERSION + '. Nothing was published.');
    const leftDraft = ' The draft is left on GitHub, unseen by installs: delete it (gh release delete ' + VERSION + ' --repo ' + REPO + ') and run again.';
    console.log('Uploading the six assets: ' + assets.join(', '));
    if (!gh(['release', 'upload', VERSION, '--repo', REPO].concat(assets.map(f => path.join(dist, f)))).ok) throw new Error('Not published to GitHub: gh could not upload the assets.' + leftDraft);
    const seen = ghJson(['release', 'view', VERSION, '--repo', REPO, '--json', 'assets,isDraft'], 'about the draft');
    const names = (seen.json && Array.isArray(seen.json.assets) ? seen.json.assets : []).map(a => a && a.name);
    const lack = assets.filter(f => names.indexOf(f) < 0);
    if (seen.why || lack.length) throw new Error('Not published to GitHub: the draft does not hold ' + (lack.length ? lack.join(', ') : 'what was uploaded') + '.' + leftDraft);
    if (!gh(['release', 'edit', VERSION, '--repo', REPO, '--draft=false', '--prerelease=false']).ok) throw new Error('Not published to GitHub: gh could not publish the draft, which holds its six assets.' + ' Publish it on GitHub by hand, or run gh release edit ' + VERSION + ' --repo ' + REPO + ' --draft=false.');
    console.log('Published on GitHub: https://github.com/' + REPO + '/releases/tag/' + VERSION);
    console.log('Now check it as an install reads it: node tools/ghlive.js');
}

main().catch(e => { console.error(String(e && e.message || e)); process.exit(1); });
