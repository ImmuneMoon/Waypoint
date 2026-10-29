// account.js — the link between this install and a Waypoint website account (1.6.0; the owner, 2026-10-29: "we can go further and
// link it to the website profiles if the user wishes ... while also allowing the optional site sign in"; by prompt "Now, with the
// website session"). Shared by the shell (main.js) and the dev server, as libstore.js is.
//
// Only this server ever talks to the website: the page's script policy names no outside address, and the install's key never leaves
// this machine's saves folder (saves/account.json) or reaches the page. The page asks its own routes:
//   POST   /api/account/link   { name }          -> { userCode, url, interval, expiresIn }   a device code begun on the site
//   DELETE /api/account/link                     -> { ok: true }   the wait for that code ended here (Stop): a later read finds none
//   POST   /api/account/poll                     -> { state: pending | denied | expired | approved | none }
//   GET    /api/account                          -> { linked: false, pending? } | { linked: true, email, playerId, played, colour?, offline? }
//   GET    /api/account/prefs                    -> { updated, prefs }   the account's copy of the profile
//   POST   /api/account/prefs  { updated, prefs } -> { ok: true }
//   POST   /api/account/adopt  { updated, prefs } -> { updated, prefs } | 409 { error: 'played' }
//   DELETE /api/account                          -> { ok: true }   unlinked here whether or not the site could be told
// Every answer the site gives is read as data: only the fields named here, each by its own rule.
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = 'https://waypointvtt.com';   // the apex: www answers with a 301, and a redirected POST becomes a GET
const ACCOUNT_ROUTES = ['/api/account', '/api/account/link', '/api/account/poll', '/api/account/prefs', '/api/account/adopt'];
const KEY_RE = /^wpk_[0-9a-f]{16}_[A-Za-z0-9_-]{43}$/, KEYID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ2-9]{4}-[BCDFGHJKLMNPQRSTVWXZ2-9]{4}$/, DEVICE_RE = /^[A-Za-z0-9_-]{16,200}$/;
const PREF_KEYS = ['wp_profile', 'wp_tableKeys', 'wp_gmPins', 'wp_gmRooms'];   // what the account keeps: who you are at a table, never wp_hostId
const TIMEOUT_MS = 10000, BODY_MAX = 512 * 1024;

