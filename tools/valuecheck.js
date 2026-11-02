// valuecheck — a number the whole table shares (1.6.2, backlog 210 c, G8; the owner, by prompt: "In the system, shown"). systemcore's cleaners, the resolver and the real applyAct imported and
// run, the host's tell and a player's taking of it read from net.js, the box's wiring. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 900))); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
(async () => {
    const S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href);
    const RAW = { v: 1, name: 'V', fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 7 }, { id: 'f_a', key: 'Boost', kind: 'formula', formula: 'Shared.V1 + 1' }, { id: 'f_b', key: 'Peek', kind: 'formula', formula: 'Shared.V2 + 1' }, { id: 'f_c', key: 'Gone', kind: 'formula', formula: 'Shared.V9' }],
        values: [{ key: 'V1', label: 'Momentum', min: 0, max: 6, start: 2 }, { key: 'V2', label: 'Alarm', vis: 'gm', max: 5, start: 1 }, { key: '1x', label: 'Bad' }, { key: 'V1', label: 'Twice' }, { key: 'V3', label: 'Odd', min: 5, max: 2 }],
        rolls: [{ id: 'r_a', label: 'Up', apply: [{ shared: 'V1', formula: '3', add: true }] }, { id: 'r_b', label: 'Spend', apply: [{ shared: 'V1', formula: '1' }] }, { id: 'r_c', label: 'Set', apply: [{ shared: 'V1', formula: '9', set: true }] }, { id: 'r_d', label: 'GM', apply: [{ shared: 'V2', formula: '1', add: true }] }, { id: 'r_e', label: 'Then', formula: '1d6', then: [{ shared: 'V1', formula: '1', add: true }] }, { id: 'r_f', label: 'Gone', apply: [{ shared: 'V9', formula: '1', add: true }] }] };
    const sy = S.cleanSystem(RAW, { F, gmView: true }), pv = S.cleanSystem(sy, { F, gmView: false }), act = id => sy.rolls.filter(r => r.id === id)[0];
    check('a value keeps its range and start; a key that is none or comes twice is none; a Most under its Least is no Most', J(sy.values.map(v => v.key)) === J(['V1', 'V2', 'V3']) && sy.values[0].max === 6 && sy.values[0].start === 2 && !('max' in sy.values[2]), J(sy.values));
    check('a value for the GM alone leaves the players’ view, and so does what reads it', J(pv.values.map(v => v.key)) === J(['V1', 'V3']) && !J(pv.fields).includes('Shared.V2'), J(pv.fields));
    let held = {}, moved = []; S.setValueSource(k => held[k]); S.setValueSink(m => { moved.push(m); Object.assign(held, m); });
    const ch = () => ({ id: 'c', name: 'C', ownerId: 'u', values: { f_hp: 7 } }), rs = c => S.makeResolver(sy, c, F, null), run = (id, c) => { const k = c || ch(); return S.applyAct(sy, k, act(id), rs(k), F, null, null, undefined, null, null, { now: 1 }); };
    check('with nothing stored it reads its start, and a name for one that is gone is unknown to the validator', rs(ch())('Boost') === 3 && S.valueNow(sy, 'v1') === 2 && J(S.validateSystem(sy, F)).includes('Shared.V9'), J(S.validateSystem(sy, F)).slice(0, 300));
    const r1 = run('r_a');
    check('an action moves it, on the card and through the sink, and the sheet reads it', r1.ok === true && J(r1.lines) === J([{ n: 'Momentum', d: 3, v: 5 }]) && J(r1.shared) === J({ V1: 5 }) && held.V1 === 5 && rs(ch())('Boost') === 6 && r1.paid === true, J(r1));
    check('its range holds, a Set too, and one at its end moves nothing', run('r_a').lines[0].v === 6 && run('r_c').ok === false && held.V1 === 6, J(held));
    const r2 = run('r_b');
    check('with no word it takes off, as a change does', r2.lines[0].d === -1 && held.V1 === 5);
    const n0 = moved.length, c2 = ch(); run('r_f', c2);
    check('a value that is gone moves nothing', moved.length === n0 && run('r_f').ok === false);
    check('a card that moves a GM-only value is the GM’s, a shared one its owner’s', S.applyScope(sy, ch(), act('r_d'), false, F) === 'gm' && S.applyScope(sy, ch(), act('r_a'), false, F) === 'owner');
    check('a name that reads a GM-only value is GM-only', S.gmOnlyNames(sy, [{ name: 'Shared.V2' }]).length === 1 && S.gmOnlyNames(sy, [{ name: 'Shared.V1' }]).length === 0, J(S.gmOnlyNames(sy, [{ name: 'Shared.V2' }])));
    check('a player’s figures hold only what they may read, and within range', J(S.cleanShared({ V1: 99, V2: 3, V9: 1, V3: 'x' }, sy, false)) === J({ V1: 6 }) && J(S.cleanShared({ V1: 1, V2: 3 }, sy, true)) === J({ V1: 1, V2: 3 }) && S.cleanShared({ V2: 3 }, sy, false) === null);
    check('a field keyed Shared keeps its family', (() => { const q = S.cleanSystem({ v: 1, name: 'K', fields: [{ id: 'f_s', key: 'Shared', kind: 'number', def: 4 }, { id: 'f_t', key: 'T', kind: 'formula', formula: 'Shared + 1' }], values: [{ key: 'V1', label: 'M' }] }, { F, gmView: true }); return S.makeResolver(q, { id: 'c', values: {} }, F, null)('T') === 5; })());
    check('it reads in words', S.nameWord(sy, 'Shared.V1') === 'Momentum', S.nameWord(sy, 'Shared.V1'));
    const TK = await import(url.pathToFileURL(app('scripts/trackcore.js')).href), tkA = TK.cleanTracker({ id: 't1', kind: 'count', name: 'M', vis: 'all', val: 'V1', v: 2, min: 0, max: 4 }, {}), tkC = TK.cleanTracker({ id: 't2', kind: 'clock', name: 'C', vis: 'all', val: 'V1', parts: 6, fill: 1 }, {}), tkT = TK.cleanTracker({ id: 't3', kind: 'timer', name: 'T', val: 'V1', total: 60000 }, {});
    check('a tracker keeps the value it shows, a countdown none, and the wire never names it', tkA.val === 'V1' && tkC.val === 'V1' && !('val' in tkT) && !J(TK.wireFor([tkA, tkC], null, 0, 0)).includes('V1') && TK.wireFor([tkA], null, 0, 0).length === 1, J(TK.wireFor([tkA, tkC], null, 0, 0)));
    check('it takes the value’s figure within its own range, and says the same back', TK.figIn(tkA, 3).v === 3 && TK.figIn(tkA, 9).v === 4 && TK.figIn(tkC, 5).fill === 5 && TK.figIn(tkA, 2) === tkA && TK.figOf(TK.figIn(tkC, 5)) === 5 && TK.figOf(tkT) === null);
    const nt = fs.readFileSync(app('scripts/net.js'), 'latin1').replace(/\r\n/g, NL), ix = read('index.html'), sh = read('scripts/sheets.js'), fb = readRoot('WHATSNEW.txt');
    check('the host tells the table what it may read, a player’s app takes it from the synced host alone and writes nothing, and no snapshot carries a GM-only figure', nt.includes("c.send({ type: 'shared', campId: camp.id, vals: vals })") && nt.includes("} else if (msg.type === 'shared' && net.role === 'client') {") && nt.includes("if (!campSh || !SSh || !SSh.cleanShared) return;") && nt.includes("window.wpSystemCore.cleanShared(camp.shared, camp.system, false)") && !/type === 'shared'[^\n]*net\.role === 'host'/.test(nt));
    check('the box stands in the Rules tab, a change picks a value by name, and no key is typed', ix.includes('<div id="sysValues" data-topic="values"></div>') && sh.includes("['val:' + t.key, 'Shared: ' + (t.label || 'A value')]") && sh.includes("draft.values.push({ key: 'V' + n, label: '' })") && !/sys-val-key/.test(sh));
    check('Help, both notes and CI say it', /<b>Shared values<\/b> are numbers the whole table shares/.test(ix) && /Shared values: a number the whole table shares/.test(fb) && /Shared values: a number the whole table shares/.test(read('assets/whatsnew.txt')) && readRoot('.github/workflows/checks.yml').includes('node tools/valuecheck.js'));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });
