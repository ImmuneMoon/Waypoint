/* Waypoint — the form over a formula box (1.6.2; the owner, 2026-11-02: "we shouldnt be using code expressions on the user side", by prompt
   "Forms for every formula", "A. Steps" and "A small As text link"). The box itself stays in the page, hidden, with its class, its value and every
   handler that reads it: the form writes its value and says so with an input event, and a change event as it closes, so the System editor's
   dispatchers, its errors and its Save need no word of this. The stored value is still the formula, and opening a form and leaving it writes
   nothing. Text nodes and values only: a label and a stored formula can come from a file. The pure half is formcore.js. */
import { read, write, says, readCond, writeCond, saysCond } from './formcore.js';

// [formcheck:boxes-start]
// which boxes wear the form, and what each wants: a figure (amt), a figure with dice (roll) or a yes or no (cond)
var BOXES = { 'sys-roll': 'roll', 'sys-roll-needs': 'cond', 'sys-ovr-value': 'amt', 'sys-ovr-when': 'cond', 'sys-spill-below': 'amt', 'sys-apply-formula': 'amt', 'sys-apply-if': 'cond' };
function kindOf(inp) {
    var cs = inp && inp.classList; if (!cs) return '';
    if (cs.contains('sys-formula')) { var rw = inp.closest ? inp.closest('.sys-row') : null; return rw && /^r_/.test(rw.dataset.id || '') ? 'roll' : 'amt'; }
    for (var k in BOXES) if (Object.prototype.hasOwnProperty.call(BOXES, k) && cs.contains(k)) return BOXES[k];
    return '';
}
// [formcheck:boxes-end]
// [formcheck:words-start]
var OPS = [['+', 'Add'], ['-', 'Subtract'], ['*', 'Times'], ['/', 'Divide by'], ['^', 'To the power of'], ['floor', 'Round down'], ['ceil', 'Round up'], ['round', 'Round'], ['trunc', 'Drop the fraction'], ['abs', 'Make it positive'], ['neg', 'Flip the sign'], ['sqrt', 'Square root'], ['least', 'At least'], ['most', 'At most'], ['clamp', 'Held between']];
var TAKES = { '+': 1, '-': 1, '*': 1, '/': 1, '^': 1, least: 1, most: 1, clamp: 1 };
var TESTS = [['>=', 'is at least'], ['<=', 'is at most'], ['>', 'is over'], ['<', 'is under'], ['=', 'is'], ['!=', 'is not']];
var CHECKS = [['', 'No test'], ['<=', 'the roll is at most'], ['>=', 'the roll is at least'], ['<', 'the roll is under'], ['>', 'the roll is over'], ['=', 'the roll is exactly'], ['!=', 'the roll is not']];
var KEEPS = [['', 'Keep all'], ['kh', 'Keep the highest'], ['kl', 'Keep the lowest'], ['dh', 'Drop the highest'], ['dl', 'Drop the lowest']];
var REROLLS = [['', 'No reroll'], ['r', 'Reroll once'], ['rr', 'Reroll every time']];
var EXPLODES = [['', 'No exploding'], ['once', 'Exploding'], ['own', 'Each its own die']];
var FACES = ['4', '6', '8', '10', '12', '20', '100'];
var NUM0 = function() { return { k: 'num', v: 0, s: '0' }; };
var NUM1 = function() { return { k: 'num', v: 1, s: '1' }; };
function emptyWord(kind) { return kind === 'cond' ? 'Always' : 'Not set'; }
// a value as the one thing a row holds; steps of their own where a form has more than one
function valOfForm(f) { return f && f.steps && f.steps.length === 1 && f.steps[0].op === 'start' && !f.check ? f.steps[0].v : { k: 'calc', form: f }; }
function formOfVal(v) { return v && v.k === 'calc' ? v.form : { steps: [{ op: 'start', v: v }] }; }
// [formcheck:words-end]

function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; }
function btn(cls, text, tip) { var b = el('button', cls, text); b.type = 'button'; if (tip) b.dataset.tip = tip; return b; }
function sel(cls, opts, val, tip) { var s = el('select', cls); opts.forEach(function(o) { var x = el('option', null, o[1]); x.value = o[0]; s.appendChild(x); }); s.value = val === undefined || val === null ? '' : val; if (tip) s.dataset.tip = tip; return s; }

// where the names come from: sheets.js hands the System editor's own, by the box
var source = null;
function srcFor(inp) { var s = null; try { s = typeof source === 'function' ? source(inp) : null; } catch (e) { s = null; } return s && typeof s === 'object' ? s : { groups: [], word: null }; }
function sayOf(s) { return { name: typeof s.word === 'function' ? s.word : null }; }

// the line a shut box shows
function lineOf(inp, kind) {
    var t = String(inp.value || '').trim(), sc = srcFor(inp);
    if (!t) return { text: emptyWord(kind), bad: false, none: true };
    if (kind === 'cond') { var c = readCond(t); return c.ok ? { text: saysCond(c.cond, sayOf(sc)) } : { text: t, bad: true }; }
    var r = read(t); return r.ok ? { text: says(r.form, sayOf(sc)) } : { text: t, bad: true };
}
function drawLine(b) { var w = lineOf(b.inp, b.kind); b.say.textContent = w.text; b.line.classList.toggle('fb-none', !!w.none); b.line.classList.toggle('fb-bad', !!w.bad); }

// one form open at a time
var open = null;
function shut(keep) {
    var o = open; if (!o) return; open = null; closeMenu();
    if (keep === false && o.inp.value !== o.was) { o.inp.value = o.was; o.inp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (o.touched) { try { o.inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} }
    if (o.root.parentNode) o.root.parentNode.removeChild(o.root);
    o.box.line.hidden = false; drawLine(o.box);
    if (o.box.go && o.box.go.isConnected) { try { o.box.go.focus(); } catch (e) {} }
}
function commit() {
    var o = open; if (!o || !o.form) return;
    var t = o.kind === 'cond' ? writeCond(o.form) : write(o.form);
    if (t === o.inp.value) return;
    o.inp.value = t; o.touched = true; o.inp.dispatchEvent(new Event('input', { bubbles: true }));
    if (o.text && o.text.input) o.text.input.value = t;
}
function redraw(focus) {
    var o = open; if (!o) return;
    o.body.textContent = '';
    if (o.bad) o.body.appendChild(el('div', 'fb-note', 'This one cannot be shown as steps yet. Change it with As text below.'));
    else if (o.kind === 'cond') condInto(o.body, o.form, 'c');
    else formInto(o.body, o.form, 'f', o.kind === 'roll');
    if (focus) { var q = o.body.querySelector('[data-p="' + focus + '"]'); if (q) { try { q.focus(); } catch (e) {} } }
}
function again(p) { commit(); redraw(p); }

// a value: a number box, or a button that says what it is. Dice and steps of their own open under it
function valueInto(host, get, set, p, dice) {
    var v = get(), o = open;
    if (v.k === 'num') {
        var n = el('input', 'fb-num'); n.type = 'text'; n.inputMode = 'decimal'; n.value = v.s !== undefined ? v.s : String(v.v); n.dataset.p = p; n.setAttribute('aria-label', 'A number');
        n.addEventListener('input', function() { var t = n.value.trim(), x = Number(t); if (t === '' || !isFinite(x) || !/^-?(\d+\.?\d*|\.\d+)$/.test(t)) { n.classList.toggle('fb-off', t !== ''); return; } n.classList.remove('fb-off'); var nv = { k: 'num', v: x, s: t }; set(nv); commit(); });
        host.appendChild(n);
    }
    var w = v.k === 'num' ? '▾' : says(formOfVal(v), sayOf(srcFor(o.inp))), b = btn('fb-pick' + (v.k === 'num' ? ' fb-pick-more' : ''), w, 'Pick another value');
    b.dataset.p = p + 'b'; if (v.k === 'num') b.setAttribute('aria-label', 'Pick something other than a number');
    b.addEventListener('click', function() { openMenu(b, function(nv) { set(nv); again(p + 'b'); }, dice, v); });
    host.appendChild(b);
    if (v.k === 'dice') diceInto(host, v, set, p);
    else if (v.k === 'calc') { var s = el('div', 'fb-sub'); formInto(s, v.form, p + 's', false, dice); host.appendChild(s); }
    else if (v.k === 'if') {
        var d = el('div', 'fb-sub'); condInto(d, v.c, p + 'c');
        var th = el('div', 'fb-step'); th.appendChild(el('span', 'fb-word', 'Then')); valueInto(th, function() { return valOfForm(v.a); }, function(x) { v.a = formOfVal(x); }, p + 't', dice); d.appendChild(th);
        var ow = el('div', 'fb-step'); ow.appendChild(el('span', 'fb-word', 'Otherwise')); valueInto(ow, function() { return valOfForm(v.b); }, function(x) { v.b = formOfVal(x); }, p + 'e', dice); d.appendChild(ow);
        host.appendChild(d);
    } else if (v.k === 'test') { var ts = el('div', 'fb-sub'); condInto(ts, v.cond, p + 'q'); host.appendChild(ts); }
    else if (v.k === 'fn') { var fa = el('div', 'fb-sub'); v.args.forEach(function(a, i) { var r = el('div', 'fb-step'); valueInto(r, function() { return valOfForm(a); }, function(x) { v.args[i] = formOfVal(x); }, p + 'a' + i, dice); fa.appendChild(r); }); host.appendChild(fa); }
}
function diceInto(host, v, set, p) {
    var box = el('div', 'fb-dice'), mark = function() { v.dirty = true; set(v); }, row = el('div', 'fb-step');
    var cnt = el('input', 'fb-num'); cnt.type = 'text'; cnt.inputMode = 'numeric'; cnt.dataset.p = p + 'n'; cnt.setAttribute('aria-label', 'How many dice');
    if (v.n && v.n.k !== 'num') { cnt.value = ''; cnt.disabled = true; cnt.placeholder = 'set'; } else cnt.value = v.n ? v.n.s : '1';
    cnt.addEventListener('input', function() { if (!/^\d{1,3}$/.test(cnt.value)) return; v.n = { k: 'num', v: Number(cnt.value), s: cnt.value }; mark(); commit(); });
    row.appendChild(cnt); row.appendChild(el('span', 'fb-d', 'd'));
    var fs = v.f === 'F' ? 'F' : v.f === '%' ? '100' : v.f && v.f.k === 'num' ? String(v.f.v) : '', fo = FACES.map(function(x) { return [x, x]; }); if (fs && FACES.indexOf(fs) < 0) fo.push([fs, fs]);
    var fc = sel('fb-sel', fo, fs); fc.dataset.p = p + 'f'; fc.setAttribute('aria-label', 'Sides on each die');
    fc.addEventListener('change', function() { v.f = fc.value === 'F' ? 'F' : { k: 'num', v: Number(fc.value), s: fc.value }; mark(); commit(); });
    if (v.f && v.f.k && v.f.k !== 'num') fc.disabled = true;
    row.appendChild(fc);
    var kp = sel('fb-sel', KEEPS, v.keep ? v.keep.sub : ''); kp.dataset.p = p + 'k';
    kp.addEventListener('change', function() { if (kp.value) { v.keep = { sub: kp.value, v: v.keep ? v.keep.v : NUM1() }; } else delete v.keep; mark(); again(p + 'k'); });
    row.appendChild(kp);
    if (v.keep) valueInto(row, function() { return v.keep.v; }, function(x) { v.keep.v = x; mark(); }, p + 'kv', false);
    box.appendChild(row);
    var more = btn('fb-more', v.moreOpen || v.reroll || v.explode || v.cs ? 'Fewer dice rules' : 'More dice rules', 'Reroll, explode, or count successes');
    more.dataset.p = p + 'm'; more.addEventListener('click', function() { v.moreOpen = !v.moreOpen; redraw(p + 'm'); });
    box.appendChild(more);
    if (v.moreOpen || v.reroll || v.explode || v.cs) {
        var r1 = el('div', 'fb-step'), rr = sel('fb-sel', REROLLS, v.reroll ? v.reroll.sub : ''); rr.dataset.p = p + 'r';
        rr.addEventListener('change', function() { if (rr.value) v.reroll = { sub: rr.value, op: v.reroll ? v.reroll.op : '=', v: v.reroll ? v.reroll.v : NUM1() }; else delete v.reroll; mark(); again(p + 'r'); });
        r1.appendChild(rr);
        if (v.reroll) { var ro = sel('fb-sel', [['=', 'a roll of']].concat(TESTS.slice(0, 4)), v.reroll.op); ro.addEventListener('change', function() { v.reroll.op = ro.value; mark(); commit(); }); r1.appendChild(ro); valueInto(r1, function() { return v.reroll.v; }, function(x) { v.reroll.v = x; mark(); }, p + 'rv', false); }
        box.appendChild(r1);
        var r2 = el('div', 'fb-step'), ex = sel('fb-sel', EXPLODES, v.explode ? (v.explode.own ? 'own' : 'once') : ''); ex.dataset.p = p + 'x';
        ex.addEventListener('change', function() { if (ex.value) { var was = v.explode || {}; v.explode = { own: ex.value === 'own' }; if (ex.value === 'own' && was.op) { v.explode.op = was.op; v.explode.v = was.v; } } else delete v.explode; mark(); again(p + 'x'); });
        r2.appendChild(ex);
        if (v.explode && v.explode.own) { var eo = sel('fb-sel', [['', 'on its top face'], ['>=', 'on this or more']], v.explode.op || ''); eo.addEventListener('change', function() { if (eo.value) { v.explode.op = eo.value; v.explode.v = v.explode.v || { k: 'num', v: 6, s: '6' }; } else { delete v.explode.op; delete v.explode.v; } mark(); again(p + 'x'); }); r2.appendChild(eo); if (v.explode.op) valueInto(r2, function() { return v.explode.v; }, function(x) { v.explode.v = x; mark(); }, p + 'xv', false); }
        box.appendChild(r2);
        var r3 = el('div', 'fb-step'), cs = sel('fb-sel', [['', 'Add the dice'], ['>=', 'Count dice at or over'], ['<=', 'Count dice at or under']], v.cs ? v.cs.op : ''); cs.dataset.p = p + 'c';
        cs.addEventListener('change', function() { if (cs.value) v.cs = { op: cs.value, v: v.cs ? v.cs.v : { k: 'num', v: 5, s: '5' } }; else delete v.cs; mark(); again(p + 'c'); });
        r3.appendChild(cs);
        if (v.cs) valueInto(r3, function() { return v.cs.v; }, function(x) { v.cs.v = x; mark(); }, p + 'cv', false);
        box.appendChild(r3);
    }
    host.appendChild(box);
}
function formInto(host, f, p, isRoll, dice) {
    var d = dice === undefined ? open.kind === 'roll' : dice;
    f.steps.forEach(function(st, i) {
        var row = el('div', 'fb-step'), pi = p + i;
        if (st.op === 'start') row.appendChild(el('span', 'fb-word', i ? 'Add' : 'Start with'));
        else {
            var known = OPS.some(function(o) { return o[0] === st.op; }), s = sel('fb-sel fb-op', known ? OPS : OPS.concat([[st.op, st.op]]), st.op, 'What this step does to the answer so far'); s.dataset.p = pi + 'o'; s.setAttribute('aria-label', 'What this step does');
            s.addEventListener('change', function() {
                st.op = s.value;
                if (TAKES[st.op] || (st.op === 'round' && st.v)) st.v = st.v || NUM1(); else delete st.v;
                if (st.op === 'clamp') st.w = st.w || NUM1(); else delete st.w;
                again(pi + 'o');
            });
            row.appendChild(s);
        }
        if (st.v) valueInto(row, function() { return st.v; }, function(x) { st.v = x; }, pi + 'v', d);
        if (st.op === 'clamp' && st.w) { row.appendChild(el('span', 'fb-and', 'and')); valueInto(row, function() { return st.w; }, function(x) { st.w = x; }, pi + 'w', d); }
        if (i) { var x = btn('fb-x', '×', 'Take this step away'); x.setAttribute('aria-label', 'Take this step away'); x.dataset.p = pi + 'x'; x.addEventListener('click', function() { f.steps.splice(i, 1); again(p + 'add'); }); row.appendChild(x); }
        host.appendChild(row);
    });
    var add = btn('fb-add', '+ Add a step', 'Do something more to the answer'); add.dataset.p = p + 'add';
    add.addEventListener('click', function() { f.steps.push({ op: '+', v: NUM0() }); again(p + f.steps.length - 1 + 'vb'); });
    host.appendChild(add);
    if (isRoll) {
        var cr = el('div', 'fb-step'); cr.appendChild(el('span', 'fb-word', 'It works if'));
        var c = sel('fb-sel', CHECKS, f.check ? f.check.op : ''); c.dataset.p = p + 'ck'; c.setAttribute('aria-label', 'What makes the roll a success');
        c.addEventListener('change', function() { if (c.value) f.check = { op: c.value, r: f.check ? f.check.r : { steps: [{ op: 'start', v: NUM0() }] } }; else delete f.check; again(p + 'ck'); });
        cr.appendChild(c);
        if (f.check) valueInto(cr, function() { return valOfForm(f.check.r); }, function(x) { f.check.r = formOfVal(x); }, p + 'cv', false);
        host.appendChild(cr);
    }
}
function condInto(host, c, p) {
    if (!c.tests.length) c.tests.push({ val: { steps: [{ op: 'start', v: NUM1() }] } });
    if (c.tests.length > 1 || c.not) {
        var seg = sel('fb-sel', [['all', 'All of these'], ['any', 'Any of these'], ['none', 'None of these']], c.not ? 'none' : c.any ? 'any' : 'all'); seg.dataset.p = p + 'm'; seg.setAttribute('aria-label', 'How the tests go together');
        seg.addEventListener('change', function() { c.any = seg.value === 'any' || seg.value === 'none'; if (seg.value === 'none') c.not = 1; else delete c.not; again(p + 'm'); });
        host.appendChild(seg);
    }
    c.tests.forEach(function(t, i) {
        var row = el('div', 'fb-step'), pi = p + i;
        if (t.group) { var g = el('div', 'fb-sub'); condInto(g, t.group, pi + 'g'); row.appendChild(g); }
        else if (t.val) {
            valueInto(row, function() { return valOfForm(t.val); }, function(x) { t.val = formOfVal(x); }, pi + 'l', false);
            var mk = btn('fb-more', 'Compare it', 'Test this against another value'); mk.dataset.p = pi + 'k'; mk.addEventListener('click', function() { t.l = t.val; delete t.val; t.op = '>='; t.r = { steps: [{ op: 'start', v: NUM1() }] }; again(pi + 'k'); }); row.appendChild(mk);
        } else {
            valueInto(row, function() { return valOfForm(t.l); }, function(x) { t.l = formOfVal(x); }, pi + 'l', false);
            var o = sel('fb-sel', TESTS, t.op); o.dataset.p = pi + 'o'; o.setAttribute('aria-label', 'How they compare'); o.addEventListener('change', function() { t.op = o.value; commit(); }); row.appendChild(o);
            valueInto(row, function() { return valOfForm(t.r); }, function(x) { t.r = formOfVal(x); }, pi + 'r', false);
        }
        if (c.tests.length > 1) { var x = btn('fb-x', '×', 'Take this test away'); x.setAttribute('aria-label', 'Take this test away'); x.dataset.p = pi + 'x'; x.addEventListener('click', function() { c.tests.splice(i, 1); again(p + 'add'); }); row.appendChild(x); }
        host.appendChild(row);
    });
    var add = btn('fb-add', '+ Add a test', 'Another thing that must hold'); add.dataset.p = p + 'add';
    add.addEventListener('click', function() { c.tests.push({ l: { steps: [{ op: 'start', v: NUM0() }] }, op: '>=', r: { steps: [{ op: 'start', v: NUM1() }] } }); again(p + (c.tests.length - 1) + 'lb'); });
    host.appendChild(add);
}

// [formcheck:menu-start]
// picking a value: by its name on the sheet, with a Find box; only what this box can read is offered
var menu = null;
function closeMenu() { if (menu) { var m = menu; menu = null; if (m.el.parentNode) m.el.parentNode.removeChild(m.el); document.removeEventListener('pointerdown', m.away, true); } }
function menuRows(q, sc, dice) {
    var want = String(q || '').trim().toLowerCase(), out = [];
    (sc.groups || []).forEach(function(g) {
        var its = (g.items || []).filter(function(i) { return !want || String(i.label).toLowerCase().indexOf(want) >= 0; });
        if (its.length) out.push({ head: g.name, items: its });
    });
    var more = [{ label: 'A number', kind: 'num' }]; if (dice) more.push({ label: 'Dice', kind: 'dice' }); more.push({ label: 'Work something out', kind: 'calc' }, { label: 'If this, then that', kind: 'if' });
    out.push({ head: 'Or', items: more.filter(function(m) { return !want || m.label.toLowerCase().indexOf(want) >= 0; }) });
    return out;
}
function menuPick(it) {
    if (it.s !== undefined) return { k: 'name', s: it.s };
    if (it.kind === 'num') return NUM0();
    if (it.kind === 'dice') return { k: 'dice', n: NUM1(), f: { k: 'num', v: 6, s: '6' }, dirty: true };
    if (it.kind === 'calc') return { k: 'calc', form: { steps: [{ op: 'start', v: NUM0() }, { op: '+', v: NUM0() }] } };
    return { k: 'if', c: { any: false, tests: [{ l: { steps: [{ op: 'start', v: NUM0() }] }, op: '>=', r: { steps: [{ op: 'start', v: NUM1() }] } }] }, a: { steps: [{ op: 'start', v: NUM1() }] }, b: { steps: [{ op: 'start', v: NUM0() }] } };
}
// [formcheck:menu-end]
function openMenu(anchor, done, dice) {
    closeMenu();
    var o = open, sc = srcFor(o.inp), m = el('div', 'fb-menu'), find = el('input', 'fb-find'), list = el('div', 'fb-list');
    find.type = 'text'; find.placeholder = 'Find a value…'; find.setAttribute('aria-label', 'Find a value'); m.appendChild(find); m.appendChild(list);
    function draw() {
        list.textContent = '';
        menuRows(find.value, sc, dice).forEach(function(g) {
            if (!g.items.length) return;
            list.appendChild(el('div', 'fb-head', g.head));
            g.items.forEach(function(it) {
                var b = el('button', 'fb-it'); b.type = 'button'; b.appendChild(el('span', null, it.label)); if (it.hint) b.appendChild(el('small', null, it.hint));
                b.addEventListener('click', function() { closeMenu(); done(menuPick(it)); });
                list.appendChild(b);
            });
        });
    }
    find.addEventListener('input', draw);
    m.addEventListener('keydown', function(e) {
        var its = Array.prototype.slice.call(list.querySelectorAll('.fb-it')), at = its.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); var n = e.key === 'ArrowDown' ? at + 1 : at - 1; if (n < 0) find.focus(); else if (its[n]) its[n].focus(); }
        else if (e.key === 'Enter' && e.target === find && its[0]) { e.preventDefault(); e.stopPropagation(); its[0].click(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); try { anchor.focus(); } catch (x) {} }
    });
    draw();
    var host = o.root.closest('#systemModal') || document.body; host.appendChild(m);
    var r = anchor.getBoundingClientRect(), H = window.innerHeight || 700, W = window.innerWidth || 1000; m.style.left = Math.max(8, Math.min(W - 288, r.left)) + 'px';
    var mh = Math.min(320, H - 16), top = r.bottom + 4; if (top + mh > H - 8) top = Math.max(8, r.top - mh - 4); m.style.top = top + 'px'; m.style.maxHeight = mh + 'px';
    menu = { el: m, away: function(e) { if (!m.contains(e.target)) closeMenu(); } };
    document.addEventListener('pointerdown', menu.away, true);
    find.focus();
}

