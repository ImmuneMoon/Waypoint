// Inline dice (1.6.0, backlog 27; the owner, 2026-10-29, by prompt: in "Pages and planners", "GM info on tokens" and "Table Chat
// messages", and a roll made from one "Like any roll"). A dice formula written in text, as 2d6 + 3, becomes a button that rolls it.
// diceRuns is the one reader of a formula in text; apply turns the formulas of a drawn text into buttons with elements and text nodes
// only, never markup, and never inside a link, a control, code, a diagram's source or a box being edited; strip puts the text back
// for an export. A press rolls through the dice roller's own roll, as a roll typed there is, with the roller's own Private tick, its
// label the nearest heading or the line. Nothing of it is stored or sent: the host judges the roll as it judges any.

import { toast } from './io.js';

// [dicecheck:inline-start]
var DIE = '(?:\\d{1,3})?[dD](?:\\d{1,4}|F|%)';
var DICE_RE = new RegExp('(^|[^\\w.])(' + DIE + '(?:\\s*[+\\-\\u2212]\\s*(?:' + DIE + '|\\d{1,4}))*)(?![\\w%]|\\.\\d)', 'g');
var MAX_RUNS = 40, MAX_EXPR = 60;
var SKIP = 'a, button, input, select, textarea, script, style, code, pre, svg, [contenteditable], .inline-dice, .mermaid, .ts-box, .ts-bar';

// The formulas a text holds: [{ s, e, expr }] in order, s and e the match's place in the text, expr the formula as the roller takes it
// (a true minus as -, one space round each sign). At most MAX_RUNS; a formula longer than MAX_EXPR is passed over
function diceRuns(text) {
    var out = []; if (typeof text !== 'string' || !text) return out;
    DICE_RE.lastIndex = 0; var m;
    while ((m = DICE_RE.exec(text)) && out.length < MAX_RUNS) {
        var raw = m[2], s = m.index + m[1].length, e = s + raw.length;
        var expr = raw.replace(/\u2212/g, '-').replace(/\s*([+\-])\s*/g, ' $1 ').replace(/\s+/g, ' ').trim();
        if (expr.length <= MAX_EXPR) out.push({ s: s, e: e, expr: expr });
        if (DICE_RE.lastIndex === m.index) DICE_RE.lastIndex++;
    }
    return out;
}
function skipped(node, root) {
    for (var p = node.parentNode; p && p !== root; p = p.parentNode) if (p.nodeType === 1 && typeof p.matches === 'function' && p.matches(SKIP)) return true;
    return !!(root && root.nodeType === 1 && typeof root.matches === 'function' && root.matches(SKIP));
}
function diceButton(doc, text, expr) {
    var b = doc.createElement('button'); b.type = 'button'; b.className = 'inline-dice'; b.textContent = text;
    b.setAttribute('data-roll', expr); b.title = 'Roll ' + expr; return b;
}
// The text nodes under root, then each one's formulas made buttons (elements and text nodes only). Runs again harmlessly: a button
// already made is passed over. Nothing in the stream window
function apply(root) {
    if (!root || typeof window === 'undefined' || window.wpStream) return 0;
    var doc = root.ownerDocument || document, texts = [], made = 0;
    (function walk(n) { var k = n.childNodes ? Array.prototype.slice.call(n.childNodes) : []; for (var i = 0; i < k.length; i++) { if (k[i].nodeType === 3) texts.push(k[i]); else if (k[i].nodeType === 1) walk(k[i]); } })(root);
    texts.forEach(function(t) {
        var text = t.nodeValue; if (!text || !/[dD]/.test(text) || skipped(t, root)) return;
        var runs = diceRuns(text); if (!runs.length) return;
        var frag = doc.createDocumentFragment(), at = 0;
        runs.forEach(function(r) { if (r.s > at) frag.appendChild(doc.createTextNode(text.slice(at, r.s))); frag.appendChild(diceButton(doc, text.slice(r.s, r.e), r.expr)); at = r.e; made++; });
        if (at < text.length) frag.appendChild(doc.createTextNode(text.slice(at)));
        t.parentNode.replaceChild(frag, t);
    });
    return made;
}
// The buttons under root back to their text (an export reads the page's own markup)
function strip(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    Array.prototype.slice.call(root.querySelectorAll('.inline-dice')).forEach(function(b) { var p = b.parentNode; if (!p) return; p.replaceChild((b.ownerDocument || document).createTextNode(b.textContent), b); if (typeof p.normalize === 'function') p.normalize(); });
}
// A list of roll buttons for a text kept in a box being edited (GM info in Properties): one a formula, in order, at most 12
function list(box, text) {
    if (!box) return 0; box.textContent = '';
    var doc = box.ownerDocument || document, runs = diceRuns(typeof text === 'string' ? text : '').slice(0, 12);
    runs.forEach(function(r) { box.appendChild(diceButton(doc, r.expr, r.expr)); });
    box.hidden = !runs.length; return runs.length;
}
// The card's label: the nearest heading above the button in a drawn page, else the words of its line, cut to 60
function labelOf(btn) {
    var blk = btn.closest ? btn.closest('.pv-blk') : null;
    for (var b = blk; b; b = b.previousElementSibling) { var h = b.matches && b.matches('h1, h2, h3') ? b : b.querySelector ? b.querySelector('h1, h2, h3') : null; if (h && (h.textContent || '').trim()) return h.textContent.trim().slice(0, 60); }
    var line = btn.closest ? btn.closest('p, li, td, th, .pv-blk, .gm-dice, div') : null, w = line ? String(line.textContent || '').replace(/\s+/g, ' ').trim() : '';
    return (w || btn.textContent || '').slice(0, 60);
}
// [dicecheck:inline-end]
function press(btn) {
    var expr = btn.getAttribute('data-roll'); if (!expr) return;
    var D = window.wpDice || (window.opener && !window.opener.closed && window.opener.wpDice) || null;
    if (!D || typeof D.roll !== 'function') { toast('Dice are not available here.'); return; }
    var pv = document.getElementById('dicePriv') || (window.opener && window.opener.document && window.opener.document.getElementById('dicePriv'));
    var r = D.roll(expr, { priv: !!(pv && pv.checked), label: labelOf(btn), source: 'text' });
    if (r && r.error) toast(r.error);
}
if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.wpStream) {
    document.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('.inline-dice') : null; if (!b) return;
        e.preventDefault(); e.stopPropagation(); press(b);
    });
}
if (typeof window !== 'undefined') window.wpInlineDice = { runs: diceRuns, apply: apply, strip: strip, list: list, label: labelOf };
export { diceRuns, apply, strip, list, labelOf };
