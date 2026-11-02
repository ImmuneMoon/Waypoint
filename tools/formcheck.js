/* Offline check of formulas as forms (1.6.2; the owner, 2026-11-02: "we shouldnt be using code expressions on the user side", by prompt "Forms for
   every formula", "A. Steps" and "A small As text link"). The pure half (formcore.js) is imported and run: a formula read into steps and written
   back rolls and reads as it did, over a fixed list, a seeded corpus and every formula of the starters, and says what it does in words. The form
   (formbox.js) is run on tools/boxdom.js, a page that refuses markup: a box dressed with its value and its class kept, a form opened and left that
   writes nothing, a step that writes the box and says so. The wiring is pinned. No browser, no network.
   Usage: node tools/formcheck.js   (exit 1 on any failure) */
'use strict';
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
    const seeded = seed => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
    const ev = (t, seed) => { const r = F.evaluate(t, { vars, random: seeded(seed) }); return r.ok ? r.value + '|' + r.draws.join(',') : 'ERR ' + r.error.message; };
    const same = (a, b) => { for (let s = 1; s <= 6; s++) if (ev(a, s * 977) !== ev(b, s * 977)) return false; return true; };
    const trip = t => { const r = C.read(t); if (!r.ok) return !F.parse(t).ok; const w = C.write(r.form), r2 = C.read(w); return same(t, w) && r2.ok && C.write(r2.form) === w; };

    /* ================= read and write ================= */
    const fixed = ['1', '-1', '2 + 3 * 4', '(2 + 3) * 4', '2 * (3 + 4) * 5', 'a - (b - c)', 'a / (b / c)', 'floor((Agility.max + Might) / 4)', '2 ^ 3 ^ 2', '2 ^ (3 ^ 2)', '-(2 + 3)', '-2 ^ 2', '(-2) ^ 2', '--true', '3d6', 'd20', '4d6kh3', '4d6dl', '3d6 <= Skill', 'd20 + 5 >= 10', '(Level)d6', 'd(Skill)', '(Level + 1)d6kh(Str)', '6d10!!cs>=8', '6d10!!>=9', '2d6r1', '2d6rr<=2', '3dF', 'd%', '5d10@p', 'with(5d10@p, high(p))', 'with(6d10@p, high(p) + count(p >= 7))', 'with(2d10@c, 1d6 + 3 >= high(c))', 'if(Str > 2 and Might < 3, Skill / 2, 0)', 'max(1, Str)', 'min(Str, 3)', 'max(1, 2, 3)', 'clamp(Str, 1, 2)', 'round(Str / 3, 2)', 'mod(7, 2)', 'Str >= 3 or Might < 2 and Skill = 11', '(Str >= 3 or Might < 2) and Skill = 11', 'not not Str', 'not true and false', '(Str > 1) + 1', 'and(Str, Might)', 'has(Str, 1)', 'digit(123, 2)', '(2 >= 1) >= 1', 'if(Str, 1, 2) + 3', '1 + if(Str, 1, 2)'];
    const badF = fixed.filter(t => !trip(t));
    check('a formula read into steps and written back rolls and reads as it did, and a second pass changes nothing: arithmetic and its brackets, dice with every modifier, dice read twice, tests, and a plus sign that turns a yes or no into a number', badF.length === 0, j(badF));
    const R = seeded(12345), pick = a => a[Math.floor(R() * a.length)];
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
    check('a form says what it does in words, and no code', sayT('floor((Agility.max + Might) / 4)') === 'Agility at its most plus Might divided by 4, rounded down' && sayT('3d6 + 2 <= Skill') === '3d6 plus 2, a success if it is at most Skill' && sayT('4d6kh3') === '4d6, keeping the highest 3' && sayT('6d10!!cs>=8') === '6d10, each exploding into a die of its own, counting 8 or more as a success' && sayT('max(1, Might)') === 'Might, at least 1' && sayT('clamp(Might, 1, 5)') === 'Might, held between 1 and 5' && !/[(){}@]|\bmax\b|\bfloor\b/.test(sayT('floor(max(Might, 1))')), sayT('floor((Agility.max + Might) / 4)'));
    check('a yes or no says it too', C.saysCond(C.readCond('HP < 3 and Str >= 2').cond, {}) === 'HP is under 3, and Str is at least 2' && C.saysCond(C.readCond('HP < 3 or Str').cond, {}) === 'HP is under 3, or Str' && C.saysCond(C.readCond('not (Str = 3)').cond, {}) === 'not (Str is 3)');
    check('dice read twice say what is read', sayT('with(6d10@p, high(p) + count(p >= 7))') === 'roll 6d10 to read, then the highest of p plus how many of p is at least 7');

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
    check('a value that is no formula is shown as text and marked, and nothing of it is markup', evW.textContent === '<img src=x onerror=1>' && evil.parentNode.querySelector('.fb-line').classList.contains('fb-bad') && evil.value === '<img src=x onerror=1>');
    check('a roll on the Rolls tab is a roll, a field is a figure', B.kindOf(inp) === 'amt' && (() => { const r = doc.createElement('div'); r.className = 'sys-row'; r.dataset.id = 'r_a'; const i = doc.createElement('input'); i.className = 'sys-formula'; r.appendChild(i); return B.kindOf(i) === 'roll'; })());
    const go = wrap.querySelector('.fb-go'), calls = inp.calls;
    go.click ? go.click() : go.handlers.click.forEach(h => h({ preventDefault() {} }));
    const body = wrap.querySelector('.fb-open');
    check('Change opens the steps in the row', !!body && wrap.querySelector('.fb-line').hidden === true && body.querySelectorAll('.fb-step').length === 4, body && body.querySelectorAll('.fb-step').length);
    const press = e => e.click ? e.click() : (e.handlers.click || []).forEach(h => h({ preventDefault() {}, target: e }));
    press(body.querySelector('.fb-done'));
    check('opened and left, it writes nothing and says nothing', inp.value === 'floor((Agility.max + Might) / 4)' && !inp.calls.some(c => /dispatch/.test(c)), j(inp.calls));
    press(wrap.querySelector('.fb-go')); const b2 = wrap.querySelector('.fb-open');
    press(b2.querySelector('.fb-add'));
    check('a step writes the box and says so, and the box still parses', inp.value === 'floor((Agility.max + Might) / 4) + 0' && inp.calls.some(c => c === 'dispatch input') && F.parse(inp.value).ok, inp.value);
    press(wrap.querySelector('.fb-cancel'));
    check('Cancel puts it back and says so', inp.value === 'floor((Agility.max + Might) / 4)', inp.value);
    const mr = B.menuRows('mig', { groups: [{ name: 'This character', items: [{ label: 'Might', s: 'Might' }, { label: 'Agility', s: 'Agility' }] }] }, false), mr2 = B.menuRows('', { groups: [] }, true), mr3 = B.menuRows('', { groups: [] }, false);
    check('the value list is found by its words, shows nothing a box cannot read, and offers dice only where a box takes them', mr[0].items.length === 1 && mr[0].items[0].s === 'Might' && mr2[0].items.some(i => i.kind === 'dice') && !mr3[0].items.some(i => i.kind === 'dice'));
    check('what a pick makes', j(B.menuPick({ s: 'Might' })) === j({ k: 'name', s: 'Might' }) && B.menuPick({ kind: 'num' }).k === 'num' && B.menuPick({ kind: 'dice' }).k === 'dice' && C.write({ steps: [{ op: 'start', v: B.menuPick({ kind: 'dice' }) }] }) === '1d6');

    /* ================= every name in words ================= */
    const SC = await import(url('systemcore.js'));
    const wf = [{ id: 'f_sm', key: 'STRmod', label: 'STR modifier', kind: 'formula', formula: '1' }, { id: 'f_sk', key: 'Skill.Stealth', label: 'Stealth', kind: 'skill', base: '', def: 0 }, { id: 'f_hp', key: 'HP', label: 'Hit Points', kind: 'resource', maxFormula: '10' }, { id: 'f_t', key: 'Note', kind: 'text' }, { id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', list: { stats: [{ key: 'wt', label: 'Weight' }, { key: 'mat', label: 'Material', kind: 'pick', opts: [{ label: 'Iron', name: 'Iron' }] }], cols: [{ key: 'dr', label: 'DR', formula: '1' }], on: {} } }];
    const ws = { fields: wf, items: [{ id: 'i_a', key: 'axe', name: 'Axe' }], rolls: [] }, nw = (n, sp) => SC.nameWord(ws, n, sp);
    check('a field reads by its label, a key never shows', nw('STRmod') === 'STR modifier' && nw('Skill.Stealth') === 'Stealth' && nw('HP') === 'Hit Points' && nw('HP.max') === 'Hit Points at its most' && nw('strmod') === 'STR modifier', j([nw('STRmod'), nw('Skill.Stealth'), nw('HP.max')]));
    check('a name of the app says what it is', nw('AttemptMargin') === 'how far their attempt beat its target' && nw('attemptmargin') === 'how far their attempt beat its target' && nw('RollMargin') === 'how far this roll passed or failed by' && nw('Blow.wound') === 'the wound it dealt' && nw('TargetDistance') === 'the distance to the target', nw('AttemptMargin'));
    check('a name read off a list, a row or someone else', nw('Gear.count') === 'how many rows of Gear' && nw('Gear.wt') === 'the total Weight of Gear' && nw('Gear.max.dr') === 'the highest DR in Gear' && nw('Gear.on.wt') === 'the total Weight of Gear switched on' && nw('Gear.axe.dr') === 'DR of Axe in Gear' && nw('Row.lvl') === 'this row\u2019s level' && nw('Row.wt', wf[4].list) === 'this row\u2019s Weight' && nw('Target.STRmod') === 'the target\u2019s STR modifier' && nw('Attempter.STRmod') === 'their STR modifier', j([nw('Gear.axe.dr'), nw('Row.wt', wf[4].list)]));
    check('a field of that very name keeps it, and what is nothing here is said as written', SC.nameWord({ fields: [{ id: 'f_a', key: 'AttemptMargin', label: 'Mine', kind: 'number' }] }, 'AttemptMargin') === 'Mine' && nw('NoSuchThing') === 'No Such Thing' && SC.nameWord(null, 'A.b') === 'A b', nw('NoSuchThing'));
    const sysRaw = sysFiles.map(f => JSON.parse(fs.readFileSync(f, 'utf8'))).map(s => SC.cleanSystem(s.system || s, { F, gmView: true })).filter(Boolean);
    const tests = [{ then: false }, { resist: true }, { to: 'near' }, { cross: { f: 'x' } }, { blow: true }, { then: true }];
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
    const dcs = readU('scripts/dice.js'), shs = readU('scripts/sheets.js'), ixs = readU('index.html');
    const noCode = /STRmod|Skill\.Stealth/;
    check('nothing teaches a key: the notes, the boxes and the roller', !noCode.test(ixs.split('id="sysRolls"')[1].split('sys-toolbar')[1].slice(0, 400)) && !/'[^']*STRmod[^']*'/.test(shs) && !/placeholder="[^"]*kh3/.test(ixs) && !ixs.includes('names like STR'));
    check('a roll\u2019s tooltip names the roll, never its formula', !/b\.title = r\.formula/.test(shs) && !/\+ r\.formula \+ ' \(shift-click/.test(shs) && !/'Roll ' \+ f\.roll/.test(shs) && !/cbR \+ ' \\u2014 ' \+ r\.formula/.test(shs));
    check('a card\u2019s hover and the \u00b1 window keep names off', /function namesHover/.test(dcs) && /function prevWords/.test(dcs) && /Fw\.plainDice/.test(dcs));

    /* ================= the wiring ================= */
    const ix = readU('index.html'), sh = readU('scripts/sheets.js'), ek = readU('scripts/esckey.js'), st = readU('style.css'), fb = readU('scripts/formbox.js');
    check('the page loads the form, the System editor hands it its names and has it watch', ix.includes('src="scripts/formbox.js"') && /wpFormBox\.setSource\(formSource\)/.test(sh) && /wpFormBox\.watch\(/.test(sh));
    check('Escape in a form is the form\'s, and the form holds no markup of its own', ek.includes("escAt(t, '.fb-open')") && !/innerHTML|insertAdjacentHTML/.test(fb));
    check('its styles', /\.fb-line\b/.test(st) && /\.fb-menu\b/.test(st) && /\.fb-step\b/.test(st));
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exitCode = 1; });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });
