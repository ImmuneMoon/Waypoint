// Waypoint — the view that turns with your token (1.6.2, backlog 82b, fold 2): view.js's core run for real, and its wiring.
// Plain Node, no dependencies, exits 1 on any failure.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), APP = path.join(ROOT, 'system', 'app');
const read = p => fs.readFileSync(path.join(APP, p), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
const J = JSON.stringify;

const viewSrc = read('scripts/view.js');
const a = viewSrc.indexOf('// [viewcheck:core-start]'), z = viewSrc.indexOf('// [viewcheck:core-end]');
check('view.js holds its core between its markers', a >= 0 && z > a);
const state = { zoomLevel: 1 };
const K = new Function('state', viewSrc.slice(a, z) + '\nreturn { V: V, rad: rad, isTurned: isTurned, turnTo: turnTo, bxy: bxy, dxy: dxy, sxy: sxy, pivotTo: pivotTo, transform: transform, headingOf: headingOf, moveHeading: moveHeading };')(state);
const V = K.V, near = (p, q, e) => Math.abs(p - q) <= (e || 1e-6);

// the shortest way round
check('turnTo goes the short way round, from -180 to 180', J([K.turnTo(0, 90), K.turnTo(0, 270), K.turnTo(350, 10), K.turnTo(10, 350), K.turnTo(0, 180), K.turnTo(-60, -60)]) === J([90, -90, 20, -20, 180, 0]));

// unturned: the board's plain transform and the plain reading
Object.assign(V, { deg: 0, ox: 0, oy: 0, tx: 0, ty: 0 }); state.zoomLevel = 1.5;
const r0 = { left: 10, top: 20 }, w0 = { scrollLeft: 100, scrollTop: 50 }, p0 = K.bxy(310, 170, r0, w0);
check('unturned: the transform is the zoom alone, and a pointer reads as (screen - box + scroll) / zoom', K.transform(1.5) === 'scale(1.5)' && !K.isTurned() && near(p0.x, (310 - 10 + 100) / 1.5) && near(p0.y, (170 - 20 + 50) / 1.5), J([K.transform(1.5), p0]));

// seeded round trips: a board point drawn on screen and read back by the pointer is the same point, with an offset and at any zoom
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let worst = 0;
for (let i = 0; i < 2000; i++) {
    Object.assign(V, { deg: rnd() * 360 - 180, ox: rnd() * 3000, oy: rnd() * 3000, tx: rnd() * 800 - 400, ty: rnd() * 800 - 400 }); state.zoomLevel = 0.25 + rnd() * 3;
    const bx = rnd() * 4000, by = rnd() * 4000, s = K.sxy(bx, by), r = { left: rnd() * 300, top: rnd() * 300 }, w = { scrollLeft: rnd() * 2000, scrollTop: rnd() * 2000 };
    const b = K.bxy(s.x + r.left - w.scrollLeft, s.y + r.top - w.scrollTop, r, w); worst = Math.max(worst, Math.abs(b.x - bx), Math.abs(b.y - by));
}
check('a pointer over a board point reads that point back, turned about any point, with any offset, scroll and zoom (2,000 seeded)', worst < 1e-6, worst);

// a step on screen is the same step on the board
worst = 0;
for (let i = 0; i < 1000; i++) {
    Object.assign(V, { deg: rnd() * 360 - 180, ox: rnd() * 3000, oy: rnd() * 3000, tx: rnd() * 400, ty: rnd() * 400 }); state.zoomLevel = 0.25 + rnd() * 3;
    const ax = rnd() * 4000, ay = rnd() * 4000, dx = rnd() * 200 - 100, dy = rnd() * 200 - 100, s1 = K.sxy(ax, ay), d = K.dxy(dx, dy), s2 = K.sxy(ax + d.x, ay + d.y);
    worst = Math.max(worst, Math.abs(s2.x - s1.x - dx), Math.abs(s2.y - s1.y - dy));
}
check('a drag of so many pixels on screen moves a board point so many pixels on screen, whatever the turn (1,000 seeded)', worst < 1e-6, worst);

// the point it turns about moves: nothing on screen moves
worst = 0;
for (let i = 0; i < 1000; i++) {
    Object.assign(V, { deg: rnd() * 360 - 180, ox: rnd() * 3000, oy: rnd() * 3000, tx: rnd() * 400, ty: rnd() * 400 }); state.zoomLevel = 0.25 + rnd() * 3;
    const pts = [[rnd() * 4000, rnd() * 4000], [rnd() * 4000, rnd() * 4000]], before = pts.map(p => K.sxy(p[0], p[1]));
    K.pivotTo(rnd() * 3000, rnd() * 3000); const after = pts.map(p => K.sxy(p[0], p[1]));
    before.forEach((b, j) => { worst = Math.max(worst, Math.abs(b.x - after[j].x), Math.abs(b.y - after[j].y)); });
}
check('the point it turns about moves (a token walks, another is picked) and nothing on screen moves (1,000 seeded)', worst < 1e-6, worst);

// the transform the board wears draws a board point where sxy says
{
    Object.assign(V, { deg: -60, ox: 735, oy: 468, tx: 12, ty: -8 }); state.zoomLevel = 0.75;
    const t = K.transform(0.75), m = t.match(/^translate\(([-\d.e]+)px, ([-\d.e]+)px\) rotate\(([-\d.e]+)deg\) translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)$/);
    let ok = !!m;
    if (m) {
        const [t1x, t1y, deg, t2x, t2y, sc] = m.slice(1).map(Number), c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
        [[0, 0], [735, 468], [1200, 90], [30, 2000]].forEach(([bx, by]) => {
            const x = bx * sc + t2x, y = by * sc + t2y, X = c * x - s * y + t1x, Y = s * x + c * y + t1y, q = K.sxy(bx, by);
            if (!near(X, q.x, 1e-6) || !near(Y, q.y, 1e-6)) ok = false;
        });
    }
    check('turned, the board\'s transform (translate, rotate, translate, scale, from its top left) draws each point where the view says', ok && K.isTurned(), t);
}
// an offset alone still counts as turned, so the transform keeps it
Object.assign(V, { deg: 0, tx: 3, ty: 0 });
check('an offset with no turn still wears the full transform, so nothing jumps while it lasts', K.isTurned() && K.transform(1) !== 'scale(1)');

