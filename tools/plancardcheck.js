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
    check('a card\'s name is the words the page shows for its title: a < that opens no tag is a character of the name, and the entities a title may hold are read as their characters, each once',
        J([{ title: 'R&amp;D Tech' }, { title: 'Guard <2>' }, { title: 'a &lt;b> c' }, { title: 'x &amp;lt; y' }, { title: 'Tom &amp; <i>Jerry</i>&nbsp;Co' }, { title: 'heir <?php x ?> two' }, { title: 'DC < 15 &copy;' }, { title: 5 }].map(b => C.cardNames(b)[0]))
        === J(['R&D Tech', 'Guard <2>', 'a <b> c', 'x &lt; y', 'Tom & Jerry Co', 'heir two', 'DC < 15 &copy;', undefined]));
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

    // 1.6.2 (backlog 166 d): a scene's session
    check('a scene\u2019s session (cleanWhen, sessionOf, setSession): Ahead or Tonight only on a scene, Played its own tick, never two at once; a card that is no scene has none',
        J(C.WHEN) === J(['ahead', 'tonight']) && C.cleanWhen('tonight', 'scene') === 'tonight' && C.cleanWhen('ahead', { type: 'node' }) === 'ahead' && C.cleanWhen('tonight', 'clue') === undefined && C.cleanWhen('Tonight', 'scene') === undefined && C.cleanWhen('played', 'scene') === undefined && C.cleanWhen(1, 'scene') === undefined
        && C.sessionOf({ type: 'node', when: 'tonight' }) === 'tonight' && C.sessionOf({ type: 'node', done: true, when: 'tonight' }) === 'played' && C.sessionOf({ type: 'node', mode: 'clue', when: 'tonight' }) === '' && C.sessionOf({ type: 'text', when: 'ahead' }) === '' && C.sessionOf(null) === ''
        && J(C.setSession({ type: 'node', done: true }, 'tonight')) === J({ type: 'node', when: 'tonight' }) && J(C.setSession({ type: 'node', when: 'ahead' }, 'played')) === J({ type: 'node', done: true }) && J(C.setSession({ type: 'node', when: 'ahead' }, '')) === J({ type: 'node' }) && J(C.setSession({ type: 'node', mode: 'clue', done: true }, 'tonight')) === J({ type: 'node', mode: 'clue' }));
    const s1 = { type: 'node', when: 'tonight' }, s2 = { type: 'node', done: true, when: 'ahead' }, s3 = { type: 'node', mode: 'person', when: 'tonight' }, s4 = { type: 'node', when: 'later' }; [s1, s2, s3, s4].forEach(b => C.cleanCard(b));
    check('a node cleaned keeps a scene\u2019s session only as one of the two words, never beside Played and never on another kind', J([s1, s2, s3, s4]) === J([{ type: 'node', when: 'tonight' }, { type: 'node', done: true }, { type: 'node', mode: 'person' }, { type: 'node' }]), J([s1, s2, s3, s4]));
    const planS = { type: 'planner', meta: { title: 'S' }, blocks: [{ id: 'b1', type: 'h1', title: 'S' }, { id: 'b2', type: 'node', title: 'The heist', when: 'tonight', cols: [], rows: [] }, { id: 'b3', type: 'node', title: 'The escape', when: 'ahead', cols: [], rows: [] }, { id: 'b4', type: 'node', title: 'The job', done: true, cols: [], rows: [] }] };
    const mdS = M.docToMarkdown(planS, {}).text, backS = M.markdownToBlocks(mdS, { kind: 'planner' }).blocks.filter(b => b.type === 'node');
    const handS = M.markdownToBlocks('# P\n\n### Clue: Ash\n**Session:** Tonight\n\n### Scene: Odd\n**Session:** Someday\n\n### Scene: Both\n**Played:** yes\n**Session:** Ahead\n', { kind: 'planner' }).blocks.filter(b => b.type === 'node');
    check('Markdown: a scene writes its session as Session: Tonight or Ahead and reads it back; Played stays its tick; a session on a clue, a word it does not know and one beside Played are passed over',
        mdS.includes('### Scene: The heist\n**Session:** Tonight\n') && mdS.includes('### Scene: The escape\n**Session:** Ahead\n') && mdS.includes('### Scene: The job\n**Played:** yes\n')
        && J(backS.map(b => [b.title, b.when, b.done])) === J([['The heist', 'tonight', undefined], ['The escape', 'ahead', undefined], ['The job', undefined, true]]) && J(handS.map(b => [b.when, b.done])) === J([[undefined, undefined], [undefined, undefined], [undefined, true]]), J([mdS, backS, handS]));
    const plR = read('scripts/planner.js'), ixR = read('index.html'), csR = read('style.css');
    check('wired (pinned): the editor offers a scene its Session list in place of the Played tick, a clue keeps Found; the preview colors Tonight and Ahead and says them; Help says it',
        plR.includes("(kd.key === 'scene' ? ' <label class=\"b-when-l\"") && plR.includes("(kd.tick && kd.key !== 'scene' ? ' <label class=\"b-done-l\"") && plR.includes("CC.setSession(bb, this.value); save(); renderPlannerPreview();") && plR.includes("<span class=\"card-tick card-tick-tonight\">Tonight</span>")
        && /\.doc-view \.node\.card-tonight \{ box-shadow: inset 3px 0 0 var\(--gold\); \}/.test(csR) && /\.doc-view \.node\.card-ahead \{ box-shadow: inset 3px 0 0 var\(--blue\); \}/.test(csR) && ixR.includes('A scene card has a <b>Session</b> list: <b>Ahead</b>, <b>Tonight</b> or <b>Played</b>'));

    // 1.6.2 (backlog 166 g): a card's cue
    check('a card\u2019s cue (cleanCue): a sound, a song, a playlist or a saved effect by a plain id, on any card but a plain table; anything else none',
        J(C.CUE_K) === J(['s', 'm', 'p', 'f']) && J(C.cleanCue({ k: 's', id: 'snd_1', x: 1 }, 'scene')) === J({ k: 's', id: 'snd_1' }) && J(C.cleanCue({ k: 'f', id: 'se_ab' }, 'place')) === J({ k: 'f', id: 'se_ab' })
        && C.cleanCue({ k: 'm', id: 't1' }, 'table') === undefined && C.cleanCue({ k: 'x', id: 't1' }, 'scene') === undefined && C.cleanCue({ k: 'p', id: 'a b' }, 'scene') === undefined && C.cleanCue({ k: 'p', id: '' }, 'scene') === undefined && C.cleanCue('s:x', 'scene') === undefined && C.cleanCue(null, 'scene') === undefined);
    const q1 = { type: 'node', cue: { k: 'p', id: 'pl_1', junk: '<b>' } }, q2 = { type: 'node', mode: 'table', cue: { k: 's', id: 's1' } }, q3 = { type: 'node', mode: 'clue', cue: { k: 'z', id: 's1' } }; [q1, q2, q3].forEach(b => C.cleanCard(b));
    check('a node cleaned keeps its cue only as its two keys, never on a plain table', J([q1, q2, q3]) === J([{ type: 'node', cue: { k: 'p', id: 'pl_1' } }, { type: 'node', mode: 'table' }, { type: 'node', mode: 'clue' }]), J([q1, q2, q3]));
    {   // the planner's own half, sliced by its plancardcheck cue markers and run for real
        const src = read('scripts/planner.js'), a = src.indexOf('// [plancardcheck:cue-start]'), b = src.indexOf('// [plancardcheck:cue-end]');
        const calls = [], win = { wpSound: { entries: () => [{ id: 's_rain', name: 'Rain <b>', kind: 'loop' }, { id: 'bad id', name: 'x' }], play: id => { calls.push(['s', id]); return id === 's_rain'; } }, wpMusic: { play: o => calls.push(['m', o]) }, wpFx: { saved: () => [{ id: 'se_fog', name: 'Fog bank' }], startSaved: id => { calls.push(['f', id]); return id === 'se_fog'; } } };
        const camp = { id: 'k1', music: { tracks: [{ id: 't_1', name: 'Tavern' }], playlists: [{ id: 'p_1', name: 'Battle', tracks: [] }] } };
        const P = new Function('window', 'getActiveCampaign', 'esc', 'URLSearchParams', src.slice(a, b) + '\nreturn { cueLists, cueName, cueOptions, cuePlay, pvCueMsg, pvCueOk };')(win, () => camp, s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), URLSearchParams);
        const L = P.cueLists(camp), opt = P.cueOptions({ k: 'p', id: 'p_1' }), gone = P.cueOptions({ k: 'f', id: 'se_gone' });
        check('166 g the lists a cue picks from (cueLists, cueOptions, run for real): the Sound panel\u2019s sounds, the campaign\u2019s songs and playlists and its saved effects, a plain id each; the options grouped and escaped, the card\u2019s own picked, one no longer there said as not found',
            J(L.s.map(x => x.id)) === J(['s_rain']) && J(L.m.map(x => x.id)) === J(['t_1']) && J(L.p.map(x => x.id)) === J(['p_1']) && J(L.f.map(x => x.id)) === J(['se_fog'])
            && opt.includes('<option value="">Nothing</option>') && opt.includes('<optgroup label="Sounds"><option value="s:s_rain">Rain &lt;b&gt;</option></optgroup>') && opt.includes('<option value="p:p_1" selected>Battle</option>') && !opt.includes('Not found')
            && gone.includes('<option value="f:se_gone" selected>Not found in this campaign</option>') && P.cueName({ k: 'm', id: 't_1' }, camp) === 'Tavern' && P.cueName({ k: 'm', id: 'nope' }, camp) === '', J([L, opt, gone]));
        const r = [P.cuePlay('s', 's_rain'), P.cuePlay('m', 't_1'), P.cuePlay('p', 'p_1'), P.cuePlay('f', 'se_fog'), P.cuePlay('f', 'se_gone'), P.cuePlay('s', 'a b'), P.cuePlay('z', 's_rain')];
        check('166 g a press starts it by the panel that owns it (cuePlay, run for real): a sound by the Sound panel\u2019s play, a song and a playlist by the Music panel\u2019s, a saved effect by the Effects panel\u2019s; an id that is no plain id or a kind it does not know starts nothing',
            J(r) === J([true, true, true, true, false, false, false]) && J(calls) === J([['s', 's_rain'], ['m', { kind: 'track', id: 't_1' }], ['m', { kind: 'playlist', id: 'p_1' }], ['f', 'se_fog'], ['f', 'se_gone']]), J([r, calls]));
        const msg = P.pvCueMsg('?popout=doc%3Ak1%2Fplan_1', { dataset: { k: 'p', id: 'p_1' } });
        check('166 g from a window of its own the press goes to the main window, which starts it only for the campaign it has open (pvCueMsg, pvCueOk)',
            J(msg) === J({ type: 'cue', camp: 'k1', k: 'p', id: 'p_1' }) && P.pvCueOk(msg, camp) === true && P.pvCueOk(Object.assign({}, msg, { camp: 'k2' }), camp) === false && P.pvCueOk(Object.assign({}, msg, { k: 'x' }), camp) === false
            && P.pvCueMsg('?popout=sheet%3Ac1', { dataset: { k: 'p', id: 'p_1' } }) === null && P.pvCueMsg('?popout=doc%3Ak1%2Fp', { dataset: { k: 'q', id: 'x' } }) === null, J(msg));
        const plC = read('scripts/planner.js'), ixC = read('index.html');
        check('166 g wired (pinned): the editor\u2019s Plays list under a card\u2019s map, the preview\u2019s Play button, the press in the preview, the panel over the map and a window of its own; Help says it',
            plC.includes('<div class="fc-opts" style="margin-bottom:10px;"><label>Plays <select class="b-cue"') && plC.includes('class="tool ghost pv-cue" data-k="') && plC.includes("_el_plannerPreviewEl.addEventListener('click', pvCueGo);") && plC.includes("_el_docPanelBodyEl.addEventListener('click', pvCueGo);")
            && plC.includes('else if (pvCueOk(e.data, getActiveCampaign())) cuePlay(e.data.k, e.data.id);') && ixC.includes('<b>Plays</b>'));
    }

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
    /* ---- cards side by side (1.6.2, backlog 107 (a); docs/PLANNER_ORG_DESIGN.md 4.6) ---- */
    check('cards side by side, the keys: a section\'s cards is one of three sizes and anything else is none; a card and a picture may be ticked Wide card, which is layout.span only as true; in a card section text, a chart and Raw HTML take the whole row, a card, a note and a picture do not unless ticked',
        J(C.CARD_SIZES) === J(['small', 'medium', 'large']) && J(['small', 'medium', 'large', 'Medium', ' medium', 'huge', '', 1, null, undefined, {}, ['medium'], '__proto__', 'constructor'].map(C.cleanCards)) === J(['small', 'medium', 'large', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined])
        && J(['node', 'image', 'callout', 'flare', 'text', 'h2', 'flowchart', 'raw'].map(t => C.wideMay({ type: t }))) === J([true, true, false, false, false, false, false, false]) && C.wideMay(null) === false && C.wideMay('node') === false
        && J([{ type: 'node', layout: { span: true } }, { type: 'node', layout: { span: 1 } }, { type: 'node', layout: { span: 'true' } }, { type: 'node' }, { type: 'node', layout: 'span' }, { type: 'callout', layout: { span: true } }, { type: 'image', layout: { span: true } }].map(C.wideOn)) === J([true, false, false, false, false, false, true])
        && J(['node', 'callout', 'flare', 'image', 'text', 'lede', 'oneline', 'h3', 'diagram', 'flowchart', 'raw', 'rule', 'nonsense'].map(t => C.cardWide({ type: t }))) === J([false, false, false, false, true, true, true, true, true, true, true, true, true])
        && C.cardWide({ type: 'node', layout: { span: true } }) === true && C.cardWide({ type: 'callout', layout: { span: true } }) === false && C.cardWide(null) === true && C.cardWide(7) === true);
    const w1 = C.wideSet({ type: 'node' }, true), w2 = C.wideSet({ type: 'node', layout: { span: true } }, false), w3 = C.wideSet({ type: 'image', layout: { span: true, width: 50 } }, false), w4 = C.wideSet({ type: 'callout' }, true), w5 = C.wideSet({ type: 'node', layout: [1] }, true), w6 = C.wideSet({ type: 'node' }, 'yes');
    check('cards side by side, the tick and the cleaner: ticking writes layout.span true and unticking takes it off, the layout going with its last key and any other key staying; only true ticks, and a block that may not be wide is left alone. A section heading keeps its cards only as one of the three sizes, and any other block loses the key',
        J(w1) === J({ type: 'node', layout: { span: true } }) && J(w2) === J({ type: 'node' }) && J(w3) === J({ type: 'image', layout: { width: 50 } }) && J(w4) === J({ type: 'callout' }) && J(w5) === J({ type: 'node', layout: { span: true } }) && J(w6) === J({ type: 'node' })
        && J([{ type: 'h2', cards: 'small' }, { type: 'h2', cards: 'Small' }, { type: 'h2', cards: 3 }, { type: 'node', cards: 'medium' }, { type: 'h1', cards: 'large' }, { type: 'h2' }].map(C.cleanSection)) === J([{ type: 'h2', cards: 'small' }, { type: 'h2' }, { type: 'h2' }, { type: 'node' }, { type: 'h1' }, { type: 'h2' }]) && C.cleanSection(null) === null);
    const planC = { id: 'pc', type: 'planner', meta: { title: 'Cards' }, blocks: [{ type: 'h1', title: 'Cards' }, { type: 'h2', title: 'People', cards: 'medium' },
        { type: 'node', mode: 'person', title: 'Kael', layout: { span: true } }, { type: 'node', title: 'The gate' }, { type: 'node', mode: 'table', title: 'Prices', cols: ['Item', 'Cost'], rows: [{ col1: 'Ale', col2: '2' }], layout: { span: true } },
        { type: 'node', mode: 'table', title: '', cols: ['A', 'B'], rows: [{ col1: '1', col2: '2' }], layout: { span: true } }, { type: 'node', mode: 'table', title: 'Plain', cols: ['A'], rows: [{ col1: '1' }] },
        { type: 'image', src: '', caption: 'A map', layout: { span: true } }, { type: 'h2', title: 'After', cards: 'huge' }, { type: 'h2', title: 'Small ones', cards: 'small' }] };
    const mdC = M.docToMarkdown(planC, {}).text, readC = M.markdownToBlocks(mdC, { kind: 'planner' }), bkC = readC.blocks, keyC = b => [b.type, b.mode || '', b.title || b.caption || '', b.cards || '', C.wideOn(b) ? 'wide' : ''].join('|');
    const mdPlain = M.docToMarkdown({ id: 'pp', type: 'planner', meta: { title: 'P' }, blocks: [{ type: 'h1', title: 'P' }, { type: 'h2', title: 'S' }, { type: 'node', title: 'N' }, { type: 'node', mode: 'table', title: 'T', cols: ['A'], rows: [{ col1: '1' }] }] }, {}).text;
    const handC = M.markdownToBlocks('# P\n\n## Loot {cards=Large}\n\n## Odd {cards=huge}\n\n## Bare {cards}\n\n### Scene: Off {wide=no}\n\n{wide}\n\nJust words.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n', { kind: 'planner' });
    const pageC = M.markdownToBlocks('# Page\n\n## Rules {cards=medium}\n\n### Sub {wide}\n\n{wide}\n\n| A | B |\n|---|---|\n| 1 | 2 |\n', { kind: 'doc' });
    check('cards side by side, Markdown both ways (the real docmd.js): a section writes {cards=medium} on its heading, a wide card {wide} after its heading, a wide plain table {wide} alone on the line above it, titled or not, and a wide picture span in its braces, and each reads back to the very key; a size that is none is not written. A planner that uses none of it is written with no brace at all. By hand: the size in any case, a size that is none or missing said in a note and not kept, {wide=no} no tick, and {wide} above words that are no table marks nothing after it. On a page the same braces stay part of the words, as they always did',
        mdC.includes('## People {cards=medium}\n') && mdC.includes('### Person: Kael {wide}\n') && mdC.includes('### Scene: The gate\n') && mdC.includes('{wide}\n\n**Prices**\n| Item | Cost |') && mdC.includes('{wide}\n\n| A | B |') && !mdC.includes('{wide}\n\n**Plain**')
        && /!\[A map\]\([^)]*\)\{span\}/.test(mdC) && mdC.includes('## After\n') && mdC.includes('## Small ones {cards=small}\n') && !/[{}]/.test(mdPlain)
        && J(bkC.map(keyC)) === J(['h1||Cards||', 'h2||People|medium|', 'node|person|Kael||wide', 'node||The gate||', 'node|table|Prices||wide', 'node|table|||wide', 'node|table|Plain||', 'image||A map||wide', 'h2||After||', 'h2||Small ones|small|'])
        && J(handC.blocks.map(keyC)) === J(['h1||P||', 'h2||Loot|large|', 'h2||Odd||', 'h2||Bare||', 'node||Off||', 'text||||', 'node|table|||']) && handC.notes.filter(n => /cards must be small, medium or large/.test(n)).length === 2
        && J(pageC.blocks.filter(b => b.type !== 'text').map(b => [b.type, b.title || '', b.cards || '', b.layout ? 'lay' : ''].join('|'))) === J(['h1|Page||', 'h2|Rules {cards=medium}||', 'h3|Sub {wide}||', 'table|||']),
        J([mdC, bkC.map(keyC), handC.blocks.map(keyC), handC.notes, pageC.blocks.map(b => [b.type, b.title || '', b.cards || ''].join('|'))]));
    const planR = { id: 'pr', type: 'planner', meta: { title: 'R' }, blocks: [{ type: 'h1', title: 'R' }, { type: 'node', title: 'One' }, { type: 'node', mode: 'table', title: 'Stock', cols: ['Item', 'Cost'], rows: [{ col1: 'Ale', col2: '2' }] },
        { type: 'node', title: 'Two' }, { type: 'node', mode: 'table', title: '', cols: ['A', 'B'], rows: [{ col1: '1', col2: '2' }], layout: { span: true } }] };
    const backR = M.markdownToBlocks(M.docToMarkdown(planR, {}).text, { kind: 'planner' }).blocks.map(b => [b.type, b.mode || '', b.title || '', (b.cols || []).join('/'), C.wideOn(b) ? 'wide' : ''].join('|'));
    check('a table of its own stays one through Markdown (found while building cards side by side): a titled table right after a card that has no rows is read back as that table with its title, and a wide table with no title after such a card as that table, where each used to become the rows of the card above it',
        J(backR) === J(['h1||R||', 'node||One||', 'node|table|Stock|Item/Cost|', 'node||Two||', 'node|table||A/B|wide']), J(backR));
    {   // 1.6.2 (the owner, 2026-11-11, by prompt: "Blank line ends the card (Recommended)")
        const kG = b => [b.type, b.mode || '', b.title || '', (b.cols || []).join('/'), (b.rows || []).length, b.tag || '', b.must || ''].join('|');
        const planG = { id: 'pg', type: 'planner', meta: { title: 'G' }, blocks: [{ type: 'h1', title: 'G' }, { type: 'node', title: 'Empty' }, { type: 'node', mode: 'table', title: '', cols: ['A', 'B'], rows: [{ col1: '1', col2: '2' }] },
            { type: 'node', title: 'Full', tag: 'Dock', must: 'Find it', cols: ['Who', 'What'], rows: [{ col1: 'Kael', col2: 'Waits' }, { col1: 'Bram', col2: 'Runs' }] }, { type: 'node', mode: 'table', title: '', cols: ['X'], rows: [{ col1: 'y' }] }, { type: 'node', mode: 'person', title: 'Kael', tag: 'Guard' }] };
        const mdG = M.docToMarkdown(planG, {}).text, backG = M.markdownToBlocks(mdG, { kind: 'planner' }).blocks.map(kG), againG = M.docToMarkdown({ id: 'pg', type: 'planner', meta: { title: 'G' }, blocks: M.markdownToBlocks(mdG, { kind: 'planner' }).blocks }, {}).text;
        const T = '| A | B |\n|---|---|\n| 1 | 2 |\n', hand = t => M.markdownToBlocks(t, { kind: 'planner' }).blocks.map(kG);
        const h1 = hand('### Scene: One\n' + T), h2 = hand('### Scene: One\n\n' + T), h3 = hand('### Scene: One\n**Tag:** Dock\n' + T), h4 = hand('### Scene: One\n**Tag:** Dock\n\n' + T), h5 = hand('### Scene: One\n\n**Tag:** Dock\n' + T), h6 = hand('### Scene: One\n\n**Must resolve:** Go\n\n\n' + T + '\n' + T);
        const h7 = hand('### Scene: One\n\n' + T + '**Tag:** late\n'), page = M.markdownToBlocks('### Sub\n' + T, { kind: 'doc' }).blocks.map(b => b.type);
        check('1.6.2 a blank line before a table ends the card above it (the real docmd.js; the owner, by prompt: "Blank line ends the card"): an untitled plain table after a card that has no rows is read back as a table of its own, where it used to become that card\'s rows, and a card\'s own rows, which the export writes right under its lines, are read back as its rows; the same Markdown comes out of a second export. By hand: a table right under a card\'s heading or under one of its lines is its rows, a blank line before the table makes it a table of its own, a blank line before a line of the card changes nothing, the table after such a table is one too, and a line of the card after a table that ended it is plain words. A page reads as it always did',
            J(backG) === J(['h1||G||0||', 'node||Empty||0||', 'node|table||A/B|1||', 'node||Full|Who/What|2|Dock|Find it', 'node|table||X|1||', 'node|person|Kael||0|Guard|']) && againG === mdG
            && mdG.includes('### Scene: Empty\n\n| A | B |') && mdG.includes('**Must resolve:** Find it\n| Who | What |')
            && J(h1) === J(['node||One|A/B|1||']) && J(h2) === J(['node||One||0||', 'node|table||A/B|1||']) && J(h3) === J(['node||One|A/B|1|Dock|']) && J(h4) === J(['node||One||0|Dock|', 'node|table||A/B|1||']) && J(h5) === J(['node||One|A/B|1|Dock|'])
            && J(h6) === J(['node||One||0||Go', 'node|table||A/B|1||', 'node|table||A/B|1||']) && J(h7.slice(0, 2)) === J(['node||One||0||', 'node|table||A/B|1||']) && h7.length === 3 && h7[2].indexOf('text|') === 0 && J(page) === J(['h3', 'table']),
            J([backG, againG === mdG, h1, h2, h3, h4, h5, h6, h7, page, mdG]));
        // the review of 2026-11-11: a card's line that ends in a line break (only a file makes one) wrote a blank line before the card's own table, which now ends the card
        const planN = { id: 'pn', type: 'planner', meta: { title: 'N' }, blocks: [{ type: 'h1', title: 'N' }, { type: 'node', title: 'One\n', tag: 'Dock\n', must: 'Go\r\nnow\n\n', cols: ['X', 'Y'], rows: [{ col1: '1', col2: '2' }] }, { type: 'node', mode: 'person', title: 'Kael', aka: ['Kay\n'], tag: 'Guard \n ', cols: ['A'], rows: [{ col1: 'b' }] }] };
        const mdN = M.docToMarkdown(planN, {}).text, backN = M.markdownToBlocks(mdN, { kind: 'planner' }).blocks.map(kG);
        check('1.6.2 each of a card\'s lines is one line in Markdown (the real docmd.js): a title, a tag, a lead line or another name that ends in or holds a line break is written on one line, so no blank line stands before the card\'s own table and its rows come back on the card',
            J(backN) === J(['h1||N||0||', 'node||One|X/Y|1|Dock|Go now', 'node|person|Kael|A|1|Guard|']) && !/\n\n\|/.test(mdN.slice(mdN.indexOf('### Scene: One'))) && mdN.includes('### Scene: One\n**Tag:** Dock\n**Must resolve:** Go now\n| X | Y |'), J([backN, mdN]));
    }
    const kB = b => [b.type, b.mode || '', b.title !== undefined ? b.title : (b.content || ''), b.cards || '', C.wideOn(b) ? 'wide' : ''].join('|');
    const planB = { id: 'pb', type: 'planner', meta: { title: 'P' }, blocks: [{ type: 'h1', title: 'Plan {wide}' }, { type: 'h2', title: 'Sec {wide}' }, { type: 'h2', title: 'Costs {cards=small}' }, { type: 'h2', title: 'Real {cards=small}', cards: 'large' },
        { type: 'node', mode: 'person', title: 'Kael {cards=small}' }, { type: 'node', title: 'Vault {wide}' }, { type: 'node', title: 'Vault2 {wide}', layout: { span: true } }, { type: 'h2', title: 'Notes {cols=2}' }, { type: 'text', content: '<p>{wide}</p>' },
        { type: 'node', mode: 'table', title: '', cols: ['A', 'B'], rows: [{ col1: '1', col2: '2' }] }] };
    const mdB = M.docToMarkdown(planB, {}).text, backB = M.markdownToBlocks(mdB, { kind: 'planner' }).blocks.map(kB);
    const docB = { id: 'db', type: 'doc', meta: { title: 'D' }, blocks: [{ type: 'h1', title: 'D {span}' }, { type: 'h2', title: 'Notes {cols=2}' }, { type: 'h2', title: 'Two', cols: 2 }, { type: 'h3', title: 'Sub {width=50}' }] };
    const mdD = M.docToMarkdown(docB, {}).text, backD = M.markdownToBlocks(mdD, { kind: 'doc' }).blocks.map(b => [b.type, b.title, b.cols || ''].join('|'));
    const loose = M.markdownToBlocks('# P\n\n### Scene: A\n\n{wide}\n\n**bold**\n\npara\n\n| A | B |\n|---|---|\n| 1 | 2 |\n', { kind: 'planner' }).blocks.map(kB);
    const byHand = M.markdownToBlocks('# P {cards=small}\n\n# Second {wide}\n\n## Sec {wide}\n\n### Loose {wide}\n\n### Scene: Gate {cards=small}\n', { kind: 'planner' }).blocks.map(kB);
    check('braces that are part of the words stay part of them (the review of cards side by side): a title that really ends in {wide}, {cards=small} or {cols=2} is written with its brace escaped where the reader would take it for a key, and reads back whole, on a planner and on a page, beside a key of its own too. Only a section heading reads cards and only a card\'s heading reads wide, so the same braces on any other heading are words. A paragraph that is the very words {wide} is written escaped and stays a paragraph, and the table after it is not made wide. A {wide} line above a bold line that is no table\'s title marks nothing and stays words',
        J(backB) === J(planB.blocks.map(kB)) && mdB.includes('## Costs \\{cards=small}\n') && mdB.includes('## Real \\{cards=small} {cards=large}\n') && mdB.includes('### Scene: Vault2 \\{wide} {wide}\n') && mdB.includes('# Plan {wide}\n') && mdB.includes('## Sec {wide}\n') && mdB.includes('### Person: Kael {cards=small}\n') && mdB.includes('\n\\{wide}\n')
        && J(backD) === J(['h1|D {span}|', 'h2|Notes {cols=2}|', 'h2|Two|2', 'h3|Sub {width=50}|']) && mdD.includes('## Two {cols=2}\n')
        && J(loose) === J(['h1||P||', 'node||A||', 'text||<p>{wide}</p><p><b>bold</b></p><p>para</p>||', 'node|table|||'])
        && J(byHand.slice(0, 4)) === J(['h1||P {cards=small}||', 'h2||Second {wide}||', 'h2||Sec {wide}||', 'text||<p><b>Loose {wide}</b></p>||']) && byHand[4] === 'node||Gate {cards=small}||', J([mdB, backB, backD, loose, byHand]));
    const fileC = () => ({ id: 'c1', name: 'C', items: { p1: { id: 'p1', type: 'planner', meta: { title: 'P' }, blocks: [{ id: 'b_1', type: 'h2', title: 'A', cards: 'large' }, { id: 'b_2', type: 'h2', title: 'B', cards: 'x" onload="alert(1)' }, { id: 'b_3', type: 'node', title: 'N', cards: 'small' }, { id: 'b_4', type: 'h2', title: 'C', cards: { size: 'small' } }, { id: 'b_5', type: 'h2', title: 'D' }] } } });
    const icC = fileC(); CU.cleanImportItems(icC, { CARD: C }); const icD = fileC(); CU.cleanImportItems(icD, {});
    check('cards side by side, a file: the import cleaner keeps a section\'s cards only as one of the three sizes, on a section heading alone, and with no card core at hand keeps none; a block that never had the key gains none',
        J(icC.items.p1.blocks.map(b => b.cards)) === J(['large', undefined, undefined, undefined, undefined]) && J(icD.items.p1.blocks.map(b => b.cards)) === J([undefined, undefined, undefined, undefined, undefined])
        && icC.items.p1.blocks.every(b => b.cards !== undefined || !Object.prototype.hasOwnProperty.call(b, 'cards')), J([icC.items.p1.blocks, icD.items.p1.blocks]));
    {   // 1.6.2 (backlog 223, story cards, fold C; the owner, by prompt: "Card of the spread's kind"): a saved spread is ordinary planner blocks
        const sb = C.spreadCard({ label: 'A stranger', as: 'person', places: [{ label: 'Who', words: 'a <pilot>' }, { label: 'Wants', words: 'to pay off a debt' }, { label: 'Empty', words: ' ' }] }, 'b_s1');
        const fileS = { id: 'c2', name: 'C', items: { p1: { id: 'p1', type: 'planner', meta: { title: 'P' }, blocks: [JSON.parse(J(sb))] } } }; CU.cleanImportItems(fileS, { CARD: C });
        const mdS = M.docToMarkdown({ id: 'p1', type: 'planner', meta: { title: 'P' }, blocks: [sb] }, {}).text, backS = M.markdownToBlocks(mdS, { kind: 'planner' }).blocks.filter(b => b.type === 'node')[0];
        check('a saved spread is an ordinary card of its kind: escaped as a planner stores text, a row a place with words, kept whole by the import cleaner, and written to Markdown and read back as a card of that kind with that title',
            sb.type === 'node' && C.cardKind(sb) === 'person' && sb.title === 'a &lt;pilot>' && sb.tag === 'A stranger' && sb.rows.length === 2 && J(fileS.items.p1.blocks[0]) === J(sb) && !!backS && C.cardKind(backS) === 'person' && backS.title === sb.title, J([sb, mdS, backS]));
        const sbE = C.spreadCard({ label: 'Salt & Iron', places: [{ label: 'Who', words: 'Maren & Vos' }, { label: 'Odds', words: '3 > 2 &amp; <i>x</i> &#39; a&b' }] }, 'b_s3');
        check('the review of story cards: a saved spread is stored as the editor box shows it, as prep.js does, only an & before a letter or # and a < that would start markup escaped, so Salt & Iron and a > stay as typed', sbE.title === 'Maren & Vos' && sbE.tag === 'Salt & Iron' && sbE.rows[1].col2 === '3 > 2 &amp;amp; &lt;i>x&lt;/i> &amp;#39; a&amp;b' && !/&gt;/.test(J(sbE)), J(sbE));
        check('the Decks window makes it through the card core, and a scene is the kind where a spread names none', /import \{ spreadCard[^}]*\} from '\.\/cardcore\.js';/.test(read('scripts/deckwin.js')) && read('scripts/deckwin.js').includes("spreadCard({ label: sp.label, as: sp.as, places: pl }") && C.cardKind(C.spreadCard({ places: [{ label: 'A', words: 'b' }] }, 'b_s2')) === 'scene');
    }
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
