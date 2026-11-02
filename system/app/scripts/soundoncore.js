/* Sounds on actions (1.6.2) — the pure half. The owner, 2026-11-01: "I would like to assign some of the sound bites to character actions or
   environmental actions, like the explosions for instance, a gunshot or a weapon swing. this should be something that the GM can do in
   general". Set in one list under the Sound panel and by a small button where the thing is ("Both"); heard by those on the map where it
   happened, and the GM always; a hidden act is silent for players, with no tick to say otherwise.

   A campaign keeps camp.soundOn, a list (absent when empty), so that a system file stays free of it. It is the GM's alone and never leaves
   the host. A line is { ev, snd, n?, sn? }: what happens, a sound's id in the campaign's library, and the words each had when the line was
   made, kept to say what a line was for once its roll or its sound is gone. ev is one of:
     { k: 'roll', r }                        a system roll or apply action, by its id
     { k: 'list', f, i, l, key?, kn?, cat? } a list's roll or action: the list's field id, the roll's place and its label; a line may name one
                                             entry (key, its key or id, and kn, its name) or one category (cat), for a kind of weapon
     { k: 'blast' } { k: 'mine' }            a blast goes off; a mine goes off
     { k: 'door', on?, map?, pc? }           a door opens, closes or (no on) either; every door, or one by its map and piece
     { k: 'zone', map?, pc? }                a trigger zone is entered; any, or one
   A line is known by its event (evKey): one line an event. The most particular line that fits is the one that plays (pick).
   No DOM, no state: tools/soundoncheck.js runs it under Node. Published as window.wpSoundOnCore. */
'use strict';

