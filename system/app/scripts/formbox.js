/* Waypoint — the form over a formula box (1.6.2; the owner, 2026-11-02: "we shouldnt be using code expressions on the user side", by prompt
   "Forms for every formula", "A. Steps" and "A small As text link"). The box itself stays in the page, hidden, with its class, its value and every
   handler that reads it: the form writes its value and says so with an input event, and a change event as it closes, so the System editor's
   dispatchers, its errors and its Save need no word of this. The stored value is still the formula, and opening a form and leaving it writes
   nothing. Text nodes and values only: a label and a stored formula can come from a file. The pure half is formcore.js. */
import { readOpts, writeOpts, read, write, says, readCond, writeCond, saysCond, rollFace, readLine, readMake, tryRoll, tryValue, tryWords, readWords, writeWords, saysWords } from './formcore.js';

// [formcheck:boxes-start]
// which boxes wear the form, and what each wants: a figure (amt), a figure with dice (roll) or a yes or no (cond)
var BOXES = { 'sys-loot-if': 'cond', 'sys-fly-speed': 'amt', 'sys-wout': 'amt', 'sys-tfill-f': 'amt', 'sys-tag-keep': 'cond', 'sys-apply-rows': 'cond', 'sys-dmgr-woundf': 'amt', 'sys-dmgr-ywf': 'amt', 'sys-apply-fxn': 'amt', 'sys-trackof': 'amt', 'sys-list-rolldiv': 'amt', 'sys-list-rollp2d': 'amt', 'sys-list-applyfiren': 'amt', 'sys-init-tie': 'amt', 'sys-env-band': 'amt', 'sys-dmgr-mjcripby': 'amt', 'sys-dmgr-ocripby': 'amt', 'sys-checks-crit': 'amt', 'sys-checks-fumble': 'amt', 'sys-roll-xsstep': 'amt', 'sys-list-xsstep': 'amt', 'sys-roll': 'roll', 'sys-roll-needs': 'cond', 'sys-ovr-value': 'amt', 'sys-ovr-when': 'cond', 'sys-spill-below': 'amt', 'sys-surch-if': 'cond', 'sys-apply-formula': 'amt', 'sys-apply-if': 'cond',
    'sys-combat-broll': 'roll', 'sys-combat-resist': 'roll', 'sys-init-side': 'roll', 'sys-sense-nkcheck': 'roll', 'sys-combat-blstray': 'dice', 'sys-combat-bscatter': 'dice', 'sys-range-formula': 'amt', 'sys-combat-cover-body': 'amt', 'sys-height-formula': 'amt', 'sys-combat-bfall': 'amt', 'sys-combat-beach': 'amt', 'sys-combat-bradius': 'amt', 'sys-combat-bmax': 'amt', 'sys-combat-bmin': 'amt', 'sys-combat-fgreach': 'amt', 'sys-combat-bhand': 'cond',
    'sys-dmgr-major': 'amt', 'sys-dmgr-ohto': 'amt', 'sys-dmgr-locmult': 'amt', 'sys-dmgr-locdie': 'amt', 'sys-dmgr-lat': 'amt', 'sys-dmgr-lpick': 'amt', 'sys-dmgr-lhitw': 'amt', 'sys-dmgr-ladby': 'amt', 'sys-dmgr-lmajw': 'amt', 'sys-dmgr-lbrkw': 'amt', 'sys-dmgr-lwcap': 'amt', 'sys-dmgr-lbrkm': 'amt', 'sys-dmgr-ltplus': 'amt', 'sys-dmgr-wdur': 'amt', 'sys-dmgr-mjif': 'cond', 'sys-dmgr-oif': 'cond', 'sys-dmgr-ohat': 'cond', 'sys-dmgr-locvital': 'cond', 'sys-dmgr-aif': 'cond', 'sys-cvh-where': 'cond', 'sys-sense-nksneak': 'cond',
    'sys-pl-rformula': 'roll', 'sys-list-rollformula': 'roll', 'sys-item-damage': 'dice', 'sys-item-afrag': 'dice', 'sys-item-afflasts': 'dice', 'sys-roll-p2f': 'dice', 'sys-list-rollp2f': 'dice',
    'sys-res-dice': 'dice', 'sys-res-by': 'amt', 'sys-rnd-test': 'cond', 'sys-rnd-next': 'amt', 'sys-list-colshow': 'cond', 'sys-trade-if': 'cond', 'sys-card-pts': 'amt', 'sys-card-n': 'amt', 'sys-card-needs': 'cond', 'sys-help-needs': 'cond', 'sys-help-fig': 'amt', 'sys-ask-min': 'amt', 'sys-ask-max': 'amt', 'sys-roll-malf': 'amt', 'sys-roll-critat': 'amt', 'sys-roll-fumbleat': 'amt', 'sys-roll-bigat': 'amt', 'sys-roll-hits': 'amt', 'sys-list-rollhits': 'amt', 'sys-list-malf': 'amt', 'sys-list-bigat': 'amt', 'sys-list-critat': 'amt', 'sys-list-fumbleat': 'amt', 'sys-list-unheldlvl': 'amt', 'sys-rljobturns': 'amt', 'sys-fx-amtf': 'amt', 'sys-item-mamtf': 'amt', 'lib-mod-amtf': 'amt', 'sys-link-veh': 'cond', 'sys-link-fit': 'cond', 'sys-item-cost': 'amt', 'sys-item-affvs': 'amt', 'sys-pcap-f': 'amt', 'sys-list-colformula': 'amt', 'sys-list-ctmax': 'amt', 'sys-list-feedturns': 'amt', 'sys-list-chamberreach': 'amt', 'sys-area-reach': 'amt', 'sys-list-upamt': 'amt', 'sys-list-ormamt': 'amt', 'sys-list-swcamt': 'amt', 'sys-list-applyformula': 'amt', 'sys-list-applymoney': 'amt', 'sys-link-fform': 'amt', 'sys-turn-mvf': 'amt', 'sys-turn-runf': 'amt', 'sys-turn-facef': 'amt', 'sys-bud-has': 'amt', 'sys-bud-spent': 'amt', 'sys-roll-xsat': 'amt', 'sys-list-xsat': 'amt',
    'sys-tstate-if': 'cond', 'sys-sthen-if': 'cond', 'sys-tbox-if': 'cond', 'sys-tbox-taken': 'cond', 'sys-list-standfits': 'cond', 'sys-list-layrif': 'cond', 'sys-list-standreach': 'cond', 'sys-list-standcounts': 'cond', 'sys-sec-showif': 'cond', 'sys-pl-showif': 'cond', 'sys-roll-mjif': 'cond', 'sys-roll-critok': 'cond', 'sys-list-rollmjif': 'cond', 'sys-list-rsatype': 'amt', 'sys-band-if': 'cond', 'sys-call-if': 'cond', 'sys-call-byif': 'cond', 'sys-fx-auto': 'cond', 'sys-item-affneeds': 'cond', 'sys-list-swshow': 'cond', 'sys-list-swneeds': 'cond', 'sys-pcap-if': 'cond', 'sys-pfit-if': 'cond', 'sys-badge-if': 'cond', 'sys-list-loadneeds': 'cond', 'sys-list-ldtake': 'cond', 'sys-list-chtake': 'cond', 'sys-list-feedif': 'cond', 'sys-list-chamberneeds': 'cond', 'sys-list-rollshow': 'cond', 'sys-list-needs': 'cond', 'sys-list-applyif': 'cond', 'sys-list-lockif': 'cond', 'sys-list-layif': 'cond', 'sys-list-modsif': 'cond', 'sys-list-partsfitif': 'cond', 'sys-list-sjif': 'cond', 'sys-list-throwif': 'cond', 'sys-hold-ends': 'cond', 'sys-alt-if': 'cond', 'sys-turn-lostf': 'cond' };
