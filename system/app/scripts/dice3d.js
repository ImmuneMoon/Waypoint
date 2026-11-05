// dice3d.js — animated dice (1.6.2, backlog 212). The owner, 2026-11-05, by prompt: "Your models, app draws 3D (Recommended)", the dice shown
// "Both, by a setting" (on the chat card or over the map, each person's own choice on their own computer), about a second long, and with
// reduced motion "No tumble, result at once". A roll is never made here: the host made it, the card already says it, and the dice only
// show the faces it gave. WebGL with the app's own small shaders and no library; a plain flat die where WebGL cannot be had. The dice are
// stand-ins built by dice3dcore.js until the owner's own models are there. This computer's own: wp_dice3d, card (the default), map or off.
// Published as window.wpDice3d. Fold 3 (the owner, by prompt: "The table sees each player's look", the painter opened from "Both places",
// eight ready sets and four patterns as the looks sheet drew them): a roll carries its roller's look (dicecore cleanDiceLook), which every
// screen draws its dice in; one with none is drawn in the Waypoint set. The look is this computer's own: wp_diceLook.
import * as C from './dice3dcore.js';
import { cleanDiceLook } from './dicecore.js';

var DUR = 1000, HOLD = { card: 900, map: 1400 }, STILL_HOLD = 1500, FADE = 350;

// [dice3dcheck:pure-start]
// the ready sets, each a whole look to start from; the first is the look the dice had before there were looks
var SETS = [
    { name: 'Waypoint', b: '#2b2d38', t: '#4a4d5e', n: '#e8c46a', p: 'solid' },
    { name: 'Ivory', b: '#ece4d2', t: '#d8ccb2', n: '#262626', p: 'solid' },
    { name: 'Obsidian', b: '#15151a', t: '#55566a', n: '#d9dbe2', p: 'speckle' },
    { name: 'Ember', b: '#8a1a22', t: '#e0662c', n: '#f6e8c8', p: 'two' },
    { name: 'Tide', b: '#1b3d88', t: '#7fb4ee', n: '#ffffff', p: 'marble' },
    { name: 'Jade', b: '#256c4e', t: '#a6dcbd', n: '#f3e4b2', p: 'marble' },
    { name: 'Bone', b: '#d8ccb0', t: '#a8977a', n: '#55361b', p: 'speckle' },
    { name: 'Amethyst', b: '#553685', t: '#b58ce2', n: '#f1d27a', p: 'two' }
];
var PAT_NUM = { solid: 0, marble: 1, speckle: 2, two: 3 }, DROP = 0.55;
// the painter's patterns: the stored word, its name and what it does
var PATS = [['solid', 'Solid', 'One colour.'], ['marble', 'Marbled', 'Swirls of the second colour through the first.'], ['speckle', 'Speckled', 'Small flecks of the second colour.'], ['two', 'Two-tone', 'One colour fading into the second across the die.']];
// a look as it is drawn: a roll's own where it cleans, else the Waypoint set
function lookOf(v) { var l = cleanDiceLook(v); return l || { b: SETS[0].b, t: SETS[0].t, n: SETS[0].n, p: SETS[0].p }; }
// the ready set a look is, where every colour and the pattern are that set's; '' for a look of your own
function setOf(look) { var l = cleanDiceLook(look); if (!l) return ''; for (var i = 0; i < SETS.length; i++) { var s = SETS[i]; if (l.b === s.b && l.t === s.t && l.n === s.n && l.p === s.p && !l.e) return s.name; } return ''; }
function rgbOf(h) { return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]; }
// the colours a die is drawn in, each darker on a die the roll dropped
function shadeOf(look, dropped) { var l = lookOf(look), k = dropped ? DROP : 1, m = function(h) { return rgbOf(h).map(function(v) { return v * k; }); }; return { body: m(l.b), two: m(l.t), edge: m(l.e || l.b), num: m(l.n), pat: PAT_NUM[l.p] || 0 }; }
function modeOf(v) { return v === 'map' || v === 'off' ? v : 'card'; }
// which rolls tumble: a card with dice it can show, never one sent to the GM unseen, never in a window of its own or the stream window
function diceWanted(m, env) {
    if (!env || env.mode === 'off' || env.popout || env.stream || env.hidden) return null;
    if (!m || !m.roll || !m.res || !m.res.ok || m.roll.hid === 'gm') return null;
    var d = C.rollDice(m.res); return d.dice.length ? d : null;
}
// how large a die is, in pixels across, and how many stand in a row, so that every die fits the space it is drawn in
function diceFit(n, w, h, mode) {
    var u = mode === 'map' ? Math.min(72, h / 5) : Math.min(34, h * 0.62), per, rows;
    for (var i = 0; i < 12; i++) { per = Math.max(1, Math.min(n, Math.floor((w / u - 0.3) / 1.25))); rows = Math.ceil(n / per); if (rows * 1.25 * u <= h * 0.95 && per * 1.25 * u <= w) break; u *= 0.88; }
    return { u: Math.max(10, u), per: per, rows: rows };
}
// every label a die of the set shows, each drawn once on the atlas: a 6 and a 9 underlined on a die that shows both
function underOf(kind) { var s = C.standIn(kind); return !!(s && s.faces.some(function(f) { return f.label === '9'; })) ; }
function atlasKeys() {
    var keys = [], seen = Object.create(null);
    C.KINDS.forEach(function(k) { var s = C.standIn(k), u = underOf(k); s.faces.forEach(function(f) { var key = f.label + (u && (f.label === '6' || f.label === '9') ? '_' : ''); if (f.label && !seen[key]) { seen[key] = 1; keys.push(key); } }); });
    return keys;
}
// a quad on each numbered face, a hair off it, its corners along the face's own up and right, with the corners of the label's cell on the atlas
function decalMesh(shape, cellOf) {
    var pos = [], nrm = [], uv = [], u = underOf(shape.kind);
    shape.faces.forEach(function(f) {
        var key = f.label + (u && (f.label === '6' || f.label === '9') ? '_' : ''), cell = f.label ? cellOf(key) : null; if (!cell || !f.up) return;
        var n = f.normal, up = f.up, rt = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]], h = f.size * 0.62, c = [f.center[0] + n[0] * 0.006, f.center[1] + n[1] * 0.006, f.center[2] + n[2] * 0.006];
        var corner = function(sx, sy) { pos.push(c[0] + (rt[0] * sx + up[0] * sy) * h, c[1] + (rt[1] * sx + up[1] * sy) * h, c[2] + (rt[2] * sx + up[2] * sy) * h); nrm.push(n[0], n[1], n[2]); uv.push(cell[0] + (sx + 1) / 2 * cell[2], cell[1] + (1 - sy) / 2 * cell[3]); };
        [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]].forEach(function(p) { corner(p[0], p[1]); });
    });
    return { pos: pos, nrm: nrm, uv: uv };
}
// the frames of one showing: the tumble, then held still, then faded; and where the showing stands at a time from its start
function timesOf(mode, still) { var t = still ? 0 : DUR, hold = still ? STILL_HOLD : HOLD[mode] || HOLD.card; return { tumble: t, hold: hold, fade: FADE, end: t + hold + FADE }; }
function phaseAt(T, ms) { return { t: T.tumble ? Math.min(1, ms / T.tumble) : 1, alpha: ms <= T.tumble + T.hold ? 1 : Math.max(0, 1 - (ms - T.tumble - T.hold) / T.fade), done: ms >= T.end }; }
// [dice3dcheck:pure-end]

