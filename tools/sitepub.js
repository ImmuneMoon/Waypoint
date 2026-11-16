/* The release's half on Waypoint's own website (1.6.4; the owner, 2026-11-16, via the manager: "Private, updates from
   waypointvtt.com", and "both builds ... in the safe order, with downloads on Cloudflare R2"). From 1.6.4 an install asks
   https://waypointvtt.com/api/updates/latest for the signed list and fetches the files from https://downloads.waypointvtt.com
   (system/resources/app/updater.js). This module makes that list and puts it, with the files, where the site reads them:

     siteManifest, envelopeOf   the manifest a release names (version, minShell, electron, published, notes, notesUrl and the
                                zip and the installer, each with its address, size, digest and own signature) and the envelope
                                { manifest: <its text>, sig } signed over "waypoint-manifest\n" and that text
     envelopeCheck              reads an envelope back exactly as an install will (updater.js readEnvelope, cleanManifest and
                                each file's signature) and holds it to what was meant. tools/release.js refuses to build, and
                                to upload, a list this says no to, so the writer can never drift from what installs take
     s3Auth, r2Config, r2Put,   the upload to Cloudflare R2 through its S3 API, signed with AWS Signature Version 4 (plain
     r2Head, sitePublish        Node, no dependencies), with the owner's write-only token from the environment
     dispatch                   tells the website's repository that a release is there (repository_dispatch waypoint-release)
     checkSite                  asks the live site as an install would, and says whether it names this release

   Where things lie in the bucket: each file at waypoint/<version>/<its name> (the bucket is served at the download host's
   root, so that is https://downloads.waypointvtt.com/waypoint/<version>/<name>, the address the manifest names), and the
   envelope beside them at waypoint/<version>/envelope.json, for the site's watcher to read and record. Files first, the
   envelope last, so a list is never there before what it names; a version whose envelope is already there is never
   uploaded again (a version on the download host is immutable).

   Usage (the checklist step before an installer goes out): node tools/sitepub.js --check [version]
   asks the site's /api/updates/latest through the shell's own checking code and says whether it names that version (by
   default the one in package.json), signed by the key the shell carries, with its zip and installer. It writes nothing. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const updater = require('../system/resources/app/updater.js');

const ENVELOPE_NAME = 'envelope.json';   // the envelope's name in dist/<version>/ and in the bucket
const WEBSITE_REPO = 'ImmuneMoon/Waypoint-Website';   // the website's repository, which the dispatch wakes (moves with it to the LLC's organisation)
const TYPES = { '.zip': 'application/zip', '.exe': 'application/vnd.microsoft.portable-executable', '.json': 'application/json' };
const IMMUTABLE = 'public, max-age=31536000, immutable';   // a release's files never change once uploaded

/* The site main.js names (its one constant UPDATE_SITE), read from main.js as the dev server reads it, else the updater's own
   default. root: the repository to read it from. */
function siteOf(root) {
    let src = ''; try { src = fs.readFileSync(path.join(root || ROOT, 'system', 'resources', 'app', 'main.js'), 'utf8'); } catch (e) { src = ''; }
    const m = /const UPDATE_SITE = '([^']+)'/.exec(src);
    return m ? m[1] : updater.UPDATE_SITE;
}

/* A release's notes as plain text: the top section of WHATSNEW.txt (the text up to the next "WAYPOINT <n>" heading) with its
   title and its ==== underline left off, line ends as LF, white space trimmed, cut at the most an install shows. */
function notesText(whatsnew) {
    const all = String(whatsnew || '').replace(/\r\n/g, '\n');
    const lines = (all.split(/\n(?=WAYPOINT \d)/)[0] || '').split('\n');
    const body = lines.slice(/^=+\s*$/.test(lines[1] || '') ? 2 : 1).join('\n').trim();
    return Array.from(body).slice(0, updater.NOTES_MAX).join('');
}

/* The address a file of a release has on the download host: downloads.<the site's host>/waypoint/<version>/<name>. */
function fileUrl(site, version, name) { return updater.updateHosts({ site: site }).files + '/waypoint/' + version + '/' + encodeURIComponent(name); }

