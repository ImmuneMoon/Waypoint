/* Formula and dice engine — the foundation the rules model, dice and character sheets stand on (1.5.0).
   A pure ES module: no imports, no DOM, no state, no I/O, nothing at load time beyond the tables below; in a
   browser it also publishes window.wpFormula. Spreadsheet-style syntax — numbers, names like STR or
   Skill.Stealth, functions, comparisons, and dice terms with the usual modifiers (4d6kh3, 2d6!, d20r1,
   10d6cs>=5, 4dF, d%, (Level)d6, d(Weapon.Die)). Every call returns { ok, ... } and never throws; every loop
   is capped; the random source is injectable and every draw is recorded so a roll can be replayed.
   Design of record: docs/FORMULA_ENGINE_PLAN.md (local). Offline checks: node tools/formulacheck.js. */

var LIMITS = Object.freeze({ maxChars: 2000, maxDice: 1000, maxFaces: 1000000, maxDepth: 64, maxNest: 64, maxExplode: 100, maxReroll: 100 });
var VERSION = 1;

/* ---------- errors ---------- */
function FormulaError(message, pos, len) { this.message = String(message); this.pos = pos > 0 ? pos : 0; this.len = len > 0 ? len : 0; }
function fail(message, pos, len) { throw new FormulaError(message, pos, len); }
function q(s) { return '"' + s + '"'; }
function thousands(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* ---------- values ---------- */
function fmt(v) {
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    if (v === 0) return '0';
    if (Math.floor(v) === v && Math.abs(v) < 1e21) return String(v);
    var s = String(Number(v.toFixed(4)));
    return s === '-0' ? '0' : s;
}
function num(v) { return typeof v === 'boolean' ? (v ? 1 : 0) : v; }
function truthy(v) { return typeof v === 'boolean' ? v : v !== 0; }
function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }

/* ---------- lexer ---------- */
var RE_WS = /\s/;
var RE_NUM = /(?:\d+\.\d+|\d+\.|\.\d+|\d+)/y;
var RE_NUMRUN = /[\d.]+/y;
var RE_DIGITS = /\d+/y;
var RE_NAME = /[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*/uy;
var RE_NAMECH = /[\p{L}\p{N}_]/u;
var RE_OP = /<=|>=|!=|<>|==|[=<>+\-*\/^(),]|[≥≤≠]/y;
var RE_KEEP = /(kh|kl|dh|dl)(\d+)?/iy;
var RE_REROLL = /(rr|r)(<=|>=|!=|<>|==|=|<|>)?(-?\d+)/iy;
var RE_CS = /cs(<=|>=|!=|<>|==|=|<|>)(-?\d+)/iy;
var RE_CSBAD = /cs(-?\d+)/iy;
var RE_EXPL = /!(?!=)/y;
var SUFFIX_SHAPE = /^(?:(?:kh|kl|dh|dl)\d*|rr?(?:<=|>=|!=|<>|==|=|<|>)?-?\d+|cs\S*|!)$/i;
function table(o) { return Object.assign(Object.create(null), o); }       // no prototype: a name called constructor is just a name
var RESERVED = table({ and: 1, or: 1, not: 1, 'true': 1, 'false': 1 });
var OP_CANON = table({ '==': '=', '<>': '!=', '≥': '>=', '≤': '<=', '≠': '!=' });
function canonOp(op) { return OP_CANON[op] || op; }
function isNameChar(ch) { return typeof ch === 'string' && ch !== '' && RE_NAMECH.test(ch); }

function lex(src) {
    var n = src.length, toks = [], frames = [], i = 0, mm;
    function at(re, p) { re.lastIndex = p; return re.exec(src); }

    function lexSuffixes(p) {                       // modifiers glued to a dice term: kh3 kl dh dl2 r1 rr<=2 cs>=5 !
        var list = [];
        for (;;) {
            if ((mm = at(RE_KEEP, p))) {
                if (mm[2] === undefined && isNameChar(src[p + mm[0].length])) break;   // 4d6khan: khan is a name, not a modifier
                list.push({ kind: 'keep', sub: mm[1].toLowerCase(), n: mm[2] === undefined ? 1 : parseInt(mm[2], 10), pos: p, len: mm[0].length, text: mm[0] });
                p += mm[0].length; continue;
            }
            if ((mm = at(RE_REROLL, p))) {
                list.push({ kind: 'reroll', sub: mm[1].toLowerCase(), op: canonOp(mm[2] || '='), n: parseInt(mm[3], 10), pos: p, len: mm[0].length, text: mm[0] });
                p += mm[0].length; continue;
            }
            if ((mm = at(RE_CS, p))) {
                list.push({ kind: 'cs', op: canonOp(mm[1]), n: parseInt(mm[2], 10), pos: p, len: mm[0].length, text: mm[0] });
                p += mm[0].length; continue;
            }
            if ((mm = at(RE_CSBAD, p))) fail('cs needs a comparison, for example cs>=5.', p, mm[0].length);
            if ((mm = at(RE_EXPL, p))) { list.push({ kind: 'explode', pos: p, len: 1, text: '!' }); p += 1; continue; }
            break;
        }
        return { list: list, end: p };
    }
    function diceAt(p) {                            // src[p] is d/D: is this the start of a dice term?
        var c1 = src[p + 1], sfx;
        if (c1 >= '0' && c1 <= '9') {
            var dm = at(RE_DIGITS, p + 1), facesEnd = p + 1 + dm[0].length;
            if (src[facesEnd] === '.' && /\d/.test(src[facesEnd + 1] || '')) {
                var run = at(RE_NUMRUN, p + 1)[0];
                fail("A die's faces must be a whole number, got " + run + '.', p + 1, run.length);
            }
            sfx = lexSuffixes(facesEnd);
            return { kind: 'lit', faces: parseInt(dm[0], 10), facesPos: p + 1, facesLen: dm[0].length, suffixes: sfx.list, end: sfx.end };
        }
        if (c1 === '%') { sfx = lexSuffixes(p + 2); return { kind: 'lit', faces: '%', facesPos: p + 1, facesLen: 1, suffixes: sfx.list, end: sfx.end }; }
        if (c1 === '(') return { kind: 'open', end: p + 2 };
        if (c1 === 'F' || c1 === 'f') {
            sfx = lexSuffixes(p + 2);
            if (!isNameChar(src[sfx.end])) return { kind: 'lit', faces: 'F', facesPos: p + 1, facesLen: 1, suffixes: sfx.list, end: sfx.end };
        }
        return null;
    }
    function emitDice(d, count, countPos, countLen, pos) {
        if (d.kind === 'open') {
            toks.push({ t: 'dopen', count: count, countPos: countPos, countLen: countLen, pos: pos, len: d.end - pos, text: src.slice(pos, d.end) });
            frames.push({ dice: true });
        } else {
            toks.push({ t: 'dice', count: count, countPos: countPos, countLen: countLen, faces: d.faces, facesPos: d.facesPos, facesLen: d.facesLen,
                        suffixes: d.suffixes, pos: pos, len: d.end - pos, text: src.slice(pos, d.end) });
        }
        i = d.end;
    }

    var j = 0; while (j < n && RE_WS.test(src[j])) j++;
    if (src[j] === '=' && src[j + 1] !== '=') i = j + 1;        // a leading = (the spreadsheet habit) is ignored

    while (i < n) {
        var ch = src[i];
        if (RE_WS.test(ch)) { i++; continue; }
        if ((mm = at(RE_NUM, i))) {
            var txt = mm[0], end = i + txt.length;
            if (txt.charAt(txt.length - 1) === '.') fail(q(txt) + ' is not a number.', i, txt.length);
            if (src[end] === '.' || (txt.indexOf('.') >= 0 && /\d/.test(src[end] || ''))) { var bad = at(RE_NUMRUN, i)[0]; fail(q(bad) + ' is not a number.', i, bad.length); }
            if (src[end] === 'd' || src[end] === 'D') {
                var d = diceAt(end);
                if (d) {
                    if (txt.indexOf('.') >= 0) fail('The number of dice must be a whole number from 0 up, got ' + txt + '.', i, txt.length);
                    emitDice(d, parseInt(txt, 10), i, txt.length, i); continue;
                }
            }
            toks.push({ t: 'num', v: parseFloat(txt), text: txt, pos: i, len: txt.length }); i = end; continue;
        }
        if (ch === 'd' || ch === 'D') { var d0 = diceAt(i); if (d0) { emitDice(d0, null, i, 0, i); continue; } }
        if ((mm = at(RE_NAME, i))) {
            var name = mm[0], lower = name.toLowerCase();
            if (lower === 'true' || lower === 'false') toks.push({ t: 'bool', v: lower === 'true', text: name, pos: i, len: name.length });
            else if (RESERVED[lower]) toks.push({ t: 'word', v: lower, text: name, pos: i, len: name.length });
            else toks.push({ t: 'name', v: lower, text: name, pos: i, len: name.length });
            i += name.length; continue;
        }
        if ((mm = at(RE_OP, i))) {
            var op = canonOp(mm[0]);
            if (op === '(') { frames.push({ dice: false }); toks.push({ t: 'op', v: '(', text: '(', pos: i, len: 1 }); i++; continue; }
            if (op === ')') {
                var frame = frames.pop(), tok = { t: 'op', v: ')', text: ')', pos: i, len: 1 };
                i++;
                if (frame && frame.dice) { var s2 = lexSuffixes(i); tok.suffixes = s2.list; tok.sfxEnd = s2.end; i = s2.end; }
                toks.push(tok);
                if (src[i] === 'd' || src[i] === 'D') {          // (expr)d6 — a parenthesised dice count
                    var dt = diceAt(i);
                    if (dt) {
                        if (dt.kind === 'open') { toks.push({ t: 'dtailopen', pos: i, len: 2, text: 'd(' }); frames.push({ dice: true }); }
                        else toks.push({ t: 'dtail', faces: dt.faces, facesPos: dt.facesPos, facesLen: dt.facesLen, suffixes: dt.suffixes, pos: i, len: dt.end - i, text: src.slice(i, dt.end) });
                        i = dt.end;
                    }
                }
                continue;
            }
            toks.push({ t: 'op', v: op, text: mm[0], pos: i, len: mm[0].length }); i += mm[0].length; continue;
        }
        fail('Unexpected character ' + q(ch) + '.', i, 1);
    }
    toks.push({ t: 'eof', v: '', text: '', pos: n, len: 0 });
    return toks;
}

/* ---------- functions ---------- */
var FUNCS = table({
    floor: { min: 1, max: 1 }, ceil: { min: 1, max: 1 }, trunc: { min: 1, max: 1 }, round: { min: 1, max: 2 },
    abs: { min: 1, max: 1 }, sqrt: { min: 1, max: 1 }, min: { min: 1, max: Infinity }, max: { min: 1, max: Infinity },
    clamp: { min: 3, max: 3 }, mod: { min: 2, max: 2 }, 'if': { min: 3, max: 3 }, and: { min: 1, max: Infinity }, or: { min: 1, max: Infinity }
});
function arityText(name, f) {
    if (f.min === f.max) return name + ' takes ' + f.min + ' argument' + (f.min === 1 ? '' : 's');
    if (f.max === Infinity) return name + ' takes at least ' + f.min + ' argument' + (f.min === 1 ? '' : 's');
    return name + ' takes ' + f.min + ' or ' + f.max + ' arguments';
}

/* ---------- suggestions (unknown names and functions) ---------- */
function editDistance(a, b) {
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
        cur = [i];
        for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        prev = cur;
    }
    return prev[n];
}
function suggest(word, candidates) {
    if (!candidates || word.length > 64) return null;
    var lower = word.toLowerCase(), best = null, bestD = 3, k = 0;
    for (var c = 0; c < candidates.length && k < 5000; c++) {
        var cand = String(candidates[c]); k++;
        if (Math.abs(cand.length - word.length) > 2 || cand.toLowerCase() === lower) continue;
        var d = editDistance(lower, cand.toLowerCase());
        if (d < bestD) { bestD = d; best = cand; }
    }
    return best;
}

