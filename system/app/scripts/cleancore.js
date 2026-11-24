/* cleancore.js: a part of systemcore.js (docs/REFACTOR_SPLIT_PLAN.md, area 5, the cleaners; split 2026-11-18 with no change in behavior).
   What it holds: how a system is cleaned, every way in. A roll's critical range (critRangeInto); a value as a field keeps it
   (cleanValue); the Combat tab (cleanCombat, cleanHeightRules, cleanBlastRules, cleanHolds, cleanArcs, cleanTerrainKinds); an item's
   and an entry's definition and its changes (cleanItemKey, cleanMod, cleanDesc, cleanLvls, areaExtra, cleanFlies, cleanAffs); a list's
   options (cleanListSpec and its kin: badges, alternate names, arcs, subjects, jobs, once a category, places split by a stat); the
   layout, a sheet's look and the HUD (cleanSheetStyle, hudOf, hudView); point budgets (cleanBudgets, budgetsOf, budgetWatch); the
   environment readings (cleanEnv, envBands); the one system cleaner (cleanSystem) with what it drops said (droppedCounts,
   droppedWords, capsAt); and a character's text looks (lookRule, lookOf, cleanLooks). cleanChar and everything after it, the
   validator (validcore.js) and the resolver stay in systemcore.js or their own parts.
   Why it looks this way: these lines stood in systemcore.js, and they still run exactly where they stood. systemcore.js calls
   cleanCore() at its line `// [split:cleancore.js]`, so the body below runs in the old order, after everything above that line and
   before everything below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test
   that reads systemcore.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the
   body uses of systemcore.js; the last line hands back the names systemcore.js uses of it. Neither side may assign the other's names,
   and a name this part assigns again later may not be read outside it, since systemcore.js holds only a copy (tools/splitcheck.js
   holds both). Change the code here as if it still stood in systemcore.js. */
// [split:of systemcore.js]
import { APPLY_KINDS, AT_NOT, BAND_KINDS, BLAST_AUTO, CHAMBER_CAP, CTRL_KEEP_NL, CTRL_RE, CTRL_RE_G, DEF_PROP, DMG_MORE, EFFECT_ID, FEEDS_MAX, FIELD_ID, FUNC_NAMES, FXROW_ID, FX_AGAIN, FX_END_GROUP, GROUP_ID, IDENTITY_KINDS, ITEM_ID, ITEM_KEY, LAYOUT, LEDGER_KINDS, LIMITS, LIST_WORDS, LOOK_RULES, MAP_UNITS, NAME_SUFFIX, PART_CAPS, PART_FITS, PART_SRCS, PATH_RE, POSTURE_ID, POSTURE_IDS, READER_MARK, RESERVED_SUFFIX, REST_ID, ROLL_ID, ROW_NAME, ROW_SOFT, ROW_WORDS, SECTION_ID, SEND_HOPS_MAX, SENSE_RANGE_KINDS, STAT_KEY, TABLE_KEY, TAB_ID, TARGET_READS, TIME_SECS, TIME_WORDS, TONES, TO_GM, WITH_ROW_DROPS, allRowOk, applyRowOp, applyTargets, asksKept, atIndex, attemptKeyOf, bigOf, callsInto, capExpr, capFOk, capIsIn, capIsList, capTexts, catIn, chamberCap, charFor, charView, clampNum, cleanAnswers, cleanApplyChanges, cleanBands, cleanBars, cleanCalendar, cleanCardActs, cleanCharCats, cleanCover, cleanCurrencies, cleanDamageRules, cleanDarkSteps, cleanDecks, cleanDie, cleanExplain, cleanField, cleanFieldUnit, cleanFormulaText, cleanFxTimer, cleanFxVal, cleanIcon, cleanInitRules, cleanItemDef, cleanLabels, cleanLay, cleanLightRules, cleanLinks, cleanLock, cleanLookSpec, cleanMapKinds, cleanMapStart, cleanNameLists, cleanNeedsWhy, cleanNum, cleanObjects, cleanOnRemove, cleanPostures, cleanRangeRules, cleanRec, cleanRestSkip, cleanRests, cleanResults, cleanRollDef, cleanRollSw, cleanRow, cleanRowCross, cleanRowDef, cleanRowTimer, cleanScenes, cleanSelfCover, cleanSenses, cleanSheetRev, cleanSheetsSpec, cleanSpreads, cleanStarts, cleanTables, cleanTags, cleanTests, cleanTones, cleanTrading, cleanTravel, cleanTurn, cleanUpkeep, cleanValues, clockNInto, coreOf, costKey, costNInto, costTargets, cutPoints, cutText, decCount, derivedScope, emptySystem, everyTargets, explainPages, fieldKinds, figExpand, fin, fitIfOk, fitRows, fitTextOk, fmtNum, fxEndsWith, fxIndex, fxShareEnd, fxTick, fxValNum, fxVf, glyphPath, gmDerivedNames, gmPools, gmStatKeys, gmStatRead, gmStatsOut, gmViewFields, grantRaises, groundYd, hasDice, hasOwn, hideGrants, hideNeeds, hideOffInto, isObj, labelHead, landDmgInto, linkBare, lower, makeRec, makeResolver, map, mapCellScale, modsIfOk, nameFold, noDice, norm180, onOther, onceOf, openChar, partFitSays, partsFrom, pickLabel, poolLeast, projectRows, rangeModNum, readsRow, resistByInto, rollAreaInto, rollNeedsInto, rollStations, roundSecs, rowCt, rowDef, rowIdOf, rowLookRoom, rowOn, rowOpMoney, rowStat, rowTextRule, secretFieldIds, senseField, specBase, specMeans, stanceCtx, startRows, statAsk, statDefOf, statKey, statNum, str, swRollIs, tableFam, tableKeyOk, tableRead, testFormula, thenGmCut, unitOf, unseenMods, validKey, validPageId, valueOpts, whyGmCut } from './systemcore.js';   // [split:glue]
export function cleanCore() {   // [split:glue]
// [split:body-start]
// 1.6.0 (the v2 sort's B1): a critical range, kept on the Combat tab under criticals at fixed rolls and on a system roll or a list roll of any
// system (a technique that widens it): critAt and fumbleAt, each a formula of the roller's names with no dice, each absent where it does not clean
function critRangeInto(out, r) { var a = cleanFormulaText(r.critAt), b = cleanFormulaText(r.fumbleAt); if (a) out.critAt = a; if (b) out.fumbleAt = b; }
function hasRange(r) { return !!(r.critAt || r.fumbleAt || r.bigAt); }   // a roll with a range of its own names itself as it is rolled, or its press sends the formula alone and the host reads the Combat tab's. The name stays in the players' view, whatever the view drops
// 1.6.0 (the book's ruling of 2026-10-29: only a natural 3 or 18 is a critical; a technique's widened range lands as a heavy hit instead): a system
// roll or a list roll may carry bigAt, what lands as a heavy hit, a formula of the roller's names (a list roll's row's too) with no dice, under any
// rule. Its cleaner and the players' view treat it as critAt. bigOf is its one reading
// 1.6.0: a named tier, { name, at }: a success whose margin is at least at (1 to 1,000,000) reads name on its card, as Strong success at 5. null
// where either part does not clean
function cleanTier(v) {
    if (!isObj(v) || typeof v.at !== 'number' || Math.floor(v.at) !== v.at || v.at < 1 || v.at > 1000000) return null;
    var n = cutText(v.name, 30); return n ? { name: n, at: v.at } : null;
}
// camp.system.combat — blast automation, who rolls, the resource damage subtracts from, and the cover rule. resIds: map of resource field ids.
// 1.6.0 Who holds whom (combat.holds; off when absent, and absent from the players' view: the host alone works it). held, the library effect a held
// character wears, once however many hold it; pinned, the one a pinned character wears; each a roll or an action named as a Calls for's by is: take (a
// success takes hold of the roller's target), pin (a success pins someone they hold), keep (keeps every hold they have), also (up to HOLD_ALSO attack
// rolls that keep them too, aimed at someone held), squeeze (a blow posted to each held character) and free (a success breaks one hold, the roller
// held; one resisted, once its target fails); drag, the cells a holder may drag at each turn (none: a holder who walks off lets go); ends, a formula of
// the holder's names, true while they have lost their action or are down, when all their holds end at once
var HOLD_ALSO = 80, HOLD_ROLLS = Object.freeze(['take', 'pin', 'keep', 'squeeze', 'free']), HOLD_REF = /^f_[A-Za-z0-9_]{1,24}#\d{1,3}$/;
function holdRefOk(v) { return typeof v === 'string' && (ROLL_ID.test(v) || HOLD_REF.test(v)); }
function holdRefOf(act, row) { return isObj(row) && typeof row.f === 'string' && typeof row.i === 'number' ? row.f + '#' + row.i : typeof act === 'string' ? act : ''; }
function holdsNamed(h, rolls, fields) {   // a roll a hold follows names itself as it is rolled, as a sneak's does (the sheet sends a plain roll's formula alone, so the host could not tell it), on the GM's view; a players' view keeps the mark, and says nothing of why. An action asks for nothing: it is pressed by name
    HOLD_ROLLS.map(function(k) { return h[k]; }).concat(Array.isArray(h.also) ? h.also : []).forEach(function(ref) {
        if (!holdRefOk(ref)) return; var at = ref.indexOf('#');
        if (at < 0) { rolls.forEach(function(r) { if (r.id === ref) r.named = true; }); return; }
        var fid = ref.slice(0, at), i = +ref.slice(at + 1); fields.forEach(function(f) { var r = f.id === fid && isObj(f.list) && Array.isArray(f.list.rolls) ? f.list.rolls[i] : null; if (isObj(r)) r.named = true; });
    });
}
function cleanHolds(v) {
    if (!isObj(v) || typeof v.held !== 'string' || !EFFECT_ID.test(v.held)) return null;
    var o = { held: v.held }; if (typeof v.pinned === 'string' && EFFECT_ID.test(v.pinned)) o.pinned = v.pinned; if (typeof v.holder === 'string' && EFFECT_ID.test(v.holder)) o.holder = v.holder;   // holder: the one a character wears while they hold anyone
    HOLD_ROLLS.forEach(function(k) { if (holdRefOk(v[k])) o[k] = v[k]; });
    if (Array.isArray(v.also)) { var al = []; v.also.forEach(function(x) { if (holdRefOk(x) && al.indexOf(x) < 0 && al.length < HOLD_ALSO) al.push(x); }); if (al.length) o.also = al; }
    if (typeof v.drag === 'number' && fin(v.drag) && v.drag > 0) o.drag = Math.min(1000, Math.round(v.drag * 100) / 100);
    var e = cleanFormulaText(v.ends); if (e) o.ends = e;
    if (v.drawIn === true) o.drawIn = true;   // 1.6.2: a grab from a distance brings its target to the holder
    return o;
}
function cleanCombat(c, resIds, fieldIds, secretIds, F, viewKinds, pl, fl) {   // 1.5.6: pl, the players' view; fl, a field of this view by id (the damage step)   // senses S1: fieldIds (id -> kind, the GM's view) and secretIds (secretFieldIds) for the senses; range R1: F for the range formula; conditions C3: viewKinds (id -> kind, this view's fields) for a posture's changes
    c = isObj(c) ? c : {};
    var out = { blastAuto: BLAST_AUTO[c.blastAuto] ? c.blastAuto : 'full', blastRoller: c.blastRoller === 'gm' ? 'gm' : 'owner', hpResource: '', cover: cleanCover(c.cover, pl === true, F) };
    if (typeof c.hpResource === 'string' && resIds && resIds[c.hpResource]) out.hpResource = c.hpResource;
    var tn = cleanTurn(c.turn); if (tn) out.turn = tn;   // turn-based combat T1: the system's turn rules (absent: none)
    if (c.checks === 'under3d6') out.checks = 'under3d6';   // Stage 6 F8: 3d6 roll-under criticals (absent: success or failure by the margin)
    else if (c.checks === 'fixed') { out.checks = 'fixed'; critRangeInto(out, c); if (c.critHigh === true) out.critHigh = true; }   // 1.6.0 (the v2 sort's B1): criticals at fixed rolls, at or under critAt and at or over fumbleAt, each a formula with no dice (absent: 3 and 18)
    if (pl !== true) { var cpC = cleanFormulaText(c.cardPts); if (cpC) { out.cardPts = cpC; var cwC = cutText(c.cardPtsWord, LIMITS.label); if (cwC) out.cardPtsWord = cwC; } var caC = cleanCardActs(c.cardActs); if (caC) out.cardActs = caC; if (typeof c.cardWait === 'number' && fin(c.cardWait) && Math.floor(c.cardWait) !== 60) out.cardWait = Math.max(5, Math.min(600, Math.floor(c.cardWait))); if (typeof c.helpWait === 'number' && fin(c.helpWait) && Math.floor(c.helpWait) >= 5 && Math.floor(c.helpWait) !== 30) out.helpWait = Math.min(600, Math.floor(c.helpWait)); var bdC = cleanBands(c.bands); if (bdC.length) out.bands = bdC; if (c.landBy === 'now' || c.landBy === 'both') out.landBy = c.landBy; if (c.testBy === 'now' || c.testBy === 'both') out.testBy = c.testBy; /* 1.6.3 (defense fold 3, Fulllion's decision 8): how a weapon test a defense calls for is made (absent: a card its owner presses) */ if (typeof c.defenseWait === 'number' && fin(c.defenseWait) && Math.floor(c.defenseWait) >= 5) out.defenseWait = Math.min(3600, Math.floor(c.defenseWait)); if (typeof c.sendHops === 'number' && fin(c.sendHops) && Math.floor(c.sendHops) >= 2) out.sendHops = Math.min(SEND_HOPS_MAX, Math.floor(c.sendHops)); /* 1.6.3 (defense fold 4): Can be sent on at most, 2 to 8 (absent: once, the core's answer 5) */ }   /* 1.6.3 (defense fold 1, Fulllion's decisions 1 and 5 of 2026-11-17): who rolls a landed attack's damage (absent: its attacker presses a card; now: rolled at once; both: the card, and the GM may roll it at once), and how many seconds a defense waits before the attack lands by itself (absent: no wait). The GM's view alone, since only the host reads them */   // 1.6.2: result bands, read by the machine that rolls alone
    var tr = cleanTier(c.tier); if (tr) out.tier = tr;   // 1.6.0: a success at or past a margin is named on its card
    var lt = cleanLightRules(c.light); if (lt) out.light = lt;   // lighting L4: the system's light rules (absent: none)
    var sn = cleanSenses(c.senses, fieldIds, secretIds, pl !== true, F); if (sn) out.senses = sn;   // senses S1: the system's senses (absent: none)
    var rg = cleanRangeRules(c.range, F); if (rg) out.range = rg;   // range penalties R1: the system's range rule (absent: none)
    if (c.targetSize !== undefined) { var tsz = senseField({ field: c.targetSize }, SENSE_RANGE_KINDS, fieldIds, secretIds); if (tsz) out.targetSize = tsz; }   // 1.6.0 (the v2 combat module): the field of a target's sheet TargetSize reads, a number its viewer can read truthfully, the same in both views
    if (c.bodySize !== undefined) { var bsz = senseField({ field: c.bodySize }, SENSE_RANGE_KINDS, fieldIds, secretIds); if (bsz) out.bodySize = bsz; }   // 1.6.2 (asked by a campaign's build: a body in the way judged by steps where an attack reads doublings): the field A body in the way reads as TargetSize and BodySize, judged as targetSize is; absent, it reads targetSize
    if (Array.isArray(c.targetReads)) { var trd = []; c.targetReads.slice(0, TARGET_READS * 4).forEach(function(x) { if (trd.length >= TARGET_READS) return; var t1 = senseField({ field: x }, SENSE_RANGE_KINDS, fieldIds, secretIds); if (t1 && trd.indexOf(t1) < 0) trd.push(t1); }); if (trd.length) out.targetReads = trd; }   // 1.6.0: and the others a roll reads as Target.<key>, each judged the same way
    if (typeof c.targetHit === 'string' && FIELD_ID.test(c.targetHit) && isObj(fieldIds) && hasOwn(fieldIds, c.targetHit) && fieldIds[c.targetHit] === 'item-list') out.targetHit = c.targetHit;   // 1.6.0 (B5): the item list of a target's sheet whose rows are its hit locations, read as Target.Hit.<name>, the same in both views
    if (typeof c.steal === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(c.steal)) out.steal = c.steal;   // 1.6.2 (backlog 42, fold 3b): the Pickpocket roll, in both views (a player presses it); cleanSystem keeps it only where that roll is
    if (pl !== true && isObj(c.loot)) { var lootIf = cleanFormulaText(c.loot['if']); if (lootIf) out.loot = { 'if': lootIf }; }   // 1.6.2 (backlog 42, fold 3): Can be looted where, read on an NPC's sheet on the host alone
    if (c.hideResist === true) out.hideResist = true;   // 1.6.2: Hide what a defense needs, true only, the same in both views
    var arcsC = cleanArcs(c.arcs); if (arcsC) out.arcs = arcsC;   // 1.6.2 (vehicles, fold (b), rebuilt): the system's own arcs, the same in both views
    var terC = cleanTerrainKinds(c.terrain); if (terC) out.terrain = terC;   // 1.6.2 (backlog 57): the system's kinds of terrain, the same in both views
    var ps = cleanPostures(c.postures, viewKinds); if (ps) out.postures = ps;   // conditions C3: the system's own postures (absent: the seven)
    if (c.postureOnAttack === true) out.postureOnAttack = true;   // 1.6.0: an attack reads its target's posture (Target.PostureRanged, Target.Aimed, Target.CoverOrPosture), the same in both views
    var ir = cleanInitRules(c.initiative, F); if (ir) out.initiative = ir;   // initiative O2: how ties of initiative break (absent: they keep their place)
    var hr = cleanHeightRules(c.height, F); if (hr) out.height = hr;   // item 19 H1: what height does (absent: nothing, as before); H2: its table or formula
    var dm = cleanDamageRules(c.damage, viewKinds, resIds, fl, pl === true); if (dm) out.damage = dm;   // 1.5.6: the damage step (absent: none)
    var bl = pl === true ? null : cleanBlastRules(c.blast, F); if (bl) out.blast = bl;   // 1.5.8 explosives: the GM's own (the host throws, places and applies)
    if (bl && bl.scale && !(viewKinds && SCALE_KINDS[viewKinds[bl.scale]] === 1)) { delete bl.scale; if (!Object.keys(bl).length) delete out.blast; }   // 1.6.2 (vehicles, fold (e)): a sheet's scale is a number field of the view
    if (c.unit === 'ft' || c.unit === 'm') out.unit = c.unit;   // 1.6.2 (vehicles, fold (e); the owner, by prompt): the system's own distance unit, absent yards, the same in both views
    var tbs = pl === true ? null : cleanBars(c.bars, resIds); if (tbs) out.bars = tbs;   // backlog 28: the token bars, the GM's own (the host works out what each player is shown)
    var hds = pl === true ? null : cleanHolds(c.holds); if (hds) out.holds = hds;   // 1.6.0 Who holds whom, the GM's own (the host alone works it out)
    return out;
}
// 1.5.8 explosives (the owner, 2026-10-25, by prompt: "Blast damage by the book", "Throw like the site"): combat.blast, the GM's view alone, each
// part a formula and each absent where it does not clean (with none a blast is what it always was):
//   fall     a token's share of a blast, read with BlastDamage, BlastDistance (yards, height counted), BlastDice and Direct only, no dice; with
//            it, each share goes through the damage step where the system has one (its DR, the blast's damage type, the pool), else off the
//            damage resource as before
//   roll     the throw's roll, a check: ThrowSkill stands for the item's throw skill, and RangeMod and TargetDistance read the throw's aim;
//            with none a throw lands where it is aimed
//   scatter  how many yards a miss lands from its aim, read with Margin (how far it missed) and ThrowDistance (yards to the aim), dice
//            allowed; with none, Margin yards and never more than half the distance thrown
//   ways     how many ways a miss may go, 6 (the six sides of a hex, a d6) or 8; with none, 6
//   fuse     'turn': a thrown explosive goes off at the start of the next turn of the fight on its map (with none, or no fight there, at once)
//   hand     where a throw's critical failure goes off in the thrower's hand, read with Natural (its dice) alone, no dice; else it drops
//            at the thrower's feet
//   max, min how far and how near a thing may be thrown, in yards: the thrower's sheet and the item's row (Row.) read, no dice
//   launch   1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 1): how a launched round that misses lands, each part absent for the
//            book's reading where it has ruled (fix log (eu), H1) and the plan's where it has not: now (true: a round that scatters goes off
//            where it lands at once; absent: it waits for the fuse, on a thrown grenade's timing, as the book rules), fumble ('feet':
//            a critical failure goes off at the shooter's feet; 'none': it spends the round and goes nowhere; absent: a miss by its margin),
//            stop ('past': a round that flies straight passes the characters before the target it missed; 'walls': it stops at walls alone;
//            absent: at the first wall or character), glance (true: a character it stops on is not struck directly) and stray (1.6.0: a dice
//            formula with no names, the yards off the first round's landing a burst's round lands where it failed; absent: the GM places it with Launch)
//   frag     1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2): how an item's fragmentation is rolled, each part absent for the plan's
//            reading where the book is open: reach (how far it reaches in yards, read with FragDice, the dice it rolls, alone, no dice; absent:
//            the blast's own radius, and never less), type (the damage type's key of a fragmentation whose item names none; absent: the blast's),
//            cover ('total': only total cover stops it, and a token partly behind cover takes it all; absent: the system's cover outcomes, as
//            the blast), each (true: each token rolls its own; absent: one roll for every token, H5), direct (true: the token struck directly
//            takes a hit of its own roll; absent: it takes the same roll as the others) and ad (true: the item's armor divisor counts against
//            it too; absent: none, H6)
//   resist   1.5.9 (the book's (es), section 2's affliction half): the resist roll an affliction makes each character it reaches roll, a check,
//            dice allowed: Resist stands for the item's resist target (3d6 <= Resist); with none an affliction is not rolled and the GM is told
//            who must resist and against what
//   hurt     'share': an affliction that reaches those the blast hurt reaches those any share of the blast or its fragmentation reached;
//            absent: those it wounded, after DR (H7, the plan's reading)
//   each     1.6.0 (the core's gap 8): the dice each character in the blast rolls of its own, read with BlastDice (the dice of the blast's
//            damage), BlastDistance, Direct and Centre, no dice: the blast's damage formula is rolled for each at that many dice (blastcore
//            diceAt), and none where it reads below 1; a falloff reads each one's own roll as BlastDamage. absent: one roll for all, as before
//   eachAdd  true, only beside each (the core's rule: "that die's add goes with it"): the formula's plain adds are scaled with its dice, so
//            4d6+4 at 3 dice is 3d6+3 (blastcore diceAt's third argument); absent, the adds stay whole
//   fills    1.6.0: a number stat of a blast's list: the yards the item fills, read by the falloff as BlastFills, 0 for none. With it the falloff may
//            give the whole roll to everyone in reach. The blast's own radius still says who is in it
//   fillCover 'total', only beside fills: an item that fills is stopped by total cover alone; absent, the cover outcomes, as any blast
//   noDrop   1.6.0: a number stat of a blast's list that says no drop to the ground answers this item, read by the falloff as BlastNoDrop, 1 for a stat that is not 0
//   itemScale 1.6.2 (the core's gap 213: a starship warhead is �6): a number stat of a blast's list, the item's own scale, read by the falloff and each
//            victim's dice as BlastScale; 1 for none, 0 or a figure that is no number above 0
//   eachBy   'victim', only beside each (the owner, by prompt: "the gm or the victim can roll, controlled by a setting"): each character's
//            player gets a card whose Roll asks the host to roll it, an NPC's card the GM's; absent: the host rolls each at once
var FRAG_NAMES = Object.freeze({ fragdice: 1, blastdice: 1, mapcell: 1, blastscale: 1 });   // 1.6.2 (the CORE session's batch 6, 8): and BlastScale, the firing row's own scale   // 1.6.0: and BlastDice, the dice the blast's own damage rolls
var BLAST_FALL =Object.freeze({ blastdamage: 1, blastdistance: 1, blastdice: 1, direct: 1, centre: 1, blastfills: 1, blastnodrop: 1, blastscale: 1, mapcell: 1, hitscale: 1, 'env.': 1 });   // 1.6.2 (vehicles, fold (e)): MapCell, one cell of the map in the system's own unit; HitScale, the scale of the one it hits   // 1.6.2 env.: and each Environment reading where it goes off, as Env.<key>   // Centre: 1 for a token in the blast's own cell; 1.6.0: BlastFills and BlastNoDrop, what the two stats below read
var BLAST_EACH = Object.freeze({ blastdistance: 1, blastdice: 1, direct: 1, centre: 1, blastfills: 1, blastnodrop: 1, blastscale: 1, mapcell: 1, hitscale: 1, 'env.': 1 });
// 1.6.2 (build 14: a blast at scale, half its reach in vacuum, double in water): the Combat tab's Blast radius, a formula with no dice of BlastRadius (the
// item's own radius, in yards) and the Environment readings where it goes off; what it gives, above 0, is the blast's radius, else the item's own
var BLAST_RADIUS = Object.freeze({ blastradius: 1, mapcell: 1, 'env.': 1, blastdice: 1, blastscale: 1 });   // 1.6.2 (8): and the dice the blast rolls and the firing row's own scale, so its reach may be set a die and by the weapon   // 1.6.0 (the core's gap 8): what the dice each victim rolls may read, an item that fills its area among it, since a blast that rolls per victim rolls before any falloff
function blastFormula(text, F, names, dice) {
    var t = cleanFormulaText(text); if (!t) return '';
    if (!F || typeof F.parse !== 'function') return '';
    var p = F.parse(t); if (!p || !p.ok || !p.ast || (!dice && hasDice(p.ast.body))) return '';
    if (names && !(Array.isArray(p.names) ? p.names : []).every(function(n) { return typeof n === 'string' && (names[lower(n)] === 1 || (names['env.'] === 1 && /^env\.[a-z][a-z0-9_]{0,23}$/i.test(n))); })) return '';   // 1.6.2: Env.<key> where its names allow it
    return t;
}
// 1.6.0 A blast's own Defense roll: combat.blast.defend, the GM's view alone, { roll, yards?, noFrag?, posture?, count? }. roll a system roll by its id,
// which its Needs may hold back (surprise, a character who cannot act); yards added to the distance on a success, more than 0 and 100 at most, to the
// hundredth; noFrag, true, no fragmentation on a success; posture the id of a posture a success leaves the token in; count the id of a number or pool
// field that takes 1 pass or fail. null with no roll. whiteboard.js defendAsk is the one judge, net.js defendPost the card
function cleanBlastDefend(v) {
    if (!isObj(v) || typeof v.roll !== 'string' || !ROLL_ID.test(v.roll)) return null;
    var o = { roll: v.roll }; if (typeof v.yards === 'number' && isFinite(v.yards) && v.yards > 0) o.yards = Math.min(100, Math.round(v.yards * 100) / 100) || undefined; if (o.yards === undefined) delete o.yards;
    if (v.noFrag === true) o.noFrag = true; if (typeof v.posture === 'string' && POSTURE_ID.test(v.posture)) o.posture = v.posture; if (typeof v.count === 'string' && FIELD_ID.test(v.count)) o.count = v.count;
    return o;
}
// 1.6.2 (vehicles, fold (e); the owner, by prompt: "One cell in the system's own distance unit. The system sets its base unit (yards, feet, meters)
// once; a blast's formulas get a name worth one cell of the map in that unit, whatever the map is set in", and of a victim's scale, "One field the
// system names"): MapCell, one cell of a map in the system's unit (combat.unit, absent yards), to the millionth; and the kinds a sheet's scale may be
var SCALE_KINDS = Object.freeze({ number: 1, formula: 1, skill: 1 });
function mapCellIn(sys, mp) {
    var sc = mapCellScale(mp), yd = sc.per * MAP_UNITS[sc.unit], u = isObj(sys) && isObj(sys.combat) && (sys.combat.unit === 'ft' || sys.combat.unit === 'm') ? sys.combat.unit : 'yd';
    var v = yd / MAP_UNITS[u]; return typeof v === 'number' && fin(v) && v > 0 ? Math.round(v * 1e6) / 1e6 : 1;
}
// HitScale: the scale field's figure on the sheet a blast hits, as the sheet works it out; 1 for a token with no sheet, no such field or no number
function hitScaleOf(sys, ch, F) {
    var id = isObj(sys) && isObj(sys.combat) && isObj(sys.combat.blast) && typeof sys.combat.blast.scale === 'string' ? sys.combat.blast.scale : '', f = id ? fieldById(sys, id) : null;
    if (!f || !isObj(ch) || !F) return 1; var v = null; try { var r = makeResolver(sys, ch, F); v = r(lower(f.key)); } catch (e) { v = null; }
    return typeof v === 'number' && fin(v) ? v : v === true ? 1 : 1;
}
function cleanBlastRules(v, F) {
    if (!isObj(v)) return null;
    var out = {}, fa = blastFormula(v.fall, F, BLAST_FALL, false), ro = blastFormula(v.roll, F, null, true), sc = blastFormula(v.scatter, F, { margin: 1, throwdistance: 1 }, true), mx = blastFormula(v.max, F, null, false), mn = blastFormula(v.min, F, null, false), hd = blastFormula(v.hand, F, { natural: 1 }, false);
    if (fa) out.fall = fa; if (ro) out.roll = ro; if (sc) out.scatter = sc; if (mx) out.max = mx; if (mn) out.min = mn; if (hd) out.hand = hd;
    if (v.ways === 6 || v.ways === 8) out.ways = v.ways; if (v.fuse === 'turn') out.fuse = 'turn';
    if (isObj(v.launch)) { var lo = {}; if (v.launch.now === true) lo.now = true; if (v.launch.fumble === 'feet' || v.launch.fumble === 'none') lo.fumble = v.launch.fumble; if (v.launch.stop === 'past' || v.launch.stop === 'walls') lo.stop = v.launch.stop; if (v.launch.glance === true) lo.glance = true; var strv = blastFormula(v.launch.stray, F, {}, true); if (strv) lo.stray = strv; if (Object.keys(lo).length) out.launch = lo; }   // 1.5.9 (es): what a launched round's miss does where the book is open
    if (isObj(v.frag)) {   // 1.5.9 (es): how an explosive's fragmentation is rolled and whom it reaches
        var fo = {}, frc = blastFormula(v.frag.reach, F, FRAG_NAMES, false); if (frc) fo.reach = frc;
        if (typeof v.frag.type === 'string' && STAT_KEY.test(v.frag.type) && v.frag.type.length <= 24) fo.type = v.frag.type;
        if (v.frag.cover === 'total') fo.cover = 'total'; if (v.frag.each === true) fo.each = true; if (v.frag.direct === true) fo.direct = true; if (v.frag.ad === true) fo.ad = true;
        if (Object.keys(fo).length) out.frag = fo;
    }
    var rsv = blastFormula(v.resist, F, null, true); if (rsv) out.resist = rsv;   // 1.5.9 (es): an affliction's resist roll, Resist standing for its target
    if (v.hurt === 'share') out.hurt = 'share';
    if (v.flying === true) out.flying = true;   // 1.6.2 (vehicles, fold (d); the core's answer (A)): a blast hurts things in flight inside it as any token, off unless ticked   // H7: those it hurt are those any share reached (absent: those it wounded, after DR)
    var flK = statKey(typeof v.fills === 'string' ? v.fills.trim() : '', F), ndK = statKey(typeof v.noDrop === 'string' ? v.noDrop.trim() : '', F); if (flK) { out.fills = flK; if (v.fillCover === 'total') out.fillCover = 'total'; } var isK = statKey(typeof v.itemScale === 'string' ? v.itemScale.trim() : '', F); if (isK) out.itemScale = isK; if (ndK) out.noDrop = ndK;   // 1.6.0: the stats a blast's item fills and refuses a drop by
    if (typeof v.kind === 'string' && STAT_KEY.test(v.kind)) out.kind = v.kind;   // 1.6.0: the kind of blow its shares and fragmentation carry, a key of the damage rules' kinds (whiteboard.js blastKind hands on one that is there)
    var eaB = blastFormula(v.each, F, BLAST_EACH, false); if (eaB) { out.each = eaB; if (v.eachAdd === true) out.eachAdd = true; if (v.eachBy === 'victim') out.eachBy = 'victim'; }   // 1.6.0 (the core's gap 8): each victim's own dice, and who rolls them
    var dfB = cleanBlastDefend(v.defend); if (dfB) out.defend = dfB;   // 1.6.0: a blast's own Defense roll
    var rdB = blastFormula(v.radius, F, BLAST_RADIUS, false); if (rdB) out.radius = rdB;   // 1.6.2: Blast radius
    if (typeof v.scale === 'string' && FIELD_ID.test(v.scale)) out.scale = v.scale;   // 1.6.2 (vehicles, fold (e)): the number field each sheet's scale is, read as HitScale (cleanCombat holds it to a number field of the view)
    return Object.keys(out).length ? out : null;
}
// 1.5.9 (es): a launcher list's Flies at most (spec.chamber.reach): the yards a round that flies straight goes, a formula of the launcher row's
// own names, no dice; '' where it does not clean
function cleanReach(text, F) { return blastFormula(text, F, null, false); }
// ... and an item's blast extras, kept in its area beside its radius: its damage type's key (a key of the Combat tab's types), whether
// going off uses one up (use, true only), whether it is placed, not thrown (place, true only: a mine), and the trigger radius in yards (trig,
// 0.5 to 100 to the tenth, only beside place), and its armor divisor (ad, 0.1 to 100 to the tenth, never 1). 1.5.9 (es): how a round fired
// from a launcher lands when the roll misses (flight: 'scatter', as a missed throw; 'line', straight on to the first wall or character; never
// beside place; absent: the GM places it). The same in both views (none of it is secret: the damage formula is). 1.5.9 (the book's (es),
// docs/BOOK_ES_ET_PLAN.md section 2): its fragmentation (frag: a dice formula's text, as the damage's) and that fragmentation's damage type
// (fragType, a key, only beside frag), kept in the GM's view alone (gmView), as the damage formula is: only the host rolls it
// 1.6.2 (vehicles, fold (d), things in flight; the core's answers D1 to D5): an item that flies once launched keeps its own figures, no sheet: HP
// (1 to 1,000,000) and Protection (0 or more), its Size (-20 to 20), its Speed (a formula with no dice of the launcher's names and the map's
// factors, read as whole cells a round), the rounds it flies (1 to 99), straight (path 'line') or homing (absent), the system roll made on arrival
// as the launcher's attack (roll, a roll's id; absent: its blast alone), and end 'off' where running out of rounds sets it off where it stands
// (absent: it is gone). The same in both views. null without a Speed it can keep; rounds missing or under 1 read as 1
function cleanFlies(v) {
    // 1.6.3 (Fulllion's rulings of 2026-11-20: the cleaner never drops what was saved for lacking a box, and falls back to a plain figure): rounds
    // that are missing, no number or under 1 read as 1 round. Only a Speed that cannot be kept still drops what it is once launched
    if (!isObj(v)) return null; var sp = cleanFormulaText(v.speed), rd = typeof v.rounds === 'number' && fin(v.rounds) ? Math.round(v.rounds) : 1; if (!sp) return null;
    var o = { speed: sp, rounds: Math.max(1, Math.min(99, rd)), hp: typeof v.hp === 'number' && fin(v.hp) && v.hp >= 1 ? Math.min(1e6, Math.round(v.hp)) : 1 };
    if (typeof v.pro === 'number' && fin(v.pro) && v.pro > 0) o.pro = Math.min(1e6, Math.round(v.pro * 100) / 100);
    if (typeof v.size === 'number' && fin(v.size) && v.size !== 0) o.size = Math.max(-20, Math.min(20, Math.round(v.size)));
    if (v.path === 'line') o.path = 'line'; if (typeof v.roll === 'string' && ROLL_ID.test(v.roll)) o.roll = v.roll; if (v.end === 'off') o.end = 'off';
    return o;
}
function areaExtra(out, src, gmView) {
    if (!isObj(out) || !isObj(src)) return out;
    if (typeof src.type === 'string' && STAT_KEY.test(src.type) && src.type.length <= 24) out.type = src.type;
    if (src.use === true) out.use = true;
    if (typeof src.loc === 'string') { var lcA = cutText(src.loc, 60); if (lcA) out.loc = lcA; }   // 1.6.2 (the CORE session's batch 6, 11): the location its blast strikes, by name (whiteboard.js torsoOf)
    if (typeof src.ad === 'number' && fin(src.ad) && src.ad > 0) { var adv = Math.max(0.1, Math.min(100, Math.round(src.ad * 10) / 10)); if (adv !== 1) out.ad = adv; }
    if (src.place === true) { out.place = true; var tg = typeof src.trig === 'number' && fin(src.trig) && src.trig > 0 ? Math.max(0.5, Math.min(100, Math.round(src.trig * 10) / 10)) : 0; if (tg) out.trig = tg; }
    else if (src.flight === 'scatter' || src.flight === 'line') out.flight = src.flight;   // 1.5.9 (es): a placed mine is never launched
    if (gmView === true) { var fg = cleanFormulaText(src.frag); if (fg) { out.frag = fg; if (typeof src.fragType === 'string' && STAT_KEY.test(src.fragType) && src.fragType.length <= 24) out.fragType = src.fragType; } }   // 1.5.9 (es) fragmentation: the GM's view alone
    if (gmView === true) { var af = cleanAffs(src.aff); if (af) out.aff = af; }   // 1.5.9 (es) afflictions: the GM's view alone, as the damage formula
    if (gmView === true) { var clA = cleanCloud(src.cloud); if (clA) out.cloud = clA; }   // 1.6.2: the cloud it leaves, the GM's view alone
    return out;
}
// 1.6.2 (the owner, 2026-11-08, by prompt: "On the item's blast", how long "depends on the system needs, rounds else game time works for CORE",
// and it "stays put by default"): the cloud an explosive leaves where it goes off (area.cloud). n, how long, a formula that may roll dice, in u (a
// unit as an affliction's Lasts: turns, read as rounds of a fight, or a time word or one of the system's own units; absent: it stays until the GM
// clears it); r, its radius in yards (absent: the blast's); smoke, true where it blocks sight as smoke does; fx, an effect of the library put on
// whoever stands in it; roll, a system roll the GM's button rolls for everyone in it. An empty one is a cloud and nothing more
function cleanCloud(v) {
    if (!isObj(v)) return null; var o = {}, n = cleanFormulaText(v.n); if (n) { o.n = n; o.u = affUnit(v.u) || 'turns'; }
    if (typeof v.r === 'number' && fin(v.r) && v.r > 0) o.r = Math.max(0.5, Math.min(1000, Math.round(v.r * 10) / 10));
    if (v.smoke === true) o.smoke = true;
    if (typeof v.fx === 'string' && /^e_[A-Za-z0-9_]{1,24}$/.test(v.fx)) o.fx = v.fx;
    if (typeof v.roll === 'string' && /^r_[A-Za-z0-9_]{1,24}$/.test(v.roll)) o.roll = v.roll;
    return o;
}
// 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2, its affliction half): an explosive's afflictions (area.aff), at most
// LIMITS.areaAffs, each { vs, fx, who, needs, lasts }: vs, the resist target, a formula of the VICTIM's names (HT-2; the validator reads it with
// no dice); fx, the id of an effect of the system's library put on at a failed resist (cleanSystem drops one its view does not hold); who, 'all'
// (every character in the blast) or absent (those it hurt); needs, a formula of the victim's names that must hold for it to touch them at all
// (not Robot, no dice); lasts, { n, u }: how long the effect lasts, a formula that may roll dice and a unit (turns, seconds, minutes, hours, days
// or the key of one of the system's own time units), absent for the effect's own duration. Anything else is no key; null where none is left.
// 1.6.4 (the full test's gap 24; Fulllion, 2026-11-24): who 'spread', a pool spread over the characters in the blast, lowest figure first, each needing
// its figure covered (blastcore spreadCover judges it): by, the id of the field that is each one's figure (read as that character), and pool, its own
// dice, rolled once as it goes off; both required, or the affliction is dropped. resist 'roll' (beside spread alone): each covered one makes the usual
// resist roll and only a failure puts the effect on; absent, being covered puts it on with no roll, and then vs may be empty
var AFF_UNITS = Object.freeze({ turns: 1, seconds: 1, minutes: 1, hours: 1, days: 1 });
function affUnit(u) { return typeof u === 'string' && (Object.prototype.hasOwnProperty.call(AFF_UNITS, u) || (STAT_KEY.test(u) && TIME_WORDS[lower(u)] !== 1)) ? u : ''; }
// 1.6.4 (gap 24): the spread keys of an affliction, { who, by, pool, resist? }, or null where it is no spread or lacks its field or its pool (poolText,
// the pool as the caller cleaned it). blastcore cleanAffs keeps the same keys by its own reading
function affSpreadOf(a, poolText) {
    if (!isObj(a) || a.who !== 'spread' || typeof a.by !== 'string' || !FIELD_ID.test(a.by) || !poolText) return null;
    var o = { who: 'spread', by: a.by, pool: poolText }; if (a.resist === 'roll') o.resist = 'roll'; return o;
}
function cleanAffs(v) {
    if (!Array.isArray(v)) return null;
    var out = [];
    for (var i = 0; i < v.length && i < LIMITS.areaAffs * 20 && out.length < LIMITS.areaAffs; i++) {
        var a = v[i]; if (!isObj(a)) continue;
        var vs = cleanFormulaText(a.vs), fx = typeof a.fx === 'string' && EFFECT_ID.test(a.fx) ? a.fx : '', sp = affSpreadOf(a, cleanFormulaText(a.pool));
        if (a.who === 'spread' && !sp) continue;   // 1.6.4: a spread with no field or no pool is dropped, never read as another reach
        if (!fx || (!vs && !(sp && !sp.resist))) continue;
        var o = vs ? { vs: vs, fx: fx } : { fx: fx }; if (a.who === 'all') o.who = 'all'; else if (sp) Object.assign(o, sp);
        var nd = cleanFormulaText(a.needs); if (nd) o.needs = nd;
        if (isObj(a.lasts)) { var ln = cleanFormulaText(a.lasts.n), lu = affUnit(a.lasts.u); if (ln && lu) o.lasts = { n: ln, u: lu }; }
        out.push(o);
    }
    return out.length ? out : null;
}
// how many game seconds n of an affliction's unit is: a turn the system's round, the four plain words, else one of the system's own time units by
// key; 0 where it is no time (the effect's own duration then stands)
function affLastsSecs(sys, n, u) {
    if (typeof n !== 'number' || !fin(n) || n <= 0) return 0;
    var us = u === 'turns' ? roundSecs(sys) : Object.prototype.hasOwnProperty.call(TIME_SECS, u) ? TIME_SECS[u] : 0;
    if (!us && typeof u === 'string') { var t = isObj(sys) && isObj(sys.combat) && isObj(sys.combat.turn) ? sys.combat.turn : null; (t && Array.isArray(t.units) ? t.units : []).forEach(function(x) { if (!us && isObj(x) && typeof x.key === 'string' && lower(x.key) === lower(u) && typeof x.secs === 'number' && fin(x.secs) && x.secs > 0) us = x.secs; }); }
    return us > 0 ? Math.min(1e9, Math.round(n * us * 1000) / 1000) : 0;
}
// Item 19 H1 (the owner's answer, 2026-09-30: a rule of the system's): the system's height rules (combat.height) — rule 'clears'
// (height clears low cover: looked at from higher than a see-over piece it gives no cover; from below the target it hides them, as total
// cover; walls block at any height), or absent: flat, height changes no cover (every existing system, as before). Nothing: absent
// H2 (the owner's answer: a table like the Range box): the height modifier's table or formula — unit (ft or m; absent: yards), formula (a
// modifier from HeightDiff alone: the roller's height over the target's in that unit, negative looking up; no dice, no other name; kept, it
// wins and the steps go), steps (each { to, mod }: "up to 2 yards above: 0", a height difference within 1,000,000 either way, below 0
// looking up, sorted, the first of each kept; a modifier within 1000 either way, to the hundredth). A unit with neither: none
// Item 19b H4 (the owner's answer of 2026-10-01): line3d (true only) — the true 3D sightline: a piece with a height stops a line of sight or
// of cover only where the straight line from the eye to the target runs at or below it (fog.js); eye — the standing height, in yards: how
// far above its elevation a token's eye sits (above 0, at most 100, to the hundredth; kept only with the line; absent: the eye is at the
// token's elevation). The same in both views: a player's own screen judges as the host does
var HEIGHT_UNITS = Object.freeze({ ft: 1, m: 1 });
function heightFormulaOk(text, F) {
    if (!F || typeof F.parse !== 'function') return false;
    var p = F.parse(text); if (!p || !p.ok || !p.ast || hasDice(p.ast.body)) return false;
    return (Array.isArray(p.names) ? p.names : []).every(function(n) { return typeof n === 'string' && lower(n) === 'heightdiff'; });
}
function cleanHeightRules(v, F) {
    if (!isObj(v)) return null;
    var out = {}; if (v.rule === 'clears') out.rule = 'clears';
    if (typeof v.unit === 'string' && hasOwn(HEIGHT_UNITS, v.unit)) out.unit = v.unit;
    var fm = cleanFormulaText(v.formula);
    if (fm && heightFormulaOk(fm, F)) out.formula = fm;
    else {
        var st = [], seen = map();
        (Array.isArray(v.steps) ? v.steps : []).forEach(function(s) {
            if (st.length >= LIMITS.heightSteps || !isObj(s) || !fin(s.to) || Math.abs(s.to) > 1e6 || !fin(s.mod)) return;
            var k = String(s.to); if (seen[k]) return;
            seen[k] = 1; st.push({ to: s.to === 0 ? 0 : s.to, mod: rangeModNum(s.mod) });
        });
        st.sort(function(a, b) { return a.to - b.to; });
        if (st.length) out.steps = st;
    }
    if (!out.formula && !out.steps) delete out.unit;
    if (v.line3d === true) { out.line3d = true; var ey = fin(v.eye) ? Math.round(Math.min(v.eye, 100) * 100) / 100 : 0; if (ey > 0) out.eye = ey; }
    return Object.keys(out).length ? out : null;
}
// ... the modifier its table or formula gives at a height difference in its unit (the table's first step that reaches it; below the first,
// the first; past the last, the last), or null with neither, a difference that is no number, or a formula that gives no finite number
function heightModOf(hr, diff, F) {
    if (!isObj(hr) || typeof diff !== 'number' || !isFinite(diff)) return null;
    var v = null;
    if (hr.formula) {
        if (!F || typeof F.evaluate !== 'function') return null;
        var res = F.evaluate(hr.formula, { vars: function(l) { return l === 'heightdiff' ? diff : undefined; } });
        if (res && res.ok && typeof res.value === 'number' && isFinite(res.value)) v = res.value;
    } else if (Array.isArray(hr.steps) && hr.steps.length) {
        for (var i = 0; i < hr.steps.length && v === null; i++) if (diff <= hr.steps[i].to) v = hr.steps[i].mod;
        if (v === null) v = hr.steps[hr.steps.length - 1].mod;
    }
    return v === null ? null : rangeModNum(v);
}
function heightIn(yd, unit) { var u = typeof unit === 'string' && hasOwn(HEIGHT_UNITS, unit) ? unit : 'yd', d = typeof yd === 'number' && isFinite(yd) ? yd / MAP_UNITS[u] : 0; d = Math.round(d * 1e6) / 1e6; return d === 0 ? 0 : d; }   // yards, in a height rule's unit
// What the system's height table or formula says between two tokens: { mod, diff, unit } (diff: the first's height over the second's, in the
// rule's unit; unit yd, ft or m), or null with no table or formula. opts: { F, elev } (elev: the elevation feature on; off, the difference is 0)
function heightOf(sys, from, to, opts) {
    opts = isObj(opts) ? opts : {};
    var hr = sys && isObj(sys.combat) ? cleanHeightRules(sys.combat.height, opts.F) : null; if (!hr || !(hr.formula || hr.steps)) return null;
    var el = function(t) { var s = stanceCtx(t, { elevation: true }); return (s ? s.elevation : 0) + groundYd(opts, t); }, u = hr.unit || 'yd';   // item 19b H5: on the ground it stands on
    var d = opts.elev && isObj(from) && isObj(to) ? heightIn(el(from) - el(to), u) : 0, m = heightModOf(hr, d, opts.F);
    return m === null ? null : { mod: m, diff: d, unit: u };
}
// 1.5.5: statsAsk (true only, in place of ownerStats): players ASK for a change of their own copies' stats, and the GM approves it in the Review
// (statAsk); an older Waypoint drops the key and reads the stats as the GM's alone, so no ask is ever sent to a host that cannot take it
// Stage 6 F4c2: the system's rules for item lists (the Lists tab's Rules box) — ownerStats: players may change the stats of their own copies
// (Setting A). Both views carry it: a player's sheet draws its ✎ and their own check judges by it, the host by the full system. null when unset
// 1.6.0: two names of copies held again are the same name where they read alike as the site's organization key reads them: lower case,
// each run of characters that are no letter or digit one space, trimmed, so Republic-Navy and Republic  Navy are one
function againFold(s) { return String(typeof s === 'string' ? s : '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
// 1.6.0: a list roll's, an action's or a counter's other names, each shown on the rows where its formula holds (the first that holds wins; none:
// its own label). A name and a formula with no dice each, ALT_MAX at most
var ALT_MAX = 40;
// 1.6.0 R4 (backlog 180; the owner, by prompt: "A. After the name", "A. Tint and an edge", "A. The badge itself"): a list's row badges, each
// words shown on a row only while a formula of the row holds (no dice), in a tone of TONES or plain, as a pill after the name or as a line under
// the row (line), tinting its row in its tone (tint) or pulsing (pulse), with a tip in words. BADGE_MAX at most; the same in both views but where
// the players' view drops one that reads a GM-only name
var BADGE_MAX = 120;   // 1.6.0, backlog 195: twelve (eight before); 1.6.2: ten times that
function cleanBadges(v, F) { if (!Array.isArray(v)) return null; var out = []; for (var i = 0; i < v.length && i < BADGE_MAX * 4 && out.length < BADGE_MAX; i++) { var b = v[i]; if (!isObj(b)) continue; var w = cutText(b.words, LIMITS.text), fi = budgetFormula(b.if, F); if (!w || !fi) continue; var o = { words: w, if: fi }; if (typeof b.tone === 'string' && Object.prototype.hasOwnProperty.call(TONES, b.tone)) o.tone = b.tone; if (b.line === true) o.line = true; if (b.tint === true) o.tint = true; if (b.pulse === true) o.pulse = true; var tp = cutText(b.tip, LIMITS.noteText); if (tp) o.tip = tp; out.push(o); } return out.length ? out : null; }
// 1.6.0 R7 (backlog 180; the owner, by prompt: "B. In a small box at the end", "A. Its target or its dice"): what a list roll's button shows after
// its name: '@fig', its own figure, or a column of the list by its key; anything else none
function rollShowOf(v, cols) { if (v === '@fig') return '@fig'; if (typeof v !== 'string' || !v || !Array.isArray(cols)) return ''; var lv = lower(v); for (var i = 0; i < cols.length; i++) if (isObj(cols[i]) && typeof cols[i].key === 'string' && lower(cols[i].key) === lv) return cols[i].key; return ''; }
// R7: a roll's own figure, worked out with the names handed in: a check whose one side is rolled says the number it rolls against; any other roll
// its dice as plain groups and a number ("2d6+1"), told from what it gives at every die's least and most, so a roll that is no sum of dice and a
// number (a die taken away, kept, rerolled or exploding, a die times something) says nothing ('')
function rollFigOf(text, vars, F) {
    if (typeof text !== 'string' || !text || !F || typeof F.evaluate !== 'function') return '';
    var lo, hi; try { lo = F.evaluate(text, { vars: vars, random: function() { return 1; } }); hi = F.evaluate(text, { vars: vars, random: function(n) { return n; } }); } catch (x) { return ''; }
    if (!lo || !hi || !lo.ok || !hi.ok || !lo.breakdown || !hi.breakdown) return '';
    var topOf = function(r) { var cs = Array.isArray(r.breakdown.checks) ? r.breakdown.checks : []; for (var i = 0; i < cs.length; i++) if (cs[i] && cs[i].top) return cs[i]; return null; }, tl = topOf(lo), th = topOf(hi);
    if (tl || th) { if (!tl || !th) return ''; if (tl.right === th.right && tl.left !== th.left) return fmtNum(tl.right); if (tl.left === th.left && tl.right !== th.right) return fmtNum(tl.left); return ''; }
    if (typeof lo.value !== 'number' || typeof hi.value !== 'number' || !isFinite(lo.value) || !isFinite(hi.value)) return '';
    var plain = function(d) { return isObj(d) && typeof d.faces === 'number' && d.faces >= 2 && typeof d.count === 'number' && d.count >= 1 && Math.floor(d.count) === d.count && ['dropped', 'rerolled', 'exploded'].every(function(k) { return Array.isArray(d[k]) ? !d[k].length : !d[k]; }) && !(Array.isArray(d.kept) && d.kept.length !== d.count) && !d.capped; };
    var dl = Array.isArray(lo.breakdown.dice) ? lo.breakdown.dice : [], dh = Array.isArray(hi.breakdown.dice) ? hi.breakdown.dice : [];
    if (dl.length !== dh.length) return '';
    var order = [], by = map(), nLo = 0, nHi = 0;
    for (var i = 0; i < dl.length; i++) { if (!plain(dl[i]) || !plain(dh[i]) || dl[i].count !== dh[i].count || dl[i].faces !== dh[i].faces) return ''; var fk = String(dl[i].faces); if (!by[fk]) { by[fk] = 0; order.push(dl[i].faces); } by[fk] += dl[i].count; nLo += dl[i].count; nHi += dl[i].count * dl[i].faces; }
    var kLo = lo.value - nLo, kHi = hi.value - nHi; if (Math.abs(kLo - kHi) > 1e-9) return '';
    if (!order.length) return fmtNum(lo.value);
    var out = order.map(function(fc) { return by[String(fc)] + 'd' + fc; }).join('+'), k = Math.round(kLo * 100) / 100;
    return k > 0 ? out + '+' + fmtNum(k) : k < 0 ? out + '-' + fmtNum(-k) : out;
}
function cleanAlt(v, F) { if (!Array.isArray(v)) return null; var out = []; v.forEach(function(a) { if (out.length >= ALT_MAX || !isObj(a)) return; var fi = budgetFormula(a.if, F), lb = cutText(a.label, LIMITS.label); if (fi && lb) out.push({ if: fi, label: lb }); }); return out.length ? out : null; }
function cleanListRules(v) { if (!isObj(v)) return null; var o = {}; if (v.statsAsk === true) o.statsAsk = true; else if (v.ownerStats === true) o.ownerStats = true; if (v.uploadFacts === true) o.uploadFacts = true; return Object.keys(o).length ? o : null; }   // Stage 6 U2: uploadFacts (setting B) — a player's own row facts from an upload apply at once
// 126, point budgets (the owner, by prompt, 2026-10-06: "A budget you define", and of what a breach does and of when it is watched, "per system
// dictation"). A budget is a name and two formulas, the points a character HAS and the points it has SPENT, with what happens when a player's
// own change would take the character over (refuse, warn or off) and when it is watched (always, while the character is being made, or in
// play). A formula rolls no dice. The same in both views: cleanSystem drops a budget that reads what a player cannot read, so the host and the
// player's own app work out the same figures. At most LIMITS.budgets; absent when there is none
var BUDGET_ID = /^b_[A-Za-z0-9_]{1,24}$/, BUDGET_OVER = Object.freeze({ refuse: 1, warn: 1, off: 1 }), BUDGET_WHEN = Object.freeze({ always: 1, making: 1, play: 1 });
function budgetFormula(text, F) { var t = cleanFormulaText(text), p = t && F && typeof F.parse === 'function' ? F.parse(t) : null; return p && p.ok && p.ast && !hasDice(p.ast.body) ? t : ''; }
// 1.6.0, the map environment (docs/MAP_ENVIRONMENT_PLAN.md 11 to 13; the owner, by prompt: "Any reading a system names", "As the field
// shows", "No reading at all"): the readings a system names, each a key, a label, the NUMBER field the host writes it into, and optionally a
// TOGGLE field the host keeps on while the character's token stands on a map (placed: off, and the number cleared, with no token), a unit
// (temp: stored in degrees Celsius, shown by each viewer's Imperial or Metric; else a few words shown after it) and four bands, each a formula of
// the character's names with no dice in the reading's stored unit (warnLow, dangerLow, warnHigh, dangerHigh), so a trait can widen them. kinds:
// the view's fields by id and kind. At most LIMITS.env; absent when there is none
var ENV_KEY = /^[A-Za-z][A-Za-z0-9_]{0,23}$/, ENV_BANDS = ['warnLow', 'dangerLow', 'warnHigh', 'dangerHigh'];
function cleanEnv(v, kinds, F) {
    var out = [], seen = map(), seenF = map();
    (Array.isArray(v) ? v : []).forEach(function(e) {
        if (out.length >= LIMITS.env || !isObj(e) || typeof e.key !== 'string' || !ENV_KEY.test(e.key) || seen[lower(e.key)]) return;
        if (typeof e.field !== 'string' || !isObj(kinds) || kinds[e.field] !== 'number' || seenF[e.field]) return;
        var o = { key: e.key, label: cutText(e.label, LIMITS.label) || e.key, field: e.field };
        if (typeof e.placed === 'string' && kinds[e.placed] === 'toggle') o.placed = e.placed;
        var u = e.unit === 'temp' ? 'temp' : cutText(e.unit, 12); if (u) o.unit = u;
        ENV_BANDS.forEach(function(k) { var b = budgetFormula(e[k], F); if (b) o[k] = b; });
        seen[lower(e.key)] = 1; seenF[e.field] = 1; out.push(o);
    });
    return out.length ? out : null;
}
// 1.6.0, the map environment, fold 4 (docs/MAP_ENVIRONMENT_PLAN.md 11 and 12; the owner, by prompt: "As drawn"): where a character's readings
// stand against their bands, judged here alone. Each band is a formula of the character's names (Temperature Tolerance shifts them), read with
// the sheet's resolver in the reading's stored unit, and a reading is judged only where its field holds a number: the danger bands first, below
// dangerLow or above dangerHigh, then the warning bands, below warnLow or above warnHigh. A band that cannot be worked out counts for nothing.
// Answers [{ key, label, field, unit, v, band: '' | 'warn' | 'danger', side: '' | 'low' | 'high' }] in the system's order
function envBands(sys, char, F, vars) {
    var out = [], env = isObj(sys) && Array.isArray(sys.env) ? sys.env : [];
    if (!env.length || !isObj(char) || !isObj(char.values) || !F || typeof F.evaluate !== 'function') return out;
    var num = function(text) { var r = null; try { r = F.evaluate(text, { vars: vars, random: noDice }); } catch (e) { r = null; } if (!r || !r.ok) return null; var x = typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value; return typeof x === 'number' && fin(x) ? x : null; };
    env.forEach(function(e) {
        if (!isObj(e) || typeof e.field !== 'string' || typeof e.key !== 'string') return;
        var v = hasOwn(char.values, e.field) ? char.values[e.field] : undefined; if (typeof v !== 'number' || !fin(v)) return;
        if (!vars) { try { vars = makeResolver(sys, char, F); } catch (er) { vars = null; } }
        var b = {}; if (vars) ENV_BANDS.forEach(function(k) { if (typeof e[k] === 'string') { var x = num(e[k]); if (x !== null) b[k] = x; } });
        var band = '', side = '';
        if (hasOwn(b, 'dangerLow') && v < b.dangerLow) { band = 'danger'; side = 'low'; }
        else if (hasOwn(b, 'dangerHigh') && v > b.dangerHigh) { band = 'danger'; side = 'high'; }
        else if (hasOwn(b, 'warnLow') && v < b.warnLow) { band = 'warn'; side = 'low'; }
        else if (hasOwn(b, 'warnHigh') && v > b.warnHigh) { band = 'warn'; side = 'high'; }
        out.push({ key: e.key, label: typeof e.label === 'string' && e.label ? e.label : e.key, field: e.field, unit: typeof e.unit === 'string' ? e.unit : '', v: v, band: band, side: side });
    });
    return out;
}
function envWorst(list) {   // the reading a token's badge speaks for: the first at a danger band, else the first at a warning band, else none
    var w = null; (Array.isArray(list) ? list : []).forEach(function(r) { if (!r || !r.band) return; if (!w || (r.band === 'danger' && w.band !== 'danger')) w = r; }); return w;
}
function cleanBudgets(v, F) {
    var out = [], seen = map();
    (Array.isArray(v) ? v : []).forEach(function(b) {
        if (out.length >= LIMITS.budgets || !isObj(b)) return;
        var id = typeof b.id === 'string' && BUDGET_ID.test(b.id) ? b.id : '', name = cutText(b.name, LIMITS.name), has = budgetFormula(b.has, F), spent = budgetFormula(b.spent, F);
        if (!id || seen[id] || !name || !has || !spent) return;
        seen[id] = 1; out.push({ id: id, name: name, has: has, spent: spent, over: hasOwn(BUDGET_OVER, b.over) ? b.over : 'refuse', when: hasOwn(BUDGET_WHEN, b.when) ? b.when : 'always' });
    });
    return out.length ? out : null;
}
// 1.6.4 Buy off (Fulllion, 2026-11-23, by prompt: a general option of an item list, never one system's word). A list whose rows can be bought
// off names: cost, a formula of the row's own names with no dice, worked out as the sheet stood just before and then kept as that figure;
// f, the NUMBER field the cost is charged to (any number field: points, gold, experience); add, true where the cost is added to that field
// (a field that counts what was spent) instead of taken from it; over, 'warn' where a player who cannot pay is let through and the GM told
// (absent: refuse, a player who cannot pay is stopped and told why; the GM may always, and is told); and ledger, optionally, where a named
// line is recorded: to, an item list whose rows are the lines; by, a number stat of that list that holds the figure; says, a short note on
// the line (absent: "Bought off"). The same in both views: a player's sheet works the figure out for its question. cleanSystem drops what
// names a field or a stat that is not in the view, and the whole option from the players' view where its cost reads a GM-only value
var BUYOFF_SAYS = 60;
function cleanBuyOff(v, F) {
    if (!isObj(v)) return undefined;
    var c = budgetFormula(v.cost, F), fid = typeof v.f === 'string' && FIELD_ID.test(v.f) ? v.f : ''; if (!c || !fid) return undefined;
    var o = { cost: c, f: fid }; if (v.add === true) o.add = true; if (v.over === 'warn') o.over = 'warn';
    if (isObj(v.ledger) && typeof v.ledger.to === 'string' && FIELD_ID.test(v.ledger.to)) {
        var lg = { to: v.ledger.to }, by = typeof v.ledger.by === 'string' ? statKey(v.ledger.by.trim(), F) : '', sy = typeof v.ledger.says === 'string' ? cutText(v.ledger.says.replace(/[\r\n]+/g, ' ').trim(), BUYOFF_SAYS) : '';
        if (by) lg.by = by; if (sy) lg.says = sy; o.ledger = lg;
    }
    return o;
}
// What a budget is worked out from (the owed review, 2026-10-09). NO EFFECT counts in it. Not one made on the spot, in which a player may
// name any field in their view and any amount, the points a character has among them. And not one of the system either: an effect is
// switched with no budget asked, a GM-only one reaches its player as a row of its own that their app could not tell from one made on the
// spot, and a figure that follows a passing effect could be raised, spent against and dropped again. Neither do the changes of a row a
// PLAYER made on the sheet (`own`: a custom row, whose changes its player writes as freely). The changes of an item of the system or its
// library count, and those of a row the GM made: taking, dropping and switching one are each judged. So the figures are the character's
// own values with its effects lists emptied and the changes of its players' own rows left out, and no automatic effect is applied
// (budgetsOf). The host's record and its owner's copy hold the same of all that, so both machines work out the same figures
function budgetChar(sys, char) {
    var vals = isObj(char.values) ? char.values : null, out = null, put = function(id, v) { out = out || Object.assign({}, vals); out[id] = v; };
    if (vals) sys.fields.forEach(function(f) {
        if (!isObj(f) || typeof f.id !== 'string' || !hasOwn(vals, f.id) || !Array.isArray(vals[f.id])) return;
        var rows = vals[f.id];
        if (f.kind === 'effects') { if (rows.length) put(f.id, []); return; }
        var moved = false, kept = rows.map(function(r) {
            if (!isObj(r) || r.own !== 1 || !isObj(r.def) || r.lnk === 1 || typeof r.defId === 'string' || !Array.isArray(r.def.mods) || !r.def.mods.length) return r;
            moved = true; var d = Object.assign({}, r.def); delete d.mods; return Object.assign({}, r, { def: d });
        });
        if (moved) put(f.id, kept);
    });
    return out ? Object.assign({}, char, { values: out }) : char;
}
// The figures of every budget for one character: [{ id, name, has, spent, left, over, rule, when }]. A figure is a number, or null where its
// formula could not be worked out for this character: such a budget is shown without figures. over: spent is past has
function budgetsOf(sys, char, F) {
    var out = [], list = isObj(sys) && Array.isArray(sys.budgets) ? sys.budgets : [];
    if (!list.length || !isObj(char) || !Array.isArray(sys.fields) || !F || typeof F.evaluate !== 'function') return out;
    var vars = makeResolver(sys, budgetChar(sys, char), F, { noAuto: true });
    var num = function(text) { var r = null; try { r = F.evaluate(text, { vars: vars, random: noDice }); } catch (e) { r = null; } if (!r || !r.ok) return null; var x = typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value; return typeof x === 'number' && fin(x) ? x : null; };
    list.forEach(function(b) {
        if (!isObj(b) || typeof b.id !== 'string' || typeof b.has !== 'string' || typeof b.spent !== 'string') return;
        var h = num(b.has), s = num(b.spent), ok = h !== null && s !== null;
        out.push({ id: b.id, name: typeof b.name === 'string' ? b.name : '', has: h, spent: s, left: ok ? h - s : null, over: ok && s - h > 1e-9, rule: b.over, when: b.when });
    });
    return out;
}
// The host's judgment of a player's own change, asked BEFORE the change is stored. changes: { fieldId: the new value }, as the edit and the
// row gates answer them. A budget is breached when, with the change, it is over AND further over than it was: a change that leaves an overrun
// the same or smaller goes through, so a character that is over can be put right a step at a time. A budget is watched by its `when`; one set
// to off is not judged. A figure that cannot be worked out (the owed review, 2026-10-09: a player could make one fail, by a division by a field
// of their own, and was then judged by nothing): a change that takes a budget from worked out to not is a breach (`lost`, with the figures
// it had); one that brings it back is judged as if nothing had been over before, so over at all is a breach; one that cannot be worked out
// before or after is not judged. { refuse: the first breached budget set to refuse, or null; warn: the breached budgets set to warn }, each
// { id, name, has, spent, by } and, for a figure lost, lost: true
function budgetWatch(sys, char, changes, F) {
    var out = { refuse: null, warn: [] }, list = isObj(sys) && Array.isArray(sys.budgets) ? sys.budgets : [];
    if (!list.length || !isObj(char) || !isObj(changes)) return out;
    var mk = openChar(char) === 'making', live = map(), any = false;
    list.forEach(function(b) { if (isObj(b) && typeof b.id === 'string' && (b.over === 'refuse' || b.over === 'warn') && (b.when === 'always' || (b.when === 'making' ? mk : b.when === 'play' && !mk))) { live[b.id] = b.over; any = true; } });
    if (!any) return out;
    var vals = {}, old = isObj(char.values) ? char.values : {};
    Object.keys(old).forEach(function(k) { if (FIELD_ID.test(k)) vals[k] = old[k]; });
    Object.keys(changes).forEach(function(k) { if (FIELD_ID.test(k)) vals[k] = changes[k]; });
    var was = map(); budgetsOf(sys, char, F).forEach(function(x) { was[x.id] = x; });
    budgetsOf(sys, Object.assign({}, char, { values: vals }), F).forEach(function(x) {
        var rule = live[x.id], w = was[x.id], hit = null;
        if (!rule || !w) return;
        if (x.left === null) { if (w.left === null) return; hit = { id: x.id, name: x.name, has: w.has, spent: w.spent, by: 0, lost: true }; }
        else {
            var d1 = x.spent - x.has, d0 = w.left === null ? 0 : w.spent - w.has;
            if (!(d1 > 1e-9) || !(d1 > d0 + 1e-9)) return;
            hit = { id: x.id, name: x.name, has: x.has, spent: x.spent, by: d1 };
        }
        if (rule === 'refuse') { if (!out.refuse) out.refuse = hit; } else out.warn.push(hit);
    });
    return out;
}
// What a breach says, to the player and to the GM alike: the budget's name and its figures, as text
function budgetSays(hit) { return !isObj(hit) ? '' : hit.lost === true ? cutText(hit.name, LIMITS.name) + ' cannot be worked out with that change.' : cutText(hit.name, LIMITS.name) + ': ' + fmtNum(hit.spent) + ' of ' + fmtNum(hit.has) + ' spent. That is ' + fmtNum(hit.by) + ' over.'; }
// Stage 3: optional per-section colors — hex only (accent = title + left stripe, bg = panel, border = box), like the doc-theming whitelist.
function cleanSecStyle(v) {
    if (!isObj(v)) return null;
    var HEX = /^#[0-9a-fA-F]{6}$/, out = {};
    ['accent', 'bg', 'border'].forEach(function(k) { if (typeof v[k] === 'string' && HEX.test(v[k])) out[k] = v[k].toLowerCase(); });
    if (out.accent && v.stripe === false) out.stripe = false;   // Stage 5g: the accent colors the title only, without the left stripe (kept only beside an accent)
    return Object.keys(out).length ? out : null;
}
// 5h: one change an effect makes — ADD a number to a number, a skill's total, a formula or a resource's max, or switch a toggle ON. The
// target must exist (fieldKinds: id -> kind; in the players' view GM-only fields are absent, so such a change is dropped) and fit its kind.
// withVf (1.6.0, CORE gap 12, an effect's change only; the owner, by prompt: "Sheet before effects"): its amount may be a formula, vf (its v
// then 0), kept here by its shape; fxVf reads it, and cleanSystem drops one that does not parse, rolls dice or reads a GM-only value
// 1.6.2 (the campaign build's stims; Ch14: "two that raise the same thing give the larger bonus, never the sum"): a change that adds may name its
// kind of bonus (stack, a word). Of the changes on one figure that share a kind, only the largest bonus counts (fxIndex); a penalty still adds, and
// a change with no kind adds as ever
function cleanStack(v) { var t = typeof v === 'string' ? v.trim() : ''; return /^[A-Za-z][A-Za-z0-9 _-]{0,23}$/.test(t) ? t : ''; }
// 1.6.3 Layers under a list's places: whether a layer reads Row.covered, which is worked out from the layers themselves, so it could never be
// worked out (cleanSystem drops it, and the validator says so). A list that keys a stat or a column covered reads its own, so it is no loop there
function layerReadsCovered(sp, F) {
    var own = (Array.isArray(sp.stats) ? sp.stats : []).concat(Array.isArray(sp.cols) ? sp.cols : []).some(function(s) { return isObj(s) && typeof s.key === 'string' && lower(s.key) === 'covered'; }); if (own) return false;
    var ns = []; try { ns = F && typeof F.names === 'function' ? F.names(sp.on.layer) || [] : []; } catch (e) { ns = []; }
    return ns.some(function(n) { return lower(String(n)) === 'row.covered'; });
}
function cleanMod(m, fieldKinds, withVf) {
    if (!isObj(m) || typeof m.f !== 'string' || !FIELD_ID.test(m.f) || !fieldKinds || !fieldKinds[m.f]) return null;
    var k = fieldKinds[m.f];
    if (m.op === 'on') return k === 'toggle' ? { f: m.f, op: 'on' } : null;
    if (m.op !== 'add' && !MOD_LIM[m.op]) return null;
    var op = m.op, vfT = withVf === true ? cleanFormulaText(m.vf) : null, v = vfT ? 0 : typeof m.v === 'number' ? m.v : Number(m.v); if (!isFinite(v) || Math.abs(v) > LIMITS.effectAmount) return null;   // 1.6.0: max, at least v; min, at most v
    var o = m.part === 'max' ? (k === 'resource' ? { f: m.f, op: op, v: v, part: 'max' } : null)
        : k === 'item-list' ? (rowModAim(m) ? { f: m.f, op: op, v: v, key: m.key, col: m.col } : null)   // 1.5.8: one row of a list, by its key
        : (k === 'number' || k === 'skill' || k === 'formula') ? { f: m.f, op: op, v: v } : null;
    if (o && vfT) o.vf = vfT;
    if (o && withVf === true && op === 'add' && m.perVal === true) o.perVal = true;   // 1.6.2: Times its number (an effect's change alone)
    var stk = o && op === 'add' ? cleanStack(m.stack) : ''; if (stk) o.stack = stk;   // 1.6.2 Doesn't stack: its kind of bonus (fxIndex)
    return o;
}
// 1.6.0 (the campaign build: two effects that each mean "state 1" on a coded field added up to 2, another state): a change may set a floor or a
// ceiling. op 'max' holds the value at least v and op 'min' at most v, after every change that adds; of several floors the highest counts and of
// several ceilings the lowest. Neither is multiplied by a row's level. MOD_LIM names them; limFx applies them
var MOD_LIM = Object.freeze({ max: 1, min: 1 });
function limFx(v, s) { if (typeof s.lo === 'number' && v < s.lo) v = s.lo; if (typeof s.hi === 'number' && v > s.hi) v = s.hi; if (v > 1e15) v = 1e15; else if (v < -1e15) v = -1e15; return v; }
// 1.5.8 (the owner, by prompt: "A change on one skill"): a change aimed at one row of an item list names the entry's key and one of the list's
// columns; it adds to that column as it is worked out for every row whose entry has that key (a skill not bought, read at its default, too)
function rowModAim(m) { return isObj(m) && typeof m.key === 'string' && ITEM_KEY.test(m.key) && typeof m.col === 'string' && STAT_KEY.test(m.col); }
// 5h: what a library effect and an ad hoc row share — name, icon, tone, duration note, notes, changes (plain literals, fixed key order)
function cleanEffectCore(d, fieldKinds) {
    var mods = [];
    (Array.isArray(d.mods) ? d.mods : []).forEach(function(m) { if (mods.length >= LIMITS.effectMods) return; var c = cleanMod(m, fieldKinds, true); if (c) mods.push(c); });   // 1.6.0: a change by a formula too
    return { name: str(d.name, LIMITS.name).replace(CTRL_RE_G, ' ').trim() || 'Effect', icon: cleanIcon(d.icon), tone: d.tone === 'buff' || d.tone === 'debuff' ? d.tone : '',
             dur: cutPoints(d.dur, LIMITS.effectDur, ' '), notes: str(d.notes, LIMITS.noteText).replace(CTRL_RE_G, ' ').trim(), mods: mods };
}
// 5h: a library effect (camp.system.effects). A GM-only one never reaches the players' library (it can still reach its owner inline, once
// applied: see charFor).
function cleanEffectDef(d, fieldKinds, gmView, F) {   // conditions C4: F, for an automatic effect's formula (none: it is left out)
    if (!isObj(d) || typeof d.id !== 'string' || !EFFECT_ID.test(d.id)) return null;
    var vis = d.vis === 'gm' ? 'gm' : 'all'; if (!gmView && vis === 'gm') return null;
    var c = cleanEffectCore(d, fieldKinds), o = { id: d.id, name: c.name, icon: c.icon, tone: c.tone, dur: c.dur, notes: c.notes, vis: vis, mods: c.mods };
    var au = vis === 'gm' ? null : cleanFormulaText(d.auto); if (au && autoFormulaOk(au, F)) o.auto = au;   // conditions C4: only a visible effect applies itself (the owner's answer, "Only public ones")
    var fxP = typeof d.posture === 'string' && (POSTURE_ID.test(d.posture) || POSTURE_IDS.indexOf(d.posture) >= 0) ? d.posture : ''; if (fxP) { o.posture = fxP; if (d.postureBack === true) o.postureBack = true; if (Array.isArray(d.postureKeep)) { var fxK = []; d.postureKeep.forEach(function(x) { if (fxK.length < LIMITS.postures && typeof x === 'string' && x !== fxP && (POSTURE_ID.test(x) || POSTURE_IDS.indexOf(x) >= 0) && fxK.indexOf(x) < 0) fxK.push(x); }); if (fxK.length) o.postureKeep = fxK; } }   // 1.5.9 (book es/et plan, the owner's O6): the posture its token takes the moment it comes on (a posture of the list by its id), and, ticked, back when it ends; absent, as ever
    var esw = cleanRollSw(d.rollSw, fieldKinds); if (esw) o.rollSw = esw;   // 1.6.0: the bonuses it offers a roll while it is on
    if (FX_AGAIN[d.again] === 1) o.again = d.again;   // 1.6.0 (a builder audit): When added again, Keep the longer or Add the times (absent: Replace, as ever)
    if (d.ends === 'turnEnd') o.ends = 'turnEnd';
    var ecv = cleanSelfCover(d.cover); if (ecv) o.cover = ecv;   // 1.6.2: the cover it gives while it is on (cleanSelfCover)   // 1.6.0 Counts at its turn's end (fxTick), the same in both views (absent: at its turn's start, as ever)
    var fvl = cleanFxVal(d.val); if (fvl) o.val = fvl;   // 1.6.2: it holds a number
    if (gmView) {   // 1.6.2 (the CORE session: a boost whose crash comes when it runs out, a rage that leaves you tired): what happens when it ends, the GM's view alone, since only the machine that owns the campaign runs it (sheets.js fxEndFollow)
        var en = cleanApplyChanges(d.end, false, false).filter(function(c) { return typeof c.fx === 'string' || (typeof c.f === 'string' && !!fieldKinds && hasOwn(fieldKinds, c.f) && APPLY_KINDS[fieldKinds[c.f]] === 1); }).slice(0, LIMITS.applyChanges);
        if (en.length) o.end = en; if (typeof d.endRoll === 'string' && ROLL_ID.test(d.endRoll)) o.endRoll = d.endRoll;
        if ((o.end || o.endRoll) && d.endOff === true) o.endOff = true;
        if (d.endsRest === '-' || (typeof d.endsRest === 'string' && REST_ID.test(d.endsRest))) o.endsRest = d.endsRest;   // 1.6.2: the rest that ends it, or '-' for none (fxEndsWith); the GM's view alone, as the rests are, and cleanSystem takes off one whose rest is gone
    }
    var exE = cleanExplain(d.explain); if (exE) o.explain = exE;   // 1.6.2 (backlog 218 fold 3)
    if (typeof d.endGroup === 'string' && FX_END_GROUP.test(d.endGroup)) { o.endGroup = d.endGroup; if (typeof d.endRank === 'number' && fin(d.endRank) && Math.round(d.endRank) >= 1 && Math.round(d.endRank) <= 99) o.endRank = Math.round(d.endRank); }   // 1.6.0 Shares an end (fxShareEnd), the same in both views
    return o;
}
// Conditions C4: an automatic effect's formula — one that reads, rolls no dice (whether it names a GM-only value is judged over the whole system)
function autoFormulaOk(text, F) { if (!F || typeof F.parse !== 'function') return false; var p = F.parse(text); return !!(p && p.ok && p.ast && !hasDice(p.ast.body)); }
// Stage 5g: the sheet's own shape — headline section titles, filled (angled) tabs, one accent color, the portrait and the name leading
// the header block. Whitelisted values only; absent (or nothing valid) = today's look, and the key is left out.
var LABEL_PX = Object.freeze([13, 14, 16]);
function cleanLook(v) {
    if (!isObj(v)) return null;
    var out = {};
    if (v.titles === 'headline' || v.titles === 'accordion') out.titles = v.titles;   // Stage 6 look fold (L5): accordion titles
    if (v.tabs === 'filled' || v.tabs === 'angular') out.tabs = v.tabs;   // L5: angular tabs ('angled' stays invalid)
    // 1.6.3 (improvement week; the owner, 2026-11-16, of tabs that took colors of their own): one color for the tab that is open (tabOn)
    // and one for the others (tabOff), each a plain #rrggbb or left out, so a look without them is key for key what it was. Nothing of
    // it is a secret, so cleanLook keeps them the same in both views. sheets.js tabColors draws them, with words in the ink worked out
    // for each (accentInk); absent, the tabs take their colors from the accent and the palette, as before
    if (typeof v.tabOn === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.tabOn)) out.tabOn = v.tabOn.toLowerCase();
    if (typeof v.tabOff === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.tabOff)) out.tabOff = v.tabOff.toLowerCase();
    if (typeof v.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.accent)) out.accent = v.accent.toLowerCase();
    if (v.portrait === true) out.portrait = true;
    if (v.labels === 'caps' || v.labels === 'plain') out.labels = v.labels;   // Fold B: field labels in small bold capitals; 1.6.0: 'plain', the header's labels plain too
    if (v.labelInk === 'text') out.labelInk = 'text';   // 1.6.0: labels in the sheet's text color, not the muted one
    if (LABEL_PX.indexOf(v.labelSize) >= 0) out.labelSize = v.labelSize;   // 1.6.0: labels at a size of their own (the sheet; the HUD keeps its own)
    if (v.sticky === true) out.sticky = true;   // L5: a section's title stays at the top while that section scrolls
    if (v.numbers === 'mono') out.numbers = 'mono';   // L8: figures in a monospaced face
    if (v.band === 'inline' || v.band === 'chips') out.band = v.band;   // L8: the band as one inline row, or as chips
    if (v.steppers === 'inside') out.steppers = 'inside';   // L8: a number box's arrows inside its right edge
    if (v.values === 'boxed') out.values = 'boxed';   // L8: a worked-out result in a box
    if (v.effects === 'cards') out.effects = 'cards';   // L6: status effects as cards, a pill per change
    if (v.rows === 'cards') out.rows = 'cards';   // L8: carried items as cards
    var pal = cleanPalette(v.palette); if (pal) out.palette = pal;   // Stage 6 look fold: every part of the sheet in ten colors
    return Object.keys(out).length ? out : null;
}
// Stage 6 look fold (L1): a sheet palette — ten colors, all or nothing (a partial one would leave theme colors mixed in and read
// differently under each theme); a plain object, since the wire's packer refuses a prototype-free one
var PALETTE_KEYS = ['text', 'muted', 'panel', 'card', 'field', 'edge', 'primary', 'danger', 'good', 'warn'];
function cleanPalette(v) {
    if (!isObj(v)) return null;
    var out = {};
    for (var i = 0; i < PALETTE_KEYS.length; i++) { var k = PALETTE_KEYS[i], x = v[k]; if (typeof x !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(x)) return null; out[k] = x.toLowerCase(); }
    return out;
}
// Stage 4: an item-list field's optional rich-table config. Whitelisted strings + booleans only — no field refs,
// no vis — so host and client agree and there is nothing to inject. Absent ⇒ the plain carried-items list (as before).
// (damage/cost are GM-only on the wire, so those columns simply read blank for players — no leak.)
var ITEM_COL = Object.freeze({ category: 1, cost: 1, damage: 1, area: 1, notes: 1 });
function cleanItemTable(v) {
    if (!isObj(v)) return null;
    var out = {}, cols = [], seen = map();
    (Array.isArray(v.columns) ? v.columns : []).forEach(function(c) { if (typeof c === 'string' && ITEM_COL[c] && !seen[c] && cols.length < 5) { seen[c] = 1; cols.push(c); } });
    if (cols.length) out.columns = cols;
    if (v.chips === true) out.chips = true;
    if (v.footer === true) out.footer = true;
    return Object.keys(out).length ? out : null;
}
// Stage 6 F4b: an item list's options — the categories its picker offers, the same item more than once, no quantity, a level per row (its
// names count from the level's minimum: Powers 1–4) and a switch per row (Readied, Equipped…). Plain values; null when nothing is set. An
// empty categories list survives only in the players' view (none of the list's categories has an item they can see: nothing to pick); the
// GM's empty list means every category.
// 1.6.0 (backlog 180, R2; the owner, by prompt: "A Shows list beside each part"): where a part of a list's row stands. Absent is On the row,
// as every part stood before; 'details' is the row's details (its 📝 line, or the body of a row that opens), 'hide' is drawn nowhere (worked
// with all the same). Only those two words are kept, the same in both views
function partPlaceIn(o, v) { if (isObj(o) && isObj(v) && (v.place === 'details' || v.place === 'hide')) o.place = v.place; return o; }
// 1.6.0: a list's subjects: up to LIMITS.subjects short words a row may hold one of, by its place. A word that folds to nothing, or to a word
// already there (nameFold, as a formula names one), goes. The same in both views: none of them is a secret
function cleanSubjects(v) {
    if (!Array.isArray(v)) return null; var out = [], seen = map();
    for (var i = 0; i < v.length && i < LIMITS.subjects * 8 && out.length < LIMITS.subjects; i++) { var t = cutText(v[i], LIMITS.subjectWord), k = nameFold(t); if (!k || seen[k]) continue; seen[k] = 1; out.push(t); }
    return out.length ? out : null;
}
// A row's subject, by its place in the list's words, 1 for the first; 0 for none, and for a place the list no longer has
function rowSubject(spec, r) { return isObj(spec) && Array.isArray(spec.subject) && isObj(r) && typeof r.sj === 'number' && r.sj >= 1 && r.sj <= spec.subject.length && r.sj === Math.floor(r.sj) ? r.sj : 0; }
// <List>.Subject.<Word>.sum.<w>, and .max and .min (the highest or the lowest one row gives, as List.max reads a list), split: the place of Word among the list's subjects, or 0 where the name is no such name
function subjectPlace(spec, segs) {
    if (!isObj(spec) || !Array.isArray(spec.subject) || segs.length !== 5 || lower(segs[1]) !== 'subject' || !/^(sum|max|min)$/.test(lower(segs[3]))) return 0;
    var w = nameFold(segs[2]); for (var i = 0; i < spec.subject.length; i++) if (nameFold(spec.subject[i]) === w) return i + 1;
    return 0;
}
// [systemcheck:job-start] 1.6.0: a job counted across turns. A list roll's job: { turns: a formula with no dice of the row's names, ct: a counter of the list,
// keep: true where progress is kept }. A press adds 1 to the counter, and the roll itself is made only at the press that reaches turns, when its Then
// runs and the counter goes back to 0. In a fight a job takes one press a turn, known by the round on the row (jr, the host's own, never on an owner's
// copy), so a step back gives no second press. With no keep, a turn of its character's that ends with no press sets the counter to 0, a lost action among them
function cleanJob(v, counters) {
    if (!isObj(v)) return null;
    var t = cleanFormulaText(v.turns), ck = typeof v.ct === 'string' ? lower(v.ct.trim()) : '', ct = null;
    (Array.isArray(counters) ? counters : []).forEach(function(c) { if (!ct && isObj(c) && typeof c.key === 'string' && lower(c.key) === ck) ct = c; });
    if (!t || !ct) return null;
    var o = { turns: t, ct: ct.key }; if (v.keep === true) o.keep = true; if (v.now === true) o.now = true; return o;   // 1.6.2 (the CORE session): now, out of a fight its last press is the first, its roll still made
}
function listJobs(spec) { return isObj(spec) && Array.isArray(spec.rolls) ? spec.rolls.filter(function(r) { return isObj(r) && isObj(r.job); }) : []; }
function cleanJr(v, spec) {   // the round each job of a row last had its work in, by its counter's key as the list spells it
    if (!isObj(v)) return null; var out = {}, n = 0;
    listJobs(spec).forEach(function(r) { var k = r.job.ct, x = Object.prototype.hasOwnProperty.call(v, k) ? v[k] : undefined; if (typeof x === 'number' && fin(x) && x >= 0 && x === Math.floor(x) && !Object.prototype.hasOwnProperty.call(out, k)) { out[k] = Math.min(9999, x); n++; } });
    return n ? out : null;
}
function jobTurns(ent, vars, F) {   // the turns it takes, a whole number from 1 to 1000, or null where it cannot be worked out
    if (!isObj(ent) || !isObj(ent.job) || !F || typeof vars !== 'function') return null; var r = null; try { r = F.evaluate(ent.job.turns, { vars: vars }); } catch (e) { r = null; } if (!r || !r.ok) return null;
    var v = typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value; return typeof v === 'number' && fin(v) ? Math.max(1, Math.min(1000, Math.floor(v))) : null;
}
function jobRowOf(char, ref) { var rows = isObj(char) && isObj(char.values) && isObj(ref) && Array.isArray(char.values[ref.f]) ? char.values[ref.f] : null; return rows ? rows.filter(function(r) { return isObj(r) && r.hid !== 1 && rowIdOf(r) === ref.r; })[0] || null : null; }
// what stops a press before anything is spent: '' where it may go on. round: the round of the fight its character is in, null with none
function jobBar(char, ref, ent, vars, F, round) {
    var rw = jobRowOf(char, ref); if (!rw) return 'That row is not there now.'; if (jobTurns(ent, vars, F) === null) return 'How long this job takes could not be worked out.';
    return typeof round === 'number' && isObj(rw.jr) && rw.jr[ent.job.ct] === round ? 'This job has had its work this turn.' : '';
}
// one press: { n, of, done, values: { the row's list } }; done, the press that reaches its turns, which takes the counter back to 0
function jobStep(sys, char, ref, ent, vars, F, round) {
    var f = fieldById(sys, ref.f), of = jobTurns(ent, vars, F), rows = isObj(char.values) && Array.isArray(char.values[ref.f]) ? JSON.parse(JSON.stringify(char.values[ref.f])) : [], rw = jobRowOf({ values: { x: rows } }, { f: 'x', r: ref.r }), t = null;
    (f && isObj(f.list) && Array.isArray(f.list.counters) ? f.list.counters : []).forEach(function(c) { if (!t && isObj(c) && c.key === ent.job.ct) t = c; }); if (!rw || !t || of === null) return null;
    var n = typeof round !== 'number' && ent.job.now === true ? of : rowCt(rw, t) + 1, done = n >= of, ct = isObj(rw.ct) ? rw.ct : (rw.ct = {}); ct[t.key] = done ? 0 : n;
    if (typeof round === 'number') { if (!isObj(rw.jr)) rw.jr = {}; rw.jr[t.key] = round; }
    var values = {}; values[ref.f] = rows; return { n: Math.min(n, of), of: of, done: done, values: values };
}
// 1.6.2 Load takes a job: the press that reaches a job's turns makes the load its row waits for, where its list's load names that job by its counter,
// as an unload and a load would, judged again as it is made (what was picked may be gone). { values, name } or { error } or null for nothing to load
function jobLoad(sys, char, ref, ent, F, back) {
    var f = fieldById(sys, ref.f), ld = f && isObj(f.list) && isObj(f.list.load) ? f.list.load : null, rw = jobRowOf(char, ref); if (!ld || typeof ld.job !== 'string' || !isObj(ent) || !isObj(ent.job) || ent.job.ct !== ld.job || !rw || typeof rw.lw !== 'string') return null;
    var q = { op: 'load', rowId: ref.r, from: rw.lw, back: back }, res = applyRowOp(sys, char, ref.f, q, F, { jobNow: true }), mv = res && res.ok ? rowOpMoney(sys, char, ref.f, q, res) : null;
    if (!mv || !mv.ok) { var rows = isObj(char.values) && Array.isArray(char.values[ref.f]) ? JSON.parse(JSON.stringify(char.values[ref.f])) : [], w = jobRowOf({ values: { x: rows } }, { f: 'x', r: ref.r }); if (w) delete w.lw; var vv = {}; vv[ref.f] = rows; return { error: 'What it waited to load is not there now.', values: vv }; }
    var lr = mv.values[ref.f], lw2 = Array.isArray(lr) ? jobRowOf({ values: { x: lr } }, { f: 'x', r: ref.r }) : null; if (lw2) delete lw2.lw;
    return { values: mv.values, name: res.name || '' };
}
// a turn of this character's ended: each job with no keep, under way and not worked on in that round, starts again. { list id: rows }, or null
function jobsEnd(sys, char, round) {
    var out = null; (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        var js = isObj(f) && f.kind === 'item-list' ? listJobs(f.list).filter(function(r) { return r.job.keep !== true; }) : [], src = js.length && isObj(char) && isObj(char.values) && Array.isArray(char.values[f.id]) ? char.values[f.id] : null; if (!src) return;
        var moved = false, rows = src.map(function(r) {
            if (!isObj(r) || !isObj(r.ct)) return r; var nr = null;
            js.forEach(function(j) { var k = j.job.ct; if (typeof r.ct[k] === 'number' && r.ct[k] > 0 && !(isObj(r.jr) && r.jr[k] === round)) { nr = nr || Object.assign({}, r, { ct: Object.assign({}, r.ct) }); nr.ct[k] = 0; } });
            if (nr) moved = true; return nr || r;
        });
        if (moved) { out = out || {}; out[f.id] = rows; }
    });
    return out;
}
// [systemcheck:job-end]
// 1.6.2 (body fold 2): a list whose rows stand at rows of another list, the tiles. from: that list, which cleanSystem holds to the view; fits, a formula a
// place must meet, with fitSays its words; reach, a formula that says which other tiles a row covers; counts, a formula that says when a placed row counts as
// worn, with offWord what it shows when it does not; pieces, one row is one piece. Each formula reads the row as Row.*, the tile as At.*, what stands there as
// Here.*, and reach the tile it asks about as Tile.*
var STAND_TEXT = ['fits', 'reach', 'counts'], BOX_KEY = /^[A-Za-z][A-Za-z0-9_]{0,23}$/, PL_ID = /^(?:w_[A-Za-z0-9_]{1,24}|b_[A-Za-z][A-Za-z0-9_]{0,23})$/, TILE_BOXES = 8;
// 1.6.2 (body fold 4): the boxes a tile offers. if, Shown where, a formula of the tile, so a lost hand shows none; taken, a formula that ties a box up with no row behind it, with takenSays its word; strip, a box of the strip that is no row, which a row names as b_<key>
// 1.6.2 (body fold 8): a tile's states, tiles.states: { key, made once and never shown; label; if, a formula of the row; shape, how it is drawn beside its words; follows, true: what hangs from it is in that state too }. The first that holds is the one a tile is in. A state with no If never holds, so a new one in the editor loses nothing
var TILE_STATES = 8, STAND_THEN = 8, STATE_SHAPES = ['lost', 'bad', 'warn'];
function cleanTileStates(v) {
    if (!Array.isArray(v)) return undefined; var o = [], seen = map();
    v.slice(0, TILE_STATES * 4).forEach(function(s) {
        if (o.length >= TILE_STATES || !isObj(s) || typeof s.key !== 'string' || !BOX_KEY.test(s.key) || (s.key in Object.prototype) || seen[lower(s.key)]) return; var l = cutText(s.label, LIMITS.label); if (!l) return; seen[lower(s.key)] = 1;
        var x = { key: s.key, label: l }, i = typeof s['if'] === 'string' ? cleanFormulaText(s['if']) : ''; if (i) x['if'] = i; if (STATE_SHAPES.indexOf(s.shape) >= 0) x.shape = s.shape; if (s.follows === true) x.follows = true; o.push(x);
    });
    return o.length ? o : undefined;
}
// 1.6.2 (body fold 8): stand.then, what a state does to what stands at a tile as the tile comes into it, the GM's view alone since only the machine that owns the campaign runs it: { state, if, does: stays, drops with to (a box of the strip), or changes with apply, as a list's action writes them }. The first row of that state that holds speaks for a row, so Stays can make an exception
function cleanStandThen(v) {
    if (!Array.isArray(v)) return undefined; var o = [];
    v.slice(0, STAND_THEN * 4).forEach(function(t) {
        if (o.length >= STAND_THEN || !isObj(t) || typeof t.state !== 'string' || !BOX_KEY.test(t.state)) return; var x = { state: t.state }, i = typeof t['if'] === 'string' ? cleanFormulaText(t['if']) : ''; if (i) x['if'] = i;
        if (t.does === 'drops') { if (typeof t.to !== 'string' || !BOX_KEY.test(t.to)) return; x.does = 'drops'; x.to = t.to; } else if (t.does === 'changes') { var ap = cleanApplyChanges(t.apply, false, true); if (!ap.length) return; x.does = 'changes'; x.apply = ap.slice(0, 4); } else x.does = 'stays';
        o.push(x);
    });
    return o.length ? o : undefined;
}
function cleanTileBoxes(v) {
    if (!Array.isArray(v)) return undefined; var o = [], seen = map();
    v.slice(0, TILE_BOXES * 4).forEach(function(b) {
        if (o.length >= TILE_BOXES || !isObj(b) || typeof b.key !== 'string' || !BOX_KEY.test(b.key) || (b.key in Object.prototype) || seen[lower(b.key)]) return; var l = cutText(b.label, LIMITS.label); if (!l) return; seen[lower(b.key)] = 1;
        var x = { key: b.key, label: l }, i = typeof b['if'] === 'string' ? cleanFormulaText(b['if']) : '', t = typeof b.taken === 'string' ? cleanFormulaText(b.taken) : ''; if (i) x['if'] = i; if (t) { x.taken = t; var w = cutText(b.takenSays, LIMITS.label); if (w) x.takenSays = w; } if (b.strip === true) x.strip = true; o.push(x);
    });
    return o.length ? o : undefined;
}
function cleanStand(v, gmView) {
    if (!isObj(v) || typeof v.from !== 'string' || !FIELD_ID.test(v.from)) return undefined;
    var o = { from: v.from }; STAND_TEXT.forEach(function(k) { if (typeof v[k] === 'string') { var t = cleanFormulaText(v[k]); if (t) o[k] = t; } });
    var fw = o.fits ? cutText(v.fitSays, LIMITS.needsWords) : ''; if (fw) o.fitSays = fw; var ow = o.counts ? cutText(v.offWord, LIMITS.label) : ''; if (ow) o.offWord = ow;
    if (v.pieces === true) o.pieces = true; if (typeof v.box === 'string' && BOX_KEY.test(v.box)) o.box = v.box;
    if (gmView) { var thC = cleanStandThen(v.then); if (thC) o.then = thC; }
    return o;
}
// 1.6.2: what a row's stats do as it changes hands, up to 4 lines of a number stat of the list: { s, to } its figure moves to another stat, { s, v } it is set, { s } it is cleared. A stat may be GM-only, so a mark a holder sees can become one the next holder does not
function cleanOnTrade(v, stats) {
    if (!Array.isArray(v)) return undefined; var o = [], nums = (Array.isArray(stats) ? stats : []).filter(function(s) { return isObj(s) && s.kind !== 'pick' && s.set !== true; }), st = function(k) { return typeof k === 'string' ? nums.filter(function(s) { return lower(s.key) === lower(k); })[0] : null; };
    v.slice(0, 16).forEach(function(t) { if (o.length >= 4 || !isObj(t)) return; var s = st(t.s); if (!s) return; var x = { s: s.key }; if (typeof t.to === 'string') { var d = st(t.to); if (!d || d === s) return; x.to = d.key; } else if (typeof t.v === 'number' && fin(t.v)) x.v = t.v; o.push(x); });
    return o.length ? o : undefined;
}
function cleanListSpec(v, gmView, F) {   // F (F4c1): the engine, for a stat key (validKey('Row.' + key))
    if (!isObj(v)) return null;
    var out = {};
    if (Array.isArray(v.cats)) {
        var cs = [], seenC = map();
        v.cats.forEach(function(c) { var t = cutText(c, LIMITS.category); if (!t || seenC[lower(t)] || cs.length >= LIMITS.listCats) return; seenC[lower(t)] = 1; cs.push(t); });
        if (cs.length || (!gmView && v.cats.length === 0)) out.cats = cs;
    }
    if (v.multi === true) out.multi = true;
    if (v.noQty === true) out.noQty = true;
    var lv = cleanLvlSpec(v.lvl); if (lv) out.lvl = partPlaceIn(lv, v.lvl);
    if (isObj(v.on)) { var sw = { label: cutText(v.on.label, LIMITS.label) || 'On' }; if (v.on.def === true) sw.def = true; var swOff = cutText(v.on.offLabel, LIMITS.label); if (swOff) { sw.offLabel = swOff; var swIc = cleanIcon(v.on.icon); if (swIc) sw.icon = swIc; }   // 1.6.0 R6: the switch as a button with two words (the word while off, then on), and an icon of the bundled set before them
    rollNeedsInto(sw, v.on); var swSh = cleanFormulaText(v.on.showIf); if (swSh) sw.showIf = swSh; out.on = partPlaceIn(sw, v.on); }   // 1.5.8: what a row needs before it is switched on (Row.* read, no dice), and the words a refusal says, as a roll's needs
    if (Array.isArray(v.stats)) {   // F4c1: its stats — a number every item of it carries (Acc, Wt, Cost), LIMITS.listStats at most, each key once ignoring case (the first wins; a key is never trimmed or fixed)
        var sts = [], seenS = map();
        for (var si = 0; si < v.stats.length && sts.length < LIMITS.listStats; si++) {
            var s = v.stats[si], pick = isObj(s) && s.kind === 'pick'; if (!isObj(s) || (s.kind !== undefined && s.kind !== 'num' && !pick)) continue;   // F5a2: a number, or a choice (pick) of named options
            var sk = statKey(s.key, F); if (!sk || seenS[lower(sk)]) continue;
            seenS[lower(sk)] = 1;
            var so = { key: sk, label: cutText(s.label, LIMITS.label) || sk };
            if (pick) {   // F5a2: a choice — options { label, name } (the name: one numeric name formulas read, ST); its default is an option's label
                so.kind = 'pick'; so.opts = cleanPickOpts(s.opts);
                var pdl = typeof s.def === 'string' ? lower(cutText(s.def, LIMITS.label)) : ''; for (var po = 0; pdl && po < so.opts.length; po++) if (lower(so.opts[po].label) === pdl) { so.def = so.opts[po].label; break; }
            } else {
            var sd = statNum(s.def); if (sd !== undefined && sd !== 0) so.def = sd;
            var slb = cleanLabels(s.labels); if (slb) { so.labels = slb; var stn = cleanTones(s.tones, slb.length); if (stn) so.tones = stn; }   // 1.6.0 R5: a tone per value name, as a field's
            var sun = unitOf(s.unit); if (sun) { so.unit = sun; if (cleanFieldUnit(sun, 'number')) { if (s.unitShow === 'swap' || s.unitShow === 'bare') so.unitShow = s.unitShow; var sdm = decCount(s.decMax); if (sdm !== null) so.decMax = sdm; } }   // 1.5.4: a unit after its figure, a measure in metric under Metric as a field's is, and a measure's most decimals
            }   // names for the values 0, 1, 2... (a value past them shows as the number: no clamp, so lists sharing a key never fight)
            if (!pick && s.split === true && s.vis !== 'gm') so.split = true;   // 1.5.6 Split in trades: a trade may take part of this figure of a row (a chip's stored money); a GM-only stat is no figure a trade could show
            if (s.vis === 'gm') { if (!gmView) continue; so.vis = 'gm'; }   // 1.6.0: a GM-only stat, in the GM's view alone (gmStatKeys below)
            if (s.hide === true) so.hide = true;   // 1.5.4 Hidden: a figure the row only works with (a cost per level, a step) — never drawn on a row, in its details, in a table or in the picker; formulas read it and the row's own-values form shows it. It wins over On the row, and it is no secret (the players' view holds it alike)
            else if (s.show === true) so.show = true;   // On the row: a chip beside the name, a column in a rich table
            var exS = cleanExplain(s.explain); if (exS) so.explain = exS;   // 1.6.2 (backlog 218 fold 3)
            if (s.own === true && so.hide !== true && so.set !== true && so.vis !== 'gm' && (so.kind === 'pick' ? Array.isArray(so.opts) && so.opts.length > 0 : Array.isArray(so.labels) && so.labels.length > 0)) so.own = true;   // 1.6.2 (the core session's ask): Player sets this, a choice its owner may set on their own row, and nothing else of it
            sts.push(so);
        }
        if (sts.length) out.stats = sts;
    }
    if (out.on && isObj(v.on)) {   // 1.5.4 One at a time: one row of the list on (one), or one for each value of a stat of the list, a number or a choice (per: its key as the list spells it). Never both: per wins, and one that names no stat leaves one. The same in both views
        var opw = typeof v.on.per === 'string' ? lower(v.on.per.trim()) : '', ops = null, ovw = typeof v.on.over === 'string' ? lower(v.on.over.trim()) : '', ovs = null;
        for (var opi = 0; opw && out.stats && opi < out.stats.length; opi++) if (lower(out.stats[opi].key) === opw) { ops = out.stats[opi]; break; }
        for (var ovi = 0; ovw && out.stats && ovi < out.stats.length; ovi++) if (out.stats[ovi].kind !== 'pick' && lower(out.stats[ovi].key) === ovw) { ovs = out.stats[ovi]; break; }   // 1.6.0 O1: over, a number stat read as a set of places
        if (ovs) { out.on.over = ovs.key; ovs.set = true; } else if (ops) out.on.per = ops.key; else if (v.on.one === true) out.on.one = true;
        if (ovs && typeof v.on.layer === 'string') { var lyrT = cleanFormulaText(v.on.layer); if (lyrT) out.on.layer = lyrT; }   // 1.6.3 Layers under a list's places: a formula of the row's names, kept only beside over (cleanSystem drops one that cannot be worked out the same on every machine)
    }
    if (out.stats && typeof v.price === 'string') { var pl = lower(v.price); for (var pi = 0; pi < out.stats.length; pi++) if (lower(out.stats[pi].key) === pl) { if (out.stats[pi].kind !== 'pick') out.price = out.stats[pi].key; break; } }   // F5a2: never a choice   // F4c1: the price is one of its stats (stored as its key): a row records it as paid when it is added
    if (v.money === '@lvl' && isObj(out.lvl) && !Array.isArray(out.lvl.labels)) out.money = '@lvl';   // 1.5.6 a Money box: each row holds its level (a chip's money)
    else if (out.stats && typeof v.money === 'string') { var mk = lower(v.money); for (var mi = 0; mi < out.stats.length; mi++) if (lower(out.stats[mi].key) === mk) { if (out.stats[mi].kind !== 'pick') out.money = out.stats[mi].key; break; } }   // ... or each piece is worth a number stat (a bar's denomination)
    if (out.money) {   // 157 M1: the currency a Money box holds, a key the system's currencies must name (cleanSystem drops one that names none), and a choice stat that names each row's own
        if (typeof v.cur === 'string') { var cuk = tableKeyOk(v.cur, TABLE_KEY); if (cuk) out.cur = cuk; }
        if (v.moneyEdits === 'ask' || v.moneyEdits === 'gm') out.moneyEdits = v.moneyEdits;   // 157 M2: how a player changes this money (absent: at once)
        if (out.stats && typeof v.curBy === 'string') { var cbk = lower(v.curBy); for (var cbi = 0; cbi < out.stats.length; cbi++) if (lower(out.stats[cbi].key) === cbk) { var cbs = out.stats[cbi]; if (cbs.set !== true && (cbs.kind === 'pick' ? Array.isArray(cbs.opts) && cbs.opts.length > 0 : Array.isArray(cbs.labels) && cbs.labels.length > 0)) out.curBy = cbs.key; break; } }
    }
    if (out.price) {   // 157 M1b: the currency a price is set in, and a choice of each row that names its own, kept as a Money box's are
        if (typeof v.priceCur === 'string') { var pck = tableKeyOk(v.priceCur, TABLE_KEY); if (pck) out.priceCur = pck; }
        if (out.stats && typeof v.hot === 'string') { var htk = lower(v.hot); for (var hti = 0; hti < out.stats.length; hti++) if (lower(out.stats[hti].key) === htk) { if (out.stats[hti].set !== true) out.hot = out.stats[hti].key; break; } }   // 157 M1j: a stat that says a row is stolen or illegal
        if (out.stats && typeof v.cond === 'string') { var cdk = lower(v.cond); for (var cdi = 0; cdi < out.stats.length; cdi++) if (lower(out.stats[cdi].key) === cdk) { if (out.stats[cdi].kind !== 'pick' && out.stats[cdi].set !== true) out.cond = out.stats[cdi].key; break; } }   // 157 M1f: a number stat that is its row's condition, a per cent of full worth
        ['buyBy', 'sellBy'].forEach(function(k) { if (!out.stats || typeof v[k] !== 'string') return; var bk = lower(v[k]); for (var bi = 0; bi < out.stats.length; bi++) if (lower(out.stats[bi].key) === bk) { var bs = out.stats[bi]; if (bs.kind !== 'pick' && bs.set !== true) out[k] = bs.key; break; } });   // 157 M1c: a number stat of the entry's own buy or sell price
        if (out.stats && typeof v.priceCurBy === 'string') { var pbk = lower(v.priceCurBy); for (var pbi = 0; pbi < out.stats.length; pbi++) if (lower(out.stats[pbi].key) === pbk) { var pbs = out.stats[pbi]; if (pbs.set !== true && (pbs.kind === 'pick' ? Array.isArray(pbs.opts) && pbs.opts.length > 0 : Array.isArray(pbs.labels) && pbs.labels.length > 0)) out.priceCurBy = pbs.key; break; } }
    }
    if (out.price && (v.paidPlace === 'details' || v.paidPlace === 'hide')) out.paidPlace = v.paidPlace;   // 1.6.0 R2: where Paid stands
    var bdg = cleanBadges(v.badges, F); if (bdg) out.badges = bdg;   // 1.6.0 R4: its row badges
    if (v.boxes === true) out.boxes = true;   // 1.6.0 R3 (the owner, by prompt: "A. A list ticks it"): Figures as boxes in a row's details
    if (isObj(out.lvl) && typeof v.unheld === 'string') { var uhT = cleanFormulaText(v.unheld); if (uhT) out.unheld = uhT; }   // 1.6.0 Rolls unheld entries (the owner, by prompt: "On the list (Recommended)", "GM and owner, by a tick (Recommended)"): the level an entry nobody holds is rolled at, a formula of its own names, on a list with a level
    var lkC = cleanLock(v.lock, out); if (lkC) out.lock = lkC;
    var lyC = cleanLay(v.lay, out); if (lyC) out.lay = lyC;   // 1.6.2 Laid from: each row of another list lays one row here   // 1.6.2 Locked while: chosen cells of its rows while a test of the character holds
    if (typeof v.modsIf === 'string') { var miT = cleanFormulaText(v.modsIf); if (miT) out.modsIf = miT; }   // 1.6.0 Changes apply where (the campaign build's ask): a formula of the holder's names and each row's own (Row.*); a row where it does not hold gives none of its changes (fxIndex, unseenMods). The same in both views: cleanSystem drops one that cannot stand (modsIfOk)
    if (typeof v.lvlTone === 'string' && TONES[v.lvlTone] === 1) out.lvlTone = v.lvlTone;   // 1.6.2 (180): the color of every By level tag of its entries, where a level line names none
    if (v.edge === true) out.edge = true;   // 1.6.0 R16: Edge follows its state, a row's edge in the tone of its strongest badge, else the accent while it is switched on
    if (v.hang === true) out.hang = true;   // 1.6.2 (body fold 1): Rows hang from a row, a row's up and Row.up.<name>
    var shS = cleanSheetsSpec(v.sheets, gmView); if (shS) out.sheets = shS;   // 1.6.2 (vehicles, fold (a)): Rows are sheets, a row's sh and Row.sheet.<name>
    if (gmView) { var otC = cleanOnTrade(v.onTrade, out.stats); if (otC) out.onTrade = otC; if (isObj(v.tradeRoll) && typeof v.tradeRoll.i === 'number' && v.tradeRoll.i >= 0 && v.tradeRoll.i === Math.floor(v.tradeRoll.i)) { var trC = { i: v.tradeRoll.i }, trI = cleanFormulaText(v.tradeRoll['if']); if (trI) trC['if'] = trI; out.tradeRoll = trC; } }   // 1.6.2: what a trade does to a row of it, and the roll it calls for, the GM's view alone
    var sdC = cleanStand(v.stand, gmView); if (sdC) out.stand = sdC;   // 1.6.2 (body fold 2): its rows stand at rows of another list
    if (isObj(v.tiles)) { var tlO = {}, tlS = function(k) { return (Array.isArray(out.stats) ? out.stats : []).filter(function(s) { return isObj(s) && lower(s.key) === lower(k); })[0]; }, tlC = function(k) { return (Array.isArray(v.cols) ? v.cols : []).filter(function(s) { return isObj(s) && typeof s.key === 'string' && lower(s.key) === lower(k); })[0]; }; if (typeof v.tiles.side === 'string' && tlS(v.tiles.side)) tlO.side = tlS(v.tiles.side).key; if (typeof v.tiles.top === 'string' && (tlS(v.tiles.top) || tlC(v.tiles.top))) tlO.top = (tlS(v.tiles.top) || tlC(v.tiles.top)).key; ['draw', 'make'].forEach(function(k) { if (typeof v.tiles[k] === 'string' && tlS(v.tiles[k])) tlO[k] = tlS(v.tiles[k]).key; }); var tbxC = cleanTileBoxes(v.tiles.boxes); if (tbxC) tlO.boxes = tbxC; var tsC = cleanTileStates(v.tiles.states); if (tsC) tlO.states = tsC; if (Object.keys(tlO).length) out.tiles = tlO; }   // 1.6.2 (body fold 3): which stat says a tile's side, and what stands at its top
    if (v.grantRaise === true) out.grantRaise = true;   // 1.6.0 (a builder audit): A grant raises a held row, on a list with a quantity too (grantRaises)
    if (v.menus === true) out.menus = true;
    if (typeof v.sets === 'string' && v.sets && isObj(out.on)) { var stS = (Array.isArray(out.stats) ? out.stats : []).filter(function(s) { return isObj(s) && lower(s.key) === lower(v.sets) && s.set !== true && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length > 0 : Array.isArray(s.labels) && s.labels.length > 0); })[0]; if (stS) out.sets = stS.key; }   // 1.6.0 R15: Sets by a choice stat, the rows of one value a set switched on together
    if (typeof v.groupBy === 'string' && v.groupBy) { var gbS = (Array.isArray(out.stats) ? out.stats : []).filter(function(s) { return isObj(s) && lower(s.key) === lower(v.groupBy) && s.set !== true && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length > 0 : Array.isArray(s.labels) && s.labels.length > 0); })[0]; if (gbS) out.groupBy = gbS.key; }   // 1.6.2 (the core session's ask): Rows gather by a choice stat, its value names as headings
    if (typeof v.placeBy === 'string' && v.placeBy) { var pbS = (Array.isArray(out.stats) ? out.stats : []).filter(function(s) { return isObj(s) && lower(s.key) === lower(v.placeBy) && s.set !== true && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length > 0 : Array.isArray(s.labels) && s.labels.length > 0); })[0]; if (pbS) out.placeBy = pbS.key; }
    var arcC = cleanArc(v.arc, out.stats); if (arcC) out.arc = arcC;   // 1.6.2 (vehicles, fold (b)): its rows' arcs   // 1.6.0 R13: Places split by a choice stat, its value names in place of categories   // 1.6.0 R10: Choices as menus, a choice stat a menu on its row for whoever may set the copy's own stats
    if (v.open === true) out.open = true;   // 1.6.0 R1 (the owner, by prompt: "A tick the builder sets"): Rows open for their details
    if (v.trade === true) out.trade = true;
    if (TO_GM[v.toGm] === 1) out.toGm = v.toGm;   // HR1: every roll of this list goes straight to the GM   // 1.5.6 Tradable: rows of this list may be traded between characters (gear, money; never a skill)
    if (isObj(v.hand)) { out.hand = {}; if (v.hand.gm === true) out.hand.gm = true; }   // 1.6.2 (G9)
    if (v.custom === true && isObj(v.ownSw)) { var ovN = typeof v.ownSw.v === 'number' && fin(v.ownSw.v) ? Math.round(v.ownSw.v) : 0; if (ovN && ovN >= -99 && ovN <= 99) { out.ownSw = { v: ovN }; if (typeof v.ownSw.pay === 'string' && ROLL_ID.test(v.ownSw.pay)) out.ownSw.pay = v.ownSw.pay; } }   // 1.6.2 (G6): what a row of the character's own offers any roll: the list's terms, under the row's name
    if (v.custom === true) out.custom = true;   // F4c3: Custom rows — players may add rows of their own (+ Custom…); the GM may on any list shaped here
    if (Array.isArray(v.cols)) {   // F5a1: its columns — a formula worked out for each row (Row.lvl, Row.<stat>…), LIMITS.listCols at most; a key shares the stats' names (unique ignoring case)
        var cls = [], seenK = map(); (out.stats || []).forEach(function(x) { seenK[lower(x.key)] = 1; });
        for (var ci = 0; ci < v.cols.length && cls.length < LIMITS.listCols; ci++) {
            var cv = v.cols[ci]; if (!isObj(cv)) continue;
            var ck = statKey(cv.key, F); if (!ck || seenK[lower(ck)]) continue;
            seenK[lower(ck)] = 1;
            var co = { key: ck, label: cutText(cv.label, LIMITS.label) || ck, formula: cv.formula === null ? null : (cleanFormulaText(cv.formula) || '') };   // null: the players' view blanked it (a GM-only name) — kept, so the view is a fixed point
            var cu = unitOf(cv.unit, true); if (cu) { co.unit = cu; if (cleanFieldUnit(cu, 'number')) { if (cv.unitShow === 'swap' || cv.unitShow === 'bare') co.unitShow = cv.unitShow; var cdm = decCount(cv.decMax); if (cdm !== null) co.decMax = cdm; } }   // 1.5.4: how a measure reads under Metric, and its most decimals
            var clb = cleanLabels(cv.labels); if (clb) { co.labels = clb; var ctn = cleanTones(cv.tones, clb.length); if (ctn) co.tones = ctn; }   // 1.6.0 R5
            if (cv.hide === true) co.hide = true;   // worked out (totals, other columns) but not drawn on the row
            else if (cv.place === 'details') co.place = 'details';   // 1.6.0 R2: drawn in the row's details (Hidden stays the column's own hide)
            if (cv.foot === true) co.foot = true;   // its total under the list
            var exC = cleanExplain(cv.explain); if (exC) co.explain = exC;   // 1.6.2 (backlog 218 fold 3)
            var csh = cleanFormulaText(cv.showIf); if (csh) co.showIf = csh;   // 1.6.2: on which rows it shows. Formulas read it on every row
            if (Array.isArray(cv.plus)) {   // 1.5.4 With: number stats of this list that add to the column in a case of their own, by the list's own spelling, each once, LIMITS.colPlus at most. The same in both views: a stat is no secret
                var cps = [], seenW = map();
                for (var wi = 0; wi < cv.plus.length && wi < LIMITS.colPlus * 8 && cps.length < LIMITS.colPlus; wi++) {
                    var wk = typeof cv.plus[wi] === 'string' ? lower(cv.plus[wi].trim()) : '', ws = null;
                    for (var wj = 0; wk && out.stats && wj < out.stats.length; wj++) if (out.stats[wj].kind !== 'pick' && lower(out.stats[wj].key) === wk) { ws = out.stats[wj]; break; }
                    if (ws && !seenW[wk]) { seenW[wk] = 1; cps.push(ws.key); }
                }
                if (cps.length) co.plus = cps;
            }
            cls.push(co);
        }
        if (cls.length) out.cols = cls;
    }
    if (out.price && typeof v.priceCol === 'string' && out.cols) { var pcL = lower(v.priceCol); for (var pcI = 0; pcI < out.cols.length; pcI++) if (lower(out.cols[pcI].key) === pcL) { out.priceCol = out.cols[pcI].key; break; } }   // 1.6.2, backlog 234: Price from a column, worked out for the row on its sheet, the price stat beside it where the column gives no number
    if (Array.isArray(v.counters)) {   // Stage 6 HUD R2: its counters — a whole number each row keeps (Charges, Hits), LIMITS.rowCounters at most: a key of its own (never a stat's or a
        // column's), a label, where a row starts (0..1e6) and its most (a formula, Row.* read; null: the players' view blanked a GM-only name)
        var cts = [], ctPass = [], seenT = map(); (out.stats || []).concat(out.cols || []).forEach(function(x) { seenT[lower(x.key)] = 1; });
        for (var ti = 0; ti < v.counters.length && cts.length < LIMITS.rowCounters; ti++) {
            var tv = v.counters[ti]; if (!isObj(tv)) continue;
            var tk = statKey(tv.key, F); if (!tk || seenT[lower(tk)]) continue; seenT[lower(tk)] = 1;
            var to = { key: tk, label: cutText(tv.label, LIMITS.label) || tk }, tdn = Number(tv.def); if (typeof tv.def === 'number' && fin(tdn) && tdn > 0) to.def = Math.min(1e6, Math.round(tdn));
            if (tv.max === null) to.max = null; else { var tmx = cleanFormulaText(tv.max); if (tmx) to.max = tmx; }
            var ttm = cleanRowTimer(tv.timer); if (ttm) { if (!out.on) { delete ttm.on; delete ttm.reset; } to.timer = ttm; }   // 1.6.0 Counts by the game clock (Only while on needs the list's switch)
            var tal = cleanAlt(tv.alt, F); if (tal) to.alt = tal;   // 1.6.0: its other names, row by row
            if (tv.roll === true) to.roll = true;   // 1.5.7: Set by rolls only (a roll's change, an action and the GM set it; a player never by hand)
            partPlaceIn(to, tv);   // 1.6.0 R2
            if (tv.turn === true) to.turn = true;   // 1.6.0 (the v2 combat module): Starts again each turn, at its character's turn start in a fight
            if (to.turn && typeof tv.pass === 'string') ctPass.push([to, tv.pass]);   // 1.6.0 (the core's gap 14): Passes its count to, settled once every counter is known
            cts.push(to);
        }
        ctPass.forEach(function(pp) { var hit = ''; cts.forEach(function(x) { if (!hit && x !== pp[0] && lower(x.key) === lower(pp[1])) hit = x.key; }); if (hit) pp[0].pass = hit; });
        if (cts.length) out.counters = cts;
    }
    if (isObj(v.specs)) {
        // 1.6.0 Specialties (the core handbook session's skill reference): a row is a specialty of a parent, read as <List>.<Parent>.<Spec>.<w>.
        // by: a choice stat of this list that holds the specialty (none: the row's own name says it, as Blade (Longsword) or Blade: Longsword);
        // of: a choice stat that names the parent (a specialty that is its own entry, or a row of the character's own); fall: a number stat or
        // a column, the Fallback a sibling specialty is read at; dflt: a column, the untrained figure. Each as the list spells it, the same in
        // both views; one that names nothing here is left off
        var spNv = typeof v.specs.never === 'string' ? lower(v.specs.never.trim()) : '', spPn = typeof v.specs.pen === 'string' ? lower(v.specs.pen.trim()) : '', spN = '', spP = '';   // round four: never, where the parent cannot be tried untrained; pen, the untrained penalty a card says
        var spCv = typeof v.specs.cover === 'string' ? lower(v.specs.cover.trim()) : '', spC = '', spAp = typeof v.specs.apart === 'string' ? lower(v.specs.apart.trim()) : '', spA = '', spOf = typeof v.specs.of === 'string' ? lower(v.specs.of.trim()) : '', spO = '', spS = {}, spBy = typeof v.specs.by === 'string' ? lower(v.specs.by.trim()) : '', spFa = typeof v.specs.fall === 'string' ? lower(v.specs.fall.trim()) : '', spDf = typeof v.specs.dflt === 'string' ? lower(v.specs.dflt.trim()) : '', spB = '', spF = '', spD = '';
        (out.stats || []).forEach(function(s) { if (!spC && spCv && s.kind !== 'pick' && Array.isArray(s.labels) && s.labels.length && lower(s.key) === spCv) spC = s.key; if (!spA && spAp && s.kind !== 'pick' && Array.isArray(s.labels) && s.labels.length && lower(s.key) === spAp) spA = s.key; if (!spO && spOf && s.kind === 'pick' && lower(s.key) === spOf) spO = s.key; if (!spB && spBy && s.kind === 'pick' && lower(s.key) === spBy) spB = s.key; if (!spF && spFa && s.kind !== 'pick' && lower(s.key) === spFa) spF = s.key; if (!spN && spNv && s.kind !== 'pick' && lower(s.key) === spNv) spN = s.key; if (!spP && spPn && s.kind !== 'pick' && lower(s.key) === spPn) spP = s.key; });
        (out.cols || []).forEach(function(c) { if (!spF && spFa && lower(c.key) === spFa) spF = c.key; if (!spD && spDf && lower(c.key) === spDf) spD = c.key; if (!spN && spNv && lower(c.key) === spNv) spN = c.key; if (!spP && spPn && lower(c.key) === spPn) spP = c.key; });
        if (spB) spS.by = spB; if (spO) spS.of = spO; if (spC) spS.cover = spC; if (spA) spS.apart = spA; if (spF) spS.fall = spF; if (spD) spS.dflt = spD; if (spN) spS.never = spN; if (spP) spS.pen = spP; if (v.specs.sum === true) spS.sum = true;   // gap 20: Subject reads Add the rows, true only, the same in both views
        out.specs = spS;
    }
    if (isObj(v.load) && out.counters) {   // 1.5.8 Loads from: a row of this list loads one unit of a row of another item list (from, a field id; cleanSystem keeps it only where that is another item list with a level); ct, one of this list's counters, holds what the loaded row has left; cats, the categories of that list it takes (none: any row). The same in both views
        var ldF = typeof v.load.from === 'string' && FIELD_ID.test(v.load.from) ? v.load.from : '', ldK = typeof v.load.ct === 'string' ? lower(v.load.ct.trim()) : '', ldT = '';
        out.counters.forEach(function(x) { if (!ldT && lower(x.key) === ldK) ldT = x.key; });
        if (ldF && ldT) {
            var ldo = { from: ldF, ct: ldT }; rollNeedsInto(ldo, v.load);
            var ldTk = cleanFormulaText(v.load.takeIf); if (ldTk) ldo.takeIf = ldTk;   // 1.6.2 Takes rows where: a test of each row it may take from, read with that row's own names
            var ldBy = typeof v.load.by === 'string' ? statKey(v.load.by.trim(), F) : '', ldTo = typeof v.load.to === 'string' ? statKey(v.load.to.trim(), F) : '', ldByS = '';   // Matched by: a stat of this list (spelled as it is) and a stat key of the source list
            (out.stats || []).forEach(function(s) { if (!ldByS && ldBy && lower(s.key) === lower(ldBy)) ldByS = s.key; });
            if (ldByS && ldTo) { ldo.by = ldByS; ldo.to = ldTo; }
            var ldJ = typeof v.load.job === 'string' ? lower(v.load.job.trim()) : ''; if (ldJ) out.counters.forEach(function(x) { if (!ldo.job && lower(x.key) === ldJ) ldo.job = x.key; });   // 1.6.2 Load takes a job: the counter of the list's job that loads it, as the list spells it   // Loads only where: what a row must meet before it may load, and its words
            if (Array.isArray(v.load.cats)) { var ldc = [], seenL = map(); v.load.cats.forEach(function(c) { var lt = cutText(c, LIMITS.category); if (!lt || seenL[lower(lt)] || ldc.length >= LIMITS.listCats) return; seenL[lower(lt)] = 1; ldc.push(lt); }); if (ldc.length || (!gmView && v.load.cats.length === 0)) ldo.cats = ldc; }
            out.load = ldo;
        }
    }
    if (Array.isArray(v.feeds) && out.counters) {   // 1.6.0 Feeds: up to FEEDS_MAX feeds a row loads apart, each { key, from, ct, turns?, cats?, by?, to? }: key, how formulas name it (Row.Feed.<key>.<stat>); from, another item list with a level (cleanSystem keeps it only where that is one); ct, a counter of this list of its own, no load's and no other feed's; turns, the turns a change takes, a formula of the row's names with no dice; cats, by and to as a load's. The same in both views
        var fdL = [], fdK = map(), fdC = map(); if (out.load) fdC[lower(out.load.ct)] = 1;
        v.feeds.forEach(function(fv) {
            if (fdL.length >= FEEDS_MAX || !isObj(fv)) return;
            var fk = typeof fv.key === 'string' ? fv.key.trim() : '', ff = typeof fv.from === 'string' && FIELD_ID.test(fv.from) ? fv.from : '', fc = typeof fv.ct === 'string' ? lower(fv.ct.trim()) : '', ft = '';
            if (!STAT_KEY.test(fk) || (fk in Object.prototype) || (lower(fk) in Object.prototype) || fdK[lower(fk)] || !ff) return;
            out.counters.forEach(function(x) { if (!ft && lower(x.key) === fc) ft = x.key; }); if (!ft || fdC[lower(ft)]) return;
            var fo = { key: fk, from: ff, ct: ft }, ftn = cleanFormulaText(fv.turns), fif = cleanFormulaText(fv['if']); if (ftn) fo.turns = ftn; if (fif) fo['if'] = fif;   // if: Only where, a formula of the row with no dice
            var fBy = typeof fv.by === 'string' ? statKey(fv.by.trim(), F) : '', fTo = typeof fv.to === 'string' ? statKey(fv.to.trim(), F) : '', fByS = '';
            (out.stats || []).forEach(function(s) { if (!fByS && fBy && lower(s.key) === lower(fBy)) fByS = s.key; });
            if (fByS && fTo) { fo.by = fByS; fo.to = fTo; }
            if (Array.isArray(fv.cats)) { var fcs = [], fSeen = map(); fv.cats.forEach(function(c) { var lt = cutText(c, LIMITS.category); if (!lt || fSeen[lower(lt)] || fcs.length >= LIMITS.listCats) return; fSeen[lower(lt)] = 1; fcs.push(lt); }); if (fcs.length || (!gmView && fv.cats.length === 0)) fo.cats = fcs; }
            fdK[lower(fk)] = 1; fdC[lower(ft)] = 1; fdL.push(fo);
        });
        if (fdL.length) out.feeds = fdL;
    }
    if (isObj(v.parts)) {   // 1.6.0, backlog 180 R14 (the owner, by prompt: "A. A row of a list", "A. Pills under the row", "A. Count and totals"): this list's rows hold parts, rows of an item list (from, a field id: another list or this one; cleanSystem keeps it only where that list is in the view); cats, the categories a part may be; label, the word on its add button. The same in both views
        var ptF = typeof v.parts.from === 'string' && FIELD_ID.test(v.parts.from) ? v.parts.from : '';
        if (ptF) {
            var pto = { from: ptF };
            if (Array.isArray(v.parts.also)) { var ptA = []; v.parts.also.slice(0, 16).forEach(function(id) { if (typeof id === 'string' && FIELD_ID.test(id) && id !== ptF && ptA.indexOf(id) < 0 && ptA.length < PART_SRCS - 1) ptA.push(id); }); if (ptA.length) pto.also = ptA; }   // 1.6.2: and more lists, in the order ticked
            if (Array.isArray(v.parts.cats)) { var ptc = [], seenPt = map(); v.parts.cats.forEach(function(c) { var pc2 = cutText(c, LIMITS.category); if (!pc2 || seenPt[lower(pc2)] || ptc.length >= LIMITS.listCats) return; seenPt[lower(pc2)] = 1; ptc.push(pc2); }); if (ptc.length) pto.cats = ptc; }
            var ptLb = cutText(v.parts.label, LIMITS.label); if (ptLb) pto.label = ptLb;
            var ptCb = typeof v.parts.capBy === 'string' ? lower(statKey(v.parts.capBy.trim(), F)) : '';   // 1.6.0 (v2, B6): a host holds as many parts as one of its number stats reads, spelled as this list spells it
            (out.stats || []).forEach(function(s) { if (!pto.capBy && ptCb && s.kind !== 'pick' && s.set !== true && lower(s.key) === ptCb) pto.capBy = s.key; });
            if (v.parts.deep === true) pto.deep = true;   // 205 (4), the owner's word (2026-10-29: "Yes, open it"): a part may hold parts of its own; cleanField keeps it only where the parts come from the list itself
            if (Array.isArray(v.parts.caps)) {   // 205 (5): a cap per kind, each { cats, the categories it counts; by, a number stat of this list (spelled as it is, never a pick) the host's figure in which caps them }; PART_CAPS at most, each complete
                var ptk = []; v.parts.caps.forEach(function(c) {
                    if (!isObj(c) || ptk.length >= PART_CAPS) return;
                    var kb = typeof c.by === 'string' ? lower(statKey(c.by.trim(), F)) : '', kbS = ''; (out.stats || []).forEach(function(s) { if (!kbS && kb && s.kind !== 'pick' && s.set !== true && lower(s.key) === kb) kbS = s.key; });
                    var ksl = typeof c.slot === 'string' ? statKey(c.slot.trim(), F) : '', kis = capIsIn(c.is), kf = cleanFormulaText(c.f), kif = cleanFormulaText(c['if']), klb = cutText(c.label, LIMITS.label), kEnd = function(o) { if (kif) o['if'] = kif; if (klb) o.label = klb; return o; };   // the core handbook session's ask 4 (2026-10-29): or { slot, is, by }, the parts whose own choice stat slot reads is (cleanSystem spells both as the parts' list does, and drops a line it cannot); 1.6.2: is may be several values, any of which counts, and f, a formula read on the host row, says how many in place of by
                    if (ksl && kis) { if (kf) ptk.push(kEnd({ slot: ksl, is: kis, f: kf })); else if (kbS) ptk.push(kEnd({ slot: ksl, is: kis, by: kbS })); return; }
                    var kc = [], seenK = map(); (Array.isArray(c.cats) ? c.cats : []).forEach(function(x) { var kt = cutText(x, LIMITS.category); if (!kt || seenK[lower(kt)] || kc.length >= LIMITS.listCats) return; seenK[lower(kt)] = 1; kc.push(kt); });
                    if (kf && kc.length) ptk.push(kEnd({ cats: kc, f: kf })); else if (kbS && kc.length) ptk.push(kEnd({ cats: kc, by: kbS }));
                });
                if (ptk.length) pto.caps = ptk;
            }
            if (Array.isArray(v.parts.hosts)) { var pth = [], seenPh = map(); v.parts.hosts.forEach(function(c) { var ph2 = cutText(c, LIMITS.category); if (!ph2 || seenPh[lower(ph2)] || pth.length >= LIMITS.listCats) return; seenPh[lower(ph2)] = 1; pth.push(ph2); }); if (pth.length) pto.hosts = pth; }   // 198: the categories a row may be to hold parts (none named: every row that is no part)
            var ptFi = cleanFormulaText(v.parts.fitIf); if (ptFi) { pto.fitIf = ptFi; var ptFs = cutText(v.parts.fitIfSays, LIMITS.needsWords); if (ptFs) pto.fitIfSays = ptFs; }
            if (Array.isArray(v.parts.fitMore)) { var ptM = []; v.parts.fitMore.slice(0, 256).forEach(function(r) { if (!isObj(r) || ptM.length >= PART_FITS) return; var mi = cleanFormulaText(r['if']); if (!mi) return; var mo = { 'if': mi }, ms = cutText(r.says, LIMITS.needsWords); if (ms) mo.says = ms; ptM.push(mo); }); if (ptM.length) pto.fitMore = ptM; }   // 1.6.2: further rules of Fits where, each with words of its own (fitRows)
            // 1.6.0 Fits where (the core handbook session's ask 18): a formula with no dice read with the part's own names (Row.*), its would-be host's (Host.*) and the character's; a part where it does not hold is refused (partFitSays), in fitIfSays' words where they are set. cleanSystem drops one that does not parse or rolls dice, and from the players' view one that reads a GM-only value (fitIfOk)
            out.parts = pto;
        }
    }
    if (isObj(v.look)) out.look = cleanLookSpec(v.look, out.stats);   // 1.6.0, backlog 206: Rows carry a look (main, by, shades)
    if (v.workLog === true) out.workLog = true;   // ... and Rows keep a work log
    var sjW = cleanSubjects(v.subject); if (sjW) out.subject = sjW;   // 1.6.0 Subjects (a row holds one by its place: rowSubject, Row.subject)
    if (sjW && typeof v.subjectIf === 'string') { var sjiT = cleanFormulaText(v.subjectIf); if (sjiT) out.subjectIf = sjiT; }
    if (typeof v.throwIf === 'string') { var twT = cleanFormulaText(v.throwIf); if (twT) { out.throwIf = twT; var twS = cutText(v.throwSays, LIMITS.needsWords); if (twS) out.throwSays = twS; } }   // 1.6.2 Thrown only where: a formula of the row with no dice, and the words a refused throw says (asked by a system build: a row in storage cannot be thrown)   // 1.6.0 Subject only where: a formula of the row with no dice. Only a row where it holds shows the menu, and any other reads subject 0
    if (isObj(v.chamber)) {   // 1.5.9 Chambers from: a row of this list chambers rounds, one unit at a time, from an item list (from, a field id: another list or this one; cleanSystem keeps it only where that list is in the view). cap, how many it holds (1 to CHAMBER_CAP); label, its button's word; by and to, Matched by, as a load's; cats, the categories it takes. The same in both views
        var chF = typeof v.chamber.from === 'string' && FIELD_ID.test(v.chamber.from) ? v.chamber.from : '';
        if (chF) {
            var chN = typeof v.chamber.cap === 'number' && fin(v.chamber.cap) ? Math.round(v.chamber.cap) : 1, cho = { from: chF, cap: Math.max(1, Math.min(CHAMBER_CAP, chN)) };
            var chCb = typeof v.chamber.capBy === 'string' ? lower(statKey(v.chamber.capBy.trim(), F)) : '';   // 1.5.9 (the review of fold 2, docs/BOOK_ES_ET_PLAN.md: "Chambers from's cap should be able to come from the ROW"): a number stat of this list, spelled as it is; a row whose figure there is 1 or more holds that many (chamberCap)
            (out.stats || []).forEach(function(s) { if (!cho.capBy && chCb && s.kind !== 'pick' && lower(s.key) === chCb) cho.capBy = s.key; });
            var chBy = typeof v.chamber.by === 'string' ? statKey(v.chamber.by.trim(), F) : '', chTo = typeof v.chamber.to === 'string' ? statKey(v.chamber.to.trim(), F) : '', chByS = '';
            (out.stats || []).forEach(function(s) { if (!chByS && chBy && lower(s.key) === lower(chBy)) chByS = s.key; });
            if (chByS && chTo) { cho.by = chByS; cho.to = chTo; }
            var chLb = cutText(v.chamber.label, LIMITS.label); if (chLb) cho.label = chLb;
            if (Array.isArray(v.chamber.cats)) { var chc = [], seenCh = map(); v.chamber.cats.forEach(function(c) { var ct2 = cutText(c, LIMITS.category); if (!ct2 || seenCh[lower(ct2)] || chc.length >= LIMITS.listCats) return; seenCh[lower(ct2)] = 1; chc.push(ct2); }); if (chc.length || (!gmView && v.chamber.cats.length === 0)) cho.cats = chc; }
            var chTk = cleanFormulaText(v.chamber.takeIf); if (chTk) cho.takeIf = chTk;   // 1.6.2 Takes rows where, as Loads from's
            rollNeedsInto(cho, v.chamber);   // Chambers only where (1.5.9): what a row must meet before it may chamber, and its words, kept as Loads only where's
            var chRc = cleanReach(v.chamber.reach, F); if (chRc) cho.reach = chRc;   // 1.5.9 (es) Flies at most: how far a round that flies straight goes, from the row's own names
            out.chamber = cho;
        }
    }
    if (isObj(v.once)) {   // 1.5.8 Counted once: rows whose group stat reads the same figure, not 0, are one thing held two ways (onceOf). by a number stat, rank the level or a number stat, cost and free a number stat or a column (free since 1.6.2: a row another row granted costs 0 and holds no free stat), each as the list spells it. The same in both views: none of them is a secret
        var onum = function(k) { if (typeof k !== 'string') return ''; var lk = lower(k.trim()); for (var oi = 0; lk && out.stats && oi < out.stats.length; oi++) if (out.stats[oi].kind !== 'pick' && lower(out.stats[oi].key) === lk) return out.stats[oi].key; return ''; };
        var ocol = function(k) { if (typeof k !== 'string') return ''; var lk = lower(k.trim()); for (var oj = 0; lk && out.cols && oj < out.cols.length; oj++) if (lower(out.cols[oj].key) === lk) return out.cols[oj].key; return ''; };
        var oby = onum(v.once.by), ork = v.once.rank === 'lvl' && out.lvl ? 'lvl' : onum(v.once.rank);
        if (oby && ork) { var oo = { by: oby, rank: ork }, oc = onum(v.once.cost) || ocol(v.once.cost), ofr = onum(v.once.free) || ocol(v.once.free); if (oc) oo.cost = oc; if (ofr) oo.free = ofr; if (v.once.across === true && out.specs) oo.across = true; out.once = oo; }   // 1.6.0 Across specialties, true only and only on a list with Specialties: the group leaves the specialty out
    }
    if (gmView) { var ormK = cleanOnRemove(v.onRemove, F); if (ormK) out.onRemove = ormK; }   // 1.6.0: When a row is taken off, the host's alone
    var boK = cleanBuyOff(v.buyOff, F); if (boK) out.buyOff = boK;   // 1.6.4 Buy off, in both views (cleanSystem checks what it names against the view)
    if (gmView && isObj(out.on)) { var swOn = cleanOnRemove(v.switchOn, F), swOff = cleanOnRemove(v.switchOff, F); if (swOn) out.switchOn = swOn; if (swOff) out.switchOff = swOff; }   // 1.6.2 (167 B; the owner, by prompt: "On and off, and from a file too"): When switched on and When switched off, a list with a switch alone, the host's alone
    if (gmView && out.on && isObj(v.upkeep)) { var upk = cleanUpkeep(v.upkeep, F); if (upk && typeof v.upkeep.ct === 'string') { var upC = (out.counters || []).filter(function(t) { return lower(t.key) === lower(v.upkeep.ct.trim()); })[0]; if (upC) upk.ct = upC.key; } if (upk && typeof v.upkeep.eachBy === 'string') { var upE = (out.stats || []).filter(function(s) { return lower(s.key) === lower(v.upkeep.eachBy.trim()) && s.set !== true && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length > 0 : Array.isArray(s.labels) && s.labels.length > 0); })[0]; if (upE) upk.eachBy = upE.key; else if (upk.each !== 'clock') delete upk.per; } if (upk) out.upkeep = upk; }   // the core handbook session's ask 5: and the choice stat whose value says when a row pays (its spelling; none: as before)   // 1.6.0 (CORE gap 13): ... and the counter of the list each payment adds 1 to (its spelling; none of the list: none)   // 1.6.0 (CORE gap 13): what a row switched on keeps paying, the GM's view alone
    if (Array.isArray(v.rolls)) {   // F5b: its rolls — a button on each row, the formula worked out with the row's names (Row.*; dice allowed), LIMITS.rowRolls at most
        var rls = [];
        v.rolls.forEach(function(rv) { if (rls.length >= LIMITS.rowRolls || !isObj(rv)) return; if (Array.isArray(rv.apply)) { var lap = { label: cutText(rv.label, LIMITS.label) || 'Apply', apply: cleanApplyChanges(rv.apply, false, true) }, lac = costKey(rv.cost); if (lac) lap.cost = lac; costNInto(lap, rv); clockNInto(lap, rv); var lajb = cleanJob(rv.job, out.counters); if (lajb) lap.job = lajb; rollNeedsInto(lap, rv, true); hideOffInto(lap, rv); if (onOther(rv)) lap.to = rv.to; if (rv.gm === true) lap.gm = true; if (rv.free === true) lap.free = true; var lsh = cleanFormulaText(rv.showIf); if (lsh) lap.showIf = lsh; var lal = cleanAlt(rv.alt, F); if (lal) lap.alt = lal; var lic = cleanIcon(rv.icon); if (lic) lap.icon = lic; if (gmView) { var lxc = cleanRowCross(rv.cross, out.counters); if (lxc) lap.cross = lxc; } callsInto(lap, rv, gmView); partPlaceIn(lap, rv); rls.push(lap); return; } var rro = { label: cutText(rv.label, LIMITS.label) || 'Roll', formula: cleanFormulaText(rv.formula) || '' }, rrw = cleanWas(rv.was); if (rrw) { rrw = rrw.filter(function(x) { return lower(x) !== lower(rro.label); }); if (rrw.length) rro.was = rrw; } if (Array.isArray(rv.then)) { var rth = cleanApplyChanges(rv.then, true, true); if (rth.length) rro.then = rth; } var rmf2 = cleanFormulaText(rv.malf); if (rmf2) rro.malf = rmf2; critRangeInto(rro, rv); if (TO_GM[rv.toGm] === 1) rro.toGm = rv.toGm; var rbg2 = cleanFormulaText(rv.bigAt); if (rbg2) rro.bigAt = rbg2; if (rv.dmg === true) { rro.dmg = true; var rdt = cleanFormulaText(rv.dtype); if (rdt) rro.dtype = rdt; var rdk = cleanFormulaText(rv.dkind); if (rdk) rro.dkind = rdk; var rad = cleanFormulaText(rv.ad); if (rad) rro.ad = rad; if (rv.dmgMajor === true) rro.dmgMajor = true; var rmi = cleanFormulaText(rv.dmgMajorIf); if (rmi) rro.dmgMajorIf = rmi; var rht = cleanFormulaText(rv.hits); if (rht) rro.hits = rht; var rp2 = cleanFormulaText(rv.dmg2); if (rp2) { rro.dmg2 = rp2; var rpt = cleanFormulaText(rv.dtype2); if (rpt) rro.dtype2 = rpt; var rpa = cleanFormulaText(rv.ad2); if (rpa) rro.ad2 = rpa; var rpq = cleanFormulaText(rv.dkind2); if (rpq) rro.dkind2 = rpq; } DMG_MORE.forEach(function(k) { var rpk = cleanFormulaText(rv['dmg' + k]); if (rpk) { rro['dmg' + k] = rpk; var rtk = cleanFormulaText(rv['dtype' + k]); if (rtk) rro['dtype' + k] = rtk; var rak = cleanFormulaText(rv['ad' + k]); if (rak) rro['ad' + k] = rak; var rkq = cleanFormulaText(rv['dkind' + k]); if (rkq) rro['dkind' + k] = rkq; } }); } if (rv.dmg !== true && (rv.burst === 'attack' || rv.burst === 'extra')) rro.burst = rv.burst; if (rv.dmg !== true && rv.blastHit === true) rro.blastHit = true; var rnd = cleanFormulaText(rv.needs), rnw = cleanNeedsWhy(rv.needsWhy); if (rnd) { rro.needs = rnd; var rnt = cutText(rv.needsText, LIMITS.needsWords); if (rnt) rro.needsText = rnt; } if (rnw) rro.needsWhy = rnw; if (rnd || rnw) { if (rv.needsGm === true) rro.needsGm = true; hideOffInto(rro, rv); } var lrc = costKey(rv.cost); if (lrc) rro.cost = lrc; costNInto(rro, rv); clockNInto(rro, rv); var rjb = cleanJob(rv.job, out.counters); if (rjb) rro.job = rjb; var lrd = cleanDie(rv.die); if (lrd) rro.die = lrd; if (onOther(rv)) rro.to = rv.to; if (typeof rv.test === 'string' && /^T[0-9]{1,3}$/.test(rv.test) && typeof rv.of === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(rv.of)) { rro.test = rv.test; rro.of = rv.of; }   /* 1.6.2 (backlog 59): it rolls one of the system's tests with a figure of the row */ if (rv.gm === true) rro.gm = true; if (rv.free === true) rro.free = true; var rsh = cleanFormulaText(rv.showIf); if (rsh) rro.showIf = rsh; var ral = cleanAlt(rv.alt, F); if (ral) rro.alt = ral; var rshw = rollShowOf(rv.show, out.cols); if (rshw) rro.show = rshw; var ric = cleanIcon(rv.icon); if (ric) rro.icon = ric; if (rv.askLvl === true && out.lvl) rro.askLvl = true; var rsts = rollStations(rv.stations); if (rsts) rro.stations = rsts; if (gmView) { var rxc = cleanRowCross(rv.cross, out.counters); if (rxc) rro.cross = rxc; } if (rv.resist === true) { rro.resist = true; if (rv.thru === true) rro.thru = true; if (gmView) { var anL = cleanAnswers(rv.answers); if (anL) rro.answers = anL; } /* 1.6.3 (defense fold 3): When it answers an attack */ } resistByInto(rro, rv, gmView); rollAreaInto(rro, rv, gmView, true); landDmgInto(rro, rv, gmView, true); /* 1.6.3 (defense fold 1): Its damage */ if (gmView && rro.resistBy) { var rak = attemptKeyOf(out.stats, rv.attemptKey); if (rak) rro.attemptKey = rak; var raT = cleanFormulaText(rv.attemptType); if (raT) rro.attemptType = raT; } callsInto(rro, rv, gmView, true); partPlaceIn(rro, rv); rls.push(rro); });   // cross (1.6.0): it also runs on a row whose counter crosses a step   // showIf (1.6.0): Shown where, a formula of the row's names; its button only on rows where it holds   // 1.6.0: gm, only the GM presses it (the players' view drops it: applyTargets)   // R2b: a list roll's consequences (a counter too) and what it needs   // HUD H7b: or an apply action on each row (its amounts read the row as Row.*)
        rls.forEach(function(r) { if (!Array.isArray(r.was)) return; var kw = r.was.filter(function(x) { return !rls.some(function(o) { return lower(o.label) === lower(x); }); }); if (kw.length) r.was = kw; else delete r.was; });   // 1.6.2: an earlier label another roll of the list holds now is that roll's
        if (rls.length) out.rolls = rls;
    }
    if (isObj(v.at)) {   // 1.6.0 (asked by the campaign build's session, for an implant that reads the location it sits at): Stands at, a row of another item list (from, a field id; cleanSystem keeps it only where that list is in the view and is not this one) named by a choice stat of this list (by: a pick, or a number with value names, spelled as the list spells it; never parts, round or fired, Row.'s own words with a dot). The same in both views (atIndex, atVal)
        var atF = typeof v.at.from === 'string' && FIELD_ID.test(v.at.from) ? v.at.from : '', atB = typeof v.at.by === 'string' ? lower(v.at.by.trim()) : '', atS = '';
        (out.stats || []).forEach(function(s) { if (!atS && atB && AT_NOT[atB] !== 1 && lower(s.key) === atB && s.set !== true && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length > 0 : Array.isArray(s.labels) && s.labels.length > 0)) atS = s.key; });
        if (atF && atS) out.at = { from: atF, by: atS };
    }
    var stW = cleanStarts(v.starts); if (stW) out.starts = stW;   // 1.6.0 Starts with: the entries a new character begins holding (startRows); cleanSystem leaves a GM-only one out of the players' view
    return Object.keys(out).length ? out : null;
}
// Stage 6 F5a2: a choice stat's options — { label ≤60, name } each, at most LIMITS.pickOpts, a label once ignoring case; the name one formula name
// (letters, digits, _ and dots, 64 at most: the dice path's cap). An option without a usable name (the players' view drops a GM-only one) is left out
function cleanPickOpts(v) {
    var out = [], seen = map();
    (Array.isArray(v) ? v : []).forEach(function(o) {
        if (out.length >= LIMITS.pickOpts || !isObj(o)) return;
        var lb = cutText(o.label, LIMITS.label), nm = typeof o.name === 'string' ? o.name.trim() : '';
        if (!lb || seen[lower(lb)] || !/^[A-Za-z_][A-Za-z0-9_.]{0,63}$/.test(nm)) return;
        seen[lower(lb)] = 1; var oc = { label: lb, name: nm }, ow = cleanWas(o.was); if (ow) oc.was = ow; out.push(oc);
    });
    out.forEach(function(o) { if (!o.was) return; var kw = o.was.filter(function(x) { var l = lower(x); if (seen[l]) return false; seen[l] = 1; return true; }); if (kw.length) o.was = kw; else delete o.was; });   // an option's own label comes first, and an earlier name belongs to one option
    return out;
}
// 1.6.2 (backlog 208, the tracing audit's points 6, 9 and 10): what a row, an entry and a file hold of a choice is its option's label, so a label
// renamed left all of them reading the default. An option keeps the labels it had as was (at most LIMITS.was, newest first, absent where it never
// had another), and each reader of a stored label takes one of those for the option: rowStat, pickLabel and the two maps a cleaner reads (pickMap),
// so a stored value comes round to the new label the next time it is cleaned. A list's roll keeps its earlier labels the same way, for a roll bonus
// aimed at one by its label (swRollIs). Nothing here is shown. The same in both views, so a player's app cleans a row as the host does.
function cleanWas(v) {
    if (!Array.isArray(v)) return null; var out = [], seen = map();
    v.slice(0, LIMITS.was * 4).forEach(function(x) { var t = cutText(x, LIMITS.label), l = lower(t); if (!t || seen[l] || out.length >= LIMITS.was) return; seen[l] = 1; out.push(t); });
    return out.length ? out : null;
}
function wasHas(o, l) { return isObj(o) && Array.isArray(o.was) && o.was.some(function(x) { return typeof x === 'string' && lower(x) === l; }); }
function pickMap(s) { var lm = map(); (s.opts || []).forEach(function(o) { if (isObj(o) && typeof o.label === 'string') lm[lower(o.label)] = o.label; }); (s.opts || []).forEach(function(o) { if (isObj(o) && typeof o.label === 'string' && Array.isArray(o.was)) o.was.forEach(function(x) { if (typeof x === 'string' && !lm[lower(x)]) lm[lower(x)] = o.label; }); }); return lm; }
// Which labels of a list became which, from the list before and the list after: { from, to } pairs. A label gone and a label new are one renamed
// where both options read the same name (picks only, nb and na: each option's name, where that name is one option's on each side), and whatever is
// left pairs in order where as many went as came. Anything else names no rename: an option taken away and two put in say nothing of which is which
function listRenames(before, after, nb, na) {
    var low = function(a) { return (Array.isArray(a) ? a : []).map(function(x) { return typeof x === 'string' ? lower(x.trim()) : ''; }); }, lb = low(before), la = low(after), gone = [], add = [], out = [];
    lb.forEach(function(l, i) { if (l && la.indexOf(l) < 0 && lb.indexOf(l) === i) gone.push({ t: String(before[i]).trim(), n: Array.isArray(nb) ? nb[i] : '' }); });
    la.forEach(function(l, i) { if (l && lb.indexOf(l) < 0 && la.indexOf(l) === i) add.push({ t: String(after[i]).trim(), n: Array.isArray(na) ? na[i] : '' }); });
    if (!gone.length || !add.length) return out;
    if (Array.isArray(nb) && Array.isArray(na)) gone = gone.filter(function(g) {
        if (!g.n || gone.filter(function(x) { return x.n === g.n; }).length !== 1) return true;
        var hs = add.filter(function(x) { return x.n === g.n; }); if (hs.length !== 1) return true;
        out.push({ from: g.t, to: hs[0].t }); add.splice(add.indexOf(hs[0]), 1); return false;
    });
    if (gone.length === add.length) gone.forEach(function(g, i) { out.push({ from: g.t, to: add[i].t }); });
    return out;
}
// F5a2: the choice stats of a view's item lists — lower-case key -> (lower-case label -> the label as the list spells it), the first list's; a key a
// list defines as a number first is a number. Local, never sent
function statPicks(fields) {
    var m = map(), kind = map();
    (Array.isArray(fields) ? fields : []).forEach(function(f) { if (isObj(f) && f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.stats)) f.list.stats.forEach(function(s) { var k = isObj(s) ? statKey(s.key) : ''; if (!k || kind[lower(k)]) return; kind[lower(k)] = s.kind === 'pick' ? 'pick' : 'num'; if (s.kind === 'pick') m[lower(k)] = pickMap(s); }); });
    return m;
}
function picksOf(spec) { var m = null; (isObj(spec) && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { var k = isObj(s) && s.kind === 'pick' ? statKey(s.key) : ''; if (k && !(m && m[lower(k)])) { m = m || map(); m[lower(k)] = pickMap(s); } }); return m; }
// F4c1: the stat keys of a view's item lists — lower-case key -> the key as the first list (field order) spells it. Local, never sent
function statKeys(fields) {
    var m = map();
    (Array.isArray(fields) ? fields : []).forEach(function(f) { if (isObj(f) && f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.stats)) f.list.stats.forEach(function(s) { var k = isObj(s) ? statKey(s.key) : ''; if (k && !m[lower(k)]) m[lower(k)] = k; }); });
    return m;
}
// F4c1 (critic 2): one spelling per stat key per system — a later list's cost where an earlier one says Cost becomes Cost (its price with it), so
// every list, entry and row reads one key. The GM's view only: the players' view is drawn from it (a GM-only list first keeps its spelling)
function oneSpelling(fields) {
    var first = statKeys(fields);
    fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.stats)) return; f.list.stats.forEach(function(s) { var k = first[lower(s.key)]; if (k && k !== s.key) { if (f.list.price === s.key) f.list.price = k; if (Array.isArray(f.list.rolls)) f.list.rolls.forEach(function(rs) { if (isObj(rs) && rs.attemptKey === s.key) rs.attemptKey = k; }); if (isObj(f.list.on) && f.list.on.per === s.key) f.list.on.per = k; if (isObj(f.list.on) && f.list.on.over === s.key) f.list.on.over = k; if (Array.isArray(f.list.cols)) f.list.cols.forEach(function(c) { if (isObj(c) && Array.isArray(c.plus)) c.plus = c.plus.map(function(p) { return p === s.key ? k : p; }); }); s.key = k; } }); });
}
// F4c1: stats (an item's, a carried copy's) — numbers within 1e9 under keys a list defines (keys: lower-case -> its spelling; none: the key rule
// alone, a copy's own), at most LIMITS.entryStats, a plain object (the wire's packer refuses a prototype-free one); null when none. One spelling
// a key (F4c1 review): a copy's cost and Cost keep the first, as a list's keys do, so the GM's sheet and its owner's read one value
function cleanEntryStats(v, keys, picks) {   // picks (F5a2): lower key -> the choice's labels (a label no option has is dropped); none: numbers only under keys
    if (!isObj(v)) return null;
    var out = {}, seen = map(), n = 0, ks = Object.keys(v);
    for (var i = 0; i < ks.length && n < LIMITS.entryStats; i++) {
        var kk = keys ? keys[lower(ks[i])] : statKey(ks[i]), raw = v[ks[i]], pk = kk && picks && typeof picks === 'object' ? picks[lower(kk)] : null;
        var x = pk ? (typeof raw === 'string' ? pk[lower(cutText(raw, LIMITS.label))] : undefined) : (!keys && picks === 'labels' && typeof raw === 'string' ? (cutText(raw, LIMITS.label) || undefined) : statNum(raw));   // picks 'labels': a copy's own (a snapshot, a custom row) may hold a choice's label
        if (!kk || x === undefined || seen[lower(kk)]) continue;
        out[kk] = x; seen[lower(kk)] = 1; n++;
    }
    return n ? out : null;
}
function keysOf(spec) { var m = null; (isObj(spec) && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { var k = isObj(s) ? statKey(s.key) : ''; if (k) { m = m || map(); if (!m[lower(k)]) m[lower(k)] = k; } }); return m; }
function rowStats(v, spec) { var k = keysOf(spec); return k ? cleanEntryStats(v, k, picksOf(spec)) : null; }   // F4c1: a custom or inline copy's stats as its list holds them (a list with no stats: none)
function lvlNum(x) { if (typeof x !== 'number' && typeof x !== 'string') return undefined; if (typeof x === 'string' && !x.trim()) return undefined; var n = Number(x); return fin(n) && Math.abs(n) <= LIMITS.lvlAbs ? n : undefined; }
// 1.5.4 (the owner, 2026-10-05, of a power's details: "theres no actually useful info here about the ability"; by prompt: "On the row
// itself"): an entry's long text, read in a row's details. Its description is prose with its line breaks; what each of its levels gives is
// [{ lvl, text, tag? }], one row a level in level order, at most LIMITS.lvls: text one line, tag a few words shown beside the level (a
// rank's name, a cost). null when nothing is left. The text lives in the library: a stored row and its snapshot never keep a copy of it
// (cleanRowDef drops it), and an owner's inline copy of a row carries it only for an entry players may see (rowText). 1.5.5 (155): a row of
// the character's own is the one exception: it keeps a description and levels of its own (ownLong), as many as LIMITS.ownText a list
// (ownLongOf), and they reach its owner only while the row is not GM-only (projectRows, through rowText's own gate)
function cleanDesc(v) { if (typeof v !== 'string') return ''; var d = v.slice(0, LIMITS.desc * 2).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, LIMITS.desc); return d.trim() ? d : ''; }
// 1.6.4 (backlog: a system's About text; asked 2026-11-23 by the system build for its credit line): a system may say what it is and who made
// it, as about: { says, credits }, plain text both. says is a few lines: its line breaks are kept (a CR LF or a lone CR becomes a line
// break), every other control character becomes a space, and it is cut at LIMITS.aboutLines lines and then LIMITS.aboutSays characters,
// with the space at either end trimmed. credits is one line: a line break or any other control character becomes a space, cut at
// LIMITS.aboutCredits, trimmed. A part left empty is left out, and an about with neither part is null, so cleanSystemNow writes no key and a
// system without one cleans byte for byte as before. A cut keeps the start of the words, so droppedCounts' textsCut counts it where nothing
// else was rewritten; a cut text that also had a CR, a control character or a space at its start goes uncounted, as an entry's description
// does (cleanDesc), since textsCut counts only a cleaned text that is the start of the raw one. The same in
// the GM's and the players' view: it is words for everyone at the table. Read by the System editor's About box (sysedtabs.js renderAbout),
// a new campaign's system picker (campsafe.js pickSystem) and the About window (sheets.js aboutSystemShow), each drawing it as text nodes.
function cleanAbout(v) {
    if (!isObj(v)) return null;
    var out = {};
    if (typeof v.says === 'string') {
        var s = v.says.slice(0, LIMITS.aboutSays * 2).replace(/\r\n?/g, '\n').replace(CTRL_KEEP_NL, ' ');
        s = s.split('\n').slice(0, LIMITS.aboutLines).join('\n').slice(0, LIMITS.aboutSays).trim();
        if (s) out.says = s;
    }
    if (typeof v.credits === 'string') { var c = v.credits.slice(0, LIMITS.aboutCredits).replace(CTRL_RE_G, ' ').trim(); if (c) out.credits = c; }
    return out.says || out.credits ? out : null;
}
function cleanLvls(v) {
    if (!Array.isArray(v)) return null;
    var out = [], seen = map();
    for (var i = 0; i < v.length && i < LIMITS.lvls * 4 && out.length < LIMITS.lvls; i++) {
        var r = v[i]; if (!isObj(r) || typeof r.lvl !== 'number') continue;
        var lv = lvlNum(r.lvl), tx = cutText(r.text, LIMITS.lvlText); if (lv === undefined || !tx || seen[lv] === 1) continue;
        var o = { lvl: lv, text: tx }, tg = cutText(r.tag, LIMITS.lvlTag); if (tg) o.tag = tg;
        if (tg && typeof r.tone === 'string' && TONES[r.tone] === 1) o.tone = r.tone;   // 1.6.2 (180, R5's leftover; the owner: both a list's tone and one a level line): its tag's color, over the list's
        seen[lv] = 1; out.push(o);
    }
    out.sort(function(a, b) { return a.lvl - b.lvl; });
    return out.length ? out : null;
}
// The long text an owner's inline copy of a row carries: the entry's, cleaned, for an entry players may see and only while it fits what is
// left of its list's room (room: characters; none given: no limit). Never a GM-only entry's. Returns the characters it added
function rowText(pd, src, room) {
    if (!isObj(pd) || pd.vis !== 'all' || !isObj(src)) return 0;
    var d = cleanDesc(src.desc), l = cleanLvls(src.lvls), n = d.length; if (l) l.forEach(function(r) { n += r.text.length + (r.tag ? r.tag.length : 0) + 8; });
    if (!n || (typeof room === 'number' && n > room)) return 0;
    if (d) pd.desc = d;
    if (l) pd.lvls = l;
    return n;
}
function longSize(def) { if (!isObj(def)) return 0; var d = cleanDesc(def.desc), l = cleanLvls(def.lvls), n = d.length; if (l) l.forEach(function(r) { n += r.text.length + (r.tag ? r.tag.length : 0) + 8; }); return n; }   // 155: a definition's long text, as rowText counts it
function ownLong(d, src) { if (!isObj(d) || !isObj(src)) return; delete d.desc; delete d.lvls; var t = cleanDesc(src.desc), l = cleanLvls(src.lvls); if (t) d.desc = t; if (l) d.lvls = l; }   // 155: a row of the character's own keeps its own long text as stored, whatever its vis (projectRows is the gate), as its last keys
function ownLongOf(list, skip, def) { var n = def ? longSize(def) : 0; (Array.isArray(list) ? list : []).forEach(function(r) { if (!isObj(r) || r === skip || r.hid === 1 || typeof r.defId === 'string' || r.lnk === 1 || !isObj(r.def)) return; n += longSize(r.def); }); return n; }   // 155: the long text a list's own rows hold (a kept curse's copy not counted); skip and def: one row as it would be
function cleanLvlSpec(v) {
    if (!isObj(v)) return null;
    var out = { label: cutText(v.label, LIMITS.label) || 'Level' }, lbs = cleanLabels(v.labels), mn = lvlNum(v.min), mx = lvlNum(v.max), st = lvlNum(v.step);
    if (lbs) { out.min = Math.min(mn === undefined ? 0 : Math.round(mn), LIMITS.lvlAbs - (lbs.length - 1)); out.max = out.min + lbs.length - 1; out.step = 1; }
    else {
        if (mn !== undefined) out.min = mn;
        if (mx !== undefined) out.max = mn !== undefined && mx < mn ? mn : mx;
        out.step = st !== undefined && st >= 1e-6 ? st : 1;
    }
    var d = lvlNum(v.def); out.def = lvlClamp(out, d === undefined ? (out.min !== undefined ? out.min : 0) : d);
    if (lbs) out.labels = lbs;
    else if (v.split === true) out.split = true;   // 1.5.6 Split in trades: a trade may take part of a row's level (a money chip's stored amount); never a level of named values
    if (v.entry === true) out.entry = true;   // 1.6.0 R8 (the owner, by prompt: "A list ticks it"): Levels from the entry, a row's level a menu of its entry's own By level rows
    if (Array.isArray(v.caps)) {   // 1.6.0 At most at a level: { at, n, up }, a level on the list's own terms, a whole number of rows 0 to LIMITS.carried, and or higher; each level and up once, LIMITS.lvlCaps at most. The same in both views
        var cps = [], seenCp = map();
        v.caps.slice(0, LIMITS.lvlCaps * 4).forEach(function(c) {
            if (cps.length >= LIMITS.lvlCaps || !isObj(c)) return; var ca = lvlNum(c.at), cn = typeof c.n === 'number' && fin(c.n) ? Math.round(c.n) : NaN; if (ca === undefined || !(cn >= 0)) return;
            var co = { at: lvlClamp(out, ca), n: Math.min(LIMITS.carried, cn) }; if (c.up === true) co.up = true;
            var ck = co.at + '|' + (co.up ? 1 : 0); if (seenCp[ck]) return; seenCp[ck] = 1; cps.push(co);
        });
        if (cps.length) out.caps = cps;
    }
    if (v.start === true) out.start = true;   // 1.6.0 (the owner, by prompt: "Row.startlvl (Recommended)"): Keeps the starting level, each new row stamped with the level it starts at (startStamp)
    return out;
}
// 1.6.0 Keeps the starting level: a new row remembers the level it starts at as sl, read as Row.startlvl. Only where its list ticks it, so a
// list that does not stores what it always did
function startStamp(spec, row) { if (isObj(spec) && isObj(spec.lvl) && spec.lvl.start === true && isObj(row) && typeof row.lvl === 'number') row.sl = row.lvl; }
// 1.6.0 Rolls unheld entries (the owner, by prompt: "On the list (Recommended)", "The library picker (Recommended)", "GM and owner, by a tick
// (Recommended)"): whether a character may roll one entry of a list that they hold none of, at the list's Unheld level. The one judge, asked by the
// GM's own roll (net.diceRoll), the host's roll-req branch and the picker's button. sys: the roller's view of the system; def: the entry as that
// view has it (the players' copy for a player: a GM-only entry is never one); char: the character as the caller holds it. { ok: true, f } or
// { ok: false, msg }, the words naming the entry
function unheldJudge(sys, char, fieldId, def) {
    var f = isObj(sys) && Array.isArray(sys.fields) ? fieldById(sys, fieldId) : null, sp = f && f.kind === 'item-list' && isObj(f.list) ? f.list : null, nm = isObj(def) && typeof def.name === 'string' && def.name ? def.name : 'That entry';
    if (!sp || typeof sp.unheld !== 'string' || !sp.unheld || !isObj(sp.lvl)) return { ok: false, msg: 'That list does not roll entries nobody holds.' };
    if (!isObj(def) || typeof def.id !== 'string' || !ITEM_ID.test(def.id)) return { ok: false, msg: 'That entry is not there now.' };
    if (Array.isArray(sp.cats) && sp.cats.length && !catIn(sp.cats, def.category)) return { ok: false, msg: nm + ' is not an entry of ' + (f.label || f.key || 'that list') + '.' };
    var rows = isObj(char) && isObj(char.values) && Array.isArray(char.values[f.id]) ? char.values[f.id] : [];
    if (rows.some(function(r) { if (!isObj(r) || r.hid === 1) return false; if (r.defId === def.id || (r.lnk === 1 && r.src === def.id)) return true; if (!isObj(sp.specs) || typeof def.key !== 'string' || !def.key) return false; var rdU = rowDef(sys, r); return !!rdU && specMeans(sp, rdU.def, specBase(sys, r, rdU.def), def.key); })) return { ok: false, msg: (isObj(char) && typeof char.name === 'string' && char.name ? char.name : 'This character') + ' holds ' + nm + '. Roll it from its row.' };
    return { ok: true, f: f };
}
// A level on a list's terms: stepped from its minimum, clamped to its range (a bound left out is open, within LIMITS.lvlAbs)
function lvlClamp(spec, n) {
    var st = spec.step > 0 ? spec.step : 1, b = spec.min !== undefined ? spec.min : 0, k = Math.round((n - b) / st), e = st * 1e-9;
    var hi = spec.max !== undefined ? Math.min(spec.max, LIMITS.lvlAbs) : LIMITS.lvlAbs, lo = spec.min !== undefined ? Math.max(spec.min, -LIMITS.lvlAbs) : -LIMITS.lvlAbs;
    if (!isFinite(k)) k = 0;
    if (b + k * st > hi + e) k = Math.floor((hi - b) / st + 1e-9);   // the grid's last value inside the bound (never the bound itself when it is off the grid:
    if (b + k * st < lo - e) k = Math.ceil((lo - b) / st - 1e-9);    // a second clamp would move it again, and the GM's and the players' views would disagree)
    var x = b + k * st; if (x > hi + e || x < lo - e) x = hi;   // no grid point inside (no min, a max off the grid): the max
    return fin(x) ? Number(x.toFixed(Math.max(decOf(st), decOf(b)))) : (spec.min !== undefined ? spec.min : 0);   // on the grid's own decimals, no float noise (0.30000000000000004 reads 0.3): a stored level is its own fixed point
}
function decOf(v) { for (var d = 0; d < 12; d++) { var s = v * Math.pow(10, d); if (Math.abs(s - Math.round(s)) < 1e-9 * Math.max(1, Math.abs(s))) return d; } return 12; }   // the decimals a number needs (0.25: 2)
function cleanItemKey(k, F) {   // F4b: '' when it is not a usable key (with the engine: also one a formula can address, L.<key>.lvl)
    if (typeof k !== 'string' || !ITEM_KEY.test(k)) return '';
    var l = lower(k); if ((ROW_WORDS[l] && !ROW_SOFT[l]) || LIST_WORDS[l] === 1 || RESERVED_SUFFIX[l] || FUNC_NAMES[l] || (k in Object.prototype) || (l in Object.prototype)) return '';   // 1.5.4: never on, max or min (List.max.<name> is the list's highest)
    return F && F.parse && !validKey('L.' + k + '.x', F) ? '' : k;
}
// Stage 6 look fold (L4): band groups — { id, label }, at most LIMITS.bandGroups, ids once. { list, ids } (ids a prototype-free set).
function cleanBandGroups(list) {
    var out = [], ids = map();
    if (Array.isArray(list)) for (var i = 0; i < list.length && out.length < LIMITS.bandGroups; i++) { var g = list[i]; if (!isObj(g) || typeof g.id !== 'string' || !GROUP_ID.test(g.id) || ids[g.id]) continue; ids[g.id] = 1; out.push({ id: g.id, label: cutText(g.label, LIMITS.label) || 'Group' }); }
    return { list: out, ids: ids };
}
// The players' view keeps a group only while a band entry of it survives (a group's label is the GM's text: it never travels with nothing
// visible under it); bands: every band a group may be used on
function pruneGroups(groups, bands) {
    var used = map();
    (bands || []).forEach(function(b) { if (Array.isArray(b)) b.forEach(function(q) { if (isObj(q) && typeof q.g === 'string' && groups.ids[q.g] === 1) used[q.g] = 1; }); });
    return { list: groups.list.filter(function(g) { return used[g.id] === 1; }), ids: used };
}
// Which groups have a Pin button anywhere in a layout (a placement, or a section's header): a group with none is always shown
function pinTargets(sections) {
    var t = map();
    (Array.isArray(sections) ? sections : []).forEach(function(s) { if (!isObj(s)) return; if (typeof s.pin === 'string') t[s.pin] = 1; (Array.isArray(s.fields) ? s.fields : []).forEach(function(pl) { if (isObj(pl) && pl.kind === 'pin' && typeof pl.g === 'string') t[pl.g] = 1; }); });
    return t;
}
// Stage 6 HUD frame (HF1): a Pin in either view pins the group on both bands
function pinTargetsAll(sheet) { return pinTargets((isObj(sheet) && Array.isArray(sheet.sections) ? sheet.sections : []).concat(isObj(sheet) && isObj(sheet.hud) && Array.isArray(sheet.hud.sections) ? sheet.hud.sections : [])); }
// HF1: does the (cleaned) system's HUD hold anything to draw — a band or ledger figure, or a placement in a section?
// 1.6.2 (the owner: "A plain default HUD"): the HUD of a system that sets none of its own. One section: its pools, then the rolls the sheet's
// first section places, in their order. null where there is none of either. The HUD's head already shows the name and the picture
function hudDefault(sys) {
    var sh = sys && isObj(sys.sheet) ? sys.sheet : null, flds = sys && Array.isArray(sys.fields) ? sys.fields : [], items = [], seen = map();
    flds.forEach(function(f) { if (isObj(f) && f.kind === 'resource' && typeof f.id === 'string' && !seen[f.id]) { seen[f.id] = 1; items.push({ id: f.id, w: 1 }); } });
    var first = sh && Array.isArray(sh.sections) ? sh.sections.filter(function(x) { return isObj(x) && !x.parent; })[0] : null;
    (first && Array.isArray(first.fields) ? first.fields : []).forEach(function(p) { if (isObj(p) && typeof p.roll === 'string' && !seen['r:' + p.roll]) { seen['r:' + p.roll] = 1; items.push({ roll: p.roll, w: 1 }); } });
    return items.length ? { title: 'HUD', auto: true, tabs: [], sections: [{ id: 's_hudauto', title: '', cols: 2, fields: items.slice(0, 40) }] } : null;
}
// The HUD as drawn: the system's own where it has one, else the plain default
function hudOf(sys) { var h = sys && isObj(sys.sheet) && isObj(sys.sheet.hud) ? sys.sheet.hud : null; return hudOwn(h) ? h : hudDefault(sys); }
function hudHasContent(sys) { return !!hudOf(sys); }
function hudOwn(h) { return !!(h && ((Array.isArray(h.band) && h.band.length) || (Array.isArray(h.ledger) && h.ledger.length) || (Array.isArray(h.sections) && h.sections.some(function(s) { return isObj(s) && Array.isArray(s.fields) && s.fields.length > 0; })))); }
// HF1: the system as the HUD draws it — the same fields, rolls, effects and sheetStyle (by reference), the HUD's own layout in the sheet's
// place, the shared groups, and the look without the sheet-only traits (the header portrait + name: the HUD's head has its own; sticky
// titles: the reference HUD has none). null when there is no HUD. The input is never mutated.
function hudView(sys) {
    var sh = sys && isObj(sys.sheet) ? sys.sheet : null, h = sh ? hudOf(sys) : null; if (!h) return null;   // 1.6.2: the plain default where the system sets none
    var v = Object.assign({}, sys), s2 = { tabs: Array.isArray(h.tabs) ? h.tabs : [], sections: Array.isArray(h.sections) ? h.sections : [] };
    if (Array.isArray(h.band)) s2.band = h.band; if (Array.isArray(h.ledger)) s2.ledger = h.ledger; if (Array.isArray(sh.bandGroups)) s2.bandGroups = sh.bandGroups;
    if (isObj(sh.look)) { var lk = Object.assign({}, sh.look); delete lk.portrait; delete lk.sticky; if (Object.keys(lk).length) s2.look = lk; }
    v.sheet = s2; return v;
}
// Stage 6 HUD frame (HF1): one set of cleaners for every layout of the sheet (the sheet, its HUD); each call keeps its OWN once-per-field
// lists and caps, so a field may be on the sheet AND in the HUD, and once within each
function cleanTabs(list) {   // Optional named tabs (Stage 1): ordered, labels only for v1. Absent ⇒ sections stack (as before).
    var out = [], ids = map();
    if (Array.isArray(list)) for (var t = 0; t < list.length && out.length < LIMITS.tabs; t++) {
        var tb = list[t];
        if (!isObj(tb) || typeof tb.id !== 'string' || !TAB_ID.test(tb.id) || ids[tb.id]) continue;
        ids[tb.id] = 1;
        var tabOut = { id: tb.id, label: str(tb.label, LIMITS.label).replace(CTRL_RE_G, ' ').trim() }, tabIcon = cleanIcon(tb.icon);
        if (tabIcon) tabOut.icon = tabIcon;   // Stage 5g: an icon before the label
        out.push(tabOut);
    }
    return { list: out, ids: ids };
}
// Stage 5c: the pinned band — a few placements shown under the name on every tab (and on a stacked sheet). Its own cap and its own
// once-per-item map: a field may be on the band AND in a section. Only what reads in one row (BAND_KINDS + rolls); fieldIds carries each
// field's kind, and in the players' view it lacks GM-only fields, so those pins drop with no extra code. null when absent or empty.
function cleanBand(list, fieldIds, rollIds, groupIds) {
    if (!Array.isArray(list)) return null;
    var band = [], onBand = map();
    for (var b = 0; b < list.length && band.length < LIMITS.band; b++) {
        var q = list[b]; if (!isObj(q)) continue;
        var be = null;
        if (typeof q.id === 'string' && BAND_KINDS[fieldIds[q.id]] === 1 && !onBand[q.id]) { onBand[q.id] = 1; be = { id: q.id }; }
        else if (typeof q.roll === 'string' && rollIds[q.roll] && !onBand[q.roll]) { onBand[q.roll] = 1; be = { roll: q.roll }; }
        if (!be) continue;
        if (typeof q.g === 'string' && groupIds[q.g] === 1) be.g = q.g;   // Stage 6: in a band group (only one that exists)
        band.push(be);
    }
    return band.length ? band : null;   // absent when empty: a system without a band is byte-for-byte what it was
}
// Stage 5d: the header block — identity rows and ledger figures are read-only lists of field ids (no rolls), each with its own cap and
// once-per-id map, kind-gated like the band (so the players' view loses GM-only fields for free); null when empty.
function idList(list, kinds, cap, fieldIds) {
    if (!Array.isArray(list)) return null;
    var outL = [], seenL = map();
    for (var n = 0; n < list.length && outL.length < cap; n++) { var it = list[n]; if (!isObj(it) || typeof it.id !== 'string' || kinds[fieldIds[it.id]] !== 1 || seenL[it.id]) continue; seenL[it.id] = 1; outL.push({ id: it.id }); }
    return outL.length ? outL : null;
}
// [systemcheck:placecats-start]
// 1.5.5: a list placed once a category (the owner, 2026-10-23, by prompt: "A new builder option (Recommended)"). An item list may stand in
// more than one placement of a layout, each placement naming the categories it shows (cats). A category is read as the list's own scope
// reads one (catIn): its first LIMITS.category characters, ignoring case. One placement's categories: each a cleaned text, each once,
// LIMITS.placeCats at most, the first 200 read; null when none is kept
function cleanPlaceCats(v) {
    if (!Array.isArray(v)) return null;
    var out = [], seen = map();
    for (var i = 0; i < v.length && i < LIMITS.placeCats * 25 && out.length < LIMITS.placeCats; i++) { var t = cutText(v[i], LIMITS.category), l = lower(t); if (!t || seen[l]) continue; seen[l] = 1; out.push(t); }
    return out.length ? out : null;
}
function catKey(c) { return typeof c === 'string' ? lower(cutText(c, LIMITS.category)) : ''; }
// The item lists of one layout that may stand in more than one placement: every placement of the list, in a section the cleaner reads,
// names categories of its own, and no category is named by two of them. Any other list keeps its first placement only, as before this
// fold, and that placement keeps no categories. The first LIMITS.placements placements of item lists are read; cleanSections keeps a later
// one only where it names categories no earlier one names, so what it keeps holds the rule whatever is past that. { fieldId: 1 }
function catSplits(list, fieldIds) {
    var seen = map(), bad = map(), named = map(), secs = 0, n = 0;
    for (var i = 0; i < list.length && secs < LIMITS.sections; i++) {
        var s = list[i]; if (!isObj(s) || typeof s.id !== 'string' || !SECTION_ID.test(s.id)) continue; secs++;
        var pls = Array.isArray(s.fields) ? s.fields : [];
        for (var k = 0; k < pls.length && n < LIMITS.placements; k++) {
            var p = pls[k]; if (!isObj(p) || typeof p.id !== 'string' || fieldIds[p.id] !== 'item-list') continue; n++;
            var cs = cleanPlaceCats(p.cats), nm = named[p.id] || (named[p.id] = map()); seen[p.id] = 1;
            if (!cs) { bad[p.id] = 1; continue; }
            cs.forEach(function(c) { var l = lower(c); if (nm[l]) bad[p.id] = 1; nm[l] = 1; });
        }
    }
    var out = map(); Object.keys(seen).forEach(function(id) { if (!bad[id]) out[id] = 1; });
    return out;
}
// The list's home placement in a layout: the one that shows the rows of a category no placement of the list names, and the whole list's
// totals. Its first placement that shows every row it is given: not set to the rows switched on while the list has a switch, and with no
// show-if of its own, of its section or of the section that section stands under (as the renderer nests one, buildSections childParent).
// With none such, its first placement. So a placement that may hide rows never takes in the rows no placement names while another can
// show them. sections: the layout; id: the list's field id; spec: the list's options (undefined: read as a list with a switch); strict:
// true answers null where no placement shows every row (the Layout tab says so). null where the list is not placed there
function catHome(sections, id, spec, strict) {
    var secs = Array.isArray(sections) ? sections : [], byId = map(), first = null, home = null, sw = spec === undefined || (isObj(spec) && isObj(spec.on));
    var hasIf = function(x) { return isObj(x) && typeof x.showIf === 'string' && !!x.showIf.trim(); };
    secs.forEach(function(s) { if (isObj(s) && typeof s.id === 'string') byId[s.id] = s; });
    secs.forEach(function(s) {
        if (!isObj(s)) return;
        var par = typeof s.parent === 'string' && byId[s.parent] && !byId[s.parent].parent ? byId[s.parent] : null, off = hasIf(s) || hasIf(par);
        (Array.isArray(s.fields) ? s.fields : []).forEach(function(p) {
            if (!isObj(p) || typeof id !== 'string' || p.id !== id) return;
            if (!first) first = p;
            if (!home && !off && !hasIf(p) && !(p.on === true && sw)) home = p;
        });
    });
    return strict === true ? home : (home || first);
}
// Which rows one placement shows, for the sheet, the HUD, a print, a window of its own, the Layout preview and the readable page.
// sections: the cleaned layout the placement stands in; plc: the placement itself; spec: the list's options (catHome). null: every row (a
// placement that names no category, or one that is not in that layout). Else a test of a row's category: true where this placement names
// it, and for a category no placement of the list names, true in the list's home placement alone (catHome). So each row stands in exactly
// one placement of a layout. test.home: this placement is the list's home, which draws the whole list's totals
function catPlace(sections, plc, spec) {
    if (!isObj(plc) || typeof plc.id !== 'string' || !Array.isArray(plc.cats) || !plc.cats.length) return null;
    var named = map(), found = false;
    (Array.isArray(sections) ? sections : []).forEach(function(s) {
        (isObj(s) && Array.isArray(s.fields) ? s.fields : []).forEach(function(p) {
            if (!isObj(p) || p.id !== plc.id) return;
            if (p === plc) found = true;
            (Array.isArray(p.cats) ? p.cats : []).forEach(function(c) { var l = catKey(c); if (l && !named[l]) named[l] = p; });
        });
    });
    if (!found) return null;
    var home = catHome(sections, plc.id, spec);
    var test = function(cat) { var l = catKey(cat), at = l ? named[l] : undefined; return at ? at === plc : home === plc; };
    test.home = home === plc;
    return test;
}
// 1.6.0, backlog 180 R13: what a row is placed by in a list placed once a category: its category, or where the list splits its places by a
// choice stat (placeBy) that stat's value name on the row (a pick its label, a number its value name; '' for none). The one reader: the sheet,
// a print, the HUD, a count in a title and the readable page all ask it
function placeVal(sys, spec, row) {
    var rd = rowDef(sys, row), d = rd ? rd.def : null; if (!d) return '';
    if (!isObj(spec) || typeof spec.placeBy !== 'string' || !spec.placeBy) return typeof d.category === 'string' ? d.category : '';
    return statName(spec, d, spec.placeBy);
}
// 1.6.0: a row's choice stat read as a name: a pick its label, a number its value name; '' for none (placeVal, setOf, Row.setall)
function statName(spec, d, key) {
    if (!isObj(d) || typeof key !== 'string' || !key) return '';
    var st = (isObj(spec) && Array.isArray(spec.stats) ? spec.stats : []).filter(function(s) { return isObj(s) && typeof s.key === 'string' && lower(s.key) === lower(key); })[0]; if (!st) return '';
    var v = rowStat(spec, d, st.key);
    if (st.kind === 'pick') return typeof v === 'string' ? v : '';
    return typeof v === 'number' && v === Math.floor(v) && Array.isArray(st.labels) && typeof st.labels[v] === 'string' ? st.labels[v] : '';
}
// 1.6.2 (vehicles, fold (b), rebuilt; the owner, by prompt: "Degrees", then "Yes, rebuild arcs", the core's ask: the system names its arcs, each a
// range of degrees, and they may overlap). combat.arcs: up to ARC_MAX of { key, label, f, t } or { key, label, all: true }, whole degrees from
// a token's facing, 0 straight ahead and clockwise, both ends in; the same in both views. A token reads Arc.<key> (attacked from inside it) and
// Threats.<key> (the threats there); a named arc of key front, side or rear wins over the built-in. A list's rows may say which arc they reach,
// by a choice stat whose values name the system's arcs (Arcs by, { by }); arcIn is the one reading of Target.inArc: 1 where the target stands
// in the arc the row's value names, else 0. arcNamed finds an arc by its key, else by its name, either ignoring case
var ARC_MAX = 32;
// 1.6.2 (backlog 57; the owner, 2026-11-11, by prompt: "Both"): the system's own kinds of difficult terrain. combat.terrain: up to TERRAIN_MAX of
// { key, label, cost }, the key made once from the name and never shown, the cost what moving into it costs, a whole number 2 to 10 as a piece's
// own is; the same in both views, since a player's ruler reads it. A piece names a kind by its key (item.terrainKind) and then costs what the
// kind costs now (fogcore terrainOf, handed terrainCosts). A kind with no name or no cost is no kind. A name that makes no short name (one in
// another script, or one that begins with a digit) gets one made for it, Kind and the first free number, so no named kind is dropped for its letters
var TERRAIN_MAX = 48, TERRAIN_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
// 1.6.3 (the review of combat): the short names a made one must never take. A row that names its own short name gives that one, and a row that names
// none but whose name makes one gives the one its name makes, so a row named Kind or Arc keeps its name though an earlier row's name made none and
// would have taken that word (it was then dropped as a second row of the same short name). re: the short names the list keeps
function arcLabelOf(a) { return typeof a.label === 'string' ? a.label.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, LIMITS.label) : ''; }
function madeKeysTaken(rows, re) { var t = map(); rows.forEach(function(a) { if (!isObj(a)) return; if (typeof a.key === 'string' && re.test(a.key)) { t[lower(a.key)] = 1; return; } var own = arcKey(arcLabelOf(a)); if (own) t[lower(own)] = 1; }); return t; }
function terrainKeyFor(lb, taken) { var k = arcKey(lb), n = 2; if (k || !lb) return k; k = 'Kind'; while (taken[lower(k)] === 1) k = 'Kind' + (n++); return k; }
function cleanTerrainKinds(v) {
    if (!Array.isArray(v)) return null; var out = [], seen = map(), rows = v.slice(0, TERRAIN_MAX * 2), taken = madeKeysTaken(rows, TERRAIN_KEY);   // a made short name never takes one a row names or makes itself
    rows.forEach(function(a) {
        if (!isObj(a) || out.length >= TERRAIN_MAX) return; var lb = arcLabelOf(a);
        var k = typeof a.key === 'string' && TERRAIN_KEY.test(a.key) ? a.key : terrainKeyFor(lb, taken), c = typeof a.cost === 'number' && isFinite(a.cost) ? Math.round(a.cost) : 0;
        if (!k || !lb || c < 2 || seen[lower(k)] === 1) return; seen[lower(k)] = 1; taken[lower(k)] = 1;
        out.push({ key: k, label: lb, cost: Math.min(c, 10) });
    });
    return out.length ? out : null;
}
function terrainKinds(sys) { return isObj(sys) && isObj(sys.combat) ? cleanTerrainKinds(sys.combat.terrain) || [] : []; }
function terrainCosts(sys) { var o = map(); terrainKinds(sys).forEach(function(k) { o[lower(k.key)] = k.cost; }); return o; }
function arcKey(s) { var w = String(s || '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(function(x) { return !!x; }), k = w.map(function(x, i) { return i ? x.charAt(0).toUpperCase() + x.slice(1) : x; }).join(''); return /^[A-Za-z]/.test(k) ? k.slice(0, 40) : ''; }
// 1.6.3 (lane B; Fulllion's rulings of 2026-11-20): an arc whose name makes no short name (one in another script, or one that begins with a digit) gets one
// made for it, Arc and the first free number, as a kind of terrain does, so no named arc is dropped for its letters. taken: the short names the arcs name
// themselves, so a made one never takes one of theirs. An arc whose name makes one is cleaned exactly as before
function arcKeyFor(lb, taken) { var k = arcKey(lb), n = 2; if (k || !lb) return k; k = 'Arc'; while (taken[lower(k)] === 1) k = 'Arc' + (n++); return k; }
function cleanArcs(v) {
    if (!Array.isArray(v)) return null; var out = [], seen = map(), rows = v.slice(0, ARC_MAX * 2), taken = madeKeysTaken(rows, /^[A-Za-z][A-Za-z0-9_]{0,39}$/);   // as a kind of terrain's
    rows.forEach(function(a) {
        if (!isObj(a) || out.length >= ARC_MAX) return; var lb = arcLabelOf(a);
        var k = typeof a.key === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(a.key) ? a.key : arcKeyFor(lb, taken); if (!k || !lb || seen[lower(k)] === 1) return; seen[lower(k)] = 1; taken[lower(k)] = 1;
        if (a.all === true) { out.push({ key: k, label: lb, all: true }); return; }
        var f = arcDeg(a.f), t = arcDeg(a.t); if (f !== null && t !== null) out.push({ key: k, label: lb, f: f, t: t });
    });
    return out.length ? out : null;
}
function arcNamed(arcs, nm) { if (!Array.isArray(arcs) || typeof nm !== 'string' || !nm) return null; var l = lower(nm); return arcs.filter(function(a) { return isObj(a) && typeof a.key === 'string' && lower(a.key) === l; })[0] || arcs.filter(function(a) { return isObj(a) && typeof a.label === 'string' && lower(a.label) === l; })[0] || null; }
function arcStat(stats, by) { return (Array.isArray(stats) ? stats : []).filter(function(s) { return isObj(s) && typeof s.key === 'string' && typeof by === 'string' && lower(s.key) === lower(by) && s.set !== true && s.vis !== 'gm' && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length > 0 : Array.isArray(s.labels) && s.labels.length > 0); })[0] || null; }
function arcDeg(x) { if (typeof x !== 'number' || !isFinite(x) || Math.abs(x) > 1e6) return null; var d = Math.round(norm180(x)); return d === -180 ? 180 : d === 0 ? 0 : d; }
function cleanArc(v, stats) { if (!isObj(v)) return null; var st = arcStat(stats, v.by); return st ? { by: st.key } : null; }
function arcsAny(sys) { return !!sys && Array.isArray(sys.fields) && sys.fields.some(function(f) { return isObj(f) && f.kind === 'item-list' && isObj(f.list) && isObj(f.list.arc); }); }   // only a system whose rows say their arcs carries the bearing, so every other range is as before
function arcHolds(c, rb) { if (!isObj(c) || typeof rb !== 'number' || !isFinite(rb)) return false; if (c.all === true) return true; if (!fin(c.f) || !fin(c.t)) return false; var span = ((c.t - c.f) % 360 + 360) % 360, at = ((rb - c.f) % 360 + 360) % 360; return at <= span; }
function arcIn(spec, d, rb, arcs) {
    if (!isObj(spec) || !isObj(spec.arc) || typeof rb !== 'number' || !isFinite(rb)) return 0;
    var nm = statName(spec, d, spec.arc.by), c = nm ? arcNamed(arcs, nm) : null;
    return c && arcHolds(c, rb) ? 1 : 0;
}
// 1.6.0, backlog 180 R15: a list's sets (Sets by a choice stat): rows whose stat names the same set, compared ignoring case, are one set. setOf the
// set a row is in ('' for none); setsOf every set of the rows given, in the order first met: { name, rows, n, on, all } (on: rows switched on as
// their owner holds them, a curse kept on read off; all: every row on). Rows the GM keeps from the owner (hid) are in none, so both machines count alike
function setOf(sys, spec, row) { if (!isObj(spec) || typeof spec.sets !== 'string' || !spec.sets || !isObj(spec.on) || !isObj(row) || row.hid === 1) return ''; var rd = rowDef(sys, row); return rd ? statName(spec, rd.def, spec.sets) : ''; }
function setsOf(sys, spec, rows) {
    var by = map(), out = [];
    (Array.isArray(rows) ? rows : []).forEach(function(r) { var nm = setOf(sys, spec, r); if (!nm) return; var k = lower(nm), g = by[k]; if (!g) { g = by[k] = { name: nm, rows: [], n: 0, on: 0, all: false }; out.push(g); } g.rows.push(r); g.n++; if (r.keptOn !== 1 && rowOn(spec, r)) g.on++; });
    out.forEach(function(g) { g.all = g.n > 0 && g.on === g.n; });
    return out;
}
// A placement's categories in the players' view (cleanSystem), by the test a list's own categories are judged by (ok): a category only
// GM-only things carry never travels. A placement left with none goes, its rows then standing in the list's home placement as for any
// category no placement names; where every placement of a list is left with none, its first stays, with no categories, and shows every row
function placeCatsSeen(lay, ok, wait) {   // wait (191): the library is not read yet, so a category that does not judge as seen may still be one: such a list's places wait, each marked, with no category, until it is
    if (!isObj(lay) || !Array.isArray(lay.sections) || typeof ok !== 'function') return;
    var by = map();
    lay.sections.forEach(function(s) { (isObj(s) && Array.isArray(s.fields) ? s.fields : []).forEach(function(p) { if (isObj(p) && typeof p.id === 'string' && Array.isArray(p.cats)) (by[p.id] = by[p.id] || []).push({ s: s, p: p }); }); });
    Object.keys(by).forEach(function(id) {
        var ps = by[id], left = 0;
        if (wait === true && ps.some(function(x) { return x.p.cats.some(function(c) { return !(typeof c === 'string' && ok(c, id)); }); })) { ps.forEach(function(x) { delete x.p.cats; x.p.wait = true; }); return; }
        ps.forEach(function(x) { x.p.cats = x.p.cats.filter(function(c) { return typeof c === 'string' && ok(c, id); }); if (x.p.cats.length) left++; });   // id (1.6.0 R13): the list, so one placed by a stat keeps its value names
        ps.forEach(function(x, i) { if (x.p.cats.length) return; if (!left && i === 0) delete x.p.cats; else x.s.fields.splice(x.s.fields.indexOf(x.p), 1); });
    });
}
// [systemcheck:placecats-end]
// A layout's sections. ctx: { fieldIds, rollIds, pages (null: format only), tabIds, groupIds, hudTabs } — the tabs and groups of THIS layout;
// hudTabs (HF2b): the HUD's tab ids when a HUD button may point at it (the sheet's own layout, with a HUD that survived), else null (the HUD's
// own layout, or no HUD in this view: the button is dropped)
function cleanSections(list, ctx) {
    var out = [], placed = map(), total = 0, fieldIds = ctx.fieldIds, rollIds = ctx.rollIds, pages = ctx.pages, tabIds = ctx.tabIds, groupIds = ctx.groupIds;
    var catOk = catSplits(list, fieldIds), catNamed = map();   // 1.5.5: the item lists that may stand in several placements, and the categories their kept placements name
    for (var i = 0; i < list.length && out.length < LIMITS.sections; i++) {
        var s = list[i];
        if (!isObj(s) || typeof s.id !== 'string' || !SECTION_ID.test(s.id)) continue;
        var cols = Math.max(1, Math.min(LIMITS.cols, cleanNum(s.cols, 1) | 0));
        var sec = { id: s.id, title: str(s.title, LIMITS.label).replace(CTRL_RE_G, ' ').trim(), cols: cols, fields: [] };
        if (typeof s.tab === 'string' && tabIds[s.tab]) sec.tab = s.tab;   // keep only a tab ref that exists (in this layout)
        if (s.collapsible) sec.collapsible = true;                          // Stage 2: a collapsible <details> section
        if (validPageId(s.chip) && (!pages || pages[s.chip] === 1)) sec.chip = s.chip;   // Stage 5f: a handbook chip in the header (a page the players' view can open)
        if (s.pinned) sec.pinned = true;                                    // Stage 5d: a dashboard section — stays above the tab strip on every tab
        if (s.open === false && sec.collapsible) sec.open = false;          // default open; store only an explicit "closed by default" (1.5.5: Starts closed), only on a collapsible section: a fixed one is always open
        if (typeof s.meta === 'string' && fieldIds[s.meta]) sec.meta = s.meta;   // a field whose value shows in the section header (e.g. a points total)
        if (typeof s.parent === 'string' && SECTION_ID.test(s.parent) && s.parent !== s.id) sec.parent = s.parent;   // nest under another section (the render enforces one level)
        if (sec.parent && s.first === true) sec.first = true;   // 1.5.5: a sub-section set Before its fields stands before its parent's own fields (true only, only beside a parent)
        var secStyle = cleanSecStyle(s.style); if (secStyle) sec.style = secStyle;   // Stage 3: per-section colors (accent/bg/border)
        var secIcon = cleanIcon(s.icon); if (secIcon) sec.icon = secIcon;   // Stage 5g: an icon before the title
        if (typeof s.pin === 'string' && groupIds[s.pin] === 1) sec.pin = s.pin;   // Stage 6 look fold: a band group's Pin in the header
        var sif = cleanFormulaText(s.showIf); if (sif) sec.showIf = sif;   // Stage 6 HUD C8: shown only while this formula is true
        if (s.inline === true) sec.inline = true;   // HUD frame (HF4a, H2): each field on one line (label and value, its Roll on the right)
        var exSc = cleanExplain(s.explain); if (exSc) sec.explain = exSc;   // 1.6.2 (backlog 218 fold 3): what it means, behind an (i) in its title
        var hnt = cutText(s.hint, LIMITS.hint); if (hnt) sec.hint = hnt;   // 1.6.2 (backlog 218 fold 4): a first-use hint, one line under its title (the same in both views)
        if (s.beside === true) sec.beside = true;   // 1.6.2, backlog 171 (b): stands on the row of the section drawn before it (true only)
        if (s.resetAll === true) { sec.resetAll = true; var rtx = cutText(s.resetText, LIMITS.label); if (rtx) sec.resetText = rtx; }   // HUD frame (HF4b, H13): a Reset all button in the header (its own words, e.g. Long rest)
        (Array.isArray(s.fields) ? s.fields : []).forEach(function(p) {
            if (!isObj(p) || total >= LIMITS.placements) return;
            var w = p.w === 'row' ? 'row' : 1, item = null;
            var pcs = typeof p.id === 'string' && catOk[p.id] === 1 ? cleanPlaceCats(p.cats) : null, again = (!!pcs && placed[p.id] === 1 && pcs.every(function(x) { return !(catNamed[p.id] && catNamed[p.id][lower(x)]); })) || (p.wait === true && !pcs && placed[p.id] === 1 && fieldIds[p.id] === 'item-list');   // 1.5.5: a list placed again, for categories no earlier placement of it names
            if (typeof p.id === 'string' && fieldIds[p.id] && (!placed[p.id] || again)) {
                placed[p.id] = 1; item = { id: p.id, w: w }; if (p.on === true && fieldIds[p.id] === 'item-list') item.on = true;   // on (F4b): only the rows switched on (the HUD's readied weapons)
                if (pcs) { item.cats = pcs; var cnm = catNamed[p.id] || (catNamed[p.id] = map()); pcs.forEach(function(x) { cnm[lower(x)] = 1; }); }   // 1.5.5: the categories this placement shows
                if (p.count === true && fieldIds[p.id] === 'item-list') item.count = true;   // 1.6.0, backlog 180 R9: its rows counted in its section's title
                if ((p.show === 'tiles' || p.show === 'tiles+' || p.show === 'list+') && fieldIds[p.id] === 'item-list') item.show = p.show;   // 1.6.2 (body fold 3): Shows as: tiles, or both with a switch, one first
                if (fieldIds[p.id] === 'item-list') { var emT = cutText(p.empty, LIMITS.label); if (emT) item.empty = emT; if (p.wait === true) item.wait = true; }   // 191: the words it shows with no row (none: No items.); wait, a players' view made before the library's categories could be judged
            }
            else if (typeof p.roll === 'string' && rollIds[p.roll]) item = { roll: p.roll, w: w };
            else if (typeof p.kind === 'string' && LAYOUT[p.kind]) {
                item = { kind: p.kind, w: w }; if (p.kind === 'heading') item.text = str(p.text, LIMITS.label).replace(CTRL_RE_G, ' ').trim();
                if (p.kind === 'roller') { var rlt = cutText(p.text, LIMITS.label), rlf = cleanFormulaText(p.formula); if (rlt) item.text = rlt; if (rlf) item.formula = rlf; }   // Stage 6 HUD H9: its name on the card and the formula it starts with (both optional)
                if (p.kind === 'text') item.text = str(p.text, LIMITS.ruleText).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ');   // Stage 6 HUD H11: rules text — plain, line breaks and tabs kept (drawn as text)
                if (p.kind === 'link') {   // Stage 5f: a handbook link — its own label (blank = the page's title when drawn) and the page; a link with no page yet is kept for the GM (nothing set is lost on Save), dropped from the players' view
                    item.text = str(p.text, LIMITS.label).replace(CTRL_RE_G, ' ').trim();
                    item.page = validPageId(p.page) ? p.page : '';
                    if (pages && pages[item.page] !== 1) item = null;
                }
                if (p.kind === 'pin') {   // Stage 6 look fold: a band group's Pin button — only for a group that exists (in this view); its own label is optional
                    if (typeof p.g === 'string' && groupIds[p.g] === 1) { item.g = p.g; var ptx = cutText(p.text, LIMITS.label); if (ptx) item.text = ptx; }
                    else item = null;
                }
                if (p.kind === 'hud') {   // HUD frame (HF2b): a button that opens this character's HUD, at one of its tabs (the reference's in-sheet HUD buttons)
                    if (!ctx.hudTabs) item = null;
                    else { var htx = cutText(p.text, LIMITS.label); if (htx) item.text = htx; if (typeof p.tab === 'string' && ctx.hudTabs[p.tab] === 1) item.tab = p.tab; }
                }
            }
            if (item && p.gm === true && ctx.gmView === false) item = null;   // 1.6.0 (the owner, 2026-10-31: "Keep them for the GM"): a placement ticked GM: on the GM's sheet alone. Only the place goes from the players' view: a roll a card asks for is still theirs
            if (item) { var pif = cleanFormulaText(p.showIf); if (pif) item.showIf = pif; if (p.gm === true) item.gm = true; sec.fields.push(item); total++; }   // C8: a placement's own show-if
        });
        out.push(sec);
    }
    return out;
}
// Stage 6 HUD frame (HF1): the HUD — a second layout of the same sheet ({ title?, tabs, sections, band?, ledger? }; no identity rows: its
// head carries the portrait and the name). The GM view keeps a HUD with anything set (nothing is lost on Save); the players' view keeps it
// only while something in it is theirs to see (the GM's title never travels alone). { hud } or null.
function cleanHud(h, hb, fieldIds, rollIds, pages, groupIds, gmView) {
    var tabs = cleanTabs(h.tabs), out = {}, title = cutText(h.title, LIMITS.label);
    if (title) out.title = title;
    out.tabs = tabs.list;
    out.sections = Array.isArray(h.sections) ? cleanSections(h.sections, { fieldIds: fieldIds, rollIds: rollIds, pages: pages, tabIds: tabs.ids, groupIds: groupIds, gmView: gmView }) : [];
    if (hb) out.band = hb;
    var ledger = idList(h.ledger, LEDGER_KINDS, LIMITS.ledger, fieldIds); if (ledger) out.ledger = ledger;
    var shown = !!(hb || ledger || out.sections.some(function(x) { return x.fields.length > 0; }));
    var kept = gmView === false ? shown : !!(shown || title || out.tabs.length || out.sections.length);
    return kept ? { hud: out, tabIds: tabs.ids } : null;   // tabIds (HF2b): what the sheet's HUD buttons may point at
}
function cleanSheet(sheet, fieldIds, rollIds, pages, gmView) {   // pages: null (format only) or a prototype-free set of the page ids players may see (Stage 5f); gmView false: the players' view
    var out = { tabs: [], sections: [] };
    if (!isObj(sheet)) return out;
    var groups = cleanBandGroups(sheet.bandGroups);   // Stage 6 look fold: before the band and the sections that name them
    var tabs = cleanTabs(sheet.tabs); out.tabs = tabs.list;
    var band = cleanBand(sheet.band, fieldIds, rollIds, groups.ids); if (band) out.band = band;
    var hs = isObj(sheet.hud) ? sheet.hud : null, hb = hs ? cleanBand(hs.band, fieldIds, rollIds, groups.ids) : null;   // HUD frame HF1: the HUD's own band
    if (gmView === false) groups = pruneGroups(groups, [out.band, hb]);   // Stage 6: the players' view keeps only groups with a visible entry, on either band (the GM keeps an empty one: nothing set is lost on Save)
    if (groups.list.length) out.bandGroups = groups.list;
    var identity = idList(sheet.identity, IDENTITY_KINDS, LIMITS.identity, fieldIds); if (identity) out.identity = identity;
    var ledger = idList(sheet.ledger, LEDGER_KINDS, LIMITS.ledger, fieldIds); if (ledger) out.ledger = ledger;
    var look = cleanLook(sheet.look); if (look) out.look = look;   // Stage 5g: the sheet's shape (shared by the sheet and its HUD)
    if (sheet.notes === false) out.notes = false;   // 1.6.4 (Fulllion, 2026-11-23: the Notes page "optional in the system builder", "On everywhere" by default): kept only as off, in both views, so a system that never set it has the page (qnotecore.js reads it)
    var hc = hs ? cleanHud(hs, hb, fieldIds, rollIds, pages, groups.ids, gmView) : null;   // HF2b: before the sheet's sections, whose HUD buttons need to know the HUD survived (and its tabs)
    if (Array.isArray(sheet.sections)) out.sections = cleanSections(sheet.sections, { fieldIds: fieldIds, rollIds: rollIds, pages: pages, tabIds: tabs.ids, groupIds: groups.ids, hudTabs: hc ? hc.tabIds : null, gmView: gmView });
    if (hc) out.hud = hc.hud;   // HF1: the last key, absent when dropped
    return out;
}
// The system as stored, or as a player receives it (gmView false: GM-only fields and rolls gone, formulas that named them nulled)
// 1.6.3 (the improvement week's review of the System editor, finding 3): one run of cleanSystem judges hundreds of formulas against the
// same system, so it runs inside a derivedScope (systemcore.js), which keeps the GM-only name graph and the fields as the GM's view
// cleans them for the length of this one run. Nothing is kept past it, so a draft changed between two runs is read afresh each time.
function cleanSystem(sys, opts) { return derivedScope(function() { return cleanSystemNow(sys, opts); }); }
function cleanSystemNow(sys, opts) {
    opts = opts || {}; var F = opts.F, gmView = opts.gmView !== false;
    if (!isObj(sys) || !F) return null;
    var out = emptySystem();
    out.name = str(sys.name, LIMITS.name).replace(CTRL_RE_G, ' ').trim();
    out.preset = /^[a-z0-9_-]{1,20}$/.test(String(sys.preset || '')) ? String(sys.preset) : '';
    var abt = cleanAbout(sys.about); if (abt) out.about = abt;   // 1.6.4: the system's About text, the same in both views, absent where it says nothing
    if (gmView && typeof sys.mark === 'string' && READER_MARK.test(sys.mark)) out.mark = sys.mark;   // 1.6.0: a plain word a GM's own sheet reader knows this system by; the GM's, and never code
    out.updated = fin(Number(sys.updated)) && Number(sys.updated) >= 0 ? Number(sys.updated) : 0;
    var gmStK = gmView ? null : gmStatKeys(sys);   // 1.6.0: the GM-only stats, gone from every list of the players' view
    var seenId = map(), seenKey = map(), dropped = [], gmFields = [], droppedList = map();   // droppedList (F5a1): the GM-only item lists' keys   // gmFields: the GM-only fields as the GM has them (the players' view only), for gmPools
    (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (out.fields.length >= LIMITS.fields) return;
        var c = cleanField(gmStK ? gmStatsOut(f, gmStK) : f, F, gmView);
        if (!c) { if (isObj(f) && typeof f.key === 'string' && f.vis === 'gm' && !gmView) { dropped.push(lower(f.key)); if (f.kind === 'item-list') droppedList[lower(f.key)] = 1; var g = cleanField(f, F, true); if (g) gmFields.push(g); } return; }
        if (seenId[c.id] || seenKey[lower(c.key)]) return;
        seenId[c.id] = 1; seenKey[lower(c.key)] = 1; out.fields.push(c);
    });
    var tstS = cleanTests(sys.tests); if (tstS) out.tests = tstS;   // 1.6.2 (backlog 59): the system's tests, and the roll of each field that picks one, written here so every reader of a field's roll reads it
    out.fields.forEach(function(f) { if (typeof f.test !== 'string') return; var tt = tstS ? tstS.filter(function(x) { return x.key === f.test; })[0] : null, tf = tt ? testFormula(tt, f.key) : ''; if (tf) { f.roll = tf; delete f.rollDie; } else delete f.test; });
    out.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.rolls)) return; f.list.rolls.forEach(function(r) { if (!isObj(r) || typeof r.test !== 'string') return; var tt = tstS ? tstS.filter(function(x) { return x.key === r.test; })[0] : null, tf = tt ? testFormula(tt, 'Row.' + r.of) : ''; if (tf) r.formula = tf; else { delete r.test; delete r.of; } }); });   // ... and a list's roll that picks one, with a figure of its row
    var gmEnt = (Array.isArray(sys.items) ? sys.items : []).concat(Array.isArray(sys.core) ? sys.core : []).some(function(it) { return isObj(it) && it.vis === 'gm'; });   // owed review leftover (b): a GM-only entry a pool's max reads is a secret too
    var gmTbl = Array.isArray(sys.tables) && sys.tables.some(function(t) { return isObj(t) && t.vis === 'gm'; });   // 1.6.0: a GM-only table a pool's max reads is a secret too
    if (!gmView && (gmFields.length || gmEnt || gmTbl) && out.fields.some(function(f) { return f.kind === 'resource' && !!f.maxFormula; })) {   // a pool whose max is GM-only is GM-only as a whole: gone, as a GM-only field is (the GM-only fields last: one wins a key both use)
        var gmP = gmPools({ fields: out.fields.concat(gmFields), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects }, F);
        out.fields = out.fields.filter(function(f) { if (gmP[f.id] !== 1) return true; dropped.push(lower(f.key)); return false; });
    }
    var ldLv = map(); out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.lvl)) ldLv[f.id] = 1; });   // 1.5.8 Loads from: another item list of this view, with a level (the players' view: a GM-only list is not there, so its load goes)
    out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.load) && (f.list.load.from === f.id || ldLv[f.list.load.from] !== 1)) delete f.list.load; });
    out.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.feeds)) return; f.list.feeds = f.list.feeds.filter(function(x) { return x.from !== f.id && ldLv[x.from] === 1; }); if (!f.list.feeds.length) delete f.list.feeds; });   // 1.6.0 Feeds: each loads from another list of this view with a level, as a load does
    var chIl = map(); out.fields.forEach(function(f) { if (f.kind === 'item-list') chIl[f.id] = 1; });   // 1.5.9 Chambers from: an item list of this view, this very list too (the players' view: a GM-only list is not there, so its chamber goes)
    out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.chamber) && chIl[f.list.chamber.from] !== 1) delete f.list.chamber; });
    out.fields.forEach(function(f) {   // 1.6.2: the lists of this view among them; the first one left is from, and none left, no parts
        if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.parts)) return;
        var kpF = partsFrom(f.list.parts).filter(function(id) { return chIl[id] === 1; }); if (!kpF.length) { delete f.list.parts; return; }
        if (kpF[0] !== f.list.parts.from) { f.list.parts.from = kpF[0]; if (f.list.parts.deep === true && kpF[0] !== f.id) delete f.list.parts.deep; }
        if (kpF.length > 1) f.list.parts.also = kpF.slice(1); else delete f.list.parts.also;
    });
    out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.stand) && (chIl[f.list.stand.from] !== 1 || f.list.stand.from === f.id)) delete f.list.stand; });
    out.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.sheets) || typeof f.list.sheets.on !== 'string') return; var tgS = out.fields.filter(function(g) { return g.id === f.list.sheets.on; })[0]; if (!tgS || tgS.kind !== 'toggle') delete f.list.sheets.on; });   // 1.6.2 (vehicles, fold (a)): a new sheet's toggle, a toggle of the view   // 1.6.2 (body fold 2): the tiles are another list of this view
    out.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.stand) || typeof f.list.stand.box !== 'string') return; var tfB = out.fields.filter(function(g) { return g.id === f.list.stand.from; })[0], bxs = tfB && isObj(tfB.list) && isObj(tfB.list.tiles) && Array.isArray(tfB.list.tiles.boxes) ? tfB.list.tiles.boxes : []; if (!bxs.some(function(b) { return b.key === f.list.stand.box; })) delete f.list.stand.box; });   // 1.6.2 (body fold 4): a box its tiles offer
    out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.at) && (chIl[f.list.at.from] !== 1 || f.list.at.from === f.id)) delete f.list.at; });   // 1.6.0 Stands at: a list of this view (the players' view: a GM-only list is not there, so its at goes)
    out.fields.forEach(function(f) {   // the core handbook session's ask 4 (2026-10-29): a cap line by a part's own choice stat names a choice stat of the parts' list (a pick, or a number with value names) and one of its values, each spelled as that list spells it; a line that names neither goes
        if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.parts) || !Array.isArray(f.list.parts.caps)) return;
        var srcIds = partsFrom(f.list.parts), sstC = []; srcIds.forEach(function(id) { out.fields.forEach(function(x) { if (x.id === id && x.kind === 'item-list' && isObj(x.list) && Array.isArray(x.list.stats)) sstC = sstC.concat(x.list.stats); }); });   // 1.6.2: a stat of any list the parts come from, the first that has it
        var keptC = f.list.parts.caps.filter(function(k) {
            if (typeof k.slot !== 'string') return true;
            // 1.6.3 (found in play, 2026-11-22: a weapon's crystal slots lost at a load): the parts may come from several lists, each with its
            // own stat of that key, and a value may be named by only one of them (a crystal slot named on the parts list, not on the weapon
            // list itself). So every such stat counts, in the order of the sources, each value spelled by the first that names it; only a
            // value no source names goes. The rule at play reads each part by its own list's stat, so such a value still works
            var sts = sstC.filter(function(s) { return isObj(s) && typeof s.key === 'string' && lower(s.key) === lower(k.slot) && s.set !== true; }), st = sts[0]; if (!st) return false;
            var nms = [], spelt = []; sts.forEach(function(s2) { nms = nms.concat(s2.kind === 'pick' ? (Array.isArray(s2.opts) ? s2.opts.map(function(o) { return isObj(o) ? o.label : ''; }) : []) : (Array.isArray(s2.labels) ? s2.labels : [])); });
            capIsList(k).forEach(function(w) { var nm = null; nms.forEach(function(n) { if (nm === null && typeof n === 'string' && n && lower(n) === lower(w)) nm = n; }); if (nm !== null && spelt.indexOf(nm) < 0) spelt.push(nm); }); if (!spelt.length) return false;
            k.slot = st.key; k.is = spelt.length === 1 ? spelt[0] : spelt; return true;
        });
        if (keptC.length) f.list.parts.caps = keptC; else delete f.list.parts.caps;
    });
    var ormF = map(); out.fields.forEach(function(f) { if (APPLY_KINDS[f.kind] === 1) ormF[f.id] = 1; }); out.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.onRemove)) return; var ormL = f.list.onRemove.filter(function(c) { return ormF[c.f] === 1; }); if (ormL.length) f.list.onRemove = ormL; else delete f.list.onRemove; });
    out.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list)) return; ['switchOn', 'switchOff'].forEach(function(k) { if (!Array.isArray(f.list[k])) return; var swL = f.list[k].filter(function(c) { return ormF[c.f] === 1; }); if (swL.length) f.list[k] = swL; else delete f.list[k]; }); });   // 1.6.2 (167 B): the same for a switch's changes   // 1.6.0: a change moves a pool, a number or a toggle of this view
    var upRs = map(); out.fields.forEach(function(f) { if (f.kind === 'resource') upRs[f.id] = 1; }); out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.upkeep) && upRs[f.list.upkeep.pool] !== 1) delete f.list.upkeep; });   // 1.6.0 (CORE gap 13): an upkeep comes off a pool of this view   // 1.6.0 R14: parts from an item list of this view, this very list too
    // 1.6.4 Buy off: the cost is charged to a number field of this view, or the list cannot be bought off here. A ledger list that is not an item
    // list of this view, or is this very list, is dropped and the charge still stands; so is a figure's stat the ledger list does not hold as a
    // number (a GM-only stat is not in the players' view), spelled as that list spells it
    var boN = map(), boL = map(); out.fields.forEach(function(f) { if (f.kind === 'number') boN[f.id] = 1; else if (f.kind === 'item-list') boL[f.id] = f; });
    out.fields.forEach(function(f) {
        var bo = f.kind === 'item-list' && isObj(f.list) && isObj(f.list.buyOff) ? f.list.buyOff : null; if (!bo) return;
        if (boN[bo.f] !== 1) { delete f.list.buyOff; return; }
        if (!isObj(bo.ledger)) return; var lf = boL[bo.ledger.to]; if (!lf || lf.id === f.id) { delete bo.ledger; return; }
        if (typeof bo.ledger.by === 'string') { var bs = (isObj(lf.list) && Array.isArray(lf.list.stats) ? lf.list.stats : []).filter(function(s) { return isObj(s) && s.kind !== 'pick' && s.set !== true && typeof s.key === 'string' && lower(s.key) === lower(bo.ledger.by); })[0]; if (bs) bo.ledger.by = bs.key; else delete bo.ledger.by; }
    });
    if (gmView) oneSpelling(out.fields);   // Stage 6 F4c1 (critic 2): one spelling per stat key, the first list's in field order
    if (gmStK) out.fields.forEach(function(f) { if (!isObj(f.list)) return; [f.list.load, f.list.chamber].concat(Array.isArray(f.list.feeds) ? f.list.feeds : []).forEach(function(x) { if (isObj(x) && typeof x.to === 'string' && gmStK[lower(x.to)] === 1) { delete x.by; delete x.to; } }); });   // 1.6.0: a match to a GM-only stat of the list it loads from
    var seenR = map();
    (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (out.rolls.length >= LIMITS.rolls) return; var c = cleanRollDef(r, gmView); if (!c || seenR[c.id]) return; seenR[c.id] = 1; out.rolls.push(c); });
    // 1.6.3 (defense fold 2): Answered with a row of names an item list of this view. In the GM's view a list that is gone takes the pick off. In a players' view a
    // roll answered with a row of a list they do not see goes whole, since its names read that list's rows; the host then sends its defense card to the GM
    var wlS = map(); out.fields.forEach(function(f) { if (f.kind === 'item-list') wlS[f.id] = 1; });
    if (gmView) out.rolls.forEach(function(r) { if (typeof r.withRow === 'string' && wlS[r.withRow] !== 1) delete r.withRow; }); else out.rolls = out.rolls.filter(function(r) { return typeof r.withRow !== 'string' || wlS[r.withRow] === 1; });
    // The review of that fold (finding 3): a roll answered with a row is made only from a defense card, with a row, so nothing that runs it by itself with no
    // row stays beside it: its reminder each turn or round, By the clock and In a fight (with Ask me first and where its runs are said), and When a value
    // crosses a step. The System editor says what Save drops of them (sheets.js withRowDrops). A system with no such roll is not touched
    out.rolls.forEach(function(r) { if (typeof r.withRow === 'string') WITH_ROW_DROPS.forEach(function(k) { delete r[k]; }); });
    var gmKeys = gmView ? map() : gmEntryKeys(sys, out.fields), hasGmKeys = Object.keys(gmKeys).length > 0;   // F5a1: per visible list, the keys of the GM-only entries in its scope
    var hasPicks = out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.stats) && f.list.stats.some(function(x) { return x.kind === 'pick'; }); });   // F5a2
    var tbS = gmView ? null : { fields: Array.isArray(sys.fields) ? sys.fields : [], links: cleanLinks(sys.links, F) || [], tables: cleanTables(sys.tables, true) || [], values: cleanValues(sys.values, true), decks: cleanDecks(sys.decks, true, /^D[0-9]+$/), effects: Array.isArray(sys.effects) ? sys.effects : [] }, tbLive = !!tbS && tableFam(tbS), tbGm = tbLive && (tbS.tables.some(function(t) { return t.vis === 'gm'; }) || tbS.values.some(function(t) { return t.vis === 'gm'; }) || tbS.decks.some(function(t) { return t.vis === 'gm'; }) || tbS.effects.some(function(t) { return isObj(t) && t.vis === 'gm'; }));   // 1.6.2: and a GM-only effect, which Fx.<effect> reads   // 1.6.0: a formula that reads a GM-only table is blanked as one that reads a GM-only field is
    if (!gmView && (dropped.length || hasGmKeys || hasPicks || tbGm || gmStK)) {   // a visible formula that named a GM-only key is blanked: the player sees "GM only", never the name
        var isDropped = map(); dropped.forEach(function(k) { isDropped[k] = 1; });
        var atGm = map(); (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (!isObj(f) || f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.at) || typeof f.list.at.by !== 'string') return; (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(g) { if (isObj(g) && g.id === f.list.at.from && typeof g.key === 'string' && droppedList[lower(g.key)] === 1) atGm[lower(f.list.at.by)] = 1; }); });   // 1.6.0 Stands at: Row.<by>.<w> is the other list's name, GM only where that list is
        var ixM = keyIndex(sys), standGm = (Array.isArray(sys.fields) ? sys.fields : []).some(function(f) { if (!isObj(f) || f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.stand)) return false; var tf = sys.fields.filter(function(g) { return isObj(g) && g.id === f.list.stand.from; })[0]; return !!tf && droppedList[lower(tf.key)] === 1; });   // 1.6.2 (body fold 2): At.* and Tile.* read a GM-only list of tiles
        var mentions = function(text) {
            if (!text) return false;
            var hit = function(n) { var l = lower(n); var sgA = l.split('.'); if (sgA.length === 3 && sgA[0] === 'row' && atGm[sgA[1]] === 1) return true; if ((sgA[0] === 'at' || sgA[0] === 'tile') && sgA.length === 2 && standGm && !ixM.at) return true; if (sgA[0] === 'here' && sgA.length >= 3 && droppedList[sgA[1]] === 1) return true; if (l.length > 3 && l.indexOf('on.') === 0) l = l.slice(3); l = lower(linkBare(sys, null, l)); if (tbLive) { var tbH = tableRead(tbS, l); if (tbH) { if (tbH.gm) return true; if (!tbH.by) return false; l = tbH.by; } } if (gmStK && gmStatRead(gmStK, ixM, l)) return true; var dot = l.lastIndexOf('.'); if (isDropped[l]) return true; var sg = l.split('.'); if (sg.length > 1 && (droppedList[sg[0]] === 1 || (sg.length > 2 && gmKeys[sg[0]] && gmKeys[sg[0]][sg[1]] === 1))) return true; return dot > 0 && NAME_SUFFIX[l.slice(dot + 1)] && isDropped[l.slice(0, dot)]; };   // F5a1: a GM-only list by its first segment, L.<a GM-only entry's key> (critic 5)
            if (F.parse(text).ok) return figExpand(sys, F.names(text)).some(hit);   // the core handbook session's ask 6: a group's figure by what its formula reads
            return (String(text).match(/[A-Za-z_][A-Za-z0-9_.]*/g) || []).some(function(t) { return hit(t) || hit(t.split('.')[0]); });   // Stage 6: text that does not parse is checked word by word — a typo never carries a GM-only name to players
        };
        var showMention = mentions;   // Stage 6 HUD C8: the sheet's show-ifs are checked once the sheet is cleaned (below)
        var capMentions = function(t) { return String(t).split('{').slice(1).some(function(p) { return mentions(capExpr(p.split('}')[0]).expr); }); };   // Stage 6: after every "{" (closed or not, drawn or not), the ± stripped   // Fold B: a caption's {formula} is formula text too
        out.fields.forEach(function(f) { if (typeof f.auto === 'string' && mentions(f.auto)) f.auto = null; if (Array.isArray(f.fills)) { var kfP = f.fills.filter(function(x) { return !mentions(x.formula); }); if (kfP.length) f.fills = kfP; else delete f.fills; } });   // 1.6.2 (auto apply): a worked-out figure read from a GM-only value reads GM only, and such a fill goes
        out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.buyOff) && mentions(f.list.buyOff.cost)) delete f.list.buyOff; });   // 1.6.4 Buy off: a cost that reads a GM-only value goes from the players' view whole (the figure they are asked would tell it); the GM still buys rows off
        out.fields.forEach(function(f) { if (isObj(f.lock) && mentions(f.lock['if'])) delete f.lock; });   // 1.6.3 (backlog 170): a lock whose test reads a GM-only value goes from the players' view, so players are not held by it
        out.fields.forEach(function(f) { if (f.kind === 'number' && isObj(f.override) && (mentions(f.override.when) || mentions(f.override.value))) f.override = null; if (isObj(f.track) && f.track.of && mentions(f.track.of)) delete f.track.of; });   // 1.6.2: a track's Out of that reads a GM-only value goes from the players' view (it would count it out)   // 205 (6): a number taken from a GM-only value reads "GM only"
        out.fields.forEach(function(f) { var p = DEF_PROP[f.kind]; if (p && f[p] && mentions(f[p])) f[p] = null; if (f.roll && mentions(f.roll)) delete f.roll; if (f.caption && capMentions(f.caption)) { delete f.caption; delete f.capAt; } if (f.list && Array.isArray(f.list.cols)) f.list.cols.forEach(function(c) { if (c.formula && mentions(c.formula)) c.formula = null; }); if (f.list && Array.isArray(f.list.stats)) f.list.stats.forEach(function(x) { if (x.kind !== 'pick') return; x.opts = x.opts.filter(function(o) { return !mentions(o.name); }); if (x.def && !x.opts.some(function(o) { return lower(o.label) === lower(x.def); })) delete x.def; }); if (f.list && Array.isArray(f.list.counters)) f.list.counters.forEach(function(t) { if (t.max && mentions(t.max)) t.max = null; }); if (f.list && Array.isArray(f.list.rolls)) { f.list.rolls = f.list.rolls.filter(function(r) { return r.apply ? !r.apply.some(function(c) { return mentions(c.formula); }) : !mentions(r.formula); }); if (!f.list.rolls.length) delete f.list.rolls; } });   // F5b: a list roll naming a GM-only value is dropped   // F5a2: a choice's option naming a GM-only value is dropped (critic 3: never a blanked one)   // F5a1: a list column too (it reads "GM only")
        out.fields.forEach(function(f) { if (f.list && Array.isArray(f.list.rolls)) f.list.rolls.forEach(function(r) { if (r.job && mentions(r.job.turns)) delete r.job; if (r.then && r.then.some(function(c) { return mentions(c.formula) || mentions(c.n) || mentions(c.money) || mentions(c.if); })) thenGmCut(r, function(c) { return mentions(c.formula) || mentions(c.n) || mentions(c.money) || mentions(c.if); }); if (r.needs && mentions(r.needs)) { delete r.needs; delete r.needsText; if (!Array.isArray(r.needsWhy)) delete r.hideOff; } whyGmCut(r, mentions); if (r.malf && mentions(r.malf)) { delete r.malf; r.named = true; } if (r.ad && mentions(r.ad)) delete r.ad; if (r.showIf && mentions(r.showIf)) delete r.showIf; if (r.alt) { r.alt = r.alt.filter(function(a) { return !mentions(a.if); }); if (!r.alt.length) delete r.alt; } }); if (f.list && Array.isArray(f.list.counters)) f.list.counters.forEach(function(t) { if (t.alt) { t.alt = t.alt.filter(function(a) { return !mentions(a.if); }); if (!t.alt.length) delete t.alt; } }); if (f.list && Array.isArray(f.list.badges)) { f.list.badges = f.list.badges.filter(function(b) { return !mentions(b.if); }); if (!f.list.badges.length) delete f.list.badges; } });   // 1.6.0 R4: a badge too   // 1.6.0: another name chosen by a GM-only value would tell it
        out.fields.forEach(function(f) { if (f.list && isObj(f.list.on) && f.list.on.needs && mentions(f.list.on.needs)) { delete f.list.on.needs; delete f.list.on.needsText; } if (f.list && isObj(f.list.on) && f.list.on.showIf && mentions(f.list.on.showIf)) delete f.list.on.showIf; });
        out.fields.forEach(function(f) { if (f.list && typeof f.list.unheld === 'string' && mentions(f.list.unheld)) delete f.list.unheld; });   // 1.6.0 Rolls unheld entries: an Unheld level read from a GM-only value goes, and players then roll no entry unheld there
        out.fields.forEach(function(f) { if (f.list && isObj(f.list.chamber) && f.list.chamber.needs && mentions(f.list.chamber.needs)) { delete f.list.chamber.needs; delete f.list.chamber.needsText; } });   // 1.5.9 Chambers only where, as Loads only where
        out.fields.forEach(function(f) { if (f.list && isObj(f.list.chamber) && f.list.chamber.reach && mentions(f.list.chamber.reach)) delete f.list.chamber.reach; });   // 1.5.9 (es) Flies at most, alike: only the host flies a round
        out.fields.forEach(function(f) { if (f.list && Array.isArray(f.list.feeds)) f.list.feeds.forEach(function(x) { if (x.turns && mentions(x.turns)) delete x.turns; }); });   // 1.6.0 Feeds: the turns a change takes, alike
        out.fields.forEach(function(f) { ['load', 'chamber'].forEach(function(k) { if (f.list && isObj(f.list[k]) && f.list[k].takeIf && mentions(f.list[k].takeIf)) delete f.list[k].takeIf; }); });   // 1.6.2 Takes rows where, alike
        out.fields.forEach(function(f) { if (f.list && isObj(f.list.load) && f.list.load.needs && mentions(f.list.load.needs)) { delete f.list.load.needs; delete f.list.load.needsText; } });   // 1.5.8 Loads only where, alike   // 1.5.8: a switch's needs naming a GM-only value go, as a list roll's (players' switches are then not held back by them)   // R2b: a list roll's consequences, or its needs, naming a GM-only value go (players' rolls then change nothing / are not held back)
        out.rolls = out.rolls.filter(function(r) { return r.apply ? !r.apply.some(function(c) { return mentions(c.formula) || mentions(c.by); }) : !mentions(r.formula); });   // H7: an apply action naming a GM-only value goes whole
        out.rolls.forEach(function(r) { if (r.then && r.then.some(function(c) { return mentions(c.formula) || mentions(c.by); })) thenGmCut(r, function(c) { return mentions(c.formula) || mentions(c.by); }); if (r.malf && mentions(r.malf)) { delete r.malf; r.named = true; } if (r.needs && mentions(r.needs)) { delete r.needs; delete r.needsText; if (!Array.isArray(r.needsWhy)) { delete r.hideOff; if (r.every) delete r.every.whileNeeds; if (r.inFight) delete r.inFight.whileNeeds; } } whyGmCut(r, mentions); });   // 1.5.4: its needs naming one go, as a list roll's (players' presses are then not held back by them); 1.5.5: and Only while its needs hold with them   // R3: a Malf naming one too   // R1: a consequence naming a GM-only value takes them all (players' rolls then change nothing)
        var critGo = function(r) { if (r.critAt && mentions(r.critAt)) { delete r.critAt; r.named = true; } if (r.fumbleAt && mentions(r.fumbleAt)) { delete r.fumbleAt; r.named = true; } if (r.bigAt && mentions(r.bigAt)) delete r.bigAt; };   // 1.6.0: a roll's own critical range naming a GM-only value goes, as its Malf does (their rolls then read the Combat tab's). Either keeps the roll named, so the host still finds the entry whose figure it works out alone
        out.rolls.forEach(critGo); out.fields.forEach(function(f) { if (f.list && Array.isArray(f.list.rolls)) f.list.rolls.forEach(critGo); });
        var mjGo = function(r) { if (r.dmgMajorIf && mentions(r.dmgMajorIf)) delete r.dmgMajorIf; if (r.hits && mentions(r.hits)) delete r.hits; if (r.dkind && mentions(r.dkind)) delete r.dkind; if (r.dmg2 && mentions(r.dmg2)) { delete r.dmg2; delete r.dtype2; delete r.ad2; delete r.dkind2; } if (r.ad2 && mentions(r.ad2)) delete r.ad2; if (r.dkind2 && mentions(r.dkind2)) delete r.dkind2; DMG_MORE.forEach(function(k) { if (r['dmg' + k] && mentions(r['dmg' + k])) { delete r['dmg' + k]; delete r['dtype' + k]; delete r['ad' + k]; delete r['dkind' + k]; } if (r['ad' + k] && mentions(r['ad' + k])) delete r['ad' + k]; if (r['dkind' + k] && mentions(r['dkind' + k])) delete r['dkind' + k]; }); }; out.rolls.forEach(mjGo); out.fields.forEach(function(f) { if (f.list && Array.isArray(f.list.rolls)) f.list.rolls.forEach(mjGo); });   // 1.6.0: A Major Wound where naming a GM-only value goes, as a list roll's armor divisor does (only the host marks a card); B3: a second part read from one goes whole, its own armor divisor alone as ad does
        out.rolls.forEach(function(r) { if (r.label.indexOf('{') >= 0 && capMentions(r.label)) r.label = labelHead(r.label); });   // HUD frame (HF5a, H3): a label naming a GM-only value keeps only its plain text before the first {...} (fail closed, as a caption)
    }
    var fieldIds = map(), rollIds = map(), resIds = map();
    var fxSeenT = map(); (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (isObj(d) && typeof d.id === 'string' && EFFECT_ID.test(d.id) && (gmView || d.vis !== 'gm')) fxSeenT[d.id] = 1; });   // 1.6.0: the effects this view holds, for a change that switches one
    out.fields.forEach(function(f) { fieldIds[f.id] = f.kind; if (f.kind === 'resource') resIds[f.id] = 1; });
    out.fields.forEach(function(f) { if (f.kind === 'resource' && isObj(f.surcharge) && !gmView && typeof mentions === 'function' && mentions(f.surcharge['if'])) delete f.surcharge; });   // 1.6.2 Costs more while, alike
    out.fields.forEach(function(f) { if (f.kind === 'resource' && isObj(f.surcharge) && !gmView && typeof mentions === 'function' && mentions(f.surcharge['if'])) delete f.surcharge; });   // 1.6.2 Costs more while, alike
    out.fields.forEach(function(f) { if (f.kind === 'resource' && isObj(f.spill) && (resIds[f.spill.to] !== 1 || f.spill.to === f.id || (!gmView && typeof mentions === 'function' && f.spill.below && mentions(f.spill.below)))) delete f.spill; });   // 1.6.0 Spills into: a pool of this view; a spill point naming a GM-only value takes the spill from the players' view (the host still spills)
    applyTargets(out, fieldIds, gmView, fxSeenT); out.rolls.forEach(function(r) { rollIds[r.id] = 1; });   // H7: an apply action's targets first   // fieldIds: id -> kind (always truthy; the band gates on the kind)
    var seenIt = map(), stKeys = statKeys(out.fields), stPicks = statPicks(out.fields);   // F4c1: the stats this view's item lists define (the players' view: visible lists only, so a GM-only list's stat never travels)
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {
        if (out.items.length >= LIMITS.items) return;
        var c = cleanItemDef(it, F, gmView, stKeys, stPicks, fieldIds);
        if (!c || seenIt[c.id]) return;
        seenIt[c.id] = 1; out.items.push(c);
    });
    var core = [], coreBytes = 0;   // Stage 6 library L1d: the core — library entries a formula addresses by key (coreOf), cleaned as items are; one per id, none an item's; absent when empty
    (Array.isArray(sys.core) ? sys.core : []).forEach(function(it) {
        if (core.length >= LIMITS.core) return;
        var c = cleanItemDef(it, F, gmView, stKeys, stPicks, fieldIds); if (!c || seenIt[c.id]) return;
        var nb = JSON.stringify(c).length; if (coreBytes + nb > LIMITS.coreBytes) return;
        seenIt[c.id] = 1; coreBytes += nb; core.push(c);
    });
    if (core.length) out.core = core;
    if (!gmView && opts.needShown !== true) {   // 126b: a need that names an entry players cannot see is left out of their view. opts.needShown: the host's judge of a library entry (sheets.js playerSystem); true on a player's own app, which keeps what its host sent; absent (fail closed): only this view's own items are known
        var visIt = map(), nsF = opts.needShown, sysNd = null; out.items.concat(core).forEach(function(it) { visIt[it.id] = 1; });
        var ruleOkS = function(t) { try { var pr = F.parse(t); if (!pr || !pr.ok || !Array.isArray(pr.names)) return false; sysNd = sysNd || { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects }; return !gmDerivedNames(sysNd, F, pr.names).length; } catch (e) { return false; } };   // a rule is shown only where a player's own app could work it out: it reads no GM-only value at any depth, judged over the GM's view as a budget is
        out.items.concat(core).forEach(function(it) { hideGrants(it, function(id) { return visIt[id] === 1 || (typeof nsF === 'function' && nsF(id) === true); }); });   // 1.6.0 (v2, B4): a grant of an entry players cannot see is left out of their view
        out.fields.forEach(function(f) { if (!f.list || !Array.isArray(f.list.starts)) return; var stK = f.list.starts.filter(function(s) { return visIt[s.entry] === 1 || (typeof nsF === 'function' && nsF(s.entry) === true); }); if (stK.length) f.list.starts = stK; else { delete f.list.starts; if (!Object.keys(f.list).length) delete f.list; } });   // 1.6.0 Starts with: and an entry of a list's
        out.items.concat(core).forEach(function(it) { hideNeeds(it, function(id) { return visIt[id] === 1 || (typeof nsF === 'function' && nsF(id) === true); }, typeof opts.ruleShown === 'function' ? opts.ruleShown : ruleOkS); if (!it.needs && !it.needsIf && !it.needsHid) delete it.needsMsg; });   // opts.ruleShown: the library's judge, which also knows its own GM-only keys
    }
    var placeCatOk = null;   // 1.5.5: the test below, read again for a placement's categories once the sheet is cleaned (placeCatsSeen)
    if (!gmView) {   // Stage 6 F4b: a list's categories in the players' view — a GM-only item's category never travels. opts.libCats (the GM's machine: the library's
        // { show, hide }, library.js catsFor; a client's re-clean of the host's view: {}) keeps one a visible item or entry has, or none has; absent (fail closed): only a visible item's
        var visCat = map(), gmCat = null, lcs = opts.libCats; out.items.concat(core).forEach(function(it) { if (it.category) visCat[lower(it.category)] = 1; });
        if (isObj(lcs)) {
            gmCat = map(); var catL = function(a, m) { (Array.isArray(a) ? a : []).slice(0, 4000).forEach(function(c) { var t = cutText(c, LIMITS.category); if (t) m[lower(t)] = 1; }); };
            catL(lcs.show, visCat); catL(lcs.hide, gmCat);
            (Array.isArray(sys.items) ? sys.items : []).concat(Array.isArray(sys.core) ? sys.core : []).forEach(function(it) { if (isObj(it) && it.vis === 'gm') catL([it.category], gmCat); });
        }
        placeCatOk = function(c) { return visCat[lower(c)] === 1 || (gmCat !== null && gmCat[lower(c)] !== 1); };
        out.fields.forEach(function(f) { if (f.list && Array.isArray(f.list.cats)) f.list.cats = f.list.cats.filter(placeCatOk); if (f.list && isObj(f.list.load) && Array.isArray(f.list.load.cats)) f.list.load.cats = f.list.load.cats.filter(placeCatOk); if (f.list && isObj(f.list.chamber) && Array.isArray(f.list.chamber.cats)) f.list.chamber.cats = f.list.chamber.cats.filter(placeCatOk); if (f.list && Array.isArray(f.list.feeds)) f.list.feeds.forEach(function(x) { if (Array.isArray(x.cats)) x.cats = x.cats.filter(placeCatOk); }); });   // 1.5.9: a chamber's alike   // 1.5.8: a load's categories too (one left with none takes none)
    }
    var seenFx = map(), effs = [];   // 5h: the status-effect library, after the fields (its changes are checked against them); absent when empty
    (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (effs.length >= LIMITS.effects) return; var c = cleanEffectDef(d, fieldIds, gmView, F); if (!c || seenFx[c.id]) return; seenFx[c.id] = 1; effs.push(c); });
    if (effs.some(function(d) { return typeof d.auto === 'string'; })) {   // conditions C4 ("Only public ones"): a formula that reads a GM-only value, at any depth, goes — judged over the GM's view, in both views alike
        var sysAu = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        effs.forEach(function(d) { if (typeof d.auto !== 'string') return; var pa = F.parse(d.auto), nm = pa && pa.ok && Array.isArray(pa.names) ? pa.names : null; if (!nm || gmDerivedNames(sysAu, F, nm).length) delete d.auto; });
    }
    if (F && typeof F.parse === 'function' && out.items.concat(core).some(function(it) { return isObj(it) && Array.isArray(it.mods) && it.mods.some(function(m) { return isObj(m) && typeof m.vf === 'string'; }); })) {   // 1.6.2 (205): an item's change by a formula, judged as an effect's is, its row's own names by the GM-only stats
        var sysIv = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects }, gsIv = gmStatKeys(sys), ixIv = keyIndexOf(sys);
        out.items.concat(core).forEach(function(it) { if (!isObj(it) || !Array.isArray(it.mods)) return; it.mods = it.mods.filter(function(m) { if (!isObj(m) || typeof m.vf !== 'string') return true; var pv = F.parse(m.vf); if (!(pv && pv.ok && pv.ast && !hasDice(pv.ast.body) && Array.isArray(pv.names))) return false; var plain = pv.names.filter(function(n) { return !ROW_NAME.test(String(n)); }); return !gmDerivedNames(sysIv, F, plain).length && !pv.names.some(function(n) { return gmStatRead(gsIv, ixIv, lower(n)); }); }); if (!it.mods.length) delete it.mods; });
    }
    if (effs.some(function(d) { return d.mods.some(function(m) { return typeof m.vf === 'string'; }); })) {   // 1.6.0 (CORE gap 12): a change by a formula that does not parse, rolls dice or reads a GM-only value at any depth goes, judged over the GM's view, in both views alike (its player's sheet and the GM's agree)
        var sysVf = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        effs.forEach(function(d) { d.mods = d.mods.filter(function(m) { if (typeof m.vf !== 'string') return true; var pv = F.parse(m.vf); return !!(pv && pv.ok && pv.ast && !hasDice(pv.ast.body) && Array.isArray(pv.names) && !gmDerivedNames(sysVf, F, pv.names).length); }); });
    }
    if (out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && isObj(f.list.stand); }) && (!gmView || (F && typeof F.parse === 'function'))) {   // 1.6.2 (body fold 2): a formula with no dice. Reaches and Counts where go in both views where they read a GM-only value, so that both machines work out one figure; Fits where stays the GM's, and a player is judged by their own view with none
        var sysSt = { fields: F ? gmViewFields(sys, F) : [], items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.stand)) return; var st = f.list.stand; ['reach', 'counts'].forEach(function(k) { if (typeof st[k] === 'string' && !modsIfOk(sysSt, F, f, st[k])) { delete st[k]; if (k === 'counts') delete st.offWord; } }); if (typeof st.fits === 'string' && !(gmView ? fitTextOk(F, st.fits) : modsIfOk(sysSt, F, f, st.fits))) { delete st.fits; delete st.fitSays; } });
        out.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.tiles) || !Array.isArray(f.list.tiles.boxes)) return; f.list.tiles.boxes.forEach(function(b) { if (typeof b['if'] === 'string' && !modsIfOk(sysSt, F, f, b['if'])) delete b['if']; if (typeof b.taken === 'string' && !modsIfOk(sysSt, F, f, b.taken)) { delete b.taken; delete b.takenSays; } }); });   // 1.6.2 (body fold 4): as a place's Reaches
    }
    if (out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.cols) && f.list.cols.some(function(c) { return isObj(c) && typeof c.showIf === 'string'; }); }) && (!gmView || (F && typeof F.parse === 'function'))) {   // 1.6.2: both machines draw one cell, so one that cannot be read goes in both views
        var sysCs = { fields: F ? gmViewFields(sys, F) : [], items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.cols)) f.list.cols.forEach(function(c) { if (isObj(c) && typeof c.showIf === 'string' && !modsIfOk(sysCs, F, f, c.showIf)) delete c.showIf; }); });
    }
    if (out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && isObj(f.list.tiles) && Array.isArray(f.list.tiles.states); }) && (!gmView || (F && typeof F.parse === 'function'))) {   // 1.6.2 (body fold 8): both machines work out one state, so one that cannot be read goes in both views, as a place's Reaches
        var sysTs = { fields: F ? gmViewFields(sys, F) : [], items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.tiles) || !Array.isArray(f.list.tiles.states)) return; var kpS = f.list.tiles.states.filter(function(s) { return typeof s['if'] !== 'string' || modsIfOk(sysTs, F, f, s['if']); }); if (kpS.length) f.list.tiles.states = kpS; else delete f.list.tiles.states; });
    }
    out.fields.forEach(function(f) {   // 1.6.2 (body fold 8): a row of stand.then names a state and a box its tiles have, and a stat of this list
        if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.stand) || !Array.isArray(f.list.stand.then)) return; var st = f.list.stand, tf = out.fields.filter(function(g) { return g.id === st.from; })[0], tl = tf && isObj(tf.list) && isObj(tf.list.tiles) ? tf.list.tiles : {}, sts = Array.isArray(tl.states) ? tl.states : [], bxs = Array.isArray(tl.boxes) ? tl.boxes : [], num = function(k) { return (Array.isArray(f.list.stats) ? f.list.stats : []).filter(function(s) { return isObj(s) && s.kind !== 'pick' && s.set !== true && lower(s.key) === lower(k); })[0]; };
        var kpT = st.then.filter(function(t) {
            if (!sts.some(function(s) { return s.key === t.state; })) return false; if (typeof t['if'] === 'string' && !fitTextOk(F, t['if'])) return false; if (t.does === 'drops') return bxs.some(function(b) { return b.key === t.to && b.strip === true; }); if (t.does !== 'changes') return true;
            t.apply = t.apply.filter(function(c) { if (typeof c.s !== 'string') return true; var sk = num(c.s); if (sk) c.s = sk.key; return !!sk; }); return t.apply.length > 0;
        }); if (kpT.length) st.then = kpT; else delete st.then;
    });
    if (out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && typeof f.list.modsIf === 'string'; }) && (!gmView || (F && typeof F.parse === 'function'))) {   // 1.6.0 Changes apply where: one that does not parse, rolls dice or, on a list players see, reads a GM-only value at any depth goes, judged over the GM's view, in both views alike (its player's sheet and the GM's agree)
        var sysMi = { fields: F ? gmViewFields(sys, F) : [], items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && typeof f.list.modsIf === 'string' && !modsIfOk(sysMi, F, f, f.list.modsIf)) delete f.list.modsIf; });
    }
    if (out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && isObj(f.list.on) && typeof f.list.on.layer === 'string'; }) && (!gmView || (F && typeof F.parse === 'function'))) {   // 1.6.3 Layers under a list's places, judged as Changes apply where is: a layer that does not parse, rolls dice or, on a list players see, reads a GM-only value at any depth goes, in both views alike, so a player's own app and the host put the same rows on and off
        var sysLr = { fields: F ? gmViewFields(sys, F) : [], items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.on) && typeof f.list.on.layer === 'string' && (!modsIfOk(sysLr, F, f, f.list.on.layer) || layerReadsCovered(f.list, F))) delete f.list.on.layer; });
    }
    if (out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && isObj(f.list.lay); })) {   // 1.6.2 Laid from: its source is another item list of the view; a list players see is never laid from a GM-only list, by a test that reads a GM-only value, or with a GM-only stat; each copied stat is one of the source's, spelled as it spells it (both views alike)
        var sysLy = { fields: F ? gmViewFields(sys, F) : [], items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.fields.forEach(function(f) {
            if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.lay)) return;
            var ly = f.list.lay, sfG = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(x) { return isObj(x) && x.id === ly.from; })[0], sfO = out.fields.filter(function(x) { return x.id === ly.from; })[0];
            if (!sfG || sfG.kind !== 'item-list' || sfG.id === f.id || !sfO || (f.vis !== 'gm' && sfG.vis === 'gm')) { delete f.list.lay; return; }
            if (typeof ly['if'] === 'string' && (!F || typeof F.parse !== 'function' || (f.vis !== 'gm' ? !modsIfOk(sysLy, F, sfG, ly['if']) : !fitTextOk(F, ly['if'])))) { delete f.list.lay; return; }
            if ((Array.isArray(ly.rules) ? ly.rules : []).some(function(x) { return isObj(x) && typeof x['if'] === 'string' && (!F || typeof F.parse !== 'function' || (f.vis !== 'gm' ? !modsIfOk(sysLy, F, sfG, x['if']) : !fitTextOk(F, x['if']))); })) { delete f.list.lay; return; }   // 1.6.2: and a rule's own
            if (Array.isArray(ly.stats)) { ly.stats = ly.stats.map(function(p) { var s = statDefOf(isObj(sfG.list) ? sfG.list : null, p.from); var tS = statDefOf(f.list, p.to); return s && tS && !(f.vis !== 'gm' && s.vis === 'gm') ? { to: tS.key, from: s.key } : null; }).filter(Boolean);   /* both by the spelling the system settles on */ if (!ly.stats.length) delete ly.stats; }
        });
    }
    if (out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && isObj(f.list.lock); }) && (!gmView || (F && typeof F.parse === 'function'))) {   // 1.6.2 Locked while: a test that does not parse, rolls dice or, on a list players see, reads a GM-only value goes in both views alike (the host's judge reads the GM's view whatever a player's holds)
        var sysLk = { fields: F ? gmViewFields(sys, F) : [], items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.lock) && !modsIfOk(sysLk, F, f, f.list.lock['if'])) delete f.list.lock; });
    }
    if (out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && typeof f.list.subjectIf === 'string'; }) && (!gmView || (F && typeof F.parse === 'function'))) {   // 1.6.0 Subject only where, judged as a list's gate is, in both views alike: a row's subject feeds its owner's figures
        var sysSj = { fields: F ? gmViewFields(sys, F) : [], items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && typeof f.list.subjectIf === 'string' && !modsIfOk(sysSj, F, f, f.list.subjectIf)) delete f.list.subjectIf; });
    }
    // 1.6.2 Thrown only where: the GM's view keeps it where it is a formula with no dice, since the host judges every throw by it; the players' view drops
    // it, and its words, where it reads a GM-only value, so a player's sheet grays Throw only where the host would refuse it
    if (out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && typeof f.list.throwIf === 'string'; }) && F && typeof F.parse === 'function') {
        var sysTw = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || typeof f.list.throwIf !== 'string') return; var pT = null; try { pT = F.parse(f.list.throwIf); } catch (x) { pT = null; } if (!pT || !pT.ok || hasDice(pT.ast.body) || (!gmView && !modsIfOk(sysTw, F, f, f.list.throwIf))) { delete f.list.throwIf; delete f.list.throwSays; } });
    } else if (!gmView) out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list)) { delete f.list.throwIf; delete f.list.throwSays; } });
    if (out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.feeds) && f.list.feeds.some(function(fd) { return typeof fd['if'] === 'string'; }); }) && (!gmView || (F && typeof F.parse === 'function'))) {   // 1.6.0 A feed's Only where, judged as a list's gate is, in both views alike: it decides what a shot takes, which a player's sheet says
        var sysFi = { fields: F ? gmViewFields(sys, F) : [], items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.feeds)) f.list.feeds.forEach(function(fd) { if (typeof fd['if'] === 'string' && !modsIfOk(sysFi, F, f, fd['if'])) delete fd['if']; }); });
    }
    if (out.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && isObj(f.list.parts) && (fitRows(f.list.parts).length || capTexts(f.list.parts).length); }) && (!gmView || (F && typeof F.parse === 'function'))) {   // 1.6.0 Fits where (ask 18): one that does not parse or rolls dice goes in both views; from the players' view one that reads a GM-only value at any depth goes too, judged over the GM's view with the part's own names and its host's as modsIfOk judges a list's gate. Their parts are then not judged by it, as needs a player cannot read never hold them back
        var sysFi = { fields: F ? gmViewFields(sys, F) : [], items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.parts) && typeof f.list.parts.fitIf === 'string' && !fitIfOk(sysFi, F, f, f.list.parts.fitIf, gmView)) { delete f.list.parts.fitIf; delete f.list.parts.fitIfSays; } });
        out.fields.forEach(function(f) {   // 1.6.2: a further rule of Fits where by the same test; a line of Holds by kind by a formula is read on the host row, so it is judged as a list's gate, by that list's own names. A line left with no formula goes, so its parts are not limited by it
            var p = f.kind === 'item-list' && isObj(f.list) && isObj(f.list.parts) ? f.list.parts : null; if (!p) return;
            if (Array.isArray(p.fitMore)) { var fm = p.fitMore.filter(function(r) { return fitIfOk(sysFi, F, f, r['if'], gmView); }); if (fm.length) p.fitMore = fm; else delete p.fitMore; }
            if (Array.isArray(p.caps)) { var kp = p.caps.filter(function(k) { return capTexts({ caps: [k] }).every(function(t) { return capFOk(sysFi, F, f, t, gmView); }); }); if (kp.length) p.caps = kp; else delete p.caps; }
        });
    }
    var rowAll = function(c) { return isObj(c) && ((typeof c.list === 'string' && (readsRow(c.formula, F) || (typeof c.rows === 'string' && !!c.rows))) || (typeof c.rand === 'string' && (!!c.test || isObj(c.next)))); };   // 1.6.2 (fold (f)): a random row's test and next step too   // 1.6.0: a system change on every row of a list worked out row by row (Row.*)
    if (!gmView && F && typeof F.parse === 'function' && out.rolls.some(function(r) { return (Array.isArray(r.apply) && r.apply.some(rowAll)) || (Array.isArray(r.then) && r.then.some(rowAll)); })) {   // the players' view drops it where its row names read a GM-only value, judged over the GM's view with the list's own names as modsIfOk judges a list's gate (a column or a choice that reads one): an apply action whole, a roll's Then, as the mention check drops them
        var sysAr = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects }, rowBad = function(c) { return rowAll(c) && (typeof c.rand === 'string' ? [c.test, isObj(c.next) ? c.next.formula : ''].some(function(t) { return !!t && !allRowOk(sysAr, F, fieldById(sysAr, c.rand), t); }) : ((typeof c.sw !== 'boolean' && !allRowOk(sysAr, F, fieldById(sysAr, c.list), c.formula)) || (typeof c.rows === 'string' && !!c.rows && !allRowOk(sysAr, F, fieldById(sysAr, c.list), c.rows)))); };
        out.rolls = out.rolls.filter(function(r) { return !(Array.isArray(r.apply) && r.apply.some(rowBad)); });
        out.rolls.forEach(function(r) { if (Array.isArray(r.then) && r.then.some(rowBad)) thenGmCut(r, rowBad); });
    }
    // 1.6.3 (defense fold 2): a roll answered with a row reads that row's names (Row.*) in its formula, its needs and its Then. In a players' view it goes whole where
    // one of them reads a row's name that is GM only or worked out from a GM-only value, judged over the GM's view as a list's gate is (allRowOk), so the formula a
    // player holds never names what they may not see and both machines read the row alike; the host then sends its card to the GM (net.js attWithView)
    if (!gmView && F && typeof F.parse === 'function' && out.rolls.some(function(r) { return typeof r.withRow === 'string'; })) {
        var sysWr = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        // The review of that fold (finding 5): every text the roll keeps in this view is read, not a list of them, since the validator knows Row.* in each of
        // its formulas (its A Major Wound where, its type and kind, its hits, each part of a blow, a question's ends and the rest) and the host reads them on the
        // row alike. A text that names no row passes; one past WR_TEXTS texts, which no roll the cleaner keeps comes near, leaves the roll out to be safe
        var WR_TEXTS = 2000, wrTexts = function(r) { var t = [], over = false; (function walk(v, d) { if (over || d > 8) return; if (typeof v === 'string') { if (v) { if (t.length >= WR_TEXTS) over = true; else t.push(v); } return; } if (Array.isArray(v)) { v.forEach(function(x) { walk(x, d + 1); }); return; } if (isObj(v)) Object.keys(v).forEach(function(k) { if (k !== 'id' && k !== 'withRow') walk(v[k], d + 1); }); })(r, 0); return over ? null : t; };
        out.rolls = out.rolls.filter(function(r) { if (typeof r.withRow !== 'string') return true; var wf = fieldById(sysWr, r.withRow), ts = wrTexts(r); return !!ts && ts.every(function(t) { return !readsRow(t, F) || allRowOk(sysWr, F, wf, t); }); });
    }
    if (effs.length) out.effects = effs;
    effs.forEach(function(d) { if (Array.isArray(d.end)) { d.end = d.end.filter(function(c) { return typeof c.fx !== 'string' || seenFx[c.fx] === 1; }); if (!d.end.length) delete d.end; } if (typeof d.endRoll === 'string' && rollIds[d.endRoll] !== 1) delete d.endRoll; if (d.endOff && !d.end && !d.endRoll) delete d.endOff; });   // 1.6.2: an effect's end switches an effect and asks a roll of this system
    out.items.concat(core).forEach(function(it) { var ar = it && it.area; if (!ar || !Array.isArray(ar.aff)) return; ar.aff = ar.aff.filter(function(a) { return seenFx[a.fx] === 1; }); if (!ar.aff.length) delete ar.aff; });   // 1.5.9 (es): an affliction whose effect this view does not hold goes (the GM's view alone holds any)
    var gmF = isObj(sys.combat) && (sys.combat.senses !== undefined || sys.combat.targetSize !== undefined || sys.combat.bodySize !== undefined || sys.combat.targetReads !== undefined || sys.combat.targetHit !== undefined) ? gmViewFields(sys, F) : null, gmKinds = map(), secret = null;   // senses S1: judged on the fields as the GM's view has them, in both views (1.6.0: TargetSize's field too)
    if (gmF) { gmF.forEach(function(f) { gmKinds[f.id] = f.kind; }); secret = secretFieldIds({ fields: gmF, items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects }, F); }
    (isObj(sys.combat) && isObj(sys.combat.senses) && Array.isArray(sys.combat.senses.list) ? sys.combat.senses.list : []).forEach(function(s) { var t = isObj(s) && isObj(s.notice) && isObj(s.notice.stealth) ? s.notice.stealth.r : null; if (typeof t === 'string') out.rolls.forEach(function(r) { if (r.id === t) r.named = true; }); });   // 1.6.0
    if (gmView && isObj(sys.combat) && isObj(sys.combat.holds)) holdsNamed(sys.combat.holds, out.rolls, out.fields);
    if (isObj(sys.combat) && typeof sys.combat.steal === 'string') out.rolls.forEach(function(r) { if (r.id === sys.combat.steal) r.named = true; });   // the review of fold 3b: the Pickpocket roll names itself as it is rolled, in both views, so the host knows it however plain it is   // 1.6.0 Who holds whom
    var fxFirstOk = function(cb) { var fsF = cb && isObj(cb.damage) && typeof cb.damage.first === 'string' ? cb.damage.first : ''; if (fsF.indexOf('fx:') === 0 && !effs.some(function(d) { return d.id === fsF.slice(3) && isObj(d.val); })) delete cb.damage.first; return cb; };   // 1.6.2: an effect of this view that holds a number
    out.combat = cleanCombat(sys.combat, resIds, gmKinds, secret, F, fieldIds, !gmView, function(id) { var hitF = null; out.fields.forEach(function(x) { if (!hitF && x.id === id) hitF = x; }); return hitF; });
    if (out.combat && typeof out.combat.steal === 'string' && !out.rolls.some(function(r) { return r && r.id === out.combat.steal; })) delete out.combat.steal;   // fold 3b: a Pickpocket roll this view does not hold is none
    fxFirstOk(out.combat);
    if (!gmView && typeof mentions === 'function') ['critAt', 'fumbleAt'].forEach(function(k) { if (out.combat[k] && mentions(out.combat[k])) delete out.combat[k]; });   // 1.6.0: the Combat tab's critical range naming a GM-only value goes from the players' view (their rolls then read 3 and 18)
    // 1.6.3 (the review of damage): Unaimed blows land at (damage.locs.at) names a location by its entry's name or key, and a GM-only entry's
    // name or key never reaches a player. So the players' view keeps it only where it names an item or core entry of this very view players may
    // see, by its name or key (fail closed; on the GM's machine sheets.js playerSystem puts back one only a library pack players see holds, by
    // the library's own judge, locAtShown and locAtBack). A player's own app re-cleaning its host's view (needShown true) keeps what its host sent. Dropped, the
    // players' own Take damage window opens on the usual location (a row named Torso, else the first)
    var dmAt = out.combat && isObj(out.combat.damage) && isObj(out.combat.damage.locs) ? out.combat.damage.locs : null;
    if (!gmView && dmAt && typeof dmAt.at === 'string' && opts.needShown !== true) {
        var atW = lower(dmAt.at.trim()), atSeen = out.items.concat(Array.isArray(out.core) ? out.core : []).some(function(it) { return isObj(it) && it.vis !== 'gm' && ((typeof it.name === 'string' && lower(it.name.trim()) === atW) || (typeof it.key === 'string' && lower(it.key) === atW)); });
        if (!atSeen) delete dmAt.at;
    }
    if (F && typeof F.parse === 'function') {   // 1.6.2: a question offers nothing a player cannot read truthfully, judged over the GM's view, in both views alike
        var askEnt = function(fn) { out.rolls.forEach(fn); out.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.rolls)) f.list.rolls.forEach(fn); }); }, askAny = false; askEnt(function(r) { if (Array.isArray(r.asks)) askAny = true; });
        if (askAny) { var sysAk = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects }, secAk = secretFieldIds(sysAk, F); askEnt(function(r) { if (!Array.isArray(r.asks)) return; var kA = asksKept(r.asks, sysAk, F, secAk); if (kA.length) r.asks = kA; else delete r.asks; }); }
    }
    if (out.combat.initiative && Array.isArray(out.combat.initiative.ties)) {   // initiative O2: a step that reads a GM-only value goes (the order is public: a player would learn which is higher), judged over the GM's view, in both views alike
        var sysTi = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        out.combat.initiative.ties = out.combat.initiative.ties.filter(function(t) { var pt = F.parse(t); return !!(pt && pt.ok && Array.isArray(pt.names)) && !gmDerivedNames(sysTi, F, pt.names).length; });
        if (!out.combat.initiative.ties.length) { delete out.combat.initiative.ties; if (!Object.keys(out.combat.initiative).length) delete out.combat.initiative; }
    }
    costTargets(out, gmView);   // turn-based combat T1: what each roll costs, against the actions just cleaned
    everyTargets(out, gmView);   // item 20 K5: what each clock rule counts in, against the time units just cleaned
    if (!gmView && typeof showMention === 'function' && out.combat.turn && Array.isArray(out.combat.turn.acts)) out.combat.turn.acts.forEach(function(a) { if (a && a.nf && showMention(a.nf)) delete a.nf; });   // 192: a count naming a GM-only value goes, as a move's does
    if (!gmView && typeof showMention === 'function' && out.combat.turn && out.combat.turn.move && showMention(out.combat.turn.move)) { delete out.combat.turn.move; delete out.combat.turn.unit; if (!Object.keys(out.combat.turn).length) delete out.combat.turn; }   // T1: a move naming a GM-only value goes (their moves are then not limited by it)
    if (!gmView && typeof showMention === 'function' && out.combat.turn && out.combat.turn.face && showMention(out.combat.turn.face)) { delete out.combat.turn.face; delete out.combat.turn.faceBy; if (!Object.keys(out.combat.turn).length) delete out.combat.turn; }   // 1.6.2 (backlog 70): a facing limit that names a GM-only value goes (their turns are then not counted by it, as a move's)
    if (!gmView && typeof showMention === 'function' && out.combat.turn && out.combat.turn.holdLost && showMention(out.combat.turn.holdLost)) delete out.combat.turn.holdLost;   // 1.6.0: only the host reads it, so nothing of a hold depends on a player's copy
    if (!gmView && typeof showMention === 'function' && out.combat.turn && out.combat.turn.run && (!out.combat.turn.move || showMention(out.combat.turn.run))) { delete out.combat.turn.run; delete out.combat.turn.runCost; if (!Object.keys(out.combat.turn).length) delete out.combat.turn; }   // 1.6.0: a move by giving up an action goes with its move, and where it names a GM-only value (their one allowance is then the move)
    var lr = cleanListRules(sys.listRules); if (lr) out.listRules = lr;   // Stage 6 F4c2: Setting A, in both views (absent: GM only)
    var srS = cleanSheetRev(sys.sheetRev); if (srS) out.sheetRev = srS;   // 1.6.0 (backlog 190): the sheet revision, in both views (absent: none)
    if (sys.makeRolls === 'gm' || sys.makeRolls === 'self') out.makeRolls = sys.makeRolls;   // 1.6.3 (finding 22): Rolls while making, in both views (a player's sheet needs it to offer its rolls), only as one of its two words (absent: off)
    var bud = cleanBudgets(sys.budgets, F);   // 126: the point budgets, the same in both views (absent: none)
    if (bud) {   // one that reads a GM-only value, at any depth, goes: a player's own app must work out the very figures the host judges by. Judged over the GM's view, in both views alike
        var sysBu = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        bud = bud.filter(function(b) { return [b.has, b.spent].every(function(t) { var pb = F.parse(t); return !!(pb && pb.ok && Array.isArray(pb.names)) && !gmDerivedNames(sysBu, F, pb.names).length; }); });
        if (bud.length) out.budgets = bud;
    }
    // 1.6.4 Buy off: whether its cost reads a GM-only value at any depth (a GM-only field, a figure worked out from one, a GM-only stat of the row),
    // judged over the GM's view as a point budget's is. In the players' view such a list has no Buy off (the figure they were asked would tell
    // the value, and their own sheet could not work out the host's). In the GM's view a line recorded on a list players see is bare where the
    // charged field is GM-only or the cost reads such a value (the row's name and its note, no figure and no field's name), so the GM's own buy
    // off tells players nothing hidden. Worked out here, never taken from a file
    var sysBo = null;
    out.fields.forEach(function(f) {
        var bo = f.kind === 'item-list' && isObj(f.list) && isObj(f.list.buyOff) ? f.list.buyOff : null; if (!bo) return; if (isObj(bo.ledger)) delete bo.ledger.bare;
        sysBo = sysBo || { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects };
        var rawF = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(x) { return isObj(x) && x.id === f.id; })[0], rawSt = rawF && isObj(rawF.list) && Array.isArray(rawF.list.stats) ? rawF.list.stats : [], pbo = F.parse(bo.cost);
        var gmRd = !(pbo && pbo.ok && Array.isArray(pbo.names)) || gmDerivedNames(sysBo, F, pbo.names).length > 0 || pbo.names.some(function(n) { var sg = lower(n).split('.'); return sg[0] === 'row' && sg.length > 1 && rawSt.some(function(s) { return isObj(s) && s.vis === 'gm' && typeof s.key === 'string' && lower(s.key) === sg[1]; }); });
        if (!gmView) { if (gmRd) delete f.list.buyOff; return; }
        if (!isObj(bo.ledger)) return;
        var cfB = out.fields.filter(function(x) { return x.id === bo.f; })[0], lfB = out.fields.filter(function(x) { return x.id === bo.ledger.to; })[0]; if (!lfB || lfB.vis === 'gm') return;
        if ((cfB && cfB.vis === 'gm') || gmRd) bo.ledger.bare = true;
    });
    var envR = cleanEnv(sys.env, fieldIds, F);   // 1.6.0: the environment readings, against this view's fields (a reading whose field players do not hold is not theirs)
    if (envR && !gmView && typeof showMention === 'function') envR.forEach(function(e) { ENV_BANDS.forEach(function(k) { if (e[k] && showMention(e[k])) delete e[k]; }); });   // a band that reads a GM-only value goes from the players' view: where it showed would tell the value
    if (envR) out.env = envR;
    if (gmView) { var objS = cleanObjects(sys.objects); if (objS.length) out.objects = objS; }   // 1.6.0: a system's own map objects, the GM's to place: never in the players' view
    var pages = null;   // Stage 5f: the host passes the ids of the pages players may read, so a chip or link to any other page never travels
    if (opts.pages !== undefined) { pages = map(); (Array.isArray(opts.pages) ? opts.pages : []).forEach(function(id) { if (validPageId(id)) pages[id] = 1; }); }
    out.sheet = cleanSheet(sys.sheet, fieldIds, rollIds, pages, gmView);
    if (!gmView && typeof placeCatOk === 'function' && isObj(out.sheet)) [out.sheet, out.sheet.hud].forEach(function(lay) { placeCatsSeen(lay, function(c, id) { var fpb = null; out.fields.forEach(function(x) { if (!fpb && x && x.id === id) fpb = x; }); return fpb && isObj(fpb.list) && typeof fpb.list.placeBy === 'string' && fpb.list.placeBy ? true : placeCatOk(c); }, opts.libWait === true); });   // 1.5.5: a placement's categories, judged as a list's own (a GM-only item's category never travels)
    if (!gmView && typeof showMention === 'function') [out.sheet, out.sheet && out.sheet.hud].forEach(function(lay) {   // Stage 6 HUD C8: a show-if naming a GM-only value goes (the part simply shows): whether it showed would tell the value
        (lay && Array.isArray(lay.sections) ? lay.sections : []).forEach(function(s) { if (s.showIf && showMention(s.showIf)) delete s.showIf; (s.fields || []).forEach(function(p) { if (p.showIf && showMention(p.showIf)) delete p.showIf; if (p.kind === 'roller' && p.formula && showMention(p.formula)) delete p.formula; }); });   // H9: a roller's starting formula naming a GM-only value goes too (the box starts empty)
    });
    var ss = cleanSheetStyle(sys.sheetStyle); if (ss) out.sheetStyle = ss;   // the sheet's own look (doc theming), players' view included
    var lnk = cleanLinks(sys.links, F); if (lnk) out.links = lnk;   // 1.6.0: the linked sheets, the same in both views (absent: none)
    if (lnk && F && typeof F.parse === 'function' && lnk.some(function(k) { return isObj(k.fit) || typeof k.veh === 'string'; })) { var sysLf = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects }; lnk.forEach(function(k) { if (typeof k.veh === 'string') { var pv0 = F.parse(k.veh); if (!pv0.ok || gmDerivedNames(sysLf, F, pv0.names || []).length) delete k.veh; } if (!isObj(k.fit)) return; Object.keys(k.fit).forEach(function(s) { var pf = F.parse(k.fit[s]['if']); if (!pf.ok || gmDerivedNames(sysLf, F, pf.names || []).length) delete k.fit[s]; }); if (!Object.keys(k.fit).length) delete k.fit; }); }   // 1.6.2 (218)
    var rsC = cleanResults(sys.results, gmView); if (rsC.length) out.results = rsC;   // 1.6.2 (G7)
    var vlC = cleanValues(sys.values, gmView); if (vlC.length) out.values = vlC;   // 1.6.2 (G8)
    var mkS = cleanMapKinds(sys.mapKinds); if (mkS) out.mapKinds = mkS;
    var msS = cleanMapStart(sys.mapStart); if (msS) out.mapStart = msS;   // 1.6.3: the scale a new map starts at, the same in both views
    var tvS = cleanTravel(sys.travel, out.fields); if (tvS) out.travel = tvS;   // 1.6.2 (backlog 166 a): travel modes, a field the view lacks dropped
    var scnS = cleanScenes(sys.scenes); if (scnS) out.scenes = scnS;
    var dkS = cleanDarkSteps(sys.dark); if (dkS) out.dark = dkS;   // 1.6.2: darkness steps, the same in both views   // 1.6.2: a scene's channels, the same in both views   // 1.6.2 (vehicles, fold (g)): the system's map kinds, the same in both views
    var tgS = cleanTags(sys.tags, gmView); if (tgS) out.tags = tgS;   // 1.6.2 (vehicles, fold (c)): the marks one token may hold on another, the same in both views but for what ends one (part two), the GM's alone
    var tgC = cleanTrading(sys.trading); if (tgC) out.trading = tgC;   // 157 M1c
    var cuC = cleanCurrencies(sys.currencies); if (cuC.length) out.currencies = cuC;   // 157 M1: the currencies, the same in both views; a list's currency only one they name, spelled as they spell it, and a row's choice of one only where there are some
    (Array.isArray(out.fields) ? out.fields : []).forEach(function(f) { if (!isObj(f) || f.kind !== 'item-list' || !isObj(f.list)) return; var L = f.list; ['cur', 'priceCur'].forEach(function(k) { if (L[k] === undefined) return; var cuH = cuC.filter(function(c) { return lower(c.key) === lower(L[k]); })[0]; if (cuH) L[k] = cuH.key; else delete L[k]; }); if (!cuC.length) { delete L.curBy; delete L.priceCurBy; } if (!tgC || !tgC.rates) { delete L.buyBy; delete L.sellBy; } });
    var dkC = cleanDecks(sys.decks, gmView, /^D[0-9]+$/); if (dkC.length) out.decks = dkC;   // 1.6.2 (G9)
    var spC = cleanSpreads(sys.spreads, gmView, /^D[0-9]+$/, /^S[0-9]+$/); if (spC.length) out.spreads = spC;   // 1.6.2 (backlog 223): a system's spreads name its own decks, and are the GM's alone
    var tbls = cleanTables(sys.tables, gmView); if (tbls) out.tables = tbls;
    var ccL = cleanCharCats(sys.charCats, F); if (ccL) { if (F && typeof F.parse === 'function') { var sysCc = { fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects }; ccL.forEach(function(x) { if (typeof x['if'] !== 'string') return; var pc = F.parse(x['if']); if (!pc.ok || gmDerivedNames(sysCc, F, pc.names || []).length) delete x['if']; }); } out.charCats = ccL; }   // 1.6.2 (218, fold 2): the Characters list's categories, alike in both views, a rule that reads a GM-only value gone
    var nmL = cleanNameLists(sys.names, gmView !== false); if (nmL) out.names = nmL;   // 1.6.2 (backlog 147): the name button's lists (absent: none), a list for the GM alone left out of the players' view   // 1.6.0: the tables a formula reads by name (absent: none)
    if (!gmView && typeof mentions === 'function' && out.links) out.links.forEach(function(k) { if (!Array.isArray(k.figs)) return; k.figs = k.figs.filter(function(x) { return !mentions(x.formula); }); if (!k.figs.length) delete k.figs; });   // the core handbook session's ask 6: a group's figure read from a GM-only value is the GM's alone
    var cal = cleanCalendar(sys.calendar); if (cal) out.calendar = cal;   // item 20 K1: the calendar, the same in both views (absent: a plain count of days)
    if (gmView) { var tuR = isObj(out.combat) && isObj(out.combat.turn) && Array.isArray(out.combat.turn.units) ? out.combat.turn.units.map(function(u) { return isObj(u) ? u.key : ''; }) : [], rfR = { rolls: map(), pools: map(), secs: map() }; (out.rolls || []).forEach(function(r) { if (isObj(r) && typeof r.id === 'string' && r.init !== true) rfR.rolls[r.id] = 1; }); (out.fields || []).forEach(function(f) { if (isObj(f) && f.kind === 'resource' && typeof f.id === 'string') rfR.pools[f.id] = 1; }); (isObj(out.sheet) && Array.isArray(out.sheet.sections) ? out.sheet.sections : []).forEach(function(s) { if (isObj(s) && typeof s.id === 'string') rfR.secs[s.id] = 1; }); var rsR = cleanRests(sys.rests, tuR, rfR); if (rsR) out.rests = rsR; (Array.isArray(out.effects) ? out.effects : []).forEach(function(d) { if (isObj(d) && typeof d.endsRest === 'string' && d.endsRest !== '-' && !(rsR || []).some(function(x) { return x.id === d.endsRest; })) delete d.endsRest; }); var skR = cleanRestSkip(sys.restSkip, rsR); if (skR) out.restSkip = skR; }   // 1.6.2 (backlog 138 (j) fold R1): the rests, the GM's alone
    if (Array.isArray(out.fields) && out.fields.some(function(f) { return isObj(f) && isObj(f.list) && typeof f.list.priceCol === 'string'; })) {   // 1.6.2, the review of backlog 234: Price from stands only where the players' view keeps its column's formula (a column that reads a GM-only value is blanked there), in both views alike, so the host never records a Paid worked out from a value the row's owner may not see, and both machines read the price stat
        var pvPc = gmView ? cleanSystem(out, { F: F, gmView: false }) : out;
        out.fields.forEach(function(f) {
            if (!isObj(f) || !isObj(f.list) || typeof f.list.priceCol !== 'string') return;
            var pf = f.vis === 'gm' ? f : (pvPc.fields || []).filter(function(x) { return isObj(x) && x.id === f.id; })[0], pc = pf && isObj(pf.list) && Array.isArray(pf.list.cols) ? pf.list.cols.filter(function(c) { return isObj(c) && lower(c.key) === lower(f.list.priceCol); })[0] : null;
            if (!pc || typeof pc.formula !== 'string' || !pc.formula) delete f.list.priceCol;
        });
    }
    explainPages(out, pages);   // 1.6.2 (backlog 218 fold 3): an explanation's page only where players may read it
    if (gmView) Object.defineProperty(out, 'gmSide', { value: true });   // 1.6.0 linked sheets: a system cleaned for the GM, never written or sent (not enumerable), so the link source reads the GM's own character with it
    return out;
}
// Stage 6 library L0: what a system file had that cleaning left out — past a limit, or not valid — per kind, for the import's notice
// (only kinds that lost something; a file's own count, never more than the file had)
// 1.6.0: how many texts of a file the cleaner kept only the start of, found by walking the two side by side (a list of things with ids by the id). A text it rewrote otherwise (a comma out of a value name) is no cut
function textsCut(a, b, deep) {
    if (typeof a === 'string') return typeof b === 'string' && b.length > 0 && b.length < a.trim().length && a.indexOf(b) === 0 ? 1 : 0;
    if (deep > 12 || !a || !b || typeof a !== 'object' || typeof b !== 'object') return 0;
    var n = 0;
    if (Array.isArray(a)) {
        if (!Array.isArray(b)) return 0;
        var ids = map(); b.forEach(function(x) { if (isObj(x) && typeof x.id === 'string') ids[x.id] = x; });
        a.forEach(function(x, i) { n += textsCut(x, isObj(x) && typeof x.id === 'string' ? ids[x.id] : b[i], deep + 1); });
        return n;
    }
    Object.keys(a).forEach(function(k) { if (k !== '__proto__' && Object.prototype.hasOwnProperty.call(b, k)) n += textsCut(a[k], b[k], deep + 1); });
    return n;
}
function droppedCounts(raw, clean) {
    var out = {}; if (!isObj(raw) || !isObj(clean)) return out;
    ['fields', 'rolls', 'items', 'effects', 'tables'].forEach(function(k) { var n = Array.isArray(raw[k]) ? raw[k].length : 0, m = Array.isArray(clean[k]) ? clean[k].length : 0; if (n > m) out[k] = n - m; });
    // 1.6.0 (the owner, 2026-10-28: "count dropped sections and placements, sheet and HUD"): a layout's sections, and the placements of the sections it kept (a section left out takes its own with it, so they are not counted twice)
    var lay = function(r, c, pre) {
        var rs = isObj(r) && Array.isArray(r.sections) ? r.sections : [], cs = isObj(c) && Array.isArray(c.sections) ? c.sections : [], kept = map(), lost = 0;
        cs.forEach(function(s) { if (isObj(s) && typeof s.id === 'string') kept[s.id] = Array.isArray(s.fields) ? s.fields.length : 0; });
        rs.forEach(function(s) { if (isObj(s) && typeof s.id === 'string' && kept[s.id] !== undefined) lost += Math.max(0, (Array.isArray(s.fields) ? s.fields.length : 0) - kept[s.id]); });
        if (rs.length > cs.length) out[pre + 'sections'] = rs.length - cs.length;
        if (lost > 0) out[pre + 'placements'] = lost;
    };
    var rsh = isObj(raw.sheet) ? raw.sheet : null, csh = isObj(clean.sheet) ? clean.sheet : null;
    lay(rsh, csh, ''); lay(rsh && rsh.hud, csh && csh.hud, 'HUD ');
    // 1.6.2 (found by the CORE session: a counter keyed as a stat of its list was left out, and with it the job that counted on it, with no word): a
    // list's stats, columns and counters, and the jobs of its rolls and actions, in the lists kept, compared by the field's id
    var keptF = map(); (Array.isArray(clean.fields) ? clean.fields : []).forEach(function(f) { if (isObj(f) && typeof f.id === 'string' && isObj(f.list)) keptF[f.id] = f.list; });
    var len = function(a) { return Array.isArray(a) ? a.filter(isObj).length : 0; }, jobs = function(l) { return Array.isArray(l.rolls) ? l.rolls.filter(function(r) { return isObj(r) && isObj(r.job); }).length : 0; }, lsd = { 'list stats': 0, 'list columns': 0, 'list counters': 0, jobs: 0 };
    (Array.isArray(raw.fields) ? raw.fields : []).forEach(function(f) { var cl = isObj(f) && typeof f.id === 'string' && isObj(f.list) ? keptF[f.id] : null; if (!cl) return; var rl = f.list;
        lsd['list stats'] += Math.max(0, len(rl.stats) - len(cl.stats)); lsd['list columns'] += Math.max(0, len(rl.cols) - len(cl.cols)); lsd['list counters'] += Math.max(0, len(rl.counters) - len(cl.counters)); lsd.jobs += Math.max(0, jobs(rl) - jobs(cl)); });
    Object.keys(lsd).forEach(function(k) { if (lsd[k] > 0) out[k] = lsd[k]; });
    // 1.6.2 (the CORE session): a bundled icon the app does not know (icon: and a name glyphPath lacks) is cleared to none by the cleaners; counted
    // wherever the file names one, a walk bounded in depth and in what it reads
    var icN = 0, seenN = 0, walk = function(v, d) { if (seenN++ > 200000 || d > 16) return; if (typeof v === 'string') { var t = v.trim(); if (/^icon:/i.test(t) && !glyphPath(t.toLowerCase())) icN++; return; } if (Array.isArray(v)) { v.forEach(function(x) { walk(x, d + 1); }); return; } if (isObj(v)) Object.keys(v).forEach(function(k) { walk(v[k], d + 1); }); };
    walk(raw, 0); if (icN) out.icons = icN;
    var cutN = textsCut(raw, clean, 0); if (cutN) out.texts = cutN;
    return out;
}
// 1.6.0: what a cleaned system holds at its limit, so that one more would be left out: fields, rolls, and for the sheet and its HUD sections and
// placements, each { what, n, max } in that order (the System editor's note says them)
function capsAt(sys) {
    var out = []; if (!isObj(sys)) return out;
    var at = function(what, n, max) { if (n >= max) out.push({ what: what, n: n, max: max }); };
    at('fields', Array.isArray(sys.fields) ? sys.fields.length : 0, LIMITS.fields); at('rolls', Array.isArray(sys.rolls) ? sys.rolls.length : 0, LIMITS.rolls); at('effects', Array.isArray(sys.effects) ? sys.effects.length : 0, LIMITS.effects); at('tables', Array.isArray(sys.tables) ? sys.tables.length : 0, LIMITS.tables);
    var lay = function(l, pre) { var ss = isObj(l) && Array.isArray(l.sections) ? l.sections : [], p = 0; ss.forEach(function(s) { p += isObj(s) && Array.isArray(s.fields) ? s.fields.length : 0; }); at(pre + 'sections', ss.length, LIMITS.sections); at(pre + 'placements', p, LIMITS.placements); };
    var sh = isObj(sys.sheet) ? sys.sheet : null; lay(sh, ''); lay(sh && sh.hud, 'HUD ');
    return out;
}
// The words for what was left out (droppedCounts' answer): "1 section, 3 HUD placements"; '' for none
function droppedWords(dr) { return Object.keys(isObj(dr) ? dr : {}).filter(function(k) { return typeof dr[k] === 'number' && dr[k] > 0; }).map(function(k) { return k === 'texts' ? dr[k] + (dr[k] === 1 ? ' text' : ' texts') + ' cut short' : dr[k] + ' ' + (dr[k] === 1 ? k.slice(0, -1) : k); }).join(', '); }
// The sheet's own look (doc theming, 1.5.0): the fields a page's look has, kept as plain bounded values here —
// docrender's cleanDocStyle validates them strictly at render, on every machine. Absent = the campaign default.
function cleanSheetStyle(v) {
    if (!isObj(v)) return undefined;
    var out = {};
    ['font', 'textColor', 'bgColor', 'bgImage'].forEach(function(k) { if (typeof v[k] === 'string' && v[k].length && v[k].length <= 400 && !CTRL_RE.test(v[k])) out[k] = v[k]; });
    if (fin(v.bgDim)) out.bgDim = Math.max(0, Math.min(90, Math.round(v.bgDim)));
    return Object.keys(out).length ? out : undefined;
}
function fieldById(sys, id) { for (var i = 0; i < sys.fields.length; i++) if (sys.fields[i].id === id) return sys.fields[i]; return null; }
function keyIndex(sys) { var ix = map(); sys.fields.forEach(function(f) { ix[lower(f.key)] = f; }); return ix; }
// 1.5.5: keyIndex for a resolver, kept for a fields array while each of its fields is the very object it was made from with the very key, so a
// draft edited in place (a field added, removed, replaced or given another key) is indexed again. Read only: every resolver of that array shares it
var _ixKept = typeof WeakMap === 'function' ? new WeakMap() : null;
function keyIndexOf(sys) {
    var fs = sys.fields, m = _ixKept ? _ixKept.get(fs) : null, i = 0;
    if (m && m.n === fs.length) { for (; i < fs.length; i++) if (fs[i] !== m.fs[i] || fs[i].key !== m.ks[i]) break; if (i === fs.length) return m.ix; }
    var ix = keyIndex(sys); if (_ixKept) _ixKept.set(fs, { n: fs.length, fs: fs.slice(), ks: fs.map(function(f) { return f.key; }), ix: ix });
    return ix;
}
// Stage 6 F5a1: the keys of the GM-only library entries, per visible item list whose scope has them (lower-case list key -> lower-case entry
// key -> 1) — a visible formula naming L.<such a key> reads a secret (critic 5: per list and key, never all keys everywhere). The system's items
// and its core (the library's addressed entries, a GM-only pack's marked GM-only: findRow reads both; owed review F5a1#1). Local
function gmEntryKeys(sys, fields) {
    var out = map();
    (Array.isArray(fields) ? fields : []).forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list' || f.vis === 'gm') return;
        var cats = isObj(f.list) && Array.isArray(f.list.cats) && f.list.cats.length ? f.list.cats : null;
        (Array.isArray(sys && sys.items) ? sys.items : []).concat(Array.isArray(sys && sys.core) ? sys.core : []).forEach(function(it) { if (isObj(it) && it.vis === 'gm' && typeof it.key === 'string' && it.key && (!cats || catIn(cats, it.category))) { var lk = lower(f.key); (out[lk] = out[lk] || map())[lower(it.key)] = 1; } });
    });
    return out;
}
// One stored value coerced to its field's kind, or undefined (drop). opts.max: an evaluated resource max (or null = unbounded)
function cleanValue(field, v, opts) {
    var k = field.kind;
    if (k === 'number' || k === 'skill') { var n = Number(v); if (!fin(n)) return undefined; n = clampNum(stepRound(n, field), field.min, field.max); return fin(n) ? n : undefined; }   // clamped, then checked: a tiny step can round past the bound
    if (k === 'toggle') return v === true ? true : v === false ? false : undefined;
    if (k === 'text') { if (typeof v !== 'string') return undefined; return v.slice(0, field.max || LIMITS.text).replace(CTRL_RE_G, ''); }
    if (k === 'notes') { if (typeof v !== 'string') return undefined; return v.slice(0, LIMITS.notes).replace(CTRL_KEEP_NL, ''); }
    if (k === 'select') return typeof v === 'string' && field.options.indexOf(v) >= 0 ? v : undefined;
    if (k === 'resource') {
        var cur = isObj(v) ? Number(v.cur) : Number(v); if (!fin(cur)) return undefined;
        cur = clampNum(Math.round(cur), field.minNeg === true ? poolLeast(field, opts ? opts.max : null) : field.min, opts && fin(opts.max) ? opts.max : undefined);
        return { cur: cur };
    }
    if (k === 'effects') {   // 5h: [{id, ref, on}] library rows or [{id, name, icon, tone, dur, notes, on, mods}] ad hoc rows; opts.effects / opts.fields from valueOpts
        if (!Array.isArray(v)) return undefined;
        var fxIds = (opts && opts.effects) || map(), fk = (opts && opts.fields) || map(), rows = [], seenRow = map(), seenRef = map();
        for (var ri = 0; ri < v.length && rows.length < LIMITS.effectRows; ri++) {
            var row = v[ri];
            if (!isObj(row) || typeof row.id !== 'string' || !FXROW_ID.test(row.id) || seenRow[row.id]) continue;
            var on = row.on !== false;
            if (row.ref !== undefined) {
                if (typeof row.ref !== 'string' || !EFFECT_ID.test(row.ref) || fxIds[row.ref] !== 1 || seenRef[row.ref]) continue;   // once per character (a second add turns it back on)
                seenRow[row.id] = 1; seenRef[row.ref] = 1; var rr0 = { id: row.id, ref: row.ref, on: on }, rt0 = cleanFxTimer(row.t); if (rt0) rr0.t = rt0; var rv0 = fxValNum(row.v); if (rv0) { rr0.v = rv0; var rvt = Number(row.vt); if (isFinite(rvt) && rvt > 0 && rvt < 1e9) rr0.vt = rvt; } rows.push(rr0); continue;   // T5a: its timer; 1.6.2: its number
            }
            var core = cleanEffectCore(row, fk); seenRow[row.id] = 1;
            var ra0 = { id: row.id, name: core.name, icon: core.icon, tone: core.tone, dur: core.dur, notes: core.notes, on: on, mods: core.mods }, rt1 = cleanFxTimer(row.t); if (rt1) ra0.t = rt1; var lkX = isObj(row.lk) ? cleanRec(row.lk, core.name, rowTextRule('fx')) : null; if (lkX) ra0.lk = lkX; var rva = fxValNum(row.v); if (rva) ra0.v = rva; rows.push(ra0);   // T5a: its timer
        }
        return rows;
    }
    if (k === 'item-list') {   // Stage 6 F4a: rows (cleanRow) — at most LIMITS.carried; one id-less row per item (the rule before Stage 6); a row id once; nothing minted. opts.items is a proto-safe id set
        if (!Array.isArray(v)) return undefined;
        var items = (opts && opts.items) || map(), seenD = map(), seenR = map(), list = [], nVis = 0, nHid = 0;
        for (var i = 0; i < v.length && i < LIMITS.carried * 4 && (nVis < LIMITS.carried || nHid < LIMITS.carried); i++) {   // Stage 6: visible rows and kept curses counted apart (a kept row never pushes out, or blocks, a visible one)
            var rw = cleanRow(v[i], items, field.list, isObj(field.list) && isObj(field.list.load) && opts && opts.specs ? opts.specs[field.list.load.from] : undefined, isObj(field.list) && isObj(field.list.chamber) && opts && opts.specs ? opts.specs[field.list.chamber.from] : undefined, opts && opts.specs ? opts.specs : undefined); if (!rw) continue;   // 1.5.9: and the chamber's list, for its rounds   // 1.5.8: the source list's options, for a loaded copy
            var rk = rowIdOf(rw); if (!rk || seenR[rk] || (!rw.id && rw.defId && seenD[rw.defId])) continue;
            if (rw.hid === 1 ? nHid >= LIMITS.carried : nVis >= LIMITS.carried) continue;
            seenR[rk] = 1; if (rw.defId && rw.hid !== 1) seenD[rw.defId] = 1; if (rw.hid === 1) nHid++; else nVis++; list.push(rw);
        }
        if (isObj(field.list) && (isObj(field.list.look) || field.list.workLog === true)) rowLookRoom(list);   // 1.6.0, backlog 206: the looks and logs a list holds in all
        return list;
    }
    return undefined;
}
// A number snapped to its step. base + k * step is worked in floating point, so 1.49 came out as 1.4900000000000002 (found 2026-11-22, the
// save rewrite check): the answer is rounded to the decimals the step and the base are written with, at most 10, which every snapped figure
// holds exactly. A step or base the computer writes in e-notation keeps the old sum, since it has no decimals to count
function stepPlaces(v) { var s = String(v); if (s.indexOf('e') >= 0) return -1; var d = s.indexOf('.'); return d < 0 ? 0 : s.length - d - 1; }
function stepRound(n, field) {
    var step = field.step > 0 ? field.step : 1, base = field.min !== undefined ? field.min : 0, out = base + Math.round((n - base) / step) * step;
    var pl = Math.max(stepPlaces(step), stepPlaces(base)); if (stepPlaces(step) < 0 || stepPlaces(base) < 0 || pl > 10 || !isFinite(out)) return out;
    var r = Number(out.toFixed(pl)); return isFinite(r) ? r : out;
}
// Onboarding F1c: a character's own face — the rule of net.js cleanFace, word for word (netcheck compares the two): 'photo', 'default',
// 'pic:<name>' from this list, or ONE emoji; anything else is ''
var FACE_PICS = ['bren', 'chef', 'golems', 'innkeeper', 'king', 'liriel', 'minotaur_archer', 'minotaur_soldier', 'orc', 'priestess', 'sage', 'slime', 'smith', 'spriggan', 'tharic'];
function cleanFace(v) {
    if (typeof v !== 'string' || !v || v.length > 64) return '';
    if (v === 'photo' || v === 'default') return v;
    if (v.slice(0, 4) === 'pic:') return FACE_PICS.indexOf(v.slice(4)) >= 0 ? v : '';
    var cps = Array.from(v), i = 0; if (cps.length > 16) return '';
    var ep = function(c) { return /^\p{Extended_Pictographic}$/u.test(c); }, mod = function(c) { return c === '\uFE0F' || /^[\u{1F3FB}-\u{1F3FF}]$/u.test(c); };
    var unit = function() { if (i >= cps.length || !ep(cps[i])) return false; i++; while (i < cps.length && mod(cps[i])) i++; return true; };
    if (!unit()) return '';
    while (i < cps.length) { if (cps[i] !== '\u200D') return ''; i++; if (!unit()) return ''; }
    return v;
}
// The token creator's kept original (owner, 2026-09-27: the GM may keep it, a player never): the whole picture a framed one was cut from (a
// saved picture or a bundled square), the square chosen in it (picture pixels) and the framed file it made (of: it applies only while that
// file is still worn). GM-only: never in a player's view of a character (charView lists what it sends), stripped from a token on the wire
function cleanFrame(v) {
    if (!isObj(v)) return null;
    var saved = function(p) { return typeof p === 'string' && PATH_RE.test(p) && p.indexOf('..') < 0 && !CTRL_RE.test(p); };
    var num = function(x) { return typeof x === 'number' && fin(x) && x >= 0 && x <= 1e6; };
    if (!(saved(v.src) || (typeof v.src === 'string' && /^assets[/]tutorial[/][a-z_]{1,40}_sq[.]jpg$/.test(v.src))) || !saved(v.of) || !num(v.x) || !num(v.y) || !num(v.s) || !(v.s > 0)) return null;
    return { src: v.src, x: v.x, y: v.y, s: v.s, of: v.of };
}
// item 35: what the look of a field's text may hold (lookcore.js): a one-line text takes no size, notes do, neither takes a font; the text
// is at most as long as the field keeps it. null for a field whose value is no text
function lookRule(field) {
    if (!isObj(field) || (field.kind !== 'text' && field.kind !== 'notes')) return null;
    var base = field.kind === 'text' ? LOOK_RULES.LINE : LOOK_RULES.NOTES;
    return { size: base.size, link: base.link, font: false, multi: base.multi, max: field.kind === 'text' ? (field.max || LIMITS.text) : LIMITS.notes };
}
// Item 35: the look of a character's text AS IT STANDS: the cleaned record for the text stored in that field, or undefined (no look, or
// one made for other words). What a sheet draws, and what its text box starts from
function lookOf(field, char) {
    var rule = lookRule(field); if (!rule || !isObj(char) || !isObj(char.values) || !isObj(char.looks) || !hasOwn(char.looks, field.id)) return undefined;
    var v = char.values[field.id]; return typeof v === 'string' ? cleanRec(char.looks[field.id], v, rule) : undefined;
}
// A look record for a text of this field, from a format a text box made: by the field's own rule, or undefined where nothing of it is kept
function lookFor(field, text, fmt) { var rule = lookRule(field); return rule ? makeRec(fmt, '', text, rule) : undefined; }
// The looks of a character's text values, as { fieldId: record }, or null for none: only for a text or notes field of this system, only
// where the value kept beside it is a string, and only a record that is that very text's (the one stale rule: cleanRec). In the
// order of the system's fields, so that two machines keep the same object
function cleanLooks(looks, values, sys) {
    if (!isObj(looks) || !isObj(values) || !sys || !Array.isArray(sys.fields)) return null;
    var out = {}, any = false;
    sys.fields.forEach(function(f) {
        var rule = lookRule(f); if (!rule || !hasOwn(looks, f.id) || typeof values[f.id] !== 'string') return;
        var r = cleanRec(looks[f.id], values[f.id], rule); if (r) { out[f.id] = r; any = true; }
    });
    return any ? out : null;
}
// [split:body-end]
return { AFF_UNITS: AFF_UNITS, ALT_MAX: ALT_MAX, ARC_MAX: ARC_MAX, BADGE_MAX: BADGE_MAX, BLAST_EACH: BLAST_EACH, BLAST_FALL: BLAST_FALL, ENV_BANDS: ENV_BANDS, FACE_PICS: FACE_PICS, HEIGHT_UNITS: HEIGHT_UNITS, HOLD_ALSO: HOLD_ALSO, HOLD_ROLLS: HOLD_ROLLS, MOD_LIM: MOD_LIM, PALETTE_KEYS: PALETTE_KEYS, PL_ID: PL_ID, TERRAIN_MAX: TERRAIN_MAX, affLastsSecs: affLastsSecs, againFold: againFold, arcHolds: arcHolds, arcIn: arcIn, arcKey: arcKey, arcNamed: arcNamed, arcsAny: arcsAny, areaExtra: areaExtra, blastFormula: blastFormula, budgetFormula: budgetFormula, budgetSays: budgetSays, budgetWatch: budgetWatch, budgetsOf: budgetsOf, capsAt: capsAt, catHome: catHome, catPlace: catPlace, catSplits: catSplits, cleanAbout: cleanAbout, cleanAffs: cleanAffs, cleanAlt: cleanAlt, cleanArc: cleanArc, cleanArcs: cleanArcs, cleanBadges: cleanBadges, cleanBlastDefend: cleanBlastDefend, cleanBlastRules: cleanBlastRules, cleanBudgets: cleanBudgets, cleanCloud: cleanCloud, cleanCombat: cleanCombat, cleanDesc: cleanDesc, cleanEffectCore: cleanEffectCore, cleanEntryStats: cleanEntryStats, cleanEnv: cleanEnv, cleanFace: cleanFace, cleanFlies: cleanFlies, cleanFrame: cleanFrame, cleanHeightRules: cleanHeightRules, cleanHolds: cleanHolds, cleanItemKey: cleanItemKey, cleanItemTable: cleanItemTable, cleanJob: cleanJob, cleanJr: cleanJr, cleanListRules: cleanListRules, cleanListSpec: cleanListSpec, cleanLooks: cleanLooks, cleanLvls: cleanLvls, cleanMod: cleanMod, cleanOnTrade: cleanOnTrade, cleanPlaceCats: cleanPlaceCats, cleanReach: cleanReach, cleanSheetStyle: cleanSheetStyle, cleanStack: cleanStack, cleanSubjects: cleanSubjects, cleanSystem: cleanSystem, cleanTerrainKinds: cleanTerrainKinds, cleanTier: cleanTier, cleanValue: cleanValue, cleanWas: cleanWas, critRangeInto: critRangeInto, droppedCounts: droppedCounts, droppedWords: droppedWords, envBands: envBands, envWorst: envWorst, fieldById: fieldById, gmEntryKeys: gmEntryKeys, hasRange: hasRange, heightIn: heightIn, heightModOf: heightModOf, heightOf: heightOf, hitScaleOf: hitScaleOf, holdRefOf: holdRefOf, hudDefault: hudDefault, hudHasContent: hudHasContent, hudOf: hudOf, hudView: hudView, jobBar: jobBar, jobLoad: jobLoad, jobStep: jobStep, jobTurns: jobTurns, jobsEnd: jobsEnd, keyIndex: keyIndex, keyIndexOf: keyIndexOf, limFx: limFx, listJobs: listJobs, listRenames: listRenames, longSize: longSize, lookFor: lookFor, lookOf: lookOf, lookRule: lookRule, lvlClamp: lvlClamp, lvlNum: lvlNum, mapCellIn: mapCellIn, ownLong: ownLong, ownLongOf: ownLongOf, pinTargets: pinTargets, pinTargetsAll: pinTargetsAll, placeVal: placeVal, pruneGroups: pruneGroups, rollFigOf: rollFigOf, rollShowOf: rollShowOf, rowModAim: rowModAim, rowStats: rowStats, rowSubject: rowSubject, rowText: rowText, setOf: setOf, setsOf: setsOf, startStamp: startStamp, statKeys: statKeys, statName: statName, statPicks: statPicks, subjectPlace: subjectPlace, terrainCosts: terrainCosts, terrainKeyFor: terrainKeyFor, terrainKinds: terrainKinds, unheldJudge: unheldJudge, wasHas: wasHas };   // [split:glue]
}   // [split:glue]
