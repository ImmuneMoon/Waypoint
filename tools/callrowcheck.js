// callrowcheck — a call that runs a list's roll on a row, and one that goes to the roller (1.6.2; asked by a system build: a weapon that parries, or is
// parried by, a lightsaber rolls against its own Durability, so the call must reach the very row of the weapon that resisted, or the attacker's own).
// systemcore's cleaner and what the editor says, net.js's rollcalls slice run for real on stand-ins of the table, dicecore's card, dice.js's press,
// the System editor's box, Help and both notes.
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 900))); } }
const J = JSON.stringify, root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, '\n');
const imp = p => import('file:///' + path.resolve(app(p)).replace(/\\/g, '/'));
(async () => {
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    const S = await imp('scripts/systemcore.js'), F = await imp('scripts/formula.js'), D = await imp('scripts/dicecore.js');
    // ---- the cleaner
    const cc = S.cleanCalls([{ roll: 'f_w#1', when: 'resisted', byIf: 'Row.saber = 1' }, { roll: 'f_w#1', when: 'resisted', to: 'self' }, { roll: 'f_w#1', when: 'hit', to: 'self' }, { roll: 'f_w#999' }, { roll: 'f_w' }, { roll: 'r_a', when: 'resisted', to: 'them' }]);
    check('a call may name a list’s roll by its place, as Or resisted by does, and To the roller is kept only beside When it is resisted; a place past a list’s rolls, a list with no place and any other word for who are refused',
        J(cc) === J([{ roll: 'f_w#1', when: 'resisted', byIf: 'Row.saber = 1' }, { roll: 'f_w#1', when: 'resisted', to: 'self' }, { roll: 'f_w#1', when: 'hit' }, { roll: 'r_a', when: 'resisted' }]), J(cc));
    // ---- a system: a weapons list with an Attack, a Parry that resists it and a Durability roll; a sword and a lightsaber
    const raw = { v: 1, name: 'Parry', fields: [
        { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '10', vis: 'all', edit: 'owner' },
        { id: 'f_w', key: 'Wpn', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'dur', label: 'Durability' }, { key: 'saber', label: 'Saber' }], cols: [], rolls: [
            { label: 'Attack', formula: '3d6 <= 12', resistBy: 'f_w#2', calls: [{ roll: 'f_w#1', when: 'resisted', to: 'self', byIf: 'Row.saber = 1' }] },
            { label: 'Durability', formula: '3d6 <= Row.dur', needs: 'Row.dur > 0' },
            { label: 'Parry', formula: '3d6 <= 11', resist: true, calls: [] }] } }],
        rolls: [{ id: 'r_dodge', label: 'Dodge', formula: '3d6 <= 10', resist: true, vis: 'all' }],
        items: [{ id: 'i_sword', name: 'Vibroblade', stats: { dur: 12, saber: 0 } }, { id: 'i_saber', name: 'Lightsaber', stats: { dur: 0, saber: 1 } }, { id: 'i_axe', name: 'Axe', stats: { dur: 0, saber: 0 } }] };
    const sys = S.cleanSystem(raw, { F, gmView: true }), view = S.cleanSystem(raw, { F, gmView: false });
    const wl = sys.fields.find(f => f.id === 'f_w');
    check('the list keeps the Attack’s call to the roller on its own row', J(wl.list.rolls[0].calls) === J([{ roll: 'f_w#1', when: 'resisted', byIf: 'Row.saber = 1', to: 'self' }]), J(wl.list.rolls[0].calls));
    // ---- what the editor says
    const says = (calls, onList) => { const s = JSON.parse(J(raw)); if (onList) Object.assign(s.fields[1].list.rolls[0], { resistBy: 'r_dodge', resistOr: ['f_w#2'], calls }); else s.rolls.push({ id: 'r_hit', label: 'Hit', formula: '3d6 <= 10', vis: 'all', resistBy: 'r_dodge', resistOr: ['f_w#2'], calls }); return (S.validateSystem(s, F).warnings || []).filter(w => /Calls for/.test(w.message)).map(w => w.message.replace(/^Attack: /, '')); };
    check('the editor says where a list’s roll can never be posted: a place that holds no roll, a row that resisted by a roll that is no list’s, and the roller’s own row on a roll of another list or of the system; a sound call says nothing',
        J(says([{ roll: 'f_w#7' }])) === J(['Calls for names a list’s roll that is not there, so no card comes.'])
        && /no list’s roll/.test(says([{ roll: 'f_w#1', when: 'resisted', by: 'r_dodge' }])[0]) && /roller’s own row/.test(says([{ roll: 'f_w#1', when: 'resisted', to: 'self' }])[0]) && /roller’s own row/.test(says([{ roll: 'f_w#1', when: 'hit' }])[0])
        && says([{ roll: 'f_w#1', when: 'resisted', by: 'f_w#2' }]).length === 0 && says([{ roll: 'f_w#1', when: 'resisted', to: 'self' }], true).length === 0 && says([{ roll: 'f_w#1', when: 'hit' }], true).length === 0, J([says([{ roll: 'f_w#7' }]), says([{ roll: 'f_w#1', when: 'resisted', to: 'self' }], true)]));
    // ---- the host's slice, run for real
    const src = read('scripts/net.js'), sl = src.slice(src.indexOf('// [netcheck:rollcalls-start]'), src.indexOf('// [netcheck:rollcalls-end]'));
    const posted = [], _attempts = {}; let nId = 0;
    const net = { postDue: (ch, act, kind, round, toO, more) => posted.push({ ch: ch.id, act: act.id, label: act.label, kind, toO, more }), blowMake: (ch, act) => { const id = 'b_abcd' + String(1000 + nId++); _attempts[id] = { charId: ch.id, act, m: 0, blow: {} }; return id; } };
    const win = { wpFormula: F, wpSheets: { playerSystem: () => view } };
    const fxLib = s => { const o = {}; (s.effects || []).forEach(e => { o[e.id] = e; }); return o; }, itemLib = s => { const o = {}; (s.items || []).forEach(d => { o[d.id] = d; }); return o; };
    const H = new Function('SC', 'window', 'net', '_attempts', 'fxLib', 'itemLib', sl + '\nreturn { callPost, callsAfter, attemptCalled };')(() => S, win, net, _attempts, fxLib, itemLib);
    const chA = { id: 'c_a', name: 'Ren', ownerId: 'p1', values: { f_hp: { cur: 10 }, f_w: [{ id: 'w_vibro', defId: 'i_sword', qty: 1 }] } };
    const chP = { id: 'c_p', name: 'Vel', ownerId: 'p2', values: { f_hp: { cur: 10 }, f_w: [{ id: 'w_saber', defId: 'i_saber', qty: 1 }, { id: 'w_axe', defId: 'i_axe', qty: 1 }, { id: 'w_hidden', defId: 'i_sword', qty: 1, hid: 1 }] } };
    const npc = { id: 'c_n', name: 'Guard', npc: true, values: { f_w: [{ id: 'w_gsword', defId: 'i_sword', qty: 1 }] } };
    const camp = { system: sys, chars: { c_a: chA, c_p: chP, c_n: npc } };
    // to the one who resisted: the parrier's own row
    H.attemptCalled(camp, { calls: [{ roll: 'f_w#1', by: '' }], callBy: 'Attack' }, '', { f: 'f_w', r: 'w_saber', i: 2 }, true, chP, false, null);
    const p1 = posted.pop();
    // the lightsaber's Durability is 0, so its needs fail: nothing; a sword that parries has 12
    chP.values.f_w[0].defId = 'i_sword';
    H.attemptCalled(camp, { calls: [{ roll: 'f_w#1', by: '' }], callBy: 'Attack' }, '', { f: 'f_w', r: 'w_saber', i: 2 }, true, chP, false, null);
    const p2 = posted.pop(), key2 = p2 && _attempts[p2.more.att];
    check('a call posts a list’s roll on the row that resisted, to that row’s player at the place their view names, its record naming that row alone; only while the roll’s needs hold on that row',
        p1 === undefined && p2 && p2.ch === 'c_p' && p2.kind === 'called' && p2.toO === true && p2.act === 'r_row' && J(p2.more.row) === J({ f: 'f_w', r: 'w_saber', i: 1 }) && p2.more.label === 'Durability' && p2.more.by === 'Attack'
        && key2 && J(key2.rows) === J(['f_w#1#w_saber']) && key2.charId === 'c_p', J([p1, p2, key2]));
    chP.values.f_w[0].defId = 'i_saber';
    const n0 = posted.length;
    H.attemptCalled(camp, { calls: [{ roll: 'f_w#1', by: '' }], callBy: 'Attack' }, '', { f: 'f_x', r: 'w_saber', i: 0 }, true, chP, false, null);
    H.attemptCalled(camp, { calls: [{ roll: 'f_w#1', by: '' }], callBy: 'Attack' }, 'r_dodge', null, true, chP, false, null);
    H.attemptCalled(camp, { calls: [{ roll: 'f_w#1', by: '' }], callBy: 'Attack' }, '', { f: 'f_w', r: 'w_gone', i: 2 }, true, chP, false, null);
    H.attemptCalled(camp, { calls: [{ roll: 'f_w#1', by: '' }], callBy: 'Attack' }, '', { f: 'f_w', r: 'w_hidden', i: 2 }, true, chP, false, null);
    check('no card where the row that resisted is of another list, where a roll of the system resisted, where the row is not there, or where it is a row kept from its player, which reads as nothing',
        posted.length === n0, J(posted.slice(n0)));
    // to the roller: the attacker's own row, byIf read on the one who resisted
    const recS = { calls: [{ roll: 'f_w#1', by: 'f_w#2', byIf: 'Row.saber = 1', to: 'self' }], callBy: 'Attack', callFrom: 'c_a', callRow: { f: 'f_w', r: 'w_vibro' } };
    H.attemptCalled(camp, recS, '', { f: 'f_w', r: 'w_saber', i: 2 }, true, chP, false, null); const s1 = posted.pop();
    const n1 = posted.length; H.attemptCalled(camp, recS, '', { f: 'f_w', r: 'w_axe', i: 2 }, true, chP, false, null); const s2 = posted.length === n1;
    H.attemptCalled(camp, Object.assign({}, recS, { callPriv: true }), '', { f: 'f_w', r: 'w_saber', i: 2 }, true, chP, false, null); const s3 = posted.pop();
    H.attemptCalled(camp, Object.assign({}, recS, { callFrom: 'c_n', callRow: { f: 'f_w', r: 'w_gsword' } }), '', { f: 'f_w', r: 'w_saber', i: 2 }, true, chP, false, null); const s4 = posted.pop();
    check('To the roller: the card goes to the attacker on the attack’s own row, only where the one who resisted parried with a lightsaber (its byIf read on their row); a private attack’s and an NPC’s go to the GM',
        s1 && s1.ch === 'c_a' && J(s1.more.row) === J({ f: 'f_w', r: 'w_vibro', i: 1 }) && s1.toO === true && s2 && s3 && s3.ch === 'c_a' && s3.toO === false && s4 && s4.ch === 'c_n' && s4.toO === false && J(s4.more.row) === J({ f: 'f_w', r: 'w_gsword', i: 1 }), J([s1, s2, s3, s4]));
    // on a hit or a miss, the roller's own row
    const ent = wl.list.rolls[0], entH = Object.assign({}, ent, { calls: [{ roll: 'f_w#1', when: 'hit' }] });
    H.callsAfter(camp, entH, true, () => 0, chA, false, { f: 'f_w', r: 'w_vibro', i: 0 }); const h1 = posted.pop();
    const n2 = posted.length; H.callsAfter(camp, entH, true, () => 0, chA, false, null); const h2 = posted.length === n2;
    H.callsAfter(camp, Object.assign({}, ent, { calls: [{ roll: 'r_dodge' }] }), true, () => 0, chA, false, { f: 'f_w', r: 'w_vibro', i: 0 }); const h3 = posted.pop();
    check('on a success or a failure a list’s roll is posted on the row the roll was made on, none with no row, and a roll of the system as before',
        h1 && h1.ch === 'c_a' && J(h1.more.row) === J({ f: 'f_w', r: 'w_vibro', i: 1 }) && h2 && h3 && h3.act === 'r_dodge' && !h3.more.row, J([h1, h3]));
    // ---- Blow.big: the attack's Big Hit rides the call's record
    const dj = read('scripts/dice.js'), nj = src, sh = read('scripts/sheets.js');
    H.callsAfter(camp, Object.assign({}, ent, { calls: [{ roll: 'r_dodge' }] }), true, () => 0, chA, false, null, true); const g1 = posted.pop(), gR = g1 && _attempts[g1.more.att];
    H.callsAfter(camp, entH, true, () => 0, chA, false, { f: 'f_w', r: 'w_vibro', i: 0 }, true); const g2 = posted.pop(), gR2 = g2 && _attempts[g2.more.att];
    H.callsAfter(camp, Object.assign({}, ent, { calls: [{ roll: 'r_dodge' }] }), true, () => 0, chA, false, null); const g3 = posted.pop(), gR3 = g3 && _attempts[g3.more.att];
    check('an attack that lands as a Big Hit marks the record of each card it calls for, a roll of the system and a list\u2019s roll alike; one that does not marks none',
        gR && gR.big === true && gR2 && gR2.big === true && gR3 && gR3.big === undefined, J([gR, gR2, gR3]));
    check('a damage roll made with such a record is marked a Major Wound and Blow.big on the host, on a player\u2019s press and the GM\u2019s, and the card hands both to the Take damage window',
        nj.includes("if (recQ.dmg === 1 && typeof abQ !== 'undefined' && abQ && abQ.big === true) { recQ.major = 1; recQ.blowBig = 1; }") && nj.includes("if (rec.dmg === 1 && typeof abR !== 'undefined' && abR && abR.big === true) { rec.major = 1; rec.blowBig = 1; }")
        && nj.includes("!!recQ.priv, q.row, recQ.big === true);") && nj.includes("!!rec.priv || !!rec.to, o.row, rec.big === true);") && dj.includes("major: rec.major === 1, big: rec.blowBig === 1 ? true : undefined, kind:") && sh.includes("if (more.big === true) { pre.major = true; pre.big = true; }") && sh.includes("if (pre.big === true && mjt.checked) o.big = true;"));
    // ---- the card
    const due = { type: 'due', id: 'r_abcdefgh', from: { id: 'u_gm', name: 'GM', gm: true }, charId: 'c_p', act: 'r_row', label: 'Durability', why: 'called', round: 1, roll: 1, att: 'b_abcd1234', by: 'Attack', or: [{ row: { f: 'f_w', r: 'w_saber', i: 1 }, label: 'Durability' }], nm: 1, ts: 1 };
    const cd = D.cleanDue(due), bad = [{ nm: undefined }, { or: undefined }, { or: [due.or[0], { row: { f: 'f_w', r: 'w_axe', i: 1 } }] }, { or: [{ act: 'r_x', row: due.or[0].row }] }, { or: [{ row: { f: 'f_w', r: 'w_saber', i: 200 } }] }, { or: [{ row: { f: 'x', r: 'w_saber', i: 1 } }] }, { roll: undefined }].map(o => D.cleanDue(Object.assign({}, due, o)));
    check('a called card may carry one list row as its one button; two rows, no mark, a roll beside it, a place past a list’s rolls, a bad list and a card that is no roll are refused; a card with none is as before',
        cd && J(cd.or) === J(due.or) && cd.nm === 1 && cd.att === 'b_abcd1234' && bad.every(x => x === null) && D.cleanDue(Object.assign({}, due, { or: undefined, nm: undefined })).why === 'called', J([cd, bad]));
    // ---- the press, the editor, the words
    const html = read('index.html'), wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wa = read('assets/whatsnew.txt'), ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'checks.yml'), 'utf8');
    check('the card’s button presses that row’s roll, and the host puts the row on the card as its one button',
        dj.includes("rec.why === 'called' && rec.nm === 1 && Array.isArray(rec.or) && rec.or[0] ? rec.or[0].row : undefined") && nj.includes("if (rec.why === 'called' && more && more.row && typeof more.row === 'object') { rec.or = [{ row: { f: more.row.f, r: more.row.r, i: more.row.i }"));
    check('the attempt keeps who made it and on which row, and both roll paths hand the row to callsAfter',
        nj.includes("if (c.to === 'self') cK.to = 'self';") && nj.includes("_attempts[id].callFrom = fromCh.id;") && nj.includes("_attempts[id].callRow = { f: rowRef.f, r: rowRef.r };") && nj.includes("!!recQ.priv, q.row, recQ.big === true);") && nj.includes("!!rec.priv || !!rec.to, o.row, rec.big === true);"));
    check('the System editor offers a list’s rolls to call for and, When it is resisted, who the card goes to; Help and both notes say so; CI runs this suite',
        sh.includes("'Calls for: ' + (f.label || f.key || 'List') + ': ' + (lr.label || 'Roll') + ' on that row'") && sh.includes("select('sys-call-to', [['', 'To the one who resisted'], ['self', 'To the roller']]")
        && html.includes('A call can ask for a list’s roll') && wn.includes('A roll\'s Calls for can ask for a list\'s roll on a row') && wa.includes('A roll\'s Calls for can ask for a list\'s roll on a row') && ci.includes('run: node tools/callrowcheck.js'));
    summed = true; console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      threw: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) console.log('FAIL      the suite did not finish'); });