// ---- the page ----
function pref() { try { return modeOf(localStorage.getItem('wp_dice3d')); } catch (e) { return 'card'; } }
function setPref(v) { v = modeOf(v); try { localStorage.setItem('wp_dice3d', v); } catch (e) {} return v; }
function lookPref() { var raw = null; try { raw = JSON.parse(localStorage.getItem('wp_diceLook') || 'null'); } catch (e) { raw = null; } return lookOf(raw); }
function setLookPref(v) { var l = lookOf(v); try { localStorage.setItem('wp_diceLook', JSON.stringify(l)); } catch (e) {} return l; }
function reducedNow() { try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (e) {} try { return localStorage.getItem('wp_fxReduced') === '1'; } catch (e) { return false; } }
function envNow() { var b = document.body; return { mode: pref(), popout: !!window.wpPopout, stream: !!(b && b.classList.contains('stream-mode')), hidden: !!document.hidden }; }

var _cv = null, _rig = null, _noGl = false, _ctx2 = null, _show = null;
function canvasOf() {
    if (_cv) return _cv;
    _cv = document.createElement('canvas'); _cv.id = 'dice3dLayer'; _cv.setAttribute('aria-hidden', 'true');
    _cv.style.cssText = 'position:fixed; left:0; top:0; width:0; height:0; pointer-events:none; display:none; border-radius:8px;';
    document.body.appendChild(_cv);
    _cv.addEventListener('webglcontextlost', function(e) { e.preventDefault(); _rig = null; _noGl = false; });
    return _cv;
}
var VS = 'precision mediump float; attribute vec3 aPos; attribute vec3 aNrm; attribute float aPart; attribute vec2 aUv; uniform mat4 uMvp; uniform mat3 uRot;'
    + ' varying vec3 vN; varying vec3 vP; varying float vPart; varying vec2 vUv; void main() { gl_Position = uMvp * vec4(aPos, 1.0); vN = uRot * aNrm; vP = aPos; vPart = aPart; vUv = aUv; }';
// the patterns, worked out on the die's own surface so that they turn with it: marbled swirls, specks, and a fade from one colour to the other
var FS = 'precision mediump float; varying vec3 vN; varying vec3 vP; varying float vPart; varying vec2 vUv; uniform float uTex; uniform sampler2D uAtlas; uniform vec3 uBody; uniform vec3 uTwo; uniform vec3 uEdge; uniform vec3 uNum; uniform float uPat; uniform vec3 uLight;'
    + ' float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }'
    + ' vec3 bodyAt(vec3 p) { if (uPat < 0.5) return uBody;'
    + '  if (uPat < 1.5) { float v = sin((p.x + p.y * 0.6 + p.z * 0.3) * 6.0 + 2.6 * sin(p.y * 4.3 + p.z * 2.7) + 1.8 * sin(p.z * 5.1 + p.x * 1.9)); return mix(uBody, uTwo, smoothstep(0.55, 0.98, abs(v)) * 0.85); }'
    + '  if (uPat < 2.5) { return hash(floor(p * 26.0)) > 0.86 ? uTwo : uBody; }'
    + '  return mix(uBody, uTwo, smoothstep(-0.7, 0.7, p.y * 0.8 + p.x * 0.35)); }'
    + ' void main() { vec3 n = normalize(vN); float l = 0.38 + 0.62 * max(dot(n, uLight), 0.0); float sp = pow(max(dot(reflect(-uLight, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0) * 0.3;'
    + '  if (uTex > 0.5) { float a = texture2D(uAtlas, vUv).a; if (a < 0.45) discard; gl_FragColor = vec4(uNum * (0.55 + 0.45 * l) + sp, 1.0); return; }'
    + '  vec3 c = vPart < 0.5 ? bodyAt(vP) : vPart < 1.5 ? uEdge : uNum; gl_FragColor = vec4(c * l + sp, 1.0); }';
