/* timecore.js: a part of systemcore.js (docs/REFACTOR_SPLIT_PLAN.md, area 2, time rules; split 2026-11-18 with no change in behavior).
   What it holds: what runs a rule by time on one character. The actions a fight runs at each round or at a turn's start or end
   (applyRound, with turnCounters, the counters that start again each turn); a time rule's runs (timeRuleRun, in the round they come
   due through ruleRunCtx, each as the character stood where it came due through dueFx and heldFx); whether a rule's needs hold over a
   stretch of time (needsHeld); and whether a system's chains are shallow enough to share one resolver across a run (chainsShallow,
   chainsWalk). How a rule is written and cleaned lives in everycore.js; the sheet that runs the rules for the table in sheets.js.
   Why it looks this way: these lines stood in systemcore.js, and they still run exactly where they stood. systemcore.js calls
   timeCore() at its line `// [split:timecore.js]`, so the body below runs in the old order, after everything above that line and
   before everything below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test
   that reads systemcore.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the
   body uses of systemcore.js; the last line hands back the names systemcore.js uses of it. Neither side may assign the other's names
   (tools/splitcheck.js holds it). Change the code here as if it still stood in systemcore.js. */
// [split:of systemcore.js]
import { DEF_PROP, LIMITS, NAME_SUFFIX, applyAct, askFill, atSrc, autoKindOf, bandOf, bigOf, chamberSrc, critRange, feedSpec, fieldById, figureField, fin, fxLeftNow, fxTick, hasOwn, isObj, keyIndex, linkByKey, linkOverSwap, loadSrc, locSideRead, lower, makeResolver, map, onOther, partsFromHas, partsSrcs, resolveAll, rollNeedsOk, roundActs, rowUpkeep, subjectPlace, tableFam, tableRead, thenChanges, thenCrit, thenMargin, withOnSelf, withRollCrit, withRound } from './systemcore.js';   // [split:glue]
export function timeCore() {   // [split:glue]
// [split:body-start]
// every Each round action on one character, in the System's order, each worked out on the values the one before left (varsFor(work): the
// resolver of that working copy; a Set to reads the round just begun through tctx: Turn := CombatRound). One that cannot run (nothing to move,
// an amount that fails) is passed over, as his sweep carries on. { values: { fieldId: value }, ran: n }
function applyRound(sys, char, varsFor, F, tctx, kind, D, fxo) {   // fxo (1.6.0): the clock an effect a run switches on starts its timer by   // kind (T2b): 'round' (the default) or 'turn' (1.6.0: or 'turnEnd'); D (1.5.9): the host's dice, for a Rolled amount
    var out = { values: {}, ran: 0 }; if (!sys || !isObj(char) || typeof varsFor !== 'function' || !F) return out;
    var work = Object.assign({}, char, { values: Object.assign({}, isObj(char.values) ? char.values : {}) }), lvR = map();
    if (kind === 'turn') turnCounters(sys, work, out);   // 1.6.0: counters that start again each turn, before the turn's own actions run
    if (kind === 'turn' || kind === 'round' || kind === 'turnEnd') { var upT = rowUpkeep(sys, work, out, kind, F); if (upT.paid || upT.off.length) { out.upkeep = { paid: upT.paid, off: upT.off }; if (upT.said.length) out.upkeepSaid = upT.said; } }   // 1.6.0 (CORE gap 13): then what rows switched on keep paying
    roundActs(sys, kind).forEach(function(act) {
        var vv = varsFor(work); if (typeof vv !== 'function') return;
        if (onOther(act)) vv = withOnSelf(vv, true);   // 1.6.0 (the review of 96e39ae6): a run by itself is on its own character, so OnSelf reads 1
        var loR = linkOverSwap(lvR), res; try { res = applyAct(sys, work, act, vv, F, tctx || null, null, undefined, D, null, fxo); } finally { linkOverSwap(loR); } if (!res.ok) return;
        Object.keys(res.values).forEach(function(k) { work.values[k] = res.values[k]; out.values[k] = res.values[k]; }); out.ran++;
        if (res.linkValues) Object.keys(res.linkValues).forEach(function(id) { lvR[id] = Object.assign(lvR[id] || {}, res.linkValues[id]); });   // 1.6.2: what it moved on a linked sheet, which the next action reads
    });
    if (Object.keys(lvR).length) out.linkValues = lvR;   // 1.6.2: by the linked sheet's id, which the caller writes
    return out;
}
// 1.6.0 (the v2 combat module): a list counter ticked Starts again each turn (turn) goes back to where a row starts (its def, else 0) at its
// character's turn start in a fight: its stored count is taken off, as a new row has none. A row already there is left as it is.
// 1.6.0 (the core's gap 14, heavy swings): one that names Passes its count to (pass, another counter of its list) first hands the count it
// had, its start where none is stored, to that counter, so what was done last turn lasts one turn more. Every pass reads the counts as the
// turn found them, before any is reset; a count equal to the other counter's own start is stored as none, as a new row's
function turnCounters(sys, work, out) {
    (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        var spec = isObj(f) && f.kind === 'item-list' && isObj(f.list) ? f.list : null, ts = spec && Array.isArray(spec.counters) ? spec.counters.filter(function(t) { return isObj(t) && t.turn === true && typeof t.key === 'string'; }) : [];
        var src = ts.length && Array.isArray(work.values[f.id]) ? work.values[f.id] : null; if (!src) return;
        var defOf = function(t) { return typeof t.def === 'number' ? t.def : 0; }, byKey = map(); spec.counters.forEach(function(t) { if (isObj(t) && typeof t.key === 'string') byKey[lower(t.key)] = t; });
        var ps = ts.filter(function(t) { return typeof t.pass === 'string' && isObj(byKey[lower(t.pass)]) && byKey[lower(t.pass)] !== t; });
        var changed = false, list = src.map(function(r) {
            if (!isObj(r) || (!isObj(r.ct) && !ps.length)) return r;
            var ct0 = isObj(r.ct) ? r.ct : {}, ct = Object.assign({}, ct0), did = false;
            var got = ps.map(function(t) { var v = typeof ct0[t.key] === 'number' ? ct0[t.key] : defOf(t); return [byKey[lower(t.pass)], v]; });
            ts.forEach(function(t) { if (typeof ct[t.key] === 'number' && ct[t.key] !== defOf(t)) { delete ct[t.key]; did = true; } });
            got.forEach(function(g) { var k = g[0].key, v = g[1]; if (v === defOf(g[0])) { if (typeof ct[k] === 'number' && ct[k] !== v) { delete ct[k]; did = true; } } else if (ct[k] !== v) { ct[k] = v; did = true; } });
            if (!did) return r; changed = true; var nr = Object.assign({}, r); if (Object.keys(ct).length) nr.ct = ct; else delete nr.ct; return nr;
        });
        if (changed) { work.values[f.id] = list; out.values[f.id] = list; }
    });
}
// Stage 6 HUD H7 (owner, 2026-09-26): who sees an apply action's card — 'table' when every field it moves is shown to teammates on hover (the
// card tells them nothing new), else 'owner' (the character's player and the GM); 'gm' for an NPC, a GM-only action or field, and when the
// caller says the amount read a GM-only value (gm) — the GM only (and the player who pressed it on a GM-only row: the caller's)
// Item 20 K5: a time rule run n times on one character (at most 500), with the GM's full view and no token — an apply action's changes each
// time, or a roll made each time (D: the dice core; its malfunction and its verdict by the system's check rule choose its consequences) — each
// worked out on what the one before left. { values: { fieldId: value } (what changed), lines: [{ f, n, d, v }] (each field once: how far it
// really moved, a full pool's clamp counted, and where it ended), rolls: { made, pass, fail }, ran } ; a run that fails is passed over.
// Backlog 152: at = { round } runs it in a fight, so CombatRound reads that round (whole, within 0 to 9999, as withRound keeps it); the context is
// built here (ruleRunCtx), since withRound answers nothing with no token's context. Without it, CombatRound reads 0, as before. 1.5.5 (found
// live: one press of +1 hour on a campaign of 158 characters held the GM's screen for four seconds, nearly all of it here, working out every
// field of the sheet for every run): opt.vars, a resolver of char as it stands in this run's context, is the first run's, and each later run
// works out only the names it reads, with one resolver of its own state (ropts.reuse). A caller hands it in only for a system chainsShallow passes, where
// any resolver of one state answers every name alike, so nothing a run gives changes. Without it, as before. 1.5.5's review (a draw counted while a
// nap held its needs and lost, since the nap ran out before the run was made): opt.due, [{ n, fx }] in run order, makes each run of a fire of a rule
// ticked Only while its needs hold with the timed effects its character had where that run came due (fx: { effects field id: list }; dueFx), its
// needs judged and its changes worked out so; a part with no fx, or a run past what due names, is made as the character stands. With due, opt.flat
// (chainsShallow passes) works out only the names each run reads. What a run writes is never an effects list, so nothing of fx is ever stored
// 1.5.9 (book es/et plan, section 0): D also rolls a change ticked Rolled, and out.drew, where it is there, counts the runs whose Rolled amount drew dice
function ruleRunCtx(at) { return isObj(at) && fin(at.round) ? { combat: { round: Math.max(0, Math.min(9999, Math.floor(at.round))) } } : null; }
function timeRuleRun(sys, char, rule, n, F, D, at, opt) {
    var out = { values: {}, lines: [], rolls: { made: 0, pass: 0, fail: 0 }, ran: 0 }; if (!isObj(sys) || !isObj(char) || !isObj(rule) || !F) return out;
    var tctx = ruleRunCtx(at), own = isObj(opt) && typeof opt.vars === 'function', due = isObj(opt) && Array.isArray(opt.due) && opt.due.length ? opt.due : null, lazy = own || (!!due && opt.flat === true);
    var work = Object.assign({}, char, { values: JSON.parse(JSON.stringify(isObj(char.values) ? char.values : {})) }), tot = map(), init = map(), order = [], lvT = map(), count = Math.max(0, Math.min(500, Math.floor(Number(n) || 0)));
    var chk = isObj(sys.combat) && sys.combat.checks === 'under3d6' ? 'under3d6' : '', efx = due && Array.isArray(sys.fields) ? sys.fields.filter(function(f) { return isObj(f) && f.kind === 'effects' && typeof f.id === 'string'; }).map(function(f) { return f.id; }) : null;
    for (var i = 0; i < count; i++) {
        var fx = due ? dueFx(due, efx, i) : null, wk = fx ? Object.assign({}, work, { values: Object.assign({}, work.values, fx) }) : work;   // 1.5.5's review: as its character stood where it came due
        var vars = lazy ? (i === 0 && own && !fx ? opt.vars : makeResolver(sys, wk, F, tctx ? { combat: tctx.combat, reuse: true } : { reuse: true })) : resolveAll(sys, wk, F, tctx).vars, act = null;
        if (onOther(rule)) vars = withOnSelf(vars, true);   // 1.6.0 (the review of 96e39ae6): a run by the clock is on its own character, so OnSelf reads 1
        vars = askFill(sys, rule, vars, F);   // 1.6.2: nobody to ask
        if (!rollNeedsOk(rule, vars, F)) { out.held = true; break; }   // 1.5.4: its needs not met, it is passed over (the next run would read the same)
        if (Array.isArray(rule.apply)) act = rule;
        else if (typeof rule.formula === 'string' && rule.formula) {
            var res = F.evaluate(rule.formula, { vars: vars }); if (!res.ok) break;
            out.rolls.made++;
            var mf = null; if (rule.malf) { var mq = F.evaluate(rule.malf, { vars: vars }); if (mq.ok && typeof mq.value === 'number' && fin(mq.value)) mf = Math.max(1, Math.min(1000000, Math.round(mq.value))); }
            var crg = critRange(sys, rule, vars, F), mfHit = mf !== null && D && D.naturalOf ? D.naturalOf(res) >= mf : false, vd = D && D.verdictOf ? D.verdictOf(res, crg ? { at: crg[0], fumble: crg[1], high: crg[2] === 1 } : chk) : null, pass = mfHit ? false : (vd && vd.kind === 'check' ? vd.pass : null);   // 1.6.0: criticals at fixed rolls, by its own range
            if (pass === true) out.rolls.pass++; else if (pass === false) out.rolls.fail++;
            var bg0 = bigOf(rule, vars, F, D, res, vd, mfHit), cr = thenCrit(vd, mfHit), th = thenChanges(rule, pass, mfHit, cr, bandOf(sys, rule, vars, F, res, vd, mfHit, bg0)); if (!th.length) continue; act = { apply: th }; vars = withRollCrit(vars, cr, thenMargin(vd, mfHit), bg0, res);   // 1.5.8: its critical, and RollCrit and RollMargin in its amounts (1.6.0: and RollBig)
        }
        if (!act) break;
        act.apply.forEach(function(c) { if (isObj(c) && typeof c.f === 'string' && init[c.f] === undefined) { var fd = fieldById(sys, c.f), iv = fd ? vars(fd.key) : null; init[c.f] = typeof iv === 'number' && fin(iv) ? iv : 0; } });   // where each field began, for how far it really moved
        var loT = linkOverSwap(lvT), r; try { r = applyAct(sys, wk, act, vars, F, tctx, null, lazy, D); } finally { linkOverSwap(loT); } if (!r.ok) continue;   // 1.5.9: D rolls a Rolled amount   // 1.6.2: on what it already moved on a linked sheet
        if (r.linkValues) Object.keys(r.linkValues).forEach(function(id) { lvT[id] = Object.assign(lvT[id] || {}, r.linkValues[id]); });
        if (r.drew) out.drew = (out.drew || 0) + 1;   // and a run that drew dice says so (the flood rule counts it as rolled)
        Object.keys(r.values).forEach(function(k) { work.values[k] = r.values[k]; out.values[k] = r.values[k]; });
        r.lines.forEach(function(l) { if (l.lk) { var kL = 'lk:' + l.n; if (!tot[kL]) { tot[kL] = { n: l.n, d: 0, v: l.v, lk: 1 }; order.push(kL); } tot[kL].d = Math.round((tot[kL].d + (typeof l.d === 'number' ? l.d : 0)) * 1000) / 1000; tot[kL].v = l.v; return; } if (l.all) { var ka = 'all:' + l.f + ':' + l.k; if (!tot[ka]) { tot[ka] = { f: l.f, n: l.n, d: 0, v: l.v, all: 0, k: l.k }; order.push(ka); } var ta = tot[ka]; ta.n = l.n; ta.v = l.v; ta.all = Math.max(ta.all, l.all); if (l.set) { ta.set = true; ta.d = l.d; if (l.vary) ta.vary = true; else delete ta.vary; } else { ta.d = Math.round((ta.d + l.d) * 1000) / 1000; if (l.vary) ta.vary = true; } return; } if (!tot[l.f]) { tot[l.f] = { f: l.f, n: l.n, v: l.v }; order.push(l.f); } tot[l.f].v = l.v; });   // 1.6.0: every row of a list, by its list and stat
        out.ran++;
    }
    if (Object.keys(lvT).length) out.linkValues = lvT;   // 1.6.2: by the linked sheet's id, which the caller writes
    out.lines = order.map(function(k) { if (tot[k].all || tot[k].lk) return Object.assign({}, tot[k]); var v = tot[k].v; return { f: k, n: tot[k].n, d: typeof v === 'number' && fin(v) ? Math.round((v - (init[k] || 0)) * 1000) / 1000 : 0, v: v }; });
    return out;
}
// the effects lists run i of a fire is made with (timeRuleRun's opt.due): the part of due that holds it, each part n runs in order; only a list of an
// effects field of the system (efx) is taken from its fx, so nothing else of the character is ever laid over. null: none named, or past what due names
function dueFx(due, efx, i) {
    var c = 0;
    for (var k = 0; k < due.length; k++) {
        var d = due[k]; if (!isObj(d) || typeof d.n !== 'number' || !fin(d.n) || !(d.n >= 1)) continue;
        c += Math.floor(d.n); if (i >= c) continue;
        if (!isObj(d.fx) || !Array.isArray(efx)) return null;
        var o = null; efx.forEach(function(id) { if (hasOwn(d.fx, id) && Array.isArray(d.fx[id])) (o = o || {})[id] = d.fx[id]; });
        return o;
    }
    return null;
}
// 1.5.5 (the owner, 2026-10-23, of a robot's draw taken only where it slept at the moment each day began: "everything needs to be accounted for, no
// shortcuts"): a time rule ticked Only while its needs hold counts only the time its needs hold (calendarcore ruleFires' need). needsHeld says how
// much of a stretch they held for one character: secs, the stretch of its own time; asks [{ key, rule, fight }], each count to judge (key: the count's
// own, the rule's id or x_ and its tail; fight true: the In a fight count, judged in the fight's round o.round, as its runs read CombatRound; else By
// the clock's, with no round, as its runs are). The needs are read as the run reads them (rollNeedsOk: a formula that cannot be worked out does not
// hold), with the character as it stands as the stretch is counted, and, with o.split true (a stretch outside a fight, where its timed effects run by
// the game clock: net.js fxSpans), again at each moment within it that one of its timed effects runs out (fxTick on a copy, at o.now), each piece
// counting whole or not at all. Each state is read through a lazy resolver (makeResolver: only the names the needs read are worked out); o.flat
// (chainsShallow passes) shares its first pass, as runTimeRules does, and without it a needs formula that a lazy resolver cannot work out is read
// again through resolveAll's, as timeRuleRun's own run reads it there, so the two never disagree and the whole sheet is worked out only then. 1.5.5's
// review (an hour of 160 characters judged in eight seconds where the needs named a name the sheet does not have): that second reading is asked only
// for the formula engine's refusal of a chain past its depth (heldDeep), the one failure resolveAll's may not share; any other failure is the run's
// too. o.keep, a list, is given each piece judged, in order: { t: where it begins, len, ok: { key: whether it held }, fx: the character's effects lists
// there (heldFx) }, so that a run is made where it came due (calendar.js dueOn, timeRuleRun's opt.due).
// { key: seconds held, 0 to secs, to the millisecond }; with nothing to judge by, 0 for each. The character is never changed
var HELD_KEY = /^[a-z]_[A-Za-z0-9_]{1,24}$/, HELD_CUTS = 200;
function heldDeep(v) { return isObj(v) && isObj(v.error) && typeof v.error.message === 'string' && v.error.message.indexOf('too deeply') >= 0; }   // the engine's own words for a chain past its depth
function heldFx(sys, ch) { var o = {}; sys.fields.forEach(function(f) { if (isObj(f) && f.kind === 'effects' && typeof f.id === 'string') o[f.id] = isObj(ch.values) && hasOwn(ch.values, f.id) && Array.isArray(ch.values[f.id]) ? ch.values[f.id] : []; }); return o; }
function needsHeld(sys, char, asks, F, secs, o) {
    var acc = map(), out = {}, list = (Array.isArray(asks) ? asks : []).filter(function(a) { return isObj(a) && typeof a.key === 'string' && HELD_KEY.test(a.key) && isObj(a.rule); });
    list.forEach(function(a) { acc[a.key] = 0; });
    var S = typeof secs === 'number' && fin(secs) && secs > 0 ? secs : 0; o = isObj(o) ? o : {};
    var keep = Array.isArray(o.keep) ? o.keep : null;
    if (list.length && S && isObj(sys) && isObj(char) && F) {
        var now = typeof o.now === 'number' && fin(o.now) ? o.now : 0, cuts = [];
        if (o.split === true && Array.isArray(sys.fields) && isObj(char.values)) sys.fields.forEach(function(f) {   // the moments a timed effect runs out within the stretch (fxTick's own reading)
            var src = isObj(f) && f.kind === 'effects' && hasOwn(char.values, f.id) ? char.values[f.id] : null; if (!Array.isArray(src)) return;
            src.forEach(function(r) { if (!isObj(r) || !isObj(r.t) || r.t.p === 1) return; var l = fxLeftNow(r.t, now); if (typeof l === 'number' && isFinite(l) && l > 0 && l < S && cuts.indexOf(l) < 0) cuts.push(l); });
        });
        cuts.sort(function(a, b) { return a - b; }); if (cuts.length > HELD_CUTS) cuts = cuts.slice(0, HELD_CUTS);
        var at = [0].concat(cuts), rd = ruleRunCtx({ round: o.round });
        var fl = o.flat === true, mk = function(ch, tc) { return makeResolver(sys, ch, F, tc ? (fl ? { combat: tc.combat, reuse: true } : { combat: tc.combat }) : (fl ? { reuse: true } : undefined)); };
        at.forEach(function(t0, i) {
            var len = (i + 1 < at.length ? at[i + 1] : S) - t0; if (!(len > 0)) return;
            var ch = char; if (t0 > 0) { var tk = fxTick(sys, char, 'game', now, t0), vs = Object.assign({}, char.values); Object.keys(tk.values).forEach(function(k) { vs[k] = tk.values[k]; }); ch = Object.assign({}, char, { values: vs }); }   // as the character stands once the effects due by then have run out
            var v0 = null, v1 = null, w0 = null, w1 = null, okP = {};
            list.forEach(function(a) {
                var ok = false, more = fl ? undefined : function(v) { return !heldDeep(v) ? null : a.fight === true ? (w1 = w1 || resolveAll(sys, ch, F, rd).vars) : (w0 = w0 || resolveAll(sys, ch, F, null).vars); };
                try { var vars = a.fight === true ? (v1 = v1 || mk(ch, rd)) : (v0 = v0 || mk(ch, null)); ok = rollNeedsOk(a.rule, vars, F, more); } catch (e) { ok = false; }
                if (ok) acc[a.key] += len;
                okP[a.key] = ok;
            });
            if (keep && Array.isArray(sys.fields)) keep.push({ t: t0, len: len, ok: okP, fx: heldFx(sys, ch) });
        });
    }
    list.forEach(function(a) { out[a.key] = Math.max(0, Math.min(S, Math.round(acc[a.key] * 1000) / 1000)); });
    return out;
}
// 1.5.5: whether no name of the system can be worked out through a loop or deeper than the formula engine allows (its LIMITS.maxDepth). The
// resolver keeps on its chain each definition it is working out (a formula, a skill's base, a pool's most, a list's total, highest or
// lowest, a column of one row, a choice's option), and the engine refuses a chain past that depth: so where a chain could pass it, a
// resolver whose cache already holds part of the chain (resolveAll's, which works out every field in order) may answer a name that a fresh
// one cannot. Where none can, every resolver of one state answers every name alike, and a caller may share one or work out only what it
// reads. Read from the definitions alone, each name its text reads followed to the node the resolver itself would work it out under (by
// key, a list's names, a reserved suffix, a column's Row.*), so it holds every chain the resolver can build and more. A loop, a chain past
// the depth or no engine: false. The review of 1.5.5: no path is walked past that depth, since a path that long already answers, so a long
// chain never runs the stack out and is never read cut short; and anything it cannot read (an engine that throws) is no proof: false too
function chainsShallow(sys, F) {
    if (!isObj(sys) || !Array.isArray(sys.fields) || !F || typeof F.names !== 'function') return false;
    if (sys.fields.some(function(f) { return isObj(f) && f.kind === 'item-list' && isObj(f.list) && isObj(f.list.stand); })) return false;   // 1.6.2 (body fold 2): what stands where is worked out by a resolver of its own, which no walk of names can read
    try { return chainsWalk(sys, F); } catch (e) { return false; }
}
function chainsWalk(sys, F) {
    var lim = isObj(F.LIMITS) && typeof F.LIMITS.maxDepth === 'number' ? F.LIMITS.maxDepth : 64, ix = keyIndex(sys), lists = map(), info = map(), memo = map(), on = map(), lkC = linkByKey(sys), tbW = tableFam(sys, ix);
    var node = function(id, texts, L, names, more) { if (!info[id]) info[id] = { texts: texts, L: L, names: names, more: more }; return id; };
    var listOf = function(f) {   // listCtx's own reading of a list's stats, columns and counters
        var lk = lower(f.key); if (lists[lk]) return lists[lk];
        var spec = isObj(f.list) ? f.list : null, st = map(), cl = map(), ct = map();
        (spec && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') st[lower(x.key)] = x; });
        (spec && Array.isArray(spec.cols) ? spec.cols : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') cl[lower(x.key)] = x; });
        (spec && Array.isArray(spec.counters) ? spec.counters : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') ct[lower(x.key)] = x; });
        var chs = spec && isObj(spec.chamber) ? chamberSrc(sys, spec) : null;   // 1.5.9: the list its chambered rounds come from (Row.round.*, Row.fired.*)
        var pts = spec && isObj(spec.parts) ? partsSrcs(sys, spec) : null; if (pts && !pts.length) pts = null;   // 1.6.0 R14: the lists its parts come from (Row.parts.*; 1.6.2: more than one)
        var ats = spec && isObj(spec.at) ? atSrc(sys, spec) : null;   // 1.6.0 Stands at: the list the row its stat names is in (Row.<by>.*)
        var fds = map(); (spec && Array.isArray(spec.feeds) ? spec.feeds : []).forEach(function(fd) { var s = isObj(fd) ? loadSrc(sys, feedSpec(spec, fd)) : null; if (s) fds[lower(fd.key)] = s; });   // 1.6.0 Feeds: the list each feed loads from (Row.Feed.<key>.*)
        return (lists[lk] = { sp: spec && isObj(spec.specs) ? spec.specs : null, k: lk, fid: f.id, st: st, cl: cl, ct: ct, chs: chs, fds: fds, pts: pts, ats: ats && ats.id !== f.id ? ats : null, atb: ats ? lower(spec.at.by) : '', hg: !!(spec && spec.hang === true) });
    };
    var defNode = function(f, sfx) {   // a field's name: its definition worked out (a formula, a skill's base, a pool's most), '' for one read as stored
        if (autoKindOf(f) && typeof f.auto === 'string' && f.auto) { var aTn = [f.auto].concat(f.kind === 'number' && isObj(f.override) ? [f.override.when, f.override.value] : []).filter(function(x) { return typeof x === 'string' && x; }); return sfx && sfx !== 'base' && sfx !== 'figure' ? '' : node('f|' + lower(f.key), aTn, null, [], []); }   // 1.6.2 (auto apply): worked out until typed
        if (f.kind === 'number' && isObj(f.override)) return sfx && sfx !== 'base' ? '' : node('f|' + lower(f.key), [f.override.when, f.override.value].filter(function(x) { return typeof x === 'string' && x; }), null, [], []);   // 205 (6): a number's override (its .base too)
        var t = DEF_PROP[f.kind] ? f[DEF_PROP[f.kind]] : null; if (typeof t !== 'string' || !t) return '';   // none, GM only or missing: answered with nothing on the chain
        if (f.kind === 'formula' ? sfx : f.kind === 'skill' ? sfx && sfx !== 'base' : sfx && sfx !== 'max' && sfx !== 'cur') return '';   // a pool full or by .cur reads its most
        return node('f|' + lower(f.key), [t], null, [], []);
    };
    var rowNode = function(L, w) {   // a row's own name (Row.<w>, L.<Key>.<w>): a choice reads its option's value, a column is worked out
        if (w === 'lvl' || w === 'qty' || w === 'on' || w === 'has' || w === 'paid') return '';
        if (L.st[w]) return L.st[w].kind === 'pick' ? node('p|' + L.k + '|' + w, [], null, (Array.isArray(L.st[w].opts) ? L.st[w].opts : []).map(function(o) { return isObj(o) && typeof o.name === 'string' ? o.name : ''; }), []) : '';
        if (L.cl[w]) return typeof L.cl[w].formula === 'string' && L.cl[w].formula ? node('c|' + L.k + '|' + w, [L.cl[w].formula], L, [], []) : '';
        return '';
    };
    var totNode = function(L, w, ext) {   // a total of w (ext: a highest or lowest); undefined where the resolver has none and looks further
        if (ext ? !((L.st[w] && L.st[w].kind !== 'pick') || L.cl[w] || L.ct[w]) : ((w !== 'count' && w !== 'qty' && w !== 'paid' && !L.st[w] && !L.cl[w]) || (L.st[w] && L.st[w].kind === 'pick'))) return undefined;
        var c = L.cl[w] ? rowNode(L, w) : ''; return node('t|' + L.k + '|' + w, [], null, [], c ? [c] : []);
    };
    var listNode = function(l) {   // listName's own reading
        var segs = l.split('.'), f = ix[segs[0]]; if (!f || f.kind !== 'item-list' || segs.length < 2 || segs.length > 5) return undefined;
        var sdC = locSideRead(sys, f, segs); if (sdC) { var tnS = totNode(listOf(f), sdC.w, !!sdC.ext); if (tnS !== undefined) return tnS; }   // 1.6.0 Sides of a location: on the chain as a total is
        if (segs.length === 5) return subjectPlace(f.list, segs) ? totNode(listOf(f), segs[4], lower(segs[3]) !== 'sum') : undefined;   // 1.6.0 Subjects: a total, or a highest or lowest, as listName reads it
        var on4 = segs.length === 4 && segs[1] === 'on', ext = on4 ? segs[2] : segs[1];
        if (segs.length === 4 && !on4 && ext !== 'max' && ext !== 'min' && isObj(f.list) && isObj(f.list.specs)) { var Ls = listOf(f), kids = [rowNode(Ls, segs[3]), Ls.sp.fall ? rowNode(Ls, lower(Ls.sp.fall)) : '', Ls.sp.dflt ? rowNode(Ls, lower(Ls.sp.dflt)) : ''].filter(Boolean); return node('s|' + Ls.k + '|' + segs[3], [], null, [], kids); }   // 1.6.0 Specialties: the figure, the Fallback and the Untrained column
        if (segs.length === 4 && ext !== 'max' && ext !== 'min') return undefined;
        var L = listOf(f);
        if (segs.length === 2) return totNode(L, segs[1], false);
        if ((ext === 'max' || ext === 'min') && segs.length === (on4 ? 4 : 3)) return totNode(L, segs[segs.length - 1], true);
        if (segs.length === 4) return undefined;
        if (segs[1] === 'on') return totNode(L, segs[2], false);
        var w = segs[2]; if (w !== 'lvl' && w !== 'qty' && w !== 'on' && w !== 'has' && w !== 'paid' && !L.st[w] && !L.cl[w] && !L.ct[w]) return undefined;
        return rowNode(L, w);
    };
    var nodeOf = function(name, L) {   // the resolver's own lookup (fn, and a column's rowVars): the node a name is worked out under, or ''
        var l = lower(name);
        if (L && l.slice(0, 5) === 'host.' && !ix.host && !lkC.host) { var hw = l.slice(5), hn = []; if (hw.indexOf('.') < 0) sys.fields.forEach(function(hf) { if (isObj(hf) && hf.kind === 'item-list' && isObj(hf.list) && isObj(hf.list.parts) && partsFromHas(hf.list.parts, L.fid)) { var hd = rowNode(listOf(hf), hw); if (hd) hn.push(hd); } }); if (hn.length) return hn.length === 1 ? hn[0] : node('h|' + L.k + '|' + hw, [], null, [], hn); }   // 205 (3): a part's Host.<w>, on each list its host may be in
        if (L && l.slice(0, 4) === 'row.') { var w = l.slice(4), cw = w.split('.'); return w.indexOf('.') < 0 ? rowNode(L, w) : cw[0] === 'feed' && cw.length >= 3 && cw.length <= 4 && (cw.length === 3 || cw[2] === 'fired') && L.fds[cw[1]] ? rowNode(listOf(L.fds[cw[1]]), cw[cw.length - 1]) : cw.length === 2 && (cw[0] === 'round' || cw[0] === 'fired') && L.chs ? rowNode(listOf(L.chs), cw[1]) : cw.length === 2 && L.ats && cw[0] === L.atb ? rowNode(listOf(L.ats), cw[1]) : cw.length === 2 && L.hg && cw[0] === 'up' ? rowNode(L, cw[1]) : cw[0] === 'parts' && L.pts && (cw.length === 2 || (cw.length === 3 && (cw[1] === 'max' || cw[1] === 'min' || cw[1] === 'all'))) ? (function(pw) { var pns = []; L.pts.forEach(function(sf) { var pn = rowNode(listOf(sf), pw); if (pn) pns.push(pn); }); return !pns.length ? '' : pns.length === 1 ? pns[0] : node('pp|' + L.k + '|' + pw, [], null, [], pns); })(cw[cw.length - 1]) : ''; }   // 1.5.9: a round's stat or column, on its own list; 1.6.0 R14: a part's (205 (1): its highest or lowest too)
        if (ix[l]) return defNode(ix[l], '');
        if (tbW) { var tbN = tableRead(sys, l); if (tbN) return tbN.by ? nodeOf(tbN.by, L) : ''; }   // 1.6.0: a table read by a name is worked out as that name is; a fixed row is a figure
        if (l.indexOf('.') > 0) { var ln = listNode(l); if (ln !== undefined) return ln; }
        var dot = l.lastIndexOf('.'); if (dot > 0 && NAME_SUFFIX[l.slice(dot + 1)] && ix[l.slice(0, dot)]) return defNode(ix[l.slice(0, dot)], l.slice(dot + 1));
        var fgN = figureField(ix, l); if (fgN) return defNode(fgN, 'figure');   // 1.6.2 (auto apply): a height or a weight as a figure
        return '';
    };
    var namesOf = function(t) { var ns = F.names(t); return (Array.isArray(ns) ? ns : []).map(function(x) { return typeof x === 'string' ? x : isObj(x) && typeof x.name === 'string' ? x.name : ''; }); };   // a throw goes to chainsShallow's own catch
    var over = false;   // a loop met, or a path walked past the depth: the answer is false, and nothing is walked further
    var depth = function(id, p) {   // the longest chain from id, in nodes (a loop: Infinity); p: the nodes on the path walked to it, id among them
        if (memo[id] !== undefined) return memo[id];
        if (on[id] === 1 || p > lim) { over = true; return Infinity; }
        on[id] = 1; var it = info[id], best = 0;
        var see = function(d) { if (!d || best > lim) return; var x = depth(d, p + 1); if (x > best) best = x; };
        it.texts.forEach(function(t) { namesOf(t).forEach(function(nm) { if (nm) see(nodeOf(nm, it.L)); }); });
        it.names.forEach(function(nm) { if (nm) see(nodeOf(nm, null)); });
        it.more.forEach(see);
        on[id] = 0; return (memo[id] = best + 1);
    };
    var tops = [];
    Object.keys(ix).forEach(function(k) {
        var f = ix[k]; if (!isObj(f)) return; var d = defNode(f, ''); if (d) tops.push(d);
        if (f.kind !== 'item-list') return; var L = listOf(f);
        Object.keys(L.cl).forEach(function(w) { var t = totNode(L, w, false); if (t) tops.push(t); });
        Object.keys(L.st).forEach(function(w) { var p = rowNode(L, w); if (p) tops.push(p); });
    });
    for (var i = 0; i < tops.length; i++) if (depth(tops[i], 1) > lim || over) return false;
    return true;
}
// [split:body-end]
return { applyRound: applyRound, chainsShallow: chainsShallow, needsHeld: needsHeld, ruleRunCtx: ruleRunCtx, timeRuleRun: timeRuleRun, turnCounters: turnCounters };   // [split:glue]
}   // [split:glue]
