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
    check('a window 800 wide: the topics stand above, and wrap', /@media \(max-width: 900px\) \{\n\s*\.sys-split \{ grid-template-columns: minmax\(0, 1fr\);/.test(css) && /\.sys-tabs \{ display: flex; flex-wrap: wrap;/.test(css));
}

const words = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(root);
check('Help and both release notes say it', ix.includes('<li><b>Finding your way:</b>') && words.every(t => { const i = t.indexOf('The System editor\n'), j2 = t.indexOf('WAYPOINT 1.6.1'); return i > 0 && (j2 < 0 || i < j2) && t.includes('- Combat and Rules are tabs of their own now.'); }));
check('the suite has its step in CI', root('.github/workflows/checks.yml').includes('run: node tools/sysuicheck.js'));

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