var LIMITS = Object.freeze({ lines: 200, id: 160, words: 120, cat: 40, rolls: 160 });
var KINDS = ['roll', 'list', 'blast', 'mine', 'door', 'zone'];
var SND_RE = /^[A-Za-z0-9_-]{1,40}$/;   // soundcore's own id
var CTRL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
var CTRL_G = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
function own(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
function cleanId(v) { return typeof v === 'string' && v.length > 0 && v.length <= LIMITS.id && !CTRL.test(v) && !(v in Object.prototype) ? v : ''; }
function words(v, n) { if (typeof v !== 'string') return ''; return Array.from(v.replace(CTRL_G, ' ').trim()).slice(0, n || LIMITS.words).join('').trim(); }
function lower(s) { return String(s || '').toLowerCase(); }
function place(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0 && v < LIMITS.rolls ? v : null; }

function cleanEv(e) {
    if (!isObj(e)) return null;
    var k = own(e, 'k') ? e.k : '', out, f, i, l, key, cat, map, pc;
    if (k === 'roll') { f = cleanId(own(e, 'r') ? e.r : ''); return f ? { k: k, r: f } : null; }
    if (k === 'blast' || k === 'mine') return { k: k };
    if (k === 'list') {
        f = cleanId(own(e, 'f') ? e.f : ''); i = place(own(e, 'i') ? e.i : null); l = words(own(e, 'l') ? e.l : ''); if (!f || (i === null && !l)) return null;
        out = { k: k, f: f }; if (i !== null) out.i = i; if (l) out.l = l;
        key = cleanId(own(e, 'key') ? e.key : ''); cat = words(own(e, 'cat') ? e.cat : '', LIMITS.cat);
        if (key) { out.key = key; var kn = words(own(e, 'kn') ? e.kn : ''); if (kn) out.kn = kn; } else if (cat) out.cat = cat;   // one entry, or one category
        return out;
    }
    if (k === 'door' || k === 'zone') {
        out = { k: k }; if (k === 'door' && own(e, 'on') && (e.on === 'open' || e.on === 'close')) out.on = e.on;
        map = cleanId(own(e, 'map') ? e.map : ''); pc = cleanId(own(e, 'pc') ? e.pc : ''); if (map && pc) { out.map = map; out.pc = pc; }
        return out;
    }
    return null;
}
function evKey(ev) {   // what makes two lines one: the roll by its label where it has one, since a place moves when a list's rolls are edited
    if (!isObj(ev)) return '';
    if (ev.k === 'roll') return 'roll|' + ev.r;
    if (ev.k === 'list') return 'list|' + ev.f + '|' + (ev.l ? 'l' + ev.l : 'i' + ev.i) + '|' + (ev.key ? 'k' + ev.key : ev.cat ? 'c' + lower(ev.cat) : '');
    if (ev.k === 'door') return 'door|' + (ev.on || '') + '|' + (ev.pc ? ev.map + '|' + ev.pc : '');
    if (ev.k === 'zone') return 'zone|' + (ev.pc ? ev.map + '|' + ev.pc : '');
    return String(ev.k);
}
function cleanLine(l) {
    if (!isObj(l)) return null;
    var ev = cleanEv(own(l, 'ev') ? l.ev : null), snd = own(l, 'snd') && typeof l.snd === 'string' && SND_RE.test(l.snd) && !(l.snd in Object.prototype) ? l.snd : ''; if (!ev || !snd) return null;
    var out = { ev: ev, snd: snd }, n = words(own(l, 'n') ? l.n : ''), sn = words(own(l, 'sn') ? l.sn : ''); if (n) out.n = n; if (sn) out.sn = sn;
    return out;
}
// The list as the app keeps it: a list of lines, one an event, 200 at most. A line whose roll or sound is gone stays: the list says so
function cleanSoundOn(v) {
    var out = [], seen = Object.create(null); if (!Array.isArray(v)) return out;
    for (var i = 0; i < v.length && i < LIMITS.lines * 4 && out.length < LIMITS.lines; i++) { var ln = cleanLine(v[i]), k = ln ? evKey(ln.ev) : ''; if (!ln || seen[k]) continue; seen[k] = 1; out.push(ln); }
    return out;
}
// A file's lines over the campaign's: a line of the same event takes the file's sound, a new one is added, as a Merge does the sound library
function mergeLines(have, more) {
    var list = cleanSoundOn(have), adds = cleanSoundOn(more), at = Object.create(null); list.forEach(function(ln, i) { at[evKey(ln.ev)] = i; });
    adds.forEach(function(ln) { var k = evKey(ln.ev); if (at[k] !== undefined) list[at[k]] = ln; else if (list.length < LIMITS.lines) { at[k] = list.length; list.push(ln); } });
    return list;
}

function fieldOf(sys, id) { var hit = null; (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (!hit && isObj(f) && f.id === id && f.kind === 'item-list') hit = f; }); return hit; }
function rollsOf(sys, id) { var f = fieldOf(sys, id); return f && isObj(f.list) && Array.isArray(f.list.rolls) ? f.list.rolls : []; }
function rollOf(sys, id) { var hit = null; (isObj(sys) && Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (!hit && isObj(r) && r.id === id) hit = r; }); return hit; }
function labelOf(r) { return words(isObj(r) && typeof r.label === 'string' ? r.label.split('{')[0] : '') || 'Roll'; }   // a label's own words, its {formula} captions left out
// Where a line's list roll stands now: its place where the label still reads the same, else by its label, else its place, -1 for a roll that is gone
function linePlace(sys, ev) {
    var rolls = rollsOf(sys, ev && ev.f), i; if (!isObj(ev)) return -1;
    if (typeof ev.i === 'number' && isObj(rolls[ev.i]) && (!ev.l || labelOf(rolls[ev.i]) === ev.l)) return ev.i;
    if (ev.l) for (i = 0; i < rolls.length; i++) if (isObj(rolls[i]) && labelOf(rolls[i]) === ev.l) return i;
    return typeof ev.i === 'number' && isObj(rolls[ev.i]) ? ev.i : -1;
}
// How particular a line is for what happened: 0 it does not fit
function rank(ev, what, sys) {
    if (!isObj(ev) || !isObj(what)) return 0;
    if (ev.k === 'roll') return what.k === 'roll' && ev.r === what.r ? 1 : 0;
    if (ev.k === 'list') {
        if (what.k !== 'list' || ev.f !== what.f || linePlace(sys, ev) !== what.i) return 0;
        if (ev.key) return ev.key === what.key || ev.key === what.id ? 3 : 0;
        if (ev.cat) return lower(ev.cat) === lower(what.cat) ? 2 : 0;
        return 1;
    }
    if (ev.k === 'mine') return what.k === 'mine' ? 2 : 0;
    if (ev.k === 'blast') return what.k === 'blast' || what.k === 'mine' ? 1 : 0;   // a mine is a blast, where it has no line of its own
    if (ev.k === 'door' || ev.k === 'zone') {
        if (what.k !== ev.k) return 0;
        if (ev.on && ev.on !== what.on) return 0;
        if (ev.pc && (ev.pc !== what.pc || ev.map !== what.map)) return 0;
        return 1 + (ev.pc ? 2 : 0) + (ev.on ? 1 : 0);
    }
    return 0;
}
// The one line that plays: the most particular that fits, the first of those
function pick(list, what, sys) {
    var best = null, top = 0; (Array.isArray(list) ? list : []).forEach(function(ln) { var r = isObj(ln) ? rank(ln.ev, what, sys) : 0; if (r > top) { top = r; best = ln; } });
    return best;
}
// What a press was, read from the system and the character. press: { src, act, row }: src the button's own word (dicecore cleanRollReq), else
// the roll the press named. view: the system as the player who pressed it holds it, whose places count for their press: a roll their view does
// not hold is no press of theirs. S: { rowIdOf, rowDef, rollPlace }. null: nothing a line can name
function pressOf(sys, press, ch, S, view) {
    if (!isObj(sys) || !isObj(press)) return null;
    var src = isObj(press.src) ? press.src : null, act = src && typeof src.r === 'string' ? src.r : typeof press.act === 'string' ? press.act : '';
    var row = src && typeof src.l === 'string' ? { f: src.l, r: src.row, i: src.i } : isObj(press.row) ? press.row : null;
    if (act && !(src && src.l)) { if (view && !rollOf(view, act)) return null; return rollOf(sys, act) ? { k: 'roll', r: act } : null; }
    if (!row || typeof row.i !== 'number') return null;
    var i = row.i;
    if (view) { if (!isObj(rollsOf(view, row.f)[i])) return null; i = S && typeof S.rollPlace === 'function' ? S.rollPlace(view, sys, row.f, i) : -1; if (i < 0) return null; }
    var r = rollsOf(sys, row.f)[i]; if (!isObj(r)) return null;
    var out = { k: 'list', f: row.f, i: i }, def = null, rid = '';
    if (S && typeof S.rowDef === 'function') {
        if (typeof row.k === 'string') { rid = row.k; var uk = S.rowDef(sys, { defId: row.k }); def = uk ? uk.def : null; }   // an entry nobody holds
        else if (typeof row.r === 'string' && isObj(ch) && isObj(ch.values) && Array.isArray(ch.values[row.f]) && typeof S.rowIdOf === 'function') {
            var held = ch.values[row.f].filter(function(x) { return isObj(x) && S.rowIdOf(x) === row.r; })[0], rd = held ? S.rowDef(sys, held) : null;
            if (held && typeof held.defId === 'string') rid = held.defId; def = rd ? rd.def : null;
        }
    }
    if (rid) out.id = rid;
    if (isObj(def)) { if (typeof def.key === 'string' && def.key) out.key = def.key; if (typeof def.category === 'string' && def.category) out.cat = def.category; }
    return out;
}
// The zone a token's move carried it into: the first shown zone that holds its centre, none where it held it when the gesture began. The
// test net.js triggerFire runs for a zone's message; a mine is a blast, never a zone
function zoneOf(map, w, from) {
    if (!isObj(map) || !isObj(w) || !Array.isArray(map.whiteboard)) return null;
    var hw = (Number(w.w) || 100) / 2, hh = (Number(w.h) || 100) / 2, cx = (Number(w.x) || 0) + hw, cy = (Number(w.y) || 0) + hh;
    var fx = isObj(from) ? (Number(from.x) || 0) + hw : null, fy = isObj(from) ? (Number(from.y) || 0) + hh : null;
    for (var i = 0; i < map.whiteboard.length; i++) {
        var t = map.whiteboard[i]; if (!isObj(t) || t.type !== 'trigger' || t.hidden || t.mine) continue;
        var tx = Number(t.x) || 0, ty = Number(t.y) || 0, tw = Number(t.w) || 100, th = Number(t.h) || 100;
        if (!(cx >= tx && cx <= tx + tw && cy >= ty && cy <= ty + th)) continue;
        return fx !== null && fx >= tx && fx <= tx + tw && fy >= ty && fy <= ty + th ? null : t;
    }
    return null;
}

