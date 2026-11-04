// dicebonuscheck — dice added to a roll (1.6.2; the owner, 2026-11-03, by prompt: "Roll bonuses and the ± modifier. A GM often calls for a
// one-off die ('+1d6 for the high ground'), and typing it into the modifier is the quickest way to do it"). dicecore's cleaner and
// composeModifier run on the real formula engine, the criticals that must never read an added die, the wire's cleaner, a roll bonus's dice
// through systemcore's cleaner and judge, the ± window's own pieces sliced from dice.js, the host's compose pinned, Help and both notes.
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 700))); } }
const J = JSON.stringify, root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, '\n');
const imp = p => import('file:///' + path.resolve(app(p)).replace(/\\/g, '/'));
const scripted = d => { let i = 0; return () => d[i++ % d.length]; };
(async () => {
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    const D = await imp('scripts/dicecore.js'), F = await imp('scripts/formula.js'), S = await imp('scripts/systemcore.js');
    // ---- the cleaner
    const cd = D.cleanDiceBonus;
    check('cleanDiceBonus reads dice as a table says them: +1d6, d6, 1d6 - 1d4 with any spacing, written +1d6-1d4; none for nothing',
        cd('+1d6') === '+1d6' && cd('d6') === '+1d6' && cd(' 1d6 - d4 ') === '+1d6-1d4' && cd('-2d8') === '-2d8' && cd('') === '' && cd(undefined) === '' && cd(null) === '' && cd('+1D10') === '+1d10',
        J([cd('+1d6'), cd(' 1d6 - d4 '), cd('+1D10')]));
    check('cleanDiceBonus refuses what is no such dice: a figure, two terms with no sign between, 21 dice, a die of 1 or of 1001 sides, a fifth term, text and a long string',
        [ '1d6+2', '1d6 1d4', '21d6', '1d1', '1d1001', '1d4+1d4+1d4+1d4+1d4', 'luck', 5, {}, 'x'.repeat(81), '1d6@x', '(1d6)', '1d6 2', '1 d6' ].every(v => cd(v) === null) && cd('1d4+1d4+1d4+1d4') === '+1d4+1d4+1d4+1d4' && cd('1d4+1d4+1d4+1d4+1d4', 8) === '+1d4+1d4+1d4+1d4+1d4',
        J([ '1d6+2', '1d6 1d4', '21d6', '1d1', '1d1001', '1d4+1d4+1d4+1d4+1d4' ].map(v => cd(v))));
    // systemcore keeps its own copy (it imports no dicecore): the two agree over a seeded corpus
    const parts = ['', '+', '-', ' ', '1', '2', '20', '21', 'd', 'D', '4', '6', '10', '1000', '1001', 'x', '0'];
    let seed = 7, agree = 0, disagree = [];
    for (let i = 0; i < 4000; i++) { let s = ''; const n = 1 + (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 12; for (let k = 0; k < n; k++) s += parts[(seed = (seed * 1103515245 + 12345) & 0x7fffffff) % parts.length]; if (cd(s) === S.swDice(s)) agree++; else if (disagree.length < 5) disagree.push([s, cd(s), S.swDice(s)]); }
    check('systemcore swDice reads every text as dicecore cleanDiceBonus does, over 4,000 seeded texts', agree === 4000, J(disagree));
    // ---- composeModifier
    const cm = (e, m, d) => D.composeModifier(e, m, F.parse, d);
    const u = cm('3d6 <= 12', 0, '+1d6'), o = cm('d20 + 5 >= 15', 2, '1d6-1d4'), v = cm('2d6+3', 0, 'd8'), nn = cm('d20 >= 10', 0, '');
    check('composeModifier adds dice where a bonus helps: on a roll-under check to the target, on a roll-over check to the roll, on a value to the value; with no figure and no dice the roll as it stands',
        u.ok && u.expr === '3d6 <= (12) + 1d6@_bonus' && o.ok && o.expr === '(d20 + 5) + 2 + 1d6@_bonus - 1d4@_bonus >= 15' && v.ok && v.expr === '(2d6+3) + 1d8@_bonus' && nn.ok && nn.expr === 'd20 >= 10',
        J([u, o, v, nn]));
    check('composeModifier refuses dice that do not clean, and more than 8 terms in all (the window’s and the bonuses’ together)',
        cm('d20', 0, '1d6+2').ok === false && cm('d20', 0, '+1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4').ok === true && cm('d20', 0, '+1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4').ok === false && cm('d20', 1.5, '1d6').ok === false);
    // ---- an added die adds to the total and never to a natural figure or a critical
    const ev = (e, d) => F.evaluate(e, { random: scripted(d) });
    const r1 = ev(u.expr, [1, 1, 1, 6]);
    check('an added die counts in the total: 3d6 rolling 3 against 12 + 1d6 rolling 6 reads 3 <= 18, and its natural figure is the 3d6’s alone',
        r1.ok && r1.value === true && D.naturalOf(r1) === 3 && S.rollNaturalOf(r1) === 3, J([r1.value, D.naturalOf(r1), F.describe(r1, { maxChars: 200 })]));
    const u3 = D.under3d6(r1), u3n = D.under3d6(ev('3d6 <= 12 + 1d6', [1, 1, 1, 6]));
    check('a 3d6 roll-under critical still reads with an added die (a 3 is a critical success) where a die typed into the formula itself makes it an ordinary check', u3 && u3.crit === 'crit' && u3n === null, J([u3, u3n]));
    const r20 = ev(cm('d20 >= 10', 0, '+1d6').expr, [20, 3]), r20b = ev(cm('d20 >= 10', 0, '+1d6').expr, [1, 6]);
    check('a d20’s 20 and 1 stay a critical success and a critical failure with a die added', D.critOf(r20, '') === 'crit' && D.critOf(r20b, '') === 'fumble' && D.critOf(ev('d20 + 1d6 >= 10', [20, 3]), '') === null, J([D.critOf(r20, ''), D.critOf(r20b, '')]));
    const rF = ev(cm('d20 >= 10', 0, '+1d6').expr, [19, 2]), fx = D.fixedCrit(rF, { at: 19, fumble: 1, high: true });
    check('criticals at fixed rolls read the natural die alone: 19 on the d20 with a 2 on the added die is a critical success at 19 or more', fx && fx.crit === 'crit' && fx.total === 21, J(fx));
    check('the card reads the added die as plain dice, its name never shown', F.plainDice(u.expr) === true && F.plainDice('1d6@pool') === false && !/_bonus/.test(F.describe(r1, { maxChars: 300 })) && /1d6 \[6\]/.test(F.describe(r1, { maxChars: 300 })), F.describe(r1, { maxChars: 300 }));
    const adv = D.withAdvantage('d20 >= 10', 'adv', F.parse), advB = cm(adv.expr, 0, '1d6');
    check('advantage still rewrites the roll’s own die first, and the added die stays apart from it', adv.ok && advB.ok && D.naturalOf(ev(advB.expr, [5, 20, 4])) === 20, J([adv, advB]));
    // ---- the wire
    const rq = m => D.cleanRollReq(Object.assign({ rid: 'q1', expr: '3d6', charId: 'c_1' }, m));
    check('the dice wire keeps the window’s dice beside a named roll’s modifier, cleaned, and refuses them on an unnamed roll or as text that is no dice',
        J(rq({ act: 'r_a', mod: 1, modD: ' 1d6 ' })) === J({ rid: 'q1', expr: '3d6', charId: 'c_1', act: 'r_a', mod: 1, modD: '+1d6' }) && J(rq({ act: 'r_a', modD: '' })) === J({ rid: 'q1', expr: '3d6', charId: 'c_1', act: 'r_a' })
        && rq({ modD: '+1d6' }) === null && rq({ act: 'r_a', modD: '1d6+2' }) === null && rq({ act: 'r_a', modD: 6 }) === null, J([rq({ act: 'r_a', mod: 1, modD: ' 1d6 ' })]));
    check('a card’s list of bonuses takes a bonus’s dice, and one with dice alone', J(D.cleanSwNames([{ n: 'High ground', v: 0, d: '1d6' }, { n: 'Aim', v: 2, d: '+1d4' }])) === J([{ n: 'High ground', v: 0, d: '+1d6' }, { n: 'Aim', v: 2, d: '+1d4' }])
        && D.cleanSwNames([{ n: 'X', v: 0 }]) === null && D.cleanSwNames([{ n: 'X', v: 1, d: 'luck' }]) === null);
    // ---- a roll bonus with dice
    const sw = S.cleanRollSw([{ name: 'High ground', v: 0, d: ' + 1d6', to: [{ r: 'r_a' }] }, { name: 'Aim', v: 2, d: '1d4', to: [{ r: 'r_a' }] }, { name: 'Bad', v: 1, d: '1d6+2', to: [{ r: 'r_a' }] }, { name: 'None', v: 0, to: [{ r: 'r_a' }] }]);
    check('a roll bonus keeps its dice, with no figure or beside one; dice that do not clean leave a bonus with a figure as it was, and a bonus with neither goes',
        J(sw) === J([{ name: 'High ground', v: 0, to: [{ r: 'r_a' }], d: '+1d6' }, { name: 'Aim', v: 2, to: [{ r: 'r_a' }], d: '+1d4' }, { name: 'Bad', v: 1, to: [{ r: 'r_a' }] }]), J(sw));
    const sys = S.cleanSystem({ v: 1, name: 'B', fields: [{ id: 'f_st', key: 'ST', label: 'ST', kind: 'number', def: 10, vis: 'all', edit: 'owner' }, { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner' }],
        rolls: [{ id: 'r_a', label: 'Attack', formula: '3d6 <= ST' }], items: [{ id: 'i_cape', name: 'Cape', rollSw: [{ name: 'High ground', v: 0, d: '1d6', to: [{ r: 'r_a' }] }, { name: 'Aim', v: 2, d: '-1d4', to: [{ r: 'r_a' }] }] }] }, { F, gmView: true });
    const ch = { id: 'c_1', name: 'Kael', values: { f_st: 10, f_gear: [{ id: 'w_1', defId: 'i_cape', qty: 1 }] } };
    const av = S.rollSwitches(sys, ch, { r: 'r_a' }), jd = S.swJudge(sys, ch, { r: 'r_a' }, [{ s: 'f_gear|w_1', i: 1 }, { s: 'f_gear|w_1', i: 0 }]);
    check('the switches a roll is offered carry their dice, and the host’s judge adds the dice of those ticked in the order ticked, and names them',
        av.length === 2 && av[0].d === '+1d6' && av[1].d === '-1d4' && jd.ok && jd.v === 2 && jd.d === '-1d4+1d6' && J(jd.names) === J([{ n: 'Aim', v: 2, d: '-1d4' }, { n: 'High ground', v: 0, d: '+1d6' }]) && S.swJudge(sys, ch, { r: 'r_a' }, []).d === undefined, J([av, jd]));
    const pv = S.cleanSystem(sys, { F, gmView: false });
    check('a players’ view keeps a bonus’s dice where it keeps its holder', pv.items[0].rollSw[0].d === '+1d6', J(pv.items[0].rollSw));
    // ---- the host composes as the window does
    const netS = fs.readFileSync(app('scripts/net.js'), 'utf8').replace(/\r\n/g, '\n'), diceS = read('scripts/dice.js'), shS = read('scripts/sheets.js'), lwS = read('scripts/librarywin.js');
    check('the host rebuilds a named roll with the window’s dice and then the ticked bonuses’ dice, and a player’s app sends the window’s dice as data',
        netS.includes("Dq.composeModifier(wantQ, (q.mod || 0) + (swQ ? swQ.v : 0), Fq.parse, (q.modD || '') + (swQ && swQ.d ? swQ.d : ''))") && netS.includes("if (typeof o.modD === 'string' && o.modD) req.modD = o.modD;")
        && diceS.includes("return composeModifier(base, mod + swSum(), Fm.parse, modD + swDice());"));
    const mo = diceS.slice(diceS.indexOf('function modOpts('), diceS.indexOf('function rollWithMod('));
    const modOpts = new Function(mo + '; return modOpts;')();
    check('the ± window’s Roll (modOpts, run for real) names the dice on a named roll and sends nothing extra on an unnamed one',
        J(modOpts({ act: 'r_a' }, 0, 'normal', [], null, '+1d6')) === J({ act: 'r_a', modD: '+1d6' }) && modOpts(undefined, 0, 'normal', [], null, '+1d6') === undefined && J(modOpts({ act: 'r_a' }, 1, 'normal', [], null, '')) === J({ act: 'r_a', mod: 1 }));
    const bw = new Function(diceS.slice(diceS.indexOf('function bonusWords('), diceS.indexOf('// 1.6.0 roll switches: the bonuses ticked')) + '; return bonusWords;')();
    check('a bonus reads as its figure and its dice (+2 +1d6, +1d6, −1 −1d4), on the window’s button and the card', bw(2, '+1d6') === '+2 +1d6' && bw(0, '+1d6') === '+1d6' && bw(-1, '-1d4') === '−1 −1d4' && bw(0, '+1d6-1d4') === '+1d6 −1d4' && bw(3) === '+3', J([bw(2, '+1d6'), bw(0, '+1d6-1d4')]));
    check('the ± window has its Dice to add box, which says when what is typed is no dice and stops the Roll, and the card writes a bonus through bonusWords',
        diceS.includes("dRow.appendChild(el('span', 'dice-moddice-cap', 'Dice to add'));") && diceS.includes("if (dIn && cleanDiceBonus(dIn.value) === null) { toast(") && diceS.includes("bonusWords(x.v, x.d) + ' ' + x.n + ', added'") && read('style.css').includes('.dice-moddice-in {'));
    check('the System editor’s and the Library window’s roll bonuses have a Dice it adds box, and Save says what it drops',
        shS.includes("input('sys-sw-d field'") && shS.includes("else if (/(^| )sys-sw-d( |$)/.test(c))") && shS.includes("Save drops its dice: write them as 1d6") && lwS.includes("el('input', 'field lib-sw-d')"));
    // the card's dice line (readableInto, run for real on nodes of plain objects): an added die said apart from the roll's own
    const riSrc = diceS.slice(diceS.indexOf('function readableInto(brk, res, parts, expr) {'), diceS.indexOf('// 1.5.8 (handoff 90 Part B): what changed the values the roll read'));
    const node = (cls, txt) => ({ className: cls || '', textContent: txt || '', kids: [], title: '', appendChild(k) { this.kids.push(k); return k; } });
    const text = n => n.kids.length ? n.kids.map(text).join('') : n.textContent;
    const ri = new Function('el', 'document', 'fmtNum', 'F', 'readWords', riSrc + '\nreturn readableInto;')((t, c, x) => node(c, x), { createTextNode: t => node('', t) }, x => String(x), () => F, () => '');
    const line = (expr, draws) => { const r = ev(expr, draws), b = node(); ri(b, r, F.parts(r), expr); return [text(b), b.title]; };
    const l1 = line(u.expr, [4, 2, 3, 2]), l2 = line(v.expr, [4, 1, 2]), l3 = line(cm('2d6', 0, '+1d6-1d4').expr, [3, 4, 5, 1]), l4 = line('3d6 <= 12', [4, 2, 3]);
    check('a card says an added die apart: a check reads its own dice and what it needs, then what was added; a value the same way, one taken away with a minus; with none as before, and its tooltip never names the die',
        l1[0] === '3d6 [4, 2, 3] = 9 · needs 14 or less · added 1d6 [2]' && l2[0] === '2d6 [4, 1] · added 1d8 [2]' && l3[0] === '2d6 [3, 4] · added 1d6 [5] − 1d4 [1]' && l4[0] === '3d6 [4, 2, 3] = 9 · needs 12 or less' && !/_bonus/.test(l1[1]), J([l1, l2, l3, l4]));
    const help = read('index.html'), wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wa = read('assets/whatsnew.txt');
    check('Help says the window’s Dice to add and a bonus’s dice, and both notes say it', help.includes('Type <b>Dice to add</b> for a one-off die') && help.includes('A bonus can add dice as well as a figure') && wn.includes('- A roll can take dice as a bonus.') && wa.includes('- A roll can take dice as a bonus.'));
    summed = true; console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      crashed -> ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) console.log('FAIL      dicebonuscheck left a check waiting'); });
