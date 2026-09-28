/* Offline check of the fog/vision pure half (system/app/scripts/fogcore.js): cell geometry (square + flat-top hex,
   matching the app's snapToHex), a viewer's visible-cell set (radius/ring gated by a facing arc decoupled from the
   grid type), sight-blocker occlusion, range→cells, the revealed-point test, and the map.fog / camp.fog validators
   (vision mode + the new-map vision default). No DOM. Usage: node tools/fogcheck.js */
'use strict';
const path = require('path');
const NL = String.fromCharCode(10);
const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    let X = null, err = null;
    try { X = await import(url('fogcore.js')); } catch (e) { err = e; }
    check('module loads in Node with no window', !!X && !err, err && err.message);
    if (!X) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { LIMITS, squareGrid, hexGrid, gridFor, cellOf, cellCenter, cellKey, hexDist, rangeToCells, cellsUnderRect, cellsUnderHex, cellsUnderCircle, cellsUnderDiamond, lineClear, moveClear, cellCorners, coverBetween, visibleCells, revealedKeys, pointRevealed, cleanVision, cleanFog, cleanCampFog } = X;

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

    /* ---- vision arc decoupled from grid type (1.5.0): a facing cone on a SQUARE map ---- */
    check('square facing cone (arc 180, front 0): cells ahead (up) in, behind (down) out; own cell kept', (() => {
        const v = { x: 125, y: 125, range: 4, front: 0, arc: 180 };
        const keys = new Set(visibleCells(v, sq).map(c => c.key));
        return keys.has('2,2') && keys.has('2,0') && !keys.has('2,4') && !keys.has('2,5'); })());
    check('square arc >= 360 (and arc absent) both = all-around, same cell set', (() => {
        const all = new Set(visibleCells({ x: 125, y: 125, range: 3, front: 0, arc: 360 }, sq).map(c => c.key));
        const def = new Set(visibleCells({ x: 125, y: 125, range: 3, front: 0 }, sq).map(c => c.key));
        return all.has('2,5') && def.has('2,5') && all.size === def.size; })());
    check('square facing cone rotates with front (front 90 faces +x)', (() => {
        const keys = new Set(visibleCells({ x: 125, y: 125, range: 4, front: 90, arc: 180 }, sq).map(c => c.key));
        return keys.has('4,2') && !keys.has('0,2'); })());

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

    /* ---- sight-blockers (line-of-sight occlusion, v1) ---- */
    check('square occlusion: a wall hides cells behind it, shows itself + cells before it', (() => {
        const v = { x: 125, y: 125, range: 5, ruleset: 'dnd' }, blk = { '4,2': 1 };
        const open = new Set(visibleCells(v, sq).map(c => c.key));
        const occ = new Set(visibleCells(v, sq, blk).map(c => c.key));
        return open.has('6,2') && !occ.has('6,2') && !occ.has('5,2') && occ.has('4,2') && occ.has('3,2') && occ.has('2,2'); })());
    check('no blockers arg leaves vision unchanged', (() => {
        const v = { x: 125, y: 125, range: 5, ruleset: 'dnd' };
        return visibleCells(v, sq).length === visibleCells(v, sq, null).length && visibleCells(v, sq).length > 1; })());
    check('hex occlusion: a wall hides the cell behind it, shows the wall cell', (() => {
        const here = { q: 0, r: 3 }, ctr = cellCenter(here, hx);
        const v = { x: ctr.x, y: ctr.y, range: 4, ruleset: 'gurps', front: 0, arc: 360 };
        const target = cellOf(ctr.x, ctr.y - 3 * 52, hx), mid = cellOf(ctr.x, ctr.y - 52, hx), blk = {};
        blk[cellKey(mid, hx)] = 1;
        const open = new Set(visibleCells(v, hx).map(c => c.key));
        const occ = new Set(visibleCells(v, hx, blk).map(c => c.key));
        return open.has(cellKey(target, hx)) && !occ.has(cellKey(target, hx)) && occ.has(cellKey(mid, hx)); })());
    check('manual reveal overrides a wall (add behind a blocker still revealed)', (() => {
        const v = { x: 125, y: 125, range: 5, ruleset: 'dnd' }, blk = { '4,2': 1 };
        const set = revealedKeys([v], sq, { adds: [{ c: 6, r: 2 }], cuts: [] }, blk);
        return set['6,2'] === 1 && !set['5,2']; })());
    check('cellsUnderRect returns cells whose centre is inside the box', (() => {
        const cells = cellsUnderRect(100, 100, 100, 50, sq).map(c => cellKey(c, sq));
        return cells.indexOf('2,2') >= 0 && cells.indexOf('3,2') >= 0 && cells.indexOf('4,2') < 0 && cells.indexOf('2,1') < 0; })());
    check('cellsUnderHex covers a cell-sized hex as its own cell', (() => {
        const ctr = cellCenter({ q: 1, r: 1 }, hx);
        const cells = cellsUnderHex(ctr.x - 30, ctr.y - 26, 60, 52, hx).map(c => cellKey(c, hx));
        return cells.indexOf(cellKey({ q: 1, r: 1 }, hx)) >= 0 && cells.length <= 3; })());
    check('moveClear (turn-based combat T3a, D11): a token\'s move is clear with no blockers or no grid; it may not land in or cross a blocker cell; its start cell never counts (it steps out of a wall); a hex wall too', (() => {
        const wall = { '3,0': 1, '3,1': 1 }, hxW = {}; hxW[cellKey(cellOf(105, 26, hx), hx)] = 1;
        return moveClear(25, 25, 275, 25, sq, null) === true && moveClear(25, 25, 275, 25, null, wall) === true
            && moveClear(25, 25, 275, 25, sq, wall) === false && moveClear(25, 25, 175, 25, sq, wall) === false && moveClear(25, 25, 125, 25, sq, wall) === true
            && moveClear(175, 25, 225, 25, sq, wall) === true && moveClear(125, 25, 160, 25, sq, wall) === false && moveClear(160, 25, 240, 25, sq, wall) === true && moveClear(175, 25, 175, 75, sq, wall) === false && moveClear(25, 125, 275, 125, sq, wall) === true
            && moveClear(15, 26, 195, 26, hx, hxW) === false && moveClear(15, 26, 60, 52, hx, hxW) === true && moveClear(NaN, 0, 10, 10, sq, wall) === true; })());
    check('lineClear: clear with no blockers, blocked through an opaque intermediate, adjacent always clear', (() => {
        return lineClear({ c: 0, r: 0 }, { c: 5, r: 0 }, sq, null) === true
            && lineClear({ c: 0, r: 0 }, { c: 5, r: 0 }, sq, { '3,0': 1 }) === false
            && lineClear({ c: 0, r: 0 }, { c: 1, r: 0 }, sq, { '0,0': 1, '1,0': 1 }) === true; })());
    check('cellsUnderCircle: a cell-sized pillar is its own cell; a bigger disc covers several', (() => {
        const one = cellsUnderCircle(110, 110, 30, 30, sq).map(c => cellKey(c, sq));
        const big = cellsUnderCircle(75, 75, 150, 150, sq);
        return one.indexOf('2,2') >= 0 && one.length === 1 && big.length >= 4 && big.length < 30; })());
    check('cellsUnderDiamond: a cell-sized diamond is its own cell', (() =>
        cellsUnderDiamond(110, 110, 30, 30, sq).map(c => cellKey(c, sq)).indexOf('2,2') >= 0)());
    check('circle pillar occludes: a pillar between viewer and a cell hides it', (() => {
        const v = { x: 125, y: 125, range: 6, ruleset: 'dnd' }, blk = {};
        cellsUnderCircle(205, 105, 40, 40, sq).forEach(c => blk[cellKey(c, sq)] = 1);   // a pillar on cell (4,2)
        const open = new Set(visibleCells(v, sq).map(c => c.key));
        const occ = new Set(visibleCells(v, sq, blk).map(c => c.key));
        return blk['4,2'] === 1 && open.has('6,2') && !occ.has('6,2'); })());
    check('door closed: its footprint occludes a cell behind it (blocks like a wall)', (() => {
        const v = { x: 125, y: 125, range: 6, ruleset: 'dnd' }, blk = {};
        cellsUnderRect(200, 100, 50, 50, sq).forEach(c => blk[cellKey(c, sq)] = 1);   // a shut door on cell (4,2)
        const occ = new Set(visibleCells(v, sq, blk).map(c => c.key));
        return blk['4,2'] === 1 && !occ.has('6,2') && occ.has('4,2'); })());
    check('door open: contributes no blocker cells, so sight passes through', (() => {
        const v = { x: 125, y: 125, range: 6, ruleset: 'dnd' };
        const open = new Set(visibleCells(v, sq, {}).map(c => c.key));   // an open door adds nothing to the set (eligibleBlocker excludes it)
        return open.has('6,2'); })());

    /* ---- cover (line-of-effect between two cells, 1.5.0) ---- */
    check('coverBetween: no blockers -> nothing blocked, line of effect, coverage 0 (square + hex)', (() => {
        const s = coverBetween({ c: 2, r: 2 }, { c: 8, r: 2 }, sq, null);
        const s2 = coverBetween({ c: 2, r: 2 }, { c: 8, r: 2 }, sq, {});
        const h = coverBetween({ q: 0, r: 0 }, { q: 4, r: 0 }, hx, {});
        return s.blocked === 0 && s.coverage === 0 && s.lineOfEffect === true && s.lines === 4
            && s2.blocked === 0 && s2.lineOfEffect === true && h.blocked === 0 && h.lines === 6; })());
    check('coverBetween: same cell -> no cover', (() => coverBetween({ c: 3, r: 3 }, { c: 3, r: 3 }, sq, { '3,3': 1 }).blocked === 0)());
    check('coverBetween: a wall fully across the line -> total cover (no line of effect, coverage kept < 1)', (() => {
        const blk = { '5,1': 1, '5,2': 1, '5,3': 1 };
        const c = coverBetween({ c: 2, r: 2 }, { c: 8, r: 2 }, sq, blk);
        return c.lineOfEffect === false && c.blocked === c.lines && c.coverage < 1 && c.coverage > 0.9; })());
    check('coverBetween: a blocker off the line -> no cover', (() =>
        coverBetween({ c: 2, r: 2 }, { c: 8, r: 2 }, sq, { '5,8': 1 }).blocked === 0)());
    check('coverBetween: a single blocker mid-beam -> PARTIAL (graded) cover, line of effect kept', (() => {
        const c = coverBetween({ c: 2, r: 2 }, { c: 6, r: 8 }, sq, { '4,5': 1 });
        return c.blocked > 0 && c.blocked < c.lines && c.lineOfEffect === true; })());
    check('coverBetween: is direction-symmetric', (() => {
        const blk = { '5,2': 1, '4,5': 1 };
        const ab = coverBetween({ c: 2, r: 2 }, { c: 6, r: 8 }, sq, blk);
        const ba = coverBetween({ c: 6, r: 8 }, { c: 2, r: 2 }, sq, blk);
        return ab.coverage === ba.coverage && ab.lineOfEffect === ba.lineOfEffect; })());
    check('coverBetween: hex grades too (a mid-line blocker gives some cover)', (() => {
        const a = { q: 0, r: 0 }, b = { q: 5, r: 0 }, ca = cellCenter(a, hx), cb = cellCenter(b, hx);
        const mid = cellOf((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, hx), blk = {}; blk[cellKey(mid, hx)] = 1;
        const c = coverBetween(a, b, hx, blk);
        return c.lines === 6 && c.blocked > 0; })());
    check('cellCorners: 4 on square, 6 on hex, each inside its own cell', (() => {
        const sc = cellCorners({ c: 2, r: 2 }, sq), hc = cellCorners({ q: 1, r: 1 }, hx);
        const sIn = sc.every(p => cellKey(cellOf(p.x, p.y, sq), sq) === '2,2');
        return sc.length === 4 && hc.length === 6 && sIn; })());

    /* ---- cover follow-ups (owner 2026-09-28): what a piece gives, see-over cover, cover from a point ---- */
    {
        const { coverRole, coverFromPoint, openSeat } = X;
        const R = o => coverRole(Object.assign({ id: 'w', type: 'rect', x: 0, y: 0, w: 50, h: 50 }, o));
        check('Cover: coverRole — a sight-blocker gives hard cover unless set to none; a piece set to give cover without blocking sight gives see-over (soft) cover; never a token, a waiting token, a hidden piece, an open door or a rotated shape but a circle; an odd value reads as its sight',
            R({ blocksSight: true }) === 'hard' && R({ blocksSight: true, cover: 'no' }) === null && R({ cover: 'yes' }) === 'soft' && R({}) === null && R({ cover: 'no' }) === null
            && R({ blocksSight: true, isChar: true }) === null && R({ cover: 'yes', isChar: true }) === null && R({ blocksSight: true, waiting: 1 }) === null && R({ blocksSight: true, hidden: true }) === null
            && R({ blocksSight: true, sightType: 'door', doorOpen: true }) === null && R({ blocksSight: true, sightType: 'door' }) === 'hard' && R({ blocksSight: true, rot: 30 }) === null && R({ type: 'circle', blocksSight: true, rot: 30 }) === 'hard'
            && R({ type: 'hexagon', blocksSight: true }) === 'hard' && R({ type: 'diamond', blocksSight: true }) === 'hard' && R({ blocksSight: true, cover: 'yes' }) === 'hard'
            && R({ fill: true, blocksSight: true }) === 'hard' && R({ type: 'image', cover: 'yes' }) === null && R({ blocksSight: true, cover: 'Yes' }) === 'hard' && R({ cover: { toString: 'yes' } }) === null && coverRole(null) === null && coverRole('x') === null);
        const wall = { '5,1': 1, '5,2': 1, '5,3': 1 }, a = { c: 2, r: 2 }, b = { c: 8, r: 2 };
        const hardC = coverBetween(a, b, sq, wall), softC = coverBetween(a, b, sq, null, wall), bothC = coverBetween(a, b, sq, { '5,1': 1 }, { '5,2': 1, '5,3': 1 });
        check('Cover: see-over cover blocks a line for the coverage but never the line of effect (never total); a wall still gives total; the pair takes its better side; a wall and a crate together block what either does; a union passed in is the one read',
            hardC.lineOfEffect === false && softC.lineOfEffect === true && softC.blocked === softC.lines && softC.coverage > 0.9 && softC.coverage < 1 && bothC.lineOfEffect === true && bothC.blocked === bothC.lines
            && coverBetween({ c: 5, r: 7 }, { c: 0, r: 5 }, sq, { '0,6': 1 }).blocked === 0 && coverBetween({ c: 0, r: 2 }, { c: 2, r: 0 }, sq, { '1,0': 1 }, { '0,1': 1 }).blocked === 1
            && coverBetween(a, b, sq, null, { '9,9': 1 }, wall).blocked === 4 && coverBetween(a, b, sq, null, { '9,9': 1 }, wall).lineOfEffect === true && coverBetween(a, b, sq, null, null).blocked === 0, JSON.stringify([hardC, softC, bothC]));
        const pa = cellCenter(a, sq), fOpen = coverFromPoint(pa.x, pa.y, b, sq, null, null), fWall = coverFromPoint(pa.x, pa.y, b, sq, wall, null), fSoft = coverFromPoint(pa.x, pa.y, b, sq, null, wall);
        const fOwn = coverFromPoint(pa.x, pa.y, b, sq, { '2,2': 1 }, null), fSame = coverFromPoint(pa.x, pa.y, a, sq, wall, null), ha = { q: 0, r: 0 }, hb = { q: 4, r: 0 }, hp = cellCenter(ha, hx), fHex = coverFromPoint(hp.x, hp.y, hb, hx, null, null);
        const fBad = coverFromPoint(NaN, 1, b, sq, wall, null), fPart = coverFromPoint(pa.x, pa.y, { c: 6, r: 8 }, sq, { '5,5': 1 }, null);
        check('Cover: coverFromPoint (a blast\'s centre to a token\'s cell) — none in the open, total behind a wall, see-over cover never total, the point\'s own cell and the target\'s skipped, 4 lines on a square grid and 6 on a hex, partial behind a pillar; nothing from a bad point',
            fOpen.blocked === 0 && fOpen.lines === 4 && fOpen.lineOfEffect === true && fWall.lineOfEffect === false && fWall.coverage < 1 && fSoft.lineOfEffect === true && fSoft.blocked === 4
            && fOwn.blocked === 0 && fSame.lines === 0 && fHex.lines === 6 && fHex.blocked === 0 && fBad.lines === 0 && fPart.blocked > 0 && fPart.blocked < fPart.lines && fPart.lineOfEffect === true
            && coverFromPoint(pa.x, pa.y, b, sq, { '0,9': 1 }, wall).lineOfEffect === true && coverFromPoint(pa.x, pa.y, b, sq, null, { '8,2': 1 }).blocked === 0 && coverFromPoint(pa.x, NaN, b, sq, wall, null).lines === 0
            && coverFromPoint(pa.x, pa.y, b, sq, null, { '9,9': 1 }, wall).blocked === 4, JSON.stringify([fOpen, fWall, fSoft, fPart]));
        // owner answer 5: a blast can't go off inside a wall or a closed door
        const wallO = { '5,1': 1, '5,2': 1, '5,3': 1 }, pw = cellCenter({ c: 5, r: 2 }, sq);
        const oL = openSeat(pw.x, pw.y, 125, 125, sq, wallO), oR = openSeat(pw.x, pw.y, 425, 125, sq, wallO), oClick = openSeat(pw.x, pw.y, pw.x - 20, pw.y, sq, wallO), oRing = openSeat(pw.x, pw.y, pw.x, pw.y, sq, wallO);
        const oOpen = openSeat(125, 125, 25, 125, sq, wallO), oAll = openSeat(pw.x, pw.y, 125, 125, sq, new Proxy({}, { get: () => 1 })), oBad = openSeat(NaN, 1, 0, 0, sq, wallO), oNone = openSeat(pw.x, pw.y, 0, 0, sq, null);
        const hW = { '2:0': 1 }, hp0 = cellCenter({ q: 2, r: 0 }, hx), hT = cellCenter({ q: 0, r: 0 }, hx), oHex = openSeat(hp0.x, hp0.y, hT.x, hT.y, hx, hW), oHexK = oHex && cellKey(cellOf(oHex.x, oHex.y, hx), hx);
        const oj = JSON.stringify, oThick = openSeat(pw.x, pw.y, pw.x - 20, pw.y, sq, { '4,2': 1, '5,2': 1 });
        const row5 = {}; for (let cc = 0; cc <= 40; cc++) row5[cc + ',5'] = 1;
        const oShallow = openSeat(1025, 275, 25, 225, sq, row5), oShallow3 = openSeat(1025, 275, 25, 175, sq, row5);
        const door = {}; for (let cc = 6; cc <= 20; cc++) door[cc + ',5'] = 1;
        const oDoor = openSeat(625, 275, 525, 275, sq, door), oFar = openSeat(275, 225, 1e300, 225, sq, { '5,4': 1 }), oInf = openSeat(275, 225, Infinity, 225, sq, { '5,4': 1 });
        const col5 = {}; for (let rr = 0; rr <= 20; rr++) col5['5,' + rr] = 1;
        const oOblique = openSeat(275, 525, 0, 0, sq, col5), col45 = {}; for (let rr = 0; rr <= 20; rr++) { col45['4,' + rr] = 1; col45['5,' + rr] = 1; }
        const oTwo = openSeat(275, 525, 25, 525, sq, col45);
        const hCol = {}; for (let rr = -10; rr <= 10; rr++) hCol['3:' + rr] = 1;
        const hHit = cellCenter({ q: 3, r: 4 }, hx), hThr = cellCenter({ q: 2, r: -6 }, hx), oHexS = openSeat(hHit.x, hHit.y, hThr.x, hThr.y, hx, hCol), oHexSK = oHexS && cellOf(oHexS.x, oHexS.y, hx);
        check('Cover: openSeat — a point in a wall cell moves to the centre of the first open cell toward the thrower (either side), the open cell in front of the hit (not far along a wall hit at a shallow angle, never behind a thrower standing in a doorway, a far point by its direction), round a wall two cells thick, on the thrower\'s side of one even when the far side is nearer; an open cell, no walls, a bad point or walls all round: null; hex too',
            oj(oL) === oj({ x: 225, y: 125 }) && oj(oR) === oj({ x: 325, y: 125 }) && oj(oClick) === oj({ x: 225, y: 125 }) && !!oRing && (oj(oRing) === oj({ x: 225, y: 125 }) || oj(oRing) === oj({ x: 325, y: 125 }))
            && oj(oThick) === oj({ x: 275, y: 75 }) && oOpen === null && oAll === null && oBad === null && oNone === null && !!oHexK
            && oj(oShallow) === oj({ x: 1025, y: 225 }) && oj(oShallow3) === oj({ x: 1025, y: 225 }) && !!oDoor && Math.hypot(oDoor.x - 625, oDoor.y - 275) < 75 && !door[cellKey(cellOf(oDoor.x, oDoor.y, sq), sq)]
            && oj(oFar) === oj({ x: 325, y: 225 }) && !!oInf && Math.hypot(oInf.x - 275, oInf.y - 225) === 50 && oj(oOblique) === oj({ x: 225, y: 525 }) && oj(oTwo) === oj({ x: 175, y: 525 })
            && !!oHexSK && oHexSK.q === 2 && Math.hypot(oHexS.x - hHit.x, oHexS.y - hHit.y) < hx.s * 1.8 && !hW[oHexK] && Math.abs(oHex.x - hp0.x) < hp0.x - hT.x, oj([oL, oR, oClick, oRing, oHex]));
    }
    /* ---- lighting (backlog 14, owner 2026-09-28): a viewer's seen cells with their light tier ---- */
    {
        const { seenCells, cellDist, visibleCells: VC } = X, lj = JSON.stringify;
        const v0 = { x: 125, y: 125, range: 2 }, keysT = arr => arr.map(o => o.key + ':' + o.tier).sort().join(' ');
        const off = seenCells(v0, sq, null), dark = seenCells(v0, sq, null, { level: 0 }), plain = VC(v0, sq, null);
        check('Lighting: seenCells with lighting off (no level) or a dark map is exactly visibleCells, every cell clear (tier 2): the same cells as before',
            keysT(off) === keysT(plain.map(o => ({ key: o.key, tier: 2 }))) && keysT(dark) === keysT(off) && off.length === plain.length && off.length > 1);
        const bright = seenCells(v0, sq, null, { level: 2 }), dim = seenCells(v0, sq, null, { level: 1 }), tierAt = (arr, k) => { const o = arr.find(e => e.key === k); return o ? o.tier : 0; };
        const wallL = {}; for (let r = 0; r <= 30; r++) wallL['6,' + r] = 1;
        const brightW = seenCells(v0, sq, wallL, { level: 2 }), cone = seenCells(Object.assign({ front: 90, arc: 90 }, v0), sq, null, { level: 2 });
        check('Lighting: on a bright map a token sees every cell in its line of sight out to the vision cap, clear; on a dim one clear within its sight in the dark and dim (tier 1) beyond; walls stop it; a facing cone still aims it',
            tierAt(bright, '22,2') === 2 && tierAt(bright, '2,62') === 2 && tierAt(bright, '2,63') === 0 && tierAt(dim, '3,2') === 2 && tierAt(dim, '4,2') === 2 && tierAt(dim, '5,2') === 1 && tierAt(dim, '22,2') === 1
            && tierAt(brightW, '5,2') === 2 && tierAt(brightW, '6,2') === 2 && tierAt(brightW, '9,2') === 0 && tierAt(cone, '22,2') === 2 && tierAt(cone, '2,22') === 0 && tierAt(cone, '2,0') === 0,
            lj([tierAt(bright, '22,2'), tierAt(dim, '5,2'), tierAt(brightW, '9,2'), tierAt(cone, '2,22')]));
        const far = VC({ x: 5025, y: 5025, range: 60 }, sq, null), farH = VC({ x: cellCenter({ q: 0, r: 0 }, hx).x, y: cellCenter({ q: 0, r: 0 }, hx).y, range: 60, arc: 360 }, hx, null);
        check('Lighting: the vision cap holds the whole disc at 60 cells (the east side is no longer cut off at 51 and past): 11,289 cells on a square grid, 10,981 on a hex one, the east edge included',
            LIMITS.cells === 12000 && far.some(o => o.key === '160,100') && far.some(o => o.key === '40,100') && far.length === 11289 && farH.length === 10981 && farH.some(o => o.key === '60:0') && farH.some(o => o.key === '-60:0'), far.length + ' ' + farH.length);
        // the line of sight inside visibleCells walks only the walls within reach, on numeric codes: exactly the cells lineClear over every blocker gives
        let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        const refVis = (v, g, blk) => { const here = cellOf(v.x, v.y, g), hk = cellKey(here, g); return VC(v, g, null).filter(o => o.key === hk || lineClear(here, o.cell, g, blk)).map(o => o.key).sort().join(' '); };
        let same = 0, runs = 0;
        [[sq, { x: 1025, y: 1025 }], [hx, cellCenter({ q: 10, r: 10 }, hx)]].forEach(([g, p]) => {
            for (let t = 0; t < 6; t++) {
                const blk = {}, hc = cellOf(p.x, p.y, g); for (let n = 0; n < 140; n++) { const dc = Math.round((rnd() - 0.5) * 60), dr = Math.round((rnd() - 0.5) * 60); if (dc || dr) blk[g.type === 'square' ? (hc.c + dc) + ',' + (hc.r + dr) : (hc.q + dc) + ':' + (hc.r + dr)] = 1; }
                blk[g.type === 'square' ? '999,999' : '999:999'] = 1;
                const v = { x: p.x, y: p.y, range: t < 3 ? 12 : 60, arc: t % 2 ? 360 : 120, front: 45 * t };
                runs++; if (VC(v, g, blk).map(o => o.key).sort().join(' ') === refVis(v, g, blk)) same++;
            }
        });
        check('Lighting: a token\'s line of sight walks only the walls within its reach, on numeric cell codes — the same cells as lineClear over every wall on the map (square and hex, sight 12 and the full 60, a facing cone and all around, walls far off ignored)', same === runs && runs === 12, same + '/' + runs);
        check('Lighting: cleanFog keeps a map\'s light (bright, dim or dark) and drops anything else (absent = auto); cellDist measures cells as vision does',
            cleanFog({ on: true, light: 'dim' }).light === 'dim' && cleanFog({ on: true, light: 'dark' }).light === 'dark' && cleanFog({ on: true, light: 'bright' }).light === 'bright' && cleanFog({ on: true, light: 'Dark' }).light === undefined
            && !('light' in cleanFog({ on: true, light: { toString: 'dim' } })) && cellDist({ c: 0, r: 0 }, { c: 3, r: 4 }, sq) === 5 && cellDist({ q: 0, r: 0 }, { q: 2, r: -1 }, hx) === 2 && cellDist(null, { c: 0, r: 0 }, sq) === Infinity);
    }
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
    check('cleanFog: on boolean, ruleset dropped (retired), cell clamp, manual arrays cleaned, mode defaults auto', (() => {
        const f = cleanFog({ on: 1, ruleset: 'evil', cell: { grid: 'square', len: 1e9 }, manual: { adds: [{ c: 1, r: 2 }, { bad: 1 }], cuts: 'x' } });
        return f.on === false && f.mode === 'auto' && f.ruleset === undefined && f.cell.len === LIMITS.len[1] && f.manual.adds.length === 1 && f.manual.cuts.length === 0 && cleanFog(null) === null; })());
    check('cleanFog retires ruleset entirely (dropped even when valid), keeps on:true and a whitelisted mode; a bad mode falls back to auto', (() => { const f = cleanFog({ on: true, ruleset: 'gurps', mode: 'reveal', manual: {} }); return f.on === true && f.ruleset === undefined && f.mode === 'reveal' && cleanFog({ on: true, mode: 'evil' }).mode === 'auto'; })());

    /* ---- vision validators (1.5.0) ---- */
    check('cleanVision: all → 360, arc clamped 1..360, arc default 180, junk → null', (() => {
        return cleanVision({ mode: 'all' }).arc === 360
            && cleanVision({ mode: 'arc', arc: 90 }).arc === 90
            && cleanVision({ mode: 'arc', arc: 9999 }).arc === 360
            && cleanVision({ mode: 'arc', arc: 0 }).arc === 1
            && cleanVision({ mode: 'arc' }).arc === LIMITS.arcDeg
            && cleanVision({ mode: 'nope' }) === null && cleanVision(null) === null; })());
    check('cleanFog carries a valid vision and drops an invalid one', (() => {
        const a = cleanFog({ on: true, vision: { mode: 'arc', arc: 120 } });
        const b = cleanFog({ on: true, vision: { mode: 'bogus' } });
        return a.vision.mode === 'arc' && a.vision.arc === 120 && b.vision === undefined; })());
    check('cleanCampFog carries a new-map vision default (else absent)', (() => {
        const a = cleanCampFog({ defaults: { sight: 30, vision: { mode: 'arc', arc: 90 } } });
        const b = cleanCampFog({ defaults: { sight: 30 } });
        return a.defaults.vision.arc === 90 && a.defaults.sight === 30 && b.defaults.vision === undefined; })());
    check('cleanFog keeps hex manual cells ({q,r}) by their own shape', (() => { const f = cleanFog({ on: true, manual: { adds: [{ q: 1, r: -2 }], cuts: [{ q: 0, r: 0 }] } }); return f.manual.adds.length === 1 && f.manual.adds[0].q === 1 && f.manual.adds[0].r === -2 && f.manual.cuts.length === 1; })());
    check('cleanCampFog: sight field id validated, default clamped, junk → empty', (() => {
        const a = cleanCampFog({ fields: { sight: 'f_see1' }, defaults: { sight: 60 } });
        const b = cleanCampFog({ fields: { sight: '../evil' }, defaults: { sight: -5 } });
        return a.fields.sight === 'f_see1' && a.defaults.sight === 60 && b.fields.sight === undefined && b.defaults.sight === 0 && cleanCampFog(null).defaults.sight === 0; })());
    check('cleanCampFog carries the new-map fog-on default (true stored, else absent)', (() => {
        const a = cleanCampFog({ defaults: { on: true } });
        const b = cleanCampFog({ defaults: { on: false } });
        const c = cleanCampFog({ defaults: {} });
        return a.defaults.on === true && b.defaults.on === undefined && c.defaults.on === undefined; })());
    check('cleanCampFog carries the empty-map fog default ("none" stored; "whole"/junk → absent)', (() => {
        const a = cleanCampFog({ defaults: { emptyFog: 'none' } });
        const b = cleanCampFog({ defaults: { emptyFog: 'whole' } });
        const c = cleanCampFog({ defaults: { emptyFog: 'junk' } });
        return a.defaults.emptyFog === 'none' && b.defaults.emptyFog === undefined && c.defaults.emptyFog === undefined; })());

    /* ---- the layers over the play map (style.css): the rulers over the fog, under screen effects and the minimap ---- */
    {
        const css = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'style.css'), 'utf8');
        const zOf = id => { const m = css.match(new RegExp('#' + id + ' \\{[^}]*z-index: (\\d+)')); return m ? +m[1] : NaN; };
        const fogZ = zOf('fogScreen'), fxZ = zOf('fxScreen'), mmZ = zOf('minimap'), rz = ['rulerTop', 'rulerLeft', 'rulerCursorX', 'rulerCursorY'].map(zOf);
        check('the coordinate rulers and their cursor marks draw over the fog of war and under screen effects and the minimap', rz.every(z => z > fogZ && z < fxZ && z < mmZ), JSON.stringify({ fogZ, fxZ, mmZ, rz }));
    }

    /* ---- publication ---- */
    global.window = {};
    const X2 = await import(url('fogcore.js') + '?x');
    check('window.wpFogCore published', !!(global.window.wpFogCore && global.window.wpFogCore.visibleCells && global.window.wpFogCore.VERSION === X2.VERSION));
    delete global.window;

    /* ---- Onboarding F1a: a waiting token under fog (fog.js, sliced and run) — a viewer only when the campaign says so, and hidden in fog from other players ---- */
    {
        const fogSrc = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fog.js'), 'utf8').replace(/\r\n/g, '\n');
        const cut = (a) => { const i = fogSrc.indexOf(a), k = fogSrc.indexOf('\n}\n', i); if (i < 0 || k < 0) throw new Error('fogcheck: ' + a + ' not found'); return fogSrc.slice(i, k + 2); };
        const VF = new Function('window', 'visionOf', 'tokenSightCells', cut('function viewersFor(') + '\nreturn viewersFor;')({}, () => ({ arc: 360 }), () => 3);
        const mapV = { whiteboard: [{ id: 'a', waiting: 1, ownerId: 'u_a', x: 0, y: 0 }, { id: 'b', isChar: true, ownerId: 'u_a', x: 100, y: 0 }, { id: 'c', waiting: 1, ownerId: 'u_a', hidden: true, x: 0, y: 0 }] };
        const off = VF(mapV, {}, 'u_a'), onV = VF(mapV, { newPlayers: { sight: true } }, 'u_a'), junk = VF(mapV, { newPlayers: { sight: 'yes' } }, 'u_a');
        check('F1a viewersFor: a waiting token sees only when the campaign turns its sight on (never hidden, never with a sight setting that is not true); a character token sees as before',
            off.length === 1 && onV.length === 2 && junk.length === 1, JSON.stringify([off, onV, junk]));
        const FD = new Function('fogFeatureOn', 'mapFog', 'gridForMap', 'fogMask', 'revealedCellList', 'core', 'inMask', cut('function fogDropIds(') + '\nreturn fogDropIds;')(
            () => true, () => ({ on: true }), () => ({}), () => ({ mode: 'mask' }), () => [], () => ({ cellKey: c => c.k, cellOf: (x, y) => ({ k: x + ',' + y }) }), () => true);
        const mapD = { type: 'map', whiteboard: [{ id: 'wb_other', waiting: 1, ownerId: 'u_b', x: 0, y: 0 }, { id: 'wb_mine', waiting: 1, ownerId: 'u_a', x: 0, y: 0 }, { id: 'tok_b', isChar: true, ownerId: 'u_b', x: 0, y: 0 }, { id: 'prop', type: 'circle', x: 0, y: 0 }] };
        const drop = FD('u_a', {}, mapD) || {};
        check('F1a fogDropIds: another player\'s waiting token inside fog is left out of this player\'s copy like a character token; their own always comes; a plain item is not a token',
            drop.wb_other === 1 && drop.tok_b === 1 && !drop.wb_mine && !drop.prop, JSON.stringify(drop));
        // review follow-up (b): a play area dragged live (its position changed, the map not yet saved) masks where it is now
        const FC = await import(url('fogcore.js') + '?m'), grid = FC.squareGrid(50);
        const mSrc = fogSrc.slice(fogSrc.indexOf('var _maskCache = Object.create(null)'), fogSrc.indexOf('function inMask('));
        const FM = new Function('core', 'footprintCells', 'maskFootprint', 'campFog', mSrc + '\nreturn fogMask;')(() => FC, (w, g, C) => C.cellsUnderRect(w.x, w.y, w.w || 0, w.h || 0, g), (w, g, C) => C.cellsUnderRect(w.x, w.y, w.w || 0, w.h || 0, g), () => ({ defaults: {} }));
        const area = { id: 'pa', type: 'rect', fogged: true, x: 0, y: 0, w: 50, h: 50 }, mapM = { id: 'm1', meta: { updated: 5 }, whiteboard: [area] };
        const k0 = Object.keys(FM(mapM, {}, grid).keys || {}); area.x = 200; const k1 = Object.keys(FM(mapM, {}, grid).keys || {}); const k2 = Object.keys(FM(mapM, {}, grid).keys || {});
        check('Fog play areas: a play area dragged live masks its new footprint before the map is saved (the mask follows the areas\' own positions), and the same position reads the cached mask',
            k0.length === 1 && k1.length === 1 && k0[0] !== k1[0] && JSON.stringify(k1) === JSON.stringify(k2), JSON.stringify([k0, k1]));
        // cover follow-ups: fog.js's cover — a map's pieces (coverSetsFor), the ruler (coverBetween), a blast point to a token (coverAt), where a
        // thrown blast goes off (blastSeat) and the caches' reset (invalidateVision) — sliced and run strict on the real fogcore
        const ixF = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').replace(/\r\n/g, NL);
        const js = JSON.stringify, lj = JSON.stringify, lineOf = a => { const i = fogSrc.indexOf(a), k = fogSrc.indexOf(NL, i); if (i < 0 || k < 0) throw new Error('fogcheck: ' + a + ' not found'); return fogSrc.slice(i, k + 1); };
        let campCv = { system: { combat: { cover: { on: true } } } }, mapNow = null;
        const CV = new Function('core', 'activeCamp', 'activeMap', 'gridForMap', 'window', "'use strict'; var _viewCache, _coverCache = Object.create(null), _coverStamp = Object.create(null), _keyCache, _blockerCache, _blockerStamp, _maskCache, _maskStamp;" + NL
            + lineOf('function invalidateVision()') + lineOf('function coverOn(') + cut('function footprintCells(') + cut('function coverBetween(x1') + cut('function coverSetsFor(') + cut('function coverAt(') + cut('function blastSeat(')
            + NL + 'return { coverSetsFor: coverSetsFor, coverAt: coverAt, coverBetween: coverBetween, blastSeat: blastSeat, invalidateVision: invalidateVision };')(
            () => FC, () => campCv, () => mapNow, () => grid, { wpSystemCore: { coverTier: (sys, coverage, lineOfEffect) => ({ coverage: coverage, lineOfEffect: lineOfEffect }) } });
        const keysOf = cells => cells.map(c => FC.cellKey(c, grid)).sort();
        const wall = { id: 'wall', type: 'rect', x: 100, y: 0, w: 50, h: 50, blocksSight: true }, crate = { id: 'crate', type: 'circle', x: 100, y: 100, w: 50, h: 50, cover: 'yes' };
        const tokC = { id: 'tok', type: 'circle', isChar: true, blocksSight: true, x: 100, y: 200, w: 50, h: 50 }, gone = { id: 'gone', type: 'rect', x: 100, y: 300, w: 50, h: 50, blocksSight: true, hidden: true };
        const mapC = { id: 'mc', meta: { updated: 1 }, whiteboard: [wall, crate, tokC, gone] };
        const cs1 = CV.coverSetsFor(mapC, grid), cs2 = CV.coverSetsFor(mapC, grid);
        const hardK = Object.keys((cs1 && cs1.hard) || {}).sort(), softK = Object.keys((cs1 && cs1.soft) || {}).sort(), allK = Object.keys((cs1 && cs1.all) || {}).sort();
        crate.cover = 'no'; const cs2b = CV.coverSetsFor(mapC, grid); mapC.meta.updated = 2; const cs3 = CV.coverSetsFor(mapC, grid);
        crate.cover = 'yes'; const cs4 = CV.coverSetsFor(mapC, grid); CV.invalidateVision(); const cs5 = CV.coverSetsFor(mapC, grid);
        check('Cover: a map\'s cover pieces (fog.js coverSetsFor, run strict) — a sight-blocker is hard cover, a see-over piece soft, never a token or a hidden piece; all is their union; the same saved stamp reads the cache until invalidateVision, a new stamp recomputes (a piece set to no cover drops out)',
            js(hardK) === js(keysOf(FC.cellsUnderRect(100, 0, 50, 50, grid))) && js(softK) === js(keysOf(FC.cellsUnderCircle(100, 100, 50, 50, grid))) && hardK.length > 0 && softK.length > 0 && cs2 === cs1
            && js(allK) === js(hardK.concat(softK).sort()) && cs2b === cs1 && !!cs3 && !cs3.soft && js(Object.keys(cs3.hard).sort()) === js(hardK) && cs3.all === cs3.hard && cs4 === cs3 && !!cs5 && !!cs5.soft, js([hardK, softK, allK, cs3]));
        // the cells cap (6,000): walls and see-over cells counted once each, together
        const big = { id: 'big', type: 'rect', x: 0, y: 1000, w: 50 * 100, h: 50 * 59, blocksSight: true }, rowS = { id: 'rowS', type: 'rect', x: 0, y: 0, w: 50 * 150, h: 50, cover: 'yes' };
        const onW = { id: 'onW', type: 'rect', x: 0, y: 1000, w: 50 * 150, h: 50, cover: 'yes' }, huge = { id: 'huge', type: 'rect', x: 0, y: 0, w: 50 * 100, h: 50 * 61, blocksSight: true };
        const capA = CV.coverSetsFor({ id: 'ca', meta: { updated: 1 }, whiteboard: [big, rowS] }, grid), capB = CV.coverSetsFor({ id: 'cb', meta: { updated: 1 }, whiteboard: [big, onW] }, grid), capC = CV.coverSetsFor({ id: 'cc', meta: { updated: 1 }, whiteboard: [huge] }, grid);
        check('Cover: the cells cap — walls and see-over cells over it together keep the walls\' cover and drop the see-over pieces; a see-over cell on a wall counts once; walls alone over it give no cover (fail open, as sight)',
            FC.LIMITS.blockerCells === 6000 && !!capA && Object.keys(capA.hard).length === 5900 && capA.soft === null && capA.all === capA.hard && !!capB && Object.keys(capB.soft).length === 150 && Object.keys(capB.all).length === 5950 && capC === null,
            js([capA && Object.keys(capA.hard).length, capA && capA.soft, capB && capB.soft && Object.keys(capB.soft).length, capC]));
        // a wall column (2,1)-(2,3), a see-over crate at (2,6), a token that blocks sight at (2,8): the ruler and a blast read the pieces, never the token
        const colW = { id: 'colW', type: 'rect', x: 100, y: 50, w: 50, h: 150, blocksSight: true }, crateB = { id: 'crateB', type: 'rect', x: 100, y: 300, w: 50, h: 50, cover: 'yes' }, tokW = { id: 'tokW', type: 'circle', isChar: true, blocksSight: true, x: 100, y: 400, w: 50, h: 50 };
        mapNow = { id: 'mr', meta: { updated: 1 }, whiteboard: [colW, crateB, tokW] };
        const rW = CV.coverBetween(25, 125, 225, 125), rS = CV.coverBetween(25, 325, 225, 325), rT = CV.coverBetween(25, 425, 225, 425);
        const tokR = { id: 'tokR', x: 200, y: 100, w: 50, h: 50 }, tokS = { id: 'tokS', x: 200, y: 300, w: 50, h: 50 };
        const aW = CV.coverAt(25, 125, tokR, mapNow), aS = CV.coverAt(25, 325, tokS, mapNow), aEmpty = CV.coverAt(25, 125, tokR, { id: 'me', meta: { updated: 1 }, whiteboard: [] });
        check('Cover: the ruler (fog.js coverBetween) and a blast\'s cover (coverAt), run strict — total through a wall, partial past a see-over crate (never total), none past a token even one that blocks sight; a map with no pieces has no cover',
            !!rW && rW.lineOfEffect === false && !!rS && rS.lineOfEffect === true && rS.coverage > 0 && !!rT && rT.coverage === 0 && rT.lineOfEffect === true
            && !!aW && aW.lineOfEffect === false && !!aS && aS.lineOfEffect === true && aS.coverage > 0 && aEmpty === null, js([rW, rS, rT, aW, aS, aEmpty]));
        // a 2x2 token half behind a pillar: its most exposed cells count (its centre's cell alone reads total)
        const pill = { id: 'pill', type: 'rect', x: 250, y: 150, w: 50, h: 50, blocksSight: true }, mapL = { id: 'ml', meta: { updated: 1 }, whiteboard: [pill] };
        const aL = CV.coverAt(125, 175, { id: 'bigT', x: 300, y: 100, w: 100, h: 100 }, mapL), aLc = CV.coverAt(125, 175, { id: 'one', x: 350, y: 150, w: 50, h: 50 }, mapL), aTiny = CV.coverAt(125, 175, { id: 'tiny', x: 355, y: 155, w: 10, h: 10 }, mapL);
        const T22 = { id: 'b22', x: 300, y: 100, w: 100, h: 100 }, onMap = (id, piece) => ({ id: id, meta: { updated: 1 }, whiteboard: [Object.assign({ type: 'rect', w: 50, h: 50, blocksSight: true }, piece)] });
        const aL1 = CV.coverAt(125, 125, T22, onMap('ml1', { id: 'p1', x: 250, y: 100 })), aL2 = CV.coverAt(125, 175, T22, onMap('ml2', { id: 'p2', x: 200, y: 150 })), aL3 = CV.coverAt(125, 175, T22, onMap('ml3', { id: 'p3', x: 150, y: 100 }));
        const aSmall = CV.coverAt(125, 125, { id: 'small', x: 280, y: 80, w: 40, h: 40 }, onMap('ms', { id: 'pS', x: 250, y: 100 }));
        const aInWall = CV.coverAt(175, 425, { id: 'inw', x: 250, y: 400, w: 100, h: 50 }, onMap('mw', { id: 'colL', x: 250, y: 0, h: 1000 })), aHuge = CV.coverAt(125, 125, { id: 'huge', x: 0, y: 0, w: 1e6, h: 1e6 }, onMap('mh', { id: 'pH', x: 250, y: 100 }));
        check('Cover: a large token is as exposed as its most exposed cell (a 2x2 token half behind a pillar has partial cover, not total; a covered cell first, cells of different cover, one cell covered); a cell of it inside a wall does not count; one covering no cell centre is measured to its centre\'s cell; a vast box never lists its cells',
            !!aL && aL.lineOfEffect === true && aL.coverage > 0 && !!aLc && aLc.lineOfEffect === false && !!aTiny && aTiny.lineOfEffect === false
            && !!aL1 && aL1.lineOfEffect === true && aL1.coverage === 0.5 && !!aL2 && aL2.coverage === 0.5 && !!aL3 && aL3.lineOfEffect === true && aL3.coverage === 0
            && !!aSmall && aSmall.lineOfEffect === false && !!aInWall && aInWall.lineOfEffect === false && !!aHuge, js([aL, aLc, aTiny, aL1, aL2, aL3, aSmall, aInWall, aHuge]));
        // owner answer 5: a thrown blast seated in a wall goes off in front of it, on the thrower's side
        const sW = CV.blastSeat(mapNow, 125, 125, 25, 125), sFar = CV.blastSeat(mapNow, 125, 125, 400, 125), sOpen = CV.blastSeat(mapNow, 25, 125, 400, 125), sCrate = CV.blastSeat(mapNow, 125, 325, 25, 325), sEmpty = CV.blastSeat({ id: 'me2', meta: { updated: 1 }, whiteboard: [crateB] }, 125, 125, 25, 125);
        campCv = { system: { combat: { cover: { on: false } } } };
        const offA = CV.coverAt(25, 125, tokR, mapNow), offR = CV.coverBetween(25, 125, 225, 125), offS = CV.blastSeat(mapNow, 125, 125, 25, 125);
        campCv = { system: { combat: { cover: { on: true } } } };
        check('Cover: a blast seated in a wall (blastSeat, run strict) goes off in the open cell in front of it, toward the thrower (either side); an open cell, a see-over crate\'s cell or a map with no walls leave it; with cover off (the default) the ruler, a blast\'s cover and its seat work nothing out',
            js(sW) === js({ x: 75, y: 125 }) && js(sFar) === js({ x: 175, y: 125 }) && sOpen === null && sCrate === null && sEmpty === null && offA === null && offR === null && offS === null, js([sW, sFar, sOpen, sCrate, sEmpty, offA, offR, offS]));
        check('Cover: window.wpFog publishes the blast\'s cover and its seat', /coverAt: coverAt, blastSeat: blastSeat,/.test(fogSrc) && /coverBetween: coverBetween,/.test(fogSrc));
        // lighting (backlog 14): the map's light level, the blockers' content version, the per-viewer memo, the tiered reveal and host enforcement on
        // a lit map (fog.js, sliced and run strict)
        let litOn = true;
        const LT = new Function('core', 'vtt', 'mapFog', 'gridForMap', 'viewersFor', 'fogFeatureOn', 'fogMask', 'inMask', 'toast', "'use strict';" + NL
            + lineOf('function lightingOn()') + lineOf('function placedLights(') + cut('function mapLevel(') + lineOf('var _blockerCache = Object.create(null)') + lineOf('var _blockerSig = Object.create(null)')
            + cut('function eligibleBlocker(') + cut('function footprintCells(') + cut('function blockersFor(') + lineOf('var _viewCache = Object.create(null), _viewCells = 0') + cut('function viewSeen(') + cut('function revealedTiers(') + cut('function revealedCellList(') + cut('function fogDropIds(')
            + NL + 'return { mapLevel: mapLevel, blockersFor: blockersFor, viewSeen: viewSeen, revealedTiers: revealedTiers, revealedCellList: revealedCellList, fogDropIds: fogDropIds, reset: function() { _viewCache = Object.create(null); _viewCells = 0; }, cells: function() { return _viewCells; }, setBudget: function(n) { VIEW_BUDGET = n; } };')(
            () => FC, () => ({ on: f => f === 'lighting' ? litOn : true }), m => m.fog, () => grid, (m, camp, owner) => m.viewers.filter(v => owner === '*' || v.owner === owner), () => true, () => ({ mode: 'all' }), () => true, () => {});
        let lmN = 0; const lmap = (fog, wb, viewers) => ({ id: 'lm' + (++lmN), type: 'map', meta: { updated: 1 }, fog: Object.assign({ on: true, mode: 'auto', manual: { adds: [], cuts: [] } }, fog), whiteboard: wb || [], viewers: viewers || [] });
        const lamp = { id: 'lamp', type: 'light', x: 0, y: 0, w: 20, h: 20 };
        const lvls = [LT.mapLevel(lmap({})), LT.mapLevel(lmap({}, [lamp])), LT.mapLevel(lmap({}, [Object.assign({ hidden: true }, lamp)])), LT.mapLevel(lmap({ light: 'dim' })), LT.mapLevel(lmap({ light: 'dark' })), LT.mapLevel(lmap({ light: 'bright' }, [lamp]))];
        litOn = false; const lvlOff = LT.mapLevel(lmap({ light: 'bright' })); litOn = true;
        check('Lighting: a map\'s light — auto is bright until a light source is placed on it (a hidden one does not count), then dark; bright, dim or dark as set; the Lighting switch off leaves fog as before (no level)',
            lj(lvls) === lj([2, 0, 2, 1, 0, 2]) && lvlOff === null, lj([lvls, lvlOff]));
        const pv = { x: 125, y: 125, range: 2, arc: 360, owner: 'p1' }, lmB = lmap({ light: 'bright', manual: { adds: [{ c: 40, r: 40 }], cuts: [{ c: 2, r: 3 }] } }, [], [pv]);
        const tB = LT.revealedTiers(lmB, {}, 'p1'), lmD = lmap({ light: 'dim', manual: { adds: [{ c: 20, r: 2 }], cuts: [] } }, [], [pv]), tD = LT.revealedTiers(lmD, {}, 'p1');
        const pv2 = { x: 1025, y: 125, range: 3, arc: 360, owner: 'p1' }, tTwo = LT.revealedTiers(lmap({ light: 'dim' }, [], [pv, pv2]), {}, 'p1');
        litOn = false; LT.reset(); const tOff = LT.revealedTiers(lmap({ light: 'bright' }, [], [pv]), {}, 'p1'); litOn = true;
        check('Lighting: the cells revealed to a player carry their tier (a manual reveal clear even on a dim map, a manual hide removed, a dim map\'s far cells dim, the clearest tier any of their tokens gives); with the switch off only its sight shows, all clear; revealedCellList is every tier\'s cell',
            tB.keys['22,2'] === 2 && tB.keys['40,40'] === 2 && tB.keys['2,3'] === undefined && !tB.list.some(o => o.key === '2,3') && tD.keys['22,2'] === 1 && tD.keys['3,2'] === 2
            && tOff.keys['22,2'] === undefined && tOff.keys['3,2'] === 2 && Object.keys(tOff.keys).every(k => tOff.keys[k] === 2)
            && tD.keys['20,2'] === 2 && tD.keys['21,2'] === 1 && tTwo.keys['21,2'] === 2 && tTwo.keys['4,2'] === 2 && tTwo.keys['12,2'] === 1
            && LT.revealedCellList(lmD, {}, 'p1').length === tD.list.length && tD.list.some(o => tD.keys[o.key] === 1) && LT.revealedTiers(lmap({ mode: 'reveal' }, [], [pv]), {}, 'p1') === null && Object.keys(LT.revealedTiers(lmap({ light: 'bright', mode: 'cover' }, [], [pv]), {}, 'p1').keys).length === 0,
            lj([tB.keys['22,2'], tD.keys['22,2'], tOff.keys['22,2']]));
        // the memo: the same answer while nothing it reads changes (a save that moves nothing it reads keeps it), afresh for a new sight, cell,
        // cone, level or wall; all-around vision never keys on facing; bounded by cells
        LT.reset(); const mm = lmap({ light: 'bright' }, [], [pv]), bl0 = LT.blockersFor(mm, grid), s1 = LT.viewSeen(mm, grid, bl0, 2, pv), s2 = LT.viewSeen(mm, grid, bl0, 2, pv), s3 = LT.viewSeen(mm, grid, bl0, 2, Object.assign({}, pv, { range: 3 }));
        const sTurn = LT.viewSeen(mm, grid, bl0, 2, Object.assign({}, pv, { front: 137 }));
        mm.meta.updated = 2; const bl1 = LT.blockersFor(mm, grid), s4 = LT.viewSeen(mm, grid, bl1, 2, pv), s5 = LT.viewSeen(mm, grid, bl1, 1, pv);
        mm.whiteboard.push({ id: 'wl', type: 'rect', x: 500, y: 0, w: 50, h: 1550, blocksSight: true }); mm.meta.updated = 3;
        const bl2 = LT.blockersFor(mm, grid), s6 = LT.viewSeen(mm, grid, bl2, 2, pv), s6b = (() => { mm.whiteboard.push({ id: 'wl3', type: 'rect', x: 250, y: 0, w: 50, h: 1550, blocksSight: true }); mm.meta.updated = 4; return LT.viewSeen(mm, grid, LT.blockersFor(mm, grid), 2, pv); })(), sTok = LT.blockersFor(lmap({}, [{ id: 'tk', type: 'circle', isChar: true, blocksSight: true, x: 0, y: 0, w: 50, h: 50 }, { id: 'wt', type: 'circle', waiting: 1, blocksSight: true, x: 100, y: 0, w: 50, h: 50 }]), grid);
        check('Lighting: one viewer\'s seen cells are worked out once per map — the same answer again while nothing it reads changes (a save that moves no wall keeps it; an all-around token turning keeps it), afresh for a different sight, light level or wall; a token (a character or a waiting one) never blocks sight',
            s1 === s2 && s3 !== s1 && sTurn === s1 && s4 === s1 && s5 !== s4 && s5.some(o => o.tier === 1) && s6 !== s1 && s6.length < s1.length && !s6.some(o => o.key === '22,2') && s6b !== s6 && !s6b.some(o => o.key === '7,2') && s6.some(o => o.key === '7,2') && sTok === null);
        const cone = (front, arc) => ({ x: 1525, y: 125, range: 0, arc: arc, front: front, owner: 'p1' });
        const eastFoe = { id: 'east', isChar: true, ownerId: 'gm', x: 2500, y: 100, w: 50, h: 50 }, westFoe = { id: 'west', isChar: true, ownerId: 'gm', x: 500, y: 100, w: 50, h: 50 };
        LT.reset(); const cm = lmap({ light: 'bright' }, [eastFoe, westFoe], [cone(90, 90)]), dE = LT.fogDropIds('p1', {}, cm); cm.viewers = [cone(270, 90)]; const dW = LT.fogDropIds('p1', {}, cm); cm.viewers = [cone(270, 360)]; const dA = LT.fogDropIds('p1', {}, cm);
        cm.viewers = [Object.assign(cone(90, 90), { x: 125 })]; const dMoved = LT.fogDropIds('p1', {}, cm);
        check('Lighting: the memo keys on the token\'s cell, its facing (for a cone) and its arc — a cone turned from east to west now drops the east creature, all around drops none, the cone moved to the west edge sees both creatures ahead of it',
            lj(dE) === lj({ west: 1 }) && lj(dW) === lj({ east: 1 }) && dA === null && dMoved === null, lj([dE, dW, dA, dMoved]));
        LT.reset(); LT.setBudget(400); const bm = lmap({ light: 'bright' }, [], []), bb = LT.blockersFor(bm, grid); LT.viewSeen(bm, grid, bb, 2, Object.assign({}, pv, { range: 60 })); const c1 = LT.cells(); LT.viewSeen(bm, grid, bb, 2, Object.assign({}, pv, { x: 525 })); const c2 = LT.cells(); LT.setBudget(250000); LT.reset();
        check('Lighting: the memo is bounded by cells across every map — past its budget it starts afresh rather than growing (two full discs over a small budget hold one)', c1 > 11000 && c2 === c1, c1 + ' ' + c2);
        const foe = { id: 'foe', isChar: true, ownerId: 'gm', x: 1000, y: 100, w: 50, h: 50 }, me = { id: 'me', isChar: true, ownerId: 'p1', x: 100, y: 100, w: 50, h: 50 };
        LT.reset(); const dropB = LT.fogDropIds('p1', {}, lmap({ light: 'bright' }, [me, foe], [pv])), dropK = LT.fogDropIds('p1', {}, lmap({ light: 'dark' }, [me, foe], [pv]));
        LT.reset(); const wallFoe = lmap({ light: 'bright' }, [me, foe, { id: 'wl2', type: 'rect', x: 500, y: 0, w: 50, h: 1550, blocksSight: true }], [pv]); const dropW = LT.fogDropIds('p1', {}, wallFoe);
        check('Lighting: a player\'s copy of a lit map keeps a creature in their line of sight at any distance; a dark map or a wall between still drops it',
            dropB === null && !!dropK && dropK.foe === 1 && !!dropW && dropW.foe === 1 && !dropK.me, lj([dropB, dropK, dropW]));
        // the overlay's punch (draw, run strict on a recording canvas): a dim cell part-way, a clear one fully, each tier one path filled once
        const drawRun = (tiersRes) => { const rec = [], cx = { save() {}, restore() {}, clearRect() {}, fillRect() { rec.push({ base: true, style: this.fillStyle }); }, beginPath() { this._n = 0; }, rect() { this._n++; }, moveTo() {}, lineTo() {}, closePath() { this._n++; }, clip() {}, fill() { rec.push({ op: this.globalCompositeOperation, style: this.fillStyle, n: this._n }); } };
            const canvas = { getContext: () => cx }, scr = { clientWidth: 2000, clientHeight: 2000, querySelector: () => canvas };
            new Function('screenEl', 'placeScreen', 'ui', 'core', 'active', 'activeMap', 'activeCamp', 'gridForMap', 'fogMask', 'revealedTiers', 'drawOwner', 'isClientView', 'state', 'hexPath', "'use strict';" + NL + cut('function draw(') + NL + 'return draw;')(
                () => scr, () => {}, () => ({ scrollLeft: 0, scrollTop: 0 }), () => FC, () => true, () => ({}), () => ({}), () => grid, () => ({ mode: 'all' }), () => tiersRes, () => '*', () => true, { zoomLevel: 1 }, () => {})();
            return rec.filter(r => !r.base); };
        const cellsT = [[0, 0, 2], [1, 0, 1], [2, 0, 1], [3, 0, 2], [4, 0, 2]], tiersMix = { list: cellsT.map(([c, r]) => ({ key: c + ',' + r, cell: { c, r } })), keys: {} }; cellsT.forEach(([c, r, t]) => { tiersMix.keys[c + ',' + r] = t; });
        const tiersClear = { list: tiersMix.list, keys: Object.fromEntries(Object.keys(tiersMix.keys).map(k => [k, 2])) }, pm = drawRun(tiersMix), pc = drawRun(tiersClear);
        check('Lighting: the overlay punches the dim cells part-way in one pass and the clear or bright ones fully in the next (drawn for real on a recording canvas); with no dim cell, one full pass as before',
            lj(pm) === lj([{ op: 'destination-out', style: 'rgba(0,0,0,0.5)', n: 2 }, { op: 'destination-out', style: 'rgba(0,0,0,1)', n: 3 }]) && lj(pc) === lj([{ op: 'destination-out', style: 'rgba(0,0,0,1)', n: 5 }]), lj([pm, pc]));
        check('Lighting: the fog menu sets a map\'s light (Auto, Bright, Dim, Dark) only while Lighting is on, saved, and follows the switch while open; window.wpFog reports it; a save or a received change no longer clears the viewer memo',
            /var lrow = ui\('fogLightRow'\); if \(lrow\) lrow\.style\.display = lightingOn\(\) \? '' : 'none';/.test(fogSrc)
            && /if \(lsel\.value === 'bright' \|\| lsel\.value === 'dim' \|\| lsel\.value === 'dark'\) mf\.light = lsel\.value; else delete mf\.light;\n\s*save\(\); invalidateVision\(\); syncMenu\(\); redraw\(\);/.test(fogSrc) && /lightLevel: mapLevel,/.test(fogSrc)
            && /<div id="fogLightRow" style="display:none;">[\s\S]{0,700}<select id="fogLight"[^>]*>\s*<option value="auto">Auto &mdash; lit<\/option>\s*<option value="bright">Bright<\/option>\s*<option value="dim">Dim<\/option>\s*<option value="dark">Dark<\/option>/.test(ixF)
            && /id="setLightingBtn"/.test(ixF) && /id="setVttGlobalLightingBtn"/.test(ixF) && /function invalidateVision\(\) \{ _coverCache = Object\.create\(null\);/.test(fogSrc) && !/_viewCache = Object\.create\(null\); _coverCache/.test(fogSrc)
            && /var fmu = ui\('fogMenu'\); if \(showBtn && fmu && fmu\.classList\.contains\('show'\)\) syncMenu\(\);/.test(fogSrc) && !/until you place a light/.test(ixF));
        const inF = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, NL);
        check('Lighting: a token\'s Properties never offer Blocks sight (a token never blocks sight, as the fog rule says)',
            /\(\['rect','hexagon','circle','diamond'\]\.indexOf\(w\.type\) >= 0 && !w\.hidden && !w\.isChar && !w\.waiting \? '<div class="field check-row"><input type="checkbox" id="wbBlocksSight"/.test(inF));
        const tuF = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'tutorial.js'), 'utf8').replace(/\r\n/g, NL);
        check('Lighting: the Tutorial\'s Dark Cellar is dark (a new Tutorial, and an older one once, on its next start; a GM\'s own later choice stays), so Bren\'s sight in the dark is what lights it and the Lurker stays out of view',
            /fm\.fog = \{ on: true, mode: 'auto', light: 'dark', manual: \{ adds: \[\], cuts: \[\] \} \};/.test(tuF)
            && /if \(!camp\.tutorialLight\) \{ var tfog = camp\.items\.map_tut_fog\.fog; if \(tfog && typeof tfog === 'object' && tfog\.light === undefined\) tfog\.light = 'dark'; camp\.tutorialLight = 1; \}/.test(tuF)
            && tuF.indexOf('if (!camp.tutorialLight)') > tuF.indexOf('// 1.5.0 sight-blocking: the demo pillars block'));
    }
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
