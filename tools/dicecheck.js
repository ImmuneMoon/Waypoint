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
    check('cleanExpr trims, caps at 1000 (300 before 1.6.0, backlog 200: a sheet formula\'s own cap), refuses empty and control characters', cleanExpr('  d20 ') === 'd20' && cleanExpr('x'.repeat(1001)) === null && cleanExpr('') === null && cleanExpr('d20' + String.fromCharCode(0)) === null && cleanExpr(5) === null && cleanExpr('x'.repeat(1000)) !== null);

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
    check('cleanRoll keeps the character a damage roll lands on only as a character id on a damage roll',
        cleanRoll(rec({ dmg: 1, dmgOn: 'c_abc' })).dmgOn === 'c_abc' && !('dmgOn' in cleanRoll(rec({ dmgOn: 'c_abc' }))) && !('dmgOn' in cleanRoll(rec({ dmg: 1, dmgOn: '<b>' }))) && !('dmgOn' in cleanRoll(rec({ dmg: 1, dmgOn: 7 }))));
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
        const ctl = String.fromCharCode(7), bad = [w({ id: 'x' }), w({ from: null }), w({ lines: [] }), w({ lines: 'HP' }), w({ lines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(i => ({ n: 'A' + i, d: -1, v: 1 })) }),
            w({ lines: [{ n: '', d: -1, v: 1 }] }), w({ lines: [{ n: 'H' + ctl, d: -1, v: 1 }] }), w({ lines: [{ n: 'x'.repeat(61), d: -1, v: 1 }] }), w({ lines: [{ n: 'HP', d: NaN, v: 1 }] }),
            w({ lines: [{ n: 'HP', d: -1e16, v: 1 }] }), w({ lines: [{ n: 'HP', d: -1, v: '2' }] }), w({ lines: [null] }), w({ priv: 'x' }), w({ label: 'x'.repeat(61) }), w({ as: 'A' + ctl })];
        { const mv = D.cleanApply(w({ lines: [{ n: 'Gear: Charge (2 rows)', s: 1, mv: 1 }] })), mvBad = D.cleanApply(w({ lines: [{ n: 'Gear', s: 1, mv: 1, v: 3 }] })), mvOdd = D.cleanApply(w({ lines: [{ n: 'Gear', s: 1, mv: 2 }] })), setL = D.cleanApply(w({ lines: [{ n: 'Gear', s: 1 }] }));
        check('1.6.0 the pre-Sunday review: an Add or Subtract on every row whose figure differs by row is carded as moved row by row (mv: 1 beside s: 1, no figure), a Set as set; mv only as 1 and never beside a figure',
            mv && J(mv.lines) === J([{ n: 'Gear: Charge (2 rows)', s: 1, mv: 1 }]) && D.applyChanges(mv) === 'Gear: Charge (2 rows) moved row by row' && mvBad === null && mvOdd === null && setL && D.applyChanges(setL) === 'Gear set', J([mv, mvBad, mvOdd, setL])); }
        check('H7 cleanApply refuses a malformed card whole (id, from, 1 to 12 lines (LIMITS.applyLines ' + LIMITS.applyLines + '; 8 before 1.6.0), a label of 60 with no control character, finite numbers within 1e15, priv gm only)', bad.every(b => D.cleanApply(b) === null) && LIMITS.applyLines === 12 && D.cleanApply(w({ lines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => ({ n: 'A' + i, d: -1, v: 1 })) })).lines.length === 12, J(bad.map(b => D.cleanApply(b) !== null)));
        check('H7 applyText: who, as whom, the action and each change ("Fatigue −3 → 0, EP +2 → 5.5"); a private card says so, the GM reads as GM',
            D.applyText(c) === 'Ana P as Ana applied Apply costs: Fatigue −3 → 0, EP +2 → 5.5'
            && D.applyText(Object.assign({}, c, { priv: 'gm', from: { id: 'g', name: 'Alex', gm: true } })) === 'GM (private) as Ana applied Apply costs: Fatigue −3 → 0, EP +2 → 5.5'
            && D.applyText(Object.assign({}, c, { label: undefined })).indexOf(' applied an action: ') > 0, D.applyText(c));
        // 1.5.9 (docs/BOOK_ES_ET_PLAN.md section 0): a line whose Rolled amount drew dice carries them as text
        const rl = l => D.cleanApply(w({ lines: [Object.assign({ n: 'Hit points', d: 4, v: 14 }, l)] })), ctlR = String.fromCharCode(7);
        check('1.5.9 cleanApply keeps a line\'s roll, the dice a Rolled amount drew, as text: control characters made spaces, trimmed and cut to 60; an empty one leaves no key; one that is no text refuses the card whole; a line with none is as before; applyText says the dice after the change',
            J(rl({ roll: '1d6: 4' }).lines) === J([{ n: 'Hit points', d: 4, v: 14, roll: '1d6: 4' }]) && rl({ roll: ' 1d6:' + ctlR + '4 ' }).lines[0].roll === '1d6: 4' && rl({ roll: 'x'.repeat(80) }).lines[0].roll === 'x'.repeat(60)
            && !('roll' in rl({ roll: '  ' }).lines[0]) && [5, null, {}, ['1d6']].every(v => rl({ roll: v }) === null) && J(rl({}).lines) === J([{ n: 'Hit points', d: 4, v: 14 }])
            && D.applyText(rl({ roll: '1d6: 4' })) === 'Ana P as Ana applied Apply costs: Hit points +4 → 14 (1d6: 4)' && D.applyText(c) === 'Ana P as Ana applied Apply costs: Fatigue −3 → 0, EP +2 → 5.5',
            J([rl({ roll: '1d6: 4' }), rl({ roll: ' 1d6:' + ctlR + '4 ' })]));
        {   // the apply card (dice.js renderApply, run for real on a page of plain objects): the dice as a text node of their own
            const djA = require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', 'dice.js'), 'utf8').replace(/\r\n/g, '\n');
            const raSrc = djA.slice(djA.indexOf('function renderApply(m) {'), djA.indexOf('// one line for toasts'));
            const feA = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined ? '' : String(text), children: [], style: {}, appendChild(x) { this.children.push(x); return x; } });
            const ra = new Function('el', 'net', 'playerHue', 'chatTime', 'fmtNum', 'document', "'use strict';\n" + raSrc + '\nreturn renderApply;')(feA, () => ({ active: false }), () => 0, () => '12:00', D.fmtNum, { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }) });
            const all = (n, acc) => { acc.push(n); (n.children || []).forEach(k => all(k, acc)); return acc; };
            const cR = ra({ apply: rl({ roll: '<b>1d6: 4</b>' }) }), cP = ra({ apply: c }), rollsR = all(cR, []).filter(n => n.className === 'apply-roll'), rollsP = all(cP, []).filter(n => n.className === 'apply-roll');
            check('1.5.9 the apply card (dice.js renderApply, run for real): a line\'s roll is drawn after its new value as one span of its own, apply-roll, holding the text as text and no element; a card with none draws none, as before',
                rollsR.length === 1 && rollsR[0].textContent === ' <b>1d6: 4</b>' && rollsR[0].children.length === 0 && rollsP.length === 0 && /if \(typeof l\.roll === 'string' && l\.roll\) s\.appendChild\(el\('span', 'apply-roll', ' ' \+ l\.roll\)\);/.test(raSrc),
                J(rollsR.map(n => n.textContent)));
        }
    }

    /* ---- Stage 6 HUD R1: a roll with consequences names its entry; its modifier and advantage travel as data ---- */
    {
        const J = JSON.stringify, base = { type: 'roll-req', rid: 'q1', expr: '3d6 <= 12', charId: 'c_a' }, q = o => cleanRollReq(Object.assign({}, base, o));
        check('R1 cleanRollReq: act (a roll id) with a whole modifier of -99 to 99 (0: none) and adv or dis, only as a character and never with a row; a modifier or advantage without act, or out of shape, refuses the request whole',
            J(q({ act: 'r_atk', mod: 2, adv: 'adv' })) === J({ rid: 'q1', expr: '3d6 <= 12', charId: 'c_a', act: 'r_atk', mod: 2, adv: 'adv' }) && J(q({ act: 'r_atk', mod: 0 })) === J({ rid: 'q1', expr: '3d6 <= 12', charId: 'c_a', act: 'r_atk' })
            && [{ act: 'r_atk', mod: 100 }, { act: 'r_atk', mod: 1.5 }, { act: 'r_atk', mod: '2' }, { act: 'r_atk', adv: 'x' }, { act: 'x' }, { act: 'r_atk', row: { f: 'f_w', r: 'w_1' } }, { mod: 2 }, { adv: 'adv' }].every(o => q(o) === null)
            && cleanRollReq({ type: 'roll-req', rid: 'q1', expr: 'd6', act: 'r_atk' }) === null);
    }

    /* ---- Stage 6 HUD R2b: a list roll with consequences or needs names its index (0 to LIMITS.rowRolls - 1, 0-7 since 1.5.4); its modifier and advantage then travel as data ---- */
    {
        const J = JSON.stringify, q = o => cleanRollReq(Object.assign({ type: 'roll-req', rid: 'q1', expr: '3d6 <= 30', charId: 'c_a' }, o));
        check('R2b cleanRollReq: row.i from 0 to 15, a list\'s sixteen rolls (eight since 1.5.4, ten since 1.6.0, sixteen since the raise the session that builds a game system asked for: moved on purpose; with a modifier and advantage beside it, the fifth to the sixteenth too); an index out of range (16 and past it, below 0, not whole) or a modifier on a plain row roll refuses the request whole',
            J(q({ row: { f: 'f_w', r: 'w_1', i: 3 }, mod: -2, adv: 'dis' })) === J({ rid: 'q1', expr: '3d6 <= 30', charId: 'c_a', row: { f: 'f_w', r: 'w_1', i: 3 }, mod: -2, adv: 'dis' })
            && [0, 4, 5, 6, 7, 8, 9, 10, 15].every(i => J(q({ row: { f: 'f_w', r: 'w_1', i: i }, mod: 1 })) === J({ rid: 'q1', expr: '3d6 <= 30', charId: 'c_a', row: { f: 'f_w', r: 'w_1', i: i }, mod: 1 }))
            && [{ row: { f: 'f_w', r: 'w_1', i: 16 } }, { row: { f: 'f_w', r: 'w_1', i: 17 } }, { row: { f: 'f_w', r: 'w_1', i: -1 } }, { row: { f: 'f_w', r: 'w_1', i: 1.5 } }, { row: { f: 'f_w', r: 'w_1' }, mod: 2 }, { row: { f: 'f_w', r: 'w_1' }, adv: 'adv' }].every(o => q(o) === null));
    }

    /* ---- the review of the fold of 409: dicecore's own figures for what a sheet sends are the character system's, so the editor's caps and the wire agree ---- */
    {
        let SC = null; try { SC = await import(url('systemcore.js')); } catch (e) { SC = null; }
        check('409 dicecore\'s caps are the character system\'s: a row roll\'s index under LIMITS.rowRolls (16 since the raise the session that builds a game system asked for, 10 before it: moved on purpose) and an apply card\'s lines under LIMITS.applyChanges (12 since 1.6.0, 8 before), each the same figure in systemcore.js',
            !!SC && LIMITS.rowRolls === 16 && LIMITS.rowRolls === SC.LIMITS.rowRolls && LIMITS.applyLines === SC.LIMITS.applyChanges, SC ? JSON.stringify([LIMITS.rowRolls, SC.LIMITS.rowRolls, LIMITS.applyLines, SC.LIMITS.applyChanges]) : 'no systemcore');
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
        {   // 1.6.0: an effect switched on or off is a line of its own, with no figure
            const ap = { id: 'r_ab12cd34', from: { id: 'u_a', name: 'Ana P', gm: false }, lines: [{ n: 'Calm', fx: 1 }, { n: 'Stunned', fx: 0 }, { n: 'HP', d: -2, v: 6 }], ts: 1 }, ca = D.cleanApply(ap);
            check('1.6.0 an apply card\'s line may say an effect switched on or off (fx 1 or 0, no figure beside it), its text says on or off; any other fx, or one beside a figure, refuses the card',
                !!ca && JSON.stringify(ca.lines) === JSON.stringify(ap.lines) && D.applyChanges(ca) === 'Calm on, Stunned off, HP \u22122 \u2192 6'
                && [{ n: 'A', fx: 2 }, { n: 'A', fx: true }, { n: 'A', fx: 1, d: 1 }, { n: 'A', fx: 0, v: 0 }, { n: 'A', fx: 1, s: 1 }].every(l => D.cleanApply(Object.assign({}, ap, { lines: [l] })) === null), JSON.stringify(ca));
        }
        const cd = D.cleanDue(due0);
        check('T2b cleanDue keeps ids and text only (a char and a roll id, turn or round, a whole round 1..9999, a label and a name, theirs as 1) and refuses anything malformed; dueText says what is due, for whom and when',
            J(cd) === J({ id: 'r_d1', from: { id: 'u_gm', name: 'GM', gm: true }, charId: 'c_a', act: 'r_re', why: 'turn', round: 2, ts: 5, label: 'Reaction back', as: 'Ana' })
            && [{ charId: 'x' }, { act: 'f_hp' }, { why: 'now' }, { round: 0 }, { round: 1.5 }, { round: 10000 }, { label: 'a' + String.fromCharCode(7) }, { theirs: true }, { id: 'bad id' }, { from: null }].every(p => D.cleanDue(Object.assign({}, due0, p)) === null)
            && D.cleanDue(Object.assign({}, due0, { why: 'turnEnd' })).why === 'turnEnd' && D.dueText(Object.assign({}, cd, { why: 'turnEnd' })).endsWith(' is due (the end of its turn)')   // 1.6.0: at its turn's end
            && D.cleanDue(Object.assign({}, due0, { theirs: 1 })).theirs === 1 && D.cleanDue(Object.assign({}, due0, { roll: 1 })).roll === 1 && D.cleanDue(Object.assign({}, due0, { why: 'cross' })).why === 'cross' && D.dueText(Object.assign({}, cd, { why: 'cross' })) === 'Reaction back for Ana is due (a value crossed a step)' && !('roll' in cd) && D.cleanDue(Object.assign({}, due0, { roll: true })) === null && D.dueText(Object.assign({}, cd, { label: undefined, roll: 1 })) === 'A roll for Ana is due (the start of its turn)' && D.dueText(cd) === 'Reaction back for Ana is due (the start of its turn)' && D.dueText(Object.assign({}, cd, { why: 'round', round: 3 })) === 'Reaction back for Ana is due (round 3)', J(cd));
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
        const mg = (e, d, r) => { const v = verdictOf(roll(e, d), r); return v ? v.margin : 'none'; };
        check('1.5.8 the verdict\'s margin (RollMargin): a roll-under check target - total (10 against 12 is 2, 15 against 12 is -3), a roll-over total - target (d20 + 5 >= 16 on 14 is 3, on 3 is -8); 17 against 18 a failure by 0, never above; an equality check and a value 0 or none',
            mg('3d6 <= 12', [3, 3, 4], 'under3d6') === 2 && mg('3d6 <= 12', [5, 5, 5], 'under3d6') === -3 && mg('3d6 <= 12', [3, 3, 4]) === 2 && mg('d20 + 5 >= 16', [14]) === 3 && mg('d20 + 5 >= 16', [3]) === -8
            && mg('3d6 <= 18', [6, 6, 5], 'under3d6') === 0 && mg('3d6 <= 18', [6, 6, 5]) === 1 && mg('d6 = 3', [3]) === 0 && mg('d20 > 10', [10]) === 0 && mg('2d6 + 3', [4, 5]) === undefined,
            JSON.stringify([mg('3d6 <= 12', [3, 3, 4], 'under3d6'), mg('3d6 <= 12', [5, 5, 5], 'under3d6'), mg('d20 + 5 >= 16', [14]), mg('d20 + 5 >= 16', [3]), mg('3d6 <= 18', [6, 6, 5], 'under3d6')]));
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
    /* ---- 1.6.0 (the v2 sort's B1): criticals at fixed rolls (a system's combat.checks 'fixed'; the record's crit, the host's two numbers) ---- */
    {
        const j = JSON.stringify, R = { at: 3, fumble: 18 }, vd = (e, d, r) => verdictOf(roll(e, d), r || R);
        const v3 = vd('3d6 <= 12', [1, 1, 1]), v18 = vd('3d6 <= 12', [6, 6, 6]), v18at18 = vd('3d6 <= 18', [6, 6, 6]), v3at2 = vd('3d6 <= 2', [1, 1, 1]), v17 = vd('3d6 <= 12', [6, 6, 5]), v4 = vd('3d6 <= 12', [1, 1, 2]);
        check('1.6.0 criticals at fixed rolls: a natural 3 is a critical success (by 9 against 12), 18 a critical failure; 18 against 18 fails critically though the arithmetic passed, 3 against 2 succeeds critically though it failed (by nothing, never a minus); nothing else is a critical (17 against 12 a plain failure by 5, 4 a plain success)',
            v3.pass === true && v3.crit === 'crit' && v3.text === 'success by 9' && v3.margin === 9 && v18.pass === false && v18.crit === 'fumble' && v18.margin === -6
            && v18at18.pass === false && v18at18.crit === 'fumble' && v18at18.text === 'failure' && v18at18.margin === 0 && v3at2.pass === true && v3at2.crit === 'crit' && v3at2.text === 'success' && v3at2.margin === 0
            && v17.pass === false && v17.crit === '' && v17.text === 'failure by 5' && v4.pass === true && v4.crit === '', j([v3, v18, v18at18, v3at2, v17, v4]));
        const w4 = vd('3d6 <= 12', [1, 1, 2], { at: 4, fumble: 18 }), w16 = vd('3d6 <= 12', [6, 5, 5], { at: 3, fumble: 16 }), bothP = vd('3d6 <= 12', [3, 3, 4], { at: 10, fumble: 10 }), bothF = vd('3d6 <= 8', [3, 3, 4], { at: 10, fumble: 10 });
        check('1.6.0 a widened range: 4 a critical success at Critical at 4, 16 a critical failure at Critical failure at 16; where both could apply the roll\'s own outcome decides (10 against 12 a critical success, against 8 a critical failure)',
            w4.crit === 'crit' && w16.crit === 'fumble' && w16.pass === false && bothP.crit === 'crit' && bothP.pass === true && bothF.crit === 'fumble' && bothF.pass === false, j([w4, w16, bothP, bothF]));
        const add = vd('3d6 + 2 <= 12', [1, 1, 1]), over = vd('d20 + 5 >= 15', [2]), over20 = vd('d20 + 5 >= 15', [20], { at: 1, fumble: 21 }), noChk = verdictOf(roll('3d6', [1, 1, 1]), R), poolR = roll('4d6cs>=5 >= 1', [6, 6, 1, 1]), pool = D.fixedCrit(poolR, R);
        check('1.6.0 the rule reads the dice alone of any check (3d6 + 2 on three 1s, d20 + 5 >= 15 on a 2), whatever the arithmetic; a d20\'s natural 20 is no critical under it; a roll with no check is a value, and a pool that counts successes reads as before',
            add.crit === 'crit' && over.crit === 'crit' && over.pass === true && over20.crit === '' && critOf(roll('d20 + 5 >= 15', [20]), { at: 1, fumble: 21 }) === null && critOf(roll('d20', [20]), R) === null
            && noChk.kind === 'value' && poolR.ok === true && pool === null && D.fixedCrit(roll('3d6 <= 12', [1, 1, 1]), 'under3d6') === null && D.fixedCrit(roll('3d6 <= 12', [1, 1, 1]), { at: 3 }) === null, j([add, over, over20, noChk, pool]));
        const k3 = D.checkOf(roll('3d6 <= 12', [1, 1, 1]), R), k18 = D.checkOf(roll('3d6 <= 18', [6, 6, 6]), R);
        check('1.6.0 checkOf (a throw\'s reading) under the rule: its pass, critical, total, target and margin',
            j(k3) === j({ pass: true, crit: 'crit', total: 3, target: 12, margin: 9 }) && j(k18) === j({ pass: false, crit: 'fumble', total: 18, target: 18, margin: 0 }), j([k3, k18]));
        const t3 = cardText(rec({ expr: '3d6 <= 12', draws: [1, 1, 1] }), roll('3d6 <= 12', [1, 1, 1]), F, { rule: R }), t18 = cardText(rec({ expr: '3d6 <= 18', draws: [6, 6, 6] }), roll('3d6 <= 18', [6, 6, 6]), F, { rule: R }), t9 = cardText(rec({ expr: '3d6 <= 12', draws: [3, 3, 3] }), roll('3d6 <= 12', [3, 3, 3]), F, { rule: R });
        check('1.6.0 the log line states the rule\'s verdict (3: critical success by 9; 18 against 18: critical failure; 9: success by 3)',
            /<= 12: critical success by 9$/.test(t3) && /<= 18: critical failure$/.test(t18) && /<= 12: success by 3$/.test(t9), j([t3, t18, t9]));
        const rcK = rec({ expr: '3d6 <= 12', draws: [1, 1, 1], crit: [4, 17] }), cK = cleanRoll(rcK), cBad = [[3], [3, 18, 1], [3.5, 18], ['3', 18], [3, 2000000], null, 'x'].map(x => cleanRoll(Object.assign({}, rcK, { crit: x }))), qK = cleanRollReq({ type: 'roll-req', rid: 'q1', expr: '3d6 <= 12', crit: [18, 3] });
        check('1.6.0 the record carries the host\'s two numbers (cleanRoll keeps a pair of whole numbers, refuses the record for anything else); a player\'s request names none (cleanRollReq keeps no crit)',
            !!cK && j(cK.crit) === j([4, 17]) && cBad.every(x => x === null) && !('crit' in cleanRoll(rec({}))) && !!qK && !('crit' in qK), j([cK, cBad, qK]));
        const bgK = cleanRoll(Object.assign({}, rcK, { big: true })), bgBad = [1, 'true', false, null, {}].map(x => cleanRoll(Object.assign({}, rcK, { big: x }))), qB = cleanRollReq({ type: 'roll-req', rid: 'q1', expr: '3d6 <= 12', big: true });
        check('1.6.0 a Big Hit (the book\'s ruling of 2026-10-29): the record keeps the host\'s mark only as true, and anything else is left off with the roll kept; a player\'s request names none',
            !!bgK && bgK.big === true && bgBad.every(x => !!x && !('big' in x)) && !('big' in cleanRoll(rcK)) && !!qB && !('big' in qB), j([bgK, bgBad, qB]));
        const ro = [D.ruleOf(rcK, ''), D.ruleOf(rcK, 'under3d6'), D.ruleOf(rec({}), 'under3d6'), D.ruleOf(rec({}), 'fixed'), D.ruleOf(rec({ crit: [3] }), ''), D.ruleOf(null, 'under3d6')];
        check('1.6.0 ruleOf: the record\'s own range first, else the system\'s 3d6 roll-under, else none (a record without its numbers reads no criticals)',
            j(ro) === j([{ at: 4, fumble: 17 }, { at: 4, fumble: 17 }, 'under3d6', '', '', 'under3d6']), j(ro));
        const djK = require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', 'dice.js'), 'utf8').replace(/\r\n/g, '\n');
        const rcSrcK = djK.slice(djK.indexOf('function renderCard(m) {'), djK.indexOf('// Stage 6 HUD H7: an apply action'));
        const feK = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined ? '' : String(text), children: [], style: {}, title: '', appendChild(c) { this.children.push(c); return c; } });
        const cardK = (sys, o, draws) => { const r = rec(o); return new Function('el', 'playerHue', 'chatTime', 'net', 'F', 'verdictOf', 'critOf', 'malfOf', 'LIMITS', 'ruleOf', 'window', 'document', "'use strict';\n" + rcSrcK + '\nreturn renderCard;')(feK, () => 0, () => '12:00', () => ({ active: false }), () => F, verdictOf, critOf, D.malfOf, LIMITS, D.ruleOf, { wpSheets: { systemOf: () => sys } }, { createTextNode: t => ({ text: t }) })({ roll: r, res: roll(r.expr, draws) }); };
        const walk = (n, out) => { out = out || []; if (n && typeof n === 'object') { out.push(n); (n.children || []).forEach(c => walk(c, out)); } return out; }, tagged = (w, cls) => walk(w).filter(x => x.className === cls).map(x => x.textContent);
        const sysT = { combat: { checks: 'fixed', tier: { name: 'Strong success', at: 5 } } };
        const kC = cardK(sysT, { expr: '3d6 <= 2', draws: [1, 1, 1], crit: [3, 18] }, [1, 1, 1]), kF = cardK(sysT, { expr: '3d6 <= 18', draws: [6, 6, 6], crit: [3, 18] }, [6, 6, 6]);
        const kS = cardK(sysT, { expr: '3d6 <= 12', draws: [1, 2, 3], crit: [3, 18] }, [1, 2, 3]), kP = cardK(sysT, { expr: '3d6 <= 12', draws: [3, 3, 3], crit: [3, 18] }, [3, 3, 3]), kW = cardK(sysT, { expr: '3d6 <= 12', draws: [1, 1, 2], crit: [4, 18] }, [1, 1, 2]);
        const kN = cardK(null, { expr: '3d6 <= 12', draws: [1, 1, 1] }, [1, 1, 1]), kD = cardK({ combat: { tier: { name: 'Clean hit', at: 3 } } }, { expr: 'd20 + 5 >= 10', draws: [12] }, [12]);
        check('1.6.0 the card (dice.js renderCard, run for real) follows the record\'s range: 3 against 2 a success stripe and critical success, 18 against 18 a failure stripe and critical failure, 4 a critical success only where its roll widened the range; a success by 5 or more wears the named success, by 3 none; a system without the rule reads as before, and a named success shows under any rule',
            /card-ok/.test(kC.className) && j(tagged(kC, 'roll-crit')) === j(['critical success']) && /card-fail/.test(kF.className) && j(tagged(kF, 'roll-fumble')) === j(['critical failure'])
            && j(tagged(kW, 'roll-crit')) === j(['critical success']) && j(tagged(kS, 'roll-crit')) === j([]) && j(tagged(kS, 'roll-tier')) === j(['Strong success']) && j(tagged(kP, 'roll-tier')) === j([])
            && j(tagged(kN, 'roll-crit')) === j([]) && /card-ok/.test(kN.className) && j(tagged(kD, 'roll-tier')) === j(['Clean hit']) && j(tagged(kF, 'roll-tier')) === j([]),
            j([kC.className, kF.className, tagged(kS, 'roll-tier'), tagged(kW, 'roll-crit'), tagged(kD, 'roll-tier')]));
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
        {   // 1.5.8, backlog 149: a card's die, the one its formula rolls, drawn first on its dice line (dice.js dieInto and renderCard, run for real with
            // the real systemcore dieOf and dieicons.js dieNode on a page that writes down what it is asked and refuses markup)
            const J = JSON.stringify, S9 = await import(url('systemcore.js')), DI9 = await import(url('dieicons.js'));
            const diSrc = dj.slice(dj.indexOf('function dieInto(host, rec) {'), dj.indexOf('/* ---------- the card'));
            const mk9 = (tag, cls, text) => { const e = { tag, className: cls || '', children: [], style: {}, title: '', attrs: {}, appendChild(c) { this.children.push(c); return c; }, insertBefore(c, ref) { const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }, setAttribute(k, v) { this.attrs[k] = String(v); } };
                Object.defineProperty(e, 'firstChild', { get() { return e.children[0] || null; } }); Object.defineProperty(e, 'innerHTML', { set() { throw new Error('markup'); } }); e.textContent = text === undefined ? '' : String(text); return e; };
            const doc9 = { createTextNode: t => ({ text: t }), createElementNS: (ns, tag) => Object.assign(mk9(tag), { ns }), createElement() { throw new Error('createElement'); } };
            let rc9 = null, e9 = '';
            try { rc9 = new Function('el', 'playerHue', 'chatTime', 'net', 'F', 'verdictOf', 'critOf', 'malfOf', 'LIMITS', 'window', 'document', 'dieNode', "'use strict';\n" + diSrc + rcSrc + '\nreturn renderCard;')(mk9, () => 0, () => '12:00', () => ({ active: false }), () => F, verdictOf, critOf, D.malfOf, LIMITS, { wpSheets: { systemOf: () => null }, wpSystemCore: S9 }, doc9, DI9.dieNode); } catch (e) { e9 = e.stack || e.message; }
            const brk9 = c => (c.children.find(k => k.className === 'roll-break') || { children: [] }), dieOf9 = c => { const s = brk9(c).children[0]; return s && s.tag === 'svg' ? s : null; };
            const pathsOf = n => J(DI9.DIE_ICONS[n].map(p => p.d)), drawn = c => { const s = dieOf9(c); return s ? J(s.children.map(p => p.attrs.d)) : ''; };
            let k3 = null, k20 = null, kF = null, kBad = null, kHost = null;
            try {
                k3 = rc9({ roll: rec({ expr: '3d6', draws: [2, 3, 4], label: 'Strength' }), res: roll('3d6', [2, 3, 4]) }); k20 = rc9({ roll: rec({ expr: 'd20 + 5', draws: [11] }), res: roll('d20 + 5', [11]) });
                kF = rc9({ roll: rec({ expr: '1d20 + 1d6', draws: [5, 2] }), res: roll('1d20 + 1d6', [5, 2]) }); kBad = rc9({ roll: rec({ expr: '2d6', draws: [1, 1] }), res: null });
                kHost = rc9({ roll: rec({ expr: '2d6 + 1', draws: [3, 3], die: '<img src=x onerror=1>' }), res: roll('2d6 + 1', [3, 3]) });
            } catch (e) { e9 = e9 || e.stack || e.message; }
            check('1.5.8 a card draws the die its formula rolls (dice.js dieInto in renderCard, run for real): 3d6 three faces, d20 + 5 a d20, several kinds the d6, each the first thing on its dice line, an svg made by name with its class ico ico-die roll-die-ico; a card whose roll could not be read draws none; a record that names a die of its own is drawn by its formula all the same, and nothing of the record reaches markup',
                !!k3 && drawn(k3) === pathsOf('3d6') && drawn(k20) === pathsOf('d20') && drawn(kF) === pathsOf('d6') && dieOf9(k3).attrs.class === 'ico ico-die roll-die-ico' && dieOf9(k3).ns === 'http://www.w3.org/2000/svg'
                && !kBad.children.some(k => k.className === 'roll-break') && drawn(kHost) === pathsOf('2d6') && !J(kHost).includes('onerror')
                && dj.includes("    if (typeof dieInto === 'function') dieInto(brk, rec);   // 1.5.8: the die its formula rolls, first on the dice line\n    wrap.appendChild(brk);"), e9 || J([k3 && dieOf9(k3), kF && drawn(kF)]));
        }
        {   // 1.6.0 (B5 follow-up): where a called shot was aimed, on the host's record (cleanAim, cleanRoll): text and numbers in their bounds; one that does not clean is left off and the roll kept
            const rA = cleanRoll(rec({ aim: { n: 'Servo-arm', f: [{ k: 'Aim', v: -5 }] } })), rA0 = cleanRoll(rec({ aim: { n: 'Torso', f: [] } }));
            const badA = [{ n: '', f: [] }, { n: 'x'.repeat(61), f: [] }, { n: 'Arm' }, { n: 'Arm', f: [{ k: 'A', v: NaN }] }, { n: 'Arm', f: [{ k: '', v: 1 }] }, { n: 'Arm', f: [1, 2, 3, 4, 5].map(i => ({ k: 'K' + i, v: i })) }, { n: 'Arm\u0007', f: [] }, [1], 'x', null].map(b => cleanRoll(rec({ aim: b })));
            check('1.6.0 (B5 follow-up) cleanRoll keeps where a called shot was aimed (the location\'s name, up to 4 figures each a label and a number); a malformed one is left off and the roll kept; cleanAim alone',
                !!rA && JSON.stringify(rA.aim) === JSON.stringify({ n: 'Servo-arm', f: [{ k: 'Aim', v: -5 }] }) && JSON.stringify(rA0.aim) === JSON.stringify({ n: 'Torso', f: [] }) && badA.every(r => r && !('aim' in r)) && D.cleanAim({ n: 'A', f: [], x: 1 }).x === undefined,
                JSON.stringify([rA, badA]));
        }
        {   // 1.6.0 (B3): a damage roll's second part on the host's record (cleanDmg2, cleanRoll): kept only beside dmg 1, text and numbers in their bounds; one that does not clean is left off and the roll kept
            const r2 = cleanRoll(rec({ dmg: 1, dmg2: { t: 4, n: 1, dtype: 'burn', ad: 2 } })), r0 = cleanRoll(rec({ dmg2: { t: 4 } })), rT = cleanRoll(rec({ dmg: 1, dmg2: { t: 0 } }));
            const badD2 = [{ t: -1 }, { t: 1.5 }, { t: 1000001 }, { t: 4, n: 0 }, { t: 4, n: 101 }, { t: 4, dtype: '9x' }, { t: 4, dtype: '<b>' }, { t: 4, ad: 1 }, { t: 4, ad: 0.05 }, { t: 4, ad: 'x' }, [4], 'x', null].map(b => cleanRoll(rec({ dmg: 1, dmg2: b })));
            check('1.6.0 (B3) cleanRoll keeps a damage roll\'s second part (its total, its dice, its type\'s key, its armour divisor) only beside dmg 1; a malformed one is left off and the roll kept; cleanDmg2 alone',
                !!r2 && JSON.stringify(r2.dmg2) === JSON.stringify({ t: 4, n: 1, dtype: 'burn', ad: 2 }) && !!r0 && !('dmg2' in r0) && JSON.stringify(rT.dmg2) === JSON.stringify({ t: 0 })
                && badD2.every(r => r && r.dmg === 1 && !('dmg2' in r)) && D.cleanDmg2({ t: 3, extra: 1 }).extra === undefined && D.cleanDmg2({}) === null,
                JSON.stringify([r2, r0, rT, badD2]));
            const rK = cleanRoll(rec({ dmg: 1, dkind: 'close', dmg2: { t: 4, dkind: 'shot' }, dmg5: { t: 1, dkind: 'wide' } })), rK0 = cleanRoll(rec({ dkind: 'close' })), rKb = ['1x', '<b>', 3, null, {}].map(b => cleanRoll(rec({ dmg: 1, dkind: b }))), rKp = cleanRoll(rec({ dmg: 1, dmg2: { t: 4, dkind: '1x' } }));
            check('1.6.0 cleanRoll keeps a blow\'s kind (dkind) only beside dmg 1, a key and nothing else, one that does not clean left off and the roll kept; cleanDmg2 keeps a part\'s own, and a part whose kind is no key is left off as any malformed part is',
                rK.dkind === 'close' && JSON.stringify(rK.dmg2) === JSON.stringify({ t: 4, dkind: 'shot' }) && JSON.stringify(rK.dmg5) === JSON.stringify({ t: 1, dkind: 'wide' }) && !!rK0 && !('dkind' in rK0) && rKb.every(r => r && r.dmg === 1 && !('dkind' in r)) && !!rKp && !('dmg2' in rKp) && D.cleanDmg2({ t: 3, dkind: 'shot' }).dkind === 'shot' && D.cleanDmg2({ t: 3, dkind: 'a'.repeat(25) }) === null,
                JSON.stringify([rK, rK0, rKb, rKp]));
            const r34 = cleanRoll(rec({ dmg: 1, dmg2: { t: 4 }, dmg3: { t: 2, dtype: 'burn' }, dmg4: { t: 6, n: 2, ad: 3 } })), r3a = cleanRoll(rec({ dmg: 1, dmg3: { t: 2 } })), r3n = cleanRoll(rec({ dmg3: { t: 2 }, dmg4: { t: 1 } })), r3b = cleanRoll(rec({ dmg: 1, dmg3: { t: -2 }, dmg4: 'x', dmg5: { t: 1 }, dmg6: { t: 1 } })), r5 = cleanRoll(rec({ dmg: 1, dmg5: { t: 7, n: 2, dtype: 'burn', ad: 3 } })), r5n = cleanRoll(rec({ dmg5: { t: 7 } })), r5x = cleanRoll(rec({ dmg: 1, dmg5: { t: -1 } }));
            check('1.6.0 cleanRoll keeps a third, a fourth and a fifth part (dmg3, dmg4, dmg5) as it keeps the second, each through cleanDmg2, only beside dmg 1, each alone; a malformed one is left off and the roll kept; a sixth is no key (a fifth: moved on purpose)',
                JSON.stringify([r34.dmg2, r34.dmg3, r34.dmg4]) === JSON.stringify([{ t: 4 }, { t: 2, dtype: 'burn' }, { t: 6, n: 2, ad: 3 }]) && JSON.stringify(r3a.dmg3) === JSON.stringify({ t: 2 }) && !('dmg2' in r3a)
                && !!r3n && !('dmg3' in r3n) && !('dmg4' in r3n) && !!r3b && r3b.dmg === 1 && !('dmg3' in r3b) && !('dmg4' in r3b) && JSON.stringify(r3b.dmg5) === JSON.stringify({ t: 1 }) && !('dmg6' in r3b)
                && JSON.stringify(r5.dmg5) === JSON.stringify({ t: 7, n: 2, dtype: 'burn', ad: 3 }) && !('dmg5' in r5n) && !!r5x && r5x.dmg === 1 && !('dmg5' in r5x), JSON.stringify([r34, r3a, r3n, r3b, r5, r5n, r5x]));
        }
        {   // 1.5.8 (book handoff 90 Part B): what changed the values a roll read — the host's list cleaned (cleanMods) and drawn under the dice (modsInto, run for real)
            const md = [{ n: 'Row.Attack', b: 14, a: 17, m: [{ s: 'Battle Rage', v: 3 }], w: [{ s: 'Cracked charm', v: -1, t: 'Skill' }, { s: 'High Guard', v: 1, t: 'Skill' }] }, { n: 'Parry', b: 12, a: 12, w: [{ s: 'Combat Reflexes', v: 1, t: 'ParryBonus' }] }];
            const kept = cleanRoll(Object.assign({}, rec({ label: 'Hit' }), { mods: md }));
            const bads = [[], 'x', [{ n: 'A', b: 1, a: 2, m: [] }], [{ n: 'A', b: 1, a: 2 }], [{ n: 'A', b: 1, a: 2, w: [{ s: 'S', v: 1 }] }], [{ n: 'A', b: 1, a: 2, m: [{ s: 'S', v: 1, t: 'X' }] }], [{ n: 'A', b: 'x', a: 2, m: [{ s: 'S', v: 1 }] }], [{ n: 'A', b: 1, a: 2, m: [{ s: '', v: 1 }] }], [{ n: 'A', b: 1, a: 2, m: [{ s: 'S', v: 0 }] }], [{ n: 'A\u0007', b: 1, a: 2, m: [{ s: 'S', v: 1 }] }], new Array(9).fill(md[0])].map(x => cleanRoll(Object.assign({}, rec({ label: 'Hit' }), { mods: x })));
            const miSrc = dj.slice(dj.indexOf('function modsInto(wrap, mods) {'), dj.indexOf('function renderCard(m) {'));
            const doc = { createTextNode: t => ({ textContent: String(t), children: [], className: '' }) };
            const mi = new Function('el', 'fmtNum', 'document', miSrc + '\nreturn modsInto;')(fe, D.fmtNum, doc);
            const w = fe('div'); mi(w, kept.mods); const box = w.children[0], txt = n => [n.textContent].concat((n.children || []).map(txt)).join('');
            const w2 = fe('div'); mi(w2, undefined); mi(w2, []);
            check('1.5.8 a roll card lists what changed the values it read: cleanMods keeps names, figures and sources as text and numbers (a bad list leaves the roll and drops the list), and the card draws each value before and after and each change by its source, as text',
                !!kept && j(kept.mods) === j(md) && bads.every(r => r && !('mods' in r)) && box && box.className === 'chat-mods' && txt(box.children[0]) === 'Attack 14 \u2192 17'
                && box.children[1].textContent === '+3 Battle Rage' && box.children[2].textContent === '\u22121 Cracked charm on Skill' && box.children[3].textContent === '+1 High Guard on Skill'
                && txt(box.children[4]) === 'Parry 12' && box.children[5].textContent === '+1 Combat Reflexes on ParryBonus' && w2.children.length === 0,
                j([kept && kept.mods, box && box.children.map(txt)]));
        }
        const cls = c => c.className.split(' ').filter(Boolean), kid = (c, k) => c.children.find(x => x && x.className && x.className.split(' ').indexOf(k) >= 0) || null;
        {   // 1.5.7: a roll worked out from a sheet reads in plain figures, and a damage card's Apply to target is used once (dice.js readableInto and renderCard, run for real)
            const rc2Src = dj.slice(dj.indexOf('// 1.5.7: a roll worked out from a sheet, said in plain figures'), dj.indexOf('// Stage 6 HUD H7: an apply action'));
            const clicks = [];
            const fe2 = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined ? '' : String(text), children: [], style: {}, title: '', type: '', parentNode: null, listeners: {}, appendChild(c) { this.children.push(c); if (c && typeof c === 'object') c.parentNode = this; return c; }, replaceChild(n, o) { const i = this.children.indexOf(o); if (i >= 0) { this.children[i] = n; n.parentNode = this; } return o; }, addEventListener(k, f) { this.listeners[k] = f; } });
            const sheets = { systemOf: () => null, damageOn: () => true, damageFromRoll: (from, amt, done, type) => { clicks.push([from, amt, type]); if (typeof done === 'function') done(); return true; } };
            const rc2 = new Function('el', 'playerHue', 'chatTime', 'net', 'F', 'verdictOf', 'critOf', 'malfOf', 'LIMITS', 'fmtNum', 'window', 'document', "'use strict';\n" + rc2Src + '\nreturn renderCard;')(fe2, () => 0, () => '12:00', () => ({ active: false }), () => F, verdictOf, critOf, D.malfOf, LIMITS, D.fmtNum, { wpSheets: sheets }, { createTextNode: t => ({ text: t }) });
            const flat = n => !n ? '' : n.text !== undefined ? n.text : (n.textContent || '') + (n.children || []).map(flat).join('');
            const vars = name => ({ 'row.attack': 15, st: 9 })[name];
            const resN = F.evaluate('3d6 <= Row.Attack + 2', { random: scripted([4, 2, 5]), vars }), cN = rc2({ roll: rec({ expr: '3d6 <= Row.Attack + 2', label: 'Blade · Attack' }), res: resN });
            const brkN = kid(cN, 'roll-break'), exN = kid(cN, 'roll-expr');
            const resP = F.evaluate('2d6 + 3', { random: scripted([4, 5]) }), cP = rc2({ roll: rec({ expr: '2d6 + 3' }), res: resP });
            const rD = rec({ expr: '3d6', label: 'Blade · Damage', dmg: 1, dtype: 'cut' }), cD = rc2({ roll: rD, res: F.evaluate('3d6', { random: scripted([4, 2, 5]) }) });
            const btn = kid(cD, 'chat-dmgapply'); btn.listeners.click(); const after = kid(cD, 'chat-dmgapply'), done = kid(cD, 'chat-dmgdone');
            const cD2 = rc2({ roll: rD, res: F.evaluate('3d6', { random: scripted([4, 2, 5]) }) });
            check('1.5.7 chat cards (dice.js readableInto and renderCard, run for real): a roll whose formula names the sheet shows no formula line, its dice in brackets, what they came to and what it needed ("3d6 [4, 2, 5] = 11 · needs 17 or less"), the formula and its working on the line\'s tooltip; a typed roll keeps its formula line and whole working; a damage card\'s Apply to target hands the window the roll\'s total and type, and once applied the card says Applied with no button, also when drawn again',
                !exN && flat(brkN) === '3d6 [4, 2, 5] = 11 \u00b7 needs 17 or less' && /^3d6 <= Row\.Attack \+ 2\n/.test(brkN.title) && !!kid(cP, 'roll-expr') && /3d6|2d6/.test(flat(kid(cP, 'roll-break')))
                && JSON.stringify(clicks) === JSON.stringify([['u_pat', 11, 'cut']]) && !after && !!done && done.textContent === 'Applied' && rD.dmgUsed === 1 && !kid(cD2, 'chat-dmgapply') && !!kid(cD2, 'chat-dmgdone'), JSON.stringify([flat(brkN), brkN.title, clicks, !!after, !!done]));
            // 1.6.0 (B3): a damage card's second part, said under its total and handed to the window as part2; none on a card without one
            const more3 = [], sheets3 = { systemOf: () => ({ combat: { damage: { types: [{ key: 'cut', label: 'Cutting' }, { key: 'burn', label: 'Burning' }] } } }), damageOn: () => true, damageFromRoll: (from, amt, done, type, more) => { more3.push([amt, type, more]); return true; } };
            const rc3 = new Function('el', 'playerHue', 'chatTime', 'net', 'F', 'verdictOf', 'critOf', 'malfOf', 'LIMITS', 'fmtNum', 'window', 'document', "'use strict';\n" + rc2Src + '\nreturn renderCard;')(fe2, () => 0, () => '12:00', () => ({ active: false }), () => F, verdictOf, critOf, D.malfOf, LIMITS, D.fmtNum, { wpSheets: sheets3 }, { createTextNode: t => ({ text: t }) });
            const c3 = rc3({ roll: rec({ expr: '2d6', label: 'Blade \u00b7 Damage', dmg: 1, dtype: 'cut', dmg2: { t: 4, n: 1, dtype: 'burn', ad: 2 } }), res: F.evaluate('2d6', { random: scripted([3, 4]) }) }); kid(c3, 'chat-dmgapply').listeners.click();
            const c4 = rc3({ roll: rec({ expr: '2d6', dmg: 1 }), res: F.evaluate('2d6', { random: scripted([3, 4]) }) }); kid(c4, 'chat-dmgapply').listeners.click();
            check('1.6.0 (B3) a damage card says its second part under the total ("and 4 Burning in the same blow", by the type\'s label) and Apply to target hands it to the window as part2 (its amount, type, divisor and dice); a card with none says nothing and hands none',
                kid(c3, 'roll-part2') && kid(c3, 'roll-part2').textContent === 'and 4 Burning in the same blow' && JSON.stringify(more3[0]) === JSON.stringify([7, 'cut', { dice: 2, ad: 0, major: false, part2: { amt: 4, type: 'burn', ad: 2, dice: 1 } }])
                && !kid(c4, 'roll-part2') && more3[1][2].part2 === undefined, JSON.stringify(more3));
            // 1.6.0 (B5 follow-up, the owner: "Yes, add it"): a called shot's card says where it was aimed and what its location gave
            const cA1 = rc3({ roll: rec({ expr: '3d6 + Target.Hit.aim', label: 'Aimed shot', aim: { n: 'Servo-arm', f: [{ k: 'Aim', v: -5 }] } }), res: F.evaluate('3d6', { random: scripted([1, 5, 1]) }) });
            const cA2 = rc3({ roll: rec({ expr: '3d6', aim: { n: 'Crane arm', f: [{ k: 'Penalty', v: -2 }, { k: 'Size', v: 1 }] } }), res: F.evaluate('3d6', { random: scripted([1, 5, 1]) }) });
            const cA3 = rc3({ roll: rec({ expr: '3d6', aim: { n: 'Torso', f: [] } }), res: F.evaluate('3d6', { random: scripted([1, 5, 1]) }) }), cA0 = rc3({ roll: rec({ expr: '3d6' }), res: F.evaluate('3d6', { random: scripted([1, 5, 1]) }) });
            check('1.6.0 (B5 follow-up) a called shot\'s card names where it was aimed and what its location gave: one figure in brackets ("at Servo-arm (\u22125)"), several by their labels ("at Crane arm (Penalty \u22122, Size +1)"), none as the name alone; a card with no aim says nothing',
                kid(cA1, 'roll-aim') && kid(cA1, 'roll-aim').textContent === 'at Servo-arm (\u22125)' && kid(cA2, 'roll-aim').textContent === 'at Crane arm (Penalty \u22122, Size +1)' && kid(cA3, 'roll-aim').textContent === 'at Torso' && !kid(cA0, 'roll-aim'),
                JSON.stringify([kid(cA1, 'roll-aim') && kid(cA1, 'roll-aim').textContent, kid(cA2, 'roll-aim') && kid(cA2, 'roll-aim').textContent]));
            // 1.6.0 (asked by the session that builds a game system): a third and a fourth part, said one line each under the second and handed to the window as part3 and part4
            const c5 = rc3({ roll: rec({ expr: '2d6', dmg: 1, dtype: 'cut', dmg2: { t: 4, n: 1, dtype: 'burn' }, dmg3: { t: 2, dtype: 'cut' }, dmg4: { t: 6, n: 2, dtype: 'burn', ad: 3 }, dmg5: { t: 1, dtype: 'cut' } }), res: F.evaluate('2d6', { random: scripted([3, 4]) }) }); kid(c5, 'chat-dmgapply').listeners.click();
            const c6 = rc3({ roll: rec({ expr: '2d6', dmg: 1, dmg3: { t: 5, dtype: 'burn' } }), res: F.evaluate('2d6', { random: scripted([3, 4]) }) }); kid(c6, 'chat-dmgapply').listeners.click();
            check('1.6.0 a damage card says a third, a fourth and a fifth part, one line each after the second ("and 2 Cutting in the same blow"), and Apply to target hands them to the window as part3, part4 and part5 (amount, type, divisor and dice); a third part with no second is said and handed alone; a card of one or two parts hands nothing more (above)',
                c5.children.filter(k => k.className === 'roll-part2').map(k => k.textContent).join('|') === 'and 4 Burning in the same blow|and 2 Cutting in the same blow|and 6 Burning in the same blow|and 1 Cutting in the same blow'
                && JSON.stringify(more3[2]) === JSON.stringify([7, 'cut', { dice: 2, ad: 0, major: false, part2: { amt: 4, type: 'burn', dice: 1 }, part3: { amt: 2, type: 'cut' }, part4: { amt: 6, type: 'burn', ad: 3, dice: 2 }, part5: { amt: 1, type: 'cut' } }])
                && c6.children.filter(k => k.className === 'roll-part2').map(k => k.textContent).join('|') === 'and 5 Burning in the same blow' && JSON.stringify(more3[3][2]) === JSON.stringify({ dice: 2, ad: 0, major: false, part3: { amt: 5, type: 'burn' } }), JSON.stringify(more3.slice(2)));
        }
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
    {   // 1.6.0, backlog 27 (the owner, by prompt: pages and planners, GM info on tokens, Table Chat messages; "Like any roll"): inlinedice.js, sliced and run for real on a page of plain objects
        const j = JSON.stringify;
        const idS = require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', 'inlinedice.js'), 'utf8').replace(/\r\n/g, '\n');
        const iA = idS.indexOf('// [dicecheck:inline-start]'), iZ = idS.indexOf('// [dicecheck:inline-end]');
        const mkNode = (doc, type, tag, text) => {
            const n = { nodeType: type, tagName: tag ? tag.toUpperCase() : undefined, ownerDocument: doc, parentNode: null, childNodes: [], attrs: {}, className: '', hidden: false, type: '', title: '', nodeValue: type === 3 ? text : null };
            n.appendChild = c => { if (c.frag) { c.childNodes.slice().forEach(k => n.appendChild(k)); c.childNodes = []; return c; } c.parentNode = n; n.childNodes.push(c); return c; };
            n.replaceChild = (nw, old) => { const i = n.childNodes.indexOf(old); const add = nw.frag ? nw.childNodes.slice() : [nw]; add.forEach(k => { k.parentNode = n; }); n.childNodes.splice(i, 1, ...add); old.parentNode = null; return old; };
            n.setAttribute = (k, v) => { n.attrs[k] = String(v); }; n.getAttribute = k => (k in n.attrs ? n.attrs[k] : null);
            n.matches = sel => !!tag && sel.split(',').map(s => s.trim()).some(s => (s === tag) || (s.charAt(0) === '.' && (' ' + n.className + ' ').indexOf(' ' + s.slice(1) + ' ') >= 0) || (s === '[contenteditable]' && 'contenteditable' in n.attrs));
            n.closest = sel => { for (let x = n; x; x = x.parentNode) if (x.nodeType === 1 && x.matches(sel)) return x; return null; };
            n.querySelectorAll = sel => { const out = []; (function w(x) { x.childNodes.forEach(k => { if (k.nodeType === 1) { if (k.matches(sel)) out.push(k); w(k); } }); })(n); return out; };
            n.normalize = () => { const k = []; n.childNodes.forEach(c => { const last = k[k.length - 1]; if (c.nodeType === 3 && last && last.nodeType === 3) last.nodeValue += c.nodeValue; else k.push(c); }); n.childNodes = k; };
            Object.defineProperty(n, 'textContent', { get: () => (n.nodeType === 3 ? n.nodeValue : n.childNodes.map(c => c.textContent).join('')), set: v => { n.childNodes = []; if (v !== '') n.appendChild(doc.createTextNode(String(v))); } });
            return n;
        };
        const doc = { createElement: tag => mkNode(doc, 1, tag), createTextNode: s => mkNode(doc, 3, null, s), createDocumentFragment: () => { const f = mkNode(doc, 11, null); f.frag = true; return f; } };
        const el = (tag, cls, kids) => { const n = doc.createElement(tag); if (cls) n.className = cls; (kids || []).forEach(k => n.appendChild(typeof k === 'string' ? doc.createTextNode(k) : k)); return n; };
        const winI = {}; const I = new Function('window', 'document', "'use strict';\n" + idS.slice(iA, iZ) + '\nreturn { runs: diceRuns, apply: apply, strip: strip, list: list };')(winI, doc);
        const runs = I.runs('Roll 2d6 + 3 then d20, or 4dF and 3d6−1; not and20, x2d6, 2d6x, 1.5d6, d, d0x; Damage 1d10+2d6-1') .map(r => r.expr);
        const many = I.runs(Array(60).fill('d6').join(' ')).length, long = I.runs('d6' + '+1'.repeat(40)).length, none = [I.runs(''), I.runs(null), I.runs(7)].map(x => x.length);
        const page = el('div', 'pv', [el('div', 'pv-blk', [el('h2', '', ['Bandits'])]), el('div', 'pv-blk', [el('p', '', ['They hit for 2d6 + 1, ', el('a', '', ['see 1d4']), ' or ', el('code', '', ['3d6']), ' and d8.'])])]);
        const made = I.apply(page), p0 = page.childNodes[1].childNodes[0], btns = page.querySelectorAll('.inline-dice');
        const again = I.apply(page), txt = page.textContent, first = p0.childNodes[0].nodeValue;
        I.strip(page); const back = page.querySelectorAll('.inline-dice').length, txt2 = page.textContent;
        const chat = el('span', 'chat-text', ['<b>3d6</b> please']); I.apply(chat);
        const box = el('div', 'gm-dice'); const nL = I.list(box, 'Guard: 2d6 + 2 sword, 1d20 + 4 to hit'), lst = box.childNodes.map(b => [b.textContent, b.attrs['data-roll'], b.type, b.title]); const nL0 = I.list(box, 'no dice'), hid = box.hidden;
        winI.wpStream = true; const st = el('p', '', ['2d6']); const madeS = I.apply(st);
        check('1.6.0 inline dice (backlog 27; inlinedice.js run for real): diceRuns finds a formula with dice as the roller takes it (a true minus as -, a space round each sign), never inside a word, a decimal or after one, never a bare d, at most 40 a text and none longer than 60; apply makes each a button with the words as written and the formula in data-roll, of elements and text nodes only, never inside a link or code, and once only; strip puts the text back; a chat text with markup in it is words; list makes a GM note\'s buttons, hidden with none; nothing in the stream window',
            j(runs) === j(['2d6 + 3', 'd20', '4dF', '3d6 - 1', '1d10 + 2d6 - 1']) && many === 40 && long === 0 && j(none) === j([0, 0, 0])
            && made === 2 && again === 0 && btns.length === 2 && btns[0].textContent === '2d6 + 1' && btns[0].attrs['data-roll'] === '2d6 + 1' && btns[0].type === 'button' && btns[0].title === 'Roll 2d6 + 1' && btns[1].attrs['data-roll'] === 'd8'
            && first === 'They hit for ' && txt === 'BanditsThey hit for 2d6 + 1, see 1d4 or 3d6 and d8.' && back === 0 && txt2 === txt
            && chat.childNodes.length === 3 && chat.childNodes[1].attrs['data-roll'] === '3d6' && chat.childNodes[0].nodeValue === '<b>' && chat.childNodes[2].nodeValue === '</b> please'
            && nL === 2 && j(lst) === j([['2d6 + 2', '2d6 + 2', 'button', 'Roll 2d6 + 2'], ['1d20 + 4', '1d20 + 4', 'button', 'Roll 1d20 + 4']]) && nL0 === 0 && hid === true && madeS === 0
            && !/innerHTML|insertAdjacentHTML/.test(idS), j([runs, many, long, made, again, txt, txt2, lst, first, back, hid, madeS]));
        const ix = require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8'), pn = require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', 'pagenav.js'), 'utf8'), nj = require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8'), ij = require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'scripts', 'inspector.js'), 'utf8');
        check('1.6.0 inline dice, the wiring: the module loaded after the dice roller; every place a page is read asks it after its folds and an export takes it off with them; a chat message\'s own words (never its sender\'s name) and a GM note in Properties; Help says it',
            ix.indexOf('<script type="module" src="scripts/inlinedice.js"></script>') > ix.indexOf('<script type="module" src="scripts/dice.js"></script>') && /root\.classList\.add\('pv-folds'\);\s*if \(typeof window !== 'undefined' && window\.wpInlineDice && typeof window\.wpInlineDice\.apply === 'function'\) window\.wpInlineDice\.apply\(root\);/.test(pn)
            && /function foldStrip\(root\) \{[^\n]*window\.wpInlineDice\.strip\(root\); \}/.test(pn) && nj.indexOf("var tx = document.createElement('span'); tx.className = 'chat-text'; tx.textContent = String(m.text || ''); wrap.appendChild(tx);") > 0
            && /<div id="wbGmDice" class="gm-dice" hidden><\/div>/.test(ij) && /A <b>dice formula written in text<\/b>, such as 2d6 \+ 3, is a button that rolls it\./.test(ix), '');
    }
    delete global.window;

    {   // 1.6.0 A burst: a record's further hits (dicecore cleanHits, cleanRoll)
        const base = { id: 'r_a', from: { id: 'u_a', name: 'Pebbles' }, expr: '2d6', draws: [3, 4], v: 1, ts: 1, dmg: 1 }, S = await import(url('systemcore.js'));
        const hit = { t: 9, n: 2, dtype: 'cut', ad: 2, dkind: 'blunt', major: 1, dmg2: { t: 3, n: 1, dtype: 'cut' }, dmg5: { t: 1 } };
        const ok = D.cleanRoll(Object.assign({}, base, { more: [hit] })), many = D.cleanRoll(Object.assign({}, base, { more: new Array(31).fill({ t: 1 }) })), over = D.cleanRoll(Object.assign({}, base, { more: new Array(32).fill({ t: 1 }) }));
        const bad = [[{ t: -1 }], [{ t: 1, major: 2 }], [{ t: 1, dmg2: { t: 'x' } }], [{ t: 1, dtype: '<b>' }], [null], 'all', [], [{ t: 1.5 }]].map(v => D.cleanRoll(Object.assign({}, base, { more: v })));
        const noDmg = D.cleanRoll(Object.assign({}, base, { dmg: undefined, more: [{ t: 2 }] }));
        check('1.6.0 A burst, the record (cleanHits, cleanRoll): each hit after the first is a part\'s keys with its Major Wound mark and its added parts; 31 go, 32 do not; a hit that does not clean, or a list that is none, leaves more off and keeps the roll; only a damage roll carries it; dicecore\'s count is the core\'s',
            JSON.stringify(ok.more) === JSON.stringify([hit]) && many.more.length === 31 && !!over && !('more' in over) && bad.every(r => !!r && !('more' in r)) && !('more' in noDmg) && LIMITS.hits === S.HITS_MAX, JSON.stringify([ok, bad]));
    }
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
