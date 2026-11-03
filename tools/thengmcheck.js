// thengmcheck — a step of a roll's Then that reads or changes what players may not (1.6.2; asked by the session that keeps a campaign's build, settled 2026-11-03 through the
// handbook: "in waypoint the decision can already be made, or the gm decides on the spot"). The players' view keeps the steps it can hold and marks
// the places of the rest (systemcore thenGmCut), and the host runs those from the GM's own entry (net.js thenGmRun, sliced by its markers and run on
// stand-ins of the page with the real systemcore and formula engine). No browser, no network.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url'), vm = require('vm');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 600))); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
function slice(text, name) { const a = text.indexOf('// [thengmcheck:' + name + '-start]'), b = text.indexOf('// [thengmcheck:' + name + '-end]'); return a >= 0 && b > a ? text.slice(a, b) : ''; }
(async () => {
    const S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href);
    const RAW = { v: 1, name: 'T', fields: [
        { id: 'f_str', key: 'Str', label: 'Str', kind: 'number', vis: 'all', edit: 'owner' },
        { id: 'f_sec', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm', edit: 'gm' },
        { id: 'f_mark', key: 'Mark', label: 'Mark', kind: 'number', vis: 'gm', edit: 'gm' },
        { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { multi: true, stats: [{ key: 'q', label: 'Quality' }], rolls: [{ label: 'Make', formula: '3d6 <= 12', then: [{ f: 'f_str', formula: '1', add: true }, { f: 'f_mark', formula: 'Secret + Row.q', set: true, when: 'miss' }] }] } }],
        rolls: [{ id: 'r_make', label: 'Craft', formula: '3d6 <= 12', then: [{ f: 'f_str', formula: '2', add: true }, { f: 'f_str', formula: 'Secret', add: true, when: 'hit' }, { f: 'f_mark', formula: '5', set: true, when: 'fumble' }] }],
        items: [{ id: 'i_kit', name: 'Kit', stats: { q: 3 } }] };
    const gm = S.cleanSystem(RAW, { F, gmView: true }), pv = S.cleanSystem(RAW, { F, gmView: false });
    const gR = gm.rolls.filter(r => r.id === 'r_make')[0], pR = pv.rolls.filter(r => r.id === 'r_make')[0];
    check('the GM’s view keeps the whole Then and no mark', gR.then.length === 3 && gR.thenGm === undefined, J(gR));
    check('the players’ view keeps the steps it can hold, marks the places of the rest in the GM’s Then and names the roll, where before the whole Then went',
        J(pR.then) === J([{ f: 'f_str', formula: '2', add: true }]) && J(pR.thenGm) === J([1, 2]) && pR.named === true, J(pR));
    const lR = pv.fields.filter(f => f.id === 'f_gear')[0].list.rolls[0], lG = gm.fields.filter(f => f.id === 'f_gear')[0].list.rolls[0];
    check('a list’s roll alike, its Row names read as the row’s own', J(lR.then) === J([{ f: 'f_str', formula: '1', add: true }]) && J(lR.thenGm) === J([1]) && lR.named === true && lG.then.length === 2 && lG.thenGm === undefined, J([lR, lG]));
    const re = S.cleanSystem(pv, { F, gmView: false }), reR = re.rolls.filter(r => r.id === 'r_make')[0];
    check('a player’s app cleaning its view again keeps the mark and the steps as they are', J(reR) === J(pR) && J(re.fields.filter(f => f.id === 'f_gear')[0].list.rolls[0]) === J(lR), J([reR, pR]));
    check('a mark that is no list of whole places under 64 is no mark, and the GM’s view never takes one', J(S.cleanSystem(Object.assign({}, pv, { rolls: [Object.assign({}, pR, { thenGm: [1, 'x', -1, 1.5, 70, 2, 2] })] }), { F, gmView: false }).rolls[0].thenGm) === J([1, 2])
        && S.cleanSystem(Object.assign({}, pv, { rolls: [Object.assign({}, pR)] }), { F, gmView: true }).rolls[0].thenGm === undefined);
    const plain = S.cleanSystem(Object.assign({}, RAW, { rolls: [{ id: 'r_p', label: 'P', formula: '3d6 <= 12', then: [{ f: 'f_str', formula: '1', add: true }] }], fields: RAW.fields.slice(0, 3) }), { F, gmView: false });
    check('a Then the players’ view holds whole has no mark and is not named for it', plain.rolls[0].thenGm === undefined && plain.rolls[0].named === undefined && plain.rolls[0].then.length === 1, J(plain.rolls[0]));
    // the host's run
    const net = read('scripts/net.js'), src = slice(net, 'run');
    check('the host’s run is in its slice', src.includes('function thenGmRun('), src.slice(0, 80));
    const mkHost = (camp, charV) => {
        const out = { saves: 0, sync: [], log: [], changed: [] };
        const ctx = { window: { wpSheets: { charChanged: id => out.changed.push(id) } }, net: { syncCharDelta: (id, v) => out.sync.push([id, Object.keys(v).sort()]) }, saveRemoteSoon: () => out.saves++, logEvent: (k, t) => out.log.push([k, t]),
            SC: () => S, rowOnGm: (Sx, c, v, row) => row, Object, Array, String, Math, Date, JSON };
        vm.createContext(ctx); vm.runInContext(src + '\nthis.run = thenGmRun;', ctx);
        return { run: ctx.run, out };
    };
    const camp = { system: gm }, ch = { id: 'c_k', name: 'Kael', values: { f_str: 10, f_sec: 7, f_mark: 0, f_gear: [{ id: 'w_k', defId: 'i_kit', qty: 1 }] } };
    const H = mkHost(camp, ch);
    const r1 = H.run(camp, ch, { act: 'r_make', charId: 'c_k' }, pv, pR, { mf: false, vd: { kind: 'check', pass: true }, cr: '', F, tc: null, label: 'Craft' });
    check('on a success the host runs the step that reads what players may not, from the GM’s entry, on its own copy, and tells nobody but the GM', r1 && r1.ok && ch.values.f_str === 17 && ch.values.f_mark === 0 && H.out.saves === 1 && J(H.out.sync) === J([['c_k', ['f_str']]])
        && J(H.out.log) === J([['char', 'Kael: the hidden part of Craft ran.']]), J([r1, ch.values, H.out]));
    const ch2 = { id: 'c_k', name: 'Kael', values: { f_str: 10, f_sec: 7, f_mark: 0 } }, H2 = mkHost(camp, ch2);
    H2.run(camp, ch2, { act: 'r_make', charId: 'c_k' }, pv, pR, { mf: false, vd: { kind: 'check', pass: false }, cr: 'fumble', F, tc: null, label: 'Craft' });
    check('on a critical failure its GM-only change lands, and a step for a success does not', ch2.values.f_mark === 5 && ch2.values.f_str === 10, J(ch2.values));
    const ch3 = { id: 'c_k', name: 'Kael', values: { f_str: 10, f_sec: 7, f_mark: 0, f_gear: [{ id: 'w_k', defId: 'i_kit', qty: 1 }] } }, H3 = mkHost(camp, ch3);
    H3.run(camp, ch3, { row: { f: 'f_gear', r: 'w_k', i: 0 }, charId: 'c_k' }, pv, lR, { mf: false, vd: { kind: 'check', pass: false }, cr: '', F, tc: null, label: 'Make' });
    check('a list’s roll runs on its row, its Row names read there', ch3.values.f_mark === 10 && ch3.values.f_str === 10, J(ch3.values));
    const ch4 = { id: 'c_k', name: 'Kael', values: { f_str: 10, f_sec: 7 } }, H4 = mkHost(camp, ch4);
    const r4 = H4.run(camp, ch4, { act: 'r_make', charId: 'c_k' }, pv, pR, { mf: false, vd: { kind: 'check', pass: false }, cr: '', F, tc: null });
    check('where no hidden step comes due nothing is stored, sent or said', r4 === null && H4.out.saves === 0 && !H4.out.log.length, J([r4, H4.out]));
    check('a roll the GM no longer holds runs nothing', mkHost(camp, ch).run(camp, ch, { act: 'r_gone', charId: 'c_k' }, pv, pR, { F }) === null);
    // the wiring and the words
    check('the roll’s branch asks it once the rest have landed, with the roll’s result, also where the view held none of the Then (outside its block)', net.includes("if (chQ && actQ && Array.isArray(actQ.thenGm) && actQ.thenGm.length && typeof thenGmRun === 'function') { var mfGQ = mfQ !== null && Dq.naturalOf(resQ) >= mfQ, vdGQ = Dq.verdictOf(resQ, ruleQ); thenGmRun(") && net.indexOf('thenGmRun(campQ, chQ, q, viewQ, actQ') > net.indexOf("            else if (taQ && taQ.ok && taQ.fired && !mfHitQ && vdQ && vdQ.kind === 'check' && vdQ.pass === false"));
    check('Help, both notes and CI say it', read('index.html').includes('A step of a roll&rsquo;s <b>Then</b> that reads or changes something players may not see still runs when a player rolls.') && readRoot('WHATSNEW.txt').includes("- A step of a roll's Then that reads or changes something players may not see") && read('assets/whatsnew.txt').includes("- A step of a roll's Then that reads or changes something players may not see")
        && readRoot('.github/workflows/checks.yml').includes('run: node tools/thengmcheck.js'));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });
