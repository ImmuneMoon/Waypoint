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
const K = new Function('state', viewSrc.slice(a, z) + '\nreturn { uprightOf: uprightOf, uprightTurn: uprightTurn, levelTurn: levelTurn, fogBox: fogBox, pieceTurn: pieceTurn, viewSource: viewSource, V: V, rad: rad, isTurned: isTurned, turnTo: turnTo, bxy: bxy, dxy: dxy, sxy: sxy, pivotTo: pivotTo, transform: transform, headingOf: headingOf, moveHeading: moveHeading };')(state);
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

// fold 3: what stays upright
check('every text box stays upright, and a character token where Token facing is off; never a waiting token or anything else',
    K.uprightOf({ type: 'text' }, true) && K.uprightOf({ type: 'image', isChar: true }, false) && !K.uprightOf({ type: 'image', isChar: true }, true)
    && !K.uprightOf({ type: 'image' }, false) && !K.uprightOf({ type: 'text', waiting: true }, false) && !K.uprightOf(null, false));
check('a piece stays upright by turning back the turn of the view, and wears nothing of its own on a map that is not turned', K.uprightTurn(-60) === '60deg' && K.uprightTurn(37.123) === '-37.12deg' && K.uprightTurn(0) === '' && K.uprightTurn(0.005) === '');
// fold 4: turn to movement and the GM's angle
const tx = { type: 'text' }, tk = { type: 'image', isChar: true };
check('a token faces the way it last moved where Turn to movement is on and the view follows no token; upright while it follows one; text always reads across',
    K.pieceTurn(tk, 0, false, true, 90) === '90deg' && K.pieceTurn(tk, -30, false, true, 90) === '90deg' && K.pieceTurn(tk, 0, false, true, null) === '' && K.pieceTurn(tk, -30, true, true, 90) === '30deg'
    && K.pieceTurn(tk, -30, false, false, 90) === '30deg' && K.pieceTurn(tx, -30, false, true, 90) === '30deg' && K.pieceTurn(tk, 0, false, false, 90) === '');
