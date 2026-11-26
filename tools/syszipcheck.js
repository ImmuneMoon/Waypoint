/* Offline check of a system exported whole and read back (1.6.4; held over from the System editor review of 2026-11-21, built at Fulllion's
   pick of 2026-11-23). syszip.js run for real in Node with the real zip.js, librarycore.js, fogcore.js and sharecore.js: the pictures a
   system and its packs name (plain picture paths alone), a picture under a private tag left home, the plan and the archive it makes
   (manifest.json, system.wpsystem.json, packs/<n>.wppack.json, images/<path>), the archive read back (each entry through check(), under
   the import's budget; a campaign export, a wrong manifest, no system, a bad system, a pack that is no pack and a picture at no plain
   picture path each refused or left out and counted), the pictures written at Save (keep=1, never over a file already there, one already
   listed never sent, a damaged one never sent), the words said, and the step log. sysedtabs.js's editor slices run on stand-ins: Export
   with nothing more to carry writes the .wpsystem.json exactly as before and asks nothing; with a pack it asks Whole system or System alone;
   Import of a .wpsystem.json goes exactly as before, a .zip goes through readWhole and waits for Save; Save writes the pictures and then the
   packs by id. library.js starterPacks with byId merges into the pack of the file's own id. Every name and entry here is invented.
   Usage: node tools/syszipcheck.js   (exit 1 on any failure) */