/* One file's entry of the manifest: its exact name, its address, its length (a whole number), its digest (lower-case hex) and
   its own signature (trimmed base64), as cleanFile reads them. bytes: the file's bytes; sig: its signature as signkey.signZip made it. */
function fileEntry(site, version, name, bytes, sig) {
    return { name: name, url: fileUrl(site, version, name), size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sig: String(sig).trim() };
}

/* The manifest of a release, as a plain object with its keys in a fixed order. o: { version, minShell, electron, published,
   notes, notesUrl, files: [fileEntry, ...] }. minShell, electron and notesUrl are left out where they are not given (electron
   too where it is no plain version), so what is written is always what cleanManifest reads back unchanged. */
function siteManifest(o) {
    const m = { version: o.version };
    if (o.minShell) m.minShell = o.minShell;
    if (typeof o.electron === 'string' && /^[0-9A-Za-z][0-9A-Za-z.-]{0,39}$/.test(o.electron)) m.electron = o.electron;
    m.published = o.published;
    m.notes = typeof o.notes === 'string' ? o.notes : '';
    if (o.notesUrl) m.notesUrl = o.notesUrl;
    m.files = o.files.map(f => ({ name: f.name, url: f.url, size: f.size, sha256: f.sha256, sig: f.sig }));
    return m;
}

/* The envelope: { manifest: <the manifest's exact text>, sig }, the signature Ed25519 over "waypoint-manifest\n" and that text as
   UTF-8 (updater.js verifyManifest), base64. key: the private key (a KeyObject, as signkey.releaseKey gives it). Answers the
   envelope's text, which is uploaded byte for byte as it is written: the site passes the manifest on exactly as signed. */
function envelopeOf(manifest, key) {
    const text = JSON.stringify(manifest);
    const sig = crypto.sign(null, Buffer.from(updater.MANIFEST_PREFIX + text, 'utf8'), key).toString('base64');
    return JSON.stringify({ manifest: text, sig: sig }) + '\n';
}

/* Is this envelope one an install takes, and is it the release that was meant? Read exactly as checkForUpdate reads it, with
   the shell's own key and the site's own hosts (no override): the list's signature, every field through cleanManifest, and each
   file's own signature over its listed digest. Then held to want: { version, minShell, electron, notes, notesUrl, files: { <name>:
   { size, sha256 } } }: every field shown must come back as it was written (cleanManifest drops a field shown that does not
   clean, so a drift there would otherwise pass in silence), and the zip and the installer must both be listed, signed and the
   very files on disk. Answers null when it would be taken, else one plain line. */
function envelopeCheck(text, pubKey, site, want) {
    let raw = null, man = null;
    try { raw = updater.readEnvelope(Buffer.from(String(text), 'utf8'), pubKey); man = updater.cleanManifest(raw, updater.updateHosts({ site: site })); }
    catch (e) { return 'an install would refuse the list: ' + (e && e.message || String(e)); }
    // a field only shown that does not clean is dropped by an install, never refused: so each is held to the very text written too
    const as = k => (raw[k] === undefined ? null : raw[k]);
    if (man.version !== want.version) return 'the list names version ' + man.version + ', not ' + want.version;
    if (man.minShell !== (want.minShell || null)) return 'the list\'s minShell reads back as ' + man.minShell + ', not ' + want.minShell;
    if (man.electron !== (want.electron || null) || as('electron') !== man.electron) return 'the list\'s electron reads back as ' + man.electron + ', not ' + want.electron;
    if (man.notes !== (want.notes || '') || (as('notes') !== null && as('notes') !== man.notes)) return 'the list\'s notes do not read back as they were written';
    if (man.notesUrl !== (want.notesUrl || null) || as('notesUrl') !== man.notesUrl) return 'the list\'s notes page reads back as ' + man.notesUrl + ', not ' + want.notesUrl;
    const zipName = 'waypoint-app-' + want.version + '.zip';
    for (const [f, name] of [[man.zip, zipName], [man.installer, updater.INSTALLER_NAME]]) {
        const w = want.files && want.files[name];
        if (!f) return 'the list does not name ' + name;
        if (!w || f.size !== w.size || f.sha256 !== w.sha256) return 'the list does not name ' + name + ' as it is on disk';
        if (!updater.verifyUpdate(pubKey, name, f.sha256, man.version, f.sig)) return name + '\'s signature in the list does not check against the shell\'s key';
        if (f.url !== fileUrl(site, want.version, name)) return name + '\'s address in the list is not ' + fileUrl(site, want.version, name);
    }
    return null;
}

/* ---- Cloudflare R2, through its S3 API ---- */

/* A path segment as S3 encodes it: every byte but A-Z a-z 0-9 - _ . ~ as %XX in capitals. */
function s3Encode(s) { return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
const hmac = (key, text) => crypto.createHmac('sha256', key).update(text, 'utf8').digest();
const hexHash = b => crypto.createHash('sha256').update(b).digest('hex');

/* AWS Signature Version 4 for one S3 request, as R2 takes it (region 'auto', service s3). o: { method, host, path (the URI as
   sent: already encoded, segment by segment), query (the canonical query, '' for none), headers (lower-case names to values:
   every one of them is signed; host, x-amz-date and x-amz-content-sha256 among them), payloadHash, keyId, secret, region,
   amzDate ('YYYYMMDDTHHMMSSZ') }. Answers the Authorization header's value. Checked in updatercheck against AWS's own published
   example request, so the algorithm is the documented one and not a reading of it. */
function s3Auth(o) {
    const names = Object.keys(o.headers).map(n => n.toLowerCase()).sort();
    const canonHeaders = names.map(n => n + ':' + String(o.headers[n]).trim().replace(/\s+/g, ' ') + '\n').join('');
    const signed = names.join(';');
    const canonical = [o.method, o.path, o.query || '', canonHeaders, signed, o.payloadHash].join('\n');
    const day = o.amzDate.slice(0, 8), scope = day + '/' + o.region + '/s3/aws4_request';
    const toSign = ['AWS4-HMAC-SHA256', o.amzDate, scope, hexHash(canonical)].join('\n');
    const kSign = hmac(hmac(hmac(hmac('AWS4' + o.secret, day), o.region), 's3'), 'aws4_request');
    const sig = crypto.createHmac('sha256', kSign).update(toSign, 'utf8').digest('hex');
    return 'AWS4-HMAC-SHA256 Credential=' + o.keyId + '/' + scope + ', SignedHeaders=' + signed + ', Signature=' + sig;
}

/* The bucket from the environment: WAYPOINT_R2_ENDPOINT (https://<account>.r2.cloudflarestorage.com; plain http only on this
   machine, for a dry run against a mock), WAYPOINT_R2_BUCKET, WAYPOINT_R2_KEY_ID and WAYPOINT_R2_SECRET (the owner's
   write-only token). Answers { endpoint, bucket, keyId, secret } or { why }, one plain line. Nothing is printed of the secret. */
function r2Config(env) {
    env = env || process.env;
    const miss = ['WAYPOINT_R2_ENDPOINT', 'WAYPOINT_R2_BUCKET', 'WAYPOINT_R2_KEY_ID', 'WAYPOINT_R2_SECRET'].filter(k => typeof env[k] !== 'string' || !env[k].trim());
    if (miss.length) return { why: 'Not uploaded to the site: ' + miss.join(', ') + (miss.length > 1 ? ' are' : ' is') + ' not set (the R2 bucket and the owner\'s write-only token).' };
    let u = null; try { u = new URL(env.WAYPOINT_R2_ENDPOINT.trim()); } catch (e) { u = null; }
    const loop = u && (u.hostname === '127.0.0.1' || u.hostname === 'localhost');
    if (!u || !(u.protocol === 'https:' || (u.protocol === 'http:' && loop)) || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== ''))
        return { why: 'Not uploaded to the site: WAYPOINT_R2_ENDPOINT is not an https address of an account (https://<account>.r2.cloudflarestorage.com).' };
    const bucket = env.WAYPOINT_R2_BUCKET.trim();
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) return { why: 'Not uploaded to the site: WAYPOINT_R2_BUCKET is not a bucket name.' };
    return { endpoint: u.origin, bucket: bucket, keyId: env.WAYPOINT_R2_KEY_ID.trim(), secret: env.WAYPOINT_R2_SECRET.trim() };
}

