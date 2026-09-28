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
        const js = JSON.stringify, lineOf = a => { const i = fogSrc.indexOf(a), k = fogSrc.indexOf(NL, i); if (i < 0 || k < 0) throw new Error('fogcheck: ' + a + ' not found'); return fogSrc.slice(i, k + 1); };
        let campCv = { system: { combat: { cover: { on: true } } } }, mapNow = null;
        const CV = new Function('core', 'activeCamp', 'activeMap', 'gridForMap', 'window', "'use strict'; var _coverCache = Object.create(null), _coverStamp = Object.create(null), _keyCache, _blockerCache, _blockerStamp, _maskCache, _maskStamp;" + NL
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
    }
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
