/* netrollcheck.js: rolls and apply actions on the host, the tests that came out of netcheck.js with their area
   (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split", step 5, 2026-11-19), each block word for word with the comment that heads it.
   What it covers, each block as it stood in netcheck.js: the HUDs' roll history (HF3), a roll reading CombatRound (HF5b), roll switches
   in the ± window, Specialties and Never untrained, derived GM-only values in the GM's own roll, GM-only rolls (a throw from the GM's
   sheet), the apply action on the wire (H7) and a list's (H7b), a change on every row of a list and one reading each row's names, an
   effect already on, a roll's consequences (R1), a round fired landing by the roll's verdict (1.5.9), a burst, rolls unheld entries, a
   Rolled amount, an entry used on an adjacent character, a list roll's consequences and needs (R2b), and fold 2 of SITE_EQUIVALENT_PLAN
   with the cases of m410.
   It reads the joined net.js through srcjoin, as netcheck did.
   Run: node tools/netrollcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, fnSrc, ordersSrc } = kit.netSlices('netrollcheck');
const j = JSON.stringify;

// Stage 6 HUD frame (HF3): the HUDs' roll history — a local ring of what this machine saw, tagged here with the character; no wire change
{
    const rtSrc = between('// [netcheck:rolltag-start]', '// [netcheck:rolltag-end]', 'rolltag');
    // env: the active campaign (its id and characters), this machine's profile id, the dice's label cap, and the HUD hook's calls
    const mk = (chars, myId) => {
        const env = { camp: { id: 'k1', chars: chars || {} }, fired: [], net: { myId: myId || 'u_me' } };
        const win = { wpSheets: { rolled: (m, cid) => env.fired.push([m ? m.roll.id : null, cid]) }, wpDiceCore: { LIMITS: { label: 60 } } };
        Object.assign(env, new Function('getActiveCampaign', 'window', 'net', rtSrc + '\nreturn { ringPush, ringRepaint, ringReset, tagByName, chatHistoryOf, ring: function() { return rollRing; } };')(() => env.camp, win, env.net));
        return env;
    };
    const ME = { id: 'u_me', name: 'Me', gm: false }, GM = { id: 'u_gm', name: 'GM', gm: true }, MATE = { id: 'u_mate', name: 'Mate', gm: false };
    const R = (id, ts, as, from, scope) => ({ from: from || ME, text: '', scope: scope || 'global', ts, roll: { id, ts, as, expr: '1d20', from: from || ME }, res: { ok: true }, rollBad: null, toName: '' });
    const ids = l => l.map(x => x.roll.id).join(',');
    const e1 = mk();
    ['c_bren', 'bad', '__proto__', 'c_' + 'x'.repeat(25), 7, undefined].forEach((cid, i) => e1.ringPush(R('r' + i, 100 + i, 'Bren'), cid));
    check('HF3 ring: only a valid character id is kept as the tag (with no character of that name here, anything else is untagged); seq rises by one per roll; every live roll fires the HUD hook with its tag',
        j(e1.ring().map(e => e.cid)) === j(['c_bren', '', '', '', '', '']) && j(e1.ring().map(e => e.seq)) === j([1, 2, 3, 4, 5, 6]) && e1.net.rollSeq() === 6
        && e1.fired.length === 6 && j(e1.fired[0]) === j(['r0', 'c_bren']) && e1.fired[1][1] === '', j([e1.ring().map(e => e.cid), e1.fired]));
    const e2 = mk();
    e2.ringPush(R('a', 100), 'c_a'); e2.ringPush(R('c', 300), 'c_a'); e2.fired.length = 0;
    e2.ringPush(R('b', 200, 'Ana'), '', true); e2.ringPush(R('z', 50, 'Ana'), '', true); e2.ringPush(R('b', 200, 'Ana'), '', true); e2.ringPush(R('a', 100), '', true);
    check('HF3 ring: the join\'s history lands in time order, fires no hook (no NEW), and never doubles a roll already there — an earlier replay or a live roll (still in the ring after the chat let it go)',
        j(e2.ring().map(e => e.m.roll.id)) === j(['z', 'a', 'b', 'c']) && e2.fired.length === 0 && e2.ring().filter(e => e.replay).length === 2 && e2.ring().filter(e => e.m.roll.id === 'a').length === 1 && e2.ring()[1].replay === false, j([e2.ring().map(e => e.m.roll.id), e2.fired]));
    // tagging on arrival: the one character here a roll can have been made as (any of that name for the GM, else one its sender owns)
    const chars = { c_mine: { id: 'c_mine', name: 'Joss', ownerId: 'u_me' }, c_mate: { id: 'c_mate', name: 'Joss', ownerId: 'u_mate' }, c_bren: { id: 'c_bren', name: 'Bren', ownerId: 'u_me' }, c_npc: { id: 'c_npc', name: 'Orc' }, c_twin: { id: 'c_twin', name: 'Orc' }, bad_id: { name: 'Bren', ownerId: 'u_me' } };
    const e3 = mk(chars);
    e3.ringPush(R('m1', 10, 'Joss', ME), ''); e3.ringPush(R('t1', 20, 'Joss', MATE), ''); e3.ringPush(R('g1', 30, 'Bren', GM), ''); e3.ringPush(R('g2', 40, 'Joss', GM), ''); e3.ringPush(R('g3', 50, 'Orc', GM), ''); e3.ringPush(R('x1', 60, 'Bren', MATE), ''); e3.ringPush(R('p1', 70, undefined, ME), '');
    check('HF3 ring: another machine\'s roll is tagged on arrival — its sender\'s own character of that name, any of that name for the GM\'s roll; none or several (two named Joss for the GM, two NPCs named Orc), a sender who owns none of that name, or no "as" leave it untagged; a key that is not a character id is never a tag',
        j(e3.ring().map(e => e.cid)) === j(['c_mine', 'c_mate', 'c_bren', '', '', '', '']) && e3.tagByName({ roll: { as: 'Bren' }, from: ME }) === 'c_bren', j(e3.ring().map(e => e.cid)));
    check('HF3 rollsFor: newest first; a tagged roll lists for its character only; an untagged one by its name only when the GM or this machine\'s own player made it — a teammate\'s roll as a same-named character of theirs never shows in mine',
        ids(e3.net.rollsFor('c_mine', 'Joss', 0, 10)) === 'g2,m1' && ids(e3.net.rollsFor('c_mate', 'Joss', 0, 10)) === 'g2,t1' && ids(e3.net.rollsFor('c_bren', 'Bren', 0, 10)) === 'g1'
        && ids(e3.net.rollsFor('c_npc', 'Orc', 0, 10)) === 'g3' && ids(e3.net.rollsFor('c_zz', 'Zed', 0, 10)) === '' && ids(e3.net.rollsFor('c_zz', '', 0, 10)) === '', j([ids(e3.net.rollsFor('c_mine', 'Joss', 0, 10)), ids(e3.net.rollsFor('c_bren', 'Bren', 0, 10))]));
    chars.c_bren.name = 'Brennan';
    check('HF3 rollsFor: a roll tagged on arrival stays with its character after a rename (the GM\'s roll as Bren still lists for Brennan; a later character given the old name does not take it)',
        ids(e3.net.rollsFor('c_bren', 'Brennan', 0, 10)) === 'g1' && ids(e3.net.rollsFor('c_new', 'Bren', 0, 10)) === '');
    check('HF3 rollsFor: honors max (1..100, default 10) and a Clear\'s seq mark', ids(e3.net.rollsFor('c_mine', 'Joss', 0, 1)) === 'g2' && ids(e3.net.rollsFor('c_mine', 'Joss', 3, 10)) === 'g2' && e3.net.rollsFor('c_mine', 'Joss', 0, 0).length === 2);
    e3.camp = { id: 'k2', chars };
    check('HF3 rollsFor: another campaign\'s rolls never show', e3.net.rollsFor('c_mine', 'Joss', 0, 10).length === 0);
    const e4 = mk();
    e4.ringPush(R('old', 5000, 'Ana'), 'c_a'); const mark = e4.net.rollSeq(); e4.ringPush(R('skew', 1000, 'Ana'), 'c_a');
    const got = e4.net.rollsFor('c_a', 'Ana', mark, 10);
    check('HF3 rollsFor: a Clear, then a live roll with an OLDER host clock, still shows (Clear compares this machine\'s seq, never ts)', ids(got) === 'skew', ids(got));
    got[0].ts = 1; got[0].extra = 1;
    check('HF3 rollsFor: returns top-level copies (the ring\'s entry is untouched) carrying what the card reads', e4.ring()[1].m.ts === 1000 && !('extra' in e4.ring()[1].m) && got[0].fresh === true
        && j(Object.keys(got[0]).sort()) === j(['extra', 'fresh', 'from', 'res', 'roll', 'rollBad', 'scope', 'seq', 'toName', 'ts']));
    const e5 = mk();
    for (let i = 0; i < 305; i++) e5.ringPush(R('n' + i, i, 'Ana'), 'c_a');
    check('HF3 ring: capped at 300, the oldest going first; seq runs on', e5.ring().length === 300 && e5.ring()[0].m.roll.id === 'n5' && e5.net.rollSeq() === 305);
    e5.fired.length = 0; e5.ringRepaint();
    check('HF3 ring: a repaint calls the hook with no roll (every HUD\'s foot)', j(e5.fired) === j([[null, '']]));
    e5.fired.length = 0; e5.ringReset();
    check('HF3 ring: a reset empties it and repaints every foot, and seq runs on (a Clear mark from before hides nothing new)', e5.ring().length === 0 && j(e5.fired) === j([[null, '']]) && e5.net.rollSeq() === 305 && (e5.ringPush(R('after', 1, 'Ana'), 'c_a'), e5.net.rollsFor('c_a', 'Ana', 305, 10).length === 1));
    const log = [{ from: { id: 'u' }, text: 'hi', scope: 'global', ts: 1 }, { from: { id: 'g' }, text: 'psst', scope: 'whisper', ts: 2 }, R('w', 3, 'Ana', ME, 'whisper'), Object.assign(R('g1', 4, 'Ana'), { cid: 'c_a', seq: 9 })];
    const h = e5.chatHistoryOf(log);
    check('HF3 chatHistoryOf: whispers (and private rolls) never go to a joiner; a roll is rebuilt with exactly from, text, scope, ts, roll (no local tag rides along)',
        h.length === 2 && h[0].text === 'hi' && j(Object.keys(h[1])) === j(['from', 'text', 'scope', 'ts', 'roll']) && h[1].roll.id === 'g1', j(h));
    const many = []; for (let i = 0; i < 70; i++) many.push({ from: { id: 'u' }, text: 't' + i, scope: 'global', ts: i });
    check('HF3 chatHistoryOf: the last 60', e5.chatHistoryOf(many).length === 60 && e5.chatHistoryOf(many)[0].text === 't10');
    const dsr = fnSrc('function diceSessionReset(clearChat) {', '\n// Roll from here', 'diceSessionReset');
    const js = fnSrc('function joinSession(code, name, isRetry, probe) {', '\n    var profile = ', 'joinSession'), gu = fnSrc('function giveUpAndRestore(msg) {', '\n    load();', 'giveUpAndRestore');
    const outside = src.replace(rtSrc, '').replace(dsr, '');
    check('HF3 source: the join sends chatHistoryOf(chatLog); a replayed roll goes into the ring beside the chat; our pending request carries its character and the client reads it before clearing; the host tags a roll-req and a local roll with the character',
        /var recent = chatHistoryOf\(chatLog\);/.test(src) && /chatLog\.push\(hm\); ringPush\(hm, '', true\);/.test(src) && /if \(addedR\) ringRepaint\(\);/.test(src)
        && /_dicePending = \{ rid: rid, expr: expr, charId: o\.charId \|\| '', timer:/.test(src)
        && /var cidP = \(_dicePending && rc\.rid === _dicePending\.rid\) \? _dicePending\.charId : '';[^\n]*\n\s*if \(_dicePending && rc\.rid === _dicePending\.rid\) \{ clearTimeout\(_dicePending\.timer\); _dicePending = null;/.test(src)
        && /\{ bad: rp\.ok \? null : rp\.reason, cid: cidP \}/.test(src)
        && (src.match(/pushRoll\(recQ, resQ, '(whisper|global)', \{ cid: chQ \? q\.charId : '' \}\)/g) || []).length === 3 /* 1.6.2 (HR1): and a roll that goes straight to the GM (moved on purpose) */
        && /pushRoll\(rec, res, scope, \{ toName: toName, cid: chR \? chR\.id : '' \}\);/.test(src)
        && /pushChat\(m\); ringPush\(m, opts && opts\.cid\);/.test(src));
    check('HF3 source: the ring is emptied when a session that clears the chat ends, when a fresh Join starts (never a retry or a generation probe, before the old table is left) and when a lost table is given up; seq is never reset; nothing else touches rollRing, so no send path carries it',
        /if \(clearChat\) \{[^\n]*rollRing = \[\]; ringRepaint\(\);/.test(dsr) && !/ringSeq = 0/.test(dsr) && !/rollRing|ringSeq/.test(outside)
        && /\n    if \(!isRetry && !probe\) ringReset\(\);[^\n]*\n    leaveSession\(true\);/.test(js) && /\n    ringReset\(\);/.test(gu) && (outside.match(/ringReset\(\)/g) || []).length === 2,
        (outside.match(/[^\n]*(rollRing|ringSeq)[^\n]*/) || [''])[0]);
}

// HUD frame (HF5b): a player's roll on the host reads CombatRound from the combat on the map they are on — the real roll-req branch, run with the
// real dicecore, formula engine and systemcore on the hud-d20 fixture; every message it sends packs for the wire
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'));
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); }).join('\n') + '\n';
    const gmSys = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hud-d20.json'), 'utf8')), { F: Fx, gmView: true });
    const run = o => {
        o = o || {};
        const tok = { id: 't1', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 0 };
        const camp = { id: 'k', activeItemId: 'm1', system: gmSys, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_str: 14, f_level: 5 } } }, items: { m1: { type: 'map', whiteboard: o.noToken ? [] : [tok] }, m2: { type: 'map', whiteboard: [] } } };
        const net = { active: true, role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: o.loc || 'm1' } }, combats: o.combats !== undefined ? o.combats : { m1: { mapId: 'm1', round: 3, turn: 0, rows: [] } } };   // fold 2: at a table (net.combatFor answers there)
        const out = { table: [], sent: [], pushed: [] };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpVtt: { on: () => true, rulesOn: () => true } };
        const msg = Object.assign({ type: 'roll-req', rid: 'q1', expr: 'd20 + RoundNow', charId: 'c_a', label: 'Attack (+5)' }, o.msg || {});
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            msg, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope, x) => out.pushed.push([scope, x && x.cid]), () => {});
        return out;
    };
    const rd = (rec, n) => ((rec && rec.names) || []).filter(x => x.name === n).map(x => x.value)[0];
    const a = run(), b = run({ combats: {} }), c = run({ combats: { m2: { mapId: 'm2', round: 7, turn: 0, rows: [] } } }), d = run({ noToken: true }), e = run({ msg: { priv: 'gm' } }), f = run({ loc: 'm2' }), g = run({ msg: { expr: 'd20 + GMFig' } });
    check('HF5b roll-req (host, run for real): a player\'s roll reads CombatRound from the combat on the map they are on (3); 0 with no combat, a combat on another map, no token of theirs there, or when they are on another map; a private roll carries it too; a GM-only name is refused; the record keeps its label and character; every message packs',
        a.table.length === 1 && rd(a.table[0], 'RoundNow') === 3 && a.table[0].label === 'Attack (+5)' && a.table[0].as === 'Ana' && a.sent.length === 0 && j(a.pushed) === j([['global', 'c_a']])
        && rd(b.table[0], 'RoundNow') === 0 && rd(c.table[0], 'RoundNow') === 0 && rd(d.table[0], 'RoundNow') === 0 && rd(f.table[0], 'RoundNow') === 0
        && e.table.length === 0 && e.sent.length === 1 && e.sent[0].priv === 'gm' && rd(e.sent[0], 'RoundNow') === 3
        && g.table.length === 0 && g.sent.length === 1 && g.sent[0].type === 'roll-deny' && g.sent[0].reason === 'error',
        j([a, b.table, c.table, d.table, f.table, e.sent, g.sent]));
})());

// 1.6.0 roll switches (the owner, by prompt: "In the ± window"): a player's roll with bonuses ticked in its ± window — the real roll-req branch
// with the real dicecore, formula engine and systemcore: the host judges each one through the player's own view (systemcore swJudge), composes it
// with the modifier from the field's own formula (fr), names what was added on the card, and refuses a bonus the character does not have for that
// roll, one of a GM-only item, a sum that does not match, and a pick on a roll that names nothing
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'));
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); }).join('\n') + '\n';
    const gmSys = Sx.cleanSystem({ v: 1, name: 'W', fields: [
        { id: 'f_st', key: 'Stealth', label: 'Stealth', kind: 'skill', roll: '3d6' }, { id: 'f_gm', key: 'Secret', label: 'Secret', kind: 'skill', roll: '3d6', vis: 'gm' },
        { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', list: {} }, { id: 'f_fx', key: 'Fx', label: 'Fx', kind: 'effects' }],
        items: [{ id: 'i_cloak', name: 'Cloak', rollSw: [{ name: 'In shadow', v: 2, to: [{ f: 'f_st' }] }] }, { id: 'i_amul', name: 'Amulet', vis: 'gm', rollSw: [{ name: 'Hex', v: 3, to: [{ f: 'f_st' }] }] }],
        effects: [{ id: 'e_aim', name: 'Aimed', rollSw: [{ name: 'Aim', v: 1, to: [{ f: 'f_st' }] }] }], sheet: { sections: [] } }, { F: Fx, gmView: true });
    const cm = n => Dx.composeModifier('3d6', n, Fx.parse).expr;
    const run = m => {
        const camp = { id: 'k', activeItemId: 'm1', system: gmSys, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_gear: [{ id: 'w_a', defId: 'i_cloak', qty: 1 }, { id: 'w_b', defId: 'i_amul', qty: 1 }], f_fx: [{ id: 'x_1', ref: 'e_aim', on: true }] } } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { active: true, role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {} };
        const out = { table: [], sent: [] };
        const conn = { peer: 'pA', send(x) { packCheck(x); out.sent.push(JSON.parse(JSON.stringify(x))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpVtt: { on: () => true, rulesOn: () => true } };
        const msg = Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a', label: 'Stealth' }, m);
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            msg, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {});
        return out;
    };
    const dmsg = o => o.sent.length === 1 && o.sent[0].type === 'roll-deny' ? o.sent[0].message || o.sent[0].reason : '';
    const ok = run({ expr: cm(4), fr: 'f_st', mod: 1, sw: [{ s: 'f_gear|w_a', i: 0 }, { s: 'f_fx|e_aim', i: 0 }] });
    const plainFr = run({ expr: cm(-1), fr: 'f_st', mod: -1 });
    const sum = run({ expr: cm(1), fr: 'f_st', sw: [{ s: 'f_gear|w_a', i: 0 }] });
    const gmPick = run({ expr: cm(3), fr: 'f_st', sw: [{ s: 'f_gear|w_b', i: 0 }] });
    const gmField = run({ expr: cm(2), fr: 'f_gm', sw: [{ s: 'f_gear|w_a', i: 0 }] });
    const unnamed = run({ expr: cm(2), sw: [{ s: 'f_gear|w_a', i: 0 }] });
    check('1.6.0 roll switches on the host (roll-req, run for real): a field\'s own roll named by its field takes the bonuses ticked, each judged through the player\'s view, composed with the modifier from the field\'s own formula, the card naming what was added; a field\'s own roll with a modifier alone goes as a named roll; a sum that does not match the button, a bonus of a GM-only item, a GM-only field\'s roll and a pick on a roll that names nothing are refused',
        ok.table.length === 1 && ok.sent.length === 0 && j(ok.table[0].sw) === j([{ n: 'In shadow', v: 2 }, { n: 'Aim', v: 1 }]) && ok.table[0].expr === cm(4)
        && plainFr.table.length === 1 && plainFr.table[0].sw === undefined
        && sum.table.length === 0 && dmsg(sum) === 'That roll does not match its button now.'
        && gmPick.table.length === 0 && dmsg(gmPick) === 'That bonus is not yours to add to this roll now.'
        && gmField.table.length === 0 && /^That (roll does not match its button|bonus is not yours to add to this roll) now.$/.test(dmsg(gmField))
        && unnamed.table.length === 0 && dmsg(unnamed) === 'That roll could not be read.',
        j([ok, plainFr.table, sum.sent, gmPick.sent, gmField.sent, unnamed.sent]));
})());

// 1.6.0 Specialties (the core handbook session's skill reference): a player's roll that reads a parent and a specialty, judged on the host — the
// real roll-req branch with the real dicecore, formula engine and systemcore: the figure is worked out through the player's own view, the record
// carries the case each reference used (refs) as its card says it, and a GM-only row neither counts nor is named; the GM's own roll asks the same
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'));
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); }).join('\n') + '\n';
    const gmSys = Sx.cleanSystem({ v: 1, name: 'W', fields: [
        { id: 'f_agi', key: 'Agility', label: 'Agility', kind: 'number', def: 10 },
        { id: 'f_tal', key: 'Talents', label: 'Talents', kind: 'item-list', edit: 'owner', list: { cats: ['Talent'], noQty: true, multi: true, lvl: { label: 'Level', min: 0, max: 20, def: 1 }, stats: [{ key: 'fall', label: 'Fallback' }], cols: [{ key: 'Target', label: 'Target', formula: 'if(Row.has, Row.lvl + Agility, Agility - 5)' }], specs: { fall: 'fall' } } },
        { id: 'f_wp', key: 'Arms', label: 'Arms', kind: 'item-list', edit: 'owner', list: { cats: ['Arm'], stats: [{ key: 'wsk', label: 'Skill', kind: 'pick', opts: [{ label: 'Saber', name: 'Talents.Blade.Saber.Target' }] }], cols: [{ key: 'Skill', label: 'Skill', formula: 'Row.wsk' }], rolls: [{ label: 'Hit', formula: '3d6 <= Row.Skill' }] } },
        { id: 'f_hit', key: 'Hit', label: 'Hit', kind: 'formula', formula: 'Talents.Blade.Saber.Target + 0' }],
        items: [{ id: 'i_blade', key: 'Blade', name: 'Blade', category: 'Talent', again: 'name', stats: { fall: -2 } }, { id: 'i_ghost', name: 'Blade (Saber)', category: 'Talent', vis: 'gm' }, { id: 'i_shadow', key: 'Shadow', name: 'Shadow', category: 'Talent', vis: 'gm', again: 'name' },
            { id: 'i_sab', name: 'Saber', category: 'Arm', stats: { wsk: 'Saber' } }], sheet: { sections: [] } }, { F: Fx, gmView: true });
    const cm = (f, n) => Dx.composeModifier(f, n, Fx.parse).expr;
    const run = m => {
        const camp = { id: 'k', activeItemId: 'm1', system: gmSys, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_agi: 10,
            f_tal: [{ id: 'w_1', defId: 'i_blade', qty: 1, lvl: 3, ov: { name: 'Blade (Longsword)' } }, { id: 'w_4', defId: 'i_ghost', qty: 1, lvl: 9 }, { id: 'w_3', defId: 'i_shadow', qty: 1, lvl: 4, ov: { name: 'Shadow (Step)' } }], f_wp: [{ id: 'w_9', defId: 'i_sab', qty: 1 }] } } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { active: true, role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {} };
        const out = { table: [], sent: [] };
        const conn = { peer: 'pA', send(x) { packCheck(x); out.sent.push(JSON.parse(JSON.stringify(x))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpVtt: { on: () => true, rulesOn: () => true } };
        const msg = Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, m);
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            msg, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {});
        return out;
    };
    const lr = run({ expr: cm('3d6 <= Row.Skill', 0), row: { f: 'f_wp', r: 'w_9', i: 0 }, label: 'Hit' }), fr = run({ expr: '3d6 + Hit', label: 'Hit' }), sh = run({ expr: 'd20 + Talents.Shadow.Step.Target' });
    const SAB = [{ s: 'as Blade (Longsword) −2', c: 2 }], rk = o => o.table[0] || {};
    check('1.6.0 Specialties on the host (roll-req, run for real): a player\'s weapon roll whose Skill reads Talents.Blade.Saber.Target through a choice stat is worked out through their own view, at their best Blade row less its Fallback (11), and its record says so (refs, as Blade (Longsword) -2); a formula field reading it alike; the GM-only row named Blade (Saber) counts for nothing and is named nowhere; a GM-only entry\'s specialty reads on their view as not carried (Agility - 5), never at the GM\'s row; the GM\'s own roll asks rollRefs as it asks rollMods',
        lr.sent.length === 0 && lr.table.length === 1 && j(rk(lr).names) === j([{ name: 'Row.Skill', value: 11 }]) && j(rk(lr).refs) === j(SAB)
        && fr.table.length === 1 && j(rk(fr).names) === j([{ name: 'Hit', value: 11 }]) && j(rk(fr).refs) === j(SAB)
        && sh.table.length === 1 && j(rk(sh).names) === j([{ name: 'Talents.Shadow.Step.Target', value: 5 }]) && j(rk(sh).refs) === j([{ s: 'untrained Shadow', c: 3 }])
        && !j([lr.table, fr.table, sh.table]).includes('Saber)') && !j(sh.table).includes('Step)') && j(Dx.cleanRoll(rk(lr)).refs) === j(SAB)
        && src.includes('var rfR = SR.rollRefs(varsR, rec.names); if (rfR) rec.refs = rfR;') && src.includes('var rfQ = SQ.rollRefs(varsQ, recQ.names); if (rfQ) recQ.refs = rfQ;'),
        j([lr, fr, sh]));
})());

// 1.6.0 Specialties, Never untrained (the core's ask, from the owner, before Sunday): a player's roll that reads a parent nobody holds and that
// cannot be tried untrained is refused on the host in those words, and nothing is rolled — the real roll-req branch; the GM's own roll toasts them
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'));
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); }).join('\n') + '\n';
    const gmSys = Sx.cleanSystem({ v: 1, name: 'W', fields: [
        { id: 'f_agi', key: 'Agility', label: 'Agility', kind: 'number', def: 10 },
        { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', edit: 'owner', list: { cats: ['Skill'], noQty: true, multi: true, lvl: { label: 'Level', min: 0, max: 20, def: 1 }, stats: [{ key: 'grade', label: 'Grade' }],
            cols: [{ key: 'Target', label: 'Target', formula: 'if(Row.has, Row.lvl + Agility, Agility - 3 - 2 * Row.grade)' }, { key: 'NoU', label: 'No untrained', hide: true, formula: 'Row.grade >= 3' }, { key: 'Pen', label: 'Penalty', hide: true, formula: '-3 - 2 * Row.grade' }], specs: { never: 'NoU', pen: 'Pen' } } }],
        items: [{ id: 'i_surg', key: 'Surgery', name: 'Surgery', category: 'Skill', stats: { grade: 3 } }, { id: 'i_bl', key: 'Blade', name: 'Blade', category: 'Skill', stats: { grade: 1 } }], sheet: { sections: [] } }, { F: Fx, gmView: true });
    const run = m => {
        const camp = { id: 'k', activeItemId: 'm1', system: gmSys, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_agi: 10, f_sk: [] } } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { active: true, role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {} };
        const out = { table: [], sent: [] };
        const conn = { peer: 'pA', send(x) { packCheck(x); out.sent.push(JSON.parse(JSON.stringify(x))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, m), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {});
        return out;
    };
    const no = run({ expr: '3d6 <= Skills.Surgery.Stitch.Target' }), no3 = run({ expr: '3d6 <= Skills.Surgery.Target' }), ok = run({ expr: '3d6 <= Skills.Blade.Longsword.Target' });
    const said = o => o.sent.length === 1 && o.sent[0].type === 'roll-deny' ? JSON.stringify(o.sent[0]) : '';
    check('1.6.0 Specialties, Never untrained on the host (roll-req, run for real): a player\'s roll reading Surgery, held by none and Exacting, is refused with "Surgery cannot be tried untrained." and nothing is rolled, by a specialty or the bare skill; Blade, which can, is rolled at its default with the penalty on its card ("untrained Blade (-5)"); the GM\'s own roll says the same words (dice.js toasts the error, no card)',
        no.table.length === 0 && /Surgery cannot be tried untrained\./.test(said(no)) && no3.table.length === 0 && /Surgery cannot be tried untrained\./.test(said(no3))
        && ok.table.length === 1 && ok.sent.length === 0 && j(ok.table[0].refs) === j([{ s: 'untrained Blade (\u22125)', c: 3 }]) && j(ok.table[0].names) === j([{ name: 'Skills.Blade.Longsword.Target', value: 5 }])
        && /if \(!res\.ok\) return cardR && cardR\.undo && cardR\.undo\(\), \{ error: res\.error\.message,/.test(src),
        j([no.sent, no3.sent, ok.table]));
})());
// 1.5.0 derived GM-only values: the GM's own roll (net.diceRoll, run for real with the real dicecore, formula engine and systemcore) goes to the
// GM alone when it names a GM-only field anywhere or reads a value worked out from one; a player's own roll-req of such a value is refused
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll'), rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'));
    const line = k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const sysD = Sx.cleanSystem({ v: 1, name: 'D', rolls: [], fields: [
        { id: 'f_g', key: 'GMFig', kind: 'number', def: 12, vis: 'gm' }, { id: 'f_b', key: 'Bonus', kind: 'formula', formula: 'GMFig + 1' }, { id: 'f_at', key: 'Atk', kind: 'formula', formula: 'Bonus + 2' },
        { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: 'GMFig * 2', def: 'max' }, { id: 'f_sk', key: 'Sk', kind: 'skill', base: 'GMFig', def: 3 },
        { id: 'f_a', key: 'A', kind: 'number', def: 4 }, { id: 'f_fl', key: 'Flag', kind: 'number', def: 0 }, { id: 'f_fx', key: 'Effects', kind: 'effects' }],
        effects: [{ id: 'e_g', name: 'Veil', vis: 'gm', mods: [{ f: 'f_a', op: 'add', v: 2 }] }] }, { F: Fx, gmView: true });
    const run = (expr, o, env) => { env = env || {}; const out = { table: [], pushed: [], toasts: [], target: [] };
        const camp = { id: 'k', system: env.sys || sysD, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: env.values || {} } } };
        const tgt = { peer: 'pA', open: true, send(m) { packCheck(m); out.target.push(JSON.parse(JSON.stringify(m))); } };
        const net = { active: env.active !== false, role: 'host', stream: false, conns: [tgt], roster: { pA: { id: 'u_a', name: 'Pat' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null } };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => out.toasts.push(t), k => (k === 'chatTo' ? { value: env.to || '' } : null), e => { throw e; },
            rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, (rec, res, scope) => out.pushed.push([scope, rec.priv || '', (rec.names || []).map(n => n.name).join(',')]), () => {});
        out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o || {})); return out; };
    const priv = r => !!r.ret && r.ret.ok === true && r.ret.priv === true && r.table.length === 0 && r.target.length === 0 && j(r.pushed.map(p => p.slice(0, 2))) === j([['whisper', 'gm']]) && r.toasts.length === 1;
    const pub = r => !!r.ret && r.ret.ok === true && r.ret.priv === false && r.table.length === 1 && !r.table[0].priv && r.target.length === 0 && j(r.pushed.map(p => p.slice(0, 2))) === j([['global', '']]) && r.toasts.length === 0;
    const toastOf = n => 'Kept private: that roll uses a GM-only value (' + n + ').';
    const dG = run('d6 + GMFig'), dB = run('d6 + Bonus', { label: 'Attack (13)' }), dAt = run('d6 + Atk'), dHm = run('d6 + HP.max'), dHf = run('d6 + HP'), dHs = run('d6 + HP', {}, { values: { f_hp: { cur: 5 } } }), dSk = run('d6 + Sk'), dSr = run('d6 + Sk.ranks'), dA = run('d6 + A');
    check('derived GM-only values: the GM\'s own public roll (net.diceRoll, run for real) goes to the GM alone with the toast when it reads a GM-only value or one worked out from it — a formula, a formula over it, a pool whose max is one (its max; the pool full or stored), a skill — and stays public for a skill\'s ranks and a plain number; every message packs',
        [dG, dB, dAt, dHm, dHf, dHs, dSk].every(priv) && [dSr, dA].every(pub) && dG.toasts[0] === toastOf('GMFig') && dB.toasts[0] === toastOf('Bonus') && dAt.toasts[0] === toastOf('Atk') && dHm.toasts[0] === toastOf('HP.max') && dHf.toasts[0] === toastOf('HP') && dHs.toasts[0] === toastOf('HP') && dSk.toasts[0] === toastOf('Sk')
        && dA.table[0].names.length === 1 && dA.table[0].names[0].name === 'A' && dA.table[0].names[0].value === 4, j([dG, dB, dHs, dA].map(r => [r.ret, r.table.length, r.pushed, r.toasts])));
    // owed review leftover (a), the owner's ruling of 2026-10-01: a GM-only custom row is not its key's row on a list players see, so the GM's
    // own public roll that reads the key shows the table what the owner's own roll reads (not carried), never the hidden row's number
    const sysK = Sx.cleanSystem({ v: 1, name: 'K', rolls: [], fields: [{ id: 'f_sk', key: 'Skills', kind: 'item-list', vis: 'all', edit: 'owner', list: { cats: ['Skill'], lvl: { label: 'Level', min: 0, max: 20, def: 0 }, custom: true } }], items: [] }, { F: Fx, gmView: true });
    const rowK = vis => [{ id: 'w_h', qty: 1, lvl: 3, def: { name: 'Quiet step', key: 'Hush', category: 'Skill', vis } }];
    const dK = run('d6 + Skills.Hush.lvl', {}, { sys: sysK, values: { f_sk: rowK('gm') } }), dKv = run('d6 + Skills.Hush.lvl', {}, { sys: sysK, values: { f_sk: rowK('all') } });
    check('owed review (a) the GM\'s own public roll (net.diceRoll, run for real): reading a GM-only custom row by its key on a list players see stays public and shows the table the value its owner\'s sheet works out (0: not carried), never the hidden row\'s level; a visible row of that key reads its level, as ever',
        pub(dK) && j(dK.table[0].names.map(n => n.value)) === '[0]' && !/"value":3/.test(j(dK.table[0].names)) && pub(dKv) && j(dKv.table[0].names.map(n => n.value)) === '[3]', j([dK.ret, dK.table, dKv.table]));
    const dIf = run('if(Flag, GMFig, 0) + d6'), dIf0 = run('if(0, GMFig, 1) + d6'), dIfD = run('if(d20 >= 21, GMFig, 0) + d6'), dIfB = run('if(Flag, Bonus, 0) + d6'), dW = run('d6 + Bonus', {}, { to: 'pA' }), dWa = run('d6 + A', {}, { to: 'pA' }), dOff = run('d6 + Bonus', {}, { active: false }), dPriv = run('d6 + Bonus', { priv: true }), dFx = run('d6 + A', {}, { values: { f_fx: [{ id: 'x_1', ref: 'e_g', on: true }] } });
    check('derived GM-only values: a GM-only name the formula writes in a branch it does not take still keeps the roll private (the card shows the text); a derived value in such a branch is not read, so the roll stays public; a whisper of a derived value reaches no one (a plain one reaches its player); offline nothing is kept back or said; Private asks nothing; a GM-only effect still keeps it private',
        priv(dIf) && dIf.toasts[0] === toastOf('GMFig') && j(dIf.pushed[0][2]) === j('Flag') && [dIf0, dIfD].every(r => priv(r) && r.toasts[0] === toastOf('GMFig') && r.pushed[0][2] === '') && pub(dIfB) && dIfB.table[0].names.map(n => n.name).join(',') === 'Flag'
        && priv(dW) && dW.target.length === 0 && dWa.target.length === 1 && !dWa.target[0].priv && dWa.target[0].to === 'pA' && dWa.table.length === 0 && dWa.toasts.length === 0
        && dOff.ret.ok === true && dOff.ret.priv === false && dOff.toasts.length === 0 && dOff.table.length === 0 && j(dOff.pushed.map(p => p.slice(0, 2))) === j([['global', '']])
        && dPriv.ret.priv === true && dPriv.toasts.length === 0 && dPriv.table.length === 0 && priv(dFx) && dFx.toasts[0] === 'Kept private: a GM-only effect changes A.', j([dIf.pushed, dIf.toasts, dIfB.table, dW.target, dWa.target, dOff, dPriv.toasts, dFx.toasts]));
    const runQ = expr => { const out = { table: [], sent: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sysD, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {} };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            { type: 'roll-req', rid: 'q1', expr: expr, charId: 'c_a' }, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {});
        return out; };
    const qB = runQ('d20 + Bonus'), qAt = runQ('d20 + Atk'), qA = runQ('d20 + A'), qSk = runQ('d20 + Sk'), qSkB = runQ('d20 + Sk.base'), qSkR = runQ('d20 + Sk.ranks');
    check('derived GM-only values: a player\'s own roll-req is worked out on the players\' view, so a value built on a GM-only field is refused ("GM only"), never rolled — a skill over one and its .base too (they read ranks + 0 there, a wrong total); a plain value and the skill\'s ranks go to the table',
        [qB, qAt, qSk, qSkB].every(q => q.table.length === 0 && q.sent.length === 1 && q.sent[0].type === 'roll-deny' && /GM only/.test(q.sent[0].message)) && qA.table.length === 1 && qA.sent.length === 0
        && qSkR.table.length === 1 && qSkR.sent.length === 0 && j((qSkR.table[0].names || []).map(n => [n.name, n.value])) === j([['Sk.ranks', 3]]), j([qB.sent, qAt.sent, qA.table.length, qSk.sent, qSk.table, qSkB.sent, qSkR.table]));
    // 1.5.0 GM-only rolls: the caller's gmOnly (a GM-only field's own roll, a GM-only roll, a GM-only item's damage) keeps a hosting GM's roll to the GM
    const toastG = l => 'Kept private: that roll is GM only' + (l ? ' (' + l + ')' : '') + '.';
    const gF = run('d100', { label: 'Hidden Sanity', gmOnly: true }), gNl = run('d6', { gmOnly: true }), gW = run('2d6', { label: 'Orb damage', gmOnly: true }, { to: 'pA' }), gOff = run('d100', { label: 'Hidden Sanity', gmOnly: true }, { active: false });
    const gP = run('d100', { label: 'Hidden Sanity', gmOnly: true, priv: true }), gV = run('d100', { label: 'Luck', gmOnly: false }), gB = run('d6 + GMFig', { label: 'Veiled', gmOnly: true }), gFx = run('d6 + A', { label: 'Hex', gmOnly: true }, { values: { f_fx: [{ id: 'x_1', ref: 'e_g', on: true }] } });
    check('GM-only rolls: a roll the caller marks GM-only (a GM-only field\'s own roll, a GM-only roll, a GM-only item\'s damage; net.diceRoll run for real) goes to the hosting GM alone with one toast naming its label, before the whisper (the whispered player gets nothing); with no label the toast says so plainly; offline nothing is kept back or said; Private asks nothing; unmarked it stays public; a GM-only name or effect as well still makes one toast; every message packs',
        priv(gF) && gF.toasts[0] === toastG('Hidden Sanity') && priv(gNl) && gNl.toasts[0] === toastG('') && priv(gW) && gW.target.length === 0 && gW.toasts[0] === toastG('Orb damage')
        && gOff.ret.ok === true && gOff.ret.priv === false && gOff.toasts.length === 0 && gOff.table.length === 0 && j(gOff.pushed.map(p => p.slice(0, 2))) === j([['global', '']])
        && gP.ret.priv === true && gP.toasts.length === 0 && gP.table.length === 0 && pub(gV) && gV.table[0].label === 'Luck' && [gB, gFx].every(r => priv(r) && r.toasts[0] === toastG(r === gB ? 'Veiled' : 'Hex')),
        j([gF.toasts, gNl.toasts, gW.target, gW.toasts, gOff, gP.toasts, gV.table, gB.toasts, gFx.toasts]));
})());

// 1.5.0 GM-only rolls: a throw from the GM's sheet (whiteboard.js wpArmBlast, placeBlast, placeThrownBlast and resolveThrow, run for real with the
// real net.broadcastBlast): a GM-only item's blast reaches the players on that map unnamed and its damage roll carries gmOnly; a visible item's keeps both
pendingChecks.push((async () => {
    const wbT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
    // the blasts are wbblast.js's, a part of whiteboard.js: each slice is cut from the part read by its name, and its first anchor stands
    // once in the whole family (docs/REFACTOR_SPLIT_PLAN.md, area 8)
    const cut = (part, a, b) => { const t = require('./checkkit').part(part), i = t.indexOf(a), k = t.indexOf(b, i); if (i < 0 || k < 0 || wbT.indexOf(a, wbT.indexOf(a) + 1) >= 0) throw new Error('netcheck: ' + part + ' ' + a + ' not found once'); return t.slice(i, k); };
    const armSrc = cut('wbblast.js', '  window.wpArmBlast = function(ft, name, ctx) {', "  // A client's received shared blast"), placeSrc = cut('wbblast.js', '  function placeBlast(e) {', '  // A blast thrown from a character sheet'), throwSrc = cut('wbblast.js', '  // A blast thrown from a character sheet', '  var _lastThrowTx = null;');
    const bbSrc = between('// [netcheck:blast-start]', '// [netcheck:blast-end]', 'blast');
    const runT = (name, ctx, o) => { o = o || {}; const out = { sent: [], rolls: [], placed: [], applied: [] };
        const peer = id => ({ peer: id, open: true, send(m) { packCheck(m); out.sent.push([id, JSON.parse(JSON.stringify(m))]); } });
        const net = { active: true, role: 'host', conns: [peer('pA'), peer('pB')], roster: { pA: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm2' } } };
        const camp = { id: 'k', system: { combat: { blastAuto: o.auto || 'roll', hpResource: 'f_hp' } } }, map = { id: 'm1' };
        new Function('net', 'getActiveCampaign', 'sendFailed', bbSrc)(net, () => camp, e => { throw e; });
        const win = { wpNet: net, wpVtt: { on: () => true }, wpDice: { rollFor: (...a) => { out.rolls.push(JSON.parse(JSON.stringify(a))); return { ok: true, value: 7 }; } } };
        const api = new Function('window', 'document', 'toast', 'getActiveMap', 'getActiveCampaign', 'seatBlast', 'pushBlast', 'renderMeasures', 'syncBlastMenu', 'blastDistances', 'blastRadiusYd', 'applyBlastDamage', 'wbWrap', 'state',
            require('./viewhelp.js').viewHelpers() + 'var _armedThrow = null;\n' + placeSrc + throwSrc + armSrc + '\nreturn { place: placeBlast };')(
            win, { body: { classList: { add() {}, remove() {} } }, getElementById: () => null }, () => {}, () => map, () => camp, () => {}, b => out.placed.push(JSON.parse(JSON.stringify(b))), () => {}, () => {}, () => [], () => 1,
            (b, total, hp) => out.applied.push([total, hp]), { getBoundingClientRect: () => ({ left: 0, top: 0 }), scrollLeft: 0, scrollTop: 0, style: {} }, { zoomLevel: 1 });
        win.wpArmBlast(10, name, ctx); api.place({ clientX: 120, clientY: 80 }); return out; };
    const ctxT = (dmg, gm) => Object.assign({ charId: 'c_n', fieldId: 'f_it', rowId: 'w_1', by: 'Nix', damage: dmg }, gm === undefined ? {} : { gmOnly: gm });
    const blastT = name => [['pA', { type: 'blast', campId: 'k', mapId: 'm1', blast: { x: 120, y: 80, ft: 10, elev: 0, name: name, by: 'Nix' } }]];
    const tG = runT('Orb', ctxT('3d6', true)), tV = runT('Frag', ctxT('2d6', false)), tU = runT('Frag', ctxT('2d6')), tF = runT('Orb', ctxT('3d6', true), { auto: 'full' });
    check('GM-only rolls: a GM-only item thrown from the GM\'s sheet (whiteboard.js arm, place, throw and damage, run for real with the real net.broadcastBlast) reaches the players on that map as an unnamed blast (the thrower\'s name kept, the GM\'s own marker keeps the item\'s) and its damage roll carries gmOnly; a visible item\'s blast keeps its name and its roll is unmarked (as is a throw that says nothing); full auto still applies the total; a player on another map gets nothing; every message packs',
        j(tG.sent) === j(blastT('')) && tG.placed.length === 1 && tG.placed[0].name === 'Orb' && j(tG.rolls) === j([['c_n', '3d6', 'Orb damage', { gmOnly: true, dmg: true, used: false }]]) && tG.applied.length === 0
        && j(tV.sent) === j(blastT('Frag')) && j(tV.rolls) === j([['c_n', '2d6', 'Frag damage', { gmOnly: false, dmg: true, used: false }]]) && j(tU.sent) === j(blastT('Frag')) && j(tU.rolls) === j(tV.rolls)
        && j(tF.sent) === j(blastT('')) && j(tF.rolls) === j([['c_n', '3d6', 'Orb damage', { gmOnly: true, dmg: true, used: true }]]) && j(tF.applied) === j([[7, 'f_hp']]), j([tG, tV.sent, tV.rolls, tU.rolls, tF.applied]));
    // 128 (e): an exploded ring or cone is sent with its shape, cleaned (the real net.broadcastBlast)
    const sendB = blast => { const out = [], peer = id => ({ peer: id, open: true, send(m) { packCheck(m); out.push([id, JSON.parse(JSON.stringify(m.blast))]); } });
        const net = { active: true, role: 'host', conns: [peer('pA'), peer('pB')], roster: { pA: { id: 'u_a', location: 'm1' }, pB: { id: 'u_b', location: 'm2' } } };
        new Function('net', 'getActiveCampaign', 'sendFailed', bbSrc)(net, () => ({ id: 'k' }), e => { throw e; }); net.broadcastBlast(blast, 'm1'); return j(out); };
    const turn = a => Math.atan2(Math.sin(a), Math.cos(a));   // an aim as one turn of the compass, by this runtime's own arithmetic
    const bsB = { x: 5, y: 6, ft: 12, elev: 1, name: 'Explosion', by: '' }, withB = o => Object.assign({}, bsB, o), plainB = j([['pA', { x: 5, y: 6, ft: 12, elev: 1, name: 'Explosion', by: '' }]]), shB = o => j([['pA', Object.assign({ x: 5, y: 6, ft: 12, elev: 1, name: 'Explosion', by: '' }, o)]]);
    check('128 (e) a ring and a cone on the wire (the real net.broadcastBlast): an exploded ring is sent to the players on that map with its shape and its inner distance in feet, a number above nothing and inside its radius; an exploded cone with its angle as a whole number of degrees from 1 to 360 and its aim as one turn of the compass; a shape whose numbers do not read, and a shape of any other word, is sent as the plain blast, with no shape at all; nothing else a caller names travels, neither the token an explosion spares nor a shape of the tool\'s own; a plain blast is sent exactly as before; every message packs',
        sendB(bsB) === plainB && sendB(withB({ shape: 'ring', inFt: 6 })) === shB({ shape: 'ring', inFt: 6 }) && sendB(withB({ shape: 'ring', inFt: 11.99 })) === shB({ shape: 'ring', inFt: 11.99 })
        && [12, 13, 0, -1, NaN, Infinity, 'x', null, undefined, {}].every(v => sendB(withB({ shape: 'ring', inFt: v })) === plainB)
        && sendB(withB({ shape: 'cone', deg: 90.4, dir: 7 })) === shB({ shape: 'cone', deg: 90, dir: turn(7) }) && Math.abs(turn(7) - (7 - 2 * Math.PI)) < 1e-9 && sendB(withB({ shape: 'cone', deg: 360, dir: 0 })) === shB({ shape: 'cone', deg: 360, dir: 0 }) && sendB(withB({ shape: 'cone', deg: 1, dir: -1 })) === shB({ shape: 'cone', deg: 1, dir: turn(-1) })
        && [0, 0.4, 361, NaN, 'x', null, undefined, {}].every(v => sendB(withB({ shape: 'cone', deg: v, dir: 1 })) === plainB) && [NaN, Infinity, -Infinity, 'x', undefined, {}].every(v => sendB(withB({ shape: 'cone', deg: 60, dir: v })) === plainB)
        && ['square', 'r', '__proto__', {}, 5, true, null].every(s => sendB(withB({ shape: s, inFt: 6, deg: 60, dir: 1 })) === plainB)
        && sendB(withB({ shape: 'ring', inFt: 6, spare: 'tok_a', tok: 'tok_a', yd: 4, as: 'cone', deg: 60, dir: 1, lost: true })) === shB({ shape: 'ring', inFt: 6 }) && sendB(withB({ shape: 'cone', deg: 60, dir: 1, inFt: 6, spare: 'tok_a' })) === shB({ shape: 'cone', deg: 60, dir: turn(1) }),
        j([sendB(withB({ shape: 'ring', inFt: 6 })), sendB(withB({ shape: 'cone', deg: 90.4, dir: 7 })), sendB(withB({ shape: 'ring', inFt: 12 }))]));
    // hidden pieces (owner, 2026-10-01): a thrown blast's height — a number every player on the map gets — is never read from a token the GM hid, under
    // the seat or under the spot the wall rule moves it to; the GM's own blast tool still reads one (the GM is its only viewer). The real tokenAtPoint,
    // seatBlast, placeBlast, placeThrownBlast and net.broadcastBlast on a square grid
    const tapSrc = cut('wbblast.js', '  function tokenAtPoint(map, x, y, shown) {', '  // Horizontal distance in yards'), seatSrc = cut('wbblast.js', '  // Seat a blast in its grid cell', '  function placeBlast(e) {');
    const runE = (tokens, thrown, noWall, real) => { const out = { sent: [], placed: [] };   // real (item 19b H5): the real tokenElevation and groundAt, over the real fogcore   // noWall: the wall rule moves the blast nowhere, so the seat's own reading is the one sent
        const net = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } }], roster: { pA: { id: 'u_a', location: 'm1' } } };
        const camp = { id: 'k', system: { combat: { blastAuto: 'roll', hpResource: 'f_hp' } } }, map = { id: 'm1', whiteboard: tokens };
        new Function('net', 'getActiveCampaign', 'sendFailed', bbSrc)(net, () => camp, e => { throw e; });
        const win = { wpNet: net, wpVtt: { on: () => true }, wpDice: { rollFor: () => ({ ok: true, value: 7 }) }, wpFog: { blastSeat: (m, x, y) => (noWall ? null : { x: x, y: y }) } };
        const api = new Function('window', 'document', 'toast', 'getActiveMap', 'getActiveCampaign', 'pushBlast', 'renderMeasures', 'syncBlastMenu', 'blastDistances', 'blastRadiusYd', 'applyBlastDamage', 'wbWrap', 'state', 'tokenElevation', 'groundAt', 'snapToHex', 'stanceOn', 'fmtElev', 'lenUnit', 'circleKept', 'circleWords', 'rulerUnitNow',
            require('./viewhelp.js').viewHelpers() + 'var _armedThrow = null;\n' + tapSrc + seatSrc + placeSrc + throwSrc + armSrc + '\nreturn { place: placeBlast };')(
            win, { body: { classList: { add() {}, remove() {} } }, getElementById: () => null }, () => {}, () => map, () => camp, b => out.placed.push(JSON.parse(JSON.stringify(b))), () => {}, () => {}, () => [], () => 1,
            () => {}, { getBoundingClientRect: () => ({ left: 0, top: 0 }), scrollLeft: 0, scrollTop: 0, style: {} }, { zoomLevel: 1, gridType: 'square' }, real ? real.tokenElevation : t => Number(t.elevation) || 0, real ? real.groundAt : () => 0, null, () => true, v => String(v), () => 'yd', { yd: 4, as: 'r' }, () => 'Radius 4 yd', () => 'yd');
        if (thrown) win.wpArmBlast(10, 'Frag', { charId: 'c_n', fieldId: 'f_it', rowId: 'w_1', by: 'Nix', damage: '2d6' });
        api.place({ clientX: 120, clientY: 80 }); return { sent: out.sent.map(m => m.blast.elev), placed: out.placed.map(b => b.elev) }; };
    const hidE = { id: 'h', isChar: true, hidden: true, elevation: 2, x: 100, y: 50, w: 60, h: 52 }, visE = { id: 'v', isChar: true, elevation: 3, x: 100, y: 50, w: 60, h: 52 };
    const eH = runE([hidE], true), eHs = runE([hidE], true, true), eVs = runE([visE], true, true), eV = runE([visE], true), eVH = runE([visE, hidE], true), eHV = runE([hidE, visE], true), eGm = runE([hidE], false), eNone = runE([], true);
    check('hidden pieces: a thrown blast over a hidden token with a height is sent at 0, as over empty ground (moved by the wall rule or not), while one over a shown token carries its height; a hidden token standing on a shown one neither hides nor gives the shown one\'s height; the GM\'s own blast tool (nothing sent) still seats at the hidden token\'s height',
        j(eH) === j({ sent: [0], placed: [0] }) && j(eHs) === j({ sent: [0], placed: [0] }) && j(eVs) === j({ sent: [3], placed: [3] }) && j(eV) === j({ sent: [3], placed: [3] }) && j(eVH) === j({ sent: [3], placed: [3] }) && j(eHV) === j({ sent: [3], placed: [3] }) && j(eGm) === j({ sent: [], placed: [2] }) && j(eNone) === j({ sent: [0], placed: [0] }), j([eH, eV, eVH, eHV, eGm, eNone]));
    // item 19b H5: a blast on ground. The real tokenElevation and groundAt (whiteboard.js sliced by its ground markers) over the real fogcore: a thrown
    // blast's height, sent to the table, reads the ground of the pieces players hold; the GM's own blast tool every piece on its map
    const FCbl = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fogcore.js')).split(String.fromCharCode(92)).join('/')), gbA = wbT.indexOf('// [fogcheck:ground-start]'), gbB = wbT.indexOf('// [fogcheck:ground-end]');
    const realG = (() => { try { return new Function('window', 'stanceOn', 'fmtElev', 'lenUnit', '"use strict";\n' + wbT.slice(gbA, gbB) + '\nreturn { tokenElevation: tokenElevation, groundAt: groundAt };')({ wpFogCore: FCbl }, () => true, String, () => 'yd'); } catch (e) { return null; } })();
    const hillE = { id: 'hill', type: 'rect', x: 100, y: 50, w: 100, h: 100, ground: 4 }, hillHidE = { id: 'hillH', type: 'rect', x: 100, y: 50, w: 100, h: 100, ground: 6, hidden: true };
    const gE = realG ? [runE([hillE], true, true, realG), runE([hillE], true, false, realG), runE([hillHidE], true, true, realG), runE([hillHidE], false, true, realG), runE([hillE, visE], true, true, realG), runE([hillHidE, visE], true, true, realG), runE([hillHidE, visE], false, true, realG), runE([hillE, hillHidE, hidE], true, true, realG), runE([visE], true, true, realG)] : null;
    check('item 19b H5 a blast on ground (seatBlast and placeThrownBlast run for real with the real tokenElevation and groundAt): a thrown blast with no token under it is sent at the ground\'s height there (moved by the wall rule or not), one over a token at the token\'s elevation plus the ground; a hidden ground piece adds nothing to a thrown blast, with or without a token on it, nor does a hidden token standing on shown ground; the GM\'s own blast tool (nothing sent) reads the hidden ground too',
        !!gE && j(gE) === j([{ sent: [4], placed: [4] }, { sent: [4], placed: [4] }, { sent: [0], placed: [0] }, { sent: [], placed: [6] }, { sent: [7], placed: [7] }, { sent: [3], placed: [3] }, { sent: [], placed: [9] }, { sent: [4], placed: [4] }, { sent: [3], placed: [3] }]), j(gE));
})());

// Stage 6 HUD H7: the apply action on the wire. The host's char-apply (sliced, run for real with the real systemcore, formula engine, the host's
// per-peer sync and the card's delivery, also sliced): the owner's press is worked out through THEIR view (a GM-only action, one naming a GM-only
// value, or one moving a GM-only pool is not there) and applied all or nothing whatever the pool's edit setting (owner, 2026-09-26); the card
// goes to the table only when every pool it moves is shown on hover (else the owner and the GM); and a client takes a card only from its host
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const apSrc = (ordersSrc + '\n' + between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply')), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply');
    const dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta'), aiSrc = between('// [netcheck:applyin-start]', '// [netcheck:applyin-end]', 'applyin');
    const sysA = Sx.cleanSystem({ v: 1, name: 'A', fields: [
        { id: 'f_g', key: 'GMFig', kind: 'number', def: 4, vis: 'gm' },
        { id: 'f_hp', key: 'HP', label: 'Hit points', kind: 'resource', maxFormula: '10', def: 'max', min: -5, edit: 'gm', hover: true },
        { id: 'f_fp', key: 'FP', kind: 'resource', maxFormula: '6', def: 'max', min: 0, edit: 'owner' },
        { id: 'f_in', key: 'Incoming', kind: 'number', def: 0, min: -99, max: 99, edit: 'owner' },
        { id: 'f_vig', key: 'Vigor', kind: 'resource', maxFormula: 'GMFig * 2', def: 'max', min: 0, edit: 'owner', hover: true }],
        rolls: [
            { id: 'r_w', label: 'Apply wounds', apply: [{ f: 'f_hp', formula: 'Incoming' }] },
            { id: 'r_c', label: 'Costs', apply: [{ f: 'f_fp', formula: '2' }, { f: 'f_hp', formula: '1' }] },
            { id: 'r_s', label: 'Secret', apply: [{ f: 'f_hp', formula: 'GMFig' }] },
            { id: 'r_g', label: 'GM', apply: [{ f: 'f_hp', formula: '1' }], vis: 'gm' },
            { id: 'r_v', label: 'Vig', apply: [{ f: 'f_vig', formula: '1' }] },
            { id: 'r_z', label: 'Div', apply: [{ f: 'f_fp', formula: 'FP / (Incoming - Incoming)' }] },
            { id: 'r_roll', label: 'Roll', formula: 'd6' }] }, { F: Fx, gmView: true });
    const START = { f_in: 3, f_fp: { cur: 1 } };
    const host = (msg, o) => {
        o = o || {};
        const camp = { id: 'k', system: o.sys || sysA, items: {}, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(o.vals || START)) }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} }, c_n: { id: 'c_n', name: 'Orc', ownerId: 'u_a', npc: true, values: {} } } };
        const out = { answer: [], owner: [], mate: [], wait: [], chat: [], logs: [], saves: 0, changed: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: !!o.paused, combats: {}, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }, { peer: 'pW', open: true, send: box(out.wait) }], roster: { pA: { id: 'u_a', name: 'Ana P', location: 'm1' }, pB: { id: 'u_b', name: 'Bo P' } } };
        const win = { wpFormula: Fx, wpVtt: { on: k => o.off !== k }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged: id => out.changed.push(id) }, wpDiceCore: null };
        const sendTable = (m, ex) => net.conns.forEach(c => { if (c !== ex && c.open && net.roster[c.peer]) c.send(m); });
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + (o.pre || '') + '\n' + dlSrc + '\n' + paSrc + '\n' + apSrc)(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), o.lim || { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), sendTable, m => out.chat.push(JSON.parse(JSON.stringify(m))), (k, t) => out.logs.push(k + ': ' + t), r => Dx.applyText(r));
        out.vals = camp.chars.c_1.values; out.off = win._off || []; return out;
    };
    const A = (act, extra) => Object.assign({ type: 'char-apply', rid: 'a1', charId: 'c_1', act: act }, extra || {});
    {   // 1.6.0 found by hand on a table: a list's action standing after a roll a player's view drops. Their press names its place in their view, and Off a character's turn judges from the GM's list
        const sysP = Sx.cleanSystem({ v: 1, name: 'P', rolls: [], fields: [{ id: 'f_fp', key: 'FP', kind: 'resource', maxFormula: '6', def: 'max', min: 0, edit: 'owner' }, { id: 'f_gr', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Flaw', label: 'Flaw', vis: 'gm' }], rolls: [{ label: 'Gnaw', formula: '3d6 <= 10 + Row.Flaw' }, { label: 'Use', apply: [{ f: 'f_fp', formula: '1' }] }] } }], items: [{ id: 'i_p', name: 'Pebbles' }] }, { F: Fx, gmView: true });
        const preP = fnSrc('function rowOnGm(', '\n}\n', 'rowOnGm', 'netfight.js') + '\n}\nfunction offTurnBar(c, ch, a, row) { (window._off = window._off || []).push(row); return \'\'; }\nfunction offTurnWarn(c, ch, a, row) { window._off.push(row); }\n';
        const rP = host({ type: 'char-apply', rid: 'a1', charId: 'c_1', row: { f: 'f_gr', r: 'w_p', i: 0 } }, { sys: sysP, vals: { f_gr: [{ id: 'w_p', defId: 'i_p', qty: 1 }] }, pre: preP });
        check('1.6.0 a list\'s action after a roll the player\'s view drops: the real char-apply branch finds it by their place, and Off a character\'s turn, before it moves anything and after, reads it by its place on the GM\'s list (found by hand)',
            rP.owner.filter(m => m.type === 'apply').length === 1 && rP.off.length === 2 && rP.off.every(x => x.i === 1), j([rP.answer, rP.off]));
    }
    const card = list => list.filter(m => m.type === 'apply'), still = r => j(r.vals) === j(START) && r.owner.length === 0 && r.mate.length === 0 && r.chat.length === 0 && r.saves === 0;
    const denied = (r, reason) => j(r.answer.map(m => m.type + ':' + m.reason)) === j(['char-deny:' + reason]) && still(r);
    const w1 = host(A('r_w', { label: 'Apply wounds' })), cW = card(w1.owner)[0] || {};
    check('H7 char-apply: the owner presses Apply wounds on their own character — HP is "GM edits", and the host still works it out and applies it (10 - Incoming 3 = 7): one ack, one save, the delta to the owner, the card to the whole table (HP is shown on hover) and to the host\'s chat and log, never to a peer still waiting',
        j(w1.answer) === j([{ type: 'char-ack', rid: 'a1' }]) && j(w1.vals.f_hp) === j({ cur: 7 }) && w1.saves === 1 && j(w1.changed) === j(['c_1'])
        && w1.owner.some(m => m.type === 'charDelta' && j(m.values) === j({ f_hp: { cur: 7 } }))
        && cW.from && j(cW.from) === j({ id: 'u_a', name: 'Ana P', gm: false }) && cW.as === 'Ana' && cW.label === 'Apply wounds' && j(cW.lines) === j([{ n: 'Hit points', d: -3, v: 7 }]) && !('priv' in cW) && Dx.cleanApply(cW) !== null
        && card(w1.mate).length === 1 && w1.wait.length === 0 && w1.chat.length === 1 && w1.chat[0].scope === 'global' && w1.logs.length === 1 && /^char: Ana P as Ana applied Apply wounds: Hit points/.test(w1.logs[0]),
        j([w1.answer, w1.vals, w1.owner, w1.mate, w1.chat, w1.logs]));
    const c1 = host(A('r_c')), cC = card(c1.owner)[0] || {};
    check('H7 char-apply: Apply costs moves both pools at once (FP 1 - 2 floors at 0, HP 10 - 1) and, since FP is not shown on hover, its card goes to the owner and the GM only (priv), never to a teammate; with no label sent, the action\'s own',
        j(c1.vals.f_fp) === j({ cur: 0 }) && j(c1.vals.f_hp) === j({ cur: 9 }) && cC.priv === 'gm' && cC.label === 'Costs' && j(cC.lines) === j([{ n: 'FP', d: -2, v: 0 }, { n: 'Hit points', d: -1, v: 9 }]) && card(c1.mate).length === 0 && c1.chat[0].scope === 'whisper',
        j([c1.vals, c1.owner, c1.mate]));
    const sysSpA = Sx.cleanSystem(Object.assign({}, sysA, { fields: sysA.fields.map(f => f.id === 'f_hp' ? Object.assign({}, f, { spill: { to: 'f_fp' } }) : f) }), { F: Fx, gmView: true });
    const sp1 = host(A('r_w', { label: 'Apply wounds' }), { sys: sysSpA, vals: { f_in: 3, f_fp: { cur: 6 }, f_hp: { cur: -4 } } }), cSp = card(sp1.owner)[0] || {};
    check('1.6.0 Spills into, char-apply (the host, run for real): Ana\'s Hit points -4 (least -5) less Incoming 3 stop at -5 and the 2 past it spill into FP (6 to 4) in the one change: one ack, one save, both in the owner\'s delta, a line for each; FP is not shown on hover, so the card is the owner\'s and the GM\'s alone, though the action names only Hit points',
        j(sp1.answer) === j([{ type: 'char-ack', rid: 'a1' }]) && j(sp1.vals.f_hp) === j({ cur: -5 }) && j(sp1.vals.f_fp) === j({ cur: 4 }) && sp1.saves === 1 && sp1.owner.some(m => m.type === 'charDelta' && j(m.values) === j({ f_hp: { cur: -5 }, f_fp: { cur: 4 } }))
        && j(cSp.lines) === j([{ n: 'Hit points', d: -3, v: -5 }, { n: 'FP', d: -2, v: 4 }]) && cSp.priv === 'gm' && card(sp1.mate).length === 0 && sp1.chat[0].scope === 'whisper', j([sp1.answer, sp1.vals, sp1.owner, sp1.mate]));
    const dS = host(A('r_s')), dG = host(A('r_g')), dV = host(A('r_v')), dN = host(A('r_nope')), dR = host(A('r_roll'));
    check('H7 char-apply: an action not in the player\'s own view — one naming a GM-only value, a GM-only one, one moving a GM-only pool, an unknown id, a roll — is refused ("field"): nothing stored, sent, shown or saved',
        [dS, dG, dV, dN, dR].every(r => denied(r, 'field')), j([dS.answer, dG.answer, dV.answer, dN.answer, dR.answer]));
    const dO = host(A('r_w', { charId: 'c_2' })), dNpc = host(A('r_w', { charId: 'c_n' })), dM = host(A('r_w', { charId: 'c_9' })), dP = host(A('r_w'), { paused: true }), dOff = host(A('r_w'), { off: 'sheets' });
    let asked = 0; const dSlow = host(A('r_w'), { lim: { allow: () => { asked++; return 'slow'; } } });
    check('H7 char-apply: another player\'s character or an NPC ("owner"), a character that is gone ("missing"), a paused table ("paused"), sheets off ("off") and a peer over the edit rate ("slow", one token) are refused with nothing moved',
        denied(dO, 'owner') && denied(dNpc, 'owner') && denied(dM, 'missing') && denied(dP, 'paused') && denied(dOff, 'off') && denied(dSlow, 'slow') && asked === 1,
        j([dO.answer, dNpc.answer, dM.answer, dP.answer, dOff.answer, dSlow.answer]));
    const dZ = host(A('r_w'), { vals: { f_in: 0, f_fp: { cur: 1 } } }), dE = host(A('r_z'));
    check('H7 char-apply: an amount of 0 is "none" (nothing to apply); an amount the engine refuses is "error" with its own message riding along; either way nothing moves',
        j(dZ.answer) === j([{ type: 'char-deny', rid: 'a1', reason: 'none' }]) && dZ.saves === 0 && dZ.chat.length === 0
        && j(dE.answer) === j([{ type: 'char-deny', rid: 'a1', reason: 'error', msg: 'Division by zero.' }]) && still(dE), j([dZ.answer, dE.answer]));
    const bad = [A('x'), A('r_w', { charId: 'nope' }), Object.assign(A('r_w'), { rid: 'a b' }), A('r_w', { label: 'x'.repeat(61) }), A('r_w', { label: 'a' + String.fromCharCode(0) })].map(m => host(m));
    check('H7 char-apply: a malformed request (not a roll id, a bad character id or rid, a label past 60 or with a control character) is dropped in silence', bad.every(r => r.answer.length === 0 && still(r)), j(bad.map(r => r.answer)));
    // the GM's own press goes through the same delivery: 'gm' reaches no one; 'owner' each of the owner's connections
    const gmOut = host(''); const Pn = new Function('net', 'sendTable', 'sendFailed', 'peerProfileId', 'pushChat', 'logEvent', 'applyLine', paSrc + '\nreturn postApply;');
    const sent = [], mk = p => ({ peer: p, open: true, send: m => sent.push(p + ':' + m.type + (m.priv ? ':priv' : '')) }), netG = { active: true, role: 'host', conns: [mk('pA'), mk('pA2'), mk('pB')], roster: { pA: { id: 'u_a' }, pA2: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const chatG = [], postG = Pn(netG, (m, ex) => netG.conns.forEach(c => c.send(m)), e => { throw e; }, c => netG.roster[c.peer] ? netG.roster[c.peer].id : null, m => chatG.push(m.scope), () => {}, () => '');
    postG({ type: 'apply', id: 'r_1', from: { id: 'g', name: 'GM', gm: true }, lines: [{ n: 'HP', d: -1, v: 1 }], ts: 1 }, 'gm', { ownerId: 'u_a' }, null);
    postG({ type: 'apply', id: 'r_2', from: { id: 'g', name: 'GM', gm: true }, lines: [{ n: 'HP', d: -1, v: 1 }], ts: 1 }, 'owner', { ownerId: 'u_a' }, null);
    check('H7 postApply: a GM-only card reaches no one (the GM\'s chat alone, private); an owner card reaches each of the owner\'s connections, private, never another player',
        gmOut.answer.length === 0 && j(sent) === j(['pA:apply:priv', 'pA2:apply:priv']) && j(chatG) === j(['whisper', 'whisper']), j([sent, chatG]));
    // the late joiner's chat history: the host sends the public cards rebuilt (nothing local rides along), never a private one; a client takes
    // a public card cleaned, once, and never a private or malformed one (a hostile host's)
    const nsrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const hoAt = nsrc.indexOf('function chatHistoryOf(log) {'), chatHistoryOf = new Function(nsrc.slice(hoAt, nsrc.indexOf('\n', hoAt)) + '\nreturn chatHistoryOf;')();
    const pubRec = { type: 'apply', id: 'r_pub', from: { id: 'u_a', name: 'Ana P', gm: false }, label: 'Take 3', lines: [{ n: 'HP', d: -3, v: 7 }], ts: 3 }, prvRec = Object.assign({}, pubRec, { id: 'r_prv', priv: 'gm', ts: 4 });
    const sentH = chatHistoryOf([{ from: pubRec.from, text: '', scope: 'global', ts: 3, apply: pubRec, local: 1 }, { from: prvRec.from, text: '', scope: 'whisper', ts: 4, apply: prvRec }]);
    const hiA = nsrc.indexOf('var histD = window.wpDiceCore, histF = window.wpFormula;'), hiB = nsrc.indexOf("    } else if (msg.type === 'roster' && net.role === 'client') {");
    const runHist = log => { const box = {}; new Function('msg', 'window', 'box', 'ringPush', 'ringRepaint', 'renderChat', 'ui', 'var chatLog = [], chatUnread = 0;\n' + nsrc.slice(hiA, hiB) + '\nbox.chatLog = chatLog;')({ type: 'chat-history', log }, { wpDiceCore: Dx, wpFormula: Fx }, box, () => {}, () => {}, () => {}, () => null); return box.chatLog; };
    const gotH = runHist(sentH.concat([{ from: prvRec.from, text: '', scope: 'global', ts: 4, apply: prvRec }, { from: pubRec.from, text: '', scope: 'global', ts: 5, apply: Object.assign({}, pubRec, { id: 'r_bad', lines: [] }) }, sentH[0]]));
    check('H7 chat history: the host sends a public apply card rebuilt (no local keys) and never a private one; a late joiner takes the public card once, cleaned, and never a private or malformed one',
        j(sentH) === j([{ from: pubRec.from, text: '', scope: 'global', ts: 3, apply: pubRec }]) && gotH.length === 1 && j(gotH[0]) === j({ from: pubRec.from, text: '', scope: 'global', ts: 3, apply: Dx.cleanApply(pubRec) }), j([sentH, gotH]));
    const client = (msg, from, o) => { o = o || {}; const chat = []; new Function('msg', 'conn', 'net', 'DC', 'pushChat', aiSrc)(msg, { peer: from || 'H' }, { foreign: true, syncedPeer: 'H', stream: !!o.stream }, () => Dx, m => chat.push(m)); return chat; };
    const recOk = { type: 'apply', id: 'r_abc', from: { id: 'u_a', name: 'Ana P', gm: false }, as: 'Ana', label: 'Costs', lines: [{ n: 'FP', d: -2, v: 0 }], ts: 9, priv: 'gm', evil: '<b>' };
    const got = client(recOk), fromOther = client(recOk, 'X'), inStream = client(recOk, 'H', { stream: true }), badRec = client(Object.assign({}, recOk, { lines: [{ n: '', d: 1, v: 1 }] }));
    check('H7 a client takes an apply card only from its synced host, outside the stream window, cleaned (a private one as a whisper; nothing extra rides along); a malformed one is dropped',
        got.length === 1 && got[0].scope === 'whisper' && j(got[0].apply) === j(Dx.cleanApply(recOk)) && !('evil' in got[0].apply) && fromOther.length === 0 && inStream.length === 0 && badRec.length === 0, j(got));
})());

// 1.6.0 (asked by a campaign build's session): a system apply action's change on EVERY row of an item list, through the host's char-apply
// (sliced, run for real with the real systemcore, formula engine, delta and card): worked out through the player's own view, each row's stat
// written on the host's copy (a library row's figure held as the GM's, a row of its own in its own copy), a row kept from its player passed over
// and never sent to them, one line on the card naming the list and the stat once with its rows; a list or a formula the view lacks refused
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const apSrc = (ordersSrc + '\n' + between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply')), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply');
    const dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const sysR = Sx.cleanSystem({ v: 1, name: 'R', fields: [
        { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '12', def: 'max', min: -12, hover: true }, { id: 'f_gx', key: 'GmFig', kind: 'number', def: 1, vis: 'gm' },
        { id: 'f_loc', key: 'Locs', label: 'Locations', kind: 'item-list', list: { stats: [{ key: 'Cripd', label: 'Crippled' }] } },
        { id: 'f_sec', key: 'Sec', label: 'Secrets', kind: 'item-list', vis: 'gm', list: { stats: [{ key: 'Mark', label: 'Mark' }] } }],
        items: [{ id: 'i_arm', name: 'Arm', stats: { Cripd: 2 } }],
        rolls: [{ id: 'r_m', label: 'Mend all', apply: [{ list: 'f_loc', s: 'Cripd', formula: '0', set: true }] }, { id: 'r_w', label: 'Worsen', apply: [{ list: 'f_loc', s: 'Cripd', formula: '1', add: true }, { f: 'f_hp', formula: '1' }] },
            { id: 'r_g', label: 'Mark', apply: [{ list: 'f_sec', s: 'Mark', formula: '1', add: true }] }, { id: 'r_f', label: 'Sneak', apply: [{ list: 'f_loc', s: 'Cripd', formula: 'GmFig', add: true }] }, { id: 'r_q', label: 'Spend', apply: [{ f: 'f_hp', formula: 'Ask.Q1' }], asks: [{ key: 'Q1', label: 'How many?', opts: [{ label: 'One', v: 1 }, { label: 'Three', v: 3 }] }] }] }, { F: Fx, gmView: true });
    const START = { f_loc: [{ id: 'w_a', defId: 'i_arm', qty: 1 }, { id: 'w_o', qty: 1, def: { name: 'Tail', stats: { Cripd: 1 } } }, { id: 'w_h', defId: 'i_arm', qty: 1, hid: 1 }] };
    const host = (msg, o) => {
        o = o || {};
        const camp = { id: 'k', system: sysR, items: {}, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(o.vals || START)) } } };
        const out = { answer: [], owner: [], mate: [], chat: [], logs: [], saves: 0, changed: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: false, combats: {}, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a', name: 'Ana P', location: 'm1' }, pB: { id: 'u_b', name: 'Bo P' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged: id => out.changed.push(id) }, wpDiceCore: null };
        const sendTable = (m, ex) => net.conns.forEach(c => { if (c !== ex && c.open && net.roster[c.peer]) c.send(m); });
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + paSrc + '\n' + apSrc)(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), sendTable, m => out.chat.push(JSON.parse(JSON.stringify(m))), (k, t) => out.logs.push(k + ': ' + t), r => Dx.applyText(r));
        out.vals = camp.chars.c_1.values; return out;
    };
    const A = act => ({ type: 'char-apply', rid: 'a1', charId: 'c_1', act: act }), card = list => list.filter(m => m.type === 'apply');
    const m1 = host(A('r_m')), cM = card(m1.owner)[0] || {}, dM = m1.owner.filter(m => m.type === 'charDelta')[0] || {};
    check('1.6.0 every row of a list, char-apply (the host, run for real): the owner\'s Mend all sets Crippled to 0 on each row of Locations it moves through their own view, the library row\'s figure held as the GM\'s and the row of its own in its own copy, the row kept from them passed over: one ack, one save, the list in the owner\'s delta with no word of the hidden row, and one line on the card, Set with its figure, the owner\'s and the GM\'s alone',
        j(m1.answer) === j([{ type: 'char-ack', rid: 'a1' }]) && j(m1.vals.f_loc) === j([{ id: 'w_a', defId: 'i_arm', qty: 1, ov: { stats: { Cripd: 0 }, held: ['Cripd'] } }, { id: 'w_o', qty: 1, def: { name: 'Tail', stats: { Cripd: 0 } } }, { id: 'w_h', defId: 'i_arm', qty: 1, hid: 1 }]) && m1.saves === 1 && j(m1.changed) === j(['c_1'])
        && dM.values && Array.isArray(dM.values.f_loc) && j(m1.owner).indexOf('w_h') < 0 && j(cM.lines) === j([{ n: 'Locations: Crippled (2 rows)', s: 1, v: 0 }]) && cM.priv === 'gm' && Dx.cleanApply(cM) !== null && card(m1.mate).length === 0
        && m1.chat.length === 1 && /applied Mend all: Locations: Crippled \(2 rows\) set → 0$/.test(m1.logs[0] || ''), j([m1.answer, m1.vals, m1.owner, m1.logs]));
    const w1 = host(A('r_w')), cW = card(w1.owner)[0] || {};
    check('1.6.0 every row of a list, char-apply: Add 1 on every row beside a field\'s change, in one press: each row moved by the amount, the card saying the amount on each row and then the field as ever',
        j(w1.vals.f_loc.map(r => r.def ? r.def.stats.Cripd : r.ov ? r.ov.stats.Cripd : null)) === j([3, 2, null]) && j(w1.vals.f_hp) === j({ cur: 11 }) && j(cW.lines) === j([{ n: 'Locations: Crippled (2 rows)', d: 1 }, { n: 'HP', d: -1, v: 11 }]) && Dx.cleanApply(cW) !== null, j([w1.vals, cW]));
    const q1 = host(Object.assign(A('r_q'), { ask: { Q1: 1 } })), q0 = host(A('r_q')), qX = host(Object.assign(A('r_q'), { ask: { Q1: 7 } })), qP = host(Object.assign(A('r_m'), { ask: { Q1: 1 } })), cQ = card(q1.owner)[0] || {};
    check('1.6.2 an action that asks, char-apply (the host, run for real): what it changes reads the answer they picked, and the card says it; a press that names none takes the first; an answer not offered and an answer to an action that asks nothing are refused with nothing moved',
        j(q1.vals.f_hp) === j({ cur: 9 }) && j(cQ.asked) === j([{ l: 'How many?', w: 'Three' }]) && !!Dx.cleanApply(cQ) && j(Dx.cleanApply(cQ).asked) === j(cQ.asked) && j(q0.vals.f_hp) === j({ cur: 11 }) && qX.answer[0].type === 'char-deny' && !qX.vals.f_hp && qP.answer[0].type === 'char-deny', j([q1.vals, cQ, q0.vals, qX.answer, qP.answer]));
    const dG = host(A('r_g')), dF = host(A('r_f')), dN = host(A('r_m'), { vals: { f_loc: [{ id: 'w_a', defId: 'i_arm', qty: 1, ov: { stats: { Cripd: 0 } } }, { id: 'w_h', defId: 'i_arm', qty: 1, hid: 1 }] } });
    const quiet = r => r.owner.length === 0 && r.mate.length === 0 && r.chat.length === 0 && r.saves === 0;
    check('1.6.0 every row of a list, char-apply: an action on a GM-only list and one whose amount reads a GM-only value are not in the player\'s view ("field"); one whose rows are all at the figure already, the hidden row aside, is "none"; nothing stored, sent or saved',
        j(dG.answer.map(m => m.reason)) === j(['field']) && j(dF.answer.map(m => m.reason)) === j(['field']) && j(dN.answer.map(m => m.reason)) === j(['none']) && [dG, dF, dN].every(quiet) && j(dN.vals.f_loc[1]) === j({ id: 'w_h', defId: 'i_arm', qty: 1, hid: 1 }), j([dG.answer, dF.answer, dN.answer]));
})());
// 1.6.0 (a builder audit): an action that puts on an effect already on, through the host's char-apply (sliced, run for real with the real
// systemcore, formula engine, delta and card): by its When added again, the times added and the card's line saying which time was kept; with none,
// nothing moves, as before
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const apSrc = (ordersSrc + '\n' + between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply')), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply');
    const dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const sysE = Sx.cleanSystem({ v: 1, name: 'E', fields: [{ id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects', edit: 'owner' }],
        effects: [{ id: 'e_sl', name: 'Slowed', dur: '10 minutes', again: 'add' }, { id: 'e_dz', name: 'Dazed', dur: '10 minutes' }],
        items: [], rolls: [{ id: 'r_sl', label: 'Slow', apply: [{ fx: 'e_sl', on: true }] }, { id: 'r_dz', label: 'Daze', apply: [{ fx: 'e_dz', on: true }] }] }, { F: Fx, gmView: true });
    const host = msg => {
        const camp = { id: 'k', system: sysE, items: {}, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_fx: [{ id: 'x_s', ref: 'e_sl', on: true, t: { left: 600, at: 0 } }, { id: 'x_d', ref: 'e_dz', on: true, t: { left: 600, at: 0 } }] } } } };
        const out = { answer: [], owner: [], mate: [], chat: [], logs: [], saves: 0, changed: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: false, combats: {}, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a', name: 'Ana P', location: 'm1' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged: id => out.changed.push(id) }, wpDiceCore: null };
        const sendTable = (m, ex) => net.conns.forEach(c => { if (c !== ex && c.open && net.roster[c.peer]) c.send(m); });
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + paSrc + '\n' + apSrc)(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), sendTable, m => out.chat.push(JSON.parse(JSON.stringify(m))), (k, t) => out.logs.push(k + ': ' + t), r => Dx.applyText(r));
        out.vals = camp.chars.c_1.values; return out;
    };
    const A = act => ({ type: 'char-apply', rid: 'a1', charId: 'c_1', act: act }), card = list => list.filter(m => m.type === 'apply');
    const s1 = host(A('r_sl')), cS = card(s1.owner)[0] || {}, d1 = host(A('r_dz'));
    check('1.6.0 (a builder audit) When added again on the host, char-apply (run for real): the owner\'s Slow puts on Slowed, which is on with 600 s left and set to Add the times, so its 600 s are added, 1200 s left, one ack and one save, and the card\'s line says on and which time was kept, which a player\'s app takes (dicecore cleanApply); Daze, whose effect has no When added again and is on already, moves nothing, as before, and its refusal says so, not the bare Nothing to apply (found by hand on a table: a press read as a dead button)',
        j(s1.answer) === j([{ type: 'char-ack', rid: 'a1' }]) && s1.saves === 1 && s1.vals.f_fx[0].t.left === 1200 && j(s1.vals.f_fx[1]) === j({ id: 'x_d', ref: 'e_dz', on: true, t: { left: 600, at: 0 } })
        && j(cS.lines) === j([{ n: 'Slowed', fx: 1, roll: 'the times added, 20 min left' }]) && !!Dx.cleanApply(cS) && j(Dx.cleanApply(cS).lines) === j(cS.lines)
        && j(d1.answer.map(m => m.reason)) === j(['none']) && d1.answer[0].msg === 'Dazed is on already.' && d1.saves === 0 && d1.owner.length === 0, j([s1.answer, s1.vals, cS, d1.answer]));
})());
// 1.6.0 (asked by a campaign build's session): a change on every row of a list whose amount reads each row's own names (Row.*), through the
// host's char-apply (sliced, run for real with the real systemcore, formula engine, delta and card): worked out row by row through the player's
// own view, the severing example clearing a crippling and keeping a severing, a figure that differs by row carded as set with no figure, and a
// change whose row names read a GM-only value not in the player's view
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const apSrc = (ordersSrc + '\n' + between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply')), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply');
    const dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const sysW = Sx.cleanSystem({ v: 1, name: 'W', fields: [
        { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '12', def: 'max', min: -12, hover: true }, { id: 'f_gx', key: 'GmFig', kind: 'number', def: 1, vis: 'gm' },
        { id: 'f_loc', key: 'Locs', label: 'Locations', kind: 'item-list', list: { stats: [{ key: 'Sev', label: 'Severity' }, { key: 'Wt', label: 'Weight' }] } },
        { id: 'f_sec', key: 'Sec', label: 'Secrets', kind: 'item-list', list: { stats: [{ key: 'Mk', label: 'Mark' }], cols: [{ key: 'Hid', label: 'Hidden', formula: 'GmFig + Row.Mk' }] } }],
        items: [{ id: 'i_arm', name: 'Arm', stats: { Sev: 3, Wt: 2 } }, { id: 'i_leg', name: 'Leg', stats: { Sev: 6, Wt: 1 } }, { id: 'i_gem', name: 'Gem', stats: { Mk: 1 } }],
        rolls: [{ id: 'r_cut', label: 'Mend', apply: [{ list: 'f_loc', s: 'Sev', formula: 'if(Row.Sev >= 5, Row.Sev, 0)', set: true }] }, { id: 'r_wear', label: 'Wear', apply: [{ list: 'f_loc', s: 'Sev', formula: 'Row.Wt', add: true }] },
            { id: 'r_sec', label: 'Mark all', apply: [{ list: 'f_sec', s: 'Mk', formula: 'Row.Mk + 1', set: true }] }] }, { F: Fx, gmView: true });
    const START = { f_loc: [{ id: 'w_a', defId: 'i_arm', qty: 1 }, { id: 'w_l', defId: 'i_leg', qty: 1 }, { id: 'w_o', qty: 1, def: { name: 'Tail', stats: { Sev: 2, Wt: 4 } } }, { id: 'w_h', defId: 'i_arm', qty: 1, hid: 1 }], f_sec: [{ id: 'w_g', defId: 'i_gem', qty: 1 }] };
    const host = (msg, o) => {
        o = o || {};
        const camp = { id: 'k', system: sysW, items: {}, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(o.vals || START)) } } };
        const out = { answer: [], owner: [], mate: [], chat: [], logs: [], saves: 0, changed: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: false, combats: {}, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a', name: 'Ana P', location: 'm1' }, pB: { id: 'u_b', name: 'Bo P' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged: id => out.changed.push(id) }, wpDiceCore: null };
        const sendTable = (m, ex) => net.conns.forEach(c => { if (c !== ex && c.open && net.roster[c.peer]) c.send(m); });
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + paSrc + '\n' + apSrc)(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), sendTable, m => out.chat.push(JSON.parse(JSON.stringify(m))), (k, t) => out.logs.push(k + ': ' + t), r => Dx.applyText(r));
        out.vals = camp.chars.c_1.values; return out;
    };
    const A = act => ({ type: 'char-apply', rid: 'a1', charId: 'c_1', act: act }), card = list => list.filter(m => m.type === 'apply');
    const sevOf = r => r.def ? r.def.stats.Sev : r.ov && r.ov.stats ? r.ov.stats.Sev : null;
    const m1 = host(A('r_cut')), cM = card(m1.owner)[0] || {};
    check('1.6.0 every row of a list worked out row by row, char-apply (the host, run for real): the owner\'s Mend, Set to if(Row.Sev >= 5, Row.Sev, 0), clears the crippling of 3 and of 2 and keeps the severing of 6, each row read through their own view, the row kept from them passed over: one ack, one save, one line on the card, Set with its figure where every row moved to the same one',
        j(m1.answer) === j([{ type: 'char-ack', rid: 'a1' }]) && j(m1.vals.f_loc.map(sevOf)) === j([0, null, 0, null]) && j(m1.vals.f_loc[3]) === j({ id: 'w_h', defId: 'i_arm', qty: 1, hid: 1 }) && m1.saves === 1
        && j(m1.owner).indexOf('w_h') < 0 && j(cM.lines) === j([{ n: 'Locations: Severity (2 rows)', s: 1, v: 0 }]) && Dx.cleanApply(cM) !== null && card(m1.mate).length === 0
        && /applied Mend: Locations: Severity \(2 rows\) set → 0$/.test(m1.logs[0] || ''), j([m1.answer, m1.vals, m1.owner, m1.logs]));
    const w1 = host(A('r_wear')), cW = card(w1.owner)[0] || {}, s1 = host(A('r_sec'));
    check('1.6.0 every row of a list worked out row by row, char-apply: Add Row.Wt moves each row by its own Weight, and the card, the figure differing by row, says set with no figure (net.js applyLines), which a player\'s app takes (dicecore cleanApply); a change whose row names read a value worked out from a GM-only one is not in the player\'s view ("field"), nothing stored, sent or saved',
        j(w1.vals.f_loc.map(sevOf)) === j([5, 7, 6, null]) && j(cW.lines) === j([{ n: 'Locations: Severity (3 rows)', s: 1, mv: 1 }]) && Dx.cleanApply(cW) !== null && /applied Wear: Locations: Severity \(3 rows\) moved row by row$/.test(w1.logs[0] || '') /* the pre-Sunday review: an Add carded as moved row by row (moved on purpose) */
        && j(s1.answer.map(m => m.reason)) === j(['field']) && s1.owner.length === 0 && s1.saves === 0 && j(s1.vals.f_sec) === j(START.f_sec), j([w1.vals, cW, s1.answer]));
})());

// Stage 6 HUD H7b: a list's apply action on the wire — the owner's press names its row ({ f, r, i }); the host finds the list and its action in
// THEIR view, works the amounts out through that row's names (a row they cannot see is gone), and a row of a GM-only item keeps the card between
// them and the GM (sliced char-apply + postApply, run for real; here the presser's connection is the table's own, so a card to them is seen)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const apSrc = (ordersSrc + '\n' + between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply')), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply');
    const dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const sysL = Sx.cleanSystem({ v: 1, name: 'L', rolls: [], fields: [
        { id: 'f_g', key: 'GMFig', kind: 'number', def: 3, vis: 'gm' },
        { id: 'f_fp', key: 'FP', kind: 'resource', maxFormula: '10', def: 'max', min: 0, edit: 'gm' },
        { id: 'f_ep', key: 'EP', kind: 'resource', maxFormula: '6', def: 'max', min: 0, edit: 'owner', hover: true },
        { id: 'f_pw', key: 'Powers', kind: 'item-list', edit: 'owner', list: { noQty: true, stats: [{ key: 'FPCost' }, { key: 'EPCost' }], cols: [{ key: 'Sly', label: 'Sly', formula: 'Row.FPCost + GMFig' }],
            rolls: [{ label: 'Use', formula: '3d6' }, { label: 'Costs', apply: [{ f: 'f_fp', formula: 'Row.FPCost' }, { f: 'f_ep', formula: 'Row.EPCost' }] }, { label: 'Sly', apply: [{ f: 'f_ep', formula: 'Row.Sly' }] }, { label: 'Tire', apply: [{ f: 'f_ep', formula: 'Row.EPCost' }] }] } },
        { id: 'f_gl', key: 'GMList', kind: 'item-list', vis: 'gm', list: { rolls: [{ label: 'G', apply: [{ f: 'f_ep', formula: '1' }] }] } }],
        items: [{ id: 'i_push', name: 'Ether Push', stats: { FPCost: 3, EPCost: 2 } }, { id: 'i_dark', name: 'Dark', vis: 'gm', stats: { FPCost: 1, EPCost: 1 } }] }, { F: Fx, gmView: true });
    const START = { f_fp: { cur: 5 }, f_pw: [{ id: 'w_1', defId: 'i_push' }, { id: 'w_2', defId: 'i_dark' }, { id: 'w_3', defId: 'i_push', hid: 1 }], f_gl: [{ id: 'w_g', defId: 'i_push' }] };
    const host = (msg, sysX) => {
        const camp = { id: 'k', system: sysX || sysL, items: {}, chars: { c_1: { id: 'c_1', name: 'Jed', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(START)) } } };
        const out = { owner: [], mate: [], chat: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conns = [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }];
        const net = { active: true, role: 'host', paused: false, combats: {}, conns, roster: { pA: { id: 'u_a', name: 'Jed P' }, pB: { id: 'u_b', name: 'Bo P' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + paSrc + '\n' + apSrc)(
            msg, conns[0], net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), (m, ex) => conns.forEach(c => { if (c !== ex && c.open && net.roster[c.peer]) c.send(m); }), m => out.chat.push(JSON.parse(JSON.stringify(m))), () => {}, r => Dx.applyText(r));
        out.vals = camp.chars.c_1.values; return out;
    };
    const R = (r, i, extra) => Object.assign({ type: 'char-apply', rid: 'a1', charId: 'c_1', row: { f: 'f_pw', r: r, i: i } }, extra || {});
    const typ = list => list.map(m => m.type + (m.reason ? ':' + m.reason : '') + (m.priv ? ':priv' : ''));
    const r1 = host(R('w_1', 1, { label: 'Ether Push · Costs' })), c1 = r1.owner.find(m => m.type === 'apply') || {};
    check('H7b char-apply on a row: the owner\'s Apply costs on Ether Push reads that row (FP 5 - 3, a "GM edits" pool, and EP 6 - 2) and is acked; the card, labeled with the item, goes to the owner and the GM only (FP is not on hover)',
        j(r1.vals.f_fp) === j({ cur: 2 }) && j(r1.vals.f_ep) === j({ cur: 4 }) && r1.owner.some(m => m.type === 'char-ack') && c1.label === 'Ether Push · Costs' && c1.priv === 'gm' && j(c1.lines) === j([{ n: 'FP', d: -3, v: 2 }, { n: 'EP', d: -2, v: 4 }]) && !r1.mate.some(m => m.type === 'apply'),
        j([typ(r1.owner), typ(r1.mate), r1.vals]));
    const r2 = host(R('w_2', 3)), c2 = r2.owner.find(m => m.type === 'apply') || {};
    check('H7b char-apply on a row of a GM-only item (shown to its owner inline): applied, and its card goes to the presser and the GM alone, even though EP is shown on hover',
        j(r2.vals.f_ep) === j({ cur: 5 }) && c2.priv === 'gm' && !r2.mate.some(m => m.type === 'apply') && r2.chat.length === 1 && r2.chat[0].scope === 'whisper', j([typ(r2.owner), typ(r2.mate)]));
    const t1 = host(R('w_1', 3)), cT = t1.owner.find(m => m.type === 'apply') || {};
    check('H7b char-apply on a visible row moving a pool shown on hover: its card goes to the whole table', j(t1.vals.f_ep) === j({ cur: 4 }) && !('priv' in cT) && t1.mate.some(m => m.type === 'apply'), j([typ(t1.owner), typ(t1.mate)]));
    const dH = host(R('w_3', 1)), dRoll = host(R('w_1', 0)), dSly = host(R('w_1', 2)), dList = host(Object.assign(R('w_1', 1), { row: { f: 'f_zz', r: 'w_1', i: 1 } })), dNone = host(R('w_9', 1)), dGl = host(Object.assign(R('w_g', 0), { row: { f: 'f_gl', r: 'w_g', i: 0 } }));
    const quietL = r => j(r.vals) === j(START) && r.chat.length === 0 && r.saves === 0 && r.mate.length === 0;
    check('H7b char-apply refusals on a row: a kept curse\'s row or one that is not there ("missing"), a list roll, a list that is not theirs or a GM-only list\'s action ("field"), an amount through a column that is GM only in their view ("error", with its message) — nothing moved',
        j(typ(dH.owner)) === j(['char-deny:missing']) && j(typ(dNone.owner)) === j(['char-deny:missing']) && j(typ(dRoll.owner)) === j(['char-deny:field']) && j(typ(dList.owner)) === j(['char-deny:field']) && j(typ(dGl.owner)) === j(['char-deny:field'])
        && j(typ(dSly.owner)) === j(['char-deny:error']) && /GM only/.test(dSly.owner[0].msg || '') && [dH, dNone, dRoll, dList, dSly, dGl].every(quietL),
        j([dH.owner, dNone.owner, dRoll.owner, dList.owner, dSly.owner]));
    // the core handbook session's ask (b) (2026-10-29): a list action keeps its needs, and the host judges a player's press of it by them, on the row
    const rawNd = JSON.parse(JSON.stringify(sysL)); rawNd.fields[3].list.counters = [{ key: 'Charges' }]; rawNd.fields[3].list.rolls.push({ label: 'Zap', apply: [{ f: 'f_ep', formula: '1' }], needs: 'Row.Charges >= 1', needsText: 'Out of charges' }, { label: 'Calm', apply: [{ f: 'f_ep', formula: '1' }], needs: 'Row.Charges < 1' });
    const sysNd = Sx.cleanSystem(rawNd, { F: Fx, gmView: true }), nZap = host(R('w_1', 4), sysNd), nCalm = host(R('w_1', 5), sysNd);
    check('the core handbook session\'s ask (b): a player\'s press of a list\'s apply action on a row that does not meet its needs is refused in its words ("error", Out of charges), nothing moved, nothing saved; one whose needs hold is applied (EP 6 - 1)',
        j(typ(nZap.owner)) === j(['char-deny:error']) && nZap.owner[0].msg === 'Out of charges' && quietL(nZap) && j(nCalm.vals.f_ep) === j({ cur: 5 }) && nCalm.owner.some(m => m.type === 'char-ack'), j([nZap.owner, typ(nCalm.owner), nCalm.vals]));
    const nsrcL = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n'), caAt = nsrcL.indexOf('net.charApply = function(charId, actId, label, row, on, ask) {'), caSrc = nsrcL.slice(caAt, nsrcL.indexOf('\n};', caAt) + 3);
    const clientReq = (calls, o) => { o = o || {}; const sent = [], pend = {}, camp = { system: sysL, chars: { c_1: { id: 'c_1', ownerId: 'u_a' }, c_2: { id: 'c_2', ownerId: 'u_b' } } }, conn = { peer: 'H', open: true, send: m => sent.push(JSON.parse(JSON.stringify(m))) };
        const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'H', myId: 'u_a', conns: [conn] };
        const run = new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', caSrc + '\nreturn net.charApply;')(netC, () => Sx, () => camp, { wpVtt: { on: () => true } }, pend, () => {}, () => 0);
        const res = calls.map(a => run.apply(null, a)); return { sent, res }; };
    const cr = clientReq([['c_1', null, 'x'.repeat(70), { f: 'f_pw', r: 'w_1', i: 1 }], ['c_1', 'r_x', 'Again']]), cr2 = clientReq([['c_1', 'r_x', 'Take 3']]), cr3 = clientReq([['c_2', 'r_x', 'Nope']]);
    check('H7b net.charApply (the player\'s request, run for real): a list action sends its row ({ f, r, i }) and no act, the label cut to 60; a system action sends its id; a second press while one waits is held; another player\'s character is refused',
        cr.sent.length === 1 && j(Object.keys(cr.sent[0]).sort()) === j(['charId', 'label', 'rid', 'row', 'type']) && j(cr.sent[0].row) === j({ f: 'f_pw', r: 'w_1', i: 1 }) && cr.sent[0].label.length === 60 && Sx.cleanCharApply(cr.sent[0]) !== null
        && cr.res[1].error === 'Waiting for the GM to apply the last one.' && j(cr2.sent) === j([{ type: 'char-apply', rid: cr2.sent[0].rid, charId: 'c_1', act: 'r_x', label: 'Take 3' }]) && cr3.sent.length === 0 && cr3.res[0].error === 'That character is not yours.',
        j([cr.sent, cr.res, cr2.sent, cr3.res]));
})());

// Stage 6 HUD R1: a roll's consequences on the wire. A player's roll that names its entry is rebuilt by the host from the entry's own formula
// (their modifier and advantage as data) — a made-up formula is refused, so a hit cannot be faked; its consequences land on the host's copy through
// the player's own view (success, failure, always; Set to), with one delta. The GM's own roll applies them where it is made (sliced, run for real)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src2 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src2.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src2.slice(i, src2.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const sysT = Sx.cleanSystem({ v: 1, name: 'T', fields: [
        { id: 'f_hits', key: 'Hits', kind: 'number', def: 0, min: 0, max: 9, edit: 'gm' }, { id: 'f_fp', key: 'FP', kind: 'resource', maxFormula: '10', min: 0, def: 'max' }, { id: 'f_g', key: 'GMFig', kind: 'number', def: 1, vis: 'gm' }],
        rolls: [
            { id: 'r_win', label: 'Win', formula: '3d6 <= 30', then: [{ f: 'f_hits', formula: '1', add: true, when: 'hit' }, { f: 'f_hits', formula: '0', set: true, when: 'miss' }] },
            { id: 'r_lose', label: 'Lose', formula: '3d6 <= 0', then: [{ f: 'f_hits', formula: '1', add: true, when: 'hit' }, { f: 'f_hits', formula: '0', set: true, when: 'miss' }, { f: 'f_fp', formula: '1' }] },
            { id: 'r_d20', label: 'Adv', formula: 'd20 >= 1', then: [{ f: 'f_hits', formula: '2', add: true, when: 'hit' }] },
            { id: 'r_plain', label: 'Plain', formula: 'd6' },
            { id: 'r_sec', label: 'Sec', formula: '3d6 <= 30', then: [{ f: 'f_hits', formula: 'GMFig', add: true }] },
            { id: 'r_gm', label: 'GM', formula: '3d6 <= 30', vis: 'gm', then: [{ f: 'f_hits', formula: '1', add: true }] },
            { id: 'r_same', label: 'Same', formula: '3d6 <= 30', then: [{ f: 'f_hits', formula: '3', set: true }] }] }, { F: Fx, gmView: true });
    const START = { f_hits: 3 };
    const runQ = (msg, o) => { o = o || {}; const out = { table: [], sent: [], deltas: [], saves: 0 };
        const camp = { id: 'k', activeItemId: 'm1', system: sysT, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(START)) } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, () => { out.saves++; });
        out.vals = camp.chars.c_a.values; return out; };
    const qWin = runQ({ act: 'r_win', expr: '3d6 <= 30' }), qLose = runQ({ act: 'r_lose', expr: '3d6 <= 0' });
    check('R1 a player\'s roll with consequences: on success (Win) Hits + 1, on failure (Lose) Hits set to 0 and FP - 1 always — on the host\'s copy, through their view, with one delta and a save, after the roll went to the table',
        qWin.table.length === 1 && j(qWin.vals.f_hits) === '4' && j(qWin.deltas) === j([['c_a', { f_hits: 4 }]]) && qWin.saves === 1
        && qLose.table.length === 1 && j(qLose.vals) === j({ f_hits: 0, f_fp: { cur: 9 } }) && j(qLose.deltas) === j([['c_a', { f_hits: 0, f_fp: { cur: 9 } }]]), j([qWin.vals, qWin.deltas, qLose.vals, qLose.deltas]));
    const wMod = Dx.composeModifier('3d6 <= 30', 2, Fx.parse).expr, qMod = runQ({ act: 'r_win', expr: wMod, mod: 2 }), aAdv = Dx.withAdvantage('d20 >= 1', 'adv', Fx.parse).expr, qAdv = runQ({ act: 'r_d20', expr: aAdv, adv: 'adv' });
    const qFake = runQ({ act: 'r_lose', expr: '3d6 <= 100' }), qFakeMod = runQ({ act: 'r_win', expr: '3d6 <= 30', mod: 2 }), qNoAdv = runQ({ act: 'r_d20', expr: 'd20 >= 1', adv: 'dis' });
    const refused = q => q.table.length === 0 && q.deltas.length === 0 && j(q.vals) === j(START) && q.sent.length === 1 && q.sent[0].type === 'roll-deny' && q.sent[0].message === 'That roll does not match its button now.';
    check('R1 the host rebuilds the formula from the entry (advantage, then the modifier): a shift-click modifier or advantage sent as data is rolled and applies its consequences; a formula that is not the entry\'s (a made-up target, a modifier it does not carry, the wrong advantage) is refused with nothing rolled or changed',
        qMod.table.length === 1 && qMod.table[0].expr === wMod && j(qMod.vals.f_hits) === '4' && qAdv.table.length === 1 && qAdv.table[0].expr === aAdv && j(qAdv.vals.f_hits) === '5' && [qFake, qFakeMod, qNoAdv].every(refused),
        j([qMod.table.map(r => r.expr), qAdv.table.map(r => r.expr), qFake.sent, qFakeMod.sent, qNoAdv.sent]));
    const qGm = runQ({ act: 'r_gm', expr: '3d6 <= 30' }), qSec = runQ({ act: 'r_sec', expr: '3d6 <= 30' }), qPlain = runQ({ act: 'r_plain', expr: 'd6' });
    {   // 1.6.3 (the improvement week's review of sheets and rolls, finding 1): a Then that lands lines but moves no stored value (a Set to the figure
        // already held) is not stored, saved, sent or drawn: the roll still goes to the table; and the GM's own roll (net.diceRoll's restR) asks the same
        const qSame = runQ({ act: 'r_same', expr: '3d6 <= 30' }), drS = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
        check('1.6.3 (finding 1) a roll whose Then moves nothing (a Set to the figure already held) goes to the table and stores, saves and sends nothing (the host\'s roll-req branch, run for real); the GM\'s own roll judges what moved the same way before it saves',
            qSame.table.length === 1 && qSame.deltas.length === 0 && qSame.saves === 0 && j(qSame.vals) === j(START) && qWin.saves === 1
                && /var mvR = !!taR && taR\.ok && \(!!taR\.gone \|\| Object\.keys\(taR\.values\)\.some\(/.test(drS) && /if \(taR && taR\.ok && mvR && \(!onR \|\| Object\.keys\(taR\.values\)\.length\)\) \{/.test(drS), j([qSame.table.length, qSame.deltas, qSame.saves]));
    }
    check('R1 an entry the player\'s view does not have (a GM-only roll) is refused; one whose consequences name a GM-only value rolls with none (their view dropped them); a roll with none changes nothing',
        refused(qGm) && qSec.table.length === 1 && qSec.deltas.length === 0 && j(qSec.vals) === j(START) && qPlain.table.length === 1 && qPlain.deltas.length === 0, j([qGm.sent, qSec.deltas, qPlain.deltas]));
    // the player's side: net.diceRoll's client branch sends the entry, its modifier and advantage as data (never with a row)
    const runC = (expr, o) => { const sent = []; const conn = { peer: 'H', open: true, send: m => sent.push(JSON.parse(JSON.stringify(m))) };
        const net = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'H', conns: [conn], roster: {} };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'setTimeout', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true } }, () => ({ id: 'k', system: sysT, chars: {} }), () => ({ id: 'u_a', name: 'Pat' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => {}, () => 0);
        const ret = dr(expr, o); return { ret, sent }; };
    const cA = runC('3d6 <= (30) + 2', { charId: 'c_a', act: 'r_win', mod: 2, adv: 'adv', label: 'Win' }), cR = runC('d6', { charId: 'c_a', act: 'r_win', row: { f: 'f_w', r: 'w_1' } }), cP = runC('d6', { charId: 'c_a' });
    check('R1 the player\'s request (net.diceRoll, run for real): a roll with consequences sends act, mod and adv beside its formula (the host rebuilds and checks it); a row roll sends no act; a plain roll neither',
        cA.sent.length === 1 && cA.sent[0].act === 'r_win' && cA.sent[0].mod === 2 && cA.sent[0].adv === 'adv' && Dx.cleanRollReq(cA.sent[0]) !== null && cR.sent.length === 1 && !('act' in cR.sent[0]) && cP.sent.length === 1 && !('act' in cP.sent[0]) && !('mod' in cP.sent[0]),
        j([cA.sent, cR.sent, cP.sent]));
    // the GM's own roll: net.diceRoll applies them here, synced when hosting
    const runG = (expr, o, env) => { env = env || {}; const out = { deltas: [], saves: 0, changed: [] };
        const camp = { id: 'k', system: sysT, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(START)) } } };
        const net = { active: env.active !== false, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged: id => out.changed.push(id) } };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => { out.saves++; });
        out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o || {})); out.vals = camp.chars.c_a.values; return out; };
    const gWin = runG('3d6 <= 30', { act: 'r_win' }), gOff = runG('3d6 <= 0', { act: 'r_lose' }, { active: false }), gNo = runG('3d6 <= 30', {});
    check('R1 the GM\'s own roll with consequences applies them where it is rolled: hosting, one delta and a save; offline, a save and no delta; a roll that does not name its entry changes nothing',
        gWin.ret.ok && j(gWin.vals.f_hits) === '4' && j(gWin.deltas) === j([['c_a', { f_hits: 4 }]]) && gWin.saves === 1 && j(gWin.changed) === j(['c_a'])
        && gOff.ret.ok && j(gOff.vals) === j({ f_hits: 0, f_fp: { cur: 9 } }) && gOff.deltas.length === 0 && gOff.saves === 1 && gNo.ret.ok && j(gNo.vals) === j(START) && gNo.saves === 0,
        j([gWin.vals, gWin.deltas, gOff.vals, gNo.vals]));
    {   // the review of the speed fold: the GM's own roll (net.diceRoll's restR) run for real, as the host's branch for a player's roll is above: a Then
        // that sets a value already held stores, saves, sends and draws nothing; one that moves a value, and one that uses a row up (taR.gone), store,
        // save, send and draw as before (the row's own list moves too, so a row used up is stored whether or not its list's text would compare equal)
        const runGs = (sys, vals, expr, o) => { const out = { deltas: [], saves: 0, changed: [] };
            const camp = { id: 'k', system: sys, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(vals)) } } };
            const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
            const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged: id => out.changed.push(id), goneLocal: () => {} } };
            const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
                net, () => Dx, () => Sx, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => { out.saves++; });
            out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o || {})); out.vals = camp.chars.c_a.values; out.stamp = camp.chars.c_a.updated; return out; };
        const gSame = runGs(sysT, START, '3d6 <= 30', { act: 'r_same' }), gMove = runGs(sysT, START, '3d6 <= 30', { act: 'r_win' });
        const sysU = Sx.cleanSystem({ v: 1, name: 'U', fields: [{ id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner',
            list: { rolls: [{ label: 'Use', formula: '3d6 <= 30', then: [{ q: true, formula: '1' }] }, { label: 'Keep', formula: '3d6 <= 30', then: [{ q: true, formula: '1', set: true }] }] } }],
            items: [{ id: 'i_k', name: 'Kit', vis: 'all' }], sheet: { sections: [] } }, { F: Fx, gmView: true });
        const ROWS = { f_g: [{ id: 'w_1', defId: 'i_k', qty: 1 }] };
        const gGone = runGs(sysU, ROWS, '3d6 <= 30', { row: { f: 'f_g', r: 'w_1', i: 0 } }), gKeep = runGs(sysU, ROWS, '3d6 <= 30', { row: { f: 'f_g', r: 'w_1', i: 1 } });
        check('the review of the speed fold (finding 1, the GM\'s side run for real): the GM\'s own roll whose Then sets a value already held saves, sends and draws nothing and leaves the sheet\'s stamp; one that moves a value saves once, sends one delta and draws; one that uses a row up (its quantity to 0) stores the list without it, saves, sends and draws; one that sets the quantity it already has does none of it',
            gSame.ret.ok && gSame.saves === 0 && gSame.deltas.length === 0 && gSame.changed.length === 0 && gSame.stamp === undefined && j(gSame.vals) === j(START)
                && gMove.ret.ok && gMove.saves === 1 && j(gMove.deltas) === j([['c_a', { f_hits: 4 }]]) && j(gMove.changed) === j(['c_a'])
                && gGone.ret.ok && gGone.saves === 1 && gGone.deltas.length === 1 && j(gGone.changed) === j(['c_a']) && j(gGone.vals.f_g) === j([])
                && gKeep.ret.ok && gKeep.saves === 0 && gKeep.deltas.length === 0 && gKeep.changed.length === 0 && j(gKeep.vals) === j(ROWS),
            j([gSame.saves, gSame.deltas, gMove.saves, gGone.saves, gGone.deltas, gGone.vals, gKeep.saves, gKeep.deltas]));
    }
})());