// The site's address: the apex alone, or, for a test, a local site named by WAYPOINT_SITE (http on a loopback name and a port, nothing else)
function siteBase(env) {
    const o = env && typeof env.WAYPOINT_SITE === 'string' ? env.WAYPOINT_SITE.trim() : '';
    return /^http:\/\/(localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(o) ? o : SITE;
}
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function cut(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n) : ''; }
// The account's copy of the profile, as either side hands it: { updated, prefs } where prefs holds only the four keys, each a string
function cleanPrefs(raw) {
    if (!isObj(raw) || !isObj(raw.prefs)) return null;
    const out = {}; PREF_KEYS.forEach(k => { if (Object.prototype.hasOwnProperty.call(raw.prefs, k) && typeof raw.prefs[k] === 'string' && raw.prefs[k].length <= 400000) out[k] = raw.prefs[k]; });
    const up = typeof raw.updated === 'number' && isFinite(raw.updated) && raw.updated > 0 ? Math.floor(raw.updated) : 0;
    return { updated: up, prefs: out };
}
function cleanAccount(a) {
    if (!isObj(a)) return null;
    const out = { email: cut(a.email, 254), playerId: typeof a.playerId === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(a.playerId) ? a.playerId : '', played: a.played === true };
    if (typeof a.colour === 'string' && /^#[0-9a-fA-F]{6}$/.test(a.colour)) out.colour = a.colour.toLowerCase();
    return out;
}

function makeHandler(cfg) {
    const file = path.join(cfg.savesDir, 'account.json'), base = cfg.base || SITE, version = cfg.version || '';
    const doFetch = cfg.fetch || (typeof fetch === 'function' ? fetch : null), now = cfg.now || Date.now, log = cfg.log || function() {};
    let pending = null;   // the device code being linked: this server's memory alone
    const keyOf = () => { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return isObj(j) && KEY_RE.test(j.key) ? j : null; } catch (e) { return null; } };
    const keep = (rec) => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(rec, null, 1), 'utf8'); fs.renameSync(tmp, file); };
    const drop = () => { try { fs.unlinkSync(file); } catch (e) {} };
    // One call to the site: { status, json } or { status: 0 } where it could not be reached
    const site = async (method, p, body, key) => {
        if (!doFetch) return { status: 0 };
        const ac = typeof AbortController === 'function' ? new AbortController() : null, t = ac ? setTimeout(() => ac.abort(), TIMEOUT_MS) : null;
        try {
            const h = { 'Accept': 'application/json' }; if (body !== undefined) h['Content-Type'] = 'application/json'; if (key) h.Authorization = 'Bearer ' + key;
            const r = await doFetch(base + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: ac ? ac.signal : undefined });
            const text = r.status === 204 ? '' : await r.text(); let json = null;
            if (text && text.length <= BODY_MAX) { try { json = JSON.parse(text); } catch (e) { json = null; } }
            return { status: r.status, json };
        } catch (e) { return { status: 0 }; }
        finally { if (t) clearTimeout(t); }
    };
    const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
    const gone = (res) => { drop(); log('unlinked by the site'); send(res, 200, { linked: false, gone: true }); };   // a key the site no longer knows
    const body = (req, res, fn) => cfg.readBody(req, res, cfg.bodyCap, (text) => { let j = null; try { j = text ? JSON.parse(text) : {}; } catch (e) { return send(res, 400, { error: 'invalid json' }); } Promise.resolve().then(() => fn(isObj(j) ? j : {})).catch(() => { try { send(res, 500, { error: 'failed' }); } catch (e) {} }); });

    return function handle(req, res, url) {
        const p = url.pathname, m = req.method;
        (async () => {
            if (p === '/api/account/link' && m === 'POST') return body(req, res, async (j) => {
                const r = await site('POST', '/api/link/start', { name: cut(j.name, 60) || 'Waypoint', version });
                if (r.status === 429) { log('link start: too many'); return send(res, 429, { error: 'slow' }); }
                const o = r.json; if (r.status !== 200 || !isObj(o) || !DEVICE_RE.test(o.deviceCode) || !CODE_RE.test(o.userCode)) { log('link start failed ' + r.status); return send(res, 502, { error: r.status ? 'site' : 'offline' }); }
                const interval = Math.max(5, Math.min(60, Math.floor(Number(o.interval) || 5))), expiresIn = Math.max(30, Math.min(1800, Math.floor(Number(o.expiresIn) || 600)));
                pending = { deviceCode: o.deviceCode, userCode: o.userCode, interval, until: now() + expiresIn * 1000, at: 0 };
                log('link started');
                send(res, 200, { userCode: o.userCode, url: base + '/link?code=' + encodeURIComponent(o.userCode), interval, expiresIn });
            });
            if (p === '/api/account/link' && m === 'DELETE') { const had = !!pending; pending = null; if (had) log('link stopped'); return send(res, 200, { ok: true }); }   // the site's code runs out by itself
            if (p === '/api/account/poll' && m === 'POST') return body(req, res, async () => {
                if (!pending) return send(res, 200, { state: 'none' });
                if (now() > pending.until) { pending = null; return send(res, 200, { state: 'expired' }); }
                if (now() - pending.at < 2600) return send(res, 200, { state: 'pending' });   // the site answers 429 more often than every 2.5 s
                pending.at = now();
                const r = await site('POST', '/api/link/poll', { deviceCode: pending.deviceCode });
                if (r.status === 429 || r.status === 0) return send(res, 200, { state: 'pending', slow: true });
                const o = isObj(r.json) ? r.json : {};
                if (o.state === 'approved' && KEY_RE.test(o.key)) {
                    try { keep({ key: o.key, keyId: KEYID_RE.test(o.keyId) ? o.keyId : '', linkedAt: now() }); } catch (e) { log('link: key not kept'); return send(res, 500, { error: 'write failed' }); }
                    pending = null; log('linked'); return send(res, 200, { state: 'approved' });
                }
                if (o.state === 'denied' || o.state === 'expired') { pending = null; log('link ' + o.state); return send(res, 200, { state: o.state }); }
                send(res, 200, { state: 'pending' });
            });
            if (p === '/api/account' && m === 'GET') {
                const k = keyOf(); if (!k) return send(res, 200, pending && now() <= pending.until ? { linked: false, pending: { userCode: pending.userCode, url: base + '/link?code=' + encodeURIComponent(pending.userCode) } } : { linked: false });
                const r = await site('GET', '/api/install/account', undefined, k.key);
                if (r.status === 401) return gone(res);
                const a = r.status === 200 ? cleanAccount(r.json) : null;
                return send(res, 200, a ? Object.assign({ linked: true }, a) : { linked: true, offline: true });
            }
            if (p === '/api/account' && m === 'DELETE') {
                const k = keyOf(); pending = null;
                if (k) { const r = await site('DELETE', '/api/install', undefined, k.key); log('unlink ' + (r.status || 'offline')); }
                drop(); return send(res, 200, { ok: true });
            }
            if (p === '/api/account/prefs' && m === 'GET') {
                const k = keyOf(); if (!k) return send(res, 409, { error: 'unlinked' });
                const r = await site('GET', '/api/install/prefs', undefined, k.key);
                if (r.status === 401) return gone(res);
                const c = r.status === 200 ? cleanPrefs(r.json) : null;
                return c ? send(res, 200, c) : send(res, 502, { error: r.status ? 'site' : 'offline' });
            }
            if ((p === '/api/account/prefs' || p === '/api/account/adopt') && m === 'POST') return body(req, res, async (j) => {
                const k = keyOf(); if (!k) return send(res, 409, { error: 'unlinked' });
                const c = cleanPrefs(j); if (!c) return send(res, 400, { error: 'bad prefs' });
                const adopt = p === '/api/account/adopt', r = await site('POST', adopt ? '/api/install/adopt' : '/api/install/prefs', c, k.key);
                if (r.status === 401) return gone(res);
                if (adopt && r.status === 409) { log('adopt: played'); return send(res, 409, { error: 'played' }); }
                if (adopt) { const back = r.status === 200 ? cleanPrefs(r.json) : null; log('adopt ' + r.status); return back ? send(res, 200, back) : send(res, 502, { error: r.status ? 'site' : 'offline' }); }
                if (r.status === 204 || r.status === 200) return send(res, 200, { ok: true });
                log('sync ' + r.status); send(res, 502, { error: r.status ? 'site' : 'offline' });
            });
            send(res, 404, { error: 'not found' });
        })().catch(() => { try { send(res, 500, { error: 'failed' }); } catch (e) {} });
    };
}

module.exports = { SITE, ACCOUNT_ROUTES, PREF_KEYS, siteBase, cleanPrefs, cleanAccount, makeHandler };
