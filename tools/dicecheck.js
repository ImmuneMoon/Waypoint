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

(async () => {
    let D = null, F = null, err = null;
    try { D = await import(url('dicecore.js')); F = await import(url('formula.js')); } catch (e) { err = e; }
    check('modules load in Node with no window', !!D && !!F && !err, err && err.message);
    if (!D || !F) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { LIMITS, cleanExpr, cleanRollReq, cleanRoll, cleanDeny, replay, checkTableRoll, denyText, parseCommand, verdictOf, critOf, cardText, RateLimit, uid } = D;
    const V = F.VERSION;
    const roll = (expr, draws) => F.evaluate(expr, { random: scripted(draws) });
    const rec = (o) => Object.assign({ id: 'r_abc123', from: { id: 'u_pat', name: 'Pat', gm: false }, expr: '2d6 + 3', draws: [4, 5], v: V, ts: 1000 }, o);

    /* ---- expressions ---- */
    check('cleanExpr trims, caps at 300, refuses empty and control characters', cleanExpr('  d20 ') === 'd20' && cleanExpr('x'.repeat(301)) === null && cleanExpr('') === null && cleanExpr('d20' + String.fromCharCode(0)) === null && cleanExpr(5) === null && cleanExpr('x'.repeat(300)) !== null);

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

    /* ---- rate limit ---- */
    check('RateLimit: per-peer spacing, burst, table cap, forget', (() => { const L = RateLimit({ perMs: 400, burst: 3, windowMs: 10000, table: 5 }); const a = L.allow('p1', 0), b = L.allow('p1', 100), c = L.allow('p1', 500), d = L.allow('p1', 1000), e = L.allow('p1', 1500); const f = L.allow('p2', 2000), g = L.allow('p3', 2500), h = L.allow('p4', 3000); const i = L.allow('p1', 11000); L.forget('p1'); const j = L.allow('p1', 11001); return a === true && b === 'slow' && c === true && d === true && e === 'slow' && f === true && g === true && h === 'table' && i === true && j === true; })());

    check('uid shape', /^r_[a-z0-9]{1,16}$/.test(uid()));

    /* ---- publication ---- */
    global.window = {};
    const D2 = await import(url('dicecore.js') + '?x');
    check('window.wpDiceCore published', !!(global.window.wpDiceCore && global.window.wpDiceCore.cleanRoll && global.window.wpDiceCore.VERSION === D2.VERSION));
    delete global.window;

    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
