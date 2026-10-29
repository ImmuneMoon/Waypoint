// profilecheck — a player's profile carried to another computer (1.6.0; the owner, 2026-10-29: "if we need to have a hardened profile section so the
// app can know who is who each time, we should", and by prompt "Both", a file and a code). profilecore.js imported and run: what a pack holds and
// never holds, its cleaner against hostile input, the file and the code both ways, what opening one writes; and settings.js's four buttons pinned.
// 1.6.0, the Profile window (the owner: "a dedicated profile section in waypoint thats easy to get to"): the list of the tables that know you
// (profilecore tablesOf, run), the small record net.js keeps at a snapshot (run), the window's wiring and its words.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); } }
const J = JSON.stringify, NL = '\n';
const app = p => path.join(__dirname, '..', 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL);
(async () => {
    const P = await import(url.pathToFileURL(app('scripts/profilecore.js')).href);
    const avatarOk = v => typeof v === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v), faceClean = v => (v === 'emoji:x' ? v : '');
    const rules = { avatarOk, faceClean };
    const pin = c => ({ kty: 'EC', crv: 'P-256', x: c.repeat(43), y: 'B'.repeat(43) });
    const store = {
        wp_profile: J({ id: 'u_kael01', name: 'Kael\u0007 of the Reeds', color: '#a1b2c3', avatar: 'data:image/png;base64,AAAA', face: 'emoji:x', extra: 1 }),
        wp_tableKeys: J({ u_gm1: '0123456789abcdef0123456789abcdef', u_gm2: 'not a key', __proto__x: 'ffff' }),
        wp_gmPins: J({ u_gm1: Object.assign(pin('A'), { d: 'secret' }), u_gm2: { kty: 'RSA' } }),
        wp_gmRooms: J({ c_abcde12345: 'u_gm1', bad: 'u_gm1' }),
        wp_hostId: 'u_host', wp_gmSign: J({ priv: { d: 'x' } })
    };
    const pk = P.packOf(store, rules, 1700000000000);
    check('a pack from this computer\'s stores: the profile by whitelist (its id, its name with control characters taken out, its colour, its picture and token face only by the app\'s own rules), the table keys that are keys, the GMs\' pins as their four public fields alone, the room codes as the app keeps them; never the host id or the GM\'s signing key',
        pk && pk.kind === 'waypoint-profile' && pk.v === 1 && pk.at === 1700000000000 && J(pk.profile) === J({ id: 'u_kael01', name: 'Kael of the Reeds', color: '#a1b2c3', avatar: 'data:image/png;base64,AAAA', face: 'emoji:x' })
        && J(pk.tableKeys) === J({ u_gm1: '0123456789abcdef0123456789abcdef' }) && J(pk.gmPins) === J({ u_gm1: pin('A') }) && J(pk.gmRooms) === J({ c_abcde12345: 'u_gm1' })
        && J(Object.keys(pk)) === J(['kind', 'v', 'at', 'profile', 'tableKeys', 'gmPins', 'gmRooms']) && !J(pk).includes('u_host') && !J(pk).includes('secret') && !J(pk).includes('"d"'), J(pk));
    const noRules = P.packOf(store, null, 1);
    check('with no rules for a picture or a token face handed in, neither is kept', noRules && !('avatar' in noRules.profile) && !('face' in noRules.profile), J(noRules && noRules.profile));
    const bad = [P.packOf({}, rules), P.packOf({ wp_profile: '{' }, rules), P.packOf({ wp_profile: J({ id: '__proto__' }) }, rules), P.packOf({ wp_profile: J({ id: 'a b' }) }, rules), P.packOf({ wp_profile: J({ name: 'x' }) }, rules),
        P.cleanPack(Object.assign({}, pk, { kind: 'other' }), rules), P.cleanPack(Object.assign({}, pk, { v: 2 }), rules), P.cleanPack(null), P.cleanPack([]), P.cleanPack('x')];
    check('no pack: no profile, one that is no JSON, an id a prototype holds or that is no id, no id at all, another kind, another version, junk', bad.every(b => b === null), J(bad));
    const many = {}; for (let i = 0; i < 60; i++) many['u_g' + i] = (i % 16).toString(16).repeat(32);
    const capped = P.cleanPack(Object.assign({}, pk, { tableKeys: many }), rules);
    check('at most 50 table keys, the newest (the last) kept', Object.keys(capped.tableKeys).length === 50 && !('u_g9' in capped.tableKeys) && ('u_g10' in capped.tableKeys) && ('u_g59' in capped.tableKeys), Object.keys(capped.tableKeys).length);
    // the file and the code both ways
    const ft = P.fileText(pk), back = P.fromFile(ft, rules), code = P.codeOf(pk), spaced = code.slice(0, 20) + '\n  ' + code.slice(20, 50) + ' ' + code.slice(50), fromC = P.fromCode(spaced, rules);
    check('the file and the code read back as the very pack, the code through the line breaks and spaces a message may put in it, starting WPP1. and holding letters, digits, - and _ alone',
        J(back) === J(pk) && J(fromC) === J(pk) && code.indexOf('WPP1.') === 0 && /^WPP1\.[A-Za-z0-9_-]+$/.test(code), J([back, fromC && fromC.profile]));
    const uni = P.packOf({ wp_profile: J({ id: 'u_x', name: 'Ærin 🐉' }) }, rules), uniBack = P.fromCode(P.codeOf(uni), rules);
    check('a name of any characters travels in the code whole', uniBack && uniBack.profile.name === 'Ærin 🐉', J(uniBack));
    const nos = [P.fromCode('', rules), P.fromCode('WPP2.abc', rules), P.fromCode('WPP1.***', rules), P.fromCode('WPP1.' + Buffer.from('{"kind":"waypoint-profile"').toString('base64url'), rules), P.fromCode('WPP1.' + Buffer.from([0xff, 0xfe, 0x00]).toString('base64url'), rules),
        P.fromCode(null), P.fromCode('x'.repeat(500000)), P.fromFile('not json', rules), P.fromFile(J({ kind: 'waypoint-profile', v: 1, profile: { id: 'u_ok' }, tableKeys: { u_gm: 'zz' } }), rules)];
    check('a code or a file that is none reads as no pack (another head, characters a code never holds, a pack cut short, bytes that are no UTF-8, nothing, too long, no JSON); a file with only a profile is a pack with no keys',
        nos.slice(0, 8).every(x => x === null) && nos[8] && J(nos[8].tableKeys) === '{}' && nos[8].profile.id === 'u_ok', J(nos.map(x => x && x.profile)));
    // what opening a pack writes
    const local = { wp_profile: J({ id: 'u_old', name: 'Old' }), wp_tableKeys: J({ u_gmOld: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }), wp_gmPins: J({ u_gm1: pin('C'), u_gm9: pin('D') }), wp_gmRooms: J({ c_zzzzz11111: 'u_gm9', c_abcde12345: 'u_gmX' }) };
    const w = P.openWrites(local, pk);
    check('opening a pack writes the profile and the table keys as the pack\'s whole (a key proves the pack\'s id and no other), and joins what this app knows of GMs with this computer\'s own answer kept where the two differ; it writes those four stores and nothing else (the host id and the signing key untouched)',
        J(Object.keys(w)) === J(['wp_profile', 'wp_tableKeys', 'wp_gmPins', 'wp_gmRooms']) && JSON.parse(w.wp_profile).id === 'u_kael01' && J(JSON.parse(w.wp_tableKeys)) === J(pk.tableKeys)
        && J(JSON.parse(w.wp_gmPins)) === J({ u_gm1: pin('C'), u_gm9: pin('D') }) && J(JSON.parse(w.wp_gmRooms)) === J({ c_zzzzz11111: 'u_gm9', c_abcde12345: 'u_gmX' }), J(w));
    const w2 = P.openWrites({ wp_gmPins: 'not json', wp_gmRooms: J({ c_bad_: 'u_y', c_good1: '__proto__' }) }, pk);
    check('a store here that is no JSON or holds what is no pin or room takes the pack\'s', J(JSON.parse(w2.wp_gmPins)) === J(pk.gmPins) && J(JSON.parse(w2.wp_gmRooms)) === J(pk.gmRooms), J(w2));
    check('the words of a question name the pack\'s player and how many tables know them', P.packWords(pk) === 'Kael of the Reeds, known at 1 table' && P.packWords(nos[8]) === 'A player with no name, known at 0 tables' && P.packWords(null) === '', P.packWords(pk));
    // the page and the wiring
    const ix = read('index.html'), st = read('scripts/settings.js'), core = read('scripts/profilecore.js'), nj = read('scripts/net.js');
    const sl = st.slice(st.indexOf('// [settings:profcarry-start]'), st.indexOf('// [settings:profcarry-end]'));
    const ids = ['setProfSaveBtn', 'setProfOpenBtn', 'setProfCopyBtn', 'setProfPasteBtn', 'setProfFile'];
    const pw = ix.slice(ix.indexOf('<div id="profileModal"'), ix.indexOf('<div id="settingsModal"'));
    check('the Profile window holds the four buttons and the file picker once each in the page (in Settings\' Profile group until 1.6.0\'s Profile window, moved on purpose), each saying what it does in its tooltip, with a grey line that says to keep the file and the code private and that your own table stays as it is',
        ids.every(id => ix.split('id="' + id + '"').length === 2 && pw.includes('id="' + id + '"')) && pw.length > 3000 && ids.every(id => new RegExp('id="' + id + '"[^>]* title="[^"]{30,}"').test(pw))
        && ix.includes('Keep the file and the code private: they let someone join as you. Your own table, if you host one, stays as it is.'), ids.map(id => ix.split('id="' + id + '"').length));
    check('the wiring: settings.js imports the module; nothing changes during a table; opening asks first with the buttons alone; the host id is made from the profile here before anything is written; each write goes through openWrites; the settings file follows; every step logs as profile v1; the core reads no storage and no page',
        st.includes("import './profilecore.js';") && sl.includes("if (n && (n.active || n.foreign))") && sl.includes("{ noEnter: true, yes: 'Open it' }") && sl.indexOf('window.wpNet.hostId();') > 0 && sl.indexOf('window.wpNet.hostId();') < sl.indexOf('PC.openWrites(')
        && sl.includes('window.wpPrefsPush()') && (sl.match(/profStep\('/g) || []).length >= 10 && !/localStorage|document|window\.(?!wpProfileCore)/.test(core.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')), '');
    check('Help says it in its own entry, and both release notes', ix.includes('<li><b>Your profile on another computer</b>: in <b>Your profile</b>, <b>Save my profile</b> makes a file')
        && read('assets/whatsnew.txt').replace(/\r\n/g, NL).includes('Take your profile to another computer') && fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, NL).includes('Take your profile to another computer') && nj.includes('function hostId() {'), '');
    // ---- 1.6.0: the tables that know you (profilecore tablesOf, run) ----
    const keysT = J({ u_a: 'a'.repeat(32), u_b: 'b'.repeat(32), u_c: 'c'.repeat(32), u_bad: 'not a key', 'x y': 'd'.repeat(32) });
    const seenT = J({ u_a: { gm: 'Mara\u0007 <b>x</b>', campaign: 'Reach\u202e', at: 2000 }, u_c: { gm: '', campaign: 'Coast', at: 5000 }, u_z: { gm: 'Gone', at: 9 }, u_b: { gm: 7, at: 'soon' } });
    const rowsT = P.tablesOf({ wp_tableKeys: keysT, wp_tablesSeen: seenT }, { u_b: { gm: 'Tobias', campaign: 'Drowned' }, u_c: { gm: 'From the Journal', campaign: 'Not this' } });
    check('the tables that know you: one row a GM whose table gave this player a key, the newest joined first; a name and a campaign from the record, else the Journal\'s; a name is plain text, cut, with what is no text put away; a time that is no time is none; a GM the record keeps whose key is gone, a key that is none and an id that is none are not listed',
        J(rowsT) === J([{ gm: 'From the Journal', campaign: 'Coast', at: 5000 }, { gm: 'Mara <b>x</b>', campaign: 'Reach', at: 2000 }, { gm: 'Tobias', campaign: 'Drowned', at: 0 }]), rowsT);
    const T2 = P.tablesOf({ wp_tableKeys: J({ u_p: 'e'.repeat(32), u_q: 'f'.repeat(32) }) }, { u_p: { gm: 'P' }, u_q: { gm: 'Q' } });
    const many60 = {}; for (let i = 0; i < 60; i++) many60['u_' + i] = 'a'.repeat(32);
    const T3 = P.tablesOf({ wp_tableKeys: J(many60) }, null);
    check('with no time known, the newest key first; never past fifty; nothing, garbage and a store that is no object answer no row; a row holds a name, a campaign and a time and never a key or an id',
        J(T2.map(r => r.gm)) === J(['Q', 'P']) && T3.length === 50 && P.tablesOf(null).length === 0 && P.tablesOf({ wp_tableKeys: 'not json', wp_tablesSeen: '[]' }).length === 0 && P.tablesOf({ wp_tableKeys: '[1,2]' }).length === 0
        && rowsT.concat(T2, T3).every(r => J(Object.keys(r)) === J(['gm', 'campaign', 'at'])) && !/u_[abc]|aaaa|bbbb|cccc/.test(J(rowsT)), J([T2, T3.length]));
    // ---- the small record at a snapshot (net.js tablesSeen and rememberTableSeen, run on a store of their own) ----
    const r0 = nj.indexOf('function tablesSeen() {'), r1 = nj.indexOf('// The key is PROVEN', r0), mem = new Map();
    const LS = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } };
    const vId = id => typeof id === 'string' && id.length >= 1 && id.length <= 80 && /^[A-Za-z0-9_.:-]+$/.test(id) && !(id in Object.prototype);
    const R = r0 > 0 && r1 > r0 ? new Function('localStorage', 'validProfileId', 'TABLE_KEYS_MAX', 'Date', nj.slice(r0, r1) + '\nreturn { seen: tablesSeen, remember: rememberTableSeen };')(LS, vId, 3, { now: () => 1234 }) : null;
    let s1 = null, s2 = null;
    if (R) {
        R.remember('u_gm1', { gm: 'Mara\u202e<i>' + 'x'.repeat(80), campaign: 'Reach', text: 'the GM\'s notes', gmId: 'u_gm1', look: { bg: 'red' } }); s1 = JSON.parse(mem.get('wp_tablesSeen'));
        R.remember('__proto__', { gm: 'x' }); R.remember('u gm', { gm: 'x' }); R.remember('u_gm2', null); R.remember('u_gm3', { gm: 7, campaign: ['x'] }); R.remember('u_gm4', { gm: 'D' }); R.remember('u_gm1', { gm: 'Mara again' });
        s2 = JSON.parse(mem.get('wp_tablesSeen')); mem.set('wp_tablesSeen', '[1]');
    }
    check('the record at a snapshot (net.js): the GM\'s name and their campaign\'s, plain text cut to 60 and 120, and the time, nothing else of the notepad; an id that is none is not kept; the newest last and the oldest forgotten past the cap; a store that is no object is read as empty',
        !!R && J(s1) === J({ u_gm1: { gm: 'Mara <i>' + 'x'.repeat(52), campaign: 'Reach', at: 1234 } }) && J(Object.keys(s2)) === J(['u_gm3', 'u_gm4', 'u_gm1']) && J(s2.u_gm3) === J({ gm: '', campaign: '', at: 1234 }) && s2.u_gm1.gm === 'Mara again' && J(R.seen()) === '{}', J([s1, s2]));
    check('it is kept at the snapshot a table sends, after the key and before the campaign is drawn, and nowhere else; it is this computer\'s alone: no message names it, it is not in a profile pack or the account\'s stores',
        nj.includes('        // [netcheck:snapkey-end]\n        rememberTableSeen(net.gmId, msg.notepad);') && (nj.match(/rememberTableSeen\(/g) || []).length === 2 && (nj.match(/wp_tablesSeen/g) || []).length === 2
        && !core.includes('wp_tablesSeen\'') && st.includes("var PROF_STORES = ['wp_profile', 'wp_tableKeys', 'wp_gmPins', 'wp_gmRooms'];"), '');
    // ---- the window's wiring (settings.js profilewin) ----
    const pwS = st.slice(st.indexOf('// [settings:profilewin-start]'), st.indexOf('// [settings:profilewin-end]'));
    check('the window opens from your picture in the top row, the welcome\'s Your profile, Settings\' row and the quick jump, each logged as profile v1 with where from; the list is drawn on each opening and when the tables change, and asks the Journal for names it lacks; your picture follows every change of who you are (a write of the profile from anywhere, another window of this app), as do the welcome\'s Join boxes; nothing in it writes markup',
        pwS.length > 2000 && ["ui('rowMeBtn')", "ui('wcProfileBtn')", "ui('setProfileOpenBtn')", "ui('profileCloseBtn')"].every(t => pwS.includes(t)) && /profWinOpen\('row'\)[\s\S]*profWinOpen\('welcome'\)[\s\S]*profWinOpen\('settings'\)/.test(pwS)
        && pwS.includes("profStep('window-open', { from: typeof from === 'string' ? from : 'other' });") && pwS.includes("profStep('tables', ") && pwS.includes("profStep('tables-named', ") && pwS.includes('window.wpJournalGms(ids)')
        && pwS.includes("want = { wp_profile: 1, wp_tableKeys: 1, wp_tablesSeen: 1 }") && pwS.includes("window.addEventListener('storage'") && pwS.includes('window.wpOpenProfile = profWinOpen;') && !/innerHTML|insertAdjacentHTML|outerHTML/.test(pwS)
        && st.includes("['setAvatarPreview', 'netJoinAvatar', 'rowMeFace', 'wcProfFace', 'wcAvatarPrev'].forEach(function(id) {") && read('scripts/commands.js').includes("if (row.win === 'profile') { if (typeof window.wpOpenProfile === 'function') window.wpOpenProfile('jump'); }")
        && read('scripts/handbook.js').includes("'settingsModal', 'profileModal', 'helpModal'"), '');
    check('Help says where the profile is and what its list shows, the top row\'s part names your picture, and both release notes say it',
        ix.includes('<li><b>Your profile</b> has a window of its own. Your picture at the right end of the top row opens it.') && ix.includes('<li>The list is read from this computer alone. A table&rsquo;s key is never shown, and nothing is sent.</li>')
        && ix.includes('<li><b>Your picture:</b> your picture at the right end of the top row, beside Settings, opens your profile.') && ix.includes('It offers five things:')
        && [read('assets/whatsnew.txt'), fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8')].every(t => t.replace(/\r\n/g, NL).includes('- Your profile has a window of its own. Your picture at the right of the\n  top row opens it,')), '');
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})().catch(e => { console.log('FAIL      profilecheck threw: ' + (e && e.stack || e)); process.exitCode = 1; summed = true; });
process.on('exit', () => { if (!summed) { console.log('FAIL      profilecheck: a check never finished'); process.exitCode = 1; } });