// 1.5.9 (docs/BOOK_ES_ET_PLAN.md section 1, the book's (es)): a round fired by a roll's Then lands by the roll's verdict. The host's roll-req branch
// and the GM's own net.diceRoll, each sliced and run for real: a hit calls the board's wpLaunchHit with the roller's target, a miss its wpLaunchMiss
// with the verdict's margin and whether it was a critical failure, never both, a jam neither; the board decides where a miss lands
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const srcL = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = srcL.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return srcL.slice(i, srcL.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply');
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const sysL = Sx.cleanSystem({ v: 1, name: 'L', combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', checks: 'under3d6' }, fields: [
        { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { multi: true, chamber: { from: 'f_gear', cats: ['Round'], cap: 2 },
            rolls: [{ label: 'Shoot', formula: '3d6 <= 10', then: [{ fire: true }] }, { label: 'Careful', formula: '3d6 <= 10', then: [{ fire: true, when: 'hit' }] }] } }],
        items: [{ id: 'i_tube', name: 'Spark Tube', category: 'Launcher', vis: 'all' }, { id: 'i_fizz', name: 'Fizz Grenade', category: 'Round', vis: 'all', damage: '3d6', area: { ft: 6, flight: 'scatter' } }], sheet: { sections: [] } }, { F: Fx, gmView: true });
    const rowsL = () => [{ id: 'w_t', defId: 'i_tube', qty: 1, rd: [{ defId: 'i_fizz' }, { defId: 'i_fizz' }] }];
    const fixedF = v => Object.assign({}, Fx, { evaluate: (t, o) => Fx.evaluate(t, o && o.random ? o : Object.assign({}, o, { random: () => v })) });
    const callsOf = () => { const c = { hit: [], miss: [] }; return { c, win: { wpLaunchHit: o => { c.hit.push(JSON.parse(JSON.stringify(o))); return null; }, wpLaunchMiss: o => { c.miss.push(JSON.parse(JSON.stringify(o))); return null; } } }; };
    // the review of fold 2: a system whose checks are no 3d6 roll-under (a d20's), whose natural 1 is a critical failure as a throw reads it (dicecore checkOf)
    const sysD = Sx.cleanSystem(Object.assign(JSON.parse(JSON.stringify(sysL)), { combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }, fields: JSON.parse(JSON.stringify(sysL.fields)).map(f => (f.list.rolls.forEach(r => { r.formula = '1d20 + 5 >= 15'; }), f)) }), { F: Fx, gmView: true });
    const runQ = (ri, fv, aimed, sysX, exprX, rowsX) => {
        const camp = { id: 'k', activeItemId: 'm1', system: sysX || sysL, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: { f_gear: rowsX || rowsL() } } }, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't_a', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 100 }, { id: 't_foe', isChar: true, charId: 'c_foe', x: 300, y: 100 }] } } }, sent = [], chats = [];
        const conn = { peer: 'pA', open: true, send(m) { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }, { c, win } = callsOf();
        const net = { active: true, role: 'host', paused: false, conns: [conn], roster: { pA: { id: 'u_a', name: 'Pebbles', location: 'm1' } }, combats: {}, syncCharDelta() {} };
        Object.assign(win, { wpFormula: fixedF(fv), wpSheets: { playerSystem: cc => Sx.cleanSystem(cc.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } });
        let err = '';
        try { new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'pushChat', 'applyLine', 'rangeTo', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + paSrc + '\n' + rqSrc)(
            { type: 'roll-req', rid: 'q1', charId: 'c_a', expr: exprX || '3d6 <= 10', row: { f: 'f_gear', r: 'w_t', i: ri } }, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, () => {}, () => {}, () => {}, () => {}, m => chats.push(JSON.parse(JSON.stringify(m))), r => Dx.applyText(r),
            aimed ? () => ({ mod: 0, dist: 6, tid: 't_foe', mapId: 'm1' }) : () => null); } catch (e) { err = String(e && e.stack || e).slice(0, 400); }
        return { err, c, fd: camp.chars.c_a.values.f_gear[0].fd ? 1 : 0, rd: camp.chars.c_a.values.f_gear[0].rd, sent, chats }; };
    {   // 1.6.0 Feeds: the host's roll branch and the GM's own net.diceRoll, run for real: any feed at 0 stops the shot in words before a die is rolled, from the host's own copy of the row, and a shot that goes takes 1 from every feed
        const sysF = Sx.cleanSystem({ v: 1, name: 'F', combat: { checks: 'under3d6' }, rolls: [], fields: [
            { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { counters: [{ key: 'cell', label: 'Cell' }, { key: 'clip', label: 'Clip' }], feeds: [{ key: 'power', from: 'f_cells', ct: 'cell' }, { key: 'clip', from: 'f_cells', ct: 'clip' }], rolls: [{ label: 'Shoot', formula: '3d6 <= 10', then: [{ feed: true }] }] } },
            { id: 'f_cells', key: 'Cells', label: 'Cells', kind: 'item-list', vis: 'all', edit: 'owner', list: { lvl: { label: 'Juice', min: 0, max: 100, def: 0 } } }],
            items: [{ id: 'i_tube', name: 'Spark Tube', category: 'Tool', vis: 'all' }], sheet: { sections: [] } }, { F: Fx, gmView: true });
        const rowsF = ct => [{ id: 'w_t', defId: 'i_tube', qty: 1, ct }];
        const fq = ct => { const rows = rowsF(ct), r = runQ(0, 3, false, sysF, '3d6 <= 10', rows); return { r, ct: rows[0].ct }; }, dryQ = fq({ cell: 5, clip: 0 }), goQ = fq({ cell: 5, clip: 2 });
        const dryAns = dryQ.r.sent.filter(m => m.type === 'roll-deny')[0];
        check('1.6.0 Feeds, the host\'s roll branch: a shot with a feed at 0 is refused in words naming that feed and moves nothing; with every feed holding it rolls, and the changes the Then makes go through the host',
            !dryQ.r.err && !!dryAns && /Clip is empty\./.test(JSON.stringify(dryAns)) && j(dryQ.ct) === j({ cell: 5, clip: 0 }) && !goQ.r.err && !goQ.r.sent.some(m => m.type === 'roll-deny'), j([dryQ.r.err, dryQ.r.sent, goQ.r.err, goQ.r.sent.map(m => m.type)]));
        const srcN = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8');
        check('1.6.0 Feeds, the GM\'s own roll and the wire: net.diceRoll asks the same judge after a roll\'s needs, a player\'s load sends feed and more and waits for the host, whose answer in words reaches them, and each step is logged by structure alone',
            /var fsR = entR && o\.row && campR && campR\.system && typeof SR\.feedShortOf === 'function' \? SR\.feedShortOf\(campR\.system, chR, o\.row, entR, F, tcR\) : ''; if \(fsR\)/.test(srcN) && srcN.includes("'drop', 'feed', 'more', 'ov', 'at'].forEach(function(k)") && srcN.includes("window.wpStepLog('feed v1', 'changed', { how: qi.from === null ? 'unload' : qi.more ? 'stack' : 'swap', by: 'player' })") && srcN.includes("if (ptW || q.op === 'load' ||"));
    }
    const qHit = runQ(0, 3, true), qMiss = runQ(0, 5, true), qFum = runQ(0, 6, true), qNoAim = runQ(0, 5, false), qHitOnly = runQ(1, 5, true);
    const qD1 = runQ(0, 1, true, sysD, '1d20 + 5 >= 15'), qD2 = runQ(0, 2, true, sysD, '1d20 + 5 >= 15');
    check('1.5.9 (es), the review of fold 2: a launched round\'s critical failure is read as a throw\'s is, by the system\'s own criticals (dicecore checkOf), so a d20 system\'s natural 1 on the roll-req branch, run for real, says fumble to wpLaunchMiss, and a 2 that misses says none; the 3d6 system\'s as before',
        !qD1.err && qD1.c.hit.length === 0 && qD1.c.miss.length === 1 && qD1.c.miss[0].crit === 'fumble' && qD1.c.miss[0].margin === -9
        && !qD2.err && qD2.c.miss.length === 1 && qD2.c.miss[0].crit === '' && qD2.c.miss[0].margin === -8,
        j([qD1, qD2]));
    check('1.5.9 (es) a launched round lands by the roll\'s verdict on the host (the roll-req branch, run for real with the real core and dice core): a hit that fires a chambered round calls the board\'s wpLaunchHit with the roller\'s target, and never wpLaunchMiss; a miss that fires calls wpLaunchMiss with the round fired, the roller\'s target and map and the verdict\'s own margin (15 against 10: -5), and never wpLaunchHit; a critical failure says fumble; a miss with no target pointed at still calls it, with no target, so the board says to place it; a Then that fires on a hit alone fires nothing on a miss and calls neither',
        !qHit.err && qHit.c.hit.length === 1 && qHit.c.miss.length === 0 && j(qHit.c.hit[0]) === j({ charId: 'c_a', fieldId: 'f_gear', rowId: 'w_t', tid: 't_foe', mapId: 'm1', margin: qHit.c.hit[0].margin }) && typeof qHit.c.hit[0].margin === 'number'
        && !qMiss.err && qMiss.c.hit.length === 0 && j(qMiss.c.miss) === j([{ charId: 'c_a', fieldId: 'f_gear', rowId: 'w_t', tid: 't_foe', mapId: 'm1', margin: -5, crit: '' }]) && qMiss.fd === 1
        && qFum.c.hit.length === 0 && qFum.c.miss.length === 1 && qFum.c.miss[0].crit === 'fumble' && qFum.c.miss[0].margin === -8
        && qNoAim.c.hit.length === 0 && j(qNoAim.c.miss) === j([{ charId: 'c_a', fieldId: 'f_gear', rowId: 'w_t', tid: '', mapId: '', margin: -5, crit: '' }])
        && !qHitOnly.err && qHitOnly.c.hit.length === 0 && qHitOnly.c.miss.length === 0 && qHitOnly.fd === 0,
        j([qHit, qMiss, qFum, qNoAim, qHitOnly]));
    // the GM's own roll on an NPC's launcher: net.diceRoll, the same lines
    const runG = (fv, sysX, exprX, rowsX) => { const { c, win } = callsOf(), cards = [];
        const camp = { id: 'k', system: sysX || sysL, chars: { c_a: { id: 'c_a', name: 'Kael', npc: true, values: { f_gear: rowsX || rowsL() } } } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {}, postApplyCard: (ch, label, lines, scope) => cards.push([label, JSON.parse(JSON.stringify(lines)), scope]) };
        Object.assign(win, { wpFormula: fixedF(fv), wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => ({ range: { mod: 0, dist: 6, tid: 't_foe', mapId: 'm1' } }), charChanged() {} } });
        let err = '', ret = null;
        try { const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => {});
            ret = dr(exprX || '3d6 <= 10', { charId: 'c_a', row: { f: 'f_gear', r: 'w_t', i: 0 } }); } catch (e) { err = String(e && e.stack || e).slice(0, 400); }
        return { err, ret, c, cards, rd: camp.chars.c_a.values.f_gear[0].rd }; };
    const gHit = runG(3), gMiss = runG(5), gD1 = runG(1, sysD, '1d20 + 5 >= 15'), gFum = runG(6);
    {   // 1.6.2 (the CORE session): a list roll ticked Bursts at its target sets the row's own blast off at its target on a hit, and lands it by its area's flight on a miss, on both roads
        const rawBh = { v: 1, name: 'B', combat: { checks: 'under3d6' }, fields: [{ id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { rolls: [{ label: 'Fire', formula: '3d6 <= 10', blastHit: true }, { label: 'Hurt', formula: '3d6', dmg: true, blastHit: true }] } }],
            items: [{ id: 'i_las', name: 'Big Laser', vis: 'all', damage: '8d6', area: { ft: 18, flight: 'line' } }], sheet: { sections: [] } };
        const sysBh = Sx.cleanSystem(rawBh, { F: Fx, gmView: true }), plBh = Sx.cleanSystem(rawBh, { F: Fx, gmView: false }), rowsB = () => [{ id: 'w_t', defId: 'i_las', qty: 1 }];
        const bQh = runQ(0, 3, true, sysBh, '3d6 <= 10', rowsB()), bQm = runQ(0, 5, true, sysBh, '3d6 <= 10', rowsB()), bGh = runG(3, sysBh, '3d6 <= 10', rowsB()), bGm = runG(5, sysBh, '3d6 <= 10', rowsB());
        check('1.6.2 a list roll ticked Bursts at its target, on the roll-req branch and net.diceRoll, run for real: a hit sets the row\'s own blast off at the roller\'s target, named as its own row, and a miss hands it to the area\'s On a miss, launched with the margin; both views keep the tick, never beside Damage',
            plBh.fields[0].list.rolls[0].blastHit === true && !('blastHit' in plBh.fields[0].list.rolls[1])
            && !bQh.err && bQh.c.miss.length === 0 && j(bQh.c.hit) === j([{ charId: 'c_a', fieldId: 'f_gear', rowId: 'w_t', tid: 't_foe', mapId: 'm1', margin: bQh.c.hit[0] && bQh.c.hit[0].margin, own: true }])
            && !bQm.err && bQm.c.hit.length === 0 && bQm.c.miss.length === 1 && bQm.c.miss[0].own === true && bQm.c.miss[0].margin === -5
            && !bGh.err && bGh.c.hit.length === 1 && bGh.c.hit[0].own === true && bGh.c.hit[0].rowId === 'w_t' && !bGm.err && bGm.c.miss.length === 1 && bGm.c.miss[0].own === true,
            j([plBh.fields[0].list.rolls, bQh, bQm, bGh.c, bGm.c]));
    }
    // 1.6.0: a list roll's Then moves the sheet's money, on the host (roll-req and net.diceRoll, run for real): the card goes to its owner, and too little refuses a player's whole Then in words and passes under the GM's hand
    const sysMo = Sx.cleanSystem({ v: 1, name: 'Mo', combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', checks: 'under3d6' }, sheet: { sections: [] }, fields: [{ id: 'f_ch', key: 'Chips', label: 'Chips', kind: 'item-list', vis: 'all', edit: 'owner', list: { multi: true, lvl: { label: 'Held', min: 0, max: 100000, step: 0.01, def: 0 }, money: '@lvl' } },
        { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Cost', label: 'Cost' }], counters: [{ key: 'Done', label: 'Done' }], rolls: [{ label: 'Mend', formula: '3d6 <= 10', then: [{ money: '0 - Row.Cost', when: 'hit' }, { c: 'Done', formula: '1', add: true, when: 'hit' }] }] } }],
        items: [{ id: 'i_s', name: 'Pebble Sword', stats: { Cost: 37 } }], rolls: [] }, { F: Fx, gmView: true });
    const moVals = lvl => ({ f_ch: [{ id: 'w_c', def: { name: 'Chip' }, qty: 1, lvl }], f_gear: [{ id: 'w_s', defId: 'i_s', qty: 1 }] });
    const runMoQ = (lvl, o) => { o = o || {}; const logs = [], rolled = []; const camp = { id: 'k', activeItemId: 'm1', system: o.sys || sysMo, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: moVals(lvl) } }, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't_a', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 100 }] } } }, sent = [], chats = [], toasts = [], deltas = [];
        const conn = { peer: 'pA', open: true, send(m) { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }, net = { active: true, role: 'host', paused: false, conns: [conn], roster: { pA: { id: 'u_a', name: 'Pebbles', location: 'm1' } }, combats: {}, syncCharDelta: (id, v) => deltas.push(Object.keys(v)) };
        const win = { wpFormula: fixedF(o.die || 3), wpStepLog: (k, s, v) => logs.push([k, s, v]), wpSheets: { playerSystem: cc => Sx.cleanSystem(cc.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } }; let err = '';
        try { new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'pushChat', 'applyLine', 'rangeTo', 'turnNote', 'toast', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + paSrc + '\n' + rqSrc)(
            { type: 'roll-req', rid: 'q1', charId: 'c_a', expr: '3d6 <= 10', row: { f: 'f_gear', r: 'w_s', i: o.i || 0 } }, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, m => rolled.push(m.type), () => {}, () => {}, () => {}, m => chats.push(JSON.parse(JSON.stringify(m))), r => Dx.applyText(r), () => null, (c, t, cid) => sent.push({ note: t, cid }), t => toasts.push(t)); } catch (e) { err = String(e && e.stack || e).slice(0, 400); }
        return { err, vals: camp.chars.c_a.values, sent, chats, toasts, deltas, logs, rolled }; };
    const runMoG = (lvl, o) => { o = o || {}; const cards = [], toasts = [], camp = { id: 'k', system: o.sys || sysMo, chars: { c_a: { id: 'c_a', name: 'Kael', npc: true, values: moVals(lvl) } } }, net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {}, postApplyCard: (ch, label, lines, scope) => cards.push([label, JSON.parse(JSON.stringify(lines)), scope]) };
        const win = { wpFormula: fixedF(3), wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }; let err = '';
        try { new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => toasts.push(t), () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => {})('3d6 <= 10', { charId: 'c_a', row: { f: 'f_gear', r: 'w_s', i: o.i || 0 } }); } catch (e) { err = String(e && e.stack || e).slice(0, 400); }
        return { err, vals: camp.chars.c_a.values, cards, toasts }; };
    const mQ1 = runMoQ(100), mQ2 = runMoQ(10), mG1 = runMoG(10), mG2 = runMoG(100);
    check('1.6.0 a list roll\'s Then moves the sheet\'s money (roll-req and net.diceRoll, run for real): a player\'s hit pays the row\'s figure with the rest of its Then, both lists told to the owner, and a card says it; with too little held nothing of it lands and they and the GM are told in words; the GM\'s own takes what is held and tells the GM',
        !mQ1.err && mQ1.vals.f_ch[0].lvl === 63 && mQ1.vals.f_gear[0].ct.Done === 1 && mQ1.deltas.length === 1 && mQ1.deltas[0].includes('f_ch') && mQ1.deltas[0].includes('f_gear') && mQ1.sent.concat(mQ1.chats).some(m => m.type === 'apply' && JSON.stringify(m).includes('Money'))
        && !mQ2.err && mQ2.vals.f_ch[0].lvl === 10 && !('ct' in mQ2.vals.f_gear[0]) && mQ2.deltas.length === 0 && mQ2.sent.some(m => /Nothing of it landed\. Not enough money: 10 held, 37 needed/.test(m.note || '')) && mQ2.toasts.some(t => /Kael had too little money/.test(t))
        && !mG1.err && mG1.vals.f_ch.length === 0 && mG1.vals.f_gear[0].ct.Done === 1 && mG1.cards.length === 1 && mG1.cards[0][1][0].n === 'Money' && mG1.cards[0][1][0].d === -10 && mG1.toasts.some(t => /had 10 and it called for 37/.test(t)) && !mG2.err && mG2.vals.f_ch[0].lvl === 63 && mG2.cards.length === 1,
        j([mQ1, mQ2, mG1, mG2]));
    // 1.6.0 (the owner's ruling after the hand test: "I'd refuse before the roll"): a Then due whatever the dice say that cannot be paid (roll-req and net.diceRoll, run for real)
    const moDueSys = (over) => Sx.cleanSystem(Object.assign({ v: 1, name: 'Md', combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', checks: 'under3d6' }, sheet: { sections: [] }, rolls: [], items: [{ id: 'i_s', name: 'Pebble Sword', vis: 'all', stats: { Cost: 37 } }], fields: [{ id: 'f_ch', key: 'Chips', label: 'Chips', kind: 'item-list', vis: over && over.gmChips ? 'gm' : 'all', edit: 'owner', list: { multi: true, lvl: { label: 'Held', min: 0, max: 100000, step: 0.01, def: 0 }, money: '@lvl' } },
        { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Cost', label: 'Cost' }], counters: [{ key: 'Done', label: 'Done' }], rolls: [{ label: 'Pay', formula: '3d6 <= 10', then: [{ money: '0 - Row.Cost' }, { c: 'Done', formula: '1', add: true }] }, { label: 'Mend', formula: '3d6 <= 10', then: [{ money: '0 - Row.Cost', when: 'hit' }, { c: 'Done', formula: '1', add: true, when: 'hit' }] }] } }] }), { F: Fx, gmView: true });
    const sysMd = moDueSys(), mdNo = runMoQ(10, { sys: sysMd }), mdYes = runMoQ(100, { sys: sysMd }), mdMay = runMoQ(10, { sys: sysMd, i: 1 }), mdGm = runMoG(10, { sys: sysMd }), mdDeny = mdNo.sent.filter(m => m.type === 'roll-deny');
    check('1.6.0 a Then due whatever the dice say (roll-req, run for real): a player short of it is refused before anything is rolled, in moneyMove\'s own words, the same deny shape, no card, nothing moved, no word of a Then that landed nothing, and one step logged by structure; a player who can pay rolls and pays',
        !mdNo.err && j(mdDeny) === j([{ type: 'roll-deny', rid: 'q1', reason: 'error', message: 'Not enough money: 10 held, 37 needed.', pos: 0, len: 0 }]) && mdNo.rolled.length === 0 && !mdNo.sent.some(m => m.type === 'roll' || m.type === 'apply' || /Nothing of it landed/.test(m.note || '')) && mdNo.vals.f_ch[0].lvl === 10 && !('ct' in mdNo.vals.f_gear[0]) && mdNo.deltas.length === 0 && mdNo.toasts.length === 0 && j(mdNo.logs) === j([['money v1', 'before-roll', { by: 'player' }]])
        && !mdYes.err && !mdYes.sent.some(m => m.type === 'roll-deny') && mdYes.rolled.length === 1 && mdYes.vals.f_ch[0].lvl === 63 && mdYes.vals.f_gear[0].ct.Done === 1 && !mdYes.logs.some(l => l[0] === 'money v1'), j([mdNo, mdYes.vals]));
    const moReq = (rqSrc.match(/var mnQ = q\.row && typeof SQ\.moneyDue === 'function' \? SQ\.moneyDue\(campQ\.system, chQ, actQ, varsQ, Fq\) : null;/) || {}).index, rqAt = t => rqSrc.indexOf(t);
    check('1.6.0 a refused press costs nothing: the host judges the Then after its needs and feeds, and before the dice are evaluated, its action is spent, a job counts or an attempt is used, on the host\'s own copy of the character',
        moReq > rqAt('var fsQ = q.row && typeof SQ.feedShortOf') && moReq < rqAt('var resQ = Fq.evaluate(q.expr') && moReq < rqAt('actSpend(campQ') && moReq < rqAt('var jsQ = jobPress(') && moReq < rqAt('attemptDrop(q.att)') && moReq < rqAt('var recQ = { type: \'roll\''));
    const sysMdG = moDueSys({ gmChips: true }), mdGq = runMoQ(100, { sys: sysMdG }), mdGn = runMoQ(10, { sys: sysMdG });
    check('1.6.0 the refusal reads the host\'s copy, never the view: money kept in a list the players do not see is still counted, so a player who can pay it rolls and one who cannot is told by the same words',
        !mdGq.err && !mdGq.sent.some(m => m.type === 'roll-deny') && mdGq.vals.f_ch[0].lvl === 63 && !mdGn.err && mdGn.sent.some(m => m.type === 'roll-deny' && m.message === 'Not enough money: 10 held, 37 needed.'), j([mdGq.sent, mdGn.sent]));
    check('1.6.0 the roll that hangs on the dice still rolls for a player short of it, and after the dice it is refused as before, the player and the GM told in words',
        !mdMay.err && !mdMay.sent.some(m => m.type === 'roll-deny') && mdMay.rolled.length === 1 && mdMay.vals.f_ch[0].lvl === 10 && mdMay.sent.some(m => /Nothing of it landed\. Not enough money: 10 held, 37 needed/.test(m.note || '')) && mdMay.toasts.some(t => /Kael had too little money/.test(t)) && j(mdMay.logs) === j([['money v1', 'refused', { by: 'player' }]]), j(mdMay));
    check('1.6.0 the GM\'s own press in net.diceRoll is never refused: it asks no such judge, goes through, takes what is held, lands the rest of the Then and tells the GM',
        !mdGm.err && mdGm.vals.f_ch.length === 0 && mdGm.vals.f_gear[0].ct.Done === 1 && mdGm.cards.length === 1 && mdGm.cards[0][1][0].d === -10 && mdGm.toasts.some(t => /had 10 and it called for 37/.test(t)) && !drSrc.includes('moneyDue'), j(mdGm));
    // 1.6.0: a job counted across turns on the host (roll-req and turnEnded, run for real): a press short of its turns moves the count and rolls nothing, saying so; the last rolls and its Then lands; a second press in a turn is refused before its action is spent; and a turn's end sets back a job with no keep, once
    const sysJb = Sx.cleanSystem({ v: 1, name: 'Jb', sheet: { sections: [] }, rolls: [], combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', checks: 'under3d6' }, fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'number', vis: 'all', edit: 'owner' },
        { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { counters: [{ key: 'Prog', label: 'Prog' }], rolls: [{ label: 'Reload', formula: '3d6 <= 18', job: { turns: '3', ct: 'Prog' }, then: [{ f: 'f_hp', formula: '1', add: true }] }] } }], items: [{ id: 'i_p', name: 'Pebble Pack' }] }, { F: Fx, gmView: true });
    const jobWorld = () => { const camp = { id: 'k', activeItemId: 'm1', system: sysJb, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: { f_hp: 0, f_gear: [{ id: 'w_p', defId: 'i_p', qty: 1 }] } } }, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't_a', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 100 }] } } }, sent = [], deltas = [];
        const conn = { peer: 'pA', open: true, send(m) { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }, net = { active: true, role: 'host', paused: false, conns: [conn], roster: { pA: { id: 'u_a', name: 'Pebbles', location: 'm1' } }, combats: {}, syncCharDelta: (id, v) => deltas.push(Object.keys(v)) };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: cc => Sx.cleanSystem(cc.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        const press = rd => { sent.length = 0; const jobRoundT = rd; new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'pushChat', 'applyLine', 'rangeTo', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + paSrc + '\n' + jbSrc + '\nfunction jobRound() { return ' + (jobRoundT === null ? 'null' : Number(jobRoundT)) + '; }\n' + rqSrc)(
            { type: 'roll-req', rid: 'q1', charId: 'c_a', expr: '3d6 <= 18', row: { f: 'f_gear', r: 'w_p', i: 0 } }, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, m => sent.push({ table: m }), () => {}, () => {}, () => {}, () => {}, r => Dx.applyText(r), () => null); return sent.slice(); };
        return { camp, net, win, press, deltas, ch: camp.chars.c_a, row: () => camp.chars.c_a.values.f_gear[0] }; };
    const jbSrc = between('// [netcheck:job-start]', '// [netcheck:job-end]', 'job');
    const jW = jobWorld(), j1 = jW.press(1), j1c = jW.row().ct.Prog, j1b = jW.press(1), j2 = jW.press(2), j2c = jW.row().ct.Prog, j3 = jW.press(3), j3c = jW.row().ct.Prog, jHp = jW.ch.values.f_hp;
    const say = l => (l.filter(m => m.type === 'roll-deny')[0] || {}).message;
    const jobEnd = (values, round) => { const ds = [], camp = { system: sysJb, chars: { c_a: { id: 'c_a', values } } }, net = { role: 'host', syncCharDelta: (id, v) => ds.push(Object.keys(v)) }; new Function('net', 'SC', 'window', 'getActiveCampaign', 'orderOfIn', 'fxCombatChars', 'saveRemoteSoon', jbSrc + '\nturnJobEnd("m1", {}, {}, ' + round + ');')(net, () => Sx, {}, () => camp, () => null, () => [camp.chars.c_a], () => {}); return [values.f_gear[0].ct.Prog, ds.length]; };
    check('1.6.0 a job on the host: a press short of its turns rolls nothing, moves the count, tells the owner and says how far; a second in that round is refused and moves nothing; the last rolls, lands its Then and takes the count to 0; a turn\'s end sets back a job with no press and leaves one worked on that round',
        j1.every(m => m.type !== 'roll' && !m.table) && say(j1) === 'Reload: 1 of 3.' && j1c === 1 && say(j1b) === 'This job has had its work this turn.' && say(j2) === 'Reload: 2 of 3.' && j2c === 2 && jW.deltas.length >= 2 && !say(j3) && j3.some(m => m.table || m.type === 'roll') && j3c === 0 && jHp === 1
        && JSON.stringify(jobEnd({ f_gear: [{ id: 'w_p', defId: 'i_p', qty: 1, ct: { Prog: 2 }, jr: { Prog: 1 } }] }, 2)) === JSON.stringify([0, 1]) && JSON.stringify(jobEnd({ f_gear: [{ id: 'w_p', defId: 'i_p', qty: 1, ct: { Prog: 2 }, jr: { Prog: 2 } }] }, 2)) === JSON.stringify([2, 0]), JSON.stringify([j1, j1c, j1b, j2, j3, j3c, jHp]));
    // 1.6.0 (asked by the session that builds a game system): Fire's How many, on the host: one card a burst, saying how many went, and one blast of the last round
    const sysBu = Sx.cleanSystem(Object.assign(JSON.parse(JSON.stringify(sysL)), { fields: JSON.parse(JSON.stringify(sysL.fields)).map(f => (f.list.chamber.cap = 32, f.list.rolls[0].then = [{ fire: true, n: '3' }], f.list.rolls[1].then = [{ fire: true, n: '9', when: 'miss' }], f)) }), { F: Fx, gmView: true });
    const rows32 = () => [{ id: 'w_t', defId: 'i_tube', qty: 1, rd: Array.from({ length: 32 }, () => ({ defId: 'i_fizz' })) }];
    const qBu = runQ(0, 3, true, sysBu, null, rows32()), qBuE = runQ(0, 3, true, sysBu), gBu = runG(3, sysBu, null, rows32()), q1No = runQ(0, 3, true);
    check('1.6.0 Fire\'s How many on the host (the roll-req branch and net.diceRoll, run for real): a burst of 3 out of 32 leaves 29, sends its owner one apply card that says how many went, kept by a player\'s cleaner, and goes off once at the target; a count past the chamber stops at the empty chamber and says the 2 that went; the GM\'s own roll alike through net.postApplyCard; a fire with no How many posts no card, as before',
        !qBu.err && qBu.rd.length === 29 && qBu.c.hit.length === 1 && qBu.chats.length === 1 && j(qBu.chats[0].apply.lines) === j([{ n: 'Fizz Grenade fired, chambered', d: -3, v: 29 }]) && qBu.chats[0].scope === 'whisper' && qBu.sent.filter(m => m.type === 'apply').length === 1 && j(Dx.cleanApply(qBu.sent.filter(m => m.type === 'apply')[0]).lines) === j([{ n: 'Fizz Grenade fired, chambered', d: -3, v: 29 }]) && /Fizz Grenade fired, chambered \u22123 \u2192 29/.test(Dx.applyText(qBu.chats[0].apply))
        && !qBuE.err && qBuE.rd === undefined && j(qBuE.chats[0].apply.lines) === j([{ n: 'Fizz Grenade fired, chambered', d: -2, v: 0 }])
        && !gBu.err && gBu.rd.length === 29 && gBu.c.hit.length === 1 && gBu.cards.length === 1 && j(gBu.cards[0][1]) === j([{ f: 'f_gear', n: 'Fizz Grenade fired, chambered', d: -3, v: 29 }]) && !q1No.err && q1No.chats.length === 0 && gHit.cards.length === 0,
        j([qBu.err, qBu.rd, qBu.chats, qBuE.chats, gBu, q1No.chats]));
    check('1.5.9 (es), the review of fold 2: the GM\'s own roll (net.diceRoll, run for real) reads a launched round\'s critical failure as a throw\'s is: a d20 system\'s natural 1 says fumble, and the 3d6 system\'s 18 too',
        !gD1.err && gD1.c.miss.length === 1 && gD1.c.miss[0].crit === 'fumble' && !gFum.err && gFum.c.miss.length === 1 && gFum.c.miss[0].crit === 'fumble',
        j([gD1, gFum]));
    check('1.5.9 (es) a launched round lands by the GM\'s own roll\'s verdict (net.diceRoll, run for real): a hit that fires calls wpLaunchHit alone, a miss wpLaunchMiss alone with the verdict\'s margin; wired after the hit\'s line in both places, through typeof',
        !gHit.err && gHit.c.hit.length === 1 && gHit.c.miss.length === 0 && !gMiss.err && gMiss.c.hit.length === 0 && gMiss.c.miss.length === 1 && gMiss.c.miss[0].margin === -5 && gMiss.c.miss[0].tid === 't_foe'
        && (srcL.match(/typeof window\.wpLaunchMiss === 'function'\) window\.wpLaunchMiss\(/g) || []).length === 4, /* 1.6.2: and the two of Bursts at its target, moved on purpose */
        j([gHit, gMiss]));
})());

