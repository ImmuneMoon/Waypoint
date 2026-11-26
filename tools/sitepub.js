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
     notesText, topVersion,     the release's notes (the section of WHATSNEW.txt for its version, as plain text) and the page
     notesUrlOf                 that shows them on the site
     s3Auth, r2Config, r2Put,   the upload to Cloudflare R2 through its S3 API, signed with AWS Signature Version 4 (plain
     r2Head, r2Get, sitePublish Node, no dependencies), with the owner's token from the environment (it must read as well as
                                write: every run looks at what the bucket holds before it writes anything)
     siteState, latestOf,       what the bucket holds of a version, read and never written: tools/release.js asks it before it
     probe                      builds, and node tools/sitepub.js --probe asks it of the real bucket and says what it found
     dispatch, repoOk           tells the website's repository that a release is there (repository_dispatch waypoint-release)
     testHosts                  the stand-in hosts a test may name, read only where WAYPOINT_RELEASE_TEST=1 is set
     checkSite                  asks the live site as an install would, and says whether it names this release

   Where things lie in the bucket (agreed with the website coordinator, 2026-11-16): each file of a release, and the zip's
   .sha256 and both .sig files beside it, at waypoint/<version>/<its name> (the bucket is served at the download host's root,
   so that is https://downloads.waypointvtt.com/waypoint/<version>/<name>, the address the manifest names); the envelope
   beside them at waypoint/<version>/manifest.json (ENVELOPE_KEY; dist/<version>/ keeps it as envelope.json, since the
   manifest.json there is the older GitHub one); and a copy of the newest envelope at waypoint/latest.json (LATEST_KEY), with
   Cache-Control: no-cache, which the site's watcher reads. Files first, then the version's envelope, then latest.json, so a
   list is never there before what it names. Nothing under waypoint/<version>/ is ever written over (a version on the download
   host is immutable): every key of the version is asked for first (HEAD), and one that is already there is never put again: it
   must be the very file of this build, or the whole upload is refused before anything is put. Every
   put of a version's key also says If-None-Match: *, so a key put meanwhile by another run is refused by the bucket itself.
   latest.json alone is written over at each release, and only by a newer version: a latest.json that names a newer version, or
   that is no list the shell's key signs, refuses the upload too, and latest.json is put only on the condition that it is still
   what was read (If-Match its ETag), so two release runs that overlap never put an older version back over a newer one.
   A run that stopped part way is finished, never rebuilt (the review of 2026-11-17): what is in the bucket is checked to be the
   very build in dist/<version>/, and only what is missing is put (sitePublish says how in every refusal).

   Usage (the checklist step before an installer goes out): node tools/sitepub.js --check [version]
   asks the site's /api/updates/latest through the shell's own checking code and says whether it names that version (by
   default the one in package.json), signed by the key the shell carries, with its zip and installer. It writes nothing.
   node tools/sitepub.js --probe [version], with the bucket's settings (WAYPOINT_R2_*), is the smoke run before the first real
   release (the review of 2026-11-17): it asks the real bucket what it holds of that version and of latest.json, exactly as a
   release does before it builds, and says what it found, so a token that may not read, or a bucket that answers 403 for a key
   that is not there, is found without a build. It writes nothing; whether the bucket keeps If-None-Match: * is learned by the
   first real --publish, which refuses in plain words where it does not. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const updater = require('../system/resources/app/updater.js');

const ENVELOPE_NAME = 'envelope.json';   // the envelope's name in dist/<version>/
const ENVELOPE_KEY = 'manifest.json';    // its name in the bucket, under waypoint/<version>/
const LATEST_KEY = 'waypoint/latest.json';   // the newest version's envelope, copied: what the site's watcher reads
const LIST_CAP = 1024 * 1024;   // the most of latest.json that is read back (updater.js's ENVELOPE_CAP)
const WEBSITE_REPO = 'ImmuneMoon/Waypoint-Website';   // the website's repository, which the dispatch wakes (the one notify-website.yml names; moves with it to the LLC's organisation)
const TYPES = { '.zip': 'application/zip', '.exe': 'application/vnd.microsoft.portable-executable', '.json': 'application/json', '.sha256': 'text/plain; charset=utf-8', '.sig': 'text/plain; charset=utf-8' };
const IMMUTABLE = 'public, max-age=31536000, immutable';   // a release's files never change once uploaded
const NO_CACHE = 'no-cache';   // latest.json changes with every release

/* The site main.js names (its one constant UPDATE_SITE), read from main.js as the dev server reads it, else the updater's own
   default. root: the repository to read it from. */
function siteOf(root) {
    let src = ''; try { src = fs.readFileSync(path.join(root || ROOT, 'system', 'resources', 'app', 'main.js'), 'utf8'); } catch (e) { src = ''; }
    const m = /const UPDATE_SITE = '([^']+)'/.exec(src);
    return m ? m[1] : updater.UPDATE_SITE;
}

