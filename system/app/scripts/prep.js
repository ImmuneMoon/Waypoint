/* The Prep column (1.6.2, backlog 107 (a); docs/PLANNER_ORG_DESIGN.md 4.4, its step 4).
   The owner, 2026-10-16, by prompt: "A Prep column (Recommended)": a column beside the map, opened from the rail or with a key, that follows
   the map and stays open until you close it. And 2026-11-11, by prompt on docs/sheets/prep-icons-sheet.html: the rail drawing "A. Column
   beside map (Recommended)" and the key "G, Shift+G for Spread (Recommended)", since N is Next token.

   It is the GM's, on this computer's own campaign, on the play map only: never on a player's app, in the stream window or in a window of
   its own. It reads the campaign's planners as they stand and draws their cards:
     Tonight       the planner marked Next: its lead line, then its scene cards in order
     Here          the place and the scenes whose Map is the map on screen
     People here   person cards whose Where is this map, then the tokens on it, then the room's characters
     Clues         clue cards of tonight's planner, of the pinned planners and of this map, not found first
     Around this map, Pinned, Recent   the Pages shelf's own lists, drawn by the shelf's own row
   Spread (its step 8; the owner's picks of 2026-11-11: the drawing "A. Three columns (Recommended)" and Shift+G) lays the same sections out
   wide over the left part of the map in three columns, The scene, People here, and Clues with Pinned, until Spread again or Esc. There a
   card's rows are a table again. A scene card whose table names tokens of this map offers Select them and Find, in both.
   It stores nothing in the campaign and sends nothing. Open, its width and its folds are this computer's own (wp_prep). The two ticks it
   offers, Played on a scene and Found on a clue, are the card's own ticks, set as the planner's editor sets them, with one save. A tick is taken back by pressing it
   again, and a scene then gets back the session it had: the play map's own undo holds the map's steps, never a planner's.

   The column is made with createElement and text nodes. A card's own fields are drawn through the planner's field renderer (docrender.js
   fmtRich, the page sanitiser's output), which is the one place markup is written here, in prepRich. It draws node blocks only. */
import { state } from './state.js';
import { uid, getActiveCampaign, getActiveMap } from './models.js';
import { save, toast } from './io.js';
import { navigateToMap } from './sidebar.js';
import * as CC from './cardcore.js';

