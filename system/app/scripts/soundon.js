/* Sounds on actions (1.6.2): the GM ties a sound of the campaign to a roll, a list's roll, a blast, a mine, a door or a trigger zone, and it
   plays when that happens. The rules and the pure half are soundoncore.js. Here: fire, what the host calls as a thing happens; the list under
   the Sound panel; and ask, the small pop a button where the thing is opens, which adds to that same list. All of it runs on the machine that
   owns the campaign, and a name from a file reaches the page as text alone. Who hears is net.js soundHears, and nothing of the list ever leaves
   this machine: what a player gets is the same cue the Sound panel sends. Published as window.wpSoundOn. */
import { getActiveCampaign, getActiveMap } from './models.js';
import { save, toast } from './io.js';
import * as C from './soundoncore.js';

function ui(id) { return document.getElementById(id); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
function log(step, facts) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('soundon v1', step, facts || {}); } catch (e) {} }

// [soundoncheck:fire-start]
function mine() {   // the machine that owns the campaign: the host's, or a GM's with no table. Never someone else's table, its link up or down, nor the stream window
    var n = window.wpNet; if (window.wpStream || (n && (n.stream || n.foreign || (n.active && n.role === 'client')))) return false;
    return !!(window.wpCanPersistLocal && window.wpCanPersistLocal());
}
function on(camp) { return !!camp && Array.isArray(camp.soundOn) && camp.soundOn.length > 0; }
// A thing happened. what: what it was, for the list. who: where, and whom it may reach (net.js soundHears). The GM always hears it
function fire(what, who) {
    try {
        var camp = getActiveCampaign(); if (!on(camp) || !mine()) return false;
        var line = C.pick(C.cleanSoundOn(camp.soundOn), what, camp.system); if (!line) return false;
        var S = window.wpSound, r = S && typeof S.action === 'function' ? S.action(line.snd, who) : false;
        log(r ? 'played' : 'silent', { kind: what && what.k, to: r ? r.to : 0, secret: !!(who && who.secret) });
        return !!r;
    } catch (e) { log('failed', { kind: what && what.k }); return false; }
}
function door(map, w, secret, by) {   // a door moved. secret: it was a secret door until now
    if (!w || typeof w.id !== 'string') return false;
    map = map || getActiveMap(); if (!map) return false;
    return fire({ k: 'door', on: w.doorOpen ? 'open' : 'close', map: map.id, pc: w.id }, { map: map.id, secret: !!secret || !!w.hidden, at: { x: (Number(w.x) || 0) + (Number(w.w) || 0) / 2, y: (Number(w.y) || 0) + (Number(w.h) || 0) / 2 }, by: by });
}
function zoneDrop(map, w, from) {   // a token's move landed: a zone it was carried into
    var z = map && w ? C.zoneOf(map, w, from) : null; if (!z) return false;
    return fire({ k: 'zone', map: map.id, pc: z.id }, { map: map.id, tok: w.id, secret: !!w.hidden });
}
// [soundoncheck:fire-end]