function pieceOf(camp, mapId, pc) {
    var map = isObj(camp) && isObj(camp.items) && own(camp.items, mapId) ? camp.items[mapId] : null;
    return isObj(map) && Array.isArray(map.whiteboard) ? map.whiteboard.filter(function(w) { return isObj(w) && w.id === pc; })[0] || null : null;
}
function mapName(camp, mapId) { var m = isObj(camp) && isObj(camp.items) && own(camp.items, mapId) ? camp.items[mapId] : null; return words(isObj(m) && isObj(m.meta) ? m.meta.title : '') || 'a map'; }
// What a line is for, in plain words, and why it can no longer play. n: the words the line had when it was made, for what has gone
function whatWords(ev, sys, camp, n) {
    if (!isObj(ev)) return { text: n || 'An action', gone: 'This line cannot be read.' };
    var was = typeof n === 'string' && n ? n : '', tail = '', f, at, r, w, nm;
    if (ev.k === 'roll') { r = rollOf(sys, ev.r); return r ? { text: labelOf(r), gone: '' } : { text: was || 'A roll', gone: 'This roll is gone from the system.' }; }
    if (ev.k === 'list') {
        f = fieldOf(sys, ev.f); at = f ? linePlace(sys, ev) : -1;
        if (!f) return { text: was || 'A roll on a list', gone: 'This list is gone from the system.' };
        if (at < 0) return { text: was || 'A roll on ' + words(f.label), gone: 'This roll is gone from its list.' };
        tail = ev.key ? ' for ' + (ev.kn || 'one entry') : ev.cat ? ' for ' + ev.cat : '';
        return { text: (words(f.label) || 'A list') + ': ' + labelOf(rollsOf(sys, ev.f)[at]) + tail, gone: '' };
    }
    if (ev.k === 'blast') return { text: 'A blast goes off', gone: '' };
    if (ev.k === 'mine') return { text: 'A mine goes off', gone: '' };
    if (ev.k === 'door') {
        tail = ev.on === 'open' ? ' opens' : ev.on === 'close' ? ' closes' : ' opens or closes';
        if (!ev.pc) return { text: 'A door' + tail, gone: '' };
        w = pieceOf(camp, ev.map, ev.pc); nm = (w && words(w.name)) || 'The door';
        return w ? { text: nm + ' on ' + mapName(camp, ev.map) + tail, gone: '' } : { text: was || 'A door' + tail, gone: 'This door is gone from its map.' };
    }
    if (ev.k === 'zone') {
        if (!ev.pc) return { text: 'A trigger zone is entered', gone: '' };
        w = pieceOf(camp, ev.map, ev.pc); nm = (w && words(w.name)) || 'The trigger zone';
        return w ? { text: nm + ' on ' + mapName(camp, ev.map) + ' is entered', gone: '' } : { text: was || 'A trigger zone is entered', gone: 'This trigger zone is gone from its map.' };
    }
    return { text: was || 'An action', gone: 'This line cannot be read.' };
}
// Everything the add form offers, in groups: what happens on the map, the system's rolls and actions, then each list with rolls of its own
function choices(sys) {
    var out = [{ name: 'On the map', rows: [{ k: 'blast' }, { k: 'mine' }, { k: 'door' }, { k: 'door', on: 'open' }, { k: 'door', on: 'close' }, { k: 'zone' }].map(function(ev) { return { words: whatWords(ev, sys, null).text, ev: ev }; }) }];
    var rolls = (isObj(sys) && Array.isArray(sys.rolls) ? sys.rolls : []).filter(function(r) { return isObj(r) && cleanId(r.id); });
    if (rolls.length) out.push({ name: 'Rolls and actions', rows: rolls.map(function(r) { return { words: labelOf(r), ev: { k: 'roll', r: r.id } }; }) });
    (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list' || !cleanId(f.id) || !isObj(f.list) || !Array.isArray(f.list.rolls) || !f.list.rolls.length) return;
        var rows = []; f.list.rolls.forEach(function(r, i) { if (isObj(r) && i < LIMITS.rolls) rows.push({ words: labelOf(r), ev: { k: 'list', f: f.id, i: i, l: labelOf(r) } }); });
        if (rows.length) out.push({ name: words(f.label) || 'A list', rows: rows });
    });
    return out;
}

var API = { LIMITS: LIMITS, KINDS: KINDS, cleanEv: cleanEv, cleanLine: cleanLine, cleanSoundOn: cleanSoundOn, mergeLines: mergeLines, evKey: evKey, linePlace: linePlace, rank: rank, pick: pick, pressOf: pressOf, zoneOf: zoneOf, whatWords: whatWords, choices: choices, labelOf: labelOf };
if (typeof window !== 'undefined') window.wpSoundOnCore = API;
export { LIMITS, KINDS, cleanEv, cleanLine, cleanSoundOn, mergeLines, evKey, linePlace, rank, pick, pressOf, zoneOf, whatWords, choices, labelOf };
