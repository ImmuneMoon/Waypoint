// dice3dcheck — animated dice, the pure half (1.6.2, backlog 212; the owner, 2026-11-05, by prompt: "Your models, app draws 3D"): the
// stand-in dice built from plain geometry, the reader of a Blender model file, the turn that lands a face toward the viewer, the tumble
// that ends exactly on it, and which dice a roll's result shows. dice3dcore.js imported and run.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 600))); } }
const J = JSON.stringify, root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, '\n');
let summed = false;
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite never reached its summary'); process.exitCode = 1; } });
(async () => {
    const D = await import(url.pathToFileURL(app('scripts/dice3dcore.js')).href);
    const close = (a, b, e) => a.every((x, i) => Math.abs(x - b[i]) < (e || 1e-6));
    const TOP = { d2: 2, d3: 3, d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };
    // ---- the stand-in dice ----
    const counts = {}, bad = [];
    D.KINDS.forEach(k => {
        const s = D.standIn(k); if (!s) { bad.push(k + ' none'); return; }
        counts[k] = s.faces.length;
        if (s.pos.length % 9 || s.pos.length !== s.nrm.length || s.part.length * 3 !== s.pos.length) bad.push(k + ' arrays');
        if (s.pos.some(v => !isFinite(v)) || s.pos.some(v => Math.abs(v) > 1 + 1e-9)) bad.push(k + ' corners');
        s.faces.forEach(f => { if (Math.abs(Math.hypot(...f.normal) - 1) > 1e-9) bad.push(k + ' normal'); if (Math.hypot(...f.center) < 0.1 || f.normal[0] * f.center[0] + f.normal[1] * f.center[1] + f.normal[2] * f.center[2] <= 0) bad.push(k + ' outward'); });
        // every triangle's normal points out of the solid
        for (let i = 0; i < s.pos.length; i += 9) { const c = [(s.pos[i] + s.pos[i + 3] + s.pos[i + 6]) / 3, (s.pos[i + 1] + s.pos[i + 4] + s.pos[i + 7]) / 3, (s.pos[i + 2] + s.pos[i + 5] + s.pos[i + 8]) / 3]; if (c[0] * s.nrm[i] + c[1] * s.nrm[i + 1] + c[2] * s.nrm[i + 2] <= 0) { bad.push(k + ' tri in'); break; } }
    });
    check('each stand-in die is a solid of the right faces, its corners within a unit, every normal of length one and pointing out', !bad.length && J(counts) === J({ d2: 2, d3: 6, d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 10, dF: 6 }), J([bad.slice(0, 5), counts]));
    const nums = k => D.standIn(k).faces.map(f => f.n).sort((a, b) => a - b);
    check('every number of a die stands on one face, a d3 on two, a Fate die plus, minus and blank twice each, a d100 tens 0 to 9', ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].every(k => J(nums(k)) === J(Array.from({ length: TOP[k] }, (x, i) => i + 1))) && J(nums('d3')) === J([1, 1, 2, 2, 3, 3]) && J(nums('dF')) === J([-1, -1, 0, 0, 1, 1]) && J(nums('d100')) === J([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) && J(nums('d2')) === J([1, 2]));
    const oppOk = k => { const s = D.standIn(k); return s.faces.every(f => { const o = s.faces.reduce((b, g) => { const d = g.normal[0] * f.normal[0] + g.normal[1] * f.normal[1] + g.normal[2] * f.normal[2]; return d < b.d ? { d, g } : b; }, { d: 2, g: null }); return o.g && o.g.n + f.n === TOP[k] + 1; }); };
    check('opposite faces add up to the highest number and one, as on a real die (d6, d8, d10, d12, d20)', ['d6', 'd8', 'd10', 'd12', 'd20'].every(oppOk), ['d6', 'd8', 'd10', 'd12', 'd20'].map(k => k + ':' + oppOk(k)));
    check('a d10 shows 0 for its ten and a d100 shows 00 to 90, a Fate die its plus and minus', D.standIn('d10').faces.find(f => f.n === 10).label === '0' && D.standIn('d100').faces.find(f => f.n === 0).label === '00' && D.standIn('d100').faces.find(f => f.n === 7).label === '70' && D.standIn('dF').faces.filter(f => f.label === '+').length === 2 && D.standIn('dF').faces.filter(f => f.label === '').length === 2);
    check('a shape is made once and kept, and a kind the set lacks has none', D.standIn('d20') === D.standIn('d20') && D.standIn('d7') === null && D.standIn('__proto__') === null);
    check('which die a group is drawn as: the set’s counts, a Fate die, and none for a count the set lacks', D.kindOf(20) === 'd20' && D.kindOf(3) === 'd3' && D.kindOf('F') === 'dF' && D.kindOf(100) === 'd100' && D.kindOf(7) === null && D.kindOf('20') === null);
    // ---- landing ----
    const landBad = [];
    D.KINDS.forEach(k => { const s = D.standIn(k); s.faces.forEach(f => { [0, 1.3, -2.1].forEach(sp => { const q = D.landTurn(s, f.n, sp); const v = D.qRot(q, s.faces.find(g => g.n === f.n).normal); if (!close(v, [0, 0, 1], 1e-9)) landBad.push(k + ':' + f.n); }); }); });
    check('the landing turn brings the face that shows the value straight toward the viewer, on every face of every die, whatever the spin', !landBad.length, landBad.slice(0, 5));
    const upBad = [];
    D.KINDS.forEach(k => { const s = D.standIn(k); s.faces.forEach(f => { if (s.faces.find(g => g.n === f.n) !== f) return; const v = D.qRot(D.landTurn(s, f.n, D.uprightSpin(s, f.n)), f.up); if (!close(v, [0, 1, 0], 1e-9) || Math.abs(f.up[0] * f.normal[0] + f.up[1] * f.normal[1] + f.up[2] * f.normal[2]) > 1e-9) upBad.push(k + ':' + f.n); }); });
    check('every face has an up in its own plane, and the upright spin lands its number reading upright, on every face of every die (where two faces show one value, the first, which a landing takes)', !upBad.length, upBad.slice(0, 5));
    check('a value no face shows has no landing', D.landTurn(D.standIn('d6'), 7) === null && D.landTurn(null, 1) === null);
    // ---- the tumble ----
    const land = D.landTurn(D.standIn('d20'), 17, 0.4), tb = D.tumble(D.seedOf('roll-1:0'), land, 1.5, -0.5), end = tb(1), mid = tb(0.4), st = D.tumble(5, land, 0, 0, true)(0);
    const qEq = (a, b) => close(a, b, 1e-9) || close(a, b.map(x => -x), 1e-9);
    check('the tumble ends exactly on the landing turn at its place on the ground, moves on the way, and the same seed tumbles alike', qEq(end.q, land) && end.x === 1.5 && end.y === -0.5 && end.h === 0 && !qEq(mid.q, land) && J(D.tumble(D.seedOf('roll-1:0'), land, 1.5, -0.5)(0.3)) === J(tb(0.3)) && J(D.tumble(D.seedOf('roll-2:0'), land, 1.5, -0.5)(0.3)) !== J(tb(0.3)));
    check('with reduced motion the die is there from the start, already settled', qEq(st.q, land) && st.x === 0 && st.y === 0 && st.h === 0);
    check('a time outside 0 to 1 is held to it', qEq(tb(5).q, land) && J(tb(-1)) === J(tb(0)));
    const L = D.layout(5, 4);
    check('dice rest in rows, centred, a die and a quarter apart', L.length === 5 && Math.abs(L[0].x + L[2].x) < 1e-9 && L[0].y === L[1].y && L[3].y < L[0].y && J(D.layout(1)) === J([{ x: 0, y: 0 }]));
    // ---- a roll's dice ----
    const res = { ok: true, breakdown: { dice: [
        { faces: 20, dice: [{ value: 14, kept: true }, { value: 3, kept: false }] },
        { faces: 6, aside: true, dice: [{ value: 2, kept: true }] },
        { faces: 7, dice: [{ value: 5, kept: true }] },
        { faces: 100, dice: [{ value: 47, kept: true }, { value: 100, kept: true }] },
        { faces: 'F', dice: [{ value: -1, kept: true }] }] } };
    const rd = D.rollDice(res);
    check('a roll shows each die it counts landing on its own face, a dropped die marked, a d100 as tens and units, never a die rolled aside, and none for a count the set lacks', J(rd.dice) === J([{ kind: 'd20', value: 14, kept: true }, { kind: 'd20', value: 3, kept: false }, { kind: 'd100', value: 4, kept: true }, { kind: 'd10', value: 7, kept: true }, { kind: 'd100', value: 0, kept: true }, { kind: 'd10', value: 10, kept: true }, { kind: 'dF', value: -1, kept: true }]) && rd.more === 0, J(rd));
    const many = D.rollDice({ ok: true, breakdown: { dice: [{ faces: 6, dice: Array.from({ length: 30 }, () => ({ value: 3, kept: true })) }] } });
    check('twelve dice at most, and how many more', many.dice.length === 12 && many.more === 18 && J(D.rollDice(null)) === J({ dice: [], more: 0 }) && J(D.rollDice({ ok: false })) === J({ dice: [], more: 0 }));
    check('every die a roll shows has a face for its value', [rd, many].every(r => r.dice.every(d => D.landTurn(D.standIn(d.kind), d.value) !== null)));
    // ---- a Blender model file ----
    const cube = (names, mats) => {
        const v = ['v -1 -1 -1', 'v 1 -1 -1', 'v 1 1 -1', 'v -1 1 -1', 'v -1 -1 1', 'v 1 -1 1', 'v 1 1 1', 'v -1 1 1'];
        const f = [['f 5 6 7 8', [0, 0, 1]], ['f 1 4 3 2', [0, 0, -1]], ['f 2 3 7 6', [1, 0, 0]], ['f 1 5 8 4', [-1, 0, 0]], ['f 4 8 7 3', [0, 1, 0]], ['f 1 2 6 5', [0, -1, 0]]];
        return ['# a cube', ...v, ...f.map((x, i) => (names[i] ? 'g ' + names[i] + '\n' : '') + (mats ? 'usemtl ' + mats[i] + '\n' : '') + x[0])].join('\n');
    };
    const ok = D.readObj(cube(['face1', 'face6', 'face2', 'face5', 'face3', 'face4']), 'd6');
    check('a model file is read: its faces named by group, each face’s direction from its own triangles, its numbers drawn on it where none are modelled', ok && !ok.error && ok.model === true && ok.decal === true && ok.faces.length === 6 && close(ok.faces.find(f => f.n === 1).normal, [0, 0, 1]) && close(ok.faces.find(f => f.n === 4).normal, [0, -1, 0]) && ok.pos.length === 12 * 3 * 3 && ok.pos.every(x => Math.abs(x) <= 1 + 1e-9), J(ok && (ok.error || ok.faces.length)));
    const lw = D.landTurn(ok, 5, 0);
    check('a model lands on its rolled face as a stand-in does', close(D.qRot(lw, ok.faces.find(f => f.n === 5).normal), [0, 0, 1], 1e-9));
    const withNum = D.readObj(cube(['face1', 'face6', 'face2', 'face5', 'face3', 'face4'], ['body', 'edge', 'number', 'Body', 'whatever', 'NUMBER']), 'd6');
    check('a model’s parts by material (body, edge, number, in any case, anything else the body), and modelled numbers drawn as they are', !withNum.error && withNum.decal === false && J([...new Set(withNum.part)].sort()) === J([0, 1, 2]) && withNum.part.slice(0, 6).every(x => x === 0) && withNum.part.slice(6, 12).every(x => x === 1) && withNum.part.slice(18, 24).every(x => x === 0));
    check('a model that names no face for a number says which, in words', /no face for 6\. Name each face face1, face2/.test(D.readObj(cube(['face1', 'face2', 'face2', 'face5', 'face3', 'face4']), 'd6').error || ''), J(D.readObj(cube(['face1', 'face2', 'face2', 'face5', 'face3', 'face4']), 'd6')));
    const ten = D.readObj(cube(['face0', 'face6', 'face2', 'face5', 'face3', 'face4']).replace(/face6/, 'face1'), 'd10');
    check('face0 stands for a d10’s ten', !!ten.error && /no face for/.test(ten.error) && !/10/.test(ten.error));
    const hostile = [
        [null, 'd6', /no model file/], ['x'.repeat(D.LIMITS.objChars + 1), 'd6', /too large/], [cube(['face1']), 'd7', /takes no model/],
        ['v 1 2 x\nf 1 1 1', 'd6', /no number/], ['v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9', 'd6', /not there/], ['v 0 0 0\nv 1 0 0\nv 0 1 0\nf 0 2 3', 'd6', /names no corner/],
        ['v 0 0 0', 'd6', /no faces/], ['v 0 0 0\nv 0 0 0\nv 0 0 0\nf 1 2 3', 'd6', /no size/]];
    const hb = hostile.filter(([t, k, re]) => { const r = D.readObj(t, k); return !(r && re.test(r.error || '')); });
    check('a file that is no model, too large, of a kind with no model, with a corner that is no number, a face naming a corner that is not there, no faces or no size is refused in words', !hb.length, J(hb.map(h => String(h[0]).slice(0, 30))));
    const neg = D.readObj(cube(['face1', 'face6', 'face2', 'face5', 'face3', 'face4']).replace('f 5 6 7 8', 'f -4 -3 -2 -1'), 'd6');
    check('a face may name its corners from the end, as Blender may write them, and a face of v/vt/vn forms reads by its corner', !neg.error && !D.readObj(cube(['face1', 'face6', 'face2', 'face5', 'face3', 'face4']).replace('f 5 6 7 8', 'f 5/1/1 6/2/1 7/3/1 8/4/1'), 'd6').error);
    const big = 'v 0 0 0\n'.repeat(D.LIMITS.verts + 1);
    check('more corners than the reader keeps is refused before it walks them all', /too many corners/.test(D.readObj(big, 'd6').error || ''));
    // ---- fold 2: the renderer's own rules (dice3d.js) and its wiring ----
    const R = await import(url.pathToFileURL(app('scripts/dice3d.js')).href);
    check('this computer’s choice is the chat card, over the map or off, and anything else the card', R.modeOf('map') === 'map' && R.modeOf('off') === 'off' && R.modeOf('card') === 'card' && R.modeOf(null) === 'card' && R.modeOf('MAP') === 'card' && R.modeOf({}) === 'card');
    const env = { mode: 'card' }, mr = { roll: { id: 'r1' }, res: res };
    check('a roll tumbles its dice only where it has dice to show, and never off, in a window of its own, in the stream window, on a page out of sight or for a roll sent to the GM unseen',
        !!R.diceWanted(mr, env) && R.diceWanted(mr, env).dice.length === 7 && R.diceWanted(mr, { mode: 'off' }) === null && R.diceWanted(mr, { mode: 'card', popout: true }) === null && R.diceWanted(mr, { mode: 'map', stream: true }) === null && R.diceWanted(mr, { mode: 'card', hidden: true }) === null
        && R.diceWanted({ roll: { hid: 'gm' }, res: res }, env) === null && R.diceWanted({ roll: {}, res: null }, env) === null && R.diceWanted({ roll: {}, res: { ok: true, breakdown: { dice: [] } } }, env) === null && R.diceWanted(null, env) === null);
    const fitOk = [[1, 300, 70, 'card'], [12, 300, 70, 'card'], [12, 160, 56, 'card'], [3, 1200, 700, 'map'], [12, 400, 300, 'map']].every(([n, w, h, m]) => { const f = R.diceFit(n, w, h, m); return f.per >= 1 && f.rows === Math.ceil(n / f.per) && f.u >= 10 && f.per * 1.25 * f.u <= w + 1e-9 && (f.u === 10 || f.rows * 1.25 * f.u <= h); });
    check('the dice are sized to the space they are drawn in: on a card at most 34 px across, over the map larger, and every die fits', fitOk && R.diceFit(1, 300, 70, 'card').u === 34 && R.diceFit(2, 1200, 700, 'map').u === 72);
    const keys = R.atlasKeys();
    check('every label any die shows is drawn once on the atlas, its 6 and 9 underlined only where a die shows both, and a blank face draws none', new Set(keys).size === keys.length && ['1', '20', '0', '00', '90', '+', '−', '6', '6_', '9_'].every(k => keys.includes(k)) && !keys.includes('') && !keys.includes('9') && keys.length <= 64);
    const dm = R.decalMesh(D.standIn('d20'), k => [0, 0, 0.125, 0.125]), dm6 = R.decalMesh(D.standIn('dF'), k => [0, 0, 0.125, 0.125]);
    const onFace = (() => { const s = D.standIn('d20'); for (let i = 0; i < 20; i++) { const f = s.faces[i]; for (let j = 0; j < 6; j++) { const p = dm.pos.slice((i * 6 + j) * 3, (i * 6 + j) * 3 + 3), off = (p[0] - f.center[0]) * f.normal[0] + (p[1] - f.center[1]) * f.normal[1] + (p[2] - f.center[2]) * f.normal[2]; if (Math.abs(off - 0.006) > 1e-9) return false; } } return true; })();
    check('a number is a quad on its face, a hair off it, two triangles a face, its corners on the label’s own cell; a blank face of a Fate die has none', dm.pos.length === 20 * 6 * 3 && dm.uv.length === 20 * 6 * 2 && onFace && dm.uv.every(v => v >= 0 && v <= 0.125 + 1e-9) && dm6.pos.length === 4 * 6 * 3);
    const up = (() => { const s = D.standIn('d6'), f = s.faces[0], m = R.decalMesh({ kind: 'd6', faces: [f] }, () => [0, 0, 1, 1]), top = [], bot = []; for (let j = 0; j < 6; j++) (m.uv[j * 2 + 1] < 0.5 ? top : bot).push(m.pos.slice(j * 3, j * 3 + 3)); const dotU = p => (p[0] - f.center[0]) * f.up[0] + (p[1] - f.center[1]) * f.up[1] + (p[2] - f.center[2]) * f.up[2]; return top.every(p => dotU(p) > 0) && bot.every(p => dotU(p) < 0); })();
    check('the top of a number’s cell stands toward its face’s up, so a landed number reads upright', up);
    const T = R.timesOf('card', false), Tm = R.timesOf('map', false), Ts = R.timesOf('card', true);
    check('a showing tumbles for a second, holds, then fades: longer held over the map, and with reduced motion no tumble at all, already landed', T.tumble === 1000 && Tm.hold > T.hold && Ts.tumble === 0 && R.phaseAt(Ts, 0).t === 1 && R.phaseAt(T, 500).t === 0.5 && R.phaseAt(T, 1500).alpha === 1 && R.phaseAt(T, T.end - 1).alpha > 0 && R.phaseAt(T, T.end).done && !R.phaseAt(T, T.end - 1).done);
    const r3 = read('scripts/dice3d.js'), dj = read('scripts/dice.js'), ix = read('index.html'), stj = read('scripts/settings.js');
    check('the renderer writes no markup and draws with WebGL alone, a flat die where WebGL cannot be had, its layer taking no pointer', !/innerHTML|insertAdjacentHTML|outerHTML/.test(r3) && r3.includes("getContext('webgl'") && /function draw2d/.test(r3) && r3.includes('pointer-events:none'));
    check('a roll that lands asks the dice first, before the dice sound is judged, and its card carries its id for the dice to find', dj.includes('function landed(m) {\n    if (window.wpDice3d) { try { window.wpDice3d.play(m); } catch (e) {} }') && dj.includes("if (wrap.dataset && typeof rec.id === 'string') wrap.dataset.rid = rec.id;"));
    check('the page loads it after the dice, and Settings keeps the choice for this computer under wp_dice3d', ix.includes('<script type="module" src="scripts/dice.js"></script>\n<script type="module" src="scripts/dice3d.js"></script>') && ix.includes('<select id="setDiceShow"') && stj.includes("localStorage.setItem('wp_dice3d', _d3Of(_d3Sel.value))"));
    const wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wa = read('assets/whatsnew.txt');
    check('Help and both notes say it', ix.includes("<li>The dice tumble on the roll's card and land on the faces it gave. <b>Dice on a roll</b> in Settings shows them over the map instead, or turns them off for you. With Reduce motion they show already landed. <b>Paint your dice</b> in Settings, or Paint on the roller, picks their colours and a pattern. Everyone at the table sees your rolls in that look.</li>") && [wn, wa].every(t => t.includes('Animated dice\n- When a roll lands, its dice tumble on its card in Table Chat and land on the\n')));
    // ---- fold 3: a look, the painter and the look a roll carries ----
    const DC = await import(url.pathToFileURL(app('scripts/dicecore.js')).href);
    const L0 = DC.cleanDiceLook({ b: '#2B2D38', t: '#4a4d5e', n: '#e8c46a', p: 'marble' });
    check('a dice look is strict #rrggbb in lower case, a second colour that falls back to the body, edges only where named, and a pattern of the four',
        J(L0) === J({ b: '#2b2d38', t: '#4a4d5e', n: '#e8c46a', p: 'marble' }) && J(DC.cleanDiceLook({ b: '#111111', n: '#eeeeee' })) === J({ b: '#111111', t: '#111111', n: '#eeeeee', p: 'solid' })
        && DC.cleanDiceLook({ b: '#111111', n: '#eeeeee', e: '#222222' }).e === '#222222' && DC.cleanDiceLook({ b: '#111111', n: '#eeeeee', p: 'plaid' }).p === 'solid' && J(DC.DICE_PATS) === J(['solid', 'marble', 'speckle', 'two']));
    const proto = Object.create({ b: '#111111', n: '#eeeeee' });
    check('a look with no body or no numbers, a colour in any other form, a list or a look a prototype lends is none',
        [null, 'x', [], {}, { b: '#111111' }, { n: '#111111' }, { b: 'red', n: '#eeeeee' }, { b: '#111', n: '#eeeeee' }, { b: '#11111g', n: '#eeeeee' }, { b: 'url(x)', n: '#eeeeee' }, proto].every(v => DC.cleanDiceLook(v) === null)
        && DC.cleanDiceLook({ b: '#111111', n: '#eeeeee', t: 'javascript:x' }).t === '#111111' && !('e' in DC.cleanDiceLook({ b: '#111111', n: '#eeeeee', e: 'x' })));
    const rq = DC.cleanRollReq({ rid: 'qabc12345', expr: '2d6', dl: { b: '#2b2d38', n: '#e8c46a', p: 'speckle' } }), rqBad = DC.cleanRollReq({ rid: 'qabc12345', expr: '2d6', dl: { b: 'nope' } });
    const rc = DC.cleanRoll({ id: 'r_abcdef12', from: { id: 'p_kael', name: 'Kael' }, expr: '2d6', draws: [3, 4], v: 1, dl: { b: '#1b3d88', t: '#7fb4ee', n: '#ffffff', p: 'marble', x: 'y' } }), rcBad = DC.cleanRoll({ id: 'r_abcdef12', from: { id: 'p_kael', name: 'Kael' }, expr: '2d6', draws: [3, 4], v: 1, dl: 5 });
    check('a roll asked for carries its roller’s look as it is cleaned, and the record the host sends keeps it; a look that does not clean is left off and the roll kept',
        rq && J(rq.dl) === J({ b: '#2b2d38', t: '#2b2d38', n: '#e8c46a', p: 'speckle' }) && rqBad && !('dl' in rqBad) && rc && J(rc.dl) === J({ b: '#1b3d88', t: '#7fb4ee', n: '#ffffff', p: 'marble' }) && rcBad && !('dl' in rcBad));
    check('eight ready sets, each a whole look that cleans as it is written, the first the look the dice had before', R.SETS.length === 8 && R.SETS.map(x => x.name).join() === 'Waypoint,Ivory,Obsidian,Ember,Tide,Jade,Bone,Amethyst'
        && R.SETS.every(x => J(DC.cleanDiceLook(x)) === J({ b: x.b, t: x.t, n: x.n, p: x.p })) && R.SETS[0].b === '#2b2d38' && R.SETS[0].n === '#e8c46a' && R.PATS.map(x => x[0]).join() === DC.DICE_PATS.join());
    check('a roll with no look, or one that does not clean, is drawn in the Waypoint set; a look is named by the set it is, else as your own',
        J(R.lookOf(null)) === J(R.lookOf({ b: 'x' })) && R.lookOf(undefined).b === '#2b2d38' && R.setOf(R.SETS[4]) === 'Tide' && R.setOf(Object.assign({}, R.SETS[4], { n: '#000000' })) === '' && R.setOf(Object.assign({}, R.SETS[1], { e: '#000000' })) === '');
    const sk = R.shadeOf(R.SETS[3], false), sd = R.shadeOf(R.SETS[3], true);
    check('a die is drawn in the look’s colours and pattern, edges as the body where none are named, and a die the roll dropped darker in every colour',
        sk.pat === 3 && R.shadeOf(R.SETS[0], false).pat === 0 && R.shadeOf(R.SETS[4], false).pat === 1 && R.shadeOf(R.SETS[2], false).pat === 2 && J(sk.edge) === J(sk.body)
        && ['body', 'two', 'edge', 'num'].every(k => sd[k].every((v, i) => Math.abs(v - sk[k][i] * 0.55) < 1e-12)) && Math.abs(sk.body[0] - 0x8a / 255) < 1e-12);
    const nj = fs.readFileSync(app('scripts/net.js'), 'latin1').replace(/\r\n/g, '\n');
    check('a roll carries this computer’s look: a player’s request, the host’s record of it, the GM’s own roll and a card that waits, never a roll made for another player’s press',
        nj.includes("function rollLookOwn() { var D = DC(); return D && typeof D.cleanDiceLook === 'function' && window.wpDice3d && typeof window.wpDice3d.look === 'function' ? D.cleanDiceLook(window.wpDice3d.look()) : null; }")
        && nj.includes('var dlS = rollLookOwn(); if (dlS) req.dl = dlS;') && nj.includes('if (heldQ) recQ.id = heldQ; if (q.dl) recQ.dl = q.dl;') && nj.includes('if (heldR) rec.id = heldR; if (!o.from) { var dlR = rollLookOwn(); if (dlR) rec.dl = dlR; }')
        && nj.includes('cardHold({ dl: q.dl || null,') && nj.includes('cardHold({ dl: o.from ? null : rollLookOwn(),') && nj.includes('if (o.dl) rec.dl = o.dl; if (o.rid) rec.rid = o.rid;'));
    const esk = read('scripts/esckey.js');
    check('the painter is a window of the page, opened from Settings and from the roller, its sets and patterns made as buttons with text, its colours four colour boxes, closed by Escape through its own button',
        ix.includes('<div id="dicePaintModal"') && ix.includes('id="setDicePaintBtn"') && ix.includes('id="dicePaintBtn"') && ['dicePaintBody', 'dicePaintTwo', 'dicePaintNum', 'dicePaintEdge'].every(id => ix.includes('<input type="color" id="' + id + '"'))
        && ix.includes('<canvas id="dicePaintPreview"') && esk.includes("['dicePaintModal', 'dicePaintCloseBtn']") && r3.includes("b.textContent = st.name;") && r3.includes("b.textContent = pt[1];")
        && r3.includes("['setDicePaintBtn', 'dicePaintBtn'].forEach") && r3.includes("localStorage.setItem('wp_diceLook', JSON.stringify(l))") && r3.includes('look: lookOf(m.roll.dl)'));
    check('both notes say the painter', [wn, wa].every(t => t.includes('- Paint your dice, in Settings or on the dice roller, picks the colours and\n')));
    // ---- the module ----
    const src = read('scripts/dice3dcore.js');
    check('the module is pure: it imports nothing, reads no page and no clock, and draws no chance but its own seeded one', !/^\s*import\s/m.test(src) && !/document\.|Math\.random|Date\.now|fetch\(/.test(src.replace(/\/\*[\s\S]*?\*\//, '')) && src.includes('window.wpDice3dCore = API'));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})();