// 1.6.0 A burst (the owner, by prompt: "One press, every hit"). The roll-req branch, the GM's own net.diceRoll and net.js burstAfter, each sliced and run for real
// with the real core and dice core: the host keeps the burst on the row from the verdict and the dice it judged, each hit of a damage roll is rolled from
// the entry on one record, a launched hit is its own blast, a die that failed its own stray; and a player's blow carries its hits through char-damage
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const srcB = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = srcB.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return srcB.slice(i, srcB.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply'), buSrc = between('// [netcheck:burst-start]', '// [netcheck:burst-end]', 'burst');
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const rawS = () => ({ v: 1, name: 'B', combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: 'f_hp', checks: 'under3d6', damage: { pool: 'f_hp', types: [{ key: 'cut', label: 'Cutting', mult: 1 }] } }, sheet: { sections: [] }, fields: [
        { id: 'f_hp', key: 'HP', label: 'Hit Points', kind: 'resource', maxFormula: '20', def: 'max', min: -50, edit: 'owner', vis: 'all' },
        { id: 'f_sec', key: 'Sec', label: 'Sec', kind: 'number', def: 2, vis: 'gm' },
        { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { multi: true, cats: ['Launcher', 'Round'], stats: [{ key: 'sh', label: 'Shots' }, { key: 'dd', label: 'Dice' }], chamber: { from: 'f_gear', cats: ['Round'], cap: 32 },
            rolls: [{ label: 'Burst', formula: '3d6 <= 10', burst: 'attack', then: [{ fire: true, n: 'Row.sh' }] }, { label: 'Extra', formula: '(max(1, Row.sh - 1))d6cs>=4', burst: 'extra' }, { label: 'Hits', formula: '(Row.fired.dd)d6', dmg: true, dtype: 'cut', hits: 'Row.bursthits' }, { label: 'Secret', formula: '1d6', dmg: true, hits: 'Sec' }, { label: 'Twice', formula: '1d6', dmg: true, hits: '2' }, { label: 'None', formula: '1d6', dmg: true, hits: '0' }, { label: 'Lost', formula: '1d6', dmg: true, hits: 'Row.sh - 1 / 0' }] } }],
        items: [{ id: 'i_tube', name: 'Spark Tube', category: 'Launcher', vis: 'all', stats: { sh: 3 } }, { id: 'i_fizz', name: 'Fizz Grenade', category: 'Round', vis: 'all', stats: { dd: 1 }, damage: '3d6', area: { ft: 6, flight: 'scatter' } }, { id: 'i_pop', name: 'Pop Round', category: 'Round', vis: 'all', stats: { dd: 2 } }] });
    const sysB = Sx.cleanSystem(rawS(), { F: Fx, gmView: true }), j2 = v => JSON.stringify(v), seqF = list => { let i = 0; return Object.assign({}, Fx, { evaluate: (t, o) => Fx.evaluate(t, o && o.random ? o : Object.assign({}, o, { random: () => list[i++ % list.length] })) }); };
    const rowsB = () => [{ id: 'w_t', defId: 'i_tube', qty: 1, rd: [{ defId: 'i_fizz' }, { defId: 'i_pop' }, { defId: 'i_fizz' }] }];
    const calls = () => { const c = { hit: [], miss: [], stray: [] }; return { c, win: { wpLaunchHit: o => { c.hit.push(JSON.parse(JSON.stringify(o))); return null; }, wpLaunchMiss: o => { c.miss.push(JSON.parse(JSON.stringify(o))); return null; }, wpLaunchStray: o => { c.stray.push(JSON.parse(JSON.stringify(o))); return null; } } }; };
    const worldQ = (camp) => {   // a player's rolls, one after another on one campaign
        const sent = [], table = [], conn = { peer: 'pA', open: true, send(m) { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }, { c, win } = calls(), deltas = [], saves = [];
        const net = { active: true, role: 'host', paused: false, conns: [conn], roster: { pA: { id: 'u_a', name: 'Pebbles', location: 'm1' } }, combats: {}, syncCharDelta(id, d) { deltas.push(JSON.parse(JSON.stringify(d))); } };
        Object.assign(win, { wpSheets: { playerSystem: cc => Sx.cleanSystem(cc.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } });
        const press = (msg, faces, aimed) => { let err = ''; win.wpFormula = seqF(faces);
            try { new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'pushChat', 'applyLine', 'rangeTo', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + paSrc + '\n' + buSrc + '\n' + rqSrc)(
                Object.assign({ type: 'roll-req', rid: 'q' + sent.length, charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, m => { packCheck(m); table.push(JSON.parse(JSON.stringify(m))); }, () => {}, () => {}, () => saves.push(1), () => {}, r => Dx.applyText(r),
                aimed === false ? () => null : () => ({ mod: 0, dist: 6, tid: 't_foe', mapId: 'm1' })); } catch (e) { err = String(e && e.stack || e).slice(0, 500); }
            return err; };
        return { press, sent, table, c, deltas, saves, row: () => camp.chars.c_a.values.f_gear[0] };
    };
    const campQ = (rows) => ({ id: 'k', activeItemId: 'm1', system: sysB, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: { f_gear: rows || rowsB() } } }, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't_a', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 100 }, { id: 't_foe', isChar: true, charId: 'c_foe', x: 300, y: 100 }] } } });
    const req = (i, expr, extra) => Object.assign({ expr: expr, row: { f: 'f_gear', r: 'w_t', i: i } }, extra || {}), ATT = req(0, '3d6 <= 10'), EXT = req(1, '(max(1, Row.sh - 1))d6cs>=4'), HIT = req(2, '(Row.fired.dd)d6');
    const deny = W => W.sent.filter(m => m.type === 'roll-deny').map(m => m.message), rolls = W => W.table.filter(m => m.type === 'roll');
    // an attack that hits, its extra dice, then one press of damage
    const W = worldQ(campQ()), e1 = W.press(ATT, [3]), buA = j2(W.row().bu && W.row().bu.h), hitA = j2(W.c.hit), ch0 = W.deltas.length, e2 = W.press(EXT, [5, 2]), buE = j2([W.row().bu.h, W.row().bu.x]), hitE = j2(W.c.hit.map(h => h.shot)), strE = j2(W.c.stray.map(h => h.shot));
    const e3 = W.press(EXT, [5, 5]), denied = deny(W).slice(), e4 = W.press(HIT, [2, 4, 6]), recH = rolls(W).filter(r => r.dmg === 1)[0];
    check('1.6.0 A burst on the host (roll-req, run for real): an attack opens the record from the verdict and its first round goes down at the target; the extra dice add their marks from the dice the host judged, a hit\'s round at the target and a failed one\'s a stray, each by its own round; they roll once, and a second press is refused in words with nothing rolled; the record reaches its owner as a delta and is saved',
        !e1 && !e2 && !e3 && buA === j2([1]) && JSON.parse(hitA).length === 1 && JSON.parse(hitA)[0].shot.defId === 'i_fizz' && JSON.parse(hitA)[0].tid === 't_foe' && buE === j2([[1, 1, 0], 1]) && j2(JSON.parse(hitE).map(s => s.defId)) === j2(['i_fizz', 'i_pop']) && j2(JSON.parse(strE).map(s => s.defId)) === j2(['i_fizz']) && /are rolled/.test(denied[0] || '') && W.c.hit.length === 2 && ch0 >= 1 && W.deltas.some(d => d.f_gear && d.f_gear[0].bu && d.f_gear[0].bu.x === 1) && W.saves.length >= 2, j2([e1, e2, e3, buA, hitA, buE, hitE, strE, denied]));
    check('1.6.0 A burst, one press of damage (roll-req, run for real): Row.bursthits says 2, the first hit reads the first round (1 die) and the record\'s more the second that hit (2 dice), rolled on the host from the entry; one record, one card; a player\'s app keeps it',
        !e4 && !!recH && recH.expr === '(Row.fired.dd)d6' && j2(recH.draws) === j2([2]) && j2(recH.more) === j2([{ t: 10, n: 2, f: [4, 6], rno: 2, rnd: 'Pop Round', dtype: 'cut' }]) && recH.dtype === 'cut' && recH.rno === 1 && recH.rnd === 'Fizz Grenade' && Dx.cleanRoll(recH).dtype === 'cut' && Dx.cleanRoll(recH).rnd === 'Fizz Grenade' && j2(Dx.cleanRoll(recH).more) === j2([{ t: 10, n: 2, dtype: 'cut', f: [4, 6], rno: 2, rnd: 'Pop Round' }]) && rolls(W).filter(r => r.dmg === 1).length === 1, j2([e4, recH]));
    const M = worldQ(campQ()), m1 = M.press(ATT, [5]), mE = M.press(EXT, [6, 6]), mD = M.press(HIT, [3]), mDn = deny(M), J = worldQ(campQ()), j1 = J.press(ATT, [6]);
    check('1.6.0 A burst that misses: the record reads no hit, its first round lands as a miss does, by the verdict\'s margin, its extra dice and its damage are refused in words, nothing rolled; a critical failure says so to the miss; a malfunction or a jam fires nothing and opens no hits',
        !m1 && !mE && !mD && j2(M.row().bu) === j2({ h: [0] }) && M.c.miss.length === 1 && M.c.miss[0].shot.defId === 'i_fizz' && M.c.miss[0].margin === -5 && M.c.hit.length === 0 && /attack missed/.test(mDn[0] || '') && /no hits to roll/.test(mDn[1] || '') && rolls(M).filter(r => r.dmg === 1).length === 0
        && !j1 && J.c.miss.length === 1 && J.c.miss[0].crit === 'fumble', j2([m1, mE, mD, M.row().bu, M.c, mDn, J.c]));
    check('1.6.0 A burst that misses, its other rounds (roll-req and net.diceRoll, run for real): the first round lands as a miss, each other round it fired goes to a stray in firing order with the target it was fired at, none with a hit\'s mark; a critical failure the same; a jam none',
        j2(M.c.stray.map(s => s.shot.defId)) === j2(['i_pop', 'i_fizz']) && M.c.stray.every(s => s.tid === 't_foe' && s.mapId === 'm1' && s.hit === undefined) && j2(J.c.stray.map(s => s.shot.defId)) === j2(['i_pop', 'i_fizz']), j2([M.c.stray, J.c.stray]));
    const N = worldQ(campQ()), n0 = N.press(EXT, [6, 6]), nDn = deny(N), P = worldQ(campQ([{ id: 'w_t', defId: 'i_tube', qty: 1, rd: [{ defId: 'i_pop' }, { defId: 'i_pop' }, { defId: 'i_pop' }] }])), p1 = P.press(ATT, [3]), p2 = P.press(EXT, [6, 6]), p3 = P.press(HIT, [1, 2, 3, 4, 5, 6]), recP = rolls(P).filter(r => r.dmg === 1)[0];
    const T2 = worldQ(campQ()), t1 = T2.press(req(4, '1d6'), [4, 2]), recT = rolls(T2)[0], N0 = worldQ(campQ()), n1 = N0.press(req(5, '1d6'), [1]), nZ = deny(N0), L0 = worldQ(campQ()), l1 = L0.press(req(6, '1d6'), [1]), lZ = deny(L0), H0 = worldQ(campQ()), h1 = H0.press(req(0, '3d6 <= 10'), [3], false), S0 = worldQ(campQ()), s1 = S0.press(req(3, '1d6'), [4]), recS = rolls(S0)[0];
    check('1.6.0 A burst, the corners on the host: extra dice with no attack are refused; three hits read their own rounds on one card, the rounds of a row with no blast still counted; a fixed Hits it rolls for rolls that many with no burst at all; none to roll for, and a formula that cannot be worked out, are refused with nothing rolled and no record; an attack with no target pointed at keeps its record and places nothing; a player\'s view that holds no hits rolls once, as before',
        !n0 && /Roll the attack first/.test(nDn[0] || '') && !p1 && !p2 && !p3 && j2(P.row().bu.h) === j2([1, 1, 1]) && recP.more.length === 2 && recP.more.every(h => h.n === 2) && P.c.hit.every(h => h.shot.defId === 'i_pop')
        && !t1 && j2(recT.more) === j2([{ t: 2, n: 1, f: [2] }]) && recT.rno === undefined && !n1 && /no hits to roll/.test(nZ[0] || '') && rolls(N0).length === 0 && !l1 && /could not be worked out/.test(lZ[0] || '') && rolls(L0).length === 0
        && !h1 && j2(H0.row().bu.h) === j2([1]) && H0.row().bu.s.length === 3 && H0.c.hit.length === 0 && !s1 && !('more' in recS), j2([nDn, recP, recT, nZ, lZ, H0.row().bu, recS]));
    // the GM's own roll
    const worldG = (over) => { const { c, win } = calls(), camp = campQ(), toasts = [], sentT = [], deltas = [], cards = []; camp.chars.c_a.npc = true; camp.chars.c_a.ownerId = '';
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta(id, d) { deltas.push(d); }, postApplyCard: (ch, l, ln, sc) => cards.push([l, sc]) };
        Object.assign(win, { wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => ({ range: { mod: 0, dist: 6, tid: 't_foe', mapId: 'm1' } }), charChanged() {} }, wpDiceCore: Dx });
        const press = (expr, o, faces) => { win.wpFormula = seqF(faces); let err = '', ret = null; const pushed = [];
            try { const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + buSrc + '\n' + drSrc + '\nreturn net.diceRoll;')(
                net, () => Dx, () => Sx, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), t => toasts.push(t), () => null, e => { throw e; }, m => sentT.push(JSON.parse(JSON.stringify(m))), r => pushed.push(r), () => {}, () => {});
                ret = dr(expr, Object.assign({ charId: 'c_a' }, o)); } catch (e) { err = String(e && e.stack || e).slice(0, 500); }
            return { err, ret, rec: pushed[0] }; };
        return { press, c, toasts, sentT, deltas, row: () => camp.chars.c_a.values.f_gear[0] };
    };
    const G = worldG(), g1 = G.press('3d6 <= 10', { row: { f: 'f_gear', r: 'w_t', i: 0 } }, [3]), g2 = G.press('(max(1, Row.sh - 1))d6cs>=4', { row: { f: 'f_gear', r: 'w_t', i: 1 } }, [5, 2]), g3 = G.press('(Row.fired.dd)d6', { row: { f: 'f_gear', r: 'w_t', i: 2 } }, [2, 4, 6]), g4 = G.press('(max(1, Row.sh - 1))d6cs>=4', { row: { f: 'f_gear', r: 'w_t', i: 1 } }, [5, 2]);
    const Gm = worldG(), gm1 = Gm.press('3d6 <= 10', { row: { f: 'f_gear', r: 'w_t', i: 0 } }, [5]);
    check('1.6.0 A burst that misses, the GM\'s own roll (net.diceRoll, run for real): the same miss and the same strays',
        !gm1.err && Gm.c.miss.length === 1 && j2(Gm.c.stray.map(s => s.shot.defId)) === j2(['i_pop', 'i_fizz']), j2([gm1, Gm.c]));
    const Gs = worldG(), gs = Gs.press('1d6', { row: { f: 'f_gear', r: 'w_t', i: 3 } }, [4, 2]);
    check('1.6.0 A burst, the GM\'s own roll (net.diceRoll, run for real): the same record, the same hits and strays, one record of two hits, the extra dice refused a second time; a Hits it rolls for read from a GM-only value keeps the card the GM\'s',
        !g1.err && !g2.err && !g3.err && j2(G.row().bu.h) === j2([1, 1, 0]) && G.c.hit.length === 2 && G.c.stray.length === 1 && j2(g3.rec.more) === j2([{ t: 10, n: 2, f: [4, 6], rno: 2, rnd: 'Pop Round', dtype: 'cut' }]) && g3.rec.rno === 1 && /are rolled/.test(g4.ret.error || '') && !gs.err && gs.rec.more.length === 1 && gs.rec.priv === 'gm' && Gs.sentT.length === 0 && Gs.toasts.some(t => /Kept private/.test(t)), j2([g1, g2, g3, g4, gs, Gs.toasts]));
    // a player's blow carries its hits (char-damage run for real)
    const cut = (a, b) => { const i = srcB.indexOf(a), z = srcB.indexOf(b, i); if (i < 0 || z < 0) throw new Error('netcheck: ' + a); return srcB.slice(i, z); };
    const brD = between('// [netcheck:chardamage-start]', '// [netcheck:chardamage-end]', 'chardamage'), cardD = cut('net.damageCard = function(ch, lines) {', '// Turn-based combat T2 (owner, 2026-09-26)'), sendD = cut('net.charDamage = function(charId, q) {', '// 1.5.6, the damage step: what a blow did');
    const sysD = Sx.cleanSystem({ v: 1, name: 'D', rolls: [], fields: [
        { id: 'f_hp', key: 'HP', label: 'Hit Points', kind: 'resource', maxFormula: '20', def: 'max', min: -50, edit: 'owner', vis: 'all' },
        { id: 'f_locs', key: 'Locs', label: 'Locations', kind: 'item-list', edit: 'owner', vis: 'all', list: { stats: [{ key: 'loc', label: 'Loc' }, { key: 'nat', label: 'Natural' }], cols: [{ key: 'DR', label: 'DR', formula: 'Row.nat + if(Row.loc = 3, Kit.on.drBody - Kit.on.wear, 0)' }] } },
        { id: 'f_kit', key: 'Kit', label: 'Kit', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Worn' }, stats: [{ key: 'drBody', label: 'Body' }, { key: 'wear', label: 'Wear' }] } }],
        items: [{ id: 'i_body', name: 'Body', stats: { loc: 3, nat: 0 } }, { id: 'i_plate', name: 'Plate', stats: { drBody: 6 } }],
        combat: { hpResource: 'f_hp', damage: { pool: 'f_hp', locs: { list: 'f_locs', dr: 'DR' }, types: [{ key: 'cut', label: 'Cutting', mult: 1 }], layers: [{ list: 'f_kit', at: 'if(Hit.loc = 3, Row.drBody, 0)', wear: 'wear' }] } } }, { F: Fx, gmView: true });
    const runD = msg => {
        const camp = { id: 'k', system: sysD, items: {}, chars: { c_1: { id: 'c_1', name: 'Kael', ownerId: 'u_a', npc: false, values: { f_locs: [{ id: 'w_body', defId: 'i_body', qty: 1 }], f_kit: [{ id: 'w_pl', defId: 'i_plate', qty: 1, on: true }] } } } };
        const out = { owner: [], chat: [], saves: 0 }, conns = [{ peer: 'pA', open: true, send: m => { packCheck(m); out.owner.push(JSON.parse(JSON.stringify(m))); } }], net = { active: true, role: 'host', paused: false, combats: {}, conns, myId: 'gm', roster: { pA: { id: 'u_a', name: 'Kael P' } } };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'pushChat', 'logEvent', 'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {};\n' + between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta') + '\n' + cardD + '\nif (msg.type === "char-damage" && net.role === "host") {\n' + brD + '\n}')(
            msg, conns[0], net, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { charChanged() {}, playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpDiceCore: null }, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => net.roster[c.peer].id, { allow: () => true }, (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), m => out.chat.push(JSON.parse(JSON.stringify(m))), () => {});
        out.ch = camp.chars.c_1; return out; };
    const hpOf = c => Sx.makeResolver(sysD, c, Fx)('hp'), wearOf = c => { const r = c.values.f_kit[0]; return r.ov && r.ov.stats ? r.ov.stats.wear : undefined; }, msgD = hits => ({ type: 'char-damage', rid: 'dp', charId: 'c_1', amt: 8, dtype: 'cut', loc: 'w_body', hits: hits });
    const dOk = runD(msgD([{ amt: 3, type: 'cut' }, { amt: 9, type: 'cut' }])), dBad = runD(msgD([{ amt: 3, type: 'cut' }, { amt: -9 }])), dLong = runD(msgD(new Array(321).fill({ amt: 1 }))), dType = runD(msgD([{ amt: 3, type: 'nope' }])), dLoc = runD(msgD([{ amt: 9, type: 'cut', loc: 'w_other', major: true }]));
    const sentP = [], campP = { system: sysD, chars: { c_1: { id: 'c_1', ownerId: 'u_a' } } }, netP = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'H', myId: 'u_a', conns: [{ peer: 'H', open: true, send: m => sentP.push(JSON.parse(JSON.stringify(m))) }] };
    const sendR = new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', sendD + '\nreturn net.charDamage;')(netP, () => Sx, () => campP, {}, {}, () => {}, () => 0), sR = sendR('c_1', { amt: 8, type: 'cut', loc: 'w_body', hits: [{ amt: 3, type: 'cut' }] });
    const netP2 = Object.assign({}, netP, { conns: [{ peer: 'H', open: true, send: m => sentP.push(m) }] }), sendB = new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', sendD + '\nreturn net.charDamage;')(netP2, () => Sx, () => campP, {}, {}, () => {}, () => 0), sB2 = sendB('c_1', { amt: 8, type: 'cut', hits: [{ amt: -1 }] });
    check('1.6.0 A burst, a player\'s own Apply (char-damage, run for real): every hit lands at the blow\'s location in one change, one ack, one delta, one line and one save, each meeting the armor as it stood and the wear coming off once; a hit that does not clean or a hostile count of 32 is not answered and changes nothing; a type the system lacks refuses the whole blow; a hit\'s own location or Major Wound is not read; a player\'s app sends the hits, and refuses a list that does not clean',
        hpOf(dOk.ch) === 15 && wearOf(dOk.ch) === 2 && dOk.saves === 1 && dOk.owner.filter(m => m.type === 'char-ack').length === 1 && dOk.owner.filter(m => m.type === 'charDelta').length === 1 && dOk.chat.length === 1 && /Hit 3:/.test(dOk.chat[0].text) && /Plate: 6 → 4/.test(dOk.chat[0].text)
        && dBad.owner.length === 0 && dBad.saves === 0 && hpOf(dBad.ch) === 20 && dLong.owner.length === 0 && dLong.saves === 0 && hpOf(dLong.ch) === 20 && dType.owner.filter(m => m.type === 'char-deny').length === 1 && dType.saves === 0 && hpOf(dType.ch) === 20 && dLoc.saves === 1 && hpOf(dLoc.ch) === 15
        && sR.ok === true && j2(sentP[0].hits) === j2([{ amt: 3, type: 'cut' }]) && typeof sB2.error === 'string' && sentP.length === 1, j2([hpOf(dOk.ch), wearOf(dOk.ch), dOk.chat, dBad.owner, dLong.owner, dType.owner, hpOf(dLoc.ch), sentP]));
    const rq = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq');
    check('1.6.0 A burst adds no message: the host\'s branches stay as they were, the hits ride on char-damage and on the roll\'s record, and a plain shot\'s launch lines keep their words',
        rq.includes("if (actQ && actQ.burst && q.row && typeof burstAfter === 'function') burstAfter(campQ, chQ, actQ, q.row, resQ, ruleQ,") && drSrc.includes("if (entR && entR.burst && o.row && typeof burstAfter === 'function') burstAfter(campR, chR, entR, o.row, res, ruleR,") && !/msg\.type === 'burst/.test(srcB));
})());

// 1.6.0 Rolls unheld entries (the owner, by prompt: "On the list (Recommended)", "The library picker (Recommended)", "GM and owner, by a tick
// (Recommended)"): a list's roll on an entry the character holds none of, at the list's Unheld level. The roll-req branch and the GM's own
// net.diceRoll, each sliced and run for real: the host finds the entry in the players' copy of the library, judges it (systemcore unheldJudge),
// works the level out and rebuilds the formula from the list; a GM-only entry is never one a player may roll, and the GM's own roll of one stays private
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const srcU = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = srcU.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return srcU.slice(i, srcU.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply');
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const listOf = (key, id, extra) => ({ id, key, label: key, kind: 'item-list', vis: 'all', edit: 'gm', list: Object.assign({ noQty: true, cats: ['Skill'], lvl: { min: -10, max: 20, def: 0 }, stats: [{ key: 'Dflt', label: 'Default' }], rolls: [{ label: 'Check', formula: '3d6 <= DX + Row.lvl' }, { label: 'Use', apply: [{ q: true, formula: '1' }] }] }, extra || {}) });
    const sysU = Sx.cleanSystem({ v: 1, name: 'U', combat: { checks: 'under3d6' }, fields: [{ id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: 'all' }, listOf('Skills', 'f_sk', { unheld: 'Row.Dflt' }), listOf('Arts', 'f_ar'), listOf('Odd', 'f_od', { unheld: 'Nope.x + 1' })],
        items: [{ id: 'i_stealth', name: 'Stealth', category: 'Skill', vis: 'all', stats: { Dflt: -4 } }], sheet: { sections: [] } }, { F: Fx, gmView: true });
    const lib = { i_climb: { id: 'i_climb', name: 'Climb', category: 'Skill', vis: 'all', stats: { Dflt: -5 } }, i_lore: { id: 'i_lore', name: 'Old lore', category: 'Skill', vis: 'gm', stats: { Dflt: -6 } }, i_cake: { id: 'i_cake', name: 'Cake', category: 'Food', vis: 'all' } };
    const wpLibrary = { entry: id => lib[id] || null, playerEntry: id => lib[id] && lib[id].vis !== 'gm' ? lib[id] : null };
    const fixedF = v => Object.assign({}, Fx, { evaluate: (t, o) => Fx.evaluate(t, o && o.random ? o : Object.assign({}, o, { random: () => v })) });
    const kael = () => ({ id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: { f_dx: 12, f_sk: [{ id: 'w_s', defId: 'i_stealth', lvl: 2 }] } });
    const runQ = (row, exprX, more) => {
        const camp = { id: 'k', activeItemId: 'm1', system: sysU, chars: { c_a: kael() }, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't_a', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 100 }] } } };
        const sent = [], table = [], conn = { peer: 'pA', open: true, send(m) { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } };
        const net = { active: true, role: 'host', paused: false, conns: [conn], roster: { pA: { id: 'u_a', name: 'Pebbles', location: 'm1' } }, combats: {}, syncCharDelta() {} };
        const win = { wpFormula: fixedF(3), wpLibrary, wpSheets: { playerSystem: cc => Sx.cleanSystem(cc.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        let err = '';
        try { new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'pushChat', 'applyLine', 'rangeTo', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + paSrc + '\n' + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a', expr: exprX || '3d6 <= DX + Row.lvl', row }, more || {}), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, r => { table.push(JSON.parse(JSON.stringify(r))); }, () => {}, () => {}, () => {}, () => {}, r => Dx.applyText(r), () => null); } catch (e) { err = String(e && e.stack || e).slice(0, 400); }
        return { err, sent, table, vals: camp.chars.c_a.values }; };
    const named = (rec, n) => ((rec && rec.names) || []).filter(x => x && x.name === n).map(x => x.value)[0];
    const qClimb = runQ({ f: 'f_sk', k: 'i_climb', i: 0 }), qLore = runQ({ f: 'f_sk', k: 'i_lore', i: 0 }), qHeld = runQ({ f: 'f_sk', k: 'i_stealth', i: 0 }), qOff = runQ({ f: 'f_ar', k: 'i_climb', i: 0 });
    const qFake = runQ({ f: 'f_sk', k: 'i_climb', i: 0 }, '3d6 <= 99'), qCake = runQ({ f: 'f_sk', k: 'i_cake', i: 0 }), qOdd = runQ({ f: 'f_od', k: 'i_climb', i: 0 }), qAct = runQ({ f: 'f_sk', k: 'i_climb', i: 1 }, '1');
    const qMod = runQ({ f: 'f_sk', k: 'i_climb', i: 0 }, Dx.composeModifier('3d6 <= DX + Row.lvl', 2, Fx.parse).expr, { mod: 2 }), qSw = runQ({ f: 'f_sk', k: 'i_climb', i: 0 }, null, { sw: [{ s: 'f_sk|w_s', i: 0 }] });
    const deny = (q, msg) => !q.err && q.table.length === 0 && q.sent.length === 1 && q.sent[0].type === 'roll-deny' && (msg === undefined || q.sent[0].message === msg);
    const rc = qClimb.table[0];
    check('1.6.0 Rolls unheld entries, the host (the roll-req branch run for real): a player\'s roll of the list\'s roll on Climb, an entry of the library their character holds none of, is rolled at the list\'s Unheld level read from the entry\'s own stat (Row.lvl -5, DX 12: 3d6 under 7), public, nothing stored; a GM-only entry reads as not there, one they hold says to roll it from its row, a list without the tick refuses, an entry outside the list\'s categories, a level that cannot be worked out, a formula that is not the button\'s, an action and a roll bonus are refused; a modifier is rebuilt as for a row',
        !qClimb.err && qClimb.table.length === 1 && rc.expr === '3d6 <= DX + Row.lvl' && named(rc, 'Row.lvl') === -5 && named(rc, 'DX') === 12 && rc.as === 'Kael' && !rc.priv && j(qClimb.vals) === j(kael().values)
        && deny(qLore, 'That entry is not there now.') && deny(qHeld, 'Kael holds Stealth. Roll it from its row.') && deny(qOff, 'That list does not roll entries nobody holds.')
        && deny(qCake, 'Cake is not an entry of Skills.') && deny(qOdd, 'Climb has no unheld level here.') && deny(qFake, 'That roll does not match its button now.') && deny(qAct) && deny(qSw, 'A roll on an entry nobody holds takes no bonus.')
        && !qMod.err && qMod.table.length === 1 && named(qMod.table[0], 'Row.lvl') === -5,
        j([qClimb.err, rc, qLore.sent, qHeld.sent, qOff.sent, qCake.sent, qOdd.sent, qFake.sent, qAct.sent, qSw.sent, qMod.err, qMod.sent, qMod.table]));
    const CQ = m => Dx.cleanRollReq(Object.assign({ rid: 'q1', expr: '3d6', charId: 'c_a' }, m));
    check('1.6.0 Rolls unheld entries, the wire (dicecore cleanRollReq): a roll names the list, the entry by its id and the roll by its index, never with a row id, a level or no index; a row\'s roll as before',
        j(CQ({ row: { f: 'f_sk', k: 'i_climb', i: 0 } }).row) === j({ f: 'f_sk', k: 'i_climb', i: 0 }) && CQ({ row: { f: 'f_sk', k: 'i_climb', i: 0 }, mod: 2 }).mod === 2
        && CQ({ row: { f: 'f_sk', k: 'i_climb' } }) === null && CQ({ row: { f: 'f_sk', k: 'i_climb', i: 0, r: 'w_s' } }) === null && CQ({ row: { f: 'f_sk', k: 'i_climb', i: 0, lv: 1 } }) === null
        && CQ({ row: { f: 'f_sk', k: 'w_climb', i: 0 } }) === null && CQ({ row: { f: 'f_sk', k: 'i_climb', i: 160 } }) === null && CQ({ row: { f: 'f_sk', k: 7, i: 0 } }) === null
        && j(CQ({ row: { f: 'f_sk', r: 'w_s', i: 0, lv: 1 } }).row) === j({ f: 'f_sk', r: 'w_s', i: 0, lv: 1 }) && j(CQ({ row: { f: 'f_sk', r: 'w_s' } }).row) === j({ f: 'f_sk', r: 'w_s' }),
        j([CQ({ row: { f: 'f_sk', k: 'i_climb', i: 0 } })]));
    const runG = (row, sw) => {
        const camp = { id: 'k', system: sysU, chars: { c_a: kael() } }, rolled = [];
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {}, postApplyCard() {} };
        const win = { wpFormula: fixedF(3), wpLibrary, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {}, playerSystem: cc => Sx.cleanSystem(cc.system, { F: Fx, gmView: false }) } };
        let err = '', ret = null;
        try { const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, (rec, res, scope) => { rolled.push({ rec: JSON.parse(JSON.stringify(rec)), scope }); }, () => {}, () => {});
            ret = dr('3d6 <= DX + Row.lvl', { charId: 'c_a', row, sw }); } catch (e) { err = String(e && e.stack || e).slice(0, 400); }
        return { err, ret, rolled }; };
    const gClimb = runG({ f: 'f_sk', k: 'i_climb', i: 0 }), gLore = runG({ f: 'f_sk', k: 'i_lore', i: 0 }), gHeld = runG({ f: 'f_sk', k: 'i_stealth', i: 0 }), gOff = runG({ f: 'f_ar', k: 'i_climb', i: 0 }), gSw = runG({ f: 'f_sk', k: 'i_climb', i: 0 }, [{ s: 'x_1', i: 0 }]);
    check('1.6.0 Rolls unheld entries, the GM\'s own roll (net.diceRoll run for real): Climb rolls at its Unheld level for all to see; a GM-only entry rolls at its own (Row.lvl -6) and stays the GM\'s; one the character holds, a list without the tick and a roll bonus are refused in words; a player\'s app names the entry by its id and the roll\'s index on the wire',
        !gClimb.err && gClimb.rolled.length === 1 && gClimb.rolled[0].scope === 'global' && named(gClimb.rolled[0].rec, 'Row.lvl') === -5
        && !gLore.err && gLore.rolled.length === 1 && gLore.rolled[0].rec.priv === 'gm' && named(gLore.rolled[0].rec, 'Row.lvl') === -6
        && j(gHeld.ret) === j({ error: 'Kael holds Stealth. Roll it from its row.' }) && j(gOff.ret) === j({ error: 'That list does not roll entries nobody holds.' }) && j(gSw.ret) === j({ error: 'A roll on an entry nobody holds takes no bonus.' })
        && srcU.includes("req.row = { f: String(o.row.f), r: String(o.row.r) }; if (typeof o.row.k === 'string') req.row = { f: String(o.row.f), k: o.row.k };"),
        j([gClimb, gLore, gHeld.ret, gOff.ret, gSw.ret]));
})());

