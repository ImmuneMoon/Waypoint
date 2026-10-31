/* Game record, the pure half (1.6.0). The owner, 2026-10-31: a window for the GM that shows everything that happens in the game, "a complete
   record of the game for reference", easy to read and sorted by session; a session runs from Host to End Session, or to the moment
   Waypoint closed. reccore.js reads nothing but its arguments: what a line may hold, which chip shows it, what a session says of itself in
   the list, what a sheet's change says, and a session as text. record.js is the page's half. Published as window.wpRecCore. */
'use strict';

var VERSION = 1;
var CHIPS = Object.freeze([['all', 'Everything'], ['roll', 'Rolls'], ['bg', 'Background'], ['fight', 'Fights'], ['move', 'Moves'], ['sheet', 'Sheets'], ['player', 'Players'], ['chat', 'Chat'], ['table', 'Table'], ['gm', 'Yours']]);
var KIND = Object.freeze({ roll: 1, bg: 1, fight: 1, move: 1, sheet: 1, player: 1, chat: 1, table: 1, gm: 1 });
var ICON = Object.freeze({ roll: 'die', bg: 'hourglass', fight: 'fight', move: 'stairs-up', sheet: 'clip', player: 'people', chat: 'note', table: 'map', gm: 'pen' });
var TIP = 300, DETAIL = 400, WHO = 80;
// the Game Record's kinds, read as the record's chips: what a campaign logged before the record, and what is logged still
var OLD_KIND = Object.freeze({ player: 'player', handout: 'table', travel: 'move', share: 'table', chat: 'chat', dice: 'roll', table: 'table', items: 'sheet', char: 'sheet', time: 'bg' });

function str(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, n) : ''; }
// a line as the file keeps it: t the computer's clock, g the game's clock in words, k the chip, w who it is for, x what happened, d the detail, h kept from players
function cleanLine(o) {
    if (!o || typeof o !== 'object' || typeof o.t !== 'number' || !isFinite(o.t)) return null;
    var k = typeof o.k === 'string' && Object.prototype.hasOwnProperty.call(KIND, o.k) ? o.k : o.k === 'open' || o.k === 'end' || o.k === 'beat' ? o.k : 'table';
    var out = { t: o.t, k: k }, g = str(o.g, 60), w = str(o.w, WHO), x = str(o.x, TIP), d = str(o.d, DETAIL);
    if (g) out.g = g; if (w) out.w = w; if (x) out.x = x; if (d) out.d = d; if (o.h === 1 || o.h === true) out.h = 1;
    if (k === 'open' && typeof o.room === 'string') out.room = str(o.room, 20);
    if (k === 'end' && typeof o.how === 'string') out.how = str(o.how, 20);
    return out;
}
function parseFile(text) {
    var out = [];
    String(text || '').split('\n').forEach(function(l) { if (!l) return; try { var o = cleanLine(JSON.parse(l)); if (o) out.push(o); } catch (e) {} });
    return out;
}
function shown(line) { return !!line && line.k !== 'open' && line.k !== 'end' && line.k !== 'beat'; }
function chipHolds(line, chip) { return shown(line) && (!chip || chip === 'all' || line.k === chip); }
function wordsHold(line, q) {
    var words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return true;
    var text = [line.w, line.x, line.d, line.g].join(' ').toLowerCase();
    return words.every(function(w) { return text.indexOf(w) >= 0; });
}
function filter(lines, chip, q) { return lines.filter(function(l) { return chipHolds(l, chip) && wordsHold(l, q); }); }

