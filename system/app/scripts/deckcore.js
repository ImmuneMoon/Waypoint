// deckcore.js: decks and bags (1.6.2, backlog 210 d, docs/DECKS_PLAN.md; the owner, 2026-11-02, by prompt: "Either place", one thing with a choice of three after a draw). Pure: it reads nothing but its arguments.
// A deck: { key, label, word?, vis?, after, stats, cards }. key is made once and never shown; word is what the sheet calls it; after is back (goes back at once), discard (a discard pile until a reshuffle) or gone (out for good);
// stats are the numbers a card holds; a card is { name, n?, vals?, pic?, ends? }, n its copies, vals a number by a stat's key, pic the campaign's own picture, ends true for a card that ends the round.
// A pile is the campaign's own: { draw, disc, out, last }, each a list of places in cards. A pile's draw order is the host's secret, and never leaves it: pileCounts is what a table is told
'use strict';
import { cleanTexSrc } from './fogcore.js';   // a picture is one of the campaign's own, by the map's own rule
var DECKS_MAX = 48, CARDS_MAX = 300, STATS_MAX = 6, COPIES_MAX = 99, DRAW_MAX = 20, PILE_MAX = 3000;
var AFTER = ['back', 'discard', 'gone'], KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,23}$/, STAT_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
var CTRL = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');
function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
function cut(v, n) { if (typeof v !== 'string') return ''; return Array.from(v.replace(CTRL, ' ').trim()).slice(0, n).join(''); }
function num(v) { return typeof v === 'number' && isFinite(v) ? Math.max(-1e9, Math.min(1e9, v)) : 0; }
function cleanCard(c, stats) {
    if (!isObj(c)) return null; var name = cut(c.name, 80); if (!name) return null; var o = { name: name };
    var n = typeof c.n === 'number' && isFinite(c.n) ? Math.max(1, Math.min(COPIES_MAX, Math.floor(c.n))) : 1; if (n > 1) o.n = n;
    var vals = {}, any = false; if (isObj(c.vals)) stats.forEach(function(s) { if (Object.prototype.hasOwnProperty.call(c.vals, s.key) && typeof c.vals[s.key] === 'number' && isFinite(c.vals[s.key]) && c.vals[s.key] !== 0) { vals[s.key] = num(c.vals[s.key]); any = true; } }); if (any) o.vals = vals;
    var pic = cleanTexSrc(c.pic); if (pic) o.pic = pic;
    if (c.ends === true) o.ends = true; return o;
}
function cleanDeck(d, keyRe) {
    if (!isObj(d) || typeof d.key !== 'string' || !KEY_RE.test(d.key) || (keyRe && !keyRe.test(d.key)) || d.key in Object.prototype) return null;
    var o = { key: d.key, label: cut(d.label, 60) || 'A deck', after: AFTER.indexOf(d.after) >= 0 ? d.after : 'discard', stats: [], cards: [] }, word = cut(d.word, 24); if (word) o.word = word; if (d.vis === 'gm') o.vis = 'gm';
    var seen = Object.create(null); (Array.isArray(d.stats) ? d.stats : []).slice(0, STATS_MAX * 4).forEach(function(s) { if (o.stats.length >= STATS_MAX || !isObj(s) || typeof s.key !== 'string' || !STAT_RE.test(s.key) || s.key in Object.prototype || seen[s.key.toLowerCase()]) return; seen[s.key.toLowerCase()] = 1; o.stats.push({ key: s.key, label: cut(s.label, 40) || s.key }); });
    (Array.isArray(d.cards) ? d.cards : []).slice(0, CARDS_MAX * 2).forEach(function(c) { if (o.cards.length >= CARDS_MAX) return; var k = cleanCard(c, o.stats); if (k) o.cards.push(k); });
    return o;
}
function cleanDecks(list, gmView, keyRe) {   // gmView false leaves out what is the GM's alone. Answers a list, empty for none
    var out = [], seen = Object.create(null); (Array.isArray(list) ? list : []).slice(0, DECKS_MAX * 4).forEach(function(d) { if (out.length >= DECKS_MAX) return; var k = cleanDeck(d, keyRe); if (!k || seen[k.key.toLowerCase()] || (!gmView && k.vis === 'gm')) return; seen[k.key.toLowerCase()] = 1; out.push(k); });
    return out;
}
function deckOf(list, key) { var k = String(key).toLowerCase(); return (Array.isArray(list) ? list : []).filter(function(d) { return isObj(d) && typeof d.key === 'string' && d.key.toLowerCase() === k; })[0] || null; }
function total(d) { return (isObj(d) && Array.isArray(d.cards) ? d.cards : []).reduce(function(a, c) { return a + (isObj(c) && typeof c.n === 'number' ? c.n : 1); }, 0); }
function allPlaces(d) { var o = []; d.cards.forEach(function(c, i) { for (var k = 0; k < (c.n || 1) && o.length < PILE_MAX; k++) o.push(i); }); return o; }
function shuffled(a, rnd) { var o = a.slice(); for (var i = o.length - 1; i > 0; i--) { var j = rnd(i + 1) - 1, t = o[i]; o[i] = o[j]; o[j] = t; } return o; }   // rnd(n): a whole number from 1 to n
function freshPile(d, rnd) { return { draw: shuffled(allPlaces(d), rnd), disc: [], out: [], last: null }; }
function cleanPile(p, d) {   // a stored pile as data: places that are no card go, and a card is never in it more often than it has copies
    if (!isObj(p) || !isObj(d) || !Array.isArray(d.cards)) return null; var left = d.cards.map(function(c) { return c.n || 1; });
    var keep = function(l) { var o = []; (Array.isArray(l) ? l : []).slice(0, PILE_MAX * 2).forEach(function(i) { if (typeof i === 'number' && Math.floor(i) === i && i >= 0 && i < left.length && left[i] > 0) { left[i]--; o.push(i); } }); return o; };
    var out = { draw: keep(p.draw), disc: keep(p.disc), out: keep(p.out), last: typeof p.last === 'number' && Math.floor(p.last) === p.last && p.last >= 0 && p.last < left.length ? p.last : null }; return out;
}
function pileCounts(p, d) { if (!isObj(p)) return { left: isObj(d) ? total(d) : 0, disc: 0, last: null }; return { left: Array.isArray(p.draw) ? p.draw.length : 0, disc: Array.isArray(p.disc) ? p.disc.length : 0, last: typeof p.last === 'number' ? p.last : null }; }
function cleanCounts(v, d) { if (!isObj(v) || !isObj(d)) return null; var w = function(x) { return typeof x === 'number' && Math.floor(x) === x && x >= 0 && x <= PILE_MAX ? x : 0; }; return { left: w(v.left), disc: w(v.disc), last: typeof v.last === 'number' && Math.floor(v.last) === v.last && v.last >= 0 && v.last < d.cards.length ? v.last : null }; }
// A draw on a copy of the pile: answers { pile, cards: [places], reshuffled }. held true: the card leaves the pile for a hand, and comes back through returnCard
function drawCards(d, p0, n, rnd, held) {
    var p = isObj(p0) ? { draw: p0.draw.slice(), disc: p0.disc.slice(), out: p0.out.slice(), last: p0.last } : freshPile(d, rnd), got = [], re = false; n = Math.max(0, Math.min(DRAW_MAX, n | 0));
    for (var i = 0; i < n; i++) {
        if (d.after === 'back' && !held) { var all = allPlaces(d); if (!all.length) break; var k = all[rnd(all.length) - 1]; got.push(k); continue; }
        if (!p.draw.length && p.disc.length) { p.draw = shuffled(p.disc, rnd); p.disc = []; re = true; }   // a deck that runs out is reshuffled, as a table would
        if (!p.draw.length) break; var c = p.draw.pop(); got.push(c); if (held) continue; if (d.after === 'gone') p.out.push(c); else p.disc.push(c);
    }
    if (got.length) p.last = got[got.length - 1];
    return { pile: p, cards: got, reshuffled: re };
}
// Shuffle: what was discarded goes back in. fresh true starts the whole deck again but for what hands hold (out of the pile by count)
function shufflePile(d, p0, rnd, fresh, held) {
    if (!isObj(p0) || fresh === true) { var rest = allPlaces(d); (Array.isArray(held) ? held : []).forEach(function(i) { var at = rest.indexOf(i); if (at >= 0) rest.splice(at, 1); }); return { draw: shuffled(rest, rnd), disc: [], out: [], last: null }; }
    return { draw: shuffled(p0.draw.concat(p0.disc), rnd), disc: [], out: p0.out.slice(), last: p0.last };
}
function returnCard(d, p0, i) {   // a card comes back from a hand, by the deck's own rule
    var p = isObj(p0) ? { draw: p0.draw.slice(), disc: p0.disc.slice(), out: p0.out.slice(), last: p0.last } : { draw: [], disc: [], out: [], last: null }; if (typeof i !== 'number' || i < 0 || i >= d.cards.length) return p;
    if (d.after === 'gone') p.out.push(i); else if (d.after === 'discard') p.disc.push(i); return p;
}
function cardVal(d, i, stat) { var c = isObj(d) && Array.isArray(d.cards) ? d.cards[i] : null, k = String(stat).toLowerCase(), hit = 0; if (c && isObj(c.vals)) Object.keys(c.vals).forEach(function(s) { if (s.toLowerCase() === k) hit = c.vals[s]; }); return hit; }
function statKey(label, stats) { var base = String(label || '').replace(/[^A-Za-z0-9_]+/g, ''); if (!/^[A-Za-z]/.test(base)) base = 'Num' + base; base = base.slice(0, 28); var k = base, n = 2; while ((stats || []).some(function(s) { return s && String(s.key).toLowerCase() === k.toLowerCase(); })) k = base + n++; return k; }
function readCards(text, stats) {   // pasted lines: a name, then a number for each of the deck's stats, by commas. Answers cards
    var out = []; String(text || '').split('\n').forEach(function(l) { var p = l.split(','), name = cut(p[0], 80); if (!name || out.length >= CARDS_MAX) return; var c = { name: name }, vals = {}; (stats || []).forEach(function(s, i) { var n = Number(String(p[i + 1] === undefined ? '' : p[i + 1]).trim()); if (String(p[i + 1] === undefined ? '' : p[i + 1]).trim() !== '' && isFinite(n) && n !== 0) vals[s.key] = n; }); if (Object.keys(vals).length) c.vals = vals; out.push(c); });
    return out;
}
var API = { cleanDeck: cleanDeck, cleanDecks: cleanDecks, deckOf: deckOf, total: total, freshPile: freshPile, cleanPile: cleanPile, pileCounts: pileCounts, cleanCounts: cleanCounts, drawCards: drawCards, shufflePile: shufflePile, returnCard: returnCard, cardVal: cardVal, statKey: statKey, readCards: readCards, DECKS_MAX: DECKS_MAX, CARDS_MAX: CARDS_MAX, STATS_MAX: STATS_MAX, COPIES_MAX: COPIES_MAX, DRAW_MAX: DRAW_MAX };
if (typeof window !== 'undefined') window.wpDeckCore = API;
export { cleanDeck, cleanDecks, deckOf, total, freshPile, cleanPile, pileCounts, cleanCounts, drawCards, shufflePile, returnCard, cardVal, statKey, readCards, DECKS_MAX, CARDS_MAX, STATS_MAX, COPIES_MAX, DRAW_MAX };