// 1.5.9 (docs/BOOK_ES_ET_PLAN.md section 0): a change ticked Rolled rolls its amount on the host, with the host's own dice, never from a player's
// word. char-apply, the roll-req branch's Then and the GM's own net.diceRoll, each sliced and run for real: the amount drawn by the host's dice, the
// card's line saying the dice, a Then that drew dice saying them on an apply card of its own kept as private as the roll, and a player's message that
// names dice or a Rolled tick changing nothing the system does not say
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const srcR = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = srcR.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return srcR.slice(i, srcR.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const apSrc = (ordersSrc + '\n' + between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply')), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const sysR = Sx.cleanSystem({ v: 1, name: 'R', fields: [
        { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '20', def: 'max', min: -20, edit: 'gm', hover: true },
        { id: 'f_wk', key: 'WakeIn', kind: 'number', def: 0, min: 0, max: 60, edit: 'gm', hover: true },
        { id: 'f_kn', key: 'Knack', kind: 'number', def: 2, vis: 'gm' }, { id: 'f_tw', key: 'Twin', kind: 'formula', formula: 'Knack * 2' }],
        rolls: [
            { id: 'r_gmo', label: 'Knack heal', formula: '3d6 <= 30', then: [{ f: 'f_hp', formula: 'Knack + 1d6', add: true, roll: true, when: 'hit' }] },
            { id: 'r_gmd', label: 'Twin heal', formula: '3d6 <= 30', then: [{ f: 'f_hp', formula: 'Twin + 1d6', add: true, roll: true, when: 'hit' }] },
            { id: 'r_med', label: 'Medpac', apply: [{ f: 'f_hp', formula: '1d6', add: true, roll: true }] },
            { id: 'r_raw', label: 'Raw', apply: [{ f: 'f_hp', formula: '1d6', add: true }] },
            { id: 'r_aid', label: 'First Aid', formula: '3d6 <= 30', then: [{ f: 'f_hp', formula: '1d6', add: true, roll: true, when: 'hit' }, { f: 'f_wk', formula: '1d6', set: true, roll: true, when: 'hit' }] },
            { id: 'r_bare', label: 'Bare', formula: '3d6 <= 30', then: [{ f: 'f_hp', formula: '1d6', add: true, when: 'hit' }] },
            { id: 'r_flat', label: 'Flat', formula: '3d6 <= 30', then: [{ f: 'f_hp', formula: '2', add: true, when: 'hit' }] }] }, { F: Fx, gmView: true });
    const START = { f_hp: { cur: 10 } };
    const fixedF = v => Object.assign({}, Fx, { evaluate: (t, o) => Fx.evaluate(t, o && o.random ? o : Object.assign({}, o, { random: () => v })) });   // the host's own dice, fixed at v
    // char-apply (the owner's press of an apply action): the host's dice core is window.wpDiceCore
    const hostA = (msg, D) => {
        const camp = { id: 'k', system: sysR, items: {}, chars: { c_1: { id: 'c_1', name: 'Kael', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(START)) } } };
        const out = { owner: [], mate: [], chat: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conns = [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }];
        const net = { active: true, role: 'host', paused: false, combats: {}, conns, roster: { pA: { id: 'u_a', name: 'Pebbles' }, pB: { id: 'u_b', name: 'Bo' } }, syncCharDelta() {} };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: D };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + paSrc + '\n' + apSrc)(
            msg, conns[0], net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), (m, ex) => conns.forEach(c => { if (c !== ex && c.open && net.roster[c.peer]) c.send(m); }), m => out.chat.push(JSON.parse(JSON.stringify(m))), () => {}, r => Dx.applyText(r));
        out.vals = camp.chars.c_1.values; return out; };
    const D5 = Object.assign({}, Dx, { random: () => 5 });
    const aR = hostA({ type: 'char-apply', rid: 'a1', charId: 'c_1', act: 'r_med' }, D5), aCard = aR.mate.find(m => m.type === 'apply') || {};
    const aLie = hostA({ type: 'char-apply', rid: 'a2', charId: 'c_1', act: 'r_raw', roll: true, amount: 6, lines: [{ n: 'HP', d: 6, v: 16 }], apply: [{ f: 'f_hp', formula: '6', add: true, roll: true }] }, D5);
    const aNoD = hostA({ type: 'char-apply', rid: 'a3', charId: 'c_1', act: 'r_med' }, null);
    check('1.5.9 Rolled on the wire, char-apply (run for real): the owner\'s press of an action whose change is Rolled is rolled by the host\'s own dice (1d6 drew 5: HP 10 + 5), acked, and its card, to the table as HP is on hover, says the dice ("1d6: 5"); a message that names a roll, an amount, lines or changes of its own changes nothing the system does not say (an amount with dice that is not Rolled is refused in the words of ever); with no dice core on the host a Rolled amount is refused alike',
        j(aR.vals) === j({ f_hp: { cur: 15 } }) && aR.owner.some(m => m.type === 'char-ack') && j(aCard.lines) === j([{ n: 'HP', d: 5, v: 15, roll: '1d6: 5' }]) && j(Dx.cleanApply(aCard).lines) === j(aCard.lines)
        && j(aLie.vals) === j(START) && aLie.owner.length === 1 && aLie.owner[0].type === 'char-deny' && aLie.owner[0].reason === 'error' && aLie.owner[0].msg === 'An amount cannot roll dice.' && aLie.saves === 0 && !aLie.mate.length
        && j(aNoD.vals) === j(START) && aNoD.owner[0].type === 'char-deny' && aNoD.owner[0].msg === 'An amount cannot roll dice.',
        j([aR.vals, aR.owner, aCard, aLie.owner, aNoD.owner]));
    // the roll-req branch's Then: the host rolls the roll and then a Rolled amount, both with its own dice
    const runQ = (msg, fv) => { const out = { table: [], sent: [], deltas: [], saves: 0, chat: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sysR, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(START)) } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const conn = { peer: 'pA', open: true, send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const net = { active: true, role: 'host', paused: false, conns: [conn], roster: { pA: { id: 'u_a', name: 'Pebbles', location: 'm1' } }, combats: {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const win = { wpFormula: fixedF(fv), wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'pushChat', 'applyLine', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + paSrc + '\n' + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, () => { out.saves++; }, m => out.chat.push(m), r => Dx.applyText(r));
        out.vals = camp.chars.c_a.values; return out; };
    const qA = runQ({ act: 'r_aid', expr: '3d6 <= 30' }, 4), qP = runQ({ act: 'r_aid', expr: '3d6 <= 30', priv: 'gm' }, 4), qB = runQ({ act: 'r_bare', expr: '3d6 <= 30', roll: true }, 4), qF = runQ({ act: 'r_flat', expr: '3d6 <= 30' }, 4);
    const qCard = qA.table.find(m => m.type === 'apply') || {}, qPCard = qP.sent.find(m => m.type === 'apply') || {};
    check('1.5.9 Rolled on the wire, a player\'s roll with a Rolled Then (roll-req, run for real): the host rolls the roll and then each Rolled amount with its own dice (3d6 of 4s hits; HP + 1d6 of 4, WakeIn set to 1d6 of 4), one delta and a save; the Then\'s dice are said on an apply card of its own after the roll, to the table where the roll went there, and to the roller and the GM alone where the roll was private; a Then that is not Rolled is refused its dice whatever the message says (nothing moves) and a Then with no dice posts no card, as before',
        qA.table.length === 2 && qA.table[0].type === 'roll' && j(qA.vals) === j({ f_hp: { cur: 14 }, f_wk: 4 }) && j(qA.deltas) === j([['c_a', { f_hp: { cur: 14 }, f_wk: 4 }]]) && qA.saves === 1
        && qCard.label === 'First Aid' && qCard.as === 'Kael' && j(qCard.from) === j({ id: 'u_a', name: 'Pebbles', gm: false }) && j(qCard.lines) === j([{ n: 'HP', d: 4, v: 14, roll: '1d6: 4' }, { n: 'WakeIn', d: 4, v: 4, roll: '1d6: 4' }]) && Dx.cleanApply(qCard) !== null
        && qP.table.length === 0 && qPCard.priv === 'gm' && j(qPCard.lines) === j(qCard.lines) && qP.sent.filter(m => m.type === 'roll').length === 1
        && j(qB.vals) === j(START) && qB.deltas.length === 0 && qB.table.length === 1 && j(qF.vals) === j({ f_hp: { cur: 12 } }) && qF.table.length === 1,
        j([qA.table, qA.vals, qP.sent.map(m => m.type + ':' + (m.priv || '')), qB.vals, qF.table.map(m => m.type)]));
    // the GM's own roll: net.diceRoll's Then rolls a Rolled amount with this machine's dice and posts its card through net.postApplyCard
    const runG = (expr, o, fv) => { const out = { deltas: [], saves: 0, cards: [] };
        const camp = { id: 'k', system: sysR, chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: JSON.parse(JSON.stringify(START)) } } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]), postApplyCard: (ch, label, lines, scope) => out.cards.push([ch.id, label, JSON.parse(JSON.stringify(lines)), scope]) };
        const win = { wpFormula: fixedF(fv), wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => { out.saves++; });
        out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o || {})); out.vals = camp.chars.c_a.values; return out; };
    const gA = runG('3d6 <= 30', { act: 'r_aid', label: 'First Aid' }, 3), gF = runG('3d6 <= 30', { act: 'r_flat' }, 3), gB = runG('3d6 <= 30', { act: 'r_bare' }, 3);
    check('1.5.9 Rolled, the GM\'s own roll (net.diceRoll, run for real): its Rolled Then rolls with this machine\'s dice (HP + 3, WakeIn 3), one delta and a save, and posts its dice through net.postApplyCard, to the table where every value it moves is shown on hover and else the owner and the GM; a Then with no dice posts no card; one with dice that is not Rolled moves nothing',
        gA.ret.ok && j(gA.vals) === j({ f_hp: { cur: 13 }, f_wk: 3 }) && j(gA.deltas) === j([['c_a', { f_hp: { cur: 13 }, f_wk: 3 }]]) && gA.saves === 1
        && j(gA.cards) === j([['c_a', 'First Aid', [{ f: 'f_hp', n: 'HP', d: 3, v: 13, roll: '1d6: 3' }, { f: 'f_wk', n: 'WakeIn', d: 3, v: 3, roll: '1d6: 3' }], 'table']])
        && gF.cards.length === 0 && j(gF.vals) === j({ f_hp: { cur: 12 } }) && gB.cards.length === 0 && j(gB.vals) === j(START),
        j([gA.ret, gA.vals, gA.cards, gF.cards, gB.vals]));
    // the review of fold 1: before it, a Then posted no card, so an amount that read a GM-only value told nobody. A Rolled Then's card says that amount,
    // so on the GM's own roll it is kept between the GM and nobody else where the amount reads a GM-only value or one worked out from it, as the GM's
    // press of an action already keeps its card (sheets.js applyAction); a public roll whose Then reads none still goes to the table
    const gK = runG('3d6 <= 30', { act: 'r_gmo', label: 'Knack heal' }, 3), gT = runG('3d6 <= 30', { act: 'r_gmd', label: 'Twin heal' }, 3);
    check('1.5.9 the review of fold 1: the GM\'s own roll (net.diceRoll, run for real) whose Rolled Then reads a GM-only value (Knack) or one worked out from it (Twin) moves the value as before and keeps its card the GM\'s (scope gm), since the card says the amount; a Then that reads none still goes to the table',
        gK.ret.ok && j(gK.vals) === j({ f_hp: { cur: 15 } }) && gK.cards.length === 1 && gK.cards[0][3] === 'gm' && j(gK.cards[0][2]) === j([{ f: 'f_hp', n: 'HP', d: 5, v: 15, roll: '1d6: 3' }])
        && gT.ret.ok && j(gT.vals) === j({ f_hp: { cur: 17 } }) && gT.cards.length === 1 && gT.cards[0][3] === 'gm' && gA.cards[0][3] === 'table',
        j([gK.ret, gK.vals, gK.cards, gT.vals, gT.cards]));
    // applyLines, the card's own lines (sliced and run for real): the dice as text, cut to 60; a line with none as before
    const apL = new Function(line('function applyLines(lines)') + '\nreturn applyLines;')();
    check('1.5.9 Rolled, net.js applyLines (run for real): a line\'s dice as text cut to 60 beside its label and two numbers, and nothing for a line with none or with a roll that is no text',
        j(apL([{ f: 'f_hp', n: 'HP', d: 4, v: 14, roll: '1d6: 4' }, { n: 'EP', d: -1, v: 2 }, { n: 'X', d: 1, v: 1, roll: 7 }, { n: 'Y', d: 1, v: 1, roll: 'z'.repeat(70) }])) === j([{ n: 'HP', d: 4, v: 14, roll: '1d6: 4' }, { n: 'EP', d: -1, v: 2 }, { n: 'X', d: 1, v: 1 }, { n: 'Y', d: 1, v: 1, roll: 'z'.repeat(60) }]));
})());
// 1.5.9 (docs/BOOK_ES_ET_PLAN.md section 3; the book: medical items are applied "to oneself or an adjacent ally"; the owner: "Apply at once", any
// adjacent character, NPCs included): a roll or an action that Applies to an adjacent character names the token it is used on, and the host judges
// it (allyOn) before anything is rolled or moved. char-apply, the roll-req branch and the GM's own net.diceRoll, each sliced and run for real beside
// the ally slice and the real fogcore and systemcore: the changes that name a field land on the one it is used on, a row's counters stay with the
// user, two deltas and one save, the card to whoever may see the target's figures and its user's player told what moved with no figure after it
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js')), Cx = await import(url('fogcore.js'));
    const srcR = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = srcR.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return srcR.slice(i, srcR.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const allySrc = between('// [netcheck:ally-start]', '// [netcheck:ally-end]', 'ally', 'netfight.js');
    const apSrc = (ordersSrc + '\n' + between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply')), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply');
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const sysN = Sx.cleanSystem({ v: 1, name: 'N', fields: [
        { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '20', def: 'max', min: -20, edit: 'gm', hover: true },
        { id: 'f_dn', key: 'Down', label: 'Down', kind: 'toggle', edit: 'gm' },
        { id: 'f_sec', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm' },
        { id: 'f_kit', key: 'Kit', label: 'Kit', kind: 'item-list', list: { counters: [{ key: 'Uses', label: 'Uses', def: 3 }], rolls: [{ label: 'Wrap', apply: [{ f: 'f_hp', formula: '2 + OnSelf', add: true }, { c: 'Uses', formula: '1' }], to: 'near' }] } }],
        items: [{ id: 'i_kit', name: 'Kit' }],
        rolls: [
            { id: 'r_aid', label: 'Aid', apply: [{ f: 'f_hp', formula: '4', add: true }], to: 'near' },
            { id: 'r_up', label: 'Up', apply: [{ f: 'f_dn', formula: '0', set: true }, { f: 'f_hp', formula: '1', add: true }], to: 'near' },
            { id: 'r_own', label: 'Own', apply: [{ f: 'f_hp', formula: '1', add: true }] },
            { id: 'r_chk', label: 'Check', formula: '3d6 <= 30 + OnSelf', then: [{ f: 'f_hp', formula: '1', add: true, when: 'hit' }], to: 'near' },
            { id: 'r_pl', label: 'Plain', formula: '3d6 <= 30', then: [{ f: 'f_hp', formula: '1', add: true, when: 'hit' }] },
            { id: 'r_sec', label: 'Salve', formula: '3d6 <= 30', then: [{ f: 'f_hp', formula: '1 + Secret', add: true, when: 'hit' }], to: 'near' },
            { id: 'r_tgt', label: 'Mend', apply: [{ f: 'f_hp', formula: '3' }], to: 'target' }] }, { F: Fx, gmView: true });
    const tk = (id, o) => Object.assign({ id, type: 'circle', isChar: true, w: 50, h: 50 }, o);
    const mkCamp = () => ({ id: 'k', activeItemId: 'm1', system: sysN, items: { m1: { id: 'm1', type: 'map', meta: { gridType: 'square' }, whiteboard: [
            tk('tk_a', { charId: 'c_a', ownerId: 'u_a', name: 'Kael', x: 100, y: 100 }), tk('tk_b', { charId: 'c_b', ownerId: 'u_b', name: 'Bo', x: 150, y: 100 }), tk('tk_n', { charId: 'c_n', name: 'Orc', x: 100, y: 150 }),
            tk('tk_f', { charId: 'c_f', ownerId: 'u_b', name: 'Far', x: 400, y: 400 }), tk('tk_h', { charId: 'c_h', name: 'Lurker', hidden: true, x: 150, y: 150 }), { id: 'tk_w', type: 'circle', waiting: 1, ownerId: 'u_c', name: 'Cato', x: 50, y: 100, w: 50, h: 50 }] } },
        chars: { c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, values: { f_hp: { cur: 10 }, f_kit: [{ id: 'w_1', defId: 'i_kit', ct: { Uses: 3 } }] } }, c_b: { id: 'c_b', name: 'Bo', ownerId: 'u_b', npc: false, values: { f_hp: { cur: 5 } } },
            c_n: { id: 'c_n', name: 'Orc', npc: true, values: { f_hp: { cur: 6 }, f_dn: true } }, c_f: { id: 'c_f', name: 'Far', ownerId: 'u_b', npc: false, values: {} }, c_h: { id: 'c_h', name: 'Lurker', npc: true, values: { f_hp: { cur: 8 } } } } });
    const winOf = (fogDropT, o) => Object.assign({ wpFormula: Fx, wpFogCore: Cx, wpVtt: { on: () => true, rulesOn: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: Dx }, o || {});
    // char-apply: a player's press, its host branch beside the ally slice
    const hostA = (msg, o) => { o = o || {};
        const camp = mkCamp(), out = { owner: [], mate: [], chat: [], saves: 0, deltas: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conns = [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }];
        const net = { active: true, role: 'host', paused: false, combats: {}, conns, roster: { pA: { id: 'u_a', name: 'Pebbles', location: 'm1' }, pB: { id: 'u_b', name: 'Bo', location: 'm1' } }, targets: o.targets || {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine', 'fogDrop', 'mapFogged', 'getProfile',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + ['function fxLib(', 'function itemLib('].map(line).join('\n') + '\n' + paSrc + '\n' + allySrc + '\n' + apSrc)(
            msg, conns[0], net, () => Sx, winOf(), () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), (m, ex) => conns.forEach(c => { if (c !== ex && c.open && net.roster[c.peer]) c.send(m); }), m => out.chat.push(JSON.parse(JSON.stringify(m))), () => {}, r => Dx.applyText(r),
            () => o.drop || null, () => !!o.drop, () => ({ id: 'u_gm', name: 'GM' }));
        out.camp = camp; out.v = id => camp.chars[id].values; return out; };
    const A = (act, on, extra) => Object.assign({ type: 'char-apply', rid: 'a1', charId: 'c_a', act }, on === undefined ? {} : { on }, extra || {});
    const tB = hostA(A('r_aid', 'tk_b')), tN = hostA(A('r_up', 'tk_n')), tSelf = hostA(A('r_aid')), tRow = hostA({ type: 'char-apply', rid: 'a2', charId: 'c_a', row: { f: 'f_kit', r: 'w_1', i: 0 }, on: 'tk_b' }), tRowS = hostA({ type: 'char-apply', rid: 'a3', charId: 'c_a', row: { f: 'f_kit', r: 'w_1', i: 0 } });
    const deny = r => (r.owner.find(m => m.type === 'char-deny') || {}).msg || '', still = r => j(r.v('c_a')) === j(mkCamp().chars.c_a.values) && j(r.v('c_b')) === j({ f_hp: { cur: 5 } }) && r.saves === 0 && !r.deltas.length && !r.mate.length && !r.chat.length;
    const tFar = hostA(A('r_aid', 'tk_f')), tHid = hostA(A('r_aid', 'tk_h')), tMe = hostA(A('r_aid', 'tk_a')), tNone = hostA(A('r_aid', 'tk_zz')), tWait = hostA(A('r_aid', 'tk_w')), tKind = hostA(A('r_own', 'tk_b')), tFog = hostA(A('r_aid', 'tk_b'), { drop: { tk_b: 1 } });
    const cB = tB.mate.find(m => m.type === 'apply') || {}, cNo = tN.owner.find(m => m.type === 'apply') || {}, cNgm = tN.chat.find(m => m.apply) || {};
    check('1.5.9 Applies to an adjacent character, char-apply (run for real with the ally slice and the real fogcore): a player\'s press on the token next to theirs moves the field on that character (Bo\'s HP 5 + 4) and nothing of theirs, one ack, one delta and a save, and its card, to the table where every value it moves shows on hover, says on whom; on an NPC (the GM\'s alone) the figures go to the GM and the presser\'s player gets the same lines with no figure after each and a value set said as set; with no token named it is their own, as ever',
        tB.owner.some(m => m.type === 'char-ack') && j(tB.v('c_b')) === j({ f_hp: { cur: 9 } }) && j(tB.v('c_a')) === j(mkCamp().chars.c_a.values) && j(tB.deltas) === j([['c_b', { f_hp: { cur: 9 } }]]) && tB.saves === 1
        && cB.on === 'Bo' && cB.as === 'Kael' && j(cB.lines) === j([{ n: 'HP', d: 4, v: 9 }]) && !('priv' in cB) && Dx.cleanApply(cB) !== null && tB.owner.filter(m => m.type === 'apply').length === 1
        && j(tN.v('c_n')) === j({ f_hp: { cur: 7 }, f_dn: false }) && !tN.mate.some(m => m.type === 'apply') && cNo.priv === 'gm' && j(cNo.lines) === j([{ n: 'Down', s: 1 }, { n: 'HP', d: 1 }]) && Dx.cleanApply(cNo) !== null && j(Dx.cleanApply(cNo).lines) === j(cNo.lines)
        && j(cNgm.apply.lines) === j([{ n: 'Down', d: -1, v: 0 }, { n: 'HP', d: 1, v: 7 }]) && cNgm.apply.on === 'Orc'
        && j(tSelf.v('c_a').f_hp) === j({ cur: 14 }) && j(tSelf.v('c_b')) === j({ f_hp: { cur: 5 } }),
        j([tB.owner.map(m => m.type), tB.v('c_b'), cB, cNo, cNgm.apply, tSelf.v('c_a')]));
    check('1.5.9 Applies to an adjacent character, char-apply on a row (run for real): a list\'s action used on another moves its row\'s counter on the user (Uses 3 - 1) and the field on the other (Bo\'s HP 5 + 2, OnSelf 0), two deltas and one save; on themselves OnSelf reads 1 (HP 10 + 3)',
        j(tRow.v('c_a').f_kit[0].ct) === j({ Uses: 2 }) && j(tRow.v('c_a').f_hp) === j({ cur: 10 }) && j(tRow.v('c_b')) === j({ f_hp: { cur: 7 } }) && j(tRow.deltas.map(d => d[0]).sort()) === j(['c_a', 'c_b']) && tRow.saves === 1
        && j(tRowS.v('c_a').f_hp) === j({ cur: 13 }) && j(tRowS.v('c_a').f_kit[0].ct) === j({ Uses: 2 }),
        j([tRow.v('c_a'), tRow.v('c_b'), tRow.deltas, tRowS.v('c_a')]));
    check('1.5.9 Applies to an adjacent character, char-apply refusals (run for real): a token that is not next to theirs, a hidden one, one their copy drops by the fog, one that is not there, a waiting token, their own, and an action that applies only to its user each refused in its own words with nothing moved, saved, sent or posted',
        [tFar, tHid, tMe, tNone, tWait, tKind, tFog].every(still) && deny(tFar) === 'They must stand next to you.' && deny(tHid) === 'That character is not there.' && deny(tFog) === 'That character is not there.' && deny(tNone) === 'That character is not there.' && deny(tWait) === 'That character is not there.'
        && deny(tMe) === 'That is you: use it with no one picked.' && deny(tKind) === 'That cannot be used on someone else.',
        j([tFar, tHid, tMe, tNone, tWait, tKind, tFog].map(deny)));
    // the roll-req branch's Then: the roll is the user's, its field changes land on the one it is used on
    const runQ = (msg, o) => { o = o || {}; const out = { table: [], sent: [], deltas: [], saves: 0, chat: [] }, camp = mkCamp();
        const conn = { peer: 'pA', open: true, send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const net = { active: true, role: 'host', paused: false, conns: [conn], roster: { pA: { id: 'u_a', name: 'Pebbles', location: 'm1' } }, combats: {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const win = winOf(null, { wpFormula: Object.assign({}, Fx, { evaluate: (tx, op) => Fx.evaluate(tx, op && op.random ? op : Object.assign({}, op, { random: () => 4 })) }), wpVtt: { on: () => true, rulesOn: () => true } });
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'pushChat', 'applyLine', 'fogDrop', 'mapFogged', 'getProfile', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + paSrc + '\n' + allySrc + '\n' + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, () => { out.saves++; }, m => out.chat.push(m), r => Dx.applyText(r), () => o.drop || null, () => !!o.drop, () => ({ id: 'u_gm', name: 'GM' }));
        out.v = id => camp.chars[id].values; return out; };
    const qB = runQ({ act: 'r_chk', expr: '3d6 <= 30 + OnSelf', on: 'tk_b' }), qS = runQ({ act: 'r_chk', expr: '3d6 <= 30 + OnSelf' }), qF = runQ({ act: 'r_chk', expr: '3d6 <= 30 + OnSelf', on: 'tk_f' }), qK = runQ({ act: 'r_pl', expr: '3d6 <= 30', on: 'tk_b' });
    const qRoll = qB.table.find(m => m.type === 'roll') || {}, qCard = qB.table.find(m => m.type === 'apply') || {};
    check('1.5.9 Applies to an adjacent character, a player\'s roll (roll-req, run for real): its formula reads OnSelf 0 on another and 1 on themselves, the host rolls it, and its Then moves the field on the one it is used on (Bo\'s HP 5 + 1), one delta and a save, with a card that says on whom; a token that is not next to theirs is refused before anything is rolled, and so is one named for a roll that applies only to its user',
        (qRoll.names || []).some(n => n.name === 'OnSelf' && n.value === 0) && j(qB.v('c_b')) === j({ f_hp: { cur: 6 } }) && j(qB.v('c_a').f_hp) === j({ cur: 10 }) && j(qB.deltas) === j([['c_b', { f_hp: { cur: 6 } }]]) && qB.saves === 1 && qCard.on === 'Bo' && j(qCard.lines) === j([{ n: 'HP', d: 1, v: 6 }])
        && ((qS.table.find(m => m.type === 'roll') || {}).names || []).some(n => n.name === 'OnSelf' && n.value === 1) && j(qS.v('c_a').f_hp) === j({ cur: 11 })
        && qF.table.length === 0 && (qF.sent[0] || {}).type === 'roll-deny' && qF.sent[0].message === 'They must stand next to you.' && qF.deltas.length === 0 && qK.table.length === 0 && (qK.sent[0] || {}).message === 'That cannot be used on someone else.',
        j([qRoll.names, qB.v('c_b'), qB.deltas, qCard, qS.v('c_a'), qF.sent, qK.sent]));
    // Found by hand: every harness here hands net.js a facingTarget of its own, and the app published none, so a line and a roll used on someone next to you did nothing on the GM's own press. Every name any script asks of window.wpSheets is one sheets.js publishes
    { const dirS = path.join(__dirname, '..', 'system', 'app', 'scripts'), shS = fs.readFileSync(path.join(dirS, 'sheets.js'), 'utf8'), pubS = shS.slice(shS.indexOf('window.wpSheets = {'), shS.indexOf('// An outside sheet reader (2026-10-18)')), names = new Set();
      fs.readdirSync(dirS).filter(f => f.endsWith('.js')).forEach(f => { for (const m of fs.readFileSync(path.join(dirS, f), 'latin1').matchAll(/\bwpSheets\.([A-Za-z_$][\w$]*)/g)) names.add(m[1]); });
      const missS = [...names].filter(n => !new RegExp('(^|[\\s,{])' + n + '\\s*:').test(pubS) && !new RegExp('\\bwpSheets\\.' + n + '\\s*=[^=]').test(shS));
      check('1.6.0 every name a script asks of window.wpSheets is published (found by hand, a line on the GM\'s own press: facingTarget stood only in the reader\'s kit, and every stand-in here has one of its own)', pubS.length > 1000 && names.size > 40 && names.has('facingTarget') && missS.length === 0, j(missS)); }
    // the GM's own roll: net.diceRoll with this machine's own word, the token, judged on the map the character's token is on (wpSheets.facingTarget)
    const runG = (expr, o) => { const out = { deltas: [], saves: 0, cards: [], chat: [] }, camp = mkCamp(), m1 = camp.items.m1, tokA = m1.whiteboard[0];
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]), postApplyCard: (ch, label, lines) => out.cards.push([ch.id, label, lines]) };
        const win = winOf(null, { wpFormula: Object.assign({}, Fx, { evaluate: (tx, op) => Fx.evaluate(tx, op && op.random ? op : Object.assign({}, op, { random: () => 3 })) }), wpSheets: { tokenCtxFor: () => null, charChanged() {}, facingTarget: () => ({ mapId: 'm1', map: m1, tok: tokA }) } });
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'pushChat', 'applyLine', 'fogDrop', 'mapFogged', 'var _dicePending = null;\n' + helpers + paSrc + '\n' + allySrc + '\n' + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, win, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => { out.saves++; }, m => out.chat.push(JSON.parse(JSON.stringify(m))), r => Dx.applyText(r), () => null, () => false);
        out.ret = dr(expr, Object.assign({ charId: 'c_a', act: 'r_chk' }, o || {})); out.v = id => camp.chars[id].values; return out; };
    const gH = runG('3d6 <= 30 + OnSelf', { on: 'tk_h' }), gF = runG('3d6 <= 30 + OnSelf', { on: 'tk_f' }), gK = runG('3d6 <= 30', { act: 'r_own', on: 'tk_b' }), gCard = gH.chat.find(m => m.apply) || {};
    check('1.5.9 Applies to an adjacent character, the GM\'s own roll (net.diceRoll, run for real): this machine\'s own word names the token, judged on the map the character\'s token is on, and the GM reaches a hidden one next to it (the Lurker\'s HP + 1), with a save and a card of what moved on it; a token that is not next to it, and one named for a roll that applies only to its user, are said and nothing is rolled',
        gH.ret.ok === true && j(gH.v('c_h')) === j({ f_hp: { cur: 9 } }) && gH.saves === 1 && j(gH.deltas) === j([['c_h', { f_hp: { cur: 9 } }]]) && gCard.apply && gCard.apply.on === 'Lurker' && j(gH.v('c_a').f_hp) === j({ cur: 10 })
        && gF.ret.error === 'They must stand next to you.' && gF.saves === 0 && gK.ret.error === 'That cannot be used on someone else.',
        j([gH.ret, gH.v('c_h'), gCard.apply, gF.ret, gK.ret]));
    const gS = runG('3d6 <= 30', { act: 'r_sec', on: 'tk_b' }), gP = runG('3d6 <= 30 + OnSelf', { on: 'tk_b' }), gSc = gS.chat.find(m => m.apply) || {}, gPc = gP.chat.find(m => m.apply) || {};
    check('1.6.0 (the review of 96e39ae6) the GM\'s own roll used on another: a Then whose amount reads a GM-only value keeps the card on that character the GM\'s, though every value it moves shows on hover (Bo\'s HP + 1 + Secret); the same roll with a public amount goes to the table',
        j(gS.v('c_b')) === j({ f_hp: { cur: 6 } }) && gSc.apply && gSc.apply.on === 'Bo' && gSc.apply.priv === 'gm' && gSc.scope === 'whisper'
        && gPc.apply && gPc.apply.on === 'Bo' && !('priv' in gPc.apply) && gPc.scope === 'global',
        j([gS.v('c_b'), gSc, gPc]));
    // the client's word: net.charApply and net.diceRoll name the token, and dicecore cleanRollReq and systemcore cleanCharApply keep it only by the rule a target keeps
    const caAt = srcR.indexOf('net.charApply = function(charId, actId, label, row, on, ask) {'), caSrc = srcR.slice(caAt, srcR.indexOf('\n};', caAt) + 3), sentC = [];
    const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'H', myId: 'u_a', conns: [{ peer: 'H', open: true, send: m => sentC.push(JSON.parse(JSON.stringify(m))) }] };
    const runC = new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', caSrc + '\nreturn net.charApply;')(netC, () => Sx, () => ({ system: sysN, chars: { c_a: { id: 'c_a', ownerId: 'u_a' } } }), { wpVtt: { on: () => true } }, {}, () => {}, () => 0);
    runC('c_a', 'r_aid', 'Aid', undefined, 'tk_b');
    const CQ = Dx.cleanRollReq, CA = Sx.cleanCharApply, ctl = String.fromCharCode(1);
    check('1.5.9 Applies to an adjacent character on the wire: a player\'s app names the token it is used on and nothing else of it; the host keeps it only as a token\'s id of 1 to 80 characters with no control character, and on a roll only beside its named entry (act or a list roll\'s index), refusing any other shape of the message whole',
        j(sentC[0]) === j({ type: 'char-apply', rid: sentC[0] && sentC[0].rid, charId: 'c_a', act: 'r_aid', label: 'Aid', on: 'tk_b' })
        && CA({ rid: 'a1', charId: 'c_a', act: 'r_aid', on: 'tk_b' }).on === 'tk_b' && !('on' in CA({ rid: 'a1', charId: 'c_a', act: 'r_aid' })) && ['', 'x'.repeat(81), 5, null, {}, 'a' + ctl].every(v => CA({ rid: 'a1', charId: 'c_a', act: 'r_aid', on: v }) === null)
        && CQ({ rid: 'q1', expr: '1d6', charId: 'c_a', act: 'r_chk', on: 'tk_b' }).on === 'tk_b' && CQ({ rid: 'q1', expr: '1d6', charId: 'c_a', row: { f: 'f_kit', r: 'w_1', i: 0 }, on: 'tk_b' }).on === 'tk_b'
        && CQ({ rid: 'q1', expr: '1d6', charId: 'c_a', on: 'tk_b' }) === null && CQ({ rid: 'q1', expr: '1d6', on: 'tk_b' }) === null && ['', 'x'.repeat(81), 7, 'b' + ctl].every(v => CQ({ rid: 'q1', expr: '1d6', charId: 'c_a', act: 'r_chk', on: v }) === null),
        j([sentC]));
    // 1.6.2 (the builder trial's survey): Applies to the user or their target: the token must be the user's own pointer, from the host's own record
    { const ptr = id => ({ targets: { u_a: { id, mapId: 'm1', name: 'Pebbles' } } }), AIM = 'Point at them on the map first: it goes on your target.';
      const tT = hostA(A('r_tgt', 'tk_f'), ptr('tk_f')), tTn = hostA(A('r_tgt', 'tk_f')), tTo = hostA(A('r_tgt', 'tk_f'), ptr('tk_b')), tTb = hostA(A('r_tgt', 'tk_f'), { targets: { u_b: { id: 'tk_f', mapId: 'm1' } } }), tTm = hostA(A('r_tgt', 'tk_f'), { targets: { u_a: { id: 'tk_f', mapId: 'm2' } } });
      const tTh = hostA(A('r_tgt', 'tk_h'), ptr('tk_h')), tTf = hostA(A('r_tgt', 'tk_b'), Object.assign(ptr('tk_b'), { drop: { tk_b: 1 } })), tTs = hostA(A('r_tgt')), tTa = hostA(A('r_aid', 'tk_f'), ptr('tk_f'));
      const cT = tT.owner.concat(tT.mate).find(m => m.type === 'apply' && m.on) || {};
      check('1.6.2 Applies to the user or their target, char-apply (run for real with the ally slice): a player\'s press lands on the token their own pointer is at, however far (Far\'s HP 20 - 3), with nothing of theirs moved, a save and a card that says on whom; with no pointer, a pointer at another token, another player\'s pointer or a pointer on another map it is refused in its own words, a hidden token or one their fog drops is not there, with no one named it lands on themselves, and Applies to an adjacent character still asks for next to you',
          tT.owner.some(m => m.type === 'char-ack') && j(tT.v('c_f')) === j({ f_hp: { cur: 17 } }) && j(tT.v('c_a')) === j(mkCamp().chars.c_a.values) && tT.saves === 1 && cT.on === 'Far'
          && [tTn, tTo, tTb, tTm].every(r => still(r) && j(r.v('c_f')) === j({}) && deny(r) === AIM) && [tTh, tTf].every(r => still(r) && deny(r) === 'That character is not there.')
          && j(tTs.v('c_a').f_hp) === j({ cur: 7 }) && deny(tTa) === 'They must stand next to you.' && Sx.cleanSystem(sysN, { F: Fx, gmView: false }).rolls.find(r => r.id === 'r_tgt').to === 'target',
          j([tT.v('c_f'), cT, [tTn, tTo, tTb, tTm, tTh, tTf].map(deny), tTs.v('c_a'), deny(tTa)])); }
    // the ally slice's own pieces, pinned: allyOn asked in the three places, before anything is rolled or moved
    check('1.5.9 Applies to an adjacent character, the host\'s one judge (pinned): allyOn is asked by char-apply, the roll-req branch and net.diceRoll, each before applyAct and before anything is rolled; the choices of the sheet\'s menu are read from this screen\'s copy (net.allyChoices) and a player\'s app passes over a hidden token',
        (srcR.match(/allyOn\(camp[AQR], /g) || []).length === 3 && srcR.indexOf("onA = typeof allyOn === 'function' ? allyOn(campA, mapA, tkA, qa.on, profA.id, actA.to === 'target')") < srcR.indexOf('var resA = Sa.applyAct(') && srcR.indexOf('onQ = typeof allyOn') < srcR.indexOf('var resQ = Fq.evaluate(q.expr')
        && srcR.indexOf('onR = typeof allyOn') < srcR.indexOf('var res = F.evaluate(expr, varsR') && allySrc.includes('if (client && w.hidden) return;')
        && srcR.includes("q.on, pidQ, actQ.to === 'target')") && srcR.includes("o.on, '', entR.to === 'target')") && allySrc.includes("if (far === true ? !allyAimed(camp, map, userTok, tok, pid) : !allyNear(map, userTok, tok, !!pid))"));
})());


// Stage 6 HUD R2b: a list roll with consequences or needs on the wire — the host finds the list's roll in the player's view by its index, rebuilds its
// formula, refuses it while its needs fail, and moves the row's counters after it lands (sliced roll-req and diceroll, run for real)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const src3 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
    const line = k => { const i = src3.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src3.slice(i, src3.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const sysW = Sx.cleanSystem({ v: 1, name: 'W', rolls: [], fields: [
        { id: 'f_wp', key: 'Weapons', kind: 'item-list', edit: 'owner', list: { stats: [{ key: 'Shots' }], counters: [{ key: 'Charges', def: 3, max: 'Row.Shots' }, { key: 'Hits' }],
            rolls: [{ label: 'Fire', formula: '3d6 <= 30', needs: 'Row.Charges >= 1', needsText: 'Out of charges', then: [{ c: 'Charges', formula: '1' }, { c: 'Hits', formula: '1', add: true, when: 'hit' }] }, { label: 'Damage', formula: '2d6', needs: 'Row.Hits > 0', needsText: 'No hit pending', then: [{ c: 'Hits', formula: '0', set: true }] }] } }],
        items: [{ id: 'i_bl', name: 'Blaster', stats: { Shots: 5 } }] }, { F: Fx, gmView: true });
    const rowsW = ct => [{ id: 'w_1', defId: 'i_bl', qty: 1, ct: ct }];
    const runW = (msg, ct, sys) => { const out = { table: [], sent: [], deltas: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sys || sysW, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: rowsW(ct) } } }, items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta: (id, d) => out.deltas.push(JSON.parse(JSON.stringify(d))) };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { out.table.push(rec.expr); }, () => {}, () => {}, () => {});
        out.ct = camp.chars.c_a.values.f_wp[0].ct; return out; };
    const wFire = runW({ expr: '3d6 <= 30', row: { f: 'f_wp', r: 'w_1', i: 0 } }, { Charges: 2 }), wEmpty = runW({ expr: '3d6 <= 30', row: { f: 'f_wp', r: 'w_1', i: 0 } }, { Charges: 0 });
    const wDmg = runW({ expr: '2d6', row: { f: 'f_wp', r: 'w_1', i: 1 } }, { Charges: 2, Hits: 1 }), wNoHit = runW({ expr: '2d6', row: { f: 'f_wp', r: 'w_1', i: 1 } }, { Charges: 2 }), wFake = runW({ expr: '3d6 <= 99', row: { f: 'f_wp', r: 'w_1', i: 0 } }, { Charges: 2 });
    const wMod = runW({ expr: Dx.composeModifier('3d6 <= 30', 1, Fx.parse).expr, row: { f: 'f_wp', r: 'w_1', i: 0 }, mod: 1 }, { Charges: 2 }), wPlain = runW({ expr: 'd6', row: { f: 'f_wp', r: 'w_1' } }, { Charges: 2 });
    const refusedW = (w, m) => w.table.length === 0 && w.deltas.length === 0 && w.sent.length === 1 && w.sent[0].type === 'roll-deny' && w.sent[0].message === m;
    check('R2b a player\'s list roll by its index: Fire spends a charge and scores a hit on the host\'s copy (one delta); with no charge it is refused "Out of charges" before anything is rolled; Damage clears the hit, and with none it is refused "No hit pending"; a formula that is not the roll\'s is refused; a modifier sent as data is rolled; a plain row roll (no index) changes nothing',
        wFire.table.length === 1 && j(wFire.ct) === j({ Charges: 1, Hits: 1 }) && wFire.deltas.length === 1 && refusedW(wEmpty, 'Out of charges') && j(wEmpty.ct) === j({ Charges: 0 })
        && wDmg.table.length === 1 && j(wDmg.ct) === j({ Charges: 2, Hits: 0 }) && refusedW(wNoHit, 'No hit pending') && refusedW(wFake, 'That roll does not match its button now.')
        && wMod.table.length === 1 && j(wMod.ct) === j({ Charges: 1, Hits: 1 }) && wPlain.table.length === 1 && wPlain.deltas.length === 0 && j(wPlain.ct) === j({ Charges: 2 }),
        j([wFire.ct, wEmpty.sent, wDmg.ct, wNoHit.sent, wFake.sent, wMod.ct, wPlain.ct]));
    // the review of the fold of 409: a list holds 160 rolls (eight since 1.5.4, ten since 1.6.0, sixteen since the raise the session that builds a game system asked for, 160 since 1.6.2: moved on purpose), so a player's 160th (index 159) with a Then reaches the host's real branch, and one past them does not
    const sysW8 = Sx.cleanSystem({ v: 1, name: 'W8', rolls: [], fields: [
        { id: 'f_wp', key: 'Weapons', kind: 'item-list', edit: 'owner', list: { stats: [{ key: 'Shots' }], counters: [{ key: 'Charges', def: 3, max: 'Row.Shots' }, { key: 'Hits' }],
            rolls: Array.from({ length: 159 }, (_, i) => i).map(i => ({ label: 'R' + i, formula: 'd' + (i + 4) })).concat([{ label: 'Burst', formula: '3d6 <= 30', needs: 'Row.Charges >= 1', needsText: 'Out of charges', then: [{ c: 'Charges', formula: '1' }, { c: 'Hits', formula: '1', add: true, when: 'hit' }] }]) } }],
        items: [{ id: 'i_bl', name: 'Blaster', stats: { Shots: 5 } }] }, { F: Fx, gmView: true });
    const w8 = runW({ expr: '3d6 <= 30', row: { f: 'f_wp', r: 'w_1', i: 159 } }, { Charges: 2 }, sysW8), w8e = runW({ expr: '3d6 <= 30', row: { f: 'f_wp', r: 'w_1', i: 159 } }, { Charges: 0 }, sysW8);
    const w8n = runW({ expr: '3d6 <= 30', row: { f: 'f_wp', r: 'w_1', i: 160 } }, { Charges: 2 }, sysW8), w8m = runW({ expr: Dx.composeModifier('3d6 <= 30', 2, Fx.parse).expr, row: { f: 'f_wp', r: 'w_1', i: 159 }, mod: 2 }, { Charges: 2 }, sysW8);
    check('409 a player\'s 160th list roll (index 159: a list holds 160 since 1.6.2, sixteen before it, ten before the raise the session that builds a game system asked for, eight since 1.5.4; moved on purpose) with a Then and needs, through the host\'s real roll-req branch: rolled with its charge spent and its hit scored on the host\'s copy (one delta), with a modifier beside it too; refused "Out of charges" with none; an index past the list\'s 160 refused as a roll that could not be read',
        sysW8.fields[0].list.rolls.length === 160 && w8.table.length === 1 && j(w8.ct) === j({ Charges: 1, Hits: 1 }) && w8.deltas.length === 1 && w8m.table.length === 1 && j(w8m.ct) === j({ Charges: 1, Hits: 1 })
        && refusedW(w8e, 'Out of charges') && j(w8e.ct) === j({ Charges: 0 }) && refusedW(w8n, 'That roll could not be read.') && j(w8n.ct) === j({ Charges: 2 }), j([w8.sent, w8.ct, w8m.sent, w8e.sent, w8n.sent]));
    // the GM's own: net.diceRoll with the row's index — its needs before anything is rolled, its consequences here
    const runGW = (expr, o, ct) => { const out = { deltas: [], saves: 0 };
        const camp = { id: 'k', system: sysW, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: rowsW(ct) } } } };
        const net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta: (id, d) => out.deltas.push(JSON.parse(JSON.stringify(d))) };
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => { out.saves++; });
        out.ret = dr(expr, Object.assign({ charId: 'c_a' }, o)); out.ct = camp.chars.c_a.values.f_wp[0].ct; return out; };
    const gFire = runGW('3d6 <= 30', { row: { f: 'f_wp', r: 'w_1', i: 0 } }, { Charges: 2 }), gEmpty = runGW('3d6 <= 30', { row: { f: 'f_wp', r: 'w_1', i: 0 } }, { Charges: 0 });
    check('R2b the GM\'s own list roll by its index: its consequences move the counters here (one delta, a save); a roll whose needs fail is refused with its text before anything is rolled',
        gFire.ret.ok && j(gFire.ct) === j({ Charges: 1, Hits: 1 }) && gFire.deltas.length === 1 && gFire.saves === 1 && j(gEmpty.ret) === j({ error: 'Out of charges' }) && j(gEmpty.ct) === j({ Charges: 0 }) && gEmpty.saves === 0,
        j([gFire.ret, gFire.ct, gEmpty.ret]));
    const runCW = o => { const sent = []; const conn = { peer: 'H', open: true, send: m => sent.push(JSON.parse(JSON.stringify(m))) };
        const net = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'H', conns: [conn], roster: {} };
        new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'setTimeout', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true } }, () => ({ id: 'k', system: sysW, chars: {} }), () => ({ id: 'u_a', name: 'Pat' }), () => {}, () => null, e => { throw e; }, () => {}, () => {}, () => {}, () => {}, () => 0)('3d6 <= (30) + 1', o); return sent; };
    const cwI = runCW({ charId: 'c_a', row: { f: 'f_wp', r: 'w_1', i: 0 }, mod: 1 });
    check('R2b the player\'s request (net.diceRoll, run for real): a list roll with consequences or needs sends the row\'s index and its modifier', cwI.length === 1 && j(cwI[0].row) === j({ f: 'f_wp', r: 'w_1', i: 0 }) && cwI[0].mod === 1 && Dx.cleanRollReq(cwI[0]) !== null, j(cwI));
    const apSrcW = (ordersSrc + '\n' + between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply')), paSrcW = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply'), dlSrcW = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const sysWA = Sx.cleanSystem({ v: 1, name: 'WA', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', kind: 'item-list', edit: 'owner', list: { stats: [{ key: 'Shots' }], counters: [{ key: 'Charges', def: 3, max: 'Row.Shots' }], rolls: [{ label: 'Reload', apply: [{ c: 'Charges', formula: 'Row.Shots', set: true }] }] } }], items: [{ id: 'i_bl', name: 'Blaster', stats: { Shots: 5 } }] }, { F: Fx, gmView: true });
    const campWA = { id: 'k', system: sysWA, items: {}, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_1', defId: 'i_bl', qty: 1, ct: { Charges: 1 } }] } } } }, outWA = { sent: [], chat: [] };
    const connWA = { peer: 'pA', open: true, send: m => { packCheck(m); outWA.sent.push(JSON.parse(JSON.stringify(m))); } }, netWA = { active: true, role: 'host', paused: false, combats: {}, conns: [connWA], roster: { pA: { id: 'u_a', name: 'Pat' } } };
    new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine', 'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrcW + '\n' + paSrcW + '\n' + apSrcW)(
        { type: 'char-apply', rid: 'a1', charId: 'c_a', row: { f: 'f_wp', r: 'w_1', i: 0 }, label: 'Blaster · Reload' }, connWA, netWA, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} } }, () => false, () => campWA, () => {}, e => { throw e; }, c => (netWA.roster[c.peer] ? netWA.roster[c.peer].id : null), { allow: () => true },
        (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), () => {}, m => outWA.chat.push(m), () => {}, r => Dx.applyText(r));
    check('R2b a player\'s list action (char-apply with the row) moves the row\'s counter on the host\'s copy (Reload: Charges 1 to 5), acked, its card to them and the GM',
        j(campWA.chars.c_a.values.f_wp[0].ct) === j({ Charges: 5 }) && outWA.sent.some(m => m.type === 'char-ack') && outWA.sent.some(m => m.type === 'apply' && m.priv === 'gm' && j(m.lines) === j([{ n: 'Charges', d: 4, v: 5 }])), j([campWA.chars.c_a.values.f_wp, outWA.sent.map(m => m.type)]));
})());

// SITE_EQUIVALENT_PLAN fold 2 on the wire (the owner, 2026-10-14: "everything in my campaign is able to be created using just the system and character
// sheet creation UI"): (A) a system roll's or apply action's needs, judged by the host through the player's own view, before anything is rolled or moved,
// with the reason a list roll gets; (B) a player's switch-on on a One at a time list, one change the host stores and sends whole, each row's equip lock kept
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js')), J = JSON.stringify;
    const line = k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq')), drSrc = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
    const apSrc = (ordersSrc + '\n' + between('// [netcheck:charapply-start]', '// [netcheck:charapply-end]', 'charapply')), paSrc = between('// [netcheck:postapply-start]', '// [netcheck:postapply-end]', 'postapply'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysN = Sx.cleanSystem({ v: 1, name: 'N', fields: [{ id: 'f_st', key: 'Stunned', kind: 'toggle', edit: 'owner' }, { id: 'f_bl', key: 'Bleeding', kind: 'number', def: 0 }, { id: 'f_hp', key: 'HP', kind: 'number', def: 10 }, { id: 'f_g', key: 'GSecret', kind: 'number', def: 0, vis: 'gm' }],
        rolls: [{ id: 'r_dodge', label: 'Dodge', formula: '3d6 <= 10', needs: 'not(Stunned)', needsText: 'Not while stunned' }, { id: 'r_g', label: 'G', formula: '3d6 <= 30', needs: 'GSecret > 0', needsText: 'Secret' },
            { id: 'r_bleed', label: 'Bleed', apply: [{ f: 'f_hp', formula: 'Bleeding' }], needs: 'Bleeding > 0', needsText: 'Not bleeding' }] }, { F: Fx, gmView: true });
    const chN = v => ({ c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: v } });
    const runR = (msg, vals, sy) => { const out = { table: [], sent: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sy || sysN, chars: chN(vals), items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta() {} };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(J(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1', charId: 'c_a' }, msg), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { out.table.push(rec.expr); }, () => {}, () => {}, () => {});
        return out; };
    const rNo = runR({ act: 'r_dodge', expr: '3d6 <= 10' }, { f_st: true }), rYes = runR({ act: 'r_dodge', expr: '3d6 <= 10' }, { f_st: false }), rGm = runR({ act: 'r_g', expr: '3d6 <= 30' }, {});
    const rMod = runR({ act: 'r_dodge', expr: Dx.composeModifier('3d6 <= 10', 2, Fx.parse).expr, mod: 2 }, { f_st: true });
    check('fold 2 (A) a player\'s system roll that needs something (roll-req, run for real): refused before anything is rolled while it is not met, with its own words and the reason a list roll gets, a modifier beside it too; rolled once it is met; needs that read a GM-only value are not in their view, so their roll is not held back by them',
        rNo.table.length === 0 && J(rNo.sent) === J([{ type: 'roll-deny', rid: 'q1', reason: 'error', message: 'Not while stunned', pos: 0, len: 0 }]) && rMod.table.length === 0 && rMod.sent[0].message === 'Not while stunned'
        && J(rYes.table) === J(['3d6 <= 10']) && !rYes.sent.some(m => m.type === 'roll-deny') && J(rGm.table) === J(['3d6 <= 30']), J([rNo, rYes, rGm, rMod.sent]));
    const runG = (act, vals, sy) => { const camp = { id: 'k', system: sy || sysN, chars: chN(vals) }, net = { active: true, role: 'host', stream: false, conns: [], roster: {}, syncCharDelta() {} }, pushed = [];
        const dr = new Function('net', 'DC', 'SC', 'window', 'getActiveCampaign', 'getProfile', 'toast', 'ui', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'save', 'var _dicePending = null;\n' + helpers + drSrc + '\nreturn net.diceRoll;')(
            net, () => Dx, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { tokenCtxFor: () => null, charChanged() {} } }, () => camp, () => ({ id: 'u_gm', name: 'GM' }), () => {}, () => null, e => { throw e; }, () => {}, rec => pushed.push(rec.expr), () => {}, () => {});
        return [dr('3d6 <= 10', { charId: 'c_a', act: act }), pushed]; };
    const gNo = runG('r_dodge', { f_st: true }), gYes = runG('r_dodge', { f_st: false });
    check('fold 2 (A) the GM\'s own system roll that needs something (net.diceRoll, run for real): refused with its words before anything is rolled, rolled once it is met',
        J(gNo) === J([{ error: 'Not while stunned' }, []]) && gYes[0].ok === true && J(gYes[1]) === J(['3d6 <= 10']), J([gNo, gYes]));
    const runA = (vals, sy) => { const camp = { id: 'k', system: sy || sysN, items: {}, chars: chN(vals) }, out = { sent: [], chat: [] };
        const conn = { peer: 'pA', open: true, send: m => { packCheck(m); out.sent.push(JSON.parse(J(m))); } }, net = { active: true, role: 'host', paused: false, combats: {}, conns: [conn], roster: { pA: { id: 'u_a', name: 'Pat' } } };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine', 'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + paSrc + '\n' + apSrc)(
            { type: 'char-apply', rid: 'a1', charId: 'c_a', act: 'r_bleed', label: 'Bleed' }, conn, net, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} } }, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), () => {}, m => out.chat.push(m), () => {}, r => Dx.applyText(r));
        out.vals = camp.chars.c_a.values; return out; };
    const aNo = runA({ f_bl: 0 }), aYes = runA({ f_bl: 2 });
    check('fold 2 (A) a player\'s apply action that needs something (char-apply, run for real): refused with the reason a list roll gets and its words while it is not met, nothing moved, stored or carded; pressed once it is met, it moves its values on the host\'s copy',
        J(aNo.sent) === J([{ type: 'char-deny', rid: 'a1', reason: 'error', msg: 'Not bleeding' }]) && J(aNo.vals) === J({ f_bl: 0 }) && aNo.chat.length === 0 && aYes.sent.some(m => m.type === 'char-ack') && aYes.vals.f_hp === 8, J([aNo, aYes.sent.map(m => m.type), aYes.vals]));
    {   // 1.6.2 (a system build's ask, 2026-11-14): a roll's and an action's reasons (needsWhy), judged on the host after its needs and in order; the
        // refusal says the first that fails in its own words, never its formula, and a reason read from a GM-only value is not in the players' view
        const sysW = Sx.cleanSystem({ v: 1, name: 'W', fields: [{ id: 'f_st', key: 'Stunned', kind: 'toggle', edit: 'owner' }, { id: 'f_bl', key: 'Bleeding', kind: 'number', def: 0 }, { id: 'f_hp', key: 'HP', kind: 'number', def: 10 }, { id: 'f_g', key: 'GSecret', kind: 'number', def: 0, vis: 'gm' }],
            rolls: [{ id: 'r_dodge', label: 'Dodge', formula: '3d6 <= 10', needs: 'HP > 0', needsText: 'Down', needsWhy: [{ if: 'not(Stunned)', says: 'Not while stunned' }, { if: 'Bleeding < 3', says: 'Bleeding too much' }] },
                { id: 'r_g', label: 'G', formula: '3d6 <= 30', needsWhy: [{ if: 'GSecret > 0', says: 'Secret' }] },
                { id: 'r_bleed', label: 'Bleed', apply: [{ f: 'f_hp', formula: 'Bleeding' }], needsWhy: [{ if: 'Bleeding > 0', says: 'Not bleeding' }, { if: 'Bleeding < 5', says: 'Bleeding out' }] }] }, { F: Fx, gmView: true });
        const ex = { act: 'r_dodge', expr: '3d6 <= 10' }, wR = [runR(ex, { f_st: true }, sysW), runR(ex, { f_bl: 4 }, sysW), runR(ex, { f_hp: 0, f_st: true }, sysW), runR(ex, { f_bl: 1 }, sysW), runR({ act: 'r_g', expr: '3d6 <= 30' }, {}, sysW)];
        const wG = [runG('r_dodge', { f_bl: 4 }, sysW), runG('r_dodge', {}, sysW), runG('r_g', {}, sysW)], wA = [runA({ f_bl: 0 }, sysW), runA({ f_bl: 6 }, sysW), runA({ f_bl: 2 }, sysW)];
        check('1.6.2 needsWhy on the wire: a player\'s roll (roll-req, run for real) is refused before anything is rolled with the first reason that fails in its words (stunned, then bleeding too much), the single needs first (Down); rolled once all hold; a reason read from a GM-only value is not in their view and holds nothing back. The GM\'s own roll (net.diceRoll) says the reason alike, and is held by the GM-only one too. A player\'s action (char-apply) is refused with the reason a list roll gets and that reason\'s words, nothing moved, and runs once each holds',
            wR[0].sent[0].message === 'Not while stunned' && wR[0].table.length === 0 && wR[1].sent[0].message === 'Bleeding too much' && wR[2].sent[0].message === 'Down' && J(wR[3].table) === J(['3d6 <= 10']) && J(wR[4].table) === J(['3d6 <= 30'])
            && J(wG[0]) === J([{ error: 'Bleeding too much' }, []]) && wG[1][0].ok === true && J(wG[2]) === J([{ error: 'Secret' }, []])
            && J(wA[0].sent) === J([{ type: 'char-deny', rid: 'a1', reason: 'error', msg: 'Not bleeding' }]) && wA[1].sent[0].msg === 'Bleeding out' && J(wA[1].vals) === J({ f_bl: 6 }) && wA[2].vals.f_hp === 8
            && ![].concat(wR.map(r => J(r.sent)), wG.map(J), wA.map(a => J(a.sent))).some(t => /Bleeding [<>]|not\(Stunned\)|GSecret/.test(t)), J([wR.map(r => r.sent), wG, wA.map(a => a.sent)]));
    }
    // fold 2's review: an apply action reads CombatRound from the fight that holds the player's token, two fights on one map in rounds 2 and 7, and the
    // first begun there for a token in neither, though the GM plays the second (char-apply run for real, net.combatRoundOf, as the player's own sheet)
    const sysR2 = Sx.cleanSystem({ v: 1, name: 'R2', fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 10 }], rolls: [{ id: 'r_charge', label: 'Charge', apply: [{ f: 'f_hp', formula: '1' }], needs: 'CombatRound >= 5', needsText: 'Not before round 5' }] }, { F: Fx, gmView: true });
    const runAR = (charId, ownerId, peer, tokId) => { const out = { sent: [] };
        const camp = { id: 'k', system: sysR2, chars: { [charId]: { id: charId, name: 'X', ownerId, npc: false, values: {} } }, items: { mDocks: { type: 'map', whiteboard: [{ id: tokId, isChar: true, charId, ownerId, x: 0, y: 0 }] } } };
        const conn = { peer, open: true, send: m => { packCheck(m); out.sent.push(JSON.parse(J(m))); } };
        const net = { active: true, role: 'host', paused: false, conns: [conn], roster: { [peer]: { id: ownerId, name: 'P', location: 'mDocks' } }, combats: { f_dock0001: { id: 'f_dock0001', mapId: 'mDocks', round: 2, turn: 0, rows: [{ id: 'rt_kael', tokId: 't_kael' }] }, f_dock0002: { id: 'f_dock0002', mapId: 'mDocks', round: 7, turn: 0, rows: [{ id: 'rt_sela', tokId: 't_sela' }] } } };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'diceFrom', 'sendTable', 'pushChat', 'logEvent', 'applyLine', 'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + paSrc + '\n' + apSrc.split(ordersSrc).join(ordersSrc + "\nnet.fightOn = 'f_dock0002';   // the GM plays the second fight (set after the slice, which starts with none)\n"))(
            { type: 'char-apply', rid: 'a1', charId, act: 'r_charge', label: 'Charge' }, conn, net, () => Sx, { wpFormula: Fx, wpVtt: { on: () => true, rulesOn: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} } }, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true },
            (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), (p, gm) => ({ id: p.id, name: p.name, gm: !!gm }), () => {}, () => {}, () => {}, r => Dx.applyText(r));
        return out.sent.some(m => m.type === 'char-ack') ? 'ack' : ((out.sent.find(m => m.type === 'char-deny') || {}).msg || 'none'); };
    const ar = [runAR('c_kael', 'u_a', 'pA', 't_kael'), runAR('c_sela', 'u_b', 'pB', 't_sela'), runAR('c_rook', 'u_c', 'pC', 't_rook')];
    check('fold 2\'s review (char-apply, run for real): an apply action that needs round 5 reads CombatRound from the fight that holds the player\'s token, two fights on one map in rounds 2 and 7 — refused for Kael in the first, pressed for Sela in the second — and the first begun there for a token in neither, though the GM plays the second, as the player\'s own sheet reads it (net.combatRoundOf)',
        J(ar) === J(['Not before round 5', 'ack', 'Not before round 5']), J(ar));
    // (B) a switch-on on a One at a time list, through the host's real char-item branch, the real delta and the GM's notice
    const sysB = Sx.cleanSystem({ v: 1, name: 'B', rolls: [], fields: [{ id: 'f_ar', key: 'Armor', label: 'Armor', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Worn', per: 'Loc' }, stats: [{ key: 'Loc', kind: 'pick', opts: [{ label: 'Torso', name: 'HP' }, { label: 'Arm', name: 'HP' }] }] } }],
        items: [{ id: 'i_pl', name: 'Plate', stats: { Loc: 'Torso' }, eq: 'bound', eqMsg: 'It is fused' }, { id: 'i_ma', name: 'Mail', stats: { Loc: 'Torso' } }, { id: 'i_br', name: 'Bracer', stats: { Loc: 'Arm' } }, { id: 'i_he', name: 'Helm', stats: { Loc: 'Torso' }, eq: 'curse', eqMsg: 'It clings' }] }, { F: Fx, gmView: true });
    const runB = rows => { const camp = { id: 'k', system: sysB, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_ar: rows } } } }, out = { answer: [], owner: [], notes: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
        Hh.handle({ type: 'char-item', rid: 'i1', charId: 'c_1', fieldId: 'f_ar', op: 'set', rowId: 'w_m', facts: { on: true } }, { peer: 'pA', send: box(out.answer) });
        out.rows = camp.chars.c_1.values.f_ar.map(r => r.id + ':' + r.on + (r.keptOn ? 'k' : '')).join(' ');
        out.ownRows = out.owner.length ? ((out.owner[0].values || {}).f_ar || []).map(r => r.id + ':' + r.on).join(' ') : ''; return out; };
    const bOk = runB([{ id: 'w_x', defId: 'i_ma', qty: 1, on: true }, { id: 'w_m', defId: 'i_ma', qty: 1, on: false }, { id: 'w_b', defId: 'i_br', qty: 1, on: true }]);
    const bBound = runB([{ id: 'w_p', defId: 'i_pl', qty: 1, on: true }, { id: 'w_m', defId: 'i_ma', qty: 1, on: false }]), bCurse = runB([{ id: 'w_h', defId: 'i_he', qty: 1, on: true }, { id: 'w_m', defId: 'i_ma', qty: 1, on: false }]);
    check('fold 2 (B) a player\'s switch-on on a One at a time list, per a stat (char-item, run for real): one change, stored and sent whole, the other row on the same location off and the one on another location left on; a bound row the change would switch off refuses it with that row\'s message, nothing stored, sent or saved, the GM told as for any bound row; a curse-on-contact row stays on, kept, its owner\'s copy showing it off and the answer carrying its message, the GM told',
        J(bOk.answer) === J([{ type: 'char-ack', rid: 'i1' }]) && bOk.rows === 'w_x:false w_m:true w_b:true' && bOk.ownRows === 'w_x:false w_m:true w_b:true' && bOk.saves === 1 && bOk.owner.length === 1
        && J(bBound.answer) === J([{ type: 'char-deny', rid: 'i1', reason: 'stays', msg: 'Plate is bound and stays on, so Mail stays off. It is fused' }]) && bBound.rows === 'w_p:true w_m:false' && bBound.owner.length === 0 && bBound.saves === 0 && bBound.notes.length === 1
        && J(bCurse.answer) === J([{ type: 'char-ack', rid: 'i1', msg: 'It clings' }]) && bCurse.rows === 'w_h:truek w_m:true' && bCurse.ownRows === 'w_h:false w_m:true' && bCurse.notes.length === 1, J([bOk, bBound, bCurse]));
    // 1.6.0 O1: a switch that goes by where rows sit (on.over), through the host's real char-item branch
    const sysOv = Sx.cleanSystem({ v: 1, name: 'O', rolls: [], fields: [{ id: 'f_ar', key: 'Kit', label: 'Kit', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Worn', over: 'Covers' }, stats: [{ key: 'Covers', labels: ['Head', 'Body', 'Left hand', 'Right hand'] }] } }],
        items: [{ id: 'i_gl', name: 'Gloves', stats: { Covers: 12 } }, { id: 'i_lg', name: 'Left gauntlet', stats: { Covers: 4 } }, { id: 'i_hm', name: 'Helm', stats: { Covers: 1 } }, { id: 'i_pl', name: 'Plate', stats: { Covers: 2 }, eq: 'bound' }, { id: 'i_ve', name: 'Vest', stats: { Covers: 2 } }] }, { F: Fx, gmView: true });
    const runOv = rows => { const camp = { id: 'k', system: sysOv, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_ar: rows } } } }, out = { answer: [], owner: [], notes: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
        Hh.handle({ type: 'char-item', rid: 'i1', charId: 'c_1', fieldId: 'f_ar', op: 'set', rowId: 'w_n', facts: { on: true } }, { peer: 'pA', send: box(out.answer) });
        out.rows = camp.chars.c_1.values.f_ar.map(r => r.id + ':' + r.on).join(' '); out.ownRows = out.owner.length ? ((out.owner[0].values || {}).f_ar || []).map(r => r.id + ':' + r.on).join(' ') : ''; return out; };
    const ovOk = runOv([{ id: 'w_g', defId: 'i_gl', qty: 1, on: true }, { id: 'w_h', defId: 'i_hm', qty: 1, on: true }, { id: 'w_n', defId: 'i_lg', qty: 1, on: false }]);
    const ovBound = runOv([{ id: 'w_p', defId: 'i_pl', qty: 1, on: true }, { id: 'w_n', defId: 'i_ve', qty: 1, on: false }]);
    check('1.6.0 O1 a player\'s switch-on on a list that goes by where its rows sit (char-item, run for real): the Left gauntlet takes off the Gloves that share its hand and leaves the Helm on, one change stored and sent whole; a bound Plate on the body refuses the Vest in words that name both, nothing stored, sent or saved',
        J(ovOk.answer) === J([{ type: 'char-ack', rid: 'i1' }]) && ovOk.rows === 'w_g:false w_h:true w_n:true' && ovOk.ownRows === ovOk.rows && ovOk.saves === 1 && ovOk.owner.length === 1
        && ovBound.answer.length === 1 && ovBound.answer[0].type === 'char-deny' && ovBound.answer[0].reason === 'stays' && /^Plate is bound and stays on, so Vest stays off\./.test(ovBound.answer[0].msg) && ovBound.rows === 'w_p:true w_n:false' && ovBound.saves === 0 && ovBound.owner.length === 0,
        J([ovOk, ovBound]));
    // 1.5.8: a list's switch with needs, through the host's real char-item branch (the players' view, the real core)
    const sysW = Sx.cleanSystem({ v: 1, name: 'W', rolls: [], fields: [{ id: 'f_wd', key: 'Wands', label: 'Wands', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Ready', needs: 'Row.Charge > 0', needsText: 'It has no charge left.' }, stats: [{ key: 'Charge' }] } }],
        items: [{ id: 'i_fu', name: 'Full', stats: { Charge: 2 } }, { id: 'i_em', name: 'Empty', stats: { Charge: 0 } }] }, { F: Fx, gmView: true });
    const runW = rid => { const camp = { id: 'k', system: sysW, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wd: [{ id: 'w_f', defId: 'i_fu', qty: 1 }, { id: 'w_e', defId: 'i_em', qty: 1 }] } } } }, out = { answer: [], owner: [], notes: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
        Hh.handle({ type: 'char-item', rid: 'i1', charId: 'c_1', fieldId: 'f_wd', op: 'set', rowId: rid, facts: { on: true } }, { peer: 'pA', send: box(out.answer) });
        out.rows = camp.chars.c_1.values.f_wd.map(r => r.id + ':' + (r.on === true)).join(' '); return out; };
    const wEm = runW('w_e'), wFu = runW('w_f');
    check('1.5.8 a player\'s switch-on of a row its list switch\'s needs refuse (char-item, run for real): answered char-deny with the reason needs and the switch\'s own words, nothing stored, sent or saved; a row whose needs hold is switched on, stored, sent and saved',
        J(wEm.answer) === J([{ type: 'char-deny', rid: 'i1', reason: 'needs', msg: 'It has no charge left.' }]) && wEm.rows === 'w_f:false w_e:false' && wEm.owner.length === 0 && wEm.saves === 0
        && J(wFu.answer) === J([{ type: 'char-ack', rid: 'i1' }]) && wFu.rows === 'w_f:true w_e:false' && wFu.owner.length === 1 && wFu.saves === 1, J([wEm, wFu]));
    // 1.5.8: a removed row's Undo, through the host's real char-item branch: the host keeps the row its player's own removal took out, and puts
    // back only that very row, at its place, while the list is as the removal left it (the row a message names is never read)
    const mkU = () => { const camp = { id: 'k', system: sysW, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wd: [{ id: 'w_f', defId: 'i_fu', qty: 1, on: true, note: 'old' }, { id: 'w_e', defId: 'i_em', qty: 3 }, { id: 'w_g', defId: 'i_fu', qty: 1 }] } } } }, out = { answer: [], owner: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        let n = 0; const send = m => { out.answer.length = 0; Hh.handle(Object.assign({ type: 'char-item', rid: 'u' + (++n), charId: 'c_1', fieldId: 'f_wd' }, m), { peer: 'pA', send: box(out.answer) }); return J(out.answer.map(a => a.type + (a.reason ? ':' + a.reason : ''))); };
        const rows = () => J(camp.chars.c_1.values.f_wd);
        return { camp, out, send, rows }; };
    const u1 = mkU(), u1a = u1.rows(), u1r = u1.send({ op: 'remove', rowId: 'w_f' }), u1b = u1.rows(), u1u = u1.send({ op: 'restore', rowId: 'w_f', row: { id: 'w_f', defId: 'i_fu', qty: 99 } }), u1c = u1.rows(), u1again = u1.send({ op: 'restore', rowId: 'w_f' });
    const u2 = mkU(); u2.send({ op: 'remove', rowId: 'w_f' }); u2.camp.chars.c_1.values.f_wd[0].qty = 2; const u2u = u2.send({ op: 'restore', rowId: 'w_f' }), u2r = u2.rows();   // the GM changed the list since
    const u3 = mkU(), u3u = u3.send({ op: 'restore', rowId: 'w_f' }), u3b = mkU(); u3b.send({ op: 'setQty', rowId: 'w_e', qty: 1 }); const u3c = u3b.send({ op: 'restore', rowId: 'w_e' });   // nothing removed; a quantity only lowered
    const u4 = mkU(); u4.send({ op: 'remove', rowId: 'w_e' }); const u4u = u4.send({ op: 'restore', rowId: 'w_e' }), u4r = J(u4.camp.chars.c_1.values.f_wd.map(r => r.id + ':' + r.qty));   // the middle row, back at its place
    check('1.5.8 a removed row\'s Undo (char-item, run for real): restore puts back the very row the host took out, its values whole and at its place, stored and sent, once; a row a message names is never read; refused as stale once the list changed since, when nothing was removed, or when a quantity was only lowered',
        u1r === J(['char-ack']) && u1b !== u1a && u1u === J(['char-ack']) && u1c === u1a && u1again === J(['char-deny:stale']) && u2u === J(['char-deny:stale']) && !/w_f/.test(u2r)
        && u3u === J(['char-deny:stale']) && u3c === J(['char-deny:stale']) && u4u === J(['char-ack']) && u4r === J(['w_f:1', 'w_e:3', 'w_g:1']), J([u1r, u1u, u1c === u1a, u1again, u2u, u3u, u3c, u4u, u4r]));
    // 1.6.0 R14 (the owner, 2026-10-28: "make Undo after removing a row bring its parts back too, for the GM and for players"): a host's parts, from the host's own record
    const sysP = Sx.cleanSystem({ v: 1, name: 'P', rolls: [], fields: [{ id: 'f_wd', key: 'Wands', label: 'Wands', kind: 'item-list', edit: 'owner', vis: 'all', list: { parts: { from: 'f_op' } } }, { id: 'f_op', key: 'Opts', label: 'Opts', kind: 'item-list', edit: 'owner', vis: 'all' }],
        items: [{ id: 'i_fu', name: 'Full' }, { id: 'i_wi', name: 'Wider' }] }, { F: Fx, gmView: true });
    const mkP = () => { const camp = { id: 'k', system: sysP, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wd: [{ id: 'w_f', defId: 'i_fu', qty: 1 }, { id: 'w_g', defId: 'i_fu', qty: 1 }], f_op: [{ id: 'w_o', defId: 'i_wi', qty: 1, in: 'w_g' }, { id: 'w_p', defId: 'i_wi', qty: 2, in: 'w_f' }] } } } }, out = { answer: [], owner: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        let n = 0; const send = m => { out.answer.length = 0; Hh.handle(Object.assign({ type: 'char-item', rid: 'p' + (++n), charId: 'c_1', fieldId: 'f_wd' }, m), { peer: 'pA', send: box(out.answer) }); return J(out.answer.map(a => a.type + (a.reason ? ':' + a.reason : ''))); };
        return { camp, out, send, vals: () => J(camp.chars.c_1.values) }; };
    const p1 = mkP(), p1a = p1.vals(), p1r = p1.send({ op: 'remove', rowId: 'w_g' }), p1b = J(p1.camp.chars.c_1.values.f_op.map(r => r.id)), p1u = p1.send({ op: 'restore', rowId: 'w_g', parts: { f: 'f_op', rows: [{ row: { id: 'w_x', defId: 'i_wi', qty: 9, in: 'w_g' }, at: 0 }] } }), p1c = p1.vals();
    check('1.6.0 R14 a player\'s Undo of a host they removed (char-item, run for real): its parts come back with it, from the host\'s own record and never the message\'s, the host and every part as they stood, stored and sent',
        p1r === J(['char-ack']) && p1b === J(['w_p']) && p1u === J(['char-ack']) && p1c === p1a && p1.out.saves === 2, J([p1r, p1b, p1u, p1c, p1a]));
    // 205 (4) (the owner, 2026-10-29: "Yes, open it"): a player's Undo of a host brings its whole tree of parts back, from the host's own record
    const sysT = Sx.cleanSystem({ v: 1, name: 'T', rolls: [], fields: [{ id: 'f_c', key: 'Cyber', label: 'Cyber', kind: 'item-list', edit: 'owner', vis: 'all', list: { parts: { from: 'f_c', deep: true } } }],
        items: [{ id: 'i_ch', name: 'Chassis' }, { id: 'i_ar', name: 'Arm' }, { id: 'i_hn', name: 'Hand' }] }, { F: Fx, gmView: true });
    const mkT = () => { const camp = { id: 'k', system: sysT, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_c: [{ id: 'w_c', defId: 'i_ch', qty: 1 }, { id: 'w_a', defId: 'i_ar', qty: 1, in: 'w_c' }, { id: 'w_h', defId: 'i_hn', qty: 2, in: 'w_a' }, { id: 'w_o', defId: 'i_ar', qty: 1 }] } } } }, out = { answer: [], owner: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        let n = 0; const send = m => { out.answer.length = 0; Hh.handle(Object.assign({ type: 'char-item', rid: 't' + (++n), charId: 'c_1', fieldId: 'f_c' }, m), { peer: 'pA', send: box(out.answer) }); return J(out.answer.map(a => a.type + (a.reason ? ':' + a.reason : ''))); };
        return { camp, out, send, vals: () => J(camp.chars.c_1.values) }; };
    const t1 = mkT(), t1a = t1.vals(), t1r = t1.send({ op: 'remove', rowId: 'w_c' }), t1b = J(t1.camp.chars.c_1.values.f_c.map(r => r.id)), t1u = t1.send({ op: 'restore', rowId: 'w_c', parts: { f: 'f_c', rows: [{ row: { id: 'w_z', defId: 'i_hn', qty: 9, in: 'w_c' }, at: 0 }] } }), t1c = t1.vals();
    const t2 = mkT(), t2r = t2.send({ op: 'add', defId: 'i_ch', rowId: 'w_n', in: 'w_h' }), t2v = J(t2.camp.chars.c_1.values.f_c.map(r => r.id + ':' + (r.in || '')));
    check('205 (4) parts of parts over the wire (char-item, run for real): a player\'s removal of a host takes its whole tree, a part\'s part too, and its Undo brings the tree back from the host\'s own record, never the message\'s, the list as it stood, stored and sent; a player\'s add of a part to a part is taken where the list says Parts hold parts',
        t1r === J(['char-ack']) && t1b === J(['w_o']) && t1u === J(['char-ack']) && t1c === t1a && t1.out.saves === 2 && t2r === J(['char-ack']) && t2v === J(['w_c:', 'w_a:w_c', 'w_h:w_a', 'w_o:', 'w_n:w_h']), J([t1r, t1b, t1u, t1c === t1a, t2r, t2v]));
    // 205 (5) (the core handbook session's parts brief, 2026-10-29): a cap per kind of part, judged by the host for a player's add
    const sysK = Sx.cleanSystem({ v: 1, name: 'K', rolls: [], fields: [{ id: 'f_b', key: 'Bodies', label: 'Bodies', kind: 'item-list', edit: 'owner', vis: 'all', list: { stats: [{ key: 'Heads', label: 'Heads' }, { key: 'Arms', label: 'Arms' }], parts: { from: 'f_l', caps: [{ cats: ['Head'], by: 'Heads' }, { cats: ['Arm'], by: 'Arms' }] } } }, { id: 'f_l', key: 'Limbs', label: 'Limbs', kind: 'item-list', edit: 'owner', vis: 'all' }],
        items: [{ id: 'i_ch', name: 'Chassis', category: 'Body', stats: { Heads: 1, Arms: 2 } }, { id: 'i_hd', name: 'Head', category: 'Head' }, { id: 'i_ar', name: 'Arm', category: 'Arm' }] }, { F: Fx, gmView: true });
    const runK = msg => { const camp = { id: 'k', system: sysK, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_b: [{ id: 'w_c', defId: 'i_ch', qty: 1 }], f_l: [{ id: 'w_h', defId: 'i_hd', qty: 1, in: 'w_c' }] } } } }, out = { answer: [], owner: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        Hh.handle(Object.assign({ type: 'char-item', rid: 'k1', charId: 'c_1', fieldId: 'f_l' }, msg), { peer: 'pA', send: box(out.answer) });
        out.rows = J(camp.chars.c_1.values.f_l.map(r => r.id + ':' + r.qty + ':' + (r.in || ''))); return out; };
    const kHead = runK({ op: 'add', defId: 'i_hd', rowId: 'w_h2', in: 'w_c' }), kArm = runK({ op: 'add', defId: 'i_ar', rowId: 'w_a', in: 'w_c', qty: 2 }), kMore = runK({ op: 'setQty', rowId: 'w_h', qty: 2 });
    check('205 (5) a player\'s add of a part past its host\'s cap for that kind (char-item, run for real): answered char-deny with the reason value and words that name the host and the kind, nothing stored, sent or saved; a raised count the same; a kind with room is added, stored, sent and saved',
        J(kHead.answer) === J([{ type: 'char-deny', rid: 'k1', reason: 'value', msg: 'Chassis holds 1 Head part at most, and has 1 already.' }]) && kHead.rows === J(['w_h:1:w_c']) && kHead.owner.length === 0 && kHead.saves === 0
        && J(kMore.answer) === J(kHead.answer) && kMore.rows === kHead.rows && kMore.owner.length === 0 && kMore.saves === 0
        && J(kArm.answer) === J([{ type: 'char-ack', rid: 'k1' }]) && kArm.rows === J(['w_h:1:w_c', 'w_a:2:w_c']) && kArm.owner.length === 1 && kArm.saves === 1, J([kHead, kArm, kMore]));
    // 1.6.0 Fits where (the core handbook session's ask 18): a part where the host's list says it does not fit, judged by the host for a player's add, by their own view's formula
    const fitSys = (fit, says) => Sx.cleanSystem({ v: 1, name: 'Fi', rolls: [], fields: [{ id: 'f_s', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm', def: 9 }, { id: 'f_b', key: 'Slings', label: 'Slings', kind: 'item-list', edit: 'owner', vis: 'all', list: { stats: [{ key: 'Grip', label: 'Grip' }], parts: Object.assign({ from: 'f_l', fitIf: fit }, says ? { fitIfSays: says } : {}) } }, { id: 'f_l', key: 'Mods', label: 'Mods', kind: 'item-list', edit: 'owner', vis: 'all', list: { custom: true, stats: [{ key: 'Grip', label: 'Grip' }] } }],
        items: [{ id: 'i_sl', name: 'Sling', category: 'Gear', stats: { Grip: 2 } }, { id: 'i_lo', name: 'Small scope', category: 'Mod', stats: { Grip: 1 } }, { id: 'i_hi', name: 'Big scope', category: 'Mod', stats: { Grip: 3 } }] }, { F: Fx, gmView: true });
    const runFi = (sys, msg) => { const camp = { id: 'k', system: sys, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_b: [{ id: 'w_c', defId: 'i_sl', qty: 1 }], f_l: [{ id: 'w_s', defId: 'i_lo', qty: 1, in: 'w_c' }] } } } }, out = { answer: [], owner: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        Hh.handle(Object.assign({ type: 'char-item', rid: 'f1', charId: 'c_1', fieldId: 'f_l' }, msg), { peer: 'pA', send: box(out.answer) });
        out.rows = J(camp.chars.c_1.values.f_l.map(r => r.id + ':' + r.qty + ':' + (r.in || ''))); return out; };
    const sysFi = fitSys('Row.Grip <= Host.Grip', 'Too big for that grip.'), sysFw = fitSys('Row.Grip <= Host.Grip'), sysFg = fitSys('Row.Grip <= Host.Grip - Secret');
    const fBig = runFi(sysFi, { op: 'add', defId: 'i_hi', rowId: 'w_h', in: 'w_c' }), fWords = runFi(sysFw, { op: 'add', defId: 'i_hi', rowId: 'w_h', in: 'w_c' }), fOk = runFi(sysFi, { op: 'add', defId: 'i_lo', rowId: 'w_l', in: 'w_c' });
    const fOwn = runFi(sysFi, { op: 'custom', rowId: 'w_o', in: 'w_c', def: { name: 'Own scope', category: 'Mod', stats: { Grip: 4 } } }), fGm = runFi(sysFg, { op: 'add', defId: 'i_hi', rowId: 'w_h', in: 'w_c' });
    check('1.6.0 Fits where (the core handbook session\'s ask 18; char-item, run for real): a player\'s add of a part its host\'s list says does not fit, read with the part\'s own names and its host\'s, is answered char-deny with the reason value in the list\'s own words, else words naming the part, the host and the formula, nothing stored, sent or saved; one that fits is added, stored, sent and saved; a row of their own made as a part is judged alike; a formula that reads a GM-only value is not in their view, so it never holds them back on the host',
        J(fBig.answer) === J([{ type: 'char-deny', rid: 'f1', reason: 'value', msg: 'Too big for that grip.' }]) && fBig.rows === J(['w_s:1:w_c']) && fBig.owner.length === 0 && fBig.saves === 0
        && J(fWords.answer) === J([{ type: 'char-deny', rid: 'f1', reason: 'value', msg: 'Big scope does not fit Sling: it needs Row.Grip <= Host.Grip.' }]) && fWords.saves === 0
        && J(fOk.answer) === J([{ type: 'char-ack', rid: 'f1' }]) && fOk.rows === J(['w_s:2:w_c']) && fOk.owner.length === 1 && fOk.saves === 1
        && J(fOwn.answer) === J(fBig.answer) && fOwn.rows === fBig.rows && fOwn.saves === 0
        && J(fGm.answer) === J([{ type: 'char-ack', rid: 'f1' }]) && fGm.rows === J(['w_s:1:w_c', 'w_h:1:w_c']) && fGm.saves === 1
        && /S\.partFitEntry\(camp\.system, c, fieldId, q\.in, /.test(src), J([fBig, fWords, fOk, fOwn, fGm]));
    // 1.6.0 (v2, B4; a build session's sort, 2026-10-29): an entry grants rows of another list. A player's add on the host grants them, the
    // GM-only one too, and the owner's copy holds them; removing the granting row takes them, and its Undo brings them back from the host's record
    const sysG = Sx.cleanSystem({ v: 1, name: 'G', rolls: [], fields: [{ id: 'f_tr', key: 'Traits', label: 'Traits', kind: 'item-list', edit: 'owner', vis: 'all' }, { id: 'f_ge', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all' }],
        items: [{ id: 'i_wd', name: 'Warden', grants: [{ list: 'f_ge', entry: 'i_lm', qty: 2 }, { list: 'f_ge', entry: 'i_se' }] }, { id: 'i_lm', name: 'Lamp' }, { id: 'i_se', name: 'Sealed note', vis: 'gm' }] }, { F: Fx, gmView: true });
    const mkG = () => { const camp = { id: 'k', system: sysG, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_tr: [], f_ge: [{ id: 'w_b', defId: 'i_lm', qty: 1 }] } } } }, out = { answer: [], owner: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        let n = 0; const send = m => { out.answer.length = 0; Hh.handle(Object.assign({ type: 'char-item', rid: 'g' + (++n), charId: 'c_1', fieldId: 'f_tr' }, m), { peer: 'pA', send: box(out.answer) }); return J(out.answer.map(a => a.type + (a.reason ? ':' + a.reason : ''))); };
        return { camp, out, send, win }; };
    const g1 = mkG(), g1a = g1.send({ op: 'add', defId: 'i_wd', rowId: 'w_w' }), geA = g1.camp.chars.c_1.values.f_ge, keptA = J(g1.camp.chars.c_1.values);
    const grOk = g1a === J(['char-ack']) && J(g1.camp.chars.c_1.values.f_tr.map(r => r.id)) === J(['w_w']) && geA.length === 3 && geA[0].id === 'w_b' && !('gr' in geA[0])
        && J(geA.slice(1).map(r => [r.defId, r.qty, r.gr])) === J([['i_lm', 2, 'w_w'], ['i_se', 1, 'w_w']]) && geA.slice(1).every(r => /^w_[a-z0-9]{8}$/.test(r.id));
    const ownTxt = J(g1.out.owner), plSys = g1.win.wpSheets.playerSystem(g1.camp), plW = plSys.items.find(i => i.id === 'i_wd');
    const ownOk = (ownTxt.match(/"gr":"w_w"/g) || []).length >= 2 && ownTxt.indexOf('Sealed note') >= 0 && ownTxt.indexOf('i_se') < 0 && J(plW.grants) === J([{ list: 'f_ge', entry: 'i_lm', qty: 2 }]);
    const g1r = g1.send({ op: 'remove', rowId: 'w_w' }), geR = J(g1.camp.chars.c_1.values.f_ge.map(r => r.id)), g1u = g1.send({ op: 'restore', rowId: 'w_w', grants: { rows: [{ f: 'f_ge', row: { id: 'w_zz', defId: 'i_lm', qty: 9, gr: 'w_w' }, at: 0 }] } }), g1c = J(g1.camp.chars.c_1.values);
    check('1.6.0 (v2, B4) a player\'s add of an entry that grants rows (char-item, run for real): the host grants them in the same change, on another list, at their quantities and marked by the row that grants them, a GM-only entry too; the owner\'s copy holds them, the GM-only one by name and never its id, and the players\' view of the system names no grant of it; removing the granting row takes them, and its Undo brings each back as it stood, from the host\'s own record and never the message\'s',
        grOk && ownOk && g1r === J(['char-ack']) && geR === J(['w_b']) && g1u === J(['char-ack']) && g1c === keptA, J([g1a, geA, ownOk, plW, g1r, geR, g1u, g1c === keptA]));
    // 1.6.0 Subjects: a player's pick of the word their row holds, through the set op (char-item, run for real): stored as a place, told to the owner, and a place past the list or text refused
    const hostItem = (sys, values) => { const camp = { id: 'k', system: sys, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values } } }, out = { answer: [], owner: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        let n = 0; const send = m => { out.answer.length = 0; Hh.handle(Object.assign({ type: 'char-item', rid: 'j' + (++n), charId: 'c_1' }, m), { peer: 'pA', send: box(out.answer) }); return J(out.answer.map(a => a.type + (a.reason ? ':' + a.reason : ''))); };
        return { camp, out, send }; };
    const sysJ = Sx.cleanSystem({ v: 1, name: 'J', rolls: [], fields: [{ id: 'f_tr', key: 'Traits', label: 'Traits', kind: 'item-list', edit: 'owner', vis: 'all', list: { subject: ['Sun', 'Frost'] } }], items: [{ id: 'i_a', name: 'Pebble Hide' }] }, { F: Fx, gmView: true });
    const hJ = hostItem(sysJ, { f_tr: [{ id: 'w_a', defId: 'i_a', qty: 1 }] }), jRow = () => hJ.camp.chars.c_1.values.f_tr[0], jA = hJ.send({ fieldId: 'f_tr', op: 'set', rowId: 'w_a', facts: { sj: 2 } }), jSj = jRow().sj, jOwn = J(hJ.out.owner), jS0 = hJ.out.saves;
    const jB = hJ.send({ fieldId: 'f_tr', op: 'set', rowId: 'w_a', facts: { sj: 3 } }), jC = hJ.send({ fieldId: 'f_tr', op: 'set', rowId: 'w_a', facts: { sj: 'Sun' } }), jD = hJ.send({ fieldId: 'f_tr', op: 'set', rowId: 'w_a', facts: { sj: 0 } });
    check('1.6.0 Subjects: a player picks the word their row holds (char-item, run for real): stored by its place and told to its owner; a place the list does not have refused with nothing stored, text never read, and 0 takes it off',
        jA === J(['char-ack']) && jSj === 2 && /"sj":2/.test(jOwn) && jS0 === 1 && jB === J(['char-deny:value']) && jC === '[]' && jD === J(['char-ack']) && !('sj' in jRow()), J([jA, jSj, jB, jC, jD, jRow()]));
    // 1.6.0 (a builder audit, the core's rule: the higher, with no double): a player's add of an entry that grants one its list holds already
    const sysH = Sx.cleanSystem({ v: 1, name: 'H', rolls: [], fields: [{ id: 'f_ge', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all' }, { id: 'f_tr', key: 'Traits', label: 'Traits', kind: 'item-list', edit: 'owner', vis: 'all', list: { noQty: true, lvl: { min: 1, max: 6, def: 1 } } }],
        items: [{ id: 'i_amu', name: 'Amulet', grants: [{ list: 'f_tr', entry: 'i_acu', lvl: 4 }] }, { id: 'i_acu', name: 'Keen Ears' }] }, { F: Fx, gmView: true });
    const mkH = () => { const camp = { id: 'k', system: sysH, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_ge: [], f_tr: [{ id: 'w_own', defId: 'i_acu', qty: 1, lvl: 1 }] } } } }, out = { answer: [], owner: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        let n = 0; const send = (f, m) => { out.answer.length = 0; Hh.handle(Object.assign({ type: 'char-item', rid: 'h' + (++n), charId: 'c_1', fieldId: f }, m), { peer: 'pA', send: box(out.answer) }); return J(out.answer); };
        return { camp, out, send }; };
    const h1 = mkH(), h1a = h1.send('f_ge', { op: 'add', defId: 'i_amu', rowId: 'w_am' }), h1t = J(h1.camp.chars.c_1.values.f_tr), h1o = J(h1.out.owner);
    const h1r = h1.send('f_ge', { op: 'remove', rowId: 'w_am' }), h1b = J(h1.camp.chars.c_1.values.f_tr);
    const h2 = mkH(); h2.send('f_ge', { op: 'add', defId: 'i_amu', rowId: 'w_am' }); const h2r = h2.send('f_tr', { op: 'remove', rowId: 'w_own' }), h2t = h2.camp.chars.c_1.values.f_tr.map(r => [r.defId, r.lvl, r.gr || '']);
    check('1.6.0 (a builder audit) a player\'s add of an entry that grants a trait they hold (char-item, run for real): the host raises their row to the grant\'s level, marks it backed and answers in its words, "Keen Ears raised to 4 by Amulet."; the owner\'s copy says it is backed and never the level it stood at; the granting row removed puts it back at its own level; the held row removed lets the grant give a row of its own',
        h1a === J([{ type: 'char-ack', rid: 'h1', msg: 'Keen Ears raised to 4 by Amulet.' }]) && h1t === J([{ id: 'w_own', defId: 'i_acu', qty: 1, lvl: 4, gb: 'w_am', gl: 1 }]) && h1o.indexOf('"gb":"w_am"') >= 0 && h1o.indexOf('"gl"') < 0 && h1.out.saves >= 1
        && h1r === J([{ type: 'char-ack', rid: 'h2' }]) && h1b === J([{ id: 'w_own', defId: 'i_acu', qty: 1, lvl: 1 }]) && J(h2.out.answer.map(a => a.type)) === J(['char-ack']) && J(h2t) === J([['i_acu', 4, 'w_am']]), J([h1a, h1t, h1o, h1r, h1b, h2r, h2t]));
})());