/* ---------- parser ---------- */
function Parser(toks, src) { this.toks = toks; this.i = 0; this.src = src; this.nest = 0; }
Parser.prototype.peek = function() { return this.toks[this.i]; };
Parser.prototype.next = function() { return this.toks[this.i++]; };
Parser.prototype.prev = function() { return this.toks[this.i - 1] || null; };
Parser.prototype.isOp = function(v) { var t = this.peek(); return t.t === 'op' && t.v === v; };
Parser.prototype.isCmp = function() { var t = this.peek(); return t.t === 'op' && (t.v === '<' || t.v === '<=' || t.v === '>' || t.v === '>=' || t.v === '=' || t.v === '!='); };
Parser.prototype.isWord = function(v) { var t = this.peek(); return t.t === 'word' && t.v === v; };
Parser.prototype.endOf = function() { var p = this.prev(); return p ? (p.sfxEnd !== undefined ? p.sfxEnd : p.pos + p.len) : 0; };
Parser.prototype.srcOf = function(node) { return this.src.slice(node.pos, node.pos + node.len); };
Parser.prototype.enter = function(tok) { if (++this.nest > LIMITS.maxNest) fail('Too many nested parentheses (over ' + LIMITS.maxNest + ').', tok.pos + (tok.len || 1) - 1, 1); };
Parser.prototype.leave = function() { this.nest--; };
Parser.prototype.finish = function(node, pos) { node.pos = pos; node.len = this.endOf() - pos; return node; };
Parser.prototype.isValueStart = function(t) {
    return t.t === 'num' || t.t === 'name' || t.t === 'dice' || t.t === 'dopen' || t.t === 'bool' || (t.t === 'op' && t.v === '(') || (t.t === 'word' && (t.v === 'not' || t.v === 'and' || t.v === 'or'));
};
Parser.prototype.countOf = function(tok) { return tok.count === null ? null : { t: 'num', v: tok.count, text: String(tok.count), pos: tok.countPos, len: tok.countLen }; };
Parser.prototype.facesOf = function(tok) {
    if (tok.faces === 'F') return 'F';
    return { t: 'num', v: tok.faces === '%' ? 100 : tok.faces, text: tok.faces === '%' ? '%' : String(tok.faces), pos: tok.facesPos, len: tok.facesLen };
};