/* The version the newest section of WHATSNEW.txt is for: the word after "WAYPOINT " on its first line ("WAYPOINT 1.6.4 — What's
   New" gives 1.6.4), or null where the file does not begin with such a heading. tools/release.js refuses to build a release whose
   own version is not this one, so the notes the site shows (notesText, which reads that top section) are always this release's. */
function topVersion(whatsnew) {
    const first = String(whatsnew || '').replace(/^﻿/, '').split(/\r?\n/)[0] || '';
    const m = /^WAYPOINT (?:VTT )?(\d+(?:\.\d+)*)/.exec(first);   // 1.6.4: the version alone, digits and dots, since the heading may go on with a colon ("WAYPOINT 1.6.4: What's New", once the em dash was taken out) or a space   // 1.6.4: the heading names the product Waypoint VTT ("WAYPOINT VTT 1.6.4"); an older section reads "WAYPOINT 1.6.3"
    return m ? m[1] : null;
}

/* The top section of a WHATSNEW file as text to compare: its first heading and all up to the next "WAYPOINT <n>" heading, with a
   byte order mark, the line ends (CRLF or LF) and the white space at its ends left out. tools/release.js refuses to build where the
   notes the app itself shows (system/app/assets/whatsnew.txt) do not begin with the very section WHATSNEW.txt begins with (the
   review of 2026-11-17: the notes the site shows and the notes the app shows are one text). */