// headings
check('a token\'s heading is its facing where facing is on (rot and front), else the way it last moved, else none',
    K.headingOf({ rot: 60, front: 0 }, true, null) === 60 && K.headingOf({ rot: 300, front: 90 }, true, null) === 30 && K.headingOf({ rot: 60 }, false, { h: 135 }) === 135 && K.headingOf({ rot: 60 }, false, {}) === null && K.headingOf(null, true) === null);
check('the way it went: degrees clockwise from up, nothing for a step of 4 pixels or less',
    near(K.moveHeading({ x: 0, y: 0 }, { x: 0, y: -10 }), 0) && near(K.moveHeading({ x: 0, y: 0 }, { x: 10, y: 0 }), 90) && near(K.moveHeading({ x: 0, y: 0 }, { x: 0, y: 10 }), 180) && near(K.moveHeading({ x: 0, y: 0 }, { x: -10, y: 0 }), 270)
    && K.moveHeading({ x: 0, y: 0 }, { x: 3, y: 2 }) === null && K.moveHeading(null, { x: 1, y: 1 }) === null);

// the wiring
const ix = read('index.html'), main = read('scripts/main.js'), fog = read('scripts/fog.js');
check('the page loads view.js as a module after the compass', ix.includes('<script type="module" src="scripts/compass.js"></script>\n<script type="module" src="scripts/view.js"></script>'));
check('the View menu has its tick, Turn with my token, off in the page', /<button class="wb-tool-btn view-tick" id="wbViewTurnBtn" role="menuitemcheckbox" aria-checked="false" title="[^"]+">[\s\S]*?Turn with my token<\/button>/.test(ix) && (ix.match(/id="wbViewTurnBtn"/g) || []).length === 1);
check('main.js sets the board\'s transform through the view in both places it sets the zoom', (main.match(/window\.wpView && window\.wpView\.transform \? window\.wpView\.transform\(state\.zoomLevel\) : 'scale\('\+state\.zoomLevel\+'\)'/g) || []).length === 2);
check('the fog turns its cells, its marks and the word over a dark cell about the same point, and covers a turned screen\'s corners',
    fog.includes('if (turnV) turnV.turnCtx(ctx);   // the fog\'s cells turn about the same point as the board') && (fog.match(/ctx\.save\(\); if \(turnV\) turnV\.turnCtx\(ctx\);\n/g) || []).length === 2 && fog.includes('(turnV ? Math.hypot(W, H) : 0)'));
['whiteboard.js', 'datamap.js', 'fog.js'].forEach(f => {
    const s = read('scripts/' + f);
    check(f + ' reads the pointer through the view helpers (wbX, wbY, wbDX, wbDY), kept between its markers', s.includes('// [view:helpers-start]') && s.includes('// [view:helpers-end]') && /function wbX\(cx, cy, r, w\)/.test(s));
});
check('view.js is this computer\'s own: wp_viewTurn, off unless it says on, nothing stored on a map or sent',
    viewSrc.includes("localStorage.getItem('wp_viewTurn') === 'on'") && !/net\(\)\.(send|broadcast)|\.meta\.|save\(/.test(viewSrc));
check('a press held on the board holds the view still until it is let go', viewSrc.includes("if (_down) { _raf = ") && viewSrc.includes("window.addEventListener('pointerdown', function(e) { var w = wrapEl(); if (w && e.target && w.contains(e.target)) _down = true; }, true);"));
const help = ix.slice(ix.indexOf('<h4>Turning with your token</h4>'));
check('Help says it, and both release notes', ix.includes('<h4>Turning with your token</h4>') && help.includes('<b>Turn with my token</b>')
    && ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n').includes('- Turn with my token, in the View menu, turns the map under the token you\n')));

console.log(pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