function formOpen(b) {
    if (open && open.box === b) return; shut();
    var t = String(b.inp.value || '').trim(), kind = b.kind, o = { box: b, inp: b.inp, kind: kind, was: b.inp.value, touched: false, form: null, bad: false };
    if (kind === 'cond') { if (!t) o.form = { any: false, tests: [{ l: { steps: [{ op: 'start', v: NUM0() }] }, op: '>=', r: { steps: [{ op: 'start', v: NUM1() }] } }] }; else { var c = readCond(t); if (c.ok) o.form = c.cond; else o.bad = true; } }
    else if (!t) o.form = { steps: [{ op: 'start', v: kind === 'roll' ? { k: 'dice', n: { k: 'num', v: 1, s: '1' }, f: { k: 'num', v: 20, s: '20' }, dirty: true } : NUM0() }] };
    else { var r = read(t); if (r.ok) o.form = r.form; else o.bad = true; }
    o.root = el('div', 'fb-open'); o.body = el('div', 'fb-body'); o.root.appendChild(o.body);
    var foot = el('div', 'fb-foot'), done = btn('fb-done', 'Done', 'Keep these steps'), cancel = btn('fb-cancel', 'Cancel', 'Put it back as it was'), clear = btn('fb-cancel', 'Clear', 'Take this out'), tx = btn('fb-astext', 'As text', 'Show it as text, to copy it or paste one in');
    foot.appendChild(done); foot.appendChild(cancel); foot.appendChild(clear); foot.appendChild(tx); o.root.appendChild(foot);
    done.addEventListener('click', function() { shut(); });
    cancel.addEventListener('click', function() { shut(false); });
    clear.addEventListener('click', function() { o.inp.value = ''; o.touched = true; o.form = null; o.inp.dispatchEvent(new Event('input', { bubbles: true })); shut(); });
    tx.addEventListener('click', function() {
        if (o.text) { o.root.removeChild(o.text.row); o.text = null; return; }
        var row = el('div', 'fb-textrow'), inp = el('input', 'fb-text'), note = el('div', 'fb-note'); inp.type = 'text'; inp.value = o.inp.value; inp.spellcheck = false; inp.setAttribute('aria-label', 'As text'); row.appendChild(inp); row.appendChild(note);
        o.root.appendChild(row); o.text = { row: row, input: inp };
        inp.addEventListener('input', function() {
            o.inp.value = inp.value; o.touched = true; o.inp.dispatchEvent(new Event('input', { bubbles: true }));
            var v = inp.value.trim(), x = kind === 'cond' ? readCond(v) : read(v);
            if (x.ok) { o.form = kind === 'cond' ? x.cond : x.form; o.bad = false; note.textContent = ''; redraw(); } else if (v) { note.textContent = x.error && x.error.message ? x.error.message : 'That cannot be read.'; }
        });
        inp.focus();
    });
    o.root.addEventListener('keydown', function(e) { if (e.key === 'Escape' && !menu) { e.preventDefault(); e.stopPropagation(); shut(); } });
    b.line.hidden = true; b.wrap.appendChild(o.root);
    open = o; redraw();
    var first = o.body.querySelector('input, select, button'); if (first) { try { first.focus(); } catch (e) {} }
}
// [formcheck:sweep-start]
function dress(inp) {
    if (!inp || !inp.dataset || inp.dataset.fb) return;
    var kind = kindOf(inp); if (!kind || !inp.parentNode) return;
    inp.dataset.fb = '1';
    var wrap = el('div', 'fb'), line = el('div', 'fb-line'), say = el('span', 'fb-say'), go = btn('fb-go', 'Change', 'Change this in a form'), b = { inp: inp, kind: kind, wrap: wrap, line: line, say: say, go: go };
    line.appendChild(say); line.appendChild(go); go.addEventListener('click', function(e) { e.preventDefault(); formOpen(b); });
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(line); wrap.appendChild(inp); inp.hidden = true;
    inp.addEventListener('wpformshown', function() { drawLine(b); });
    drawLine(b);
}
function sweep(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return 0;
    var n = 0, all = root.querySelectorAll('input');
    for (var i = 0; i < all.length; i++) { if (all[i].dataset && !all[i].dataset.fb && kindOf(all[i])) { dress(all[i]); n++; } }
    return n;
}
function watch(root) {
    if (!root || typeof MutationObserver !== 'function') return null;
    var due = false, mo = new MutationObserver(function() { if (due) return; due = true; requestAnimationFrame(function() { due = false; sweep(root); }); });
    mo.observe(root, { childList: true, subtree: true });
    sweep(root);
    return mo;
}
// [formcheck:sweep-end]
function setSource(fn) { source = fn; }
if (typeof window !== 'undefined') window.wpFormBox = { sweep: sweep, watch: watch, setSource: setSource, kindOf: kindOf, isOpen: function() { return !!open; }, shut: shut };
export { sweep, watch, setSource, kindOf, menuRows, menuPick, lineOf, valOfForm, formOfVal, emptyWord };