// [soundoncheck:list-start]
function cues() { var S = window.wpSound; return S && typeof S.cues === 'function' ? S.cues() : []; }
function nameOf(id) { var hit = cues().filter(function(e) { return e.id === id; })[0]; return hit ? hit.name : ''; }
function linesOf(camp) { return C.cleanSoundOn(camp && camp.soundOn); }
function lineOf(camp, ev) { var k = C.evKey(ev); return linesOf(camp).filter(function(ln) { return C.evKey(ln.ev) === k; })[0] || null; }
function store(camp, list) { if (list.length) camp.soundOn = list; else delete camp.soundOn; save(true); redraw(); }
// One line for this event: a sound sets it, none takes it away
function setLine(camp, ev, snd) {
    var clean = C.cleanEv(ev); if (!camp || !clean || !mine()) return false;
    var list = linesOf(camp), k = C.evKey(clean), at = -1; list.forEach(function(ln, i) { if (C.evKey(ln.ev) === k) at = i; });
    if (!snd) { if (at < 0) return false; list.splice(at, 1); store(camp, list); log('removed', { lines: list.length }); return true; }
    if (at < 0 && list.length >= C.LIMITS.lines) { toast('This list is full. Take a line away first.'); return false; }
    var ln = C.cleanLine({ ev: clean, snd: snd, n: C.whatWords(clean, camp.system, camp).text, sn: nameOf(snd) }); if (!ln) return false;
    if (at < 0) list.push(ln); else list[at] = ln;
    store(camp, list); log(at < 0 ? 'added' : 'changed', { kind: clean.k, lines: list.length });
    return true;
}
// The categories and entries a list's line may name: the list's own categories, and the entries the campaign's characters carry on it
function whichRows(camp, ev) {
    var out = [{ value: '', words: 'Any row' }], seen = Object.create(null), S = window.wpSystemCore, f = (camp && camp.system && Array.isArray(camp.system.fields) ? camp.system.fields : []).filter(function(x) { return !!x && x.id === ev.f; })[0];
    var add = function(value, text) { if (!value || seen[value]) return; seen[value] = 1; out.push({ value: value, words: text }); };
    var spec = f && f.list && typeof f.list === 'object' ? f.list : {}; (Array.isArray(spec.cats) ? spec.cats : []).forEach(function(c) { if (typeof c === 'string' && c) add('c:' + c, 'Category: ' + c); });
    var chars = camp && camp.chars && typeof camp.chars === 'object' ? camp.chars : {}, rows = [];
    Object.keys(chars).forEach(function(id) { var v = chars[id] && chars[id].values ? chars[id].values[ev.f] : null; if (Array.isArray(v)) v.forEach(function(r) { if (rows.length < 400) rows.push(r); }); });
    rows.forEach(function(r) { var rd = S && typeof S.rowDef === 'function' ? S.rowDef(camp.system, r) : null, d = rd ? rd.def : null; if (d && typeof d.category === 'string' && d.category) add('c:' + d.category, 'Category: ' + d.category); });
    rows.forEach(function(r) { var rd = S && typeof S.rowDef === 'function' ? S.rowDef(camp.system, r) : null, d = rd ? rd.def : null, k = d && typeof d.key === 'string' && d.key ? d.key : r && typeof r.defId === 'string' ? r.defId : ''; if (k && d) add('k:' + k, String(d.name || 'An entry')); });
    if (ev.key && !seen['k:' + ev.key]) add('k:' + ev.key, ev.kn || 'One entry');
    if (ev.cat && !seen['c:' + ev.cat]) add('c:' + ev.cat, 'Category: ' + ev.cat);
    return out;
}
function narrowed(ev, value, name) {   // the same event for a row of one kind
    var out = Object.assign({}, ev); delete out.key; delete out.kn; delete out.cat;
    if (value.indexOf('k:') === 0) { out.key = value.slice(2); out.kn = name; } else if (value.indexOf('c:') === 0) out.cat = value.slice(2);
    return C.cleanEv(out);
}
function whichOf(ev) { return ev.key ? 'k:' + ev.key : ev.cat ? 'c:' + ev.cat : ''; }
function option(sel, value, text, on) { var o = el('option', null, text); o.value = value; if (on) o.selected = true; sel.appendChild(o); return o; }
function libOpen() { var L = window.wpLibrary; return !!(window.wpLibPicker && L && typeof L.size === 'function' && L.size() > 0 && typeof L.entriesOf === 'function'); }
function libPick(anchor, camp, done) {   // an entry from the library, which the list above offers only where a character carries it
    var L = window.wpLibrary;
    window.wpLibPicker.open({ anchor: anchor, title: 'Which entry', cats: null, noQty: true, once: null, labels: {}, gm: true,
        source: { packs: function() { return (camp.library && camp.library.packs) || []; }, entries: function(pid) { return L.entriesOf(pid); } },
        onAdd: function(ids) { var e = ids.length && L.entry ? L.entry(ids[0]) : null; if (e) done(typeof e.key === 'string' && e.key ? e.key : e.id, String(e.name || 'An entry')); } });
}
function whichSel(camp, ev, done) {   // the second list of a list's line: every row, or one kind
    var s = el('select', 'tool snd-on-sel snd-on-which'), rows = whichRows(camp, ev), cur = whichOf(ev); s.title = 'Every row of the list, or only one kind of thing on it';
    rows.forEach(function(r) { option(s, r.value, r.words, r.value === cur); });
    if (libOpen()) option(s, '@lib', 'From the library…', false);
    if (window.wpTexList && window.wpTexList.keys) window.wpTexList.keys(s);   // its last row opens a window, so a key step never reaches it
    s.addEventListener('change', function(e) {
        e.stopPropagation();
        if (s.value === '@lib') { s.value = cur; libPick(s, camp, function(key, name) { done(narrowed(ev, 'k:' + key, name)); }); return; }
        var hit = rows.filter(function(r) { return r.value === s.value; })[0]; done(narrowed(ev, s.value, hit ? hit.words : ''));
    });
    return s;
}
function soundSel(cur, gone, done) {
    var s = el('select', 'tool snd-on-sel snd-on-snd'), list = cues(); s.title = 'The sound it plays';
    if (cur && !list.some(function(e) { return e.id === cur; })) option(s, cur, gone || 'A sound that is gone', true);
    list.forEach(function(e) { option(s, e.id, e.name, e.id === cur); });
    s.addEventListener('change', function(e) { e.stopPropagation(); done(s.value); });
    return s;
}
function iconBtn(cls, words, press) { var b = el('button', cls + ' tool ghost snd-on-icon'); b.type = 'button'; b.title = words; b.setAttribute('aria-label', words); b.addEventListener('click', function(e) { e.stopPropagation(); press(); }); return b; }
function lineRow(camp, ln) {
    var w = C.whatWords(ln.ev, camp.system, camp, ln.n), nm = nameOf(ln.snd), row = el('div', 'snd-on-row'), what = el('div', 'snd-on-what');
    what.appendChild(el('span', 'snd-on-name', w.text)); if (w.gone) what.appendChild(el('small', 'snd-on-gone', w.gone)); if (!nm) what.appendChild(el('small', 'snd-on-gone', 'This sound is gone from the library' + (ln.sn ? ': ' + ln.sn : '') + '.'));
    row.appendChild(what);
    if (ln.ev.k === 'list' && !w.gone) row.appendChild(whichSel(camp, ln.ev, function(ev) { if (!ev) return; var list = linesOf(camp), k = C.evKey(ln.ev), nk = C.evKey(ev); if (nk === k) return; if (list.some(function(x) { return C.evKey(x.ev) === nk; })) { toast('That already has a sound.'); fill(); return; } list.forEach(function(x, i) { if (C.evKey(x.ev) === k) list[i] = C.cleanLine({ ev: ev, snd: x.snd, n: C.whatWords(ev, camp.system, camp).text, sn: x.sn }) || x; }); store(camp, list); log('changed', { kind: 'list', lines: list.length }); }));
    row.appendChild(soundSel(ln.snd, ln.sn ? ln.sn + ' (gone)' : '', function(id) { setLine(camp, ln.ev, id); }));
    var hear = iconBtn('wib wi-play', 'Hear it here. Players do not hear this.', function() { var S = window.wpSound; if (!nm || !S || !S.hear || !S.hear(ln.snd)) toast('That sound cannot be played.'); }); if (!nm) hear.disabled = true; row.appendChild(hear);
    row.appendChild(iconBtn('wib wi-close', 'Take this line away', function() { setLine(camp, ln.ev, ''); }));
    return row;
}
var _add = null;   // the add form while it is open: { at: 'group|row', which, name, snd }
function addForm(camp, box) {
    var groups = C.choices(camp.system), all = [], list = cues(), form = el('div', 'snd-on-form');
    var what = el('select', 'tool snd-on-sel snd-on-what-sel'); what.title = 'What happens'; what.setAttribute('aria-label', 'What happens');
    groups.forEach(function(g) { var og = el('optgroup'); og.label = g.name; g.rows.forEach(function(r) { var at = String(all.length); all.push(r); option(og, at, r.words, at === _add.at); }); what.appendChild(og); });
    if (!_add.at) _add.at = '0';
    what.addEventListener('change', function(e) { e.stopPropagation(); _add.at = what.value; _add.which = ''; _add.name = ''; fill(); });
    form.appendChild(what);
    var pickd = all[Number(_add.at)] || all[0], ev = pickd.ev;
    if (ev.k === 'list') { var cur = narrowed(ev, _add.which || '', _add.name) || ev; form.appendChild(whichSel(camp, cur, function(nx) { if (!nx) return; _add.which = whichOf(nx); _add.name = nx.kn || ''; fill(); })); ev = cur; }
    if (!list.length) form.appendChild(el('div', 'snd-none', 'No cues yet. Add some in the library first.'));
    else { if (!_add.snd || !list.some(function(e) { return e.id === _add.snd; })) _add.snd = list[0].id; form.appendChild(soundSel(_add.snd, '', function(id) { _add.snd = id; })); }
    var foot = el('div', 'snd-on-foot'), go = el('button', 'tool snd-btn snd-on-go', 'Add'), no = el('button', 'tool ghost snd-btn snd-on-no', 'Cancel'); go.type = no.type = 'button'; go.disabled = !list.length;
    go.addEventListener('click', function(e) { e.stopPropagation(); var s = _add.snd; _add = null; if (!setLine(camp, ev, s)) fill(); });
    no.addEventListener('click', function(e) { e.stopPropagation(); _add = null; fill(); });
    foot.appendChild(go); foot.appendChild(no); form.appendChild(foot); box.appendChild(form);
}
// The control that held the focus, by its place among the box's controls, so that drawing the box again leaves it there
function focusAt(box) {
    var act = typeof document !== 'undefined' ? document.activeElement : null; if (!act || typeof box.querySelectorAll !== 'function' || typeof box.contains !== 'function' || !box.contains(act)) return -1;
    return Array.prototype.indexOf.call(box.querySelectorAll('select, button'), act);
}
function focusBack(box, at) {
    if (at < 0 || typeof box.querySelectorAll !== 'function') return;
    var all = box.querySelectorAll('select, button'), to = all[Math.min(at, all.length - 1)]; if (to && typeof to.focus === 'function') to.focus();
}
function fill() {
    var box = ui('soundOnBox'), camp = getActiveCampaign(); if (!box || !camp) return;
    var fat = focusAt(box);   // found by hand: a list stepped by its arrow keys draws this box again, and the rest of the keys went to the map
    box.textContent = '';
    box.appendChild(el('span', 'snd-label', 'On actions'));
    var list = linesOf(camp); list.forEach(function(ln) { box.appendChild(lineRow(camp, ln)); });
    if (_add) { addForm(camp, box); focusBack(box, fat); return; }
    var add = el('button', 'tool ghost snd-btn snd-on-add', '+ Add a sound on an action'); add.type = 'button'; add.title = 'A sound that plays when a roll is made, a blast goes off, a door moves or a token enters a zone. Those on that map hear it, and you always do';
    add.addEventListener('click', function(e) { e.stopPropagation(); _add = { at: '', which: '', name: '', snd: '' }; fill(); });
    box.appendChild(add); focusBack(box, fat);
}
// Sound on a blast says whether one is set, as the small buttons do
function blastSync() { var b = typeof ui === 'function' ? ui('blastSoundBtn') : null, camp = getActiveCampaign(); if (!b || !b.classList) return; b.classList.toggle('active', !!(camp && lineOf(camp, { k: 'blast' }))); }
function redraw() { fill(); blastSync(); }
// sound.js renderPanel: the list, above the panel's foot
function draw(body) {
    if (!body || !getActiveCampaign()) return;
    var box = el('div', 'snd-on'); box.id = 'soundOnBox';
    var foot = body.querySelector('.snd-foot'); if (foot) body.insertBefore(box, foot); else body.appendChild(box);
    fill();
}
// [soundoncheck:list-end]

// [soundoncheck:ask-start]
// The small button where a thing is: its pop lists the sounds, the line's own marked, and a press sets that same line. A press on No sound takes it away
var _pop = null;
function popClose(back) { if (!_pop) return; var p = _pop; _pop = null; document.removeEventListener('pointerdown', popOut, true); document.removeEventListener('keydown', popKey, true); if (p.el.parentNode) p.el.parentNode.removeChild(p.el); if (back && p.anchor && p.anchor.focus) p.anchor.focus(); }
function popOut(e) { if (_pop && !_pop.el.contains(e.target)) popClose(false); }
function popKey(e) {
    if (!_pop) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); popClose(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var bs = Array.prototype.slice.call(_pop.el.querySelectorAll('button')), at = bs.indexOf(document.activeElement), n = bs.length; if (!n) return;
    e.preventDefault(); e.stopPropagation(); bs[(at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n].focus();
}
function ask(anchor, ev) {
    var camp = getActiveCampaign(), clean = C.cleanEv(ev); popClose(false);
    if (!camp || !clean) return;
    if (!mine()) { toast('Not while you are at someone else’s table.'); return; }
    var ln = lineOf(camp, clean), list = cues(), pop = el('div', 'snd-on-pop'); pop.setAttribute('role', 'menu'); pop.setAttribute('aria-label', 'A sound on this action');
    pop.appendChild(el('div', 'snd-on-pophead', C.whatWords(clean, camp.system, camp).text));
    var row = function(text, id) { var b = el('button', 'snd-on-poprow' + ((ln ? ln.snd : '') === id ? ' on' : ''), text); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.addEventListener('click', function(e) { e.stopPropagation(); popClose(true); setLine(camp, clean, id); }); pop.appendChild(b); return b; };
    row('No sound', ''); list.forEach(function(e) { row(e.name, e.id); });
    if (!list.length) pop.appendChild(el('div', 'snd-none', 'No cues yet. Add some in the Sound library first.'));
    document.body.appendChild(pop);
    var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 8, bottom: 8 }, pw = pop.offsetWidth || 240, ph = pop.offsetHeight || 200, W = window.innerWidth || 800, H = window.innerHeight || 600;
    pop.style.left = Math.max(8, Math.min(W - pw - 8, r.left)) + 'px'; pop.style.top = Math.max(8, Math.min(H - ph - 8, r.bottom + 4)) + 'px';
    _pop = { el: pop, anchor: anchor }; document.addEventListener('pointerdown', popOut, true); document.addEventListener('keydown', popKey, true);
    var fb = pop.querySelector('button.on') || pop.querySelector('button'); if (fb && fb.focus) fb.focus();
    log('asked', { kind: clean.k });
}
// The small button itself, for a place that builds elements. null on a machine that does not own the campaign
function btn(ev, words) {
    var clean = C.cleanEv(ev), camp = getActiveCampaign(); if (!clean || !mine()) return null;
    var b = el('button', 'wib wi-sound tool ghost snd-on-btn' + (camp && lineOf(camp, clean) ? ' on' : '')); b.type = 'button'; b.title = words || 'A sound on this action'; b.setAttribute('aria-label', b.title);
    b.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); ask(b, clean); });
    return b;
}
// [soundoncheck:ask-end]

(function wireBlast() { var b = ui('blastSoundBtn'); if (b) b.addEventListener('click', function(e) { e.stopPropagation(); ask(b, { k: 'blast' }); }); ['blastOptBtn', 'blastModeBtn'].forEach(function(id) { var o = ui(id); if (o) o.addEventListener('click', blastSync); }); })();

window.wpSoundOn = { fire: fire, on: on, door: door, zoneDrop: zoneDrop, draw: draw, ask: ask, btn: btn, setLine: setLine, redraw: redraw };