Parser.prototype.expr = function() {
    var node = this.orExpr();
    this.checkFollow(node);
    return node;
};
Parser.prototype.checkFollow = function(node) {      // two values in a row, and the dice-shaped mistakes worth a better message
    var t = this.peek(), text = this.srcOf(node);
    if ((t.t === 'dice' || t.t === 'dopen') && t.count === null && ((node.t === 'num' && isInt(node.v)) || node.paren))
        fail('Write the dice without a space: ' + text + (t.t === 'dopen' ? 'd(…)' : t.text) + '.', t.pos, t.len);
    if (t.t === 'name' && t.v === 'd' && node.t === 'num') fail('Write the dice without a space: ' + text + 'd(…).', t.pos, t.len);
    if (t.t === 'dtail' || t.t === 'dtailopen') {
        if (node.t === 'call') fail('Put the dice count in parentheses: (' + text + ')' + (t.t === 'dtail' ? t.text : 'd(…)') + '.', t.pos, t.len);
        fail('Missing an operator between ' + q(text) + ' and ' + q(t.t === 'dtail' ? t.text : 'd(…)') + '.', t.pos, t.len);
    }
    if (t.t === 'name' && node.t === 'dice' && SUFFIX_SHAPE.test(t.text)) fail('Dice modifiers must touch the dice: ' + text + t.text + '.', t.pos, t.len);
    if (this.isValueStart(t)) fail('Missing an operator between ' + q(text) + ' and ' + q(t.text) + '.', t.pos, t.len);
};
Parser.prototype.orExpr = function() {
    var pos = this.peek().pos, items = [this.andExpr()];
    while (this.isWord('or')) { this.next(); items.push(this.andExpr()); }
    return items.length === 1 ? items[0] : this.finish({ t: 'or', items: items }, pos);
};
Parser.prototype.andExpr = function() {
    var pos = this.peek().pos, items = [this.notExpr()];
    while (this.isWord('and')) { this.next(); items.push(this.notExpr()); }
    return items.length === 1 ? items[0] : this.finish({ t: 'and', items: items }, pos);
};
Parser.prototype.notExpr = function() {
    var pos = this.peek().pos, count = 0;
    while (this.isWord('not')) { this.next(); count++; }
    var node = this.cmpExpr();
    return count ? this.finish({ t: 'not', a: node, n: count }, pos) : node;
};
Parser.prototype.cmpExpr = function() {
    var pos = this.peek().pos, l = this.sumExpr();
    if (!this.isCmp()) return l;
    var opTok = this.next(), r = this.sumExpr();
    if (this.isCmp()) {
        var op2 = this.next(); this.sumExpr();
        fail('Only one comparison at a time: split ' + q(this.src.slice(pos, this.endOf())) + ' with and.', op2.pos, op2.len);
    }
    return this.finish({ t: 'cmp', op: opTok.v, opPos: opTok.pos, opLen: opTok.len, l: l, r: r }, pos);
};
Parser.prototype.sumExpr = function() {
    var pos = this.peek().pos, items = [{ op: '+', node: this.termExpr(), opPos: pos, opLen: 0 }];
    while (this.isOp('+') || this.isOp('-')) { var t = this.next(); items.push({ op: t.v, node: this.termExpr(), opPos: t.pos, opLen: t.len }); }
    return items.length === 1 ? items[0].node : this.finish({ t: 'sum', items: items }, pos);
};
Parser.prototype.termExpr = function() {
    var pos = this.peek().pos, items = [{ op: '*', node: this.powExpr(), opPos: pos, opLen: 0 }];
    while (this.isOp('*') || this.isOp('/')) { var t = this.next(); items.push({ op: t.v, node: this.powExpr(), opPos: t.pos, opLen: t.len }); }
    return items.length === 1 ? items[0].node : this.finish({ t: 'prod', items: items }, pos);
};
Parser.prototype.powExpr = function() {
    var pos = this.peek().pos, items = [{ node: this.unaryExpr(), opPos: pos, opLen: 0 }];
    while (this.isOp('^')) { var t = this.next(); items.push({ node: this.unaryExpr(), opPos: t.pos, opLen: t.len }); }
    return items.length === 1 ? items[0].node : this.finish({ t: 'pow', items: items }, pos);
};
Parser.prototype.unaryExpr = function() {
    var pos = this.peek().pos, neg = 0, signs = 0;
    while (this.isOp('-') || this.isOp('+')) { if (this.next().v === '-') neg++; signs++; }
    var node = this.atom();
    if (!signs) return node;
    return this.finish({ t: neg % 2 ? 'neg' : 'pos', a: node }, pos);
};
Parser.prototype.atom = function() {
    var t = this.peek(), pos = t.pos, node;
    if (t.t === 'num') { this.next(); return this.finish({ t: 'num', v: t.v, text: t.text }, pos); }
    if (t.t === 'bool') { this.next(); return this.finish({ t: 'bool', v: t.v, text: t.text }, pos); }
    if (t.t === 'dice') { this.next(); return this.diceNode(this.countOf(t), this.facesOf(t), t.suffixes, pos); }
    if (t.t === 'dopen') {
        this.next(); this.enter(t);
        var faces = this.expr(), close = this.expectClose(t);
        this.leave();
        return this.diceNode(this.countOf(t), faces, close.suffixes || [], pos);
    }
    if (t.t === 'name' || (t.t === 'word' && (t.v === 'and' || t.v === 'or'))) {
        this.next();
        if (this.isOp('(')) return this.call(t, pos);
        if (t.t === 'word') fail('Something is missing before ' + q(t.text) + '.', t.pos, t.len);
        return this.finish({ t: 'name', v: t.v, text: t.text }, pos);
    }
    if (t.t === 'op' && t.v === '(') {
        this.next(); this.enter(t);
        node = this.expr(); this.expectClose(t);
        this.leave();
        node.paren = true; node.pos = pos; node.len = this.endOf() - pos;
        var tail = this.peek();
        if (tail.t === 'dtail') { this.next(); return this.diceNode(node, this.facesOf(tail), tail.suffixes, pos); }
        if (tail.t === 'dtailopen') {
            this.next(); this.enter(tail);
            var f2 = this.expr(), c2 = this.expectClose(tail);
            this.leave();
            return this.diceNode(node, f2, c2.suffixes || [], pos);
        }
        return node;
    }
    var prev = this.prev();
    if (prev && ((prev.t === 'op' && prev.v !== ')') || prev.t === 'word')) fail('Something is missing after ' + q(prev.text) + '.', prev.pos, prev.len);
    if (t.t === 'eof') fail('Nothing to evaluate.', t.pos, 0);
    if (t.t === 'op' && t.v === ')') fail('Unexpected ")".', t.pos, 1);
    fail('Unexpected ' + q(t.text) + '.', t.pos, t.len || 1);
};
Parser.prototype.expectClose = function(openTok) {
    var t = this.peek();
    if (t.t === 'op' && t.v === ')') return this.next();
    if (t.t === 'eof') fail('Missing ")" to close the "(" at column ' + (openTok.pos + openTok.len) + '.', openTok.pos + openTok.len - 1, 1);
    fail('Unexpected ' + q(t.text) + '.', t.pos, t.len || 1);
};
Parser.prototype.call = function(nameTok, pos) {
    var f = FUNCS[nameTok.v];
    if (!f) { var s = suggest(nameTok.text, Object.keys(FUNCS)); fail('Unknown function ' + q(nameTok.text) + (s ? ' — did you mean ' + q(s) + '?' : '.'), nameTok.pos, nameTok.len); }
    var open = this.next(); this.enter(open);
    var args = [];
    if (this.isOp(')')) this.next();
    else {
        for (;;) {
            args.push(this.expr());
            if (this.isOp(',')) { this.next(); continue; }
            this.expectClose(open); break;
        }
    }
    this.leave();
    var node = this.finish({ t: 'call', name: nameTok.v, text: nameTok.text, args: args }, pos);
    if (args.length < f.min || args.length > f.max) fail(arityText(nameTok.text, f) + ', got ' + args.length + '.', node.pos, node.len);
    return node;
};
Parser.prototype.diceNode = function(count, faces, suffixes, pos) {
    var node = { t: 'dice', count: count, faces: faces, keep: null, reroll: null, explode: null, cs: null };
    for (var k = 0; k < suffixes.length; k++) {
        var s = suffixes[k];
        if (s.kind === 'keep') {
            if (node.keep) fail(node.keep.sub === s.sub ? s.sub + ' given twice.' : 'Only one of kh, kl, dh, dl per dice term.', s.pos, s.len);
            node.keep = s;
        } else if (s.kind === 'reroll') {
            if (node.reroll) fail(node.reroll.sub === s.sub ? s.sub + ' given twice.' : 'Only one of r, rr per dice term.', s.pos, s.len);
            node.reroll = s;
        } else if (s.kind === 'explode') {
            if (node.explode) fail('! given twice.', s.pos, s.len);
            node.explode = s;
        } else {
            if (node.cs) fail('cs given twice.', s.pos, s.len);
            node.cs = s;
        }
    }
    this.finish(node, pos);
    node.text = this.srcOf(node);
    return node;
};

function collectNames(node, out, seen) {
    if (!node || typeof node !== 'object') return;
    if (node.t === 'name') { if (!seen[node.v]) { seen[node.v] = true; out.push(node.text); } return; }
    if (node.t === 'dice') { collectNames(node.count, out, seen); if (node.faces !== 'F') collectNames(node.faces, out, seen); return; }
    if (node.items) for (var i = 0; i < node.items.length; i++) collectNames(node.items[i].node || node.items[i], out, seen);
    if (node.args) for (var a = 0; a < node.args.length; a++) collectNames(node.args[a], out, seen);
    if (node.a) collectNames(node.a, out, seen);
    if (node.l) { collectNames(node.l, out, seen); collectNames(node.r, out, seen); }
    if (node.body) collectNames(node.body, out, seen);
}

