// profilecheck — a player's profile carried to another computer (1.6.0; the owner, 2026-10-29: "if we need to have a hardened profile section so the
// app can know who is who each time, we should", and by prompt "Both", a file and a code). profilecore.js imported and run: what a pack holds and
// never holds, its cleaner against hostile input, the file and the code both ways, what opening one writes; and settings.js's four buttons pinned.
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
    check('Settings ▸ Profile holds the four buttons and the file picker once each, in the Profile group, each saying what it does in its tooltip, with a grey line that says to keep the file and the code private and that your own table stays as it is',
        ids.every(id => ix.split('id="' + id + '"').length === 2) && ix.indexOf('id="setProfSaveBtn"') > ix.indexOf('data-group="profile"') && ix.indexOf('id="setProfSaveBtn"') < ix.indexOf('data-group="appearance"')
        && ix.includes('Keep the file and the code private: they let someone join as you. Your own table, if you host one, stays as it is.'), ids.map(id => ix.split('id="' + id + '"').length));
    check('the wiring: settings.js imports the module; nothing changes during a table; opening asks first with the buttons alone; the host id is made from the profile here before anything is written; each write goes through openWrites; the settings file follows; every step logs as profile v1; the core reads no storage and no page',
        st.includes("import './profilecore.js';") && sl.includes("if (n && (n.active || n.foreign))") && sl.includes("{ noEnter: true, yes: 'Open it' }") && sl.indexOf('window.wpNet.hostId();') > 0 && sl.indexOf('window.wpNet.hostId();') < sl.indexOf('PC.openWrites(')
        && sl.includes('window.wpPrefsPush()') && (sl.match(/profStep\('/g) || []).length >= 10 && !/localStorage|document|window\.(?!wpProfileCore)/.test(core.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')), '');
    check('Help says it in its own entry, and both release notes', ix.includes('<li><b>Your profile on another computer</b>: in <b>Settings &#9656; Profile</b>, <b>Save my profile</b> makes a file')
        && read('assets/whatsnew.txt').replace(/\r\n/g, NL).includes('Take your profile to another computer') && fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, NL).includes('Take your profile to another computer') && nj.includes('function hostId() {'), '');
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})().catch(e => { console.log('FAIL      profilecheck threw: ' + (e && e.stack || e)); process.exitCode = 1; summed = true; });
process.on('exit', () => { if (!summed) { console.log('FAIL      profilecheck: a check never finished'); process.exitCode = 1; } });
