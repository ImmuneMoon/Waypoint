/* Map objects (1.6.0), the GM's window. The pure half and the owner's answers are in objcore.js.

   Add on the map's toolbar has a Map objects row (#addObjectsBtn), which opens #objModal. It lists the system's set and the campaign's own, each with
   its picture, its name and what it does. Place puts the window away and takes the map's next click, as a shape does. Edit opens the object's values
   in its row: the name, the picture, the cover, and whether it blocks sight or stops tokens. From a picture makes one from the Image Library, and
   From another campaign takes in an object held elsewhere. An object of the campaign's may be moved to the system's set, which is how a set is made
   by hand, so a system file carries it. Everything here is the GM's: nothing is sent, and a placed object is an ordinary piece. Words are text nodes
   alone, since a name can come from a file. Every step is logged ('objects v1'). */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save, toast, pressHold } from './io.js';
import { showConfirm } from './dialogs.js';
import './objcore.js';

function OC() { return window.wpObjCore || null; }
function log(step, facts) { if (window.wpStepLog) window.wpStepLog('objects v1', step, facts || {}); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function btn(cls, text, tip) { var b = el('button', cls, text); b.type = 'button'; if (tip) b.dataset.tip = tip; return b; }
function $(id) { return document.getElementById(id); }

// [objcheck:win-start]
// May this machine change them? The campaign's own machine, never at someone's table, never the stream window, never where the app keeps nothing
function objMay(n, w) { if (n && n.active === true && n.role === 'client') return false; if ((n && n.stream) || (w && w.wpStream)) return false; return !(w && typeof w.wpCanPersistLocal === 'function' && w.wpCanPersistLocal() !== true); }
function listsOf(camp, C) { return { sys: C.cleanObjects(camp && camp.system && camp.system.objects), own: C.cleanObjects(camp && camp.objects) }; }
function listPut(camp, kind, list) {
    if (kind === 'sys') { if (!camp.system) return false; if (list.length) camp.system.objects = list; else delete camp.system.objects; return true; }
    if (list.length) camp.objects = list; else delete camp.objects;
    return true;
}
// What another campaign holds that this one could take in: its name beside each, never this campaign's own
function othersOf(camps, here, C) {
    var out = [];
    Object.keys(camps && typeof camps === 'object' ? camps : {}).forEach(function(id) {
        var c = camps[id]; if (!c || typeof c !== 'object' || c === here || id === (here && here.id)) return;
        var l = listsOf(c, C), nm = typeof c.name === 'string' && c.name ? c.name : 'A campaign';
        l.sys.concat(l.own).forEach(function(o) { out.push({ camp: nm, o: o }); });
    });
    return out;
}
// [objcheck:win-end]

var _win = { edit: '', from: false }, _hold = null;
function net() { return window.wpNet || null; }
function campNow() { return getActiveCampaign(); }
// An object as it stands now: a button of a row held over a field's change (pressHold) still holds the object it was drawn with
function nowOf(o) { var L = listsOf(campNow(), OC()); return L.sys.concat(L.own).filter(function(x) { return x.id === o.id; })[0] || o; }
function store(kind, list) { var c = campNow(); if (!c || !listPut(c, kind, list)) return false; save(); rows(); return true; }

function thumb(o) {
    var t = el('span', 'obj-thumb');
    if (o.src) { var i = el('img'); i.alt = ''; i.src = o.src; t.appendChild(i); } else t.style.background = o.color || '#6b5b45';
    return t;
}
function formInto(box, o, kind, list) {
    var C = OC(), f = el('div', 'obj-form');
    var commit = function(next) { var nl = listsOf(campNow(), C)[kind].map(function(x) { return x.id === o.id ? Object.assign({}, x, next) : x; }); nl = C.cleanObjects(nl); store(kind, nl); return nl; };
    var row = function(label, ctl) { var r = el('label', 'gen-row'); r.appendChild(el('span', 'gen-name', label)); r.appendChild(ctl); f.appendChild(r); };
    var nm = el('input'); nm.type = 'text'; nm.maxLength = 60; nm.value = o.name; nm.addEventListener('change', function() { var v = nm.value.trim(); if (v) { commit({ name: v }); draw(); } else nm.value = o.name; });
    row('Name', nm);
    var sel = el('select'); [['', 'No cover'], ['half', 'Half'], ['threeq', 'Three-quarters'], ['total', 'Total']].forEach(function(p) { var op = el('option', '', p[1]); op.value = p[0]; sel.appendChild(op); });
    sel.value = o.cover || ''; sel.disabled = !!o.sight; sel.dataset.tip = o.sight ? 'A piece that blocks sight gives total cover by itself.' : 'What it gives whenever a line to a target passes through it.';
    sel.addEventListener('change', function() { commit({ cover: sel.value || undefined }); draw(); });
    row('Cover', sel);
    var tick = function(label, on, tip, go) { var l = el('label', 'gen-tick'); var c = el('input'); c.type = 'checkbox'; c.checked = on; c.addEventListener('change', function() { go(c.checked); }); l.appendChild(c); l.appendChild(el('span', '', label)); l.dataset.tip = tip; f.appendChild(l); };
    tick('Blocks sight', !!o.sight, 'A wall to sight, tokens and cover.', function(v) { commit({ sight: v || undefined, stops: undefined }); draw(); });
    if (!o.sight) tick('Stops tokens', !!o.stops, 'Tokens cannot cross it. Sight passes.', function(v) { commit({ stops: v || undefined }); draw(); });
    var size = function(label, key) { var n = el('input'); n.type = 'number'; n.min = 1; n.max = 12; n.value = o[key] || 1; n.addEventListener('change', function() { commit(key === 'w' ? { w: Number(n.value) } : { h: Number(n.value) }); draw(); }); row(label, n); };
    size('Cells wide', 'w'); size('Cells tall', 'h');
    var bar = el('div', 'obj-formbar');
    var pic = btn('tool ghost', o.src ? 'Change picture' : 'Pick a picture', 'Pick from the Image Library. A piece already placed keeps its picture.');
    pic.addEventListener('click', function() { pickPic(function(src) { commit({ src: src }); draw(); }); });
    bar.appendChild(pic);
    if (o.src) { var nop = btn('tool ghost', 'No picture', 'Use a plain block.'); nop.addEventListener('click', function() { commit({ src: undefined }); draw(); }); bar.appendChild(nop); }
    var move = btn('tool ghost', kind === 'sys' ? 'Move to this campaign' : 'Move to the system', kind === 'sys' ? 'Take it out of the system’s set. It stays in this campaign.' : 'Put it in the system’s set, so that a system file carries it.');
    move.addEventListener('click', function() {
        var c = campNow(), L = listsOf(c, C), to = kind === 'sys' ? 'own' : 'sys';
        if (to === 'sys' && !c.system) { toast('This campaign has no system yet.'); return; }
        listPut(c, kind, L[kind].filter(function(x) { return x.id !== o.id; })); listPut(c, to, L[to].concat([nowOf(o)])); save(); log('move', { to: to }); draw();
    });
    bar.appendChild(move);
    var rm = btn('tool ghost', 'Remove', 'Take it off this list. Pieces already placed stay.');
    rm.addEventListener('click', async function() { var ok = await showConfirm('Remove ' + o.name + ' from your map objects? Pieces already placed stay on their maps.'); if (!ok) return; store(kind, listsOf(campNow(), C)[kind].filter(function(x) { return x.id !== o.id; })); _win.edit = ''; log('remove', {}); draw(); });
    bar.appendChild(rm);
    f.appendChild(bar);
    box.appendChild(f);
}
function rowOf(o, kind, list) {
    var C = OC(), r = el('div', 'obj-row'), top = el('div', 'obj-top'), txt = el('div', 'obj-txt');
    top.appendChild(thumb(o));
    txt.appendChild(el('span', 'obj-name', o.name)); txt.appendChild(el('small', '', C.objWords(o)));
    top.appendChild(txt);
    var put = btn('tool', 'Place', 'Then click the map. Drag to size it. Esc cancels.');
    put.addEventListener('click', function() { place(nowOf(o)); });
    var ed = btn('tool ghost', _win.edit === o.id ? 'Done' : 'Edit', 'Its name, picture, cover and size.');
    ed.addEventListener('click', function() { _win.edit = _win.edit === o.id ? '' : o.id; draw(); });
    top.appendChild(put); top.appendChild(ed);
    r.appendChild(top);
    if (_win.edit === o.id) formInto(r, o, kind, list);
    return r;
}
function draw() {
    if (_hold && _hold.busy()) { _hold.then(draw); return; }   // a field said its change as a press went down: the press lands first
    var C = OC(), box = $('objList'), camp = campNow(); if (!C || !box) return;
    box.textContent = '';
    var L = listsOf(camp, C), part = function(title, list, kind, none) {
        box.appendChild(el('div', 'obj-head', title));
        if (!list.length) box.appendChild(el('div', 'obj-none', none));
        list.forEach(function(o) { box.appendChild(rowOf(o, kind, list)); });
    };
    part('From the system', L.sys, 'sys', 'This system has no set of its own.');
    part('This campaign', L.own, 'own', 'None yet. Make one from a picture below.');
    var from = $('objFromList'); if (!from) return;
    from.textContent = ''; from.hidden = !_win.from;
    if (_win.from) {
        var all = othersOf(state.appState && state.appState.campaigns, camp, C);
        if (!all.length) from.appendChild(el('div', 'obj-none', 'No other campaign holds an object.'));
        all.forEach(function(x) {
            var r = el('div', 'obj-top'), t = el('div', 'obj-txt'); r.appendChild(thumb(x.o)); t.appendChild(el('span', 'obj-name', x.o.name)); t.appendChild(el('small', '', x.camp)); r.appendChild(t);
            var b = btn('tool ghost', 'Import', 'Copy it into this campaign. The other campaign keeps its own.');
            b.addEventListener('click', function() {
                var L2 = listsOf(campNow(), C), ans = C.objTake(L2.own, x.o, C.objId([L2.sys, L2.own], Math.random() * 2176782336));
                if (ans.same) { toast('This campaign already has ' + x.o.name + '.'); return; }
                if (ans.full) { toast('This campaign holds as many objects as it can.'); return; }
                store('own', ans.list); log('import', {}); toast('Imported ' + x.o.name + '.'); draw();
            });
            r.appendChild(b); from.appendChild(r);
        });
    }
}
// Build's options list them too (the owner: "include the modular items in the build tool"): a press places one, as Place does
function rows() {
    var C = OC(), box = $('buildObjRows'); if (!C || !box) return;
    box.textContent = '';
    var L = listsOf(campNow(), C), all = L.sys.concat(L.own);
    if (!all.length) box.appendChild(el('div', 'build-line', 'None yet. Make one under All map objects.'));
    all.forEach(function(o) {
        var b = btn('wb-tool-btn menu-row build-obj', undefined, 'Then click the map. Drag to size it. Esc cancels.'), ic = el('span', 'mr-ico'), tx = el('span', 'mr-txt', o.name);
        ic.appendChild(thumb(o)); tx.appendChild(el('small', '', C.objWords(o))); b.appendChild(ic); b.appendChild(tx);
        b.addEventListener('click', function(e) { e.stopPropagation(); place(o); });
        box.appendChild(b);
    });
}
function pickPic(done) {
    if (typeof window.wpPickImage !== 'function') { toast('The image library is not available here.'); return; }
    window.wpPickImage(function(src) {
        var C = OC(), c = C && C.cleanObj({ id: 'x', name: 'x', src: src });
        if (!c || !c.src) { toast('That picture cannot be used. Pick one of the campaign’s own pictures.'); return; }
        done(c.src);
    });
}
function fromPicture() {
    pickPic(function(src) {
        var C = OC(), camp = campNow(), L = listsOf(camp, C), nm = String(src).split('/').pop().replace(/\.[A-Za-z0-9]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Object';
        var o = C.cleanObj({ id: C.objId([L.sys, L.own], Math.random() * 2176782336), name: nm, src: src, cover: 'half' });
        if (!o) { toast('That picture cannot be used.'); return; }
        store('own', L.own.concat([o])); _win.edit = o.id; log('from-picture', {}); draw();
    });
}
function plain() {
    var C = OC(), camp = campNow(), L = listsOf(camp, C), o = C.cleanObj({ id: C.objId([L.sys, L.own], Math.random() * 2176782336), name: 'New object', cover: 'half' });
    store('own', L.own.concat([o])); _win.edit = o.id; log('plain', {}); draw();
}
function place(o) {
    var C = OC(), p = C.objProps(o, state.gridType === 'hex');
    if (!p || typeof window.wpArmPlacement !== 'function') return;
    close(); window.wpArmPlacement(C.objType(o), p, o.name); if (window.wpPlace) window.wpPlace.sized = true; log('place', { kind: C.objType(o) });
}
function open() {
    if (!objMay(net(), window)) { toast('Map objects are the GM’s.'); return; }
    var m = $('objModal'); if (!m) return;
    _win.edit = ''; _win.from = false; draw(); m.style.display = 'flex'; log('open', {});
}
function close() { var m = $('objModal'); if (m) m.style.display = 'none'; }
function wire() {
    var on = function(id, fn) { var e = $(id); if (e) e.addEventListener('click', fn); };
    if ($('objList')) _hold = pressHold($('objList'), window);
    on('addObjectsBtn', open); on('buildObjBtn', open); on('objClose', close); on('objFromPic', fromPicture); on('objPlain', plain);
    on('buildOptBtn', rows); on('buildModeBtn', rows);
    on('objFromOther', function() { _win.from = !_win.from; draw(); });
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
window.wpMapObjects = { open: open, close: close, rows: rows };