function parse(text) {
    try {
        if (typeof text !== 'string') text = text === undefined || text === null ? '' : String(text);
        if (text.length > LIMITS.maxChars) fail('The formula is too long (over ' + thousands(LIMITS.maxChars) + ' characters).', LIMITS.maxChars, text.length - LIMITS.maxChars);
        if (!text.trim()) fail('Nothing to evaluate.', 0, 0);
        var p = new Parser(lex(text), text);
        if (p.peek().t === 'eof') fail('Nothing to evaluate.', 0, 0);
        var body = p.expr();
        var t = p.peek();
        if (t.t !== 'eof') { if (t.t === 'op' && t.v === ')') fail('Unexpected ")".', t.pos, 1); fail('Unexpected ' + q(t.text) + '.', t.pos, t.len || 1); }
        var ast = { t: 'root', body: body, src: text, pos: 0, len: text.length }, names = [];
        collectNames(body, names, Object.create(null));
        return { ok: true, ast: ast, names: names };
    } catch (e) {
        if (e instanceof FormulaError) return { ok: false, error: { message: e.message, pos: e.pos, len: e.len } };
        return { ok: false, error: { message: 'The formula could not be evaluated.', pos: 0, len: 0 } };
    }
}

/* ---------- random ---------- */
var rndBuf = null, rndAt = 256;
function defaultRandom(faces) {
    var c = typeof crypto !== 'undefined' ? crypto : (typeof globalThis !== 'undefined' ? globalThis.crypto : undefined);
    if (!c || typeof c.getRandomValues !== 'function') fail('No random source is available here.', 0, 0);
    if (!rndBuf) rndBuf = new Uint32Array(256);
    var limit = Math.floor(4294967296 / faces) * faces, x = 0;
    for (var tries = 0; tries < 64; tries++) {
        if (rndAt >= 256) { c.getRandomValues(rndBuf); rndAt = 0; }
        x = rndBuf[rndAt++];
        if (x < limit) break;
    }
    return 1 + (x % faces);
}
function fromDraws(list) {
    var arr = Array.isArray(list) ? list.slice() : [], i = 0;
    var f = function(faces) {
        if (i >= arr.length) fail('The stored roll does not match this formula.', 0, 0);
        var v = arr[i++];
        if (!isInt(v) || v < 1 || v > faces) fail('The stored roll does not match this formula.', 0, 0);
        return v;
    };
    f.remaining = function() { return arr.length - i; };
    return f;
}

/* ---------- evaluation ---------- */
function meets(op, v, n) {
    switch (op) {
        case '<': return v < n; case '<=': return v <= n; case '>': return v > n; case '>=': return v >= n;
        case '=': return v === n; case '!=': return v !== n;
    }
    return false;
}
function alwaysTrue(op, n, lo, hi) {
    switch (op) {
        case '<=': return hi <= n; case '<': return hi < n; case '>=': return lo >= n; case '>': return lo > n;
        case '=': return lo === hi && lo === n; case '!=': return n < lo || n > hi;
    }
    return false;
}
function finite(v, pos, len) { if (!isFinite(v)) fail('The result is too large.', pos, len); return v; }
function roundTo(x, d) {
    d = Math.trunc(d);
    var sign = x < 0 ? -1 : 1, ax = Math.abs(x), s = String(ax);
    if (s.indexOf('e') >= 0) { var f = Math.pow(10, d); return sign * Math.round(ax * f) / f; }
    var shifted = Number(s + 'e' + d), r = Math.round(shifted);
    return sign * Number(r + 'e' + (-d));
}

function Ctx(ast, options) {
    this.ast = ast; this.src = ast.src || '';
    this.vars = options.vars; this.known = options.knownNames;
    this.random = typeof options.random === 'function' ? options.random : defaultRandom;
    this.stack = Array.isArray(options.stack) ? options.stack.map(function(s) { return String(s).toLowerCase(); }) : [];
    this.draws = []; this.dice = []; this.checks = []; this.names = []; this.pool = 0;
    this.recs = new Map();
}
Ctx.prototype.draw = function(faces, fudge, node) {
    var raw = this.random(fudge ? 3 : faces), top = fudge ? 3 : faces;
    if (!isInt(raw) || raw < 1 || raw > top) fail('The random source returned ' + fmt(raw) + ' for a ' + (fudge ? 'fudge die' : faces + '-sided die') + '.', node.pos, node.len);
    this.draws.push(raw);
    return fudge ? raw - 2 : raw;
};

function lookupObject(obj, lower) {
    var keys = Object.keys(obj), k;
    for (k = 0; k < keys.length; k++) if (keys[k].toLowerCase() === lower) return { found: true, value: obj[keys[k]] };
    var parts = lower.split('.'), cur = obj;
    for (var p = 0; p < parts.length; p++) {
        if (!cur || typeof cur !== 'object') return { found: false };
        var ks = Object.keys(cur), hit = null;
        for (k = 0; k < ks.length; k++) if (ks[k].toLowerCase() === parts[p]) { hit = ks[k]; break; }
        if (hit === null) return { found: false };
        cur = cur[hit];
    }
    return { found: true, value: cur };
}
function objectNames(obj) {
    var out = Object.keys(obj), top = out.length;
    for (var k = 0; k < top && out.length < 5000; k++) {
        var v = obj[out[k]];
        if (v && typeof v === 'object') Object.keys(v).forEach(function(sub) { if (typeof v[sub] !== 'object' || v[sub] === null) out.push(out[k] + '.' + sub); });
    }
    return out;
}

function resolveName(node, c) {
    var lower = node.v, val, found;
    var where = c.stack.indexOf(lower);
    if (where >= 0) fail('Formulas refer to each other in a loop: ' + c.stack.slice(where).concat([node.text]).join(' → ') + '.', node.pos, node.len);
    if (typeof c.vars === 'function') { val = c.vars(lower, node.text); found = val !== undefined; }
    else if (c.vars && typeof c.vars === 'object') { var r = lookupObject(c.vars, lower); found = r.found && r.value !== undefined; val = r.value; }
    else found = false;
    if (!found) {
        var cands = c.known || (c.vars && typeof c.vars === 'object' ? objectNames(c.vars) : null), s = suggest(node.text, cands);
        fail('Unknown name ' + q(node.text) + (s ? ' — did you mean ' + q(s) + '?' : '.'), node.pos, node.len);
    }
    if (val && typeof val === 'object' && val.error) {
        var msg = String(val.error.message || 'could not be evaluated');
        fail(/^Formulas refer to each other/.test(msg) ? msg : node.text + ': ' + msg, node.pos, node.len);
    }
    if (typeof val === 'string') fail(q(node.text) + ' is text, not a number.', node.pos, node.len);
    if (typeof val !== 'number' && typeof val !== 'boolean') fail(q(node.text) + ' is not a number.', node.pos, node.len);
    if (typeof val === 'number' && !isFinite(val)) fail(q(node.text) + ' is not a number.', node.pos, node.len);
    c.names.push({ name: node.text, value: val });
    c.recs.set(node, { value: val });
    return val;
}

