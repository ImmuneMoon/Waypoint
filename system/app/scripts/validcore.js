/* validcore.js: a part of systemcore.js (docs/REFACTOR_SPLIT_PLAN.md, area 5, the validator; split 2026-11-18 with no change in behavior).
   What it holds: what a name a formula reads is in words and what a box may offer (nameWord, nameAsks, readsOf, with the tables
   NAME_WORDS and ROW_SAYS, [formcheck:namewords-*]), a fault said in plain words (plainMessage), and the validator behind the System
   editor (validateSystem: carets, unknown names, dice in definitions, loops, and the warnings Save shows). The cleaners live in
   cleancore.js; what a player receives (projectEffects and after) and the resolver stay in systemcore.js.
   Why it looks this way: these lines stood in systemcore.js, and they still run exactly where they stood. systemcore.js calls
   validCore() at its line `// [split:validcore.js]`, so the body below runs in the old order, after everything above that line and
   before everything below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test
   that reads systemcore.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the
   body uses of systemcore.js; the last line hands back the names systemcore.js uses of it. Neither side may assign the other's names,
   and a name this part assigns again later may not be read outside it, since systemcore.js holds only a copy (tools/splitcheck.js
   holds both). Change the code here as if it still stood in systemcore.js. */
// [split:of systemcore.js]
import { APPLY_KINDS, BLOW_NAMES, DATE_MORE, DATE_NAMES, DEF_PROP, DMG_MORE, ENV_BANDS, FACING_NAMES, HOLD_ROLLS, LIMITS, MOON_PHASES, NAME_SUFFIX, NUMERIC, ROW_WORDS, STAT_KEY, THEN_WHEN, TOKEN_NAMES, affLastsSecs, allRowOk, ansSays, ansShareSays, applyAct, arcNamed, askFind, atSrc, attRowNames, autoKindOf, bandsFor, blowNamed, burstList, calNames, calOf, callSays, capExpr, capTexts, catIn, chamberSrc, crewParts, crewStation, cutText, deckOf, feedOf, feedSpec, fieldById, figVeh, figureField, fitRows, fmtNum, fxLibOf, fxNamed, gmEntryKeys, gmPools, gmViewFields, groupByKey, hasDice, headerEdits, hostWord, isObj, keyIndex, keyIndexOf, labelGmNames, labelHead, landSays, linkByKey, linkFig, listKeyed, listWords, loadSrc, loadSrcAny, locSideKey, locSideRead, lower, lvlClamp, lvlNamed, lvlOnlyHas, lvlOnlyMiss, lvlOnlyOn, lvlStart, map, mapFactorNamed, mapKindByKey, measureKindOf, moneyBoxes, moneyCurNamed, moneyCurs, onBeforeLoop, onOther, ownPostures, partsFromHas, partsSrc, partsSrcs, phaseNamed, pinTargetsAll, placeName, placeNamed, postureList, readsRow, resistOrOk, resultOf, rollEntryOf, rollsKeepScene, sceneByKey, seasonNamed, sheetsAny, sheetsOn, statDefOf, subjectPlace, suggest, tableFam, tableParts, tableRanged, tableRead, tableRowOf, tagOf, targetHitList, targetReadKey, valueDef, valueNamed } from './systemcore.js';   // [split:glue]
export function validCore() {   // [split:glue]
// [split:body-start]
// [formcheck:namewords-start]
// 1.6.2 (the owner, 2026-11-02: "the dice formula shouldnt have to use unfamiliar variables for normal users, too much chance of a mistake", of STRmod, Skill.Stealth and AttemptMargin alike): what a name of a formula is, in words, and which names a box may offer. Nothing here changes what a formula reads: a stored formula still holds the name, and the System editor and the table show these words in its place
var NAME_WORDS = Object.freeze(Object.assign(Object.create(null), {
    attemptmargin: 'how far their attempt beat its target', attackerdark: 'the darkness step where the attacker stands', attackerdarkpen: 'the darkness penalty where the attacker stands', 'attempt.kind': 'the kind of attempt', 'attempt.type': 'the type of attempt',
    rollmargin: 'how far this roll passed or failed by', rollcrit: 'whether this roll was a critical', rollbig: 'whether this roll lands as a heavy hit', rolltotal: 'what this roll came to', natural: 'what the dice alone came to',
    rangemod: 'the range penalty to the target', targetdistance: 'the distance to the target', heightmod: 'the height penalty to the target', heightdiff: 'the height difference to the target', targetsize: 'the target\u2019s size', targetlight: 'the light on the target', targetdark: 'the darkness step at the target', targetdarkpen: 'the darkness penalty at the target', targetloud: 'whether the target is loud', targetcover: 'the target\u2019s cover', targetcovergrade: 'the grade of the target\u2019s cover', targetcoverpro: 'the Protection of the target\u2019s cover', targetbodycover: 'how much a body in the way hides the target', bodysize: 'the size of the body in the way',
    'target.reaction': 'the target\u2019s reaction this scene', 'target.postureranged': 'the target\u2019s posture penalty', 'target.aimed': 'whether the shot was aimed', 'target.coverorposture': 'the target\u2019s cover or posture',
    resist: 'what it is resisted against', 'held.count': 'how many stand there',
    posture: 'the token\u2019s posture', elevation: 'the token\u2019s height', combatround: 'the round of the fight', movedthisturn: 'whether its token has moved this turn', making: 'whether the character is being made',
    facing: 'which way the token faces', arc: 'the side it is being attacked from', 'arc.front': 'whether it is attacked from the front', 'arc.side': 'whether it is attacked from the side', 'arc.rear': 'whether it is attacked from behind', threats: 'how many threats it faces', 'threats.front': 'the threats in front of it', 'threats.side': 'the threats beside it', 'threats.rear': 'the threats behind it', 'target.inarc': 'whether the target stands in this row\u2019s arc',
    'date.year': 'the year', 'date.day': 'the day of the month', 'date.days': 'the days passed', 'date.hour': 'the hour', 'date.minute': 'the minute', 'date.season': 'the season',
    onself: 'whether it is used on the user', crossstep: 'which step was crossed', crossed: 'how many steps were crossed', effectnumber: 'the number the effect held',
    'blow.dmg': 'the damage rolled', 'blow.through': 'the damage past DR', 'blow.wound': 'the wound it dealt', 'blow.first': 'what was taken first, before the wound', 'blow.type': 'the damage type', 'blow.cuts': 'whether the blow cuts', 'blow.major': 'whether it is a Major Wound', 'blow.big': 'whether the attack landed as a heavy hit', 'blow.kind': 'the kind of blow',
    'blow.type2': 'the second part\u2019s damage type', 'blow.wound2': 'the second part\u2019s wound', 'blow.kind2': 'the second part\u2019s kind', 'blow.type3': 'the third part\u2019s damage type', 'blow.wound3': 'the third part\u2019s wound', 'blow.kind3': 'the third part\u2019s kind', 'blow.type4': 'the fourth part\u2019s damage type', 'blow.wound4': 'the fourth part\u2019s wound', 'blow.kind4': 'the fourth part\u2019s kind', 'blow.type5': 'the fifth part\u2019s damage type', 'blow.wound5': 'the fifth part\u2019s wound', 'blow.kind5': 'the fifth part\u2019s kind',
    blastdistance: 'the distance from the blast', blastdice: 'the dice of the blast', blastdamage: 'the damage of the blast', direct: 'whether it was struck directly', centre: 'whether it stands at the center', blastfills: 'how much of the area it fills', blastradius: 'the item\u2019s own radius, in yards', mapcell: 'one cell of the map', hitscale: 'the scale of the one it hits', blastnodrop: 'whether its damage keeps its strength', blastscale: 'the scale of the item that went off', fragdice: 'the fragmentation dice', throwskill: 'the skill it is thrown with', throwdistance: 'the distance of the throw', margin: 'how far it failed by', distance: 'the distance',
    listed: 'its listed figure', worn: 'what is worn off it', todestroy: 'the wear that destroys it', divisor: 'the blow\u2019s armor divisor'
}));
var ROW_SAYS = Object.freeze(Object.assign(Object.create(null), {
    count: 'how many of this row', qty: 'this row\u2019s quantity', on: 'whether this row is on', has: 'whether this row is held', lvl: 'this row\u2019s level', paid: 'what this row cost', loaded: 'what this row has loaded', loadmax: 'the most this row can load', chambered: 'how many rounds this row has chambered', setall: 'whether this row\u2019s whole set is on', parts: 'how many parts this row holds', again: 'whether this row is held under another name', needsmet: 'whether this row\u2019s needs are met', startlvl: 'the level this row started at', bursthits: 'the hits of this burst', side: 'this row\u2019s side', subject: 'this row\u2019s subject', fitted: 'whether this row is fitted', pastslot: 'whether this row stands past what its host holds', covered: 'the places a higher layer covers on this row', onplace: 'this row\u2019s place among the rows switched on', once: 'whether this row counts', oncecost: 'what this row costs', oncefree: 'what this row gives free', paysback: 'whether this row pays back', granted: 'whether this row was granted', made: 'whether this row was made here'
}));
// 1.6.3 Layers under a list's places: whether a list's switch goes by where rows sit and has a layer formula (as systemcore.js reads it, read here from
// the spec itself so this part needs no new import), so Row.covered is known on it
function layered(sp) { return isObj(sp) && isObj(sp.on) && typeof sp.on.over === 'string' && !!sp.on.over && typeof sp.on.layer === 'string' && !!sp.on.layer; }
function humanName(s) { return String(s).split('.').join(' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2'); }
function capWord(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
function fieldWord(f) { return isObj(f) && typeof f.label === 'string' && f.label ? f.label : humanName(isObj(f) ? f.key : ''); }
function statWord(spec, w) {   // a stat, a column or a counter of a list, by its label
    var l = lower(w), hit = null; ['stats', 'cols', 'counters'].forEach(function(k) { (isObj(spec) && Array.isArray(spec[k]) ? spec[k] : []).forEach(function(x) { if (!hit && isObj(x) && typeof x.key === 'string' && lower(x.key) === l) hit = x; }); });
    return hit ? (typeof hit.label === 'string' && hit.label ? hit.label : humanName(hit.key)) : '';
}
function entryWord(sys, k) { var l = lower(k), hit = null; (Array.isArray(sys.items) ? sys.items : []).concat(Array.isArray(sys.core) ? sys.core : []).forEach(function(it) { if (!hit && isObj(it) && typeof it.key === 'string' && lower(it.key) === l) hit = it; }); return hit && typeof hit.name === 'string' && hit.name ? hit.name : humanName(k); }
function listWord(sys, f, p) {   // what follows a list's key
    var spec = isObj(f.list) ? f.list : {}, L = fieldWord(f), a = lower(p[0]), last = p[p.length - 1], W = statWord(spec, last) || humanName(last);
    if (p.length === 1) return a === 'count' ? 'how many rows of ' + L : a === 'qty' ? 'how many ' + L + ' in all' : a === 'paid' ? 'what ' + L + ' cost' : 'the total ' + W + ' of ' + L;
    if (p.length === 2 && a === 'on') return lower(last) === 'count' ? 'how many rows of ' + L + ' are switched on' : lower(last) === 'qty' ? 'how many ' + L + ' are switched on' : 'the total ' + W + ' of ' + L + ' switched on';
    if (p.length === 2 && (a === 'max' || a === 'min')) return 'the ' + (a === 'max' ? 'highest ' : 'lowest ') + W + ' in ' + L;
    if (p.length === 3 && a === 'on' && (lower(p[1]) === 'max' || lower(p[1]) === 'min')) return 'the ' + (lower(p[1]) === 'max' ? 'highest ' : 'lowest ') + W + ' in ' + L + ' switched on';
    if (p.length === 2) { var rwE = entryWord(sys, p[0]) + ' in ' + L, rwW = ROW_SAYS_OF[lower(last)]; return rwW ? rwW(rwE) : W + ' of ' + rwE; }   // 1.6.3 (finding 18): a row's own words said as what they ask, never has of Temper
    return humanName(p.join('.'));
}
// 1.6.3 (the review of the System editor, finding 18): what a name says of one entry of a list where it ends in a row's own word, in plain words.
// A list's stat can never be keyed one of these (a stat's short name refuses the row's words), so they never stand for a stat
var ROW_SAYS_OF = { has: function(e) { return 'whether they hold ' + e; }, lvl: function(e) { return 'the level of ' + e; }, qty: function(e) { return 'how many of ' + e + ' they hold'; }, on: function(e) { return 'whether ' + e + ' is switched on'; }, paid: function(e) { return 'what ' + e + ' cost'; }, count: function(e) { return 'how many rows of ' + e + ' they hold'; } };
function nameWord(sys, name, rowSpec) {
    var s = String(name), l = lower(s); if (!isObj(sys) || !Array.isArray(sys.fields)) return humanName(s);
    var ix = keyIndexOf(sys); if (ix[l]) return fieldWord(ix[l]);
    var fgW = figureField(ix, l); if (fgW) return fieldWord(fgW) + (measureKindOf(fgW) === 'height' ? ' in inches' : ' in pounds');   // 1.6.2 (auto apply)
    var m = /^(.+)\.(max|cur|full|ranks|base)$/.exec(s), mf = m ? ix[lower(m[1])] : null;
    if (mf) { var L = fieldWord(mf); return m[2] === 'max' ? L + ' when full' : m[2] === 'cur' ? L + ' now' : m[2] === 'full' ? 'whether ' + L + ' is full' : m[2] === 'ranks' ? L + ' ranks' : L + ' base'; }
    var naW = /^(arc|threats)\.([^.]+)$/.exec(l), naA = naW && !ix[naW[1]] && isObj(sys.combat) ? arcNamed(sys.combat.arcs, naW[2]) : null; if (naA) return naW[1] === 'arc' ? 'whether it is attacked from its ' + naA.label + ' arc' : 'the threats in its ' + naA.label + ' arc';   // 1.6.2 (vehicles, fold (b), rebuilt): an arc the system names
    if (NAME_WORDS[l]) return NAME_WORDS[l];
    if (l.length > 4 && l.indexOf('ask.') === 0) { var ak0 = askFind(sys, l.slice(4)); return ak0 ? 'their answer to \u201c' + ak0.label + '\u201d' : 'their answer'; }   // 1.6.2
    if ((l === 'money' || l.slice(0, 6) === 'money.') && !ix.money && moneyBoxes(sys).length) { if (l === 'money') return 'the money they hold'; var cuW = moneyCurNamed(sys, l.slice(6)); if (!cuW && l === 'money.weight') return 'what the money they hold weighs'; return (cuW ? cuW.label : humanName(s.slice(6))) + ' they hold'; }   // 157 M1
    var tpW = l.indexOf('table.') === 0 && tableFam(sys, ix) ? tableParts(l) : null;   // 1.6.2 (found building a system by hand): a table read in words, its column, its table, and what finds the row
    if (tpW) { var ttW = (Array.isArray(sys.tables) ? sys.tables : []).filter(function(t) { return isObj(t) && typeof t.key === 'string' && lower(t.key) === tpW.k; })[0]; if (ttW) { var tcW = (Array.isArray(ttW.cols) ? ttW.cols : []).filter(function(c) { return isObj(c) && lower(c.key) === tpW.col; })[0], cW = tcW ? (tcW.label || tcW.key) : humanName(tpW.col), tW = ttW.label || ttW.key; if (tpW.by !== undefined) return cW + ' in ' + tW + ', by ' + nameWord(sys, tpW.by, rowSpec); var trW = tableRowOf(ttW, tpW.row); return cW + ' of ' + (trW ? trW.label || trW.key : humanName(tpW.row)) + ' in ' + tW; } }
    if (l.length > 4 && l.indexOf('env.') === 0 && !ix.env) { var enW = (Array.isArray(sys.env) ? sys.env : []).filter(function(e) { return isObj(e) && typeof e.key === 'string' && lower(e.key) === l.slice(4); })[0]; return (enW ? lower(String(enW.label || enW.key)) : 'a reading') + ' where it goes off'; }   // 1.6.2: an Environment reading a blast reads
    var p = s.split('.'), fam = lower(p[0]), rest = p.slice(1), one = rest.join('.'), held = function() { var f = ix[lower(one)]; return f ? fieldWord(f) : humanName(one); };
    if (rest.length && !ix[fam]) {
        if ((fam === 'owner' || fam === 'holder') && sheetsAny(sys) && !linkByKey(sys)[fam] && !groupByKey(sys)[fam]) {   // 1.6.2: a joined sheet's row and its owner
            if (lower(one) === 'has') return 'whether a row holds this sheet';
            if (fam === 'owner') return 'its owner\u2019s ' + held();
            var hsW = ''; sys.fields.forEach(function(f) { if (!hsW && isObj(f) && f.kind === 'item-list' && sheetsOn(f.list)) hsW = statWord(f.list, one); }); return 'the row that holds it: ' + (hsW || humanName(one));
        }
        if (fam === 'target' && lower(rest[0]) === 'arc' && rest.length === 2) { var taW = arcNamed(isObj(sys.combat) ? sys.combat.arcs : null, rest[1]); return 'whether you stand in the target\u2019s ' + (taW ? taW.label : humanName(rest[1])); }   // 1.6.2 (13)
        if (fam === 'blow' && lower(rest[0]) === 'arc' && rest.length === 2) { var baW = arcNamed(isObj(sys.combat) ? sys.combat.arcs : null, rest[1]); return 'whether the blow came from the target\u2019s ' + (baW ? baW.label : humanName(rest[1])); }
        if (fam === 'target' && lower(rest[0]) === 'marked' && rest.length === 2) { var tgW = tagOf(sys, rest[1]); return 'whether you hold ' + (tgW ? tgW.label : humanName(rest[1])) + ' on the target'; }   // 1.6.2 (vehicles, fold (c))
        if (fam === 'marked' && rest.length === 1) { var tgV = tagOf(sys, rest[0]); return 'whether ' + (tgV ? tgV.label : humanName(rest[0])) + ' is held on them'; }
        if (fam === 'mapkind' && rest.length === 1) { var mkW = mapKindByKey(sys, rest[0]); return 'whether the map is ' + (mkW ? mkW.label : humanName(rest[0])) + ' scale'; }   // 1.6.2 (vehicles, fold (g))
        if (fam === 'scene' && rest.length === 1) { var scW = sceneByKey(sys, rest[0]); return 'whether the scene is ' + (scW ? scW.label : humanName(rest[0])); }   // 1.6.2
        if (fam === 'mapfactor' && rest.length === 1) { var mfW = mapFactorNamed(sys, rest[0]); return 'the map\u2019s ' + (mfW ? mfW.label : humanName(rest[0])) + ' factor'; }
        if (fam === 'target' && lower(rest[0]) === 'hit' && rest.length > 1) { var tf = targetHitList(sys), tw = tf ? statWord(tf.list, rest[1]) : ''; return 'the called location\u2019s ' + (tw || humanName(rest[1])); }
        if (fam === 'target') return 'the target\u2019s ' + held();
        if (fam === 'attempter' && lower(rest[0]) === 'row' && rest.length === 2) { var awL = ''; sys.fields.forEach(function(f) { if (!awL && isObj(f) && f.kind === 'item-list' && isObj(f.list)) (Array.isArray(f.list.stats) ? f.list.stats : []).concat(Array.isArray(f.list.cols) ? f.list.cols : []).forEach(function(x) { if (!awL && isObj(x) && typeof x.key === 'string' && lower(x.key) === lower(rest[1])) awL = x.label || x.key; }); }); return 'the ' + (awL || humanName(rest[1])) + ' of the attacking row'; }   // 1.6.2 (7)
        if (fam === 'attempter') return 'their ' + held();
        if (fam === 'presser') return 'the presser\u2019s ' + held();
        if (fam === 'on') return held() + ' of the one it is used on';
        if (fam === 'shared') { var vdW = valueDef(sys, one); return vdW ? vdW.label : humanName(one); }   // 1.6.2 (G8)
        if (fam === 'fx' && rest.length === 2) { var fxW = fxNamed(sys, l); if (fxW) return (fxW.name || 'an effect') + (lower(rest[1]) === 'on' ? ' is on' : '\u2019s number'); }   // 1.6.2
        if (fam === 'deck') { var dkW = deckOf(sys.decks, rest[0]); if (!dkW) return humanName(one); var dwR = rest.slice(1), dsW = dwR[0] === 'last' ? dkW.stats.filter(function(s) { return lower(s.key) === lower(String(dwR[1])); })[0] : null; if (dwR[0] === 'drawn') { var dhW = dwR[1] === 'high' || dwR[1] === 'low' ? dwR[1] : '', dsN = dkW.stats.filter(function(s) { return lower(s.key) === lower(String(dwR[dhW ? 2 : 1])); })[0]; return dwR.length === 1 ? 'How many were drawn from ' + dkW.label : dsN ? dkW.label + ': ' + (dhW === 'high' ? 'the highest ' + dsN.label + ' drawn' : dhW === 'low' ? 'the lowest ' + dsN.label + ' drawn' : dsN.label + ' of all drawn, added up') : dkW.label; } return dwR[0] === 'left' ? 'What is left of ' + dkW.label : dwR[0] === 'discard' ? 'The discard of ' + dkW.label : dsW ? dkW.label + ': ' + dsW.label + ' of the last drawn' : dkW.label; }   // 1.6.2 (G9)
        if (fam === 'at' || fam === 'tile') { var stS = isObj(rowSpec) && isObj(rowSpec.stand) ? fieldById(sys, rowSpec.stand.from) : null; return (fam === 'at' ? 'the place it stands: ' : 'the place it might reach: ') + ((stS && statWord(stS.list, one)) || humanName(one)); }   // 1.6.2 (body fold 2)
        if (fam === 'here') { var hf0 = ix[lower(rest[0])], hw0 = hf0 ? fieldWord(hf0) : humanName(rest[0]), hn0 = lower(rest[1] || ''); return hn0 === 'count' ? 'how many of ' + hw0 + ' stand here' : (hn0 === 'sum' ? 'the total of ' : hn0 === 'max' ? 'the highest ' : 'the lowest ') + ((hf0 && statWord(hf0.list, rest[2] || '')) || humanName(rest[2] || '')) + ' of ' + hw0 + ' standing here'; }
        if (fam === 'hit' || fam === 'host' || fam === 'row') {
            var wl = lower(rest[0]); if (fam === 'row' && ROW_SAYS[wl] && rest.length === 1 && !(isObj(rowSpec) && listKeyed(rowSpec, wl))) return ROW_SAYS[wl];   // 1.6.4 (the review of Row.onPlace, point (c)): a list's own stat or column of that name is said as itself, as the resolver reads it
            if (fam === 'row' && wl === 'up' && rest.length === 2) return 'the row it hangs from: ' + (statWord(rowSpec, rest[1]) || humanName(rest[1]));   // 1.6.2 (body fold 1)
            if (fam === 'row' && wl === 'onbefore' && rest.length === 2) return 'the total ' + (statWord(rowSpec, rest[1]) || humanName(rest[1])) + ' of the rows switched on before this one';   // 1.6.4
            if (fam === 'row' && wl === 'sheet' && rest.length >= 2 && sheetsOn(rowSpec)) return lower(rest[1]) === 'has' && rest.length === 2 ? 'whether it is joined to a sheet' : 'its sheet\u2019s ' + nameWord(sys, rest.slice(1).join('.'));   // 1.6.2 (vehicles, fold (a))
            var spec0 = fam === 'row' ? rowSpec : fam === 'hit' && isObj(sys.combat) && isObj(sys.combat.damage) && isObj(sys.combat.damage.locs) ? (fieldById(sys, sys.combat.damage.locs.list) || {}).list : null, sw = statWord(spec0, rest[rest.length - 1]);
            if (!sw) sys.fields.forEach(function(f) { if (!sw && isObj(f) && f.kind === 'item-list') sw = statWord(f.list, rest[rest.length - 1]); });
            return (fam === 'row' ? 'this row\u2019s ' : fam === 'host' ? 'the host row\u2019s ' : 'the location\u2019s ') + (sw || humanName(one));
        }
        if (fam === 'posture') { var pw = ''; postureList(sys).forEach(function(x) { if (!pw && isObj(x) && (lower(x.id) === lower(one) || lower(x.name) === lower(one))) pw = x.name; }); return pw || humanName(one); }
        if (fam === 'type' || fam === 'kind') { var dr = isObj(sys.combat) && isObj(sys.combat.damage) ? sys.combat.damage : {}, tw2 = ''; (Array.isArray(dr[fam === 'type' ? 'types' : 'kinds']) ? dr[fam === 'type' ? 'types' : 'kinds'] : []).forEach(function(x) { if (!tw2 && isObj(x) && lower(x.key) === lower(one)) tw2 = x.label || x.key; }); return tw2 || humanName(one); }
        if (fam === 'place' || fam === 'value' || fam === 'table') return humanName(one);
        if (fam === 'season' && rest.length === 1) { var snW = seasonNamed(sys, one); return snW ? (calOf(sys).seasons[snW - 1].name) : humanName(one); }   // 1.6.2 (backlog 147): a season by its own name
        if (fam === 'moon' && rest.length === 1) { var phW = phaseNamed(one); return phW ? MOON_PHASES[phW - 1].toLowerCase() : humanName(one); }   // ... and a phase in words
        if (fam === 'date' && /^moon[234]?$/.test(lower(one))) { var mnI = lower(one) === 'moon' ? 0 : parseInt(lower(one).slice(4), 10) - 1, mnD = (calOf(sys).moons || [])[mnI]; return 'the phase of ' + (mnD ? mnD.name : 'moon ' + (mnI + 1)); }
        if (ix[fam] === undefined) { var lk = null; (Array.isArray(sys.links) ? sys.links : []).forEach(function(k) { if (!lk && isObj(k) && typeof k.key === 'string' && lower(k.key) === fam) lk = k; }); if (lk) return 'the ' + (lk.label || humanName(lk.key)) + '\u2019s ' + held(); }
    }
    if (rest.length && ix[fam] && ix[fam].kind === 'item-list') return listWord(sys, ix[fam], rest);
    return humanName(s);
}
// a name that depends on the moment and not on the sheet, which Try it asks for by a number
function nameAsks(sys, name) {
    var s = String(name), l = lower(s); if (!isObj(sys) || !Array.isArray(sys.fields)) return false;
    var ix = keyIndexOf(sys); if (ix[l] || /\.(max|cur|full|ranks|base)$/.test(l) && ix[l.replace(/\.[a-z]+$/, '')]) return false;
    var fam = l.split('.')[0]; return NAME_WORDS[l] !== undefined || (!ix[fam] && l.indexOf('.') > 0 && ['target', 'attempter', 'on', 'presser', 'hit', 'host', 'row', 'blow', 'ask'].indexOf(fam) >= 0);
}
// 1.6.2 (the owner, of a message that spoke of what a formula knows: "this isnt readable for a normal user either"): a fault as the System editor says it. validateSystem's own text stays what suites and tools read; this is its one reading for a person, so a new message gets its names in words by itself
function plainMessage(sys, text) {
    var s = String(text === undefined || text === null ? '' : text), w = function(n) { return nameWord(sys, n); }, m = /^Unknown name "([^"]+)"(?:(?: \u2014 did you mean|\. Did you mean) "([^"]+)"\?|\.)?$/.exec(s);   /* the review of the words (1.6.3): the formula engine ends one with no suggestion in a full stop, as a worked-out field fault reads it */
    if (m) return '\u201c' + humanName(m[1]) + '\u201d is nothing on this sheet.' + (m[2] ? ' Did you mean ' + w(m[2]) + '?' : '');
    m = /^((?:.*: )?)Formulas refer to each other in a loop: (.+)$/.exec(s);   // 1.6.4: a column's loop is said on its list led by the column (Column \u201cM\u201d: ...), and that lead is kept
    if (m) return m[1] + 'These each need the other, so none of them can be worked out: ' + m[2].split(' \u2192 ').map(w).join(', then ') + '.';
    s = s.replace(/This roll tests nothing \(no comparison, like [^)]*\), so /, 'This roll has nothing to beat, so ');
    s = s.replace('Dice are not allowed in a definition; put the dice in a roll.', 'This cannot roll dice. Dice go in a roll.');
    s = s.replace(/^((?:.*: )?)Missing formula$/, '$1Nothing is set here yet.');   // 1.6.2 (found building a system by hand): a box left empty, said in words
    s = s.replace('An amount cannot roll dice: roll first, and let the amount read the field the result goes in.', 'This amount cannot roll dice unless it is ticked Rolled.');
    s = s.replace(/^"([^"]+)" is a (choice|counter), so it has no (.+?): read one row \([^)]*\)\.$/, function(all, n, what, none) { var p = n.split('.'), lf = keyIndexOf(sys)[lower(p[0])], last = p[p.length - 1], lab = lf ? statWord(lf.list, last) : ''; return (lab ? lab + ' in ' + fieldWord(lf) : humanName(n)) + ' is a ' + what + ', so it has no ' + none + '.'; });
    s = s.replace(/^"([^"]+)" is known only in /, function(all, n) { return capWord(w(n)) + ' can only be read in '; }).replace(/^"([^"]+)" is known only where /, function(all, n) { return capWord(w(n)) + ' can only be read where '; });
    s = s.replace(/^No item in (.+?) has the key "([^"]+)"(?:\. "[^"]+" then finds only rows whose own name says it, and with none it reads as not carried\.|: (it reads as not carried until a row its player can see has it\.))$/, function(all, list, key, tail) { return 'No entry of ' + list + ' is named \u201c' + humanName(key) + '\u201d. ' + (tail ? 'It reads as not carried until a row its player can see has it.' : 'It then finds only rows whose own name says it, and with none it reads as not carried.'); });   // 1.6.3 (finding 18)
    s = s.replace(/Stat (?:\u201c([^\u201d]+)\u201d|"([^"]+)")/g, function(all, a, b) { var k = a || b, lab = ''; (Array.isArray(sys && sys.fields) ? sys.fields : []).forEach(function(f) { if (!lab && isObj(f) && f.kind === 'item-list') lab = statWord(f.list, k); }); return lab || all; });
    return s.replace(/"([A-Za-z_][A-Za-z0-9_.]*)"/g, function(all, n) { var x = w(n); return x === humanName(n) ? all : '\u201c' + x + '\u201d'; });
}
// which rolls the damage step posts, so which read the blow: the validator's blowRolls
function blowRollIds(sys) { var o = map(), d = isObj(sys.combat) && isObj(sys.combat.damage) ? sys.combat.damage : null; if (d) { (Array.isArray(d.onMajor) ? d.onMajor : [d.onMajor]).concat(Array.isArray(d.onWound) ? d.onWound : []).forEach(function(w) { if (isObj(w) && typeof w.roll === 'string') o[w.roll] = 1; }); } return o; }
// the groups of what a box may read: { name, items: [{ label, s }] }. ctx.roll the roll or action it belongs to, ctx.then a box of its Then
// 1.6.2 (167 D): the names whose words a test may read: a text, a choice, a number with value names; in a list's box its row's choices too
function wordsReads(sys, ctx, ix, W) {
    var out = [], me = [], rw = [];
    sys.fields.forEach(function(f) { if (isObj(f) && typeof f.key === 'string' && f.key && f.key.indexOf('.') < 0 && (f.kind === 'text' || f.kind === 'select' || ((f.kind === 'number' || f.kind === 'formula') && Array.isArray(f.labels) && f.labels.length))) me.push(f.key); });
    if (isObj(ctx.list) && !ix.row) {
        (Array.isArray(ctx.list.stats) ? ctx.list.stats : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string' && x.key && ((x.kind === 'pick' && Array.isArray(x.opts) && x.opts.length) || (x.kind !== 'pick' && Array.isArray(x.labels) && x.labels.length))) rw.push('Row.' + x.key); });
        (Array.isArray(ctx.list.cols) ? ctx.list.cols : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string' && x.key && Array.isArray(x.labels) && x.labels.length) rw.push('Row.' + x.key); });
    }
    if (rw.length) out.push({ name: 'This row', items: rw.map(W) });
    if (me.length) out.push({ name: 'This character', items: me.map(W) });
    return out;
}
function readsOf(sys, ctx) {
    var out = []; if (!isObj(sys) || !Array.isArray(sys.fields)) return out;
    ctx = isObj(ctx) ? ctx : {}; var ix = keyIndexOf(sys), r = isObj(ctx.roll) && ctx.crossStep !== true ? ctx.roll : null, W = function(s) { return { label: capWord(nameWord(sys, s, ctx.list)), s: s }; };   // 1.6.2 (the review of backlog 242): a crossing's own steps (ctx.crossStep, which sheets.js formCtx sets) are read on the sheet as it stands, so they are offered nothing of the roll's own moment, as the validator refuses it there
    if (Array.isArray(ctx.only)) return ctx.words ? [] : [{ name: 'What this can read', items: ctx.only.map(W) }];   // a box with names of its own and no other
    if (ctx.words === true) return wordsReads(sys, ctx, ix, W);   // 1.6.2 (167 D): what is() and contains() may read
    var free = function(n) { var h = lower(n.split('.')[0]); return !ix[lower(n)] && !ix[h]; }, group = function(name, names) { var its = names.filter(Boolean).map(W); if (its.length) out.push({ name: name, items: its }); };
    var me = [], lists = [];
    sys.fields.forEach(function(f) {
        if (!isObj(f) || typeof f.key !== 'string' || !f.key) return;
        if (NUMERIC[f.kind]) { me.push(f.key); if (f.kind === 'resource') me.push(f.key + '.max'); return; }
        if (measureKindOf(f)) { me.push(f.key + '.figure'); return; }   // 1.6.2 (auto apply): a height or a weight, as a figure
        if (f.kind !== 'item-list' || f.key.indexOf('.') >= 0 || !isObj(f.list)) return;
        var sp = f.list, nums = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(x) { return isObj(x) && typeof x.key === 'string' && x.kind !== 'pick'; }).concat((Array.isArray(sp.cols) ? sp.cols : []).filter(function(x) { return isObj(x) && typeof x.key === 'string'; })), ns = [f.key + '.count', f.key + '.qty'];
        nums.forEach(function(x) { ns.push(f.key + '.' + x.key); }); if (isObj(sp.on)) { ns.push(f.key + '.on.count'); nums.forEach(function(x) { ns.push(f.key + '.on.' + x.key); }); }
        nums.forEach(function(x) { ns.push(f.key + '.max.' + x.key, f.key + '.min.' + x.key); });
        lists.push({ name: fieldWord(f), ns: ns });
    });
    if (isObj(ctx.list)) {   // what a box of a list reads of its row
        var sp0 = ctx.list, rw = []; if (isObj(sp0.lvl)) rw.push('Row.lvl'); rw.push('Row.qty'); if (isObj(sp0.on)) rw.push('Row.on'); if (sp0.price) rw.push('Row.paid');
        ['stats', 'cols', 'counters'].forEach(function(k) { (Array.isArray(sp0[k]) ? sp0[k] : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string' && x.key && (k !== 'stats' || x.kind !== 'pick' || (Array.isArray(x.opts) && x.opts.length))) rw.push('Row.' + x.key); }); });
        var lfO = sys.fields.filter(function(x) { return isObj(x) && x.list === sp0; })[0]; if (lfO && sys.fields.some(function(hf) { return isObj(hf) && hf.kind === 'item-list' && isObj(hf.list) && isObj(hf.list.parts) && partsFromHas(hf.list.parts, lfO.id); })) rw.push('Row.fitted', 'Row.pastSlot');   // 1.6.2: a part's place in its host
        if (layered(sp0) && !listKeyed(sp0, 'covered')) rw.push('Row.covered');   // 1.6.3 Layers: the places a higher layer covers
        if (isObj(sp0.on) && !listKeyed(sp0, 'onplace')) rw.push('Row.onPlace');   // 1.6.4: its place among the rows switched on
        if (!ix.row) group('This row', rw);
        if (isObj(sp0.on) && !ix.row) { var obN = []; ['stats', 'cols'].forEach(function(k) { (Array.isArray(sp0[k]) ? sp0[k] : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string' && x.key && (k !== 'stats' || x.kind !== 'pick')) obN.push('Row.onBefore.' + x.key); }); }); if (obN.length) group('The rows switched on before it', obN); }   // 1.6.4: a figure added up over them
        if (isObj(sp0.arc) && !ix.target) group('Its arc', ['Target.inArc']);   // 1.6.2 (vehicles, fold (b))
        var stT = isObj(sp0.stand) ? fieldById(sys, sp0.stand.from) : null; if (stT && !ix.at && isObj(stT.list)) { var atN = []; ['stats', 'cols'].forEach(function(k) { (Array.isArray(stT.list[k]) ? stT.list[k] : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string' && x.key) atN.push('At.' + x.key); }); }); if (atN.length) group('The place it stands', atN); if (ctx.reach && !ix.tile) { var tlN = atN.map(function(n) { return 'Tile.' + n.slice(3); }); if (tlN.length) group('The place it might reach', tlN); } }   // 1.6.2 (body fold 2)
        if (sp0.hang === true && !ix.row) { var upN = []; ['stats', 'cols'].forEach(function(k) { (Array.isArray(sp0[k]) ? sp0[k] : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string' && x.key) upN.push('Row.up.' + x.key); }); }); if (upN.length) group('The row it hangs from', upN); }   // 1.6.2 (body fold 1)
        if (sheetsOn(sp0) && !ix.row) { var shN = ['Row.sheet.has']; sys.fields.forEach(function(f) { if (shN.length < 61 && isObj(f) && typeof f.key === 'string' && f.key && (f.kind === 'number' || f.kind === 'formula' || f.kind === 'resource' || f.kind === 'toggle')) shN.push('Row.sheet.' + f.key); }); group('Its sheet', shN); }   // 1.6.2 (vehicles, fold (a))
    }
    if (r && Array.isArray(r.asks) && !ctx.only) group('What they answered', r.asks.filter(function(a) { return isObj(a) && typeof a.key === 'string' && a.key; }).map(function(a) { return 'Ask.' + a.key; }));   // 1.6.2
    if (Array.isArray(ctx.more) && ctx.more.length) group('For this', ctx.more);
    group('This character', me);
    if (sheetsAny(sys) && !ctx.row && !ix.owner && !linkByKey(sys).owner) { var owN = ['Owner.has']; sys.fields.forEach(function(f) { if (owN.length < 61 && isObj(f) && typeof f.key === 'string' && f.key && (f.kind === 'number' || f.kind === 'formula' || f.kind === 'resource' || f.kind === 'toggle' || f.kind === 'skill')) owN.push('Owner.' + f.key); }); group('Its owner', owN); }   // 1.6.2: a joined sheet's owner
    if (sheetsAny(sys) && !ctx.row && !ix.holder && !linkByKey(sys).holder) { var hoN = []; sys.fields.forEach(function(f) { if (!isObj(f) || f.kind !== 'item-list' || !sheetsOn(f.list)) return; ['stats', 'cols'].forEach(function(k) { (Array.isArray(f.list[k]) ? f.list[k] : []).forEach(function(x) { if (hoN.length < 60 && isObj(x) && typeof x.key === 'string' && x.key && hoN.indexOf('Holder.' + x.key) < 0) hoN.push('Holder.' + x.key); }); }); }); if (hoN.length) group('The row that holds it', hoN); }
    if (!ctx.only && tableFam(sys, ix) && Array.isArray(sys.tables)) (function() {   // 1.6.2 (found building a system by hand): a table's columns, each read by what finds its row, so no one types a table's name
        var tn = []; sys.tables.forEach(function(t) {
            if (!isObj(t) || typeof t.key !== 'string' || !t.key || !Array.isArray(t.cols) || tn.length >= 120) return;
            var cs = t.cols.filter(function(c) { return isObj(c) && typeof c.key === 'string' && c.key; }), rs = Array.isArray(t.rows) ? t.rows.filter(isObj) : [], ranged = tableRanged(t), by = [];
            var rw = rs.map(function(r) { return ' ' + lower(String(r.label || r.key || '')).replace(/[^a-z0-9]+/g, ' ') + ' '; }).join('|'), named = function(f) { if (!isObj(f)) return false; var w = lower(String(f.label || f.key)).replace(/[^a-z0-9]+/g, ' ').trim(); return !!w && rw.indexOf(' ' + w + ' ') >= 0; };   // a value the rows name (Level 1 names Level) comes first
            sys.fields.filter(named).concat(sys.fields.filter(function(f) { return !named(f); })).forEach(function(f) {
                if (!isObj(f) || typeof f.key !== 'string' || !f.key || f.key.indexOf('.') >= 0 || by.length >= 6) return;
                if (ranged ? NUMERIC[f.kind] : (f.kind === 'select' && (Array.isArray(f.options) ? f.options : []).some(function(o) { return !!tableRowOf(t, typeof o === 'string' ? o : isObj(o) ? o.label : ''); }))) by.push(f.key);
            });
            if (isObj(ctx.list)) ['stats'].forEach(function(k) { (Array.isArray(ctx.list[k]) ? ctx.list[k] : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string' && x.key && by.length < 8 && (ranged ? x.kind !== 'pick' : x.kind === 'pick')) by.push('Row.' + x.key); }); });
            cs.forEach(function(c) { by.forEach(function(b) { tn.push('Table.' + t.key + '.by.' + b + '.' + c.key); }); if (rs.length * cs.length <= 24) rs.forEach(function(r) { if (typeof r.key === 'string' && r.key) tn.push('Table.' + t.key + '.' + r.key + '.' + c.key); }); });
        });
        group('Tables', tn.slice(0, 120));
    })();
    if (!ix.deck) group('Decks', [].concat.apply([], (Array.isArray(sys.decks) ? sys.decks : []).filter(function(v) { return isObj(v) && typeof v.key === 'string'; }).map(function(v) { return ['Deck.' + v.key + '.left', 'Deck.' + v.key + '.discard'].concat((Array.isArray(v.stats) ? v.stats : []).map(function(s) { return 'Deck.' + v.key + '.last.' + s.key; }), ['Deck.' + v.key + '.drawn'], [].concat.apply([], (Array.isArray(v.stats) ? v.stats : []).map(function(s) { return ['Deck.' + v.key + '.drawn.' + s.key, 'Deck.' + v.key + '.drawn.high.' + s.key, 'Deck.' + v.key + '.drawn.low.' + s.key]; }))); })));   // 1.6.2 (G9)
    if (!ix.money && !linkByKey(sys).money && !groupByKey(sys).money && moneyBoxes(sys).length) group('Money', ['Money'].concat(moneyCurs(sys).map(function(c) { return 'Money.' + c.key; })).concat(moneyCurs(sys).some(function(c) { return c.kind === 'physical' && typeof c.weight === 'number'; }) && !moneyCurNamed(sys, 'weight') ? ['Money.weight'] : []));   // 157 M1
    if (!ix.fx) group('Effects', [].concat.apply([], (Array.isArray(sys.effects) ? sys.effects : []).filter(function(d) { return isObj(d) && typeof d.id === 'string'; }).map(function(d) { return ['Fx.' + d.id + '.on'].concat(isObj(d.val) ? ['Fx.' + d.id + '.n'] : []); })));   // 1.6.2: an effect being on, and its number where it holds one
    if (!ix.shared) group('The table', (Array.isArray(sys.values) ? sys.values : []).filter(function(v) { return isObj(v) && typeof v.key === 'string'; }).map(function(v) { return 'Shared.' + v.key; }));   // 1.6.2 (G8)
    var hasAim = (Array.isArray(sys.combat && sys.combat.targetReads) ? sys.combat.targetReads : []).map(function(id) { var f = fieldById(sys, id); return f && free('Target.' + f.key) ? 'Target.' + f.key : ''; }), thl = targetHitList(sys), hits = thl && isObj(thl.list) ? (Array.isArray(thl.list.stats) ? thl.list.stats : []).filter(function(x) { return isObj(x) && x.kind !== 'pick'; }).concat(Array.isArray(thl.list.cols) ? thl.list.cols : []).map(function(x) { return isObj(x) && typeof x.key === 'string' && free('Target') ? 'Target.Hit.' + x.key : ''; }) : [];
    var arcsT = isObj(sys.combat) && Array.isArray(sys.combat.arcs) ? sys.combat.arcs.filter(function(a) { return isObj(a) && typeof a.key === 'string'; }) : [];   // 1.6.2 (13)
    group('The target', ['RangeMod', 'TargetDistance', 'HeightMod', 'HeightDiff', 'TargetSize', 'TargetLight'].concat(Array.isArray(sys.dark) && sys.dark.length ? ['TargetDark', 'TargetDarkPen'] : [], [ 'TargetCover', 'TargetCoverGrade', 'TargetCoverPro', 'TargetBodyCover']).filter(free).concat(hasAim, hits, arcsT.map(function(a) { return 'Target.arc.' + a.key; }).filter(free)));
    var arcsR = isObj(sys.combat) && Array.isArray(sys.combat.arcs) ? sys.combat.arcs.filter(function(a) { return isObj(a) && typeof a.key === 'string'; }) : [];   // 1.6.2 (vehicles, fold (b), rebuilt): the system's own arcs
    var mkR = Array.isArray(sys.mapKinds) ? sys.mapKinds.filter(function(m) { return isObj(m) && typeof m.key === 'string'; }) : [], mfR = []; mkR.forEach(function(m) { (Array.isArray(m.factors) ? m.factors : []).forEach(function(f) { if (isObj(f) && typeof f.key === 'string' && mfR.indexOf('MapFactor.' + f.key) < 0) mfR.push('MapFactor.' + f.key); }); });   // 1.6.2 (vehicles, fold (g))
    group('This token', (ownPostures(sys) ? ['Posture'] : []).concat(['Elevation', 'CombatRound', 'MovedThisTurn', 'FightRolls', 'Making']).concat(FACING_NAMES, arcsR.map(function(a) { return 'Arc.' + a.key; }), arcsR.map(function(a) { return 'Threats.' + a.key; }), mkR.map(function(m) { return 'MapKind.' + m.key; }), mfR, (Array.isArray(sys.scenes) ? sys.scenes : []).filter(function(m) { return isObj(m) && typeof m.key === 'string'; }).map(function(m) { return 'Scene.' + m.key; }), DATE_NAMES, calNames(sys)).filter(free));
    if (ctx.then === true) group('This roll', ['RollTotal', 'Natural', 'RollMargin', 'RollCrit', 'RollBig'].filter(free));
    if (r && r.resist === true) group('Their attempt', ['AttemptMargin', 'Attempt.kind', 'Attempt.type'].concat(Array.isArray(sys.dark) && sys.dark.length ? ['AttackerDark', 'AttackerDarkPen'] : []).filter(free).concat((Array.isArray(sys.combat && sys.combat.targetReads) ? sys.combat.targetReads : []).map(function(id) { var f = fieldById(sys, id); return f && free('Attempter.' + f.key) ? 'Attempter.' + f.key : ''; }).concat(free('Attempter.x') ? attRowNames(sys) : [])));   // 1.6.2 (7): and the attacking row's, of every list whose rolls an attempt resists
    if (r && onOther(r)) group('The one it is used on', ['OnSelf'].filter(free).concat(free('On.x') ? me.map(function(k) { return 'On.' + k; }) : []));
    if (r && isObj(r.cross)) group('The crossing', ['CrossStep', 'Crossed'].filter(free));
    if (ctx.end === true) group('The effect that ended', ['EffectNumber'].filter(free));   // 1.6.2: an effect's When it ends
    if ((ctx.blow === true || (r && (blowRollIds(sys)[r.id] === 1 || (isObj(r.cross) && r.cross.asAt === true && !Array.isArray(r.apply))))) && free('Blow.x')) {   // 1.6.2 (the review of backlog 242): and a roll ticked Reads the sheet as the blow left it, by the validator's own rule (crossBlow)
        group('The blow', Object.keys(BLOW_NAMES).map(function(k) { return 'Blow.' + k; }).concat(arcsT.map(function(a) { return 'Blow.arc.' + a.key; })));
        var lc0 = isObj(sys.combat) && isObj(sys.combat.damage) && isObj(sys.combat.damage.locs) ? fieldById(sys, sys.combat.damage.locs.list) : null, lsp = lc0 && isObj(lc0.list) ? lc0.list : null;
        if (lsp && free('Hit.x')) group('The location struck', (Array.isArray(lsp.stats) ? lsp.stats : []).filter(function(x) { return isObj(x) && x.kind !== 'pick'; }).concat(Array.isArray(lsp.cols) ? lsp.cols : []).map(function(x) { return isObj(x) && typeof x.key === 'string' ? 'Hit.' + x.key : ''; }));
    }
    lists.forEach(function(g) { group(g.name, g.ns); });
    return out;
}
// [formcheck:namewords-end]
// 1.6.2 (167 D): a text or a choice field may be named where a formula reads it only as words, by is() or contains()
function wordsOk(p, n, tg) { if (isObj(tg) && tg.kind === 'item-list' && isObj(p) && Array.isArray(p.lists) && p.lists.some(function(w) { return lower(w) === lower(n); })) return true; return isObj(tg) && (tg.kind === 'text' || tg.kind === 'select') && isObj(p) && Array.isArray(p.words) && p.words.some(function(w) { return lower(w) === lower(n); }); }   // 164 i: a list holds() reads
function validateSystem(sys, F) {
    var errors = [], warnings = [], badgeNow = false, standAsk = false;   // 193: Row.needsMet is known in a badge's Shown where alone
    if (!sys || !F) return { ok: false, errors: [{ message: 'No system.' }], warnings: warnings };
    var keys = sys.fields.map(function(f) { return f.key; }), lowerKeys = keys.map(lower), ix = keyIndex(sys);
    var known = map(); sys.fields.forEach(function(f) { known[lower(f.key)] = f; if (f.kind === 'resource') { known[lower(f.key) + '.max'] = f; known[lower(f.key) + '.cur'] = f; known[lower(f.key) + '.full'] = f; } if (f.kind === 'skill') { known[lower(f.key) + '.ranks'] = f; known[lower(f.key) + '.base'] = f; } if (f.kind === 'number') known[lower(f.key) + '.base'] = f; if (measureKindOf(f)) known[lower(f.key) + '.figure'] = Object.assign({}, f, { kind: 'number' }); });   // 1.6.2 (auto apply): a height or a weight as a figure   // 5h: "ST.base" is the stored number, before effects (a points cost reads it)
    if (!ix.making && !known.making) known.making = { id: '', key: 'Making', kind: 'number', vis: 'all' };   // 1.6.0: a character in the making
    DATE_NAMES.concat(DATE_MORE).forEach(function(n) { var l = lower(n); if (!ix.date && !known[l]) known[l] = { id: '', key: n, kind: 'number', vis: 'all' }; });   // 1.6.0: the date (1.6.2: its season and its moons too)
    TOKEN_NAMES.forEach(function(n) { var l = lower(n), fam = l.split('.')[0]; if (!ix[fam] && !known[l]) known[l] = { id: '', key: n, kind: fam === 'arc' && l !== 'arc' ? 'toggle' : 'number', vis: 'all' }; });
    (isObj(sys) && isObj(sys.combat) && Array.isArray(sys.combat.arcs) ? sys.combat.arcs : []).forEach(function(a) { if (!isObj(a) || typeof a.key !== 'string') return; var ka = 'arc.' + lower(a.key), kt = 'threats.' + lower(a.key); if (!ix.arc) known[ka] = { id: '', key: 'Arc.' + a.key, kind: 'toggle', vis: 'all' }; if (!ix.threats) known[kt] = { id: '', key: 'Threats.' + a.key, kind: 'number', vis: 'all' }; });   // 1.6.2 (vehicles, fold (b), rebuilt): the system's own arcs   // 5h Fold 3: the facing names (a field named Facing, Arc or Threats keeps the family)
    var edges = map(), gmP = gmPools(sys, F);   // a pool whose max is GM-only: players see none of it
    var crits = isObj(sys.combat) && (sys.combat.checks === 'under3d6' || sys.combat.checks === 'fixed'), fixedC = crits && sys.combat.checks === 'fixed';   // 1.5.8: whether the system's Roll outcomes give criticals (1.6.0: or criticals at fixed rolls)
    function noRangeSays() { return 'Roll outcomes on the Combat tab is not Criticals at fixed rolls, so this roll\u2019s critical range is never read.'; }
    function noCritSays(w) { return 'This system\u2019s rolls have no criticals (Roll outcomes on the Combat tab), so ' + THEN_WHEN[w] + ' never happens.'; }
    // Stage 6 F5a1: the names a carried list offers — totals (L.count|qty|paid|<stat>|<col>), L.on.<same>, an addressed row (L.<Key>.lvl|qty|on|has|
    // paid|<stat>|<col>) — and a row's own inside its list's columns (Row.<word>): a target like a field's (key: the loop graph's node, a column's
    // own; noEdge: nothing worked out behind it), or null. A Row.* name outside a list's columns reads { rowOutside }
    var lsts = map(), gmKsV = gmEntryKeys(sys, sys.fields); sys.fields.forEach(function(f) { if (f.kind === 'item-list') lsts[lower(f.key)] = f; });
    function listWords(lf) { var w = map(), sp = isObj(lf.list) ? lf.list : {}; (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') w[lower(x.key)] = x.kind === 'pick' ? 'pick' : 'stat'; }); (Array.isArray(sp.cols) ? sp.cols : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string') w[lower(x.key)] = 'col'; }); (Array.isArray(sp.counters) ? sp.counters : []).forEach(function(x) { if (isObj(x) && typeof x.key === 'string' && !w[lower(x.key)]) w[lower(x.key)] = 'ctr'; }); return w; }   // R2: counters
    function wordTarget(lf, word, total) {
        var w = listWords(lf), node = 'l#' + lower(lf.key);
        if (w[word] === 'col') return { id: '', key: node + '.' + word, kind: 'number', vis: lf.vis, list: lf };
        if (w[word] === 'ctr') return total ? { ctrTotal: true, list: lf } : { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // Stage 6 HUD R2: a counter is one row's; it has no total
        if (w[word] === 'pick') return total ? { pickTotal: true, list: lf } : { id: '', key: node + '.' + word, kind: 'number', vis: lf.vis, list: lf };   // F5a2: a choice reads its option's value; it has no total; a node of the loop graph (owed review F5a2#5)
        if (w[word] === 'stat' || word === 'qty' || word === 'paid' || (total ? word === 'count' : word === 'lvl')) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };
        if (!total && (word === 'on' || word === 'has')) return { id: '', key: node, kind: 'toggle', vis: lf.vis, list: lf, noEdge: true };
        if (!total && (word === 'opened' || word === 'loaded' || word === 'loadmax')) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.5.8: Row.opened; Row.loaded and Row.loadmax (Loads from)
        if (!total && (word === 'granted' || word === 'paysback')) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0 (v2, B4): Row.granted
        if (!total && word === 'made' && !listKeyed(lf.list, 'made')) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0 (v2, B5): Row.made
        if (!total && word === 'side' && !listKeyed(lf.list, 'side') && locSideKey(sys, lf)) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0 Sides of a location: Row.side, and Hit.side through it
        if (!total && word === 'athit' && !listKeyed(lf.list, 'athit') && isObj(lf.list) && isObj(lf.list.stand)) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.2 (body fold 2): Row.atHit
        if (!total && word === 'fitted' && !listKeyed(lf.list, 'fitted') && sys.fields.some(function(hf) { return isObj(hf) && hf.kind === 'item-list' && isObj(hf.list) && isObj(hf.list.parts) && partsFromHas(hf.list.parts, lf.id); })) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.2 Fitted slots: Row.fitted, on a list another list takes parts from
        if (!total && word === 'onplace' && !listKeyed(lf.list, 'onplace') && isObj(lf.list) && isObj(lf.list.on)) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.4: Row.onPlace, on a list with a switch
        if (!total && word === 'covered' && !listKeyed(lf.list, 'covered') && layered(lf.list)) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.3 Layers: Row.covered, on a list whose switch has layers
        if (!total && word === 'pastslot' && !listKeyed(lf.list, 'pastslot') && sys.fields.some(function(hf) { return isObj(hf) && hf.kind === 'item-list' && isObj(hf.list) && isObj(hf.list.parts) && partsFromHas(hf.list.parts, lf.id); })) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.2: Row.pastSlot, on a list another list takes parts from
        if (!total && word === 'startlvl' && !listKeyed(lf.list, 'startlvl') && isObj(lf.list) && isObj(lf.list.lvl)) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0: Row.startlvl, on a list with a level
        if (!total && word === 'again') return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 193: Row.again
        if (!total && word === 'subject' && isObj(lf.list) && Array.isArray(lf.list.subject) && !listKeyed(lf.list, 'subject')) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0 Subjects: Row.subject
        if (!total && word === 'bursthits' && burstList(lf.list) && !listKeyed(lf.list, 'bursthits')) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0: Row.bursthits, on a list whose rolls name a burst
        if (!total && word === 'needsmet' && badgeNow) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // ... and Row.needsMet, in a badge alone
        if (!total && word === 'parts' && isObj(lf.list) && isObj(lf.list.parts)) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0 R14: Row.parts
        if (!total && word === 'setall' && isObj(lf.list) && typeof lf.list.sets === 'string') return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.6.0 R15 Sets by: Row.setall
        if (!total && word === 'chambered' && isObj(lf.list) && isObj(lf.list.chamber)) return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.5.9 Chambers from: Row.chambered
        if (!total && word === 'once') return { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true };   // 1.5.8 Counted once
        if (!total && (word === 'oncecost' || word === 'oncefree')) { var ocS = isObj(lf.list) && isObj(lf.list.once) ? lf.list.once[word === 'oncecost' ? 'cost' : 'free'] : '', ocK = typeof ocS === 'string' ? lower(ocS) : ''; return ocK && w[ocK] === 'col' ? { id: '', key: node + '.' + ocK, kind: 'number', vis: lf.vis, list: lf } : { id: '', key: node, kind: 'number', vis: lf.vis, list: lf, noEdge: true }; }
        return null;
    }
    function extTarget(lf, word) {   // 1.5.4: what L.max.<w> and L.min.<w> read — a number stat or a column, as its total does (a column a node of the loop graph), and a counter (1.6.0) as one row's; a choice and a row word have none
        var w = listWords(lf)[word];
        if (w === 'stat' || w === 'col') return wordTarget(lf, word, true);
        if (w === 'pick') return { pickTotal: true, ext: true, list: lf };
        if (w === 'ctr') return wordTarget(lf, word, false);   // 1.6.0: a counter's highest and lowest, read as one row's count is
        if (word === 'count' || word === 'qty' || word === 'paid' || word === 'lvl' || word === 'on' || word === 'has') return { extWord: true, list: lf };
        return null;
    }
    function listTarget(n, rowList) {
        var sg = lower(n).split('.');
        if (sg[0] === 'row' && sg.length === 2 && !ix.row) return rowList ? wordTarget(rowList, sg[1], false) : { rowOutside: true };
        if (sg[0] === 'row' && sg[1] === 'parts' && !ix.row && (sg.length === 3 || (sg.length === 4 && (sg[2] === 'max' || sg[2] === 'min' || sg[2] === 'all')))) {   // 205 (4): Row.parts.all.<w>   // 1.6.0 R14: Row.parts.<w>, a number stat or a column of the parts' list, on a list that takes parts (205 (1): Row.parts.max.<w>, Row.parts.min.<w>)
            if (!rowList) return { rowOutside: true };
            var ptVs = isObj(rowList.list) && isObj(rowList.list.parts) ? partsSrcs(sys, rowList.list) : [], ptV = null, ptVg = false;   // 1.6.2: a name of any list the parts come from, GM only where any list that has it is
            ptVs.forEach(function(sf) { var pwV = listWords(sf)[sg[sg.length - 1]]; if (pwV === 'stat' || pwV === 'col' || (pwV === 'pick' && sg.length === 3)) { if (!ptV) ptV = sf; if (sf.vis === 'gm') ptVg = true; } });
            return ptV ? { id: '', key: 'l#' + lower(ptV.key), kind: 'number', vis: ptVg ? 'gm' : ptV.vis, noEdge: true } : null;
        }
        if (sg[0] === 'row' && sg.length === 3 && !ix.row && rowList && isObj(rowList.list) && isObj(rowList.list.at) && typeof rowList.list.at.by === 'string' && sg[1] === lower(rowList.list.at.by)) {   // 1.6.0 Stands at: Row.<by>.<w>, a stat, a choice or a column of the list the row its stat names is in
            var atV = atSrc(sys, rowList.list); if (!atV || atV.id === rowList.id) return null;
            var awV = listWords(atV)[sg[2]]; return awV === 'stat' || awV === 'col' || awV === 'pick' ? { id: '', key: 'l#' + lower(atV.key), kind: 'number', vis: atV.vis, noEdge: true } : null;
        }
        if ((sg[0] === 'at' || (sg[0] === 'tile' && standAsk)) && sg.length === 2 && !ix[sg[0]] && !linkByKey(sys)[sg[0]] && rowList && isObj(rowList.list) && isObj(rowList.list.stand)) { var tlV = fieldById(sys, rowList.list.stand.from); return tlV && tlV.kind === 'item-list' && wordTarget(tlV, sg[1], false) ? { id: '', key: 'l#' + lower(tlV.key), kind: 'number', vis: tlV.vis, noEdge: true } : null; }   // 1.6.2 (body fold 2): At.<w>, and in Reaches Tile.<w>
        if (sg[0] === 'here' && (sg.length === 3 || sg.length === 4) && !ix.here && !linkByKey(sys).here && rowList) {   // ... Here.<list>.count, and .sum, .max and .min of a stat or a column, on a list of tiles, and in a formula of a list that stands
            var hlV = sys.fields.filter(function(g) { return isObj(g) && g.kind === 'item-list' && lower(g.key) === sg[1] && isObj(g.list) && isObj(g.list.stand) && (g.list.stand.from === rowList.id || (isObj(rowList.list) && isObj(rowList.list.stand) && rowList.list.stand.from === g.list.stand.from)); })[0];
            if (!hlV) return null; if (sg.length === 3) return sg[2] === 'count' ? { id: '', key: 'l#' + lower(hlV.key), kind: 'number', vis: hlV.vis, noEdge: true } : null;
            var hwV = listWords(hlV)[sg[3]]; return (sg[2] === 'sum' || sg[2] === 'max' || sg[2] === 'min') && (hwV === 'stat' || hwV === 'col') ? { id: '', key: 'l#' + lower(hlV.key), kind: 'number', vis: hlV.vis, noEdge: true } : null;
        }
        if (sg[0] === 'row' && sg[1] === 'sheet' && sg.length >= 3 && !ix.row && rowList && isObj(rowList.list) && isObj(rowList.list.sheets) && !(isObj(rowList.list.at) && lower(rowList.list.at.by) === 'sheet')) {   // 1.6.2 (vehicles, fold (a)): Row.sheet.<name>, a name of the sheet the row is joined to, read with this very system: no edge of the loop graph, another sheet's
            if (sg.length === 3 && sg[2] === 'has') return { id: '', key: 'l#' + lower(rowList.key), kind: 'number', vis: rowList.vis, noEdge: true };
            var shV = ix[sg[2]]; return shV ? { id: '', key: 'l#' + lower(rowList.key), kind: shV.kind === 'text' ? 'text' : 'number', vis: shV.vis === 'gm' ? 'gm' : rowList.vis, noEdge: true } : null;
        }
        if (sg[0] === 'row' && sg.length === 3 && sg[1] === 'up' && !ix.row && rowList && isObj(rowList.list) && rowList.list.hang === true) return wordTarget(rowList, sg[2], false) ? { id: '', key: 'l#' + lower(rowList.key), kind: 'number', vis: rowList.vis, noEdge: true } : null;   // 1.6.2 (body fold 1): Row.up.<w>, a word of the row it hangs from: another row's, so no edge of the loop graph, and the resolver's chain answers a loop by the rows themselves
        if (sg[0] === 'row' && sg[1] === 'feed' && (sg.length === 4 || (sg.length === 5 && sg[3] === 'fired')) && !ix.row) {   // 1.6.0 Feeds: Row.Feed.<key>.<w> and Row.Feed.<key>.fired.<w>, a stat, a choice or a column of the feed's list; Row.Feed.<key>.turns
            if (!rowList) return { rowOutside: true };
            var fdV = isObj(rowList.list) ? feedOf(rowList.list, sg[2]) : null, fsV = fdV ? loadSrc(sys, feedSpec(rowList.list, fdV)) : null; if (!fsV) return null;
            var fwV = listWords(fsV)[sg[sg.length - 1]]; if (fwV === 'stat' || fwV === 'col' || fwV === 'pick') return { id: '', key: 'l#' + lower(fsV.key), kind: 'number', vis: fsV.vis, noEdge: true };
            return sg.length === 4 && sg[3] === 'turns' ? { id: '', key: 'l#' + lower(rowList.key), kind: 'number', vis: rowList.vis, noEdge: true } : null;
        }
        if (sg[0] === 'row' && sg.length === 3 && sg[1] === 'onbefore' && !ix.row && !(rowList && isObj(rowList.list) && isObj(rowList.list.at) && typeof rowList.list.at.by === 'string' && lower(rowList.list.at.by) === 'onbefore')) {   // 1.6.4: Row.onBefore.<w>, a number stat or a column of this list added up over the rows switched on before the row, on a list with a switch. A column is read as itself (an edge of the loop graph), so a column that adds up itself is said as a loop, as the resolver refuses it
            if (!rowList) return { rowOutside: true };
            if (!isObj(rowList.list) || !isObj(rowList.list.on)) return null;
            var obV = listWords(rowList)[sg[2]]; return obV === 'stat' || obV === 'col' ? wordTarget(rowList, sg[2], false) : null;
        }
        if (sg[0] === 'row' && sg.length === 3 && (sg[1] === 'round' || sg[1] === 'fired') && !ix.row) {   // 1.5.9 Chambers from: Row.round.<w>, Row.fired.<w> — a stat or a column of the chamber's list, on a list with a chamber
            if (!rowList) return { rowOutside: true };
            var chV = isObj(rowList.list) && isObj(rowList.list.chamber) ? chamberSrc(sys, rowList.list) : null; if (!chV) return { noChamber: true, list: rowList };
            var cwV = listWords(chV)[sg[2]]; return cwV === 'stat' || cwV === 'col' || cwV === 'pick' ? { id: '', key: 'l#' + lower(chV.key), kind: 'number', vis: chV.vis, noEdge: true } : null;
        }
        if (sg[0] === 'host' && sg.length === 2 && rowList && !ix.host && !linkByKey(sys).host) {   // 205 (3): a part's Host.<w>, a number stat, a choice or a column of a list whose parts come from this one
            var hsV = sys.fields.filter(function(hf) { return isObj(hf) && hf.kind === 'item-list' && isObj(hf.list) && isObj(hf.list.parts) && partsFromHas(hf.list.parts, rowList.id) && (/^(stat|col|pick)$/.test(listWords(hf)[sg[1]] || '') || hostWord(hf.list, sg[1])); });
            if (hsV.length) return { id: '', key: 'l#' + lower(hsV[0].key), kind: 'number', vis: hsV.some(function(hf) { return hf.vis === 'gm'; }) ? 'gm' : hsV[0].vis, noEdge: true };
        }
        var lf = lsts[sg[0]]; if (lf && sg.length === 5) return subjectPlace(lf.list, sg) ? (sg[3] === 'sum' ? wordTarget(lf, sg[4], true) : extTarget(lf, sg[4])) : null;   // 1.6.0 Subjects: <List>.Subject.<Word>.sum.<w>, read as a total, and .max and .min as List.max reads a list
        if (!lf || sg.length < 2 || sg.length > 4) return null;
        if (sg.length === 2) return wordTarget(lf, sg[1], true);
        var sdV = gmKsV[lower(lf.key)] && gmKsV[lower(lf.key)][sg[1]] === 1 ? null : locSideRead(sys, lf, sg); if (sdV) { var tsd = sdV.ext ? extTarget(lf, sdV.w) : wordTarget(lf, sdV.w, true); if (tsd) return tsd; }   // 1.6.0 Sides of a location: as a total or a highest reads
        var on4 = sg.length === 4 && sg[1] === 'on', ex = on4 ? sg[2] : sg[1];   // 1.5.4: L.max.<w>, L.min.<w>, L.on.max.<w>, L.on.min.<w> (the resolver's listName)
        if (ex === 'max' || ex === 'min') { if (sg.length !== (on4 ? 4 : 3)) return null; var te = extTarget(lf, sg[sg.length - 1]); if (te && on4) te.onTotal = true; return te; }
        if (sg.length === 4) { if (on4) return null; if (!(isObj(lf.list) && isObj(lf.list.specs))) return null; var spW = listWords(lf)[sg[3]], tsp = spW === 'stat' || spW === 'col' || spW === 'ctr' || sg[3] === 'has' || sg[3] === 'lvl' || sg[3] === 'qty' || sg[3] === 'paid' ? wordTarget(lf, sg[3], false) : null; if (!tsp) return null; tsp.addr = sg[1]; tsp.spec = sg[2]; if (gmKsV[lower(lf.key)] && gmKsV[lower(lf.key)][sg[1]] === 1) tsp.gmKey = true; return tsp; }   // 1.6.0 Specialties: <List>.<Parent>.<Spec>.<w>, read as an addressed row of the parent
        if (sg[1] === 'on') { var to = wordTarget(lf, sg[2], true); if (to) to.onTotal = true; return to; }
        if ((sg[2] === 'parts' || sg[2] === 'needsmet') && !listWords(lf)[sg[2]]) return null;   // 1.6.4: no row word the resolver reads on an addressed row (the list of soft row words in systemcore.js)
        var ta = wordTarget(lf, sg[2], false); if (!ta) return null;
        ta.addr = sg[1]; if (gmKsV[lower(lf.key)] && gmKsV[lower(lf.key)][sg[1]] === 1) ta.gmKey = true;
        return ta;
    }
    function listT(n) { var t = listTarget(n, null); if (t && !t.rowOutside) return t; var tb = linkT(n) || crewT(n) || tableT(n, null); return tb && !tb.rowOutside ? tb : null; }   // captions and labels: never inside a column (1.6.0: a linked sheet's names too)
    var figK = null;   // the core handbook session's ask (after ask 6): the group link whose figure is being checked, so <LinkKey>.<name> reads the vehicle
    function groupReadV(nm) { var l = lower(nm), d = l.indexOf('.'), g = d > 0 ? l.slice(0, d) : ''; return !!(g && gnV[g] && !ix[g] && crewParts(gnV[g], l.slice(d + 1))); }
    function readsGroupV(nm, seen) {   // whether a name reads the group, itself or through the definitions of the fields it reads
        var l = lower(nm); if (groupReadV(l)) return true;
        var dot = l.lastIndexOf('.'), f = ix[l] || (dot > 0 && NAME_SUFFIX[l.slice(dot + 1)] ? ix[l.slice(0, dot)] : null); if (!f || seen[f.id]) return false; seen[f.id] = 1;
        var p = DEF_PROP[f.kind], t = p ? f[p] : null; if (typeof t !== 'string' || !t) return false;
        var ns = []; try { ns = F.names(t) || []; } catch (e) { ns = []; } return ns.some(function(x) { return readsGroupV(x, seen); });
    }
    function figVehWarn(k, x) {   // a vehicle name whose own definition reads the group: inside a figure the group reads 0
        var ns = []; try { ns = F.parse(x.formula).ok ? F.names(x.formula) || [] : []; } catch (e) { ns = []; }
        ns.forEach(function(n) { var rv = figVeh(k, ix, n); if (rv && !groupReadV(rv) && readsGroupV(rv, map())) warnings.push({ id: k.id, prop: 'link.figs.' + x.key, message: '"' + n + '" reads the crew\u2019s figures itself, so inside a figure it reads them as 0.' }); });
    }
    var gnV = groupByKey(sys);   // 1.6.0 (CORE gap 16): <group>.count, <group>.max|min|sum.<name> and the same under a station, a number of the crew sheets; never an edge of the loop graph
    function crewT(n) { var l = lower(n), d = l.indexOf('.'), k = d > 0 ? l.slice(0, d) : ''; if (!k || !gnV[k] || ix[k]) return null; var p = crewParts(gnV[k], l.slice(d + 1)); if (!p) return null; if (p.agg === 'count') return { id: '', key: n, kind: 'number', vis: 'all', noEdge: true }; if (linkFig(gnV[k], p.name)) return { id: '', key: n, kind: 'number', vis: 'all', noEdge: true }; /* the core handbook session's ask 6: a figure of the link's own */ var t = known[lower(p.name)] || listTarget(lower(p.name), null); return t && !t.rowOutside ? Object.assign({}, t, { noEdge: true }) : null; }
    var lnkV = linkByKey(sys);   // 1.6.0: <Key>.<name> reads the system's own name on the sheet a link holds, and <Key>.has; never an edge of the loop graph, since it is another character
    function linkT(n) { var l = lower(n), d = l.indexOf('.'), k = d > 0 ? l.slice(0, d) : ''; if (!k || !lnkV[k] || ix[k]) return null; var w = l.slice(d + 1); if (w === 'has' && !ix.has) return { id: '', key: n, kind: 'number', vis: 'all', noEdge: true }; if (w === 'stations' && lnkV[k].kind === 'crew' && !ix.stations) return { id: '', key: n, kind: 'number', vis: 'all', noEdge: true }; if (crewStation(lnkV[k], w, ix)) return { id: '', key: n, kind: 'number', vis: 'all', noEdge: true }; var t = known[w] || listTarget(w, null); return t && !t.rowOutside ? Object.assign({}, t, { noEdge: true }) : null; }
    function holdT(n) {   // 1.6.2: Owner.<name> (a name of the system's own) and Holder.<w> (a stat or a column of a list ticked Rows are sheets), never an edge of the loop graph
        var l = lower(n), d = l.indexOf('.'), k = d > 0 ? l.slice(0, d) : ''; if ((k !== 'owner' && k !== 'holder') || ix[k] || lnkV[k] || groupByKey(sys)[k] || !sheetsAny(sys)) return null;
        var w = l.slice(d + 1); if (!w) return null; if (w === 'has') return { id: '', key: n, kind: 'number', vis: 'all', noEdge: true };
        if (k === 'owner') { var t = known[w] || listTarget(w, null); return t && !t.rowOutside ? Object.assign({}, t, { noEdge: true }) : null; }
        var hit = null; sys.fields.forEach(function(f) { if (hit || !isObj(f) || f.kind !== 'item-list' || !sheetsOn(f.list)) return; var sp = f.list; if (statDefOf(sp, w) || ROW_WORDS[w] || (Array.isArray(sp.cols) && sp.cols.some(function(c) { return isObj(c) && typeof c.key === 'string' && lower(c.key) === w; }))) hit = f; });
        return hit ? { id: '', key: n, kind: 'number', vis: hit.vis === 'gm' ? 'gm' : 'all', noEdge: true } : null;
    }
    function placeT(n) {   // 1.6.0: Posture.<posture>, Type.<key>, Place.<stat>.<value>, Value.<key>.<value> (placeName), a number of the system's own; one that names nothing says so (says)
        var l = lower(n), sg = l.split('.'), fam = sg[0]; if ((fam !== 'posture' && fam !== 'type' && fam !== 'kind' && fam !== 'place' && fam !== 'value' && fam !== 'season' && fam !== 'moon') || ix[fam] || lnkV[fam] || gnV[fam]) return null;
        var v = placeName(sys, l); if (v === undefined) return null;
        var t = { id: '', key: n, kind: 'number', vis: 'all', noEdge: true };
        if (fam === 'posture' && v < 0) t.says = '"' + n + '" names no posture of this system, so it reads -1 and never matches Posture.';
        if (fam === 'type' && v === 0) t.says = '"' + n + '" names no damage type on the Combat tab, so it reads 0.';
        if (fam === 'kind' && v === 0) t.says = '"' + n + '" names no kind of blow on the Combat tab, so it reads 0.';
        if (fam === 'season' && v === 0) t.says = '"' + n + '" names no season of the Calendar tab, so it reads 0.';
        if (fam === 'moon' && v === 0) t.says = '"' + n + '" names no phase of a moon, so it reads 0. A phase is New, WaxingCrescent, FirstQuarter, WaxingGibbous, Full, WaningGibbous, LastQuarter or WaningCrescent.';
        if (fam === 'value') { var vr = valueNamed(sys, sg[1], sg[2]); t.says = vr.n < 0 ? '"' + n + '" names no value: no number of that key has that value name, so it reads -1 and never matches it.' : vr.also ? '"' + n + '" is a value name of more than one number, at different figures: it reads the first one\u2019s.' : ''; }
        if (fam === 'place') { var pr = placeNamed(sys, sg[1], sg[2]); t.says = !pr.n ? '"' + n + '" names no place: no list has a set of places ' + n.split('.')[1] + ' with that value name, so it reads 0, which has() refuses.' : pr.also ? '"' + n + '" is a place of more than one list, at different places: it reads the first list\u2019s.' : ''; }
        return t;
    }
    // 1.6.0: Table.<table>.<row>.<col> and Table.<table>.by.<name>.<col>, a number of the table's own; a row, a column or a name that holds none says so (says), since each reads 0. One the system's tables do not hold is an unknown name, and a GM-only table a GM-only value
    function tableT(n, rowList) {
        var l = lower(n); if (l.slice(0, 5) === 'deck.' && !ix.deck && Array.isArray(sys.decks)) { var dpT = l.slice(5).split('.'), dkV = deckOf(sys.decks, dpT[0]), wkV = dpT[1], okV = dkV && (wkV === 'left' || wkV === 'discard' || (wkV === 'last' && dpT.length === 3 && dkV.stats.some(function(s) { return lower(s.key) === dpT[2]; })) || (wkV === 'drawn' && (dpT.length === 2 || (dpT.length === 3 && dkV.stats.some(function(s) { return lower(s.key) === dpT[2]; })) || (dpT.length === 4 && (dpT[2] === 'high' || dpT[2] === 'low') && dkV.stats.some(function(s) { return lower(s.key) === dpT[3]; }))))); return okV ? { id: '', key: n, kind: 'number', vis: dkV.vis === 'gm' ? 'gm' : 'all', noEdge: true } : null; }   // 1.6.2 (G9)
        if ((l === 'money' || l.slice(0, 6) === 'money.') && !ix.money && !linkByKey(sys).money && !groupByKey(sys).money && moneyBoxes(sys).length) { var mrT = tableRead(sys, l); return mrT && mrT.t ? { id: '', key: n, kind: 'number', vis: mrT.gm ? 'gm' : 'all', noEdge: true } : null; }   // 157 M1
        if (l.slice(0, 3) === 'fx.' && !ix.fx && !linkByKey(sys).fx && Array.isArray(sys.effects)) { var fxV = fxNamed(sys, l); return fxV ? { id: '', key: n, kind: 'number', vis: fxV.vis === 'gm' ? 'gm' : 'all', noEdge: true } : null; }   // 1.6.2: an effect being on, and its number
        if (l.slice(0, 7) === 'shared.' && !ix.shared && Array.isArray(sys.values)) { var vdT = valueDef(sys, l.slice(7)); return vdT ? { id: '', key: n, kind: 'number', vis: vdT.vis === 'gm' ? 'gm' : 'all', noEdge: true } : null; }   // 1.6.2 (G8)
        if (l.slice(0, 6) !== 'table.' || !tableFam(sys, ix)) return null;
        var p = tableParts(l), rd = p ? tableRead(sys, l) : null; if (!rd || !rd.t) return null;
        var t = rd.t, lab = t.label || t.key, out = { id: '', key: n, kind: 'number', vis: rd.gm ? 'gm' : 'all', noEdge: true };
        var nameIn = function(lf, w) { var sp = isObj(lf.list) ? lf.list : {}, st = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(x) { return isObj(x) && lower(String(x.key)) === w; })[0], c = (Array.isArray(sp.cols) ? sp.cols : []).filter(function(x) { return isObj(x) && lower(String(x.key)) === w; })[0]; return st ? (st.kind === 'pick' || Array.isArray(st.labels) ? 'stat' : '') : c && Array.isArray(c.labels) ? 'col' : ''; };
        var says = '';
        if (p.by) {
            var by = p.by, named = false;
            if (by.slice(0, 4) === 'row.' && !ix.row) {
                if (!rowList) return { rowOutside: true };
                var w = by.slice(4), ps = w.slice(0, 6) === 'parts.' && isObj(rowList.list) && isObj(rowList.list.parts) ? (partsSrcs(sys, rowList.list).filter(function(sf) { return !!nameIn(sf, w.slice(6)); })[0] || partsSrc(sys, rowList.list)) : null, nk = w.slice(0, 6) === 'parts.' ? (ps ? nameIn(ps, w.slice(6)) : '') : w.indexOf('.') < 0 ? nameIn(rowList, w) : '';
                if (!nk && tableRanged(t) && !ps && w.indexOf('.') < 0) { var spR = isObj(rowList.list) ? rowList.list : {}, stR = (Array.isArray(spR.stats) ? spR.stats : []).filter(function(x) { return isObj(x) && lower(String(x.key)) === w; })[0], clR = (Array.isArray(spR.cols) ? spR.cols : []).filter(function(x) { return isObj(x) && lower(String(x.key)) === w; })[0]; nk = stR && stR.kind !== 'pick' ? 'stat' : clR ? 'col' : ROW_WORDS[w] === 1 ? 'stat' : ''; }   // 1.6.2 (G7): a figure finds a row by its range
                named = !!nk; if (nk === 'col' && !ps) { out.key = 'l#' + lower(rowList.key) + '.' + w; delete out.noEdge; }   // a column of value names is worked out: a node of the loop graph
            } else if (by.slice(0, 5) === 'host.' && !ix.host && !lnkV.host) {
                if (!rowList) return { rowOutside: true };
                sys.fields.forEach(function(hf) { if (isObj(hf) && hf.kind === 'item-list' && isObj(hf.list) && isObj(hf.list.parts) && partsFromHas(hf.list.parts, rowList.id) && nameIn(hf, by.slice(5))) { named = true; if (hf.vis === 'gm') out.vis = 'gm'; } });
            } else {
                var bf = ix[by];
                if (bf) { named = bf.kind === 'text' || bf.kind === 'select' || ((bf.kind === 'number' || bf.kind === 'formula') && Array.isArray(bf.labels)) || (tableRanged(t) && (bf.kind === 'number' || bf.kind === 'formula' || bf.kind === 'skill' || bf.kind === 'resource' || bf.kind === 'toggle')); out.id = bf.id; if (bf.vis === 'gm') out.vis = 'gm'; if (named) { out.key = bf.key; delete out.noEdge; } }
            }
            if (!named) says = '"' + n + '" reads ' + by + ', which holds no name, so it reads 0. A text field, a list field, a number with value names or a choice holds one' + (tableRanged(t) ? ', and a number finds a row by its range.' : '.');
            else if (by.slice(0, 4) === 'row.' && by.indexOf('.', 4) < 0 && rowList) {   // 1.6.2 (backlog 208, point 6): an option with no row of the table reads 0, as a label renamed on one side leaves it
                var byS = (isObj(rowList.list) && Array.isArray(rowList.list.stats) ? rowList.list.stats : []).filter(function(x) { return isObj(x) && x.kind === 'pick' && lower(String(x.key)) === by.slice(4); })[0];
                var byM = byS ? (Array.isArray(byS.opts) ? byS.opts : []).filter(function(o) { return isObj(o) && typeof o.label === 'string' && !tableRowOf(t, o.label); }).map(function(o) { return o.label; }) : [];
                if (byM.length) says = '"' + n + '": ' + lab + ' has no row for ' + byM.slice(0, 3).join(', ') + ', so a row with that choice reads 0.';
            }
        } else if (!tableRowOf(t, p.row)) says = '"' + n + '": ' + lab + ' has no row ' + n.split('.')[2] + ', so it reads 0.';
        if (!(Array.isArray(t.cols) ? t.cols : []).some(function(c) { return isObj(c) && lower(String(c.key)).trim() === p.col; })) says = '"' + n + '": ' + lab + ' has no column ' + n.split('.').pop() + ', so it reads 0.';
        if (says) out.says = says;
        return out;
    }
    var CMP_RE = '(?:==|=|!=|<>|<=|>=|<|>|\u2265|\u2264|\u2260)';
    function bareCmp(owner, prop, text) {   // 1.6.0 (a nicety): Posture or Blow.type compared with a bare number, whose meaning a list added to or reordered changes
        [['posture', 'Posture', !ix.posture && ownPostures(sys), 'a posture\u2019s place: a posture added or moved changes what it means. Posture.<name> reads it by its name.'],
         ['blow\\.type', 'Blow.type', !ix.blow && isObj(sys.combat) && isObj(sys.combat.damage) && Array.isArray(sys.combat.damage.types) && sys.combat.damage.types.length > 0, 'a damage type\u2019s place: a type added or moved changes what it means. Type.<key> reads it by its key.'],
         ['blow\\.kind', 'Blow.kind', !ix.blow && isObj(sys.combat) && isObj(sys.combat.damage) && Array.isArray(sys.combat.damage.kinds) && sys.combat.damage.kinds.length > 0, 'a kind of blow\u2019s place: a kind added or moved changes what it means. Kind.<key> reads it by its key.']].forEach(function(c) {
            if (!c[2] || typeof text !== 'string') return;
            var re = new RegExp('(?:^|[^\\p{L}\\p{N}_.])' + c[0] + '\\s*' + CMP_RE + '\\s*[-+]?\\d|(?:^|[^\\p{L}\\p{N}_.])\\d+(?:\\.\\d+)?\\s*' + CMP_RE + '\\s*' + c[0] + '(?![\\p{L}\\p{N}_.])', 'iu');
            if (re.test(text)) warnings.push({ id: owner.id, prop: prop, message: '"' + c[1] + '" is compared with a bare number, which is ' + c[3] });
        });
    }
    function dkindSays(id, key, prop, text, vis, rowList) {   // 1.6.0: a roll's kind of blow: a key of the Combat tab's kinds, or a formula giving a kind's place; a kind the system does not hold is said, since the blow then carries none
        if (typeof text !== 'string' || !text.trim()) return;
        var t = text.trim(), lt = lower(t), kdL = isObj(sys.combat) && isObj(sys.combat.damage) && Array.isArray(sys.combat.damage.kinds) ? sys.combat.damage.kinds : [];
        if (kdL.some(function(k) { return isObj(k) && typeof k.key === 'string' && lower(k.key) === lt; })) return;
        if (!kdL.length) { warnings.push({ id: id, prop: prop, message: 'The Combat tab names no kinds of blow, so this roll\u2019s blow carries none.' }); return; }
        if (STAT_KEY.test(t) && !known[lt]) { warnings.push({ id: id, prop: prop, message: '"' + t + '" is no kind of blow on the Combat tab, so the blow carries none.' }); return; }
        checkFormula({ id: id, key: key }, prop, t, false, vis, rowList);
    }
    function isRollProp(p) { return p === 'roll' || p === 'rollFormula' || (typeof p === 'string' && p.indexOf('list.roll.') === 0); }   // F5b: a list's roll is a roll
    function moreSays(id, key, prop, c, vis, lf) {   // 1.6.2: a change that moves nothing of the sheet: a result table, a shared value or a draw. true where it was one
        var own = { id: id, key: key };
        if (typeof c.table === 'string') { if (!resultOf(sys, c.table)) errors.push({ id: id, prop: prop, message: 'That result table is not in this system any more.' }); if (c.by) checkFormula(own, prop, c.by, true, vis, lf); return true; }
        if (typeof c.tag === 'string') { if (!tagOf(sys, c.tag)) errors.push({ id: id, prop: prop, message: 'That mark is not in this system any more.' }); return true; }   // 1.6.2 (vehicles, fold (c))
        if (typeof c.shared === 'string') { if (!valueDef(sys, c.shared)) errors.push({ id: id, prop: prop, message: 'That shared value is not in this system any more.' }); checkFormula(own, prop, c.formula, c.roll === true, vis, lf); return true; }
        if (c.give === 'act' || c.give === 'turn') {   // 1.6.4 (the full test's gap #20): more of a turn's action this turn, or extra turns; how many is required
            var gvActs = isObj(sys.combat) && isObj(sys.combat.turn) && Array.isArray(sys.combat.turn.acts) ? sys.combat.turn.acts : [];
            if (c.give === 'act' && !gvActs.some(function(a) { return isObj(a) && typeof a.key === 'string' && lower(a.key) === lower(c.act); })) errors.push({ id: id, prop: prop, message: 'Give: that action is not one the Combat tab’s Turns allow any more.' });
            if (!c.formula) errors.push({ id: id, prop: prop, message: 'Give: say how many it gives, such as 1.' }); else checkFormula(own, prop, c.formula, c.roll === true, vis, lf);
            return true;
        }
        if (typeof c.deck === 'string') { if (!deckOf(sys.decks, c.deck)) errors.push({ id: id, prop: prop, message: 'That deck is not in this system any more.' }); if (c.shuffle !== true) checkFormula(own, prop, c.formula, c.roll === true, vis, lf); return true; }
        return false;
    }
    // 1.6.4 (gap #6 of the full test, "Say it at Save"): an Add or a Subtract whose amount is a plain number below 0 does nothing, since applyAct counts an
    // amount below 0 as 0 (a Subtract never raises, an Add never lowers). Asked first by rolledWarn, which every change of a field or a row of the
    // System editor's rolls, actions and list rolls passes through. A formula that only works out below 0 at the table is not judged here
    function negWarn(id, prop, c) { if (!isObj(c) || c.set === true || typeof c.formula !== 'string') return; var nm = /^\s*-\s*(\d+(?:\.\d+)?)\s*$/.exec(c.formula); if (!nm || Number(nm[1]) === 0) return; var add = c.add === true; warnings.push({ id: id, prop: prop, message: 'An amount below 0 counts as 0, so this ' + (add ? 'Add' : 'Subtract') + ' changes nothing. Pick ' + (add ? 'Subtract' : 'Add') + ' and ' + nm[1] + ' instead.' }); }
    function rolledWarn(id, prop, c) { negWarn(id, prop, c); if (!isObj(c) || c.roll !== true || typeof c.formula !== 'string' || !c.formula) return; var rp = F.parse(c.formula); if (rp.ok && !hasDice(rp.ast.body)) warnings.push({ id: id, prop: prop, message: 'Rolled, but this amount rolls no dice, so nothing is rolled.' }); }   // 1.5.9 (book es/et plan, section 0)
    var resistV = false;   // 1.6.0 (B2): the roll being read Resists an attempt, so AttemptMargin is known in it
    var noticeV = false;   // 1.6.0: a side vision check is being read, so TargetLight is known in it
    var blowV = false, blowRolls = map(), dmgV = isObj(sys.combat) && isObj(sys.combat.damage) ? sys.combat.damage : null, hitF = dmgV && isObj(dmgV.locs) ? fieldById(sys, dmgV.locs.list) : null;   // 1.6.0 (the core's gaps 6 and 7): the system rolls the damage step posts read Blow.<name> and Hit.<name>
    if (dmgV) { (Array.isArray(dmgV.onMajor) ? dmgV.onMajor : [dmgV.onMajor]).forEach(function(w) { if (isObj(w) && typeof w.roll === 'string') blowRolls[w.roll] = 1; });   // 1.6.0: each of onMajor's rows
        (Array.isArray(dmgV.onWound) ? dmgV.onWound : []).forEach(function(w) { if (isObj(w) && typeof w.roll === 'string') blowRolls[w.roll] = 1; }); }
    var askV = null, askOf = function(r) { if (!isObj(r) || !Array.isArray(r.asks)) return null; var m = map(); r.asks.forEach(function(a) { if (isObj(a) && typeof a.key === 'string') m[lower(a.key)] = true; }); return m; };   // 1.6.2: the questions of the entry being read, so Ask.<key> is known in it
    var endV = false;   // 1.6.2: the formula being read is an effect's end, so EffectNumber is known in it
    var crossV = false;   // 1.6.0: the entry being read runs When a value crosses, so CrossStep and Crossed are known in it (never in its own steps)
    var blowX = false;   // 1.6.2 (backlog 242): the roll being read knows Blow.<name> and Hit.<name> only by its crossing's asAt, so never in its crossing's own steps, which are read on the sheet as stored
    var crossBlow = function(r) { return isObj(r) && isObj(r.cross) && r.cross.asAt === true && !Array.isArray(r.apply); };
    // 1.6.2 (the review of backlog 242): what is said of a name the roll itself may read where it stands in a crossing's own steps (First at, Then
    // every), which are worked out on the sheet as it stands before the roll runs, so they read no blow, no CrossStep or Crossed and nothing of a press
    var crossStepSays = function(n) { return '"' + n + '" is known only in the roll itself, never in the steps of its crossing, which are worked out on the sheet as it stands.'; };
    var rollG = null;   // 1.6.2: the entry being read's named dice, which its Then and its bands read; null where any roll may hold them (the Combat tab's bands)
    var rollGroups = function(fm) { var p = F && typeof fm === 'string' && fm ? F.parse(fm) : null; return p && p.ok && Array.isArray(p.groups) ? p.groups : []; };
    var nearV = false;   // 1.5.9 (book es/et plan, section 3): the entry being read Applies to an adjacent character, so OnSelf is known in it
    var byIfV = false;   // 1.6.0: a call's Read on the one who resisted is being read, so a row is known in it only where it names a list's roll
    var ansV = false;   // 1.6.3 (defense fold 3): a line of When it answers an attack is being read, so the defense roll's own result (RollMargin, RollTotal, Natural, RollCrit, RollBig) is known in it
    function checkAns(own, pre, lines, lf) {   // each line's condition and How many hits, read as checkByIf reads a call (the defender, the GM's view) with the roll's result; How much gets through by ansShareSays
        var sA = ansV; ansV = true;
        lines.forEach(function(a, j) {
            if (!isObj(a)) return;
            if (a.if) checkFormula(own, pre + j + '.if', a.if, false, 'gm', lf);
            if (a.does === 'hits' && a.hits) checkFormula(own, pre + j + '.hits', a.hits, false, 'gm', lf);
            if (a.does === 'share' && a.share) { var sm = ansShareSays(sys, a.share, F); if (sm) errors.push({ id: own.id, prop: pre + j + '.share', message: sm.message, pos: sm.pos, len: sm.len }); }
            if (a.does === 'send') ['far', 'mod', 'margin'].forEach(function(k) { if (typeof a[k] === 'string' && a[k]) checkFormula(own, pre + j + '.' + k, a[k], false, 'gm', lf); });   // 1.6.3 (defense fold 4): How far, the modifier and Its margin, read as the If is, as the defense succeeds
        });
        ansV = sA;
    }
    var withV = null;   // 1.6.3 (defense fold 2): the list a roll Answered with a row of reads its rows of, so Row.* is known in that roll's own formulas (never in its crossing's steps or its Answers a critical where, read with no row)
    function isApplyProp(p) { return typeof p === 'string' && (p.indexOf('apply.') === 0 || p.indexOf('list.apply.') === 0 || p.indexOf('then.') === 0 || p.indexOf('list.then.') === 0); }   // R2b: a list roll's consequence too   // R1: a roll's consequence too   // Stage 6 HUD H7: an apply action's amount (no dice, no loop edge: nothing reads an action)
    function rowOutSays(n) { return '"' + n + '" names a row, so ' + (byIfV ? 'it is known here only where the call names a list\u2019s roll, or a roll answered with a row.' : 'it is known only in a list\u2019s own columns.'); }
    function checkByIf(own, prop, cl) {   // 1.6.0: the resister's names, not the roller's: their roll's list, what their roll reads (AttemptMargin), and every value, since the host reads it whole
        var m = /^(f_[A-Za-z0-9_]+)#\d+$/.exec(typeof cl.by === 'string' ? cl.by : ''), lf = m ? fieldById(sys, m[1]) : null, wN = nearV, wC = crossV, wR = resistV, wB = blowV, wX = blowX, wW = withV;
        if (!lf && typeof cl.by === 'string' && cl.by) sys.rolls.forEach(function(x) { if (isObj(x) && x.id === cl.by && x.resist === true && typeof x.withRow === 'string') lf = fieldById(sys, x.withRow); });   // 1.6.3 (defense fold 2): By a roll answered with a row reads that row
        nearV = false; crossV = false; blowV = false; blowX = false; resistV = true; byIfV = true; withV = null;
        checkFormula(own, prop, cl.byIf, false, 'gm', lf && lf.kind === 'item-list' ? lf : null);
        nearV = wN; crossV = wC; resistV = wR; blowV = wB; blowX = wX; byIfV = false; withV = wW;
    }
    function checkFormula(owner, prop, text, allowDice, vis, rowList) {   // rowList (F5a1): the list whose column this is (Row.* is known there)
        if (text === null) return;
        if (!rowList && withV) rowList = withV;   // 1.6.3 (defense fold 2): in a roll answered with a row, that row's names
        if (!text) { errors.push({ id: owner.id, prop: prop, message: 'Missing formula', pos: 0, len: 0 }); return; }
        var p = F.parse(text);
        if (!p.ok) { errors.push({ id: owner.id, prop: prop, message: p.error.message, pos: p.error.pos, len: p.error.len }); return; }
        if (!allowDice && hasDice(p.ast.body)) { errors.push({ id: owner.id, prop: prop, message: isApplyProp(prop) ? 'An amount cannot roll dice: roll first, and let the amount read the field the result goes in.' : 'Dice are not allowed in a definition; put the dice in a roll.', pos: 0, len: text.length }); }
        bareCmp(owner, prop, text);   // 1.6.0: a comparison of Posture or Blow.type with a bare number
        (Array.isArray(p.reads) ? p.reads : []).forEach(function(g) {   // 1.6.2: named dice are this formula's own, or the roll's in its Then and its bands
            if (p.groups.indexOf(g) >= 0 || ((ansV || /(^|\.)(then|band)\./.test(prop)) && (rollG === null || rollG.indexOf(g) >= 0))) return;
            errors.push({ id: owner.id, prop: prop, message: 'No dice called "' + g + '" here. Name them with @ in this roll\u2019s formula.', pos: Math.max(0, lower(text).indexOf(g)), len: g.length });
        });
        p.names.forEach(function(n) {
            var l = lower(n), target = known[l];
            if (!target && (l === 'rolltotal' || l === 'natural') && (ansV || /(^|\.)(then|band)\./.test(prop))) target = { id: '', key: l === 'natural' ? 'Natural' : 'RollTotal', kind: 'number', vis: 'all', noEdge: true };   // 1.6.2: what the roll came to, and its dice alone
            if (!target && l === 'rollcrit' && (ansV || /(^|\.)(then|band)\./.test(prop))) target = { id: '', key: 'RollCrit', kind: 'number', vis: 'all', noEdge: true };   // 1.5.8: a roll's consequence reads its critical
            if (!target && l === 'rollmargin' && (ansV || /(^|\.)(then|band)\./.test(prop))) target = { id: '', key: 'RollMargin', kind: 'number', vis: 'all', noEdge: true };   // 1.5.8: and how far it beat its target
            if (!target && l === 'rollbig' && (ansV || /(^|\.)(then|band)\./.test(prop))) target = { id: '', key: 'RollBig', kind: 'number', vis: 'all', noEdge: true };   // 1.6.0: and whether it lands as a heavy hit
            if (!target && l === 'onself' && nearV) target = { id: '', key: 'OnSelf', kind: 'number', vis: 'all', noEdge: true };   // 1.5.9: a roll or an action that Applies to an adjacent character reads whom it is used on
            if (!noticeV && l === 'targetloud' && !ix[l]) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in a side vision check.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (!target && l === 'attemptmargin') { if (!resistV) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in a roll ticked Resists an attempt.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'AttemptMargin', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.0 (B2)
            if (!target && (l === 'attackerdark' || l === 'attackerdarkpen')) { if (!resistV) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in a roll ticked Resists an attempt.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: l === 'attackerdark' ? 'AttackerDark' : 'AttackerDarkPen', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.2: the darkness at the attacker's place
            if (!target && !ix.attempt && l === 'attempt.type') { if (!resistV) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in a roll ticked Resists an attempt.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'Attempt.type', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.2
            if (!target && !ix.attempt && l === 'attempt.kind') { if (!resistV) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in a roll ticked Resists an attempt.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'Attempt.kind', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.0
            if (!target && !ix.attempter && l.indexOf('attempter.row.') === 0 && l.length > 14) { if (!resistV) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in a roll ticked Resists an attempt.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } var awk = l.slice(14), awOk = sys.fields.some(function(f) { return f.kind === 'item-list' && isObj(f.list) && ((Array.isArray(f.list.stats) ? f.list.stats : []).some(function(x) { return isObj(x) && typeof x.key === 'string' && lower(x.key) === awk && x.kind !== 'pick'; }) || (Array.isArray(f.list.cols) ? f.list.cols : []).some(function(x) { return isObj(x) && typeof x.key === 'string' && lower(x.key) === awk; })); }); if (!awOk) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": no list has a number stat or column ' + n.slice(14) + '.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'Attempter', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.2 (7)
            if (!target && !ix.attempter && l.indexOf('attempter.') === 0 && l.length > 10 && targetReadKey(sys, l.slice(10))) { if (!resistV) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in a roll ticked Resists an attempt.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'Attempter', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.0
            if (!target && !ix.target && l.indexOf('target.arc.') === 0 && l.length > 11) { if (!arcNamed(isObj(sys.combat) ? sys.combat.arcs : null, l.slice(11))) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": this system has no arc ' + n.slice(11) + '. Arcs are named on the Combat tab.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'Target', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.2 (13)
            if (!target && !ix.blow && l.indexOf('blow.arc.') === 0 && l.length > 9 && !arcNamed(isObj(sys.combat) ? sys.combat.arcs : null, l.slice(9))) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": this system has no arc ' + n.slice(9) + '. Arcs are named on the Combat tab.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // 1.6.2 (13)
            if (!target && !ix.blow && l.indexOf('blow.') === 0 && blowNamed(l.slice(5))) { if ((!blowV || (blowX && /(^|\.)cross\./.test(prop))) && !/^list\.col\./.test(prop) && !(prop === 'formula' && owner.kind === 'formula')) { errors.push({ id: owner.id, prop: prop, message: /(^|\.)cross\./.test(prop) ? crossStepSays(n) : '"' + n + '" is known only in a roll the damage step posts (a Major Wound\u2019s or a wound\u2019s), a roll ticked Reads the sheet as the blow left it, a list\u2019s column or a formula field: DR read for a blow reads it there, and anywhere else on the sheet it reads 0.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: n, kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.0 (the core's gaps 6 and 7)
            if (!target && !ix.hit && l.indexOf('hit.') === 0 && l.length > 4) { if (!blowV || !hitF || (blowX && /(^|\.)cross\./.test(prop))) { errors.push({ id: owner.id, prop: prop, message: /(^|\.)cross\./.test(prop) ? crossStepSays(n) : '"' + n + '" is known only in a roll the damage step posts or a roll ticked Reads the sheet as the blow left it, with hit locations set.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } var hT = wordTarget(hitF, l.slice(4), false); if (!hT || hT.ctrTotal || hT.pickTotal) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": ' + (hitF.label || hitF.key) + ' has no stat or column ' + n.slice(4) + '.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = Object.assign({}, hT, { noEdge: true }); }
            if (!target && !ix.target && l === 'target.inarc' && !targetReadKey(sys, 'inarc')) { if (!rowList || !isObj(rowList.list) || !isObj(rowList.list.arc)) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in a list whose rows say their arc (Arcs by, on the Lists tab).', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'Target.inArc', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.2 (vehicles, fold (b))
            if (!target && !ix.target && l.indexOf('target.') === 0 && l.length > 7 && targetReadKey(sys, l.slice(7))) target = { id: '', key: 'Target', kind: 'number', vis: 'all', noEdge: true };   // 1.6.0
            if (!target && !ix.target && (l === 'target.postureranged' || l === 'target.aimed' || l === 'target.coverorposture')) { if (!(isObj(sys.combat) && sys.combat.postureOnAttack === true)) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only where the Combat tab ticks An attack reads its target\u2019s posture.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: n, kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.0
            if (!target && !ix.target && l.indexOf('target.marked.') === 0 && l.length > 14) { if (!tagOf(sys, l.slice(14))) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": this system has no mark ' + n.slice(14) + '. Marks are named on the Combat tab.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'Target', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.2 (vehicles, fold (c))
            if (!target && !ix.mapkind && !linkByKey(sys).mapkind && l.indexOf('mapkind.') === 0 && l.length > 8) { if (!mapKindByKey(sys, l.slice(8))) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": this system has no map kind ' + n.slice(8) + '. Map kinds are named on the Combat tab.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'MapKind', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.2 (vehicles, fold (g))
            if (!target && !ix.scene && !linkByKey(sys).scene && l.indexOf('scene.') === 0 && l.length > 6) { if (!sceneByKey(sys, l.slice(6))) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": this system has no scene channel ' + n.slice(6) + '. Channels are named on the Combat tab.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'Scene', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.2
            if (!target && !ix.target && l === 'target.reaction') { if (!rollsKeepScene(sys)) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only where a roll is ticked Kept for the scene.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: n, kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.2
            if (!target && !ix.mapfactor && !linkByKey(sys).mapfactor && l.indexOf('mapfactor.') === 0 && l.length > 10) { if (!mapFactorNamed(sys, l.slice(10))) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": no map kind of this system names a factor ' + n.slice(10) + '. Map kinds are named on the Combat tab.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'MapFactor', kind: 'number', vis: 'all', noEdge: true }; }
            if (!target && !ix.marked && !linkByKey(sys).marked && l.indexOf('marked.') === 0 && l.length > 7) { if (!tagOf(sys, l.slice(7))) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": this system has no mark ' + n.slice(7) + '. Marks are named on the Combat tab.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'Marked', kind: 'number', vis: 'all', noEdge: true }; }
            if (!target && !ix.target && l.indexOf('target.hit.') === 0 && l.length > 11) { var thF = targetHitList(sys); if (!thF) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only where the Combat tab names the list of hit locations (Called shots read).', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } var thT = wordTarget(thF, l.slice(11), false); if (!thT || thT.ctrTotal || thT.pickTotal) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": ' + (thF.label || thF.key) + ' has no stat or column ' + n.slice(11) + '.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = Object.assign({}, thT, { noEdge: true }); }   // 1.6.0 (B5): the target's own location row
            if (!target && !ix.presser && l.indexOf('presser.') === 0 && l.length > 8) { if (!(Array.isArray(sys.links) ? sys.links : []).some(function(k) { return isObj(k) && k.kind === 'crew' && k.press === true && k.group; })) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only where a Crew link lets its crew press this sheet\u2019s rolls and the vehicle reads its crew as a group.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'Presser', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.0
            if (!target && !ix.ask && l.length > 4 && l.indexOf('ask.') === 0) { if (!askV || !askV[l.slice(4)]) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in a roll or an action that asks it.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: n, kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.2
            if (!target && l === 'effectnumber') { if (!endV) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is known only in what happens when an effect ends.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: 'EffectNumber', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.2
            if (!target && (l === 'crossstep' || l === 'crossed')) { if (!crossV || /(^|\.)cross\./.test(prop)) { errors.push({ id: owner.id, prop: prop, message: /(^|\.)cross\./.test(prop) ? crossStepSays(n) : '"' + n + '" is known only in a roll or an action that runs When a value crosses.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = { id: '', key: l === 'crossstep' ? 'CrossStep' : 'Crossed', kind: 'number', vis: 'all', noEdge: true }; }   // 1.6.0
            if (!target && l === 'onself') { errors.push({ id: owner.id, prop: prop, message: '"OnSelf" is known only in a roll or an action that Applies to the user or an adjacent character.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (!target && l.length > 3 && l.indexOf('on.') === 0) { if (!nearV) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" reads the one it is used on, so it is known only in a roll or an action that Applies to the user or an adjacent character.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } var tbOn0 = tableT(n.slice(3), null); target = known[l.slice(3)] || (tbOn0 && !tbOn0.rowOutside ? tbOn0 : null); }   // 1.6.0: On.<name>, the one it is used on (a table read too)
            if (!target && figK) { var fvT = figVeh(figK, ix, n); if (fvT && groupReadV(fvT)) { warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" reads the crew again, so inside a figure it reads 0.' }); target = { id: '', key: n, kind: 'number', vis: 'all', noEdge: true }; } }   // the core handbook session's ask (after ask 6): a vehicle name that is itself a group read
            if (!target) { var lt = listTarget(n, rowList); if (lt && lt.rowOutside) { errors.push({ id: owner.id, prop: prop, message: rowOutSays(n), pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } target = lt; } if (!target) target = linkT(n) || crewT(n) || holdT(n);   // 1.6.2: holdT; F5a1; 1.6.0: a linked sheet's name, or its crew's as a group
            if (!target) { target = placeT(n); if (target && target.says) warnings.push({ id: owner.id, prop: prop, message: target.says }); }   // 1.6.0: Posture.<posture>, Type.<key>, Place.<stat>.<value>, Value.<key>.<value>
            if (!target) { target = tableT(n, rowList); if (target && target.rowOutside) { errors.push({ id: owner.id, prop: prop, message: rowOutSays(n), pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; } if (target && target.says) warnings.push({ id: owner.id, prop: prop, message: target.says }); }   // 1.6.0: a system's tables
            if (target && target.noChamber) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" reads a chambered round, but ' + (target.list.label || target.list.key) + ' has no Chambers from.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // 1.5.9
            if (target && target.ctrTotal) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is a counter, so it has no ' + (target.ext ? 'highest or lowest' : 'total') + ': read one row (' + target.list.key + '.<key>.' + n.split('.').pop() + ').', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // R2
            if (target && target.pickTotal) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is a choice, so it has no ' + (target.ext ? 'highest or lowest' : 'total') + ': read one row (' + target.list.key + '.<key>.' + n.split('.').pop() + ').', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // F5a2
            if (target && target.extWord) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '": the highest and the lowest read a number stat, a column or a counter of ' + (target.list.label || target.list.key) + ', not ' + n.split('.').pop() + '.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // 1.5.4
            if (isRollProp(prop) && n.length > 64) { errors.push({ id: owner.id, prop: prop, message: 'A roll carries names of 64 characters at most: "' + n + '" has ' + n.length + '.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }   // F5a1 (critic 8): the dice path refuses a longer one
            if (!target) { var s = suggest(n, keys); errors.push({ id: owner.id, prop: prop, message: 'Unknown name "' + n + '"' + (s ? '. Did you mean "' + s + '"?' : ''), pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (!NUMERIC[target.kind] && !wordsOk(p, n, target)) { errors.push({ id: owner.id, prop: prop, message: '"' + n + '" is ' + (target.kind === 'notes' ? 'a notes field' : (target.kind === 'effects' || target.kind === 'item-list') ? 'a list' : 'text') + ', not a number.', pos: Math.max(0, lower(text).indexOf(l)), len: n.length }); return; }
            if (target.list) {   // F5a1: what a list name reads
                if (target.onTotal && !(isObj(target.list.list) && isObj(target.list.list.on))) warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" counts rows switched on, but ' + (target.list.label || target.list.key) + ' has no switch, so it reads as none.' });
                if (target.addr) { var tc = isObj(target.list.list) && Array.isArray(target.list.list.cats) && target.list.list.cats.length ? target.list.list.cats : null, has = (Array.isArray(sys.items) ? sys.items : []).concat(Array.isArray(sys.core) ? sys.core : []).some(function(it) { return isObj(it) && typeof it.key === 'string' && lower(it.key) === target.addr && (!tc || catIn(tc, it.category)); }); if (!has) warnings.push({ id: owner.id, prop: prop, message: 'No item in ' + (target.list.label || target.list.key) + ' has the key "' + n.split('.')[1] + '"' + (target.spec ? '. "' + n + '" then finds only rows whose own name says it, and with none it reads as not carried.' : ': it reads as not carried until a row its player can see has it.') }); }
                if (vis === 'all' && target.gmKey && gmP[owner.id] !== 1) warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" names a GM-only item: ' + (isApplyProp(prop) ? (/(^|\.)then\./.test(prop) ? 'players\u2019 rolls will not apply it.' : 'players will not get this action.') : prop === 'spill' ? 'their own apps do not show the spill, and the host still makes it.' : (prop === 'needs' || prop === 'lock' || /^needsWhy\./.test(prop)) ? 'players are not held back by it.' : (prop.indexOf('list.needs.') === 0 || prop.indexOf('list.needsWhy.') === 0) ? 'players\u2019 rolls are not held back by it.' : prop === 'turn.face' ? 'players\u2019 turns are not counted by it.' : prop === 'turn.move' ? 'players\u2019 moves are not limited by it.' : prop === 'turn.run' ? 'players have the one move.' : (prop === 'malf' || prop.indexOf('list.malf.') === 0) ? 'players\u2019 rolls never malfunction by it.' : (prop === 'dmgMajorIf' || prop.indexOf('list.mjif.') === 0) ? 'it never marks a Major Wound, on a player\u2019s roll or the GM\u2019s.' : (prop === 'dmg2' || prop.indexOf('list.dmg2.') === 0) ? 'the players\u2019 view drops this second part, so their rolls deal none of it, and the GM\u2019s own roll keeps its card private.' : /^(list\.)?dmg[345](\.|$)/.test(prop) ? 'the players\u2019 view drops this part, so their rolls deal none of it, and the GM\u2019s own roll keeps its card private.' : /^list\.ad[345]\./.test(prop) ? 'the players\u2019 view drops this armor divisor, and the GM\u2019s own roll keeps its card private.' : prop.indexOf('list.ad2.') === 0 ? 'the players\u2019 view drops this armor divisor, and the GM\u2019s own roll keeps its card private.' : (prop === 'critAt' || prop === 'fumbleAt' || prop.indexOf('list.critAt.') === 0 || prop.indexOf('list.fumbleAt.') === 0) ? 'players\u2019 rolls read the usual critical range instead.' : (prop === 'bigAt' || prop.indexOf('list.bigAt.') === 0) ? 'players\u2019 rolls never land as a heavy hit by it.' : prop === 'list.modsif' ? 'Save drops it, so the rows give their changes whatever it says.' : prop === 'list.fitif' ? 'the players\u2019 view drops it, so their parts are not judged by it.' : prop.indexOf('list.roll.') === 0 ? 'players will not get this roll.' : prop.indexOf('link.figs.') === 0 ? 'the players\u2019 view drops this figure, so it reads 0 for them.' : 'players will see an error for this ' + (prop === 'roll' || prop === 'rollFormula' ? 'roll' : 'field') + '.') });
            }
            if (vis === 'all' && (target.vis === 'gm' || gmP[target.id] === 1) && gmP[owner.id] !== 1) warnings.push({ id: owner.id, prop: prop, message: '"' + n + '" is GM only: ' + (isApplyProp(prop) ? (/(^|\.)then\./.test(prop) ? 'players\u2019 rolls will not apply it.' : 'players will not get this action.') : prop === 'spill' ? 'their own apps do not show the spill, and the host still makes it.' : (prop === 'needs' || prop === 'lock' || /^needsWhy\./.test(prop)) ? 'players are not held back by it.' : (prop.indexOf('list.needs.') === 0 || prop.indexOf('list.needsWhy.') === 0) ? 'players\u2019 rolls are not held back by it.' : prop === 'turn.face' ? 'players\u2019 turns are not counted by it.' : prop === 'turn.move' ? 'players\u2019 moves are not limited by it.' : prop === 'turn.run' ? 'players have the one move.' : (prop === 'malf' || prop.indexOf('list.malf.') === 0) ? 'players\u2019 rolls never malfunction by it.' : (prop === 'dmgMajorIf' || prop.indexOf('list.mjif.') === 0) ? 'it never marks a Major Wound, on a player\u2019s roll or the GM\u2019s.' : (prop === 'dmg2' || prop.indexOf('list.dmg2.') === 0) ? 'the players\u2019 view drops this second part, so their rolls deal none of it, and the GM\u2019s own roll keeps its card private.' : /^(list\.)?dmg[345](\.|$)/.test(prop) ? 'the players\u2019 view drops this part, so their rolls deal none of it, and the GM\u2019s own roll keeps its card private.' : /^list\.ad[345]\./.test(prop) ? 'the players\u2019 view drops this armor divisor, and the GM\u2019s own roll keeps its card private.' : prop.indexOf('list.ad2.') === 0 ? 'the players\u2019 view drops this armor divisor, and the GM\u2019s own roll keeps its card private.' : (prop === 'critAt' || prop === 'fumbleAt' || prop.indexOf('list.critAt.') === 0 || prop.indexOf('list.fumbleAt.') === 0) ? 'players\u2019 rolls read the usual critical range instead.' : (prop === 'bigAt' || prop.indexOf('list.bigAt.') === 0) ? 'players\u2019 rolls never land as a heavy hit by it.' : prop === 'list.modsif' ? 'Save drops it, so the rows give their changes whatever it says.' : prop === 'list.fitif' ? 'the players\u2019 view drops it, so their parts are not judged by it.' : prop.indexOf('list.roll.') === 0 ? 'players will not get this roll.' : prop.indexOf('link.figs.') === 0 ? 'the players\u2019 view drops this figure, so it reads 0 for them.' : 'players will see an error for this ' + (prop === 'roll' || prop === 'rollFormula' ? 'roll' : 'field') + '.') });
            if (!isRollProp(prop) && !isApplyProp(prop) && prop !== 'spill' && prop !== 'track' && prop !== 'surcharge' /* 1.6.2: Costs more while is read only when a cost is paid, never as the pool's value, so a pool may read itself there */ && prop.indexOf('fill.') !== 0 && prop !== 'lock' /* 1.6.3: a lock is read only when a hand edits the field, never as its value, so a field may read itself there */ && !target.noEdge) { var from = lower(owner.key); (edges[from] = edges[from] || []).push(lower(target.key)); }
        });
    }
    sys.fields.forEach(function(f) {
        var p = DEF_PROP[f.kind];
        if (f.kind === 'item-list' && typeof f.key === 'string' && f.key.indexOf('.') >= 0) errors.push({ id: f.id, prop: 'key', message: 'An item list\u2019s key cannot contain a dot: formulas read it as ' + f.key.split('.')[0] + '.<name>, so its totals and rows have no names.' });   // owed review F5a1#6
        if (gmP[f.id] === 1) warnings.push({ id: f.id, prop: 'maxFormula', message: 'The max reads a GM-only value, so this pool is GM only: players will not see it.' });
        if (p && !(p === 'base' && f.base === '')) checkFormula(f, p, f[p], false, f.vis);   // a skill with no base is ranks alone
        if (f.kind === 'resource' && isObj(f.spill) && f.spill.at === 'f' && typeof f.spill.below === 'string' && f.spill.below) checkFormula(f, 'spill', f.spill.below, false, f.vis);
        if (f.kind === 'resource' && isObj(f.surcharge) && typeof f.surcharge['if'] === 'string' && f.surcharge['if']) checkFormula(f, 'surcharge', f.surcharge['if'], false, f.vis);   // 1.6.2 Costs more while   // 1.6.0 Spills into: below a formula
        if (f.kind === 'number' && isObj(f.override)) { checkFormula(f, 'override.when', f.override.when, false, f.vis); checkFormula(f, 'override.value', f.override.value, false, f.vis); }   // 205 (6): Taken from, and while
        if (isObj(f.lock) && typeof f.lock['if'] === 'string' && f.lock['if']) checkFormula(f, 'lock', f.lock['if'], false, f.vis);   // 1.6.3 (backlog 170): Locked while
        if (typeof f.auto === 'string' && f.auto) checkFormula(f, 'auto', f.auto, false, f.vis);   // 1.6.2 (auto apply): Worked out until typed
        if (Array.isArray(f.fills)) f.fills.forEach(function(x, i) { if (!isObj(x)) return; var tgV = fieldById(sys, x.f); if (!autoKindOf(tgV)) { warnings.push({ id: f.id, prop: 'fill.' + i, message: 'A field this fills is not a number, a toggle, a height or a weight here any more.' }); return; } checkFormula(f, 'fill.' + i, x.formula, false, f.vis); });   // ... and Typing it fills (no edge of the loop graph: a fill is written, never read)
        if (isObj(f.track) && f.track.of) checkFormula(f, 'track', f.track.of, false, f.vis);   // 1.6.2: a track's Out of (display only: no edge of the loop graph)
        if (f.roll) checkFormula(f, 'roll', f.roll, true, f.vis);
        if (f.caption) {   // Fold B: each {formula} in the caption, as warnings
            var cre = /\{([^{}]{1,300})\}/g, cm, cn = 0;
            while ((cm = cre.exec(f.caption))) {
                var drawn = ++cn <= LIMITS.captionExprs, cp = F.parse(capExpr(cm[1]).expr);
                if (!cp.ok) { if (drawn) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: ' + cp.error.message }); continue; }
                if (drawn && hasDice(cp.ast.body)) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: dice are not worked out in a caption; put them in a roll.' });
                cp.names.forEach(function(nm) {
                    var tg = known[lower(nm)] || listT(nm);   // F5a1: a list's names too
                    if (!tg) { if (drawn) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: unknown name "' + nm + '".' }); }
                    else if (!NUMERIC[tg.kind]) { if (drawn) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: "' + nm + '" is not a number.' }); }
                    else if (f.vis === 'all' && (tg.vis === 'gm' || gmP[tg.id] === 1) && gmP[f.id] !== 1) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: "' + nm + '" is GM only, so players will not see this caption.' });
                });
            }
            if (cn > LIMITS.captionExprs) warnings.push({ id: f.id, prop: 'caption', message: 'Caption: only the first ' + LIMITS.captionExprs + ' {\u2026} values are worked out; the rest show as written.' });   // Stage 6
        }
    });
    // 1.6.0: what the editor says of a change that switches an effect, and of one that sets its row's quantity or one of its stats
    var fxSays = function(id, prop, c, vis, lf, key) {   // lf and key: a list's own change, whose With number knows Row.* as its amounts do (the review of 1.6.3's editor fold)
        var d = null; (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(x) { if (!d && isObj(x) && x.id === c.fx) d = x; });
        if (!d) { errors.push({ id: id, prop: prop, message: 'Pick the effect this switches: that one is gone.' }); return; }
        if (!sys.fields.some(function(x) { return isObj(x) && x.kind === 'effects'; })) errors.push({ id: id, prop: prop, message: 'The sheet has no status effects list, so "' + (d.name || d.id) + '" cannot go on.' });
        else if (vis === 'all' && d.vis === 'gm') warnings.push({ id: id, prop: prop, message: '"' + (d.name || d.id) + '" is GM only: players will not get this.' });
        if (typeof c.n === 'string' && c.n) { if (!isObj(d.val)) warnings.push({ id: id, prop: prop, message: '"' + (d.name || d.id) + '" holds no number, so its With number does nothing.' }); else checkFormula({ id: id, key: key || id }, prop, c.n, false, vis, lf); }   // 1.6.2: the number it goes on with
    };
    var allSays = function(id, prop, c, vis, then) {   // 1.6.0: a system entry's change on every row of a list: an item list of the system, a number stat of it, and a list players see where the entry is theirs
        var lf = fieldById(sys, c.list);
        if (!lf || lf.kind !== 'item-list') { errors.push({ id: id, prop: prop, message: 'Pick the list this changes on every row: that one is gone.' }); return; }
        if (typeof c.sw === 'boolean') {   // 1.6.2 (167 A): every row's switch: a list that has one, no amount
            if (!isObj(lf.list) || !isObj(lf.list.on)) errors.push({ id: id, prop: prop, message: (lf.label || lf.key) + ' has no switch, so its rows cannot be switched ' + (c.sw ? 'on' : 'off') + '. Tick Rows have a switch on the list.' });
            else if (vis === 'all' && lf.vis === 'gm') warnings.push({ id: id, prop: prop, message: '"' + lf.key + '" is GM only: ' + (then ? 'players’ rolls will not change it.' : 'players will not get this action.') });
            return;
        }
        if (!(isObj(lf.list) && Array.isArray(lf.list.stats) ? lf.list.stats : []).some(function(t) { return isObj(t) && t.kind !== 'pick' && typeof t.key === 'string' && lower(t.key) === lower(c.s); })) errors.push({ id: id, prop: prop, message: 'Pick the stat this changes on every row: "' + c.s + '" is no number stat of ' + (lf.label || lf.key) + '.' });
        else if (vis === 'all' && lf.vis === 'gm') warnings.push({ id: id, prop: prop, message: '"' + lf.key + '" is GM only: ' + (then ? 'players\u2019 rolls will not change it.' : 'players will not get this action.') });
        else if (vis === 'all' && readsRow(c.formula, F) && !allRowOk({ fields: gmViewFields(sys, F), items: sys.items, core: sys.core, tables: sys.tables, values: sys.values, decks: sys.decks, effects: sys.effects }, F, lf, c.formula)) warnings.push({ id: id, prop: prop, message: 'Its row names read a value worked out from a GM-only one in ' + (lf.label || lf.key) + ': ' + (then ? 'players\u2019 rolls will not change it.' : 'players will not get this action.') });   // 1.6.0: worked out row by row (allRowOk)
    };
    var allList = function(c) { var lf = fieldById(sys, c.list); return lf && lf.kind === 'item-list' ? lf : undefined; };
    var randSays = function(id, prop, c, vis, then) {   // 1.6.2 (fold (f)): a random row of a list: an item list with a switch, its test and next step read with that list's row names
        var lf = fieldById(sys, c.rand);
        if (!lf || lf.kind !== 'item-list') { errors.push({ id: id, prop: prop, message: 'Pick the list a row is picked from: that one is gone.' }); return; }
        if (!isObj(lf.list) || !isObj(lf.list.on)) { errors.push({ id: id, prop: prop, message: (lf.label || lf.key) + ' has no switch, so no row of it can be switched off.' }); return; }
        if (vis === 'all' && lf.vis === 'gm') warnings.push({ id: id, prop: prop, message: '"' + lf.key + '" is GM only: ' + (then ? 'players\u2019 rolls will not change it.' : 'players will not get this action.') });
        if (c.test) checkFormula({ id: id, key: id }, prop + '.test', c.test, false, vis, lf);
        if (isObj(c.next)) { if (!(Array.isArray(lf.list.stats) ? lf.list.stats : []).some(function(t) { return isObj(t) && t.kind !== 'pick' && typeof t.key === 'string' && lower(t.key) === lower(c.next.s); })) errors.push({ id: id, prop: prop + '.next', message: 'Pick the stat a row already off changes: "' + c.next.s + '" is no number stat of ' + (lf.label || lf.key) + '.' }); else checkFormula({ id: id, key: id }, prop + '.next', c.next.formula, false, vis, lf); }
    };   // 1.6.0: Row.* is known in a change on every row of a list, with that list's names
    var rowSays = function(lf, prop, c) {
        if (typeof c.s === 'string' && !(isObj(lf.list) && Array.isArray(lf.list.stats) ? lf.list.stats : []).some(function(t) { return isObj(t) && t.kind !== 'pick' && typeof t.key === 'string' && lower(t.key) === lower(c.s); })) errors.push({ id: lf.id, prop: prop, message: 'Pick the stat this changes: "' + c.s + '" is no number stat of this list.' });
    };
    // 1.6.0 (the live test, 2026-10-30): an attempt comes only from a roll that succeeds against its target, so a roll whose formula is no check (a plain damage roll) never makes one
    var noCheck = function(fm) { var p = F && typeof fm === 'string' && fm ? F.parse(fm) : null, t = p && p.ok && isObj(p.ast) ? p.ast.top || p.ast.body : null; return !!(isObj(t) && t.t !== 'cmp'); }, NO_CHECK = 'Resisted by does nothing here: this roll has no check, so it never succeeds against its target and nothing is posted to the target.';
    sys.rolls.forEach(function(r) {
        rollG = rollGroups(r.formula); nearV = onOther(r); crossV = isObj(r.cross); resistV = r.resist === true; blowV = blowRolls[r.id] === 1 || crossBlow(r); blowX = blowRolls[r.id] !== 1 && crossBlow(r);   // 1.5.9; 1.6.0: crossV; B2: resistV; the core's gaps 6 and 7: blowV; 1.6.2 (242): or a crossing that reads the sheet as the blow left it
        withV = r.resist === true && !Array.isArray(r.apply) && typeof r.withRow === 'string' ? fieldById(sys, r.withRow) : null; if (withV && withV.kind !== 'item-list') withV = null;   // 1.6.3 (defense fold 2)
        if (typeof r.withRow === 'string' && !withV) warnings.push({ id: r.id, prop: 'withRow', message: 'Answered with a row of names a list that is not here, so Save takes it off.' });
        else if (withV && r.vis !== 'gm' && withV.vis === 'gm') warnings.push({ id: r.id, prop: 'withRow', message: '"' + (withV.label || withV.key) + '" is GM only, so a player\u2019s card never offers this roll. Their defense card comes to you instead.' });
        askV = askOf(r); if (askV) { r.asks.forEach(function(a) { if (isObj(a) && a.kind === 'num') { var sv = askV; askV = null; if (a.min) checkFormula({ id: r.id, key: r.id }, 'ask.min', a.min, false, r.vis); if (a.max) checkFormula({ id: r.id, key: r.id }, 'ask.max', a.max, false, r.vis); askV = sv; } }); if (r.every || r.inFight || r.cross || (r.each && !r.by)) warnings.push({ id: r.id, prop: 'asks', message: 'When it runs by itself nobody is asked, so each question takes its first answer.' }); }
        if (typeof r.resistBy === 'string' && noCheck(r.formula)) warnings.push({ id: r.id, prop: 'resistBy', message: NO_CHECK });
        if (typeof r.resistBy === 'string' && !sys.rolls.some(function(x) { return isObj(x) && x.id === r.resistBy && x.resist === true && !x.apply; })) warnings.push({ id: r.id, prop: 'resistBy', message: 'Resisted by names a roll that is not ticked Resists an attempt, so nothing is posted to the target.' });   // 1.6.0 (B2)
        if (Array.isArray(r.resistOr) && r.resistOr.some(function(id) { return !resistOrOk(sys, id); })) warnings.push({ id: r.id, prop: 'resistOr', message: 'Or resisted by names a roll that is not ticked Resists an attempt, so the target is not offered it.' });   // 1.6.0 (the core's gap 5)
        landSays(sys, r).forEach(function(m) { warnings.push({ id: r.id, prop: 'landDmg', message: m }); }); if (r.landDmg !== undefined && noCheck(r.formula)) warnings.push({ id: r.id, prop: 'landDmg', message: 'Its damage never comes: this roll has no check, so it never succeeds against its target.' });   // 1.6.3 (defense fold 1)
        if (nearV && !(Array.isArray(r.apply) ? r.apply : Array.isArray(r.then) ? r.then : []).some(function(c) { return isObj(c) && (!!c.f || typeof c.fx === 'string' || typeof c.list === 'string'); })) warnings.push({ id: r.id, prop: 'to', message: 'It applies to an adjacent character, but no change of it names a value, so nothing lands on the one it is used on.' });
        if (r.needs) checkFormula({ id: r.id, key: r.id }, 'needs', r.needs, false, r.vis);   // 1.5.4: what a roll or an apply action needs (no dice)
        (Array.isArray(r.needsWhy) ? r.needsWhy : []).forEach(function(l, k) { if (isObj(l) && typeof l['if'] === 'string' && l['if']) checkFormula({ id: r.id, key: r.id }, 'needsWhy.' + k, l['if'], false, r.vis); });   // 1.6.2: and each of its reasons, alike, each under a prop of its own (needsWhy.<k>), so the editor marks that reason
        if (isObj(r.cross)) {   // 1.6.2 (the review of backlog 242): its crossing's own steps, First at and Then every (no dice), the GM's alone, since only the machine that owns the campaign works them out
            // They are read on the sheet as it stands, before the roll runs, so while they are checked nothing of the roll's own moment is known: no blow
            // (Blow. and Hit. names, even on a roll ticked Reads the sheet as the blow left it), no answer, no attempt and no one it is used on. CrossStep
            // and Crossed are refused there by their prop (cross.*), which the messages read too
            var sbV = blowV, sbX = blowX, snV = nearV, srV = resistV, saV = askV, swV = withV; blowV = false; blowX = false; nearV = false; resistV = false; askV = null; withV = null;
            if (typeof r.cross.at === 'string' && r.cross.at) checkFormula({ id: r.id, key: r.id }, 'cross.at', r.cross.at, false, 'gm');
            if (typeof r.cross.step === 'string' && r.cross.step) checkFormula({ id: r.id, key: r.id }, 'cross.step', r.cross.step, false, 'gm');
            blowV = sbV; blowX = sbX; nearV = snV; resistV = srV; askV = saV; withV = swV;
        }
        if (r.critOk && r.resist === true) { var cwV = withV; withV = null; checkFormula({ id: r.id, key: r.id }, 'critOk', r.critOk, false, 'gm'); withV = cwV; }   // 1.6.3 (defense fold 2): read on the defender with no row   // 1.6.2: Answers a critical where (no dice), read on the defender, the host's alone
        if (Array.isArray(r.calls)) { r.calls.forEach(function(cl, j) { if (isObj(cl) && cl.if) checkFormula({ id: r.id, key: r.id }, 'calls', cl.if, false, r.vis); if (isObj(cl) && cl.byIf) checkByIf({ id: r.id, key: r.id }, 'byIf.' + j, cl); }); callSays(sys, r).forEach(function(m) { warnings.push({ id: r.id, prop: 'calls', message: m }); }); }   // 1.6.0: Calls for
        if (r.dmgMajorIf) checkFormula({ id: r.id, key: r.id }, 'dmgMajorIf', r.dmgMajorIf, false, r.vis);   // 1.6.0: A Major Wound where (no dice)
        if (r.resist === true && Array.isArray(r.answers)) { checkAns({ id: r.id, key: r.id }, 'answers.', r.answers, withV); ansSays(sys, r).forEach(function(m) { warnings.push({ id: r.id, prop: 'answers', message: m }); }); }   // 1.6.3 (defense fold 3): When it answers an attack
        if (r.hits) checkFormula({ id: r.id, key: r.id }, 'hits', r.hits, false, r.vis);   // 1.6.0: Hits it rolls for (no dice)
        if (r.dmg === true) { dkindSays(r.id, r.id, 'dkind', r.dkind, r.vis, null); [2].concat(DMG_MORE).forEach(function(k) { if (r['dmg' + k]) dkindSays(r.id, r.id, 'dkind' + k, r['dkind' + k], r.vis, null); }); }   // 1.6.0: its kind, and each part's
        if (r.dmg2) checkFormula({ id: r.id, key: r.id }, 'dmg2', r.dmg2, true, r.vis);   // 1.6.0 (B3): a second part of the blow (dice allowed)
        DMG_MORE.forEach(function(k) { if (r['dmg' + k]) checkFormula({ id: r.id, key: r.id }, 'dmg' + k, r['dmg' + k], true, r.vis); });   // 1.6.0: a third and a fourth part, alike
        if (!r.apply) {
            checkFormula({ id: r.id, key: r.id }, 'rollFormula', r.formula, true, r.vis);
            if (r.malf) checkFormula({ id: r.id, key: r.id }, 'malf', r.malf, false, r.vis);   // Stage 6 HUD R3: its Malf (no dice)
            ['critAt', 'fumbleAt'].forEach(function(k) { if (!r[k]) return; checkFormula({ id: r.id, key: r.id }, k, r[k], false, r.vis); if (!fixedC) warnings.push({ id: r.id, prop: k, message: noRangeSays() }); });   // 1.6.0: its own critical range (no dice)
            if (r.bigAt) checkFormula({ id: r.id, key: r.id }, 'bigAt', r.bigAt, false, r.vis);   // 1.6.0: what lands as a heavy hit (no dice)
            if (Array.isArray(r.then)) r.then.forEach(function(c, i) { if (c.when === 'malf' && !r.malf) warnings.push({ id: r.id, prop: 'then.' + i, message: 'This roll has no Malf, so On malfunction never happens.' }); });
            if (Array.isArray(r.then)) r.then.forEach(function(c, i) { if ((c.when === 'crit' || c.when === 'fumble') && !crits) warnings.push({ id: r.id, prop: 'then.' + i, message: noCritSays(c.when) }); });   // 1.5.8
            // 1.6.3 (Fulllion's rulings of 2026-11-20): a Then hung on a result band happens only where the roll reads a band of that name once saved (bandsFor:
            // its own kept bands, else the Combat tab's, none on a damage roll), so a band left out, renamed or shadowed by the roll's own list is said here
            if (Array.isArray(r.then)) r.then.forEach(function(c, i) { if (typeof c.band !== 'string' || !c.band || c.band === '*') return; var bl = bandsFor(sys, r); if (r.dmg === true) warnings.push({ id: r.id, prop: 'then.' + i, message: 'On ' + c.band + ' never happens: a damage roll has no result bands.' }); else if (!bl.some(function(b) { return isObj(b) && typeof b.name === 'string' && lower(b.name) === lower(c.band); })) warnings.push({ id: r.id, prop: 'then.' + i, message: 'On ' + c.band + ' never happens: this roll has no result band called ' + c.band + '.' }); });
            if (Array.isArray(r.then)) {   // Stage 6 HUD R1: its consequences — as an apply action's changes; On success / On failure need a test
                var rp0 = F.parse(r.formula || ''), tests = !!(rp0.ok && rp0.ast && (rp0.ast.top || rp0.ast.body) && (rp0.ast.top || rp0.ast.body).t === 'cmp');
                r.then.forEach(function(c, i) {
                    var tp = 'then.' + i, tf0 = c.f ? fieldById(sys, c.f) : null;
                    if (typeof c.if === 'string' && c.if) checkFormula({ id: r.id, key: r.id }, tp + '.if', c.if, false, r.vis);   // 1.6.2: Only where
                    if (typeof c.fx === 'string') { fxSays(r.id, tp, c, r.vis); return; }   // 1.6.0: an effect switched
                    if (moreSays(r.id, r.id, tp, c, r.vis)) { if (c.when && !tests && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: r.id, prop: tp, message: 'This roll tests nothing (no comparison, like 3d6 <= Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' }); return; }
                    if (typeof c.rand === 'string') { randSays(r.id, tp, c, r.vis, true); return; }   // 1.6.2 (fold (f))
                    if (c.setOff === true) return;   // 1.6.2 (10): no pool, no amount
                    if (typeof c.list === 'string' && typeof c.sw === 'boolean') { allSays(r.id, tp, c, r.vis, true); if (typeof c.rows === 'string' && c.rows) checkFormula({ id: r.id, key: r.id }, tp + '.rows', c.rows, false, r.vis, allList(c)); return; }   // 1.6.2 (167 A): every row's switch
                    if (typeof c.list === 'string') { allSays(r.id, tp, c, r.vis, true); if (typeof c.rows === 'string' && c.rows) checkFormula({ id: r.id, key: r.id }, tp + '.rows', c.rows, false, r.vis, allList(c)); if (c.when && !tests && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: r.id, prop: tp, message: 'This roll tests nothing (no comparison, like 3d6 <= Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' }); checkFormula({ id: r.id, key: r.id }, tp, c.formula, c.roll === true, r.vis, allList(c)); rolledWarn(r.id, tp, c); return; }   // 1.6.0: every row of a list
                    if (!tf0 || APPLY_KINDS[tf0.kind] !== 1) errors.push({ id: r.id, prop: tp, message: 'Pick the pool or number this changes.' });
                    else if (r.vis === 'all' && (tf0.vis === 'gm' || gmP[tf0.id] === 1)) warnings.push({ id: r.id, prop: tp, message: '"' + tf0.key + '" is GM only: players\u2019 rolls will not change it.' });
                    if (c.when && !tests && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: r.id, prop: tp, message: 'This roll tests nothing (no comparison, like 3d6 <= Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' });
                    checkFormula({ id: r.id, key: r.id }, tp, c.formula, c.roll === true, r.vis); rolledWarn(r.id, tp, c);   // 1.5.9: a Rolled amount may roll dice
                });
            }
            return;
        }
        if (!r.apply.length) { errors.push({ id: r.id, prop: 'apply', message: 'An apply action needs a change: the pool or number it moves, and by how much.' }); return; }   // Stage 6 HUD H7
        r.apply.forEach(function(c, i) {
            var pr = 'apply.' + i, tf = c.f ? fieldById(sys, c.f) : null;
            if (typeof c.fx === 'string') { fxSays(r.id, pr, c, r.vis); return; }   // 1.6.0: an effect switched
            if (moreSays(r.id, r.id, pr, c, r.vis)) return;
            if (typeof c.rand === 'string') { randSays(r.id, pr, c, r.vis, false); return; }   // 1.6.2 (fold (f))
            if (c.setOff === true) return;   // 1.6.2 (10): no pool, no amount
            if (typeof c.list === 'string' && typeof c.sw === 'boolean') { allSays(r.id, pr, c, r.vis, false); if (typeof c.rows === 'string' && c.rows) checkFormula({ id: r.id, key: r.id }, pr + '.rows', c.rows, false, r.vis, allList(c)); return; }   // 1.6.2 (167 A): every row's switch
            if (typeof c.list === 'string') { allSays(r.id, pr, c, r.vis, false); if (typeof c.rows === 'string' && c.rows) checkFormula({ id: r.id, key: r.id }, pr + '.rows', c.rows, false, r.vis, allList(c)); checkFormula({ id: r.id, key: r.id }, pr, c.formula, c.roll === true, r.vis, allList(c)); rolledWarn(r.id, pr, c); return; }   // 1.6.0: every row of a list
            if (!tf || APPLY_KINDS[tf.kind] !== 1) errors.push({ id: r.id, prop: pr, message: 'Pick the pool or number this changes.' });
            else if (r.vis === 'all' && (tf.vis === 'gm' || gmP[tf.id] === 1)) warnings.push({ id: r.id, prop: pr, message: '"' + tf.key + '" is GM only: players will not get this action.' });
            checkFormula({ id: r.id, key: r.id }, pr, c.formula, c.roll === true, r.vis); rolledWarn(r.id, pr, c);   // 1.5.9: a Rolled amount may roll dice
        });
    });
    rollG = null; nearV = false; crossV = false; resistV = false; blowV = false; blowX = false; askV = null; withV = null;
    (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) {   // 1.6.2: an effect's end, its amounts reading EffectNumber
        if (!isObj(d) || typeof d.id !== 'string') return;
        if (Array.isArray(d.end)) { endV = true; try { d.end.forEach(function(c, i) { var pr = 'end.' + i; if (!isObj(c)) return; if (typeof c.fx === 'string') { fxSays(d.id, pr, c, d.vis); return; } var tf = c.f ? fieldById(sys, c.f) : null; if (!tf || APPLY_KINDS[tf.kind] !== 1) errors.push({ id: d.id, prop: pr, message: 'Pick the pool or number this changes.' }); checkFormula({ id: d.id, key: 'fx#' + d.id }, pr, c.formula, c.roll === true, d.vis); rolledWarn(d.id, pr, c); }); } finally { endV = false; } }
        if (typeof d.endRoll === 'string' && !(Array.isArray(sys.rolls) ? sys.rolls : []).some(function(r) { return isObj(r) && r.id === d.endRoll; })) errors.push({ id: d.id, prop: 'endRoll', message: 'The roll asked for when it ends is gone.' });
        if (typeof d.endsRest === 'string' && d.endsRest !== '-') {   // 1.6.2: the rest it ends with
            var rsV = (Array.isArray(sys.rests) ? sys.rests : []).filter(function(x) { return isObj(x) && x.id === d.endsRest; })[0];
            if (!rsV) errors.push({ id: d.id, prop: 'endsRest', message: 'The rest it ends with is gone, so its Duration is read again.' });
            else if (rsV.ends !== true) warnings.push({ id: d.id, prop: 'endsRest', message: (cutText(rsV.name, LIMITS.name) || 'That rest') + ' is not ticked Ends effects that last until this rest, so it ends nothing yet.' });
        }
    });
    // Stage 6 F5a1: each list's columns (no dice; Row.* known there), and field keys that would hide a list's names
    sys.fields.forEach(function(f) {
        if (lower(f.key) === 'row') errors.push({ id: f.id, prop: 'key', message: 'Row is the name a list\u2019s columns read their row by: give this field another key.' });
        var dp = lower(f.key).indexOf('.'); if (dp > 0 && lsts[lower(f.key).slice(0, dp)] && lsts[lower(f.key).slice(0, dp)] !== f) errors.push({ id: f.id, prop: 'key', message: 'A key starting "' + f.key.slice(0, dp) + '." would hide that list\u2019s own names: give this field another key.' });
        if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.cols)) return;
        f.list.cols.forEach(function(c) { if (isObj(c) && typeof c.key === 'string') checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '.' + lower(c.key) }, 'list.col.' + c.key, c.formula, false, f.vis, f); });
    });
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.badges)) f.list.badges.forEach(function(b, j) { if (isObj(b) && typeof b.if === 'string') { badgeNow = true; try { checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#badge' }, 'list.badge.' + j + '.' + (b.words || 'badge'), b.if, false, f.vis, f); } finally { badgeNow = false; } } }); });   // 1.6.0 R4: a badge's Shown where (no dice, Row.* known)
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.on) && typeof f.list.on.needs === 'string' && f.list.on.needs) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#onneeds' }, 'list.onneeds', f.list.on.needs, false, f.vis, f); });
    sys.fields.forEach(function(f) {   // the core handbook session's ask 5: Pays when its stat says reads a stat whose values say turn, round or clock
        var up = f.kind === 'item-list' && isObj(f.list) && isObj(f.list.upkeep) ? f.list.upkeep : null; if (!up || typeof up.eachBy !== 'string') return;
        var st = (Array.isArray(f.list.stats) ? f.list.stats : []).filter(function(s) { return isObj(s) && s.key === up.eachBy; })[0], nms = !st ? [] : st.kind === 'pick' ? (st.opts || []).map(function(o) { return isObj(o) ? o.label : ''; }) : (st.labels || []);
        var says = nms.map(function(n) { var m = /\b(turn|round|clock)s?\b/.exec(lower(String(n || ''))); return m ? m[1] : ''; });
        if (!says.some(Boolean)) warnings.push({ id: f.id, prop: 'list.upby', message: 'Keeps paying: none of ' + (st && st.label ? st.label : up.eachBy) + '\u2019s values says turn, round or clock, so every row pays as set.' });
        else if (says.indexOf('clock') >= 0 && !isObj(up.per)) warnings.push({ id: f.id, prop: 'list.upby', message: 'Keeps paying: a row whose ' + (st && st.label ? st.label : up.eachBy) + ' says clock pays nothing until Every is set.' });
    });
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list)) ['switchOn', 'switchOff'].forEach(function(k) { if (Array.isArray(f.list[k])) f.list[k].forEach(function(c, i) { if (isObj(c) && typeof c.formula === 'string' && c.formula) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#' + (k === 'switchOn' ? 'swon' : 'swoff') + i }, 'list.swc', c.formula, false, f.vis, f); }); }); });   // 1.6.2 (167 B): a switch's changes (no dice, Row.* known)
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.onRemove)) f.list.onRemove.forEach(function(c, i) { if (isObj(c) && typeof c.formula === 'string' && c.formula) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#onrm' + i }, 'list.onrm', c.formula, false, f.vis, f); }); });   // 1.6.0: When a row is taken off (no dice, Row.* known)
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.upkeep) && typeof f.list.upkeep.amt === 'string' && f.list.upkeep.amt) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#upkeep' }, 'list.upamt', f.list.upkeep.amt, false, f.vis, f); });   // 1.6.0 (CORE gap 13): an upkeep's amount (no dice, Row.* known)
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.on) && typeof f.list.on.showIf === 'string' && f.list.on.showIf) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#onshow' }, 'list.onshow', f.list.on.showIf, false, f.vis, f); });   // 1.6.0: where a row's switch is shown (no dice, Row.* known)   // 1.5.8: what a row's switch needs (no dice, Row.* known)
    sys.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.tiles) || !Array.isArray(f.list.tiles.boxes)) return; f.list.tiles.boxes.forEach(function(b, bi) { if (b['if']) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#tbif' + bi }, 'list.tileif', b['if'], false, f.vis, f); if (b.taken) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#tbtk' + bi }, 'list.tiletaken', b.taken, false, f.vis, f); }); });   // 1.6.2 (body fold 4)
    sys.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list)) return; if (Array.isArray(f.list.cols)) f.list.cols.forEach(function(c, ci) { if (isObj(c) && c.showIf) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#colshow' + ci }, 'list.colshow', c.showIf, false, f.vis, f); }); if (isObj(f.list.tradeRoll) && f.list.tradeRoll['if']) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#tradeif' }, 'list.tradeif', f.list.tradeRoll['if'], false, f.vis, f); });   // 1.6.2
    // 1.6.3 (Fulllion's rulings of 2026-11-20): a state's When is required, so a state with none is said as a warning, which holds no Save
    sys.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list)) return; if (isObj(f.list.tiles) && Array.isArray(f.list.tiles.states)) f.list.tiles.states.forEach(function(s, si) { if (s['if']) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#tstate' + si }, 'list.tilestate', s['if'], false, f.vis, f); else warnings.push({ id: f.id, prop: 'list.tilestate', message: (typeof s.label === 'string' && s.label.trim() ? s.label.trim() : 'A state') + ' never applies, since nothing says when a tile is in it' + (sys.fields.some(function(g) { return g && g.kind === 'item-list' && isObj(g.list) && isObj(g.list.stand) && g.list.stand.from === f.id && Array.isArray(g.list.stand.then) && g.list.stand.then.some(function(t2) { return isObj(t2) && t2.state === s.key; }); }) ? ', and the lines of When its place changes state that name it never run' : '') + '. Fill in \u201cWhen is a tile in this state?\u201d.' }); }); if (isObj(f.list.stand) && Array.isArray(f.list.stand.then)) f.list.stand.then.forEach(function(t, ti) { if (t['if']) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#sthen' + ti }, 'list.sthen', t['if'], false, f.vis, f); }); });   // 1.6.2 (body fold 8)
    sys.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.stand)) return; var st = f.list.stand; if (st.fits) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#standfits' }, 'list.standfits', st.fits, false, f.vis, f); if (st.counts) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#standcounts' }, 'list.standcounts', st.counts, false, f.vis, f); if (st.reach) { standAsk = true; checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#standreach' }, 'list.standreach', st.reach, false, f.vis, f); standAsk = false; } });   // 1.6.2 (body fold 2)
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.lock) && typeof f.list.lock['if'] === 'string') checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#lockif' }, 'list.lockif', f.list.lock['if'], false, f.vis); });   // 1.6.2 Locked while: no dice, the character's names
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.lay) && typeof f.list.lay['if'] === 'string' && f.list.lay['if']) { var lyF = fieldById(sys, f.list.lay.from); if (lyF) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#layif' }, 'list.layif', f.list.lay['if'], false, f.vis, lyF); } });
    sys.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list) || !isObj(f.list.lay) || !Array.isArray(f.list.lay.rules)) return; var lyR = fieldById(sys, f.list.lay.from); if (lyR) f.list.lay.rules.forEach(function(x, xi) { if (isObj(x) && typeof x['if'] === 'string' && x['if']) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#layrif' + xi }, 'list.layrif', x['if'], false, f.vis, lyR); }); });   // 1.6.2: a rule's own Only where, read as the list's   // 1.6.2 Laid from's Only where: no dice, the character's names and Row.* of the list it lays from
    // 1.6.3 Layers under a list's places: no dice, the holder's names and Row.* known. A layer may not read Row.covered, which is worked out from the
    // layers: the resolver reads it there as a loop (coveredOf), so the row would have no layer and clash as if the list had none
    sys.fields.forEach(function(f) {
        if (f.kind !== 'item-list' || !layered(f.list)) return; var e0 = errors.length;
        checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#layer' }, 'list.layer', f.list.on.layer, false, f.vis, f);
        if (errors.length > e0 || listKeyed(f.list, 'covered')) return;
        var lyN = []; try { lyN = F.names(f.list.on.layer) || []; } catch (e) { lyN = []; }
        if (lyN.some(function(n) { return lower(String(n)) === 'row.covered'; })) errors.push({ id: f.id, prop: 'list.layer', message: 'How high a row is worn cannot depend on whether it is covered, since that comes from how high the rows are worn. Take that name out, or Save drops it.', pos: 0, len: f.list.on.layer.length });
    });
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && typeof f.list.modsIf === 'string' && f.list.modsIf) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#modsif' }, 'list.modsif', f.list.modsIf, false, f.vis, f); });   // 1.6.0 Changes apply where: no dice, the holder's names and Row.* known
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && typeof f.list.throwIf === 'string' && f.list.throwIf) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#throwif' }, 'list.throwif', f.list.throwIf, false, f.vis, f); });   // 1.6.2 Thrown only where, read with the row's names
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && typeof f.list.subjectIf === 'string' && f.list.subjectIf) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#subjectif' }, 'list.subjectif', f.list.subjectIf, false, f.vis, f); });   // 1.6.0 Subject only where, read as Changes apply where is
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.parts)) { var pfV = partsSrc(sys, f.list); if (pfV) fitRows(f.list.parts).forEach(function(r, ri) { checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#fitif' + (ri || '') }, 'list.fitif', r['if'], false, f.vis, pfV); partsSrcs(sys, f.list).slice(1).forEach(function(pf2) { var e0 = errors.length; checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#fitif' + (ri || '') + '#' + pf2.id }, 'list.fitif', r['if'], false, f.vis, pf2); if (errors.length > e0) { errors.length = e0; warnings.push({ id: f.id, prop: 'list.fitif', message: 'A part from ' + (pf2.label || pf2.key) + ' never fits: this rule reads a name that list does not have.' }); } }); }); capTexts(f.list.parts).forEach(function(t, ci) { checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#capf' + ci }, 'list.capf', t, false, f.vis, f); }); } });   // 1.6.2: a rule read for a part of each list, a name another list lacks said as a warning   // 1.6.0 Fits where (ask 18): no dice, the part's own names (Row.*) and its host's (Host.*) known
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && typeof f.list.unheld === 'string' && f.list.unheld) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#unheld' }, 'list.unheld', f.list.unheld, false, f.vis, f); });   // 1.6.0 Rolls unheld entries: the Unheld level (no dice, Row.* known)
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.feeds)) f.list.feeds.forEach(function(fd) { if (isObj(fd) && typeof fd.turns === 'string' && fd.turns) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#feed' }, 'list.feedturns', fd.turns, false, f.vis, f); if (isObj(fd) && typeof fd['if'] === 'string' && fd['if']) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#feed' }, 'list.feedif', fd['if'], false, f.vis, f); }); });   // 1.6.0 Feeds: the turns a change takes (no dice, Row.* known)
    sys.fields.forEach(function(f) { if (f.kind !== 'item-list' || !isObj(f.list)) return; [['load', loadSrcAny], ['chamber', chamberSrc]].forEach(function(p) { var o = f.list[p[0]]; if (!isObj(o) || typeof o.takeIf !== 'string' || !o.takeIf) return; var sfV = p[1](sys, f.list); if (sfV) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#take' + p[0] }, 'list.takeif', o.takeIf, false, f.vis, sfV); }); });   // 1.6.2 Takes rows where: read with the source list's rows
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && isObj(f.list.chamber) && typeof f.list.chamber.needs === 'string' && f.list.chamber.needs) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#chneeds' }, 'list.chneeds', f.list.chamber.needs, false, f.vis, f); });   // 1.5.9 Chambers only where: what a row must meet to chamber (no dice, Row.* known)
    sys.fields.forEach(function(f) {   // F5b: a list's rolls — dice allowed, Row.* known
        if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.rolls)) return;
        f.list.rolls.forEach(function(r, i) {
            if (!isObj(r)) return;
            rollG = rollGroups(r.formula); nearV = onOther(r); crossV = isObj(r.cross); resistV = r.resist === true; askV = askOf(r);   // 1.5.9; 1.6.0: crossV; and resistV, a list's roll ticked Resists an attempt
            if (typeof r.resistBy === 'string' && noCheck(r.formula)) warnings.push({ id: f.id, prop: 'list', message: (r.label || 'A roll') + ': ' + NO_CHECK });   // prop list: said on the Lists tab, beside the box
            if (typeof r.resistBy === 'string' && !sys.rolls.some(function(x) { return isObj(x) && x.id === r.resistBy && x.resist === true && !x.apply; })) warnings.push({ id: f.id, prop: 'list.resistBy', message: 'Resisted by names a roll that is not ticked Resists an attempt, so nothing is posted to the target.' });   // 1.6.0 (B2)
            if (Array.isArray(r.resistOr) && r.resistOr.some(function(id) { return !resistOrOk(sys, id); })) warnings.push({ id: f.id, prop: 'list.resistOr', message: 'Or resisted by names a roll that is not ticked Resists an attempt, so the target is not offered it.' });   // 1.6.0 (the core's gap 5)
            landSays(sys, r, f).forEach(function(m) { warnings.push({ id: f.id, prop: 'list', message: (r.label || 'A roll') + ': ' + m }); }); if (r.landDmg !== undefined && noCheck(r.formula)) warnings.push({ id: f.id, prop: 'list', message: (r.label || 'A roll') + ': Its damage never comes: this roll has no check, so it never succeeds against its target.' });   // 1.6.3 (defense fold 1)
            if (isObj(r.cross)) { var xLb = 'list.cross.' + i + '.' + (r.label || (Array.isArray(r.apply) ? 'Apply' : 'Roll')); checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#cross' }, xLb, r.cross.at, false, f.vis, f); if (r.cross.step) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#cross' }, xLb, r.cross.step, false, f.vis, f); }   // 1.6.0: a counter's crossing, its steps read with the row's names
            if (typeof r.showIf === 'string' && r.showIf) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#show' }, 'list.show.' + i + '.' + (r.label || (Array.isArray(r.apply) ? 'Apply' : 'Roll')), r.showIf, false, f.vis, f);
            if (Array.isArray(r.calls)) { r.calls.forEach(function(cl, j) { if (isObj(cl) && cl.if) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#calls' }, 'list.calls.' + i + '.' + j, cl.if, false, f.vis, f); if (isObj(cl) && cl.byIf) checkByIf({ id: f.id, key: 'l#' + lower(f.key) + '#calls' }, 'list.byIf.' + i + '.' + j, cl); }); callSays(sys, r, f).forEach(function(m) { warnings.push({ id: f.id, prop: 'list', message: (r.label || 'A roll') + ': ' + m }); }); }   // 1.6.0: Calls for
            if (r.resist === true && Array.isArray(r.answers)) { checkAns({ id: f.id, key: 'l#' + lower(f.key) + '#answers' }, 'list.ans.' + i + '.', r.answers, f); ansSays(sys, r, f).forEach(function(m) { warnings.push({ id: f.id, prop: 'list', message: (r.label || 'A roll') + ': ' + m }); }); }   // 1.6.3 (defense fold 3): When it answers an attack
            if (Array.isArray(r.alt)) r.alt.forEach(function(a, j) { if (isObj(a) && typeof a.if === 'string') checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#alt' }, 'list.alt.' + i + '.' + j + '.' + (a.label || 'name'), a.if, false, f.vis, f); });   // 1.6.0: another name's formula (no dice, Row.* known)   // 1.6.0: Shown where (no dice, Row.* known)
            if (Array.isArray(r.apply) && isObj(r.job)) { var ajl = 'list.job.' + i + '.' + (r.label || 'Apply'); checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#job' }, ajl, r.job.turns, false, f.vis, f); if (Array.isArray(f.list.feeds) && f.list.feeds.some(function(fd) { return isObj(fd) && fd.ct === r.job.ct; })) warnings.push({ id: f.id, prop: ajl, message: 'This job counts on a feed\u2019s counter, so its presses change what the feed holds. Give it a counter of its own.' }); if (!r.cost) warnings.push({ id: f.id, prop: ajl, message: 'This job costs no action, so a turn may do other things and still work on it.' }); }   // 1.6.2 (the CORE session): a list's action may be a job too, its changes made at its last press
            if (!Array.isArray(r.apply)) {
                var rl2 = r.label || 'Roll';
                checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#roll' }, 'list.roll.' + i + '.' + rl2, r.formula, true, f.vis, f);
                if (r.needs) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#needs' }, 'list.needs.' + i + '.' + rl2, r.needs, false, f.vis, f);
                (Array.isArray(r.needsWhy) ? r.needsWhy : []).forEach(function(l, k) { if (isObj(l) && typeof l['if'] === 'string' && l['if']) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#needs' }, 'list.needsWhy.' + i + '.' + k + '.' + rl2, l['if'], false, f.vis, f); });   // 1.6.2: each reason, alike
                if (r.malf) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#malf' }, 'list.malf.' + i + '.' + rl2, r.malf, false, f.vis, f);   // Stage 6 HUD R3
                if (r.ad) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#ad' }, 'list.ad.' + i + '.' + rl2, r.ad, false, f.vis, f);   // 1.6.0: its armor divisor (no dice, Row.* known)
                if (r.dmgMajorIf) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#mjif' }, 'list.mjif.' + i + '.' + rl2, r.dmgMajorIf, false, f.vis, f);
                if (r.attemptType) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#atype' }, 'list.atype.' + i + '.' + rl2, r.attemptType, false, 'gm', f);   // 1.6.2: its Attempt type (no dice, Row.* known), worked out on the host   // 1.6.0: A Major Wound where (no dice, Row.* known)
                if (r.hits) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#hits' }, 'list.hits.' + i + '.' + rl2, r.hits, false, f.vis, f);   // 1.6.0: Hits it rolls for (no dice, Row.* known)
                if (r.burst === 'extra') { if (!/cs(<=|>=|!=|<>|==|=|<|>)/i.test(r.formula)) warnings.push({ id: f.id, prop: 'list.roll.' + i + '.' + rl2, message: 'Its extra dice must count their successes, such as 3d6cs>=4, or no die is read.' }); if (!f.list.rolls.some(function(x) { return isObj(x) && x.burst === 'attack'; })) warnings.push({ id: f.id, prop: 'list.roll.' + i + '.' + rl2, message: 'No roll of this list opens a burst, so this one is always refused.' }); }   // 1.6.0: a burst's extra dice
                if (r.dmg === true) { dkindSays(f.id, 'l#' + lower(f.key) + '#dkind', 'list.dkind.' + i + '.' + rl2, r.dkind, f.vis, f); [2].concat(DMG_MORE).forEach(function(k) { if (r['dmg' + k]) dkindSays(f.id, 'l#' + lower(f.key) + '#dkind', 'list.dkind' + k + '.' + i + '.' + rl2, r['dkind' + k], f.vis, f); }); }   // 1.6.0: its kind, and each part's (Row.* known)
                if (r.dmg2) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#dmg2' }, 'list.dmg2.' + i + '.' + rl2, r.dmg2, true, f.vis, f);   // 1.6.0 (B3): a second part of the blow (dice allowed, Row.* known)
                if (r.ad2) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#ad2' }, 'list.ad2.' + i + '.' + rl2, r.ad2, false, f.vis, f);   // and its own armor divisor (no dice)
                DMG_MORE.forEach(function(k) { if (r['dmg' + k]) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#dmg' + k }, 'list.dmg' + k + '.' + i + '.' + rl2, r['dmg' + k], true, f.vis, f); if (r['ad' + k]) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#ad' + k }, 'list.ad' + k + '.' + i + '.' + rl2, r['ad' + k], false, f.vis, f); });   // 1.6.0: a third and a fourth part, alike
                ['critAt', 'fumbleAt'].forEach(function(k) { if (!r[k]) return; checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#crit' }, 'list.' + k + '.' + i + '.' + rl2, r[k], false, f.vis, f); if (!fixedC) warnings.push({ id: f.id, prop: 'list.' + k + '.' + i + '.' + rl2, message: noRangeSays() }); });   // 1.6.0: its own critical range (no dice, Row.* known)
                if (r.bigAt) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#crit' }, 'list.bigAt.' + i + '.' + rl2, r.bigAt, false, f.vis, f);   // 1.6.0: what lands as a heavy hit (no dice, Row.* known)
                if (isObj(r.job)) { checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#job' }, 'list.job.' + i + '.' + rl2, r.job.turns, false, f.vis, f); if (Array.isArray(f.list.feeds) && f.list.feeds.some(function(fd) { return isObj(fd) && fd.ct === r.job.ct; })) warnings.push({ id: f.id, prop: 'list.job.' + i + '.' + rl2, message: 'This job counts on a feed\u2019s counter, so its presses change what the feed holds. Give it a counter of its own.' }); if (!r.cost) warnings.push({ id: f.id, prop: 'list.job.' + i + '.' + rl2, message: 'This job costs no action, so a turn may do other things and still work on it.' }); }   // 1.6.0: its length, no dice, Row.* known
                if (Array.isArray(r.then)) r.then.forEach(function(c, k) { if (c.when === 'malf' && !r.malf) warnings.push({ id: f.id, prop: 'list.then.' + i + '.' + k + '.' + rl2, message: 'This roll has no Malf, so On malfunction never happens.' }); });   // Stage 6 HUD R2b: what it needs (no dice, Row.* known)
                if (Array.isArray(r.then)) r.then.forEach(function(c, k) { if ((c.when === 'crit' || c.when === 'fumble') && !crits) warnings.push({ id: f.id, prop: 'list.then.' + i + '.' + k + '.' + rl2, message: noCritSays(c.when) }); });   // 1.5.8: On a critical success or failure where the system has no criticals
                if (Array.isArray(r.then)) r.then.forEach(function(c, k) { if (typeof c.band !== 'string' || !c.band || c.band === '*') return; var bl = bandsFor(sys, r); if (r.dmg === true) warnings.push({ id: f.id, prop: 'list.then.' + i + '.' + k + '.' + rl2, message: 'On ' + c.band + ' never happens: a damage roll has no result bands.' }); else if (!bl.some(function(b) { return isObj(b) && typeof b.name === 'string' && lower(b.name) === lower(c.band); })) warnings.push({ id: f.id, prop: 'list.then.' + i + '.' + k + '.' + rl2, message: 'On ' + c.band + ' never happens: this roll has no result band called ' + c.band + '.' }); });   // 1.6.3: a list roll's band, alike
                if (Array.isArray(r.then)) {   // Stage 6 HUD R2b: its consequences — a pool, a number or one of the row's counters
                    var rp2 = F.parse(r.formula || ''), tests2 = !!(rp2.ok && rp2.ast && (rp2.ast.top || rp2.ast.body) && (rp2.ast.top || rp2.ast.body).t === 'cmp');
                    r.then.forEach(function(c, k) {
                        var tp2 = 'list.then.' + i + '.' + k + '.' + rl2, tf2 = c.f ? fieldById(sys, c.f) : null;
                        if (typeof c.fx === 'string') { fxSays(f.id, tp2, c, f.vis, f, 'l#' + lower(f.key) + '#then'); return; }   // 1.6.0: an effect switched, the row's quantity or one of its stats
                        if (moreSays(f.id, 'l#' + lower(f.key) + '#then', tp2, c, f.vis, f)) { if (c.when && !tests2 && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: f.id, prop: tp2, message: 'This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' }); return; }
                        if (typeof c.money === 'string') { if (!moneyBoxes(sys).length) errors.push({ id: f.id, prop: tp2, message: 'Money needs a list with a Money box on the Lists tab, and this system has none.' }); if (c.when && !tests2 && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: f.id, prop: tp2, message: 'This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' }); checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#then' }, tp2, c.money, false, f.vis, f); return; }   // 1.6.0: the sheet's money, by a figure with no dice, Row.* known
                        if (c.q === true || typeof c.s === 'string') { rowSays(f, tp2, c); if (c.when && !tests2 && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: f.id, prop: tp2, message: 'This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' }); checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#then' }, tp2, c.formula, c.roll === true, f.vis, f); rolledWarn(f.id, tp2, c); return; }
                        if (c.discard === true) { if (!isObj(f.list.hand)) errors.push({ id: f.id, prop: tp2, message: 'Discard needs a hand, and this list is not marked as one.' }); return; }   // 1.6.2 (G9)
                        if (c.setOff === true) return;   // 1.6.2 (10)
                        if (c.launch === true) { if (c.when === 'malf') warnings.push({ id: f.id, prop: tp2, message: 'Launch never happens on a malfunction: a shot that jams launches nothing.' }); else if (c.when && !tests2 && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: f.id, prop: tp2, message: 'This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' }); return; }   // 1.6.2 (the core's gap 215): a launch has no pool and no amount
                        if (c.off === true) { if (!isObj(f.list.on)) errors.push({ id: f.id, prop: tp2, message: 'Switch this row off needs a switch, but this list has none.' }); else if (c.when && c.when !== 'malf' && !tests2 && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: f.id, prop: tp2, message: 'This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' }); return; }   // 1.6.0: switch its own row off, no amount (applyAct runs it)
                        if (c.feed === true) { if (c.when === 'malf') warnings.push({ id: f.id, prop: tp2, message: 'A shot from the feeds never happens on a malfunction: a shot that jams spends nothing.' }); if (!Array.isArray(f.list.feeds) || !f.list.feeds.length) errors.push({ id: f.id, prop: tp2, message: 'A shot takes 1 from every feed, but this list has no feeds.' }); else if (c.when && c.when !== 'malf' && !tests2 && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: f.id, prop: tp2, message: 'This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' }); if (typeof c.n === 'string' && c.n) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#then' }, tp2, c.n, false, f.vis, f); return; }   // 1.6.0 Feeds
                        if (c.fire === true) { if (c.when === 'malf') warnings.push({ id: f.id, prop: tp2, message: 'Fire never happens on a malfunction: a shot that jams is not fired and spends nothing.' }); if (!isObj(f.list.chamber)) errors.push({ id: f.id, prop: tp2, message: 'Fire takes a round out of the chamber, but this list has no Chambers from.' }); else if (c.when && c.when !== 'malf' && !tests2 && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: f.id, prop: tp2, message: 'This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' }); if (typeof c.n === 'string' && c.n) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#then' }, tp2, c.n, false, f.vis, f); return; }   // 1.5.9: fire has no amount; 1.6.0: its How many, read as an amount is
                        if (!c.c && (!tf2 || APPLY_KINDS[tf2.kind] !== 1)) errors.push({ id: f.id, prop: tp2, message: 'Pick the pool, number or counter this changes.' });
                        else if (tf2 && f.vis === 'all' && (tf2.vis === 'gm' || gmP[tf2.id] === 1)) warnings.push({ id: f.id, prop: tp2, message: '"' + tf2.key + '" is GM only: players\u2019 rolls will not change it.' });
                        if (c.when && !tests2 && !((c.when === 'crit' || c.when === 'fumble') && !crits)) warnings.push({ id: f.id, prop: tp2, message: 'This roll tests nothing (no comparison, like 3d6 <= Row.Skill), so ' + (THEN_WHEN[c.when] || 'On failure') + ' never happens.' });
                        checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#then' }, tp2, c.formula, c.roll === true, f.vis, f); rolledWarn(f.id, tp2, c);   // 1.5.9
                    });
                }
                return;
            }
            var al = r.label || 'Apply';   // HUD H7b: an apply action on each row — each change as the system's (a pool or a number, no dice), Row.* known
            if (r.needs) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#needs' }, 'list.needs.' + i + '.' + al, r.needs, false, f.vis, f);
            (Array.isArray(r.needsWhy) ? r.needsWhy : []).forEach(function(l, k) { if (isObj(l) && typeof l['if'] === 'string' && l['if']) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#needs' }, 'list.needsWhy.' + i + '.' + k + '.' + al, l['if'], false, f.vis, f); });   // 1.6.2: each reason, alike   // the core handbook session's ask (b): what it needs, as a list roll's (no dice, Row.* known)
            if (!r.apply.length) { errors.push({ id: f.id, prop: 'list.apply.' + i + '.x.' + al, message: 'An apply action needs a change: the pool or number it moves, and by how much.' }); return; }
            r.apply.forEach(function(c, k) {
                var cp = 'list.apply.' + i + '.' + k + '.' + al, tf = c.f ? fieldById(sys, c.f) : null;
                if (typeof c.fx === 'string') { fxSays(f.id, cp, c, f.vis, f, 'l#' + lower(f.key) + '#apply'); return; }   // 1.6.0: an effect switched, the row's quantity or one of its stats
                if (moreSays(f.id, 'l#' + lower(f.key) + '#apply', cp, c, f.vis, f)) return;
                if (c.discard === true) { if (!isObj(f.list.hand)) errors.push({ id: f.id, prop: cp, message: 'Discard needs a hand, and this list is not marked as one.' }); return; }   // 1.6.2 (G9)
                if (c.setOff === true) return;   // 1.6.2 (10): no pool, no amount
                if (c.launch === true) return;   // 1.6.2 (the core's gap 215): a launch has no pool and no amount (applyAct runs it)
                if (c.off === true) { if (!isObj(f.list.on)) errors.push({ id: f.id, prop: cp, message: 'Switch this row off needs a switch, but this list has none.' }); return; }   // 1.6.0: switch its own row off, no amount (applyAct runs it)
                if (c.q === true || typeof c.s === 'string') { rowSays(f, cp, c); checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#apply' }, cp, c.formula, c.roll === true, f.vis, f); rolledWarn(f.id, cp, c); return; }
                if (!c.c && (!tf || APPLY_KINDS[tf.kind] !== 1)) errors.push({ id: f.id, prop: cp, message: 'Pick the pool, number or counter this changes.' });   // R2b: or one of the row's counters
                else if (tf && f.vis === 'all' && (tf.vis === 'gm' || gmP[tf.id] === 1)) warnings.push({ id: f.id, prop: cp, message: '"' + tf.key + '" is GM only: players will not get this action.' });
                checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#apply' }, cp, c.formula, c.roll === true, f.vis, f); rolledWarn(f.id, cp, c);   // 1.5.9
            });
        });
    });
    rollG = null; nearV = false; crossV = false; resistV = false; askV = null;
    var trn = isObj(sys.combat) && isObj(sys.combat.turn) ? sys.combat.turn : null, actK = map();   // turn-based combat T1: the move (no dice) and what each roll costs
    if (isObj(sys.combat) && isObj(sys.combat.loot) && typeof sys.combat.loot['if'] === 'string' && sys.combat.loot['if']) checkFormula({ id: 'bodies', key: '#loot' }, 'loot', sys.combat.loot['if'], false, 'gm');   // 1.6.2 (backlog 42, fold 3): Can be looted where
    if (trn && trn.move) checkFormula({ id: 'combat', key: '#turn' }, 'turn.move', trn.move, false, 'all');
    if (trn && trn.face) checkFormula({ id: 'combat', key: '#turn' }, 'turn.face', trn.face, false, 'all');   // 1.6.2 (backlog 70): how many facing changes a turn allows (no dice)
    if (trn && trn.run) checkFormula({ id: 'combat', key: '#turn' }, 'turn.run', trn.run, false, 'all');   // 1.6.0: a move by giving up an action
    if (trn && trn.holdLost) checkFormula({ id: 'combat', key: '#turn' }, 'turn.holdLost', trn.holdLost, false, 'gm');   // 1.6.0: read on the host alone
    if (fixedC) ['critAt', 'fumbleAt'].forEach(function(k) { if (sys.combat[k]) checkFormula({ id: 'checks', key: '#checks' }, k, sys.combat[k], false, 'all'); });   // 1.6.0: the Combat tab's critical range (no dice)
    if (isObj(sys.combat) && isObj(sys.combat.holds)) {   // 1.6.0 Who holds whom: its formula, and what it names
        var hdV = sys.combat.holds, hdRoll = function(ref) { var m = typeof ref === 'string' ? /^(f_[A-Za-z0-9_]{1,24})#(\d{1,2})$/.exec(ref) : null, f = m ? fieldById(sys, m[1]) : null; return m ? !!(f && isObj(f.list) && Array.isArray(f.list.rolls) && f.list.rolls[+m[2]]) : (Array.isArray(sys.rolls) ? sys.rolls : []).some(function(r) { return isObj(r) && r.id === ref; }); };
        if (hdV.ends) checkFormula({ id: 'holds', key: '#holds' }, 'ends', hdV.ends, false, 'gm');
        [hdV.held, hdV.pinned, hdV.holder].forEach(function(id) { if (typeof id === 'string' && !(Array.isArray(sys.effects) ? sys.effects : []).some(function(d) { return isObj(d) && d.id === id; })) warnings.push({ id: 'holds', prop: 'holds', message: 'That effect is gone from the library, so nobody wears it.' }); });
        HOLD_ROLLS.concat(['also']).forEach(function(k) { (k === 'also' ? (Array.isArray(hdV.also) ? hdV.also : []) : hdV[k] ? [hdV[k]] : []).forEach(function(ref) { if (!hdRoll(ref)) warnings.push({ id: 'holds', prop: 'holds', message: 'It names a roll that is gone, so that roll does nothing here.' }); }); });
        if (hdRoll(hdV.squeeze) && rollEntryOf(sys, hdV.squeeze.indexOf('#') < 0 ? hdV.squeeze : undefined, hdV.squeeze.indexOf('#') < 0 ? undefined : { f: hdV.squeeze.split('#')[0], i: +hdV.squeeze.split('#')[1] }).dmg !== true) warnings.push({ id: 'holds', prop: 'holds', message: 'A squeeze posts a blow, and that roll has no Damage tick, so it only rolls.' });
    }
    (trn && Array.isArray(trn.acts) ? trn.acts : []).forEach(function(a) { if (isObj(a) && typeof a.nf === 'string' && a.nf) checkFormula({ id: 'combat', key: '#turn' }, 'turn.act.' + a.key, a.nf, false, 'all'); });   // 192: an action's count
    (trn && Array.isArray(trn.acts) ? trn.acts : []).forEach(function(a) { if (isObj(a) && typeof a.key === 'string') actK[lower(a.key)] = 1; });
    var crewStn = map(); (Array.isArray(sys.links) ? sys.links : []).forEach(function(k) { if (isObj(k) && k.kind === 'crew' && Array.isArray(k.stations)) k.stations.forEach(function(s) { if (typeof s === 'string') crewStn[lower(s)] = 1; }); });
    var stnSays = function(id, prop, r) { (isObj(r) && Array.isArray(r.stations) ? r.stations : []).forEach(function(s) { if (typeof s === 'string' && !crewStn[lower(s)]) warnings.push({ id: id, prop: prop, message: 'It names the station ' + s + ', which no Crew link has, so nobody at it may press this roll.' }); }); };   // 1.6.2 (backlog 208, point 9)
    sys.rolls.forEach(function(r) { stnSays(r.id, 'stations', r); });
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.rolls)) f.list.rolls.forEach(function(r) { stnSays(f.id, 'list', r); }); });
    var costErr = function(id, prop, k) { errors.push({ id: id, prop: prop, message: 'No action \u201c' + k + '\u201d on the Combat tab: add it there, or pick another.' }); };
    sys.rolls.forEach(function(r) { if (r.cost && !actK[lower(r.cost)]) costErr(r.id, 'cost', r.cost); });
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.rolls)) f.list.rolls.forEach(function(r, i) { if (isObj(r) && r.cost && !actK[lower(r.cost)]) costErr(f.id, 'list.cost.' + i + '.' + (r.label || (Array.isArray(r.apply) ? 'Apply' : 'Roll')), r.cost); }); });
    sys.fields.forEach(function(f) {   // Stage 6 HUD R2: a list's counters — each most a formula (no dice) that reads the row
        if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.counters)) return;
        f.list.counters.forEach(function(t) { if (isObj(t) && typeof t.key === 'string' && t.max) checkFormula({ id: f.id, key: 'l#' + lower(f.key) + '#ct' }, 'list.ctr.' + t.key, t.max, false, f.vis, f); });
    });
    sys.rolls.forEach(function(r) {   // HUD frame (HF5a, H3): each {formula} in a roll's label, as the caption checks (warnings); a GM-only name says what players see instead
        if (typeof r.label !== 'string' || r.label.indexOf('{') < 0) return;
        var lre = /\{([^{}]{1,300})\}/g, lm, ln = 0, lgm = map();   // lgm: the GM-only names already warned about in this label (each once)
        while ((lm = lre.exec(r.label))) {
            var ldrawn = ++ln <= LIMITS.captionExprs, lp = F.parse(capExpr(lm[1]).expr);
            if (!lp.ok) { if (ldrawn) warnings.push({ id: r.id, prop: 'label', message: 'Label: ' + lp.error.message }); continue; }
            if (ldrawn && hasDice(lp.ast.body)) warnings.push({ id: r.id, prop: 'label', message: 'Label: dice are not worked out in a label; put them in the formula.' });
            lp.names.forEach(function(nm) {
                var tg = known[lower(nm)] || listT(nm);   // F5a1
                if (!tg) { if (ldrawn) warnings.push({ id: r.id, prop: 'label', message: 'Label: unknown name "' + nm + '".' }); }
                else if (!NUMERIC[tg.kind]) { if (ldrawn) warnings.push({ id: r.id, prop: 'label', message: 'Label: "' + nm + '" is not a number.' }); }
                else if (r.vis === 'all' && (tg.vis === 'gm' || gmP[tg.id] === 1) && !lgm[lower(nm)]) { lgm[lower(nm)] = 1; warnings.push({ id: r.id, prop: 'label', message: 'Label: "' + nm + '" is GM only, so players see only "' + labelHead(r.label) + '".' }); }
            });
        }
        if (ln > LIMITS.captionExprs) warnings.push({ id: r.id, prop: 'label', message: 'Label: only the first ' + LIMITS.captionExprs + ' {\u2026} values are worked out; the rest show as written.' });
        if ((r.label.match(/\{/g) || []).length > ln) warnings.push({ id: r.id, prop: 'label', message: 'Label: a "{" without its "}" shows as written.' });   // HF5 review
        if (r.vis === 'all') labelGmNames(sys, F, r.label).forEach(function(nm) { if (!lgm[lower(nm)]) { lgm[lower(nm)] = 1; warnings.push({ id: r.id, prop: 'label', message: 'Label: "' + nm + '" is GM only, so players see only "' + labelHead(r.label) + '".' }); } });   // HF5 review: one no {...} draws (left open, past the 8th, not a formula)
    });
    // 1.6.3 (Fulllion's rulings of 2026-11-20: a box others depend on is required): the Combat tab's resist roll and throw roll, which an item's
    // afflictions and its throw read
    var bRes = isObj(sys.combat) && isObj(sys.combat.blast) && typeof sys.combat.blast.resist === 'string' && !!sys.combat.blast.resist.trim();
    var bThr = isObj(sys.combat) && isObj(sys.combat.blast) && typeof sys.combat.blast.roll === 'string' && !!sys.combat.blast.roll.trim();
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {   // item damage = a roll (dice ok); cost = a definition (no dice)
        if (it.damage) checkFormula({ id: it.id, key: it.id }, 'damage', it.damage, true, it.vis);
        if (isObj(it.area) && Array.isArray(it.area.aff) && it.area.aff.length && !bRes) warnings.push({ id: it.id, prop: 'aff', message: 'The Combat tab has no resist roll, so its afflictions are never rolled: you are only told who must resist. Set one on the Combat tab under Blasts.' });
        if (bThr && isObj(it.area) && it.area.flight !== 'scatter' && it.area.flight !== 'line' && !it.throwSkill) warnings.push({ id: it.id, prop: 'throwSkill', message: 'It has no throw skill, so the Combat tab\u2019s throw roll is never made for it when it is thrown or placed: it lands where it is aimed, with no scatter and no critical failure.' });
        if (isObj(it.flies) && it.flies.end === 'off' && !isObj(it.area)) warnings.push({ id: it.id, prop: 'flies', message: 'It has no blast, so it cannot go off when its rounds run out. Give it a blast, or set Out of rounds to it is gone.' });
        if (isObj(it.area) && typeof it.area.frag === 'string' && it.area.frag) checkFormula({ id: it.id, key: it.id }, 'frag', it.area.frag, true, it.vis);
        if (isObj(it.flies) && typeof it.flies.speed === 'string' && it.flies.speed) { checkFormula({ id: it.id, key: it.id }, 'flies', it.flies.speed, false, 'gm'); if (typeof it.flies.roll === 'string' && !(Array.isArray(sys.rolls) ? sys.rolls : []).some(function(r) { return isObj(r) && r.id === it.flies.roll && typeof r.formula === 'string'; })) warnings.push({ id: it.id, prop: 'flies', message: 'Its roll on arrival is not there, so it strikes with no roll.' }); }   // 1.6.2 (vehicles, fold (d)): its Speed reads the launcher's names and the map's factors, no dice   // 1.5.9 (es): its fragmentation, a roll as its damage is
        if (isObj(it.area) && isObj(it.area.cloud)) { var clV = it.area.cloud; if (typeof clV.n === 'string' && clV.n) { checkFormula({ id: it.id, key: it.id }, 'cloud', clV.n, true, 'gm'); if (!affLastsSecs(sys, 1, clV.u)) warnings.push({ id: it.id, prop: 'cloud', message: 'Its cloud lasts in a time unit the Combat tab does not have, so it stays until you clear it.' }); } if (typeof clV.fx === 'string' && !(Array.isArray(sys.effects) ? sys.effects : []).some(function(e) { return isObj(e) && e.id === clV.fx; })) warnings.push({ id: it.id, prop: 'cloud', message: 'Its cloud\u2019s effect is not there, so the cloud puts none on.' }); if (typeof clV.roll === 'string' && !(Array.isArray(sys.rolls) ? sys.rolls : []).some(function(r) { return isObj(r) && r.id === clV.roll && typeof r.formula === 'string'; })) warnings.push({ id: it.id, prop: 'cloud', message: 'Its cloud\u2019s roll is not there, so the cloud offers none.' }); }   // 1.6.2: the cloud it leaves
        (isObj(it.area) && Array.isArray(it.area.aff) ? it.area.aff : []).forEach(function(a, ai) {   // 1.5.9 (es): an affliction's resist target and Only where read the victim's names with no dice, its Lasts may roll them; all the GM's own (vis gm: no warning that a name is GM only)
            if (!isObj(a)) return;
            if (typeof a.vs === 'string') checkFormula({ id: it.id, key: it.id }, 'aff.' + ai + '.vs', a.vs, false, 'gm');
            if (typeof a.needs === 'string' && a.needs) checkFormula({ id: it.id, key: it.id }, 'aff.' + ai + '.needs', a.needs, false, 'gm');
            if (a.who === 'spread' && typeof a.pool === 'string' && a.pool) checkFormula({ id: it.id, key: it.id }, 'aff.' + ai + '.pool', a.pool, true, 'gm');   // 1.6.4 (gap 24): its pool, rolled once as it goes off
            if (a.who === 'spread') { var spF = typeof a.by === 'string' ? fieldById(sys, a.by) : null; if (!spF || ['number', 'formula', 'resource'].indexOf(spF.kind) < 0) warnings.push({ id: it.id, prop: 'aff.' + ai + '.by', message: 'Its spread reads each one\u2019s figure from a field that is gone or holds no number, so no one is covered.' }); }
            if (isObj(a.lasts) && typeof a.lasts.n === 'string' && a.lasts.n) { checkFormula({ id: it.id, key: it.id }, 'aff.' + ai + '.lasts', a.lasts.n, true, 'gm'); if (!affLastsSecs(sys, 1, a.lasts.u)) warnings.push({ id: it.id, prop: 'aff.' + ai + '.lasts', message: 'Lasts names a time unit the Combat tab does not have, so the effect lasts its own time.' }); }
        });
        if (it.cost) checkFormula({ id: it.id, key: it.id }, 'cost', it.cost, false, it.vis);
        // 1.6.3 (the review of the System editor library): what an item is thrown with may be a field or a figure of one row of a list (Skills, Throwing,
        // Target, kept as one name), so it is judged by every name a formula can read (known, then listT, as a choice stat's option is), never by the field
        // keys alone. Only a name that reads nothing is said, in words that never show the stored name
        if (it.throwSkill && !(known[lower(it.throwSkill)] || listT(it.throwSkill))) warnings.push({ id: it.id, prop: 'throwSkill', message: 'What it is thrown with no longer names anything this sheet has, so the Combat tab’s throw roll cannot be made for it. Pick it again.' });
    });
    // Stage 6 F4b: an item's key names one row of each list it can be on (the list's categories, or every item): once there
    var keyErr = map();
    sys.fields.forEach(function(f) {
        if (f.kind !== 'item-list') return;
        var sc = f.list && Array.isArray(f.list.cats) && f.list.cats.length ? f.list.cats : null, byKey = map();
        (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {
            if (!isObj(it) || !it.key || (sc && !catIn(sc, it.category))) return;
            var o = byKey[lower(it.key)]; if (!o) { byKey[lower(it.key)] = it; return; }
            if (keyErr[it.id]) return; keyErr[it.id] = 1;   // once per item, whichever lists it shares
            errors.push({ id: it.id, prop: 'key', message: 'Key "' + it.key + '" is also used by "' + (o.name || 'Item') + '" in ' + (f.label || f.key) + '.' });
        });
    });
    // 1.6.0 Levels it may be, and a change's figures By level: what reads as nothing on the lists an item can be on (an entry is tied to no one list, so a name is read by the list a row stands on)
    (Array.isArray(sys.items) ? sys.items : []).forEach(function(it) {
        if (!isObj(it)) return; var tm = (Array.isArray(it.mods) ? it.mods : []).filter(function(m) { return isObj(m) && Array.isArray(m.tiers); }); if (!Array.isArray(it.lvlOnly) && !tm.length) return;
        var holds = sys.fields.filter(function(f) { return f.kind === 'item-list' && isObj(f.list) && isObj(f.list.lvl) && !(Array.isArray(f.list.cats) && f.list.cats.length && !catIn(f.list.cats, it.category)); });
        if (!holds.length) { warnings.push({ id: it.id, prop: 'lvlOnly', message: 'No list it can be on has a level, so ' + (Array.isArray(it.lvlOnly) ? 'Levels it may be says' : 'Figure by level says') + ' nothing.' }); return; }
        holds.forEach(function(f) {
            var nm = f.label || f.key, miss = lvlOnlyMiss(f.list, it), on = lvlOnlyOn(f.list, it);
            if (Array.isArray(it.lvlOnly) && !on) warnings.push({ id: it.id, prop: 'lvlOnly', message: nm + ' has none of its Levels it may be, so the box says nothing there.' });
            else if (miss.length) warnings.push({ id: it.id, prop: 'lvlOnly', message: nm + ' has no level ' + miss.join(', ') + ', so Levels it may be passes over that there.' });
            if (on && typeof it.lvl === 'number' && !lvlOnlyHas(f.list, it, lvlClamp(f.list.lvl, it.lvl))) warnings.push({ id: it.id, prop: 'lvlOnly', message: 'Its starting level is not one of its Levels it may be, so a new row on ' + nm + ' starts at ' + fmtNum(lvlStart(f.list, it)) + '.' });
            tm.forEach(function(m) { m.tiers.forEach(function(t) { if (isObj(t) && lvlNamed(f.list.lvl, t.at) === undefined) warnings.push({ id: it.id, prop: 'mods', message: 'Figure by level: ' + nm + ' has no level ' + t.at + ', so that figure counts for nothing there.' }); }); });
        });
    });
    // Stage 6 F4c1: a stat key a GM-only item list shares with a visible one — an item's value under it is in the players' view (the visible list's)
    var visSt = map();
    sys.fields.forEach(function(f) { if (f.kind === 'item-list' && f.vis === 'all' && isObj(f.list) && Array.isArray(f.list.stats)) f.list.stats.forEach(function(s) { if (isObj(s) && typeof s.key === 'string' && !visSt[lower(s.key)]) visSt[lower(s.key)] = f; }); });
    sys.fields.forEach(function(f) { if (f.kind !== 'item-list' || f.vis !== 'gm' || !isObj(f.list) || !Array.isArray(f.list.stats)) return; f.list.stats.forEach(function(s) { var vf = isObj(s) && typeof s.key === 'string' ? visSt[lower(s.key)] : null; if (vf) warnings.push({ id: f.id, prop: 'list', message: 'Stat “' + s.key + '” is also on ' + (vf.label || vf.key) + ': an item’s ' + s.key + ' reaches players.' }); }); });
    [sys.sheet, sys.sheet && sys.sheet.hud].forEach(function(lay) {
        (isObj(lay) && Array.isArray(lay.sections) ? lay.sections : []).forEach(function(s) { (isObj(s) && Array.isArray(s.fields) ? s.fields : []).forEach(function(pl) {
            if (!isObj(pl) || pl.on !== true) return; var lf = fieldById(sys, pl.id);
            if (lf && !(lf.list && lf.list.on)) warnings.push({ id: pl.id, prop: 'layout', message: (lf.label || lf.key) + ' is set to show only rows switched on, but its list has no switch, so every row shows.' });
        }); });
    });
    // Stage 6 look fold (L4): a band group with no Pin button anywhere is always shown — say so (it may be meant)
    var pinT = pinTargetsAll(sys.sheet);   // HUD frame HF1: a Pin in the HUD counts too
    (sys.sheet && Array.isArray(sys.sheet.bandGroups) ? sys.sheet.bandGroups : []).forEach(function(g) { if (isObj(g) && typeof g.id === 'string' && pinT[g.id] !== 1) warnings.push({ id: g.id, prop: 'layout', message: 'The band group "' + (g.label || 'Group') + '" has no Pin button yet, so it is always shown.' }); });
    // Stage 6 look fold: one field, once — a field the header edits in place and placed again in a section is flagged
    [[sys.sheet, ''], [sys.sheet && sys.sheet.hud, 'the HUD\u2019s ']].forEach(function(lv) {   // HUD frame HF1: per layout (the sheet's message unchanged)
        var lay = lv[0]; if (!isObj(lay)) return;
        var hdrEd = headerEdits(sys, lay);
        (Array.isArray(lay.sections) ? lay.sections : []).forEach(function(s) { (isObj(s) && Array.isArray(s.fields) ? s.fields : []).forEach(function(pl) { if (isObj(pl) && typeof pl.id === 'string' && hdrEd[pl.id] === 1) { var hf = fieldById(sys, pl.id); warnings.push({ id: pl.id, prop: 'layout', message: (hf && (hf.label || hf.key) || 'This field') + ' is edited in the header and placed again in ' + lv[1] + (s.title || 'a section') + '.' }); } }); });
    });
    // HUD frame (HF4b): a section's Reset all resets at most LIMITS.editBatch pools and counters (the rest are left as they are)
    [[sys.sheet, ''], [sys.sheet && sys.sheet.hud, 'the HUD\u2019s ']].forEach(function(lv) {
        var lay = lv[0]; if (!isObj(lay)) return;
        (Array.isArray(lay.sections) ? lay.sections : []).forEach(function(s) {
            if (!isObj(s) || s.resetAll !== true || !Array.isArray(s.fields)) return;
            var n = s.fields.filter(function(pl) { var f = isObj(pl) && typeof pl.id === 'string' ? fieldById(sys, pl.id) : null; return !!f && (f.kind === 'resource' || (f.counter === true && (f.kind === 'number' || f.kind === 'skill'))); }).length;
            if (n > LIMITS.editBatch) warnings.push({ id: s.id, prop: 'resetAll', message: 'Reset all resets the first ' + LIMITS.editBatch + ' in ' + lv[1] + (s.title || 'this section') + '.' });
        });
    });
    // Stage 6 HUD C8: a show-if on a section or a placement — a formula with no dice over known numbers; its messages are warnings (a bad one
    // shows the part), on the section; one reading a GM-only value is dropped from the players' view, so players always see that part
    [[sys.sheet, ''], [sys.sheet && sys.sheet.hud, 'the HUD\u2019s ']].forEach(function(lv) {
        var lay = lv[0]; if (!isObj(lay)) return;
        (Array.isArray(lay.sections) ? lay.sections : []).forEach(function(s) {
            if (!isObj(s)) return;
            var chk = function(text, prop) {
                if (typeof text !== 'string' || !text) return;
                var p = F.parse(text); if (!p.ok) { warnings.push({ id: s.id, prop: prop, message: 'Show if: ' + p.error.message + ' It shows until this is fixed.' }); return; }
                if (hasDice(p.ast.body)) { warnings.push({ id: s.id, prop: prop, message: 'Show if: dice are not rolled here, so it always shows.' }); return; }
                p.names.forEach(function(nm) {
                    var tg = known[lower(nm)] || listT(nm);
                    if (!tg) warnings.push({ id: s.id, prop: prop, message: 'Show if: unknown name "' + nm + '", so it shows.' });
                    else if (!NUMERIC[tg.kind] && !wordsOk(p, nm, tg)) warnings.push({ id: s.id, prop: prop, message: 'Show if: "' + nm + '" is not a number, so it shows.' });
                    else if (tg.vis === 'gm' || gmP[tg.id] === 1 || tg.gmKey) warnings.push({ id: s.id, prop: prop, message: 'Show if: "' + nm + '" is GM only, so players always see it.' });
                });
            };
            chk(s.showIf, 'showIf');
            (Array.isArray(s.fields) ? s.fields : []).forEach(function(pl, i) { if (isObj(pl)) chk(pl.showIf, 'showIf.' + i); });
            (Array.isArray(s.fields) ? s.fields : []).forEach(function(pl, i) {   // Stage 6 HUD H9: a custom roller's starting formula
                if (!isObj(pl) || pl.kind !== 'roller' || typeof pl.formula !== 'string' || !pl.formula.trim()) return;
                var p = F.parse(pl.formula); if (!p.ok) { var rlOpen = pl.formula.replace(/\s+$/, ''); if (/(<=|>=|<|>|=|\+|-|\*|\/)$/.test(rlOpen)) { var rlP = F.parse(rlOpen + ' 0'); if (rlP.ok) p = rlP; } }   // 1.6.0: a starting text that ends in a comparison or an operator is one the player finishes (3d6 <=), read as if a number followed
                if (!p.ok) { warnings.push({ id: s.id, prop: 'formula.' + i, message: 'Custom roller: ' + p.error.message }); return; }
                p.names.forEach(function(nm) { var tg = known[lower(nm)] || listT(nm); if (!tg) warnings.push({ id: s.id, prop: 'formula.' + i, message: 'Custom roller: unknown name "' + nm + '".' }); else if (tg.vis === 'gm' || gmP[tg.id] === 1 || tg.gmKey) warnings.push({ id: s.id, prop: 'formula.' + i, message: 'Custom roller: "' + nm + '" is GM only, so players\u2019 box starts empty.' }); });
            });
        });
    });
    // loops: DFS over the definition graph
    var state = map(), stack = [];
    function visit(k) {
        state[k] = 1; stack.push(k);
        (edges[k] || []).forEach(function(to) {
            if (state[to] === 1) { var at = stack.indexOf(to), cyc = stack.slice(at).concat(to).map(nodeName), lk = listNode(k); errors.push({ id: ix[k] ? ix[k].id : lk ? lk.f.id : k, prop: lk ? 'list' : (DEF_PROP[ix[k] ? ix[k].kind : ''] || 'formula'), message: 'Formulas refer to each other in a loop: ' + cyc.join(' → '), pos: 0, len: 0 }); }
            else if (!state[to]) visit(to);
        });
        stack.pop(); state[k] = 2;
    }
    // Stage 6 F5a2: choice stats — each option reads one number formulas know; one key one kind across lists; a GM-only option on a visible list warns
    var kindOf = map();
    sys.fields.forEach(function(f) {
        if (f.kind !== 'item-list' || !isObj(f.list) || !Array.isArray(f.list.stats)) return;
        f.list.stats.forEach(function(st) {
            if (!isObj(st) || typeof st.key !== 'string') return;
            var lk = lower(st.key), kd = st.kind === 'pick' ? 'pick' : 'num', word = function(x) { return x === 'pick' ? 'a choice' : 'a number'; };
            if (kindOf[lk] && kindOf[lk].kd !== kd) errors.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d is ' + word(kd) + ' here but ' + word(kindOf[lk].kd) + ' on ' + (kindOf[lk].f.label || kindOf[lk].f.key) + ': one key, one kind.' });
            else if (!kindOf[lk]) kindOf[lk] = { kd: kd, f: f, st: st };
            else if (kd === 'pick' && kindOf[lk].f !== f) { var lbs = function(x) { return (Array.isArray(x.opts) ? x.opts : []).map(function(o) { return lower(o.label); }).join('\n'); }; if (lbs(st) !== lbs(kindOf[lk].st)) warnings.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d is a choice on ' + (kindOf[lk].f.label || kindOf[lk].f.key) + ' too, with other options: an item holds one choice under a key, read against ' + (kindOf[lk].f.label || kindOf[lk].f.key) + '\u2019s options. Give this list its own key.' }); }   // Stage 6 F7: one key, one set of options
            if (kd !== 'pick') return;
            if (!Array.isArray(st.opts) || !st.opts.length) errors.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d is a choice with no options yet.' });
            (st.opts || []).forEach(function(o) {
                var t = known[lower(o.name)] || listT(o.name), ok = false; try { var p = F.parse(o.name); ok = !!p.ok && p.names.length === 1 && lower(p.names[0]) === lower(o.name); } catch (e) { ok = false; }   // Stage 6 F3: or a list's name — an addressed row (Skills.Guns.Target), a total
                if (!t && lower(o.label) === lower(o.name) && o.name.indexOf('.') < 0) return;   // 1.6.2: a plain word, as a choice of Iron and Bronze is. A dotted name is a broken link, never a word
                if (!ok || !t || !NUMERIC[t.kind]) { errors.push({ id: f.id, prop: 'list', message: (st.label || st.key) + ': the option \u201c' + o.label + '\u201d points at \u201c' + o.name + '\u201d, which is no figure of this sheet.' }); return; }
                if (!t.noEdge) { var fromP = 'l#' + lower(f.key) + '.' + lower(st.key); (edges[fromP] = edges[fromP] || []).push(lower(t.key)); }   // a loop through a choice is named
                if (f.vis === 'all' && (t.vis === 'gm' || gmP[t.id] === 1 || t.gmKey)) warnings.push({ id: f.id, prop: 'list', message: 'Stat \u201c' + st.key + '\u201d: the option \u201c' + o.label + '\u201d reads a GM-only value, so players do not get that option.' });
            });
        });
    });
    // 126: a budget's two formulas are definitions like any other: a name nothing has, a text where a number is read. What Save DROPS of a budget
    // is the editor's to say (refreshErrors); with vis 'gm' nothing is said here of a GM-only name
    (Array.isArray(sys.env) ? sys.env : []).forEach(function(e) { if (!isObj(e) || typeof e.key !== 'string') return; ENV_BANDS.forEach(function(k) { if (typeof e[k] === 'string' && e[k]) checkFormula({ id: 'env', key: 'env#' + e.key }, 'env.' + e.key + '.' + k, e[k], false, 'all'); }); });   // 1.6.0: an environment reading's bands, the sheet's names
    (Array.isArray(sys.links) ? sys.links : []).forEach(function(k) { if (isObj(k) && Array.isArray(k.figs)) k.figs.forEach(function(x) { if (isObj(x) && typeof x.formula === 'string') { figK = k; try { checkFormula({ id: k.id, key: 'link#' + k.id }, 'link.figs.' + x.key, x.formula, false, 'all'); } finally { figK = null; } figVehWarn(k, x); } }); });   // the core handbook session's ask 6: a group's figure, worked out with the system's own names on each sheet
    (isObj(sys.combat) && isObj(sys.combat.senses) && Array.isArray(sys.combat.senses.list) ? sys.combat.senses.list : []).forEach(function(s) {   // 1.6.0: a band that notices by a roll
        var nt = isObj(s) && isObj(s.notice) ? s.notice : null; if (!nt) return; var own = { id: 'senses', key: 'sense#' + s.id };
        var wasR = resistV; resistV = true; noticeV = true; if (typeof nt.check === 'string' && nt.check) checkFormula(own, 'notice.check', nt.check, true, 'gm'); resistV = wasR; noticeV = false;
        if (typeof nt.sneak === 'string' && nt.sneak) checkFormula(own, 'notice.sneak', nt.sneak, false, 'gm');
        if (typeof nt.noise === 'string' && nt.noise && !sys.fields.some(function(f) { return isObj(f) && f.kind === 'item-list' && isObj(f.list) && Array.isArray(f.list.stats) && f.list.stats.some(function(x) { return isObj(x) && lower(x.key || '') === lower(nt.noise); }); })) warnings.push({ id: 'senses', prop: 'notice.noise', message: 'Loud by names no stat of a list, so no roll marks a token loud.' });   // 1.6.0
    });
    (Array.isArray(sys.tags) ? sys.tags : []).forEach(function(t) { if (!isObj(t) || typeof t.key !== 'string') return; var own = { id: 'tag:' + t.key, key: 'tag#' + t.key }; if (typeof t.keep === 'string' && t.keep) checkFormula(own, 'tag.keep', t.keep, false, 'gm'); var fxL = fxLibOf(sys); (Array.isArray(t.endFx) ? t.endFx : []).forEach(function(x) { if (!fxL[x]) warnings.push({ id: own.id, prop: 'tag.endfx', message: 'An effect that ended ' + (t.label || t.key) + ' is not in this system any more.' }); }); });   // 1.6.2 (vehicles, fold (c), part two)
    (Array.isArray(sys.budgets) ? sys.budgets : []).forEach(function(b) { if (!isObj(b) || typeof b.id !== 'string') return; var own = { id: b.id, key: 'budget#' + b.id }; checkFormula(own, 'has', typeof b.has === 'string' ? b.has : '', false, 'gm'); checkFormula(own, 'spent', typeof b.spent === 'string' ? b.spent : '', false, 'gm'); });
    function listNode(k) { if (k.slice(0, 2) !== 'l#') return null; var rest = k.slice(2), d = rest.indexOf('.'), lf = lsts[d > 0 ? rest.slice(0, d) : rest]; if (!lf) return null; var ck = d > 0 ? rest.slice(d + 1) : '', col = null, pick = null; ((lf.list && lf.list.cols) || []).forEach(function(c) { if (!col && lower(c.key) === ck) col = c; }); if (!col && ck) ((lf.list && lf.list.stats) || []).forEach(function(x) { if (!pick && isObj(x) && x.kind === 'pick' && lower(x.key) === ck) pick = x; }); return { f: lf, col: col, pick: pick }; }
    function nodeName(x) { if (ix[x]) return ix[x].key; var ln = listNode(x); return ln ? (ln.pick ? ln.f.key + '.' + ln.pick.key + ' (choice)' : ln.f.key + '.' + (ln.col ? ln.col.key : '') + ' (column)') : x; }
    lowerKeys.forEach(function(k) { if (!state[k]) visit(k); });
    Object.keys(edges).forEach(function(k) { if (!state[k]) visit(k); });   // F5a1: the list columns' own nodes
    // 1.6.4 (the review of Row.onBefore, point (a), Fulllion's pick of 2026-11-23): a column that adds up a column (Row.onBefore.<k>) which
    // comes back to it through a read of another row. The loop graph above draws no edge for such a read (Row.up.*, Host.*, Row.parts.*,
    // Here.*, At.* name another row, so they carry noEdge), and the resolver once caught the loop only as it went, so a sheet worked it out
    // or refused it by the order its rows were asked in. timecore.js onBeforeLoop decides it from the definitions alone, and the resolver
    // (onBeforeVal) refuses the very same totals, so the editor names the loop every screen refuses. Said under the column whose formula reads
    // the total, at that name, in the loop graph's own words (plainMessage says them plainly). A column the loop graph above already named in
    // one of its loops is passed over (a loop it draws edges for, such as M = Row.onBefore.M, or one through fields, is said once already,
    // under whichever name closed it); a loop elsewhere, even on the same list, hides nothing (both found in the review of this fix)
    var obSaid = errors.filter(function(e) { return typeof e.message === 'string' && e.message.indexOf('Formulas refer to each other in a loop: ') === 0; }).map(function(e) { return e.message.slice(40).split(' → '); });
    sys.fields.forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list' || typeof f.key !== 'string' || !isObj(f.list) || !isObj(f.list.on) || !Array.isArray(f.list.cols)) return;
        var obC = map(), obS = map(), obMemo = map();
        f.list.cols.forEach(function(c) { if (isObj(c) && typeof c.key === 'string') obC[lower(c.key)] = 1; });
        (Array.isArray(f.list.stats) ? f.list.stats : []).forEach(function(s) { if (isObj(s) && typeof s.key === 'string') obS[lower(s.key)] = 1; });   // a stat of the key is what the total reads, and a stat never loops
        f.list.cols.forEach(function(c) {
            if (!isObj(c) || typeof c.key !== 'string' || typeof c.formula !== 'string' || !c.formula) return;
            var obMe = f.key + '.' + c.key + ' (column)'; if (obSaid.some(function(p) { return p.indexOf(obMe) >= 0; })) return;   // said already, as the loop graph names a column (its nodeName)
            var ns = []; try { ns = F.names(c.formula) || []; } catch (e) { ns = []; }
            for (var i = 0; i < ns.length; i++) {
                var n = String(ns[i]), m = /^row\.onbefore\.([^.]+)$/.exec(lower(n)); if (!m || !obC[m[1]] || obS[m[1]]) continue;
                if (!(m[1] in obMemo)) { var obL = null; try { obL = onBeforeLoop(sys, F, f, m[1]); } catch (e) { obL = null; } obMemo[m[1]] = obL && obL.length ? obL : 0; }   // the same answer for every column of the list that reads it, and as the resolver reads a walk that throws: nothing said
                if (!obMemo[m[1]]) continue;
                errors.push({ id: f.id, prop: 'list.col.' + c.key, message: 'Formulas refer to each other in a loop: ' + obMemo[m[1]].join(' → '), pos: Math.max(0, lower(c.formula).indexOf(lower(n))), len: n.length });
                break;   // one message a column
            }
        });
    });
    [errors, warnings].forEach(function(a) { a.forEach(function(e) { if (e.prop === 'list.onrm') { e.message = 'When a row is taken off: ' + e.message; e.prop = 'list'; } }); });
    [errors, warnings].forEach(function(a) { a.forEach(function(e) { if (e.prop === 'list.upamt') { e.message = 'Keeps paying: ' + e.message; e.prop = 'list'; } }); });   // 1.6.0 (CORE gap 13)
    [errors, warnings].forEach(function(a) { a.forEach(function(e) { if (e.prop === 'list.lockif') { e.message = 'Locked while: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.layif') { e.message = 'Laid from, Only where: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.feedif') { e.message = 'A feed\u2019s Only where: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.colshow') { e.message = 'A column\u2019s Shown on: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.tradeif') { e.message = 'A trade\u2019s roll: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.tilestate') { e.message = 'A tile\u2019s state: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.sthen') { e.message = 'What a state does: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.tileif') { e.message = 'A box\u2019s Shown where: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.tiletaken') { e.message = 'A box\u2019s Taken where: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.standfits') { e.message = 'Fits where: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.standcounts') { e.message = 'Counts where: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.standreach') { e.message = 'Reaches: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.modsif') { e.message = 'Changes apply where: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.subjectif') { e.message = 'Subject only where: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.layer') { e.message = 'Worn in layers: ' + e.message; } else if (e.prop === 'list.onneeds') { e.message = 'Needs to switch on: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.chneeds') { e.message = 'Chambers only where: ' + e.message; e.prop = 'list'; } else if (e.prop === 'list.feedturns') { e.message = 'A feed\u2019s Turns to change: ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && e.prop.indexOf('list.col.') === 0) { e.message = 'Column \u201c' + e.prop.slice(9) + '\u201d: ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && (e.prop.indexOf('list.then.') === 0 || e.prop.indexOf('list.needs.') === 0 || e.prop.indexOf('list.needsWhy.') === 0 || e.prop.indexOf('list.malf.') === 0 || e.prop.indexOf('list.cost.') === 0 || e.prop.indexOf('list.critAt.') === 0 || e.prop.indexOf('list.fumbleAt.') === 0 || e.prop.indexOf('list.bigAt.') === 0 || e.prop.indexOf('list.job.') === 0)) { var thq = e.prop.split('.'), isW = thq[1] === 'needsWhy', isN = isW || thq[1] === 'needs' || thq[1] === 'malf' || thq[1] === 'cost' || thq[1] === 'critAt' || thq[1] === 'fumbleAt' || thq[1] === 'bigAt' || thq[1] === 'job'; e.message = 'Roll \u201c' + thq.slice(isW ? 4 : isN ? 3 : 4).join('.') + '\u201d, ' + (isN ? (thq[1] === 'job' ? 'job' : thq[1] === 'malf' ? 'Malf' : thq[1] === 'cost' ? 'costs' : thq[1] === 'critAt' ? 'critical at' : thq[1] === 'fumbleAt' ? 'critical failure at' : thq[1] === 'bigAt' ? 'lands as a heavy hit at' : isW ? 'needs, reason ' + (+thq[3] + 1) : 'needs') : 'then ' + (+thq[3] + 1)) + ': ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && e.prop.indexOf('list.ctr.') === 0) { e.message = 'Counter \u201c' + e.prop.slice(9) + '\u201d, its most: ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && e.prop.indexOf('list.apply.') === 0) { var apq = e.prop.slice(11).split('.'); e.message = 'Apply \u201c' + apq.slice(2).join('.') + '\u201d' + (apq[1] === 'x' ? '' : ', change ' + (+apq[1] + 1)) + ': ' + e.message; e.prop = 'list'; } else if (typeof e.prop === 'string' && e.prop.indexOf('list.roll.') === 0) { var rp = e.prop.slice(10), rd2 = rp.indexOf('.'); e.message = 'Roll \u201c' + (rd2 >= 0 ? rp.slice(rd2 + 1) : rp) + '\u201d: ' + e.message; e.prop = 'list'; } }); });   // F5b: a list roll's too   // F5a1: a column's messages under its list's card
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
}
// [split:body-end]
return { nameAsks: nameAsks, nameWord: nameWord, plainMessage: plainMessage, readsOf: readsOf, validateSystem: validateSystem };   // [split:glue]
}   // [split:glue]