// [m410] SITE_EQUIVALENT_PLAN fold 2 on the wire, each behavior by a case of its own (the tests that go with the mutations of m410): (B) a player's own
// app lays a switch-on as the host stores it, and a change still waiting over a newer host copy alike (the real net.charItem and reapplyPending beside
// the host's real char-item branch and delta, with the real core); (A) the host judges a system roll's needs with the round of the fight on the map
// the player is on, as their own sheet reads it
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js')), J = JSON.stringify;
    const rawB = { v: 1, name: 'B', rolls: [], fields: [{ id: 'f_ar', key: 'Armor', label: 'Armor', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Worn', per: 'Loc' }, stats: [{ key: 'Loc', kind: 'pick', opts: [{ label: 'Torso', name: 'HP' }, { label: 'Arm', name: 'HP' }] }] } }],
        items: [{ id: 'i_ma', name: 'Mail', stats: { Loc: 'Torso' } }, { id: 'i_br', name: 'Bracer', stats: { Loc: 'Arm' } }, { id: 'i_he', name: 'Helm', stats: { Loc: 'Torso' }, eq: 'curse', eqMsg: 'It clings' }] };
    const sysB = Sx.cleanSystem(rawB, { F: Fx, gmView: true }), view = Sx.cleanSystem(sysB, { F: Fx, gmView: false });
    const hostRows = () => [{ id: 'w_x', defId: 'i_ma', qty: 1, on: true }, { id: 'w_m', defId: 'i_ma', qty: 1, on: false }, { id: 'w_b', defId: 'i_br', qty: 1, on: true }, { id: 'w_h', defId: 'i_he', qty: 1, on: true }];
    const hostChar = rows => ({ id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_ar: rows } }), onOf = rows => (rows || []).map(r => r.id + ':' + (r.on === true)).join(' ');
    const SET = { op: 'set', rowId: 'w_m', facts: { on: true } };
    // a player's own app: their copy as the host makes it for them
    const cA = src.indexOf('net.charItem = function('), cZ = src.indexOf('\n};\n', cA) + 3, sentC = [];
    const campC = { id: 'k', system: view, chars: { c_1: JSON.parse(J(Sx.charFor(hostChar(hostRows()), view, 'u_a', { full: sysB }))) } };
    const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sentC.push(JSON.parse(J(m))); } }] };
    new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netC, () => Sx, () => campC, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
    const rC = netC.charItem('c_1', 'f_ar', SET), mine = onOf(campC.chars.c_1.values.f_ar);
    // the host, the very message the player's app sent
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const campH = { id: 'k', system: sysB, chars: { c_1: hostChar(hostRows()) } }, ans = [], owner = [], box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
    const netH = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(owner) }], roster: { pA: { id: 'u_a' } } };
    const winH = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
        netH, () => Sx, winH, () => false, () => campH, () => {}, e => { throw e; }, c => (netH.roster[c.peer] ? netH.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {})(sentC[0], { peer: 'pA', send: box(ans) });
    const told = owner.length ? onOf((owner[0].values || {}).f_ar) : '', stored = campH.chars.c_1.values.f_ar.map(r => r.id + ':' + r.on + (r.keptOn ? 'k' : '')).join(' ');
    // a change still waiting, laid over a newer copy from the host in which the GM put another Mail on (reapplyPending, run for real)
    const rA = src.indexOf('function reapplyPending(charId) {'), rZ = src.indexOf('\n}\n', rA) + 3, rpSrc = src.slice(rA, rZ);
    const newer = hostRows().concat([{ id: 'w_n', defId: 'i_ma', qty: 1, on: true }]), campR = { id: 'k', system: view, chars: { c_1: JSON.parse(J(Sx.charFor(hostChar(newer), view, 'u_a', { full: sysB }))) } };
    new Function('getActiveCampaign', 'SC', '_charHost', '_charPending', 'window', 'net', rpSrc + '\nreturn reapplyPending;')(() => campR, () => Sx, { c_1: { f_ar: JSON.parse(J(campR.chars.c_1.values.f_ar)) } }, { e1: { charId: 'c_1', fieldId: 'f_ar', kind: 'item', q: JSON.parse(J(SET)) } }, { wpFormula: Fx }, { libEntry: () => null })('c_1');
    const laid = onOf(campR.chars.c_1.values.f_ar);
    check('m410 (B) a player\'s own app lays a switch-on on a One at a time list as the host stores it (the real net.charItem, the host\'s real char-item branch and delta, reapplyPending, with the real core): at once on their copy, the other Mail on the Torso off, the cursed Helm off as they see it and the Bracer on the Arm left on; only the op is sent; the host stores the Helm kept on and tells them what their app already shows; a change still waiting is laid over a newer copy in which the GM put another Mail on, which goes off too',
        rC.ok === true && mine === 'w_x:false w_m:true w_b:true w_h:false' && J(sentC.map(m => [m.type, m.op, m.rowId, m.facts])) === J([['char-item', 'set', 'w_m', { on: true }]])
        && J(ans) === J([{ type: 'char-ack', rid: sentC[0].rid, msg: 'It clings' }]) && stored === 'w_x:false w_m:true w_b:true w_h:truek' && told === mine
        && laid === 'w_x:false w_m:true w_b:true w_h:false w_n:false', J([rC, mine, sentC, ans, stored, told, laid]));
    // (A) the host judges a player's system roll with the round of the fight on their map (roll-req, run for real)
    const line = k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); };
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(line).join('\n') + '\n';
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'));
    const sysR = Sx.cleanSystem({ v: 1, name: 'R', fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 10 }], rolls: [{ id: 'r_rally', label: 'Rally', formula: '3d6 <= 10', needs: 'CombatRound >= 2', needsText: 'Not before round 2' }] }, { F: Fx, gmView: true });
    const runRd = round => { const out = { table: [], sent: [] };
        const camp = { id: 'k', activeItemId: 'm1', system: sysR, chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} } }, items: { m1: { type: 'map', whiteboard: [{ id: 't1', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 0, width: 50, height: 50 }] } } };
        const net = { role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: round ? { m1: { mapId: 'm1', round: round, turn: 0, rows: [{ tokId: 't1' }] } } : {}, syncCharDelta() {} };   // fold 2: a fight names its map
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(J(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            { type: 'roll-req', rid: 'q1', charId: 'c_a', act: 'r_rally', expr: '3d6 <= 10' }, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { out.table.push(rec.expr); }, () => {}, () => {}, () => {});
        return [out.table.length, out.sent.filter(m => m.type === 'roll-deny').map(m => m.message)]; };
    const rd = [runRd(0), runRd(1), runRd(2)];
    check('m410 (A) the host judges a player\'s system roll by the round of the fight on the map they are on (roll-req, run for real): with no fight and in round 1 it is refused in its own words, in round 2 it is rolled',
        J(rd) === J([[0, ['Not before round 2']], [0, ['Not before round 2']], [1, []]]), J(rd));
})());

// From netcheck.js's closing block ("Finishing the test split", step 6), where it ran after every pending check (it leans on none of them):
    {   // 1.5.7: a damage roll's type rides on its card, worked out where the roll is made: the GM's own roll and a player's on the host, each from the roll's entry through systemcore dmgTypeOf, never from the roller's word
        const dIdx = src.indexOf('if ((entR && entR.dmg === true) || o.dmg === true) rec.dmg = 1;'), qIdx = src.indexOf('if (actQ && actQ.dmg === true) recQ.dmg = 1;');
        const dLine = src.slice(dIdx, src.indexOf('\n', src.indexOf('\n', dIdx) + 1)), qLine = src.slice(qIdx, src.indexOf('\n', src.indexOf('\n', qIdx) + 1));
        check('1.5.7 a damage card names its damage type: on the GM\'s own roll (net.diceRoll) and on a player\'s (the roll-req branch, on the host) the type is worked out from the roll\'s entry by systemcore dmgTypeOf with the row\'s own names, only for a damage roll, and nothing of the request names it',
            dIdx > 0 && qIdx > 0 && /rec\.dmg === 1 && entR && SR && typeof SR\.dmgTypeOf === 'function'[^\n]*SR\.dmgTypeOf\(campR\.system, entR, varsR, F\); if \(dtR\) rec\.dtype = dtR;/.test(dLine)
            && /recQ\.dmg === 1 && [^\n]*SQ\.dmgTypeOf\(campQ\.system, actQ, varsQ, Fq\); if \(dtQ\) recQ\.dtype = dtQ;/.test(qLine) && !/dtype/.test(src.slice(src.indexOf('net.diceRoll = function'), src.indexOf('var campR = getActiveCampaign(), SR = SC()'))));
    }
    {   // 1.5.8 (book handoff 90 Part B): what changed the values a roll reads rides on its card, worked out where the roll is made, from the names the roll read and the resolver it was made with (systemcore rollMods), never from the roller's word
        const flat = src.split('\r\n').join('\n');
        check('1.5.8 a roll\'s card carries what changed the values it read: on the GM\'s own roll and on a player\'s on the host, after the names are recorded, through systemcore rollMods with the very resolver the roll was made with; nothing else writes it',
            /if \(nmR\.length\) rec\.names = nmR; \}\n    if \(rec\.names && SR && typeof SR\.rollMods === 'function' && typeof varsR === 'function'\) \{ var mdR = SR\.rollMods\(varsR, rec\.names\); if \(mdR\) rec\.mods = mdR; \}/.test(flat)
            && /if \(nmQ\.length\) recQ\.names = nmQ; \}\n\s*if \(recQ\.names && typeof SQ !== 'undefined' && SQ && typeof SQ\.rollMods === 'function' && typeof varsQ === 'function'\) \{ var mdQ = SQ\.rollMods\(varsQ, recQ\.names\); if \(mdQ\) recQ\.mods = mdQ; \}/.test(flat)
            && (flat.match(/\.mods = md[RQ];/g) || []).length === 2);
    }
    check('1.6.0 On.<name> on the host (source): a player\'s press and a player\'s roll read the one it is used on through THEIR view of the system (no GM-only field of the other reaches a formula of theirs), the GM\'s own roll through the system; each in that token\'s own context',
        src.includes("varsA = Sa.withOnSelf(varsA, !onA, onA ? Sa.makeResolver(viewA, onA.ch, Fa,") && src.includes("varsQ = SQ.withOnSelf(varsQ, !onQ, onQ && viewQ ? SQ.makeResolver(viewQ, onQ.ch, Fq,") && src.includes("varsR = SR.withOnSelf(varsR, !onR, onR ? SR.makeResolver(campR.system, onR.ch, F,"));
    {   // 1.6.2 (the owner, by prompt: "Yes, build it"): a roll that draws a card as its die (net.js drawForRoll, run for real with the real deck core)
        const NL6 = String.fromCharCode(10), dk6 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'deckcore.js'), 'utf8').split(String.fromCharCode(13)).join('').split(NL6).filter(l => !/^(import|export) /.test(l)).join(NL6), K6 = new Function('cleanTexSrc', 'window', dk6 + NL6 + 'return API;')(() => '', {});
        const a6 = src.indexOf('// [netcheck:drawfirst-start]'), b6 = src.indexOf('// [netcheck:drawfirst-end]'); let saved6 = 0, told6 = 0;
        const own6 = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
        const mk6 = () => new Function('window', 'own', 'saveRemoteSoon', 'net', src.slice(a6, b6) + '\nreturn drawForRoll;')({ wpDeckCore: K6.default || K6, wpFormula: null }, own6, () => { saved6++; }, { decksTell: () => { told6++; } });
        const deck6 = { key: 'D1', label: 'Fate', after: 'discard', stats: [{ key: 'Value', label: 'Value' }], cards: [{ name: 'Ace', vals: { Value: 14 } }, { name: 'Two', vals: { Value: 2 } }] };
        const camp6 = { system: { decks: [deck6] } }, dr = mk6();
        const d1 = dr(camp6, 'D1'), lastName = camp6.piles && camp6.piles.D1 ? deck6.cards[camp6.piles.D1.last].name : '';
        const kept = JSON.stringify(camp6.piles.D1); d1.undo(); const undone = !camp6.piles || !own6(camp6.piles, 'D1');
        const d2 = dr(camp6, 'D1'), n2 = d2.done();
        const gmDeck = { system: { decks: [Object.assign({}, deck6, { vis: 'gm' })] } }, d3 = dr(gmDeck, 'D1'), n3 = d3.done();
        const empty = dr({ system: { decks: [Object.assign({}, deck6, { after: 'gone' })] }, piles: { D1: { draw: [], disc: [], out: [0, 1], last: 1 } } }, 'D1'), gone = dr(camp6, 'D9');
        check('1.6.2 a roll that draws a card as its die: the host draws one card before the roll is worked out, so the pile\'s last is that card; undo puts the pile back as it was; done keeps it, saves, tells the table and names the card, none for a deck the GM alone knows; a deck that is gone and one with nothing left refuse in words',
            !!d1.name && d1.name === lastName && kept.length > 0 && undone && deck6.cards.some(c => c.name === n2) && saved6 === 2 && told6 === 2 && n3 === '' && /Nothing is left to draw from Fate/.test(empty.error || '') && /not here/.test(gone.error || ''), JSON.stringify([d1.name, lastName, n2, n3, empty, gone, saved6, told6]));
        const deck7 = { key: 'D1', label: 'Bag', after: 'discard', stats: [{ key: 'Value', label: 'Value' }], cards: [{ name: 'Ruby', vals: { Value: 3 } }, { name: 'Jet', vals: { Value: 7 } }, { name: 'Opal', vals: { Value: 5 } }] }, camp7 = { system: { decks: [deck7] } }, d7 = dr(camp7, 'D1', 3), n7 = d7.done();
        const camp8 = { system: { decks: [deck7] } }, d8 = dr(camp8, 'D1', 40);
        check('1.6.2 a roll that draws several at once: the host draws as many as it says, keeps them all as the last draw, and the roll\'s card names each; a count past 20 draws one', n7.split(', ').sort().join() === 'Jet,Opal,Ruby' && camp7.piles.D1.got.length === 3 && camp8.piles.D1.got.length === 1 && d8.name.indexOf(',') < 0, JSON.stringify([n7, camp7.piles.D1, camp8.piles.D1]));
        const flat6 = src;
        check('1.6.2 both paths draw first and put the card back on any refusal: a player\'s roll through denyQ, the GM\'s own through each early return; the card stays only once nothing refused it, and the roll\'s card names it',
            flat6.includes("var cardQ = null, denyQ = function(reason, r) { if (cardQ && cardQ.undo) { cardQ.undo(); cardQ = null; }") && flat6.includes("cardQ = actQ && typeof actQ.drawFirst === 'string' && typeof drawForRoll === 'function' ? drawForRoll(campQ, actQ.drawFirst, actQ.drawN) : null;")
            && flat6.includes("var cardNQ = cardQ && cardQ.done ? cardQ.done() : ''; cardQ = null;") && flat6.includes('if (cardNQ) recQ.card = cardNQ;') && flat6.includes("var cardR = entR && typeof entR.drawFirst === 'string' && typeof drawForRoll === 'function' ? drawForRoll(campR, entR.drawFirst, entR.drawN) : null;")
            && flat6.includes("var cardNR = cardR && cardR.done ? cardR.done() : '';") && flat6.includes('if (cardNR) rec.card = cardNR;') && flat6.split('return cardR && cardR.undo && cardR.undo(), {').length === 7, '');
    }

// 1.6.3 (the improvement week's review of sheets and rolls, finding 6): a defense or reminder card pressed whose roll never happened is live again
{
    const dlSrc = fnSrc('function dueLive(att) {', '\nnet.diceRoll = function', 'dueLive');
    const mkLog = () => [{ due: { att: 'a_aaaaaaaa' }, done: true }, { due: { att: 'a_aaaaaaaa' }, done: true, over: 1 }, { due: { att: 'a_bbbbbbbb' }, done: true }, { roll: { id: 'r' } }];
    let log = mkLog(), drawn = 0;
    const DL = new Function('chatLog', 'renderChatSoon', dlSrc + '\nreturn dueLive;')(log, () => { drawn++; });
    const r1 = DL('a_aaaaaaaa'), state1 = log.map(m => [!!m.done, !!m.over]), r2 = DL('a_aaaaaaaa'), r3 = DL(''), r4 = DL(7);
    const shS = fs.readFileSync(path.join(kit.APP, 'scripts', 'sheets.js'), 'utf8'), diS = fs.readFileSync(path.join(kit.APP, 'scripts', 'dice.js'), 'utf8');
    check('1.6.3 (finding 6): a card of an attempt pressed and not over is live again (dueLive: its buttons drawn again, once; a card that is over or of another attempt stays as it is), on a player\'s app at the host\'s roll-deny and at the request\'s own timeout, the pending request keeping the card\'s attempt; on any machine runDue and runLand answer what the roll they made answered (dice.js lastRoll for a sheet button pressed for the card), so a roll refused there leaves the card live',
        r1 === true && j(state1) === j([[false, false], [true, true], [true, false], [false, false]]) && drawn === 1 && r2 === false && r3 === false && r4 === false
        && src.includes("if (pend.att && typeof dueLive === 'function') dueLive(pend.att);") && src.includes("if (attP && typeof dueLive === 'function') dueLive(attP); }, D.LIMITS.timeoutMs), att: attP };")
        && shS.includes('return !(rV && rV.error);') && shS.includes('return !(rW && rW.error);') && shS.includes('return !(rL && rL.error);') && shS.includes('var gotD = lrD ? lrD() : null; return !(gotD && gotD.n !== n0D && gotD.r && gotD.r.error);')
        && diS.includes('_rollSeq++; _rollLast = r;') && diS.includes('lastRoll: lastRoll,'), j([r1, state1, drawn]));
}

T.finish();
