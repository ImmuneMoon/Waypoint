/* Waypoint — a formula as a form (1.6.2; the owner, 2026-11-02: "we shouldnt be using code expressions on the user side", by prompt "Forms for
   every formula" and "A. Steps"). The pure half of the form that stands over every formula box: read turns a formula into steps, write turns
   steps back into a formula, say turns them into words. A formula is still what is stored: nothing here changes what a sheet, a file or a roll
   holds. Every formula the engine parses opens here, and what has no step of its own stays whole as text, so nothing is lost.

   A form is { steps: [step, ...] }, each step { op, v?, w? }:
     start v              the first value
     + - * / ^ v          acts on the answer so far
     floor ceil trunc abs sqrt neg, round (v the places, or none)
     least v, most v      the answer, at least or at most v (max and min of two)
     clamp v w            the answer held between v and w
   A roll or a test that ends in a comparison holds check: { op, r: form } beside its steps.
   A value is { k, ... }:
     num  { v, s }        a number, s as written
     bool { v }
     name { s }           a value of the sheet, by the name a formula reads it by
     dice { n, f, keep, reroll, explode, cs, as }
     calc { form }        steps of their own
     test { cond }        a yes or no as a value
     if   { c, a, b }
     fn   { name, args }  any other function, each argument a form
     with { dice, last }  dice rolled to read, then what is read
     text { s }           anything else, kept whole
   A condition is { any, tests: [test, ...], not? }, each test { l, op, r } (forms), { val } (a form), { group } (a condition), or
   { words: { how, name, list } } (1.6.2, 167 D: is(Name, "a", "b") or contains(Name, "a"), the field's words against these). */
import { parse as parseF, evaluate as evalF } from './formula.js';

var LV = { or: 1, and: 2, not: 3, cmp: 4, sum: 5, prod: 6, pow: 7, unary: 8, atom: 9 };
var ROUND1 = { floor: 1, ceil: 1, trunc: 1, abs: 1, sqrt: 1 };
var OPS = { '=': 1, '!=': 1, '<': 1, '<=': 1, '>': 1, '>=': 1 };

/* ---------- reading: a parsed formula into steps ---------- */
function srcOf(n, c) { return n && typeof n.pos === 'number' ? c.slice(n.pos, n.pos + n.len) : ''; }
function txt(s) { return { k: 'text', s: s }; }
function diceVal(n, c) {
    var v = { k: 'dice', n: n.count === null || n.count === undefined ? null : n.count.t === 'num' && !n.count.paren ? { k: 'num', v: n.count.v, s: n.count.text } : valOf(n.count, c),
              f: n.faces === 'F' ? 'F' : n.faces && n.faces.t === 'num' && !n.faces.paren ? (n.faces.text === '%' ? '%' : { k: 'num', v: n.faces.v, s: n.faces.text }) : valOf(n.faces, c) };
    function fig(s) { return s.expr ? valOf(s.expr, c) : { k: 'num', v: s.n, s: String(s.n) }; }
    if (n.keep) v.keep = { sub: n.keep.sub, v: fig(n.keep) };
    if (n.reroll) v.reroll = { sub: n.reroll.sub, op: n.reroll.op, v: fig(n.reroll) };
    if (n.explode) { v.explode = { own: n.explode.own === true }; if (n.explode.op) { v.explode.op = n.explode.op; v.explode.v = fig(n.explode); } }
    if (n.cs) v.cs = { op: n.cs.op, v: fig(n.cs) };
    if (n.as) v.as = n.as;
    v.was = srcOf(n, c);
    return v;
}
function condOf(n, c) {
    if (n.t === 'and' || n.t === 'or') return { any: n.t === 'or', tests: n.items.map(function(x) { return testOf(x, c); }) };
    return { any: false, tests: [testOf(n, c)] };
}
function testOf(n, c) {
    if (n.t === 'call' && n.holds) return { words: { how: 'holds', lst: n.args[0].text, name: n.args[1].t === 'name' ? n.args[1].text : '', list: n.args[1].t === 'str' ? [n.args[1].v] : [] } };   // 1.6.2 (164 i): a list holds a row named by a field, or by words
    if (n.t === 'call' && n.words) return { words: { how: n.name === 'contains' ? 'contains' : 'is', name: n.args[0].text, list: n.args.slice(1).map(function(a) { return a.v; }) } };   // 1.6.2 (167 D)
    if (n.t === 'cmp') return { l: formOf(n.l, c), op: n.op, r: formOf(n.r, c) };
    if (n.t === 'and' || n.t === 'or') return { group: condOf(n, c) };
    if (n.t === 'not') { var g = condOf(n.a, c); g.not = n.n; return { group: g }; }
    return { val: formOf(n, c) };
}
function valOf(n, c) {   // a node as one value
    if (n.t === 'neg' && n.a && n.a.t === 'num' && n.a.v !== 0) return { k: 'num', v: -n.a.v, s: '-' + n.a.text };   // a number below 0 is a number, never one with its sign flipped
    switch (n.t) {
        case 'num': return { k: 'num', v: n.v, s: n.text };
        case 'bool': return { k: 'bool', v: n.v };
        case 'name': return { k: 'name', s: n.text };
        case 'dice': return diceVal(n, c);
        case 'cmp': case 'and': case 'or': case 'not': return { k: 'test', cond: condOf(n, c) };
        case 'call':
            if (n.words) return { k: 'test', cond: { any: false, tests: [testOf(n, c)] } };   // 1.6.2 (167 D): a test of words, as a value
            if (n.name === 'if' && n.args.length === 3) return { k: 'if', c: condOf(n.args[0], c), a: formOf(n.args[1], c), b: formOf(n.args[2], c) };
            if (n.name === 'with') return { k: 'with', dice: n.args.slice(0, -1).map(function(a) { return formOf(a, c); }), last: formOf(n.args[n.args.length - 1], c) };
            return { k: 'fn', name: n.name, args: n.args.map(function(a) { return formOf(a, c); }) };
        case 'sum': case 'prod': case 'pow': case 'neg': case 'pos': return { k: 'calc', form: formOf(n, c) };
    }
    return txt(srcOf(n, c));
}
function stepsInto(n, c, out) {   // left to right, each step on the answer so far
    if (n.t === 'sum' || n.t === 'prod' || n.t === 'pow') {
        stepsInto(n.items[0].node, c, out);
        for (var i = 1; i < n.items.length; i++) out.push({ op: n.t === 'pow' ? '^' : n.items[i].op, v: valOf(n.items[i].node, c) });
        return;
    }
    if (n.t === 'neg' && n.a && n.a.t === 'num' && n.a.v !== 0) { out.push({ op: 'start', v: valOf(n, c) }); return; }
    if (n.t === 'neg') { stepsInto(n.a, c, out); out.push({ op: 'neg' }); return; }
    if (n.t === 'pos') { stepsInto(n.a, c, out); out.push({ op: 'pos' }); return; }   // a plus sign turns a yes or no into 1 or 0
    if (n.t === 'call') {
        var a = n.args;
        if (ROUND1[n.name] && a.length === 1) { stepsInto(a[0], c, out); out.push({ op: n.name }); return; }
        if (n.name === 'round' && a.length <= 2) { stepsInto(a[0], c, out); out.push(a.length === 2 ? { op: 'round', v: valOf(a[1], c) } : { op: 'round' }); return; }
        if (n.name === 'log' && a.length === 2) { stepsInto(a[0], c, out); out.push({ op: 'log', v: valOf(a[1], c) }); return; }   // 1.6.2: log(x, base) reads as x, its logarithm to that base
        if ((n.name === 'max' || n.name === 'min') && a.length === 2) { var sw = a[0].t === 'num' && a[1].t !== 'num'; stepsInto(a[sw ? 1 : 0], c, out); out.push({ op: n.name === 'max' ? 'least' : 'most', v: valOf(a[sw ? 0 : 1], c) }); return; }   // max(1, Skill) reads as Skill, at least 1
        if (n.name === 'clamp') { stepsInto(a[0], c, out); out.push({ op: 'clamp', v: valOf(a[1], c), w: valOf(a[2], c) }); return; }
    }
    out.push({ op: 'start', v: valOf(n, c) });
}
function formOf(n, c) {
    var f = { steps: [] }; stepsInto(n, c, f.steps);
    return f;
}
// a formula as a form. A comparison at the top of it, past any with(), is its check
function read(text) {
    var p = parseF(String(text === undefined || text === null ? '' : text));
    if (!p.ok) return { ok: false, error: p.error };
    var c = p.ast.src !== undefined ? p.ast.src : String(text), n = p.ast.body;
    if (n.t === 'cmp') { var f = formOf(n.l, c); f.check = { op: n.op, r: formOf(n.r, c) }; return { ok: true, form: f }; }
    return { ok: true, form: formOf(n, c) };
}

function readCond(text) {
    var p = parseF(String(text === undefined || text === null ? '' : text));
    if (!p.ok) return { ok: false, error: p.error };
    var c = p.ast.src !== undefined ? p.ast.src : String(text), n = p.ast.body;
    if (n.t === 'not') { var g = condOf(n.a, c); g.not = n.n; return { ok: true, cond: g }; }
    return { ok: true, cond: condOf(n, c) };
}

/* ---------- writing: steps back into a formula ---------- */
function paren(x, lv) { return x.lv < lv ? '(' + x.s + ')' : x.s; }
function figText(v) { var w = valText(v); return v.k === 'num' ? w.s : '(' + w.s + ')'; }
function diceText(v) {
    if (v.was !== undefined && v.dirty !== true) return v.was;
    var n = v.n === null || v.n === undefined ? '' : v.n.k === 'num' ? v.n.s : '(' + valText(v.n).s + ')', f = v.f === 'F' || v.f === '%' ? v.f : v.f.k === 'num' ? v.f.s : '(' + valText(v.f).s + ')', s = n + 'd' + f;
    if (v.keep) s += v.keep.sub + (v.keep.v.k === 'num' && v.keep.v.v === 1 ? '' : figText(v.keep.v));
    if (v.reroll) s += v.reroll.sub + (v.reroll.op === '=' && v.reroll.v.k === 'num' ? '' : v.reroll.op) + figText(v.reroll.v);
    if (v.explode) { s += v.explode.own ? '!!' : '!'; if (v.explode.op) s += v.explode.op + figText(v.explode.v); }
    if (v.cs) s += 'cs' + v.cs.op + figText(v.cs.v);
    if (v.as) s += '@' + v.as;
    return s;
}
function valText(v) {
    switch (v.k) {
        case 'num': return { s: v.s !== undefined ? String(v.s) : String(v.v), lv: v.v < 0 ? LV.unary : LV.atom };
        case 'bool': return { s: v.v ? 'true' : 'false', lv: LV.atom };
        case 'name': return { s: v.s, lv: LV.atom };
        case 'dice': return { s: diceText(v), lv: LV.atom };
        case 'calc': return formText(v.form);
        case 'test': return condText(v.cond);
        case 'if': return { s: 'if(' + condText(v.c).s + ', ' + formText(v.a).s + ', ' + formText(v.b).s + ')', lv: LV.atom };
        case 'with': return { s: 'with(' + v.dice.concat([v.last]).map(function(f) { return formText(f).s; }).join(', ') + ')', lv: LV.atom };
        case 'fn': return { s: v.name + '(' + v.args.map(function(f) { return formText(f).s; }).join(', ') + ')', lv: LV.atom };
        case 'text': return { s: v.s, lv: LV.or };
    }
    return { s: '', lv: LV.or };
}
function stepOn(t, st) {
    var o = st.op, r, x = st.v ? valText(st.v) : null;
    if (o === '+' || o === '-') { r = x.lv <= LV.sum ? '(' + x.s + ')' : x.s; return { s: paren(t, LV.sum) + ' ' + o + ' ' + r, lv: LV.sum }; }
    if (o === '*' || o === '/') { r = x.lv <= LV.prod ? '(' + x.s + ')' : x.s; return { s: paren(t, LV.prod) + ' ' + o + ' ' + r, lv: LV.prod }; }
    if (o === '^') { r = x.lv <= LV.pow ? '(' + x.s + ')' : x.s; return { s: paren(t, LV.pow) + ' ^ ' + r, lv: LV.pow }; }
    if (o === 'neg' || o === 'pos') return { s: (o === 'neg' ? '-' : '+') + (t.lv < LV.atom ? '(' + t.s + ')' : t.s), lv: LV.unary };
    if (ROUND1[o]) return { s: o + '(' + t.s + ')', lv: LV.atom };
    if (o === 'round') return { s: 'round(' + t.s + (x ? ', ' + x.s : '') + ')', lv: LV.atom };
    if (o === 'log') return { s: 'log(' + t.s + ', ' + x.s + ')', lv: LV.atom };
    if (o === 'least') return { s: 'max(' + t.s + ', ' + x.s + ')', lv: LV.atom };
    if (o === 'most') return { s: 'min(' + t.s + ', ' + x.s + ')', lv: LV.atom };
    if (o === 'clamp') return { s: 'clamp(' + t.s + ', ' + x.s + ', ' + valText(st.w).s + ')', lv: LV.atom };
    return t;
}
function formText(f) {
    var t = null;
    (f.steps || []).forEach(function(st) { if (st.op === 'start') { var w = valText(st.v); t = t ? { s: paren(t, LV.sum) + ' + ' + (w.lv <= LV.sum ? '(' + w.s + ')' : w.s), lv: LV.sum } : w; } else if (t) t = stepOn(t, st); });
    t = t || { s: '0', lv: LV.atom };
    if (f.check) { var r = formText(f.check.r); return { s: paren(t, LV.sum) + ' ' + f.check.op + ' ' + paren(r, LV.sum), lv: LV.cmp }; }
    return t;
}
// 1.6.2 (167 D): words in quotes hold no quote and no line break
function wordQ(w) { return '"' + String(w === undefined || w === null ? '' : w).replace(/["\u201c\u201d\r\n]/g, ' ').trim() + '"'; }
function wordsText(w) { if (w.how === 'holds') return { s: 'holds(' + (w.lst || '') + ', ' + (w.name ? w.name : wordQ((Array.isArray(w.list) ? w.list : [])[0])) + ')', lv: LV.atom }; var l = (Array.isArray(w.list) ? w.list : []).slice(0, w.how === 'contains' ? 1 : 8); if (!l.length) l = ['']; return { s: (w.how === 'contains' ? 'contains' : 'is') + '(' + (w.name || '') + ', ' + l.map(wordQ).join(', ') + ')', lv: LV.atom }; }
function testText(t) {
    if (t.words) return wordsText(t.words);
    if (t.group) return condText(t.group);
    if (t.val) return formText(t.val);
    var l = formText(t.l), r = formText(t.r);
    return { s: paren(l, LV.sum) + ' ' + t.op + ' ' + paren(r, LV.sum), lv: LV.cmp };
}
function condText(c) {
    var lv = c.any ? LV.or : LV.and, w = c.any ? ' or ' : ' and ', ts = (c.tests || []).map(testText), out;
    out = ts.length === 1 ? ts[0] : { s: ts.map(function(x) { return x.lv <= lv ? '(' + x.s + ')' : x.s; }).join(w), lv: lv };
    if (c.not) { var pre = ''; for (var i = 0; i < c.not; i++) pre += 'not '; return { s: pre + (out.lv <= LV.not ? '(' + out.s + ')' : out.s), lv: LV.not }; }
    return out;
}
function write(f) { return formText(f).s; }
function writeCond(c) { return condText(c).s; }

/* ---------- saying: steps in plain words ---------- */
var STEP_WORDS = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by', '^': 'to the power of' };
var ROUND_WORDS = { floor: 'rounded down', ceil: 'rounded up', trunc: 'with its fraction dropped', abs: 'made positive', sqrt: 'its square root', neg: 'with its sign flipped' };
var CMP_WORDS = { '>=': 'is at least', '<=': 'is at most', '>': 'is over', '<': 'is under', '=': 'is', '!=': 'is not' };
var CHECK_WORDS = { '>=': ' or more', '<=': ' or less' };
var READ_WORDS = { high: 'the highest of', low: 'the lowest of', sets: 'the most that match in', setface: 'the face that most match on in', pairs: 'the pairs in', total: 'the total of' };
function nameSays(s, say) { var w = say && typeof say.name === 'function' ? say.name(s) : ''; return typeof w === 'string' && w ? w : String(s).split('.').join(' '); }
function figSays(v, say) { return v && v.k === 'num' ? String(v.v) : valSays(v, say); }
function bare(t) { t = String(t); if (t.charAt(0) !== '(' || t.charAt(t.length - 1) !== ')') return t; var d = 0; for (var i = 0; i < t.length; i++) { if (t.charAt(i) === '(') d++; else if (t.charAt(i) === ')') { d--; if (d === 0 && i < t.length - 1) return t; } } return t.slice(1, -1); }   // one pair of brackets round the whole, taken off
function diceSays(v, say) {
    var n = v.n === null || v.n === undefined ? '1' : figSays(v.n, say), f = v.f === 'F' ? 'F' : v.f === '%' ? '100' : figSays(v.f, say), fw = v.f && v.f.k && v.f.k !== 'num' ? '(' + bare(f) + ')' : f, s = v.n && v.n.k !== 'num' ? 'as many d' + fw + ' as ' + bare(n) : n + 'd' + fw, more = [];   // 1.6.2 (found building a dice pool by hand): a count from the sheet reads as words, never as doubled brackets
    if (v.keep) { var one = v.keep.sub === 'kh' ? 'keeping the highest ' : v.keep.sub === 'kl' ? 'keeping the lowest ' : v.keep.sub === 'dh' ? 'dropping the highest ' : 'dropping the lowest '; more.push(one + figSays(v.keep.v, say)); }
    if (v.reroll) more.push((v.reroll.sub === 'rr' ? 'rerolling every ' : 'rerolling once any ') + (v.reroll.op === '=' ? '' : (CMP_WORDS[v.reroll.op] || '') + ' ') + figSays(v.reroll.v, say));
    if (v.explode) more.push((v.explode.own ? 'each exploding into a die of its own' : 'exploding') + (v.explode.op ? ' on ' + figSays(v.explode.v, say) + (CHECK_WORDS[v.explode.op] || '') : ''));
    if (v.cs) more.push('counting ' + figSays(v.cs.v, say) + (CHECK_WORDS[v.cs.op] || '') + ' as a success');
    return s + (more.length ? ', ' + more.join(', ') : '');
}
function fnSays(v, say) {
    var a = v.args, n = v.name, w = function(i) { return a[i] ? formSays(a[i], say) : ''; }, all = function() { return a.map(function(f) { return formSays(f, say); }).join(', '); };
    if (READ_WORDS[n]) return READ_WORDS[n] + ' ' + w(0);
    if (n === 'count') { var st = a[0] && a[0].steps && a[0].steps[0] && a[0].steps[0].v, c = st && st.k === 'test' ? st.cond.tests[0] : null; return c && c.l ? (c.op === '>=' ? 'how many reach ' + formSays(c.r, say) : 'how many of ' + formSays(c.l, say) + ' ' + (CMP_WORDS[c.op] || c.op) + ' ' + formSays(c.r, say)) : 'how many dice in ' + w(0); }
    if (n === 'nth') return 'number ' + w(1) + ' from the highest of ' + w(0);
    if (n === 'best') return 'the best ' + w(1) + ' of ' + w(0);
    if (n === 'worst') return 'the worst ' + w(1) + ' of ' + w(0);
    if (n === 'digit') return 'digit ' + w(1) + ' of ' + w(0);
    if (n === 'mod') return 'the remainder of ' + w(0) + ' divided by ' + w(1);
    if (n === 'has') return w(0) + ' has place ' + w(1);
    if (n === 'max') return 'the highest of ' + all();
    if (n === 'min') return 'the lowest of ' + all();
    if (n === 'and') return 'all of ' + all();
    if (n === 'or') return 'any of ' + all();
    return n + ' of ' + all();
}
function valSays(v, say) {
    switch (v && v.k) {
        case 'num': return String(v.v);
        case 'bool': return v.v ? 'yes' : 'no';
        case 'name': return nameSays(v.s, say);
        case 'dice': return diceSays(v, say);
        case 'calc': return '(' + formSays(v.form, say) + ')';
        case 'test': return condSays(v.cond, say);
        case 'if': return '(if ' + condSays(v.c, say) + ' then ' + formSays(v.a, say) + ', otherwise ' + formSays(v.b, say) + ')';
        case 'with': { var one = v.dice.length === 1 ? oneVal(v.dice[0]) : null, g = one && one.as ? String(one.as).toLowerCase() : '', sayW = g ? { name: function(s) { return String(s).toLowerCase() === g ? 'the dice' : say && typeof say.name === 'function' ? say.name(s) : ''; } } : say; return 'roll ' + v.dice.map(function(f) { return formSays(f, say); }).join(' and ') + ', then read ' + formSays(v.last, sayW); }
        case 'fn': return fnSays(v, say);
        case 'text': return String(v.s);
    }
    return '';
}
function stepSays(st, say) {
    var o = st.op;
    if (STEP_WORDS[o]) return STEP_WORDS[o] + ' ' + valSays(st.v, say);
    if (ROUND_WORDS[o]) return ROUND_WORDS[o];
    if (o === 'round') return st.v ? 'rounded to ' + valSays(st.v, say) + ' places' : 'rounded';
    if (o === 'log') return 'its logarithm to the base ' + valSays(st.v, say);
    if (o === 'least') return 'at least ' + valSays(st.v, say);
    if (o === 'most') return 'at most ' + valSays(st.v, say);
    if (o === 'clamp') return 'held between ' + valSays(st.v, say) + ' and ' + valSays(st.w, say);
    return '';
}
function formSays(f, say) {
    var out = '';
    (f.steps || []).forEach(function(st) { var w = st.op === 'start' ? valSays(st.v, say) : stepSays(st, say); if (w) out = out ? out + (st.op === 'start' ? ' plus ' : STEP_WORDS[st.op] ? ' ' : ', ') + w : w; });
    if (f.check) out += ', a success if it ' + (CMP_WORDS[f.check.op] || f.check.op) + ' ' + formSays(f.check.r, say);
    return out;
}
function testSays(t, say) {
    if (t.words && t.words.how === 'holds') return (t.words.name ? nameSays(t.words.name, say) : '\u201c' + ((t.words.list || [])[0] || '') + '\u201d') + ' names a row of ' + nameSays(t.words.lst || '', say);   // 1.6.2 (164 i)
    if (t.words) { var wl = (Array.isArray(t.words.list) ? t.words.list : []).map(function(w) { return '\u201c' + w + '\u201d'; }), wn = nameSays(t.words.name || '', say); return t.words.how === 'contains' ? wn + ' contains ' + (wl[0] || '\u201c\u201d') : wl.length > 1 ? wn + ' is one of ' + wl.join(', ') : wn + ' is ' + (wl[0] || '\u201c\u201d'); }   // 1.6.2 (167 D)
    if (t.group) return condSays(t.group, say);
    if (t.val) return formSays(t.val, say);
    return formSays(t.l, say) + ' ' + (CMP_WORDS[t.op] || t.op) + ' ' + formSays(t.r, say);
}
function condSays(c, say) {
    var s = (c.tests || []).map(function(t) { return testSays(t, say); }).join(c.any ? ', or ' : ', and ');
    return c.not ? 'not (' + s + ')' : s;
}
// what a form says, for the line a shut box shows. say.name(text), where there is one, names a value of the sheet by its label
function says(f, say) { return formSays(f, say); }
function saysCond(c, say) { return condSays(c, say); }
/* ---------- what a roll is for, and what it does at the table ---------- */
// the plain shape of a roll: dice, figures added or taken off, and a number to beat. Anything else stays as steps
// one line of Read the dice: what is read from the handful. null for anything else
var READ_TAKES = { nth: 1, best: 1, worst: 1 }, READ_PLAIN = { high: 1, low: 1, sets: 1, pairs: 1, total: 1 };
function oneVal(f) { return f && f.steps && f.steps.length === 1 && f.steps[0].op === 'start' && !f.check ? f.steps[0].v : null; }
function isGroup(v, g) { return !!v && v.k === 'name' && String(v.s).toLowerCase() === String(g).toLowerCase(); }
function readLine(v, g) {
    if (!v || v.k !== 'fn') return null;
    var a = v.args || [], head = oneVal(a[0]);
    if (v.name === 'count') { var c = head && head.k === 'test' && head.cond.tests.length === 1 && !head.cond.any && !head.cond.not ? head.cond.tests[0] : null, r = c && c.l ? oneVal(c.r) : null; return a.length === 1 && r && isGroup(oneVal(c.l), g) && (c.op === '>=' || c.op === '<=' || c.op === '=') ? { how: 'count', op: c.op, n: r } : null; }
    if (!isGroup(head, g)) return null;
    if (READ_PLAIN[v.name] && a.length === 1) return { how: v.name };
    var n = READ_TAKES[v.name] && a.length === 2 ? oneVal(a[1]) : null; return n ? { how: v.name, n: n } : null;
}
function readMake(how, g, op, n) {
    var nm = { steps: [{ op: 'start', v: { k: 'name', s: g } }] }, fig = n || { k: 'num', v: how === 'count' ? 7 : 2, s: how === 'count' ? '7' : '2' };
    if (how === 'count') return { k: 'fn', name: 'count', args: [{ steps: [{ op: 'start', v: { k: 'test', cond: { any: false, tests: [{ l: nm, op: op || '>=', r: { steps: [{ op: 'start', v: fig }] } }] } } }] }] };
    return { k: 'fn', name: how, args: READ_TAKES[how] ? [nm, { steps: [{ op: 'start', v: fig }] }] : [nm] };
}
function readFace(f) {   // one handful named, read by lines added or taken off, with nothing else around it
    var w = f.steps.length === 1 && !f.check ? f.steps[0].v : null; if (!w || w.k !== 'with' || w.dice.length !== 1) return null;
    var d = oneVal(w.dice[0]), last = w.last; if (!d || d.k !== 'dice' || !d.as || !last || last.check || !last.steps.length) return null;
    for (var i = 0; i < last.steps.length; i++) { var st = last.steps[i]; if ((i ? st.op !== '+' && st.op !== '-' : st.op !== 'start') || !readLine(st.v, d.as)) return null; }
    return { kind: 'read', dice: d, group: d.as, lines: last };
}
function rollFace(f) {
    var rf = f && f.steps && f.steps.length ? readFace(f) : null; if (rf) return rf;
    var st = f && f.steps, first = st && st[0];
    if (!first || first.op !== 'start' || !first.v || first.v.k !== 'dice' || first.v.as) return { kind: 'else' };
    for (var i = 1; i < st.length; i++) if (st[i].op !== '+' && st[i].op !== '-') return { kind: 'else' };
    return { kind: first.v.cs ? 'hits' : f.check ? 'beat' : 'total', dice: first.v };
}
var TRY_N = 4000, TRY_MS = 60;
function seeded(seed) { var s = seed >>> 0; return function(faces) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return 1 + Math.floor(s / 4294967296 * faces); }; }   // the engine asks a die of that many faces
function diceN(v) { return v.n === null || v.n === undefined ? 1 : v.n.k === 'num' ? v.n.v : 0; }
function plainPool(v) { var n = v ? diceN(v) : 0; return !!v && v.k === 'dice' && !v.keep && !v.reroll && !v.explode && !v.cs && !!v.f && v.f.k === 'num' && n >= 1 && n <= 30 && v.f.v >= 2 && v.f.v <= 100; }
// the exact chance of every total of plain dice
function poolOf(n, f) {
    var d = [1];
    for (var i = 0; i < n; i++) { var nd = new Array(d.length + f).fill(0); for (var s = 0; s < d.length; s++) { if (!d[s]) continue; for (var k = 1; k <= f; k++) nd[s + k] += d[s] / f; } d = nd; }
    return d;
}
function holds(a, op, b) { return op === '<=' ? a <= b : op === '>=' ? a >= b : op === '<' ? a < b : op === '>' ? a > b : op === '=' ? a === b : a !== b; }
function sampleOf(text, vars) {
    var rnd = seeded(1102), n = 0, yes = 0, lo = Infinity, hi = -Infinity, sum = 0, isB = false, t0 = Date.now();
    for (var i = 0; i < TRY_N; i++) {
        if (typeof vars.fresh === 'function') vars.fresh(rnd);   // 1.6.2: a roll that draws cards first draws them anew for each try
        var r = evalF(text, { vars: vars, random: rnd, bare: true }); if (!r.ok) return null;
        var x = r.value; if (typeof x === 'boolean') { isB = true; if (x) yes++; } else if (typeof x === 'number' && isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; sum += x; } n++;
        if (i === 0 && !(r.draws && r.draws.length) && typeof vars.fresh !== 'function') break;
        if (i > 200 && Date.now() - t0 > TRY_MS) break;
    }
    return n ? { isB: isB, share: yes / n, lo: lo, hi: hi, mean: sum / n, dice: n > 1 } : null;
}
function figOf(form, vars) { var r = evalF(write(form), { vars: vars, random: seeded(7), bare: true }); return r.ok && typeof r.value === 'number' && isFinite(r.value) ? r.value : null; }
function fig1(x) { return String(Math.round(x * 10) / 10); }
function timesWord(p) { var n = Math.round(p * 100); return n <= 0 ? 'That almost never works.' : n >= 100 ? 'That almost always works.' : 'That works about ' + n + ' times in 100.'; }
function needWord(op, n) { return op === '<=' ? n + ' or less' : op === '>=' ? n + ' or more' : op === '<' ? 'under ' + n : op === '>' ? 'over ' + n : op === '=' ? 'exactly ' + n : 'anything but ' + n; }
function spanWord(lo, hi, mean) { return lo === hi ? fig1(lo) : fig1(lo) + ' to ' + fig1(hi) + ', about ' + fig1(mean); }
function aboutWord(s) { return s.lo === s.hi ? fig1(s.lo) : 'about ' + fig1(s.mean); }   // sampled dice: thousands of tries can miss a rare low or high, so no range is claimed
function rolledWord(d, vars) {   // the dice as a person would say them, with a figure of the sheet read
    var c = {}, one = function(v) { var r = figOf({ steps: [{ op: 'start', v: v }] }, vars); return r === null ? null : { k: 'num', v: r, s: String(r) }; }, k; for (k in d) if (Object.prototype.hasOwnProperty.call(d, k)) c[k] = d[k];
    if (c.n && c.n.k !== 'num') { var n = one(c.n); if (!n) return ''; c.n = n; } if (c.f && c.f.k && c.f.k !== 'num') { var f = one(c.f); if (!f) return ''; c.f = f; }
    delete c.cs; return diceSays(c, { name: function(s) { var x = vars(String(s).toLowerCase(), s); return typeof x === 'number' ? String(x) : ''; } });
}
// what a roll does for one character, in a sentence or two. o.who their name, o.vars what they read
function tryRoll(form, o) {
    var face = rollFace(form), who = o.who, vars = o.vars, text = write(form), s;
    if (face.kind === 'read') { var rw = rolledWord(face.dice, vars); s = sampleOf(text, vars); return s && rw ? who + ' rolls ' + rw + '. That gives ' + aboutWord(s) + '.' : ''; }
    if (face.kind === 'else') { var act = typeof vars.drawWord === 'string' && vars.drawWord ? ' ' + vars.drawWord : ' rolls'; s = sampleOf(text, vars); return !s ? '' : s.isB ? who + act + '. ' + timesWord(s.share) : who + act + ' and gets ' + aboutWord(s) + '.'; }
    var d = face.dice, word = rolledWord(d, vars), adds = 0; if (!word) return '';
    for (var i = 1; i < form.steps.length; i++) { var x = figOf({ steps: [{ op: 'start', v: form.steps[i].v }] }, vars); if (x === null) return ''; adds += form.steps[i].op === '-' ? -x : x; }
    var roll = who + ' rolls ' + word + (adds > 0 ? ' and adds ' + fig1(adds) : adds < 0 ? ' and takes off ' + fig1(-adds) : ''), pool = plainPool(d) ? poolOf(diceN(d), d.f.v) : null;
    if (face.kind === 'hits') {
        var at = figOf({ steps: [{ op: 'start', v: d.cs.v }] }, vars), each = at === null ? '' : ' Each die at ' + needWord(d.cs.op, at) + ' is a hit.';
        s = sampleOf(text, vars); if (!s) return roll + '.' + each;
        if (!form.check) return roll + '.' + each + ' That makes about ' + fig1(s.mean) + ' hits.';
        var nh = figOf(form.check.r, vars); return roll + ' and needs ' + (nh === null ? 'some' : needWord(form.check.op, nh)) + ' hits.' + each + ' ' + timesWord(s.share);
    }
    if (face.kind === 'beat') {
        var need = figOf(form.check.r, vars); if (need === null) return roll + '.';
        var share = null;
        if (pool) { share = 0; pool.forEach(function(p, t) { if (p && holds(t + adds, form.check.op, need)) share += p; }); } else { s = sampleOf(text, vars); share = s ? s.share : null; }
        return roll + (adds ? ', and needs a total of ' : ' and needs ') + needWord(form.check.op, need) + '.' + (share === null ? '' : ' ' + timesWord(share));
    }
    if (pool) { var lo = diceN(d) + adds, hi = diceN(d) * d.f.v + adds, m = 0; pool.forEach(function(p, t) { m += p * (t + adds); }); return roll + '. That gives ' + spanWord(lo, hi, m) + '.'; }
    s = sampleOf(text, vars); return s ? roll + '. That gives ' + aboutWord(s) + '.' : roll + '.';
}
// a figure or a yes or no, for one character
function tryValue(text, o) {
    var s = sampleOf(text, o.vars); if (!s) return '';
    if (o.cond) { if (s.dice) return 'For ' + o.who + ' that holds about ' + Math.round((s.isB ? s.share : 1) * 100) + ' times in 100.'; var yes = s.isB ? s.share > 0 : s.mean !== 0; return 'For ' + o.who + ' this ' + (yes ? 'holds now.' : 'does not hold now.'); }
    return s.isB ? 'For ' + o.who + ' this ' + (s.share > 0 ? 'holds now.' : 'does not hold now.') : 'For ' + o.who + ' this comes to ' + aboutWord(s) + '.';
}
/* ---------- words with figures among them: a caption, a roll's label ---------- */
// "Attack ({\u00b1Bonus})" as [{ text }, { form, sign, unit }, { text }]. null where a figure in it cannot be read
function readWords(text) {
    var t = String(text === undefined || text === null ? '' : text), out = [], re = /\{([^{}]*)\}/g, last = 0, m;
    while ((m = re.exec(t))) {
        if (m.index > last) out.push({ text: t.slice(last, m.index) });
        var inner = m[1].trim(), bar = inner.lastIndexOf('|'), unit = bar >= 0 ? inner.slice(bar) : ''; if (bar >= 0) inner = inner.slice(0, bar).trim();
        var sg = /^(\u00b1|\+\/-)\s*/.exec(inner), body = sg ? inner.slice(sg[0].length) : inner, r = read(body);
        if (!r.ok) return null;
        out.push({ form: r.form, sign: !!sg, unit: unit }); last = m.index + m[0].length;
    }
    if (last < t.length) out.push({ text: t.slice(last) });
    return out;
}
function writeWords(parts) { return parts.map(function(p) { return p.form ? '{' + (p.sign ? '\u00b1' : '') + write(p.form) + p.unit + '}' : p.text; }).join(''); }
function saysWords(parts, say) { return parts.map(function(p) { return p.form ? says(p.form, say) : p.text; }).join(''); }
// what the words read for one character
function tryWords(parts, o) { return 'For ' + o.who + ' it reads: ' + parts.map(function(p) { if (!p.form) return p.text; var x = figOf(p.form, o.vars); return x === null ? '?' : (p.sign && x >= 0 ? '+' : '') + fig1(x) + (p.unit ? ' ' + p.unit.slice(1).trim() : ''); }).join(''); }
// 1.6.2: a stat's options, the text its box keeps: Iron, Strength = ST. Rows of { label, name }, and back. A comma or an equals sign in a label would be read as the next option, so it goes
function readOpts(t) { return String(t || '').split(',').map(function(p) { var q = p.split('='), lb = q[0].trim(), nm = (q.length > 1 ? q.slice(1).join('=') : '').trim(); return { label: lb, name: nm }; }).filter(function(o) { return !!o.label; }); }
function writeOpts(rows) { return (Array.isArray(rows) ? rows : []).map(function(o) { var lb = String(o && o.label || '').replace(/[,=]/g, ' ').trim(), nm = String(o && o.name || '').replace(/[,=]/g, ' ').trim(); return !lb ? '' : nm && nm !== lb ? lb + ' = ' + nm : lb; }).filter(Boolean).join(', '); }
// 1.6.3 (gap 4 of docs/EDITOR_COVERAGE.md; the owner, 2026-11-19, by prompt: an option stands for a row of a list picked as three
// small picks, the list, the entry, with a search, and which figure of it, all by name): what an option of a choice stat may stand for beside
// the sheet's own figures is a figure of one row of an item list, written as the resolver reads it, List.Entry.Figure (an addressed row, which
// systemcore's listName reads), or on a list with Specialties List.Parent.Specialty.Figure (its specVal). These four are the pure half:
// formbox.js dressOpts draws the picks from them, and the System editor's Save keeps the name as cleanPickOpts does, ASCII letters, digits,
// _ and dots, 64 at most (OPT_NAME). Nothing here is shown as a name: the picks show labels, and a name is only what is stored
var OPT_ID = /^[A-Za-z_][A-Za-z0-9_]*$/, OPT_NAME = /^[A-Za-z_][A-Za-z0-9_.]{0,63}$/;
function optLow(s) { return String(s || '').toLowerCase(); }
// A specialty's name squashed as systemcore.js specSquash compares it, accents, case, spaces and marks taken out, so Off Hand, off-hand and
// OffHand are one name. optSpecsFor, optSpecRules and optSpecNote compare specialties through it
function optSquash(s) { return String(s || '').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); }
// The item lists an option may read a row of, each { key, label, specs (true where the list has Specialties), figs: [[key, label]], entries:
// [[key, name, gray words]] }. figs: its level, then its number stats (a choice or a set of places is no figure), its columns and its counters,
// the very words a list read takes after its row (listName). entries: what its rows may be, the system's own items, the library's core and
// more (the campaign's library entries, which the caller hands in, a GM-only pack's marked vis gm), each key once, the first it meets winning,
// only of the list's categories where it names any (as sysedtabs.js entryNames reads them), sorted by name. A key that a Save could not keep
// (OPT_ID) is left out. A list with no figure is no list to read
function optLists(sys, more) {
    var out = []; if (!sys || !Array.isArray(sys.fields)) return out;
    var pool = [].concat(Array.isArray(sys.items) ? sys.items : [], Array.isArray(sys.core) ? sys.core : [], Array.isArray(more) ? more : []);
    var byName = function(a, b) { return String(a[1]).localeCompare(String(b[1])); };
    sys.fields.forEach(function(f) {
        if (!f || f.kind !== 'item-list' || typeof f.key !== 'string' || !OPT_ID.test(f.key) || !f.list || typeof f.list !== 'object') return;
        var sp = f.list, figs = [], fseen = Object.create(null), put = function(k, lb) { if (typeof k === 'string' && OPT_ID.test(k) && !fseen[optLow(k)]) { fseen[optLow(k)] = 1; figs.push([k, String(lb || k)]); } };
        if (sp.lvl && typeof sp.lvl === 'object') put('lvl', sp.lvl.label || 'Level');
        (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(s) { if (s && s.kind !== 'pick' && s.set !== true) put(s.key, s.label); });
        (Array.isArray(sp.cols) ? sp.cols : []).forEach(function(c) { if (c) put(c.key, c.label); });
        (Array.isArray(sp.counters) ? sp.counters : []).forEach(function(c) { if (c) put(c.key, c.label); });
        if (!figs.length) return;
        var cats = Array.isArray(sp.cats) && sp.cats.length ? sp.cats.map(optLow) : null, seen = Object.create(null), ents = [];
        pool.forEach(function(e) {
            if (!e || typeof e.key !== 'string' || !OPT_ID.test(e.key) || seen[optLow(e.key)] || (cats && cats.indexOf(optLow(e.category)) < 0)) return;
            seen[optLow(e.key)] = 1; ents.push([e.key, typeof e.name === 'string' && e.name ? e.name : e.key, e.vis === 'gm' ? 'GM only' : '']);
        });
        var rec = { key: f.key, label: typeof f.label === 'string' && f.label ? f.label : f.key, specs: !!(sp.specs && typeof sp.specs === 'object'), figs: figs, entries: ents.sort(byName) };
        if (rec.specs) optSpecRules(rec, sp, pool, cats);
        out.push(rec);
    });
    return out;
}
// The two rules of a list's Specialties box that change what a specialty no row names reads (the typing slip of 2026-11-19, read from
// systemcore.js specVal, which is the one rule; this only says it): fall, true where the box names a Fallback, a number stat or a column of
// the list, as cleancore.js cleanListSpec keeps it; and apart, where the box names a Stands apart stat (a number with value names, read as a
// set of places), the specialties each entry keeps apart, by the entry's key in lower case, each specialty squashed (optSquash). It reads the
// entry's own stats as systemcore.js specApartRow does (its value, else the stat's default, one bit a value name, 16 at most). Written onto
// rec, the list optLists answers; called only for a list with Specialties. An entry with no stats (a library entry handed in without them)
// keeps nothing apart here
function optSpecRules(rec, sp, pool, cats) {
    var specs = sp.specs, stats = Array.isArray(sp.stats) ? sp.stats : [], cols = Array.isArray(sp.cols) ? sp.cols : [];
    var named = function(k) { return typeof k === 'string' && k.trim() ? optLow(k.trim()) : ''; }, fk = named(specs.fall), ak = named(specs.apart);
    rec.fall = !!fk && (stats.some(function(s) { return s && s.kind !== 'pick' && optLow(s.key) === fk; }) || cols.some(function(c) { return c && optLow(c.key) === fk; }));
    var st = null; if (ak) stats.forEach(function(s) { if (!st && s && s.kind !== 'pick' && Array.isArray(s.labels) && s.labels.length && optLow(s.key) === ak) st = s; });
    rec.apart = Object.create(null); if (!st) return;
    pool.forEach(function(e) {
        if (!e || typeof e.key !== 'string' || (cats && cats.indexOf(optLow(e.category)) < 0) || rec.apart[optLow(e.key)]) return;
        var ds = e.stats && typeof e.stats === 'object' ? e.stats : null, v;
        if (ds) Object.keys(ds).forEach(function(k) { if (v === undefined && optLow(k) === optLow(st.key)) v = ds[k]; });
        if (typeof v !== 'number' || !isFinite(v)) v = typeof st.def === 'number' && isFinite(st.def) ? st.def : 0;
        var bits = Math.floor(Math.abs(v)) & 0xFFFF, keep = [];
        st.labels.forEach(function(lb, i) { if (i < 16 && ((bits >> i) & 1)) keep.push(optSquash(lb)); });
        if (keep.length) rec.apart[optLow(e.key)] = keep;
    });
}
// A stored option's name read as a row of a list: { list, entry, known, spec, fig, figKnown }, or null where it is no such read (a sheet's own
// figure, a list's total or its highest, a list that is gone). The list and a known entry and figure take the spelling the lists hold; an entry
// or a figure none holds any more is kept as written, so that nothing stored is lost while the row says so
function optRowRead(name, lists) {
    var s = String(name || '').split('.'), L = null; if (s.length < 3 || s.length > 4 || !s.every(function(p) { return OPT_ID.test(p); })) return null;
    (Array.isArray(lists) ? lists : []).forEach(function(l) { if (!L && l && optLow(l.key) === optLow(s[0])) L = l; });
    if (!L || (s.length === 4 && !L.specs) || /^(on|max|min)$/i.test(s[1])) return null;
    var e = null, fw = s[s.length - 1], fg = null;
    L.entries.forEach(function(x) { if (!e && optLow(x[0]) === optLow(s[1])) e = x; });
    L.figs.forEach(function(x) { if (!fg && optLow(x[0]) === optLow(fw)) fg = x; });
    return { list: L.key, entry: e ? e[0] : s[1], known: !!e, spec: s.length === 4 ? s[2] : '', fig: fg ? fg[0] : fw, figKnown: !!fg };
}
// The name a row's three picks write, or '' where it is not whole yet (no entry) or a Save could not keep it
function optRowWrite(p) {
    if (!p || !p.list || !p.entry || !p.fig) return '';
    var parts = [p.list, p.entry].concat(p.spec ? [p.spec] : []).concat([p.fig]);
    if (!parts.every(function(x) { return OPT_ID.test(String(x)); })) return '';
    var t = parts.join('.'); return OPT_NAME.test(t) ? t : '';
}
// A specialty as a player names it, written as one word of the name and back: Off Hand is OffHand, and OffHand reads Off Hand. The resolver
// compares a specialty with accents, case and spaces taken out (systemcore specSquash), so the word stored need only hold its letters
function optSpecWord(t) { return String(t || '').normalize('NFD').replace(/\p{M}+/gu, '').split(/[^A-Za-z0-9]+/).filter(Boolean).map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join('').replace(/^[0-9]+/, '').slice(0, 40); }
function optSpecSay(seg) { return String(seg || '').replace(/_+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Za-z])([0-9])/g, '$1 $2').trim(); }
// Whether optSpecWord would lose a letter or a digit of what was typed (the review of 2026-11-19): a letter outside A to Z once accents are
// taken off (an O with a stroke, a word of another script), a digit before the first letter, or a word past 40. A name keeps only those, so such a
// specialty is said back as one that cannot be kept, never stored as another word (Rsted) or none, which would read the entry itself
function optSpecLoss(t) { var all = (String(t || '').normalize('NFD').replace(/\p{M}+/gu, '').match(/[\p{L}\p{N}]/gu) || []).join(''); return optLow(optSpecWord(t)) !== optLow(all); }
// The specialties a pick may offer for one entry of a list, so that a known one is picked and not typed (the review of 2026-11-19): those
// rows of the list name for it, a key written Entry__Specialty or a name written Entry (Specialty) or Entry: Specialty (the forms systemcore
// specInfo reads), and the words the stat's other options already hold for it (more, stored words). Each [word, said], once, by its words.
// L: one of optLists' lists. A specialty that cannot be kept (optSpecLoss) is not offered
function optSpecsFor(L, entry, more) {
    var out = [], seen = Object.create(null), sq = optSquash;
    var put = function(raw) { if (!raw || optSpecLoss(raw)) return; var w = optSpecWord(raw); if (!w || !OPT_ID.test(w) || seen[optLow(w)]) return; seen[optLow(w)] = 1; out.push([w, optSpecSay(w)]); };
    if (!L || !Array.isArray(L.entries) || !entry) return out;
    var me = null; L.entries.forEach(function(x) { if (!me && optLow(x[0]) === optLow(entry)) me = x; });
    var mine = [sq(entry)].concat(me ? [sq(me[1])] : []);
    L.entries.forEach(function(x) {
        var k = String(x[0]), kc = k.indexOf('__');
        if (kc > 0 && mine.indexOf(sq(k.slice(0, kc))) >= 0) { put(k.slice(kc + 2).replace(/_+/g, ' ')); return; }
        var nm = String(x[1] || '').trim(), m = /^(.*?)\s*\(([^()]*)\)$/.exec(nm) || /^([^:]+):\s*(.+)$/.exec(nm);
        if (m && mine.indexOf(sq(m[1])) >= 0) put(m[2]);
    });
    (Array.isArray(more) ? more : []).forEach(function(w) { if (typeof w === 'string' && w) put(optSpecSay(w)); });
    return out.sort(function(a, b) { return a[1].localeCompare(b[1]); });
}
// How many single-letter slips turn one squashed name into another: a letter added, dropped or changed, or two side by side swapped, each
// one slip (the optimal string alignment distance). It stops counting past cap and answers cap + 1, since optSpecNote only asks whether a
// typed specialty is within two slips of a known one
function optSlips(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
        var low = cap + 1;
        for (j = 1; j <= b.length; j++) {
            var c = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
            if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            if (d[i][j] < low) low = d[i][j];
        }
        if (low > cap) return cap + 1;   // every way on is already past cap
    }
    return Math.min(d[a.length][b.length], cap + 1);
}
// The typing slip of 2026-11-19 (Fulllion kept typing allowed: "Keep typing allowed"): what the gray line under a specialty says when no row
// of the list and no other option of the stat names it yet, since such a specialty still reads, through the parent, what systemcore.js
// specVal reads for a specialty nobody holds. That is, in specVal's order: where the parent's entry keeps that specialty apart (Stands apart),
// the parent untrained; else the character's best row of the parent with the list's Fallback where the Specialties box names one, or that
// row's own figure where it names none; and the parent untrained for a character who holds no row of it at all. L: one of optLists' lists;
// entry: the parent's key; spec: the specialty as one word (optSpecWord); more: the specialties the stat's other options name for this entry,
// as formbox.js dressOpts hands optSpecsFor. Answers null where there is nothing to say (no specialty, no entry, or a known one), else
// { says, near }: says the words, and near, the known specialty [word, said] within one or two slips of it (optSlips, compared squashed as
// names are), the closest and then the first by name, or null. A slip is only offered where it is smaller than the shorter name, so that a
// two-letter specialty is never offered for another two letters. No key or stored name is in the words: the list, the entry and the
// specialty go by their names
function optSpecNote(L, entry, spec, more) {
    if (!L || !entry || !spec) return null;
    var known = optSpecsFor(L, entry, more), sq = optSquash(spec);
    if (!sq || known.some(function(k) { return optSquash(k[0]) === sq; })) return null;
    var me = null; (Array.isArray(L.entries) ? L.entries : []).forEach(function(x) { if (!me && optLow(x[0]) === optLow(entry)) me = x; });
    var pn = me ? me[1] : optSpecSay(entry), said = optSpecSay(spec), ap = L.apart && L.apart[optLow(entry)];
    var words = 'No ' + L.label + ' row is ' + pn + ' (' + said + ') yet. Until one is, this reads ';
    if (Array.isArray(ap) && ap.indexOf(sq) >= 0) words += pn + ' untrained, since ' + said + ' stands apart for ' + pn + '.';
    else if (L.fall) words += pn + ' with its fallback, and ' + pn + ' untrained for a character who has no ' + pn + ' at all.';
    else words += pn + ' at its own figure, since the Specialties name no Fallback, and ' + pn + ' untrained for a character who has no ' + pn + ' at all.';
    var near = null, best = 3;
    known.forEach(function(k) { var kq = optSquash(k[0]), n = optSlips(sq, kq, 2); if (n <= 2 && n < Math.min(sq.length, kq.length) && n < best) { best = n; near = k; } });
    return { says: words, near: near };
}
var API = { optSpecNote: optSpecNote, optSpecLoss: optSpecLoss, optSpecsFor: optSpecsFor, optLists: optLists, optRowRead: optRowRead, optRowWrite: optRowWrite, optSpecWord: optSpecWord, optSpecSay: optSpecSay, readOpts: readOpts, writeOpts: writeOpts, readLine: readLine, readMake: readMake, tryWords: tryWords, readWords: readWords, writeWords: writeWords, saysWords: saysWords, rollFace: rollFace, tryRoll: tryRoll, tryValue: tryValue, read: read, write: write, says: says, readCond: readCond, writeCond: writeCond, saysCond: saysCond, CMP_WORDS: CMP_WORDS, STEP_WORDS: STEP_WORDS, ROUND_WORDS: ROUND_WORDS };
if (typeof window !== 'undefined') window.wpFormCore = API;
export { optSpecNote, optSpecLoss, optSpecsFor, optLists, optRowRead, optRowWrite, optSpecWord, optSpecSay, readOpts, writeOpts, readLine, readMake, tryWords, readWords, writeWords, saysWords, rollFace, tryRoll, tryValue, read, write, says, readCond, writeCond, saysCond, CMP_WORDS, STEP_WORDS, ROUND_WORDS };
