/* Offline check of making a catalog (1.6.2): a CSV file read as a pack (system/app/scripts/csvcore.js, run for real against the real cleaner and
   packImportPlan), the Library window's spreadsheet panel, its import and its first-pack guide (librarywin.js sliced by its catalogcheck markers and run
   on a page of plain objects that refuses markup), a row of a sheet taken into the library (librarycore's rules, the sheet's rowlib slice and the
   window's takeEntry), and the page, the styles, Help, the notes and CI.
   Usage: node tools/catalogcheck.js   (exit 1 on any failure) */
'use strict';
const fs = require('fs'), path = require('path');
const NL = String.fromCharCode(10), CR = String.fromCharCode(13), TAB = String.fromCharCode(9), BOM = String.fromCharCode(0xFEFF);
const app = path.join(__dirname, '..', 'system', 'app');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, NL);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 400) : ''); } }
const j = v => JSON.stringify(v);
let summed = false;
process.on('exit', code => { if (!summed && !code) { console.log(NL + 'FAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });

(async () => {
    const C = await import(url('csvcore.js')), L = await import(url('librarycore.js')), S = await import(url('systemcore.js')), F = await import(url('formula.js'));
    const { CSV, parseCsv, sniffSep, csvText, readCsv, headsOf, headLooks, csvStats, csvTargets, guessMap, setTarget, bestList, readNum, csvEntries, csvPreview, csvCats } = C;
    const enc = s => new TextEncoder().encode(s);

    /* ---- reading the file ---- */
    const p1 = parseCsv(BOM + 'Name,Weight' + CR + NL + '"Rope, long",1.5' + CR + NL + '"Two' + NL + 'lines ""quoted""",2' + NL + NL + ',' + NL + 'Last,3');
    check('a CSV as a spreadsheet saves it: a mark at the start, CRLF, a quoted divider, a line break and a doubled quote inside quotes, a blank line and a row of blank cells passed over, the last line with no end',
        j(p1.rows) === j([['Name', 'Weight'], ['Rope, long', '1.5'], ['Two' + NL + 'lines "quoted"', '2'], ['Last', '3']]) && p1.sep === ',' && p1.open === false, j(p1.rows));
    check('each row keeps its number on the sheet, so a reason can name it, past a blank line and a row of blank cells', j(p1.nums) === j([1, 2, 3, 6]), j(p1.nums));
    check('a semicolon divides a file written with decimal commas, a tab one with commas in its text, and CR alone ends a line',
        parseCsv('Name;Wt' + NL + 'Rope;1,5' + NL + 'Knife;2,25').sep === ';' && parseCsv('Name' + TAB + 'Notes' + NL + 'Rope' + TAB + 'Long, strong' + NL + 'Knife' + TAB + 'Sharp').sep === TAB && j(parseCsv('a,b' + CR + 'c,d').rows) === j([['a', 'b'], ['c', 'd']]));
    check('a first line sep=; says the divider and is no row, and a divider handed in wins', j(parseCsv('sep=;' + NL + 'a;b' + NL + '1;2').rows) === j([['a', 'b'], ['1', '2']]) && j(parseCsv('a;b,c', ',').rows) === j([['a;b', 'c']]));
    check('a quote opens only at the start of a cell: a mark for inches is a character, and it does not turn the divider off', j(parseCsv('Knife,5" blade,3' + NL + 'Rope,long,1').rows) === j([['Knife', '5" blade', '3'], ['Rope', 'long', '1']]) && sniffSep('Knife 5" blade;3' + NL + 'Rope;1') === ';');
    const un = parseCsv('a,b' + NL + '"never closed,1' + NL + 'still it');
    check('a quote that never closes reads to the end and is marked', un.open === true && j(un.rows[1]) === j(['never closed,1' + NL + 'still it']), j(un));
    check('a trailing divider is an empty last cell, and text after a closing quote stays with its cell', j(parseCsv('a,b,' + NL).rows) === j([['a', 'b', '']]) && j(parseCsv('"a"b,c').rows) === j([['ab', 'c']]));
    {   // a seeded round trip through a writer of the suite's own, on every divider and line end
        let seed = 7, bad = null; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
        const bits = ['a', 'Rope', '1.5', ' ', '"', ',', ';', TAB, NL, CR + NL, 'é', '😀', '=1+1', '<b>'];
        for (let r = 0; r < 400 && !bad; r++) {
            const sep = [',', ';', TAB][rnd(3)], eol = [NL, CR + NL, CR][rnd(3)], w = 1 + rnd(5), rows = [];
            for (let y = 0; y < 1 + rnd(6); y++) { const row = []; for (let x = 0; x < w; x++) { let c = ''; for (let k = rnd(4); k > 0; k--) c += bits[rnd(bits.length)]; row.push(c); } row[0] = 'r' + row[0]; rows.push(row); }
            const txt = rows.map(row => row.map(c => (/[",;\t\r\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(sep)).join(eol) + eol, got = parseCsv(txt, sep);
            if (j(got.rows) !== j(rows)) bad = j([txt, got.rows, rows]);
        }
        check('400 seeded tables written by a writer of the suite\'s own come back cell for cell, on each divider and line end', !bad, bad);
    }
    const wide = 'x,'.repeat(CSV.cols + 4) + 'x', long = parseCsv('a,"' + 'y'.repeat(CSV.cell + 9) + '"' + NL + wide), many = parseCsv(Array.from({ length: CSV.rows + 8 }, (_, i) => 'r' + i).join(NL));
    check('what is read is bounded and what is cut is counted: a row past the rows held (the first row may be headings), a column past the columns, a cell past its length',
        many.rows.length === CSV.rows + 1 && many.cut.rows === 7 && long.rows[1].length === CSV.cols && long.cut.cols === 5 && long.rows[0][1].length === CSV.cell && long.cut.cells === 1, j([many.rows.length, many.cut, long.cut]));
    check('the bounds are the library\'s own: 16 MB and a pack\'s entries', CSV.bytes === L.LIB.fileBytes && CSV.rows === L.LIB.entries);
    const t0 = Date.now(), bigQ = parseCsv('"' + '""'.repeat(1500000) + '"'), bigC = parseCsv(',a'.repeat(2000000)); const ms = Date.now() - t0;
    check('a hostile file of a few MB is read in one pass: a cell of three million quotes, a line of four million cells', bigQ.rows.length === 1 && bigC.cut.cols > 0 && ms < 4000, ms);
    {
        const lat = new Uint8Array([0x4E, 0x61, 0x6D, 0x65, 0x0A, 0x43, 0x61, 0x66, 0xE9]);   // Café in the Western code page
        const le = new Uint8Array([0xFF, 0xFE, 0x4E, 0x00, 0x0A, 0x00, 0xE9, 0x00]), be = new Uint8Array([0xFE, 0xFF, 0x00, 0x4E, 0x00, 0x0A, 0x00, 0xE9]), u8 = enc(BOM + 'Name'), plain = enc('Café');
        check('a file is read as it was saved: UTF-8 with or without its mark, UTF-16 either way round, and the Western code page where it is not valid UTF-8',
            csvText(u8).text === 'Name' && csvText(u8).enc === 'utf-8' && csvText(plain).text === 'Café' && csvText(le).text === 'N' + NL + 'é' && csvText(le).enc === 'utf-16le' && csvText(be).text === 'N' + NL + 'é' && csvText(lat).text === 'Name' + NL + 'Café' && csvText(lat).enc === 'windows-1252', j([csvText(le), csvText(be), csvText(lat)]));
    }
    check('what cannot be read as a spreadsheet says so in words: too large, empty, a workbook of either kind, binary, nothing but blank rows',
        /too large/.test(readCsv(new Uint8Array(CSV.bytes + 1)).error) && /empty/.test(readCsv(new Uint8Array(0)).error) && /workbook/.test(readCsv(new Uint8Array([0x50, 0x4B, 3, 4, 0])).error) && /workbook/.test(readCsv(new Uint8Array([0xD0, 0xCF, 0x11, 0xE0])).error)
        && /does not read/.test(readCsv(new Uint8Array([0x41, 0, 0x42, 0, 0x43, 0])).error) && /no rows/.test(readCsv(enc(',,,' + NL + ' , ' + NL)).error));
    check('a file read carries its table and how it was read', (t => t.rows.length === 2 && t.enc === 'utf-8' && t.sep === ',')(readCsv(enc('a,b' + NL + '1,2'))));

    /* ---- what goes where ---- */
    const sys = S.cleanSystem({ v: 1, name: 'L', rolls: [], fields: [
        { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', list: { cats: ['Weapon', 'Tool'], stats: [{ key: 'Wt', label: 'Weight' }, { key: 'Cost', label: 'Cost' }, { key: 'Edge', label: 'Edge', kind: 'pick', opts: [{ label: 'Sharp', name: 'A' }, { label: 'Blunt', name: 'B' }] }, { key: 'Grade', label: 'Grade', labels: ['Poor', 'Fine', 'Masterwork'] }] } },
        { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', list: { cats: ['Skill'], stats: [{ key: 'Diff', label: 'Difficulty' }] } }] }, { F, gmView: true });
    const stats = csvStats(sys, 'f_gear'), tg = csvTargets(stats), ctx = L.libCtx(sys, F, true);
    const heads = ['Item', 'Weight (lb)', 'COST', 'Edge', 'Description', 'Type', 'Grade', 'Mystery', 'Notes', 'Damage', 'Key', 'Id', 'Tags', 'Page'];
    const guessed = guessMap(heads, tg);
    check('each column is guessed by its heading, with or without what stands in brackets, and a heading that reads like nothing is left out',
        j(guessed) === j(['name', 'st:Wt', 'st:Cost', 'st:Edge', 'desc', 'category', 'st:Grade', '', 'notes', 'damage', 'key', 'id', 'tags', 'ref']), j(guessed));
    check('a stat comes before what an entry holds: a list\'s Cost is that stat, and with no such stat Cost is the entry\'s own', guessMap(['Cost'], tg)[0] === 'st:Cost' && guessMap(['Cost'], csvTargets([]))[0] === 'cost');
    check('a target goes to one column, the first, and setting a column takes the target from the one that held it', j(guessMap(['Name', 'Title', 'Item'], tg)) === j(['name', '', '']) && j(setTarget(['name', 'desc', ''], 2, 'name')) === j(['', 'desc', 'name']) && j(setTarget(['name', 'desc'], 0, '')) === j(['', 'desc']));
    check('kept choices stay when the list changes, a stat that list has not goes, and the rest is guessed again', j(guessMap(['Name', 'Difficulty', 'Weight'], csvTargets(csvStats(sys, 'f_sk')), ['name', '', 'st:Wt'])) === j(['name', 'st:Diff', '']));
    check('a heading may hold a word every object has: a column named so is left out, and it finds nothing', j(guessMap(['__proto__', 'constructor', 'toString'], tg)) === j(['', '', '']));
    check('the list a file is for is the one the most headings name a stat of, else the only one, else none', bestList(sys, ['Name', 'Difficulty']) === 'f_sk' && bestList(sys, ['Name', 'Weight', 'Cost']) === 'f_gear' && bestList(sys, ['Name']) === '' && bestList({ fields: [sys.fields[0]] }, ['Name']) === 'f_gear');
    check('a list\'s stats are read with their kinds: a number, a choice\'s options, a number\'s value names', j(csvStats(sys, 'f_gear').map(s => s.kind)) === j(['num', 'num', 'pick', 'named']) && j(csvStats(sys, 'f_gear')[2].opts) === j(['Sharp', 'Blunt']) && csvStats(sys, '').length === 5);
    check('the headings are the first row\'s, or Column and a number; the first row is no heading where it holds a figure', j(headsOf({ rows: [['A', ''], ['1', '2']] }, true)) === j(['A', 'Column 2']) && j(headsOf({ rows: [['A', 'B']] }, false)) === j(['Column 1', 'Column 2']) && headLooks({ rows: [['Name', 'Wt']], sep: ',' }) === true && headLooks({ rows: [['Rope', '1.5']], sep: ',' }) === false);
    check('a figure reads as a spreadsheet writes it: a sign, a currency mark, thousands, a decimal comma where the divider leaves room for one, and nothing else',
        j([readNum('1.5', ','), readNum('-2', ','), readNum('+3', ','), readNum('$5.25', ','), readNum('1,000', ','), readNum('1,234,567.5', ','), readNum('2,5', ';'), readNum('1.234,5', ';'), readNum('5 €', ';'), readNum('2,5', ','), readNum('1,234', ';')]) === j([1.5, -2, 3, 5.25, 1000, 1234567.5, 2.5, 1234.5, 5, 2.5, 1.234])
        && [readNum('heavy', ','), readNum('', ','), readNum('1e999', ','), readNum('0x10', ','), readNum('1.2.3', ',')].every(x => x === undefined));

    /* ---- the rows as entries ---- */
    const table = s => { const t = readCsv(enc(s)); if (t.error) throw new Error(t.error); return t; };
    const file1 = 'Name,Weight,Edge,Grade,Type,Description' + NL + 'Rope,1.5,Blunt,Fine,Tool,"Fifty feet, of rope"' + NL + 'Knife,heavy,Wet,2,Weapon,Sharp.' + NL + ',1,,,,' + NL + 'Rope,2,Blunt,Odd,Tool,' + NL;
    const t1 = table(file1), h1 = headsOf(t1, true), m1 = guessMap(h1, tg), d1 = csvEntries(t1, m1, stats, ctx, { name: 'Shop goods', hasHead: true });
    check('the rows come in cleaned as any entry is: a choice as its option, a value name as its figure, a number, the description', d1.entries.length === 3 && j(d1.entries[0].stats) === j({ Wt: 1.5, Edge: 'Blunt', Grade: 1 }) && d1.entries[0].desc === 'Fifty feet, of rope' && d1.entries[0].category === 'Tool' && d1.entries.every(e => /^i_[0-9a-f]{8}$/.test(e.id) && e.vis === 'all'), j(d1.entries[0]));
    check('a row with no name cannot be read, and is counted and named by its row on the sheet', d1.dropped === 1 && d1.rows === 4 && d1.reasons.some(r => /^row 4: it has no name/.test(r)), j(d1.reasons));
    check('a cell that cannot be used is left out of a row that comes in, counted, and said with its stat and what it read', d1.cells === 3 && d1.entries[1].stats.Grade === 2 && !('Wt' in d1.entries[1].stats) && d1.reasons.some(r => /row 3: Weight reads .heavy., which is not a number/.test(r)) && d1.reasons.some(r => /row 3: Edge reads .Wet., which is not one of its choices/.test(r)) && d1.reasons.some(r => /row 5: Grade reads .Odd./.test(r)), j(d1.reasons));
    check('a row that repeats a name and category is an entry of its own, and is said', d1.repeats === 1 && d1.entries[0].id !== d1.entries[2].id);
    check('the answer has the shape of a pack file read, so an import reads it as it reads one', ['name', 'vis', 'entries', 'dropped', 'reasons'].every(k => k in d1) && d1.name === 'Shop goods' && d1.vis === 'all');
    const planNew = L.packImportPlan([], null, d1, 'new');
    check('a new pack through the import\'s own plan', planNew.add === 3 && planNew.invalid === 1 && planNew.entries.length === 3, j(planNew));
    const libA = [{ id: 'p_a', name: 'Shop', entries: planNew.entries }], again = csvEntries(table(file1), m1, stats, ctx, { hasHead: true }), planSame = L.packImportPlan(libA, 'p_a', again, 'id');
    check('the same sheet read again finds what it made: an id comes from what the row is, so a merge by id changes nothing', j(again.entries.map(e => e.id)) === j(d1.entries.map(e => e.id)) && planSame.add === 0 && planSame.update === 0 && planSame.same === 3, j(planSame));
    const planUp = L.packImportPlan(libA, 'p_a', csvEntries(table(file1.replace('Rope,1.5', 'Rope,9')), m1, stats, ctx, { hasHead: true }), 'id');
    check('a changed row updates its entry, and the rest stay', planUp.update === 1 && planUp.same === 2 && planUp.add === 0 && planUp.entries.filter(e => e.stats.Wt === 9).length === 1, j([planUp.add, planUp.update, planUp.same]));
    {   // a CSV import judges a key and a full pack as a pack file does
        const keyed = 'Name,Key,Weight' + NL + 'Hammer,Hammer,3' + NL + 'Saw,Saw,2' + NL, tk = table(keyed), dk = csvEntries(tk, guessMap(headsOf(tk, true), tg), stats, ctx, {});
        const held = [{ id: 'i_held', name: 'Old hammer', key: 'hammer', vis: 'all' }], other = [{ id: 'i_oth', name: 'Other saw', key: 'Saw', vis: 'all' }];
        const byKey = L.packImportPlan([{ id: 'p_a', name: 'A', entries: held }, { id: 'p_b', name: 'B', entries: other }], 'p_a', dk, 'key');
        check('merged by key, a row takes the place of the entry of that key and keeps its id, and a key another pack holds is counted as a clash, as a pack file\'s is',
            byKey.update === 1 && byKey.add === 1 && byKey.entries[0].id === 'i_held' && byKey.entries[0].name === 'Hammer' && byKey.clash === 1, j(byKey));
        const pf = L.readPackImport(JSON.stringify({ format: 'waypoint-pack', name: 'P', entries: dk.entries }), ctx), pa = L.packImportPlan([{ id: 'p_a', name: 'A', entries: held }], 'p_a', pf, 'key'), pb = L.packImportPlan([{ id: 'p_a', name: 'A', entries: held }], 'p_a', dk, 'key');
        check('a spreadsheet and a pack file of the same entries give the same plan', j(pa.entries) === j(pb.entries) && pa.add === pb.add && pa.update === pb.update && pa.clash === pb.clash);
        const full = L.packImportPlan([{ id: 'p_a', name: 'A', entries: Array.from({ length: L.LIB.entries }, (_, i) => ({ id: 'i_x' + i, name: 'x', vis: 'all' })) }], 'p_a', dk, 'id');
        check('a full pack refuses a spreadsheet\'s rows as it refuses a file\'s', full.add === 0 && full.skip === 2 && full.reasons.some(r => /past 10000 entries/.test(r)));
    }
    {
        const all = 'Name,Category,Key,Who sees it,Starts at level,By level,Tags,Reference,Icon,Damage,GM notes,Id' + NL + 'Sling,Weapon,Sling,GM only,2,"1: small' + NL + '2: large","a, b; c",Core p. 9,*,1d6,Secret words,i_sling' + NL + 'Stone,Tool,no key!,maybe,x,no levels,,,,,,bad id' + NL + 'Sling two,Tool,,,,,,,,,,i_sling' + NL;
        const ta = table(all), ma = guessMap(headsOf(ta, true), tg), da = csvEntries(ta, ma, stats, ctx, {}), sl = da.entries[0], so = da.entries[1];
        check('every box a column can go to: the key, who sees it, the level, by level, tags, a reference, an icon, damage, GM notes and an id', sl.id === 'i_sling' && sl.key === 'Sling' && sl.vis === 'gm' && sl.lvl === 2 && j(sl.lvls.map(l => l.lvl)) === j([1, 2]) && j(sl.tags) === j(['a', 'b', 'c']) && sl.ref === 'Core p. 9' && sl.damage === '1d6' && sl.gmNotes === 'Secret words' && sl.icon === '*', j(sl));
        check('a key that cannot be used is left out and said, a level that is no number too, a By level with no line, an id that is no id', !so.key && !('lvl' in so) && !so.lvls && /^i_[0-9a-f]{8}$/.test(so.id) && ['Key reads', 'Starts at level reads', 'By level holds no line', 'Id reads'].every(w => da.reasons.some(r => r.indexOf('row 3: ' + w) === 0)), j(da.reasons));
        check('a word for who sees it that cannot be read stays GM only, never shown by mistake', so.vis === 'gm' && da.reasons.some(r => /Who sees it reads .maybe., so it stays GM only/.test(r)), so.vis);
        check('an id named twice is the first row\'s, and the second cannot be read', da.dropped === 1 && da.reasons.some(r => /^row 4: its id is used by a row above/.test(r)) && da.entries.length === 2, j(da.reasons));
    }
    {
        const opt = S.cleanSystem({ v: 1, name: 'L', rolls: [], fields: [{ id: 'f_g', key: 'Gear', kind: 'item-list', list: { stats: [{ key: 'Slot', label: 'Slot', labels: ['Head', 'Hand', 'Foot'] }], on: { label: 'Worn', over: 'Slot' } } }] }, { F, gmView: true }), so = csvStats(opt, ''), to = table('Name,Slot' + NL + 'Hat,Head' + NL + 'Gloves,"Hand, Foot"' + NL + 'Wings,Back' + NL + 'Coat,3' + NL), dO = csvEntries(to, guessMap(headsOf(to, true), csvTargets(so)), so, L.libCtx(opt, F, true), {});
        check('a stat read as a set of places takes its places by name, or as its number, and names a place it does not have', so[0].kind === 'set' && dO.entries[0].stats.Slot === 1 && dO.entries[1].stats.Slot === 6 && dO.entries[3].stats.Slot === 3 && !dO.entries[2].stats && dO.reasons.some(r => /Slot reads .Back., which names a place/.test(r)), j(dO));
    }
    const noName = csvEntries(t1, m1.map(x => (x === 'name' ? '' : x)), stats, ctx, {});
    check('with no column for the name nothing comes in, and the window is told to ask', noName.needName === true && noName.entries.length === 0);
    const dCat = csvEntries(table('Name' + NL + 'A' + NL + 'B' + NL), ['name'], [], ctx, { hasHead: true, cat: 'Tool' });
    check('rows with no category take the one the GM gives, and a row\'s own stands', dCat.entries.every(e => e.category === 'Tool') && csvEntries(table('Name,Type' + NL + 'A,Weapon' + NL + 'B,' + NL), ['name', 'category'], [], ctx, { hasHead: true, cat: 'Tool' }).entries.map(e => e.category).join() === 'Weapon,Tool');
    check('the reasons stop at the library\'s number and the rest are counted', (d => d.reasons.length === L.LIB.reasons && d.more === 10)(csvEntries(table('Name' + NL + ',x' + NL.repeat(1) + Array.from({ length: 29 }, (_, i) => ',x' + i).join(NL)), ['name'], [], ctx, { hasHead: true })));
    {
        const longT = table('Name,Description' + NL + 'n'.repeat(300) + ',' + 'd'.repeat(L.LIB.desc + 5) + NL), dl = csvEntries(longT, ['name', 'desc'], [], ctx, { hasHead: true });
        check('a text longer than an entry holds is cut as any entry\'s is, and said', dl.entries[0].name.length === S.LIMITS.itemName && dl.entries[0].desc.length === L.LIB.desc && dl.cells === 2, j(dl.reasons));
    }
    const pv = csvPreview(d1, stats, m1);
    check('the rows as they will come in are read from the cleaned entries, the name, the category and the stats a column goes to, the first few', j(pv.cols) === j(['Name', 'Category', 'Weight', 'Edge', 'Grade']) && j(pv.rows[0]) === j(['Rope', 'Tool', '1.5', 'Blunt', '1']) && pv.rows.length === 3 && csvPreview({ entries: Array.from({ length: 30 }, (_, i) => ({ name: 'n' + i })) }, [], []).rows.length === CSV.show, j(pv));
    check('rows a list would not offer are said: none with no category named, a category it does not take', j(csvCats(sys, 'f_gear', [{ category: 'Tool' }, { category: 'tool' }, { category: 'Spell' }, { category: '' }, { category: 'Spell' }])) === j({ none: 1, off: ['Spell'] }) && j(csvCats({ fields: [] }, '', [{ category: 'Spell' }])) === j({ none: 0, off: [] }));
    {   // a hostile file: words every object has, in every cell and heading
        const h = table('Name,__proto__,constructor' + NL + '__proto__,1,2' + NL + 'constructor,3,4' + NL), dh = csvEntries(h, ['name', '', ''], stats, ctx, { hasHead: true });
        check('a cell or a heading named as a word every object has changes no prototype', dh.entries.length === 2 && ({}).polluted === undefined && typeof ({}).toString === 'function' && dh.entries[0].name === '__proto__');
    }

    /* ---- a row made an entry ---- */
    const srcE = { id: 'i_rope', key: 'Rope', name: 'Rope', category: 'Tool', vis: 'all', notes: 'Fifty feet.', desc: 'Long.', mods: [{ f: 'f_x', op: 'add', v: 1 }], stats: { Wt: 1 } };
    const sysR = { fields: [sys.fields[0]], items: [srcE] };
    const rowCopy = { id: 'w_1', defId: 'i_rope', qty: 2, ov: { name: 'Old rope', stats: { Wt: 7 } }, note: 'Kael gave it.', lvl: 3, hid: 1, keptOn: 1 }, rdCopy = S.rowDef(sysR, rowCopy);
    const rowPlain = { id: 'w_2', defId: 'i_rope', qty: 1 }, rdPlain = S.rowDef(sysR, rowPlain);
    const rowOwn = { id: 'w_3', qty: 1, own: 1, def: { name: 'Lucky pebble', category: '', notes: 'Warm.', desc: 'It hums.', stats: { Wt: 1 }, mods: [{ f: 'f_x', op: 'add', v: 2 }], vis: 'all', key: 'Pebble' } }, rdOwn = S.rowDef(sysR, rowOwn);
    const rowGm = { id: 'w_4', qty: 1, def: { name: 'Secret', vis: 'gm' } }, rowLost = { id: 'w_5', defId: 'i_gone', qty: 1, snap: { name: 'Gone thing', vis: 'all', key: 'Gone' } }, rowLostGm = { id: 'w_6', defId: 'i_gone', qty: 1, snap: { name: 'Gone secret', vis: 'gm' } };
    const yes = () => true, no = () => false;
    check('which rows may be taken: a row of the character\'s own, a copy with values of its own, a copy of a deleted entry; never a plain copy of an entry that is there, a GM-only item, a copy of one players may not see, or no definition; with no judge a copy fails closed',
        L.rowLibJudge(rdOwn, rowOwn, yes) === '' && L.rowLibJudge(rdCopy, rowCopy, yes) === '' && L.rowLibJudge(S.rowDef(sysR, rowLost), rowLost, yes) === '' && L.rowLibJudge(rdPlain, rowPlain, yes) === 'same' && L.rowLibJudge(S.rowDef(sysR, rowGm), rowGm, yes) === 'gm' && L.rowLibJudge(S.rowDef(sysR, rowLostGm), rowLostGm, yes) === 'gm' && L.rowLibJudge(rdCopy, rowCopy, no) === 'gm' && L.rowLibJudge(rdCopy, rowCopy, undefined) === 'gm' && L.rowLibJudge(null, rowCopy, yes) === 'none');
    check('a row the GM keeps on its character is judged as any row of its kind', L.rowLibJudge(rdCopy, Object.assign({}, rowCopy, { hid: 1, keptOn: 1 }), yes) === '' && L.rowLibJudge(rdPlain, Object.assign({}, rowPlain, { hid: 1, keptOn: 1 }), yes) === 'same');
    check('a row has values of its own only where they say something', L.rowHasOwn({ ov: {} }) === false && L.rowHasOwn({ ov: { stats: {} } }) === false && L.rowHasOwn({ ov: { stats: { Wt: 1 } } }) === true && L.rowHasOwn({ ov: { notes: 'x' } }) === true && L.rowHasOwn({}) === false);
    const ent = L.entryFromRow(rdCopy, sys.fields[0].list), entO = L.entryFromRow(rdOwn, sys.fields[0].list), clO = L.cleanLibEntry(Object.assign({}, entO, { id: 'i_new' }), L.libCtx({ fields: [{ id: 'f_x', key: 'X', kind: 'number' }].concat(sys.fields) }, F, true));
    check('the entry is the row as it reads, its own values folded in, with the text and the changes behind it; a copy\'s key stays with the entry it came from; nothing of the character comes with it',
        ent.name === 'Old rope' && ent.stats.Wt === 7 && ent.desc === 'Long.' && ent.notes === 'Fifty feet.' && j(ent.mods) === j(srcE.mods) && !('key' in ent) && !('id' in ent) && ent.vis === 'all' && !['note', 'lvl', 'hid', 'keptOn', 'qty', 'ov', 'defId'].some(k => k in ent), j(ent));
    check('a row of the character\'s own keeps its key, takes its list\'s first category where it has none, and comes through the cleaner with its stats, text and changes', entO.key === 'Pebble' && entO.category === 'Weapon' && clO.key === 'Pebble' && clO.stats.Wt === 1 && clO.desc === 'It hums.' && clO.notes === 'Warm.' && clO.mods.length === 1, j(clO));
    const rowsBefore = j([rowCopy, rowOwn]); L.entryFromRow(rdCopy, null); L.entryFromRow(rdOwn, null);
    check('making the entry touches no row', j([rowCopy, rowOwn]) === rowsBefore);
    {
        const ps = [{ id: 'p_w', name: 'Weapons', vis: 'all' }, { id: 'p_gm', name: 'Secret', vis: 'gm' }, { id: 'p_t', name: 'Tools', vis: 'all' }, { id: 'p_u', name: 'Unread', vis: 'all' }, { id: 'p_h', name: 'Holds it', vis: 'all' }];
        const by = { p_w: [{ id: 'a', category: 'Spell' }], p_gm: [{ id: 'g', category: 'Tool' }, { id: 'g2', category: 'Tool' }], p_t: [{ id: 'b', category: 'Tool' }, { id: 'c', category: 'tool' }], p_u: [], p_h: [{ id: 'i_rope', category: 'Other' }] }, ready = id => id !== 'p_u', of = id => by[id];
        const a = L.packsForRow(ps, of, { def: { category: 'Tool' }, base: {} }, { cats: ['Tool'] }, ready).map(p => p.id), b = L.packsForRow(ps, of, rdCopy, { cats: ['Weapon'] }, ready).map(p => p.id);
        check('the packs on offer: the list\'s own first, by the most entries of its categories, then the rest in their order, a GM-only pack last, one not read not at all', j(a) === j(['p_t', 'p_w', 'p_h', 'p_gm']), j(a));
        check('a pack that holds the entry the row came from comes first of all', b[0] === 'p_h' && b.indexOf('p_u') < 0 && b[b.length - 1] === 'p_gm', j(b));
    }

    /* ---- the Library window, on a page of plain objects that refuses markup ---- */
    const winS = read('scripts/librarywin.js');
    const cutW = (from, to) => { const i = winS.indexOf(from), k = winS.indexOf(to, i); if (i < 0 || k < 0) throw new Error('catalogcheck: librarywin.js ' + from); return winS.slice(i, k); };
    function pageOf() {
        const doc = { activeElement: null };
        const mk = tag => { const e = { tag, kids: [], on: {}, dataset: {}, style: {}, className: '', id: '', title: '', value: '', type: '', _t: '', parent: null, hidden: false, scrollTop: 0, marks: new Set(),
            appendChild(c) { c.parent = this; this.kids.push(c); return c; }, addEventListener(t, f) { (this.on[t] = this.on[t] || []).push(f); }, setAttribute(k, v) { this[k] = v; }, focus() { doc.activeElement = this; },
            contains(n) { while (n) { if (n === this) return true; n = n.parent; } return false; }, fire(t, ev) { (this.on[t] || []).forEach(f => f(ev || { target: this, preventDefault() {}, stopPropagation() {} })); }, classList: null };
            e.classList = { toggle(c, on) { if (on) e.marks.add(c); else e.marks.delete(c); }, add(c) { e.marks.add(c); }, remove(c) { e.marks.delete(c); }, contains(c) { return e.marks.has(c); } };
            Object.defineProperty(e, 'textContent', { get() { return this._t + this.kids.map(k => (k.textContent === undefined ? '' : k.textContent)).join(''); }, set(v) { this.kids = []; this._t = String(v); } });
            Object.defineProperty(e, 'innerHTML', { get() { return ''; }, set() { throw new Error('markup written'); } }); return e; };
        doc.createElement = mk; doc.createTextNode = t => ({ textContent: String(t), kids: [] });
        const walk = (n, fn) => { fn(n); (n.kids || []).forEach(k => walk(k, fn)); };
        return { doc, mk, walk };
    }
    function winWorld(opts) {
        opts = opts || {}; const P = pageOf(), roots = {}, log = [], toasts = [], store = Object.assign(Object.create(null), opts.store || {});
        ['libForm', 'libGuide', 'libNewPack', 'libNewEntry', 'libraryModal', 'libClose'].forEach(id => { roots[id] = P.mk('div'); roots[id].id = id; });
        const ui = id => { if (roots[id]) return roots[id]; let hit = null; P.walk(roots.libForm, n => { if (!hit && n.id === id) hit = n; }); return hit; };
        const lists = [sys.fields[0], sys.fields[1]], W = { P, ui, log, toasts, store, packsNow: opts.packs || [], work: {}, made: [] };
        const st = { open: true, campId: 'c', packId: opts.packs && opts.packs[0] ? opts.packs[0].id : null, sel: Object.create(null), entryId: null, draftNew: null, imp: null, work: W.work, dirty: {}, shown: [] }; W.st = st;
        const camp = { id: 'c', system: sys, chars: {}, library: { packs: W.packsNow } };
        P.doc.querySelector = q => { let hit = null; if (q === '#libForm .lib-save') P.walk(roots.libForm, n => { if (!hit && /lib-save/.test(n.className)) hit = n; }); return hit; };
        const lb = { createPack: async name => { const p = { id: 'p_new', name, vis: 'all' }; W.packsNow.push(p); W.work.p_new = []; return { id: 'p_new' }; }, setMeta() {}, ready: id => W.packsNow.some(p => p.id === id), entriesOf: id => W.work[id] || [], savePack: opts.savePack || (async (id, list) => { W.work[id] = list; W.saved = { id, n: list.length }; return { ok: true }; }), whole: () => true };
        W.lb = lb;
        const G = { window: { wpStepLog: (a, b, c) => log.push([a, b, c]) }, document: P.doc, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
        const src = cutW('function el(tag, cls, text) {', NL) + NL + cutW('function select(pairs, value) {', NL) + NL + cutW('function field(form, id, label, value, opts) {', NL + '}' + NL) + NL + '}' + NL
            + cutW('// [librarycheck:importinto-start]', '/* ---- entries ---- */') + NL + cutW('// [catalogcheck:take-start]', '// [catalogcheck:take-end]') + NL + cutW('// [catalogcheck:guide-start]', '// [catalogcheck:guide-end]');
        const names = { st, ui, map: () => Object.create(null), camp: () => camp, getActiveCampaign: () => camp, gmCtx: () => ctx, packs: () => W.packsNow, packById: id => W.packsNow.find(p => p.id === id) || null, ready: id => lb.ready(id), workOf: id => W.work[id] || (W.work[id] = []), itemLists: () => lists,
            catList() {}, LIB: L.LIB, LB: () => lb, toast: t => toasts.push(t), plural: n => n + (n === 1 ? ' entry' : ' entries'), showConfirm() {}, schedule() {}, flush: async () => true, renderAll() { W.drawn = (W.drawn || 0) + 1; }, drawRows() {}, packImportPlan: L.packImportPlan, cleanLibEntry: L.cleanLibEntry, libCtx: L.libCtx, newEntryId: L.newEntryId, F: () => F,
            gmHere: () => opts.gmHere !== false, saved: { appState: { campaigns: opts.campaigns || { c: camp } } }, CSV: C.CSV, readCsv: C.readCsv, headsOf: C.headsOf, headLooks: C.headLooks, csvStats: C.csvStats, csvTargets: C.csvTargets, guessMap: C.guessMap, setTarget: C.setTarget, bestList: C.bestList, csvEntries: C.csvEntries, csvPreview: C.csvPreview, csvCats: C.csvCats, renderForm: () => W.draw() };
        Object.keys(G).forEach(k => { names[k] = G[k]; });
        const keys = Object.keys(names), api = new Function(...keys, '"use strict";\n' + src + '\nreturn { csvOpen, csvBox, renderImport, doImport, csvWide, csvRedraw, csvPick, takeEntry, guideOpen, guideSync, guideStart, guideStop, guideAt, guideTip, guidePress, guideWanted, guideNext, guideHolds, field };')(...keys.map(k => names[k]));
        W.api = api; W.draw = () => { roots.libForm.textContent = ''; if (st.imp) api.renderImport(roots.libForm); };
        W.select = (id, v) => { const s = ui(id); s.value = v; s.fire('change'); };
        W.text = () => roots.libForm.textContent;
        W.nodes = () => { const out = []; P.walk(roots.libForm, n => out.push(n)); return out; };
        return W;
    }
    const logged = (W, s) => W.log.filter(l => l[0] === 'catalog v1' && l[1] === s);
    const bytes = s => enc(s);
    {
        const W = winWorld(); W.api.csvOpen('Shop_goods.csv', bytes(file1)); const im = W.st.imp;
        check('a picked file starts the import: the columns guessed, the pack named after the file, the list it reads like, and the rows planned', im && im.csv && im.mode === 'new' && im.csv.pack === 'Shop goods' && im.csv.list === 'f_gear' && im.data.entries.length === 3 && im.csv.hasHead === true, j(im && im.csv && im.csv.map));
        const heads2 = W.nodes().filter(n => n.className === 'lib-csv-head').map(n => n.textContent), sels = W.nodes().filter(n => /^libCsvCol/.test(n.id));
        check('each column is drawn with its heading, its first cell and a list of where it can go, on the guess', j(heads2) === j(h1) && sels.length === h1.length && sels[0].value === 'name' && W.nodes().filter(n => n.className === 'lib-csv-first')[0].textContent === 'Rope' && sels[1].kids.some(o => o.textContent === 'Stat: Weight') && sels[1].kids[0].textContent === 'Leave out', j(heads2));
        check('the rows are shown as they will come in, in a table of text, with the counts of what cannot be read and the reasons', W.nodes().some(n => n.tag === 'table') && /1 row cannot be read/.test(W.text()) && /3 cells could not be used/.test(W.text()) && /row 4: it has no name/.test(W.text()), W.text().slice(0, 600));
        check('the summary is the import\'s own', /Added/.test(W.text()) && /Not valid/.test(W.text()) && W.nodes().some(n => n.className === 'tool lib-save' && !n.disabled));
        check('the form takes the room while the columns are up', (W.api.csvWide(true), W.ui('libraryModal').marks.has('lib-csv-on')) && (W.api.csvWide(false), !W.ui('libraryModal').marks.has('lib-csv-on')));
        W.select('libCsvCol0', '');
        check('with no column for the name it asks for one, shows no rows and cannot be imported', /Pick the column that holds the name/.test(W.text()) && W.nodes().some(n => n.className === 'tool lib-save' && n.disabled === true), W.text().slice(0, 300));
        W.select('libCsvCol1', 'name');
        check('a column set by hand plans the rows again', W.st.imp.data.entries.length > 0 && W.st.imp.data.entries[0].name === '1.5', j(W.st.imp.data.entries[0]));
        W.select('libCsvCol0', 'name');
        check('and takes the target from the column that held it', W.st.imp.csv.map[1] === '' && W.st.imp.csv.map[0] === 'name', j(W.st.imp.csv.map));
        W.st.imp.csv.map[1] = 'st:Wt'; W.api.csvRedraw(W.st.imp);
        W.select('libF_csvHead', 'no');
        check('the first row may be a row like the others', W.st.imp.csv.hasHead === false && W.st.imp.data.rows === 5 && W.nodes().filter(n => n.className === 'lib-csv-head')[0].textContent === 'Column 1', j(W.st.imp.data.rows));
        W.select('libF_csvHead', 'yes');
        W.select('libF_csvList', 'f_sk');
        check('another list offers its own stats, and a stat it has not is left out', !W.st.imp.csv.map.some(x => x === 'st:Wt') && W.ui('libCsvCol0').kids.some(o => o.textContent === 'Stat: Difficulty') && !W.ui('libCsvCol0').kids.some(o => o.textContent === 'Stat: Weight'), j(W.st.imp.csv.map));
        W.select('libF_csvList', 'f_gear');
    }
    {
        const W = winWorld(); W.api.csvOpen('Goods.csv', bytes('Name,Weight' + NL + 'Rope,1' + NL + 'Knife,2' + NL));
        check('with no column for the category the list\'s first is offered for every row', W.st.imp.csv.cat === 'Weapon' && W.st.imp.data.entries.every(e => e.category === 'Weapon'));
        const box = W.ui('libF_csvCat'); box.value = 'Tool'; box.fire('change');
        check('the category for rows with none can be changed', W.st.imp.data.entries.every(e => e.category === 'Tool'));
        const pn = W.ui('libF_imPack'); pn.value = 'Fine goods'; pn.fire('change');
        check('the new pack can be named', W.st.imp.data.name === 'Fine goods');
        await W.api.doImport();
        check('Import makes the pack, through the import\'s own path, and the rows are in it', W.packsNow.some(p => p.name === 'Fine goods') && W.work.p_new.length === 2 && W.st.imp === null && W.toasts.some(t => /2 added/.test(t)), j(W.toasts));
        const cd = logged(W, 'csv-done')[0];
        check('each step is logged, in counts and a status, and no name or cell', logged(W, 'csv-read').length === 1 && cd && cd[2].add === 2 && !/Rope|Knife|Fine goods|Goods/.test(j(W.log)), j(W.log));
    }
    {
        const held = [{ id: 'i_old', key: 'Saw', name: 'Old saw', vis: 'all' }], W = winWorld({ packs: [{ id: 'p_a', name: 'Goods', vis: 'all' }] }); W.work.p_a = held;
        W.api.csvOpen('goods.csv', bytes('Name,Key' + NL + 'Saw,Saw' + NL));
        check('a file named as a pack starts merged into it, by key where a column holds one', W.st.imp.mode === 'key' && W.st.imp.target === 'p_a');
        await W.api.doImport();
        check('and a row takes the place of the entry of that key, keeping its id', W.work.p_a.length === 1 && W.work.p_a[0].id === 'i_old' && W.work.p_a[0].name === 'Saw', j(W.work.p_a));
        const W2 = winWorld({ packs: [{ id: 'p_a', name: 'Goods', vis: 'all' }] }); W2.api.csvOpen('goods.csv', bytes('Name' + NL + 'Saw' + NL));
        check('by id where none does', W2.st.imp.mode === 'id');
    }
    {
        const W = winWorld(); W.api.csvOpen('x.csv', new Uint8Array([0x50, 0x4B, 3, 4]));
        check('a file that cannot be read says so and starts nothing, and the step is logged', W.st.imp === null && /workbook/.test(W.toasts[0]) && logged(W, 'csv-refused').length === 1);
        const W3 = winWorld(), cutT = 'Name,"open' + NL + 'r'; W3.api.csvOpen('c.csv', bytes(Array.from({ length: CSV.rows + 4 }, (_, i) => 'r' + i).join(NL)));
        check('what was cut is said in the panel', /Only the first 10000 rows were read. 3 rows were left out/.test(W3.text()), W3.text().slice(0, 300));
        const W4 = winWorld(); W4.api.csvOpen('c.csv', bytes(cutT));
        check('a quote that never closes is said', /A quote in the file never closes/.test(W4.text()));
    }
    {   // a row taken into the library, the window's half
        const packs = [{ id: 'p_a', name: 'Goods', vis: 'all' }, { id: 'p_b', name: 'Other', vis: 'all' }], W = winWorld({ packs }); W.work.p_a = [{ id: 'i_a', name: 'A', key: 'Saw', vis: 'all' }]; W.work.p_b = [];
        const r = await W.api.takeEntry('p_a', { name: 'Lucky pebble', key: 'Saw', desc: 'It hums.', stats: { Wt: 2 }, vis: 'all', category: 'Tool' });
        check('a row taken goes into the pack through the import\'s own plan, cleaned, under a fresh id', r.ok === true && r.name === 'Lucky pebble' && r.pack === 'Goods' && W.work.p_a.length === 2 && /^i_[a-z0-9]{8}$/.test(W.work.p_a[1].id) && W.work.p_a[1].stats.Wt === 2 && W.work.p_a[1].desc === 'It hums.', j(r));
        check('a key another entry holds is counted, and the step is logged in counts', r.clash === 1 && logged(W, 'row-added')[0][2].clash === 1 && !/pebble/i.test(j(W.log)), j(W.log));
        const rNew = await W.api.takeEntry(null, { name: 'Stone', vis: 'all' }, 'Made at the table');
        check('a new pack on offer: it is made and the entry goes in', rNew.ok === true && W.packsNow.some(p => p.name === 'Made at the table') && W.work.p_new.length === 1 && rNew.pack === 'Made at the table', j(rNew));
        const rUn = await W.api.takeEntry('p_zz', { name: 'Stone', vis: 'all' });
        check('a pack not read is refused, and nothing is written over it', !!rUn.error && logged(W, 'row-refused').length === 1);
        const Wf = winWorld({ packs: [{ id: 'p_a', name: 'Full', vis: 'all' }] }); Wf.work.p_a = Array.from({ length: L.LIB.entries }, (_, i) => ({ id: 'i_x' + i, name: 'x', vis: 'all' }));
        const rF = await Wf.api.takeEntry('p_a', { name: 'Stone', vis: 'all' });
        check('a full pack refuses it in the import\'s words', /past 10000 entries/.test(rF.error) && !Wf.saved, j(rF));
        const Wn = winWorld({ gmHere: false, packs }); Wn.work.p_a = []; const rN = await Wn.api.takeEntry('p_a', { name: 'Stone', vis: 'all' });
        check('never on a machine that is not the GM\'s', !!rN.error && !Wn.saved);
        const Wb = winWorld({ packs, savePack: async () => ({ error: 'The pack could not be written.' }) }); Wb.work.p_a = []; const rB = await Wb.api.takeEntry('p_a', { name: 'Stone', vis: 'all' });
        check('a pack that cannot be written says so', /could not be written/.test(rB.error) && logged(Wb, 'row-refused').length === 1);
    }
    {   // the guide
        const W = winWorld(); W.api.guideOpen(); const box = W.ui('libGuide'), btn = t => box.kids.find(k => k.textContent === t);
        check('an empty library offers the guide, and logs it', box.hidden === false && /first pack/.test(box.textContent) && !!btn('Show me') && !!btn('No thanks') && logged(W, 'guide-offered').length === 1, box.textContent);
        btn('Show me').fire('click');
        check('step 1 points at the window\'s own + Pack', /Step 1 of 3/.test(box.textContent) && W.ui('libNewPack').marks.has('lib-guide-at'));
        W.ui('libNewPack').fire('click'); W.api.guidePress({ target: W.ui('libNewPack') });
        check('a press on what it asks for keeps it up', W.st.g && W.st.g.step === 'pack');
        W.api.guideAt('pack');
        check('a pack made, step 2 points at + Entry', /Step 2 of 3/.test(box.textContent) && W.ui('libNewEntry').marks.has('lib-guide-at') && !W.ui('libNewPack').marks.has('lib-guide-at'));
        W.st.draftNew = { id: 'i_d', name: '' }; W.api.guideAt('entry');
        const fm = W.P.mk('div'); ['name', 'key', 'category', 'icon', 'vis', 'lvl', 'lvlOnly', 'st_wt', 'st_cost', 'notes', 'desc', 'lvls', 'tags', 'ref', 'damage'].forEach(id => W.api.field(fm, id, 'L', ''));
        check('step 3 puts a word under each box of the window\'s own form, and one for the stats', /Step 3 of 3/.test(box.textContent) && fm.kids.filter(k => k.className === 'lib-guide-tip').length === 13, fm.kids.filter(k => k.className === 'lib-guide-tip').length);
        W.api.guidePress({ target: W.ui('libForm') });
        check('typing in the form keeps it up', W.st.g && W.st.g.step === 'fill');
        W.st.draftNew = null; W.api.guideSync();
        check('a draft let go goes back to the step before', W.st.g.step === 'entry');
        W.st.draftNew = { id: 'i_d', name: '' }; W.api.guideAt('entry'); W.st.draftNew = null; W.api.guideAt('saved');
        check('an entry saved ends it, this computer remembers, and it says what comes next', W.st.g.step === 'done' && W.store.wp_libGuide === 'done' && /first pack/.test(box.textContent) && logged(W, 'guide-done').length === 1, box.textContent);
        btn('Done').fire('click');
        check('Done puts it away', box.hidden === true && W.st.g === null);
        const W2 = winWorld({ store: { wp_libGuide: 'done' } }); W2.api.guideOpen();
        check('done, it is not offered again', W2.ui('libGuide').hidden === true && W2.api.guideWanted() === false);
        const W3 = winWorld(); W3.api.guideOpen(); W3.ui('libGuide').kids.find(k => k.textContent === 'No thanks').fire('click');
        check('dismissed, it is put away and remembered', W3.ui('libGuide').hidden === true && W3.store.wp_libGuide === 'no' && logged(W3, 'guide-closed').length === 1);
        const W4 = winWorld(); W4.api.guideOpen(); W4.api.guidePress({ target: W4.ui('libNewPack') });
        check('a press on anything else while it is offered puts it aside for this opening, with nothing remembered', W4.ui('libGuide').hidden === true && !W4.store.wp_libGuide && logged(W4, 'guide-aside').length === 1);
        W4.api.guideOpen();
        check('so it is offered again at the next opening, while the library is still empty', W4.ui('libGuide').hidden === false);
        const W5 = winWorld(); W5.api.guideOpen(); W5.api.guideStart(); W5.api.guidePress({ target: W5.ui('libClose') });
        check('it stands aside in mid-walk too', W5.st.g === null && W5.ui('libGuide').hidden === true && !W5.store.wp_libGuide);
        const W6 = winWorld({ packs: [{ id: 'p_a', name: 'A', vis: 'all' }] }); W6.api.guideOpen();
        check('a GM with packs never sees it', W6.ui('libGuide').hidden === true && W6.api.guideWanted() === false);
        const W7 = winWorld({ campaigns: { c: { library: { packs: [] } }, other: { library: { packs: [{ id: 'p_z' }] } } } }); W7.api.guideOpen();
        check('nor a GM with packs in another campaign', W7.ui('libGuide').hidden === true);
        const W8 = winWorld(); W8.store = null; W8.api.guideStop('no'); check('a computer that keeps nothing still works', W8.st.g === null);
        const W9 = winWorld(); W9.api.guideOpen(); W9.api.guideStart(); W9.api.guideStop('no');
        check('Stop the guide is a dismissal', W9.store.wp_libGuide === 'no');
        const fmP = W9.P.mk('div'); W9.api.field(fmP, 'name', 'Name', ''); check('with no guide the form has no words of its own', fmP.kids.length === 1);
        check('the guide\'s steps, as a rule', W9.api.guideNext('pack', 'pack') === 'entry' && W9.api.guideNext('entry', 'entry') === 'fill' && W9.api.guideNext('fill', 'saved') === 'done' && W9.api.guideNext('pack', 'saved') === 'pack' && W9.api.guideHolds('offer', 'strip') === true && W9.api.guideHolds('offer', 'pack') === false && W9.api.guideHolds('pack', 'form') === false && W9.api.guideHolds('fill', 'form') === true);
    }

    /* ---- a row taken from the sheet, the sheet's half, on a page of plain objects ---- */
    {
        const shS = read('scripts/sheets.js'), cutS = (from, to) => { const i = shS.indexOf(from), k = shS.indexOf(to, i); if (i < 0 || k < 0) throw new Error('catalogcheck: sheets.js ' + from); return shS.slice(i, k); };
        const rowSrc = 'var _ldPop = null;' + NL + cutS('function closeLoadMenu() {', NL) + NL + cutS('function ldOutside(e) {', NL) + NL + cutS('function ldKey(e) {', NL) + NL + cutS('// [catalogcheck:rowlib-start]', '// [catalogcheck:rowlib-end]');
        const world = (o) => {
            o = o || {}; const P = pageOf(), toasts = [], prompts = [], added = [], docBody = P.mk('body');
            const doc = Object.assign(P.doc, { body: docBody, addEventListener() {}, removeEventListener() {} }), row = o.row || rowOwn, camp = { id: 'c', system: sysR, chars: {}, library: { packs: [{ id: 'p_a', name: 'Goods', vis: 'all' }, { id: 'p_t', name: 'Tools', vis: 'all' }, { id: 'p_g', name: 'Secret', vis: 'gm' }] } };
            const ch = { id: 'k', values: { f_gear: [row] } }, win = { innerWidth: 1000, innerHeight: 800, wpLibrary: { needShown: o.shown || yes, entriesOf: id => (id === 'p_t' ? [{ id: 'x', category: 'Weapon' }] : []), ready: () => true }, wpLibraryWin: { canTake: () => o.take !== false, takeEntry: async (id, e, nn) => { added.push([id, e, nn]); return o.result || { ok: true, name: e.name, pack: 'Tools', clash: 0 }; } } };
            const pop = () => docBody.kids[docBody.kids.length - 1];
            P.doc.body = docBody; const remove = n => { docBody.kids = docBody.kids.filter(k => k !== n); };
            const mkPop = P.doc.createElement; P.doc.createElement = t => { const e = mkPop(t); e.remove = () => remove(e); e.querySelector = () => e.kids.find(k => k.className === 'sheet-dl-item') || null; e.querySelectorAll = () => e.kids.filter(k => k.className === 'sheet-dl-item'); e.getBoundingClientRect = () => ({ left: 10, bottom: 20 }); return e; };
            const elD = (t, c, x) => { const e = P.doc.createElement(t); if (c) e.className = c; if (x !== undefined && x !== null) e.textContent = x; return e; };
            const names = { window: win, document: doc, el: elD, _fxLive: o.live !== false, rowLibJudge: L.rowLibJudge, entryFromRow: L.entryFromRow, packsForRow: L.packsForRow, getActiveCampaign: () => camp, charById: () => ch, rowDef: S.rowDef, systemOf: c => c.system, rowIdOf: r => r.id, toast: t => toasts.push(t), showPrompt: (a, b, cb) => prompts.push([a, cb]), Math };
            const keys = Object.keys(names), api = new Function(...keys, '"use strict";\n' + rowSrc + '\nreturn { rowLibOk, rowLibHook, rowLibBtn, rowLibPacks, rowLibSend };')(...keys.map(k => names[k]));
            return { P, el: elD, api, toasts, prompts, added, pop, ch, row, spec: sys.fields[0].list, f: { id: 'f_gear' }, body: docBody };
        };
        const W = world(), line = W.el('div', 'sheet-item'), rd0 = S.rowDef(sysR, rowOwn), before = j(rowOwn);
        W.api.rowLibHook(line, rowOwn, rd0, W.ch, W.f, W.spec, true);
        check('a right-click on a row the GM may take offers Add to the library', (line.on.contextmenu || []).length === 1);
        let stopped = 0; line.fire('contextmenu', { clientX: 40, clientY: 50, preventDefault() { stopped++; }, stopPropagation() { stopped++; } });
        const p1m = W.pop();
        check('as the sheet\'s own menu, one row in plain words, at the pointer, with the browser\'s own menu held back', stopped === 2 && /sheet-dl-pop/.test(p1m.className) && p1m.kids.length === 1 && /Add to the library/.test(p1m.textContent) && p1m.style.left === '40px', p1m.textContent);
        p1m.kids[0].fire('click', { preventDefault() {} });
        const p2 = W.pop(), its = p2.kids.filter(k => k.className === 'sheet-dl-item').map(k => k.textContent);
        check('it asks which pack, naming the row, the list\'s own first, a GM-only pack last and said, and a new pack on offer', /Lucky pebble/.test(p2.kids[0].textContent) && /^Tools/.test(its[0]) && /^Goods/.test(its[1]) && /^Secret.*GM only/.test(its[2]) && /^A new pack/.test(its[3]) && its.length === 4 && W.body.kids.length === 1, j(its));
        p2.kids[1].fire('click', { preventDefault() {} }); await new Promise(r => setImmediate(r));
        check('a pack picked takes the entry made from the row, and says that the row stands as it is', W.added.length === 1 && W.added[0][0] === 'p_t' && W.added[0][1].name === 'Lucky pebble' && W.added[0][1].key === 'Pebble' && W.toasts.some(t => /Lucky pebble.*Tools.*stays as it is/.test(t)), j(W.toasts));
        check('the row itself is not touched', j(rowOwn) === before);
        const W2 = world(); W2.api.rowLibPacks(1, 2, rowOwn, W2.ch, W2.f, W2.spec); const p3 = W2.pop(); p3.kids[p3.kids.length - 1].fire('click', { preventDefault() {} });
        check('a new pack asks its name in the app\'s own prompt', W2.prompts.length === 1 && W2.prompts[0][0] === 'Name the new pack');
        W2.prompts[0][1]('At the table'); await new Promise(r => setImmediate(r));
        check('and the entry goes into it', W2.added[0][2] === 'At the table' && W2.added[0][0] === null, j(W2.added));
        const W2b = world(); W2b.api.rowLibPacks(1, 2, rowOwn, W2b.ch, W2b.f, W2b.spec); const p3b = W2b.pop(); p3b.kids[p3b.kids.length - 1].fire('click', { preventDefault() {} }); W2b.prompts[0][1](null);
        check('a prompt called off adds nothing', W2b.added.length === 0);
        const bound = (o, row, gm) => { const X = world(o), ln = X.el('div'); X.api.rowLibHook(ln, row, S.rowDef(sysR, row), X.ch, X.f, X.spec, gm); return (ln.on.contextmenu || []).length; };
        check('never on a player\'s app, nor where the machine is not the GM\'s, nor in a sheet drawn to no effect (a preview or a window of its own)', bound({}, rowOwn, false) === 0 && bound({ take: false }, rowOwn, true) === 0 && bound({ live: false }, rowOwn, true) === 0);
        check('a GM-only item is not offered, and a plain copy of an entry that is there is not', bound({}, rowGm, true) === 0 && bound({}, rowPlain, true) === 0 && bound({ shown: no }, rowCopy, true) === 0);
        check('a copy with values of its own is offered, and a row the GM keeps on is treated as any row of its kind', bound({}, rowCopy, true) === 1 && bound({}, Object.assign({}, rowOwn, { hid: 1, keptOn: 1 }), true) === 1);
        const W3 = world(), hd = W3.el('div'); W3.api.rowLibBtn(hd, rowOwn, rd0, W3.ch, W3.f, W3.spec, true);
        check('its form has the same thing as a button, in plain words', hd.kids.length === 1 && hd.kids[0].textContent === 'Add to the library');
        hd.kids[0].fire('click'); check('which asks which pack', /to which pack/.test(W3.pop().textContent));
        const W4 = world(), hd2 = W4.el('div'); W4.api.rowLibBtn(hd2, rowOwn, rd0, W4.ch, W4.f, W4.spec, false); check('and none for a player', hd2.kids.length === 0);
        const W5 = world({ result: { error: 'That pack is not read yet, so it cannot change.' } }); W5.api.rowLibSend(W5.ch, W5.f, 'w_3', W5.spec, 'p_a'); await new Promise(r => setImmediate(r));
        check('a refusal is said in its own words', W5.toasts.some(t => /not read yet/.test(t)) && !W5.toasts.some(t => /stays as it is/.test(t)));
        const W6 = world(); W6.api.rowLibSend(W6.ch, W6.f, 'w_gone', W6.spec, 'p_a');
        check('a row that went while the menu was up adds nothing, and says so', W6.added.length === 0 && /has changed/.test(W6.toasts[0]));
        const W7 = world(); W7.ch.values.f_gear = [rowGm]; W7.api.rowLibSend(W7.ch, W7.f, 'w_4', W7.spec, 'p_a');
        check('and one judged again at the press is judged as at the menu', W7.added.length === 0);
        const hostile = '<img src=x onerror=alert(1)>', rowH = { id: 'w_h', qty: 1, def: { name: hostile, vis: 'all' } }, W8 = world({ row: rowH }); W8.api.rowLibPacks(1, 2, rowH, W8.ch, W8.f, W8.spec);
        check('a hostile name reaches the menu as text', W8.pop().kids[0].textContent.indexOf(hostile) >= 0);
    }

    /* ---- the page, the words and CI ---- */
    const page = read('index.html'), css = read('style.css'), win = read('scripts/librarywin.js'), sh = read('scripts/sheets.js'), ci = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'checks.yml'), 'utf8'), w1 = fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8'), w2 = read('assets/whatsnew.txt');
    check('the page has the window\'s new button and the guide\'s strip, once each', page.split('id="libCsv"').length === 2 && page.split('id="libGuide"').length === 2 && /id="libGuide" class="lib-guide" hidden/.test(page));
    check('the window wires them', /ui\('libCsv'\); if \(cs\) cs\.addEventListener\('click', csvPick\)/.test(win) && /m\.addEventListener\('click', guidePress, true\)/.test(win) && /guideOpen\(\)/.test(win.slice(win.indexOf('function open() {'), win.indexOf('async function close()'))));
    check('the app\'s own styles for what is new, a hidden strip staying hidden', ['.lib-csv-col', '.lib-csv-table', '.lib-guide[hidden]', '.lib-guide-at', '.lib-guide-tip', '.sheet-rowlib-pop', '#libraryModal.lib-csv-on'].every(c => css.indexOf(c) >= 0));
    check('a row and a table row are hooked, and both forms have the button', sh.split('rowLibHook(line, entry, rd, c, f, spec, gm)').length === 3 && /rowLibHook\(tr, entry, rd, c, f, spec, gm\)/.test(sh) && sh.split('rowLibBtn(head, entry, rd, c, f, spec,').length === 3, sh.split('rowLibHook(line, entry, rd, c, f, spec, gm)').length);
    check('the step log names this feature, in one place in each script', /wpStepLog\('catalog v1', step, o\)/.test(win) && win.split("wpStepLog('catalog v1'").length === 2);
    check('Help says all three under the Library', /<b>Spreadsheet&hellip;<\/b> reads a CSV file/.test(page) && /<b>Add to the library<\/b> makes a row/.test(page) && /short walk through your first pack/.test(page));
    check('both release notes say it in the 1.6.2 section, under a heading of its own', [w1, w2].every(t => { const a = t.indexOf('WAYPOINT 1.6.2'), b = t.indexOf('WAYPOINT 1.6.1'), c = t.indexOf('Making a catalog'); return a >= 0 && c > a && c < b && /Add to the library/.test(t.slice(c, b)) && /Spreadsheet/.test(t.slice(c, b)); }));
    check('CI has this suite\'s step under a plain name', /- name: catalogcheck [^:\n]*\n\s+if: \$\{\{ !cancelled\(\) \}\}\n\s+run: node tools\/catalogcheck\.js/.test(ci.replace(/\r\n/g, NL)));
    check('csvcore is pure: no page, no network, no disk', !/\b(document|window|fetch|localStorage|XMLHttpRequest)\b/.test(read('scripts/csvcore.js').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));

    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    summed = true;
    if (fail) process.exitCode = 1;
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); summed = true; process.exitCode = 1; });