// [prepcheck:core-start]
var PREP = { plans: 200, w: 320, wMin: 240, wMax: 560, spread: 1060, spreadGap: 120, fitPad: 220, fitMin: 0.2, here: 40, people: 40, fold: 8, clues: 40, find: 30, rows: 12, scenes: 60, text: 300 };
var PREP_ID = /^[A-Za-z0-9_-]{1,64}$/;
// A field as one line of plain words: its markup taken off (a tag that ends a line reads as a space, any other as nothing), the few entities
// an editor writes read, cut by whole characters. A < that opens no tag is a character of the words. A tag is read up to its own > and never
// past another <, so a field of many < with no > is read in one pass
function prepPlain(v, n) {
    if (typeof v !== 'string' || !v) return '';
    var s = v.length > 4000 ? v.slice(0, 4000) : v;
    s = s.replace(/<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|blockquote)\b[^<>]*>/gi, ' ').replace(/<\/?[a-zA-Z!][^<>]*>/g, '');
    s = s.replace(/&nbsp;|&#160;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi, "'").replace(/&amp;/gi, '&');
    s = s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(s).slice(0, n > 0 ? n : PREP.text).join('');
}
// A name or a note that is plain text already (a token's name and its GM note, a sheet's name, a room's character): its characters as they
// are, on one line. Nothing of it is markup, so a < or an & in it is a character of the words
function prepWords(v, n) { if (typeof v !== 'string' || !v) return ''; var s = (v.length > 4000 ? v.slice(0, 4000) : v).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim(); return Array.from(s).slice(0, n > 0 ? n : PREP.text).join(''); }
function prepFold(s) { var t = String(s == null ? '' : s); try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {} return t.toLowerCase().replace(/\s+/g, ' ').trim(); }
function prepOwn(o, k) { return !!o && typeof o === 'object' && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null; }
function prepTitle(it, word) { return prepPlain(it && it.meta && it.meta.title, 80) || word; }
// One card of a planner, as the column lists it: where it is (its planner, its block's id where that is one a landing takes, its place in
// the planner), what kind it is, its name and tag, a scene's session, its tick, and the map it names
function prepCard(pl, plTitle, b, i) {
    var kind = CC.cardKind(b), kd = CC.kindOf(b);
    return { pl: pl, plTitle: plTitle, at: typeof b.id === 'string' && PREP_ID.test(b.id) ? b.id : '', i: i, kind: kind, title: prepPlain(b.title, 120) || kd.word || 'Card', tag: prepPlain(b.tag, 40),
        s: CC.sessionOf(b), done: b.done === true && !!kd.tick, map: typeof b.linkMapId === 'string' ? b.linkMapId : '' };
}
function prepIsCard(b) { return !!b && typeof b === 'object' && b.type === 'node' && CC.cardKind(b) !== 'table'; }
// The block a card names, found again in the campaign as it stands: at its place, and by its id where it has one. Null where the planner
// changed under the column
function prepBlock(camp, c) {
    var it = c ? prepOwn(camp && camp.items, c.pl) : null, bl = it && it.type === 'planner' && Array.isArray(it.blocks) ? it.blocks : null; if (!bl) return null;
    var b = bl[c.i];
    if (prepIsCard(b) && (!c.at || b.id === c.at)) return b;
    if (c.at) for (var k = 0; k < bl.length; k++) if (prepIsCard(bl[k]) && bl[k].id === c.at) return bl[k];
    return null;
}
function prepPlanners(camp) { return Object.keys(camp.items).filter(function(id) { var it = camp.items[id]; return !!it && typeof it === 'object' && it.type === 'planner' && Array.isArray(it.blocks); }); }
// The planner's own strong start: its Lead text, else its One-line summary
function prepLead(it) {
    var bl = it.blocks, k, lede = '', one = '';
    for (k = 0; k < bl.length && !lede; k++) { var b = bl[k]; if (!b || typeof b !== 'object') continue; if (b.type === 'lede') lede = prepPlain(b.content, PREP.text); else if (b.type === 'oneline' && !one) one = prepPlain(b.content, PREP.text); }
    return lede || one;
}
function prepFirstSays(b) {
    var r = Array.isArray(b.rows) ? b.rows[0] : null; if (!r || typeof r !== 'object') return '';
    var q = prepPlain(r.col1, 80), a = prepPlain(r.col2, 160); return q && a ? q + ': ' + a : (a || q);
}
// A token's name: its own, else its sheet's. A name is compared at 80 characters wherever one is (a row, a card's title, a table's cell)
function prepTokName(w, ch) { return prepWords(w.charName || w.name, 80) || (ch && typeof ch === 'object' ? prepWords(ch.name, 80) : ''); }
// The tokens of a map that are no player's, by name: { folded name: [token ids] }. A scene card's table is read against it
function prepTokNames(map, chars) {
    var by = Object.create(null);
    (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).forEach(function(w) {
        if (!w || typeof w !== 'object' || !w.isChar || w.waiting || w.gmNoteFor || w.ownerId || typeof w.id !== 'string') return;
        var ch = typeof w.charId === 'string' ? prepOwn(chars, w.charId) : null; if (ch && ch.ownerId) return;
        var n = prepFold(prepTokName(w, ch)); if (!n) return;
        (by[n] = by[n] || []).push(w.id);
    });
    return by;
}
// The tokens a card's table names on that map: each row's first cell read as a name. The whole cell is looked up first, so "Fox 2" names the
// token Fox 2, and only where no token has that name is a count after it ("Raider x3", after a space) left out. Each token once, in the
// table's order, 60 at most
function prepToks(b, by) {
    var out = [], seen = Object.create(null);
    (b && Array.isArray(b.rows) ? b.rows : []).slice(0, 200).forEach(function(rw) {
        if (!rw || typeof rw !== 'object') return;
        var full = prepFold(prepPlain(rw.col1, 80)), n = full && by && Array.isArray(by[full]) ? full : full.replace(/\s*\u00d7\s*\d+$|\s+x\s*\d+$/, '').trim(), ids = n && by ? by[n] : null;
        (Array.isArray(ids) ? ids : []).forEach(function(id) { if (!seen[id] && out.length < 60) { seen[id] = 1; out.push(id); } });
    });
    return out;
}
// What the column shows for one map: { map, tonight, here, people, rows, more, clues }. o.pinned: the ids of the pinned pages (their clues
// are listed). o.keep: the planner the column kept as tonight's, or none. Nothing here is kept: it is worked out from the campaign each time
function prepModel(camp, mapId, o) {
    var m = { map: null, tonight: null, here: [], people: [], rows: [], clues: [] };
    if (!camp || !camp.items || typeof camp.items !== 'object') return m;
    var map = prepOwn(camp.items, mapId); if (!map || typeof map !== 'object' || map.type !== 'map') map = null;
    if (map) m.map = { id: mapId, title: prepTitle(map, 'Map') };
    var planners = prepPlanners(camp), nextId = planners.filter(function(id) { var mt = camp.items[id].meta; return !!mt && mt.status === 'next'; })[0] || '';
    // with no planner marked Next: the planner the column kept as tonight's (o.keep: its Tonight scene was ticked as played in the column, and
    // that tick must stay in reach to be taken off again), else the first that holds a scene marked Tonight, as the shelf's Next scene row has it
    if (!nextId && o && typeof o.keep === 'string' && o.keep && planners.indexOf(o.keep) >= 0) nextId = o.keep;
    if (!nextId) nextId = planners.filter(function(id) { return camp.items[id].blocks.some(function(b) { return prepIsCard(b) && CC.cardKind(b) === 'scene' && CC.sessionOf(b) === 'tonight'; }); })[0] || '';
    var pinned = Object.create(null); (o && Array.isArray(o.pinned) ? o.pinned : []).forEach(function(id) { if (typeof id === 'string') pinned[id] = 1; });
    var bySheet = Object.create(null), byName = Object.create(null), persons = [], places = [], scenes = [], clues = [], tokBy = prepTokNames(map, camp.chars && typeof camp.chars === 'object' ? camp.chars : null);
    planners.forEach(function(pid) {
        var it = camp.items[pid], title = prepTitle(it, 'Planner'), isNext = pid === nextId, tn = isNext ? { id: pid, title: title, lead: prepLead(it), scenes: [] } : null;
        it.blocks.forEach(function(b, i) {
            if (!prepIsCard(b)) return;
            var c = prepCard(pid, title, b, i), here = !!map && c.map === mapId;
            if (here) c.here = true;
            if (c.kind === 'scene') {
                if (here) { var nTok = prepToks(b, tokBy).length; if (nTok) c.toks = nTok; }   // a fight card: how many tokens of this map its table names
                if (tn && tn.scenes.length < PREP.scenes) { var on = c.map ? prepOwn(camp.items, c.map) : null; tn.scenes.push(Object.assign({ where: here ? '' : (on && on.type === 'map' ? prepTitle(on, 'Map') : '') }, c)); }
                if (here) scenes.push(c);
            } else if (c.kind === 'place') { if (here) places.push(c); }
            else if (c.kind === 'person') {
                if (here) {   // a card here speaks for a room's character of its name, and for a token of its name where it can be the same one (below)
                    persons.push(c);
                    [prepPlain(b.title, 80)].concat((CC.cleanAka(b.aka) || []).map(function(a) { return prepWords(a, 80); })).forEach(function(nm) { var k = prepFold(nm); if (k) (byName[k] = byName[k] || []).push({ c: c, sheet: typeof b.sheet === 'string' ? b.sheet : '' }); });
                }
                if (typeof b.sheet === 'string' && b.sheet && (!bySheet[b.sheet] || (here && !bySheet[b.sheet].c.here))) bySheet[b.sheet] = { c: c, wants: prepPlain(b.must, 160), says: prepFirstSays(b) };
            } else if (c.kind === 'clue') { if (isNext || pinned[pid] || here) { c.to = prepPlain(b.must, 120); clues.push(c); } }
        });
        if (tn) m.tonight = tn;
    });
    m.here = places.concat(scenes).slice(0, PREP.here);
    m.people = persons.slice(0, PREP.people);
    m.clues = clues.filter(function(c) { return !c.done; }).concat(clues.filter(function(c) { return c.done; })).slice(0, PREP.clues);
    // the tokens on this map that are no player's, one row a name; then the characters its rooms list that have no token here
    var listed = Object.create(null); persons.forEach(function(c) { listed[c.pl + '/' + c.i] = 1; });
    var groups = Object.create(null), order = [], refs = Object.create(null), names = Object.create(null), chars = camp.chars && typeof camp.chars === 'object' ? camp.chars : null;
    // a player's character is no one to prep: its token is passed over, and its name is one a room's list is not asked for either
    if (chars) Object.keys(chars).forEach(function(id) { var pc = chars[id]; if (pc && typeof pc === 'object' && pc.ownerId && typeof pc.name === 'string') { var pn = prepFold(prepWords(pc.name, 80)); if (pn) names[pn] = 1; } });
    (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).forEach(function(w) {
        if (!w || typeof w !== 'object' || !w.isChar || w.waiting || w.gmNoteFor || typeof w.id !== 'string') return;
        var sheet = typeof w.charId === 'string' ? w.charId : '', ch = sheet ? prepOwn(chars, sheet) : null;
        if (w.ownerId || (ch && ch.ownerId)) { var own = prepFold(prepWords(w.charName || w.name, 80)); if (own) names[own] = 1; if (typeof w.charRef === 'string') refs[w.charRef] = 1; return; }
        if (typeof w.charRef === 'string') refs[w.charRef] = 1;
        var named = prepTokName(w, ch), name = named || 'Unnamed', key = sheet + ' ' + prepFold(name), note = typeof w.gmInfo === 'string' ? prepWords(w.gmInfo.split(/\r?\n/)[0], 160) : '';
        if (!groups[key]) { groups[key] = { name: name, anon: !named, sheet: sheet, n: 0, hid: 0, tok: w.id, note: '' }; order.push(key); names[prepFold(name)] = 1; }
        var g = groups[key]; g.n++; if (w.hidden) g.hid++; if (!g.note && note) g.note = note;
    });
    var rows = [];
    order.forEach(function(key) {
        var g = groups[key], hit = g.sheet ? bySheet[g.sheet] : null;
        // no card names its sheet: the person card here that goes by its name, where that card names no sheet or this very one. A card that names
        // another sheet is another one of that name (two Guards), and a token with no name of its own goes by no name
        if (!hit && !g.anon) { var byN = (byName[prepFold(g.name)] || []).filter(function(x) { return !x.sheet || x.sheet === g.sheet; })[0]; if (byN) hit = { c: byN.c, wants: '', says: '' }; }
        if (hit && listed[hit.c.pl + '/' + hit.c.i]) return;   // its card stands above already
        if (hit) rows.push({ t: 'tok', name: g.name, n: g.n, small: hit.c.tag || 'has a card', line: hit.wants ? 'Wants: ' + hit.wants : '', line2: hit.says, tok: g.tok, hid: g.hid === g.n, card: { pl: hit.c.pl, at: hit.c.at, i: hit.c.i } });
        else rows.push({ t: 'tok', name: g.name, n: g.n, small: g.hid === g.n ? 'hidden' : (g.n > 1 ? 'tokens' : 'token'), line: g.note ? 'GM note: ' + g.note : '', line2: '', tok: g.tok, hid: g.hid === g.n, make: !g.anon || !!(g.sheet && prepOwn(chars, g.sheet)) });   // make: no card names it yet, and a card made from it can be told as its own (by its name, or by its sheet)
    });
    (map && Array.isArray(map.rooms) ? map.rooms : []).forEach(function(rm) {
        if (!rm || typeof rm !== 'object' || !Array.isArray(rm.characters)) return;
        rm.characters.forEach(function(e) {
            if (!e || typeof e !== 'object' || (typeof e.id === 'string' && refs[e.id])) return;
            var name = prepWords(e.name, 80); if (!name || names[prepFold(name)] || byName[prepFold(name)]) return;   // a token's, a player's, or a person card's here
            names[prepFold(name)] = 1;
            rows.push({ t: 'room', name: name, n: 1, small: prepWords(rm.name, 40) || 'the room', line: typeof e.info === 'string' ? prepWords(e.info.split(/\r?\n/)[0], 160) : '', line2: '', make: true });
        });
    });
    m.rows = rows.slice(0, PREP.people);
    return m;
}
// Find a card: every card of the campaign's planners whose words hold each word typed. words(b): a block's words, folded (the Pages shelf's
// own reader, handed in); with none, the card's name, tag and lead line. mapId: the column's map, so that a found card that plays on it says so
function prepFind(camp, q, words, mapId) {
    var want = prepFold(q).split(' ').filter(Boolean).slice(0, 8), out = []; if (!want.length || !camp || !camp.items || typeof camp.items !== 'object') return out;
    var map = typeof mapId === 'string' && mapId ? prepOwn(camp.items, mapId) : null, tokBy = map && typeof map === 'object' && map.type === 'map' ? prepTokNames(map, camp.chars && typeof camp.chars === 'object' ? camp.chars : null) : null;
    prepPlanners(camp).forEach(function(pid) {
        var it = camp.items[pid], title = prepTitle(it, 'Planner');
        it.blocks.forEach(function(b, i) {
            if (out.length >= PREP.find || !prepIsCard(b)) return;
            var t = typeof words === 'function' ? String(words(b) || '') : prepFold([prepPlain(b.title, 200), prepPlain(b.tag, 80), prepPlain(b.must, 300)].join(' '));
            if (!want.every(function(w) { return t.indexOf(w) >= 0; })) return;
            var c = prepCard(pid, title, b, i);
            if (tokBy && c.map === mapId) { c.here = true; if (c.kind === 'scene') { var nTok = prepToks(b, tokBy).length; if (nTok) c.toks = nTok; } }   // as the card says under Here
            out.push(c);
        });
    });
    return out;
}
// Make a card: the person card a token or a room's character becomes. Its name and its note are words, and a card's field reads typed
// markup, so a < that would open a tag and an & that would open an entity are written as the characters they are; any other text is kept
// as typed. src: { name, note, sheet, map }; id: the new block's id. The note, where there is one, is the card's
// first row, under Note
function prepEsc(v, n) { var s = String(v == null ? '' : v).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim(); s = Array.from(s).slice(0, n > 0 ? n : PREP.text).join(''); return s.replace(/&(?=[a-zA-Z#])/g, '&amp;').replace(/<(?=[a-zA-Z\/!?])/g, '&lt;'); }
function prepNewCard(src, id) {
    var o = src && typeof src === 'object' ? src : {}, name = prepEsc(typeof o.name === 'string' ? o.name : '', 120) || 'Unnamed', note = typeof o.note === 'string' ? prepEsc(o.note.split(/\r?\n/).slice(0, 3).join(' '), PREP.text) : '';
    var b = { id: id, type: 'node', mode: 'person', title: name };
    if (typeof o.map === 'string' && o.map && o.map.length <= 200) b.linkMapId = o.map;   // the map's own key in the campaign, as it is: the card is one of that map's only by that very key
    if (typeof o.sheet === 'string' && PREP_ID.test(o.sheet)) b.sheet = o.sheet;
    b.rows = note ? [{ col1: 'Note', col2: note, col3: '' }] : [];
    return b;
}
// The planners a card may be made in, in the order offered: tonight's, the pinned ones, those that already hold a card of this map, then
// the rest by name. { id, title, why } each, PREP.plans at most (the menu says how many it left out)
function prepPlannersFor(camp, m, pinned) {
    if (!camp || !camp.items || typeof camp.items !== 'object') return [];
    var ids = prepPlanners(camp), seen = Object.create(null), out = [], put = function(id, why) { if (typeof id !== 'string' || seen[id] || ids.indexOf(id) < 0 || out.length >= PREP.plans) return; seen[id] = 1; out.push({ id: id, title: prepTitle(camp.items[id], 'Planner'), why: why }); };
    if (m && m.tonight) put(m.tonight.id, 'tonight');
    (Array.isArray(pinned) ? pinned : []).forEach(function(id) { put(id, 'pinned'); });
    if (m) (m.here || []).concat(m.people || []).forEach(function(c) { put(c.pl, 'plays here'); });
    ids.slice().sort(function(a, b) { var x = prepFold(prepTitle(camp.items[a], 'Planner')), y = prepFold(prepTitle(camp.items[b], 'Planner')); return x < y ? -1 : x > y ? 1 : 0; }).forEach(function(id) { put(id, ''); });
    return out;
}
// What is kept for this computer, read back as data: { open, w, shut: { section: 1 } }
var PREP_SECS = ['tonight', 'here', 'people', 'clues', 'around', 'pinned', 'recent'], PREP_SHUT = { around: 1, pinned: 1, recent: 1 };
function prepKept(raw) {
    var o = null, out = { open: false, w: PREP.w, shut: Object.assign({}, PREP_SHUT) };
    try { o = typeof raw === 'string' && raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    out.open = o.open === true;
    if (typeof o.w === 'number' && isFinite(o.w)) out.w = Math.max(PREP.wMin, Math.min(PREP.wMax, Math.round(o.w)));
    if (o.shut && typeof o.shut === 'object' && !Array.isArray(o.shut)) PREP_SECS.forEach(function(k) { if (Object.prototype.hasOwnProperty.call(o.shut, k)) { if (o.shut[k] === true) out.shut[k] = 1; else if (o.shut[k] === false) delete out.shut[k]; } });
    return out;
}
function prepKeep(st) { var shut = {}; PREP_SECS.forEach(function(k) { shut[k] = st.shut[k] === 1; }); return JSON.stringify({ open: st.open === true, w: st.w, shut: shut }); }
// [prepcheck:core-end]

// [prepcheck:draw-start]
function prepEl(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null && text !== '') e.appendChild(document.createTextNode(String(text))); return e; }
function prepBtn(cls, text, tip) { var b = prepEl('button', cls, text); b.type = 'button'; if (tip) b.title = tip; return b; }
// A card's own field, drawn as the planner draws it: through the planner's field renderer, whose answer is the page sanitiser's. This is
// the one statement of the module that writes markup. Where the renderer is not at hand the field is its plain words
function prepRich(el, text, fmt) {
    var DR = typeof window !== 'undefined' ? window.wpDocRender : null;
    if (DR && typeof DR.fmtRich === 'function' && typeof text === 'string') el.innerHTML = DR.fmtRich(text, fmt);
    else el.appendChild(document.createTextNode(prepPlain(text, 600)));
    return el;
}
function prepFmt(b, key) { var DR = typeof window !== 'undefined' ? window.wpDocRender : null; return DR && typeof DR.fieldFmt === 'function' ? DR.fieldFmt(b, key) : undefined; }
function prepCellFmt(b, ri, ci) { var DR = typeof window !== 'undefined' ? window.wpDocRender : null; return DR && typeof DR.cellFmtOf === 'function' ? DR.cellFmtOf(b, ri, ci) : undefined; }
function prepKey(c) { return c.pl + '/' + (c.at || c.i); }
function prepRef(el, c) { el.dataset.pl = c.pl; el.dataset.i = String(c.i); if (c.at) el.dataset.at = c.at; return el; }
function prepTick(c, word) {
    var t = prepBtn('prep-tick' + (c.done || c.s === 'played' ? ' on' : ''), '', (c.done || c.s === 'played') ? word + '. Press to take the tick off.' : 'Mark as ' + word.toLowerCase());
    t.setAttribute('aria-pressed', c.done || c.s === 'played' ? 'true' : 'false'); t.setAttribute('aria-label', word); return prepRef(t, c);
}
// One card: its head (a press opens or folds it), its tick, and when open its lead line, its rows and its foot. Its rows are stacked lines
// in the column and, where the column is spread wide, a table again under its column names. A scene card whose table names tokens of this
// map says how many and offers Select them and Find
function prepCardEl(camp, c, open, pinnedPl, wide) {
    var b = prepBlock(camp, c), kd = b ? CC.kindOf(b) : null, card = prepEl('div', 'prep-card' + (c.here ? ' here' : '') + (open ? '' : ' shut') + (c.done || c.s === 'played' ? ' done' : ''));
    card.dataset.key = prepKey(c);
    var head = prepEl('div', 'prep-card-top'), h = prepBtn('prep-card-h', '', open ? 'Fold this card' : 'Open this card'); h.setAttribute('aria-expanded', open ? 'true' : 'false'); h.dataset.key = prepKey(c);
    h.appendChild(prepEl('span', 'prep-fa'));
    if (kd && kd.ico) { var ic = prepEl('i', 'wib ' + kd.ico); ic.title = kd.label; h.appendChild(ic); }
    var t = prepEl('span', 'prep-t'); if (b && typeof b.title === 'string' && b.title) prepRich(t, b.title, prepFmt(b, 'title')); else t.appendChild(document.createTextNode(c.title)); h.appendChild(t);
    if (c.tag) h.appendChild(prepEl('span', 'prep-tag', c.tag));
    if (c.s === 'tonight' || c.s === 'ahead') h.appendChild(prepEl('span', 'prep-when prep-when-' + c.s, c.s === 'tonight' ? 'Tonight' : 'Ahead'));
    head.appendChild(h);
    if (kd && kd.tick) head.appendChild(prepTick(c, kd.tick));
    card.appendChild(head);
    if (!open || !b) return card;
    var body = prepEl('div', 'prep-card-b');
    if (b.must) { var lead = prepEl('p', 'prep-lead'); lead.appendChild(prepEl('b', '', kd.must + ':')); lead.appendChild(document.createTextNode(' ')); lead.appendChild(prepRich(prepEl('span'), b.must, prepFmt(b, 'must'))); body.appendChild(lead); }
    var aka = CC.cleanAka(b.aka); if (aka) body.appendChild(prepEl('p', 'prep-aka', 'Also known as: ' + aka.join(', ')));
    var rows = Array.isArray(b.rows) ? b.rows : [], cols = Array.isArray(b.cols) && b.cols.length ? b.cols : kd.cols;
    if (wide === true && rows.length) {
        var tb = prepEl('table', 'prep-tbl'), hd = prepEl('thead'), hr = prepEl('tr'), bd = prepEl('tbody');
        cols.forEach(function(cn) { hr.appendChild(prepEl('th', '', prepPlain(cn, 40))); });
        rows.slice(0, PREP.rows).forEach(function(rw, ri) {
            if (!rw || typeof rw !== 'object') return;
            var tr = prepEl('tr'), any = false; cols.forEach(function(cn, ci) { var v = rw['col' + (ci + 1)], td = prepEl('td'); if (typeof v === 'string' && v) { prepRich(td, v, prepCellFmt(b, ri, ci)); any = true; } tr.appendChild(td); });
            if (any) bd.appendChild(tr);   // a row with no cell is drawn nowhere, as the stacked lines have it
        });
        if (bd.childNodes.length) { hd.appendChild(hr); tb.appendChild(hd); tb.appendChild(bd); body.appendChild(tb); }
    } else rows.slice(0, PREP.rows).forEach(function(r, ri) {
        if (!r || typeof r !== 'object') return;
        var row = prepEl('div', 'prep-srow'), any = false;
        cols.forEach(function(cn, ci) {
            var v = r['col' + (ci + 1)]; if (typeof v !== 'string' || !v) return;
            if (!any) { row.appendChild(prepRich(prepEl('b'), v, prepCellFmt(b, ri, ci))); any = true; return; }
            row.appendChild(prepEl('i', '', prepPlain(cn, 40))); row.appendChild(prepRich(prepEl('span'), v, prepCellFmt(b, ri, ci)));
        });
        if (any) body.appendChild(row);
    });
    if (rows.length > PREP.rows) body.appendChild(prepEl('p', 'prep-more', (rows.length - PREP.rows) + ' more rows in the page'));
    if (c.toks > 0) {
        var fl = prepEl('div', 'prep-fight'), fa = prepRef(prepBtn('prep-fb prep-findall', '', 'Bring them into view on the map, selected'), c);
        var fn = prepEl('span', 'prep-fight-n', prepCount(c.toks, 'token', 'tokens') + ' here'); fn.title = 'The tokens on this map that this card names in the first cell of a row'; fl.appendChild(fn);
        fl.appendChild(prepRef(prepBtn('prep-fb prep-sel', 'Select them', 'Select the tokens on this map that its table names'), c));
        fa.appendChild(prepEl('i', 'wib wi-marker')); fa.appendChild(document.createTextNode(' Find')); fl.appendChild(fa);
        body.appendChild(fl);
    }
    var foot = prepEl('div', 'prep-foot'), op = prepRef(prepBtn('prep-fb prep-open', '', 'Open the planner at this card. Over the map by a click, Ctrl+click a new window, Alt+click the page itself.'), c);
    op.appendChild(prepEl('i', 'wib wi-page')); op.appendChild(document.createTextNode(' Open in page')); foot.appendChild(op);
    var win = prepRef(prepBtn('prep-fb prep-win wib wi-dup', '', 'Open this card alone in a window of its own'), c); win.setAttribute('aria-label', 'Open this card in a window of its own'); foot.appendChild(win);
    var pin = prepRef(prepBtn('prep-fb prep-pin wib wi-pin' + (pinnedPl ? ' on' : ''), '', pinnedPl ? 'Its planner is pinned for the session. Press to unpin.' : 'Pin its planner for the session'), c); pin.setAttribute('aria-pressed', pinnedPl ? 'true' : 'false'); pin.setAttribute('aria-label', 'Pin its planner'); foot.appendChild(pin);
    if ((c.kind === 'person' || c.kind === 'place') && c.at) {
        var mi = prepBtn('prep-fb pv-ment', '', 'The pages and scenes that name this card. Press one to open it there.'); mi.dataset.page = c.pl; mi.dataset.at = c.at; mi.dataset.say = 'Mentioned in\u2026';
        mi.setAttribute('aria-label', 'Mentioned in'); mi.setAttribute('aria-haspopup', 'menu'); mi.setAttribute('aria-expanded', 'false'); foot.appendChild(mi);
    }
    foot.appendChild(prepEl('span', 'prep-sp')); foot.appendChild(prepEl('span', 'prep-from', c.plTitle));
    body.appendChild(foot); card.appendChild(body);
    return card;
}
// A section: its fold (a button that says whether it is open) and, while open, its body
function prepSec(root, key, name, small, shut, fill) {
    var sec = prepEl('div', 'prep-sec'), f = prepBtn('prep-fold', '', shut ? 'Open ' + name : 'Fold ' + name); f.dataset.sec = key; f.setAttribute('aria-expanded', shut ? 'false' : 'true');
    f.appendChild(prepEl('span', 'prep-fa')); f.appendChild(prepEl('span', 'prep-fn', name)); if (small) f.appendChild(prepEl('small', '', small));
    sec.appendChild(f);
    if (!shut) { var box = prepEl('div', 'prep-sec-b'); fill(box); sec.appendChild(box); }
    root.appendChild(sec);
    return sec;
}
function prepCount(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
// The whole column body. st: { shut, cards, all, q, spread }; x: { pinned: { planner id: 1 }, pinList: the pinned pages' ids in order, shelf: the
// Pages shelf's model or null, row: its row drawer or null, found: the cards Find a card found, or null }
function prepDraw(root, camp, m, st, x) {
    root.textContent = '';
    // Spread wide, the sections stand in three columns: the scene (Tonight, Here, Around this map), People here, and Clues with Pinned and
    // Recent. Every card of Here and of People here is then open until it is folded, and a card's rows are a table
    var wide = st.spread === true, spc = wide ? [prepEl('div', 'prep-spc'), prepEl('div', 'prep-spc'), prepEl('div', 'prep-spc')] : null, colOf = function(k) { return spc ? spc[k] : root; };
    var pins = (x && x.pinned) || {}, cardIn = function(box, c, first) { var k = prepKey(c), open = st.cards[k] === undefined ? !!first : st.cards[k] === true; box.appendChild(prepCardEl(camp, c, open, !!pins[c.pl], wide)); };
    if (x && x.found) {
        prepSec(root, 'found', 'Cards that hold the words', prepCount(x.found.length, 'card', 'cards'), false, function(box) {
            if (!x.found.length) box.appendChild(prepEl('p', 'prep-none', 'No card holds those words. Ctrl+K looks in every page.'));
            x.found.forEach(function(c) { cardIn(box, c, x.found.length === 1); });
        });
        return root;
    }
    // The Pages shelf files a page once, in the first list it belongs to. The column reads every list of it: a page of this map that is no
    // card stands under Here, tonight's planner under Tonight, and Pinned holds every pinned page wherever the shelf filed it
    var sh = x && x.shelf, rowOf = x && x.row, byId = Object.create(null), hereRows = [];
    if (sh) {
        (sh.where || []).forEach(function(w) { ((w && w.rows) || []).forEach(function(rw) { if (!rw || typeof rw.id !== 'string') return; if (!byId[rw.id]) byId[rw.id] = rw; if (w.here) hereRows.push(rw); }); });
        [sh.next, sh.pinned, sh.recent].forEach(function(l) { (l || []).forEach(function(rw) { if (rw && typeof rw.id === 'string' && !byId[rw.id]) byId[rw.id] = rw; }); });
    }
    var carded = Object.create(null); m.here.concat(m.people).forEach(function(c) { carded[c.pl] = 1; });
    var herePages = hereRows.filter(function(rw) { return !carded[rw.id]; });
    var pinRows = x && Array.isArray(x.pinList) ? x.pinList.map(function(id) { return typeof id === 'string' ? byId[id] : null; }).filter(Boolean) : ((sh && sh.pinned) || []);
    var pagesIn = function(box, rows) { if (typeof rowOf !== 'function' || !rows.length) return; var pb = prepEl('div', 'page-shelf prep-shelf prep-pages'); rows.forEach(function(rw) { pb.appendChild(rowOf(rw, false)); }); box.appendChild(pb); };
    var tn = m.tonight;
    prepSec(colOf(0), 'tonight', 'Tonight', tn ? tn.title : '', st.shut.tonight === 1, function(box) {
        if (!tn) { box.appendChild(prepEl('p', 'prep-none', 'No planner is marked Next. Open the planner for tonight and pick Next in its Status list, or set one of its scenes to Tonight.')); return; }
        if (tn.lead) box.appendChild(prepEl('p', 'prep-leadline', tn.lead));
        if (!tn.scenes.length) { box.appendChild(prepEl('p', 'prep-none', 'This planner has no scene card yet.')); pagesIn(box, byId[tn.id] ? [byId[tn.id]] : []); return; }
        var ol = prepEl('ol', 'prep-steps');
        tn.scenes.forEach(function(c, k) {
            var li = prepEl('li', (c.s === 'played' ? 'done' : '') + (c.here ? ' now' : '')), sn = prepTick(c, 'Played'); sn.className = 'prep-sn' + (c.s === 'played' ? ' on' : ''); if (c.s !== 'played') sn.appendChild(document.createTextNode(String(k + 1)));
            var go = prepRef(prepBtn('prep-step', '', 'Open the planner at this scene'), c); go.appendChild(prepEl('span', 'prep-step-t', c.title));
            var sm = c.here ? 'here' : (c.s === 'tonight' ? 'tonight' : c.where || c.tag); if (sm) go.appendChild(prepEl('small', '', sm));
            li.appendChild(sn); li.appendChild(go); ol.appendChild(li);
        });
        box.appendChild(ol);
        pagesIn(box, byId[tn.id] ? [byId[tn.id]] : []);   // the planner itself, as the shelf's own row: over the map, a window of its own, its pin
    });
    var nP = m.here.filter(function(c) { return c.kind === 'place'; }).length, nS = m.here.length - nP;
    prepSec(colOf(0), 'here', 'Here', m.here.length ? [nP ? prepCount(nP, 'place', 'places') : '', nS ? prepCount(nS, 'scene', 'scenes') : ''].filter(Boolean).join(', ') : '', st.shut.here === 1, function(box) {
        if (!m.here.length && !herePages.length) box.appendChild(prepEl('p', 'prep-none', m.map ? 'No card names this map yet. In a planner, pick this map under Map on a place or a scene card.' : 'No map is on screen.'));
        m.here.forEach(function(c, k) { cardIn(box, c, wide || k === 0); });
        pagesIn(box, herePages);   // a page pinned to a piece of this map, its scene page, a planner whose node here is no card
    });
    var nPpl = m.people.length + m.rows.length;
    prepSec(colOf(1), 'people', 'People here', nPpl ? String(nPpl) : '', st.shut.people === 1, function(box) {
        if (!nPpl) { box.appendChild(prepEl('p', 'prep-none', 'Nobody yet. A person card whose Where is this map shows here, and so does a token on it.')); return; }
        m.people.forEach(function(c) { cardIn(box, c, wide); });
        var show = st.all === true ? m.rows : m.rows.slice(0, Math.max(0, PREP.fold - m.people.length));
        show.forEach(function(r) {
            var pp = prepEl('div', 'prep-pp' + (r.hid ? ' hid' : '')), tx = prepEl('span', 'prep-tx'), nm = prepEl('span', 'prep-nm', r.name + (r.n > 1 ? ' \u00d7' + r.n : ''));
            if (r.small) nm.appendChild(prepEl('small', '', r.small)); tx.appendChild(nm);
            if (r.line) tx.appendChild(prepEl('span', 'prep-ln', r.line)); if (r.line2) tx.appendChild(prepEl('span', 'prep-ln', r.line2));
            pp.appendChild(tx);
            if (r.card) { var cb = prepBtn('prep-chip', 'Card', 'Open this person\u2019s card'); cb.dataset.pl = r.card.pl; cb.dataset.i = String(r.card.i); if (r.card.at) cb.dataset.at = r.card.at; pp.appendChild(cb); }
            if (r.make === true) { var mk = prepBtn('prep-chip prep-make', 'Make a card', 'Make a person card for ' + r.name + ' in a planner you pick, with this name and note'); mk.dataset.t = r.t; mk.dataset.name = r.name; if (r.tok) mk.dataset.tok = r.tok; mk.setAttribute('aria-haspopup', 'menu'); pp.appendChild(mk); }
            if (r.tok) { var fb = prepBtn('prep-ib prep-findtok wib wi-marker', '', 'Find on the map'); fb.setAttribute('aria-label', 'Find ' + r.name + ' on the map'); fb.dataset.tok = r.tok; pp.appendChild(fb); }
            box.appendChild(pp);
        });
        if (show.length < m.rows.length) { var more = prepBtn('prep-all', 'Show ' + (m.rows.length - show.length) + ' more', 'Show everyone on this map'); box.appendChild(more); }
    });
    var open = m.clues.filter(function(c) { return !c.done; }).length;
    prepSec(colOf(2), 'clues', 'Clues', m.clues.length ? (open ? open + ' not found' : 'all found') : '', st.shut.clues === 1, function(box) {
        if (!m.clues.length) { box.appendChild(prepEl('p', 'prep-none', 'No clue yet. Clue cards of tonight\u2019s planner, of your pinned planners and of this map show here.')); return; }
        m.clues.forEach(function(c) {
            var cl = prepEl('div', 'prep-cl' + (c.done ? ' found' : '')), go = prepRef(prepBtn('prep-clue', '', 'Open the planner at this clue'), c);
            go.appendChild(prepEl('span', 'prep-clue-t', c.title)); if (c.to) go.appendChild(prepEl('small', '', 'Points to ' + c.to));
            cl.appendChild(prepTick(c, 'Found')); cl.appendChild(go); box.appendChild(cl);
        });
    });
    if (sh && typeof rowOf === 'function') {
        var around = []; (sh.where || []).forEach(function(w) { if (w && !w.here) (w.rows || []).forEach(function(r) { around.push(r); }); });
        [['around', 'Around this map', around], ['pinned', 'Pinned', pinRows], ['recent', 'Recent', sh.recent || []]].forEach(function(l) {
            prepSec(colOf(l[0] === 'around' ? 0 : 2), l[0], l[1], l[2].length ? String(l[2].length) : '', st.shut[l[0]] === 1, function(box) {
                box.className += ' page-shelf prep-shelf';
                if (!l[2].length) box.appendChild(prepEl('p', 'prep-none', l[0] === 'around' ? 'No planner plays on the maps this one is nested in.' : l[0] === 'pinned' ? 'Nothing is pinned. Pin a page from its right-click menu in the left panel.' : 'No page opened yet.'));
                l[2].forEach(function(r) { box.appendChild(rowOf(r, false)); });
            });
        });
    }
    if (spc) spc.forEach(function(e) { root.appendChild(e); });
    return root;
}
// [prepcheck:draw-end]

/* ---------- the column itself: this computer's state, when it shows, its presses ---------- */
var STORE = 'wp_prep';
var st = { open: false, w: PREP.w, shut: Object.assign({}, PREP_SHUT), cards: {}, all: false, q: '', hold: '', spread: false }, _sig = '', _was = false, _soon = 0, _findT = 0;
var _tn = { camp: '', id: '' };   // the planner the column last showed as tonight's, and the campaign it is of
function log(step, facts) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('prep v1', step, facts || {}); } catch (e) {} }
function els() { return { col: document.getElementById('prepCol'), body: document.getElementById('prepBody'), rail: document.getElementById('railPrep'), map: document.getElementById('prepMap'), sub: document.getElementById('prepSub'), hold: document.getElementById('prepHoldBtn'), spread: document.getElementById('prepSpreadBtn'), find: document.getElementById('prepFind') }; }
function keep() { try { localStorage.setItem(STORE, prepKeep(st)); } catch (e) {} }
// Whose it is: the GM, on this computer's own campaign, in the app's own window. Planners are nowhere else
function prepMay() {
    var n = window.wpNet; if (window.wpStream || window.wpPopout || !getActiveCampaign()) return false;
    if (n && (n.foreign || (n.active && n.role === 'client'))) return false;
    return typeof window.wpCanPersistLocal === 'function' ? window.wpCanPersistLocal() === true : false;
}
function playNow() { var fl = window.wpFloats; return !!fl && typeof fl.view === 'function' && fl.view() === 'play'; }
// Why it cannot open now, in words, or true
function prepCan() {
    if (!prepMay()) return 'Prep is the GM\u2019s, on a campaign of your own.';
    if (!playNow()) return 'Prep opens on the play map.';
    return true;
}
function shownNow() { return st.open && prepMay() && playNow() && !document.body.classList.contains('no-map'); }
// The map the column is about: the one held, while it is still a map of this campaign, else the one on screen
function mapNow(camp) {
    var held = st.hold ? prepOwn(camp.items, st.hold) : null; if (held && held.type === 'map') return st.hold;
    st.hold = ''; var am = getActiveMap(); return am && am.type === 'map' && typeof am.id === 'string' ? am.id : '';
}
// What moves when the column takes or gives room: the rulers, the grid's own lines, where the map's area begins, the bar and the boxes.
// The toolbar, the fog and the strips follow the map's box by themselves
function relaid() {
    setTimeout(function() {
        try { if (window.wpRenderRulers) window.wpRenderRulers(); if (window.wpGridSync) window.wpGridSync(); if (window.wpRowHide) window.wpRowHide.fit(); if (window.wpFitBar) window.wpFitBar(); if (window.wpFloats && window.wpFloats.fitAll) window.wpFloats.fitAll(); } catch (e) {}
    }, 0);
}
// [prepcheck:found-start]
var _fq = { key: '', at: 0, list: null };
// Find a card reads every card of every planner. What it found is kept for a moment, for the same words over the same planners (each by when
// it was last changed and how many blocks it holds), so a redraw of the page that changed no planner reads nothing again
function foundNow(camp, q, PS, mapId) {
    var key = q + '\n' + (mapId || '') + '\n' + prepPlanners(camp).map(function(id) { var it = camp.items[id]; return id + ':' + ((it.meta && it.meta.updated) || 0) + ':' + it.blocks.length; }).join(','), now = Date.now();
    if (_fq.list && _fq.key === key && now - _fq.at >= 0 && now - _fq.at < 2500) return _fq.list;
    _fq = { key: key, at: now, list: prepFind(camp, q, PS && typeof PS.words === 'function' ? PS.words : null, mapId) };
    return _fq.list;
}
// [prepcheck:found-end]
// [prepcheck:seat-start]
// The left panel's fold arrow stands at the left panel's own edge: in the map's area as the page has it, and at the column's left edge
// while the column shows, since the map's area then begins a column further right
function arrowSeat(E, on) {
    var tg = document.getElementById('toggleLeftBtn'), main = document.getElementById('main'); if (!tg || !main || !E.col) return;
    if (tg.parentNode === (on ? E.col : main)) return;
    if (on) { E.col.appendChild(tg); return; }
    var rb = document.getElementById('toggleRightBtn'); main.insertBefore(tg, rb && rb.parentNode === main ? rb : main.firstChild);
}
// [prepcheck:seat-end]
function draw(force) {
    var E = els(), camp = getActiveCampaign(); if (!E.col || !E.body || !camp) return;
    var PS = window.wpPageShelf, mapId = mapNow(camp), pinList = PS && typeof PS.pinned === 'function' ? PS.pinned() : [], pinned = {}; pinList.forEach(function(id) { pinned[id] = 1; });
    var keepId = _tn.camp === camp.id && _tn.id && tnKept(camp).indexOf(_tn.id) >= 0 ? _tn.id : '';
    var m = prepModel(camp, mapId, { pinned: pinList, keep: keepId }), q = st.q.trim(), found = q ? foundNow(camp, q, PS, mapId) : null;
    if (!q) _fq.list = null;
    _tn = { camp: camp.id, id: m.tonight ? m.tonight.id : '' };
    var shelf = PS && typeof PS.model === 'function' ? PS.model(mapId) : null;
    var sig = JSON.stringify([m, found, shelf, st.shut, st.cards, st.all, q, st.hold, pinList, cardsSig(camp, m, found), st.spread === true]);
    if (!force && sig === _sig) return;
    _sig = sig;
    var keepTop = E.body.scrollTop, focus = focusOf(E.body);
    prepDraw(E.body, camp, m, st, { pinned: pinned, shelf: shelf, pinList: pinList, row: PS && typeof PS.row === 'function' ? PS.row : null, found: found });
    if (PS && typeof PS.mentionPaint === 'function') { try { PS.mentionPaint(E.body); } catch (e) {} }   // a mention in a card's field, as a chip in its current name
    E.body.scrollTop = keepTop; focusBack(E.body, focus);
    if (E.map) E.map.textContent = m.map ? m.map.title : 'No map';
    if (E.sub) E.sub.textContent = st.hold ? 'Prep \u00b7 held on this map' : 'Prep \u00b7 follows the map';
    if (E.hold) { E.hold.classList.toggle('on', !!st.hold); E.hold.setAttribute('aria-pressed', st.hold ? 'true' : 'false'); tipSet(E.hold, st.hold ? 'Held on this map. Press to follow the map on screen again.' : 'Hold on this map. The column stays on it while you look at another.'); }
}
// The open cards are drawn from their blocks, so the column is drawn again when one of those blocks changes
function cardsSig(camp, m, found) {
    var out = [], take = function(c, first) { var k = prepKey(c), open = st.cards[k] === undefined ? !!first : st.cards[k] === true; if (open) out.push(prepBlock(camp, c)); };
    if (found) found.forEach(function(c) { take(c, found.length === 1); });
    else { var wide = st.spread === true; m.here.forEach(function(c, k) { take(c, wide || k === 0); }); m.people.forEach(function(c) { take(c, wide); }); }
    return out;
}
// [prepcheck:focus-start]
// The control that held the focus, found again in a column drawn anew: by what it is and what it names, in the section it stood in first,
// since one page may stand as a row in several sections (under Tonight, under Here, under Pinned)
function focusSec(e) { var sc = e && e.closest ? e.closest('.prep-sec') : null, f = sc ? sc.firstChild : null; return f && f.dataset ? f.dataset.sec || '' : ''; }
function focusOf(body) {
    var a = document.activeElement; if (!a || !body.contains(a) || !a.dataset) return null;
    var row = a.closest ? a.closest('.ps-row') : null, own = String(a.className).split(' ').filter(function(c) { return /^(?:prep|ps|pv)-[a-z-]+$/.test(c) && c !== 'prep-fb' && c !== 'prep-ib'; });
    return { cls: own[0] || '', pl: a.dataset.pl || a.dataset.page || '', i: a.dataset.i || '', key: a.dataset.key || '', sec: a.dataset.sec || '', tok: a.dataset.tok || '', id: row && row.dataset ? row.dataset.id || '' : '', within: focusSec(a) };
}
function focusBack(body, f) {
    if (!f || !f.cls) return;
    var all = body.querySelectorAll('.' + f.cls), first = null, hit = null;
    for (var k = 0; k < all.length && !hit; k++) {
        var e = all[k], d = e.dataset || {}, row = e.closest ? e.closest('.ps-row') : null;
        if ((d.pl || d.page || '') !== f.pl || (d.i || '') !== f.i || (d.key || '') !== f.key || (d.sec || '') !== f.sec || (d.tok || '') !== f.tok || ((row && row.dataset.id) || '') !== f.id) continue;
        if (!first) first = e;
        if (focusSec(e) === f.within) hit = e;
    }
    hit = hit || first;
    if (hit) { try { hit.focus({ preventScroll: true }); } catch (err) {} }
}
// [prepcheck:focus-end]
// [prepcheck:sync-start]
// Asked at every redraw of the page (main.js render), and after a press here: shown or put away, the rail's icon lit, drawn where it changed
function sync() {
    var E = els(); if (!E.col) return false;
    var on = shownNow();
    if (E.col.hidden === on) { E.col.hidden = !on; relaid(); }
    arrowSeat(E, on);
    if (E.rail) { E.rail.classList.toggle('on', on); E.rail.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    if (on !== _was) { _was = on; if (!on) { _sig = ''; _fq.list = null; if (E.body) E.body.textContent = ''; } }
    if (!on || document.body.classList.contains('tour-on')) st.spread = false;   // Spread is for the moment: a column that is put away comes back docked, and the tour's card has the map to itself
    var wide = on && st.spread === true;
    E.col.classList.toggle('spread', wide); document.body.classList.toggle('prep-spread', wide);   // the body's word: what must lie over a spread column asks it (the left panel opened from its rail, a hidden top row's bar)
    if (wide) E.col.style.setProperty('--prepwide', spreadWide(E.col) + 'px');
    if (E.spread) { E.spread.classList.toggle('on', wide); E.spread.setAttribute('aria-pressed', wide ? 'true' : 'false'); tipSet(E.spread, wide ? 'Spread wide. Press, or Esc, to put the column back beside the map.' : 'Spread. The cards laid out wide over the map, in three columns. Shift+G does it too.'); }
    if (on) { E.col.style.setProperty('--prepw', st.w + 'px'); draw(false); }
    return on;
}
// [prepcheck:sync-end]
// [prepcheck:over-start]
// The floating box that was used last when the column was last pressed or keyed. A box that came up since (a page opened from a card of the
// spread column, whose press leaves the focus on the card's button) lies on top of the column, and Escape closes that box first: esckey.js
// asks over(). A redraw that puts the focus back in the column is no use of it, so only a press and a key are noted
var _boxWas = null;
function boxLast() { var F = window.wpFloats; return F && typeof F.last === 'function' ? F.last() || null : null; }
function boxNote(e) { if (e && e.key === 'Escape') return; _boxWas = boxLast(); }
function boxOver() { var b = boxLast(); return !!b && b !== _boxWas; }
// [prepcheck:over-end]
// [prepcheck:spread-start]
// A tooltip changed while the page runs goes into data-tip, with the title taken off, and only where its words differ: tooltips.js reads
// data-tip, and a title written back under a resting pointer would bring the browser's own bubble up beside the app's
function tipSet(el, words) { if (!el || !el.dataset || el.dataset.tip === words) return; el.dataset.tip = words; if (typeof el.removeAttribute === 'function') el.removeAttribute('title'); }
// How wide the column lies when it is spread: three columns of cards over the left part of the map, never past the window less a strip of
// map at its right, and never narrower than the column itself. It is worked out again whenever the column's left edge can have moved: at
// a redraw of the page, when the window changes size and when the map's area does (the left panel docked or folded by its arrow or grip)
function spreadWide(col) {
    var rc = col && typeof col.getBoundingClientRect === 'function' ? col.getBoundingClientRect() : null, left = rc && rc.left > 0 ? rc.left : 0, own = rc && rc.width > 0 ? rc.width : st.w, room = window.innerWidth - left;
    var wide = Math.max(own, Math.min(PREP.spread, room - PREP.spreadGap));   // never narrower than the column as it stands (its kept width, held to the window by the style sheet)
    return Math.round(room > own ? Math.min(wide, room) : wide);
}
// Spread on or off. Asked for while the column is put away, the column opens first. It is this moment's alone: nothing of it is kept
function setSpread(on, via) {
    if (on && !shownNow() && setOpen(true, via === 'key' ? 'spread' : via) !== true) return false;
    st.spread = !!on && shownNow(); log(st.spread ? 'spread' : 'unspread', { via: via || '' });
    if (st.spread && window.wpLeftRail && typeof window.wpLeftRail.away === 'function') window.wpLeftRail.away();   // the left panel opened from the rail lies where the spread begins: it is put away, as when the column opens
    sync();
    return true;
}
function spreadNow() { return st.spread === true && shownNow(); }
// [prepcheck:spread-end]
function setOpen(on, via) {
    if (on) { var why = prepCan(); if (why !== true) { toast(why); return false; } }
    st.open = !!on; keep(); log(on ? 'open' : 'close', { via: via || '' });
    if (on && window.wpLeftRail && typeof window.wpLeftRail.away === 'function') window.wpLeftRail.away();   // the left panel opened from the rail would lie over the column
    sync();
    if (on) { var E = els(); if (via === 'key' && E.find) { try { E.find.focus({ preventScroll: true }); } catch (e) {} } }
    return true;
}
function toggle(via) { return setOpen(!shownNow(), via); }
// [prepcheck:openat-start]
// A card's planner and block from the control pressed
function refOf(el) { var d = el.dataset || {}, i = Number(d.i); return { pl: d.pl || '', at: d.at || '', i: i === i && i >= 0 ? Math.round(i) : -1 }; }
function openAt(el, e, way) {
    var PS = window.wpPageShelf, r = refOf(el); if (!PS || !r.pl) return;
    var got = way === 'part' ? (r.at && typeof PS.openPart === 'function' ? PS.openPart(r.pl, r.at) : PS.open(r.pl, 'window')) : PS.open(r.pl, way || PS.wayNow(e), r.at ? { at: r.at } : undefined);   // part: the card alone in a window of its own
    log('open-card', { way: got || '', at: r.at ? 1 : 0 });
    if (got === 'panel') setTimeout(panelClear, 0);
}
// [prepcheck:openat-end]
// The page panel opens where it was last left on this map. One left where the column now stands is moved beside the column, where the window
// has the room for it: a card opened from the column is never opened under the column's own edge
function panelClear() {
    var p = document.getElementById('docPanel'), E = els(); if (!p || !E.col || E.col.hidden) return;
    var a = p.getBoundingClientRect(), c = E.col.getBoundingClientRect(); if (!(a.width > 0) || a.left >= c.right || a.right <= c.left) return;
    var left = Math.round(c.right + 12); if (left + Math.min(a.width, 240) > window.innerWidth) return;
    p.style.left = left + 'px'; p.style.right = 'auto';
}
// [prepcheck:tick-start]
var _wasS = Object.create(null), _wasCamp = '';   // the session a scene had before its Played tick was set here, with where the scene is, by its planner and block; and the campaign they are of
// Played on a scene and Found on a clue: the card's own tick, set as the planner's editor sets it and saved at once, as its own tick is. A
// scene whose tick is taken off gets back the session it had when it was ticked here (Tonight or Ahead), so a second press is a true undo
function tick(el) {
    var camp = getActiveCampaign(), r = refOf(el), it = prepOwn(camp && camp.items, r.pl), b = prepBlock(camp, { pl: r.pl, at: r.at, i: r.i }); if (!it || !b) { toast('That card is no longer in its planner.'); draw(true); return; }
    var kind = CC.cardKind(b), key = r.pl + '/' + (r.at || r.i);
    if (_wasCamp !== camp.id) { _wasS = Object.create(null); _wasCamp = camp.id; }   // what was ticked in another campaign says nothing in this one
    if (kind === 'scene') {
        var was = CC.sessionOf(b);
        if (was === 'played') { CC.setSession(b, _wasS[key] ? _wasS[key].s : ''); delete _wasS[key]; }
        else { _wasS[key] = { s: was, c: { pl: r.pl, at: r.at, i: r.i } }; CC.setSession(b, 'played'); }
    }
    else if (CC.kindOf(b).tick) { if (b.done === true) delete b.done; else b.done = true; }
    else return;
    it.meta = it.meta || {}; it.meta.updated = Date.now();
    save(true); log('tick', { kind: kind, on: b.done === true ? 1 : 0 });
    if (typeof window.appRender === 'function') window.appRender(); else draw(true);
}
// The planners a Tonight scene of which was ticked as played here and still is. With no planner marked Next, tonight's planner is the one
// that holds a scene set to Tonight: ticking its last such scene would take the whole Tonight list away, and the tick with it, so the column
// keeps that planner as tonight's while the tick stands (draw hands it to the model as keep)
function tnKept(camp) {
    if (!camp || _wasCamp !== camp.id) return [];
    return Object.keys(_wasS).filter(function(k) { var w = _wasS[k], b = w.s === 'tonight' ? prepBlock(camp, w.c) : null; return !!b && CC.sessionOf(b) === 'played'; }).map(function(k) { return _wasS[k].c.pl; });
}
// [prepcheck:tick-end]
// A token found on its map: the party's own finder for one players see, and by hand to one the GM hid, which that finder passes over
function findTok(id) {
    var camp = getActiveCampaign(), mapId = camp ? mapNow(camp) : '', map = camp ? prepOwn(camp.items, mapId) : null, tok = map && Array.isArray(map.whiteboard) ? map.whiteboard.filter(function(w) { return w && w.id === id; })[0] : null;
    if (!tok) { toast('That token is no longer on this map.'); draw(true); return; }
    log('find-token', { hidden: tok.hidden ? 1 : 0 });
    if (st.spread) setSpread(false, 'find');   // spread wide, the column lies over the map it is about to show
    if (!tok.hidden && camp.activeItemId === mapId && window.wpFocusCharacter) { window.wpFocusCharacter('i:' + id); return; }
    map.meta = map.meta || {}; map.meta.lastWbX = tok.x + (tok.w || 60) / 2; map.meta.lastWbY = tok.y + (tok.h || 52) / 2;
    if (camp.activeItemId !== mapId) navigateToMap(mapId);
    state.viewMode = 'visual'; state.selWbIds = [id]; state.selWbId = id;
    if (window.appRender) window.appRender();
    if (window.appRestoreCamera) window.appRestoreCamera();
}
// [prepcheck:card-start]
// A card's mark on a token was pressed (whiteboard.js): where the column shows and lists that card, the card is opened there, its section
// unfolded, brought into view and lit for a moment. Answers whether it did, so the mark opens the page over the map otherwise
function showCard(pl, at) {
    if (!shownNow() || typeof pl !== 'string' || typeof at !== 'string' || !at) return false;
    var camp = getActiveCampaign(), E = els(); if (!camp || !E.body) return false;
    var PS = window.wpPageShelf, m = prepModel(camp, mapNow(camp), { pinned: PS && typeof PS.pinned === 'function' ? PS.pinned() : [] });
    var inPeople = m.people.filter(function(c) { return c.pl === pl && c.at === at; })[0], inHere = inPeople ? null : m.here.filter(function(c) { return c.pl === pl && c.at === at; })[0], c = inPeople || inHere;
    if (!c) return false;
    st.cards[prepKey(c)] = true; delete st.shut[inPeople ? 'people' : 'here']; st.q = ''; if (E.find) E.find.value = '';
    keep(); log('show-card', { sec: inPeople ? 'people' : 'here' }); draw(true);
    var key = prepKey(c), el = Array.prototype.filter.call(E.body.querySelectorAll('.prep-card'), function(x) { return x.dataset && x.dataset.key === key; })[0];
    if (el) { try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {} el.classList.add('prep-lit'); setTimeout(function() { el.classList.remove('prep-lit'); }, 1600); }
    return true;
}
// [prepcheck:card-end]
// [prepcheck:make-start]
// Make a card: the token or the room's character a row is about, found again in the campaign as it stands, by the row's kind and name
function makeSrc(camp, mapId, d) {
    var map = prepOwn(camp.items, mapId); if (!map || typeof map !== 'object' || map.type !== 'map' || !d) return null;
    if (d.t === 'tok') {
        var w = (Array.isArray(map.whiteboard) ? map.whiteboard : []).filter(function(x) { return !!x && typeof x === 'object' && x.id === d.tok && !!x.isChar && !x.waiting && !x.gmNoteFor; })[0]; if (!w) return null;
        var chars = camp.chars && typeof camp.chars === 'object' ? camp.chars : null, ch = typeof w.charId === 'string' ? prepOwn(chars, w.charId) : null; if (w.ownerId || (ch && ch.ownerId)) return null;
        // the note is the one its row shows: this token's, else the first among the tokens of the same sheet and name, which stand as one row
        var all = map.whiteboard, sh = typeof w.charId === 'string' ? w.charId : '', nmOf = function(x) { return prepFold(prepTokName(x, typeof x.charId === 'string' ? prepOwn(chars, x.charId) : null) || 'Unnamed'); }, nm = nmOf(w), note = '';
        for (var k = -1; k < all.length && !note; k++) { var x = k < 0 ? w : all[k]; if (x && typeof x === 'object' && x.isChar && !x.waiting && !x.gmNoteFor && !x.ownerId && (typeof x.charId === 'string' ? x.charId : '') === sh && typeof x.gmInfo === 'string' && x.gmInfo.trim() && nmOf(x) === nm) note = x.gmInfo; }
        return { name: prepTokName(w, ch) || 'Unnamed', note: note, sheet: ch ? w.charId : '', map: mapId };
    }
    var hit = null, want = prepFold(d.name);
    (Array.isArray(map.rooms) ? map.rooms : []).forEach(function(rm) { if (hit || !rm || typeof rm !== 'object' || !Array.isArray(rm.characters)) return; rm.characters.forEach(function(e) { if (!hit && e && typeof e === 'object' && prepFold(prepWords(e.name, 80)) === want) hit = e; }); });
    return hit ? { name: prepWords(hit.name, 80), note: typeof hit.info === 'string' ? hit.info : '', sheet: '', map: mapId } : null;
}
// The card is added at the end of the planner picked, as one change of that planner with one save: a step of that planner's own undo. The
// column then shows it open under People here, since its Where is this map
function makeCard(plId, d) {
    var camp = getActiveCampaign(), mapId = camp ? mapNow(camp) : '', it = camp ? prepOwn(camp.items, plId) : null, src = camp ? makeSrc(camp, mapId, d) : null;
    if (!it || typeof it !== 'object' || it.type !== 'planner' || !Array.isArray(it.blocks)) { toast('That planner is no longer here.'); draw(true); makeFocus('prep-make', function(e) { return makeIs(e, d); }); return false; }
    if (!src) { toast('That one is no longer on this map.'); draw(true); return false; }   // its row went with it
    var b = prepNewCard(src, 'b_' + uid()); it.blocks.push(b);
    it.meta = it.meta && typeof it.meta === 'object' ? it.meta : {}; it.meta.updated = Date.now();
    st.cards[plId + '/' + b.id] = true; delete st.shut.people;
    var PS = window.wpPageShelf; if (PS && typeof PS.sheetDrop === 'function') PS.sheetDrop();   // the board's marks are worked out again at once
    save(true); log('make-card', { from: d.t === 'tok' ? 'token' : 'room', sheet: b.sheet ? 1 : 0, note: b.rows.length });
    toast('Card made for ' + src.name + ' in ' + prepTitle(it, 'Planner') + '. It is open under People here.');
    if (typeof window.appRender === 'function') window.appRender();
    draw(false);   // the column as it now is, whatever the page's own redraw did
    var key = plId + '/' + b.id; makeFocus('prep-card-h', function(e) { return e.dataset.key === key; });   // the menu that held the focus is gone: the new card takes it, so no key falls to the map
    return true;
}
// The focus handed to a control of the column as drawn now, found by its class and a test: the keyboard goes on from what was just done
function makeIs(e, d) { return !!d && e.dataset.t === d.t && (d.t === 'tok' ? e.dataset.tok === d.tok : e.dataset.name === d.name); }
function makeFocus(cls, test) {
    var E = els(), all = E && E.body ? E.body.querySelectorAll('.' + cls) : [], hit = null;
    for (var k = 0; k < all.length && !hit; k++) if (all[k].dataset && test(all[k])) hit = all[k];
    if (hit && typeof hit.focus === 'function') { try { hit.focus(); } catch (e) {} }
    return !!hit;
}
// The menu of planners a card may be made in: one row a planner, under the button pressed. It holds the focus and its own keys
var _mk = { el: null, btn: null, d: null };
function makeClose(back) { var mn = _mk.el, b = _mk.btn; _mk = { el: null, btn: null, d: null }; if (mn && mn.parentNode) mn.parentNode.removeChild(mn); if (b) { b.setAttribute('aria-expanded', 'false'); if (back === true && typeof b.focus === 'function' && b.isConnected !== false) { try { b.focus({ preventScroll: true }); } catch (e) {} } } }
function makeOpen(btn) {
    var camp = getActiveCampaign(); if (!camp || !btn) return false;
    if (_mk.btn === btn) { makeClose(true); return false; }
    makeClose(false);
    var PS = window.wpPageShelf, pins = PS && typeof PS.pinned === 'function' ? PS.pinned() : [], list = prepPlannersFor(camp, prepModel(camp, mapNow(camp), { pinned: pins }), pins);
    var mn = prepEl('div', 'prep-make-menu'); mn.id = 'prepMakeMenu'; mn.tabIndex = -1; mn.setAttribute('role', 'menu'); mn.setAttribute('aria-label', 'Make the card in');   // it can hold the focus itself: with no row, or after a press on its heading, its keys are still its own
    mn.appendChild(prepEl('div', 'prep-mk-head', 'Make the card in'));
    if (!list.length) mn.appendChild(prepEl('div', 'prep-mk-none', 'There is no planner yet. Add one in the left panel first.'));
    list.forEach(function(p) { var rw = prepBtn('prep-mk-row', '', ''); rw.setAttribute('role', 'menuitem'); rw.dataset.pl = p.id; rw.appendChild(prepEl('span', 'prep-mk-t', p.title)); if (p.why) rw.appendChild(prepEl('small', '', p.why)); mn.appendChild(rw); });
    var left0 = prepPlanners(camp).length - list.length; if (left0 > 0) mn.appendChild(prepEl('div', 'prep-mk-none', left0 + ' more ' + (left0 === 1 ? 'is' : 'are') + ' not listed. Pin a planner to list it near the top.'));
    document.body.appendChild(mn);
    var rc = btn.getBoundingClientRect(), mw = mn.offsetWidth || 240, mh = mn.offsetHeight || 0, left = Math.max(6, Math.min(rc.left, window.innerWidth - mw - 6)), top = rc.bottom + 4; if (top + mh > window.innerHeight - 6) top = Math.max(6, rc.top - mh - 4);
    mn.style.left = Math.round(left) + 'px'; mn.style.top = Math.round(top) + 'px';
    _mk = { el: mn, btn: btn, d: { t: btn.dataset.t === 'tok' ? 'tok' : 'room', name: btn.dataset.name || '', tok: btn.dataset.tok || '' } };
    btn.setAttribute('aria-expanded', 'true');
    mn.addEventListener('click', function(e) { var rw = e.target && e.target.closest ? e.target.closest('.prep-mk-row') : null; if (rw) makePick(rw); });
    mn.addEventListener('keydown', makeKey); mn.addEventListener('keyup', makeKeyUp);
    var first = mn.querySelector('.prep-mk-row') || mn; try { first.focus({ preventScroll: true }); } catch (e) {}
    return true;
}
// The menu's keys: every plain key stops here (the page reads the arrows and Delete as acting on the map's selection, and a letter as a
// command's key). The arrows, Home and End move among the rows, a letter goes to the next row that begins with it, Escape puts it away
function makeKey(e) {
    if (!_mk.el || e.ctrlKey || e.metaKey || e.altKey || e.key === 'Tab') return;
    var rows = Array.prototype.slice.call(_mk.el.querySelectorAll('.prep-mk-row')), at = rows.indexOf(document.activeElement), go = -1;
    // Enter picks a row as the key is let go, and only where it went down on that row: a key still held from the press that opened the menu
    // picks nothing, and no held Enter is left to press the card that takes the focus next. Space is the row's own press, at its release
    if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); if (!e.repeat) _mk.enter = document.activeElement; return; }
    if (e.key === ' ') { e.stopPropagation(); if (e.repeat) e.preventDefault(); return; }
    e.stopPropagation(); e.preventDefault();
    if (e.key === 'Escape') { makeClose(true); return; }
    if (e.key === 'ArrowDown') go = at < rows.length - 1 ? at + 1 : 0; else if (e.key === 'ArrowUp') go = at > 0 ? at - 1 : rows.length - 1; else if (e.key === 'Home') go = 0; else if (e.key === 'End') go = rows.length - 1;
    else if (typeof e.key === 'string' && e.key.length === 1) { var ch = prepFold(e.key); for (var k = 1; k <= rows.length && go < 0; k++) { var j = (Math.max(at, -1) + k) % rows.length; if (prepFold(rows[j].textContent).indexOf(ch) === 0) go = j; } }
    if (go >= 0 && rows[go]) { try { rows[go].focus(); } catch (err) {} }   // the menu scrolls to the row, which its own scroll does not put away
}
function makePick(rw) { var d = _mk.d, pl = rw.dataset.pl; makeClose(false); makeCard(pl, d); }
function makeKeyUp(e) {
    if (!_mk.el || e.key !== 'Enter') return;
    var rw = _mk.enter; _mk.enter = null;
    if (rw && rw === document.activeElement && rw.classList && rw.classList.contains('prep-mk-row')) { e.stopPropagation(); makePick(rw); }
}
// The menu is put away by a press outside it, when the focus leaves it, when what holds its button scrolls (the button moves from under it)
// and when the window changes size
function makeWatch(doc, win) {
    doc.addEventListener('pointerdown', function(e) { if (_mk.el && !(e.target && _mk.el.contains(e.target)) && !(_mk.btn && _mk.btn.contains(e.target))) makeClose(false); }, true);
    doc.addEventListener('focusin', function(e) { if (_mk.el && !(e.target && _mk.el.contains(e.target)) && e.target !== _mk.btn) makeClose(false); });
    doc.addEventListener('scroll', function(e) { var t = e.target; if (_mk.el && _mk.btn && t && typeof t.contains === 'function' && t.contains(_mk.btn)) makeClose(false); }, true);
    win.addEventListener('resize', function() { if (_mk.el) makeClose(false); });
}
// [prepcheck:make-end]
// [prepcheck:fight-start]
// The tokens a scene card's table names on the column's map: selected, or selected and brought into view (find). Found again in the
// campaign as it stands, by the card's block and the map's tokens now
function fightToks(el, find) {
    var camp = getActiveCampaign(), rf = refOf(el), b = camp ? prepBlock(camp, { pl: rf.pl, at: rf.at, i: rf.i }) : null, mapId = camp ? mapNow(camp) : '', map = camp ? prepOwn(camp.items, mapId) : null;
    var ids = b && map ? prepToks(b, prepTokNames(map, camp.chars && typeof camp.chars === 'object' ? camp.chars : null)) : [];
    if (!ids.length) { toast('None of the tokens its table names are on this map now.'); draw(true); return; }
    log(find ? 'find-them' : 'select-them', { n: ids.length });
    if (find) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, num = function(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; };
        map.whiteboard.forEach(function(w) { if (!w || ids.indexOf(w.id) < 0) return; var x = num(w.x, 0), y = num(w.y, 0); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + num(w.w, 60)); y1 = Math.max(y1, y + num(w.h, 52)); });
        map.meta = map.meta || {}; map.meta.lastWbX = (x0 + x1) / 2; map.meta.lastWbY = (y0 + y1) / 2;
        // where they do not all fit the map's area at the zoom the view has, it is zoomed out until they do, and never in
        var wrap = document.getElementById('whiteboardWrap'), onScreen = camp.activeItemId === mapId && typeof state.zoomLevel === 'number' && state.zoomLevel > 0, zNow = onScreen ? state.zoomLevel : num(map.meta.lastWbZoom, 1), fit = wrap && wrap.clientWidth > 0 && wrap.clientHeight > 0 ? Math.min(wrap.clientWidth / (x1 - x0 + PREP.fitPad), wrap.clientHeight / (y1 - y0 + PREP.fitPad)) : zNow;
        if (fit < zNow) map.meta.lastWbZoom = Math.min(zNow, Math.max(PREP.fitMin, Math.floor(fit * 20) / 20));   // never above the zoom it has: a view zoomed out past the least step is left as it is
        else if (onScreen) map.meta.lastWbZoom = zNow;   // the zoom the view has is the zoom the camera is put back at
        if (st.spread) setSpread(false, 'find');   // spread wide, the column lies over the map it is about to show
    }
    if (camp.activeItemId !== mapId) navigateToMap(mapId);
    state.viewMode = 'visual'; state.selWbIds = ids.slice(); state.selWbId = ids[0];
    if (window.appRender) window.appRender();
    if (find && window.appRestoreCamera) window.appRestoreCamera();
}
// [prepcheck:fight-end]
// [prepcheck:press-start]
function press(e) {
    var t = e.target, at = function(sel) { return t && t.closest ? t.closest(sel) : null; }, el, PS = window.wpPageShelf;
    var lk = at('a'); if (lk && typeof lk.getAttribute === 'function' && lk.getAttribute('href')) return;   // a link in a card's own field is the link gate's press, and folds or opens nothing here
    if ((el = at('.prep-make'))) { makeOpen(el); return; }   // before the Card chip below, whose class it shares
    if ((el = at('.prep-fold'))) { var k = el.dataset.sec; if (PREP_SECS.indexOf(k) >= 0) { if (st.shut[k] === 1) delete st.shut[k]; else st.shut[k] = 1; keep(); draw(true); } return; }
    if ((el = at('.prep-tick')) || (el = at('.prep-sn'))) { tick(el); return; }
    if ((el = at('.prep-card-h'))) { var card = el.closest('.prep-card'), key = el.dataset.key; st.cards[key] = !!(card && card.classList.contains('shut')); draw(true); return; }
    if ((el = at('.prep-win'))) { openAt(el, e, 'part'); return; }
    if ((el = at('.prep-pin'))) { if (PS && el.dataset.pl) { PS.pin(el.dataset.pl); draw(true); } return; }
    if ((el = at('.prep-open')) || (el = at('.prep-step')) || (el = at('.prep-clue')) || (el = at('.prep-chip'))) { openAt(el, e); return; }
    if ((el = at('.prep-findtok'))) { findTok(el.dataset.tok); return; }
    if ((el = at('.prep-sel'))) { fightToks(el, false); return; }
    if ((el = at('.prep-findall'))) { fightToks(el, true); return; }
    if (at('.prep-all')) { st.all = true; draw(true); return; }
    // the Pages shelf's own rows, drawn here by the shelf's own drawer: the same three presses
    var row = at('.ps-row'), id = row ? row.dataset.id : ''; if (!id || !PS) return;
    var land = row.dataset.at ? { at: row.dataset.at } : undefined;
    if (at('.ps-pin')) { PS.pin(id); draw(true); }
    else if (at('.ps-win')) PS.open(id, 'window', land);
    else if (at('.ps-open')) { if (PS.open(id, PS.wayNow(e), land) === 'panel') setTimeout(panelClear, 0); }   // as a card opened from the column: never under the column's own edge
}
// [prepcheck:press-end]
function wire() {
    var E = els(); if (!E.col) return;
    var kept = prepKept((function() { try { return localStorage.getItem(STORE); } catch (e) { return null; } })());
    st.open = kept.open; st.w = kept.w; st.shut = kept.shut;
    E.body.addEventListener('click', press);
    if (E.rail) E.rail.addEventListener('click', function() { toggle('rail'); });
    var close = document.getElementById('prepCloseBtn'); if (close) close.addEventListener('click', function() { setOpen(false, 'close'); });
    makeWatch(document, window);   // what puts the menu of planners away
    E.col.addEventListener('pointerdown', boxNote, true); E.col.addEventListener('keydown', boxNote, true);   // what box was used last as the column is used: Escape asks over()
    if (E.spread) E.spread.addEventListener('click', function() { setSpread(!spreadNow(), 'button'); });
    window.addEventListener('resize', function() { if (_was && st.spread) sync(); });   // spread wide, the column's width follows the window
    var mainEl = document.getElementById('main');   // and the map's area: the left panel docked or folded by its arrow or its grip moves the column with no redraw of the page
    if (mainEl && typeof ResizeObserver === 'function') new ResizeObserver(function() { if (_was && st.spread) sync(); }).observe(mainEl);
    if (E.hold) E.hold.addEventListener('click', function() { var camp = getActiveCampaign(); st.hold = st.hold ? '' : (camp ? mapNow(camp) : ''); log('hold', { on: st.hold ? 1 : 0 }); draw(true); });
    if (E.find) {
        E.find.addEventListener('input', function() { clearTimeout(_findT); _findT = setTimeout(function() { st.q = String(E.find.value || '').slice(0, 80); draw(true); }, 140); });
        E.find.addEventListener('keydown', function(e) { if (e.key === 'Escape' && E.find.value) { e.preventDefault(); e.stopPropagation(); E.find.value = ''; st.q = ''; draw(true); } });
    }
    // its width, dragged by the grip at its right edge: the pointer's place less the column's own left edge
    var grip = document.getElementById('prepGrip');
    if (grip) grip.addEventListener('pointerdown', function(e) {
        if (e.button !== 0) return; e.preventDefault();
        var left = E.col.getBoundingClientRect().left, pid = e.pointerId, over = false;
        var move = function(me) { st.w = Math.max(PREP.wMin, Math.min(PREP.wMax, Math.round(me.clientX - left))); E.col.style.setProperty('--prepw', st.w + 'px'); };
        // the drag ends at a release, at a gesture the browser took away and at a capture that is lost, once
        var up = function() {
            if (over) return; over = true;
            document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); grip.removeEventListener('lostpointercapture', up);
            try { if (grip.releasePointerCapture) grip.releasePointerCapture(pid); } catch (err) {}
            grip.classList.remove('dragging'); keep(); relaid();
        };
        try { if (grip.setPointerCapture) grip.setPointerCapture(pid); } catch (err) {}
        grip.classList.add('dragging'); document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up); grip.addEventListener('lostpointercapture', up);
    });
    // Joining a table puts net-client on the body with no redraw of the page, and the style sheet then puts the column away: the column is
    // asked again when that word comes or goes, so the left panel's arrow is never left seated in a column that is out of sight
    if (typeof MutationObserver === 'function' && document.body) {
        var wasClient = document.body.classList.contains('net-client');
        new MutationObserver(function() { var now = document.body.classList.contains('net-client'); if (now !== wasClient) { wasClient = now; sync(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    // a press anywhere may have changed what the column shows with no redraw of the page (a pin from the shelf or the tree): looked at again a
    // moment later, and drawn only where something differs
    document.addEventListener('click', function() { if (!_was) return; clearTimeout(_soon); _soon = setTimeout(function() { if (_was) draw(false); }, 90); }, true);
}
window.wpPrep = { sync: sync, may: prepMay, can: prepCan, shown: shownNow, open: function(via) { return setOpen(true, via); }, close: function(via) { return setOpen(false, via); }, toggle: toggle,
    spread: spreadNow, over: boxOver, card: showCard, unspread: function(via) { return setSpread(false, via || 'esc'); }, spreadToggle: function(via) { return setSpread(!spreadNow(), via); } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { wire(); sync(); }); else { wire(); sync(); }