check('which turn a screen wears: the GM turn where it holds or the screen follows no token, else its own, else none',
    K.viewSource({ deg: 30 }, false) === 'gm' && K.viewSource({ deg: 30 }, true) === 'own' && K.viewSource({ deg: 30, hold: true }, true) === 'gm' && K.viewSource(null, true) === 'own' && K.viewSource(null, false) === '');
{
    const ccSrc = read('scripts/compasscore.js').replace(/^export .*$/m, '').replace(/^if \(typeof window.*$/m, ''), CV = new Function(ccSrc + '\nreturn cleanViewTurn;')();
    check('the GM turn of a map is kept as whole degrees from -179 to 180 and a hold only as true, and a map with neither keeps no key',
        J(CV({ deg: 30 })) === J({ deg: 30 }) && J(CV({ deg: 270.4 })) === J({ deg: -90 }) && J(CV({ deg: -180 })) === J({ deg: 180 }) && J(CV({ deg: 0, hold: true })) === J({ hold: true })
        && CV({ deg: 0 }) === null && CV({ deg: 360 }) === null && J(CV({ deg: 15, hold: 'yes' })) === J({ deg: 15 }) && CV({ deg: 'x' }) === null && CV(null) === null && CV([30]) === null && J(CV({ deg: 1e400, hold: true })) === J({ hold: true }));
}
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
check('Turn with my token is this computer\'s own (wp_viewTurn, off unless it says on), and the one thing view.js stores is the GM\'s turn of the map, meta.viewTurn, through its cleaner and the save, by the GM alone; nothing is sent by hand',
    viewSrc.includes("localStorage.getItem('wp_viewTurn') === 'on'") && !/net\(\)\.(send|broadcast)/.test(viewSrc)
    && (viewSrc.match(/\.meta\.[a-zA-Z]+/g) || []).every(m => m === '.meta.viewTurn') && (viewSrc.match(/\bsave\(\)/g) || []).length === 1
    && viewSrc.includes('var m = getActiveMap(); if (!m || !gmHere()) return false; if (!m.meta) m.meta = {};\n    var v = cleanViewTurn({ deg: deg, hold: hold }); if (v) m.meta.viewTurn = v; else delete m.meta.viewTurn;'));
check('a press held on the board holds the view still until it is let go', viewSrc.includes("if (_down) { _raf = ") && viewSrc.includes("window.addEventListener('pointerdown', function(e) { var w = wrapEl(); if (w && e.target && w.contains(e.target)) _down = true; }, true);"));
const help = ix.slice(ix.indexOf('<h4>Turning with your token</h4>'));
check('Help says it, and both release notes', ix.includes('<h4>Turning with your token</h4>') && help.includes('<b>Turn with my token</b>')
    && ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n').includes('- Turn with my token, in the View menu, turns the map under the token you\n')));

check('folds 3 and 4 are wired: the body says the view is turned and the rulers step aside by visibility alone, the minimap frames and draws the turned screen and a press on it centres a point where the board draws it, a corner compass turns with the map and its rose reads north back with the turn taken off',
    viewSrc.includes("document.body.classList.toggle('view-turned', isTurned());") && read('style.css').includes('body.view-turned #rulerTop, body.view-turned #rulerLeft, body.view-turned #rulerCursorX, body.view-turned #rulerCursorY { visibility: hidden; }')
    && main.includes('window.wpView.screenRect ? window.wpView.screenRect() : null;') && main.includes('wrap.scrollLeft = tv ? tv.x - wrap.clientWidth / 2 : wx * z - wrap.clientWidth / 2;') && viewSrc.includes('window.renderMinimap();')
    && viewSrc.includes("rose.classList.contains('compass-map') || !r ? ''") && read('scripts/compass.js').includes('n = ((Math.round(n - window.wpView.deg()) % 360) + 360) % 360;'));
check('Turn to movement is a VTT feature a player may switch off, the GM sets everyone\'s turn in the View menu, and a player\'s app and a file keep it only as the cleaner keeps it',
    /\{ id: 'moveturn', label: 'Turn to movement', legacyKey: null \}/.test(read('scripts/vtt.js')) && ix.includes('id="wbViewAll"') && ix.includes('id="wbViewHold"')
    && read('scripts/net.js').includes('CPv.cleanViewTurn(m.meta.viewTurn)') && read('scripts/cleanup.js').includes('CPt.cleanViewTurn(it.meta.viewTurn)')
    && help.includes('<b>Everyone&rsquo;s map</b>') && help.includes('<b>Turn to movement</b>')
    && ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n').includes('- Turn to movement, a new VTT setting, turns a token that faces no way to\n')));
{ const b0 = K.fogBox(800, 600, 0, 0, 0, 400, 300), b90 = K.fogBox(800, 600, Math.PI / 2, 0, 0, 400, 300), b45 = K.fogBox(800, 600, Math.PI / 4, 30, -10, 100, 50);
  const inside = (b, x, y) => x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h, back = (a, tx, ty, px, py, x, y) => [px + Math.cos(a) * (x - tx - px) + Math.sin(a) * (y - ty - py), py - Math.sin(a) * (x - tx - px) + Math.cos(a) * (y - ty - py)];
  check('the fog\'s remembered ground reaches a turned screen\'s corners: fogBox is the box, in the fog\'s unturned space, that holds the screen\'s four corners turned back (unturned, the screen itself with two pixels to spare; a quarter turn about the middle, the screen on its side), and the overlay draws its layer there',
    JSON.stringify(b0) === JSON.stringify({ x: -2, y: -2, w: 804, h: 604 }) && JSON.stringify(b90) === JSON.stringify({ x: 98, y: -102, w: 604, h: 804 })
    && [[0, 0], [800, 0], [800, 600], [0, 600]].every(p => inside(b45, ...back(Math.PI / 4, 30, -10, 100, 50, p[0], p[1])))
    && fog.includes('ctx.drawImage(memLay, memBox ? memBox.x : 0, memBox ? memBox.y : 0);') && fog.includes('memBox = turnV && turnV.fogBox ? turnV.fogBox(W, H) : null') && viewSrc.includes('fogBox: function(W, H) { if (!isTurned()'),
    JSON.stringify([b0, b90, b45])); }
check('a token\'s words read level: its own turn taken back from them as a value always written (levelTurn), and the style sheet turns them, the stream names and the ruler\'s and marks\' words by the board\'s turn too',
    K.levelTurn(-30) === '30deg' && K.levelTurn(45.256) === '-45.26deg' && K.levelTurn(0) === '0deg' && K.levelTurn('x') === '0deg' && K.levelTurn(undefined) === '0deg'
    && viewSrc.includes("el.style.setProperty('--lvl-own', t)") && viewSrc.includes("if (!w || !w.isChar || w.waiting || !(r || want[w.id])) return;")
    && read('style.css').includes('#whiteboard .wb-item > .token-initials, #whiteboard .token-fx .tfx { rotate: calc(var(--lvl-own, 0deg) - var(--view-turn, 0deg)); }')
    && read('style.css').includes('#streamNames .stream-name { rotate: calc(var(--view-turn, 0deg) * -1); transform-origin: 0 50%; }')
    && read('style.css').includes('#measureLayer text, #tagLayer text { transform-box: fill-box; transform-origin: center; rotate: calc(var(--view-turn, 0deg) * -1); }'));
console.log(pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
