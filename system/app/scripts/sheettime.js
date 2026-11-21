/* sheettime.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 2, time rules; split 2026-11-18 with no change in behavior).
   What it holds: how the sheet runs the rules that come due by time, on the machine that owns the campaign. The host's round and turn
   hooks (timedHook, with roundHook, turnHook and turnEndHook), the cards of what Keeps paying paid (upkeepCards), and the time rules
   the clock hands over (runTimeRules, in the [sinkcheck:timerules-*] lines, with what each run read and moved, its summary's words,
   whether it rolls dice, and the order of runs within a long step). What a rule is and how one run goes live in systemcore.js's parts
   everycore.js and timecore.js; the Rolls tab's rows that set a rule up live in sheetevery.js.
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sheetTime() at
   its line `// [split:sheettime.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in sheets.js. */
// [split:of sheets.js]
import { APPLY_KINDS, F, LIMITS, applyAct, applyRound, applyScope, chainsShallow, charById, charsOf, combatChars, dueActs, figText, getActiveCampaign, gmOnlyNames, hasDice, lazyVars, linkValuesWrite, makeResolver, net, opt, renderViews, resolveAll, rollNeedsOk, rolled, ruleFollow, ruleRunCtx, save, state, systemOf, tab, timeRuleRun, tokenCtx, tokenFlags, upkeepLines, withOnSelf, withRound } from './sheets.js';   // [split:glue]
export function sheetTime() {   // [split:glue]
// [split:body-start]
// Stage 6 HUD G10: the host's round hook — on every new round of a combat (net.js combatStep / combatSet), each Each round action on every
// character with a token in it, worked out with the GM's full view and the round just begun (Turn := CombatRound), as his sweep runs on the
// GM's client alone. No card (his sweep posts one only when something expired); one save, one delta per character. Turn-based combat T2b:
// the same for 'turn' — the character whose turn begins, its actions ticked at its turn's start; an action set to wait for a press posts its
// reminder instead (the GM's, or its player's while that player is at the table and the action is theirs to see)
function timedHook(mapId, combat, kind) {
    var camp = getActiveCampaign(), sys = systemOf(camp), n = net(); if (!camp || !sys || !F() || !n || n.role !== 'host') return 0;
    if (window.wpVtt && !window.wpVtt.on('sheets')) return 0;
    var mp = typeof mapId === 'string' && camp.items && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? camp.items[mapId] : null, done = 0, dues = dueActs(sys, kind);
    var who = kind === 'turn' || kind === 'turnEnd' ? { rows: combat && Array.isArray(combat.rows) && combat.rows[combat.turn] ? [combat.rows[combat.turn]] : [] } : combat;
    combatChars(mp, who, charsOf(camp)).forEach(function(e) {
        var c = charById(e.charId, camp); if (!c) return;
        var tc = withRound(tokenCtx(mp, e.tok, Object.assign({}, tokenFlags(), { viewer: typeof e.tok.ownerId === 'string' ? e.tok.ownerId : undefined })), combat), vvD = null;   // 1.5.5 (the release trace, F2): a player's character is judged by what its player sees, as turnMoveStart judges it, so an attacker hidden from them counts for nothing
        dues.forEach(function(a) { if ((a.needs || a.needsWhy) && typeof rollNeedsOk === 'function') { vvD = vvD || hookVars(sys, c, tc); if (!rollNeedsOk(a, (a.to === 'near' || a.to === 'target') ? withOnSelf(vvD, true) : vvD, F())) return; } if (n.postDue) n.postDue(c, a, kind, combat.round, a.by === 'owner' && a.vis !== 'gm'); });   // 1.5.4: no reminder while its needs are not met
        var res = applyRound(sys, c, function(w) { return hookVars(sys, w, tc); }, F(), tc, kind, window.wpDiceCore || null, { now: Date.now(), inCombat: true }), ids = Object.keys(res.values);   // 1.5.9: the host's dice roll a Rolled amount
        if (res.upkeep && window.wpStepLog) window.wpStepLog('upkeep v1', 'paid', { when: kind, paid: res.upkeep.paid, off: res.upkeep.off.length });   // 1.6.0 (CORE gap 13)
        if (res.linkValues && typeof linkValuesWrite === 'function' && linkValuesWrite(res.linkValues) && !ids.length) { done++; return; }   // 1.6.2: what it moved on a linked sheet
        if (!ids.length) return;
        c.values = c.values || {}; ids.forEach(function(fid) { c.values[fid] = res.values[fid]; }); c.updated = Date.now();
        if (n.active) n.syncCharDelta(c.id, res.values);
        renderViews(c.id); done++;
        if (typeof ruleFollow === 'function') ruleFollow(c, camp);   // the review of folds 4a and 6b: what the funnels ask after a change
        if (res.upkeepSaid) upkeepCards(c, res.upkeepSaid, n);   // 205 follow-up (3): what a row switched on paid, said
    });
    if (done) { save(true); if (window.appRender) window.appRender(); }
    return done;
}
// 1.6.3 (the improvement week's combat review, finding 5): the names a hook's needs and actions are read with. systemcore lazyVars answers
// every name as resolveAll's .vars would and works out only the names each action reads, so a hook whose actions mostly fail on their needs no
// longer works out the whole sheet for each of them. Without it (a harness that slices this file alone), the whole sheet as before
function hookVars(sys, w, tc) { return typeof lazyVars === 'function' ? lazyVars(sys, w, F(), tc) : resolveAll(sys, w, F(), tc).vars; }
// 205 follow-up (3): a turn's or a round's upkeep said on apply cards (net.postApplyCard), once a character: what its owner may see on a card for
// them and the GM, the rest on one for the GM alone (systemcore upkeepLines judges which); LIMITS.applyChanges lines a card. The number of cards
function upkeepCards(c, said, n) {
    if (!c || !n || typeof n.postApplyCard !== 'function' || typeof upkeepLines !== 'function') return 0;
    var mx = typeof LIMITS === 'object' && LIMITS && LIMITS.applyChanges > 0 ? LIMITS.applyChanges : 120, k = 0;
    [[upkeepLines(said, true), 'owner'], [upkeepLines(said, false), 'gm']].forEach(function(p) { for (var i = 0; i < p[0].length; i += mx) { n.postApplyCard(c, 'Upkeep', p[0].slice(i, i + mx), p[1]); k++; } });
    return k;
}
// [sinkcheck:timerules-start]
// The flood fix (the owner, 2026-10-22, by prompt: "Nothing at all (Recommended)"): a time rule's run that moved nothing and rolled no dice posts no
// summary and no Game Record line, so a hundred NPCs at their most send the GM nothing each hour. A roll whose formula holds no dice is worked out, never
// rolled, so its run counts as rolled only where its formula holds dice (ruleDice; with no way to tell, a roll made counts). What moved is judged by what the sheet reads of each
// value the run wrote, before it is stored and after (ruleReads, through the resolver, in the fight's round where the run had one): a pool its current
// value, a number its total and its stored value. A value written in another form moved nothing (a full pool stored as full, a pool held to its most, a
// number set to what it held), and a number under an effect or an item's change moved as it reads, whatever the run's own line measured from. What a run
// can write is a pool's current value or a number's stored value (APPLY_KINDS), and nothing else of the character: no row's counter (it has no row), no
// list and no effect. With no resolver at hand every value written counts as moved, so nothing that moved is ever left out of a summary. A figure that
// moved is said as the sheet writes it (figText), so a number's sum of fractions reads as on the sheet
function ruleReads(sys, c, ks, tc, rr) {   // rr (1.5.5): a resolver of c as it stands in tc, where the run has one
    if (typeof makeResolver !== 'function' || !F() || !ks.length) return null;
    var r = typeof rr === 'function' ? rr : makeResolver(sys, c, F(), tc), out = {};
    ks.forEach(function(k) { var f = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(x) { return x && x.id === k; })[0]; if (!f) return; var t = r(f.key), b = f.kind === 'number' ? r(f.key + '.base') : null; out[k] = { t: t, b: b, n: f.label || f.key, f: f, s: JSON.stringify([t, b]) }; });
    return out;
}
// 1.6.0: a summary line's words; one on every row of a list says its list, its stat and its rows once (systemcore applyAct), a Set its figure and an Add or a Subtract its amount on each
function ruleLineWords(l) { return l.all ? l.n + (l.vary ? (l.set ? ' set row by row' : ' moved row by row') : l.set ? ' set to ' + l.v : ' ' + (l.d >= 0 ? '+' : '') + l.d + ' each') : l.n + ' ' + (l.d >= 0 ? '+' : '') + l.d + ' \u2192 ' + l.v; }   // 1.6.0: a figure worked out row by row that differs by row (vary) says no figure
function ruleMoves(sys, c, ks, pre, tc, lines, rr) {   // the summary's lines for the values written that moved, { n, d, v } as the sheet reads them, in the run's order; rr: as ruleReads'
    var post = ruleReads(sys, c, ks, tc, rr), out = [], num = function(x) { return typeof x === 'number' && isFinite(x); }, step = function(x, y) { return Math.round((y - x) * 1000) / 1000; };
    var shown = function(f, x) { return typeof figText === 'function' ? figText(f, x) : Math.round(x * 1000) / 1000; };   // the figure as the sheet writes it, never a sum's float noise
    ks.forEach(function(k) {
        var alls = lines.filter(function(l) { return l.f === k && l.all; }); if (alls.length) { alls.forEach(function(l) { out.push(l); }); return; }   // 1.6.0: a list it set on every row, as the run says it
        var a = pre[k], b = post ? post[k] : null, own = lines.filter(function(l) { return l.f === k; })[0] || null;
        if (a && b && a.s === b.s) return;   // written in another form: nothing moved
        if (a && b && num(a.t) && num(b.t) && a.t !== b.t) out.push({ n: b.n, d: step(a.t, b.t), v: shown(b.f, b.t) });   // what the sheet shows moved
        else if (a && b && num(a.b) && num(b.b) && a.b !== b.b) out.push({ n: b.n, d: step(a.b, b.b), v: shown(b.f, b.b) });   // only a number's stored value moved (an automatic effect made up for it)
        else out.push(own || { n: (b || a || { n: k }).n, d: 0, v: '' });   // a reading that is no number: the run's own line
    });
    return out;
}
function ruleDice(rule) {   // whether a time rule's roll rolls dice: its own formula holds them (one with none is worked out, never rolled); with no way to tell, it does
    if (!rule || typeof rule.formula !== 'string' || !rule.formula) return false;
    var p = typeof hasDice === 'function' && typeof F().parse === 'function' ? F().parse(rule.formula) : null;
    return !p || !p.ok || !p.ast ? true : hasDice(p.ast.body);
}
// Item 20 K5: the time rules a stretch of the campaign's clock fired (calendar.js: after the GM's Apply, or at once when Automatic) — each fire
// { c: charId, r: ruleId, n } run n times with the GM's full view and no token (systemcore timeRuleRun: the host makes every roll), stored, one
// delta per character, its views redrawn; then one summary per character (net.timeCard: its player and the GM, or the GM alone for an NPC or a
// rule that moves or reads what its player cannot see) and the Game Record's line. words: the stretch ("8 hours of rest"; a fight's round, "Round 3
// on Docks"). Backlog 152: a rule may run By the clock, In a fight or both, and a fire In a fight (x) runs in its fight's round, so CombatRound reads
// it: its own rd, else at ({ round }). A run that moved nothing and rolled no dice adds nothing to the summary, and a character with nothing left gets
// none (the flood fix, above). Whom a summary goes to is decided by every rule that fired, before it runs, whether it then moved, stayed quiet or was
// held by its needs: so whether a player gets a summary never says whether a GM-only rule moved or met its needs. Returns how many characters changed.
// 1.5.5 (found live: one press of +1 hour on a campaign of 158 characters held the GM's screen for four seconds): whom a rule's summary goes to is
// worked out once a rule, since applyScope reads nothing of a character but whether it is an NPC or has no player; and where chainsShallow says
// any resolver of one state answers every name alike, one resolver of a character as it stands serves its run's first pass (timeRuleRun's opt),
// what the sheet read before and, once its values are stored, what it reads after and the next fire's first pass, until anything is stored again.
// 1.5.5's review: a fire of a rule ticked Only while its needs hold may carry due (calendar.js dueOn), the timed effects its character had where each
// of its runs came due, which timeRuleRun makes them with; and back, where it is handed in, is told of each fire run, (fire, runs made, whether its
// needs held it back), as it was run, so that calendar.js keeps the time of a run held back (heldBack). Without either, exactly as before
// 176 (the owner, 2026-10-28, by prompt: "Hour by hour (Recommended)"): when (calendar.js whenOf) says, for each fire, when each of its runs came
// due in the stretch. Where a character's runs then come in another order than fire by fire, they are made one at a time in the order they came due
// (a tie in the order the fires were handed, which is the Rolls tab's), each run as its character then stands, so one long step gives what many short
// ones give. A fire's runs end at the first its needs hold back, as timeRuleRun's do; what each fire made is told to back in the order of its first
// run; each fire says one line, its values summed as they moved run by run. Without when, or where the order is the same, exactly as before
function runOrder(list, when) {
    if (typeof when !== 'function' || !Array.isArray(list) || list.length < 2) return null;
    var runs = [];
    for (var i = 0; i < list.length; i++) { var ts = null; try { ts = when(list[i]); } catch (e) { ts = null; } var n = Math.min(500, Math.floor(list[i].n)); if (!Array.isArray(ts) || ts.length !== n) return null; for (var k = 0; k < n; k++) { if (typeof ts[k] !== 'number' || !isFinite(ts[k])) return null; runs.push({ i: i, k: k, t: ts[k] }); } }
    var sorted = runs.slice().sort(function(a, b) { return a.t - b.t || a.i - b.i || a.k - b.k; });
    return sorted.some(function(s, j) { return s !== runs[j]; }) ? sorted : null;
}
function dueAt(due, k) { var c = 0; for (var j = 0; j < due.length; j++) { var d = due[j]; if (!d || typeof d.n !== 'number' || !(d.n >= 1)) continue; c += Math.floor(d.n); if (k < c) return [{ n: 1, fx: d.fx }]; } return null; }   // the one run's due, as dueFx reads its group
function runTimeRules(fires, words, at, back, when) {
    var camp = getActiveCampaign(), sys = systemOf(camp), n = net(), D = window.wpDiceCore; if (!camp || !sys || !F() || !Array.isArray(fires)) return 0;
    var byChar = Object.create(null), order = [], changed = 0, aud = Object.create(null), runChars = [];
    var flat = typeof makeResolver === 'function' && typeof ruleRunCtx === 'function' && typeof chainsShallow === 'function' && chainsShallow(sys, F());   // shared only where sharing changes nothing
    fires.forEach(function(fi) { if (!fi || typeof fi.c !== 'string' || typeof fi.r !== 'string') return; if (!byChar[fi.c]) { byChar[fi.c] = []; order.push(fi.c); } byChar[fi.c].push(fi); });
    order.forEach(function(cid) {
        var c = charById(cid, camp); if (!c) return;
        var parts = [], pl = [], lines = [], all = {}, gm = false, kept = null;   // pl, lines (backlog 173): what its player is told, and the run's lines for the Time rules panel   // kept (1.5.5): { k, r } — a resolver of c as it now stands, in the context k, while nothing is stored
        var seq = runOrder(byChar[cid], when);   // 176: its runs in the order they came due, where that is not fire by fire
        if (seq) {
            var acc = byChar[cid].map(function(fi) { return { fi: fi, rule: null, ran: 0, held: false, stop: false, first: -1, made: 0, pass: 0, drew: 0, lines: [] }; });
            seq.forEach(function(s, si) {
                var A = acc[s.i], fi = A.fi; if (A.stop) return;
                var rule = A.rule || (Array.isArray(sys.rolls) ? sys.rolls : []).filter(function(r) { return r && r.id === fi.r && (r.every || r.inFight); })[0]; if (!rule) { A.stop = true; return; }
                if (!A.rule) { A.rule = rule; A.first = si; var ak = rule.id + (c.npc || !c.ownerId ? '|n' : '|o'); if (aud[ak] === undefined) { var acts = Array.isArray(rule.apply) ? rule : { apply: Array.isArray(rule.then) ? rule.then : [] }, reads = typeof rule.formula === 'string' ? gmOnlyNames(sys, F().names(rule.formula).map(function(x) { return { name: x }; })).length > 0 : false; aud[ak] = rule.vis === 'gm' || applyScope(sys, c, acts, reads, F()) === 'gm'; } if (aud[ak]) gm = true; }
                var atF = fi.x === 1 ? (typeof fi.rd === 'number' && isFinite(fi.rd) ? { round: fi.rd } : at && typeof at === 'object' ? at : undefined) : undefined;
                var tcF = atF && typeof atF === 'object' && typeof atF.round === 'number' && isFinite(atF.round) ? { combat: { round: Math.max(0, Math.min(9999, Math.floor(atF.round))) } } : null;
                var dk = Array.isArray(fi.due) && fi.due.length ? dueAt(fi.due, s.k) : null;
                var res = timeRuleRun(sys, c, rule, 1, F(), D, atF, dk ? { due: dk, flat: flat === true } : undefined), ks = Object.keys(res.values);
                A.ran += res.ran; A.made += res.rolls.made; A.pass += res.rolls.pass; A.drew += res.drew > 0 ? res.drew : 0; if (res.held) { A.held = true; A.stop = true; }
                var wrote = ks.filter(function(k) { return JSON.stringify(c.values ? c.values[k] : undefined) !== JSON.stringify(res.values[k]); });
                var pre = wrote.length ? ruleReads(sys, c, wrote, tcF) : null;
                if (wrote.length) { c.values = c.values || {}; wrote.forEach(function(k) { c.values[k] = res.values[k]; all[k] = res.values[k]; }); }
                var mv = !wrote.length ? [] : pre ? ruleMoves(sys, c, wrote, pre, tcF, res.lines) : res.lines.filter(function(l) { return l.all || l.d !== 0; });
                if (res.linkValues && typeof linkValuesWrite === 'function' && linkValuesWrite(res.linkValues)) mv = mv.concat(res.lines.filter(function(l) { return l.lk && l.d !== 0; }));   // 1.6.2: what it moved on a linked sheet, stored and said   // 1.6.0: a line on every row of a list is said whatever its d (a Set, or a figure that differs by row), as ruleMoves passes it
                mv.forEach(function(l) { var h = A.lines.filter(function(x) { return x.n === l.n; })[0]; if (h) { h.d = l.all && l.set ? l.d : Math.round((h.d + (typeof l.d === 'number' ? l.d : 0)) * 1000) / 1000; h.v = l.v; if (l.all && l.set) { if (l.vary) h.vary = true; else delete h.vary; } else if (l.vary) h.vary = true; } else { var nl = { n: l.n, d: typeof l.d === 'number' ? l.d : 0, v: l.v }; if (l.all) { nl.all = l.all; if (l.set) nl.set = true; if (l.vary) nl.vary = true; } A.lines.push(nl); } });   // 1.6.0: a line on every row keeps saying so
            });
            acc.filter(function(A) { return A.rule; }).sort(function(a, b) { return a.first - b.first; }).forEach(function(A) {
                var fi = A.fi, rule = A.rule;
                if (typeof back === 'function') { try { back(fi, A.ran, A.held); } catch (e) { console.error(e); } }
                if (A.held && !A.ran) return;
                if (!A.lines.length && !(A.made && ruleDice(rule)) && !(A.drew > 0)) return;   // the flood fix, over all its runs
                var head = (rule.label || 'A rule') + ' \u00d7' + fi.n + (A.made ? ' (' + A.pass + ' of ' + A.made + ' succeeded)' : '');
                var lnA = A.lines.filter(function(l) { return l.all || l.d !== 0; }), body = lnA.length ? lnA.map(ruleLineWords).join(', ') : 'no change', nt = rule.notes === 'quiet' || rule.notes === 'panel' ? rule.notes : '';
                parts.push(head + ': ' + body); if (nt !== 'quiet') pl.push(head + ': ' + body); lines.push({ r: rule.id, head: head, body: body, notes: nt, roll: !Array.isArray(rule.apply) });
            });
        } else
        byChar[cid].forEach(function(fi) {
            var rule = (Array.isArray(sys.rolls) ? sys.rolls : []).filter(function(r) { return r && r.id === fi.r && (r.every || r.inFight); })[0]; if (!rule) return;
            var ak = rule.id + (c.npc || !c.ownerId ? '|n' : '|o');   // applyScope reads nothing else of the character
            if (aud[ak] === undefined) { var acts = Array.isArray(rule.apply) ? rule : { apply: Array.isArray(rule.then) ? rule.then : [] }, reads = typeof rule.formula === 'string' ? gmOnlyNames(sys, F().names(rule.formula).map(function(x) { return { name: x }; })).length > 0 : false; aud[ak] = rule.vis === 'gm' || applyScope(sys, c, acts, reads, F()) === 'gm'; }
            if (aud[ak]) gm = true;   // whom the summary goes to, by the rule and before it runs: a GM-only rule keeps it the GM's whether it moved, stayed quiet or was held
            var atF = fi.x === 1 ? (typeof fi.rd === 'number' && isFinite(fi.rd) ? { round: fi.rd } : at && typeof at === 'object' ? at : undefined) : undefined;   // 152: a fire In a fight reads its fight's round
            var tcF = atF && typeof atF === 'object' && typeof atF.round === 'number' && isFinite(atF.round) ? { combat: { round: Math.max(0, Math.min(9999, Math.floor(atF.round))) } } : null;   // the round timeRuleRun runs it in, for what the sheet reads
            var due = Array.isArray(fi.due) && fi.due.length ? fi.due : null;   // 1.5.5's review: made as its character stood where each run came due, so no resolver of c as it stands serves it
            var ck = flat ? JSON.stringify(ruleRunCtx(atF)) : '', r0 = !due && flat && ck === JSON.stringify(tcF) ? (kept && kept.k === ck ? kept.r : makeResolver(sys, c, F(), tcF ? { combat: tcF.combat, reuse: true } : { reuse: true })) : null;   // the run's own context and the sheet's the same
            var res = timeRuleRun(sys, c, rule, fi.n, F(), D, atF, r0 ? { vars: r0 } : due ? { due: due, flat: flat === true } : undefined), ks = Object.keys(res.values);
            if (r0) kept = { k: ck, r: r0 };
            if (typeof back === 'function') { try { back(fi, res.ran, res.held === true); } catch (e) { console.error(e); } }   // 1.5.5's review: what this fire made, as it was run
            if (res.held && !res.ran) return;   // 1.5.4: its needs were not met, so it was passed over
            var wrote = ks.filter(function(k) { return JSON.stringify(c.values ? c.values[k] : undefined) !== JSON.stringify(res.values[k]); });   // only what really changed is stored and sent
            var pre = wrote.length ? ruleReads(sys, c, wrote, tcF, r0) : null;   // what the sheet read before, in the round timeRuleRun ran it in
            if (ks.length) { c.values = c.values || {}; wrote.forEach(function(k) { c.values[k] = res.values[k]; all[k] = res.values[k]; }); }
            if (wrote.length) kept = r0 ? { k: ck, r: makeResolver(sys, c, F(), tcF ? { combat: tcF.combat, reuse: true } : { reuse: true }) } : null;   // stored: a resolver of c as it now stands, for what it reads after and the next fire
            var moved = !wrote.length ? [] : pre ? ruleMoves(sys, c, wrote, pre, tcF, res.lines, kept ? kept.r : null) : null;
            if (res.linkValues && typeof linkValuesWrite === 'function' && linkValuesWrite(res.linkValues) && moved !== null) moved = moved.concat(res.lines.filter(function(l) { return l.lk && l.d !== 0; }));   // 1.6.2: what it moved on a linked sheet, stored and said   // null: no resolver to ask, so each value written counts as moved
            if (moved !== null && !moved.length && !(res.rolls.made && ruleDice(rule)) && !(res.drew > 0)) return;   // the flood fix: it moved nothing and rolled no dice, so it says nothing (1.5.9: a Rolled amount that drew dice rolled them)
            var head = (rule.label || 'A rule') + ' \u00d7' + fi.n + (res.rolls.made ? ' (' + res.rolls.pass + ' of ' + res.rolls.made + ' succeeded)' : '');
            var lns = moved || res.lines.filter(function(l) { return l.all || l.d !== 0; });   // with no resolver, the run's own lines, as before; a roll of dice that moved nothing says no change
            var body = lns.length ? lns.map(ruleLineWords).join(', ') : 'no change', nt = rule.notes === 'quiet' || rule.notes === 'panel' ? rule.notes : '';
            parts.push(head + ': ' + body); if (nt !== 'quiet') pl.push(head + ': ' + body); lines.push({ r: rule.id, head: head, body: body, notes: nt, roll: !Array.isArray(rule.apply) });   // backlog 173: a rule set Panel only, players never told, is not in its player's summary
        });
        if (Object.keys(all).length) { c.updated = Date.now(); if (n && n.active && n.role === 'host' && n.syncCharDelta) n.syncCharDelta(c.id, all); renderViews(c.id); changed++; }   // what was written is stored, sent and saved, said or not
        var tp = typeof window !== 'undefined' && window.wpTimePanel && typeof window.wpTimePanel.add === 'function' ? window.wpTimePanel : null, lead = (words ? words + ' \u2014 ' : '') + (c.name || 'A character') + ': ';
        if (parts.length && n && n.timeCard) { if (tp || pl.length !== parts.length) n.timeCard(c, lead + parts.join('; '), gm, { player: pl.length ? lead + pl.join('; ') : '', gmChat: !tp }); else n.timeCard(c, lead + parts.join('; '), gm); }   // the flood fix: no part left, no summary; backlog 173: the GM's chat gets the run's one line from the panel instead
        if (parts.length && tp) runChars.push({ c: c, gm: gm, lines: lines });
        if (Object.keys(all).length && typeof ruleFollow === 'function') ruleFollow(c, camp);   // the review of folds 4a and 6b: a bleed past minus HP owes its death check now, and an effect it brought on lays its token down
    });
    if (runChars.length && window.wpTimePanel) { try { window.wpTimePanel.add(camp, sys, words, runChars); } catch (e) { console.error(e); } }   // backlog 173: the run kept for the Time rules panel, and its one chat line
    if (changed) { save(true); if (window.appRender) window.appRender(); }
    return changed;
}
// [sinkcheck:timerules-end]
function roundHook(mapId, combat) { return timedHook(mapId, combat, 'round'); }
function turnHook(mapId, combat) { return timedHook(mapId, combat, 'turn'); }
function turnEndHook(mapId, combat) { return timedHook(mapId, combat, 'turnEnd'); }   // 1.6.0: combat holds the row whose turn just ended as its turn, in the round it ended
// [split:body-end]
return { roundHook: roundHook, runTimeRules: runTimeRules, timedHook: timedHook, turnEndHook: turnEndHook, turnHook: turnHook };   // [split:glue]
}   // [split:glue]
