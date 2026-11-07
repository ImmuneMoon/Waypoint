// cloudcheck.js — cloud saves, the shell's half (system/resources/app/cloudsync.js), run for real on a scratch saves folder against a site
// of the suite's own that answers as docs/CLOUD_SAVES_API.md (the website's) says. No network: fetch is the suite's.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const NL = String.fromCharCode(10);
const CS = require('../system/resources/app/cloudsync.js'), RG = require('../system/resources/app/reqguard.js');
let pass = 0, fail = 0, summed = false;
process.on('exit', code => { if (!summed && !code) { console.log(NL + 'FAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
function check(name, ok, info) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (info !== undefined ? ' -> ' + info : '')); } }
const J = JSON.stringify, sha = b => crypto.createHash('sha256').update(b).digest('hex');
const KEY = 'wpk_0123456789abcdef_' + 'A'.repeat(43), BASE = 'http://localhost:3210';

// The site: blobs by hash, versions by rev, signed links that are its own loopback addresses
function makeSite() {
    const S = { blobs: {}, versions: [], plan: 'gm', readOnly: false, quota: 5e9, puts: 0, commits: [], fail: {} };
    const head = () => S.versions.length ? S.versions[S.versions.length - 1] : null;
    const reply = (status, obj) => ({ status, text: async () => obj === undefined ? '' : (typeof obj === 'string' ? obj : JSON.stringify(obj)), arrayBuffer: async () => obj });
    S.fetch = async (url, opt) => {
        opt = opt || {}; const u = new URL(url), m = opt.method || 'GET', body = opt.body && typeof opt.body === 'string' ? JSON.parse(opt.body) : opt.body;
        if (u.pathname.startsWith('/blob/')) {
            const h = u.pathname.slice(6);
            if (m === 'PUT') { if (S.fail.put) return reply(500); if (sha(Buffer.from(body)) !== h) return reply(400); S.blobs[h] = Buffer.from(body); S.puts++; return reply(200); }
            const b = S.fail.corrupt ? Buffer.from('not it') : S.blobs[h]; return b ? reply(200, b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) : reply(404);
        }
        if ((opt.headers || {}).Authorization !== 'Bearer ' + KEY) return reply(401, { error: 'unlinked' });
        const hd = head();
        if (u.pathname === '/api/cloud' && m === 'GET') return reply(200, { plan: S.plan, readOnly: S.readOnly, quota: S.quota, used: 10, head: hd ? { rev: hd.rev, at: 1, by: hd.device, data: hd.data, size: 1 } : null });
        if (u.pathname === '/api/cloud/prepare') return reply(200, { missing: body.files.filter(f => !S.blobs[f.hash]).map(f => ({ hash: f.hash, url: BASE + '/blob/' + f.hash, headers: { 'Content-Type': 'application/octet-stream', 'x-goog-content-length-range': f.size + ',' + f.size, Host: 'evil' }, expires: 1 })) });
        if (u.pathname === '/api/cloud/commit') {
            if (S.readOnly) return reply(402, { error: 'plan' });
            if ((body.base || null) !== (hd ? hd.rev : null)) return reply(409, { error: 'conflict', head: { rev: hd.rev, at: 1, by: hd.device } });
            const missing = [body.data].concat(Object.values(body.files)).filter(h => !S.blobs[h]);
            if (missing.length || S.fail.miss) { S.fail.miss = false; if (missing.length) return reply(422, { error: 'missing', hashes: missing }); }
            const v = { rev: S.versions.length + 1, data: body.data, files: body.files, device: body.device, kept: !!body.keep }; S.versions.push(v); S.commits.push(body); return reply(200, { rev: v.rev });
        }
        if (u.pathname.startsWith('/api/cloud/versions/')) { const v = S.versions[Number(u.pathname.split('/').pop()) - 1]; return v ? reply(200, S.hostile ? { data: v.data, files: Object.assign({}, v.files, S.hostile) } : { data: v.data, files: v.files }) : reply(404); }
        if (u.pathname === '/api/cloud/versions') return reply(200, S.versions.slice().reverse().map(v => ({ rev: v.rev, at: 1, by: v.device, size: 1, kept: v.kept })));
        if (u.pathname === '/api/cloud/fetch') { const urls = {}; body.hashes.forEach(h => { if (S.blobs[h]) urls[h] = BASE + '/blob/' + h; }); return reply(200, { urls }); }
        if (u.pathname === '/api/cloud/keep') { const v = S.versions[body.rev - 1]; if (v) v.kept = body.kept; return reply(200, { ok: true }); }
        if (u.pathname === '/api/cloud/restore') { const v = S.versions[body.rev - 1]; const n = { rev: S.versions.length + 1, data: v.data, files: v.files, device: 'restore', kept: false }; S.versions.push(n); return reply(200, { rev: n.rev }); }
        return reply(404);
    };
    // another computer's commit: blobs put and a version made
    S.other = (files) => { const out = { data: null, files: {} }; Object.keys(files).forEach(p => { const b = Buffer.from(files[p]), h = sha(b); S.blobs[h] = b; if (p === 'data.json') out.data = h; else out.files[p] = h; }); S.versions.push({ rev: S.versions.length + 1, data: out.data, files: out.files, device: 'other' }); };
    return S;
}
function saves(withKey) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-cloud-'));
    fs.writeFileSync(path.join(d, 'data.json'), '{"v":1}'); fs.mkdirSync(path.join(d, 'images', 'm1'), { recursive: true }); fs.writeFileSync(path.join(d, 'images', 'm1', 'a.png'), 'PNG-A');
    fs.writeFileSync(path.join(d, 'preferences.json'), '{}'); fs.mkdirSync(path.join(d, 'backups')); fs.writeFileSync(path.join(d, 'backups', 'old.json'), 'x'); fs.writeFileSync(path.join(d, 'images', 'm1', 'b.png.part'), 'half');
    if (withKey) fs.writeFileSync(path.join(d, 'account.json'), J({ key: KEY, keyId: 'k' }));
    return d;
}
const mk = (dir, S, now) => CS.makeHandler({ savesDir: dir, base: BASE, fetch: S.fetch, timer: false, now: now || Date.now, log: () => {}, readBody: (rq, rs, cap, fn) => fn(rq.__body === undefined ? '' : JSON.stringify(rq.__body)) });

(async () => {
    // the rules on their own
    check('the set: data.json, and a plain path under images, library or record; never a walk, a backslash, a colon, a temporary file or a part, the backups, the key or the settings',
        ['data.json', 'images/m1/a.png', 'library/pack.json', 'record/c1/s1.jsonl'].every(CS.pathOk)
        && ['../data.json', 'images/../account.json', 'account.json', 'preferences.json', 'backups/x.json', 'images/a.png.tmp', 'images/a.part', 'images\\a.png', 'images/c:a', 'images', 'images//a', 'images/ a', 'images/a.', 7, ''].every(p => !CS.pathOk(p)));
    check('a signed link is https, or a loopback address while the site itself is a local test site; a version is read as data, a hostile path or hash left out',
        CS.linkOk('https://storage.googleapis.com/b/x', 'https://waypointvtt.com') && !CS.linkOk('http://localhost:9/x', 'https://waypointvtt.com') && CS.linkOk('http://localhost:3210/blob/x', BASE) && !CS.linkOk('file:///c:/x', BASE) && !CS.linkOk('http://evil.com/x', BASE)
        && J(CS.cleanManifest({ data: 'a'.repeat(64), files: { 'images/a.png': 'b'.repeat(64), '../x': 'c'.repeat(64), 'account.json': 'd'.repeat(64), 'images/b.png': 'nothex' } })) === J({ data: 'a'.repeat(64), files: { 'images/a.png': 'b'.repeat(64) } }) && CS.cleanManifest({ data: 'x', files: {} }) === null);
    check('the install\'s key and the cloud\'s record are never served as files under /saves/ (reqguard savesHidden; found in passing: the key was served to the page)',
        ['/saves/account.json', '/saves/cloud.json', '/saves/Account.json.tmp', '/saves/cloud.json.'].every(RG.savesHidden) && !RG.savesHidden('/saves/images/a.png'));

    // a whole run
    const S = makeSite(), dir = saves(true), H = mk(dir, S);
    const off = await H.sync('page', false);
    fs.writeFileSync(path.join(dir, 'cloud.json'), J({ on: true }));
    const p1 = await H.sync('page', false), c1 = S.commits[0];
    check('switched off nothing is sent; switched on the first sync sends the save: each file of the set once, the commit naming data.json and the files by hash with no base and this install\'s device, never the backups, the settings, a part or the key',
        off.did === 'off' && p1.did === 'pushed' && p1.rev === 1 && S.puts === 2 && c1.base === null && c1.data === sha(Buffer.from('{"v":1}')) && J(Object.keys(c1.files)) === J(['images/m1/a.png']) && /^waypoint-[0-9a-f]{12}$/.test(c1.device), J([off, p1, c1 && Object.keys(c1.files)]));
    const n1 = await H.sync('page', false);
    fs.writeFileSync(path.join(dir, 'images', 'm1', 'c.png'), 'PNG-C'); const p2 = await H.sync('page', false);
    check('a second sync with nothing changed sends nothing; a new picture is the only blob sent, on the head it last saw', n1.did === 'none' && p2.did === 'pushed' && p2.rev === 2 && S.puts === 3 && S.commits[1].base === 1, J([n1, p2, S.puts]));

    S.other({ 'data.json': '{"v":2}', 'images/m1/a.png': 'PNG-A', 'images/m1/c.png': 'PNG-C', 'images/m1/d.png': 'PNG-D' });
    const pl = await H.sync('start', false), backs = fs.readdirSync(path.join(dir, 'backups'));
    check('only the cloud changed: the head is taken, what differs fetched and written, data.json copied to backups first, and nothing sent',
        pl.did === 'pulled' && pl.rev === 3 && fs.readFileSync(path.join(dir, 'data.json'), 'utf8') === '{"v":2}' && fs.readFileSync(path.join(dir, 'images', 'm1', 'd.png'), 'utf8') === 'PNG-D' && backs.some(b => /^before-cloud-\d+\.json$/.test(b)) && S.commits.length === 2, J([pl, backs]));
    const n2 = await H.sync('page', false);
    check('after taking the cloud\'s save the next sync finds nothing to do', n2.did === 'none', J(n2));

    S.other({ 'data.json': '{"v":3}', 'images/m1/a.png': 'PNG-A' }); fs.writeFileSync(path.join(dir, 'data.json'), '{"v":"mine"}');
    const cf = await H.sync('page', false), st = JSON.parse(await route(H, 'GET', '/api/cloud'));
    check('both changed: a conflict, the head named, and the state says so to the page without the key', cf.did === 'conflict' && cf.head.rev === 4 && st.conflict && st.conflict.head.rev === 4 && !JSON.stringify(st).includes(KEY), J([cf, st]));
    const rm = JSON.parse(await route(H, 'POST', '/api/cloud/resolve', { use: 'mine' }));
    check('Keep this computer\'s: its save is committed over the cloud\'s head (base the head), and the cloud\'s head stays a version', rm.did === 'pushed' && rm.rev === 5 && S.commits[2].base === 4 && S.versions.length === 5, J(rm));

    S.other({ 'data.json': '{"v":4}' }); fs.writeFileSync(path.join(dir, 'data.json'), '{"v":"mine2"}');
    await H.sync('page', false); const rc = JSON.parse(await route(H, 'POST', '/api/cloud/resolve', { use: 'cloud' }));
    check('Use the cloud\'s: the head is taken here', rc.did === 'pulled' && rc.rev === 6 && fs.readFileSync(path.join(dir, 'data.json'), 'utf8') === '{"v":4}', J(rc));
    S.other({ 'data.json': '{"v":41}' }); fs.writeFileSync(path.join(dir, 'data.json'), '{"v":"mine3"}'); await H.sync('page', false); S.other({ 'data.json': '{"v":42}' });
    const rn = JSON.parse(await route(H, 'POST', '/api/cloud/resolve', { use: 'cloud' }));
    check('Use the cloud\'s answered after the cloud moved on takes the head as it stands then, not the one the question named (found live on waypointvtt.com, 2026-11-07)', rn.did === 'pulled' && rn.rev === 8 && fs.readFileSync(path.join(dir, 'data.json'), 'utf8') === '{"v":42}', J(rn));

    // the site misbehaving
    S.other({ 'data.json': '{"v":5}', 'images/m1/a.png': 'PNG-A' }); S.hostile = { '../evil.txt': sha(Buffer.from('x')), 'account.json': sha(Buffer.from('x')) };
    const hs = await H.sync('page', false);
    check('a version naming a path outside the set is read without it: nothing is written outside images, library or record', hs.did === 'pulled' && !fs.existsSync(path.join(dir, '..', 'evil.txt')) && JSON.parse(fs.readFileSync(path.join(dir, 'account.json'), 'utf8')).key === KEY, J(hs));
    S.hostile = null; S.other({ 'data.json': '{"v":6}' }); S.fail.corrupt = true;
    const bad = await H.sync('page', false); S.fail.corrupt = false;
    check('a download whose bytes are not its hash is refused and nothing is written', bad.did === 'error' && bad.error === 'download' && fs.readFileSync(path.join(dir, 'data.json'), 'utf8') === '{"v":5}', J(bad));
    await H.sync('page', false); S.readOnly = true; fs.writeFileSync(path.join(dir, 'data.json'), '{"v":"ro"}');
    const ro = await H.sync('page', false); S.readOnly = false;
    check('with no plan (read only) nothing is sent and the state says why', ro.did === 'error' && ro.error === 'plan', J(ro));
    fs.unlinkSync(path.join(dir, 'account.json')); const ul = await H.sync('page', false), us = JSON.parse(await route(H, 'GET', '/api/cloud'));
    check('with no website account linked nothing is sent and the page is told so', ul.did === 'off' && us.linked === false, J([ul, us]));

    // the quiet sync: ten minutes after the newest change
    let t = Date.now(); const S2 = makeSite(), d2 = saves(true); fs.writeFileSync(path.join(d2, 'cloud.json'), J({ on: true }));
    const H2 = mk(d2, S2, () => t); await H2.tick(); const early = S2.commits.length; t += 11 * 60 * 1000; await H2.tick(); const late = S2.commits.length;
    check('the quiet sync waits until the newest file of the set is ten minutes old, then sends it once', early === 0 && late === 1, J([early, late]));

    {
        const uiS = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'cloudui.js'), 'utf8'), a = uiS.indexOf('// [cloudcheck:words-start]'), b = uiS.indexOf('// [cloudcheck:words-end]');
        const W = new Function(uiS.slice(a, b) + '\nreturn { sizeWords: sizeWords, stateWords: stateWords, usageWords: usageWords, fromWords: fromWords };')();
        const ixS = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').split(String.fromCharCode(13)).join(''), stS = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'settings.js'), 'utf8');
        check('the Profile window\'s Cloud saves part says each state in plain words (not linked, switched off, a conflict, busy, each failure, synced, not yet) and its usage; its switch, status, usage and Sync now are in the page, the module after the cell size\'s, and a snapshot asks the cloud to keep that version too',
            /Link this computer/.test(W.stateWords({ linked: false })) && /this computer only/.test(W.stateWords({ linked: true, on: false })) && /both changed/.test(W.stateWords({ linked: true, on: true, conflict: { head: {} } }))
            && /plan does not include/.test(W.stateWords({ linked: true, on: true, status: 'error', error: 'plan' })) && /did not arrive whole/.test(W.stateWords({ linked: true, on: true, status: 'error', error: 'download' })) && /^Synced at /.test(W.stateWords({ linked: true, on: true, status: 'idle', last: { at: 1 } })) && /Not synced yet/.test(W.stateWords({ linked: true, on: true, status: 'idle' }))
            && W.usageWords({ linked: true, on: true, used: 2 * 1024 * 1024, quota: 5 * 1024 * 1024 * 1024 }) === '2 MB of 5 GB used.' && W.usageWords({ linked: true, on: false, used: 1, quota: 5 }) === '' && W.sizeWords(10) === '1 KB' && W.fromWords('waypoint-7f101e919d32') === 'another computer' && W.fromWords('Browser') === 'the website in a browser' && W.fromWords(undefined) === 'another computer'
            && ['cloudPart', 'cloudOn', 'cloudStatus', 'cloudUsage', 'cloudSyncNow'].every(id => ixS.split('id="' + id + '"').length === 2) && ixS.includes('<script type="module" src="scripts/cellsize.js"></script>\n<script type="module" src="scripts/cloudui.js"></script>')
            && stS.includes("if (window.wpCloud && typeof window.wpCloud.backup === 'function') window.wpCloud.backup();") && uiS.includes("{ yes: 'Keep this computer\u2019s', alt: 'Use the cloud\u2019s', noEnter: true, noEscape: true }")
            && ixS.includes('<b>Cloud saves</b>') && ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes('Keep my')));
    }
    const mainS = fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'main.js'), 'utf8'), devS = fs.readFileSync(path.join(__dirname, 'dev-server.js'), 'utf8');
    check('both servers route the cloud\'s calls to the one module, and the shell syncs once on close, five seconds at most',
        mainS.includes("if (cloudsync.CLOUD_ROUTES.includes(url.pathname) || url.pathname.startsWith('/api/cloud/')) { cloudHandler(req, res, url); return; }") && devS.includes("if (cloudsync.CLOUD_ROUTES.includes(url.pathname) || url.pathname.startsWith('/api/cloud/')) { cloudHandler(req, res, url); return; }")
        && mainS.includes("cloudHandler.closeSync(5000).catch(() => {}).then(() => { cloudHandler.stop(); app.quit(); });"));

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(e => { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });

// One call of a route, its answer's text
function route(H, method, p, body) {
    return new Promise(resolve => {
        const req = { method }, res = { writeHead() {}, end(t) { resolve(t); } };
        H(Object.assign(req, { __body: body }), res, new URL('http://x' + p));
    });
}
