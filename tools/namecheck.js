/* Offline check of the name button (1.6.2, backlog 147; the owner, 2026-11-06, by prompt: "Lists, else a maker (Recommended)", and where it
   stands: "Naming a character", "Naming a map or page", "On a planner card", "As a command"): namecore.js imported and run (the maker, a
   list's cleaner in both views, a pick from the lists or the maker), names.js's menu sliced by its namecheck markers and run on a page of
   plain objects that refuses markup, and the wiring pinned. Usage: node tools/namecheck.js (exit 1 on failure) */
'use strict';
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10), root = path.join(__dirname, '..'), app = path.join(root, 'system', 'app');
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, NL);
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 400) : ''); } }
const J = JSON.stringify;
let summed = false;
process.on('exit', code => { if (!summed && !code) { console.log(NL + 'FAIL      the asynchronous checks never finished'); process.exitCode = 1; } });
(async () => {
    const N = await import(url('namecore.js')), S = await import(url('systemcore.js')), F = await import(url('formula.js'));
    const seq = vals => { let i = 0; return () => vals[i++ % vals.length]; };
    // the maker
    const made = N.STYLE_KEYS.map(k => N.makeName(seq([0, 0, 0]), k));
    check('the maker makes a name in each style from its own pieces, capitalised, first pieces with a zero draw', J(made) === J(['Aelara', 'Bragak', 'Alaric', 'Ashbrook']), J(made));
    let okAll = true; for (let i = 0; i < 2000; i++) { const r = Math.random, k = N.STYLE_KEYS[i % 4], n = N.makeName(r, k); if (!/^[A-Z][a-z]{2,15}$/.test(n)) { okAll = false; break; } }
    check('... 2,000 made names are each one word of 3 to 16 letters, a capital first', okAll);
    check('... with no style a person kind is one of the three person styles and a place kind the place style; a source that is no function or answers out of range reads 0', /^(Ae|Br|Al)/.test(N.makeName(seq([0.5, 0, 0, 0]), null, 'person')) && N.makeName(seq([0, 0, 0]), null, 'place') === 'Ashbrook' && N.makeName(() => 7, 'soft') === 'Aelara' && N.makeName(() => NaN, 'hard') === 'Bragak' && typeof N.makeName(null, 'old') === 'string');
    // the box's text
    check('a list\'s names are read one a line or between commas, each once ignoring case, one line of 60 at most, 500 at most', J(N.namesFromText('Ana\nbo, ANA\n\n  Cy  \t\nX'.replace('X', 'x'.repeat(70)))) === J(['Ana', 'bo', 'Cy', 'x'.repeat(60)]) && N.namesFromText(Array.from({ length: 700 }, (_, i) => 'N' + i).join('\n')).length === 500 && J(N.namesFromText(42)) === '[]');
    // the cleaner
    const raw = [{ key: 'N2', label: '  River towns ', kind: 'place', names: ['Ford', 'ford', ' Mere '] }, { label: 'Crew', names: ['Ana'], vis: 'gm' }, { label: '', names: [] }, 'x', { key: 'N2', label: 'Dup', kind: 'other', names: ['Bo', 7] }];
    const gm = N.cleanNameLists(raw, true), pl = N.cleanNameLists(raw, false);
    check('a system\'s name lists as Save keeps them: a key made once and kept, each list its name, kind and names, a list with neither name nor names gone, junk passed over, a kind that is none read as both; the GM\'s view keeps a list for the GM alone and the players\' view leaves it out',
        J(gm) === J([{ key: 'N2', label: 'River towns', names: ['Ford', 'Mere'], kind: 'place' }, { key: 'N1', label: 'Crew', names: ['Ana'], vis: 'gm' }, { key: 'N3', label: 'Dup', names: ['Bo'] }]) && J(pl) === J([{ key: 'N2', label: 'River towns', names: ['Ford', 'Mere'], kind: 'place' }, { key: 'N1', label: 'Dup', names: ['Bo'] }]) && N.cleanNameLists([], true) === null && N.cleanNameLists('x', true) === null, J([gm, pl]));
    check('... at most 24 lists', N.cleanNameLists(Array.from({ length: 40 }, (_, i) => ({ label: 'L' + i, names: ['a'] })), true).length === 24);
    const sysG = S.cleanSystem(Object.assign(S.emptySystem(), { names: raw }), { gmView: true, F }), sysP = S.cleanSystem(Object.assign(S.emptySystem(), { names: raw }), { gmView: false, F }), sysN = S.cleanSystem(S.emptySystem(), { gmView: true, F });
    check('cleanSystem keeps the lists in the GM\'s view and leaves a list for the GM alone out of the players\' view; a system with none keeps no key', J(sysG.names) === J(gm) && J(sysP.names) === J(pl) && !('names' in sysN), J([sysG.names, sysP.names]));
    // a pick
    const lists = gm;
    check('a name comes from the list asked for, else the lists of its kind (a list of both serving either), else the maker; a list for places never serves a character',
        N.nameFrom(seq([0.6]), lists, 'place', 'N2') === 'Mere' && N.nameFrom(seq([0]), lists, 'person', '') === 'Ana' && N.nameFrom(seq([0.99]), lists, 'person', '') === 'Bo' && N.nameFrom(seq([0.99]), lists, 'place', '') === 'Bo' && N.nameFrom(seq([0, 0, 0]), [], 'place', '') === 'Ashbrook'
        && N.namesFor(lists, 'person').map(l => l.key).join() === 'N1,N3' && N.namesFor(lists, 'any').length === 3);
    // the menu, sliced and run on a page of plain objects
    const src = read('scripts/names.js'), sl = src.slice(src.indexOf('// [namecheck:menu-start]'), src.indexOf('// [namecheck:menu-end]'));
    const mkEl = tag => ({ tagName: tag, children: [], style: {}, dataset: {}, attrs: {}, _t: '', get textContent() { return this._t; }, set textContent(v) { this.children = []; this._t = String(v); }, listeners: {}, appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, f) { this.listeners[k] = f; }, querySelector(q) { return this.children.find(c => c.tagName === 'button') || null; }, querySelectorAll() { return this.children; }, contains(x) { return x === this || this.children.includes(x); }, focus() { this.focused = true; }, getBoundingClientRect() { return { left: 100, top: 100, bottom: 120 }; }, get innerHTML() { throw new Error('markup'); }, set innerHTML(v) { throw new Error('markup'); } });
    const body = mkEl('body'), doc = { body, createElement: mkEl };
    let camp = { system: { names: lists } };
    const M = new Function('nameFrom', 'namesFor', 'makeName', 'STYLES', 'STYLE_KEYS', 'getActiveCampaign', 'document', 'window', 'Event', sl + NL + 'return { menuRows, open, close, isOpen, button, toChat };')(N.nameFrom, N.namesFor, N.makeName, N.STYLES, N.STYLE_KEYS, () => camp, doc, { innerWidth: 1024, innerHeight: 768, wpNet: null }, function(t) { this.type = t; });
    const rowsP = M.menuRows(lists, 'person'), rowsL = M.menuRows(lists, 'place'), rowsA = M.menuRows([], 'any');
    check('the menu offers the system\'s lists of the kind first, by their names, then the maker\'s styles of that kind; with no list only the styles',
        J(rowsP.map(r => r.text)) === J(['From Crew', 'From Dup', 'Made up: Soft', 'Made up: Hard', 'Made up: Old']) && J(rowsL.map(r => r.text)) === J(['From River towns', 'From Crew', 'From Dup', 'Made up: Place']) && rowsA.length === 4, J([rowsP, rowsL]));
    let got = null; const n1 = M.open(mkEl('button'), 'place', n => { got = n; }, doc), menu = body.children[0];
    const btns = menu.children, first = btns[0];
    check('opened, it is one menu of buttons with words as text, the first in hand, placed under what opened it', n1 === 4 && menu.style.display === 'flex' && btns.length === 4 && btns.every(b => b.tagName === 'button' && typeof b.textContent === 'string') && first.focused === true && menu.style.top === '124px' && M.isOpen());
    menu.listeners.click({ target: { closest: () => first }, stopPropagation() {} });
    check('a press on a list gives a name from it and closes the menu', ['Ford', 'Mere'].includes(got) && !M.isOpen(), got);
    got = null; M.open(mkEl('button'), 'place', n => { got = n; }, doc); menu.listeners.click({ target: { closest: () => menu.children[3] }, stopPropagation() {} });
    check('... and a press on a style a name made up in it', /^[A-Z][a-z]+$/.test(got || '') && !M.isOpen(), got);
    camp = { system: { names: [{ key: 'N1', label: '<b>x</b>', names: ['<img src=x>'] }] } };
    got = null; M.open(mkEl('button'), 'person', n => { got = n; }, doc); const b0 = menu.children[0]; menu.listeners.click({ target: { closest: () => b0 }, stopPropagation() {} });
    check('a list\'s name and its names from a system file reach the page only as text, never as markup', b0.textContent === 'From <b>x</b>' && got === '<img src=x>');
    const field = mkEl('input'), fired = []; field.dispatchEvent = e => fired.push(e.type); const nb = M.button('person', field, doc);
    nb.listeners.click({ stopPropagation() {}, preventDefault() {} }); menu.listeners.click({ target: { closest: () => menu.children[0] }, stopPropagation() {} });
    check('the button beside a field fills it with the name picked and says so as the field\'s own input and change', nb.className === 'tool ghost name-btn' && nb.textContent === 'Name' && field.value === '<img src=x>' && J(fired) === J(['input', 'change']));
    // the wiring
    const ix = read('index.html'), dl = read('scripts/dialogs.js'), cmd = read('scripts/commands.js'), nt = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'latin1'), sh = read('scripts/sheets.js'), cl = read('scripts/charlist.js'), esc = read('scripts/esckey.js');
    check('the wiring: the page loads the module and has the naming box\'s button, the dice roller\'s and the Rules tab\'s topic; showPrompt shows the button where a name is asked for; a new character, a new NPC and a new map, planner or page ask with it; two commands put a name in chat; the chat line is this computer\'s own; Escape is the menu\'s own; Help and both notes say it',
        ix.includes('<script type="module" src="scripts/names.js"></script>') && ix.includes('id="customPromptName" type="button" title="Make a name" hidden>Make a name</button>') && ix.includes('id="diceNameBtn"') && ix.includes('<div id="sysNames" data-topic="names"></div>')
        && dl.includes('function showPrompt(title, defaultText, callback, opts) {') && dl.includes('}, nameOpts);') && sh.includes("}, { name: 'person' }); }   // 1.6.2 (backlog 147)") && cl.includes("}, { name: 'person' });   // 1.6.2 (backlog 147)")
        && cmd.includes("id: 'name.make'") && cmd.includes("id: 'name.place'") && nt.includes('net.nameLine = function(text) {') && esc.includes(", #pbeAddMenu, #nameMenu, #sheetMoreMenu:not([hidden])';")
        && ix.includes('<li><b>Name lists</b> hold the names the name button picks from.') && ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, NL).includes('- A name button makes a name for a character or a place.')));
    const plS = read('scripts/planner.js'), ins = read('scripts/inspector.js'), wbN = read('scripts/whiteboard.js');
    check('fold 2: a planner\'s scene card offers a name for its title as one change, its title\'s format let go; Manage characters\' name box and a token\'s Character Name in Properties have the button; a player\'s own naming prompts for their character and their token offer it',
        plS.includes("class=\"tool ghost name-btn b-namebtn\"") && plS.includes("bb.title = n; if (bb.fmt && typeof bb.fmt === 'object' && !Array.isArray(bb.fmt)) { delete bb.fmt.title;") && sh.includes("top.appendChild(window.wpNames.button('person', nm));") && ins.includes("window.wpNames.button('person', wbCharName)")
        && sh.split(", { name: 'person' })").length - 1 === 4 && wbN.includes(", { name: 'person' })"), sh.split(", { name: 'person' })").length - 1);
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