/* One signed request to the bucket. method: 'PUT' or 'HEAD'; key: the object's key (its segments encoded here); body: a Buffer or
   null; headers: more headers, signed with the rest (content-type, cache-control, if-none-match). now: the time to sign with (a
   Date; the test's own, else now). Resolves { status, body } whatever the status: the caller judges it. */
function r2Request(cfg, method, key, body, headers, now) {
    const u = new URL(cfg.endpoint);
    const p = '/' + s3Encode(cfg.bucket) + '/' + key.split('/').map(s3Encode).join('/');
    const amzDate = (now || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const data = body || Buffer.alloc(0);
    const h = Object.assign({}, headers || {}, { host: u.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': hexHash(data) });
    const auth = s3Auth({ method, host: u.host, path: p, query: '', headers: h, payloadHash: h['x-amz-content-sha256'], keyId: cfg.keyId, secret: cfg.secret, region: 'auto', amzDate });
    const send = Object.assign({}, h, { Authorization: auth });
    if (method === 'PUT') send['content-length'] = data.length;
    delete send.host;
    return new Promise((resolve, reject) => {
        const req = (u.protocol === 'http:' ? http : https).request({ protocol: u.protocol, hostname: u.hostname, port: u.port || undefined, method, path: p, headers: send }, res => {
            const chunks = []; res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8').slice(0, 300) }));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(300000, () => req.destroy(new Error('the bucket did not answer for ' + key)));
        if (method === 'PUT') req.end(data); else req.end();
    });
}
function r2Head(cfg, key, now) { return r2Request(cfg, 'HEAD', key, null, null, now); }
function r2Put(cfg, key, body, headers, now) { return r2Request(cfg, 'PUT', key, body, headers, now); }

/* Upload a built release to the bucket: o: { cfg (r2Config's), dist (dist/<version>/), version, pubKey, site, want (as
   envelopeCheck takes it), now, log }. The envelope on disk is read back first and checked as an install will check it, and
   each file named in it must be the very file on disk; then: the envelope's key asked for (one already there means this version
   is already on the site, and nothing is uploaded), each file put, and the envelope put last with If-None-Match: * (so two runs
   can never both write it). Resolves { keys } (what was put, in order); rejects with one plain line. */
async function sitePublish(o) {
    const say = typeof o.log === 'function' ? o.log : () => {};
    const envText = fs.readFileSync(path.join(o.dist, ENVELOPE_NAME), 'utf8');
    const why = envelopeCheck(envText, o.pubKey, o.site, o.want);
    if (why) throw new Error('Not uploaded to the site: ' + why + '.');
    const zipName = 'waypoint-app-' + o.version + '.zip', names = [zipName, updater.INSTALLER_NAME];
    for (const n of names) {   // the bytes about to be put are the ones the list names
        const b = fs.readFileSync(path.join(o.dist, n)), w = o.want.files[n];
        if (b.length !== w.size || hexHash(b) !== w.sha256) throw new Error('Not uploaded to the site: ' + n + ' changed since the list was written.');
    }
    const base = 'waypoint/' + o.version + '/', envKey = base + ENVELOPE_NAME;
    const there = await r2Head(o.cfg, envKey, o.now);
    if (there.status === 200) throw new Error('Not uploaded to the site: version ' + o.version + ' is already there (' + envKey + '). A release on the download host is never replaced: build the next version.');
    if (there.status !== 404) throw new Error('Not uploaded to the site: the bucket answered ' + there.status + ' when asked for ' + envKey + '.');
    const keys = [];
    for (const n of names) {
        const b = fs.readFileSync(path.join(o.dist, n));
        say('Uploading ' + base + n + ' (' + Math.round(b.length / 1024) + ' KB)');
        const r = await r2Put(o.cfg, base + n, b, { 'content-type': TYPES[path.extname(n)] || 'application/octet-stream', 'cache-control': IMMUTABLE }, o.now);
        if (r.status !== 200) throw new Error('Not uploaded to the site: the bucket answered ' + r.status + ' for ' + base + n + ' (' + r.body.replace(/\s+/g, ' ') + ').');
        keys.push(base + n);
    }
    say('Uploading ' + envKey);
    const r = await r2Put(o.cfg, envKey, Buffer.from(envText, 'utf8'), { 'content-type': TYPES['.json'], 'cache-control': IMMUTABLE, 'if-none-match': '*' }, o.now);
    if (r.status === 412) throw new Error('Not uploaded to the site: version ' + o.version + '\'s list was put there meanwhile (' + envKey + ').');
    if (r.status !== 200) throw new Error('Not uploaded to the site: the bucket answered ' + r.status + ' for ' + envKey + ' (' + r.body.replace(/\s+/g, ' ') + ').');
    keys.push(envKey);
    return { keys };
}

/* Wake the website's release watcher: repository_dispatch of type waypoint-release, no payload, to the website's repository,
   with the owner's token (WEBSITE_DISPATCH_TOKEN, a fine-grained token for that repository alone). Resolves the status. Where no
   token is set nothing is sent, and the site records the release at its daily look or when the GitHub release fires
   .github/workflows/notify-website.yml. */
function dispatch(token, repo) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(JSON.stringify({ event_type: 'waypoint-release' }));
        const req = https.request({ hostname: 'api.github.com', method: 'POST', path: '/repos/' + (repo || WEBSITE_REPO) + '/dispatches',
            headers: { 'User-Agent': 'Waypoint-release', 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'Content-Length': data.length } }, res => {
            res.resume(); res.on('end', () => resolve(res.statusCode));
        });
        req.on('error', reject); req.setTimeout(30000, () => req.destroy(new Error('GitHub did not answer the dispatch')));
        req.end(data);
    });
}

/* The checklist step before an installer goes out: ask the site as an install of this very version would (the shell's own
   checkForUpdate, the shell's own key, the site's own hosts) and, as an install of an older version would, whether it is offered
   with its zip and its installer. o: { version, site, apiUrl, pubKey (the suite's; else the shell's) }. Resolves { ok, lines }:
   ok only where the site names this version as its newest, signed, with nothing newer, and an older install is offered both
   files. Nothing is downloaded but the list. */
async function checkSite(o) {
    const lines = [], base = { site: o.site, apiUrl: o.apiUrl, pubKey: o.pubKey };
    let same = null, older = null;
    try { same = await updater.checkForUpdate(Object.assign({ currentVersion: o.version, shellVersion: o.version }, base)); }
    catch (e) { return { ok: false, lines: ['The site\'s list could not be taken: ' + (e && e.message || e) + '.'] }; }
    if (same.latest !== o.version) lines.push('The site names version ' + same.latest + ' as the newest, not ' + o.version + '.');
    if (same.newer) lines.push('The site offers ' + same.latest + ' to an install of ' + o.version + ': something newer is there.');
    try { older = await updater.checkForUpdate(Object.assign({ currentVersion: '0.0.0', shellVersion: o.version }, base)); }
    catch (e) { lines.push('The list could not be taken as an older install takes it: ' + (e && e.message || e) + '.'); }
    if (older && !(older.newer && older.canHotUpdate)) lines.push('An older install is not offered the one-click update of ' + o.version + ' (the zip is not listed, or its signature does not check).');
    if (older && !older.installer) lines.push('The list does not name the installer of ' + o.version + ', or its signature does not check.');
    const ok = lines.length === 0;
    if (ok) lines.push('The site names ' + o.version + ', signed by the key the shell carries, with its zip and installer: an install of ' + o.version + ' reports up to date, and an older one is offered it.');
    return { ok, lines };
}

module.exports = { ENVELOPE_NAME, WEBSITE_REPO, siteOf, notesText, fileUrl, fileEntry, siteManifest, envelopeOf, envelopeCheck,
    s3Encode, s3Auth, r2Config, r2Request, r2Head, r2Put, sitePublish, dispatch, checkSite };

if (require.main === module) {
    const argv = process.argv.slice(2);
    if (argv[0] !== '--check') { console.error('Usage: node tools/sitepub.js --check [version]   (a release is uploaded by node tools/release.js --publish-site)'); process.exit(1); }
    const version = argv[1] || JSON.parse(fs.readFileSync(path.join(ROOT, 'system', 'resources', 'app', 'package.json'), 'utf8')).version;
    checkSite({ version, site: siteOf(ROOT) }).then(r => { for (const l of r.lines) (r.ok ? console.log : console.error)(l); process.exit(r.ok ? 0 : 1); },
        e => { console.error(String(e && e.message || e)); process.exit(1); });
}
