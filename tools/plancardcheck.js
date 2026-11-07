/* Offline check of a planner's cards (1.6.2, backlog 107 step 3 with backlog 147's aliases; the owner, 2026-10-16, by prompt: "Person, Place,
   Clue (Recommended)", and 2026-11-06: "Build the cards first (Recommended)", "Every kind of card (Recommended)", the Place drawing "A. A map
   pin (Recommended)" and of the Clue's glass "the magnifying glass is good"): cardcore.js imported and run (the kinds, a mode, other names, the
   tick, a person's sheet, a node cleaned), Markdown both ways through the real docmd.js, the import cleaner with the card core and without it,
   and the wiring pinned (the editor, the preview, the page search, quick jump, the drawings, Help and both release notes).
   Usage: node tools/plancardcheck.js (exit 1 on failure) */
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
    const C = await import(url('cardcore.js')), M = await import(url('docmd.js'));
    const CU = await import('file:///' + path.resolve(path.join(app, 'scripts', 'cleanup.js')).replace(/[\\]/g, '/'));

    // the kinds
    check('the Mode list is a scene, a person, a place, a clue and a plain table, in that order, each kind naming its own fields; a scene keeps today\'s words and columns and wears no drawing, so a scene is drawn as before',
        J(C.ORDER) === J(['scene', 'person', 'place', 'clue', 'table']) && C.KINDS.scene.title === 'Scene title' && C.KINDS.scene.must === 'Must resolve' && J(C.KINDS.scene.cols) === J(['Action', 'Why', 'Cost', 'Returns via']) && C.KINDS.scene.ico === ''
        && J([C.KINDS.person.tag, C.KINDS.person.must, C.KINDS.person.map]) === J(['Role', 'Wants', 'Where they are']) && J([C.KINDS.place.tag, C.KINDS.place.must]) === J(['Area', 'When they arrive']) && J([C.KINDS.clue.must, C.KINDS.clue.map]) === J(['Points to', 'Where it can be found'])
        && C.KINDS.place.ico === 'wi-marker' && C.KINDS.person.ico === 'wi-person' && C.KINDS.clue.ico === 'wi-clue' && C.KINDS.scene.tick === 'Played' && C.KINDS.clue.tick === 'Found' && !C.KINDS.person.tick && C.KINDS.person.sheet && Object.isFrozen(C.KINDS) && Object.isFrozen(C.KINDS.person.cols));
    check('a node\'s kind is its mode, one of four words, and anything else is a scene: no mode, another word, another case, a prototype\'s name, a number',
        J([{}, { mode: 'person' }, { mode: 'place' }, { mode: 'clue' }, { mode: 'table' }, { mode: 'Person' }, { mode: '__proto__' }, { mode: 'constructor' }, { mode: 3 }, null].map(C.cardKind)) === J(['scene', 'person', 'place', 'clue', 'table', 'scene', 'scene', 'scene', 'scene', 'scene']) && C.kindBy('hasOwnProperty') === C.KINDS.scene);
    // other names
    const ak = C.cleanAka('Mira, the Fox; mira ,  Old\tHolt,,');
    check('Also known as: names between commas or semicolons, spaces folded, each once whatever its capitals, nothing for none',
        J(ak) === J(['Mira', 'the Fox', 'Old Holt']) && C.cleanAka('  , ;') === undefined && C.cleanAka(42) === undefined && C.akaText(['a', 'b']) === 'a, b' && C.akaText(null) === '', J(ak));
    const many = C.cleanAka(Array.from({ length: 30 }, (_, i) => 'N' + i)), long = C.cleanAka(['x'.repeat(200)]), odd = C.cleanAka(['a' + String.fromCharCode(0x202e) + 'b', 'c' + String.fromCharCode(7) + 'd', 5, {}, 'x'.repeat(79) + String.fromCharCode(0xd83d, 0xde00)]);
    check('... 12 names at most, each 80 characters at most with no half of a character at its end, control and direction characters made spaces, what is no text passed over',
        many.length === 12 && long[0].length === 80 && J(odd) === J(['a b', 'c d', 'x'.repeat(79)]), J([many.length, long[0].length, odd]));
    check('a card\'s names are its title, its markup left out, and then each other name not the same as one before it',
        J(C.cardNames({ title: '<b>Mira</b> Holt', aka: ['Fox', 'MIRA HOLT', 'Old one'] })) === J(['Mira Holt', 'Fox', 'Old one']) && J(C.cardNames({ title: '', aka: ['Only'] })) === J(['Only']) && J(C.cardNames(null)) === '[]');
    // the tick and the sheet
    check('Played or Found is true only, and only on a kind that has the tick; a person\'s sheet is a plain id, and one of the characters where they are handed in',
        C.cleanDone(true, 'scene') === true && C.cleanDone(true, 'clue') === true && C.cleanDone(true, 'person') === undefined && C.cleanDone('true', 'scene') === undefined && C.cleanDone(1, 'clue') === undefined
        && C.cleanSheet('c_1') === 'c_1' && C.cleanSheet('c_1', { c_1: {} }) === 'c_1' && C.cleanSheet('c_2', { c_1: {} }) === undefined && C.cleanSheet('toString', {}) === undefined && C.cleanSheet('a b') === undefined && C.cleanSheet('x'.repeat(65)) === undefined && C.cleanSheet(7) === undefined);
    const n1 = { type: 'node', mode: 'clue', aka: ['x', 'X', 'y'], done: true, sheet: 'c_1', title: 'T' }, n2 = { type: 'node', mode: 'person', done: true, sheet: 'c_1' }, n3 = { type: 'node', mode: 'bogus', aka: 'a, b', done: 'yes' }, n4 = { type: 'node', mode: 'table', aka: ['a'] }, n5 = { type: 'text', mode: 'x', aka: 1 };
    [n1, n3, n4, n5].forEach(b => C.cleanCard(b)); C.cleanCard(n2, { c_1: {} });
    check('a node\'s card keys cleaned: a mode as one of the four words, other names as a list, the tick only on its kind, a sheet only on a person; a plain table keeps no other names; a block that is no node left as it is',
        J(n1) === J({ type: 'node', mode: 'clue', aka: ['x', 'y'], done: true, title: 'T' }) && J(n2) === J({ type: 'node', mode: 'person', sheet: 'c_1' }) && J(n3) === J({ type: 'node', aka: ['a', 'b'] }) && J(n4) === J({ type: 'node', mode: 'table' }) && J(n5) === J({ type: 'text', mode: 'x', aka: 1 }), J([n1, n2, n3, n4]));
    check('a node with none of the card keys is cleaned to itself, key for key', (() => { const b = { type: 'node', title: 'The docks', tag: 'Stealth', must: 'Who?', cols: [], rows: [] }, j = J(b); C.cleanCard(b); return J(b) === j; })());

    // Markdown both ways
    const plan = { type: 'planner', meta: { title: 'P' }, blocks: [
        { id: 'b1', type: 'h1', title: 'P' },
        { id: 'b2', type: 'node', title: 'The docks', tag: 'Stealth', must: 'Who tipped them off?', cols: [], rows: [] },
        { id: 'b3', type: 'node', mode: 'person', title: 'Mira Holt', aka: ['The Fox', 'Old Mira'], tag: 'Barkeep', must: 'Her debt paid', cols: ['If asked about', 'Says', 'The truth'], rows: [{ col1: 'The ledger', col2: 'Never saw it', col3: 'She hid it' }] },
        { id: 'b4', type: 'node', mode: 'place', title: 'The Salt Market', tag: 'East ward', must: 'Smoke and gulls', cols: [], rows: [] },
        { id: 'b5', type: 'node', mode: 'clue', title: 'A torn page', done: true, must: 'The harbourmaster', cols: [], rows: [] },
        { id: 'b6', type: 'node', title: 'Played one', done: true, cols: [], rows: [] }] };
    const md = M.docToMarkdown(plan, {}).text;
    check('Markdown: a card writes its kind, its other names, its tick and its own words for its tag and its lead line; a scene with none of them is written as before',
        md.includes('### Scene: The docks\n**Tag:** Stealth\n**Must resolve:** Who tipped them off?\n') && md.includes('### Person: Mira Holt\n**Also known as:** The Fox, Old Mira\n**Role:** Barkeep\n**Wants:** Her debt paid\n')
        && md.includes('### Place: The Salt Market\n**Area:** East ward\n**When they arrive:** Smoke and gulls\n') && md.includes('### Clue: A torn page\n**Found:** yes\n**Points to:** The harbourmaster\n') && md.includes('### Scene: Played one\n**Played:** yes\n'), md);
    const back = M.markdownToBlocks(md, { kind: 'planner' }).blocks.filter(b => b.type === 'node');
    const keyOf = b => J({ mode: b.mode, title: b.title, aka: b.aka, done: b.done, tag: b.tag, must: b.must, rows: (b.rows || []).length });
    check('... and reads back as the same cards: kinds, other names, ticks, tags, lead lines and rows',
        J(back.map(keyOf)) === J(plan.blocks.slice(1).map(b => keyOf(Object.assign({ tag: '', must: '' }, b)))), J(back.map(keyOf)));
    const hand = M.markdownToBlocks('# P\n\n### Clue: Ash\n**Played:** yes\n**Found:** maybe\n\n### Person: Bo\n**Found:** yes\n**Also known as:** , ;\n', { kind: 'planner' }).blocks.filter(b => b.type === 'node');
    check('... a tick another kind has, a tick that does not say yes and other names that hold none are passed over',
        hand.length === 2 && hand[0].mode === 'clue' && hand[0].done === undefined && hand[1].mode === 'person' && hand[1].done === undefined && hand[1].aka === undefined, J(hand));
    const old = M.markdownToBlocks('# Plan\n\n### Scene: The docks\n**Tag:** Stealth\n**Must resolve:** Who?\n', { kind: 'planner' }).blocks.filter(b => b.type === 'node');
    check('... a file from before cards reads as it always did: a scene with no mode', old.length === 1 && !('mode' in old[0]) && old[0].tag === 'Stealth' && old[0].must === 'Who?', J(old));

    // the import cleaner
    const file = () => ({ chars: { c_1: { id: 'c_1', name: 'Mira' } }, items: { p1: { id: 'p1', type: 'planner', meta: { title: 'P' }, blocks: [
        { id: 'b1', type: 'node', mode: 'person', title: 'Mira', aka: ['Fox', 'fox', 5], sheet: 'c_1', done: true },
        { id: 'b2', type: 'node', mode: 'clue', done: true, sheet: 'c_1' },
        { id: 'b3', type: 'node', mode: 'evil', aka: 'x' },
        { id: 'b4', type: 'node', mode: 'person', sheet: 'c_9' },
        { id: 'b5', type: 'node', mode: 'table', aka: ['a'] }] } } });
    const icA = file(); CU.cleanImportItems(icA, { CARD: C });
    const bA = icA.items.p1.blocks;
    check('a file\'s cards come in as the card core keeps them: a person\'s sheet only where the file names that character, a tick only on its kind, other names cleaned, a mode it does not know read as a scene',
        J(bA[0]) === J({ id: 'b1', type: 'node', mode: 'person', title: 'Mira', aka: ['Fox'], sheet: 'c_1' }) && J(bA[1]) === J({ id: 'b2', type: 'node', mode: 'clue', done: true }) && J(bA[2]) === J({ id: 'b3', type: 'node', aka: ['x'] }) && J(bA[3]) === J({ id: 'b4', type: 'node', mode: 'person' }) && J(bA[4]) === J({ id: 'b5', type: 'node', mode: 'table' }), J(bA));
    const icN = file(); CU.cleanImportItems(icN, {});
    check('... and with no card core at hand none of the card keys comes in but a plain table\'s mode, and the cards stay as scenes',
        icN.items.p1.blocks.every(b => !('aka' in b) && !('done' in b) && !('sheet' in b)) && J(icN.items.p1.blocks.map(b => b.mode)) === J([undefined, undefined, undefined, undefined, 'table']), J(icN.items.p1.blocks));

    // the wiring
    const pl = read('scripts/planner.js'), dp = fs.readFileSync(path.join(app, 'scripts', 'docpanel.js'), 'latin1'), mn = read('scripts/main.js'), css = read('style.css'), ix = read('index.html');
    check('the editor: the Mode list is drawn from the kinds in their order and keeps every field when switched; each kind names its boxes; Also known as, the tick and a person\'s Sheet have their own boxes and handlers',
        pl.includes("import * as CC from './cardcore.js';") && pl.includes("CC.ORDER.map(function(k) { return '<option value=\"' + (k === 'scene' ? 'node' : k) + '\"'") && pl.includes("var mv = CC.cleanMode(this.value); if (mv) bb.mode = mv; else delete bb.mode;")
        && pl.includes("html += pbeCap(kd.must) + tsBoxHtml('field b-must', kd.mustPh,") && pl.includes("querySelectorAll('.b-aka')") && pl.includes("querySelectorAll('.b-done')") && pl.includes("querySelectorAll('.b-sheet')") && pl.includes("s = CC.cleanSheet(this.value, camp && camp.chars)"));
    check('the add-block menu offers a Person, a Place and a Clue card beside the scene, each made a node of that kind',
        pl.includes("['person', 'Person card', 'Play', 'wants, what they say', 'planner'], ['place', 'Place card', 'Play', 'what they find there', 'planner'], ['clue', 'Clue card', 'Play', 'what it points to', 'planner'],") && pl.includes("if (type === 'person' || type === 'place' || type === 'clue') return { id: 'b_' + uid(), type: 'node', mode: type };"));
    check('the preview: a card of a kind wears its drawing before its name and its own word before its lead line, with its other names, its sheet and its tick; a scene with none of them is drawn byte for byte as before; a card\'s default columns are its kind\'s',
        pl.includes("(kdP.ico ? '<i class=\"wib ' + kdP.ico + '\" title=\"' + esc(kdP.label) + '\"></i> ' : '')") && pl.includes("html += '<p class=\"must\"><b>' + esc(kdP.must) + ':</b> '") && pl.includes("if (akaP) html += '<p class=\"card-aka\"><b>Also known as:</b> ' + esc(akaP.join(', ')) + '</p>';")
        && pl.includes("must: 'Must resolve', sheet: false, cols: ['Action', 'Why', 'Cost', 'Returns via'] }") && pl.includes("(plainPv ? ['Item', 'Detail', 'Notes'] : kdP.cols.slice())"));
    check('search reads a card\'s other names (docpanel.js, byte for byte, LF only with its three NULs); quick jump lists every card by its name and its other names once a word is typed, and opens the page at the card',
        dp.includes("case 'node': return stripMarkup([b.title, b.tag, b.must].concat(Array.isArray(b.aka) ? b.aka : [], Array.isArray(b.cols)") && (dp.match(/\x00/g) || []).length === 3 && !dp.includes('\r')
        && mn.includes("_cmdkEntries.push({ kind: 'planner', card: true, label: names[0], aka: names.slice(1),") && mn.includes("if (!ql) s = en.kind === 'set' || en.card ? -1") && mn.includes("try { return pn.landOf({ at: en.at }) || null; }") && mn.includes("CARD: window.wpCardCore"));
    check('the drawings: a Person card wears the Characters drawing, a Place the map pin the Open map link wears, a Clue the glass with a cross inside; each a rule of its own beside the others',
        css.includes("  .wi-person { --wi: url(") && css.includes("M12 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM5.5 20v-1.5A4.5 4.5 0 0 1 10 14h4a4.5 4.5 0 0 1 4.5 4.5V20") && css.includes("  .wi-clue { --wi: url(") && css.includes("M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20M10.5 7.5v6M7.5 10.5h6") && css.includes("  .wi-marker { --wi: url("));
    const wn = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, NL));
    check('Help says it in plain words, the Markdown format names the three headings, and both release notes carry it alike',
        ix.includes("<li><b>Cards</b>: a scene node&rsquo;s <b>Mode</b> list makes it a <b>Person</b>, a <b>Place</b> or a <b>Clue</b> card") && ix.includes("<b>Also known as</b> takes a card&rsquo;s other names") && ix.includes("<code>### Person:</code>, <code>### Place:</code> and <code>### Clue:</code> open a card")
        && wn.every(w => w.includes("- A planner's scene node can now be a Person, a Place or a Clue card.") && w.includes("- Every card has Also known as for its other names.")));
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
