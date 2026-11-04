// assistcheck — a roll that waits for help (1.6.2; the owner, 2026-11-03, by prompt: "The roll waits for help", a helper adding "A figure the roll sets,
// worked out on the helper's sheet: a number, a formula, a die, or the result of the helper's own roll", "a cap on all help together, and whether the
// same helping skill may count more than once", "The roll says, by needs", helpers "Others on the same map", the GM's NPCs too, and a wait "under the
// Combat tab (30 seconds unless set), and a roll may set its own"). systemcore's cleaner and judges, dicecore's card and press cleaners, net.js's hold
// sliced by its helphold markers and run for real on stand-ins of the table, dice.js's card drawn on nodes of plain objects, the wiring, Help and notes.
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
    const c = S.cleanHelp;
    check('cleanHelp keeps a figure a helper adds, or the rolls they help with and what each outcome adds, with who may help, a cap, the same roll twice and a wait',
        J(c({ by: 'fig', fig: ' 1d6 ', needs: 'ST >= 10', cap: 4.7, wait: 45 })) === J({ needs: 'ST >= 10', by: 'fig', fig: '1d6', cap: 4, wait: 45 })
        && J(c({ by: 'roll', rolls: ['r_a', 'r_a', 'r_b', 'bad'], table: { hit: 1, crit: 2.4, fumble: -2, miss: 0, odd: 5 }, same: true })) === J({ by: 'roll', rolls: ['r_a', 'r_b'], table: { crit: 2, hit: 1, fumble: -2 }, same: true }),
        J([c({ by: 'fig', fig: ' 1d6 ', needs: 'ST >= 10', cap: 4.7, wait: 45 }), c({ by: 'roll', rolls: ['r_a', 'r_a', 'r_b', 'bad'], table: { hit: 1, crit: 2.4, fumble: -2, miss: 0, odd: 5 }, same: true })]));
    check('cleanHelp refuses help that says nothing a helper adds, a roll help with no roll or no outcome, and holds the cap and the wait to their ends',
        c({}) === undefined && c({ by: 'fig' }) === undefined && c({ by: 'roll', rolls: [], table: { hit: 1 } }) === undefined && c({ by: 'roll', rolls: ['r_a'], table: {} }) === undefined && c('x') === undefined
        && c({ by: 'fig', fig: '1', cap: 0, wait: 2 }).cap === undefined && c({ by: 'fig', fig: '1', wait: 2 }).wait === undefined && c({ by: 'fig', fig: '1', cap: 500, wait: 5000 }).cap === 99 && c({ by: 'fig', fig: '1', wait: 5000 }).wait === 600);
    check('the wait: the roll’s own, else the Combat tab’s, else 30 seconds', S.helpWaitOf({ combat: { helpWait: 50 } }, { help: { wait: 12 } }) === 12 && S.helpWaitOf({ combat: { helpWait: 50 } }, { help: {} }) === 50 && S.helpWaitOf({}, { help: {} }) === 30);
    const tb = { table: { hit: 1, crit: 2, fumble: -2 } };
    check('an outcome reads its own figure, a critical one what a success or a failure adds where the table names none, and a failure with none nothing',
        J([{ pass: true, crit: 'crit' }, { pass: true, crit: '' }, { pass: false, crit: '' }, { pass: false, crit: 'fumble' }, null].map(k => S.helpOutcome(tb, k))) === J([{ v: 2, word: 'critical success' }, { v: 1, word: 'success' }, { v: 0, word: 'failure' }, { v: -2, word: 'critical failure' }, { v: 0, word: 'failure' }])
        && S.helpOutcome({ table: { hit: 3 } }, { pass: true, crit: 'crit' }).v === 3 && S.helpOutcome({ table: { miss: -1 } }, { pass: false, crit: 'fumble' }).v === -1);
    check('a helper’s figure is worked out on their names, a die rolled, held to 99 either way; all help together is held to the cap',
        S.helpFig({ by: 'fig', fig: 'ST - 8' }, n => (n === 'st' ? 11 : 0), F).v === 3 && S.helpFig({ by: 'fig', fig: '1000' }, () => 0, F).v === 99 && !!S.helpFig({ by: 'fig', fig: 'Nope +' }, () => 0, F).error
        && S.helpTotal({ cap: 3 }, [{ v: 2 }, { v: 2 }]) === 3 && S.helpTotal({}, [{ v: 2 }, { v: -1 }]) === 1 && S.helpTotal({ cap: 3 }, [{ v: -2 }]) === -2);
    const raw = { v: 1, name: 'A', fields: [{ id: 'f_st', key: 'ST', label: 'ST', kind: 'number', def: 10, vis: 'all', edit: 'owner' }, { id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { rolls: [{ label: 'Lift', formula: '3d6 <= ST', help: { by: 'fig', fig: '1' } }] } }],
        rolls: [{ id: 'r_a', label: 'Climb', formula: '3d6 <= ST', help: { by: 'roll', rolls: ['r_b'], table: { hit: 1 } } }, { id: 'r_b', label: 'Spot', formula: '3d6 <= ST' }, { id: 'r_i', label: 'Initiative', formula: 'd6', init: true, help: { by: 'fig', fig: '1' } }],
        combat: { helpWait: 45, cardWait: 60 } };
    const gm = S.cleanSystem(raw, { F, gmView: true }), pl = S.cleanSystem(gm, { F, gmView: false });
    check('the system keeps a roll’s and a list roll’s help in the GM’s view alone, never on the initiative roll, and the players’ view names the roll so that its press reaches the host',
        J(gm.rolls[0].help) === J({ by: 'roll', rolls: ['r_b'], table: { hit: 1 } }) && gm.fields[1].list.rolls[0].help.fig === '1' && gm.rolls[2].help === undefined && gm.combat.helpWait === 45
        && pl.rolls[0].help === undefined && pl.rolls[0].named === true && pl.fields[1].list.rolls[0].help === undefined && pl.fields[1].list.rolls[0].named === true && pl.combat.helpWait === undefined, J([gm.rolls, pl.rolls, gm.combat, pl.combat]));
    // ---- dicecore's cleaners
    const card = { id: 'r_abc', from: { id: 'p1', name: 'Kael', gm: false }, ts: 5, ends: 9, total: 2, lines: [{ n: 'Bram', w: 'Spot: success, +1' }], label: 'Climb', as: 'Kael', cap: 3, can: [{ id: 'c_b', name: 'Bram' }], rolls: [{ i: 0, label: 'Spot' }], mine: 1, rid: 'q1' };
    check('a help card is cleaned key by key, and nothing of another shape is kept',
        J(D.cleanHelpCard(card)) === J({ id: 'r_abc', from: { id: 'p1', name: 'Kael', gm: false }, ts: 5, ends: 9, total: 2, lines: [{ n: 'Bram', w: 'Spot: success, +1' }], label: 'Climb', as: 'Kael', cap: 3, can: [{ id: 'c_b', name: 'Bram' }], rolls: [{ i: 0, label: 'Spot' }], mine: 1, rid: 'q1' })
        && D.cleanHelpCard(Object.assign({}, card, { total: 500 })) === null && D.cleanHelpCard(Object.assign({}, card, { can: [{ id: 'x', name: 'B' }] })) === null && D.cleanHelpCard(Object.assign({}, card, { lines: [{ n: 'B', w: 'x\u0007' }] })) === null
        && D.cleanHelpCard(Object.assign({}, card, { mine: 2 })).mine === undefined && D.cleanHelpCard(Object.assign({}, card, { done: 1, why: 'left' })).why === 'left' && D.cleanHelpCard(Object.assign({}, card, { why: 'left' })).why === undefined && D.cleanHelpCard(Object.assign({}, card, { mine: undefined })).rid === undefined);
    check('a press is Help with a character, by a roll’s place where it helps by a roll, or Roll', J(D.cleanHelpAct({ id: 'r_abc', key: 'help', char: 'c_b', ix: 0 })) === J({ id: 'r_abc', key: 'help', char: 'c_b', ix: 0 }) && J(D.cleanHelpAct({ id: 'r_abc', key: 'roll', char: 'c_b' })) === J({ id: 'r_abc', key: 'roll' })
        && D.cleanHelpAct({ id: 'r_abc', key: 'help' }) === null && D.cleanHelpAct({ id: 'r_abc', key: 'help', char: 'c_b', ix: 9 }) === null && D.cleanHelpAct({ id: 'r_abc', key: 'boom' }) === null);
    // ---- the host's hold, run for real
    const net = read('scripts/net.js');
    const sl = net.slice(net.indexOf('// [netcheck:helphold-start]'), net.indexOf('// [netcheck:helphold-end]'));
    const world = (sysOver) => {
        const sys = S.cleanSystem(Object.assign({}, raw, sysOver || {}), { F, gmView: true });
        const camp = { id: 'k1', system: sys, chars: { c_k: { id: 'c_k', name: 'Kael', ownerId: 'p1', values: { f_st: 12 } }, c_b: { id: 'c_b', name: 'Bram', ownerId: 'p2', values: { f_st: 18 } }, c_d: { id: 'c_d', name: 'Dara', ownerId: 'p3', values: { f_st: 3 } }, c_n: { id: 'c_n', name: 'Mule', npc: true, values: { f_st: 20 } }, c_far: { id: 'c_far', name: 'Far', ownerId: 'p2', values: { f_st: 18 } } },
            items: { m1: { type: 'map', whiteboard: [{ id: 't1', isChar: true, charId: 'c_k', ownerId: 'p1' }, { id: 't2', isChar: true, charId: 'c_b', ownerId: 'p2' }, { id: 't3', isChar: true, charId: 'c_d', ownerId: 'p3' }, { id: 't4', isChar: true, charId: 'c_n' }] } } };
        const sent = [], local = [], says = [], log = [], conns = ['p1', 'p2', 'p3'].map((p, i) => ({ peer: 'peer' + i, open: true, send: m => sent.push([p, JSON.parse(JSON.stringify(m))]) }));
        const netO = { active: true, role: 'host', conns: conns, roster: { peer0: { id: 'p1' }, peer1: { id: 'p2' }, peer2: { id: 'p3' } } }, chatLog = [];
        const timers = []; const fakeSet = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
        const win = { wpSheets: { playerSystem: () => S.cleanSystem(sys, { F, gmView: false }) }, wpStepLog: (a, b, c) => log.push([a, b, c]) };
        const api = new Function('net', 'chatLog', 'renderChat', 'pushChat', 'sendFailed', 'fxLib', 'itemLib', 'handsTo', 'turnNote', 'toast', 'window', 'setTimeout', 'clearTimeout',
            sl + '\nreturn { helpHold, helpPress, helpTake, helpAway, helpForget, held: function() { return _helpHeld; }, go: function() { return _helpGo; }, set: function(g) { _helpGo = g; } };')(
            netO, chatLog, () => {}, m => { chatLog.push(m); local.push(JSON.parse(JSON.stringify(m.help))); }, () => {}, () => ({}), () => ({}), () => false, (cn, w) => says.push(['conn', w]), w => says.push(['gm', w]), win, fakeSet, () => {});
        return { camp, sys, sent, local, says, log, conns, api, timers, chatLog };
    };
    const hold = (W, ent, over) => { const went = []; const ok = W.api.helpHold(Object.assign({ S, D, F, camp: W.camp, ent, ch: W.camp.chars.c_k, pid: 'p1', conn: W.conns[0], rid: 'q1', label: ent.label, from: { id: 'p1', name: 'Kael', gm: false }, mapId: 'm1', go: n => went.push(n) }, over || {})); return { ok, went }; };
    const W1 = world({ rolls: [{ id: 'r_a', label: 'Climb', formula: '3d6 <= ST', help: { by: 'fig', fig: 'ST - 10', needs: 'ST >= 10', cap: 9 } }, { id: 'r_b', label: 'Spot', formula: '3d6 <= ST' }] });
    const ent1 = W1.sys.rolls[0], h1 = hold(W1, ent1), last = (p) => { const x = W1.sent.filter(s => s[0] === p); return x.length ? x[x.length - 1][1] : null; };
    const id1 = Object.keys(W1.api.held())[0];
    check('a roll that waits for help is held, and each connection is told which of its own characters on the roller’s map may help (the needs read on the helper’s sheet), the roller that it is theirs, and the GM which NPCs',
        h1.ok && h1.went.length === 0 && !!id1 && last('p1').mine === 1 && last('p1').rid === 'q1' && last('p1').can === undefined && J(last('p2').can) === J([{ id: 'c_b', name: 'Bram' }]) && last('p3').can === undefined
        && W1.local.length === 1 && W1.local[0].gm === 1 && J(W1.local[0].can) === J([{ id: 'c_n', name: 'Mule' }]) && last('p2').label === 'Climb' && last('p2').as === 'Kael' && last('p2').cap === 9 && W1.timers[0].ms > 29000, J([W1.sent.map(s => [s[0], s[1].can, s[1].mine]), W1.local[0]]));
    const pr1 = W1.api.helpPress(id1, 'help', 'p2', 'c_b', undefined, W1.conns[1]), pr1b = W1.api.helpPress(id1, 'help', 'p2', 'c_b', undefined, W1.conns[1]), pr1c = W1.api.helpPress(id1, 'help', 'p3', 'c_d', undefined, W1.conns[2]), pr1d = W1.api.helpPress(id1, 'help', 'p2', 'c_far', undefined, W1.conns[1]), pr1e = W1.api.helpPress(id1, 'help', '', 'c_n', undefined, null);
    check('a helper presses Help once, adds their own figure, and the card says who and what; a character whose needs fail, one off the map, and one who helped already are refused in words',
        pr1 === true && pr1b === false && pr1c === false && pr1d === false && pr1e === true && J(last('p2').lines) === J([{ n: 'Bram', w: '+8' }, { n: 'Mule', w: '+10' }]) && last('p2').total === 9 && last('p2').can === undefined && W1.says.filter(s => /cannot help/.test(s[1])).length === 3,
        J([pr1, pr1b, pr1c, pr1d, pr1e, last('p2'), W1.says]));
    W1.chatLog[0].pressed = true;
    const rollOther = W1.api.helpPress(id1, 'roll', 'p2'), rollMine = W1.api.helpPress(id1, 'roll', 'p1');
    check('only its roller or the GM rolls it: then all the help, held to the cap, goes to the roll once, and the card says it is rolled', rollOther === false && rollMine === true && J(h1.went) === J([9]) && Object.keys(W1.api.held()).length === 0 && last('p2').done === 1 && W1.log.some(l => l[1] === 'rolled' && l[2].total === 9), J([h1.went, last('p2')]));
    check('this screen keeps one entry a held roll, the newest copy in its place, and a new copy may be pressed again (found by hand: a second Help did nothing)', W1.chatLog.length === 1 && W1.chatLog[0].pressed === false && W1.chatLog[0].help.done === 1, J(W1.chatLog.map(m => [m.pressed, m.help.lines.length])));
    const W2 = world(), ent2 = W2.sys.rolls[0], h2 = hold(W2, ent2), id2 = Object.keys(W2.api.held())[0];
    const rp = (pid, ch, ix, cn) => W2.api.helpPress(id2, 'help', pid, ch, ix, cn);
    const seq = [0, 0, 0]; let at = 0; const realRandom = Math.random;
    const W2last = p => { const x = W2.sent.filter(s => s[0] === p); return x[x.length - 1][1]; };
    const r2a = rp('p2', 'c_b', undefined, W2.conns[1]), r2b = rp('p2', 'c_b', 0, W2.conns[1]);
    check('help by a roll: the card offers the rolls a helper may make, a press with no roll is refused, and the helper’s own roll is made on their names and read off the table',
        J(W2.sent.filter(s => s[0] === 'p2')[0][1].rolls) === J([{ i: 0, label: 'Spot' }]) && r2a === false && r2b === true && /^Spot: (success, \+1|failure, nothing|critical success, \+1|critical failure, nothing)$/.test(W2last('p2').lines[0].w), J([W2last('p2'), W2.says]));
    const r2c = rp('', 'c_n', 0, null);
    check('the same roll helps once unless the roll says it may help more than once', r2c === false && W2.says.some(s => /already/.test(s[1])) && W2last('p1').rolls === undefined, J(W2.says));
    const W3 = world({ rolls: [{ id: 'r_a', label: 'Climb', formula: '3d6 <= ST', help: { by: 'roll', rolls: ['r_b'], table: { hit: 1 }, same: true } }, { id: 'r_b', label: 'Spot', formula: '3d6 <= ST' }] }), h3 = hold(W3, W3.sys.rolls[0]), id3 = Object.keys(W3.api.held())[0];
    check('with The same roll may help more than once, two helpers may both help with it', W3.api.helpPress(id3, 'help', 'p2', 'c_b', 0, W3.conns[1]) === true && W3.api.helpPress(id3, 'help', '', 'c_n', 0, null) === true);
    W2.timers[0].fn();
    check('when the wait ends it rolls by itself with the help so far', h2.went.length === 1 && Object.keys(W2.api.held()).length === 0, J(h2.went));
    const W4 = world(), h4 = hold(W4, W4.sys.rolls[0]); W4.api.helpAway('peer0');
    const l4 = W4.sent.filter(s => s[0] === 'p2').pop()[1];
    check('a roll whose roller leaves is not rolled, and the card says why', h4.went.length === 0 && Object.keys(W4.api.held()).length === 0 && l4.done === 1 && l4.why === 'left');
    const W5 = world(), h5 = hold(W5, W5.sys.rolls[0], { mapId: null }); const l5 = W5.sent.filter(s => s[0] === 'p2').pop()[1];
    check('a roller with no token on a map is helped by any player at the table', J(l5.can) === J([{ id: 'c_b', name: 'Bram' }, { id: 'c_far', name: 'Far' }]), J(l5.can));
    W5.api.set({ peer: 'peer0', rid: 'q1', n: 3 });
    check('the press it held, let go, is taken once by the same connection and rid', W5.api.helpTake('peer1', 'q1') === null && J(W5.api.helpTake('peer0', 'q1')) === J({ peer: 'peer0', rid: 'q1', n: 3 }) && W5.api.helpTake('peer0', 'q1') === null);
    W5.api.helpForget();
    check('a new table forgets every roll waiting for help', Object.keys(W5.api.held()).length === 0);
    // ---- the card, drawn on nodes of plain objects
    const dj = read('scripts/dice.js'), rh = dj.slice(dj.indexOf('function renderHelp(m) {'), dj.indexOf('// 1.6.0 (the live test, 2026-10-30): whether a card still asks for a press on this machine:'));
    const node = (tag, cls, txt) => ({ tagName: tag, className: cls || '', textContent: txt === undefined ? '' : String(txt), kids: [], style: {}, title: '', type: '', disabled: false, on: {}, appendChild(k) { this.kids.push(k); return k; }, addEventListener(e, f) { this.on[e] = f; } });
    const text = n => n.kids.length ? n.kids.map(text).join('') : n.textContent;
    const all = n => [n].concat(...n.kids.map(all));
    const acts = [];
    const drawH = (rec, pop) => new Function('el', 'document', 'chatTime', 'asTag', 'net', 'window', rh + '\nreturn renderHelp;')((t, c, x) => node(t, c, x), { createTextNode: t => node('#text', '', t) }, () => '12:00', null, () => ({ helpAct: (...a) => { acts.push(a); return true; } }), pop ? { wpPopout: true } : {})({ help: rec });
    const cH = drawH({ id: 'r_abc', from: { id: 'p1', name: 'Kael', gm: false }, ts: 1, ends: Date.now() + 20000, total: 1, lines: [{ n: 'Bram', w: 'Spot: success, +1' }], label: 'Climb', as: 'Kael', cap: 3, can: [{ id: 'c_b', name: 'Bram' }, { id: 'c_x', name: '<b>Ann</b>' }], rolls: [{ i: 0, label: 'Spot' }] });
    const btns = all(cH).filter(n => n.tagName === 'button');
    check('the card says what waits, who helped with what and the help so far, and a Help button for each character and roll this machine may help with, its words as text',
        /Climb waits for help\./.test(text(cH)) && /Bram: Spot: success, \+1/.test(text(cH)) && /Help so far: \+1, at most \+3/.test(text(cH)) && J(btns.map(b => b.textContent)) === J(['Bram: Spot', '<b>Ann</b>: Spot']) && /It rolls by itself in \d+ seconds\./.test(text(cH)), J([text(cH), btns.map(b => b.textContent)]));
    const cG = drawH({ id: 'r_abc', from: { id: 'p1', name: 'Kael', gm: false }, ts: 1, ends: Date.now() + 9000, total: 0, lines: [], label: 'Climb', gm: 1, can: [{ id: 'c_n', name: 'Mule' }] }), cP = drawH({ id: 'r_abc', from: { id: 'p1', name: 'Kael', gm: false }, ts: 1, ends: Date.now() + 9000, total: 0, lines: [], label: 'Climb', can: [{ id: 'c_b', name: 'Bram' }] });
    check('the GM’s card names the NPC it helps as, even when only one is left (found by hand); a player with one character presses Help', J(all(cG).filter(n => n.tagName === 'button').map(b => b.textContent)) === J(['Help as Mule', 'Roll']) && J(all(cP).filter(n => n.tagName === 'button').map(b => b.textContent)) === J(['Help']));
    btns[1].on.click();
    check('a press of Help asks the table to help as that character with that roll', J(acts[0]) === J(['r_abc', 'help', 'c_x', 0]));
    const cMine = drawH({ id: 'r_abc', from: { id: 'p1', name: 'Kael', gm: false }, ts: 1, ends: Date.now() + 5000, total: 0, lines: [], label: 'Climb', mine: 1 }), rb = all(cMine).filter(n => n.tagName === 'button');
    rb[0].on.click();
    check('its roller has Roll and no Help, and Roll asks the table to roll it now', J(rb.map(b => b.textContent)) === J(['Roll']) && J(acts[1]) === J(['r_abc', 'roll']) && /, or press Roll\./.test(text(cMine)));
    const cDone = drawH({ id: 'r_abc', from: { id: 'p1', name: 'Kael', gm: false }, ts: 1, ends: 0, total: 2, lines: [{ n: 'Bram', w: '+2' }], label: 'Climb', done: 1 }), cLeft = drawH({ id: 'r_abc', from: { id: 'p1', name: 'Kael', gm: false }, ts: 1, ends: 0, total: 0, lines: [], label: 'Climb', done: 1, why: 'left' }), cPop = drawH({ id: 'r_abc', from: { id: 'p1', name: 'Kael', gm: false }, ts: 1, ends: Date.now() + 5000, total: 0, lines: [], label: 'Climb', mine: 1, can: [{ id: 'c_b', name: 'Bram' }] }, true);
    check('a card that is over has no button and says it is rolled, or that its roller left; a window of its own draws no button', !all(cDone).some(n => n.tagName === 'button') && /Climb is rolled\./.test(text(cDone)) && /its roller left/.test(text(cLeft)) && !all(cPop).some(n => n.tagName === 'button'));
    // ---- the wiring
    check('a player’s roll is held before anything of it is rolled or spent, judged afresh when it is let go, and made with all the help as a bonus; its limiter is not spent twice',
        net.includes("var hgQ = typeof helpTake === 'function' ? helpTake(conn.peer, q.rid) : null;") && net.includes("var lim = hgQ ? true : diceLimit.allow(conn.peer, Date.now());")
        && net.includes("if (hgQ && hgQ.n) { var chgQ = Dq.composeModifier(wantQ, (q.mod || 0) + (swQ ? swQ.v : 0) + hgQ.n, Fq.parse, (q.modD || '') + (swQ && swQ.d ? swQ.d : ''));")
        && net.indexOf("if (heQ && heQ.help && helpHold(") < net.indexOf("var resQ = Fq.evaluate(q.expr, varsQ ? { vars: varsQ } : {});") && net.includes("go: function(n) { _helpGo = { peer: conn.peer, rid: q.rid, n: n }; handleMessage(msg, conn); }"));
    check('the GM’s own roll is held the same way, and made again with the help added', net.includes("if (chR && entR && entR.help && o.helped !== true && !o.priv && !o.gmOnly") && net.includes("var rH = net.diceRoll(cmH.ok ? cmH.expr : expr, Object.assign({}, o, { helped: true }));"));
    check('a player’s app takes a help card from its host alone, and the host a press through its limiter, judged by helpPress; the roller leaving and a new table end what waits',
        net.includes("} else if (msg.type === 'help' && net.role === 'client') {") && net.includes("hpc = Dhp && Dhp.cleanHelpCard ? Dhp.cleanHelpCard(msg) : null; if (!hpc) return;") && net.includes("} else if (msg.type === 'help-act' && net.role === 'host') {")
        && net.includes("if (pidHa && typeof helpPress === 'function') helpPress(qha.id, qha.key, pidHa, qha.char, qha.ix, conn);") && net.includes("if (typeof helpAway === 'function') helpAway(conn.peer);") && net.includes("if (typeof helpForget === 'function') helpForget();") && net.includes("m.help ? (window.wpDice && window.wpDice.renderHelp ? window.wpDice.renderHelp(m) : null)"));
    const sh = read('scripts/sheets.js');
    check('the System editor has Others may help on a roll and a list’s roll, and the Combat tab its wait', sh.includes("checkLabel('sys-help-on', !!h, 'Others may help'") && sh.includes("row.appendChild(helpBox(r));") && sh.includes("cb2.appendChild(helpBox(rr));") && sh.includes("input('sys-help-defwaitin field'") && read('scripts/sysui.js').includes("['help', 'Help from others', 0, ['sys-help']],"));
    const help = read('index.html'), wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wa = read('assets/whatsnew.txt');
    check('Help says Others may help, and both notes say it', help.includes('<li><b>Others may help</b> makes a roll wait for help before it is rolled.') && wn.includes('- A roll can wait for help.') && wa.includes('- A roll can wait for help.'));
    summed = true; console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      crashed -> ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) console.log('FAIL      assistcheck left a check waiting'); });
