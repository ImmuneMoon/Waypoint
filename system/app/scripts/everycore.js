/* everycore.js: a part of systemcore.js (docs/REFACTOR_SPLIT_PLAN.md, area 2, time rules; split 2026-11-18 with no change in behavior).
   What it holds: how a rule that runs by time is written down and cleaned. By the clock (cleanEvery, every n minutes, hours, days, weeks
   or n of the system's own time units) and In a fight (cleanInFight), each unit spelled as the system spells it (everyTargets); a list
   counter that counts by the game clock (cleanRowTimer); and Keeps paying, what a row switched on pays from a pool each turn, round or
   stretch of the clock (cleanUpkeep, upkeepEach, rowUpkeep, and its words, upkeepLines and upkeepWords). What runs a rule lives in
   timecore.js, and the clock that counts them in calendar.js and calendarcore.js.
   Why it looks this way: these lines stood in systemcore.js, and they still run exactly where they stood. systemcore.js calls
   everyCore() at its line `// [split:everycore.js]`, so the body below runs in the old order, after everything above that line and
   before everything below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test
   that reads systemcore.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the
   body uses of systemcore.js; the last line hands back the names systemcore.js uses of it. Neither side may assign the other's names
   (tools/splitcheck.js holds it). Change the code here as if it still stood in systemcore.js. */