function rollDice(node, c) {
    var count = 1, faces, fudge = false, i;
    if (node.count) {
        var cv = num(ev(node.count, c));
        if (!isInt(cv) || cv < 0) fail('The number of dice must be a whole number from 0 up, got ' + fmt(cv) + '.', node.count.pos, node.count.len);
        count = cv;
    }
    if (node.faces === 'F') { fudge = true; faces = 3; }
    else {
        var fv = num(ev(node.faces, c));
        if (!isInt(fv)) fail("A die's faces must be a whole number, got " + fmt(fv) + '.', node.faces.pos, node.faces.len);
        if (fv < 1) fail('A die needs at least 1 face, got ' + fmt(fv) + '.', node.faces.pos, node.faces.len);
        if (fv > LIMITS.maxFaces) fail('A die can have at most ' + thousands(LIMITS.maxFaces) + ' faces.', node.faces.pos, node.faces.len);
        faces = fv;
    }
    if (count > LIMITS.maxDice || c.pool + count > LIMITS.maxDice) fail('This formula would roll more than ' + thousands(LIMITS.maxDice) + ' dice.', node.pos, node.len);
    c.pool += count;
    var lo = fudge ? -1 : 1, hi = fudge ? 1 : faces, facesText = fudge ? 'dF' : 'd' + faces;
    var rec = { text: node.text, count: count, faces: fudge ? 'F' : faces, rolls: [], kept: [], dropped: [], rerolled: [], exploded: [], capped: false, cs: null, total: 0, dice: [], pos: node.pos, len: node.len };
    var idx = c.dice.length; c.dice.push(rec); c.recs.set(node, { dice: idx, value: 0 });
    if (count === 0) return 0;
    if (node.explode) {
        if (fudge) fail('Fudge dice cannot explode.', node.explode.pos, node.explode.len);
        if (faces === 1) fail('d1 cannot explode (every roll is its highest face).', node.explode.pos, node.explode.len);
    }
    if (node.reroll && node.reroll.sub === 'rr' && alwaysTrue(node.reroll.op, node.reroll.n, lo, hi)) fail(node.reroll.text + ' would reroll a ' + facesText + ' forever.', node.reroll.pos, node.reroll.len);
    if (node.keep) {
        var kn = node.keep.n, sub = node.keep.sub;
        if (sub === 'kh' || sub === 'kl') { if (kn < 1 || kn > count) fail('Cannot keep ' + kn + ' dice of ' + count + '.', node.keep.pos, node.keep.len); }
        else if (kn < 1 || kn > count - 1) fail('Cannot drop ' + kn + ' dice of ' + count + (kn >= count ? ' (nothing would be left).' : '.'), node.keep.pos, node.keep.len);
    }
    for (i = 0; i < count; i++) {
        var v = c.draw(faces, fudge, node), hist = [v], chain, k, capped = false;
        if (node.reroll) {
            var rop = node.reroll.op, rn = node.reroll.n;
            if (node.reroll.sub === 'r') { if (meets(rop, v, rn)) { v = c.draw(faces, fudge, node); hist.push(v); } }
            else {
                for (k = 0; k < LIMITS.maxReroll && meets(rop, v, rn); k++) { v = c.draw(faces, fudge, node); hist.push(v); }
                if (meets(rop, v, rn)) capped = true;
            }
        }
        chain = [v];
        if (node.explode) {
            for (k = 0; k < LIMITS.maxExplode && chain[chain.length - 1] === faces; k++) chain.push(c.draw(faces, fudge, node));
            if (chain[chain.length - 1] === faces) capped = true;
        }
        var value = 0; for (k = 0; k < chain.length; k++) value += chain[k];
        rec.rolls.push(hist[0]);
        if (hist.length > 1) rec.rerolled.push(hist);
        if (chain.length > 1) rec.exploded.push(chain);
        if (capped) rec.capped = true;
        rec.dice.push({ hist: hist, chain: chain, value: value, kept: true, hit: false, capped: capped });
    }
    if (node.keep) {
        var order = rec.dice.map(function(d, j) { return j; }).sort(function(a, b) { return rec.dice[b].value - rec.dice[a].value || a - b; });   // highest first, ties by position
        var s = node.keep.sub, n2 = node.keep.n, drop = {};
        if (s === 'kh') order.slice(n2).forEach(function(j) { drop[j] = true; });
        else if (s === 'kl') order.slice(0, count - n2).forEach(function(j) { drop[j] = true; });
        else if (s === 'dh') order.slice(0, n2).forEach(function(j) { drop[j] = true; });
        else order.slice(count - n2).forEach(function(j) { drop[j] = true; });
        rec.dice.forEach(function(d, j) { d.kept = !drop[j]; });
    }
    rec.dice.forEach(function(d) { (d.kept ? rec.kept : rec.dropped).push(d.value); });
    var total = 0;
    if (node.cs) {
        var hits = 0;
        rec.dice.forEach(function(d) { if (d.kept && meets(node.cs.op, d.value, node.cs.n)) { d.hit = true; hits++; } });
        rec.cs = { op: node.cs.op, n: node.cs.n, count: hits }; total = hits;
    } else rec.dice.forEach(function(d) { if (d.kept) total += d.value; });
    rec.total = total;
    c.recs.set(node, { dice: idx, value: total });
    return total;
}