// one canvas's own WebGL: its program, its atlas of numbers and its dice; keep holds what is drawn, for a canvas that is copied from
function rigOn(cv, keep) {
    var gl = null, o = { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: !!keep };
    try { gl = cv.getContext('webgl', o) || cv.getContext('experimental-webgl', o); } catch (e) { gl = null; }
    if (!gl) return null;
    var sh = function(type, src) { var x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return gl.getShaderParameter(x, gl.COMPILE_STATUS) ? x : null; };
    var v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS); if (!v || !f) return null;
    var p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    return { cv: cv, gl: gl, prog: p, atlas: null, cells: null, bufs: Object.create(null) };
}
function glOf() {   // tried once: a machine with no WebGL, or shaders it will not take, draws flat dice from then on
    if (_rig) return _rig; if (_noGl) return null; _noGl = true; var r = rigOn(canvasOf(), false); if (!r) return null; _rig = r; _noGl = false; return r;
}
function atlasOf(rig) {
    if (rig.atlas) return rig.atlas; var gl = rig.gl, cells = rig.cells = Object.create(null);
    var keys = atlasKeys(), N = 8, S = 128, cv = document.createElement('canvas'); cv.width = cv.height = N * S; var c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    keys.forEach(function(k, i) {
        var col = i % N, row = Math.floor(i / N), x = col * S + S / 2, y = row * S + S / 2, under = k.slice(-1) === '_', text = under ? k.slice(0, -1) : k, px = 82;
        c.font = 'bold ' + px + 'px Inter, system-ui, sans-serif'; var w = c.measureText(text).width; if (w > S * 0.82) { px = Math.floor(px * S * 0.82 / w); c.font = 'bold ' + px + 'px Inter, system-ui, sans-serif'; w = c.measureText(text).width; }
        c.fillText(text, x, y + 2); if (under) c.fillRect(x - w / 2, y + px * 0.42, w, Math.max(5, px * 0.08));
        cells[k] = [col / N, row / N, 1 / N, 1 / N];
    });
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    rig.atlas = t; return t;
}
function bufsOf(rig, kind) {
    if (rig.bufs[kind]) return rig.bufs[kind]; var gl = rig.gl, s = C.standIn(kind); if (!s) return null;
    var mk = function(a) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW); return b; };
    var d = s.decal ? decalMesh(s, function(k) { return rig.cells && rig.cells[k]; }) : null;
    rig.bufs[kind] = { shape: s, pos: mk(s.pos), nrm: mk(s.nrm), part: mk(s.part), n: s.pos.length / 3, dpos: d && d.pos.length ? mk(d.pos) : null, dnrm: d && d.pos.length ? mk(d.nrm) : null, duv: d && d.pos.length ? mk(d.uv) : null, dn: d ? d.pos.length / 3 : 0 };
    return rig.bufs[kind];
}
// matrices, column-major as WebGL reads them
function persp(fov, asp, near, far) { var f = 1 / Math.tan(fov / 2), nf = 1 / (near - far); return [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]; }
function mul4(a, b) { var o = new Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function rotOf(q) { var x = q[0], y = q[1], z = q[2], w = q[3]; return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]; }
function modelOf(r, s, x, y, z) { return [r[0] * s, r[1] * s, r[2] * s, 0, r[3] * s, r[4] * s, r[5] * s, 0, r[6] * s, r[7] * s, r[8] * s, 0, x, y, z, 1]; }

// where the showing stands now: over its card, else nowhere (a card out of sight shows none); over the map's area, else the window
function cardOf(id) {
    var log = document.getElementById('chatLog'), p = document.getElementById('chatPanel'); if (!log || !p || p.style.display === 'none' || (window.wpFloats && window.wpFloats.away(p))) return null;
    var cards = log.querySelectorAll('.chat-roll'), hit = null; for (var i = cards.length - 1; i >= 0; i--) if (cards[i].dataset && cards[i].dataset.rid === id) { hit = cards[i]; break; }
    return hit || (cards.length && !id ? cards[cards.length - 1] : null);
}
function rectNow(sh) {
    if (sh.mode === 'map') { var m = document.getElementById('main'), r = m && m.getBoundingClientRect(); if (!r || r.width < 50 || r.height < 50) r = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }; return { left: r.left, top: r.top, width: r.width, height: r.height }; }
    var c = cardOf(sh.id); if (!c) return null; var b = c.getBoundingClientRect(); if (b.width < 40 || b.height < 20) return null;
    return { left: b.left, top: b.top, width: b.width, height: Math.max(b.height, 56) };
}
function place(cv, r, mode) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    cv.style.left = r.left + 'px'; cv.style.top = r.top + 'px'; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    var p = mode === 'card' ? document.getElementById('chatPanel') : null, bg = '', z = 90005;   // over the map: above Table Chat, which would hide half the row (the dice take no pointer), and under every menu and notice
    if (p) { var cs = getComputedStyle(p); bg = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'rgba(20, 21, 26, 0.95)'; var zz = parseInt(cs.zIndex, 10); z = isFinite(zz) ? zz + 1 : 9600; }
    cv.style.background = bg; cv.style.zIndex = String(z);
}

