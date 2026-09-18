/* Offline check of the formula and dice engine (system/app/scripts/formula.js). The module is imported for real
   — once with no window (the guard), once with a stub window (the publication) — and driven through the
   language, the dice rules, the checks, the names contract, the limits, determinism and replay, the breakdown
   goldens of docs/FORMULA_ENGINE_PLAN.md section 8, the random source, and a seeded fuzz loop.
   Usage: node tools/formulacheck.js   (exit 1 on any failure; the whole run stays under two seconds) */
'use strict';
const path = require('path');
const mod = path.join(__dirname, '..', 'system', 'app', 'scripts', 'formula.js');
const t0 = Date.now();

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + detail : ''); } }
const j = o => JSON.stringify(o);

/* ---- random sources ---- */
function scripted(list) { let i = 0; const f = () => { if (i >= list.length) throw new Error('scripted queue empty'); return list[i++]; }; f.left = () => list.length - i; return f; }
function seeded(seed) {                                       // mulberry32
    let a = seed >>> 0;
    const rand = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return faces => 1 + Math.floor(rand() * faces);
}
function counting(inner) { const f = faces => { f.calls++; return inner(faces); }; f.calls = 0; return f; }
function throwing() { return () => { throw new Error('no draws allowed'); }; }

(async () => {
    /* ---- group 11a: the guard — the module must load with no window at all ---- */
    const url = 'file:///' + path.resolve(mod).replace(/\\/g, '/');
    let F = null, loadErr = null;
    try { F = await import(url); } catch (e) { loadErr = e; }
    check('module loads in Node with no window (the guard)', !!F && !loadErr, loadErr && loadErr.message);
    if (!F) { console.log('\n' + 'cannot continue'); process.exit(1); }
    check('exports the API', ['parse', 'evaluate', 'evaluateAst', 'names', 'describe', 'fromDraws', 'LIMITS', 'VERSION'].every(k => k in F));
    check('LIMITS as designed', j(F.LIMITS) === j({ maxChars: 2000, maxDice: 1000, maxFaces: 1000000, maxDepth: 64, maxNest: 64, maxExplode: 100, maxReroll: 100 }));

    const ev = (text, opts) => F.evaluate(text, opts);
    const val = (text, opts) => { const r = ev(text, opts); return r.ok ? r.value : ('ERR: ' + r.error.message); };
    const txt = (text, draws, opts) => { const r = ev(text, Object.assign({ random: scripted(draws || []) }, opts || {})); return r.ok ? r.breakdown.text : ('ERR: ' + r.error.message); };
    function E(name, text, message, pos, len, opts) {
        const r = ev(text, opts);
        const ok = !r.ok && r.error.message === message && (pos === undefined || r.error.pos === pos) && (len === undefined || r.error.len === len);
        check(name, ok, r.ok ? 'ok:' + j(r.value) : j(r.error));
    }

    /* ---- group 1: lexer and parser ---- */
    check('1 + 2 * 3 = 7', val('1 + 2 * 3') === 7);
    check('-2^2 = 4 (spreadsheet rule)', val('-2^2') === 4);
    check('2^-2 = 0.25', val('2^-2') === 0.25);
    check('-2^-2 = 0.25', val('-2^-2') === 0.25);
    check('2^3^2 = 64 (left to right)', val('2^3^2') === 64);
    check('2 * -3 = -6', val('2 * -3') === -6);
    check('1 - -2 = 3', val('1 - -2') === 3);
    check('--1 = 1 and +5 = 5', val('--1') === 1 && val('+5') === 5);
    check('not 1 = 0 and 1 is true', val('not 1 = 0 and 1') === true);
    check('not not 5 is true, not 5 is false', val('not not 5') === true && val('not 5') === false);
    check('(1 + 2) * 3 = 9', val('(1 + 2) * 3') === 9);
    check('.5 + 1.25 = 1.75', val('.5 + 1.25') === 1.75);
    check('unicode comparison operators', val('1 ≥ 1') === true && val('1 ≤ 0') === false && val('1 ≠ 2') === true);
    check('a leading = is ignored', txt('=1+1') === '1 + 1 = 2');
    check('= and == are the same, != and <> too', val('1 = 1') === true && val('1 == 1') === true && val('1 != 2') === true && val('1 <> 2') === true);
    check('case-insensitive functions and dice', val('FLOOR(1.5)') === 1 && txt('2D6KH1', [3, 4]) === '2D6KH1 [(3), 4] = 4');
    check('dFred is a name', val('dFred', { vars: { dFred: 3 } }) === 3);
    check('dFkhan is a name', val('dFkhan', { vars: { dfkhan: 7 } }) === 7);
    check('dex and damage are names', val('dex + damage', { vars: { dex: 1, damage: 2 } }) === 3);
    check('names(): dedup case-insensitively, first spelling wins', j(F.names('d20 + Skill.Stealth + skill.stealth + STR')) === j(['Skill.Stealth', 'STR']));
    check('names() on a parse error is []', j(F.names('1 +')) === '[]');
    check('names() inside dice counts and faces', j(F.names('(Level)d(Weapon.Die)')) === j(['Level', 'Weapon.Die']));
    check('parse() carries src and names', (() => { const p = F.parse('STR + 1'); return p.ok && p.ast.src === 'STR + 1' && j(p.names) === j(['STR']); })());
    E('empty text', '', 'Nothing to evaluate.', 0, 0);
    E('whitespace only', '   ', 'Nothing to evaluate.', 0, 0);
    E('too long', 'x'.repeat(2001), 'The formula is too long (over 2,000 characters).', 2000, 1);
    E('unknown character', '1 § 2', 'Unexpected character "§".', 2, 1);
    E('5. is not a number', '5.', '"5." is not a number.', 0, 2);
    E('1.2.3 is not a number', '1.2.3', '"1.2.3" is not a number.', 0, 5);
    E('space between count and d', '2 d6', 'Write the dice without a space: 2d6.', 2, 2);
    E('space after a parenthesised count', '(2) d6', 'Write the dice without a space: (2)d6.', 4, 2);
    E('2d (6)', '2d (6)', 'Write the dice without a space: 2d(…).', 1, 1);
    E('modifier with a space', '4d6 kh3', 'Dice modifiers must touch the dice: 4d6kh3.', 4, 3);
    E('reroll with a space', 'd20 r1', 'Dice modifiers must touch the dice: d20r1.', 4, 2);
    E('a call as a dice count', 'max(1, 2)d6', 'Put the dice count in parentheses: (max(1, 2))d6.', 9, 2);
    E('maximal munch: d20plus', 'd20plus', 'Missing an operator between "d20" and "plus".', 3, 4);
    E('unclosed parenthesis', '(1 + 2', 'Missing ")" to close the "(" at column 1.', 0, 1);
    E('unclosed dice faces', '2d(6', 'Missing ")" to close the "(" at column 3.', 2, 1);
    E('stray )', '1 + 2)', 'Unexpected ")".', 5, 1);
    E('operator with nothing after it', '1 +', 'Something is missing after "+".', 2, 1);
    E('1 + not 0', '1 + not 0', 'Something is missing after "+".', 2, 1);
    E('two values in a row', '5 STR', 'Missing an operator between "5" and "STR".', 2, 3);
    E('chained comparison', 'a < b < c', 'Only one comparison at a time: split "a < b < c" with and.', 6, 1, { vars: { a: 1, b: 2, c: 3 } });
    E('unknown function with suggestion', 'flor(1)', 'Unknown function "flor" — did you mean "floor"?', 0, 4);
    E('unknown function without suggestion', 'zzzz(1)', 'Unknown function "zzzz".', 0, 4);
    E('arity: round', 'round(1, 2, 3)', 'round takes 1 or 2 arguments, got 3.', 0, 14);
    E('arity: clamp', 'clamp(1, 2)', 'clamp takes 3 arguments, got 2.', 0, 11);
    E('arity: min', 'min()', 'min takes at least 1 argument, got 0.', 0, 5);
    E('kh given twice', '4d6kh2kh3', 'kh given twice.', 6, 3);
    E('only one keep/drop', '3d6dh1kh1', 'Only one of kh, kl, dh, dl per dice term.', 6, 3);
    E('cs without operator', 'd6cs5', 'cs needs a comparison, for example cs>=5.', 2, 3);
    E('65 nested parentheses', '('.repeat(65) + '1' + ')'.repeat(65), 'Too many nested parentheses (over 64).', 64, 1);
    check('64 nested parentheses are fine', val('('.repeat(64) + '1' + ')'.repeat(64)) === 1);
    E('300 nested calls (1,501 characters)', 'abs('.repeat(300) + '1' + ')'.repeat(300), 'Too many nested parentheses (over 64).', 259, 1);
    check('1999 leading minus signs', val('-'.repeat(1999) + '1') === -1);
    check('1000 terms', val(Array(1000).fill('1').join('+')) === 1000);
    check('1000 factors', val(Array(1000).fill('1').join('*')) === 1);

    /* ---- group 2: arithmetic and functions ---- */
    check('round half away from zero', val('round(2.5)') === 3 && val('round(-2.5)') === -3 && val('round(-1.5)') === -2);
    check('round(2.675, 2) = 2.68', val('round(2.675, 2)') === 2.68);
    check('round with negative digits', val('round(1234, -2)') === 1200);
    check('mod takes the sign of the divisor', val('mod(-7, 3)') === 2 && val('mod(7, -3)') === -2 && val('mod(7, 3)') === 1);
    check('clamp', val('clamp(5, 1, 3)') === 3 && val('clamp(-5, 1, 3)') === 1 && val('clamp(2, 1, 3)') === 2);
    check('min / max variadic', val('min(3, 1, 2)') === 1 && val('max(3, 1, 2)') === 3 && val('max(4)') === 4);
    check('floor / ceil / trunc / abs / sqrt', val('floor(-1.5)') === -2 && val('ceil(-1.5)') === -1 && val('trunc(-1.5)') === -1 && val('abs(-2)') === 2 && val('sqrt(16)') === 4);
    check('0^0 = 1', val('0^0') === 1);
    check('division gives decimals', val('7 / 2') === 3.5);
    E('division by zero', '10 / 0', 'Division by zero.', 3, 1);
    E('mod by zero', 'mod(1, 0)', 'mod by zero.', 0, 3);
    E('sqrt of a negative', 'sqrt(-4)', 'sqrt of a negative number (-4).', 5, 2);
    E('negative base, fractional exponent', '(-8)^0.5', 'Cannot raise a negative number (-8) to a fractional power.', 4, 1);
    E('clamp bounds reversed', 'clamp(1, 10, 2)', 'clamp: the low bound (10) is above the high bound (2).', 9, 2);
    E('overflow', '10^400', 'The result is too large.', 2, 1);
    E('overflow in a sum', '10^308 + 10^308', 'The result is too large.', 7, 1);

    /* ---- group 3: booleans, comparisons, laziness ---- */
    check('booleans in arithmetic', val('true + 1') === 2 && val('(1 < 2) * 10') === 10 && val('false') === false);
    check('numbers in boolean context', val('if(5, 1, 2)') === 1 && val('if(0, 1, 2)') === 2 && val('5 and 3') === true && val('0 or 0') === false);
    check('comparison of booleans', val('true = 1') === true && val('(1 < 2) = (2 < 3)') === true);
    check('result types', ev('1 = 1').type === 'boolean' && ev('1 + 1').type === 'number');
    check('comparison chained through and', val('1 < 2 and 2 < 3') === true);
    check('0.1 + 0.2 = 0.3 is false, as in a spreadsheet', val('0.1 + 0.2 = 0.3') === false && val('round(0.1 + 0.2, 10) = 0.3') === true);
    check('if is lazy', (() => { const r = ev('if(1, 5, d6)', { random: throwing() }); return r.ok && r.value === 5; })());
    check('if takes the other branch lazily', (() => { const r = ev('if(0, d6, 5)', { random: throwing() }); return r.ok && r.value === 5; })());
    check('or short-circuits', (() => { const r = ev('or(1, d6)', { random: throwing() }); return r.ok && r.value === true; })());
    check('and short-circuits (infix)', (() => { const r = ev('0 and d6', { random: throwing() }); return r.ok && r.value === false; })());
    check('and evaluates when needed', (() => { const r = ev('and(1, d6)', { random: scripted([4]) }); return r.ok && r.value === true && j(r.draws) === '[4]'; })());
    check('and()/or() variadic', val('and(1, 1, 0)') === false && val('or(0, 0, 1)') === true);
    check('spreadsheet AND inside if', txt('if(and(STR >= 10, DEX >= 10), 1, 0)', [], { vars: { STR: 12, DEX: 8 } }) === 'if(and(STR (12) >= 10, DEX (8) >= 10), 1, 0) = 0');

    /* ---- group 4: dice ---- */
    check('d20 + 5', txt('d20 + 5', [14]) === 'd20 [14] + 5 = 19');
    check('4d6kh3', txt('4d6kh3', [6, 4, 3, 1]) === '4d6kh3 [6, 4, 3, (1)] = 13');
    check('4d6kl1', txt('4d6kl1', [6, 4, 3, 1]) === '4d6kl1 [(6), (4), (3), 1] = 1');
    check('4d6dh1', txt('4d6dh1', [6, 4, 3, 1]) === '4d6dh1 [(6), 4, 3, 1] = 8');
    check('4d6dl1', txt('4d6dl1', [6, 4, 3, 1]) === '4d6dl1 [6, 4, 3, (1)] = 13');
    check('kh defaults to 1', txt('2d20kh', [7, 14]) === '2d20kh [(7), 14] = 14');
    check('ties keep the earlier die', txt('3d6kh1', [4, 4, 2]) === '3d6kh1 [4, (4), (2)] = 4');
    check('2d6! + 3 resolves one die at a time', txt('2d6! + 3', [6, 2, 4]) === '2d6! [6!+2, 4] + 3 = 15');
    check('2d6!kh1: a chain is one die', txt('2d6!kh1', [6, 3, 4]) === '2d6!kh1 [6!+3, (4)] = 9');
    check('2d6r1!: rerolls before explosions, per die', txt('2d6r1!', [1, 6, 2, 4]) === '2d6r1! [1→6!+2, 4] = 12');
    check('suffix order written differently gives the same result', txt('2d6!r1', [1, 6, 2, 4]) === '2d6!r1 [1→6!+2, 4] = 12');
    check('d20r1', txt('d20r1', [1, 17]) === 'd20r1 [1→17] = 17');
    check('r rerolls once only', txt('d20r1', [1, 1]) === 'd20r1 [1→1] = 1');
    check('r with no hit draws once', txt('d20r1', [5]) === 'd20r1 [5] = 5');
    check('2d6r<=2 (each die rerolls before the next one draws)', txt('2d6r<=2', [1, 3, 2, 4]) === '2d6r<=2 [1→3, 2→4] = 7');
    check('2d6r<=2 with a rerolled value that would qualify again stays', txt('2d6r<=2', [1, 2, 3]) === '2d6r<=2 [1→2, 3] = 5');
    check('rr rerolls until the condition fails', txt('d6rr<=5', [1, 2, 3, 6]) === 'd6rr<=5 [1→2→3→6] = 6');
    check('rr caps at 100 and marks the die', (() => { const r = ev('d6rr<=5', { random: scripted(Array(101).fill(1)) }); return r.ok && r.value === 1 && r.draws.length === 101 && r.breakdown.dice[0].capped && r.breakdown.text === 'd6rr<=5 [1→1→1→…→1 capped] = 1'; })());
    check('explosion caps at 100 and marks the die', (() => { const r = ev('d6!', { random: scripted(Array(101).fill(6)) }); return r.ok && r.value === 606 && r.draws.length === 101 && r.breakdown.text === 'd6! [6!+6+6+…+6 capped] = 606'; })());
    check('10d6cs>=5', txt('10d6cs>=5', [6, 2, 5, 1, 1, 3, 4, 6, 2, 2]) === '10d6cs>=5 [6✓, 2, 5✓, 1, 1, 3, 4, 6✓, 2, 2] = 3');
    check('cs counts chain totals', txt('10d10!cs>=8', [10, 3, 7, 8, 2, 1, 9, 10, 10, 1, 5, 6, 4]) === '10d10!cs>=8 [10!+3✓, 7, 8✓, 2, 1, 9✓, 10!+10+1✓, 5, 6, 4] = 4');
    check('cs after keep', val('10d6kh5cs>=5', { random: scripted([6, 2, 5, 1, 1, 3, 4, 6, 2, 2]) }) === 3);
    check('cs with a signed threshold on fudge dice', txt('4dFcs<=-1', [1, 3, 1, 2]) === '4dFcs<=-1 [-1✓, +1, -1✓, 0] = 2');
    check('4dF', txt('4dF', [3, 1, 2, 3]) === '4dF [+1, -1, 0, +1] = 1');
    check('4dFkh3', txt('4dFkh3', [1, 3, 1, 2]) === '4dFkh3 [-1, +1, (-1), 0] = 0');
    check('4dFr1: rerolls on fudge dice', txt('4dFr1', [3, 3, 3, 3, 3, 3, 3, 3]) === '4dFr1 [+1→+1, +1→+1, +1→+1, +1→+1] = 4');
    check('d%', txt('d%', [77]) === 'd% [77] = 77');
    check('0d6 rolls nothing', (() => { const r = ev('0d6 + 1', { random: throwing() }); return r.ok && r.value === 1 && r.breakdown.text === '0d6 + 1 = 1'; })());
    check('0d6kh1 skips the suffix checks', (() => { const r = ev('0d6kh1', { random: throwing() }); return r.ok && r.value === 0; })());
    check('(true)d6 coerces the count', txt('(true)d6', [4]) === '(true)d6 [4] = 4');
    check('(2)d6', txt('(2)d6', [3, 4]) === '(2)d6 [3, 4] = 7');
    check('(Level)d6', txt('(Level)d6', [3, 4], { vars: { Level: 2 } }) === '(Level)d6 [3, 4] = 7');
    check('d(Weapon.Die)', txt('d(Weapon.Die)', [5], { vars: { Weapon: { Die: 8 } } }) === 'd(Weapon.Die) [5] = 5');
    check('(2 + Level)d(Weapon.Die)kh1', txt('(2 + Level)d(Weapon.Die)kh1', [5, 7, 2], { vars: { Level: 1, Weapon: { Die: 8 } } }) === '(2 + Level)d(Weapon.Die)kh1 [(5), 7, (2)] = 7');
    check('a parenthesised dice term keeps its parentheses', txt('(d6) * 2', [4]) === '(d6 [4]) * 2 = 8');
    check('diceRolled counts pools, draws counts every draw', (() => { const r = ev('2d6! + d20', { random: scripted([6, 2, 4, 14]) }); return r.ok && r.diceRolled === 3 && r.draws.length === 4; })());
    check('breakdown.dice record shape', (() => { const r = ev('4d6kh3', { random: scripted([6, 4, 3, 1]) }); const d = r.breakdown.dice[0]; return d.text === '4d6kh3' && d.count === 4 && d.faces === 6 && j(d.rolls) === '[6,4,3,1]' && j(d.kept) === '[6,4,3]' && j(d.dropped) === '[1]' && d.total === 13 && d.cs === null && d.pos === 0 && d.len === 6; })());
    check('2d6!=12 is the not-equal operator', txt('2d6!=12', [3, 4]) === '2d6 [3, 4] = 7 != 12: success');
    check('2d6! = 12 explodes then compares', txt('2d6! = 12', [3, 4]) === '2d6! [3, 4] = 7 = 12: failure');
    E('2.5 dice', '2.5d6', 'The number of dice must be a whole number from 0 up, got 2.5.', 0, 3);
    E('(2.5) dice (the caret covers the parenthesised count)', '(2.5)d6', 'The number of dice must be a whole number from 0 up, got 2.5.', 0, 5);
    E('negative dice count', '(-1)d6', 'The number of dice must be a whole number from 0 up, got -1.', 0, 4);
    E('zero faces', 'd0', 'A die needs at least 1 face, got 0.', 1, 1);
    E('too many faces', 'd1000001', 'A die can have at most 1,000,000 faces.', 1, 7);
    E('fractional faces', 'd6.5', "A die's faces must be a whole number, got 6.5.", 1, 3);
    E('fractional faces from a formula', 'd(6.5)', "A die's faces must be a whole number, got 6.5.", 2, 3);
    E('1001 dice', '1001d6', 'This formula would roll more than 1,000 dice.', 0, 6);
    check('the pool cap is checked before the second term draws', (() => { const rnd = counting(seeded(1)); const r = ev('600d6 + 600d6', { random: rnd }); return !r.ok && r.error.message === 'This formula would roll more than 1,000 dice.' && r.error.pos === 8 && rnd.calls === 600; })());
    check('500d2! never errors', (() => { for (let s = 1; s <= 20; s++) { const r = ev('500d2!', { random: seeded(s) }); if (!r.ok) return false; } return true; })());
    E('keep too many', '3d6kh5', 'Cannot keep 5 dice of 3.', 3, 3);
    E('keep zero', '3d6kh0', 'Cannot keep 0 dice of 3.', 3, 3);
    E('drop everything', '3d6dh3', 'Cannot drop 3 dice of 3 (nothing would be left).', 3, 3);
    E('d1 cannot explode', 'd1!', 'd1 cannot explode (every roll is its highest face).', 2, 1);
    E('fudge dice cannot explode', '4dF!', 'Fudge dice cannot explode.', 3, 1);
    E('rr forever on d6', 'd6rr<=6', 'rr<=6 would reroll a d6 forever.', 2, 5);
    E('rr forever on dF', '4dFrr>=-1', 'rr>=-1 would reroll a dF forever.', 3, 6);
    E('rr forever with =', 'd1rr=1', 'rr=1 would reroll a d1 forever.', 2, 4);
    check('rr forever is only an error once the faces are known', (() => { const r = ev('d(Faces)rr<=6', { vars: { Faces: 8 }, random: scripted([7]) }); return r.ok && r.value === 7; })());
    E('bad random value', 'd6', 'The random source returned 7 for a 6-sided die.', 0, 2, { random: scripted([7]) });
    E('bad random value on a fudge die', 'dF', 'The random source returned 0 for a fudge die.', 0, 2, { random: scripted([0]) });

    /* ---- group 5: checks ---- */
    check('2d20kh1 + 5 >= 16', txt('2d20kh1 + 5 >= 16', [7, 14]) === '2d20kh1 [(7), 14] + 5 = 19 >= 16: success by 3');
    check('3d6 <= 13', txt('3d6 <= 13', [4, 2, 5]) === '3d6 [4, 2, 5] = 11 <= 13: success by 2');
    check('13 >= 3d6 (dice on the right)', txt('13 >= 3d6', [4, 2, 5]) === '13 >= 3d6 [4, 2, 5] = 11: success by 2');
    check('dice on both sides', txt('d20 + 5 >= d20 + 3', [14, 3]) === 'd20 [14] + 5 = 19 >= d20 [3] + 3 = 6: success by 13');
    check('failure by', txt('d20 >= 16', [10]) === 'd20 [10] = 10 >= 16: failure by 6');
    check('failure by 0 on >', txt('d20 > 10', [10]) === 'd20 [10] = 10 > 10: failure by 0');
    check('success by 0 on >=', txt('d20 >= 10', [10]) === 'd20 [10] = 10 >= 10: success by 0');
    check('equality checks have no margin in the text', txt('d6 = 3', [3]) === 'd6 [3] = 3 = 3: success');
    check('3d6 <= Skill.Stealth', txt('3d6 <= Skill.Stealth', [4, 2, 5], { vars: { Skill: { Stealth: 13 } } }) === '3d6 [4, 2, 5] = 11 <= Skill.Stealth (13): success by 2');
    check('check record', (() => { const r = ev('2d20kh1 + 5 >= 16', { random: scripted([7, 14]) }); return r.ok && r.value === true && j(r.breakdown.checks) === j([{ left: 19, op: '>=', right: 16, pass: true, margin: 3, top: true }]) && r.breakdown.summary === '19 >= 16: success by 3'; })());
    check('a comparison with no dice records no check', (() => { const r = ev('1 < 2'); return r.ok && r.breakdown.checks.length === 0 && r.breakdown.text === '1 < 2 = true' && r.breakdown.summary === '= true'; })());
    check('nested check inside if', txt('if(d20 + 5 >= 16, 2d6, 0)', [14, 3, 5]) === 'if(d20 [14] + 5 >= 16 ✓, 2d6 [3, 5], 0) = 8');
    check('nested check under not', txt('not d20 >= 10', [4]) === 'not d20 [4] >= 10 ✗ = true');
    check('two checks under and', (() => { const r = ev('d20 >= 10 and d6 >= 3', { random: scripted([12, 2]) }); return r.ok && r.value === false && r.breakdown.checks.length === 2 && r.breakdown.text === 'd20 [12] >= 10 ✓ and d6 [2] >= 3 ✗ = false'; })());
    check('a check in an unevaluated branch is not recorded', (() => { const r = ev('if(0, d20 >= 10, 1)', { random: throwing() }); return r.ok && r.value === 1 && r.breakdown.checks.length === 0; })());
    check('the top check marks the summary', ev('13 >= 3d6', { random: scripted([4, 2, 5]) }).breakdown.summary === '13 >= 11: success by 2');

    /* ---- group 6: names ---- */
    check('object lookup is case-insensitive', val('str', { vars: { STR: 12 } }) === 12 && val('Str', { vars: { STR: 12 } }) === 12);
    check('flat dotted keys', val('Skill.Stealth', { vars: { 'Skill.Stealth': 12 } }) === 12);
    check('path lookup with case-insensitive segments', val('Skill.Stealth', { vars: { skill: { stealth: 12 } } }) === 12);
    check('own keys only', (() => { const r1 = ev('constructor', { vars: {} }), r2 = ev('__proto__', { vars: {} }); return !r1.ok && /Unknown name/.test(r1.error.message) && !r2.ok && /Unknown name/.test(r2.error.message); })());
    check('constructor and __proto__ are ordinary names', val('constructor + __proto__', { vars: { constructor: 1, __proto__: 2 } }) === 3 || val('constructor', { vars: { constructor: 1 } }) === 1);
    check('constructor( is an unknown function, not a prototype hit', (() => { const r = ev('constructor(1)'); return !r.ok && /Unknown function/.test(r.error.message); })());
    check('names() lists constructor', j(F.names('constructor + 1')) === j(['constructor']));
    check('function resolver receives the lower-cased name and the spelling', (() => { let got = null; const r = ev('Skill.Stealth', { vars: (name, asWritten) => { got = [name, asWritten]; return 5; } }); return r.ok && r.value === 5 && j(got) === j(['skill.stealth', 'Skill.Stealth']); })());
    check('boolean values resolve', val('Rage', { vars: { Rage: true } }) === true);
    check('names with values in the breakdown', (() => { const r = ev('d20 + Skill.Stealth', { random: scripted([14]), vars: { Skill: { Stealth: 12 } } }); return r.ok && r.breakdown.text === 'd20 [14] + Skill.Stealth (12) = 26' && j(r.breakdown.names) === j([{ name: 'Skill.Stealth', value: 12 }]); })());
    check('unevaluated names carry no value in the text', txt('if(1, 5, STR)', [], { vars: { STR: 1 } }) === 'if(1, 5, STR) = 5');
    E('unknown name with suggestion from knownNames', 'Stealt', 'Unknown name "Stealt" — did you mean "Stealth"?', 0, 6, { knownNames: ['Stealth', 'STR'] });
    E('unknown name with suggestion from the vars object', 'Skill.Stealt', 'Unknown name "Skill.Stealt" — did you mean "Skill.Stealth"?', 0, 12, { vars: { Skill: { Stealth: 12 } } });
    E('unknown name without suggestion', 'zzz', 'Unknown name "zzz".', 0, 3, { vars: { STR: 1 } });
    E('unknown name with no vars at all', 'STR', 'Unknown name "STR".', 0, 3);
    E('text value', 'x', '"x" is text, not a number.', 0, 1, { vars: { x: 'a' } });
    E('object value', 'x', '"x" is not a number.', 0, 1, { vars: { x: {} } });
    E('null value', 'x', '"x" is not a number.', 0, 1, { vars: { x: null } });
    E('resolver error is prefixed with the name', 'Skill.Stealth + 1', 'Skill.Stealth: Division by zero.', 0, 13, { vars: () => ({ error: { message: 'Division by zero.', pos: 4, len: 1 } }) });
    const defs = { a: 'b + 1', b: 'a + 1', c: '2 * 3', d: 'c + c' };
    for (let k = 0; k <= 70; k++) defs['lvl' + k] = k < 70 ? 'lvl' + (k + 1) + ' + 1' : '1';
    function resolver(depth, stack) {
        return (name) => {
            const def = defs[name]; if (def === undefined) return undefined;
            const r = F.evaluate(def, { vars: resolver(depth + 1, stack.concat(name)), depth: depth + 1, stack: stack.concat(name) });
            return r.ok ? r.value : { error: r.error };
        };
    }
    check('nested definitions evaluate', val('d + 1', { vars: resolver(0, []) }) === 13);
    E('a loop between definitions', 'a', 'Formulas refer to each other in a loop: a → b → a.', 0, 1, { vars: resolver(0, []) });
    E('definitions nested too deeply', 'lvl0', 'Formulas refer to each other too deeply (over 64 levels).', 0, 4, { vars: resolver(0, []) });
    check('the loop check uses the stack passed in', (() => { const r = ev('x', { stack: ['X'], vars: { x: 1 } }); return !r.ok && r.error.message === 'Formulas refer to each other in a loop: x → x.'; })());
    check('depth 64 is allowed, 65 is not', ev('1', { depth: 64 }).ok && !ev('1', { depth: 65 }).ok);

    /* ---- group 7: fuzz ---- */
    {
        const alphabet = ['d', '6', '2', '0', '1', '+', '-', '*', '/', '^', '(', ')', ',', 'kh', 'kl', 'dh', 'dl', 'r', 'rr', 'cs', '!', '=', '<', '>', ' ', '.', 'x', 'F', '%', 'and', 'or', 'not', 'if(', 'max(', 'STR', 'true', 'd%', '3d6', '!=', '<=', '>=', '≥'];
        const rnd = seeded(20260918);
        const pick = () => alphabet[rnd(alphabet.length) - 1];
        const goldens = ['d20 + 5', '4d6kh3', '2d20kh1 + 5 >= 16', '10d6cs>=5', '2d6! + 3', 'if(d20 + 5 >= 16, 2d6, 0)', '(Level)d(Weapon.Die)', 'floor((STR - 10) / 2)', 'not 1 = 0 and 1', '4dFcs<=-1'];
        let bad = null, cases = 0, exceeded = 0;
        for (let n = 0; n < 2000 && !bad; n++) {
            const len = rnd(30); let s = '';
            for (let k = 0; k < len; k++) s += pick();
            cases++;
            try { const r = F.evaluate(s, { random: seeded(n), vars: { STR: 10, Level: 2, Weapon: { Die: 6 } } }); if (!r || typeof r.ok !== 'boolean') bad = s; else if (r.ok && r.diceRolled > 1000) exceeded++; }
            catch (e) { bad = s + ' -> threw ' + e.message; }
        }
        for (let n = 0; n < 200 && !bad; n++) {
            let s = goldens[rnd(goldens.length) - 1]; const at = rnd(s.length + 1) - 1;
            s = rnd(2) === 1 ? s.slice(0, at) + s.slice(at + 1) : s.slice(0, at) + pick() + s.slice(at);
            cases++;
            try { const r = F.evaluate(s, { random: seeded(n), vars: { STR: 10, Level: 2, Weapon: { Die: 6 } } }); if (!r || typeof r.ok !== 'boolean') bad = s; }
            catch (e) { bad = s + ' -> threw ' + e.message; }
        }
        check('fuzz: ' + cases + ' cases return { ok } and never throw (seed 20260918)', !bad && !exceeded, bad || ('pool cap exceeded ' + exceeded + ' times'));
    }

    /* ---- group 8: determinism and replay ---- */
    check('same seed, same result', (() => { const a = ev('4d6kh3 + 2d20! + d%', { random: seeded(42) }), b = ev('4d6kh3 + 2d20! + d%', { random: seeded(42) }); return a.ok && b.ok && a.value === b.value && a.breakdown.text === b.breakdown.text && j(a.draws) === j(b.draws); })());
    check('a formula without dice evaluates without a random source', (() => { const r = ev('floor((15 - 10) / 2)', { random: throwing() }); return r.ok && r.value === 2 && r.breakdown.text === 'floor((15 - 10) / 2) = 2' && r.draws.length === 0; })());
    const replayCases = [['4d6kh3', [6, 4, 3, 1]], ['2d6r1!', [1, 6, 2, 4]], ['10d10!cs>=8', [10, 3, 7, 8, 2, 1, 9, 10, 10, 1, 5, 6, 4]], ['4dF', [3, 1, 2, 3]], ['if(d20 + 5 >= 16, 2d6, 0)', [14, 3, 5]]];
    check('fromDraws replays every golden exactly', replayCases.every(([text, draws]) => { const a = ev(text, { random: scripted(draws) }), b = ev(text, { random: F.fromDraws(a.draws) }); return a.ok && b.ok && a.breakdown.text === b.breakdown.text && a.value === b.value && j(a.draws) === j(b.draws); }));
    E('replay with too many draws', 'd20', 'The stored roll does not match this formula.', 0, 0, { random: F.fromDraws([14, 3]) });
    E('replay with too few draws', '2d20', 'The stored roll does not match this formula.', 0, 0, { random: F.fromDraws([14]) });
    E('replay with an out-of-range draw', 'd20', 'The stored roll does not match this formula.', 0, 0, { random: F.fromDraws([25]) });
    check('evaluateAst reuses a parsed formula', (() => { const p = F.parse('d20 + STR'); const r = F.evaluateAst(p.ast, { random: scripted([14]), vars: { STR: 3 } }); return p.ok && r.ok && r.value === 17 && r.breakdown.text === 'd20 [14] + STR (3) = 17'; })());
    check('evaluateAst on a hand-built object reports the internal error', (() => { const r = F.evaluateAst({}); return !r.ok && r.error.message === 'The formula could not be evaluated.'; })());
    check('evaluate on a non-string', (() => { const r = ev(42); return r.ok && r.value === 42; })());

    /* ---- group 9: describe ---- */
    check('-2^2 renders', txt('-2^2') === '-2 ^ 2 = 4');
    check('if(1, 2d6, d6) shows the unevaluated branch without dice', txt('if(1, 2d6, d6)', [3, 5]) === 'if(1, 2d6 [3, 5], d6) = 8');
    check('numbers print up to four decimals', txt('1 / 3') === '1 / 3 = 0.3333' && txt('2.50 + 0.5') === '2.5 + 0.5 = 3');
    check('a negated sum is parenthesised', txt('-(1 + 2)') === '-(1 + 2) = -3');
    check('describe() returns the text', (() => { const r = ev('d20 + 5', { random: scripted([14]) }); return F.describe(r) === r.breakdown.text && F.describe({ ok: false }) === ''; })());
    {
        const r = ev('100d6', { random: seeded(7) });
        const full = F.describe(r), d300 = F.describe(r, { maxChars: 300 }), d100 = F.describe(r, { maxChars: 100 }), d60 = F.describe(r, { maxChars: 60 }), d20 = F.describe(r, { maxChars: 20 }), d8 = F.describe(r, { maxChars: 8 });
        check('40 dice shown, then the count of the rest', /, … \(60 more\)\] = \d+$/.test(full) && r.breakdown.text === full);
        check('a maxChars the full line fits in returns it unchanged', d300 === full);
        check('maxChars 100 shrinks the die list and keeps the total', d100.length <= 100 && d100.endsWith(' = ' + r.value) && d100.length < full.length);
        check('maxChars 60 shrinks further', d60.length <= 60 && d60.endsWith(' = ' + r.value) && d60.length < d100.length);
        check('maxChars 20 keeps the formula with an empty die list', d20 === '100d6 […] = ' + r.value);
        check('maxChars 8 falls back to the summary', d8 === r.breakdown.summary && d8 === '= ' + r.value);
    }
    check('describe respects maxChars for a check', (() => { const r = ev('20d6 >= 60', { random: seeded(3) }); const s = F.describe(r, { maxChars: 40 }); return s.length <= 40 && /(success|failure)/.test(s); })());

    /* ---- group 10: the default random source ---- */
    check('default random stays in range over 2000 draws', (() => { for (let n = 0; n < 2000; n++) { const r = ev('d6'); if (!r.ok || r.value < 1 || r.value > 6 || !Number.isInteger(r.value)) return false; } return true; })());
    check('default random rolls big dice', (() => { const r = ev('d1000000'); return r.ok && r.value >= 1 && r.value <= 1000000; })());
    {
        const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
        let removed = false;
        try { Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true }); removed = typeof globalThis.crypto === 'undefined'; } catch (e) {}
        const r = removed ? ev('d6 + 1000d6') : null;
        if (desc) Object.defineProperty(globalThis, 'crypto', desc);
        check('without crypto the default random source reports an error', removed && r && !r.ok && r.error.message === 'No random source is available here.', removed ? (r && j(r.error)) : 'could not remove crypto');
        check('crypto restored', typeof globalThis.crypto === 'object');
    }

    /* ---- group 11b: publication under a window ---- */
    global.window = {};
    const F2 = await import(url + '?x');
    check('window.wpFormula is published by a fresh module instance', !!global.window.wpFormula && global.window.wpFormula.evaluate === F2.evaluate && global.window.wpFormula.describe === F2.describe);
    delete global.window;

    const ms = Date.now() - t0;
    check('the whole run stays under 2 seconds (' + ms + ' ms)', ms < 2000);
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      harness error ->', e && e.stack || e); process.exit(1); });
