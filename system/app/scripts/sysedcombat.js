/* sysedcombat.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 7, the System editor; split 2026-11-19 with no change in behavior).
   What it holds: the Combat tab's first boxes and the Rules tab's lists: renderCombat and
   combatBody, How turns go and the Initiative box, Environment readings, the marks a token may hold (renderTags and their judge,
   tagJudge), tests, shared values, currencies, decks, result tables, Tables (with the CSV import), sheet categories, name lists and
   Point budgets (the [systemcheck:budgetbox-*] lines).
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sysedCombat() at
   its line `// [split:sysedcombat.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (tools/splitcheck.js holds it): the editor's own state (draft, dirty, tab, layoutView and
   the rest) stands in sheets.js and a part sets it through the setters beside `var draft`. Change the code here as if it still stood
   in sheets.js. */
// [split:of sheets.js]
import { CHAR_CATS, CSV, CUR_MAX, F, LIMITS, TABLE_KEY, TABLE_ROW_KEY, arcsBox, barsBox, blastBox, bodiesBox, bodyBox, canWrite, checkLabel, checksBox, cleanTests, cleanValues, coverHitBox, csvTable, damageBox, darkBox, defendBox, defenseOverview, draft, el, errorCell, formulaSays, getActiveCampaign, grantEntries, grantListFor, hasDice, heightBox, holdsBox, input, isClient, keepPlace, keyWord, labeledNum, labeledSelect, landBox, lightBox, lineUnder, mapKindsBox, markDirty, nameFold, net, numField, numInput, open, patchErrors, postureBox, rangeBox, readCsv, refreshErrors, rolled, rowFocusBack, rowFocusOf, scenesBox, segPut, select, sensesBox, showConfirm, tab, tableKeyOk, tableRangeSays, terrainBox, testFormula, toast, tokenFlags, travelBox, turnBox, ui, uid, valueNow } from './sheets.js';   // [split:glue]
export function sysedCombat() {   // [split:glue]
// [split:body-start]
// [systemcheck:combatdraw-start]
// 1.6.0: a list of this card stepped by the keyboard draws the card again, so the next press stays on that list
function renderCombat() { var was = rowFocusOf(document.activeElement); combatBody(); rowFocusBack(was); }
// [systemcheck:combatdraw-end]
function combatBody() {
    var box = ui('sysCombatBox'); if (!box) return; box.textContent = ''; box.appendChild(el('div', 'sys-note sys-combat-note', 'How thrown blasts behave at this campaign\u2019s table'));
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' });
    if (!cm.cover || typeof cm.cover !== 'object') cm.cover = { on: false, style: 'graded' };
    var tp = function(t) { var m = el('i', 'sys-topic-mark'); if (m.dataset) m.dataset.topic = t; box.appendChild(m); };   // 1.6.2: which topic of the Combat tab what follows stands in
    box.appendChild(labeledSelect('sys-combat-auto', 'Blast automation', [['full', 'Full auto — roll & apply'], ['roll', 'Roll to chat; apply by hand'], ['measure', 'Measure only']], cm.blastAuto, 'What happens when a blast is thrown: full = roll damage and apply it to tokens in range; roll = post the roll for a human to apply; measure = area only.'));
    lineUnder(box, 'What happens when a blast is thrown.');
    box.appendChild(labeledSelect('sys-combat-roller', 'Who rolls', [['owner', 'The character\'s owner'], ['gm', 'Always the GM']], cm.blastRoller, 'Who makes a thrown blast\'s rolls: the owning player, or always the GM.'));
    lineUnder(box, 'Who makes a thrown blast\u2019s rolls.');
    var resFields = (draft.fields || []).filter(function(f) { return f.kind === 'resource'; });
    if (typeof tp === 'function') tp('damage');
    box.appendChild(labeledSelect('sys-combat-hp', 'Damage subtracts from', [['', resFields.length ? 'Pick a pool' : 'Add a pool field first']].concat(resFields.map(function(f) { return [f.id, f.label || f.key]; })), cm.hpResource, 'Which resource full-auto damage reduces (the "health" resource).'));
    lineUnder(box, 'The pool that Full auto damage is taken from.');
    if (typeof tp === 'function') tp('cover');
    box.appendChild(labeledSelect('sys-combat-cover-on', 'Cover from blockers', [['off', 'Off'], ['on', 'On — the ruler, blasts and target marks']], cm.cover.on ? 'on' : 'off', 'When on, the ruler between two character tokens, a blast\'s labels and target marks show cover, read from the map\'s pieces: its sight-blockers (walls, pillars, closed doors, filled cells) and pieces set to give cover you can see over (a crate, a low wall). It changes no roll; with Full auto, the settings below say what a blast does behind each grade of cover, and a blast thrown into a wall or a closed door goes off in front of it.'));
    lineUnder(box, 'Cover is read from the map\u2019s walls and cover pieces.');
    box.appendChild(labeledSelect('sys-combat-cover-style', 'Cover grades', [['graded', 'Graded — half / three-quarters / total'], ['binary', 'Simple — cover / none']], cm.cover.style === 'binary' ? 'binary' : 'graded', 'Graded uses the corner rule for d20-style tiers; Simple reports only whether there is cover (for systems that treat cover as one flat penalty or DR). The tier names are built in; custom thresholds come later.'));
    if (cm.cover.on) box.appendChild(labeledNum('sys-combat-cover-objects', 'Placed objects give cover, cells across', typeof cm.cover.objects === 'number' ? cm.cover.objects : '', 'A picture or a plain shape this many cells across or smaller gives cover you can see over with no setting of its own. Empty: only walls and pieces set to give cover count. A patterned floor, water and the like never count this way, and No cover in a piece\u2019s Properties turns one off.'));
    if (cm.cover.on) lineUnder(box, 'Empty for none. A larger picture stays part of the map.');
    if (cm.cover.on && typeof bodyBox === 'function') bodyBox(box, cm);   // 1.6.2: a body in the way, read from the two Sizes
    if (cm.cover.on) box.appendChild(labeledSelect('sys-combat-height-rule', 'Height and cover', [['', 'Flat — height changes no cover'], ['clears', 'Height clears low cover — from above; from below it hides the target']], cm.height && typeof cm.height === 'object' && cm.height.rule === 'clears' ? 'clears' : '', 'With Token elevation on, looked at from higher than a see-over piece (a crate, a low wall), it gives no cover; from below the target it hides them (total cover). Walls block at any height. A piece\u2019s height is in its Properties; a see-over piece with none is 1 yard tall.'));   // item 19 H1 (the owner's answer: the handbook's rule, per system)
    if (cm.cover.on) lineUnder(box, 'This needs Token elevation on. A piece\u2019s height is in its Properties.');
    if (cm.cover.on) {   // cover follow-ups (owner 2026-09-28): what a full-auto blast does behind each grade
        var cgs = cm.cover.style === 'binary' ? [['cover', 'Blast behind cover'], ['total', 'Blast behind total cover']] : [['half', 'Blast behind half cover'], ['threeq', 'Blast behind three-quarters cover'], ['total', 'Blast behind total cover']];
        cgs.forEach(function(g) { var cur = cm.cover.area && typeof cm.cover.area === 'object' && Object.prototype.hasOwnProperty.call(cm.cover.area, g[0]) ? cm.cover.area[g[0]] : 'full'; var ls = labeledSelect('sys-combat-cover-area', g[1], [['full', 'Full damage'], ['half', 'Half damage'], ['none', 'No damage']], cur === 'half' || cur === 'none' ? cur : 'full', 'With Full auto blasts, what the rolled damage does to a token behind this much cover (measured from the blast\u2019s center).'); ls.lastChild.dataset.grade = g[0]; box.appendChild(ls); });
    }
    if (cm.cover.on && typeof coverHitBox === 'function') coverHitBox(box, cm);   // 1.6.0: where a hit behind cover lands
    if (typeof tp === 'function') tp('outcomes');
    box.appendChild(labeledSelect('sys-combat-checks', 'Roll outcomes', [['', 'Success or failure by the margin'], ['under3d6', '3d6 roll-under criticals'], ['fixed', 'Criticals at fixed rolls']], cm.checks === 'under3d6' || cm.checks === 'fixed' ? cm.checks : '', 'How a check reads. 3d6 roll-under (a roll of exactly 3d6 against a target): 3\u20134 are a critical success, 5 at a target of 15+, 6 at 16+; 17 fails (critically at 15 or less), 18 or failing by 10+ is a critical failure. Criticals at fixed rolls: the dice alone at or under one number are a critical success, at or over another a critical failure, and nothing else is.'));   // Stage 6 F8
    lineUnder(box, 'How a check against a target reads its dice.');
    if (typeof checksBox === 'function') checksBox(box, cm);   // 1.6.0 (the v2 sort's B1): the critical range, and a named success
    if (typeof landBox === 'function') landBox(box, cm);   // 1.6.3 (defense fold 1): when an attack lands
    if (typeof tp === 'function') tp('defenses'); if (typeof defenseOverview === 'function') defenseOverview(box, cm);   // 1.6.3 (defense fold 3): how a weapon test is made, and every rule a defense follows
    if (typeof tp === 'function') tp('blasts');
    if (typeof blastBox === 'function') blastBox(box, cm);   // 1.5.8 explosives: the falloff, the throw's roll, the scatter, the hand, how far and how near, the ways and the fuse
    if (typeof defendBox === 'function') defendBox(box, cm.blast && typeof cm.blast === 'object' && !Array.isArray(cm.blast) ? cm.blast : {}, cm);   // 1.6.0: a blast's own Defense roll
    tp('bars');
    if (typeof barsBox === 'function') barsBox(box, cm);   // backlog 28: the token bars
    tp('holds'); if (typeof holdsBox === 'function') holdsBox(box, cm); tp('range');   // 1.6.0 Who holds whom
    rangeBox(box, cm); tp('height');   // range penalties R1: the system's range rule
    heightBox(box, cm); tp('light');   // item 19 H2: the system's height modifier
    lightBox(box, cm); if (typeof darkBox === 'function') darkBox(box); tp('senses');   // lighting L4: the system's light rules; 1.6.2: and darkness steps
    sensesBox(box, cm); tp('damage');   // senses S2a: the system's senses
    damageBox(box, cm); tp('turns');   // 1.5.6: the damage step's rules, before the turns
    turnBox(box, cm); tp('initiative');   // turn-based combat T1: the system's turn rules
    initBox(box, cm); tp('postures');   // initiative O2: how ties of initiative break
    postureBox(box, cm);   // conditions C3: the system's own postures
    tp('arcs'); if (typeof arcsBox === 'function') arcsBox(box, cm);   // 1.6.2 (vehicles, fold (b), rebuilt): the system's own arcs
    tp('mapkinds'); if (typeof mapKindsBox === 'function') mapKindsBox(box); if (typeof travelBox === 'function') travelBox(box);   // 1.6.2 (backlog 166 a): the travel modes beside the map kinds   // 1.6.2 (vehicles, fold (g)): the system's map kinds
    tp('scenes'); if (typeof scenesBox === 'function') scenesBox(box);   // 1.6.2: a scene's channels
    tp('terrain'); if (typeof terrainBox === 'function') terrainBox(box, cm);   // 1.6.2 (backlog 57): the system's kinds of terrain
    tp('bodies'); if (typeof bodiesBox === 'function') bodiesBox(box, cm);   // 1.6.2 (backlog 42, fold 3): when a fallen NPC can be searched
    if (window.wpSysUi) window.wpSysUi.combatDrawn(box);   // 1.6.2: into a pane a topic
}
// Initiative O2 (docs/TURN_ORDER_PLAN.md; the owner's note: 3d6 systems order by Basic Speed and roll only to settle ties, d20 systems roll and
// roll again for ties): the Combat tab's Initiative box — up to three tie steps, each a formula: with no dice a value (the higher first),
// with dice a roll made only for the rows still tied. Every text lands as a value or a text node. Save cleans them; refreshErrors says what
// it would drop
// [sinkcheck:initbox-start]
// 1.6.2 (G10; the owner, by prompt: "One list", since turn shapes are alternatives and a builder should see only what applies): How turns go. It stores nothing of its own: a shape is read from the keys a system already holds, and picking one writes them, so a saved system opens as it did. A hold, a Wait and the turn-end rules stand on top of a shape and are no part of this list. pick is the draft's own word, which the cleaner never keeps, for a shape whose box is still empty
var TURN_SHAPES = [['once', 'Once a round'], ['sides', 'Sides take turns'], ['chosen', 'Next is chosen'], ['draw', 'From a draw'], ['several', 'Several turns a round'], ['clock', 'A counting clock']];
var TURN_WORDS = { once: 'Everyone acts once a round, in the order the roll gives.', sides: 'The players\u2019 characters and everyone else each make the roll below, and the higher side goes first.', chosen: 'The order stands each round, and whoever ends a turn may pick who goes next.', draw: 'Each character draws at each new round, and the draw sets the order.', several: 'A character acts more than once a round, by its number or by a table of yours.', clock: 'Each character\u2019s number is a count, and the highest acts. Acting lowers it, and a new cycle starts when nobody stands above 0.' };
function turnShape(ir) { if (!ir || typeof ir !== 'object') return 'once'; if (ir.clock) return 'clock'; if (ir.several) return 'several'; if (ir.chosen === true) return 'chosen'; if (ir.deck) return 'draw'; if (typeof ir.side === 'string' && ir.side.trim()) return 'sides'; return 'once'; }
function turnShapeSeen(ir) { return ir && TURN_SHAPES.some(function(s) { return s[0] === ir.pick; }) ? ir.pick : turnShape(ir); }
// 1.6.3 (Fulllion's rulings of 2026-11-20: "it makes sense to have fields be required when other fields depend on them", and "none isn't a good default
// substitution"): what a shape's own required box starts at when the shape is picked, so a system saved straight after the pick keeps the shape. Several
// turns a round takes 10 off each pass, a counting clock charges 10 an action, and sides each roll 1d6. These are the editor's starting values only: the
// cleaner, the host and a saved system read what is stored, and a box the GM empties is said under the Initiative box by the System editor's faults
var SHAPE_START = { minus: 10, cost: 10, side: '1d6' };
// The first deck of the draft's system a draw can name, or '' where it has none. From a draw starts on it
function turnDeckFirst() { var l = draft && Array.isArray(draft.decks) ? draft.decks.filter(function(d) { return !!d && typeof d.key === 'string' && /^D[0-9]+$/.test(d.key); }) : []; return l.length ? l[0].key : ''; }
function turnShapePick(cm, v) {
    var i0 = cm.initiative && typeof cm.initiative === 'object' && !Array.isArray(cm.initiative) ? cm.initiative : (cm.initiative = {}); ['chosen', 'side', 'deck', 'several', 'clock'].forEach(function(k) { delete i0[k]; });
    if (v === 'chosen') i0.chosen = true; if (v === 'several') i0.several = { by: 'passes', minus: SHAPE_START.minus }; if (v === 'clock') i0.clock = { cost: SHAPE_START.cost }; if (v === 'once') delete i0.pick; else i0.pick = v; if (!Object.keys(i0).length) delete cm.initiative;
    if (v === 'sides') i0.side = SHAPE_START.side;   // 1.6.3: each shape starts with what it needs, so picking it alone is a shape Save keeps
    if (v === 'draw') { var dk0 = turnDeckFirst(); if (dk0) i0.deck = { key: dk0 }; }   // with no deck yet the row says to make one, and the fault says the same
}
function shapeOff(e) { if (e && e.style) e.style.display = 'none'; }
// 1.6.2 (backlog 59; the owner, by prompt: "A turn-order method, not just a roll", to fit any game): How turns are ordered. A roll, named in a list,
// which marks it as the initiative roll; a fixed figure of the sheet, read with no roll; or numbers the GM types in the roster. Sides stay a
// shape of How turns go. Its own listeners, as the deck's row has
function turnOrderRow(wrap, cm, ir) {
    var by = ir.by === 'gm' ? 'gm' : ir.by === 'figure' ? 'figure' : 'roll', row = el('div', 'sys-flags sys-init-byrow'), setI = function() { cm.initiative = cm.initiative && typeof cm.initiative === 'object' && !Array.isArray(cm.initiative) ? cm.initiative : {}; return cm.initiative; };
    var tidy = function() { if (cm.initiative && !Object.keys(cm.initiative).length) delete cm.initiative; markDirty(); renderCombat(); if (typeof patchErrors === 'function') patchErrors(); }, on = function(x, fn) { if (x && typeof x.addEventListener === 'function') x.addEventListener('change', fn); }, rolls = Array.isArray(draft.rolls) ? draft.rolls : [], fields = Array.isArray(draft.fields) ? draft.fields : [];
    var sB = select('sys-init-by', [['roll', 'By a roll'], ['figure', 'By a fixed figure, with no roll'], ['gm', 'Set by the GM']], by, 'Where each character\u2019s place in the order comes from'); row.appendChild(el('span', 'sys-num-cap', 'How turns are ordered')); row.appendChild(sB);
    on(sB, function() { var i0 = setI(); delete i0.by; delete i0.fig; if (sB.value === 'gm') i0.by = 'gm'; else if (sB.value === 'figure') { i0.by = 'figure'; var f0 = fields.filter(function(f) { return f && (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource'); })[0]; if (f0) i0.fig = f0.id; } tidy(); });
    if (by === 'roll') {
        var rl = rolls.filter(function(r) { return r && !Array.isArray(r.apply); }), cur = rl.filter(function(r) { return r.init; })[0];
        var sR = select('sys-init-byroll', [['', rl.length ? 'Pick the roll' : 'Make a roll first, in the Rolls tab']].concat(rl.map(function(r) { return [r.id, String(r.label || 'A roll').replace(/\s*\(?\{[^}]*\}\)?/g, '').trim() || 'A roll']; })), cur ? cur.id : '', 'The roll that orders a fight. One with no dice is worked out, and one with dice is rolled');
        on(sR, function() { rolls.forEach(function(r) { if (r) delete r.init; }); var pk = rolls.filter(function(r) { return r && r.id === sR.value; })[0]; if (pk) pk.init = true; markDirty(); renderCombat(); if (typeof patchErrors === 'function') patchErrors(); }); row.appendChild(sR);
    } else if (by === 'figure') {
        var fl = fields.filter(function(f) { return f && f.id && (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource'); });
        var sF = select('sys-init-byfig', [['', 'Pick the figure']].concat(fl.map(function(f) { return [f.id, f.label || 'A field']; })), typeof ir.fig === 'string' ? ir.fig : '', 'The figure that orders a fight, the higher first, with no roll'); on(sF, function() { var i0 = setI(); if (sF.value) i0.fig = sF.value; else delete i0.fig; tidy(); }); row.appendChild(sF);
    }
    wrap.appendChild(row);
    wrap.appendChild(el('div', 'sys-note', by === 'gm' ? 'You type each character\u2019s number in the fight\u2019s roster. Nothing is rolled.' : by === 'figure' ? 'Each character\u2019s figure is its number, the higher first. Nothing is rolled.' : 'Each character makes this roll, the higher first. One with no dice is worked out.'));
}
function initBox(box, cm) {
    var ir = cm.initiative && typeof cm.initiative === 'object' && !Array.isArray(cm.initiative) ? cm.initiative : {}, ties = Array.isArray(ir.ties) ? ir.ties : [], wrap = el('div', 'sys-init');
    wrap.appendChild(el('div', 'sys-light-head', 'Initiative'));
    wrap.appendChild(el('div', 'sys-note', 'Who goes first comes from How turns are ordered, below. When two tie, the steps below settle it in turn: a value puts the higher first, and dice are rolled only for those still tied, and again while they stay tied. They read only what players can read, since the order is public.'));
    var shNow = turnShapeSeen(ir), rS = el('div', 'sys-flags sys-init-shaperow'), sS = select('sys-init-shape', TURN_SHAPES, shNow, 'The shape of a fight\u2019s turns. Only what the shape asks for shows below'); rS.appendChild(el('span', 'sys-num-cap', 'How turns go')); rS.appendChild(sS); wrap.appendChild(rS); wrap.appendChild(el('div', 'sys-note', TURN_WORDS[shNow] || ''));
    if (shNow !== 'draw' && shNow !== 'clock') turnOrderRow(wrap, cm, ir);   // 1.6.2 (backlog 59): where the order's numbers come from
    var r = el('div', 'sys-flags sys-init-ties'); r.appendChild(el('span', 'sys-num-cap', 'Ties go to the higher'));
    for (var i = 0; i < LIMITS.initTies; i++) { var ti = input('sys-init-tie field', typeof ties[i] === 'string' ? ties[i] : '', i === 0 ? 'The first step for a tie: a value (DX) or a roll (1d6)' : 'If still tied: a value or a roll', i === 0 ? 'e.g. DX' : i === 1 ? 'then, e.g. 1d6' : 'then\u2026'); ti.maxLength = LIMITS.formula; ti.dataset.ti = String(i); var tiW = el('span', 'sys-init-tiew'); tiW.appendChild(ti); r.appendChild(tiW); if (i > 0 && !(typeof ties[i - 1] === 'string' && ties[i - 1])) shapeOff(tiW); }   // the next step shows once the one before it is filled
    wrap.appendChild(r);
    // initiative O4: rolled again every round (a tick), and a sides roll (the players' characters against everyone else, each round)
    var r2 = el('div', 'sys-flags sys-init-more'), evL = el('label', 'sys-hover'), evC = el('input', 'sys-init-every'); evC.type = 'checkbox'; evC.checked = ir.every === true; evL.appendChild(evC); evL.appendChild(document.createTextNode(' Rolled again every round')); evL.title = 'When a new round begins, everyone in the fight rolls the initiative roll again and the order re-sorts (a row with no character keeps its number)'; r2.appendChild(evL);
    var sdW = el('span', 'sys-init-sidew'); sdW.appendChild(el('span', 'sys-num-cap', 'Sides roll')); r2.appendChild(sdW); var sdI = input('sys-init-side field', typeof ir.side === 'string' ? ir.side : '', 'Side initiative: the players\u2019 characters and everyone else each roll this when the fight starts and at every new round, the higher side first, each side in its own order. It reads no one\u2019s values. Sides take turns needs it', 'e.g. 1d6'); sdI.maxLength = LIMITS.formula; sdW.appendChild(sdI);
    var chL = el('label', 'sys-hover'), chC = el('input', 'sys-init-chosen'); chC.type = 'checkbox'; chC.checked = ir.chosen === true; chL.appendChild(chC); chL.appendChild(document.createTextNode(' Next is chosen')); chL.title = 'When a turn ends, the one who acted may pick who goes next from those who have not gone this round, on the turn strip. The GM can always pick for anyone. With no pick the next in the order goes, and once everyone has gone a new round starts from the order\u2019s first'; r2.appendChild(chL);   // initiative O5: a third order, Next is chosen
    if (shNow !== 'once' && shNow !== 'sides') shapeOff(evL); if (shNow !== 'sides') shapeOff(sdW); shapeOff(chL);   // the list says it now, and the tick stays for what reads it
    wrap.appendChild(r2);
    var rD = el('div', 'sys-flags sys-init-decrow'), dL = el('label', 'sys-hover'), dC = el('input', 'sys-init-declare'), dSL = el('label', 'sys-hover'), dS = el('input', 'sys-init-declareseen'); dC.type = 'checkbox'; dC.checked = ir.declare === true; dL.appendChild(dC); dL.appendChild(document.createTextNode(' Everyone declares first')); dL.title = 'At each round\u2019s start everyone writes what they mean to do, hidden from everyone until all are in. You write for the NPCs the same way, and can reveal early. It works with any shape'; rD.appendChild(dL); dS.type = 'checkbox'; dS.checked = ir.declareSeen === true; dSL.appendChild(dS); dSL.appendChild(document.createTextNode(' The GM reads them as they come')); dSL.title = 'Players stay hidden from each other, and you read each line as it arrives'; rD.appendChild(dSL); if (ir.declare !== true) shapeOff(dSL); wrap.appendChild(rD);
    // 1.6.2 (G9): the order from a draw. Only a deck of the system's, which every campaign on it has. Its own listeners, and classes no handler reads
    var dkL = Array.isArray(draft.decks) ? draft.decks.filter(function(d) { return !!d && typeof d.key === 'string'; }) : [], dkCur = ir.deck && typeof ir.deck.key === 'string' ? ir.deck : null;
    if (dkL.length || dkCur) {
        var r3 = el('div', 'sys-flags sys-init-deckrow'), dkAt = dkCur ? dkL.filter(function(d) { return d.key === dkCur.key; })[0] : null, setI = function() { cm.initiative = cm.initiative && typeof cm.initiative === 'object' ? cm.initiative : {}; return cm.initiative; };
        var sD = select('sys-init-deck', [['', shNow === 'draw' ? 'Pick a deck' : 'The order comes from rolls']].concat(dkL.map(function(d) { return [d.key, 'A draw each round: ' + (d.label || 'A deck')]; })), dkCur ? dkCur.key : '', 'Each character draws a card at each new round, and that sets the order. A card marked Ends the round ends the round where it stands');
        sD.addEventListener('change', function() { var i0 = setI(); if (sD.value) i0.deck = { key: sD.value }; else delete i0.deck; markDirty(); renderCombat(); if (typeof patchErrors === 'function') patchErrors(); }); r3.appendChild(sD);
        if (dkCur && dkAt) {
            var sB = select('sys-init-deckby', [['', 'In the order drawn']].concat((dkAt.stats || []).map(function(s) { return [s.key, 'Highest ' + (s.label || 'number') + ' first']; })), typeof dkCur.by === 'string' ? dkCur.by : '', 'Which number of a card sets the order'); sB.addEventListener('change', function() { var i0 = setI(); if (!i0.deck) return; if (sB.value) i0.deck.by = sB.value; else delete i0.deck.by; markDirty(); }); r3.appendChild(sB);
            var fL = el('label', 'sys-hover'), fC = el('input', 'sys-init-deckfresh'); fC.type = 'checkbox'; fC.checked = dkCur.fresh === true; fC.addEventListener('change', function() { var i0 = setI(); if (!i0.deck) return; if (fC.checked) i0.deck.fresh = true; else delete i0.deck.fresh; markDirty(); }); fL.appendChild(fC); fL.appendChild(document.createTextNode(' Shuffle every round')); fL.title = 'Every round starts from the whole deck, but for what hands hold. Unticked, the deck runs on, and reshuffles when it runs out'; r3.appendChild(fL);
        }
        if (shNow !== 'draw') shapeOff(r3);
        wrap.appendChild(r3);
    } else if (shNow === 'draw') wrap.appendChild(el('div', 'sys-note', 'Make a deck first, in the Rules tab.'));
    if (shNow === 'clock') {   // 1.6.2 (G10): its own listeners, as the deck's row has
        var ckS = ir.clock && typeof ir.clock === 'object' ? ir.clock : {}, r6 = el('div', 'sys-flags sys-init-ckrow'), ckBox = function(cls, cap, k, tip, ph) { var b = el('input', cls + ' field'), l = el('label', 'sys-hover'); b.type = 'number'; b.min = '1'; b.max = '999'; b.step = '1'; b.value = typeof ckS[k] === 'number' ? String(ckS[k]) : ''; b.title = tip; if (ph) b.placeholder = ph; b.addEventListener('change', function() { var i0 = cm.initiative || (cm.initiative = {}), s0 = i0.clock && typeof i0.clock === 'object' ? i0.clock : (i0.clock = {}), n = Math.floor(Number(b.value)); if (b.value !== '' && n >= 1 && n <= 999) s0[k] = n; else delete s0[k]; markDirty(); if (typeof patchErrors === 'function') patchErrors(); }); l.appendChild(document.createTextNode(cap + ' ')); l.appendChild(b); r6.appendChild(l); };
        ckBox('sys-init-ckcost', 'An action costs', 'cost', 'What a turn costs where its rolls name no cost of their own. A counting clock needs it', String(SHAPE_START.cost)); ckBox('sys-init-ckpass', 'A pass costs', 'pass', 'What a turn that did nothing costs. Blank: the same as an action', 'the same'); wrap.appendChild(r6); wrap.appendChild(el('div', 'sys-note', 'An action needs a cost. A turn costs at least 1, so the clock keeps moving by itself.'));
    }
    if (shNow === 'several') {   // 1.6.2 (G10): its own listeners, and classes no handler reads, as the deck's row has
        var sv = ir.several && typeof ir.several === 'object' ? ir.several : {}, r4 = el('div', 'sys-flags sys-init-sevrow'), setV = function(k, v, redraw) { var i0 = cm.initiative || (cm.initiative = {}), s0 = i0.several && typeof i0.several === 'object' ? i0.several : (i0.several = { by: 'passes' }); if (v === '') delete s0[k]; else s0[k] = v; markDirty(); if (redraw) renderCombat(); if (typeof patchErrors === 'function') patchErrors(); };
        var tbL = Array.isArray(draft.tables) ? draft.tables.filter(function(t) { return !!t && typeof t.key === 'string'; }) : [], flL = (Array.isArray(draft.fields) ? draft.fields : []).filter(function(f) { return !!f && !!f.key && (f.kind === 'number' || f.kind === 'formula'); });
        // 1.6.3 (Fulllion's rulings of 2026-11-20): By a table needs its table and the number it reads, and By passes what each pass takes away. Picking either
        // fills what it needs where the box is empty: the first table and the first number of the sheet, or SHAPE_START's figure. Anything still empty is said
        // under the Initiative box by the System editor's faults, and Save then goes back to Once a round as it always did
        var sevFill = function(by) { var s0 = (cm.initiative && cm.initiative.several && typeof cm.initiative.several === 'object') ? cm.initiative.several : {}; if (by === 'table') { if (tbL[0] && !(typeof s0.table === 'string' && s0.table)) setV('table', tbL[0].key); if (flL[0] && !(typeof s0.stat === 'string' && s0.stat)) setV('stat', flL[0].key); } else if (!(typeof s0.minus === 'number' && s0.minus >= 1)) setV('minus', SHAPE_START.minus); };
        var sBy = select('sys-init-sevby', [['passes', 'By passes'], ['table', 'By a table']], sv.by === 'table' ? 'table' : 'passes', 'Passes: a character acts at its number, then again at that number less a figure, while that stays above 0. A table: a row for each value, a column for each segment'); sBy.addEventListener('change', function() { sevFill(sBy.value); setV('by', sBy.value, true); }); r4.appendChild(sBy);
        if (sv.by === 'table') {
            var sT = select('sys-init-sevtable', [['', 'Pick a table']].concat(tbL.map(function(t) { return [t.key, t.label || t.key]; })), typeof sv.table === 'string' ? sv.table : '', 'A row for each value the number can hold, a column for each segment, and a figure above 0 where the character acts'); sT.addEventListener('change', function() { setV('table', sT.value); }); r4.appendChild(sT);
            var sF = select('sys-init-sevstat', [['', 'Pick the number it reads']].concat(flL.map(function(f) { return [f.key, f.label || f.key]; })), typeof sv.stat === 'string' ? sv.stat : '', 'Which number of the sheet finds the character\u2019s row'); sF.addEventListener('change', function() { setV('stat', sF.value); }); r4.appendChild(sF);
            if (!tbL.length) r4.appendChild(el('span', 'sys-note', 'Make a table first, in the Rules tab.'));   // 1.6.3: what it needs and where to make it
            if (!flL.length) r4.appendChild(el('span', 'sys-note', 'Make a number field first, in the Fields tab.'));
        } else { var mI = el('input', 'sys-init-sevminus field'); mI.type = 'number'; mI.min = '1'; mI.max = '1000'; mI.step = '1'; mI.placeholder = String(SHAPE_START.minus); mI.value = typeof sv.minus === 'number' ? String(sv.minus) : ''; mI.title = 'What each pass takes from a character\u2019s number'; mI.addEventListener('change', function() { var n = Math.floor(Number(mI.value)); setV('minus', n >= 1 && n <= 1000 ? n : ''); }); var mL = el('label', 'sys-hover'); mL.appendChild(document.createTextNode('Each pass takes away ')); mL.appendChild(mI); r4.appendChild(mL); }
        wrap.appendChild(r4);
        var r5 = el('div', 'sys-flags sys-init-sevsets'), each = [['turn', 'Each of its turns'], ['round', 'Once a round']];
        [['move', 'Move comes back', 'turn'], ['acts', 'Actions come back', 'turn'], ['fx', 'Timed effects count', 'round']].forEach(function(p) { var sS2 = select('sys-init-sev' + p[0], each, sv[p[0]] === 'round' || sv[p[0]] === 'turn' ? sv[p[0]] : p[2], 'Each of its turns, or once a round'); sS2.addEventListener('change', function() { setV(p[0], sS2.value === p[2] ? '' : sS2.value); }); r5.appendChild(el('span', 'sys-num-cap', p[1])); r5.appendChild(sS2); });
        wrap.appendChild(r5);
    }
    var err = errorCell('initiative'); err.dataset.errFor = 'initiative'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function onInitInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-init-') < 0) return false;
    if (c.indexOf('sys-init-side') >= 0) {   // initiative O4: the sides' roll (Save cleans it)
        var cmS = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), irS = cmS.initiative && typeof cmS.initiative === 'object' && !Array.isArray(cmS.initiative) ? cmS.initiative : (cmS.initiative = {}), sv = String(t.value || '').slice(0, LIMITS.formula);
        if (sv.trim()) irS.side = sv; else { delete irS.side; if (!Object.keys(irS).length) delete cmS.initiative; }
        markDirty(); patchErrors(); return true;
    }
    var i = Number(t.dataset && t.dataset.ti); if (c.indexOf('sys-init-tie') < 0 || !(i >= 0 && i < LIMITS.initTies && Math.floor(i) === i)) return true;
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), ir = cm.initiative && typeof cm.initiative === 'object' && !Array.isArray(cm.initiative) ? cm.initiative : (cm.initiative = {});
    var ties = Array.isArray(ir.ties) ? ir.ties.slice(0, LIMITS.initTies).map(function(x) { return typeof x === 'string' ? x : ''; }) : []; while (ties.length < LIMITS.initTies) ties.push('');
    ties[i] = t.value.slice(0, LIMITS.formula);   // each box its own place (Save drops the blanks)
    if (ties.some(function(x) { return x.trim(); })) ir.ties = ties; else { delete ir.ties; if (!Object.keys(ir).length) delete cm.initiative; }
    markDirty(); patchErrors(); return true;
}
function onInitChange(t) {   // the boxes' change events (their input events did the work); initiative O4: the Rolled again every round tick, true only
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-init-') < 0) return false;
    if (c.indexOf('sys-init-tie') >= 0 && typeof renderCombat === 'function') { renderCombat(); return true; }
    if (c.indexOf('sys-init-declare') >= 0) { var cmD = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), irD = cmD.initiative && typeof cmD.initiative === 'object' && !Array.isArray(cmD.initiative) ? cmD.initiative : (cmD.initiative = {}), kD = c.indexOf('sys-init-declareseen') >= 0 ? 'declareSeen' : 'declare'; if (t.checked === true) irD[kD] = true; else { delete irD[kD]; if (kD === 'declare') delete irD.declareSeen; } if (!Object.keys(irD).length) delete cmD.initiative; markDirty(); renderCombat(); return true; }   // 1.6.2 (G10)
    if (c.indexOf('sys-init-shape') >= 0) { turnShapePick(draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), t.value); markDirty(); renderCombat(); if (typeof patchErrors === 'function') patchErrors(); return true; }   // 1.6.3: and what the new shape still needs is said at once   // 1.6.2 (G10): How turns go
    if (c.indexOf('sys-init-every') >= 0) {
        var cmE = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), irV = cmE.initiative && typeof cmE.initiative === 'object' && !Array.isArray(cmE.initiative) ? cmE.initiative : (cmE.initiative = {});
        if (t.checked === true) irV.every = true; else { delete irV.every; if (!Object.keys(irV).length) delete cmE.initiative; }
        markDirty(); patchErrors();
    }
    if (c.indexOf('sys-init-chosen') >= 0) {   // initiative O5: the Next is chosen tick, true only
        var cmC = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), irCh = cmC.initiative && typeof cmC.initiative === 'object' && !Array.isArray(cmC.initiative) ? cmC.initiative : (cmC.initiative = {});
        if (t.checked === true) irCh.chosen = true; else { delete irCh.chosen; if (!Object.keys(irCh).length) delete cmC.initiative; }
        markDirty(); patchErrors();
    }
    return true;
}
// [sinkcheck:initbox-end]
// 126, point budgets in the System editor (the owner, by prompt: "A budget you define"; what a breach does and when it is watched, "per system
// dictation"): the Lists tab's Point budgets box. A budget a line: its name, the two formulas, what happens when a player's own change would
// take their character over, and when it is watched. A new budget refuses, always. Every text lands as a value or a text node. Save cleans
// them; refreshErrors says what it would drop
// [systemcheck:budgetbox-start]
var BUDGET_OVER_OPTS = [['refuse', 'Refuse a change that goes over'], ['warn', 'Warn, and let it through'], ['off', 'Only show it']], BUDGET_WHEN_OPTS = [['always', 'Always'], ['making', 'While a character is made'], ['play', 'In play']];
// [systemcheck:envbox-start]
// 1.6.0, the map environment: the Environment readings box (the Lists tab, under the point budgets). A reading a row: its key, its name, the number
// field the host writes it into, the toggle kept on while it applies, a temperature (stored in degrees Celsius) or another reading with its unit,
// and the four bands, each a formula of the character's names in the reading's own unit. What Save drops is said under it (refreshErrors)
var ENV_KIND_OPTS = [['temp', 'A temperature, in \u00b0C'], ['other', 'Another reading']], ENV_BAND_CAPS = { warnLow: ['Warn below', 'Amber below this: a formula, such as 10'], dangerLow: ['Danger below', 'Red below this: a formula, such as -18'], warnHigh: ['Warn above', 'Amber above this: a formula, such as 32'], dangerHigh: ['Danger above', 'Red above this: a formula, such as 43'] };
function envDraft() { return Array.isArray(draft.env) ? draft.env : (draft.env = []); }
function envFieldOpts(kind, none) { var o = [['', none]]; (Array.isArray(draft.fields) ? draft.fields : []).forEach(function(f) { if (f && f.kind === kind && typeof f.id === 'string') o.push([f.id, f.label || f.key || f.id]); }); return o; }
function renderEnv() {
    var box = ui('sysEnv'); if (!box) return; box.textContent = '';
    var arr = Array.isArray(draft.env) ? draft.env : [], wrap = el('div', 'sys-budgets sys-env');
    wrap.appendChild(el('div', 'sys-light-head', 'Environment readings'));
    wrap.appendChild(el('div', 'sys-note', 'A reading is a value a map gives its characters where their token stands, such as a temperature. You paint it on a map with the Environment tool. Waypoint writes it into the number field you pick, and keeps the toggle you pick on while it applies. Its bands are figures of the character: the figure turns amber past a warning band and red past a danger band, and so does a badge on the token of a character a player plays. Give that field a minimum and maximum wide enough for every reading.'));
    arr.forEach(function(e0, i) {
        var e = e0 && typeof e0 === 'object' ? e0 : {}, rw = el('div', 'sys-flags sys-env-row'); rw.dataset.ei = String(i);
        var cap = function(t, x) { var l = el('label', 'sys-combat-item sys-bud-f'); l.appendChild(el('span', 'sys-num-cap', t)); l.appendChild(x); rw.appendChild(l); };   // every box of the row says what it is
        var k = input('sys-env-key field', typeof e.key === 'string' ? e.key : '', 'Its key: a letter, then letters, digits or _', 'temp'); k.maxLength = 24; cap('Key', k);
        var n = input('sys-env-label field', typeof e.label === 'string' ? e.label : '', 'Its name, as a player reads it', 'Temperature'); n.maxLength = LIMITS.label; cap('Name', n);
        rw.appendChild(labeledSelect('sys-env-field field', 'Written into', envFieldOpts('number', 'Pick a number field'), typeof e.field === 'string' ? e.field : '', 'The number field the reading is written into'));
        rw.appendChild(labeledSelect('sys-env-placed field', 'On while it applies', envFieldOpts('toggle', 'None'), typeof e.placed === 'string' ? e.placed : '', 'A toggle kept on while the reading applies where the token stands, and off with no reading'));
        var temp = e.unit === 'temp'; rw.appendChild(labeledSelect('sys-env-kind field', 'Kind', ENV_KIND_OPTS, temp ? 'temp' : 'other', 'A temperature is typed in each viewer\u2019s \u00b0F or \u00b0C and stored in \u00b0C'));
        if (!temp) { var u = input('sys-env-unit field', typeof e.unit === 'string' ? e.unit : '', 'Its unit, shown after the figure', 'Unit: g'); u.maxLength = 12; rw.appendChild(u); }
        ENV_BANDS_UI.forEach(function(b) { var l = el('label', 'sys-combat-item sys-bud-f'); l.appendChild(el('span', 'sys-num-cap', ENV_BAND_CAPS[b][0])); var fi = input('sys-env-band field', typeof e[b] === 'string' ? e[b] : '', ENV_BAND_CAPS[b][1], 'None'); fi.dataset.band = b; fi.maxLength = LIMITS.formula; l.appendChild(fi); rw.appendChild(l); });
        [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'ev' + bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
        wrap.appendChild(rw);
    });
    var ad = el('button', 'tool ghost sys-btn sys-env-add', '+ Reading'); ad.dataset.act = 'evadd'; ad.disabled = arr.length >= LIMITS.env; ad.title = ad.disabled ? 'At most ' + LIMITS.env : 'A reading a map gives its characters, such as a temperature'; wrap.appendChild(ad);
    var err = errorCell('env'); err.dataset.errFor = 'env'; wrap.appendChild(err);
    box.appendChild(wrap);
}
var ENV_BANDS_UI = ['warnLow', 'dangerLow', 'warnHigh', 'dangerHigh'];
function envRowOf(t) { var rw = t.closest('.sys-env-row'), i = rw ? +rw.dataset.ei : -1, arr = envDraft(); return arr[i] && typeof arr[i] === 'object' ? arr[i] : null; }
function onEnvInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-env-') < 0) return false;
    var e = envRowOf(t); if (!e) return true;
    if (c.indexOf('sys-env-key') >= 0) e.key = t.value.slice(0, 24);
    else if (c.indexOf('sys-env-label') >= 0) e.label = t.value.slice(0, LIMITS.label);
    else if (c.indexOf('sys-env-unit') >= 0) e.unit = t.value.slice(0, 12);
    else if (c.indexOf('sys-env-band') >= 0 && ENV_BANDS_UI.indexOf(t.dataset.band) >= 0) { if (t.value.trim()) e[t.dataset.band] = t.value.slice(0, LIMITS.formula); else delete e[t.dataset.band]; }
    else return true;
    markDirty(); patchErrors(); return true;
}
function onEnvChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-env-') < 0) return false;
    var e = envRowOf(t); if (!e) return true;
    if (c.indexOf('sys-env-field') >= 0) { if (t.value) e.field = t.value; else delete e.field; }
    else if (c.indexOf('sys-env-placed') >= 0) { if (t.value) e.placed = t.value; else delete e.placed; }
    else if (c.indexOf('sys-env-kind') >= 0) { e.unit = t.value === 'temp' ? 'temp' : ''; markDirty(); renderEnv(); patchErrors(); return true; }
    else return true;
    markDirty(); patchErrors(); return true;
}
function envClick(b) {
    var m = /^ev(add|up|down|del)$/.exec(b.dataset.act || ''); if (!m) return false;
    var arr = envDraft(), rw = b.closest('.sys-env-row'), i = rw ? +rw.dataset.ei : -1;
    if (m[1] === 'add') { if (arr.length >= LIMITS.env) { toast('At most ' + LIMITS.env + '.'); return true; } arr.push({ key: '', label: '', unit: 'temp' }); }
    else if (!(i >= 0 && i < arr.length && Math.floor(i) === i)) return true;
    else if (m[1] === 'up') { if (i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]); }
    else if (m[1] === 'down') { if (i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]); }
    else arr.splice(i, 1);
    markDirty(); renderEnv(); patchErrors(); return true;
}
function envSays(env, fields, F0, gmNames) {   // what Save does with each reading, as cleanEnv reads it: { errs, warns }
    var errs = [], warns = [], kinds = {}, seen = {}, seenF = {}, KEY = /^[A-Za-z][A-Za-z0-9_]{0,23}$/, lab = function(id) { var f = (fields || []).find(function(x) { return x && x.id === id; }); return f ? (f.label || f.key || id) : id; };
    (Array.isArray(fields) ? fields : []).forEach(function(f) { if (f && typeof f.id === 'string') kinds[f.id] = f.kind; });
    var CAP = { warnLow: 'Warn below', dangerLow: 'Danger below', warnHigh: 'Warn above', dangerHigh: 'Danger above' };
    (Array.isArray(env) ? env : []).forEach(function(e, i) {
        var nm = 'Reading ' + (i + 1);
        if (i >= LIMITS.env) { if (i === LIMITS.env) errs.push({ message: 'At most ' + LIMITS.env + ' readings: Save drops the rest.' }); return; }
        if (!e || typeof e !== 'object') return;
        if (typeof e.key !== 'string' || !KEY.test(e.key)) { errs.push({ message: nm + ': its key is a letter, then up to 23 letters, digits or _. Save drops it.' }); return; }
        if (seen[e.key.toLowerCase()]) { errs.push({ message: nm + ': another reading has the key ' + e.key + '. Save drops it.' }); return; }
        if (typeof e.field !== 'string' || kinds[e.field] !== 'number') { errs.push({ message: nm + ': it needs a number field to be written into. Save drops it.' }); return; }
        if (seenF[e.field]) { errs.push({ message: nm + ': another reading is written into ' + lab(e.field) + '. Save drops it.' }); return; }
        seen[e.key.toLowerCase()] = 1; seenF[e.field] = 1;
        if (typeof e.placed === 'string' && e.placed && kinds[e.placed] !== 'toggle') errs.push({ message: nm + ': the field kept on while it applies must be a toggle. Save leaves it out.' });
        ENV_BANDS_UI.forEach(function(b) {
            var t = typeof e[b] === 'string' ? e[b].trim() : ''; if (!t) return;
            var pa = F0 ? F0.parse(t) : null, at = nm + ', ' + CAP[b] + ': ';
            if (!pa || !pa.ok) { errs.push({ message: at + (pa && pa.error && pa.error.message ? pa.error.message : 'the formula cannot be read.') + ' Save drops that band.' }); return; }
            if (pa.ast && hasDice(pa.ast.body)) { errs.push({ message: at + 'a band rolls no dice. Save drops that band.' }); return; }
            var gm = typeof gmNames === 'function' ? gmNames(Array.isArray(pa.names) ? pa.names : []) : [];
            if (gm.length) warns.push({ message: at + 'it reads ' + gm[0] + ', which players cannot read, so their own figure shows no color for this band.' });
        });
    });
    return { errs: errs, warns: warns };
}
// [systemcheck:envbox-end]
// [systemcheck:tablebox-start]
// [sinkcheck:tablebox-start]
// 1.6.0: the Tables box (the Lists tab, under the linked sheets): tables of figures a formula reads by name. A table a block: its key, its name, who reads
// it, and a grid of its rows and columns with a number box a figure. Every text a value, a word a text node. A column's key is renamed at its change,
// never at each key press, since the figures are kept under it and two columns may not share one. What Save drops is said under the box (tableSays)
var TABLE_VIS_OPTS = [['', 'Everyone'], ['gm', 'The GM alone']];
function tablesDraft() { return Array.isArray(draft.tables) ? draft.tables : (draft.tables = []); }
function tableFresh(list, word) { var has = function(k) { return list.some(function(x) { return x && typeof x.key === 'string' && x.key.toLowerCase() === k; }); }, n = list.length + 1; while (has(word + n)) n++; return word + n; }
// 1.6.3 (Fulllion's rulings of 2026-11-20: "it makes sense to have fields be required when other fields depend on them", "none isn't a good
// default substitution"): the name a new row of the Rules tab starts with, the word and the first number from the list's length up that no row's
// name holds yet, ignoring case (Mark 2, Currency 3). The name is what cards, trackers and the map show, so a row is never born nameless
function ruleName(list, word) { var has = function(t) { return (list || []).some(function(x) { return !!x && typeof x.label === 'string' && x.label.trim().toLowerCase() === t.toLowerCase(); }); }, n = (list || []).length + 1; while (has(word + ' ' + n)) n++; return word + ' ' + n; }
function tableBtn(text, act, title) { var b = el('button', 'tool ghost sys-btn', text); b.dataset.act = act; b.title = title; return b; }
// 1.6.2 (G7): the Rules tab's Result tables. A key is made once and never shown. Its own listeners
// 1.6.2 (G8): the Rules tab's Shared values. The definition is the system's, and Now is this campaign's own figure. Its own listeners
// 1.6.2 (vehicles, fold (c); the owner, by prompt: a mark lives on the map and can say it ends with the fight): the Rules tab's Marks, the marks one token
// may hold on another. A key is made once and never shown. Its own listeners
// [vehiclecheck:tagjudge-start]
// 1.6.2 (vehicles, fold (c), part two): what ends a mark by its own rules, judged on the machine that owns the campaign alone and taken off through
// net.tagsPut, so the table is told as for any change. A mark whose holder or target is no longer on its map goes. One of its effects (endFx) on for
// either token's character ends it whenever it is looked at. Out of sight (wpFog.tokSees) and Kept while (keep: the holder's names, the marked
// token as its target) are judged when the mark says: at once (every look), at the end of its holder's move (tagsMoved, from net.tokenDropped) or of
// its holder's turn (tagsTurn, from net.js turnEnded). A Kept while that cannot be worked out does not hold. Looked at each second (tagTick)
function tagKeeps(S, Fm, sys, camp, map, d, hold, tgt) {
    if (typeof d.keep !== 'string' || !d.keep) return true; if (!S || !Fm) return true;
    var ch = typeof hold.charId === 'string' && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, hold.charId) ? camp.chars[hold.charId] : { id: '', values: {} };
    var fl = typeof tokenFlags === 'function' ? tokenFlags() : {}, tc = S.tokenCtx(map, hold, fl) || {};
    var rc = S.rangeCtx(sys, map, hold, tgt, { F: Fm, elev: !!fl.elevation, posture: !!fl.posture }); if (rc) { rc.tid = tgt.id; rc.mapId = map.id; }
    var r = null; try { r = Fm.evaluate(d.keep, { vars: S.makeResolver(sys, ch, Fm, rc ? S.withRange(tc, rc) : tc) }); } catch (e) { r = null; }
    if (!r || !r.ok) return false; return r.value === true || (typeof r.value === 'number' && r.value !== 0);
}
function tagLost(S, Fm, sys, camp, map, d, hold, tgt, at) {   // at: { move, turn }; the reason it ends, or null
    if (!hold || !tgt) return 'gone';
    if (Array.isArray(d.endFx) && d.endFx.length) {
        var onOf = function(w) { var c = typeof w.charId === 'string' && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, w.charId) ? camp.chars[w.charId] : null; return c ? S.fxOnIds(sys, c, Fm) : {}; };
        var ho = onOf(hold), to = onOf(tgt); if (d.endFx.some(function(x) { return ho[x] === 1 || to[x] === 1; })) return 'effect';
    }
    if (!d.sight && !d.keep) return null;
    if (d.check === 'move' ? !at.move : d.check === 'turn' ? !at.turn : false) return null;
    var Fg = window.wpFog; if (d.sight && Fg && typeof Fg.tokSees === 'function' && !Fg.tokSees(map, camp, hold, tgt)) return 'sight';
    return tagKeeps(S, Fm, sys, camp, map, d, hold, tgt) ? null : 'keep';
}
function tagJudge(o) {   // o: { mapId, moved } after a token's move, { mapId, turn } at a token's turn's end, or none for a look at what stands
    var camp = getActiveCampaign(), sys = camp && camp.system, S = window.wpSystemCore, Fm = typeof F === 'function' ? F() : null, n = net();
    if (!sys || !Array.isArray(sys.tags) || !sys.tags.length || !S || isClient() || !canWrite() || !n || n.stream || typeof n.tagsPut !== 'function' || typeof n.tagsOf !== 'function') return 0;
    var offs = [], why = {};
    Object.keys(camp.items || {}).forEach(function(mid) {
        var map = camp.items[mid]; if (!map || map.type !== 'map' || (o && o.mapId && o.mapId !== mid)) return;
        var list = n.tagsOf(map); if (!list.length) return;
        var tk = Object.create(null); (Array.isArray(map.whiteboard) ? map.whiteboard : []).forEach(function(w) { if (w && typeof w.id === 'string' && !w.waiting) tk[w.id] = w; });
        list.forEach(function(t) {
            var d = S.tagOf(sys, t.k); if (!d) return;
            var at = { move: !!(o && o.moved === t.by), turn: !!(o && o.turn === t.by) };
            var r = null; try { r = tagLost(S, Fm, sys, camp, map, d, tk[t.by] || null, tk[t.on] || null, at); } catch (e) { r = null; }
            if (r) { offs.push({ mapId: mid, by: t.by, on: t.on, k: t.k, put: false }); why[r] = (why[r] || 0) + 1; }
        });
    });
    if (!offs.length) return 0;
    if (window.wpStepLog) window.wpStepLog('marks v1', 'ended', why);
    return n.tagsPut(offs);
}
function tagsMoved(map, tokId) { if (!map || typeof map.id !== 'string' || typeof tokId !== 'string') return 0; return tagJudge({ mapId: map.id, moved: tokId }); }
function tagsTurn(mapId, tokId) { if (typeof mapId !== 'string' || typeof tokId !== 'string') return 0; return tagJudge({ mapId: mapId, turn: tokId }); }
// [vehiclecheck:tagjudge-end]
if (typeof window !== 'undefined' && !window.__wpTagTick) window.__wpTagTick = setInterval(function() { try { tagJudge(null); } catch (e) {} }, 1000);
function renderTags() {
    var box = ui('sysTags'); if (!box) return; box.textContent = ''; var list = Array.isArray(draft.tags) ? draft.tags : null, ch = function(re) { markDirty(); if (re) renderTags(); if (typeof patchErrors === 'function') patchErrors(); }, wrap = el('div', 'sys-budgets sys-results');
    wrap.appendChild(el('div', 'sys-light-head', 'Marks')); wrap.appendChild(el('div', 'sys-note', 'A mark one token holds on another, such as a pilot hounding a craft. A change of a roll or an action puts it on its target or takes it off, and Shake off takes it off the one who rolls. Formulas read whether you hold it on the target, and whether it is held on you. It stays until one of its rules ends it or you take it off.'));
    (list || []).forEach(function(t, i) {
        var rw = el('div', 'sys-flags sys-tbl-head'), nm = input('sys-tag-label field', t.label || '', 'Its name, on the map and on cards', 'Hound'), rm = el('button', 'tool ghost sys-btn sys-tag-rm', '\u00d7');
        var fg = checkLabel('sys-tag-fight', t.fight === true, 'Ends with the fight', 'It ends once the last fight on its map is over'), tn = checkLabel('sys-tag-turn', t.turn === true, 'Ends at its holder\u2019s turn\u2019s end', 'It ends when the turn of the token that holds it ends');
        nm.addEventListener('input', function() { t.label = nm.value.slice(0, LIMITS.label); ch(); });
        [[fg, 'fight'], [tn, 'turn']].forEach(function(p) { var ip = p[0].querySelector('input'); if (ip) ip.addEventListener('change', function() { if (ip.checked) t[p[1]] = true; else delete t[p[1]]; ch(); }); });
        rm.type = 'button'; rm.title = 'Remove this mark'; rm.addEventListener('click', function() { list.splice(i, 1); if (!list.length) delete draft.tags; ch(true); });
        [nm, fg, tn, rm].forEach(function(x) { rw.appendChild(x); }); wrap.appendChild(rw);
        // part two: what else ends it
        var r2 = el('div', 'sys-flags'), sg = checkLabel('sys-tag-sight', t.sight === true, 'Ends out of sight', 'It ends when its holder no longer sees the token it is held on. Where no fog is drawn, the map\u2019s walls judge it');
        var sgI = sg.querySelector('input'); if (sgI) sgI.addEventListener('change', function() { if (sgI.checked) t.sight = true; else delete t.sight; if (!t.sight && !t.keep) delete t.check; ch(true); });
        var kl = el('label', 'sys-check'); kl.appendChild(document.createTextNode('Kept while ')); var kp = input('sys-tag-keep field', t.keep || '', 'It holds only while this is so, read for the holder with the marked token as its target. Empty: nothing of its own ends it', 'Always'); kp.maxLength = LIMITS.formula; kl.appendChild(kp);
        var kpSet = function(re) { var v = kp.value.trim(); if (v) t.keep = v.slice(0, LIMITS.formula); else delete t.keep; if (!t.sight && !t.keep) delete t.check; ch(re); };
        kp.addEventListener('input', function() { kpSet(false); }); kp.addEventListener('change', function() { kpSet(true); });
        r2.appendChild(sg); r2.appendChild(kl);
        if (t.sight || t.keep) {
            var wh = el('select', 'field sys-tag-check'); [['', 'Judged at once'], ['move', 'Judged at the end of its holder\u2019s move'], ['turn', 'Judged at the end of its holder\u2019s turn']].forEach(function(p) { var op = el('option', null, p[1]); op.value = p[0]; if ((t.check || '') === p[0]) op.selected = true; wh.appendChild(op); });
            wh.title = 'When out of sight and Kept while are read. At the end of a move or a turn, the mark goes only if the rule still fails then'; wh.addEventListener('change', function() { if (wh.value) t.check = wh.value; else delete t.check; ch(); }); r2.appendChild(wh);
        }
        wrap.appendChild(r2);
        var r3 = el('div', 'sys-flags'), fxL = Array.isArray(draft.effects) ? draft.effects.filter(function(x) { return !!x && typeof x.id === 'string'; }) : [], fxN = function(id) { var x = fxL.filter(function(y) { return y.id === id; })[0]; return x ? (x.name || x.id) : 'An effect no longer here'; };
        r3.appendChild(el('span', 'sys-num-cap', 'Ends when either token has on'));
        (Array.isArray(t.endFx) ? t.endFx : []).forEach(function(id, j) { var cp = el('button', 'tool ghost sys-btn sys-tag-fxrm', fxN(id) + ' \u00d7'); cp.type = 'button'; cp.title = 'No longer ends it'; cp.addEventListener('click', function() { t.endFx.splice(j, 1); if (!t.endFx.length) delete t.endFx; ch(true); }); r3.appendChild(cp); });
        var fxS = el('select', 'field sys-tag-fx'), fxH = el('option', null, fxL.length ? '+ An effect' : 'No effects yet'); fxH.value = ''; fxS.appendChild(fxH);
        fxL.forEach(function(x) { if ((t.endFx || []).indexOf(x.id) >= 0) return; var op = el('option', null, x.name || x.id); op.value = x.id; fxS.appendChild(op); });
        fxS.title = 'An effect that ends this mark the moment it is on for the holder or for the token it is held on'; fxS.disabled = !fxL.length || (t.endFx || []).length >= 8;
        fxS.addEventListener('change', function() { if (!fxS.value) return; t.endFx = Array.isArray(t.endFx) ? t.endFx : []; if (t.endFx.indexOf(fxS.value) < 0) t.endFx.push(fxS.value); ch(true); });
        if (window.wpTexList && typeof window.wpTexList.keys === 'function') window.wpTexList.keys(fxS);
        r3.appendChild(fxS); wrap.appendChild(r3);
    });
    var add = el('button', 'tool ghost sys-btn sys-tag-add', '+ Mark'); add.type = 'button'; add.title = 'A mark one token may hold on another'; add.addEventListener('click', function() { draft.tags = Array.isArray(draft.tags) ? draft.tags : []; if (draft.tags.length >= 12) { toast('A system holds 12 marks.'); return; } var n = 1; while (draft.tags.some(function(t) { return t && t.key === 'M' + n; })) n++; draft.tags.push({ key: 'M' + n, label: ruleName(draft.tags, 'Mark') }); ch(true); });   // 1.6.3: a new mark starts named
    wrap.appendChild(add); var errT = errorCell('tags'); errT.dataset.errFor = 'tags'; wrap.appendChild(errT); box.appendChild(wrap);   // 1.6.3: what a mark still needs, said under the box
}
// 1.6.2 (backlog 59; the owner, by prompt: "A system's tests, more than one"): the Rules tab's Tests, the kinds of roll a figure is tested with. A key is
// made once and never shown. Its own listeners. What each makes is said under it, with a figure called Skill
var TEST_SHAPES = [['under', 'Roll at or under the figure'], ['plus', 'Roll plus the figure, against a target'], ['pool', 'Roll as many dice as the figure, and count hits']];
function renderTests() {
    var box = ui('sysTests'); if (!box) return; box.textContent = ''; var list = Array.isArray(draft.tests) ? draft.tests : null, ch = function(re) { markDirty(); if (re) renderTests(); if (typeof patchErrors === 'function') patchErrors(); }, wrap = el('div', 'sys-budgets sys-tests');
    wrap.appendChild(el('div', 'sys-light-head', 'Tests')); wrap.appendChild(el('div', 'sys-note', 'The kinds of roll a figure is tested with: under a skill on 3d6 or a percentile, a d20 and a modifier against a target number, or a pool of dice counting hits. A number field picks one under Rolls by, and its card says pass or fail and by how much.'));
    (list || []).forEach(function(tt, i) {
        var rw = el('div', 'sys-flags sys-tbl-head'), nm = input('sys-test-label field', tt.label || '', 'Its name, as a field\u2019s Rolls by shows it', 'Skill test'), shp = select('sys-test-shape', TEST_SHAPES, tt.shape === 'plus' || tt.shape === 'pool' ? tt.shape : 'under', 'How the figure is tested');
        var dc = input('sys-test-dice field', tt.dice || '', tt.shape === 'pool' ? 'The kind of die in the pool, such as d6 or d10' : 'The dice rolled, such as 3d6, 1d20 or 1d100', tt.shape === 'pool' ? 'd6' : '3d6'), rm = el('button', 'tool ghost sys-btn', '\u00d7'); rm.type = 'button'; rm.title = 'Remove this test';
        var capped = function(txt, x) { var l = el('label', 'sys-check'); l.appendChild(document.createTextNode(txt + ' ')); l.appendChild(x); return l; };
        nm.addEventListener('input', function() { tt.label = nm.value.slice(0, LIMITS.label); ch(); }); shp.addEventListener('change', function() { tt.shape = shp.value; var dz = String(tt.dice || '').trim().toLowerCase(); if (shp.value === 'pool' && !/^1?d[0-9]+$/.test(dz)) tt.dice = 'd6'; else if (shp.value !== 'pool' && /^1?d[0-9]+$/.test(dz)) tt.dice = '1' + dz.replace(/^1/, '');   /* the dice follow the shape */ if (shp.value !== 'plus') delete tt.target; if (shp.value !== 'pool') { delete tt.hit; delete tt.need; } else if (!tt.hit) tt.hit = 5; ch(true); }); dc.addEventListener('input', function() { tt.dice = dc.value.slice(0, 12); ch(); });
        rm.addEventListener('click', function() { list.splice(i, 1); if (!list.length) delete draft.tests; ch(true); });
        [nm, shp, capped('Dice', dc)].forEach(function(x) { rw.appendChild(x); });
        if (tt.shape === 'plus') { var tg = input('sys-test-target field', tt.target || '', 'The number to reach, or a figure. Empty: the total alone, with no pass or fail', '15'); tg.addEventListener('input', function() { if (tg.value.trim()) tt.target = tg.value.slice(0, LIMITS.formula); else delete tt.target; ch(); }); rw.appendChild(capped('Against', tg)); }
        if (tt.shape === 'pool') { var hb = numInput('sys-test-hit', typeof tt.hit === 'number' ? tt.hit : 5, 'A die at or past this is a hit', ''), nb = numInput('sys-test-need', typeof tt.need === 'number' ? tt.need : '', 'How many hits it needs. Empty: count them', ''); hb.addEventListener('input', function() { var n = Math.floor(Number(hb.value)); if (n >= 1) tt.hit = n; ch(); }); nb.addEventListener('input', function() { var n = Math.floor(Number(nb.value)); if (nb.value !== '' && n >= 1) tt.need = n; else delete tt.need; ch(); }); rw.appendChild(capped('A hit at', hb)); rw.appendChild(capped('Hits needed', nb)); }
        rw.appendChild(rm); wrap.appendChild(rw);
        var cl = typeof cleanTests === 'function' ? cleanTests([tt]) : null, say = cl && typeof testFormula === 'function' && typeof formulaSays === 'function' ? formulaSays(draft, testFormula(cl[0], 'Skill')) : '';
        wrap.appendChild(el('div', 'sys-note', cl ? 'For a figure called Skill: ' + (say || testFormula(cl[0], 'Skill')) + '.' : 'Give it its dice, such as ' + (tt.shape === 'pool' ? 'd6' : '3d6') + '. Until then, Save drops it.'));
    });
    var add = el('button', 'tool ghost sys-btn sys-bud-add', '+ Test'); add.type = 'button'; add.title = 'A kind of roll a figure is tested with'; add.addEventListener('click', function() { draft.tests = Array.isArray(draft.tests) ? draft.tests : []; if (draft.tests.length >= 12) { toast('At most 12 tests.'); return; } var n = 1; while (draft.tests.some(function(x) { return x && x.key === 'T' + n; })) n++; draft.tests.push({ key: 'T' + n, label: '', shape: 'under', dice: '3d6' }); ch(true); var lb = box.querySelectorAll('input.sys-test-label'); if (lb.length) lb[lb.length - 1].focus(); });
    wrap.appendChild(add); box.appendChild(wrap);
}
function renderValues() {
    var box = ui('sysValues'); if (!box) return; box.textContent = ''; var list = Array.isArray(draft.values) ? draft.values : null, ch = function(re) { markDirty(); if (re) renderValues(); if (typeof patchErrors === 'function') patchErrors(); }, wrap = el('div', 'sys-budgets sys-results'), camp = getActiveCampaign();
    wrap.appendChild(el('div', 'sys-light-head', 'Shared values')); wrap.appendChild(el('div', 'sys-note', 'A number the whole table shares, such as Momentum or an alarm. Rolls and actions read it, and move it with Shared: in a change. Each campaign keeps its own figure. A tracker can show one.'));
    (list || []).forEach(function(t, i) {
        var rw = el('div', 'sys-flags sys-tbl-head'), nm = input('sys-val-label field', t.label || '', 'Its name, on cards and in formulas', 'Momentum'), num = function(cls, k, tip, ph) { var b = numInput(cls, typeof t[k] === 'number' ? t[k] : '', tip, ph); b.addEventListener('input', function() { var n = Number(b.value); if (String(b.value).trim() !== '' && isFinite(n)) t[k] = n; else delete t[k]; ch(); if (typeof nowB !== 'undefined' && nowB && document.activeElement !== nowB) nowB.value = nowOf(); }); return b; }, vis = select('sys-val-vis', [['', 'Everyone sees it'], ['gm', 'You alone see it']], t.vis === 'gm' ? 'gm' : '', 'One for you alone never reaches players, and a card that moves it is yours'), rm = el('button', 'tool ghost sys-btn', '\u00d7');
        nm.addEventListener('input', function() { t.label = nm.value.slice(0, LIMITS.label); ch(); }); vis.addEventListener('change', function() { if (vis.value) t.vis = 'gm'; else delete t.vis; ch(); }); rm.type = 'button'; rm.title = 'Remove this value'; rm.addEventListener('click', function() { list.splice(i, 1); if (!list.length) delete draft.values; ch(true); });
        var nowOf = function() { return typeof valueNow === 'function' ? valueNow({ values: cleanValues(draft.values, true) }, t.key) : ''; }, nowB = numInput('sys-val-now', nowOf(), 'What it stands at in this campaign now', 'Now'); nowB.addEventListener('change', function() { var n = Number(nowB.value), c = getActiveCampaign(), mv = {}; if (!c || !isFinite(n)) return; mv[t.key] = n; var nt = net(); if (nt && typeof nt.valuesSet === 'function') nt.valuesSet(mv); });
        var capped = function(txt, x) { var l = el('label', 'sys-check'); l.appendChild(document.createTextNode(txt + ' ')); l.appendChild(x); return l; };
        [nm, capped('Least', num('sys-val-min', 'min', 'The lowest it goes. Empty: no limit', '')), capped('Most', num('sys-val-max', 'max', 'The highest it goes. Empty: no limit', '')), capped('Starts at', num('sys-val-start', 'start', 'Where it stands in a new campaign', '0')), capped('Now', nowB), vis, rm].forEach(function(x) { rw.appendChild(x); }); wrap.appendChild(rw);
    });
    var add = el('button', 'tool ghost sys-btn sys-bud-add', '+ Shared value'); add.type = 'button'; add.title = 'A number the whole table shares'; add.addEventListener('click', function() { draft.values = Array.isArray(draft.values) ? draft.values : []; var n = 1; while (draft.values.some(function(t) { return t && t.key === 'V' + n; })) n++; draft.values.push({ key: 'V' + n, label: ruleName(draft.values, 'Shared value') }); ch(true); }); wrap.appendChild(add); var errV = errorCell('values'); errV.dataset.errFor = 'values'; wrap.appendChild(errV); box.appendChild(wrap);   // 1.6.3: a new value starts named, and an emptied name is said under the box
}
// 157 M1 (the owner, 2026-11-03): the Rules tab's Money, the currencies money is counted in. A key is made once and never shown. Its own listeners
function renderCurrencies() {
    var box = ui('sysMoney'); if (!box) return; box.textContent = ''; var list = Array.isArray(draft.currencies) ? draft.currencies : null, ch = function(re) { markDirty(); if (re) renderCurrencies(); if (typeof patchErrors === 'function') patchErrors(); }, wrap = el('div', 'sys-budgets sys-results');
    wrap.appendChild(el('div', 'sys-light-head', 'Money')); wrap.appendChild(el('div', 'sys-note', 'The currencies your game\u2019s money is counted in. A price is written in the base unit. Worth says how many of the base unit one of a currency is. A Separate currency never mixes with the rest: it is not counted in what a character holds, and never pays a price. On the Lists tab, a list that holds money says which currency it holds.'));
    (list || []).forEach(function(t, i) {
        var rw = el('div', 'sys-flags sys-tbl-head'), nm = input('sys-cur-label field', t.label || '', 'Its name, on the sheet and in the trade window', 'Crowns'), wb = numInput('sys-cur-worth', typeof t.worth === 'number' ? t.worth : 1, 'How many of the base unit one of it is worth', 'any'), sepL = checkLabel('sys-cur-sep', t.sep === true, 'Separate', 'It never mixes with the rest: it is not counted in what a character holds, and never pays a price'), rm = el('button', 'tool ghost sys-btn', '\u00d7');
        var sepI = sepL.querySelector('input'), capped = function(txt, x) { var l = el('label', 'sys-check'); l.appendChild(document.createTextNode(txt + ' ')); l.appendChild(x); return l; };
        nm.addEventListener('input', function() { t.label = nm.value.slice(0, LIMITS.label); ch(); }); wb.addEventListener('input', function() { var n = Number(wb.value); if (String(wb.value).trim() !== '' && isFinite(n) && n > 0) t.worth = n; else delete t.worth; ch(); });
        if (sepI) sepI.addEventListener('change', function() { if (sepI.checked) t.sep = true; else delete t.sep; ch(); }); rm.type = 'button'; rm.title = 'Remove this currency'; rm.addEventListener('click', function() { list.splice(i, 1); if (!list.length) delete draft.currencies; ch(true); });
        var kd = el('select', 'field sys-cur-kind'); [['', 'Not said'], ['physical', 'Physical'], ['digital', 'Digital']].forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if ((t.kind || '') === o[0]) op.selected = true; kd.appendChild(op); }); kd.title = 'Physical money has a weight. Digital money weighs nothing, and may need a device to pay or be paid in it';   // 157 M1k
        kd.addEventListener('change', function() { if (kd.value) t.kind = kd.value; else delete t.kind; if (t.kind !== 'physical') delete t.weight; if (t.kind !== 'digital') delete t.device; ch(true); }); if (window.wpTexList && typeof window.wpTexList.keys === 'function') window.wpTexList.keys(kd);   // a key step opens the list, since a pick draws the row again
        var kdExtra = null;
        if (t.kind === 'physical') { var wg = numInput('sys-cur-weight', typeof t.weight === 'number' ? t.weight : '', 'What one of it weighs, in your game\u2019s own unit. Formulas read the whole as Money.weight', 'any'); wg.addEventListener('input', function() { var n = Number(wg.value); if (String(wg.value).trim() !== '' && isFinite(n) && n > 0) t.weight = n; else delete t.weight; ch(); }); kdExtra = capped('Weight of one', wg); }
        else if (t.kind === 'digital') {   // picked by its name, from the system's items and the library's entries, never typed
            var dvO = typeof grantEntries === 'function' ? grantEntries() : [], dvS = el('select', 'field sys-cur-device'), dvHas = !t.device;
            [['', 'Needs nothing']].concat(dvO).forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if ((t.device || '') === o[0]) { op.selected = true; dvHas = true; } dvS.appendChild(op); });
            if (!dvHas) { var dvOld = el('option', null, t.deviceName || 'An entry no longer here'); dvOld.value = t.device; dvOld.selected = true; dvS.appendChild(dvOld); }
            dvS.title = 'Only a character carrying this entry can pay or be paid in it'; dvS.addEventListener('change', function() { var pk = dvS.options[dvS.selectedIndex]; if (dvS.value) { t.device = dvS.value; t.deviceName = pk ? String(pk.text).replace(/ \(GM only\)$/, '').slice(0, 120) : ''; } else { delete t.device; delete t.deviceName; } ch(); });
            kdExtra = capped('Device', dvS);
        }
        [nm, capped('Worth', wb), sepL, kd].concat(kdExtra ? [kdExtra] : []).concat([rm]).forEach(function(x) { rw.appendChild(x); }); wrap.appendChild(rw);
    });
    var trL = el('label', 'sys-check sys-trade-rates'), trI = el('input'); trI.type = 'checkbox'; trI.checked = !!(draft.trading && draft.trading.rates === true); trL.title = 'A trader sets a Buys at and a Sells at per cent of list price in the trade window, and an entry\u2019s own Buy and Sell figures come first. Off: everything is worth its list price';
    trI.addEventListener('change', function() { if (trI.checked) draft.trading = Object.assign({}, draft.trading || {}, { rates: true }); else if (draft.trading) { delete draft.trading.rates; if (!Object.keys(draft.trading).length) delete draft.trading; } ch(); }); trL.appendChild(trI); trL.appendChild(document.createTextNode(' Traders set buy and sell prices'));   // 157 M1c
    var chL = el('label', 'sys-check sys-trade-change'), chI = el('input'); chI.type = 'checkbox'; chI.checked = !!(draft.trading && draft.trading.change === true); chL.title = 'Where a side pays more than it gets, the trade window says the change owed, or that the other side cannot give it from what it holds, and the payer may overpay. Off: change is never judged';
    chI.addEventListener('change', function() { if (chI.checked) draft.trading = Object.assign({}, draft.trading || {}, { change: true }); else if (draft.trading) { delete draft.trading.change; if (!Object.keys(draft.trading).length) delete draft.trading; } ch(); }); chL.appendChild(chI); chL.appendChild(document.createTextNode(' Traders make change'));   // 157 M1d
    var add = el('button', 'tool ghost sys-btn sys-bud-add', '+ Currency'); add.type = 'button'; add.title = 'A currency your game counts money in'; add.disabled = !!list && list.length >= CUR_MAX; add.addEventListener('click', function() { draft.currencies = Array.isArray(draft.currencies) ? draft.currencies : []; var n = 1; while (draft.currencies.some(function(t) { return t && t.key === 'C' + n; })) n++; draft.currencies.push({ key: 'C' + n, label: ruleName(draft.currencies, 'Currency'), worth: 1 }); ch(true); }); /* 1.6.3: a new currency starts named */ var xcL = el('label', 'sys-check sys-trade-xch'), xcI = el('input'); xcI.type = 'checkbox'; xcI.checked = !!(draft.trading && draft.trading.exchange === true); xcL.title = 'A trader sets what it takes each currency at, a per cent of its worth, beside the currencies it accepts in the trade window. A Separate currency may then be taken in place of money. Off: every currency at its worth';
    xcI.addEventListener('change', function() { if (xcI.checked) draft.trading = Object.assign({}, draft.trading || {}, { exchange: true }); else if (draft.trading) { delete draft.trading.exchange; if (!Object.keys(draft.trading).length) delete draft.trading; } ch(); }); xcL.appendChild(xcI); xcL.appendChild(document.createTextNode(' Traders set exchange rates'));   // 157 M1e
    wrap.appendChild(add); wrap.appendChild(trL); wrap.appendChild(chL); wrap.appendChild(xcL);
    var hgD = draft.trading && draft.trading.haggle && typeof draft.trading.haggle === 'object' ? draft.trading.haggle : null, hgRolls = (Array.isArray(draft.rolls) ? draft.rolls : []).filter(function(r) { return r && typeof r === 'object' && typeof r.id === 'string' && typeof r.formula === 'string' && !Array.isArray(r.apply) && r.init !== true; });   // 157 M1i: haggling
    var hgL = el('label', 'sys-check sys-trade-hag'), hgI = el('input'); hgI.type = 'checkbox'; hgI.checked = !!hgD; hgL.title = 'In the trade window either side may press Haggle once: both roll the roll you pick, and the difference in how well they did moves the prices. Both confirm again after'; hgL.appendChild(hgI); hgL.appendChild(document.createTextNode(' Traders haggle'));
    hgI.disabled = !hgD && !hgRolls.length; if (hgI.disabled) hgL.title = 'Add a roll on the Rolls tab first, the one both sides make to haggle';
    hgI.addEventListener('change', function() { if (hgI.checked && hgRolls.length) draft.trading = Object.assign({}, draft.trading || {}, { haggle: { roll: hgRolls[0].id, step: 1, most: 20 } }); else if (draft.trading) { delete draft.trading.haggle; if (!Object.keys(draft.trading).length) delete draft.trading; } ch(true); });
    wrap.appendChild(hgL);
    var htL = el('label', 'sys-check sys-trade-hot'), htI = el('input'); htI.type = 'checkbox'; htI.checked = !!(draft.trading && draft.trading.hot === true); htL.title = 'The GM may mark a row Stolen or Illegal in its details, or a list names a stat that says so. A trader not ticked Fence in the trade window refuses it, and a fence buys it at its own per cent'; htL.appendChild(htI); htL.appendChild(document.createTextNode(' Stolen and illegal goods'));   // 157 M1j
    htI.addEventListener('change', function() { if (htI.checked) draft.trading = Object.assign({}, draft.trading || {}, { hot: true }); else if (draft.trading) { delete draft.trading.hot; if (!Object.keys(draft.trading).length) delete draft.trading; } ch(); }); wrap.appendChild(htL);
    if (hgD) {
        var hgW = el('div', 'sys-flags'), hgS = el('select', 'field sys-trade-hagroll'), hgSt = numInput('sys-trade-hagstep', typeof hgD.step === 'number' ? hgD.step : 1, 'How many per cent each point of difference moves the prices', 'any'), hgM = numInput('sys-trade-hagmost', typeof hgD.most === 'number' ? hgD.most : 20, 'The most the prices may move either way, as a per cent', 'any');
        hgRolls.forEach(function(r) { var o = el('option', null, r.label || 'A roll'); o.value = r.id; if (r.id === hgD.roll) o.selected = true; hgS.appendChild(o); }); hgS.title = 'The roll both sides make. A merchant may be given a figure to haggle at in the trade window';
        hgS.addEventListener('change', function() { hgD.roll = hgS.value; ch(); }); hgSt.addEventListener('input', function() { var n = Number(hgSt.value); if (isFinite(n) && n > 0) hgD.step = n; ch(); }); hgM.addEventListener('input', function() { var n = Number(hgM.value); if (isFinite(n) && n > 0) hgD.most = n; ch(); });
        var cap = function(txt, x, after) { var l = el('label', 'sys-check'); l.appendChild(document.createTextNode(txt + ' ')); l.appendChild(x); if (after) l.appendChild(document.createTextNode(' ' + after)); return l; };
        [cap('Haggle roll', hgS), cap('Each point moves', hgSt, '%'), cap('At most', hgM, '%')].forEach(function(x) { hgW.appendChild(x); }); hgW.classList.add('sys-trade-hagrow'); if (htL.parentNode === wrap) wrap.insertBefore(hgW, htL); else wrap.appendChild(hgW);   // the viewing of 2026-11-09: under its own tick, with a name
    }
    var errM = errorCell('money'); errM.dataset.errFor = 'money'; wrap.appendChild(errM);   // 1.6.3: a currency's name it still needs, said under the box
    box.appendChild(wrap);
}
// 1.6.2 (G9): the Rules tab's Decks, one editor for a system's and a campaign's
function renderDecks() {
    var box0 = ui('sysDecks'), DU = window.wpDeckUi; if (!box0 || !DU) return; var part = function(cls) { var b = box0.querySelector('.' + cls); if (!b) { b = document.createElement('div'); b.className = cls; box0.appendChild(b); } return b; }, box = part('sys-deck-ed');   // 1.6.2 (backlog 223): the decks, then the spreads drawn from them
    DU.edit(box, { head: 'Decks and bags', note: 'A set of things you draw from: cards or tokens. Rolls and actions draw from one with Draw from: in a change, and a formula can read what is left. Each campaign keeps its own pile.', list: function() { return Array.isArray(draft.decks) ? draft.decks : null; }, set: function(l) { if (l && l.length) draft.decks = l; else delete draft.decks; }, prefix: 'D', changed: function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); renderSpreads(); } });
    function renderSpreads() { if (!DU.spreads) return; DU.spreads(part('sys-spread-ed'), { head: 'Spreads', note: 'A few places laid out in one press, each drawn from one of these decks, such as Who, Wants and Stands in the way. The GM draws them in the Decks window, turns and redraws, and shows the table when ready. Players never see a spread until it is shown.', prefix: 'S', list: function() { return Array.isArray(draft.spreads) ? draft.spreads : null; }, set: function(l) { if (l && l.length) draft.spreads = l; else delete draft.spreads; }, decks: function() { return (Array.isArray(draft.decks) ? draft.decks : []).filter(function(d) { return !!d && typeof d.key === 'string'; }).map(function(d) { return [d.key, d.label || 'A deck']; }); }, changed: function() { markDirty(); } }); }
    renderSpreads();
}
// 1.6.2 (G7): the categories a random add may draw from, of the system's items and the library's entries, and the list such a row starts on: the first whose categories take it, else the first item list
function resultCats() { var seen = Object.create(null), out = [], put = function(e) { var c = e && typeof e.category === 'string' ? e.category.trim() : ''; if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; out.push(c); } }, LBc = window.wpLibrary, cp = getActiveCampaign(); (draft.items || []).forEach(put); if (LBc && typeof LBc.entriesOf === 'function') (cp && cp.library && Array.isArray(cp.library.packs) ? cp.library.packs : []).forEach(function(p) { if (p && typeof p.id === 'string') LBc.entriesOf(p.id).forEach(put); }); return out.sort(function(a, b) { return a.localeCompare(b); }).slice(0, 200); }
function resultListFor(cat) { var lists = (draft.fields || []).filter(function(f) { return f && f.kind === 'item-list'; }), cg = String(cat).toLowerCase(), hit = lists.filter(function(f) { return f.list && Array.isArray(f.list.cats) && f.list.cats.some(function(x) { return String(x).toLowerCase() === cg; }); })[0]; return (hit || lists[0] || {}).id || ''; }
function renderResults() {
    var box = ui('sysResults'); if (!box) return; box.textContent = ''; var list = Array.isArray(draft.results) ? draft.results : null, ch = function(re) { markDirty(); if (re) renderResults(); if (typeof patchErrors === 'function') patchErrors(); }, wrap = el('div', 'sys-budgets sys-results');
    wrap.appendChild(el('div', 'sys-light-head', 'Result tables')); wrap.appendChild(el('div', 'sys-note', 'A table of ranges and words. A roll\u2019s Then or an action can roll on one, and the card shows the words. Pick Roll on: in its change.'));
    var fxO = [['', 'No effect']].concat((Array.isArray(draft.effects) ? draft.effects : []).filter(function(d) { return !!d && typeof d.id === 'string'; }).map(function(d) { return [d.id, 'Switches on: ' + (d.name || 'An effect')]; }));
    (list || []).forEach(function(t, i) {
        var blk = el('div', 'sys-tbl'), head = el('div', 'sys-flags sys-tbl-head'), nm = input('sys-res-label field', t.label || '', 'Its name, shown on the card', 'Wild magic'), dc = input('sys-res-dice field', t.dice || '', 'What rolls on it', '1d20'), vis = select('sys-res-vis', [['', 'Everyone sees its words'], ['gm', 'You alone see its words']], t.vis === 'gm' ? 'gm' : '', 'A table for you alone never reaches players, and a card that reads it is yours'), rm = el('button', 'tool ghost sys-btn', '\u00d7');
        nm.addEventListener('input', function() { t.label = nm.value.slice(0, LIMITS.label); ch(); }); dc.addEventListener('input', function() { t.dice = dc.value.slice(0, LIMITS.formula); ch(); }); vis.addEventListener('change', function() { if (vis.value) t.vis = 'gm'; else delete t.vis; ch(); });
        rm.type = 'button'; rm.title = 'Remove this table'; rm.addEventListener('click', function() { list.splice(i, 1); if (!list.length) delete draft.results; ch(true); }); [nm, dc, vis, rm].forEach(function(x) { head.appendChild(x); }); blk.appendChild(head);
        var nxO = [['', 'It ends there']].concat(list.filter(function(o) { return o !== t && typeof o.key === 'string'; }).map(function(o) { return [o.key, 'Then rolls on: ' + (o.label || 'A table')]; }));
        (Array.isArray(t.rows) ? t.rows : []).forEach(function(r, ri) {
            var rw = el('div', 'sys-flags sys-res-row'), lo = numInput('sys-res-lo', typeof r.lo === 'number' ? r.lo : '', 'The lowest roll this row takes', 'From'), hi = numInput('sys-res-hi', typeof r.hi === 'number' ? r.hi : '', 'The highest roll this row takes', 'To'), wd = input('sys-res-words field', r.words || '', 'What the card says', 'What happens'), fx = select('sys-res-fx', fxO, r.fx || '', 'An effect this row switches on'), nx = select('sys-res-next', nxO, r.next || '', 'Another table it goes on to, three deep at most'), x = el('button', 'tool ghost sys-btn', '\u00d7'), nb = function(k, b) { b.addEventListener('input', function() { var n = Math.floor(Number(b.value)); if (String(b.value).trim() !== '' && isFinite(n)) r[k] = n; else delete r[k]; ch(); }); };
            nb('lo', lo); nb('hi', hi); wd.addEventListener('input', function() { var v = wd.value; if (v.trim()) r.words = v.slice(0, LIMITS.noteText); else delete r.words; ch(); }); fx.addEventListener('change', function() { if (fx.value) r.fx = fx.value; else delete r.fx; ch(); }); nx.addEventListener('change', function() { if (nx.value) r.next = nx.value; else delete r.next; ch(); });
            var adCats = resultCats(), adE = r.add && typeof r.add.entry === 'string' ? r.add.entry : r.add && typeof r.add.cat === 'string' ? 'cat:' + r.add.cat : '', adO = [['', 'Adds nothing']].concat(adCats.map(function(c) { return ['cat:' + c, 'Adds a random ' + c]; })).concat(grantEntries().map(function(o) { return [o[0], 'Adds ' + o[1]]; })); if (adE && !adO.some(function(o) { return o[0] === adE; })) adO.push([adE, adE.slice(0, 4) === 'cat:' ? 'Adds a random ' + adE.slice(4) : 'Adds an entry that is not here']);   // 1.6.2 (G7): a random entry of a category, or an entry by name, of the system or the library, as the grants box lists them
            var ad2 = el('span', 'sys-res-addbox'), adS = select('sys-res-add', adO, adE, 'An entry this row adds to a list, as a row of the list\u2019s own'); ad2.appendChild(adS);
            adS.addEventListener('change', function() { var v = adS.value; if (!v) delete r.add; else if (v.slice(0, 4) === 'cat:') r.add = { list: r.add && r.add.list ? r.add.list : resultListFor(v.slice(4)), cat: v.slice(4) }; else r.add = { list: r.add && r.add.entry === v ? r.add.list : grantListFor(v), entry: v }; ch(true); });
            if (adE && r.add) { var adLs = (draft.fields || []).filter(function(f) { return !!f && f.kind === 'item-list' && typeof f.id === 'string'; }).map(function(f) { return [f.id, 'To ' + (f.label || 'a list')]; }); if (!adLs.some(function(o) { return o[0] === r.add.list; })) adLs.push([r.add.list, 'To a list that is gone']); var adL = select('sys-res-addlist', adLs, r.add.list, 'The list it is added to'); adL.addEventListener('change', function() { r.add.list = adL.value; ch(true); }); ad2.appendChild(adL);
                if (typeof r.add.cat === 'string') {   // narrowed by one number stat of that list: at most and at least
                    var nf = (draft.fields || []).filter(function(f) { return !!f && f.id === r.add.list && f.list; })[0], nst = nf && Array.isArray(nf.list.stats) ? nf.list.stats.filter(function(s) { return s && typeof s.key === 'string' && s.kind !== 'pick' && !s.set; }) : [];
                    var nS = select('sys-res-addstat', [['', 'Any of them']].concat(nst.map(function(s) { return [s.key, 'Where ' + (s.label || s.key)]; })), r.add.stat || '', 'Narrow the draw by one of the list\u2019s number stats, such as a price or a rarity'); nS.addEventListener('change', function() { if (nS.value) r.add.stat = nS.value; else { delete r.add.stat; delete r.add.most; delete r.add.least; } ch(true); }); ad2.appendChild(nS);
                    if (r.add.stat) { [['least', 'is at least', 'sys-res-addleast'], ['most', 'is at most', 'sys-res-addmost']].forEach(function(q) { var bl = numField(q[2], typeof r.add[q[0]] === 'number' ? r.add[q[0]] : '', 'The draw takes only an entry whose figure ' + q[1] + ' this. Empty: no bound', q[0] === 'least' ? 'At least' : 'At most', 'any'), b = bl.querySelector('input'); b.addEventListener('input', function() { var n = b.value.trim() === '' ? NaN : Number(b.value); if (isFinite(n)) r.add[q[0]] = n; else delete r.add[q[0]]; ch(); }); ad2.appendChild(bl); }); }
                }
            }
            x.type = 'button'; x.title = 'Remove this row'; x.addEventListener('click', function() { t.rows.splice(ri, 1); ch(true); }); [lo, hi, wd, fx, ad2, nx, x].forEach(function(q) { rw.appendChild(q); }); blk.appendChild(rw);
        });
        var ad = el('button', 'tool ghost sys-btn', '+ Row'); ad.type = 'button'; ad.title = 'A range of the roll and what it says'; ad.addEventListener('click', function() { t.rows = Array.isArray(t.rows) ? t.rows : []; var last = t.rows[t.rows.length - 1], s = last && typeof last.hi === 'number' ? last.hi + 1 : 1; t.rows.push({ lo: s, hi: s }); ch(true); }); blk.appendChild(ad); wrap.appendChild(blk);
    });
    var add = el('button', 'tool ghost sys-btn sys-bud-add', '+ Result table'); add.type = 'button'; add.title = 'A table a roll can land on'; add.addEventListener('click', function() { draft.results = Array.isArray(draft.results) ? draft.results : []; var n = 1; while (draft.results.some(function(t) { return t && t.key === 'R' + n; })) n++; draft.results.push({ key: 'R' + n, label: ruleName(draft.results, 'Result table'), dice: '1d6', rows: [{ lo: 1, hi: 1 }] }); ch(true); }); wrap.appendChild(add); var errR = errorCell('results'); errR.dataset.errFor = 'results'; wrap.appendChild(errR); box.appendChild(wrap);   // 1.6.3: a new table starts named with its dice and a row, and what a table or a row still needs is said under the box
}
function renderTables() {
    var box = ui('sysTables'); if (!box) return; box.textContent = '';
    var arr = Array.isArray(draft.tables) ? draft.tables : [], wrap = el('div', 'sys-budgets sys-tables');
    wrap.appendChild(el('div', 'sys-light-head', 'Tables'));
    wrap.appendChild(el('div', 'sys-note', 'A table holds figures a rule reads by name, such as a metal\u2019s density and price. A rule can read one figure, or find the row by what a row of a list has picked, so one rule serves every metal. A row or a column that is not there reads 0.'));
    arr.forEach(function(t0, i) {
        var t = t0 && typeof t0 === 'object' ? t0 : {}, blk = el('div', 'sys-tbl'), head = el('div', 'sys-flags sys-tbl-head'), cols = Array.isArray(t.cols) ? t.cols : [], rows = Array.isArray(t.rows) ? t.rows : [];
        blk.dataset.ti = String(i);
        var cap = function(txt, x) { var l = el('label', 'sys-combat-item sys-bud-f'); l.appendChild(el('span', 'sys-num-cap', txt)); l.appendChild(x); head.appendChild(l); };
        var k = input('sys-tbl-key field', typeof t.key === 'string' ? t.key : '', 'The table\u2019s key in a formula: a letter, then letters, digits or _', 'Metal'); k.maxLength = 24; cap('Key', k);
        var n = input('sys-tbl-label field', typeof t.label === 'string' ? t.label : '', 'Its name in this box', 'Metals'); n.maxLength = LIMITS.label; cap('Name', n);
        head.appendChild(labeledSelect('sys-tbl-vis field', 'Who reads it', TABLE_VIS_OPTS, t.vis === 'gm' ? 'gm' : '', 'A table for the GM alone never reaches players, and a formula that reads it is GM only too'));
        [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove this table']].forEach(function(bd) { var tbB = tableBtn(bd[1], 'table' + bd[0], bd[2]); (typeof segPut === 'function' ? segPut(head, tbB) : head.appendChild(tbB)); });
        blk.appendChild(head);
        var sc = el('div', 'sys-tbl-scroll'), grid = el('table', 'sys-tbl-grid'), hr = el('tr');
        hr.appendChild(el('th', null, 'Row key')); hr.appendChild(el('th', null, 'Row name')); hr.appendChild(el('th', null, 'From')); hr.appendChild(el('th', null, 'To'));   // 1.6.2 (G7): a range a figure finds the row by
        cols.forEach(function(c0, ci) {
            var c = c0 && typeof c0 === 'object' ? c0 : {}, th = el('th'), ck = input('sys-tbl-ckey field', typeof c.key === 'string' ? c.key : '', 'The column\u2019s key in a formula: a letter, then letters, digits or _', 'density'), cl = input('sys-tbl-clabel field', typeof c.label === 'string' ? c.label : '', 'Its name in this box', 'Name'), cd = tableBtn('\u00d7', 'tablecoldel', 'Remove this column');
            ck.maxLength = 24; cl.maxLength = LIMITS.label; if ((!c.label || String(c.label).toLowerCase() === ck.value.toLowerCase()) && /^(value|col[0-9]+)$/.test(ck.value)) ck.dataset.follow = '1'; ck.dataset.ci = String(ci); cl.dataset.ci = String(ci); cd.dataset.ci = String(ci);
            th.appendChild(ck); th.appendChild(cl); th.appendChild(cd); hr.appendChild(th);
        });
        grid.appendChild(hr);
        rows.forEach(function(r0, ri) {
            var r = r0 && typeof r0 === 'object' ? r0 : {}, tr = el('tr'), vals = r.vals && typeof r.vals === 'object' ? r.vals : {};
            var cell = function(x) { var td = el('td'); td.appendChild(x); tr.appendChild(td); return td; };
            var rk = input('sys-tbl-rkey field', typeof r.key === 'string' ? r.key : '', 'The row\u2019s key: a letter, then letters, digits or _. A formula finds it by this key, or by its name', 'Steel'), rl = input('sys-tbl-rlabel field', typeof r.label === 'string' ? r.label : '', 'Its name: a choice that says this name finds the row too', 'Name');
            rk.maxLength = 40; rl.maxLength = LIMITS.label; if (!r.label && /^row[0-9]+$/.test(rk.value)) rk.dataset.follow = '1'; rk.dataset.ri = String(ri); rl.dataset.ri = String(ri); cell(rk); cell(rl);   // 1.6.2 (found building a system by hand): a new column's or row's stand-in short name follows the name you give it, as a new table's does
            var rlo = numInput('sys-tbl-lo field', typeof r.lo === 'number' ? r.lo : '', 'The lowest figure that finds this row. Empty: a figure never finds it', 'any'), rhi = numInput('sys-tbl-hi field', typeof r.hi === 'number' ? r.hi : '', 'The highest figure that finds this row. Empty: From alone', 'any'); rlo.dataset.ri = String(ri); rhi.dataset.ri = String(ri); cell(rlo); cell(rhi);
            cols.forEach(function(c0, ci) { var ky = c0 && typeof c0.key === 'string' ? c0.key : '', has = Object.prototype.hasOwnProperty.call(vals, ky) && typeof vals[ky] === 'number', vi = numInput('sys-tbl-val field', has ? vals[ky] : '', 'A figure: empty reads 0', 'any'); vi.dataset.ri = String(ri); vi.dataset.ci = String(ci); cell(vi); });
            var rd = tableBtn('\u00d7', 'tablerowdel', 'Remove this row'); rd.dataset.ri = String(ri); cell(rd); grid.appendChild(tr);
        });
        sc.appendChild(grid); blk.appendChild(sc);
        var more = el('div', 'sys-flags'), ac = tableBtn('+ Column', 'tablecoladd', cols.length >= LIMITS.tableCols ? 'At most ' + LIMITS.tableCols : 'A column of figures'), ar = tableBtn('+ Row', 'tablerowadd', rows.length >= LIMITS.tableRows ? 'At most ' + LIMITS.tableRows : 'A row of figures');
        ac.disabled = cols.length >= LIMITS.tableCols; ar.disabled = rows.length >= LIMITS.tableRows; more.appendChild(ac); more.appendChild(ar); blk.appendChild(more);
        wrap.appendChild(blk);
    });
    var ad = tableBtn('+ Table', 'tableadd', arr.length >= LIMITS.tables ? 'At most ' + LIMITS.tables : 'A table of figures a formula reads by name'); ad.className += ' sys-tbl-add'; ad.disabled = arr.length >= LIMITS.tables; wrap.appendChild(ad);
    var csvB = tableBtn('Import from a spreadsheet\u2026', 'tablecsv', 'Fill a table from a CSV file: its first row names the columns and its first column names the rows. You see it before anything changes'); csvB.className += ' sys-tbl-csv'; wrap.appendChild(csvB);   // 1.6.3: tableClick hands its press to the tablecsv slice
    if (typeof tableCsvDraw === 'function') tableCsvDraw(wrap);   // 1.6.3: a file read and waiting for Import, shown under the box
    var err = errorCell('tables'); err.dataset.errFor = 'tables'; wrap.appendChild(err);
    box.appendChild(wrap);
}
// [systemcheck:charcats-start]
// 1.6.2 (218, fold 2; the owner, by prompt: "System names, owner or GM moves"): the Characters list's categories, on the Rules tab: a name, and a
// rule that files a sheet there by itself (a form). Listeners of their own, so the editor's dispatchers never read it
function charCatsDraft() { if (!Array.isArray(draft.charCats)) draft.charCats = []; return draft.charCats; }
function renderCharCats() {
    var box = ui('sysCharCats'); if (!box || !draft) return; box.textContent = '';
    var arr = Array.isArray(draft.charCats) ? draft.charCats : [], wrap = el('div', 'sys-budgets sys-charcats');
    wrap.appendChild(el('div', 'sys-light-head', 'Sheet categories'));
    wrap.appendChild(el('div', 'sys-note', 'Folders in the Characters list, such as Beasts or Vehicles. A sheet goes in the first whose rule it meets, and its owner or you can file it elsewhere from its right-click menu. With none, the list is as it always was.'));
    arr.forEach(function(x0, i) {
        var x = x0 && typeof x0 === 'object' ? x0 : {}, row = el('div', 'sys-flags sys-cc'); row.dataset.ci = String(i);
        var nl = el('label', 'sys-combat-item'); nl.appendChild(el('span', 'sys-num-cap', 'Name')); var nm = input('sys-cc-label field', typeof x.label === 'string' ? x.label : '', 'The folder\u2019s name in the Characters list, such as Beasts', 'Name'); nm.maxLength = 60; nl.appendChild(nm); row.appendChild(nl);
        var fl = el('label', 'sys-combat-item'); fl.appendChild(el('span', 'sys-num-cap', 'Files a sheet by itself where')); var fi = input('sys-cc-if field', typeof x['if'] === 'string' ? x['if'] : '', 'A sheet that meets this goes in this folder by itself, unless it was filed elsewhere by hand. Empty: only by hand', 'Only by hand'); fi.maxLength = LIMITS.formula; fl.appendChild(fi); row.appendChild(fl);
        row.appendChild(tableBtn('\u00d7', 'ccdel', 'Remove this category')); wrap.appendChild(row);
    });
    var ad = tableBtn('+ Category', 'ccadd', arr.length >= CHAR_CATS ? 'At most ' + CHAR_CATS : 'A folder in the Characters list'); ad.disabled = arr.length >= CHAR_CATS; wrap.appendChild(ad);
    var errC = errorCell('charcats'); errC.dataset.errFor = 'charcats'; wrap.appendChild(errC);   // 1.6.3: a category's name it still needs, said under the box
    box.appendChild(wrap);
    if (!box._ccWired) { box._ccWired = true;
        box.addEventListener('input', function(e) { var tg = e.target, rw = tg.closest ? tg.closest('.sys-cc') : null, x = rw ? charCatsDraft()[+rw.dataset.ci] : null; if (!x) return; e.stopPropagation();
            if (tg.classList.contains('sys-cc-label')) x.label = tg.value.slice(0, 60); else if (tg.classList.contains('sys-cc-if')) { var v = tg.value.slice(0, LIMITS.formula); if (v.trim()) x['if'] = v; else delete x['if']; } else return; markDirty(); if (typeof patchErrors === 'function') patchErrors(); });   // 1.6.3: the line under the box follows the name as it is typed
        box.addEventListener('change', function(e) { if (e.target && e.target.closest && e.target.closest('.sys-cc')) e.stopPropagation(); });
        box.addEventListener('click', function(e) { var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || (b.dataset.act !== 'ccadd' && b.dataset.act !== 'ccdel')) return; e.stopPropagation(); var a2 = charCatsDraft();
            if (b.dataset.act === 'ccadd') { if (a2.length < CHAR_CATS) a2.push({ label: typeof ruleName === 'function' ? ruleName(a2, 'Category') : 'Category ' + (a2.length + 1) }); } else { var rw2 = b.closest('.sys-cc'), i2 = rw2 ? +rw2.dataset.ci : -1; if (i2 >= 0) a2.splice(i2, 1); }   // 1.6.3: a new category starts named, since Save drops one with no name and its rule with it
            if (!a2.length) delete draft.charCats; markDirty(); renderCharCats(); if (typeof patchErrors === 'function') patchErrors(); });
    }
}
// [systemcheck:charcats-end]
// [systemcheck:namelists-start]
// 1.6.2 (backlog 147; the owner: "Lists, else a maker (Recommended)"): the name button's lists, on the Rules tab. A list is a name, a kind and its names,
// one a line, with Who reads it; the box has listeners of its own, so the editor's dispatchers never read it
var NAME_KIND_OPTS = [['', 'Characters and places'], ['person', 'Characters'], ['place', 'Places']];
function namesDraft() { if (!Array.isArray(draft.names)) draft.names = []; return draft.names; }
function renderNames() {
    var box = ui('sysNames'); if (!box || !draft) return; box.textContent = '';
    var arr = Array.isArray(draft.names) ? draft.names : [], wrap = el('div', 'sys-budgets sys-names');
    wrap.appendChild(el('div', 'sys-light-head', 'Name lists'));
    wrap.appendChild(el('div', 'sys-note', 'The name button picks from these lists, then makes a name up where you have none of that kind. Write one name a line.'));
    arr.forEach(function(l0, i) {
        var l = l0 && typeof l0 === 'object' ? l0 : {}, blk = el('div', 'sys-nl'), head = el('div', 'sys-flags');
        blk.dataset.ni = String(i);
        var nm = input('sys-nl-label field', typeof l.label === 'string' ? l.label : '', 'The list\u2019s name, such as River towns', 'Name'); nm.maxLength = 60; var lb = el('label', 'sys-combat-item'); lb.appendChild(el('span', 'sys-num-cap', 'Name')); lb.appendChild(nm); head.appendChild(lb);
        head.appendChild(labeledSelect('sys-nl-kind field', 'Serves', NAME_KIND_OPTS, l.kind === 'person' || l.kind === 'place' ? l.kind : '', 'Which name button offers this list'));
        head.appendChild(labeledSelect('sys-nl-vis field', 'Who reads it', TABLE_VIS_OPTS, l.vis === 'gm' ? 'gm' : '', 'A list for the GM alone never reaches players'));
        var del = tableBtn('\u00d7', 'nldel', 'Remove this list'); head.appendChild(del); blk.appendChild(head);
        var ta = el('textarea', 'sys-nl-names field'); ta.rows = 5; ta.value = Array.isArray(l.names) ? l.names.join('\n') : ''; ta.placeholder = 'One name a line'; ta.title = 'One name a line, 500 at most'; blk.appendChild(ta);
        blk.appendChild(el('div', 'sys-note', (Array.isArray(l.names) ? l.names.length : 0) + ' names'));
        wrap.appendChild(blk);
    });
    var ad = tableBtn('+ Name list', 'nladd', arr.length >= 24 ? 'At most 24' : 'A list of names the name button picks from'); ad.disabled = arr.length >= 24; wrap.appendChild(ad);
    box.appendChild(wrap);
    if (!box._nlWired) { box._nlWired = true;
        box.addEventListener('input', function(e) { var tg = e.target, blk = tg.closest ? tg.closest('.sys-nl') : null, x = blk ? namesDraft()[+blk.dataset.ni] : null; if (!x) return; e.stopPropagation();
            if (tg.classList.contains('sys-nl-label')) x.label = tg.value.slice(0, 60); else if (tg.classList.contains('sys-nl-names')) x.names = tg.value.split('\n').slice(0, 520); else return; markDirty(); });
        box.addEventListener('change', function(e) { var tg = e.target, blk = tg.closest ? tg.closest('.sys-nl') : null, x = blk ? namesDraft()[+blk.dataset.ni] : null; if (!x) return; e.stopPropagation();
            if (tg.classList.contains('sys-nl-kind')) { if (tg.value) x.kind = tg.value; else delete x.kind; } else if (tg.classList.contains('sys-nl-vis')) { if (tg.value === 'gm') x.vis = 'gm'; else delete x.vis; } else if (tg.classList.contains('sys-nl-names')) { x.names = tg.value.split('\n').slice(0, 520); renderNames(); return; } else return; markDirty(); });
        box.addEventListener('click', function(e) { var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b || (b.dataset.act !== 'nladd' && b.dataset.act !== 'nldel')) return; e.stopPropagation(); var arr2 = namesDraft();
            if (b.dataset.act === 'nladd') { if (arr2.length < 24) arr2.push({ label: '', names: [] }); } else { var blk2 = b.closest('.sys-nl'), i2 = blk2 ? +blk2.dataset.ni : -1; if (i2 >= 0) arr2.splice(i2, 1); }
            if (!arr2.length) delete draft.names; markDirty(); renderNames(); });
    }
}
// [systemcheck:namelists-end]
function tableOfEl(t) { var b = t.closest('.sys-tbl'), i = b ? +b.dataset.ti : -1, arr = tablesDraft(); return arr[i] && typeof arr[i] === 'object' ? arr[i] : null; }
function onTableInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-tbl-') < 0) return false;
    var x = tableOfEl(t); if (!x) return true;
    var col = Array.isArray(x.cols) ? x.cols[+t.dataset.ci] : null, row = Array.isArray(x.rows) ? x.rows[+t.dataset.ri] : null;
    if (c.indexOf('sys-tbl-key') >= 0) x.key = t.value.slice(0, 24);
    else if (c.indexOf('sys-tbl-label') >= 0) x.label = t.value.slice(0, LIMITS.label);
    else if (c.indexOf('sys-tbl-clabel') >= 0 && col) col.label = t.value.slice(0, LIMITS.label);
    else if (c.indexOf('sys-tbl-rkey') >= 0 && row) row.key = t.value.slice(0, 40);
    else if (c.indexOf('sys-tbl-rlabel') >= 0 && row) row.label = t.value.slice(0, LIMITS.label);
    else if ((c.indexOf('sys-tbl-lo') >= 0 || c.indexOf('sys-tbl-hi') >= 0) && row) { var kR = c.indexOf('sys-tbl-lo') >= 0 ? 'lo' : 'hi', vR = t.value.trim() === '' ? NaN : Number(t.value); if (isFinite(vR)) row[kR] = vR; else delete row[kR]; }   // 1.6.2 (G7)
    else if (c.indexOf('sys-tbl-val') >= 0 && row && col) { var v = t.value.trim() === '' ? NaN : Number(t.value); if (!row.vals || typeof row.vals !== 'object') row.vals = {}; if (isFinite(v)) row.vals[col.key] = v; else delete row.vals[col.key]; }
    else return true;
    markDirty(); patchErrors(); return true;
}
function onTableChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-tbl-') < 0) return false;
    var x = tableOfEl(t); if (!x) return true;
    if (c.indexOf('sys-tbl-vis') >= 0) { if (t.value === 'gm') x.vis = 'gm'; else delete x.vis; }
    else if (c.indexOf('sys-tbl-ckey') >= 0) {
        var cols = Array.isArray(x.cols) ? x.cols : [], col = cols[+t.dataset.ci]; if (!col) return true;
        var to = t.value.trim().slice(0, 24), from = col.key;
        if (cols.some(function(o) { return o !== col && o && typeof o.key === 'string' && o.key.toLowerCase() === to.toLowerCase(); })) { t.value = typeof from === 'string' ? from : ''; toast('Another column has this key.'); return true; }   // the figures are kept under a column's key
        (Array.isArray(x.rows) ? x.rows : []).forEach(function(r) { if (r && r.vals && typeof r.vals === 'object' && Object.prototype.hasOwnProperty.call(r.vals, from)) { var v = r.vals[from]; delete r.vals[from]; if (to) r.vals[to] = v; } });
        col.key = to; t.value = to;
    } else return true;
    markDirty(); patchErrors(); return true;
}
function tableClick(b) {
    if (b.dataset.act === 'tablecsv') { if (typeof tableCsvPick === 'function') tableCsvPick(); return true; }   // 1.6.3: Import from a spreadsheet, the tablecsv slice's
    var m = /^table(add|up|down|del|coladd|coldel|rowadd|rowdel)$/.exec(b.dataset.act || ''); if (!m) return false;
    var arr = tablesDraft(), blk = b.closest('.sys-tbl'), i = blk ? +blk.dataset.ti : -1, x = arr[i] && typeof arr[i] === 'object' ? arr[i] : null;
    if (m[1] === 'add') { if (arr.length >= LIMITS.tables) { toast('At most ' + LIMITS.tables + '.'); return true; } arr.push({ key: '', label: '', cols: [{ key: 'value', label: 'Value' }], rows: [{ key: 'row1', vals: {} }] }); }
    else if (!x) return true;
    else if (m[1] === 'up') { if (i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]); }
    else if (m[1] === 'down') { if (i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]); }
    else if (m[1] === 'del') arr.splice(i, 1);
    else {
        var cols = Array.isArray(x.cols) ? x.cols : (x.cols = []), rows = Array.isArray(x.rows) ? x.rows : (x.rows = []), ci = +b.dataset.ci, ri = +b.dataset.ri;
        if (m[1] === 'coladd') { if (cols.length >= LIMITS.tableCols) { toast('At most ' + LIMITS.tableCols + '.'); return true; } var ck = tableFresh(cols, 'col'); cols.push({ key: ck, label: '' }); }
        else if (m[1] === 'rowadd') { if (rows.length >= LIMITS.tableRows) { toast('At most ' + LIMITS.tableRows + '.'); return true; } rows.push({ key: tableFresh(rows, 'row'), vals: {} }); }
        else if (m[1] === 'coldel') { if (!cols[ci]) return true; var gone = cols.splice(ci, 1)[0]; rows.forEach(function(r) { if (r && r.vals && gone && typeof gone.key === 'string') delete r.vals[gone.key]; }); }
        else { if (!rows[ri]) return true; rows.splice(ri, 1); }
    }
    if (!arr.length) delete draft.tables;
    markDirty(); renderTables(); patchErrors(); return true;
}
// What Save does with the tables, as cleanTables reads them: { errs }. A table's words name it by its place, since its key may be what is wrong
function tableSays(tables) {
    var errs = [], seen = Object.create(null), kept = 0, KEYS = 'a key is a letter, then letters, digits or _, and never a word scripts keep for themselves', say = function(t) { errs.push({ message: t }); };
    (Array.isArray(tables) ? tables : []).forEach(function(t, i) {
        if (!t || typeof t !== 'object') return;
        var nm = 'Table ' + (i + 1); if (kept >= LIMITS.tables) { say(nm + ': at most ' + LIMITS.tables + ' tables. Save drops it.'); return; }
        var key = tableKeyOk(t.key, TABLE_KEY); if (!key) { say(nm + ': ' + (!(typeof t.key === 'string' && t.key.trim()) && !(typeof t.label === 'string' && t.label.trim()) ? 'it needs a name. Until it has one, Save drops it.' : KEYS + '. Save drops it.')); return; }
        if (seen[key.toLowerCase()]) { say(nm + ': another table has the key ' + key + '. Save drops it.'); return; }
        var cs = Object.create(null), kc = [], rs = Object.create(null), rn = 0;
        (Array.isArray(t.cols) ? t.cols : []).forEach(function(c, j) {
            if (!c || typeof c !== 'object') return;
            var at = nm + ', column ' + (j + 1) + ': '; if (kc.length >= LIMITS.tableCols) { say(at + 'at most ' + LIMITS.tableCols + ' columns. Save drops it.'); return; }
            var ck = tableKeyOk(c.key, TABLE_KEY); if (!ck) { say(at + KEYS + '. Save drops it.'); return; }
            if (cs[ck.toLowerCase()]) { say(at + 'another column has the key ' + ck + '. Save drops it.'); return; }
            cs[ck.toLowerCase()] = 1; kc.push(ck);
        });
        if (!kc.length) { say(nm + ': it needs a column. Save drops it.'); return; }
        (Array.isArray(t.rows) ? t.rows : []).forEach(function(r, j) {
            if (!r || typeof r !== 'object') return;
            var at = nm + ', row ' + (j + 1) + ': '; if (rn >= LIMITS.tableRows) { say(at + 'at most ' + LIMITS.tableRows + ' rows. Save drops it.'); return; }
            var rk = tableKeyOk(r.key, TABLE_ROW_KEY), fk = rk ? nameFold(rk) : ''; if (!fk) { say(at + KEYS + '. Save drops it.'); return; }
            if (rs[fk]) { say(at + 'another row reads as ' + rk + '. Save drops it.'); return; }
            rs[fk] = 1; rn++;
            kc.forEach(function(ck) { var v = r.vals && typeof r.vals === 'object' && Object.prototype.hasOwnProperty.call(r.vals, ck) ? r.vals[ck] : undefined; if (v !== undefined && !(typeof v === 'number' && isFinite(v) && Math.abs(v) <= LIMITS.statAbs)) say(at + 'the figure under ' + ck + ' is no number of ' + LIMITS.statAbs + ' or less. Save drops that figure.'); });
        });
        if (!rn) { say(nm + ': it needs a row. Save drops it.'); return; }
        (typeof tableRangeSays === 'function' ? tableRangeSays(t) : []).forEach(say);   // 1.6.2 (G7; the owner: "the builder should warn when two rows' ranges overlap or leave a gap")
        seen[key.toLowerCase()] = 1; kept++;
    });
    return { errs: errs };
}
// [sinkcheck:tablebox-end]
// [systemcheck:tablebox-end]
// [systemcheck:tablecsv-start]
// [sinkcheck:tablecsv-start]
// 1.6.3 (the owner, 2026-11-16, by prompt: "Make a new table, or replace one"): a table filled from a spreadsheet. Import from a spreadsheet, beside
// + Table in the Tables box (tableClick hands its press to tableCsvPick), picks a CSV file; csvcore reads it (readCsv, the Library's own reader) and
// makes it a table (csvTable), each row's and column's name the name the user sees and its short form made by keyWord, the rule every short form of
// this editor follows. Nothing changes until Import is pressed: renderTables asks tableCsvDraw, which shows the file under the box with what was left
// out, and Goes in picks a new table or one of the system's to put it in place of. Import (tableCsvGo) puts it into the draft, a replace asked first
// with noEnter since it takes the old rows and columns away, so Save stores it as any edit and says what it would drop (tableSays). _tcsv is this
// editor's own memory of the file read, never stored: Cancel, Import, a new file or another draft lets it go. Every word from the file is a text node.
// The table a replace goes into is kept as the table itself (_tcsv.target), never by its place in the list, and what the file makes is worked out
// again from the draft as it stands at every drawing and again at Import (the review of 1.6.3: a table moved, removed or edited between the preview
// and Import turned a replace onto another table, or brought in short names, room and taken names that no longer held)
var _tcsv = null, TCSV_ROWS = 12, TCSV_COLS = 8;
function tcsvLog(step, o) { try { if (typeof window !== 'undefined' && typeof window.wpStepLog === 'function') window.wpStepLog('tables v1', step, o); } catch (e) {} }   // structure only: counts and a status, never a name or a cell
// The file picker: a CSV file, read whole as bytes and handed to tableCsvOpen, unless it is past the Library's own size for a spreadsheet
function tableCsvPick() {
    var fi = el('input'); fi.type = 'file'; fi.accept = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain';
    fi.addEventListener('change', function() {
        var f = fi.files && fi.files[0], d0 = draft; if (!f || !d0) return;
        if (f.size > CSV.bytes) { tcsvLog('csv-refused', { why: 'size' }); toast('That file is too large (' + Math.round(CSV.bytes / 1048576) + ' MB at most).'); return; }
        f.arrayBuffer().then(function(buf) { if (draft === d0) tableCsvOpen(String(f.name || ''), new Uint8Array(buf)); }).catch(function() { tcsvLog('csv-refused', { why: 'read' }); toast('That file could not be read.'); });
    });
    fi.click();
}
// The draft's first entry that is a table, what a replace falls back to where the system has no room for a new one
function tcsvFirst(arr) { for (var i = 0; i < arr.length; i++) if (arr[i] && typeof arr[i] === 'object') return arr[i]; return null; }
// A picked file's bytes: read by readCsv (what cannot be a spreadsheet is said and nothing is shown), named after the file, and shown as a new table
// where the system has room for one, else in place of its first table
function tableCsvOpen(fileName, bytes) {
    var t = readCsv(bytes); if (t.error) { tcsvLog('csv-refused', { why: 'file' }); toast(t.error); return; }
    var nm = String(fileName || '').replace(/\.[^.]*$/, '').replace(/[_]+/g, ' ').trim().slice(0, LIMITS.label), arr = Array.isArray(draft.tables) ? draft.tables : [];
    _tcsv = { draft: draft, file: String(fileName || '').slice(0, 80), label: nm, parsed: t, target: arr.length < LIMITS.tables ? null : tcsvFirst(arr), mode: 'new', lost: '', res: null, seen: '' };
    tableCsvSync(); tcsvLog('csv-read', { rows: t.rows.length, sep: t.sep === ',' ? 'comma' : t.sep === ';' ? 'semicolon' : t.sep === '\t' ? 'tab' : 'other', enc: t.enc, open: t.open });
    tcsvRedraw('.sys-tcsv-mode, .sys-tcsv-off', -1);
}
// How many figures the draft's tables hold, all but the one at skip: what csvTable may fill is what they leave of LIMITS.tableCells, as the cleaner counts
function tableCsvCells(skip) {
    var n = 0; (Array.isArray(draft.tables) ? draft.tables : []).forEach(function(x, i) { if (i === skip || !x || typeof x !== 'object') return; n += (Array.isArray(x.cols) ? x.cols.length : 0) * (Array.isArray(x.rows) ? x.rows.length : 0); });
    return n;
}
// Where the file goes, read again from the draft as it stands now, then the table it makes there (tableCsvMake). A replace's table that is no longer in
// the draft (removed since) falls back to a new table where there is room, else the first table, and s.lost keeps its name so the box can say so.
// s.mode is the Goes in list's value: 'new', or the target's place in the list now, so a table moved since still reads under its own name
function tableCsvSync() {
    var s = _tcsv; if (!s) return; var arr = Array.isArray(draft.tables) ? draft.tables : [];
    if (s.target && arr.indexOf(s.target) < 0) { s.lost = tcsvName(s.target, 0); s.target = null; }
    if (!s.target && arr.length >= LIMITS.tables) s.target = tcsvFirst(arr);
    var i = s.target ? arr.indexOf(s.target) : -1; s.mode = i >= 0 ? String(i) : 'new';
    tableCsvMake();
}
// The table as the mode picked makes it: a new table's short form kept clear of the others', or a replace keeping the old table's short forms, the
// room and the names taken worked out from the draft as it stands
function tableCsvMake() {
    var s = _tcsv; if (!s) return; var arr = Array.isArray(draft.tables) ? draft.tables : [], i = s.target ? arr.indexOf(s.target) : -1, keep = i >= 0 ? s.target : null;
    s.res = csvTable(s.parsed, { keyOf: keyWord, label: s.label, keep: keep, taken: arr.map(function(x) { return x && typeof x.key === 'string' ? x.key : ''; }), room: LIMITS.tableCells - tableCsvCells(i) });
}
// What the box shows of the file, as one text: where it goes and the table it makes, with what was left out. Import compares it with what was last
// drawn and goes no further where they differ, so nothing comes in that was not shown
function tcsvSig(s) { var r = s && s.res ? s.res : {}; return JSON.stringify([s ? s.mode : '', r.table || null, r.error || '', r.cutCols, r.cutRows, r.full, r.bad, r.dropped, r.noRange]); }
// The Tables box drawn again with its scroll kept (io.js keepPlace), then the focus put on focusSel: inside the table at place ti, or anywhere in the
// box where ti is below 0. The button pressed (Import, Cancel) is gone after the drawing, so without this the focus fell to the page
function tcsvRedraw(focusSel, ti) {
    var root = ui('sysTables'), kp = typeof window !== 'undefined' && typeof window.wpKeepPlace === 'function' ? window.wpKeepPlace : null;
    if (kp && root) kp(root, renderTables); else renderTables();
    var nx = ui('sysTables'), scope = nx && typeof nx.querySelector === 'function' ? (ti >= 0 ? nx.querySelector('.sys-tbl[data-ti="' + ti + '"]') : nx) : null, f = focusSel && scope ? scope.querySelector(focusSel) : null;
    if (f && typeof f.focus === 'function') { try { f.focus({ preventScroll: true }); } catch (e) {} }
}
function tcsvName(x, i) { return x && typeof x.label === 'string' && x.label.trim() ? x.label.trim() : x && typeof x.key === 'string' && x.key ? x.key : 'Table ' + (i + 1); }
function tcsvWords(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
// What was left out, in words that end a sentence, for the list under the file's name
function tableCsvLeft(res) {
    var out = [];
    if (res.open) out.push('A quote in the file never closed, so the rest of the file was read as one cell.');
    if (res.cutCols) out.push(tcsvWords(res.cutCols, 'column', 'columns') + ' past the ' + LIMITS.tableCols + ' a table holds ' + (res.cutCols === 1 ? 'was' : 'were') + ' left out.');
    if (res.cutRows) out.push(tcsvWords(res.cutRows, 'row', 'rows') + (res.full ? ' did not fit, since the system’s tables hold ' + LIMITS.tableCells + ' figures in all, and ' + (res.cutRows === 1 ? 'was' : 'were') + ' left out.' : ' past the ' + LIMITS.tableRows + ' a table holds ' + (res.cutRows === 1 ? 'was' : 'were') + ' left out.'));
    if (res.noRange) out.push(tcsvWords(res.noRange, 'row comes', 'rows come') + ' in with no From and To, which a spreadsheet does not hold, so a number no longer finds ' + (res.noRange === 1 ? 'it' : 'them') + '. You can give ' + (res.noRange === 1 ? 'it a range' : 'them ranges') + ' in the table’s box.');
    (Array.isArray(res.reasons) ? res.reasons : []).forEach(function(r) { out.push(r); });
    if (res.more) out.push('And ' + tcsvWords(res.more, 'thing', 'things') + ' more like these.');
    return out;
}
// The file shown under the Tables box: its name, Goes in, what was left out, the first rows and columns as text, then Import and Cancel. Its controls
// have listeners of their own and stop there, so the editor's dispatchers never read them. Where it goes and what it makes are read again first
function tableCsvDraw(wrap) {
    var s = _tcsv; if (!s) return; if (s.draft !== draft) { _tcsv = null; return; }
    tableCsvSync(); s.seen = tcsvSig(s);
    var res = s.res || {}, box = el('div', 'sys-tcsv'), arr = Array.isArray(draft.tables) ? draft.tables : [], stop = function(e) { if (e && e.stopPropagation) e.stopPropagation(); };
    box.appendChild(el('div', 'sys-light-head', 'From a spreadsheet'));
    var btn = function(text, cls, title, fn) { var b = el('button', cls, text); b.type = 'button'; b.title = title; b.addEventListener('click', function(e) { stop(e); fn(); }); return b; };
    var off = btn('Cancel', 'tool ghost sys-btn sys-tcsv-off', 'Leave the tables as they are', function() { _tcsv = null; tcsvLog('csv-cancel', {}); tcsvRedraw('.sys-tbl-csv', -1); });
    if (res.error || !res.table) { box.appendChild(el('div', 'sys-note', '“' + s.file + '”: ' + (res.error || 'That file does not read as a table.'))); var bb = el('div', 'sys-flags'); bb.appendChild(off); box.appendChild(bb); wrap.appendChild(box); return; }
    var tb = res.table, cols = tb.cols, rows = tb.rows;
    box.appendChild(el('div', 'sys-note', '“' + s.file + '” holds ' + tcsvWords(rows.length, 'row', 'rows') + ' and ' + tcsvWords(cols.length, 'column', 'columns') + ' of figures. Its first row names the columns and its first column names the rows. Nothing changes until you press Import.'));
    var opts = []; if (arr.length < LIMITS.tables) opts.push(['new', 'A new table']); arr.forEach(function(x, i) { opts.push([String(i), 'In place of ' + tcsvName(x, i)]); });
    var lbl = el('label', 'sys-combat-item'), sel = select('sys-tcsv-mode field', opts, s.mode, 'A new table, or one of yours whose rows and columns become the file’s'), row1 = el('div', 'sys-flags'); lbl.appendChild(el('span', 'sys-num-cap', 'Goes in as')); lbl.appendChild(sel); row1.appendChild(lbl); box.appendChild(row1);
    sel.addEventListener('input', stop); sel.addEventListener('change', function(e) { stop(e); var now = Array.isArray(draft.tables) ? draft.tables : [], pick = now[+sel.value]; s.target = sel.value === 'new' ? null : (pick && typeof pick === 'object' ? pick : null); s.lost = ''; tableCsvSync(); tcsvRedraw('.sys-tcsv-mode', -1); });
    if (s.lost) box.appendChild(el('div', 'sys-note', 'The table it was to go in place of, ' + s.lost + ', is gone, so it goes in ' + (s.mode === 'new' ? 'as a new table' : 'in place of ' + tcsvName(s.target, +s.mode)) + ' now.'));
    box.appendChild(el('div', 'sys-note', s.mode === 'new' ? 'It comes in as a new table named ' + tb.label + '. You can rename it in its box.' : 'Its name and who reads it stay. Its rows and columns become the file’s, and a row or a column of the same name keeps its short name, so a formula that reads it by name still does.'));
    var left = tableCsvLeft(res), ul = el('ul', 'sys-tcsv-left');
    if (left.length) { box.appendChild(el('div', 'sys-num-cap', 'Left out')); left.forEach(function(w) { ul.appendChild(el('li', null, w)); }); box.appendChild(ul); }
    else box.appendChild(el('div', 'sys-note', 'Nothing was left out.'));
    var sc = el('div', 'sys-tbl-scroll'), grid = el('table', 'sys-tcsv-grid'), hr = el('tr'), showC = cols.slice(0, TCSV_COLS);
    hr.appendChild(el('th', null, '')); showC.forEach(function(c) { hr.appendChild(el('th', null, c.label)); }); grid.appendChild(hr);
    rows.slice(0, TCSV_ROWS).forEach(function(r) { var tr = el('tr'); tr.appendChild(el('th', null, r.label)); showC.forEach(function(c) { var v = r.vals[c.key]; tr.appendChild(el('td', 'sys-tcsv-num', typeof v === 'number' ? String(v) : '')); }); grid.appendChild(tr); });
    sc.appendChild(grid); box.appendChild(sc);
    var moreW = []; if (rows.length > TCSV_ROWS) moreW.push(tcsvWords(rows.length - TCSV_ROWS, 'more row', 'more rows')); if (cols.length > TCSV_COLS) moreW.push(tcsvWords(cols.length - TCSV_COLS, 'more column', 'more columns'));
    if (moreW.length) box.appendChild(el('div', 'sys-note', 'And ' + moreW.join(' and ') + ', which come in too.'));
    var bar = el('div', 'sys-flags'); bar.appendChild(btn('Import', 'tool sys-btn sys-tcsv-go', 'Put this table into the system. Save keeps it', tableCsvGo)); bar.appendChild(off); box.appendChild(bar);
    wrap.appendChild(box);
}
// Where it goes and what it makes, read again from the draft: true while that is what the box last showed. Where not, the box is drawn again as it
// is now and the GM is asked to look again, and nothing comes in
function tcsvStill(s) {
    var was = s.seen; tableCsvSync(); if (s.res && s.res.table && tcsvSig(s) === was) return true;
    tcsvLog('csv-stale', {}); tcsvRedraw('.sys-tcsv-go, .sys-tcsv-off', -1); toast('The tables changed since the file was shown. Look at it again, then press Import.'); return false;
}
// Import: a new table goes at the end of the draft's tables, and a replace puts the file's rows and columns into the table picked, asked first with its
// buttons alone. Both are judged again on the draft as it stands at the press and, for a replace, at the answer (tcsvStill). The draft is marked
// changed and the box drawn again with the focus on the table's name, so Save stores it and says what it would drop
function tableCsvGo() {
    var s = _tcsv; if (!s || s.draft !== draft || !tcsvStill(s)) return;
    var done = function(mode, tb, ti) { _tcsv = null; markDirty(); tcsvRedraw('.sys-tbl-label', ti); patchErrors(); toast(mode === 'new' ? 'The table is in. Save keeps it.' : 'The table holds the file’s rows and columns now. Save keeps it.'); tcsvLog('csv-done', { mode: mode, rows: tb.rows.length, cols: tb.cols.length, bad: s.res.bad, dropped: s.res.dropped, cutRows: s.res.cutRows, cutCols: s.res.cutCols, noRange: s.res.noRange }); };
    if (s.mode === 'new') { var arr = tablesDraft(); if (arr.length >= LIMITS.tables) { toast('The system holds ' + LIMITS.tables + ' tables at most.'); return; } arr.push(s.res.table); done('new', s.res.table, arr.length - 1); return; }
    var x = s.target; if (!x || tablesDraft().indexOf(x) < 0) { toast('That table is gone.'); return; }
    showConfirm('Put the file’s rows and columns in place of those of ' + tcsvName(x, +s.mode) + '? Its old figures go. Its name and who reads it stay.', function(yes) {
        if (!yes || yes === 'alt' || _tcsv !== s || s.draft !== draft || tablesDraft().indexOf(x) < 0 || !tcsvStill(s) || s.target !== x) return;
        var tb = s.res.table; x.cols = tb.cols; x.rows = tb.rows; done('replace', tb, tablesDraft().indexOf(x));
    }, { noEnter: true, yes: 'Replace' });
}
// [sinkcheck:tablecsv-end]
// [systemcheck:tablecsv-end]
function budgetDraft() { return Array.isArray(draft.budgets) ? draft.budgets : (draft.budgets = []); }
function renderBudgets() {
    var box = ui('sysBudgets'); if (!box) return; box.textContent = '';
    var arr = Array.isArray(draft.budgets) ? draft.budgets : [], wrap = el('div', 'sys-budgets');
    wrap.appendChild(el('div', 'sys-light-head', 'Point budgets'));
    wrap.appendChild(el('div', 'sys-note', 'A budget holds the points a character has against the points it has spent, each worked out from the sheet. The sheet shows spent of has under its head. When a player’s own change would take their character over, the budget refuses it, or lets it through with a note to them and to you. Your own changes are never refused.'));
    arr.forEach(function(b0, i) {
        var b = b0 && typeof b0 === 'object' ? b0 : {}, rw = el('div', 'sys-flags sys-bud-row'); rw.dataset.bi = String(i);
        var n = input('sys-bud-name field', typeof b.name === 'string' ? b.name : '', 'Its name on the sheet: Character points, Gear', 'Name'); n.maxLength = LIMITS.name; rw.appendChild(n);
        [['has', 'Has', 'The points a character has: a number or a formula, such as Points, or 100 + Flaws.paid', 'e.g. Points'], ['spent', 'Spent', 'The points a character has spent: a formula, such as Traits.paid + Skills.paid', 'e.g. Traits.paid']].forEach(function(g) {
            var l = el('label', 'sys-combat-item sys-bud-f'); l.appendChild(el('span', 'sys-num-cap', g[1]));
            var fi = input('sys-bud-' + g[0] + ' field', typeof b[g[0]] === 'string' ? b[g[0]] : '', g[2], g[3]); fi.maxLength = LIMITS.formula; l.appendChild(fi); rw.appendChild(l);
        });
        rw.appendChild(labeledSelect('sys-bud-over field', 'When over', BUDGET_OVER_OPTS, b.over === 'warn' || b.over === 'off' ? b.over : 'refuse', 'What happens when a player’s own change would take their character over this budget. Refuse stops the change. Warn lets it through with a note to them and to you. Only show it does not check'));
        rw.appendChild(labeledSelect('sys-bud-when field', 'Watched', BUDGET_WHEN_OPTS, b.when === 'making' || b.when === 'play' ? b.when : 'always', 'When the budget is watched: always, only while a player is making the character, or only once it is in play'));
        [['up', '▲', 'Move up'], ['down', '▼', 'Move down'], ['del', '×', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'bd' + bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
        wrap.appendChild(rw);
        if (typeof b.id === 'string') { var re = errorCell(b.id); re.dataset.errFor = b.id; wrap.appendChild(re); }   // the validator's reading of its two formulas
    });
    var ad = el('button', 'tool ghost sys-btn sys-bud-add', '+ Budget'); ad.dataset.act = 'bdadd'; ad.disabled = arr.length >= LIMITS.budgets; ad.title = ad.disabled ? 'At most ' + LIMITS.budgets : 'A budget: the points a character has, and the points it has spent'; wrap.appendChild(ad);
    var err = errorCell('budgets'); err.dataset.errFor = 'budgets'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function onBudgetInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-bud-') < 0) return false;
    if (c.indexOf('sys-bud-over') >= 0 || c.indexOf('sys-bud-when') >= 0) return true;   // their change events do the work
    var rw = t.closest('.sys-bud-row'), i = rw ? +rw.dataset.bi : -1, arr = budgetDraft(), b = arr[i] && typeof arr[i] === 'object' ? arr[i] : null; if (!b) return true;
    if (c.indexOf('sys-bud-name') >= 0) b.name = t.value.slice(0, LIMITS.name);
    else if (c.indexOf('sys-bud-has') >= 0) b.has = t.value.slice(0, LIMITS.formula);
    else if (c.indexOf('sys-bud-spent') >= 0) b.spent = t.value.slice(0, LIMITS.formula);
    else return true;
    markDirty(); patchErrors(); return true;
}
function onBudgetChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-bud-') < 0) return false;
    if (c.indexOf('sys-bud-over') < 0 && c.indexOf('sys-bud-when') < 0) return true;   // the boxes' change events (their input events did the work)
    var rw = t.closest('.sys-bud-row'), i = rw ? +rw.dataset.bi : -1, arr = budgetDraft(), b = arr[i] && typeof arr[i] === 'object' ? arr[i] : null; if (!b) return true;
    if (c.indexOf('sys-bud-over') >= 0) b.over = t.value === 'warn' || t.value === 'off' ? t.value : 'refuse';
    else b.when = t.value === 'making' || t.value === 'play' ? t.value : 'always';
    markDirty(); patchErrors(); return true;
}
function budgetClick(b) {
    var m = /^bd(add|up|down|del)$/.exec(b.dataset.act || ''); if (!m) return false;
    var arr = budgetDraft(), rw = b.closest('.sys-bud-row'), i = rw ? +rw.dataset.bi : -1;
    if (m[1] === 'add') { if (arr.length >= LIMITS.budgets) { toast('At most ' + LIMITS.budgets + '.'); return true; } arr.push({ id: uid('b_'), name: '', has: '', spent: '', over: 'refuse', when: 'always' }); }
    else if (!(i >= 0 && i < arr.length && Math.floor(i) === i)) return true;
    else if (m[1] === 'up') { if (i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]); }
    else if (m[1] === 'down') { if (i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]); }
    else arr.splice(i, 1);
    if (!arr.length) delete draft.budgets;
    markDirty(); renderBudgets(); patchErrors(); return true;
}
// [systemcheck:budgetbox-end]
// [split:body-end]
return { budgetClick: budgetClick, envClick: envClick, envSays: envSays, onBudgetChange: onBudgetChange, onBudgetInput: onBudgetInput, onEnvChange: onEnvChange, onEnvInput: onEnvInput, onInitChange: onInitChange, onInitInput: onInitInput, onTableChange: onTableChange, onTableInput: onTableInput, renderBudgets: renderBudgets, renderCharCats: renderCharCats, renderCombat: renderCombat, renderCurrencies: renderCurrencies, renderDecks: renderDecks, renderEnv: renderEnv, renderNames: renderNames, renderResults: renderResults, renderTables: renderTables, renderTags: renderTags, renderTests: renderTests, renderValues: renderValues, tableClick: tableClick, tableSays: tableSays, tagJudge: tagJudge, tagsMoved: tagsMoved, tagsTurn: tagsTurn };   // [split:glue]
}   // [split:glue]