var LIB_BOX = { libF_flySpeed: 'amt', libF_damage: 'dice', libF_cost: 'amt', libF_needsIf: 'cond', libF_areaFrag: 'dice' };   // the Library window names its boxes by id
function kindOf(inp) {
    if (inp && typeof inp.id === 'string' && Object.prototype.hasOwnProperty.call(LIB_BOX, inp.id)) return LIB_BOX[inp.id];
    if (inp && inp.dataset && inp.dataset.fbr === '1') return 'amt';   // a list's box set to a rule
    var cs = inp && inp.classList; if (!cs) return '';
    if (cs.contains('sys-caption') || cs.contains('sys-list-rolllabel') || (cs.contains('sys-label') && inp.closest && (function() { var rw = inp.closest('.sys-row'); return !!rw && /^r_/.test(rw.dataset.id || ''); })())) return 'words';
    if (cs.contains('sys-formula')) { var rw = inp.closest ? inp.closest('.sys-row') : null; return rw && /^r_/.test(rw.dataset.id || '') ? 'roll' : 'amt'; }
    for (var k in BOXES) if (Object.prototype.hasOwnProperty.call(BOXES, k) && cs.contains(k)) return BOXES[k];
    return '';
}
// [formcheck:boxes-end]
// [formcheck:words-start]
var OPS = [['+', 'Add'], ['-', 'Subtract'], ['*', 'Times'], ['/', 'Divide by'], ['^', 'To the power of'], ['floor', 'Round down'], ['ceil', 'Round up'], ['round', 'Round'], ['trunc', 'Drop the fraction'], ['abs', 'Make it positive'], ['neg', 'Flip the sign'], ['sqrt', 'Square root'], ['log', 'Logarithm, base'], ['least', 'At least'], ['most', 'At most'], ['clamp', 'Held between']];
var TAKES = { '+': 1, '-': 1, '*': 1, '/': 1, '^': 1, log: 1, least: 1, most: 1, clamp: 1 };
var TESTS = [['>=', 'is at least'], ['<=', 'is at most'], ['>', 'is over'], ['<', 'is under'], ['=', 'is'], ['!=', 'is not']];
var CHECKS = [['', 'No test'], ['<=', 'the roll is at most'], ['>=', 'the roll is at least'], ['<', 'the roll is under'], ['>', 'the roll is over'], ['=', 'the roll is exactly'], ['!=', 'the roll is not']];
var KEEPS = [['', 'Keep all'], ['kh', 'Keep the highest'], ['kl', 'Keep the lowest'], ['dh', 'Drop the highest'], ['dl', 'Drop the lowest']];
var REROLLS = [['', 'No reroll'], ['r', 'Reroll once'], ['rr', 'Reroll every time']];
var EXPLODES = [['', 'No exploding'], ['once', 'Exploding'], ['own', 'Each its own die']];
var FACES = ['4', '6', '8', '10', '12', '20', '100'];
// what a roll is for (the owner, by prompt on the sheet: "C. Kind, then questions" and "Keep it, with the odds"): a form starts from what you are doing, and each part asks in plain words
var KINDS = [['beat', 'Beat a number', 'Works or fails: a skill, a dodge, an attack.'], ['total', 'Get a total', 'Damage, initiative, a table to look up.'], ['hits', 'Count hits', 'A handful of dice, each that reaches a number counts.'], ['read', 'Read the dice', 'One handful, read more than one way.'], ['else', 'Something else', 'Build it step by step.']];
var READS = [['high', 'The highest die'], ['low', 'The lowest die'], ['nth', 'A die by its place from the top'], ['best', 'The best few'], ['worst', 'The worst few'], ['count', 'How many reach'], ['sets', 'The most that match'], ['pairs', 'How many pairs'], ['total', 'The total']];
var BEAT = [['<=', 'At most'], ['>=', 'At least'], ['<', 'Under'], ['>', 'Over'], ['=', 'Exactly'], ['!=', 'Anything but']];
var BEAT_SAY = { '<=': 'They need this or less. Rolling low is good here.', '>=': 'They need this or more. Rolling high is good here.', '<': 'They need under this. Rolling low is good here.', '>': 'They need over this. Rolling high is good here.', '=': 'They need exactly this.', '!=': 'Anything but this works.' };
var ASKS = { 'sys-loot-if': ['When can a fallen NPC be searched?', 'Read on the NPC\u2019s own sheet, such as when its hit points are 0 or less. Empty: only the bodies you tick.'], 'sys-fly-speed': ['How far does it fly each round?', 'In cells, worked out from the launcher\u2019s sheet. It may read the map\u2019s factors.'], 'sys-wout': ['What is it until someone types it?', 'Worked out from the sheet. A height in inches, a weight in pounds. Once someone types a figure, theirs stays.'], 'sys-tfill-f': ['What does typing this fill in?', 'Written there at once, only where that field is blank or still holds a figure a fill wrote. A height in inches, a weight in pounds.'], 'sys-tag-keep': ['When does the mark hold?', 'Read for the holder, with the marked token as its target. Empty: nothing of its own ends it.'], 'sys-dmgr-woundf': ['How large is the wound?', 'Worked out from what got through. Leave it empty for what gets through, times the type\u2019s multiplier.'], 'sys-dmgr-ywf': ['How large is this type\u2019s wound?', 'Leave it empty for the one under Taking damage.'], 'sys-apply-fxn': ['What number does it go on with?', 'Leave it empty for its own start.'], 'sys-trackof': ['How many marks does it draw?', 'Leave it empty for its own range, its max, or its figure.'], 'sys-list-rolldiv': ['What divides armour on this hit?', 'Leave it empty for none.'], 'sys-list-rollp2d': ['What divides armour for this part?', 'Leave it empty for none.'], 'sys-list-applyfiren': ['How many at one press?', 'Leave it empty for one.'], 'sys-init-tie': ['What settles a tie?', 'The higher goes first. A value, or dice rolled only for those still tied.'], 'sys-env-band': ['At what reading?', 'Leave it empty for no line here.'], 'sys-dmgr-mjcripby': ['By how much?', 'Leave it empty for how far the roll failed.'], 'sys-dmgr-ocripby': ['By how much?', 'Leave it empty for how far the roll failed.'], 'sys-checks-crit': ['What counts as a critical success?', 'The dice alone, before anything is added. Leave it empty for the usual.'], 'sys-checks-fumble': ['What counts as a critical failure?', 'The dice alone, before anything is added. Leave it empty for the usual.'], 'sys-roll-xsstep': ['How far apart are the next steps?', 'Leave it empty for one step.'], 'sys-list-xsstep': ['How far apart are the next steps?', 'Leave it empty for one step.'], 'sys-caption': ['What does the line under it say?', 'Words, with figures of the sheet among them.'], 'sys-label': ['What does the button say?', 'Words, with figures of the sheet among them.'], 'sys-list-rolllabel': ['What does the button say?', 'Words, with figures of the row among them.'], 'sys-range-formula': ['What is the penalty at a distance?', 'Worked out from how far away the target is.'], 'sys-height-formula': ['What is the penalty for a difference in height?', 'Worked out from how much higher the roller stands.'], 'sys-combat-bfall': ['How much does each token take?', 'With nothing set, every token takes the whole roll.'], 'sys-combat-beach': ['How many dice does each victim roll?', 'With nothing set, one roll for all.'], 'sys-combat-bscatter': ['How far does a miss land from its aim?', 'In yards.'], 'sys-combat-bhand': ['When does it go off in the hand?', 'Read on a critical failure.'], 'sys-combat-bmax': ['How far can it be thrown?', 'In yards.'], 'sys-combat-cover-body': ['How much does a body in the way hide the target?', 'From its Size and the target\u2019s. Empty: a body hides nothing.'], 'sys-combat-bradius': ['How far does it reach where it goes off?', 'In yards. Read from the item\u2019s own radius and the readings there.'], 'sys-combat-bmin': ['How near can it be thrown?', 'In yards.'], 'sys-combat-fgreach': ['How far does fragmentation reach?', 'In yards.'], 'sys-combat-blstray': ['How far does a stray round go?', 'In yards.'],
    'sys-dmgr-major': ['How large is a Major Wound?', 'A wound this large or larger in one blow.'], 'sys-dmgr-mjif': ['Which Major Wounds does this act on?', 'Leave this empty for every one.'], 'sys-dmgr-oif': ['Which wounds does this act on?', 'Leave this empty for every wound.'], 'sys-dmgr-ohat': ['Which rows stand there?', 'Read on each row.'], 'sys-dmgr-ohto': ['What is written on those rows?', 'Read on each row.'], 'sys-dmgr-locvital': ['Which locations are vital?', 'Read on each location.'], 'sys-dmgr-locmult': ['What does a wound multiply by here?', 'Read on each location.'], 'sys-dmgr-locdie': ['What is added for each die?', 'Read on each location.'], 'sys-dmgr-aif': ['When does this take the type\u2019s place?', 'Read on the character.'], 'sys-dmgr-lat': ['What does this layer stop here?', 'Its listed figure at the hit location.'], 'sys-dmgr-lpick': ['Which stat wears here?', '1 for the first ticked, in the list\u2019s order.'], 'sys-dmgr-lhitw': ['What does an ordinary hit wear?', 'Leave this empty for 1.'], 'sys-dmgr-ladby': ['What divisor does this layer take?', 'Leave this empty for the blow\u2019s own.'], 'sys-dmgr-lmajw': ['What does a Major Wound wear?', 'Leave this empty for a quarter of its figure.'], 'sys-dmgr-lbrkw': ['What does a hit wear once it is broken?', 'Leave this empty for 1.'], 'sys-dmgr-lbrkm': ['What does a Major Wound wear once it is broken?', 'Leave this empty to read as a Major Wound above.'], 'sys-dmgr-lwcap': ['What is the most it can wear?', 'It is destroyed there. Leave this empty for twice its figure.'], 'sys-dmgr-ltplus': ['What does it add against this type?', 'Added to the DR for that part of a blow.'], 'sys-dmgr-wdur': ['How sturdy is the weapon?', 'Read on each row.'], 'sys-cvh-where': ['Which location rows does this mean?', 'Read on each location.'], 'sys-sense-nksneak': ['When is it sneaking?', 'Read on the creature.'],
    'sys-res-dice': ['What rolls on it?', 'Its dice.'], 'sys-res-by': ['Which row does it read?', 'It rolls the table\u2019s own dice otherwise.'], 'sys-rnd-test': ['Which rows may be picked?', 'Any row of the list otherwise.'], 'sys-rnd-next': ['What figure does the stat take?', 'Read on the row that was picked.'], 'sys-list-colshow': ['On which rows does it show?', 'Formulas read it on every row all the same.'], 'sys-trade-if': ['Which rows call for this roll?', 'Read on the row as it stands before it goes.'], 'sys-card-pts': ['How many points does a roll give?', 'It is worked out from how the roll came out.'], 'sys-card-n': ['How much?', 'What it adds or takes off.'], 'sys-card-needs': ['When is it offered?', 'It is left off the card at other times.'], 'sys-help-needs': ['Who may help?', 'It is read on the helper\u2019s own sheet.'], 'sys-help-fig': ['What does a helper add?', 'It is worked out on the helper\u2019s own sheet.'], 'sys-ask-min': ['What is the lowest answer?', 'They cannot answer less.'], 'sys-ask-max': ['What is the highest answer?', 'They cannot answer more.'], 'sys-roll-malf': ['When does it jam?', 'A natural roll at or past this jams.'], 'sys-list-malf': ['When does it jam?', 'A natural roll at or past this jams.'], 'sys-roll-critat': ['What counts as a critical success?', 'A natural roll at or past this.'], 'sys-roll-fumbleat': ['What counts as a critical failure?', 'A natural roll at or past this.'], 'sys-roll-bigat': ['What lands as a heavy hit?', 'A success whose natural roll reaches this.'], 'sys-list-bigat': ['What lands as a heavy hit?', 'A success whose natural roll reaches this.'], 'sys-list-critat': ['What counts as a critical success?', 'A natural roll at or past this.'], 'sys-list-fumbleat': ['What counts as a critical failure?', 'A natural roll at or past this.'], 'sys-list-unheldlvl': ['At what level is an entry nobody holds rolled?', 'Worked out from the entry.'],
    'sys-roll-hits': ['How many times does it hit?', 'The damage is rolled this many times on one card.'], 'sys-list-rollhits': ['How many times does it hit?', 'The damage is rolled this many times on one card.'], 'sys-rljobturns': ['How many turns does this job take?', 'The roll is pressed once a turn until it is done.'], 'sys-fx-amtf': ['How much does it change?', 'This takes the place of the number beside it.'], 'sys-item-mamtf': ['How much does it change?', 'Worked out for each character carrying it, reading its own row too. It takes the place of the number beside it.'], 'lib-mod-amtf': ['How much does it change?', 'Worked out for each character carrying it, reading its own row too. It takes the place of the number beside it.'], 'sys-link-veh': ['Which sheets does this link crew?', 'Only they show + Crew\u2026. Read on the vehicle\u2019s own sheet.'], 'sys-link-fit': ['Who may sit here?', 'Read on the sheet that sits here. Leave it empty for anyone.'], 'sys-item-cost': ['What does it cost?', 'The price a character pays for it.'], 'sys-item-affvs': ['What do they resist it with?', 'Read on the character it reaches.'],
    'sys-item-damage': ['How much damage does it do?', 'The dice the item rolls.'], 'sys-item-afrag': ['How much fragmentation does it throw?', 'The dice rolled when it goes off.'], 'sys-item-afflasts': ['How long does it last?', 'Dice are fine here.'], 'sys-roll-p2f': ['How much is the second part?', 'Damage of another type, rolled in the same blow.'], 'sys-list-rollp2f': ['How much is the second part?', 'Damage of another type, rolled in the same blow.'],
    'sys-pcap-f': ['How many does it hold?', 'Read on the row that holds them.'], 'sys-list-colformula': ['How is this column worked out?', 'Worked out for each row.'], 'sys-list-ctmax': ['What is the most it can reach?', 'Worked out for each row.'], 'sys-list-feedturns': ['How many turns does a change take?', 'Read on the row.'], 'sys-list-chamberreach': ['How far does a round fly?', 'In yards.'], 'sys-area-reach': ['How far does it go?', 'In yards.'], 'sys-list-upamt': ['How much does a row pay?', 'Taken each time it comes due.'], 'sys-list-ormamt': ['How much?', 'Read on the row before it goes.'], 'sys-list-swcamt': ['How much?', 'Read on the row as its switch turns.'], 'sys-list-applyformula': ['How much?', 'Read on the row when it is pressed.'], 'sys-list-applymoney': ['How much money?', 'Read on the row when it is pressed.'], 'sys-link-fform': ['How is it worked out?', 'Worked out on each sheet of the group.'],
    'sys-turn-mvf': ['How far does a character move in a turn?', 'Worked out for each character.'], 'sys-turn-runf': ['How far can they go by giving up an action?', 'The most a turn may move that way.'], 'sys-turn-facef': ['How many times may they change facing in a turn?', 'Worked out for each character.'], 'sys-turn-lostf': ['When is a held action lost?', 'Read on the one holding it.'], 'sys-bud-has': ['How many points do they have?', 'Worked out for each character.'], 'sys-bud-spent': ['How many have they spent?', 'Worked out for each character.'], 'sys-roll-xsat': ['What is the first step?', 'The figure at which this first runs.'], 'sys-list-xsat': ['What is the first step?', 'The figure at which this first runs.'],
    'sys-tstate-if': ['When is a tile in this state?', 'The first state that holds is the one it shows.'], 'sys-sthen-if': ['Which rows is this for?', 'It is for every row there otherwise.'], 'sys-tbox-if': ['When does a tile show this box?', 'Every tile shows it otherwise.'], 'sys-tbox-taken': ['When is this box tied up?', 'It is read on the tile.'], 'sys-list-standfits': ['Where may it go?', 'It fits anywhere otherwise.'], 'sys-list-standreach': ['Which other places does it cover?', 'It covers only where it stands otherwise.'], 'sys-list-standcounts': ['When does it count as worn?', 'It always counts otherwise.'], 'sys-sec-showif': ['When does this section show?', 'It stays hidden at other times.'], 'sys-pl-showif': ['When does this show?', 'It stays hidden at other times.'], 'sys-roll-mjif': ['When is it a Major Wound?', 'The card then lands it as one, whatever its size.'], 'sys-roll-critok': ['When does it answer a critical?', 'An attack not resisted on a critical still offers this defence while this holds for the one defending.'], 'sys-list-rollmjif': ['When is it a Major Wound?', 'The card then lands it as one, whatever its size.'], 'sys-list-rsatype': ['What type of attack is it?', 'A defence can read it, to answer some types and not others.'], 'sys-band-if': ['When does a roll land here?', 'The first band that holds names the roll.'], 'sys-call-if': ['When does this card come?', 'Read on the one who rolled.'], 'sys-call-byif': ['When does this card come?', 'Read on the one who resisted.'], 'sys-fx-auto': ['When is this effect on?', 'It comes on and goes off by itself.'], 'sys-item-affneeds': ['Who can it touch?', 'Read on the character it reaches.'], 'sys-list-swshow': ['On which rows does the switch show?', 'Read on each row.'], 'sys-list-swneeds': ['When can a row be switched on?', 'A player is refused at other times.'], 'sys-pcap-if': ['When does this limit count?', 'Read on the row.'], 'sys-pfit-if': ['When does a part fit?', 'Read on the part and its row.'], 'sys-badge-if': ['When does this badge show?', 'Read on each row.'], 'sys-list-loadneeds': ['When can a row load?', 'Read on the row.'], 'sys-list-ldtake': ['Which rows may it take?', 'Read on each row it could take.'], 'sys-list-chtake': ['Which rows may it take a round from?', 'Read on each row it could take.'], 'sys-list-feedif': ['On which rows does this feed stand?', 'Read on each row.'], 'sys-list-chamberneeds': ['When can a row chamber a round?', 'Read on the row.'], 'sys-list-rollshow': ['On which rows does this button show?', 'Read on each row.'], 'sys-list-needs': ['When can they use this?', 'The button greys out at other times.'], 'sys-list-applyif': ['Only when?', 'Leave this empty to make the change every time.'], 'sys-list-lockif': ['When are its rows locked?', 'Read on the character. Blank: never.'], 'sys-list-layif': ['Which of its rows lay a row here?', 'Read on each row of the list it lays from.'], 'sys-list-layrif': ['Which rows does this rule lay?', 'Read on each source row this rule takes.'], 'sys-list-modsif': ['When do its changes count?', 'Read on each row.'], 'sys-list-partsfitif': ['When does a part fit?', 'Read on the part and the row it goes on.'], 'sys-list-sjif': ['Which rows may hold a subject?', 'Read on each row.'], 'sys-list-throwif': ['Which rows may be thrown or placed?', 'Read on each row.'], 'sys-hold-ends': ['When do their holds end?', 'Read on the holder.'], 'sys-alt-if': ['When does this name show?', 'Read on each row.'],
    'sys-apply-rows': ['Which rows does it change?', 'Leave this empty for every row.'], 'sys-roll-needs': ['When can they use this?', 'The button greys out at other times.'], 'sys-ovr-value': ['What does it read instead?', 'This takes the place of its own figure while the test holds.'], 'sys-ovr-when': ['When does it read that?', 'Its own figure stands the rest of the time.'], 'sys-spill-below': ['How low can it go before it spills?', 'Anything past this goes on into the next pool.'], 'sys-surch-if': ['When does each cost take more?', 'While this holds, every cost this pool pays takes more.'], 'sys-apply-formula': ['How much?', 'The figure this change uses.'], 'sys-apply-if': ['Only when?', 'Leave this empty to make the change every time.'], 'sys-formula': ['How is this worked out?', 'The sheet works this out by itself.'] };
