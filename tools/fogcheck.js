/* Offline check of the fog/vision pure half (system/app/scripts/fogcore.js): cell geometry (square + flat-top hex,
   matching the app's snapToHex), a viewer's visible-cell set (D&D radius, GURPS front-180° arc), range→cells,
   the revealed-point test, and the map.fog / camp.fog validators. No DOM. Usage: node tools/fogcheck.js */
'use strict';
const path = require('path');
const NL = String.fromCharCode(10);
const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }

(async () => {
    let X = null, err = null;
    try { X = await import(url('fogcore.js')); } catch (e) { err = e; }
    check('module loads in Node with no window', !!X && !err, err && err.message);
    if (!X) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { LIMITS, squareGrid, hexGrid, gridFor, cellOf, cellCenter, cellKey, hexDist, rangeToCells, visibleCells, revealedKeys, pointRevealed, cleanFog, cleanCampFog } = X;

    /* ---- square geometry ---- */
    const sq = squareGrid(50);
    check('square cellOf floors to 50px cells; centre is +25', (() => { const c = cellOf(120, 260, sq); const ctr = cellCenter(c, sq); return c.c === 2 && c.r === 5 && ctr.x === 125 && ctr.y === 275; })());
    check('square cellOf handles the origin and negatives', cellOf(0, 0, sq).c === 0 && cellOf(-1, -1, sq).c === -1);

    /* ---- hex geometry matches the app (centre x=45q+15, y=52(r+q/2)) ---- */
    const hx = hexGrid(30, 52);
    check('hex cell centre round-trips through cellOf', (() => { for (const [q, r] of [[0, 0], [1, 0], [0, 1], [2, -1], [-1, 2]]) { const ctr = cellCenter({ q, r }, hx); const c = cellOf(ctr.x, ctr.y, hx); if (c.q !== q || c.r !== r) return false; } return true; })());
    check('hex origin centre is (15, 0)', (() => { const ctr = cellCenter({ q: 0, r: 0 }, hx); return ctr.x === 15 && ctr.y === 0; })());
    check('hexDist is cube distance', hexDist({ q: 0, r: 0 }, { q: 2, r: -1 }) === 2 && hexDist({ q: 0, r: 0 }, { q: 0, r: 0 }) === 0 && hexDist({ q: 0, r: 0 }, { q: 3, r: 0 }) === 3);

    /* ---- range → cells ---- */
    check('rangeToCells converts by yards-per-cell and clamps', rangeToCells(60, 5) === 12 && rangeToCells(30, 1) === 30 && rangeToCells(1e9, 5) === LIMITS.rangeCells && rangeToCells(0, 5) === 0 && rangeToCells(-4, 5) === 0);

    /* ---- D&D radius (square) ---- */
    check('D&D square: all-around radius, facing ignored, includes own cell', (() => {
        const v = { x: 125, y: 125, range: 2, ruleset: 'dnd', front: 90 };
        const cells = visibleCells(v, sq); const keys = new Set(cells.map(c => c.key));
        // own cell (2,2), a cell 2 away in +x (4,2) within radius, a cell behind (0,2) also within radius (all-around), a far cell (5,2) excluded
        return keys.has('2,2') && keys.has('4,2') && keys.has('0,2') && !keys.has('5,2') && !keys.has('2,5'); })());
    check('D&D square: range 0 sees only its own cell', visibleCells({ x: 125, y: 125, range: 0, ruleset: 'dnd' }, sq).length === 1);

    /* ---- GURPS front arc (hex) ---- */
    check('GURPS hex: front 180° arc excludes cells behind the facing', (() => {
        // facing up (front 0): a cell above the viewer is in-arc, a cell below is behind (excluded)
        const here = { q: 0, r: 2 }, ctr = cellCenter(here, hx);
        const v = { x: ctr.x, y: ctr.y, range: 3, ruleset: 'gurps', front: 0, arc: 180 };
        const keys = new Set(visibleCells(v, hx).map(c => c.key));
        // a cell clearly above (smaller y) should be in; one clearly below (larger y) should be out
        const above = cellOf(ctr.x, ctr.y - 100, hx), below = cellOf(ctr.x, ctr.y + 100, hx);
        return keys.has(cellKey(here, hx)) && keys.has(cellKey(above, hx)) && !keys.has(cellKey(below, hx)); })());
    check('GURPS hex: facing down flips the arc', (() => {
        const here = { q: 0, r: 3 }, ctr = cellCenter(here, hx);
        const v = { x: ctr.x, y: ctr.y, range: 3, ruleset: 'gurps', front: 180 };
        const keys = new Set(visibleCells(v, hx).map(c => c.key));
        const above = cellOf(ctr.x, ctr.y - 100, hx), below = cellOf(ctr.x, ctr.y + 100, hx);
        return keys.has(cellKey(below, hx)) && !keys.has(cellKey(above, hx)); })());
    check('GURPS hex: arc 360 sees all around within range', (() => {
        const here = { q: 0, r: 3 }, ctr = cellCenter(here, hx);
        const keys = new Set(visibleCells({ x: ctr.x, y: ctr.y, range: 3, ruleset: 'gurps', front: 0, arc: 360 }, hx).map(c => c.key));
        const below = cellOf(ctr.x, ctr.y + 100, hx); return keys.has(cellKey(below, hx)); })());
    check('visible-cell count is capped', visibleCells({ x: 5000, y: 5000, range: LIMITS.rangeCells, ruleset: 'dnd' }, sq).length <= LIMITS.cells);

    /* ---- union + revealed test + manual ---- */
    check('revealedKeys unions viewers and applies manual adds/cuts; pointRevealed tests a board point', (() => {
        const v1 = { x: 125, y: 125, range: 1, ruleset: 'dnd' };
        const set = revealedKeys([v1], sq, { adds: [{ c: 10, r: 10 }], cuts: [{ c: 2, r: 2 }] });
        return set['10,10'] === 1 && !set['2,2'] && pointRevealed(set, 525, 525, sq) === true && pointRevealed(set, 9999, 9999, sq) === false; })());

    /* ---- enforcement decision (net.js drops a creature whose cell is not revealed to a recipient) ---- */
    check('enforcement: a creature outside a viewer\'s reveal is dropped, one inside is kept, the viewer\'s own cell is always seen', (() => {
        const viewer = { x: 125, y: 125, range: 2, ruleset: 'dnd' };            // a player token at cell (2,2), sight 2 cells
        const keys = revealedKeys([viewer], sq, null);
        const own = pointRevealed(keys, 125, 125, sq);                          // its own cell
        const near = pointRevealed(keys, 125, 225, sq);                         // 2 cells away → within sight (kept)
        const far = pointRevealed(keys, 125, 925, sq);                          // 16 cells away → unseen (dropped)
        return own === true && near === true && far === false; })());

    /* ---- gridFor ---- */
    check('gridFor maps grid types; gridless with no cell returns null', gridFor('square').type === 'square' && gridFor('hex').type === 'hex' && gridFor('off', null) === null && gridFor('off', { grid: 'square', len: 70 }).size === 70);

    /* ---- validators ---- */
    check('cleanFog: on boolean, ruleset whitelist, cell clamp, manual arrays cleaned, mode defaults auto', (() => {
        const f = cleanFog({ on: 1, ruleset: 'evil', cell: { grid: 'square', len: 1e9 }, manual: { adds: [{ c: 1, r: 2 }, { bad: 1 }], cuts: 'x' } });
        return f.on === false && f.mode === 'auto' && f.ruleset === undefined && f.cell.len === LIMITS.len[1] && f.manual.adds.length === 1 && f.manual.cuts.length === 0 && cleanFog(null) === null; })());
    check('cleanFog keeps a good ruleset, on:true, and a whitelisted mode; a bad mode falls back to auto', (() => { const f = cleanFog({ on: true, ruleset: 'gurps', mode: 'reveal', manual: {} }); return f.on === true && f.ruleset === 'gurps' && f.mode === 'reveal' && cleanFog({ on: true, mode: 'evil' }).mode === 'auto'; })());
    check('cleanFog keeps hex manual cells ({q,r}) by their own shape', (() => { const f = cleanFog({ on: true, manual: { adds: [{ q: 1, r: -2 }], cuts: [{ q: 0, r: 0 }] } }); return f.manual.adds.length === 1 && f.manual.adds[0].q === 1 && f.manual.adds[0].r === -2 && f.manual.cuts.length === 1; })());
    check('cleanCampFog: sight field id validated, default clamped, junk → empty', (() => {
        const a = cleanCampFog({ fields: { sight: 'f_see1' }, defaults: { sight: 60 } });
        const b = cleanCampFog({ fields: { sight: '../evil' }, defaults: { sight: -5 } });
        return a.fields.sight === 'f_see1' && a.defaults.sight === 60 && b.fields.sight === undefined && b.defaults.sight === 0 && cleanCampFog(null).defaults.sight === 0; })());

    /* ---- publication ---- */
    global.window = {};
    const X2 = await import(url('fogcore.js') + '?x');
    check('window.wpFogCore published', !!(global.window.wpFogCore && global.window.wpFogCore.visibleCells && global.window.wpFogCore.VERSION === X2.VERSION));
    delete global.window;

    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
