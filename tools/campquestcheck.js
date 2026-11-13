// Start a campaign with questions (1.6.2, backlog 166 e): campquest.js's core slice run for real, what it writes read by the real page
// sanitiser and card cleaner, and the dialog's wiring pinned. Plain Node, no dependencies, exits 1 on any failure.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
process.on('exit', () => { if (!summed) { console.log('FAIL      campquestcheck: an asynchronous check never finished'); process.exitCode = 1; } });
const root = path.join(__dirname, '..', 'system', 'app'), read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const url = f => 'file:///' + path.resolve(path.join(root, 'scripts', f)).split(String.fromCharCode(92)).join('/');
const J = JSON.stringify;
(async () => {
    const src = read('scripts/campquest.js'), a = src.indexOf('// [campquestcheck:core-start]'), z = src.indexOf('// [campquestcheck:core-end]');
    check('the core slice is there once', a > 0 && z > a && src.indexOf('// [campquestcheck:core-start]', a + 1) < 0);
    const C = new Function(src.slice(a, z) + '\nreturn { SPINE, BEATS, cleanAnswer, cleanAnswers, anyAnswer, proseOf, promptOf, outlineBlocks, outlinePlanner };')();
    // the answers
    const ca = C.cleanAnswers({ spine: ['  An idea\r\nin two lines  ', 7, 'x'.repeat(2100), 'tab\there\u0001', ''], beats: ['a\nb', 'y'.repeat(150), null] });
    check('166 e the answers as the dialog hands them (cleanAnswers, run for real): five spine answers and five beats whatever comes, trimmed, line ends as \\n, control characters out but a tab kept, a spine answer cut at 2,000 and a beat at 120 and kept to one line, anything that is no text empty',
        ca.spine.length === 5 && ca.beats.length === 5 && ca.spine[0] === 'An idea\nin two lines' && ca.spine[1] === '' && ca.spine[2].length === 2000 && ca.spine[3] === 'tab\there' && ca.beats[0] === 'a b' && ca.beats[1].length === 120 && ca.beats[2] === '' && ca.beats[4] === ''
        && J(C.cleanAnswers(null)) === J({ spine: ['', '', '', '', ''], beats: ['', '', '', '', ''] }) && J(C.cleanAnswers({ spine: 'x' }).spine) === J(['', '', '', '', '']) && C.cleanAnswer('😀'.repeat(3), 2) === '😀😀'
        && C.anyAnswer({ beats: ['', '', 'x'] }) === true && C.anyAnswer({ spine: ['  '] }) === false, J(ca));
    // what it writes
    let n = 0; const mk = () => 'k' + (++n);
    const bl = C.outlineBlocks({ spine: ['A river <b>town</b> & a temple.\n\nSecond part', '', '', 'The Abbot', ''], beats: ['A bell rings', '', '', '', ''] }, 'Question Trial', mk);
    const types = bl.map(b => b.type), ids = bl.map(b => b.id), heads = bl.filter(b => b.type === 'h2').map(b => b.title), nodes = bl.filter(b => b.type === 'node'), texts = bl.filter(b => b.type === 'text');
    check('166 e the outline (outlineBlocks, run for real): its title and the campaign’s name, a heading a spine question with the answer or the question as a prompt under it, then Beats and five scene cards marked Ahead, every block an id of its own',
        J(types) === J(['h1', 'h2', 'text', 'h2', 'text', 'h2', 'text', 'h2', 'text', 'h2', 'text', 'h2', 'node', 'node', 'node', 'node', 'node']) && bl[0].title === 'Campaign outline' && bl[0].sub === 'Question Trial'
        && J(heads) === J(['The idea', 'The mood', 'The world now', 'The main threat', 'How it might end', 'Beats']) && new Set(ids).size === ids.length && ids.every(i => /^b_k\d+$/.test(i)), J(types));
    check('166 e an answer is written escaped, a paragraph a stretch between blank lines; a question left empty is kept as a prompt in gray and italic',
        texts[0].content === '<p>A river &lt;b&gt;town&lt;/b&gt; &amp; a temple.</p><p>Second part</p>' && texts[3].content === '<p>The Abbot</p>'
        && texts[1].content === '<p><span style="color:#8a8f98"><i>What should it feel like at the table? Name a genre, a theme or a mood.</i></span></p>' && texts[4].content === C.promptOf(C.SPINE[4].ask), J(texts));
    check('166 e each beat a scene card marked Ahead, tagged with the beat’s name: titled by the answer, or by its question where it was left empty (the owner: "Keep it as a prompt")',
        nodes.every((b, i) => b.tag === C.BEATS[i].head && b.when === 'ahead' && !b.mode && b.must === '' && J(b.rows) === '[]') && nodes[0].title === 'A bell rings' && nodes[2].title === 'What changes everything?' && nodes[4].title === 'How does it end?', J(nodes));
    const pl = C.outlinePlanner({}, 'X', 'Campaign outline (2)', mk, 12345);
    check('166 e the planner (outlinePlanner): a planner of its own id, titled as handed in, its blocks the outline, and with nothing answered every question kept as a prompt',
        pl.type === 'planner' && /^plan_k\d+$/.test(pl.id) && pl.meta.title === 'Campaign outline (2)' && pl.meta.updated === 12345 && pl.blocks.filter(b => b.type === 'text').every((b, i) => b.content === C.promptOf(C.SPINE[i].ask)) && pl.blocks.filter(b => b.type === 'node').every((b, i) => b.title === C.BEATS[i].ask));
    // read by the real page code
    const DR = await import(url('docrender.js')), CC = await import(url('cardcore.js'));
    const san = texts.map(t => DR.sanitizeHtml(t.content)), cards = nodes.map(b => CC.cleanCard(Object.assign({}, b)));
    check('166 e what it writes reads as written (the real sanitiser and card cleaner): an answer stays escaped text, the prompt keeps its gray and its italic, and every card keeps Ahead',
        san[0] === texts[0].content && san[1] === texts[1].content && cards.every(c => c.when === 'ahead' && CC.sessionOf(c) === 'ahead'), J(san));
    // the wiring
    const ix = read('index.html'), esc = read('scripts/esckey.js'), dl = read('scripts/dialogs.js');
    const modal = ix.slice(ix.indexOf('<div id="campQuestModal"'), ix.indexOf('<!-- Developer console'));
    check('166 e wired (pinned): the dialog in the page as fixed words, five spine boxes and five beats, Skip, Back, Next and Make outline; a new campaign offers it once it is made; the campaign menu’s row opens it later; Escape presses Skip; the module loaded before the safety net; Help says it',
        (modal.match(/data-cq="spine"/g) || []).length === 5 && (modal.match(/data-cq="beat"/g) || []).length === 5 && ['cqSkip', 'cqBack', 'cqNext', 'cqGo', 'cqStep1', 'cqStep2', 'cqStepWord', 'cqCampName'].every(i => modal.includes('id="' + i + '"')) && !/<script|on[a-z]+=/i.test(modal)
        && dl.includes("if (window.wpCampQuest && typeof window.wpCampQuest.offer === 'function') window.wpCampQuest.offer(newCamp.id);") && ix.includes('id="campQuestBtn"') && esc.includes("['campQuestModal', 'cqSkip']")
        && ix.includes('<script type="module" src="scripts/campquest.js"></script>\n<script type="module" src="scripts/campsafecore.js"></script>') && ix.includes('<b data-ctl="#campQuestBtn">Plan with questions</b>')
        && src.includes("window.wpPageShelf.open(pl.id, 'go')") && src.includes("log('made',"));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
