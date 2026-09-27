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

    global.window = {}; const L2 = await import(url('librarycore.js') + '?w');
    check('under a window the module publishes itself as window.wpLibraryCore', !!(global.window.wpLibraryCore && global.window.wpLibraryCore.cleanPack && global.window.wpLibraryCore.VERSION === L2.VERSION));
    delete global.window;

    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
