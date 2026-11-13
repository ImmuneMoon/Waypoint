// The Story view (1.6.2, backlog 166 h): storyview.js's core slice run for real with the real card core, and the window's wiring pinned.
// Plain Node, no dependencies, exits 1 on any failure.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
process.on('exit', () => { if (!summed) { console.log('FAIL      storycheck: an asynchronous check never finished'); process.exitCode = 1; } });
const root = path.join(__dirname, '..', 'system', 'app'), read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const url = f => 'file:///' + path.resolve(path.join(root, 'scripts', f)).split(String.fromCharCode(92)).join('/');
const J = JSON.stringify;
(async () => {
    const CC = await import(url('cardcore.js'));
    const src = read('scripts/storyview.js'), a = src.indexOf('// [storycheck:core-start]'), z = src.indexOf('// [storycheck:core-end]');
    check('the core slice is there once', a > 0 && z > a && src.indexOf('// [storycheck:core-start]', a + 1) < 0);
    const S = new Function('CC', src.slice(a, z) + '\nreturn { storyBeats, storyModel, storyCount, storyMove, storyStep };')(CC);
    const node = (id, title, x) => Object.assign({ id, type: 'node', title, tag: '', must: '', cols: [], rows: [] }, x || {});
    const p1 = { id: 'p1', type: 'planner', meta: { title: 'Act <b>one</b>' }, blocks: [{ id: 'h', type: 'h1', title: 'X' }, node('b1', 'Start', { when: 'tonight', tag: 'social' }), { id: 't', type: 'text', content: '' }, node('b2', '', { done: true }), node('p', 'Bren', { mode: 'person' }), node('b3', 'End', { when: 'ahead' }), node('', 'no id')] };
    const p2 = { id: 'p2', type: 'planner', meta: { title: 'Side' }, blocks: [] }, p3 = { id: 'p3', type: 'planner', meta: {}, blocks: [node('c1', 'Inner')] };
    const tree = { '': [p1, p2], p1: [p3], p3: [p1] };   // p3 names p1 under it: a loop a file wrote
    const kids = parent => tree[parent || ''] || [];
    const m = S.storyModel({ items: {} }, kids);
    check('166 h the story (storyModel, run for real): each planner an arc in the left panel’s order, a planner under another right after it one step in, a loop written in a file ending where it closes; its title with markup left out',
        J(m.map(x => [x.id, x.depth, x.title])) === J([['p1', 0, 'Act one'], ['p3', 1, 'A planner'], ['p2', 0, 'Side']]) && J(S.storyModel(null, kids)) === '[]' && J(S.storyModel({ items: {} }, null)) === '[]', J(m));
    check('166 h an arc’s beats (storyBeats): its scene cards in the order they stand, never a person, a place, a clue or a plain table, nor a card with no id, each with its title, its tag and its session as the card core reads it',
        J(m[0].beats) === J([{ id: 'b1', title: 'Start', tag: 'social', s: 'tonight' }, { id: 'b2', title: 'A scene', tag: '', s: 'played' }, { id: 'b3', title: 'End', tag: '', s: 'ahead' }]) && J(S.storyCount(m)) === J({ played: 1, tonight: 1, ahead: 1, none: 1 }), J(m[0].beats));
    const bl = p1.blocks, mv = S.storyMove(bl, 'b3', 'b1', false), mv2 = S.storyMove(bl, 'b1', 'b3', true);
    check('166 h a beat moved inside its planner (storyMove, run for real): put before or after another scene card, every other block where it stood; nothing for a card that is no scene, an id not there, the same card, or a move that changes nothing',
        J(mv.map(b => b.id)) === J(['h', 'b3', 'b1', 't', 'b2', 'p', '']) && J(mv2.map(b => b.id)) === J(['h', 't', 'b2', 'p', 'b3', 'b1', '']) && mv.every(b => bl.indexOf(b) >= 0)
        && S.storyMove(bl, 'p', 'b1', false) === null && S.storyMove(bl, 'b1', 'zz', false) === null && S.storyMove(bl, 'b1', 'b1', false) === null && S.storyMove([node('x1', 'A'), node('x2', 'B')], 'x1', 'x2', false) === null && S.storyMove(null, 'b1', 'b2') === null, J(mv && mv.map(b => b.id)));
    check('166 h a beat’s neighbor for Alt and an arrow key (storyStep): the one before or after it among its planner’s beats, nothing at an end',
        S.storyStep(m[0].beats, 'b2', -1) === 'b1' && S.storyStep(m[0].beats, 'b2', 1) === 'b3' && S.storyStep(m[0].beats, 'b1', -1) === '' && S.storyStep(m[0].beats, 'b3', 1) === '' && S.storyStep(m[0].beats, 'zz', 1) === '');
    // the wiring
    const ix = read('index.html'), fl = read('scripts/floats.js'), esc = read('scripts/esckey.js'), sh = read('scripts/sheets.js'), ps = read('scripts/pageshelf.js');
    const box = ix.slice(ix.indexOf('<div id="storyPanel"'), ix.indexOf('<div id="deckPanel"'));
    check('166 h wired (pinned): the window in the page as fixed words with its close and its body; a floating box by the rules (FLOAT_IDS, Z_BOXES, ESC_LAST with its close); opened from the Pages shelf for the GM’s own campaign and from the campaign menu; changes saved as one step and the app drawn again; the body drawn with elements and text nodes; Help says it',
        ['storyHead', 'storySum', 'storyClose', 'storyBody'].every(i => box.includes('id="' + i + '"')) && !/<script|\son[a-z]+=/i.test(box) && /var FLOAT_IDS = \[[^\]]*'storyPanel'/.test(fl) && /var Z_BOXES = \[[^\]]*'storyPanel'/.test(sh) && /var ESC_LAST = \[[^\]]*'storyPanel'/.test(esc)
        && esc.includes("storyPanel: function(el) { if (!escPress(doc, 'storyClose')) el.style.display = 'none'; },") && ps.includes("if (at('.ps-story')) { shelfClose(); if (window.wpStory) window.wpStory.open(); return; }") && ps.includes("window.wpStory.may()")
        && ix.includes('id="storyCampBtn"') && ix.includes('<script type="module" src="scripts/storyview.js"></script>') && src.includes("save(); if (typeof window.appRender === 'function') window.appRender();") && !/innerHTML|insertAdjacentHTML|outerHTML/.test(src) && ix.includes('<b data-ctl="#storyCampBtn">Story view</b>'));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
