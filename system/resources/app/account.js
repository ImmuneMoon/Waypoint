// account.js — the link between this install and a Waypoint website account (1.6.0; the owner, 2026-10-29: "we can go further and
// link it to the website profiles if the user wishes ... while also allowing the optional site sign in"; by prompt "Now, with the
// website session"). Shared by the shell (main.js) and the dev server, as libstore.js is.
//
// Only this server ever talks to the website: the page's script policy names no outside address, and the install's key never leaves
// this machine's saves folder (saves/account.json) or reaches the page. The page asks its own routes:
//   POST   /api/account/link   { name? }         -> { userCode, url, interval, expiresIn }   a device code begun on the site, named by name or
//                                                   else by this computer's own system name
//   DELETE /api/account/link                     -> { ok: true }   the wait for that code ended here (Stop): a later read finds none
//   POST   /api/account/poll                     -> { state: pending | denied | expired | approved | none }
//   GET    /api/account                          -> { linked: false, pending? } | { linked: true, email, playerId, played, color?, offline? }
//   GET    /api/account/prefs                    -> { updated, prefs }   the account's copy of the profile
//   POST   /api/account/prefs  { updated, prefs } -> { ok: true }
//   POST   /api/account/adopt  { updated, prefs } -> { updated, prefs } | 409 { error: 'played' }
//   DELETE /api/account                          -> { ok: true }   unlinked here whether or not the site could be told
//   POST   /api/account/name   { name }          -> { name } | 409 { error: 'taken' } | 429 { error: 'slow' } | 400 { error: 'empty' }   this computer's name
//                                                   on the account (1.6.2; the owner, 2026-11-09: each computer named in the app's settings)
//   POST   /api/account/relay                    -> { iceServers, expires, usage?, test? } | 409 { error: 'unlinked' } (asks nothing) | 401 { error:
//                                                   'unlinked' } | 403 { error: 'plan' } | 403 { error: 'allowance', usage? } | 404 { error: 'off' } |
//                                                   429 { error: 'slow' } | 503 { error: 'unavailable' } | 502 { error: 'site' | 'offline' }   the plan's relay
//                                                   for a table this computer hosts (1.6.4, below)
// Every answer the site gives is read as data: only the fields named here, each by its own rule.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const SITE = 'https://waypointvtt.com';   // the apex: www answers with a 301, and a redirected POST becomes a GET
const ACCOUNT_ROUTES = ['/api/account', '/api/account/link', '/api/account/poll', '/api/account/prefs', '/api/account/adopt', '/api/account/name', '/api/account/relay'];
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
function cleanName(v) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60).trim() : ''; }
function cleanAccount(a) {
    if (!isObj(a)) return null;
    const out = { email: cut(a.email, 254), playerId: typeof a.playerId === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(a.playerId) ? a.playerId : '', played: a.played === true };
    if (typeof a.colour === 'string' && /^#[0-9a-fA-F]{6}$/.test(a.colour)) out.colour = a.colour.toLowerCase();
    const nm = cleanName(a.name); if (nm) out.name = nm;   // this computer's name on the account, where the site says it
    return out;
}

/*
  The plan's relay (1.6.4; the owner, 2026-11-16, of the relay a Waypoint plan includes; the website's contract of 2026-11-10 and its part 12,
  the monthly allowance). A GM who hosts on a paid plan gets short-lived TURN credentials from the site, so players behind strict networks can
  still reach the table. Only the host asks, by POST /api/relay with no body and the install key as a bearer; an unlinked computer never asks.
  The page cannot hold the key, so it asks this server (POST /api/account/relay) and this server asks the site on its behalf, as every other
  account call does. The credentials are handed to the page, which needs them to open its connections, and nowhere else: never written to
  disk, never put in a log line.

  Everything the site says is cleaned here and cleaned again on the page (net.js's siterelay slice holds the same rules, and netcheck holds
  the two to each other): a relay address only turn: or turns: on a host the contract names (RELAY_HOSTS: the managed relay service's own
  host, and the site's own domain and its subdomains), a port other than 53, nothing after the host but ?transport=udp or tcp; a username
  and a credential as short printable strings; at most 4 servers of 8 addresses each. A loopback relay (the site's fake one for a local
  test) is taken only while this server talks to a loopback test site, and the answer then says test: true so that the page takes it too.
*/
const RELAY_HOSTS = ['turn.cloudflare.com'], RELAY_DOMAIN = 'waypointvtt.com', RELAY_WAIT_MS = 4000;
const RELAY_LOOP = ['localhost', '127.0.0.1'];
// One relay address, as the contract allows it: turn: or turns:, a named host, an optional port that is not 53, an optional transport
function relayUrlOk(u, test) {
    if (typeof u !== 'string' || u.length > 256) return false;
    const m = /^(turns?):([a-z0-9.-]{1,200})(?::([0-9]{1,5}))?(?:\?transport=(?:udp|tcp))?$/i.exec(u);
    if (!m) return false;
    const host = m[2].toLowerCase(), port = m[3] === undefined ? 0 : Number(m[3]);
    if (m[3] !== undefined && (port < 1 || port > 65535 || port === 53)) return false;
    if (RELAY_HOSTS.includes(host) || host === RELAY_DOMAIN || host.endsWith('.' + RELAY_DOMAIN)) return true;
    return !!test && RELAY_LOOP.includes(host);
}
// A username or a credential: printable ASCII, 1 to 512 characters (the site's own bound)
function relayText(v) { return typeof v === 'string' && v.length >= 1 && v.length <= 512 && /^[\x20-\x7e]+$/.test(v); }
// The site's iceServers, cleaned: each server keeps only the addresses that pass, and a server with none, or with no usable username and
// credential, is dropped whole. Answers [] for anything that holds no server.
function cleanIceServers(raw, test) {
    const list = Array.isArray(raw) ? raw.slice(0, 4) : [], out = [];
    list.forEach(s => {
        if (!isObj(s) || !relayText(s.username) || !relayText(s.credential)) return;
        const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).slice(0, 8).filter(u => relayUrlOk(u, test));
        if (urls.length) out.push({ urls, username: s.username, credential: s.credential });
    });
    return out;
}
// The month's relay use as the site counts it (part 12): bytes used and allowed, the 80% warning and over only as true, and when it resets
// (milliseconds since the epoch). null where it cannot be read, so the page says nothing about it.
function cleanRelayUsage(u) {
    if (!isObj(u)) return null;
    const n = (v) => typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1e18 ? Math.floor(v) : null;
    const used = n(u.used), allowance = n(u.allowance), resets = n(u.resets);
    if (used === null || allowance === null) return null;
    const out = { used, allowance, warning: u.warning === true, over: u.over === true };
    if (resets) out.resets = resets;
    return out;
}
// When a set runs out: a time ahead of now and no more than two days ahead (the site says about 12 hours), else none
function cleanExpires(v, now) { return typeof v === 'number' && isFinite(v) && v > now && v <= now + 48 * 3600 * 1000 ? Math.floor(v) : 0; }