'use strict';
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const kit = require('./checkkit');
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { check, pending, finish } = kit.suite('system');
const SCRIPTS = path.join(__dirname, '..', 'system', 'app', 'scripts');
const lf = (s) => s.replace(/\r\n/g, '\n');
const read = (f) => lf(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'));
function slice(src, name) { const a = src.indexOf('// [' + name + '-start]'), b = src.indexOf('// [' + name + '-end]'); if (a < 0 || b < a) throw new Error('no slice ' + name); return src.slice(a, b); }
const j = JSON.stringify;
const imp = (f) => import(pathToFileURL(path.join(SCRIPTS, f)).href);

pending.push((async function() {
    const Z = await imp('syszip.js'), ZIP = await imp('zip.js'), LC = await imp('librarycore.js'), SYS = await imp('systemcore.js'), FM = await imp('formula.js');
    const F = FM;

    /* ---- the pictures a system names ---- */
    const named = Z.picsNamed([
        j({ a: '/saves/images/gear/rope.png', b: '<img src="/saves/images/maps/hall.jpg">', c: '/saves/images/gear/rope.png' }),
        j({ walk: '/saves/images/../data.json', jr: '/saves/images/journal/x.png', vid: '/saves/images/video/clip.png', snd: '/saves/images/audio/a.png', esc: '/saves/images/a%2e.png', noext: '/saves/images/readme.txt', q: '/saves/images/a.png?x=1', dot: '/saves/images/a./b.png', deep: '/saves/images/x/y z/w.webp' }),
        null, 42]);
    check('the pictures named: each plain picture path once, in the order met, the quote or bracket a scan picks up taken off', j(named) === j(['/saves/images/gear/rope.png', '/saves/images/maps/hall.jpg', '/saves/images/x/y z/w.webp']), j(named));
    check('no path that walks, escapes, names the Journal, a video or a sound, asks a query or is no picture is ever named', !named.some(p => /\.\.|journal|video|audio|%2e|readme|\?|a\.\//.test(p)));
    const stores = [{ list: ['Secret', 'Open'], by: { '/saves/images/maps/hall.jpg': ['Secret'], '/saves/images/gear/rope.png': ['Open'] }, priv: { Secret: true } }, { list: ['Mine'], by: {} }];
    check('a picture under a private tag of either store stays home; none where no tag is private', j(Z.privatePics(named, stores)) === j(['/saves/images/maps/hall.jpg']) && j(Z.privatePics(named, [{ list: ['Open'], by: {} }])) === '[]' && j(Z.privatePics(named, null)) === '[]');
    check('a picture path and its entry name, and back: only a plain picture path lands', Z.picEntry('/saves/images/a/b.png') === 'images/a/b.png' && Z.entryPic('images/a/b.png') === '/saves/images/a/b.png'
        && ['images/../data.json', 'images/journal/a.png', 'images/JOURNAL/a.png', 'images/video/a.png', 'images/a%2e.png', 'images/a.exe', 'data.json', 'images/a /b.png', 'images//b.png', 'images\\a.png', 'images/a:b.png', '../images/a.png', 7].every(n => Z.entryPic(n) === ''));

    /* ---- a campaign to export from ---- */
    const sys = SYS.cleanSystem({ name: 'Tinker Tactics', fields: [{ id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, custom: true, cats: ['Gear'], stats: [{ key: 'wt', label: 'Weight' }] } }],
        items: [{ id: 'i_sword', key: 'Sword', name: 'Sword', category: 'Gear', pic: '/saves/images/items/sword.png' }] }, { F, gmView: true });
    const ent = (id, name, wt, pic) => { const e = { id, key: name.replace(/\s+/g, ''), name, category: 'Gear', stats: { wt } }; if (pic) e.pic = pic; return e; };
    const packsHeld = { p_gear: [ent('i_rope', 'Rope coil', 1, '/saves/images/gear/rope.png'), ent('i_lamp', 'Lamp', 2, '/saves/images/maps/hall.jpg')], p_tricks: [ent('i_fix', 'Quick fix', 0)] };
    const camp = { id: 'c1', system: sys, library: { dir: 'l_abcdefgh', packs: [{ id: 'p_gear', name: 'Tinker Gear', rev: 3, icon: '' }, { id: 'p_tricks', name: 'Tinker Tricks', rev: 1, vis: 'gm' }, { id: 'p_lost', name: 'Lost', rev: 1 }] }, imageCats: stores[1] };
    const lib = { ready: (id) => Object.prototype.hasOwnProperty.call(packsHeld, id), entriesOf: (id) => packsHeld[id] || [] };
    const files = { '/saves/images/items/sword.png': new Uint8Array([137, 80, 78, 71, 1, 2, 3]), '/saves/images/gear/rope.png': new Uint8Array([137, 80, 78, 71, 9, 9]) };
    const fetched = [];
    const srvFetch = async (u, o) => { fetched.push(u); const p = decodeURI(u), b = files[p]; return b ? { ok: true, status: 200, blob: async () => new Blob([b]) } : { ok: false, status: 404 }; };
    const logs = [];
    const D = { camp, lib, F, stores: [stores[0], camp.imageCats], fetch: srvFetch, log: (a, s, o) => logs.push(a + ' ' + s + ' ' + j(o)) };
    const clean = SYS.cleanSystem(sys, { F, gmView: true }); clean.name = 'Tinker Tactics';

    const plan = Z.campPlan(clean, D);
    check('the plan: the system’s text is the very text System alone writes', plan.sysText === JSON.stringify(clean, null, 1));
    const gmCopy = (id) => JSON.stringify(LC.packFile(camp.library.packs.find(p => p.id === id), packsHeld[id], LC.libCtx(sys, F, true)), null, 1);
    check('the plan: each pack the library has read, in its order, as the Library window’s GM copy (a GM-only pack keeps its mark), named packs/1, packs/2', j(plan.packs.map(x => x.name)) === j(['packs/1.wppack.json', 'packs/2.wppack.json']) && plan.packs[0].text === gmCopy('p_gear') && plan.packs[1].text === gmCopy('p_tricks') && JSON.parse(plan.packs[1].text).vis === 'gm');
    check('the plan: a pack the library has not read stays home and is counted', plan.unread === 1);
    check('the plan: the pictures the system and its packs name, less the one under a private tag', j(plan.pics) === j(['/saves/images/items/sword.png', '/saves/images/gear/rope.png']) && j(plan.priv) === j(['/saves/images/maps/hall.jpg']));
    const many = Array.from({ length: 40 }, (x, i) => ({ meta: { id: 'p_' + i, name: 'P' + i }, entries: [] }));
    const manyP = Z.wholePlan(clean, many, LC.libCtx(sys, F, true), []);
    check('the plan: at most 32 packs; the rest are counted apart from a pack not read, and said so', manyP.packs.length === 32 && manyP.overPacks === 8 && manyP.unread === 0 && /Left out: 8 packs past the 32 one file holds\./.test(Z.exportWords(Object.assign({ packs: 32, pics: 0 }, manyP, { pics: 0, priv: 0, over: 0 }))));
    check('a picture named at a path no picture may travel by (an escape, a kind the app does not show) is counted, never passed over in silence; the Journal, video and sound folders are not pictures to count', Z.oddPics([j({ a: '/saves/images/my%20map.png', b: '/saves/images/x.avif', c: '/saves/images/ok.png', d: '/saves/images/journal/a.png', e: '/saves/images/x.avif', f: '/saves/images/readme.txt' })]) === 2
        && Z.exportWords({ packs: 1, pics: 1, unread: 0, missing: 0, priv: 0, over: 0, overPacks: 0, odd: 2 }) === 'System exported whole, with 1 library pack and 1 picture. Left out: 2 pictures whose file names Waypoint cannot carry.');

    const built = await Z.buildWhole(clean, D);
    const zr = await ZIP.zipOpen(built.blob), names = zr.entries.map(e => e.name);
    check('the archive: the manifest, the system, each pack, each picture at its path under saves/', j(names) === j(['manifest.json', 'system.wpsystem.json', 'packs/1.wppack.json', 'packs/2.wppack.json', 'images/items/sword.png', 'images/gear/rope.png']), j(names));
    const txt = async (n) => new TextDecoder().decode(await zr.entries.find(e => e.name === n).bytes());
    const man = JSON.parse(await txt('manifest.json'));
    check('the manifest says what the file is and holds', j(man) === j({ format: 'waypoint-system-zip', v: 1, name: 'Tinker Tactics', packs: ['packs/1.wppack.json', 'packs/2.wppack.json'], pictures: 2 }), j(man));
    check('the system entry is byte for byte the .wpsystem.json System alone writes, and each pack the Library window’s export', (await txt('system.wpsystem.json')) === JSON.stringify(clean, null, 1) && (await txt('packs/1.wppack.json')) === gmCopy('p_gear'));
    check('each picture is its file as it lies, every entry stored and its checksum the archive’s', zr.entries.every(e => e.method === 0) && j(Array.from(await zr.entries[4].bytes())) === j(Array.from(files['/saves/images/items/sword.png'])));
    check('the private picture is never fetched; the build’s count says what went and what stayed home', !fetched.some(u => /hall/.test(u)) && j({ p: built.packs, i: built.pics, u: built.unread, v: built.priv, m: built.missing }) === j({ p: 2, i: 2, u: 1, v: 1, m: 0 }));
    check('its steps go to the log as syszip v1, counts alone', logs.length === 5 && /^syszip v1 export-start \{"packs":2,"unread":1,"pics":2,"priv":1\}$/.test(logs[0]) && /export-done/.test(logs[4]) && !logs.some(l => /Tinker|rope|sword/i.test(l)), j(logs));
    check('the file’s name: the system’s name as System alone makes it, .wpsystem.zip', Z.zipName('Tinker Tactics!') === 'Tinker_Tactics.wpsystem.zip' && Z.zipName('') === 'system.wpsystem.zip' && Z.zipName('***') === 'system.wpsystem.zip');
    delete files['/saves/images/gear/rope.png'];
    const built2 = await Z.buildWhole(clean, D), z2 = await ZIP.zipOpen(built2.blob);
    check('a picture not in the saves folder is left out and counted, and the rest still made', built2.missing === 1 && built2.pics === 1 && z2.entries.length === 5);
    files['/saves/images/gear/rope.png'] = new Uint8Array([137, 80, 78, 71, 9, 9]);

    /* ---- the words ---- */
    check('Export’s question names what goes, in real words', Z.askWords(2, 1) === 'Export this system whole, as one .zip with its 2 library packs and 1 picture? Another GM can Import it into any campaign. System alone saves only the system, as a .wpsystem.json.' && /its 1 library pack\?/.test(Z.askWords(1, 0)) && /its 3 pictures\?/.test(Z.askWords(0, 3)));
    check('Export’s closing words: what went, what was left out and why, a private picture said apart', Z.exportWords(built) === 'System exported whole, with 2 library packs and 2 pictures. Left out: 1 pack this computer could not read. 1 picture under a private tag stayed on this computer.' && Z.exportWords({ packs: 1, pics: 0, unread: 0, missing: 2, priv: 0, over: 0 }) === 'System exported whole, with 1 library pack and 0 pictures. Left out: 2 pictures not found in your saves folder.', Z.exportWords(built));

    /* ---- read back ---- */
    const cleanJ = (x) => SYS.cleanSystem(x, { F, gmView: true });
    const rl = []; const RD = { F, log: (a, s, o) => rl.push(s + ' ' + j(o)) };
    const back = await Z.readWhole(built.blob, cleanJ, RD);
    check('read back: the system cleaned as a .wpsystem.json is, the packs as their text in order, the pictures as entries, nothing left out', !back.error && j(back.system) === j(cleanJ(clean)) && j(back.texts) === j([gmCopy('p_gear'), gmCopy('p_tricks')]) && back.entries === 3 && j(back.pics.map(e => e.name)) === j(['images/items/sword.png', 'images/gear/rope.png']) && Object.values(back.left).every(n => n === 0), j(back.left));
    check('read back: what it took is counted against the budget, twenty times the archive and a megabyte', back.budget.cap === built.blob.size * 20 + 1048576 && back.budget.used > 0 && back.budget.used < built.blob.size);
    check('read back: the words say what it brings and that it waits for Save', Z.importWords(back) === 'It brings 2 library packs with 3 entries and 2 pictures. They are added to this campaign when you Save, and nothing of yours is replaced. Until then, an entry the system names from them shows as missing.', Z.importWords(back));
    check('read back: its steps go to the log, counts alone', rl[0].startsWith('import-start') && rl[rl.length - 1] === 'import-ready ' + j({ packs: 2, entries: 3, pics: 2, badpics: 0, badpacks: 0, other: 0 }));

    // an archive made by hand, entry by entry
    const enc = new TextEncoder(), mk = (list) => ZIP.zipCreate(list.map(([n, t]) => ({ name: n, data: typeof t === 'string' ? enc.encode(t) : t })));
    const sysT = JSON.stringify(clean, null, 1), manT = j({ format: 'waypoint-system-zip', v: 1 });
    const err = async (blob) => (await Z.readWhole(blob, cleanJ, { F })).error || '';
    check('refused: a file that is no zip', /not a zip Waypoint can read/.test(await err(new Blob([enc.encode('{"name":"x"}')]))));
    check('refused: a campaign export, pointed to the top bar’s Import', /campaign export\. Bring it in with Import on the top bar/.test(await err(mk([['data.json', '{}']]))));
    check('refused: a manifest of another format, or one that is no JSON', /not a Waypoint system/.test(await err(mk([['manifest.json', j({ format: 'waypoint-pack' })], ['system.wpsystem.json', sysT]]))) && /not a Waypoint system/.test(await err(mk([['manifest.json', 'nope'], ['system.wpsystem.json', sysT]]))));
    check('refused: no system in it, or one that cannot be read', /holds no system\.wpsystem\.json/.test(await err(mk([['manifest.json', manT]]))) && /could not be read/.test(await err(mk([['manifest.json', manT], ['system.wpsystem.json', '{not json']]))) && /could not be read/.test(await (async () => (await Z.readWhole(mk([['system.wpsystem.json', '{}']]), () => null, { F })).error)()));
    const odd = await Z.readWhole(mk([['manifest.json', manT], ['system.wpsystem.json', sysT], ['packs/2.wppack.json', gmCopy('p_tricks')], ['packs/1.wppack.json', gmCopy('p_gear')], ['packs/3.wppack.json', 'not a pack'], ['packs/x.wppack.json', gmCopy('p_gear')],
        ['images/../data.json', 'x'], ['images/journal/a.png', 'x'], ['images/video/a.png', 'x'], ['images/a%2e.png', 'x'], ['images/a.exe', 'x'], ['images/ok.png', 'x'], ['notes.txt', 'x'], ['data2.json', 'x']]), cleanJ, { F });
    check('a .zip without a manifest is read by its system file; packs in their number’s order, whatever the archive’s', !odd.error && j(odd.texts) === j([gmCopy('p_gear'), gmCopy('p_tricks')]));
    check('left out and counted: a pack that is no pack, a picture at no plain picture path (walks, the Journal, a video, an escape, no picture), any other file', odd.left.badPacks === 1 && odd.left.badPics === 5 && odd.left.other === 3 && j(odd.pics.map(e => e.name)) === j(['images/ok.png']), j(odd.left));
    check('the words say what was left out, in real words', Z.importWords(odd) === 'It brings 2 library packs with 3 entries and 1 picture. They are added to this campaign when you Save, and nothing of yours is replaced. Until then, an entry the system names from them shows as missing. Left out: 1 pack that is not a Waypoint pack, 5 pictures whose paths are not plain picture paths, 3 files a system’s .zip does not use.', Z.importWords(odd));
    const only = await Z.readWhole(mk([['system.wpsystem.json', sysT]]), cleanJ, { F });
    check('a .zip with the system alone brings nothing more and says nothing more', !only.error && only.texts.length === 0 && only.pics.length === 0 && Z.importWords(only) === '');
    // a damaged entry: the system's bytes changed after the archive was made fail its checksum
    const good = await built.blob.arrayBuffer(), bad = new Uint8Array(good.slice(0)), at = Buffer.from(bad).indexOf(Buffer.from('"name"'), Buffer.from(bad).indexOf(Buffer.from('system.wpsystem.json')));
    bad[at + 2] = bad[at + 2] ^ 1;
    check('a damaged system entry fails its checksum and is refused, never read', /could not be read/.test(await err(new Blob([bad]))));

    /* ---- the pictures written at Save ---- */
    const put = [];
    const saveFetch = (opts) => async (u, o) => {
        if (u === '/api/list-images') return opts.noList ? { ok: false, status: 500 } : { ok: true, json: async () => [{ path: '/saves/images/items/sword.png' }] };
        const m = /^\/api\/upload-exact\?keep=1&path=(.*)$/.exec(u); if (!m) return { ok: false, status: 400 };
        put.push(decodeURIComponent(m[1])); return opts.status ? { ok: false, status: opts.status } : { ok: true, status: 200 };
    };
    const sl = [];
    const s1 = await Z.savePictures(back.pics, { cap: 1e9, used: 0 }, { fetch: saveFetch({}), log: (a, s, o) => sl.push(s + ' ' + j(o)) });
    check('Save: a picture already listed in the saves folder is counted as already here and never sent; the rest sent with keep=1 at their own path', j(s1) === j({ ok: 1, kept: 1, fail: 0 }) && j(put) === j(['images/gear/rope.png']) && j(sl) === j(['save-start {"pics":2}', 'save-pics {"ok":1,"kept":1,"fail":0}']));
    put.length = 0; const s2 = await Z.savePictures(back.pics, { cap: 1e9, used: 0 }, { fetch: saveFetch({ noList: true, status: 409 }) });
    check('Save: with no list each is sent with keep=1, and the saves folder’s 409 is already here', j(s2) === j({ ok: 0, kept: 2, fail: 0 }) && put.length === 2);
    put.length = 0; const s3 = await Z.savePictures(back.pics, { cap: 1e9, used: 0 }, { fetch: saveFetch({ noList: true, status: 500 }) });
    check('Save: a refusal of the saves folder is counted as failed', j(s3) === j({ ok: 0, kept: 0, fail: 2 }));
    put.length = 0; const s4 = await Z.savePictures(back.pics, { cap: 3, used: 0 }, { fetch: saveFetch({ noList: true }) });
    check('Save: past the import’s budget nothing more is sent', s4.fail === 2 && put.length === 0);
    put.length = 0; const s5 = await Z.savePictures([{ name: 'images/../x.png', method: 0, size: 1, csize: 1, check: async () => new Blob(['x']) }, { name: 'images/a.png', method: 0, size: 1, csize: 1, check: async () => { throw new Error('corrupt zip'); } }, { name: 'images/b.png', method: 8, size: 1e9, csize: 10, check: async () => new Blob(['x']) }], { cap: 1e12, used: 0 }, { fetch: saveFetch({ noList: true }) });
    check('Save: a name that is no plain picture path, an entry that fails its checksum, and one said to inflate out of proportion are never sent', j(s5) === j({ ok: 0, kept: 0, fail: 3 }) && put.length === 0);
    check('Save’s words: the library’s count and the pictures’, in real words', Z.savedWords({ ok: 2, kept: 1, fail: 0 }, { packs: 2, add: 3, update: 1, skip: 0, bad: 0 }) === 'From the imported system. Library: 2 packs, 3 entries added, 1 updated. Pictures: 2 added, 1 already here.' && Z.savedWords(null, null) === '' && Z.savedWords(null, { error: 'No campaign here.' }) === 'From the imported system. No campaign here.');

    /* ---- library.js starterPacks: byId ---- */
    const libSrc = read('library.js');
    function world(existing) {
        const Wl = { camp: { id: 'c1', system: sys, library: existing ? { dir: 'l_x', packs: existing.map(p => ({ id: p.id, name: p.name, rev: 1 })) } : null }, packs: {}, created: [], saved: [], meta: [] };
        (existing || []).forEach(p => { Wl.packs[p.id] = p.entries; });
        const fL = new Function('W', 'readPackImport', 'packImportPlan', 'libCtx', 'FX', 'var cur = { campId: "c1", state: "ready" }; var window = { wpStepLog: function() {} };\nfunction getActiveCampaign() { return W.camp; } function gmHere() { return true; } function F() { return FX; } function load() { return Promise.resolve(); }\nfunction createPack(name) { var id = "p_n" + (W.created.length + 1); W.created.push(name); W.camp.library = W.camp.library || { dir: "l_x", packs: [] }; W.camp.library.packs.push({ id: id, name: name }); W.packs[id] = []; return Promise.resolve({ ok: true, id: id }); }\nfunction setMeta(id, m) { W.meta.push([id, m]); } function ready(id) { return Object.prototype.hasOwnProperty.call(W.packs, id); } function entriesOf(id) { return W.packs[id] || []; }\nfunction savePack(id, entries) { W.saved.push([id, entries.length]); W.packs[id] = entries; return Promise.resolve({ ok: true }); }\n' + slice(libSrc, 'librarycheck:starterpacks') + '\nreturn starterPacks;');
        Wl.run = fL(Wl, LC.readPackImport, LC.packImportPlan, LC.libCtx, F);
        return Wl;
    }
    const A = world([{ id: 'p_gear', name: 'Renamed Gear', entries: [ent('i_rope', 'Rope coil', 5)] }, { id: 'p_other', name: 'Tinker Gear', entries: [] }]);
    const ra = await A.run([gmCopy('p_gear')], { byId: true });
    check('starterPacks with byId: the pack of the file’s own id is merged into by id, though another pack has its name; nothing made, nothing removed', j(ra) === j({ packs: 1, add: 1, update: 1, skip: 0, bad: 0 }) && A.created.length === 0 && j(A.packs.p_gear.map(e => e.id).sort()) === j(['i_lamp', 'i_rope']) && A.packs.p_other.length === 0);
    const B = world([{ id: 'p_gear', name: 'Renamed Gear', entries: [] }, { id: 'p_other', name: 'Tinker Gear', entries: [] }]);
    await B.run([gmCopy('p_gear')]);
    check('starterPacks without it (a starter) still goes by name alone, as before', B.packs.p_other.length === 2 && B.packs.p_gear.length === 0);
    const C = world(null); const rc = await C.run([gmCopy('p_gear'), gmCopy('p_tricks')], { byId: true });
    check('starterPacks with byId in a campaign with no such pack: each pack made under its own name, a GM-only pack set so', j(rc) === j({ packs: 2, add: 3, update: 0, skip: 0, bad: 0 }) && j(C.created) === j(['Tinker Gear', 'Tinker Tricks']) && C.meta[1][1].vis === 'gm');

    /* ---- the System editor (sysedtabs.js) on stand-ins ---- */
    const tabs = kit.part('sysedtabs.js');
    const exportSrc = tabs.slice(tabs.indexOf('function exportSystem() {'), tabs.indexOf('// [syszipcheck:export-end]')), importSrc = slice(tabs, 'syszipcheck:import');
    const aloneSrc = tabs.slice(tabs.indexOf('// The system alone, as a .wpsystem.json'), tabs.indexOf('function importFile(file) {'));
    const fileSrc = tabs.slice(tabs.indexOf('function importFile(file) {'), tabs.indexOf('// [syszipcheck:import-start]'));
    // moved on purpose (1.6.4, Fulllion: "Yes, wait for the save"): the same file under the same name, now through the save dialog opened at
    // the press (savefile.js), and System exported. said only once it was saved
    check('pinned: System alone is the file Export always wrote, under the same name, said exported only once it was saved', aloneSrc.includes("function exportAlone(clean) {\n    var blob = new Blob([JSON.stringify(clean, null, 1)], { type: 'application/json' });\n    var name = (clean.name || 'system').replace(/[^A-Za-z0-9_ -]+/g, '').trim().replace(/ +/g, '_').slice(0, 40) + '.wpsystem.json';\n    sysDownload(sysSaveStart(name, 'application/json'), blob, function() { toast('System exported.'); });"));
    check('pinned: Export cleans the draft and names it first, as before, then goes on to the question', kit.part('sysedtabs.js').includes("function exportSystem() {\n    if (!draft) return;\n    var clean = cleanSystem(draft, { F: F(), gmView: true }); if (!clean) return;\n    clean.name = (ui('sysName').value || '').trim().slice(0, LIMITS.name) || clean.name;\n    // [syszipcheck:export-start]"));
    function editor(o) {
        const W = { opened: [], dropped: 0, pick: o.pick, toasts: [], asks: [], downloads: [], alone: [], waiting: undefined, renders: 0, puts: [], ans: o.ans, zip: o.zip, camp: o.camp, starterPacks: o.starterPacks, draft: o.draft || null };
        const body = 'var draft = W.draft, LIMITS = { name: 60 }; function ui() { return { value: W.draft && W.draft.name || "" }; } function getActiveCampaign() { return W.camp; } function cleanSystem(x) { return W.cleanSys ? W.cleanSys(x) : JSON.parse(JSON.stringify(x)); } function F() { return W.F; }\n'
            + 'function toast(t) { W.toasts.push(t); } function showConfirm(t, cb, op) { W.asks.push([t, op]); cb(W.ans); } function exportAlone(c) { W.alone.push(c); } function starterPacksSet(v) { W.waiting = v; } function renderAll() { W.renders++; }\n'
            + 'function importAsk(jj, c, whole) { W.puts.push([jj, c, whole]); if (whole) { if (whole.waiting) starterPacksSet(whole.waiting); if (whole.says) toast(whole.says); } }\n'
            + 'var state = { appState: { imageCats: W.shared } }; var window = { wpLibrary: W.camp && W.lib, wpStepLog: function() {}, wpSaveFile: { start: function(op) { W.opened.push(op); return { save: function(b) { if (W.pick === "cancel") return Promise.resolve("cancel"); W.downloads.push([op.name, b]); return Promise.resolve("download"); }, drop: function() { W.dropped++; } }; }, saved: function(h) { return h === "saved" || h === "download"; }, saveTo: function(t, b) { return t.save(b); }, failTo: function(t, w) { W.dropped++; W.failed = w; return Promise.resolve("removed"); } } }; if (W.starterPacks) window.wpLibrary = { starterPacks: W.starterPacks };\n'
            + 'var document = { createElement: function() { return { click: function() {}, remove: function() {} }; }, body: { appendChild: function() {} } }; var URL = { createObjectURL: function() { return "blob:x"; }, revokeObjectURL: function() {} }; function setTimeout() {}\n'
            + 'function fetch() { return Promise.reject(new Error("no")); } var console = { error: function() {} };\n'
            + exportSrc.replace("function sysZip() { return import('./syszip.js'); }", 'function sysZip() { return Promise.resolve(W.zip); }').replace('document.body.appendChild(a); a.click();', 'W.downloads.push([name, blob]); document.body.appendChild(a); a.click();')
            + importSrc + '\nreturn { exportIt: function() { exportSystem(); }, importWhole: importWhole, bundleSaved: bundleSaved, deps: sysZipDeps };';
        W.F = F; W.lib = lib; W.shared = stores[0];
        W.api = new Function('W', body)(W);
        return W;
    }
    const tick = () => new Promise(r => setTimeout(r, 10));
    const plainSys = { name: 'Plain', fields: [] };
    const E1 = editor({ zip: Z, camp: { id: 'c2', system: plainSys }, ans: true, draft: plainSys });
    E1.api.exportIt(); await tick();
    check('Export with no pack and no picture asks nothing and writes the system alone, as before', E1.alone.length === 1 && E1.asks.length === 0 && E1.downloads.length === 0);
    const E2 = editor({ zip: Z, camp: Object.assign({}, camp, { system: sys }), ans: 'alt', draft: clean });
    E2.api.exportIt(); await tick();
    check('Export with packs asks Whole system or System alone, never by Enter; System alone writes the .wpsystem.json as before', E2.asks.length === 1 && E2.asks[0][1].yes === 'Whole system' && E2.asks[0][1].alt === 'System alone' && E2.asks[0][1].noEnter === true && E2.asks[0][0] === Z.askWords(2, 2) && E2.alone.length === 1 && E2.downloads.length === 0);
    const E3 = editor({ zip: Object.assign({}, Z, { buildWhole: (c, d) => Z.buildWhole(c, Object.assign({}, d, { fetch: srvFetch })) }), camp: Object.assign({}, camp, { system: sys }), ans: true, draft: clean });
    E3.api.exportIt(); await tick(); await tick();
    check('Whole system downloads one .wpsystem.zip and says what went and what stayed home', E3.downloads.length === 1 && E3.downloads[0][0] === 'Tinker_Tactics.wpsystem.zip' && E3.toasts[E3.toasts.length - 1] === Z.exportWords(built) && E3.alone.length === 0, j(E3.toasts));
    // 1.6.4 (Fulllion: "Yes, wait for the save"): the save dialog opens at the press of Whole system, before the archive is made; a cancel says nothing
    const E3c = editor({ pick: 'cancel', zip: Object.assign({}, Z, { buildWhole: (c, d) => Z.buildWhole(c, Object.assign({}, d, { fetch: srvFetch })) }), camp: Object.assign({}, camp, { system: sys }), ans: true, draft: clean });
    E3c.api.exportIt(); await tick(); await tick();
    check('Whole system opens its save dialog at the press, naming the .wpsystem.zip; canceled, nothing is downloaded and no words say it was exported',
        E3.opened.length === 1 && E3.opened[0].name === 'Tinker_Tactics.wpsystem.zip' && E3.opened[0].type === 'application/zip' && E3c.opened.length === 1 && E3c.downloads.length === 0 && j(E3c.toasts) === j(['Making the export…']), j([E3.opened, E3c.toasts]));
    const E4 = editor({ zip: Z, camp: Object.assign({}, camp, { system: sys }), ans: false, draft: clean });
    E4.api.exportIt(); await tick();
    check('Cancel at the question writes nothing', E4.alone.length === 0 && E4.downloads.length === 0);
    const E5 = editor({ zip: Object.assign({}, Z, { buildWhole: async () => { throw new Error('the archive came out wrong'); } }), camp: Object.assign({}, camp, { system: sys }), ans: true, draft: clean });
    E5.api.exportIt(); await tick();
    check('an export that fails says so and saves nothing: its words go to the save ticket, which says them once the Save As dialog has closed with what became of the file named (1.6.4, savefile.js failTo; moved on purpose)', E5.downloads.length === 0 && E5.failed === 'The export could not be made.' && !E5.toasts.some(function(x) { return /could not be made/.test(x); }) && E5.dropped === 1);
    const deps = E3.api.deps(camp);
    check('what syszip.js is handed: the campaign, the library, the formula module, both tag stores', deps.camp === camp && deps.F === F && deps.stores[0] === stores[0] && deps.stores[1] === camp.imageCats && typeof deps.fetch === 'function' && typeof deps.log === 'function');

    const I1 = editor({ zip: Z, camp, draft: {} });
    I1.cleanSys = cleanJ; I1.api.importWhole(built.blob); await tick(); await tick();
    check('Import of a .zip: the system goes the way a .wpsystem.json goes, its packs and pictures wait for Save, and what it brings is said', I1.puts.length === 1 && j(I1.puts[0][1]) === j(cleanJ(clean)) && I1.waiting && I1.waiting.bundle === true && I1.waiting.texts.length === 2 && I1.waiting.pics.length === 2 && I1.waiting.budget.cap > 0 && I1.toasts[0] === Z.importWords(back), j(I1.toasts));
    const I2 = editor({ zip: Z, camp, draft: {} }); I2.cleanSys = cleanJ; I2.api.importWhole(mk([['data.json', '{}']])); await tick();
    check('Import of a .zip that is no system says why and puts nothing in the draft', I2.puts.length === 0 && I2.waiting === undefined && /campaign export/.test(I2.toasts[0]));
    const I3 = editor({ zip: Z, camp, draft: {} }); I3.cleanSys = cleanJ; I3.api.importWhole(mk([['system.wpsystem.json', sysT]])); await tick();
    check('Import of a .zip holding the system alone waits for nothing', I3.puts.length === 1 && I3.waiting === undefined && I3.puts[0][2].waiting === null);
    check('pinned: a .wpsystem.json goes exactly as it went: read as text, cleaned, then the same question and words; a .zip turns off before it is read', fileSrc.includes("if (/\\.zip$/i.test(String(file.name || ''))) { importWhole(file); return; }") && fileSrc.includes("    file.text().then(function(text) {\n        var j = JSON.parse(text);\n        var c = cleanSystem(j, { F: F(), gmView: true }); if (!c) throw new Error('not a system');\n        importAsk(j, c, null);\n    }).catch(function() { toast('That file is not a Waypoint system.'); });")
        && tabs.includes("        starterPacksSet(whole && whole.waiting ? whole.waiting : null);") && tabs.includes("        if (whole && whole.says) toast(whole.says);"));
    check('pinned (the review, finding 2): any import lets go of what an earlier import or Start from left waiting, so it never lands beside another system', /function importAsk\(j, c, whole\) \{[\s\S]*?draftSet\(c\);[\s\S]*?starterPacksSet\(whole && whole\.waiting \? whole\.waiting : null\);[\s\S]*?\n\}/.test(tabs));
    { const E6b = editor({ zip: Object.assign({}, Z, { campPlan: (c, d) => Z.campPlan(c, Object.assign({}, d, { lib: { ready: () => false, entriesOf: () => [] } })) }), camp: Object.assign({}, camp, { system: sys }), ans: true, draft: plainSys }); E6b.api.exportIt(); await tick();
      check('Export while the library is still being read says so and writes nothing, never the system alone in silence', E6b.alone.length === 0 && E6b.asks.length === 0 && E6b.toasts[0] === 'The library of this campaign is still being read. Try Export again in a moment.', j(E6b.toasts)); }
    { const E7 = editor({ zip: Object.assign({}, Z, { campPlan: () => { throw new Error('x'); } }), camp: Object.assign({}, camp, { system: sys }), ans: true, draft: clean }); E7.api.exportIt(); await tick();
      check('Export whose whole file cannot be made ready says so, then writes the system alone', E7.alone.length === 1 && E7.toasts[0] === 'The whole system could not be made ready, so the system alone is exported.', j(E7.toasts)); }
    let wrote = null; const S1 = editor({ zip: Object.assign({}, Z, { savePictures: async (p, b) => { S1.order = (S1.order || '') + 'p'; return { ok: p.length, kept: 0, fail: 0 }; } }), camp, starterPacks: async (t, op) => { S1.order = (S1.order || '') + 'l'; wrote = [t, op]; return { packs: 2, add: 3, update: 0, skip: 0, bad: 0 }; } });
    S1.api.bundleSaved(I1.waiting); await tick();
    check('Save: the packs first, by id, while the saved campaign is on screen, then the pictures, then one line of what came in', S1.order === 'lp' && wrote[0].length === 2 && wrote[1].byId === true && S1.toasts[0] === 'From the imported system. Library: 2 packs, 3 entries added. Pictures: 2 added.', j(S1.toasts));
    let wrote2 = null; const S2 = editor({ zip: Object.assign({}, Z, { savePictures: async (p) => ({ ok: p.length, kept: 0, fail: 0 }) }), camp, starterPacks: async (t) => { wrote2 = t; return { packs: 2, add: 3, update: 0, skip: 0, bad: 0 }; } });
    S2.api.bundleSaved(I1.waiting); S2.camp = { id: 'c9', system: sys }; await tick();
    check('Save: should another campaign be on screen when the packs would be written, they are not, and that is said; the pictures still go', wrote2 === null && S2.toasts[0] === 'From the imported system. Another campaign is open now, so the packs were not added. Pictures: 2 added.', j(S2.toasts));
    // 1.6.4 (Fulllion, 2026-11-23, "Save waits"): bundleSaved answers a promise that settles once the packs are in, before the pictures are done
    { let picsGo = null; const order = []; const S3 = editor({ zip: Object.assign({}, Z, { savePictures: () => new Promise(r => { picsGo = () => { order.push('pics'); r({ ok: 2, kept: 0, fail: 0 }); }; }) }), camp, starterPacks: async () => { order.push('packs'); return { packs: 2, add: 3, update: 0, skip: 0, bad: 0 }; } });
      const pIn = S3.api.bundleSaved(I1.waiting); let settled = false; pIn.then(() => { settled = true; order.push('settled'); }); await tick();
      check('Save waits: bundleSaved answers a promise that settles once the packs are in, never waiting on the pictures', settled === true && j(order) === j(['packs', 'settled']) && S3.toasts.length === 0, j(order));
      picsGo(); await tick();
      check('Save waits: the pictures go on after it and their line comes last', j(order) === j(['packs', 'settled', 'pics']) && /^From the imported system\. Library: 2 packs/.test(S3.toasts[0]), j(S3.toasts)); }
    { const S4 = editor({ zip: Object.assign({}, Z, { savePictures: async () => ({ ok: 0, kept: 0, fail: 0 }) }), camp, starterPacks: async () => { throw new Error('x'); } });
      let settled = false; S4.api.bundleSaved(I1.waiting).then(() => { settled = true; }); await tick();
      check('Save waits: a library that fails still lets Save say what it saved, and the failure is said', settled === true && S4.toasts.includes('The packs and pictures of the imported system could not be added.'), j(S4.toasts)); }
    { const er = kit.part('sysederr.js'), at = er.indexOf('    var packsIn = starterSaved();'), say = er.indexOf('    var saveSays = function() {'), cnt = er.indexOf("'; ' + edN + ' error'"), wait = er.indexOf("    if (packsIn && typeof packsIn.then === 'function') packsIn.then(saveSays, saveSays); else saveSays();\n}");
      check('pinned: Save (sysederr.js saveDraft) stores the system, hands the waiting packs on, and counts and says its errors only once a .zip\'s packs are in, at once for any other Save', at > 0 && say > at && cnt > say && wait > cnt && er.includes('    if (packsIn && !draft) return;')); }
    check('pinned: Save hands a waiting .zip to bundleSaved, and a starter goes on as before', tabs.includes("var sp = _starterPacks; starterPacksSet(null); if (sp && sp.bundle === true && typeof bundleSaved === 'function') return bundleSaved(sp);") && tabs.includes("    if (!sp || !window.wpLibrary || !window.wpLibrary.starterPacks) return;\n    window.wpLibrary.starterPacks(sp.texts).then(function(r) {"));

    check('pinned: the top bar’s Import, handed a system’s .zip, points to the System editor in place of saying it is no Waypoint export', read('main.js').includes("if (entries.some(function(en) { return en.name === 'system.wpsystem.json'; })) { toast('This zip is a whole system. Bring it in with Import in the System editor.'); return; }"));

    /* ---- the page ---- */
    const html = lf(fs.readFileSync(path.join(SCRIPTS, '..', 'index.html'), 'utf8'));
    check('the page: Import takes a .zip beside a .json, and Help says what Whole system and System alone save, where a pack goes, and where the steps are logged', html.includes('<input type="file" id="sysImportFile" accept=".json,application/json,.zip,application/zip"') && html.includes('<b>Whole system</b> saves one <b>.zip</b>') && html.includes('<b>System alone</b> saves the <b>.wpsystem.json</b> as before.') && html.includes('lines starting <code>syszip v1</code>'));
})());

finish();
