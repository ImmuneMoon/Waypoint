// deckwin.js: the left panel's Decks section and its window (1.6.2, backlog 210 d, fold 4; the owner, by prompt: "The left panel, as a section", and of a campaign's own decks, "a GM can add a house game, or a custom deck for one story, without editing the system"). A system's decks and a campaign's stand together, and a campaign's are built by the one editor. Drawing by hand goes through the host: a GM's press there at once, a player's by net.deckDo, judged as any message is. Elements and text nodes alone
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { cleanDecks, cleanPile, pileCounts, cleanSpreads, faceWords, faceCount, placeWords, cleanKeep } from './deckcore.js';
import { edit, spreads } from './deckui.js';
import { spreadCard } from './cardcore.js';
var CAMP_KEY = /^C[0-9]+$/, _sig = null, _at = '', _build = false, _tab = 'decks', _sp = '', _lay = null, _keep = Object.create(null);   // _lay (backlog 223): the spread laid on this screen, { camp, key, at: [{ deck, ix, face, tk } or null a place], shown }; _keep (fold B): a place kept as what the GM picked, by campaign and spread, this screen's alone
function net() { return window.wpNet || null; }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; }
function btn(cls, text, tip) { var b = el('button', cls, text); b.type = 'button'; if (tip) b.title = tip; return b; }
function atTable() { var n = net(); return !!n && n.active === true && n.role === 'client' && n.foreign === true; }
function gmHand() { if (atTable() || (net() && net().stream)) return false; return !(typeof window.wpCanPersistLocal === 'function' && window.wpCanPersistLocal() !== true); }
function decksOf(camp) { if (!camp) return []; var sysL = camp.system && Array.isArray(camp.system.decks) ? camp.system.decks : []; return sysL.map(function(d) { return { d: d, own: false }; }).concat(cleanDecks(camp.decks, true, CAMP_KEY).map(function(d) { return { d: d, own: true }; })); }
function countsOf(camp, d) { if (camp.pileN && Object.prototype.hasOwnProperty.call(camp.pileN, d.key)) return camp.pileN[d.key]; var p = camp.piles && Object.prototype.hasOwnProperty.call(camp.piles, d.key) ? cleanPile(camp.piles[d.key], d) : null; return pileCounts(p, d); }
function saysLeft(c) { return c.left + ' left' + (c.disc ? ', ' + c.disc + ' discarded' : ''); }
function handsFor(camp) {   // where a card may go: the hands this screen may reach
    var out = [], S = window.wpSystemCore, me = net() ? net().myId : '', gm = gmHand(), fields = camp.system && Array.isArray(camp.system.fields) ? camp.system.fields : [];
    fields.forEach(function(f) { if (!f || f.kind !== 'item-list' || !f.list || !f.list.hand) return; Object.keys(camp.chars || {}).forEach(function(id) { var c = camp.chars[id]; if (!c || c.partial || c.making === 1) return; if (gm ? false : c.ownerId !== me) return; out.push([id + '|' + f.id, (c.name || 'A character') + ': ' + (f.label || 'A hand')]); }); if (gm) Object.keys(camp.chars || {}).forEach(function(id) { var c = camp.chars[id]; if (c && !c.partial && c.making !== 1) out.push([id + '|' + f.id, (c.name || 'A character') + ': ' + (f.label || 'A hand')]); }); });
    return out;
}
function drawRow(p, camp, it) {
    var d = it.d, gm = gmHand(), n = net(), row = el('div', 'dk-head'); if (!gm && d.open !== true) { p.appendChild(el('div', 'dk-count', 'Only the GM draws from this by hand.')); return; }
    var cnt = el('input', 'field dk-drawn'); cnt.type = 'number'; cnt.min = '1'; cnt.max = '20'; cnt.value = '1'; cnt.title = 'How many to draw';
    var to = el('select', 'field dk-to'), o0 = el('option', '', 'To the table'); o0.value = ''; to.appendChild(o0); handsFor(camp).forEach(function(h) { var o = el('option', '', h[1]); o.value = h[0]; to.appendChild(o); }); to.title = 'Where what is drawn goes';
    var go = btn('tool dk-draw', 'Draw', 'Draw from this'); go.addEventListener('click', function() { if (!n || typeof n.deckDo !== 'function') return; var bits = to.value ? to.value.split('|') : null, why = n.deckDo(d.key, 'draw', { n: Math.max(1, Math.min(20, Math.floor(Number(cnt.value) || 1))), charId: bits ? bits[0] : '', to: bits ? bits[1] : '' }); if (why) toast(why); });
    var cnL = countsOf(camp, d); if (cnL && cnL.left === 0) { go.disabled = true; go.title = gm ? (cnL.disc ? 'Nothing left to draw. Shuffle the discard in, or Start again' : 'Nothing left to draw. Start again puts back what no hand holds') : 'Nothing left to draw'; }   // the viewing of 2026-11-09: grayed with its reason, not a notice after the press
    row.appendChild(cnt); row.appendChild(to); row.appendChild(go); p.appendChild(row);
    if (gm) { var r2 = el('div', 'dk-head'), sh = btn('tool ghost sys-btn dk-shuffle', 'Shuffle the discard in', 'What was discarded goes back in'), re = btn('tool ghost sys-btn dk-reset', 'Start again', 'Everything but what hands hold goes back in'); if (cnL && !cnL.disc) { sh.disabled = true; sh.title = 'Nothing is discarded'; } sh.addEventListener('click', function() { var w = n && n.deckDo ? n.deckDo(d.key, 'shuffle', {}) : null; if (w) toast(w); }); re.addEventListener('click', function() { var w = n && n.deckDo ? n.deckDo(d.key, 'reset', {}) : null; if (w) toast(w); }); r2.appendChild(sh); r2.appendChild(re); p.appendChild(r2); }
}
// 1.6.2 (backlog 223, story cards; the owner, by prompt: "Decks window, show when ready", "Random, then turn"): the Spreads tab, the GM's alone. A spread
// is laid here, one card a place, each drawn through the host (net.deckTake); a card is turned to its next face or a place drawn again, and the table
// sees one card of the whole spread only when Show the table is pressed. A place whose deck is the GM's alone is never on that card
function spreadsOf(camp) { if (!camp) return []; var sysL = cleanSpreads(camp.system && camp.system.spreads, true, /^D[0-9]+$/, /^S[0-9]+$/); return sysL.map(function(s) { return { s: s, own: false }; }).concat(cleanSpreads(camp.spreads, true, null, /^P[0-9]+$/).map(function(s) { return { s: s, own: true }; })); }
function deckBy(camp, key) { var hit = decksOf(camp).filter(function(x) { return x.d.key === key; })[0]; return hit ? hit.d : null; }
function keepsOf(camp, sp) { var k = camp.id + '/' + sp.key; return _keep[k] || (_keep[k] = []); }
// 1.6.2 (backlog 223, fold B; the owner, by prompt: "B: keep a place, tuck a card"): what a place may be kept as. The planners' Person, Place and Clue
// cards, the characters and the maps, by their names, as [value, words, group]. Planners never travel, and nothing of this is sent
function plainOf(v) { return String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 120); }
function keepRows(camp) {
    var out = [], items = camp && camp.items && typeof camp.items === 'object' ? camp.items : {}, KW = { person: 'Person card', place: 'Place card', clue: 'Clue card' };
    Object.keys(items).forEach(function(id) { var it = items[id]; if (!it || it.type !== 'planner' || !Array.isArray(it.blocks)) return; it.blocks.forEach(function(b) { if (!b || b.type !== 'node' || !KW[b.mode] || typeof b.id !== 'string') return; var w = plainOf(b.title); if (w) out.push(['card:' + id + '/' + b.id, w, KW[b.mode]]); }); });
    Object.keys(camp && camp.chars || {}).forEach(function(id) { var c = camp.chars[id]; if (c && !c.partial && c.making !== 1 && typeof c.name === 'string' && c.name.trim()) out.push(['char:' + id, plainOf(c.name), 'Character']); });
    Object.keys(items).forEach(function(id) { var it = items[id]; if (!it || it.type !== 'map') return; var w = plainOf(it.meta && it.meta.title); if (w) out.push(['map:' + id, w, 'Map']); });
    return out.slice(0, 400);
}
function slotOf(camp, sp, i) {
    var at = _lay && camp && _lay.camp === camp.id && _lay.key === sp.key ? _lay.at[i] : null, kp = cleanKeep(keepsOf(camp, sp)[i]), d = at && at.deck ? deckBy(camp, at.deck) : null, c = d && d.cards[at.ix] ? d.cards[at.ix] : null;
    var td = at && at.tk ? deckBy(camp, at.tk.deck) : null, tc = td && td.cards[at.tk.ix] ? td.cards[at.tk.ix] : null, main = kp ? kp.words : c ? faceWords(c, at.face) : '', tuck = tc ? faceWords(tc, at.tk.face) : '', pl = sp.places[i] || {};
    if (!main && !tuck) return null; return { at: at, d: kp ? null : d, c: kp ? null : c, kept: kp, n: !kp && c ? faceCount(c) : 1, td: td, tc: tc, tn: tc ? faceCount(tc) : 1, main: main, tuck: tuck, words: placeWords(main, tuck, pl.tuck && pl.tuck.down === true), gm: (!kp && !!d && d.vis === 'gm') || (!!td && td.vis === 'gm') };
}
function layPlace(pl, kept) { var o = {}; if (pl.deck && !kept) { var t = takeOne(pl.deck); if (t) { o.deck = t.deck; o.ix = t.ix; o.face = t.face; } } if (pl.tuck) { var u = takeOne(pl.tuck.deck); if (u) o.tk = u; } return Object.keys(o).length ? o : null; }
function takeOne(deck) { var n = net(), r = n && typeof n.deckTake === 'function' ? n.deckTake(deck, 1) : { error: 'That cannot be done now.' }; if (r && r.error) { toast(r.error); return null; } return r && r.cards && r.cards[0] ? { deck: deck, ix: r.cards[0].ix, face: r.cards[0].face } : null; }
function spreadShow(camp, sp) {
    var lines = []; sp.places.forEach(function(pl, i) { var sl = slotOf(camp, sp, i); if (!sl || sl.gm) return; lines.push({ n: pl.label, say: sl.words }); });
    var n = net(); if (!lines.length) { toast('Nothing on this spread can be shown to the table.'); return; } if (n && typeof n.postApplyCard === 'function') n.postApplyCard(null, sp.label || 'A spread', lines, 'table');
    if (!_lay || _lay.camp !== camp.id || _lay.key !== sp.key) _lay = { camp: camp.id, key: sp.key, at: sp.places.map(function() { return null; }) }; _lay.shown = true; if (typeof window.wpStepLog === 'function') window.wpStepLog('decks v1', 'spread-show', { n: lines.length });
}
// 1.6.2 (backlog 223, fold C; the owner, by prompt: "Card of the spread's kind"): Save as a card. The planners offered by name, and the spread lands
// as an ordinary card at the end of the one picked, saved at once as any edit of it is. Planners never travel, so nothing of it is sent
function plannersOf(camp) { var items = camp && camp.items && typeof camp.items === 'object' ? camp.items : {}; return Object.keys(items).filter(function(id) { var it = items[id]; return !!it && it.type === 'planner' && Array.isArray(it.blocks); }).map(function(id) { return [id, plainOf(items[id].meta && items[id].meta.title) || 'A planner']; }).sort(function(a, b) { return a[1].localeCompare(b[1]); }).slice(0, 60); }
function spreadSave(camp, sp, plId) {
    var it = camp && camp.items && Object.prototype.hasOwnProperty.call(camp.items, plId) ? camp.items[plId] : null; if (!it || it.type !== 'planner' || !Array.isArray(it.blocks)) { toast('That planner is no longer here.'); return null; }
    var pl = []; sp.places.forEach(function(p, i) { var sl = slotOf(camp, sp, i); if (sl) pl.push({ label: p.label, words: sl.words }); }); if (!pl.length) { toast('Nothing is laid on this spread yet.'); return null; }
    var b = spreadCard({ label: sp.label, as: sp.as, places: pl }, 'b_' + Math.random().toString(36).slice(2, 10)); it.blocks.push(b); it.meta = it.meta && typeof it.meta === 'object' ? it.meta : {}; it.meta.updated = Date.now();
    save(true); toast('Saved as a card in ' + (plainOf(it.meta.title) || 'the planner') + '.'); if (typeof window.wpStepLog === 'function') window.wpStepLog('decks v1', 'spread-save', { as: sp.as || 'scene', n: pl.length }); if (typeof window.appRender === 'function') window.appRender(); return b;
}
var _saving = false;
function spreadDraw(p, camp) {
    var list = spreadsOf(camp), it = list.filter(function(x) { return x.s.key === _sp; })[0] || list[0] || null; if (it) _sp = it.s.key;
    if (list.length > 1) { var sel = el('select', 'field sp-pick'); list.forEach(function(x) { var o = el('option', '', (x.s.label || 'A spread') + (x.own ? ' (this campaign)' : '')); o.value = x.s.key; sel.appendChild(o); }); sel.value = _sp; sel.addEventListener('change', function() { _sp = sel.value; _build = false; _saving = false; panelDraw(); }); p.appendChild(sel); }
    else if (it) p.appendChild(el('div', 'dk-title', it.s.label || 'A spread'));
    if (it) {
        var sp = it.s, laid = !!(_lay && _lay.camp === camp.id && _lay.key === sp.key), row = el('div', 'sp-lay');
        sp.places.forEach(function(pl, i) {
            var sl = slotOf(camp, sp, i), kps = keepsOf(camp, sp), kp = cleanKeep(kps[i]), c = el('div', 'sp-card' + (sl && sl.main ? '' : ' sp-empty') + (kp ? ' sp-kept' : '')), d0 = pl.deck ? deckBy(camp, pl.deck) : null; c.appendChild(el('span', 'sp-pos', pl.label || 'A place'));
            c.appendChild(el('span', sl && sl.main ? 'sp-words' : 'sp-words sp-hint', sl && sl.main ? sl.main : (pl.hint || (pl.deck ? (d0 ? 'Not drawn yet' : 'Its deck is gone') : 'Filled in by you'))));
            if (kps[i] && kps[i].t === 'words') { var kb = el('input', 'field sp-keepbox'); kb.type = 'text'; kb.value = kps[i].words || ''; kb.placeholder = 'Your words'; kb.maxLength = 120; kb.title = 'What this place says, typed by you'; kb.addEventListener('change', function() { kps[i].words = kb.value.slice(0, 120); if (_lay) _lay.shown = false; panelDraw(); }); c.appendChild(kb); }
            if (pl.tuck) { var tdk = deckBy(camp, pl.tuck.deck), tst = el('span', 'sp-tuckline'); tst.appendChild(el('span', 'sp-tuckwords', (pl.tuck.down ? 'After: ' : 'Before: ') + (sl && sl.tuck ? sl.tuck : tdk ? (tdk.label || 'A deck') : 'its deck is gone'))); tst.title = 'Tucked under it, from ' + (tdk ? tdk.label || 'a deck' : 'a deck that is gone');
                if (sl && sl.tc && sl.tn > 1) { var tt = btn('tool ghost sp-tuckturn', '\u21bb', 'Face ' + (sl.at.tk.face + 1) + ' of ' + sl.tn + ' of the tucked card. Turn it to the next'); tt.setAttribute('aria-label', 'Turn the card tucked under ' + (pl.label || 'this place')); tt.addEventListener('click', function() { sl.at.tk.face = (sl.at.tk.face + 1) % sl.tn; _lay.shown = false; panelDraw(); }); tst.appendChild(tt); }
                if (laid && tdk) { var ta = btn('tool ghost sp-tuckagain', '\u27f3', 'Draw the tucked card again'); ta.setAttribute('aria-label', 'Draw the card tucked under ' + (pl.label || 'this place') + ' again'); ta.addEventListener('click', function() { var u = takeOne(pl.tuck.deck); if (!u) return; _lay.at[i] = Object.assign({}, _lay.at[i] || {}, { tk: u }); _lay.shown = false; panelDraw(); }); tst.appendChild(ta); }
                c.appendChild(tst); }
            if (pl.hint) c.title = pl.hint;
            var ft = el('span', 'sp-foot'); ft.appendChild(el('span', 'sp-from', kp ? { card: 'Kept', char: 'Kept', map: 'Kept', words: 'Your words' }[kp.t] : d0 ? d0.label || 'A deck' : ''));
            if (sl && sl.c && sl.n > 1) { var tn = btn('tool ghost sp-turn', '↻', 'Face ' + (sl.at.face + 1) + ' of ' + sl.n + '. Turn it to the next'); tn.setAttribute('aria-label', 'Turn ' + (pl.label || 'this card') + ' to its next face'); tn.addEventListener('click', function() { sl.at.face = (sl.at.face + 1) % sl.n; _lay.shown = false; panelDraw(); }); ft.appendChild(tn); }
            if (laid && d0 && !kp) { var ag = btn('tool ghost sp-again', '⟳', 'Draw this place again'); ag.setAttribute('aria-label', 'Draw ' + (pl.label || 'this place') + ' again'); ag.addEventListener('click', function() { var t = takeOne(pl.deck); if (!t) return; _lay.at[i] = Object.assign({}, _lay.at[i] || {}, { deck: t.deck, ix: t.ix, face: t.face }); _lay.shown = false; panelDraw(); }); ft.appendChild(ag); }
            c.appendChild(ft);
            var ks = el('select', 'field sp-keep'), rows = [['', pl.deck ? 'Draw it' : 'Leave it'], ['words', 'Type it']].concat(keepRows(camp)), grp = null; rows.forEach(function(r) { var o = el('option', '', r[1]); o.value = r[0]; if (r[2]) { if (!grp || grp.label !== r[2]) { grp = el('optgroup'); grp.label = r[2]; ks.appendChild(grp); } grp.appendChild(o); } else ks.appendChild(o); });
            ks.value = kps[i] ? (kps[i].t === 'words' ? 'words' : kps[i].t + ':' + (kps[i].id || '')) : ''; if (ks.value === undefined || ks.value === null) ks.value = ''; ks.title = 'Keep this place as something you already have, instead of drawing it'; ks.setAttribute('aria-label', 'What ' + (pl.label || 'this place') + ' is');
            ks.addEventListener('change', function() { var v = ks.value, hit = rows.filter(function(r) { return r[0] === v; })[0]; if (!v) delete kps[i]; else if (v === 'words') kps[i] = { t: 'words', words: kps[i] && kps[i].words || '' }; else if (hit) kps[i] = { t: v.slice(0, v.indexOf(':')), id: v.slice(v.indexOf(':') + 1), words: hit[1] }; if (_lay) _lay.shown = false; panelDraw(); }); c.appendChild(ks);
            row.appendChild(c);
        });
        p.appendChild(row);
        var acts = el('div', 'dk-head'), go = btn('tool sp-draw', laid ? 'Draw it again' : 'Draw the spread', 'Draw a card for every place. Nobody else sees it until you show the table'), sh = btn('tool ghost sys-btn sp-show', laid && _lay.shown ? 'Shown' : 'Show the table', 'Post this spread to the chat for everyone. A place drawn from a deck only you know stays off it');
        go.addEventListener('click', function() { var kps = keepsOf(camp, sp), at = sp.places.map(function(pl, i) { return layPlace(pl, !!cleanKeep(kps[i])); }); _lay = { camp: camp.id, key: sp.key, at: at, shown: false }; panelDraw(); });
        if (!laid || _lay.shown) sh.disabled = true; if (!laid) sh.title = 'Draw the spread first';   // or keep a place: see below sh.addEventListener('click', function() { spreadShow(camp, sp); panelDraw(); });
        if (!sp.places.some(function(pl) { return !!pl.deck || !!pl.tuck; })) { go.disabled = true; go.title = 'No place of this spread draws from a deck'; }
        if (!laid && sp.places.some(function(pl, i) { return !!slotOf(camp, sp, i); })) { sh.disabled = false; sh.title = 'Post the places you have kept to the chat for everyone'; }
        var sv = btn('tool ghost sys-btn sp-save', 'Save as a card', 'Make this spread a ' + ({ person: 'Person', place: 'Place', clue: 'Clue' }[sp.as] || 'Scene') + ' card in a planner, one row a place'); if (!sp.places.some(function(pl, i) { return !!slotOf(camp, sp, i); })) { sv.disabled = true; sv.title = 'Draw the spread first'; } sv.addEventListener('click', function() { _saving = !_saving; panelDraw(); });
        acts.appendChild(go); acts.appendChild(sh); acts.appendChild(sv); p.appendChild(acts);
        if (_saving && !sv.disabled) { var pls = plannersOf(camp), box = el('div', 'sp-savebox'); box.appendChild(el('div', 'dk-count', pls.length ? 'Which planner? The card goes at its end.' : 'There is no planner yet. Make one in the left panel first.')); pls.forEach(function(r) { var b2 = btn('tool ghost sp-saveto', r[1], 'Save it at the end of this planner'); b2.addEventListener('click', function() { if (spreadSave(camp, sp, r[0])) { _saving = false; panelDraw(); } }); box.appendChild(b2); }); p.appendChild(box); }
        if (!it.own) p.appendChild(el('div', 'dk-count', 'This one comes with the system. Change it in the System editor.'));
    } else p.appendChild(el('div', 'dk-count', 'No spreads here yet. A spread lays out a few cards at once, each in a place you name, such as Who, Wants and Stands in the way.'));
    var b = btn('tool ghost sys-btn sp-build', _build ? 'Done' : 'Make a spread for this campaign', 'A spread for this campaign alone, drawn from any of its decks'); b.addEventListener('click', function() { _build = !_build; panelDraw(); }); p.appendChild(b);
    if (_build) { var host = el('div', 'dk-build-box'); p.appendChild(host); spreads(host, { head: 'This campaign’s spreads', note: 'Name the places and pick the deck each draws from. Yours to change at any time.', prefix: 'P', list: function() { return Array.isArray(camp.spreads) ? camp.spreads : null; }, set: function(l) { if (l && l.length) camp.spreads = l; else delete camp.spreads; }, decks: function() { return decksOf(camp).map(function(x) { return [x.d.key, x.d.label || 'A deck']; }); }, changed: function() { save(); } }); }
}
function tabs(p) { var sw = el('div', 'seg-control dk-tabs'); [['decks', 'Decks'], ['spreads', 'Spreads']].forEach(function(t) { var b = btn('seg-btn' + (_tab === t[0] ? ' active' : ''), t[1], t[0] === 'spreads' ? 'Lay out several cards at once, each in a place you name' : 'Draw from one deck'); b.setAttribute('aria-pressed', _tab === t[0] ? 'true' : 'false'); b.addEventListener('click', function() { if (_tab === t[0]) return; _tab = t[0]; _build = false; panelDraw(); }); sw.appendChild(b); }); p.appendChild(sw); }
function panelDraw() {
    var p = document.getElementById('deckBody'), camp = getActiveCampaign(), list = decksOf(camp), gm = gmHand(); if (!p) return; p.textContent = '';
    if (gm) tabs(p); else _tab = 'decks'; if (_tab === 'spreads') { spreadDraw(p, camp); return; }
    var it = list.filter(function(x) { return x.d.key === _at; })[0] || list[0] || null; if (it) _at = it.d.key;
    if (list.length > 1) { var sel = el('select', 'field dk-pick'); list.forEach(function(x) { var o = el('option', '', (x.d.label || 'A deck') + (x.own ? ' (this campaign)' : '')); o.value = x.d.key; sel.appendChild(o); }); sel.value = _at; sel.addEventListener('change', function() { _at = sel.value; _build = false; panelDraw(); }); p.appendChild(sel); }
    var UI = window.wpUi && window.wpUi.card ? window.wpUi : null;
    if (it && UI) {   // 1.6.2 (backlog 225, the item card): the deck in view as the app's own card: its name, what is left and discarded under it, the rail's own drawing as its picture, and its draw, shuffle and Start again at its foot
        var rs = document.querySelector ? document.querySelector('#railDecks svg') : null, cd = UI.card({ name: it.d.label || 'A deck', sub: (it.d.word || 'Deck') + ': ' + saysLeft(countsOf(camp, it.d)), pic: rs && rs.cloneNode ? rs.cloneNode(true) : undefined, cls: 'dk-view' });
        cd.sub.className += ' dk-count'; if (gm && !it.own) cd.body.appendChild(el('div', 'dk-count', 'This one comes with the system. Change it in the System editor.')); drawRow(cd.acts, camp, it); p.appendChild(cd.el);
    } else if (it) { if (list.length === 1) p.appendChild(el('div', 'dk-title', it.d.label || 'A deck')); p.appendChild(el('div', 'dk-count', (it.d.word || 'Deck') + ': ' + saysLeft(countsOf(camp, it.d)))); drawRow(p, camp, it); if (gm && !it.own) p.appendChild(el('div', 'dk-count', 'This one comes with the system. Change it in the System editor.')); }
    if (gm) {
        var b = btn('tool ghost sys-btn dk-build', _build ? 'Done' : 'Make a deck for this campaign', 'A deck or bag for this campaign alone. A roll cannot name one, so that no rule breaks when you remove it'); b.addEventListener('click', function() { _build = !_build; panelDraw(); }); p.appendChild(b);
        if (_build) { var host = el('div', 'dk-build-box'); p.appendChild(host); edit(host, { head: 'This campaign’s decks', note: 'Built like a system’s, and yours to change at any time.', prefix: 'C', list: function() { return Array.isArray(camp.decks) ? camp.decks : null; }, set: function(l) { if (l && l.length) camp.decks = l; else delete camp.decks; }, changed: function() { save(); var n = net(); if (n && typeof n.decksTell === 'function') n.decksTell(camp); sync(); } }); }
    } else if (!it) p.appendChild(el('div', 'dk-count', 'No decks here yet.'));
}
function open(key) { var el0 = document.getElementById('deckPanel'); if (!el0) return; if (typeof key === 'string') _at = key; el0.style.display = 'flex'; panelDraw(); if (window.wpFloats && window.wpFloats.reveal) window.wpFloats.reveal(el0); }
function close() { var el0 = document.getElementById('deckPanel'); if (el0) el0.style.display = 'none'; _build = false; }
function sync() {
    var box = document.getElementById('deckNavList'), sec = box && box.closest ? box.closest('.sidebar-section') : null, rb = document.getElementById('railDecks'), camp = getActiveCampaign(); if (!box) return;
    var list = decksOf(camp), gm = gmHand(), off = !!(net() && net().stream) || (!list.length && !gm); if (sec) sec.hidden = off; if (rb) rb.hidden = off;
    var sig = JSON.stringify(list.map(function(x) { return [x.d.key, x.d.label, countsOf(camp, x.d)]; }));
    if (sig !== _sig) { _sig = sig; box.textContent = ''; list.forEach(function(x) { var r = btn('ch-row dk-row', '', 'Open this'); r.appendChild(el('span', 'dk-rowname', x.d.label || 'A deck')); r.appendChild(el('span', 'dk-count', saysLeft(countsOf(camp, x.d)))); r.addEventListener('click', function() { open(x.d.key); }); box.appendChild(r); }); }
    var p = document.getElementById('deckPanel'); if (p && p.style.display !== 'none' && !_build) panelDraw();
}
function wire() {
    var add = document.getElementById('newDeckBtn'); if (add) add.addEventListener('click', function() { _build = true; open(); });
    var cl = document.getElementById('deckCloseBtn'); if (cl) cl.addEventListener('click', close);
    var head = document.getElementById('deckHead'), p = document.getElementById('deckPanel'); if (head && p) { var drag = null; head.addEventListener('pointerdown', function(e) { if (e.target && e.target.closest && e.target.closest('button')) return; var r = p.getBoundingClientRect(); drag = { x: e.clientX - r.left, y: e.clientY - r.top }; }); document.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = Math.max(0, e.clientX - drag.x) + 'px'; p.style.top = Math.max(0, e.clientY - drag.y) + 'px'; }); document.addEventListener('pointerup', function() { drag = null; }); }
    sync();
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
if (typeof window !== 'undefined') window.wpDeckWin = { sync: sync, open: open, close: close };
export { sync, open, close, handsFor };
