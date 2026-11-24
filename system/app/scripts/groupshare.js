/* groupshare.js (1.6.4, gap #23 of the full test, docs/proof/GAPS.md; Fulllion's picks of 2026-11-24): a group roll judged by a share, run on the GM's
   machine. Everyone picked rolls the check, and the group passes when enough of them pass. The rule (systemcore groupRuleOf: a roll's own, else the
   Combat tab's) says how many must pass, who rolls and who is told:
     rolls 'gm'       the GM's one press rolls each member's check at once, each card in Table Chat as a roll of theirs is;
     rolls 'players'  each player's character gets a card to roll it (a roll called for by the GM), and the GM's own characters roll at once. A roll
                      kept from players (its own vis is the GM's) is rolled by the GM for everyone, since a player has no button for it;
     tell 'table'     the result is a line in Table Chat for everyone; 'gm' for the GM alone. A roll kept from players, or any member's roll that
                      went to the GM alone, keeps the line the GM's whatever is set.
   A member's roll counts once it lands on the host, from either roll path (net.js restR for the GM's own, restQ for a player's), matched by its
   character and the roll's id: landed() is told of every named roll, and takes the first open group check that waits on that character for that
   roll. The judging is systemcore groupJudge's alone. A group check that waits longer than WAIT_MS is judged as it stands, those who did not roll
   left out of the count and named. Nothing here is stored or sent: the runs live in this machine's memory and go with a reload. */
var WAIT_MS = 5 * 60 * 1000, RUN_MAX = 20;
var _runs = [];   // open group checks, oldest first: { id, act, label, rule, list: [{ id, name, pass }], priv, timer }
function S() { return typeof window !== 'undefined' ? window.wpSystemCore : null; }
function stepLog(what, info) { if (typeof window !== 'undefined' && window.wpStepLog) window.wpStepLog('groupshare v1', what, info || {}); }
// Whether a member is a player's character, whose own player is asked to roll it (an NPC, or a sheet with no player, is the GM's)
function playersOwn(ch) { return !!(ch && typeof ch === 'object' && ch.npc !== true && typeof ch.ownerId === 'string' && ch.ownerId); }
// The result line, said once the run is over: to the table, or to the GM alone (net.groupLine; a machine with no table shows it here alone)
function finish(run, why) {
    var i = _runs.indexOf(run); if (i < 0) return; _runs.splice(i, 1); if (run.timer) clearTimeout(run.timer);
    var Sc = S(); if (!Sc) return;
    var j = Sc.groupJudge(run.rule, run.list), text = Sc.groupLine(run.label, run.rule, j), gmOnly = run.rule.tell === 'gm' || run.priv;
    var n = typeof window !== 'undefined' ? window.wpNet : null; if (n && typeof n.groupLine === 'function') n.groupLine(text, gmOnly);
    stepLog('judged', { why: why, rolled: j.rolled, passed: j.passed, need: j.need, pass: j.pass, missing: j.missing.length, gmOnly: gmOnly });
    return j;
}
// Start a group check. o: { label (the roll's words), roll (its entry, the GM's), rule (a share rule), members: [{ id, char }], rollFor(id, member):
// rolls one member's check now on this machine, answering { error } where it could not; callFor(member): posts its card to its player }. Every member is
// listed before the first roll, since a roll that lands at once tells landed() before rollFor answers. Answers the run, or null where nothing could start
function start(o) {
    if (!o || !o.roll || typeof o.roll.id !== 'string' || !o.rule || o.rule.by !== 'share' || !Array.isArray(o.members) || !o.members.length) return null;
    while (_runs.length >= RUN_MAX) finish(_runs[0], 'crowded');
    var keptFromPlayers = o.roll.vis === 'gm';
    var run = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), act: o.roll.id, label: o.label || 'Group roll', rule: o.rule, list: [], priv: keptFromPlayers, timer: null };
    o.members.forEach(function(m) { run.list.push({ id: m.id, name: String((m.char && m.char.name) || 'Someone').slice(0, 60), pass: null, asked: o.rule.rolls === 'players' && !keptFromPlayers && playersOwn(m.char) }); });
    _runs.push(run);
    run.timer = setTimeout(function() { finish(run, 'time'); }, WAIT_MS);
    stepLog('started', { n: run.list.length, rolls: o.rule.rolls, tell: o.rule.tell, share: o.rule.share });
    o.members.forEach(function(m, k) {
        var e = run.list[k];
        if (e.asked && typeof o.callFor === 'function') { o.callFor(m); return; }
        var r = typeof o.rollFor === 'function' ? o.rollFor(m.id, m) : { error: 'No roller' };
        if (r && r.error && _runs.indexOf(run) >= 0) { e.pass = null; e.failed = true; stepLog('not-rolled', { why: 'error' }); }
    });
    settle(run);
    return run;
}
// A run is over once every member has rolled, or could not roll and is waited on by nobody
function settle(run) { if (_runs.indexOf(run) >= 0 && run.list.every(function(e) { return e.pass !== null || e.failed; })) finish(run, 'all'); }
// A named roll landed on this machine (the host's). charId: whom it was made as; act: the roll's id; vd: its verdict (dicecore verdictOf); malf: it
// jammed, which is a failure; priv: it went to the GM alone (or its figure was kept from the table). Answers whether a group check took it
function landed(charId, act, vd, malf, priv) {
    if (typeof charId !== 'string' || typeof act !== 'string') return false;
    for (var i = 0; i < _runs.length; i++) {
        var run = _runs[i]; if (run.act !== act) continue;
        var e = run.list.filter(function(x) { return x.id === charId && x.pass === null && !x.failed; })[0]; if (!e) continue;
        e.pass = !malf && !!vd && vd.kind === 'check' && vd.pass === true; if (priv) run.priv = true;
        stepLog('landed', { pass: e.pass, priv: !!priv });
        settle(run); return true;
    }
    return false;
}
// The table is gone, or the campaign changed: every open run is let go, with no line
function forget() { _runs.forEach(function(r) { if (r.timer) clearTimeout(r.timer); }); _runs = []; }
function open() { return _runs.map(function(r) { return { act: r.act, label: r.label, waiting: r.list.filter(function(e) { return e.pass === null && !e.failed; }).length }; }); }
var API = { start: start, landed: landed, forget: forget, open: open, playersOwn: playersOwn, WAIT_MS: WAIT_MS };
export { start, landed, forget, open, playersOwn, WAIT_MS };
if (typeof window !== 'undefined') window.wpGroupShare = API;