// [split:of systemcore.js]
import { FIELD_ID, LIMITS, STAT_KEY, TIME_WORDS, applyAct, applyRound, applyScope, cleanFormulaText, cleanListSpec, cleanSystem, cleanTurn, costTargets, cutText, fieldById, fin, fmtNum, gmDerivedNames, gmEffectNames, gmOnlyNames, hasDice, isObj, lower, makeResolver, map, noDice, rollNeedsInto, rowDef, rowIdOf, rowOn, rowRollNames, rowTimers, statName } from './systemcore.js';   // [split:glue]
export function everyCore() {   // [split:glue]
// [split:body-start]
// Item 20 K5 (the owner's answers of 2026-09-30): a roll or an apply action that also runs by the campaign's clock — every n minutes, hours,
// days or weeks of the calendar, or n of the system's own time units by key (a watch), during rest only or any time. { n: 1 to 1000, u, rest? }
// Backlog 152: wait? (Waits in a fight, true only, after rest): its count waits while its character is in a fight and goes on after it (a fight
// still breaks a rest). The unit round is never By the clock's: a round is In a fight's alone
// 1.5.5: whileNeeds? (Only while its needs hold, true only, written last): its count adds only the time the rule's needs hold for its character
// (calendarcore ruleFires' need). Kept only where needs, the rule's own needs text as rollNeedsInto reads it, cleans to a formula: a rule with
// no needs has nothing to count by. The same in both views, but the players' view drops it with the needs where it drops them (cleanSystem)
var EVERY_UNITS = Object.freeze({ min: 1, hour: 1, day: 1, week: 1 });
// 1.6.4 (the full test's gap 7; Fulllion, 2026-11-24, by prompt: each way of counting real time a builder option, minutes of play the default):
// the kinds of real time a list's counter or a time rule may count by, in the order the builder offers them. name: the builder's word; says: the
// gray line under it, what it counts; per: the words after a step on a sheet ("one every hour of play"). The host judges when each counts
// (nettime realCounts), the one place that rule stands
var REAL_TIME = Object.freeze({
    play: Object.freeze({ name: 'Minutes of play', says: 'Counts while you host the table and have not paused it. A character whose player alone is paused waits.', per: 'of play' }),
    table: Object.freeze({ name: 'Real time at the table', says: 'Counts as minutes of play do, and only while the character\u2019s player is connected. A character with no player counts as in minutes of play.', per: 'of real time at the table' }),
    open: Object.freeze({ name: 'Real minutes', says: 'Counts while this campaign is open in your app, hosted or played alone, and not paused.', per: 'of real time' })
});
function realKind(k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(REAL_TIME, k) ? k : ''; }   // a kind's key, or '' for none
// 1.6.0 Counts by the game clock (the handoff's per-row timer, and the campaign build's count while a switch holds): a counter of an item list
// that moves with its character's own game time (calendar.js ownTime: every stretch lived once, a fight's rounds too; rowTimers). { dir: 'down'
// (the default) or 'up'; per: one step every n minutes, hours, days, weeks or n of the system's own time unit by key (cleanEvery's units, never a
// round); on: true, it counts only while its row is switched on; reset: true (with on), a row switched off goes back to its start; end: the word
// a row shows once a count down reaches 0 (Spoiled) }. Down stops at 0 and the row stays; up stops at 1e6. The same in both views: no secret.
// 1.6.4 (the full test's gap 7, a power used once an hour of play): real, one of REAL_TIME's kinds, it counts by real time instead of the game
// clock (the host's own clock, nettime realPlayTick), so its per is minutes or hours alone; one with another unit is no timer. Absent: the game clock
function cleanRowTimer(v) {
    if (!isObj(v)) return null;
    var p = isObj(v.per) ? v.per : null, n = p && typeof p.n === 'number' && fin(p.n) && Math.floor(p.n) === p.n && p.n >= 1 && p.n <= 1000 ? p.n : 0, u = p && typeof p.u === 'string' && (EVERY_UNITS[p.u] === 1 || STAT_KEY.test(p.u)) && lower(p.u) !== 'round' ? p.u : '';
    if (!n || !u) return null;
    var o = { dir: v.dir === 'up' ? 'up' : 'down', per: { n: n, u: u } };
    if (v.real !== undefined) { if (!realKind(v.real) || (u !== 'min' && u !== 'hour')) return null; o.real = v.real; }   // 1.6.4 (gap 7): by real time, of one kind
    if (v.on === true) { o.on = true; if (v.reset === true) o.reset = true; }
    var w = o.dir === 'down' ? cutText(v.end, LIMITS.label) : ''; if (w) o.end = w;
    return o;
}
// 1.6.0 (CORE gap 13, a power's "5, then 3 a turn"): a list's upkeep, what a row switched on keeps paying. { pool: a resource field's id, amt: a
// formula of the row (Row.* known; no dice; whole, at least 0), each: 'turn' (its character's turn start in a fight), 'round' (each new round of
// its fight) or 'clock' (every per of its character's own game time, as a timed counter's per), stop: true, a row whose pool holds less than it
// pays switches off and pays nothing, ct: a counter of the list each payment adds 1 to, so a list roll that runs when it crosses a step, such
// as a Focus roll that ends the power on a failure with a change that switches its row off, follows every payment }. Only on a list with a
// switch, in the GM's view alone (the GM's machine pays it, as a crossing's action
// runs); cleanSystem drops one whose pool is no pool of the view. Absent: as before. The core handbook session's ask 5 (2026-10-29): eachBy, a
// choice stat of the list (cleanListSpec spells it; a pick or a number with value names) whose value name on a row says when that row pays
// (upkeepEach); per is kept beside it too, for a row that says the clock
function cleanUpkeep(v, F) {
    if (!isObj(v) || typeof v.pool !== 'string' || !FIELD_ID.test(v.pool)) return null;
    var amt = cleanFormulaText(v.amt), p = amt && F && typeof F.parse === 'function' ? F.parse(amt) : null; if (!p || !p.ok || !p.ast || hasDice(p.ast.body)) return null;
    var each = v.each === 'round' || v.each === 'clock' || v.each === 'turnEnd' ? v.each : 'turn', o = { pool: v.pool, amt: amt, each: each };   // 1.6.2: or at its turn's end
    if (each === 'clock') { var tm = cleanRowTimer({ per: v.per }); if (!tm) return null; o.per = tm.per; }
    else if (typeof v.eachBy === 'string' && v.eachBy && v.per !== undefined) { var tmB = cleanRowTimer({ per: v.per }); if (tmB) o.per = tmB.per; }
    if (v.stop === true) o.stop = true;
    if (each !== 'clock') {   // 1.6.2 (bleeding, the owner: "Every N, and a clock out of a fight"): every Nth turn or round, 2 to 9; and a rate by the clock while no fight runs
        if (typeof v.every === 'number' && fin(v.every)) { var ev = Math.round(v.every); if (ev >= 2 && ev <= 9) o.every = ev; }
        if (isObj(v.out)) { var tmO = cleanRowTimer({ per: v.out.per }); if (tmO) o.out = { per: tmO.per }; }
    }
    return o;
}
// The core handbook session's ask 5 (2026-10-29): when one row pays, 'turn', 'round' or 'clock': its eachBy stat's value name where that says turn,
// round or clock as a word (Each turn, Per round, By the clock), else the upkeep's own each, as before; '' where the list has no upkeep
function upkeepEach(sys, spec, row) {
    var up = isObj(spec) && isObj(spec.upkeep) ? spec.upkeep : null; if (!up) return '';
    var dflt = up.each === 'round' || up.each === 'clock' || up.each === 'turnEnd' ? up.each : 'turn'; if (typeof up.eachBy !== 'string' || !up.eachBy) return dflt;
    var rd = rowDef(sys, row), w = rd ? lower(statName(spec, rd.def, up.eachBy)) : '', m = /\b(turn|round|clock)s?\b/.exec(w); return m ? m[1] : dflt;
}
// Every row switched on of a list whose upkeep is paid at each, on a working copy (work.values's lists are replaced, never changed in place):
// 'turn' and 'round' once (applyRound), 'clock' (rowTimers) once for each per its character lived, the part of a step lived kept on the row as
// ut (the GM's alone: an owner's copy never carries it). Its amount is worked out with the row's names, and taken through applyAct as a
// Subtract, so a pool's most and Spills into hold as for any change; stop: a row whose pool holds less switches off and pays nothing; a row whose
// amount cannot be worked out pays nothing. out.values gets each list and pool that changed; { paid, off: [names], moved: [field ids], said }.
// 205 follow-up (3): said, what each row's payments moved, a row once, for upkeepLines and upkeepWords: { name, gm, lines: [{ n, d, v? }], off? },
// lines the applyAct lines of its payments summed by what moved, off the pool's label where it switched off for lack of it; gm true where the
// row's owner may not see it (a GM-only list, pool or entry, a row kept from them or kept on out of their sight, a card applyScope keeps the GM's,
// an amount that reads a GM-only value, worked out from one or moved by a GM-only effect; an NPC's always), judged once a row, failing closed
function rowUpkeep(sys, work, out, each, F, secs, perOf) {
    var res = { paid: 0, off: [], moved: [], said: [] }; if (!isObj(sys) || !Array.isArray(sys.fields) || !F || !isObj(work) || !isObj(work.values) || !isObj(out) || !isObj(out.values)) return res;
    var put = function(fid, v, mv) { work.values[fid] = v; out.values[fid] = v; if (mv && res.moved.indexOf(fid) < 0) res.moved.push(fid); };
    sys.fields.forEach(function(f) {
        var spec = isObj(f) && f.kind === 'item-list' && isObj(f.list) ? f.list : null, up = spec && isObj(spec.on) && isObj(spec.upkeep) && (each === 'out' ? isObj(spec.upkeep.out) : (spec.upkeep.each === each || (typeof spec.upkeep.eachBy === 'string' && spec.upkeep.eachBy))) ? spec.upkeep : null;   // 1.6.2: 'out', its rate by the clock while no fight runs   // ask 5: or a list whose rows say when they pay
        var pf = up ? fieldById(sys, up.pool) : null; if (!pf || pf.kind !== 'resource' || !Array.isArray(work.values[f.id])) return;
        var byClk = each === 'clock' || each === 'out', step = byClk ? (typeof perOf === 'function' ? perOf(each === 'out' ? up.out.per : up.per) : 0) : 0; if (byClk && !(fin(step) && step > 0 && fin(secs) && secs > 0)) return;
        work.values[f.id].map(function(r) { return isObj(r) && r.hid !== 1 && rowOn(spec, r) && (each === 'out' || upkeepEach(sys, spec, r) === each) ? rowIdOf(r) : ''; }).filter(Boolean).forEach(function(rid) {
            var at = function() { var L = work.values[f.id]; for (var i = 0; i < L.length; i++) if (rowIdOf(L[i]) === rid) return i; return -1; }, n = 1, i0 = at(); if (i0 < 0) return;
            var said = null, sayOf = function(r, rv, upA0) {   // 205 follow-up (3): what this row's payments say, its audience judged once
                if (said) return said;
                var rdS = isObj(r) ? rowDef(sys, r) : null, gmS = f.vis === 'gm' || pf.vis === 'gm' || !isObj(r) || r.keptOn === 1 || !rdS || !isObj(rdS.def) || rdS.def.vis === 'gm';
                if (!gmS) { try {
                    if (applyScope(sys, work, { label: 'Upkeep', apply: upA0 }, false, F) === 'gm') gmS = true;
                    var nmS = typeof F.names === 'function' ? F.names(up.amt).map(function(x) { return { name: x }; }) : null, rrS = nmS ? rowRollNames(sys, work, f.id, rid, nmS, F) : null;
                    if (!rrS || rrS.gm || rrS.kept || gmOnlyNames(sys, rrS.names).length || gmDerivedNames(sys, F, rrS.names).length || gmEffectNames(rv, rrS.names).length) gmS = true;
                } catch (e) { gmS = true; } }
                said = { name: cutText(rdS && isObj(rdS.def) ? rdS.def.name : '', LIMITS.label) || 'A row', gm: gmS, lines: [] }; res.said.push(said); return said;
            };
            if (!byClk && typeof up.every === 'number' && up.every > 1) {   // 1.6.2: every Nth time, counted on the row as un (the GM's alone), from the first after it came on
                var rN = work.values[f.id][i0], cN = (typeof rN.un === 'number' && fin(rN.un) ? rN.un : 0) + 1, nN = Object.assign({}, rN), LN = work.values[f.id].slice(); if (cN >= up.every) delete nN.un; else nN.un = cN; LN[i0] = nN; put(f.id, LN, false); if (cN < up.every) return;
            }
            if (byClk) {
                var r0 = work.values[f.id][i0], lived = (typeof r0.ut === 'number' && fin(r0.ut) && r0.ut > 0 ? r0.ut : 0) + secs; n = Math.floor(lived / step + 1e-9);
                var left = lived - n * step, nr = Object.assign({}, r0), L0 = work.values[f.id].slice(); if (left > 1e-6) nr.ut = Math.min(1e9, left); else delete nr.ut; L0[i0] = nr; put(f.id, L0, false);
                n = Math.min(n, 500);
            }
            for (var k = 0; k < n; k++) {
                var vv = makeResolver(sys, work, F), rv = vv.row(f.id, rid); if (typeof rv !== 'function') return;
                var ar = null; try { ar = F.evaluate(up.amt, { vars: rv, random: noDice }); } catch (e) { ar = null; }
                var amt = ar && ar.ok ? (typeof ar.value === 'boolean' ? (ar.value ? 1 : 0) : ar.value) : NaN; if (typeof amt !== 'number' || !fin(amt)) return;
                amt = Math.max(0, Math.min(1e9, Math.round(amt))); if (!amt) continue;
                var have = vv(pf.key);
                var upA = [{ f: pf.id, formula: String(amt) }]; if (typeof up.ct === 'string') upA.push({ c: up.ct, formula: '1', add: true });   // 1.6.0: a payment counted on its row
                if (up.stop === true && typeof have === 'number' && fin(have) && have < amt) {
                    var ix = at(); if (ix < 0) return; var L1 = work.values[f.id].slice(), off = Object.assign({}, L1[ix], { on: false }); delete off.ut; delete off.un; L1[ix] = off; put(f.id, L1, true);
                    var rd = rowDef(sys, off); res.off.push(cutText(rd && isObj(rd.def) ? rd.def.name : '', LIMITS.label) || 'A row');
                    sayOf(off, rv, upA).off = cutText(pf.label || pf.key, LIMITS.label) || 'its pool'; return;   // 205 follow-up (3): switched off for lack of its pool, said
                }
                var done = applyAct(sys, work, { label: 'Upkeep', apply: upA }, rv, F, null, { f: f.id, r: rid }, true);
                if (!done || !done.ok) return;
                Object.keys(done.values).forEach(function(fid) { put(fid, done.values[fid], true); });
                res.paid += amt;
                var sP = sayOf(work.values[f.id][at()], rv, upA);   // 205 follow-up (3): what this payment moved, summed by what moved
                (Array.isArray(done.lines) ? done.lines : []).forEach(function(l) {
                    if (!isObj(l) || typeof l.n !== 'string' || typeof l.d !== 'number' || !fin(l.d)) return;
                    var hitL = null; sP.lines.forEach(function(x) { if (!hitL && x.n === l.n) hitL = x; });
                    if (!hitL) { hitL = { n: l.n, d: 0 }; sP.lines.push(hitL); } hitL.d += l.d; if (typeof l.v === 'number' && fin(l.v)) hitL.v = l.v;
                });
            }
        });
    });
    return res;
}
// 205 follow-up (3): an upkeep's payments said (rowUpkeep's said). upkeepLines: the lines of an apply card, "<row>: <what moved>" { n, d, v? } and a
// row switched off for lack of its pool { n, fx: 0 }; part true, only what the row's owner may see (a row whose gm is false), with no figure after
// a line where a row out of their sight paid too, so the figure they read never tells of it; false, only the GM's; absent, all. upkeepWords:
// the same as one sentence for a summary, '' with nothing to say
function upkeepLines(said, part) {
    var out = [], hidV = part === true && (Array.isArray(said) ? said : []).some(function(s) { return !isObj(s) || s.gm !== false; });
    (Array.isArray(said) ? said : []).forEach(function(s) {
        if (!isObj(s) || typeof s.name !== 'string' || (part === true && s.gm !== false) || (part === false && s.gm === false)) return;
        (Array.isArray(s.lines) ? s.lines : []).forEach(function(l) { if (!isObj(l) || typeof l.n !== 'string' || typeof l.d !== 'number' || !fin(l.d)) return; var o = { n: (s.name + ': ' + l.n).slice(0, 60), d: l.d }; if (!hidV && typeof l.v === 'number' && fin(l.v)) o.v = l.v; out.push(o); });
        if (typeof s.off === 'string' && s.off) out.push({ n: (s.name + ' (not enough ' + s.off + ')').slice(0, 60), fx: 0 });
    });
    return out;
}
function upkeepWords(said, part, who) {
    var ls = upkeepLines(said, part); if (!ls.length) return '';
    return 'Upkeep on ' + (typeof who === 'string' && who ? who.slice(0, 60) : 'a character') + ': ' + ls.map(function(l) { return l.fx === 0 ? l.n + ' switched off' : l.n + ' ' + (l.d < 0 ? '−' : '+') + fmtNum(Math.abs(l.d)) + (typeof l.v === 'number' ? ' → ' + fmtNum(l.v) : ''); }).join('; ') + '.';
}
function cleanEvery(v, needs) {
    if (!isObj(v)) return null;
    var n = typeof v.n === 'number' && fin(v.n) && Math.floor(v.n) === v.n && v.n >= 1 && v.n <= 1000 ? v.n : 0, u = typeof v.u === 'string' && (EVERY_UNITS[v.u] === 1 || STAT_KEY.test(v.u)) && lower(v.u) !== 'round' ? v.u : '';
    if (!n || !u) return null;
    if (v.real !== undefined) { if (!realKind(v.real) || (u !== 'min' && u !== 'hour')) return null; return { n: n, u: u, real: v.real }; }   // 1.6.4 (gap 7): by real time, in minutes or hours, which knows no rest, no fight and no needs held (calendar.js realRules runs it)
    var o = { n: n, u: u }; if (v.rest === true) o.rest = true; if (v.wait === true) o.wait = true; if (v.whileNeeds === true && !!cleanFormulaText(needs)) o.whileNeeds = true; return o;
}
// Backlog 152 (the fight clock, docs/FIGHT_CLOCK_DESIGN.md 2 and 13): a roll or an apply action that also runs in a fight, In a fight — every n
// rounds (the round's length, the Combat tab's Turns box), minutes or hours, or n of the system's own time units by key, with fresh (Each fight
// starts again, true only) its count begun anew with each fight. { n: 1 to 1000, u, fresh? }. A time word other than those three is no unit
// of the system's (cleanTurn refuses them), so it is no unit here either. 1.5.5: whileNeeds? as By the clock's (cleanEvery), written last
var FIGHT_UNITS = Object.freeze({ round: 1, min: 1, hour: 1 });
function cleanInFight(v, needs) {
    if (!isObj(v)) return null;
    var n = typeof v.n === 'number' && fin(v.n) && Math.floor(v.n) === v.n && v.n >= 1 && v.n <= 1000 ? v.n : 0, u = typeof v.u === 'string' && (FIGHT_UNITS[v.u] === 1 || (STAT_KEY.test(v.u) && TIME_WORDS[lower(v.u)] !== 1)) ? v.u : '';
    if (!n || !u) return null;
    var o = { n: n, u: u }; if (v.fresh === true) o.fresh = true; if (v.whileNeeds === true && !!cleanFormulaText(needs)) o.whileNeeds = true; return o;
}
// the unit of each roll's every against the system's own time units (as costTargets does an action): a unit of the calendar stays, a unit key
// takes the unit's own spelling; one the system no longer has stays in the GM's view (the editor asks for one) and goes from the players'.
// Backlog 152: In a fight's unit the same way (a round, minutes and hours as they are)
function everyTargets(out, gmView) {
    var us = map(); (out.combat && out.combat.turn && Array.isArray(out.combat.turn.units) ? out.combat.turn.units : []).forEach(function(u) { us[lower(u.key)] = u.key; });
    out.rolls.forEach(function(r) {
        if (!isObj(r)) return;
        if (r.every && EVERY_UNITS[r.every.u] !== 1) { var k = us[lower(r.every.u)]; if (k) r.every.u = k; else if (!gmView) delete r.every; }
        if (r.inFight && FIGHT_UNITS[r.inFight.u] !== 1) { var kf = us[lower(r.inFight.u)]; if (kf) r.inFight.u = kf; else if (!gmView) delete r.inFight; }
    });
}
// [split:body-end]
return { REAL_TIME: REAL_TIME, realKind: realKind, EVERY_UNITS: EVERY_UNITS, FIGHT_UNITS: FIGHT_UNITS, cleanEvery: cleanEvery, cleanInFight: cleanInFight, cleanRowTimer: cleanRowTimer, cleanUpkeep: cleanUpkeep, everyTargets: everyTargets, rowUpkeep: rowUpkeep, upkeepEach: upkeepEach, upkeepLines: upkeepLines, upkeepWords: upkeepWords };   // [split:glue]
}   // [split:glue]
