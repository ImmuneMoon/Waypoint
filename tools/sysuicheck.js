/* The System editor's layout (1.6.2; the owner, 2026-11-01, by prompt: "A list beside one open" and "Combat and Rules tabs"; and "lets not remove
   functionality with these updates, thats critical"). scripts/sysui.js is run for real on a page of plain objects (tools/boxdom.js, which refuses
   markup). It arranges what the row builders of sheets.js build and decides nothing of a system. Plain Node, no dependencies, exits 1 on any failure. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { makeDom } = require('./boxdom.js');
const app = path.join(__dirname, '..', 'system', 'app');
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const root = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const J = JSON.stringify;
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
const src = read('scripts/sysui.js'), ix = read('index.html'), sh = read('scripts/sheets.js'), css = read('style.css');

// the module on a page of its own: the editor's boxes as index.html has them
function page(store0) {
    const d = makeDom(), { document, window } = d, m = d.mk;
    const modal = m('div', '', null, 'systemModal'); document.body.appendChild(modal);
    ['sysCombatNav', 'sysCombatBox', 'sysRulesNav'].forEach(id => modal.appendChild(m('div', '', null, id)));
    const rules = m('div', '', null, 'sysRulesBox'); modal.appendChild(rules);
    [['budgets', 'sysBudgets'], ['env', 'sysEnv'], ['links', 'sysLinks'], ['tables', 'sysTables']].forEach(t => rules.appendChild(m('div', '', { topic: t[0] }, t[1])));
    const kept = {}, store = { getItem: k => (k in kept ? kept[k] : (store0 && k in store0 ? store0[k] : null)), setItem: (k, v) => { kept[k] = String(v); } };
    window.localStorage = store; window.steps = []; window.wpStepLog = (n, s, f) => window.steps.push([n, s, f]);
    document.readyState = 'complete';
    new Function('window', 'document', 'localStorage', src)(window, document, store);
    return { d, document, window, modal, kept, ui: window.wpSysUi };
}
const P = page();
const kids = n => n.childNodes.slice();

/* ---------- the Combat and Rules tabs ---------- */
{
    const { document, window, ui, kept, d } = P, box = document.getElementById('sysCombatBox'), nav = document.getElementById('sysCombatNav'), m = d.mk;
    // the Combat box as its builder leaves it: children, marks saying which topic the next ones stand in
    const made = [];
    const put = (cls, text) => { const e = m('div', cls); if (text) e.textContent = text; box.appendChild(e); made.push(e); return e; };
    const mark = t => { const e = m('i', 'sys-topic-mark'); e.dataset.topic = t; box.appendChild(e); };
    const blastNote = put('sys-note sys-combat-note', 'How thrown blasts behave'); const lab = put('sys-combat-item');
    mark('damage'); const hp = put('sys-combat-item'); mark('blasts'); const head = put('sys-combat-head', 'Blasts and throws'), sub = put('sys-combat-head', 'Where a hit behind cover lands');
    mark('range'); const rg = put('sys-light'); const rgHead = m('div', 'sys-light-head'); rgHead.textContent = 'Range'; rg.appendChild(rgHead);
    mark('nothing'); const odd = put('sys-keep');
    ui.combatDrawn(box);
    const panes = kids(box), topicIds = panes.map(p => p.dataset.topic), inPane = (p, e) => e.parentNode === p, paneOf = t => panes.find(p => p.dataset.topic === t);
    check('every topic has a pane, and the Combat tab\'s topics are what the sheet drew, by what is really there', J(topicIds) === J(['turns', 'initiative', 'outcomes', 'damage', 'cover', 'blasts', 'range', 'height', 'light', 'senses', 'postures', 'holds', 'bars']), J(topicIds));
    check('what stands before any mark goes to Blasts and throws; a mark sends what follows to its topic; a mark that names no topic loses nothing', inPane(paneOf('blasts'), blastNote) && inPane(paneOf('blasts'), lab) && inPane(paneOf('damage'), hp) && inPane(paneOf('blasts'), head) && inPane(paneOf('range'), rg) && inPane(paneOf('range'), odd));
    check('no mark stays on the page, and no child of the box is lost', !box.querySelector('.sys-topic-mark') && made.every(e => box.contains(e)));
    check('a pane says its name and one line; a head that only says the topic\'s name stands aside; a head of a part of it stays', paneOf('damage').firstChild.textContent === 'Damage' && /sys-topic-line/.test(paneOf('damage').childNodes[1].className) && head.hidden === true && rgHead.hidden === true && sub.hidden !== true);
    check('the side has a button a topic, each a tab with its line as its tooltip, the first in view and the only one the Tab key stops on', kids(nav).length === 13 && kids(nav).every(b => b.tagName === 'BUTTON' && b.type === 'button' && b.title && b.dataset.set === 'combat') && kids(nav).filter(b => b.classList.contains('on')).length === 1 && kids(nav).filter(b => b.tabIndex === 0).length === 1 && panes.filter(p => !p.hidden).length === 1 && !paneOf('turns').hidden);
    const r1 = ui.topicPress('combat', 'range');
    check('a press shows one topic and puts the others away, with nothing drawn again', r1 === true && !paneOf('range').hidden && paneOf('turns').hidden && panes.every(p => box.contains(p)) && kids(nav).find(b => b.dataset.topic === 'range').getAttribute('aria-selected') === 'true');
    const r2 = ui.topicPress('combat', 'toString'), r3 = ui.topicPress('other', 'range'), r4 = ui.topicPress('__proto__', 'range');
    check('a topic that is not there, and a set that is none, change nothing', r2 === false && r3 === false && r4 === false && !paneOf('range').hidden);
    check('what is in view is kept for this computer, and each step is logged by structure alone', J(JSON.parse(kept.wp_sysTopics)) === J({ combat: 'range', rules: 'budgets' }) && window.steps.every(s => s[0] === 'sysui v1' && !/Range|Damage/.test(J(s[2]))) && window.steps.length === 4, J(window.steps));
    ui.rulesDrawn();
    const rb = document.getElementById('sysRulesBox'), rn = document.getElementById('sysRulesNav'), shown = () => kids(rb).filter(x => !x.hidden).map(x => x.id);
    check('the Rules tab has its four topics, one at a time, and draws nothing itself', J(kids(rn).map(b => b.dataset.topic)) === J(['budgets', 'env', 'links', 'tables']) && J(shown()) === J(['sysBudgets']));
    ui.topicPress('rules', 'tables');
    check('a press there shows that box alone', J(shown()) === J(['sysTables']));
    ui.combatDrawn((() => { box.textContent = ''; return box; })());
    check('drawn again, the topic in view stays', !kids(box).find(p => p.dataset.topic === 'range').hidden);
    ui.marks({ damage: [1], 'f_1': [1], 'b_x': [1] }, { range: [1], damage: [1], __proto__: [1] });
    const has = (n, t, c) => kids(n).find(b => b.dataset.topic === t).classList.contains(c);
    check('a topic with an error wears the error, one with only a warning the warning, whatever else the lists hold', has(nav, 'damage', 'err') && !has(nav, 'damage', 'warn') && has(nav, 'range', 'warn') && has(rn, 'budgets', 'err') && !has(nav, 'turns', 'err'));
    ui.marks({}, {});
    check('and loses it when it is put right', !has(nav, 'damage', 'err') && !has(nav, 'range', 'warn'));
    const rangeBtn = kids(nav).find(b => b.dataset.topic === 'range'); rangeBtn.focus();
    const e1 = d.fire(rangeBtn, 'keydown', { key: 'ArrowDown' });
    check('the arrow keys go down the side, each showing its topic, and go no further', e1.defaultPrevented === true && e1.stopped === true && document.activeElement.dataset.topic === 'height' && !kids(box).find(p => p.dataset.topic === 'height').hidden);
    d.fire(document.activeElement, 'keydown', { key: 'End' });
    const e2 = d.fire(document.activeElement, 'keydown', { key: 'ArrowDown' });
    d.fire(document.activeElement, 'keydown', { key: 'Home' });
    check('End and Home, the last and the first, with nothing past the end', e2.defaultPrevented === true && document.activeElement.dataset.topic === 'turns');
    const e3 = d.fire(document.activeElement, 'keydown', { key: 'x' });
    check('any other key is the page\'s', e3.defaultPrevented === false);
    const again = page({ wp_sysTopics: '{"combat":"senses","rules":"nothing","__proto__":{"combat":"x"}}' }), bad = page({ wp_sysTopics: 'not json' });
    const b1 = again.document.getElementById('sysCombatBox'); again.ui.combatDrawn(b1); const b2 = bad.document.getElementById('sysCombatBox'); bad.ui.combatDrawn(b2);
    check('what this computer kept comes back, read as data: a topic of its set, else the first', !kids(b1).find(p => p.dataset.topic === 'senses').hidden && !kids(b2).find(p => p.dataset.topic === 'turns').hidden);

    const tabs = (/<div class="sys-tabs">(.*?)<\/div>/.exec(ix) || [])[1] || '', order = (tabs.match(/data-tab="[a-z]+"/g) || []).map(s => s.slice(10, -1));
    check('the tabs as the sheet drew them: Combat and Rules after Effects, each with a tooltip', J(order) === J(['fields', 'rolls', 'items', 'lists', 'effects', 'combat', 'rules', 'chars', 'layout', 'calendar']) && (tabs.match(/ title="/g) || []).length === 10, J(order));
    const items = ix.slice(ix.indexOf('<div id="sysItems"'), ix.indexOf('<div id="sysLists"')), lists = ix.slice(ix.indexOf('<div id="sysLists"'), ix.indexOf('<div id="sysEffects"')), combat = ix.slice(ix.indexOf('<div id="sysCombat"'), ix.indexOf('<div id="sysRules"')), rules = ix.slice(ix.indexOf('<div id="sysRules"'), ix.indexOf('<div id="sysChars"'));
    check('Items and Lists hold only items and lists: the Combat box, the budgets, the readings, the links and the tables each moved, and each stands once', combat.includes('<div id="sysCombatBox"></div>') && !items.includes('sysCombatBox') && ['sysBudgets', 'sysEnv', 'sysLinks', 'sysTables'].every(id => rules.includes('id="' + id + '"') && !lists.includes(id) && ix.split('id="' + id + '"').length === 2) && lists.includes('id="sysListRules"') && lists.includes('id="sysListRows"'));
    const cb = sh.slice(sh.indexOf('function combatBody() {'), sh.indexOf('// Initiative O2 (docs/TURN_ORDER_PLAN.md'));
    check('the builder names every topic of the Combat tab, and hands its box on once it is full', ['damage', 'cover', 'outcomes', 'blasts', 'bars', 'holds', 'range', 'height', 'light', 'senses', 'turns', 'initiative', 'postures'].every(t => cb.includes("tp('" + t + "')")) && cb.includes('window.wpSysUi.combatDrawn(box);') && ['labeledSelect(\'sys-combat-auto\'', 'coverHitBox(box, cm)', 'checksBox(box, cm)', 'blastBox(box, cm)', 'defendBox(box', 'barsBox(box, cm)', 'holdsBox(box, cm)', 'rangeBox(box, cm)', 'heightBox(box, cm)', 'lightBox(box, cm)', 'sensesBox(box, cm)', 'damageBox(box, cm)', 'turnBox(box, cm)', 'initBox(box, cm)', 'postureBox(box, cm)'].every(s => cb.includes(s)));
    check('the tour and the fog menu open the Combat tab at Senses, and the focus is kept on a redraw of the Rules tab too', read('scripts/tutorial.js').includes("window.wpSheets.open('combat', 'senses')") && read('scripts/fog.js').includes("window.wpSheets.open('combat', 'senses')") && sh.includes("a.closest('#systemModal .sys-list-card, #sysCombatBox, #sysRulesBox')") && ix.includes('id="sysRulesBox" data-lid="rules"'));
    check('headings stand above what they head: a box head takes the whole row of its pane, and every box of a pane does', /\.sys-topic-pane > \.sys-combat-head[^{]*\{[^}]*flex: 0 0 100%/.test(css) || /\.sys-topic-pane > \.sys-combat-note, \.sys-topic-pane > \.sys-note, \.sys-topic-pane > \.sys-combat-head[^{]*\{[^}]*flex: 0 0 100%/.test(css));
    check('a window 800 wide: the topics stand above, and wrap', /@media \(max-width: 900px\) \{\n\s*\.sys-split, \.sys-split-topics \{ grid-template-columns: minmax\(0, 1fr\);/.test(css) && /\.sys-tabs \{ display: flex; flex-wrap: wrap;/.test(css));
}

/* ---------- a list beside one open ---------- */
{
    const P2 = page(), { document, window, ui, d } = P2, m = d.mk, modal = P2.modal;
    const pick = m('div', 'sys-pick'), find = m('input', 'field sys-find', null, 'sysFieldFind'), list = m('div', 'sys-pick-list', null, 'sysFieldList'), none = m('div', 'sys-note sys-pick-none'), pane = m('div', 'sys-rows', null, 'sysFieldRows');
    none.hidden = true; pick.appendChild(find); pick.appendChild(list); pick.appendChild(none); modal.appendChild(pick); modal.appendChild(pane);
    // wired again now that its boxes stand on the page, as they do when the app starts
    const P3 = (() => { const load = new Function('window', 'document', 'localStorage', src); load(window, document, window.localStorage); return window.wpSysUi; })();
    const U = P3, calls = [], rowsOf = n => Array.from({ length: n }, (x, i) => ({ id: 'f_' + i, key: 'K' + i, name: 'Field ' + i, tag: i % 2 ? 'Number' : 'Resource' }));
    U.host({ pick: (k, id) => { calls.push(['pick', k, id]); U.pickSet(k, id); U.pickDraw(k, cur); }, move: (k, id, to, after) => { calls.push(['move', k, id, to, after]); if (U.moveIn(cur, id, to, after)) U.pickDraw(k, cur); } });
    let cur = rowsOf(5); const on = () => kids(list).filter(b => b.classList.contains('on')).map(b => b.dataset.id);
    const first = U.pickDraw('fields', cur);
    check('the list has one line a row, each a key, a name and what it is, as text, and the first row is open', first === 'f_0' && kids(list).length === 5 && J(on()) === J(['f_0']) && kids(list)[1].textContent === 'K1Field 1Number' && kids(list).every(b => b.tagName === 'BUTTON' && b.type === 'button' && b.draggable === true));
    check('one row is the Tab key\'s stop, and says it is the one', kids(list).filter(b => b.tabIndex === 0).length === 1 && kids(list)[0].getAttribute('aria-selected') === 'true' && kids(list)[1].getAttribute('aria-selected') === 'false');
    const hostile = [{ id: 'f_0', key: '<b>x</b>', name: '<img src=x onerror=alert(1)>', tag: '' }]; cur = hostile; U.pickDraw('fields', cur);
    check('a name from a file is a text node on a page that refuses markup', list.firstChild.childNodes[1].textContent === '<img src=x onerror=alert(1)>' && list.firstChild.childNodes[1].childNodes.length === 1 && list.firstChild.childNodes[1].childNodes[0].nodeType === 3);
    cur = rowsOf(5); U.pickDraw('fields', cur);
    const el0 = kids(list)[2]; cur = cur.map(r => (r.id === 'f_2' ? Object.assign({}, r, { name: 'Typed' }) : r)); U.pickDraw('fields', cur);
    check('words typed in a row reach its line with the list left standing, so the focus and the scroll stay', kids(list)[2] === el0 && el0.childNodes[1].textContent === 'Typed');
    cur = cur.concat([{ id: 'f_new', key: '', name: '', tag: 'Number' }]); const got = U.pickDraw('fields', cur);
    check('a row that has just come is the one open, and a row with no name yet says so', got === 'f_new' && J(on()) === J(['f_new']) && kids(list)[5].childNodes[1].textContent === 'No name yet' && kids(list)[5].childNodes[1].classList.contains('none'));
    cur = cur.filter(r => r.id !== 'f_new'); const got2 = U.pickDraw('fields', cur);
    check('a row deleted leaves the row now at its place open, the last when it was the last', got2 === 'f_4');
    U.pickSet('fields', 'f_1'); U.pickDraw('fields', cur); cur = cur.filter(r => r.id !== 'f_1'); const got3 = U.pickDraw('fields', cur);
    check('and in the middle, the next', got3 === 'f_2');
    cur = rowsOf(3).map(r => Object.assign({}, r, { id: 'n' + r.id })); const got4 = U.pickDraw('fields', cur);
    check('rows all replaced, as by a preset, leave one open and no error', cur.some(r => r.id === got4) && J(on()) === J([got4]));
    U.pickReset(); cur = rowsOf(5); U.pickDraw('fields', cur);
    check('the editor opened again starts on the first row', U.pickDraw('fields', cur) === 'f_0');
    find.value = 'k1 number'; const ev = d.fire(find, 'input', {});
    check('the search keeps every row whose key, name and kind hold each word, and goes no further than its own box', J(kids(list).filter(b => !b.hidden).map(b => b.dataset.id)) === J(['f_1']) && none.hidden === true && ev.stopped === true);
    find.value = 'nothing like this'; d.fire(find, 'input', {});
    check('with nothing found it says so, and the row that was open stays open', kids(list).every(b => b.hidden) && none.hidden === false && J(on()) === J(['f_0']));
    find.value = 'number'; d.fire(find, 'input', {}); cur = cur.concat([{ id: 'f_9', key: 'Z', name: 'Other', tag: 'Text' }]); U.pickDraw('fields', cur);
    check('a list made again keeps the search', kids(list).find(b => b.dataset.id === 'f_9').hidden === true && kids(list).find(b => b.dataset.id === 'f_1').hidden === false);
    find.value = ''; d.fire(find, 'input', {}); cur = rowsOf(5); calls.length = 0; U.pickDraw('fields', cur); U.pickSet('fields', 'f_0'); U.pickDraw('fields', cur);
    d.fire(kids(list)[3], 'click', {});
    check('a press on a row opens it, and the press goes no further', J(calls) === J([['pick', 'fields', 'f_3']]) && J(on()) === J(['f_3']));
    kids(list)[3].focus(); calls.length = 0; const k1 = d.fire(document.activeElement, 'keydown', { key: 'ArrowDown' });
    check('the arrow keys step through the rows, each opening its row with the focus on it, and the page hears nothing', J(calls) === J([['pick', 'fields', 'f_4']]) && document.activeElement.dataset.id === 'f_4' && k1.defaultPrevented === true && k1.stopped === true);
    d.fire(document.activeElement, 'keydown', { key: 'ArrowDown' }); d.fire(document.activeElement, 'keydown', { key: 'Home' });
    check('past the end nothing moves, and Home goes to the first', document.activeElement.dataset.id === 'f_0');
    find.value = 'number'; d.fire(find, 'input', {}); document.getElementById('sysFieldFind'); kids(list)[1].focus(); d.fire(document.activeElement, 'keydown', { key: 'ArrowDown' });
    check('the arrow keys pass over the rows the search put away', document.activeElement.dataset.id === 'f_3'); find.value = ''; d.fire(find, 'input', {});
    pane.textContent = ''; const box1 = m('input', 'sys-key'); pane.appendChild(box1); kids(list)[1].focus(); const k2 = d.fire(document.activeElement, 'keydown', { key: 'Enter' });
    check('Enter goes into the row that is open', document.activeElement === box1 && k2.defaultPrevented === true);
    find.focus(); find.value = 'k2'; d.fire(find, 'input', {}); const k3 = d.fire(find, 'keydown', { key: 'Enter' });
    check('Enter in the search opens the first row found and goes into it', document.activeElement === box1 && J(on()) === J(['f_2']) && k3.stopped === true); find.value = ''; d.fire(find, 'input', {});
    kids(list)[2].focus(); calls.length = 0; d.fire(document.activeElement, 'keydown', { key: 'ArrowUp', altKey: true });
    check('Alt and an arrow moves the row, and the focus stays on it', J(calls) === J([['move', 'fields', 'f_2', 'f_1', false]]) && document.activeElement.dataset.id === 'f_2' && J(cur.map(r => r.id)) === J(['f_0', 'f_2', 'f_1', 'f_3', 'f_4']));
    calls.length = 0; kids(list)[4].rect = { left: 0, right: 100, top: 40, bottom: 60 };
    d.fire(kids(list)[0], 'dragstart', {}); d.fire(kids(list)[4], 'dragover', { clientY: 55 }); const over = kids(list)[4].classList.contains('drop-after');
    d.fire(kids(list)[4], 'drop', { clientY: 55 });
    check('a row can be dragged to reorder, the mark showing where it lands', over && J(calls) === J([['move', 'fields', 'f_0', 'f_4', true]]) && J(cur.map(r => r.id)) === J(['f_2', 'f_1', 'f_3', 'f_4', 'f_0']) && kids(list).every(b => !/drop-/.test(b.className)));
    check('moveIn: before and after, none onto itself, none for an id that is not there', (() => { const a = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]; const r = [U.moveIn(a, 'c', 'a', false), a.map(x => x.id).join(''), U.moveIn(a, 'c', 'c', true), U.moveIn(a, 'z', 'a'), U.moveIn(a, 'a', 'z'), U.moveIn(null, 'a', 'b')]; return J(r) === J([true, 'cab', false, false, false, false]); })());
    U.marks({ f_1: [{}] }, { f_3: [{}], f_1: [{}] }); U.pickDraw('fields', cur);
    check('a row with an error is marked on the left, and one with only a warning', kids(list).find(b => b.dataset.id === 'f_1').classList.contains('err') && kids(list).find(b => b.dataset.id === 'f_3').classList.contains('warn') && !kids(list).find(b => b.dataset.id === 'f_1').classList.contains('warn'));
    U.marks({}, {}); U.pickDraw('fields', cur);
    check('and the mark goes when it is put right', kids(list).every(b => !b.classList.contains('err') && !b.classList.contains('warn')));
    const big = rowsOf(600); U.pickDraw('fields', big); let madeN = 0; const mk0 = document.createElement; document.createElement = t => { madeN++; return mk0(t); };
    for (let i = 0; i < 40; i++) { U.pickSet('fields', big[i * 3].id); U.pickDraw('fields', big); } U.pickDraw('fields', rowsOf(600).map(r => Object.assign({}, r, { name: r.name + 'x' })));
    document.createElement = mk0;
    check('a system of 600 fields: forty presses and a line of typing make no element of the list again, so the list costs nothing to keep', kids(list).length === 600 && madeN === 0, madeN);

    // sheets.js: only the row picked is built
    const rs = sh.slice(sh.indexOf('// [sysuicheck:rows-start]'), sh.indexOf('// [sysuicheck:rows-end]'));
    const built = [], draft = { fields: [{ id: 'a', key: 'A', label: 'One', kind: 'number' }, { id: 'b', key: 'B', label: 'Two', kind: 'resource' }], rolls: [], items: [], effects: [] };
    const w2 = { wpSysUi: { pickDraw: (k, rows) => { w2.rows = rows; return 'b'; }, arrange: r => r } };
    const R = new Function('window', 'draft', 'KIND_LABEL', 'ui', 'renderAll', 'markDirty', rs + '\nreturn { pickRows, pickModel, pickOne };')(w2, draft, { number: 'Number', resource: 'Resource' }, () => null, () => {}, () => {});
    const boxR = { kids: [], appendChild(x) { this.kids.push(x); } }; R.pickRows(boxR, 'fields', draft.fields, f => { built.push(f.id); return f.id; });
    check('only the row picked is built, by its own builder', J(built) === J(['b']) && J(boxR.kids) === J(['b']) && J(w2.rows) === J([{ id: 'a', key: 'A', name: 'One', tag: 'Number' }, { id: 'b', key: 'B', name: 'Two', tag: 'Resource' }]));
    const R0 = new Function('window', 'draft', 'KIND_LABEL', 'ui', 'renderAll', 'markDirty', rs + '\nreturn { pickRows };')({}, draft, {}, () => null, () => {}, () => {}), box0 = { kids: [], appendChild(x) { this.kids.push(x); } }; R0.pickRows(box0, 'fields', draft.fields, f => f.id);
    check('with no layer at hand every row is built, as it was', J(box0.kids) === J(['a', 'b']));
    check('each tab still draws through its builder, and the editor\'s press, add and focus paths are as they were', sh.includes("pickRows(fr, 'fields', draft.fields, fieldRow);") && sh.includes("pickRows(rr, 'rolls', draft.rolls, rollRow);") && sh.includes("pickRows(itr, 'items', draft.items || [], itemRow);") && sh.includes("pickRows(efr, 'effects', draft.effects || [], effectRow);") && sh.includes("pickOne('lists', lists)") && sh.includes("var last = ui('sysFieldRows').lastElementChild;") && sh.includes('window.wpSysUi.host({ pick: pickOpen, move: pickMove });'));
    const d5 = { fields: [{ id: 'l', key: 'Kit', label: 'Kit', kind: 'item-list' }, { id: 'n', key: 'A', label: 'A', kind: 'number' }], rolls: [{ id: 'r1', label: 'Attack ({AtkBonus})', formula: '3d6 <= Skill' }, { id: 'r2', label: 'Heal', apply: [] }, { id: 'r3', label: '', init: true }, { id: 'r4', label: 'Cut', dmg: true }], items: [{ id: 'i', name: 'Rope', category: 'Gear', key: 'rope' }], effects: [{ id: 'e', name: 'Rage', tone: 'buff' }, { id: 'e2', name: '', tone: '' }] };
    const R5 = new Function('window', 'draft', 'KIND_LABEL', 'ui', 'renderAll', 'markDirty', rs + '\nreturn { pickModel, pickMove };')({ wpSysUi: { moveIn: (a, id) => { a.moved = id; return true; } } }, d5, {}, () => null, () => {}, () => {});
    check('each tab\'s rows, one line a row: a roll by its label without a figure and what it is, an item by its category, a list by its key with its errors kept under its own word, an effect by its tone', J(R5.pickModel('rolls').map(r => [r.name, r.tag])) === J([['Attack', 'Roll'], ['Heal', 'Apply'], ['', 'Initiative'], ['Cut', 'Damage']]) && R5.pickModel('rolls')[0].more === '3d6 <= Skill' && J(R5.pickModel('items')) === J([{ id: 'i', key: 'rope', name: 'Rope', tag: 'Gear' }]) && J(R5.pickModel('lists')) === J([{ id: 'l', key: 'Kit', name: 'Kit', err: 'list:l' }]) && J(R5.pickModel('effects').map(r => r.tag)) === J(['Buff', '']) && J(R5.pickModel('other')) === '[]');
    ['rolls', 'items', 'effects', 'lists'].forEach(k => R5.pickMove(k, 'x', 'y', true));
    check('a row dragged moves in its own list, a list among the fields it is', d5.rolls.moved === 'x' && d5.items.moved === 'x' && d5.effects.moved === 'x' && d5.fields.moved === 'x');
    ['Field', 'Roll', 'Item', 'List', 'Effect'].forEach(w => check('the ' + w + ' list stands beside its open row in the page, with its search, each once', ix.split('id="sys' + w + 'Find"').length === 2 && ix.split('id="sys' + w + 'List"').length === 2 && ix.split('id="sys' + w + 'Rows"').length === 2 && new RegExp('id="sys' + w + 'List"[^\\n]*id="sys' + w + 'Rows"').test(ix)));
}

/* ---------- the open row's controls in named groups, the real builders on a page of plain objects ---------- */
{
    const d = makeDom(), { document, window } = d;
    Object.defineProperty(d.El.prototype, 'options', { get() { return this.childNodes; } });
    const cut = name => { const a = sh.indexOf('\nfunction ' + name + '('); if (a < 0) return ''; if (name === 'listCard') return sh.slice(a + 1, sh.indexOf('    return card;\n}\n', a) + 18); const line = sh.slice(a + 1, sh.indexOf('\n', a + 1)); if (/\}\s*(\/\/.*)?$/.test(line) && (line.match(/\{/g) || []).length === (line.match(/\}/g) || []).length) return line; const m = /\n\}/g; m.lastIndex = a + 1; return sh.slice(a + 1, m.exec(sh).index + 2); };
    const names = ['el', 'input', 'numInput', 'numField', 'select', 'opt', 'labeledNum', 'labeledSelect', 'capBox', 'capInline', 'checkLabel', 'lazySelect', 'lineUnder', 'fieldRow', 'buildDefCell', 'roundCells', 'spillCtl', 'rollRow', 'effectRow', 'itemRow', 'itemModsBox', 'itemStatsBox', 'grantBox', 'grantEntries', 'grantName', 'swBox', 'swTargets', 'affBox', 'listCard', 'everyRow', 'fightRow', 'askRow', 'noteRow', 'crossRow', 'callsBox', 'applyEditor', 'startsBox', 'badgeBox', 'toneRow', 'altBox', 'needsGmBox', 'areaBox', 'resistBySel', 'resistOrBox', 'rollStationBox', 'dieSel', 'metricSel', 'decBox', 'placeSel', 'lvlCapsBox', 'onceBox', 'upkeepBox', 'onRemoveBox', 'partCapsBox', 'listCrossRow', 'swWordsBox', 'rollExtras', 'glyphButton'];
    const code = names.map(cut).join('\n');
    window.wpSoundOn = { btn: () => { const b = document.createElement('button'); b.className = 'sys-sound-on'; return b; } }; window.wpSystemCore = {};
    const mkSel = c => { const s = document.createElement('select'); s.className = c; return s; };
    const draft = {
        fields: [
            { id: 'f_n', key: 'ST', label: 'Strength', kind: 'number', def: 10, unit: 'yd', roll: '3d6', caption: 'x', hover: true, tile: true, slider: { low: 'a' }, override: { value: '1', when: '2' } },
            { id: 'f_c', key: 'C', label: 'Calc', kind: 'formula', formula: '1', round: 'from', roundAt: 0.5, badge: true, labels: ['a'], tones: [] },
            { id: 'f_r', key: 'HP', label: 'Hit Points', kind: 'resource', maxFormula: '10', color: '#112233', spill: { to: 'f_x', at: 'f', below: '1' }, icon: 'x' },
            { id: 'f_x', key: 'FP', label: 'Fatigue', kind: 'resource', maxFormula: '10' }, { id: 'f_s', key: 'S', label: 'Skill', kind: 'skill', base: 'x' }, { id: 'f_t', key: 'T', label: 'T', kind: 'toggle' }, { id: 'f_u', key: 'U', label: 'U', kind: 'text' }, { id: 'f_o', key: 'O', label: 'O', kind: 'notes' }, { id: 'f_e', key: 'E', label: 'E', kind: 'select', options: ['a'] }, { id: 'f_f', key: 'F', label: 'F', kind: 'effects' },
            { id: 'f_l', key: 'Gear', label: 'Gear', kind: 'item-list', table: { columns: [] }, list: { cats: ['A'], lvl: { min: 0, max: 5, caps: [{ at: 1, n: 1 }] }, on: { label: 'On', needs: '1', one: true }, stats: [{ key: 'w', label: 'W' }, { key: 'p', label: 'P', kind: 'pick', opts: [] }], cols: [{ key: 'c', label: 'C', formula: '1' }], counters: [{ key: 'ct', label: 'Ct' }], rolls: [{ label: 'R', formula: '1', dmg: true }, { label: 'A', apply: [] }], load: { from: 'f_l2', ct: 'ct' }, chamber: { from: 'f_l2', cap: 1 }, feeds: [{ key: 'a' }], parts: { from: 'f_l2' }, once: { by: 'w' }, specs: { of: 'p' }, upkeep: { pool: 'f_r', amt: '1' }, look: {}, workLog: true, money: 'w', onRemove: [{ f: 'f_r', formula: '1' }], badges: [], at: { from: 'f_l2', by: 'p' } } },
            { id: 'f_l2', key: 'Ammo', label: 'Ammo', kind: 'item-list', list: {} }],
        rolls: [{ id: 'r_a', label: 'Attack', formula: '3d6', malf: '17', bigAt: '4', dmg: true, dmg2: '1', dtype: 'x', cost: 'a', every: { n: 1, u: 'hour' }, inFight: { n: 1, u: 'rounds' }, notes: 'panel', cross: { f: 'f_r' }, calls: [{ roll: 'r_b' }], then: [], resistBy: 'r_b', needs: '1', each: 'turn' }, { id: 'r_b', label: 'Heal', apply: [{ f: 'f_r', formula: '1' }], stations: ['Pilot'] }],
        items: [{ id: 'i_a', name: 'Grenade', category: 'A', key: 'g', area: { shape: 'circle', ft: 10, aff: [{ vs: '1', fx: 'e_a' }] }, mods: [{ f: 'f_n', op: 'add', v: 1 }], grants: [{ entry: 'i_b', list: 'f_l' }], rollSw: [{ name: 'x', v: 1, to: [] }], stats: { w: 1 }, rm: 'bound', eq: 'bound' }, { id: 'i_b', name: 'Rope', category: 'A' }],
        effects: [{ id: 'e_a', name: 'Rage', mods: [{ f: 'f_n', op: 'add', v: 1 }], posture: 'p_a', auto: '1', endGroup: 'g' }],
        combat: { turn: { acts: [{ key: 'a', n: 1 }] }, damage: {}, checks: 'fixed', postures: [{ id: 'p_a', name: 'A' }, { id: 'p_b', name: 'B' }] }, sheet: { sections: [] }, links: [{ kind: 'crew', press: true, stations: ['Pilot'] }]
    };
    const made = {}, stub = n => { if (!(n in made)) made[n] = () => { const e = document.createElement('div'); e.className = 'stub-' + n; return e; }; return made[n]; };
    const base = { document, window, console, draft, Object, Array, String, Number, Math, JSON, RegExp, isFinite, parseFloat, parseInt, Date, Set, Map, WeakMap, Boolean, Error, Symbol, undefined, Infinity, NaN,
        KIND_LABEL: { number: 'Number', formula: 'Formula', resource: 'Resource', skill: 'Skill', toggle: 'Toggle', text: 'Text', notes: 'Notes', select: 'Select', 'item-list': 'Item list', effects: 'Status effects' }, KIND_HELP: {}, STORED: { number: 1, resource: 1, skill: 1, toggle: 1, text: 1, notes: 1, select: 1, 'item-list': 1, effects: 1 }, ITEM_COL_LABEL: { category: 'C', cost: 'C', damage: 'D', area: 'A', notes: 'N' }, LIMITS: new Proxy({}, { get: () => 99 }), GRANT_MAX: 8, ROUND_WORDS: [['', 'None'], ['near', 'N'], ['from', 'F']],
        btnRow: l => { const b = document.createElement('span'); b.className = 'sys-btns'; l.forEach(x => { const q = document.createElement('button'); q.className = 'tool ghost sys-btn'; q.dataset.act = x[0]; b.appendChild(q); }); return b; },
        turnActs: () => [{ key: 'a', n: 1 }], costOptions: () => [['', 'x']], fxTargets: () => [['f_n|add', 'x']], modVal: () => 'f_n|add', modHowSel: mkSel, itemStatDefs: () => [{ key: 'w', label: 'W' }], errorCell: () => { const e = document.createElement('div'); e.className = 'sys-err'; return e; }, listNamesText: () => 'x', PLACES: [['', 'x']], postureList: () => draft.combat.postures, swSays: () => '', affSays: () => '', iconText: () => '', lvlOnlyText: () => '', AFF_WHO: [['', 'x']], AFF_UNITS_ED: [['turns', 't']], draftRowOf: () => null };
    const env = new Proxy(base, { has: (t, k) => typeof k === 'string', get: (t, k) => (k in t ? t[k] : (k === Symbol.unscopables ? undefined : stub(k))) });
    const R = new Function('env', 'with (env) {\n' + code + '\nreturn { fieldRow, rollRow, effectRow, itemRow, listCard };\n}')(env);
    const P4 = (() => { const load = new Function('window', 'document', 'localStorage', src), kept = {}, st = { getItem: k => (k in kept ? kept[k] : null), setItem: (k, v) => { kept[k] = String(v); } }; window.localStorage = st; document.readyState = 'complete'; window.wpStepLog = () => {}; load(window, document, st); return { U: window.wpSysUi, kept }; })(), U = P4.U;
    const controls = row => row.all().filter(n => /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(n.tagName)).map(n => n.tagName + '.' + n.className + (n.dataset.act ? '#' + n.dataset.act : '') + '|' + n.title).sort();
    const rows = () => [].concat(draft.fields.filter(f => f.kind !== 'item-list').map(f => ['fields', R.fieldRow(f), f.key]), draft.fields.filter(f => f.kind === 'item-list').map(f => ['fields', R.fieldRow(f), f.key]), draft.rolls.map(r => ['rolls', R.rollRow(r), r.label]), draft.items.map(i => ['items', R.itemRow(i), i.name]), draft.effects.map(x => ['effects', R.effectRow(x), x.name]), [['lists', R.listCard(draft.fields[10], ['A'], [draft.fields[2]], [{ key: 'a' }]), 'Gear']]);
    const lost = [], more = [], bad = [];
    rows().forEach(r => {
        const a = controls(r[1]); U.arrange(r[1], r[0]); const b = controls(r[1]);
        if (J(a) !== J(b)) lost.push(r[2]);
        r[1].querySelectorAll('.sys-grp').forEach(g => { if (/:more$/.test(g.dataset.grp)) more.push(r[2] + ': ' + g.textContent.slice(0, 60) + ' / ' + J(controls(g).slice(0, 6))); });
        if (!r[1].firstChild.textContent && r[0] !== 'lists' && !r[1].firstChild.querySelector('input')) bad.push(r[2]);
    });
    check('nothing removed: every control of every kind of row, the real builders\' own, is still in its row after it is arranged, with its class, its action and its tooltip', lost.length === 0, J(lost));
    check('every control of the real builders has a named group: none falls to More', more.length === 0, J(more.slice(0, 6)));
    check('the head holds what names the row, and what Save says stands under it', bad.length === 0, J(bad));
    const rw = R.fieldRow(draft.fields[2]); U.arrange(rw, 'fields');
    const names2 = rw.querySelectorAll('.sys-grp').map(g => g.firstChild.childNodes[0].textContent + (g.open ? '' : ' (folded)'));
    check('a pool\'s groups, as the sheet drew them, each in the order of the table; a group the row uses opens by itself and says so', J(names2) === J(['The number', 'Who sees and changes it', 'On the sheet', 'Rolls and rules', 'Rounding (folded)']) && rw.querySelector('.sys-grp[data-grp="fields:rules"] .sys-grp-used').textContent === 'in use' && rw.querySelector('.sys-def .sys-formula') !== null && rw.querySelector('.sys-grp[data-grp="fields:round"] .sys-round') !== null && rw.querySelector('.sys-def .sys-round') === null, J(names2));
    const plain = R.fieldRow(draft.fields[3]); U.arrange(plain, 'fields');
    check('a row that uses none of a rare group has it folded', plain.querySelector('.sys-grp[data-grp="fields:rules"]').open === false);
    const tog = R.fieldRow(draft.fields[5]), sel = R.fieldRow(draft.fields[8]); tog.querySelector('.sys-kind').value = 'toggle'; sel.querySelector('.sys-kind').value = 'select'; U.arrange(tog, 'fields'); U.arrange(sel, 'fields');
    check('the first group says what the row holds', tog.querySelector('.sys-grp').firstChild.textContent === 'The switch' && sel.querySelector('.sys-grp').firstChild.textContent === 'The options');
    const modal = d.mk('div', '', null, 'systemModal'); document.body.appendChild(modal); modal.appendChild(plain);
    const P5 = new Function('window', 'document', 'localStorage', src); P5(window, document, window.localStorage);
    const grp = plain.querySelector('.sys-grp[data-grp="fields:rules"]'); d.fire(grp.firstChild, 'click', {}); grp.open = true;
    const plain2 = R.fieldRow(draft.fields[3]); window.wpSysUi.arrange(plain2, 'fields');
    const shut = plain2.querySelector('.sys-grp[data-grp="fields:who"]'); modal.appendChild(plain2); d.fire(shut.firstChild, 'click', {}); shut.open = false;
    const plain3 = R.fieldRow(draft.fields[3]); window.wpSysUi.arrange(plain3, 'fields'); const rw3 = R.fieldRow(draft.fields[2]); window.wpSysUi.arrange(rw3, 'fields');
    check('a group folded or opened stays so for this computer, on every row of the tab', plain2.querySelector('.sys-grp[data-grp="fields:rules"]').open === true && plain3.querySelector('.sys-grp[data-grp="fields:who"]').open === false && rw3.querySelector('.sys-grp[data-grp="fields:who"]').open === false);
    const stGet = v => ({ getItem: () => v });
    window.localStorage = stGet('{"fields:rules":1,"fields:who":"x","__proto__":{"a":1},"bad key":1}'); new Function('window', 'document', 'localStorage', src)(window, document, window.localStorage);
    const fresh = R.fieldRow(draft.fields[3]); window.wpSysUi.arrange(fresh, 'fields');
    check('what this computer kept is read as data', fresh.querySelector('.sys-grp[data-grp="fields:rules"]').open === true && fresh.querySelector('.sys-grp[data-grp="fields:who"]').open === true);
    const list = R.listCard(draft.fields[10], ['A'], [draft.fields[2]], [{ key: 'a' }]), box = d.mk('div'); box.appendChild(list); window.wpSysUi.arrangeIn(box, 'lists', 'sys-list-card');
    const lg = list.querySelectorAll('.sys-grp').map(g => g.dataset.grp.split(':')[1]);
    check('a list\'s card in its groups: the title first, each part where a new GM would look for it', list.firstChild.textContent.includes('Gear') && J(lg) === J(['holds', 'rows', 'level', 'on', 'stats', 'cols', 'cts', 'rolls', 'parts', 'badges', 'loads', 'specs', 'once', 'look', 'other', 'names']) && list.querySelector('.sys-grp[data-grp="lists:on"] .sys-list-upkeep') !== null && list.querySelector('.sys-grp[data-grp="lists:parts"] .sys-pcaps') !== null && list.querySelector('.sys-grp[data-grp="lists:rolls"] .sys-list-rolladd') !== null, J(lg));
    const odd = d.mk('div', 'sys-row'), kid = d.mk('input', 'sys-never-heard-of'); odd.appendChild(d.mk('div', 'sys-row-main')); odd.firstChild.appendChild(kid); window.wpSysUi.arrange(odd, 'fields');
    check('a control the table does not know goes to More, in sight, and is never lost', odd.querySelector('.sys-grp[data-grp="fields:more"] .sys-never-heard-of') === kid && odd.querySelector('.sys-grp[data-grp="fields:more"]').open === true);
    check('the layer failing leaves the row as its builder made it', (() => { const row = d.mk('div', 'sys-row'); const r = window.wpSysUi.arrange(row, 'nothing'); return r === row; })());
}

const words = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(root);
check('Help and both release notes say it', ix.includes('<li><b>Finding your way:</b>') && words.every(t => { const i = t.indexOf('The System editor\n'), j2 = t.indexOf('WAYPOINT 1.6.1'); return i > 0 && (j2 < 0 || i < j2) && t.includes('- Combat and Rules are tabs of their own now.'); }));
check('the suite has its step in CI', root('.github/workflows/checks.yml').includes('run: node tools/sysuicheck.js'));

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
