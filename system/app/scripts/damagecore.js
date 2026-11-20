/* damagecore.js: a part of systemcore.js (docs/REFACTOR_SPLIT_PLAN.md, split 2026-11-18 with no change in behavior).
   What it holds: the damage step and everything it leans on. The damage rules' cleaner (cleanDamageRules), the step itself
   (damageStep) with its helpers (the wound and the pools it spills into, the layers and their wear, Major Wounds and what they post,
   a failed roll's cripple, withBlow and BLOW_NAMES, a blow's location and side), and a burst (damageBurst, hitRolls and the rest of
   the [systemcheck:burst-*] lines).
   Why it looks this way: these lines stood in systemcore.js, and they still run exactly where they stood. systemcore.js calls
   damageCore() at its line `// [split:damagecore.js]`, so the body below runs in the old order, after everything above that line and
   before everything below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test
   that reads systemcore.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the
   body uses of systemcore.js (live: a sink systemcore sets later, such as _blowSink, is read with its new value); the last line hands
   back the names systemcore.js uses of it. Neither side may assign the other's names (tools/splitcheck.js holds it). Change the code
   here as if it still stood in systemcore.js. */
// [split:of systemcore.js]
import { ARC_MAX, CHAMBER_CAP, CHAR_ID, DMG_MORE, EFFECT_ID, FIELD_ID, FX_AGAIN, ITEM_ID, LIMITS, RID_RE, ROLL_ID, ROW_ID, ROW_NAME, ROW_SOFT, STAT_KEY, _blowSink, _fxOutSink, applyAct, applyEdit, applyEffectOp, arcHolds, clampNum, cleanCrew, cleanFormulaText, cleanSystem, cutText, dmgAdOf, dmgKindOf, dmgMajorOf, dmgPartOf, dmgTypeOf, fieldById, fin, fitBroke, gmDerivedNames, gmOnlyNames, gmPools, gmStatKeys, hasDice, hasOwn, isObj, lower, makeResolver, map, noDice, placeName, resultAdd, rowDef, rowIdOf, rowRollNames, rowStat, setBlowSink, statName, storedOf } from './systemcore.js';   // [split:glue]
export function damageCore() {   // [split:glue]
// [split:body-start]
// [systemcheck:damage-start]
// 1.5.6, the damage step (the owner, 2026-10-24: "taking damage and running down HP and running through anything that provides DR first, DR
// degradation and DUR degradation. all of this generalized for waypoint"): camp.system.combat.damage, absent when a system takes no damage by it.
//   pool    the resource a wound comes off (the Combat tab's hpResource where none is named)
//   major   a formula: a wound at or above it, in one blow, is a Major Wound ('' none). 1.6.0 (a build's sort, B3): it reads the hit location's
//           own names as Hit.<name> beside the character's (0 where no location was struck), so a threshold may be a third on the head
//   onMajor { fx, roll }, only beside major and in the GM's view alone: what a Major Wound does. fx, a library effect switched on (as an apply
//           action switches one: once per character, its timer); roll, a system roll whose reminder is posted to the wounded character's
//           player (a roll against shock). An id that is no effect or roll of the system does nothing. 1.6.0 (the core's gap 7): crip, beside roll
//           and locs, a number stat of the location list: where that roll fails, the location struck gets how far it failed, at least 1
//           (the owner, by prompt: "How far it failed"), so a formula reads 1 or more as crippled and 5 or more as severed. cripBy, beside
//           crip (the core's ruling: a natural 18 severs, whatever the margin): a formula of Margin (how far it failed), Natural (the roll's
//           bare total) and Blow.<name>, no dice, whose whole number is written instead; 0 or below writes nothing. An onWound row's the same.
//           1.6.0 (asked by a system build): onMajor may carry if, a formula read as an onWound row's is (the character's names, Hit.<name>
//           and Blow.<name>): it does something only where that holds. Or onMajor may be a list of up to 4 such rows { if, fx, roll, crip,
//           cripBy }, and the first whose if holds (absent: holds) is what a Major Wound does (majPick, the one judge). A single onMajor with no
//           if reads exactly as before
//   onWound 1.6.0 (the core's gap 6): [{ if, fx, roll, crip }], at most 4, in the GM's view alone: what any wound does, each where its formula
//           holds (absent: every wound), as onMajor does for a Major Wound. if reads the character's names, Hit.<name> (the location struck,
//           0 where none) and Blow.dmg, Blow.through, Blow.wound, Blow.type and Blow.cuts. Each entry needs an effect or a roll.
//           held (1.6.0): { list, at, stat, to }, what stands where the blow lands: at, a formula of a row of that list, Hit.<name>, Blow.<name>
//           and the character's names, is true for each row at the struck location; if reads how many as Held.count; stat, a number stat, and
//           to, a formula of the same names and Held.count, write every such row. So a row may do its work with no effect and no roll. Rows
//           kept from their player count for nothing, and each row of onWound reads what the row before it wrote
//           any (1.6.2, asked by a system build: knockback counts where armor stops the whole injury): true only, the row runs on every blow
//           that lands, a wound or none, Blow.wound then 0; a row without it runs on a wound alone, as before. asAt (1.6.2, of a shock roll that
//           leaves out the Stunned of the same hit): true only, beside a roll, which is then worked out on the sheet as it stood when this row
//           was reached, before its own effect and any later row's, in place of the sheet as the whole blow left it (info.follows[i].vals)
//   A roll the step posts (onMajor's or an onWound one's) reads Blow.<name> and Hit.<name> of the blow that called it when it is rolled from
//   its card (the host's own record, withBlow; 0 on any other press), so one heavy hit roll is -2 on the face by a column of the location
//   locs    { list, dr, crip, vital, mult }: the list of hit locations, the column or stat that is a location's DR, the column or stat at which a wound there
//           may cripple it, a formula of the location's own names (Row.) that is true at a vital location, and a formula of the location's names and the
//           character's that is the location's own multiplier for a wound to the main pool, whatever the type (0: none; the skull's x4, a robot's head x2)
//   types   [{ key, label, mult, vital, plus, noDr, pool, alt, noWear, cuts }]: a damage type, its wounding multiplier, its multiplier at a vital location
//           (0: as anywhere), the location's stats or columns added to its DR (typed DR), ignoring DR, the pool it comes off where not the main one, a
//           second reading where a formula holds ({ if, pool, mult, noWear }: lightning on a robot), wearing nothing (end, stun), and destroying a weapon at 20 over.
//           1.6.0 (the v2 combat module): the dice the blow rolled (the step's inp.dice) may count, each a figure a die, -10 to 10 to the hundredth:
//           dieDr (added to the DR at the location for this blow alone), dieWound (added to a wound that gets through), dieVital (added there at a vital
//           location) and dieWear (0 to 10: worn off each layer at the location for good, whether or not the blow gets through)
//   layers  [{ list, at, wear }]: what wears where a hit gets through: a list whose rows are worn (switched on where it has a switch), a formula of the
//           row's names (Row.) and the hit location's (Hit.) that is the row's listed figure there (its DR, or a garment's Dur), and its stat of wear.
//           A layer wears only where the damage rolled is more than its figure as it stands (the listed figure less its wear, never below 0).
//           1.6.0 (the v2 combat module): 8 layers at most, and a layer may wear another stat by location: wears, up to 8 number stats of its list,
//           and pick, a formula read as at is that gives the place in wears of the stat worn there, 1 for the first; any other figure wears wear.
//           locs.at (1.6.3): where a blow lands when nothing aimed it, a location's name or entry key (absent: a row named Torso, else one
//           that holds the word, else the first row), read by the Take damage window and a blast's shares alike
//           locs.die (1.6.0): a formula of the location's names and the character's, added to a wound that gets through for each die the blow rolled
//   weapons [{ list, dur, wear, cond }]: a weapon tested by a blow: its listed Dur (a formula of Row.), its stat of wear and its stat of condition
//           word (1.6.3, Fulllion's ruling of 2026-11-20): what the damage line calls its durability, the box Called (Dur, say). Kept in both
//           views, since a player's own Take damage window says it too; absent where empty, so a system with none cleans as before
// The players' view keeps what the window asks (the pool, the types by name, the location list) and no formula: the host works the blow out.
// 1.6.0 (the core's armor rule, asked by the campaign build's session): a layer may say by formula what a hit wears. majorWear on a Major
// Wound in place of a quarter of its listed figure; brokenWear and brokenMajorWear once its figure there is used up (Broken), for an
// injuring hit and a Major Wound (a Major Wound with no brokenMajorWear reads majorWear). Each reads the row (Row.), the location (Hit.),
// Listed (its figure there) and Worn (what has worn off); one that gives no number, or less than 0, wears what the layer wore before.
// The blow's own names too (book round hg, asked by the same session): Blow.dmg the damage rolled, before Protection; Blow.through what got
// past it; Blow.wound the wound it dealt; Blow.type the damage type's place in the Combat tab's list, 1 the first, 0 none; Blow.cuts 1 for a
// type ticked as cutting; and ToDestroy, the wear that takes the piece to its wear cap, destroyed. The cap is twice its listed figure (it
// wears to minus that figure), or a layer's own wearCap (1.6.0, asked by the same session for a piece whose Durability is one pool across
// its locations), a formula read alike that gives the most wear the row may hold there; one that gives no number, or less than Worn, keeps
// twice the listed figure. A piece is destroyed where its wear reaches the cap
// hitWear (1.6.0, asked by the campaign build's session for an implant a blow can destroy): what an injuring hit that is no Major Wound
// wears while the piece is not broken there, read as the others are. The order: a Major Wound majorWear; once broken brokenWear (or
// brokenMajorWear); any other hit hitWear; with none of them, or one that gives no number or less than 0, 1 or a quarter as before
// whole (1.6.0, Every location): a layer that is one figure and one wear stat wherever a blow lands, as a worn field is. Its at, read once a part,
// says which types it stands against (a part it gives 0 for passes it by) and hitWear, majorWear and the rest what it wears, as on any layer. Three
// things differ. It wears where a part it stands against took the main pool, never by comparing the damage rolled with its figure, so an armor
// divisor or a type that ignores DR cannot let a hit through unworn; a blow with no location wears it too (Hit. names read 0); and with no wearCap
// it stops at its figure, where it is down (layerWord), wear never going past it nor being put back. wears and pick are dropped beside it: one stat
// typed (1.6.0, Type named by): { stat, plus }, what a row adds to the DR at the location against one damage type. stat, a number stat of the row
// naming the type by its place in the Combat tab's list, 1 the first, 0 none; plus, a formula read as the wear formulas are. It is worked out for
// each part of a blow by that part's own type, added before the armor divisor, and stored nowhere, so it never wears. A row counts where it wears
// (on, or anyRow) and where its at gives that part a figure, and it stops once the row is broken there. Several rows add up
var LAYER_WEAR = ['majorWear', 'brokenWear', 'brokenMajorWear', 'wearCap', 'hitWear'];
function layerVars(listed, worn, blow, both, cap) {
    var bw = blow && typeof blow === 'object' ? blow : {}, bn = function(v) { return typeof v === 'number' && isFinite(v) ? v : 0; };
    return function(l, text) {
        if (l === 'listed') return listed; if (l === 'worn') return worn; if (l === 'todestroy') return Math.max(0, (typeof cap === 'number' ? cap : listed * 2) - worn);
        if (l === 'blow.dmg') return bn(bw.dmg); if (l === 'blow.through') return bn(bw.through); if (l === 'blow.wound') return bn(bw.wound); if (l === 'blow.first') return bn(bw.first); if (l === 'blow.type') return bn(bw.type); if (l === 'blow.cuts') return bw.cuts ? 1 : 0; if (l === 'blow.major') return bw.major ? 1 : 0; if (l === 'blow.big') return bw.big ? 1 : 0; if (l === 'blow.kind') return bn(bw.kind);
        if (/^blow\.(type|wound|kind)[2345]$/.test(l)) return bn(bw[l.slice(5)]);   // 1.6.0: each added part's type, wound and kind, 0 with none
        if (/^blow\.arc\./.test(l) && blowArcKey(l.slice(5))) return bw[l.slice(5)] ? 1 : 0;   // 1.6.2 (13): the arc the blow came from
        return both(l, text);
    };
}
function layerWord(nw, cap, listed, down) { return nw >= cap ? (down ? ', down' : ', destroyed') : listed - nw <= 0 ? ', broken' : ', damaged'; }   // the last word of a wear's line. down: a layer of Every location with no wearCap of its own
function layerCap(ly, listed, worn, ev, both, blow) {
    var dflt = isObj(ly) && ly.whole === true ? listed : listed * 2; if (!ly || typeof ly.wearCap !== 'string' || !ly.wearCap) return dflt;
    var v = ev(ly.wearCap, layerVars(listed, worn, blow, both, dflt)); return typeof v === 'number' && isFinite(v) && v >= worn ? Math.floor(v) : dflt;
}
function layerStep(ly, major, listed, worn, ev, both, blow, cap) {
    var base = major ? Math.ceil(listed / 4) : 1, brk = listed - worn <= 0, wf = brk ? (major ? (ly.brokenMajorWear || ly.majorWear) : ly.brokenWear) : (major ? ly.majorWear : ly.hitWear);
    if (typeof wf !== 'string' || !wf) return base;
    var v = ev(wf, layerVars(listed, worn, blow, both, cap)); return typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : base;
}
// 1.6.0 Sides of a location: locs.side, a number stat of the location list naming each row's side, 0 none, 1 left, 2 right, the same in both views.
// Row.side reads it on that list, so Hit.side reads the location struck and Target.Hit.side the row aimed at, 0 with none, and a list's own stat or
// column of that name wins (ROW_SOFT). <Locs>.Left.<w> and <Locs>.Right.<w> read that side's rows as <Locs>.<w> reads every row, added up, and
// <Locs>.Left.max.<w> and .min.<w> their highest and lowest, each 0 with no such row. Only where side is set, so nothing changes for a system with
// none, and an entry keyed Left or Right keeps its name. locSideRead is the one reading of such a name
function locSideKey(sys, f) {
    var d = isObj(sys) && isObj(sys.combat) && isObj(sys.combat.damage) ? sys.combat.damage : null, lc = d && isObj(d.locs) ? d.locs : null;
    return lc && isObj(f) && lc.list === f.id && typeof lc.side === 'string' ? lc.side : '';
}
function locSideRead(sys, f, segs) {
    if (!locSideKey(sys, f)) return null;
    var sd = segs[1] === 'left' ? 1 : segs[1] === 'right' ? 2 : 0; if (!sd) return null;
    if (segs.length === 3) return { side: sd, w: segs[2], ext: '' };
    return segs.length === 4 && (segs[2] === 'max' || segs[2] === 'min') ? { side: sd, w: segs[3], ext: segs[2] } : null;
}
function locNamed(sys, f, def, name) {   // a location's name with its side, for a pick and a line: the stat's own value name, else left or right
    var k = locSideKey(sys, f), v = k && isObj(f.list) && isObj(def) ? rowStat(f.list, def, k) : 0, w = v === 1 || v === 2 ? statName(f.list, def, k) || (v === 1 ? 'left' : 'right') : '';
    return w ? name + ' (' + w + ')' : name;
}
var DMG_LIM = Object.freeze({ types: 320, kinds: 80, layers: 80, weapons: 40, plus: 80, mult: 10, amt: 1000000, wears: 80, dice: 100, onWound: 60, onMajor: 40 });   // onWound (1.6.0, the core's gap 6); onMajor's rows (1.6.0)
function dmgStatOk(fl, listId, key) {   // a number stat of that list, value names or not (a stat its rows may hold as their own), never a pick
    var f = fl ? fl(listId) : null, sp = f && isObj(f.list) ? f.list : null; if (!sp || typeof key !== 'string' || !STAT_KEY.test(key)) return '';
    var hit = ''; (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(s) { if (!hit && isObj(s) && lower(s.key) === lower(key) && s.kind !== 'pick') hit = s.key; });
    return hit;
}
function cleanHeld(h, fl) {   // 1.6.0: an onWound row's held: a list of the view and a formula, and a number stat with what it is written to, both or neither
    if (!isObj(h) || typeof h.list !== 'string' || !fl || !fl(h.list) || !isObj(fl(h.list).list)) return null;
    var at = cleanFormulaText(h.at); if (!at) return null;
    var o = { list: h.list, at: at }, st = dmgStatOk(fl, h.list, h.stat), to = cleanFormulaText(h.to); if (st && to) { o.stat = st; o.to = to; }
    return o;
}
function dmgNameOk(fl, listId, key) {   // a stat or a column of that list
    var f = fl ? fl(listId) : null, sp = f && isObj(f.list) ? f.list : null; if (!sp || typeof key !== 'string' || !STAT_KEY.test(key)) return '';
    var hit = ''; (Array.isArray(sp.stats) ? sp.stats : []).concat(Array.isArray(sp.cols) ? sp.cols : []).forEach(function(s) { if (!hit && isObj(s) && lower(s.key) === lower(key)) hit = s.key; });
    return hit;
}
function dmgNum(v, lo, hi, d) { return typeof v === 'number' && fin(v) ? Math.round(clampNum(v, lo, hi) * 100) / 100 : d; }
var DMG_DIE = Object.freeze([['dieDr', -10], ['dieWound', -10], ['dieVital', -10], ['dieWear', 0]]);   // 1.6.0: a type's figures a die, and each one's least
// 1.6.3 (the improvement week's review of sheets and rolls, finding 27, and the review of damage): what a weapon's durability is called, in the
// system's own words. First the rule's own word, its Called box (1.6.3, Fulllion's ruling of 2026-11-20: weapon durability is his system's
// mechanic and must not be hard-coded, and his system says Dur). Else the label of the stat or column of the weapon list that its Dur formula
// reads, where that formula is one name of the row (Row.<key>). Else the plain word durability, never nothing (Fulllion: "none isn't a good
// default substitution"). The ONE reader of that word: the damage step's own weapon line below, the Take damage window (sheets.js dmgDurWord
// asks it) and the host's note when a parry took the blow (netattack.js thruNote). A player's view of the rules keeps the word but no formula,
// so a player's own window says the rule's word, else durability. wp: one of the Taking damage rules' weapons ({ list, dur, word, ... })
function dmgDurWord(sys, wp) {
    var own = isObj(wp) && typeof wp.word === 'string' ? wp.word.trim() : ''; if (own) return own.slice(0, LIMITS.label);
    var m = isObj(wp) && typeof wp.dur === 'string' ? /^\s*Row\.([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(wp.dur) : null, f = m && isObj(sys) ? fieldById(sys, wp.list) : null, sp = f && isObj(f.list) ? f.list : null;
    var all = sp ? (Array.isArray(sp.stats) ? sp.stats : []).concat(Array.isArray(sp.cols) ? sp.cols : []) : [], hit = m ? all.filter(function(s) { return isObj(s) && typeof s.key === 'string' && s.key.toLowerCase() === m[1].toLowerCase(); })[0] : null;
    var lb = hit && typeof hit.label === 'string' ? hit.label.trim() : '';
    return lb ? lb.slice(0, 40) : 'durability';
}
function dmgDiceRead(d) {   // 1.6.0: whether these rules read the dice a blow rolled (the window asks for them only then)
    if (!isObj(d)) return false;
    if (isObj(d.locs) && !!cleanFormulaText(d.locs.die)) return true;
    return (Array.isArray(d.types) ? d.types : []).some(function(y) { return isObj(y) && DMG_DIE.some(function(k) { return dmgNum(y[k[0]], k[1], 10, 0) !== 0; }); });
}
function cleanDamageRules(d, kinds, resIds, fl, pl) {
    if (!isObj(d)) return null;
    var isList = function(id) { return typeof id === 'string' && FIELD_ID.test(id) && !!kinds && kinds[id] === 'item-list'; }, isPool = function(id) { return typeof id === 'string' && !!resIds && resIds[id] === 1; };
    var fx = function(s) { return pl ? '' : cleanFormulaText(s) || ''; };
    var out = {}; if (isPool(d.pool)) out.pool = d.pool;
    if (typeof d.first === 'string' && ((FIELD_ID.test(d.first) && !!kinds && kinds[d.first] === 'number') || (d.first.indexOf('fx:') === 0 && EFFECT_ID.test(d.first.slice(3))))) out.first = d.first;   // 1.6.2 (the CORE session): or an effect that holds a number (fx:<id>), judged by cleanSystem once the effects are known   // 1.6.2 (temporary hit points; the rule modules session's ask): a number a wound to the main pool comes off first
    if (out.first && d.firstSoaks === true) out.firstSoaks = true;   // 1.6.2 (the CORE session): what the number takes is no wound, the same in both views
    var mj = fx(d.major); if (mj) out.major = mj;
    var wfS = fx(d.woundF); if (wfS) out.woundF = wfS; if (!pl && d.zero === 'none') out.zero = 'none';   // 1.6.2: a wound by a formula for every type, and what a wound of 0 does (absent: armor still wears)
    var mjw = cutText(d.majorWord, LIMITS.label); if (mjw) out.majorWord = mjw;   // 1.6.0 Major Wound is called: a system's own word for the step, the same in both views, read by majorWords alone (absent: A Major Wound)
    if (mj && !pl && isObj(d.onMajor) && !Array.isArray(d.onMajor)) { var om = {}, omIf = cleanFormulaText(d.onMajor.if); if (omIf) om.if = omIf; if (typeof d.onMajor.fx === 'string' && EFFECT_ID.test(d.onMajor.fx)) om.fx = d.onMajor.fx; if (typeof d.onMajor.roll === 'string' && ROLL_ID.test(d.onMajor.roll)) om.roll = d.onMajor.roll; if (om.fx || om.roll) out.onMajor = om; }
    if (isObj(d.locs) && isList(d.locs.list)) {
        var lc = { list: d.locs.list };
        if (!pl) { var dr = dmgNameOk(fl, lc.list, d.locs.dr); if (dr) lc.dr = dr; var cr = dmgNameOk(fl, lc.list, d.locs.crip); if (cr) lc.crip = cr; var vt = fx(d.locs.vital); if (vt) lc.vital = vt; var lm = fx(d.locs.mult); if (lm) lc.mult = lm; var ldi = fx(d.locs.die); if (ldi) lc.die = ldi; }
        var lsd = dmgStatOk(fl, lc.list, d.locs.side); if (lsd) lc.side = lsd;   // 1.6.0 Sides of a location, in both views: a player's own sheet reads <Locs>.Left.<w>
        var lat = typeof d.locs.at === 'string' ? cutText(d.locs.at, 60) : ''; if (lat) lc.at = lat;   // 1.6.3 (finding 27; Fulllion: "A system setting"): Unaimed blows land at, a location by its name or entry key, cleaned as a blast area's loc is, the same in both views (a player's own Take damage window opens on it too). Read by sheets.js dmgLocAt and wbblast.js torsoOf; absent, the usual rule
        out.locs = lc;
    }
    if (mj && !pl && Array.isArray(d.onMajor)) {   // 1.6.0: a list of rows, the first that holds is what a Major Wound does
        var oms = []; d.onMajor.forEach(function(w) {
            if (oms.length >= DMG_LIM.onMajor || !isObj(w)) return;
            var mw = {}, mif = cleanFormulaText(w.if); if (mif) mw.if = mif;
            if (typeof w.fx === 'string' && EFFECT_ID.test(w.fx)) mw.fx = w.fx;
            if (typeof w.roll === 'string' && ROLL_ID.test(w.roll)) { mw.roll = w.roll; if (out.locs) { var mwc = dmgStatOk(fl, out.locs.list, w.crip); if (mwc) { mw.crip = mwc; var mwb = cleanFormulaText(w.cripBy); if (mwb) mw.cripBy = mwb; } } var mwr = cleanCrew(w.crew); if (mwr) mw.crew = mwr; }   // 1.6.2 (fold (f)): its roll to the crew at these stations
            if (mw.roll && w.asAt === true) mw.asAt = true;   // 1.6.2: its roll on the sheet as it stood at this row
            if (mw.fx || mw.roll) oms.push(mw);
        }); if (oms.length) out.onMajor = oms;
    }
    if (out.onMajor && !Array.isArray(out.onMajor) && out.onMajor.roll && d.onMajor.asAt === true) out.onMajor.asAt = true;
    if (out.onMajor && !Array.isArray(out.onMajor) && out.onMajor.roll) { var omr = cleanCrew(d.onMajor.crew); if (omr) out.onMajor.crew = omr; }   // 1.6.2 (fold (f))   // 1.6.2: its roll on the sheet as it stood here
    if (out.onMajor && !Array.isArray(out.onMajor) && out.onMajor.roll && out.locs) { var omc = dmgStatOk(fl, out.locs.list, d.onMajor.crip); if (omc) { out.onMajor.crip = omc; var omb = cleanFormulaText(d.onMajor.cripBy); if (omb) out.onMajor.cripBy = omb; } }   // 1.6.0 (the core's gap 7): the location its roll's failure cripples, and by how much
    if (!pl && Array.isArray(d.onWound)) {   // 1.6.0 (the core's gap 6): what any wound does
        var ows = []; d.onWound.forEach(function(w) {
            if (ows.length >= DMG_LIM.onWound || !isObj(w)) return;
            var ow = {}, wif = cleanFormulaText(w.if); if (wif) ow.if = wif;
            if (typeof w.fx === 'string' && EFFECT_ID.test(w.fx)) ow.fx = w.fx;
            if (typeof w.roll === 'string' && ROLL_ID.test(w.roll)) { ow.roll = w.roll; if (out.locs) { var owc = dmgStatOk(fl, out.locs.list, w.crip); if (owc) { ow.crip = owc; var owb = cleanFormulaText(w.cripBy); if (owb) ow.cripBy = owb; } } var owr = cleanCrew(w.crew); if (owr) ow.crew = owr; }   // 1.6.2 (fold (f)): its roll to the crew at these stations
            var owh = cleanHeld(w.held, fl); if (owh) ow.held = owh;   // 1.6.0: what stands where the blow lands
            if (w.any === true) ow.any = true; if (ow.roll && w.asAt === true) ow.asAt = true;   // 1.6.2: on every blow that lands; its roll on the sheet as it stood at this row
            if (isObj(w.add) && typeof w.add.entry === 'string' && ITEM_ID.test(w.add.entry)) { var owL = fl ? fl(w.add.list) : null; if (owL && owL.kind === 'item-list') ow.add = { list: owL.id, entry: w.add.entry }; }   // 1.6.2: a wound adds a row of a list, standing where the blow struck
            if (ow.fx || ow.roll || (ow.held && ow.held.stat) || ow.add) ows.push(ow);
        }); if (ows.length) out.onWound = ows;
    }
    var seen = map(), types = [];
    (Array.isArray(d.types) ? d.types : []).forEach(function(y) {
        if (types.length >= DMG_LIM.types || !isObj(y) || typeof y.key !== 'string' || !STAT_KEY.test(y.key) || seen[lower(y.key)]) return; seen[lower(y.key)] = 1;
        var o = { key: y.key, label: cutText(y.label, LIMITS.label) || y.key };
        if (isPool(y.pool)) o.pool = y.pool;
        if (!pl) {
            o.mult = dmgNum(y.mult, 0, DMG_LIM.mult, 1);
            var vm = dmgNum(y.vital, 0, DMG_LIM.mult, 0); if (vm > 0) o.vital = vm;
            var pls = []; if (out.locs) (Array.isArray(y.plus) ? y.plus : []).forEach(function(k) { var n = dmgNameOk(fl, out.locs.list, k); if (n && pls.indexOf(n) < 0 && pls.length < DMG_LIM.plus) pls.push(n); }); if (pls.length) o.plus = pls;
            if (y.noDr === true) o.noDr = true;
            if (isObj(y.alt)) { var ai = cleanFormulaText(y.alt.if); if (ai) { var al = { if: ai }; if (isPool(y.alt.pool)) al.pool = y.alt.pool; if (typeof y.alt.mult === 'number' && fin(y.alt.mult)) al.mult = dmgNum(y.alt.mult, 0, DMG_LIM.mult, 1); if (y.alt.noWear === true) al.noWear = true; o.alt = al; } }
            if (o.alt && Array.isArray(y.alts)) { var als = []; y.alts.slice(0, 8).forEach(function(x) { if (als.length >= 3 || !isObj(x)) return; var xi = cleanFormulaText(x.if); if (!xi) return; var xa = { if: xi }; if (isPool(x.pool)) xa.pool = x.pool; if (typeof x.mult === 'number' && fin(x.mult)) xa.mult = dmgNum(x.mult, 0, DMG_LIM.mult, 1); if (x.noWear === true) xa.noWear = true; als.push(xa); }); if (als.length) o.alts = als; }   // 1.6.2 (the CORE session): more alternatives, the first that holds wins (lightning on a robot, and on a hull)
            if (y.noWear === true) o.noWear = true;
            if (y.cuts === true) o.cuts = true;
            var ywf = cleanFormulaText(y.woundF); if (ywf) o.woundF = ywf; else if (y.byMult === true) o.byMult = true;   // 1.6.2: its own wound formula, or its multiplier in place of the system's
            DMG_DIE.forEach(function(k) { var dv = dmgNum(y[k[0]], k[1], 10, 0); if (dv) o[k[0]] = dv; });   // 1.6.0: its figures a die
        }
        types.push(o);
    });
    if (types.length) out.types = types;
    var kseen = map(), dkinds = [];   // 1.6.0 (asked by the session that builds a game system): the kinds of blow the system names, in both views, as its damage types are named. No kind ships with the app, and a system with none has no key
    (Array.isArray(d.kinds) ? d.kinds : []).forEach(function(y) {
        if (dkinds.length >= DMG_LIM.kinds || !isObj(y) || typeof y.key !== 'string' || !STAT_KEY.test(y.key) || kseen[lower(y.key)]) return; kseen[lower(y.key)] = 1;
        dkinds.push({ key: y.key, label: cutText(y.label, LIMITS.label) || y.key });
    });
    if (dkinds.length) out.kinds = dkinds;
    if (!pl) {
        var lys = []; (Array.isArray(d.layers) ? d.layers : []).forEach(function(l) {
            if (lys.length >= DMG_LIM.layers || !isObj(l) || !isList(l.list)) return;
            var at = cleanFormulaText(l.at), w = dmgStatOk(fl, l.list, l.wear); if (!at || !w) return;
            var lo = { list: l.list, at: at, wear: w }, ws = [], pk = cleanFormulaText(l.pick);   // 1.6.0: the stat worn by location
            (Array.isArray(l.wears) ? l.wears : []).forEach(function(k) { var n = dmgStatOk(fl, l.list, k); if (n && ws.indexOf(n) < 0 && ws.length < DMG_LIM.wears) ws.push(n); });
            if (ws.length && pk && l.whole !== true) { lo.wears = ws; lo.pick = pk; }
            LAYER_WEAR.forEach(function(k) { var wt = cleanFormulaText(l[k]); if (wt) lo[k] = wt; });   // 1.6.0: what a hit wears, by formula (layerStep)
            var adB = cleanFormulaText(l.adBy); if (adB) lo.adBy = adB;   // 1.6.2 (the CORE session's batch 6, 9): its own divisor (adSplit)
            if (isObj(l.typed)) { var tyS = dmgStatOk(fl, l.list, l.typed.stat), tyP = cleanFormulaText(l.typed.plus), tyN = l.typed.stat === undefined || l.typed.stat === ''; if (tyP && (tyS || tyN)) lo.typed = tyS ? { stat: tyS, plus: tyP } : { plus: tyP }; }   // 1.6.0: Type named by, a stat and a formula; or the formula alone, which reads Blow.type for each part, so one row can stand against a family of types
            if (l.anyRow === true) lo.anyRow = true;   // 1.6.0: Every row, switched on or not (a location's switch may be the GM's own)
            if (l.whole === true) { lo.whole = true; if (l.anyPool === true) lo.anyPool = true; }   // 1.6.0: Every location, one figure and one wear stat (layerCap), and Any pool: a part wears it whichever pool it took
            lys.push(lo);
        }); if (lys.length) out.layers = lys;
        var wps = []; (Array.isArray(d.weapons) ? d.weapons : []).forEach(function(l) {
            if (wps.length >= DMG_LIM.weapons || !isObj(l) || !isList(l.list)) return;
            var du = cleanFormulaText(l.dur), w = dmgStatOk(fl, l.list, l.wear), c = dmgStatOk(fl, l.list, l.cond); if (!du || !w || !c) return;
            var wo = { list: l.list, dur: du, wear: w, cond: c }; if (l.test === 'listed') wo.test = 'listed'; if (l.heavy === 'zero') wo.heavy = 'zero';   // 1.6.0 (asked by a campaign build's session): how a blow is judged, each absent as before
            var wwd = cutText(l.word, LIMITS.label); if (wwd) wo.word = wwd; wps.push(wo);   // 1.6.3: what the damage line calls its durability (Called), absent where empty
        }); if (wps.length) out.weapons = wps;
    } else {   // the window offers the weapons the blow may test; the host reads their Dur
        var wpl = []; (Array.isArray(d.weapons) ? d.weapons : []).forEach(function(l) { if (wpl.length < DMG_LIM.weapons && isObj(l) && isList(l.list)) { var wpo = { list: l.list }, wpw = cutText(l.word, LIMITS.label); if (wpw) wpo.word = wpw; wpl.push(wpo); } }); if (wpl.length) out.weapons = wpl;   // 1.6.3: its Called word too, which a player's own Take damage window says
        if (dmgDiceRead(d)) out.dice = true;   // 1.6.0: the window asks a player for the dice the blow rolled, and the host works out what they do
    }
    return out.pool || out.types || out.locs || out.onWound ? out : null;
}
// What a blow does: the pure step, the same on the host and on the GM's own screen. inp = { amt, type, loc, ad, weapon, only }: the damage rolled,
// the type's key, the hit location's row id, the armor divisor (1: none), a weapon row tested by the blow and whether only that weapon was hit.
// 1.6.0: inp.dice, the dice the blow rolled (0 to 100, absent 0), read by the figures a die of the type and the location (info.dice, info.dieAdd).
// Returns { ok, values, lines, info } — values: the fields changed (the pool, each list a row of which wore), lines: what it did in words, info:
// the figures — or { ok: false, reason }. The rule (the handbook's own order): DR at the location (typed DR added, divided by the armor divisor,
// rounded down), what gets through times the type's multiplier (its vital one at a vital location), at least 1 when anything gets through, off
// the type's pool; a Major Wound where the formula says; each worn layer at the location loses 1 of its listed figure, or a quarter of it rounded
// up on a Major Wound, down to minus its listed figure; a weapon's Dur less the damage: 1 to 10 over wears it 1 and makes it Damaged, 11 to 19
// takes it one condition down, 20 or more destroys it where the type cuts and else takes it one condition down (conditions 0 Fine, 1 Damaged,
// 2 Broken, 3 Destroyed)
function dmgRowPut(row, key, v) {   // a row's own stat: a library or system row's own values (held as the GM's), a row of the character's own its own
    if (isObj(row.def) && typeof row.defId !== 'string') { row.def.stats = isObj(row.def.stats) ? row.def.stats : {}; row.def.stats[key] = v; return; }
    row.ov = isObj(row.ov) ? row.ov : {}; row.ov.stats = isObj(row.ov.stats) ? row.ov.stats : {}; row.ov.stats[key] = v;
    var held = Array.isArray(row.ov.held) ? row.ov.held : []; if (!held.some(function(h) { return lower(h) === lower(key); })) held.push(key); row.ov.held = held;
}
var DMG_CONDS = ['Fine', 'Damaged', 'Broken', 'Destroyed'];
// 1.6.0: an onWound row's held, the rows of its list at the struck location, each read with its own Row.* over the names the row's if reads, on the
// values the step has written so far, so a row of onWound reads what the row before it did. A row kept from its player counts for nothing
function heldRows(sys, char, values, h, wR, ev, yes, F, ropts) {
    var f = fieldById(sys, h.list), wk = Object.assign({}, char, { values: Object.assign({}, char.values || {}, values) }), src = f && Array.isArray(wk.values[f.id]) ? wk.values[f.id] : [], rows = [], vv = null;
    try { vv = makeResolver(sys, wk, F, ropts); } catch (e) { vv = null; } if (!vv) return { f: f, rows: rows };
    src.forEach(function(r) {
        var rid = isObj(r) && r.hid !== 1 ? rowIdOf(r) : '', rv = null; if (!rid) return;
        try { rv = vv.row(f.id, rid); } catch (e) { rv = null; } if (typeof rv !== 'function') return;
        var rr = function(l, text) { return ROW_NAME.test(String(l)) ? rv(l, text) : wR(l, text); };
        if (yes(ev(h.at, rr))) rows.push({ id: rid, rr: rr });
    });
    return { f: f, rows: rows };
}
function heldWrite(sys, char, values, h, hd, ev, lines) {   // to on each row at the location, as a blow writes a row's stat: said by the row's name unless the row is the GM's
    if (!hd.f || !hd.rows.length) return;
    var list = JSON.parse(JSON.stringify(Array.isArray(values[hd.f.id]) ? values[hd.f.id] : char.values[hd.f.id])), changed = false, n = hd.rows.length;
    hd.rows.forEach(function(e) {
        var rr = function(l, text) { return l === 'held.count' ? n : e.rr(l, text); }, v = ev(h.to, rr); v = typeof v === 'boolean' ? (v ? 1 : 0) : v; if (typeof v !== 'number' || !fin(v)) return;
        var row = list.filter(function(r) { return isObj(r) && rowIdOf(r) === e.id; })[0], rd = row ? rowDef(sys, Object.assign({}, row)) : null; if (!row || !rd || !isObj(rd.def)) return;
        var was = rowStat(hd.f.list, rd.def, h.stat), nv = clampNum(v, -LIMITS.statAbs, LIMITS.statAbs); if (typeof was === 'number' && was === nv) return;
        dmgRowPut(row, h.stat, nv); changed = true;
        var gmHd = gmStatKeys(sys);
        if (hd.f.vis !== 'gm' && rd.def.vis !== 'gm' && !(gmHd && gmHd[lower(h.stat)] === 1)) { var st = (Array.isArray(hd.f.list.stats) ? hd.f.list.stats : []).filter(function(s) { return isObj(s) && s.key === h.stat; })[0], rd2 = rowDef(sys, row), wd = rd2 && isObj(rd2.def) ? statName(hd.f.list, rd2.def, h.stat) : ''; lines.push((rd.def.name || 'A row') + ': ' + ((st && st.label) || h.stat) + ' ' + (wd || nv) + '.'); }
    });
    if (changed) values[hd.f.id] = list;
}
// 1.6.0: which of onMajor's rows a Major Wound does, the one judge: a single onMajor where its if holds (absent: holds), else the first row of a
// list whose if holds; null for none. ev(text, vars) works a formula out, vars reads the blow and the location hit as an onWound row's does
function majorWords(rules) { var w = rules && typeof rules.majorWord === 'string' ? rules.majorWord.trim() : ''; return w || 'A Major Wound'; }   // 1.6.0: what a system calls a Major Wound, as a player and the GM read it
function majPick(om, ev, vars) {
    var holds = function(w) { if (!isObj(w)) return false; if (typeof w.if !== 'string' || !w.if) return true; var v = ev(w.if, vars); return v === true || (typeof v === 'number' && fin(v) && v !== 0); };
    if (Array.isArray(om)) { for (var i = 0; i < om.length && i < DMG_LIM.onMajor; i++) if (holds(om[i])) return om[i]; return null; }
    return isObj(om) && holds(om) ? om : null;
}
// 1.6.0 (B3): what a Major Wound does, into the step's own values and lines: its effect switched on through applyEffectOp (with the values the
// blow has written so far, so a pool the effect brings down is brought down from the wounded figure), and its roll named in info.majorRoll for
// the caller to post (wpSheets.majorFollow). Nothing where the system has no such effect or roll, or the effect is already on
// 1.6.2: a copy of the step's writes so far, a key it took away kept as undefined, for a roll an onWound row ticked asAt posts
function valsAt(values) { var o = {}; Object.keys(values).forEach(function(k) { o[k] = values[k] === undefined ? undefined : JSON.parse(JSON.stringify(values[k])); }); return o; }
// 1.6.2 (backlog 242): a copy of one value as JSON keeps it, undefined kept as undefined (JSON would throw on it)
function cpVal(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
// 1.6.2 (backlog 242): whether any roll of the system runs When a value crosses ticked Reads the sheet as the blow left it (cross.asAt). Only then
// does the damage step work out what such a roll reads and hand it to the blow sink, so a system with none works and answers exactly as before
function asAtCross(sys) { return isObj(sys) && Array.isArray(sys.rolls) && sys.rolls.some(function(r) { return isObj(r) && isObj(r.cross) && r.cross.asAt === true && !Array.isArray(r.apply); }); }
// 1.6.2 (bleeding; the owner, by prompt: "A wound adds a row"; the CORE session: each wound counted, tagged by where it started, each tag with its own
// stops): an Any wound row's add { list, entry } adds one row of that entry to that list, as a result table's row does (resultAdd), and where the list's
// rows stand at a row of the hit locations' list (stand.from), the new row stands at the location struck. One row a blow. Its tag is where it stands
// (At.<w>), its cost the list's Keeps paying, and a row's own action takes it off. info.woundAdd names each list it added to
function woundAdd(sys, char, values, ad, hit, lines, info) {
    var work = Object.assign({}, char, { values: Object.assign({}, isObj(char) && isObj(char.values) ? char.values : {}, values) }), r = resultAdd(sys, work, { list: ad.list, entry: ad.entry });
    if (!r || r.none || !Array.isArray(work.values[r.f])) return;
    var L = work.values[r.f].slice(), last = L.length - 1, tf = fieldById(sys, r.f), st = tf && isObj(tf.list) && isObj(tf.list.stand) ? tf.list.stand : null;
    if (hit && st && st.from === hit.f && last >= 0 && isObj(L[last])) L[last] = Object.assign({}, L[last], { pl: hit.r });
    values[r.f] = L; if (r.line && typeof r.line.say === 'string') lines.push(r.line.say); (info.woundAdd = info.woundAdd || []).push(r.f);
}
function dmgOnMajor(sys, char, om, values, lines, info, F, fxo, wnd, pre) {   // wnd (1.6.0, the core's gap 6): an onWound entry, its roll and effect named in info.woundRolls and info.woundFx   // pre (1.6.2, backlog 242): told each key the effect is about to write, before it does, so the step can tell a crossing's roll what the sheet held before any effect of the blow
    if (!isObj(om)) return;
    if (typeof om.roll === 'string' && (Array.isArray(sys.rolls) ? sys.rolls : []).some(function(r) { return isObj(r) && r.id === om.roll; })) { if (wnd) (info.woundRolls = info.woundRolls || []).push(om.roll); else info.majorRoll = om.roll; }
    if (typeof om.fx !== 'string') return;
    var def = null; (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(e) { if (!def && isObj(e) && e.id === om.fx) def = e; }); if (!def) return;
    var wk = Object.assign({}, char, { values: Object.assign({}, char.values || {}, values) }), fxF = null, fxRow = null;
    var fxs = sys.fields.filter(function(x) { return isObj(x) && x.kind === 'effects' && typeof x.id === 'string'; });
    fxs.forEach(function(x) { (Array.isArray(wk.values[x.id]) ? wk.values[x.id] : []).forEach(function(r0) { if (!fxRow && isObj(r0) && r0.ref === def.id) { fxRow = r0; fxF = x; } }); });
    if (!fxF) fxF = fxs[0] || null; var wasOn = !!fxRow && fxRow.on !== false; if (!fxF || (wasOn && FX_AGAIN[def.again] !== 1)) return;   // 1.6.0: already on, it moves only by its When added again
    var rows = Array.isArray(wk.values[fxF.id]) ? wk.values[fxF.id] : [], rid = fxRow && typeof fxRow.id === 'string' ? fxRow.id : '';
    if (!rid) { var bse = ('x_' + def.id.slice(2)).slice(0, 20), n = 0; rid = bse; while (rows.some(function(r0) { return isObj(r0) && r0.id === rid; })) rid = bse + '_' + (++n); }
    var eo = applyEffectOp(sys, wk, fxF.id, { op: 'add', rowId: rid, ref: def.id }, F, { now: isObj(fxo) && typeof fxo.now === 'number' ? fxo.now : 0, inCombat: !!(isObj(fxo) && fxo.inCombat) });
    if (!eo.ok) return;
    if (typeof pre === 'function') { pre(fxF.id); if (isObj(eo.clamp)) Object.keys(eo.clamp).forEach(function(k) { pre(k); }); }   // 1.6.2 (242): the effects list and any pool it clamps, as they stood before this effect
    values[fxF.id] = eo.value; if (isObj(eo.clamp)) Object.keys(eo.clamp).forEach(function(k) { values[k] = eo.clamp[k]; });
    if (wasOn) { lines.push(eo.againSays || (def.name || 'An effect') + ' added again.'); return; }
    if (wnd) (info.woundFx = info.woundFx || []).push(def.id); else info.majorFx = def.id; lines.push((def.name || 'An effect') + ' goes on.');
}
// 1.6.0 (the core's gaps 6 and 7): the blow a roll the damage step posts answers, laid on its token context by the host from its own record
// (never a player's word): Blow.dmg, Blow.through, Blow.wound, Blow.type and Blow.cuts, and hit, the location struck ({ f, r }), read as Hit.<name>
// Blow.major (1.6.0, asked by the campaign build's session): 1 where the step judged the blow a Major Wound, by its size or by the card's mark, else 0
// 1.6.0: Blow.type2, wound2, type3, wound3, type4, wound4, type5 and wound5, each added part's type (its place in the types, 1 the first, 0 with none) and its
// wound, by its slot; 0 where the blow has no such part, so an Any wound row can fire for a part's own type
// 1.6.0: Blow.kind, the blow's kind (its place in the system's kinds, 1 the first, 0 none), and kind2 to kind5, each added part's, its own else the first part's
// 1.6.2 big: 1 where the attack that called this damage landed as a heavy hit (its success inside its Lands as a heavy hit range), carried by the call's
// record to the damage roll it posted; the damage is then a Major Wound so long as some of it gets through (the book: "if it injures at all"), else 0
var BLOW_NAMES = Object.freeze({ dmg: 1, through: 1, wound: 1, first: 1, type: 1, cuts: 1, major: 1, big: 1, type2: 1, wound2: 1, type3: 1, wound3: 1, type4: 1, wound4: 1, type5: 1, wound5: 1, kind: 1, kind2: 1, kind3: 1, kind4: 1, kind5: 1 });
// 1.6.2 (the CORE session's batch 6, 13): Blow.arc.<key>, 1 where the blow came from that arc of the target's facing (the system's own arcs). A blow carries one
// key a named arc, arc.<its key in lower case>, only where its card said where the attacker stood (the range's tb), so a blow of none is what it was
function blowArcKey(k) { return typeof k === 'string' && /^arc\.[a-z][a-z0-9]{0,39}$/.test(k); }
function blowNamed(k) { return BLOW_NAMES[k] === 1 || blowArcKey(k); }
function blowArcs(sys, tb, o) { var arcs = isObj(sys) && isObj(sys.combat) && Array.isArray(sys.combat.arcs) ? sys.combat.arcs : null; if (!arcs || typeof tb !== 'number' || !fin(tb)) return o; arcs.forEach(function(a) { if (isObj(a) && typeof a.key === 'string' && blowArcKey('arc.' + lower(a.key))) o['arc.' + lower(a.key)] = arcHolds(a, tb) ? 1 : 0; }); return o; }
function withBlow(tctx, b) {
    var o = {}; if (!isObj(b)) b = {};
    Object.keys(BLOW_NAMES).forEach(function(k) { o[k] = k === 'cuts' || k === 'major' || k === 'big' ? (b[k] === true || b[k] === 1 ? 1 : 0) : fin(b[k]) ? Math.max(-1e6, Math.min(1e6, b[k])) : 0; });
    var nA = 0; Object.keys(b).forEach(function(k) { if (blowArcKey(k) && nA < ARC_MAX) { o[k] = b[k] === 1 || b[k] === true ? 1 : 0; nA++; } });   // 1.6.2 (13): the arc it came from
    if (isObj(b.hit) && typeof b.hit.f === 'string' && typeof b.hit.r === 'string') o.hit = { f: b.hit.f, r: b.hit.r };
    return Object.assign({}, isObj(tctx) ? tctx : {}, { blow: o });
}
// 1.6.0 (the core's gap 7): a failed roll the step posted cripples the location the blow struck: crip, a number stat of the location list, set
// to n (how far the roll failed, at least 1) on that row of char's, as the step writes a row's own stat. { values } or null where the system
// has no such stat or the row is not there
// ... and what cripBy writes: its whole number, read with Margin, Natural and the blow's names alone, no dice; null where it gives no number.
// 1.6.0: sys, where the caller hands it, adds Type.<key>, a damage type's place, and Kind.<key>, a kind's, so Blow.type and Blow.kind are compared by name (placeName)
function blowCripN(text, margin, natural, b, F, sys) {
    if (typeof text !== 'string' || !text || !F || typeof F.evaluate !== 'function') return null;
    var bw = isObj(b) ? b : {}, r = F.evaluate(text, { vars: function(n) { var l = lower(n); if (l === 'margin') return fin(margin) ? margin : 0; if (l === 'natural') return fin(natural) ? natural : 0; if (l.indexOf('blow.') === 0 && blowNamed(l.slice(5))) return l === 'blow.cuts' || l === 'blow.major' || l === 'blow.big' || blowArcKey(l.slice(5)) ? (bw[l.slice(5)] === true || bw[l.slice(5)] === 1 ? 1 : 0) : fin(bw[l.slice(5)]) ? bw[l.slice(5)] : 0; if (isObj(sys) && (l.indexOf('type.') === 0 || l.indexOf('kind.') === 0)) return placeName(sys, l); return undefined; }, random: noDice });
    var v = r && r.ok ? (typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value) : null; return typeof v === 'number' && fin(v) ? Math.floor(v) : null;
}
function blowCripOf(sys, char, b, crip, n) {
    var rules = isObj(sys) && isObj(sys.combat) && isObj(sys.combat.damage) ? sys.combat.damage : null, lc = rules && isObj(rules.locs) ? rules.locs : null;
    if (!lc || !isObj(b) || !isObj(b.hit) || b.hit.f !== lc.list || typeof crip !== 'string' || !isObj(char) || !isObj(char.values)) return null;
    var f = fieldById(sys, lc.list), st = f && isObj(f.list) && Array.isArray(f.list.stats) ? f.list.stats.filter(function(s) { return isObj(s) && s.kind !== 'pick' && lower(s.key) === lower(crip); })[0] : null; if (!st) return null;
    var src = Array.isArray(char.values[f.id]) ? char.values[f.id] : null; if (!src || !src.some(function(r) { return rowIdOf(r) === b.hit.r; })) return null;
    var list = JSON.parse(JSON.stringify(src)), row = list.filter(function(r) { return rowIdOf(r) === b.hit.r; })[0], v = Math.max(1, Math.min(1e6, Math.floor(fin(n) ? Math.abs(n) : 1)));
    dmgRowPut(row, st.key, v); var out = {}, rd = rowDef(sys, row); out[f.id] = list; return { values: out, n: v, name: locNamed(sys, f, rd && rd.def, rd && rd.def && typeof rd.def.name === 'string' && rd.def.name ? rd.def.name : 'The location') };
}
// 1.6.0 Spills into (the owner, by prompt, 2026-10-29: "The pool's own option", "A pick, with a formula"): a pool's spill, { to, at, below }.
// What a loss takes it past its spill point goes on into the pool to, and on from that one where it spills too, each pool once. at: absent, its
// least value; 'neg', minus its full value; 'f', the formula below (the character's names, no dice). The pool's own value stays where its least
// value holds it. Only a loss spills: the damage step's wound and an apply action's Subtract (its each-round, each-turn and time-rule runs too);
// a value typed, a Set to, an Add and an effect's clamp never do, and what spills is no wound (no Major Wound, no wear). spillPast: how much of
// loss goes on, from cur as R read it, or { error }. poolSpill: each pool it reaches, written onto w.values (a working copy, its values as the
// loss left them): { steps: [{ f, label, amt, v, value }] } or { error }
// 1.6.0: a pool's least value, the one judge wherever it is read: minus its full value (max, as worked out) where it is ticked minNeg, else
// its min. A minNeg pool whose max is not known has no least value here (undefined): nothing is clamped below
function poolLeast(pf, max) { if (isObj(pf) && pf.minNeg === true) return typeof max === 'number' && fin(max) ? (max ? -max : 0) : undefined; return isObj(pf) && typeof pf.min === 'number' && fin(pf.min) ? pf.min : 0; }
function spillPast(pf, cur, loss, R, F) {
    var sp = isObj(pf) && isObj(pf.spill) ? pf.spill : null; if (!sp || !(loss > 0) || typeof cur !== 'number' || !fin(cur)) return 0;
    var at = null;
    if (sp.at === 'neg') { var mx = R(pf.key + '.max'); if (typeof mx === 'number' && fin(mx)) at = -mx; }
    else if (sp.at === 'f') { var ev = F.evaluate(sp.below, { vars: R, random: noDice }); if (ev && ev.ok && typeof ev.value === 'number' && fin(ev.value)) at = ev.value; }
    else { var mxL = pf.minNeg === true ? R(pf.key + '.max') : null; at = poolLeast(pf, mxL); if (at === undefined) at = null; }
    if (at === null) return { error: 'Where ' + (pf.label || pf.key) + ' spills could not be worked out.' };
    var left = cur - loss; return left >= at ? 0 : Math.max(0, Math.round(Math.min(loss, at - left)));
}
function poolSpill(sys, w, pf, cur, loss, F, tctx) {
    var steps = [], seen = map(), f = pf, c = cur, l = loss; seen[pf.id] = 1;
    for (var hop = 0; hop < LIMITS.fields && isObj(f) && isObj(f.spill); hop++) {
        var n = spillPast(f, c, l, makeResolver(sys, w, F, tctx || null), F); if (isObj(n)) return n; if (!(n > 0)) break;
        var tf = fieldById(sys, f.spill.to); if (!tf || tf.kind !== 'resource' || seen[tf.id] === 1) break; seen[tf.id] = 1;
        var Rt = makeResolver(sys, w, F, tctx || null), ct = Rt(tf.key); ct = typeof ct === 'number' && fin(ct) ? ct : 0;
        var ed = applyEdit(sys, w, tf.id, { cur: ct - n }, F, { vars: Rt }); if (!ed.ok) return { error: 'It could not spill into ' + (tf.label || tf.key) + '.' };
        w.values[tf.id] = ed.value; steps.push({ f: tf.id, label: tf.label || tf.key, amt: n, v: ed.value.cur, value: ed.value });
        f = tf; c = ct; l = n;
    }
    return { steps: steps };
}
function damageStep(sys, char, inp, F, ropts, fxo, wl) {   // 1.6.0 (B3): fxo, the clock an effect a Major Wound switches on starts its timer by ({ now, inCombat }, as applyAct's); wl (1.6.0, a burst): a list told each wear this blow writes (damageBurst)
    var rules = sys && isObj(sys.combat) && isObj(sys.combat.damage) ? sys.combat.damage : null; if (!rules || !F || !isObj(char)) return { ok: false, reason: 'field' };
    if (!isObj(inp) || typeof inp.amt !== 'number' || !fin(inp.amt) || inp.amt < 0 || inp.amt > DMG_LIM.amt) return { ok: false, reason: 'value' };
    if (inp.big === true && inp.major !== true) inp = Object.assign({}, inp, { major: true });   // 1.6.2: an attack's heavy hit is a Major Wound if it injures at all
    var pIn = [];   // 1.6.0 (B3): the added parts of the same blow, each of another type: inp.part2, part3, part4 and part5, { amt, type, ad, dice }, by slot
    [2].concat(DMG_MORE).forEach(function(k) { var pk = isObj(inp['part' + k]) ? inp['part' + k] : null; if (pk) pIn.push({ k: k, p: pk }); });
    if (pIn.some(function(x) { var p2 = x.p; return typeof p2.amt !== 'number' || !fin(p2.amt) || p2.amt < 0 || p2.amt > DMG_LIM.amt; })) return { ok: false, reason: 'value' };
    var amt = Math.floor(inp.amt), ad = typeof inp.ad === 'number' && fin(inp.ad) && inp.ad > 0 ? clampNum(inp.ad, 0.1, 100) : 1;
    var dice = typeof inp.dice === 'number' && fin(inp.dice) && inp.dice > 0 ? Math.min(DMG_LIM.dice, Math.floor(inp.dice)) : 0;   // 1.6.0: the dice the blow rolled
    var R = makeResolver(sys, char, F, ropts), num = function(v) { return typeof v === 'number' && fin(v) ? v : 0; }, yes = function(v) { return v === true || (typeof v === 'number' && v !== 0); };
    var ev = function(text, vars) { var r = F.evaluate(text, { vars: vars, random: noDice }); return r && r.ok ? r.value : null; };
    var ty = null; (rules.types || []).forEach(function(y) { if (!ty && typeof inp.type === 'string' && lower(y.key) === lower(inp.type)) ty = y; });
    if (inp.type && !ty) return { ok: false, reason: 'value' };
    var kindL = Array.isArray(rules.kinds) ? rules.kinds : [], kindOf = function(k) { var o = null; kindL.forEach(function(y) { if (!o && isObj(y) && typeof k === 'string' && lower(y.key) === lower(k)) o = y; }); return o; };   // 1.6.0: the blow's kind, read by its place (Blow.kind)
    var kd = kindOf(inp.kind); if (inp.kind && !kd) return { ok: false, reason: 'value' };
    var pool = (ty && ty.pool) || rules.pool || (sys.combat.hpResource || ''), mult = ty ? (typeof ty.mult === 'number' ? ty.mult : 1) : 1, noWear = !!(ty && ty.noWear);
    var altOf = function(t) { var l = t && t.alt ? [t.alt].concat(Array.isArray(t.alts) ? t.alts : []) : []; for (var i = 0; i < l.length; i++) if (l[i] && yes(ev(l[i].if, R))) return l[i]; return null; };   // 1.6.2: Instead, if, and the alternatives after it, the first that holds
    var a1 = altOf(ty); if (a1) { if (a1.pool) pool = a1.pool; if (typeof a1.mult === 'number') mult = a1.mult; noWear = a1.noWear === true; }
    var pf = pool ? fieldById(sys, pool) : null; if (!pf || pf.kind !== 'resource') return { ok: false, reason: 'field' };
    var twos = [];   // 1.6.0 (B3): each added part, its own type, pool, multiplier, armor divisor and dice, in slot order (none: empty)
    for (var pi2 = 0; pi2 < pIn.length; pi2++) {
        var p2 = pIn[pi2].p, two;
        var ty2 = null; (rules.types || []).forEach(function(y) { if (!ty2 && typeof p2.type === 'string' && lower(y.key) === lower(p2.type)) ty2 = y; });
        if (p2.type && !ty2) return { ok: false, reason: 'value' };
        var kd2 = kindOf(p2.kind); if (p2.kind && !kd2) return { ok: false, reason: 'value' };   // 1.6.0: its own kind, else the first part's
        two = { amt: Math.floor(p2.amt), ad: typeof p2.ad === 'number' && fin(p2.ad) && p2.ad > 0 ? clampNum(p2.ad, 0.1, 100) : 1, dice: typeof p2.dice === 'number' && fin(p2.dice) && p2.dice > 0 ? Math.min(DMG_LIM.dice, Math.floor(p2.dice)) : 0, ty: ty2,
            pool: (ty2 && ty2.pool) || rules.pool || (sys.combat.hpResource || ''), mult: ty2 ? (typeof ty2.mult === 'number' ? ty2.mult : 1) : 1, noWear: !!(ty2 && ty2.noWear) };
        var a2 = altOf(ty2); if (a2) { if (a2.pool) two.pool = a2.pool; if (typeof a2.mult === 'number') two.mult = a2.mult; two.noWear = a2.noWear === true; }
        two.pf = two.pool ? fieldById(sys, two.pool) : null; if (!two.pf || two.pf.kind !== 'resource') return { ok: false, reason: 'field' };
        two.k = pIn[pi2].k; two.kd = kd2 || kd; twos.push(two);
    }
    var bAmt = amt + twos.reduce(function(a, t) { return a + t.amt; }, 0), bCuts = !!(ty && ty.cuts === true) || twos.some(function(t) { return !!(t.ty && t.ty.cuts === true); });   // 1.6.0 (B3): the blow, its parts together
    var values = {}, lines = [], info = { amt: amt, ad: ad, dr: 0, through: 0, wound: 0, pool: pf.key, major: false, crip: false, wear: [], weapon: null };
    // 1.6.2 (backlog 242; the CORE Master: the hit's own effects do not apply to the rolls the same hit calls for): where a roll of the system runs When a
    // value crosses ticked Reads the sheet as the blow left it (asAtCross), the step notes what the blow is: atB, its Blow.<name> and Hit.<name> as
    // info.blow says them, and fxPre, what each key an effect of this blow writes held just before the first effect wrote it (dmgOnMajor's pre). At
    // the end the sheet as the blow left it, before its effects, is every value the step wrote with those keys put back (atB.vals; with no effect
    // switched on it is the values as stored). It goes to the blow sink (setBlowSink), which sheets.js crossFollow reads once the change is stored;
    // a hit of a burst hands it to damageBurst instead (inBurst: wl, which the weapon's block below takes over as a variable of its own, read here)
    var xAt = asAtCross(sys), inBurst = Array.isArray(wl), atB = null, fxPre = null;
    var preFx = function(k) { if (!fxPre) fxPre = {}; if (hasOwn(fxPre, k)) return; fxPre[k] = hasOwn(values, k) ? cpVal(values[k]) : (isObj(char.values) && hasOwn(char.values, k) ? cpVal(char.values[k]) : undefined); };   // noted on every blow: a row's roll ticked asAt reads it too (below)
    if (dice) info.dice = dice; if (kd) info.kind = kd.key;
    var dWear = dice && ty && ty.dieWear > 0 && !noWear ? Math.floor(dice * ty.dieWear) : 0;   // 1.6.0: worn off each layer for good, by the dice
    twos.forEach(function(two) { if (two.dice && two.ty && two.ty.dieWear > 0 && !two.noWear) dWear += Math.floor(two.dice * two.ty.dieWear); });   // 1.6.0 (B3): and each added part's
    var lf = rules.locs ? fieldById(sys, rules.locs.list) : null, lrows = lf && char.values && Array.isArray(char.values[lf.id]) ? char.values[lf.id] : [], lrow = null;
    if (typeof inp.loc === 'string' && inp.loc) { lrows.forEach(function(r) { if (!lrow && rowIdOf(r) === inp.loc) lrow = r; }); if (!lrow) return { ok: false, reason: 'missing' }; }
    var hitV = lrow ? R.row(lf.id, inp.loc) : null, lname = '';
    var hitR = function(l, text) { if (/^hit\./.test(l)) return hitV ? hitV(l.replace(/^hit\./, 'row.'), text) : 0; return R(l, text); };   // 1.6.0 (B3): the Major Wound's threshold reads Hit.<name> of the location struck
    if (lrow) { var lrd = rowDef(sys, lrow); lname = locNamed(sys, lf, lrd && lrd.def, lrd && lrd.def && typeof lrd.def.name === 'string' ? lrd.def.name : 'the location'); }
    var err = '', getBy = function(Rx) { return function(f, row, key) { var v = Rx.cell(f, row, key); if (v === undefined) v = Rx.stat(f, row, key); if (isObj(v) && v.error) { err = err || String(v.error.message || 'an error'); return 0; } return num(v); }; }, get = getBy(R);
    // 1.6.0: what a formula judged for one part reads of the blow. The location's DR and each figure of it are read once a part, and a layer's figure once a part, each by a resolver of its own: Blow.kind and Blow.type read the PART judged,
    // so a second part of another type is stopped by what stops its own kind. Every other Blow. name is the whole blow's, as far as it is known then: at DR Blow.dmg, Blow.cuts and each slot's kindN and typeN, with through, wound and major 0, which are worked out after
    var typeAt = function(y) { return y ? (rules.types || []).indexOf(y) + 1 : 0; }, kindAt = function(y) { return y ? kindL.indexOf(y) + 1 : 0; };
    var blowKinds = function(o) { if (kd) o.kind = kindAt(kd); twos.forEach(function(t) { if (t.kd) o['kind' + t.k] = kindAt(t.kd); }); return blowArcs(sys, inp.tb, o); };   // 1.6.2 (13): and the arcs, where the card said where the attacker stood   // no key for a blow of no kind, so info.blow is what it always was
    var partR = function(P, o) { var b = Object.assign({}, o, { type: typeAt(P.ty) }); if (P.kd) b.kind = kindAt(P.kd); if (lrow) b.hit = { f: lf.id, r: inp.loc }; return makeResolver(sys, char, F, withBlow(ropts, b)); };
    var blow0 = blowKinds({ dmg: bAmt, cuts: bCuts }); twos.forEach(function(t) { blow0['type' + t.k] = typeAt(t.ty); });
    var wearKey = function(ly, both) { var wk = ly.wear; if (Array.isArray(ly.wears) && ly.pick) { var pi = Math.round(num(ev(ly.pick, both))); if (pi >= 1 && pi <= ly.wears.length) wk = ly.wears[pi - 1]; } return wk; };   // 1.6.0: the stat worn where it struck
    var typedAdd = function(P, Rp, pv) {   // 1.6.0: what the layers' rows add to the DR at the location against this part's type (Type named by)
        var place = typeAt(P.ty), add = 0; if (!place) return 0;
        (rules.layers || []).forEach(function(ly) {
            if (!isObj(ly.typed)) return;
            var f = fieldById(sys, ly.list), src = f && f.list && char.values && Array.isArray(char.values[f.id]) ? char.values[f.id] : null; if (!src) return;
            var hasOn = isObj(f.list.on) && ly.anyRow !== true, bw = Object.assign({}, blow0, { type: place }); if (P.kd) bw.kind = kindAt(P.kd);
            src.forEach(function(row) {
                if (!isObj(row) || row.hid === 1 || (hasOn && row.on !== true)) return;
                var rid = rowIdOf(row), rv = rid ? Rp.row(f.id, rid) : null; if (!rv || (ly.typed.stat && Math.round(num(R.stat(f, row, ly.typed.stat))) !== place)) return;
                var both = function(l, text) { if (/^hit\./.test(l)) return pv(l.replace(/^hit\./, 'row.'), text); return rv(l, text); }, listed = Math.floor(num(ev(ly.at, both))); if (listed <= 0) return;
                var w = num(R.stat(f, row, wearKey(ly, both))); if (listed - w <= 0) return;   // broken there
                add += num(ev(ly.typed.plus, layerVars(listed, w, bw, both, layerCap(ly, listed, w, ev, both, bw))));
            });
        });
        return add;
    };
    // 1.6.2 (the CORE session's batch 6, 9): a layer may say its own divisor (adBy, a formula reading Divisor, the blow's armor divisor, and what its wear
    // formulas read). The share of the location's DR its rows give there, each row's figure less its wear, comes out of the DR and is divided by that
    // divisor; the rest by the blow's. So 1 ignores the divisor and Divisor / 2 halves it. The location's DR is taken to hold that figure, as it does
    // where it reads the armor worn. A share never passes what DR is left. With no such layer the DR is divided as it always was
    var adSplit = function(P, Rp, pv, dr) {
        var lyA = (rules.layers || []).filter(function(ly) { return typeof ly.adBy === 'string' && ly.adBy; });
        if (!lyA.length || !lrow || !Rp) return Math.floor(dr / P.ad);
        var left = dr, eff = 0, place = typeAt(P.ty);
        lyA.forEach(function(ly) {
            var f = fieldById(sys, ly.list), src = f && f.list && char.values && Array.isArray(char.values[f.id]) ? char.values[f.id] : null; if (!src) return;
            var hasOn = isObj(f.list.on) && ly.anyRow !== true, bw = Object.assign({}, blow0, { type: place }); if (P.kd) bw.kind = kindAt(P.kd);
            src.forEach(function(row) {
                if (left <= 0 || !isObj(row) || row.hid === 1 || (hasOn && row.on !== true)) return;
                var rid = rowIdOf(row), rv = rid ? Rp.row(f.id, rid) : null; if (!rv) return;
                var both = function(l, text) { if (/^hit\./.test(l)) return pv ? pv(l.replace(/^hit\./, 'row.'), text) : 0; return rv(l, text); }, listed = Math.floor(num(ev(ly.at, both))); if (listed <= 0) return;
                var w = num(R.stat(f, row, wearKey(ly, both))), share = Math.min(left, Math.max(0, listed - w)); if (share <= 0) return;
                var lv = layerVars(listed, w, bw, both, layerCap(ly, listed, w, ev, both, bw)), dv = num(ev(ly.adBy, function(l, text) { return l === 'divisor' ? P.ad : lv(l, text); }));
                if (!(dv > 0)) dv = P.ad; dv = clampNum(dv, 0.1, 100); eff += share / dv; left -= share;
            });
        });
        return eff ? Math.floor(eff + left / P.ad + 1e-9) : Math.floor(left / P.ad);
    };
    if (inp.thru === true && !inp.only && typeof inp.weapon === 'string' && inp.weapon) {   // 1.6.2 (CORE Ch14, "whatever is over the blade's Durability goes on to you, against Protection"): the blow meets the weapon first, and only what is over its listed Dur goes on, taken off the parts in slot order
        var thH = null; (rules.weapons || []).forEach(function(wp) { if (thH) return; var f = fieldById(sys, wp.list), src = f && char.values && Array.isArray(char.values[f.id]) ? char.values[f.id] : null; if (src && src.some(function(r) { return rowIdOf(r) === inp.weapon; })) thH = { wp: wp, f: f }; });
        var thV = thH ? R.row(thH.f.id, inp.weapon) : null, thD = thV ? Math.max(0, Math.floor(num(ev(thH.wp.dur, thV)))) : 0;
        if (thD > 0) { var thLeft = thD, thC = Math.min(amt, thLeft); amt -= thC; thLeft -= thC; twos.forEach(function(t) { var c2 = Math.min(t.amt, thLeft); t.amt -= c2; thLeft -= c2; }); info.thru = thD - thLeft; lines.push('The weapon stopped ' + (thD - thLeft) + '.'); }
    }
    if (!inp.only) {
        var mainP = rules.pool || sys.combat.hpResource;
        var partStep = function(P) {   // 1.6.0 (B3): one part of the blow, through its own type's DR and figures, taken off separately: { eff, through, wound, dieAdd, line } or { fail }
            var ty = P.ty, dice = P.dice, amt = P.amt, pf = P.pf, mult = P.mult, dr = 0;
            var Rp = lrow ? partR(P, blow0) : null, pv = Rp ? Rp.row(lf.id, inp.loc) : null, gp = Rp ? getBy(Rp) : get;   // 1.6.0: this part's own reading of the location
            if (lrow && !(ty && ty.noDr)) { if (rules.locs.dr) dr = gp(lf, lrow, rules.locs.dr); (ty && ty.plus ? ty.plus : []).forEach(function(k) { dr += gp(lf, lrow, k); }); if (dice && ty && ty.dieDr) dr += dice * ty.dieDr; dr += typedAdd(P, Rp, pv); }   // 1.6.0: and its DR a die, for this blow   // 1.6.0: and what the layers add against its type
            if (err) return { fail: { ok: false, reason: 'error', message: 'The DR there could not be worked out: ' + err } };
            dr = Math.max(0, dr); var eff = adSplit(P, Rp, pv, dr), through = Math.max(0, amt - eff);   // 1.6.2 (9): a layer with its own divisor divides its own share
            var lmv = lrow && P.pool === mainP && rules.locs.mult && pv ? num(ev(rules.locs.mult, pv)) : 0;
            if (lmv > 0) mult = clampNum(lmv, 0, DMG_LIM.mult);   // the location's own multiplier (the skull's x4) before a type's vital one
            else if (lrow && ty && ty.vital > 0 && rules.locs.vital && pv && yes(ev(rules.locs.vital, pv))) mult = ty.vital;
            var dieAdd = 0;   // 1.6.0: what the dice add to a wound that gets through: the type's figure a die, its vital one at a vital location, and the location's own
            if (dice && through > 0 && mult > 0) {
                var per = ty && ty.dieWound ? ty.dieWound : 0;
                if (lrow && ty && ty.dieVital && rules.locs.vital && pv && yes(ev(rules.locs.vital, pv))) per += ty.dieVital;
                if (lrow && rules.locs.die && pv) per += num(ev(rules.locs.die, pv));
                dieAdd = Math.floor(dice * per);
            }
            var wound = through > 0 && mult > 0 ? Math.max(1, Math.floor(through * mult) + dieAdd) : 0;
            var wFx = ty && ty.woundF ? ty.woundF : ty && ty.byMult ? '' : rules.woundF || '', zw = false;   // 1.6.2: Wound by formula, the type's own, else the system's (a type ticked Its multiplier keeps its own)
            if (wFx && through > 0) { var wvF = ev(wFx, partR(P, Object.assign({}, blow0, { through: through }))); if (typeof wvF === 'boolean') wvF = wvF ? 1 : 0; if (typeof wvF !== 'number' || !isFinite(wvF)) return { fail: { ok: false, reason: 'error', message: 'The wound could not be worked out from its formula.' } }; wound = Math.max(0, Math.min(DMG_LIM.amt, Math.floor(wvF))); zw = wound === 0; }
            var ww = wound > 0 ? wound : zw && rules.zero !== 'none' ? 1 : 0;   // what wear reads: a wound of 0 from the formula still wears armor unless the system says it does nothing
            return { eff: eff, through: through, wound: wound, ww: ww, dieAdd: wFx && through > 0 ? 0 : dieAdd, line: (ty ? ty.label + ' ' : '') + amt + (lrow ? ' to ' + lname : '') + (eff ? ', DR ' + eff : '') + ': ' + (through ? through + ' through' + (wFx ? ', by its formula' : (mult !== 1 ? ' \u00d7' + mult : '') + (dieAdd ? ' ' + (dieAdd > 0 ? '+' : '\u2212') + Math.abs(dieAdd) + ' for ' + dice + (dice === 1 ? ' die' : ' dice') : '')) + ', ' + wound + ' ' + (pf.label || pf.key) : 'nothing gets through') };
        };
        var A = partStep({ amt: amt, ad: ad, dice: dice, ty: ty, kd: kd, pool: pool, pf: pf, mult: mult }); if (A.fail) return A.fail;
        if (A.dieAdd) info.dieAdd = A.dieAdd;
        var Bs = []; for (var bi = 0; bi < twos.length; bi++) { var B = partStep(twos[bi]); if (B.fail) return B.fail; Bs.push(B); }   // 1.6.0 (B3): each added part, alike
        var sumB = function(k) { return Bs.reduce(function(a, x) { return a + x[k]; }, 0); };
        var eff = A.eff + sumB('eff'), through = A.through + sumB('through'), wound = A.wound + sumB('wound');   // one blow: its injuries added
        info.dr = eff; info.through = through; info.wound = wound;
        lines.push(A.line);
        if (Bs.length) { Bs.forEach(function(x) { lines.push(x.line); }); info.amt = bAmt; info.parts = [A].concat(Bs).map(function(x, i) { var P = i ? twos[i - 1] : { amt: amt, ad: ad, ty: ty, kd: kd, pf: pf }, ps = { type: P.ty ? P.ty.key : '', amt: P.amt, ad: P.ad, dr: x.eff, through: x.through, wound: x.wound, pool: P.pf.key }; if (P.kd) ps.kind = P.kd.key; return ps; }); }
        var pWs = null;   // 1.6.2 (the CORE session): with Not a wound, each part's own wound less what the number took of it
        var woundAny = Array.isArray(rules.onWound) && rules.onWound.some(function(ow) { return isObj(ow) && ow.any === true; });   // 1.6.2: a row that runs on every blow that lands
        if (wound > 0 || woundAny) {   // with no wound no pool moves, no Major Wound is judged and only the rows ticked so run
            var soakT = 0;   // 1.6.2: what the number taken first takes, on the main pool
            var grp = [{ pf: pf, w: A.wound }]; Bs.forEach(function(B, i) { var gx = grp.filter(function(g) { return g.pf.id === twos[i].pf.id; })[0]; if (gx) gx.w += B.wound; else grp.push({ pf: twos[i].pf, w: B.wound }); });   // 1.6.0 (B3): each pool the blow reaches, once, its parts' wounds added
            for (var gi = 0; gi < grp.length; gi++) {
                var gpf = grp[gi].pf, gw = grp[gi].w; if (!(gw > 0)) continue;
                var gch = gi ? Object.assign({}, char, { values: Object.assign({}, char.values || {}, values) }) : char, gR = gi ? makeResolver(sys, gch, F, ropts) : R;   // a second pool reads what the first wrote (a spill into it among them)
                var tmpF = typeof rules.first === 'string' && gpf.id === mainP ? fieldById(sys, rules.first) : null;   // 1.6.2 (temporary hit points): the wound to the main pool comes off that number first, down to 0, after DR and the multipliers; a Major Wound and every rule after it read the whole wound
                if (tmpF && tmpF.kind === 'number') { var tmpHas = num(hasOwn(values, tmpF.id) ? values[tmpF.id] : storedOf(tmpF, gch)), tmpTake = Math.max(0, Math.min(tmpHas, gw)); if (tmpTake > 0) { var tmpEd = applyEdit(sys, gch, tmpF.id, tmpHas - tmpTake, F, { vars: gR }); if (tmpEd.ok) { values[tmpF.id] = tmpEd.value; gw -= tmpTake; soakT += tmpTake; info.first = (info.first || 0) + tmpTake; if (tmpF.vis !== 'gm') lines.push(tmpTake + ' taken by ' + (tmpF.label || tmpF.key) + '.'); } } if (!(gw > 0)) continue; }
                var fxFt = typeof rules.first === 'string' && rules.first.indexOf('fx:') === 0 && gpf.id === mainP ? rules.first.slice(3) : '';   // 1.6.2 (the CORE session: temporary hit points, a ward, a shield's points): an effect's own number spent first, its row ending at 0
                if (fxFt) { var fxTk = 0, fxDf = (Array.isArray(sys.effects) ? sys.effects : []).filter(function(x) { return isObj(x) && x.id === fxFt; })[0];
                    sys.fields.forEach(function(ef) {
                        if (!(gw > 0) || !isObj(ef) || ef.kind !== 'effects') return; var src = hasOwn(values, ef.id) ? values[ef.id] : (isObj(gch.values) ? gch.values[ef.id] : null); if (!Array.isArray(src)) return;
                        var chg = false, nl = []; src.forEach(function(r) { if (gw > 0 && isObj(r) && r.ref === fxFt && r.on !== false && typeof r.v === 'number' && r.v > 0) { var tk = Math.min(r.v, gw); gw -= tk; fxTk += tk; chg = true; if (r.v - tk <= 0) { (info.fxOut = info.fxOut || []).push({ ref: fxFt, v: r.v }); if (typeof _fxOutSink === 'function') { try { _fxOutSink(char.id, { ref: fxFt, v: r.v }); } catch (eO) {} } return; } nl.push(Object.assign({}, r, { v: r.v - tk })); return; } nl.push(r); });
                        if (chg) values[ef.id] = nl;
                    });
                    if (fxTk > 0) { soakT += fxTk; info.first = (info.first || 0) + fxTk; lines.push(fxTk + ' taken by ' + (fxDf && fxDf.vis !== 'gm' ? (fxDf.name || 'an effect') : 'an effect') + '.'); }
                    if (!(gw > 0)) continue; }
                var cur = num(gR(gpf.key)), mn = poolLeast(gpf, gpf.minNeg === true ? gR(gpf.key + '.max') : null), nv = mn === undefined ? cur - gw : Math.max(mn, cur - gw);
                var ed = applyEdit(sys, gch, gpf.id, nv, F, { vars: gR }); if (!ed.ok) return { ok: false, reason: ed.reason || 'value' };
                values[gpf.id] = ed.value;
                if (isObj(gpf.spill)) {   // 1.6.0 Spills into: what the wound takes it past its spill point goes on into another pool (no wound of its own)
                    var spW = Object.assign({}, char, { values: Object.assign({}, char.values || {}, values) }), spD = poolSpill(sys, spW, gpf, cur, gw, F, ropts); if (spD.error) return { ok: false, reason: 'error', message: spD.error };
                    var spHid = spD.steps.length ? gmPools(sys, F) : null;   // a GM-only pool is never named in the lines, which reach the wounded character's player
                    spD.steps.forEach(function(s) { values[s.f] = s.value; var sf = fieldById(sys, s.f); if (sf && sf.vis !== 'gm' && spHid[s.f] !== 1) lines.push(s.amt + ' spill' + (s.amt === 1 ? 's' : '') + ' into ' + s.label + '.'); (info.spill = info.spill || []).push({ f: s.f, amt: s.amt }); });
                }
            }
            var soaked = rules.firstSoaks === true && soakT > 0 ? soakT : 0; if (soaked) { wound = Math.max(0, wound - soaked); info.wound = wound; info.soaked = soaked; var sLeft = soaked; pWs = [A.wound].concat(Bs.map(function(B) { return B.wound; })).map(function(w, i) { var onM = i ? twos[i - 1].pool === mainP : pool === mainP; if (!onM || !(sLeft > 0)) return w; var tk = Math.min(w, sLeft); sLeft -= tk; return w - tk; }); }   // and off each part on the main pool, the main part first, then the added parts in slot order   // 1.6.2 (the CORE session): what it took is no wound, so the heavy hit, the wound rows and Blow.wound read what got past it
            var blowF = blowKinds({ dmg: bAmt, through: through, wound: wound, type: ty ? (rules.types || []).indexOf(ty) + 1 : 0, cuts: bCuts }), follows = []; if (info.first > 0) blowF.first = info.first; /* 1.6.2 (asked by a build session): Blow.first, what Taken first from took, no key where it took nothing */ Bs.forEach(function(B, i) { blowF['type' + twos[i].k] = twos[i].ty ? (rules.types || []).indexOf(twos[i].ty) + 1 : 0; blowF['wound' + twos[i].k] = pWs ? pWs[i + 1] : B.wound; }); if (inp.big === true) blowF.big = 1;   // 1.6.0: and each added part's own type and wound, by its slot   // 1.6.2: and the attack's heavy hit   // 1.6.0 (B3): a blow of two parts, their totals (its type the first part's)   // 1.6.0 (the core's gaps 6 and 7): the blow, for onWound, onMajor's if and the rolls posted
            var wR = function(l, text) { if (/^blow\./.test(l)) { var bk = l.slice(5); return BLOW_NAMES[bk] === 1 ? (bk === 'cuts' || bk === 'major' || bk === 'big' ? (blowF[bk] ? 1 : 0) : num(blowF[bk])) : blowArcKey(bk) ? (blowF[bk] ? 1 : 0) : R(l, text); } return hitR(l, text); };   // a part the blow does not have reads 0
            var omP = null;
            var mjW = pWs ? pWs.reduce(function(a, w, i) { return a + ((i ? twos[i - 1].pool === mainP : pool === mainP) ? w : 0); }, 0) : (pool === mainP ? A.wound : 0) + Bs.reduce(function(a, B, i) { return a + (twos[i].pool === mainP ? B.wound : 0); }, 0);   // 1.6.0 (B3): the parts on the main pool, added, for ONE Major Wound test
            if (mjW > 0 && (rules.major || inp.major === true)) { var th = rules.major ? num(ev(rules.major, hitR)) : 0; if (inp.major === true || (th > 0 && mjW >= th)) {   // 1.6.0: a blow the host marked Always a Major Wound (inp.major, the roll's record) is one whatever its size
                info.major = true; blowF.major = 1; lines.push(majorWords(rules) + '.'); omP = majPick(rules.onMajor, ev, wR); var atM = omP && omP.asAt === true ? valsAt(values) : null; dmgOnMajor(sys, char, omP, values, lines, info, F, fxo, false, preFx); } }   // 1.6.2: atM, the sheet before the Major Wound's own effect   // 1.6.0: the row of onMajor the blow picks
            var folOf = function(roll, why, o) { var fo = { roll: roll, why: why }; if (o.crip) { fo.crip = o.crip; if (o.cripBy) fo.cripBy = o.cripBy; } if (o.crew) fo.crew = o.crew; return fo; };   // 1.6.2 (fold (f)): the crew the card goes to
            if (info.majorRoll) { var foM = folOf(info.majorRoll, 'major', omP || {}); if (typeof atM !== 'undefined' && atM) foM.vals = atM; follows.push(foM); }
            if (Array.isArray(rules.onWound)) {
                rules.onWound.forEach(function(ow) {
                    var hdW = isObj(ow.held) ? heldRows(sys, char, values, ow.held, wR, ev, yes, F, ropts) : null, owR = hdW ? function(l, text) { return l === 'held.count' ? hdW.rows.length : wR(l, text); } : wR;   // 1.6.0: what stands where the blow lands
                    if (!(wound > 0) && ow.any !== true) return;   // 1.6.2
                    if (ow.if && !yes(ev(ow.if, owR))) return;
                    var atV = ow.asAt === true ? valsAt(values) : null;   // 1.6.2: the sheet as it stands now, before this row's effect
                    var nR = (info.woundRolls || []).length; dmgOnMajor(sys, char, ow, values, lines, info, F, fxo, true, preFx);
                    if ((info.woundRolls || []).length > nR) { var foW = folOf(ow.roll, 'wound', ow); if (atV) foW.vals = atV; follows.push(foW); }
                    if (hdW && ow.held.stat) heldWrite(sys, char, values, ow.held, hdW, ev, lines);
                    if (isObj(ow.add)) woundAdd(sys, char, values, ow.add, lrow ? { f: lf.id, r: inp.loc } : null, lines, info);   // 1.6.2
                });
            }
            if (follows.length) { info.follows = follows; info.blow = Object.assign({}, blowF, lrow ? { hit: { f: lf.id, r: inp.loc } } : {}); }
            if (xAt) atB = { blow: Object.assign({}, blowF, lrow ? { hit: { f: lf.id, r: inp.loc } } : {}) };   // 1.6.2 (242): the blow a crossing's roll reads, as a roll the step posts reads it
            if (lrow && rules.locs.crip) { var cp = get(lf, lrow, rules.locs.crip); if (cp > 0 && wound > cp) { info.crip = true; lines.push('Enough to cripple ' + lname + '.'); } }
        }
        var blowW = blowKinds({ dmg: bAmt, through: info.through, wound: info.wound, type: ty ? (rules.types || []).indexOf(ty) + 1 : 0, cuts: bCuts, major: info.major === true }); if (info.first > 0) blowW.first = info.first;   // the blow, for a layer's wear formulas
        Bs.forEach(function(B, i) { blowW['type' + twos[i].k] = twos[i].ty ? (rules.types || []).indexOf(twos[i].ty) + 1 : 0; blowW['wound' + twos[i].k] = pWs ? pWs[i + 1] : B.wound; }); if (inp.big === true) blowW.big = 1;   // 1.6.0: and each added part's own type and wound   // 1.6.2: and the attack's heavy hit
        var wearW = (noWear ? 0 : A.ww) + Bs.reduce(function(a, B, i) { return a + (twos[i].noWear ? 0 : B.ww); }, 0), wearA = (noWear ? 0 : amt) + twos.reduce(function(a, t) { return a + (t.noWear ? 0 : t.amt); }, 0);   // 1.6.0 (B3): the parts whose type wears, as one blow: each layer wears once
        // 1.6.0: a layer's figure (its at) is read once a part, each part by its own Blow.kind and Blow.type (partR), every other Blow. name the whole blow's. A part it gives 0 or less for passes the layer by: that part neither wears it nor counts
        // against it, so a layer that stands against one kind is worn by the part of that kind alone. The row's figure for the blow is the highest of the parts that reach it. A figure that reads no Blow. name is the same for every part, as it was
        var wearP = null, mainOf = function(p) { return !mainP || p === mainP; };   // 1.6.0: a part that took the main pool (the pool, or with none named any)
        if ((lrow || (rules.layers || []).some(function(l) { return l.whole === true; })) && (!noWear || twos.some(function(t) { return !t.noWear; })) && (wearW > 0 || dWear > 0)) (rules.layers || []).forEach(function(ly) {   // 1.6.0: a type that wears by the dice wears whether or not the blow gets through
            if (!lrow && ly.whole !== true) return;   // 1.6.0: with no location only a layer of Every location wears
            if (!wearP) { wearP = [{ ty: ty, kd: kd, amt: amt, wound: A.ww, noWear: noWear, mp: mainOf(pool), dW: dice && ty && ty.dieWear > 0 && !noWear ? Math.floor(dice * ty.dieWear) : 0 }].concat(twos.map(function(t, i) { return { ty: t.ty, kd: t.kd, amt: t.amt, wound: Bs[i].ww, noWear: t.noWear, mp: mainOf(t.pool), dW: t.dice && t.ty && t.ty.dieWear > 0 && !t.noWear ? Math.floor(t.dice * t.ty.dieWear) : 0 }; })).filter(function(P) { return !P.noWear; }); wearP.forEach(function(P) { P.R = partR(P, blowW); P.hv = lrow ? P.R.row(lf.id, inp.loc) : null; }); }
            var f = fieldById(sys, ly.list), src = f && char.values && Array.isArray(char.values[f.id]) ? (Array.isArray(values[f.id]) ? values[f.id] : char.values[f.id]) : null; if (!src || !f.list) return;   // 1.6.0: a layer after another on one list goes on from what that one wore
            var list = JSON.parse(JSON.stringify(src)), changed = false, hasOn = isObj(f.list.on) && ly.anyRow !== true;   // 1.6.0: Every row walks the rows that are off too
            list.forEach(function(row) {
                if (!isObj(row) || row.hid === 1 || (hasOn && row.on !== true)) return;
                var rid = rowIdOf(row), each = []; if (!rid) return;
                wearP.forEach(function(P) {
                    var rv = P.R.row(f.id, rid); if (!rv) return;
                    var bp = function(l, text) { if (/^hit\./.test(l)) return P.hv ? P.hv(l.replace(/^hit\./, 'row.'), text) : 0; return rv(l, text); }, ls = Math.floor(num(ev(ly.at, bp)));
                    if (ls > 0) each.push({ P: P, ls: ls, both: bp });
                });
                if (!each.length) return;
                var top = each[0], wkW = 0, wkA = 0, wkD = 0; each.forEach(function(e) { if (e.ls > top.ls) top = e; wkW += e.P.wound; wkA += e.P.amt; wkD += e.P.dW; });
                var listed = top.ls, both = top.both;
                var wk = wearKey(ly, both);   // 1.6.0: the stat worn where it struck
                var whole = ly.whole === true, w = num(R.stat(f, row, wk)), beats = whole ? each.some(function(e) { return (e.P.mp || ly.anyPool === true) && e.P.wound > 0; }) : wkW > 0 && wkA > Math.max(0, listed - w); if (!beats && !wkD) return;   // the blow is more than it as it stands   // 1.6.0: Every location wears where a part it stands against took the main pool
                var capW = layerCap(ly, listed, w, ev, both, blowW); if (whole && w >= capW) return;   // 1.6.0: down, and its wear left as it stands
                var step = (beats ? layerStep(ly, info.major, listed, w, ev, both, blowW, capW) : 0) + wkD, nw = Math.min(capW, w + step); if (nw === w) return;   // 1.6.0: the layer's own wear cap where it has one   // 1.6.0: by the layer's own formulas where it has them
                dmgRowPut(row, wk, nw); changed = true;
                var rd = rowDef(sys, row), nm = rd && rd.def && rd.def.name ? rd.def.name : 'A piece';
                var wi = { list: f.id, row: rid, from: listed - w, to: listed - nw }; if (wk !== ly.wear) wi.stat = wk; info.wear.push(wi);
                var dn = whole && !ly.wearCap; var gmWr = gmStatKeys(sys), saidW = !gmWr || gmWr[lower(wk)] !== 1; if (saidW) lines.push(nm + ': ' + (listed - w) + ' \u2192 ' + (listed - nw) + layerWord(nw, capW, listed, dn) + '.');   // 1.6.0: wear on a GM-only stat is written and never said
                if (Array.isArray(wl)) wl.push({ f: f.id, r: rid, k: wk, st: wk !== ly.wear, w: w, nw: nw, cap: capW, listed: listed, nm: nm, dn: dn, gm: !saidW, line: saidW ? lines[lines.length - 1] : '' });
            });
            if (changed) values[f.id] = list;
        });
    }
    if (typeof inp.weapon === 'string' && inp.weapon) {
        var hit = null; (rules.weapons || []).forEach(function(wp) { if (hit) return; var f = fieldById(sys, wp.list), src = f && char.values && Array.isArray(char.values[f.id]) ? char.values[f.id] : null; if (src && src.some(function(r) { return rowIdOf(r) === inp.weapon; })) hit = { wp: wp, f: f, src: src }; });
        if (!hit) return { ok: false, reason: 'missing' };
        var wl = values[hit.f.id] || JSON.parse(JSON.stringify(hit.src)), wrow = null; wl.forEach(function(r) { if (!wrow && rowIdOf(r) === inp.weapon) wrow = r; });
        var wv = R.row(hit.f.id, inp.weapon), wB = blowW || blowKinds({ dmg: bAmt, through: 0, wound: 0, type: ty ? (rules.types || []).indexOf(ty) + 1 : 0, cuts: bCuts, major: false }), wV = wv ? function(l, text) { return /^blow\./.test(l) ? layerVars(0, 0, wB, wv)(l, text) : wv(l, text); } : null;   // 1.6.2: a weapon's Dur may depend on what hit it, as a layer's wear may
        var ld = wV ? Math.floor(num(ev(hit.wp.dur, wV))) : 0, wear = num(R.stat(hit.f, wrow, hit.wp.wear)), cond = clampNum(Math.floor(num(R.stat(hit.f, wrow, hit.wp.cond))), 0, 3);
        var over = bAmt - (hit.wp.test === 'listed' ? ld : ld - wear), nc = cond, nw2 = wear, wrd = rowDef(sys, wrow), wn = wrd && wrd.def && wrd.def.name ? wrd.def.name : 'The weapon';
        if (ld > 0 && over >= 1 && cond < 3) {
            if (over <= 10) { nw2 = Math.min(ld * 2, wear + 1); nc = Math.max(cond, 1); }
            else if (over >= 20 && bCuts) nc = 3;
            else if (hit.wp.heavy === 'zero') { nw2 = wear < ld ? ld : Math.min(ld * 2, wear + 1); nc = Math.max(cond, 2); }   // takes what is left to 0, then 1 a blow down to minus its listed value
            else nc = cond >= 2 ? 3 : 2;
            if (ld - nw2 <= -ld) nc = 3; else if (ld - nw2 <= 0) nc = Math.max(nc, 2);
        }
        if (nw2 !== wear) dmgRowPut(wrow, hit.wp.wear, nw2);
        if (nc !== cond) dmgRowPut(wrow, hit.wp.cond, nc);
        if (nw2 !== wear || nc !== cond) values[hit.f.id] = wl;
        info.weapon = { list: hit.f.id, row: inp.weapon, dur: ld - nw2, cond: nc, over: over };
        lines.push(wn + (ld > 0 ? ': ' + dmgDurWord(sys, hit.wp) + ' ' + (ld - wear) + (nw2 !== wear ? ' \u2192 ' + (ld - nw2) : '') : '') + ', ' + DMG_CONDS[nc] + (nc === cond ? ' still' : '') + '.');
    }
    var dmgOk = { ok: true, values: values, lines: lines, info: info }, fsD = fitBroke(sys, char, values, F); if (fsD.length) dmgOk.fitSays = fsD;   // 1.6.0 Fits where, judged again after a blow
    // 1.6.2 (backlog 242, found in passing): a roll an Any wound or a Major Wound row ticked asAt posts carries the step's writes as they stood at its row
    // (valsAt). An effect a LATER row switched on wrote its list only after that, so the snapshot did not name it, and laid over the sheet as stored
    // (sheets.js majorFollow, after the store) it read that later effect after all. Each key an effect wrote that the snapshot does not name is added
    // as it stood before the first effect wrote it (fxPre), which is how it stood at that row. Nothing else of the snapshot changes
    if (fxPre && Array.isArray(info.follows)) info.follows.forEach(function(fo) { if (!isObj(fo) || !isObj(fo.vals)) return; Object.keys(fxPre).forEach(function(k) { if (!hasOwn(fo.vals, k)) fo.vals[k] = cpVal(fxPre[k]); }); });
    if (atB) {   // 1.6.2 (242): the sheet as the blow left it before its effects: every value it wrote, each key an effect wrote put back as it stood before the first effect
        var atV = {}; Object.keys(values).forEach(function(k) { atV[k] = fxPre && hasOwn(fxPre, k) ? cpVal(fxPre[k]) : cpVal(values[k]); }); atB.vals = atV;
        if (inBurst) { atB.fx = fxPre ? valsAt(fxPre) : null; dmgOk.atBlow = atB; } else if (typeof _blowSink === 'function') { try { _blowSink(char.id, { hits: [atB], post: valsAt(values) }); } catch (eB) {} }
    }
    return dmgOk;
}
// [systemcheck:burst-start]
// 1.6.0 A burst (the owner, by prompt: "One press, every hit"). A roll of a list may open a burst (burst 'attack') or be its extra dice (burst 'extra'),
// and the host keeps what they did on the row, as bu, never from a roller's word: h, one mark a shot in firing order (1 a hit, 0 not), its first the
// attack's and the rest the extra dice as they fell; x, 1 once the extra dice are rolled; s, the rounds that left the chamber, each at its shot's
// place. Row.bursthits counts the marks, and a damage roll's Hits it rolls for (hits, a formula with no dice, often that very name) says how many
// times it rolls, HITS_MAX at most, each hit reading its own round as Row.fired. One record, one card (rec.more, the hits after the first), one Apply
var HITS_MAX = CHAMBER_CAP;
function burstList(spec) { return isObj(spec) && Array.isArray(spec.rolls) && spec.rolls.some(function(r) { return isObj(r) && (r.burst === 'attack' || r.burst === 'extra'); }); }
function cleanBu(v) {   // its marks, cut to HITS_MAX; null where it holds none
    if (!isObj(v) || !Array.isArray(v.h) || !v.h.length) return null;
    var o = { h: v.h.slice(0, HITS_MAX).map(function(x) { return x === 1 ? 1 : 0; }) }; if (v.x === 1) o.x = 1;
    return o;
}
function hitShots(bu) {   // the shots that hit, in firing order: their places
    var out = []; (isObj(bu) && Array.isArray(bu.h) ? bu.h : []).slice(0, HITS_MAX).forEach(function(x, i) { if (x === 1) out.push(i); }); return out;
}
// Why the extra dice of the row's burst may not be rolled now: words, or '' where they may. Asked before anything is rolled
function burstBar(sys, char, f, r) {
    var fl = isObj(sys) ? fieldById(sys, f) : null, src = fl && isObj(char) && isObj(char.values) && Array.isArray(char.values[fl.id]) ? char.values[fl.id] : [], row = src.filter(function(x) { return rowIdOf(x) === r; })[0], bu = isObj(row) && isObj(row.bu) ? row.bu : null;
    if (!bu) return 'Roll the attack first.';
    if (!Array.isArray(bu.h) || bu.h[0] !== 1) return 'The attack missed, so this burst has no extra hits.';
    return bu.x === 1 ? 'This burst\u2019s extra dice are rolled.' : '';
}
function burstRowCopy(sys, char, f, r) {
    var fl = isObj(sys) ? fieldById(sys, f) : null, src = fl && isObj(char) && isObj(char.values) && Array.isArray(char.values[fl.id]) ? char.values[fl.id] : null; if (!src) return null;
    var list = JSON.parse(JSON.stringify(src)), row = list.filter(function(x) { return rowIdOf(x) === r; })[0]; return isObj(row) && row.hid !== 1 ? { list: list, row: row } : null;
}
// The attack that opens a burst, on the host: the row's list with the record of it (null: no such row). hit: it hit, so the first shot did; shots:
// the rounds its Fire took, in firing order (applyAct's answer). A miss keeps no round: nothing reads them
function burstOpen(sys, char, f, r, hit, shots) {
    var c = burstRowCopy(sys, char, f, r); if (!c) return null;
    c.row.bu = { h: [hit === true ? 1 : 0] }; if (hit === true && Array.isArray(shots) && shots.length) c.row.bu.s = JSON.parse(JSON.stringify(shots.slice(0, HITS_MAX)));
    return c.list;
}
// The marks of a roll's extra dice, from the roll the host judged: its first counted pool, a die that met it 1, one that did not 0, in the order
// they fell; null where it counts none
function burstDice(res) {
    var g = (isObj(res) && isObj(res.breakdown) && Array.isArray(res.breakdown.dice) ? res.breakdown.dice : []).filter(function(d) { return isObj(d) && isObj(d.cs) && Array.isArray(d.dice); })[0];
    return g ? g.dice.filter(function(d) { return isObj(d) && d.kept; }).map(function(d) { return d.hit === true ? 1 : 0; }) : null;
}
// The extra dice of the row's burst, on the host: { value, hits, strays, n }, the row's list with their marks, the rounds that hit and those that did
// not, each in firing order, and how many hit in all; null where nothing was read. A row with rounds reads one die a round past the first
function burstExtra(sys, char, f, r, res) {
    var m = burstDice(res), c = m ? burstRowCopy(sys, char, f, r) : null, bu = c && isObj(c.row.bu) ? c.row.bu : null; if (!bu || !Array.isArray(bu.h) || bu.h[0] !== 1 || bu.x === 1) return null;
    var shots = Array.isArray(bu.s) ? bu.s : null, marks = m.slice(0, shots ? Math.max(0, shots.length - 1) : HITS_MAX - 1), hits = [], strays = [];
    bu.h = [1].concat(marks); bu.x = 1;
    if (shots) marks.forEach(function(k, i) { var s = shots[i + 1]; if (isObj(s)) (k === 1 ? hits : strays).push(s); });
    return { value: c.list, hits: hits, strays: strays, n: hitShots(bu).length };
}
// How many times a damage roll rolls: undefined where it names no Hits it rolls for, else a whole number from 0 to HITS_MAX, or null where its
// formula holds dice or cannot be worked out. Nothing is rolled. The host asks it, from the entry, through the roller's view
function hitCount(ent, vars, F) {
    if (!isObj(ent) || ent.dmg !== true || typeof ent.hits !== 'string' || !ent.hits) return undefined;
    if (!F || typeof vars !== 'function') return null;
    var p = F.parse(ent.hits); if (!p.ok || hasDice(p.ast.body)) return null;
    var r = F.evaluate(ent.hits, { vars: vars, random: noDice }), v = r && r.ok ? (typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value) : null;
    return typeof v === 'number' && fin(v) ? Math.max(0, Math.min(HITS_MAX, Math.floor(v))) : null;
}
// A resolver for each of n hits: where the row holds a burst each reads its own round as Row.fired, the shot that hit, in firing order; else the
// names as they are
function hitVars(vars, n) {
    var bu = typeof vars === 'function' && typeof vars.burst === 'function' ? vars.burst() : null, at = bu && Array.isArray(bu.s) ? hitShots(bu) : [], out = [];
    for (var i = 0; i < n; i++) { var s = i < at.length ? bu.s[at[i]] : null; out.push(isObj(s) && typeof vars.shot === 'function' ? vars.shot(s, at[i]) : vars); }
    return out;
}
// Which round each of n hits was, for its card: { rno, rnd? } each, rno its place in firing order from 1, rnd its name; null for a hit with no round.
// sys is the roller's view, and a GM-only round is never named: the card goes to the table (the live test, 2026-10-30)
function hitRounds(sys, vars, n) {
    var bu = typeof vars === 'function' && typeof vars.burst === 'function' ? vars.burst() : null, at = bu && Array.isArray(bu.s) ? hitShots(bu) : [], out = [];
    for (var i = 0; i < n; i++) {
        if (i >= at.length) { out.push(null); continue; }
        var o = { rno: at[i] + 1 }, s = bu.s[at[i]], d = isObj(s) ? rowDef(sys, s) : null, nm = d && isObj(d.def) && d.def.vis !== 'gm' && typeof d.def.name === 'string' ? cutText(d.def.name, LIMITS.label) : '';
        if (nm) o.rnd = nm; out.push(o);
    }
    return out;
}
// The hits after the first, rolled on the host from the entry: { list } (rec.more: each { t, n?, f?, dtype?, ad?, dkind?, major?, dmg2? ... dmg5?, rno?, rnd? }, as the
// first hit's own keys of the record say them, f its dice and rno and rnd its round) or { error }. expr: the formula as it was asked for, its modifier in it. o.random, the suite's dice, o.rounds, hitRounds past the first
function hitRolls(sys, ent, expr, vl, F, D, o) {
    var out = [], rnd = isObj(o) && typeof o.random === 'function' ? o.random : null;
    for (var i = 0; i < vl.length; i++) {
        var v = vl[i], r = F.evaluate(expr, rnd ? { vars: v, random: rnd } : { vars: v });
        if (!r || !r.ok) return { error: r && r.error && r.error.message ? r.error.message : 'That hit could not be rolled.' };
        if (D && typeof D.checkTableRoll === 'function' && D.checkTableRoll(r)) return { error: 'One of its hits rolls too many dice.' };
        if (typeof r.value !== 'number' || !fin(r.value)) return { error: 'That hit gives no number.' };
        var n = 0; (r.breakdown && Array.isArray(r.breakdown.dice) ? r.breakdown.dice : []).forEach(function(g) { if (g && typeof g.count === 'number' && fin(g.count)) n += g.count; });
        var h = { t: Math.max(0, Math.min(DMG_LIM.amt, Math.floor(r.value))) }; if (n > 0) h.n = Math.min(DMG_LIM.dice, Math.floor(n));
        var fc = D && typeof D.hitFaces === 'function' ? D.hitFaces(r) : []; if (fc.length) h.f = fc;
        var rq = isObj(o) && Array.isArray(o.rounds) && isObj(o.rounds[i]) ? o.rounds[i] : null; if (rq) { h.rno = rq.rno; if (rq.rnd) h.rnd = rq.rnd; }
        var dt = dmgTypeOf(sys, ent, v, F); if (dt) h.dtype = dt;
        var dk = dmgKindOf(sys, ent, v, F); if (dk) h.dkind = dk;
        var a = dmgAdOf(ent, v, F); if (a) h.ad = a;
        if (dmgMajorOf(ent, v, F)) h.major = 1;
        [2].concat(DMG_MORE).forEach(function(k) { var p = dmgPartOf(sys, ent, v, F, rnd ? { random: rnd } : undefined, k); if (p) h['dmg' + k] = p; });
        out.push(h);
    }
    return { list: out };
}
// The GM-only names a card of several hits would show: every figure of a hit is on it, so one read from a GM-only value keeps the GM's own roll
// private. o: { row, ch, uDef } for a list's roll
function hitsSecret(sys, ent, F, o) {
    var txt = [ent.hits, ent.ad, ent.dkind, ent.dtype, ent.dmgMajorIf]; [2].concat(DMG_MORE).forEach(function(k) { txt.push(ent['dmg' + k], ent['dtype' + k], ent['ad' + k], ent['dkind' + k]); });
    var ns = txt.reduce(function(a, t) { return typeof t === 'string' && t ? a.concat(F.names(t)) : a; }, []), l = isObj(o) && isObj(o.row) && isObj(o.ch) ? rowRollNames(sys, o.ch, o.row.f, o.row.r, ns, F, o.uDef || undefined).names : ns.map(function(n) { return { name: n }; });
    return gmOnlyNames(sys, l).concat(gmDerivedNames(sys, F, l));
}
// A burst's hits on one character, the one judge beside the step: inp is the first hit's blow, inp.hits the rest (each { amt, type, ad, dice, kind,
// major, part2 ... part5 }), every hit at inp's location. Each hit is its own blow, through damageStep: its DR, its Major Wound, its Any wound, its
// follows. Each meets the armor as it was before the burst, and pools move on from hit to hit. The wear of the hits that got through adds up and
// comes off once, at the end, down to each layer's cap. One answer, so one Undo: { ok, values, lines, info } with info.hits (how many) and info.each,
// each hit's { info, vals } that has a roll to post (the character's values as that hit left them, the wear to come not in them). A hit that
// cannot be worked out refuses the whole burst. With no inp.hits it is the step itself
function damageBurst(sys, char, inp, F, ropts, fxo) {
    var more = isObj(inp) && Array.isArray(inp.hits) ? inp.hits.filter(isObj).slice(0, HITS_MAX - 1) : [], first = isObj(inp) ? Object.assign({}, inp) : inp; if (isObj(first)) delete first.hits;
    if (!more.length) return damageStep(sys, char, first, F, ropts, fxo);
    var blows = [first].concat(more.map(function(h) { var b = Object.assign({}, h); delete b.hits; delete b.loc; delete b.weapon; delete b.only; if (first.loc !== undefined) b.loc = first.loc; if (first.tb !== undefined) b.tb = first.tb; if (first.weapon !== undefined) { b.weapon = first.weapon; if (first.only === true) b.only = true; } return b; }));
    var cur = Object.assign({}, isObj(char) && isObj(char.values) ? char.values : {}), seen = map(), worn = map(), wearO = [], lines = [], each = [];
    var info = { amt: 0, ad: 1, dr: 0, through: 0, wound: 0, pool: '', major: false, crip: false, wear: [], weapon: null, hits: blows.length };
    var atHits = asAtCross(sys) ? [] : null;   // 1.6.2 (backlog 242): each hit's blow, the sheet as it left it before its own effects (vals) and as it left it (post), for a crossing's roll
    for (var i = 0; i < blows.length; i++) {
        var wl = [], st = damageStep(sys, Object.assign({}, char, { values: cur }), blows[i], F, ropts, fxo, wl); if (!st.ok) return st;
        if (!i) { info.ad = st.info.ad; info.pool = st.info.pool; }
        ['amt', 'dr', 'through', 'wound'].forEach(function(k) { info[k] += st.info[k]; }); if (st.info.major) info.major = true; if (st.info.crip) info.crip = true; if (st.info.weapon) info.weapon = st.info.weapon;
        wl.forEach(function(w) {
            var key = w.f + '|' + w.r + '|' + w.k, rw = (Array.isArray(st.values[w.f]) ? st.values[w.f] : []).filter(function(x) { return rowIdOf(x) === w.r; })[0];
            if (!worn[key]) { worn[key] = { f: w.f, r: w.r, k: w.k, st: w.st, w: w.w, add: 0, cap: w.cap, listed: w.listed, nm: w.nm, dn: w.dn, gm: w.gm === true }; wearO.push(key); }
            worn[key].add += w.nw - w.w; worn[key].cap = Math.max(worn[key].cap, w.cap); if (isObj(rw)) dmgRowPut(rw, w.k, w.w);   // this hit leaves the layer as it stood
        });
        Object.keys(st.values).forEach(function(k) { cur[k] = st.values[k]; seen[k] = 1; });
        lines.push('Hit ' + (i + 1) + ':'); st.lines.forEach(function(l) { if (!wl.some(function(w) { return w.line === l; })) lines.push(l); });
        if (atHits && isObj(st.atBlow)) { var hv = {}, hp = {}; Object.keys(seen).forEach(function(k) { hv[k] = cpVal(cur[k]); hp[k] = cpVal(cur[k]); }); atHits.push({ blow: st.atBlow.blow, vals: hv, post: hp, fx: st.atBlow.fx || null }); }   // 1.6.2 (242): this hit as it left the sheet; its own effects are put back below
        if (st.info.majorRoll || st.info.follows) { var vals = {}; Object.keys(seen).forEach(function(k) { vals[k] = JSON.parse(JSON.stringify(cur[k])); }); each.push({ info: st.info, vals: vals }); }
    }
    wearO.forEach(function(key) {
        var w = worn[key], rw = (Array.isArray(cur[w.f]) ? cur[w.f] : []).filter(function(x) { return rowIdOf(x) === w.r; })[0], nw = Math.min(w.cap, w.w + w.add); if (!isObj(rw)) return;
        dmgRowPut(rw, w.k, nw); var wi = { list: w.f, row: w.r, from: w.listed - w.w, to: w.listed - nw }; if (w.st) wi.stat = w.k; info.wear.push(wi);
        if (w.gm !== true) lines.push(w.nm + ': ' + (w.listed - w.w) + ' \u2192 ' + (w.listed - nw) + layerWord(nw, w.cap, w.listed, w.dn) + '.');
    });
    var values = {}; Object.keys(seen).forEach(function(k) { values[k] = cur[k]; });
    if (each.length) { info.each = each; info.follows = []; }   // the follows are each hit's own (majorFollow)
    var done = { ok: true, values: values, lines: lines, info: info }, fsB = fitBroke(sys, char, values, F); if (fsB.length) done.fitSays = fsB;
    if (atHits && atHits.length) {   // 1.6.2 (242): every hit's record names every key the burst wrote: one a later hit wrote alone, as it stood before the burst; then the hit's own effects put back
        atHits.forEach(function(h) { Object.keys(values).forEach(function(k) { if (!hasOwn(h.vals, k)) { h.vals[k] = isObj(char.values) && hasOwn(char.values, k) ? cpVal(char.values[k]) : undefined; h.post[k] = cpVal(h.vals[k]); } }); if (h.fx) Object.keys(h.fx).forEach(function(k) { h.vals[k] = cpVal(h.fx[k]); }); delete h.fx; });
        if (typeof _blowSink === 'function') { try { _blowSink(isObj(char) ? char.id : '', { hits: atHits, post: valsAt(values) }); } catch (eB) {} }
    }
    return done;
}
// [systemcheck:burst-end]
// A player's blow on their own character, as it rides the wire: { rid, charId, q: damageStep's inp } or null
// 1.6.0: an added part of a player's blow on their own character, { amt, type, ad, dice, kind } as the Take damage window hands it; null when anything is malformed
function cleanCharPart(p) {
    if (!isObj(p) || typeof p.amt !== 'number' || !fin(p.amt) || p.amt < 0 || p.amt > DMG_LIM.amt) return null;
    var o = { amt: Math.floor(p.amt) };
    if (p.type !== undefined) { if (typeof p.type !== 'string' || !STAT_KEY.test(p.type)) return null; o.type = p.type; }
    if (p.ad !== undefined) { if (typeof p.ad !== 'number' || !fin(p.ad) || p.ad < 0.1 || p.ad > 100) return null; o.ad = p.ad; }
    if (p.dice !== undefined) { if (typeof p.dice !== 'number' || !fin(p.dice) || Math.floor(p.dice) !== p.dice || p.dice < 0 || p.dice > DMG_LIM.dice) return null; if (p.dice) o.dice = p.dice; }
    if (p.kind !== undefined) { if (typeof p.kind !== 'string' || !STAT_KEY.test(p.kind)) return null; o.kind = p.kind; }
    return o;
}
// 1.6.0 A burst: a further hit of a player's blow on their own character: a part, with its own parts; null when anything is malformed. It names no
// Major Wound and no location, as the message itself names none but its loc
function cleanCharHit(h) {
    var o = cleanCharPart(h); if (!o) return null;
    var bad = false; [2].concat(DMG_MORE).forEach(function(k) { var pk = 'part' + k; if (h[pk] === undefined) return; var pc = cleanCharPart(h[pk]); if (!pc) bad = true; else o[pk] = pc; });
    return bad ? null : o;
}
function cleanCharDamage(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID_RE.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId)) return null;
    if (typeof msg.amt !== 'number' || !fin(msg.amt) || msg.amt < 0 || msg.amt > DMG_LIM.amt) return null;
    var q = { amt: Math.floor(msg.amt) };
    if (msg.dtype !== undefined) { if (typeof msg.dtype !== 'string' || !STAT_KEY.test(msg.dtype)) return null; q.type = msg.dtype; }   // the damage type rides as dtype: type is the message's own
    if (msg.dkind !== undefined) { if (typeof msg.dkind !== 'string' || !STAT_KEY.test(msg.dkind)) return null; q.kind = msg.dkind; }   // 1.6.0: the blow's kind, as its type rides
    if (msg.loc !== undefined) { if (typeof msg.loc !== 'string' || !ROW_ID.test(msg.loc)) return null; q.loc = msg.loc; }
    if (msg.ad !== undefined) { if (typeof msg.ad !== 'number' || !fin(msg.ad) || msg.ad < 0.1 || msg.ad > 100) return null; q.ad = msg.ad; }
    if (msg.dice !== undefined) { if (typeof msg.dice !== 'number' || !fin(msg.dice) || Math.floor(msg.dice) !== msg.dice || msg.dice < 0 || msg.dice > DMG_LIM.dice) return null; if (msg.dice) q.dice = msg.dice; }   // 1.6.0: the dice the blow rolled
    if (msg.tb !== undefined) { if (typeof msg.tb !== 'number' || !fin(msg.tb) || Math.abs(msg.tb) > 180) return null; q.tb = Math.round(msg.tb); }   // 1.6.2 (13): where the attacker stood, from the target's facing, as the card said it
    if (msg.weapon !== undefined) { if (typeof msg.weapon !== 'string' || !ROW_ID.test(msg.weapon)) return null; q.weapon = msg.weapon; if (msg.only === true) q.only = true; else if (msg.thru === true) q.thru = true; }   // 1.6.2: or what is over its Dur goes on
    var bad = false; [2].concat(DMG_MORE).forEach(function(k) { var pk = 'part' + k; if (msg[pk] === undefined) return; var pc = cleanCharPart(msg[pk]); if (!pc) bad = true; else q[pk] = pc; });   // 1.6.0: the blow's added parts, on their own character as its first is
    if (bad) return null;
    if (msg.hits !== undefined) {   // 1.6.0 A burst: the hits after the first, each cleaned as a blow is, and one that does not clean refuses the message
        if (!Array.isArray(msg.hits) || !msg.hits.length || msg.hits.length > HITS_MAX - 1) return null;
        var hs = []; for (var hi = 0; hi < msg.hits.length; hi++) { var hc = cleanCharHit(msg.hits[hi]); if (!hc) return null; hs.push(hc); } q.hits = hs;
    }
    return { rid: msg.rid, charId: msg.charId, q: q };
}
// [systemcheck:damage-end]
// [split:body-end]
return { BLOW_NAMES: BLOW_NAMES, DMG_CONDS: DMG_CONDS, DMG_LIM: DMG_LIM, HITS_MAX: HITS_MAX, asAtCross: asAtCross, blowArcs: blowArcs, blowCripN: blowCripN, blowCripOf: blowCripOf, blowNamed: blowNamed, burstBar: burstBar, burstDice: burstDice, burstExtra: burstExtra, burstList: burstList, burstOpen: burstOpen, cleanBu: cleanBu, cleanCharDamage: cleanCharDamage, cleanCharHit: cleanCharHit, cleanDamageRules: cleanDamageRules, cleanHeld: cleanHeld, damageBurst: damageBurst, damageStep: damageStep, dmgDiceRead: dmgDiceRead, dmgDurWord: dmgDurWord, dmgRowPut: dmgRowPut, hitCount: hitCount, hitRolls: hitRolls, hitRounds: hitRounds, hitShots: hitShots, hitVars: hitVars, hitsSecret: hitsSecret, locNamed: locNamed, locSideKey: locSideKey, locSideRead: locSideRead, majPick: majPick, majorWords: majorWords, poolLeast: poolLeast, poolSpill: poolSpill, spillPast: spillPast, withBlow: withBlow, woundAdd: woundAdd };   // [split:glue]
}   // [split:glue]
