/* Offline check of the dice feature's pure half (system/app/scripts/dicecore.js) against the real formula engine
   (system/app/scripts/formula.js): the validators a host and a client apply to roll messages, the replay contract,
   the command parser, the crit rule, the text lines and the rate limiter.
   Usage: node tools/dicecheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path');
const NL = String.fromCharCode(10);
const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }
function scripted(list) { let i = 0; return () => { if (i >= list.length) throw new Error('scripted queue empty'); return list[i++]; }; }

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    let D = null, F = null, err = null;
    try { D = await import(url('dicecore.js')); F = await import(url('formula.js')); } catch (e) { err = e; }
    check('modules load in Node with no window', !!D && !!F && !err, err && err.message);
    if (!D || !F) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { LIMITS, cleanExpr, composeModifier, withAdvantage, cleanRollReq, cleanRoll, cleanDeny, cleanRid, cleanNames, foldNames, replay, checkTableRoll, denyText, parseCommand, verdictOf, critOf, cardText, RateLimit, uid } = D;
    const V = F.VERSION;
    const roll = (expr, draws) => F.evaluate(expr, { random: scripted(draws) });
    const rec = (o) => Object.assign({ id: 'r_abc123', from: { id: 'u_pat', name: 'Pat', gm: false }, expr: '2d6 + 3', draws: [4, 5], v: V, ts: 1000 }, o);

    /* ---- expressions ---- */
    check('cleanExpr trims, caps at 300, refuses empty and control characters', cleanExpr('  d20 ') === 'd20' && cleanExpr('x'.repeat(301)) === null && cleanExpr('') === null && cleanExpr('d20' + String.fromCharCode(0)) === null && cleanExpr(5) === null && cleanExpr('x'.repeat(300)) !== null);

    /* ---- Stage 5a: composeModifier (the situational-modifier dialog folds a flat bonus into a roll) ---- */
    const co = (e, m) => composeModifier(e, m, F.parse);
    const didPass = (expr, draws) => { const v = verdictOf(F.evaluate(expr, { random: scripted(draws) })); return v && v.kind === 'check' ? v.pass : null; };
    check('composeModifier: a value roll gets a parenthesised additive term; 0 is a no-op; negative subtracts', co('d20 + STRmod', 2).expr === '(d20 + STRmod) + 2' && co('2d6', 0).expr === '2d6' && co('2d6', -1).expr === '(2d6) - 1');
    check('composeModifier: a roll-OVER check lifts the roll side, and a positive mod turns a miss into a hit', (() => { const r = co('d20 >= 15', 2); return r.ok && r.expr === '(d20) + 2 >= 15' && didPass('d20 >= 15', [14]) === false && didPass(r.expr, [14]) === true; })());
    check('composeModifier: a roll-UNDER check raises the target, and a positive mod turns a miss into a hit', (() => { const r = co('3d6 <= 10', 2); return r.ok && r.expr === '3d6 <= (10) + 2' && didPass('3d6 <= 10', [5, 5, 1]) === false && didPass(r.expr, [5, 5, 1]) === true; })());
    check('composeModifier: bad mod, no parser, and a formula that would not parse are all refused', co('d20', 1.5).ok === false && co('d20', 'x').ok === false && composeModifier('d20', 2, null).ok === false && co('2d', 2).ok === false && co('', 2).ok === false);
    check('composeModifier: the composed expression always re-parses cleanly', (() => { return ['d20 + 5', 'd20 >= 12', '4d6kh3 <= Skill', '2d6 + 3'].every(e => { const r = co(e, 3); return r.ok && F.parse(r.expr).ok; }); })());
    const adv = (e, m) => withAdvantage(e, m, F.parse);
    check('withAdvantage: a lone plain die becomes keep-highest (adv) or keep-lowest (dis), the rest of the formula intact', adv('d20 + STR', 'adv').expr === '2d20kh1 + STR' && adv('d20', 'dis').expr === '2d20kl1' && adv('1d20 + 5', 'adv').expr === '2d20kh1 + 5');
    check('withAdvantage: refused unless it is exactly one plain, un-kept, numeric die', adv('d20 + d4', 'adv').ok === false && adv('2d6', 'adv').ok === false && adv('d20kh1', 'adv').ok === false && adv('dF', 'adv').ok === false && adv('(Level)d6', 'adv').ok === false && adv('d20', 'nope').ok === false && withAdvantage('d20', 'adv', null).ok === false);
    check('withAdvantage: adv keeps the higher of the two draws, dis the lower', (() => { const a = F.evaluate(adv('d20', 'adv').expr, { random: scripted([3, 18]) }); const b = F.evaluate(adv('d20', 'dis').expr, { random: scripted([3, 18]) }); return a.ok && a.value === 18 && b.ok && b.value === 3; })());
    check('withAdvantage: composes with a flat modifier (advantage first, then the bonus)', (() => { const base = adv('d20 + STR', 'adv'); const both = co(base.expr, 2); return base.ok && both.ok && both.expr === '(2d20kh1 + STR) + 2' && F.parse(both.expr).ok; })());

    /* ---- requests ---- */
    check('cleanRollReq: rid + expr, optional priv gm only', JSON.stringify(cleanRollReq({ rid: 'q1', expr: ' 4d6kh3 ' })) === '{"rid":"q1","expr":"4d6kh3"}' && cleanRollReq({ rid: 'q1', expr: 'd20', priv: 'gm' }).priv === 'gm' && cleanRollReq({ rid: 'q1', expr: 'd20', priv: 'all' }) === null && cleanRollReq({ expr: 'd20' }) === null && cleanRollReq({ rid: 'bad id', expr: 'd20' }) === null && cleanRollReq(null) === null);

    /* ---- records ---- */
    const r1 = cleanRoll(rec({}));
    check('cleanRoll keeps id, from, expr, draws, v, ts', r1 && r1.id === 'r_abc123' && r1.from.name === 'Pat' && r1.from.gm === false && r1.expr === '2d6 + 3' && r1.draws.join() === '4,5' && r1.v === V && r1.ts === 1000 && r1.priv === undefined && r1.to === undefined, JSON.stringify(r1));
    check('cleanRoll: bad id, missing from, bad draws, missing v, bad priv, bad to all refused', cleanRoll(rec({ id: 'x' })) === null && cleanRoll(rec({ from: null })) === null && cleanRoll(rec({ draws: [4, 0] })) === null && cleanRoll(rec({ draws: [4, 1.5] })) === null && cleanRoll(rec({ draws: 'x' })) === null && cleanRoll(rec({ v: undefined })) === null && cleanRoll(rec({ priv: 'all' })) === null && cleanRoll(rec({ to: 'bad peer!' })) === null);
    check('cleanRoll: 1000 draws pass, 1001 refused; from fields capped; gm only when true', cleanRoll(rec({ draws: new Array(1000).fill(1) })) !== null && cleanRoll(rec({ draws: new Array(1001).fill(1) })) === null && cleanRoll(rec({ from: { id: 'i'.repeat(100), name: 'n'.repeat(100), gm: 'yes' } })).from.name.length === 60 && cleanRoll(rec({ from: { id: 'x', name: '', gm: 1 } })).from.gm === false && cleanRoll(rec({ from: { id: 'x', name: '' } })).from.name === 'Player');
    check('cleanRoll: priv, to, rid carried when valid', (() => { const r = cleanRoll(rec({ priv: 'gm', to: 'peer_1', rid: 'q9' })); return r.priv === 'gm' && r.to === 'peer_1' && r.rid === 'q9'; })());
    check('cleanRoll: expr with HTML survives as text (rendering is the renderer\'s job)', cleanRoll(rec({ expr: '<b>d20</b>' })).expr === '<b>d20</b>');

    /* ---- refusals ---- */
    check('cleanDeny: reason validated, message capped, pos/len clamped to the expr', (() => { const d = cleanDeny({ rid: 'q1', reason: 'error', message: 'Bad', pos: 1e9, len: 5 }, 10); const e = cleanDeny({ rid: 'q1', reason: 'nope' }, 10); const f = cleanDeny({ rid: 'q1', reason: 'slow', message: 'm'.repeat(1000) }, 0); return d.pos === 10 && d.len === 0 && d.message === 'Bad' && e === null && f.message.length === 300 && f.pos === 0 && cleanDeny({ rid: 'q1', reason: 'error', pos: 2, len: 100 }, 10).len === 8; })());
    check('denyText: a message only for error; canned text otherwise', denyText('error', 'Unknown name "STR"') === 'Unknown name "STR"' && denyText('slow', 'ignored') === denyText('slow') && denyText('off').indexOf('VTT features') > 0);

    /* ---- replay ---- */
    check('replay: the same formula and draws give the same total everywhere', (() => { const r = replay(rec({}), F, V); return r.ok && r.result.value === 12 && r.result.draws.join() === '4,5'; })());
    check('replay: mismatched draws (too few, too many, out of range) fail', !replay(rec({ draws: [4] }), F, V).ok && !replay(rec({ draws: [4, 5, 6] }), F, V).ok && !replay(rec({ draws: [4, 7] }), F, V).ok);
    check('replay: a formula that does not parse fails; a different engine version is reported as such', replay(rec({ expr: '2d' }), F, V).reason === 'error' && replay(rec({ v: V + 1 }), F, V).reason === 'version');
    check('replay: reroll and explode chains replay from their draws', (() => { const a = roll('2d6!r1', [1, 6, 2, 4]); const r = replay(rec({ expr: '2d6!r1', draws: a.draws }), F, V); return a.ok && r.ok && r.result.value === a.value && r.result.breakdown.text === a.breakdown.text; })());
    check('replay: the facing names a host recorded (Arc.front true, Threats.rear 1) replay as recorded', (() => { const nm = cleanNames([{ name: 'Arc.front', value: true }, { name: 'Threats.rear', value: 1 }]); const r = replay(rec({ expr: '2d6 + if(Arc.front, 1, 0) + Threats.rear', names: nm }), F, V); return nm && nm.length === 2 && r.ok && r.result.value === 11; })());
    check('replay: fudge and percentile', (() => { const a = roll('4dF + d%', [1, 3, 2, 2, 57]); const r = replay(rec({ expr: '4dF + d%', draws: a.draws }), F, V); return a.ok && r.ok && r.result.value === a.value; })());

    /* ---- caps ---- */
    check('checkTableRoll: 200 dice pass, 201 refused; draws over 1000 refused even with few dice', checkTableRoll(F.evaluate('200d6')) === null && checkTableRoll(F.evaluate('201d6')) === 'many' && (() => { const r = F.evaluate('20d2rr=1', { random: (function() { let i = 0; return f => (i++ % 60 === 59 ? 2 : 1); })() }); return !r.ok || r.draws.length > 1000 ? checkTableRoll(r) === 'many' : true; })());
    check('checkTableRoll: an error result is error', checkTableRoll(F.evaluate('2d')) === 'error');

    /* ---- commands ---- */
    check('parseCommand: /roll /r public, /gmroll /gr private, bare = d20, case-insensitive', JSON.stringify(parseCommand('/roll 2d6+3')) === '{"cmd":"roll","expr":"2d6+3"}' && parseCommand('/R d20').expr === 'd20' && parseCommand('/gmroll 3d6').cmd === 'gmroll' && parseCommand('/gr').expr === 'd20' && parseCommand('/roll').expr === 'd20' && parseCommand('  /roll   4d6kh3  ').expr === '4d6kh3');
    check('parseCommand: not a command -> null', parseCommand('hello /roll') === null && parseCommand('/rolls d20') === null && parseCommand('/roll(2d6)') === null && parseCommand('/table d20') === null && parseCommand(5) === null);

    /* ---- verdicts and crits ---- */
    check('verdictOf: a value, a check with margin, an equality check', (() => { const a = verdictOf(roll('2d6 + 3', [4, 5])); const b = verdictOf(roll('d20 + 5 >= 16', [14])); const c = verdictOf(roll('d20 + 5 >= 16', [3])); const d = verdictOf(roll('d6 = 3', [3])); return a.kind === 'value' && a.text === '12' && b.kind === 'check' && b.pass && b.text === 'success by 3' && !c.pass && c.text === 'failure by 8' && d.pass && d.text === 'success'; })());
    check('critOf: lone d20 natural 20 / 1; nothing for 2d20kh1, d20r1 rerolled, d20 + d6, d6', critOf(roll('d20 + 5', [20])) === 'crit' && critOf(roll('d20', [1])) === 'fumble' && critOf(roll('d20', [11])) === null && critOf(roll('2d20kh1', [20, 3])) === null && critOf(roll('d20r1', [1, 20])) === null && critOf(roll('d20 + d6', [20, 3])) === null && critOf(roll('d6', [1])) === null && critOf(roll('d20cs>=20', [20])) === null);
    check('critOf: a d20 with a reroll suffix that did not fire is still a lone d20', critOf(roll('d20r1', [20])) === 'crit');

    /* ---- text ---- */
    check('cardText: public, private, to the GM, to a player, unreadable', (() => { const res = roll('2d6 + 3', [4, 5]); const a = cardText(rec({}), res, F); const b = cardText(rec({ from: { id: 'g', name: 'Sam', gm: true }, priv: 'gm' }), res, F); const c = cardText(rec({ priv: 'gm' }), res, F); const d = cardText(rec({ to: 'peer_1' }), res, F, { toName: 'Pat' }); const e = cardText(rec({}), null, F); return a === 'Pat rolled 2d6 [4, 5] + 3 = 12' && b === 'GM (private) rolled 2d6 [4, 5] + 3 = 12' && c === 'Pat (to the GM) rolled 2d6 [4, 5] + 3 = 12' && d === 'Pat (to Pat) rolled 2d6 [4, 5] + 3 = 12' && e === 'Pat rolled a roll that could not be read'; })());
    check('cardText: the describe cap shortens a big roll', (() => { const res = F.evaluate('100d6', { random: () => 3 }); return cardText(rec({ expr: '100d6', draws: res.draws }), res, F, { maxChars: 60 }).length <= 80; })());

    /* ---- names: rolls from a character sheet (1.5.0) ---- */
    check('cleanRid: a well-formed rid comes back, anything else null', cleanRid({ rid: 'q_1-a' }) === 'q_1-a' && cleanRid({ rid: '' }) === null && cleanRid({}) === null && cleanRid(null) === null && cleanRid({ rid: 'x'.repeat(25) }) === null);
    check('F5b cleanRollReq: a row ({ f: field id, r: row id }) rides only with a character; a malformed one, or one without a character, refuses the message', (() => {
        const ok = cleanRollReq({ rid: 'q1', expr: 'd20 + Row.Hit', charId: 'c_ab12', row: { f: 'f_wp', r: 'w_b1', x: 1 } });
        return JSON.stringify(ok.row) === JSON.stringify({ f: 'f_wp', r: 'w_b1' }) && cleanRollReq({ rid: 'q1', expr: 'd20', row: { f: 'f_wp', r: 'w_b1' } }) === null
            && cleanRollReq({ rid: 'q1', expr: 'd20', charId: 'c_ab12', row: { f: 'f wp', r: 'w_b1' } }) === null && cleanRollReq({ rid: 'q1', expr: 'd20', charId: 'c_ab12', row: { f: 'f_wp', r: 'x_b1' } }) === null
            && cleanRollReq({ rid: 'q1', expr: 'd20', charId: 'c_ab12', row: 'f_wp' }) === null && cleanRollReq({ rid: 'q1', expr: 'd20', charId: 'c_ab12', row: [] }) === null && cleanRollReq({ rid: 'q1', expr: 'd20', charId: 'c_ab12' }).row === undefined;
    })());
    check('cleanRollReq: charId and label ride along, bad ones refuse', (() => { const a = cleanRollReq({ rid: 'q1', expr: 'd20 + STR', charId: 'c_ab12', label: ' Attack ' }); const b = cleanRollReq({ rid: 'q1', expr: 'd20', charId: 'u_nope' }); const c = cleanRollReq({ rid: 'q1', expr: 'd20', label: 'x'.repeat(61) }); const d = cleanRollReq({ rid: 'q1', expr: 'd20', label: 'a' + String.fromCharCode(7) }); return a && a.charId === 'c_ab12' && a.label === 'Attack' && b === null && c === null && d === null; })());
    check('cleanNames: a computed value past +/-1e15 is refused (a whole number past 64 bits would stop every roll send and every latecomer\'s chat history); 1e15 and fractions pass', cleanNames([{ name: 'XPNeed', value: 1.15e21 }]) === null && cleanNames([{ name: 'X', value: -1e16 }]) === null && Array.isArray(cleanNames([{ name: 'X', value: 1e15 }])) && Array.isArray(cleanNames([{ name: 'Y', value: 0.25 }])));
    check('cleanNames: shape, caps, duplicates with different values refused', (() => { const ok = cleanNames([{ name: 'STR', value: 14 }, { name: 'Skill.Stealth', value: 3 }, { name: 'str', value: 14 }, { name: 'Prone', value: true }]); const dup = cleanNames([{ name: 'STR', value: 14 }, { name: 'str', value: 15 }]); const bad = cleanNames([{ name: '2d6', value: 1 }]); const bad2 = cleanNames([{ name: 'STR', value: 'x' }]); const many = cleanNames(Array.from({ length: 201 }, (_, i) => ({ name: 'n' + i, value: i }))); const none = cleanNames([]); return ok && ok.length === 3 && dup === null && bad === null && bad2 === null && many === null && none && none.length === 0 && cleanNames('x') === null; })());
    check('cleanRoll: names, label and as are kept when clean, a bad names list refuses the record', (() => { const a = cleanRoll(rec({ expr: 'd20 + STR', draws: [7], names: [{ name: 'STR', value: 14 }], label: 'Attack', as: 'Pat' })); const b = cleanRoll(rec({ names: [{ name: 'STR', value: 'no' }] })); const c = cleanRoll(rec({ label: 'x'.repeat(61) })); return a && a.names.length === 1 && a.label === 'Attack' && a.as === 'Pat' && b === null && c === null; })());
    check('foldNames: lower-cased flat keys', (() => { const o = foldNames([{ name: 'Skill.Stealth', value: 3 }, { name: 'STR', value: 14 }]); return o['skill.stealth'] === 3 && o.str === 14 && Object.keys(o).length === 2; })());
    check('replay with names: the record resolves its names with the values it carried, none without', (() => { const r = cleanRoll(rec({ expr: 'd20 + Skill.Stealth', draws: [11], names: [{ name: 'Skill.Stealth', value: 3 }] })); const p = replay(r, F, V); const q = replay(cleanRoll(rec({ expr: 'd20 + STR', draws: [11] })), F, V); return p.ok && p.result.value === 14 && !q.ok; })());
    check('cardText: the label and the character', (() => { const res = roll('2d6 + 3', [4, 5]); const a = cardText(rec({ label: 'Attack', as: 'Orc' }), res, F); const b = cardText(rec({ as: 'Pat' }), res, F); return /^Pat as Orc rolled Attack: /.test(a) && /^Pat rolled /.test(b); })());
    check('denyText: names and char point at the roller', /character/i.test(denyText('names')) && /character/i.test(denyText('char')));

    /* ---- rate limit ---- */
    check('RateLimit: per-peer spacing, burst, table cap, forget', (() => { const L = RateLimit({ perMs: 400, burst: 3, windowMs: 10000, table: 5 }); const a = L.allow('p1', 0), b = L.allow('p1', 100), c = L.allow('p1', 500), d = L.allow('p1', 1000), e = L.allow('p1', 1500); const f = L.allow('p2', 2000), g = L.allow('p3', 2500), h = L.allow('p4', 3000); const i = L.allow('p1', 11000); L.forget('p1'); const j = L.allow('p1', 11001); return a === true && b === 'slow' && c === true && d === true && e === 'slow' && f === true && g === true && h === 'table' && i === true && j === true; })());

    check('uid shape', /^r_[a-z0-9]{1,16}$/.test(uid()));

    /* ---- Stage 6 HUD H7: an apply action's card (the host's record) and its one-line text ---- */
    {
        const J = JSON.stringify, good = { type: 'apply', id: 'r_abc123', from: { id: 'u_a', name: 'Ana P', gm: false }, as: 'Ana', label: 'Apply costs', lines: [{ n: 'Fatigue', d: -3, v: 0 }, { n: 'EP', d: 2, v: 5.5 }], ts: 5 };
        const c = D.cleanApply(good), w = o => Object.assign({}, good, o);
        check('H7 cleanApply keeps a well-formed card as text and numbers only (id, from, lines {n, d, v}, ts, label, as, priv gm) and nothing else',
            J(c) === J({ id: 'r_abc123', from: { id: 'u_a', name: 'Ana P', gm: false }, lines: [{ n: 'Fatigue', d: -3, v: 0 }, { n: 'EP', d: 2, v: 5.5 }], ts: 5, label: 'Apply costs', as: 'Ana' })
            && !('evil' in D.cleanApply(w({ evil: '<b>' }))) && D.cleanApply(w({ priv: 'gm' })).priv === 'gm' && J(D.cleanApply(w({ lines: [{ n: 'HP', d: -1, v: 2, x: '<i>' }] })).lines) === J([{ n: 'HP', d: -1, v: 2 }]), J(c));
        const ctl = String.fromCharCode(7), bad = [w({ id: 'x' }), w({ from: null }), w({ lines: [] }), w({ lines: 'HP' }), w({ lines: [1, 2, 3, 4, 5].map(i => ({ n: 'A' + i, d: -1, v: 1 })) }),
            w({ lines: [{ n: '', d: -1, v: 1 }] }), w({ lines: [{ n: 'H' + ctl, d: -1, v: 1 }] }), w({ lines: [{ n: 'x'.repeat(61), d: -1, v: 1 }] }), w({ lines: [{ n: 'HP', d: NaN, v: 1 }] }),
            w({ lines: [{ n: 'HP', d: -1e16, v: 1 }] }), w({ lines: [{ n: 'HP', d: -1, v: '2' }] }), w({ lines: [null] }), w({ priv: 'x' }), w({ label: 'x'.repeat(61) }), w({ as: 'A' + ctl })];
        check('H7 cleanApply refuses a malformed card whole (id, from, 1 to 4 lines, a label of 60 with no control character, finite numbers within 1e15, priv gm only)', bad.every(b => D.cleanApply(b) === null), J(bad.map(b => D.cleanApply(b) !== null)));
        check('H7 applyText: who, as whom, the action and each change ("Fatigue −3 → 0, EP +2 → 5.5"); a private card says so, the GM reads as GM',
            D.applyText(c) === 'Ana P as Ana applied Apply costs: Fatigue −3 → 0, EP +2 → 5.5'
            && D.applyText(Object.assign({}, c, { priv: 'gm', from: { id: 'g', name: 'Alex', gm: true } })) === 'GM (private) as Ana applied Apply costs: Fatigue −3 → 0, EP +2 → 5.5'
            && D.applyText(Object.assign({}, c, { label: undefined })).indexOf(' applied an action: ') > 0, D.applyText(c));
    }

    /* ---- Stage 6 HUD R1: a roll with consequences names its entry; its modifier and advantage travel as data ---- */
    {
        const J = JSON.stringify, base = { type: 'roll-req', rid: 'q1', expr: '3d6 <= 12', charId: 'c_a' }, q = o => cleanRollReq(Object.assign({}, base, o));
        check('R1 cleanRollReq: act (a roll id) with a whole modifier of -99 to 99 (0: none) and adv or dis, only as a character and never with a row; a modifier or advantage without act, or out of shape, refuses the request whole',
            J(q({ act: 'r_atk', mod: 2, adv: 'adv' })) === J({ rid: 'q1', expr: '3d6 <= 12', charId: 'c_a', act: 'r_atk', mod: 2, adv: 'adv' }) && J(q({ act: 'r_atk', mod: 0 })) === J({ rid: 'q1', expr: '3d6 <= 12', charId: 'c_a', act: 'r_atk' })
            && [{ act: 'r_atk', mod: 100 }, { act: 'r_atk', mod: 1.5 }, { act: 'r_atk', mod: '2' }, { act: 'r_atk', adv: 'x' }, { act: 'x' }, { act: 'r_atk', row: { f: 'f_w', r: 'w_1' } }, { mod: 2 }, { adv: 'adv' }].every(o => q(o) === null)
            && cleanRollReq({ type: 'roll-req', rid: 'q1', expr: 'd6', act: 'r_atk' }) === null);
    }

    /* ---- Stage 6 HUD R2b: a list roll with consequences or needs names its index (0-3); its modifier and advantage then travel as data ---- */
    {
        const J = JSON.stringify, q = o => cleanRollReq(Object.assign({ type: 'roll-req', rid: 'q1', expr: '3d6 <= 30', charId: 'c_a' }, o));
        check('R2b cleanRollReq: row.i from 0 to 3 (with a modifier and advantage beside it); an index out of range or a modifier on a plain row roll refuses the request whole',
            J(q({ row: { f: 'f_w', r: 'w_1', i: 3 }, mod: -2, adv: 'dis' })) === J({ rid: 'q1', expr: '3d6 <= 30', charId: 'c_a', row: { f: 'f_w', r: 'w_1', i: 3 }, mod: -2, adv: 'dis' })
            && [{ row: { f: 'f_w', r: 'w_1', i: 4 } }, { row: { f: 'f_w', r: 'w_1', i: -1 } }, { row: { f: 'f_w', r: 'w_1', i: 1.5 } }, { row: { f: 'f_w', r: 'w_1' }, mod: 2 }, { row: { f: 'f_w', r: 'w_1' }, adv: 'adv' }].every(o => q(o) === null));
    }

    /* ---- Stage 6 HUD R3: a record's malfunction threshold; the natural total; the card's words ---- */
    {
        const J = JSON.stringify, rec0 = { id: 'r_m1', from: { id: 'u', name: 'Pat', gm: false }, expr: '3d6 <= 30', draws: [6, 6, 5], v: V, ts: 1 };
        const cr = cleanRoll(Object.assign({}, rec0, { malf: 17 })), resM = roll('3d6 <= 30', [6, 6, 5]), resOk = roll('d20 + 5', [3]);
        check('R3 cleanRoll keeps a whole Malf from 1 to 1e6 and refuses another; naturalOf is the dice alone (3d6: 17; d20 + 5: 3); malfOf holds at or past the Malf; the card text says "malfunction (Malf 17)"',
            cr.malf === 17 && [0, 1.5, '17', 2e6].every(m => cleanRoll(Object.assign({}, rec0, { malf: m })) === null) && D.naturalOf(resM) === 17 && D.naturalOf(resOk) === 3
            && D.malfOf(cr, resM) === true && D.malfOf(Object.assign({}, cr, { malf: 18 }), resM) === false && D.malfOf(rec0, resM) === false && / \u2014 malfunction \(Malf 17\)$/.test(cardText(cr, resM, F)), J(cr));
    }

    /* ---- Turn-based combat T2b: a reminder card ---- */
    {
        const J = JSON.stringify, due0 = { type: 'due', id: 'r_d1', from: { id: 'u_gm', name: 'GM', gm: true }, charId: 'c_a', act: 'r_re', label: 'Reaction back', as: 'Ana', why: 'turn', round: 2, ts: 5, extra: 'x' };
        const cd = D.cleanDue(due0);
        check('T2b cleanDue keeps ids and text only (a char and a roll id, turn or round, a whole round 1..9999, a label and a name, theirs as 1) and refuses anything malformed; dueText says what is due, for whom and when',
            J(cd) === J({ id: 'r_d1', from: { id: 'u_gm', name: 'GM', gm: true }, charId: 'c_a', act: 'r_re', why: 'turn', round: 2, ts: 5, label: 'Reaction back', as: 'Ana' })
            && [{ charId: 'x' }, { act: 'f_hp' }, { why: 'now' }, { round: 0 }, { round: 1.5 }, { round: 10000 }, { label: 'a' + String.fromCharCode(7) }, { theirs: true }, { id: 'bad id' }, { from: null }].every(p => D.cleanDue(Object.assign({}, due0, p)) === null)
            && D.cleanDue(Object.assign({}, due0, { theirs: 1 })).theirs === 1 && D.dueText(cd) === 'Reaction back for Ana is due (the start of its turn)' && D.dueText(Object.assign({}, cd, { why: 'round', round: 3 })) === 'Reaction back for Ana is due (round 3)', J(cd));
    }

    /* ---- publication ---- */
    global.window = {};
    const D2 = await import(url('dicecore.js') + '?x');
    check('window.wpDiceCore published, with every export the module has (the app reads it there: net.js cardLookNow)', !!(global.window.wpDiceCore && global.window.wpDiceCore.cleanRoll && global.window.wpDiceCore.VERSION === D2.VERSION) && Object.keys(D2).every(k => typeof global.window.wpDiceCore[k] === typeof D2[k]), Object.keys(D2).filter(k => !(k in (global.window.wpDiceCore || {}))).join(', '));
    /* ---- Stage 6 F8: 3d6 roll-under criticals (a system's combat.checks 'under3d6') ---- */
    {
        const threeOf = t => { const a = Math.min(6, t - 2), r = t - a, b = Math.min(6, r - 1); return [a, b, r - b]; };   // three faces summing to t (3..18)
        const want = (t, T) => (t <= 4 || (t === 5 && T >= 15) || (t === 6 && T >= 16)) ? { pass: true, crit: 'crit' } : (t === 18 || (t === 17 && T <= 15) || t - T >= 10) ? { pass: false, crit: 'fumble' } : { pass: t !== 17 && t <= T, crit: '' };
        const bad = [];
        for (let t = 3; t <= 18; t++) for (let T = 3; T <= 20; T++) {
            const res = roll('3d6 <= ' + T, threeOf(t)), v = verdictOf(res, 'under3d6'), c = critOf(res, 'under3d6'), w = want(t, T);
            if (!v || v.pass !== w.pass || (v.crit || '') !== w.crit || (c || '') !== w.crit) bad.push(t + ' vs ' + T + ': ' + JSON.stringify([v, c]));
        }
        check('F8 3d6 roll-under, every total 3-18 against every target 3-20: 3-4 a critical success, 5 at 15+, 6 at 16+; 17 a failure (critical at 15 or less); 18 or failing by 10+ a critical failure; otherwise the total against the target', !bad.length, bad.slice(0, 6));
        const v17 = verdictOf(roll('3d6 <= 18', [6, 6, 5]), 'under3d6'), vPlain = verdictOf(roll('3d6 <= 18', [6, 6, 5])), v10 = verdictOf(roll('3d6 <= 12', [3, 3, 4]), 'under3d6');
        check('F8 the verdict reads the rule (17 against 18 a failure by nothing, 10 against 12 a success by 2); without it the arithmetic stands (17 <= 18 a success)',
            v17.pass === false && v17.text === 'failure' && vPlain.pass === true && v10.pass === true && v10.text === 'success by 2' && v10.crit === '', JSON.stringify([v17, vPlain, v10]));
        const other = ['3d6 + 1 <= 12', '4d6 <= 12', '3d6 >= 10', '2d6 <= 12', '3d6r1 <= 12'].map(e => { const r = F.evaluate(e, { random: scripted([1, 1, 1, 6, 6, 6]) }); return D.under3d6(r); });
        check('F8 the rule reads only a plain 3d6 on the left of "<=": something added, another count, a roll-over, a reroll that fired or another die read as ordinary checks', other.every(x => x === null) && critOf(roll('d20', [20]), 'under3d6') === 'crit', JSON.stringify(other));
        const c18 = cardText(rec({ expr: '3d6 <= 12', draws: [6, 6, 6] }), roll('3d6 <= 12', [6, 6, 6]), F, { rule: 'under3d6' }), c17 = cardText(rec({ expr: '3d6 <= 18', draws: [6, 6, 5] }), roll('3d6 <= 18', [6, 6, 5]), F, { rule: 'under3d6' });
        const c10 = cardText(rec({ expr: '3d6 <= 12', draws: [3, 3, 4] }), roll('3d6 <= 12', [3, 3, 4]), F, { rule: 'under3d6' }), c18p = cardText(rec({ expr: '3d6 <= 12', draws: [6, 6, 6] }), roll('3d6 <= 12', [6, 6, 6]), F, {});
        check('F8 the log line states the rule\'s verdict in place of the arithmetic\'s (18: critical failure by 6; 17 against 18: failure; 10 against 12: success by 2), and without the rule the arithmetic\'s',
            /= 18 <= 12: critical failure by 6$/.test(c18) && /<= 18: failure$/.test(c17) && /<= 12: success by 2$/.test(c10) && /<= 12: failure by 6$/.test(c18p), JSON.stringify([c18, c17, c10, c18p]));
        const rf = n => require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', n), 'utf8'), diceJs = rf('dice.js'), netJs = rf('net.js');
        check('F8 the card, the log and a roll\'s consequences all read the campaign\'s roll outcomes (the card: critical success / critical failure)',
            /var v = verdictOf\(res, rule\), crit = critOf\(res, rule\)/.test(diceJs) && /parts\[parts\.length - 1\]\.replace\(/.test(diceJs) && /'critical success' : 'critical failure'/.test(diceJs) && /vdQ = Dq\.verdictOf\(resQ, ruleQ\)/.test(netJs) && /vdR = D\.verdictOf\(res, ruleR\)/.test(netJs) && /rule: ruleQ \}/.test(netJs) && /rule: ruleR \}/.test(netJs));
    }
    /* ---- chat cards (owner 2026-09-27): a damage roll's mark on the record; the colours a card takes from a sheet look; the card itself ---- */
    {
        const j = JSON.stringify;
        const rc0 = rec({ label: 'Hit' }), cd1 = cleanRoll(Object.assign({}, rc0, { dmg: 1 })), cdBad = [2, true, '1', 0, null].map(x => cleanRoll(Object.assign({}, rc0, { dmg: x })));
        check('Chat cards: cleanRoll keeps a damage mark of exactly 1 and refuses the record for any other; a record with none has none', !!cd1 && cd1.dmg === 1 && cdBad.every(x => x === null) && !('dmg' in cleanRoll(rc0)), JSON.stringify([cd1, cdBad]));
        const pal0 = { text: '#add8e6', muted: '#8C8C8C', panel: '#1a1a1a', card: '#212121', field: '#262626', edge: '#333333', primary: '#ADD8E6', danger: '#cc3333', good: '#4ade80', warn: '#f59e0b' };
        const L1 = D.cardLook({ accent: '#AB94B3', palette: pal0 }), L2 = D.cardLook({ palette: Object.assign({}, pal0, { panel: '#f3ead6', primary: '#7a2e1f' }) }), L3 = D.cardLook({ accent: '#123abc' }), L4 = D.cardLook({ titles: 'accordion' });
        const L5 = D.cardLook({ palette: Object.assign({}, pal0, { good: 'red;background:url(x)' }) }), L6 = D.cardLook({ accent: 'var(--x)' }), L7 = D.cardLook(null), L8 = D.cardLook({ palette: Object.assign({}, pal0, { primary: '#abc' }), accent: '#010203' }), L9 = D.cardLook({ palette: [pal0] });
        check('Chat cards: cardLook takes a sheet look\'s colours — a whole palette\'s primary, good, danger (as bad), muted and the accent (else the primary), lower-cased, with its panel\'s tone; an accent alone gives the stripe and title; a look with no colour, or a colour that is not #rrggbb (a style, a var, three digits), gives none',
            JSON.stringify(L1) === JSON.stringify({ primary: '#add8e6', good: '#4ade80', bad: '#cc3333', muted: '#8c8c8c', accent: '#ab94b3', tone: 'dark' }) && L2.tone === 'light' && L2.accent === '#7a2e1f' && L2.primary === '#7a2e1f'
            && JSON.stringify(L3) === JSON.stringify({ primary: '#123abc', accent: '#123abc' }) && L4 === null && L5 === null && L6 === null && L7 === null && L9 === null && JSON.stringify(L8) === JSON.stringify({ primary: '#010203', accent: '#010203' }), JSON.stringify([L1, L2, L3, L5, L8]));
        const C1 = D.cleanCardLook(Object.assign(Object.create({ muted: '#000000' }), { primary: '#ABCDEF', good: 'url(x)', bad: '#123456', tone: 'dim', extra: '#111111' })), C2 = D.cleanCardLook({ good: '#123456' }), C3 = D.cleanCardLook('x'), C4 = D.cleanCardLook(L1), C5 = D.cleanCardLook([L1]);
        check('Chat cards: cleanCardLook (a chat pop-out takes the main window\'s colours) keeps each strict #rrggbb it knows, lower-cased, and a tone of dark or light; nothing without a primary; a look already clean is kept whole',
            JSON.stringify(C1) === JSON.stringify({ primary: '#abcdef', bad: '#123456' }) && C2 === null && C3 === null && C5 === null && JSON.stringify(C4) === JSON.stringify(L1), JSON.stringify([C1, C2, C4]));
        const dj = require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', 'dice.js'), 'utf8').replace(/\r\n/g, '\n');
        const rcSrc = dj.slice(dj.indexOf('function renderCard(m) {'), dj.indexOf('// Stage 6 HUD H7: an apply action'));
        const fe = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined ? '' : String(text), children: [], style: {}, title: '', appendChild(c) { this.children.push(c); return c; } });
        const rcard = new Function('el', 'playerHue', 'chatTime', 'net', 'F', 'verdictOf', 'critOf', 'malfOf', 'LIMITS', 'window', 'document', "'use strict';\n" + rcSrc + '\nreturn renderCard;')(fe, () => 0, () => '12:00', () => ({ active: false }), () => F, verdictOf, critOf, D.malfOf, LIMITS, { wpSheets: { systemOf: () => null } }, { createTextNode: t => ({ text: t }) });
        const card = (o, draws, noRes) => { const r = rec(o); return rcard({ roll: r, res: noRes ? null : roll(r.expr, draws) }); };
        const cls = c => c.className.split(' ').filter(Boolean), kid = (c, k) => c.children.find(x => x && x.className && x.className.split(' ').indexOf(k) >= 0) || null;
        const kOk = card({ expr: 'd20 + 5 >= 10', draws: [10], label: 'Attack' }, [10]), kNo = card({ expr: 'd20 + 5 >= 10', draws: [1], label: 'Attack' }, [1]);
        const kDm = card({ expr: '2d6', draws: [3, 4], label: 'Sword \u00b7 Damage', dmg: 1 }, [3, 4]), kMf = card({ expr: '3d6', draws: [1, 1, 1], label: 'Blaster', dmg: 1, malf: 3 }, [1, 1, 1]);
        const kPv = card({ expr: 'd20', draws: [7], priv: 'gm' }, [7]), kBad = card({ expr: 'd20', draws: [7], label: 'Lost' }, [7], true), kPl = card({ expr: 'd20', draws: [7] }, [7]);
        check('Chat cards: the card (dice.js renderCard, run for real) — the roll\'s name as its title (a row roll\'s "Sword · Damage" whole) and the formula alone below; the left stripe by outcome (a check\'s success or failure, a malfunction before a damage mark, else a damage roll, else plain); a damage roll\'s "damage" tag and larger total; a private card marked for its violet frame; no name, no title; an unreadable roll keeps its name and no outcome',
            j(cls(kOk)) === j(['chat-roll', 'card-ok']) && kid(kOk, 'roll-title').textContent === 'Attack' && kid(kOk, 'roll-expr').textContent === 'd20 + 5 >= 10' && !kid(kOk, 'chat-dmg')
            && j(cls(kNo)) === j(['chat-roll', 'card-fail']) && j(cls(kDm)) === j(['chat-roll', 'card-dmg']) && kid(kDm, 'roll-title').textContent === 'Sword \u00b7 Damage' && kid(kDm, 'chat-dmg').textContent === 'damage' && cls(kid(kDm, 'roll-total')).indexOf('roll-dmg') >= 0
            && j(cls(kMf)) === j(['chat-roll', 'card-malf']) && cls(kid(kMf, 'roll-total')).indexOf('roll-dmg') < 0 && !!kid(kMf, 'chat-dmg')
            && cls(kPv).indexOf('whisper') >= 0 && !kid(kPl, 'roll-title') && j(cls(kPl)) === j(['chat-roll']) && kid(kPl, 'roll-expr').textContent === 'd20'
            && j(cls(kBad)) === j(['chat-roll']) && kid(kBad, 'roll-title').textContent === 'Lost' && !!kid(kBad, 'roll-bad'), j([cls(kOk), cls(kNo), cls(kDm), cls(kMf), cls(kPv), cls(kBad)]));
        const kDC = card({ expr: '2d6 >= 7', draws: [6, 6], label: 'Blast', dmg: 1 }, [6, 6]), kPD = card({ expr: '2d6', draws: [3, 4], label: 'X', priv: 'gm', dmg: 1 }, [3, 4]), kBD = card({ expr: 'd20', draws: [7], label: 'Lost', dmg: 1 }, [7], true);
        check('Chat cards: a damage roll that is also a check takes the check\'s stripe and total, and keeps its damage tag; a private damage roll keeps its tag, its damage stripe and its violet frame; an unreadable damage roll keeps its damage stripe (the mark needs no dice)',
            j(cls(kDC)) === j(['chat-roll', 'card-ok']) && cls(kid(kDC, 'roll-total')).indexOf('roll-ok') >= 0 && cls(kid(kDC, 'roll-total')).indexOf('roll-dmg') < 0 && !!kid(kDC, 'chat-dmg')
            && cls(kPD).indexOf('whisper') >= 0 && cls(kPD).indexOf('card-dmg') >= 0 && !!kid(kPD, 'chat-dmg') && j(cls(kBD)) === j(['chat-roll', 'card-dmg']) && !!kid(kBD, 'roll-bad'), j([cls(kDC), cls(kPD), cls(kBD)]));
        const pG = p => D.cardLook({ palette: Object.assign({}, pal0, { panel: p }) }).tone;
        check('Chat cards: the tone reads the panel as the sheet does (dark ink reads on it: light) — mid greys either side of the line, a pure red, the channels weighted (orange light, its blue twin dark); a colour only anchored #rrggbb',
            pG('#606060') === 'dark' && pG('#797979') === 'dark' && pG('#7c7c7c') === 'light' && pG('#ff0000') === 'light' && pG('#ff6e00') === 'light' && pG('#006eff') === 'dark'
            && D.cardLook({ accent: '#123456;x' }) === null && D.cardLook({ accent: 'x#123456' }) === null && D.cleanCardLook({ primary: '#123456)' }) === null, j(['#606060', '#797979', '#7c7c7c', '#ff0000', '#ff6e00', '#006eff'].map(pG)));
        const rlSrc = dj.slice(dj.indexOf('function roll(expr, opts) {'), dj.indexOf('function rollFromPanel()')), seenR = [];
        const rollDj = new Function('net', 'cleanExpr', 'LIMITS', 'remember', "'use strict';\nvar lastSource = '';\n" + rlSrc + '\nreturn roll;')(() => ({ diceRoll: (e, o) => { seenR.push(JSON.parse(JSON.stringify(o))); return { ok: true }; } }), cleanExpr, LIMITS, () => {});
        rollDj('2d6', { dmg: true }); rollDj('2d6', { dmg: 1 }); rollDj('2d6', {});
        check('Chat cards: dice.js roll() (run for real) hands this machine\'s damage word to the dice path only as true (a thrown item\'s damage), never anything else',
            seenR.length === 3 && seenR[0].dmg === true && !('dmg' in seenR[1]) && !('dmg' in seenR[2]), j(seenR));
    }
    delete global.window;

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
