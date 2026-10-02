/* A page of plain objects for the planner editor's boxes and the bar on them (required by tools/textcheck.js and
   tools/sinkcheck.js; not a suite). Just enough of a document for planner.js's [textcheck:fields], [textcheck:box]
   and [textcheck:bar] slices and io.js's history to run for real under Node: elements and text nodes that keep
   their children, their classes, their style and their listeners; events that are dispatched down and up the tree
   as a browser does it; one focus and one selection; and an "engine" that edits a box the way a browser's own
   editing does — characters put into the text node the caret is in, a selection deleted across nodes — written
   here on its own, never with the app's maps, so a check that types through it tests the app's read-back.
   An element REFUSES markup: assigning innerHTML (or outerHTML, or calling insertAdjacentHTML) throws, so anything
   the slices draw is provably made of elements and text nodes. */
'use strict';

function makeDom() {
    const page = { active: null, timers: [], docHandlers: {}, winHandlers: {}, log: [] };

    function Text(v) { this.nodeType = 3; this.nodeName = '#text'; this.nodeValue = String(v); this.parentNode = null; }
    Object.defineProperty(Text.prototype, 'data', { get() { return this.nodeValue; }, set(v) { this.nodeValue = String(v); } });
    Object.defineProperty(Text.prototype, 'textContent', { get() { return this.nodeValue; }, set(v) { this.nodeValue = String(v); } });
    Object.defineProperty(Text.prototype, 'isConnected', { get() { return !!this.parentNode && this.parentNode.isConnected; } });

    function El(tag) {
        this.nodeType = 1; this.tagName = this.nodeName = String(tag).toUpperCase(); this.childNodes = []; this.parentNode = null;
        this.className = ''; this.id = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.handlers = {}; this.capture = {};
        this.hidden = false; this.disabled = false; this.value = ''; this.title = ''; this.calls = []; this.rect = null;
    }
    const detach = n => { if (n.parentNode) { const l = n.parentNode.childNodes, i = l.indexOf(n); if (i >= 0) l.splice(i, 1); n.parentNode = null; } };
    El.prototype.appendChild = function(c) { detach(c); c.parentNode = this; this.childNodes.push(c); return c; };
    El.prototype.insertBefore = function(c, ref) { detach(c); c.parentNode = this; const i = ref ? this.childNodes.indexOf(ref) : -1; if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c); return c; };
    El.prototype.removeChild = function(c) { if (c.parentNode !== this) throw new Error('removeChild: not a child'); detach(c); if (!this.childNodes.length && this.scrollLeft) this.scrollLeft = 0; return c; };   // an element emptied of its content springs back to its start
    // the node after and the node before, among its parent's children
    const sib = (n, d) => { const l = n.parentNode ? n.parentNode.childNodes : null, i = l ? l.indexOf(n) : -1; return i < 0 ? null : (l[i + d] || null); };
    [El.prototype, Text.prototype].forEach(p => { Object.defineProperty(p, 'nextSibling', { get() { return sib(this, 1); } }); Object.defineProperty(p, 'previousSibling', { get() { return sib(this, -1); } }); });
    // the element itself copied without what it holds (cloneNode(false)): its name, classes, attributes, data and style — never its listeners
    El.prototype.cloneNode = function(deep) { if (deep) throw new Error('cloneNode(true) on the test page'); const c = new El(this.tagName); c.className = this.className; c.id = this.id; Object.assign(c.attrs, this.attrs); Object.assign(c.dataset, this.dataset); Object.assign(c.style, this.style); return c; };
    Object.defineProperty(El.prototype, 'firstChild', { get() { return this.childNodes[0] || null; } });
    Object.defineProperty(El.prototype, 'lastChild', { get() { return this.childNodes[this.childNodes.length - 1] || null; } });
    Object.defineProperty(El.prototype, 'children', { get() { return this.childNodes.filter(c => c.nodeType === 1); } });
    Object.defineProperty(El.prototype, 'parent', { get() { return this.parentNode; } });
    Object.defineProperty(El.prototype, 'textContent', {
        get() { return this.childNodes.map(c => c.textContent).join(''); },
        set(v) { this.childNodes.slice().forEach(detach); v = String(v == null ? '' : v); if (v) this.appendChild(new Text(v)); }
    });
    ['innerHTML', 'outerHTML'].forEach(k => Object.defineProperty(El.prototype, k, { get() { throw new Error(k + ' read on the test page'); }, set() { throw new Error(k + ' written on the test page: markup, where only elements and text nodes may be made'); } }));
    El.prototype.insertAdjacentHTML = function() { throw new Error('insertAdjacentHTML on the test page'); };
    Object.defineProperty(El.prototype, 'classList', { get() {
        const el = this, list = () => el.className.split(/\s+/).filter(Boolean);
        return { contains: c => list().indexOf(c) >= 0, add: c => { if (list().indexOf(c) < 0) el.className = list().concat(c).join(' '); }, remove: c => { el.className = list().filter(x => x !== c).join(' '); },
            toggle: (c, on) => { const has = list().indexOf(c) >= 0, want = on === undefined ? !has : !!on; if (want && !has) el.className = list().concat(c).join(' '); if (!want && has) el.className = list().filter(x => x !== c).join(' '); return want; } };
    } });
    El.prototype.setAttribute = function(k, v) { this.attrs[k] = String(v); };
    El.prototype.getAttribute = function(k) { return k in this.attrs ? this.attrs[k] : null; };
    El.prototype.removeAttribute = function(k) { delete this.attrs[k]; };
    El.prototype.hasAttribute = function(k) { return k in this.attrs; };
    El.prototype.addEventListener = function(ev, fn, cap) { const m = cap ? this.capture : this.handlers; (m[ev] = m[ev] || []).push(fn); };
    Object.defineProperty(El.prototype, 'isConnected', { get() { for (let n = this; n; n = n.parentNode) if (n === doc.body) return true; return false; } });
    Object.defineProperty(El.prototype, 'isContentEditable', { get() { const v = this.attrs.contenteditable; return v !== undefined && v !== 'false'; } });
    Object.defineProperty(El.prototype, 'offsetWidth', { get() { return this.rect ? this.rect.right - this.rect.left : 0; } });
    Object.defineProperty(El.prototype, 'offsetHeight', { get() { return this.rect ? this.rect.bottom - this.rect.top : 0; } });
    El.prototype.getBoundingClientRect = function() { const r = this.rect || { left: 0, top: 0, right: 0, bottom: 0 }; return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.right - r.left, height: r.bottom - r.top }; };
    El.prototype.scrollIntoView = function() { this.calls.push('scrollIntoView'); };
    El.prototype.all = function() { let out = []; this.childNodes.forEach(c => { if (c.nodeType === 1) { out.push(c); out = out.concat(c.all()); } }); return out; };
    // '.cls', '#id', 'tag', each with [data-x="v"] parts; a comma list is any of them
    El.prototype.is = function(sel) {
        return sel.split(',').some(one => {
            one = one.trim(); const m = /^([a-zA-Z]*)((?:[.#][\w-]+)*)((?:\[data-[\w-]+(?:="[^"]*")?\])*)$/.exec(one); if (!m) throw new Error('selector not understood by the test page: ' + one);
            if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
            if (!(m[2].match(/[.#][\w-]+/g) || []).every(p => p[0] === '#' ? this.id === p.slice(1) : this.classList.contains(p.slice(1)))) return false;
            return (m[3].match(/\[data-([\w-]+)(?:="([^"]*)")?\]/g) || []).every(p => { const k = /\[data-([\w-]+)(?:="([^"]*)")?\]/.exec(p); return k[2] === undefined ? this.dataset[k[1]] !== undefined : String(this.dataset[k[1]]) === k[2]; });
        });
    };
    El.prototype.matches = El.prototype.is;
    El.prototype.closest = function(sel) { for (let n = this; n; n = n.parentNode) if (n.nodeType === 1 && n.is(sel)) return n; return null; };
    // a list ("A, B") is any of its alternatives; a descendant selector ("A B") is each part in turn
    const query = (root, sel) => { const alts = sel.split(',').map(s => s.trim().split(/\s+/)); return root.all().filter(n => alts.some(parts => { if (!n.is(parts[parts.length - 1])) return false; let up = n.parentNode; for (let i = parts.length - 2; i >= 0; i--) { while (up && !(up.nodeType === 1 && up.is(parts[i]))) up = up.parentNode; if (!up) return false; up = up.parentNode; } return true; })); };
    El.prototype.querySelectorAll = function(sel) { return query(this, sel); };
    El.prototype.querySelector = function(sel) { return query(this, sel)[0] || null; };
    El.prototype.contains = function(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; };
    El.prototype.focus = function() {
        this.calls.push('focus');
        const old = page.active; if (old === this) return;
        if (old) fire(old, 'focusout', { relatedTarget: this });
        page.active = this;
        fire(this, 'focusin', { relatedTarget: old });
    };
    El.prototype.blur = function() { if (page.active !== this) return; fire(this, 'focusout', { relatedTarget: null }); page.active = null; };
    El.prototype.fire = function(ev, extra) { return fire(this, ev, extra); };
    El.prototype.dispatchEvent = function(e) { this.calls.push('dispatch ' + e.type); return true; };

    // one event, down from the document (the listeners added for the capture phase) and up from its target, as a browser sends it
    function fire(target, type, extra) {
        const e = Object.assign({ type: type, target: target, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; this.prevented = true; }, stopPropagation() { this.stopped = true; }, prevented: false }, extra || {});
        const path = []; for (let n = target; n; n = n.parentNode) path.push(n);
        (page.docHandlers['c:' + type] || []).slice().forEach(fn => { if (!e.stopped) fn.call(doc, e); });
        for (let i = path.length - 1; i >= 0 && !e.stopped; i--) (path[i].capture && path[i].capture[type] || []).slice().forEach(fn => { if (!e.stopped) fn.call(path[i], e); });
        for (let i = 0; i < path.length && !e.stopped; i++) (path[i].handlers && path[i].handlers[type] || []).slice().forEach(fn => fn.call(path[i], e));
        if (!e.stopped) (page.docHandlers['b:' + type] || []).slice().forEach(fn => fn.call(doc, e));
        return e;
    }

    const sel = {
        anchorNode: null, anchorOffset: 0, focusNode: null, focusOffset: 0, rangeCount: 0, sets: 0,
        get isCollapsed() { return this.anchorNode === this.focusNode && this.anchorOffset === this.focusOffset; },
        setBaseAndExtent(a, ao, f, fo) { if (!a || !f) throw new Error('setBaseAndExtent: no node'); const len = n => n.nodeType === 3 ? n.nodeValue.length : n.childNodes.length; if (ao > len(a) || fo > len(f) || ao < 0 || fo < 0) throw new Error('setBaseAndExtent: the offset is past the node');
            this.anchorNode = a; this.anchorOffset = ao; this.focusNode = f; this.focusOffset = fo; this.rangeCount = 1; this.sets++; },
        collapse(n, o) { this.setBaseAndExtent(n, o, n, o); },
        removeAllRanges() { this.anchorNode = this.focusNode = null; this.anchorOffset = this.focusOffset = 0; this.rangeCount = 0; }
    };

    const body = new El('body');
    const doc = {
        body: body,
        createElement: tag => new El(tag),
        createTextNode: v => new Text(v),
        getElementById: id => body.all().find(n => n.id === id) || null,
        querySelectorAll: s => query(body, s),
        querySelector: s => query(body, s)[0] || null,
        addEventListener: (ev, fn, cap) => { const k = (cap ? 'c:' : 'b:') + ev; (page.docHandlers[k] = page.docHandlers[k] || []).push(fn); },
        fire: (ev, extra) => { const e = Object.assign({ type: ev, target: doc, preventDefault() {}, stopPropagation() {} }, extra || {}); (page.docHandlers['c:' + ev] || []).concat(page.docHandlers['b:' + ev] || []).forEach(fn => fn.call(doc, e)); return e; }
    };
    Object.defineProperty(doc, 'activeElement', { get: () => page.active || body });
    const win = {
        getSelection: () => sel,
        addEventListener: (ev, fn) => { (page.winHandlers[ev] = page.winHandlers[ev] || []).push(fn); },
        fire: ev => (page.winHandlers[ev] || []).forEach(fn => fn({ type: ev }))
    };
    const setTimeoutStub = fn => { page.timers.push(fn); return page.timers.length; };
    const runTimers = () => { while (page.timers.length) page.timers.shift()(); };

    /* ---- the engine: what a browser's own editing does to an editable box (independent of the app's code) ---- */
    // every text node under a box, in order
    const textsOf = box => { const out = []; (function go(n) { n.childNodes.forEach(c => { if (c.nodeType === 3) out.push(c); else go(c); }); })(box); return out; };
    // a selection point as an index into the box's text nodes joined (elements between them count for nothing: the app draws no line-break element inside the text)
    const flat = (box, node, off) => {
        let at = 0, found = -1;
        (function go(n) { for (let i = 0; i < n.childNodes.length && found < 0; i++) { if (n === node && i === off) { found = at; return; } const c = n.childNodes[i]; if (c.nodeType === 3) { if (c === node) { found = at + off; return; } at += c.nodeValue.length; } else go(c); } if (found < 0 && n === node && off >= n.childNodes.length) found = at; })(box);
        return found < 0 ? at : found;
    };
    // the caret as the engine would leave it: inside the text node that holds the character before it (or, at the very start, the first)
    const place = (box, at) => { const ts = textsOf(box).filter(t => t.nodeValue.length); let a = 0; for (const t of ts) { if (at <= a + t.nodeValue.length) return [t, at - a]; a += t.nodeValue.length; } const l = ts[ts.length - 1]; return l ? [l, l.nodeValue.length] : [box, 0]; };
    const engine = {
        textsOf,
        // the selection as two indexes [s, e]
        range(box) { if (!sel.rangeCount) return null; const a = flat(box, sel.anchorNode, sel.anchorOffset), f = flat(box, sel.focusNode, sel.focusOffset); return [Math.min(a, f), Math.max(a, f)]; },
        // put the caret / a selection by index, where a click or the arrow keys would (the place the engine picks: the end of the node on the left)
        caret(box, s, e) { const a = place(box, s), f = e === undefined || e === s ? a : place(box, e); sel.setBaseAndExtent(a[0], a[1], f[0], f[1]); doc.fire('selectionchange'); },
        // delete [s, e) across text nodes, leaving emptied nodes where they are (a browser may leave them, or a <br> in an emptied box)
        cut(box, s, e) { let a = 0; textsOf(box).forEach(t => { const z = a + t.nodeValue.length, from = Math.max(s, a), to = Math.min(e, z); if (to > from) t.nodeValue = t.nodeValue.slice(0, from - a) + t.nodeValue.slice(to - a); a = z; }); },
        // insert text at an index: into the text node the caret is in; an empty box gets a bare text node of its own (as a browser gives it)
        put(box, at, text) {
            if (!textsOf(box).some(t => t.nodeValue.length)) { box.childNodes.slice().forEach(c => { if (c.nodeType === 1 && c.nodeName === 'BR') detach(c); }); const t = new Text(text); box.insertBefore(t, box.firstChild); sel.setBaseAndExtent(t, text.length, t, text.length); return; }
            const p = place(box, at); p[0].nodeValue = p[0].nodeValue.slice(0, p[1]) + text + p[0].nodeValue.slice(p[1]); sel.setBaseAndExtent(p[0], p[1] + text.length, p[0], p[1] + text.length);
        },
        // one edit as the engine makes it: beforeinput (cancelable), the change to the box, input
        edit(box, inputType, text, extra) {
            const before = fire(box, 'beforeinput', Object.assign({ inputType: inputType, data: text == null ? null : text }, extra || {}));
            if (before.defaultPrevented) return before;
            const r = engine.range(box) || [0, 0]; let s = r[0], e = r[1];
            if (/^delete/.test(inputType) && s === e) { const n = textsOf(box).map(t => t.nodeValue).join(''); if (/Backward/.test(inputType)) { if (!s) return before; s -= (s >= 2 && /[\udc00-\udfff]/.test(n[s - 1]) && /[\ud800-\udbff]/.test(n[s - 2])) ? 2 : 1; } else { if (e >= n.length) return before; e += (/[\ud800-\udbff]/.test(n[e]) && /[\udc00-\udfff]/.test(n[e + 1] || '')) ? 2 : 1; } }
            if (e > s) engine.cut(box, s, e);
            if (!/^delete/.test(inputType) && text) engine.put(box, s, text);
            else { const p = place(box, s); sel.setBaseAndExtent(p[0], p[1], p[0], p[1]); if (!textsOf(box).some(t => t.nodeValue.length) && !box.childNodes.some(c => c.nodeName === 'BR')) box.appendChild(new El('br')); }   // an emptied box: the engine leaves a <br>
            return fire(box, 'input', { inputType: inputType, data: text == null ? null : text });
        },
        type(box, text) { let last = null; for (const ch of Array.from(text)) last = engine.edit(box, 'insertText', ch); return last; },
        backspace(box) { return engine.edit(box, 'deleteContentBackward', null); },
        del(box) { return engine.edit(box, 'deleteContentForward', null); },
        enter(box) { return engine.edit(box, 'insertParagraph', null); },
        // a paste as the page sees it: the paste event with the clipboard's flavours (the engine's own insertion only if nothing cancelled it)
        paste(box, flavours) { const cd = { getData: t => (t in flavours ? flavours[t] : '') }; const e = fire(box, 'paste', { clipboardData: cd }); if (e.defaultPrevented) return e; return engine.edit(box, 'insertFromPaste', flavours['text/plain'] || '', { dataTransfer: cd }); },
        copy(box, type) { const got = {}; const e = fire(sel.anchorNode && sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentNode : box, type || 'copy', { clipboardData: { setData: (t, v) => { got[t] = v; } } }); return { e: e, got: got }; },
        // a composition: its text grows in the box (input events on the way), then it ends
        compose(box, steps) {
            fire(box, 'compositionstart', {});
            const r = engine.range(box) || [0, 0]; let s = r[0], len = r[1] - r[0];
            steps.forEach(t => { fire(box, 'beforeinput', { inputType: 'insertCompositionText', data: t }); if (len) engine.cut(box, s, s + len); if (t) engine.put(box, s, t); len = t.length; fire(box, 'input', { inputType: 'insertCompositionText', data: t, isComposing: true }); });
            return fire(box, 'compositionend', { data: steps[steps.length - 1] });
        }
    };

    return { page, document: doc, window: win, El, Text, fire, sel, setTimeout: setTimeoutStub, runTimers, engine, mk: (tag, cls, data, id) => { const el = new El(tag); if (cls) el.className = cls; if (data) Object.keys(data).forEach(k => { el.dataset[k] = String(data[k]); }); if (id) el.id = id; return el; } };
}

module.exports = { makeDom };
