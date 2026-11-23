/* Offline check of formulas as forms (1.6.2; the owner, 2026-11-02: "we shouldnt be using code expressions on the user side", by prompt "Forms for
   every formula", "A. Steps" and "A small As text link"). The pure half (formcore.js) is imported and run: a formula read into steps and written
   back rolls and reads as it did, over a fixed list, a seeded corpus and every formula of the starters, and says what it does in words. The form
   (formbox.js) is run on tools/boxdom.js, a page that refuses markup: a box dressed with its value and its class kept, a form opened and left that
   writes nothing, a step that writes the box and says so. The wiring is pinned. No browser, no network.
   Usage: node tools/formcheck.js   (exit 1 on any failure) */
'use strict';
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const root = path.join(__dirname, '..'), app = path.join(root, 'system', 'app');
const readU = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + detail : '')); } }
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).split(String.fromCharCode(92)).join('/');

(async () => {
    const { makeDom } = require('./boxdom.js');
    const dom = makeDom();
    global.document = dom.document || dom.doc; global.window = dom.window || { innerHeight: 700, innerWidth: 1000 };
    const F = await import(url('formula.js')), C = await import(url('formcore.js')), B = await import(url('formbox.js'));
    const names = { str: 3, might: 13, agility: 12, 'agility.max': 14, skill: 11, 'row.lvl': 2, level: 4 };
    const vars = n => { const v = names[String(n).toLowerCase()]; return v === undefined ? 0 : v; };
    const seeded = seed => { let s = seed >>> 0; return faces => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return 1 + Math.floor(s / 4294967296 * faces); }; };   // the engine asks a die of that many faces
    const ev = (t, seed) => { const r = F.evaluate(t, { vars, random: seeded(seed) }); return r.ok ? r.value + '|' + r.draws.join(',') : 'ERR ' + r.error.message; };
    const same = (a, b) => { for (let s = 1; s <= 6; s++) if (ev(a, s * 977) !== ev(b, s * 977)) return false; return true; };
    const trip = t => { const r = C.read(t); if (!r.ok) return !F.parse(t).ok; const w = C.write(r.form), r2 = C.read(w); return same(t, w) && r2.ok && C.write(r2.form) === w; };

    /* ================= read and write ================= */
    const fixed = ['1', '-1', '2 + 3 * 4', '(2 + 3) * 4', '2 * (3 + 4) * 5', 'a - (b - c)', 'a / (b / c)', 'floor((Agility.max + Might) / 4)', '2 ^ 3 ^ 2', '2 ^ (3 ^ 2)', '-(2 + 3)', '-2 ^ 2', '(-2) ^ 2', '--true', '3d6', 'd20', '4d6kh3', '4d6dl', '3d6 <= Skill', 'd20 + 5 >= 10', '(Level)d6', 'd(Skill)', '(Level + 1)d6kh(Str)', '6d10!!cs>=8', '6d10!!>=9', '2d6r1', '2d6rr<=2', '3dF', 'd%', '5d10@p', 'with(5d10@p, high(p))', 'with(6d10@p, high(p) + count(p >= 7))', 'with(2d10@c, 1d6 + 3 >= high(c))', 'if(Str > 2 and Might < 3, Skill / 2, 0)', 'max(1, Str)', 'min(Str, 3)', 'max(1, 2, 3)', 'clamp(Str, 1, 2)', 'round(Str / 3, 2)', 'mod(7, 2)', 'Str >= 3 or Might < 2 and Skill = 11', '(Str >= 3 or Might < 2) and Skill = 11', 'not not Str', 'not true and false', '(Str > 1) + 1', 'and(Str, Might)', 'has(Str, 1)', 'digit(123, 2)', '(2 >= 1) >= 1', 'if(Str, 1, 2) + 3', '1 + if(Str, 1, 2)'];
    const badF = fixed.filter(t => !trip(t));
    check('a formula read into steps and written back rolls and reads as it did, and a second pass changes nothing: arithmetic and its brackets, dice with every modifier, dice read twice, tests, and a plus sign that turns a yes or no into a number', badF.length === 0, j(badF));
    const R0 = seeded(12345), R = () => (R0(1000000) - 1) / 1000000, pick = a => a[Math.floor(R() * a.length)];
    const gen = d => { const x = R(); if (d <= 0 || x < .25) return pick(['1', '2', '7', '0', '2.5', 'Str', 'Might', 'Skill', 'Agility.max', '1d6', '2d4', '3d6kh2', 'd20', '(Str)d6', 'true', 'false']); if (x < .55) return gen(d - 1) + ' ' + pick(['+', '-', '*', '/', '^']) + ' ' + gen(d - 1); if (x < .65) return '(' + gen(d - 1) + ')'; if (x < .72) return '-' + gen(d - 1); if (x < .80) return gen(d - 1) + ' ' + pick(['>=', '<=', '<', '>', '=', '!=']) + ' ' + gen(d - 1); if (x < .86) return gen(d - 1) + pick([' and ', ' or ']) + gen(d - 1); if (x < .89) return 'not ' + gen(d - 1); return pick(['floor', 'ceil', 'abs', 'round', 'trunc']) + '(' + gen(d - 1) + ')'; };
    let nS = 0, badS = [];
    for (let i = 0; i < 6000 && badS.length < 5; i++) { const t = gen(4); if (F.parse(t).ok) { nS++; if (!trip(t)) badS.push(t); } }
    check('the same over ' + nS + ' seeded formulas', badS.length === 0 && nS > 4000, j(badS));
    const condBad = fixed.concat(['Str', '1', 'not (Str = 3)']).filter(t => { const k = C.readCond(t); return !k.ok ? F.parse(t).ok : !same(t, C.writeCond(k.cond)); });
    check('the same read as a yes or no', condBad.length === 0, j(condBad));
    const strs = (o, out) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach(x => strs(x, out)); else if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (/^(formula|maxFormula|base|needs|if|roll|malf|dmg\d?|damage|has|spent|auto|when|value)$/.test(k) && typeof o[k] === 'string') out.push(o[k]); else strs(o[k], out); }); return out; };
    const sysFiles = ['d20.json'].map(n => path.join(app, 'assets', 'systems', n)).concat(['starter-3d6.json'].map(n => path.join(__dirname, 'fixtures', n))).filter(p => fs.existsSync(p));
    let nSys = 0; const badSys = [];
    sysFiles.forEach(p => strs(JSON.parse(fs.readFileSync(p, 'utf8')), []).forEach(t => { if (!t || !F.parse(t).ok) return; nSys++; if (!trip(t)) badSys.push(t); }));
    check('every formula of the starters (' + nSys + ') opens and comes back the same', badSys.length === 0 && nSys > 10, j(badSys.slice(0, 5)));
    check('a formula that does not parse opens nothing, and says why', C.read('2 +').ok === false && typeof C.read('2 +').error.message === 'string' && C.readCond('(').ok === false);

    /* ================= in words ================= */
    const sayT = t => C.says(C.read(t).form, { name: s => ({ 'agility.max': 'Agility at its most', might: 'Might', skill: 'Skill' })[s.toLowerCase()] || '' });
    // 1.6.3 (finding 20, a pin moved on purpose): a divide after a plus is joined with ', then', so the words never read as if it bound tighter
    check('a form says what it does in words, and no code', sayT('floor((Agility.max + Might) / 4)') === 'Agility at its most plus Might, then divided by 4, rounded down' && sayT('3d6 + 2 <= Skill') === '3d6 plus 2, a success if it is at most Skill' && sayT('4d6kh3') === '4d6, keeping the highest 3' && sayT('6d10!!cs>=8') === '6d10, each exploding into a die of its own, counting 8 or more as a success' && sayT('max(1, Might)') === 'Might, at least 1' && sayT('clamp(Might, 1, 5)') === 'Might, held between 1 and 5' && !/[(){}@]|\bmax\b|\bfloor\b/.test(sayT('floor(max(Might, 1))')), sayT('floor((Agility.max + Might) / 4)'));
    check('1.6.2 log(x, base) is a step of the form, Logarithm, base, that opens and comes back the same and says its base in words', trip('log(Size / 6, 2) * 400') && sayT('log(Might, 2)') === 'Might, its logarithm to the base 2', j(C.says(C.read('log(Might, 2)').form, {})));
    check('a yes or no says it too', C.saysCond(C.readCond('HP < 3 and Str >= 2').cond, {}) === 'HP is under 3, and Str is at least 2' && C.saysCond(C.readCond('HP < 3 or Str').cond, {}) === 'HP is under 3, or Str' && C.saysCond(C.readCond('not (Str = 3)').cond, {}) === 'not (Str is 3)');
    check('dice read twice say what is read', sayT('with(6d10@p, high(p) + count(p >= 7))') === 'roll 6d10, then read the highest of the dice plus how many reach 7');

    /* ================= the form, on a page that refuses markup ================= */
    const doc = global.document, modal = doc.createElement('div'); modal.id = 'systemModal'; (doc.body || dom.body).appendChild(modal);
    const row = doc.createElement('div'); row.className = 'sys-row'; row.dataset.id = 'f_a'; modal.appendChild(row);
    const inp = doc.createElement('input'); inp.type = 'text'; inp.className = 'sys-formula field'; inp.value = 'floor((Agility.max + Might) / 4)'; row.appendChild(inp);
    const evil = doc.createElement('input'); evil.type = 'text'; evil.className = 'sys-apply-if'; evil.value = '<img src=x onerror=1>'; row.appendChild(evil);
    const other = doc.createElement('input'); other.type = 'text'; other.className = 'sys-label field'; other.value = 'Dodge'; row.appendChild(other);
    B.setSource(() => ({ groups: [{ name: 'This character', items: [{ label: 'Might', s: 'Might' }, { label: 'Agility', s: 'Agility' }] }], word: s => (s === 'Might' ? 'Might' : '') }));
    const n = B.sweep(modal), wrap = inp.parentNode;
    check('a sweep dresses the boxes the table names and no other: the box stays in its row, hidden, with its class and its value, and a second sweep does nothing', n === 2 && wrap.classList.contains('fb') && inp.hidden === true && inp.className === 'sys-formula field' && inp.value === 'floor((Agility.max + Might) / 4)' && other.hidden === false && !other.parentNode.classList.contains('fb') && B.sweep(modal) === 0);
    const lineT = wrap.querySelector('.fb-say').textContent;
    check('the shut line says it in words', /rounded down/.test(lineT) && !/floor/.test(lineT), lineT);
    const evW = evil.parentNode.querySelector('.fb-say');
    // 1.6.3 (finding 27, a pin moved on purpose): a box the form cannot read shows one fixed line, never its raw text
    check('a value that is no formula is marked, and its line says it was set by hand, never its own text, and nothing of it is markup', evW.textContent === 'Set by hand. Open As text to see or change it.' && evil.parentNode.querySelector('.fb-line').classList.contains('fb-bad') && evil.value === '<img src=x onerror=1>');
    check('a roll on the Rolls tab is a roll, a field is a figure', B.kindOf(inp) === 'amt' && (() => { const r = doc.createElement('div'); r.className = 'sys-row'; r.dataset.id = 'r_a'; const i = doc.createElement('input'); i.className = 'sys-formula'; r.appendChild(i); return B.kindOf(i) === 'roll'; })());
    const go = wrap.querySelector('.fb-go'), calls = inp.calls;
    go.click ? go.click() : go.handlers.click.forEach(h => h({ preventDefault() {} }));
    const body = wrap.querySelector('.fb-open');
    check('Change opens the steps in the row', !!body && wrap.querySelector('.fb-go').hidden === true && !wrap.querySelector('.fb-line').hidden && body.querySelectorAll('.fb-step').length === 4, body && body.querySelectorAll('.fb-step').length);
    const press = e => e.click ? e.click() : (e.handlers.click || []).forEach(h => h({ preventDefault() {}, target: e }));
    press(body.querySelector('.fb-done'));
    check('opened and left, it writes nothing and says nothing', inp.value === 'floor((Agility.max + Might) / 4)' && !inp.calls.some(c => /dispatch/.test(c)), j(inp.calls));
    press(wrap.querySelector('.fb-go')); const b2 = wrap.querySelector('.fb-open');
    press(b2.querySelector('.fb-add'));
    check('a step writes the box and says so, and the box still parses', inp.value === 'floor((Agility.max + Might) / 4) + 0' && inp.calls.some(c => c === 'dispatch input') && F.parse(inp.value).ok, inp.value);
    press(wrap.querySelector('.fb-cancel'));
    check('1.6.3 (finding 20) a summary that holds the order says it with then, and a long line is cut at a word, says Change shows the rest, and keeps the whole as its tooltip', sayT('floor((Might - 10) / 2)') === 'Might minus 10, then divided by 2, rounded down' && sayT('Might - 10 / 2') === 'Might minus (10 divided by 2)' && (() => { const r = doc.createElement('div'); r.className = 'sys-row'; r.dataset.id = 'f_long'; modal.appendChild(r); const i = doc.createElement('input'); i.type = 'text'; i.className = 'sys-formula field'; i.value = Array.from({ length: 40 }, (_, k) => 'Might + ' + k).join(' + '); r.appendChild(i); B.sweep(modal); const s = i.parentNode.querySelector('.fb-say'); return s.textContent.length < 220 && /Change shows the rest\.$/.test(s.textContent) && s.dataset.tip && s.dataset.tip.length > 300; })());
    check('Cancel puts it back and says so', inp.value === 'floor((Agility.max + Might) / 4)', inp.value);
    // 1.6.3 (the review of the System editor, finding 13): Escape in a form is Cancel, as Escape is never mind everywhere else in the app
    {   press(wrap.querySelector('.fb-go')); const bE = wrap.querySelector('.fb-open'); press(bE.querySelector('.fb-add')); const stepped = inp.value;
        let stopE = false; (bE.handlers.keydown || []).forEach(h => h({ key: 'Escape', target: bE, preventDefault() {}, stopPropagation() { stopE = true; } }));
        check('1.6.3 Escape in a form puts the box back as it was, as Cancel does, and goes no further', stepped !== 'floor((Agility.max + Might) / 4)' && inp.value === 'floor((Agility.max + Might) / 4)' && stopE && !wrap.querySelector('.fb-open'), j([stepped, inp.value, stopE])); }
    // 1.6.3 (finding 19): a blow's third to fifth parts and their armor divisors are forms, as the second part is
    check('1.6.3 the third to fifth damage parts and their divisors wear the form', ['sys-roll-p3f', 'sys-roll-p5f', 'sys-list-rollp4f', 'sys-list-rollp3d'].every(c => { const i = doc.createElement('input'); i.className = c + ' field'; return B.kindOf(i) === (/d$/.test(c) ? 'amt' : 'dice'); }));
    const mr = B.menuRows('mig', { groups: [{ name: 'This character', items: [{ label: 'Might', s: 'Might' }, { label: 'Agility', s: 'Agility' }] }] }, false), mr2 = B.menuRows('', { groups: [] }, true), mr3 = B.menuRows('', { groups: [] }, false);
    check('the value list is found by its words, shows nothing a box cannot read, and offers dice only where a box takes them', mr[0].items.length === 1 && mr[0].items[0].s === 'Might' && mr2[0].items.some(i => i.kind === 'dice') && !mr3[0].items.some(i => i.kind === 'dice'));
    check('what a pick makes', j(B.menuPick({ s: 'Might' })) === j({ k: 'name', s: 'Might' }) && B.menuPick({ kind: 'num' }).k === 'num' && B.menuPick({ kind: 'dice' }).k === 'dice' && C.write({ steps: [{ op: 'start', v: B.menuPick({ kind: 'dice' }) }] }) === '1d6');

    /* ================= what a roll is for, and what it does ================= */
    const who = { who: 'Kael', vars: n => ({ dodge: 12, attemptmargin: 3, might: 2 })[String(n).toLowerCase()] || 0 }, tr = t => C.tryRoll(C.read(t).form, who);
    check('a roll has a kind by its shape, and what it cannot show stays as steps', ['3d6 <= 9', '2d6 + 3', '6d10cs>=8', '6d10cs>=8 >= 2', 'with(6d10@p, high(p))', 'floor(Might)', '5d10@p'].map(t => C.rollFace(C.read(t).form).kind).join() === 'beat,total,hits,hits,read,else,else');
    check('what a roll does for one character, in a sentence, with the odds worked out exactly on plain dice', tr('3d6 <= Dodge - AttemptMargin') === 'Kael rolls 3d6 and needs 9 or less. That works about 38 times in 100.' && tr('d20 + Might >= 15') === 'Kael rolls 1d20 and adds 2, and needs a total of 15 or more. That works about 40 times in 100.' && tr('2d6 + 3') === 'Kael rolls 2d6 and adds 3. That gives 5 to 15, about 10.' && tr('3d6 >= 19') === 'Kael rolls 3d6 and needs 19 or more. That almost never works.' && tr('3d6 >= 3') === 'Kael rolls 3d6 and needs 3 or more. That almost always works.', j([tr('3d6 <= Dodge - AttemptMargin'), tr('d20 + Might >= 15'), tr('3d6 >= 19')]));
    check('dice with rules are sampled, and a figure of the sheet reads as a number', /^Kael rolls 4d6, keeping the highest 3\. That gives about 12(\.\d)?\.$/.test(tr('4d6kh3')) && /^Kael rolls 2d6\. That gives about \d(\.\d)?\.$/.test(tr('(Might)d6')) && /^Kael rolls 6d10\. Each die at 8 or more is a hit\. That makes about 1\.\d hits\.$/.test(tr('6d10cs>=8')) && /^Kael rolls 6d10 and needs 2 or more hits\. Each die at 8 or more is a hit\. That works about \d+ times in 100\.$/.test(tr('6d10cs>=8 >= 2')) && /times in 100\.$/.test(tr('with(6d10@p, high(p) >= 9)')), j([tr('4d6kh3'), tr('(Might)d6'), tr('6d10cs>=8 >= 2')]));
    check('a test and a figure say what they are for this character', C.tryValue('Might >= 1', Object.assign({ cond: true }, who)) === 'For Kael this holds now.' && C.tryValue('Might >= 9', Object.assign({ cond: true }, who)) === 'For Kael this does not hold now.' && C.tryValue('Dodge - 1', who) === 'For Kael this comes to 11.', C.tryValue('Dodge - 1', who));
    const rl = t => C.rollFace(C.read(t).form), okR = t => rl(t).kind === 'read', RB = 'with(6d10@p, high(p) + count(p >= 7))';
    check('Read the dice: one handful read by lines; anything else around it stays as steps', okR(RB) && okR('with(3d6@x, low(x) - total(x))') && okR('with(5d10@p, nth(p, 2) + best(p, 2) - worst(p, 2) + sets(p) + pairs(p))') && !okR('with(6d10@p, high(p) + 1)') && !okR('with(6d10@p, 2d6@q, high(p))') && !okR('with(6d10@p, high(q))') && !okR('with(6d10, 1)') && !okR('with(6d10@p, high(p)) + 1') && !okR('with(6d10@p, high(p)) >= 3') && !okR('with(6d10@p, count(p))'));
    check('each line reads back and writes as it was', ['high', 'low', 'sets', 'pairs', 'total'].every(h => C.write({ steps: [{ op: 'start', v: C.readMake(h, 'p') }] }) === h + '(p)') && C.write({ steps: [{ op: 'start', v: C.readMake('count', 'p', '>=', { k: 'num', v: 7, s: '7' }) }] }) === 'count(p >= 7)' && C.write({ steps: [{ op: 'start', v: C.readMake('best', 'p', null, { k: 'num', v: 2, s: '2' }) }] }) === 'best(p, 2)' && j(Object.keys(C.readLine(rl(RB).lines.steps[1].v, 'p')).sort()) === j(['how', 'n', 'op']));
    check('it says what it does, with no name of the dice in it, and Try it works it out', C.says(C.read(RB).form, {}) === 'roll 6d10, then read the highest of the dice plus how many reach 7' && /^Kael rolls 6d10\. That gives about 11\.\d\.$/.test(tr(RB)), j([C.says(C.read(RB).form, {}), tr(RB)]));
    const mkRoll = v => { const r = doc.createElement('div'); r.className = 'sys-row'; r.dataset.id = 'r_x'; const i = doc.createElement('input'); i.type = 'text'; i.className = 'sys-formula field'; i.value = v; r.appendChild(i); modal.appendChild(r); B.sweep(modal); return i; };
    const srcT = { groups: [], word: s => ({ dodge: 'Dodge', attemptmargin: 'how far their attempt beat its target' })[String(s).toLowerCase()] || '', subject: 'Dodge', trial: { people: () => [{ id: 'c1', name: 'Kael' }], vars: (id, over) => n => { const l = String(n).toLowerCase(); return over[l] !== undefined ? over[l] : ({ dodge: 12 })[l] || 0; }, asks: t => /AttemptMargin/.test(t) ? [{ s: 'AttemptMargin', word: 'how far their attempt beat its target' }] : [] } };
    B.setSource(() => srcT);
    const openR = i => { press(i.parentNode.querySelector('.fb-go')); return i.parentNode.querySelector('.fb-open'); }, cards = b => Array.from(b.querySelectorAll('.fb-kind')), onCard = b => cards(b).filter(c => c.classList.contains('on')).map(c => c.querySelector('b').textContent).join(), heads = b => Array.from(b.querySelectorAll('.fb-qh')).map(h => h.textContent).join(' | ');
    const iD = mkRoll('3d6 <= Dodge - AttemptMargin'), bD = openR(iD);
    check('a roll opens on what it is for, its kind picked, and asks in plain questions', cards(bD).length === 5 && onCard(bD) === 'Beat a number' && heads(bD) === 'What do they roll? | What must they beat?' && /The dice the Dodge button throws\./.test(bD.textContent) && /Rolling low is good here/.test(bD.textContent) && !/Start with|Add a step/.test(bD.textContent), heads(bD));
    check('Try it says what happens, and asks by a number for what depends on the moment', bD.querySelector('.fb-tryout').textContent === 'Kael rolls 3d6 and needs 12 or less. That works about 74 times in 100.' && /with how far their attempt beat its target/.test(bD.querySelector('.fb-tryline').textContent) && iD.value === '3d6 <= Dodge - AttemptMargin', bD.querySelector('.fb-tryout').textContent);
    const tn = bD.querySelector('.fb-tryline .fb-num'); tn.value = '3'; (tn.handlers && tn.handlers.input || []).forEach(h => h({ target: tn }));
    check('a figure typed into Try it moves the answer and leaves the roll as it was', bD.querySelector('.fb-tryout').textContent === 'Kael rolls 3d6 and needs 9 or less. That works about 38 times in 100.' && iD.value === '3d6 <= Dodge - AttemptMargin', bD.querySelector('.fb-tryout').textContent);
    press(bD.querySelector('.fb-cancel'));
    const iN = mkRoll(''), bN = openR(iN);
    check('a new roll asks what it is for and nothing else', cards(bN).length === 5 && onCard(bN) === '' && !bN.querySelector('.fb-q') && /Pick one to begin\./.test(bN.textContent) && iN.value === '', heads(bN));
    press(cards(bN)[1]);
    check('picking a kind brings its questions, and a total never asks what it must beat', onCard(bN) === 'Get a total' && heads(bN) === 'What do they roll?' && iN.value === '1d20', iN.value);
    press(cards(bN)[0]);
    check('Beat a number adds what to beat', onCard(bN) === 'Beat a number' && iN.value === '1d20 >= 10' && heads(bN) === 'What do they roll? | What must they beat?', iN.value);
    press(cards(bN)[2]);
    check('Count hits asks what a hit is, and takes the number away', onCard(bN) === 'Count hits' && iN.value === '1d20cs>=5' && heads(bN) === 'What do they roll? | What counts as a hit? | How many hits do they need?', iN.value);
    press(cards(bN)[1]);
    check('back to a total, the hits go', iN.value === '1d20' && onCard(bN) === 'Get a total', iN.value);
    press(cards(bN)[4]);
    check('Something else shows the steps', onCard(bN) === 'Something else' && !bN.querySelector('.fb-q') && !!bN.querySelector('.fb-step'), onCard(bN));
    press(bN.querySelector('.fb-cancel'));
    { // 1.6.2 (found building a dice pool by hand): a new roll that counts hits starts on d6; how many dice may be picked from the sheet, said in words; Try it offers a question's own answers
        const iH = mkRoll(''), bH = openR(iH); press(cards(bH)[2]);
        check('a new roll that counts hits starts on six-sided dice, and one that was something else first keeps its own', iH.value === '1d6cs>=5' && onCard(bH) === 'Count hits', iH.value);
        const nb = Array.from(bH.querySelectorAll('.fb-pick')).filter(x => /nb$/.test(x.dataset.p || ''))[0];
        check('beside the count of dice stands a pick, so how many dice may come from the sheet', !!nb && nb.classList.contains('fb-pick') && /from the sheet/.test(nb.dataset.tip || nb.title || ''), nb && (nb.dataset.tip || nb.title));
        press(bH.querySelector('.fb-cancel'));
        const srcH = { groups: [{ name: 'What they answered', items: [{ label: 'Their answer to Which attribute', s: 'Ask.Q1' }] }], word: () => '', subject: 'Action', trial: { people: () => [{ id: 'c1', name: 'Kael' }], vars: (id, over) => n => { const l = String(n).toLowerCase(), ov = over[l]; const v = typeof ov === 'string' ? ov.toLowerCase() : null; if (v) return ({ body: 3, wits: 1 })[v] || 0; return ov !== undefined ? ov : 0; }, asks: t => /Ask.Q1/.test(t) ? [{ s: 'Ask.Q1', word: 'their answer to Which attribute', opts: [['Body', 'Body'], ['Wits', 'Wits']] }] : [] } };
        B.setSource(() => srcH);
        const iP = mkRoll('(Ask.Q1)d6cs>=5'), bP = openR(iP);
        check('a count of dice from the sheet reads as words, never as doubled brackets', /^as many d6 as /.test(iP.parentNode.querySelector('.fb-say').textContent) && iP.parentNode.querySelector('.fb-say').textContent.indexOf('((') < 0 && iP.value === '(Ask.Q1)d6cs>=5', iP.parentNode.querySelector('.fb-say').textContent);
        const ts = bP.querySelectorAll('.fb-tryline select'), tsel = ts[ts.length - 1];
        check('Try it offers a question with answers of its own by those answers, and tries the first', !!tsel && Array.from(tsel.querySelectorAll('option')).map(o => o.textContent).join() === 'Body,Wits' && bP.querySelector('.fb-tryout').textContent.indexOf('3d6') >= 0, bP.querySelector('.fb-tryout').textContent);
        tsel.value = 'Wits'; (tsel.handlers && tsel.handlers.change || []).forEach(h => h({ target: tsel }));
        check('picking another answer tries that one, and leaves the roll as it was', bP.querySelector('.fb-tryout').textContent.indexOf('1d6') >= 0 && iP.value === '(Ask.Q1)d6cs>=5', bP.querySelector('.fb-tryout').textContent);
        press(bP.querySelector('.fb-cancel')); B.setSource(() => srcT);
    }
    const iC = mkRoll('with(6d10@p, high(p) + 1)'), bC = openR(iC);
    check('a roll that does more stays as steps, says so, and its other kinds cannot be pressed', onCard(bC) === 'Something else' && cards(bC).slice(0, 4).every(c => c.disabled === true) && /stays as steps/.test(bC.textContent), onCard(bC));
    press(bC.querySelector('.fb-cancel'));
    const iR = mkRoll('3d6'), bR = openR(iR);
    press(cards(bR)[3]);
    check('picking Read the dice turns the dice into one handful, and asks what is read', onCard(bR) === 'Read the dice' && iR.value === 'with(3d6@p, high(p))' && heads(bR) === 'What do they roll? | What do you read from them?', iR.value);
    press(bR.querySelector('[data-p="rladd"]'));
    check('another reading is added to the same dice', iR.value === 'with(3d6@p, high(p) + count(p >= 7))' && okR(iR.value), iR.value);
    press(cards(bR)[1]);
    check('a total takes the reading away and keeps the dice', iR.value === '3d6', iR.value);
    press(bR.querySelector('.fb-cancel'));
    const iA = mkRoll('2d6 + 3'), bA = openR(iA);
    press(bA.querySelector('[data-p="faadd"]'));
    check('a figure added to a roll writes the box', iA.value === '2d6 + 3 + 0', iA.value);
    press(bA.querySelector('.fb-cancel'));
    const iO = mkRoll('3d6 <= 12'), bO = openR(iO); press(bO.querySelector('.fb-done'));
    check('a roll opened and left writes nothing', iO.value === '3d6 <= 12', iO.value);
    check('a box that is no roll says what it asks', j(B.askOf(Object.assign(doc.createElement('input'), { className: 'sys-roll-needs' }))) === j(['When can they use this?', 'The button grays out at other times.']) || B.askOf({ classList: { contains: c => c === 'sys-roll-needs' } })[0] === 'When can they use this?');

    /* ================= words with figures ================= */
    const ww = ['Attack', 'Attack ({\u00b1Bonus})', '{Might} of {HP.max}', 'Load {Weight|lb}', 'Odd {1 + 2} end', ''];
    check('words and figures read back as they were written', ww.every(s => C.writeWords(C.readWords(s)) === s), j(ww.map(s => C.writeWords(C.readWords(s)))));
    check('words say their figures as the sheet does, and a figure that cannot be read is no form', C.saysWords(C.readWords('Attack ({\u00b1Dodge})'), { name: s => (s === 'Dodge' ? 'Dodge' : '') }) === 'Attack (Dodge)' && C.readWords('Bad {1 +') !== null && C.readWords('Bad {1 + }') === null && j(C.readWords('{+/-Might}').map(p => p.sign)) === j([true]), j(C.readWords('{+/-Might}')));
    B.setSource(() => srcT);
    const mkW = v => { const r = doc.createElement('div'); r.className = 'sys-row'; r.dataset.id = 'f_x'; const i = doc.createElement('input'); i.type = 'text'; i.className = 'sys-caption field'; i.value = v; r.appendChild(i); modal.appendChild(r); B.sweep(modal); return { r, i }; };
    const pw = mkW('Plain words');
    check('plain words stay a box to type in, with a way to add a figure', pw.i.hidden !== true && !pw.i.dataset.fb && !!pw.r.querySelector('.fb-addfig'), j(pw.i.dataset));
    B.sweep(modal);
    check('sweeping again adds no second button', pw.r.querySelectorAll('.fb-addfig').length === 1);
    const fw = mkW('Attack ({\u00b1Dodge})'), fwb = fw.i.parentNode;
    check('words with a figure read in words, and say what the box is', fw.i.hidden === true && fwb.querySelector('.fb-say').textContent === 'Attack (Dodge)' && fwb.querySelector('.fb-lead').textContent === 'What does the line under it say?', fwb.querySelector('.fb-say').textContent);
    press(fwb.querySelector('.fb-go')); const fwo = fwb.querySelector('.fb-open');
    check('open, each piece stands on a line of its own and nothing of a key shows', fwo.querySelectorAll('.fb-words').length === 2 && fwo.querySelectorAll('.fb-pick').length === 1 && fwo.querySelector('.fb-pick').textContent === 'Dodge' && !/\{|\u00b1/.test(fwo.textContent), fwo.textContent.slice(0, 120));
    press(fwo.querySelector('[data-p="wadd"]'));
    check('words added write the box, with the figure kept', fw.i.value === 'Attack ({\u00b1Dodge}) ', fw.i.value);
    const w0 = fwo.querySelectorAll('.fb-words')[0]; w0.value = 'Hit ('; (w0.handlers && w0.handlers.input || []).forEach(h => h({ target: w0 }));
    check('the line above the form follows what is being built', fwb.querySelector('.fb-say').textContent === 'Hit (Dodge)', fwb.querySelector('.fb-say').textContent);
    press(fwo.querySelector('.fb-cancel'));
    check('Cancel puts the words back', fw.i.value === 'Attack ({\u00b1Dodge})', fw.i.value);
    check('Try it reads the words for a character, a sign, a figure and a unit among them', C.tryWords(C.readWords('Attack ({\u00b1Dodge}) of {Dodge|lb}'), who) === 'For Kael it reads: Attack (+12) of 12 lb', C.tryWords(C.readWords('Attack ({\u00b1Dodge}) of {Dodge|lb}'), who));

    /* ================= every name in words ================= */
    const SC = await import(url('systemcore.js'));
    const wf = [{ id: 'f_sm', key: 'STRmod', label: 'STR modifier', kind: 'formula', formula: '1' }, { id: 'f_sk', key: 'Skill.Stealth', label: 'Stealth', kind: 'skill', base: '', def: 0 }, { id: 'f_hp', key: 'HP', label: 'Hit Points', kind: 'resource', maxFormula: '10' }, { id: 'f_t', key: 'Note', kind: 'text' }, { id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', list: { stats: [{ key: 'wt', label: 'Weight' }, { key: 'mat', label: 'Material', kind: 'pick', opts: [{ label: 'Iron', name: 'Iron' }] }], cols: [{ key: 'dr', label: 'DR', formula: '1' }], on: {} } }];
    const ws = { fields: wf, items: [{ id: 'i_a', key: 'axe', name: 'Axe' }], rolls: [] }, nw = (n, sp) => SC.nameWord(ws, n, sp);
    check('a field reads by its label, a key never shows', nw('STRmod') === 'STR modifier' && nw('Skill.Stealth') === 'Stealth' && nw('HP') === 'Hit Points' && nw('HP.max') === 'Hit Points when full' && nw('strmod') === 'STR modifier', j([nw('STRmod'), nw('Skill.Stealth'), nw('HP.max')]));
    check('a name of the app says what it is', nw('AttemptMargin') === 'how far their attempt beat its target' && nw('attemptmargin') === 'how far their attempt beat its target' && nw('RollMargin') === 'how far this roll passed or failed by' && nw('Blow.wound') === 'the wound it dealt' && nw('TargetDistance') === 'the distance to the target', nw('AttemptMargin'));
    check('a name read off a list, a row or someone else', nw('Gear.count') === 'how many rows of Gear' && nw('Gear.wt') === 'the total Weight of Gear' && nw('Gear.max.dr') === 'the highest DR in Gear' && nw('Gear.on.wt') === 'the total Weight of Gear switched on' && nw('Gear.axe.dr') === 'DR of Axe in Gear' && nw('Row.lvl') === 'this row\u2019s level' && nw('Row.wt', wf[4].list) === 'this row\u2019s Weight' && nw('Target.STRmod') === 'the target\u2019s STR modifier' && nw('Attempter.STRmod') === 'their STR modifier', j([nw('Gear.axe.dr'), nw('Row.wt', wf[4].list)]));
    check('a field of that very name keeps it, and what is nothing here is said as written', SC.nameWord({ fields: [{ id: 'f_a', key: 'AttemptMargin', label: 'Mine', kind: 'number' }] }, 'AttemptMargin') === 'Mine' && nw('NoSuchThing') === 'No Such Thing' && SC.nameWord(null, 'A.b') === 'A b', nw('NoSuchThing'));
    const sysRaw = sysFiles.map(f => JSON.parse(fs.readFileSync(f, 'utf8'))).map(s => SC.cleanSystem(s.system || s, { F, gmView: true })).filter(Boolean);
    const tests = [{ then: false }, { resist: true }, { to: 'near' }, { cross: { f: 'x' } }, { cross: { f: 'x', asAt: true } } /* 1.6.2 (the review of backlog 242): a crossing ticked Reads the sheet as the blow left it */, { blow: true }, { then: true }];
    let offered = 0, badOffer = [], codeLike = [], noField = [];
    sysRaw.concat([SC.cleanSystem(ws, { F, gmView: true }) || ws]).forEach(sys0 => tests.forEach(t0 => {
        const sys = JSON.parse(JSON.stringify(sys0)); sys.rolls = Array.isArray(sys.rolls) ? sys.rolls : [];
        const r = { id: 'r_zz', label: 'Zz', formula: 'd20', resist: t0.resist === true || undefined, to: t0.to, cross: t0.cross };
        if (t0.blow) { sys.combat = sys.combat || {}; sys.combat.damage = sys.combat.damage || {}; sys.combat.damage.onWound = [{ roll: 'r_zz' }]; }
        sys.rolls.push(r);
        const groups = SC.readsOf(sys, { roll: r, then: t0.then === true }), names = [];
        groups.forEach(g => { if (!g.name || !g.items.length) badOffer.push('empty group'); g.items.forEach(i => { names.push(i.s); offered++; if (/\.|^[a-z]+[A-Z]|[a-z][A-Z][a-z]+[A-Z]/.test(i.label) && !sys.fields.some(f => f.label === i.label)) codeLike.push(i.label); if (i.label === i.s && !sys.fields.some(f => (f.label || f.key) === i.s)) noField.push(i.s); }); });
        const pool = (sys.fields.filter(f => f.kind === 'resource')[0] || sys.fields.filter(f => f.kind === 'number')[0] || {}).id;
        if (t0.then) r.then = pool ? [{ f: pool, add: true, formula: names.join(' + ') }] : []; else r.formula = 'd20 + ' + names.join(' + ');
        const v = SC.validateSystem(sys, F);
        v.errors.filter(e => /^"|Unknown name|known only/.test(e.message)).forEach(e => badOffer.push(e.message.slice(0, 90)));
    }));
    check('every name a box offers (' + offered + ') is one the validator takes in that very box', offered > 300 && badOffer.length === 0, j(badOffer.slice(0, 6)));
    check('nothing offered reads as code', codeLike.length === 0 && noField.length === 0, j(codeLike.concat(noField).slice(0, 8)));
    const rd = SC.readsOf(ws, {}), flat = rd.reduce((a, g) => a.concat(g.items.map(i => i.s)), []);
    check('what is no figure is never offered: a text, a whole list, a choice has no total', !flat.includes('Note') && !flat.includes('Gear') && !flat.includes('Gear.mat') && flat.includes('Gear.count') && flat.includes('STRmod') && flat.includes('HP.max'), j(flat.slice(0, 12)));
    check('a box is offered what it may read and no more', !flat.includes('AttemptMargin') && !flat.includes('RollMargin') && SC.readsOf(ws, { roll: { id: 'r_a', resist: true } }).some(g => g.items.some(i => i.s === 'AttemptMargin')) && SC.readsOf(ws, { roll: { id: 'r_a' }, then: true }).some(g => g.items.some(i => i.s === 'RollMargin')));
    const pk = { name: 't', fields: [{ id: 'f_st', key: 'ST', label: 'Strength', kind: 'number', def: 12 }, { id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', list: { stats: [{ key: 'mat', label: 'Material', kind: 'pick', opts: [{ label: 'Iron', name: 'Iron' }, { label: 'Cold iron', name: 'Cold iron' }, { label: 'Might', name: 'ST' }] }], cols: [{ key: 'w', label: 'W', formula: 'Row.mat + 1' }] } }], rolls: [], items: [] };
    const pv = SC.validateSystem(pk, F);
    check('a choice of plain words is no fault, and an option that points at nothing says so in words', pv.errors.length === 0 && SC.validateSystem(Object.assign({}, pk, { fields: [pk.fields[0], Object.assign({}, pk.fields[1], { list: { stats: [{ key: 'mat', label: 'Material', kind: 'pick', opts: [{ label: 'Might', name: 'Nope' }] }] } })] }), F).errors.some(e => /^Material: the option \u201cMight\u201d points at \u201cNope\u201d, which is no figure of this sheet\.$/.test(e.message)), j(pv.errors));
    const dotted = SC.validateSystem({ name: 't', fields: [Object.assign({}, pk.fields[1], { list: { stats: [{ key: 'mat', label: 'Material', kind: 'pick', opts: [{ label: 'Row.lvl', name: 'Row.lvl' }] }] } })], rolls: [], items: [] }, F);
    check('a dotted name in a choice is a broken link, never a plain word', dotted.errors.some(e => /points at/.test(e.message)), j(dotted.errors));
    const dcs = readU('scripts/dice.js'), shs = readU('scripts/sheets.js'), ixs = readU('index.html');
    const noCode = /STRmod|Skill\.Stealth/;
    check('nothing teaches a key: the notes, the boxes and the roller', !noCode.test(ixs.split('id="sysRolls"')[1].split('sys-toolbar')[1].slice(0, 400)) && !/'[^']*STRmod[^']*'/.test(shs) && !/placeholder="[^"]*kh3/.test(ixs) && !ixs.includes('names like STR'));
    check('a roll\u2019s tooltip names the roll, never its formula', !/b\.title = r\.formula/.test(shs) && !/\+ r\.formula \+ ' \(shift-click/.test(shs) && !/'Roll ' \+ f\.roll/.test(shs) && !/cbR \+ ' \\u2014 ' \+ r\.formula/.test(shs));
    check('a card\u2019s hover and the \u00b1 window keep names off', /function namesHover/.test(dcs) && /function prevWords/.test(dcs) && /Fw\.plainDice/.test(dcs));

    /* ================= a fault in plain words ================= */
    const pm = t => SC.plainMessage(ws, t);
    check('a fault names things as the sheet does, with no key and no code', pm('"AttemptMargin" is known only in a roll ticked Resists an attempt.') === 'How far their attempt beat its target can only be read in a roll ticked Resists an attempt.' && pm('Unknown name "STRmd" \u2014 did you mean "STRmod"?') === '\u201cSTRmd\u201d is nothing on this sheet. Did you mean STR modifier?' && pm('Unknown name "Nope"') === '\u201cNope\u201d is nothing on this sheet.' && pm('"Skill.Stealth" is GM only: players will not get this action.') === '\u201cStealth\u201d is GM only: players will not get this action.', pm('Unknown name "STRmd" \u2014 did you mean "STRmod"?'));
    check('what it says of a roll, a loop, a choice and a stat', pm('This roll tests nothing (no comparison, like 3d6 <= Skill), so On success never happens.') === 'This roll has nothing to beat, so On success never happens.' && pm('This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so On failure never happens.') === 'This roll has nothing to beat, so On failure never happens.' && pm('Formulas refer to each other in a loop: strmod \u2192 hp \u2192 strmod') === 'These each need the other, so none of them can be worked out: STR modifier, then Hit Points, then STR modifier.' && pm('"Gear.mat" is a choice, so it has no total: read one row (Gear.<key>.mat).') === 'Material in Gear is a choice, so it has no total.', pm('Formulas refer to each other in a loop: strmod \u2192 hp \u2192 strmod'));
    check('a message with no name in it stands, and nothing is thrown', pm('Pick the pool or number this changes.') === 'Pick the pool or number this changes.' && SC.plainMessage(null, 'x') === 'x' && SC.plainMessage(ws, undefined) === '' && pm('Stat "mat" is a choice with no options yet.') === 'Material is a choice with no options yet.', pm('Stat "mat" is a choice with no options yet.'));
    check('the System editor says every fault through that one reading, and no formula under it', /errPrefix\(e\.prop\) \+ \(typeof plainMessage === 'function' \? plainMessage\(draft, e\.message\)/.test(shs) && /errPrefix\(w\.prop, true\) \+ \(typeof plainMessage === 'function' \? plainMessage\(draft, w\.message\)/.test(shs) && /function errSay\(e, warn\) \{ return errPrefix\(e && e\.prop, warn\) \+ \(e && e\.message \? \(typeof plainMessage === 'function' \? plainMessage\(draft, e\.message\)/.test(require('./checkkit').part('sysedtabs.js')) && /#systemModal \.sys-err \.dice-caret \{ display: none; \}/.test(readU('style.css')));

    /* ================= every box of the table ================= */
    const fbs = readU('scripts/formbox.js'), sheetsT = readU('scripts/sheets.js'), boxBlock = fbs.slice(fbs.indexOf('var BOXES = {'), fbs.indexOf('function kindOf')), askBlock = fbs.slice(fbs.indexOf('var ASKS = {'), fbs.indexOf('function diceOk')), boxKeys = (boxBlock.match(/'sys-[a-z0-9-]+'/g) || []).map(s => s.slice(1, -1)), rollish = /'(sys-[a-z0-9-]+)': 'roll'/g, rolls = []; let rm; while ((rm = rollish.exec(boxBlock))) rolls.push(rm[1]);
    check('every box of the table stands in the editor, and asks what it is for (' + boxKeys.length + ')', boxKeys.length > 60 && boxKeys.every(k => sheetsT.includes(k) || /^sys-combat-b/.test(k) || /^sys-(roll-p|list-rollp)[3-5][fd]$/.test(k)) && boxKeys.filter(k => !rolls.includes(k)).every(k => askBlock.includes("'" + k + "'")), j(boxKeys.filter(k => (!sheetsT.includes(k) && !/^sys-combat-b/.test(k) && !/^sys-(roll-p|list-rollp)[3-5][fd]$/.test(k)) || (!rolls.includes(k) && !askBlock.includes("'" + k + "'"))).slice(0, 8)));
    const wl = JSON.parse(j(ws)), spL = wl.fields[4].list; spL.rolls = [{ label: 'Zz', formula: 'd20' }]; const rowN = (SC.readsOf(wl, { list: spL }).filter(g => g.name === 'This row')[0] || { items: [] }).items.map(i => i.s);
    spL.rolls[0].formula = 'd20 + ' + rowN.join(' + '); const vL = SC.validateSystem(wl, F), badL = vL.errors.filter(e => /^"|Unknown name|known only/.test(e.message));
    check('a box of a list is offered its row, each name by its label, and the validator takes every one', rowN.includes('Row.wt') && rowN.includes('Row.dr') && badL.length === 0 && SC.readsOf(wl, { list: spL }).filter(g => g.name === 'This row')[0].items.some(i => i.label === 'This row’s Weight'), j(badL.slice(0, 4).map(e => e.message)));
    check('a shut box says what it is, before what it holds', (() => { const r = doc.createElement('div'); modal.appendChild(r); const i = doc.createElement('input'); i.type = 'text'; i.className = 'sys-roll-needs field'; i.value = ''; r.appendChild(i); const q = doc.createElement('input'); q.type = 'text'; q.className = 'sys-roll field'; q.value = '2d6'; r.appendChild(q); B.sweep(modal); return i.parentNode.querySelector('.fb-lead').textContent === 'When can they use this?' && i.parentNode.querySelector('.fb-say').textContent === 'Always' && q.parentNode.querySelector('.fb-lead').textContent === 'What this roll does'; })());
    check('a box of a list finds its list and its roll', /closest\('\.sys-list-card'\)/.test(require('./checkkit').part('sysedtabs.js')) && /closest\('\.sys-list-roll'\)/.test(require('./checkkit').part('sysedtabs.js')));
    const onlyR = SC.readsOf(ws, { only: ['Distance'] }), blowR = SC.readsOf(ws, { blow: true, more: ['Listed'] });
    check('a box with names of its own is offered those and nothing else, and the damage step its blow', onlyR.length === 1 && onlyR[0].items.length === 1 && onlyR[0].items[0].label === 'The distance' && onlyR[0].items[0].s === 'Distance' && blowR.some(g => g.name === 'The blow' && g.items.some(i => i.label === 'The wound it dealt')) && blowR.some(g => g.name === 'For this' && g.items[0].label === 'Its listed figure'), j(onlyR));
    {   /* 1.6.2 (the review of backlog 242): a death check that runs When a value crosses, ticked Reads the sheet as the blow left it. Its formula's form
           offers the blow (the wound it dealt) as the validator takes it there; its First at box, worked out on the sheet as it stands before the roll runs,
           is offered neither the blow nor which step was crossed, as the validator refuses both there. sheets.js formCtx marks those boxes crossStep */
        const dcS = SC.cleanSystem({ v: 1, name: 'D', fields: [{ id: 'f_hp', key: 'HP', label: 'Hit points', kind: 'resource', maxFormula: '15', def: 'max', min: -99 }],
            rolls: [{ id: 'r_dc', label: 'Death check', formula: '3d6 <= 10', cross: { f: 'f_hp', dir: 'down', at: '-HP.max', asAt: true } }], combat: { hpResource: 'f_hp', damage: { pool: 'f_hp' } } }, { F, gmView: true });
        const dcR = dcS.rolls[0], flatOf = g => g.reduce((a, x) => a.concat(x.items.map(i => i.s)), []), inF = flatOf(SC.readsOf(dcS, { roll: dcR })), inAt = flatOf(SC.readsOf(dcS, { roll: dcR, crossStep: true }));
        const plain = flatOf(SC.readsOf(dcS, { roll: Object.assign({}, dcR, { cross: { f: 'f_hp', dir: 'down', at: '-HP.max' } }) }));
        check('1.6.2 (the review of backlog 242) a death check ticked Reads the sheet as the blow left it is offered the blow in its formula, never in its First at box (nor which step was crossed), and one without the tick is offered no blow; formCtx marks the two step boxes',
            dcR.cross.asAt === true && inF.includes('Blow.wound') && inF.includes('CrossStep') && !inAt.includes('Blow.wound') && !inAt.some(s => /^blow\./i.test(s)) && !inAt.includes('CrossStep') && inAt.includes('HP.max') && !plain.includes('Blow.wound')
            && /if \(r && cs && \(cs\.contains\('sys-roll-xsat'\) \|\| cs\.contains\('sys-roll-xsstep'\)\)\) return \{ roll: r, subject: r\.label, crossStep: true \};/.test(require('./checkkit').part('sysedbox.js')), j([inF.filter(s => /^blow|^cross/i.test(s)), inAt.filter(s => /^blow|^cross/i.test(s))]));
    }
    const FO = /var FORM_ONLY = (\{[^\n]*\});/.exec(require('./checkkit').part('sysedbox.js')); const FOo = FO ? (new Function('return ' + FO[1]))() : {};
    check('what a closed box offers is what Save keeps there', Object.keys(FOo).length === 10 /* 1.6.2: and Blast radius, and A body in the way hides (moved on purpose); 1.6.3 (defense fold 3): and How much gets through, which the validator reads by its own rule (ansShareSays, held below) */ && SC.cleanBodyCover(FOo['sys-combat-cover-body'].join(' + '), F) !== '' && SC.cleanBlastRules({ fall: FOo['sys-combat-bfall'].join(' + '), each: FOo['sys-combat-beach'].join(' + '), scatter: FOo['sys-combat-bscatter'].join(' + '), hand: FOo['sys-combat-bhand'].join(' + ') }, F) !== null && ['fall', 'each', 'scatter', 'hand'].every(k => { const o = {}; o[k] = FOo[{ fall: 'sys-combat-bfall', each: 'sys-combat-beach', scatter: 'sys-combat-bscatter', hand: 'sys-combat-bhand' }[k]].join(' + '); const c = SC.cleanBlastRules(o, F); return c && c[k]; }), j(Object.keys(FOo)));
    check('1.6.4 (the beta\u2019s last look) an action\u2019s count on the Turns topic and a sheet category\u2019s rule are forms, each asking what it is for, so neither asks for a formula typed by hand; an empty rule means only by hand',
        B.kindOf({ classList: { contains: c => c === 'sys-turn-actn' } }) === 'amt' && B.kindOf({ classList: { contains: c => c === 'sys-cc-if' } }) === 'cond'
        && B.askOf({ classList: { contains: c => c === 'sys-turn-actn' }, dataset: {} })[0] === 'How many does a turn allow?' && B.askOf({ classList: { contains: c => c === 'sys-cc-if' }, dataset: {} })[0] === 'Which sheets go in this folder by themselves?'
        && B.emptyWord('cond', { classList: { contains: c => c === 'sys-cc-if' } }) === 'Only by hand' && !/ExtraReady|a formula of the character/.test(require('./checkkit').part('sysedtabs.js')));
    check('an empty box says what empty means there', B.emptyWord('cond') === 'Always' && B.emptyWord('amt') === 'Not set' && B.emptyWord('cond', { classList: { contains: c => c === 'sys-combat-bhand' } }) === 'Never' && B.emptyWord('cond', { classList: { contains: c => c === 'sys-dmgr-oif' } }) === 'Every wound');
    check('1.6.2 an empty Worked out until set on a toggle says nothing is worked out, never Always (the toggle then follows its default and what is stored, as its tooltip says)', B.kindOf({ classList: { contains: c => c === 'sys-wout-on' || c === 'field' } }) === 'cond' && B.emptyWord('cond', { classList: { contains: c => c === 'sys-wout-on' || c === 'field' } }) === 'Not worked out' && B.emptyWord('amt', { classList: { contains: c => c === 'sys-wout' || c === 'field' } }) === 'Not set');
    check('no line of the blast boxes names a code name', !/reads it as Blast|Names: Blast|Name: Natural/.test(sheetsT));
    check('the Library window\u2019s boxes ask too, by the ids it gives them', B.kindOf({ id: 'libF_needsIf' }) === 'cond' && B.kindOf({ id: 'libF_damage' }) === 'dice' && B.askOf({ id: 'libF_needsIf' })[0] === 'What must be true before it can be taken?' && B.emptyWord('cond', { id: 'libF_needsIf' }) === 'Nothing' && ['needsIf', 'damage', 'cost', 'areaFrag'].every(k => readU('scripts/librarywin.js').includes("'" + k + "'")), B.kindOf({ id: 'libF_needsIf' }));
    {   // 1.6.3 (the review of the System editor and the Library window, finding 31): the Library window's affliction and cloud boxes are forms, as the Items tab's are
        const cls = c => ({ classList: { contains: x => x === c }, dataset: {} }), id = i => ({ id: i, dataset: {} }), lwF = readU('scripts/librarywin.js');
        const same = (lib, tab) => j(B.askOf(id(lib))) === j(B.askOf(cls(tab)));
        check('1.6.3 (finding 31) the Library window’s affliction boxes and its cloud’s Lasts are forms with the Items tab’s own questions: what they resist it with is a figure, who it can touch a test and how long it lasts dice, for both afflictions; the cloud’s Lasts is dice in both windows; an empty box says what empty means there (formbox kindOf, askOf and emptyWord, run for real)',
            [0, 1].every(i => B.kindOf(id('libF_areaAff' + i + 'Vs')) === 'amt' && B.kindOf(id('libF_areaAff' + i + 'Needs')) === 'cond' && B.kindOf(id('libF_areaAff' + i + 'Lasts')) === 'dice' && same('libF_areaAff' + i + 'Vs', 'sys-item-affvs') && same('libF_areaAff' + i + 'Needs', 'sys-item-affneeds') && same('libF_areaAff' + i + 'Lasts', 'sys-item-afflasts')
                && B.emptyWord('cond', id('libF_areaAff' + i + 'Needs')) === 'Everyone it reaches' && B.emptyWord('dice', id('libF_areaAff' + i + 'Lasts')) === 'The effect’s own time')
            && B.kindOf(id('libF_areaCloudN')) === 'dice' && B.kindOf(cls('sys-cloud-n')) === 'dice' && same('libF_areaCloudN', 'sys-cloud-n') && B.askOf(cls('sys-cloud-n'))[0] === 'How long does the cloud stay?' && B.emptyWord('dice', id('libF_areaCloudN')) === 'Until you clear it' && B.emptyWord('dice', cls('sys-cloud-n')) === 'Until you clear it'
            && B.emptyWord('cond', cls('sys-item-affneeds')) === 'Everyone it reaches' && B.emptyWord('cond', id('libF_needsIf')) === 'Nothing' && B.emptyWord('cond', id('libF_cost')) === 'Always'
            && lwF.includes("field(form, 'areaAff' + i + 'Vs',") && lwF.includes("field(form, 'areaAff' + i + 'Needs',") && lwF.includes("field(form, 'areaAff' + i + 'Lasts',") && lwF.includes("field(form, 'areaCloudN',"), j([B.kindOf(id('libF_areaAff0Vs')), B.kindOf(id('libF_areaCloudN')), B.emptyWord('cond', id('libF_areaAff0Needs'))]));
    }
    {   // 1.6.3 (the review of defense fold 4, finding 9): a box may carry its own second line, as How far names the system's unit; its question stays the table's
        const fx = { classList: { contains: c => c === 'sys-ans-far' }, dataset: { fbSay: 'In feet, as the range counts them. Leave it empty for any distance.' } }, fp = { classList: { contains: c => c === 'sys-ans-far' }, dataset: {} };
        check('1.6.3 the review of defense fold 4: How far\u2019s question says the unit its box names (data-fb-say), and keeps the table\u2019s words where it names none',
            j(B.askOf(fx)) === j(['How far can it be sent?', 'In feet, as the range counts them. Leave it empty for any distance.']) && B.askOf(fp)[0] === 'How far can it be sent?' && /range counts in/.test(B.askOf(fp)[1]), j([B.askOf(fx), B.askOf(fp)]));
    }
    check('a press on a fault opens the form that stands over its box', /formToo\(box\)/.test(readU('scripts/sysui.js')) && /function openFor\(inp\)/.test(fbs));

    /* ================= one stat a player sets, and a list gathered by a stat ================= */
    {
        const LS = { stats: [{ key: 'hand', label: 'Held in', kind: 'pick', opts: [{ label: 'Left', name: 'Left' }, { label: 'Right', name: 'Right' }], own: true }, { key: 'wt', label: 'Weight', own: true }, { key: 'dur', label: 'Durability', labels: ['Worn', 'Sound'], own: true, vis: 'gm' }, { key: 'gr', label: 'Grip', labels: ['One', 'Two'], own: true, hide: true }, { key: 'kind', label: 'Kind', kind: 'pick', opts: [{ label: 'Blade', name: 'Blade' }, { label: 'Shield', name: 'Shield' }] }], groupBy: 'KIND' };
        const SY = SC.cleanSystem({ name: 't', fields: [{ id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'gm', vis: 'all', list: LS }], items: [{ id: 'i_a', key: 'axe', name: 'Axe', stats: { kind: 'Blade', hand: 'Left' } }] }, { F, gmView: true });
        const PV = SC.cleanSystem(SY, { F, gmView: false }) || SY, st0 = SY.fields[0].list.stats, own = k => (st0.filter(s => s.key === k)[0] || {}).own === true;
        check('Player sets this is kept on a choice alone, never on a plain number, a GM-only or a Hidden stat, and Rows gather by takes a choice under its own spelling', own('hand') && !own('wt') && !own('dur') && !own('gr') && !own('kind') && SY.fields[0].list.groupBy === 'kind' && (PV.fields[0].list.stats.filter(s => s.key === 'hand')[0] || {}).own === true, j(st0));
        const row = { id: 'w_a', defId: 'i_a', qty: 1 }, ch = () => ({ id: 'c_a', ownerId: 'p1', values: { f_g: [JSON.parse(j(row))] } }), op = (ov, o) => SC.applyRowOp(SY, ch(), 'f_g', { op: 'ov', rowId: 'w_a', ov }, F, Object.assign({ player: true, view: PV }, o));
        const yes = op({ stats: { hand: 'Right' } });
        check('its owner sets it, on a list that is the GM\u2019s to edit', yes.ok === true && yes.value.filter(r => r.id === 'w_a')[0].ov.stats.hand === 'Right', j(yes));
        check('and nothing else: another stat, one beside it, a name, or a stat that is not there', !op({ stats: { kind: 'Shield' } }).ok && !op({ stats: { hand: 'Right', kind: 'Shield' } }).ok && !op({ name: 'Mine' }).ok && !op({ stats: { hand: 'Right' }, name: 'Mine' }).ok && !op({ stats: { nope: 1 } }).ok && !op({ stats: {} }).ok);
        check('an option that is not one of its own is refused, and the judge says no to what is no stats change', !op({ stats: { hand: 'Tail' } }).ok && !SC.ownStatsOnly(SY.fields[0].list, { op: 'set', ov: { stats: { hand: 'Left' } } }) && !SC.ownStatsOnly(null, { op: 'ov', ov: { stats: { hand: 'Left' } } }) && !SC.ownStatsOnly(SY.fields[0].list, { op: 'ov', ov: null }));
        const gmSet = { id: 'w_a', defId: 'i_a', qty: 1, ov: { stats: { hand: 'Left' }, held: ['hand'] } }, heldR = SC.applyRowOp(SY, { id: 'c_a', values: { f_g: [gmSet] } }, 'f_g', { op: 'ov', rowId: 'w_a', ov: { stats: { hand: 'Right' } } }, F, { player: true, view: PV });
        check('a value the GM set stays the GM\u2019s', !heldR.ok, j(heldR));
        const rowL = { id: 'w_l', defId: 'i_lib', qty: 1, snap: { name: 'Kit', category: '', icon: '', notes: '', vis: 'all', stats: {} } }, libE = { id: 'i_lib', name: 'Kit', category: '', icon: '', notes: '', vis: 'all', stats: {} }, onL = lib => SC.applyRowOp(SY, { id: 'c_a', values: { f_g: [JSON.parse(j(rowL))] } }, 'f_g', { op: 'ov', rowId: 'w_l', ov: { stats: { hand: 'Right' } } }, F, { player: true, view: PV, lib });
        SC.setLibraryFind(id => id === 'i_lib' ? libE : null);
        const libYes = onL(id => id === 'i_lib' ? libE : null), libNo = onL(null), libOff = SC.applyRowOp(SY, { id: 'c_a', values: { f_g: [JSON.parse(j(rowL))] } }, 'f_g', { op: 'ov', rowId: 'w_l', ov: { stats: { kind: 'Shield' } } }, F, { player: true, view: PV, lib: id => id === 'i_lib' ? libE : null });
        SC.setLibraryFind(null);
        check('a row from a library pack takes it too, where the host\u2019s judge says players may see that entry, and one from a pack kept from them reads as gone, as any other change of it does; found by pressing it. Another stat of such a row stays refused', libYes.ok === true && libYes.value[0].ov.stats.hand === 'Right' && libNo.ok === false && libNo.reason === 'missing' && libOff.ok === false, j([libYes, libNo, libOff]));
        const LV = SC.cleanSystem({ name: 't', fields: [Object.assign({}, SY.fields[0], { vis: 'gm' })], items: SY.items }, { F, gmView: true }), hiddenL = SC.applyRowOp(LV, ch(), 'f_g', { op: 'ov', rowId: 'w_a', ov: { stats: { hand: 'Right' } } }, F, { player: true, view: PV });
        check('a list kept from players stays kept', !hiddenL.ok, j(hiddenL));
    }

    /* ================= the wiring ================= */
    const ix = readU('index.html'), sh = readU('scripts/sheets.js'), ek = readU('scripts/esckey.js'), st = readU('style.css'), fb = readU('scripts/formbox.js');
    check('the page loads the form, the System editor hands it its names and has it watch', ix.includes('src="scripts/formbox.js"') && /wpFormBox\.setSource\(formSource\)/.test(require('./checkkit').part('sysedbox.js')) && /watch\(ui\('libraryModal'\)\)/.test(require('./checkkit').part('sysedbox.js')) && /wpFormBox\.watch\(/.test(require('./checkkit').part('sysedbox.js')));
    check('Escape in a form is the form\'s, and the form holds no markup of its own', ek.includes("escAt(t, '.fb-open')") && !/innerHTML|insertAdjacentHTML/.test(fb));
    check('its styles', /\.fb-line\b/.test(st) && /\.fb-menu\b/.test(st) && /\.fb-step\b/.test(st));
    { const nf = C.read('Row.pen <= -9'), wd = C.says(nf.form, {}); check('a number below 0 reads as a number, never as one with its sign flipped', !wd.includes('flipped') && wd.includes('-9') && C.write(nf.form) === 'Row.pen <= -9', wd); }
    /* ================= a box that holds a name of a list, and a stat's options ================= */
    const pkRoot = doc.createElement('div'), pkOf = (cls, v, ph) => { const b = doc.createElement('input'); b.type = 'text'; b.className = cls + ' field'; b.value = v; b.placeholder = ph; pkRoot.appendChild(b); return b; };
    modal.appendChild(pkRoot); B.setSource(() => ({ groups: [{ name: 'This character', items: [{ label: 'Might', s: 'Might' }, { label: 'Agility', s: 'Agility' }] }], word: () => '' })); B.setPicks(k => (k === 'types' ? [['fire', 'Fire'], ['stun', 'Stunning']] : [['cut', 'Cutting']]));
    const pT = pkOf('sys-roll-dtype', 'Stun', 'Damage type'), pR = pkOf('sys-list-rollp2t', 'Row.dt2', 'Second part type'), pK = pkOf('sys-roll-p3k', '', 'Third part kind'), pOpt = pkOf('sys-list-statopts', 'Iron, Strength = ST, Bronze', 'Options');
    B.sweep(pkRoot); B.sweep(pkRoot);
    const pkSels = pkRoot.querySelectorAll('.fb-keypick'), pkTexts = s => s.childNodes.map(o => o.textContent);
    check('a type or a kind stands as a list of its names, in any case of its key, once however often it is swept, and no key is on show', pkSels.length === 3 && pkSels[0].value === 'fire'.replace('fire', 'stun') && pT.hidden === true && pT.value === 'Stun' && j(pkTexts(pkSels[0])) === j(['Damage type', 'Fire', 'Stunning', 'Worked out by a rule\u2026']) && j(pkTexts(pkSels[2])) === j(['Third part kind', 'Cutting', 'Worked out by a rule\u2026']) && pkSels[2].value === '', j(pkSels.length));
    check('a rule stands as that row of the list, and the form opens on it', pkSels[1].value === '@rule' && pR.parentNode.className === 'fb' && pR.value === 'Row.dt2' && !!pR.parentNode.querySelector('.fb-go'));
    const pkPress = (s, v) => { s.value = v; (s.handlers.change || []).forEach(h => h({ target: s })); };
    pT.calls.length = 0; pkPress(pkSels[0], 'fire');
    check('a pick writes the box and says so, which the System editor\u2019s handlers read as before', pT.value === 'fire' && pT.calls.includes('dispatch input') && pT.calls.includes('dispatch change'), j(pT.calls));
    pkPress(pkSels[1], 'stun');
    check('a name picked over a rule takes the form away', pR.value === 'stun' && pR.parentNode === pkRoot && pR.hidden === true && pR.dataset.fbr === undefined && pR.dataset.fb === undefined);
    pkPress(pkSels[0], '@rule');
    check('Worked out by a rule starts with nothing, and opens the form', pT.value === '' && pT.parentNode.className === 'fb' && pT.dataset.fbr === '1');
    pkPress(pkSels[0], '');
    check('the first row clears it', pT.value === '' && pT.dataset.fb === undefined && pT.hidden === true);
    check('a stat\u2019s options are text and rows of each other, a comma or an equals sign in a label is no new option, and what stands for itself says so once', j(C.readOpts('Iron, Strength = ST,, Bronze')) === j([{ label: 'Iron', name: '' }, { label: 'Strength', name: 'ST' }, { label: 'Bronze', name: '' }]) && C.writeOpts(C.readOpts('Iron, Strength = ST, Bronze')) === 'Iron, Strength = ST, Bronze' && C.writeOpts([{ label: 'A, B=C', name: '' }, { label: 'X', name: 'X' }, { label: ' ', name: 'Y' }]) === 'A  B C, X');
    const optBox = pkRoot.querySelector('.fb-opts'), optRows = () => optBox.querySelectorAll('.fb-opt');
    check('the options stand as a row each, and the box stays with its value', pOpt.hidden === true && optRows().length === 3 && pOpt.value === 'Iron, Strength = ST, Bronze' && optBox.querySelectorAll('.fb-optname')[1].value === 'Strength');
    check('a figure it stands for is picked by name, and one that is gone says so', j(optBox.querySelectorAll('.fb-optfig')[0].childNodes.map(o => o.textContent)) === j(['Just this word', 'Stands for Might', 'Stands for Agility', 'Stands for a figure that is gone'].filter(x => !/gone/.test(x))) && optBox.querySelectorAll('.fb-optfig')[1].value === 'ST' && optBox.querySelectorAll('.fb-optfig')[1].childNodes.some(o => /gone/.test(o.textContent)));
    pOpt.calls.length = 0; press(optBox.querySelectorAll('.fb-optrm')[0]);
    check('taking an option away writes the box and says so', pOpt.value === 'Strength = ST, Bronze' && pOpt.calls.includes('dispatch change') && optRows().length === 2, pOpt.value);
    press(optBox.querySelector('.fb-optadd')); const lbN = optBox.querySelectorAll('.fb-optname'), lastN = lbN[lbN.length - 1]; lastN.value = 'Tin'; (lastN.handlers.input || []).forEach(h => h({ target: lastN })); (lastN.handlers.change || []).forEach(h => h({ target: lastN }));
    check('+ Option adds a row, and what is typed reaches the box as it is left', pOpt.value === 'Strength = ST, Bronze, Tin' && optRows().length === 3, pOpt.value);
    {   // 1.6.3 (gap 4 of docs/EDITOR_COVERAGE.md; the owner, 2026-11-19): an option may stand for a figure of one row of a list, picked as the
        // list, the entry with a search, and the figure, each by its name, never typed. Invented data (no game named): a list of skills with
        // Specialties, a list of gear, the system's own items, the library's core and the campaign's library entries
        const sysO = { fields: [{ id: 'f_st', key: 'ST', label: 'Strength', kind: 'number' },
            { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', list: { cats: ['Skill'], lvl: { label: 'Level' }, stats: [{ key: 'bonus', label: 'Bonus' }, { key: 'grp', label: 'Group', kind: 'pick', opts: [] }, { key: 'pl', label: 'Places', set: true }], cols: [{ key: 'Target', label: 'Target' }], specs: {} } },
            { id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', list: { stats: [{ key: 'wt', label: 'Weight' }] } },
            { id: 'f_n', key: 'Notes', label: 'Notes', kind: 'item-list', list: {} }, { id: 'f_d', key: 'Odd.Key', kind: 'item-list', list: { stats: [{ key: 'a' }] } }],
            items: [{ key: 'knife', name: 'Knife', category: 'Skill' }, { key: 'rope', name: 'Rope', category: 'Gear' }],
            core: [{ key: 'club', name: 'Club', category: 'Skill' }, { key: 'Knife', name: 'A second knife', category: 'Skill' }] };
        const libO = [{ key: 'swim', name: 'Swimming', category: 'Skill' }, { key: 'lore', name: 'Hidden Lore', category: 'skill', vis: 'gm' }, { key: 'bad key', name: 'Spaced', category: 'Skill' }, { key: 'club', name: 'Club again', category: 'Skill' }];
        const LO = C.optLists(sysO, libO), skL = LO.filter(l => l.key === 'Skills')[0], gL = LO.filter(l => l.key === 'Gear')[0];
        check('gap 4: the lists an option may read a row of are the item lists with a figure, each with its figures (its level, number stats, columns; never a choice or a set of places) and its entries by name, the system\u2019s own, the core\u2019s and the library\u2019s, each key once, only of its categories, GM-only ones marked',
            j(LO.map(l => l.key)) === j(['Skills', 'Gear']) && skL.specs === true && gL.specs === false && j(skL.figs) === j([['lvl', 'Level'], ['bonus', 'Bonus'], ['Target', 'Target']])
            && j(skL.entries) === j([['club', 'Club', ''], ['lore', 'Hidden Lore', 'GM only'], ['knife', 'Knife', ''], ['swim', 'Swimming', '']]) && j(gL.entries.map(e => e[0])) === j(['club', 'lore', 'knife', 'rope', 'swim']), j(LO));
        const rd = n => C.optRowRead(n, LO);
        check('gap 4: a stored name reads as a list, an entry, a specialty and a figure, in the spelling the lists hold, and back word for word; a total, a highest, a sheet figure, a specialty on a list without them and a list that is gone are no row',
            j(rd('Skills.knife.Target')) === j({ list: 'Skills', entry: 'knife', known: true, spec: '', fig: 'Target', figKnown: true }) && C.optRowWrite(rd('Skills.knife.Target')) === 'Skills.knife.Target'
            && j(rd('Skills.knife.OffHand.Target')) === j({ list: 'Skills', entry: 'knife', known: true, spec: 'OffHand', fig: 'Target', figKnown: true }) && C.optRowWrite(rd('Skills.knife.OffHand.Target')) === 'Skills.knife.OffHand.Target'
            && C.optRowWrite(rd('skills.KNIFE.target')) === 'Skills.knife.Target' && rd('Skills.axe.Target').known === false && rd('Skills.axe.Target').entry === 'axe' && rd('Skills.knife.Wear').figKnown === false && rd('Skills.knife.Wear').fig === 'Wear'
            && rd('Skills.max.Target') === null && rd('Skills.on.bonus') === null && rd('Skills.count') === null && rd('ST') === null && rd('Gear.rope.Spec.wt') === null && rd('Lost.knife.Target') === null && rd('Skills.kn ife.Target') === null && rd('') === null);
        check('gap 4: what a row\u2019s picks write is whole or nothing, and only what a Save keeps (letters, digits and _, 64 at most)',
            C.optRowWrite({ list: 'Skills', entry: '', fig: 'Target' }) === '' && C.optRowWrite({ list: 'Skills', entry: 'knife', fig: '' }) === '' && C.optRowWrite({ list: 'Skills', entry: 'kn-ife', fig: 'Target' }) === '' && C.optRowWrite({ list: 'Skills', entry: 'k'.repeat(60), fig: 'Target' }) === '' && C.optRowWrite(null) === '');
        check('gap 4: a specialty is a player\u2019s own words, held as one word with its accents and spaces taken out, and said back as words',
            C.optSpecWord('off hand') === 'OffHand' && C.optSpecWord('  Two-handed  flail ') === 'TwoHandedFlail' && C.optSpecWord('R\u00e9sum\u00e9 2') === 'Resume2' && C.optSpecWord('9 lives') === 'Lives' && C.optSpecWord('!!') === ''
            && C.optSpecSay('OffHand') === 'Off Hand' && C.optSpecSay('TwoHandedFlail') === 'Two Handed Flail' && C.optSpecSay('Resume2') === 'Resume 2' && C.optSpecWord(C.optSpecSay('TwoHandedFlail')) === 'TwoHandedFlail');
        check('the review of gap 4: a typed specialty that would lose a letter or a digit is known as one, an O with a stroke, a leading digit, a word past 40; one whose letters all stay is not',
            C.optSpecLoss('\u00d8rsted') === true && C.optSpecLoss('9 lives') === true && C.optSpecLoss('a'.repeat(41)) === true && C.optSpecLoss('\u0436\u0430\u0440') === true
            && C.optSpecLoss('off hand') === false && C.optSpecLoss('R\u00e9sum\u00e9 2') === false && C.optSpecLoss('Two-handed') === false && C.optSpecLoss('') === false);
        const LS = { entries: [['knife', 'Knife', ''], ['knife__Thrown', 'Knife thrown', ''], ['kh', 'Knife: Hidden', ''], ['ko', 'Knife (Off Hand)', ''], ['ax', 'Axe (Heavy)', ''], ['ks', 'Knife (\u00d8rsted)', '']] };
        check('the review of gap 4: the specialties offered for an entry are those its list\u2019s rows name (Entry__Specialty, Entry (Specialty), Entry: Specialty) and the stat\u2019s other options hold, once each, by their words, never another entry\u2019s and never one that cannot be kept',
            j(C.optSpecsFor(LS, 'knife', ['OffHand', 'TwoHanded', 'offhand'])) === j([['Hidden', 'Hidden'], ['OffHand', 'Off Hand'], ['Thrown', 'Thrown'], ['TwoHanded', 'Two Handed']]) && j(C.optSpecsFor(LS, 'axe', [])) === j([['Heavy', 'Heavy']])
            && j(C.optSpecsFor(LS, '', ['OffHand'])) === '[]' && j(C.optSpecsFor(null, 'knife')) === '[]', j(C.optSpecsFor(LS, 'knife', ['OffHand', 'TwoHanded', 'offhand'])));
        const oRoot = doc.createElement('div'); modal.appendChild(oRoot);
        B.setSource(() => ({ groups: [{ name: 'This character', items: [{ label: 'Strength', s: 'ST' }] }], word: () => '', sys: sysO, get lib() { return libO; } }));
        const stored = 'Off Hand = Skills.knife.OffHand.Target, Blade = Skills.KNIFE.target, Old = Skills.axe.Target, Iron, Strength = ST';
        const oBox = doc.createElement('input'); oBox.type = 'text'; oBox.className = 'sys-list-statopts field'; oBox.value = stored; oRoot.appendChild(oBox); B.sweep(oRoot);
        const oRows = () => oRoot.querySelectorAll('.fb-opt'), q1 = (i, c) => oRows()[i].querySelector(c), texts = s => s.childNodes.map(o => o.textContent);
        const chg = (e, v) => { if (v !== undefined) e.value = v; (e.handlers.change || []).forEach(h => h({ target: e })); }, typ = (e, v) => { e.value = v; (e.handlers.input || []).forEach(h => h({ target: e })); };
        const key = (e, k) => { let stop = false; (e.handlers.keydown || []).forEach(h => h({ key: k, target: e, preventDefault() {}, stopPropagation() { stop = true; } })); return stop; };
        check('gap 4: an option stored as a row of a list shows as its three picks, and dressing the box writes nothing',
            oRows().length === 5 && oBox.value === stored && oBox.calls.length === 0 && q1(0, '.fb-optfig').value === '@list:Skills' && q1(0, '.ui-find-sel').value === 'knife' && texts(q1(0, '.ui-find-sel'))[1] === 'Knife'
            && q1(0, '.fb-optspecpick').value === 'OffHand' && q1(0, '.fb-optspec').hidden === true && q1(0, '.fb-optsay').hidden === true && q1(0, '.fb-optrowfig').value === 'Target' && j(texts(q1(0, '.fb-optrowfig'))) === j(['Level', 'Bonus', 'Target'])
            && q1(1, '.ui-find-sel').value === 'knife' && q1(1, '.fb-optspecpick').value === '' && j(texts(q1(1, '.fb-optspecpick'))) === j(['The entry itself', 'Off Hand', 'Another specialty, typed']) && q1(3, '.fb-optfig').value === '' && !q1(3, '.fb-optrow') && q1(4, '.fb-optfig').value === 'ST', oBox.value);
        check('gap 4: the first pick offers the sheet\u2019s own figures first, then a row of each list by its name, never a key',
            j(texts(q1(3, '.fb-optfig'))) === j(['Just this word', 'Stands for Strength', 'Stands for a row of Skills', 'Stands for a row of Gear']));
        check('gap 4: a stored entry that is no longer there says so, and is kept', q1(2, '.ui-find-sel').value === 'axe' && j(texts(q1(2, '.ui-find-sel')).slice(0, 2)) === j(['Pick an entry', 'An entry that is no longer there']) && oBox.value === stored);
        oBox.calls.length = 0; chg(q1(3, '.fb-optfig'), '@list:Skills');
        check('gap 4: picking a list shows the entry and the figure, starts on the figure the other options read, and writes nothing until an entry is picked',
            oBox.value === stored && oBox.calls.length === 0 && !!q1(3, '.fb-optrow') && q1(3, '.fb-optrowfig').value === 'Target' && q1(3, '.ui-find-sel').value === '' && doc.activeElement === q1(3, '.ui-find-q'));
        check('the review of gap 4: until an entry is picked the row says what the option still stands for, just the word here', q1(3, '.fb-optsay').hidden === false && q1(3, '.fb-optsay').textContent === 'Until an entry is picked, it stays just this word.', q1(3, '.fb-optsay').textContent);
        chg(q1(4, '.fb-optfig'), '@list:Gear'); const held4 = [q1(4, '.fb-optsay').textContent, oBox.value, oBox.calls.length]; typ(q1(4, '.fb-optname'), 'Might'); chg(q1(4, '.fb-optname'));
        check('the review of gap 4: a list picked on an option that holds a figure of the sheet says it still stands for that figure by its name, and the option keeps it through an edit of its label',
            held4[0] === 'Until an entry is picked, it still stands for Strength.' && held4[1] === stored && held4[2] === 0 && oBox.value === stored.replace('Strength = ST', 'Might = ST'), j([held4, oBox.value]));
        typ(q1(4, '.fb-optname'), 'Strength'); chg(q1(4, '.fb-optname')); chg(q1(4, '.fb-optfig'), 'ST'); oBox.calls.length = 0;
        chg(q1(1, '.ui-find-sel'), '');
        check('the review of gap 4: Pick an entry on a row that holds one writes nothing and shows the entry it holds again', oBox.value === stored && oBox.calls.length === 0 && q1(1, '.ui-find-sel').value === 'knife', j([oBox.value, q1(1, '.ui-find-sel').value]));
        typ(q1(3, '.ui-find-q'), 'swi');
        check('gap 4: the entry\u2019s search narrows its list as it is typed', j(texts(q1(3, '.ui-find-sel'))) === j(['Pick an entry', 'Swimming']));
        typ(q1(3, '.ui-find-q'), 'lore');
        check('gap 4: an entry only the GM sees says so', j(texts(q1(3, '.ui-find-sel'))) === j(['Pick an entry', 'Hidden Lore (GM only)']));
        typ(q1(3, '.ui-find-q'), 'swi'); const stopped = key(q1(3, '.ui-find-q'), 'Enter');
        check('gap 4: Enter in the search picks what it found, and the option is written as the stat reads it, the options it did not touch word for word',
            stopped && oBox.value === 'Off Hand = Skills.knife.OffHand.Target, Blade = Skills.KNIFE.target, Old = Skills.axe.Target, Iron = Skills.swim.Target, Strength = ST' && oBox.calls.includes('dispatch change') && q1(3, '.fb-optsay').hidden === true, oBox.value);
        chg(q1(0, '.fb-optspecpick'), '@type'); const boxUp = q1(0, '.fb-optspec').hidden === false && q1(0, '.fb-optspecpick').value === '@type' && oBox.value.indexOf('Off Hand = Skills.knife.OffHand.Target,') === 0;
        chg(q1(0, '.fb-optspec'), ' two-handed ');
        check('gap 4: a specialty no pick offers is typed in a player\u2019s words, held as one word and said back by name in the list', boxUp && q1(0, '.fb-optspecpick').value === 'TwoHanded' && texts(q1(0, '.fb-optspecpick')).includes('Two Handed') && q1(0, '.fb-optspec').hidden === true && oBox.value.indexOf('Off Hand = Skills.knife.TwoHanded.Target,') === 0, oBox.value);
        chg(q1(0, '.fb-optspecpick'), '@type'); chg(q1(0, '.fb-optspec'), '\u00d8rsted');
        check('the review of gap 4: a typed specialty whose letters a name cannot keep is refused and said, and the option keeps what it held', oBox.value.indexOf('Off Hand = Skills.knife.TwoHanded.Target,') === 0 && q1(0, '.fb-optsay').hidden === false && q1(0, '.fb-optsay').textContent.indexOf('\u00d8rsted cannot be kept') > 0 && q1(0, '.fb-optspec').value === '', q1(0, '.fb-optsay').textContent);
        chg(q1(0, '.fb-optspecpick'), 'OffHand');
        check('the review of gap 4: a known specialty is picked by its name, with nothing typed', oBox.value.indexOf('Off Hand = Skills.knife.OffHand.Target,') === 0 && q1(0, '.fb-optsay').hidden === true && q1(0, '.fb-optspec').hidden === true, oBox.value);
        chg(q1(0, '.fb-optspecpick'), '');
        check('gap 4: an empty specialty reads the entry itself', oBox.value.indexOf('Off Hand = Skills.knife.Target,') === 0, oBox.value);
        chg(q1(1, '.fb-optrowfig'), 'bonus');
        check('gap 4: another figure of the row is picked by its name', oBox.value.indexOf('Blade = Skills.knife.bonus,') > 0, oBox.value);
        chg(q1(2, '.ui-find-sel'), 'club');
        check('gap 4: an entry that was gone can be picked again from the list', oBox.value.indexOf('Old = Skills.club.Target,') > 0, oBox.value);
        chg(q1(1, '.fb-optfig'), '');
        check('gap 4: Just this word takes the row\u2019s picks away', oBox.value.indexOf('Blade, ') > 0 && !q1(1, '.fb-optrow'), oBox.value);
        chg(q1(1, '.fb-optfig'), '@list:Gear'); chg(q1(1, '.ui-find-sel'), 'rope');
        check('gap 4: a list without Specialties asks none, and starts on its first figure', !q1(1, '.fb-optspec') && !q1(1, '.fb-optspecpick') && oBox.value.indexOf('Blade = Gear.rope.wt,') > 0, oBox.value);
        {   // The typing slip of 2026-11-19: a typed specialty that no row of the list and no other option names yet says so in a gray line,
            // with what it then reads (systemcore.js specVal's order) and Did you mean where a known one is within one or two slips. Typing
            // stays allowed (Fulllion, "Keep typing allowed"). Invented data: Kael's skills, Knife and Pebbles
            const skS = { cats: ['Skill'], lvl: { label: 'Level' }, stats: [{ key: 'fb', label: 'Fallback' }, { key: 'ap', label: 'Apart', labels: ['Thrown', 'Skipping'] }], cols: [{ key: 'Target', label: 'Target' }], specs: { fall: 'fb', apart: 'ap' } };
            const sysK = { fields: [{ id: 'f_k', key: 'Skills', label: 'Skills', kind: 'item-list', list: skS }, { id: 'f_b', key: 'Bare', label: 'Bare', kind: 'item-list', list: { lvl: { label: 'Level' }, specs: {} } }],
                items: [{ key: 'knife', name: 'Knife', category: 'Skill' }, { key: 'knife__OffHand', name: 'Knife off hand', category: 'Skill' }, { key: 'kt', name: 'Knife (Thrown)', category: 'Skill' },
                    { key: 'pebbles', name: 'Pebbles', category: 'Skill', stats: { AP: 2 } }, { key: 'pq', name: 'Pebbles: Quick', category: 'Skill' }] };
            const LK = C.optLists(sysK, []), kL = LK.filter(l => l.key === 'Skills')[0], bL = LK.filter(l => l.key === 'Bare')[0];
            check('the typing slip: a list with Specialties carries whether its box names a Fallback, and which specialties each entry keeps apart, read from the entry’s own Stands apart stat',
                kL.fall === true && bL.fall === false && j(kL.apart.pebbles) === j(['skipping']) && kL.apart.knife === undefined && j(Object.keys(bL.apart)) === '[]', j([kL.fall, kL.apart, bL.fall]));
            const nK = C.optSpecNote(kL, 'knife', 'OfHand', []);
            check('the typing slip: a specialty no row names says so by name and reads the parent with its fallback, and one slip from a known one asks Did you mean it',
                nK && nK.says === 'No Skills row is Knife (Of Hand) yet. Until one is, this reads Knife with its fallback, and Knife untrained for a character who has no Knife at all.' && j(nK.near) === j(['OffHand', 'Off Hand']), j(nK));
            const n2 = C.optSpecNote(kL, 'knife', 'OfHnd', []), n3 = C.optSpecNote(kL, 'knife', 'Ohnd', []), nT = C.optSpecNote(kL, 'knife', 'Thrwon', []), nJ = C.optSpecNote(kL, 'knife', 'Juggling', []);
            check('the typing slip: two slips still find the known specialty, a swap of two letters is one, and three or a new word find none',
                n2 && j(n2.near) === j(['OffHand', 'Off Hand']) && n3 && n3.near === null && nT && j(nT.near) === j(['Thrown', 'Thrown']) && nJ && nJ.near === null, j([n2, n3, nT, nJ]));
            check('the typing slip: a specialty a row names, in any case or spacing, or one another option of the stat names, or none at all, says nothing',
                C.optSpecNote(kL, 'knife', 'offhand', []) === null && C.optSpecNote(kL, 'KNIFE', 'Thrown', []) === null && C.optSpecNote(kL, 'knife', 'Juggling', ['Juggling']) === null && C.optSpecNote(kL, 'knife', '', []) === null && C.optSpecNote(kL, '', 'OfHand', []) === null && C.optSpecNote(null, 'knife', 'OfHand', []) === null);
            const nA = C.optSpecNote(kL, 'pebbles', 'Skipping', []), nB = C.optSpecNote(bL, 'pebbles', 'Skipping', []);
            check('the typing slip: a specialty the parent keeps apart reads the parent untrained, and a list whose Specialties name no Fallback reads the parent at its own figure',
                nA && nA.says === 'No Skills row is Pebbles (Skipping) yet. Until one is, this reads Pebbles untrained, since Skipping stands apart for Pebbles.' && nA.near === null
                && nB && nB.says === 'No Bare row is Pebbles (Skipping) yet. Until one is, this reads Pebbles at its own figure, since the Specialties name no Fallback, and Pebbles untrained for a character who has no Pebbles at all.', j([nA, nB]));
            B.setSource(() => ({ groups: [], word: () => '', sys: sysK, get lib() { return []; } }));
            const mk = v => { const rt = doc.createElement('div'), bx = doc.createElement('input'); bx.type = 'text'; bx.className = 'sys-list-statopts field'; bx.value = v; rt.appendChild(bx); modal.appendChild(rt); B.sweep(rt); return { rt, bx, q: (i, c) => rt.querySelectorAll('.fb-opt')[i].querySelector(c) }; };
            const kStored = 'Low = Skills.knife.OfHand.lvl, Plain = Skills.knife.lvl', K1 = mk(kStored), line0 = K1.q(0, '.fb-optspecsay');
            check('the typing slip: a stored specialty no row names shows its gray line with Did you mean and a button, by names only, and dressing writes nothing',
                K1.bx.value === kStored && K1.bx.calls.length === 0 && line0.hidden === false && line0.textContent === 'No Skills row is Knife (Of Hand) yet. Until one is, this reads Knife with its fallback, and Knife untrained for a character who has no Knife at all. Did you mean Off Hand? Use Off Hand'
                && K1.q(0, '.fb-optspecfix').textContent === 'Use Off Hand' && K1.q(0, '.fb-optspecpick').value === 'OfHand' && K1.q(1, '.fb-optspecsay').hidden === true && !/Skills\.|knife|OfHand|lvl/.test(line0.textContent), line0.textContent);
            press(K1.q(0, '.fb-optspecfix'));
            const K2 = mk(kStored); chg(K2.q(0, '.fb-optspecpick'), 'OffHand');
            check('the typing slip: the button writes exactly what picking that specialty from the list writes, and the line goes',
                K1.bx.value === 'Low = Skills.knife.OffHand.lvl, Plain = Skills.knife.lvl' && K1.bx.value === K2.bx.value && K1.q(0, '.fb-optspecpick').value === 'OffHand' && K1.q(0, '.fb-optspecsay').hidden === true && K1.q(0, '.fb-optspec').hidden === true, j([K1.bx.value, K2.bx.value]));
            chg(K1.q(0, '.fb-optspecpick'), '@type'); chg(K1.q(0, '.fb-optspec'), 'juggling');
            check('the typing slip: a new specialty typed is kept as typed, and its line says what it reads with no Did you mean where none is near',
                K1.bx.value.indexOf('Low = Skills.knife.Juggling.lvl,') === 0 && K1.q(0, '.fb-optspecsay').hidden === false && /^No Skills row is Knife \(Juggling\) yet\./.test(K1.q(0, '.fb-optspecsay').textContent) && !K1.q(0, '.fb-optspecfix'), K1.q(0, '.fb-optspecsay').textContent);
            chg(K1.q(1, '.fb-optspecpick'), '@type'); chg(K1.q(1, '.fb-optspec'), 'Juggling');
            check('the typing slip: once another option names the same specialty, both lines go, since the stat names it on purpose',
                K1.bx.value === 'Low = Skills.knife.Juggling.lvl, Plain = Skills.knife.Juggling.lvl' && K1.q(0, '.fb-optspecsay').hidden === true && K1.q(1, '.fb-optspecsay').hidden === true, K1.bx.value);
        }
        {   // the review of gap 4: an entry not found while a library pack is not read yet is said to be loading, never gone
            const libW = libO.slice(); libW.waiting = true;
            B.setSource(() => ({ groups: [{ name: 'This character', items: [{ label: 'Strength', s: 'ST' }] }], word: () => '', sys: sysO, get lib() { return libW; } }));
            const oR3 = doc.createElement('div'), oB3 = doc.createElement('input'); oB3.type = 'text'; oB3.className = 'sys-list-statopts field'; oB3.value = 'Old = Skills.axe.Target'; oR3.appendChild(oB3); modal.appendChild(oR3); B.sweep(oR3);
            check('the review of gap 4: while the library is still loading, a stored entry it cannot find is said to be loading and kept', oB3.value === 'Old = Skills.axe.Target' && j(texts(oR3.querySelector('.ui-find-sel')).slice(0, 2)) === j(['Pick an entry', 'An entry of the library, still loading']));
            {   // 1.6.3 (the review of the System editor and the Library window, finding 11; Fulllion's pick of 2026-11-21): a box of the Library window reads
                // the system as saved, never the System editor's draft, while a box of the editor reads the draft (sysedbox.js formSource, run on stand-ins)
                const sbS = require('./checkkit').part('sysedbox.js').replace(/\r\n/g, '\n'), fsA = sbS.indexOf('function formSource(inp) {'), fsB = sbS.indexOf('\n// [formcheck:source-end]', fsA);
                const saved = { fields: [{ key: 'Saved' }] }, drafted = { fields: [{ key: 'Draft' }] };
                const mkFS = dr => new Function('draft', 'getActiveCampaign', 'systemOf', 'formCtx', 'formLib', 'formTrial', 'readsOf', 'nameWord', '"use strict";\n' + sbS.slice(fsA, fsB) + '\nreturn formSource;')(dr, () => ({ system: saved }), c => c.system, () => ({}), () => [], () => null, () => [], () => '');
                const libIn = { id: 'libF_needsIf' }, edIn = { id: '', className: 'sys-roll-needs' };
                check('1.6.3 (finding 11) a box of the Library window reads the system as saved, even while the System editor holds a draft, and a box of the editor reads its draft; with no draft both read the saved system',
                    fsA > 0 && fsB > fsA && mkFS(drafted)(libIn).sys === saved && mkFS(drafted)(edIn).sys === drafted && mkFS(null)(libIn).sys === saved && mkFS(null)(edIn).sys === saved);
                // the review of the System editor library: a Library box with no id (the change by a formula, lib-mod-amtf) is told by its lib- class or by
                // standing in #libraryModal, never read against the draft
                const amtfIn = { id: '', className: 'field lib-mod-amtf' }, inLib = { id: '', className: 'field', closest: q => q === '#libraryModal' ? {} : null }, notLib = { id: '', className: 'field sys-fx-amtf', closest: () => null };
                check('the review of the System editor library: the Library’s change-by-a-formula box, which has no id, and any box inside the Library window read the system as saved while the System editor holds a draft; a box of the editor still reads the draft',
                    mkFS(drafted)(amtfIn).sys === saved && mkFS(drafted)(inLib).sys === saved && mkFS(drafted)(notLib).sys === drafted);
            }
            const sbx = require('./checkkit').part('sysedbox.js'), flA = sbx.indexOf('function formLib()'), flB = sbx.indexOf('\nfunction formSource', flA);   // sysedbox.js, its formLib run on a stand-in library
            const formLib = new Function('window', 'getActiveCampaign', sbx.slice(flA, flB) + '\nreturn formLib;');
            const packsL = { p1: [{ key: 'a', name: 'A', category: 'Skill' }, { key: 'b', name: 'B', category: 'Skill', vis: 'gm' }, null, { name: 'no key' }], p2: [{ key: 'c', name: 'C', category: 'Skill' }], p3: [] };
            const campL = { library: { packs: [{ id: 'p1' }, { id: 'p2', vis: 'gm' }, { id: 'p3' }, null] } }, run = lb => formLib(lb === undefined ? {} : { wpLibrary: lb }, () => campL)();
            const r1 = run({ entriesOf: id => packsL[id] || [], ready: id => id !== 'p3' }), r2 = run({ entriesOf: id => packsL[id] || [], ready: () => true }), r3 = run({ entriesOf: id => packsL[id] || [], whole: () => false }), r4 = run();
            check('the review of gap 4: formLib hands on each listed pack\u2019s entries by key, name and category, a GM-only pack\u2019s and a GM-only entry marked GM only, and says it is waiting while a pack is not read yet',
                j(r1) === j([{ key: 'a', name: 'A', category: 'Skill', vis: 'all' }, { key: 'b', name: 'B', category: 'Skill', vis: 'gm' }, { key: 'c', name: 'C', category: 'Skill', vis: 'gm' }]) && r1.waiting === true
                && j(r2) === j(r1) && r2.waiting !== true && r3.waiting === true && j(r4) === '[]' && r4.waiting !== true, j([r1, r1.waiting, r2.waiting, r3.waiting, r4]));
        }
        B.setSource(() => ({ groups: [{ name: 'This character', items: [{ label: 'Strength', s: 'ST' }] }], word: () => '' }));
        const oRoot2 = doc.createElement('div'), oBox2 = doc.createElement('input'); oBox2.type = 'text'; oBox2.className = 'sys-list-statopts field'; oBox2.value = 'Blade = Skills.knife.Target'; oRoot2.appendChild(oBox2); modal.appendChild(oRoot2); B.sweep(oRoot2);
        check('gap 4: with no system at hand the option is drawn as before and kept', oBox2.value === 'Blade = Skills.knife.Target' && j(texts(oRoot2.querySelector('.fb-optfig'))) === j(['Just this word', 'Stands for Strength', 'Stands for a figure that is gone']) && !oRoot2.querySelector('.fb-optrow'));
        {   // 1.6.3 (the review of the System editor and the Library window, finding 31): an item's Thrown with holds ONE name, picked as a stat's
            // option is (dressOpts with one): a figure of the sheet, or of one row of a list, never typed. The Items tab's box, and the Library window's
            B.setSource(() => ({ groups: [{ name: 'This character', items: [{ label: 'Strength', s: 'ST' }] }], word: () => '', sys: sysO, get lib() { return libO; } }));
            const tw = (cls, id, v, ph) => { const rt = doc.createElement('div'), bx = doc.createElement('input'); bx.type = 'text'; if (cls) bx.className = cls; if (id) bx.id = id; if (ph) bx.placeholder = ph; bx.value = v; rt.appendChild(bx); modal.appendChild(rt); B.sweep(rt); return { rt, bx, q: c => rt.querySelector(c) }; };
            const T1 = tw('sys-item-throw field', '', 'st', 'Throw skill'), T2 = tw('', 'libF_throwSkill', 'Skills.knife.Target'), T3 = tw('sys-item-throw field', '', '');
            check('1.6.3 (finding 31) an item\u2019s Thrown with is picked, never typed: the box is hidden behind one row of picks with no name box, no x and no + Option, its first choice No throw roll, a figure of the sheet by its name and each list\u2019s rows; a name stored in another case shows as the figure it reads; dressing writes nothing; the Items tab\u2019s box says its own words before the pick, the Library\u2019s has its own label',
                T1.bx.hidden === true && T1.rt.querySelectorAll('.fb-opt').length === 1 && !T1.q('.fb-optname') && !T1.q('.fb-optrm') && !T1.q('.fb-optadd') && T1.q('.fb-optfig').value === 'ST' && T1.bx.value === 'st' && T1.bx.calls.length === 0
                && j(texts(T1.q('.fb-optfig'))) === j(['No throw roll', 'Strength', 'A row of Skills', 'A row of Gear']) && T1.q('.fb-onecap').textContent === 'Throw skill:'
                && T2.bx.hidden === true && !T2.q('.fb-onecap') && T2.q('.fb-optfig').value === '@list:Skills' && T2.q('.ui-find-sel').value === 'knife' && T2.q('.fb-optrowfig').value === 'Target' && T2.bx.calls.length === 0
                && T3.q('.fb-optfig').value === '', j([T1.bx.value, texts(T1.q('.fb-optfig'))]));
            chg(T3.q('.fb-optfig'), 'ST');
            const one1 = T3.bx.value; chg(T3.q('.fb-optfig'), '@list:Skills'); const held = [T3.bx.value, T3.q('.fb-optsay').textContent]; chg(T3.q('.ui-find-sel'), 'club'); const one2 = T3.bx.value; chg(T3.q('.fb-optrowfig'), 'bonus'); const one3 = T3.bx.value; chg(T3.q('.fb-optfig'), '');
            check('1.6.3 (finding 31) a pick writes the one name the cleaner keeps and says so to the editor: a figure by its name, a row of a list once an entry is picked (until then the box keeps what it held and the gray line says so), another figure of the row, and No throw roll empties it',
                one1 === 'ST' && held[0] === 'ST' && /still stands for Strength/.test(held[1]) && one2 === 'Skills.club.lvl' && one3 === 'Skills.club.bonus' && T3.bx.value === '' && T3.bx.calls.includes('dispatch change'), j([one1, held, one2, one3, T3.bx.value]));
        }
        const fbS = readU('scripts/formbox.js');
        check('gap 4: the entry is the app\u2019s own choice of many with a search, and nothing of it is markup', /import \{ find \} from '\.\/uiparts\.js';/.test(fbS) && /var fe = find\(\{/.test(fbS) && /pk\.appendChild\(fe\);/.test(fbS) && /sys: d, get lib\(\) \{ return formLib\(\); \}/.test(require('./checkkit').part('sysedbox.js')));
    }
    {
        const shK = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), kS = require('./checkkit').cut('sysedtabs.js', 'var KEY_FOLLOW = {', 'function onInput(e) {');
        const fired = []; class Ev { constructor(n, o) { this.type = n; this.o = o; } } const box = (c, v) => { const b = { value: v || '', dataset: {}, classList: { contains: x => c.split(' ').includes(x) }, dispatchEvent: e => fired.push([c, b.value, e.type]) }; return b; };
        const row = (ks) => { const r = { querySelector: s => ks.filter(k => s === '.' + k.c)[0] || null }; return r; };
        const mk = (labelC, keyC, sel, others) => { const key = box(keyC, ''), lab = box(labelC, ''), r = row([{ c: keyC }]); r.querySelector = s => (s === '.' + keyC ? key : null); r.parentNode = { querySelectorAll: () => [key].concat(others || []) }; lab.closest = q => (q === sel ? r : null); return { key, lab }; };
        const K = new Function('statKey', 'F', 'Event', kS + '\nreturn { keyBoxFollow, keyWord };')((w) => !/^(count|qty|on|has|lvl|paid|row)$/i.test(w), () => ({}), Ev);
        check('a name makes its short form as letters and digits, starting with a letter', K.keyWord('Hit points') === 'HitPoints' && K.keyWord('2nd wind!') === 'ndWind' && K.keyWord('Déjà') === 'DJ' && K.keyWord('') === '');
        const a = mk('sys-list-statlabel', 'sys-list-statkey', '.sys-list-stat'); a.lab.value = 'Hit points'; K.keyBoxFollow(a.lab); a.lab.value = 'Hit points left'; K.keyBoxFollow(a.lab);
        check('the short form follows the name while it is new, and tells the page as if it were typed', a.key.value === 'HitPointsLeft' && fired.length === 2 && fired[1][2] === 'input', JSON.stringify(a.key.value));
        const b = mk('sys-list-statlabel', 'sys-list-statkey', '.sys-list-stat'); b.key.value = 'Old'; b.lab.value = 'New name'; K.keyBoxFollow(b.lab);
        check('one already there stays, so a rename breaks nothing', b.key.value === 'Old');
        const c = mk('sys-list-statlabel', 'sys-list-statkey', '.sys-list-stat', [{ value: 'Wear' }, { value: 'Wear2' }]); c.lab.value = 'Wear'; K.keyBoxFollow(c.lab);
        check('two of one name are told apart', c.key.value === 'Wear3', c.key.value);
        const d = mk('sys-list-statlabel', 'sys-list-statkey', '.sys-list-stat'); d.lab.value = 'Count'; K.keyBoxFollow(d.lab);
        check('a word a formula already uses is passed over on a list', d.key.value === 'CountStat', d.key.value);
        const nP = fired.length; K.keyBoxFollow(box('sys-other', 'x')); K.keyBoxFollow({ classList: null }); K.keyBoxFollow(null);
        check('any other box is left alone', fired.length === nP);
        const css = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'style.css'), 'utf8'), page = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8');
        check('the short forms stand out of sight until a tick of this computer shows them, and each control stays in the page', ['sys-list-statkey', 'sys-list-colkey', 'sys-list-ctkey', 'sys-dmgr-ykey', 'sys-dmgr-kkey', 'sys-item-key', 'sys-tbl-ckey'].every(k => css.includes('#systemModal:not(.sys-show-keys) .' + k)) && ['sys-env-key', 'sys-tbl-key', 'sys-link-key', 'sys-key'].every(k => css.includes('label:has(> .' + k + ')')) && page.includes('id="sysShowKeys"') && require('./checkkit').part('sysedlist.js').includes("input('sys-list-statkey field'"));
    }

    {   // 1.6.2 (backlog 167 D; the owner, by prompt: "Also contains"): a test of the words a field holds, in the form
        const SCw = await import(url('systemcore.js')), J = JSON.stringify;
        const rt = s => { const r = C.readCond(s); return r.ok ? [J(r.cond.tests[0]), C.writeCond(r.cond), C.saysCond(r.cond, { name: n => n === 'Class' ? 'Class' : n })] : ['', r.error.message, '']; };
        const a = rt('is(Class, "Star Pilot", "Ace")'), b = rt('contains(Class, "pil")'), c = rt('Lvl >= 2 and is(Class, "Medic")'), d = C.read('if(is(Class, "a"), 2, 3)');
        const made = C.writeCond({ any: false, tests: [{ words: { how: 'is', name: 'Class', list: ['Say "hi"', 'x\ny'] } }] }), madeOk = F.parse(made).ok, empty = F.parse(C.writeCond({ any: false, tests: [{ words: { how: 'contains', name: 'Class', list: [] } }] })).ok;
        check('167 D the form reads a test of words and writes it back as it was, says it in words, and writes words in quotes with no quote or line break in them; a test with no words is no formula, so its box says so',
            a[0] === J({ words: { how: 'is', name: 'Class', list: ['Star Pilot', 'Ace'] } }) && a[1] === 'is(Class, "Star Pilot", "Ace")' && a[2] === 'Class is one of \u201cStar Pilot\u201d, \u201cAce\u201d'
            && b[1] === 'contains(Class, "pil")' && b[2] === 'Class contains \u201cpil\u201d' && c[1] === 'Lvl >= 2 and is(Class, "Medic")' && C.write(d.form) === 'if(is(Class, "a"), 2, 3)'
            && made === 'is(Class, "Say  hi", "x y")' && madeOk && !empty, J([a, b, c, made, empty]));
        const ws = SCw.cleanSystem({ v: 1, name: 'W', fields: [{ id: 'f_c', key: 'Class', kind: 'text' }, { id: 'f_r', key: 'Rank', kind: 'select', options: ['Ace', 'Rookie'] }, { id: 'f_g', key: 'Grade', kind: 'number', labels: ['Low', 'High'] }, { id: 'f_n', key: 'Lvl', kind: 'number' },
            { id: 'f_w', key: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Kind', labels: ['Blade'] }, { key: 'Wt' }, { key: 'Make', kind: 'pick', opts: [{ label: 'Steel', name: 'Steel' }] }] } }] }, { F, gmView: true });
        const flat = g => g.reduce((x, y) => x.concat(y.items.map(i => i.s)), []), top = flat(SCw.readsOf(ws, { words: true })), row = flat(SCw.readsOf(ws, { words: true, list: ws.fields[4].list })), only = SCw.readsOf(ws, { words: true, only: ['Distance'] });
        const mW = B.menuRows('', { groups: [{ name: 'x', items: [{ label: 'Lvl', s: 'Lvl' }] }], wgroups: [{ name: 'This character', items: [{ label: 'Class', s: 'Class' }] }] }, false, true);
        const bad = top.concat(row).filter(n => SCw.validateSystem(Object.assign({}, ws, { fields: ws.fields.concat([{ id: 'f_t', key: 'T', label: 'T', kind: 'formula', formula: 'is(' + n + ', "a")' }]) }), F).errors.length && !/^Row\./.test(n));
        check('167 D a test of words is offered what has words and nothing else: a text, a choice and a number with value names, and in a list\'s box its row\'s choices; a box with names of its own offers none; the menu then holds the fields alone, with no number or dice beside them; the validator takes every one',
            J(top) === J(['Class', 'Rank', 'Grade']) && J(row) === J(['Row.Kind', 'Row.Make', 'Class', 'Rank', 'Grade']) && only.length === 0
            && J(mW.map(g => g.head)) === J(['This character']) && bad.length === 0, J([top, row, mW, bad]));
        const h1 = C.readCond('holds(Cultures, Culture)'), h2 = C.readCond('holds(Cultures, "Zabrak") and Lvl > 1');
        check('164 i the form reads holds() as a test of words, a field or words in quotes naming a row of a list, writes it back and says it',
            J(h1.cond.tests[0]) === J({ words: { how: 'holds', lst: 'Cultures', name: 'Culture', list: [] } }) && C.writeCond(h1.cond) === 'holds(Cultures, Culture)' && C.saysCond(h1.cond, {}) === 'Culture names a row of Cultures'
            && C.writeCond(h2.cond) === 'holds(Cultures, "Zabrak") and Lvl > 1' && /^\u201cZabrak\u201d names a row of Cultures/.test(C.saysCond(h2.cond, {})), J([h1, h2]));
        const fbs = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'formbox.js'), 'utf8'), css = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'style.css'), 'utf8');
        check('167 D the form\'s row for it: a field picked by name, is one of or contains, and the words in a box styled as the form\'s own; + Compare words stands under the tests only where something has words',
            fbs.includes("var WORDS_HOW = [['is', 'is one of'], ['contains', 'contains'], ['holds', 'names a row of']];") && fbs.includes("if (t.words) wordsTestInto(row, t.words, pi);") && fbs.includes("'+ Compare words'") && /\.fb-wordlist \{[^}]*background: var\(--panel\)/.test(css));
    }

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exitCode = 1; });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });
