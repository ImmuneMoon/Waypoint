// deckui.js: one editor for a deck or a bag, a system's or a campaign's (1.6.2, backlog 210 d, docs/DECKS_PLAN.md; the owner: "there's one way to build a deck"). Elements and text nodes alone: a name and a card can come from a file. The caller says where its list lives (o.list, o.set), what its keys begin with (o.prefix) and that something changed (o.changed). No key is ever shown or typed
import { statKey, readCards, CARDS_MAX, DECKS_MAX, STATS_MAX, COPIES_MAX, FACES_MAX, SPREADS_MAX, PLACES_MAX } from './deckcore.js';
var open = Object.create(null);   // which deck each editor shows, by its prefix
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; }
function btn(cls, text, tip) { var b = el('button', cls, text); b.type = 'button'; if (tip) b.title = tip; return b; }
function box(cls, v, tip, ph) { var i = el('input', cls); i.type = 'text'; i.value = v === undefined || v === null ? '' : String(v); if (tip) i.title = tip; if (ph) i.placeholder = ph; return i; }
function numBox(cls, v, tip, ph) { var i = el('input', cls); i.type = 'number'; i.value = typeof v === 'number' ? String(v) : ''; if (tip) i.title = tip; if (ph) i.placeholder = ph; return i; }
function pickBox(cls, rows, v, tip) { var s = el('select', cls); rows.forEach(function(r) { var o = el('option', '', r[1]); o.value = r[0]; s.appendChild(o); }); s.value = v; if (tip) s.title = tip; return s; }
function cap(text, x) { var l = el('label', 'sys-check'); l.appendChild(document.createTextNode(text + ' ')); l.appendChild(x); return l; }
var AFTERS = [['discard', 'Goes to a discard pile until a reshuffle'], ['back', 'Goes back at once'], ['gone', 'Stays out for good']];
function nextKey(list, prefix) { var n = 1; while (list.some(function(d) { return d && d.key === prefix + n; })) n++; return prefix + n; }
// 1.6.2 (backlog 223, story cards; the owner, by prompt: "Random, then turn"): a card's other faces, up to three after its name. An emptied face goes
function faceBoxes(rw, c, o, redraw) {
    var fs = Array.isArray(c.faces) ? c.faces : [];
    fs.forEach(function(t, k) { var b = box('field dk-face', t, 'Another face of this card. A draw lands on one of its faces at random, and you can turn it', 'Another face'); b.addEventListener('input', function() { if (!Array.isArray(c.faces)) c.faces = []; c.faces[k] = b.value.slice(0, 80); o.changed(); }); b.addEventListener('change', function() { if (b.value.trim()) return; c.faces.splice(k, 1); if (!c.faces.length) delete c.faces; redraw(); }); rw.appendChild(b); });
    if (fs.length < FACES_MAX - 1) { var fa = btn('tool ghost sys-btn dk-faceadd', '+ Face', 'Another short phrase on this card. A draw lands on one face at random, and you can turn it to the next'); fa.addEventListener('click', function() { c.faces = fs.concat(['']); redraw(); }); rw.appendChild(fa); }
}
function edit(host, o) {
    host.textContent = ''; var list = o.list() || [], wrap = el('div', 'sys-budgets sys-results'), redraw = function() { o.changed(); edit(host, o); };
    wrap.appendChild(el('div', 'sys-light-head', o.head)); wrap.appendChild(el('div', 'sys-note', o.note));
    var at = list.filter(function(d) { return d && d.key === open[o.prefix]; })[0] || list[0] || null; if (at) open[o.prefix] = at.key;
    var top = el('div', 'dk-head');
    if (list.length) { var sel = pickBox('field dk-pick', list.map(function(d) { return [d.key, d.label || 'A deck']; }), at.key, 'Which one to change'); sel.addEventListener('change', function() { open[o.prefix] = sel.value; edit(host, o); }); top.appendChild(sel); }
    var add = btn('tool ghost sys-btn dk-add', '+ Deck or bag', 'A new set of things to draw from'); add.addEventListener('click', function() { if (list.length >= DECKS_MAX) return; var d = { key: nextKey(list, o.prefix), label: '', after: 'discard', stats: [], cards: [] }; var l2 = list.concat([d]); o.set(l2); open[o.prefix] = d.key; redraw(); }); top.appendChild(add);
    if (at) { var rm = btn('tool ghost sys-btn dk-rm', 'Remove it', 'Remove this deck'); rm.addEventListener('click', function() { o.set(list.filter(function(d) { return d !== at; })); delete open[o.prefix]; redraw(); }); top.appendChild(rm); }
    wrap.appendChild(top); if (!at) { host.appendChild(wrap); return; }
    var head = el('div', 'dk-head'), nm = box('field dk-label', at.label, 'Its name, in the lists and on cards', 'A name'), wd = box('field dk-word', at.word || '', 'What the sheet calls it, such as Deck or Bag', 'Deck'), af = pickBox('field dk-after', AFTERS, at.after || 'discard', 'What becomes of a card once it is drawn. One in a hand comes back the same way when it is discarded'), vs = pickBox('field dk-vis', [['', 'Everyone knows it'], ['gm', 'You alone know it']], at.vis === 'gm' ? 'gm' : '', 'One for you alone never reaches players, and every card it draws is yours');
    nm.addEventListener('input', function() { at.label = nm.value.slice(0, 60); o.changed(); }); wd.addEventListener('input', function() { var v = wd.value.slice(0, 24); if (v.trim()) at.word = v; else delete at.word; o.changed(); }); af.addEventListener('change', function() { at.after = af.value; o.changed(); }); vs.addEventListener('change', function() { if (vs.value) at.vis = 'gm'; else delete at.vis; o.changed(); });
    var op = el('input', 'dk-open'); op.type = 'checkbox'; op.checked = at.open === true; op.title = 'Players may draw from this by hand, in the Decks window'; op.addEventListener('change', function() { if (op.checked) at.open = true; else delete at.open; o.changed(); });
    head.appendChild(nm); head.appendChild(cap('Called', wd)); head.appendChild(cap('After a draw', af)); head.appendChild(vs); head.appendChild(cap('Players may draw', op)); wrap.appendChild(head);
    var stats = Array.isArray(at.stats) ? at.stats : (at.stats = []), sRow = el('div', 'dk-head');
    sRow.appendChild(el('span', 'dk-count', 'Numbers on a card:'));
    stats.forEach(function(s, i) { var b = box('field dk-stat', s.label, 'What this number is called', 'Value'), x = btn('tool ghost sys-btn dk-statrm', '×', 'Take this number off every card'); b.addEventListener('change', function() { var was = s.label; s.label = b.value.slice(0, 40); if (!was && s.label.trim() && /^Number[0-9]+$/.test(s.key)) { var nk = statKey(s.label, stats.filter(function(x) { return x !== s; })); (at.cards || []).forEach(function(c) { if (c && c.vals && Object.prototype.hasOwnProperty.call(c.vals, s.key)) { c.vals[nk] = c.vals[s.key]; delete c.vals[s.key]; } }); s.key = nk; } o.changed(); }); x.addEventListener('click', function() { stats.splice(i, 1); (at.cards || []).forEach(function(c) { if (c && c.vals) { delete c.vals[s.key]; if (!Object.keys(c.vals).length) delete c.vals; } }); redraw(); }); sRow.appendChild(b); sRow.appendChild(x); });
    if (stats.length < STATS_MAX) { var sa = btn('tool ghost sys-btn dk-statadd', '+ Number', 'A number each card holds, which a formula can read'); sa.addEventListener('click', function() { stats.push({ key: statKey('Number' + (stats.length + 1), stats), label: '' }); redraw(); }); sRow.appendChild(sa); }
    wrap.appendChild(sRow);
    var cards = Array.isArray(at.cards) ? at.cards : (at.cards = []);
    cards.forEach(function(c, i) {
        var rw = el('div', 'dk-card'), n = box('field dk-name', c.name, 'The card’s name', 'A card'), cp = numBox('field dk-copies', typeof c.n === 'number' ? c.n : 1, 'How many of this card there are', '1'), x = btn('tool ghost sys-btn dk-cardrm', '×', 'Take this card away');
        n.addEventListener('input', function() { c.name = n.value.slice(0, 80); o.changed(); }); rw.appendChild(n); faceBoxes(rw, c, o, redraw); cp.addEventListener('change', function() { var k = Math.max(1, Math.min(COPIES_MAX, Math.floor(Number(cp.value) || 1))); if (k > 1) c.n = k; else delete c.n; o.changed(); }); rw.appendChild(cap('Copies', cp));
        stats.forEach(function(s) { var b = numBox('field dk-val', c.vals ? c.vals[s.key] : undefined, s.label || 'A number', '0'); b.addEventListener('change', function() { var v = Number(b.value); c.vals = c.vals || {}; if (String(b.value).trim() !== '' && isFinite(v) && v !== 0) c.vals[s.key] = v; else { delete c.vals[s.key]; if (!Object.keys(c.vals).length) delete c.vals; } o.changed(); }); rw.appendChild(cap(s.label || 'Number', b)); });
        if (o.prefix !== 'C') { var ed = el('label', 'sys-check dk-ends'), ec = el('input', 'dk-endsbox'); ec.type = 'checkbox'; ec.checked = c.ends === true; ec.addEventListener('change', function() { if (ec.checked) c.ends = true; else delete c.ends; o.changed(); }); ed.appendChild(ec); ed.appendChild(document.createTextNode(' Ends the round')); ed.title = 'Where a draw sets a fight\u2019s order, the round ends when play reaches this card'; rw.appendChild(ed); }   // a campaign\u2019s own deck sets no order, since a rule relies only on a system\u2019s
        if (c.pic) { var im = el('img', 'dk-pic'); im.src = c.pic; im.alt = ''; rw.appendChild(im); }
        var pb = btn('tool ghost sys-btn dk-picbtn', c.pic ? 'Change picture' : '+ Picture', 'Pick one of the campaign’s pictures'); pb.addEventListener('click', function() { if (typeof window.wpPickImage !== 'function') return; window.wpPickImage(function(src) { if (typeof src === 'string' && src) { c.pic = src; redraw(); } }); }); rw.appendChild(pb);
        x.addEventListener('click', function() { cards.splice(i, 1); redraw(); }); rw.appendChild(x); wrap.appendChild(rw);
    });
    var foot = el('div', 'dk-head'); if (cards.length < CARDS_MAX) { var ca = btn('tool ghost sys-btn dk-cardadd', '+ Card', 'Add a card'); ca.addEventListener('click', function() { cards.push({ name: '' }); redraw(); }); foot.appendChild(ca); }
    var much = btn('tool ghost sys-btn dk-many', 'Add several', 'Paste or type a list of cards, one a line. Put a card’s other faces after its name, each after a |'); foot.appendChild(much); foot.appendChild(el('span', 'dk-count', cards.reduce(function(a, c) { return a + (c && typeof c.n === 'number' ? c.n : 1); }, 0) + ' in all')); wrap.appendChild(foot);
    var paste = el('textarea', 'field dk-paste'); paste.hidden = true; paste.placeholder = stats.length ? 'One card a line: its name, then its numbers: ' + stats.map(function(s) { return s.label || 'a number'; }).join(', ') : 'One card a line'; var pgo = btn('tool ghost sys-btn dk-manygo', 'Add these'); pgo.hidden = true;
    much.addEventListener('click', function() { paste.hidden = false; pgo.hidden = false; much.hidden = true; if (paste.focus) paste.focus(); });
    pgo.addEventListener('click', function() { readCards(paste.value, stats).slice(0, CARDS_MAX - cards.length).forEach(function(c) { cards.push(c); }); redraw(); }); wrap.appendChild(paste); wrap.appendChild(pgo);
    host.appendChild(wrap);
}
// 1.6.2 (backlog 223, story cards): one editor for a spread, a system's or a campaign's. o: { head, note, prefix, list, set, decks, changed }. decks() answers
// the decks a place may draw from ([key, name] each). A spread's places are its own: a label, the deck it draws from (or none, filled by hand), a hint
function spreads(host, o) {
    host.textContent = ''; var list = o.list() || [], wrap = el('div', 'sys-budgets sys-results sp-edit'), redraw = function() { o.changed(); spreads(host, o); }, dk = o.decks() || [], key = 'sp:' + o.prefix;
    wrap.appendChild(el('div', 'sys-light-head', o.head)); wrap.appendChild(el('div', 'sys-note', o.note));
    var at = list.filter(function(s) { return s && s.key === open[key]; })[0] || list[0] || null; if (at) open[key] = at.key;
    var top = el('div', 'dk-head');
    if (list.length) { var sel = pickBox('field sp-pick', list.map(function(s) { return [s.key, s.label || 'A spread']; }), at.key, 'Which one to change'); sel.addEventListener('change', function() { open[key] = sel.value; spreads(host, o); }); top.appendChild(sel); }
    var add = btn('tool ghost sys-btn sp-add', '+ Spread', 'A set of places, each drawn from a deck, laid out in one press'); add.addEventListener('click', function() { if (list.length >= SPREADS_MAX) return; var s = { key: nextKey(list, o.prefix), label: '', places: [{ label: '', deck: dk.length ? dk[0][0] : undefined }] }; if (!s.places[0].deck) delete s.places[0].deck; o.set(list.concat([s])); open[key] = s.key; redraw(); }); top.appendChild(add);
    if (at) { var rm = btn('tool ghost sys-btn sp-rm', 'Remove it', 'Remove this spread'); rm.addEventListener('click', function() { o.set(list.filter(function(s) { return s !== at; })); delete open[key]; redraw(); }); top.appendChild(rm); }
    wrap.appendChild(top); if (!at) { host.appendChild(wrap); return; }
    var nm = box('field sp-label', at.label, 'Its name, in the Decks window and on the card the table sees', 'A name'); nm.addEventListener('input', function() { at.label = nm.value.slice(0, 60); o.changed(); }); var hr = el('div', 'dk-head'); hr.appendChild(nm); wrap.appendChild(hr);
    var places = Array.isArray(at.places) ? at.places : (at.places = []), rows = [['', 'No deck: you fill it in']].concat(dk);
    places.forEach(function(p, i) {
        var rw = el('div', 'dk-card sp-place'), lb = box('field sp-plabel', p.label, 'What this place stands for, such as Who or Stands in the way', 'A place'), ds = pickBox('field sp-deck', rows, rows.some(function(r) { return r[0] === p.deck; }) ? p.deck || '' : '', 'The deck this place draws from'), hn = box('field sp-hint', p.hint || '', 'A hint for reading it, shown on the place', 'A hint (optional)'), x = btn('tool ghost sys-btn sp-placerm', '×', 'Take this place away');
        lb.addEventListener('input', function() { p.label = lb.value.slice(0, 40); o.changed(); }); ds.addEventListener('change', function() { if (ds.value) p.deck = ds.value; else delete p.deck; o.changed(); }); hn.addEventListener('input', function() { var v = hn.value.slice(0, 120); if (v.trim()) p.hint = v; else delete p.hint; o.changed(); });
        x.addEventListener('click', function() { places.splice(i, 1); redraw(); }); rw.appendChild(lb); rw.appendChild(ds); rw.appendChild(hn);
        // 1.6.2 (backlog 223, fold B): a card from a second deck tucked under this place's own, read before its words or after them
        var tk = pickBox('field sp-tuck', [['', 'Nothing tucked under it']].concat(dk.map(function(r) { return [r[0], 'Tuck under it: ' + r[1]]; })), p.tuck && dk.some(function(r) { return r[0] === p.tuck.deck; }) ? p.tuck.deck : '', 'A card from another deck that adds its words to this place, such as drowned before lighthouse');
        tk.addEventListener('change', function() { if (tk.value) p.tuck = { deck: tk.value, down: p.tuck && p.tuck.down === true ? true : undefined }; else delete p.tuck; if (p.tuck && !p.tuck.down) delete p.tuck.down; redraw(); }); rw.appendChild(tk);
        if (p.tuck) { var tw = pickBox('field sp-tuckway', [['', 'Read before its words'], ['down', 'Read after its words']], p.tuck.down === true ? 'down' : '', 'Where the tucked card\u2019s words go'); tw.addEventListener('change', function() { if (tw.value === 'down') p.tuck.down = true; else delete p.tuck.down; o.changed(); }); rw.appendChild(tw); }
        rw.appendChild(x); wrap.appendChild(rw);
    });
    if (places.length < PLACES_MAX) { var pa = btn('tool ghost sys-btn sp-placeadd', '+ Place', 'Another place in this spread'); pa.addEventListener('click', function() { places.push({ label: '' }); redraw(); }); var ft = el('div', 'dk-head'); ft.appendChild(pa); wrap.appendChild(ft); }
    host.appendChild(wrap);
}
if (typeof window !== 'undefined') window.wpDeckUi = { edit: edit, spreads: spreads };
export { edit, spreads };
