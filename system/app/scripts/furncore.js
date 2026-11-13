/* Furnishings (1.6.2, backlog 222; the owner, 2026-11-12, by prompt on docs/sheets/furnishings-sheet.html and the drawings sheet: "Drawn now,
   painted later", the look "Use these drawings", 21 kinds in four eras). The pure half: every furnishing is drawn by Waypoint from constants
   here, seen from above with its front down, clear wherever the drawing is not. A placed furnishing is an ordinary picture piece that keeps
   furn: { k, era, tint? } and no picture path, so every machine draws it the same from these words and nothing of it is sent but them. A
   furnishing's rules (cover, blocking, size) are never here: a system's or a campaign's map object that names the kind gives them (the owner,
   "The system says"). Imports nothing; reads nothing but its arguments. */

var FURN_GROUPS = Object.freeze(['Storage', 'Seating and rest', 'Tables and shelves', 'Kitchen and work', 'Lighting', 'Decor']);
var FURN_ERAS = Object.freeze([
    Object.freeze({ id: 'fantasy', label: 'Fantasy' }), Object.freeze({ id: 'victorian', label: 'Victorian' }),
    Object.freeze({ id: 'modern', label: 'Modern' }), Object.freeze({ id: 'futuristic', label: 'Futuristic' })]);
var HEX6 = /^#[0-9a-f]{6}$/;

var PAL = {
    fantasy:    { wood: '#8a5a2b', dark: '#3e2410', light: '#a87440', metal: '#5f6066', accent: '#caa04a', cloth: '#7a2e2e', sheet: '#e6dcc2', glow: '', books: ['#7a2e2e', '#3f5a2c', '#6b4a1e', '#2f3e63', '#8a6a2a'] },
    victorian:  { wood: '#5a2f1e', dark: '#22100a', light: '#7a4430', metal: '#b8975a', accent: '#c8a564', cloth: '#3d5a3a', sheet: '#ece6d6', glow: '', books: ['#5a1e1e', '#1e3a2a', '#3a2a5a', '#6a4a1a', '#1e2a3a'] },
    modern:     { wood: '#cfcac1', dark: '#4c5158', light: '#e4e0d8', metal: '#9aa2ab', accent: '#3a7bd5', cloth: '#5c6f86', sheet: '#eef0f2', glow: '', books: ['#d64545', '#3a7bd5', '#e8b03a', '#3aa86b', '#555b63'] },
    futuristic: { wood: '#2e3644', dark: '#10151d', light: '#3e4a5c', metal: '#56657a', accent: '#5fe0ff', cloth: '#28324a', sheet: '#3a4558', glow: '#5fe0ff', books: ['#5fe0ff', '#a06bff', '#5fe0ff', '#ff6bb5', '#5fe0ff'] }
};

// The few shapes every drawing is made of; numbers and colours come from this file alone (a tint is checked as six hex digits first)
function R(x, y, w, h, f, s, rx, sw, op) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx || 0) + '" fill="' + f + '"' + (s ? ' stroke="' + s + '" stroke-width="' + (sw || 1.5) + '"' : '') + (op ? ' opacity="' + op + '"' : '') + '/>'; }
function C(x, y, r, f, s, sw) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + f + '"' + (s ? ' stroke="' + s + '" stroke-width="' + (sw || 1.5) + '"' : '') + '/>'; }
function L(x1, y1, x2, y2, s, sw, op) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + s + '" stroke-width="' + (sw || 1) + '"' + (op ? ' opacity="' + op + '"' : '') + ' stroke-linecap="round"/>'; }
function E(x, y, rx, ry, f, s, sw, rot) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"' + (s ? ' stroke="' + s + '" stroke-width="' + (sw || 1.5) + '"' : '') + (rot ? ' transform="rotate(' + rot + ' ' + x + ' ' + y + ')"' : '') + '/>'; }
function PATH(d, f, s, sw) { return '<path d="' + d + '" fill="' + f + '"' + (s ? ' stroke="' + s + '" stroke-width="' + (sw || 1.5) + '"' : '') + '/>'; }
// a leaf seen from above: pointed at both ends, from the middle of the pot outward, with its vein
function leaf(a, len, w, fill, vein, edge) {
    var s = 'M0 0 C' + (len * .3) + ' ' + (-w) + ' ' + (len * .7) + ' ' + (-w) + ' ' + len + ' 0 C' + (len * .7) + ' ' + w + ' ' + (len * .3) + ' ' + w + ' 0 0 Z';
    return '<g transform="translate(25 25) rotate(' + a + ')"><path d="' + s + '" fill="' + fill + '"' + (edge ? ' stroke="' + edge + '" stroke-width="1"' : '') + '/><line x1="1" y1="0" x2="' + (len * .86) + '" y2="0" stroke="' + vein + '" stroke-width=".8" stroke-linecap="round"/></g>';
}

// Each kind: its key, its words, its group, its size in cells, and a drawing for each era (p its palette, e the era's id), in a box of 50 a cell
var KINDS = [
    { key: 'chest', label: 'Chest', group: 'Storage', w: 1, h: 1, d: function(p, e) {
        var o = '';
        if (e === 'fantasy') { o += R(5, 11, 40, 28, p.wood, p.dark, 3); o += R(13, 11, 4, 28, p.metal) + R(33, 11, 4, 28, p.metal); o += R(22, 33, 6, 7, p.accent, p.dark, 1, 1); }
        if (e === 'victorian') { o += R(5, 11, 40, 28, p.wood, p.dark, 3); o += R(9, 15, 32, 20, 'none', p.metal, 2, 1); [[5, 11], [39, 11], [5, 33], [39, 33]].forEach(function(c) { o += R(c[0], c[1], 6, 6, p.metal); }); o += R(22, 34, 6, 6, p.accent, p.dark, 1, 1); }
        if (e === 'modern') { o += R(6, 13, 38, 25, p.tinted ? p.wood : '#c0392b', '#5a1a14', 3); o += R(18, 9, 14, 6, '#2b2f36', '', 2); o += L(6, 22, 44, 22, '#5a1a14', 1.5, .8); o += R(11, 26, 5, 5, p.metal) + R(34, 26, 5, 5, p.metal); }
        if (e === 'futuristic') { o += R(5, 12, 40, 26, p.wood, p.dark, 9); o += L(9, 25, 41, 25, p.glow, 2, .9); o += C(25, 25, 3.5, p.glow); }
        return o; } },
    { key: 'crate', label: 'Crate', group: 'Storage', w: 1, h: 1, d: function(p, e) {
        var o = '';
        if (e === 'fantasy' || e === 'victorian') { o += R(6, 6, 38, 38, p.light, p.dark, 1); o += R(10, 10, 30, 30, p.wood, p.dark, 1, 1); o += L(11, 39, 39, 11, p.light, 4) + L(11, 39, 39, 11, p.dark, 1, .6); }
        if (e === 'modern') { o += R(6, 6, 38, 38, p.tinted ? p.wood : '#c89b62', '#7a5a32', 1); o += R(21, 6, 8, 38, '#e3c690'); o += L(6, 25, 44, 25, '#7a5a32', 1, .4); }
        if (e === 'futuristic') { o += R(6, 6, 38, 38, p.wood, p.dark, 3); o += R(11, 11, 28, 28, 'none', p.metal, 2, 1.2); [[8, 8, 6, 0, 0, 6], [42, 8, -6, 0, 0, 6], [8, 42, 6, 0, 0, -6], [42, 42, -6, 0, 0, -6]].forEach(function(c) { o += L(c[0], c[1], c[0] + c[2], c[1] + c[3], p.glow, 2) + L(c[0], c[1], c[0] + c[4], c[1] + c[5], p.glow, 2); }); }
        return o; } },
    { key: 'barrel', label: 'Barrel', group: 'Storage', w: 1, h: 1, d: function(p, e) {
        var o = '';
        if (e === 'fantasy' || e === 'victorian') { o += C(25, 25, 19, p.wood, p.dark); o += C(25, 25, 16, 'none', e === 'victorian' ? p.metal : '#4a4a50', 2.5); o += L(18, 11, 18, 39, p.dark, 1, .5) + L(25, 9, 25, 41, p.dark, 1, .5) + L(32, 11, 32, 39, p.dark, 1, .5); }
        if (e === 'modern') { o += C(25, 25, 19, p.tinted ? p.wood : '#3a6ea5', '#1e3a5a'); o += C(25, 25, 14, 'none', '#2a5585', 2) + C(25, 25, 9, 'none', '#2a5585', 2); o += C(33, 17, 3, '#c9d2dc', '#1e3a5a', 1); }
        if (e === 'futuristic') { o += C(25, 25, 19, p.wood, p.dark); o += C(25, 25, 12, 'none', p.glow, 2); o += C(25, 25, 4, p.glow); }
        return o; } },
    { key: 'cabinet', label: 'Cabinet or locker', group: 'Storage', w: 1, h: 1, d: function(p, e) {
        var o = '';
        if (e === 'fantasy') { o += R(4, 8, 42, 30, p.wood, p.dark, 2); o += R(4, 34, 42, 6, p.dark); o += L(25, 34, 25, 40, p.light, 1); o += C(21, 37, 1.3, p.accent) + C(29, 37, 1.3, p.accent); }
        if (e === 'victorian') { o += R(4, 8, 42, 30, p.wood, p.dark, 2); o += R(8, 12, 34, 20, 'none', p.metal, 1, .8); o += R(4, 34, 42, 6, p.dark); o += C(21, 37, 1.5, p.metal) + C(29, 37, 1.5, p.metal); }
        if (e === 'modern') { o += R(5, 8, 40, 30, p.tinted ? p.wood : p.metal, p.dark, 1); o += R(5, 34, 40, 6, p.dark); o += L(25, 34, 25, 40, p.metal, 1); [12, 16, 20].forEach(function(y) { o += L(11, y, 21, y, p.dark, 1, .5) + L(29, y, 39, y, p.dark, 1, .5); }); }
        if (e === 'futuristic') { o += R(5, 8, 40, 30, p.wood, p.dark, 5); o += R(5, 34, 40, 6, p.dark, '', 2); o += L(9, 37, 41, 37, p.glow, 1.5, .9); o += C(25, 20, 3, p.glow); }
        return o; } },
    { key: 'chair', label: 'Chair', group: 'Seating and rest', w: 1, h: 1, d: function(p, e) {
        var rx = e === 'futuristic' ? 7 : e === 'modern' ? 4 : 2, o = '';
        o += R(11, 10, 28, 30, p.wood, p.dark, rx);
        if (e === 'victorian') o += R(15, 18, 20, 18, p.cloth, p.dark, 3, 1);
        if (e === 'fantasy') o += L(15, 24, 35, 24, p.dark, 1, .5) + L(15, 31, 35, 31, p.dark, 1, .5);
        o += R(9, 6, 32, 8, e === 'modern' ? p.metal : p.dark, p.dark, rx > 3 ? 3 : 1.5, 1.2);
        if (p.glow) o += L(12, 10, 38, 10, p.glow, 2, .9);
        return o; } },
    { key: 'bench', label: 'Bench', group: 'Seating and rest', w: 2, h: 1, d: function(p, e) {
        var o = '';
        if (e === 'fantasy') { o += R(5, 14, 90, 22, p.wood, p.dark, 2); [21, 29].forEach(function(y) { o += L(9, y, 91, y, p.dark, 1, .45); }); }
        if (e === 'victorian') { o += R(5, 12, 90, 26, p.wood, p.dark, 3); o += R(10, 16, 80, 18, p.cloth, p.dark, 3, 1); [28, 50, 72].forEach(function(x) { o += C(x, 25, 1.4, '#00000066'); }); }
        if (e === 'modern') { o += R(5, 13, 90, 24, 'none', p.dark, 2, 1.5); [16, 22, 28, 34].forEach(function(y) { o += R(7, y - 2, 86, 4, p.tinted ? p.wood : p.light, '', 1); }); o += R(8, 12, 4, 26, p.dark) + R(88, 12, 4, 26, p.dark); }
        if (e === 'futuristic') { o += R(5, 13, 90, 24, p.wood, p.dark, 10); o += L(12, 36, 88, 36, p.glow, 2, .9); }
        return o; } },
    { key: 'stool', label: 'Stool', group: 'Seating and rest', w: 1, h: 1, d: function(p, e) {
        var o = '';
        if (e === 'fantasy') { o += C(25, 25, 12, p.wood, p.dark); o += L(17, 22, 33, 22, p.dark, 1, .5) + L(16, 28, 34, 28, p.dark, 1, .5); }
        if (e === 'victorian') { o += C(25, 25, 13, p.wood, p.dark); o += C(25, 25, 9, p.cloth, p.dark, 1); }
        if (e === 'modern') { o += C(25, 25, 13, p.tinted ? p.wood : p.metal, p.dark); o += C(25, 25, 9, p.dark); }
        if (e === 'futuristic') { o += C(25, 25, 13, p.wood, p.dark); o += C(25, 25, 9, 'none', p.glow, 1.5); }
        return o; } },
    { key: 'sofa', label: 'Sofa', group: 'Seating and rest', w: 2, h: 1, d: function(p, e) {
        var rx = e === 'futuristic' ? 9 : e === 'modern' ? 5 : 3, body = e === 'fantasy' || p.tinted ? p.wood : p.cloth, o = '';
        o += R(5, 6, 90, 38, body, p.dark, rx);
        o += R(5, 6, 90, 11, e === 'fantasy' ? p.dark : '#000000', '', rx, 0, e === 'fantasy' ? 0 : .25);
        o += R(5, 6, 11, 38, '#000000', '', rx, 0, .19) + R(84, 6, 11, 38, '#000000', '', rx, 0, .19);
        o += R(18, 18, 31, 22, '#ffffff', p.dark, 2, 1, .08) + R(51, 18, 31, 22, '#ffffff', p.dark, 2, 1, .08);
        if (e === 'victorian') [24, 34, 44, 56, 66, 76].forEach(function(x) { o += C(x, 11, 1.2, '#00000066'); });
        if (p.glow) o += L(18, 42, 82, 42, p.glow, 1.5, .9);
        return o; } },
    { key: 'bed', label: 'Bed', group: 'Seating and rest', w: 1, h: 2, d: function(p, e) {
        var rx = e === 'futuristic' ? 8 : e === 'modern' ? 4 : 2, o = R(5, 4, 40, 92, p.wood, p.dark, rx);
        o += R(9, 8, 32, 84, p.sheet, p.dark, rx > 3 ? 4 : 1, 1);
        o += R(12, 11, 26, 14, e === 'futuristic' ? p.light : '#f6f2ea', p.dark, 5, 1);
        o += R(9, 34, 32, 58, p.cloth, p.dark, rx > 3 ? 4 : 1, 1);
        o += L(9, 40, 41, 40, '#000000', 2, .33);
        if (e === 'fantasy') o += L(16, 52, 34, 52, '#000000', 1, .25) + L(14, 68, 36, 68, '#000000', 1, .25);
        if (p.glow) o += L(9, 92, 41, 92, p.glow, 2, .9);
        return o; } },
    { key: 'bedroll', label: 'Bedroll', group: 'Seating and rest', w: 1, h: 2, d: function(p, e) {
        var o = '';
        if (e === 'fantasy') { o += R(10, 22, 30, 70, p.tinted ? p.wood : '#6b5a3a', p.dark, 4); o += R(8, 8, 34, 14, '#8a7a52', p.dark, 7); o += L(12, 15, 38, 15, p.dark, 1, .5); }
        if (e === 'victorian') { o += R(8, 6, 34, 88, p.wood, p.dark, 1); o += R(11, 9, 28, 82, '#b8ad8c', p.dark, 1, 1); o += R(14, 12, 22, 12, '#ece6d6', p.dark, 4, 1); }
        if (e === 'modern') { o += R(9, 6, 32, 88, p.tinted ? p.wood : '#2f6fa8', '#18324d', 14); o += L(37, 14, 37, 88, '#18324d', 1.5, .8); o += R(13, 9, 24, 14, '#3d82c0', '', 7); }
        if (e === 'futuristic') { o += R(6, 4, 38, 92, p.wood, p.dark, 18); o += R(11, 10, 28, 40, p.glow, p.glow, 13, 1.5, .14); o += R(11, 10, 28, 40, 'none', p.glow, 13, 1.5); o += L(14, 70, 36, 70, p.glow, 1.5, .8); }
        return o; } },
    { key: 'table', label: 'Table', group: 'Tables and shelves', w: 2, h: 1, d: function(p, e) {
        var o = R(5, 7, 90, 36, p.wood, p.dark, e === 'futuristic' ? 8 : e === 'modern' ? 3 : 2);
        if (e === 'fantasy') [16, 25, 34].forEach(function(y) { o += L(9, y, 91, y, p.dark, 1, .45); });
        if (e === 'victorian') o += R(10, 12, 80, 26, 'none', p.light, 2, 1.2);
        if (e === 'modern') o += R(9, 11, 82, 28, p.tinted ? p.wood : p.light, '', 2);
        if (p.glow) o += R(9, 11, 82, 28, 'none', p.glow, 6, 1.2, .7);
        return o; } },
    { key: 'desk', label: 'Desk', group: 'Tables and shelves', w: 2, h: 1, d: function(p, e) {
        var o = R(5, 9, 90, 32, p.wood, p.dark, e === 'futuristic' ? 7 : e === 'modern' ? 3 : 2);
        if (e === 'fantasy') o += R(18, 15, 24, 17, p.sheet, '#9a8a62', 1, 1) + L(21, 20, 38, 20, '#7a6a4a', 1, .7) + L(21, 25, 36, 25, '#7a6a4a', 1, .7) + C(72, 20, 4.5, '#efe2a6', p.dark, 1) + C(72, 20, 1.6, '#ff9a2a') + C(60, 30, 3, '#1a1a1a', p.dark, 1);
        if (e === 'victorian') o += R(16, 14, 26, 18, p.sheet, '#9a8a72', 1, 1) + C(75, 22, 8, p.metal, p.dark, 1) + C(75, 22, 4, '#f4e2a0');
        if (e === 'modern') o += R(38, 13, 30, 20, '#2b2f36', p.metal, 2, 1.2) + R(41, 16, 24, 13, '#3d4652') + C(80, 25, 4.5, '#ffffff', p.dark, 1);
        if (p.glow) o += R(36, 14, 30, 19, 'none', p.glow, 3, 1.4) + L(40, 20, 60, 20, p.glow, 1, .7) + L(40, 25, 55, 25, p.glow, 1, .7) + C(80, 25, 3, p.glow);
        return o; } },
    { key: 'bookshelf', label: 'Bookshelf', group: 'Tables and shelves', w: 2, h: 1, d: function(p, e) {
        var o = R(3, 6, 94, 20, p.tinted ? p.wood : e === 'modern' ? p.metal : p.dark, p.dark, e === 'futuristic' ? 4 : 1);
        var x = 6, i = 0; while (x < 92) { var bw = 4 + (i * 7 % 5); if (x + bw > 94) break; o += R(x, 9, bw, 14, p.books[i % p.books.length], '#000000', .5, .6); x += bw + 1; i++; }
        if (p.glow) o += L(6, 24, 94, 24, p.glow, 1.5, .8);
        return o; } },
    { key: 'hearth', label: 'Hearth or stove', group: 'Kitchen and work', w: 2, h: 1, d: function(p, e) {
        var o = '';
        if (e === 'fantasy') { o += R(5, 4, 90, 26, p.tinted ? p.wood : '#6e6a64', '#36332f', 2); [30, 50, 70].forEach(function(x) { o += L(x, 4, x, 30, '#36332f', 1, .5); }); o += R(30, 14, 40, 16, '#1a120c'); o += C(44, 24, 5, '#ff6a1a') + C(54, 23, 5, '#ff9a2a') + C(50, 26, 3, '#ffd06a'); }
        if (e === 'victorian') { o += R(18, 5, 64, 34, p.tinted ? p.wood : '#2a2a2e', '#111114', 3); o += C(38, 22, 9, '#3c3c42', '#111114') + C(62, 22, 9, '#3c3c42', '#111114'); o += R(80, 8, 8, 6, p.metal); }
        if (e === 'modern') { o += R(14, 5, 72, 36, p.tinted ? p.wood : '#e8e8ea', '#8a8f96', 3); [[34, 16], [66, 16], [34, 31], [66, 31]].forEach(function(c) { o += C(c[0], c[1], 7, '#2b2f36') + C(c[0], c[1], 3.5, 'none', '#555b63', 1); }); }
        if (e === 'futuristic') { o += R(14, 5, 72, 34, p.wood, p.dark, 6); o += R(22, 12, 34, 20, p.glow, '', 3, 0, .1); o += R(22, 12, 34, 20, 'none', p.glow, 3, 1.2); o += C(70, 22, 6, 'none', p.glow, 2); }
        return o; } },
    { key: 'counter', label: 'Counter', group: 'Kitchen and work', w: 2, h: 1, d: function(p, e) {
        var o = '';
        if (e === 'fantasy') { o += R(3, 5, 94, 24, p.wood, p.dark, 2); o += L(7, 17, 93, 17, p.dark, 1, .45); o += C(24, 13, 4, '#b8b2a6', p.dark, 1) + C(36, 22, 4, '#b8b2a6', p.dark, 1) + C(70, 13, 3.5, '#8a5a2b', p.dark, 1); }
        if (e === 'victorian') { o += R(3, 5, 94, 24, p.wood, p.dark, 2); o += R(6, 8, 88, 18, '#dcd8d0', '#9a948a', 1, 1); o += L(30, 12, 44, 22, '#b8b2a6', 1) + L(60, 10, 72, 24, '#b8b2a6', 1); }
        if (e === 'modern') { o += R(3, 5, 94, 26, p.tinted ? p.wood : '#d8d6d2', '#7a7f86', 2); o += R(60, 9, 24, 18, '#b4bcc6', '#6a717a', 3, 1); o += C(72, 18, 2, '#6a717a'); }
        if (e === 'futuristic') { o += R(3, 5, 94, 24, p.wood, p.dark, 5); o += L(8, 26, 92, 26, p.glow, 1.5, .9); o += R(14, 10, 18, 10, 'none', p.glow, 2, 1); }
        return o; } },
    { key: 'workbench', label: 'Workbench', group: 'Kitchen and work', w: 2, h: 1, d: function(p, e) {
        var o = R(5, 8, 90, 34, e === 'modern' && !p.tinted ? '#7d858e' : p.wood, p.dark, e === 'futuristic' ? 6 : 2);
        if (e === 'fantasy') { o += R(56, 14, 22, 12, '#3a3a40', '#1a1a1e', 2) + R(60, 26, 14, 8, '#3a3a40'); o += L(18, 18, 34, 30, '#6b4a2a', 3) + R(30, 26, 8, 6, '#5f6066'); }
        if (e === 'victorian') { o += R(12, 14, 16, 10, '#3c3c42', '#111114', 1); o += C(55, 25, 8, 'none', p.metal, 2) + C(55, 25, 3, p.metal); o += C(74, 20, 5, 'none', p.metal, 1.5); }
        if (e === 'modern') { o += R(12, 13, 28, 16, '#c0392b', '#5a1a14', 2); o += L(52, 18, 72, 18, '#2b2f36', 3) + L(52, 28, 66, 33, '#e8b03a', 3); }
        if (e === 'futuristic') { o += R(12, 13, 30, 22, p.glow, '', 2, 0, .1) + R(12, 13, 30, 22, 'none', p.glow, 2, 1.2) + R(50, 13, 38, 22, 'none', p.glow, 2, 1); o += L(55, 20, 82, 20, p.glow, 1, .7) + L(55, 27, 75, 27, p.glow, 1, .7); }
        return o; } },
    { key: 'light', label: 'Light', group: 'Lighting', w: 1, h: 1, d: function(p, e) {
        var o = '';
        if (e === 'fantasy') { o += C(25, 25, 15, p.tinted ? p.wood : '#4a4a50', '#222226'); o += C(25, 25, 11, '#2a1a10'); o += C(22, 23, 4, '#ff9a2a') + C(28, 27, 4, '#ff6a1a') + C(26, 21, 3, '#ffd06a'); }
        if (e === 'victorian') { o += C(25, 25, 9, p.tinted ? p.wood : p.metal, p.dark); [[25, 14], [15, 31], [35, 31]].forEach(function(c) { o += L(25, 25, c[0], c[1], p.metal, 2) + C(c[0], c[1], 3.5, '#f4e2a0', p.dark, 1) + C(c[0], c[1], 1.3, '#ff9a2a'); }); }
        if (e === 'modern') { o += C(25, 25, 14, p.tinted ? p.wood : '#f3efe4', '#9a9488'); o += C(25, 25, 5, '#fffbe8', '#9a9488', 1); }
        if (e === 'futuristic') { o += C(25, 25, 16, p.glow + '1a'); o += C(25, 25, 10, p.wood, p.dark); o += C(25, 25, 5, p.glow); }
        return o; } },
    { key: 'plant', label: 'Plant', group: 'Decor', w: 1, h: 1, d: function(p, e) {
        var o = '';
        if (e === 'fantasy') { o += C(25, 25, 15, p.tinted ? p.wood : '#a0583a', '#5a2c18'); o += C(25, 25, 12.5, '#3a2416');
            [[0, 17, 5.5], [50, 15, 5], [100, 18, 5.5], [150, 14, 5], [200, 17, 5.5], [250, 15, 5], [305, 18, 5.5]].forEach(function(l, i) { o += leaf(l[0], l[1], l[2], i % 2 ? '#5a9a4a' : '#3f7a3a', '#2a4a24'); });
            [25, 125, 225, 330].forEach(function(a) { o += leaf(a, 10, 4, '#6aaa56', '#2a4a24'); }); }
        if (e === 'victorian') { o += C(25, 25, 15, p.tinted ? p.wood : p.metal, '#6a5228'); o += C(25, 25, 12.5, '#2a1e12');
            for (var i = 0; i < 14; i++) o += leaf(i * 25.7, 17 + (i % 3) * 2, 2.6, i % 2 ? '#6a9a4a' : '#4f7a3a', '#2f4a24'); }
        if (e === 'modern') { o += R(9, 9, 32, 32, p.tinted ? p.wood : '#f2f2f0', '#9a9a96', 6); o += R(13, 13, 24, 24, '#3a3028', '', 4);
            [[-80, 17], [-30, 15], [15, 18], [60, 14], [110, 17], [160, 15], [210, 18], [255, 14]].forEach(function(l, i) { o += leaf(l[0], l[1], 3.4, i % 2 ? '#3a6a32' : '#2f5a2a', '#1e3a1a', '#c9c25a'); }); }
        if (e === 'futuristic') { o += C(25, 25, 14, p.wood, p.dark); o += C(25, 25, 14, 'none', p.glow, 1.5);
            [[10, 16], [70, 14], [130, 17], [190, 15], [250, 17], [310, 14]].forEach(function(l, i) { o += leaf(l[0], l[1], 4.5, i % 2 ? '#3fbf9a' : '#2f9a80', p.glow); }); o += C(25, 25, 2.5, p.glow); }
        return o; } },
    { key: 'statue', label: 'Statue', group: 'Decor', w: 1, h: 1, d: function(p, e) {
        var stone = e === 'fantasy' ? '#8a8780' : e === 'victorian' ? '#8a6a3a' : '#e8e8ea', o = '';
        if (p.tinted) stone = p.wood;
        if (e !== 'futuristic') o += R(7, 7, 36, 36, e === 'modern' ? '#b4b8be' : '#5e5b55', '#2e2c28', 2);
        if (e === 'modern') o += PATH('M15 33 L25 14 L35 33 Z', stone, '#6a6e75') + C(25, 27, 4, '#3a7bd5');
        else if (e === 'futuristic') o += C(25, 25, 15, p.tinted ? p.wood : 'none', p.glow, 1) + E(25, 29, 10, 6, 'none', p.glow) + C(25, 21, 5, 'none', p.glow);
        else o += E(25, 29, 11, 7, stone, '#2e2c28') + C(25, 21, 6, stone, '#2e2c28');
        return o; } },
    { key: 'sacks', label: 'Sacks and goods', group: 'Decor', w: 1, h: 1, d: function(p, e) {
        var o = '';
        if (e === 'fantasy' || e === 'victorian') { var s = p.tinted ? p.wood : e === 'fantasy' ? '#b8a070' : '#a89468'; o += C(17, 30, 10, s, '#5a4a2a') + C(32, 30, 10, s, '#5a4a2a') + C(25, 17, 10, s, '#5a4a2a'); o += C(25, 13, 2, '#5a4a2a') + C(17, 26, 2, '#5a4a2a') + C(32, 26, 2, '#5a4a2a'); }
        if (e === 'modern') o += R(8, 22, 18, 20, '#e8e4dc', '#9a948a', 4) + R(24, 10, 18, 22, p.tinted ? p.wood : '#d64545', '#7a2020', 4) + R(14, 8, 10, 12, '#3a7bd5', '#1e3a5a', 2);
        if (e === 'futuristic') { o += R(8, 8, 15, 15, p.wood, p.dark, 4) + R(27, 8, 15, 15, p.wood, p.dark, 4) + R(17, 27, 15, 15, p.wood, p.dark, 4); [[15, 15], [34, 15], [24, 34]].forEach(function(c) { o += C(c[0], c[1], 2, p.glow); }); }
        return o; } },
    { key: 'rug', label: 'Rug', group: 'Decor', w: 2, h: 1, d: function(p, e) {
        var o = '', y, x;
        if (e === 'fantasy') { o += R(6, 6, 88, 38, p.tinted ? p.wood : '#8a3a2a', '#4a1a12', 2); o += R(11, 11, 78, 28, 'none', '#d8b060', 1, 1.5); [30, 50, 70].forEach(function(c) { o += PATH('M' + (c - 5) + ' 25 L' + c + ' 18 L' + (c + 5) + ' 25 L' + c + ' 32 Z', '#d8b060'); }); for (y = 8; y <= 42; y += 4) o += L(2, y, 6, y, '#d8b060', 1) + L(94, y, 98, y, '#d8b060', 1); }
        if (e === 'victorian') { o += R(4, 6, 92, 38, p.tinted ? p.wood : '#2e3e5a', '#141c2a', 3); o += R(9, 11, 82, 28, 'none', '#c8a564', 2, 1.5); o += E(50, 25, 16, 9, '#5a2a2a', '#c8a564'); }
        if (e === 'modern') { o += R(5, 6, 90, 38, p.tinted ? p.wood : '#9aa2ab', '', 4); o += R(5, 20, 90, 10, '#5c6f86'); }
        if (e === 'futuristic') { o += R(5, 6, 90, 38, p.tinted ? p.wood : '#141a24', p.glow, 6, 1); for (x = 20; x < 95; x += 15) o += L(x, 8, x, 42, p.glow, .7, .35); o += L(7, 25, 93, 25, p.glow, .7, .35); }
        return o; } }
];
var BY_KEY = (function() { var m = Object.create(null); KINDS.forEach(function(k) { m[k.key] = k; }); return m; })();
var FURN_KINDS = Object.freeze(KINDS.map(function(k) { return Object.freeze({ key: k.key, label: k.label, group: k.group, w: k.w, h: k.h }); }));
var ERA_IDS = FURN_ERAS.map(function(e) { return e.id; });

