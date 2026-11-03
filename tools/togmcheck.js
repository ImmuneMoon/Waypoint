// togmcheck — a roll that goes straight to the GM (1.6.2, HR1; the owner, by prompt, 2026-11-03: set on a list and on a roll, "Both"; the player's
// card "Its name, sent to the GM"; its Then at once or waiting, "we can keep both of these as system options"; on a critical failure "Roll again
// secretly, or decide"). systemcore's cleaners and toGmOf imported and run, dicecore's copy and words, and the host's record sliced from net.js by its
// markers and run on stand-ins of the page with the real systemcore, dicecore and formula engine. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url'), vm = require('vm');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 600))); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
function slice(text, name) { const a = text.indexOf('// [togmcheck:' + name + '-start]'), b = text.indexOf('// [togmcheck:' + name + '-end]'); return a >= 0 && b > a ? text.slice(a, b) : ''; }
(async () => {
    const S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href), D = await import(url.pathToFileURL(app('scripts/dicecore.js')).href);
    const RAW = { v: 1, name: 'T', fields: [
        { id: 'f_str', key: 'Str', label: 'Str', kind: 'number', vis: 'all', edit: 'owner', def: 10 },
        { id: 'f_mark', key: 'Mark', label: 'Mark', kind: 'number', vis: 'gm', edit: 'gm' },
        { id: 'f_proj', key: 'Projects', label: 'Projects', kind: 'item-list', vis: 'all', edit: 'owner', list: { multi: true, toGm: 'wait', stats: [{ key: 'q', label: 'Quality' }], rolls: [{ label: 'Build', formula: '3d6 <= Row.q', toGm: 'run' }, { label: 'Test', formula: '3d6 <= 10' }, { label: 'Odd', formula: '3d6', toGm: 'yes' }] } },
        { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { multi: true, toGm: 'maybe', rolls: [{ label: 'Use', formula: '3d6 <= 10' }] } }],
        rolls: [{ id: 'r_craft', label: 'Craft', formula: '3d6 <= 12', toGm: 'wait', then: [{ f: 'f_str', formula: '1', add: true, when: 'hit' }] }, { id: 'r_plain', label: 'Plain', formula: '3d6 <= 12' }, { id: 'r_act', label: 'Act', apply: [{ f: 'f_str', formula: '1', add: true }], toGm: 'run' }],
        items: [{ id: 'i_kit', name: 'Kit', stats: { q: 18 } }] };
    const gm = S.cleanSystem(RAW, { F, gmView: true }), pv = S.cleanSystem(RAW, { F, gmView: false }), R = (s, id) => s.rolls.filter(r => r.id === id)[0], Lr = (s, fid) => s.fields.filter(f => f.id === fid)[0].list;
    check('a roll keeps Goes to the GM as run or wait, the same in both views, and is named so the host knows it by its press; an apply action and a plain roll keep none',
        R(gm, 'r_craft').toGm === 'wait' && R(pv, 'r_craft').toGm === 'wait' && R(gm, 'r_craft').named === true && R(gm, 'r_plain').toGm === undefined && R(gm, 'r_plain').named === undefined && (R(gm, 'r_act') || {}).toGm === undefined, J([R(gm, 'r_craft'), R(gm, 'r_act')]));
    check('a list keeps it for all its rolls and a list’s roll for itself, both views alike; a word that is none is none', Lr(gm, 'f_proj').toGm === 'wait' && Lr(pv, 'f_proj').toGm === 'wait' && Lr(gm, 'f_proj').rolls[0].toGm === 'run' && Lr(gm, 'f_proj').rolls[1].toGm === undefined && Lr(gm, 'f_proj').rolls[2].toGm === undefined && Lr(gm, 'f_gear').toGm === undefined,
        J([Lr(gm, 'f_proj'), Lr(gm, 'f_gear')]));
    check('a system that sets none of it cleans as before', J(S.cleanSystem(S.cleanSystem(RAW, { F, gmView: true }), { F, gmView: true })) === J(gm) && J(S.cleanSystem({ v: 1, name: 'N', fields: [], rolls: [{ id: 'r_a', label: 'A', formula: '1d6' }] }, { F, gmView: true }).rolls[0]) === J({ id: 'r_a', label: 'A', formula: '1d6', vis: 'all' }));
    const sp = Lr(gm, 'f_proj');
    check('a roll’s own choice comes before its list’s, and with neither it is none', S.toGmOf(sp, sp.rolls[0]) === 'run' && S.toGmOf(sp, sp.rolls[1]) === 'wait' && S.toGmOf(null, R(gm, 'r_craft')) === 'wait' && S.toGmOf(null, R(gm, 'r_plain')) === null && S.toGmOf(Lr(gm, 'f_gear'), Lr(gm, 'f_gear').rolls[0]) === null);
    // the roller's copy
    const stub = { type: 'roll', id: 'r_abcd1234', from: { id: 'u_a', name: 'Ava' }, expr: '0', draws: [], v: F.VERSION, ts: 1, hid: 'gm', priv: 'gm', label: 'Craft' };
    const cl = D.cleanRoll(stub);
    check('a player’s app keeps the copy’s word that it went to the GM, and its words say only that', cl && cl.hid === 'gm' && /sent to the GM/.test(D.cardText(cl, F.evaluate('0'), F)) && !/\d/.test(D.cardText(cl, F.evaluate('0'), F).replace(/^[^:]*:/, '')), J([cl, cl && D.cardText(cl, F.evaluate('0'), F)]));
    const dj = read('scripts/dice.js');
    check('the card draws its title and Sent to the GM, and nothing of the roll', dj.includes("if (rec.hid === 'gm') { wrap.appendChild(el('div', 'roll-togm', 'Sent to the GM.')); return wrap; }") && dj.indexOf("if (rec.hid === 'gm') { wrap.appendChild(") < dj.indexOf('var coin = rec.expr'));
    // the host
    const net = read('scripts/net.js'), src = slice(net, 'host');
    const mkDoc = () => { const mk = tag => ({ tag, children: [], className: '', textContent: '', title: '', type: '', ls: {}, appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, removeChild(c) { this.children = this.children.filter(x => x !== c); }, get firstChild() { return this.children[0] || null; }, addEventListener(e, f) { this.ls[e] = f; } }); return { createElement: mk, createTextNode: t => ({ tag: '#text', text: t }) }; };
    const text = n => n.tag === '#text' ? n.text : (n.textContent || '') + (n.children || []).map(text).join('');
    const mkHost = () => {
        const out = { saves: 0, sync: [], log: [], rolls: [], gm: [] };
        const ctx = { window: { wpSheets: { charChanged: () => {} } }, document: mkDoc(), net: { role: 'host', syncCharDelta: (id, v) => out.sync.push([id, Object.keys(v).sort()]) }, saveRemoteSoon: () => out.saves++, logEvent: (k, t) => out.log.push([k, t]), pushRoll: (rec, res, scope, o) => out.rolls.push([rec, res && res.value, scope, o]),
            thenGmRun: (c, ch, q, v, a, o) => out.gm.push(o.label), fxNow: () => null, Object, Array, String, Math, Date, JSON };
        vm.createContext(ctx); vm.runInContext(src + '\nthis.api = { keep: toGmKeep, apply: toGmApply, again: toGmAgain, all: _toGm };', ctx);
        return { api: ctx.api, net: ctx.net, out };
    };
    const H = mkHost(), ch = { id: 'c_a', name: 'Ava', values: { f_str: 10 } }, craft = R(pv, 'r_craft');
    const resP = F.evaluate('3d6 <= 12', { random: () => 2 }), keep = (id, o) => H.api.keep(id, Object.assign({ wait: true, crit: '', S, D, F, camp: { system: gm }, ch, q: { act: 'r_craft', charId: 'c_a' }, view: pv, act: craft, res: resP, rule: '', mf: null, vars: S.makeResolver(gm, ch, F), tc: null, big: false, band: '', label: 'Craft', as: 'Ava', from: { id: 'u_a', name: 'Ava' }, expr: '3d6 <= 12' }, o));
    keep('r_one');
    check('nothing runs while its Then waits, and the GM’s card offers Apply and Skip', ch.values.f_str === 10 && (() => { const c0 = { children: [], appendChild(c) { this.children.push(c); return c; } }; H.net.toGmButtons(c0, { id: 'r_one' }); const row = c0.children[0]; return !!row && row.children.filter(b => b.tag === 'button').map(b => b.textContent).join('|') === 'Apply|Skip'; })());
    const a1 = H.api.apply('r_one');
    check('Apply runs its Then as the dice said, on the host’s copy, tells the table the change and the Game Record who applied it, and runs once', a1.ok && ch.values.f_str === 11 && H.out.saves === 1 && J(H.out.sync) === J([['c_a', ['f_str']]]) && H.out.log.some(l => l[1] === 'Ava: Craft, applied by the GM.') && H.api.apply('r_one').error === 'That roll is not waiting now.', J([a1, ch.values, H.out]));
    keep('r_two', { wait: false, crit: 'fumble' });
    const c2 = { children: [], appendChild(c) { this.children.push(c); return c; } }; H.net.toGmButtons(c2, { id: 'r_two' });
    check('on a critical failure the card offers Roll again secretly and Decide, and nothing to apply where its Then ran at once', c2.children[0] && c2.children[0].children.filter(b => b.tag === 'button').map(b => b.textContent).join('|') === 'Roll again secretly|Decide' && /a critical failure/.test(text(c2.children[0])), J(c2.children[0] && c2.children[0].children.map(x => x.textContent || x.text)));
    const g1 = H.api.again('r_two'), last = H.out.rolls[H.out.rolls.length - 1];
    check('Roll again secretly rolls the same roll with what it was rolled with, on a card the GM’s alone', g1.ok && last && last[0].priv === 'gm' && last[2] === 'whisper' && last[0].label === 'Craft: again, in secret' && last[0].expr === '3d6 <= 12' && last[3].cid === 'c_a' && H.out.log.some(l => l[0] === 'dice'), J([g1, last]));
    c2.children[0].children.filter(b => b.textContent === 'Decide')[0].ls.click();
    const c3 = { children: [], appendChild(c) { this.children.push(c); return c; } }; H.net.toGmButtons(c3, { id: 'r_two' });
    check('Decide closes the choice, and the card then offers nothing more', text(c2.children[0]) === 'You decide.' && !c3.children[0].children.some(b => b.tag === 'button'));
    const c4 = { children: [], appendChild(c) { this.children.push(c); return c; } }; H.net.toGmButtons(c4, { id: 'r_none' }); H.net.role = 'client'; H.net.toGmButtons(c4, { id: 'r_two' });
    check('a roll the host does not keep, and a player’s app, draw no buttons', !c4.children.length);
    for (let i = 0; i < 60; i++) keep('r_k' + i);
    check('the host keeps the newest 50', Object.keys(H.api.all).length === 50 && !('r_one' in H.api.all) && 'r_k59' in H.api.all);
    // the wiring and the words
    check('the roll branch sends its roller the copy alone and the GM the roll, keeps it, holds a waiting Then and its hidden steps, and holds no card action', net.includes("if (tgQ) { recQ.priv = 'gm'; var stQ = { type: 'roll', id: recQ.id, from: recQ.from, expr: '0', draws: [], v: recQ.v, ts: recQ.ts, rid: q.rid, hid: 'gm', priv: 'gm' };")
        && net.includes("if (actQ && actQ.then && tgQ !== 'wait') {") && net.includes("if (chQ && actQ && tgQ !== 'wait' && Array.isArray(actQ.thenGm)") && net.includes("var heldCQ = chQ && actQ && !tgQ && typeof cardHold === 'function' ? cardHold(") && dj.includes("if (n && typeof n.toGmButtons === 'function') n.toGmButtons(wrap, rec);"));
    const sh = read('scripts/sheets.js'), ui = read('scripts/sysui.js');
    check('the editor sets it on a roll, a list’s roll and a list, each named in its group', sh.includes("select('sys-roll-togm', [['', 'The player sees it'], ['run', 'Goes to the GM'], ['wait', 'Goes to the GM, Then waits']]") && sh.includes("el('select', 'sys-lroll-togm')") && sh.includes("el('select', 'sys-list-togm')")
        && ui.includes("'sys-roll-togm'") && ui.includes("'sys-list-togm'"));
    check('Help, both notes and CI say it', read('index.html').includes('A roll can <b>Go to the GM</b>') && readRoot('WHATSNEW.txt').includes('- A roll can go to the GM, set on the roll or on a list.') && read('assets/whatsnew.txt').includes('- A roll can go to the GM, set on the roll or on a list.') && readRoot('.github/workflows/checks.yml').includes('run: node tools/togmcheck.js'));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite did not finish'); process.exitCode = 1; } });
