/* The name button's pure half (1.6.2, backlog 147; the owner, 2026-11-06, by prompt: "Lists, else a maker (Recommended)"). A system may keep
   name lists, each with a kind (characters, places, or both), written one name a line in the System editor's Rules tab. Where a system keeps
   none of a kind, a name is made from sounds of Waypoint's own: every piece below was written for Waypoint, and no list of any real people's or
   any game's names ships. Pure: it reads only its arguments, and a random source is handed in. namecheck runs it */
'use strict';
var NAME_LISTS = 24, NAME_MAX = 500, NAME_LEN = 60;
var KINDS = Object.freeze(['person', 'place', 'any']);
// the maker's styles: each a set of beginnings, middles and endings
var STYLES = Object.freeze({
    soft: { label: 'Soft', kind: 'person', a: ['Ae', 'Al', 'Ar', 'Be', 'Ca', 'El', 'Fae', 'Il', 'Ka', 'Le', 'Li', 'Ma', 'Mi', 'Na', 'Ri', 'Sa', 'Se', 'Ta', 'Va', 'Ya'], m: ['la', 'li', 'ri', 'na', 'se', 've', 'ra', 'mi', 'a', 'e', '', ''], z: ['ra', 'na', 'lia', 'wen', 'riel', 'sa', 'ny', 'ael', 'ith', 'ina', 'el', 'is'] },
    hard: { label: 'Hard', kind: 'person', a: ['Bra', 'Dro', 'Gor', 'Kar', 'Thu', 'Gra', 'Dur', 'Bor', 'Kra', 'Mor', 'Ruk', 'Tor', 'Vor', 'Grim', 'Har', 'Brog'], m: ['ga', 'ru', 'do', 'ka', 'mo', 'bu', '', '', ''], z: ['k', 'g', 'dar', 'grim', 'ok', 'mund', 'rak', 'th', 'dun', 'gar', 'ur', 'an'] },
    old: { label: 'Old', kind: 'person', a: ['Al', 'Ber', 'Cor', 'Ed', 'Gal', 'Hal', 'Os', 'Wil', 'Ald', 'Bran', 'Eld', 'Fen', 'Gar', 'Mar', 'Rod', 'Tam', 'Ul', 'Wyn'], m: ['a', 'e', 'i', 'o', 'ri', 'an', 'el', '', '', ''], z: ['ric', 'win', 'mund', 'bert', 'wald', 'ard', 'old', 'an', 'eth', 'is', 'ton', 'ra'] },
    place: { label: 'Place', kind: 'place', a: ['Ash', 'Black', 'Briar', 'Cold', 'Elder', 'Fair', 'Gold', 'Grey', 'High', 'Iron', 'Mill', 'Oak', 'Raven', 'Red', 'Salt', 'Stone', 'Thorn', 'West', 'Wolf', 'Wyn'], m: [''], z: ['brook', 'bury', 'dale', 'fell', 'ford', 'gate', 'haven', 'hold', 'hollow', 'marsh', 'mere', 'moor', 'reach', 'stead', 'ton', 'vale', 'wick', 'wood', 'cross', 'fall'] }
});
var STYLE_KEYS = Object.freeze(Object.keys(STYLES));
function rnd01(rnd) { var v = typeof rnd === 'function' ? Number(rnd()) : Math.random(); return isFinite(v) && v >= 0 && v < 1 ? v : 0; }
function pickOf(arr, rnd) { return arr[Math.floor(rnd01(rnd) * arr.length)]; }
function oneLine(s, n) { return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : ''; }
// a name of the maker's own in a style (else one the kind asks for: a place, or any person style)
function makeName(rnd, style, kind) {
    var key = typeof style === 'string' && Object.prototype.hasOwnProperty.call(STYLES, style) ? style : kind === 'place' ? 'place' : pickOf(['soft', 'hard', 'old'], rnd), s = STYLES[key];
    var out = pickOf(s.a, rnd) + pickOf(s.m, rnd) + pickOf(s.z, rnd);
    return out.charAt(0).toUpperCase() + out.slice(1).toLowerCase();
}
// the names written in a list's box: one a line, or between commas; each once, ignoring case, NAME_MAX at most
function namesFromText(text) {
    var out = [], seen = Object.create(null);
    String(typeof text === 'string' ? text : '').split(/[\n,]/).forEach(function(p) { var n = oneLine(p, NAME_LEN), k = n.toLowerCase(); if (!n || seen[k] || out.length >= NAME_MAX) return; seen[k] = 1; out.push(n); });
    return out;
}
// a system's name lists, as Save keeps them: { key, label, kind?, names, vis? }. A key is made once (N and a number) and never shown; kind 'any'
// is written as none; a list with no name and no names goes; a list for the GM alone never reaches players. Absent (null) where none is left
function cleanNameLists(v, gmView) {
    if (!Array.isArray(v)) return null;
    var out = [], keys = Object.create(null);
    v.slice(0, NAME_LISTS * 2).forEach(function(x) {
        if (!x || typeof x !== 'object' || Array.isArray(x) || out.length >= NAME_LISTS) return;
        var names = namesFromText(Array.isArray(x.names) ? x.names.filter(function(n) { return typeof n === 'string'; }).join('\n') : ''), label = oneLine(x.label, NAME_LEN);
        if (!names.length && !label) return;
        if (x.vis === 'gm' && gmView === false) return;
        var key = typeof x.key === 'string' && /^N[0-9]{1,3}$/.test(x.key) && !keys[x.key] ? x.key : '';
        if (!key) { for (var i = 1; i < 1000; i++) if (!keys['N' + i]) { key = 'N' + i; break; } }
        keys[key] = 1;
        var o = { key: key, label: label || 'Names', names: names };
        if (x.kind === 'person' || x.kind === 'place') o.kind = x.kind;
        if (x.vis === 'gm') o.vis = 'gm';
        out.push(o);
    });
    return out.length ? out : null;
}
// the lists that serve a kind ('person' or 'place'): a list of that kind or of both
function namesFor(lists, kind) { return (Array.isArray(lists) ? lists : []).filter(function(l) { return l && Array.isArray(l.names) && l.names.length && (!l.kind || l.kind === kind || kind === 'any'); }); }
// one name: from the list named by key, else from the lists of the kind (each name as likely), else the maker's own
function nameFrom(rnd, lists, kind, key) {
    var ls = namesFor(lists, kind), one = typeof key === 'string' && key ? ls.filter(function(l) { return l.key === key; })[0] : null;
    if (one) return pickOf(one.names, rnd);
    var all = []; ls.forEach(function(l) { all = all.concat(l.names); });
    return all.length ? pickOf(all, rnd) : makeName(rnd, null, kind);
}
var API = { NAME_LISTS: NAME_LISTS, NAME_MAX: NAME_MAX, NAME_LEN: NAME_LEN, KINDS: KINDS, STYLES: STYLES, STYLE_KEYS: STYLE_KEYS, makeName: makeName, namesFromText: namesFromText, cleanNameLists: cleanNameLists, namesFor: namesFor, nameFrom: nameFrom };
if (typeof window !== 'undefined') window.wpNameCore = API;
export { NAME_LISTS, NAME_MAX, NAME_LEN, KINDS, STYLES, STYLE_KEYS, makeName, namesFromText, cleanNameLists, namesFor, nameFrom };
