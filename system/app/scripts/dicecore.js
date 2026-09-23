/* Dice (1.5.0) — the pure half: the limits, the validators for what comes off the wire (a roll request from a
   player, a roll record from the host, a refusal), the replay of a record through the formula engine, the chat
   command parser, the card / log text, the lone-d20 crit rule and the rate limiter. No DOM, no state, no engine
   import: the engine API (window.wpFormula) is passed in, so tools/dicecheck.js runs this under Node with a
   scripted engine. Published as window.wpDiceCore when a window exists. Design of record: docs/DICE_PLAN.md. */
'use strict';

var VERSION = '1.5.0';
var LIMITS = Object.freeze({
    expr: 300,          // characters in a table roll
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
    cardChars: 240      // describe() cap in a toast / plain-text card
});
var ID_RE = /^r_[A-Za-z0-9]{1,16}$/;
var RID_RE = /^[A-Za-z0-9_-]{1,24}$/;
var PEER_RE = /^[A-Za-z0-9_-]{1,80}$/;
var NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;   // a sheet key, dotted (Skill.Stealth, HP.max)
var CHAR_RE = /^c_[A-Za-z0-9_]{1,24}$/;
var CTRL_RE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');
var REASONS = { off: 1, slow: 1, many: 1, names: 1, error: 1, table: 1, char: 1 };

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
function composeModifier(expr, mod, parse) {
    if (typeof parse !== 'function') return { ok: false };
    var clean = cleanExpr(expr); if (!clean) return { ok: false };
    if (!isInt(mod)) return { ok: false };            // a non-integer modifier is not allowed
    if (mod === 0) return { ok: true, expr: clean };   // nothing to fold in
    var modTxt = (mod > 0 ? ' + ' : ' - ') + Math.abs(mod), out;
    var p = null; try { p = parse(clean); } catch (e) { p = null; }
    var body = p && p.ok && p.ast ? p.ast.body : null;
    if (body && body.t === 'cmp' && isInt(body.opPos) && isInt(body.opLen)) {
        var left = clean.slice(0, body.opPos).trim();
        var opTxt = clean.slice(body.opPos, body.opPos + body.opLen).trim();
        var right = clean.slice(body.opPos + body.opLen).trim();
        if (!left || !opTxt || !right) out = '(' + clean + ')' + modTxt;
        else if (body.op === '<' || body.op === '<=') out = left + ' ' + opTxt + ' (' + right + ')' + modTxt;   // roll-under: a bonus raises the target
        else out = '(' + left + ')' + modTxt + ' ' + opTxt + ' ' + right;                                       // roll-over / = / !=: a bonus lifts the roll
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
    var out = clean.slice(0, d.pos) + '2d' + d.faces.text + (mode === 'adv' ? 'kh1' : 'kl1') + clean.slice(d.pos + d.len);
    var cc = cleanExpr(out); if (!cc) return { ok: false };
    var q = null; try { q = parse(cc); } catch (e2) { q = null; }
    if (!q || !q.ok) return { ok: false };
    return { ok: true, expr: cc };
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
        var v = n.value; if (!(typeof v === 'boolean' || (typeof v === 'number' && isFinite(v)))) return null;
        var l = n.name.toLowerCase(); if (l in seen) { if (seen[l] !== v) return null; continue; }
        seen[l] = v; out.push({ name: n.name, value: v });
    }
    return out;
}
function foldNames(names) { var o = {}; (names || []).forEach(function(n) { o[String(n.name).toLowerCase()] = n.value; }); return o; }
function cleanRid(msg) { return msg && typeof msg === 'object' && typeof msg.rid === 'string' && RID_RE.test(msg.rid) ? msg.rid : null; }
// A player's request: { type: 'roll-req', rid, expr, priv? }
function cleanRollReq(msg) {
    if (!msg || typeof msg !== 'object') return null;
    var expr = cleanExpr(msg.expr); if (!expr) return null;
    if (typeof msg.rid !== 'string' || !RID_RE.test(msg.rid)) return null;
    var out = { rid: msg.rid, expr: expr };
    if (msg.priv !== undefined) { if (msg.priv !== 'gm') return null; out.priv = 'gm'; }
    if (msg.charId !== undefined) { if (typeof msg.charId !== 'string' || !CHAR_RE.test(msg.charId)) return null; out.charId = msg.charId; }   // roll as this character (its own values)
    var label = cleanLabel(msg.label); if (label === null) return null; if (label) out.label = label;
    return out;
}
// The host's record: { type: 'roll', id, from, expr, draws, v, ts, priv?, to?, rid? }
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
    var lb = cleanLabel(rec.label); if (lb === null) return null; if (lb) out.label = lb;
    var as = cleanLabel(rec.as); if (as === null) return null; if (as) out.as = as;
    return out;
}
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
// The top-level check of a result, or its value
function verdictOf(res) {
    if (!res || !res.ok) return null;
    var top = null, checks = res.breakdown && res.breakdown.checks ? res.breakdown.checks : [];
    for (var i = 0; i < checks.length; i++) if (checks[i].top) top = checks[i];
    if (top) {
        var margin = typeof top.margin === 'number' ? Math.abs(top.margin) : null, by = margin !== null && top.op !== '=' && top.op !== '!=' ? ' by ' + fmtNum(margin) : '';
        return { kind: 'check', pass: !!top.pass, text: (top.pass ? 'success' : 'failure') + by };
    }
    return { kind: 'value', value: res.value, text: fmtNum(res.value) };
}
function fmtNum(v) {
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    if (Math.floor(v) === v) return String(v);
    var s = String(Number(v.toFixed(4))); return s === '-0' ? '0' : s;
}
// Exactly one plain d20, kept, no reroll, no explosion, no success counting: 20 = crit, 1 = fumble
function critOf(res) {
    if (!res || !res.ok || !res.breakdown || !Array.isArray(res.breakdown.dice) || res.breakdown.dice.length !== 1) return null;
    var rec = res.breakdown.dice[0];
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
function cardText(rec, res, F, opts) {
    var who = rec && rec.from ? (rec.from.gm ? 'GM' : rec.from.name) : 'Someone';
    var body = res && res.ok && F && F.describe ? F.describe(res, { maxChars: opts && opts.maxChars > 0 ? opts.maxChars : LIMITS.cardChars }) : (rec ? 'a roll that could not be read' : '');
    var as = rec && rec.as && (!rec.from || rec.as !== rec.from.name) ? ' as ' + rec.as : '';
    return who + tagOf(rec, opts) + as + ' rolled ' + (rec && rec.label ? rec.label + ': ' : '') + body;
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

var API = { VERSION: VERSION, LIMITS: LIMITS, cleanExpr: cleanExpr, composeModifier: composeModifier, withAdvantage: withAdvantage, cleanFrom: cleanFrom, cleanRollReq: cleanRollReq, cleanRoll: cleanRoll, cleanDeny: cleanDeny, cleanRid: cleanRid, cleanLabel: cleanLabel, cleanNames: cleanNames, foldNames: foldNames, replay: replay, checkTableRoll: checkTableRoll, denyText: denyText, parseCommand: parseCommand, verdictOf: verdictOf, critOf: critOf, cardText: cardText, tagOf: tagOf, RateLimit: RateLimit, uid: uid, fmtNum: fmtNum };
if (typeof window !== 'undefined') window.wpDiceCore = API;
export { VERSION, LIMITS, cleanExpr, composeModifier, withAdvantage, cleanFrom, cleanRollReq, cleanRoll, cleanDeny, cleanRid, cleanLabel, cleanNames, foldNames, replay, checkTableRoll, denyText, parseCommand, verdictOf, critOf, cardText, tagOf, RateLimit, uid, fmtNum };