function diceOk(o) { return o.kind === 'dice'; }
var ASK_ID = { libF_flySpeed: ['How far does it fly each round?', 'In cells, worked out from the launcher\u2019s sheet. Leave it empty if it does not fly.'], libF_damage: ['How much damage does it do?', 'The dice it rolls.'], libF_cost: ['What does it cost?', 'The price a character pays for it.'], libF_needsIf: ['What must be true before it can be taken?', 'Leave this empty if nothing is needed.'], libF_areaFrag: ['How much fragmentation does it throw?', 'The dice rolled when it goes off.'] };
function askOf(inp) { if (inp && typeof inp.id === 'string' && Object.prototype.hasOwnProperty.call(ASK_ID, inp.id)) return ASK_ID[inp.id]; var cs = inp && inp.classList; if (cs) for (var k in ASKS) if (Object.prototype.hasOwnProperty.call(ASKS, k) && cs.contains(k)) return ASKS[k]; return null; }
var NUM0 = function() { return { k: 'num', v: 0, s: '0' }; };
var NUM1 = function() { return { k: 'num', v: 1, s: '1' }; };
// what an empty box means: a test that is not set may mean always or never, and the box says which
var EMPTY = { 'sys-list-lockif': 'Never', 'sys-list-layrif': 'Every row', 'sys-roll-critok': 'Never', 'sys-list-layif': 'Every row', 'sys-help-needs': 'Anyone on the map', 'sys-dmgr-woundf': 'What gets through', 'sys-dmgr-ywf': 'As the system', 'sys-apply-fxn': 'Its own start', 'sys-trackof': 'Its own range', 'sys-res-by': 'Its own dice', 'sys-rnd-test': 'Any row', 'sys-list-colshow': 'Every row', 'sys-trade-if': 'Every row', 'sys-card-pts': 'None', 'sys-tstate-if': 'Never', 'sys-sthen-if': 'Every row', 'sys-tbox-taken': 'Never', 'sys-list-standfits': 'Anywhere', 'sys-list-standreach': 'Nowhere else', 'sys-combat-bhand': 'Never', 'sys-dmgr-mjif': 'Every one', 'sys-dmgr-oif': 'Every wound', 'sys-dmgr-ohat': 'No row', 'sys-dmgr-locvital': 'None', 'sys-dmgr-aif': 'Never', 'sys-cvh-where': 'None', 'sys-roll-mjif': 'Never', 'sys-list-rollmjif': 'Never', 'sys-sense-nksneak': 'Never', 'sys-fx-auto': 'Only by hand', 'sys-hold-ends': 'Never', 'sys-turn-lostf': 'Never', 'sys-band-if': 'Never', 'sys-alt-if': 'Never', 'sys-ovr-when': 'Never', 'sys-loot-if': 'Only those you tick' };
function emptyWord(kind, inp) { if (inp && inp.id === 'libF_needsIf') return 'Nothing'; var cs = inp && inp.classList; if (cs) for (var k in EMPTY) if (Object.prototype.hasOwnProperty.call(EMPTY, k) && cs.contains(k)) return EMPTY[k]; return kind === 'cond' ? 'Always' : 'Not set'; }
// a value as the one thing a row holds; steps of their own where a form has more than one
function valOfForm(f) { return f && f.steps && f.steps.length === 1 && f.steps[0].op === 'start' && !f.check ? f.steps[0].v : { k: 'calc', form: f }; }
function formOfVal(v) { return v && v.k === 'calc' ? v.form : { steps: [{ op: 'start', v: v }] }; }
// [formcheck:words-end]

function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; }
function btn(cls, text, tip) { var b = el('button', cls, text); b.type = 'button'; if (tip) b.dataset.tip = tip; return b; }
function sel(cls, opts, val, tip) { var s = el('select', cls); opts.forEach(function(o) { var x = el('option', null, o[1]); x.value = o[0]; s.appendChild(x); }); s.value = val === undefined || val === null ? '' : val; if (tip) s.dataset.tip = tip; return s; }

// where the names come from: sheets.js hands the System editor's own, by the box
var source = null;
function srcFor(inp) { var s = null; try { s = typeof source === 'function' ? source(inp) : null; } catch (e) { s = null; } return s && typeof s === 'object' ? s : { groups: [], word: null }; }
function sayOf(s) { return { name: typeof s.word === 'function' ? s.word : null }; }

