// accountcheck.js — this install linked to a Waypoint website account (1.6.0): system/resources/app/account.js run for real against a site of
// the suite's own (a stand-in fetch, no network), on a scratch saves folder; and settings.js's account slice run for real on a page of plain
// objects, for the order the site asks for (the account read first, then decided on, and only then the first sync). Plain Node, exits 1 on failure.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
let pass = 0, fail = 0, summed = false;
function check(name, ok, info) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (info !== undefined ? ' -> ' + String(info).slice(0, 600) : '')); } }
const J = JSON.stringify, ROOT = path.join(__dirname, '..');
const A = require(path.join(ROOT, 'system', 'resources', 'app', 'account.js'));
const KEY = 'wpk_0123456789abcdef_' + 'A'.repeat(43);

// a site of the suite's own: each route answers from a table the test fills, and every call is written down
function siteStub() {
    const calls = [], answer = {};
    const fetch = async (url, o) => {
        const u = new URL(url), body = o && o.body ? JSON.parse(o.body) : undefined;
        calls.push({ m: o.method, p: u.pathname, auth: o.headers && o.headers.Authorization || '', body, redirect: o.redirect, base: u.origin });
        const a = answer[o.method + ' ' + u.pathname]; const r = typeof a === 'function' ? a(body) : a;
        if (!r) return { status: 0, text: async () => '' };
        if (r.throw) throw new Error('down');
        return { status: r.status, text: async () => r.json === undefined ? '' : J(r.json) };
    };
    return { calls, answer, fetch };
}
function readBody(req, res, cap, fn) { fn(req.body || ''); }
function call(h, method, p, body) {
    return new Promise(resolve => {
        const res = { code: 0, head: null, writeHead(c, hd) { this.code = c; this.head = hd; }, end(t) { resolve({ status: this.code, json: t ? JSON.parse(t) : null, text: t || '' }); } };
        h({ method, body: body === undefined ? '' : J(body) }, res, new URL('http://localhost' + p));
    });
}

(async () => {
    /* ---- account.js ---- */
    {
        check('siteBase: the apex alone, or a local test site named by WAYPOINT_SITE (http on localhost or 127.0.0.1 with a port), never any other address',
            A.SITE === 'https://waypointvtt.com' && A.siteBase({}) === A.SITE && A.siteBase({ WAYPOINT_SITE: 'http://localhost:3002' }) === 'http://localhost:3002' && A.siteBase({ WAYPOINT_SITE: 'http://127.0.0.1:3002' }) === 'http://127.0.0.1:3002'
            && ['https://evil.example', 'http://localhost', 'http://localhost:3002/', 'http://www.waypointvtt.com', 'https://localhost:3002', 'http://localhost.evil.example:3002'].every(o => A.siteBase({ WAYPOINT_SITE: o }) === A.SITE));
        check('the routes are the page\'s own five, and what an account keeps is the profile pack\'s four stores, never wp_hostId',
            J(A.ACCOUNT_ROUTES) === J(['/api/account', '/api/account/link', '/api/account/poll', '/api/account/prefs', '/api/account/adopt']) && J(A.PREF_KEYS) === J(['wp_profile', 'wp_tableKeys', 'wp_gmPins', 'wp_gmRooms']));
        const cp = A.cleanPrefs({ updated: 12.7, prefs: { wp_profile: '{"id":"p_a"}', wp_hostId: 'u_x', wp_theme: 'dark', wp_tableKeys: 5, __proto__: { wp_gmPins: 'x' } } });
        check('cleanPrefs keeps only the four stores as strings, a whole positive time, and nothing a prototype holds; cleanAccount keeps a mail, a player id by its pattern, played only as true and a colour as #rrggbb',
            J(cp) === J({ updated: 12, prefs: { wp_profile: '{"id":"p_a"}' } }) && A.cleanPrefs(null) === null && A.cleanPrefs({ prefs: 'x' }) === null
            && J(A.cleanAccount({ email: 'a@b.test\u0000', playerId: 'p_a', played: 'yes', colour: '#ABCDEF', key: KEY })) === J({ email: 'a@b.test', playerId: 'p_a', played: false, colour: '#abcdef' })
            && J(A.cleanAccount({ playerId: '<x>' })) === J({ email: '', playerId: '', played: false }));

        const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-acct-')), file = path.join(saves, 'account.json'), S = siteStub(), logs = [];
        let clock = 1000000; const now = () => clock;
        const h = A.makeHandler({ savesDir: saves, base: 'http://localhost:3002', version: '1.6.0', fetch: S.fetch, now, readBody, bodyCap: 65536, log: s => logs.push(s) });
        S.answer['POST /api/link/start'] = { status: 200, json: { deviceCode: 'D'.repeat(43), userCode: 'BCDF-GH23', url: 'https://elsewhere.example/phish', interval: 1, expiresIn: 600 } };
        const st = await call(h, 'POST', '/api/account/link', { name: 'Kael\u0007 Waypoint' + 'x'.repeat(80) });
        check('link: the site is asked to start with the name cut to 60 and this app\'s version, and the page is given the code and a page address built here from the site and the code (never the site\'s own address), with an interval of 5 at least',
            st.status === 200 && J(st.json) === J({ userCode: 'BCDF-GH23', url: 'http://localhost:3002/link?code=BCDF-GH23', interval: 5, expiresIn: 600 }) && S.calls[0].p === '/api/link/start' && S.calls[0].body.version === '1.6.0'
            && S.calls[0].body.name.length === 60 && !/\u0007/.test(S.calls[0].body.name) && S.calls[0].redirect === 'error' && !st.text.includes('DDDD'), J([st, S.calls[0]]));
        const pend = await call(h, 'GET', '/api/account');
        S.answer['POST /api/link/poll'] = { status: 200, json: { state: 'pending' } };
        const p0 = await call(h, 'POST', '/api/account/poll'), n0 = S.calls.length, p0b = await call(h, 'POST', '/api/account/poll');
        check('while it waits: the account reads not linked with the waiting code; the first poll reaches the site and one sooner than 2.6 s after it does not',
            J(pend.json) === J({ linked: false, pending: { userCode: 'BCDF-GH23', url: 'http://localhost:3002/link?code=BCDF-GH23' } }) && p0.json.state === 'pending' && n0 === 2 && p0b.json.state === 'pending' && S.calls.length === 2, J([pend.json, S.calls.length]));
        const S2 = siteStub(), h2 = A.makeHandler({ savesDir: saves, base: 'http://localhost:3002', version: '1.6.0', fetch: S2.fetch, now, readBody, bodyCap: 65536, log: () => {} });
        S2.answer['POST /api/link/start'] = S.answer['POST /api/link/start']; await call(h2, 'POST', '/api/account/link', {});
        const w0 = await call(h2, 'GET', '/api/account'), stop = await call(h2, 'DELETE', '/api/account/link'), w1 = await call(h2, 'GET', '/api/account'), w2 = await call(h2, 'POST', '/api/account/poll'), stop2 = await call(h2, 'DELETE', '/api/account/link');
        check('Stop (DELETE /api/account/link) ends the wait on this computer\'s server: the account then reads not linked with no code waiting, a poll finds none and asks the site nothing, and a second Stop is answered as well (found live: the wait was taken up again)',
            !!w0.json.pending && J(stop.json) === J({ ok: true }) && J(w1.json) === J({ linked: false }) && J(w2.json) === J({ state: 'none' }) && J(stop2.json) === J({ ok: true }) && S2.calls.length === 1 && !fs.existsSync(file), J([w0.json, stop, w1.json, w2.json, S2.calls.length]));
        clock += 3000; const p1 = await call(h, 'POST', '/api/account/poll');
        S.answer['POST /api/link/poll'] = { status: 200, json: { state: 'approved', key: KEY, keyId: 'k1' } }; clock += 3000;
        const p2 = await call(h, 'POST', '/api/account/poll'), kept = JSON.parse(fs.readFileSync(file, 'utf8'));
        check('poll: the site is asked with the device code; approved, the key is kept in saves/account.json and never handed to the page, and the wait is over',
            p1.json.state === 'pending' && S.calls[2].body.deviceCode === 'D'.repeat(43) && J(p2.json) === J({ state: 'approved' }) && !p2.text.includes('wpk_') && kept.key === KEY && kept.keyId === 'k1'
            && J((await call(h, 'POST', '/api/account/poll')).json) === J({ state: 'none' }), J([p1.json, p2, kept]));
        S.answer['GET /api/install/account'] = { status: 200, json: { email: 'kael@example.test', playerId: 'p_kael', played: false, colour: '#5976cf', key: 'leak' } };
        const ac = await call(h, 'GET', '/api/account'), acCall = S.calls[S.calls.length - 1];
        check('the account: asked with the key as a bearer and answered with the cleaned fields alone, nothing of the key',
            J(ac.json) === J({ linked: true, email: 'kael@example.test', playerId: 'p_kael', played: false, colour: '#5976cf' }) && acCall.auth === 'Bearer ' + KEY && !ac.text.includes('wpk_') && !ac.text.includes('leak'), J([ac, acCall]));
        S.answer['POST /api/install/adopt'] = { status: 409, json: { error: 'played' } };
        const ad = await call(h, 'POST', '/api/account/adopt', { updated: 5, prefs: { wp_profile: '{"id":"p_a"}', wp_hostId: 'u_x' } }), adCall = S.calls[S.calls.length - 1];
        S.answer['POST /api/install/prefs'] = { status: 204 };
        const sy = await call(h, 'POST', '/api/account/prefs', { updated: 6, prefs: { wp_tableKeys: '{}' } });
        S.answer['GET /api/install/prefs'] = { status: 200, json: { updated: 9, prefs: { wp_profile: '{"id":"p_kael"}', wp_hostId: 'u_site', other: 'x' } } };
        const gp = await call(h, 'GET', '/api/account/prefs');
        check('adopt\'s 409 is played; a sync is sent cleaned and answered ok; the account\'s copy comes back as the four stores alone: wp_hostId never goes to the site nor comes from it',
            ad.status === 409 && ad.json.error === 'played' && J(adCall.body) === J({ updated: 5, prefs: { wp_profile: '{"id":"p_a"}' } }) && J(sy.json) === J({ ok: true }) && J(gp.json) === J({ updated: 9, prefs: { wp_profile: '{"id":"p_kael"}' } }), J([ad, adCall.body, sy, gp]));
        S.answer['GET /api/install/account'] = { throw: true };
        const off = await call(h, 'GET', '/api/account');
        S.answer['GET /api/install/account'] = { status: 401, json: { error: 'unlinked' } };
        const g401 = await call(h, 'GET', '/api/account');
        check('a site that cannot be reached leaves the link as it is (offline); a key the site no longer knows (401) is let go here: the file goes',
            J(off.json) === J({ linked: true, offline: true }) && fs.existsSync(path.join(saves, 'account.json')) === false && J(g401.json) === J({ linked: false, gone: true }), J([off.json, g401.json]));
        fs.writeFileSync(file, J({ key: KEY })); S.answer['DELETE /api/install'] = { throw: true };
        const del = await call(h, 'DELETE', '/api/account');
        check('unlink: the site is told where it can be, and this computer is unlinked whether or not it could be; a route asked with no key is refused, never sent with none',
            J(del.json) === J({ ok: true }) && !fs.existsSync(file) && (await call(h, 'GET', '/api/account/prefs')).status === 409 && (await call(h, 'POST', '/api/account/adopt', { prefs: {} })).status === 409, J(del));
        S.answer['POST /api/link/start'] = { status: 200, json: { deviceCode: 'short', userCode: 'AAAA-AAAA' } };
        const bad = await call(h, 'POST', '/api/account/link', {}); S.answer['POST /api/link/start'] = { status: 429 };
        const slow = await call(h, 'POST', '/api/account/link', {});
        check('a start the site answers with a code that is no code is refused (502), and one it refuses as too many is said as slow (429)', bad.status === 502 && slow.status === 429 && slow.json.error === 'slow', J([bad, slow]));
        check('every call went to the one site, each refusing a redirect', S.calls.every(c => c.base === 'http://localhost:3002' && c.redirect === 'error'), J(S.calls.map(c => c.base)));
        try { fs.rmSync(saves, { recursive: true, force: true }); } catch (e) {}
    }

    /* ---- both servers route the account alike, and only the shell's own module talks to the site ---- */
    {
        const main = fs.readFileSync(path.join(ROOT, 'system', 'resources', 'app', 'main.js'), 'utf8'), dev = fs.readFileSync(path.join(ROOT, 'tools', 'dev-server.js'), 'utf8');
        const appDir = path.join(ROOT, 'system', 'app', 'scripts'), pageNamesSite = fs.readdirSync(appDir).filter(f => /\.js$/.test(f)).filter(f => /waypointvtt\.com/.test(fs.readFileSync(path.join(appDir, f), 'utf8')));
        check('both servers hand the five routes to account.js\'s handler, made with the site\'s address from siteBase, and no page script names the site (the page asks its own server alone)',
            /if \(account\.ACCOUNT_ROUTES\.includes\(url\.pathname\)\) \{ accountHandler\(req, res, url\); return; \}/.test(main) && /if \(account\.ACCOUNT_ROUTES\.includes\(url\.pathname\)\) \{ accountHandler\(req, res, url\); return; \}/.test(dev)
            && /account\.makeHandler\(\{ savesDir, base: account\.siteBase\(process\.env\)/.test(main) && /account\.makeHandler\(\{ savesDir, base: account\.siteBase\(process\.env\)/.test(dev) && pageNamesSite.length === 0, J(pageNamesSite));
    }

    /* ---- settings.js's account slice, run for real on a page of plain objects ---- */
    {
        const sSrc = fs.readFileSync(path.join(ROOT, 'system', 'app', 'scripts', 'settings.js'), 'utf8').replace(/\r\n/g, '\n');
        const pc0 = sSrc.indexOf('// [settings:profcarry-start]'), pc1 = sSrc.indexOf('profWire();\n// [settings:profcarry-end]');
        const a0 = sSrc.indexOf('// [settings:account-start]'), a1 = sSrc.indexOf('acctWire();\n// [settings:account-end]');
        const PC = await import('file:///' + path.join(ROOT, 'system', 'app', 'scripts', 'profilecore.js').replace(/\\/g, '/'));
        const run = (o) => {
            const store = new Map(Object.entries(o.local || {})), ls = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => [...store.keys()][i] };
            const calls = [], toasts = [], asked = [], els = {};
            const el = id => els[id] || (els[id] = { id, hidden: false, textContent: '' });
            const answers = o.answers || {};
            const fetchS = (p, op) => { const m = (op && op.method) || 'GET', key = m + ' ' + p; calls.push(key + (op && op.body ? ' ' + op.body : '')); const a = answers[key]; const r = typeof a === 'function' ? a(op && op.body ? JSON.parse(op.body) : null) : a || { status: 200, json: {} }; return Promise.resolve({ status: r.status, json: () => Promise.resolve(r.json || {}) }); };
            const dialogs = { showConfirm: (q, cb, opts) => { asked.push({ q, opts }); setTimeout(() => cb(o.pick), 0); } };
            const win = { wpProfileCore: PC.default || PC, wpNet: { active: false, hostId: () => 'u_mine' } };
            const body = sSrc.slice(pc0, pc1).replace('function profWire() {', 'function profWireOff() {') + '\n' + sSrc.slice(a0, a1).replace(/import\('\.\/dialogs\.js'\)/g, 'Promise.resolve(DIALOGS)') + '\nreturn { acctDecide: acctDecide, ACCT: ACCT, acctPlayed: acctPlayed, acctRefresh: acctRefresh, acctStop: typeof acctStop === "function" ? acctStop : null, acctStopPoll: acctStopPoll };';
            const api = new Function('window', 'localStorage', 'fetch', 'ui', 'toast', 'DIALOGS', 'location', 'syncPanel', "'use strict';\n" + body)(win, ls, fetchS, el, t => toasts.push(t), dialogs, { search: '' }, () => {});
            return { api, calls, toasts, asked, store, els };
        };
        const PROF = J({ id: 'p_here', name: 'Kael' }), acct = (played) => ({ status: 200, json: { linked: true, email: 'k@example.test', playerId: 'p_acct', played } });
        const settle = () => new Promise(r => setTimeout(r, 30));
        // 0: Stop ends the wait (found live: the next read of the account took the server's wait up again)
        {
            const waiting = { status: 200, json: { linked: false, pending: { userCode: 'BCDF-GH23', url: 'http://localhost:3002/link?code=BCDF-GH23' } } };
            const r0 = run({ local: { wp_profile: PROF }, answers: { 'GET /api/account': waiting, 'DELETE /api/account/link': { status: 404, json: { error: 'not found' } } } });   // a server older than this page: it keeps its wait
            await r0.api.acctRefresh(); const before = !!r0.api.ACCT.poll;
            if (r0.api.acctStop) await r0.api.acctStop(); await settle();
            const after = !!r0.api.ACCT.poll, lineAfter = r0.els.setAcctLine.textContent, codeHidden = r0.els.setAcctCode.hidden, linkShown = r0.els.setAcctLinkBtn.hidden === false;
            await r0.api.acctRefresh(); const again = !!r0.api.ACCT.poll; r0.api.acctStopPoll();
            check('Stop ends the wait: the page stops asking, tells its server to end the wait (DELETE /api/account/link), and draws Link to my account again; a server that still holds the wait for that code (one older than the page) does not start it again at the next read',
                before === true && !!r0.api.acctStop && after === false && again === false && r0.calls.includes('DELETE /api/account/link') && codeHidden === true && linkShown && /^Link this computer/.test(lineAfter), J([before, after, again, r0.calls, lineAfter]));
        }
        // 1: an account that played nowhere adopts this computer's player, and nothing is sent before the account is read
        const r1 = run({ local: { wp_profile: PROF }, answers: { 'GET /api/account': acct(false), 'POST /api/account/adopt': b => ({ status: 200, json: { updated: 77, prefs: Object.assign({}, b.prefs, { wp_profile: J({ id: 'p_here', name: 'Kael', color: '#5976cf' }) }) } }) } });
        await r1.api.acctDecide(); await settle();
        check('linked to an account that has played nowhere: the account is read first, then this computer\'s player is adopted, and what the site added to it (a colour) is taken; nothing is synced before the account was read',
            r1.calls[0] === 'GET /api/account' && /^POST \/api\/account\/adopt /.test(r1.calls[1]) && !r1.calls.some(c => /^POST \/api\/account\/prefs/.test(c)) && JSON.parse(r1.store.get('wp_profile')).color === '#5976cf' && r1.store.get('wp_acctStamp') === '77', J([r1.calls, [...r1.store]]));
        // 2: an account that has played takes over a computer that has played nowhere, joining the table keys, and only then syncs
        const ACC = { updated: 88, prefs: { wp_profile: J({ id: 'p_acct', name: 'Kael Renn' }), wp_tableKeys: J({ g_one: 'a'.repeat(32) }) } };
        const r2 = run({ local: { wp_profile: PROF, wp_hostId: 'u_mine' }, answers: { 'GET /api/account': acct(true), 'GET /api/account/prefs': { status: 200, json: ACC }, 'POST /api/account/prefs': { status: 200, json: { ok: true } } } });
        await r2.api.acctDecide(); await settle(); await settle();
        check('linked to an account that has played, from a computer that has played nowhere: no question, the account\'s player taken (the id and the table keys the account\'s), the host id left this computer\'s own, and the first sync only after that',
            r2.asked.length === 0 && JSON.parse(r2.store.get('wp_profile')).id === 'p_acct' && JSON.parse(r2.store.get('wp_tableKeys')).g_one === 'a'.repeat(32) && r2.store.get('wp_hostId') === 'u_mine'
            && r2.calls.indexOf('GET /api/account/prefs') < r2.calls.findIndex(c => /^POST \/api\/account\/prefs/.test(c)) && !r2.calls.some(c => /adopt/.test(c)), J([r2.calls, [...r2.store]]));
        // 3: both have played: asked with Enter answering neither; keeping this computer's player unlinks it
        const r3 = run({ pick: 'alt', local: { wp_profile: PROF, wp_tableKeys: J({ g_mine: 'b'.repeat(32) }) }, answers: { 'GET /api/account': acct(true), 'DELETE /api/account': { status: 200, json: { ok: true } } } });
        await r3.api.acctDecide(); await settle(); await settle();
        check('both have played: asked once, Enter answering neither, its two answers your account\'s player and this computer\'s; keeping this computer\'s unlinks it and leaves the profile as it was',
            r3.asked.length === 1 && r3.asked[0].opts.noEnter === true && /account’s player/.test(r3.asked[0].opts.yes) && /this computer’s player/.test(r3.asked[0].opts.alt) && r3.calls.includes('DELETE /api/account') && r3.store.get('wp_profile') === PROF, J([r3.calls, r3.asked]));
        const r4 = run({ pick: true, local: { wp_profile: PROF, wp_tableKeys: J({ g_mine: 'b'.repeat(32) }) }, answers: { 'GET /api/account': acct(true), 'GET /api/account/prefs': { status: 200, json: ACC }, 'POST /api/account/prefs': { status: 200, json: { ok: true } } } });
        await r4.api.acctDecide(); await settle(); await settle();
        const keys4 = JSON.parse(r4.store.get('wp_tableKeys'));
        check('both have played and your account\'s player is picked: taken, with the account\'s table keys alone (a key proves only the id it was made for, profilecore openWrites: tables that knew this computer ask the GM once), then synced',
            JSON.parse(r4.store.get('wp_profile')).id === 'p_acct' && !('g_mine' in keys4) && keys4.g_one === 'a'.repeat(32) && r4.calls.some(c => /^POST \/api\/account\/prefs/.test(c)) && !r4.calls.includes('DELETE /api/account'), J([r4.calls, keys4]));
        // an adopt the site answers played (another computer linked meanwhile) goes the played way
        const r5 = run({ local: { wp_profile: PROF }, answers: { 'GET /api/account': acct(false), 'POST /api/account/adopt': { status: 409, json: { error: 'played' } }, 'GET /api/account/prefs': { status: 200, json: ACC }, 'POST /api/account/prefs': { status: 200, json: { ok: true } } } });
        await r5.api.acctDecide(); await settle(); await settle();
        check('an adopt the site answers played goes the played way (here: this computer has played nowhere, so the account\'s player is taken)', JSON.parse(r5.store.get('wp_profile')).id === 'p_acct' && r5.asked.length === 0, J(r5.calls));
        check('the slice\'s words for the page: Help and both release notes say how to link, and the Settings block\'s controls are in the page once each',
            ['setAcctLine', 'setAcctCode', 'setAcctCodeText', 'setAcctLinkBtn', 'setAcctOpenBtn', 'setAcctStopBtn', 'setAcctUnlinkBtn'].every(id => (fs.readFileSync(path.join(ROOT, 'system', 'app', 'index.html'), 'utf8').split(' id="' + id + '"').length - 1) === 1)
            && /Link to my account/.test(fs.readFileSync(path.join(ROOT, 'WHATSNEW.txt'), 'utf8')) && /Link to my account/.test(fs.readFileSync(path.join(ROOT, 'system', 'app', 'assets', 'whatsnew.txt'), 'utf8'))
            && /<b>Link to my account<\/b>/.test(fs.readFileSync(path.join(ROOT, 'system', 'app', 'index.html'), 'utf8')));
    }
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) console.log('FAIL      a check was left waiting'); });