function topSection(whatsnew) { return (String(whatsnew || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split(/\n(?=WAYPOINT (?:VTT )?\d)/)[0] || '').trim(); }

/* A release's notes as plain text: the top section of WHATSNEW.txt (the text up to the next "WAYPOINT <n>" heading) with its
   title and its ==== underline left off, line ends as LF, white space trimmed, cut at the most an install shows. */
function notesText(whatsnew) {
    const all = String(whatsnew || '').replace(/\r\n/g, '\n');
    const lines = (all.split(/\n(?=WAYPOINT (?:VTT )?\d)/)[0] || '').split('\n');
    const body = lines.slice(/^=+\s*$/.test(lines[1] || '') ? 2 : 1).join('\n').trim();
    return Array.from(body).slice(0, updater.NOTES_MAX).join('');
}

/* The address a file of a release has on the download host: downloads.<the site's host>/waypoint/<version>/<name>. */
function fileUrl(site, version, name) { return updater.updateHosts({ site: site }).files + '/waypoint/' + version + '/' + encodeURIComponent(name); }

/* The page of a release's notes the manifest names (notesUrl): the site's What's new page at that version's place,
   https://waypointvtt.com/whats-new#<version>, as the website coordinator named it on 2026-11-16. A version holds only letters,
   digits, dots and hyphens (updater.js VERSION_OK), so it stands in the fragment as it is. updater.js sitePage keeps a fragment. */
function notesUrlOf(site, version) { return updater.updateHosts({ site: site }).site + '/whats-new#' + version; }

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

/* Is this address a host of this very machine, given as a bare origin? Answers the origin (http or https, 127.0.0.1, localhost or
   [::1], any port, no user name, password, path, query or fragment) or null. A test's stand-ins are held to it. */
function loopOrigin(s) {
    let u = null; try { u = new URL(String(s).trim()); } catch (e) { return null; }
    if (!(u.protocol === 'http:' || u.protocol === 'https:') || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return null;
    if (u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return null;
    return u.origin;
}

/* The stand-in hosts a test of tools/release.js may name, and nothing else: they are read ONLY where WAYPOINT_RELEASE_TEST is
   exactly '1' (the task of 2026-11-16: a test's stand-in is never reached by a real release). env: the environment.
   WAYPOINT_RELEASE_TEST_DISPATCH stands in for api.github.com in the website's dispatch, WAYPOINT_RELEASE_TEST_GITHUB for
   api.github.com and uploads.github.com in the GitHub Release; each must be an origin of this machine (loopOrigin). Answers
   { test: false } where the switch is off and no override is set; { test: true, dispatch?, github? } where it is on; or { why },
   one plain line, where an override is set without the switch (a release must never run believing it is a test, or the other way
   round), where one is no origin of this machine, or where a WAYPOINT_RELEASE_TEST_ name is none this tool knows. With the switch
   on, r2Config also takes a bucket's address of this machine (its own test stand-in). */
const TEST_HOSTS = { WAYPOINT_RELEASE_TEST_DISPATCH: 'dispatch', WAYPOINT_RELEASE_TEST_GITHUB: 'github' };
function testHosts(env) {
    env = env || process.env;
    const set = Object.keys(env).filter(k => /^WAYPOINT_RELEASE_TEST_/.test(k) && typeof env[k] === 'string' && env[k].trim() !== '').sort();
    if (env.WAYPOINT_RELEASE_TEST !== '1') {
        return set.length ? { why: 'Not built: ' + set.join(', ') + (set.length > 1 ? ' are' : ' is') + ' set, which only a test reads (with WAYPOINT_RELEASE_TEST=1). Unset it for a release.' } : { test: false };
    }
    const out = { test: true };
    for (const k of set) {
        if (!Object.prototype.hasOwnProperty.call(TEST_HOSTS, k)) return { why: 'Not built: ' + k + ' is no test setting this tool knows.' };
        const o = loopOrigin(env[k]);
        if (!o) return { why: 'Not built: ' + k + ' is not an address of this machine (http://127.0.0.1:<port>).' };
        out[TEST_HOSTS[k]] = o;
    }
    return out;
}

/* The bucket from the environment: WAYPOINT_R2_ENDPOINT (https://<account>.r2.cloudflarestorage.com), WAYPOINT_R2_BUCKET,
   WAYPOINT_R2_KEY_ID and WAYPOINT_R2_SECRET (the owner's write-only token). opts.test (testHosts' answer, true only) also takes
   an address of this machine, plain http included, for the suite's own stand-in: never otherwise. Answers { endpoint, bucket,
   keyId, secret } or { why }, one plain line. Nothing is printed of the secret. */
function r2Config(env, opts) {
    env = env || process.env;
    const miss = ['WAYPOINT_R2_ENDPOINT', 'WAYPOINT_R2_BUCKET', 'WAYPOINT_R2_KEY_ID', 'WAYPOINT_R2_SECRET'].filter(k => typeof env[k] !== 'string' || !env[k].trim());
    if (miss.length) return { why: 'Not uploaded to the site: ' + miss.join(', ') + (miss.length > 1 ? ' are' : ' is') + ' not set (the R2 bucket and the owner\'s write-only token).' };
    let u = null; try { u = new URL(env.WAYPOINT_R2_ENDPOINT.trim()); } catch (e) { u = null; }
    const loop = !!(opts && opts.test === true) && !!loopOrigin(env.WAYPOINT_R2_ENDPOINT);
    if (!u || !(u.protocol === 'https:' || loop) || u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== ''))
        return { why: 'Not uploaded to the site: WAYPOINT_R2_ENDPOINT is not an https address of an account (https://<account>.r2.cloudflarestorage.com).' };
    const bucket = env.WAYPOINT_R2_BUCKET.trim();
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) return { why: 'Not uploaded to the site: WAYPOINT_R2_BUCKET is not a bucket name.' };
    return { endpoint: u.origin, bucket: bucket, keyId: env.WAYPOINT_R2_KEY_ID.trim(), secret: env.WAYPOINT_R2_SECRET.trim() };
}

/* One signed request to the bucket. method: 'PUT', 'HEAD' or 'GET'; key: the object's key (its segments encoded here); body: a
   Buffer or null; headers: more headers, signed with the rest (content-type, cache-control, if-none-match, if-match). now: the
   time to sign with (a Date; the test's own, else now). cap: for a GET, the most bytes of the answer kept (a longer answer
   rejects). Resolves { status, body, buf, headers } whatever the status: body is the first 300 characters as text (for a
   refusal's words), buf the whole answer as bytes, headers the answer's own (lower-case names: content-length and etag are read
   from them); the caller judges the status. Rejects only where no answer could be had (the connection failed, the bucket went
   quiet for 300 s, or a GET's answer is longer than cap): callers turn that into a refusal of their own words (ask, below). */
function r2Request(cfg, method, key, body, headers, now, cap) {
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
            const chunks = []; let got = 0;
            res.on('data', c => { got += c.length; if (cap && got > cap) { req.destroy(new Error('the bucket\'s answer for ' + key + ' is longer than ' + cap + ' bytes')); return; } chunks.push(c); });
            res.on('end', () => { const buf = Buffer.concat(chunks); resolve({ status: res.statusCode, body: buf.toString('utf8').slice(0, 300), buf, headers: res.headers || {} }); });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(300000, () => req.destroy(new Error('the bucket did not answer for ' + key)));
        if (method === 'PUT') req.end(data); else req.end();
    });
}
function r2Head(cfg, key, now) { return r2Request(cfg, 'HEAD', key, null, null, now); }
function r2Get(cfg, key, cap, now) { return r2Request(cfg, 'GET', key, null, null, now, cap); }
function r2Put(cfg, key, body, headers, now) { return r2Request(cfg, 'PUT', key, body, headers, now); }

