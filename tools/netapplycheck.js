/* netapplycheck.js: what a roll's card carries and applies, the tests that came out of netcheck.js with their area
   (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split", step 5, 2026-11-19), each block word for word with the comment that heads it.
   What it covers, each block as it stood in netcheck.js: the bell (an apply card's feeds), the review of m410 (a roll's needs read on
   the host), a roll's Malf (R3), a Then on a critical success or failure (1.5.8), a player's press of a blast card (the core's gap 8),
   a hidden figure (1.6.2), a damage roll's mark (chat cards), a GM-only value read through a choice's option (owed review F5a2 #1), a
   blast's fragmentation applied as it is rolled, and the GM's own roll on a row while hosting (owed review F5b).
   It reads the joined net.js through srcjoin, as netcheck did.
   Run: node tools/netapplycheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, fnSrc, ordersSrc } = kit.netSlices('netapplycheck');
const j = JSON.stringify;

// The bell (the HUD's notes, 2026-09-26): the feeds on this machine, no wire change — an apply card (the host's postApply for the character it
// moved; a player's applyin by the name it carries) and a reminder (the host's postDue; a player's duein) each hand the character's bell a note
// through bellOut (sliced as they are, run with a recording bellOut)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Dx = await import(url('dicecore.js'));
    const paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply'), aiSrc = between('// [netcheck:applyin-start]', '// [netcheck:applyin-end]', 'applyin');
    const pdSrc = between('// [netcheck:postdue-start]', '// [netcheck:postdue-end]', 'postdue'), diSrc = between('// [netcheck:duein-start]', '// [netcheck:duein-end]', 'duein');
    const bells = [], bellOut = (cid, note, as) => bells.push([cid, note, as === undefined ? null : as]);
    const netH = { active: true, role: 'host', conns: [], roster: {} };
    const rec = { type: 'apply', id: 'r_a1', from: { id: 'u_gm', name: 'GM', gm: true }, lines: [{ n: 'HP', d: -3, v: 7 }], ts: 1, label: 'Hit', as: 'Pat' };
    const postApply = new Function('net', 'sendTable', 'sendFailed', 'peerProfileId', 'pushChat', 'logEvent', 'applyLine', 'bellOut', paSrc + '\nreturn postApply;')(netH, () => {}, e => { throw e; }, () => null, () => {}, () => {}, () => '', bellOut);
    postApply(Object.assign({}, rec), 'owner', { id: 'c_p', name: 'Pat', ownerId: 'u_a' }, null); postApply(Object.assign({}, rec), 'table', null, null);
    const hostApply = bells.splice(0);
    new Function('msg', 'conn', 'net', 'DC', 'pushChat', 'bellOut', aiSrc)(rec, { peer: 'H' }, { foreign: true, syncedPeer: 'H', stream: false }, () => Dx, () => {}, bellOut);
    new Function('msg', 'conn', 'net', 'DC', 'pushChat', 'bellOut', aiSrc)(Object.assign({}, rec, { as: undefined }), { peer: 'H' }, { foreign: true, syncedPeer: 'H', stream: false }, () => Dx, () => {}, bellOut);
    new Function('msg', 'conn', 'net', 'DC', 'pushChat', 'bellOut', aiSrc)(rec, { peer: 'X' }, { foreign: true, syncedPeer: 'H', stream: false }, () => Dx, () => {}, bellOut);
    const cliApply = bells.splice(0);
    check('The bell (wire feeds): the host\'s apply card hands the bell of the character it moved a note carrying the card (a card with no character: none); a player\'s machine hands its bell the cleaned card and the name it carries (none without a name, or from a peer that is not its host)',
        hostApply.length === 1 && hostApply[0][0] === 'c_p' && hostApply[0][1].apply.label === 'Hit' && cliApply.length === 1 && cliApply[0][0] === '' && cliApply[0][2] === 'Pat' && j(cliApply[0][1].apply.lines) === j(rec.lines) && cliApply[0][1].apply.from.gm === true, j([hostApply, cliApply]));
    const due = { type: 'due', id: 'r_d1', charId: 'c_p', act: 'r_re', why: 'turn', round: 2, ts: 1, from: { id: 'u_gm', name: 'GM', gm: true }, label: 'Regenerate' };
    new Function('rec', 'ch', 'toOwner', 'net', 'peerProfileId', 'sendFailed', 'pushChat', 'bellOut', pdSrc + '\npostDue(rec, ch, toOwner);')(Object.assign({}, due), { id: 'c_p', ownerId: 'u_a' }, false, netH, () => null, e => { throw e; }, () => {}, bellOut);
    const hostDue = bells.splice(0);
    const din = (m, peer) => new Function('msg', 'conn', 'net', 'DC', 'pushChat', 'bellOut', diSrc)(m, { peer: peer || 'host1' }, { foreign: true, syncedPeer: 'host1', stream: false }, () => Dx, () => {}, bellOut);
    din(due); din(Object.assign({}, due, { theirs: 1 })); din(due, 'other'); din(Object.assign({}, due, { charId: '../x' }));
    const cliDue = bells.splice(0);
    {   // 1.6.0 after Apply now: net.dueOver and the player's branch, run for real
        const A1 = 'a_abcd1234', chatO = [{ due: { att: A1, charId: 'c_p', theirs: 1 } }, { due: { att: 'a_zzzz9999', charId: 'c_p' } }, { text: 'hi' }], sentO = [], rendersO = [];
        const netO = { active: true, role: 'host', roster: { p1: { id: 'u_a' }, p2: { id: 'u_b' } }, conns: [{ open: true, peer: 'p1', send: m => sentO.push(['p1', m]) }, { open: true, peer: 'p2', send: m => sentO.push(['p2', m]) }] };
        new Function('net', 'peerProfileId', 'sendFailed', 'pushChat', 'bellOut', 'chatLog', 'getActiveCampaign', 'own', 'renderChatSoon', pdSrc)(netO, c => netO.roster[c.peer].id, e => { throw e; }, () => {}, bellOut, chatO, () => ({ chars: { c_p: { id: 'c_p', ownerId: 'u_a' } } }), (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k), () => rendersO.push(1));
        const firstO = netO.dueOver(A1), sentN = sentO.length, againO = netO.dueOver(A1);
        const doSrc = between('// [netcheck:dueover-start]', '// [netcheck:dueover-end]', 'dueover'), chatC = [{ due: { att: A1 } }, { due: { att: 'a_zzzz9999' } }], rendC = [];
        const inO = (m, peer) => new Function('msg', 'conn', 'net', 'DC', 'chatLog', 'renderChatSoon', doSrc)(m, { peer: peer || 'host1' }, { foreign: true, syncedPeer: 'host1', stream: false }, () => Dx, chatC, () => rendC.push(1));
        inO({ type: 'due-over', att: A1 }, 'other'); inO({ type: 'due-over', att: '<b>' }); const coldO = chatC.every(m => !m.over); inO({ type: 'due-over', att: A1 });
        check('1.6.0 ... after Apply now a Defense card says it is over (found by hand on a table: pressing its live Roll refused): the card of that very attempt is marked here and on its player\'s app alone, once, and a player\'s app takes the word from its host alone, for an attempt id alone',
            firstO === true && againO === false && chatO[0].over === 1 && !chatO[1].over && sentN === 1 && j(sentO[0]) === j(['p1', { type: 'due-over', att: A1 }]) && sentO.length === 1 && coldO && chatC[0].over === 1 && !chatC[1].over && rendC.length === 1, j([chatO, sentO, chatC]));
    }
    {   // 1.6.3 (the release click test): a card answered by its roll is over, said as made, on the GM's copy and on its player's app, and a reload no longer calls
        // it cut short (the card is over, so chatKeptSettle passes it by); the word comes last, so a landing's or a blast's own word stands (net.dueOver, run for real)
        const A2 = 'a_dfnd0001', chatA = [{ due: { att: A2, charId: 'c_p', theirs: 1 } }, { due: { att: 'a_land0001', charId: 'c_p', theirs: 1 } }], sentA = [];
        const netA = { active: true, role: 'host', roster: { p1: { id: 'u_a' } }, conns: [{ open: true, peer: 'p1', send: m => sentA.push(m) }] };
        new Function('net', 'peerProfileId', 'sendFailed', 'pushChat', 'bellOut', 'chatLog', 'getActiveCampaign', 'own', 'renderChatSoon', pdSrc)(netA, c => netA.roster[c.peer].id, e => { throw e; }, () => {}, bellOut, chatA, () => ({ chars: { c_p: { id: 'c_p', ownerId: 'u_a' } } }), (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k), () => {});
        netA.dueOver('a_land0001', 'land'); const ansA = netA.dueOver(A2, 'answered'), ansL = netA.dueOver('a_land0001', 'answered');
        const doSrcA = between('// [netcheck:dueover-start]', '// [netcheck:dueover-end]', 'dueover'), chatP = [{ due: { att: A2 } }];
        new Function('msg', 'conn', 'net', 'DC', 'chatLog', 'renderChatSoon', doSrcA)({ type: 'due-over', att: A2, say: 'answered' }, { peer: 'host1' }, { foreign: true, syncedPeer: 'host1', stream: false }, () => Dx, chatP, () => {});
        const djA = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'dice.js'), 'utf8'), rq = src.indexOf('        var restQ = function(resQ, heldQ) {'), rqEnd = src.indexOf('        var figCQ = ', rq), rr = src.indexOf('    var restR = function(res, heldR) {'), rrEnd = src.indexOf('    net.rollMade = typeof atR', rr);
        check('1.6.3 (the release click test): the card a roll answered is over once its roll is made, said as made ("Its roll is made.") on the GM\'s copy and its player\'s app, after every other word, which stands where it came first; both roll paths say it last of all',
            ansA === true && chatA[0].overSay === 'answered' && ansL === false && chatA[1].overSay === 'land' && j(sentA.filter(m => m.att === A2)) === j([{ type: 'due-over', att: A2, say: 'answered' }]) && chatP[0].over === 1 && chatP[0].overSay === 'answered'
            && djA.includes("m.overSay === 'answered' ? 'Its roll is made.'") && rq > 0 && src.slice(rq, rqEnd).replace(/\r\n/g, '\n').includes("        if (q.att && typeof net.dueOver === 'function') net.dueOver(q.att, 'answered');\n        };\n")
            && rr > 0 && src.slice(rr, rrEnd).includes("if (chR && typeof holdsRolled === 'function'") && src.slice(rrEnd - 300, rrEnd).includes("if (typeof o.att === 'string' && typeof net.dueOver === 'function') net.dueOver(o.att, 'answered');"), j([chatA, sentA, chatP]));
    }
    check('The bell (wire feeds): a reminder hands its character\'s bell a note on the host (the one it posted) and on a player\'s machine (the cleaned one; not the GM\'s copy marked theirs, not from another peer, not a malformed one)',
        hostDue.length === 1 && hostDue[0][0] === 'c_p' && hostDue[0][1].due.label === 'Regenerate' && cliDue.length === 1 && cliDue[0][0] === 'c_p' && cliDue[0][1].due.why === 'turn', j([hostDue, cliDue]));
    check('The bell (source): bellOut hands sheets.js the note (a failure never breaks the message path); the feeds are guarded so a harness without it runs as before',
        /function bellOut\(cid, note, as\) \{ try \{ if \(window\.wpSheets && window\.wpSheets\.bellNote\) window\.wpSheets\.bellNote\(cid, note, as\); \} catch \(e\) \{ console\.error\(e\); \} \}/.test(src)
        && (src.match(/typeof bellOut === 'function'/g) || []).length === 12);   // 1.6.2 (backlog 70): a turn past the facing limit under Warn (moved on purpose)
})());

// [m410 review] SITE_EQUIVALENT_PLAN fold 2 on the wire, what its review found, each run for real: (4) the host's two readings of a roll's needs roll
// no die; (5) a bound row inside its grace goes for another row's switch-on and its grace is spent; (6) a curse kept on beside a row switched on that
// has a lock of its own is said, on the answer and to the GM; reviewer two (2) a bound row that keeps a switch-on off is said in words that name both
// rows; (1) a row moved by a change of its stat into a group that has one on comes into it off, and a bound one is refused in words of its own; (2) a
// choice whose option the players' view drops puts a row in the same group on the host and on the player's own app
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js')), J = JSON.stringify;
    const line = k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    // (4) needs that hold a die: the host never rolls it, so they are never met, on a player's roll and on the GM's own (24 tries each)
    const sysD = Sx.cleanSystem({ v: 1, name: 'D', fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 10 }], rolls: [{ id: 'r_d', label: 'Luck', formula: '3d6 <= 10', needs: 'd2 > 1', needsText: 'Not by luck' }] }, { F: Fx, gmView: true });
    const runRD = () => { const out = { table: [], sent: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sysD, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta() {} };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(J(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            { type: 'roll-req', rid: 'q1', charId: 'c_a', act: 'r_d', expr: '3d6 <= 10' }, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { out.table.push(rec.expr); }, () => {}, () => {}, () => {});
        return J([out.table.length, out.sent.filter(m => m.type === 'roll-deny').map(m => m.message)]); };
    const runGD = () => { const camp = { id: 'k', system: sysD, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} } } }, net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} }, pushed = [];
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, rec => pushed.push(rec.expr), () => {}, () => {});
        return J([dr('3d6 <= 10', { charId: 'c_a', act: 'r_d' }), pushed]); };
    const dR = [], dG = []; for (let i = 0; i < 24; i++) { dR.push(runRD()); dG.push(runGD()); }
    check('m410 review (4) needs that hold a die are never met on the host (roll-req and net.diceRoll, run for real, 24 times each): the die is never rolled, so the roll is refused in its own words every time, as the player\'s grayed button says',
        dR.every(x => x === J([0, ['Not by luck']])) && dG.every(x => x === J([{ error: 'Not by luck' }, []])), J([dR.filter(x => x !== J([0, ['Not by luck']])).length, dG.filter(x => x !== J([{ error: 'Not by luck' }, []])).length]));
    // the host's real char-item branch, its real delta and the GM's notices, one world per case, several messages each
    const mkH = (sys, rows) => { const camp = { id: 'k', system: sys, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_ar: rows } } } }, out = { answer: [], owner: [], notes: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, grace: function() { return Object.keys(_rowGrace); }, graceSet: function(k, v) { _rowGrace[k] = v; } };')(
            net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
        let n = 0; const send = q => { out.answer.length = 0; Hh.handle(Object.assign({ type: 'char-item', rid: 'i' + (++n), charId: 'c_1', fieldId: 'f_ar' }, q), { peer: 'pA', send: box(out.answer) }); return J(out.answer); };
        const rowsNow = () => camp.chars.c_1.values.f_ar.map(r => r.id + ':' + r.on + (r.keptOn ? 'k' : '')).join(' '), told = () => out.owner.length ? ((out.owner[out.owner.length - 1].values || {}).f_ar || []).map(r => r.id + ':' + r.on).join(' ') : '';
        const byHand = (rid, on) => { camp.chars.c_1.values.f_ar.find(r => r.id === rid).on = on; };
        return { camp, send, rowsNow, told, byHand, out, grace: Hh.grace, graceSet: Hh.graceSet }; };
    const rawE = { v: 1, name: 'E', rolls: [], fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 10 }, { id: 'f_ar', key: 'Armor', label: 'Armor', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Worn', per: 'Loc' }, stats: [{ key: 'Loc', kind: 'pick', opts: [{ label: 'Torso', name: 'HP' }, { label: 'Arm', name: 'HP' }] }] } }],
        items: [{ id: 'i_pl', name: 'Plate', stats: { Loc: 'Torso' }, eq: 'bound', eqMsg: 'It is fused' }, { id: 'i_ma', name: 'Mail', stats: { Loc: 'Torso' } }, { id: 'i_sh', name: 'Shield', stats: { Loc: 'Torso' } }, { id: 'i_he', name: 'Helm', stats: { Loc: 'Torso' }, eq: 'curse', eqMsg: 'It clings' }] };
    const sysE = Sx.cleanSystem(rawE, { F: Fx, gmView: true }), ON = rid => ({ op: 'set', rowId: rid, facts: { on: true } });
    // (5) and reviewer two (2): the Plate switched on opens its grace; the Shield switched on inside it takes the Plate off and spends it; the GM puts
    // the Plate back on by hand, and the Mail switched on is then refused in words that name both rows, the GM told the same
    const G5 = mkH(sysE, [{ id: 'w_p', defId: 'i_pl', qty: 1, on: false }, { id: 'w_m', defId: 'i_ma', qty: 1, on: true }, { id: 'w_s', defId: 'i_sh', qty: 1, on: false }]);
    const g5 = [G5.send(ON('w_p')), G5.rowsNow(), J(G5.grace())]; const g5b = [G5.send(ON('w_s')), G5.rowsNow(), G5.told(), J(G5.grace())];
    G5.byHand('w_p', true); G5.byHand('w_s', false); const g5c = [G5.send(ON('w_m')), G5.rowsNow()];
    const lapse = till => { const W = mkH(sysE, [{ id: 'w_p', defId: 'i_pl', qty: 1, on: true }, { id: 'w_m', defId: 'i_ma', qty: 1, on: false }]); W.graceSet('c_1|f_ar|w_p|on', { until: Date.now() + till, added: 0 }); W.graceSet('c_1|f_ar|w_p', { until: Date.now() + 60000, added: 1 }); return [W.send(ON('w_m')), W.rowsNow()]; };
    const g5l = lapse(-1), g5o = lapse(60000);
    check('m410 review (5) a bound row inside its grace (the host\'s real char-item branch): switched on, the Plate opens its grace; the Shield switched on a moment later takes it off with the Mail\'s place kept, one change stored and sent, and spends that grace; the GM puts it back on, and a switch-on is then refused; a grace that has run out holds nothing, nor does the row\'s pickup window, and one still open lets it go',
        J(g5) === J([J([{ type: 'char-ack', rid: 'i1' }]), 'w_p:true w_m:false w_s:false', J(['c_1|f_ar|w_p|on'])]) && J(g5b) === J([J([{ type: 'char-ack', rid: 'i2' }]), 'w_p:false w_m:false w_s:true', 'w_p:false w_m:false w_s:true', '[]'])
        && J(g5c) === J([J([{ type: 'char-deny', rid: 'i3', reason: 'stays', msg: 'Plate is bound and stays on, so Mail stays off. It is fused' }]), 'w_p:true w_m:false w_s:false'])
        && J(g5l) === J([J([{ type: 'char-deny', rid: 'i1', reason: 'stays', msg: 'Plate is bound and stays on, so Mail stays off. It is fused' }]), 'w_p:true w_m:false']) && J(g5o) === J([J([{ type: 'char-ack', rid: 'i1' }]), 'w_p:false w_m:true']), J([g5, g5b, g5c, g5l, g5o]));
    check('m410 review, reviewer two (2): a bound row that keeps a switch-on off is said by both rows\' names, to the player on the refusal and to the GM in a notice of its own (never "tried to switch off" the bound row)',
        J(G5.out.notes) === J(['Ana switched on Plate. It is bound, so it stays on until you switch it off.', 'Ana tried to switch on Mail. Plate is bound and stays on, so it stays off.']), J(G5.out.notes));
    // (6) the bound Plate switched on beside the cursed Helm that is on: the Helm is kept on out of the player's sight and both are said
    const G6 = mkH(sysE, [{ id: 'w_p', defId: 'i_pl', qty: 1, on: false }, { id: 'w_h', defId: 'i_he', qty: 1, on: true }]);
    const g6 = [G6.send(ON('w_p')), G6.rowsNow(), G6.told()];
    check('m410 review (6) a curse kept on beside a row switched on that has a lock of its own (the host\'s real char-item branch): the Helm stays on out of the player\'s sight, its message rides the answer, and the GM is told both, the Plate switched on and the Helm kept on',
        J(g6) === J([J([{ type: 'char-ack', rid: 'i1', msg: 'It clings' }]), 'w_p:true w_h:truek', 'w_p:true w_h:false'])
        && J(G6.out.notes) === J(['Ana switched on Plate. It is bound, so it stays on until you switch it off.', 'Ana switched off Helm. It stays on, out of their sight, until you switch it off.']), J([g6, G6.out.notes]));
    // (1) a row of the player's own moved by its stat into a group that has one on comes into it off; a bound copy moved by its stat (Setting A) is
    // refused in words of its own and the GM is told in words of their own
    const sysC = Sx.cleanSystem({ v: 1, name: 'C', rolls: [], fields: [{ id: 'f_ar', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { custom: true, on: { label: 'Worn', per: 'Slot' }, stats: [{ key: 'Slot' }] } }] }, { F: Fx, gmView: true });
    const own1 = (id, nm, slot) => ({ id: id, qty: 1, on: true, own: 1, def: { name: nm, category: '', icon: '', notes: '', vis: 'all', stats: { Slot: slot } } });
    const G1 = mkH(sysC, [own1('w_a', 'A', 1), own1('w_b', 'B', 2)]), g1 = [G1.send({ op: 'custom', rowId: 'w_b', def: { stats: { Slot: 1 } } }), G1.rowsNow(), G1.told()];
    const G1f = mkH(sysC, [own1('w_a', 'A', 1), own1('w_b', 'B', 2)]), g1f = [G1f.send({ op: 'custom', rowId: 'w_b', def: { stats: { Slot: 3 } } }), G1f.rowsNow()];
    const sysM = Sx.cleanSystem({ v: 1, name: 'M', rolls: [], listRules: { ownerStats: true }, fields: [{ id: 'f_ar', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Worn', per: 'Slot' }, stats: [{ key: 'Slot' }] } }],
        items: [{ id: 'i_pl', name: 'Plate', stats: { Slot: 1 }, eq: 'bound', eqMsg: 'It is fused' }, { id: 'i_ma', name: 'Mail', stats: { Slot: 2 } }, { id: 'i_bo', name: 'Boots', stats: { Slot: 3 } }] }, { F: Fx, gmView: true });
    const GM = mkH(sysM, [{ id: 'w_p', defId: 'i_pl', qty: 1, on: true }, { id: 'w_m', defId: 'i_ma', qty: 1, on: true }]), gm1 = [GM.send({ op: 'ov', rowId: 'w_p', ov: { stats: { Slot: 2 } } }), GM.rowsNow()];
    const GB = mkH(sysM, [{ id: 'w_b', defId: 'i_bo', qty: 1, on: true }, { id: 'w_m', defId: 'i_ma', qty: 1, on: true }]), gb1 = [GB.send({ op: 'ov', rowId: 'w_b', ov: { stats: { Slot: 2 } } }), GB.rowsNow(), GB.told()];
    check('m410 review (1) a row moved by a change of its stat into a group that has one on (the host\'s real char-item branch): a row of the player\'s own moved into Slot 1 comes into it off, stored and sent so; moved to a free slot it stays on; a library copy moved by its own stat (Setting A) comes in off too; a bound one is refused in words of its own, nothing stored, and the GM is told it was a change',
        J(g1) === J([J([{ type: 'char-ack', rid: 'i1' }]), 'w_a:true w_b:false', 'w_a:true w_b:false']) && J(g1f) === J([J([{ type: 'char-ack', rid: 'i1' }]), 'w_a:true w_b:true'])
        && J(gb1) === J([J([{ type: 'char-ack', rid: 'i1' }]), 'w_b:false w_m:true', 'w_b:false w_m:true'])
        && J(gm1) === J([J([{ type: 'char-deny', rid: 'i1', reason: 'stays', msg: 'Plate is bound and stays on. Another row of that group is on, so that change is not made. It is fused' }]), 'w_p:true w_m:true'])
        && J(GM.out.notes) === J(['Ana tried to change Plate. It is bound and stays on, and another row of that group is on.']), J([g1, g1f, gb1, gm1, GM.out.notes]));
    // (2) a choice whose option names a GM-only value: the player's own app (the real net.charItem) and the host (the real char-item branch, the
    // very message) put the Mail in the same group, so what the player saw at once is what the host stored and sent
    const rawQ = { v: 1, name: 'Q', rolls: [], fields: [{ id: 'f_s', key: 'TorsoDR', kind: 'number', vis: 'gm' }, { id: 'f_h', key: 'HeadDR', kind: 'number' },
        { id: 'f_ar', key: 'Armor', label: 'Armor', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Worn', per: 'Loc' }, stats: [{ key: 'Loc', kind: 'pick', def: 'Head', opts: [{ label: 'Head', name: 'HeadDR' }, { label: 'Torso', name: 'TorsoDR' }] }] } }],
        items: [{ id: 'i_he', name: 'Helm', stats: { Loc: 'Head' } }, { id: 'i_ma', name: 'Mail', stats: { Loc: 'Torso' } }] };
    const sysQ = Sx.cleanSystem(rawQ, { F: Fx, gmView: true }), viewQ = Sx.cleanSystem(sysQ, { F: Fx, gmView: false });
    const rowsQ = () => [{ id: 'w_m', defId: 'i_ma', qty: 1, on: true }, { id: 'w_h', defId: 'i_he', qty: 1, on: false }], onQ = rows => (rows || []).map(r => r.id + ':' + (r.on === true)).join(' ');
    const cA = src.indexOf('net.charItem = function('), cZ = src.indexOf('\n};\n', cA) + 3, sentQ = [];
    const campQ = { id: 'k', system: viewQ, chars: { c_1: JSON.parse(J(Sx.charFor({ id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_ar: rowsQ() } }, viewQ, 'u_a', { full: sysQ }))) } };
    const netQ = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sentQ.push(JSON.parse(J(m))); } }] };
    new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netQ, () => Sx, () => campQ, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
    const rQ = netQ.charItem('c_1', 'f_ar', ON('w_h')), mineQ = onQ(campQ.chars.c_1.values.f_ar);
    const GQ = mkH(sysQ, rowsQ()); const ansQ = sentQ.length ? (() => { GQ.out.answer.length = 0; return GQ.send({ op: sentQ[0].op, rowId: sentQ[0].rowId, facts: sentQ[0].facts }); })() : '';
    // body fold 0: a stat its list ticks Player sets this, through the host's real char-item branch and the real net.charItem, on a list that is the GM's to edit
    const sysS = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_ar', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'gm', vis: 'all', list: { stats: [{ key: 'Hand', kind: 'pick', own: true, opts: [{ label: 'Left', name: 'Left' }, { label: 'Right', name: 'Right' }] }, { key: 'Wt' }] } }], items: [{ id: 'i_sh', name: 'Shield', stats: { Hand: 'Left', Wt: 3 } }] }, { F: Fx, gmView: true });
    const rowsS = () => [{ id: 'w_s', defId: 'i_sh', qty: 1 }], GS = mkH(sysS, rowsS());
    const ansS = [GS.send({ op: 'ov', rowId: 'w_s', ov: { stats: { Hand: 'Right' } } }), GS.send({ op: 'ov', rowId: 'w_s', ov: { stats: { Wt: 1 } } }), GS.send({ op: 'ov', rowId: 'w_s', ov: { stats: { Hand: 'Left', Wt: 1 } } }), GS.send({ op: 'ov', rowId: 'w_s', ov: { name: 'Mine' } }), GS.send({ op: 'remove', rowId: 'w_s' })];
    const sentS = [], campS = { id: 'k', system: Sx.cleanSystem(sysS, { F: Fx, gmView: false }), chars: { c_1: JSON.parse(J(Sx.charFor({ id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_ar: rowsS() } }, Sx.cleanSystem(sysS, { F: Fx, gmView: false }), 'u_a', { full: sysS }))) } };
    const netS = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sentS.push(JSON.parse(J(m))); } }] };
    new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netS, () => Sx, () => campS, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
    const rS = netS.charItem('c_1', 'f_ar', { op: 'ov', rowId: 'w_s', ov: { stats: { Hand: 'Right' } } });
    check('body fold 0: on a list that is the GM\'s to edit its owner sets a stat ticked Player sets this, on the host\'s real char-item branch, and nothing else of the row: another stat, the two together, a name and a removal are each refused; a player\'s own app sends it and waits for the host',
        ansS[0] === J([{ type: 'char-ack', rid: 'i1' }]) && GS.camp.chars.c_1.values.f_ar[0].ov.stats.Hand === 'Right' && ansS.slice(1).every(a => a.indexOf('char-deny') >= 0) && !GS.camp.chars.c_1.values.f_ar[0].ov.name && GS.camp.chars.c_1.values.f_ar.length === 1
        && rS.ok === true && sentS.length === 1 && sentS[0].op === 'ov' && !(campS.chars.c_1.values.f_ar[0].ov && campS.chars.c_1.values.f_ar[0].ov.stats), J([ansS, rS, sentS]));
    const GS2 = mkH(sysS, rowsS()), ansS2 = GS2.send({ op: sentS[0].op, rowId: sentS[0].rowId, ov: sentS[0].ov });
    check('body fold 0, found by pressing it: what a player\'s app sends for such a stat reaches the host whole, its stats in the message the app really made, and the host stores it (the waiting send copies a list of keys, and ov was not on it, so the host heard nothing and the change timed out)',
        J(sentS[0].ov) === J({ stats: { Hand: 'Right' } }) && ansS2 === J([{ type: 'char-ack', rid: 'i1' }]) && GS2.camp.chars.c_1.values.f_ar[0].ov.stats.Hand === 'Right', J([sentS, ansS2]));
    // body fold 2: a row moved to a place, through the host's real char-item branch and the real net.charItem
    const sysP2 = Sx.cleanSystem({ v: 1, name: 'P', rolls: [], fields: [{ id: 'f_ti', key: 'Body', label: 'Body', kind: 'item-list', vis: 'all', list: { multi: true, stats: [{ key: 'Z' }, { key: 'S', vis: 'gm' }] } }, { id: 'f_ar', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', list: { multi: true, stats: [{ key: 'Z' }], stand: { from: 'f_ti', fits: 'Row.Z = At.Z', fitSays: 'Not on that part.' } } }, { id: 'f_gt', key: 'Bags', label: 'Bags', kind: 'item-list', vis: 'all', list: { multi: true, stats: [{ key: 'Z' }, { key: 'K', vis: 'gm' }], stand: { from: 'f_ti', fits: 'Row.Z = At.Z and At.S < 1', fitSays: 'Hidden words.' } } }], items: [{ id: 'i_t', name: 'Part', stats: { Z: 1, S: 0 } }, { id: 'i_t2', name: 'Other', stats: { Z: 2, S: 5 } }, { id: 'i_g', name: 'Glove', stats: { Z: 1 } }] }, { F: Fx, gmView: true });
    const GP2 = mkH(sysP2, [{ id: 'w_g', defId: 'i_g', qty: 1 }]); GP2.camp.chars.c_1.values.f_ti = [{ id: 'w_t1', defId: 'i_t', qty: 1 }, { id: 'w_t2', defId: 'i_t2', qty: 1 }];
    const ansP1 = GP2.send({ op: 'place', rowId: 'w_g', at: 'w_t2' }), plP1 = GP2.camp.chars.c_1.values.f_ar[0].pl, ansP2 = GP2.send({ op: 'place', rowId: 'w_g', at: 'w_t1' }), plP2 = GP2.camp.chars.c_1.values.f_ar[0].pl, ansP3 = GP2.send({ op: 'place', rowId: 'w_g', at: 7 }), ansP4 = GP2.send({ op: 'place', rowId: 'w_g', at: null }), plP4 = GP2.camp.chars.c_1.values.f_ar[0].pl;
    check('body fold 2: the host judges a player\'s move: a place Fits where refuses is answered in the words of the place with nothing stored, one it allows is stored and acknowledged, a place that is no id is no message, and null takes the row off',
        ansP1.indexOf('char-deny') >= 0 && ansP1.indexOf('Not on that part.') >= 0 && plP1 === undefined && ansP2 === J([{ type: 'char-ack', rid: 'i2' }]) && plP2 === 'w_t1' && ansP3 === '[]' && ansP4.indexOf('char-ack') >= 0 && plP4 === undefined, J([ansP1, plP1, ansP2, plP2, ansP3, ansP4, plP4]));
    const sentP = [], campP = { id: 'k', system: Sx.cleanSystem(sysP2, { F: Fx, gmView: false }), chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_ar: [{ id: 'w_g', defId: 'i_g', qty: 1 }] } } } }, netP = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sentP.push(JSON.parse(J(m))); } }] };
    new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netP, () => Sx, () => campP, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
    const rP = netP.charItem('c_1', 'f_ar', { op: 'place', rowId: 'w_g', at: 'w_t1', back: 'w_b2' });
    check('body fold 2: a player\'s own app sends a move whole and waits for the host, since only the host holds every row a place may read',
        rP.ok === true && sentP.length === 1 && sentP[0].op === 'place' && sentP[0].at === 'w_t1' && sentP[0].back === 'w_b2' && campP.chars.c_1.values.f_ar[0].pl === undefined, J([rP, sentP]));
    const hsrc = src.indexOf("if (typeof resI.standTell === 'string' && resI.standTell");
    check('body fold 2: where the player\'s own view let them past what the GM\'s would refuse, the host tells the GM and the words name no one else\'s row', hsrc > 0 && src.indexOf('moved a row where your rules do not let it stand', hsrc) > 0 && hsrc < src.indexOf('var itMI = resI.hid && resI.msg ? resI.msg :'));
    check('m410 review (2) a choice whose option names a GM-only value (Torso reads TorsoDR): the player\'s own app and the host group the Mail alike, by the player\'s own view of the list, so the Helm switched on takes it off on both machines and what the player saw at once is what the host stored and sent',
        rQ.ok === true && mineQ === 'w_m:false w_h:true' && ansQ === J([{ type: 'char-ack', rid: 'i1' }]) && onQ(campQ.chars.c_1.values.f_ar) === GQ.rowsNow().replace(/k/g, '') && GQ.told() === mineQ, J([rQ, mineQ, ansQ, GQ.rowsNow(), GQ.told()]));
})());

// Stage 6 HUD R3: a roll's Malf on the wire — the host works it out through the player's view, puts it on the record (every machine then shows the
// malfunction from the draws), and a malfunction is a failure with its own consequences; the GM's own: a GM-only Malf keeps the roll private
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src4 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src4.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src4.slice(i, src4.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const sysM = Sx.cleanSystem({ v: 1, name: 'M', fields: [{ id: 'f_j', key: 'Jam', kind: 'number', def: 0 }, { id: 'f_h', key: 'Hits', kind: 'number', def: 0 }, { id: 'f_g', key: 'GMFig', kind: 'number', def: 3, vis: 'gm' }],
        rolls: [{ id: 'r_a', label: 'A', formula: '3d6 <= 30', malf: '3', then: [{ f: 'f_j', formula: '1', add: true, when: 'malf' }, { f: 'f_h', formula: '1', add: true, when: 'hit' }] },
            { id: 'r_b', label: 'B', formula: '3d6 <= 30', malf: '19', then: [{ f: 'f_j', formula: '1', add: true, when: 'malf' }, { f: 'f_h', formula: '1', add: true, when: 'hit' }] },
            { id: 'r_g', label: 'G', formula: '3d6 <= 30', malf: 'GMFig' }] }, { F: Fx, gmView: true });
    const runM = msg => { const out = { table: [], sent: [], deltas: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sysM, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta: (id, d) => out.deltas.push(JSON.parse(JSON.stringify(d))) };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, () => {});
        out.vals = camp.chars.c_a.values; return out; };
    const mA = runM({ act: 'r_a', expr: '3d6 <= 30' }), mB = runM({ act: 'r_b', expr: '3d6 <= 30' }), mG = runM({ act: 'r_g', expr: '3d6 <= 30' });
    check('R3 a player\'s roll with a Malf: the host puts the Malf on the record; a natural total at or past it (Malf 3: always) is a malfunction — a failure (no On success change) with its On malfunction change; below it (Malf 19: never) the roll is judged as usual; a Malf the player\'s view does not have (GM-only) is not on the record',
        mA.table.length === 1 && mA.table[0].malf === 3 && Dx.cleanRoll(mA.table[0]).malf === 3 && j(mA.vals) === j({ f_j: 1 })
        && mB.table.length === 1 && mB.table[0].malf === 19 && j(mB.vals) === j({ f_h: 1 }) && mG.table.length === 1 && !('malf' in mG.table[0]), j([mA.table[0], mA.vals, mB.vals, mG.table[0]]));
    const runGM = (expr, o) => { const out = { pushed: [], toasts: [] };
        const camp = { id: 'k', system: sysM, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} } } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, e => { throw e; }, () => {}, (rec, res, scope) => out.pushed.push([scope, rec.priv || '', rec.malf]), () => {}, () => {});
        out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o)); out.vals = camp.chars.c_a.values; return out; };
    const gA = runGM('3d6 <= 30', { act: 'r_a' }), gG = runGM('3d6 <= 30', { act: 'r_g' });
    check('R3 the GM\'s own roll with a Malf carries it on the record and applies its On malfunction change here; a Malf that reads a GM-only value keeps the roll private (the card would show it)',
        gA.ret.ok && j(gA.pushed) === j([['global', '', 3]]) && j(gA.vals) === j({ f_j: 1 }) && gG.ret.ok && gG.pushed[0][1] === 'gm' && gG.pushed[0][2] === 3 && gG.toasts.some(t => /GMFig/.test(t)), j([gA.pushed, gA.vals, gG.pushed, gG.toasts]));
})());

// 1.5.8 (the owner, 2026-10-25: "a roll's Then gets critical success and critical failure beside success and failure"): the host's roll-req branch
// and the GM's own net.diceRoll apply an On a critical success or On a critical failure change only on that outcome, by the system's Roll outcomes
// (3d6 roll-under criticals), and a consequence's amount reads RollCrit; the suite's own dice (a random source handed to the formula engine)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx0 = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src4 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src4.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src4.slice(i, src4.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    let dq = []; const Fx = Object.assign({}, Fx0, { evaluate: (e, o) => Fx0.evaluate(e, Object.assign({ random: () => { if (!dq.length) throw new Error('netcheck: no die left'); return dq.shift(); } }, o)) });
    const rawK = { v: 1, name: 'K', fields: [{ id: 'f_st', key: 'Steady', kind: 'number', def: 4 }, { id: 'f_gd', key: 'Guard', kind: 'number', def: 0 }, { id: 'f_x', key: 'Spark', kind: 'number', def: 0, min: 0 }],
        rolls: [{ id: 'r_sg', label: 'Steady Guard', formula: '3d6 <= 12', then: [{ f: 'f_gd', formula: 'Steady + max(0, RollCrit)', set: true, when: 'hit' }, { f: 'f_gd', formula: 'floor(Steady / 2) * (RollCrit + 1)', set: true, when: 'miss' }, { f: 'f_x', formula: '1', add: true, when: 'crit' }, { f: 'f_x', formula: '5', set: true, when: 'fumble' }] }] };
    const sysK = Sx.cleanSystem(Object.assign({}, rawK, { combat: { checks: 'under3d6' } }), { F: Fx, gmView: true }), sysN = Sx.cleanSystem(rawK, { F: Fx, gmView: true });
    const runK = (sys, dice) => { const out = { table: [], sent: [], deltas: [] }; dq = dice.slice();
        const camp = { id: 'k', activeItemId: 'm1', system: sys, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: {} } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta: (id, d) => out.deltas.push(JSON.parse(JSON.stringify(d))) };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            { type: 'roll-req', rid: 'q1', charId: 'c_a', act: 'r_sg', expr: '3d6 <= 12' }, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, () => {});
        out.vals = camp.chars.c_a.values; out.left = dq.length; return out; };
    const kC = runK(sysK, [1, 1, 1]), kS = runK(sysK, [2, 3, 4]), kF = runK(sysK, [5, 5, 4]), kU = runK(sysK, [6, 6, 6]), kN = runK(sysN, [1, 1, 1]), kNu = runK(sysN, [6, 6, 6]);
    check('1.5.8 a player\'s roll (the host\'s roll-req branch, the suite\'s own dice): a critical success (3) takes On success with RollCrit 1 (Guard 4 + 1) and On a critical success (Spark +1); a success (9) Guard 4 alone; a failure (14) half of it (2); a critical failure (18) none (0) and On a critical failure (Spark 5); a system with no criticals takes neither on the same dice, RollCrit reading 0',
        kC.table.length === 1 && kC.left === 0 && j(kC.vals) === j({ f_gd: 5, f_x: 1 }) && j(kS.vals) === j({ f_gd: 4 }) && j(kF.vals) === j({ f_gd: 2 }) && j(kU.vals) === j({ f_gd: 0, f_x: 5 })
        && j(kN.vals) === j({ f_gd: 4 }) && j(kNu.vals) === j({ f_gd: 2 }) && j(kC.deltas) === j([{ f_gd: 5, f_x: 1 }]), j([kC.vals, kS.vals, kF.vals, kU.vals, kN.vals, kNu.vals, kC.deltas]));
    const runKG = (sys, dice) => { const out = { pushed: [] }; dq = dice.slice();
        const camp = { id: 'k', system: sys, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: {} } } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, (rec, res, scope) => out.pushed.push(scope), () => {}, () => {});
        out.ret = dr('3d6 <= 12', { charId: 'c_a', act: 'r_sg' }); out.vals = camp.chars.c_a.values; return out; };
    const gC = runKG(sysK, [1, 1, 1]), gS = runKG(sysK, [2, 3, 4]), gF = runKG(sysK, [5, 5, 4]), gU = runKG(sysK, [6, 6, 6]), gN = runKG(sysN, [6, 6, 6]);
    check('1.5.8 the GM\'s own roll (net.diceRoll): On a critical success and On a critical failure happen only on that outcome, RollCrit read in the amounts; a system with no criticals as before',
        gC.ret.ok && j(gC.vals) === j({ f_gd: 5, f_x: 1 }) && j(gS.vals) === j({ f_gd: 4 }) && j(gF.vals) === j({ f_gd: 2 }) && j(gU.vals) === j({ f_gd: 0, f_x: 5 }) && j(gN.vals) === j({ f_gd: 2 }), j([gC.vals, gS.vals, gF.vals, gU.vals, gN.vals]));
    // 1.5.8: RollMargin, how far the roll beat its target, in the host's roll-req branch and the GM's own net.diceRoll
    const rawMg = { v: 1, name: 'Mg', fields: [{ id: 'f_fn', key: 'Fine', kind: 'number', def: 0 }], rolls: [{ id: 'r_sg', label: 'Recover', formula: '3d6 <= 12', then: [{ f: 'f_fn', formula: 'RollMargin', set: true }] }] };
    const sysMg = Sx.cleanSystem(Object.assign({}, rawMg, { combat: { checks: 'under3d6' } }), { F: Fx, gmView: true }), sysMp = Sx.cleanSystem(rawMg, { F: Fx, gmView: true });
    const mA = runK(sysMg, [2, 3, 4]), mB = runK(sysMg, [5, 5, 5]), mC = runK(sysMp, [2, 3, 4]), mG = runKG(sysMg, [2, 3, 4]), mH = runKG(sysMg, [6, 5, 5]);
    check('1.5.8 RollMargin on the host: a player\'s roll of 9 against 12 sets Fine to 3, of 15 to -3, a system with no criticals reads the same arithmetic (3); the GM\'s own roll alike (3, and 16 -4)',
        j(mA.vals) === j({ f_fn: 3 }) && j(mB.vals) === j({ f_fn: -3 }) && j(mC.vals) === j({ f_fn: 3 }) && j(mG.vals) === j({ f_fn: 3 }) && j(mH.vals) === j({ f_fn: -4 }), j([mA.vals, mB.vals, mC.vals, mG.vals, mH.vals]));
    // 1.6.0 (the v2 sort's B1): criticals at fixed rolls, decided by the host in its roll-req branch and the GM's own net.diceRoll (invented data: Edge, Secret, Spark)
    const fldB = [{ id: 'f_e', key: 'Edge', kind: 'number', def: 4, vis: 'all' }, { id: 'f_s', key: 'Secret', kind: 'number', def: 2, vis: 'gm' }, { id: 'f_gd', key: 'Guard', kind: 'number', def: 0 }, { id: 'f_x', key: 'Spark', kind: 'number', def: 0 }];
    const thenB = [{ f: 'f_x', formula: '1', add: true, when: 'crit' }, { f: 'f_x', formula: '5', set: true, when: 'fumble' }, { f: 'f_gd', formula: 'RollCrit + 2', set: true, when: 'hit' }];
    const sysOfB = (roll, combat) => Sx.cleanSystem({ v: 1, name: 'B', fields: fldB, rolls: [Object.assign({ id: 'r_sg', label: 'Feint', formula: '3d6 <= 12', then: thenB }, roll)], combat: combat }, { F: Fx, gmView: true });
    const sysB = sysOfB({ critAt: 'Edge' }, { checks: 'fixed', critAt: '3' }), sysB0 = sysOfB({}, { checks: 'fixed', critAt: '3' }), sysBg = sysOfB({ fumbleAt: 'Secret + 14' }, { checks: 'fixed' }), sysBn = sysOfB({ critAt: 'Edge' }, {});
    const runB = (sys, dice, extra, vals) => { const out = { table: [], sent: [], notes: [] }; dq = dice.slice();
        const camp = { id: 'k', activeItemId: 'm1', system: sys, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: vals || {} } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta() {} };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'turnNote', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a', act: 'r_sg', expr: '3d6 <= 12' }, extra || {}), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, (k, t) => { out.log = t; }, () => {}, (c, t, cid) => out.notes.push([t, cid]));
        out.vals = camp.chars.c_a.values; out.left = dq.length; return out; };
    const runBG = (sys, dice, vals) => { const out = { pushed: [], recs: [], toasts: [] }; dq = dice.slice();
        const camp = { id: 'k', system: sys, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: vals || {} } } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, e => { throw e; }, () => {}, (rec, res, scope) => { out.pushed.push(scope); out.recs.push(JSON.parse(JSON.stringify(rec))); }, (k, t) => { out.log = t; }, () => {});
        out.ret = dr('3d6 <= 12', { charId: 'c_a', act: 'r_sg' }); out.vals = camp.chars.c_a.values; out.check = net.rollCheck; return out; };
    const fxbW = runB(sysB, [1, 1, 2]), fxbP = runB(sysB, [1, 2, 2]), fxb0 = runB(sysB0, [1, 1, 2]), fxbF = runB(sysB, [6, 6, 6]), fxb17 = runB(sysB, [6, 6, 5]), fxbN = runB(sysBn, [1, 1, 1]), fxbX = runB(sysB, [1, 2, 2], { crit: [5, 5] });
    check('1.6.0 a player\'s roll under criticals at fixed rolls (the host\'s roll-req branch, the suite\'s own dice): its own Critical at (Edge, 4) makes a 4 a critical success (On a critical success, and On success with RollCrit 1), a 5 a plain success; the same roll with none reads the Combat tab\'s 3, so 4 is plain; 18 a critical failure, 17 a plain failure; the record carries the two numbers and the log says it; a system with no rule as before, its record with none; a crit in the player\'s message is never read',
        fxbW.table.length === 1 && fxbW.left === 0 && j(fxbW.vals) === j({ f_x: 1, f_gd: 3 }) && j(fxbW.table[0].crit) === j([4, 18]) && j(Dx.cleanRoll(fxbW.table[0]).crit) === j([4, 18]) && /critical success by 8$/.test(fxbW.log)
        && j(fxbP.vals) === j({ f_gd: 2 }) && j(fxb0.vals) === j({ f_gd: 2 }) && j(fxb0.table[0].crit) === j([3, 18]) && j(fxbF.vals) === j({ f_x: 5 }) && j(fxb17.vals) === j({}) && /: failure by 5$/.test(fxb17.log)
        && j(fxbN.vals) === j({ f_gd: 2 }) && !('crit' in fxbN.table[0]) && j(fxbX.vals) === j({ f_gd: 2 }) && j(fxbX.table[0].crit) === j([4, 18]),
        j([fxbW.vals, fxbW.table[0].crit, fxbW.log, fxbP.vals, fxb0.vals, fxb0.table[0].crit, fxbF.vals, fxb17.vals, fxb17.log, fxbN.vals, fxbN.table[0], fxbX.vals, fxbX.table[0].crit]));
    {   // 1.6.0 a GM-only stat: a roll's range on the host (the real roll-req branch and net.diceRoll), the card carrying the outcome and never the range
        const sysFl = Sx.cleanSystem({ v: 1, name: 'F', rolls: [], fields: [{ id: 'f_gr', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Skill', label: 'Skill' }, { key: 'Flaw', label: 'Flaw', vis: 'gm' }], rolls: [{ label: 'Use', formula: '3d6 <= Row.Skill', fumbleAt: '18 - Row.Flaw' }] } }], items: [{ id: 'i_p', name: 'Pebbles', stats: { Skill: 19 } }], combat: { checks: 'fixed' } }, { F: Fx, gmView: true });
        let sysNow = sysFl;
        const vals = flaw => ({ f_gr: [{ id: 'w_p', defId: 'i_p', qty: 1, ov: flaw ? { stats: { Flaw: flaw }, held: ['Flaw'] } : undefined }] }), row = { f: 'f_gr', r: 'w_p', i: 0 };
        const runP = (dice, flaw) => { const out = { table: [], sent: [] }; dq = dice.slice();
            const camp = { id: 'k', activeItemId: 'm1', system: sysNow, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: vals(flaw) } }, items: { m1: { type: 'map', whiteboard: [] } } };
            const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta() {} }, conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
            const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
            new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + fnSrc('function critFromGm(', '\n}\n', 'critFromGm') + '\n}\n' + fnSrc('function malfFromGm(', '\n}\n', 'malfFromGm') + '\n}\n' + helpers + rqSrc)(
                { type: 'roll-req', rid: 'q1', charId: 'c_a', row: row, expr: '3d6 <= Row.Skill' }, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, (k, t) => { out.log = t; }, () => {});
            return out; };
        const runG = (dice, flaw, ex) => { const out = { recs: [], pushed: [], toasts: [] }; dq = dice.slice();
            const camp = { id: 'k', system: sysNow, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: vals(flaw) } } }, net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
            const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
                net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {}, playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, e => { throw e; }, () => {}, (rec, res, scope) => { out.pushed.push(scope); out.recs.push(JSON.parse(JSON.stringify(rec))); }, (k, t) => { out.log = t; }, () => {});
            out.ret = dr(ex || '3d6 <= Row.Skill', { charId: 'c_a', row: row }); out.check = net.rollCheck; return out; };
        const p16 = runP([6, 5, 5], 2), p15 = runP([6, 5, 4], 2), p16n = runP([6, 5, 5], 0), p18 = runP([6, 6, 6], 0), g16 = runG([6, 5, 5], 2), g15 = runG([6, 5, 4], 2), judge = r => Dx.verdictOf({ ok: true, breakdown: { dice: [{ cs: false, rolls: [] }], checks: [{ top: true, pass: true, op: '<=', margin: 3 }] } }, Dx.ruleOf(r, 'fixed'));
        const noWord = o => !/flaw/i.test(j([o.table, o.sent]));
        {   // 1.6.0 found by hand on a table: a list's roll before it reads a GM-only stat, so the player's view drops that roll and the press names a lower place than the GM's list has. The real roll-req branch and net.diceRoll, with the button's own message
            const listOf = extra => ({ id: 'f_gr', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Skill', label: 'Skill' }, { key: 'Flaw', label: 'Flaw', vis: 'gm' }], rolls: [{ label: 'Gnaw', formula: '3d6 <= Row.Flaw' }, Object.assign({ label: 'Use', formula: '3d6 <= Row.Skill' }, extra)] } });
            const sysOf = (extra, combat) => Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [listOf(extra)], items: [{ id: 'i_p', name: 'Pebbles', stats: { Skill: 19 } }], combat: combat || {} }, { F: Fx, gmView: true });
            const valsS = { f_gr: [{ id: 'w_p', defId: 'i_p', qty: 1, ov: { stats: { Flaw: 2 }, held: ['Flaw'] } }] };
            const press = (sys, dice) => { const out = { table: [], sent: [], off: [], warn: [], ref: [] }; dq = dice.slice();
                const camp = { id: 'k', activeItemId: 'm1', system: sys, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(valsS)) } }, items: { m1: { type: 'map', whiteboard: [] } } };
                const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta() {} }, conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
                const win = { wpFormula: Fx, wpNotice: { stealth: (c, id, ref) => out.ref.push(ref) }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
                new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'out', 'var diceLimit = null, _diceSlowSaid = {};\nfunction offTurnBar(c, ch, a, r) { out.off.push(r); return \'\'; }\nfunction offTurnWarn(c, ch, a, r) { out.warn.push(r); }\n' + fnSrc('function rowOnGm(', '\n}\n', 'rowOnGm', 'netfight.js') + '\n}\n' + fnSrc('function critFromGm(', '\n}\n', 'critFromGm') + '\n}\n' + fnSrc('function malfFromGm(', '\n}\n', 'malfFromGm') + '\n}\n' + helpers + rqSrc)(
                    { type: 'roll-req', rid: 'q1', charId: 'c_a', row: { f: 'f_gr', r: 'w_p', i: 0 }, expr: '3d6 <= Row.Skill' }, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, (k, t) => { out.log = t; }, () => {}, out);
                return out; };
            const sM = sysOf({ malf: '18 - Row.Flaw' }), sF = sysOf({ fumbleAt: '17 - Row.Flaw' }, { checks: 'fixed' }), view = Sx.cleanSystem(sM, { F: Fx, gmView: false }), inView = view.fields[0].list.rolls.map(r => r.label);
            const m16 = press(sM, [6, 5, 5]), m15 = press(sM, [6, 5, 4]), f15 = press(sF, [6, 5, 4]), f14 = press(sF, [6, 5, 3]);
            check('1.6.0 a Malf that reads a GM-only stat fires on a player\'s press of a roll standing after one their view drops (found by hand: the host looked at the GM\'s list by the player\'s place and found the roll before): the real roll-req branch with the button\'s own row, the card saying only that it jammed, and a roll under it plain',
                j(inView) === j(['Use']) && !!m16.table[0] && m16.table[0].malfHid === 1 && /malfunction$/.test(m16.log) && m15.table[0].malf === undefined && !/malfunction/.test(m15.log) && !/flaw/i.test(j([m16.table, m16.sent])), j([inView, m16.table[0], m16.log, m15.log]));
            check('1.6.0 ... and a critical range that reads a GM-only stat, the same press: a natural at the range is a critical failure, one under it plain', /critical failure/.test(f15.log) && !/critical failure/.test(f14.log), j([f15.log, f14.log]));
            check('1.6.0 ... and what else the host judges from the GM\'s view reads the same roll: Off a character\'s turn before and after the roll, and a sneak\'s roll by its place on the GM\'s list', m16.off[0] && m16.off[0].i === 1 && m16.warn[0] && m16.warn[0].i === 1 && m16.ref[0] && m16.ref[0].i === 1 && m16.ref[0].l === 'f_gr', j([m16.off, m16.warn, m16.ref]));
            const pressG = (sys, dice, ex, oo) => { const out = { recs: [], pushed: [], toasts: [] }; dq = dice.slice();
                const camp = { id: 'k', system: sys, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(valsS)) } } }, net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
                const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
                    net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {}, playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, e => { throw e; }, () => {}, (rec, res, scope) => { out.pushed.push(scope); out.recs.push(JSON.parse(JSON.stringify(rec))); }, (k, t) => { out.log = t; }, () => {});
                out.ret = dr(ex || '3d6 <= Row.Skill', oo || { charId: 'c_a', row: { f: 'f_gr', r: 'w_p', i: 1 } }); return out; };
            const sysSec = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [listOf({}), { id: 'f_sec', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm' }], items: [{ id: 'i_p', name: 'Pebbles', stats: { Skill: 19 } }], combat: { checks: 'fixed', critAt: 'Secret + 3' } }, { F: Fx, gmView: true });
            const secD = pressG(sysSec, [1, 1, 2], '3d6', { charId: 'c_a', dmg: true }), secC = pressG(sysSec, [1, 1, 2], '3d6 <= 14', { charId: 'c_a' });
            check('1.6.2 a damage roll with no check has no critical to read: a range that reads a GM-only value is no part of its card and keeps it public, while a roll with a check is kept private as before (net.diceRoll, run for real)',
                secD.recs[0] && secD.recs[0].dmg === 1 && secD.recs[0].crit === undefined && secD.recs[0].priv === undefined && secC.recs[0] && secC.recs[0].priv === 'gm', j([secD.recs[0], secC.recs[0], secC.toasts]));
            const gmC = pressG(sysOf({ critAt: '5', fumbleAt: '17 - Row.Flaw' }, { checks: 'fixed' }), [1, 1, 2]);
            check('1.6.0 ... and the GM\'s own card measures a masked range against that roll in the players\' view, by its place there', j(gmC.recs[0] && gmC.recs[0].crit) === j([5, 18]), j(gmC.recs[0]));
            const altS = fnSrc('function attRowAlts(', '\n}\n', 'attRowAlts', 'netattack.js') + '\n}\n';
            const sA = Sx.cleanSystem({ v: 1, name: 'S', rolls: [], fields: [{ id: 'f_gr', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Flaw', label: 'Flaw', vis: 'gm' }], rolls: [{ label: 'Gnaw', formula: '3d6 <= Row.Flaw' }, { label: 'Block', formula: '3d6 <= 11', resist: true }] } }], items: [{ id: 'i_p', name: 'Pebbles', stats: {} }] }, { F: Fx, gmView: true });
            const alts = toO => { const out = [], tch = { id: 'c_t', name: 'Tess', ownerId: 'u_a', values: { f_gr: [{ id: 'w_p', defId: 'i_p', qty: 1 }] } }; new Function('SC', 'window', 'fxLib', 'itemLib', 'attTokCtx', 'ATT_ROWS', altS + '\nreturn attRowAlts;')(() => Sx, { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) } }, () => undefined, () => undefined, () => null, 8)({ system: sA, items: {} }, tch, 'f_gr#1', toO, out, null); return out; };
            const aP = alts(true), aG = alts(false);
            check('1.6.0 a resist card offers a list\'s roll standing after one a player\'s view drops, and names it as that player\'s press will (attRowAlts, run for real): by its place in their view on their card and on the GM\'s list on the GM\'s',
                aP.length === 1 && aP[0].i === 0 && /^Block with /.test(aP[0].label) && aG.length === 1 && aG[0].i === 1, j([aP, aG]));
        }
        {   // a Malf that reads the stat, worked out on the host as a critical range is
            sysNow = Sx.cleanSystem({ v: 1, name: 'F', rolls: [], fields: [{ id: 'f_gr', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Skill', label: 'Skill' }, { key: 'Flaw', label: 'Flaw', vis: 'gm' }], rolls: [{ label: 'Use', formula: '3d6 <= Row.Skill', malf: '18 - Row.Flaw' }] } }], items: [{ id: 'i_p', name: 'Pebbles', stats: { Skill: 19 } }] }, { F: Fx, gmView: true });
            const m16 = runP([6, 5, 5], 2), m15 = runP([6, 5, 4], 2), m16n = runP([6, 5, 5], 0), m18n = runP([6, 6, 6], 0), gm16 = runG([6, 5, 5], 2), gm15 = runG([6, 5, 4], 2); sysNow = sysFl;
            check('1.6.0 ... a masked Malf says just malfunction (found by hand on a table): the host marks the card on a player\'s roll and on the GM\'s own, and the player\'s app keeps the mark',
                m16.table[0].malfHid === 1 && Dx.cleanRoll(m16.table[0]).malfHid === 1 && /, a malfunction$/.test(m16.log) && gm16.recs[0].malfHid === 1 && /, a malfunction$/.test(gm16.log), j([m16.table[0], m16.log, gm16.recs[0], gm16.log]));
            sysNow = Sx.cleanSystem({ v: 1, name: 'F', rolls: [], fields: [{ id: 'f_gr', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Skill', label: 'Skill' }, { key: 'Flaw', label: 'Flaw', vis: 'gm' }], rolls: [{ label: 'Use', formula: '3d6 + Row.Flaw' }] } }], items: [{ id: 'i_p', name: 'Pebbles', stats: { Skill: 19 } }] }, { F: Fx, gmView: true });
            const gmSt = runG([1, 1, 1], 2, '3d6 + Row.Flaw'); sysNow = sysFl;
            check('1.6.0 ... kept private, in true words (net.diceRoll, run for real): a roll that reads a GM-only stat, on a row a player may see, says so, and is not said to be on a GM-only item',
                gmSt.pushed[0] === 'whisper' && gmSt.toasts.length === 1 && /^Kept private: that roll reads a GM-only stat/.test(gmSt.toasts[0]), j([gmSt.pushed, gmSt.toasts]));
            check('1.6.0 a GM-only stat, a Malf that reads it (the real roll-req branch and net.diceRoll): their view has lost the Malf, and the host works it out from the GM\'s view: with Flaw 2 a natural 16 jams and a 15 does not, with none a 16 does not and an 18 does; the card carries only the natural that jammed, nothing of the figure on any other roll, nothing of the stat\'s name is sent, and the GM\'s own card stays public with the same word',
                m16.table[0].malf === 16 && !('malf' in m15.table[0]) && !('malf' in m16n.table[0]) && m18n.table[0].malf === 18 && noWord(m16) && noWord(m15) && gm16.recs[0].malf === 16 && !('malf' in gm15.recs[0]) && j(gm16.pushed[0]) === j(gm15.pushed[0]) && !gm16.recs[0].gm, j([m16.table[0], m15.table[0], gm16.recs[0], gm16.pushed, gm15.pushed]));
        }
        check('1.6.0 a GM-only stat, a player\'s roll (the real roll-req branch): a range that names it is worked out on the host: with Flaw 2 a natural 16 is a critical failure, a 15 no more than a success, and with none a 16 is a success and 18 the failure; the card carries the outcome, a range of 16 only for the 16 rolled and the plain 18 for any other roll, so it tells nothing of the stat, and nothing of its name is in anything sent',
            /critical failure/.test(p16.log) && j(p16.table[0].crit) === j([3, 16]) && !/critical/.test(p15.log) && j(p15.table[0].crit) === j([3, 18]) && !/critical/.test(p16n.log) && j(p16n.table[0].crit) === j([3, 18]) && /critical failure/.test(p18.log) && noWord(p16) && noWord(p15) && noWord(p16n), j([p16.log, p16.table[0], p15.log, p15.table[0], p16n.log, p18.log]));
        {   // a line's damage card names who was hit: areaHit and net.diceRoll, run for real
            const sysL = Sx.cleanSystem({ v: 1, name: 'L', rolls: [{ id: 'r_d', label: 'Beam hit', formula: '2d6', dmg: true }], fields: [{ id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects', vis: 'all' }], effects: [{ id: 'e_r', name: 'Rattled', vis: 'all', mods: [] }, { id: 'e_a', name: 'Slowed', vis: 'all', mods: [], again: 'add' }] }, { F: Fx, gmView: true }), campL = { id: 'k', system: sysL, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: {} }, c_b: { id: 'c_b', name: 'Mara', npc: true, values: {} } } };
            const outL = { sent: [], recs: [], cards: [] }, netL = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {}, damageCard: (c, lines) => outL.cards.push(lines.join(' ')) }; dq = [3, 4];
            const winL = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {}, playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) } };
            new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'sendTableAs', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc)(
                netL, () => Dx, () => Sx, winL, () => campL, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, (rec, ch, on) => outL.sent.push([JSON.parse(JSON.stringify(rec)), on ? [on.ch.id, on.name] : null]), rec => outL.recs.push(JSON.parse(JSON.stringify(rec))), () => {}, () => {});
            const hitL = new Function('net', 'SC', 'window', 'own', fnSrc('function areaHit(', '\n}\n', 'areaHit', 'netattack.js') + '\n}\nreturn areaHit;')(netL, () => Sx, winL, (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k));
            hitL(campL, { to: 'c_b', by: 'c_a', dmg: 'r_d', fx: undefined, row: null, label: 'Beam', gm: false, nm: 'Mara the Tall' }); const namedL = outL.recs[0];
            check('1.6.0 ... a line\'s damage card names who was hit (found by hand on a table: the GM learned it from Apply, a player never): the GM\'s copy carries the name of the token hit, the table\'s copy is handed who it landed on for each player to be judged, and carries no name of its own; a player\'s app keeps the name as text, on a damage roll alone',
                !!namedL && namedL.onName === 'Mara the Tall' && namedL.dmgOn === 'c_b' && outL.sent.length === 1 && !('onName' in outL.sent[0][0]) && j(outL.sent[0][1]) === j(['c_b', 'Mara the Tall']) && Dx.cleanRoll(namedL).onName === 'Mara the Tall' && !('onName' in Dx.cleanRoll(Object.assign({}, namedL, { dmg: undefined, onName: 'x' }))), j([namedL, outL.sent]));
            const daleL = { id: 'u_a', name: 'Dale', gm: false }; outL.sent.length = 0; dq = [2, 5];
            hitL(campL, { to: 'c_b', by: 'c_a', dmg: 'r_d', fx: undefined, row: null, label: 'Beam', gm: false, nm: 'Mara', from: daleL }); const theirL = outL.recs[1];
            const seenL = [], aftL = new Function('SC', 'window', 'isObj0', 'own', 'areaTokens', 'areaHit', 'attemptMake', fnSrc('function areaAfter(', '\n}\n', 'areaAfter', 'netattack.js') + '\n}\nreturn areaAfter;')(() => Sx, { wpFormula: Fx }, o => !!o && typeof o === 'object' && !Array.isArray(o), (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k), () => ['t_b'], (c, h) => seenL.push(['hit', h.from]), (c, e, v, m, rg) => seenL.push(['resist', rg.area.from]));
            const runAft = (over, from) => aftL(campL, Object.assign({ label: 'Beam', area: { reach: '5', width: 1, dmg: 'r_d' } }, over), { kind: 'check', pass: true }, false, { x: 9, y: 0 }, campL.chars.c_a, false, () => undefined, null, { id: 'm1', whiteboard: [{ id: 't_b', charId: 'c_b' }] }, { id: 't_a' }, from);
            runAft({}, daleL); runAft({ resistAll: true, resistBy: 'r_d' }, daleL); runAft({});
            check('1.6.0 a line a player pressed (found by hand: the damage card read the GM\'s name, as Rook, though Dale pressed it): areaAfter (run for real) hands on who pressed, on a hit and on one that waits for a resist, and the GM\'s own press hands on no one; net.diceRoll\'s card and the table\'s copy then read as that player\'s card, which a player\'s app keeps, and the GM\'s own stays the GM\'s; the roll-req branch hands areaAfter the card\'s own sender',
                !!theirL && j(theirL.from) === j(daleL) && j(outL.sent[0][0].from) === j(daleL) && j(Dx.cleanRoll(theirL).from) === j(daleL) && namedL.from.gm === true && namedL.from.name === 'GM' && j(seenL) === j([['hit', daleL], ['resist', daleL], ['hit', null]]) && /tokOwnQ, tokOptQ\) : null, recQ\.from\);   \/\/ 1\.6\.0: a line/.test(src), j([theirL, seenL]));
            outL.sent.length = 0; const recsB = outL.recs.length; dq = [1, 2]; hitL(campL, { to: 'c_b', by: 'c_a', dmg: 'r_d', fx: undefined, row: null, label: 'Beam', gm: false, nm: 'Mara', priv: true }); const privL = outL.recs[recsB], tableL = outL.sent.length;
            const privRun = []; new Function('SC', 'window', 'isObj0', 'own', 'areaTokens', 'areaHit', 'attemptMake', fnSrc('function areaAfter(', '\n}\n', 'areaAfter', 'netattack.js') + '\n}\nreturn areaAfter;')(() => Sx, { wpFormula: Fx }, o => !!o && typeof o === 'object' && !Array.isArray(o), (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k), () => ['t_b'], (c, h) => privRun.push(h.priv === true), () => {})(campL, { label: 'Beam', area: { reach: '5', width: 1, dmg: 'r_d' } }, { kind: 'check', pass: true }, false, { x: 9, y: 0 }, campL.chars.c_a, true, () => undefined, null, { id: 'm1', whiteboard: [{ id: 't_b', charId: 'c_b' }] }, { id: 't_a' }, null);
            check('1.6.0 a line rolled in private keeps its damage cards private (found reading the code: areaHit never got the word, so the card went to the table): areaAfter hands it on, and the card reaches no one at the table', !!privL && privL.priv === 'gm' && tableL === 0 && j(privRun) === j([true]), j([privL && privL.priv, tableL, privRun]));
            const hitFx = fx => hitL(campL, { to: 'c_b', by: 'c_a', fx: fx, label: 'Beam', gm: false, nm: 'Mara' }); hitFx('e_r'); hitFx('e_r'); hitFx('e_a'); hitFx('e_a');
            check('1.6.0 a line\'s Each hit gets, on someone who has it on (found by hand: "Rattled is on"): the card says it is on already, as an action\'s press does; the first hit says it is on; an effect with When added again that took the hit, so news, still says it is on',
                j(outL.cards) === j(['Beam: Rattled is on.', 'Beam: Rattled is on already.', 'Beam: Slowed is on.', 'Beam: Slowed is on.']), j(outL.cards));
        }
        check('1.6.0 a GM-only stat, the GM\'s own roll (the real net.diceRoll): the same range on the same row, so a natural 16 under Flaw 2 is a critical failure for the GM too, the card a table may see carrying the range only as far as that roll needs',
            g16.ret.ok && g16.check.crit === 'fumble' && j(g16.recs[0].crit) === j([3, 16]) && g15.ret.ok && !g15.check.crit && j(g15.recs[0].crit) === j([3, 18]) && !/flaw/i.test(j(g16.recs)), j([g16.check, g16.recs[0], g15.check, g15.recs[0]]));
    }
    const fxgW = runBG(sysB, [1, 1, 2]), fxgF = runBG(sysB, [6, 6, 6]), fxgS = runBG(sysBg, [6, 5, 5]), fxpS = runB(sysBg, [6, 5, 5]), fxgN = runBG(sysBn, [1, 1, 1]);
    check('1.6.0 the GM\'s own roll (net.diceRoll) decides alike: a 4 a critical success by its own range, 18 a critical failure, the record carrying the numbers and net.rollCheck the reading; a range read from a GM-only value (Secret + 14, 16) makes 16 a critical failure for the GM and keeps the roll private, while a player\'s roll reads the Combat tab\'s 18 instead (their view drops it); a system with no rule as before',
        fxgW.ret.ok && j(fxgW.vals) === j({ f_x: 1, f_gd: 3 }) && j(fxgW.recs[0].crit) === j([4, 18]) && fxgW.pushed[0] === 'global' && j(fxgW.check) === j({ pass: true, crit: 'crit', total: 4, target: 12, margin: 8 })
        && j(fxgF.vals) === j({ f_x: 5 }) && j(fxgS.vals) === j({ f_x: 5 }) && j(fxgS.recs[0].crit) === j([3, 16]) && fxgS.pushed[0] === 'whisper' && fxgS.recs[0].priv === 'gm' && fxgS.toasts.some(t => /Secret/.test(t))
        && j(fxpS.vals) === j({}) && j(fxpS.table[0].crit) === j([3, 18]) && j(fxgN.vals) === j({ f_gd: 2 }) && !('crit' in fxgN.recs[0]) && fxgN.pushed[0] === 'global',
        j([fxgW.vals, fxgW.recs[0].crit, fxgW.pushed, fxgW.check, fxgF.vals, fxgS.vals, fxgS.recs[0], fxgS.toasts, fxpS.vals, fxpS.table[0].crit, fxgN.vals]));
    // 1.6.0 (the book's ruling of 2026-10-29): a success at or under a roll's own bigAt lands as a Big Hit, marked on the record by the host, no critical
    const thenG = [{ f: 'f_x', formula: '1', add: true, when: 'crit' }, { f: 'f_gd', formula: 'RollBig * 10 + RollCrit + 2', set: true, when: 'hit' }];
    const sysBig = sysOfB({ bigAt: 'Edge', then: thenG }, { checks: 'fixed' }), sysBigG = sysOfB({ bigAt: 'Secret + 2', then: thenG }, { checks: 'fixed' }), sysBigN = sysOfB({ bigAt: 'Edge', then: thenG }, {});
    const hB = runB(sysBig, [1, 1, 2]), hP = runB(sysBig, [1, 2, 2]), hC = runB(sysBig, [1, 1, 1]), hF = runB(sysBig, [6, 6, 5]), hX = runB(sysBig, [1, 2, 2], { big: true }), hN = runB(sysBigN, [1, 1, 2]), hPg = runB(sysBigG, [1, 1, 2]);
    check('1.6.0 a Big Hit on a player\'s roll (the host\'s roll-req branch): a natural 4 under its own Lands as a Big Hit (Edge, 4) is marked big on the record and is no critical (RollBig 1, RollCrit 0, nothing On a critical success); 5 is plain; a natural 3 is a critical and a Big Hit; a failure never; a big in the player\'s message is never read; it holds under any rule; one read from a GM-only value is dropped from their view',
        hB.table[0].big === true && Dx.cleanRoll(hB.table[0]).big === true && j(hB.vals) === j({ f_gd: 12 }) && j(hB.table[0].crit) === j([3, 18]) && !('big' in hP.table[0]) && j(hP.vals) === j({ f_gd: 2 })
        && hC.table[0].big === true && j(hC.vals) === j({ f_x: 1, f_gd: 13 }) && !('big' in hF.table[0]) && j(hF.vals) === j({}) && !('big' in hX.table[0]) && j(hX.vals) === j({ f_gd: 2 })
        && hN.table[0].big === true && !('crit' in hN.table[0]) && j(hN.vals) === j({ f_gd: 12 }) && !('big' in hPg.table[0]) && j(hPg.vals) === j({ f_gd: 2 }),
        j([hB.table[0], hB.vals, hP.vals, hC.vals, hF.vals, hX.vals, hN.table[0], hN.vals, hPg.vals]));
    const sysThFx = (fx, more) => Sx.cleanSystem({ v: 1, name: 'B', fields: fldB.concat([{ id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects', vis: 'all' }]), effects: [{ id: 'e_r', name: 'Rattled', vis: 'all', mods: [] }, { id: 'e_g', name: 'Hidden', vis: 'gm', mods: [] }], rolls: [{ id: 'r_sg', label: 'Feint', formula: '3d6 <= 12', then: [{ fx: fx, on: true, when: 'hit' }].concat(more || []) }] }, { F: Fx, gmView: true }), hasFx = ref => ({ f_fx: [{ id: 'x_a', ref: ref, on: true }] });
    const moreTh = [{ f: 'f_gd', formula: '2', set: true, when: 'hit' }], tpOn = runB(sysThFx('e_r'), [1, 2, 2], null, hasFx('e_r')), tpGm = runB(sysThFx('e_g'), [1, 2, 2], null, hasFx('e_g')), tgGm = runBG(sysThFx('e_g'), [1, 2, 2], hasFx('e_g')), tpNew = runB(sysThFx('e_r'), [1, 2, 2]), tpMix = runB(sysThFx('e_r', moreTh), [1, 2, 2], null, hasFx('e_r'));
    const tgOn = runBG(sysThFx('e_r'), [1, 2, 2], hasFx('e_r')), tgNew = runBG(sysThFx('e_r'), [1, 2, 2]), tgMix = runBG(sysThFx('e_r', moreTh), [1, 2, 2], hasFx('e_r'));
    check('1.6.0 a roll\'s Then that puts on an effect already on (the host\'s roll-req branch and the GM\'s own net.diceRoll, run for real; found by hand): the roller is told it is on already, in the words an action\'s press uses; a GM-only one, which a player\'s view of the Then never holds, is unnamed to the GM and tells a player nothing; one not on goes on, and a Then with something else to do lands that, both with nothing said',
        j(tpOn.notes) === j([['Rattled is on already.', 'c_a']]) && tpGm.notes.length === 0 && tgGm.toasts.includes('That effect is on already.') && tpNew.notes.length === 0 && tpNew.vals.f_fx[0].ref === 'e_r' && tpMix.notes.length === 0 && tpMix.vals.f_gd === 2
        && tgOn.toasts.includes('Rattled is on already.') && !tgNew.toasts.some(t => /already/.test(t)) && tgNew.vals.f_fx[0].ref === 'e_r' && !tgMix.toasts.some(t => /already/.test(t)) && tgMix.vals.f_gd === 2, j([tpOn.notes, tpGm.notes, tpNew.notes, tpMix.notes, tgOn.toasts, tgNew.toasts, tgMix.toasts]));
    const hG = runBG(sysBig, [1, 1, 2]), hGg = runBG(sysBigG, [1, 1, 2]), hGp = runBG(sysBig, [1, 2, 2]);
    check('1.6.0 a Big Hit on the GM\'s own roll (net.diceRoll): marked on the record with RollBig 1 and no critical; one read from a GM-only value (Secret + 2) still marks it for the GM and keeps the roll private; a plain success carries no mark',
        hG.ret.ok && hG.recs[0].big === true && j(hG.vals) === j({ f_gd: 12 }) && hG.pushed[0] === 'global' && hGg.recs[0].big === true && hGg.recs[0].priv === 'gm' && j(hGg.vals) === j({ f_gd: 12 }) && !('big' in hGp.recs[0]) && hGp.pushed[0] === 'global',
        j([hG.recs[0], hG.vals, hGg.recs[0], hGg.toasts, hGp.recs[0]]));
    // 1.6.0: A Major Wound where (dmgMajorIf) on a damage roll, worked out by the host as it makes the card, from the entry and never from the roller's word
    const sysMj = f => sysOfB({ dmg: true, dmgMajorIf: f }, {}), sysMjW = sysOfB({ dmg: true, dmgMajor: true, dmgMajorIf: 'Edge > 99' }, {}), sysMj0 = sysOfB({ dmg: true }, {});
    const jA = runB(sysMj('Edge >= 4'), [1, 1, 2]), jB = runB(sysMj('Edge >= 5'), [1, 1, 2]), jS = runB(sysMj('Secret >= 2'), [1, 1, 2]), jW = runB(sysMjW, [1, 1, 2]), j0 = runB(sysMj0, [1, 1, 2]), jX = runB(sysMj('Edge >= 5'), [1, 1, 2], { major: 1, dmgMajor: true, dmgMajorIf: 'Edge > 0' });
    check('1.6.0 A Major Wound where on a player\'s damage roll (the host\'s roll-req branch): a formula true for the roller (Edge 4 >= 4) marks the record major 1, one that is false marks nothing; one that reads a GM-only value is dropped from their view and marks nothing; Always a Major Wound still wins; a roll with neither as before; a major, dmgMajor or dmgMajorIf in the player\'s message is never read',
        jA.table.length === 1 && jA.table[0].dmg === 1 && jA.table[0].major === 1 && !('major' in jB.table[0]) && !('major' in jS.table[0]) && jW.table[0].major === 1 && !('major' in j0.table[0]) && j0.table[0].dmg === 1 && !('major' in jX.table[0]),
        j([jA.table[0], jB.table[0], jS.table[0], jW.table[0], j0.table[0], jX.table[0]]));
    const jGA = runBG(sysMj('Edge >= 4'), [1, 1, 2]), jGB = runBG(sysMj('Edge >= 5'), [1, 1, 2]), jGS = runBG(sysMj('Secret >= 2'), [1, 1, 2]), jGW = runBG(sysMjW, [1, 1, 2]), jG0 = runBG(sysMj0, [1, 1, 2]);
    check('1.6.0 A Major Wound where on the GM\'s own damage roll (net.diceRoll): true for the roller marks the record major 1, false nothing; one that reads a GM-only value marks nothing, as a GM-only armor divisor, since the record travels to the table; Always a Major Wound still wins; a roll with neither as before',
        jGA.ret.ok && jGA.recs[0].major === 1 && !('major' in jGB.recs[0]) && !('major' in jGS.recs[0]) && jGW.recs[0].major === 1 && !('major' in jG0.recs[0]) && jG0.recs[0].dmg === 1,
        j([jGA.recs[0], jGB.recs[0], jGS.recs[0], jGW.recs[0], jG0.recs[0]]));
    // 1.6.0 (B3): a damage roll's second part, rolled by the host from the entry as it makes the card (the suite's own dice: the roll's three, then the part's one)
    const typesP = { damage: { types: [{ key: 'cut', label: 'Cutting' }, { key: 'burn', label: 'Burning' }] } };
    const sysP2 = sysOfB({ dmg: true, dmg2: '1d6 + Edge', dtype2: 'burn' }, typesP), sysP2g = sysOfB({ dmg: true, dmg2: 'Secret + 1d6', dtype2: 'burn' }, typesP), sysP20 = sysOfB({ dmg: true }, typesP);
    const kA = runB(sysP2, [1, 1, 2, 5]), kG = runB(sysP2g, [1, 1, 2]), k0 = runB(sysP20, [1, 1, 2], { dmg2: { t: 99 }, dtype2: 'burn', part2: { amt: 9 } }), kX = runB(sysP2, [1, 1, 2, 3], { dmg2: { t: 99, dtype: 'cut' } });
    check('1.6.0 (B3) a second part on a player\'s damage roll (the host\'s roll-req branch): rolled from the entry through their view (1d6 5 + Edge 4 is 9 Burning), on the record and kept by a player\'s cleaner; one read from a GM-only value is dropped from their view and rolls nothing; a roll with none has none; a dmg2, dtype2 or part2 in the player\'s message is never read',
        kA.table.length === 1 && j(kA.table[0].dmg2) === j({ t: 9, n: 1, dtype: 'burn' }) && kA.left === 0 && j(Dx.cleanRoll(kA.table[0]).dmg2) === j({ t: 9, n: 1, dtype: 'burn' })
        && kG.table[0].dmg === 1 && !('dmg2' in kG.table[0]) && kG.left === 0 && !('dmg2' in k0.table[0]) && k0.left === 0 && j(kX.table[0].dmg2) === j({ t: 7, n: 1, dtype: 'burn' }),
        j([kA.table[0], kG.table[0], k0.table[0], kX.table[0]]));
    const kGA = runBG(sysP2, [1, 1, 2, 5]), kGG = runBG(sysP2g, [1, 1, 2, 4]), kG0 = runBG(sysP20, [1, 1, 2]);
    check('1.6.0 (B3) a second part on the GM\'s own damage roll (net.diceRoll): rolled from the entry (9 Burning) and the card public; one read from a GM-only value is rolled for the GM (Secret 2 + 4 is 6) and keeps the card private, since it says the amount; a roll with none as before',
        kGA.ret.ok && j(kGA.recs[0].dmg2) === j({ t: 9, n: 1, dtype: 'burn' }) && kGA.pushed[0] === 'global' && j(kGG.recs[0].dmg2) === j({ t: 6, n: 1, dtype: 'burn' }) && kGG.recs[0].priv === 'gm' && kGG.pushed[0] === 'whisper' && kGG.toasts.some(t => /Secret/.test(t))
        && !('dmg2' in kG0.recs[0]) && kG0.pushed[0] === 'global',
        j([kGA.recs[0], kGG.recs[0], kGG.toasts, kG0.recs[0]]));
    // 1.6.0 (asked by the session that builds a game system): a third and a fourth part, rolled by the host from the entry in slot order (the roll's three, then each part's dice)
    const sysP4 = sysOfB({ dmg: true, dmg2: '1d6', dtype2: 'burn', dmg3: '1d6 + Edge', dtype3: 'cut', dmg4: '2', dtype4: 'burn' }, typesP), sysP4g = sysOfB({ dmg: true, dmg3: 'Secret + 1d6', dtype3: 'burn', dmg4: '1d6' }, typesP);
    const q4A = runB(sysP4, [1, 1, 2, 3, 5]), q4G = runB(sysP4g, [1, 1, 2, 6]), q4X = runB(sysP2, [1, 1, 2, 3], { dmg3: { t: 99 }, dmg4: { t: 98 }, part3: { amt: 9 } });
    check('1.6.0 a third and a fourth part on a player\'s damage roll (the host\'s roll-req branch): each rolled from the entry through their view in slot order (1d6 3 Burning, 1d6 5 + Edge 4 is 9 Cutting, 2 Burning), on the record and kept by a player\'s cleaner; one read from a GM-only value is dropped from their view alone, the others still rolled; a dmg3, dmg4 or part3 in the player\'s message is never read',
        q4A.table.length === 1 && j([q4A.table[0].dmg2, q4A.table[0].dmg3, q4A.table[0].dmg4]) === j([{ t: 3, n: 1, dtype: 'burn' }, { t: 9, n: 1, dtype: 'cut' }, { t: 2, dtype: 'burn' }]) && q4A.left === 0 && j(Dx.cleanRoll(q4A.table[0]).dmg4) === j({ t: 2, dtype: 'burn' })
        && !('dmg3' in q4G.table[0]) && j(q4G.table[0].dmg4) === j({ t: 6, n: 1 }) && q4G.left === 0 && !('dmg3' in q4X.table[0]) && !('dmg4' in q4X.table[0]),
        j([q4A.table[0], q4G.table[0], q4X.table[0]]));
    const q4GA = runBG(sysP4, [1, 1, 2, 3, 5]), q4GG = runBG(sysP4g, [1, 1, 2, 4, 6]);
    check('1.6.0 a third and a fourth part on the GM\'s own damage roll (net.diceRoll): rolled from the entry in slot order and the card public; a third part read from a GM-only value is rolled for the GM and keeps the card private, as a second part\'s does',
        q4GA.ret.ok && j([q4GA.recs[0].dmg2, q4GA.recs[0].dmg3, q4GA.recs[0].dmg4]) === j([{ t: 3, n: 1, dtype: 'burn' }, { t: 9, n: 1, dtype: 'cut' }, { t: 2, dtype: 'burn' }]) && q4GA.pushed[0] === 'global'
        && j(q4GG.recs[0].dmg3) === j({ t: 6, n: 1, dtype: 'burn' }) && j(q4GG.recs[0].dmg4) === j({ t: 6, n: 1 }) && q4GG.recs[0].priv === 'gm' && q4GG.pushed[0] === 'whisper' && q4GG.toasts.some(t => /Secret/.test(t)),
        j([q4GA.recs[0], q4GG.recs[0], q4GG.toasts]));
    // 1.6.0: a blow's kind, worked out by the host from the entry as it makes the card
    const kindsP = { damage: { types: typesP.damage.types, kinds: [{ key: 'close', label: 'Close' }, { key: 'shot', label: 'Shot' }] } };
    const sysKa = sysOfB({ dmg: true, dkind: 'close', dmg2: '1d6', dkind2: 'shot', dmg3: '2' }, kindsP), sysKf = sysOfB({ dmg: true, dkind: 'Edge - 2' }, kindsP), sysKg = sysOfB({ dmg: true, dkind: 'Secret', dmg2: '1', dkind2: 'Secret' }, kindsP), sysK0 = sysOfB({ dmg: true }, kindsP);
    const kdA = runB(sysKa, [1, 1, 2, 5]), kdF = runB(sysKf, [1, 1, 2]), kdG = runB(sysKg, [1, 1, 2]), kdX = runB(sysK0, [1, 1, 2], { dkind: 'close', dmg2: { t: 9, dkind: 'shot' } });
    check('1.6.0 a blow\'s kind on a player\'s damage roll (the host\'s roll-req branch): by key and by a formula through their view (Edge 4 - 2 is Shot), on the record with each part\'s own and kept by a player\'s cleaner; a part with none names none; one read from a GM-only value is dropped from their view and the blow carries none; a dkind in the player\'s message is never read',
        kdA.table.length === 1 && kdA.table[0].dkind === 'close' && j(kdA.table[0].dmg2) === j({ t: 5, n: 1, dkind: 'shot' }) && j(kdA.table[0].dmg3) === j({ t: 2 }) && Dx.cleanRoll(kdA.table[0]).dkind === 'close' && j(Dx.cleanRoll(kdA.table[0]).dmg2) === j({ t: 5, n: 1, dkind: 'shot' })
        && kdF.table[0].dkind === 'shot' && !('dkind' in kdG.table[0]) && j(kdG.table[0].dmg2) === j({ t: 1 }) && kdG.table[0].dmg === 1 && !('dkind' in kdX.table[0]) && kdX.table[0].dmg === 1 && !('dmg2' in kdX.table[0]), j([kdA.table[0], kdF.table[0], kdG.table[0], kdX.table[0]]));
    const kdGA = runBG(sysKa, [1, 1, 2, 5]), kdGG = runBG(sysKg, [1, 1, 2]), kdG0 = runBG(sysK0, [1, 1, 2]);
    check('1.6.0 a blow\'s kind on the GM\'s own damage roll (net.diceRoll): on the record, the card public; a first part\'s kind read from a GM-only value stays off the record, as a GM-only armor divisor, and a part\'s keeps the card private as its amount does; a roll with none as before',
        kdGA.ret.ok && kdGA.recs[0].dkind === 'close' && j(kdGA.recs[0].dmg2) === j({ t: 5, n: 1, dkind: 'shot' }) && kdGA.pushed[0] === 'global' && !('dkind' in kdGG.recs[0]) && j(kdGG.recs[0].dmg2) === j({ t: 1, dkind: 'shot' }) && kdGG.recs[0].priv === 'gm' && kdGG.pushed[0] === 'whisper' && !('dkind' in kdG0.recs[0]) && kdG0.pushed[0] === 'global',
        j([kdGA.recs[0], kdGG.recs[0], kdGG.pushed, kdG0.recs[0]]));
    // 1.6.0 (asked by the session that builds a game system): a fifth part, by its own slot
    const sysP5 = sysOfB({ dmg: true, dmg2: '1', dmg3: '1', dmg4: '1', dmg5: '1d6 + Edge', dtype5: 'burn' }, typesP), sysP5g = sysOfB({ dmg: true, dmg2: '1', dmg5: 'Secret + 1d6', dtype5: 'burn' }, typesP);
    const q5A = runB(sysP5, [1, 1, 2, 5]), q5G = runB(sysP5g, [1, 1, 2]), q5X = runB(sysP2, [1, 1, 2, 3], { dmg5: { t: 99 }, part5: { amt: 9 } }), q5GA = runBG(sysP5, [1, 1, 2, 5]), q5GG = runBG(sysP5g, [1, 1, 2, 4]);
    check('1.6.0 a fifth part on a damage roll: on a player\'s (the host\'s roll-req branch) rolled from the entry through their view (1d6 5 + Edge 4 is 9 Burning), on the record and kept by a player\'s cleaner; one read from a GM-only value dropped from their view; a dmg5 or part5 in the player\'s message never read; on the GM\'s own (net.diceRoll) rolled and the card public, and one read from a GM-only value rolled for the GM and keeping the card private',
        q5A.table.length === 1 && j(q5A.table[0].dmg5) === j({ t: 9, n: 1, dtype: 'burn' }) && q5A.left === 0 && j(Dx.cleanRoll(q5A.table[0]).dmg5) === j({ t: 9, n: 1, dtype: 'burn' }) && !('dmg5' in q5G.table[0]) && q5G.left === 0 && !('dmg5' in q5X.table[0])
        && q5GA.ret.ok && j(q5GA.recs[0].dmg5) === j({ t: 9, n: 1, dtype: 'burn' }) && q5GA.pushed[0] === 'global' && j(q5GG.recs[0].dmg5) === j({ t: 6, n: 1, dtype: 'burn' }) && q5GG.recs[0].priv === 'gm' && q5GG.pushed[0] === 'whisper' && q5GG.toasts.some(t => /Secret/.test(t)),
        j([q5A.table[0], q5G.table[0], q5X.table[0], q5GA.recs[0], q5GG.recs[0], q5GG.toasts]));
})());



// 1.6.0 (the core's gap 8): a player's press of a blast card (the host's blast-roll branch, run for real): the record's id alone, a rate token,
// the press judged by whiteboard.js wpBlastOwedRoll by the player's own profile id, its refusal said to them alone; and the wire's card
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Dx = await import(url('dicecore.js'));
    const brSrc = between('// [netcheck:blastroll-start]', '// [netcheck:blastroll-end]', 'blastroll'), calls = [], sent = [];
    const run = (msg, o) => { o = o || {}; new Function('msg', 'conn', 'net', 'DC', 'peerPaused', 'sendFailed', 'window', 'var charLimit = null;\n' + brSrc)(msg, { peer: 'pB', send: m => { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }, { paused: !!o.paused, roster: { pB: { id: 'u_b', name: 'Bo' } } }, () => Dx, () => !!o.peerPaused, e => { throw e; }, { wpDiceCore: Dx, wpBlastOwedRoll: (att, pid) => { calls.push([att, pid]); return o.res || { ok: true, amt: 3 }; } }); };
    run({ type: 'blast-roll', att: 'a_abcd1234' }); run({ type: 'blast-roll', att: 'a_abcd1234' }, { res: { error: 'That blast roll is not yours to make.' } });
    run({ type: 'blast-roll', att: 'a_ABCD' }); run({ type: 'blast-roll', att: 'a_abcd1234', x: 1 }); run({ type: 'blast-roll', att: 'a_abcd1234' }, { paused: true }); run({ type: 'blast-roll', att: 'a_abcd1234' }, { peerPaused: true });
    check('1.6.0 (the core\'s gap 8) the host\'s blast-roll branch: a press names only the record\'s id, judged by the player\'s own profile id; a refusal goes back to them alone in words; a bad id, any other key, or a paused table or player is nothing',
        JSON.stringify(calls) === JSON.stringify([['a_abcd1234', 'u_b'], ['a_abcd1234', 'u_b']]) && JSON.stringify(sent) === JSON.stringify([{ type: 'blast-deny', msg: 'That blast roll is not yours to make.' }]), JSON.stringify([calls, sent]));
    const dueB = { type: 'due', id: 'r_abcdefgh', from: { id: 'u_gm', name: 'GM', gm: true }, charId: 'c_b', label: 'Frag: 4 dice at 0 yd', why: 'blast', round: 1, roll: 1, att: 'a_abcd1234', ts: 1 }, cdB = Dx.cleanDue(dueB);
    const src4 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    check('1.6.0 (the core\'s gap 8) the wire: a blast card names no roll of the system and keeps its record\'s id, said as due for a blast; one with a roll id, no record, a bad one, or by, m or or beside it is no card; a press is { type, att } alone; the player\'s app says a refusal as text',
        cdB && !('act' in cdB) && cdB.att === 'a_abcd1234' && /Frag: 4 dice at 0 yd is due \(a blast\)/.test(Dx.dueText(cdB)) && Dx.cleanDue(Object.assign({}, dueB, { act: 'r_x' })) === null && Dx.cleanDue(Object.assign({}, dueB, { att: undefined })) === null
        && Dx.cleanDue(Object.assign({}, dueB, { att: 'a_X' })) === null && Dx.cleanDue(Object.assign({}, dueB, { by: 'K' })) === null && Dx.cleanDue(Object.assign({}, dueB, { roll: undefined })) === null && Dx.cleanDue(Object.assign({}, dueB, { why: 'turn' })) === null
        && JSON.stringify(Dx.cleanBlastRoll({ type: 'blast-roll', att: 'a_abcd1234' })) === JSON.stringify({ type: 'blast-roll', att: 'a_abcd1234' }) && Dx.cleanBlastRoll({ type: 'roll-req', att: 'a_abcd1234' }) === null
        && src4.includes("} else if (msg.type === 'blast-deny' && net.role === 'client') {") && src4.includes("net.postBlastDue = function(ch, att, label, toOwner, go) {") && src4.includes("try { net.conns[0].send({ type: 'blast-roll', att: att }); return true; }"), JSON.stringify(cdB));
})());
// 1.6.2 a hidden figure (the owner, 2026-11-01): the host's real roll-req branch and net.diceRoll with the real sends, the real cleaners and a latecomer's history: a roll that reads
// its attacker reaches a player as dice and the host's word, the whole record stays on the GM's machine, and with no setting nothing changes (invented data: Kael, Sela, Brannoch, Pebbles)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx0 = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src4 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src4.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src4.slice(i, src4.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom(', 'function applyLines(', 'function chatHistoryOf('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll'), atSrc = between('// [netcheck:attempt-start]', '// [netcheck:attempt-end]', 'attempt', 'netattack.js');
    const hfSrc = between('// [netcheck:hidefig-start]', '// [netcheck:hidefig-end]', 'hidefig'), nsSrc = between('// [netcheck:npcseen-start]', '// [netcheck:npcseen-end]', 'npcseen'), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply'), stSrc = fnSrc('function sendTable(msg, exceptConn) {', '\n}\n', 'sendTable') + '\n}\n', pcSrc = line('net.postApplyCard = function(') + '\n' + src4.slice(src4.indexOf('net.postApplyCard = function(') + line('net.postApplyCard = function(').length, src4.indexOf('\n};\n', src4.indexOf('net.postApplyCard = function(')) + 4);
    const DUCK = '3d6 <= Will - AttemptMargin', GRIT = '3d6 <= 5 + Attempter.Drill', PLAIN = '3d6 <= Will', WARD = '3d6 <= Row.Def - AttemptMargin', JAM = '3d6 <= Will - AttemptMargin + 20';
    const mk = o => {
        o = o || {}; let dq = []; const Fx = Object.assign({}, Fx0, { evaluate: (e, op) => Fx0.evaluate(e, Object.assign({ random: () => { if (!dq.length) throw new Error('netcheck: no die left'); return dq.shift(); } }, op)) });
        const sys = Sx.cleanSystem({ v: 1, name: 'K', combat: Object.assign({ checks: 'under3d6', targetReads: ['f_dr'] }, o.hide ? { hideResist: true } : {}), fields: [{ id: 'f_wl', key: 'Will', label: 'Will', kind: 'number', vis: 'all', edit: 'owner', def: 12 }, { id: 'f_dr', key: 'Drill', label: 'Drill', kind: 'number', vis: 'all', edit: 'owner', def: 7 }, { id: 'f_mk', key: 'Marks', label: 'Marks', kind: 'number', vis: 'all', edit: 'owner', def: 0 },
            { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Def' }], rolls: [{ label: 'Ward', formula: WARD, resist: true }] } }],
            items: [{ id: 'i_bl', name: 'Blade', stats: { Def: 11 } }],
            rolls: [{ id: 'r_st', label: 'Strike {Drill}', formula: '3d6 <= 13', vis: 'all', resistBy: 'r_dg', resistOr: ['r_gr', 'f_wp#0'] }, { id: 'r_sp', label: 'Spar', formula: '3d6 <= 13', vis: 'all', resistBy: 'r_pl' }, { id: 'r_jm', label: 'Jab', formula: '3d6 <= 13', vis: 'all', resistBy: 'r_jd' }, { id: 'r_bh', label: 'Bash', formula: '2d6 + 1', vis: 'all', dmg: true, resistBy: 'r_dg' },
                { id: 'r_dg', label: 'Duck', formula: DUCK, vis: 'all', resist: true, then: [{ f: 'f_mk', formula: '1d6 + RollMargin', add: true, roll: true, when: 'hit' }] }, { id: 'r_gr', label: 'Grit', formula: GRIT, vis: 'all', resist: true }, { id: 'r_pl', label: 'Plain', formula: PLAIN, vis: 'all', resist: true }, { id: 'r_jd', label: 'Jam', formula: JAM, vis: 'all', resist: true, malf: '17' }] }, { F: Fx, gmView: true });
        const out = { sent: { pA: [], pB: [] }, dues: [], log: [], chat: [], toasts: [] }, aim = { u_a: 't_b', u_b: 't_a', gm: 't_a' }, wide = { to: '' };
        const camp = { id: 'k', activeItemId: 'm1', system: sys, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_bl', defId: 'i_bl', qty: 1 }] } }, c_b: { id: 'c_b', name: 'Sela', ownerId: 'u_b', npc: false, values: {} }, c_n: Object.assign({ id: 'c_n', name: 'Brannoch', ownerId: '', npc: true, values: {} }, o.tick ? { hideFig: true } : {}), c_m: { id: 'c_m', name: 'Pebbles', ownerId: '', npc: true, values: {} } },
            items: { m1: { type: 'map', whiteboard: [{ id: 't_a', charId: 'c_a', ownerId: 'u_a', isChar: true, x: 0, y: 0 }, { id: 't_b', charId: 'c_b', ownerId: 'u_b', isChar: true, x: 50, y: 0 }, { id: 't_n', charId: 'c_n', isChar: true, x: 100, y: 0 }, { id: 't_m', charId: 'c_m', isChar: true, x: 150, y: 0 }] } } };
        const conn = p => ({ peer: p, open: true, send(m) { packCheck(m); out.sent[p].push(JSON.parse(JSON.stringify(m))); } }), cA = conn('pA'), cB = conn('pB');
        const net = { role: 'host', active: true, stream: false, paused: false, conns: [cA, cB], roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' }, pB: { id: 'u_b', name: 'Bo', location: 'm1' } }, combats: {}, syncCharDelta() {}, postDue: (ch, act, kind, round, toOwner, more) => out.dues.push({ ch: ch.id, act: act.id, toOwner: toOwner, att: more && more.att, m: more && more.m, hasM: !!more && more.m !== undefined }) };
        const rng = t => t ? { mod: 0, dist: 2, tid: t, mapId: 'm1' } : null;
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {}, tokenCtxFor: () => aim.gm ? { range: rng(aim.gm) } : null }, wpVtt: { on: () => true, rulesOn: () => true } };
        const W = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'pushRoll', 'pushChat', 'logEvent', 'saveRemoteSoon', 'rangeTo', 'getProfile', 'toast', 'ui', 'save', 'fogDrop', 'applyLine',
            'var diceLimit = null, _diceSlowSaid = {}, _dicePending = null;\n' + helpers + nsSrc + '\n' + stSrc + hfSrc + '\n' + paSrc + '\n' + pcSrc + '\n' + atSrc + '\n' + drSrc + '\nreturn { rq: function(msg, conn) {\ndiceLimit = null; _diceSlowSaid = {};\n' + rqSrc + '\n}, dr: net.diceRoll, rec: function(id) { return _attempts[id]; }, hist: chatHistoryOf, seen: historySeen };')(
            net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, (rec, res, scope) => { out.log.push({ from: rec.from, text: '', scope: scope, ts: rec.ts, roll: rec, res: res }); }, m => { out.chat.push(m); out.log.push(m); }, () => {}, () => {},
            (c, m, l, tok, pid) => rng(aim[pid]), () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), id => id === 'chatTo' && wide.to ? { value: wide.to } : null, () => {}, () => null, () => '');
        const roll = (cn, charId, extra, expr, dice) => { dq = dice.slice(); W.rq(Object.assign({ type: 'roll-req', rid: 'q' + Math.random().toString(36).slice(2, 7), charId: charId, expr: expr }, extra), cn); };
        const gm = (expr, op, dice) => { dq = dice.slice(); return W.dr(expr, op); };
        const strike = (ch, act) => { const n = out.dues.length, was = aim.gm; gm('3d6 <= 13', { charId: ch || 'c_n', act: act || 'r_st', label: 'Strike ' + 7 }, [2, 3, 4]); aim.gm = was; return out.dues.length > n ? out.dues[out.dues.length - 1] : null; };
        const rolls = p => out.sent[p].filter(m => m.type === 'roll'), lastRoll = p => { const r = rolls(p); return r[r.length - 1]; }, whole = () => { const r = out.log.filter(m => m.roll); return r[r.length - 1].roll; };
        return { W, net, camp, out, aim, wide, cA, cB, roll, gm, strike, rolls, lastRoll, whole, Fx };
    };
    const FIG = ['names', 'mods', 'refs', 'crit', 'big', 'aim', 'cov', 'pos', 'dmg', 'margin', 'target', 'm', 'rd', 'k'];
    const clean = m => !!m && m.hid !== undefined && FIG.every(k => !(k in m)) && !/[<>=]|AttemptMargin|Attempter|Attempt\.|Will|Row\.|Drill/.test(m.expr) && !/AttemptMargin|Attempter|Attempt\.kind/.test(j(m));
    const readsOn = m => { const c = Dx.cleanRoll(m), r = c ? Dx.replay(c, Fx0, Fx0.VERSION) : null; return !!r && r.ok; };

    // no setting: as it was
    const W0 = mk(); const d0 = W0.strike(), at0 = W0.W.rec(d0.att); const atkT0 = W0.lastRoll('pA'), atkG0 = W0.whole();
    W0.roll(W0.cA, 'c_a', { act: 'r_dg', att: d0.att, label: 'Duck' }, DUCK, [1, 2, 3, 4]); const ans0 = W0.lastRoll('pA'), ansG0 = W0.whole();
    check('1.6.2 a hidden figure, with no setting: the attack and the answer are sent as the whole record, byte for byte what the GM\'s card holds, the card names the margin, and the attempt holds no mark',
        at0.hide === undefined && d0.hasM && d0.m === 4 && ans0.expr === DUCK && ans0.hid === undefined && ans0.names.some(n => n.name === 'AttemptMargin' && n.value === 4) && j(ans0) === j(ansG0) && j(atkT0) === j(atkG0) && atkT0.expr === '3d6 <= 13' && W0.rolls('pB').length === 2, j([ans0, ansG0, d0]));

    // the system option
    const W1 = mk({ hide: true }); const d1 = W1.strike(), at1 = W1.W.rec(d1.att), atkT1 = W1.lastRoll('pA'), atkG1 = W1.whole();
    W1.roll(W1.cA, 'c_a', { act: 'r_dg', att: d1.att, label: 'Duck' }, DUCK, [1, 2, 3, 4]); const ansA = W1.lastRoll('pA'), ansB = W1.lastRoll('pB'), ansG = W1.whole();
    check('1.6.2 a hidden figure, the system option: the attempt is marked on the host\'s own record alone, its card to a player names no margin, and the mark is on nothing sent',
        at1.hide === true && !d1.hasM && !W1.out.sent.pA.concat(W1.out.sent.pB).some(m => /"hide"|"hideFig"|"rd"/.test(j(m))), j([at1, d1]));
    check('1.6.2 a hidden figure: what every player is sent of the answer is the dice and the host\'s word, nothing it read, no formula and no target; it passes a player\'s cleaner and replays there',
        clean(ansA) && clean(ansB) && ansA.expr === '3d6' && j(ansA.draws) === j([1, 2, 3]) && ansA.hid === 'pass' && ansA.label === 'Duck' && ansA.as === 'Kael' && j(ansA) === j(ansB) && readsOn(ansA), j(ansA));
    check('1.6.2 a hidden figure: the GM\'s own card keeps the whole record, its formula and every figure, and its verdict is the very word the table was sent',
        ansG.expr === DUCK && ansG.names.some(n => n.name === 'AttemptMargin' && n.value === 4) && ansG.names.some(n => n.name === 'Will' && n.value === 12) && ansG.hid === undefined && Dx.verdictOf(W1.out.log.filter(m => m.roll).pop().res, Dx.ruleOf(ansG, 'under3d6')).pass === true, j(ansG));
    const pickA = W1.camp.chars.c_a.values.f_mk, thenS = W1.out.sent.pA.filter(m => m.type === 'apply').concat(W1.out.sent.pB.filter(m => m.type === 'apply')), thenG = W1.out.chat.filter(m => m.apply).map(m => m.apply);
    const W0T = W0.out.sent.pA.filter(m => m.type === 'apply');
    check('1.6.2 a hidden figure: its Then lands on the host as ever, and the card of what it drew says what moved with no figure, no dice and no new value, the GM\'s own card keeping them',
        pickA > 0 && thenS.length > 0 && thenS.every(m => m.lines.every(l => l.s === 1 && l.d === undefined && l.v === undefined && l.roll === undefined) && !!Dx.cleanApply(m)) && thenG.length === 1 && thenG[0].lines[0].d === pickA && thenG[0].lines[0].roll !== undefined && W0T.length > 0 && W0T[0].lines[0].d !== undefined, j([pickA, thenS, thenG]));
    const nAp = W1.out.sent.pB.length; W1.net.postApplyCard(W1.camp.chars.c_a, 'Then', [{ n: 'Marks', d: 5, v: 5, roll: '1d6: 4' }], 'table', true); const wireAp = W1.out.sent.pB.slice(nAp), gmAp = W1.out.chat[W1.out.chat.length - 1].apply;
    const hisA = W1.W.seen(W1.W.hist(W1.out.log), W1.net.roster.pA), hisRolls = hisA.filter(m => m.roll).map(m => m.roll), hisApply = hisA.filter(m => m.apply).map(m => m.apply);
    W1.net.roster.pB.location = 'm_other'; const hisB = W1.W.seen(W1.W.hist(W1.out.log), W1.net.roster.pB).filter(m => m.roll); W1.net.roster.pB.location = 'm1';
    check('1.6.2 a hidden figure: a latecomer\'s history holds the table\'s copies, of the roll and of its Then, the whole record never, and an NPC\'s card still stays from one who cannot see it',
        hisRolls.length === 2 && hisRolls.every(clean) && hisApply.length === 1 && hisApply[0].lines.every(l => l.s === 1 && l.d === undefined) && wireAp.length === 1 && wireAp[0].lines[0].d === undefined && gmAp.lines[0].d === 5 && !hisB.some(m => m.roll.as === 'Brannoch') && hisB.length === 1, j([hisRolls, hisApply, hisB, wireAp]));
    check('1.6.2 a hidden figure: an NPC\'s attack goes the same way, or its margin on the table\'s card would give that figure away: dice and Success, the words of a label cut before what the sheet worked out; the GM\'s card whole; and the one attempt it made goes on',
        clean(atkT1) && atkT1.hid === 'pass' && atkT1.label === 'Strike' && atkT1.as === 'Brannoch' && atkG1.expr === '3d6 <= 13' && atkG1.label === 'Strike 7' && atkG1.hid === undefined, j([atkT1, atkG1]));

    // the GM's tick on one NPC
    const W2 = mk({ tick: true }); const d2 = W2.strike(), at2 = W2.W.rec(d2.att), atkT2 = W2.lastRoll('pA'); W2.roll(W2.cA, 'c_a', { act: 'r_dg', att: d2.att }, DUCK, [1, 2, 3, 4]); const ans2 = W2.lastRoll('pA');
    const d2m = W2.strike('c_m'), at2m = W2.W.rec(d2m.att), atkM = W2.lastRoll('pA'); W2.roll(W2.cA, 'c_a', { act: 'r_dg', att: d2m.att }, DUCK, [1, 2, 3, 4]); const ansM = W2.lastRoll('pA');
    check('1.6.2 a hidden figure, the GM\'s tick: an attack by the NPC that wears it is hidden and so is the answer; another NPC at the same table is as it was', at2.hide === true && clean(atkT2) && clean(ans2) && !d2.hasM && at2m.hide === undefined && d2m.m === 4 && atkM.hid === undefined && atkM.expr === '3d6 <= 13' && ansM.hid === undefined && ansM.expr === DUCK, j([at2, ans2, ansM]));
    const W2p = mk({ tick: true }); W2p.camp.chars.c_a.hideFig = true; W2p.roll(W2p.cB, 'c_b', {}, '3d6', [1, 1, 1]); const nP = W2p.out.dues.length; W2p.roll(W2p.cA, 'c_a', { act: 'r_st', label: 'Strike' }, '3d6 <= 13', [2, 3, 4]); const dP = W2p.out.dues[nP], atP = W2p.W.rec(dP.att);
    check('1.6.2 a hidden figure: the tick counts on an NPC alone, so one left on a sheet a player now holds hides nothing', atP.hide === undefined && dP.m === 4, j([atP, dP]));

    // what reads nothing of the attacker
    const W3 = mk({ hide: true }); const d3 = W3.strike('c_n', 'r_sp'), atk3 = W3.lastRoll('pA'); W3.roll(W3.cA, 'c_a', { act: 'r_pl', att: d3.att }, PLAIN, [1, 2, 3]); const ans3 = W3.lastRoll('pA');
    check('1.6.2 a hidden figure: a roll that reads nothing of the attacker is its roller\'s own, whatever the setting says, and so is an attack that only such a roll answers', ans3.hid === undefined && ans3.expr === PLAIN && ans3.names.length === 1 && atk3.hid === undefined && atk3.expr === '3d6 <= 13', j([ans3, atk3]));
    const W3g = mk({ hide: true }); W3g.camp.chars.c_a.values.f_dr = 9; const n3 = W3g.out.dues.length; W3g.strike(); const d3g = W3g.out.dues[n3]; W3g.roll(W3g.cA, 'c_a', { act: 'r_gr', att: d3g.att }, GRIT, [1, 2, 3]); const ans3g = W3g.lastRoll('pA');
    W3g.strike(); const d3w = W3g.out.dues[W3g.out.dues.length - 1]; W3g.camp.chars.c_a.values.f_wp = [{ id: 'w_bl', defId: 'i_bl', qty: 1 }]; W3g.roll(W3g.cA, 'c_a', { row: { f: 'f_wp', r: 'w_bl', i: 0 }, att: d3w.att }, WARD, [1, 2, 3]); const ans3w = W3g.lastRoll('pA');
    check('1.6.2 a hidden figure: Attempter.<key> and a list\'s roll on a row are hidden alike', clean(ans3g) && ans3g.expr === '3d6' && clean(ans3w) && ans3w.hid === 'pass', j([ans3g, ans3w]));

    // private, a whisper, a jam
    const W4 = mk({ hide: true }); const d4 = W4.strike(); W4.roll(W4.cA, 'c_a', { act: 'r_dg', att: d4.att, priv: 'gm' }, DUCK, [1, 2, 3, 4]); const ans4 = W4.lastRoll('pA'), nB4 = W4.rolls('pB').length;
    check('1.6.2 a hidden figure: a private answer goes to its roller alone as the copy, marked private', clean(ans4) && ans4.priv === 'gm' && W4.lastRoll('pB').label !== 'Duck' && nB4 === 1 && W4.whole().priv === 'gm' && W4.whole().expr === DUCK, j(ans4));
    const W5 = mk({ hide: true }); W5.wide.to = 'pB'; const nA5 = W5.rolls('pA').length; W5.strike(); const wh5 = W5.lastRoll('pB');
    check('1.6.2 a hidden figure: a GM\'s roll whispered to one player goes as the copy, addressed to them', clean(wh5) && wh5.to === 'pB' && W5.rolls('pA').length === nA5 && W5.whole().expr === '3d6 <= 13', j(wh5));
    const W6 = mk({ hide: true }); const d6 = W6.strike('c_n', 'r_jm'); W6.roll(W6.cA, 'c_a', { act: 'r_jd', att: d6.att }, JAM, [6, 6, 5]); const ans6 = W6.lastRoll('pA'); const d6b = W6.strike('c_n', 'r_jm'); W6.roll(W6.cA, 'c_a', { act: 'r_jd', att: d6b.att }, JAM, [1, 2, 3]); const ans6b = W6.lastRoll('pA');
    check('1.6.2 a hidden figure: a jam is said as a jam and a failure, by the roll\'s own total, and a roll that did not jam carries no Malf at all', clean(ans6) && ans6.hid === 'fail' && ans6.malf === 17 && ans6.malfHid === 1 && Dx.malfOf(Dx.cleanRoll(ans6), Dx.replay(Dx.cleanRoll(ans6), Fx0, Fx0.VERSION).result) && clean(ans6b) && !('malf' in ans6b), j([ans6, ans6b]));

    // the GM answering for an NPC, a player's attack, the option on
    const W7 = mk({ hide: true }); const n7 = W7.out.dues.length; W7.aim.u_a = 't_n'; W7.roll(W7.cA, 'c_a', { act: 'r_st', label: 'Strike' }, '3d6 <= 13', [2, 3, 4]); const atk7 = W7.lastRoll('pB'), d7 = W7.out.dues[n7];
    W7.net._attNext = { att: d7.att, charId: 'c_n', act: 'r_dg' }; W7.gm(DUCK, { charId: 'c_n', act: 'r_dg', label: 'Duck' }, [1, 2, 3]); W7.net._attNext = null; const ans7 = W7.lastRoll('pA'), ansG7 = W7.whole();
    check('1.6.2 a hidden figure: the GM\'s own answer for an NPC, against a player\'s attack: the table is sent the copy, the GM keeps the whole record, and the card, the GM\'s, keeps the margin; the player\'s attack stays theirs',
        clean(ans7) && ans7.hid === 'pass' && ansG7.expr === DUCK && ansG7.hid === undefined && d7.hasM && d7.toOwner === false && atk7.expr === '3d6 <= 13' && atk7.hid === undefined, j([ans7, ansG7, d7]));
    const W8 = mk({ tick: true }); const n8 = W8.out.dues.length; W8.aim.u_a = 't_n'; W8.roll(W8.cA, 'c_a', { act: 'r_st', label: 'Strike' }, '3d6 <= 13', [2, 3, 4]); const d8 = W8.out.dues[n8]; W8.net._attNext = { att: d8.att, charId: 'c_n', act: 'r_dg' }; W8.gm(DUCK, { charId: 'c_n', act: 'r_dg' }, [1, 2, 3]); W8.net._attNext = null;
    check('1.6.2 a hidden figure: the tick is on the attacker\'s sheet: a player attacking the NPC that wears it hides nothing', W8.lastRoll('pA').expr === DUCK && W8.lastRoll('pA').hid === undefined, j(W8.lastRoll('pA')));
    const W9 = mk({ hide: true }); W9.aim.gm = 't_b'; W9.strike('c_a'); const atk9 = W9.lastRoll('pB'); W9.aim.gm = 't_a'; W9.gm('2d6 + 1', { charId: 'c_n', act: 'r_bh', label: 'Bash' }, [2, 3]); const dmg9 = W9.lastRoll('pB');
    check('1.6.2 a hidden figure: only a GM\'s character\'s attack goes the same way: the GM pressing a player\'s character\'s attack sends it whole, and a damage roll, which has no check and makes no attempt, keeps its figure and its mark', atk9.expr === '3d6 <= 13' && atk9.hid === undefined && dmg9.expr === '2d6 + 1' && dmg9.dmg === 1 && dmg9.hid === undefined, j([atk9, dmg9]));
    const solo = mk({ hide: true }); solo.net.active = false; const atkS = (solo.gm('3d6 <= 13', { charId: 'c_n', act: 'r_st', label: 'Strike 7' }, [2, 3, 4]), solo.whole());
    check('1.6.2 a hidden figure: nobody at the table, nothing masked and nothing sent', atkS.expr === '3d6 <= 13' && solo.rolls('pA').length === 0, j(atkS));
})());

// Chat cards (owner 2026-09-27): a damage roll's mark — the host puts it on the record from the roll entry its formula matched (a system roll by
// its id, a list's roll by its index), never from the player's word; the GM's own roll from its entry, or this machine's own word (a thrown item's damage)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src4 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src4.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src4.slice(i, src4.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const sysD = Sx.cleanSystem({ v: 1, name: 'D', fields: [{ id: 'f_w', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', list: { rolls: [{ label: 'Hit', formula: 'd6', dmg: true }, { label: 'Aim', formula: 'd20' }] } }],
        rolls: [{ id: 'r_d', label: 'Dmg', formula: '2d6', dmg: true }, { id: 'r_p', label: 'Plain', formula: 'd20' }] }, { F: Fx, gmView: true });
    const chD = () => ({ c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_w: [{ id: 'w_1', own: 1, qty: 1, def: { name: 'Axe' } }] } } });
    const runD = msg => { const out = { table: [], sent: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sysD, chars: chD(), items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta() {} };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, () => {});
        return out; };
    const dA = runD({ act: 'r_d', expr: '2d6' }), dP = runD({ act: 'r_p', expr: 'd20' }), dL = runD({ row: { f: 'f_w', r: 'w_1', i: 0 }, expr: 'd6' }), dL2 = runD({ row: { f: 'f_w', r: 'w_1', i: 1 }, expr: 'd20' });
    const dX = runD({ expr: 'd20', dmg: 1 }), dF = runD({ act: 'r_d', expr: '1d6' });
    check('Chat cards: a player\'s damage roll is marked by the host from the entry its formula matched (a system roll by its id, a list\'s roll by its index); an unmarked entry, a request that claims the mark, or one whose formula does not match its button puts none on the table',
        dA.table.length === 1 && dA.table[0].dmg === 1 && Dx.cleanRoll(dA.table[0]).dmg === 1 && dP.table.length === 1 && !('dmg' in dP.table[0]) && dL.table.length === 1 && dL.table[0].dmg === 1 && dL2.table.length === 1 && !('dmg' in dL2.table[0])
        && dX.table.length === 1 && !('dmg' in dX.table[0]) && dF.table.length === 0, j([dA.table, dP.table, dL.table, dL2.table, dX.table, dF.sent]));
    const runGD = (expr, o) => { const out = { pushed: [] };
        const camp = { id: 'k', system: sysD, chars: chD() };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, (rec, res, scope) => out.pushed.push([scope, rec.dmg === undefined ? null : rec.dmg]), () => {}, () => {});
        out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o)); return out; };
    const gD = runGD('2d6', { act: 'r_d' }), gP = runGD('d20', { act: 'r_p' }), gO = runGD('3d6', { dmg: true }), gL = runGD('d6', { row: { f: 'f_w', r: 'w_1', i: 0 } }), gN = runGD('3d6', { dmg: 1 });
    check('Chat cards: the GM\'s own roll is marked from its entry (a system roll, a list\'s roll) or from this machine\'s own word (true only: a thrown item\'s damage); an unmarked entry is not; a player\'s request to the host never carries the word',
        j(gD.pushed) === j([['global', 1]]) && j(gP.pushed) === j([['global', null]]) && j(gO.pushed) === j([['global', 1]]) && j(gL.pushed) === j([['global', 1]]) && j(gN.pushed) === j([['global', null]]) && !/req\.dmg/.test(src4),
        j([gD.pushed, gP.pushed, gO.pushed, gL.pushed, gN.pushed]));
})());

// owed review F5a2 #1: a GM-only value read through a choice's option (Secret = GMFig, the Longsword picking it) — the GM's public roll of the choice,
// of a visible formula over it, of a column reading Row.Ability and of a pool whose max reads it stays private with its toast; a roll of a plain
// value still goes to the table (net.diceRoll sliced, run for real)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const a2_line = k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); };
    const a2_helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(a2_line).join('\n') + '\n';
    const a2_drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const a2_sys = Sx.cleanSystem({ v: 1, name: 'A2', rolls: [], fields: [
        { id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', def: 12 }, { id: 'f_gm', key: 'GMFig', label: 'G', kind: 'number', vis: 'gm', def: 17 },
        { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Ability', kind: 'pick', def: 'Plain', opts: [{ label: 'Plain', name: 'ST' }, { label: 'Secret', name: 'GMFig' }] }], cols: [{ key: 'Eff', label: 'Eff', formula: 'Row.Ability + 1' }] } },
        { id: 'f_ab', key: 'AtkBonus', label: 'Atk', kind: 'formula', vis: 'all', formula: 'Weapons.Longsword.Ability + 2' },
        { id: 'f_gr', key: 'Grit', label: 'Grit', kind: 'resource', vis: 'all', edit: 'owner', maxFormula: 'Weapons.Longsword.Ability * 2', min: 0, def: 'max' }],
        items: [{ id: 'i_ls', name: 'Longsword', key: 'Longsword', stats: { Ability: 'Secret' } }] }, { F: Fx, gmView: true });
    const a2_runGM = expr => { const out = { pushed: [], toasts: [], table: [] };
        const camp = { id: 'k', system: a2_sys, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_ls', defId: 'i_ls', qty: 1 }] } } } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + a2_helpers + a2_drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, e => { throw e; },
            rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope) => out.pushed.push([scope, rec.priv || '']), () => {}, () => {});
        out.ret = dr(expr, { charId: 'c_a' }); return out; };
    const a2_hid = ['Weapons.Longsword.Ability', 'AtkBonus', 'Weapons.Eff', 'Grit.max'].map(n => [n, a2_runGM('d20 + ' + n)]), a2_pub = a2_runGM('d20 + ST');
    check('F5a2 owed review #1 on the wire: the GM\'s public roll of a choice whose option reads a GM-only value (Weapons.Longsword.Ability), of a visible formula over it (AtkBonus), of a column reading Row.Ability (Weapons.Eff) and of a pool whose max reads it (Grit.max) is kept private with its toast, nothing to the table; d20 + ST still goes to the table',
        a2_hid.every(([n, r]) => r.ret.ok && r.ret.priv === true && j(r.pushed) === j([['whisper', 'gm']]) && r.table.length === 0 && r.toasts.length === 1 && r.toasts[0].indexOf('Kept private: that roll uses a GM-only value (') === 0 && r.toasts[0].indexOf(Sx.nameWord(a2_sys, n)) > 0 && r.toasts[0].indexOf(n) < 0)   // 1.6.3 (finding 42), moved on purpose: named in the sheet's words, never by the formula's name
        && a2_pub.ret.ok && a2_pub.ret.priv === false && j(a2_pub.pushed) === j([['global', '']]) && a2_pub.table.length === 1 && a2_pub.toasts.length === 0, j([a2_hid.map(([n, r]) => [n, r.pushed, r.toasts]), a2_pub.pushed]));
})());
// 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2): a blast's fragmentation is a damage roll applied as it is rolled. The host's own
// word for it (net.diceRoll's used, which only a roll of this machine's names) marks the card Applied, so no Apply to target is offered for it
// again; the record the table is sent carries no such key once a player's app has cleaned it (net.diceRoll sliced and run for real)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const fu_line = k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); };
    const fu_helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(fu_line).join('\n') + '\n';
    const fu_drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const fu_sys = Sx.cleanSystem({ v: 1, name: 'FU', rolls: [], fields: [{ id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', def: 12 }] }, { F: Fx, gmView: true });
    const fu_run = o => { const out = { pushed: [], table: [] };
        const camp = { id: 'k', system: fu_sys, chars: { c_a: { id: 'c_a', name: 'Pebbles', ownerId: 'u_a', npc: false, values: {} } } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + fu_helpers + fu_drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; },
            rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, rec => out.pushed.push(JSON.parse(JSON.stringify(rec))), () => {}, () => {});
        out.ret = dr('1d6', Object.assign({ charId: 'c_a', label: 'Spike fragmentation' }, o)); return out; };
    const fuUsed = fu_run({ dmg: true, used: true }), fuDmg = fu_run({ dmg: true }), fuOnly = fu_run({ used: true }), fuWord = fu_run({ dmg: true, used: 'yes' });
    const seen = fuUsed.table[0] ? Dx.cleanRoll(fuUsed.table[0]) : null;
    check('1.5.9 (es) a blast\'s fragmentation card is already applied (net.diceRoll, run for real as the host): a damage roll this machine marks used is drawn Applied on the host\'s own card, a damage roll with no such word, a roll that is no damage roll and a word that is not true mark nothing, and the record a player\'s app cleans holds no such key',
        fuUsed.ret.ok && fuUsed.pushed[0] && fuUsed.pushed[0].dmg === 1 && fuUsed.pushed[0].dmgUsed === 1 && !!seen && seen.dmg === 1 && seen.dmgUsed === undefined
        && fuDmg.pushed[0].dmg === 1 && fuDmg.pushed[0].dmgUsed === undefined && fuOnly.pushed[0].dmg === undefined && fuOnly.pushed[0].dmgUsed === undefined && fuWord.pushed[0].dmgUsed === undefined,
        j([fuUsed.pushed, seen, fuDmg.pushed, fuOnly.pushed]));
})());
// owed review F5b: the GM's own roll on a row while hosting (net.diceRoll sliced and run for real) — a column reading a GM-only value, a choice's
// option naming one, a column a GM-only effect moves (one and two columns deep), twelve columns deep (a list's most) to a choice or to that effect, a visible item's row
// on a GM-only list, and a curse the GM keeps on while its owner sees it off each stay the GM's, with a toast, and nothing reaches the table; a plain
// row roll and a row switched on as usual go to the table; the owner's own roll on the kept-on row stays public and reads what they hold (roll-req)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const b5_src = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const b5_line = k => { const i = b5_src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return b5_src.slice(i, b5_src.indexOf('\n', i)); };
    const b5_helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(b5_line).join('\n') + '\n';
    const b5_dr = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll'), b5_rq = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'));
    const b5_runGM = (sys, ch, expr, o) => { const out = { table: [], pushed: [], toasts: [] };
        const camp = { id: 'k', system: sys, chars: { [ch.id]: JSON.parse(JSON.stringify(ch)) } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + b5_helpers + b5_dr + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), () => null, e => { throw e; },
            rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope) => out.pushed.push([scope, rec.priv || '', (rec.names || []).map(n => n.name + '=' + n.value)]), () => {}, () => {});
        out.ret = dr(expr, Object.assign({ charId: ch.id }, o)); return out; };
    const b5_runReq = (sys, ch, msg) => { const out = { table: [], sent: [], pushed: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sys, chars: { [ch.id]: JSON.parse(JSON.stringify(ch)) }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: ch.ownerId, name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta() {} };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + b5_helpers + b5_rq)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: ch.id }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; },
            rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope) => out.pushed.push([scope, rec.priv || '']), () => {}, () => {});
        return out; };
    const b5_priv = (r, t) => !!r.ret && r.ret.ok === true && r.ret.priv === true && r.table.length === 0 && r.pushed.length === 1 && r.pushed[0][0] === 'whisper' && r.pushed[0][1] === 'gm' && r.toasts.length === 1 && (t instanceof RegExp ? t.test(r.toasts[0]) : r.toasts[0] === t);
    const b5_pub = r => !!r.ret && r.ret.ok === true && r.ret.priv === false && r.table.length === 1 && !('priv' in r.table[0]) && r.pushed.length === 1 && r.pushed[0][0] === 'global' && r.pushed[0][1] === '' && r.toasts.length === 0;
    // S1, S2, S5: a list whose Sly column reads GMFig and whose Grip choice has an option naming GMFig (the list's names derive from a GM-only value);
    // S3, S4, S2e and the control: the same list without either (Grip: Strong = ST only), so only a GM-only effect on ST can make a roll the GM's
    const b5_raw = { v: 1, name: 'P', rolls: [], fields: [
        { id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', def: 10 }, { id: 'f_gm', key: 'GMFig', label: 'G', kind: 'number', vis: 'gm', def: 5 }, { id: 'f_fx', key: 'Effects', kind: 'effects', vis: 'all' },
        { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { lvl: { label: 'Level', min: 0, max: 9, def: 1 },
            stats: [{ key: 'Acc' }, { key: 'Grip', kind: 'pick', opts: [{ label: 'Strong', name: 'ST' }, { label: 'Secret', name: 'GMFig' }] }],
            cols: [{ key: 'Sly', label: 'Sly', formula: 'Row.lvl + GMFig' }, { key: 'Hit', label: 'Hit', formula: 'Row.Acc + ST' }, { key: 'Deep', label: 'Deep', formula: 'Row.Hit + 1' }] } },
        { id: 'f_se', key: 'Secret', label: 'Secret', kind: 'item-list', vis: 'gm', edit: 'owner', list: { rolls: [{ label: 'Hush', formula: 'd6' }] } }],
        items: [{ id: 'i_bl', name: 'Blaster', stats: { Acc: 3, Grip: 'Secret' } }],
        effects: [{ id: 'e_curse', name: 'Curse', vis: 'gm', mods: [{ f: 'f_st', op: 'add', v: -3 }] }] };
    const b5_rawN = JSON.parse(JSON.stringify(b5_raw)); b5_rawN.fields[3].list.cols = b5_rawN.fields[3].list.cols.filter(c => c.key !== 'Sly'); b5_rawN.fields[3].list.stats[1].opts = [{ label: 'Strong', name: 'ST' }]; b5_rawN.items[0].stats.Grip = 'Strong';
    const b5_sys = Sx.cleanSystem(b5_raw, { F: Fx, gmView: true }), b5_sysN = Sx.cleanSystem(b5_rawN, { F: Fx, gmView: true });
    const b5_ch = fx => ({ id: 'c_b', name: 'Bo', ownerId: 'u_b', npc: false, values: { f_wp: [{ id: 'w_b', defId: 'i_bl', qty: 1, lvl: 2 }], f_se: [{ id: 'w_s', defId: 'i_bl', qty: 1 }], f_fx: fx ? [{ id: 'x_1', ref: 'e_curse', on: true }] : [] } });
    const b5_row = (lb, f, r) => ({ label: 'Blaster · ' + lb, row: { f: f || 'f_wp', r: r || 'w_b' } });
    const b5_S1 = b5_runGM(b5_sys, b5_ch(false), 'd20 + Row.Sly', b5_row('Sneak')), b5_S2 = b5_runGM(b5_sys, b5_ch(false), 'd6 + Row.Grip', b5_row('Grip')), b5_S2e = b5_runGM(b5_sysN, b5_ch(true), 'd6 + Row.Grip', b5_row('Grip'));
    const b5_S3 = b5_runGM(b5_sysN, b5_ch(true), 'd20 + Row.Hit', b5_row('Attack')), b5_S4 = b5_runGM(b5_sysN, b5_ch(true), 'd20 + Row.Deep', b5_row('Deep'));
    const b5_S5 = b5_runGM(b5_sys, b5_ch(false), 'd6', b5_row('Hush', 'f_se', 'w_s')), b5_P = b5_runGM(b5_sysN, b5_ch(false), 'd20 + Row.Hit', b5_row('Attack'));
    check('owed F5b the GM\'s own row roll, hosting (net.diceRoll run for real): a column reading GMFig (S1), a choice whose option names GMFig (S2), a column a GM-only effect moves (S3) or two columns down to it (S4), a choice whose option names ST under that effect (S2e) and a visible item\'s row on a GM-only list (S5) each go to the GM alone (whisper, priv gm) with one toast that says why, and nothing reaches the table; the same row\'s plain Row.Hit with no effect on goes to the table (Row.Hit = 13)',
        b5_priv(b5_S1, /^Kept private: that roll uses a GM-only value \((.*, )?G\b/) && b5_priv(b5_S2, /^Kept private: that roll uses a GM-only value \((.*, )?G\b/)
        && b5_priv(b5_S2e, /^Kept private: a GM-only effect changes .*\bST\b/) && b5_priv(b5_S3, /^Kept private: a GM-only effect changes .*\bST\b/) && b5_priv(b5_S4, /^Kept private: a GM-only effect changes .*\bST\b/)
        && b5_priv(b5_S5, 'Kept private: that roll is on a GM-only item or list (Blaster · Hush).') && b5_pub(b5_P) && j(b5_P.pushed[0][2]) === j(['Row.Hit=13']),
        j([b5_S1.pushed, b5_S1.toasts, b5_S2.pushed, b5_S2.toasts, b5_S2e.pushed, b5_S2e.toasts, b5_S3.pushed, b5_S3.toasts, b5_S4.pushed, b5_S4.toasts, b5_S5.pushed, b5_S5.toasts, b5_P.pushed, b5_P.toasts]));
    // twelve columns deep (a list's most since 1.5.4, six before): A reads Row.B, … the last reads a choice whose option names GMFig, ST under the GM-only effect, or a choice naming ST under it
    const b5_chain = (base, end) => { const ks = ['A', 'B', 'C', 'D', 'E', 'G2', 'H2', 'I2', 'J2', 'K2', 'L2', 'M2'], r = JSON.parse(JSON.stringify(base));
        r.fields[3].list.cols = ks.map((k, i) => ({ key: k, label: k, formula: i < ks.length - 1 ? 'Row.' + ks[i + 1] : end })); return Sx.cleanSystem(r, { F: Fx, gmView: true }); };
    const b5_c6 = b5_chain(b5_raw, 'Row.Grip'), b5_e6 = b5_chain(b5_rawN, 'ST'), b5_g6 = b5_chain(b5_rawN, 'Row.Grip');
    const b5_C6 = b5_runGM(b5_c6, b5_ch(false), 'd20 + Row.A', b5_row('Attack')), b5_E6 = b5_runGM(b5_e6, b5_ch(true), 'd20 + Row.A', b5_row('Attack')), b5_G6 = b5_runGM(b5_g6, b5_ch(true), 'd20 + Row.A', b5_row('Attack')), b5_E6off = b5_runGM(b5_e6, b5_ch(false), 'd20 + Row.A', b5_row('Attack'));
    check('owed F5b a GM-only value twelve columns down (a list\'s most since 1.5.4) stays the GM\'s: a chain of twelve columns ending in a choice whose option names GMFig, in ST under a GM-only effect, or in a choice whose option names ST under it keeps the GM\'s roll private (every column is followed, not four); the same chain with no effect on goes to the table (Row.A = 10)',
        b5_c6.fields[3].list.cols.length === 12 && b5_priv(b5_C6, /^Kept private: that roll uses a GM-only value \((.*, )?G\b/) && b5_priv(b5_E6, /^Kept private: a GM-only effect changes .*\bST\b/) && b5_priv(b5_G6, /^Kept private: a GM-only effect changes .*\bST\b/)
        && b5_pub(b5_E6off) && j(b5_E6off.pushed[0][2]) === j(['Row.A=10']), j([b5_C6.pushed, b5_C6.toasts, b5_E6.pushed, b5_E6.toasts, b5_G6.pushed, b5_G6.toasts, b5_E6off.pushed, b5_E6off.toasts]));
    // a curse the GM keeps on: the player switched it off (applyRowOp, run for real) — their copy reads it off (Row.Hit 1), the GM's on (3)
    const b5_rawK = { v: 1, name: 'K', rolls: [], fields: [
        { id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', def: 10 },
        { id: 'f_gr', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { on: { label: 'Worn' }, stats: [{ key: 'Acc' }], cols: [{ key: 'Hit', label: 'Hit', formula: 'Row.Acc + Row.on * 2' }] } }],
        items: [{ id: 'i_ring', name: 'Ring', eq: 'curse', eqMsg: 'It clings', stats: { Acc: 1 } }] };
    const b5_sysK = Sx.cleanSystem(b5_rawK, { F: Fx, gmView: true }), b5_pvK = Sx.cleanSystem(b5_sysK, { F: Fx, gmView: false });
    const b5_chOn = { id: 'c_k', name: 'Bo', ownerId: 'u_b', npc: false, values: { f_gr: [{ id: 'w_r', defId: 'i_ring', qty: 1, on: true }] } };
    const b5_op = Sx.applyRowOp(b5_sysK, JSON.parse(JSON.stringify(b5_chOn)), 'f_gr', { op: 'set', rowId: 'w_r', facts: { on: false } }, Fx, { player: true, view: b5_pvK });
    const b5_chK = JSON.parse(JSON.stringify(b5_chOn)); b5_chK.values.f_gr = b5_op && b5_op.ok ? b5_op.value : [];
    const b5_ring = lb => ({ label: 'Ring · ' + lb, row: { f: 'f_gr', r: 'w_r' } });
    const b5_K1 = b5_runGM(b5_sysK, b5_chK, 'd20 + Row.Hit', b5_ring('Attack')), b5_K2 = b5_runGM(b5_sysK, b5_chK, 'd6 + Row.on', b5_ring('Worn')), b5_KOn = b5_runGM(b5_sysK, b5_chOn, 'd20 + Row.Hit', b5_ring('Attack'));
    const b5_KQ = b5_runReq(b5_sysK, b5_chK, { expr: 'd20 + Row.Hit', label: 'Ring · Attack', row: { f: 'f_gr', r: 'w_r' } });
    check('owed F5b a curse the GM keeps on (its owner switched it off: stored on, keptOn 1): the GM\'s roll of that row (Row.Hit, Row.on) stays the GM\'s with "its owner sees that item switched off", nothing to the table; the same row switched on as usual goes to the table (Row.Hit = 3); the owner\'s own roll on it through the host stays public and reads their copy (Row.Hit = 1)',
        j(b5_chK.values.f_gr.map(r => [r.on, r.keptOn])) === j([[true, 1]])
        && b5_priv(b5_K1, 'Kept private: its owner sees that item switched off (Ring · Attack).') && b5_priv(b5_K2, 'Kept private: its owner sees that item switched off (Ring · Worn).')
        && b5_pub(b5_KOn) && j(b5_KOn.pushed[0][2]) === j(['Row.Hit=3'])
        && b5_KQ.table.length === 1 && !('priv' in b5_KQ.table[0]) && j(b5_KQ.table[0].names) === j([{ name: 'Row.Hit', value: 1 }]) && j(b5_KQ.pushed) === j([['global', '']]) && !b5_KQ.sent.some(m => m.type === 'roll-deny' || m.type === 'roll'),
        j([b5_chK.values.f_gr, b5_K1.pushed, b5_K1.toasts, b5_K2.pushed, b5_K2.toasts, b5_KOn.pushed, b5_KQ.table, b5_KQ.sent, b5_KQ.pushed]));
})());

// From netcheck.js's closing block ("Finishing the test split", step 6), where it ran after every pending check (it leans on none of them):
    {   // 1.6.0 (the owner: "Row removed, with Undo"): rows a player's press used up — the host keeps each for its Undo and tells that connection first
        const rgS = between('// [netcheck:rowgone-start]', '// [netcheck:rowgone-end]', 'rowgone'), sent = [], logs = [], grace = {}, conn = { send: m => sent.push(JSON.parse(JSON.stringify(m))) };
        const api = new Function('net', '_rowGrace', 'window', 'sendFailed', rgS + '\nreturn { rowGoneTell: rowGoneTell, fxNow: fxNow };')(
            { charInCombat: id => id === 'c_in' }, grace, { wpSystemCore: { LIMITS: { undoGraceMs: 9000 } }, wpStepLog: (a, s, f) => logs.push([a, s, f]) }, e => { throw e; });
        const ch = { id: 'c_a', values: { f_kit: [{ id: 'w_2', qty: 1 }] } }, t0 = Date.now();
        const n1 = api.rowGoneTell('c_a', ch, [{ f: 'f_kit', r: 'w_1', row: { id: 'w_1', qty: 1 }, at: 0 }, { f: 'f_kit', r: 'w_9' }, null], conn), g = grace['c_a|f_kit|w_1|gone'];
        const n0 = [api.rowGoneTell('c_a', ch, [], conn), api.rowGoneTell('c_a', ch, null, conn), api.rowGoneTell('c_a', null, [{ f: 'f_kit', r: 'w_1', row: {} }], conn)];
        const fx = [api.fxNow('c_in', null), api.fxNow('c_a', { ch: { id: 'c_in' } }), api.fxNow('c_a', null)];
        check('1.6.0 a used-up row\'s Undo on the host (rowGoneTell, run for real): the row is kept as the sheet\'s minus keeps one (the row as it was, its place, the list as the press left it, the window), the connection is told the row by list and id only, before the change lands, and the step is logged; nothing for no row, no character or a row with nothing kept; fxNow hands the host\'s clock and whether each character is in a fight',
            n1 === 1 && !!g && j(g.row) === j({ id: 'w_1', qty: 1 }) && g.at === 0 && g.after === j([{ id: 'w_2', qty: 1 }]) && g.until >= t0 + 9000 && g.added === 0 && Object.keys(grace).length === 1
            && j(sent) === j([{ type: 'row-gone', charId: 'c_a', items: [{ f: 'f_kit', r: 'w_1' }] }]) && j(logs) === j([['rowgone v1', 'host-kept', { n: 1 }]]) && j(n0) === j([0, 0, 0])
            && fx[0].inCombat === true && fx[0].onInCombat === false && fx[1].inCombat === false && fx[1].onInCombat === true && fx[2].inCombat === false && typeof fx[2].now === 'number', j([n1, g, sent, logs, fx]));
        const flatR = src;
        check('1.6.0 the wiring of a used-up row\'s Undo (source): char-apply tells the presser after its ack and before its delta; a player\'s roll whose Then used a row up the same, before its delta; the GM\'s own roll hands it to the sheet once stored; the three hand applyAct the clock an effect starts by; a player\'s app takes row-gone from the synced host only, cleaned, and hands each row to the sheet; an apply card\'s line may say an effect on or off, here and on the bare copy',
            /try \{ conn\.send\(\{ type: 'char-ack', rid: qa\.rid \}\); \} catch \(e\) \{ sendFailed\(e\); \}\n        if \(resA\.gone && typeof rowGoneTell === 'function'\) rowGoneTell\(qa\.charId, chA, resA\.gone, conn\);[^\n]*\n        if \(ownA\) \{ net\.syncCharDelta/.test(flatR)
            && flatR.includes("saveRemoteSoon(); if (taQ.gone && !(typeof pressQ !== 'undefined' && pressQ) && typeof rowGoneTell === 'function') rowGoneTell(q.charId, chQ, taQ.gone, conn); net.syncCharDelta(q.charId, taQ.values);")
            && flatR.includes("window.wpSheets.goneLocal(chR.id, taR.gone); }, 0);") && (flatR.match(/typeof fxNow === 'function' \? fxNow\(/g) || []).length === 5 /* 1.6.2: and the host's run of a Then's hidden steps, thenGmRun, and a waiting Then the GM applies, toGmApply (HR1) (moved on purpose) */
            && flatR.includes("if (msg.type === 'row-gone') { var rgC = typeof SC2.cleanRowGone === 'function' ? SC2.cleanRowGone(msg) : null; if (!rgC) return;") && /msg\.type === 'char-deny' \|\| msg\.type === 'row-gone'\) && net\.role === 'client'\) \{\n        \/\/ \[netcheck:charin-start\]\n[^\n]*\n        if \(!net\.foreign \|\| conn\.peer !== net\.syncedPeer/.test(flatR)
            && flatR.includes("if (l.fx === 1 || l.fx === 0) { var oF = { n: String(l.n).slice(0, 60), fx: l.fx }; if (typeof l.roll === 'string' && l.roll) oF.roll = l.roll.slice(0, 60); return oF; }") /* 1.6.0 (a builder audit): an effect's line keeps the words of which time was kept (moved on purpose) */ && require('./checkkit').part('netfight.js').includes("lines: rec.lines.map(function(l, i) { if (l.fx === 1 || l.fx === 0) return { n: l.n, fx: l.fx };"));
    }

T.finish();
