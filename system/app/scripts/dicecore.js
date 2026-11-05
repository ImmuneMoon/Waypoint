/* Dice (1.5.0) — the pure half: the limits, the validators for what comes off the wire (a roll request from a
   player, a roll record from the host, a refusal), the replay of a record through the formula engine, the chat
   command parser, the card / log text, the lone-d20 crit rule and the rate limiter. No DOM, no state, no engine
   import: the engine API (window.wpFormula) is passed in, so tools/dicecheck.js runs this under Node with a
   scripted engine. Published as window.wpDiceCore when a window exists. Design of record: docs/DICE_PLAN.md. */
'use strict';

var VERSION = '1.5.0';
var LIMITS = Object.freeze({
    expr: 1000,         // characters in a table roll: systemcore's LIMITS.formula, so a sheet roll never dies here (300 before 1.6.0, backlog 200)
    dice: 200,          // dice rolled in one table roll (the engine allows 1,000; a card must stay readable)
    draws: 1000,        // draws in a record — rerolls and explosions multiply dice; host and receivers share this cap
    perMs: 400,         // one roll per peer per 400 ms
    burst: 12,          // and 12 per peer per window
    windowMs: 10000,
    table: 40,          // 40 per table per window
    deny: 300,          // characters in a refusal's message
    timeoutMs: 5000,    // a client's pending request
    history: 20,        // the roller's recent list
    logChars: 300,      // describe() cap in the session log line
    names: 200,         // named values a record may carry (rolls from a character sheet)
    nameChars: 64,
    label: 60,          // a roll's label, the character's name on a card
    cardChars: 240,     // describe() cap in a toast / plain-text card
    swPicks: 80,        // 1.6.0: the roll switches one roll may name (systemcore LIMITS.rollSw a holder)
    rollSw: 40,         // a holder's bonuses, so a tick's place is below this (systemcore LIMITS.rollSw)
    applyLines: 120,     // an apply card's lines: one a change an action or a roll's Then makes (systemcore LIMITS.applyChanges; 8 before 1.6.0, 4 before 1.5.4)
    hits: 320,          // the hits one damage roll rolls for (systemcore HITS_MAX)
    hitFaces: 40,       // the dice a hit's card line shows (systemcore HIT_FACES)
    rowRolls: 160,      // a list's rolls, so a row roll's index is below this (systemcore LIMITS.rowRolls; 4 before 1.5.4, 8 before 1.6.0, 10 before the raise the session that builds a game system asked for)
    resistOr: 30        // the rolls besides the first a resist card offers (systemcore RESIST_OR)
});
var ID_RE = /^r_[A-Za-z0-9]{1,16}$/;
var RID_RE = /^[A-Za-z0-9_-]{1,24}$/;
var PEER_RE = /^[A-Za-z0-9_-]{1,80}$/;
var NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;   // a sheet key, dotted (Skill.Stealth, HP.max)
var CHAR_RE = /^c_[A-Za-z0-9_]{1,24}$/;
var CTRL_RE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');
var REASONS = { off: 1, slow: 1, many: 1, names: 1, error: 1, table: 1, char: 1, paused: 1 };

function str(v, cap) { return typeof v === 'string' ? v.slice(0, cap) : ''; }
function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
function cleanExpr(s) {
    if (typeof s !== 'string') return null;
    s = s.trim();
    if (!s || s.length > LIMITS.expr || CTRL_RE.test(s)) return null;
    return s;
}
// Stage 5a: fold a flat situational modifier into a roll so a POSITIVE mod always helps, whatever the system.
// parse = the engine's parser (window.wpFormula.parse), passed in so this stays pure/testable. Returns
// { ok:true, expr } (the new formula) or { ok:false }. A value roll gets "(expr) + N". A comparison roll is
// split at its top-level operator (the parser allows only one): roll-OVER (>,>=,=,!=) boosts the roll (left)
// side; roll-UNDER (<,<=) eases the target (right) side. The result is re-parsed so a broken formula is never
// produced — and, since it is just a longer formula string, the host resolves it through the normal wire path.
function mainDice(res) { return (res && res.ok && res.breakdown && Array.isArray(res.breakdown.dice) ? res.breakdown.dice : []).filter(function(d) { return !d || (!d.aside && !d.plus); }); }   // 1.6.2: dice with() rolled to read are no part of the roll's own
// 1.6.2: dice as a bonus (the owner, by prompt: "Roll bonuses and the \u00b1 modifier"): a few dice terms, such as +1d6 or 1d6 - 1d4, each 1 to
// 20 dice of 2 to 1000 sides, at most max terms (4). '' for none, null for text that is no such dice. The answer is written +1d6-1d4
var DICE_BONUS = /^([+-]?)(\d{0,2})d(\d{1,4})/i;
function cleanDiceBonus(v, max) {
    if (v === undefined || v === null) return ''; if (typeof v !== 'string' || v.length > 80 || /[\dd]\s+[\dd]/i.test(v)) return null;   // a space inside a term (1d6 2) is no dice
    var s = v.replace(/\s+/g, ''), out = '', n = 0, cap = isInt(max) && max > 0 ? max : 4; if (!s) return '';
    while (s) { var m = DICE_BONUS.exec(s); if (!m || (n && !m[1])) return null; var c = m[2] === '' ? 1 : +m[2], f = +m[3]; if (c < 1 || c > 20 || f < 2 || f > 1000 || ++n > cap) return null; out += (m[1] === '-' ? '-' : '+') + c + 'd' + f; s = s.slice(m[0].length); }
    return out;
}
function bonusDiceText(d) { var o = '', re = /([+-])(\d+)d(\d+)/g, m; while ((m = re.exec(d))) o += (m[1] === '-' ? ' - ' : ' + ') + m[2] + 'd' + m[3] + '@_bonus'; return o; }   // each named _bonus, so no critical reads it
function composeModifier(expr, mod, parse, dice) {   // 1.6.2: dice, cleanDiceBonus's text (up to 8 terms in all), added beside the figure
    if (typeof parse !== 'function') return { ok: false };
    var clean = cleanExpr(expr); if (!clean) return { ok: false };
    if (!isInt(mod)) return { ok: false };            // a non-integer modifier is not allowed
    var dz = dice ? cleanDiceBonus(dice, 8) : ''; if (dz === null) return { ok: false };
    if (mod === 0 && !dz) return { ok: true, expr: clean };   // nothing to fold in
    var modTxt = (mod ? (mod > 0 ? ' + ' : ' - ') + Math.abs(mod) : '') + bonusDiceText(dz), out;
    var p = null; try { p = parse(clean); } catch (e) { p = null; }
    var body = p && p.ok && p.ast ? p.ast.body : null, top = p && p.ok && p.ast && p.ast.top ? p.ast.top : body, inW = top !== body && top && isInt(top.pos) && isInt(top.len);   // 1.6.2: inside with(), the comparison's own span
    var from = inW ? top.pos : 0, to = inW ? top.pos + top.len : clean.length;
    if (inW && top.t !== 'cmp') body = null;
    else if (inW) body = top;
    if (body && body.t === 'cmp' && isInt(body.opPos) && isInt(body.opLen)) {
        var left = clean.slice(from, body.opPos).trim();
        var opTxt = clean.slice(body.opPos, body.opPos + body.opLen).trim();
        var right = clean.slice(body.opPos + body.opLen, to).trim();
        if (!left || !opTxt || !right) out = '(' + clean + ')' + modTxt;
        else if (body.op === '<' || body.op === '<=') out = clean.slice(0, from) + left + ' ' + opTxt + ' (' + right + ')' + modTxt + clean.slice(to);   // roll-under: a bonus raises the target
        else out = clean.slice(0, from) + '(' + left + ')' + modTxt + ' ' + opTxt + ' ' + right + clean.slice(to);                                       // roll-over / = / !=: a bonus lifts the roll
    } else out = '(' + clean + ')' + modTxt;                                                                     // a value roll (or unparseable): safe additive append
    var cc = cleanExpr(out); if (!cc) return { ok: false };
    var q = null; try { q = parse(cc); } catch (e2) { q = null; }
    if (!q || !q.ok) return { ok: false };   // never hand the wire a formula that will not parse
    return { ok: true, expr: cc };
}
// Stage 5b: advantage / disadvantage — only for a single plain die (d20, 1d20, d%...): roll it twice and keep the
// better ('adv' → kh1) or worse ('dis' → kl1). We rewrite exactly that dice term's source span (its count is 1 and
// it has no keep yet and numeric faces) and re-parse to be safe. mode: 'adv' | 'dis'. Returns { ok:true, expr } or
// { ok:false } (not a lone plain die — the caller then hides the buttons). Compose with composeModifier for a flat mod too.
// 1.6.2: better means better for the check. Where a lower die makes the top comparison likelier (lowGood), adv keeps the lower die and dis the higher
function dieSign(n, die) {   // +1 where the die adds to this side, -1 where it takes away, 0 where it is not there
    if (!n || typeof n !== 'object') return 0;
    if (n === die) return 1;
    if (n.t === 'neg') return -dieSign(n.a, die);
    if (n.items) for (var i = 0; i < n.items.length; i++) { var s = dieSign(n.items[i].node || n.items[i], die); if (s) return n.items[i].op === '-' ? -s : s; }
    if (n.args) for (var a = 0; a < n.args.length; a++) { var g = dieSign(n.args[a], die); if (g) return g; }
    if (n.a) return dieSign(n.a, die);
    if (n.l) return dieSign(n.l, die) || dieSign(n.r, die);
    return 0;
}
function lowGood(body, die) {
    if (!body || body.t !== 'cmp') return false;
    var under = body.op === '<' || body.op === '<=', over = body.op === '>' || body.op === '>='; if (!under && !over) return false;
    var l = dieSign(body.l, die), r = l ? 0 : dieSign(body.r, die), s = l || -r;   // on the right of the comparison the die pulls the other way
    return s ? (under ? s > 0 : s < 0) : false;
}
function withAdvantage(expr, mode, parse) {
    if (typeof parse !== 'function' || (mode !== 'adv' && mode !== 'dis')) return { ok: false };
    var clean = cleanExpr(expr); if (!clean) return { ok: false };
    var p = null; try { p = parse(clean); } catch (e) { p = null; }
    if (!p || !p.ok || !p.ast) return { ok: false };
    var dice = [];
    (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (n.t === 'dice') { dice.push(n); return; }   // do not descend into a die's own count/faces
        if (n.items) for (var i = 0; i < n.items.length; i++) walk(n.items[i].node || n.items[i]);
        if (n.args) for (var a = 0; a < n.args.length; a++) walk(n.args[a]);
        if (n.a) walk(n.a);
        if (n.l) { walk(n.l); walk(n.r); }
        if (n.body) walk(n.body);
    })(p.ast.body);
    if (dice.length !== 1) return { ok: false };
    var d = dice[0], countOne = d.count === null || (d.count && d.count.t === 'num' && d.count.v === 1);
    if (!countOne || d.keep || !d.faces || d.faces === 'F' || d.faces.t !== 'num' || !isInt(d.pos) || !isInt(d.len)) return { ok: false };
    var low = lowGood(p.ast.top || p.ast.body, d);
    var out = clean.slice(0, d.pos) + '2d' + d.faces.text + ((mode === 'adv') !== low ? 'kh1' : 'kl1') + (d.as ? '@' + d.as : '') + clean.slice(d.pos + d.len);
    var cc = cleanExpr(out); if (!cc) return { ok: false };
    var q = null; try { q = parse(cc); } catch (e2) { q = null; }
    if (!q || !q.ok) return { ok: false };
    return { ok: true, expr: cc };
}
// 1.6.2, backlog 35: the personal look of the character a card was made as: a font's plain name and a #rrggbb colour, or null. The font is
// judged again where it is drawn (wpPlook, Waypoint's own fonts alone)
function cleanPl(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null; var o = {};
    if (typeof v.font === 'string' && /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/.test(v.font)) o.font = v.font;
    if (typeof v.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.color)) o.color = v.color.toLowerCase();
    return o.font || o.color ? o : null;
}
function cleanFrom(f) {
    if (!f || typeof f !== 'object') return null;
    var id = str(f.id, 60), name = str(f.name, 60);
    if (!id) return null;
    return { id: id, name: name || 'Player', gm: f.gm === true };
}
// A short text riding on a request or a record (a roll's label, a character's name): '' when absent, null when malformed
function cleanLabel(v) { if (v === undefined || v === null) return ''; if (typeof v !== 'string' || v.length > LIMITS.label || CTRL_RE.test(v)) return null; return v.trim(); }
// The names a roll used, with the values it used (the engine's breakdown.names): the receivers replay with exactly these
function cleanNames(list) {
    if (!Array.isArray(list) || list.length > LIMITS.names) return null;
    var out = [], seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
        var n = list[i]; if (!n || typeof n !== 'object' || typeof n.name !== 'string' || n.name.length > LIMITS.nameChars || !NAME_RE.test(n.name)) return null;
        var v = n.value; if (!(typeof v === 'boolean' || (typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e15))) return null;   // bounded like stored values: a computed 1e21 is a whole number the wire refuses (the roll is denied, never half-sent)
        var l = n.name.toLowerCase(); if (l in seen) { if (seen[l] !== v) return null; continue; }
        seen[l] = v; out.push({ name: n.name, value: v });
    }
    return out;
}
// 1.5.8 (handoff 90 Part B): what changed the values a roll reads, as the host worked it out (systemcore rollMods): at most 8 values, each a
// name, its figure before and after, at most 8 changes on it (m: a source's name and an amount) and 8 on what it is worked out from (w: the
// same and what it changed); text and numbers only
function cleanMods(list) {
    if (!Array.isArray(list) || !list.length || list.length > 8) return null;
    var num = function(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e15; }, txt = function(s) { var c = cleanLabel(s); return typeof c === 'string' && c ? c : null; };
    var out = [];
    for (var i = 0; i < list.length; i++) {
        var e = list[i]; if (!e || typeof e !== 'object') return null;
        var n = txt(e.n); if (!n || !num(e.b) || !num(e.a)) return null;
        var part = function(arr, needT) {
            if (arr === undefined) return [];
            if (!Array.isArray(arr) || !arr.length || arr.length > 8) return null;
            var got = [];
            for (var j = 0; j < arr.length; j++) {
                var x = arr[j]; if (!x || typeof x !== 'object') return null;
                var s = txt(x.s); if (!s || !num(x.v) || !x.v) return null;
                var c = { s: s, v: x.v };
                if (needT) { var t = txt(x.t); if (!t) return null; c.t = t; } else if (x.t !== undefined) return null;
                got.push(c);
            }
            return got;
        };
        var m = part(e.m, false), w = part(e.w, true); if (!m || !w || (!m.length && !w.length)) return null;
        var o = { n: n, b: e.b, a: e.a }; if (m.length) o.m = m; if (w.length) o.w = w; out.push(o);
    }
    return out;
}
// 1.6.0 Specialties: the references a roll read, as the host worked them out (systemcore rollRefs): at most 4, each the words its card says (s)
// and the case it used (c: 1 the row held, 2 another specialty at its Fallback, 3 the parent untrained); text and a number only. A list that
// does not clean is left off, the roll kept
function cleanRefs(list) {
    if (!Array.isArray(list) || !list.length || list.length > 4) return null;
    var out = [];
    for (var i = 0; i < list.length; i++) {
        var e = list[i]; if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).length !== 2) return null;
        var s = cleanLabel(e.s); if (typeof s !== 'string' || !s || (e.c !== 1 && e.c !== 2 && e.c !== 3)) return null;
        out.push({ s: s, c: e.c });
    }
    return out;
}
function foldNames(names) { var o = {}; (names || []).forEach(function(n) { o[String(n.name).toLowerCase()] = n.value; }); return o; }
function cleanRid(msg) { return msg && typeof msg === 'object' && typeof msg.rid === 'string' && RID_RE.test(msg.rid) ? msg.rid : null; }
// A player's request: { type: 'roll-req', rid, expr, priv? }
// 1.6.0: a roll switch's holder on the wire: '<list or effects field>|<row or effect>'
var SW_RE = /^f_[A-Za-z0-9_]{1,24}\|[a-z]_[A-Za-z0-9_]{1,24}$/;
function cleanSwNames(v) {
    if (!Array.isArray(v) || !v.length || v.length > LIMITS.swPicks) return null; var o = [];
    for (var i = 0; i < v.length; i++) { var x = v[i]; if (!x || typeof x !== 'object') return null; var n = cleanLabel(x.n), dz = cleanDiceBonus(x.d); if (!n || dz === null || !isInt(x.v) || (!x.v && !dz) || x.v < -99 || x.v > 99) return null; var w = { n: n, v: x.v }; if (dz) w.d = dz; o.push(w); }   // 1.6.2: d, its dice
    return o;
}
// 1.6.2: what a press answered, as data the host judges (systemcore cleanAskWire, kept to the same shape), and the words a card says of it
function cleanAsk(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    var ks = Object.keys(v); if (!ks.length || ks.length > 3) return null;
    var out = {}; for (var i = 0; i < ks.length; i++) { var k = ks[i], x = v[k]; if (!/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(k)) return null; if (typeof x === 'number' ? !(isFinite(x) && Math.abs(x) <= 1e6) : !(typeof x === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(x))) return null; out[k] = x; }
    return out;
}
function cleanAsked(v) {
    if (!Array.isArray(v)) return null;
    var out = []; v.slice(0, 3).forEach(function(a) { if (a && typeof a === 'object' && typeof a.l === 'string' && typeof a.w === 'string' && a.l && a.w) out.push({ l: a.l.slice(0, 120), w: a.w.slice(0, 120) }); });
    return out.length ? out : null;
}
// 1.6.2 (G5): a press on a held roll's card, and the card's own words, a card saying it is pending and what its roller may do
// 1.6.2 Assist: a card of a roll that waits for help, as the host sends it (net.js helpRec), cleaned key by key: its words, who has helped and with what, the
// help so far, the characters this connection may help with and the rolls they may help by, whether it is our own roll (mine, with the press's rid) or the
// GM's card (gm), and whether it is over (done, with why: 'left' where its roller left). null where anything is not of its shape
function cleanHelpCard(rec) {
    if (!rec || typeof rec !== 'object' || typeof rec.id !== 'string' || !ID_RE.test(rec.id)) return null;
    var from = cleanFrom(rec.from); if (!from) return null;
    if (typeof rec.ends !== 'number' || !isFinite(rec.ends) || !isInt(rec.total) || rec.total < -99 || rec.total > 99 || !Array.isArray(rec.lines) || rec.lines.length > 12) return null;
    var out = { id: rec.id, from: from, ts: typeof rec.ts === 'number' && isFinite(rec.ts) ? rec.ts : 0, ends: rec.ends, total: rec.total, lines: [] };
    for (var i = 0; i < rec.lines.length; i++) { var l = rec.lines[i], n = l && typeof l === 'object' ? cleanLabel(l.n) : null; if (!n || typeof l.w !== 'string' || l.w.length > 120 || CTRL_RE.test(l.w)) return null; out.lines.push({ n: n, w: l.w }); }
    var lb = cleanLabel(rec.label); if (lb === null) return null; if (lb) out.label = lb;
    var as = cleanLabel(rec.as); if (as === null) return null; if (as) out.as = as; var plC = cleanPl(rec.pl); if (plC && as) out.pl = plC;
    if (rec.cap !== undefined) { if (!isInt(rec.cap) || rec.cap < 1 || rec.cap > 99) return null; out.cap = rec.cap; }
    if (rec.can !== undefined) { if (!Array.isArray(rec.can) || rec.can.length > 8) return null; out.can = []; for (var c = 0; c < rec.can.length; c++) { var x = rec.can[c], cn = x && typeof x === 'object' ? cleanLabel(x.name) : null; if (!x || typeof x.id !== 'string' || !CHAR_RE.test(x.id) || !cn) return null; out.can.push({ id: x.id, name: cn }); } }
    if (rec.rolls !== undefined) { if (!Array.isArray(rec.rolls) || rec.rolls.length > 8) return null; out.rolls = []; for (var r = 0; r < rec.rolls.length; r++) { var y = rec.rolls[r], rl = y && typeof y === 'object' ? cleanLabel(y.label) : null; if (!y || !isInt(y.i) || y.i < 0 || y.i > 7 || !rl) return null; out.rolls.push({ i: y.i, label: rl }); } }
    ['mine', 'gm', 'done'].forEach(function(k) { if (rec[k] === 1) out[k] = 1; });
    if (out.mine === 1 && typeof rec.rid === 'string' && RID_RE.test(rec.rid)) out.rid = rec.rid;
    if (out.done === 1 && rec.why === 'left') out.why = 'left';
    return out;
}
// ... and a press on it: Help with a character of the presser's (by a roll of the card's by its place, where it helps by a roll), or Roll
function cleanHelpAct(msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.id !== 'string' || !ID_RE.test(msg.id) || (msg.key !== 'help' && msg.key !== 'roll')) return null;
    var out = { id: msg.id, key: msg.key }; if (msg.key === 'roll') return out;
    if (typeof msg.char !== 'string' || !CHAR_RE.test(msg.char)) return null; out.char = msg.char;
    if (msg.ix !== undefined) { if (!isInt(msg.ix) || msg.ix < 0 || msg.ix > 7) return null; out.ix = msg.ix; }
    return out;
}
function cleanCardAct(msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.id !== 'string' || !ID_RE.test(msg.id) || typeof msg.key !== 'string' || !/^(accept|\d{1,2})$/.test(msg.key)) return null;
    return { id: msg.id, key: msg.key };
}
function cleanOffers(v) {
    if (!Array.isArray(v)) return null;
    var out = []; v.slice(0, 12).forEach(function(a) { if (a && typeof a === 'object' && typeof a.k === 'string' && /^\d{1,2}$/.test(a.k) && typeof a.l === 'string' && a.l) out.push({ k: a.k, l: a.l.slice(0, 120) }); });
    return out;
}
function cleanRollReq(msg) {
    if (!msg || typeof msg !== 'object') return null;
    var expr = cleanExpr(msg.expr); if (!expr) return null;
    if (typeof msg.rid !== 'string' || !RID_RE.test(msg.rid)) return null;
    var out = { rid: msg.rid, expr: expr };
    if (msg.priv !== undefined) { if (msg.priv !== 'gm') return null; out.priv = 'gm'; }
    if (msg.charId !== undefined) { if (typeof msg.charId !== 'string' || !CHAR_RE.test(msg.charId)) return null; out.charId = msg.charId; }   // roll as this character (its own values)
    var label = cleanLabel(msg.label); if (label === null) return null; if (label) out.label = label;
    if (msg.dl !== undefined) { var dlq = cleanDiceLook(msg.dl); if (dlq) out.dl = dlq; }   // 1.6.2: the roller's dice look (one that does not clean is left off, the roll kept)
    if (msg.row !== undefined) {   // Stage 6 F5b: a roll on one row of a carried list (its Row.* names), only as a character
        var rw = msg.row; if (!out.charId || !rw || typeof rw !== 'object' || Array.isArray(rw) || typeof rw.f !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(rw.f)) return null;
        if (rw.k !== undefined) {   // 1.6.0 Rolls unheld entries: a list's roll, by its index, on an entry the character holds none of, named by its id (the host finds the entry and works its level out)
            if (rw.r !== undefined || rw.lv !== undefined || rw.i === undefined || typeof rw.k !== 'string' || !/^i_[A-Za-z0-9_]{1,24}$/.test(rw.k)) return null;
            out.row = { f: rw.f, k: rw.k };
        } else if (typeof rw.r !== 'string' || !/^w_[A-Za-z0-9_]{1,24}$/.test(rw.r)) return null;
        else out.row = { f: rw.f, r: rw.r };
        if (rw.i !== undefined) { if (!isInt(rw.i) || rw.i < 0 || rw.i >= LIMITS.rowRolls) return null; out.row.i = rw.i; }
        if (rw.lv !== undefined) { if (rw.i === undefined || !isInt(rw.lv) || Math.abs(rw.lv) > 1e6) return null; out.row.lv = rw.lv; }   // 1.6.0 R12: the level a roll that asks it runs at   // Stage 6 HUD R2b: the list's roll (with consequences or needs: the host rebuilds it), by its place among the list's LIMITS.rowRolls
    }
    if (msg.act !== undefined) {   // Stage 6 HUD R1: a roll with consequences names its entry; its modifier and advantage travel as data (the host rebuilds the formula from the entry)
        if (!out.charId || out.row || typeof msg.act !== 'string' || !/^r_[A-Za-z0-9_]{1,24}$/.test(msg.act)) return null;
        out.act = msg.act;
    }
    if (msg.ask !== undefined) { var akQ = cleanAsk(msg.ask); if (!akQ || !out.charId || !(out.act || (out.row && typeof out.row.i === 'number'))) return null; out.ask = akQ; }   // 1.6.2: beside a named roll, which the host judges against
    if (msg.by !== undefined) {   // 1.6.0 Its crew may press this sheet's rolls: the crew sheet that pressed a named roll of another sheet (the host judges it)
        if (!out.charId || !(out.act || (out.row && typeof out.row.i === 'number' && out.row.r)) || typeof msg.by !== 'string' || !CHAR_RE.test(msg.by) || msg.by === out.charId) return null;
        out.by = msg.by;
    }
    if (msg.fr !== undefined) {   // 1.6.0: a field's own roll with roll switches ticked names its field (the host rebuilds the formula from it)
        if (!out.charId || out.row || out.act || typeof msg.fr !== 'string' || !/^f_[A-Za-z0-9_]{1,24}$/.test(msg.fr)) return null;
        out.fr = msg.fr;
    }
    if (out.act || out.fr || (out.row && out.row.i !== undefined)) {   // R1/R2b: a named entry's modifier and advantage
        if (msg.mod !== undefined) { if (!isInt(msg.mod) || msg.mod < -99 || msg.mod > 99) return null; if (msg.mod) out.mod = msg.mod; }
        if (msg.modD !== undefined) { var mdz = cleanDiceBonus(msg.modD); if (mdz === null) return null; if (mdz) out.modD = mdz; }   // 1.6.2: dice the \u00b1 window adds
        if (msg.adv !== undefined) { if (msg.adv !== 'adv' && msg.adv !== 'dis') return null; out.adv = msg.adv; }
    } else if (msg.mod !== undefined || msg.modD !== undefined || msg.adv !== undefined) return null;
    if (msg.sw !== undefined) {   // 1.6.0: the roll switches ticked in its ± window, each by its holder and its place there (the host judges them: systemcore swJudge)
        if (!(out.act || out.fr || (out.row && out.row.i !== undefined)) || !Array.isArray(msg.sw) || !msg.sw.length || msg.sw.length > LIMITS.swPicks) return null;
        var swO = [], swK = {};
        for (var si = 0; si < msg.sw.length; si++) { var p = msg.sw[si]; if (!p || typeof p !== 'object' || Array.isArray(p) || typeof p.s !== 'string' || !SW_RE.test(p.s) || !isInt(p.i) || p.i < 0 || p.i >= LIMITS.rollSw || Object.prototype.hasOwnProperty.call(swK, p.s + '#' + p.i)) return null; swK[p.s + '#' + p.i] = 1; swO.push({ s: p.s, i: p.i }); }
        out.sw = swO;
    }
    if (msg.on !== undefined) {   // 1.5.9 (book es/et plan, section 3): the token of the adjacent character a named entry is used on (the host judges it)
        if (!(out.act || (out.row && out.row.i !== undefined)) || typeof msg.on !== 'string' || msg.on.length < 1 || msg.on.length > 80 || CTRL_RE.test(msg.on)) return null;
        out.on = msg.on;
    }
    if (msg.att !== undefined) {   // 1.6.0 (a build's sort, B2): the attempt a resist roll answers, by the id the host gave it (the host holds its margin)
        if (!(out.act || (out.row && out.row.i !== undefined && out.row.r !== undefined)) || typeof msg.att !== 'string' || !ATT_RE.test(msg.att)) return null;   // 1.6.0: or a list's roll on one row, offered on a resist card
        out.att = msg.att;
    }
    if (msg.aim !== undefined) {   // 1.6.0 An attack on a line: the point it is aimed at, beside a named roll only, board numbers (the host works out who stands in it)
        var am = msg.aim; if (!(out.act || (out.row && out.row.i !== undefined && out.row.r !== undefined)) || !am || typeof am !== 'object' || Array.isArray(am) || typeof am.x !== 'number' || typeof am.y !== 'number' || !isFinite(am.x) || !isFinite(am.y) || Math.abs(am.x) > 1e6 || Math.abs(am.y) > 1e6) return null;
        out.aim = { x: am.x, y: am.y };
    }
    if (msg.hit !== undefined) {   // 1.6.0 (B5): the location row the roller picked on its target's sheet, beside a named roll only (the host rebuilds its formula, and judges the row on the target)
        if (!(out.act || out.fr || (out.row && out.row.i !== undefined && out.row.r !== undefined)) || typeof msg.hit !== 'string' || !/^w_[A-Za-z0-9_]{1,24}$/.test(msg.hit)) return null;
        out.hit = msg.hit;
    }
    if (msg.src !== undefined && out.charId) { var srcC = cleanSrc(msg.src); if (srcC) out.src = srcC; }   // 1.6.2: which button it came from
    return out;
}
// 1.6.2: which button a press came from: a system roll by its id, a list's roll by its field, its row and its place. It names no rule and the host
// judges nothing by it, since a plain roll sends its formula alone and naming it would put it under Off a character's turn. A sound on that roll
// reads it and nothing else. One that does not read is left out, and the roll goes on
function cleanSrc(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    if (typeof v.r === 'string') return /^r_[A-Za-z0-9_]{1,24}$/.test(v.r) ? { r: v.r } : null;
    return typeof v.l === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(v.l) && typeof v.row === 'string' && /^w_[A-Za-z0-9_]{1,24}$/.test(v.row) && isInt(v.i) && v.i >= 0 && v.i < LIMITS.rowRolls ? { l: v.l, row: v.row, i: v.i } : null;
}
function cleanAtt(v) { return typeof v === 'string' && ATT_RE.test(v) ? v : ''; }
var ATT_RE = /^[ab]_[a-z0-9]{8}$/;   // 1.6.0 (B2): an attempt's id, made by the host (b_: a blow's soft record, which a roll may do without)
var RESIST_ROWS = 80;   // 1.6.0: a resist card's buttons for a list's roll, one a row the target holds, at most
// 1.6.0 (B3): a damage roll's second part as the host rolled it, { t, n?, dtype?, ad?, dkind? }: its total (a whole number, 0 to a million), the dice it
// rolled (1 to 100), the damage type's key, its armour divisor (0.1 to 100, never 1) and its own kind of blow's key; null when anything is malformed
var DMG2_TYPE = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
function cleanDmg2(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || !isInt(v.t) || v.t < 0 || v.t > 1000000) return null;
    var o = { t: v.t };
    if (v.n !== undefined) { if (!isInt(v.n) || v.n < 1 || v.n > 100) return null; o.n = v.n; }
    if (v.dtype !== undefined) { if (typeof v.dtype !== 'string' || !DMG2_TYPE.test(v.dtype)) return null; o.dtype = v.dtype; }
    if (v.ad !== undefined) { if (typeof v.ad !== 'number' || !isFinite(v.ad) || v.ad < 0.1 || v.ad > 100 || v.ad === 1) return null; o.ad = v.ad; }
    if (v.dkind !== undefined) { if (typeof v.dkind !== 'string' || !DMG2_TYPE.test(v.dkind)) return null; o.dkind = v.dkind; }
    return o;
}
// 1.6.0 (the live test, 2026-10-30): which round a hit was, for its card: rno, its place in firing order, and rnd, its name, on any record; each left off where it does not clean
function roundInto(out, v) {
    if (isInt(v.rno) && v.rno >= 1 && v.rno <= LIMITS.hits) out.rno = v.rno;
    if (typeof v.rnd === 'string' && v.rnd && cleanLabel(v.rnd)) out.rnd = cleanLabel(v.rnd);
}
// The faces of the dice that counted in a roll, for a hit's line on its card; LIMITS.hitFaces at most
function hitFaces(res) {
    var out = [];
    (res && res.breakdown && Array.isArray(res.breakdown.dice) ? res.breakdown.dice : []).forEach(function(g) {
        (g && Array.isArray(g.dice) ? g.dice : []).forEach(function(d) { if (d && d.kept && typeof d.value === 'number' && isFinite(d.value) && out.length < LIMITS.hitFaces) out.push(Math.floor(d.value)); });
    });
    return out;
}
// 1.6.0 A burst: the hits of a damage roll after its first, as the host rolled them from the entry: at most hits - 1 of them (systemcore HITS_MAX), each a
// part's own keys (cleanDmg2) with major (1) and its added parts (dmg2 to dmg5, each cleaned as such a part); null when anything is malformed. Each may
// say its dice (f, the faces that counted) and its round (roundInto)
function cleanHits(v) {
    if (!Array.isArray(v) || !v.length || v.length > LIMITS.hits - 1) return null;
    var out = [];
    for (var i = 0; i < v.length; i++) {
        var o = cleanDmg2(v[i]); if (!o) return null;
        if (v[i].major !== undefined) { if (v[i].major !== 1) return null; o.major = 1; }
        for (var k = 2; k <= 5; k++) { var pv = v[i]['dmg' + k]; if (pv === undefined) continue; var pc = cleanDmg2(pv); if (!pc) return null; o['dmg' + k] = pc; }
        if (Array.isArray(v[i].f) && v[i].f.length <= LIMITS.hitFaces && v[i].f.every(function(x) { return isInt(x) && Math.abs(x) <= 1000000; })) o.f = v[i].f.slice();
        roundInto(o, v[i]);
        out.push(o);
    }
    return out;
}
// 1.6.0 (B5): where a called shot was aimed, { n, f: [{ k, v }] }: the location's name (60 at most) and up to 4 figures it read, each its label
// (24 at most) and a finite number; null when anything is malformed
function cleanAim(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.n !== 'string' || !v.n.trim() || v.n.length > 60 || CTRL_RE.test(v.n) || !Array.isArray(v.f) || v.f.length > 4) return null;
    var f = []; for (var i = 0; i < v.f.length; i++) { var x = v.f[i]; if (!x || typeof x !== 'object' || typeof x.k !== 'string' || !x.k.trim() || x.k.length > 24 || CTRL_RE.test(x.k) || typeof x.v !== 'number' || !isFinite(x.v) || Math.abs(x.v) > 1e9) return null; f.push({ k: x.k.trim(), v: x.v }); }
    return { n: v.n.trim(), f: f };
}
// 1.6.0 Where a hit behind cover lands, { n, d?, of?, e?, ea?, st? }: the location's name (60 at most), the die d of of sides, the second die e of ea among
// several rows, st a pick that stood; null when malformed. coverHitWords is its line on the card
function cleanCovHit(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.n !== 'string' || !v.n.trim() || v.n.length > 60 || CTRL_RE.test(v.n)) return null;
    var out = { n: v.n.trim() }, two = function(a, b) { return isInt(v[a]) && isInt(v[b]) && v[b] >= 1 && v[b] <= 1000 && v[a] >= 1 && v[a] <= v[b]; };
    if (two('d', 'of')) { out.d = v.d; out.of = v.of; } if (two('e', 'ea')) { out.e = v.e; out.ea = v.ea; } if (v.st === 1) out.st = 1;
    return out;
}
function coverHitWords(c) {
    if (c.st === 1) return 'A called shot at ' + c.n + ' stands';
    return 'Behind cover, it lands on ' + c.n + (c.d ? ': 1d' + c.of + ' shows ' + c.d : '') + (c.e ? (c.d ? ', then ' : ': ') + c.e + ' of ' + c.ea : '');
}
// The host's record: { type: 'roll', id, from, expr, draws, v, ts, priv?, to?, rid? }
// 1.6.0: a target's posture on an attack, as the host says it (systemcore posRec): { n: its name, by: what counted, c?: the cover's word, a?: 1 where hits land as aimed }
function cleanPos(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null; var n = cleanLabel(p.n); if (!n || (p.by !== 'posture' && p.by !== 'cover' && p.by !== 'tie')) return null;
    var out = { n: n, by: p.by }; if (p.c === 'Half cover' || p.c === 'Three-quarters cover' || p.c === 'Total cover' || p.c === 'Cover') out.c = p.c; if (p.a === 1) out.a = 1; return out;
}
// ... and its words on the card, plain text
function posWords(p) {
    var c = p.c ? p.c.toLowerCase() : '', t = p.by === 'cover' && c ? 'Target in ' + c + ', harsher than ' + p.n : !c ? 'Target ' + p.n : p.by === 'tie' ? 'Target ' + p.n + ', as hard as ' + c : 'Target ' + p.n + ', harsher than ' + c;
    return p.a === 1 ? t + '. Hits land as aimed.' : t;
}
function cleanRoll(rec) {
    if (!rec || typeof rec !== 'object') return null;
    if (typeof rec.id !== 'string' || !ID_RE.test(rec.id)) return null;
    var from = cleanFrom(rec.from); if (!from) return null;
    var expr = cleanExpr(rec.expr); if (!expr) return null;
    if (!Array.isArray(rec.draws) || rec.draws.length > LIMITS.draws) return null;
    var draws = new Array(rec.draws.length);
    for (var i = 0; i < rec.draws.length; i++) { var d = rec.draws[i]; if (!isInt(d) || d < 1 || d > 1000000) return null; draws[i] = d; }
    if (!isInt(rec.v) || rec.v < 1) return null;
    var out = { id: rec.id, from: from, expr: expr, draws: draws, v: rec.v, ts: typeof rec.ts === 'number' && isFinite(rec.ts) ? rec.ts : 0 };
    if (rec.priv !== undefined) { if (rec.priv !== 'gm') return null; out.priv = 'gm'; }
    if (rec.to !== undefined) { if (typeof rec.to !== 'string' || !PEER_RE.test(rec.to)) return null; out.to = rec.to; }
    if (rec.rid !== undefined) { if (typeof rec.rid !== 'string' || !RID_RE.test(rec.rid)) return null; out.rid = rec.rid; }
    if (rec.names !== undefined) { var nm = cleanNames(rec.names); if (!nm) return null; if (nm.length) out.names = nm; }
    if (rec.malf !== undefined) { if (!isInt(rec.malf) || rec.malf < 1 || rec.malf > 1000000) return null; out.malf = rec.malf; if (rec.malfHid === 1) out.malfHid = 1; }   // malfHid (1.6.0): the figure is the roll's own, standing in for a Malf that reads a GM-only stat, so a card names none
    if (rec.crit !== undefined) { var crc = cleanCrit(rec.crit); if (!crc) return null; out.crit = crc.high ? [crc.at, crc.fumble, 1] : [crc.at, crc.fumble]; }   // 1.6.0: criticals at fixed rolls, the two numbers the host judged this roll by
    if (rec.hid === 'gm') out.hid = 'gm';   // HR1: a roll that went straight to the GM: its roller's copy holds no figure
    if (rec.hid === 'pass' || rec.hid === 'fail' || rec.hid === 'rolled') { out.hid = rec.hid; if ((rec.hidc === 'crit' || rec.hidc === 'fumble') && rec.hid !== 'rolled') out.hidc = rec.hidc; }   // 1.6.2: the host's own word for a roll whose figure is hidden (hidRoll): only these words
    if (typeof rec.band === 'string' && rec.band.trim()) out.band = rec.band.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 30);   // 1.6.2: the name of the result band the host found, text alone
    if (rec.dl !== undefined) { var dlc = cleanDiceLook(rec.dl); if (dlc) out.dl = dlc; }   // 1.6.2: the roller's dice look, as the host passed it on
    if (rec.big === true) out.big = true;   // 1.6.0 (the book's ruling of 2026-10-29): the host's mark of a success that lands as a Big Hit, no critical; anything else is left off
    if (rec.mods !== undefined) { var md = cleanMods(rec.mods); if (md) out.mods = md; }
    if (rec.sw !== undefined) { var swc = cleanSwNames(rec.sw); if (swc) out.sw = swc; }   // 1.6.0: the roll switches it was rolled with, by name (a list that does not clean is left off, the roll kept)   // 1.5.8: what changed the values it reads (a list that does not clean is left off, the roll kept)
    if (rec.refs !== undefined) { var rfc = cleanRefs(rec.refs); if (rfc) out.refs = rfc; }   // 1.6.0 Specialties: the case each reference used
    if (rec.dmg !== undefined) { if (rec.dmg !== 1) return null; out.dmg = 1; }
    if (rec.dmgOn !== undefined && out.dmg === 1 && typeof rec.dmgOn === 'string' && /^c_[A-Za-z0-9_]{1,24}$/.test(rec.dmgOn)) out.dmgOn = rec.dmgOn;   // 1.6.0: the character this damage lands on, the host's from its entry (one that does not clean is left off, the roll kept)
    if (rec.cov === 'Half cover' || rec.cov === 'Three-quarters cover' || rec.cov === 'Total cover' || rec.cov === 'Cover') out.cov = rec.cov;   // 1.6.0: the cover a roll read, by the four words coverTier gives
    if (rec.cvh !== undefined) { var cvc = cleanCovHit(rec.cvh); if (cvc) out.cvh = cvc; }
    if (rec.body === 1 && out.dmg !== 1) out.body = 1;   // 1.6.2: a miss that switched to a body in the way (the host's word)
    if (rec.bodyOn === 1 && out.dmg === 1 && out.dmgOn) out.bodyOn = 1;   // ... and the damage that lands on that body
    if (rec.bodyName !== undefined && (out.body === 1 || out.bodyOn === 1)) { var bdN = cleanLabel(rec.bodyName); if (bdN) out.bodyName = bdN; }   // ... named where its viewer can see the target (the host's word), as text   // 1.6.0: where a hit behind cover landed (one that does not clean is left off, the roll kept)
    if (rec.asked !== undefined) { var akc = cleanAsked(rec.asked); if (akc) out.asked = akc; }   // 1.6.2: what its roller answered
    if (typeof rec.pend === 'number' && isFinite(rec.pend) && rec.pend > 0) { out.pend = Math.min(600, Math.floor(rec.pend)); var ofc = cleanOffers(rec.offers); if (ofc) out.offers = ofc; var pts = rec.pts; if (pts && typeof pts === 'object' && typeof pts.n === 'number' && isFinite(pts.n) && pts.n >= 0 && pts.n <= 999 && typeof pts.w === 'string' && pts.w) out.pts = { n: Math.floor(pts.n), w: pts.w.slice(0, 60) }; }   // 1.6.2 (G5): held, nothing of it landed yet
    if (rec.aim !== undefined) { var amc = cleanAim(rec.aim); if (amc) out.aim = amc; }   // 1.6.0 (B5): where a called shot was aimed (one that does not clean is left off, the roll kept)
    if (rec.pos !== undefined) { var psc = cleanPos(rec.pos); if (psc) out.pos = psc; }   // 1.6.0: a target's posture on the attack, against its cover (one that does not clean is left off, the roll kept)
    if (rec.dtype !== undefined && out.dmg === 1 && typeof rec.dtype === 'string' && DMG2_TYPE.test(rec.dtype)) out.dtype = rec.dtype;   // 1.6.0 (the live test, 2026-10-30): the damage type, for a player's card as for the GM's: a burst's Hit 1 lost it here
    if (out.dmg === 1) roundInto(out, rec);   // ... and which round its first hit was
    if (rec.dkind !== undefined && out.dmg === 1 && typeof rec.dkind === 'string' && DMG2_TYPE.test(rec.dkind)) out.dkind = rec.dkind;   // 1.6.0: the blow's kind, the host's from its entry, only on a damage roll (one that does not clean is left off, the roll kept)
    if (rec.onName !== undefined && out.dmg === 1) { var onN = cleanLabel(rec.onName); if (onN) out.onName = onN; }   // 1.6.0: whom a line hit, as text
    if (rec.dmg2 !== undefined && out.dmg === 1) { var d2c = cleanDmg2(rec.dmg2); if (d2c) out.dmg2 = d2c; }
    [3, 4, 5].forEach(function(k) { if (rec['dmg' + k] !== undefined && out.dmg === 1) { var dkc = cleanDmg2(rec['dmg' + k]); if (dkc) out['dmg' + k] = dkc; } });   // 1.6.0: a third and a fourth part, each as the second   // 1.6.0 (B3): the blow's second part, only on a damage roll (one that does not clean is left off, the roll kept)   // chat cards: a damage roll, marked by the host from its roll (never the roller's word)   // Stage 6 HUD R3: the roll's malfunction threshold (every machine works the malfunction out from the draws)
    if (rec.more !== undefined && out.dmg === 1) { var hc = cleanHits(rec.more); if (hc) out.more = hc; }   // 1.6.0 A burst: the hits after the first, only on a damage roll (a list that does not clean is left off, the roll kept)
    var lb = cleanLabel(rec.label); if (lb === null) return null; if (lb) out.label = lb;
    var as = cleanLabel(rec.as); if (as === null) return null; if (as) out.as = as; var plC = cleanPl(rec.pl); if (plC && as) out.pl = plC;
    return out;
}
// Stage 6 HUD H7: the host's card for an apply action — { type: 'apply', id, from, as?, label?, lines: [{ n, d, v, roll? }] (1 to LIMITS.applyLines), ts, priv? }:
// each change as text and numbers only (a field's label, the amount signed, the new value); null when anything is malformed. 1.5.9: on?, the
// character it was used on, by name; and a line may have no new value ({ n, d, roll? }), or be { n, s: 1, roll? }, a value set with no figure:
// the copy of a change on another character that its user's player gets
function cleanApply(rec) {
    if (!rec || typeof rec !== 'object') return null;
    if (typeof rec.id !== 'string' || !ID_RE.test(rec.id)) return null;
    var from = cleanFrom(rec.from); if (!from) return null;
    if (!Array.isArray(rec.lines) || !rec.lines.length || rec.lines.length > LIMITS.applyLines) return null;
    var lines = [];
    for (var i = 0; i < rec.lines.length; i++) {
        var l = rec.lines[i]; if (!l || typeof l !== 'object') return null;
        var n = cleanLabel(l.n); if (!n) return null;
        var ln;
        if (l.say !== undefined) { if (typeof l.say !== 'string' || !l.say.trim()) return null; ln = { n: n, say: l.say.replace(new RegExp(CTRL_RE.source, 'g'), ' ').trim().slice(0, 1000) }; }   // 1.6.2 (G7): a result table's words
        else if (l.fx !== undefined) { if ((l.fx !== 1 && l.fx !== 0) || l.d !== undefined || l.v !== undefined || l.s !== undefined) return null; ln = { n: n, fx: l.fx }; }   // 1.6.0: an effect switched on (1) or off (0), with no figure
        else if (l.s !== undefined) { if (l.s !== 1 || l.d !== undefined) return null; ln = { n: n, s: 1 }; if (l.mv !== undefined) { if (l.mv !== 1 || l.v !== undefined) return null; ln.mv = 1; }   /* 1.6.0: an Add or Subtract on every row whose figure differs by row, said as moved row by row */ if (l.v !== undefined) { if (typeof l.v !== 'number' || !isFinite(l.v) || Math.abs(l.v) > 1e15) return null; ln.v = l.v; } }   // 1.6.0: and a figure where every row of a list was set to it   // 1.5.9 (book es/et plan, section 3): a value set on another character, said with no figure (its user's player's copy)
        else {
            if (typeof l.d !== 'number' || !isFinite(l.d) || Math.abs(l.d) > 1e15) return null;
            if (l.v !== undefined && (typeof l.v !== 'number' || !isFinite(l.v) || Math.abs(l.v) > 1e15)) return null;   // 1.5.9: a line with no figure after it, as its user's player's copy of a change on another says it
            ln = { n: n, d: l.d }; if (l.v !== undefined) ln.v = l.v;
        }
        if (l.roll !== undefined) { if (typeof l.roll !== 'string') return null; var rt = l.roll.replace(new RegExp(CTRL_RE.source, 'g'), ' ').trim().slice(0, 60).trim(); if (rt) ln.roll = rt; }   // 1.5.9: the dice a Rolled amount drew, as text, cut to 60
        lines.push(ln);
    }
    var out = { id: rec.id, from: from, lines: lines, ts: typeof rec.ts === 'number' && isFinite(rec.ts) ? rec.ts : 0 };
    if (rec.asked !== undefined) { var akA = cleanAsked(rec.asked); if (akA) out.asked = akA; }   // 1.6.2: what its presser answered
    if (rec.priv !== undefined) { if (rec.priv !== 'gm') return null; out.priv = 'gm'; }
    var lb = cleanLabel(rec.label); if (lb === null) return null; if (lb) out.label = lb;
    var as = cleanLabel(rec.as); if (as === null) return null; if (as) out.as = as; var plC = cleanPl(rec.pl); if (plC && as) out.pl = plC;
    var on = cleanLabel(rec.on); if (on === null) return null; if (on) out.on = on;   // 1.5.9 (book es/et plan, section 3): the character it was used on, by name
    return out;
}
// Turn-based combat T2b: a reminder card — { type: 'due', id, from, charId, act, label?, as?, why: 'round' | 'turn', round, ts, theirs? }: ids and
// text only (its Run finds the action on this machine and presses it as the sheet's button does); null when anything is malformed
function cleanDue(rec) {
    if (!rec || typeof rec !== 'object' || typeof rec.id !== 'string' || !ID_RE.test(rec.id)) return null;
    var from = cleanFrom(rec.from); if (!from) return null;
    if (typeof rec.charId !== 'string' || !/^c_[A-Za-z0-9_]{1,24}$/.test(rec.charId) || (rec.why === 'blast' ? rec.act !== undefined : (typeof rec.act !== 'string' || !/^r_[A-Za-z0-9_]{1,24}$/.test(rec.act)))) return null;   // 1.6.0 (the core's gap 8): a blast's card names no roll of the system
    if (rec.why !== 'round' && rec.why !== 'turn' && rec.why !== 'turnEnd' && rec.why !== 'cross' && rec.why !== 'major' && rec.why !== 'wound' && rec.why !== 'resist' && rec.why !== 'blast' && rec.why !== 'called') return null;   // 1.6.0 (the core's gap 8): or a blast's share to roll   // 1.6.0 (the core's gap 6): or a wound   // 1.6.0 (B2): or an attempt to resist   // 1.6.0 (B3): or a Major Wound   // 1.6.0: or the end of its turn   // 1.5.9: or a value crossing a step
    if (!isInt(rec.round) || rec.round < 1 || rec.round > 9999) return null;
    var out = { id: rec.id, from: from, charId: rec.charId, act: rec.act, why: rec.why, round: rec.round, ts: typeof rec.ts === 'number' && isFinite(rec.ts) ? rec.ts : 0 }; if (rec.why === 'blast') delete out.act;
    var lb = cleanLabel(rec.label); if (lb === null) return null; if (lb) out.label = lb;
    var as = cleanLabel(rec.as); if (as === null) return null; if (as) out.as = as; var plC = cleanPl(rec.pl); if (plC && as) out.pl = plC;
    if (rec.theirs !== undefined) { if (rec.theirs !== 1) return null; out.theirs = 1; }
    if (rec.roll !== undefined) { if (rec.roll !== 1) return null; out.roll = 1; }   // 1.5.9 (book es/et plan 4b): a roll that is due, whose button rolls it
    if (rec.why === 'major' && rec.mw !== undefined) { var mwD = cleanLabel(rec.mw); if (mwD === null) return null; if (mwD) out.mw = mwD; }   // 1.6.0: the system's own word for a Major Wound
    if (rec.why === 'resist') {   // 1.6.0 (B2): the attempt it answers by its id, who made it, and how far it succeeded (the host reads the margin from its own record)
        if (out.roll !== 1 || typeof rec.att !== 'string' || !ATT_RE.test(rec.att)) return null; out.att = rec.att;
        var byA = cleanLabel(rec.by); if (byA === null) return null; if (byA) out.by = byA;
        if (rec.m !== undefined) { if (typeof rec.m !== 'number' || !isFinite(rec.m) || Math.abs(rec.m) > 9999) return null; out.m = rec.m; }
        if (rec.kn !== undefined) { var knA = cleanLabel(rec.kn); if (knA === null) return null; if (knA) out.kn = knA; }   // 1.6.0: the word for the attempt's kind, never a GM-only attack's
        if (rec.nm !== undefined) { if (rec.nm !== 1 || !Array.isArray(rec.or) || !rec.or.length) return null; out.nm = 1; }   // 1.6.0: only the rows it offers, its own roll's needs failing against this kind
        if (rec.or !== undefined) {   // 1.6.0 (the core's gap 5): the other rolls the target may resist it with, each a button of its own: at most 3, each an id once and never act's, with its label
            if (!Array.isArray(rec.or) || !rec.or.length || rec.or.length > LIMITS.resistOr + RESIST_ROWS) return null; var ors = [], nOr = 0, nRw = 0;
            for (var oi = 0; oi < rec.or.length; oi++) { var o = rec.or[oi];
                if (o && typeof o === 'object' && o.row !== undefined) {   // 1.6.0: a list's roll on one row the target holds ({ f, r, i }), RESIST_ROWS at most, each once
                    var ow = o.row; if (o.act !== undefined || !ow || typeof ow !== 'object' || Array.isArray(ow) || typeof ow.f !== 'string' || !/^f_[A-Za-z0-9_]{1,24}$/.test(ow.f) || typeof ow.r !== 'string' || !/^w_[A-Za-z0-9_]{1,24}$/.test(ow.r) || !isInt(ow.i) || ow.i < 0 || ow.i >= LIMITS.rowRolls || ++nRw > RESIST_ROWS || ors.some(function(x) { return x.row && x.row.f === ow.f && x.row.r === ow.r && x.row.i === ow.i; })) return null;
                    var owl = cleanLabel(o.label); if (owl === null) return null; ors.push(owl ? { row: { f: ow.f, r: ow.r, i: ow.i }, label: owl } : { row: { f: ow.f, r: ow.r, i: ow.i } }); continue;
                }
                if (++nOr > 3) return null;
                if (!o || typeof o !== 'object' || typeof o.act !== 'string' || !/^r_[A-Za-z0-9_]{1,24}$/.test(o.act) || o.act === out.act || ors.some(function(x) { return x.act === o.act; })) return null; var ol = cleanLabel(o.label); if (ol === null) return null; ors.push(ol ? { act: o.act, label: ol } : { act: o.act }); }
            out.or = ors;
        }
    } else if (rec.why === 'blast') {   // 1.6.0 (the core's gap 8): the share it rolls, by the id of the host's record, which holds the dice
        if (out.roll !== 1 || typeof rec.att !== 'string' || !ATT_RE.test(rec.att) || rec.by !== undefined || rec.m !== undefined || rec.or !== undefined) return null; out.att = rec.att;
    } else if (rec.why === 'called') {   // 1.6.0: a roll another called for (systemcore cleanCalls), by the id of the host's record and the name of what called it
        if (rec.m !== undefined) return null; if (rec.att !== undefined) { if (typeof rec.att !== 'string' || !ATT_RE.test(rec.att)) return null; out.att = rec.att; }
        if (rec.or !== undefined || rec.nm !== undefined) {   // 1.6.2: a list's roll on one row, the card's one button: { row: { f, r, i }, label }, with nm 1
            var cO = Array.isArray(rec.or) && rec.or.length === 1 ? rec.or[0] : null, cW = cO && typeof cO === 'object' ? cO.row : null;
            if (rec.nm !== 1 || out.roll !== 1 || !cW || typeof cW !== 'object' || Array.isArray(cW) || cO.act !== undefined || typeof cW.f !== 'string' || !/^f_[A-Za-z0-9_]{1,24}$/.test(cW.f) || typeof cW.r !== 'string' || !/^w_[A-Za-z0-9_]{1,24}$/.test(cW.r) || !isInt(cW.i) || cW.i < 0 || cW.i >= LIMITS.rowRolls) return null;
            var cL = cleanLabel(cO.label); if (cL === null) return null; out.or = [cL ? { row: { f: cW.f, r: cW.r, i: cW.i }, label: cL } : { row: { f: cW.f, r: cW.r, i: cW.i } }]; out.nm = 1;
        }
        var byC = cleanLabel(rec.by); if (byC === null) return null; if (byC) out.by = byC;
    } else if ((rec.why === 'major' || rec.why === 'wound') && rec.att !== undefined) {   // 1.6.0 (the core's gaps 6 and 7): the blow a roll the damage step posted answers, by the id of the host's record
        if (out.roll !== 1 || typeof rec.att !== 'string' || !ATT_RE.test(rec.att) || rec.by !== undefined || rec.m !== undefined || rec.or !== undefined) return null; out.att = rec.att;
    } else if (rec.att !== undefined || rec.by !== undefined || rec.m !== undefined || rec.or !== undefined) return null;
    return out;
}
// 1.6.0 (B2): why a resist roll is due, in words: whose attempt, and by how much it succeeded
function resistWhy(rec) { return !rec ? '' : 'resisting ' + (rec.by ? rec.by + '\u2019s attempt' : 'an attempt') + (typeof rec.m === 'number' ? ', made by ' + fmtNum(rec.m) : '') + (typeof rec.kn === 'string' && rec.kn ? ', ' + rec.kn : ''); }
// 1.6.0 (the by-hand test: a card that read Big Hit (Vitality), a Major Wound): what a due card says of a Major Wound, in the system's own word, and nothing where the roll's own name says it already
function dueMajor(rec) {
    var w = rec && typeof rec.mw === 'string' && rec.mw ? rec.mw : 'a Major Wound', bare = w.replace(/^an? /i, '').toLowerCase();
    if (rec && typeof rec.label === 'string' && rec.label.toLowerCase().indexOf(bare) >= 0) return '';
    return w.replace(/^An? /, function(a) { return a.toLowerCase(); });
}
function dueText(rec) { if (!rec) return ''; var wh = rec.why === 'turn' ? 'the start of its turn' : rec.why === 'turnEnd' ? 'the end of its turn' : rec.why === 'cross' ? 'a value crossed a step' : rec.why === 'resist' ? resistWhy(rec) : rec.why === 'major' ? dueMajor(rec) : rec.why === 'wound' ? 'a wound' : rec.why === 'blast' ? 'a blast' : 'round ' + rec.round; return (rec.label || (rec.roll === 1 ? 'A roll' : 'An action')) + (rec.as ? ' for ' + rec.as : '') + ' is due' + (wh ? ' (' + wh + ')' : ''); }
// 1.6.0 (the core's gap 8): a player's press of a blast card, { type: 'blast-roll', att }: the id of the host's record alone; null otherwise
function cleanBlastRoll(msg) { return msg && typeof msg === 'object' && msg.type === 'blast-roll' && typeof msg.att === 'string' && ATT_RE.test(msg.att) && Object.keys(msg).length === 2 ? { type: 'blast-roll', att: msg.att } : null; }
// Stage 6 HUD H7: an apply card as one line (a toast, the session log): who, as whom, the action, each change as "FP \u22123 \u2192 0"
function applyText(rec) {
    if (!rec || !rec.from || !Array.isArray(rec.lines)) return '';
    var who = rec.from.gm ? 'GM' : rec.from.name, as = rec.as && rec.as !== rec.from.name ? ' as ' + rec.as : '';
    return who + (rec.priv === 'gm' ? ' (private)' : '') + as + ' applied ' + (rec.label || 'an action') + (rec.on ? ' on ' + rec.on : '') + ': ' + applyChanges(rec);   // 1.5.9: and on whom
}
// the changes alone, "HP \u22123 \u2192 7, FP +2 \u2192 5" (the HUD's bell)
function applyChanges(rec) { return !rec || !Array.isArray(rec.lines) ? '' : rec.lines.map(function(l) { return l.n + (typeof l.say === 'string' ? ': ' + l.say : l.fx === 1 ? ' on' : l.fx === 0 ? ' off' : l.s === 1 ? (l.mv === 1 ? ' moved row by row' : ' set') + (typeof l.v === 'number' ? ' \u2192 ' + fmtNum(l.v) : '') : ' ' + (l.d < 0 ? '\u2212' : '+') + fmtNum(Math.abs(l.d)) + (typeof l.v === 'number' ? ' \u2192 ' + fmtNum(l.v) : '')) + (typeof l.roll === 'string' && l.roll ? ' (' + l.roll + ')' : ''); }).join(', '); }   // 1.5.9: a line with no figure, or a value set with none, as a change on another reaches its user's player   // 1.5.9: a Rolled amount's dice after it
// The host's refusal: { type: 'roll-deny', rid, reason, message?, pos?, len? } — pos/len clamped to the expr the client sent
function cleanDeny(msg, exprLen) {
    if (!msg || typeof msg !== 'object') return null;
    if (typeof msg.rid !== 'string' || !RID_RE.test(msg.rid)) return null;
    if (typeof msg.reason !== 'string' || !REASONS[msg.reason]) return null;
    var L = isInt(exprLen) && exprLen >= 0 ? exprLen : 0;
    var pos = isInt(msg.pos) ? Math.max(0, Math.min(L, msg.pos)) : 0;
    var len = isInt(msg.len) ? Math.max(0, Math.min(L - pos, msg.len)) : 0;
    var message = str(msg.message, LIMITS.deny).replace(CTRL_RE, ' ');
    return { rid: msg.rid, reason: msg.reason, message: message, pos: pos, len: len };
}
// Replay a record through the engine F (window.wpFormula or a stub): the same formula and the same draws give the same result everywhere
function replay(rec, F, version) {
    if (!rec || !F) return { ok: false, reason: 'error' };
    if (rec.v !== version) return { ok: false, reason: 'version' };
    var res;
    try { res = F.evaluate(rec.expr, rec.names ? { random: F.fromDraws(rec.draws), vars: foldNames(rec.names) } : { random: F.fromDraws(rec.draws) }); } catch (e) { res = null; }   // names resolve to the values the host used, nothing else
    if (!res || !res.ok) return { ok: false, reason: 'error' };
    return { ok: true, result: res };
}
// The host's caps on a fresh result (its own rolls included): null when fine, else the deny reason
function checkTableRoll(res) {
    if (!res || !res.ok) return 'error';
    if (res.diceRolled > LIMITS.dice || (Array.isArray(res.draws) && res.draws.length > LIMITS.draws)) return 'many';
    return null;
}
var DENY_TEXT = {
    off: 'Dice are off for this campaign (Settings > VTT features).',
    slow: 'Slow down: a few rolls a second is plenty.',
    paused: 'The table is paused — no rolls until the GM resumes.',
    held: 'Your character needs a new sheet first. Send one from its sheet.',
    many: 'At most ' + LIMITS.dice + ' dice in a table roll.',
    names: 'Pick a character in the roller for names like STR (its sheet gives the values).',
    char: 'Pick one of your own characters for that roll.',
    table: 'The table is rolling too much at once; try again in a moment.',
    error: 'That formula could not be rolled.'
};
function denyText(reason, message) { return reason === 'error' && message ? message : (DENY_TEXT[reason] || DENY_TEXT.error); }
// Chat commands: /roll /r (public), /gmroll /gr (private or to the GM); a bare command rolls a d20. Anything else is chat.
function parseCommand(text) {
    if (typeof text !== 'string') return null;
    var m = /^[/](roll|r|gmroll|gr)(?:[ ]+(.*))?$/i.exec(text.trim());
    if (!m) return null;
    var word = m[1].toLowerCase(), expr = (m[2] || '').trim() || 'd20';
    return { cmd: word === 'gmroll' || word === 'gr' ? 'gmroll' : 'roll', expr: expr };
}
// Stage 6 F8: 3d6 roll-under (a system's combat.checks 'under3d6') — when a roll's top check is "<=" and its left side is exactly one kept 3d6
// (the natural total, nothing added): 3-4 are a critical success, 5 one at a target of 15 or more, 6 at 16 or more; 17 fails (critically at a
// target of 15 or less), 18 always fails critically, and so does failing by 10 or more. { total, target, pass, crit: 'crit' | 'fumble' | '' } or null
function under3d6(res) {
    var main = mainDice(res); if (main.length !== 1) return null;
    var top = null, checks = Array.isArray(res.breakdown.checks) ? res.breakdown.checks : []; for (var i = 0; i < checks.length; i++) if (checks[i] && checks[i].top) top = checks[i];
    if (!top || top.op !== '<=' || typeof top.left !== 'number' || typeof top.right !== 'number' || !isFinite(top.right)) return null;
    var rec = main[0]; if (!rec || rec.count !== 3 || rec.faces !== 6 || rec.cs || !Array.isArray(rec.dice) || rec.dice.length !== 3) return null;
    if (rec.dice.some(function(d) { return !d || !d.kept || (Array.isArray(d.hist) && d.hist.length > 1) || (Array.isArray(d.chain) && d.chain.length > 1); })) return null;
    var t = rec.total, T = top.right; if (typeof t !== 'number' || top.left !== t) return null;   // something added to the dice: an ordinary check
    if (t <= 4 || (t === 5 && T >= 15) || (t === 6 && T >= 16)) return { total: t, target: T, pass: true, crit: 'crit' };
    if (t === 18 || (t === 17 && T <= 15) || t - T >= 10) return { total: t, target: T, pass: false, crit: 'fumble' };
    return { total: t, target: T, pass: t !== 17 && t <= T, crit: '' };
}
// 1.6.0 (the v2 sort's B1): criticals at fixed rolls (a system's combat.checks 'fixed'). The rule is { at, fumble }, the host's two numbers for one
// roll (a record's crit, cleanCrit; ruleOf). A check whose natural total (its dice alone, naturalOf) is at or under at is a critical success, at or
// over fumble a critical failure, and nothing else is a critical; where both could apply the check's own outcome decides. A critical success
// passes and a critical failure fails, whatever the arithmetic said. { total, target, pass, crit, margin, by } or null: no rule, no check, no
// dice, or a pool that counts successes. 1.6.2: a rule with a third place, 1, is high rolls are good: at or over at is the critical success and at or
// under fumble the critical failure
function cleanCrit(v) {
    if (!Array.isArray(v) || (v.length !== 2 && !(v.length === 3 && v[2] === 1)) || !isInt(v[0]) || !isInt(v[1]) || Math.abs(v[0]) > 1000000 || Math.abs(v[1]) > 1000000) return null;
    return v.length === 3 ? { at: v[0], fumble: v[1], high: true } : { at: v[0], fumble: v[1] };
}
function isFixedRule(rule) { return !!rule && typeof rule === 'object' && !Array.isArray(rule) && isInt(rule.at) && isInt(rule.fumble); }
function fixedCrit(res, rule) {
    var main = mainDice(res); if (!isFixedRule(rule) || !main.length) return null;
    if (main.some(function(d) { return !d || d.cs; })) return null;
    var top = null, checks = Array.isArray(res.breakdown.checks) ? res.breakdown.checks : []; for (var i = 0; i < checks.length; i++) if (checks[i] && checks[i].top) top = checks[i];
    if (!top) return null;
    var up = rule.high === true, n = naturalOf(res), lo = up ? n >= rule.at : n <= rule.at, hi = up ? n <= rule.fumble : n >= rule.fumble, pass = !!top.pass;
    var crit = lo && hi ? (pass ? 'crit' : 'fumble') : lo ? 'crit' : hi ? 'fumble' : '';
    if (crit) pass = crit === 'crit';
    var ord = top.op !== '=' && top.op !== '!=', m = ord && typeof top.margin === 'number' && isFinite(top.margin) ? top.margin : 0, mg = pass ? Math.max(0, m) : Math.min(0, m);
    return { total: typeof top.left === 'number' ? top.left : null, target: typeof top.right === 'number' ? top.right : null, pass: pass, crit: crit, margin: mg, by: ord ? Math.abs(mg) : 0 };
}
// The rule a roll's card and its consequences go by: the record's own crit (criticals at fixed rolls, put there by the host), else the system's
// checks ('under3d6'), else none
function ruleOf(rec, checks) { var c = rec ? cleanCrit(rec.crit) : null; return c ? c : checks === 'under3d6' ? 'under3d6' : ''; }
// The top-level check of a result, or its value; rule 'under3d6' (F8): a 3d6 roll-under check reads its criticals (crit: 'crit' | 'fumble')
function verdictOf(res, rule) {
    if (!res || !res.ok) return null;
    var u = rule === 'under3d6' ? under3d6(res) : null;
    if (u) { var by = u.pass ? u.target - u.total : u.total - u.target; return { kind: 'check', pass: u.pass, text: (u.pass ? 'success' : 'failure') + (by > 0 ? ' by ' + fmtNum(by) : ''), crit: u.crit, margin: u.pass ? Math.max(0, u.target - u.total) : Math.min(0, u.target - u.total) }; }   // 1.5.8: margin, how far it beat its target (a miss below 0)
    var fx = fixedCrit(res, rule); if (fx) { var vf = { kind: 'check', pass: fx.pass, text: (fx.pass ? 'success' : 'failure') + (fx.by > 0 ? ' by ' + fmtNum(fx.by) : ''), crit: fx.crit, margin: fx.margin }; if (rule.high === true) vf.high = true; return vf; }   // 1.6.0: criticals at fixed rolls
    var top = null, checks = res.breakdown && res.breakdown.checks ? res.breakdown.checks : [];
    for (var i = 0; i < checks.length; i++) if (checks[i].top) top = checks[i];
    if (top) {
        var margin = typeof top.margin === 'number' ? Math.abs(top.margin) : null, by = margin !== null && top.op !== '=' && top.op !== '!=' ? ' by ' + fmtNum(margin) : '';
        var mg = margin !== null && top.op !== '=' && top.op !== '!=' && isFinite(top.margin) ? (top.pass ? Math.max(0, top.margin) : Math.min(0, top.margin)) : 0;   // 1.5.8: signed, as the comparison reads it (a roll-over total - target, a roll-under target - total)
        return { kind: 'check', pass: !!top.pass, text: (top.pass ? 'success' : 'failure') + by, margin: mg };
    }
    return { kind: 'value', value: res.value, text: fmtNum(res.value) };
}
// 1.5.8 explosives: a check's outcome as a throw reads it: { pass, crit ('crit' | 'fumble' | ''), total, target, margin } (margin: how far it made or
// missed, 0 or more); a 3d6 roll-under check by its own criticals, any other check by its top comparison; null for a roll that is no check
function checkOf(res, rule) {
    if (!res || !res.ok) return null;
    var u = rule === 'under3d6' ? under3d6(res) : null;
    if (u) return { pass: u.pass, crit: u.crit || '', total: u.total, target: u.target, margin: Math.abs(u.total - u.target) };
    var fx = fixedCrit(res, rule); if (fx) return { pass: fx.pass, crit: fx.crit, total: fx.total, target: fx.target, margin: Math.abs(fx.margin) };   // 1.6.0: criticals at fixed rolls
    var top = null, checks = res.breakdown && Array.isArray(res.breakdown.checks) ? res.breakdown.checks : [];
    for (var i = 0; i < checks.length; i++) if (checks[i] && checks[i].top) top = checks[i];
    if (!top) return null;
    var m = typeof top.margin === 'number' && isFinite(top.margin) ? Math.abs(top.margin) : 0;
    return { pass: !!top.pass, crit: critOf(res, rule) || '', total: typeof top.left === 'number' ? top.left : null, target: typeof top.right === 'number' ? top.right : null, margin: m };
}
function fmtNum(v) {
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    if (Math.floor(v) === v) return String(v);
    var s = String(Number(v.toFixed(4))); return s === '-0' ? '0' : s;
}
// Exactly one plain d20, kept, no reroll, no explosion, no success counting: 20 = crit, 1 = fumble; rule 'under3d6' (F8): a 3d6 roll-under
// check's own criticals first
function critOf(res, rule) {
    var u3 = rule === 'under3d6' ? under3d6(res) : null; if (u3) return u3.crit || null;
    if (isFixedRule(rule)) { var fx = fixedCrit(res, rule); return fx && fx.crit ? fx.crit : null; }   // 1.6.0: under criticals at fixed rolls nothing else is a critical
    var main = mainDice(res); if (main.length !== 1) return null;
    var rec = main[0];
    if (!rec || rec.count !== 1 || rec.faces !== 20 || !Array.isArray(rec.dice) || rec.dice.length !== 1 || rec.cs) return null;
    var die = rec.dice[0];
    if (!die || !die.kept || (Array.isArray(die.hist) && die.hist.length > 1) || (Array.isArray(die.chain) && die.chain.length > 1)) return null;
    var v = typeof die.value === 'number' ? die.value : (Array.isArray(die.chain) && die.chain.length ? die.chain[0] : null);
    if (v === 20) return 'crit';
    if (v === 1) return 'fumble';
    return null;
}
// Who did what, one line: "Pat rolled 2d6 + 3 [4, 5] + 3 = 12"; private tags first so a log cap never eats them
function tagOf(rec, opts) {
    if (!rec) return '';
    if (rec.priv === 'gm') return rec.from.gm ? ' (private)' : ' (to the GM)';
    if (rec.to) return ' (to ' + (opts && opts.toName ? opts.toName : 'one player') + ')';
    return '';
}
// 1.6.2: what the table is sent of a roll whose figure is hidden. A card is rebuilt on each machine from its expression, its draws and its names, so a line left
// off a card hides nothing from a changed app: the copy holds the dice alone (hidExpr, each group by what it rolled, modifiers glued to it being plain
// numbers) and the host's verdict as a word, hid: 'pass', 'fail', or 'rolled' for a roll that is no check. It is written key by key, so nothing else of the record
// rides along: no names, target, margin, range, Big Hit or what a value was worked out from. A Malf is said only where this roll jammed (the roll's own natural
// total, as malfMask gives it). o: { rule, malf (true where it jammed), label (a word in place of the record's, '' for none) }. hidc: a critical
// that stands on the dice alone (hidCrit): 5, 6, 17 and failing by 10 under 3d6 turn on the target, so they are not said. An expression that does not
// replay is no dice at all, so a card always stands
function hidExpr(res) {
    var out = []; (res && res.ok && res.breakdown && Array.isArray(res.breakdown.dice) ? res.breakdown.dice : []).forEach(function(d) {
        if (!d || !isInt(d.count)) return; var m = /^(?:\d+|\([^]*\))?d(?:\d+|%|\([^]*\)|f)/i.exec(String(d.text || ''));
        out.push(d.count + 'd' + d.faces + (m ? String(d.text).slice(m[0].length) : ''));
    });
    return out.length ? out.join(' + ') : '0';
}
function hidCrit(res, rule) {
    var u = rule === 'under3d6' ? under3d6(res) : null; if (u) return u.total <= 4 ? 'crit' : u.total === 18 ? 'fumble' : '';
    var fx = fixedCrit(res, rule); return fx && fx.crit ? fx.crit : '';
}
function hidRoll(rec, res, F, o) {
    o = o || {}; var expr = hidExpr(res), draws = Array.isArray(rec.draws) ? rec.draws : [], rp = cleanExpr(expr) ? replay({ expr: expr, draws: draws, v: rec.v }, F, rec.v) : null;
    if (!rp || !rp.ok) { expr = '0'; draws = []; rp = null; }
    var v = verdictOf(res, o.rule), chk = !!(v && v.kind === 'check'), jam = o.malf === true, out = { type: rec.type, id: rec.id, from: rec.from, expr: expr, draws: draws, v: rec.v, ts: rec.ts, hid: jam ? 'fail' : chk ? (v.pass ? 'pass' : 'fail') : 'rolled' };
    ['priv', 'to', 'rid', 'sw', 'as'].forEach(function(k) { if (rec[k] !== undefined) out[k] = rec[k]; });
    var lb = typeof o.label === 'string' ? o.label : rec.label; if (lb) out.label = lb;
    var hc = jam || !chk ? '' : hidCrit(res, o.rule); if (hc) out.hidc = hc;
    if (jam && rp) { out.malf = Math.max(1, naturalOf(res)); out.malfHid = 1; }
    return out;
}
function cardText(rec, res, F, opts) {
    var who = rec && rec.from ? (rec.from.gm ? 'GM' : rec.from.name) : 'Someone';
    var body = res && res.ok && F && F.describe ? F.describe(res, { maxChars: opts && opts.maxChars > 0 ? opts.maxChars : LIMITS.cardChars }) : (rec ? 'a roll that could not be read' : '');
    var as = rec && rec.as && (!rec.from || rec.as !== rec.from.name) ? ' as ' + rec.as : '';
    var u = opts && opts.rule === 'under3d6' ? under3d6(res) : null;   // F8: the rule's verdict in place of the arithmetic's (17 against 18 fails)
    if (u) { var by = u.pass ? u.target - u.total : u.total - u.target; body = body.replace(/:\s*(success|failure)( by [^:]*)?$/, '') + ': ' + (u.crit ? 'critical ' : '') + (u.pass ? 'success' : 'failure') + (by > 0 ? ' by ' + fmtNum(by) : ''); }
    var fxc = !u && opts ? fixedCrit(res, opts.rule) : null;   // 1.6.0: criticals at fixed rolls, alike
    if (fxc) body = body.replace(/:\s*(success|failure)( by [^:]*)?$/, '') + ': ' + (fxc.crit ? 'critical ' : '') + (fxc.pass ? 'success' : 'failure') + (fxc.by > 0 ? ' by ' + fmtNum(fxc.by) : '');
    if (rec && rec.hid === 'gm') body = 'sent to the GM';   // HR1
    if (rec && (rec.hid === 'pass' || rec.hid === 'fail')) body += ': ' + (rec.hidc ? 'critical ' : '') + (rec.hid === 'pass' ? 'success' : 'failure');   // 1.6.2: the host's word, the copy holding no check
    return who + tagOf(rec, opts) + as + ' rolled ' + (rec && rec.label ? rec.label + ': ' : '') + body + (malfOf(rec, res) ? ' \u2014 ' + malfWords(rec) : '');   // R3
}
// Stage 6 HUD R3: a roll's natural total — the dice alone, every term's kept total (3d6 <= Skill: the three dice; d20 + Hit: the d20) — and
// whether a record's malfunction threshold (rec.malf) is reached by it (his reference weapon: a natural total at or past its Malf)
function naturalOf(res) { return mainDice(res).reduce(function(s, d) { return s + (d && typeof d.total === 'number' && isFinite(d.total) ? d.total : 0); }, 0); }
function malfOf(rec, res) { return !!(rec && isInt(rec.malf) && res && res.ok && naturalOf(res) >= rec.malf); }
function malfWords(rec) { return rec && rec.malfHid === 1 ? 'malfunction' : 'malfunction (Malf ' + (rec ? rec.malf : '') + ')'; }   // what a card says of it, the one place
// Chat cards (owner 2026-09-27): the colours a card takes from a system's sheet look — a palette's primary, good, danger (bad), muted and the
// look's accent (else the primary), with tone: the palette made for a dark or a light panel; an accent alone gives the stripe and title.
// Strict #rrggbb, lower-cased; null: no look colours (the app's own). cleanCardLook: that shape checked again (a chat pop-out takes it from
// the main window)
var HEX6 = /^#[0-9a-fA-F]{6}$/;
function hex6(v) { return typeof v === 'string' && HEX6.test(v) ? v.toLowerCase() : ''; }
function ownHex(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k) ? hex6(o[k]) : ''; }   // its own keys only (never one a prototype lends)
function cardLook(look) {
    if (!look || typeof look !== 'object' || Array.isArray(look)) return null;
    var pal = Object.prototype.hasOwnProperty.call(look, 'palette') && look.palette && typeof look.palette === 'object' && !Array.isArray(look.palette) ? look.palette : null, acc = ownHex(look, 'accent');
    if (pal && ['primary', 'good', 'danger', 'muted', 'panel'].every(function(k) { return ownHex(pal, k); })) {
        var n = parseInt(ownHex(pal, 'panel').slice(1), 16), lin = function(c) { var x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
        var L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);   // the sheet's own test (sheets.js accentInk): dark ink reads on it, a light panel
        return { primary: ownHex(pal, 'primary'), good: ownHex(pal, 'good'), bad: ownHex(pal, 'danger'), muted: ownHex(pal, 'muted'), accent: acc || ownHex(pal, 'primary'), tone: (L + 0.05) / 0.0567 >= 1.05 / (L + 0.05) ? 'light' : 'dark' };
    }
    return acc ? { primary: acc, accent: acc } : null;
}
function cleanCardLook(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    var out = {}; ['primary', 'good', 'bad', 'muted', 'accent'].forEach(function(k) { var h = ownHex(v, k); if (h) out[k] = h; });
    if (!out.primary) return null;
    if (Object.prototype.hasOwnProperty.call(v, 'tone') && (v.tone === 'dark' || v.tone === 'light')) out.tone = v.tone;
    return out;
}
// 1.6.2, backlog 212 fold 3 (the owner, by prompt: "The table sees each player's look"): a roller's dice look, the colours its dice are
// drawn in on every screen that shows them. b the body, t the second colour (the pattern's), n the numbers, e the edges of a model that has
// them, p a pattern of DICE_PATS. Strict #rrggbb, lower-cased, by its own keys; null where the body or the numbers are no colour.
var DICE_PATS = ['solid', 'marble', 'speckle', 'two'];
function cleanDiceLook(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    var b = ownHex(v, 'b'), n = ownHex(v, 'n'); if (!b || !n) return null;
    var out = { b: b, t: ownHex(v, 't') || b, n: n }, e = ownHex(v, 'e'); if (e) out.e = e;
    var p = Object.prototype.hasOwnProperty.call(v, 'p') ? v.p : 'solid'; out.p = DICE_PATS.indexOf(p) >= 0 ? p : 'solid';
    return out;
}
// Per-peer and per-table rate limit with an injected clock: allow(peer, now) -> true | 'slow' | 'table'
function RateLimit(cfg) {
    cfg = cfg || LIMITS;
    var peers = Object.create(null), table = [];
    function prune(arr, now) { while (arr.length && now - arr[0] > cfg.windowMs) arr.shift(); }
    return {
        allow: function(peer, now) {
            var p = peers[peer] || (peers[peer] = { last: -Infinity, times: [] });
            prune(p.times, now); prune(table, now);
            if (now - p.last < cfg.perMs || p.times.length >= cfg.burst) return 'slow';
            if (table.length >= cfg.table) return 'table';
            p.last = now; p.times.push(now); table.push(now);
            return true;
        },
        forget: function(peer) { delete peers[peer]; },
        reset: function() { peers = Object.create(null); table = []; }
    };
}
function uid() { return 'r_' + Math.random().toString(36).slice(2, 10); }

