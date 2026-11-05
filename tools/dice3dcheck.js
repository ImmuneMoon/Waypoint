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
    // ---- the module ----
    const src = read('scripts/dice3dcore.js');
    check('the module is pure: it imports nothing, reads no page and no clock, and draws no chance but its own seeded one', !/^\s*import\s/m.test(src) && !/document\.|Math\.random|Date\.now|fetch\(/.test(src.replace(/\/\*[\s\S]*?\*\//, '')) && src.includes('window.wpDice3dCore = API'));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})();