// the line a shut box shows
function lineOf(inp, kind) {
    var t = String(inp.value || '').trim(), sc = srcFor(inp);
    if (!t) return { text: emptyWord(kind, inp), bad: false, none: true };
    if (kind === 'words') { var wp = readWords(t); return wp ? { text: saysWords(wp, sayOf(sc)) } : { text: t, bad: true }; }
    if (kind === 'cond') { var c = readCond(t); return c.ok ? { text: saysCond(c.cond, sayOf(sc)) } : { text: t, bad: true }; }
    var r = read(t); return r.ok ? { text: says(r.form, sayOf(sc)) } : { text: t, bad: true };
}
function drawLine(b) { var w = lineOf(b.inp, b.kind); b.say.textContent = w.text; b.line.classList.toggle('fb-none', !!w.none); b.line.classList.toggle('fb-bad', !!w.bad); }

// one form open at a time
var open = null;
function shut(keep) {
    var o = open; if (!o) return; open = null; closeMenu();
    if (keep === false && o.inp.value !== o.was) { o.inp.value = o.was; o.inp.dispatchEvent(new Event('input', { bubbles: true })); }
    if (o.touched) { try { o.inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} }
    if (o.root.parentNode) o.root.parentNode.removeChild(o.root);
    o.box.go.hidden = false; drawLine(o.box);
    if (o.box.go && o.box.go.isConnected) { try { o.box.go.focus(); } catch (e) {} }
}
function commit() {
    var o = open; if (!o || !o.form) return;
    var t = o.kind === 'words' ? writeWords(o.form) : o.kind === 'cond' ? writeCond(o.form) : write(o.form);
    if (t === o.inp.value) return;
    o.inp.value = t; o.touched = true; o.inp.dispatchEvent(new Event('input', { bubbles: true }));
    if (o.text && o.text.input) o.text.input.value = t;
    drawLine(o.box);   // the line above the form follows what is being built
    tryDraw();
}
function redraw(focus) {
    var o = open; if (!o) return;
    o.body.textContent = '';
    if (o.bad) o.body.appendChild(el('div', 'fb-note', 'This one cannot be shown as steps yet. Change it with As text below.'));
    else if (o.kind === 'words') wordsInto(o.body, o);
    else if (o.kind === 'roll') rollInto(o.body, o);
    else { var ask = askOf(o.inp); if (ask) { o.body.appendChild(el('div', 'fb-qh', ask[0])); o.body.appendChild(el('div', 'fb-qs', ask[1])); } if (o.kind === 'cond') condInto(o.body, o.form, 'c'); else formInto(o.body, o.form, 'f', false, diceOk(o)); }
    if (focus) { var q = o.body.querySelector('[data-p="' + focus + '"]'); if (q) { try { q.focus(); } catch (e) {} } }
    tryDraw();
}
function again(p) { commit(); redraw(p); }

