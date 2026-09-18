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
    cardChars: 240      // describe() cap in a toast / plain-text card
});
var ID_RE = /^r_[A-Za-z0-9]{1,16}$/;
var RID_RE = /^[A-Za-z0-9_-]{1,24}$/;
var PEER_RE = /^[A-Za-z0-9_-]{1,80}$/;
var CTRL_RE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');
var REASONS = { off: 1, slow: 1, many: 1, names: 1, error: 1, table: 1 };

function str(v, cap) { return typeof v === 'string' ? v.slice(0, cap) : ''; }
function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
function cleanExpr(s) {
    if (typeof s !== 'string') return null;
    s = s.trim();
    if (!s || s.length > LIMITS.expr || CTRL_RE.test(s)) return null;
    return s;
}
function cleanFrom(f) {
    if (!f || typeof f !== 'object') return null;
    var id = str(f.id, 60), name = str(f.name, 60);
    if (!id) return null;
    return { id: id, name: name || 'Player', gm: f.gm === true };
}
// A player's request: { type: 'roll-req', rid, expr, priv? }
function cleanRollReq(msg) {
    if (!msg || typeof msg !== 'object') return null;
    var expr = cleanExpr(msg.expr); if (!expr) return null;
    if (typeof msg.rid !== 'string' || !RID_RE.test(msg.rid)) return null;
    var out = { rid: msg.rid, expr: expr };
    if (msg.priv !== undefined) { if (msg.priv !== 'gm') return null; out.priv = 'gm'; }
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
    try { res = F.evaluate(rec.expr, { random: F.fromDraws(rec.draws) }); } catch (e) { res = null; }
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
    names: 'Names like STR come with the character sheets.',
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
    return who + tagOf(rec, opts) + ' rolled ' + body;
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

var API = { VERSION: VERSION, LIMITS: LIMITS, cleanExpr: cleanExpr, cleanFrom: cleanFrom, cleanRollReq: cleanRollReq, cleanRoll: cleanRoll, cleanDeny: cleanDeny, replay: replay, checkTableRoll: checkTableRoll, denyText: denyText, parseCommand: parseCommand, verdictOf: verdictOf, critOf: critOf, cardText: cardText, tagOf: tagOf, RateLimit: RateLimit, uid: uid, fmtNum: fmtNum };
if (typeof window !== 'undefined') window.wpDiceCore = API;
export { VERSION, LIMITS, cleanExpr, cleanFrom, cleanRollReq, cleanRoll, cleanDeny, replay, checkTableRoll, denyText, parseCommand, verdictOf, critOf, cardText, tagOf, RateLimit, uid, fmtNum };