function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
function spanWords(ms) {
    var m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60), r = m % 60;
    return h ? h + ' h ' + r + ' min' : plural(m, 'minute');
}
// a session in the list: { day, span, note } from the times a file gives. A session with no end line ended when its last line was written:
// a line goes down every minute and as the window closes, so that is the moment Waypoint closed
function sessionWords(b, fmt, live, now) {
    var head = b && b.head, start = head && typeof head.t === 'number' ? head.t : 0, ended = b && b.end && typeof b.end.t === 'number' ? b.end.t : 0, last = b && typeof b.last === 'number' ? b.last : start;
    var stop = live ? now : ended || last, how = live ? 'Still running' : ended ? 'Ended by End Session' : 'Waypoint closed';
    return { day: start ? fmt.day(start) : 'A session', span: start ? fmt.time(start) + (live ? ' to now' : ' to ' + fmt.time(stop)) : '', note: spanWords(stop - start) + '. ' + how };
}
function plays(names) {
    var n = (names || []).filter(function(x) { return typeof x === 'string' && x; });
    if (!n.length) return 'No character yet';
    return 'Plays ' + n[0] + (n.length > 1 ? ', and also ' + n.slice(1).join(', ') : '');
}
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function same(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } }
function figure(v) {
    if (v === null || v === undefined) return 'nothing';
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (typeof v === 'number') return String(Math.round(v * 100) / 100);
    if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
    if (isObj(v) && typeof v.cur === 'number') return figure(v.cur);
    return '';
}
function rowName(r, nameOf) { var n = ''; try { n = nameOf ? nameOf(r) : ''; } catch (e) {} return n || (isObj(r) && (r.name || (isObj(r.def) && r.def.name) || (isObj(r.ov) && r.ov.name))) || 'a row'; }
function rowKey(r) { return isObj(r) && typeof r.id === 'string' ? r.id : ''; }
// what a change of one field says: lines of { x, d }. A list says what came, what went and what was switched; a value says from and to
function fieldLines(label, was, now, nameOf) {
    if (same(was, now)) return [];
    var name = label || 'A field';
    if (Array.isArray(was) || Array.isArray(now)) {
        var a = Array.isArray(was) ? was : [], b = Array.isArray(now) ? now : [], byA = Object.create(null), byB = Object.create(null), out = [];
        a.forEach(function(r) { var k = rowKey(r); if (k) byA[k] = r; }); b.forEach(function(r) { var k = rowKey(r); if (k) byB[k] = r; });
        b.forEach(function(r) {
            var k = rowKey(r), o = k ? byA[k] : null;
            if (!o) { out.push({ x: name + ': added ' + rowName(r, nameOf) }); return; }
            if (same(o, r)) return;
            var nm = rowName(r, nameOf);
            if (!!o.on !== !!r.on && (o.on !== undefined || r.on !== undefined)) out.push({ x: name + ': ' + nm + ' switched ' + (r.on ? 'on' : 'off') });
            else if ((o.qty || 0) !== (r.qty || 0)) out.push({ x: name + ': ' + nm, d: 'Quantity ' + (o.qty || 0) + ' → ' + (r.qty || 0) });
            else if ((o.lvl || 0) !== (r.lvl || 0)) out.push({ x: name + ': ' + nm, d: 'Level ' + (o.lvl || 0) + ' → ' + (r.lvl || 0) });
            else out.push({ x: name + ': ' + nm + ' changed' });
        });
        a.forEach(function(r) { var k = rowKey(r); if (k && !byB[k]) out.push({ x: name + ': removed ' + rowName(r, nameOf) }); });
        return out;
    }
    var f0 = figure(was), f1 = figure(now);
    return [{ x: name, d: f0 && f1 ? f0 + ' → ' + f1 : 'Changed' }];
}
// a session as text, for Save as text
function asText(title, day, lines, fmt) {
    var head = title + '\n' + day + '\n\n';
    return head + lines.filter(shown).map(function(l) {
        return fmt.time(l.t) + (l.g ? '  ' + l.g : '') + '  ' + (l.w ? l.w + ': ' : '') + (l.x || '') + (l.d ? ' (' + l.d + ')' : '') + (l.h ? '  [kept from players]' : '');
    }).join('\n') + '\n';
}
// the Game Record a campaign kept before the record, as sessions of the same shape; what began at or after the first file's start is in that file
function oldSessions(log, before) {
    var groups = [], cur = null;
    (Array.isArray(log) ? log : []).forEach(function(e) {
        if (!e || typeof e.at !== 'number' || (before && e.at >= before)) return;
        var text = str(e.text, TIP);
        if (e.kind === 'session' && /started|resumed/.test(text)) { cur = { start: e.at, last: e.at, lines: [] }; groups.push(cur); return; }
        if (!cur) { cur = { start: e.at, last: e.at, lines: [] }; groups.push(cur); }
        cur.last = Math.max(cur.last, e.at);
        if (e.kind === 'session') { if (/ended/i.test(text)) cur.ended = e.at; return; }
        cur.lines.push({ t: e.at, k: Object.prototype.hasOwnProperty.call(OLD_KIND, e.kind) ? OLD_KIND[e.kind] : 'table', x: text });
    });
    return groups.reverse();
}
var API = Object.freeze({ VERSION: VERSION, CHIPS: CHIPS, ICON: ICON, OLD_KIND: OLD_KIND, cleanLine: cleanLine, parseFile: parseFile, shown: shown, chipHolds: chipHolds, wordsHold: wordsHold, filter: filter, spanWords: spanWords, sessionWords: sessionWords, plays: plays, figure: figure, fieldLines: fieldLines, asText: asText, oldSessions: oldSessions });
if (typeof window !== 'undefined') window.wpRecCore = API;
export { VERSION, CHIPS, ICON, OLD_KIND, cleanLine, parseFile, shown, chipHolds, wordsHold, filter, spanWords, sessionWords, plays, figure, fieldLines, asText, oldSessions };