function play(m) {
    var env = envNow(), want = diceWanted(m, env); if (!want) return false;
    var still = reducedNow(), id = m.roll && typeof m.roll.id === 'string' ? m.roll.id : '', seed = C.seedOf(id || String(m.roll.ts || '') + String(m.roll.expr || ''));
    var sh = { id: id, mode: env.mode, dice: want.dice, look: lookOf(m.roll.dl), still: still, T: timesOf(env.mode, still), t0: 0, seed: seed, tumbles: null, fit: null };
    if (_show && _show.raf) cancelAnimationFrame(_show.raf);
    _show = sh; var cv = canvasOf();
    // the card is drawn a moment after it is pushed, so the showing looks for it on its first frames
    var start = function(ts) { if (_show !== sh) return; if (!sh.t0) sh.t0 = ts; frame(ts); };
    sh.raf = requestAnimationFrame(start); cv.style.opacity = '0';
    return true;
}
function frame(ts) {
    var sh = _show; if (!sh) return; var cv = canvasOf(), ms = ts - sh.t0, r = rectNow(sh);
    if (!r) { if (ms > 400) return stop(); sh.raf = requestAnimationFrame(frame); return; }
    var ph = phaseAt(sh.T, ms); if (ph.done) return stop();
    place(cv, r, sh.mode); cv.style.display = 'block'; cv.style.opacity = String(ph.alpha);
    var n = sh.dice.length, fit = diceFit(n, r.width, r.height, sh.mode);
    if (!sh.tumbles || !sh.fit || sh.fit.per !== fit.per) {
        var L = C.layout(n, fit.per * 1.25);
        sh.tumbles = sh.dice.map(function(d, i) { var s = C.standIn(d.kind), q = C.landTurn(s, d.value, C.uprightSpin(s, d.value) + (C.chance(sh.seed + i)() - 0.5) * 0.5); return q ? C.tumble(sh.seed + i * 7919, q, L[i].x, L[i].y, sh.still) : null; });
    }
    sh.fit = fit;
    if (!drawGl(cv, sh, ph.t, r, fit)) draw2d(cv, sh, ph.t, r, fit);
    sh.raf = requestAnimationFrame(frame);
}
function stop() { var cv = canvasOf(); cv.style.display = 'none'; _show = null; return false; }
// the light, the atlas and the program, once a frame of a rig
function rigFrame(rig) {
    var gl = rig.gl, P = rig.prog; atlasOf(rig); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.useProgram(P);   // no culling: a die is convex and the depth test hides its far side, whichever way a face is wound
    var L = [-0.42, 0.52, 0.74], ll = Math.hypot(L[0], L[1], L[2]);
    gl.uniform3f(gl.getUniformLocation(P, 'uLight'), L[0] / ll, L[1] / ll, L[2] / ll); gl.uniform1i(gl.getUniformLocation(P, 'uAtlas'), 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rig.atlas);
}
// one die: its body in the look's colours and pattern, then its numbers
function dieDraw(rig, b, R, MVP, cols) {
    var gl = rig.gl, P = rig.prog, un = function(n) { return gl.getUniformLocation(P, n); }, at = function(n) { return gl.getAttribLocation(P, n); };
    var aPos = at('aPos'), aNrm = at('aNrm'), aPart = at('aPart'), aUv = at('aUv');
    var bind = function(loc, buf, size) { if (loc < 0) return; if (!buf) { gl.disableVertexAttribArray(loc); return; } gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
    gl.uniformMatrix4fv(un('uMvp'), false, new Float32Array(MVP)); gl.uniformMatrix3fv(un('uRot'), false, new Float32Array(R));
    gl.uniform3fv(un('uBody'), cols.body); gl.uniform3fv(un('uTwo'), cols.two); gl.uniform3fv(un('uEdge'), cols.edge); gl.uniform3fv(un('uNum'), cols.num); gl.uniform1f(un('uPat'), cols.pat);
    gl.uniform1f(un('uTex'), 0); bind(aPos, b.pos, 3); bind(aNrm, b.nrm, 3); bind(aPart, b.part, 1); if (aUv >= 0) { gl.disableVertexAttribArray(aUv); gl.vertexAttrib2f(aUv, 0, 0); }
    gl.drawArrays(gl.TRIANGLES, 0, b.n);
    if (b.dpos) { gl.uniform1f(un('uTex'), 1); bind(aPos, b.dpos, 3); bind(aNrm, b.dnrm, 3); if (aPart >= 0) { gl.disableVertexAttribArray(aPart); gl.vertexAttrib1f(aPart, 2); } bind(aUv, b.duv, 2); gl.drawArrays(gl.TRIANGLES, 0, b.dn); }
}
function drawGl(cv, sh, t, r, fit) {
    var rig = glOf(); if (!rig) return false; var gl = rig.gl;
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); rigFrame(rig);
    var fov = 0.52, H = r.height / 2 / fit.u, D = H / Math.tan(fov / 2), P = persp(fov, r.width / r.height, Math.max(0.5, D - 6), D + 6), V = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -D, 1], VP = mul4(P, V);
    var kept = shadeOf(sh.look, false), drop = shadeOf(sh.look, true);
    sh.dice.forEach(function(d, i) {
        var b = bufsOf(rig, d.kind), tb = sh.tumbles[i]; if (!b || !tb) return; var s = tb(t), R = rotOf(s.q), M = modelOf(R, 0.5, s.x, s.y, s.h);
        dieDraw(rig, b, R, mul4(VP, M), d.kept ? kept : drop);
    });
    return true;
}
// where 3D cannot be had: each die a rounded square that drops in and settles on its number
function draw2d(cv, sh, t, r, fit) {
    if (!_ctx2) { var c0 = null; try { c0 = cv.getContext('2d'); } catch (e) { c0 = null; } if (!c0) { var fresh = cv.cloneNode(false); cv.parentNode.replaceChild(fresh, cv); _cv = cv = fresh; cv.width = Math.round(r.width * (window.devicePixelRatio || 1)); cv.height = Math.round(r.height * (window.devicePixelRatio || 1)); c0 = cv.getContext('2d'); } _ctx2 = c0; }   // a canvas that once held WebGL gives no 2d context, so the flat dice take a fresh one
    var c = _ctx2; if (!c) return; var dpr = cv.width / r.width;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, r.width, r.height);
    sh.dice.forEach(function(d, i) {
        var tb = sh.tumbles[i]; if (!tb) return; var s = tb(t), sz = fit.u * (1 + s.h * 0.25), x = r.width / 2 + s.x * fit.u, y = r.height / 2 - s.y * fit.u, f = C.standIn(d.kind).faces.filter(function(x) { return x.n === d.value; })[0];
        c.save(); c.translate(x, y); c.rotate((1 - t) * 6 * (i % 2 ? 1 : -1)); var cl = shadeOf(sh.look, !d.kept); c.fillStyle = 'rgb(' + cl.body.map(function(v) { return Math.round(v * 255); }).join(',') + ')';
        c.beginPath(); if (c.roundRect) c.roundRect(-sz / 2, -sz / 2, sz, sz, sz * 0.18); else c.rect(-sz / 2, -sz / 2, sz, sz); c.fill();
        c.fillStyle = 'rgb(' + cl.num.map(function(v) { return Math.round(v * 255); }).join(',') + ')'; c.font = 'bold ' + Math.round(sz * 0.5) + 'px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        if (t > 0.6 && f) c.fillText(f.label, 0, 1); c.restore();
    });
}