function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
// What a piece keeps of a furnishing: the kind and era by the list's own words, a tint as six lower-case hex digits. Anything else is none
function cleanFurn(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    var k = own(v, 'k') && typeof v.k === 'string' ? v.k : '', era = own(v, 'era') && typeof v.era === 'string' ? v.era : '';
    if (!own(BY_KEY, k) || ERA_IDS.indexOf(era) < 0) return null;
    var out = { k: k, era: era }, t = own(v, 'tint') && typeof v.tint === 'string' ? v.tint.toLowerCase() : '';
    if (HEX6.test(t)) out.tint = t;
    var pk = own(v, 'pack') ? cleanPackId(v.pack) : ''; if (pk) out.pack = pk;   // fold 2: the pack its picture came from, which the piece keeps as its own src
    return out;
}
function furnKind(k) { return typeof k === 'string' && own(BY_KEY, k) ? FURN_KINDS[KINDS.indexOf(BY_KEY[k])] : null; }
function eraLabel(id) { var e = FURN_ERAS.filter(function(x) { return x.id === id; })[0]; return e ? e.label : ''; }
// The words a furnishing goes by: Chest, Fantasy
function furnWords(f) { var c = cleanFurn(f); return c ? BY_KEY[c.k].label + ', ' + eraLabel(c.era) : ''; }
// The drawing, as one svg's markup, made of this file's constants and a checked tint alone; '' for anything that is no furnishing
function furnSvg(f) {
    var c = cleanFurn(f); if (!c) return '';
    var it = BY_KEY[c.k], p = Object.assign({}, PAL[c.era]); if (c.tint) { p.wood = c.tint; p.tinted = true; }
    var w = it.w * 50, h = it.h * 50;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + it.d(p, c.era) + '</svg>';
}
// The drawing as a picture's address, for an img or a canvas
function furnSrc(f) { var s = furnSvg(f); return s ? 'data:image/svg+xml,' + encodeURIComponent(s) : ''; }
// Its size in board pixels on a lattice of 50 a cell (a hex map's cell is 60 by 52, as a map object's is)
function furnSize(k, hex) { var it = furnKind(k); if (!it) return null; return hex ? { w: it.w * 60, h: it.h * 52 } : { w: it.w * 50, h: it.h * 50 }; }

// [furncheck:packs-start]
// Packs (backlog 222, fold 2; the owner, 2026-11-12, by prompt: a pack lives in the campaign it was brought into, a "Looks list" picks it, a kind
// it has no picture for shows "Waypoint's drawing, marked", and a pack is one file or a folder, "give the option on either on export, and have
// import allow the same"). A pack is { id, name, looks: { 'chest.fantasy': a picture's path, ... } }: looks only, never rules. A path is cleaned
// by the caller's own rule for a campaign's picture (fogcore cleanTexSrc), handed in, so this file still imports nothing
var PACK_MAX = 24, PACK_RE = /^fp_[a-z0-9]{4,24}$/, LOOK_FILE = /^([a-z]+)[-_ ]([a-z]+)\.(png|jpe?g|webp)$/;
function cleanPackId(v) { return typeof v === 'string' && PACK_RE.test(v) ? v : ''; }
function lookKey(k, era) { return typeof k === 'string' && own(BY_KEY, k) && ERA_IDS.indexOf(era) >= 0 ? k + '.' + era : ''; }
function packName(v) { if (typeof v !== 'string') return ''; var t = Array.from(v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()); return t.slice(0, 60).join('').trim(); }
// One pack as it is kept, its looks in the list's own order of kinds and eras, or null where it has no id or no name
function cleanPack(p, cleanSrc) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    var id = cleanPackId(own(p, 'id') ? p.id : ''), name = packName(own(p, 'name') ? p.name : ''); if (!id || !name) return null;
    var L = own(p, 'looks') && p.looks && typeof p.looks === 'object' && !Array.isArray(p.looks) ? p.looks : {}, looks = {};
    KINDS.forEach(function(k) { ERA_IDS.forEach(function(e) { var key = k.key + '.' + e; if (!own(L, key)) return; var s = typeof cleanSrc === 'function' ? cleanSrc(L[key]) : null; if (s) looks[key] = s; }); });
    var out = { id: id, name: name, looks: looks };
    blocksInto(out, p, L, cleanSrc);   // fold 4: texture blocks, only where the pack has some, so a pack of furnishings alone is kept as it always was
    return out;
}
// A campaign's packs: each id once, PACK_MAX at most; anything else is none
function cleanPacks(v, cleanSrc) {
    if (!Array.isArray(v)) return [];
    var out = [], seen = Object.create(null);
    for (var i = 0; i < v.length && out.length < PACK_MAX; i++) { var p = cleanPack(v[i], cleanSrc); if (p && !seen[p.id]) { seen[p.id] = 1; out.push(p); } }
    return out;
}
function packLook(pack, k, era) { var key = lookKey(k, era); return key && pack && pack.looks && own(pack.looks, key) && typeof pack.looks[key] === 'string' ? pack.looks[key] : ''; }
function packCount(pack) { return pack && pack.looks ? Object.keys(pack.looks).length : 0; }
// A look as a file in a folder, and what a file's name says: chest-fantasy.png, or with _ or a space, in any case
function lookFile(k, era, ext) { var key = lookKey(k, era); return key ? k + '-' + era + '.' + (/^(png|jpg|jpeg|webp)$/.test(ext) ? ext : 'png') : ''; }
function lookOfFile(name) {
    var m = typeof name === 'string' ? LOOK_FILE.exec(name.toLowerCase()) : null;
    return m && lookKey(m[1], m[2]) ? { k: m[1], era: m[2] } : null;
}
// A picture's kind by its first bytes, never its name: png, jpeg or webp, else ''
function picKind(b) {
    if (!b || typeof b.length !== 'number' || b.length < 12) return '';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
    return '';
}
// [furncheck:packs-end]

// [furncheck:blocks-start]
// Texture blocks (backlog 222, fold 4; the owner, 2026-11-13, by prompt: a pack holds "Patterns and new blocks", used through a "Looks list +
// Texture lists", a picture "1 cell, pack may say 2 or 4", and made in a "Blocks tab in the maker"). A pack may hold its own picture for any of
// Waypoint's 32 patterns, under 'tex.<pattern>' in its looks, and blocks of its own, each a name and the material it lays as, its picture under
// 'blk.<id>'. A block takes its material's rules: a pack still holds looks alone. tiles says how many cells one picture covers, 2 or 4, where it is
// not one. This file still imports nothing, so it keeps its own copy of the pattern names and the material ids, which furncheck holds to
// buildcore's own lists
var TEX_NAMES = Object.freeze(['flagstones', 'bricks', 'cobbles', 'planks', 'stone', 'hatching', 'ripples', 'grass', 'shingles', 'pantiles', 'slates', 'thatch', 'forest', 'mountains', 'sand', 'snow', 'ironplate', 'treadplate', 'rails', 'sawtooth', 'asphalt', 'lanes', 'concrete', 'tiles', 'carpet', 'glass', 'chainlink', 'deck', 'grating', 'hull', 'forcefield', 'holo']);
var MAT_IDS = Object.freeze(['floor', 'wall', 'door', 'water', 'rubble', 'wood', 'grass', 'street', 'building', 'citywall', 'factory', 'concrete', 'tile', 'carpet', 'deck', 'grating', 'walkway', 'brickwall', 'blockwall', 'bulkhead', 'ironwall', 'irondoor', 'hatch', 'glass', 'chainlink', 'forcefield', 'road', 'roadlines', 'rail', 'terrace', 'millroof', 'roof', 'module', 'canal', 'coolant', 'scrap', 'wreckage']);
var BLOCK_MAX = 48, BLOCK_RE = /^b[a-z0-9]{1,6}$/;
function texKey(n) { return typeof n === 'string' && TEX_NAMES.indexOf(n) >= 0 ? 'tex.' + n : ''; }
function blockKey(id) { return typeof id === 'string' && BLOCK_RE.test(id) ? 'blk.' + id : ''; }
function blockMat(v) { return typeof v === 'string' && MAT_IDS.indexOf(v) >= 0 ? v : ''; }
function blockName(v) { if (typeof v !== 'string') return ''; var t = Array.from(v.replace(/[\u0000-\u001f\u007f\\/:*?"<>|@]+/g, ' ').replace(/\s+/g, ' ').trim()); return t.slice(0, 40).join('').replace(/[. ]+$/, '').trim(); }   // the review of fold 4: no character a file name cannot hold and no @, which marks a tile, so every name exports to a file of its own and comes back as it was
function tileOf(v) { return v === 2 || v === 4 ? v : 1; }
// The pack's patterns, blocks and tiles, written onto out where it has any. A block needs an id, a name, a material and a picture; a name is
// kept once, ignoring case
function blocksInto(out, p, L, cleanSrc) {
    var src = function(v) { return typeof cleanSrc === 'function' ? cleanSrc(v) : null; };
    TEX_NAMES.forEach(function(n) { var key = 'tex.' + n; if (!own(L, key)) return; var s = src(L[key]); if (s) out.looks[key] = s; });
    var B = own(p, 'blocks') && Array.isArray(p.blocks) ? p.blocks : [], blocks = [], ids = Object.create(null), names = Object.create(null);
    for (var i = 0; i < B.length && i < 400 && blocks.length < BLOCK_MAX; i++) {
        var b = B[i]; if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
        var id = own(b, 'id') && typeof b.id === 'string' && BLOCK_RE.test(b.id) ? b.id : '', nm = blockName(own(b, 'name') ? b.name : ''), mat = blockMat(own(b, 'mat') ? b.mat : '');
        if (!id || !nm || !mat || ids[id] || names[nm.toLowerCase()] || !own(L, 'blk.' + id)) continue;
        var s = src(L['blk.' + id]); if (!s) continue;
        ids[id] = 1; names[nm.toLowerCase()] = 1; blocks.push({ id: id, name: nm, mat: mat }); out.looks['blk.' + id] = s;
    }
    if (blocks.length) out.blocks = blocks;
    var T = own(p, 'tiles') && p.tiles && typeof p.tiles === 'object' && !Array.isArray(p.tiles) ? p.tiles : {}, tiles = {};
    Object.keys(out.looks).forEach(function(key) { if ((key.slice(0, 4) === 'tex.' || key.slice(0, 4) === 'blk.') && own(T, key) && tileOf(T[key]) > 1) tiles[key] = T[key]; });
    if (Object.keys(tiles).length) out.tiles = tiles;
}
// One pattern of a pack: its picture and how many cells it covers, or null
function packTex(pack, n) { var key = texKey(n); return key && pack && pack.looks && own(pack.looks, key) ? { src: pack.looks[key], t: tileOf(pack.tiles && own(pack.tiles, key) ? pack.tiles[key] : 1) } : null; }
// A pack's blocks with their pictures, in its own order
function packBlocks(pack) {
    return (pack && Array.isArray(pack.blocks) ? pack.blocks : []).filter(function(b) { return b && own(pack.looks, 'blk.' + b.id); }).map(function(b) {
        var key = 'blk.' + b.id; return { id: b.id, key: key, name: b.name, mat: b.mat, src: pack.looks[key], t: tileOf(pack.tiles && own(pack.tiles, key) ? pack.tiles[key] : 1) };
    });
}
function packTexCount(pack) { return pack && pack.looks ? Object.keys(pack.looks).filter(function(k) { return k.slice(0, 4) === 'tex.' || k.slice(0, 4) === 'blk.'; }).length : 0; }
// A Texture list's rows for a campaign's packs: each pack that has patterns or blocks, its patterns in the list's order then its blocks. A row's
// value is '@pk:' and the pack's id and the key, which no pattern is named by
var ROW_RE = /^@pk:(fp_[a-z0-9]{4,24}):((?:tex|blk)\.[a-z0-9]+)$/;
function texRows(packs) {
    var out = [];
    (Array.isArray(packs) ? packs : []).forEach(function(p) {
        var rows = [];
        TEX_NAMES.forEach(function(n) { var x = packTex(p, n); if (x) rows.push({ v: '@pk:' + p.id + ':tex.' + n, tex: n, src: x.src, t: x.t }); });
        packBlocks(p).forEach(function(b) { rows.push({ v: '@pk:' + p.id + ':' + b.key, name: b.name, mat: b.mat, src: b.src, t: b.t }); });
        if (rows.length) out.push({ id: p.id, name: p.name, rows: rows });
    });
    return out;
}
// What a row's value names: its picture and its tile, or null for anything that is no row of these packs
function texRowPick(packs, v) {
    var m = typeof v === 'string' ? ROW_RE.exec(v) : null; if (!m) return null;
    var g = texRows(packs).filter(function(x) { return x.id === m[1]; })[0], r = g ? g.rows.filter(function(x) { return x.v === v; })[0] : null;
    return r ? { src: r.src, t: r.t } : null;
}
// The row a picture already in use stands for, so a Texture list shows it by name: the first row of these packs with that very picture
function texRowOf(packs, src) {
    if (typeof src !== 'string' || !src) return '';
    var hit = ''; texRows(packs).some(function(g) { return g.rows.some(function(r) { if (r.src === src) { hit = r.v; return true; } return false; }); });
    return hit;
}
// A new block's id that none of these blocks holds
function newBlockId(blocks) { var seen = Object.create(null); (Array.isArray(blocks) ? blocks : []).forEach(function(b) { if (b && typeof b.id === 'string') seen[b.id] = 1; }); var n = 1; while (seen['b' + n.toString(36)]) n++; return 'b' + n.toString(36); }
// A pattern or a block as a file in a folder, and what a file's name says. tex-bricks.png is a pattern; block-floor-Marble.png a block, its
// material and then its name; @2 or @4 before the end says how many cells one picture covers
var TEX_FILE = /^tex[-_ ]([a-z]+)(?:[-_ @]([24]))?\.(png|jpe?g|webp)$/i, BLOCK_FILE = /^block[-_ ]([a-z]+)[-_ ]([^@]+?)(?:@([24]))?\.(png|jpe?g|webp)$/i;   // the review of fold 4: a block's tile is @2 or @4, which no name holds
function extOf(ext) { return /^(png|jpg|jpeg|webp)$/.test(ext) ? ext : 'png'; }
function texFile(n, ext, t) { return texKey(n) ? 'tex-' + n + (tileOf(t) > 1 ? '@' + t : '') + '.' + extOf(ext) : ''; }
function blockFile(b, ext, t) { var nm = b ? blockName(b.name).replace(/[\\/:*?"<>|]+/g, ' ').trim() : '', mat = b ? blockMat(b.mat) : ''; return nm && mat ? 'block-' + mat + '-' + nm + (tileOf(t) > 1 ? '@' + t : '') + '.' + extOf(ext) : ''; }
function blockOfFile(name) {
    if (typeof name !== 'string') return null;
    var m = TEX_FILE.exec(name); if (m) { var n = m[1].toLowerCase(); return texKey(n) ? { key: 'tex.' + n, t: m[2] ? Number(m[2]) : 1 } : null; }
    m = BLOCK_FILE.exec(name); if (!m) return null;
    var mat = blockMat(m[1].toLowerCase()), nm = blockName(m[2]);
    return mat && nm ? { key: 'blk', blk: { name: nm, mat: mat }, t: m[3] ? Number(m[3]) : 1 } : null;
}
// Where a pack's picture is saved among the campaign's own: its furnishing's file, tex-bricks.png, or block-<id>.png
function storeFile(key, ext) {
    var p = typeof key === 'string' ? key.split('.') : [];
    if (p.length !== 2) return '';
    if (p[0] === 'tex') return texFile(p[1], ext, 1);
    if (p[0] === 'blk') return blockKey(p[1]) ? 'block-' + p[1] + '.' + extOf(ext) : '';
    return lookFile(p[0], p[1], ext);
}
// [furncheck:blocks-end]

// [furncheck:maker-start]
// The pack maker and its template (fold 3; the owner: the size "up to the user, defaulting to 200" pixels a cell, and a picture with no clear
// part "A. Kept, with a word")
var TPL_PX = 200;
function cleanTplPx(v) { var n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d{1,4}\s*$/.test(v) ? parseInt(v, 10) : NaN; return isFinite(n) && n >= 50 && n <= 800 ? Math.round(n) : TPL_PX; }
// Does any of a picture's pixels let the map show through? Read from its RGBA bytes
function hasClear(a) { if (!a || typeof a.length !== 'number') return false; for (var i = 3; i < a.length; i += 4) if (a[i] < 250) return true; return false; }
// Is a picture of w by h the shape of its kind's cells, give or take a tenth?
function fitsCells(k, w, h) { var it = furnKind(k); if (!it || !(w > 0) || !(h > 0)) return false; var r = (w / h) / (it.w / it.h); return r > 0.9 && r < 1.1; }
// Which files of a .zip or a folder are a pack's pictures, by their paths: never one in a reference folder, a hidden file or a system's own
// folder; only those in a folder named pack where there is one; each kind and era once. Other pictures are counted, text files passed over
function pickLooks(names) {
    var list = (Array.isArray(names) ? names.slice(0, 400) : []).map(function(n) { return typeof n === 'string' ? n.replace(/\\/g, '/') : n; }), out = [], left = { kind: 0, twice: 0 }, seen = Object.create(null);
    var dirsOf = function(n) { return n.split('/').slice(0, -1).map(function(d) { return d.toLowerCase(); }); };
    var inPack = list.some(function(n) { return typeof n === 'string' && dirsOf(n).indexOf('pack') >= 0; });
    list.forEach(function(n, i) {
        if (typeof n !== 'string' || !n || n.charAt(n.length - 1) === '/') return;
        var parts = n.split('/'), base = parts[parts.length - 1], dirs = dirsOf(n);
        if (dirs.indexOf('reference') >= 0 || dirs.indexOf('__macosx') >= 0 || base.charAt(0) === '.') return;
        if (inPack && dirs.indexOf('pack') < 0) return;
        if (!/\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(base)) return;
        var lk = lookOfFile(base);
        if (!lk) {   // fold 4: a pattern or a block
            var bk = blockOfFile(base); if (!bk) { left.kind++; return; }
            var bkey = bk.blk ? 'blk:' + bk.blk.name.toLowerCase() : bk.key; if (seen[bkey]) { left.twice++; return; }
            seen[bkey] = 1; var it = { i: i, key: bk.key, t: bk.t }; if (bk.blk) it.blk = bk.blk; out.push(it); return;
        }
        var key = lk.k + '.' + lk.era; if (seen[key]) { left.twice++; return; }
        seen[key] = 1; out.push({ i: i, k: lk.k, era: lk.era, key: key });
    });
    return { looks: out, left: left };
}
// The template's own words: how to fill it, and each kind with its cells, its size in pixels and its file names
function tplGuide(px) {
    var p = cleanTplPx(px), L = [
        'Waypoint furnishing pack template', '',
        'The reference folder holds Waypoint\'s own drawings, ' + p + ' pixels a cell. Paint your own over them or beside them.',
        'Put your pictures in the pack folder, named as the reference ones are, such as chest-fantasy.png.',
        'A png, jpeg or webp picture of 4 MB or less works. Any size works and is fitted to its cells.',
        'Give each picture a clear background, so the map shows round it. A picture with none covers its whole square.',
        'You need not make every kind. A kind your pack leaves out shows Waypoint\'s drawing.',
        'Then in Waypoint, on Build\'s Objects tab, press Packs, then Import a file, and pick this .zip.', '',
        'The kinds, with their size in cells and in pixels:'];
    KINDS.forEach(function(k) { L.push(k.key + ', ' + k.label + ': ' + k.w + ' by ' + k.h + (k.w * k.h === 1 ? ' cell, ' : ' cells, ') + (k.w * p) + ' by ' + (k.h * p) + ' pixels. ' + ERA_IDS.map(function(e) { return k.key + '-' + e + '.png'; }).join(', ')); });
    L.push('', 'Texture blocks', '',
        'A pack can also repaint the patterns floors and walls are drawn with. The reference folder holds each one as tex-bricks.png, one cell of ' + p + ' by ' + p + ' pixels.',
        'Make yours repeat without a seam: its right edge must meet its left edge, and its bottom edge its top.',
        'A picture covers one cell. For a picture that covers 2 or 4 cells, add @2 or @4 before .png, such as tex-flagstones@2.png.',
        'A block of your own is named block, the material it lays as, and its name, such as block-floor-Marble.png. It takes that material\'s rules.',
        'The materials a block may lay as: ' + MAT_IDS.join(', ') + '.',
        'The patterns: ' + TEX_NAMES.map(function(n) { return 'tex-' + n + '.png'; }).join(', ') + '.');
    return L.join('\r\n') + '\r\n';
}
// [furncheck:maker-end]

var API = { FURN_GROUPS: FURN_GROUPS, FURN_ERAS: FURN_ERAS, FURN_KINDS: FURN_KINDS, cleanFurn: cleanFurn, furnKind: furnKind, furnWords: furnWords, furnSvg: furnSvg, furnSrc: furnSrc, furnSize: furnSize, eraLabel: eraLabel, PACK_MAX: PACK_MAX, cleanPackId: cleanPackId, lookKey: lookKey, packName: packName, cleanPack: cleanPack, cleanPacks: cleanPacks, packLook: packLook, packCount: packCount, lookFile: lookFile, lookOfFile: lookOfFile, picKind: picKind, TPL_PX: TPL_PX, cleanTplPx: cleanTplPx, hasClear: hasClear, fitsCells: fitsCells, pickLooks: pickLooks, tplGuide: tplGuide, TEX_NAMES: TEX_NAMES, MAT_IDS: MAT_IDS, BLOCK_MAX: BLOCK_MAX, texKey: texKey, blockKey: blockKey, blockName: blockName, packTex: packTex, packBlocks: packBlocks, packTexCount: packTexCount, texRows: texRows, texRowPick: texRowPick, texRowOf: texRowOf, newBlockId: newBlockId, texFile: texFile, blockFile: blockFile, blockOfFile: blockOfFile, storeFile: storeFile };
if (typeof window !== 'undefined') window.wpFurnCore = API;
export { FURN_GROUPS, FURN_ERAS, FURN_KINDS, cleanFurn, furnKind, furnWords, furnSvg, furnSrc, furnSize, eraLabel, PACK_MAX, cleanPackId, lookKey, packName, cleanPack, cleanPacks, packLook, packCount, lookFile, lookOfFile, picKind, TPL_PX, cleanTplPx, hasClear, fitsCells, pickLooks, tplGuide, TEX_NAMES, MAT_IDS, BLOCK_MAX, texKey, blockKey, blockName, packTex, packBlocks, packTexCount, texRows, texRowPick, texRowOf, newBlockId, texFile, blockFile, blockOfFile, storeFile };