function ev(node, c) {
    var v, i, items;
    switch (node.t) {
        case 'num': return node.v;
        case 'bool': return node.v;
        case 'name': return resolveName(node, c);
        case 'dice': return rollDice(node, c);
        case 'neg': return -num(ev(node.a, c));
        case 'pos': return num(ev(node.a, c));
        case 'sum':
            items = node.items; v = 0;
            for (i = 0; i < items.length; i++) { var s = num(ev(items[i].node, c)); v = items[i].op === '-' ? v - s : v + s; finite(v, items[i].opPos, items[i].opLen || 1); }
            return v;
        case 'prod':
            items = node.items; v = num(ev(items[0].node, c));
            for (i = 1; i < items.length; i++) {
                var f = num(ev(items[i].node, c));
                if (items[i].op === '/') { if (f === 0) fail('Division by zero.', items[i].opPos, items[i].opLen); v = v / f; } else v = v * f;
                finite(v, items[i].opPos, items[i].opLen);
            }
            return v;
        case 'pow':
            items = node.items; v = num(ev(items[0].node, c));
            for (i = 1; i < items.length; i++) {
                var e = num(ev(items[i].node, c));
                if (v < 0 && !isInt(e)) fail('Cannot raise a negative number (' + fmt(v) + ') to a fractional power.', items[i].opPos, items[i].opLen);
                v = Math.pow(v, e); finite(v, items[i].opPos, items[i].opLen);
            }
            return v;
        case 'cmp': {
            var d0 = c.dice.length, L = ev(node.l, c), lRolled = c.dice.length > d0, d1 = c.dice.length, R = ev(node.r, c), rRolled = c.dice.length > d1;
            var ln = num(L), rn = num(R), pass = meets(node.op, ln, rn);
            if (lRolled || rRolled) {
                var margin = (node.op === '>' || node.op === '>=') ? ln - rn : (node.op === '<' || node.op === '<=') ? rn - ln : Math.abs(ln - rn);
                var chk = { left: ln, op: node.op, right: rn, pass: pass, margin: margin, top: node === c.ast.body };
                c.checks.push(chk); c.recs.set(node, { check: chk, lRolled: lRolled, rRolled: rRolled });
            }
            return pass;
        }
        case 'not': v = truthy(ev(node.a, c)); for (i = 0; i < node.n; i++) v = !v; return v;
        case 'and': case 'or': {
            var isAnd = node.t === 'and';
            for (i = 0; i < node.items.length; i++) { var b = truthy(ev(node.items[i], c)); if (isAnd ? !b : b) return !isAnd; }
            return isAnd;
        }
        case 'call': return callFn(node, c);
    }
    fail('The formula could not be evaluated.', 0, 0);
}
function callFn(node, c) {
    var a = node.args, name = node.name, x, i;
    function arg(k) { return num(ev(a[k], c)); }
    switch (name) {
        case 'if': return ev(a[truthy(ev(a[0], c)) ? 1 : 2], c);
        case 'and': case 'or': {
            var isAnd = name === 'and';
            for (i = 0; i < a.length; i++) { var b = truthy(ev(a[i], c)); if (isAnd ? !b : b) return !isAnd; }
            return isAnd;
        }
        case 'floor': return Math.floor(arg(0));
        case 'ceil': return Math.ceil(arg(0));
        case 'trunc': return Math.trunc(arg(0));
        case 'abs': return Math.abs(arg(0));
        case 'round': { x = arg(0); var d = a.length > 1 ? arg(1) : 0; return finite(roundTo(x, d), node.pos, node.len); }
        case 'sqrt': { x = arg(0); if (x < 0) fail('sqrt of a negative number (' + fmt(x) + ').', a[0].pos, a[0].len); return Math.sqrt(x); }
        case 'min': case 'max': { x = arg(0); for (i = 1; i < a.length; i++) { var y = arg(i); x = name === 'min' ? Math.min(x, y) : Math.max(x, y); } return x; }
        case 'clamp': { x = arg(0); var lo = arg(1), hi = arg(2); if (lo > hi) fail('clamp: the low bound (' + fmt(lo) + ') is above the high bound (' + fmt(hi) + ').', a[1].pos, a[1].len); return Math.min(hi, Math.max(lo, x)); }
        case 'mod': { x = arg(0); var m = arg(1); if (m === 0) fail('mod by zero.', node.pos, node.text.length); return finite(x - m * Math.floor(x / m), node.pos, node.len); }
    }
    fail('The formula could not be evaluated.', node.pos, node.len);
}