// ---- the painter (fold 3): opened from Settings and from the dice roller. What is picked is kept at once, on this computer alone, and every
// roll made here carries it. Its preview draws six dice that rock slowly (still under reduced motion), the last one as a die the roll dropped.
var PV_DICE = [['d4', 4], ['d6', 6], ['d8', 8], ['d10', 7], ['d12', 12], ['d20', 20, true]], _pv = null, _paint = null;
function pvPose(kind, value, t, k) {
    var sp = C.standIn(kind), land = sp ? C.landTurn(sp, value, C.uprightSpin(sp, value)) : null; if (!land) return null;
    return C.qMul(C.qMul(C.qAxis([0, 1, 0], 0.55 * Math.sin(t * 0.6 + k)), C.qAxis([1, 0, 0], 0.42 + 0.12 * Math.sin(t * 0.45 + k * 1.7))), land);
}
function pvDraw(cv, look, t) {
    var w = cv.width, h = cv.height, n = PV_DICE.length, sz = Math.floor(Math.min(h, w / n)), x0 = Math.floor((w - n * sz) / 2), y0 = Math.floor((h - sz) / 2);
    if (!_pv || _pv.cv !== cv) _pv = { cv: cv, rig: rigOn(cv, false), raf: 0 };
    var rig = _pv.rig;
    if (rig) {
        var gl = rig.gl, f = 1 / Math.tan(0.28), near = 1, far = 9, nf = 1 / (near - far), P = [f, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
        gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); rigFrame(rig);
        PV_DICE.forEach(function(d, i) { var b = bufsOf(rig, d[0]), q = pvPose(d[0], d[1], t, i * 1.3); if (!b || !q) return; var R = rotOf(q); gl.viewport(x0 + i * sz, y0, sz, sz); dieDraw(rig, b, R, mul4(P, modelOf(R, 1, 0, 0, -4.6)), shadeOf(look, !!d[2])); });
        return;
    }
    var c = null; try { c = cv.getContext('2d'); } catch (e) { c = null; } if (!c) return;   // flat dice where WebGL cannot be had
    c.clearRect(0, 0, w, h); c.textAlign = 'center'; c.textBaseline = 'middle';
    PV_DICE.forEach(function(d, i) { var cl = shadeOf(look, !!d[2]), x = x0 + i * sz + sz / 2, y = y0 + sz / 2, a = sz * 0.36, col = function(v) { return 'rgb(' + v.map(function(u) { return Math.round(u * 255); }).join(',') + ')'; };
        c.fillStyle = col(cl.body); c.beginPath(); if (c.roundRect) c.roundRect(x - a, y - a, a * 2, a * 2, a * 0.3); else c.rect(x - a, y - a, a * 2, a * 2); c.fill();
        c.fillStyle = col(cl.num); c.font = 'bold ' + Math.round(a * 0.9) + 'px Inter, system-ui, sans-serif'; c.fillText(String(d[1]), x, y + 1); });
}
function pvFit(cv) { var dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(60, Math.round(cv.clientWidth * dpr)), h = Math.max(30, Math.round(cv.clientHeight * dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } }
function paintShown() { var m = document.getElementById('dicePaintModal'); return !!(m && m.style.display !== 'none'); }
function pvRun() {
    var cv = document.getElementById('dicePaintPreview'); if (!cv || !paintShown()) return;
    if (_pv && _pv.raf) { cancelAnimationFrame(_pv.raf); _pv.raf = 0; }
    var still = reducedNow(), t0 = 0;
    var tick = function(ts) { if (!paintShown()) { if (_pv) _pv.raf = 0; return; } if (!t0) t0 = ts; pvFit(cv); pvDraw(cv, _paint, still ? 0 : (ts - t0) / 1000); if (_pv) _pv.raf = still ? 0 : requestAnimationFrame(tick); };
    var raf = requestAnimationFrame(tick); if (_pv) _pv.raf = raf;
}
function paintSync() {
    var l = _paint, set = setOf(l), q = function(id) { return document.getElementById(id); };
    var sets = q('dicePaintSets'); if (sets) Array.prototype.forEach.call(sets.querySelectorAll('button[data-set]'), function(b) { var on = b.dataset.set === set; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    var pats = q('dicePaintPats'); if (pats) Array.prototype.forEach.call(pats.querySelectorAll('button[data-pat]'), function(b) { var on = b.dataset.pat === l.p; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    [['dicePaintBody', l.b], ['dicePaintTwo', l.t], ['dicePaintNum', l.n], ['dicePaintEdge', l.e || l.b]].forEach(function(x) { var el = q(x[0]); if (el && el.value !== x[1]) el.value = x[1]; });
    var own = q('dicePaintOwn'); if (own) own.textContent = set ? 'The ' + set + ' set.' : 'Your own look.';
}
function paintSet(next) { _paint = setLookPref(next); paintSync(); if (!_pv || !_pv.raf) pvRun(); }
function paintOpen() {
    var m = document.getElementById('dicePaintModal'); if (!m) return false;
    _paint = lookPref(); m.style.display = 'flex'; paintSync(); pvRun();
    var first = m.querySelector('#dicePaintSets button.on') || m.querySelector('#dicePaintSets button'); if (first) { try { first.focus(); } catch (e) {} }
    return true;
}
function paintClose() { var m = document.getElementById('dicePaintModal'); if (m) m.style.display = 'none'; if (_pv && _pv.raf) { cancelAnimationFrame(_pv.raf); _pv.raf = 0; } }
function paintWire() {
    var q = function(id) { return document.getElementById(id); }, m = q('dicePaintModal'); if (!m || m.dataset.wired) return; m.dataset.wired = '1';
    var sets = q('dicePaintSets'), pats = q('dicePaintPats');
    if (sets) SETS.forEach(function(st) { var b = document.createElement('button'); b.type = 'button'; b.className = 'tool ghost dp-chip'; b.dataset.set = st.name; b.textContent = st.name; b.addEventListener('click', function() { paintSet({ b: st.b, t: st.t, n: st.n, p: st.p }); }); sets.appendChild(b); });
    if (pats) PATS.forEach(function(pt) { var b = document.createElement('button'); b.type = 'button'; b.className = 'tool ghost dp-chip'; b.dataset.pat = pt[0]; b.title = pt[2]; b.textContent = pt[1]; b.addEventListener('click', function() { paintSet(Object.assign({}, _paint, { p: pt[0] })); }); pats.appendChild(b); });
    [['dicePaintBody', 'b'], ['dicePaintTwo', 't'], ['dicePaintNum', 'n'], ['dicePaintEdge', 'e']].forEach(function(x) { var el = q(x[0]); if (el) el.addEventListener('input', function() { var o = Object.assign({}, _paint); o[x[1]] = el.value; paintSet(o); }); });
    var cl = q('dicePaintCloseBtn'); if (cl) cl.addEventListener('click', paintClose);
    m.addEventListener('mousedown', function(e) { if (e.target === m) paintClose(); });
    ['setDicePaintBtn', 'dicePaintBtn'].forEach(function(id) { var b = q(id); if (b) b.addEventListener('click', function() { paintOpen(); }); });
    window.addEventListener('resize', function() { if (paintShown()) pvRun(); });
}
if (typeof document !== 'undefined' && document.getElementById) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintWire); else paintWire(); }

if (typeof window !== 'undefined') window.wpDice3d = { play: play, mode: pref, setMode: setPref, modeOf: modeOf, wanted: diceWanted, look: lookPref, setLook: setLookPref, paint: paintOpen, sets: SETS };
export { modeOf, diceWanted, diceFit, atlasKeys, decalMesh, timesOf, phaseAt, SETS, PATS, lookOf, setOf, shadeOf };