function makeHandler(cfg) {
    const file = path.join(cfg.savesDir, 'account.json'), base = cfg.base || SITE, version = cfg.version || '';
    const doFetch = cfg.fetch || (typeof fetch === 'function' ? fetch : null), now = cfg.now || Date.now, log = cfg.log || function() {};
    let pending = null;   // the device code being linked: this server's memory alone
    const hostName = () => { try { return typeof cfg.hostname === 'string' ? cfg.hostname : os.hostname(); } catch (e) { return ''; } };   // 1.6.2 (the owner, 2026-11-09): a computer links under its own system name
    const keyOf = () => { try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return isObj(j) && KEY_RE.test(j.key) ? j : null; } catch (e) { return null; } };
    const keep = (rec) => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(rec, null, 1), 'utf8'); fs.renameSync(tmp, file); };
    const drop = () => { try { fs.unlinkSync(file); } catch (e) {} };
    // One call to the site: { status, json } or { status: 0 } where it could not be reached
    const site = async (method, p, body, key, ms) => {   // ms: a shorter wait than TIMEOUT_MS, for a call hosting waits on (the relay)
        if (!doFetch) return { status: 0 };
        const ac = typeof AbortController === 'function' ? new AbortController() : null, t = ac ? setTimeout(() => ac.abort(), ms || TIMEOUT_MS) : null;
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
                const asked = cleanName(j.name) || cleanName(hostName()) || 'Waypoint', r = await site('POST', '/api/link/start', { name: asked, version });
                if (r.status === 429) { log('link start: too many'); return send(res, 429, { error: 'slow' }); }
                const o = r.json; if (r.status !== 200 || !isObj(o) || !DEVICE_RE.test(o.deviceCode) || !CODE_RE.test(o.userCode)) { log('link start failed ' + r.status); return send(res, 502, { error: r.status ? 'site' : 'offline' }); }
                const interval = Math.max(5, Math.min(60, Math.floor(Number(o.interval) || 5))), expiresIn = Math.max(30, Math.min(1800, Math.floor(Number(o.expiresIn) || 600)));
                pending = { deviceCode: o.deviceCode, userCode: o.userCode, interval, until: now() + expiresIn * 1000, at: 0, name: asked };
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
                    try { keep({ key: o.key, keyId: KEYID_RE.test(o.keyId) ? o.keyId : '', linkedAt: now(), name: pending.name || '' }); } catch (e) { log('link: key not kept'); return send(res, 500, { error: 'write failed' }); }
                    pending = null; log('linked'); return send(res, 200, { state: 'approved' });
                }
                if (o.state === 'denied' || o.state === 'expired') { pending = null; log('link ' + o.state); return send(res, 200, { state: o.state }); }
                send(res, 200, { state: 'pending' });
            });
            if (p === '/api/account' && m === 'GET') {
                const k = keyOf(); if (!k) return send(res, 200, pending && now() <= pending.until ? { linked: false, pending: { userCode: pending.userCode, url: base + '/link?code=' + encodeURIComponent(pending.userCode) } } : { linked: false });
                const r = await site('GET', '/api/install/account', undefined, k.key);
                if (r.status === 401) return gone(res);
                const a = r.status === 200 ? cleanAccount(r.json) : null, had = cleanName(k.name);
                if (a && a.name && a.name !== had) { try { keep(Object.assign({}, k, { name: a.name })); } catch (e) {} }   // a rename on the account page
                const nm = a && a.name ? a.name : had;
                return send(res, 200, a ? Object.assign({ linked: true }, a, nm ? { name: nm } : {}) : Object.assign({ linked: true, offline: true }, had ? { name: had } : {}));
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
            if (p === '/api/account/name' && m === 'POST') return body(req, res, async (j) => {   // this computer's name on the account: the site keeps one name a computer, no two alike
                const k = keyOf(); if (!k) return send(res, 409, { error: 'unlinked' });
                const want = cleanName(j.name); if (!want) return send(res, 400, { error: 'empty' });
                const r = await site('POST', '/api/install/name', { name: want }, k.key);
                if (r.status === 401) return gone(res);
                if (r.status === 409) { log('rename: taken'); return send(res, 409, { error: 'taken' }); }
                if (r.status === 429) { log('rename: too many'); return send(res, 429, { error: 'slow' }); }
                const got = r.status === 200 && isObj(r.json) ? cleanName(r.json.name) : '';
                if (!got) { log('rename ' + r.status); return send(res, 502, { error: r.status ? 'site' : 'offline' }); }
                try { keep(Object.assign({}, k, { name: got })); } catch (e) {}
                log('renamed'); send(res, 200, { name: got });   // what the site kept, never what was typed
            });
            if (p === '/api/account/relay' && m === 'POST') return body(req, res, async () => {   // 1.6.4: the plan's relay for a table this computer hosts
                const k = keyOf(); if (!k) { log('relay: not linked, nothing asked'); return send(res, 409, { error: 'unlinked' }); }   // an unlinked computer never asks the site
                const test = /^http:\/\/(localhost|127\.0\.0\.1):/.test(base), r = await site('POST', '/api/relay', undefined, k.key, RELAY_WAIT_MS);
                if (r.status === 401) { drop(); log('relay: unlinked by the site'); return send(res, 401, { error: 'unlinked' }); }   // as every other account call: a key the site no longer knows goes
                const o = isObj(r.json) ? r.json : {}, usage = cleanRelayUsage(o.usage);
                if (r.status === 200) {
                    const servers = cleanIceServers(o.iceServers, test), expires = cleanExpires(o.expires, now());
                    if (!servers.length || !expires) { log('relay: an answer with no usable relay'); return send(res, 502, { error: 'site' }); }
                    log('relay: got ' + servers.length + ' server' + (servers.length === 1 ? '' : 's'));   // never the addresses or the credentials
                    const out = { iceServers: servers, expires }; if (usage) out.usage = usage; if (test) out.test = true;
                    return send(res, 200, out);
                }
                if (r.status === 403) { const allow = o.error === 'allowance'; log('relay: ' + (allow ? 'allowance used up' : 'not on the plan')); return send(res, 403, allow && usage ? { error: 'allowance', usage } : { error: allow ? 'allowance' : 'plan' }); }
                if (r.status === 404) { log('relay: switched off on the site'); return send(res, 404, { error: 'off' }); }
                if (r.status === 429) { log('relay: too many asks'); return send(res, 429, { error: 'slow' }); }
                if (r.status === 503) { log('relay: the site\'s relay did not answer'); return send(res, 503, { error: 'unavailable' }); }
                log('relay ' + (r.status || 'offline')); send(res, 502, { error: r.status ? 'site' : 'offline' });
            });
            send(res, 404, { error: 'not found' });
        })().catch(() => { try { send(res, 500, { error: 'failed' }); } catch (e) {} });
    };
}

module.exports = { SITE, ACCOUNT_ROUTES, PREF_KEYS, RELAY_HOSTS, RELAY_DOMAIN, siteBase, cleanPrefs, cleanAccount, cleanName, relayUrlOk, cleanIceServers, cleanRelayUsage, makeHandler };
