/* Animated dice, the pure half (1.6.2, backlog 212). The owner, 2026-11-05, by prompt: "Your models, app draws 3D (Recommended)": the
   owner models the dice in Blender and exports small model files, and Waypoint draws them in real 3D with its own code, landing each die on
   the face the host already rolled. Until a model is there each die is a stand-in built here from plain geometry. Nothing here touches a
   page: shapes, a reader for a Wavefront model file (.obj), the turn that lands a face toward the viewer, a tumble that ends exactly on it,
   and which dice a roll's result shows. The roll itself is never made here: the animation only shows what the host made.
   A model file names each face by a group face1, face2 ... (face0 is read as the highest number, as a d10's 0 is 10), and each part by
   its material: body, edge or number. A model with number material has its numbers modelled; one without has them drawn on its faces.
   Published as window.wpDice3dCore. */
'use strict';

var LIMITS = Object.freeze({ dice: 12, objChars: 4000000, verts: 60000, tris: 120000 });
var PHI = (1 + Math.sqrt(5)) / 2;
var PARTS = Object.freeze(['body', 'edge', 'number']);

// ---- vectors and quaternions ([x, y, z, w]) ----
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function len(a) { return Math.sqrt(dot(a, a)); }
function norm(a) { var l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1]; }
function qAxis(axis, ang) { var a = norm(axis), s = Math.sin(ang / 2); return [a[0] * s, a[1] * s, a[2] * s, Math.cos(ang / 2)]; }
function qMul(a, b) {
    return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
            a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
function qNorm(q) { var l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
function qRot(q, v) { var u = [q[0], q[1], q[2]], t = cross(u, v); t = [2 * t[0], 2 * t[1], 2 * t[2]]; var c = cross(u, t); return [v[0] + q[3] * t[0] + c[0], v[1] + q[3] * t[1] + c[1], v[2] + q[3] * t[2] + c[2]]; }
// the shortest turn that takes direction a to direction b
function qFromTo(a, b) {
    a = norm(a); b = norm(b); var d = dot(a, b);
    if (d < -0.999999) { var ax = cross([1, 0, 0], a); if (len(ax) < 1e-6) ax = cross([0, 1, 0], a); return qAxis(ax, Math.PI); }
    var c = cross(a, b); return qNorm([c[0], c[1], c[2], 1 + d]);
}
function qSlerp(a, b, t) {
    var d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }
    if (d > 0.9995) return qNorm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
    var th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
}

// ---- a seeded chance, so one roll tumbles alike each time it is drawn ----
function seedOf(text) { var h = 2166136261 >>> 0, s = String(text); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function chance(seed) { var a = seed >>> 0; return function() { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- the stand-in dice ----
// a convex solid from its corners and the direction of each face: a face is the corners furthest along its direction, in turn around it
function solid(verts, dirs) {
    return dirs.map(function(d) {
        d = norm(d); var best = -Infinity; verts.forEach(function(v) { best = Math.max(best, dot(v, d)); });
        var on = []; verts.forEach(function(v, i) { if (dot(v, d) > best - 1e-6 * Math.max(1, Math.abs(best))) on.push(i); });
        var c = [0, 0, 0]; on.forEach(function(i) { c[0] += verts[i][0]; c[1] += verts[i][1]; c[2] += verts[i][2]; }); c = [c[0] / on.length, c[1] / on.length, c[2] / on.length];
        var u = norm(sub(verts[on[0]], c)), w = cross(d, u);
        on.sort(function(i, j) { var p = sub(verts[i], c), q = sub(verts[j], c); return Math.atan2(dot(p, w), dot(p, u)) - Math.atan2(dot(q, w), dot(q, u)); });
        return on;
    });
}
function signs(list) { var out = []; list.forEach(function(v) { [-1, 1].forEach(function(a) { [-1, 1].forEach(function(b) { [-1, 1].forEach(function(c) { out.push([v[0] ? v[0] * a : 0, v[1] ? v[1] * b : 0, v[2] ? v[2] * c : 0]); }); }); }); });
    var seen = {}; return out.filter(function(v) { var k = v.map(function(x) { return x.toFixed(6); }).join(','); if (seen[k]) return false; seen[k] = 1; return true; }); }
var ICO = signs([[0, PHI, 1], [PHI, 1, 0], [1, 0, PHI]]);   // turned to the dodecahedron below, so each is the other's faces
var DOD = signs([[1, 1, 1], [0, 1 / PHI, PHI], [1 / PHI, PHI, 0], [PHI, 0, 1 / PHI]]);
function trapezohedron() {   // a d10: two points and two rings of five, offset by a tenth of a turn, its kites flat
    var z0 = 0.1, c = Math.cos(Math.PI / 5), h = z0 * (1 + c) / (1 - c), v = [[0, 0, h], [0, 0, -h]], f = [], i;
    for (i = 0; i < 5; i++) { var a = i * 2 * Math.PI / 5, b = a + Math.PI / 5; v.push([Math.cos(a), Math.sin(a), z0]); v.push([Math.cos(b), Math.sin(b), -z0]); }
    for (i = 0; i < 5; i++) { var u = 2 + 2 * i, l = 3 + 2 * i, u2 = 2 + 2 * ((i + 1) % 5), l2 = 3 + 2 * ((i + 1) % 5); f.push([0, u, l, u2]); f.push([1, l2, u2, l]); }
    return { verts: v, faces: f };
}
function coin() {   // a d2: a flat round piece, its two sides numbered and its rim plain
    var v = [], f = [[], []], n = 24, i; for (i = 0; i < n; i++) { var a = i * 2 * Math.PI / n; v.push([Math.cos(a), Math.sin(a), 0.14]); v.push([Math.cos(a), Math.sin(a), -0.14]); }
    for (i = 0; i < n; i++) { f[0].push(2 * i); f[1].unshift(2 * i + 1); }
    for (i = 0; i < n; i++) { var j = (i + 1) % n; f.push([2 * i, 2 * i + 1, 2 * j + 1, 2 * j]); }
    return { verts: v, faces: f, rim: n };
}
// numbers for faces: opposite faces add up to the highest number and one, as on a real die, taken in a fixed order
function numberFaces(normals, top) {
    var n = normals.length, out = new Array(n), order = normals.map(function(d, i) { return i; });
    order.sort(function(i, j) { var a = normals[i], b = normals[j]; return (b[2] - a[2]) || (Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])); });
    var k = 1; order.forEach(function(i) {
        if (out[i] !== undefined) return; var opp = -1, best = 2; normals.forEach(function(d, j) { if (j === i || out[j] !== undefined) return; var t = dot(d, normals[i]); if (t < best) { best = t; opp = j; } });
        out[i] = k; if (opp >= 0 && best < -0.9) out[opp] = top + 1 - k; k++; while (out.indexOf(k) >= 0) k++;
    });
    return out;
}
// which way is up on a face: a direction in its plane, the same rule for every face, so that a number drawn along it reads upright once
// the die has landed with that face toward the viewer (uprightSpin)
function faceUp(n) { var ref = Math.abs(n[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1], d = dot(ref, n); return norm([ref[0] - n[0] * d, ref[1] - n[1] * d, ref[2] - n[2] * d]); }
// a shape: its triangles with the part each belongs to, and its faces, each with its number, the words written on it, its direction and size
function build(kind, verts, faces, nums, labels, rimFrom) {
    var pos = [], nrm = [], part = [], out = [], maxR = 0;
    verts.forEach(function(v) { maxR = Math.max(maxR, len(v)); }); maxR = maxR || 1;
    var V = verts.map(function(v) { return [v[0] / maxR, v[1] / maxR, v[2] / maxR]; });
    faces.forEach(function(f, fi) {
        var c = [0, 0, 0]; f.forEach(function(i) { c[0] += V[i][0]; c[1] += V[i][1]; c[2] += V[i][2]; }); c = [c[0] / f.length, c[1] / f.length, c[2] / f.length];
        var d = norm(cross(sub(V[f[1]], V[f[0]]), sub(V[f[2]], V[f[0]]))); if (dot(d, c) < 0) d = [-d[0], -d[1], -d[2]];
        for (var t = 1; t + 1 < f.length; t++) [f[0], f[t], f[t + 1]].forEach(function(i) { pos.push(V[i][0], V[i][1], V[i][2]); nrm.push(d[0], d[1], d[2]); part.push(0); });
        if (rimFrom !== undefined && fi >= rimFrom) return;
        var r = 0; f.forEach(function(i) { r = Math.max(r, len(sub(V[i], c))); });
        out.push({ n: nums[fi], label: labels ? labels[fi] : String(nums[fi]), normal: d, center: c, size: r, up: faceUp(d) });
    });
    return { kind: kind, pos: pos, nrm: nrm, part: part, faces: out, decal: true, model: false };
}
var KINDS = Object.freeze(['d2', 'd3', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'dF']);
var _made = Object.create(null);
function standIn(kind) {
    if (_made[kind]) return _made[kind];
    var s = null, v, f, nums, labels = null, dirs;
    if (kind === 'd4') { v = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]; f = solid(v, v.map(function(p) { return [-p[0], -p[1], -p[2]]; })); nums = [1, 2, 3, 4]; }
    else if (kind === 'd6' || kind === 'd3' || kind === 'dF') {
        v = signs([[1, 1, 1]]); dirs = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]; f = solid(v, dirs);
        nums = kind === 'd3' ? [1, 1, 2, 2, 3, 3] : kind === 'dF' ? [1, -1, 1, -1, 0, 0] : [1, 6, 2, 5, 3, 4];
        if (kind === 'dF') labels = ['+', '\u2212', '+', '\u2212', '', ''];
    }
    else if (kind === 'd8') { v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; dirs = signs([[1, 1, 1]]); f = solid(v, dirs); nums = numberFaces(dirs.map(norm), 8); }
    else if (kind === 'd12') { f = solid(DOD, ICO); v = DOD; nums = numberFaces(ICO.map(norm), 12); }
    else if (kind === 'd20') { f = solid(ICO, DOD); v = ICO; nums = numberFaces(DOD.map(norm), 20); }
    else if (kind === 'd10' || kind === 'd100') {
        var t = trapezohedron(); v = t.verts; f = t.faces; var d10 = build('d10', v, f, f.map(function() { return 0; }));
        nums = numberFaces(d10.faces.map(function(x) { return x.normal; }), 10);
        if (kind === 'd100') { labels = nums.map(function(n) { return n === 10 ? '00' : n + '0'; }); nums = nums.map(function(n) { return n % 10; }); }
        else labels = nums.map(function(n) { return n === 10 ? '0' : String(n); });
    }
    else if (kind === 'd2') { var c = coin(); s = build('d2', c.verts, c.faces, [1, 2], ['1', '2'], 2); }
    if (!s && v) s = build(kind, v, f, nums, labels);
    if (s) _made[kind] = s;
    return s;
}
// which die a group of faces is drawn as: a group of 3 a d6 numbered 1 to 3 twice, and a count the set has no die for, none
function kindOf(faces) {
    if (faces === 'F') return 'dF';
    if (typeof faces !== 'number') return null;
    var k = { 2: 'd2', 3: 'd3', 4: 'd4', 6: 'd6', 8: 'd8', 10: 'd10', 12: 'd12', 20: 'd20', 100: 'd100' }[faces];
    return k || null;
}

// ---- a model file (Wavefront .obj) ----
// Read as data and bounded: corners, faces as fans of triangles, a group per die face (face1 ...) and a material per part. Answers the
// shape, or { error } in words: a model must name a face for every number its die shows
function readObj(text, kind) {
    if (typeof text !== 'string') return { error: 'That is no model file.' };
    if (text.length > LIMITS.objChars) return { error: 'That model file is too large.' };
    var top = { d2: 2, d3: 6, d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 10, dF: 6 }[kind];
    if (!top) return { error: 'That kind of die takes no model.' };
    var V = [], tris = [], group = null, mtl = 0, lines = text.split(/\r?\n/), i;
    for (i = 0; i < lines.length; i++) {
        var w = lines[i].trim().split(/\s+/); if (!w[0] || w[0][0] === '#') continue;
        if (w[0] === 'v') { if (V.length >= LIMITS.verts) return { error: 'That model has too many corners.' }; var x = +w[1], y = +w[2], z = +w[3]; if (![x, y, z].every(isFinite)) return { error: 'A corner of that model is no number.' }; V.push([x, y, z]); }
        else if (w[0] === 'g' || w[0] === 'o') { var m = /^face(\d{1,3})$/i.exec(w[1] || ''); group = m ? (+m[1] === 0 ? top : +m[1]) : null; }
        else if (w[0] === 'usemtl') { var p = PARTS.indexOf(String(w[1] || '').toLowerCase()); mtl = p < 0 ? 0 : p; }
        else if (w[0] === 'f') {
            var idx = []; for (var k = 1; k < w.length; k++) { var n = parseInt(w[k], 10); if (!isFinite(n) || n === 0) return { error: 'A face of that model names no corner.' }; n = n < 0 ? V.length + n : n - 1; if (n < 0 || n >= V.length) return { error: 'A face of that model names a corner that is not there.' }; idx.push(n); }
            if (idx.length < 3) continue;
            for (var t = 1; t + 1 < idx.length; t++) { if (tris.length >= LIMITS.tris) return { error: 'That model has too many faces.' }; tris.push({ v: [idx[0], idx[t], idx[t + 1]], g: group, m: mtl }); }
        }
    }
    if (!tris.length) return { error: 'That model has no faces.' };
    var c = [0, 0, 0]; V.forEach(function(v) { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; }); c = [c[0] / V.length, c[1] / V.length, c[2] / V.length];
    var r = 0; V.forEach(function(v) { r = Math.max(r, len(sub(v, c))); }); if (!(r > 0)) return { error: 'That model has no size.' };
    var P = V.map(function(v) { return [(v[0] - c[0]) / r, (v[1] - c[1]) / r, (v[2] - c[2]) / r]; });
    var pos = [], nrm = [], part = [], sums = Object.create(null), hasNum = false;
    tris.forEach(function(tr) {
        var a = P[tr.v[0]], b = P[tr.v[1]], q = P[tr.v[2]], x = cross(sub(b, a), sub(q, a)), area = len(x) / 2, d = norm(x);
        [a, b, q].forEach(function(v) { pos.push(v[0], v[1], v[2]); nrm.push(d[0], d[1], d[2]); part.push(tr.m); });
        if (tr.m === 2) hasNum = true;
        if (tr.g !== null && tr.g >= 1 && tr.g <= top) { var s = sums[tr.g] || (sums[tr.g] = { n: [0, 0, 0], c: [0, 0, 0], a: 0 }); s.n = [s.n[0] + x[0], s.n[1] + x[1], s.n[2] + x[2]]; var m3 = [(a[0] + b[0] + q[0]) / 3, (a[1] + b[1] + q[1]) / 3, (a[2] + b[2] + q[2]) / 3]; s.c = [s.c[0] + m3[0] * area, s.c[1] + m3[1] * area, s.c[2] + m3[2] * area]; s.a += area; }
    });
    var faces = [], missing = [];
    for (var nn = 1; nn <= top; nn++) { var s2 = sums[nn]; if (!s2 || !(s2.a > 0)) { missing.push(nn); continue; } var nN = norm(s2.n); faces.push({ n: faceN(kind, nn), label: faceLabel(kind, nn), normal: nN, center: [s2.c[0] / s2.a, s2.c[1] / s2.a, s2.c[2] / s2.a], size: Math.sqrt(s2.a) * 0.6, up: faceUp(nN) }); }
    if (missing.length) return { error: 'That model has no face for ' + (missing.length > 3 ? missing.length + ' numbers' : missing.join(', ')) + '. Name each face face1, face2 and so on.' };
    return { kind: kind, pos: pos, nrm: nrm, part: part, faces: faces, decal: !hasNum, model: true };
}

// what a model's face numbered nn stands for, and the words it shows: a d3's six faces 1 to 3 twice, a Fate die's plus, minus and blank, a d100's tens
var FATE = [1, -1, 1, -1, 0, 0];
function faceN(kind, nn) { return kind === 'd100' ? nn % 10 : kind === 'd3' ? Math.ceil(nn / 2) : kind === 'dF' ? FATE[nn - 1] : nn; }
function faceLabel(kind, nn) { var v = faceN(kind, nn); return kind === 'd100' ? (v === 0 ? '00' : v + '0') : kind === 'd10' && nn === 10 ? '0' : kind === 'dF' ? (v > 0 ? '+' : v < 0 ? '\u2212' : '') : String(v); }

// ---- landing and the tumble ----
// the turn that brings the face showing value toward the viewer (+z), the die then spun about the view by spin; null where no face shows it
function landTurn(shape, value, spin) {
    var f = null; (shape && shape.faces || []).forEach(function(x) { if (!f && x.n === value) f = x; });
    if (!f) return null;
    return qMul(qAxis([0, 0, 1], typeof spin === 'number' ? spin : 0), qFromTo(f.normal, [0, 0, 1]));
}
// the spin that leaves the landed face's number upright, its up toward the top of the screen
function uprightSpin(shape, value) {
    var f = null; (shape && shape.faces || []).forEach(function(x) { if (!f && x.n === value) f = x; });
    if (!f || !f.up) return 0; var u = qRot(qFromTo(f.normal, [0, 0, 1]), f.up); return Math.PI / 2 - Math.atan2(u[1], u[0]);
}
function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
// a tumble for one die: from seed, where it lands (x, y) and its landing turn, a function of t from 0 to 1 that answers its turn, its place
// and its height. It ends exactly on the landing turn at its place, at height 0; with still (reduced motion) it is there from the start
function tumble(seed, land, x, y, still) {
    var r = chance(seed), axis = norm([r() - 0.5, r() - 0.5, r() - 0.5]), spins = 3 + r() * 3, sx = x + (r() - 0.5) * 1.6 - 1.2, sy = y + (r() - 0.5) * 1.2, h0 = 1.2 + r() * 0.6;
    var q0 = qNorm([r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5]);
    return function(t) {
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (still) return { q: land.slice(), x: x, y: y, h: 0 };
        var e = 1 - Math.pow(1 - t, 3), free = qMul(qAxis(axis, spins * 2 * Math.PI * e), q0), q = qSlerp(free, land, smooth((t - 0.55) / 0.45));
        var bounce = Math.abs(Math.cos(t * Math.PI * 2.5)) * h0 * Math.pow(1 - t, 2);
        return { q: t >= 1 ? land.slice() : q, x: sx + (x - sx) * e, y: sy + (y - sy) * e, h: t >= 1 ? 0 : bounce };
    };
}
// where n dice rest, in rows across a space w wide (units of one die across), centred
function layout(n, w) {
    var per = Math.max(1, Math.min(n, Math.floor((w || 6) / 1.25))), out = [], rows = Math.ceil(n / per);
    for (var i = 0; i < n; i++) { var row = Math.floor(i / per), col = i % per, inRow = Math.min(per, n - row * per); out.push({ x: (col - (inRow - 1) / 2) * 1.25, y: ((rows - 1) / 2 - row) * 1.25 }); }
    return out;
}
// which dice a roll's result shows: every die of every group the roll counts (never one rolled aside to be read), each with the die it is
// drawn as and the face it lands on, a dropped die marked; the tens and units of a d100 as two dice; LIMITS.dice at most, and how many more
function rollDice(res) {
    var b = res && res.ok && res.breakdown && Array.isArray(res.breakdown.dice) ? res.breakdown.dice : [], out = [], more = 0;
    b.forEach(function(g) {
        if (!g || g.aside) return; var kind = kindOf(g.faces); if (!kind) return;
        (Array.isArray(g.dice) ? g.dice : []).forEach(function(d) {
            if (!d || typeof d.value !== 'number' || !isFinite(d.value)) return;
            var add = kind === 'd100' ? [{ kind: 'd100', value: Math.floor((d.value % 100) / 10), kept: !!d.kept }, { kind: 'd10', value: d.value % 10 === 0 ? 10 : d.value % 10, kept: !!d.kept }] : [{ kind: kind, value: d.value, kept: !!d.kept }];
            add.forEach(function(a) { if (out.length < LIMITS.dice) out.push(a); else more++; });
        });
    });
    return { dice: out, more: more };
}

var API = Object.freeze({ LIMITS: LIMITS, KINDS: KINDS, PARTS: PARTS, standIn: standIn, kindOf: kindOf, readObj: readObj, landTurn: landTurn, uprightSpin: uprightSpin, tumble: tumble, layout: layout, rollDice: rollDice,
    seedOf: seedOf, chance: chance, qMul: qMul, qAxis: qAxis, qRot: qRot, qFromTo: qFromTo, qSlerp: qSlerp });
if (typeof window !== 'undefined') window.wpDice3dCore = API;
export { LIMITS, KINDS, PARTS, standIn, kindOf, readObj, landTurn, uprightSpin, tumble, layout, rollDice, seedOf, chance, qMul, qAxis, qRot, qFromTo, qSlerp };