/* ---------- rendering ---------- */
function dieToken(d, fudge) {
    function vs(v) { return fudge && v > 0 ? '+' + v : String(v); }
    var s;
    if (d.hist.length > 1) {
        var h = d.hist.map(vs);
        if (h.length > 5) h = h.slice(0, 3).concat(['…', h[h.length - 1]]);
        s = h.join('→');
    } else s = vs(d.hist[0]);
    if (d.chain.length > 1) {
        var ch = d.chain.slice(1).map(vs);
        if (ch.length > 4) ch = ch.slice(0, 2).concat(['…', ch[ch.length - 1]]);
        s += '!+' + ch.join('+');
    }
    if (d.capped) s += ' capped';
    if (d.hit) s += '✓';
    if (!d.kept) s = '(' + s + ')';
    return s;
}
function diceList(rec, cap) {
    if (cap === 0) return '…';
    var fudge = rec.faces === 'F', toks = [];
    for (var i = 0; i < rec.dice.length && i < cap; i++) toks.push(dieToken(rec.dice[i], fudge));
    var out = toks.join(', ');
    if (rec.dice.length > cap) out += ', … (' + (rec.dice.length - cap) + ' more)';
    return out;
}
function render(node, c, out) {                       // appends strings and { d: index } placeholders to out
    var r = c.recs.get(node), i;
    if (node.paren) out.push('(');
    switch (node.t) {
        case 'num': out.push(fmt(node.v)); break;
        case 'bool': out.push(node.v ? 'true' : 'false'); break;
        case 'name': out.push(node.text); if (r) out.push(' (' + fmt(r.value) + ')'); break;
        case 'dice': out.push(node.text); if (r && c.dice[r.dice].count > 0) { out.push(' ['); out.push({ d: r.dice }); out.push(']'); } break;
        case 'neg': case 'pos': {
            out.push(node.t === 'neg' ? '-' : '+');
            var wrap = !node.a.paren && (node.a.t === 'sum' || node.a.t === 'cmp' || node.a.t === 'and' || node.a.t === 'or' || node.a.t === 'not');
            if (wrap) out.push('('); render(node.a, c, out); if (wrap) out.push(')'); break;
        }
        case 'sum': case 'prod':
            for (i = 0; i < node.items.length; i++) { if (i) out.push(' ' + node.items[i].op + ' '); render(node.items[i].node, c, out); }
            break;
        case 'pow':
            for (i = 0; i < node.items.length; i++) { if (i) out.push(' ^ '); render(node.items[i].node, c, out); }
            break;
        case 'cmp': {
            render(node.l, c, out);
            if (r && r.check.top && r.lRolled) out.push(' = ' + fmt(r.check.left));
            out.push(' ' + node.op + ' ');
            render(node.r, c, out);
            if (r && r.check.top && r.rRolled) out.push(' = ' + fmt(r.check.right));
            if (r && r.check.top) out.push(': ' + verdict(r.check));
            else if (r) out.push(r.check.pass ? ' ✓' : ' ✗');
            break;
        }
        case 'not': {
            for (i = 0; i < node.n; i++) out.push('not ');
            var w2 = !node.a.paren && (node.a.t === 'and' || node.a.t === 'or');
            if (w2) out.push('('); render(node.a, c, out); if (w2) out.push(')'); break;
        }
        case 'and': case 'or':
            for (i = 0; i < node.items.length; i++) { if (i) out.push(' ' + node.t + ' '); render(node.items[i], c, out); }
            break;
        case 'call':
            out.push(node.text + '(');
            for (i = 0; i < node.args.length; i++) { if (i) out.push(', '); render(node.args[i], c, out); }
            out.push(')');
            break;
    }
    if (node.paren) out.push(')');
}
function verdict(chk) {
    if (chk.op === '=' || chk.op === '!=') return chk.pass ? 'success' : 'failure';
    return chk.pass ? 'success by ' + fmt(chk.margin) : 'failure by ' + fmt(-chk.margin);
}
function expand(template, dice, cap) {
    var s = '';
    for (var i = 0; i < template.length; i++) { var part = template[i]; s += typeof part === 'string' ? part : diceList(dice[part.d], cap); }
    return s;
}

/* ---------- API ---------- */
function evaluateAst(ast, options) {
    options = options || {};
    try {
        if (!ast || ast.t !== 'root' || !ast.body) fail('The formula could not be evaluated.', 0, 0);
        var depth = options.depth > 0 ? options.depth : 0;
        if (depth > LIMITS.maxDepth) fail('Formulas refer to each other too deeply (over ' + LIMITS.maxDepth + ' levels).', 0, 0);
        var c = new Ctx(ast, options), value = ev(ast.body, c);
        if (typeof c.random.remaining === 'function' && c.random.remaining() > 0) fail('The stored roll does not match this formula.', 0, 0);
        var top = null;
        for (var k = 0; k < c.checks.length; k++) if (c.checks[k].top) top = c.checks[k];
        var parts = [];
        render(ast.body, c, parts);
        if (!top) parts.push(' = ' + fmt(value));
        var template = [];
        for (var p = 0; p < parts.length; p++) {
            if (typeof parts[p] === 'string' && template.length && typeof template[template.length - 1] === 'string') template[template.length - 1] += parts[p];
            else template.push(parts[p]);
        }
        var dice = c.dice.map(function(rec) {
            return { text: rec.text, count: rec.count, faces: rec.faces, rolls: rec.rolls, kept: rec.kept, dropped: rec.dropped, rerolled: rec.rerolled, exploded: rec.exploded,
                     capped: rec.capped, cs: rec.cs, total: rec.total, dice: rec.dice, pos: rec.pos, len: rec.len };
        });
        var summary = top ? fmt(top.left) + ' ' + top.op + ' ' + fmt(top.right) + ': ' + verdict(top) : '= ' + fmt(value);
        return { ok: true, value: value, type: typeof value === 'boolean' ? 'boolean' : 'number', diceRolled: c.pool, draws: c.draws,
                 breakdown: { dice: dice, checks: c.checks, names: c.names, template: template, text: expand(template, dice, 40), summary: summary } };
    } catch (e) {
        if (e instanceof FormulaError) return { ok: false, error: { message: e.message, pos: e.pos, len: e.len } };
        return { ok: false, error: { message: 'The formula could not be evaluated.', pos: 0, len: 0 } };
    }
}
function evaluate(text, options) {
    var p = parse(text);
    if (!p.ok) return p;
    return evaluateAst(p.ast, options);
}
function names(text) { var p = parse(text); return p.ok ? p.names : []; }
// The breakdown as tokens for a renderer: strings, and { die: <dice record>, text } for each dice group (cap = dice shown per group)
function parts(result, cap) {
    if (!result || !result.ok || !result.breakdown) return [];
    var b = result.breakdown, out = [], n = cap > 0 ? cap : 40;
    for (var i = 0; i < b.template.length; i++) { var p = b.template[i]; if (typeof p === 'string') out.push(p); else out.push({ die: b.dice[p.d], text: diceList(b.dice[p.d], n) }); }
    return out;
}
function describe(result, opts) {
    if (!result || !result.ok || !result.breakdown) return '';
    var b = result.breakdown, max = opts && opts.maxChars > 0 ? opts.maxChars : 0;
    if (!max) return b.text;
    var caps = [40, 20, 10, 5, 0];
    for (var i = 0; i < caps.length; i++) { var s = expand(b.template, b.dice, caps[i]); if (s.length <= max) return s; }
    return b.summary;
}

var API = { parse: parse, evaluate: evaluate, evaluateAst: evaluateAst, names: names, describe: describe, parts: parts, fromDraws: fromDraws, LIMITS: LIMITS, VERSION: VERSION };
if (typeof window !== 'undefined') window.wpFormula = API;

export { parse, evaluate, evaluateAst, names, describe, parts, fromDraws, LIMITS, VERSION };
