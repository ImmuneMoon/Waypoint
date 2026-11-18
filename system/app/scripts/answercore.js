/* answercore.js: a part of systemcore.js (docs/REFACTOR_SPLIT_PLAN.md, split 2026-11-18 with no change in behavior).
   What it holds: what an attack does once it lands and how it is answered. A landed attack's damage (landDmgInto, landSays), the
   answers a defense may give and what they share, a help roll, the actions a roll's card offers, the questions a roll asks, and what
   an attempt reads of its attacker (withAttempt, readsAttempt, readsAttacker, hideFigOn).
   Why it looks this way: these lines stood in systemcore.js, and they still run exactly where they stood. systemcore.js calls
   answerCore() at its line `// [split:answercore.js]`, so the body below runs in the old order, after everything above that line and
   before everything below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test
   that reads systemcore.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the
   body uses of systemcore.js; the last line hands back the names systemcore.js uses of it. Neither side may assign the other's names
   (tools/splitcheck.js holds it). Change the code here as if it still stood in systemcore.js. */
// [split:of systemcore.js]
import { FIELD_ID, LIMITS, NUMERIC, ROLL_ID, STAT_KEY, cleanFormulaText, cutText, dmgKindPlace, dmgTypePlace, fieldById, fin, gmDerivedNames, hasDice, hasOwn, isObj, listRollRef, lower, map, noDice, placeName, rollAreaInto, rollNeedsOk } from './systemcore.js';   // [split:glue]
export function answerCore() {   // [split:glue]
// [split:body-start]
// 1.6.3 (defense fold 1; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.1, Fulllion's decisions of 2026-11-17): an attack's Its damage, the damage roll that comes once
// the attack lands on its target (net.js landAfter). It is the GM's view alone, since only the host reads it: a system roll's id, or, on a list's roll, a place
// among that list's own rolls (a number), as a line's damage is named (rollAreaInto). It is never kept beside a line, which has a damage of its own, on a roll
// that is itself a damage roll, or on the initiative roll. A roll that has it names itself as it is pressed (named), in both views, so the host finds the whole
// entry however plain the roll looks in a players' view. Absent, a roll is byte for byte as it was
function landDmgInto(out, r, gmView, inList) {
    if (!isObj(r) || !gmView || out.area || out.dmg === true || out.init === true) return;
    var d = r.landDmg;
    if ((inList && typeof d === 'number' && Math.floor(d) === d && d >= 0 && d < LIMITS.rowRolls) || (typeof d === 'string' && ROLL_ID.test(d))) { out.landDmg = d; out.named = true; }
}
// ... and what the editor and the validator say of it: a name that is no damage roll, and a damage roll a hit would also call for (dealing damage twice). lf: the
// list the roll is on, none for a roll of the system. A list of plain sentences, each said once
function landSays(sys, r, lf) {
    var out = []; if (!isObj(r) || r.landDmg === undefined) return out;
    var rolls = isObj(sys) && Array.isArray(sys.rolls) ? sys.rolls : [], d = r.landDmg, ent = null;
    var listRoll = function(f, i) { return isObj(f) && isObj(f.list) && Array.isArray(f.list.rolls) ? f.list.rolls[i] : null; };
    if (typeof d === 'number') ent = listRoll(lf, d); else rolls.forEach(function(x) { if (isObj(x) && x.id === d) ent = x; });
    if (!isObj(ent) || ent.dmg !== true || Array.isArray(ent.apply) || typeof ent.formula !== 'string' || !ent.formula) out.push('Its damage names a roll that is not a damage roll, so nothing comes when it lands.');
    var twice = (Array.isArray(r.calls) ? r.calls : []).some(function(c) {
        if (!isObj(c) || (c.when && c.when !== 'hit')) return false;
        var lr = listRollRef(c.roll), cr = null; if (lr) cr = listRoll((isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).filter(function(x) { return isObj(x) && x.id === lr.f; })[0], lr.i); else rolls.forEach(function(x) { if (isObj(x) && x.id === c.roll) cr = x; });
        return isObj(cr) && cr.dmg === true;
    });
    if (twice) out.push('It has Its damage and also calls for a damage roll on a success, so a hit deals damage twice. Take one of them off.');
    return out;
}
// [systemcheck:answers-start]
// 1.6.3 (defense fold 3; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.2, Fulllion's decisions 3, 6 and 8 of 2026-11-17, and the core's answers 1 to 3 of the same day):
// what a defense that succeeds does to the attack it answers. A roll ticked Resists an attempt (a roll of the system, or a list's roll) may hold a short list
// of lines, When it answers an attack. Each line has two halves, judged at two times. Its condition (if, a formula with no dice) is judged on the host as the
// defense comes in, with the defender's names, the parrying row's as Row.<name>, what the attempt laid on (AttemptMargin, Attempt.kind and type, Attempter.*)
// and the defense roll's own result (RollMargin, RollTotal, Natural, RollCrit, RollBig). The first line whose condition holds is the one that counts; with
// none that holds the attack is stopped, as before. Its effect (does) is applied when the damage lands:
//   stop:  Stops it. Nothing lands.
//   thru:  Takes it on this row. It lands, and the Take damage window tests the parrying row first, as the list roll's own tick always did.
//   share: Lets some through. Each part of the blow, and each hit of a burst, is cut to share, a formula of the blow (Blow.dmg, the part's own amount;
//          Blow.type and Blow.kind, its places; Type.<key> and Kind.<key>), before DR, so the Major Wound test and every wound row read what got through.
//          Beside it, dice (Dice counted per die; Fulllion's ruling of 2026-11-18): absent, Every die rolled, so a figure counted per die (a type's DR,
//          wound, vital wound and wear per die, a location's wound per die) counts every die the blow rolled, as before; 'share', The same share of the
//          dice, so the dice each part hands the damage step are cut by the same fraction as its damage, rounded down, at least 1 where any gets through
//   hits:  Stops a number of hits. hits is a formula read as the defense comes in (1 + RollMargin, say); the rest of a burst's hits land. An attack of one
//          hit is stopped where it stops one or more.
// Beside any of the last three, type (a damage type's key) is the type it lands as, the first part's, or every part's with all. And any line may test a
// weapon (the core's answer 1: only a parry that succeeds tests one): test is a roll of the parrying row's own list (its field id and place, f#i), made on
// that row; testAtk a roll of a list made on the attacking row, where the attack was made from a row of that list. How a test is made is the Combat tab's
// combat.testBy (Fulllion's decision 8): a card its owner presses, rolled at once, or both. The lines are the GM's view alone: only the host reads them
// 1.6.3 (defense fold 4; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.3, backlog 243, Fulllion's decision 4 and the core's answers 4 to 6 of 2026-11-17):
//   send:  Sends it on. The defense stops the attack, and the defender gets a card to send it at someone else, the one they point at. roll is the roll they
//          make to send it, a roll of the system by its id or a roll of the parrying row's own list (f#i), with mod, a modifier read as the defense succeeds;
//          or noRoll (Placed with no roll), with margin, Its margin, read the same way (empty: 0). far is How far it can be sent, read the same way, in the
//          unit the Combat tab's range counts in (TargetDistance's); empty, any distance. back (May go straight back) lets it go back at the one who sent it,
//          which the core never allows. A line that sends it on names no type: the attack keeps the first one's damage and type (decision 4). How many times
//          an attack may be sent on is the Combat tab's (combat.sendHops: absent, once; at most SEND_HOPS_MAX, the app's own ceiling)
var ANS_MAX = 8, ANS_HALF = 'Blow.dmg / 2', SEND_HOPS_MAX = 8;
var ANS_DOES = Object.freeze({ stop: 1, thru: 1, share: 1, hits: 1, send: 1 });
function cleanAnswers(v) {
    var out = [];
    (Array.isArray(v) ? v.slice(0, 40) : []).forEach(function(a) {
        if (out.length >= ANS_MAX || !isObj(a)) return;
        var does = typeof a.does === 'string' && ANS_DOES[a.does] === 1 ? a.does : 'stop', o = { does: does };
        var fi = cleanFormulaText(a.if); if (fi) o.if = fi;
        if (does === 'share') o.share = cleanFormulaText(a.share) || ANS_HALF;   // "Half of it" is the first pick
        if (does === 'share' && a.dice === 'share') o.dice = 'share';   // 1.6.3 (Fulllion's ruling of 2026-11-18): Dice counted per die, The same share of the dice (absent: Every die rolled, as before)
        if (does === 'hits') o.hits = cleanFormulaText(a.hits) || '1';
        if (does !== 'stop' && does !== 'send' && typeof a.type === 'string' && STAT_KEY.test(a.type)) { o.type = a.type; if (a.all === true) o.all = true; }
        if (does === 'send') {   // 1.6.3 (defense fold 4): the roll it is sent on with, or Placed with no roll and Its margin; How far; May go straight back
            if (a.noRoll === true) { o.noRoll = true; var mgS = cleanFormulaText(a.margin); if (mgS) o.margin = mgS; }
            else { if (typeof a.roll === 'string' && (ROLL_ID.test(a.roll) || listRollRef(a.roll))) o.roll = a.roll; var mdS = cleanFormulaText(a.mod); if (mdS) o.mod = mdS; }
            var frS = cleanFormulaText(a.far); if (frS) o.far = frS;
            if (a.back === true) o.back = true;
        }
        if (listRollRef(a.test)) o.test = a.test;
        if (listRollRef(a.testAtk)) o.testAtk = a.testAtk;
        out.push(o);
    });
    return out.length ? out : null;
}
// What one part of a blow lets through on a line that Lets some through: its share, worked out with the part's own figures alone (no dice), a whole number
// from 0 to the part's amount. A share that cannot be worked out lets the whole amount through (null tells the caller to say so)
function ansShare(sys, text, amt, type, kind, F) {
    var a = typeof amt === 'number' && fin(amt) ? Math.max(0, Math.floor(amt)) : 0; if (typeof text !== 'string' || !text || !F || typeof F.evaluate !== 'function') return null;
    var r = null;
    try { r = F.evaluate(text, { vars: function(n) { var l = lower(n); if (l === 'blow.dmg') return a; if (l === 'blow.type') return dmgTypePlace(sys, type); if (l === 'blow.kind') return dmgKindPlace(sys, kind); if (l.indexOf('type.') === 0 || l.indexOf('kind.') === 0) { var p = placeName(sys, l); return p === undefined ? 0 : p; } return undefined; }, random: noDice }); } catch (e) { r = null; }
    var v = r && r.ok ? (typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value) : null; if (typeof v !== 'number' || !fin(v)) return null;
    return Math.max(0, Math.min(a, Math.floor(v)));
}
// 1.6.3 (the review of defense fold 3, finding 10): what a share comes to, in words, read as a formula over a few amounts of damage rather than by its
// text, so a share written Blow.dmg/2 or round(Blow.dmg / 2) is half as Blow.dmg / 2 is: 'half' (half of each, rounded down or up), 'none', 'all', or ''
// for anything else, which a sentence says as some. Read with no type and no kind, so a share that turns on the type is ''
function ansShareWord(sys, text, F) {
    var ns = [1, 2, 3, 7, 10, 25, 100], got = ns.map(function(a) { return ansShare(sys, text, a, '', '', F); });
    if (got.some(function(v) { return v === null; })) return '';
    if (got.every(function(v) { return v === 0; })) return 'none';
    if (got.every(function(v, i) { return v === ns[i]; })) return 'all';
    if (got.every(function(v, i) { return v === Math.floor(ns[i] / 2) || v === Math.ceil(ns[i] / 2); })) return 'half';
    return '';
}
// What the validator says of a share's formula: { message, pos, len } where it rolls dice or reads anything but the blow's own figures, else null
function ansShareSays(sys, text, F) {
    if (!F || typeof F.parse !== 'function') return null; var p = F.parse(String(text || ''));
    if (!p.ok) return { message: p.error.message, pos: p.error.pos, len: p.error.len };
    if (hasDice(p.ast.body)) return { message: 'How much gets through cannot roll dice: it is taken from the damage already rolled.', pos: 0, len: String(text).length };
    var bad = (Array.isArray(p.names) ? p.names : []).filter(function(n) { var l = lower(n); return !(l === 'blow.dmg' || l === 'blow.type' || l === 'blow.kind' || (l.indexOf('type.') === 0 && dmgTypePlace(sys, l.slice(5)) > 0) || (l.indexOf('kind.') === 0 && dmgKindPlace(sys, l.slice(5)) > 0)); })[0];   // a type or a kind only by a name the Combat tab has
    return bad ? { message: '"' + bad + '" is not known here. How much gets through reads only the blow: its damage, its type and its kind.', pos: Math.max(0, lower(String(text)).indexOf(lower(bad))), len: bad.length } : null;
}
// What the editor and the validator say of a roll's lines: plain sentences, each said once. lf: the list a list's roll stands on (none for a roll of the
// system). The parrying row is a row of lf, or of the list a roll of the system is Answered with a row of
function ansSays(sys, r, lf) {
    var out = []; if (!isObj(r) || !Array.isArray(r.answers) || !r.answers.length) return out;
    var rowL = isObj(lf) ? lf : isObj(sys) && typeof r.withRow === 'string' ? fieldById(sys, r.withRow) : null, types = isObj(sys) && isObj(sys.combat) && isObj(sys.combat.damage) && Array.isArray(sys.combat.damage.types) ? sys.combat.damage.types : [];
    var listRoll = function(ref) { var lr = listRollRef(ref), f = lr && isObj(sys) ? fieldById(sys, lr.f) : null, x = f && f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.rolls) ? f.list.rolls[lr.i] : null; return isObj(x) && typeof x.formula === 'string' && !!x.formula && !Array.isArray(x.apply) ? { f: f, r: x } : null; };
    r.answers.forEach(function(a, j) {
        if (!isObj(a)) return;
        if (!a.if && j < r.answers.length - 1) out.push('A line with no condition counts every time, so the lines after it never do.');
        if (a.does === 'thru' && !rowL) out.push('Takes it on this row needs a row, and this defense is made with none, so that line stops the attack.');
        if (a.type && !types.some(function(y) { return isObj(y) && typeof y.key === 'string' && lower(y.key) === lower(a.type); })) out.push('A line names a damage type the Combat tab does not have, so the type stays as it was.');
        if (a.test) { var t = listRoll(a.test); if (!t) out.push('A line tests with a roll that is not there, so no test comes.'); else if (!rowL || t.f.id !== rowL.id) out.push('A line tests the parrying row with a roll of another list, so no test comes.'); }
        if (a.testAtk && !listRoll(a.testAtk)) out.push('A line tests the attacking row with a roll that is not there, so no test comes.');
        if (a.does === 'send') {   // 1.6.3 (defense fold 4): what a line that sends it on would do instead, said in words
            var sysR = a.roll && ROLL_ID.test(a.roll) && isObj(sys) && Array.isArray(sys.rolls) ? sys.rolls.filter(function(x) { return isObj(x) && x.id === a.roll; })[0] : null;
            if (!a.noRoll && !a.roll) out.push('A line sends it on with no roll picked, so it turns the attack aside. Pick a roll, or Placed with no roll.');
            else if (a.roll && ROLL_ID.test(a.roll) && !(sysR && typeof sysR.formula === 'string' && sysR.formula && !Array.isArray(sysR.apply))) out.push('A line sends it on with a roll that is not there, so it turns the attack aside.');
            else if (a.roll && !ROLL_ID.test(a.roll)) { var sl = listRoll(a.roll); if (!sl) out.push('A line sends it on with a roll that is not there, so it turns the attack aside.'); else if (!rowL || sl.f.id !== rowL.id) out.push('A line sends it on with a roll of another list than the parrying row’s, so it turns the attack aside.'); }
        }
    });
    return out.filter(function(m, i) { return out.indexOf(m) === i; });
}
// [systemcheck:answers-end]
// 1.6.0 (B2): the attempt's margin a resist roll reads as AttemptMargin, laid on its token context by the host (never a player's word); k, the
// attempt's kind, which it reads as Attempt.kind, only where the attack names one
// [systemcheck:cardacts-start]
// 1.6.2 (backlog 210 b, G5; the owner, by prompt: "Wait for Accept, then run. Undoing what already ran is where the bugs would come from"): a roll's card may
// offer things to do before it lands: roll again, roll some of its dice again, add or take off a number, or take the result up a band, each with what it
// needs, what it costs and how many times one roll may use it. A roll offering none never waits. A list lives on a roll, and on the Combat tab for every roll
// of a character; the host alone reads them, so they stay in the GM's view, and its needs read through the roller's own names offer nothing they cannot read
// 1.6.2 Assist (the owner, 2026-11-03, by prompt: "The roll waits for help"): a roll ticked Others may help posts a card before it is rolled, and others
// press Help on it until its roller presses Roll or the wait ends. help: { needs?: who may help, a formula of the helper's own names with no dice;
// by: 'fig', what a helper adds is fig, a formula of the helper's names that may roll dice ("a number, a formula, a die"), or 'roll', the helper makes one
// of rolls (system rolls) of their own and table gives what each outcome adds ("success +1, strong success +2, fumble -2"); cap?: all help together at
// most; same?: true, the same helping roll may count more than once; wait?: seconds, else the Combat tab's (30) }. Others on the roller's map help, or any
// player where the roller has no token on a map, and the GM's NPCs too (the owner: "Yes, the GM picks one"). Only the host reads it: the GM's view alone
var HELP_WHEN = Object.freeze({ crit: 1, hit: 1, miss: 1, fumble: 1 }), HELP_ROLLS = 8;
function cleanHelp(v) {
    if (!isObj(v)) return undefined; var o = {};
    var nd = cleanFormulaText(v.needs); if (nd) o.needs = nd;
    if (v.by === 'roll') {
        var rs = []; (Array.isArray(v.rolls) ? v.rolls : []).forEach(function(id) { if (rs.length < HELP_ROLLS && typeof id === 'string' && ROLL_ID.test(id) && rs.indexOf(id) < 0) rs.push(id); }); if (!rs.length) return undefined;
        var tb = {}, any = false; if (isObj(v.table)) Object.keys(HELP_WHEN).forEach(function(w) { var n = v.table[w]; if (typeof n === 'number' && fin(n) && Math.round(n) !== 0 && Math.abs(n) <= 99) { tb[w] = Math.round(n); any = true; } }); if (!any) return undefined;
        o.by = 'roll'; o.rolls = rs; o.table = tb; if (v.same === true) o.same = true;
    } else { var fg = cleanFormulaText(v.fig); if (!fg) return undefined; o.by = 'fig'; o.fig = fg; }
    if (typeof v.cap === 'number' && fin(v.cap) && Math.floor(v.cap) >= 1) o.cap = Math.min(99, Math.floor(v.cap));
    if (typeof v.wait === 'number' && fin(v.wait) && Math.floor(v.wait) >= 5) o.wait = Math.min(600, Math.floor(v.wait));
    return o;
}
function helpWaitOf(sys, ent) { var h = isObj(ent) && isObj(ent.help) ? ent.help : null, w = h && typeof h.wait === 'number' ? h.wait : isObj(sys) && isObj(sys.combat) && typeof sys.combat.helpWait === 'number' ? sys.combat.helpWait : 30; return Math.max(5, Math.min(600, Math.floor(w))); }
// what one helper adds: by a figure, the formula on their own names (a die rolled here); by a roll, its outcome read off the table. An outcome the table
// does not name reads the nearest it does: a critical success as a success, a critical failure as a failure, else nothing. { v, word } or { error }
function helpOutcome(help, chk) {
    if (!isObj(help) || !isObj(help.table)) return { v: 0, word: '' };
    var w = !chk ? 'miss' : chk.pass ? (chk.crit === 'crit' ? 'crit' : 'hit') : (chk.crit === 'fumble' ? 'fumble' : 'miss'), t = help.table;
    var v = hasOwn(t, w) ? t[w] : w === 'crit' && hasOwn(t, 'hit') ? t.hit : w === 'fumble' && hasOwn(t, 'miss') ? t.miss : 0;
    return { v: v, word: { crit: 'critical success', hit: 'success', miss: 'failure', fumble: 'critical failure' }[w] };
}
function helpFig(help, vars, F) {
    if (!isObj(help) || help.by !== 'fig' || !F) return { error: 'That help could not be worked out.' }; var r = null;
    try { r = F.evaluate(help.fig, { vars: vars }); } catch (e) { r = null; }
    if (!r || !r.ok || typeof r.value !== 'number' || !fin(r.value)) return { error: 'What that helper adds could not be worked out.' };
    return { v: Math.max(-99, Math.min(99, Math.round(r.value))), res: r };
}
// all help together, held to the roll's cap where it has one
function helpTotal(help, list) { var n = 0; (Array.isArray(list) ? list : []).forEach(function(x) { if (isObj(x) && typeof x.v === 'number' && fin(x.v)) n += x.v; }); if (isObj(help) && typeof help.cap === 'number' && n > help.cap) n = help.cap; return Math.max(-99, Math.min(99, n)); }
var CARD_DOES = Object.freeze({ again: 1, againIf: 1, add: 1, sub: 1, bandUp: 1, run: 1 }), CARD_MAX = 6;
function cleanCardActs(v) {
    if (!Array.isArray(v)) return undefined;
    var out = [];
    v.slice(0, CARD_MAX * 3).forEach(function(a) {
        if (!isObj(a) || out.length >= CARD_MAX || !Object.prototype.hasOwnProperty.call(CARD_DOES, a.does)) return;
        var label = cutText(a.label, LIMITS.label); if (!label) return;
        var o = { label: label, does: a.does };
        if (a.does === 'add' || a.does === 'sub') { var n = cleanFormulaText(a.n); if (!n) return; o.n = n; }
        if (a.does === 'run') { if (typeof a.act !== 'string' || !ROLL_ID.test(a.act)) return; o.act = a.act; }   // 1.6.2 (G5): an action of the system, run once the roll is accepted
        if (a.does === 'againIf') { var t = isObj(a.test) ? a.test : {}, op = t.op === '>=' || t.op === '=' ? t.op : '<=', tv = typeof t.v === 'number' && fin(t.v) ? t.v : null; if (tv === null) return; o.test = { op: op, v: tv }; }
        var nd = cleanFormulaText(a.needs); if (nd) o.needs = nd;
        if (typeof a.pay === 'string' && ROLL_ID.test(a.pay)) o.pay = a.pay;
        var sp = typeof a.spend === 'number' && fin(a.spend) ? Math.max(0, Math.min(99, Math.floor(a.spend))) : 0; if (sp) o.spend = sp;   // 1.6.2 (G5): the result points it takes
        var tm = typeof a.times === 'number' && fin(a.times) ? Math.max(1, Math.min(9, Math.floor(a.times))) : 1; if (tm > 1) o.times = tm;
        out.push(o);
    });
    return out.length ? out : undefined;
}
// 1.6.2 (G5): what a roll gives to spend on its card, a formula read with what the roll came to, and the word for it. A roll's own, else the Combat tab's
function cardPtsOf(sys, ent) { var c = isObj(sys) && isObj(sys.combat) ? sys.combat : {}, h = isObj(ent) && typeof ent.cardPts === 'string' && ent.cardPts ? ent : typeof c.cardPts === 'string' && c.cardPts ? c : null; return h ? { text: h.cardPts, word: h.cardPtsWord || 'points' } : null; }
function cardActsOf(sys, ent) {
    var own = isObj(ent) && Array.isArray(ent.cardActs) ? ent.cardActs : [], all = isObj(sys) && isObj(sys.combat) && Array.isArray(sys.combat.cardActs) ? sys.combat.cardActs : [];
    return own.concat(all);
}
function cardWaitOf(sys) { var w = isObj(sys) && isObj(sys.combat) ? sys.combat.cardWait : null; return typeof w === 'number' && fin(w) ? Math.max(5, Math.min(600, Math.floor(w))) : 60; }
function cardActOk(act, vars, F) { return !act.needs || rollNeedsOk({ needs: act.needs }, vars, F); }
function cardDieHolds(raw, test) { return test.op === '>=' ? raw >= test.v : test.op === '=' ? raw === test.v : raw <= test.v; }
// [systemcheck:cardacts-end]
// [systemcheck:asks-start]
// 1.6.2 (backlog 210 b, G6): a roll or an action may ask up to three things as it is pressed, read as Ask.<key> in its own formula, needs and Then. A
// question is a pick from a short list of words each with a figure, a pick among the sheet's values, or a whole number between two figures. key is the
// builder's own and never shown. An answer travels as data on a named press, and the host judges it against the entry it rebuilds the roll from, so
// nothing a roller sends is read as a value. A press that names no answer takes the first one, as a roll that runs by itself does, since nobody is there to ask
var ASKS_MAX = 3, ASK_OPTS = 12, ASK_KEY = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
function cleanAsks(v) {
    if (!Array.isArray(v)) return undefined;
    var out = [], seen = map();
    v.slice(0, ASKS_MAX * 4).forEach(function(a) {
        if (!isObj(a) || out.length >= ASKS_MAX) return;
        var key = typeof a.key === 'string' && ASK_KEY.test(a.key) ? a.key : '', label = cutText(a.label, LIMITS.label); if (!key || !label || seen[lower(key)]) return;
        var o = { key: key, label: label };
        if (a.kind === 'field') { var fs = []; (Array.isArray(a.fields) ? a.fields : []).slice(0, ASK_OPTS * 2).forEach(function(id) { if (typeof id === 'string' && FIELD_ID.test(id) && fs.indexOf(id) < 0 && fs.length < ASK_OPTS) fs.push(id); }); if (!fs.length) return; o.kind = 'field'; o.fields = fs; }
        else if (a.kind === 'num') { var mn = cleanFormulaText(a.min), mx = cleanFormulaText(a.max); if (!mn || !mx) return; o.kind = 'num'; o.min = mn; o.max = mx; }
        else { var os = []; (Array.isArray(a.opts) ? a.opts : []).slice(0, ASK_OPTS * 2).forEach(function(p) { if (!isObj(p) || os.length >= ASK_OPTS) return; var pl = cutText(p.label, LIMITS.label); if (!pl) return; var pv = typeof p.v === 'number' && fin(p.v) ? Math.max(-1e6, Math.min(1e6, p.v)) : os.length + 1; os.push({ label: pl, v: pv }); }); if (!os.length) return; o.kind = 'pick'; o.opts = os; }
        seen[lower(key)] = true; out.push(o);
    });
    return out.length ? out : undefined;
}
// What a player's system keeps of a question: a value they cannot read truthfully is no choice, and a number whose ends read one is no question, in both
// views, so their sheet and the GM's offer the same thing
function asksKept(asks, sysV, F, secret) {
    return asks.filter(function(a) {
        if (a.kind === 'field') { a.fields = a.fields.filter(function(id) { var f = fieldById(sysV, id); return !!f && !!NUMERIC[f.kind] && !secret[id]; }); return a.fields.length > 0; }
        if (a.kind !== 'num') return true;
        return [a.min, a.max].every(function(t) { var p = F.parse(t); return !!(p && p.ok && p.ast && !hasDice(p.ast.body) && Array.isArray(p.names) && !gmDerivedNames(sysV, F, p.names).length); });
    });
}
function readsAsk(text) { return typeof text === 'string' && /(^|[^A-Za-z0-9_.])ask\.[A-Za-z]/i.test(text); }
function askEnds(a, vars, F) {
    var e = function(t) { var r = null; try { r = F.evaluate(t, { vars: vars, bare: true }); } catch (x) { r = null; } return r && r.ok && typeof r.value === 'number' && fin(r.value) ? Math.floor(r.value) : null; }, lo = e(a.min), hi = e(a.max);
    return lo === null || hi === null ? null : { lo: lo, hi: Math.max(lo, hi) };
}
function askJudge(sys, ent, ans, vars, F) {
    var out = { ask: map(), said: [] }, given = isObj(ans) ? ans : null, ok = true;
    (isObj(ent) && Array.isArray(ent.asks) ? ent.asks : []).forEach(function(a) {
        if (!ok) return;
        var has = !!given && Object.prototype.hasOwnProperty.call(given, a.key), v = has ? given[a.key] : undefined, k = lower(a.key);
        if (a.kind === 'field') { var id = has ? v : a.fields[0], fd = a.fields.indexOf(id) >= 0 ? fieldById(sys, id) : null; if (!fd) { ok = false; return; } out.ask[k] = { f: fd.key }; out.said.push({ l: a.label, w: fd.label || fd.key }); }
        else if (a.kind === 'num') { var en = askEnds(a, vars, F); if (!en) { ok = false; return; } var n = has ? v : en.lo; if (typeof n !== 'number' || n !== Math.floor(n) || n < en.lo || n > en.hi) { ok = false; return; } out.ask[k] = n; out.said.push({ l: a.label, w: String(n) }); }
        else { var i = has ? v : 0, op = typeof i === 'number' && i === Math.floor(i) && i >= 0 ? a.opts[i] : null; if (!op) { ok = false; return; } out.ask[k] = op.v; out.said.push({ l: a.label, w: op.label }); }
    });
    return ok ? out : { error: 'That answer is not one this roll offers now.' };
}
function withAsk(vars, asked) {
    if (typeof vars !== 'function' || !isObj(asked) || !asked.ask) return vars;
    var ask = asked.ask, w = function(l, t) { var v = vars(l, t); if (v !== undefined) return v; var lo = String(l).toLowerCase(); if (lo.length > 4 && lo.indexOf('ask.') === 0 && Object.prototype.hasOwnProperty.call(ask, lo.slice(4))) { var a = ask[lo.slice(4)]; return isObj(a) ? vars(a.f, t) : a; } return v; };
    Object.keys(vars).forEach(function(p) { w[p] = vars[p]; }); w.asked = true;
    return w;
}
function askFill(sys, ent, vars, F) {   // nobody to ask: a run by itself takes each question's first answer
    if (!isObj(ent) || !Array.isArray(ent.asks) || typeof vars !== 'function' || vars.asked === true) return vars;
    var r = askJudge(sys, ent, null, vars, F); return r.error ? vars : withAsk(vars, r);
}
function cleanAskWire(v) {
    if (!isObj(v)) return null;
    var ks = Object.keys(v); if (!ks.length || ks.length > ASKS_MAX) return null;
    var out = {}; for (var i = 0; i < ks.length; i++) { var k = ks[i], x = v[k]; if (!ASK_KEY.test(k)) return null; if (typeof x === 'number' ? !(fin(x) && Math.abs(x) <= 1e6) : !(typeof x === 'string' && FIELD_ID.test(x))) return null; out[k] = x; }
    return out;
}
function askFind(sys, key) {
    var k = lower(key), hit = null, walk = function(r) { if (!hit && isObj(r) && Array.isArray(r.asks)) r.asks.forEach(function(a) { if (!hit && isObj(a) && typeof a.key === 'string' && lower(a.key) === k) hit = a; }); };
    (isObj(sys) && Array.isArray(sys.rolls) ? sys.rolls : []).forEach(walk);
    (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (isObj(f) && isObj(f.list) && Array.isArray(f.list.rolls)) f.list.rolls.forEach(walk); });
    return hit;
}
// [systemcheck:asks-end]
function withAttempt(tctx, m, k, r, t) { var a = { m: fin(m) ? Math.max(-9999, Math.min(9999, m)) : 0 }; if (fin(k)) a.k = Math.max(-9999, Math.min(9999, k)); if (isObj(r)) a.r = r; if (fin(t)) a.t = Math.max(-9999, Math.min(9999, t)); return Object.assign({}, isObj(tctx) ? tctx : {}, { att: a }); }
// 1.6.0 An attempt's kind: a list roll's attemptKey names one number stat of its row (never a choice or a set of places), kept beside Resisted by in the GM's view
// alone, spelled as the list spells it. The host reads that stat off the attacker's row on its own record (net.js attKindOf), a resist roll reads it as
// Attempt.kind, 0 with none, and a defense whose needs fail for it is not offered. A sheet cannot know it, so a button never grays by needs that read it
function attemptKeyOf(stats, key) { var l = typeof key === 'string' ? lower(key.trim()) : '', hit = ''; (Array.isArray(stats) ? stats : []).forEach(function(s) { if (!hit && l && isObj(s) && typeof s.key === 'string' && lower(s.key) === l && s.kind !== 'pick' && s.set !== true) hit = s.key; }); return hit; }
function attRowNames(sys) { var out = []; (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (!isObj(f) || f.kind !== 'item-list' || !isObj(f.list) || !(Array.isArray(f.list.rolls) ? f.list.rolls : []).some(function(r) { return isObj(r) && typeof r.resistBy === 'string' && r.resistBy; })) return; (Array.isArray(f.list.stats) ? f.list.stats : []).filter(function(x) { return isObj(x) && typeof x.key === 'string' && x.kind !== 'pick' && x.vis !== 'gm'; }).concat(Array.isArray(f.list.cols) ? f.list.cols : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string' && out.indexOf('Attempter.Row.' + x.key) < 0) out.push('Attempter.Row.' + x.key); }); }); return out; }   // 1.6.2 (the CORE session's batch 6, 7)
function readsAttempt(text, F) { if (typeof text !== 'string' || !text || !F || typeof F.names !== 'function') return false; try { return F.names(text).some(function(n) { var l = lower(String(n)); return l === 'attempt.kind' || l === 'attempt.type' || l === 'attackerdark' || l === 'attackerdarkpen' || l.indexOf('attempter.') === 0; }); } catch (e) { return false; } }   // Attempter.<key> too: only the host holds what the attacker's sheet read
// 1.6.2 (the owner, 2026-11-01): a roll that resists keeps showing a figure that reads the attacker's stat. Hidden where the system says (combat.hideResist) or
// on the GM's tick on an NPC's sheet (hideFigOn, the one judge), and only for a formula that reads the attacker, which readsAttacker says: AttemptMargin,
// Attempt.kind or Attempter.<key>. A figure that reads nothing of the attacker is its roller's own. resistReadsAttacker: whether a roll that is resisted
// (entry, the GM's whole copy) may be answered by one that does
function readsAttacker(text, F) { if (typeof text !== 'string' || !text || !F || typeof F.names !== 'function') return false; try { return F.names(text).some(function(n) { var l = lower(String(n)); return l === 'attemptmargin' || l === 'attempt.kind' || l === 'attempt.type' || l.indexOf('attempter.') === 0; }); } catch (e) { return false; } }
function hideFigOn(sys, ch) { return !!(sys && isObj(sys.combat) && sys.combat.hideResist === true) || !!(isObj(ch) && ch.hideFig === true && (ch.npc === true || !ch.ownerId)); }
function resistReadsAttacker(sys, entry, F) {
    if (!sys || !isObj(entry) || typeof entry.resistBy !== 'string') return false;
    return [entry.resistBy].concat(Array.isArray(entry.resistOr) ? entry.resistOr : []).some(function(id) {
        var lr = typeof id === 'string' ? listRollRef(id) : null, r = null;
        if (lr) { var f = fieldById(sys, lr.f); r = f && isObj(f.list) && Array.isArray(f.list.rolls) ? f.list.rolls[lr.i] : null; }
        else (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(x) { if (isObj(x) && x.id === id) r = x; });
        return isObj(r) && readsAttacker(r.formula, F);
    });
}
// [split:body-end]
return { ANS_HALF: ANS_HALF, ANS_MAX: ANS_MAX, ASKS_MAX: ASKS_MAX, ASK_OPTS: ASK_OPTS, CARD_MAX: CARD_MAX, HELP_ROLLS: HELP_ROLLS, HELP_WHEN: HELP_WHEN, SEND_HOPS_MAX: SEND_HOPS_MAX, ansSays: ansSays, ansShare: ansShare, ansShareSays: ansShareSays, ansShareWord: ansShareWord, askEnds: askEnds, askFill: askFill, askFind: askFind, askJudge: askJudge, asksKept: asksKept, attRowNames: attRowNames, attemptKeyOf: attemptKeyOf, cardActOk: cardActOk, cardActsOf: cardActsOf, cardDieHolds: cardDieHolds, cardPtsOf: cardPtsOf, cardWaitOf: cardWaitOf, cleanAnswers: cleanAnswers, cleanAskWire: cleanAskWire, cleanAsks: cleanAsks, cleanCardActs: cleanCardActs, cleanHelp: cleanHelp, helpFig: helpFig, helpOutcome: helpOutcome, helpTotal: helpTotal, helpWaitOf: helpWaitOf, hideFigOn: hideFigOn, landDmgInto: landDmgInto, landSays: landSays, readsAsk: readsAsk, readsAttacker: readsAttacker, readsAttempt: readsAttempt, resistReadsAttacker: resistReadsAttacker, withAsk: withAsk, withAttempt: withAttempt };   // [split:glue]
}   // [split:glue]