// a value: a number box, or a button that says what it is. Dice and steps of their own open under it
function valueInto(host, get, set, p, dice) {
    var v = get(), o = open;
    if (v.k === 'num') {
        var n = el('input', 'fb-num'); n.type = 'text'; n.inputMode = 'decimal'; n.value = v.s !== undefined ? v.s : String(v.v); n.dataset.p = p; n.setAttribute('aria-label', 'A number');
        n.addEventListener('input', function() { var t = n.value.trim(), x = Number(t); if (t === '' || !isFinite(x) || !/^-?(\d+\.?\d*|\.\d+)$/.test(t)) { n.classList.toggle('fb-off', t !== ''); return; } n.classList.remove('fb-off'); var nv = { k: 'num', v: x, s: t }; set(nv); commit(); });
        host.appendChild(n);
    }
    var w = v.k === 'num' ? '▾' : says(formOfVal(v), sayOf(srcFor(o.inp))), b = btn('fb-pick' + (v.k === 'num' ? ' fb-pick-more' : ''), w, 'Pick another value');
    b.dataset.p = p + 'b'; if (v.k === 'num') b.setAttribute('aria-label', 'Pick something other than a number');
    b.addEventListener('click', function() { openMenu(b, function(nv) { set(nv); again(p + 'b'); }, dice, v); });
    host.appendChild(b);
    if (v.k === 'dice') diceInto(host, v, set, p);
    else if (v.k === 'calc') { var s = el('div', 'fb-sub'); formInto(s, v.form, p + 's', false, dice); host.appendChild(s); }
    else if (v.k === 'if') {
        var d = el('div', 'fb-sub'); condInto(d, v.c, p + 'c');
        var th = el('div', 'fb-step'); th.appendChild(el('span', 'fb-word', 'Then')); valueInto(th, function() { return valOfForm(v.a); }, function(x) { v.a = formOfVal(x); }, p + 't', dice); d.appendChild(th);
        var ow = el('div', 'fb-step'); ow.appendChild(el('span', 'fb-word', 'Otherwise')); valueInto(ow, function() { return valOfForm(v.b); }, function(x) { v.b = formOfVal(x); }, p + 'e', dice); d.appendChild(ow);
        host.appendChild(d);
    } else if (v.k === 'test') { var ts = el('div', 'fb-sub'); condInto(ts, v.cond, p + 'q'); host.appendChild(ts); }
    else if (v.k === 'fn') { var fa = el('div', 'fb-sub'); v.args.forEach(function(a, i) { var r = el('div', 'fb-step'); valueInto(r, function() { return valOfForm(a); }, function(x) { v.args[i] = formOfVal(x); }, p + 'a' + i, dice); fa.appendChild(r); }); host.appendChild(fa); }
}
function diceInto(host, v, set, p) {
    var box = el('div', 'fb-dice'), mark = function() { v.dirty = true; set(v); }, row = el('div', 'fb-step');
    var cnt = el('input', 'fb-num'); cnt.type = 'text'; cnt.inputMode = 'numeric'; cnt.dataset.p = p + 'n'; cnt.setAttribute('aria-label', 'How many dice');
    // 1.6.2 (found building a dice-pool system by hand): how many dice may come from the sheet, picked as any value is
    if (v.n && v.n.k !== 'num') valueInto(row, function() { return v.n; }, function(x) { v.n = x; mark(); }, p + 'nv', false);
    else {
        cnt.value = v.n ? v.n.s : '1';
        cnt.addEventListener('input', function() { if (!/^\d{1,3}$/.test(cnt.value)) return; v.n = { k: 'num', v: Number(cnt.value), s: cnt.value }; mark(); commit(); });
        row.appendChild(cnt);
        var np = btn('fb-pick fb-pick-more', '▾', 'Take how many dice from the sheet'); np.dataset.p = p + 'nb'; np.setAttribute('aria-label', 'Pick how many dice from the sheet');
        np.addEventListener('click', function() { openMenu(np, function(nv) { v.n = nv; mark(); again(p + 'nb'); }, false, v.n || { k: 'num', v: 1, s: '1' }); });
        row.appendChild(np);
    }
    row.appendChild(el('span', 'fb-d', 'd'));
    var fs = v.f === 'F' ? 'F' : v.f === '%' ? '100' : v.f && v.f.k === 'num' ? String(v.f.v) : '', fo = FACES.map(function(x) { return [x, x]; }); if (fs && FACES.indexOf(fs) < 0) fo.push([fs, fs]);
    var fc = sel('fb-sel', fo, fs); fc.dataset.p = p + 'f'; fc.setAttribute('aria-label', 'Sides on each die');
    fc.addEventListener('change', function() { v.f = fc.value === 'F' ? 'F' : { k: 'num', v: Number(fc.value), s: fc.value }; mark(); commit(); });
    if (v.f && v.f.k && v.f.k !== 'num') fc.disabled = true;
    row.appendChild(fc);
    var kp = sel('fb-sel', KEEPS, v.keep ? v.keep.sub : ''); kp.dataset.p = p + 'k';
    kp.addEventListener('change', function() { if (kp.value) { v.keep = { sub: kp.value, v: v.keep ? v.keep.v : NUM1() }; } else delete v.keep; mark(); again(p + 'k'); });
    row.appendChild(kp);
    if (v.keep) valueInto(row, function() { return v.keep.v; }, function(x) { v.keep.v = x; mark(); }, p + 'kv', false);
    box.appendChild(row);
    var csOwn = open && open.now === 'hits', showCs = !!v.cs && !csOwn, more = btn('fb-more', v.moreOpen || v.reroll || v.explode || showCs ? 'Fewer dice rules' : 'More dice rules', 'Reroll or explode');
    more.dataset.p = p + 'm'; more.addEventListener('click', function() { v.moreOpen = !v.moreOpen; redraw(p + 'm'); });
    box.appendChild(more);
    if (v.moreOpen || v.reroll || v.explode || showCs) {
        var r1 = el('div', 'fb-step'), rr = sel('fb-sel', REROLLS, v.reroll ? v.reroll.sub : ''); rr.dataset.p = p + 'r';
        rr.addEventListener('change', function() { if (rr.value) v.reroll = { sub: rr.value, op: v.reroll ? v.reroll.op : '=', v: v.reroll ? v.reroll.v : NUM1() }; else delete v.reroll; mark(); again(p + 'r'); });
        r1.appendChild(rr);
        if (v.reroll) { var ro = sel('fb-sel', [['=', 'a roll of']].concat(TESTS.slice(0, 4)), v.reroll.op); ro.addEventListener('change', function() { v.reroll.op = ro.value; mark(); commit(); }); r1.appendChild(ro); valueInto(r1, function() { return v.reroll.v; }, function(x) { v.reroll.v = x; mark(); }, p + 'rv', false); }
        box.appendChild(r1);
        var r2 = el('div', 'fb-step'), ex = sel('fb-sel', EXPLODES, v.explode ? (v.explode.own ? 'own' : 'once') : ''); ex.dataset.p = p + 'x';
        ex.addEventListener('change', function() { if (ex.value) { var was = v.explode || {}; v.explode = { own: ex.value === 'own' }; if (ex.value === 'own' && was.op) { v.explode.op = was.op; v.explode.v = was.v; } } else delete v.explode; mark(); again(p + 'x'); });
        r2.appendChild(ex);
        if (v.explode && v.explode.own) { var eo = sel('fb-sel', [['', 'on its top face'], ['>=', 'on this or more']], v.explode.op || ''); eo.addEventListener('change', function() { if (eo.value) { v.explode.op = eo.value; v.explode.v = v.explode.v || { k: 'num', v: 6, s: '6' }; } else { delete v.explode.op; delete v.explode.v; } mark(); again(p + 'x'); }); r2.appendChild(eo); if (v.explode.op) valueInto(r2, function() { return v.explode.v; }, function(x) { v.explode.v = x; mark(); }, p + 'xv', false); }
        box.appendChild(r2);
        if (csOwn) { host.appendChild(box); return; }
        var r3 = el('div', 'fb-step'), cs = sel('fb-sel', [['', 'Add the dice'], ['>=', 'Count dice at or over'], ['<=', 'Count dice at or under']], v.cs ? v.cs.op : ''); cs.dataset.p = p + 'c';
        cs.addEventListener('change', function() { if (cs.value) v.cs = { op: cs.value, v: v.cs ? v.cs.v : { k: 'num', v: 5, s: '5' } }; else delete v.cs; mark(); again(p + 'c'); });
        r3.appendChild(cs);
        if (v.cs) valueInto(r3, function() { return v.cs.v; }, function(x) { v.cs.v = x; mark(); }, p + 'cv', false);
        box.appendChild(r3);
    }
    host.appendChild(box);
}
function formInto(host, f, p, isRoll, dice) {
    var d = dice === undefined ? open.kind === 'roll' || open.kind === 'dice' : dice;
    f.steps.forEach(function(st, i) {
        var row = el('div', 'fb-step'), pi = p + i;
        if (st.op === 'start') { if (i) row.appendChild(el('span', 'fb-word', 'Add')); }
        else {
            var known = OPS.some(function(o) { return o[0] === st.op; }), s = sel('fb-sel fb-op', known ? OPS : OPS.concat([[st.op, st.op]]), st.op, 'What this step does to the answer so far'); s.dataset.p = pi + 'o'; s.setAttribute('aria-label', 'What this step does');
            s.addEventListener('change', function() {
                st.op = s.value;
                if (TAKES[st.op] || (st.op === 'round' && st.v)) st.v = st.v || NUM1(); else delete st.v;
                if (st.op === 'clamp') st.w = st.w || NUM1(); else delete st.w;
                again(pi + 'o');
            });
            row.appendChild(s);
        }
        if (st.v) valueInto(row, function() { return st.v; }, function(x) { st.v = x; }, pi + 'v', d);
        if (st.op === 'clamp' && st.w) { row.appendChild(el('span', 'fb-and', 'and')); valueInto(row, function() { return st.w; }, function(x) { st.w = x; }, pi + 'w', d); }
        if (i) { var x = btn('fb-x', '×', 'Take this step away'); x.setAttribute('aria-label', 'Take this step away'); x.dataset.p = pi + 'x'; x.addEventListener('click', function() { f.steps.splice(i, 1); again(p + 'add'); }); row.appendChild(x); }
        host.appendChild(row);
    });
    var add = btn('fb-add', '+ Add to this', 'Do something more to the answer'); add.dataset.p = p + 'add';
    add.addEventListener('click', function() { f.steps.push({ op: '+', v: NUM0() }); again(p + f.steps.length - 1 + 'vb'); });
    host.appendChild(add);
    if (isRoll) {
        var cr = el('div', 'fb-step'); cr.appendChild(el('span', 'fb-word', 'It works if'));
        var c = sel('fb-sel', CHECKS, f.check ? f.check.op : ''); c.dataset.p = p + 'ck'; c.setAttribute('aria-label', 'What makes the roll a success');
        c.addEventListener('change', function() { if (c.value) f.check = { op: c.value, r: f.check ? f.check.r : { steps: [{ op: 'start', v: NUM0() }] } }; else delete f.check; again(p + 'ck'); });
        cr.appendChild(c);
        if (f.check) valueInto(cr, function() { return valOfForm(f.check.r); }, function(x) { f.check.r = formOfVal(x); }, p + 'cv', false);
        host.appendChild(cr);
    }
}
// words and figures in the order they read, each a line of its own
function wordsInto(host, o) {
    var ask = askOf(o.inp), ps = o.form; if (ask) { host.appendChild(el('div', 'fb-qh', ask[0])); host.appendChild(el('div', 'fb-qs', ask[1])); }
    ps.forEach(function(p, i) {
        var row = el('div', 'fb-step'), pi = 'w' + i;
        if (p.form) {
            valueInto(row, function() { return valOfForm(p.form); }, function(x) { p.form = formOfVal(x); }, pi, false);
            var sl = el('label', 'fb-tick'), sc = el('input'); sc.type = 'checkbox'; sc.checked = p.sign; sc.dataset.p = pi + 's'; sl.appendChild(sc); sl.appendChild(document.createTextNode(' Show its plus sign')); sc.addEventListener('change', function() { p.sign = sc.checked; commit(); }); row.appendChild(sl);
        } else { var n = el('input', 'fb-words'); n.type = 'text'; n.value = p.text; n.dataset.p = pi; n.setAttribute('aria-label', 'Words'); n.addEventListener('input', function() { if (/[{}]/.test(n.value)) n.value = n.value.replace(/[{}]/g, ''); p.text = n.value; commit(); }); row.appendChild(n); }
        if (ps.length > 1) { var x = btn('fb-x', '×', 'Take this away'); x.setAttribute('aria-label', 'Take this away'); x.dataset.p = pi + 'x'; x.addEventListener('click', function() { ps.splice(i, 1); again('wadd'); }); row.appendChild(x); }
        host.appendChild(row);
    });
    var bar = el('div', 'fb-step'), aw = btn('fb-add', '+ Add words', 'Add words after this'), af = btn('fb-add', '+ Add a figure', 'Add a figure of the sheet after this'); aw.dataset.p = 'wadd'; af.dataset.p = 'wfig';
    aw.addEventListener('click', function() { ps.push({ text: ' ' }); again('w' + (ps.length - 1)); });
    af.addEventListener('click', function() { var lp = ps[ps.length - 1]; if (lp && !lp.form && lp.text && !/\s$/.test(lp.text)) lp.text += ' ';   // a figure after words stands apart from them
        ps.push({ form: { steps: [{ op: 'start', v: NUM0() }] }, sign: false, unit: '' }); var at = 'w' + (ps.length - 1) + 'b'; again(at); pressPick(at); });
    bar.appendChild(aw); bar.appendChild(af); host.appendChild(bar);
}
// the plain questions of a roll
function qInto(host, head, say) { var q = el('div', 'fb-q'); q.appendChild(el('div', 'fb-qh', head)); if (say) q.appendChild(el('div', 'fb-qs', say)); host.appendChild(q); return q; }
function pressPick(p) { var o = open, b = o && o.body.querySelector('[data-p="' + p + '"]'); if (b && typeof b.click === 'function') { try { b.click(); } catch (e) {} } }
function addsInto(host, f, from, word, p) {   // figures added to or taken off the first
    f.steps.forEach(function(st, i) {
        if (i < from) return;
        var row = el('div', 'fb-step'), pi = p + i, s = sel('fb-sel fb-op', [['+', 'plus'], ['-', 'minus']], st.op); s.dataset.p = pi + 'o'; s.setAttribute('aria-label', 'Added or taken off');
        s.addEventListener('change', function() { st.op = s.value; commit(); }); row.appendChild(s);
        valueInto(row, function() { return st.v; }, function(x) { st.v = x; }, pi + 'v', false);
        var x = btn('fb-x', '×', 'Take this away'); x.setAttribute('aria-label', 'Take this away'); x.dataset.p = pi + 'x'; x.addEventListener('click', function() { f.steps.splice(i, 1); again(p + 'add'); }); row.appendChild(x);
        host.appendChild(row);
    });
    var add = btn('fb-add', word, 'Add a figure, or take one off'); add.dataset.p = p + 'add';
    add.addEventListener('click', function() { f.steps.push({ op: '+', v: NUM0() }); var at = p + (f.steps.length - 1) + 'vb'; again(at); pressPick(at); });
    host.appendChild(add);
}
function targetInto(host, c, p) {   // what the total must reach
    var r = c.r, simple = !!r.steps[0] && r.steps[0].op === 'start' && r.steps.slice(1).every(function(s) { return s.op === '+' || s.op === '-'; }), row = el('div', 'fb-step'), s = sel('fb-sel', BEAT, c.op); s.dataset.p = p + 'o'; s.setAttribute('aria-label', 'How the total must compare');
    s.addEventListener('change', function() { c.op = s.value; again(p + 'o'); }); row.appendChild(s);
    if (!simple) { valueInto(row, function() { return valOfForm(c.r); }, function(x) { c.r = formOfVal(x); }, p + 'v', false); host.appendChild(row); return; }
    valueInto(row, function() { return r.steps[0].v; }, function(x) { r.steps[0].v = x; }, p + 'v', false); host.appendChild(row);
    addsInto(host, r, 1, '+ Add to this', p + 'a');
}
function readInto(host, w, g) {   // what is read from the handful, a line each
    var last = w.last;
    last.steps.forEach(function(st, i) {
        var row = el('div', 'fb-step'), pi = 'rl' + i, ln = readLine(st.v, g) || { how: 'high' };
        if (i) { var s = sel('fb-sel fb-op', [['+', 'plus'], ['-', 'minus']], st.op); s.dataset.p = pi + 'o'; s.setAttribute('aria-label', 'Added or taken off'); s.addEventListener('change', function() { st.op = s.value; commit(); }); row.appendChild(s); }
        var how = sel('fb-sel', READS, ln.how); how.dataset.p = pi + 'h'; how.setAttribute('aria-label', 'What is read from the dice');
        how.addEventListener('change', function() { st.v = readMake(how.value, g, ln.op, ln.n); again(pi + 'h'); }); row.appendChild(how);
        if (ln.how === 'count') { var o = sel('fb-sel', [['>=', 'at least'], ['<=', 'at most'], ['=', 'exactly']], ln.op); o.dataset.p = pi + 'c'; o.setAttribute('aria-label', 'How a die must compare'); o.addEventListener('change', function() { st.v = readMake('count', g, o.value, ln.n); again(pi + 'c'); }); row.appendChild(o); }
        if (ln.n) valueInto(row, function() { return ln.n; }, function(x) { ln.n = x; st.v = readMake(ln.how, g, ln.op, x); }, pi + 'n', false);
        if (last.steps.length > 1) { var x = btn('fb-x', '×', 'Take this away'); x.setAttribute('aria-label', 'Take this away'); x.dataset.p = pi + 'x'; x.addEventListener('click', function() { last.steps.splice(i, 1); if (last.steps[0]) last.steps[0].op = 'start'; again('rladd'); }); row.appendChild(x); }
        host.appendChild(row);
    });
    var add = btn('fb-add', '+ Read something else', 'Read these same dice another way'); add.dataset.p = 'rladd'; add.addEventListener('click', function() { last.steps.push({ op: '+', v: readMake('count', g) }); again('rl' + (last.steps.length - 1) + 'h'); }); host.appendChild(add);
}
function facePick(k) {
    var o = open, f = o.form, cur = f.steps[0].v, wasFresh = o.fresh; o.fresh = false;
    if (cur && cur.k === 'with' && k !== 'read') { var dv = cur.dice[0].steps[0].v; delete dv.as; dv.dirty = true; f.steps = [{ op: 'start', v: dv }]; }
    if (k === 'read') { var d0 = f.steps[0].v; if (d0 && d0.k === 'dice') { delete d0.cs; d0.as = 'p'; d0.dirty = true; delete f.check; f.steps = [{ op: 'start', v: { k: 'with', dice: [{ steps: [{ op: 'start', v: d0 }] }], last: { steps: [{ op: 'start', v: readMake('high', 'p') }] } } }]; } o.face = ''; again('kread'); return; }
    var d = f.steps[0].v;
    if (k === 'else') { o.face = 'else'; again('kelse'); return; }
    o.face = '';
    if (d && d.k === 'dice') { if (k === 'hits' && !d.cs) { d.cs = { op: '>=', v: { k: 'num', v: 5, s: '5' } }; if (wasFresh && d.f && d.f.k === 'num' && d.f.v === 20) d.f = { k: 'num', v: 6, s: '6' }; d.dirty = true; } else if (k !== 'hits' && d.cs) { delete d.cs; d.dirty = true; } }   // 1.6.2: a new roll that counts hits starts on six-sided dice, as a handful usually is
    if (k === 'beat' && !f.check) f.check = { op: '>=', r: { steps: [{ op: 'start', v: { k: 'num', v: 10, s: '10' } }] } };
    if (k !== 'beat') delete f.check;
    again('k' + k);
}
function rollInto(host, o) {
    var f = o.form, face = rollFace(f), plain = face.kind !== 'else', now = o.fresh ? '' : o.face === 'else' ? 'else' : face.kind, sc = srcFor(o.inp), who = sc && sc.subject ? 'the ' + sc.subject + ' button' : 'this button'; o.now = now;
    host.appendChild(el('div', 'fb-cap', 'What is this roll for?'));
    var g = el('div', 'fb-kinds');
    KINDS.forEach(function(c) {
        var b = btn('fb-kind' + (now === c[0] ? ' on' : '')); b.appendChild(el('b', null, c[1])); b.appendChild(el('small', null, c[2])); b.setAttribute('aria-pressed', now === c[0] ? 'true' : 'false'); b.dataset.p = 'k' + c[0];
        if (!plain && c[0] !== 'else') b.disabled = true; else b.addEventListener('click', function() { facePick(c[0]); });
        g.appendChild(b);
    });
    host.appendChild(g);
    if (!now) { host.appendChild(el('div', 'fb-note', 'Pick one to begin.')); return; }
    if (now === 'else') { if (!plain) host.appendChild(el('div', 'fb-note', 'This roll does more than these can show, so it stays as steps.')); formInto(host, f, 'f', true); return; }
    if (now === 'read') { var dr = face.dice, qd = qInto(host, 'What do they roll?', 'One handful. Every line below reads these same dice.'); diceInto(qd, dr, function(x) { f.steps[0].v.dice[0].steps[0].v = x; }, 'f0v'); readInto(qInto(host, 'What do you read from them?', 'The card shows each one in words.'), f.steps[0].v, face.group); return; }
    var d = f.steps[0].v, q = qInto(host, 'What do they roll?', 'The dice ' + who + ' throws.');
    diceInto(q, d, function(x) { f.steps[0].v = x; }, 'f0v');
    addsInto(q, f, 1, now === 'hits' ? '+ Add to the hits' : '+ Add a figure', 'fa');   // 1.6.2 (the builder trial): a figure Count hits adds is hits
    if (now === 'beat') { var qb = qInto(host, 'What must they beat?', BEAT_SAY[f.check.op] || ''); targetInto(qb, f.check, 'ck'); }
    else if (now === 'hits') {
        var qh = qInto(host, 'What counts as a hit?', 'Each die that reaches this counts as one hit.'), lh = el('div', 'fb-step'), ho = sel('fb-sel', [['>=', 'At least'], ['<=', 'At most']], d.cs.op); ho.dataset.p = 'hc'; ho.setAttribute('aria-label', 'What a die must reach');
        ho.addEventListener('change', function() { d.cs.op = ho.value; d.dirty = true; commit(); }); lh.appendChild(ho);
        valueInto(lh, function() { return d.cs.v; }, function(x) { d.cs.v = x; d.dirty = true; }, 'hv', false); qh.appendChild(lh);
        var qn = qInto(host, 'How many hits do they need?', f.check ? '' : 'Leave this out to just count them.');
        if (f.check) { targetInto(qn, f.check, 'ck'); var off = btn('fb-add', 'Just count them', 'Take the number of hits away'); off.dataset.p = 'hn'; off.addEventListener('click', function() { delete f.check; again('hn'); }); qn.appendChild(off); }
        else { var on = btn('fb-add', '+ Set a number', 'Set how many hits they need'); on.dataset.p = 'hn'; on.addEventListener('click', function() { f.check = { op: '>=', r: { steps: [{ op: 'start', v: NUM1() }] } }; again('hn'); }); qn.appendChild(on); }
    }
}
// [formcheck:try-start]
// Try it: what this does for one of the campaign's characters, on this computer alone. Nothing here is stored
var tryWho = '', tryOver = Object.create(null);
function tryOut(box, o, T, people) {
    var who = people.filter(function(p) { return p.id === tryWho; })[0], s = '';
    try {
        var vars = T.vars(tryWho, tryOver);
        s = o.kind === 'words' ? tryWords(o.form, { who: who.name, vars: vars }) : o.kind === 'roll' || o.kind === 'dice' ? tryRoll(o.form, { who: who.name, vars: vars }) : tryValue(String(o.inp.value || ''), { who: who.name, vars: vars, cond: o.kind === 'cond' });
    } catch (e) { s = ''; }
    box.textContent = s;
}
function tryDraw() {
    var o = open; if (!o || !o.tryEl) return;
    var box = o.tryEl, sc = srcFor(o.inp), T = sc && sc.trial, text = String(o.inp.value || '').trim(); box.textContent = ''; box.hidden = true;
    if (!T || o.bad || o.fresh || !text) return;
    var people = []; try { people = T.people() || []; } catch (e) { people = []; }
    box.hidden = false;
    if (!people.length) { box.appendChild(el('div', 'fb-tryline', 'Make a character to try this on.')); return; }
    if (!people.some(function(p) { return p.id === tryWho; })) tryWho = people[0].id;
    var line = el('div', 'fb-tryline'), res = el('div', 'fb-tryout'), s = sel('fb-sel', people.map(function(p) { return [p.id, p.name]; }), tryWho, 'Who to try this on'); s.setAttribute('aria-label', 'Who to try this on');
    line.appendChild(el('span', null, 'Try it on')); line.appendChild(s);
    s.addEventListener('change', function() { tryWho = s.value; tryOut(res, o, T, people); });
    var asks = []; try { asks = T.asks(text) || []; } catch (e) { asks = []; }
    asks.slice(0, 4).forEach(function(a) {
        var l = String(a.s).toLowerCase();
        if (Array.isArray(a.opts) && a.opts.length) {   // 1.6.2: a question with answers of its own is tried by one of them
            if (tryOver[l] === undefined || !a.opts.some(function(x) { return x[0] === tryOver[l]; })) tryOver[l] = a.opts[0][0];
            var ps = sel('fb-sel', a.opts.map(function(x) { return [String(x[0]), x[1]]; }), String(tryOver[l]), a.word); ps.setAttribute('aria-label', a.word);
            ps.addEventListener('change', function() { var hit = a.opts.filter(function(x) { return String(x[0]) === ps.value; })[0]; if (hit) { tryOver[l] = hit[0]; tryOut(res, o, T, people); } });
            line.appendChild(el('span', null, 'with ' + a.word)); line.appendChild(ps); return;
        }
        var n = el('input', 'fb-num'); n.type = 'text'; n.inputMode = 'decimal'; n.value = tryOver[l] === undefined ? '0' : String(tryOver[l]); n.setAttribute('aria-label', a.word);
        n.addEventListener('input', function() { var x = Number(n.value); if (n.value.trim() !== '' && isFinite(x)) { tryOver[l] = x; tryOut(res, o, T, people); } });
        line.appendChild(el('span', null, 'with ' + a.word)); line.appendChild(n);
    });
    box.appendChild(line); box.appendChild(res); tryOut(res, o, T, people);
}
// [formcheck:try-end]
function condInto(host, c, p) {
    if (!c.tests.length) c.tests.push({ val: { steps: [{ op: 'start', v: NUM1() }] } });
    if (c.tests.length > 1 || c.not) {
        var seg = sel('fb-sel', [['all', 'All of these'], ['any', 'Any of these'], ['none', 'None of these']], c.not ? 'none' : c.any ? 'any' : 'all'); seg.dataset.p = p + 'm'; seg.setAttribute('aria-label', 'How the tests go together');
        seg.addEventListener('change', function() { c.any = seg.value === 'any' || seg.value === 'none'; if (seg.value === 'none') c.not = 1; else delete c.not; again(p + 'm'); });
        host.appendChild(seg);
    }
    c.tests.forEach(function(t, i) {
        var row = el('div', 'fb-step'), pi = p + i;
        if (t.words) wordsTestInto(row, t.words, pi);   // 1.6.2 (167 D)
        else if (t.group) { var g = el('div', 'fb-sub'); condInto(g, t.group, pi + 'g'); row.appendChild(g); }
        else if (t.val) {
            valueInto(row, function() { return valOfForm(t.val); }, function(x) { t.val = formOfVal(x); }, pi + 'l', false);
            var mk = btn('fb-more', 'Compare it', 'Test this against another value'); mk.dataset.p = pi + 'k'; mk.addEventListener('click', function() { t.l = t.val; delete t.val; t.op = '>='; t.r = { steps: [{ op: 'start', v: NUM1() }] }; again(pi + 'k'); }); row.appendChild(mk);
        } else {
            valueInto(row, function() { return valOfForm(t.l); }, function(x) { t.l = formOfVal(x); }, pi + 'l', false);
            var o = sel('fb-sel', TESTS, t.op); o.dataset.p = pi + 'o'; o.setAttribute('aria-label', 'How they compare'); o.addEventListener('change', function() { t.op = o.value; commit(); }); row.appendChild(o);
            valueInto(row, function() { return valOfForm(t.r); }, function(x) { t.r = formOfVal(x); }, pi + 'r', false);
        }
        if (c.tests.length > 1) { var x = btn('fb-x', '×', 'Take this test away'); x.setAttribute('aria-label', 'Take this test away'); x.dataset.p = pi + 'x'; x.addEventListener('click', function() { c.tests.splice(i, 1); again(p + 'add'); }); row.appendChild(x); }
        host.appendChild(row);
    });
    var add = btn('fb-add', '+ Add a test', 'Another thing that must hold'); add.dataset.p = p + 'add';
    add.addEventListener('click', function() { c.tests.push({ l: { steps: [{ op: 'start', v: NUM0() }] }, op: '>=', r: { steps: [{ op: 'start', v: NUM1() }] } }); again(p + (c.tests.length - 1) + 'lb'); });
    host.appendChild(add);
    var wg = (srcFor(open && open.inp).wgroups || []).some(function(g) { return g && Array.isArray(g.items) && g.items.length; });
    if (wg) {   // 1.6.2 (167 D): a test of the words a field holds
        var aw = btn('fb-add', '+ Compare words', 'Test the words a field holds: one of some words, or holds some words'); aw.dataset.p = p + 'addw';
        aw.addEventListener('click', function() { var g0 = (srcFor(open.inp).wgroups || []).filter(function(g) { return g && g.items && g.items.length; })[0]; var nw = { words: { how: 'is', name: g0 ? g0.items[0].s : '', list: [] } }; if (c.tests.length === 1 && blankTest(c.tests[0])) c.tests[0] = nw; else c.tests.push(nw); again(p + (c.tests.length - 1) + 'wv'); });   // it takes the place of a test nobody has set yet
        host.appendChild(aw);
    }
}
// [formcheck:wordstest-start]
// 1.6.2 (167 D; the owner, by prompt: "Also contains"): a field, is one of or contains, and the words, commas between them for is one of
var WORDS_HOW = [['is', 'is one of'], ['contains', 'contains'], ['holds', 'names a row of']];   // holds (164 i): a list holds a row named by the field's words
function wordsTestInto(row, w, pi) {
    var sc = srcFor(open && open.inp), say = sayOf(sc), b = btn('fb-pick', w.name ? nameSaid(w.name, say) : 'Pick a field', 'Pick the field whose words are tested'); b.dataset.p = pi + 'wb';
    b.addEventListener('click', function() { openMenu(b, function(nv) { if (nv && nv.k === 'name') w.name = nv.s; again(pi + 'wb'); }, false, null, true); });
    row.appendChild(b);
    var h = sel('fb-sel', WORDS_HOW, w.how === 'contains' ? 'contains' : 'is'); h.dataset.p = pi + 'wh'; h.setAttribute('aria-label', 'How the words compare');
    h.addEventListener('change', function() { w.how = h.value === 'contains' ? 'contains' : h.value === 'holds' ? 'holds' : 'is'; if (w.how !== 'is') w.list = (w.list || []).slice(0, 1); if (w.how === 'holds' && !w.lst) { var l0 = (sc.wlists || [])[0]; w.lst = l0 ? l0[0] : ''; } again(pi + 'wh'); });
    row.appendChild(h);
    if (w.how === 'holds') {   // 1.6.2 (164 i): the list, by its name
        var ls = (sc.wlists || []).slice(); if (w.lst && !ls.some(function(o) { return o[0].toLowerCase() === String(w.lst).toLowerCase(); })) ls.push([w.lst, 'A list that is gone']);
        var lsel = sel('fb-sel', ls.length ? ls : [['', 'No list yet']], (ls.filter(function(o) { return o[0].toLowerCase() === String(w.lst || '').toLowerCase(); })[0] || ls[0] || [''])[0]); lsel.dataset.p = pi + 'wl'; lsel.setAttribute('aria-label', 'The list');
        lsel.addEventListener('change', function() { w.lst = lsel.value; commit(); }); row.appendChild(lsel);
        if (w.name) return;   // words in quotes in place of a field, as a file may write them, stay in a box
    }
    var t = el('input', 'fb-wordlist'); t.type = 'text'; t.dataset.p = pi + 'wv'; t.value = (w.list || []).join(w.how !== 'is' ? '' : ', ');
    t.placeholder = w.how === 'holds' ? 'The row’s name' : w.how === 'contains' ? 'Words to look for' : 'Words, with commas between'; t.setAttribute('aria-label', w.how === 'holds' ? 'The row’s name' : w.how === 'contains' ? 'Words to look for' : 'The words, with commas between');
    t.addEventListener('input', function() { var v = t.value.replace(/["\u201c\u201d]/g, ''); w.list = w.how !== 'is' ? (v.trim() ? [v.trim()] : []) : v.split(',').map(function(x) { return x.trim(); }).filter(Boolean).slice(0, 8); commit(); });
    row.appendChild(t);
}
function blankTest(t) { var n1 = function(f, v) { return !!f && Array.isArray(f.steps) && f.steps.length === 1 && f.steps[0].op === 'start' && !!f.steps[0].v && f.steps[0].v.k === 'num' && f.steps[0].v.v === v && !f.check; }; return !!t && ((t.val && n1(t.val, 1)) || (t.op === '>=' && n1(t.l, 0) && n1(t.r, 1))); }   // the 0 >= 1 a new box starts with, or the 1 an empty test is
function nameSaid(s, say) { var n = say && typeof say.name === 'function' ? say.name(s) : ''; return typeof n === 'string' && n ? n : String(s); }
// [formcheck:wordstest-end]

// [formcheck:menu-start]
// picking a value: by its name on the sheet, with a Find box; only what this box can read is offered
var menu = null;
function closeMenu() { if (menu) { var m = menu; menu = null; if (m.el.parentNode) m.el.parentNode.removeChild(m.el); document.removeEventListener('pointerdown', m.away, true); } }
function menuRows(q, sc, dice, words) {
    var want = String(q || '').trim().toLowerCase(), out = [];
    ((words ? sc.wgroups : sc.groups) || []).forEach(function(g) {
        var its = (g.items || []).filter(function(i) { return !want || String(i.label).toLowerCase().indexOf(want) >= 0; });
        if (its.length) out.push({ head: g.name, items: its });
    });
    var more = [{ label: 'A number', kind: 'num' }]; if (dice) more.push({ label: 'Dice', kind: 'dice' }); more.push({ label: 'Work something out', kind: 'calc' }, { label: 'If this, then that', kind: 'if' });
    if (!words) out.push({ head: 'Or', items: more.filter(function(m) { return !want || m.label.toLowerCase().indexOf(want) >= 0; }) });   // a field's words: a field and nothing else
    return out;
}
function menuPick(it) {
    if (it.s !== undefined) return { k: 'name', s: it.s };
    if (it.kind === 'num') return NUM0();
    if (it.kind === 'dice') return { k: 'dice', n: NUM1(), f: { k: 'num', v: 6, s: '6' }, dirty: true };
    if (it.kind === 'calc') return { k: 'calc', form: { steps: [{ op: 'start', v: NUM0() }, { op: '+', v: NUM0() }] } };
    return { k: 'if', c: { any: false, tests: [{ l: { steps: [{ op: 'start', v: NUM0() }] }, op: '>=', r: { steps: [{ op: 'start', v: NUM1() }] } }] }, a: { steps: [{ op: 'start', v: NUM1() }] }, b: { steps: [{ op: 'start', v: NUM0() }] } };
}
// [formcheck:menu-end]
function openMenu(anchor, done, dice, cur, words) {
    closeMenu();
    var o = open, sc = srcFor(o.inp), m = el('div', 'fb-menu'), find = el('input', 'fb-find'), list = el('div', 'fb-list');
    find.type = 'text'; find.placeholder = 'Find a value…'; find.setAttribute('aria-label', 'Find a value'); m.appendChild(find); m.appendChild(list);
    function draw() {
        list.textContent = '';
        menuRows(find.value, sc, dice, words).forEach(function(g) {
            if (!g.items.length) return;
            list.appendChild(el('div', 'fb-head', g.head));
            g.items.forEach(function(it) {
                var b = el('button', 'fb-it'); b.type = 'button'; b.appendChild(el('span', null, it.label)); if (it.hint) b.appendChild(el('small', null, it.hint));
                b.addEventListener('click', function() { closeMenu(); done(menuPick(it)); });
                list.appendChild(b);
            });
        });
    }
    find.addEventListener('input', draw);
    m.addEventListener('keydown', function(e) {
        var its = Array.prototype.slice.call(list.querySelectorAll('.fb-it')), at = its.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); var n = e.key === 'ArrowDown' ? at + 1 : at - 1; if (n < 0) find.focus(); else if (its[n]) its[n].focus(); }
        else if (e.key === 'Enter' && e.target === find && its[0]) { e.preventDefault(); e.stopPropagation(); its[0].click(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); try { anchor.focus(); } catch (x) {} }
    });
    draw();
    var host = o.root.closest('#systemModal') || document.body; host.appendChild(m);
    var r = anchor.getBoundingClientRect(), H = window.innerHeight || 700, W = window.innerWidth || 1000; m.style.left = Math.max(8, Math.min(W - 288, r.left)) + 'px';
    var mh = Math.min(320, H - 16), top = r.bottom + 4; if (top + mh > H - 8) top = Math.max(8, r.top - mh - 4); m.style.top = top + 'px'; m.style.maxHeight = mh + 'px';
    menu = { el: m, away: function(e) { if (!m.contains(e.target)) closeMenu(); } };
    document.addEventListener('pointerdown', menu.away, true);
    find.focus();
}

function formOpen(b) {
    if (open && open.box === b) return; shut();
    var t = String(b.inp.value || '').trim(), kind = b.kind, o = { box: b, inp: b.inp, kind: kind, was: b.inp.value, touched: false, form: null, bad: false, fresh: kind === 'roll' && !t, face: '', now: '' };
    if (kind === 'words') { var wf = readWords(t); if (wf) o.form = wf.length ? wf : [{ text: '' }]; else o.bad = true; }
    else if (kind === 'cond') { if (!t) o.form = { any: false, tests: [{ l: { steps: [{ op: 'start', v: NUM0() }] }, op: '>=', r: { steps: [{ op: 'start', v: NUM1() }] } }] }; else { var c = readCond(t); if (c.ok) o.form = c.cond; else o.bad = true; } }
    else if (!t) o.form = { steps: [{ op: 'start', v: kind === 'roll' || kind === 'dice' ? { k: 'dice', n: { k: 'num', v: 1, s: '1' }, f: { k: 'num', v: 20, s: '20' }, dirty: true } : NUM0() }] };
    else { var r = read(t); if (r.ok) o.form = r.form; else o.bad = true; }
    o.root = el('div', 'fb-open'); o.body = el('div', 'fb-body'); o.root.appendChild(o.body); o.tryEl = el('div', 'fb-try'); o.tryEl.hidden = true; o.root.appendChild(o.tryEl);
    var foot = el('div', 'fb-foot'), done = btn('fb-done', 'Done', 'Keep this'), cancel = btn('fb-cancel', 'Cancel', 'Put it back as it was'), clear = btn('fb-cancel', 'Clear', 'Take this out'), tx = btn('fb-astext', 'As text', 'Show it as text, to copy it or paste one in');
    foot.appendChild(done); foot.appendChild(cancel); foot.appendChild(clear); foot.appendChild(tx); o.root.appendChild(foot);
    done.addEventListener('click', function() { shut(); });
    cancel.addEventListener('click', function() { shut(false); });
    clear.addEventListener('click', function() { o.inp.value = ''; o.touched = true; o.form = null; o.inp.dispatchEvent(new Event('input', { bubbles: true })); shut(); });
    tx.addEventListener('click', function() {
        if (o.text) { o.root.removeChild(o.text.row); o.text = null; return; }
        var row = el('div', 'fb-textrow'), inp = el('input', 'fb-text'), note = el('div', 'fb-note'); inp.type = 'text'; inp.value = o.inp.value; inp.spellcheck = false; inp.setAttribute('aria-label', 'As text'); row.appendChild(inp); row.appendChild(note);
        o.root.appendChild(row); o.text = { row: row, input: inp };
        inp.addEventListener('input', function() {
            o.inp.value = inp.value; o.touched = true; o.inp.dispatchEvent(new Event('input', { bubbles: true }));
            var v = inp.value.trim(), x = kind === 'words' ? (function() { var wr = readWords(inp.value); return wr ? { ok: true, words: wr } : { ok: false }; })() : kind === 'cond' ? readCond(v) : read(v);
            if (x.ok) { o.form = kind === 'words' ? (x.words.length ? x.words : [{ text: '' }]) : kind === 'cond' ? x.cond : x.form; o.bad = false; note.textContent = ''; redraw(); } else if (v) { note.textContent = x.error && x.error.message ? x.error.message : 'That cannot be read.'; }
        });
        inp.focus();
    });
    o.root.addEventListener('keydown', function(e) { if (e.key === 'Escape' && !menu) { e.preventDefault(); e.stopPropagation(); shut(); } });
    b.go.hidden = true; b.wrap.appendChild(o.root);
    open = o; redraw();
    var first = o.body.querySelector('input, select, button'); if (first) { try { first.focus(); } catch (e) {} }
}
// [formcheck:sweep-start]
function dress(inp, force) {
    if (!inp || !inp.dataset || inp.dataset.fb) return;
    if (force === true && kindOf(inp) === 'words') { if (!inp.parentNode) return; inp.dataset.fb = '1'; dressLine(inp, 'words'); return; }
    var kind = kindOf(inp); if (!kind || !inp.parentNode) return;
    if (kind === 'words' && !/[{}]/.test(inp.value || '')) {   // plain words stay a box to type in, with a way to add a figure beside it
        if (inp.dataset.fbw) return; inp.dataset.fbw = '1';
        var add = btn('fb-add fb-addfig', '+ Add a figure', 'Put a figure of the sheet among these words');
        add.addEventListener('click', function(e) { e.preventDefault(); if (add.parentNode) add.parentNode.removeChild(add); delete inp.dataset.fbw; dress(inp, true); var w = inp.parentNode, go = w && w.querySelector ? w.querySelector('.fb-go') : null; if (go && typeof go.click === 'function') { go.click(); var q = w.querySelector('[data-p="wfig"]'); if (q && typeof q.click === 'function') q.click(); } });   // the press that said add a figure adds one
        if (inp.nextSibling) inp.parentNode.insertBefore(add, inp.nextSibling); else inp.parentNode.appendChild(add);
        return;
    }
    inp.dataset.fb = '1';
    dressLine(inp, kind);
}
function dressLine(inp, kind) {
    var wrap = el('div', 'fb'), line = el('div', 'fb-line'), say = el('span', 'fb-say'), go = btn('fb-go', 'Change', 'Change this in a form'), b = { inp: inp, kind: kind, wrap: wrap, line: line, say: say, go: go };
    var col = el('div', 'fb-col'), ask = askOf(inp), lead = kind === 'roll' ? 'What this roll does' : ask ? ask[0] : '';   // a shut box says what it is, or 'Not set' says nothing
    if (lead) col.appendChild(el('div', 'fb-lead', lead)); col.appendChild(say);
    line.appendChild(col); line.appendChild(go); go.addEventListener('click', function(e) { e.preventDefault(); formOpen(b); });
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(line); wrap.appendChild(inp); inp.hidden = true;
    inp.addEventListener('wpformshown', function() { drawLine(b); });
    drawLine(b);
}
// [formcheck:pick-start]
// 1.6.2 (the owner: "no code on the user side"): a box that holds a name of one of the system's lists, or a rule that gives its place. It stands as that list, by the names the Combat tab gave, and a rule is a row of the list that opens the form. The stored value is what it always was
var picksOf = null;
function setPicks(fn) { picksOf = fn; }
function pickKind(inp) { var cs = String(inp && inp.className || '').split(' '); for (var i = 0; i < cs.length; i++) { var c = cs[i]; if (/^sys-(roll-dtype|list-rolldtype|roll-p[2-5]t|list-rollp[2-5]t)$/.test(c)) return 'types'; if (/^sys-(roll-dkind|list-rolldkind|roll-p[2-5]k|list-rollp[2-5]k)$/.test(c)) return 'kinds'; } return ''; }
function undress(inp) { var w = inp.parentNode; if (w && w.className === 'fb' && w.parentNode) { w.parentNode.insertBefore(inp, w); w.parentNode.removeChild(w); } delete inp.dataset.fb; }
function dressPick(inp, kind) {
    var rows = picksOf ? (picksOf(kind) || []) : [], v = String(inp.value || '').trim(), hit = rows.filter(function(r) { return String(r[0]).toLowerCase() === v.toLowerCase(); })[0], rule = !!v && !hit;
    var sel = el('select', 'field fb-keypick'), add = function(val, text) { var o = el('option', '', text); o.value = val; sel.appendChild(o); };
    add('', inp.placeholder || 'None'); rows.forEach(function(r) { add(r[0], r[1]); }); add('@rule', 'Worked out by a rule\u2026');
    sel.value = rule ? '@rule' : hit ? hit[0] : ''; sel.title = 'Pick one by name. Worked out by a rule picks it from the sheet: the rule gives its place in the Combat tab\u2019s list, 1 for the first';
    inp.dataset.fbp = '1'; inp.parentNode.insertBefore(sel, inp);
    var set = function() {
        if (sel.value === '@rule') { inp.dataset.fbr = '1'; inp.hidden = false; if (hit || !rule) { inp.value = ''; } dress(inp); return; }
        delete inp.dataset.fbr; undress(inp); inp.hidden = true; if (inp.value !== sel.value) { inp.value = sel.value; try { inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} }
    };
    sel.addEventListener('change', set);
    if (rule) { inp.dataset.fbr = '1'; dress(inp); } else inp.hidden = true;
}
// A stat's options: a row each, with what it stands for picked from the sheet's own figures, never typed
function figsOf(inp) { var s = null; try { s = source ? source(inp) : null; } catch (e) { s = null; } var out = []; ((s && s.groups) || []).forEach(function(g) { if (g && g.name === 'This character') (g.items || []).forEach(function(i) { if (i && typeof i.s === 'string') out.push([i.s, i.label || i.s]); }); }); return out; }
function dressOpts(inp) {
    inp.dataset.fbo = '1'; inp.hidden = true; var box = el('div', 'fb-opts'), rows = readOpts(inp.value), figs = figsOf(inp); inp.parentNode.insertBefore(box, inp);
    var keep = function() { var t = writeOpts(rows); if (t === inp.value) return; inp.value = t; try { inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} };
    var draw = function() {
        box.textContent = '';
        rows.forEach(function(r, i) {
            var rw = el('div', 'fb-opt'), lb = el('input', 'field fb-optname'), sel = el('select', 'field fb-optfig'), add = function(v, t) { var o = el('option', '', t); o.value = v; sel.appendChild(o); }, rm = btn('tool ghost sys-btn fb-optrm', '\u00d7', 'Take this option away');
            lb.type = 'text'; lb.value = r.label; lb.placeholder = 'An option'; lb.title = 'What the option is called'; lb.addEventListener('input', function() { r.label = lb.value; }); lb.addEventListener('change', keep);
            add('', 'Just this word'); figs.forEach(function(f) { add(f[0], 'Stands for ' + f[1]); }); if (r.name && !figs.some(function(f) { return String(f[0]).toLowerCase() === r.name.toLowerCase(); })) add(r.name, 'Stands for a figure that is gone'); sel.value = r.name || ''; sel.title = 'An option may stand for a figure of the sheet, which a formula then reads through it'; sel.addEventListener('change', function() { r.name = sel.value; keep(); });
            rm.addEventListener('click', function() { rows.splice(i, 1); keep(); draw(); });
            rw.appendChild(lb); if (figs.length || r.name) rw.appendChild(sel); rw.appendChild(rm); box.appendChild(rw);
        });
        var more = btn('tool ghost sys-btn fb-optadd', '+ Option', 'Add an option to this list'); more.addEventListener('click', function() { rows.push({ label: '', name: '' }); draw(); var all = box.querySelectorAll('.fb-optname'); if (all.length && all[all.length - 1].focus) all[all.length - 1].focus(); }); box.appendChild(more);
    };
    draw();
}
// [formcheck:pick-end]
function sweep(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return 0;
    var n = 0, all = root.querySelectorAll('input');
    for (var p = 0; p < all.length; p++) { var ip = all[p]; if (!ip.dataset || !ip.parentNode) continue; if (!ip.dataset.fbp) { var pk = pickKind(ip); if (pk) dressPick(ip, pk); } if (!ip.dataset.fbo && ip.classList && ip.classList.contains('sys-list-statopts')) dressOpts(ip); }
    for (var i = 0; i < all.length; i++) { if (all[i].dataset && !all[i].dataset.fb && !all[i].dataset.fbw && kindOf(all[i])) { dress(all[i]); if (all[i].dataset.fb) n++; } }
    return n;
}
function watch(root) {
    if (!root || typeof MutationObserver !== 'function') return null;
    var due = false, mo = new MutationObserver(function() { if (due) return; due = true; requestAnimationFrame(function() { due = false; sweep(root); }); });
    mo.observe(root, { childList: true, subtree: true });
    sweep(root);
    return mo;
}
// [formcheck:sweep-end]
function setSource(fn) { source = fn; }
// a fault's press reaches the form that stands over its box
function openFor(inp) { var w = inp && inp.parentNode, go = w && w.querySelector ? w.querySelector('.fb-go') : null; if (go && typeof go.click === 'function') { go.click(); return true; } return false; }
if (typeof window !== 'undefined') window.wpFormBox = { setPicks: setPicks, openFor: openFor, sweep: sweep, watch: watch, setSource: setSource, kindOf: kindOf, isOpen: function() { return !!open; }, shut: shut };
export { setPicks, sweep, watch, setSource, kindOf, menuRows, menuPick, lineOf, valOfForm, formOfVal, emptyWord, askOf };
