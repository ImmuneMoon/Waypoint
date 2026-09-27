/* Offline check of the item library at scale's pure core (system/app/scripts/librarycore.js, Stage 6 library L1a): an entry
   cleaned for each view (an item definition plus desc, tags, ref and the GM's notes), its fingerprint, a pack as stored and as
   read from a file (caps, one id per library, the reasons an import lists), the manifest a campaign carries, the names on disk,
   and the index row a picker lists. Runs under Node against the real systemcore and formula engine.
   Usage: node tools/librarycheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path');
const NL = String.fromCharCode(10);
const app = path.join(__dirname, '..', 'system', 'app');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }
const j = v => JSON.stringify(v);

(async () => {
    let L = null, S = null, F = null, err = null;
    try { L = await import(url('librarycore.js')); S = await import(url('systemcore.js')); F = await import(url('formula.js')); } catch (e) { err = e; }
    check('librarycore loads in Node with no window (and publishes nothing there)', !!L && !!S && !!F && !err && typeof globalThis.window === 'undefined', err && err.message);
    if (!L) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { LIB, hashText, libCtx, cleanLibEntry, entryHash, cleanPack, readPackFile, cleanManifest, newDir, packFileName, indexRow, cleanIndexRow, DIR_RE } = L;

    check('hashText is 32-bit FNV-1a as 8 hex (the published vectors)', hashText('') === '811c9dc5' && hashText('a') === 'e40c292c' && hashText('abc') === '1a47e90b' && /^[0-9a-f]{8}$/.test(hashText('é😀')));

    const sys = S.cleanSystem({ v: 1, name: 'L', rolls: [], fields: [{ id: 'f_inv', key: 'Gear', kind: 'item-list', list: { stats: [{ key: 'Wt', label: 'Weight' }, { key: 'Cost', label: 'Cost' }] } }] }, { F, gmView: true });
    const gm = libCtx(sys, F, true), pl = libCtx(sys, F, false);
    const raw = { id: 'i_rope', name: '  Rope\u0007 ', category: 'Gear', icon: '🪢', notes: 'Fifty feet.', key: 'Rope', stats: { Wt: 10, Cost: 1, Nope: 3 }, damage: '1d4', vis: 'all',
        desc: 'Line one.\r\nLine two\u0001.\tTabbed.', tags: ['Tool', ' tool ', '', 'Climbing', 5, 'x'.repeat(40)], ref: 'PHB p.\n152', gmNotes: 'Cursed.\nSecretly.' };
    const eG = cleanLibEntry(raw, gm), eP = cleanLibEntry(raw, pl);
    check('an entry for the GM: the item definition (its stats under the lists\' keys, the formula text kept) plus desc (line breaks and tabs kept, other controls out), tags (one line each, no repeats in any case, blanks gone, cut to 24), ref on one line, and the GM\'s notes',
        eG.id === 'i_rope' && eG.name === 'Rope' && j(eG.stats) === j({ Wt: 10, Cost: 1 }) && eG.damage === '1d4' && eG.desc === 'Line one.\nLine two .\tTabbed.' && j(eG.tags) === j(['Tool', 'Climbing', 'x'.repeat(24)]) && eG.ref === 'PHB p. 152' && eG.gmNotes === 'Cursed.\nSecretly.', j(eG));
    check('the same entry for players: no GM notes and none of the item\'s GM-only text; a GM-only entry is not there at all',
        !('gmNotes' in eP) && eP.damage === '' && eP.desc === eG.desc && j(eP.tags) === j(eG.tags) && cleanLibEntry(Object.assign({}, raw, { vis: 'gm' }), pl) === null && !!cleanLibEntry(Object.assign({}, raw, { vis: 'gm' }), gm));
    const plain = { id: 'i_p', name: 'Plain', category: 'Gear' };
    check('an entry with nothing of the library\'s own is exactly the item definition (no empty desc, tags, ref or notes); blank ones are left out; the length caps hold',
        j(cleanLibEntry(plain, gm)) === j(S.cleanItemDef(plain, F, true, gm.keys, gm.picks)) && j(cleanLibEntry(Object.assign({ desc: '  \n ', tags: ['', ' '], ref: '   ', gmNotes: '\n' }, plain), gm)) === j(S.cleanItemDef(plain, F, true, gm.keys, gm.picks))
        && cleanLibEntry(Object.assign({ desc: 'd'.repeat(5000), gmNotes: 'g'.repeat(3000), ref: 'r'.repeat(99), tags: Array.from({ length: 20 }, (_, i) => 't' + i) }, plain), gm).desc.length === LIB.desc
        && cleanLibEntry(Object.assign({ gmNotes: 'g'.repeat(3000) }, plain), gm).gmNotes.length === LIB.gmNotes && cleanLibEntry(Object.assign({ ref: 'r'.repeat(99) }, plain), gm).ref.length === LIB.ref
        && cleanLibEntry(Object.assign({ tags: Array.from({ length: 20 }, (_, i) => 't' + i) }, plain), gm).tags.length === LIB.tags);
    const polluted = cleanLibEntry({ id: 'i_x', name: 'X', stats: JSON.parse('{"__proto__":{"bad":1},"Wt":2}'), tags: ['__proto__', 'constructor'] }, gm);
    check('a hostile entry reaches no prototype: __proto__ as a stat is not a stat, as a tag it is just text; a bad id is no entry',
        ({}).bad === undefined && j(polluted.stats) === j({ Wt: 2 }) && j(polluted.tags) === j(['__proto__', 'constructor']) && cleanLibEntry({ id: '__proto__', name: 'X' }, gm) === null && cleanLibEntry({ id: 'i_' + 'x'.repeat(30), name: 'X' }, gm) === null && cleanLibEntry(null, gm) === null && cleanLibEntry('i_a', gm) === null);
    const hP = entryHash(eP), hP2 = entryHash(cleanLibEntry(Object.assign({}, raw, { gmNotes: 'Changed', damage: '9d9' }), pl)), hP3 = entryHash(cleanLibEntry(Object.assign({}, raw, { name: 'Rope!' }), pl));
    check('an entry\'s players\'-view fingerprint does not move when only the GM\'s side changes (notes, damage) and moves when what players see does',
        /^[0-9a-f]{8}$/.test(hP) && hP === hP2 && hP !== hP3 && entryHash(eG) !== hP);

    const ents = n => Array.from({ length: n }, (_, i) => ({ id: 'i_e' + i, name: 'E' + i }));
    const p1 = cleanPack({ format: 'waypoint-pack', v: 1, id: 'p_gear', rev: 3.7, entries: [...ents(3), { id: 'i_e1', name: 'Again' }, { name: 'no id' }, 'junk'] }, gm);
    check('a pack as stored: its format, id and revision (a whole number, never negative), its entries cleaned in order, one per id; each one left out counted with its reason',
        p1.pack.format === 'waypoint-pack' && p1.pack.v === 1 && p1.pack.id === 'p_gear' && p1.pack.rev === 3 && j(p1.pack.entries.map(e => e.id)) === j(['i_e0', 'i_e1', 'i_e2']) && p1.dropped === 3
        && p1.reasons[0] === 'entry 4: the id i_e1 is already used' && /^entry 5: not a valid item/.test(p1.reasons[1]) && cleanPack({ id: 'p_x', rev: -5 }, gm).pack.rev === 0 && cleanPack({ id: 'p_x', rev: 1e12 }, gm).pack.rev === 1e9, j(p1));
    const seen = Object.create(null), pa = cleanPack({ id: 'p_a', entries: ents(2) }, gm, seen), pb = cleanPack({ id: 'p_b', entries: [{ id: 'i_e0', name: 'Dup' }, { id: 'i_new', name: 'New' }] }, gm, seen);
    check('an id stays unique across the whole library (the second pack\'s i_e0 is left out); not a pack: its id, or a wrong format, is no pack',
        pa.pack.entries.length === 2 && j(pb.pack.entries.map(e => e.id)) === j(['i_new']) && pb.dropped === 1 && cleanPack({ id: 'x', entries: [] }, gm) === null && cleanPack({ format: 'other', id: 'p_a' }, gm) === null && cleanPack(null, gm) === null && cleanPack([], gm) === null);
    const t0 = Date.now(), big = cleanPack({ id: 'p_big', entries: [...ents(LIB.entries + 25)] }, gm), took = Date.now() - t0;
    check('a pack holds at most ' + LIB.entries + ' entries: the rest are counted, the reasons list stops at ' + LIB.reasons + ' (and cleaning ten thousand stays well under two seconds)',
        big.pack.entries.length === LIB.entries && big.dropped === 25 && big.reasons.length === LIB.reasons && /past 10000 entries/.test(big.reasons[0]) && took < 2000, took + ' ms');
    const good = JSON.stringify({ format: 'waypoint-pack', v: 1, id: 'p_f', rev: 1, entries: ents(2) });
    check('a pack file read: text only, at most 16 MB, JSON, a Waypoint pack with an id — each refusal says which; a good one comes back cleaned',
        /not a pack file/.test(readPackFile(5, gm).error) && /larger than 16 MB/.test(readPackFile('x'.repeat(LIB.fileBytes + 1), gm).error) && /not valid JSON/.test(readPackFile('{', gm).error)
        && /not a Waypoint pack file/.test(readPackFile('{"id":"p_f","entries":[]}', gm).error) && /no valid id/.test(readPackFile('{"format":"waypoint-pack","id":"../x"}', gm).error) && readPackFile(good, gm).pack.entries.length === 2);

    const man = cleanManifest({ v: 1, dir: 'l_abcd1234', extra: 1, packs: [
        { id: 'p_a', name: ' Gear\u0000 ', icon: '🎒', vis: 'all', rev: 4, count: 12.5, bytes: 1e12, hash: 'deadbeef', secret: 'x' }, { id: 'p_a', name: 'Dup' }, { id: 'p_b', vis: 'gm', hash: 'NOTHEX00', count: -3 }, { id: '../p' }, null,
        ...Array.from({ length: 70 }, (_, i) => ({ id: 'p_n' + i })) ] });
    check('the manifest: a generated folder name; each pack once, with its name (default Pack), icon, who may see it, revision, count, size (capped at 16 MB), fingerprint (8 hex or none); nothing else rides along; at most ' + LIB.packs + ' packs',
        man.dir === 'l_abcd1234' && !('extra' in man) && j(man.packs[0]) === j({ id: 'p_a', name: 'Gear', vis: 'all', rev: 4, count: 12, bytes: LIB.fileBytes, hash: 'deadbeef', icon: '🎒' })
        && j(man.packs[1]) === j({ id: 'p_b', name: 'Pack', vis: 'gm', rev: 0, count: 0, bytes: 0, hash: '' }) && man.packs.length === LIB.packs && man.packs.every(p => /^p_/.test(p.id)), j(man.packs.slice(0, 2)));
    check('a manifest with no valid folder (a campaign id, a path, none) is no library at all',
        cleanManifest({ dir: 'camp_1', packs: [] }) === null && cleanManifest({ dir: '../l_abcd1234' }) === null && cleanManifest({ dir: 'l_ABCD1234' }) === null && cleanManifest(null) === null && cleanManifest({ packs: [] }) === null);
    let rs = 0; const seq = () => { rs = (rs + 0.37) % 1; return rs; };
    check('a new folder name is l_ and eight lower-case letters or digits; a pack file is <id>.<revision>.json, and nothing else becomes a name on disk',
        DIR_RE.test(newDir()) && DIR_RE.test(newDir(seq)) && DIR_RE.test(newDir(() => 0.9999999)) && packFileName('p_gear', 3) === 'p_gear.3.json' && packFileName('../x', 1) === '' && packFileName('p_a', -1) === '' && packFileName('p_a', 1.5) === '' && packFileName('p_a', '2') === '');

    const row = indexRow(eP);
    check('an index row: [id, key, name, category, icon, tags, fingerprint] from a players\'-view entry, and its cleaner takes exactly that (the arity, the id, a key by the rule, text cut, the fingerprint\'s form)',
        j(row) === j(['i_rope', 'Rope', 'Rope', 'Gear', '🪢', ['Tool', 'Climbing', 'x'.repeat(24)], hP]) && j(cleanIndexRow(row)) === j(row)
        && cleanIndexRow(row.slice(0, 6)) === null && cleanIndexRow([...row, 'extra']) === null &&cleanIndexRow(['x', '', 'N', '', '', [], hP]) === null && cleanIndexRow(['i_a', '', 'N', '', '', [], 'zz']) === null
        && j(cleanIndexRow(['i_a', '1bad', 'N'.repeat(99), 'C\u0000at', '<b>', ['\u0007t'], hP])) === j(['i_a', '', 'N'.repeat(60), 'C at', '<b>', ['t'], hP]), j(row));

    /* ---- L1c: the manifest's operations ---- */
    {
        const { addPack, removePack, nextRev, packMeta, manifestSig, cleanManifest: cm } = L;
        let rr = 0; const rnd = () => { rr = (rr + 0.137) % 1; return rr; };
        const a1 = addPack(undefined, '  Gear\u0000 ', rnd), a2 = addPack(a1.manifest, '', rnd);
        check('a pack added: the first makes the library\'s folder; each gets a fresh p_ id, its name (default Pack), seen by all, not yet written (revision 0); the manifest stays a clean one',
            /^l_[a-z0-9]{8}$/.test(a1.manifest.dir) && /^p_[a-z0-9]{8}$/.test(a1.id) && j(a1.manifest.packs[0]) === j({ id: a1.id, name: 'Gear', vis: 'all', rev: 0, count: 0, bytes: 0, hash: '' })
            && a2.manifest.dir === a1.manifest.dir && a2.manifest.packs.length === 2 && a2.manifest.packs[1].name === 'Pack' && a2.id !== a1.id && j(cm(a2.manifest)) === j(a2.manifest));
        const full = { dir: 'l_abcd1234', packs: Array.from({ length: LIB.packs }, (_, i) => ({ id: 'p_f' + i })) }, same = addPack({ dir: 'l_abcd1234', packs: [{ id: 'p_aaaaaaaa' }] }, 'X', () => 0);
        check('no pack past ' + LIB.packs + '; an id already taken is never reused (a source that repeats itself gives none rather than a clash)', addPack(full, 'X') === null && same === null);
        const m3 = { dir: 'l_abcd1234', packs: [{ id: 'p_a', rev: 4 }, { id: 'p_b', rev: 1e9 }] };
        check('the next revision of a pack (none for one not listed, never past the cap); a pack removed leaves the others',
            nextRev(m3, 'p_a') === 5 && nextRev(m3, 'p_b') === 1e9 && nextRev(m3, 'p_x') === 0 && nextRev(null, 'p_a') === 0 && j(removePack(m3, 'p_a').packs.map(p => p.id)) === j(['p_b']) && removePack(null, 'p_a') === null);
        const ents = [{ id: 'i_a', name: 'A', gmNotes: 'one' }, { id: 'i_b', name: 'B' }], pl = libCtx(sys, F, false);
        const mA = packMeta(ents, pl, 1234.9), mB = packMeta([{ id: 'i_a', name: 'A', gmNotes: 'two', damage: '9d9' }, { id: 'i_b', name: 'B' }], pl, 10), mC = packMeta([...ents, { id: 'i_s', name: 'Secret', vis: 'gm' }], pl, 10), mD = packMeta([{ id: 'i_a', name: 'A!' }, { id: 'i_b', name: 'B' }], pl, 10);
        check('a pack\'s facts: its entry count, its size (whole bytes, capped), and a fingerprint of what players see of it — moved by a visible change only (not the GM\'s notes or damage, not a GM-only entry added)',
            mA.count === 2 && mA.bytes === 1234 && /^[0-9a-f]{8}$/.test(mA.hash) && mB.hash === mA.hash && mC.hash === mA.hash && mC.count === 3 && mD.hash !== mA.hash && packMeta([], pl, 0).hash === '' && packMeta([], pl, 1e12).bytes === LIB.fileBytes);
        check('a manifest\'s signature names the campaign, the folder and each pack\'s revision (what the GM machine reads again when it moves); none without a library',
            manifestSig({ id: 'camp_1', library: m3 }) === 'camp_1|l_abcd1234|p_a.4,p_b.1000000000' && manifestSig({ id: 'c' }) === '' && manifestSig(null) === '');
    }

    /* ---- L1c2: how an imported library lands ---- */
    {
        const { libImportPlan } = L;
        let rr = 0.5; const rnd = () => { rr = (rr + 0.29) % 1; return rr; };
        const im = { dir: 'l_import01', packs: [{ id: 'p_gear', name: 'Gear', rev: 3, count: 2, bytes: 90, hash: 'aaaaaaaa' }, { id: 'p_new', name: 'New', rev: 0 }, { id: 'p_spell', name: 'Spells', vis: 'gm', rev: 7, count: 1, bytes: 40, hash: 'bbbbbbbb' }] };
        const fresh = libImportPlan(null, im, rnd);
        check('L1c2 into a campaign with no library: a fresh folder (never the file\'s), each pack as it was, each written pack copied from library/<its dir>/<id>.<rev>.json to the same revision there; a pack never written copies nothing',
            fresh.manifest.dir !== 'l_import01' && /^l_[a-z0-9]{8}$/.test(fresh.manifest.dir) && j(fresh.manifest.packs.map(p => [p.id, p.rev, p.vis])) === j([['p_gear', 3, 'all'], ['p_new', 0, 'all'], ['p_spell', 7, 'gm']])
            && j(fresh.uploads) === j([{ dir: fresh.manifest.dir, pack: 'p_gear', rev: 3, from: 'library/l_import01/p_gear.3.json' }, { dir: fresh.manifest.dir, pack: 'p_spell', rev: 7, from: 'library/l_import01/p_spell.7.json' }]) && fresh.left === 0, j(fresh));
        const ex = { dir: 'l_here0001', packs: [{ id: 'p_gear', name: 'Old gear', rev: 5, count: 9, bytes: 1, hash: 'cccccccc', icon: '\u2694' }, { id: 'p_mine', name: 'Mine', rev: 2 }] }, joined = libImportPlan(ex, im, rnd);
        check('L1c2 into a campaign that has a library: its folder is kept; a pack already here takes the file\'s name and facts at a revision past both (6), never rewriting one; a new pack joins; its own packs stay',
            joined.manifest.dir === 'l_here0001' && j(joined.manifest.packs.map(p => [p.id, p.name, p.rev])) === j([['p_gear', 'Gear', 6], ['p_mine', 'Mine', 2], ['p_new', 'New', 0], ['p_spell', 'Spells', 7]]) && !('icon' in joined.manifest.packs[0]) && joined.manifest.packs[0].hash === 'aaaaaaaa'
            && j(joined.uploads.map(u => [u.dir, u.pack, u.rev, u.from])) === j([['l_here0001', 'p_gear', 6, 'library/l_import01/p_gear.3.json'], ['l_here0001', 'p_spell', 7, 'library/l_import01/p_spell.7.json']]), j(joined));
        const nearFull = { dir: 'l_here0001', packs: Array.from({ length: LIB.packs - 1 }, (_, i) => ({ id: 'p_x' + i })) }, capped = libImportPlan(nearFull, im, rnd);
        check('L1c2 no more than ' + LIB.packs + ' packs: the rest are counted, not added; nothing to bring (no manifest, no packs, a bad one) is no plan',
            capped.manifest.packs.length === LIB.packs && capped.left === 2 && libImportPlan(null, null) === null && libImportPlan(null, { dir: 'l_import01', packs: [] }) === null && libImportPlan(null, { dir: '../x', packs: [{ id: 'p_a' }] }) === null);
    }

    /* ---- L2a: the Library window's rules ---- */
    {
        const { searchEntries, entryFromForm, newEntryId, keyClashes, setPackMeta } = L;
        const es = [{ id: 'i_1', name: 'Rope of Climbing', key: 'Rope', category: 'Gear', tags: ['Tool'], ref: 'PHB 152' }, { id: 'i_2', name: '\u00c9p\u00e9e', key: 'Epee', category: 'Weapon' }, { id: 'i_3', name: 'Lantern', category: 'Gear', tags: ['Light'] }, null];
        check('L2a searchEntries: every word, in any order, in the name, key, category, tags or reference (case and accents aside); nothing typed lists everything',
            j(searchEntries(es, 'gear rope').map(e => e.id)) === j(['i_1']) && j(searchEntries(es, 'EPEE').map(e => e.id)) === j(['i_2']) && j(searchEntries(es, 'light').map(e => e.id)) === j(['i_3']) && j(searchEntries(es, '152 phb').map(e => e.id)) === j(['i_1'])
            && searchEntries(es, '  ').length === 4 && searchEntries(es, null).length === 4 && searchEntries(es, undefined).length === 4 && searchEntries([{ id: 'i_n', name: 'null' }], null).length === 1 && searchEntries(es, 'nothing').length === 0 && searchEntries(null, 'x').length === 0);
        const form = { id: 'i_1', name: 'Rope', key: ' Rope ', category: 'Gear', vis: 'gm', tags: 'Tool, Climbing, ,', lvl: ' 2 ', stats: { Wt: '10', Cost: '2.5', Kind: 'Hemp', Nope: '' }, areaFt: '15', areaShape: 'square', areaName: 'Snare', damage: '1d4', gmNotes: 'x' };
        const ef = entryFromForm(form), efc = cleanLibEntry(ef, gm);
        check('L2a entryFromForm: the form as typed becomes an entry — the key trimmed, tags split at commas (blanks gone), a whole level, a stat a number when it reads as one (else a choice\'s name; blank: none), an area only with a size; then cleaned like any entry',
            ef.key === 'Rope' && j(ef.tags) === j(['Tool', 'Climbing']) && ef.lvl === 2 && j(ef.stats) === j({ Wt: 10, Cost: 2.5, Kind: 'Hemp' }) && j(ef.area) === j({ ft: 15, shape: 'square', name: 'Snare' }) && ef.vis === 'gm'
            && entryFromForm({ areaFt: '5' }).area.shape === 'circle' && cleanLibEntry(Object.assign(entryFromForm({ areaFt: '5', areaShape: 'nonagon' }), { id: 'i_sq', name: 'Sq' }), gm).area.shape === 'circle' && !('area' in entryFromForm({ areaFt: '0' })) && !('lvl' in entryFromForm({ lvl: '1.5' })) && !('stats' in entryFromForm({ stats: { Wt: '' } })) && efc.id === 'i_1' && j(efc.stats) === j({ Wt: 10, Cost: 2.5 }) && efc.damage === '1d4', j([ef, efc]));
        let r2 = 0; const seq = () => { r2 = (r2 + 0.61) % 1; return r2; };
        const idA = newEntryId({ i_x: 1 }, seq), idB = newEntryId(id => id !== 'i_zzzzzzzz', () => 0.9999), idC = newEntryId(() => true);
        check('L2a newEntryId: a fresh i_ id none of the library uses (a map or a test), none when it cannot find one', /^i_[a-z0-9]{8}$/.test(idA) && idB === '' && idC === '' && /^i_[A-Za-z0-9_]{1,24}$/.test(idA), j([idA, idB, idC]));
        check('L2a keyClashes: the other entries with the same key, case aside (the entry itself never); none without a key',
            j(keyClashes([{ id: 'i_1', key: 'Rope' }, { id: 'i_2', key: 'rope' }, { id: 'i_3', key: 'Lamp' }], { id: 'i_1', key: 'ROPE' }).map(e => e.id)) === j(['i_2']) && keyClashes([{ id: 'i_2', key: 'x' }], { id: 'i_1' }).length === 0);
        const man0 = { dir: 'l_abcd1234', packs: [{ id: 'p_a', name: 'A', icon: '\u2694' }, { id: 'p_b' }] }, m1 = setPackMeta(man0, 'p_a', { name: ' Weapons\u0000 ', vis: 'gm', icon: '' }), m2 = setPackMeta(man0, 'p_b', { name: '' });
        check('L2a setPackMeta: a pack\'s name (one line; blank: Pack), who may see it and its icon (blank: none) change in a clean manifest; an unknown pack or no manifest: none',
            j(m1.packs[0]) === j({ id: 'p_a', name: 'Weapons', vis: 'gm', rev: 0, count: 0, bytes: 0, hash: '' }) && m2.packs[1].name === 'Pack' && setPackMeta(man0, 'p_x', {}) === null && setPackMeta(null, 'p_a', {}) === null, j([m1, m2]));
    }

    /* ---- L2a: the library by key (the core), and the Library window ---- */
    {
        const { keyIndex, entryFromForm } = L;
        const man = { packs: [{ id: 'p_a', vis: 'all' }, { id: 'p_g', vis: 'gm' }, { id: 'p_none' }] };
        const ents = { p_a: [{ id: 'i_1', key: 'Stealth', name: 'S1' }, { id: 'i_2', name: 'NoKey' }, { id: 'i_3', key: 'stealth', name: 'S3', vis: 'gm' }], p_g: [{ id: 'i_4', key: 'Climb', name: 'C' }, { id: 'i_5', key: 'STEALTH', name: 'S5', vis: 'gm' }] };
        const ki = keyIndex(man, id => ents[id]);
        check('L2a keyIndex: the library by key (case aside) in the manifest\'s pack order, an entry without a key left out; a GM-only pack\'s entries count as GM-only (as copies: the pack\'s own are unchanged); no manifest or lookup: nothing',
            j(Object.keys(ki).sort()) === j(['climb', 'stealth']) && j(ki.stealth.map(e => e.id)) === j(['i_1', 'i_3', 'i_5']) && ki.climb[0].vis === 'gm' && !('vis' in ents.p_g[0]) && ki.stealth[0] === ents.p_a[0] && ki.stealth[2] === ents.p_g[1]
            && Object.getPrototypeOf(ki) === null && Object.keys(keyIndex(null, id => ents[id])).length === 0 && Object.keys(keyIndex(man, null)).length === 0, j(ki));
        const sysK = { v: 1, name: 'K', rolls: [{ id: 'r_c', name: 'Climb', formula: '3d6 <= Skills.Climb.Rank + Skills.Stealth.Rank' }], fields: [{ id: 'f_sk', key: 'Skills', kind: 'item-list', list: { stats: [{ key: 'Rank', label: 'Rank' }] } }] };
        const coK = S.coreOf(sysK, k => ki[k] || []), withK = Object.assign({}, sysK, { core: coK.core });
        const gmK = S.cleanSystem(withK, { F, gmView: true }), plK = S.cleanSystem(withK, { F, gmView: false });
        check('L2a a formula addressing an entry of a GM-only pack: the GM\'s core holds it, the players\' view of the system never does (an entry of a visible pack reaches both)',
            j(coK.core.map(e => e.id)) === j(['i_4', 'i_1']) && j((gmK.core || []).map(e => e.id)) === j(['i_4', 'i_1']) && j((plK.core || []).map(e => e.id)) === j(['i_1']) && JSON.stringify(plK).indexOf('i_4') < 0, j([coK.core, plK.core]));
        const fs = require('fs');
        const winS = fs.readFileSync(path.join(app, 'scripts', 'librarywin.js'), 'utf8').replace(/\r\n/g, '\n'), lbS = fs.readFileSync(path.join(app, 'scripts', 'library.js'), 'utf8').replace(/\r\n/g, '\n');
        const hmS = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, '\n'), tuS = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8');
        const fk = /var ROW_H = 28, FLUSH_MS = 1000, FORM_KEYS = (\[[^\]]*\]);/.exec(winS), FK = fk ? JSON.parse(fk[1].replace(/'/g, '"')) : [];
        const full = entryFromForm({ id: 'i_z', name: 'n', key: 'K', category: 'c', icon: 'x', vis: 'gm', lvl: '1', stats: { Rank: '2' }, notes: 'n', desc: 'd', tags: 't', ref: 'r', damage: '1', cost: '1', throwSkill: 'T', areaFt: '5', gmNotes: 'g' });
        check('L2a the Library window: text nodes only (nothing from an entry, a pack name or a file becomes markup); it never writes a pack it has not read (still loading or unreadable: writing it would leave nothing); a save replaces every field the form holds (each one entryFromForm makes) and keeps the rest (a bound item\'s secrets); it acts on the campaign it opened on',
            !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|setAttribute\('on/.test(winS)
            && /if \(!packById\(pid\) \|\| !ready\(pid\)\) \{ delete st\.dirty\[pid\]; continue; \}/.test(winS)
            && /function saveEntry\(\) \{\n\s*var e = current\(\); if \(!e \|\| !st\.packId \|\| !ready\(st\.packId\)\) return;/.test(winS) && /if \(ready\(packId\)\) st\.work\[packId\] = list;/.test(winS)
            && /var out = clone\(e\); FORM_KEYS\.forEach\(function\(k\) \{ delete out\[k\]; \}\); return Object\.assign\(out, typed\);/.test(winS)
            && Object.keys(full).filter(k => k !== 'id').every(k => FK.includes(k)) && FK.length === Object.keys(full).length - 1
            && /function camp\(\) \{ var c = getActiveCampaign\(\); return c && c\.id === st\.campId \? c : null; \}/.test(winS) && /function ready\(packId\) \{ return !!\(camp\(\) && LB\(\) && LB\(\)\.ready && LB\(\)\.ready\(packId\)\); \}/.test(winS), j([FK, Object.keys(full)]));
        check('L2a the store: a pack is ready only once read for the campaign on screen; a pack\'s name, icon or visibility changes in the manifest, is saved and works the core out again; the core is drawn through keyIndex; an open window hears when the library has been read',
            /function ready\(packId\) \{ var camp = getActiveCampaign\(\); return !!camp && cur\.campId === camp\.id && typeof packId === 'string' && Object\.prototype\.hasOwnProperty\.call\(cur\.packs, packId\); \}/.test(lbS)
            && /var m = setPackMeta\(camp\.library, packId, meta\); if \(!m\) return \{ error: 'No such pack\.' \};\n\s*camp\.library = m; cur\.sig = manifestSig\(camp\);\n\s*save\(true\); after\(\);/.test(lbS)
            && /function byKey\(camp\) \{ return keyIndex\(camp && camp\.library, entriesOf\); \}/.test(lbS) && /var idx = byKey\(camp\), res = coreOf\(/.test(lbS)
            && /after\(\);\n\s*if \(window\.wpLibraryWin && window\.wpLibraryWin\.refresh\) \{ try \{ window\.wpLibraryWin\.refresh\(\); \} catch \(e\) \{ console\.error\(e\); \} \}[^\n]*\n\s*return mine;/.test(lbS)
            && /window\.wpLibrary = \{[^\n]*, ready: ready, setMeta: setMeta[, ]/.test(lbS));
        const zOf = id => { const m = new RegExp('<div id="' + id + '" style="[^"]*z-index:(\\d+)').exec(hmS); return m ? Number(m[1]) : NaN; };
        check('L2a the window sits above the System editor and below its questions, loads after the store, opens from the Items tab, and Help and the tour describe it',
            zOf('libraryModal') > zOf('systemModal') && zOf('libraryModal') < zOf('customConfirm') && zOf('libraryModal') < zOf('customPrompt')
            && hmS.indexOf('scripts/librarywin.js') > hmS.indexOf('scripts/library.js') && hmS.indexOf('scripts/library.js') > 0
            && /<div id="sysItems"[\s\S]*?id="sysOpenLibrary"[\s\S]*?<div id="sysItemRows"/.test(hmS)
            && /<div id="helpModal"[\s\S]*<li><b>&#128218; Library&hellip;<\/b> \(on the Items tab\)/.test(hmS) && /<b>&#128218; Library&hellip;<\/b> opens the campaign&rsquo;s <b>library<\/b>/.test(tuS), j([zOf('libraryModal'), zOf('systemModal'), zOf('customConfirm')]));
    }

    /* ---- L2a2: a pack as a file, the import's dry run, bulk changes ---- */
    {
        const { packFile, readPackImport, packImportPlan, bulkSet, bulkMove, keyIndex } = L;
        const sysP = S.cleanSystem({ v: 1, name: 'P', rolls: [], fields: [{ id: 'f_inv', key: 'Gear', kind: 'item-list', list: { stats: [{ key: 'Wt', label: 'Weight' }] } }, { id: 'f_sec', key: 'Sec', kind: 'item-list', vis: 'gm', list: { stats: [{ key: 'Curse', label: 'Curse' }] } }] }, { F, gmView: true });
        const plSys = S.cleanSystem(sysP, { F, gmView: false }), gmC = libCtx(sysP, F, true), plC = libCtx(plSys, F, false);
        const ents = [{ id: 'i_a', name: 'Axe', category: 'Gear', damage: '1d8', gmNotes: 'Notched.', stats: { Wt: 4, Curse: 2 }, rm: 'bound', rmMsg: 'Stuck.' }, { id: 'i_s', name: 'Secret', vis: 'gm' }, { id: 'i_a', name: 'Dup' }, { nope: 1 }];
        const gmF = packFile({ id: 'p_gear', name: ' Gear\u0007 ', icon: '\u2694', vis: 'gm' }, ents, gmC), plF = packFile({ id: 'p_gear', name: 'Gear', vis: 'all' }, ents, plC), plG = packFile({ id: 'p_gear', name: 'Gear', vis: 'gm' }, ents, plC);
        check('L2a2 packFile: the GM\'s copy is the pack as held (its name on one line, icon, GM-only mark, every entry with its GM notes, formulas and secrets; one per id, junk gone); a players\' copy holds what the players\' view does (no GM-only entry, notes, formula text, GM-only list\'s stat or secret); a GM-only pack\'s players\' copy is empty',
            gmF.format === 'waypoint-pack' && gmF.name === 'Gear' && gmF.icon === '\u2694' && gmF.vis === 'gm' && j(gmF.entries.map(e => e.id)) === j(['i_a', 'i_s']) && gmF.entries[0].gmNotes === 'Notched.' && gmF.entries[0].damage === '1d8' && gmF.entries[0].rm === 'bound' && j(gmF.entries[0].stats) === j({ Wt: 4, Curse: 2 })
            && !('vis' in plF) && j(plF.entries.map(e => e.id)) === j(['i_a']) && !('gmNotes' in plF.entries[0]) && plF.entries[0].damage === '' && !('rm' in plF.entries[0]) && !('rmMsg' in plF.entries[0]) && j(plF.entries[0].stats) === j({ Wt: 4 })
            && plG.entries.length === 0 && packFile({ id: 'nope' }, [], gmC).id === 'p_pack' && packFile(null, null, gmC).name === 'Pack', j([gmF, plF]));
        const rt = readPackImport(JSON.stringify(gmF), gmC), bad = readPackImport(JSON.stringify({ format: 'waypoint-pack', name: 'X'.repeat(90), entries: [{ id: 'i_ok', name: 'Ok' }, { id: 'bad id', name: 'B' }, { id: 'i_ok', name: 'Again' }, 5] }), gmC);
        check('L2a2 readPackImport: a pack file comes back as it was exported (name, icon, GM-only mark, entries); its entries are cleaned in the GM\'s view, one per id, the rest counted with reasons; not JSON, not a pack, another format or too large is an error',
            rt.name === 'Gear' && rt.icon === '\u2694' && rt.vis === 'gm' && j(rt.entries) === j(gmF.entries) && rt.dropped === 0
            && bad.name.length === LIB.packName && j(bad.entries.map(e => e.id)) === j(['i_ok']) && bad.dropped === 3 && bad.reasons.length === 3 && bad.vis === 'all'
            && !!readPackImport('{', gmC).error && !!readPackImport('[]', gmC).error && !!readPackImport(JSON.stringify({ format: 'waypoint-system', entries: [] }), gmC).error && !!readPackImport(JSON.stringify({ name: 'x' }), gmC).error
            && /too large/.test(readPackImport(JSON.stringify({ entries: [], pad: 'x'.repeat(LIB.fileBytes) }), gmC).error || '') && !!readPackImport(null, gmC).error && !readPackImport(JSON.stringify({ entries: [] }), gmC).error, j([rt, bad]));
        const lib = [{ id: 'p_t', name: 'Target', entries: [{ id: 'i_1', name: 'One', key: 'One' }, { id: 'i_2', name: 'Two', key: 'Two', notes: 'old' }] }, { id: 'p_o', name: 'Other', entries: [{ id: 'i_9', name: 'Nine', key: 'Nine' }] }];
        const inc = { entries: [{ id: 'i_1', name: 'One', key: 'One' }, { id: 'i_2', name: 'Two', key: 'Two', notes: 'new' }, { id: 'i_9', name: 'Stolen', key: 'Zed' }, { id: 'i_3', name: 'Three', key: 'nine' }, { id: 'i_x', name: 'Twin', key: 'TWO' }], dropped: 2, reasons: ['r1', 'r2'] };
        let r3 = 0; const seq = () => { r3 = (r3 + 0.37) % 1; return r3; };
        const pId = packImportPlan(lib, 'p_t', inc, 'id', seq), pKey = packImportPlan(lib, 'p_t', inc, 'key', seq), pNew = packImportPlan(lib, 'p_t', inc, 'new', seq);
        check('L2a2 packImportPlan by id: the entry of an id is replaced (an equal one unchanged), an id another pack holds is skipped with its reason, the rest added; the file\'s own drops count as not valid; a key another entry has is counted',
            pId.same === 1 && pId.update === 1 && pId.add === 2 && pId.skip === 1 && pId.invalid === 2 && j(pId.entries.map(e => e.id)) === j(['i_1', 'i_2', 'i_3', 'i_x']) && pId.entries[1].notes === 'new' && pId.reasons[0] === 'r1' && /Stolen: its id is already in the pack Other/.test(pId.reasons[2]) && pId.clash === 3
            && lib[0].entries.length === 2 && lib[0].entries[1].notes === 'old', j(pId));
        check('L2a2 packImportPlan by key: the entry of a key (case aside) is replaced and keeps its own id; an unmatched entry whose id the library uses gets a fresh one; nothing is skipped',
            pKey.same === 1 && pKey.update === 2 && pKey.add === 2 && pKey.skip === 0 && pKey.entries[1].id === 'i_2' && pKey.entries[1].name === 'Twin' && pKey.entries.length === 4 && pKey.entries[2].id !== 'i_9' && /^i_[a-z0-9]{8}$/.test(pKey.entries[2].id) && pKey.entries[3].id === 'i_3', j(pKey));
        check('L2a2 packImportPlan as a new pack: every entry added (ids the library holds made fresh), the target untouched; merging with no pack to merge into skips all',
            pNew.add === 5 && pNew.update === 0 && pNew.entries.length === 5 && pNew.entries.filter(e => ['i_1', 'i_2', 'i_9'].includes(e.id)).length === 0 && pNew.entries.some(e => e.id === 'i_3') && pNew.entries.some(e => e.id === 'i_x')
            && packImportPlan(lib, 'p_none', inc, 'id').skip === 5 && packImportPlan(lib, 'p_none', inc, 'id').add === 0, j(pNew));
        const full = [{ id: 'p_t', name: 'T', entries: Array.from({ length: LIB.entries - 1 }, (_, i) => ({ id: 'i_f' + i, name: 'F' })) }], capP = packImportPlan(full, 'p_t', { entries: [{ id: 'i_n1', name: 'N1' }, { id: 'i_n2', name: 'N2' }] }, 'id');
        check('L2a2 packImportPlan: the target never passes ' + LIB.entries + ' entries (the rest skipped with a reason); at most ' + LIB.reasons + ' reasons',
            capP.add === 1 && capP.skip === 1 && capP.entries.length === LIB.entries && packImportPlan(lib, 'p_none', { entries: Array.from({ length: 40 }, (_, i) => ({ id: 'i_q' + i, name: 'Q' })) }, 'id').reasons.length === LIB.reasons, j([capP.add, capP.skip]));
        const bl = [{ id: 'i_1', name: 'One', category: 'Gear', tags: ['A'] }, { id: 'i_2', name: 'Two', category: 'Gear' }, { id: 'i_3', name: 'Three', category: 'Gear' }].map(e => cleanLibEntry(e, gmC));
        const b1 = bulkSet(bl, ['i_1', 'i_2'], { category: 'Tool', addTags: ['B', 'a'], vis: 'gm' }, gmC), b2 = bulkSet(bl, ['i_1'], { tags: ['Z'] }, gmC), b3 = bulkSet(bl, ['i_1'], { category: 'Gear' }, gmC);
        check('L2a2 bulkSet: the chosen entries get the category, tags added (no repeat, case aside) or replacing theirs, and who may see them, each cleaned again; the others are the same objects; what did not change is not counted',
            b1.changed === 2 && b1.entries[0].category === 'Tool' && j(b1.entries[0].tags) === j(['A', 'B']) && j(b1.entries[1].tags) === j(['B', 'a']) && b1.entries[1].vis === 'gm' && b1.entries[2] === bl[2]
            && j(b2.entries[0].tags) === j(['Z']) && b3.changed === 0 && bl[0].category === 'Gear', j([b1, b2]));
        const src = [{ id: 'i_1', name: 'One', key: 'One' }, { id: 'i_2', name: 'Two' }, { id: 'i_3', name: 'Three' }], dst = [{ id: 'i_9', name: 'Nine' }];
        const mv = bulkMove(src, dst, ['i_1', 'i_3'], {}), cp = bulkMove(src, dst, ['i_1'], { copy: true, taken: { i_1: 1, i_2: 1, i_3: 1, i_9: 1 }, suffix: ' (copy)' });
        const room = bulkMove(src, Array.from({ length: LIB.entries - 1 }, (_, i) => ({ id: 'i_d' + i })), ['i_1', 'i_2', 'i_3'], {}), dupe = bulkMove(src, src, ['i_2'], { copy: true, taken: { i_2: 1 } });
        check('L2a2 bulkMove: a move takes the chosen entries (ids kept) to the other pack; a copy leaves them and adds fresh ids with no key and the suffix; a full pack takes what it has room for (the rest stay, counted); a copy within one pack adds beside the originals',
            j(mv.src.map(e => e.id)) === j(['i_2']) && j(mv.dst.map(e => e.id)) === j(['i_9', 'i_1', 'i_3']) && mv.done === 2 && mv.left === 0 && mv.dst[1] === src[0]
            && bulkMove(src, dst, ['i_1'], { copy: true, taken: { i_aaaaaaaa: 1 }, rnd: () => 0 }).left === 1 && j(bulkMove(src, dst, ['i_1', 'i_2'], { copy: true, rnd: () => 0 }).dst.map(e => e.id)) === j(['i_9', 'i_aaaaaaaa'])
            && cp.src.length === 3 && cp.dst.length === 2 && /^i_[a-z0-9]{8}$/.test(cp.dst[1].id) && !['i_1', 'i_2', 'i_3', 'i_9'].includes(cp.dst[1].id) && !('key' in cp.dst[1]) && cp.dst[1].name === 'One (copy)' && src[0].key === 'One'
            && room.done === 1 && room.left === 2 && j(room.src.map(e => e.id)) === j(['i_2', 'i_3']) && dupe.dst.length === 4 && dupe.dst[3].name === 'Two', j([mv, cp, room.done, room.left]));
        const fs = require('fs');
        const winT = fs.readFileSync(path.join(app, 'scripts', 'librarywin.js'), 'utf8').replace(/\r\n/g, '\n');
        check('L2a2 the window: an import is read only when 16 MB or less, through readPackImport in the GM\'s view, and changes nothing until Import (which needs something to add or update, a pack it has read, and the plan worked out again); a players\' copy is made from the players\' view (none: no stats); bulk actions act only on chosen entries the search shows, on packs it has read',
            /if \(f\.size > LIB\.fileBytes\) \{ toast\([^\n]*\); return; \}/.test(winT) && /var d = readPackImport\(text, gmCtx\(\)\); if \(d\.error\)/.test(winT)
            && /var plan = planFor\(im\), pid = im\.target; if \(!plan\.add && !plan\.update\) return;/.test(winT) && /\} else if \(!ready\(pid\)\) return;\n\s*st\.work\[pid\] = plan\.entries;/.test(winT) && /pid = r\.id; LB\(\)\.setMeta\(pid, \{ icon: im\.data\.icon \|\| '', vis: im\.data\.vis \}\); plan = planFor\(im\);/.test(winT)
            && /var file = packFile\(p, workOf\(p\.id\), players \? libCtx\(pv \|\| \{ fields: \[\] \}, F\(\), false\) : gmCtx\(\)\);/.test(winT) && /window\.wpSheets\.playerSystem\(c\)/.test(winT) && /if \(p\.vis === 'gm'\) ex\.options\[2\]\.disabled = true;/.test(winT)
            && /function chosen\(\) \{ return st\.shown\.filter\(function\(e\) \{ return st\.sel\[e\.id\]; \}\)\.map\(function\(e\) \{ return e\.id; \}\); \}/.test(winT)
            && /var pid = st\.packId, ids = chosen\(\); if \(!ids\.length \|\| !ready\(pid\)\) return;\n\s*var r = bulkSet\(/.test(winT) && /if \(!ids\.length \|\| !ready\(src\) \|\| !ready\(dst\) \|\| src === dst\) return;/.test(winT)
            && /if \(!yes \|\| !st\.open \|\| !ready\(pid\)\) return; var gone = map\(\);/.test(winT) && !/innerHTML|outerHTML|insertAdjacentHTML/.test(winT));
        const hmT = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        check('L2a2 Help and the tour describe choosing several, import with its dry run and export; the window has its Import button and a list that takes the keys',
            /id="libImport"/.test(hmT) && /<div id="libList" class="lib-list" tabindex="0">/.test(hmT) && /<b>Import&hellip;<\/b> reads a <code>\.wppack\.json<\/code> file and shows what it would do before anything changes/.test(hmT) && /<b>Ctrl-click<\/b>, <b>Shift-click<\/b> or <b>Ctrl\+A<\/b> chooses several entries/.test(hmT)
            && /packs import and export as <code>\.wppack\.json<\/code> files/.test(fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8')));
    }

    /* ---- L2c: the picker — its search, its safety, the sheet's option ---- */
    {
        const fs = require('fs'), { queryWords, entryHay, searchEntries } = L;
        const eH = { id: 'i_1', name: 'Épée courte', key: 'Epee', category: 'Weapon', tags: ['Light', 'Finesse'], ref: 'Core 12' };
        check('L2c queryWords + entryHay: the words a search looks for (case and accents aside, at most 12) and an entry\'s folded text; together they match exactly as searchEntries does',
            j(queryWords('  ÉPÉE  finesse ')) === j(['epee', 'finesse']) && queryWords(null).length === 0 && queryWords('a b c d e f g h i j k l m n').length === 12 && entryHay(eH) === 'epee courte epee weapon light finesse core 12' && entryHay(null) === ''
            && queryWords('core epee').every(w => entryHay(eH).indexOf(w) >= 0) && searchEntries([eH], 'core epee').length === 1, j([queryWords('  ÉPÉE  finesse '), entryHay(eH)]));
        const pkS = fs.readFileSync(path.join(app, 'scripts', 'libpicker.js'), 'utf8').replace(/\r\n/g, '\n'), shS = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const cssS = fs.readFileSync(path.join(app, 'style.css'), 'utf8'), zP = Number((/\.lib-pick \{ position: fixed; z-index: (\d+);/.exec(cssS) || [])[1]);
        check('L2c the picker: text nodes only; its keys stay its own; only the list\'s categories are offered; an entry already on a list that holds each once is never added; a click outside, Esc or × closes it; it sits over every sheet window (9000) and under the app\'s questions (100000)',
            !/innerHTML|outerHTML|insertAdjacentHTML/.test(pkS) && /pop\.addEventListener\('keydown', function\(e\) \{\n\s*e\.stopPropagation\(\);/.test(pkS)
            && /if \(cats && cats\.indexOf\(lc\(e\.category\)\) < 0\) return;/.test(pkS) && /function chosenIds\(\) \{ var ids = Object\.keys\(st\.picked\)\.filter\(function\(id\) \{ return st\.all\.some\(function\(x\) \{ return x\.e\.id === id && !isOnce\(x\); \}\); \}\);[^\n]*return x && !x\.hdr && !isOnce\(x\) \? \[x\.e\.id\] : \[\]; \}/.test(pkS)
            && /st\.outside = function\(e\) \{ if \(st && !st\.pop\.contains\(e\.target\)\) close\(\); \};/.test(pkS) && zP > 9000 && zP < 100000, zP);
        check('L2c the sheet offers "From the library…" only on the GM\'s machine with a library loaded; each pick is an ordinary add with a fresh row id, the character and field looked up again (never another campaign\'s)',
            /var libOK = gm && !!window\.wpLibPicker && !!\(window\.wpLibrary && window\.wpLibrary\.size && window\.wpLibrary\.size\(\) > 0\);/.test(shS) && /if \(libOK\) add\.appendChild\(opt\('__lib', /.test(shS) && /if \(add\.value === '__lib'\) \{ add\.value = ''; openLibPicker\(add, c, f, specI, carried\); return; \}/.test(shS)
            && /if \(cp !== camp \|\| !ch \|\| !ff\) return; ids\.forEach\(function\(id\) \{ commitItem\(ch, ff, \{ op: 'add', defId: id, rowId: uid\('w_'\), qty: qty \}\); \}\);/.test(shS)
            && /scripts\/libpicker\.js/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')) && /<b>&#128218; From the library&hellip;<\/b>: a picker over the campaign&rsquo;s library packs/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
    }

    /* ---- L3: the library as players see it (pure) ---- */
    {
        const { playerIndex, indexPage, getAnswer, cleanPlayerManifest, cleanIndexRow, HASH_RE } = L;
        const sysI = S.cleanSystem({ v: 1, name: 'I', rolls: [], fields: [{ id: 'f_inv', key: 'Gear', kind: 'item-list', list: { stats: [{ key: 'Wt', label: 'Weight' }] } }, { id: 'f_sec', key: 'Sec', kind: 'item-list', vis: 'gm', list: { stats: [{ key: 'Curse', label: 'Curse' }] } }] }, { F, gmView: true });
        const plI = libCtx(S.cleanSystem(sysI, { F, gmView: false }), F, false);
        const ents = [{ id: 'i_a', name: 'Axe', category: 'Gear', damage: '1d8', gmNotes: 'x', desc: 'An axe.', tags: ['Tool'], stats: { Wt: 4, Curse: 2 } }, { id: 'i_s', name: 'Secret', vis: 'gm' }, { id: 'i_b', name: 'Bow', key: 'Bow' }, { id: 'i_a', name: 'Dup' }];
        const ix = playerIndex(ents, plI), ix2 = playerIndex(ents.map(e => e.id === 'i_a' ? Object.assign({}, e, { gmNotes: 'changed', damage: '9d9', stats: { Wt: 4, Curse: 7 } }) : e), plI), ix3 = playerIndex(ents.map(e => e.id === 'i_a' ? Object.assign({}, e, { name: 'Axe2' }) : e), plI);
        check('L3 playerIndex: a pack as players see it — GM-only entries gone, each entry in the players\' view (no GM notes, formula text or GM-only list stat), its index row, one per id; the hash moves when what players see moves, never for a GM-only edit',
            j(ix.rows.map(r => r[0])) === j(['i_a', 'i_b']) && !('gmNotes' in ix.byId.i_a) && ix.byId.i_a.damage === '' && j(ix.byId.i_a.stats) === j({ Wt: 4 }) && ix.byId.i_a.desc === 'An axe.' && !ix.byId.i_s && Object.getPrototypeOf(ix.byId) === null
            && ix.rows.every(r => j(cleanIndexRow(r)) === j(r)) && HASH_RE.test(ix.hash) && ix2.hash === ix.hash && ix3.hash !== ix.hash, j([ix.rows, ix.hash, ix2.hash, ix3.hash]));
        const rowsP = Array.from({ length: 950 }, (_, i) => [i]);
        check('L3 indexPage: a page of the index (at most the size), its number and how many there are; a page out of range, not a whole number or not a number is none; an empty pack has one empty page',
            j(indexPage(rowsP, 0, 400)) === j({ page: 0, pages: 3, rows: rowsP.slice(0, 400) }) && indexPage(rowsP, 2, 400).rows.length === 150 && indexPage(rowsP, 3, 400) === null && indexPage(rowsP, -1, 400) === null && indexPage(rowsP, 1.5, 400) === null && indexPage(rowsP, '1', 400) === null
            && j(indexPage([], 0, 400)) === j({ page: 0, pages: 1, rows: [] }) && indexPage([], 1, 400) === null);
        const big = {}; for (let i = 0; i < 60; i++) big['i_e' + i] = { id: 'i_e' + i, name: 'E', desc: 'd'.repeat(3000) };
        const gA = getAnswer(ix.byId, ['i_b', 'i_s', 'i_zz', 'bad id', 'i_b', 'i_a', 5], 48 * 1024), gB = getAnswer(big, Object.keys(big), 48 * 1024), gC = getAnswer({ i_h: { id: 'i_h', desc: 'd'.repeat(90000) } }, ['i_h'], 48 * 1024);
        check('L3 getAnswer: the entries asked for that the pack has, each once, in the order asked (a GM-only, unknown or malformed id left out silently); at most ' + LIB.getIds + ' asked and within the byte cap (one always goes)',
            j(gA.map(e => e.id)) === j(['i_b', 'i_a']) && gB.length > 0 && gB.length < LIB.getIds && JSON.stringify(gB).length <= 48 * 1024 && gC.length === 1 && getAnswer(null, ['i_b'], 100).length === 0 && j(getAnswer({ i_ok: { id: 'i_ok' } }, ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'i_ok'], 1000).map(e => e.id)) === j(['i_ok']), j([gA.map(e => e.id), gB.length]));
        const lbP = require('fs').readFileSync(path.join(app, 'scripts', 'library.js'), 'utf8').replace(/\r\n/g, '\n');
        check('L3 the store: a players\' index only on the GM\'s machine, for the campaign on screen, of a pack it has read that players may see (never a GM-only pack), worked out again when the pack or the players\' fields change; the manifest and an entry by id go through it',
            /var camp = getActiveCampaign\(\); if \(!camp \|\| !camp\.library \|\| !gmHere\(\) \|\| !ready\(packId\)\) return null;\n\s*var p = camp\.library\.packs\.filter\(function\(x\) \{ return x\.id === packId; \}\)\[0\]; if \(!p \|\| p\.vis === 'gm'\) return null;/.test(lbP)
            && /var sig = camp\.id \+ '\|' \+ p\.rev \+ '\|' \+ hashText\(JSON\.stringify\(fields\)\), m = _pidx\[packId\]; if \(m && m\.sig === sig\) return m;/.test(lbP)
            && /\(camp\.library \? camp\.library\.packs : \[\]\)\.forEach\(function\(p\) \{ var ix = playerIndexOf\(p\.id, pl\); if \(!ix\) return;/.test(lbP) && /var ix = playerIndexOf\(camp\.library\.packs\[i\]\.id, pl\); if \(ix && Object\.prototype\.hasOwnProperty\.call\(ix\.byId, id\)\) return ix\.byId\[id\];/.test(lbP));
        const pm = cleanPlayerManifest({ campId: 'k_1', dir: 'l_abcd1234', packs: [{ id: 'p_a', name: ' Gear\u0007 ', icon: '\u2694', count: 3.7, hash: 'abcdef12', rev: 4, vis: 'all' }, { id: 'p_a', name: 'Dup', count: 1, hash: 'abcdef12' }, { id: 'bad', count: 1, hash: 'abcdef12' }, { id: 'p_b', count: -4, hash: 'nothex!!' }, { id: 'p_c', count: 1e12, hash: '00000000' }] });
        check('L3 cleanPlayerManifest: what a player takes — the campaign, packs with an id, a name on one line, an icon, a whole count in range and a hash (never a folder, revision or visibility); a bad pack is left out; not a manifest: none',
            j(pm) === j({ campId: 'k_1', packs: [{ id: 'p_a', name: 'Gear', count: 3, hash: 'abcdef12', icon: '\u2694' }, { id: 'p_c', name: 'Pack', count: LIB.entries, hash: '00000000' }] })
            && cleanPlayerManifest({ campId: '__proto__ x', packs: [] }) === null && cleanPlayerManifest({ campId: 'k', packs: 'x' }) === null && cleanPlayerManifest(null) === null
            && cleanPlayerManifest({ campId: 'k', packs: Array.from({ length: 80 }, (_, i) => ({ id: 'p_' + i, hash: '00000000' })) }).packs.length === LIB.packs, j(pm));
    }

    global.window = {}; const L2 = await import(url('librarycore.js') + '?w');
    check('under a window the module publishes itself as window.wpLibraryCore', !!(global.window.wpLibraryCore && global.window.wpLibraryCore.cleanPack && global.window.wpLibraryCore.VERSION === L2.VERSION));
    delete global.window;

    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