/* One line of a bucket's refusal: its status and the first words it said, white space folded, so a refusal stays one line. */
function bucketSaid(r) { return 'the bucket answered ' + r.status + (r.body ? ' (' + String(r.body).replace(/\s+/g, ' ').trim().slice(0, 200) + ')' : ''); }

/* Every refusal of the upload begins with these words, so a run that stops is never read as one that went through. */
const noUp = why => new Error('Not uploaded to the site: ' + why);
/* An error's own words on one line. */
const errText = e => String(e && e.message || e).replace(/\s+/g, ' ').trim();

/* One read of the bucket (a HEAD or a GET) that the bucket did not answer at all (the review of 2026-11-17: a reset, a DNS
   failure or the idle timeout used to stop the run with Node's own words alone). fn: the request, as a function; what: where
   the run stood ('when asked for <key>'). Resolves the answer; rejects with a refusal of the upload's own words. */
async function ask(fn, what) {
    try { return await fn(); }
    catch (e) { throw noUp('no answer could be had from the bucket ' + what + ' (' + errText(e) + ').'); }
}

/* A refusal of a read the bucket did answer, with the status it gave. A 403 says what it most likely means: R2 answers 403, not
   404, for a key that is not there where the token may write but not read (the review of 2026-11-17; the agreed API names a
   write-only token), and the run needs to read the version's keys and latest.json before it writes anything. */
function readRefused(r, k) {
    return bucketSaid(r) + ' when asked for ' + k + (r.status === 403 ? ' (where its token may not read the bucket, R2 answers 403 for a key that is not there: give the token read as well as write, and check WAYPOINT_R2_KEY_ID and WAYPOINT_R2_SECRET)' : '') + '.';
}

/* The five files of a release, by their exact names, in the order they are put. */
function siteNames(version) {
    const zipName = 'waypoint-app-' + version + '.zip', inst = updater.INSTALLER_NAME;
    return [zipName, zipName + '.sha256', zipName + '.sig', inst, inst + '.sig'];
}

/* What the bucket holds of a version, read and never written (the review of 2026-11-17: tools/release.js asks it before it builds,
   so it never rebuilds over a dist/<version>/ the bucket already holds, and sitePublish asks it again before it puts anything).
   o: { cfg (r2Config's), version, now }. Each key of the version is asked for (HEAD), the version's own list is read where it is
   there, and latest.json is read. Resolves { names (siteNames), base ('waypoint/<version>/'), envKey, keys (the five and the
   list), there: { <key>: { size, etag } } for each key that is there, env (the version's list as bytes, or null), latest:
   { status (200 or 404), etag, buf } }. Rejects with one plain line where the bucket refuses a read or cannot be reached. */
async function siteState(o) {
    const names = siteNames(o.version), base = 'waypoint/' + o.version + '/', envKey = base + ENVELOPE_KEY;
    const keys = names.map(n => base + n).concat([envKey]), there = {};
    for (const k of keys) {
        const h = await ask(() => r2Head(o.cfg, k, o.now), 'when asked for ' + k);
        if (h.status === 200) there[k] = { size: Number((h.headers || {})['content-length']), etag: (h.headers || {}).etag || null };
        else if (h.status !== 404) throw noUp(readRefused(h, k));
    }
    let env = null;
    if (there[envKey]) {
        const g = await ask(() => r2Get(o.cfg, envKey, LIST_CAP, o.now), 'when reading ' + envKey);
        if (g.status !== 200) throw noUp(readRefused(g, envKey));
        env = g.buf;
    }
    const lt = await ask(() => r2Get(o.cfg, LATEST_KEY, LIST_CAP, o.now), 'when reading ' + LATEST_KEY);
    if (lt.status !== 200 && lt.status !== 404) throw noUp(readRefused(lt, LATEST_KEY));
    return { names, base, envKey, keys, there, env, latest: { status: lt.status, etag: (lt.headers || {}).etag || null, buf: lt.status === 200 ? lt.buf : null } };
}

/* The version latest.json names, read as an install reads it: null where there is none (404); else its version, or a refusal in
   one plain line where it is no list the shell's key signs (a release never puts itself over a list it cannot read).
   st: siteState's answer. */
function latestOf(st, pubKey, site) {
    if (st.latest.status !== 200) return null;
    try { return updater.cleanManifest(updater.readEnvelope(st.latest.buf, pubKey), updater.updateHosts({ site: site })).version; }
    catch (e) { throw noUp(LATEST_KEY + ' is there but is not a list the shell\'s key signs (' + errText(e) + '): look at it before anything is put, and delete it by hand if it is not Waypoint\'s.'); }
}

/* What a list names, read from its own manifest as envelopeCheck takes it (version, minShell, electron, notes, notesUrl, and each
   file's size and digest by its name): a run that builds nothing holds the list and the files to this. null where the text is no
   envelope. The list's signature is not read here: envelopeCheck reads it with the shell's key. */
function wantOf(text) {
    let m = null; try { m = JSON.parse(JSON.parse(String(text)).manifest); } catch (e) { return null; }
    if (!m || typeof m !== 'object' || !Array.isArray(m.files)) return null;
    const files = {};
    for (const f of m.files) if (f && typeof f.name === 'string') files[f.name] = { size: f.size, sha256: f.sha256 };
    return { version: m.version, minShell: m.minShell, electron: m.electron, notes: m.notes, notesUrl: m.notesUrl, files };
}

/* Is the object the bucket holds at key the very file b? Its size first; then, where the bucket's ETag is a plain MD5 (as R2 gives
   for an object put in one go), that; otherwise the object is read back and compared byte for byte. info: siteState's there[key]. */
