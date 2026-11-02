// resultcheck — result tables (1.6.2, backlog 210 c, G7): a table of ranges and words a roll's Then or an action reads, on its own dice or at a figure. systemcore's cleaners and the
// real applyAct imported and run, dicecore's wire, the card as the sheet's real line drawing writes it, and the box's wiring. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 900))); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
(async () => {
    const S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href), D = await import(url.pathToFileURL(app('scripts/dicecore.js')).href);
    const RAW = { v: 1, name: 'R', fields: [{ id: 'f_fx', key: 'Fx', kind: 'effects' }, { id: 'f_hp', key: 'HP', kind: 'number', def: 7 }, { id: 'f_sec', key: 'Sec', kind: 'number', vis: 'gm', def: 2 }],
        effects: [{ id: 'e_b', name: 'Burn', vis: 'all' }],
        results: [{ key: 'R1', label: 'Wild', dice: '1d6', rows: [{ lo: 1, hi: 2, words: 'Nothing much.' }, { lo: 3, hi: 4, words: 'It burns.', fx: 'e_b' }, { lo: 5, hi: 6, words: 'Worse.', next: 'R2' }, { lo: 9, hi: 8, words: 'Bad range' }] }, { key: 'R2', label: 'Worse', dice: '1d4', vis: 'gm', rows: [{ lo: 1, hi: 4, words: 'Secret.' }] }, { key: 'R3', label: 'None', dice: '', rows: [{ lo: 1, hi: 1 }] }, { key: '1bad', label: 'x', dice: '1d6', rows: [{ lo: 1, hi: 1 }] }, { key: 'R4', label: 'Empty', dice: '1d6', rows: [] }, { key: 'R5', label: 'Loop', dice: '1d6', rows: [{ lo: 1, hi: 6, words: 'Round.', next: 'R5' }] }],
        rolls: [{ id: 'r_a', label: 'Try', formula: '1d6', then: [{ table: 'R1', when: 'hit' }, { table: 'R1', when: 'hit' }, { table: 'R2' }] }, { id: 'r_b', label: 'At', apply: [{ table: 'R1', by: 'HP - 4' }] }, { id: 'r_c', label: 'Hid', apply: [{ table: 'R1', by: 'Sec' }] }, { id: 'r_d', label: 'Plain', apply: [{ table: 'R1' }] }, { id: 'r_e', label: 'GM', apply: [{ table: 'R2', by: '1' }] }, { id: 'r_f', label: 'Loop', apply: [{ table: 'R5', by: '1' }] }, { id: 'r_g', label: 'Gone', apply: [{ table: 'R9', by: '1' }] }] };
    const sy = S.cleanSystem(RAW, { F, gmView: true }), pv = S.cleanSystem(sy, { F, gmView: false }), act = id => sy.rolls.filter(r => r.id === id)[0];
    check('a table keeps ranges, words, an effect and where it goes next; one with no dice, no rows or a key that is none is no table', J(sy.results.map(t => t.key)) === J(['R1', 'R2', 'R5']) && J(sy.results[0].rows.map(r => r.lo + '-' + r.hi)) === J(['1-2', '3-4', '5-6']) && sy.results[0].rows[1].fx === 'e_b' && sy.results[0].rows[2].next === 'R2', J(sy.results));
    check('a table for the GM alone never reaches players', J(pv.results.map(t => t.key)) === J(['R1', 'R5']), J(pv.results));
    check('a Then names a table once for each time, and a player’s view keeps it', J(act('r_a').then) === J([{ table: 'R1', when: 'hit' }, { table: 'R2' }]) && J(pv.rolls.filter(r => r.id === 'r_a')[0].then) === J(act('r_a').then), J(act('r_a').then));
    check('a figure read from a GM-only value leaves a player’s view, as an amount does', !pv.rolls.some(r => r.id === 'r_c') && pv.rolls.some(r => r.id === 'r_b'), J(pv.rolls.map(r => r.id)));
    const ch = () => ({ id: 'c', name: 'C', ownerId: 'u', values: { f_hp: 7, f_sec: 2, f_fx: [] } }), run = (id, c, dc) => { const k = c || ch(); return S.applyAct(sy, k, act(id), S.makeResolver(sy, k, F, null), F, null, null, undefined, dc === undefined ? { random: faces => faces } : dc, null, { now: 1000, inCombat: false }); };
    const r1 = run('r_b');
    check('read at a figure it takes the row that figure falls in and says its words, with the figure beside them', r1.ok === true && J(r1.lines) === J([{ n: 'Wild', say: 'It burns.', roll: '3' }, r1.lines[1]]) && r1.lines[1].fx === 1 && r1.drew === true, J(r1));
    check('a row’s effect goes on as any change does, on the sheet', Array.isArray(r1.values.f_fx) && r1.values.f_fx[0].ref === 'e_b', J(r1.values));
    const r2 = run('r_d'), r0 = run('r_d', ch(), { random: () => 1 });
    check('with no figure it rolls the table’s own dice, on the host’s dice', r2.lines[0].roll === '6' && r2.lines[0].say === 'Worse.' && r0.lines[0].roll === '1' && r0.lines[0].say === 'Nothing much.', J([r2, r0]));
    check('a row may go on to another table, GM-only or not', r2.lines.length === 2 && r2.lines[1].n === 'Worse' && r2.lines[1].say === 'Secret.', J(r2.lines));
    check('that is three deep at most, so two tables that name each other end', run('r_f').lines.length === 3);
    check('only the host rolls one, and a figure that falls in no row says nothing happens', run('r_d', ch(), null).ok === false && (() => { const c = ch(); c.values.f_hp = 30; const q = run('r_b', c); return q.ok === true && q.lines[0].say === 'Nothing happens.'; })(), J(run('r_d', ch(), null)));
    check('a table that is gone moves nothing', run('r_g').ok === false);
    check('a card that reads a GM-only table is the GM’s, a shared one its owner’s', S.applyScope(sy, ch(), act('r_e'), false, F) === 'gm' && S.applyScope(sy, ch(), act('r_d'), false, F) === 'owner', J([S.applyScope(sy, ch(), act('r_e'), false, F), S.applyScope(sy, ch(), act('r_d'), false, F)]));
    const card = D.cleanApply({ id: 'r_abcdef12', from: { id: 'u', name: 'U', color: '#112233' }, lines: [{ n: 'Wild', say: 'It burns.', roll: '3' }], ts: 1 });
    check('the wire keeps the words and the figure, and a line of no words is no line', !!card && J(card.lines) === J([{ n: 'Wild', say: 'It burns.', roll: '3' }]) && D.cleanApply({ id: 'r_abcdef12', from: { id: 'u', name: 'U', color: '#112233' }, lines: [{ n: 'Wild', say: '   ' }], ts: 1 }) === null, J(card));
    check('the Game Record reads it', D.applyText({ from: { id: 'u', name: 'U' }, label: 'Try', lines: [{ n: 'Wild', say: 'It burns.' }] }).includes('Wild: It burns.'));
    const sh = read('scripts/sheets.js'), ds = read('scripts/dice.js'), nt = fs.readFileSync(app('scripts/net.js'), 'latin1'), ix = read('index.html'), ui = read('scripts/sysui.js'), fb = read('scripts/formbox.js');
    check('the card draws the words as text, and the host hands them on', ds.includes("s.appendChild(el('span', 'apply-say', l.say));") && nt.includes("if (typeof l.say === 'string') { var oS = { n: String(l.n).slice(0, 60), say: l.say.slice(0, 1000) };"));
    check('its box stands in the Rules tab, and a change picks a table by name', ix.includes('<div id="sysResults" data-topic="results"></div>') && ui.includes("['results', 'Result tables',") && sh.includes("if (tab === 'rules') renderResults();") && sh.includes("['tbl:' + t.key, 'Roll on: ' + (t.label || 'A table')]"));
    check('a user types no key: the box makes one, and its figures are forms', sh.includes("draft.results.push({ key: 'R' + n, label: '', dice: '1d6',") && !/sys-res-key/.test(sh) && /'sys-res-dice': 'dice', 'sys-res-by': 'amt'/.test(fb));
    check('Help, both notes and CI say it', /<b>Result tables<\/b> hold ranges and words/.test(ix) && /Result tables: a table of ranges and words/.test(readRoot('WHATSNEW.txt')) && /Result tables: a table of ranges and words/.test(read('assets/whatsnew.txt')) && readRoot('.github/workflows/checks.yml').includes('node tools/resultcheck.js'));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });
