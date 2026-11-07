// cloudsync.js — cloud saves, the shell's half (1.6.2; the API agreed with the website session on 2026-11-07, docs/CLOUD_SAVES_API.md in
// its repository; the owner approved both builds that day). Shared by the shell (main.js) and the dev server, as account.js is. It is the
// one code beside account.js that calls the site, with this install's key from saves/account.json, which never reaches the page.
//
// What travels: data.json, images/**, library/** and record/**, never *.tmp or *.part, and nothing else of the saves folder. A file is a
// blob named by its sha256; a version is { data: <hash>, files: { path: hash } }. The page asks its own routes:
//   GET  /api/cloud                         -> { linked, on, plan, readOnly, quota, used, head, last, status, error?, conflict? }
//   POST /api/cloud/on       { on }          -> the same, with the switch kept in saves/cloud.json
//   POST /api/cloud/sync     { reason, keep } -> { did: none | pushed | pulled | conflict | off | error, ... }   pulled: the page reloads
//   POST /api/cloud/resolve  { use }         -> as sync: mine commits this computer's save over the cloud's head, cloud takes the cloud's
//   GET  /api/cloud/versions                -> [{ rev, at, by, size, kept }]
//   POST /api/cloud/restore  { rev }         -> { rev }, then a pull of it
//   POST /api/cloud/keep     { rev, kept }   -> { ok: true }
// Every answer the site gives is read as data: only the fields named here, each by its own rule.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CLOUD_ROUTES = ['/api/cloud', '/api/cloud/on', '/api/cloud/sync', '/api/cloud/resolve', '/api/cloud/versions', '/api/cloud/restore', '/api/cloud/keep'];
const TOPS = ['images', 'library', 'record'];
const KEY_RE = /^wpk_[0-9a-f]{16}_[A-Za-z0-9_-]{43}$/, HASH_RE = /^[0-9a-f]{64}$/;
const MAX_FILES = 50000, MAX_FILE = 512 * 1024 * 1024, BATCH = 1000, QUIET_MS = 10 * 60 * 1000, TICK_MS = 60 * 1000, TIMEOUT_MS = 30000, BODY_MAX = 16 * 1024 * 1024;

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function fin(v) { return typeof v === 'number' && isFinite(v); }
// A path of the set, as the saves folder holds it: data.json, or a plain relative path under images, library or record, segments of
// letters, digits and the usual marks, never empty, a dot or two, a backslash, a colon, a temporary file or a part
function pathOk(p) {
    if (typeof p !== 'string' || !p || p.length > 400) return false;
    if (p === 'data.json') return true;
    if (/[\\:\u0000-\u001f\u007f]/.test(p) || /\.(tmp|part)$/i.test(p)) return false;
    const segs = p.split('/');
    if (segs.length < 2 || TOPS.indexOf(segs[0]) < 0) return false;
    return segs.every(s => s && s !== '.' && s !== '..' && s.length <= 200 && !/^\s|\s$|\.$/.test(s));
}
// A version as the site answers it: { data, files } with every path and hash by its rule, or null
function cleanManifest(m) {
    if (!isObj(m) || !HASH_RE.test(m.data) || !isObj(m.files)) return null;
    const files = {}; let n = 0;
    for (const p of Object.keys(m.files)) { if (n >= MAX_FILES) return null; if (p === 'data.json' || !pathOk(p) || !HASH_RE.test(m.files[p])) continue; files[p] = m.files[p]; n++; }
    return { data: m.data, files };
}
function cleanHead(h) {
    if (!isObj(h) || !Number.isInteger(h.rev) || h.rev < 1) return null;
    return { rev: h.rev, at: fin(h.at) ? h.at : 0, by: typeof h.by === 'string' ? h.by.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) : '', size: fin(h.size) && h.size >= 0 ? h.size : 0 };
}
function cleanCloud(j) {
    if (!isObj(j)) return null;
    return { plan: typeof j.plan === 'string' && /^[a-z_]{1,20}$/.test(j.plan) ? j.plan : '', readOnly: j.readOnly === true, quota: fin(j.quota) && j.quota >= 0 ? j.quota : 0, used: fin(j.used) && j.used >= 0 ? j.used : 0, head: cleanHead(j.head) };
}
// The text that names a version: its data and its files in order. Two sides with the same text hold the same save
function manifestSig(m) { return crypto.createHash('sha256').update(JSON.stringify([m.data, Object.keys(m.files).sort().map(k => [k, m.files[k]])])).digest('hex'); }
// A signed link the site hands out: https, or http on a loopback name while the site itself is a local test site
function linkOk(u, base) {
    if (typeof u !== 'string' || u.length > 4000) return false;
    if (/^https:\/\/[^\s/]+\//.test(u)) return true;
    return /^http:\/\/(localhost|127\.0\.0\.1)/.test(base) && /^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]{1,5})?\//.test(u);
}
function headersOk(h) { const out = {}; if (!isObj(h)) return out; Object.keys(h).forEach(k => { if (/^[A-Za-z0-9-]{1,60}$/.test(k) && typeof h[k] === 'string' && h[k].length <= 400 && !/^(host|authorization|cookie)$/i.test(k)) out[k] = h[k]; }); return out; }

// The files of the set as they stand: [{ path, size, mtime }], data.json first; a link or anything that is no plain file passed over
function listSet(savesDir) {
    const out = [];
    try { const st = fs.lstatSync(path.join(savesDir, 'data.json')); if (st.isFile()) out.push({ path: 'data.json', size: st.size, mtime: st.mtimeMs }); } catch (e) {}
    const walk = (rel) => {
        let names = []; try { names = fs.readdirSync(path.join(savesDir, rel), { withFileTypes: true }); } catch (e) { return; }
        for (const d of names) {
            if (out.length >= MAX_FILES) return;
            const r = rel + '/' + d.name;
            if (d.isDirectory()) walk(r);
            else if (d.isFile() && pathOk(r)) { try { const st = fs.statSync(path.join(savesDir, r)); if (st.size <= MAX_FILE) out.push({ path: r, size: st.size, mtime: st.mtimeMs }); } catch (e) {} }
        }
    };
    TOPS.forEach(walk);
    return out;
}
function hashFile(abs) {
    return new Promise((resolve, reject) => { const h = crypto.createHash('sha256'), s = fs.createReadStream(abs); s.on('data', c => h.update(c)); s.on('error', reject); s.on('end', () => resolve(h.digest('hex'))); });
}

function makeHandler(cfg) {
    const dir = cfg.savesDir, confFile = path.join(dir, 'cloud.json'), base = cfg.base || 'https://waypointvtt.com';
    const doFetch = cfg.fetch || (typeof fetch === 'function' ? fetch : null), now = cfg.now || Date.now, log = cfg.log || function() {};
    const st = { status: 'idle', error: '', conflict: null, busy: null, at: 0, stat: '' };
    const keyOf = () => { try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'account.json'), 'utf8')); return isObj(j) && KEY_RE.test(j.key) ? j.key : null; } catch (e) { return null; } };
    const confOf = () => { try { const j = JSON.parse(fs.readFileSync(confFile, 'utf8')); return isObj(j) ? j : {}; } catch (e) { return {}; } };
    const keepConf = (c) => { const tmp = confFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(c), 'utf8'); fs.renameSync(tmp, confFile); };
    const device = (c) => { if (typeof c.device === 'string' && /^[A-Za-z0-9-]{8,40}$/.test(c.device)) return c.device; c.device = 'waypoint-' + crypto.randomBytes(6).toString('hex'); return c.device; };
    const step = (s, facts) => { try { log('cloud v1 ' + s + (facts ? ' ' + Object.keys(facts).map(k => k + '=' + facts[k]).join(' ') : '')); } catch (e) {} };
    // One call to the site with the key: { status, json }, { status: 0 } where it could not be reached
    const site = async (method, p, body, key) => {
        if (!doFetch) return { status: 0 };
        const ac = typeof AbortController === 'function' ? new AbortController() : null, t = ac ? setTimeout(() => ac.abort(), TIMEOUT_MS) : null;
        try {
            const h = { 'Accept': 'application/json', Authorization: 'Bearer ' + key }; if (body !== undefined) h['Content-Type'] = 'application/json';
            const r = await doFetch(base + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: ac ? ac.signal : undefined });
            const text = r.status === 204 ? '' : await r.text(); let json = null;
            if (text && text.length <= BODY_MAX) { try { json = JSON.parse(text); } catch (e) { json = null; } }
            return { status: r.status, json };
        } catch (e) { return { status: 0 }; }
        finally { if (t) clearTimeout(t); }
    };
    // This computer's save as a version, its hashes cached by size and time in cloud.json
    const localManifest = async (c) => {
        const list = listSet(dir), cache = isObj(c.files) ? c.files : {}, next = {}, files = {}; let data = '';
        for (const f of list) {
            const was = cache[f.path]; let h = was && was.size === f.size && was.mtime === f.mtime && HASH_RE.test(was.hash) ? was.hash : '';
            if (!h) h = await hashFile(path.join(dir, f.path));
            next[f.path] = { size: f.size, mtime: f.mtime, hash: h };
            if (f.path === 'data.json') data = h; else files[f.path] = h;
        }
        c.files = next;
        return data ? { data, files, list } : null;
    };
    const words = (status) => status === 401 ? 'unlinked' : status === 402 ? 'plan' : status === 413 ? 'quota' : status === 429 ? 'busy' : status === 0 ? 'offline' : 'site';
    // Upload what the site lacks and make the version: { rev } or { conflict: head } or { error }
    const push = async (key, c, m, baseRev, keep) => {
        const bySize = {}; m.list.forEach(f => { bySize[f.path] = f.size; });
        const blobs = {}; blobs[m.data] = 'data.json'; Object.keys(m.files).forEach(p => { if (!blobs[m.files[p]]) blobs[m.files[p]] = p; });
        const hashes = Object.keys(blobs);
        const upload = async (want) => {
            for (let i = 0; i < want.length; i += BATCH) {
                const part = want.slice(i, i + BATCH), r = await site('POST', '/api/cloud/prepare', { files: part.map(h => ({ hash: h, size: bySize[blobs[h]] || 0 })) }, key);
                if (r.status !== 200 || !isObj(r.json) || !Array.isArray(r.json.missing)) return words(r.status);
                for (const mm of r.json.missing) {
                    if (!isObj(mm) || !HASH_RE.test(mm.hash) || !blobs[mm.hash] || !linkOk(mm.url, base)) return 'site';
                    const bytes = fs.readFileSync(path.join(dir, blobs[mm.hash]));
                    if (crypto.createHash('sha256').update(bytes).digest('hex') !== mm.hash) return 'changed';   // the file changed while it was being sent: the next sync takes it
                    let up; try { up = await doFetch(mm.url, { method: 'PUT', headers: headersOk(mm.headers), body: bytes, redirect: 'error' }); } catch (e) { return 'offline'; }
                    if (!up || up.status < 200 || up.status > 299) return 'upload';
                }
            }
            return '';
        };
        let bad = await upload(hashes); if (bad) return { error: bad };
        const commit = () => site('POST', '/api/cloud/commit', Object.assign({ base: baseRev, data: m.data, files: m.files, device: device(c) }, keep ? { keep: true } : {}), key);
        let r = await commit();
        if (r.status === 422 && isObj(r.json) && Array.isArray(r.json.hashes)) { bad = await upload(r.json.hashes.filter(h => HASH_RE.test(h) && blobs[h])); if (bad) return { error: bad }; r = await commit(); }
        if (r.status === 409) return { conflict: cleanHead(isObj(r.json) ? r.json.head : null) };
        if (r.status !== 200 || !isObj(r.json) || !Number.isInteger(r.json.rev)) return { error: words(r.status) };
        return { rev: r.json.rev };
    };
    // Take a version: what differs is fetched, each file checked against its hash and written whole; data.json is copied to backups first
    const pull = async (key, c, rev, local) => {
        const r = await site('GET', '/api/cloud/versions/' + rev, undefined, key), m = r.status === 200 ? cleanManifest(r.json) : null;
        if (!m) return { error: words(r.status || 0) };
        const want = {}; if (!local || local.data !== m.data) want[m.data] = ['data.json'];
        Object.keys(m.files).forEach(p => { if (!local || local.files[p] !== m.files[p]) (want[m.files[p]] = want[m.files[p]] || []).push(p); });
        const hashes = Object.keys(want), got = {};
        for (let i = 0; i < hashes.length; i += BATCH) {
            const f = await site('POST', '/api/cloud/fetch', { hashes: hashes.slice(i, i + BATCH) }, key);
            if (f.status !== 200 || !isObj(f.json) || !isObj(f.json.urls)) return { error: words(f.status) };
            Object.keys(f.json.urls).forEach(h => { if (want[h] && linkOk(f.json.urls[h], base)) got[h] = f.json.urls[h]; });
        }
        if (Object.keys(got).length !== hashes.length) return { error: 'missing' };
        for (const h of hashes) {
            let res; try { res = await doFetch(got[h], { method: 'GET', redirect: 'error' }); } catch (e) { return { error: 'offline' }; }
            if (!res || res.status !== 200) return { error: 'download' };
            const bytes = Buffer.from(await res.arrayBuffer());
            if (bytes.length > MAX_FILE || crypto.createHash('sha256').update(bytes).digest('hex') !== h) return { error: 'download' };
            for (const p of want[h]) {
                const abs = path.join(dir, p);
                if (p === 'data.json') { try { fs.mkdirSync(path.join(dir, 'backups'), { recursive: true }); fs.copyFileSync(abs, path.join(dir, 'backups', 'before-cloud-' + now() + '.json')); } catch (e) {} }
                fs.mkdirSync(path.dirname(abs), { recursive: true });
                const tmp = abs + '.part'; fs.writeFileSync(tmp, bytes); fs.renameSync(tmp, abs);
            }
        }
        c.files = {};   // hashed again at the next sync
        const after = await localManifest(c);
        return { rev, sig: after ? manifestSig(after) : manifestSig(m) };
    };
    const done = (c, rev, sig) => { c.last = { rev, sig, at: now() }; keepConf(c); };
    // One sync, never two at once: what it did
    const sync = async (reason, keep) => {
        if (st.busy) return st.busy;
        st.busy = (async () => {
            const key = keyOf(), c = confOf();
            if (!key) return { did: 'off', why: 'unlinked' };
            if (c.on !== true) return { did: 'off', why: 'switched off' };
            st.status = 'busy'; step('start', { reason });
            try {
                const m = await localManifest(c);
                const r = await site('GET', '/api/cloud', undefined, key), cl = r.status === 200 ? cleanCloud(r.json) : null;
                if (!cl) { st.status = 'error'; st.error = words(r.status); keepConf(c); step('fail', { at: 'head', status: r.status }); return { did: 'error', error: st.error }; }
                if (!m) {   // no save on this computer yet: the cloud's is taken where there is one
                    if (!cl.head) { st.status = 'idle'; keepConf(c); return { did: 'none', why: 'no save' }; }
                    const q0 = await pull(key, c, cl.head.rev, null);
                    if (q0.error) { st.status = 'error'; st.error = q0.error; keepConf(c); step('fail', { at: 'pull', error: q0.error }); return { did: 'error', error: q0.error }; }
                    done(c, q0.rev, q0.sig); st.status = 'idle'; st.error = ''; st.at = now(); step('done', { did: 'pulled', rev: q0.rev, first: 1 }); return { did: 'pulled', rev: q0.rev };
                }
                const sig = manifestSig(m), last = isObj(c.last) ? c.last : null, mine = !last || last.sig !== sig, theirs = !!cl.head && (!last || cl.head.rev !== last.rev);
                if (!mine && !theirs) {
                    if (keep && cl.head) await site('POST', '/api/cloud/keep', { rev: cl.head.rev, kept: true }, key);
                    st.status = 'idle'; st.at = now(); keepConf(c); step('done', { did: 'none' }); return { did: 'none' };
                }
                if (mine && theirs) { st.status = 'conflict'; st.conflict = { head: cl.head }; keepConf(c); step('conflict', { head: cl.head.rev }); return { did: 'conflict', head: cl.head }; }
                if (mine) {
                    if (cl.readOnly) { st.status = 'error'; st.error = 'plan'; keepConf(c); return { did: 'error', error: 'plan' }; }
                    const p = await push(key, c, m, cl.head ? cl.head.rev : null, keep);
                    if (p.conflict) { st.status = 'conflict'; st.conflict = { head: p.conflict }; keepConf(c); step('conflict', { at: 'commit' }); return { did: 'conflict', head: p.conflict }; }
                    if (p.error) { st.status = 'error'; st.error = p.error; keepConf(c); step('fail', { at: 'push', error: p.error }); return { did: 'error', error: p.error }; }
                    done(c, p.rev, sig); st.status = 'idle'; st.error = ''; st.at = now(); step('done', { did: 'pushed', rev: p.rev }); return { did: 'pushed', rev: p.rev };
                }
                const q = await pull(key, c, cl.head.rev, m);
                if (q.error) { st.status = 'error'; st.error = q.error; keepConf(c); step('fail', { at: 'pull', error: q.error }); return { did: 'error', error: q.error }; }
                done(c, q.rev, q.sig); st.status = 'idle'; st.error = ''; st.at = now(); step('done', { did: 'pulled', rev: q.rev }); return { did: 'pulled', rev: q.rev };
            } catch (e) { st.status = 'error'; st.error = 'failed'; step('fail', { at: 'throw' }); return { did: 'error', error: 'failed' }; }
        })();
        try { return await st.busy; } finally { st.busy = null; }
    };
    // The answer to a conflict: this computer's save over the cloud's head, or the cloud's taken here
    const resolve = async (use) => {
        const key = keyOf(), c = confOf(), cf = st.conflict; if (!key || !cf || !cf.head) return { did: 'none' };
        st.conflict = null; st.status = 'busy';
        const m = await localManifest(c); if (!m) { st.status = 'idle'; return { did: 'none' }; }
        // the head as it stands now, not as it stood when the question was asked: the cloud may have moved on meanwhile (found live on
        // waypointvtt.com, 2026-11-07: taking the cloud's took the older version the question named, and a newer one never arrived)
        const hr = await site('GET', '/api/cloud', undefined, key), hc = hr.status === 200 ? cleanCloud(hr.json) : null, head = hc && hc.head ? hc.head : cf.head;
        if (use === 'mine') {
            const p = await push(key, c, m, head.rev, false);
            if (p.rev) { done(c, p.rev, manifestSig(m)); st.status = 'idle'; step('resolved', { use: 'mine', rev: p.rev }); return { did: 'pushed', rev: p.rev }; }
            st.status = p.conflict ? 'conflict' : 'error'; if (p.conflict) st.conflict = { head: p.conflict }; else st.error = p.error; keepConf(c); return { did: p.conflict ? 'conflict' : 'error', error: p.error };
        }
        const q = await pull(key, c, head.rev, m);
        if (q.error) { st.status = 'error'; st.error = q.error; keepConf(c); return { did: 'error', error: q.error }; }
        done(c, q.rev, q.sig); st.status = 'idle'; step('resolved', { use: 'cloud', rev: q.rev }); return { did: 'pulled', rev: q.rev };
    };
    // The quiet sync: once the newest file of the set is 10 minutes old and the set differs from what was last synced
    const tick = async () => {
        if (st.busy || st.conflict || !keyOf()) return;
        const c = confOf(); if (c.on !== true) return;
        const list = listSet(dir), sig = list.map(f => f.path + ':' + f.size + ':' + f.mtime).join('|'), newest = list.reduce((a, f) => Math.max(a, f.mtime), 0);
        if (sig === st.stat || now() - newest < QUIET_MS) return;
        const r = await sync('quiet', false); if (r.did === 'none' || r.did === 'pushed' || r.did === 'pulled') st.stat = sig;
    };
    let timer = null;
    if (cfg.timer !== false) { timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS); if (timer && typeof timer.unref === 'function') timer.unref(); }
    const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
    const body = (req, res, fn) => cfg.readBody(req, res, cfg.bodyCap, (text) => { let j = null; try { j = text ? JSON.parse(text) : {}; } catch (e) { return send(res, 400, { error: 'invalid json' }); } Promise.resolve().then(() => fn(isObj(j) ? j : {})).catch(() => { try { send(res, 500, { error: 'failed' }); } catch (e) {} }); });
    const state = async () => {
        const key = keyOf(), c = confOf(), out = { linked: !!key, on: c.on === true, status: st.status, last: isObj(c.last) ? { rev: c.last.rev, at: c.last.at } : null };
        if (st.error) out.error = st.error; if (st.conflict) out.conflict = st.conflict;
        if (key) { const r = await site('GET', '/api/cloud', undefined, key), cl = r.status === 200 ? cleanCloud(r.json) : null; if (cl) Object.assign(out, cl); else out.offline = true; }
        return out;
    };
    const handle = function(req, res, url) {
        const p = url.pathname, m = req.method;
        (async () => {
            if (p === '/api/cloud' && m === 'GET') return send(res, 200, await state());
            if (p === '/api/cloud/on' && m === 'POST') return body(req, res, async (j) => { const c = confOf(); c.on = j.on === true; if (!c.on) delete c.last; device(c); keepConf(c); step(c.on ? 'on' : 'off'); send(res, 200, await state()); });
            if (p === '/api/cloud/sync' && m === 'POST') return body(req, res, async (j) => send(res, 200, await sync(typeof j.reason === 'string' ? j.reason.slice(0, 20) : 'page', j.keep === true)));
            if (p === '/api/cloud/resolve' && m === 'POST') return body(req, res, async (j) => send(res, 200, await resolve(j.use === 'mine' ? 'mine' : 'cloud')));
            if (p === '/api/cloud/versions' && m === 'GET') {
                const key = keyOf(); if (!key) return send(res, 409, { error: 'unlinked' });
                const r = await site('GET', '/api/cloud/versions', undefined, key);
                const list = r.status === 200 && Array.isArray(r.json) ? r.json.slice(0, 500).map(cleanHead).filter(Boolean).map((h, i) => Object.assign(h, { kept: r.json[i] && r.json[i].kept === true })) : null;
                return list ? send(res, 200, list) : send(res, 502, { error: words(r.status) });
            }
            if ((p === '/api/cloud/restore' || p === '/api/cloud/keep') && m === 'POST') return body(req, res, async (j) => {
                const key = keyOf(); if (!key) return send(res, 409, { error: 'unlinked' });
                if (!Number.isInteger(j.rev) || j.rev < 1) return send(res, 400, { error: 'bad rev' });
                if (p === '/api/cloud/keep') { const r = await site('POST', '/api/cloud/keep', { rev: j.rev, kept: j.kept === true }, key); return r.status === 200 ? send(res, 200, { ok: true }) : send(res, 502, { error: words(r.status) }); }
                const r = await site('POST', '/api/cloud/restore', { rev: j.rev }, key);
                if (r.status !== 200 || !isObj(r.json) || !Number.isInteger(r.json.rev)) return send(res, 502, { error: words(r.status) });
                step('restore', { from: j.rev, rev: r.json.rev });
                send(res, 200, await sync('restore', false));
            });
            send(res, 404, { error: 'not found' });
        })().catch(() => { try { send(res, 500, { error: 'failed' }); } catch (e) {} });
    };
    handle.sync = sync; handle.tick = tick; handle.stop = () => { if (timer) clearInterval(timer); timer = null; };
    // On close: one sync, waited for at most ms
    handle.closeSync = (ms) => Promise.race([sync('close', false), new Promise(r => setTimeout(() => r({ did: 'late' }), ms || 5000))]);
    return handle;
}

module.exports = { CLOUD_ROUTES, TOPS, pathOk, cleanManifest, cleanHead, cleanCloud, manifestSig, linkOk, listSet, makeHandler };
