/* nettimecheck.js: what time does at a table, on the host, the tests that came out of netcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md,
   "Tests move with their area", 2026-11-18). The code lives in system/app/scripts/nettime.js, a part of net.js; every slice of its
   markers (fxtime, timecard, timenote) and every range whose two ends stand in it is read from the part by its own name, while the
   slices of other areas (the fight's orders, combats, the clock's word to the table) still read the joined net.js through srcjoin.
   What it covers, each block as it stood in netcheck.js: timed effects on the GM's machine (a turn takes a round, a fight stops the
   clock, the Calendar's game clock runs them outside a fight), an upkeep paid by the clock and said, a time rules summary to its player
   and the GM, each fight keeping its own time with the clock reading the one furthest behind (fold 4 of backlog 152), and a player's
   time rule notes with the GM's one line a run.
   Run: node tools/nettimecheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file (nettime.js) reads that part by its own name
const { src, between, fnSrc, lineOf } = kit.netSlices('nettimecheck');
const ordersSrc = between('// [netcheck:orders-start]', '// [netcheck:orders-end]', 'orders', 'netfight.js');
const j = JSON.stringify;
// the app's own own(), which netcheck hands its blocks among its helpers (H.own), read from net.js by its line
const H = { own: new Function(lineOf('function own(') + '\nreturn own;')() };
check('nettimecheck: nettime.js is a part of net.js, read by its own name', kit.part('nettime.js').includes('// [split:body-start]') && kit.part('nettime.js').includes('// [netcheck:fxtime-start]'));

// Turn-based combat T5a (D9, D10): timed effects on the GM's own machine — a turn takes a round, a combat's start stops the clock and its end
// starts it, outside combat the clock runs (every character not in one); what runs out comes off with a private line for the GM and each of its
// player's connections (net.js fxtime, run for real)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ftS = between('// [netcheck:fxtime-start]', '// [netcheck:fxtime-end]', 'fxtime', 'nettime.js'), pidF = (() => { const i = src.indexOf('function peerProfileId('); return src.slice(i, src.indexOf('\n', i)) + '\n'; })();
    const sysF = Sx.cleanSystem({ v: 1, name: 'F', fields: [{ id: 'f_fx', key: 'Effects', kind: 'effects' }], rolls: [], effects: [{ id: 'e_b', name: 'Bless', dur: '2 turns', mods: [] }, { id: 'e_q', name: 'Quick', dur: '10 seconds', mods: [] }] }, { F: Fx, gmView: true });
    const mkF = o => {
        o = o || {};
        const map = { type: 'map', whiteboard: [{ id: 't_p', isChar: true, charId: 'c_p', ownerId: 'u_a' }, { id: 't_q', isChar: true, charId: 'c_q', ownerId: 'u_a' }] };
        const camp = { items: { m1: map }, system: sysF, chars: {
            c_p: { id: 'c_p', name: 'Pat', ownerId: 'u_a', values: { f_fx: [{ id: 'x_1', ref: 'e_b', on: true, t: { left: 6, at: 0 } }] } },
            c_q: { id: 'c_q', name: 'Quin', ownerId: 'u_a', values: { f_fx: [{ id: 'x_2', ref: 'e_q', on: true, t: { left: 10, at: 1000 } }] } },
            c_r: { id: 'c_r', name: 'Rex', npc: true, values: { f_fx: [{ id: 'x_3', ref: 'e_q', on: true, t: { left: 10, at: 1000 } }] } } } };
        const out = { deltas: [], changed: [], chat: [], saves: 0 }, mk = p => ({ peer: p, open: true, sent: [], send(m) { this.sent.push(m); } }), conns = [mk('pA'), mk('pB')];
        const net = { active: true, role: o.role || 'host', stream: false, myId: 'u_gm', conns, roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } }, combats: o.combats || {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const api = new Function('net', 'window', 'SC', 'getActiveCampaign', 'own', 'saveRemoteSoon', 'pushChat', 'sendFailed', pidF + ftS + '\n' + ordersSrc + '\nreturn { apply: fxApply, turn: turnFxStart, turnEnd: turnFxEnd, edge: fxCombatEdge, clock: fxClockTick, inCombat: net.charInCombat };')(
            net, { wpVtt: { on: k => (k === 'sheets' ? o.sheets !== false : k === 'calendar' ? o.calendar === true : true) }, wpSheets: { charChanged: id => out.changed.push(id) } }, () => Sx, () => camp, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), () => out.saves++, m => out.chat.push(m), e => { throw e; });
        return { out, net, camp, api, conns };
    };
    const cb = { mapId: 'm1', round: 1, turn: 0, rows: [{ id: 'r_p', tokId: 't_p' }] };
    {   // 1.6.0 Counts at its turn's end, on the host: the row's own turn starts and ends, a step back and two rows of one sheet
        const fxE = Object.assign(JSON.parse(JSON.stringify(sysF)), {}); fxE.effects = fxE.effects.map(d => Object.assign({}, d, { ends: 'turnEnd' }));
        const g = mkF({ combats: { m1: cb } }), cE = JSON.parse(JSON.stringify(cb)); g.camp.system = fxE; const row = cE.rows[0], secs = g.camp.chars.c_p.values.f_fx[0].t.left;
        g.api.turn('m1', cE); const held = JSON.parse(JSON.stringify(g.camp.chars.c_p.values.f_fx)), told = g.out.chat.length;
        g.api.turnEnd('m1', cE, row, 1); const gone = g.camp.chars.c_p.values.f_fx.length, said = g.out.chat.map(m => m.text);
        const h = mkF({ combats: { m1: cb } }), cH = JSON.parse(JSON.stringify(cb)); h.camp.system = fxE; h.camp.chars.c_p.values.f_fx[0].t = { left: secs * 2, at: 0 }; h.api.turn('m1', cH); h.api.turnEnd('m1', cH, cH.rows[0], 1); const once = h.camp.chars.c_p.values.f_fx[0].t.left; h.api.turnEnd('m1', cH, cH.rows[0], 1); const twice = h.camp.chars.c_p.values.f_fx[0].t.left;
        const sn = JSON.stringify(Object.keys(h.net.combats));
        check('1.6.0 Counts at on the host (turnFxStart and turnFxEnd over the real fxTick): an effect set to its turn\'s end stays on through its character\'s turn start with nothing said, runs out as that turn ends and is said then; a turn\'s end counts once in a round of that fight, whichever row of the sheet ends',
            held.length === 1 && held[0].t.left === secs && held[0].t.e === 1 && told === 0 && gone === 0 && said.some(s => /ran out on Pat/.test(s)) && once === secs && twice === secs && sn.length > 0, j([held, told, gone, said, once, twice]));
    }
    {   // item 20 K4: the Calendar on — the tick only stops a running clock; the game clock's move (net.fxGameTime) runs every timed effect outside a fight
        const g = mkF({ calendar: true, combats: { m1: cb } }), now0 = Date.now(); g.camp.chars.c_q.values.f_fx[0].t = { left: 10, at: now0 - 2000 }; g.camp.chars.c_r.values.f_fx[0].t = { left: 30, at: 0, p: 1 };
        g.api.clock(); const gq1 = JSON.parse(JSON.stringify(g.camp.chars.c_q.values.f_fx[0].t)), gd1 = g.out.deltas.length; g.api.clock(); const gd2 = g.out.deltas.length;
        g.net.fxGameTime(3); const gq2 = g.camp.chars.c_q.values.f_fx[0].t.left, gp2 = JSON.parse(JSON.stringify(g.camp.chars.c_p.values.f_fx[0].t)), gr2 = g.camp.chars.c_r.values.f_fx[0].t;
        [0, -5, NaN, '3'].forEach(v => g.net.fxGameTime(v)); const gq3 = g.camp.chars.c_q.values.f_fx[0].t.left;
        g.net.fxGameTime(3600); const gGone = [g.camp.chars.c_q.values.f_fx.length, g.out.chat.map(m => m.text)];
        const off = mkF({ calendar: false }); off.camp.chars.c_q.values.f_fx[0].t = { left: 10, at: 0 }; off.net.fxGameTime(3); const offT = JSON.parse(JSON.stringify(off.camp.chars.c_q.values.f_fx[0].t)); off.api.clock(); const offT2 = off.camp.chars.c_q.values.f_fx[0].t;
        const cli = mkF({ calendar: true, role: 'client' }); cli.camp.chars.c_q.values.f_fx[0].t = { left: 10, at: 0 }; cli.net.fxGameTime(3); const noSheets = mkF({ calendar: true, sheets: false }); noSheets.camp.chars.c_q.values.f_fx[0].t = { left: 10, at: 0 }; noSheets.net.fxGameTime(3);
        check('item 20 K4 the Calendar on (host, run for real): the tick stops a clock still running, keeping what ran (about 8 of 10 s), once; each move of the game clock on takes that much from every timed effect outside a fight (Quin 8 to 5), never one in the fight (Pat) or a paused one (Rex); no move, one back or one that is no number takes nothing; what runs out comes off with its lines; the Calendar off, the game clock runs nothing and the tick starts a stopped clock again from now; a player\'s machine or a table without sheets runs nothing',
            gq1.at === 0 && gq1.left > 7.5 && gq1.left <= 8.1 && gd1 >= 1 && gd2 === gd1 && Math.abs(gq2 - (gq1.left - 3)) < 1e-6 && j(gp2) === j({ left: 6, at: 0 }) && j(gr2) === j({ left: 30, at: 0, p: 1 }) && gq3 === gq2
            && gGone[0] === 0 && gGone[1].indexOf('Quick ran out on Quin.') >= 0 && j(offT) === j({ left: 10, at: 0 }) && offT2.at > 0 && offT2.left === 10 && cli.camp.chars.c_q.values.f_fx[0].t.left === 10 && noSheets.camp.chars.c_q.values.f_fx[0].t.left === 10
            , j([gq1, gd1, gd2, gq2, gp2, gr2, gq3, gGone, offT, offT2]));
    }
    const a = mkF({ combats: { m1: cb } }); a.api.turn('m1', cb);
    check('T5a a turn\'s start (host, run for real): a round of the character\'s timed effects passes; one that runs out comes off (stored, sent as a delta, its views redrawn) with a private line for the GM and each connection of its player, never another\'s',
        j(a.camp.chars.c_p.values.f_fx) === '[]' && j(a.out.deltas) === j([['c_p', { f_fx: [] }]]) && j(a.out.changed) === j(['c_p']) && a.out.chat.length === 1 && a.out.chat[0].text === 'Bless ran out on Pat.' && a.out.chat[0].scope === 'whisper'
        && a.conns[0].sent.length === 1 && a.conns[0].sent[0].text === 'Bless ran out on Pat.' && !a.conns[1].sent.length && a.api.inCombat('c_p') === true && a.api.inCombat('c_q') === false, j([a.out, a.conns.map(c => c.sent)]));
    const b = mkF({ combats: { m1: cb } }); b.camp.chars.c_p.values.f_fx[0].t = { left: 6, at: Date.now() - 2000 }; b.api.edge('m1', cb, 'bank');
    const bT = b.camp.chars.c_p.values.f_fx[0].t; b.api.edge('m1', cb, 'resume'); const rT = b.camp.chars.c_p.values.f_fx[0].t;
    check('T5a a combat\'s start banks what ran and stops the clock; its end starts it again from now (what is left carries from one encounter to the next)',
        bT.at === 0 && bT.left < 6 && bT.left >= 0 && rT.left === bT.left && rT.at > 0, j([bT, rT]));
    const c = mkF({ combats: { m1: cb } }); c.camp.chars.c_p.values.f_fx[0].t = { left: 6, at: 1000 }; c.api.clock();   // Pat's clock long started: in the combat it must not tick
    const d = mkF({ role: 'client' }); d.api.clock();
    const e = mkF({ sheets: false }); e.api.clock();
    check('T5a the clock (every few seconds, on the GM\'s own machine): each character out of combat — Quick (10 s since long ago) runs out on Quin and on the NPC Rex (their lines: Quin\'s player hears it; an NPC\'s to the GM alone); Pat, in the combat, is left to his turns; a player\'s machine and a table without sheets run nothing',
        j(c.camp.chars.c_q.values.f_fx) === '[]' && j(c.camp.chars.c_r.values.f_fx) === '[]' && c.camp.chars.c_p.values.f_fx.length === 1 && j(c.out.chat.map(m => m.text)) === j(['Quick ran out on Quin.', 'Quick ran out on Rex.']) && c.conns[0].sent.length === 1
        && d.camp.chars.c_q.values.f_fx.length === 1 && !d.out.chat.length && e.camp.chars.c_q.values.f_fx.length === 1, j([c.out.chat, c.conns[0].sent]));
    const T = src.replace(/\r\n/g, '\n');
    check('T5a the wiring (source): a player\'s added effect starts its timer on the host with the host\'s clock and whether they are in a combat; turnStarted takes a round; a combat\'s start banks and its end resumes, once no fight is left (152 fold 4, moved on purpose); the clock starts with the first render',
        /view: window\.wpSheets \? window\.wpSheets\.playerSystem\(campX\) : null, now: Date\.now\(\), inCombat: !!\(net\.charInCombat && net\.charInCombat\(qx\.charId\)\), timersGm: !!\(campX\.turnRules && campX\.turnRules\.timers === 'gm'\) \}\);/.test(T) && /try \{ turnFxStart\(mapId, c\); \} catch \(e\)/.test(T)
        && /if \(f && !had\) \{ try \{ fxCombatEdge\(mapId, f, 'bank'\); \}/.test(require('./checkkit').part('netfight.js')) && /if \(had && !leftO\) \{ try \{ fxCombatEdge\(mapId, had, 'resume'\); \}/.test(T) && /function renderWhere\(\) \{\n\s*if \(typeof fxClockStart === 'function'\) fxClockStart\(\);/.test(T));
})());

// 205 follow-up (3): an upkeep paid by the clock (net.rowSpans with the real systemcore) is said through net.timeCard, both run for real: the GM's
// whole line and its player's the rows they may see, with no figure that would tell of one they may not; an NPC's to the GM alone
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ftS = between('// [netcheck:fxtime-start]', '// [netcheck:fxtime-end]', 'fxtime', 'nettime.js'), tcS = between('// [netcheck:timecard-start]', '// [netcheck:timecard-end]', 'timecard', 'nettime.js'), pidU = (() => { const i = src.indexOf('function peerProfileId('); return src.slice(i, src.indexOf('\n', i)) + '\n'; })();
    const sysU = Sx.cleanSystem({ v: 1, name: 'U', rolls: [], fields: [{ id: 'f_mp', key: 'MP', label: 'MP', kind: 'resource', maxFormula: '10', def: 'max', vis: 'all' },
        { id: 'f_pw', key: 'Powers', label: 'Powers', kind: 'item-list', vis: 'all', edit: 'owner', list: { on: { label: 'Up' }, stats: [{ key: 'keep' }], upkeep: { pool: 'f_mp', amt: 'Row.keep', each: 'clock', per: { n: 1, u: 'min' }, stop: true } } }],
        items: [{ id: 'i_sh', name: 'Shield', stats: { keep: 3 } }, { id: 'i_ve', name: 'Veil', vis: 'gm', stats: { keep: 1 } }, { id: 'i_gl', name: 'Glow', stats: { keep: 9 } }], sheet: { sections: [] } }, { F: Fx, gmView: true });
    const mkU = role => {
        const camp = { items: {}, system: sysU, chars: {
            c_p: { id: 'c_p', name: 'Pat', ownerId: 'u_a', values: { f_mp: { cur: 10 }, f_pw: [{ id: 'w_1', defId: 'i_sh', qty: 1, on: true }, { id: 'w_2', defId: 'i_ve', qty: 1, on: true }, { id: 'w_3', defId: 'i_gl', qty: 1, on: true }] } },
            c_q: { id: 'c_q', name: 'Quin', ownerId: 'u_b', values: { f_mp: { cur: 10 }, f_pw: [{ id: 'w_1', defId: 'i_sh', qty: 1, on: true }] } },
            c_r: { id: 'c_r', name: 'Rex', npc: true, values: { f_mp: { cur: 10 }, f_pw: [{ id: 'w_1', defId: 'i_sh', qty: 1, on: true }] } } } };
        const out = { chat: [], log: [], deltas: [] }, mk = p => ({ peer: p, open: true, sent: [], send(m) { this.sent.push(m); } }), conns = [mk('pA'), mk('pB')];
        const net = { active: true, role: role || 'host', stream: false, myId: 'u_gm', conns, roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } }, combats: {}, syncCharDelta: (id, d) => out.deltas.push(id) };
        new Function('net', 'window', 'SC', 'getActiveCampaign', 'own', 'saveRemoteSoon', 'pushChat', 'sendFailed', 'logEvent', pidU + ftS + '\n' + tcS + '\n' + ordersSrc + '\nreturn 0;')(
            net, { wpVtt: { on: () => true }, wpSheets: { charChanged: () => {} }, wpFormula: Fx }, () => Sx, () => camp, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), () => {}, m => out.chat.push(m), e => { throw e; }, (k, t) => out.log.push([k, t]));
        return { net, camp, out, conns };
    };
    const U = mkU(); U.net.rowSpans({ c_p: 60, c_q: 60, c_r: 60 }, () => 60);
    const gmLines = U.out.chat.map(m => m.text), pA = U.conns[0].sent.map(m => m.text), pB = U.conns[1].sent.map(m => m.text);
    const U2 = mkU(); U2.net.rowSpans({ c_p: 30, c_r: 30 }, () => 60);
    const U3 = mkU('client'); U3.net.rowSpans({ c_p: 60 }, () => 60);
    check('205 follow-up (3): an upkeep paid by the clock (net.rowSpans, the real systemcore, and net.timeCard, run for real) is said as a time note: the GM\'s chat gets each payment and a row switched off for lack of its pool, under Time in the Game Record; the row\'s player gets the rows they may see, with no figure after a line where a row out of their sight paid too, and another player nothing of it; an NPC\'s to the GM alone; nothing where nothing was paid, nor on a player\'s app',
        j(gmLines) === j(['Upkeep on Pat: Shield: MP −3 → 7; Veil: MP −1 → 6; Glow (not enough MP) switched off.', 'Upkeep on Quin: Shield: MP −3 → 7.', 'Upkeep on Rex: Shield: MP −3 → 7.'])
        && j(pA) === j(['Upkeep on Pat: Shield: MP −3; Glow (not enough MP) switched off.']) && j(pB) === j(['Upkeep on Quin: Shield: MP −3 → 7.'])
        && U.out.log.filter(l => l[0] === 'time').length === 3 && U.camp.chars.c_p.values.f_pw[2].on === false && U.camp.chars.c_p.values.f_mp.cur === 6
        && U2.out.chat.length === 0 && U2.conns.every(c => !c.sent.length) && U3.out.chat.length === 0 && U3.camp.chars.c_p.values.f_mp.cur === 10,
        j([gmLines, pA, pB, U.out.log, U2.out.chat, U3.out.chat]));
})());

// Item 20 K5: a time rules summary (net.timeCard) to its player and the GM, or the GM alone; the counts never on the wire; a fight's end asks
{
    const tcS = between('// [netcheck:timecard-start]', '// [netcheck:timecard-end]', 'timecard', 'nettime.js'), pidT = (() => { const i = src.indexOf('function peerProfileId('); return src.slice(i, src.indexOf('\n', i)) + '\n'; })();
    const mkT = role => { const out = { chat: [], log: [] }, mk = (p) => ({ peer: p, open: true, sent: [], send(m) { this.sent.push(m); } }), conns = [mk('pA'), mk('pA2'), mk('pB'), Object.assign(mk('pW'), {})];
        const net = { active: true, role: role || 'host', stream: false, myId: 'u_gm', conns, roster: { pA: { id: 'u_a' }, pA2: { id: 'u_a' }, pB: { id: 'u_b' } } };
        new Function('net', 'pushChat', 'logEvent', 'sendFailed', pidT + tcS)(net, m => out.chat.push(m), (k, t) => out.log.push([k, t]), e => { throw e; });
        return { net, out, conns }; };
    const T1 = mkT(); T1.net.timeCard({ id: 'c_a', ownerId: 'u_a', name: 'Pat' }, 'Pat: Heal ' + 'x'.repeat(2000), false);
    const T2 = mkT(); T2.net.timeCard({ id: 'c_a', ownerId: 'u_a' }, 'secret', true); T2.net.timeCard({ id: 'c_n', ownerId: 'u_a', npc: true }, 'orc', false); T2.net.timeCard(null, 'x', false);
    const T3 = mkT('client'); T3.net.timeCard({ id: 'c_a', ownerId: 'u_a' }, 'x', false);
    check('item 20 K5 a time rules summary (net.timeCard, run for real): a private line for the GM (pushed to its own chat) and one to every connection of the character\'s player, never another\'s or a waiting one, capped at 1500 characters, with a Game Record line under Time; the GM alone for a rule its player may not see or an NPC; nothing from a player\'s app or with no character',
        T1.out.chat.length === 1 && T1.out.chat[0].scope === 'whisper' && T1.out.chat[0].text.length === 1500 && T1.conns[0].sent.length === 1 && T1.conns[1].sent.length === 1 && T1.conns[2].sent.length === 0 && T1.conns[3].sent.length === 0 && T1.out.log.length === 1 && T1.out.log[0][0] === 'time'
        && T2.out.chat.length === 2 && T2.conns.every(c => c.sent.length === 0) && T3.out.chat.length === 0 && T3.conns.every(c => c.sent.length === 0), j([T1.conns.map(c => c.sent.length), T2.out.chat.map(m => m.text)]));
    check('item 20 K5 the counts never travel (clockOut sends a clock\'s time and its notes players may see, never what the time rules counted, a character\'s own time or the NPCs whose rules are off); 152 fold 4 (moved on purpose): a fight\'s end hands the round it ends in to the coordinator as the last thing it does (pinned), where it asked the calendar about its rounds',
        /var o = \{ t: ck\.t \}, ns = /.test(src) && !/acc|lived|rulesOff/.test(between('// [netcheck:clocksync-start]', '// [netcheck:clocksync-end]', 'clocksync'))
        && /\n    if \(endO && typeof ordersMoved === 'function'\) ordersMoved\('end', endO\);[^\n]*\n    if \(had && !leftO\) \{ try \{ fxClockTick\(\); \}[^\n]*\n    return !!had;\n\}/.test(src) && !/clockFightEnd|wpCalendar\.fightEnded|wpCalendar\.rounds/.test(src));
}

// Fold 4 (backlog 152, docs/FIGHT_CLOCK_DESIGN.md sections 1 and 4 to 6; the owner's answer to question 1, "Every character"): each fight keeps its own
// time, and the clock reads the one furthest behind, counting every second once. net.js run for real (the combats slice, everything from combatRefresh
// to the old names, the orders slice, a player's End turn) beside calendar.js's own window slice (ownTime, second, moveTo) with the real calendarcore
// and systemcore, the sheets module a recorder: what it is asked to run, with the words and the round it is handed
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Cx = await import(url('calendarcore.js'));
    const J = v => JSON.stringify(v);
    const cbS = between('// [netcheck:combats-start]', '// [netcheck:combats-end]', 'combats'), setS = fnSrc('function combatRefresh() {', '\nnet.combatStep = function', 'combatSet'), stepS = fnSrc('net.combatStep = function', '\nnet.combatEnd = function', 'combatStep', 'netfight.js');
    const teS = between('// [netcheck:turnend-start]', '// [netcheck:turnend-end]', 'turnend');
    const calJs = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'calendar.js'), 'utf8').replace(/\r\n/g, '\n');
    const cutC = (a, b) => { const i = calJs.indexOf(a), k = calJs.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('netcheck: calendar.js slice ' + a); return calJs.slice(i, k); };
    const calSrc = cutC('// [sinkcheck:calendarwin-start]', '// [sinkcheck:calendarwin-end]') + cutC('function openWin()', '(function wire()');
    const tok = (id, charId, ownerId, more) => Object.assign({ id, type: 'image', isChar: true, charId, x: 0, y: 0, w: 50, h: 50 }, ownerId ? { ownerId } : {}, more || {});
    const fxv = (left, at) => ({ f_fx: [{ id: 'x_' + left, ref: 'e_c', on: true, t: { left: left, at: at || 0 } }] });
    const row = (tokId, name) => ({ id: 'r' + tokId, name, tokId, init: 0, src: null });
    const mkT = o => {
        o = o || {};
        const out = { toasts: [], logs: [], runs: [], errs: [], saves: 0, views: 0, notes: [] };
        const camp = { id: 'k', clock: { t: 43200 }, system: { fields: [{ id: 'f_fx', key: 'Effects', kind: 'effects' }], effects: [{ id: 'e_c', name: 'Charge', dur: '30 seconds', mods: [] }], combat: { turn: Object.assign({ secs: o.rs || 1 }, o.clock ? { clock: o.clock } : {}) }, rolls: o.rolls || [{ id: 'r_tick', label: 'Tick', apply: [], inFight: { n: 1, u: 'round' } }] },
            items: { mDocks: { id: 'mDocks', type: 'map', meta: { title: 'Docks' }, whiteboard: [tok('t_kael', 'c_kael', 'u_a'), tok('t_u7', 'c_u7'), tok('t_crate', 'c_crate', null, { isChar: false })] },
                mBridge: { id: 'mBridge', type: 'map', meta: { title: 'Bridge' }, whiteboard: [tok('t_sela', 'c_sela', 'u_b'), tok('t_u9', 'c_u9')] } },
            chars: { c_kael: { id: 'c_kael', name: 'Kael', ownerId: 'u_a', values: {} }, c_u7: { id: 'c_u7', name: 'Unit 7', npc: true, values: {} }, c_crate: { id: 'c_crate', name: 'Crate', npc: true, values: fxv(10) },
                c_sela: { id: 'c_sela', name: 'Sela', ownerId: 'u_b', values: {} }, c_u9: { id: 'c_u9', name: 'Unit 9', npc: true, values: {} }, c_rook: { id: 'c_rook', name: 'Rook', ownerId: 'u_c', values: fxv(30) } } };
        const mk = p => ({ peer: p, open: true, sent: [], send(m) { packCheck(m); this.sent.push(JSON.parse(J(m))); } }), conns = [mk('pA'), mk('pB')];
        const net = { active: true, role: 'host', myId: 'u_gm', conns, roster: { pA: { id: 'u_a', name: 'Pat', location: 'mDocks' }, pB: { id: 'u_b', name: 'Bea', location: 'mBridge' } }, combats: {}, targets: {}, turnSpent: {}, paused: false, syncCharDelta() {} };
        const win = { wpVtt: { on: k => (k === 'calendar' ? o.calendar !== false : true) }, wpCalendarCore: Cx, wpNotices: { wait: (k, t, kind) => { out.notes.push(['wait', k, t, kind]); return true; }, done: k => { out.notes.push(['done', k]); return true; } },
            wpSheets: { roundHook() {}, turnHook() {}, charChanged() {}, runTimeRules: (fires, words, at) => { out.runs.push([fires.map(f => f.c + ':' + f.r + (f.x ? ':x' : '') + ':' + f.n), words, at === undefined ? null : at]); return fires.length; } } };
        const env = { net, window: win, getActiveCampaign: () => camp, SC: () => Sx, own: H.own, toast: t => out.toasts.push(t), logEvent: (k, t) => out.logs.push(t), render() {}, console: { error: e => out.errs.push(String(e && e.stack || e)) }, showConfirm: (t, cb) => cb(true), sendFailed: e => { throw e; },
            anyFog: () => false, fogDrop: () => null, broadcast: () => {}, marksStart() {}, marksEnd() {}, renderNotepad() {}, ensurePlayerToken() {}, peerPaused: () => false, allow: () => true, saveRemoteSoon() {}, pushChat() {}, _lastSent: {} };
        const api = new Function(...Object.keys(env), "'use strict';\n" + cbS + '\n' + setS + '\n' + stepS + '\n' + ordersSrc + '\n' + (() => { const a = src.indexOf('net.itemGone = function(campId, itemId, title) {'); return a < 0 ? '' : src.slice(a, src.indexOf('\n};\n', a) + 4); })()   // 1.5.5: net.itemGone, for the delete of a map
            + (o.save ? '\n' + between('// [netcheck:fightsave-start]', '// [netcheck:fightsave-end]', 'fightsave') : '')   // 1.6.2: the fight held through the GM's reload, run for real beside the clock's tick
            + '\nreturn { combatsFor: combatsFor, combatsOverAll: combatsOverAll, ordersOfChars: ordersOfChars, orderOfIn: orderOfIn, charCombat: charCombat, fxClockTick: fxClockTick, hold: typeof fightsHold === \'function\' ? fightsHold : null, back: typeof fightsBack === \'function\' ? fightsBack : null, turnEnd: function(msg, conn) {\n' + teS + '\n} };')(...Object.values(env));
        const cal = new Function('document', 'window', 'getActiveCampaign', 'save', 'saveView', 'toast', 'roundSecs', 'cleanCalendar', 'cleanClock', 'cleanAcc', 'ruleFires', 'livedSpans', 'freshAcc', 'tCmp', 'tSpanMs', 'dateOf', 'timeOf', 'periodDays', 'dayLength', 'fmtDate', 'fmtWhen', 'fmtSpan', 'CAL_LIMITS', 'net', 'sysNow',
            "'use strict';\n" + calSrc + '\nreturn { ownTime: ownTime, second: second, fightBegan: fightBegan, moveTo: moveTo, st: function() { return { pend: pend, pendQ: pendQ }; }, memSt: function() { return memT; } };')(
            { getElementById: () => null }, win, () => camp, () => out.saves++, () => out.views++, t => out.toasts.push(t), Sx.roundSecs, Cx.cleanCalendar, Cx.cleanClock, Cx.cleanAcc, Cx.ruleFires, Cx.livedSpans, Cx.freshAcc, Cx.tCmp, Cx.tSpanMs, Cx.dateOf, Cx.timeOf, Cx.periodDays, Cx.dayLength, Cx.fmtDate, Cx.fmtWhen, Cx.fmtSpan, Cx.CAL_LIMITS, () => net, () => camp.system);
        win.wpCalendar = cal; if (o.clock) win.wpSystemCore = Sx;   // 1.6.2 Fight time: calendar.js reads the system's choice through it
        return { net, camp, api, cal, out, conns, win };
    };
    const docks = rows => ({ mapId: 'mDocks', round: 1, turn: 0, rows }), bridge = rows => ({ mapId: 'mBridge', round: 1, turn: 0, rows });
    // the owner's example: a fight begun at 12:00:00 with rounds of 1 s and ended in round 3; the clock goes on from 12:00:03, a second a round once
    const A = mkT(), fA = A.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')]));
    const a0 = [A.camp.clock.t, J(A.net.combats[fA].at), J(A.net.second)];
    A.net.fightStep(fA, 1); const aT = A.camp.clock.t; A.net.fightStep(fA, 1); const a1 = [aT, A.camp.clock.t, A.net.combats[fA].round];
    A.net.fightStep(fA, 1); A.net.fightStep(fA, 1); A.net.fightStep(fA, 1); const a2 = [A.camp.clock.t, A.net.combats[fA].round, A.net.combats[fA].turn];
    A.net.fightSet(fA, null); const a3 = [A.camp.clock.t, A.net.second, J(A.camp.clock.lived || null), A.out.runs, A.out.errs];
    check('152 fold 4 the owner\'s example (net.js and calendar.js, run for real): a fight begun at 12:00:00 with no fight on starts at the clock; each round it closes adds the round\'s length to its own time and moves the clock with it, 12:00:01 at round 2 and 12:00:02 at round 3, a turn within a round nothing; ended in round 3, the round it ends in counts and the clock goes on from 12:00:03; each round closed runs the In a fight rule for everyone in it, the NPC too, handed its round and its words',
        J(a0) === J([43200, J({ s: 43200, ms: 0 }), J({ frame: 'clock', s: 43200 })]) && J(a1) === J([43200, 43201, 2]) && J(a2) === J([43202, 3, 1])
        && J(a3) === J([43203, null, 'null', [[['c_kael:r_tick:x:1', 'c_u7:r_tick:x:1'], 'Round 1 on Docks', { round: 1 }], [['c_kael:r_tick:x:1', 'c_u7:r_tick:x:1'], 'Round 2 on Docks', { round: 2 }], [['c_kael:r_tick:x:1', 'c_u7:r_tick:x:1'], 'Round 3 on Docks', { round: 3 }]], []]), J([a0, a1, a2, a3]));
    // 1.6.2 Fight time, the system's (the owner, by prompt: "A system choice of three"): the clock runs on, or the date never moves
    const ftOf = mode => { const R = mkT({ clock: mode, rolls: [{ id: 'r_tick', label: 'Tick', apply: [], inFight: { n: 1, u: 'round' } }, { id: 'r_drain', label: 'Drain', apply: [], every: { n: 2, u: 'Sec' } }] }); R.camp.system.combat.turn.units = [{ key: 'Sec', secs: 1 }];
        const f = R.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')])); for (let i = 0; i < 5; i++) R.net.fightStep(f, 1); R.net.fightSet(f, null);
        return [R.camp.clock.t, R.net.second, J(R.camp.clock.lived || null), J(R.camp.clock.acc || null), R.out.runs, R.out.errs]; };
    const ftR = ftOf('runs'), ftA = ftOf('apart'), ftRuns = [[['c_kael:r_tick:x:1', 'c_u7:r_tick:x:1'], 'Round 1 on Docks', { round: 1 }], [['c_kael:r_tick:x:1', 'c_u7:r_tick:x:1'], 'Round 2 on Docks', { round: 2 }], [['c_kael:r_tick:x:1', 'c_u7:r_tick:x:1'], 'Round 3 on Docks', { round: 3 }]];
    check('1.6.2 Fight time (net.js ordersMoved and calendar.js ownTime, run for real): where the system says the clock runs on, or that a fight never moves the date, three rounds and an end move no clock, keep no second and touch no character\'s own time; each round still runs the In a fight rule for everyone in it, and a By the clock rule counts nothing from the rounds (the clock counts it)',
        J(ftR) === J([43200, null, 'null', 'null', ftRuns, []]) && J(ftA) === J(ftR), J([ftR, ftA]));
    // ten rounds of 0.1 s move the clock one second, exactly
    const B = mkT({ rs: 0.1 }), fB = B.net.fightSet(null, docks([row('t_kael', 'Kael')])), bClock = []; for (let i = 0; i < 10; i++) { B.net.fightStep(fB, 1); bClock.push(B.camp.clock.t); }
    check('152 fold 4 ten rounds of 0.1 s move the clock one second, exactly: the fight\'s own time is kept to the millisecond and the clock is its floor, where each round moved the clock by its length floored to nothing',
        J(bClock) === J([43200, 43200, 43200, 43200, 43200, 43200, 43200, 43200, 43200, 43201]) && J(B.net.combats[fB].at) === J({ s: 43201, ms: 0 }), J([bClock, B.net.combats[fB].at]));
    // two fights move the clock once: it reads the fight furthest behind
    const C2 = mkT(), c1f = C2.net.fightSet(null, docks([row('t_kael', 'Kael')])), c2f = C2.net.fightSet(null, bridge([row('t_sela', 'Sela')]));
    C2.net.fightStep(c1f, 1); const cc1 = C2.camp.clock.t; C2.net.fightStep(c2f, 1); const cc2 = C2.camp.clock.t; C2.net.fightStep(c1f, 1); C2.net.fightStep(c1f, 1); const cc3 = C2.camp.clock.t;
    check('152 fold 4 two fights on two maps move the clock once: a round of the Docks leaves the clock with the Bridge, a round of the Bridge then moves it one second, and the Docks running two rounds ahead moves it by the one it shares with the Bridge alone',
        J([cc1, cc2, cc3]) === J([43200, 43201, 43201]), J([cc1, cc2, cc3]));
    // a new fight starts at the time of the fight played, with no fight on at the clock; those who walk into a fight ahead of the second live the gap
    const D = mkT(), d1 = D.net.fightSet(null, docks([row('t_kael', 'Kael')])); D.net.fightStep(d1, 1); D.net.fightStep(d1, 1); D.net.fightStep(d1, 1);
    const d2 = D.net.fightSet(null, bridge([row('t_sela', 'Sela')])); D.net.fightStep(d1, 1); D.net.fightStep(d1, 1);
    const d3 = D.net.fightSet(null, bridge([row('t_u9', 'Unit 9')]));
    const dd = [J(D.net.combats[d1].at), J(D.net.combats[d2].at), J(D.net.combats[d3].at), D.camp.clock.t, D.net.fightOn === d3, J(D.camp.clock.lived)];
    check('152 fold 4 a new fight starts at the time of the fight played (the brief: at the Active fight\'s time, with no fight on at the clock): the Bridge begun while the Docks is played at 12:00:03 starts there; the GM playing the Docks on to 12:00:05 leaves the clock with the Bridge; a third fight begun then starts at 12:00:05, is the one played, and Unit 9, who walks in, lives the gap from the second as time outside a fight',
        J(dd) === J([J({ s: 43205, ms: 0 }), J({ s: 43203, ms: 0 }), J({ s: 43205, ms: 0 }), 43203, true, J({ c_kael: [43205, 0], c_u9: [43205, 0] })]), J(dd));
    // a step back is a correction: the fight's time and the clock go back, and on again counts nothing twice
    const E = mkT({ rolls: [{ id: 'r_tick', label: 'Tick', apply: [], inFight: { n: 1, u: 'round' } }, { id: 'r_drain', label: 'Drain', apply: [], every: { n: 2, u: 'Sec' } }] }); E.camp.system.combat.turn.units = [{ key: 'Sec', secs: 1 }];
    const e1 = E.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')])); E.net.fightStep(e1, 1); E.net.fightStep(e1, 1);
    const e0 = [E.camp.clock.t, E.out.runs.length, J(E.camp.clock.acc)];
    E.net.fightStep(e1, -1); const eB = [E.camp.clock.t, J(E.net.combats[e1].at), J(E.camp.clock.top)];
    E.net.fightStep(e1, 1); const eA = [E.camp.clock.t, E.out.runs.length, 'top' in E.camp.clock, J(E.camp.clock.acc)];
    check('152 fold 4 a Prev past a round\'s first turn is a correction: the fight\'s time and the clock go back a round, the clock keeping the highest second reached as its top; Next again reaches that second with nothing counted twice, neither a fighter\'s In a fight count nor anyone\'s By the clock count, and the top goes',
        J(e0) === J([43201, 1, J({ c_kael: { r_drain: 1 }, c_u7: { r_drain: 1 }, c_crate: { r_drain: 1 }, c_sela: { r_drain: 1 }, c_u9: { r_drain: 1 }, c_rook: { r_drain: 1 } })]) && J(eB) === J([43200, J({ s: 43200, ms: 0 }), J({ s: 43201, ms: 0 })]) && J(eA) === J([43201, 1, false, e0[2]]), J([e0, eB, eA]));
    // a fight run ahead and ended leaves its people ahead; the Active fight ending hands on to the one furthest behind
    const W = mkT(), wa = W.net.fightSet(null, docks([row('t_kael', 'Kael')])), wb = W.net.fightSet(null, bridge([row('t_sela', 'Sela')]));
    [1, 2, 3, 4].forEach(() => W.net.fightStep(wb, 1)); const wOn = W.net.fightOn === wb; W.net.fightSet(wb, null);
    const w1 = [wOn, W.camp.clock.t, J(W.camp.clock.lived), W.net.fightOn === wa];
    W.net.fightSet(wa, null); const w2 = [W.camp.clock.t, J(W.camp.clock.lived), W.net.second];
    check('152 fold 4 a fight run ahead and ended leaves its people\'s own time ahead of the clock: the Bridge played on four rounds and ended in round 5 leaves Sela at 12:00:05 while the clock stays with the Docks at 12:00:00, and the fight played, ending, hands on to the one furthest behind; the Docks ended in its first round moves the clock to 12:00:01 and Sela still lives nothing until it reaches her',
        J(w1) === J([true, 43200, J({ c_sela: [43205, 0] }), true]) && J(w2) === J([43201, J({ c_sela: [43205, 0] }), null]), J([w1, w2]));
    // the session's end (combatsOverAll, which leaveSession asks): the furthest ahead first, so the clock stays with the one behind
    const G = mkT(), ga = G.net.fightSet(null, docks([row('t_kael', 'Kael')])), gb = G.net.fightSet(null, bridge([row('t_sela', 'Sela')]));
    [1, 2, 3].forEach(() => G.net.fightStep(gb, 1)); const gN = G.api.combatsOverAll();
    const g1 = [gN, G.camp.clock.t, J(G.camp.clock.lived), G.out.logs.filter(l => /^Combat ended/.test(l)), G.net.second];
    check('152 fold 4 the session\'s end ends the fight furthest ahead first, so the clock stays with the one behind: the Bridge, three rounds ahead, ends first and leaves Sela at 12:00:04; the Docks ends in its first round and the clock goes on from 12:00:01, never to the Bridge\'s time',
        J(g1) === J([2, 43201, J({ c_sela: [43204, 0] }), ['Combat ended on Bridge after 4 rounds', 'Combat ended on Docks after 1 round'], null]), J(g1));
    // an NPC whose rules the GM switched off runs nothing by itself in a fight: listed unticked, with its round, and the window opens nothing
    const L = mkT(); L.camp.clock.rulesOff = ['c_u7']; const l1 = L.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')])); L.net.fightStep(l1, 1); L.net.fightStep(l1, 1);
    const pL = L.cal.st().pend, ll = [L.out.runs, pL && pL.fires.map(f => [f.c, f.r, f.x, f.rd]), pL && J(pL.on), pL && pL.words, L.out.toasts.filter(t => /^Time rules are due/.test(t)).length];
    check('152 fold 4 the Rules run switch (camp.clock.rulesOff) in a fight: an NPC listed there runs none of its rules by itself, its fire going to the waiting list unticked with the round it came from, while everyone else in the fight runs; the window never opens by itself while a fight runs, and a notice says the rules are due',
        J(ll) === J([[[['c_kael:r_tick:x:1'], 'Round 1 on Docks', { round: 1 }]], [['c_u7', 'r_tick', 1, 1]], '{"c_u7":false}', 'Round 1 on Docks', 1]), J(ll));
    // what is never sent; and the one judge for everyone at once: an unticked Is Character puts its character in no fight, its effects following the second
    const H4 = mkT(), h1 = H4.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_crate', 'Crate')])); [1, 2, 3, 4, 5, 6].forEach(() => H4.net.fightStep(h1, 1));
    const sent = J(H4.conns.map(c => c.sent)), snap = J(H4.api.combatsFor('u_a', 'mDocks')), oc = H4.api.ordersOfChars(H4.camp);
    const hh = [!!H4.net.combats[h1].at && typeof H4.net.combats[h1].n === 'number', /"at"|"n":|"rh"|"turned"/.test(sent + snap), J(Object.keys(oc)), H4.api.charCombat(H4.camp, 'c_crate'), Object.keys(H4.camp.chars).every(id => (oc[id] || null) === H4.api.orderOfIn(H4.camp, id)), H4.camp.chars.c_crate.values.f_fx[0].t.left, H4.camp.chars.c_rook.values.f_fx[0].t.left];
    check('152 fold 4 a fight\'s own time and count are the host\'s own: neither is in anything a player was sent nor in combatsFor; the one judge for every character at once (ordersOfChars) answers as orderOfIn does for each, so a token with Is Character unticked puts its character in no fight: its timed effects follow the second as everyone\'s outside a fight do (three rounds: Crate and Rook three seconds each)',
        J(hh) === J([true, false, J(['c_kael']), null, true, 7, 27]), J(hh));
    // found live: a timer begun on someone in no fight once real time stopped counting loses none of it at the bank, or a one-round effect ran out at the next tick
    { const XS = mkT({ calendar: false }), nowS = Date.now(), fxS = XS.camp.chars.c_rook.values.f_fx; XS.net.fightSet(null, docks([row('t_kael', 'Kael')])); XS.net._fxStop = nowS - 4000;
      fxS[0].t = { left: 1, at: nowS - 3000 }; XS.api.fxClockTick(); const lNew = XS.camp.chars.c_rook.values.f_fx[0] && XS.camp.chars.c_rook.values.f_fx[0].t ? J([XS.camp.chars.c_rook.values.f_fx[0].t.left, XS.camp.chars.c_rook.values.f_fx[0].t.at]) : 'gone';
      XS.camp.chars.c_rook.values.f_fx[0].t = { left: 30, at: nowS - 6000 }; XS.api.fxClockTick(); const lOld = XS.camp.chars.c_rook.values.f_fx[0].t;
      check('1.6.0 the clock\'s tick while a fight runs: a timer begun after real time stopped counting loses no real seconds at the bank, one begun before it loses what ran until then',
        lNew === J([1, 0]) && lOld.at === 0 && Math.abs(lOld.left - 28) < 0.01, J([lNew, lOld])); }
    // 1.6.2 (the review of the click test's fixes): a fight held through the GM's reload (fightsHold, then leaveSession(true) empties net.combats, until the table's fightsBack) still counts as running for the clock's tick, so with the Calendar off no real seconds come off a fighter's effects in the gap
    { const HW = mkT({ calendar: false, save: true }), nowH = Date.now(); HW.camp.chars.c_kael.values = fxv(30, nowH - 2000); HW.net.active = false;
      const hf = HW.net.fightSet(null, docks([row('t_kael', 'Kael')])), tB = J(HW.camp.chars.c_kael.values.f_fx[0].t); HW.api.hold(); const keptH = !!(HW.camp.fights && HW.camp.fights.list && HW.camp.fights.list[hf]);
      HW.net.combats = {}; HW.net.fightOn = null;   // leaveSession(true), as startHosting runs it
      HW.api.fxClockTick(); HW.api.fxClockTick(); const tGap = HW.camp.chars.c_kael.values.f_fx[0] ? J(HW.camp.chars.c_kael.values.f_fx[0].t) : 'gone', stopGap = HW.net._fxStop > 0;
      const nBack = HW.api.back(); HW.api.fxClockTick(); const tAfter = HW.camp.chars.c_kael.values.f_fx[0] ? J(HW.camp.chars.c_kael.values.f_fx[0].t) : 'gone';
      const NW = mkT({ calendar: false }); NW.camp.chars.c_kael.values = fxv(1, 0); NW.api.fxClockTick(); const tFree = NW.camp.chars.c_kael.values.f_fx[0] && NW.camp.chars.c_kael.values.f_fx[0].t.at > 0;
      check('1.6.2 a fight held through the GM\'s reload is still a running fight to the clock\'s tick (fxClockTick with fightsHold and fightsBack, run for real): with the Calendar off, between leaveSession emptying net.combats and the table\'s fightsBack, a fighter\'s timed effect stays banked with nothing taken off, real time stays stopped, and once the fight is back it is the same; with no fight held a banked timer runs again as before',
        keptH && JSON.parse(tB).at === 0 && JSON.parse(tB).left > 26 && JSON.parse(tB).left < 29 && tGap === tB && stopGap && nBack === 1 && tAfter === tB && tFree === true, J([keptH, tB, tGap, stopGap, nBack, tAfter, tFree])); }
    // timed effects with the Calendar off, while a fight runs: the clock's tick banks everyone, and the second moving runs the effects of everyone in no fight
    const X = mkT({ calendar: false }), now0 = Date.now(); X.camp.chars.c_rook.values.f_fx[0].t = { left: 30, at: now0 - 2000 };
    const x1 = X.net.fightSet(null, docks([row('t_kael', 'Kael')])); X.api.fxClockTick(); const xBank = J(Object.keys(X.camp.chars.c_rook.values.f_fx[0].t).sort()) + ':' + X.camp.chars.c_rook.values.f_fx[0].t.at;
    const rookL = X.camp.chars.c_rook.values.f_fx[0].t.left; X.net.fightStep(x1, 1); X.net.fightStep(x1, 1);
    const xx = [xBank, Math.round((rookL - X.camp.chars.c_rook.values.f_fx[0].t.left) * 1000) / 1000, X.camp.clock.t, J(X.net.second), X.out.runs.length, J(X.cal.memSt() && X.cal.memSt().t)];
    X.net.fightSet(x1, null); const xEnd = [X.camp.clock.t, X.net.second, X.cal.memSt(), X.camp.chars.c_rook.values.f_fx[0].t.at > 0];
    check('152 fold 4 the Calendar off: a fight keeps its own time in memory alone (the frame mem), the date where it was; In a fight still counts by the rounds; while it runs the clock\'s tick banks everyone, so no real time counts, and the second moving on runs the timed effects of everyone in no fight (Rook two seconds); when the last fight ends the memory goes and everyone\'s effects run in real time again',
        J(xx) === J(['["at","left"]:0', 2, 43200, J({ frame: 'mem', s: 43202 }), 2, '43202']) && J(xEnd) === J([43200, null, null, true]), J([xx, xEnd]));
    // Remove from the fight counts the round in play, as an end does: Unit 7 taken out lives it and leaves at its end
    const R = mkT(), r1f = R.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')])); R.net.fightStep(r1f, 1); R.net.fightStep(r1f, 1);
    R.net.fightSet(r1f, { mapId: 'mDocks', round: 2, turn: 0, rows: [row('t_kael', 'Kael')] }); const rr1 = [R.out.runs.slice(), J(R.camp.clock.lived), R.camp.clock.t];
    R.net.fightStep(r1f, 1); const rr2 = [R.out.runs.slice(2), R.camp.clock.t, J(R.camp.clock.lived || null)];
    check('152 fold 4 Remove from the fight counts the round in play, as an end does: Unit 7 taken out of the Docks\' fight in round 2 lives that round, its In a fight rule run, and leaves at its end, 12:00:02, ahead of the clock; the fight goes on without it, and when its round closes the clock reaches Unit 7',
        J(rr1) === J([[[['c_kael:r_tick:x:1', 'c_u7:r_tick:x:1'], 'Round 1 on Docks', { round: 1 }], [['c_u7:r_tick:x:1'], 'Round 2 on Docks', { round: 2 }]], J({ c_u7: [43202, 0] }), 43201])
        && J(rr2) === J([[[['c_kael:r_tick:x:1'], 'Round 2 on Docks', { round: 2 }]], 43202, 'null']), J([rr1, rr2]));
    // a player's End turn steps their fight without making it the one played; the GM's own step does
    const Y = mkT(), y1 = Y.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')])), y2 = Y.net.fightSet(null, bridge([row('t_sela', 'Sela')]));
    Y.net.fightPlay(y1); Y.api.turnEnd({ type: 'turn-end', mapId: 'mBridge', row: 'rt_sela' }, Y.conns[1]); const yP = [Y.net.fightOn === y1, Y.net.combats[y2].round];
    Y.net.fightStep(y2, 1); const yG = Y.net.fightOn === y2;
    check('152 fold 4 the fight played (net.fightOn): a player\'s End turn steps their own fight and leaves the GM\'s fight the one played; the GM\'s own step of a fight makes it the one played',
        J(yP) === J([true, 2]) && yG === true, J([yP, yG]));
    // the review of fold 4: those who walk into a fight that is ahead live the gap for their timed effects as for their time rules. Unit 9 (a 30 s effect)
    // follows the second while the Docks runs alone, then walks into a fight begun at the Docks' time, two seconds past the second
    const D2w = mkT(); D2w.camp.chars.c_u9.values = fxv(30); const dw1 = D2w.net.fightSet(null, docks([row('t_kael', 'Kael')])); [1, 2, 3].forEach(() => D2w.net.fightStep(dw1, 1));
    const u9a = D2w.camp.chars.c_u9.values.f_fx[0].t.left; D2w.net.fightSet(null, bridge([row('t_sela', 'Sela')])); D2w.net.fightStep(dw1, 1); D2w.net.fightStep(dw1, 1);
    D2w.net.fightSet(null, bridge([row('t_u9', 'Unit 9')])); const dw = [u9a, D2w.camp.chars.c_u9.values.f_fx[0].t.left, J(D2w.camp.clock.lived)];
    check('152 fold 4 (the review) those who walk into a fight that is ahead live the gap for their timed effects as for their time rules (net.fxSpans with walk): Unit 9, three seconds down while it follows the second, walks into a fight begun at the Docks\' time two seconds past the second and loses those two and its first turn\'s round, 27 to 24, where the fight that holds it by then passed the gap over (26)',
        J(dw) === J([27, 24, J({ c_kael: [43205, 0], c_u9: [43205, 0] })]), J(dw));
    // the Calendar switched off while a fight runs: from then the fight's time is kept in memory alone, so the date stays where it was and nobody is left
    // ahead of a clock that never followed; switched on again, a move of the clock counts for everyone
    const qo = {}, Qw = mkT(qo), q1 = Qw.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')])); Qw.net.fightStep(q1, 1); Qw.net.fightStep(q1, 1);
    qo.calendar = false; [1, 2, 3, 4, 5, 6, 7, 8].forEach(() => Qw.net.fightStep(q1, 1)); const rookOf = () => Math.round(Qw.camp.chars.c_rook.values.f_fx[0].t.left);
    const qMid = [J(Qw.net.second), Qw.camp.clock.t, Qw.net.combats[q1].round, rookOf()];
    Qw.net.fightSet(q1, null); const qEnd = [Qw.camp.clock.t, J(Qw.camp.clock.lived || null), Qw.net.second, Qw.cal.memSt(), rookOf(), Qw.out.runs.length];
    qo.calendar = true; Qw.cal.moveTo(43204, 'Moved on 3 seconds'); const qAft = [Qw.camp.clock.t, J(Qw.camp.clock.lived || null), rookOf()];
    check('152 fold 4 (the review) the Calendar switched off while a fight runs: the fight\'s time is kept in memory alone from then (the frame mem), the date staying at 12:00:01 while In a fight still counts by the rounds and Rook\'s effect follows the second; the fight ended in round 6 leaves nobody ahead of the clock, where everyone was left at 12:00:06; the Calendar on again, three seconds moved on count for everyone',
        J(qMid) === J([J({ frame: 'mem', s: 43205 }), 43201, 6, 25]) && J(qEnd) === J([43201, 'null', null, null, 24, 6]) && J(qAft) === J([43204, 'null', 21]), J([qMid, qEnd, qAft]));
    // with the Calendar off a fight's memory begins from the clock's own marks: Sela, left ahead of the clock by a fight that ran ahead, lives nothing twice
    const mo = {}, Mw = mkT(mo), mwa = Mw.net.fightSet(null, docks([row('t_kael', 'Kael')])), mwb = Mw.net.fightSet(null, bridge([row('t_sela', 'Sela')]));
    [1, 2, 3, 4].forEach(() => Mw.net.fightStep(mwb, 1)); Mw.net.fightSet(mwb, null); Mw.net.fightSet(mwa, null); const mw0 = [Mw.camp.clock.t, J(Mw.camp.clock.lived || null)];
    mo.calendar = false; const mwc = Mw.net.fightSet(null, bridge([row('t_sela', 'Sela')])), mwk = Mw.out.runs.length; [1, 2, 3, 4, 5].forEach(() => Mw.net.fightStep(mwc, 1));
    const mw1 = [Mw.out.runs.slice(mwk), J(Mw.net.second), Mw.camp.clock.t];
    check('152 fold 4 (the review) with the Calendar off a fight\'s memory begins from the clock\'s own marks: Sela, left at 12:00:05 by a fight that ran ahead while the clock stayed at 12:00:01, fights again with the Calendar off and lives none of her first four rounds twice, her In a fight rule run only for the fifth; the date stays where it was',
        J(mw0) === J([43201, J({ c_sela: [43205, 0] })]) && J(mw1) === J([[[['c_sela:r_tick:x:1'], 'Round 5 on Bridge', { round: 5 }]], J({ frame: 'mem', s: 43206 }), 43201]), J([mw0, mw1]));
    // a roster edit that sets another round moves the fight's time by the difference: up, its rounds lived; down, a correction
    const Vw = mkT(), v1 = Vw.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')]));
    Vw.net.fightSet(v1, { mapId: 'mDocks', round: 3, turn: 0, rows: [row('t_kael', 'Kael'), row('t_u7', 'Unit 7')] }); const vU = [Vw.camp.clock.t, J(Vw.net.combats[v1].at), Vw.out.runs.slice()];
    Vw.net.fightSet(v1, { mapId: 'mDocks', round: 2, turn: 0, rows: [row('t_kael', 'Kael'), row('t_u7', 'Unit 7')] }); const vD = [Vw.camp.clock.t, J(Vw.net.combats[v1].at), J(Vw.camp.clock.top)];
    Vw.net.fightStep(v1, 1); Vw.net.fightStep(v1, 1); const vA = [Vw.camp.clock.t, Vw.net.combats[v1].round, Vw.out.runs.length, 'top' in Vw.camp.clock];
    check('152 fold 4 (the review) a roster edit that sets another round moves the fight\'s time by the difference: round 1 to 3 moves it and the clock two seconds and its fighters live both rounds, the In a fight rule run twice for each and handed round 2; back to round 2 is a correction, the clock keeping the highest second reached as its top; on again to round 3 counts nothing twice and the top goes',
        J(vU) === J([43202, J({ s: 43202, ms: 0 }), [[['c_kael:r_tick:x:2', 'c_u7:r_tick:x:2'], 'Round 2 on Docks', { round: 2 }]]]) && J(vD) === J([43201, J({ s: 43201, ms: 0 }), J({ s: 43202, ms: 0 })]) && J(vA) === J([43202, 3, 1, false]), J([vU, vD, vA]));
    // Each fight starts again: a fight begun takes off its people's In a fight counts of the rules ticked so, and a join takes off the joiner's
    const Frw = mkT({ rolls: [{ id: 'r_f', label: 'Fresh', apply: [], inFight: { n: 2, u: 'round', fresh: true } }, { id: 'r_k', label: 'Keep', apply: [], inFight: { n: 2, u: 'round' } }] });
    const fr1 = Frw.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')])); Frw.net.fightSet(fr1, null); const frA = J(Frw.camp.clock.acc || null);
    const fr2 = Frw.net.fightSet(null, docks([row('t_kael', 'Kael')])); const frB = J(Frw.camp.clock.acc || null);
    Frw.net.fightSet(fr2, { mapId: 'mDocks', round: 1, turn: 0, rows: [row('t_kael', 'Kael'), row('t_u7', 'Unit 7')] }); const frC = J(Frw.camp.clock.acc || null);
    check('152 fold 4 (the review) Each fight starts again (calendar.js fightBegan, asked by the coordinator): a fight ended in its first round leaves Kael and Unit 7 a second counted on both rules; a new fight for Kael takes his count off the rule ticked so and keeps the other, Unit 7 untouched; Unit 7 added to it loses that count too',
        frA === J({ c_kael: { x_f: 1, x_k: 1 }, c_u7: { x_f: 1, x_k: 1 } }) && frB === J({ c_kael: { x_k: 1 }, c_u7: { x_f: 1, x_k: 1 } }) && frC === J({ c_kael: { x_k: 1 }, c_u7: { x_k: 1 } }), J([frA, frB, frC]));
    // the Calendar off: an NPC whose rules are switched off runs nothing and nothing is listed, since no window could answer it; a rule ticked Ask me first
    // is counted, and its runs wait in the bell for the GM's word (fold 4b, the owner's answer 4: "In the bell"; moved on purpose: they ran for nobody)
    const Lxw = mkT({ calendar: false }); Lxw.camp.clock.rulesOff = ['c_u7']; const lx1 = Lxw.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')])); Lxw.net.fightStep(lx1, 1); Lxw.net.fightStep(lx1, 1);
    const lxx = [Lxw.out.runs, Lxw.cal.st().pend, Lxw.out.toasts.filter(t => /^Time rules are due/.test(t)).length];
    const Axw = mkT({ calendar: false, rolls: [{ id: 'r_tick', label: 'Brace', apply: [], inFight: { n: 2, u: 'round' }, ask: true }] }), ax1 = Axw.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')]));
    Axw.net.fightStep(ax1, 1); Axw.net.fightStep(ax1, 1); const axA = J(Axw.camp.clock.acc || null); Axw.net.fightStep(ax1, 1); Axw.net.fightStep(ax1, 1);
    const axx = [axA, Axw.out.runs.length, Axw.cal.st().pend, J(Axw.camp.clock.acc || null), Axw.out.toasts.filter(t => /^Time rules are due/.test(t)).length, Axw.out.notes.filter(n => /^timeask:/.test(n[1])).map(n => n.slice(0, 3)), Axw.out.toasts.filter(t => /wait for your word/.test(t)).length];
    check('152 fold 4 (the review) the Calendar off in a fight: an NPC whose rules are switched off runs nothing and nothing waits, Kael\'s rule run alone, and nothing of it goes to the bell; a rule ticked Ask me first is counted, a round each for Kael and Unit 7, and when it comes due it runs for nobody and no list waits, since no window could give the GM\'s word: its runs wait in the bell, an item for Kael and one for Unit 7 with the round they came due, said in a notice once (fold 4b, moved on purpose: they ran for nobody and nothing waited)',
        J(lxx) === J([[[['c_kael:r_tick:x:1'], 'Round 1 on Docks', { round: 1 }]], null, 0]) && !Lxw.out.notes.some(n => /^timeask:/.test(n[1]))
        && J(axx) === J([J({ c_kael: { x_tick: 1 }, c_u7: { x_tick: 1 } }), 0, null, 'null', 0, [['wait', 'timeask:c_kael:r_tick', 'Kael: Brace waits for your word. 1 run, due in Round 2 on Docks.'], ['wait', 'timeask:c_u7:r_tick', 'Unit 7: Brace waits for your word. 1 run, due in Round 2 on Docks.']], 1]), J([lxx, axx]));
    const rd4 = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'), help4 = rd4('system/app/index.html'), notes4 = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(rd4);
    check('152 fold 4 (the review, source): Help\'s combat entry and both release notes say that a new fight starts at the time of the fight you play, the one you last started or stepped, and that the one furthest behind is played once that fight ends, where they said the fight you last stepped; the owner\'s example names its rounds as 1 second long, in Help and both notes',
        help4.includes('A new fight starts at the time of the fight you play, which is the one you last started or stepped. When that fight ends, the one furthest behind is the one you play.') && !help4.includes('the fight you last stepped')
        && help4.includes('With rounds of 1 second, a fight begun at 12:00:00 and ended in round 3 lets the clock go on from 12:00:03.') && !/Begun at 12:00:00/.test(help4)
        && notes4.every(t => t.includes('- A new fight starts at the time of the fight you play, which is the\n  one you last started or stepped, or at the clock when no fight is on.\n  When that fight ends, the one furthest behind is the one you play.\n')
            && t.includes('in counts: with rounds of 1 second, a fight begun at 12:00:00 and\n  ended in round 3 lets the clock go on from 12:00:03.') && !t.includes('fight you last stepped')));
    // 1.5.5 (the release trace, F3): a map deleted while a fight runs on it. dialogs.js's two deletes, sliced and run for real (the tree's menu, and the
    // toolbar's Delete on the item on screen), end every fight on the map first, while it stands, as End does; so a fighter whose turn came in the closing
    // round lives that round once, the same as End and then the delete: Kael 28 and Unit 7 29, the clock at 12:00:02. Before, the delete took the map out
    // first and net.itemGone found no fighter there, so the closing round went to everyone in no fight: Kael lost it a second time (27) and Unit 7 too
    const dlgF3 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'dialogs.js'), 'utf8').replace(/\r\n/g, '\n');
    const mfF3 = (() => { const a = dlgF3.indexOf('  // [netcheck:mapfights-start]'), b = dlgF3.indexOf('  // [netcheck:mapfights-end]'); return a < 0 || b < a ? '' : dlgF3.slice(a, b); })();
    const delF3 = k => { const a0 = dlgF3.indexOf("getElementById('" + ['ctxDeleteItem', 'delItemBtn'][k] + "')"), t = 'takeSafetyCopy().then(function() {', a = dlgF3.indexOf(t, a0), b = dlgF3.indexOf('\n          });', a); if (a0 < 0 || a < 0 || b < 0) throw new Error('netcheck: the delete ' + k + ' of dialogs.js'); return dlgF3.slice(a + t.length, b); };
    const sceneF3 = () => { const Wd = mkT(); Wd.camp.chars.c_kael.values = fxv(30); Wd.camp.chars.c_u7.values = fxv(30); Wd.win.wpNet = Wd.net; Wd.camp.activeItemId = 'mDocks';
        const fd = Wd.net.fightSet(null, docks([row('t_kael', 'Kael'), row('t_u7', 'Unit 7')])); Wd.net.fightStep(fd, 1); Wd.net.fightStep(fd, 1); return { Wd, fd }; };   // round 2: Kael's turn has come, Unit 7's not yet
    const runDelF3 = (Wd, k) => new Function('camp', 'id', 'window', 'state', 'updateSidebarNav', 'render', 'save', "'use strict';\n" + mfF3 + '\n' + delF3(k))(Wd.camp, 'mDocks', Wd.win, { viewMode: 'map' }, () => {}, () => {}, () => {});
    const leftF3 = Wd => ['c_kael', 'c_u7', 'c_rook'].map(id => Math.round(Wd.camp.chars[id].values.f_fx[0].t.left));
    const outF3 = Wd => ({ left: leftF3(Wd), clock: Wd.camp.clock.t, combats: J(Wd.net.combats), map: 'mDocks' in Wd.camp.items, ended: Wd.out.toasts.filter(t => /^Combat ended/.test(t)), sent: Wd.conns[0].sent.filter(m => m.type === 'combats' || m.type === 'itemGone').map(m => m.type).slice(-2), errs: Wd.out.errs });
    const endF3 = sceneF3(); endF3.Wd.net.fightSet(endF3.fd, null); runDelF3(endF3.Wd, 0);
    const menuF3 = sceneF3(); runDelF3(menuF3.Wd, 0); const barF3 = sceneF3(); runDelF3(barF3.Wd, 1);
    const playerF3 = sceneF3(); playerF3.Wd.net.role = 'client'; const pk = J(playerF3.Wd.net.combats); runDelF3(playerF3.Wd, 0); const pF3 = [J(playerF3.Wd.net.combats) === pk, 'mDocks' in playerF3.Wd.camp.items];
    const streamF3 = sceneF3(); streamF3.Wd.net.stream = true; const sk = J(streamF3.Wd.net.combats), sF3 = mfF3 ? new Function('window', "'use strict';\n" + mfF3 + '\nreturn endFightsOn;')(streamF3.Wd.win)('mDocks') === 0 && J(streamF3.Wd.net.combats) === sk : false;
    const goneF3 = { left: [28, 29, 28], clock: 43202, combats: '{}', map: false, ended: ['Combat ended on Docks.'], sent: ['combats', 'itemGone'], errs: [] };
    check('1.5.5 (the release trace, F3) a map deleted while a fight runs on it (dialogs.js\'s two deletes, sliced and run for real in the fold 4 world): every fight on the map ends first, while the map stands, as End combat ends it, so the round it ends in is lived once by its own fighters: Kael, whose turn came in that round, keeps 28 seconds of his effect and Unit 7, whose turn had not, 29, as End and then the delete leave them, and the clock goes on to 12:00:02; the players are sent the fights left and then told the map is gone; nothing on a player\'s app or in the stream window',
        J(outF3(endF3.Wd)) === J(goneF3) && J(outF3(menuF3.Wd)) === J(goneF3) && J(outF3(barF3.Wd)) === J(goneF3) && J(pF3) === J([true, false]) && sF3 === true,
        J([outF3(endF3.Wd), outF3(menuF3.Wd), outF3(barF3.Wd), pF3, sF3]));
    check('1.5.5 (the release trace, F3, source): dialogs.js ends the fights on a map in one place, endFightsOn, asked through typeof by both deletes before the item is taken out, through net.fightSet as End does',
        mfF3.length > 0 && /n\.fightsOn\(id\)/.test(mfF3) && /n\.fightSet\(fid, null\)/.test(mfF3) && (dlgF3.match(/if \(typeof endFightsOn === 'function'\) endFightsOn\(/g) || []).length === 2
        && delF3(0).indexOf('endFightsOn(id)') >= 0 && delF3(0).indexOf('endFightsOn(id)') < delF3(0).indexOf('delete camp.items[id]') && delF3(1).indexOf('endFightsOn(camp.activeItemId)') >= 0 && delF3(1).indexOf('endFightsOn(camp.activeItemId)') < delF3(1).indexOf('delete camp.items[goneId]'));
    { const dwA = dlgF3.indexOf('// [netcheck:deletewords-start]'), dwB = dlgF3.indexOf('// [netcheck:deletewords-end]');
        const dw = (n, title) => new Function('window', dlgF3.slice(dwA, dwB) + '\nreturn deleteWords;')({ wpNet: n })({ items: { m: { meta: { title } } } }, 'm');
        const tail = '? This cannot be undone (a safety copy is taken first).';
        check('1.6.0 a delete names what goes and what ends with it (dialogs.js deleteWords, run for real): the item by its name, this item with none, and the fights a table holds on it, which only a table that is on says; both deletes ask it',
            dw(null, 'Docks') === 'Are you sure you want to delete Docks' + tail && dw(null, ' ') === 'Are you sure you want to delete this item' + tail
            && dw({ active: true, fightsOn: () => ['a'] }, 'Docks').endsWith(tail + ' The fight on it ends.') && dw({ active: true, fightsOn: () => ['a', 'b'] }, 'Docks').endsWith(tail + ' The 2 fights on it end.') && dw({ active: false, fightsOn: () => ['a'] }, 'Docks').endsWith(tail)
            && (dlgF3.match(/showConfirm\(deleteWords\(camp, /g) || []).length === 2 && dlgF3.indexOf('delete this item?') < 0, dw(null, 'Docks'));
        check('1.6.0 a map deleted on the play map leaves you on the next map, on its play map (found by hand: it dropped to a data map), and only a map hands on to a map; a player whose map went is told',
            /var nextM = removed && removed\.type === 'map' \?/.test(delF3(0)) && /if \(!\(nextM && state\.viewMode === 'visual'\)\) state\.viewMode = 'data';/.test(delF3(0)) && /goneIt\.type === 'map' && Object\.keys\(camp\.items\)\.find/.test(delF3(1))
            && /if \(wasMapG\) toast\('The GM deleted the map you were on\. They can bring you to another\.'\);/.test(src)); }
    // the review of that fold: a fight on another map goes on with its round as it was, and two fights on the deleted map both end, each said once; every
    // delete leaves all of it as End and then the delete leave it (a delete that ended every fight at the table, or one of the map's two, fails here)
    const sceneF3o = () => { const s = sceneF3(); s.fb = s.Wd.net.fightSet(null, bridge([row('t_sela', 'Sela'), row('t_u9', 'Unit 9')])); s.Wd.net.fightStep(s.fb, 1); s.Wd.net.fightStep(s.fb, 1); return s; };
    const normF3 = s => J(outF3(s.Wd)).split(s.fb).join('FB'), keptF3 = s => [Object.keys(s.Wd.net.combats), s.Wd.net.combats[s.fb] ? s.Wd.net.combats[s.fb].round : null, s.Wd.out.toasts.filter(t => /^Combat ended/.test(t))];
    const oEnd = sceneF3o(); oEnd.Wd.net.fightSet(oEnd.fd, null); runDelF3(oEnd.Wd, 0); const oMenu = sceneF3o(); runDelF3(oMenu.Wd, 0); const oBar = sceneF3o(); runDelF3(oBar.Wd, 1);
    const sceneF3two = () => { const Wd = mkT(); Wd.camp.chars.c_kael.values = fxv(30); Wd.camp.chars.c_u7.values = fxv(30); Wd.win.wpNet = Wd.net; Wd.camp.activeItemId = 'mDocks';
        const f1 = Wd.net.fightSet(null, docks([row('t_kael', 'Kael')])), f2 = Wd.net.fightSet(null, docks([row('t_u7', 'Unit 7')])); Wd.net.fightStep(f1, 1); Wd.net.fightStep(f2, 1); return { Wd, f1, f2 }; };
    const tEnd = sceneF3two(); tEnd.Wd.net.fightSet(tEnd.f1, null); tEnd.Wd.net.fightSet(tEnd.f2, null); runDelF3(tEnd.Wd, 0); const tMenu = sceneF3two(); runDelF3(tMenu.Wd, 0); const tBar = sceneF3two(); runDelF3(tBar.Wd, 1);
    check('1.5.5 (the release trace, F3, its review) a map deleted while fights run (dialogs.js\'s two deletes, run for real in the fold 4 world): a fight on another map goes on, its round as it was, and only the deleted map\'s fight is said to end; two fights on the deleted map both end, each said once; each delete leaves the effects, the clock, the fights and what is sent as End and then the delete leave them',
        normF3(oMenu) === normF3(oEnd) && normF3(oBar) === normF3(oEnd) && [oEnd, oMenu, oBar].every(s => J(keptF3(s)) === J([[s.fb], 2, ['Combat ended on Docks.']]))
        && J(outF3(tMenu.Wd)) === J(outF3(tEnd.Wd)) && J(outF3(tBar.Wd)) === J(outF3(tEnd.Wd)) && outF3(tEnd.Wd).combats === '{}' && J(outF3(tEnd.Wd).ended) === J(['Combat ended on Docks.', 'Combat ended on Docks.']) && outF3(tEnd.Wd).errs.length === 0 && outF3(oEnd.Wd).errs.length === 0,
        J([normF3(oEnd), normF3(oMenu), normF3(oBar), keptF3(oMenu), outF3(tEnd.Wd), outF3(tMenu.Wd), outF3(tBar.Wd)]));
    // the release trace's words and their review: the lines the owner reads in both release notes and in Help, each where it stands
    const flat5 = t => t.replace(/\s+/g, ' '), help5 = flat5(help4), notes5 = notes4.map(flat5);
    check('1.5.5 (the release trace and its review, words): both release notes say that the steps, Move and Set no longer wait for a list of time rules and no longer that they always work; that a campaign set to Ask me before 1.5.5 now runs at once; that after a step back nothing counts for its fighters until that fight passes the furthest it reached, and after the clock is moved back until it passes the latest time it reached; and what going back to 1.5.4 drops, that Time rules may read Ask me again there, and that launch copies keep it only for ten launches while a snapshot taken by hand stays; Help says the same in the Calendar\'s entry, its Time rules setting and the Restore entry',
        notes5.every(t => t.includes('- The steps, Move and Set no longer wait for a list of time rules. Time you move on while a list waits is counted once you apply or skip it.') && !/always work/.test(t)
            && t.includes('wants to say which run. A campaign set to Ask me before 1.5.5 now runs at once. Pick Ask me again in Settings to keep it.')
            && t.includes('A step back is a correction, and nothing counts twice. After a step back, nothing counts again for its fighters until that fight passes the furthest it reached. After you move the clock back, nothing counts again until the clock passes the latest time it reached. Until then no timed effect runs out and no time rule counts.')
            && t.includes("Going back to 1.5.4 - Restore the previous version back to 1.5.4 keeps your campaign, but its next save drops what 1.5.5 added: a row's own Description and By level text, the choice Players ask, the GM approves, Waits in a fight, In a fight and Ask me first, Before its fields, a list placed in more than one place by category, the clock's own marks and each NPC's Rules run switch. Updating again does not bring them back. In 1.5.4 a campaign's Time rules may read Ask me again, so check them in Settings. - Launch copies made before that save keep what 1.5.5 added, in saves/backups, until ten newer launches replace them. To keep a copy until you delete it, press Snapshot the Save Now in Settings > Advanced before you restore.")
            && !t.includes('The launch copies in saves/backups keep them') && !t.includes('After a step back, or after you move the clock back'))
        && help5.includes('Moving the clock back and on again counts nothing twice. After you move the clock back, nothing counts again until it passes the latest time it reached. Until then no timed effect runs out and no time rule counts.')
        && help5.includes('While the table is paused none run. A campaign set to Ask me before 1.5.5 now runs at once. Pick Ask me again to keep it.')
        && help5.includes('Leave or end a multiplayer session first. Going back from 1.5.5 to 1.5.4 keeps your campaigns, but their next save drops what 1.5.5 added. Updating again does not bring it back. Launch copies made before then hold it in the saves folder&rsquo;s <b>backups</b>, until ten newer launches replace them. To keep a copy until you delete it, press <b>Snapshot the save now</b> in Settings &#9656; Saves and backups before you go back.')
        && !help5.includes('still hold it'));
    // initiative O5 (backlog 34; the owner, by prompt, 2026-10-29: "A Turn order choice"; the standing order repeats, "but there should be the option to
    // choose otherwise"): Next is chosen, run for real in this world. Kael ends his turn and picks the bandit; the host judges every pick
    const chRows = () => [row('t_kael', 'Kael'), row('t_u7', 'Unit 7'), { id: 'c_bandit', name: 'Bandit', tokId: null, init: 0, src: null }];
    const P5 = mkT(); P5.camp.system.combat.initiative = { chosen: true };
    const hk5 = []; Object.assign(P5.win.wpSheets, { turnHook: (m, c) => hk5.push('start ' + c.rows[c.turn].name + ' r' + c.round), turnEndHook: (m, c) => hk5.push('end ' + c.rows[0].name + ' r' + c.round), roundHook: (m, c) => hk5.push('round ' + c.round) });
    const f5 = P5.net.fightSet(null, docks(chRows())), c5 = () => P5.net.combats[f5], who5 = () => c5().rows[c5().turn].name, dn5 = () => c5().rows.filter(r => r.dn === 1).map(r => r.name), pA5 = P5.conns[0];
    const copy5 = () => { const m = pA5.sent.filter(x => x.type === 'combats').pop(); return m && m.combats[f5] ? m.combats[f5].rows.filter(r => r.dn === 1).map(r => r.name) : null; };
    const te5 = pick => P5.api.turnEnd({ type: 'turn-end', mapId: 'mDocks', row: 'rt_kael', pick }, pA5);
    te5('c_bandit'); const p51 = [who5(), J(dn5()), J(copy5()), c5().round, P5.camp.clock.t];
    const was5 = J(c5()); P5.net.fightStep(f5, 1, undefined, 'rt_kael'); P5.net.fightStep(f5, 1, undefined, 'c_bandit'); P5.net.fightStep(f5, 1, undefined, 'nobody'); te5('rt_u7');
    const p52 = [J(c5()) === was5, P5.net.fightStep(f5, 1, undefined, 'rt_kael')];
    P5.net.fightStep(f5, 1); const p53 = [who5(), J(dn5())];
    P5.net.fightStep(f5, 1); const p54 = [who5(), J(dn5()), c5().round, P5.camp.clock.t];
    P5.net.fightStep(f5, 1, undefined, 'c_bandit'); const p55 = [who5(), J(dn5())];
    P5.net.fightStep(f5, -1); const p56 = [who5(), J(dn5()), c5().round];
    P5.net.fightStep(f5, -1); const p57 = [who5(), J(dn5()), c5().round, P5.camp.clock.t];
    const runs5 = P5.out.runs.length, hooks5 = hk5.length;
    P5.net.fightStep(f5, 1); const p58 = [who5(), c5().round, P5.camp.clock.t, P5.out.runs.length === runs5, hk5.length === hooks5];
    P5.net.fightStep(f5, 1); P5.net.fightStep(f5, 1); const p59a = who5(); P5.net.fightStep(f5, 1, undefined, 'c_bandit');
    const p59 = [p59a, who5(), c5().round, J(dn5()), P5.out.logs.filter(t => / picked /.test(t))];
    const p510 = [P5.net.fightHold(f5), P5.net.fightAct(f5, 'rt_kael'), who5()];
    const R5 = mkT(); R5.camp.system.combat.initiative = { chosen: true }; R5.camp.items.mDocks.whiteboard.find(w => w.id === 't_u7').hidden = true;
    const fR5 = R5.net.fightSet(null, docks(chRows())), whoR5 = () => R5.net.combats[fR5].rows[R5.net.combats[fR5].turn].name, teR5 = pick => R5.api.turnEnd({ type: 'turn-end', mapId: 'mDocks', row: 'rt_kael', pick }, R5.conns[0]);
    const seenR5 = J(R5.conns[0].sent.filter(x => x.type === 'combats').pop().combats[fR5].rows.map(r => r.id));
    teR5('rt_u7'); const p511b = whoR5(); teR5('h1'); const p511 = [seenR5, p511b, whoR5(), J(R5.net.combats[fR5].rows.filter(r => r.dn === 1).map(r => r.name)), R5.out.errs.length];
    P5.net.fightStep(f5, 1); P5.net.fightStep(f5, 1, undefined, 'rt_u7');
    const ed5 = c5().rows.map(r => ({ id: r.id, name: r.name, tokId: r.tokId, init: r.init, src: r.src })).reverse(); P5.net.fightSet(f5, { mapId: 'mDocks', round: c5().round, turn: ed5.findIndex(r => r.id === 'rt_u7'), rows: ed5 });
    const p512 = [who5(), J(dn5()), J(c5().rows.map(r => r.name))];
    check('initiative O5 Next is chosen (net.js and calendar.js, run for real): Kael\'s player ends his turn and picks the bandit, who goes at once, Kael marked as gone on the host and in the copy his player is sent; a pick of one who has gone, the one on turn or a row not there moves nothing and answers false, and a player\'s pick when it is not their turn is no word; with no pick the next in the order who has not gone goes, and once everyone has gone round 2 starts from the order\'s first with nobody gone, the clock a second on',
        J(p51) === J(['Bandit', J(['Kael']), J(['Kael']), 1, 43200]) && J(p52) === J([true, false]) && J(p53) === J(['Unit 7', J(['Kael', 'Bandit'])]) && J(p54) === J(['Kael', J([]), 2, 43201]), J([p51, p52, p53, p54]));
    check('initiative O5 a step back is a correction: back from the bandit picked in round 2 to Kael, nobody gone, then into round 1\'s last turn (Unit 7) with Kael and the bandit gone and the clock back a second; on again, round 2 from Kael, the clock where it was, nothing counted twice and no round, turn start or turn end hook run again',
        J(p55) === J(['Bandit', J(['Kael'])]) && J(p56) === J(['Kael', J([]), 2]) && J(p57) === J(['Unit 7', J(['Kael', 'Bandit']), 1, 43200]) && J(p58) === J(['Kael', 2, 43201, true, true]), J([p55, p56, p57, p58, hk5]));
    check('initiative O5 the last to act may pick who opens the next round, themselves too: the bandit, last in round 2, opens round 3; each pick is in the Game Record, the player\'s by their character\'s name; there is no Hold and no Act from a hold while the next is chosen',
        J(p59) === J(['Bandit', 'Bandit', 3, J([]), ['Kael picked Bandit to go next on Docks', 'The GM picked Bandit to go next on Docks', 'The GM picked Bandit to go first in round 3 on Docks']]) && J(p510) === J([false, false, 'Bandit']), J([p59, p510]));
    check('initiative O5 a player picks by the copy they are sent: a row they read as Hidden by its place (h1, Unit 7), never by its real id, which their copy does not hold; a roster edit that turns the order round keeps who has gone by each row\'s id, the row on turn kept',
        J(p511) === J([J(['rt_kael', 'h1', 'c_bandit']), 'Kael', 'Unit 7', J(['Kael']), 0]) && J(p512) === J(['Unit 7', J(['Bandit', 'Kael']), J(['Bandit', 'Unit 7', 'Kael'])]) && P5.out.errs.length === 0, J([p511, p512, P5.out.errs.slice(0, 2)]));
    const Q5 = mkT(), fQ5 = Q5.net.fightSet(null, docks(chRows())); Q5.api.turnEnd({ type: 'turn-end', mapId: 'mDocks', row: 'rt_kael', pick: 'c_bandit' }, Q5.conns[0]);
    const cQ5 = Q5.net.combats[fQ5], q5 = [cQ5.rows[cQ5.turn].name, cQ5.rows.some(r => 'dn' in r), 'ps' in cQ5, 'pp' in cQ5, Q5.conns[0].sent.filter(x => x.type === 'combats').some(m => /"dn"/.test(J(m))), Q5.net.fightHold(fQ5)];
    check('initiative O5 a system without Next is chosen works as before: a pick a player names is no word and their End turn goes to the next in the order; no row is marked, nothing of it is kept or sent, and Hold works',
        J(q5) === J(['Unit 7', false, false, false, false, true]), J(q5));
    const errs = [A, B, C2, D, E, W, G, L, H4, X, Y, R, D2w, Qw, Mw, Vw, Frw, Lxw, Axw].reduce((acc, w) => acc.concat(w.out.errs), []);
    check('152 fold 4 (source): the clock\'s old hooks are gone; ordersMoved is the one coordinator, asked by a fight\'s start or roster edit, a step that changes its round and an end, each once; a player\'s End turn and hold step their fight as a player; the session takes its second away; calendar.js counts a character\'s span only through livedSpans, in spansOf (which ownTime and moveTo ask), and has no rounds or fightEnded; no world above logged an error',
        !/clockRounds|clockFightEnd/.test(src) && (src.match(/ordersMoved\(/g) || []).length === 4 && /if \(tg\) ordersMoved\(had \? 'edit' : 'start', tg\);/.test(require('./checkkit').part('netfight.js')) && /if \(tg\) ordersMoved\('step', tg\);/.test(require('./checkkit').part('netfight.js')) && /ordersMoved\('end', endO\);/.test(src)
        && src.includes("fightStep(fidT, 1, 'player', pkT);") && src.includes("fightHold(fidH, 'player', { text: msg.text, roll: msg.roll });") /* 1.6.0, a deliberate change of this pin: a named hold's words go with it */ && src.includes('net.fightOn = null; net.second = null;')
        && (calJs.match(/livedSpans\(/g) || []).length === 2 && !/function rounds\(|fightEnded|roundPend/.test(calJs) && errs.length === 0, J(errs.slice(0, 3)));
})());

    /* ---- 1.5.6, backlog 173: a player's time rule notes, as they chose (the timenote slice, run for real) ---- */
    {
        const ntN = require('./checkkit').part('nettime.js'), tnS = ntN.slice(ntN.indexOf('// [netcheck:timenote-start]'), ntN.indexOf('// [netcheck:timenote-end]'));   // nettime.js, read by its own name
        const world = (mode, role) => { const st = { pushed: [], timers: [], store: { wp_timeNotes: mode } };
            const ls = { getItem: k => (k in st.store ? st.store[k] : null) };
            const net = { active: true, role: role === undefined ? 'client' : role };
            const api = new Function('net', 'pushChat', 'localStorage', 'setTimeout', 'clearTimeout', "'use strict';\n" + tnS + '\nreturn { timeNote, timeFlush, timeNotesMode };')(net, m => st.pushed.push(m), ls, (fn, ms) => { st.timers.push({ fn, ms }); return st.timers.length; }, () => {});
            st.net = net; st.api = api; return st; };
        const note = s => ({ type: 'chat', scope: 'whisper', from: { id: 'gm', name: 'GM', gm: true }, text: s, ts: 1 });
        const A = world(null); A.api.timeNote(note('Battery +1')); A.api.timeNote(note('Battery +1'));
        const B = world('off'); B.api.timeNote(note('x'));
        const C = world('10m'); C.api.timeNote(note('one')); C.api.timeNote(note('two')); const cBefore = C.pushed.length, cTimers = C.timers.map(x => x.ms); C.timers[0].fn();
        const D = world('1h'); D.api.timeNote(note('solo')); const dMs = D.timers[0].ms; D.timers[0].fn();
        const E = world('10m'); E.api.timeNote(note('lost')); E.net.active = false; E.timers[0].fn();
        const F = world('junk');
        const G = world('10m', null); G.net.active = false; G.api.timeNote(note('gm alone')); G.timers[0].fn();   // the GM's own note with no table: kept
        const ok = A.pushed.length === 2 && B.pushed.length === 0 && cBefore === 0 && JSON.stringify(cTimers) === '[600000]' && C.pushed.length === 1 && C.pushed[0].text === 'Time rules, 2 notes:\none\ntwo' && C.pushed[0].scope === 'whisper'
            && dMs === 3600000 && D.pushed.length === 1 && D.pushed[0].text === 'solo' && E.pushed.length === 0 && F.api.timeNotesMode() === 'all' && G.pushed.length === 1 && G.pushed[0].text === 'gm alone';
        const flat = src.split('\r\n').join('\n');
        {   // 1.6.0, backlog 173: the GM's one chat line a run (net.timeRunLine, in the same slice): a whisper of the GM's own with its run's id and words, none under Off, none on a player's app; and net.timeCard telling a player what opts.player says
            const H = world(null, 'host'), Hoff = world('off', 'host'), Cl = world(null, 'client');
            const okH = H.net.timeRunLine({ id: 'tr1', text: 'Time rules: 1 hour', sub: '2 characters, 3 changes.' }) === true && H.pushed.length === 1 && H.pushed[0].scope === 'whisper' && H.pushed[0].from.gm === true && JSON.stringify(H.pushed[0].trun) === JSON.stringify({ id: 'tr1', sub: '2 characters, 3 changes.' }) && H.pushed[0].text === 'Time rules: 1 hour';
            const okOff = Hoff.net.timeRunLine({ id: 'tr2', text: 'x' }) === false && Hoff.pushed.length === 0 && Cl.net.timeRunLine({ id: 'tr3', text: 'x' }) === false && Cl.pushed.length === 0 && H.net.timeRunLine(null) === false;
            const ntC = require('./checkkit').part('nettime.js'), tcA = ntC.indexOf('// [netcheck:timecard-start]'), tcZ = ntC.indexOf('// [netcheck:timecard-end]'), sent = [], gmChat = [], logs = [];   // nettime.js, read by its own name
            const netT = { active: true, role: 'host', myId: 'gm', roster: { p1: {} }, conns: [{ open: true, peer: 'p1', send: m => sent.push(m.text) }] };
            new Function('net', 'timeNote', 'pushChat', 'logEvent', 'peerProfileId', 'sendFailed', ntC.slice(tcA, tcZ))(netT, m => gmChat.push(m.text), m => gmChat.push(m.text), (k, t) => logs.push(t), () => 'u_a', () => {});
            const pc = { id: 'c_a', ownerId: 'u_a' };
            netT.timeCard(pc, 'all of it', false); netT.timeCard(pc, 'all of it 2', false, { player: 'part', gmChat: false }); netT.timeCard(pc, 'all of it 3', false, { player: '', gmChat: false }); netT.timeCard(pc, 'gm only', true, { player: 'never', gmChat: true });
            check('1.6.0, backlog 173: net.timeRunLine posts the GM\'s one line a run as a whisper of the GM\'s own that no player and no join\'s history ever holds, with the run\'s id and its words, none under the GM\'s Off and none on a player\'s app; net.timeCard tells a player only what opts.player says (none where it is empty), keeps the GM\'s chat out where opts.gmChat is false, and the Game Record keeps every whole line',
                okH && okOff && JSON.stringify(sent) === JSON.stringify(['all of it', 'part']) && JSON.stringify(gmChat) === JSON.stringify(['all of it', 'gm only']) && JSON.stringify(logs) === JSON.stringify(['all of it', 'all of it 2', 'all of it 3', 'gm only']), JSON.stringify([okH, okOff, sent, gmChat, logs]));
        }
        check('1.5.6 a time rule\'s notes reach a player as they chose (backlog 173, the owner: "notify the player privately, with the option of them turning off these notifications, or change how often they come in"; timeNote run for real): every time as ever, and with no choice or one that is no choice; Off none; gathered into one note every 10 minutes or every hour; what waits let go when the table ends; the host marks its notes kind time, and a player\'s app routes only a whisper from the GM so marked; Settings\' row',
            ok && kit.part('nettime.js').includes("ts: Date.now(), kind: 'time' };") && kit.part('nettime.js').includes("if (typeof timeNote === 'function') timeNote(m); else pushChat(m);   // 1.5.6: the GM's own chat") && kit.part('nettime.js').includes("logEvent('time', t);   // the Game Record keeps every line") && flat.includes("if (msg.kind === 'time' && lineH.scope === 'whisper' && fromH.gm && typeof timeNote === 'function') timeNote(lineH); else pushChat(lineH);")
            && fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').includes('<select id="setTimeNotes" class="field"'), JSON.stringify([A.pushed.length, B.pushed.length, cBefore, cTimers, C.pushed.map(m => m.text), dMs, D.pushed.length, E.pushed.length]));
    }

T.finish();