var API = { cleanHelpCard: cleanHelpCard, cleanHelpAct: cleanHelpAct, cleanDiceBonus: cleanDiceBonus, hidExpr: hidExpr, hidCrit: hidCrit, hidRoll: hidRoll, cleanAtt: cleanAtt, malfWords: malfWords, cleanCovHit: cleanCovHit, coverHitWords: coverHitWords, cleanPos: cleanPos, posWords: posWords, dueMajor: dueMajor, hitFaces: hitFaces, cleanHits: cleanHits, cleanAim: cleanAim, cleanDmg2: cleanDmg2, cleanRefs: cleanRefs, cleanBlastRoll: cleanBlastRoll, resistWhy: resistWhy, cleanCrit: cleanCrit, fixedCrit: fixedCrit, ruleOf: ruleOf, cleanSwNames: cleanSwNames, checkOf: checkOf, VERSION: VERSION, LIMITS: LIMITS, cleanExpr: cleanExpr, composeModifier: composeModifier, withAdvantage: withAdvantage, cleanFrom: cleanFrom, cleanCardAct: cleanCardAct, cleanRollReq: cleanRollReq, cleanRoll: cleanRoll, cleanApply: cleanApply, applyText: applyText, applyChanges: applyChanges, cleanDue: cleanDue, dueText: dueText, cleanDeny: cleanDeny, cleanRid: cleanRid, cleanLabel: cleanLabel, cleanNames: cleanNames, cleanMods: cleanMods, foldNames: foldNames, replay: replay, checkTableRoll: checkTableRoll, denyText: denyText, parseCommand: parseCommand, verdictOf: verdictOf, critOf: critOf, under3d6: under3d6, cardText: cardText, tagOf: tagOf, naturalOf: naturalOf, malfOf: malfOf, RateLimit: RateLimit, uid: uid, fmtNum: fmtNum, cardLook: cardLook, cleanCardLook: cleanCardLook, cleanDiceLook: cleanDiceLook, DICE_PATS: DICE_PATS };
if (typeof window !== 'undefined') window.wpDiceCore = API;
export { cleanHelpCard, cleanHelpAct, cleanDiceBonus, hidExpr, hidCrit, hidRoll, cleanAtt, malfWords, cleanCovHit, coverHitWords, cleanPos, posWords, dueMajor, hitFaces, cleanHits, cleanAim, cleanDmg2, cleanRefs, cleanBlastRoll, resistWhy, cleanCrit, fixedCrit, ruleOf, cleanSwNames, checkOf, VERSION, LIMITS, cleanExpr, composeModifier, withAdvantage, cleanFrom, cleanCardAct, cleanRollReq, cleanRoll, cleanApply, applyText, applyChanges, cleanDue, dueText, cleanDeny, cleanRid, cleanLabel, cleanNames, cleanMods, foldNames, replay, checkTableRoll, denyText, parseCommand, verdictOf, critOf, under3d6, cardText, tagOf, RateLimit, uid, fmtNum, naturalOf, malfOf, cardLook, cleanCardLook, cleanDiceLook, DICE_PATS };
