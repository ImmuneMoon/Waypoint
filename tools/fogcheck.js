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
        // L2: light sources
        const { cleanLight, litLevels, neighbourCells } = X;
        check('Lighting: cleanLight keeps a light\'s bright and dim radii in yards (dim at least bright, clamped, numbers only), off while switched off; none when it gives no light',
            lj(cleanLight({ bright: 5, dim: 10 })) === lj({ bright: 5, dim: 10 }) && lj(cleanLight({ bright: 8, dim: 3 })) === lj({ bright: 8, dim: 8 }) && lj(cleanLight({ bright: 0, dim: 4, off: true })) === lj({ bright: 0, dim: 4, off: true })
            && cleanLight({ bright: 0, dim: 0 }) === null && cleanLight({ bright: '5', dim: '9' }) === null && cleanLight(null) === null && cleanLight('x') === null && lj(cleanLight({ bright: 1e9, dim: -3, off: 'yes' })) === lj({ bright: 1000, dim: 1000 }));
        const wall7 = {}; for (let r = 0; r <= 12; r++) wall7['7,' + r] = 1;
        const L1 = litLevels([{ cell: { c: 5, r: 5 }, bright: 2, dim: 4 }], sq, null), L2 = litLevels([{ cell: { c: 5, r: 5 }, bright: 2, dim: 4 }], sq, wall7);
        const bigSrc = []; for (let i = 0; i < 12; i++) bigSrc.push({ cell: { c: 100 * i, r: 0 }, bright: 60, dim: 60 });
        check('Lighting: litLevels — bright within a source\'s bright radius, dim out to its dim radius, nothing past it; walls stop light and a wall\'s own cell takes none; the brighter of two sources wins; too much to walk lights nothing (the map reads dark)',
            L1['5,5'] === 2 && L1['7,5'] === 2 && L1['8,5'] === 1 && L1['9,5'] === 1 && L1['10,5'] === undefined && L2['6,5'] === 2 && L2['7,5'] === undefined && L2['8,5'] === undefined
            && litLevels([{ cell: { c: 5, r: 5 }, bright: 0, dim: 4 }, { cell: { c: 9, r: 5 }, bright: 1, dim: 1 }], sq, null)['9,5'] === 2 && litLevels([{ cell: { c: 9, r: 5 }, bright: 1, dim: 1 }, { cell: { c: 5, r: 5 }, bright: 0, dim: 4 }], sq, null)['9,5'] === 2 && litLevels(bigSrc, sq, null) === null && lj(litLevels([], sq, null)) === '{}',
            lj([L1['8,5'], L2['8,5'], L2['7,5']]));
        const { cleanFogLit } = X;
        check('Lighting: cleanFogLit (the lit cells a host sends one player) keeps square and hex cells with a level of 1 or 2 only, whole numbers, at most LIMITS.cells; anything else is dropped, and nothing kept is null',
            lj(cleanFogLit([{ c: 1, r: 2, t: 2 }, { q: 3, r: -1, t: 1 }, { c: 1.7, r: 2, t: 1 }, { c: 1, r: 2, t: 3 }, { c: 'x', r: 1, t: 1 }, null, { c: 1, r: 1, t: '2' }])) === lj([{ c: 1, r: 2, t: 2 }, { q: 3, r: -1, t: 1 }, { c: 1, r: 2, t: 1 }])
            && cleanFogLit([]) === null && cleanFogLit('x') === null && cleanFogLit([{ c: 1, r: 1, t: 0 }]) === null && cleanFogLit(Array.from({ length: 13000 }, (x, i) => ({ c: i, r: 0, t: 1 }))).length === LIMITS.cells);
        check('Lighting: a cell\'s neighbours — 8 on a square grid, 6 distinct on a hex one', neighbourCells({ c: 3, r: 3 }, sq).length === 8 && neighbourCells({ q: 3, r: 3 }, hx).length === 6 && neighbourCells({ q: 3, r: 3 }, hx).every(n => hexDist(n, { q: 3, r: 3 }) === 1) && new Set(neighbourCells({ q: 3, r: 3 }, hx).map(n => cellKey(n, hx))).size === 6);
        // review L2: the dim-only light, a wall past sight on a dark map with a lamp elsewhere, the map's own light on a wall face, hex faces
        const tAtR = (arr, k) => { const o = arr.find(e => e.key === k); return o ? o.tier : 0; };
        const lDim = litLevels([{ cell: { c: 5, r: 5 }, bright: -1, dim: 3 }], sq, null), doorM = { '6,2': 1 }, lampFar = { '40,2': 2, '41,2': 2 };
        const dNo = seenCells({ x: 125, y: 125, range: 3, arc: 360 }, sq, doorM, { level: 0, lit: {} }), dFar = seenCells({ x: 125, y: 125, range: 3, arc: 360 }, sq, doorM, { level: 0, lit: lampFar });
        const hxDoor = { '4:0': 1 }, hxV = cellCenter({ q: 0, r: 0 }, hx), dHx = seenCells({ x: hxV.x, y: hxV.y, range: 3, arc: 360 }, hx, hxDoor, { level: 0, lit: { '40:0': 2 } });
        const wallsR = {}; for (let n = 0; n < 60; n++) wallsR[((n * 7) % 30 - 15 + 20) + ',' + ((n * 11) % 30 - 15 + 20)] = 1;
        const vR = { x: 1025, y: 1025, range: 2, arc: 360 }, flB = seenCells(vR, sq, wallsR, { level: 2 }), flRef = VC(Object.assign({}, vR, { range: 60 }), sq, wallsR);
        const hWall = {}; for (let r = -12; r <= 12; r++) hWall['5:' + r] = 1;
        const hLit = litLevels([{ cell: { q: 2, r: 3 }, bright: 4, dim: 6 }], hx, hWall), hNear = seenCells({ x: hxV.x, y: hxV.y, range: 0, arc: 360 }, hx, hWall, { level: 0, lit: hLit });
        const hBack = cellCenter({ q: 8, r: 0 }, hx), hBehind = seenCells({ x: hBack.x, y: hBack.y, range: 0, arc: 360 }, hx, hWall, { level: 0, lit: hLit });
        check('Lighting: a dim-only light lights its own cell dim too; a wall just past a token\'s sight stays unseen on a dark map whatever lamp burns elsewhere (square and hex); on a bright or dim map every wall face in line of sight shows at the map\'s light; on hex a wall shows lit on its lamp side and never from behind',
            lDim['5,5'] === 1 && lDim['7,5'] === 1 && tAtR(dNo, '6,2') === 0 && tAtR(dFar, '6,2') === 0 && tAtR(dHx, '4:0') === 0
            && flB.length === flRef.length && flB.every(o => o.tier === 2) && keysT(flB) === keysT(flRef.map(o => ({ key: o.key, tier: 2 })))
            && hNear.some(o => hWall[o.key] && o.tier >= 1) && !hBehind.some(o => hWall[o.key]), lj([lDim['5,5'], tAtR(dFar, '6,2'), tAtR(dHx, '4:0'), flB.length, flRef.length]));
        const vL = { x: 125, y: 125, range: 2, arc: 360 }, litD = { '20,2': 2, '21,2': 1 }, wall10 = {}; for (let r = 0; r <= 12; r++) wall10['10,' + r] = 1;
        const sL = seenCells(vL, sq, null, { level: 0, lit: litD }), sLw = seenCells(vL, sq, wall10, { level: 0, lit: litD }), sL0 = seenCells(vL, sq, null, { level: 0, lit: {} });
        const litE = litLevels([{ cell: { c: 12, r: 2 }, bright: 3, dim: 3 }], sq, wall10), vE = { x: 775, y: 125, range: 0, arc: 360 }, vW = { x: 275, y: 125, range: 0, arc: 360 };
        const litE2 = litLevels([{ cell: { c: 12, r: 2 }, bright: 1, dim: 4 }], sq, wall10), sE2 = seenCells({ x: 775, y: 175, range: 0, arc: 360 }, sq, wall10, { level: 0, lit: litE2 }), sBd = seenCells(vL, sq, null, { level: 2, lit: { '20,2': 1 } });
        const sE = seenCells(vE, sq, wall10, { level: 0, lit: litE }), sW = seenCells(vW, sq, wall10, { level: 0, lit: litE }), tAt = (arr, k) => { const o = arr.find(e => e.key === k); return o ? o.tier : 0; };
        check('Lighting: on a dark map a token sees a lit cell anywhere in its line of sight at its light (bright or dim), never one behind a wall; no light at all is its sight alone; a wall shows lit only from the side its light falls on (its near face, at the brightest of its lit neighbours), never from behind; a dim-lit cell on a bright map is bright',
            tAt(sL, '20,2') === 2 && tAt(sL, '21,2') === 1 && tAt(sL, '10,2') === 0 && tAt(sL, '3,2') === 2 && tAt(sLw, '20,2') === 0 && keysT(sL0) === keysT(seenCells(vL, sq, null))
            && tAt(sE, '10,2') === 2 && tAt(sE, '11,2') === 2 && tAt(sW, '10,2') === 0 && tAt(sW, '11,2') === 0 && sW.length === 1
            && tAt(sE2, '11,2') === 2 && tAt(sE2, '11,3') === 1 && tAt(sE2, '10,3') === 2 && tAt(sBd, '20,2') === 2,
            lj([tAt(sL, '20,2'), tAt(sLw, '20,2'), tAt(sE, '10,2'), tAt(sW, '10,2'), sW.length]));
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
        const lightV = VF({ whiteboard: [{ id: 'lv', type: 'light', isChar: true, ownerId: 'u_a', x: 0, y: 0, light: { bright: 2, dim: 2 } }, { id: 'b2', isChar: true, ownerId: 'u_a', x: 100, y: 0 }] }, {}, 'u_a');
        check('Lighting: a light source never sees for anyone, even one marked as a player\'s character', lightV.length === 1, JSON.stringify(lightV));
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
        const ltToasts = []; let ltGm = true, ltClient = false, ltGrid = grid, ltCore = FC;
        const LT = new Function('core', 'vtt', 'mapFog', 'gridForMap', 'viewersFor', 'fogFeatureOn', 'fogMask', 'inMask', 'toast', 'isGmView', 'isClientView', "'use strict';" + NL
            + lineOf('function lightingOn()') + lineOf('function placedLights(') + cut('function mapLevel(') + lineOf('var _blockerCache = Object.create(null)') + lineOf('var _blockerSig = Object.create(null)')
            + lineOf('var UNIT_YD = ') + cut('function cellYardsForMap(') + lineOf('var _litCache = Object.create(null)') + cut('function lightSources(') + cut('function litFor(') + lineOf('function lightCount(')
            + cut('function eligibleBlocker(') + cut('function footprintCells(') + cut('function blockersFor(') + lineOf('var _viewCache = Object.create(null), _viewCells = 0') + cut('function viewSeen(') + cut('function revealedTiers(') + cut('function revealedCellList(') + cut('function fogDropIds(') + cut('function fogLitFor(') + cut('function litOf(')
            + NL + 'return { fogLitFor: fogLitFor, lightSources: lightSources, litFor: litFor, lightCount: lightCount, mapLevel: mapLevel, blockersFor: blockersFor, viewSeen: viewSeen, revealedTiers: revealedTiers, revealedCellList: revealedCellList, fogDropIds: fogDropIds, reset: function() { _viewCache = Object.create(null); _viewCells = 0; }, cells: function() { return _viewCells; }, setBudget: function(n) { VIEW_BUDGET = n; } };')(
            () => ltCore, () => ({ on: f => f === 'lighting' ? litOn : true }), m => m.fog, () => ltGrid, (m, camp, owner) => m.viewers.filter(v => owner === '*' || v.owner === owner), () => true, () => ({ mode: 'all' }), () => true, t => ltToasts.push(t), () => ltGm, () => ltClient);
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
            new Function('screenEl', 'placeScreen', 'ui', 'core', 'active', 'activeMap', 'activeCamp', 'gridForMap', 'fogMask', 'revealedTiers', 'drawOwner', 'isClientView', 'state', 'hexPath', 'drawCaptions', "'use strict';" + NL + cut('function draw(') + NL + 'return draw;')(
                () => scr, () => {}, () => ({ scrollLeft: 0, scrollTop: 0 }), () => FC, () => true, () => ({}), () => ({}), () => grid, () => ({ mode: 'all' }), () => tiersRes, () => '*', () => true, { zoomLevel: 1 }, () => {}, (c2, s2) => { rec.push({ captions: c2 === cx && s2 === scr }); })();
            drawRun.captions = rec.filter(r => r.captions !== undefined); return rec.filter(r => !r.base && r.captions === undefined); };
        const cellsT = [[0, 0, 2], [1, 0, 1], [2, 0, 1], [3, 0, 2], [4, 0, 2]], tiersMix = { list: cellsT.map(([c, r]) => ({ key: c + ',' + r, cell: { c, r } })), keys: {} }; cellsT.forEach(([c, r, t]) => { tiersMix.keys[c + ',' + r] = t; });
        const tiersClear = { list: tiersMix.list, keys: Object.fromEntries(Object.keys(tiersMix.keys).map(k => [k, 2])) }, pm = drawRun(tiersMix), pc = drawRun(tiersClear);
        {   // L4: the names of the light under targeted tokens, drawn over the fog (drawCaptions, run strict on a recording canvas and a stubbed page)
            const capRun = (marks, ctxMore) => { const rec = [], cx = Object.assign({ save() {}, restore() {}, beginPath() {}, rect() { rec.push(['rect'].concat([].slice.call(arguments).map(Math.round))); }, fill() {}, stroke() {}, measureText: t => ({ width: t.length * 6 }), fillText() { rec.push(['text'].concat([].slice.call(arguments))); } }, ctxMore), asked = [];
                const doc = { querySelectorAll: q => { asked.push(q); return marks.map(m => ({ dataset: m.cap === undefined ? {} : { lightCap: m.cap }, getBoundingClientRect: () => ({ left: m.x, top: m.y, width: 60, height: 52, right: m.x + 60, bottom: m.y + 52 }) })); } };
                new Function('document', "'use strict';" + NL + lineOf('var CAPTIONS_MOST = ') + cut('function drawCaptions(') + NL + 'return drawCaptions;')(doc)(cx, { getBoundingClientRect: () => ({ left: 100, top: 50, width: 800, height: 600 }) }); return { rec, asked, font: cx.font, align: cx.textAlign }; };
            const HOST = '<img src=x onerror=alert(1)>', one = capRun([{ x: 300, y: 200, cap: 'Dim light (-1 to -8)' }]), hostile = capRun([{ x: 300, y: 200, cap: HOST }]), none = capRun([]), blank = capRun([{ x: 300, y: 200, cap: '' }, { x: 300, y: 200 }]);
            const off = capRun([{ x: -900, y: 200, cap: 'Dim' }, { x: 300, y: 5000, cap: 'Dim' }, { x: 2000, y: 200, cap: 'Dim' }, { x: 300, y: -400, cap: 'Dim' }]), many = capRun(Array.from({ length: 60 }, (_, i) => ({ x: 120 + i * 5, y: 200, cap: 'L' + i }))), long = capRun([{ x: 300, y: 200, cap: 'x'.repeat(500) }]), noText = capRun([{ x: 300, y: 200, cap: 'Dim' }], { fillText: undefined });
            check('Lighting: the name of the light under a targeted token is drawn on the fog\'s overlay, over the fog — under the token where it is on screen now (centred, a little below its box), as text and nothing else (words that look like markup are drawn as they are), for the tokens the board marked and no others; nothing for a blank mark or one off the board\'s view, at most forty, a long one cut; the overlay draws them after the fog, once',
                lj(one.asked) === lj(['#whiteboardWrap .wb-item[data-light-cap]']) && lj(one.rec) === lj([['rect', 163, 206, 134, 17], ['text', 'Dim light (-1 to -8)', 230, 214.5, 346]]) && one.align === 'center' && /11px/.test(one.font)
                && hostile.rec.length === 2 && hostile.rec[1][1] === HOST && none.rec.length === 0 && blank.rec.length === 0 && off.rec.length === 0 && many.rec.filter(r => r[0] === 'text').length === 40 && long.rec[1][1].length === 200 && long.rec[0][3] === 360 && noText.rec.length === 0
                && /\n    ctx\.restore\(\);\n    drawCaptions\(ctx, s\);\n\}\n/.test(fogSrc) && (fogSrc.match(/drawCaptions\(/g) || []).length === 2 && (() => { drawRun({ list: [], keys: {} }); return lj(drawRun.captions) === lj([{ captions: true }]); })(), lj([one.rec, hostile.rec, off.rec.length, many.rec.length]));
        }
        check('Lighting: the overlay punches the dim cells part-way in one pass and the clear or bright ones fully in the next (drawn for real on a recording canvas); with no dim cell, one full pass as before',
            lj(pm) === lj([{ op: 'destination-out', style: 'rgba(0,0,0,0.5)', n: 2 }, { op: 'destination-out', style: 'rgba(0,0,0,1)', n: 3 }]) && lj(pc) === lj([{ op: 'destination-out', style: 'rgba(0,0,0,1)', n: 5 }]), lj([pm, pc]));
        check('Lighting: the fog menu sets a map\'s light (Auto, Bright, Dim, Dark) only while Lighting is on, saved, and follows the switch while open; window.wpFog reports it; a save or a received change no longer clears the viewer memo',
            /var lrow = ui\('fogLightRow'\); if \(lrow\) lrow\.style\.display = lightingOn\(\) \? '' : 'none';/.test(fogSrc)
            && /if \(lsel\.value === 'bright' \|\| lsel\.value === 'dim' \|\| lsel\.value === 'dark'\) mf\.light = lsel\.value; else delete mf\.light;\n\s*save\(\); invalidateVision\(\); syncMenu\(\); redraw\(\);/.test(fogSrc) && /lightLevel: mapLevel,/.test(fogSrc)
            && /<div id="fogLightRow" style="display:none;">[\s\S]{0,700}<select id="fogLight"[^>]*>\s*<option value="auto">Auto &mdash; lit until you place a light<\/option>\s*<option value="bright">Bright<\/option>\s*<option value="dim">Dim<\/option>\s*<option value="dark">Dark<\/option>/.test(ixF)
            && /id="setLightingBtn"/.test(ixF) && /id="setVttGlobalLightingBtn"/.test(ixF) && /function invalidateVision\(\) \{ _coverCache = Object\.create\(null\);/.test(fogSrc) && !/_viewCache = Object\.create\(null\); _coverCache/.test(fogSrc)
            && /var fmu = ui\('fogMenu'\); if \(showBtn && fmu && fmu\.classList\.contains\('show'\)\) syncMenu\(\);/.test(fogSrc) && /until you place a light/.test(ixF));
        const inF = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, NL);
        check('Lighting: a token\'s Properties never offer Blocks sight (a token never blocks sight, as the fog rule says)',
            /\(\['rect','hexagon','circle','diamond'\]\.indexOf\(w\.type\) >= 0 && !w\.hidden && !w\.isChar && !w\.waiting \? '<div class="field check-row"><input type="checkbox" id="wbBlocksSight"/.test(inF));
        // L2: a map's light sources, their lit cells and what a player sees by them
        const lampAt = (id, x, y, light, extra) => Object.assign({ id: id, type: 'light', x: x, y: y, w: 40, h: 40, light: light }, extra || {});
        const lsMap = lmap({}, [lampAt('l1', 505, 105, { bright: 5, dim: 10 }), lampAt('l2', 1005, 105, { bright: 5, dim: 10, off: true }), lampAt('l3', 1505, 105, { bright: 5, dim: 10 }, { hidden: true }), { id: 't1', isChar: true, x: 2000, y: 100, w: 50, h: 50, light: { bright: 2, dim: 2 } }, lampAt('l4', 505, 505, { bright: 0, dim: 0 }), { id: 'wlS', type: 'rect', x: 2500, y: 100, w: 50, h: 50, blocksSight: true }, lampAt('l5', 2505, 105, { bright: 3, dim: 3 })]);
        const srcs = LT.lightSources(lsMap, grid, LT.blockersFor(lsMap, grid)), srcK = srcs.map(s => FC.cellKey(s.cell, grid) + ':' + s.bright + ':' + s.dim);
        check('Lighting: a map\'s light sources — a placed light and a token\'s own light, never a hidden one, one switched off or one with no light; radii from yards to the map\'s cells (5 ft squares: 5 yd = 3 cells); one inside a wall lights from the open cell beside it; lightCount counts every light there is (one switched off too, never a hidden one or one with no light)',
            lj(srcK.slice(0, 2)) === lj(['10,2:3:6', '40,2:1:1']) && srcs.length === 3 && srcK[2] !== '50,2:2:2' && /:2:2$/.test(srcK[2]) && LT.lightCount(lsMap) === 4, lj([srcK, LT.lightCount(lsMap)]));
        const lf1 = LT.litFor(lsMap, grid, LT.blockersFor(lsMap, grid)), lf2 = LT.litFor(lsMap, grid, LT.blockersFor(lsMap, grid));
        lsMap.whiteboard[0].x = 705; const lf3 = LT.litFor(lsMap, grid, LT.blockersFor(lsMap, grid)); lsMap.whiteboard[0].x = 505;
        check('Lighting: the lit cells are worked out once per set of lights (the same answer while nothing moves), afresh when a light moves; a map with no light has none',
            lf1 === lf2 && lf3 !== lf1 && lf3.ver === lf1.ver + 1 && lf1.lit['10,2'] === 2 && lf1.lit['15,2'] === 1 && lf3.lit['14,2'] === 2 && LT.litFor(lmap({}, []), grid, null) === null);
        const many = []; for (let i = 0; i < 201; i++) many.push(lampAt('m' + i, 50 * i + 5, 2005, { bright: 1, dim: 1 }));
        ltToasts.length = 0; const manyMap = lmap({}, many), capS = LT.lightSources(manyMap, grid, null), capS2 = LT.lightSources(manyMap, grid, null);
        const two00 = many.slice(0, 200), s200 = LT.lightSources(lmap({}, two00), grid, null); ltGm = false; const t0n = ltToasts.length, capP = LT.lightSources(lmap({}, many), grid, null); ltGm = true;
        check('Lighting: past the light-source cap (200) a map reads dark, and the GM is told once (200 still shine; a player\'s machine is never told)', capS.length === 0 && capS2.length === 0 && ltToasts.length === 1 && /Too many light sources/.test(ltToasts[0]) && s200.length === 200 && capP.length === 0 && ltToasts.length === t0n, lj(ltToasts));
        // review L2: a light's side of a wall, its origin, a dim-only light, a GM-note card, the walk cap, walls over the cap, a light that is not a creature
        const pvQ = { x: 125, y: 125, range: 0, arc: 360, owner: 'p1' };
        const wallC = { id: 'wC', type: 'rect', x: 350, y: 0, w: 50, h: 600, blocksSight: true }, sideOf = (x, extra) => { const mp = lmap({}, [wallC, lampAt('s', x, 105, { bright: 2, dim: 2 }, extra)]); const s = LT.lightSources(mp, grid, LT.blockersFor(mp, grid)); return s.length ? FC.cellKey(s[0].cell, grid) : null; };
        const bigLamp = lmap({}, [lampAt('big', 500, 100, { bright: 5, dim: 10 }, { w: 150, h: 150 }), { id: 'ogre', isChar: true, x: 1000, y: 1000, w: 100, h: 100, light: { bright: 2, dim: 2 } }]), bigK = LT.lightSources(bigLamp, grid, null).map(s => FC.cellKey(s.cell, grid));
        const dimOnly = LT.lightSources(lmap({}, [lampAt('do', 505, 105, { bright: 0, dim: 6 })]), grid, null), noteLamp = lmap({}, [lampAt('nl', 505, 105, { bright: 5, dim: 10 }, { gmNoteFor: 'r1' })]);
        check('Lighting: a light in a wall lights the side it hangs on (its centre east of the wall cell\'s: east; west: west; centred on the cell: the side it faces); its origin is its centre; a dim-only light stays dim at its own cell; a GM-note card gives no light and never darkens a map',
            sideOf(372) === '8,2' && sideOf(352) === '6,2' && sideOf(355, { w: 40, h: 40 }) === '6,2' && sideOf(355, { y: 55, rot: 90 }) === '8,1' && sideOf(355, { y: 55, rot: 270 }) === '6,1' && lj(bigK) === lj(['11,3', '21,21']) && dimOnly.length === 1 && dimOnly[0].bright === -1
            && LT.lightSources(noteLamp, grid, null).length === 0 && LT.lightCount(noteLamp) === 0 && LT.mapLevel(noteLamp) === 2, lj([sideOf(372), sideOf(352), sideOf(355, { y: 55, rot: 90 }), sideOf(355, { y: 55, rot: 270 }), bigK, dimOnly]));
        ltToasts.length = 0; const farMap = lmap({}, Array.from({ length: 12 }, (x, i) => lampAt('f' + i, i * 5000 + 5, 5, { bright: 100, dim: 100 })), [pvQ]), tFar = LT.revealedTiers(farMap, {}, 'p1'), tFar2 = LT.revealedTiers(farMap, {}, 'p1');
        check('Lighting: lights that reach too far to work out together leave the map dark (by sight alone), and the GM is told once', ltToasts.filter(t => /reach too far/.test(t)).length === 1 && Object.keys(tFar.keys).every(k => tFar.keys[k] === 2) && Object.keys(tFar.keys).length === 1 && Object.keys(tFar2.keys).length === 1, lj(ltToasts));
        const hugeWall = { id: 'hw', type: 'rect', x: 0, y: 3000, w: 50 * 100, h: 50 * 61, blocksSight: true }, overMap = lmap({}, [hugeWall, lampAt('ol', 1005, 105, { bright: 3, dim: 6 })], [pvQ]); LT.reset();
        const tOver = LT.revealedTiers(overMap, {}, 'p1'), overB = lmap({ light: 'bright' }, [hugeWall], [pvQ]), tOverB = LT.revealedTiers(overB, {}, 'p1');
        check('Lighting: with walls past their cap (no wall blocks), no light and no map light is judged through them: the map reads by sight alone',
            Object.keys(tOver.keys).length === 1 && tOver.keys['2,2'] === 2 && Object.keys(tOverB.keys).length === 1, lj([Object.keys(tOver.keys).length, Object.keys(tOverB.keys).length]));
        const lampChar = lampAt('lc', 2005, 105, { bright: 1, dim: 1, off: true }, { isChar: true, ownerId: 'gm' }), lcMap = lmap({ light: 'dark' }, [lampChar], [pvQ]);
        check('Lighting: a light source is never a creature — never dropped from a player\'s copy nor a viewer, even marked as a character', LT.fogDropIds('p1', {}, lcMap) === null);
        const torchMap = lmap({}, [{ id: 'tt', isChar: true, ownerId: 'p1', x: 100, y: 100, w: 50, h: 50, light: { bright: 5, dim: 10 } }, { id: 'foeT', isChar: true, ownerId: 'gm', x: 1000, y: 100, w: 50, h: 50 }], [pvQ]);
        LT.reset(); const torchDark = lmap({ light: 'dark' }, torchMap.whiteboard, [pvQ]), tTorch = LT.revealedTiers(torchDark, {}, 'p1');
        check('Lighting: a token\'s own light never darkens an auto map (a lit map still shows the far creature); on a dark map the torch lights the cells around its bearer, bright then dim',
            LT.mapLevel(torchMap) === 2 && LT.fogDropIds('p1', {}, torchMap) === null && tTorch.keys['4,2'] === 2 && tTorch.keys['7,2'] === 1 && tTorch.keys['9,2'] === undefined, lj([tTorch.keys['4,2'], tTorch.keys['7,2']]));
        // the lit memo follows a door and a radius; walls stop a lamp end to end; a lamp on a dim map
        LT.reset(); const doorL = { id: 'dr', type: 'rect', x: 600, y: 0, w: 50, h: 250, blocksSight: true, sightType: 'door', doorOpen: true }, foeD = { id: 'foeD', isChar: true, ownerId: 'gm', x: 650, y: 100, w: 50, h: 50 }, pvD = { x: 825, y: 425, range: 1, arc: 360, owner: 'p1' };
        const dmap = lmap({}, [lampAt('dl', 505, 105, { bright: 5, dim: 10 }), doorL, foeD], [pvD]), lfO = LT.litFor(dmap, grid, LT.blockersFor(dmap, grid)), dropO = LT.fogDropIds('p1', {}, dmap), tO = LT.revealedTiers(dmap, {}, 'p1');
        doorL.doorOpen = false; dmap.meta.updated = 2; const lfC = LT.litFor(dmap, grid, LT.blockersFor(dmap, grid)), dropC = LT.fogDropIds('p1', {}, dmap), tC = LT.revealedTiers(dmap, {}, 'p1');
        dmap.whiteboard[0].light = { bright: 1, dim: 1 }; const lfR = LT.litFor(dmap, grid, LT.blockersFor(dmap, grid));
        check('Lighting: the lamp\'s lit cells follow a door (open: its light passes and the creature past it shows; closed: dark beyond, the creature dropped) and a new radius',
            lfO.lit['13,2'] >= 1 && dropO === null && tO.keys['13,2'] >= 1 && lfC !== lfO && lfC.ver === lfO.ver + 1 && lfC.lit['13,2'] === undefined && tC.keys['13,2'] === undefined && !!dropC && dropC.foeD === 1 && lfR !== lfC && lfR.lit['12,2'] === undefined,
            lj([lfO.lit['13,2'], dropO, lfC.lit['13,2'], dropC]));
        LT.reset(); const wmap = lmap({}, [lampAt('lw', 505, 105, { bright: 5, dim: 10 }), { id: 'wW', type: 'rect', x: 600, y: 0, w: 50, h: 650, blocksSight: true }, { id: 'foeW', isChar: true, ownerId: 'gm', x: 650, y: 100, w: 50, h: 50 }], [{ x: 825, y: 125, range: 0, arc: 360, owner: 'p1' }]);
        const tW = LT.revealedTiers(wmap, {}, 'p1'), dropWW = LT.fogDropIds('p1', {}, wmap);
        LT.reset(); const dimMap = lmap({ light: 'dim' }, [lampAt('dm', 1005, 105, { bright: 3, dim: 3 })], [pvQ]), tDm = LT.revealedTiers(dimMap, {}, 'p1');
        check('Lighting: end to end, a wall between a lamp and a player keeps its light and the creature beyond from them; a lamp on a dim map lights its cells bright while the rest stays dim',
            tW.keys['13,2'] === undefined && tW.keys['12,2'] === undefined && !!dropWW && dropWW.foeW === 1 && tDm.keys['20,2'] === 2 && tDm.keys['12,2'] === 1, lj([tW.keys['13,2'], dropWW, tDm.keys['20,2'], tDm.keys['12,2']]));
        // L3 (owner answer 2): a torch round a corner — the host sends a player only the lit cells they see, never its carrier
        const cornerWall = { id: 'cw', type: 'rect', x: 500, y: 0, w: 50, h: 250, blocksSight: true }, pvC = { x: 125, y: 275, range: 0, arc: 360, owner: 'p1' };
        const carrier = { id: 'carrier', isChar: true, ownerId: 'gm', x: 600, y: 100, w: 50, h: 50, light: { bright: 5, dim: 10 } }, meC = { id: 'meC', isChar: true, ownerId: 'p1', x: 100, y: 250, w: 50, h: 50 };
        LT.reset(); const cMap = lmap({ light: 'dark' }, [cornerWall, carrier, meC], [pvC]), cDrop = LT.fogDropIds('p1', {}, cMap), cFl = LT.fogLitFor('p1', {}, cMap, cDrop), hostT = LT.revealedTiers(cMap, {}, 'p1');
        const copyFor = (fl) => { const cp = lmap({ light: 'dark' }, cMap.whiteboard.filter(w => !(cDrop && cDrop[w.id])), [pvC]); if (fl) cp.fogLit = FC.cleanFogLit(fl.lit); return cp; };
        ltClient = true; LT.reset(); const cliT = LT.revealedTiers(copyFor(cFl), {}, 'p1'); LT.reset(); const cliNo = LT.revealedTiers(copyFor(null), {}, 'p1'); ltClient = false;
        const keyTier = t => Object.keys(t.keys).sort().map(k => k + ':' + t.keys[k]).join(' ');
        check('Lighting: a torch carried round a corner (its bearer dropped from the player\'s copy) — the host sends that player the lit cells they see and their level, never the bearer, its light or where it stands; with them the player\'s own copy sees exactly what the host rules they see (without, less)',
            !!cDrop && cDrop.carrier === 1 && !!cFl && !cFl.capped && cFl.lit.length > 0 && cFl.lit.every(e => Object.keys(e).sort().join() === 'c,r,t' && (e.t === 1 || e.t === 2) && hostT.keys[e.c + ',' + e.r] >= 1)
            && !cFl.lit.some(e => e.c === 12 && e.r === 2) && !JSON.stringify(cFl).includes('carrier') && keyTier(cliT) === keyTier(hostT) && keyTier(cliNo) !== keyTier(hostT), lj([cDrop, cFl && cFl.lit.length, keyTier(cliT) === keyTier(hostT)]));
        LT.reset(); const seenCarrier = LT.fogLitFor('p1', {}, lmap({ light: 'bright' }, [carrier, meC], [pvC]), null), noLight = LT.fogLitFor('p1', {}, lmap({ light: 'dark' }, [cornerWall, meC], [pvC]), { x: 1 });
        litOn = false; const flOff = LT.fogLitFor('p1', {}, cMap, cDrop); litOn = true;
        const capMap = lmap({}, many.concat([meC]), [pvC]), flCap = LT.fogLitFor('p1', {}, capMap, { m0: 1 });
        ltClient = true; LT.reset(); const capCopy = lmap({}, many.slice(0, 3).concat([meC]), [pvC]); capCopy.lightsCapped = true; const tCapCli = LT.revealedTiers(capCopy, {}, 'p1'); const capCopy2 = lmap({}, many.slice(0, 3).concat([meC]), [pvC]); const tCapCli2 = LT.revealedTiers(capCopy2, {}, 'p1'); ltClient = false;
        check('Lighting: nothing extra goes to a player whose copy already holds every light (nobody unseen carries one), on a map with no light, or with Lighting off; past the host\'s light cap their copy is told so, and reads dark as the host\'s does (their own lights ignored)',
            seenCarrier === null && noLight === null && flOff === null && !!flCap && flCap.capped === true && flCap.lit.length === 0 && Object.keys(tCapCli.keys).length === 1 && Object.keys(tCapCli2.keys).length > 1, lj([seenCarrier, noLight, flOff, flCap, Object.keys(tCapCli.keys).length]));
        // L3 edges: the host never reads a fogLit; a player's own light and the host's cells take the brighter; a new fogLit is read afresh; a
        // player's own visible lamp lighting the same cells sends nothing; Lighting off sends nothing even where their sight reaches
        LT.reset(); const hostFl = lmap({ light: 'dark' }, [meC], [pvC]); hostFl.fogLit = [{ c: 12, r: 5, t: 2 }]; const tHostFl = LT.revealedTiers(hostFl, {}, 'p1');
        ltClient = true; LT.reset(); const mixC = lmap({ light: 'dark' }, [meC, lampAt('own', 555, 255, { bright: 2, dim: 2 })], [pvC]); mixC.fogLit = [{ c: 11, r: 5, t: 1 }]; const lfMix = LT.litFor(mixC, grid, LT.blockersFor(mixC, grid));
        const swapC = lmap({ light: 'dark' }, [meC], [pvC]); swapC.fogLit = [{ c: 8, r: 5, t: 2 }]; const tSwapA = LT.revealedTiers(swapC, {}, 'p1'); swapC.fogLit = [{ c: 9, r: 5, t: 2 }]; const tSwapB = LT.revealedTiers(swapC, {}, 'p1');
        const swB = LT.blockersFor(swapC, grid), lcSw1 = LT.litFor(swapC, grid, swB); swapC.fogLit = [{ c: 9, r: 5, t: 2 }]; const lcSw2 = LT.litFor(swapC, grid, swB); swapC.fogLit = [{ c: 9, r: 5, t: 1 }]; const lcSw3 = LT.litFor(swapC, grid, swB); ltClient = false;
        LT.reset(); const ownLampMap = lmap({ light: 'dark' }, [cornerWall, carrier, meC, lampAt('vis', 555, 255, { bright: 10, dim: 10 })], [pvC]), olDrop = LT.fogDropIds('p1', {}, ownLampMap), olFl = LT.fogLitFor('p1', {}, ownLampMap, olDrop);
        const pvWide = Object.assign({}, pvC, { range: 20 }); litOn = false; LT.reset(); const wideMap = lmap({ light: 'dark' }, [cornerWall, carrier, meC], [pvWide]), flOffWide = LT.fogLitFor('p1', {}, wideMap, { carrier: 1 }); litOn = true;
        check('Lighting: the host never reads a lit-cells list off a map (only a player\'s copy does); a player\'s copy lights a cell at the brighter of its own light and the host\'s; a new list is read afresh (the same cells re-sent keep what was worked out); a player whose own lamp already lights those cells as brightly gets nothing extra; Lighting off sends nothing even where their sight reaches',
            tHostFl.keys['12,5'] === undefined && lfMix.lit['11,5'] === 2 && tSwapA.keys['8,5'] === 2 && tSwapA.keys['9,5'] === undefined && tSwapB.keys['9,5'] === 2 && tSwapB.keys['8,5'] === undefined && lcSw2 === lcSw1 && lcSw3 !== lcSw2 && lcSw3.lit['9,5'] === 1
            && (olFl === null || !olFl.lit.some(e => e.r === 5 && e.c >= 9 && e.c <= 13)) && flOffWide === null, lj([tHostFl.keys['12,5'], lfMix.lit['11,5'], tSwapB.keys['9,5'], olFl, flOffWide]));
        // L3 review: the lit cells come only from the recipient's tokens' line of sight on an Auto map — a manual reveal, cover mode and a player
        // with no token on the map get none; every cell sent is one a token of theirs sees
        const unionSeen = (m, owner) => { const b = LT.blockersFor(m, ltGrid), lv = LT.mapLevel(m), lc = LT.litFor(m, ltGrid, b), u = {}; m.viewers.filter(v => v.owner === owner).forEach(v => LT.viewSeen(m, ltGrid, b, lv, v, lc).forEach(o => { u[o.key] = 1; })); return u; };
        LT.reset(); const pvFar = { x: 125, y: 475, range: 0, arc: 360, owner: 'p1' }, manMap = lmap({ light: 'dark', manual: { adds: [{ c: 12, r: 1 }, { c: 13, r: 1 }, { c: 13, r: 2 }], cuts: [] } }, [cornerWall, carrier, meC], [pvFar]);
        const flMan = LT.fogLitFor('p1', {}, manMap, LT.fogDropIds('p1', {}, manMap) || { carrier: 1 }), tMan = LT.revealedTiers(manMap, {}, 'p1'), manSeen = unionSeen(manMap, 'p1');
        LT.reset(); const boxed = [{ id: 'bx1', type: 'rect', x: 0, y: 400, w: 300, h: 50, blocksSight: true }, { id: 'bx2', type: 'rect', x: 0, y: 550, w: 300, h: 50, blocksSight: true }, { id: 'bx3', type: 'rect', x: 250, y: 450, w: 50, h: 100, blocksSight: true }];
        const boxMap = lmap({ light: 'dark', manual: { adds: [{ c: 12, r: 2 }], cuts: [] } }, [cornerWall, carrier, meC].concat(boxed), [pvFar]), flBox = LT.fogLitFor('p1', {}, boxMap, { carrier: 1 }), tBox = LT.revealedTiers(boxMap, {}, 'p1');
        const flCover = LT.fogLitFor('p1', {}, lmap({ light: 'dark', mode: 'cover' }, [cornerWall, carrier, meC], [pvC]), { carrier: 1 }), flNobody = LT.fogLitFor('p1', {}, lmap({ light: 'dark' }, [cornerWall, carrier], []), { carrier: 1 });
        const flReveal = LT.fogLitFor('p1', {}, lmap({ light: 'dark', mode: 'reveal' }, [cornerWall, carrier, meC], [pvC]), { carrier: 1 }), cSeen = unionSeen(cMap, 'p1');
        check('Lighting: the lit cells a player is sent come only from their tokens\' line of sight on an Auto map — a GM\'s manual reveal of lit cells sends none (the reveal shows them, their light never travels), nor cover or reveal mode, nor a player with no token there; every cell sent is one their tokens see',
            tMan.keys['13,1'] === 2 && !!flMan && flMan.lit.every(e => manSeen[e.c + ',' + e.r] === 1) && !flMan.lit.some(e => ['12,1', '13,1', '13,2'].includes(e.c + ',' + e.r)) && tBox.keys['12,2'] === 2 && flBox === null && flCover === null && flNobody === null && flReveal === null && !!cFl && cFl.lit.every(e => cSeen[e.c + ',' + e.r] === 1), lj([tMan.keys['13,1'], tBox.keys['12,2'], flMan && flMan.lit.filter(e => ['12,1', '13,1', '13,2'].includes(e.c + ',' + e.r)), flBox, flCover, flNobody, flReveal]));
        // the floods: a re-send while nothing moved floods nothing; only the dropped lights flood before the player's sight is known
        let floods = 0; ltCore = Object.assign({}, FC, { litLevels: function() { floods++; return FC.litLevels.apply(null, arguments); } });
        LT.reset(); const rsMap = lmap({ light: 'dark' }, [cornerWall, carrier, meC, lampAt('own2', 105, 405, { bright: 2, dim: 2 })], [pvC]), rsDrop = { carrier: 1 };
        const rsA = LT.fogLitFor('p1', {}, rsMap, rsDrop), fl1 = floods, rsB = LT.fogLitFor('p1', {}, rsMap, rsDrop), fl2 = floods;
        carrier.light = { bright: 2, dim: 10 }; const rsC = LT.fogLitFor('p1', {}, rsMap, rsDrop), fl3 = floods;
        const rsFresh = LT.fogLitFor('p1', {}, lmap({ light: 'dark' }, rsMap.whiteboard.map(w => Object.assign({}, w)), [pvC]), rsDrop); carrier.light = { bright: 5, dim: 10 };
        LT.reset(); const plainFoe = { id: 'plainFoe', isChar: true, ownerId: 'gm', x: 600, y: 100, w: 50, h: 50 }, flPlain = LT.fogLitFor('p1', {}, lmap({ light: 'dark' }, [cornerWall, plainFoe, meC, lampAt('own3', 105, 405, { bright: 2, dim: 2 })], [pvC]), { plainFoe: 1 }), cellsPlain = LT.cells();
        floods = 0; LT.reset(); const rsNo = LT.fogLitFor('p1', {}, lmap({ light: 'dark' }, [cornerWall, carrier, meC], []), rsDrop), fl4 = floods; ltCore = FC;
        check('Lighting: a player\'s lit cells are worked out without flooding again when nothing moved (the lights they miss and their own light are each kept per map on their sources); a changed radius floods afresh and answers as a fresh map does; a player with no token there floods only the map\'s own light; an unseen creature with no light costs no one\'s sight',
            !!rsA && lj(rsA) === lj(rsB) && fl2 === fl1 && fl3 > fl2 && !!rsC && lj(rsC) !== lj(rsA) && lj(rsC) === lj(rsFresh) && rsNo === null && fl4 <= 1 && flPlain === null && cellsPlain === 0, lj([fl1, fl2, fl3, fl4, rsC && rsC.lit.length, rsA && rsA.lit.length, cellsPlain]));
        // a waiting token never carries a light (its copy on the wire has none, so host and player would part)
        LT.reset(); const waitLit = lmap({ light: 'dark' }, [{ id: 'wt', waiting: 1, ownerId: 'p2', x: 600, y: 100, w: 50, h: 50, light: { bright: 5, dim: 10 } }, meC], [pvQ]);
        check('Lighting: a waiting token carries no light (the host reads none, so nothing goes to a player about it)', LT.lightSources(waitLit, grid, LT.blockersFor(waitLit, grid)).length === 0 && LT.fogLitFor('p1', {}, waitLit, { wt: 1 }) === null && LT.mapLevel(waitLit) === 0);
        // a manual cut beside a lit wall: the cut cell's light still reaches the player's copy, so the wall's face reads the same on both sides
        LT.reset(); const cutMap = lmap({ light: 'dark', manual: { adds: [], cuts: [{ c: 9, r: 5 }] } }, [cornerWall, carrier, meC], [Object.assign({}, pvC, { range: 20 })]), cutDrop = LT.fogDropIds('p1', {}, cutMap) || { carrier: 1 };
        const cutFl = LT.fogLitFor('p1', {}, cutMap, cutDrop), cutHost = LT.revealedTiers(cutMap, {}, 'p1');
        const cutCopy = lmap({ light: 'dark', manual: { adds: [], cuts: [{ c: 9, r: 5 }] } }, cutMap.whiteboard.filter(w => !cutDrop[w.id]), [Object.assign({}, pvC, { range: 20 })]); if (cutFl) cutCopy.fogLit = FC.cleanFogLit(cutFl.lit);
        ltClient = true; LT.reset(); const cutCli = LT.revealedTiers(cutCopy, {}, 'p1'); ltClient = false;
        check('Lighting: a GM\'s manual hide beside a lit wall leaves the player\'s copy reading that wall as the host does (the hidden cell\'s light still reaches them, the cell itself stays hidden)',
            !!cutFl && keyTier(cutCli) === keyTier(cutHost) && cutHost.keys['9,5'] === undefined, lj([cutFl && cutFl.lit.length, keyTier(cutCli) === keyTier(cutHost)]));
        // the host's visits cap: a player is told the host fails dark, and their copy reads as the host's does
        const visitsMany = []; for (let i = 0; i < 60; i++) visitsMany.push(lampAt('vm' + i, 105 + (i % 10) * 250, 105 + Math.floor(i / 10) * 250, { bright: 100, dim: 100 }));
        LT.reset(); const vMap = lmap({}, visitsMany.concat([carrier, meC]), [pvC]), vLc = LT.litFor(vMap, grid, LT.blockersFor(vMap, grid)), vFl = LT.fogLitFor('p1', {}, vMap, { carrier: 1 }), vHost = LT.revealedTiers(vMap, {}, 'p1');
        const vCopy = lmap({}, visitsMany.concat([meC]), [pvC]); if (vFl && vFl.capped) vCopy.lightsCapped = true;
        ltClient = true; LT.reset(); const vCli = LT.revealedTiers(vCopy, {}, 'p1'); ltClient = false;
        check('Lighting: past the host\'s light budget (too many cells lit) a player is told so and their copy reads dark as the host\'s does',
            (vLc === null || vLc.capped === true) && !!vFl && vFl.capped === true && vFl.lit.length === 0 && keyTier(vCli) === keyTier(vHost), lj([vLc && vLc.capped, vFl, keyTier(vCli) === keyTier(vHost)]));
        // a hex map: a torch round a corner sends hex cells, and the player's copy matches the host's
        ltGrid = FC.hexGrid ? FC.hexGrid(30, 52) : null;
        if (ltGrid) {
            LT.reset(); const hMap = lmap({ light: 'dark' }, [{ id: 'hw', type: 'rect', x: 500, y: 0, w: 60, h: 300, blocksSight: true }, carrier, meC], [pvC]), hDrop = { carrier: 1 };
            const hFl = LT.fogLitFor('p1', {}, hMap, hDrop), hHost = LT.revealedTiers(hMap, {}, 'p1');
            const hCopy = lmap({ light: 'dark' }, hMap.whiteboard.filter(w => !hDrop[w.id]), [pvC]); if (hFl) hCopy.fogLit = FC.cleanFogLit(hFl.lit);
            ltClient = true; LT.reset(); const hCli = LT.revealedTiers(hCopy, {}, 'p1'); ltClient = false; ltGrid = grid; LT.reset();
            check('Lighting: on a hex map a torch round a corner sends hex cells (q, r and a level only) and the player\'s copy then sees what the host rules',
                !!hFl && hFl.lit.length > 0 && hFl.lit.every(e => Object.keys(e).sort().join() === 'q,r,t') && keyTier(hCli) === keyTier(hHost), lj([hFl && hFl.lit.slice(0, 3), keyTier(hCli) === keyTier(hHost)]));
        } else { ltGrid = grid; check('Lighting: fogcore publishes a hex grid for the hex case', false); }
        // the GM's Light block handler (inspector.js setLight, run strict on stub inputs)
        const inSL = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, NL), slA = inSL.indexOf("            var _el_wbLB = document.getElementById('wbLightBright')"), slB = inSL.indexOf(NL, inSL.indexOf('[_el_wbLB, _el_wbLD, _el_wbLO].forEach(', slA));
        const runSL = (w, vals, count) => { const els = { wbLightBright: { value: vals.b, addEventListener(e, f) { this.f = f; } }, wbLightDim: { value: vals.d, addEventListener(e, f) { this.f = f; } }, wbLightOn: { checked: vals.on, addEventListener(e, f) { this.f = f; } } }, log = [];
            new Function('document', 'window', 'w', 'activeMap', 'save', 'render', 'renderInspector', 'toast', "'use strict';" + NL + inSL.slice(slA, slB + 1))({ getElementById: id => els[id] || null }, { wpFogCore: FC, wpFog: { lightCount: () => count, invalidateVision() {}, redraw() {} } }, w, {}, () => log.push('save'), () => {}, () => log.push('insp'), t => log.push('toast'));
            els.wbLightOn.f(); return { light: w.light, log: log.join(',') }; };
        const slOff = runSL({ type: 'light', light: { bright: 5, dim: 10 } }, { b: 5, d: 10, on: false }, 1), slOn = runSL({ type: 'light', light: { bright: 5, dim: 10, off: true } }, { b: 5, d: 10, on: true }, 1);
        const slCapL = runSL({ type: 'light', light: { bright: 0, dim: 0 } }, { b: 3, d: 6, on: true }, 200);
        const slNew = runSL({ isChar: true }, { b: 3, d: 2, on: false }, 1), slZero = runSL({ type: 'light', light: { bright: 5, dim: 10 } }, { b: 0, d: 0, on: true }, 1), slCap = runSL({ isChar: true }, { b: 3, d: 6, on: false }, 200), slTok0 = runSL({ isChar: true, light: { bright: 2, dim: 2 } }, { b: 0, d: 0, on: true }, 1);
        check('Lighting: the GM\'s Light block (setLight, run strict): unticking switches a light off, ticking on; a first radius on a token lights it on (dim at least bright); zero radii leave a light source unlit and take a token\'s light away; a new light past the cap is refused',
            lj(slOff.light) === lj({ bright: 5, dim: 10, off: true }) && lj(slOn.light) === lj({ bright: 5, dim: 10 }) && lj(slNew.light) === lj({ bright: 3, dim: 3 }) && /insp/.test(slNew.log)
            && lj(slZero.light) === lj({ bright: 0, dim: 0 }) && slCap.light === undefined && /toast/.test(slCap.log) && !/save/.test(slCap.log) && slTok0.light === undefined && lj(slCapL.light) === lj({ bright: 0, dim: 0 }) && /toast/.test(slCapL.log), lj([slOff, slOn, slNew, slZero, slCap, slTok0, slCapL]));
        const mainL = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'main.js'), 'utf8').replace(/\r\n/g, NL);
        const wbM = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, NL), inM = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, NL), fxM = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fx.js'), 'utf8').replace(/\r\n/g, NL);
        check('Lighting: a player\'s minimap never draws a light source nor does their frame-all reach for one; the GM\'s marker keeps its glow; a light source offers no Is Character; the fog menu places one too (Visual effects may be off); the effects button says only an Auto map goes dark',
            /\.filter\(function\(w\) \{ return !\(w && w\.type === 'light' && window\.wpNet && window\.wpNet\.active && window\.wpNet\.role === 'client'\); \}\)\.map\(function\(w\) \{ return \{ x: w\.x/.test(mainL)
            && /if \(state\.viewMode !== 'data' && window\.wpNet && window\.wpNet\.active && window\.wpNet\.role === 'client'\) items = items\.filter\(function\(w\) \{ return !\(w && w\.type === 'light'\); \}\);/.test(mainL)
            && /if \(!\(state\.selWbIds && state\.selWbIds\.length > 1 && state\.selWbIds\.includes\(item\.id\)\)\) el\.style\.boxShadow = '';/.test(wbM) && /\} else if \(w\.type !== 'light'\) \{   \/\/ a light source is never a character/.test(inM)
            && /<button class="draw-style-btn" id="fogLightPlace"/.test(ixF) && /lplace\.addEventListener\('click', function\(\) \{ closeMenu\(\); if \(window\.wpArmLight\) window\.wpArmLight\(\); \}\);/.test(fogSrc) && /On a map whose Light is Auto, placing one makes it dark outside its lights\./.test(fxM) && /lightLevel: mapLevel, lightCount: lightCount,/.test(fogSrc));
        LT.reset(); const pvL = { x: 125, y: 125, range: 0, arc: 360, owner: 'p1' }, darkLamp = lmap({}, [lampAt('dl', 1005, 105, { bright: 3, dim: 6 })], [pvL]), tLamp = LT.revealedTiers(darkLamp, {}, 'p1');
        litOn = false; LT.reset(); const tLampOff = LT.revealedTiers(darkLamp, {}, 'p1'); litOn = true; LT.reset();
        const tLampA = LT.revealedTiers(darkLamp, {}, 'p1'); darkLamp.whiteboard[0].light = { bright: 3, dim: 6, off: true }; const tLampB = LT.revealedTiers(darkLamp, {}, 'p1');
        check('Lighting: a light placed on an auto map makes it dark outside its light — a player sees the lamp-lit cells from across the room (bright near, dim beyond) and nothing else past their sight; the Lighting switch off ignores it; a light switched off lights nothing (the memo follows it)',
            tLamp.keys['20,2'] === 2 && tLamp.keys['23,2'] === 1 && tLamp.keys['25,2'] === undefined && tLamp.keys['10,2'] === undefined && tLamp.keys['2,2'] === 2 && tLampOff.keys['20,2'] === undefined && tLampA.keys['20,2'] === 2 && tLampB.keys['20,2'] === undefined,
            lj([tLamp.keys['20,2'], tLamp.keys['23,2'], tLampB.keys['20,2']]));
        const wbL = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, NL), fxL = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fx.js'), 'utf8').replace(/\r\n/g, NL);
        const inL = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, NL), cssL = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'style.css'), 'utf8').replace(/\r\n/g, NL);
        check('Lighting: the effects panel places a light source (only with Lighting and fog on; refused past the cap), drawn for the GM as a marker (dimmed while off) and never for a player; its Properties (the GM\'s only) set its radii and on/off, and a token\'s too',
            /if \(window\.wpVtt && window\.wpVtt\.on\('lighting'\) && window\.wpVtt\.on\('fog'\)\) html \+= '<div class="snd-row"><span class="snd-label">Light<\/span><button class="journal-from fx-light-btn"/.test(fxL) && /if \(btn\.classList\.contains\('fx-light-btn'\)\) \{ if \(window\.wpArmLight\) window\.wpArmLight\(\); return; \}/.test(fxL)
            && /if \(window\.wpFog && window\.wpFog\.lightCount && window\.wpFog\.lightCount\(map\) >= C\.LIMITS\.lights\) \{ toast\(/.test(wbL) && /armPlacement\('light', \{ w: 40, h: 40, color: 'transparent', name: 'Light source', light: \{ bright: 5, dim: 10 \} \}, 'light source'\);/.test(wbL)
            && /\} else if \(item\.type === 'light'\) \{/.test(wbL) && /el\.classList\.add\('wb-light'\); el\.classList\.toggle\('off', !lgL \|\| !!lgL\.off\);/.test(wbL) && /lgG\.textContent = '/.test(wbL)
            && /body\.net-client \.wb-item\.wb-light \{ display: none !important; \}/.test(cssL) && /\(\(w\.type === 'light' \|\| w\.isChar\) && !w\.waiting && !w\.hidden && window\.wpCanPersistLocal && window\.wpCanPersistLocal\(\) \? \(function\(\) \{/.test(inL)
            && /\[_el_wbLB, _el_wbLD, _el_wbLO\]\.forEach\(function\(el\) \{ if \(el\) el\.addEventListener\('change', setLight\); \}\);/.test(inL) && /if \(L\) w\.light = L; else if \(w\.type === 'light'\) w\.light = \{ bright: 0, dim: 0 \}; else delete w\.light;/.test(inL)
            && /\(w\.type !== 'image' && w\.type !== 'trigger' && w\.type !== 'light' \?/.test(inL));
        check('Lighting: Help and the tour say how to place a light source and give a token a light, and that a map is lit until one is placed',
            /<b>Light sources:<\/b> in the &#10024; effects panel \(or the fog menu\) press <b>Light source<\/b>, then click the map/.test(ixF) && /A token can carry a light too \(<b>Carries a light<\/b> in its Properties\)/.test(ixF) && /a fogged map is <b>lit<\/b> until you place a light source on it/.test(ixF)
            && /the &#10024; effects panel, <b>Light source<\/b>; a token can carry one too, in its Properties/.test(require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'tutorial.js'), 'utf8')));
        const tuF = require('fs').readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'tutorial.js'), 'utf8').replace(/\r\n/g, NL);
        check('Lighting: the Tutorial\'s Dark Cellar is dark (a new Tutorial, and an older one once, on its next start; a GM\'s own later choice stays), so Bren\'s sight in the dark is what lights it and the Lurker stays out of view',
            /fm\.fog = \{ on: true, mode: 'auto', light: 'dark', manual: \{ adds: \[\], cuts: \[\] \} \};/.test(tuF)
            && /if \(!camp\.tutorialLight\) \{ var tfog = camp\.items\.map_tut_fog\.fog; if \(tfog && typeof tfog === 'object' && tfog\.light === undefined\) tfog\.light = 'dark'; camp\.tutorialLight = 1; \}/.test(tuF)
            && tuF.indexOf('if (!camp.tutorialLight)') > tuF.indexOf('// 1.5.0 sight-blocking: the demo pillars block'));
        /* ---- lighting (L4): the system's light rules — what a length counts in, a light's unit and name, the facing arc as a point query, what sight
           counts in, the light one token sees another in (fog.js lightSeen), the Light block's unit, the fog menu's sight unit ---- */
        {
            const { lightUnit, unitCells, cleanLight: CL, cellInArc } = FC, RC = FC.LIMITS.rangeCells, ft5 = 5 * (1 / 3), chr = String.fromCharCode;
            const notUnits = [undefined, null, '', 'yd', 'yards', 'FT', 'Cells', ' ft', 'furlong', 'constructor', '__proto__', 'hasOwnProperty', 'toString', 7, true, ['ft'], { toString: () => 'ft' }];
            check('Lighting: a length counts in feet, metres or grid cells only when its unit is exactly one of those words; anything else (yards, no unit, an unknown word, a name every object carries, a value that is not text) reads as the yards default',
                typeof lightUnit === 'function' && lightUnit('ft') === 'ft' && lightUnit('m') === 'm' && lightUnit('cells') === 'cells' && notUnits.every(u => lightUnit(u) === ''), lj(notUnits.map(u => lightUnit(u))));
            const ydVals = [0.2, 0.5, 1, 2.4, 2.5, 7, 12.5, 60, 100, 250, 1e9], ydPers = [1, ft5, 5, 0.5, 2.5, 0, -1, NaN, undefined], ydUnits = [undefined, null, '', 'yd', 'furlong', 'constructor', '__proto__', 'hasOwnProperty', 7], ydBad = [];
            ydVals.forEach(v => ydPers.forEach(p => ydUnits.forEach(u => { if (unitCells(v, u, p) !== rangeToCells(v, p)) ydBad.push([v, p, String(u)]); })));
            check('Lighting: a length in yards (no unit, yd, an unknown unit or a name every object carries) becomes cells exactly as it did before units, whatever the value and the map\'s scale',
                ydBad.length === 0 && unitCells(60, undefined, ft5) === 36 && unitCells(60, 'yd', 5) === 12 && unitCells(60, 'constructor', ft5) === 36 && unitCells(60, '__proto__', ft5) === 36, lj(ydBad.slice(0, 5)));
            check('Lighting: feet and metres go through the map\'s yards per cell — 60 ft on 5 ft squares is 12 cells, 7.5 ft there is 2, 10 ft on 10 ft squares is 1, 3.5 ft on 1 ft squares is 4 (a cell and a half rounds up, never a hair under it); a map with no usable scale counts a yard a cell; metres run a little longer than yards',
                unitCells(60, 'ft', ft5) === 12 && unitCells(7.5, 'ft', ft5) === 2 && unitCells(30, 'ft', ft5) === 6 && unitCells(5, 'ft', ft5) === 1 && unitCells(2, 'ft', ft5) === 0 && unitCells(10, 'ft', 10 * (1 / 3)) === 1 && unitCells(3.5, 'ft', 1 / 3) === 4 && unitCells(12.5, 'ft', 1 / 3) === 13
                && unitCells(9, 'ft', 0) === 3 && unitCells(9, 'ft', NaN) === 3 && unitCells(10, 'm', 1) === 11 && unitCells(10, 'm', 1) > unitCells(10, undefined, 1) && unitCells(10, 'ft', 1) < unitCells(10, undefined, 1),
                lj([unitCells(60, 'ft', ft5), unitCells(7.5, 'ft', ft5), unitCells(3.5, 'ft', 1 / 3), unitCells(9, 'ft', 0), unitCells(10, 'm', 1)]));
            const zeroVals = [0, -5, -0.001, NaN, Infinity, -Infinity, '60', null, undefined, {}, [7]], zeroUnits = ['ft', 'm', 'cells', undefined, 'yd'];
            check('Lighting: grid cells count as they are whatever the map\'s scale; every unit is held to the sight cap; zero, a negative, a value that is not a finite number give no cells',
                [ft5, 100, 0.01, 1, NaN, 0].every(p => unitCells(7, 'cells', p) === 7 && unitCells(1, 'cells', p) === 1 && unitCells(RC, 'cells', p) === RC) && unitCells(2.4, 'cells', 5) === 2
                && unitCells(1e9, 'ft', ft5) === RC && unitCells(1e9, 'm', 1) === RC && unitCells(1e9, 'cells', 1) === RC && unitCells(RC + 1, 'cells', 9) === RC && unitCells(1e9, undefined, 1) === RC && unitCells(3 * RC + 3, 'ft', 1) === RC
                && zeroUnits.every(u => zeroVals.every(v => unitCells(v, u, ft5) === 0)), lj([unitCells(7, 'cells', 100), unitCells(1e9, 'ft', ft5), zeroUnits.map(u => zeroVals.map(v => unitCells(v, u, ft5)))]));
            // (b) a light's unit and name
            const lgt = o => lj(CL(Object.assign({ bright: 5, dim: 10 }, o))), plain = lj({ bright: 5, dim: 10 });
            check('Lighting: a light keeps its unit only when it is feet, metres or grid cells, after bright, dim and off; yards, an unknown unit, a name every object carries or a value that is not text leave the light exactly as it was stored before units',
                lj(CL({ name: 'Torch', unit: 'ft', off: true, dim: 40, bright: 20 })) === '{"bright":20,"dim":40,"off":true,"unit":"ft","name":"Torch"}' && lgt({ unit: 'ft' }) === '{"bright":5,"dim":10,"unit":"ft"}' && lgt({ unit: 'm' }) === '{"bright":5,"dim":10,"unit":"m"}'
                && lgt({ unit: 'cells', off: true }) === '{"bright":5,"dim":10,"off":true,"unit":"cells"}' && ['yd', '', 'FT', 'furlong', 'constructor', '__proto__', 'toString', 7, true, null, ['ft'], { toString: () => 'ft' }].every(u => lgt({ unit: u }) === plain)
                && lgt({}) === plain && CL({ bright: 0, dim: 0, unit: 'ft', name: 'Torch' }) === null, lj([CL({ name: 'Torch', unit: 'ft', off: true, dim: 40, bright: 20 }), lgt({ unit: 'constructor' })]));
            const nmCtl = chr(0, 9, 10, 32, 127, 32, 31, 13), nmLong = CL({ bright: 5, dim: 10, name: 'x'.repeat(80) }), nmPad = CL({ bright: 5, dim: 10, name: '  ' + 'y'.repeat(90) }), nmIn = CL({ bright: 5, dim: 10, name: chr(9) + ' Oil' + chr(10) + 'lamp' + chr(0) + chr(127) + ' ' });
            check('Lighting: a light keeps the name of the preset it came from as text of at most 60 characters, its control characters turned to spaces and its ends trimmed, after the unit; a name of control characters and spaces only, an empty one or one that is not text is dropped',
                FC.LIMITS.lightName === 60 && lgt({ name: 'Torch' }) === '{"bright":5,"dim":10,"name":"Torch"}' && lgt({ name: 'Torch', unit: 'm' }) === '{"bright":5,"dim":10,"unit":"m","name":"Torch"}' && lgt({ name: nmCtl }) === plain && lgt({ name: '' }) === plain && lgt({ name: '   ' }) === plain
                && [7, true, null, ['Torch'], { toString: () => 'Torch' }].every(n => lgt({ name: n }) === plain) && !!nmLong && nmLong.name === 'x'.repeat(60) && !!nmPad && /^y+$/.test(nmPad.name) && nmPad.name.length <= 60 && nmPad.name.length >= 50
                && !!nmIn && nmIn.name === 'Oil lamp' && CL({ bright: 5, dim: 10, name: '<b>Torch</b>' }).name === '<b>Torch</b>', lj([nmLong && nmLong.name.length, nmPad && nmPad.name.length, nmIn && nmIn.name, lgt({ name: nmCtl })]));
            // (c) the arc as a point query: the same answer as visibleCells, cell by cell over the whole disc
            const arcBad = [], arcRuns = [];
            [[sq, { x: 1025, y: 1025 }], [hx, cellCenter({ q: 10, r: 10 }, hx)]].forEach(([g, p]) => {
                [[0, 180], [90, 90], [137, 120], [270, 1], [0, 359], [200, 0], [-450, 200], [30, undefined], [undefined, 100]].forEach(([front, arc]) => {
                    const v = { x: p.x, y: p.y, range: 8 }; if (front !== undefined) v.front = front; if (arc !== undefined) v.arc = arc;
                    const disc = visibleCells(Object.assign({}, v, { arc: 360 }), g, null), cone = new Set(visibleCells(v, g, null).map(o => o.key));
                    disc.forEach(o => { if (cellInArc(v, o.cell, g) !== cone.has(o.key)) arcBad.push([g.type, front, arc, o.key]); });
                    arcRuns.push({ g: g.type, arc: arc, cone: cone.size, disc: disc.length });
                });
            });
            const hereS = cellOf(1025, 1025, sq), hC = cellCenter({ q: 10, r: 10 }, hx), hereH = cellOf(hC.x, hC.y, hx), behindH = cellOf(hC.x, hC.y + 208, hx);
            check('Lighting: whether a cell is in a token\'s facing arc (cellInArc) is what its vision says, cell by cell over the whole disc — a facing cone on a square and on a hex grid (every cell it sees is in the arc, every other cell of the disc is not), all around always, its own cell always; no viewer, no cell or no grid is never in the arc',
                arcBad.length === 0 && arcRuns.length === 18 && arcRuns.every(r => r.cone >= 1 && r.disc > 100 && (r.arc === undefined && r.g === 'square' ? r.cone === r.disc : r.cone < r.disc)) && arcRuns.some(r => r.arc === 180 && r.cone > r.disc / 3)
                && cellInArc({ x: 1025, y: 1025, front: 0, arc: 1 }, hereS, sq) === true && cellInArc({ x: 1025, y: 1025, front: 0, arc: 0 }, hereS, sq) === true && cellInArc({ x: hC.x, y: hC.y, front: 0, arc: 1 }, hereH, hx) === true
                && cellInArc({ x: 1025, y: 1025, front: 0, arc: 360 }, { c: 500, r: -300 }, sq) === true && cellInArc({ x: 1025, y: 1025, front: 0 }, { c: 20, r: 500 }, sq) === true && cellInArc({ x: hC.x, y: hC.y, front: 0, arc: 360 }, behindH, hx) === true
                && cellInArc({ x: hC.x, y: hC.y, front: 0 }, behindH, hx) === false && cellInArc({ x: 1025, y: 1025, front: 0, arc: 180 }, { c: 20, r: 30 }, sq) === false && cellInArc({ x: 1025, y: 1025, front: 180, arc: 180 }, { c: 20, r: 30 }, sq) === true
                && cellInArc(null, hereS, sq) === false && cellInArc({ x: 1025, y: 1025, arc: 360 }, null, sq) === false && cellInArc({ x: 1025, y: 1025, arc: 360 }, hereS, null) === false && cellInArc({ x: NaN, y: 1025, arc: 360 }, hereS, sq) === false,
                lj([arcBad.slice(0, 4), arcRuns]));
            // (d) what sight counts in, on the campaign
            const CCF = FC.cleanCampFog, cfU = u => lj(CCF({ fields: { sightUnit: u, sight: 'f_see1' }, defaults: { sight: 60 } }));
            check('Lighting: a campaign keeps what sight counts in (feet, metres or grid cells) after its sight field; yards, an unknown unit, a name every object carries or a value that is not text is left out, and a campaign with none is stored exactly as before',
                cfU('ft') === '{"fields":{"sight":"f_see1","sightUnit":"ft"},"defaults":{"sight":60}}' && cfU('m') === '{"fields":{"sight":"f_see1","sightUnit":"m"},"defaults":{"sight":60}}' && cfU('cells') === '{"fields":{"sight":"f_see1","sightUnit":"cells"},"defaults":{"sight":60}}'
                && ['yd', '', 'FT', 'furlong', 'constructor', '__proto__', 'toString', 7, true, null, undefined, ['ft'], { toString: () => 'ft' }].every(u => cfU(u) === '{"fields":{"sight":"f_see1"},"defaults":{"sight":60}}')
                && lj(CCF({ fields: { sightUnit: 'ft' } })) === '{"fields":{"sightUnit":"ft"},"defaults":{"sight":0}}' && lj(CCF(null)) === '{"fields":{},"defaults":{"sight":0}}' && lj(CCF({})) === '{"fields":{},"defaults":{"sight":0}}'
                && lj(CCF({ fields: 'ft', defaults: { sight: 30, on: true } })) === '{"fields":{},"defaults":{"sight":30,"on":true}}' && lj(CCF(CCF({ fields: { sightUnit: 'cells' }, defaults: { sight: 9 } }))) === '{"fields":{"sightUnit":"cells"},"defaults":{"sight":9}}', lj([cfU('ft'), cfU('constructor'), CCF(null)]));
            // (e) a token's sight in cells (fog.js tokenSightCells, run strict on the real fogcore; campFog is the real one too)
            const tsWin = {}, TS = new Function('core', 'window', "'use strict';" + NL + lineOf('var UNIT_YD = ') + cut('function cellYardsForMap(') + cut('function campFog(') + cut('function tokenSightCells(') + NL + 'return tokenSightCells;')(() => FC, tsWin);
            const sqMap = { meta: { gridType: 'square' } }, hexMap = { meta: { gridType: 'hex' } }, sq10 = { meta: { gridType: 'square', cellValue: 10, cellUnit: 'ft' } }, tokS = { id: 'ts', isChar: true, charId: 'ch1' }, campS = (sight, unit, field) => { const f = {}; if (unit !== undefined) f.sightUnit = unit; if (field) f.sight = field; return { fog: { fields: f, defaults: { sight: sight } }, system: { fields: [] }, chars: { ch1: {} } }; };
            const tsFt = TS(tokS, sqMap, campS(60, 'ft')), tsYd = TS(tokS, sqMap, campS(60)), tsCells = TS(tokS, sqMap, campS(60, 'cells')), tsCells7 = TS(tokS, sq10, campS(7, 'cells')), tsM = TS(tokS, hexMap, campS(6, 'm')), tsJunk = TS(tokS, sqMap, campS(60, 'constructor')), tsFt10 = TS(tokS, sq10, campS(60, 'ft')), tsOver = TS(tokS, sqMap, campS(5000, 'cells'));
            const campKept = campS(60, 'ft'); TS(tokS, sqMap, campKept);
            tsWin.wpFormula = {}; tsWin.wpSystemCore = { fieldById: (sys, id) => id === 'f_see1' ? { key: 'see' } : null, makeResolver: () => k => k === 'see' ? 30 : undefined };
            const tsField = TS(tokS, sqMap, campS(60, 'ft', 'f_see1')), tsFieldYd = TS(tokS, sqMap, campS(60, undefined, 'f_see1')), tsFieldCells = TS(tokS, sq10, campS(60, 'cells', 'f_see1')), tsNoChar = TS({ id: 'nc', isChar: true }, sqMap, campS(60, 'ft', 'f_see1'));
            delete tsWin.wpFormula; delete tsWin.wpSystemCore;
            check('Lighting: a token\'s sight (fog.js tokenSightCells, run strict) counts in the campaign\'s unit — a default of 60 in feet on 5 ft squares is 12 cells, the same campaign with no unit 36 (yards, as before), in grid cells 60 whatever the map\'s scale, in metres on a hex map of a yard a cell what the converter gives; a unit that is not one reads as yards; the sheet field mapped to sight counts in it too; no token, no sight',
                tsFt === 12 && tsYd === 36 && tsCells === 60 && tsCells7 === 7 && tsOver === RC && tsM === unitCells(6, 'm', 1) && tsM > 0 && tsJunk === 36 && tsFt10 === 6 && lj(campKept.fog) === '{"fields":{"sightUnit":"ft"},"defaults":{"sight":60}}'
                && tsField === 6 && tsFieldYd === 18 && tsFieldCells === 30 && tsNoChar === 12 && TS(null, sqMap, campS(60, 'ft')) === 0 && TS(tokS, sqMap, null) === 0, lj([tsFt, tsYd, tsCells, tsCells7, tsM, tsJunk, tsFt10, tsField, tsFieldYd, tsFieldCells, tsNoChar]));
            // (f) a light's radii in its own unit (the LT harness: 5 ft squares)
            ltGrid = grid; LT.reset();
            const srcOf = light => { const mp = lmap({}, [lampAt('u', 505, 105, light)]); return LT.lightSources(mp, grid, LT.blockersFor(mp, grid)).map(s => FC.cellKey(s.cell, grid) + ':' + s.bright + ':' + s.dim).join(' '); };
            const twoU = lmap({}, [lampAt('ua', 505, 105, { bright: 20, dim: 40, unit: 'ft' }), lampAt('ub', 2505, 105, { bright: 20, dim: 40 }), lampAt('uc', 4505, 105, { bright: 2, dim: 4, unit: 'cells' })]), twoLit = LT.litFor(twoU, grid, LT.blockersFor(twoU, grid));
            check('Lighting: a light\'s radii are counted in its own unit (fog.js lightSources, run strict) — a lamp of 20 / 40 ft on 5 ft squares lights 4 and 8 cells, the same numbers with no unit are yards (12 and 24), grid cells are taken as given, a unit that is not one reads as yards, a dim-only light in feet stays dim-only; two lights on one map each keep their own',
                srcOf({ bright: 20, dim: 40, unit: 'ft' }) === '10,2:4:8' && srcOf({ bright: 20, dim: 40 }) === '10,2:12:24' && srcOf({ bright: 3, dim: 7, unit: 'cells' }) === '10,2:3:7' && srcOf({ bright: 20, dim: 40, unit: 'constructor' }) === '10,2:12:24' && srcOf({ bright: 20, dim: 40, unit: 'yd' }) === '10,2:12:24'
                && srcOf({ bright: 0, dim: 30, unit: 'ft' }) === '10,2:-1:6' && srcOf({ bright: 10, dim: 10, unit: 'm' }) === '10,2:' + unitCells(10, 'm', ft5) + ':' + unitCells(10, 'm', ft5)
                && !!twoLit && twoLit.lit['14,2'] === 2 && twoLit.lit['15,2'] === 1 && twoLit.lit['18,2'] === 1 && twoLit.lit['19,2'] === undefined && twoLit.lit['62,2'] === 2 && twoLit.lit['63,2'] === 1 && twoLit.lit['92,2'] === 2 && twoLit.lit['94,2'] === 1 && twoLit.lit['95,2'] === undefined,
                lj([srcOf({ bright: 20, dim: 40, unit: 'ft' }), srcOf({ bright: 20, dim: 40 }), srcOf({ bright: 0, dim: 30, unit: 'ft' }), twoLit && twoLit.lit['18,2'], twoLit && twoLit.lit['62,2']]));
            // (g) the light one token sees another in (fog.js lightSeen, run strict with the real mapFog, campFog, gridForMap, visionOf, tokenSightCells,
            // blockersFor, fogMask and litFor on the real fogcore)
            let l4Fog = true, l4Lit = true, l4Client = false, l4Turn = true, l4Core = FC, l4N = 0; const l4Win = { wpVtt: { on: f => f === 'turning' ? l4Turn : true } };
            const L4 = new Function('core', 'vtt', 'fogFeatureOn', 'toast', 'isGmView', 'isClientView', 'window', "'use strict';" + NL
                + lineOf('function DEF_MAP()') + cut('function mapFog(') + cut('function campFog(') + lineOf('function gridForMap(') + lineOf('var UNIT_YD = ') + cut('function cellYardsForMap(') + cut('function tokenSightCells(') + cut('function gridIsHexMap(') + cut('function visionOf(')
                + lineOf('function lightingOn()') + lineOf('function placedLights(') + cut('function mapLevel(') + lineOf('var _blockerCache = Object.create(null)') + lineOf('var _blockerSig = Object.create(null)') + lineOf('var _litCache = Object.create(null)') + cut('function lightSources(') + cut('function litFor(')
                + cut('function eligibleBlocker(') + cut('function footprintCells(') + cut('function blockersFor(') + cut('function maskFootprint(') + lineOf('var _maskCache = Object.create(null)') + lineOf('function fogSig(') + cut('function fogMask(') + lineOf('function inMask(') + cut('function lightSeen(') + NL + 'return { lightSeen: lightSeen, tokenSightCells: tokenSightCells, mapLevel: mapLevel };')(
                () => l4Core, () => ({ on: f => f === 'lighting' ? l4Lit : true }), () => l4Fog, () => {}, () => !l4Client, () => l4Client, l4Win);
            const l4map = (fog, wb, meta) => ({ id: 'l4m' + (++l4N), type: 'map', meta: Object.assign({ updated: 1, gridType: 'square' }, meta), fog: Object.assign({ on: true, mode: 'auto', manual: { adds: [], cuts: [] } }, fog), whiteboard: wb || [] });
            const l4camp = () => ({ fog: { fields: { sightUnit: 'ft' }, defaults: { sight: 15 } } }), tk = (c, r, extra) => Object.assign({ id: 't' + c + '_' + r, isChar: true, x: c * 50, y: r * 50, w: 50, h: 50 }, extra), me4 = tk(2, 2);
            const seenAt = (m, c, r, from) => L4.lightSeen(from || me4, tk(c, r), m, l4camp()), wall32 = { id: 'w32', type: 'rect', x: 150, y: 100, w: 50, h: 50, blocksSight: true };
            const dk = l4map({ light: 'dark' }), dkWall = l4map({ light: 'dark' }, [wall32]), dkWallLamp = l4map({ light: 'dark' }, [wall32, lampAt('wl4', 205, 155, { bright: 0, dim: 5, unit: 'ft' })]), dkOpenLamp = l4map({ light: 'dark' }, [lampAt('ol4', 205, 155, { bright: 0, dim: 5, unit: 'ft' })]);
            const gSight = [seenAt(dk, 2, 2), seenAt(dk, 4, 2), seenAt(dk, 5, 2), seenAt(dk, 6, 2), seenAt(dk, 2, 5), seenAt(dk, 4, 4), seenAt(dk, 5, 4), seenAt(dk, 40, 2)];
            const gWall = [seenAt(dkWall, 4, 2), seenAt(dkWall, 5, 2), seenAt(dkWall, 2, 4), seenAt(dkWall, 3, 2), seenAt(dkWallLamp, 4, 2), seenAt(dkOpenLamp, 4, 2)];
            check('Lighting: the light one token sees another in (fog.js lightSeen, run strict) — within its sight in the dark and its line of sight it sees clearly (its own cell and the edge of its sight too, 15 ft on 5 ft squares being 3 cells), past its sight a dark map reads dark; behind a wall nothing is read, whatever lamp burns there (it has no line to the cell: a player\'s copy is given no lit cell for it either), and a token in the wall\'s own cell beside it is seen clearly',
                L4.tokenSightCells(me4, dk, l4camp()) === 3 && lj(gSight) === lj([2, 2, 2, 0, 2, 2, 0, 0]) && lj(gWall) === lj([null, null, 2, 2, null, 2]), lj([gSight, gWall]));
            const coneFog = { light: 'dark', vision: { mode: 'arc', arc: 90 } }, cn = l4map(coneFog), cnDim = l4map({ light: 'dim', vision: { mode: 'arc', arc: 90 } }), cnLamp = l4map(coneFog, [lampAt('cl4', 205, 105, { bright: 5, dim: 5, unit: 'ft' })]), hexCone = l4map({ light: 'dark' }, [], { gridType: 'hex' });
            const gCone = [seenAt(cn, 2, 0), seenAt(cn, 4, 2), seenAt(cn, 2, 4), seenAt(cn, 4, 2, tk(2, 2, { rot: 90 })), seenAt(cn, 4, 2, tk(2, 2, { rot: 45, front: 45 })), seenAt(cn, 2, 0, tk(2, 2, { rot: 90 })), seenAt(cnDim, 4, 2), seenAt(cnDim, 2, 0), seenAt(cnLamp, 4, 2), seenAt(cn, 2, 2)];
            const hexUp = L4.lightSeen(tk(2, 2), { id: 'hu', x: 100, y: 0, w: 50, h: 50 }, hexCone, l4camp()), hexDown = L4.lightSeen(tk(2, 2), { id: 'hd', x: 100, y: 204, w: 50, h: 50 }, hexCone, l4camp());
            l4Turn = false; const gConeOff = [seenAt(cn, 4, 2), seenAt(cn, 2, 4), seenAt(cn, 6, 2)]; l4Turn = true;
            check('Lighting: a token with a facing cone sees clearly only ahead of it (its facing is its rotation and its front together); outside the cone nothing is read, whatever the light there (dark, a dim map, beside a lamp), its own cell always clear; with facing switched off the cone is all around; a hex map\'s own cone counts',
                lj(gCone) === lj([2, null, null, 2, 2, null, null, 2, null, 2]) && lj(gConeOff) === lj([2, 2, 0]) && hexUp === 2 && hexDown === null, lj([gCone, gConeOff, hexUp, hexDown]));
            const lampFt = l4map({}, [lampAt('lf4', 1005, 105, { bright: 5, dim: 10, unit: 'ft' })]), lampYd = l4map({}, [lampAt('ly4', 1005, 105, { bright: 5, dim: 10 })]), lampOff = l4map({}, [lampAt('lo4', 1005, 105, { bright: 5, dim: 10, off: true })]), lampWall = l4map({}, [lampAt('lw4', 1005, 105, { bright: 5, dim: 10 }), { id: 'w22', type: 'rect', x: 1100, y: 0, w: 50, h: 300, blocksSight: true }]);
            const gLamp = [seenAt(lampFt, 20, 2), seenAt(lampFt, 21, 2), seenAt(lampFt, 22, 2), seenAt(lampFt, 23, 2), seenAt(lampFt, 10, 2), seenAt(lampFt, 4, 2)], gLampYd = [seenAt(lampYd, 23, 2), seenAt(lampYd, 24, 2), seenAt(lampYd, 26, 2), seenAt(lampYd, 27, 2)];
            const gLampOff = [seenAt(lampOff, 20, 2), seenAt(lampOff, 4, 2)], gLampWall = [seenAt(lampWall, 21, 2), seenAt(lampWall, 23, 2), seenAt(lampWall, 24, 2)];
            const br = l4map({ light: 'bright' }), dm = l4map({ light: 'dim' }), au = l4map({}), dmLamp = l4map({ light: 'dim' }, [lampAt('dl4', 1005, 105, { bright: 5, dim: 10, unit: 'ft' })]), brWall = l4map({ light: 'bright' }, [wall32]);
            const gMap = [seenAt(br, 40, 2), seenAt(br, 4, 2), seenAt(dm, 40, 2), seenAt(dm, 4, 2), seenAt(dm, 6, 2), seenAt(au, 40, 2), seenAt(dmLamp, 20, 2), seenAt(dmLamp, 22, 2), seenAt(dmLamp, 30, 2), seenAt(brWall, 4, 2)];
            check('Lighting: past a token\'s sight a cell reads the brighter of the map\'s light and its own — bright inside a lamp\'s bright radius, dim out to its dim radius, dark beyond (the radii in the lamp\'s own unit; a lamp switched off lights nothing; past a wall nothing is read); a bright map reads bright wherever the token has a line, a dim one dim past its sight, an Auto map with no light placed bright',
                lj(gLamp) === lj([2, 2, 1, 0, 0, 2]) && lj(gLampYd) === lj([2, 1, 1, 0]) && lj(gLampOff) === lj([0, 2]) && lj(gLampWall) === lj([2, null, null]) && lj(gMap) === lj([2, 2, 1, 2, 1, 2, 2, 1, 1, null]), lj([gLamp, gLampYd, gLampOff, gLampWall, gMap]));
            const nulls = { fogOff: seenAt(l4map({ on: false, light: 'bright' }), 4, 2), reveal: seenAt(l4map({ mode: 'reveal' }), 4, 2), cover: seenAt(l4map({ mode: 'cover', light: 'bright' }), 4, 2), noGrid: seenAt(l4map({}, [], { gridType: 'off' }), 4, 2) };
            nulls.notMap = L4.lightSeen(me4, tk(4, 2), Object.assign(l4map({}), { type: 'scene' }), l4camp()); nulls.noMap = L4.lightSeen(me4, tk(4, 2), null, l4camp()); nulls.noFrom = L4.lightSeen(null, tk(4, 2), l4map({}), l4camp()); nulls.noTo = L4.lightSeen(me4, null, l4map({}), l4camp());
            l4Fog = false; nulls.feature = seenAt(l4map({ light: 'bright' }), 4, 2); l4Fog = true; l4Lit = false; nulls.lighting = seenAt(l4map({ light: 'bright' }), 4, 2); l4Lit = true; l4Core = null; nulls.noCore = seenAt(l4map({ light: 'bright' }), 4, 2); l4Core = FC;
            const gridless = seenAt(l4map({ light: 'dark', cell: { grid: 'square', len: 50 } }, [], { gridType: 'off' }), 4, 2), backOn = seenAt(l4map({ light: 'bright' }), 40, 2);
            check('Lighting: no light is read (null, so the ruler and a target mark say nothing) with fog off for the map, fog on Reveal or Cover, the fog feature off, Lighting off, a map with no grid, something that is not a map, or no token at either end; a gridless map given a measurement grid reads as any other',
                Object.keys(nulls).length === 11 && Object.keys(nulls).every(k => nulls[k] === null) && gridless === 2 && backOn === 2, lj([nulls, gridless, backOn]));
            const hugeW4 = { id: 'hw4', type: 'rect', x: 0, y: 3000, w: 50 * 100, h: 50 * 61, blocksSight: true }, ovLamp = l4map({}, [hugeW4, lampAt('ov4', 1005, 105, { bright: 5, dim: 10 })]), ovBright = l4map({ light: 'bright' }, [hugeW4]), ovDim = l4map({ light: 'dim' }, [hugeW4]), underW = l4map({ light: 'bright' }, [{ id: 'uw4', type: 'rect', x: 0, y: 3000, w: 50 * 100, h: 50 * 59, blocksSight: true }]);
            const gOver = [seenAt(ovLamp, 20, 2), seenAt(ovLamp, 4, 2), seenAt(ovBright, 40, 2), seenAt(ovBright, 5, 2), seenAt(ovDim, 40, 2), seenAt(underW, 40, 2)];
            check('Lighting: with a map\'s walls past their cap no light is judged through them — past a token\'s sight every cell reads dark, whatever lamp burns there or light the map has; within its sight it still sees clearly; walls just under the cap change nothing',
                lj(gOver) === lj([0, 2, 0, 2, 0, 2]), lj(gOver));
            const litCells = [{ c: 30, r: 2, t: 1 }, { c: 31, r: 2, t: 2 }], withLit = (fog, wb, extra) => Object.assign(l4map(fog, wb), extra);
            const hostLit = seenAt(withLit({ light: 'dark' }, [], { fogLit: litCells }), 30, 2), hostCap = seenAt(withLit({ light: 'dim' }, [lampAt('hc4', 1005, 105, { bright: 5, dim: 10 })], { lightsCapped: true }), 20, 2);
            l4Client = true;
            const cLit = withLit({ light: 'dark' }, [], { fogLit: litCells }), gCli = [seenAt(cLit, 30, 2), seenAt(cLit, 31, 2), seenAt(cLit, 32, 2), seenAt(cLit, 4, 2), seenAt(withLit({ light: 'dim' }, [], { fogLit: litCells }), 31, 2), seenAt(withLit({ light: 'dim' }, [], { fogLit: litCells }), 32, 2)];
            const capDim = withLit({ light: 'dim' }, [lampAt('cd4', 1005, 105, { bright: 5, dim: 10 })], { lightsCapped: true }), capAuto = withLit({}, [lampAt('ca4', 1005, 105, { bright: 5, dim: 10 })], { lightsCapped: true, fogLit: [{ c: 20, r: 2, t: 2 }] }), unDim = withLit({ light: 'dim' }, [lampAt('ud4', 1005, 105, { bright: 5, dim: 10 })], {});
            const gCap = [seenAt(capDim, 20, 2), seenAt(capAuto, 20, 2), seenAt(capAuto, 4, 2), seenAt(unDim, 20, 2), seenAt(withLit({ light: 'dim' }, [lampAt('ct4', 1005, 105, { bright: 5, dim: 10 })], { lightsCapped: 1 }), 20, 2)];
            l4Client = false;
            check('Lighting: on a player\'s copy a cell the host sent as lit reads its level (dim or bright, the brighter of it and the map\'s light), and a copy told the host\'s lights are past their cap reads the map\'s own light whatever lamp it holds; the host itself never reads either off a map',
                lj(gCli) === lj([1, 2, 0, 2, 2, 1]) && lj(gCap) === lj([1, 0, 2, 2, 2]) && hostLit === 0 && hostCap === 2, lj([gCli, gCap, hostLit, hostCap]));
            // (g2) review fixes: where no fog is drawn, by hand, a wall's own cell, and the rule of record (fogcore seenCells)
            const area4 = { id: 'pa4', type: 'rect', x: 0, y: 0, w: 500, h: 500, fogged: true }, inArea = l4map({ light: 'dark' }, [area4]), hidArea = l4map({ light: 'dark' }, [Object.assign({}, area4, { hidden: true })]);
            const noFogCamp = { fog: { fields: { sightUnit: 'ft' }, defaults: { sight: 15, emptyFog: 'none' } } }, gArea = [seenAt(inArea, 6, 2), seenAt(inArea, 9, 2), seenAt(inArea, 10, 2), seenAt(inArea, 40, 2), seenAt(hidArea, 40, 2)];
            const gNone = [L4.lightSeen(me4, tk(6, 2), l4map({ light: 'dark' }), noFogCamp), L4.lightSeen(me4, tk(4, 2), l4map({ light: 'dim' }), noFogCamp), L4.lightSeen(me4, tk(6, 2), l4map({ light: 'dark' }, [area4]), noFogCamp), L4.lightSeen(me4, tk(40, 2), l4map({ light: 'dark' }, [area4]), noFogCamp)];
            check('Lighting: no light is read where a map draws no fog — a token outside every play area (inside one it reads as ever; a hidden play area is none), and anywhere on a map with no play area marked while the campaign fogs nothing there',
                lj(gArea) === lj([0, 0, null, null, 0]) && lj(gNone) === lj([null, null, 0, null]), lj([gArea, gNone]));
            const byHand = l4map({ light: 'dark', manual: { adds: [{ c: 6, r: 2 }, { c: 5, r: 4 }, { c: 8, r: 2 }], cuts: [{ c: 4, r: 2 }, { c: 8, r: 2 }] } }, [{ id: 'wh4', type: 'rect', x: 250, y: 150, w: 50, h: 100, blocksSight: true }]);
            const gHand = [seenAt(byHand, 6, 2), seenAt(byHand, 7, 2), seenAt(byHand, 5, 4), seenAt(byHand, 4, 2), seenAt(byHand, 8, 2), seenAt(byHand, 3, 2)];
            check('Lighting: a cell the GM revealed by hand reads clear, past the token\'s sight and behind a wall alike, and one hidden by hand reads nothing even within its sight (a cell both revealed and hidden is hidden); the cells beside them read as ever',
                lj(gHand) === lj([2, 0, 2, null, null, 2]), lj(gHand));
            const longW = { id: 'lw5', type: 'rect', x: 500, y: 0, w: 50, h: 300, blocksSight: true }, nearLamp = l4map({ light: 'dark' }, [longW, lampAt('nl5', 405, 105, { bright: 1, dim: 2, unit: 'cells' })]), farLamp = l4map({ light: 'dark' }, [longW, lampAt('fl5', 605, 105, { bright: 1, dim: 2, unit: 'cells' })]), dimWall = l4map({ light: 'dim' }, [longW]);
            const gFace = [seenAt(nearLamp, 10, 2), seenAt(farLamp, 10, 2), seenAt(dimWall, 10, 2), seenAt(nearLamp, 11, 2), seenAt(nearLamp, 9, 2)];
            check('Lighting: a token standing in a wall\'s or a closed door\'s own cell reads the light on its near face — bright where a lamp on the viewer\'s side lights the cell before it, dark where the lamp burns behind the wall, at least the map\'s own light — and one past the wall reads nothing',
                lj(gFace) === lj([2, 0, 1, null, 2]), lj(gFace));
            const gReach = [seenAt(br, 62, 2), seenAt(br, 63, 2), seenAt(dm, 62, 2), seenAt(dm, 63, 2), seenAt(dk, 62, 2), seenAt(dk, 63, 2), seenAt(l4map({ light: 'dark', manual: { adds: [{ c: 63, r: 2 }], cuts: [] } }), 63, 2)];
            check('Lighting: past the reach of any token\'s eyes (60 cells, the vision cap) nothing is read, on a bright map too — a player\'s copy holds no lit cell that far; at 60 cells it reads as ever; a cell revealed by hand reads clear at any distance',
                lj(gReach) === lj([2, null, 1, null, 0, null, 2]), lj(gReach));
            // the rule of record: over a lit room with a wall, lightSeen names exactly the tier fogcore seenCells gives each cell this viewer sees, and nothing it
            // gives no tier is ever read as lit
            const roomW = [{ id: 'rw6', type: 'rect', x: 400, y: 50, w: 50, h: 150, blocksSight: true }, { id: 'rp6', type: 'circle', x: 250, y: 250, w: 50, h: 50, blocksSight: true }], room = l4map({ light: 'dark' }, roomW.concat([lampAt('rl6', 305, 105, { bright: 2, dim: 4, unit: 'cells' }), lampAt('rm6', 555, 205, { bright: 1, dim: 3, unit: 'cells' })]));
            const gridR = FC.gridFor('square'), blkR = Object.create(null); [[8, 1], [8, 2], [8, 3], [5, 5]].forEach(c => { blkR[c[0] + ',' + c[1]] = 1; });
            const litR = FC.litLevels([{ cell: { c: 6, r: 2 }, bright: 2, dim: 4 }, { cell: { c: 11, r: 4 }, bright: 1, dim: 3 }], gridR, blkR), tierR = Object.create(null);
            FC.seenCells({ x: 125, y: 125, front: 0, arc: 360, range: 3 }, gridR, blkR, { level: 0, lit: litR }).forEach(o => { tierR[o.key] = o.tier; });
            const diffR = []; let sawLit = 0, sawWall = 0;
            for (let c = 0; c <= 16; c++) for (let r = 0; r <= 8; r++) { const got = seenAt(room, c, r), want = tierR[c + ',' + r]; if (want !== undefined) { if (got !== want) diffR.push([c, r, got, want]); if (want === 1) sawLit++; if (blkR[c + ',' + r]) sawWall++; } else if (got !== null && got !== 0) diffR.push([c, r, got, 'none']); }
            check('Lighting: over a lit room with a wall and a pillar, the light read for every cell is the tier the overlay\'s own rule gives it (fogcore seenCells) — a wall\'s lit face too — and a cell that rule shows nothing of never reads as lit',
                !diffR.length && sawLit > 3 && sawWall > 1, lj([diffR.slice(0, 8), sawLit, sawWall]));
            // (h) the GM's Light block with its unit (inspector.js setLight, run strict)
            const slB4 = inSL.indexOf(NL, inSL.indexOf("if (_el_wbLU) _el_wbLU.addEventListener('change', setLight);", slA));
            const runSL4 = (w, vals, fire) => { const mk = o => Object.assign({ addEventListener(e, f) { this.f = f; } }, o), els = { wbLightBright: mk({ value: vals.b }), wbLightDim: mk({ value: vals.d }), wbLightOn: mk({ checked: vals.on }), wbLightPreset: { options: [{ textContent: 'first' }], value: '1' } }, log = []; if (vals.unit !== undefined) els.wbLightUnit = mk({ value: vals.unit });
                new Function('document', 'window', 'w', 'activeMap', 'save', 'render', 'renderInspector', 'toast', "'use strict';" + NL + inSL.slice(slA, slB4 + 1))({ getElementById: id => els[id] || null }, { wpFogCore: FC, wpFog: { lightCount: () => 1, invalidateVision() {}, redraw() {} } }, w, {}, () => log.push('save'), () => {}, () => log.push('insp'), t => log.push('toast'));
                const el = els[fire || 'wbLightOn']; if (el && el.f) el.f(); else log.push('unwired'); return { light: lj(w.light), log: log.join(','), pre: els.wbLightPreset.value + '|' + els.wbLightPreset.options[0].textContent }; };
            const torch = () => ({ type: 'light', light: { bright: 20, dim: 40, unit: 'ft', name: 'Torch' } });
            const u4Off = runSL4(torch(), { b: 20, d: 40, on: false, unit: 'ft' }), u4On = runSL4({ isChar: true, light: { bright: 20, dim: 40, off: true, unit: 'ft', name: 'Torch' } }, { b: 20, d: 40, on: true, unit: 'ft' });
            const u4Rad = runSL4(torch(), { b: 30, d: 40, on: true, unit: 'ft' }, 'wbLightBright'), u4Dim = runSL4(torch(), { b: 20, d: 45, on: true, unit: 'ft' }, 'wbLightDim');
            const u4Unit = runSL4(torch(), { b: 20, d: 40, on: true, unit: 'm' }, 'wbLightUnit'), u4Yd = runSL4(torch(), { b: 20, d: 40, on: true, unit: 'yd' }, 'wbLightUnit'), u4Junk = runSL4(torch(), { b: 20, d: 40, on: true, unit: 'constructor' }, 'wbLightUnit');
            const u4YdName = runSL4({ type: 'light', light: { bright: 5, dim: 10, name: 'Glowrod' } }, { b: 5, d: 10, on: false, unit: 'yd' }), u4New = runSL4({ isChar: true }, { b: 10, d: 5, on: false, unit: 'cells' }, 'wbLightBright');
            const u4NoEl = runSL4(torch(), { b: 20, d: 40, on: false }), u4NoElRad = runSL4(torch(), { b: 25, d: 40, on: true }, 'wbLightBright'), u4Old = runSL4({ type: 'light', light: { bright: 5, dim: 10 } }, { b: 5, d: 10, on: false }), u4OldYd = runSL4({ type: 'light', light: { bright: 5, dim: 10 } }, { b: 6, d: 10, on: true, unit: 'yd' }, 'wbLightBright');
            check('Lighting: the GM\'s Light block (setLight, run strict) — a named light switched off or on keeps its name and its unit; a radius changed by hand lets the name go and keeps the unit; the unit select changes the unit and lets the name go (yards store no unit); its name let go, the preset box says Custom in place and the panel is not drawn afresh (the box being typed in stays), where a new light or one taken away draws it afresh; a new light takes the unit picked; with no unit select a light keeps its own unit, and a light with neither is stored exactly as before',
                u4Off.light === '{"bright":20,"dim":40,"off":true,"unit":"ft","name":"Torch"}' && u4On.light === '{"bright":20,"dim":40,"unit":"ft","name":"Torch"}' && !/insp/.test(u4Off.log) && /save/.test(u4Off.log) && u4Off.pre === '1|first'
                && u4Rad.light === '{"bright":30,"dim":40,"unit":"ft"}' && !/insp/.test(u4Rad.log) && u4Rad.pre === '|Custom' && u4Dim.light === '{"bright":20,"dim":45,"unit":"ft"}' && u4Unit.light === '{"bright":20,"dim":40,"unit":"m"}' && !/insp/.test(u4Unit.log) && u4Unit.pre === '|Custom' && /insp/.test(u4New.log) && u4New.pre === '1|first' && u4Yd.light === '{"bright":20,"dim":40}' && u4Junk.light === '{"bright":20,"dim":40}'
                && u4YdName.light === '{"bright":5,"dim":10,"off":true,"name":"Glowrod"}' && u4New.light === '{"bright":10,"dim":10,"unit":"cells"}' && u4NoEl.light === '{"bright":20,"dim":40,"off":true,"unit":"ft","name":"Torch"}' && u4NoElRad.light === '{"bright":25,"dim":40,"unit":"ft"}'
                && u4Old.light === '{"bright":5,"dim":10,"off":true}' && u4OldYd.light === '{"bright":6,"dim":10}' && ![u4Off, u4Rad, u4Unit, u4New].some(r => /unwired|toast/.test(r.log)), lj([u4Off, u4On, u4Rad, u4Dim, u4Unit, u4Yd, u4Junk, u4YdName, u4New, u4NoEl, u4NoElRad, u4Old, u4OldYd]));
            // (i) the fog menu's sight unit: its select, its handler and syncMenu (both run strict), and what window.wpFog publishes
            const suA = fogSrc.indexOf("    var sunit = ui('fogSightUnit');" + NL + '    if (sunit) sunit.addEventListener('), suB = fogSrc.indexOf("    var vsel = ui('fogVision');", suA);
            const realCampFog = c => { c.fog = FC.cleanCampFog(c.fog); return c.fog; };
            const runSU = (camp, value, noCore) => { const el = { value: value, addEventListener(e, f) { if (e === 'change') this.f = f; } }, log = [];
                if (suA < 0 || suB < 0) return { fog: 'handler not found', log: '' };
                new Function('ui', 'activeCamp', 'core', 'campFog', 'save', 'invalidateVision', 'syncMenu', 'redraw', "'use strict';" + NL + fogSrc.slice(suA, suB))(id => id === 'fogSightUnit' ? el : null, () => camp, () => noCore ? null : FC, realCampFog, () => log.push('save'), () => log.push('vision'), () => log.push('sync'), () => log.push('redraw'));
                if (el.f) el.f(); else log.push('unwired'); return { fog: camp ? lj(camp.fog) : null, log: log.join(',') }; };
            const cmp = (unit) => ({ fog: { fields: Object.assign({ sight: 'f_see1' }, unit ? { sightUnit: unit } : {}), defaults: { sight: 60 } } });
            const suFt = runSU(cmp(), 'ft'), suM = runSU(cmp('ft'), 'm'), suCells = runSU(cmp(), 'cells'), suYd = runSU(cmp('ft'), 'yd'), suYd0 = runSU(cmp(), 'yd'), suJunk = runSU(cmp('ft'), 'constructor'), suNone = runSU(null, 'ft'), suNoCore = runSU(cmp(), 'ft', true);
            check('Lighting: the fog menu\'s sight unit (its handler, run strict) stores feet, metres or grid cells on the campaign and nothing for yards or a value that is not a unit (a unit held before is removed), then saves and works sight out afresh; with no campaign open it does nothing',
                suFt.fog === '{"fields":{"sight":"f_see1","sightUnit":"ft"},"defaults":{"sight":60}}' && suM.fog === '{"fields":{"sight":"f_see1","sightUnit":"m"},"defaults":{"sight":60}}' && suCells.fog === '{"fields":{"sight":"f_see1","sightUnit":"cells"},"defaults":{"sight":60}}'
                && suYd.fog === '{"fields":{"sight":"f_see1"},"defaults":{"sight":60}}' && suYd0.fog === suYd.fog && suJunk.fog === suYd.fog && suFt.log === 'save,vision,sync,redraw' && suYd.log === 'save,vision,sync,redraw' && suNone.log === '' && suNoCore.log === '', lj([suFt, suM, suCells, suYd, suYd0, suJunk, suNone, suNoCore]));
            const smEls = { fogSightUnit: { value: '?' }, fogSight: { value: '?' } }, smDoc = { activeElement: null, querySelectorAll: () => [] }; let smCamp = null;
            const SM = new Function('ui', 'document', 'activeMap', 'activeCamp', 'mapFog', 'campFog', 'fillSightField', 'visionOf', 'lightingOn', 'fillPreviewOptions', 'gridForMap', 'brush', "'use strict';" + NL + cut('function syncMenu(') + NL + 'return syncMenu;')(
                id => smEls[id] || null, smDoc, () => ({ meta: { gridType: 'square' } }), () => smCamp, () => ({ on: true }), realCampFog, () => {}, () => ({ mode: 'all', arc: 360 }), () => true, () => {}, () => ({}), 'add');
            const smRun = (camp, focused) => { smCamp = camp; smEls.fogSightUnit.value = '?'; smDoc.activeElement = focused ? smEls.fogSightUnit : null; SM(); smDoc.activeElement = null; return smEls.fogSightUnit.value; };
            const smGot = [smRun(cmp('ft')), smRun(cmp('m')), smRun(cmp('cells')), smRun(cmp()), smRun(cmp('constructor')), smRun(cmp('ft'), true)];
            check('Lighting: the fog menu shows what sight counts in whenever it is synced (syncMenu, run strict) — the campaign\'s unit, yards when it holds none or one that is not a unit — and leaves the select alone while it has the focus',
                lj(smGot) === lj(['ft', 'm', 'cells', 'yd', 'yd', '?']) && smEls.fogSight.value === 60, lj(smGot));
            global.window = {}; await import(url('fogcore.js') + '?l4'); const pub4 = global.window.wpFogCore || {}; delete global.window;
            const selM = ixF.match(/<select id="fogSightUnit"[^>]*>([\s\S]*?)<\/select>/), selOpts = selM ? (selM[1].match(/<option value="[^"]*"/g) || []).map(o => o.slice(15, -1)) : null;
            check('Lighting: the fog menu has the sight unit select beside the default sight range, with yards, feet, metres and grid cells (yards first, no other choice); window.wpFog publishes the light one token sees another in, window.wpFogCore the unit converter and the arc query',
                !!selM && lj(selOpts) === lj(['yd', 'ft', 'm', 'cells']) && /<option value="yd">yards<\/option><option value="ft">feet<\/option><option value="m">metres<\/option><option value="cells">grid cells<\/option>/.test(selM[1]) && (ixF.match(/id="fogSightUnit"/g) || []).length === 1
                && /<input type="number" id="fogSight"[^>]*>\s*<select id="fogSightUnit"/.test(ixF) && /\n    lightSeen: lightSeen,\n/.test(fogSrc) && fogSrc.indexOf('lightSeen: lightSeen,') > fogSrc.indexOf('window.wpFog = {') && /\nfunction lightSeen\(from, to, map, camp\) \{\n/.test(fogSrc)
                && typeof pub4.lightUnit === 'function' && typeof pub4.unitCells === 'function' && typeof pub4.cellInArc === 'function' && pub4.unitCells(60, 'ft', ft5) === 12 && !!pub4.LIMITS && pub4.LIMITS.lightName === 60, lj([selOpts, Object.keys(pub4).length]));
        }
    }
    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