async function sameInBucket(o, key, b, info) {
    if (!info || info.size !== b.length) return false;
    const tag = String(info.etag || '').replace(/^W\//, '').replace(/"/g, '').toLowerCase();
    if (/^[0-9a-f]{32}$/.test(tag)) return tag === crypto.createHash('md5').update(b).digest('hex');
    const g = await ask(() => r2Get(o.cfg, key, b.length + 1, o.now), 'when reading ' + key + ' back');
    return g.status === 200 && g.buf.equals(b);
}

/* Upload a built release to the bucket, or finish one an earlier run began. o: { cfg (r2Config's), dist (dist/<version>/), version,
   pubKey, site, want (as envelopeCheck takes it; where absent, read from dist's own list by wantOf: a run that builds nothing),
   now, log, retry (the waits, in ms, before each further try of latest.json; by default 2 s and 6 s) }. Resolves { keys (what
   this run put, in order), latest ('put', 'already': latest.json was this very list before the run, or 'newer': it names a newer
   version and is left as it is), newest (the version latest.json named before the run, or null), local (true where dist/<version>/
   holds the list that is on the site: only then may its files go to GitHub too) }; rejects with one plain line.

   In order:
   1. Where dist/<version>/ holds envelope.json, it is read back and checked as an install will check it (envelopeCheck). The zip
      and the installer must be the very files it names; the zip's .sha256 must name the zip's digest; each .sig must be the
      signature the list carries.
   2. What the bucket holds of the version is read (siteState): each key (HEAD), the version's list where it is there, latest.json.
   3. Nothing under waypoint/<version>/ is ever written over (a version on the download host is immutable):
      - where the version's list is there, dist's list must be that very list, byte for byte (else the version is on the site from
        another build, and the run is refused), or dist holds none (a run on another machine, which finishes latest.json from the
        bucket's own list, checked with the shell's key, and puts nothing else); the five files must be there, of the sizes listed;
      - where it is not, every key that is there must be the very file in dist (an earlier run stopped part way: what is missing is
        put now), else the run is refused before anything is put.
   4. latest.json: where it is there it must be a list the shell's key signs. One naming a newer version refuses a version whose list
      is not up yet (a release never takes the newest place from a newer one), and is left as it is otherwise; one naming this
      version must be this very list.
   5. The files that are missing are put (If-None-Match: *, kept for a year), then the version's list as manifest.json (If-None-Match:
      *), then, LAST of all, the same list as waypoint/latest.json with Cache-Control: no-cache, on the condition that it is still
      what step 2 read (If-Match its ETag, or If-None-Match: * where there was none: the review of 2026-11-17, so a newer release
      put meanwhile is never put back by an older one), tried up to three times where the bucket fails or cannot be reached. A
      put that fails stops the run there, and says what is up and how to finish: run tools/release.js --publish again, which
      builds nothing and puts what is missing. */
async function sitePublish(o) {
    const say = typeof o.log === 'function' ? o.log : () => {};
    const names = siteNames(o.version), base = 'waypoint/' + o.version + '/', envKey = base + ENVELOPE_KEY;
    let envText = null;
    try { envText = fs.readFileSync(path.join(o.dist, ENVELOPE_NAME), 'utf8'); } catch (e) { envText = null; }
    let bytes = null;   // the five files in dist, by name: only where dist holds a list
    if (envText !== null) {
        const want = o.want || wantOf(envText);
        if (!want) throw noUp(ENVELOPE_NAME + ' in ' + o.dist + ' is not a list.');
        const why = envelopeCheck(envText, o.pubKey, o.site, want);
        if (why) throw noUp(why + '.');
        const listed = {};   // each file's signature as the list carries it, read from the text that was just checked
        for (const f of JSON.parse(JSON.parse(envText).manifest).files) listed[f.name] = f.sig;
        const zipName = names[0], inst = names[3];
        bytes = {};
        for (const n of names) {
            try { bytes[n] = fs.readFileSync(path.join(o.dist, n)); } catch (e) { throw noUp(n + ' is missing from ' + o.dist + '.'); }
        }
        for (const n of [zipName, inst]) {   // the bytes about to be put are the ones the list names
            const b = bytes[n], w = want.files[n];
            if (!w || b.length !== w.size || hexHash(b) !== w.sha256) throw noUp(n + ' changed since the list was written.');
            if (bytes[n + '.sig'].toString('utf8').trim() !== listed[n]) throw noUp(n + '.sig is not the signature the list carries for ' + n + '.');
        }
        const shaLine = bytes[zipName + '.sha256'].toString('utf8').trim().split(/\s+/);
        if (shaLine[0] !== want.files[zipName].sha256 || shaLine[1] !== zipName) throw noUp(zipName + '.sha256 does not name the zip\'s digest.');
    }

    const st = await siteState(o);
    const had = Object.keys(st.there);
    let list = envText !== null ? Buffer.from(envText, 'utf8') : null;   // the list this run stands by
    if (st.env) {
        if (list && !st.env.equals(list)) throw noUp('version ' + o.version + ' is already on the site (' + envKey + '), and ' + ENVELOPE_NAME + ' in ' + o.dist + ' is not the list put there: a release on the download host is never replaced. Build the next version.');
        if (!list) {   // no build here: the list on the bucket is checked as an install reads it, and stood by
            const w = wantOf(st.env.toString('utf8'));
            const why = w ? envelopeCheck(st.env.toString('utf8'), o.pubKey, o.site, w) : 'it is no list';
            if (why) throw noUp(envKey + ' is there but ' + why + ': look at it by hand.');
            list = st.env;
        }
        const w = wantOf(list.toString('utf8'));
        for (const n of names) {
            const k = base + n, t = st.there[k];
            if (!t) throw noUp(k + ' is missing from the bucket, though the list of ' + o.version + ' there names it: put it back by hand from the build that was published.');
            const size = bytes ? bytes[n].length : (w.files[n] ? w.files[n].size : null);
            if (size !== null && t.size !== size) throw noUp(k + ' in the bucket is ' + t.size + ' bytes, not the ' + size + ' of the build that was published: look at it by hand.');
        }
    } else if (!list) {
        throw noUp(had.length ? had[0] + (had.length > 1 ? ' and ' + (had.length - 1) + ' more are' : ' is') + ' already in the bucket, though no list of ' + o.version + ' is: an earlier run stopped part way, and no install has seen it. ' + ENVELOPE_NAME + ' is missing from ' + o.dist + ', so it cannot be finished from here: delete ' + base + ' in the bucket by hand and run again, or build the next version.'
            : ENVELOPE_NAME + ' is missing from ' + o.dist + ' (build first).');
    } else {
        for (const k of had) {
            const n = k.slice(base.length);
            if (!(await sameInBucket(o, k, bytes[n], st.there[k]))) throw noUp(k + ' is already in the bucket, though no list of ' + o.version + ' is, and it is not the file in ' + o.dist + ': an earlier run of another build stopped part way, and no install has seen it. Nothing is written over: delete ' + base + ' in the bucket by hand and run again, or build the next version.');
        }
        if (had.length) say('An earlier run stopped part way: ' + had.length + ' of the version\'s files are in the bucket already, the very files in ' + o.dist + '. The rest follow.');
    }

    const lv = latestOf(st, o.pubKey, o.site);
    let latest = 'put';
    if (lv !== null) {
        const c = updater.cmpVersion(lv, o.version);
        if (c > 0 && !st.env) throw noUp('the site already names ' + lv + ' as the newest (' + LATEST_KEY + '), and ' + o.version + ' is not newer: build the next version.');
        if (c > 0) latest = 'newer';
        else if (c === 0) {
            if (!st.latest.buf.equals(list)) throw noUp(LATEST_KEY + ' names ' + o.version + ' but is not the list of this build: look at it by hand.');
            latest = 'already';
        }
    }

    const put = [];
    // What a stop leaves behind, and how to finish: the version's files and list are immutable, so the only way on is to put what is missing
    const stuck = () => {
        const up = had.concat(put).filter(k => k.indexOf(base) === 0);
        return (up.length ? ' What of ' + o.version + ' is in the bucket (' + up.join(', ') + ') is named by no list, so no install sees it.' : '')
            + ' Run node tools/release.js --publish again with ' + o.dist + ' as it is: it builds nothing, checks what is there and puts the rest.';
    };
    const putOne = async (k, b, headers) => {
        say('Uploading ' + k + ' (' + Math.max(1, Math.round(b.length / 1024)) + ' KB)');
        let r = null;
        try { r = await r2Put(o.cfg, k, b, headers, o.now); } catch (e) { throw noUp('no answer could be had from the bucket for ' + k + ' (' + errText(e) + '), so it may or may not be there.' + stuck()); }
        if (r.status === 200) { put.push(k); return; }
        if (r.status === 412) throw noUp(k + ' was put there meanwhile by another run: look at what the bucket holds of ' + o.version + ' before anything else.');
        throw noUp(bucketSaid(r) + ' for ' + k + '.' + stuck());
    };
    for (const n of names) if (!st.there[base + n]) await putOne(base + n, bytes[n], { 'content-type': TYPES[path.extname(n)] || 'application/octet-stream', 'cache-control': IMMUTABLE, 'if-none-match': '*' });
    if (!st.env) await putOne(envKey, list, { 'content-type': TYPES['.json'], 'cache-control': IMMUTABLE, 'if-none-match': '*' });
    if (latest === 'put') {
        // latest.json, on the condition that it is still what was read (the review of 2026-11-17): If-Match its ETag, or If-None-Match: *
        // where there was none. It is the one key that is written over, so a failure the bucket or the line may mend is tried again.
        const headers = { 'content-type': TYPES['.json'], 'cache-control': NO_CACHE };
        if (st.latest.status !== 200) headers['if-none-match'] = '*'; else if (st.latest.etag) headers['if-match'] = st.latest.etag;
        const waits = Array.isArray(o.retry) ? o.retry : [2000, 6000];
        const upNot = ' The list of ' + o.version + ' and its files are up (' + envKey + '), but ' + LATEST_KEY + ' is not, so no install is offered ' + o.version + ' yet. Run node tools/release.js --publish again: it builds nothing, finds the list on the bucket and puts it as latest.json.';
        for (let i = 0; ; i++) {
            say('Uploading ' + LATEST_KEY + (i ? ' (try ' + (i + 1) + ')' : ''));
            let r = null, err = null;
            try { r = await r2Put(o.cfg, LATEST_KEY, list, headers, o.now); } catch (e) { err = e; }
            if (r && r.status === 200) { put.push(LATEST_KEY); break; }
            if (r && r.status === 412) {
                // an earlier try that went through though its answer was lost, or another run: what is there now tells which
                let g = null; try { g = await r2Get(o.cfg, LATEST_KEY, LIST_CAP, o.now); } catch (e) { g = null; }
                if (g && g.status === 200 && g.buf.equals(list)) { put.push(LATEST_KEY); break; }
                throw noUp(LATEST_KEY + ' changed meanwhile (another release run?): look at what it names before writing.' + upNot);
            }
            const again = !r || r.status === 429 || r.status >= 500;
            if (!again || i >= waits.length) throw noUp((r ? bucketSaid(r) : 'no answer could be had from the bucket (' + errText(err) + ')') + ' for ' + LATEST_KEY + (i ? ', after ' + (i + 1) + ' tries' : '') + '.' + upNot);
            await new Promise(res => setTimeout(res, waits[i]));
        }
    }
    return { keys: put, latest, newest: lv, local: bytes !== null };
}

/* Is this a repository's name as GitHub writes one (owner/name)? Answers it, trimmed, or null. The dispatch's repository is read
   from WAYPOINT_DISPATCH_REPO, or is WEBSITE_REPO, and a name that is none is refused before the build writes anything. */
function repoOk(s) {
    const t = typeof s === 'string' ? s.trim() : '';
    return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/.test(t) && !/\/\.\.?$/.test(t) ? t : null;
}

/* Wake the website's release watcher: repository_dispatch of type waypoint-release, no payload, to the website's repository,
   with the owner's token (WAYPOINT_DISPATCH_TOKEN: a fine-grained token for that repository alone, Contents read and write).
   repo: owner/name (repoOk's). origin: where GitHub's API is: https://api.github.com, or in a test (testHosts' dispatch, read only
   with WAYPOINT_RELEASE_TEST=1) a stand-in on this machine. Resolves the status GitHub answered (204 when it took it). */
function dispatch(token, repo, origin) {
    return new Promise((resolve, reject) => {
        const u = new URL((origin || 'https://api.github.com') + '/repos/' + (repo || WEBSITE_REPO) + '/dispatches');
        const data = Buffer.from(JSON.stringify({ event_type: 'waypoint-release' }));
        const req = (u.protocol === 'http:' ? http : https).request(u, { method: 'POST',
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
    const lines = [], base = { site: o.site, apiUrl: o.apiUrl, pubKey: o.pubKey, source: 'site' };   // the site, whatever the shell reads today (updater.js UPDATE_SOURCE)
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

/* The smoke run before a first real release (the review of 2026-11-17): siteState of the real bucket, said in plain lines. o: { cfg,
   version, pubKey, site, now }. Resolves { ok, lines }: ok where every read was answered (a key that is there or not, latest.json
   readable as a list of the shell's key, or absent); else the refusal's own line. Nothing is written. */
async function probe(o) {
    let st = null;
    try { st = await siteState(o); } catch (e) { return { ok: false, lines: [errText(e)] }; }
    const lines = ['The bucket answered every read: the token may read it.'];
    for (const k of st.keys) lines.push(k + ': ' + (st.there[k] ? 'there (' + st.there[k].size + ' bytes)' : 'not there'));
    let lv = null;
    try { lv = latestOf(st, o.pubKey, o.site); } catch (e) { return { ok: false, lines: lines.concat([errText(e)]) }; }
    lines.push(LATEST_KEY + ': ' + (st.latest.status === 200 ? 'names ' + lv + (st.latest.etag ? ', with an ETag' : ', with no ETag (latest.json would be put with no condition)') : 'not there'));
    return { ok: true, lines };
}

module.exports = { ENVELOPE_NAME, ENVELOPE_KEY, LATEST_KEY, WEBSITE_REPO, siteOf, topVersion, topSection, notesText, notesUrlOf, fileUrl, fileEntry, siteManifest, envelopeOf, envelopeCheck,
    s3Encode, s3Auth, loopOrigin, testHosts, r2Config, r2Request, r2Head, r2Get, r2Put, siteNames, siteState, latestOf, wantOf, sitePublish, probe, repoOk, dispatch, checkSite };

if (require.main === module) {
    const argv = process.argv.slice(2);
    if (argv[0] !== '--check' && argv[0] !== '--probe') { console.error('Usage: node tools/sitepub.js --check [version]  or  --probe [version]   (a release is uploaded by node tools/release.js --publish)'); process.exit(1); }
    const version = argv[1] || JSON.parse(fs.readFileSync(path.join(ROOT, 'system', 'resources', 'app', 'package.json'), 'utf8')).version;
    if (argv[0] === '--probe') {
        // the bucket's settings as a release takes them (a test's own bucket on this machine only with WAYPOINT_RELEASE_TEST=1)
        const t = testHosts(process.env), cfg = t.why ? t : r2Config(process.env, { test: t.test === true });
        if (cfg.why) { console.error(cfg.why.replace(/^Not (built|uploaded to the site): /, 'Not probed: ')); process.exit(1); }
        probe({ cfg, version, pubKey: require('../system/resources/app/updatekey.js').UPDATE_PUBKEY, site: siteOf(ROOT) }).then(r => { for (const l of r.lines) (r.ok ? console.log : console.error)(l); process.exit(r.ok ? 0 : 1); },
            e => { console.error(errText(e)); process.exit(1); });
        return;
    }
    checkSite({ version, site: siteOf(ROOT) }).then(r => { for (const l of r.lines) (r.ok ? console.log : console.error)(l); process.exit(r.ok ? 0 : 1); },
        e => { console.error(String(e && e.message || e)); process.exit(1); });
}
