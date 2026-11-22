/* sysedtabs.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 7, the System editor; split 2026-11-19 with no change in behavior).
   What it holds: the Combat tab's Turns box (turnBox and its handlers), the error note at a
   limit (capLines), renderAll and the picked row of a tab (pickModel, pickRows), where a fault is said and gone to (errWhere, errGo),
   the focus kept across a redraw, an entry's grants (grantBox), Worked out until typed (autoBox), the names a box shows for keys, the
   editor's three handlers (onInput, onChange, onClick), the starters (Start from) and a system's import and export.
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sysedTabs() at
   its line `// [split:sysedtabs.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (tools/splitcheck.js holds it): the editor's own state (draft, dirty, tab, layoutView and
   the rest) stands in sheets.js and a part sets it through the setters beside `var draft`. Change the code here as if it still stood
   in sheets.js. */
// [split:of sheets.js]
import { CHAMBER_CAP, DEF_PROP, F, FEEDS_MAX, GRANT_MAX, KIND_LABEL, LIMITS, MARK_HOW, STAT_KEY, TURN_UNITS, _keyAuto, _perAt, _priceAt, _sidePrev, _starterPacks, addCharAsk, affOfRow, affSaysAt, applyChangeOf, barsClick, btnRow, budgetClick, buildDefCell, calendarClick, capInline, capsAt, charRowChange, charRowClick, charsDraw, checkLabel, cleanSystem, cleanTests, clone, closeGlyphPicker, coverHitClick, coverHitInput, crossEdit, damageClick, draft, draftSet, droppedCounts, droppedWords, effectRow, el, emptySystem, envClick, errPrefix, errorCell, everyEdit, featureOn, fieldRow, fxOfRow, fxTargets, getActiveCampaign, heightClick, input, itemRow, itemStatDefs, keyFollows, keyFromLabel, labeledSelect, layoutView, layoutViewSet, lightClick, lineUnder, linkClick, listCrossEdit, listNamesText, listOfCard, lookShadesOf, lvlOnlyRead, markDirty, modTiersRead, moneyOptions, numField, onAreaEdit, onBarsChange, onBlastChange, onBlastInput, onBudgetChange, onBudgetInput, onCalendarChange, onCalendarInput, onChecksInput, onDamageChange, onDamageInput, onDefendChange, onEnvChange, onEnvInput, onHeightChange, onHeightInput, onHoldChange, onHoldInput, onInitChange, onInitInput, onLayoutChange, onLayoutClick, onLayoutInput, onLightChange, onLightInput, onLinkChange, onLinkInput, onPostureChange, onPostureInput, onRangeChange, onRangeInput, onRemoveChange, onSensesChange, onSensesInput, onSwChange, onSwClick, onSwInput, onTableChange, onTableInput, open, opt, partsHostIn, patchErrors, perOptions, placeSet, plainMessage, postureClick, priceColOptions, priceOptions, rangeClick, refreshErrors, renderBudgets, renderCalendar, renderCharCats, renderCombat, renderCurrencies, renderDecks, renderEnv, renderLayout, renderLinks, renderLists, renderNames, renderResults, renderTables, renderTags, renderTests, renderValues, resistOrTick, resolveAll, rollRow, rolled, rowAimSet, segPut, select, sensesClick, setChangeTarget, showConfirm, sidePrevSet, sidePrevSync, starterPacksSet, statKey, statKeyInput, statTick, state, switchChangesChange, sysRolls, tab, tabSet, tableClick, testFormula, toast, ui, uid, upkeepChange, usedAsk, validateSystem } from './sheets.js';   // [split:glue]
export function sysedTabs() {   // [split:glue]
// [split:body-start]
function turnActs() { var tn = draft && draft.combat && draft.combat.turn; return tn && typeof tn === 'object' && Array.isArray(tn.acts) ? tn.acts.filter(function(a) { return a && typeof a === 'object' && typeof a.key === 'string' && a.key; }) : []; }
function turnDraft() { var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); return cm.turn && typeof cm.turn === 'object' && !Array.isArray(cm.turn) ? cm.turn : (cm.turn = {}); }
function clockBox(cls, v) {   // 1.6.2 (G10)
    var w = el('label', 'sys-check sys-clockrow'), b = el('input', cls + ' field'); b.type = 'number'; b.min = '0'; b.max = '999'; b.step = '1'; b.value = typeof v === 'number' ? String(v) : ''; b.placeholder = 'standard'; b.title = 'What one press costs on the counting clock. Blank: the standard cost, once a turn'; w.appendChild(document.createTextNode('On the clock ')); w.appendChild(b); return w;
}
function costHow(cls, v) {   // 1.6.2 (G10): how many of that action one press spends
    var w = el('label', 'sys-check sys-costhowrow'), b = el('input', cls + ' field'); b.type = 'number'; b.min = '1'; b.max = String(LIMITS.costN); b.step = '1'; b.value = String(typeof v === 'number' ? v : 1); b.title = 'How many of that action one press spends'; w.appendChild(document.createTextNode('How many ')); w.appendChild(b); return w;
}
function drawHow(v) {   // 1.6.2 (draw several at once): how many cards a roll draws first
    var w = el('label', 'sys-check sys-drawnrow'), b = el('input', 'sys-roll-drawn field'); b.type = 'number'; b.min = '1'; b.max = '20'; b.step = '1'; b.value = String(typeof v === 'number' ? v : 1); b.title = 'How many cards one press draws first. Its formulas read them all: how many, a number added up, or the highest or lowest'; w.appendChild(document.createTextNode('How many ')); w.appendChild(b); return w;
}
function costOptions(cost, acts) {   // a roll's Costs menu: nothing, each action, and a cost naming none (kept until picked away)
    var o = [['', 'Costs nothing']].concat(acts.map(function(a) { return [a.key, 'Costs: ' + (a.label || a.key)]; }));
    if (cost && !acts.some(function(a) { return a.key.toLowerCase() === String(cost).toLowerCase(); })) o.push([cost, 'Costs: ' + cost + ' (no such action)']);
    return o;
}
// [systemcheck:turntrade-start]
// 1.6.0 A trade in a fight: the actions of the Turns box a trade may spend, and the pick following its action's key
function turnTradeOpts(tn) {
    var out = [['', 'Costs nothing']];
    (Array.isArray(tn.acts) ? tn.acts : []).forEach(function(a) { if (a && typeof a === 'object' && typeof a.key === 'string' && a.key.trim()) out.push([a.key, 'Spends ' + (typeof a.label === 'string' && a.label ? a.label : a.key)]); });
    return out;
}
function turnTradeFollow(tn, was, now) { if (was && tn.trade === was) { if (now) tn.trade = now; else delete tn.trade; } if (was && tn.runCost === was) { if (now) tn.runCost = now; else delete tn.runCost; } }
// 1.6.0 A move by giving up an action: the actions it may spend, a pick of none first, and what Save does with the pair, as the cleaner reads it
function turnRunOpts(tn) {
    var out = [['', 'Pick the action']];
    (Array.isArray(tn.acts) ? tn.acts : []).forEach(function(a) { if (a && typeof a === 'object' && typeof a.key === 'string' && a.key.trim()) out.push([a.key, 'Spends ' + (typeof a.label === 'string' && a.label ? a.label : a.key)]); });
    return out;
}
function turnHoldSays(tn, kept) { return typeof tn.holdLost === 'string' && tn.holdLost.trim() && !(kept && kept.holdLost) ? ['It reads only where a hold names what sets it off, so Save drops it.'] : []; }   // 1.6.0: an action lost while a hold stands
function turnRunSays(tn, kept) {
    var out = [], has = typeof tn.run === 'string' && !!tn.run.trim(); if (kept && kept.run) return out;
    if (has && !(kept && kept.move)) out.push('It needs a Move per turn, so Save drops it.');
    else if (has) out.push('It needs the action it spends, from the actions below, so Save drops it.');
    else if (typeof tn.runCost === 'string' && tn.runCost) out.push('It names no formula, so Save drops the action it spends.');
    return out;
}
// [systemcheck:turntrade-end]
function turnBox(box, cm) {
    var tn = cm.turn && typeof cm.turn === 'object' && !Array.isArray(cm.turn) ? cm.turn : {}, wrap = el('div', 'sys-turn');
    wrap.appendChild(el('div', 'sys-turn-head', 'Turns'));
    wrap.appendChild(el('div', 'sys-note', 'Your game\u2019s turn, for turn-based combat: how far a character moves, how diagonals count (the ruler follows it), how long a round is, and the actions a turn allows (a roll can cost one).'));
    var r1 = el('div', 'sys-flags sys-turn-row');
    var mv = input('sys-turn-mvf field', typeof tn.move === 'string' ? tn.move : '', 'How far a character moves in one turn, worked out for each character (no dice): BasicMove, Speed, floor(DX / 2); empty: no limit', 'Move per turn (e.g. Speed)'); mv.maxLength = LIMITS.formula; r1.appendChild(mv);
    r1.appendChild(select('sys-turn-mvu', [['cells', 'grid cells'], ['ft', 'feet'], ['yd', 'yards'], ['m', 'meters']], typeof tn.unit === 'string' && TURN_UNITS[tn.unit] === 1 ? tn.unit : 'cells', 'The unit the move counts in: each map\u2019s scale converts it (30 ft on 5 ft squares is 6 squares; 5 yd on 1 yd hexes is 5 hexes)'));
    wrap.appendChild(r1);
    var r1r = el('div', 'sys-flags sys-turn-row'), rnB = input('sys-turn-runf field', typeof tn.run === 'string' ? tn.run : '', 'The most a turn may move by giving up the action named beside it, worked out for each character (no dice). While that action is free the map allows this. Moving past Move per turn spends it. Once it is spent the map allows Move per turn alone. Empty: one allowance', 'Move by giving up an action (e.g. Speed * 2)'); rnB.maxLength = LIMITS.formula; r1r.appendChild(rnB);
    r1r.appendChild(select('sys-turn-runact', turnRunOpts(tn), typeof tn.runCost === 'string' ? tn.runCost : '', 'The action that moving further spends, from the actions below. A roll that costs it after that meets the Move limit in Settings'));
    wrap.appendChild(r1r);   // 1.6.0
    var r1f = el('div', 'sys-flags sys-turn-row'), fcB = input('sys-turn-facef field', typeof tn.face === 'string' ? tn.face : '', 'How many times a character may change facing on its own turn, worked out for each character. Empty: turning is not counted', 'Facing changes per turn'); fcB.maxLength = LIMITS.formula; r1f.appendChild(fcB);
    r1f.appendChild(select('sys-turn-faceby', [['', 'Each step of the grid is one'], ['turn', 'Each turn is one, whatever its size']], tn.faceBy === 'turn' ? 'turn' : '', 'What counts as one facing change. A step is a side of a hex or a quarter turn on squares. On a map with no grid each turn is one'));
    wrap.appendChild(r1f);   // 1.6.2 (backlog 70): the facing limit, counted by the host under the table's Facing limit in Settings
    wrap.appendChild(labeledSelect('sys-turn-diag', 'Diagonals on squares', [['line', 'Straight line'], ['one', 'Every diagonal 1 square'], ['alt', 'Alternating 1\u20132 (5-10-5)']], tn.diag === 'one' || tn.diag === 'alt' ? tn.diag : 'line', 'How a diagonal step counts on a square grid, for the move and for the ruler; hexes are not affected'));
    wrap.appendChild(labeledSelect('sys-turn-off', 'Off a character\u2019s turn', [['', 'Any roll or action'], ['refuse', 'What is called for: a player is refused'], ['warn', 'What is called for: a player is warned']], tn.off === 'refuse' || tn.off === 'warn' ? tn.off : '', 'What a fight allows off a character\u2019s turn. What is called for is a roll from a card, one ticked Resists an attempt or Any time, one due at a turn or a round, and initiative. A stat\u2019s own roll, a typed roll and a row holding its turn are never held back, and you are told of what is'));   // 1.6.0
    wrap.appendChild(labeledSelect('sys-turn-hold', 'A hold lasts', [['', 'Until the round\u2019s end'], ['next', 'Until its next turn']], tn.hold === 'next' ? 'next' : '', 'How long a character may hold its turn. Until its next turn, a hold made on the round\u2019s last turn is not lost, and it ends as that character\u2019s turn comes round'));
    wrap.appendChild(labeledSelect('sys-turn-holdnames', 'What a hold names', [['', 'Nothing'], ['names', 'What sets it off']], tn.holdNames === true ? 'names' : '', 'What sets it off: a hold asks for a short line and, if wanted, a roll. It lasts to that character\u2019s next turn. Your Set off on the strip gives it its action before the turn goes on. A hold still standing at that next turn clears, and a card says the action was lost'));   // 1.6.0
    if (tn.holdNames === true) { var lostB = input('sys-turn-lostf field', typeof tn.holdLost === 'string' ? tn.holdLost : '', 'A formula of the holder\u2019s names, true while an action is lost, read at each step of the fight (no dice). As it comes true a hold standing goes in the action\u2019s place, and the next turn keeps the actions it would have had. Empty: a lost action is the table\u2019s to count', 'An action is lost when (optional)'); lostB.maxLength = LIMITS.formula; wrap.appendChild(lostB); }
    wrap.appendChild(labeledSelect('sys-turn-holdend', 'A hold and its turn\u2019s end', [['', 'Waits until it acts'], ['end', 'Runs as it holds']], tn.holdEnd === 'end' ? 'end' : '', 'What is due at a turn\u2019s end: rolls, actions and effects that count then. Runs as it holds: they come up when the character holds, and not again when it acts'));
    wrap.appendChild(labeledSelect('sys-turn-holdact', 'Acting from a hold', [['', 'Moves it after whoever is acting'], ['stay', 'Leaves the order as it is']], tn.holdAct === 'stay' ? 'stay' : '', 'What the strip\u2019s button does for a held character. Leaves the order as it is: the character acts while held, and Done ends the hold with nobody moved'));
    wrap.appendChild(labeledSelect('sys-turn-clock', 'A fight and the clock', [['', 'Synced: each round moves the clock'], ['runs', 'The clock runs on'], ['apart', 'Rounds apart: the date never moves']], tn.clock === 'runs' || tn.clock === 'apart' ? tn.clock : '', 'Synced: each round moves the game clock by its length, and the clock waits for the fight furthest behind. The clock runs on: it keeps going in a fight as it does outside one. Rounds apart: a fight never moves the date. Either way its rounds still count for In a fight rules and what lasts so many rounds'));   // 1.6.2
    wrap.appendChild(labeledSelect('sys-turn-live', 'The clock out of a fight', [['', 'Runs by itself'], ['held', 'Moves when the GM moves it']], tn.live === 'held' ? 'held' : '', 'How a campaign\u2019s clock starts: running by itself while a table is open, or only when the GM moves it. The GM can still change it in the Calendar'));   // 1.6.2
    if (tn.live !== 'held') wrap.appendChild(labeledSelect('sys-turn-rate', 'Its speed', [['1', 'Real time'], ['2', '\u00d72'], ['5', '\u00d75'], ['10', '\u00d710'], ['60', '\u00d760']], String([2, 5, 10, 60].indexOf(tn.rate) >= 0 ? tn.rate : 1), 'How fast it runs by itself: so many seconds of the game to each second at the table. The GM can still change it in the Calendar'));
    var sl = el('label', 'sys-combat-item'); sl.appendChild(el('span', 'sys-num-cap', 'A round is (seconds)'));
    var sc = el('input', 'field sys-turn-secs'); sc.type = 'number'; sc.min = '0'; sc.step = 'any'; sc.value = typeof tn.secs === 'number' ? String(tn.secs) : ''; sc.placeholder = 'e.g. 6'; sc.title = 'How long one round lasts in the game (1 second in some games, 6 seconds in others): an effect that lasts seconds or minutes counts down by it'; sl.appendChild(sc); wrap.appendChild(sl);
    [['act', 'acts', 'Actions per turn', LIMITS.turnActs], ['tu', 'units', 'Time units', LIMITS.turnUnits]].forEach(function(g) {
        var arr = Array.isArray(tn[g[1]]) ? tn[g[1]] : [];
        wrap.appendChild(el('span', 'sys-num-cap', g[2]));
        arr.forEach(function(x0, i) {
            var x = x0 && typeof x0 === 'object' ? x0 : {}, rw = el('div', 'sys-flags sys-turn-' + g[0]); rw.dataset.ti = String(i);
            var k = input('sys-turn-' + g[0] + 'key field', typeof x.key === 'string' ? x.key : '', g[0] === 'act' ? 'Its name, which a roll costs: Action, Bonus, Reaction, Maneuver' : 'Its name in an effect\u2019s length: segment, watch (not a word the list already has: second, minute, hour, day, turn, round)', 'Key'); k.maxLength = 24; rw.appendChild(k);
            var l = input('sys-turn-' + g[0] + 'label field', typeof x.label === 'string' ? x.label : '', 'What the sheet shows (blank: the key)', 'Label'); l.maxLength = LIMITS.label; rw.appendChild(l);
            var n = el('input', 'field sys-turn-' + g[0] + 'n'); n.type = g[0] === 'act' ? 'text' : 'number';
            if (g[0] === 'act') { n.maxLength = LIMITS.formula; n.value = typeof x.nf === 'string' && x.nf ? x.nf : String(typeof x.n === 'number' ? x.n : 1); n.placeholder = '1'; n.title = 'How many a turn allows: a whole number from 1 to 9, or a formula of the character\u2019s names, worked out at their turn\u2019s start, such as 1 + ExtraReady'; }   // 192
            else { n.min = '0'; n.step = 'any'; n.value = typeof x.secs === 'number' ? String(x.secs) : ''; n.placeholder = 'Seconds'; n.title = 'How long one lasts, in seconds (a watch: 14400)'; }
            rw.appendChild(n);
            [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 't' + g[0] + bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
            wrap.appendChild(rw);
        });
        var ad = el('button', 'tool ghost sys-btn sys-turn-add', g[0] === 'act' ? '+ Action' : '+ Time unit'); ad.dataset.act = 't' + g[0] + 'add'; ad.disabled = arr.length >= g[3]; ad.title = ad.disabled ? 'At most ' + g[3] : g[0] === 'act' ? 'Something one turn allows (an Action, a Bonus action, a Maneuver)' : 'A time unit of your game, by its length in seconds'; wrap.appendChild(ad);
    });
    wrap.appendChild(labeledSelect('sys-turn-trade', 'A trade in a fight', turnTradeOpts(tn), typeof tn.trade === 'string' ? tn.trade : '', 'What giving something in a trade spends in a fight, from the actions above. Who only takes spends nothing. It also keeps Trade with on an NPC in a fight'));
    lineUnder(wrap, 'Whoever gives spends this as the trade completes. One who only takes spends nothing.');
    if (wrap.lastChild && wrap.lastChild.classList) wrap.lastChild.classList.add('sys-combat-wide');   // 1.6.0: its words are longer than its list
    var err = errorCell('combat'); err.dataset.errFor = 'combat'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function onTurnInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-turn-') < 0 || c.indexOf('sys-turn-mvu') >= 0 || c.indexOf('sys-turn-diag') >= 0 || c.indexOf('sys-turn-off') >= 0 || c.indexOf('sys-turn-hold') >= 0 || c.indexOf('sys-turn-runact') >= 0) return false;
    var tn = turnDraft(), rw = t.closest('.sys-turn-act, .sys-turn-tu'), i = rw ? +rw.dataset.ti : -1;
    if (c.indexOf('sys-turn-mvf') >= 0) { if (t.value.trim()) tn.move = t.value.slice(0, LIMITS.formula); else delete tn.move; }
    else if (c.indexOf('sys-turn-runf') >= 0) { if (t.value.trim()) tn.run = t.value.slice(0, LIMITS.formula); else delete tn.run; }   // 1.6.0
    else if (c.indexOf('sys-turn-facef') >= 0) { if (t.value.trim()) tn.face = t.value.slice(0, LIMITS.formula); else delete tn.face; }   // 1.6.2 (backlog 70)
    else if (c.indexOf('sys-turn-lostf') >= 0) { if (t.value.trim()) tn.holdLost = t.value.slice(0, LIMITS.formula); else delete tn.holdLost; }   // 1.6.0
    else if (c.indexOf('sys-turn-secs') >= 0) { var sv = Number(t.value); if (t.value.trim() && isFinite(sv)) tn.secs = sv; else delete tn.secs; }
    else if (rw) {
        var g = rw.classList.contains('sys-turn-act') ? 'act' : 'tu', arr = tn[g === 'act' ? 'acts' : 'units'], x = Array.isArray(arr) && arr[i] && typeof arr[i] === 'object' ? arr[i] : null; if (!x) return true;
        if (c.indexOf('sys-turn-' + g + 'key') >= 0) { var wasK = x.key; x.key = t.value.slice(0, 24); if (g === 'act') turnTradeFollow(tn, wasK, x.key); }
        else if (c.indexOf('sys-turn-' + g + 'label') >= 0) { if (t.value.trim()) x.label = t.value.slice(0, LIMITS.label); else delete x.label; }
        else if (c.indexOf('sys-turn-' + g + 'n') >= 0) { var nv = Number(t.value); if (g === 'act') { var nt = String(t.value || '').trim(); if (/^[0-9]+$/.test(nt)) { x.n = nv; delete x.nf; } else if (nt) { x.nf = nt.slice(0, LIMITS.formula); if (typeof x.n !== 'number') x.n = 1; } else { x.n = 1; delete x.nf; } } else if (t.value.trim() && isFinite(nv)) x.secs = nv; else delete x.secs; }   // 192: a whole number, or a formula
        else return true;
        var tsT = g === 'act' && rw.parentNode ? rw.parentNode.querySelector('.sys-turn-trade') : null;   // the list of actions a trade may spend follows what is typed
        if (tsT) { var keepT = typeof tn.trade === 'string' ? tn.trade : ''; while (tsT.firstChild) tsT.removeChild(tsT.firstChild); turnTradeOpts(tn).forEach(function(o) { tsT.appendChild(opt(o[0], o[1], o[0] === keepT)); }); }
        var trT = g === 'act' && rw.parentNode ? rw.parentNode.querySelector('.sys-turn-runact') : null;   // ... and so does the list of what a move may spend
        if (trT) { var keepR = typeof tn.runCost === 'string' ? tn.runCost : ''; while (trT.firstChild) trT.removeChild(trT.firstChild); turnRunOpts(tn).forEach(function(o) { trT.appendChild(opt(o[0], o[1], o[0] === keepR)); }); }
    } else return false;
    markDirty(); patchErrors(); return true;
}
function onTurnChange(t) {
    var c = t.className || ''; if (typeof c !== 'string') return false;
    if (c.indexOf('sys-turn-mvu') >= 0) turnDraft().unit = t.value;
    else if (c.indexOf('sys-turn-diag') >= 0) { var tn = turnDraft(); if (t.value === 'one' || t.value === 'alt') tn.diag = t.value; else delete tn.diag; }
    else if (c.indexOf('sys-turn-faceby') >= 0) { var tnF = turnDraft(); if (t.value === 'turn') tnF.faceBy = 'turn'; else delete tnF.faceBy; }   // 1.6.2 (backlog 70)
    else if (c.indexOf('sys-turn-trade') >= 0) { var tnT = turnDraft(); if (t.value) tnT.trade = t.value; else delete tnT.trade; }   // 1.6.0
    else if (c.indexOf('sys-turn-runact') >= 0) { var tnR = turnDraft(); if (t.value) tnR.runCost = t.value; else delete tnR.runCost; }   // 1.6.0
    else if (c.indexOf('sys-turn-off') >= 0) { var tnO = turnDraft(); if (t.value === 'refuse' || t.value === 'warn') tnO.off = t.value; else delete tnO.off; }   // 1.6.0
    else if (c.indexOf('sys-turn-holdnames') >= 0) { var tnN = turnDraft(); if (t.value === 'names') tnN.holdNames = true; else { delete tnN.holdNames; delete tnN.holdLost; } markDirty(); renderAll(); return true; }   // 1.6.0: its formula's box comes and goes with it
    else if (c.indexOf('sys-turn-clock') >= 0) { var tnC = turnDraft(); if (t.value === 'runs' || t.value === 'apart') tnC.clock = t.value; else delete tnC.clock; }   // 1.6.2 Fight time
    else if (c.indexOf('sys-turn-live') >= 0) { var tnL = turnDraft(); if (t.value === 'held') { tnL.live = 'held'; delete tnL.rate; } else delete tnL.live; markDirty(); renderAll(); return true; }
    else if (c.indexOf('sys-turn-rate') >= 0) { var tnRt = turnDraft(), rtV = Number(t.value); if ([2, 5, 10, 60].indexOf(rtV) >= 0) tnRt.rate = rtV; else delete tnRt.rate; }
    else if (c.indexOf('sys-turn-holdend') >= 0) { var tnE = turnDraft(); if (t.value === 'end') tnE.holdEnd = 'end'; else delete tnE.holdEnd; }   // 1.6.0
    else if (c.indexOf('sys-turn-holdact') >= 0) { var tnA = turnDraft(); if (t.value === 'stay') tnA.holdAct = 'stay'; else delete tnA.holdAct; }   // 1.6.0
    else if (c.indexOf('sys-turn-hold') >= 0) { var tnH = turnDraft(); if (t.value === 'next') tnH.hold = 'next'; else delete tnH.hold; }   // 1.6.0
    else return c.indexOf('sys-turn-') >= 0;   // the boxes' change events (their input events did the work)
    markDirty(); patchErrors(); return true;
}
function turnClick(b) {
    var m = /^t(act|tu)(add|up|down|del)$/.exec(b.dataset.act || ''); if (!m) return false;
    var tn = turnDraft(), key = m[1] === 'act' ? 'acts' : 'units', cap = m[1] === 'act' ? LIMITS.turnActs : LIMITS.turnUnits, arr = Array.isArray(tn[key]) ? tn[key] : (tn[key] = []);
    var rw = b.closest('.sys-turn-' + m[1]), i = rw ? +rw.dataset.ti : -1;
    if (m[2] === 'add') { if (arr.length >= cap) { toast('At most ' + cap + '.'); return true; } arr.push(m[1] === 'act' ? { key: '', n: 1 } : { key: '', secs: 60 }); }
    else if (!(i >= 0 && i < arr.length)) return true;
    else if (m[2] === 'up') { if (i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]); }
    else if (m[2] === 'down') { if (i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]); }
    else { var goneT = arr.splice(i, 1)[0]; if (m[1] === 'act' && goneT) turnTradeFollow(tn, goneT.key, ''); }
    markDirty(); renderAll(); return true;
}
// [systemcheck:capnote-start]
// 1.6.0: the System editor says what is at its limit, so that one more would be left out (systemcore capsAt), and what a load of this campaign
// left out of its system (io.js noteDrops, window.wpSysDrops by campaign id). Text nodes alone; nothing shown where there is nothing to say
function capLines(sys, dr) {
    var out = [], dw = dr && typeof droppedWords === 'function' ? droppedWords(dr) : '';
    if (dw) out.push('When this campaign loaded, its system held more than Waypoint keeps, so this was left out: ' + dw + '.');
    (typeof capsAt === 'function' ? capsAt(sys) : []).forEach(function(a) { out.push('At the limit: ' + a.max + ' ' + a.what + (a.what.indexOf('HUD') === 0 ? '' : a.what === 'sections' || a.what === 'placements' ? ' on the sheet' : '') + '. One more would be left out.'); });
    return out;
}
function capNoteSync() {
    var box = ui('sysCapNote'); if (!box) return;
    var camp = getActiveCampaign(), drops = window.wpSysDrops && camp && typeof camp.id === 'string' ? window.wpSysDrops[camp.id] : null, lines = capLines(draft, drops);
    while (box.firstChild) box.removeChild(box.firstChild);
    lines.forEach(function(t) { box.appendChild(el('div', null, t)); });
    box.style.display = lines.length ? '' : 'none';
}
// [systemcheck:capnote-end]
var _tabPress = false;   // 1.6.0: a press of a tab changes nothing Save would say
function renderAll() {
    closeGlyphPicker();   // Stage 6: the rows it was opened from are being redrawn
    if (!draft) { charsDraw(); return; }   // 1.6.2 (backlog 59 f): Manage characters works with the System editor shut
    if (!_tabPress) refreshErrors();
    // 1.6.0: a tab's rows are drawn for the tab in view alone. Every tab's rows at every press of a tab held a large system's editor ten seconds
    var rowsFor = function(id, which, draw) { var box = ui(id); if (!box) return; var st = box.scrollTop; box.textContent = ''; if (tab === which) { draw(box); if (st) box.scrollTop = st; } };
    var was = rowFocusOf(document.activeElement);   // 1.6.0: a list stepped by the keyboard redraws its row: the next press stays on that list
    if (typeof capNoteSync === 'function') capNoteSync();   // 1.6.0: what is at its limit, and what a load left out
    document.querySelectorAll('#systemModal .sys-tabs button').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
    ui('sysFields').style.display = tab === 'fields' ? '' : 'none';
    ui('sysRolls').style.display = tab === 'rolls' ? '' : 'none';
    var scb = ui('sysCombat'); if (scb) { scb.style.display = tab === 'combat' ? '' : 'none'; if (tab === 'combat') renderCombat(); }   // 1.6.2: the Combat tab, its topics down the side
    var sru = ui('sysRules'); if (sru) sru.style.display = tab === 'rules' ? '' : 'none';   // 1.6.2: and the Rules tab
    var siEl = ui('sysItems'); if (siEl) siEl.style.display = tab === 'items' ? '' : 'none';
    var sfEl = ui('sysEffects'); if (sfEl) sfEl.style.display = tab === 'effects' ? '' : 'none';   // 5h
    var slEl = ui('sysLists'); if (slEl) { slEl.style.display = tab === 'lists' ? '' : 'none'; if (tab === 'lists') renderLists(); }   // Stage 6 F4b
    if (tab === 'rules') renderBudgets();   // 126: the Point budgets box
    if (tab === 'rules') renderEnv();   // 1.6.0: the Environment readings box
    if (tab === 'rules') renderTables();   // 1.6.0: the Tables box
    if (tab === 'rules') renderNames();   // 1.6.2 (backlog 147): the Name lists box
    if (tab === 'rules' && typeof renderCharCats === 'function') renderCharCats();   // 1.6.2 (218, fold 2): the Sheet categories box
    if (tab === 'rules') renderResults();   // 1.6.2 (G7)
    if (tab === 'rules') renderValues();   // 1.6.2 (G8)
    if (tab === 'rules') renderTests();   // 1.6.2 (backlog 59)
    if (tab === 'rules') renderTags();   // 1.6.2 (vehicles, fold (c))
    if (tab === 'rules') renderCurrencies();   // 157 M1
    if (tab === 'rules') renderDecks();   // 1.6.2 (G9)
    if (tab === 'rules') renderLinks();   // 1.6.0: the Linked sheets box
    if (tab === 'rules' && window.wpSysUi) window.wpSysUi.rulesDrawn();
    rowsFor('sysEffectRows', 'effects', function(efr) { if (!draft.effects || !draft.effects.length) efr.appendChild(el('div', 'sys-empty', 'No status effects yet. Add Rage, Prone, Blessed\u2026 each with the numbers it changes, then put a Status effects field on the sheet.')); pickRows(efr, 'effects', draft.effects || [], effectRow); });
    var sl = ui('sysLayout'); if (sl) { sl.style.display = tab === 'layout' ? '' : 'none'; if (tab === 'layout') renderLayout(); }
    var scal = ui('sysCalendar'); if (scal) { scal.style.display = tab === 'calendar' ? '' : 'none'; if (tab === 'calendar') renderCalendar(); }   // item 20 K1: the calendar
    rowsFor('sysFieldRows', 'fields', function(fr) { if (!draft.fields.length) fr.appendChild(el('div', 'sys-empty', 'No fields yet. A field is one thing on a sheet: a number, a pool such as hit points, a choice or a list of gear. Press + Field, or pick a preset under Start from.'));
    pickRows(fr, 'fields', draft.fields, fieldRow); });
    rowsFor('sysRollRows', 'rolls', function(rr) { if (!draft.rolls.length) rr.appendChild(el('div', 'sys-empty', 'No rolls yet. A roll makes a button on the sheet. Set its Kind to Apply for a button that moves pools or numbers instead (Apply costs, Apply wounds).'));
    pickRows(rr, 'rolls', draft.rolls, rollRow); });
    var rAdd = ui('sysAddRoll'); if (rAdd) { rAdd.disabled = draft.rolls.length >= LIMITS.rolls; rAdd.title = rAdd.disabled ? 'A system holds ' + LIMITS.rolls + ' rolls at most. Remove one to add another.' : 'Add a roll'; }   // 1.6.0: one past the cap was dropped at Save with nothing said
    rowsFor('sysItemRows', 'items', function(itr) { if (!draft.items || !draft.items.length) itr.appendChild(el('div', 'sys-empty', 'No items yet. Add the weapons, gear and explosives your characters carry. An item with a blast area can be thrown from the sheet.')); pickRows(itr, 'items', draft.items || [], itemRow); });
    charsDraw();   // 1.6.2 (backlog 59 f): the characters stand in a window of their own
    var note = ui('sysFeatureNote'); if (note) note.style.display = featureOn() ? 'none' : '';
    if (!_tabPress) patchErrors();
    rowFocusBack(was);
}
// [sysuicheck:rows-start]
// 1.6.2, a list beside one open: only the row picked is built. sysui.js keeps the list, and each builder is as it was
function pickModel(kind) {
    var nameOf = function(t) { return String(t || '').replace(/\s*\(?\{[^}]*\}\)?/g, '').trim(); };   // a roll's label may hold {a formula}
    // 1.6.3 (the improvement week's review of the System editor, finding 24): two fields or two lists of one name read alike in the list
    // beside the open row, so where a name is shared its short name follows it in brackets, as a field in a list of choices does
    var twinN = Object.create(null); draft.fields.forEach(function(f) { var w = f && f.label ? f.label : ''; if (w) twinN[w] = (twinN[w] || 0) + 1; });
    var nameTw = function(f) { var w = f.label || ''; return w && twinN[w] > 1 && f.key && f.key !== w ? w + ' (' + f.key + ')' : w; };
    if (kind === 'fields') return draft.fields.map(function(f) { return { id: f.id, key: f.key || '', name: nameTw(f), tag: KIND_LABEL[f.kind] || '', more: f.kind === 'formula' ? 'modifier secondary attribute derived stat formula' : '' }; });   // 1.6.2 (the owner: "Derived"): found by what a builder calls it
    if (kind === 'rolls') return draft.rolls.map(function(r) { return { id: r.id, name: nameOf(r.label), tag: Array.isArray(r.apply) ? 'Apply' : r.init ? 'Initiative' : r.dmg ? 'Damage' : 'Roll', more: typeof r.formula === 'string' ? r.formula : '' }; });
    if (kind === 'items') return (draft.items || []).map(function(it) { return { id: it.id, key: it.key || '', name: it.name || '', tag: it.category || '' }; });
    if (kind === 'lists') return draft.fields.filter(function(f) { return f.kind === 'item-list'; }).map(function(f) { return { id: f.id, key: f.key || '', name: nameTw(f), err: 'list:' + f.id }; });
    if (kind === 'effects') return (draft.effects || []).map(function(d) { return { id: d.id, name: d.name || '', tag: d.tone === 'buff' ? 'Buff' : d.tone === 'debuff' ? 'Debuff' : '' }; });
    return [];
}
function pickOne(kind, arr) { var U = window.wpSysUi; if (!U) return arr; var id = U.pickDraw(kind, pickModel(kind)); return arr.filter(function(x) { return x.id === id; }); }
function pickRows(box, kind, arr, build) { var U = window.wpSysUi; pickOne(kind, arr).forEach(function(x) { var r = build(x); box.appendChild(U ? U.arrange(r, kind) : r); }); }
function pickOpen(kind, id) { var U = window.wpSysUi, box = ui(U.paneOf(kind)); U.pickSet(kind, id); if (box) box.scrollTop = 0; _tabPress = true; try { renderAll(); } finally { _tabPress = false; } }
function pickMove(kind, id, toId, after) {
    var arr = kind === 'rolls' ? draft.rolls : kind === 'items' ? draft.items : kind === 'effects' ? draft.effects : draft.fields;
    if (window.wpSysUi.moveIn(arr, id, toId, after)) { markDirty(); renderAll(); }
}
// Where an error stands, and pressing it goes there: its tab, then its row or its topic, by what the layer holds
function errWhere(id) {
    var U = window.wpSysUi, one = function(arr) { return (arr || []).filter(function(x) { return x && x.id === id; })[0]; }, m = /^list:(.+)$/.exec(id), x;
    if (m) { x = (draft.fields || []).filter(function(f) { return f && f.id === m[1]; })[0]; return x ? { tab: 'lists', kind: 'lists', row: x.id, name: 'List ' + (x.label || x.key || '') } : null; }
    if ((x = one(draft.fields))) return { tab: 'fields', kind: 'fields', row: id, name: 'Field ' + (x.label || x.key || '') };
    if ((x = one(draft.rolls))) return { tab: 'rolls', kind: 'rolls', row: id, name: 'Roll ' + (x.label || '') };
    if ((x = one(draft.items))) return { tab: 'items', kind: 'items', row: id, name: 'Item ' + (x.name || '') };
    if ((x = one(draft.effects))) return { tab: 'effects', kind: 'effects', row: id, name: 'Effect ' + (x.name || '') };
    if (/^(?:plc|tablbl|grplbl):/.test(id)) { var lv = /^(?:plc|tablbl):(sheet|hud):/.exec(id); return lv ? { tab: 'layout', view: lv[1], name: 'Layout' } : { tab: 'layout', name: 'Layout' }; }   // 1.6.3: a tab's label and a band group's name stand in the Layout tab too. A place's or a tab label's fault names the Sheet or the HUD it stands on (the review of rules), since its box is drawn only while the Layout tab shows that one
    if (id === 'calendar') return { tab: 'calendar', name: 'Calendar' };
    var t = U && U.topicOf(id); return t ? { tab: t[0], set: t[0], topic: t[1], name: (t[0] === 'combat' ? 'Combat, ' : 'Rules, ') + U.topicName(t[0], t[1]) } : null;
}
function errGo(id) {
    var U = window.wpSysUi, p = errWhere(id); if (!p || !U) return;
    tabSet(p.tab); if (p.kind) U.pickSet(p.kind, p.row); if (p.topic) U.topicPress(p.set, p.topic);
    // 1.6.3 (the review of rules): a fault of the Layout tab that names the Sheet or the HUD switches the tab's own Sheet | HUD switch to it first, as a
    // press on that switch does (the preview forgets the tab it showed), so its box is drawn and the press lands on it. Asked through typeof, since a suite
    // runs this function alone
    if (p.view && typeof layoutViewSet === 'function' && (typeof layoutView === 'undefined' || layoutView !== p.view)) { layoutViewSet(p.view); var pvE = typeof ui === 'function' ? ui('sysLayoutPreview') : null; if (pvE && pvE.dataset) delete pvE.dataset.wpTab; }
    _tabPress = true; try { renderAll(); } finally { _tabPress = false; }
}
function errSay(e, warn) { return errPrefix(e && e.prop, warn) + (e && e.message ? (typeof plainMessage === 'function' ? plainMessage(draft, e.message) : e.message) : ''); }
// [sysuicheck:rows-end]
// [systemcheck:rowfocus-start]
// 1.6.0: what holds the focus in a row of the editor, by the row's own id and the list's or the box's own class, and the same control found in
// the rows drawn since. Found by comparing, so no id of a system file is ever put in a selector. A list's card or the Combat tab repeats its boxes, so there a
// control goes by its place among those of its class
function rowFocusOf(a) {
    var row = a && a.closest ? a.closest('#systemModal .sys-row') : null, cls = a && typeof a.className === 'string' ? a.className.split(' ').filter(function(c) { return c.indexOf('sys-') === 0; })[0] : '';
    var rid = row && row.dataset ? row.dataset.id || row.dataset.iid || row.dataset.eid : '', nthR = rid && cls ? Array.prototype.indexOf.call(row.querySelectorAll ? row.querySelectorAll('.' + cls) : [], a) : -1;   // 1.6.2: an item's and an effect's row too, and a control by its place among those of its class
    if (rid && cls) return nthR > 0 ? { id: rid, cls: cls, at: nthR } : { id: rid, cls: cls };
    var card = !row && cls ? a.closest('#systemModal .sys-list-card, #sysCombatBox, #sysRulesBox') : null, nth = card ? Array.prototype.indexOf.call(card.querySelectorAll('.' + cls), a) : -1;
    return nth >= 0 ? { lid: (card.dataset && card.dataset.lid) || '', cls: cls, nth: nth } : null;
}
function rowFocusBack(was) {
    if (!was) return;
    var rows = document.querySelectorAll(was.nth === undefined ? '#systemModal .sys-row' : '#systemModal .sys-list-card, #sysCombatBox, #sysRulesBox'), row = null, i;
    for (i = 0; i < rows.length && !row; i++) if (was.nth === undefined ? (rows[i].dataset.id || rows[i].dataset.iid || rows[i].dataset.eid) === was.id : (rows[i].dataset.lid || '') === was.lid) row = rows[i];
    var box = !row ? null : was.nth === undefined ? (was.at ? row.querySelectorAll('.' + was.cls)[was.at] : row.querySelector('.' + was.cls)) : row.querySelectorAll('.' + was.cls)[was.nth];
    if (box && box.focus) box.focus();
}
// [systemcheck:rowfocus-end]
function fieldOfRow(target) { var row = target.closest('.sys-row'); if (!row || row.dataset.cid || row.dataset.iid || row.dataset.eid) return null; return { row: row, f: draft.fields.find(function(x) { return x.id === row.dataset.id; }), r: draft.rolls.find(function(x) { return x.id === row.dataset.id; }) }; }
// 1.6.0 (v2, B4; a build session's sort, 2026-10-29: a trait tier's fixed kit, a species' free package rows, an implant's mandatory flaws):
// the rows a row of an item grants, each a line: the entry granted (an item of the system or a library entry), the list it is added to, how
// many, and the level of this item from which it is granted. What Save does with each is said under the item (refreshErrors). Values and text
// nodes only
// [systemcheck:grantbox-start]
function grantEntries() {
    var out = [], seen = Object.create(null), LBg = window.wpLibrary, cp = getActiveCampaign(), packs = cp && cp.library && Array.isArray(cp.library.packs) ? cp.library.packs : [];
    var put = function(x) { if (x && typeof x.id === 'string' && !seen[x.id] && out.length < 2000) { seen[x.id] = 1; out.push([x.id, (x.name || 'Item') + (x.vis === 'gm' ? ' (GM only)' : '')]); } };
    (draft.items || []).forEach(put);
    if (LBg && typeof LBg.entriesOf === 'function') packs.forEach(function(p) { if (p && typeof p.id === 'string') LBg.entriesOf(p.id).forEach(put); });
    return out.sort(function(a, b) { return a[1].localeCompare(b[1]); });
}
function grantName(id) {
    var it = (draft.items || []).find(function(x) { return x && x.id === id; }); if (it) return it.name || 'Item';
    var LBn = window.wpLibrary, le = LBn && typeof LBn.entry === 'function' ? LBn.entry(id) : null; return le && typeof le.name === 'string' ? le.name : '';
}
function grantListFor(id) {   // the list a new grant starts on: the first whose categories take the entry, else the first item list
    var lists = (draft.fields || []).filter(function(f) { return f && f.kind === 'item-list'; }), it = (draft.items || []).find(function(x) { return x && x.id === id; });
    var LBf = window.wpLibrary, e = it || (LBf && typeof LBf.entry === 'function' ? LBf.entry(id) : null), cg = e && typeof e.category === 'string' ? e.category.toLowerCase() : '';
    var hit = lists.filter(function(f) { return f.list && Array.isArray(f.list.cats) && f.list.cats.some(function(x) { return String(x).toLowerCase() === cg; }); })[0];
    return (hit || lists[0] || {}).id || '';
}
// 1.6.2 (body fold 1): what a grant may hang from: another grant of this item on its list that has a name, and what it names now though that is gone
function grantUpOpts(gs, gi) {
    var g = gs[gi], o = [['', 'Hangs from nothing']];
    gs.forEach(function(x, xi) { if (xi !== gi && x && typeof x === 'object' && x.list === g.list && typeof x.name === 'string' && x.name.trim()) o.push([x.name, 'Hangs from ' + x.name]); });
    if (typeof g.up === 'string' && g.up && !o.some(function(p) { return p[0] === g.up; })) o.push([g.up, 'Hangs from ' + g.up + ' (no such grant)']);
    return o;
}
// ... and where the focus goes once the tab is drawn again: a grant's name box, or the box of a stat it has just been given to set
function grantFocus(gi, sk) {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    Array.prototype.some.call(document.querySelectorAll('.sys-grant'), function(ln) { if (+ln.dataset.gi !== gi) return false; var sl = sk ? Array.prototype.filter.call(ln.querySelectorAll('.sys-grant-sline'), function(x) { return x.dataset.sk === sk; })[0] : null, c = sk ? (sl && sl.querySelector('input, select')) : ln.querySelector('.sys-grant-nm'); if (c && c.focus) c.focus(); return true; });
}
// [bodycheck:standsays-start]
// 1.6.2 (body fold 2): what Save does with a list's Rows stand at a row of, as the cleaner reads it (cs: the cleaned stand, or none), so that no formula quietly does nothing. okG: whether a formula reads no GM-only value
function standSays(st, cs, Fm, diceIn, okG) {
    var out = []; if (!st || typeof st !== 'object') return out;
    if (!cs) { out.push('Rows stand at a row of: that list is not there, so Save drops it.'); return out; }
    var bad = function(k, name, rest) {
        var t = typeof st[k] === 'string' ? st[k].trim() : ''; if (!t || cs[k]) return; var pz = null; try { pz = Fm.parse(t); } catch (e) { pz = null; }
        out.push(name + (!pz || !pz.ok ? ' is no formula Save can keep, so Save drops it.' : pz.ast && diceIn(pz.ast.body) ? ' rolls dice, and it is read with none, so Save drops it.' : ' reads a GM-only value, here or through what it reads. Your players\u2019 sheets must give the same figures as yours, so Save drops it.') + rest);
    };
    bad('fits', 'Fits where', ' A row then fits anywhere.'); bad('reach', 'Reaches', ' A row then covers only where it stands.'); bad('counts', 'Counts where', ' Every placed row then counts.');
    if (cs.fits && !okG(cs.fits)) out.push('Fits where reads a GM-only value, here or through what it reads, so your players\u2019 sheets keep none of it and their own moves are not refused by it. You are told when one breaks it.');
    return out;
}
// [bodycheck:standsays-end]
function grantBox(it) {
    var box = el('div', 'sys-fx-mods sys-grant-box'), gs = Array.isArray(it.grants) ? it.grants : [], lists = (draft.fields || []).filter(function(f) { return f && f.kind === 'item-list' && typeof f.id === 'string'; });
    box.appendChild(el('span', 'sys-note', 'Rows it grants, free, when a row of it is added or reaches a level:'));
    gs.forEach(function(g, gi) {
        if (!g || typeof g !== 'object') return;
        var ln = el('div', 'sys-fx-mod sys-grant'); ln.dataset.gi = String(gi);
        ln.appendChild(el('span', 'sys-grant-name', grantName(g.entry) || 'An entry that is not here'));
        var lo = lists.map(function(f) { return [f.id, 'On ' + (f.label || f.key || 'a list')]; });
        if (!g.list) lo.unshift(['', 'Pick a list']); else if (!lists.some(function(f) { return f.id === g.list; })) lo.push([g.list, 'On a list that is gone']);
        ln.appendChild(select('sys-grant-list', lo, g.list || '', 'The list it is added to'));
        ln.appendChild(numField('sys-grant-qty', typeof g.qty === 'number' ? g.qty : 1, 'How many it adds', 'how many', '1'));
        ln.appendChild(numField('sys-grant-from', typeof g.from === 'number' ? g.from : '', 'The level of this item from which it is granted. Blank: from the start', 'from level', 'any'));
        ln.appendChild(numField('sys-grant-lvl', typeof g.lvl === 'number' ? g.lvl : '', 'The level the row it grants starts at, held to that list\u2019s level rules. Blank: the entry\u2019s own', 'level', 'any'));   // 1.6.0: the level it grants at
        var gsI = el('input', 'field sys-grant-spec'); gsI.type = 'text'; gsI.value = typeof g.spec === 'string' ? g.spec : ''; gsI.placeholder = 'specifier'; gsI.spellcheck = false; gsI.autocomplete = 'off'; gsI.title = 'A specifier for the row it grants, such as Smell or Heat: the row is named for it, and a grant of the same entry with another specifier adds a row of its own. Blank: none'; ln.appendChild(gsI);   // 1.6.0 Specialties
        var gmr = el('div', 'sys-grant-more');   // 1.6.2 (body fold 1): what it names, on a line of its own under its boxes
        var gnI = el('input', 'field sys-grant-nm'); gnI.type = 'text'; gnI.value = typeof g.name === 'string' ? g.name : ''; gnI.placeholder = 'its own name'; gnI.spellcheck = false; gnI.autocomplete = 'off'; gnI.title = 'A name for the row it grants in place of the entry\u2019s, such as Left Hand. Two grants of one entry with different names add a row each. Blank: the entry\u2019s name'; if (typeof g.spec === 'string' && g.spec) gnI.disabled = true; gmr.appendChild(gnI);   // 1.6.2 (body fold 1)
        var glF = lists.filter(function(f) { return f.id === g.list; })[0], upO = grantUpOpts(gs, gi);
        if ((glF && glF.list && glF.list.hang === true) || g.up) gmr.appendChild(select('sys-grant-up', upO, typeof g.up === 'string' ? g.up : '', 'The row of this list it stands under, by the name another grant here gives it'));
        var gsS = glF && glF.list && Array.isArray(glF.list.stats) ? glF.list.stats.filter(function(s) { return s && typeof s.key === 'string' && s.key && s.set !== true; }) : [], gsV = g.stats && typeof g.stats === 'object' ? g.stats : {};
        Object.keys(gsV).forEach(function(k) {
            var sd = gsS.filter(function(s) { return s.key.toLowerCase() === k.toLowerCase(); })[0], sl = el('span', 'sys-grant-sline'); sl.dataset.sk = k; sl.appendChild(el('span', 'sys-note', sd ? (sd.label || sd.key) : k + ' (not a stat of this list)'));
            if (sd && sd.kind === 'pick') sl.appendChild(select('sys-grant-spick', (Array.isArray(sd.opts) ? sd.opts : []).filter(function(o) { return o && typeof o.label === 'string'; }).map(function(o) { return [o.label, o.label]; }), String(gsV[k]), 'What it sets this stat to')); else sl.appendChild(numField('sys-grant-sval', typeof gsV[k] === 'number' ? gsV[k] : 0, 'What it sets this stat to', 'sets to', 'any'));
            sl.appendChild(btnRow([['grantsdel', 'It no longer sets this', '&times;']])); gmr.appendChild(sl);
        });
        if (gsS.some(function(s) { return !Object.keys(gsV).some(function(k) { return k.toLowerCase() === s.key.toLowerCase(); }); })) gmr.appendChild(select('sys-grant-stat', [['', '+ Sets a stat\u2026']].concat(gsS.filter(function(s) { return !Object.keys(gsV).some(function(k) { return k.toLowerCase() === s.key.toLowerCase(); }); }).map(function(s) { return [s.key, s.label || s.key]; })), '', 'Sets a stat of the row it grants, in place of the entry\u2019s'));
        if (typeof checkLabel === 'function') ln.appendChild(checkLabel('sys-grant-once', g.once === true, 'Once a character', 'Granted only where the character holds no row of it on that list yet, as an implant\u2019s mandatory flaw comes with the first implant. While another row that grants it is left, it stays when this row goes'));   // 1.6.0 (CORE gap 15)
        if (typeof checkLabel === 'function') ln.appendChild(checkLabel('sys-grant-pay', g.pay === true, 'Pays back', 'The row it grants is marked as paying back, so a cost can count it as bought though it came free. Another row may grant the same entry without it'));   // 1.6.0: Pays back
        ln.appendChild(btnRow([['grantdel', 'It no longer grants this', '&times;']]));
        ln.appendChild(gmr);
        box.appendChild(ln);
    });
    if (gs.length < GRANT_MAX) { var ad = select('sys-grant-add', [['', '+ Grants\u2026']].concat(grantEntries().filter(function(o) { return o[0] !== it.id; })), '', lists.length ? 'Pick an entry a row of this item grants' : 'Add an item list first'); if (!lists.length) ad.disabled = true; box.appendChild(ad); }
    return box;
}
// What Save does with an item's grants, as the cleaner reads them: { drop: [...], warn: [...] } in words
function grantSays(it) {
    var out = { drop: [], warn: [] }; if (!it || !Array.isArray(it.grants)) return out;
    var lids = Object.create(null), seen = Object.create(null), n = 0, LBw = window.wpLibrary, whole = !!(LBw && typeof LBw.whole === 'function' && LBw.whole() === true);
    (draft.fields || []).forEach(function(f) { if (f && f.kind === 'item-list') lids[f.id] = 1; });
    it.grants.forEach(function(g, gi) {
        if (!g || typeof g !== 'object') return; var w = 'Grant ' + (gi + 1) + ': ';
        if (!g.list || lids[g.list] !== 1) { out.drop.push(w + (g.list ? 'its list is gone' : 'it needs a list') + ', so Save drops it.'); return; }
        if (g.entry === it.id) { out.drop.push(w + 'an item cannot grant itself, so Save drops it.'); return; }
        var fr = typeof g.from === 'number' && isFinite(g.from) ? g.from : '', k = g.list + '|' + g.entry + '|' + fr + '|' + String(g.spec || g.name || '').trim().toLowerCase(); if (seen[k]) { out.drop.push(w + 'it repeats grant ' + seen[k] + ', so Save drops it.'); return; } seen[k] = gi + 1;
        if (++n > GRANT_MAX) { out.drop.push(w + 'an item grants ' + GRANT_MAX + ' at most, so Save drops it.'); return; }
        var q = typeof g.qty === 'number' && isFinite(g.qty) ? Math.round(g.qty) : 1; if (g.qty !== undefined && (q < 1 || q > LIMITS.maxQty || q !== g.qty)) out.warn.push(w + 'how many is a whole number from 1 to ' + LIMITS.maxQty + ', so Save keeps ' + Math.max(1, Math.min(LIMITS.maxQty, q || 1)) + '.');
        if (typeof g.lvl === 'number' && isFinite(g.lvl)) { var glF = (draft.fields || []).find(function(f) { return f && f.id === g.list; }); if (!(glF && glF.list && glF.list.lvl && typeof glF.list.lvl === 'object')) out.warn.push(w + 'its list has no level, so its Level does nothing.'); }   // 1.6.0
        if (typeof g.up === 'string' && g.up) { var upL = (draft.fields || []).find(function(f) { return f && f.id === g.list; }); if (!it.grants.some(function(x) { return x && x !== g && typeof x.name === 'string' && x.name.trim().toLowerCase() === g.up.trim().toLowerCase(); })) out.warn.push(w + 'no other grant here has the name ' + g.up + ', so Save drops its Hangs from.'); else if (!(upL && upL.list && upL.list.hang === true)) out.warn.push(w + 'its list does not hang rows, so its Hangs from does nothing. Tick Rows hang from a row on the list.'); }   // 1.6.2 (body fold 1)
        if (!grantName(g.entry) && (whole || !(LBw && typeof LBw.entry === 'function'))) out.warn.push(w + 'that entry is gone, so it grants nothing until it is back.');
    });
    return out;
}
// [systemcheck:grantbox-end]
// 1.6.0: what Save does with an item's Levels it may be and its changes' By level boxes, as the cleaner itself reads them
function lvlBoxSays(it) {
    var out = []; if (!it || typeof it !== 'object') return out;
    if (typeof it.lvlOnly === 'string') lvlOnlyRead(it.lvlOnly).bad.forEach(function(b) { out.push('Levels it may be: Save drops “' + b + '”. Write a level, a named level, or a run such as 3 to 5, at most ' + LIMITS.lvlOnly + ' of them.'); });
    (Array.isArray(it.mods) ? it.mods : []).forEach(function(m, mi) {
        if (!m || typeof m !== 'object' || m.tiers === undefined) return; var rd = modTiersRead(m.tiers), w = 'Change ' + (mi + 1) + ', Figure by level: ';
        rd.bad.forEach(function(b) { out.push(w + 'Save drops “' + b + '”. Write each as 2: +1, each level once, at most ' + LIMITS.modTiers + ' of them.'); });
        if (rd.tiers && m.lvl === true) out.push(w + 'it takes the place of per level, so Save drops that tick.');
    });
    return out;
}
function itemOfRow(target) { var row = target.closest && target.closest('.sys-item-row'); if (!row) return null; return (draft.items || []).find(function(x) { return x.id === row.dataset.iid; }) || null; }
// 1.6.2 (the owner: no key a user reads or types, ever): a name box is the only box a builder needs. The short name beside it stands out of sight, fills itself in from the name while it is new, and stays what it is once saved, so that a rename breaks nothing. The System editor's foot has a tick that shows them. A key that names ANOTHER thing is a different matter: it wants a pick
var KEY_FOLLOW = { 'sys-list-statlabel': ['sys-list-statkey', '.sys-list-stat', 1], 'sys-list-collabel': ['sys-list-colkey', '.sys-list-col', 1], 'sys-list-ctlabel': ['sys-list-ctkey', '.sys-list-ct', 1], 'sys-env-label': ['sys-env-key', '.sys-env-row'], 'sys-tbl-label': ['sys-tbl-key', '.sys-tbl-head'], 'sys-tbl-clabel': ['sys-tbl-ckey', 'th'], 'sys-tbl-rlabel': ['sys-tbl-rkey', 'tr'], 'sys-link-label': ['sys-link-key', '.sys-link-row'], 'sys-dmgr-ylabel': ['sys-dmgr-ykey', '.sys-dmgr-type'], 'sys-dmgr-klabel': ['sys-dmgr-kkey', '.sys-dmgr-kind'] };
// [systemcheck:autobox-start]
// 1.6.2 (auto apply): a field's two options, its own listeners (the Fields tab's dispatcher never hears them) and classes no handler there reads.
// Worked out until typed: a form whose figure the field reads while nothing is typed. Typing it fills: rows of another number, toggle, height or weight
// and a form for what is written there once this is typed, only where that field is blank or still holds what a fill wrote. A height reads and is written
// in inches, a weight in pounds, and a toggle is on where its form gives a figure other than 0
function autoBox(f) {
    var box = el('div', 'sys-wout-box'), ch = function(re) { markDirty(); if (re && typeof renderAll === 'function') renderAll(); else if (typeof patchErrors === 'function') patchErrors(); }, stop = function(ev) { ev.stopPropagation(); };
    var meas = f.kind === 'text', tog = f.kind === 'toggle', inp = input(tog ? 'sys-wout-on field' : 'sys-wout field', typeof f.auto === 'string' ? f.auto : '', tog ? 'While nobody has set it, it is on where this gives a figure other than 0, such as Size >= 3. Once someone sets it, theirs stays. Empty: nothing is worked out' : 'What it reads until someone types a figure' + (meas ? (f.unit === 'height' ? ', in inches' : ', in pounds') : '') + '. Once someone types one, theirs stays. Empty: nothing is worked out', 'none');
    inp.maxLength = LIMITS.formula; box.appendChild(capInline(inp, tog ? 'Worked out until set: ' : 'Worked out until typed: '));
    var setA = function(ev) { stop(ev); var v = inp.value.trim(); if (v) f.auto = v.slice(0, LIMITS.formula); else delete f.auto; ch(false); };
    inp.addEventListener('input', setA); inp.addEventListener('change', setA);
    var fl = Array.isArray(f.fills) ? f.fills : [], all = draft && Array.isArray(draft.fields) ? draft.fields : [];
    var tgs = all.filter(function(x) { return !!x && x !== f && typeof x.id === 'string' && (x.kind === 'number' || x.kind === 'toggle' || (x.kind === 'text' && (x.unit === 'height' || x.unit === 'weight'))); });
    fl.forEach(function(row, i) {
        var rw = el('div', 'sys-flags sys-tfill-row'), sel = el('select', 'field sys-tfill-to'), h0 = el('option', null, 'Pick a field\u2026'); h0.value = ''; sel.appendChild(h0);
        tgs.forEach(function(x) { var op = el('option', null, fieldWord(x) + (x.kind === 'text' ? (x.unit === 'height' ? ' (inches)' : ' (pounds)') : x.kind === 'toggle' ? ' (on where not 0)' : '')); op.value = x.id; if (x.id === row.f) op.selected = true; sel.appendChild(op); });
        if (row.f && !tgs.some(function(x) { return x.id === row.f; })) { var gone = el('option', null, 'A field that is gone'); gone.value = row.f; gone.selected = true; sel.appendChild(gone); }
        sel.title = 'The field this fills in'; sel.addEventListener('change', function(ev) { stop(ev); row.f = sel.value; ch(false); }); sel.addEventListener('input', stop);
        var fi = input('sys-tfill-f field', typeof row.formula === 'string' ? row.formula : '', 'What it writes there once this is typed, worked out from the sheet. It writes only where that field is blank or still holds a figure a fill wrote, never one someone typed', 'Amount');
        fi.maxLength = LIMITS.formula; var setF = function(ev) { stop(ev); row.formula = fi.value.slice(0, LIMITS.formula); ch(false); }; fi.addEventListener('input', setF); fi.addEventListener('change', setF);
        var rm = el('button', 'tool ghost sys-btn sys-tfill-rm', '\u00d7'); rm.type = 'button'; rm.title = 'It no longer fills this'; rm.addEventListener('click', function(ev) { stop(ev); fl.splice(i, 1); if (!fl.length) delete f.fills; ch(true); });
        rw.appendChild(el('span', 'sys-num-cap', i ? 'and' : 'Typing it fills')); rw.appendChild(sel); rw.appendChild(fi); rw.appendChild(rm); box.appendChild(rw);
    });
    var cap = window.wpSystemCore && window.wpSystemCore.AUTO_FILLS || 4, add = el('button', 'tool ghost sys-btn sys-tfill-add', '+ Typing it fills');
    add.type = 'button'; add.disabled = fl.length >= cap || !tgs.length; add.title = !tgs.length ? 'There is no other number, toggle, height or weight to fill' : fl.length >= cap ? 'At most ' + cap + ' fields' : 'Another field this one fills in when someone types it';
    add.addEventListener('click', function(ev) { stop(ev); if (add.disabled) return; (f.fills = Array.isArray(f.fills) ? f.fills : []).push({ f: tgs[0].id, formula: '' }); ch(true); });
    box.appendChild(add);
    return box;
}
// [systemcheck:autobox-end]
function fieldWord(f) {   // a field in a list of fields: its name, and the short form only where two fields share one
    var nm = f.label || f.key || '(field)', twin = (draft && Array.isArray(draft.fields) ? draft.fields : []).some(function(o) { return o !== f && !!o && (o.label || o.key) === nm; });
    return twin && f.key && f.label ? nm + ' (' + f.key + ')' : nm;
}
function keyWord(label) { return String(label || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/ +/).map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join('').replace(/^[0-9]+/, '').slice(0, 24); }
function keyBoxFollow(t) {
    var cs = t && t.classList, pair = null; if (!cs || typeof t.closest !== 'function') return; Object.keys(KEY_FOLLOW).forEach(function(k) { if (cs.contains(k)) pair = KEY_FOLLOW[k]; }); if (!pair) return;
    var row = t.closest(pair[1]), kb = row && row.querySelector ? row.querySelector('.' + pair[0]) : null; if (!kb || (kb.value && kb.dataset.follow !== '1')) return;
    var word = keyWord(t.value), scope = row.parentNode, taken = {}; if (scope && scope.querySelectorAll) Array.prototype.forEach.call(scope.querySelectorAll('.' + pair[0]), function(o) { if (o !== kb && o.value) taken[o.value.toLowerCase()] = 1; });
    if (word && pair[2] && !statKey(word, F())) word = (word + 'Stat').slice(0, 24); var outW = word, n = 2; while (outW && taken[outW.toLowerCase()]) outW = word + (n++);
    kb.value = outW; kb.dataset.follow = '1'; kb.dispatchEvent(new Event('input', { bubbles: true }));
}
function entryNames(sys, listId) {   // [key, name] of what a list's rows may be, as far as this editor holds them
    var f = ((sys && sys.fields) || []).filter(function(x) { return !!x && x.id === listId && x.kind === 'item-list' && x.list; })[0], cats = f && Array.isArray(f.list.cats) && f.list.cats.length ? f.list.cats.map(function(s) { return String(s).toLowerCase(); }) : null, seen = Object.create(null), out = [];
    ((sys && sys.items) || []).concat((sys && sys.core) || []).forEach(function(e) { if (!e || typeof e.key !== 'string' || !e.key || seen[e.key] || (cats && cats.indexOf(String(e.category || '').toLowerCase()) < 0)) return; seen[e.key] = 1; out.push([e.key, e.name || e.key]); });
    return out.sort(function(a, b) { return a[1].localeCompare(b[1]); });
}
function entryPick(inp, opts, blank) {   // the box stays, out of sight, and a pick writes it as typing would. Another entry shows it, for an entry of a pack
    var w = el('span', 'sys-entry'), cur = String(inp.value || ''), has = opts.some(function(o) { return o[0] === cur; }), rows = [['', blank]].concat(opts).concat([['?', 'Another entry\u2026']]), s = select('sys-entrypick', rows, !cur || has ? cur : '?', 'Which entry');
    var show = function(on) { if (inp.style) inp.style.display = on ? '' : 'none'; }; show(!!cur && !has); w.appendChild(s); w.appendChild(inp);
    if (s.addEventListener) s.addEventListener('change', function() { if (s.value === '?') { show(true); if (inp.focus) inp.focus(); return; } show(false); inp.value = s.value; ['input', 'change'].forEach(function(n) { inp.dispatchEvent(new Event(n, { bubbles: true })); }); });
    return w;
}
// 1.6.3 (Fulllion's rulings of 2026-11-20: "it makes sense to have fields be required when other fields depend on them", and "none isn't a good
// default substitution"): the words a refusal says, beside each needs box of the Lists tab. NEEDS_WORDS names, by the needs box's class, the words
// box beside it, the row the two stand in and the words that box starts with. needsWordsFollow is asked by onInput right after a needs box has
// changed the draft object o (the switch, the load, the chamber or a list roll): where the needs were empty before (was) and now hold a formula,
// and the words are empty, the words start filled, in the draft and in the box beside it (onInput draws nothing again). Where the needs are
// emptied while the words are still the very ones it filled, the words go too, so Save is left no words with no needs to drop. Words typed by
// hand are never touched. An emptied words box is said under its list, as a fault of the System editor, and a player is then told only Not now
var STAND_OFF_WORD = 'Not worn';   // 1.6.3: what Rows stand at a row of's Otherwise it says starts with (sheets.js shows the same word where a saved list has none)
var PART_FIT_WORDS = 'That part does not fit there.';   // 1.6.3: what Fits where's Refused with, and a further rule's, start with (the box of further rules in sysedbox.js keeps its own copy of these words)
var NEEDS_WORDS = { 'sys-list-swneeds': ['sys-list-swwords', '.sys-list-on', 'This cannot be switched on now.'], 'sys-list-loadneeds': ['sys-list-loadneedstext', '.sys-list-load', 'This cannot load now.'],
    'sys-list-chamberneeds': ['sys-list-chamberneedstext', '.sys-list-chamber', 'This cannot take a round now.'], 'sys-list-needs': ['sys-list-needstext', '.sys-list-needsrow', 'This cannot be used now.'] };
// 1.6.3: the keys of the row figures a list roll's Rolls by may be made with, in the order the Lists tab's with list offers them: the list's number
// stats (neither a choice nor text), then its columns. The same filter as the list's own card draws (sysedlist.js, the with list beside Rolls by), so a
// test picked starts on the very first figure that list shows, and the formula is written at once
function listRollFigs(sp) {
    var o = sp && typeof sp === 'object' ? sp : {};
    return (Array.isArray(o.stats) ? o.stats : []).filter(function(s) { return s && typeof s.key === 'string' && s.kind !== 'pick' && s.kind !== 'text'; }).map(function(s) { return s.key; })
        .concat((Array.isArray(o.cols) ? o.cols : []).filter(function(c0) { return c0 && typeof c0.key === 'string'; }).map(function(c0) { return c0.key; }));
}
function needsWordsFollow(o, was, t, cls) {
    var w = NEEDS_WORDS[cls]; if (!w || !o || typeof o !== 'object') return;
    var now = typeof o.needs === 'string' && !!o.needs.trim(), txt = typeof o.needsText === 'string' ? o.needsText : '';
    if (now && !was && !txt.trim()) o.needsText = w[2];
    else if (!now && txt === w[2]) delete o.needsText;
    else return;
    var rw = t && t.closest ? t.closest(w[1]) : null, bx = rw && rw.querySelector ? rw.querySelector('.' + w[0]) : null; if (bx) bx.value = o.needsText || '';
}
// [sysedcheck:allorwait-start]
// 1.6.3 (the improvement week's review of the System editor, finding 10): a few boxes draw the tab again as they first get a value (Taken from, Locked
// while, a crossing's step), since another box comes with it. Where that box wears a form (formbox.js) whose every step says its input, the redraw
// took the open form away after its first step. So while a form is open the redraw waits for the box's change, which the form says as it is put
// away with something built, and is then made once. With no form open it is made at once, as before
function allOrWait(t) {
    var FB = typeof window !== 'undefined' ? window.wpFormBox : null;
    if (FB && FB.isOpen && FB.isOpen() && t && t.addEventListener) {
        if (!t._wpRedrawWait) { t._wpRedrawWait = true; var once = function() { t.removeEventListener('change', once); t._wpRedrawWait = false; if (draft) renderAll(); }; t.addEventListener('change', once); }
        return false;
    }
    renderAll(); return true;
}
// [sysedcheck:allorwait-end]
// [sysedcheck:kindkeep-start]
// 1.6.3 (finding 6): changing a field's Kind, or a roll from Roll to Apply, took away what the old kind used (a formula, options, a base, the
// changes of an action) at once, so a stray pick, or the next kind tried, lost them for good. What the old kind used is put aside here, in this
// editor's memory and never in the draft (so Save and the check see the field as its kind has it), and comes back when that kind is picked again
var FIELD_KEEP = ['formula', 'maxFormula', 'base', 'options', 'def', 'unit', 'unitShow', 'decMin', 'decMax', 'group', 'round', 'roundTo', 'roundAt'], ROLL_KEEP = ['apply', 'round', 'each', 'by', 'init'], _kindKept = new WeakMap();
function kindKeep(o, kind, props) { if (!o || typeof o !== 'object') return; var m = _kindKept.get(o) || {}, k = {}; props.forEach(function(p) { if (o[p] !== undefined) k[p] = JSON.parse(JSON.stringify(o[p])); }); m[kind] = k; _kindKept.set(o, m); }
function kindBack(o, kind, props) { var m = o && typeof o === 'object' ? _kindKept.get(o) : null, k = m ? m[kind] : null; if (!k) return false; props.forEach(function(p) { if (k[p] !== undefined) o[p] = JSON.parse(JSON.stringify(k[p])); }); return true; }
// [sysedcheck:kindkeep-end]
function onInput(e) {
    if (!draft) return;
    var t = e.target; keyBoxFollow(t); if (onLayoutInput(t)) return;
    if (onSwInput(t)) return;   // 1.6.0: an item's or an effect's roll bonuses
    if (onTurnInput(t)) return;   // turn-based combat T1
    if (onLightInput(t)) return;   // lighting L4
    if (onSensesInput(t)) return;   // senses S2a
    if (onRangeInput(t)) return;   // range penalties R1
    if (onPostureInput(t)) return;   // conditions C3
    if (onInitInput(t)) return;   // initiative O2
    if (onBudgetInput(t)) return;   // 126: the Lists tab's point budgets
    if (onEnvInput(t)) return;   // 1.6.0: the Environment readings
    if (onTableInput(t)) return;   // 1.6.0: the Tables box
    if (onLinkInput(t)) return;   // 1.6.0: the Linked sheets
    if (onHeightInput(t)) return;   // item 19 H2
    if (onCalendarInput(t)) return;   // item 20 K1
    if (onDamageInput(t)) return;   // 1.5.6: the Taking damage box
    if (typeof onBlastInput === 'function' && onBlastInput(t)) return;   // 1.5.8 explosives
    if (typeof onAreaEdit === 'function' && onAreaEdit(t, true)) return;   // 1.6.0: a line a roll hits
    if (typeof coverHitInput === 'function' && coverHitInput(t)) return;   // 1.6.0: where a hit behind cover lands
    if (onChecksInput(t)) return;   // 1.6.0: the critical range and a named success
    if (typeof onHoldInput === 'function' && onHoldInput(t)) return;   // 1.6.0 Who holds whom
    var fxd = fxOfRow(t);   // 5h: a library effect's text boxes
    if (fxd) {
        var fc = t.className || '';
        if (fc.indexOf('sys-apply-formula') >= 0 && t.closest && t.closest('.sys-fx-endrow')) { var chIe = applyChangeOf(t, fxd); if (chIe) { chIe.formula = t.value.slice(0, LIMITS.formula); markDirty(); patchErrors(); } return; }   // 1.6.2: an effect's end, its amount
        if (fc.indexOf('sys-fx-name') >= 0) fxd.name = t.value.slice(0, LIMITS.name);
        else if (fc.indexOf('sys-fx-icon') >= 0) fxd.icon = t.value.slice(0, 32);
        else if (fc.indexOf('sys-fx-dur') >= 0) fxd.dur = t.value.slice(0, 200);
        else if (fc.indexOf('sys-fx-endgroup') >= 0) { var egV = t.value.trim().slice(0, 24), egHad = !!fxd.endGroup; if (egV) fxd.endGroup = egV; else { delete fxd.endGroup; delete fxd.endRank; } if (egHad !== !!egV) { markDirty(); renderAll(); return; } }   // 1.6.0 Shares an end: Rank stands beside a word
        else if (fc.indexOf('sys-fxv-start') >= 0) { var fvS = Math.round(Number(t.value)); if (fxd.val) fxd.val.start = fvS >= 1 ? fvS : 1; }   // 1.6.2
        else if (fc.indexOf('sys-fxv-by') >= 0) { var fvB = Math.round(Number(t.value)); if (fxd.val) { if (t.value !== '' && fvB >= 1) { fxd.val.by = fvB; if (!fxd.val.each) fxd.val.each = 'turn'; } else { delete fxd.val.by; delete fxd.val.each; } } }
        else if (fc.indexOf('sys-fx-endrank') >= 0) { var erV = parseFloat(t.value); if (isFinite(erV)) fxd.endRank = erV; else delete fxd.endRank; }
        else if (fc.indexOf('sys-fx-notes') >= 0) fxd.notes = t.value.slice(0, LIMITS.noteText);
        else if (fc.indexOf('sys-fx-auto') >= 0) { var auV = t.value.slice(0, LIMITS.formula); if (auV.trim()) fxd.auto = auV; else delete fxd.auto; }   // conditions C4: the automatic formula (emptied: the key goes)
        else if (fc.indexOf('sys-fx-stack') >= 0) { var mlnS = t.closest('.sys-fx-mod'), mmS = mlnS ? (fxd.mods || [])[+mlnS.dataset.mi] : null; if (mmS) { if (t.value.trim()) mmS.stack = t.value.slice(0, 24); else delete mmS.stack; } }   // 1.6.2 Doesn't stack
        else if (fc.indexOf('sys-fx-amtf') >= 0) { var mlnF = t.closest('.sys-fx-mod'), mmF = mlnF ? (fxd.mods || [])[+mlnF.dataset.mi] : null; if (mmF) { var vfV = t.value.slice(0, LIMITS.formula); if (vfV.trim()) { mmF.vf = vfV; mmF.v = 0; } else delete mmF.vf; var amN = mlnF.querySelector('.sys-fx-amt'); if (amN) amN.disabled = !!vfV.trim(); } }   // 1.6.0 (CORE gap 12): the amount by a formula (emptied: the number again)
        else if (fc.indexOf('sys-fx-amt') >= 0) { var mln = t.closest('.sys-fx-mod'), mm = mln ? (fxd.mods || [])[+mln.dataset.mi] : null; if (mm) mm.v = t.value === '' ? 0 : Number(t.value); }
        else if (fc.indexOf('sys-fx-mkey') >= 0) { var kln = t.closest('.sys-fx-mod'), km = kln ? (fxd.mods || [])[+kln.dataset.mi] : null; if (km) km.key = t.value.trim().slice(0, 40); }   // 1.5.8
        else return;
        markDirty(); patchErrors(); return;
    }
    var it = itemOfRow(t);
    if (it) {
        var ic = t.className || '';
        if (ic.indexOf('sys-item-name') >= 0) it.name = t.value.slice(0, LIMITS.itemName);
        else if (ic.indexOf('sys-item-cat') >= 0) it.category = t.value.slice(0, LIMITS.category);
        else if (ic.indexOf('sys-item-ft') >= 0) { if (it.area) it.area.ft = t.value === '' ? 0 : Number(t.value); }
        else if (ic.indexOf('sys-item-aloc') >= 0) { if (it.area) { if (t.value.trim()) it.area.loc = t.value.slice(0, 60); else delete it.area.loc; } }   // 1.6.2 (11)
        else if (ic.indexOf('sys-item-aad') >= 0) { if (it.area) { var adI = Number(t.value); if (t.value !== '' && isFinite(adI) && adI > 0) it.area.ad = adI; else delete it.area.ad; } }   // 1.5.8 explosives
        else if (ic.indexOf('sys-item-atrig') >= 0) { if (it.area) { var tgv = Number(t.value); if (t.value !== '' && isFinite(tgv) && tgv > 0) it.area.trig = tgv; else delete it.area.trig; } }   // 1.5.8 explosives
        else if (/(^| )sys-cloud-(n|r)( |$)/.test(ic)) { var clI = it.area && it.area.cloud && typeof it.area.cloud === 'object' ? it.area.cloud : null; if (!clI) return; if (/sys-cloud-n/.test(ic)) { var clN = String(t.value).slice(0, LIMITS.formula); if (clN.trim()) { clI.n = clN; if (!clI.u) clI.u = 'turns'; } else delete clI.n; } else { var clR = Number(t.value); if (t.value !== '' && isFinite(clR) && clR > 0) clI.r = clR; else delete clI.r; } }   // 1.6.2: the cloud it leaves (Save cleans it)
        else if (/(^| )sys-fly-(speed|rounds|hp|pro|size)( |$)/.test(ic)) { if (!it.flies || typeof it.flies !== 'object') return; var flK = /sys-fly-(speed|rounds|hp|pro|size)/.exec(ic)[1]; if (flK === 'speed') it.flies.speed = String(t.value).slice(0, LIMITS.formula); else { var flN = Number(t.value); if (t.value !== '' && isFinite(flN)) it.flies[flK] = flN; else delete it.flies[flK]; } }   // 1.6.2 (vehicles, fold (d)): Save cleans them
        else if (ic.indexOf('sys-item-damage') >= 0) { it.damage = t.value; affSaysAt(t, it, null); }   // 1.6.3: an affliction that reaches those it hurts needs the item's Damage, so each says again what it does
        else if (/(^| )sys-item-afrag( |$)/.test(ic)) { if (!it.area) return; if (t.value.trim()) it.area.frag = t.value.slice(0, LIMITS.formula); else { delete it.area.frag; delete it.area.fragType; } }   // 1.5.9 (es): its fragmentation (Save cleans it, the validator reads it)
        else if (/(^| )sys-item-aff(vs|needs|lasts)( |$)/.test(ic)) {   // 1.5.9 (es): an affliction's three formulas (Save cleans them, the validator reads them), and what Save does with it said at once
            var afI = affOfRow(t, it); if (!afI) return; var kI = /sys-item-aff(vs|needs|lasts)/.exec(ic)[1], vI = String(t.value).slice(0, LIMITS.formula);
            if (kI === 'vs') afI.a.vs = vI; else if (kI === 'needs') { if (vI.trim()) afI.a.needs = vI; else delete afI.a.needs; }
            else if (vI.trim()) { var luI = afI.ln.querySelector('.sys-item-affunit'); afI.a.lasts = { n: vI, u: afI.a.lasts && afI.a.lasts.u ? afI.a.lasts.u : (luI && luI.value) || 'minutes' }; } else delete afI.a.lasts;
            affSaysAt(t, it, afI.a);
        }
        else if (ic.indexOf('sys-item-cost') >= 0) it.cost = t.value;
        else if (ic.indexOf('sys-item-throw') >= 0) it.throwSkill = t.value.trim();
        else if (ic.indexOf('sys-item-pic') >= 0) { if (t.value) it.pic = t.value.slice(0, 320); else delete it.pic; }   // 1.6.2 (backlog 42): Save keeps it only as one of the campaign's pictures
        else if (ic.indexOf('sys-item-icon') >= 0) it.icon = t.value.slice(0, 32);   // Save keeps an emoji's first 8 code points, or a bundled icon's name
        else if (ic.indexOf('sys-item-notes') >= 0) it.notes = t.value.slice(0, LIMITS.noteText);
        else if (ic.indexOf('sys-item-rmtext') >= 0) it.rmMsg = t.value.slice(0, LIMITS.rmMsg);   // Stage 6
        else if (ic.indexOf('sys-item-eqtext') >= 0) it.eqMsg = t.value.slice(0, LIMITS.rmMsg);   // F4b
        else if (ic.indexOf('sys-item-key') >= 0) { var ikv = t.value.trim().slice(0, 40); if (ikv) it.key = ikv; else delete it.key; }
        else if (ic.indexOf('sys-item-lvl') >= 0) { if (String(t.value).trim() === '') delete it.lvl; else it.lvl = Number(t.value); }
        else if (ic.indexOf('sys-item-only') >= 0) { if (String(t.value).trim() === '') delete it.lvlOnly; else it.lvlOnly = t.value.slice(0, 400); }   // 1.6.0: as typed, which the cleaner reads at Save (lvlBoxSays says what it drops)
        else if (/(^| )sys-grant-nm( |$)/.test(ic)) { var glN = t.closest('.sys-grant'), gN = glN && Array.isArray(it.grants) ? it.grants[+glN.dataset.gi] : null; if (!gN) return; var nV = String(t.value || '').trim().slice(0, LIMITS.itemName), nO = typeof gN.name === 'string' ? gN.name : ''; if (nV) gN.name = nV; else delete gN.name; if (nO) it.grants.forEach(function(x) { if (x && x.up === nO) { if (nV) x.up = nV; else delete x.up; } }); }   // 1.6.2 (body fold 1): a grant's own name, and a Hangs from that names it follows
        else if (/(^| )sys-grant-sval( |$)/.test(ic)) { var glV = t.closest('.sys-grant'), slV = t.closest('.sys-grant-sline'), gV = glV && Array.isArray(it.grants) ? it.grants[+glV.dataset.gi] : null, skV = slV ? slV.dataset.sk : ''; if (!gV || !gV.stats || !skV || (t.validity && t.validity.badInput)) return; var vV = Number(t.value); gV.stats[skV] = String(t.value).trim() === '' || !isFinite(vV) ? 0 : vV; }
        else if (/(^| )sys-grant-spec( |$)/.test(ic)) { var glS = t.closest('.sys-grant'), gS = glS && Array.isArray(it.grants) ? it.grants[+glS.dataset.gi] : null; if (!gS) return; var sV = String(t.value || '').trim(); if (sV) gS.spec = sV.slice(0, 60); else delete gS.spec; }   // 1.6.0 Specialties: a grant's specifier
        else if (/(^| )sys-grant-(qty|from|lvl)( |$)/.test(ic)) { var glI = t.closest('.sys-grant'), gI = glI && Array.isArray(it.grants) ? it.grants[+glI.dataset.gi] : null; if (!gI || (t.validity && t.validity.badInput)) return; var nG = Number(t.value), kG = /sys-grant-qty/.test(ic) ? 'qty' : /sys-grant-lvl/.test(ic) ? 'lvl' : 'from'; if (String(t.value).trim() === '' || !isFinite(nG)) delete gI[kG]; else gI[kG] = nG; }   // 1.6.0 (v2, B4)
        else if (ic.indexOf('sys-item-mamtf') >= 0) { var imfl = t.closest('.sys-item-mod'), imf = imfl ? (it.mods || [])[+imfl.dataset.mi] : null; if (imf) { var ivF = t.value.slice(0, LIMITS.formula); if (ivF.trim()) { imf.vf = ivF; imf.v = 0; delete imf.lvl; delete imf.tiers; } else delete imf.vf; var imN = imfl.querySelector('.sys-item-mamt'); if (imN) imN.disabled = !!ivF.trim(); } }   // 1.6.2 (205): the amount by a formula (emptied: the number again)
        else if (ic.indexOf('sys-item-mamt') >= 0) { var iml = t.closest('.sys-item-mod'), imm = iml ? (it.mods || [])[+iml.dataset.mi] : null; if (imm) imm.v = t.value === '' ? 0 : Number(t.value); }
        else if (ic.indexOf('sys-item-mtiers') >= 0) { var itr = t.closest('.sys-item-mod'), itm0 = itr ? (it.mods || [])[+itr.dataset.mi] : null; if (itm0) { if (String(t.value).trim() === '') delete itm0.tiers; else itm0.tiers = t.value.slice(0, 400); } }   // 1.6.0 By level, as typed
        else if (ic.indexOf('sys-item-mkey') >= 0) { var ikl = t.closest('.sys-item-mod'), ikm = ikl ? (it.mods || [])[+ikl.dataset.mi] : null; if (ikm) ikm.key = t.value.trim().slice(0, 40); }   // 1.5.8   // F6
        else if (ic.indexOf('sys-item-stat') >= 0) { var sk = t.dataset.sk || ''; if (!STAT_KEY.test(sk) || (sk in Object.prototype) || (sk.toLowerCase() in Object.prototype)) return; if (t.validity && t.validity.badInput) return; var ist = it.stats && typeof it.stats === 'object' && !Array.isArray(it.stats) ? it.stats : {}, sv = String(t.value).trim(); Object.keys(ist).forEach(function(k2) { if (k2 !== sk && k2.toLowerCase() === sk.toLowerCase()) delete ist[k2]; }); if (sv === '') delete ist[sk]; else if (t.dataset.pick === '1') ist[sk] = sv; else { var sn = Number(sv); if (!isFinite(sn)) return; ist[sk] = sn; } if (Object.keys(ist).length) it.stats = ist; else delete it.stats; }   // Stage 6 F4c1: a stat box (its key checked first: never a prototype name)
        else return;
        markDirty(); patchErrors(); return;
    }
    var lcd = listOfCard(t);
    if (lcd) {   // Stage 6 F4b: the Lists tab's boxes (Save cleans them)
        var lcc = t.className || '', lsp = lcd.list || (lcd.list = {}), lvD = lsp.lvl && typeof lsp.lvl === 'object' ? lsp.lvl : null, numOr = function(o, k) { if (t.validity && t.validity.badInput) return; if (String(t.value).trim() === '') delete o[k]; else o[k] = Number(t.value); };
        if (lcc.indexOf('sys-list-name') >= 0) { lcd.label = t.value.slice(0, LIMITS.label); keyFollows(lcd, t); markDirty(); patchErrors(); return; }   // 1.6.2: the list's name, its short form following it
        if (lcc.indexOf('sys-list-lvllabel') >= 0 && lvD) lvD.label = t.value.slice(0, LIMITS.label);
        else if (lcc.indexOf('sys-list-lvlmin') >= 0 && lvD) numOr(lvD, 'min');
        else if (lcc.indexOf('sys-list-lvlmax') >= 0 && lvD) numOr(lvD, 'max');
        else if (lcc.indexOf('sys-list-lvlstep') >= 0 && lvD) numOr(lvD, 'step');
        else if (lcc.indexOf('sys-list-lvldef') >= 0 && lvD) numOr(lvD, 'def');
        else if ((lcc.indexOf('sys-list-lcapn') >= 0 || lcc.indexOf('sys-list-lcapat') >= 0) && lvD) { var lcR = t.closest('.sys-list-lcap'), lcO = lcR && Array.isArray(lvD.caps) ? lvD.caps[+lcR.dataset.ci] : null; if (lcO && typeof lcO === 'object') numOr(lcO, lcc.indexOf('sys-list-lcapn') >= 0 ? 'n' : 'at'); }   // 1.6.0 At most at a level
        else if (lcc.indexOf('sys-list-lvlnames') >= 0 && lvD) { var lvn = t.value.split(',').map(function(s) { return s.trim(); }).slice(0, LIMITS.labels); while (lvn.length && !lvn[lvn.length - 1]) lvn.pop(); if (lvn.some(Boolean)) lvD.labels = lvn; else delete lvD.labels; }
        else if (lcc.indexOf('sys-list-onlabel') >= 0 && lsp.on && typeof lsp.on === 'object') lsp.on.label = t.value.slice(0, LIMITS.label);
        else if (lcc.indexOf('sys-list-unheldlvl') >= 0 && lvD) lsp.unheld = t.value.slice(0, LIMITS.formula);   // 1.6.0 Rolls unheld entries: the Unheld level (Save cleans it)
        else if (lcc.indexOf('sys-list-layerof') >= 0 && lsp.on && typeof lsp.on === 'object') lsp.on.layer = t.value.slice(0, LIMITS.formula);   // 1.6.3 Layers: how high each row is worn, kept while the tick is on even when empty, so its fault shows (Save cleans it)
        else if (lcc.indexOf('sys-list-swshow') >= 0 && lsp.on && typeof lsp.on === 'object') { if (t.value.trim()) lsp.on.showIf = t.value.slice(0, LIMITS.formula); else delete lsp.on.showIf; }   // 1.6.0: where a row's switch is shown (Save cleans it)
        else if (lcc.indexOf('sys-list-swneeds') >= 0 && lsp.on && typeof lsp.on === 'object') { var swWas = typeof lsp.on.needs === 'string' && !!lsp.on.needs.trim(); if (t.value.trim()) lsp.on.needs = t.value.slice(0, LIMITS.formula); else delete lsp.on.needs; needsWordsFollow(lsp.on, swWas, t, 'sys-list-swneeds'); }   // 1.5.8: a switch's needs (Save cleans them); 1.6.3: its words start filled
        else if (lcc.indexOf('sys-list-swwords') >= 0 && lsp.on && typeof lsp.on === 'object') { if (t.value.trim()) lsp.on.needsText = t.value.slice(0, LIMITS.needsWords); else delete lsp.on.needsText; }
        else if (lcc.indexOf('sys-list-malf') >= 0) {   // Stage 6 HUD R3: a list roll's Malf (Save cleans it)
            var mrw = t.closest('.sys-list-needsrow'), mL = Array.isArray(lsp.rolls) ? lsp.rolls : null, mR = mrw && mL ? mL[+mrw.dataset.ri] : null; if (!mR || typeof mR !== 'object') return;
            if (t.value.trim()) mR.malf = t.value.slice(0, LIMITS.formula); else delete mR.malf;
        }
        else if (lcc.indexOf('sys-list-critat') >= 0 || lcc.indexOf('sys-list-fumbleat') >= 0 || lcc.indexOf('sys-list-bigat') >= 0) {   // 1.6.0: a list roll's own critical range (Save cleans it)
            var crw = t.closest('.sys-list-needsrow'), cL = Array.isArray(lsp.rolls) ? lsp.rolls : null, cR = crw && cL ? cL[+crw.dataset.ri] : null; if (!cR || typeof cR !== 'object') return;
            var crL = lcc.indexOf('sys-list-critat') >= 0 ? 'critAt' : lcc.indexOf('sys-list-bigat') >= 0 ? 'bigAt' : 'fumbleAt'; if (t.value.trim()) cR[crL] = t.value.slice(0, LIMITS.formula); else delete cR[crL];
        }
        else if (lcc.indexOf('sys-list-needs') >= 0) {   // Stage 6 HUD R2b: a list roll's needs (Save cleans them)
            var nrw = t.closest('.sys-list-needsrow'), nL = Array.isArray(lsp.rolls) ? lsp.rolls : null, nR = nrw && nL ? nL[+nrw.dataset.ri] : null; if (!nR || typeof nR !== 'object') return;
            if (lcc.indexOf('sys-list-needstext') >= 0) { if (t.value.trim()) nR.needsText = t.value.slice(0, LIMITS.needsWords); else delete nR.needsText; }
            else { var nWas = typeof nR.needs === 'string' && !!nR.needs.trim(); if (t.value.trim()) nR.needs = t.value.slice(0, LIMITS.formula); else delete nR.needs; needsWordsFollow(nR, nWas, t, 'sys-list-needs'); }   // 1.6.3: its words start filled
        }
        else if (lcc.indexOf('sys-list-chamberreach') >= 0) { if (!lsp.chamber || typeof lsp.chamber !== 'object') return; if (t.value.trim()) lsp.chamber.reach = t.value.slice(0, LIMITS.formula); else delete lsp.chamber.reach; }   // 1.5.9 (es) Flies at most (Save cleans it)
        else if (lcc.indexOf('sys-list-chtake') >= 0) { if (!lsp.chamber || typeof lsp.chamber !== 'object') return; if (t.value.trim()) lsp.chamber.takeIf = t.value; else delete lsp.chamber.takeIf; }   // 1.6.2 Takes rows where
        else if (lcc.indexOf('sys-list-ldtake') >= 0) { if (!lsp.load || typeof lsp.load !== 'object') return; if (t.value.trim()) lsp.load.takeIf = t.value; else delete lsp.load.takeIf; }
        else if (lcc.indexOf('sys-list-chamberneedstext') >= 0) { if (!lsp.chamber || typeof lsp.chamber !== 'object') return; if (t.value.trim()) lsp.chamber.needsText = t.value.slice(0, LIMITS.needsWords); else delete lsp.chamber.needsText; }   // 1.5.9 Chambers only where's words
        else if (lcc.indexOf('sys-list-chamberneeds') >= 0) { if (!lsp.chamber || typeof lsp.chamber !== 'object') return; var chWas = typeof lsp.chamber.needs === 'string' && !!lsp.chamber.needs.trim(); if (t.value.trim()) lsp.chamber.needs = t.value; else delete lsp.chamber.needs; needsWordsFollow(lsp.chamber, chWas, t, 'sys-list-chamberneeds'); }   // 1.5.9 Chambers only where (Save cleans it as a list roll's needs); 1.6.3: its words start filled
        else if (lcc.indexOf('sys-list-chambercats') >= 0) { if (!lsp.chamber || typeof lsp.chamber !== 'object') return; var ccv = t.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean); if (ccv.length) lsp.chamber.cats = ccv; else delete lsp.chamber.cats; }   // 1.5.9 Chambers from (Save cleans them)
        else if (lcc.indexOf('sys-list-chamberby') >= 0 || lcc.indexOf('sys-list-chamberto') >= 0 || lcc.indexOf('sys-list-chamberlabel') >= 0) { if (!lsp.chamber || typeof lsp.chamber !== 'object') return; var cKy = lcc.indexOf('sys-list-chamberby') >= 0 ? 'by' : lcc.indexOf('sys-list-chamberto') >= 0 ? 'to' : 'label'; if (t.value.trim()) lsp.chamber[cKy] = cKy === 'label' ? t.value.slice(0, LIMITS.label) : t.value.trim(); else delete lsp.chamber[cKy]; }
        else if (lcc.indexOf('sys-list-feed') >= 0) {   // 1.6.0 Feeds: a feed's boxes (Save cleans them)
            var frwI = t.closest('.sys-list-feed'), fdI = frwI && Array.isArray(lsp.feeds) ? lsp.feeds[+frwI.dataset.fi] : null; if (!fdI || typeof fdI !== 'object') return;
            if (lcc.indexOf('sys-list-feedkey') >= 0) fdI.key = t.value.slice(0, 24);
            else if (lcc.indexOf('sys-list-feedturns') >= 0) { var ftv = t.value.slice(0, LIMITS.formula).trim(); if (ftv) fdI.turns = ftv; else delete fdI.turns; }
            else if (lcc.indexOf('sys-list-feedif') >= 0) { var fiv = t.value.slice(0, LIMITS.formula).trim(); if (fiv) fdI['if'] = fiv; else delete fdI['if']; }
            else if (lcc.indexOf('sys-list-feedcats') >= 0) { var fcv = t.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean); if (fcv.length) fdI.cats = fcv; else delete fdI.cats; }
            else if (lcc.indexOf('sys-list-feedby') >= 0) { if (t.value.trim()) fdI.by = t.value.trim(); else delete fdI.by; }
            else if (lcc.indexOf('sys-list-feedto') >= 0) { if (t.value.trim()) fdI.to = t.value.trim(); else delete fdI.to; }
        }
        else if (lcc.indexOf('sys-list-loadby') >= 0) { if (!lsp.load || typeof lsp.load !== 'object') return; if (t.value.trim()) lsp.load.by = t.value.trim(); else delete lsp.load.by; }   // 1.5.8 Matched by (Save keeps the pair only where both name a stat)
        else if (lcc.indexOf('sys-list-swcamt') >= 0) { var swKa = t.dataset.sw === 'switchOff' ? 'switchOff' : 'switchOn', swA = Array.isArray(lsp[swKa]) ? lsp[swKa][+t.dataset.oi] : null; if (swA && typeof swA === 'object') swA.formula = t.value.slice(0, LIMITS.formula); }   // 1.6.2 (167 B): a switch's changes
        else if (lcc.indexOf('sys-list-ormamt') >= 0) { var ormA = Array.isArray(lsp.onRemove) ? lsp.onRemove[+t.dataset.oi] : null; if (ormA && typeof ormA === 'object') ormA.formula = t.value.slice(0, LIMITS.formula); }   // 1.6.0: When a row is taken off
        else if (lcc.indexOf('sys-list-upamt') >= 0) { if (lsp.upkeep && typeof lsp.upkeep === 'object') lsp.upkeep.amt = t.value.slice(0, LIMITS.formula); }   // 1.6.0 (CORE gap 13): what a row pays
        else if (lcc.indexOf('sys-list-upn') >= 0) { if (!lsp.upkeep || typeof lsp.upkeep !== 'object') return; var upn = Number(t.value); lsp.upkeep.per = Object.assign({ u: 'min' }, lsp.upkeep.per); if (String(t.value).trim() && isFinite(upn)) lsp.upkeep.per.n = Math.round(upn); }
        else if (lcc.indexOf('sys-list-loadto') >= 0) { if (!lsp.load || typeof lsp.load !== 'object') return; if (t.value.trim()) lsp.load.to = t.value.trim(); else delete lsp.load.to; }
        else if (lcc.indexOf('sys-list-loadneedstext') >= 0) { if (!lsp.load || typeof lsp.load !== 'object') return; if (t.value.trim()) lsp.load.needsText = t.value.slice(0, LIMITS.needsWords); else delete lsp.load.needsText; }   // 1.5.8 Loads only where's words
        else if (lcc.indexOf('sys-list-loadneeds') >= 0) { if (!lsp.load || typeof lsp.load !== 'object') return; var ldWas = typeof lsp.load.needs === 'string' && !!lsp.load.needs.trim(); if (t.value.trim()) lsp.load.needs = t.value; else delete lsp.load.needs; needsWordsFollow(lsp.load, ldWas, t, 'sys-list-loadneeds'); }   // 1.5.8 Loads only where (Save cleans it as a list roll's needs); 1.6.3: its words start filled
        else if (lcc.indexOf('sys-list-loadcats') >= 0) { if (!lsp.load || typeof lsp.load !== 'object') return; var lcv = t.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean); if (lcv.length) lsp.load.cats = lcv; else delete lsp.load.cats; }   // 1.5.8 Loads from (Save cleans them)
        else if (lcc.indexOf('sys-list-ct') >= 0) {   // Stage 6 HUD R2: a counter's boxes (Save cleans them)
            var ctrw = t.closest('.sys-list-ct'), ctix = ctrw ? +ctrw.dataset.ti : -1, ctL = Array.isArray(lsp.counters) ? lsp.counters : null; if (!ctL || !(ctix >= 0 && ctix < ctL.length)) return;
            var ctD = ctL[ctix] && typeof ctL[ctix] === 'object' && !Array.isArray(ctL[ctix]) ? ctL[ctix] : (ctL[ctix] = {});
            if (lcc.indexOf('sys-list-ctkey') >= 0) ctD.key = t.value.trim().slice(0, 24);
            else if (lcc.indexOf('sys-list-ctlabel') >= 0) ctD.label = t.value.slice(0, LIMITS.label);
            else if (lcc.indexOf('sys-list-ctmax') >= 0) { if (t.value.trim()) ctD.max = t.value.slice(0, LIMITS.formula); else delete ctD.max; }
            else if (lcc.indexOf('sys-list-ctdef') >= 0) { var cdn = Number(t.value); if (String(t.value).trim() === '' || !isFinite(cdn)) delete ctD.def; else ctD.def = cdn; }
            else if (lcc.indexOf('sys-list-cttn') >= 0) { if (!ctD.timer || typeof ctD.timer !== 'object') return; var tnv = Number(t.value); ctD.timer.per = Object.assign({ u: 'day' }, ctD.timer.per); if (String(t.value).trim() && isFinite(tnv)) ctD.timer.per.n = tnv; else delete ctD.timer.per.n; }   // 1.6.0 Counts by the game clock (Save cleans it)
            else if (lcc.indexOf('sys-list-ctend') >= 0) { if (!ctD.timer || typeof ctD.timer !== 'object') return; if (t.value.trim()) ctD.timer.end = t.value.slice(0, LIMITS.label); else delete ctD.timer.end; }
            else return;
        }
        else if (lcc.indexOf('sys-list-xs') >= 0) { var xr = t.closest('.sys-list-xsrow'), xL = Array.isArray(lsp.rolls) ? lsp.rolls : null, xD = xr && xL ? xL[+xr.dataset.ri] : null; if (!xD || typeof xD !== 'object') return; if (listCrossEdit(xD, lcc, t) === 'all') { markDirty(); allOrWait(t); return; } }   // 1.6.0
        else if (lcc.indexOf('sys-list-applymoney') >= 0) {   // 1.6.0: the sheet's money, a figure (Save cleans it)
            var mrw = t.closest('.sys-list-applyrow'), mRl = mrw && Array.isArray(lsp.rolls) ? lsp.rolls[+mrw.dataset.ri] : null, mC = mRl && Array.isArray(mRl.then) ? mRl.then[+mrw.dataset.ai] : null;
            if (!mC || typeof mC !== 'object') return; mC.money = t.value.slice(0, LIMITS.formula);
        }
        else if (lcc.indexOf('sys-list-applyfxn') >= 0) { var fxqRw = t.closest('.sys-list-applyrow'), fxqRl = fxqRw && Array.isArray(lsp.rolls) ? lsp.rolls[+fxqRw.dataset.ri] : null, fxqK = fxqRw && fxqRw.dataset.k === 'then' ? 'then' : 'apply', fxqC = fxqRl && Array.isArray(fxqRl[fxqK]) ? fxqRl[fxqK][+fxqRw.dataset.ai] : null; if (!fxqC || typeof fxqC !== 'object') return; var fxqV = t.value.slice(0, LIMITS.formula); if (fxqV.trim()) fxqC.n = fxqV; else delete fxqC.n; }   // 1.6.3 (gap 3 of docs/EDITOR_COVERAGE.md): the number an effect switched on goes on with, on a list's action or a list roll's Then, as the Rolls tab's sys-apply-fxn writes it (Save cleans it)
        else if (lcc.indexOf('sys-list-applyfiren') >= 0) {   // 1.6.0: a fire's How many (Save cleans it)
            var frw = t.closest('.sys-list-applyrow'), fRl = frw && Array.isArray(lsp.rolls) ? lsp.rolls[+frw.dataset.ri] : null, fC = fRl && Array.isArray(fRl.then) ? fRl.then[+frw.dataset.ai] : null;
            if (!fC || typeof fC !== 'object') return; var fnv = t.value.slice(0, LIMITS.formula).trim(); if (fnv) fC.n = fnv; else delete fC.n;
        }
        else if (lcc.indexOf('sys-list-applyif') >= 0) {   // 1.6.2: Only where (Save cleans it)
            var irw = t.closest('.sys-list-applyrow'), iL = Array.isArray(lsp.rolls) ? lsp.rolls : null, iR = irw && iL ? iL[+irw.dataset.ri] : null, iC = iR && Array.isArray(iR.then) ? iR.then[+irw.dataset.ai] : null;
            if (!iC || typeof iC !== 'object') return; if (t.value.trim()) iC.if = t.value.slice(0, LIMITS.formula); else delete iC.if;
        }
        else if (lcc.indexOf('sys-list-applyformula') >= 0) {   // Stage 6 HUD H7b: a list action's amount (Save cleans it)
            var arw = t.closest('.sys-list-applyrow'), aL = Array.isArray(lsp.rolls) ? lsp.rolls : null, aR = arw && aL ? aL[+arw.dataset.ri] : null, aKy = arw && arw.dataset.k === 'then' ? 'then' : 'apply', aC = aR && Array.isArray(aR[aKy]) ? aR[aKy][+arw.dataset.ai] : null;   // R2b: or a roll's consequence
            if (!aC || typeof aC !== 'object') return; aC.formula = t.value.slice(0, LIMITS.formula);
        }
        else if (lcc.indexOf('sys-list-roll') >= 0) {   // Stage 6 F5b: a roll's boxes (Save cleans them)
            var rrw = t.closest('.sys-list-roll') || t.closest('.sys-list-needsrow'), rix = rrw ? +rrw.dataset.ri : -1, rL = Array.isArray(lsp.rolls) ? lsp.rolls : null; if (!rL || !(rix >= 0 && rix < rL.length)) return;
            var rD = rL[rix] && typeof rL[rix] === 'object' && !Array.isArray(rL[rix]) ? rL[rix] : (rL[rix] = {});
            if (lcc.indexOf('sys-list-rollshow') >= 0) { var rsv = t.value.slice(0, LIMITS.formula).trim(); if (rsv) rD.showIf = rsv; else delete rD.showIf; }   // 1.6.0: Shown where
            else if (lcc.indexOf('sys-list-rolllabel') >= 0) rD.label = t.value.slice(0, LIMITS.label);
            else if (lcc.indexOf('sys-list-rollformula') >= 0) rD.formula = t.value.slice(0, LIMITS.formula);
            else if (lcc.indexOf('sys-list-rolltest') >= 0 || lcc.indexOf('sys-list-rollof') >= 0) { if (lcc.indexOf('sys-list-rolltest') >= 0) { if (t.value) { rD.test = t.value; var ofK = listRollFigs(lsp); if (!(typeof rD.of === 'string' && ofK.indexOf(rD.of) >= 0) && ofK.length) rD.of = ofK[0]; } else { delete rD.test; delete rD.of; } } else { if (t.value) rD.of = t.value; else delete rD.of; } var ltX = rD.test && rD.of && typeof cleanTests === 'function' ? (cleanTests(draft.tests) || []).filter(function(x) { return x.key === rD.test; })[0] : null; if (ltX) rD.formula = testFormula(ltX, 'Row.' + rD.of); markDirty(); renderLists(); patchErrors(); return; }   // 1.6.2 (backlog 59): the test it rolls, written into its formula
            else if (lcc.indexOf('sys-list-rolldtype') >= 0) { var dtv = t.value.slice(0, LIMITS.formula).trim(); if (dtv) rD.dtype = dtv; else delete rD.dtype; }   // 1.5.7: a damage roll's type
            else if (lcc.indexOf('sys-list-rolldkind') >= 0) { var dkv = t.value.slice(0, LIMITS.formula).trim(); if (dkv) rD.dkind = dkv; else delete rD.dkind; }   // 1.6.0: a damage roll's kind of blow
            else if (lcc.indexOf('sys-list-rollhits') >= 0) { var htv = t.value.slice(0, LIMITS.formula).trim(); if (htv) rD.hits = htv; else delete rD.hits; }   // 1.6.0 A burst: Hits it rolls for
            else if (lcc.indexOf('sys-list-rollmjif') >= 0) { var mjv = t.value.slice(0, LIMITS.formula).trim(); if (mjv) rD.dmgMajorIf = mjv; else delete rD.dmgMajorIf; }   // 1.6.0: A Major Wound where
            else if (lcc.indexOf('sys-list-rolldiv') >= 0) { var adv = t.value.slice(0, LIMITS.formula).trim(); if (adv) rD.ad = adv; else delete rD.ad; }   // 1.6.0: a damage roll's armor divisor
            else if (lcc.indexOf('sys-list-rollp2f') >= 0) { var p2v = t.value.slice(0, LIMITS.formula).trim(); if (p2v) rD.dmg2 = p2v; else delete rD.dmg2; }   // 1.6.0 (B3): a second part of the blow
            else if (lcc.indexOf('sys-list-rollp2t') >= 0) { var p2tv = t.value.slice(0, LIMITS.formula).trim(); if (p2tv) rD.dtype2 = p2tv; else delete rD.dtype2; }   // its type
            else if (lcc.indexOf('sys-list-rollp2k') >= 0) { var p2kv = t.value.slice(0, LIMITS.formula).trim(); if (p2kv) rD.dkind2 = p2kv; else delete rD.dkind2; }   // its own kind
            else if (lcc.indexOf('sys-list-rollp2d') >= 0) { var p2dv = t.value.slice(0, LIMITS.formula).trim(); if (p2dv) rD.ad2 = p2dv; else delete rD.ad2; }   // its own armor divisor
            else if (/sys-list-rollp[345][ftdk]/.test(lcc)) { var pkm = /sys-list-rollp([345])([ftdk])/.exec(lcc), pkk = (pkm[2] === 'f' ? 'dmg' : pkm[2] === 't' ? 'dtype' : pkm[2] === 'k' ? 'dkind' : 'ad') + pkm[1], pkv = t.value.slice(0, LIMITS.formula).trim(); if (pkv) rD[pkk] = pkv; else delete rD[pkk]; }   // 1.6.0: a third and a fourth part, its type and its own armor divisor
            else return;
        }
        else if (lcc.indexOf('sys-list-col') >= 0) {   // Stage 6 F5a1: a column's boxes (Save cleans them)
            var crw = t.closest('.sys-list-col'), cix = crw ? +crw.dataset.ci : -1, cL = Array.isArray(lsp.cols) ? lsp.cols : null; if (!cL || !(cix >= 0 && cix < cL.length)) return;
            var cD = cL[cix] && typeof cL[cix] === 'object' && !Array.isArray(cL[cix]) ? cL[cix] : (cL[cix] = {});
            if (lcc.indexOf('sys-list-colkey') >= 0) { var oldCk = typeof cD.key === 'string' ? cD.key.toLowerCase() : ''; cD.key = t.value.trim().slice(0, 24); if (oldCk && typeof lsp.priceCol === 'string' && lsp.priceCol.toLowerCase() === oldCk) lsp.priceCol = cD.key; var pcSel = t.closest('.sys-list-card') ? t.closest('.sys-list-card').querySelector('.sys-list-paycol') : null; if (pcSel && typeof priceColOptions === 'function') priceColOptions(pcSel, lsp); }   // 1.6.2, the review of backlog 234: Price from follows its column's key
            else if (lcc.indexOf('sys-list-collabel') >= 0) cD.label = t.value.slice(0, LIMITS.label);
            else if (lcc.indexOf('sys-list-colformula') >= 0) cD.formula = t.value.slice(0, LIMITS.formula);
            else if (lcc.indexOf('sys-list-colunit') >= 0) { if (t.value.trim()) cD.unit = t.value.slice(0, LIMITS.unit); else delete cD.unit; }
            else if (lcc.indexOf('sys-list-coldec') >= 0) { if (String(t.value).trim() === '' || !isFinite(Number(t.value))) delete cD.decMax; else cD.decMax = Number(t.value); }   // 1.5.4 (Save keeps a whole number 0 to 5)
            else if (lcc.indexOf('sys-list-colnames') >= 0) { var cln = t.value.split(',').map(function(s) { return s.trim(); }).slice(0, LIMITS.labels); while (cln.length && !cln[cln.length - 1]) cln.pop(); if (cln.some(Boolean)) cD.labels = cln; else delete cD.labels; }
            else if (lcc.indexOf('sys-list-colshow') >= 0) { if (t.value.trim()) cD.showIf = t.value.slice(0, LIMITS.formula); else delete cD.showIf; }   // 1.6.2
            else if (lcc.indexOf('sys-list-colplus') >= 0) { var cpl = t.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean).slice(0, 640); if (cpl.length) cD.plus = cpl; else delete cD.plus; }   // 1.5.4 With: stat keys as typed, which Save reads by the list's own stats
            else return;
            var nCard = t.closest('.sys-list-card'), nLine = nCard ? nCard.querySelector('.sys-list-names') : null; if (nLine) nLine.textContent = listNamesText(lcd.key, lsp, partsHostIn(lcd.id));   // the names line follows a key as it is typed
        }
        else if (lcc.indexOf('sys-list-stat') >= 0) {   // Stage 6 F4c1: a stat's boxes
            var srw = t.closest('.sys-list-stat'), sti = srw ? +srw.dataset.si : -1, stL = Array.isArray(lsp.stats) ? lsp.stats : null; if (!stL || !(sti >= 0 && sti < stL.length)) return;
            var stD = stL[sti] && typeof stL[sti] === 'object' && !Array.isArray(stL[sti]) ? stL[sti] : (stL[sti] = {});
            if (lcc.indexOf('sys-list-statkey') >= 0) statKeyInput(lsp, stL, sti, t.value);   // the price follows its own stat's key
            else if (lcc.indexOf('sys-list-statopts') >= 0) stD.opts = t.value.split(',').map(function(p) { var q = p.split('='), lb = q[0].trim(), nm = (q.length > 1 ? q.slice(1).join('=') : q[0]).trim(); return { label: lb.slice(0, LIMITS.label), name: nm.slice(0, 64) }; }).filter(function(o) { return o.label && o.name; }).slice(0, LIMITS.pickOpts);   // Stage 6 F5a2: "Strength = ST, DX" (Save cleans them)
            else if (lcc.indexOf('sys-list-statlabel') >= 0) stD.label = t.value.slice(0, LIMITS.label);
            else if (lcc.indexOf('sys-list-statdef') >= 0) numOr(stD, 'def');
            else if (lcc.indexOf('sys-list-statnames') >= 0) { var stn = t.value.split(',').map(function(s) { return s.trim(); }).slice(0, LIMITS.labels); while (stn.length && !stn[stn.length - 1]) stn.pop(); if (stn.some(Boolean)) stD.labels = stn; else delete stD.labels; }
            else if (lcc.indexOf('sys-list-statunit') >= 0) { if (t.value.trim()) stD.unit = t.value.slice(0, LIMITS.unit); else delete stD.unit; }   // 1.5.4 (Save cleans it)
            else if (lcc.indexOf('sys-list-statdec') >= 0) { if (String(t.value).trim() === '' || !isFinite(Number(t.value))) delete stD.decMax; else stD.decMax = Number(t.value); }   // 1.5.4 (Save keeps a whole number 0 to 5)
            else return;
            var pCard = t.closest('.sys-list-card'), pSel = pCard ? pCard.querySelector('.sys-list-price') : null; if (pSel) priceOptions(pSel, lsp);   // the Price choices follow a key or a label as it is typed
            var mSel = pCard ? pCard.querySelector('.sys-list-money') : null; if (mSel) moneyOptions(mSel, lsp);   // 1.5.6: and the Money box's
            var oSel = pCard ? pCard.querySelector('.sys-list-onper') : null; if (oSel) perOptions(oSel, lsp);   // 1.5.4: and the Per choices
        }
        else return;
        markDirty(); patchErrors(); return;
    }
    var ctx = fieldOfRow(t); if (!ctx) return;
    var f = ctx.f, r = ctx.r, c = t.className || '';
    if (f) {
        if (c.indexOf('sys-key') >= 0) { f.key = t.value.trim(); _keyAuto.delete(f); }
        else if (c.indexOf('sys-label') >= 0) { f.label = t.value.slice(0, LIMITS.label); keyFollows(f, t); }
        else if (c.indexOf('sys-formula') >= 0) { var p = DEF_PROP[f.kind]; if (p) f[p] = t.value; }
        else if (c.indexOf('sys-roll') >= 0) f.roll = t.value.trim() || undefined;
        else if (c.indexOf('sys-unit') >= 0) { if (t.value.trim()) f.unit = t.value.slice(0, 32); else delete f.unit; }   // Stage 5g (Save cuts it to 8 code points, never half an emoji)
        else if (c.indexOf('sys-caption') >= 0) { if (t.value.trim()) f.caption = t.value.slice(0, 400); else delete f.caption; var caR = t.closest ? t.closest('.sys-row') : null, caS = caR ? caR.querySelector('.sys-capat') : null, caL = caS && caS.closest ? caS.closest('.sys-capin') : null; if (caL) caL.style.display = f.caption ? '' : 'none'; }   // Fold B (Save cuts it to 200); 1.6.3: its Shows list stands only beside a caption
        else if (c.indexOf('sys-vnames') >= 0) { var vn = t.value.split(',').map(function(s) { return s.trim(); }).slice(0, LIMITS.labels); while (vn.length && !vn[vn.length - 1]) vn.pop(); if (vn.some(Boolean)) f.labels = vn; else delete f.labels; }   // Stage 6: a blank between names keeps its place (every later name keeps its number)
        else if (c.indexOf('sys-res-icon') >= 0) { if (t.value.trim()) f.icon = t.value.slice(0, 32); else delete f.icon; }   // Fold B
        else if (c.indexOf('sys-ovr-value') >= 0 || c.indexOf('sys-ovr-when') >= 0) { var ovK = c.indexOf('sys-ovr-value') >= 0 ? 'value' : 'when', ovT = t.value.trim() ? t.value.slice(0, LIMITS.formula) : ''; var ovO = Object.assign({}, f.override && typeof f.override === 'object' ? f.override : {}); if (ovT) ovO[ovK] = ovT; else delete ovO[ovK]; if (ovO.value || ovO.when) f.override = ovO; else delete f.override; if (ovK === 'value') { markDirty(); allOrWait(t); return; } }   // 205 (6): Taken from, then while
        else if (c.indexOf('sys-trackof') >= 0) { if (f.track && typeof f.track === 'object') { if (t.value.trim()) f.track.of = t.value.slice(0, LIMITS.formula); else delete f.track.of; } }   // 1.6.2: a track's Out of
        else if (c.indexOf('sys-fldlock-if') >= 0) { var flH = !!(f.lock && typeof f.lock === 'object' && f.lock['if']), flO = Object.assign({}, f.lock && typeof f.lock === 'object' ? f.lock : {}); if (t.value.trim()) { flO['if'] = t.value.slice(0, LIMITS.formula); f.lock = flO; } else delete f.lock; if (flH !== !!f.lock) { markDirty(); allOrWait(t); return; } }   // 1.6.3 (backlog 170): Locked while (its words box comes and goes with the test)
        else if (c.indexOf('sys-fldlock-says') >= 0) { if (f.lock && typeof f.lock === 'object') { if (t.value.trim()) f.lock.says = t.value.slice(0, 200); else delete f.lock.says; } }
        else if (c.indexOf('sys-surch-if') >= 0) { var scO = Object.assign({}, f.surcharge && typeof f.surcharge === 'object' ? f.surcharge : {}); if (t.value.trim()) { scO['if'] = t.value.slice(0, LIMITS.formula); f.surcharge = scO; } else delete f.surcharge; }   // 1.6.2 Costs more while
        else if (c.indexOf('sys-surch-add') >= 0) { if (f.surcharge && typeof f.surcharge === 'object') { var scA = Math.round(Number(t.value)); if (isFinite(scA) && scA >= 1) f.surcharge.add = Math.min(99, scA); else delete f.surcharge.add; } }
        else if (c.indexOf('sys-spill-below') >= 0) { if (f.spill && typeof f.spill === 'object') { if (t.value.trim()) f.spill.below = t.value.slice(0, LIMITS.formula); else delete f.spill.below; } }   // 1.6.0 Spills into: below a formula
        else if (c.indexOf('sys-res-color') >= 0) { if (/^#[0-9a-fA-F]{6}$/.test(t.value)) f.color = t.value.toLowerCase(); }   // Stage 6 look fold (L7)
        else if (c.indexOf('sys-slider-lowColor') >= 0) { f.slider = f.slider || {}; f.slider.lowColor = t.value; }   // Stage 5e (the color classes before the label ones: 'sys-slider-low' is a prefix of both)
        else if (c.indexOf('sys-slider-highColor') >= 0) { f.slider = f.slider || {}; f.slider.highColor = t.value; }
        else if (c.indexOf('sys-slider-midColor') >= 0) { f.slider = f.slider || {}; f.slider.midColor = t.value; }
        else if (c.indexOf('sys-slider-low') >= 0) { f.slider = f.slider || {}; f.slider.low = t.value; }
        else if (c.indexOf('sys-slider-high') >= 0) { f.slider = f.slider || {}; f.slider.high = t.value; }
        else if (c.indexOf('sys-def-num') >= 0) f.def = t.value === '' ? 0 : Number(t.value);
        else if (c.indexOf('sys-def-res') >= 0) f.def = t.value.trim().toLowerCase() === 'max' ? 'max' : Number(t.value) || 0;
        else if (c.indexOf('sys-def-text') >= 0) f.def = t.value;
        else if (c.indexOf('sys-min') >= 0) { if (t.value === '') delete f.min; else f.min = Number(t.value); }
        else if (c.indexOf('sys-max') >= 0) { if (t.value === '') delete f.max; else f.max = Number(t.value); }
        else if (c.indexOf('sys-step') >= 0) f.step = Number(t.value) || 1;
        else if (c.indexOf('sys-options') >= 0) f.options = t.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        else if (c.indexOf('sys-roundat') >= 0) { if (String(t.value).trim() === '' || !isFinite(Number(t.value))) delete f.roundAt; else f.roundAt = Number(t.value); }   // clarity package (Save holds it to 0.01 to 0.99)
        else if (c.indexOf('sys-decmin') >= 0 || c.indexOf('sys-decmax') >= 0) { var dk = c.indexOf('sys-decmin') >= 0 ? 'decMin' : 'decMax'; if (String(t.value).trim() === '' || !isFinite(Number(t.value))) delete f[dk]; else f[dk] = Number(t.value); }   // 1.5.4 (Save keeps a whole number 0 to 4)
        else return;
    } else if (r) {
        if (c.indexOf('sys-apply-if') >= 0) { var chW = applyChangeOf(t, r); if (!chW) return; if (t.value.trim()) chW.if = t.value.slice(0, LIMITS.formula); else delete chW.if; }
        if (c.indexOf('sys-apply-rows') >= 0) { var chR = applyChangeOf(t, r); if (!chR) return; if (t.value.trim()) chR.rows = t.value.slice(0, LIMITS.formula); else delete chR.rows; }   // 1.6.2 (3)
        else if (c.indexOf('sys-apply-fxn') >= 0) { var chN = applyChangeOf(t, r); if (!chN) return; var fxnV = t.value.slice(0, LIMITS.formula); if (fxnV.trim()) chN.n = fxnV; else delete chN.n; }   // 1.6.2: With number
        else if (c.indexOf('sys-apply-formula') >= 0) { var chI = applyChangeOf(t, r); if (!chI) return; chI.formula = t.value.slice(0, LIMITS.formula); }   // Stage 6 HUD H7: a change's amount
        else if (c.indexOf('sys-label') >= 0) r.label = t.value.slice(0, LIMITS.label);
        else if (c.indexOf('sys-formula') >= 0) r.formula = t.value;
        else if (c.indexOf('sys-roll-icon') >= 0) { if (t.value.trim()) r.icon = t.value.slice(0, 32); else delete r.icon; }   // Stage 6 look fold
        else if (c.indexOf('sys-roll-malf') >= 0) { if (t.value.trim()) r.malf = t.value.slice(0, LIMITS.formula); else delete r.malf; }   // Stage 6 HUD R3
        else if (c.indexOf('sys-roll-critat') >= 0 || c.indexOf('sys-roll-fumbleat') >= 0 || c.indexOf('sys-roll-bigat') >= 0) { var crK = c.indexOf('sys-roll-critat') >= 0 ? 'critAt' : c.indexOf('sys-roll-bigat') >= 0 ? 'bigAt' : 'fumbleAt'; if (t.value.trim()) r[crK] = t.value.slice(0, LIMITS.formula); else delete r[crK]; }   // 1.6.0: its own critical range (Save cleans it)
        else if (c.indexOf('sys-roll-hits') >= 0) { if (t.value.trim()) r.hits = t.value.slice(0, LIMITS.formula); else delete r.hits; }   // 1.6.0 A burst: Hits it rolls for (Save cleans it)
        else if (c.indexOf('sys-roll-critok') >= 0) { if (t.value.trim()) r.critOk = t.value.slice(0, LIMITS.formula); else delete r.critOk; }   // 1.6.2: Answers a critical where (Save keeps it only on a roll that resists)
        else if (c.indexOf('sys-roll-mjif') >= 0) { if (t.value.trim()) r.dmgMajorIf = t.value.slice(0, LIMITS.formula); else delete r.dmgMajorIf; }   // 1.6.0: A Major Wound where (Save cleans it)
        else if (c.indexOf('sys-roll-dtype') >= 0) { if (t.value.trim()) r.dtype = t.value.slice(0, LIMITS.formula); else delete r.dtype; }   // 1.6.0 (B3): a damage roll's type (Save cleans it)
        else if (c.indexOf('sys-roll-dkind') >= 0) { if (t.value.trim()) r.dkind = t.value.slice(0, LIMITS.formula); else delete r.dkind; }   // 1.6.0: and its kind of blow
        else if (c.indexOf('sys-roll-p2f') >= 0) { if (t.value.trim()) r.dmg2 = t.value.slice(0, LIMITS.formula); else delete r.dmg2; }   // 1.6.0 (B3): a second part of the blow (Save cleans it)
        else if (c.indexOf('sys-roll-p2t') >= 0) { if (t.value.trim()) r.dtype2 = t.value.slice(0, LIMITS.formula); else delete r.dtype2; }   // and its type
        else if (c.indexOf('sys-roll-p2k') >= 0) { if (t.value.trim()) r.dkind2 = t.value.slice(0, LIMITS.formula); else delete r.dkind2; }   // and its own kind
        else if (/sys-roll-p[345][ftk]/.test(c)) { var pkr = /sys-roll-p([345])([ftk])/.exec(c), pkrk = (pkr[2] === 'f' ? 'dmg' : pkr[2] === 'k' ? 'dkind' : 'dtype') + pkr[1]; if (t.value.trim()) r[pkrk] = t.value.slice(0, LIMITS.formula); else delete r[pkrk]; }   // 1.6.0: a third and a fourth part, and its type
        else if (c.indexOf('sys-roll-needstext') >= 0) { if (t.value.trim()) r.needsText = t.value.slice(0, LIMITS.needsWords); else delete r.needsText; }   // 1.5.4: what it needs (Save cleans it)
        else if (c.indexOf('sys-roll-needs') >= 0) {
            // 1.6.3 (Fulllion's rulings of 2026-11-20: a box other boxes depend on is required, and starts filled where a value makes sense): the
            // words for the grayed button are what a refused press says, so where the needs are first written and the words are empty they start
            // as Not now, set in their box too since typing here draws nothing again. refreshErrors says it where they are emptied later
            var ndHad = typeof r.needs === 'string' && !!r.needs.trim(); if (t.value.trim()) r.needs = t.value.slice(0, LIMITS.formula); else delete r.needs;
            if (!ndHad && r.needs && !(typeof r.needsText === 'string' && r.needsText.trim())) { r.needsText = 'Not now'; var ndRw = t.closest('.sys-roll-needsrow'), ndTx = ndRw ? ndRw.querySelector('.sys-roll-needstext') : null; if (ndTx) ndTx.value = r.needsText; }
        }
        else if (c.indexOf('sys-roll-xs') >= 0) { if (crossEdit(r, c, t) === 'all') { markDirty(); allOrWait(t); return; } }   // 1.5.9 (book es/et plan 4a): When a value crosses
        else if (c.indexOf('sys-roll-evn') >= 0 || c.indexOf('sys-roll-ifn') >= 0) everyEdit(r, c, t);   // item 20 K5; backlog 152, fold 5: In a fight's number
        else return;
    } else return;
    markDirty(); patchErrors();
}
function onChange(e) {
    if (!draft) return;
    var t = e.target, c = t.className || '';
    if (onLayoutChange(t)) return;
    if (onSwChange(t)) return;   // 1.6.0: a roll bonus's roll
    if (onTurnChange(t)) return;   // turn-based combat T1
    if (onLightChange(t)) return;   // lighting L4
    if (onSensesChange(t)) return;   // senses S2a
    if (onRangeChange(t)) return;   // range penalties R1
    if (onPostureChange(t)) return;   // conditions C3
    if (onInitChange(t)) return;   // initiative O2
    if (onBudgetChange(t)) return;   // 126
    if (onEnvChange(t)) return;   // 1.6.0
    if (onTableChange(t)) return;   // 1.6.0: the Tables box
    if (onBarsChange(t)) return;   // backlog 28: the Token bars box
    if (onLinkChange(t)) return;   // 1.6.0: the Linked sheets
    if (onHeightChange(t)) return;   // item 19 H2
    if (onCalendarChange(t)) return;   // item 20 K1
    if (onDamageChange(t)) return;   // 1.5.6: the Taking damage box
    var pnx = /sys-(roll-p|list-rollp)([234])f/.exec(c);   // 1.6.0: a part's formula typed, so the next part's boxes come (the Rolls tab and the Lists card are drawn again only where they are not there yet)
    if (pnx && t.value.trim() && t.parentNode && !t.parentNode.querySelector('.sys-' + pnx[1] + (+pnx[2] + 1) + 'f')) { markDirty(); renderAll(); return; }
    if (c.indexOf('sys-combat-auto') >= 0) { draft.combat.blastAuto = t.value; markDirty(); patchErrors(); return; }
    if (c.indexOf('sys-combat-roller') >= 0) { draft.combat.blastRoller = t.value; markDirty(); patchErrors(); return; }
    if (typeof onHoldChange === 'function' && onHoldChange(t)) return;   // 1.6.0 Who holds whom
    if (typeof onBlastChange === 'function' && onBlastChange(t)) return;   // 1.5.8 explosives
    if (typeof onAreaEdit === 'function' && onAreaEdit(t, false)) return;   // 1.6.0: a line a roll hits
    if (typeof onDefendChange === 'function' && onDefendChange(t)) return;   // 1.6.0: a blast's own Defense roll
    if (c.indexOf('sys-combat-testby') >= 0) { if (t.value === 'now' || t.value === 'both') draft.combat.testBy = t.value; else delete draft.combat.testBy; markDirty(); patchErrors(); return; }   // 1.6.3 (defense fold 3, Fulllion's decision 8)
    if (c.indexOf('sys-combat-landby') >= 0) { if (t.value === 'now' || t.value === 'both') draft.combat.landBy = t.value; else delete draft.combat.landBy; markDirty(); patchErrors(); return; }   // 1.6.3 (defense fold 1)
    if (c.indexOf('sys-combat-checks') >= 0) { if (t.value === 'under3d6' || t.value === 'fixed') draft.combat.checks = t.value; else delete draft.combat.checks; markDirty(); patchErrors(); renderCombat(); return; }   // Stage 6 F8 (1.6.0: or criticals at fixed rolls, whose two boxes it shows)
    if (c.indexOf('sys-combat-hp') >= 0) { draft.combat.hpResource = t.value; markDirty(); patchErrors(); return; }
    if (c.indexOf('sys-combat-cover-on') >= 0) { if (!draft.combat.cover) draft.combat.cover = { on: false, style: 'graded' }; draft.combat.cover.on = t.value === 'on'; markDirty(); patchErrors(); renderCombat(); return; }
    if (c.indexOf('sys-combat-height-rule') >= 0) { var hrD = draft.combat.height && typeof draft.combat.height === 'object' && !Array.isArray(draft.combat.height) ? draft.combat.height : null; if (t.value === 'clears') draft.combat.height = Object.assign({}, hrD || {}, { rule: 'clears' }); else if (hrD) { delete hrD.rule; if (!Object.keys(hrD).length) delete draft.combat.height; } markDirty(); patchErrors(); return; }   // item 19 H1
    if (c.indexOf('sys-combat-hideresist') >= 0) { if (t.checked) draft.combat.hideResist = true; else delete draft.combat.hideResist; markDirty(); patchErrors(); return; }   // 1.6.2
    if (c.indexOf('sys-combat-postatk') >= 0) { if (t.checked) draft.combat.postureOnAttack = true; else delete draft.combat.postureOnAttack; markDirty(); patchErrors(); renderCombat(); return; }   // 1.6.0
    if (c.indexOf('sys-combat-covmod') >= 0) { if (!draft.combat.cover) draft.combat.cover = { on: false, style: 'graded' }; var cmG = t.dataset.grade, cmT = draft.combat.cover.mods && typeof draft.combat.cover.mods === 'object' ? draft.combat.cover.mods : {}, cmV = Number(t.value); if (['half', 'threeq', 'cover', 'total'].indexOf(cmG) < 0) return; if (t.value !== '' && isFinite(cmV)) cmT[cmG] = cmV; else delete cmT[cmG]; if (Object.keys(cmT).length) draft.combat.cover.mods = cmT; else delete draft.combat.cover.mods; markDirty(); patchErrors(); return; }   // 1.6.0: what a grade of cover takes off an attack, kept as typed for what Save says of it
    if (c.indexOf('sys-combat-cover-objects') >= 0) { if (!draft.combat.cover) draft.combat.cover = { on: false, style: 'graded' }; var cvO = Math.floor(Number(t.value)); if (t.value !== '' && cvO >= 1) draft.combat.cover.objects = Math.min(100, cvO); else delete draft.combat.cover.objects; markDirty(); patchErrors(); return; }
    if (c.indexOf('sys-combat-cover-style') >= 0) { if (!draft.combat.cover) draft.combat.cover = { on: false, style: 'graded' }; draft.combat.cover.style = t.value === 'binary' ? 'binary' : 'graded'; markDirty(); patchErrors(); renderCombat(); return; }
    if (c.indexOf('sys-combat-cover-area') >= 0) { var cvA = draft.combat.cover || (draft.combat.cover = { on: false, style: 'graded' }), gA = t.dataset.grade; if (['half', 'threeq', 'cover', 'total'].indexOf(gA) < 0) return; var arA = cvA.area && typeof cvA.area === 'object' ? cvA.area : {}; if (t.value === 'half' || t.value === 'none') arA[gA] = t.value; else delete arA[gA]; if (Object.keys(arA).length) cvA.area = arA; else delete cvA.area; markDirty(); patchErrors(); return; }   // cover follow-ups
    if (c.indexOf('sys-listrules-stats') >= 0 || c.indexOf('sys-listrules-upload') >= 0) { var lr = Object.assign({}, draft.listRules || {}); if (c.indexOf('sys-listrules-stats') >= 0) { delete lr.ownerStats; delete lr.statsAsk; if (t.value === 'owner') lr.ownerStats = true; else if (t.value === 'ask') lr.statsAsk = true; } else { if (t.value === 'facts') lr.uploadFacts = true; else delete lr.uploadFacts; } if (Object.keys(lr).length) draft.listRules = lr; else delete draft.listRules; markDirty(); patchErrors(); return; }   // Stage 6: settings A and B   // Stage 6 F4c2: Setting A
    var fxc = fxOfRow(t);   // 5h: a library effect's selects
    if (fxc) {
        if (c.indexOf('sys-fx-rest') >= 0) {   // 1.6.2: the rest that ends it. A pick ticks that rest's Ends effects, without which it would end nothing, and says so
            if (t.value) fxc.endsRest = t.value; else delete fxc.endsRest;
            Array.prototype.slice.call(t.options || []).forEach(function(o) { if (o.value !== t.value && o.textContent === 'A rest that is gone') t.removeChild(o); });   // a rest that is gone is not offered again
            var rsP = t.value && t.value !== '-' ? (Array.isArray(draft.rests) ? draft.rests : []).filter(function(x) { return !!x && x.id === t.value; })[0] : null;
            if (rsP && rsP.ends !== true) { rsP.ends = true; toast((String(rsP.name || '').trim() || 'That rest') + ' now ends the effects that last until it.'); }
            markDirty(); patchErrors(); return;
        }
        if (c.indexOf('sys-fx-endroll') >= 0) { if (t.value) fxc.endRoll = t.value; else delete fxc.endRoll; markDirty(); patchErrors(); return; }   // 1.6.2: an effect's end
        if (c.indexOf('sys-fx-endoff') >= 0) { if (t.checked) fxc.endOff = true; else delete fxc.endOff; markDirty(); return; }
        if (t.closest && t.closest('.sys-fx-endrow')) {
            if (c.indexOf('sys-apply-target') >= 0) { var chTe = applyChangeOf(t, fxc); if (!chTe) return; setChangeTarget(chTe, t.value); markDirty(); renderAll(); return; }
            if (c.indexOf('sys-apply-op') >= 0) { var chOe = applyChangeOf(t, fxc); if (!chOe) return; delete chOe.add; delete chOe.set; delete chOe.mark; delete chOe.loss; if (t.value === 'add') chOe.add = true; else if (t.value === 'set') chOe.set = true; else if (t.value === 'loss') chOe.loss = true; markDirty(); patchErrors(); return; }
            if (c.indexOf('sys-apply-rolled') >= 0) { var chRe = applyChangeOf(t, fxc); if (!chRe) return; if (t.checked) chRe.roll = true; else delete chRe.roll; markDirty(); patchErrors(); return; }
        }
        if (c.indexOf('sys-fxv-chk') >= 0) { if (t.checked) fxc.val = { start: 1 }; else delete fxc.val; markDirty(); renderAll(); return; }   // 1.6.2: Holds a number
        if (c.indexOf('sys-fxv-again') >= 0) { if (fxc.val) { if (t.value === 'higher' || t.value === 'replace') fxc.val.again = t.value; else delete fxc.val.again; } markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-fxv-each') >= 0) { if (fxc.val) { if (t.value) { fxc.val.each = t.value; if (!(fxc.val.by >= 1)) fxc.val.by = 1; } else { delete fxc.val.each; delete fxc.val.by; } } markDirty(); renderAll(); return; }
        if (c.indexOf('sys-fxv-per') >= 0) { var pvln = t.closest('.sys-fx-mod'), pvm = pvln ? (fxc.mods || [])[+pvln.dataset.mi] : null; if (pvm) { if (t.checked) pvm.perVal = true; else delete pvm.perVal; } markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-fx-ends') >= 0) { if (t.value === 'turnEnd') fxc.ends = 'turnEnd'; else delete fxc.ends; markDirty(); patchErrors(); return; }   // 1.6.0 Counts at
        if (c.indexOf('sys-fx-covervs') >= 0) { if (fxc.cover && typeof fxc.cover === 'object') { if (t.value === 'far') fxc.cover.vs = 'far'; else delete fxc.cover.vs; } markDirty(); patchErrors(); return; }   // 1.6.2 Gives cover
        if (c.indexOf('sys-fx-cover') >= 0) { var cvN = Number(t.value); if (cvN === 1 || cvN === 2 || cvN === 3) fxc.cover = Object.assign({}, fxc.cover && typeof fxc.cover === 'object' ? fxc.cover : {}, { g: cvN }); else delete fxc.cover; markDirty(); renderAll(); return; }
        if (c.indexOf('sys-fx-again') >= 0) { if (t.value === 'longer' || t.value === 'add') fxc.again = t.value; else delete fxc.again; markDirty(); patchErrors(); return; }   // 1.6.0 (a builder audit): When added again
        if (c.indexOf('sys-fx-tone') >= 0) { fxc.tone = t.value; markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-fx-vis') >= 0) { fxc.vis = t.value; markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-fx-posturekeep') >= 0) { var pkId = t.getAttribute('data-pid'), pkL = Array.isArray(fxc.postureKeep) ? fxc.postureKeep.filter(function(x) { return x !== pkId; }) : []; if (t.checked && pkId) pkL.push(pkId); if (pkL.length) fxc.postureKeep = pkL; else delete fxc.postureKeep; markDirty(); patchErrors(); return; }   // 1.6.0
        if (c.indexOf('sys-fx-postureback') >= 0) { if (t.checked) fxc.postureBack = true; else delete fxc.postureBack; markDirty(); patchErrors(); return; }   // 1.5.9
        if (c.indexOf('sys-fx-posture') >= 0) { if (t.value) { fxc.posture = t.value; if (Array.isArray(fxc.postureKeep)) { fxc.postureKeep = fxc.postureKeep.filter(function(x) { return x !== t.value; }); if (!fxc.postureKeep.length) delete fxc.postureKeep; } } else { delete fxc.posture; delete fxc.postureBack; delete fxc.postureKeep; } markDirty(); renderAll(); return; }   // 1.5.9 (the owner's O6): the posture it sets
        if (c.indexOf('sys-fx-target') >= 0) {
            var tln = t.closest('.sys-fx-mod'), tm = tln ? (fxc.mods || [])[+tln.dataset.mi] : null;
            if (tm) { var tp = t.value.split('|'); tm.f = tp[0]; if (tp[1] === 'on') { tm.op = 'on'; delete tm.v; delete tm.part; } else { tm.op = tm.op === 'max' || tm.op === 'min' ? tm.op : 'add'; if (typeof tm.v !== 'number') tm.v = 1; if (tp[1] === 'max') tm.part = 'max'; else delete tm.part; } rowAimSet(tm, draft, t.value); markDirty(); renderAll(); }
            return;
        }
        if (c.indexOf('sys-fx-how') >= 0) { var hln = t.closest('.sys-fx-mod'), hm = hln ? (fxc.mods || [])[+hln.dataset.mi] : null; if (hm && hm.op !== 'on') { hm.op = t.value === 'max' || t.value === 'min' ? t.value : 'add'; markDirty(); patchErrors(); } return; }   // 1.6.0
        if (c.indexOf('sys-fx-mcol') >= 0) { var cln = t.closest('.sys-fx-mod'), cm = cln ? (fxc.mods || [])[+cln.dataset.mi] : null; if (cm) { cm.col = t.value; markDirty(); patchErrors(); } return; }   // 1.5.8
        return;
    }
    var iit = itemOfRow(t);
    if (iit) {
        if (c.indexOf('sys-item-vis') >= 0) { iit.vis = t.value; markDirty(); patchErrors(); return; }
        if (/(^| )sys-grant-list( |$)/.test(c)) { var glC = t.closest('.sys-grant'), gC = glC && Array.isArray(iit.grants) ? iit.grants[+glC.dataset.gi] : null; if (gC) { if (t.value) gC.list = t.value; else delete gC.list; markDirty(); renderAll(); } return; }   // 1.6.0 (v2, B4): a grant's list
        if (/(^| )sys-grant-pay( |$)/.test(c)) { var glP = t.closest('.sys-grant'), gP = glP && Array.isArray(iit.grants) ? iit.grants[+glP.dataset.gi] : null; if (gP) { if (t.checked) gP.pay = true; else delete gP.pay; markDirty(); } return; }   // 1.6.0: Pays back
        if (/(^| )sys-grant-once( |$)/.test(c)) { var glO = t.closest('.sys-grant'), gO = glO && Array.isArray(iit.grants) ? iit.grants[+glO.dataset.gi] : null; if (gO) { if (t.checked) gO.once = true; else delete gO.once; markDirty(); } return; }   // 1.6.0 (CORE gap 15): once a character
        if (/(^| )sys-grant-up( |$)/.test(c)) { var glU = t.closest('.sys-grant'), gU = glU && Array.isArray(iit.grants) ? iit.grants[+glU.dataset.gi] : null; if (gU) { if (t.value) gU.up = t.value; else delete gU.up; markDirty(); patchErrors(); } return; }   // 1.6.2 (body fold 1)
        if (/(^| )sys-grant-nm( |$)/.test(c)) { var bxN = t.closest('.sys-grant-box'); if (bxN && Array.isArray(iit.grants)) Array.prototype.forEach.call(bxN.querySelectorAll('.sys-grant'), function(ln) { var gi = +ln.dataset.gi, us = ln.querySelector('.sys-grant-up'), gu = iit.grants[gi]; if (!us || !gu) return; us.textContent = ''; grantUpOpts(iit.grants, gi).forEach(function(o) { us.appendChild(opt(o[0], o[1], o[0] === (gu.up || ''))); }); }); markDirty(); patchErrors(); return; }   // in place: a redraw here loses the box the focus is going to
        if (/(^| )sys-grant-stat( |$)/.test(c)) { var glT = t.closest('.sys-grant'), gT = glT && Array.isArray(iit.grants) ? iit.grants[+glT.dataset.gi] : null, fT = gT ? (draft.fields || []).filter(function(f) { return f && f.id === gT.list; })[0] : null, sT = fT && fT.list && Array.isArray(fT.list.stats) ? fT.list.stats.filter(function(s) { return s && s.key === t.value; })[0] : null; if (sT && STAT_KEY.test(sT.key) && !(sT.key in Object.prototype)) { gT.stats = gT.stats && typeof gT.stats === 'object' ? gT.stats : {}; gT.stats[sT.key] = sT.kind === 'pick' && Array.isArray(sT.opts) && sT.opts[0] ? sT.opts[0].label : 0; markDirty(); renderAll(); grantFocus(+glT.dataset.gi, sT.key); } return; }
        if (/(^| )sys-grant-spick( |$)/.test(c)) { var glK = t.closest('.sys-grant'), slK = t.closest('.sys-grant-sline'), gK = glK && Array.isArray(iit.grants) ? iit.grants[+glK.dataset.gi] : null; if (gK && gK.stats && slK && slK.dataset.sk) { gK.stats[slK.dataset.sk] = t.value; markDirty(); patchErrors(); } return; }
        if (/(^| )sys-grant-sval( |$)/.test(c)) return;
        if (/(^| )sys-grant-add( |$)/.test(c)) { var gv = t.value; if (!gv) return; iit.grants = Array.isArray(iit.grants) ? iit.grants : []; if (iit.grants.length >= GRANT_MAX) { toast('At most ' + GRANT_MAX + ' grants an item.'); return; } iit.grants.push({ list: grantListFor(gv), entry: gv, qty: 1 }); markDirty(); renderAll(); grantFocus(iit.grants.length - 1, ''); return; }
        if (/(^| )sys-grant-(qty|from)( |$)/.test(c)) return;
        if (c.indexOf('sys-item-mtarget') >= 0) { var itl = t.closest('.sys-item-mod'), itm = itl ? (iit.mods || [])[+itl.dataset.mi] : null; if (itm) { var itp = t.value.split('|'); itm.f = itp[0]; if (itp[1] === 'on') { itm.op = 'on'; delete itm.v; delete itm.part; delete itm.lvl; } else { itm.op = itm.op === 'max' || itm.op === 'min' ? itm.op : 'add'; if (typeof itm.v !== 'number') itm.v = 1; if (itp[1] === 'max') itm.part = 'max'; else delete itm.part; } rowAimSet(itm, draft, t.value); markDirty(); renderAll(); } return; }   // F6
        if (c.indexOf('sys-item-placebit') >= 0) { var pbk = t.dataset.sk || '', pbn = +t.dataset.bit; if (!STAT_KEY.test(pbk) || (pbk in Object.prototype) || !(pbn >= 0 && pbn < 16)) return; var pst = iit.stats && typeof iit.stats === 'object' && !Array.isArray(iit.stats) ? iit.stats : (iit.stats = {}), pcur = 0; Object.keys(pst).forEach(function(k2) { if (k2.toLowerCase() === pbk.toLowerCase()) { if (typeof pst[k2] === 'number') pcur = Math.floor(Math.abs(pst[k2])) & 0xFFFF; delete pst[k2]; } }); var pnx = t.checked ? (pcur | (1 << pbn)) : (pcur & ~(1 << pbn)); if (pnx) pst[pbk] = pnx; markDirty(); patchErrors(); return; }   // 1.6.0 O1: a place ticked or not
        if (c.indexOf('sys-item-mhow') >= 0) { var ihl = t.closest('.sys-item-mod'), ihm = ihl ? (iit.mods || [])[+ihl.dataset.mi] : null; if (ihm && ihm.op !== 'on') { ihm.op = t.value === 'max' || t.value === 'min' ? t.value : 'add'; if (ihm.op !== 'add') delete ihm.lvl; markDirty(); renderAll(); } return; }   // 1.6.0
        if (c.indexOf('sys-item-mcol') >= 0) { var icl = t.closest('.sys-item-mod'), icm = icl ? (iit.mods || [])[+icl.dataset.mi] : null; if (icm) { icm.col = t.value; markDirty(); patchErrors(); } return; }   // 1.5.8
        if (c.indexOf('sys-item-mlvl') >= 0) { var ivl = t.closest('.sys-item-mod'), ivm = ivl ? (iit.mods || [])[+ivl.dataset.mi] : null; if (ivm) { if (t.checked) ivm.lvl = true; else delete ivm.lvl; markDirty(); patchErrors(); } return; }
        if (c.indexOf('sys-item-modson') >= 0) { if (t.checked) iit.modsOn = true; else delete iit.modsOn; markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-item-again') >= 0) { if (t.value === 'name') iit.again = 'name'; else delete iit.again; markDirty(); patchErrors(); return; }   // 1.6.0
        if (c.indexOf('sys-item-rmmode') >= 0) { if (t.value === 'bound' || t.value === 'curse') iit.rm = t.value; else delete iit.rm; markDirty(); renderAll(); return; }   // Stage 6
        if (c.indexOf('sys-item-eqmode') >= 0) { if (t.value === 'bound' || t.value === 'curse') iit.eq = t.value; else delete iit.eq; markDirty(); renderAll(); return; }   // F4b
        if (c.indexOf('sys-item-atype') >= 0) { if (iit.area) { if (t.value) iit.area.type = t.value; else delete iit.area.type; } markDirty(); patchErrors(); return; }   // 1.5.8 explosives
        if (c.indexOf('sys-item-ause') >= 0) { if (iit.area) { if (t.checked) iit.area.use = true; else delete iit.area.use; } markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-item-aplace') >= 0) { if (iit.area) { if (t.checked) { iit.area.place = true; delete iit.area.flight; if (!(typeof iit.area.trig === 'number' && iit.area.trig > 0)) iit.area.trig = 2; } else { delete iit.area.place; delete iit.area.trig; } } markDirty(); renderAll(); return; }   // 1.5.9: a placed mine is never launched
        if (c.indexOf('sys-item-afragtype') >= 0) { if (iit.area) { if (t.value) iit.area.fragType = t.value; else delete iit.area.fragType; } markDirty(); patchErrors(); return; }   // 1.5.9 (es)
        if (/(^| )sys-item-aff(fx|who|unit)( |$)/.test(c)) {   // 1.5.9 (es): an affliction's effect, whom it reaches and the unit of its Lasts
            var afC = affOfRow(t, iit); if (!afC) return; var kC = /sys-item-aff(fx|who|unit)/.exec(c)[1], vC = String(t.value || '');
            if (kC === 'fx') { if (vC) afC.a.fx = vC.slice(0, 32); else delete afC.a.fx; } else if (kC === 'who') { if (vC === 'all') afC.a.who = 'all'; else delete afC.a.who; }
            else if (afC.a.lasts && typeof afC.a.lasts === 'object') afC.a.lasts.u = vC.slice(0, 24);
            affSaysAt(t, iit, afC.a); markDirty(); patchErrors(); return;
        }
        if (c.indexOf('sys-cloud-on') >= 0) { if (!iit.area) return; if (t.checked) iit.area.cloud = iit.area.cloud && typeof iit.area.cloud === 'object' ? iit.area.cloud : {}; else delete iit.area.cloud; markDirty(); renderAll(); return; }   // 1.6.2: the cloud it leaves
        if (c.indexOf('sys-cloud-smoke') >= 0) { if (!iit.area || !iit.area.cloud) return; if (t.checked) iit.area.cloud.smoke = true; else delete iit.area.cloud.smoke; markDirty(); patchErrors(); return; }
        if (/(^| )sys-cloud-(u|fx|roll)( |$)/.test(c)) { if (!iit.area || !iit.area.cloud) return; var clS = /sys-cloud-(u|fx|roll)/.exec(c)[1], clV = String(t.value || ''); if (clV) iit.area.cloud[clS] = clV; else delete iit.area.cloud[clS]; markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-fly-on') >= 0) { if (t.checked) iit.flies = iit.flies && typeof iit.flies === 'object' ? iit.flies : { speed: '1', rounds: 1, hp: 1 }; else delete iit.flies; markDirty(); renderAll(); return; }   // 1.6.2 (vehicles, fold (d))
        if (/(^| )sys-fly-(path|roll|end)( |$)/.test(c)) { if (!iit.flies || typeof iit.flies !== 'object') return; var flS = /sys-fly-(path|roll|end)/.exec(c)[1], flV = String(t.value || ''); if (flV) iit.flies[flS] = flV; else delete iit.flies[flS]; markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-item-aflight') >= 0) { if (iit.area) { if (t.value === 'scatter' || t.value === 'line') iit.area.flight = t.value; else delete iit.area.flight; } markDirty(); patchErrors(); return; }   // 1.5.9 (es)
        if (c.indexOf('sys-item-shape') >= 0) {
            var wasA = !!iit.area; if (t.value === '') iit.area = null; else iit.area = { ft: iit.area ? iit.area.ft : 12, shape: 'circle', name: iit.area ? iit.area.name : '' };
            // 1.6.3 (Fulllion's rulings of 2026-11-20: none is no good default): a blast's damage takes its type's multiplier and DR, so a blast new on
            // an item starts on the Combat tab's first damage type where it names any. Damage type: none stays offered
            var dtN = draft.combat && draft.combat.damage && Array.isArray(draft.combat.damage.types) ? draft.combat.damage.types.filter(function(y) { return y && typeof y.key === 'string' && y.key; }) : [];
            if (!wasA && iit.area && dtN.length) iit.area.type = dtN[0].key;
            // 1.6.3 (Fulllion's rulings of 2026-11-20: a box others depend on is required, and starts filled where a value makes sense): where the
            // Combat tab names a throw roll, a blast new on an item starts with a throw skill, since with none no throw roll is made for it at all. The
            // review of items: only where the choice is clear, a skill whose name or short name reads as throwing, else the system's only skill. Any
            // other pick would be a guess, and a wrong one also quiets the validator's word that asks for one, so the box then starts empty and that
            // word, under the box, asks for it
            var trS = draft.combat && draft.combat.blast && typeof draft.combat.blast.roll === 'string' && draft.combat.blast.roll.trim();
            if (!wasA && iit.area && trS && !iit.throwSkill) {
                var sks = (draft.fields || []).filter(function(f) { return f && f.kind === 'skill' && typeof f.key === 'string' && f.key; });
                var sk0 = sks.filter(function(f) { return /throw/i.test(String(f.label || '')) || /throw/i.test(f.key); })[0] || (sks.length === 1 ? sks[0] : null); if (sk0) iit.throwSkill = sk0.key;
            }
            markDirty(); renderAll(); return;
        }
        if (c.indexOf('sys-item-cat') >= 0) { var nsc = itemStatDefs(iit).map(function(s) { return s.key.toLowerCase(); }).join(','); if (nsc !== (t.dataset.scope || '')) { markDirty(); renderAll(); } return; }   // F4c1: a category that changes which lists it can be on redraws its stat boxes
        return;
    }
    var lch = listOfCard(t);
    if (lch) {   // Stage 6 F4b: the Lists tab's ticks
        var lsc = lch.list || (lch.list = {});
        if (c.indexOf('sys-list-catcb') >= 0) { var cur = Array.isArray(lsc.cats) ? lsc.cats.slice() : [], cx = t.dataset.cat || '', ci = cur.findIndex(function(y) { return String(y).toLowerCase() === cx.toLowerCase(); }); if (t.checked && ci < 0) cur.push(cx); if (!t.checked && ci >= 0) cur.splice(ci, 1); if (cur.length) lsc.cats = cur; else delete lsc.cats; }
        else if (c.indexOf('sys-list-multi') >= 0) { if (t.checked) lsc.multi = true; else delete lsc.multi; }
        else if (c.indexOf('sys-list-noqty') >= 0) { if (t.checked) lsc.noQty = true; else delete lsc.noQty; }
        else if (c.indexOf('sys-list-hang') >= 0) { if (t.checked) lsc.hang = true; else delete lsc.hang; }   // 1.6.2 (body fold 1)
        else if (c.indexOf('sys-list-sheets') >= 0) { if (t.checked) lsc.sheets = lsc.sheets && typeof lsc.sheets === 'object' ? lsc.sheets : {}; else delete lsc.sheets; renderLists(); }   // 1.6.2 (vehicles, fold (a))
        else if (c.indexOf('sys-list-sheettpl') >= 0) { if (lsc.sheets && typeof lsc.sheets === 'object') { if (t.value) lsc.sheets.tpl = t.value; else delete lsc.sheets.tpl; } }
        else if (c.indexOf('sys-list-sheeton') >= 0) { if (lsc.sheets && typeof lsc.sheets === 'object') { if (t.value) lsc.sheets.on = t.value; else delete lsc.sheets.on; } }
        else if (c.indexOf('sys-list-graise') >= 0) { if (t.checked) lsc.grantRaise = true; else delete lsc.grantRaise; }   // 1.6.0 (a builder audit)
        else if (c.indexOf('sys-list-custom') >= 0) { if (t.checked) lsc.custom = true; else delete lsc.custom; }   // Stage 6 F4c3
        else if (c.indexOf('sys-list-place') >= 0) { if (typeof placeSet === 'function') placeSet(lsc, t.dataset.part, t.value); }   // 1.6.0 R2: a part's Shows list
        else if (c.indexOf('sys-list-open') >= 0) { if (t.checked) lsc.open = true; else delete lsc.open; }
        else if (c.indexOf('sys-list-edge') >= 0) { if (t.checked) lsc.edge = true; else delete lsc.edge; }   // 1.6.0 R16
        else if (c.indexOf('sys-list-atfrom') >= 0) { if (t.value) { var atC = (Array.isArray(lsc.stats) ? lsc.stats : []).filter(function(s) { return s && typeof s.key === 'string' && s.key && s.set !== true && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length : Array.isArray(s.labels) && s.labels.length); })[0]; lsc.at = { from: t.value, by: (lsc.at && lsc.at.by) || (atC ? atC.key : '') }; } else delete lsc.at; }   // 1.6.0 Stands at
        else if (c.indexOf('sys-list-atby') >= 0) { if (lsc.at) lsc.at.by = t.value; }
        else if (c.indexOf('sys-list-tileside') >= 0 || c.indexOf('sys-list-tiletop') >= 0 || c.indexOf('sys-list-tiledraw') >= 0 || c.indexOf('sys-list-tilemake') >= 0) { var tlK = c.indexOf('sys-list-tileside') >= 0 ? 'side' : c.indexOf('sys-list-tiledraw') >= 0 ? 'draw' : c.indexOf('sys-list-tilemake') >= 0 ? 'make' : 'top', tlO2 = Object.assign({}, lsc.tiles || {}); if (t.value) tlO2[tlK] = t.value; else delete tlO2[tlK]; if (Object.keys(tlO2).length) lsc.tiles = tlO2; else delete lsc.tiles; }   // 1.6.2 (body fold 3)
        else if (c.indexOf('sys-list-standfrom') >= 0) { if (t.value) lsc.stand = Object.assign({}, lsc.stand || {}, { from: t.value }); else delete lsc.stand; }   // 1.6.2 (body fold 2)
        else if (c.indexOf('sys-list-standpieces') >= 0) { if (lsc.stand) { if (t.checked) lsc.stand.pieces = true; else delete lsc.stand.pieces; } }
        else if (c.indexOf('sys-list-standbox') >= 0) { if (lsc.stand) { if (t.value) lsc.stand.box = t.value; else delete lsc.stand.box; } }
        else if (/sys-list-stand(fits|says|reach|counts|off)/.test(c)) { if (lsc.stand) { var sdK = /standfits/.test(c) ? 'fits' : /standsays/.test(c) ? 'fitSays' : /standreach/.test(c) ? 'reach' : /standcounts/.test(c) ? 'counts' : 'offWord', sdV = String(t.value || '').trim(), sdHad = typeof lsc.stand[sdK] === 'string' && !!lsc.stand[sdK].trim(); if (sdV) lsc.stand[sdK] = sdV.slice(0, sdK === 'offWord' ? LIMITS.label : sdK === 'fitSays' ? LIMITS.needsWords : LIMITS.formula); else delete lsc.stand[sdK];
            if (sdK === 'counts' && sdV && !sdHad && !(typeof lsc.stand.offWord === 'string' && lsc.stand.offWord.trim())) lsc.stand.offWord = STAND_OFF_WORD; else if (sdK === 'counts' && !sdV && lsc.stand.offWord === STAND_OFF_WORD) delete lsc.stand.offWord; } }   // 1.6.3: Otherwise it says starts filled while Counts where holds a test
        else if (c.indexOf('sys-list-partsfrom') >= 0) {   // 1.6.0 R14: Parts from (1.6.2: a tick a list, this list first where it is ticked, then the others in the order of the fields)
            var pfIds = lsc.parts ? [lsc.parts.from].concat(Array.isArray(lsc.parts.also) ? lsc.parts.also : []) : [], pfId = t.dataset ? t.dataset.pf : '', ordF = (draft.fields || []).map(function(x) { return x && x.id; });
            if (t.type !== 'checkbox') pfIds = t.value ? [t.value] : []; else if (pfId) { pfIds = pfIds.filter(function(x) { return x !== pfId; }); if (t.checked) pfIds.push(pfId); }
            pfIds = pfIds.filter(function(x, i) { return typeof x === 'string' && x && pfIds.indexOf(x) === i; }).sort(function(a, b) { return (a === lch.id ? -1 : ordF.indexOf(a)) - (b === lch.id ? -1 : ordF.indexOf(b)); }).slice(0, 4);
            if (!pfIds.length) delete lsc.parts; else { lsc.parts = Object.assign({}, lsc.parts || {}, { from: pfIds[0] }); if (pfIds.length > 1) lsc.parts.also = pfIds.slice(1); else delete lsc.parts.also; if (lsc.parts.deep === true && pfIds[0] !== lch.id) delete lsc.parts.deep; }
        }
        else if (c.indexOf('sys-list-partscats') >= 0) { if (lsc.parts) { var pcs = String(t.value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean); if (pcs.length) lsc.parts.cats = pcs; else delete lsc.parts.cats; } }
        else if (c.indexOf('sys-list-partshosts') >= 0) { if (lsc.parts) { var phs = String(t.value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean); if (phs.length) lsc.parts.hosts = phs; else delete lsc.parts.hosts; } }   // 198: Held by
        else if (c.indexOf('sys-list-partscap') >= 0) { if (lsc.parts) { if (t.value) lsc.parts.capBy = t.value; else delete lsc.parts.capBy; } }   // 1.6.0 (v2, B6): Holds as many as the row's stat
        else if (c.indexOf('sys-list-partsdeep') >= 0) { if (lsc.parts) { if (t.checked) lsc.parts.deep = true; else delete lsc.parts.deep; } }   // 205 (4): Parts hold parts
        else if (c.indexOf('sys-list-partsfitif') >= 0) { if (lsc.parts) { var pfv = String(t.value || '').trim(), pfWas = typeof lsc.parts.fitIf === 'string' && !!lsc.parts.fitIf.trim(); if (pfv) lsc.parts.fitIf = pfv.slice(0, LIMITS.formula); else delete lsc.parts.fitIf; if (pfv && !pfWas && !(typeof lsc.parts.fitIfSays === 'string' && lsc.parts.fitIfSays.trim())) lsc.parts.fitIfSays = PART_FIT_WORDS; else if (!pfv && lsc.parts.fitIfSays === PART_FIT_WORDS) delete lsc.parts.fitIfSays; } }   // 1.6.0 Fits where (Save cleans it); 1.6.3: its Refused with starts filled, as needsWordsFollow fills a needs box's words
        else if (c.indexOf('sys-list-partsfitwords') >= 0) { if (lsc.parts) { var pwv = String(t.value || '').trim(); if (pwv) lsc.parts.fitIfSays = pwv.slice(0, LIMITS.needsWords); else delete lsc.parts.fitIfSays; } }
        else if (c.indexOf('sys-list-partslabel') >= 0) { if (lsc.parts) { var plv = String(t.value || '').trim(); if (plv) lsc.parts.label = plv; else delete lsc.parts.label; } }
        else if (c.indexOf('sys-list-sets') >= 0) { if (t.value) lsc.sets = t.value; else delete lsc.sets; }   // 1.6.0 R15: Sets by
        else if (c.indexOf('sys-list-groupby') >= 0) { if (t.value) lsc.groupBy = t.value; else delete lsc.groupBy; }
        else if (c.indexOf('sys-list-arcby') >= 0) { if (t.value) lsc.arc = { by: t.value }; else delete lsc.arc; }   // 1.6.2 (vehicles, fold (b)): Arcs by
        else if (c.indexOf('sys-list-statown') >= 0) { var soR = t.closest('.sys-list-stat'), soD = soR && Array.isArray(lsc.stats) ? lsc.stats[+soR.dataset.si] : null; if (soD && typeof soD === 'object') { if (t.checked) soD.own = true; else delete soD.own; } }
        else if (c.indexOf('sys-list-placeby') >= 0) { if (t.value) lsc.placeBy = t.value; else delete lsc.placeBy; }   // 1.6.0 R13: the places' ticks are then the stat's value names
        else if (c.indexOf('sys-list-menus') >= 0) { if (t.checked) lsc.menus = true; else delete lsc.menus; }   // 1.6.0 R10
        else if (c.indexOf('sys-list-throwif') >= 0) { var twV = String(t.value || '').trim(); if (twV) lsc.throwIf = twV.slice(0, LIMITS.formula); else { delete lsc.throwIf; delete lsc.throwSays; } markDirty(); patchErrors(); return; }   // 1.6.2 Thrown only where
        else if (c.indexOf('sys-list-throwsays') >= 0) { var tsV = String(t.value || '').trim(); if (tsV) lsc.throwSays = tsV.slice(0, LIMITS.needsWords); else delete lsc.throwSays; markDirty(); return; }
        else if (c.indexOf('sys-list-sjif') >= 0) { var sjiV = String(t.value || '').trim(); if (sjiV) lsc.subjectIf = sjiV.slice(0, LIMITS.formula); else delete lsc.subjectIf; markDirty(); patchErrors(); return; }   // 1.6.0 Subject only where: no redraw, so Tab goes on from it
        else if (c.indexOf('sys-list-subject') >= 0) { var sjbL = String(t.value || '').split(',').map(function(w) { return w.trim(); }).filter(Boolean); var sjbHad = Array.isArray(lsc.subject) && lsc.subject.length > 0; if (sjbL.length) lsc.subject = sjbL; else delete lsc.subject; if (sjbHad === sjbL.length > 0) { markDirty(); patchErrors(); return; } }   // 1.6.0 Subjects: drawn again only where the box beside it comes or goes, so Tab goes on from it
        else if (c.indexOf('sys-list-boxes') >= 0) { if (t.checked) lsc.boxes = true; else delete lsc.boxes; }   // 1.6.0 R3   // 1.6.0 R1: Rows open
        else if (c.indexOf('sys-list-handgm') >= 0) { if (lsc.hand) { if (t.checked) lsc.hand.gm = true; else delete lsc.hand.gm; } }   // 1.6.2 (G9)
        else if (c.indexOf('sys-list-hand') >= 0) { if (t.checked) lsc.hand = lsc.hand || {}; else delete lsc.hand; renderLists(); }
        else if (c.indexOf('sys-list-togm') >= 0) { if (t.value === 'run' || t.value === 'wait') lsc.toGm = t.value; else delete lsc.toGm; }   // HR1
        else if (c.indexOf('sys-list-trade') >= 0) { if (t.checked) lsc.trade = true; else delete lsc.trade; }   // 1.5.6 Tradable
        else if (c.indexOf('sys-list-specs') >= 0) { if (t.checked) lsc.specs = lsc.specs && typeof lsc.specs === 'object' && !Array.isArray(lsc.specs) ? lsc.specs : {}; else delete lsc.specs; }   // 1.6.0 Specialties
        else if (c.indexOf('sys-list-specsum') >= 0) { if (lsc.specs && typeof lsc.specs === 'object') { if (t.value === 'add') lsc.specs.sum = true; else delete lsc.specs.sum; } }   // gap 20: Subject reads
        else if (c.indexOf('sys-list-specby') >= 0 || c.indexOf('sys-list-specof') >= 0 || c.indexOf('sys-list-speccover') >= 0 || c.indexOf('sys-list-specapart') >= 0 || c.indexOf('sys-list-specnever') >= 0 || c.indexOf('sys-list-specpen') >= 0 || c.indexOf('sys-list-specfall') >= 0 || c.indexOf('sys-list-specdflt') >= 0) { var spK = c.indexOf('sys-list-specby') >= 0 ? 'by' : c.indexOf('sys-list-specof') >= 0 ? 'of' : c.indexOf('sys-list-speccover') >= 0 ? 'cover' : c.indexOf('sys-list-specapart') >= 0 ? 'apart' : c.indexOf('sys-list-specnever') >= 0 ? 'never' : c.indexOf('sys-list-specpen') >= 0 ? 'pen' : c.indexOf('sys-list-specfall') >= 0 ? 'fall' : 'dflt'; if (lsc.specs && typeof lsc.specs === 'object') { if (t.value) lsc.specs[spK] = t.value; else delete lsc.specs[spK]; } }   // ... where a row says its specialty, its Fallback and its untrained figure
        else if (c.indexOf('sys-list-layfrom') >= 0) { if (t.value) { lsc.lay = lsc.lay && typeof lsc.lay === 'object' && lsc.lay.from === t.value ? lsc.lay : { from: t.value }; } else delete lsc.lay; }   // 1.6.2 Laid from (Save cleans it); another list drops the copied stats
        else if (c.indexOf('sys-list-layif') >= 0) { if (lsc.lay && typeof lsc.lay === 'object') { var lyV = String(t.value || '').trim(); if (lyV) lsc.lay['if'] = lyV.slice(0, LIMITS.formula); else delete lsc.lay['if']; } markDirty(); patchErrors(); return; }
        else if (c.indexOf('sys-list-laystat') >= 0) { if (lsc.lay && typeof lsc.lay === 'object') { var lyTo = String(t.dataset.to || ''), lySs = (Array.isArray(lsc.lay.stats) ? lsc.lay.stats : []).filter(function(p) { return p && String(p.to).toLowerCase() !== lyTo.toLowerCase(); }); if (t.value && lyTo) lySs.push({ to: lyTo, from: t.value }); if (lySs.length) lsc.lay.stats = lySs; else delete lsc.lay.stats; } }
        else if (c.indexOf('sys-list-lockif') >= 0) { var lkV = String(t.value || '').trim(); if (lkV) { lsc.lock = lsc.lock && typeof lsc.lock === 'object' ? lsc.lock : { cells: ['name'] }; lsc.lock['if'] = lkV.slice(0, LIMITS.formula); } else delete lsc.lock; }   // 1.6.2 Locked while (Save cleans it); a new lock starts with the name ticked
        else if (c.indexOf('sys-list-lockcell') >= 0) { if (lsc.lock && typeof lsc.lock === 'object') { var lkck = String(t.dataset.cell || ''), lkcs = (Array.isArray(lsc.lock.cells) ? lsc.lock.cells : []).filter(function(x) { return String(x).toLowerCase() !== lkck.toLowerCase(); }); if (t.checked && lkck) lkcs.push(lkck); lsc.lock.cells = lkcs; } }
        else if (c.indexOf('sys-list-locksays') >= 0) { if (lsc.lock && typeof lsc.lock === 'object') { var lkW2 = String(t.value || '').trim(); if (lkW2) lsc.lock.says = lkW2.slice(0, 200); else delete lsc.lock.says; } }
        else if (c.indexOf('sys-list-modsif') >= 0) { var miV = String(t.value || '').trim(); if (miV) lsc.modsIf = miV.slice(0, LIMITS.formula); else delete lsc.modsIf; }   // 1.6.0 Changes apply where (Save cleans it)
        else if (c.indexOf('sys-list-rowlook') >= 0) { if (t.checked) lsc.look = lsc.look && typeof lsc.look === 'object' ? lsc.look : {}; else delete lsc.look; }   // 1.6.0, backlog 206: Rows carry a look
        else if (c.indexOf('sys-list-lkmain') >= 0) { if (lsc.look) { var lkm = String(t.value || '').trim(); if (lkm) lsc.look.main = lkm; else delete lsc.look.main; } }
        else if (c.indexOf('sys-list-lkby') >= 0) { if (lsc.look) { if (t.value) lsc.look.by = t.value; else { delete lsc.look.by; delete lsc.look.shades; } } }
        else if (c.indexOf('sys-list-lkshades') >= 0) { if (lsc.look) { var lks = lookShadesOf(t.value); if (lks.length) lsc.look.shades = lks; else delete lsc.look.shades; } }
        else if (c.indexOf('sys-list-worklog') >= 0) { if (t.checked) lsc.workLog = true; else delete lsc.workLog; }   // ... and Rows keep a work log
        else if (c.indexOf('sys-list-unheldon') >= 0) { if (t.checked) lsc.unheld = typeof lsc.unheld === 'string' ? lsc.unheld : ''; else delete lsc.unheld; }   // 1.6.0 Rolls unheld entries
        else if (c.indexOf('sys-list-lvlstart') >= 0) { if (lsc.lvl && typeof lsc.lvl === 'object') { if (t.checked) lsc.lvl.start = true; else delete lsc.lvl.start; } }   // 1.6.0 Keeps the starting level
        else if (c.indexOf('sys-list-lvltone') >= 0) { if (t.value) lsc.lvlTone = String(t.value).slice(0, 12); else delete lsc.lvlTone; }   // 1.6.2 (180)
        else if (c.indexOf('sys-list-lvlentry') >= 0) { if (lsc.lvl && typeof lsc.lvl === 'object') { if (t.checked) lsc.lvl.entry = true; else delete lsc.lvl.entry; } }   // 1.6.0 R8
        else if (c.indexOf('sys-list-lvlsplit') >= 0) { if (lsc.lvl && typeof lsc.lvl === 'object') { if (t.checked) lsc.lvl.split = true; else delete lsc.lvl.split; } }   // 1.5.6 trading
        else if (c.indexOf('sys-list-lcapup') >= 0) { var lcU = t.closest('.sys-list-lcap'), lcV = lcU && lsc.lvl && Array.isArray(lsc.lvl.caps) ? lsc.lvl.caps[+lcU.dataset.ci] : null; if (lcV && typeof lcV === 'object') { if (t.checked) lcV.up = true; else delete lcV.up; } }   // 1.6.0 At most at a level: or higher
        else if (c.indexOf('sys-list-statsplit') >= 0) { var sxr = t.closest('.sys-list-stat'), sxD = sxr && Array.isArray(lsc.stats) ? lsc.stats[+sxr.dataset.si] : null; if (!sxD || typeof sxD !== 'object') return; if (t.checked) sxD.split = true; else delete sxD.split; }
        else if (c.indexOf('sys-list-haslvl') >= 0) { if (t.checked) lsc.lvl = { label: 'Level', min: 0, step: 1, def: 0 }; else delete lsc.lvl; }
        else if (c.indexOf('sys-list-hason') >= 0) { if (t.checked) lsc.on = { label: 'On' }; else delete lsc.on; }
        else if (c.indexOf('sys-list-ondef') >= 0) { if (lsc.on && typeof lsc.on === 'object') { if (t.checked) lsc.on.def = true; else delete lsc.on.def; } }
        else if (c.indexOf('sys-list-ormf') >= 0 || c.indexOf('sys-list-ormh') >= 0) onRemoveChange(lsc, t, c);   // 1.6.0: When a row is taken off
        else if (c.indexOf('sys-list-swcf') >= 0 || c.indexOf('sys-list-swch') >= 0) switchChangesChange(lsc, t, c);   // 1.6.2 (167 B): a switch's changes
        else if (c.indexOf('sys-list-upon') >= 0 || c.indexOf('sys-list-uppool') >= 0 || c.indexOf('sys-list-upeach') >= 0 || c.indexOf('sys-list-upu') >= 0 || c.indexOf('sys-list-upstop') >= 0 || c.indexOf('sys-list-upct') >= 0 || c.indexOf('sys-list-upby') >= 0 || c.indexOf('sys-list-upevery') >= 0 || c.indexOf('sys-list-upout') >= 0) upkeepChange(lsc, t, c);   // 1.6.0 (CORE gap 13): Keeps paying
        else if (c.indexOf('sys-list-onone') >= 0) { if (lsc.on && typeof lsc.on === 'object') { if (t.checked) lsc.on.one = true; else { delete lsc.on.one; delete lsc.on.per; delete lsc.on.over; delete lsc.on.layer; } } }   // 1.5.4 One at a time (1.6.3: its layers go with Where meet)
        else if (c.indexOf('sys-list-layered') >= 0) { if (lsc.on && typeof lsc.on === 'object') { if (t.checked) lsc.on.layer = typeof lsc.on.layer === 'string' ? lsc.on.layer : ''; else delete lsc.on.layer; } }   // 1.6.3 Worn in layers: its box starts empty and is said until filled
        else if (c.indexOf('sys-list-ctroll') >= 0) { var ctr2 = t.closest('.sys-list-ct'), ctD2 = ctr2 && Array.isArray(lsc.counters) ? lsc.counters[+ctr2.dataset.ti] : null; if (!ctD2 || typeof ctD2 !== 'object') return; if (t.checked) ctD2.roll = true; else delete ctD2.roll; }   // 1.5.7: Set by rolls only
        else if (c.indexOf('sys-list-ctnewturn') >= 0) { var ctr5 = t.closest('.sys-list-ct'), ctD5 = ctr5 && Array.isArray(lsc.counters) ? lsc.counters[+ctr5.dataset.ti] : null; if (!ctD5 || typeof ctD5 !== 'object') return; if (t.checked) ctD5.turn = true; else { delete ctD5.turn; delete ctD5.pass; } }   // 1.6.0: Starts again each turn
        else if (c.indexOf('sys-list-ctpass') >= 0) { var ctr6 = t.closest('.sys-list-ct'), ctD6 = ctr6 && Array.isArray(lsc.counters) ? lsc.counters[+ctr6.dataset.ti] : null; if (!ctD6 || typeof ctD6 !== 'object') return; if (t.value) ctD6.pass = t.value; else delete ctD6.pass; }   // 1.6.0 (the core's gap 14): Passes its count to
        else if (c.indexOf('sys-list-cttimer') >= 0 || c.indexOf('sys-list-cttu') >= 0 || c.indexOf('sys-list-ctton') >= 0 || c.indexOf('sys-list-cttreset') >= 0) {   // 1.6.0 Counts by the game clock
            var ctr3 = t.closest('.sys-list-ct'), ctD3 = ctr3 && Array.isArray(lsc.counters) ? lsc.counters[+ctr3.dataset.ti] : null; if (!ctD3 || typeof ctD3 !== 'object') return;
            var tm3 = ctD3.timer && typeof ctD3.timer === 'object' && !Array.isArray(ctD3.timer) ? ctD3.timer : null;
            if (c.indexOf('sys-list-cttimer') >= 0) { if (!t.value) delete ctD3.timer; else { tm3 = tm3 || { per: { n: 1, u: 'day' } }; tm3.dir = t.value === 'up' ? 'up' : 'down'; if (tm3.dir === 'up') delete tm3.end; ctD3.timer = tm3; } }
            else if (!tm3) return;
            else if (c.indexOf('sys-list-cttu') >= 0) tm3.per = Object.assign({ n: 1 }, tm3.per, { u: String(t.value).slice(0, 24) });
            else if (c.indexOf('sys-list-ctton') >= 0) { if (t.checked) tm3.on = true; else { delete tm3.on; delete tm3.reset; } }
            else { if (t.checked) tm3.reset = true; else delete tm3.reset; }
        }
        else if (c.indexOf('sys-list-onper') >= 0) { if (lsc.on && typeof lsc.on === 'object') { lsc.on.one = true; delete lsc.on.over; if (t.value && t.value.indexOf('over:') === 0) { lsc.on.over = t.value.slice(5); delete lsc.on.per; } else if (t.value) lsc.on.per = t.value; else delete lsc.on.per; if (!lsc.on.over) delete lsc.on.layer; } }   // 1.6.3: layers only beside Where meet   // 1.6.0 O1: or where a stat's places meet   // ... for the whole list, or per a stat (Save keeps the one that holds: the stat, else the whole list)
        else if (c.indexOf('sys-list-colhide') >= 0 || c.indexOf('sys-list-colfoot') >= 0) { var chr = t.closest('.sys-list-col'), chD = chr && Array.isArray(lsc.cols) ? lsc.cols[+chr.dataset.ci] : null; if (!chD || typeof chD !== 'object') return; var chK = c.indexOf('sys-list-colhide') >= 0 ? 'hide' : 'foot'; if (t.checked) chD[chK] = true; else delete chD[chK]; }   // Stage 6 F5a1
        else if (c.indexOf('sys-list-statkind') >= 0) { var skr = t.closest('.sys-list-stat'), skD = skr && Array.isArray(lsc.stats) ? lsc.stats[+skr.dataset.si] : null; if (!skD || typeof skD !== 'object') return; delete skD.def; delete skD.labels; if (t.value === 'pick') { skD.kind = 'pick'; skD.opts = Array.isArray(skD.opts) ? skD.opts : []; if (typeof lsc.price === 'string' && skD.key && lsc.price.toLowerCase() === String(skD.key).toLowerCase()) delete lsc.price; } else { delete skD.kind; delete skD.opts; } markDirty(); renderAll(); return; }   // Stage 6 F5a2: a number or a choice (a choice is never the price)
        else if (c.indexOf('sys-list-statpdef') >= 0) { var spr = t.closest('.sys-list-stat'), spD = spr && Array.isArray(lsc.stats) ? lsc.stats[+spr.dataset.si] : null; if (!spD || typeof spD !== 'object') return; if (t.value) spD.def = t.value; else delete spD.def; }   // Stage 6 F5a2: a choice's default
        else if (c.indexOf('sys-list-statgm') >= 0) { var sgr = t.closest('.sys-list-stat'), sgD = sgr && Array.isArray(lsc.stats) ? lsc.stats[+sgr.dataset.si] : null; if (!sgD || typeof sgD !== 'object') return; if (t.checked) { sgD.vis = 'gm'; delete sgD.split; } else delete sgD.vis; }   // 1.6.0: a GM-only stat
        else if (c.indexOf('sys-list-statshow') >= 0 || c.indexOf('sys-list-stathide') >= 0) { var ssr = t.closest('.sys-list-stat'), ssD = ssr && Array.isArray(lsc.stats) ? lsc.stats[+ssr.dataset.si] : null; if (!ssD || typeof ssD !== 'object') return; statTick(ssD, c.indexOf('sys-list-stathide') >= 0 ? 'hide' : 'show', t.checked, ssr); }   // Stage 6 F4c1; 1.5.4: Hidden
        else if (c.indexOf('sys-list-xs') >= 0) { var xr2 = t.closest('.sys-list-xsrow'), xD2 = xr2 && Array.isArray(lsc.rolls) ? lsc.rolls[+xr2.dataset.ri] : null; if (!xD2 || typeof xD2 !== 'object') return; listCrossEdit(xD2, c, t); }   // 1.6.0: a row's counter crossing
        else if (c.indexOf('sys-list-blasthit') >= 0) { var rbh = t.closest('.sys-list-roll'), rbH = rbh && Array.isArray(lsc.rolls) ? lsc.rolls[+rbh.dataset.ri] : null; if (!rbH || typeof rbH !== 'object') return; if (t.checked) rbH.blastHit = true; else delete rbH.blastHit; }   // 1.6.2
        else if (c.indexOf('sys-list-burst') >= 0) { var rbu = t.closest('.sys-list-roll'), rbD = rbu && Array.isArray(lsc.rolls) ? lsc.rolls[+rbu.dataset.ri] : null; if (!rbD || typeof rbD !== 'object') return; if (t.value === 'attack' || t.value === 'extra') rbD.burst = t.value; else delete rbD.burst; }   // 1.6.0 A burst
        else if (c.indexOf('sys-list-mjdmg') >= 0) { var rmj = t.closest('.sys-list-roll'), rmD = rmj && Array.isArray(lsc.rolls) ? lsc.rolls[+rmj.dataset.ri] : null; if (!rmD || typeof rmD !== 'object') return; if (t.checked) rmD.dmgMajor = true; else delete rmD.dmgMajor; }   // 1.6.0: Always a Major Wound
        else if (c.indexOf('sys-list-hideoff') >= 0) { var hrw = t.closest('.sys-list-needsrow'), hR = hrw && Array.isArray(lsc.rolls) ? lsc.rolls[+hrw.dataset.ri] : null; if (!hR || typeof hR !== 'object') return; if (t.checked) hR.hideOff = true; else delete hR.hideOff; }   // 1.6.0: Hidden until it can be used
        else if (c.indexOf('sys-list-rsatype') >= 0) { var rat = t.closest('.sys-list-roll'), ratD = rat && Array.isArray(lsc.rolls) ? lsc.rolls[+rat.dataset.ri] : null; if (!ratD || typeof ratD !== 'object') return; if (t.value.trim()) ratD.attemptType = t.value.slice(0, LIMITS.formula); else delete ratD.attemptType; }   // 1.6.2: Attempt type
        else if (c.indexOf('sys-list-rsak') >= 0) { var rak = t.closest('.sys-list-roll'), rakD = rak && Array.isArray(lsc.rolls) ? lsc.rolls[+rak.dataset.ri] : null; if (!rakD || typeof rakD !== 'object') return; if (t.value) rakD.attemptKey = t.value; else delete rakD.attemptKey; }   // 1.6.0 An attempt's kind
        else if (c.indexOf('sys-list-rsnocrit') >= 0) { var rnc = t.closest('.sys-list-roll'), rnD = rnc && Array.isArray(lsc.rolls) ? lsc.rolls[+rnc.dataset.ri] : null; if (!rnD || typeof rnD !== 'object') return; if (t.checked) rnD.noResistOnCrit = true; else delete rnD.noResistOnCrit; }   // 1.6.0: Not resisted on a critical
        else if (c.indexOf('sys-list-anytime') >= 0) { var atr = t.closest('.sys-list-roll'), atD = atr && Array.isArray(lsc.rolls) ? lsc.rolls[+atr.dataset.ri] : null; if (!atD || typeof atD !== 'object') return; if (t.checked) atD.free = true; else delete atD.free; }   // 1.6.0 Any time
        else if (c.indexOf('sys-list-thru') >= 0) { var thr = t.closest('.sys-list-roll'), thD = thr && Array.isArray(lsc.rolls) ? lsc.rolls[+thr.dataset.ri] : null; if (!thD || typeof thD !== 'object') return; if (t.checked) thD.thru = true; else delete thD.thru; }   // 1.6.2
        else if (c.indexOf('sys-list-rsist') >= 0) { var rsr = t.closest('.sys-list-roll'), rsD = rsr && Array.isArray(lsc.rolls) ? lsc.rolls[+rsr.dataset.ri] : null; if (!rsD || typeof rsD !== 'object') return; if (t.checked) rsD.resist = true; else delete rsD.resist; markDirty(); renderAll(); return; }   // 1.6.0: a list's roll that Resists an attempt (the Or resisted by lists follow)
        else if (c.indexOf('sys-list-gmonly') >= 0) { var rgr = t.closest('.sys-list-roll'), rgD = rgr && Array.isArray(lsc.rolls) ? lsc.rolls[+rgr.dataset.ri] : null; if (!rgD || typeof rgD !== 'object') return; if (t.checked) rgD.gm = true; else delete rgD.gm; }   // 1.6.0: GM only
        else if (c.indexOf('sys-list-dmg') >= 0) { var rdr = t.closest('.sys-list-roll'), rdD = rdr && Array.isArray(lsc.rolls) ? lsc.rolls[+rdr.dataset.ri] : null; if (!rdD || typeof rdD !== 'object') return; if (t.checked) rdD.dmg = true; else { delete rdD.dmg; delete rdD.dmgMajor; } markDirty(); renderAll(); return; }   // 1.6.0: Always a Major Wound follows it   // chat cards: a damage roll
        else if (c.indexOf('sys-lroll-togm') >= 0) { var rgr = t.closest('.sys-list-roll'), rgD = rgr && Array.isArray(lsc.rolls) ? lsc.rolls[+rgr.dataset.ri] : null; if (!rgD || typeof rgD !== 'object') return; if (t.value === 'run' || t.value === 'wait') rgD.toGm = t.value; else delete rgD.toGm; }   // HR1
        else if (c.indexOf('sys-list-rolldie') >= 0) { var rir = t.closest('.sys-list-roll'), riD = rir && Array.isArray(lsc.rolls) ? lsc.rolls[+rir.dataset.ri] : null; if (!riD || typeof riD !== 'object') return; if (t.value) riD.die = t.value; else delete riD.die; }   // 1.5.8: the die a list roll's button wears
        else if (c.indexOf('sys-list-lnddmg') >= 0) { var ldr = t.closest('.sys-list-roll'), ldD = ldr && Array.isArray(lsc.rolls) ? lsc.rolls[+ldr.dataset.ri] : null; if (!ldD || typeof ldD !== 'object') return; if (t.value === '') delete ldD.landDmg; else ldD.landDmg = /^\d+$/.test(t.value) ? +t.value : t.value; }   // 1.6.3 (defense fold 1): Its damage, a place among this list's rolls or a system roll's id
        else if (c.indexOf('sys-list-rsby') >= 0) { var rbr = t.closest('.sys-list-roll'), rbD = rbr && Array.isArray(lsc.rolls) ? lsc.rolls[+rbr.dataset.ri] : null; if (!rbD || typeof rbD !== 'object') return; if (t.value) { rbD.resistBy = t.value; if (Array.isArray(rbD.resistOr)) { rbD.resistOr = rbD.resistOr.filter(function(x) { return x !== t.value; }); if (!rbD.resistOr.length) delete rbD.resistOr; } } else { delete rbD.resistBy; delete rbD.resistOr; } }   // 1.6.0 (B2)
        else if (c.indexOf('sys-list-rsor') >= 0) { var ror = t.closest('.sys-list-roll'), roD = ror && Array.isArray(lsc.rolls) ? lsc.rolls[+ror.dataset.ri] : null; if (!roD || typeof roD !== 'object') return; resistOrTick(roD, t); }   // 1.6.0 (the core's gap 5)
        else if (c.indexOf('sys-list-near') >= 0) { var nrr = t.closest('.sys-list-roll'), nrD = nrr && Array.isArray(lsc.rolls) ? lsc.rolls[+nrr.dataset.ri] : null; if (!nrD || typeof nrD !== 'object') return; if (t.value === 'near' || t.value === 'target') nrD.to = t.value; else delete nrD.to; }   // 1.5.9: Applies to
        else if (c.indexOf('sys-list-rollcost') >= 0) { var rcr = t.closest('.sys-list-roll'), rcD = rcr && Array.isArray(lsc.rolls) ? lsc.rolls[+rcr.dataset.ri] : null; if (!rcD || typeof rcD !== 'object') return; if (t.value) rcD.cost = t.value; else { delete rcD.cost; delete rcD.costN; } markDirty(); renderAll(); return; }
        else if (c.indexOf('sys-list-clockn') >= 0) { var ckR2 = t.closest('.sys-list-roll'), ckD = ckR2 && Array.isArray(lsc.rolls) ? lsc.rolls[+ckR2.dataset.ri] : null; if (!ckD || typeof ckD !== 'object') return; var ckL = Math.floor(Number(t.value)); if (t.value !== '' && ckL >= 0 && ckL <= 999) ckD.clockN = ckL; else delete ckD.clockN; }
        else if (c.indexOf('sys-list-costhow') >= 0) { var chR = t.closest('.sys-list-roll'), chD = chR && Array.isArray(lsc.rolls) ? lsc.rolls[+chR.dataset.ri] : null; if (!chD || typeof chD !== 'object') return; var chL = Math.floor(Number(t.value)); if (chL >= 2 && chL <= LIMITS.costN) chD.costN = chL; else delete chD.costN; }   // turn-based combat T1
        else if (c.indexOf('sys-list-rollkind') >= 0) { var rkr = t.closest('.sys-list-roll'), rkD = rkr && Array.isArray(lsc.rolls) ? lsc.rolls[+rkr.dataset.ri] : null; if (!rkD || typeof rkD !== 'object') return; if (rkD.label === 'New roll' && t.value === 'apply') rkD.label = 'New action'; else if (rkD.label === 'New action' && t.value !== 'apply') rkD.label = 'New roll'; /* 1.6.3: a starting name follows Roll and Apply */ if (t.value === 'apply') { if (!Array.isArray(rkD.apply)) rkD.apply = [{ f: '', formula: '' }]; } else delete rkD.apply; }   // Stage 6 HUD H7b: Roll | Apply (a formula typed before stays in the draft)
        else if (c.indexOf('sys-list-applyrolled') >= 0) { var arr = t.closest('.sys-list-applyrow'), arR = arr && Array.isArray(lsc.rolls) ? lsc.rolls[+arr.dataset.ri] : null, arK = arr && arr.dataset.k === 'then' ? 'then' : 'apply', arC = arR && Array.isArray(arR[arK]) ? arR[arK][+arr.dataset.ai] : null; if (!arC || typeof arC !== 'object') return; if (t.checked) arC.roll = true; else delete arC.roll; }   // 1.5.9: Rolled (Save keeps it only with a target and an amount)
        else if (c.indexOf('sys-list-applytarget') >= 0 || c.indexOf('sys-list-applyop') >= 0 || c.indexOf('sys-list-applywhen') >= 0) { var atr = t.closest('.sys-list-applyrow'), atR = atr && Array.isArray(lsc.rolls) ? lsc.rolls[+atr.dataset.ri] : null, atK = atr && atr.dataset.k === 'then' ? 'then' : 'apply', atC = atR && Array.isArray(atR[atK]) ? atR[atK][+atr.dataset.ai] : null; if (!atC || typeof atC !== 'object') return; if (c.indexOf('sys-list-applytarget') >= 0) { setChangeTarget(atC, t.value); markDirty(); renderAll(); return; } else if (c.indexOf('sys-list-applywhen') >= 0) { delete atC.band; if (String(t.value).indexOf('band:') === 0) { atC.band = t.value.slice(5); delete atC.when; } else if (t.value === 'hit' || t.value === 'miss' || t.value === 'malf' || t.value === 'crit' || t.value === 'fumble') atC.when = t.value; else delete atC.when; } else { delete atC.add; delete atC.set; delete atC.mark; delete atC.loss; if (t.value === 'add') atC.add = true; else if (t.value === 'set') atC.set = true; else if (t.value === 'loss') atC.loss = true; else if (MARK_HOW[t.value]) atC.mark = MARK_HOW[t.value]; } }   // R2b: a counter, a consequence's When; 1.6.2: or the fill rule
        else if (c.indexOf('sys-list-colmetric') >= 0 || c.indexOf('sys-list-statmetric') >= 0) { var mcol = c.indexOf('sys-list-colmetric') >= 0, mrw = t.closest(mcol ? '.sys-list-col' : '.sys-list-stat'), mLs = mcol ? lsc.cols : lsc.stats, mD = mrw && Array.isArray(mLs) ? mLs[+(mcol ? mrw.dataset.ci : mrw.dataset.si)] : null; if (!mD || typeof mD !== 'object') return; if (t.value === 'swap' || t.value === 'bare') mD.unitShow = t.value; else delete mD.unitShow; }   // 1.5.4: how a measure reads under Metric
        else if (c.indexOf('sys-list-loadfrom') >= 0) { if (t.value) { var ld0 = lsc.load && typeof lsc.load === 'object' ? lsc.load : {}, ct0 = Array.isArray(lsc.counters) && lsc.counters[0] && typeof lsc.counters[0].key === 'string' ? lsc.counters[0].key : ''; lsc.load = { from: t.value, ct: typeof ld0.ct === 'string' && ld0.ct ? ld0.ct : ct0 }; if (Array.isArray(ld0.cats)) lsc.load.cats = ld0.cats; ['needs', 'needsText', 'by', 'job'].forEach(function(k) { if (typeof ld0[k] === 'string' && ld0[k]) lsc.load[k] = ld0[k]; }); } else delete lsc.load; }   // 1.5.8 Loads from; 1.6.3: another list keeps what reads this list's own rows (Loads only where and its words, this list's half of Matched by, its job), and lets go of what read the old list's (that list's stat, Takes rows where)
        else if (c.indexOf('sys-list-chamberfrom') >= 0) { if (t.value) { var ch0 = lsc.chamber && typeof lsc.chamber === 'object' ? lsc.chamber : {}; lsc.chamber = Object.assign({}, ch0, { from: t.value }); if (typeof lsc.chamber.cap !== 'number') lsc.chamber.cap = 1; } else delete lsc.chamber; }   // 1.5.9 Chambers from
        else if (c.indexOf('sys-list-chambercap') >= 0) { if (lsc.chamber && typeof lsc.chamber === 'object') lsc.chamber.cap = Math.max(1, Math.min(CHAMBER_CAP || 320, parseInt(t.value, 10) || 1)); }
        else if (c.indexOf('sys-list-chamberholdsby') >= 0) { if (lsc.chamber && typeof lsc.chamber === 'object') { if (t.value) lsc.chamber.capBy = t.value; else delete lsc.chamber.capBy; } }   // the review of fold 2: Holds as the row's stat reads (Save keeps it only as a number stat of this list)
        else if (c.indexOf('sys-list-feedfrom') >= 0 || c.indexOf('sys-list-feedct') >= 0) { var fcr = t.closest('.sys-list-feed'), fdC = fcr && Array.isArray(lsc.feeds) ? lsc.feeds[+fcr.dataset.fi] : null; if (!fdC || typeof fdC !== 'object') return; var fcK = c.indexOf('sys-list-feedfrom') >= 0 ? 'from' : 'ct'; if (t.value) fdC[fcK] = t.value; else delete fdC[fcK]; }   // 1.6.0 Feeds
        else if (c.indexOf('sys-list-loadjob') >= 0) { if (lsc.load && typeof lsc.load === 'object') { if (t.value) lsc.load.job = t.value; else delete lsc.load.job; } }   // 1.6.2 Load takes a job
        else if (c.indexOf('sys-list-loadct') >= 0) { if (lsc.load && typeof lsc.load === 'object') { if (t.value) lsc.load.ct = t.value; else delete lsc.load.ct; } }
        else if (c.indexOf('sys-list-onceacross') >= 0) { if (lsc.once && typeof lsc.once === 'object') { if (t.checked) lsc.once.across = true; else delete lsc.once.across; } }   // 1.6.0 Across specialties
        else if (c.indexOf('sys-list-once') >= 0) {   // 1.5.8 Counted once (Save keeps it only with a group stat and a Higher by, each of this list)
            var oKey = c.indexOf('sys-list-onceby') >= 0 ? 'by' : c.indexOf('sys-list-oncerank') >= 0 ? 'rank' : c.indexOf('sys-list-oncecost') >= 0 ? 'cost' : c.indexOf('sys-list-oncefree') >= 0 ? 'free' : ''; if (!oKey) return;
            if (oKey === 'by' && !t.value) delete lsc.once;
            else { var oD = lsc.once && typeof lsc.once === 'object' ? lsc.once : (lsc.once = {}); if (t.value) oD[oKey] = t.value; else delete oD[oKey]; if (oKey === 'by' && !oD.rank) { var oN = (Array.isArray(lsc.stats) ? lsc.stats : []).filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.kind !== 'pick'; })[0]; oD.rank = lsc.lvl && typeof lsc.lvl === 'object' ? 'lvl' : oN ? oN.key : ''; if (!oD.rank) delete oD.rank; } }
        }
        else if (c.indexOf('sys-list-cond') >= 0) { if (t.value) lsc.cond = t.value; else delete lsc.cond; }   // 157 M1f
        else if (c.indexOf('sys-list-hot') >= 0) { if (t.value) lsc.hot = t.value; else delete lsc.hot; }   // 157 M1j
        else if (c.indexOf('sys-list-medit') >= 0) { if (t.value === 'ask' || t.value === 'gm') lsc.moneyEdits = t.value; else delete lsc.moneyEdits; }   // 157 M2
        else if (c.indexOf('sys-list-buyby') >= 0) { if (t.value) lsc.buyBy = t.value; else delete lsc.buyBy; }   // 157 M1c
        else if (c.indexOf('sys-list-sellby') >= 0) { if (t.value) lsc.sellBy = t.value; else delete lsc.sellBy; }   // 157 M1c
        else if (c.indexOf('sys-list-pcurby') >= 0) { if (t.value) lsc.priceCurBy = t.value; else delete lsc.priceCurBy; }   // 157 M1b: a choice of each row that names its price's currency
        else if (c.indexOf('sys-list-pcur') >= 0) { if (t.value) lsc.priceCur = t.value; else delete lsc.priceCur; }   // 157 M1b: the currency a price is set in
        else if (c.indexOf('sys-list-curby') >= 0) { if (t.value) lsc.curBy = t.value; else delete lsc.curBy; }   // 157 M1: a choice of each row that names its currency
        else if (c.indexOf('sys-list-cur') >= 0) { if (t.value) lsc.cur = t.value; else delete lsc.cur; }   // 157 M1: the currency the list holds
        else if (c.indexOf('sys-list-money') >= 0) { if (t.value) lsc.money = t.value; else delete lsc.money; }   // 1.5.6 the Money box (Save keeps a level only with one, a stat only as a number stat)
        else if (c.indexOf('sys-list-price') >= 0) { _priceAt.delete(lsc); if (t.value) lsc.price = t.value; else delete lsc.price; }
        else if (c.indexOf('sys-list-paycol') >= 0) { if (t.value) lsc.priceCol = t.value; else delete lsc.priceCol; }   // 1.6.2, backlog 234: Price from a column
        else return;
        markDirty(); renderAll(); return;
    }
    if (charRowChange(t)) return;   // 1.6.2 (backlog 59 f)
    var ctx = fieldOfRow(t); if (!ctx) return;
    var f = ctx.f, r = ctx.r;
    if (f) {
        if (c.indexOf('sys-kind') >= 0) { var kWas = f.kind; kindKeep(f, kWas, FIELD_KEEP); f.kind = t.value; delete f.formula; delete f.maxFormula; delete f.base; delete f.options; if (f.unit === 'height' || f.unit === 'weight' ? f.kind !== 'text' : f.kind === 'text') delete f.unit; if (f.kind !== 'number' && f.kind !== 'formula' && f.kind !== 'skill') { delete f.unitShow; delete f.decMin; delete f.decMax; delete f.group; } if (f.kind !== 'formula' && f.kind !== 'resource') { delete f.round; delete f.roundTo; delete f.roundAt; } f.def = f.kind === 'toggle' ? false : f.kind === 'text' || f.kind === 'select' ? '' : f.kind === 'resource' ? 'max' : 0; if (f.kind === 'resource' && f.min === undefined) f.min = 0; kindBack(f, f.kind, FIELD_KEEP); if (f.kind === 'resource' && !(typeof f.maxFormula === 'string' && f.maxFormula.trim())) f.maxFormula = '10'; /* 1.6.3 (the release click test): a new pool starts with a plain maximum of 10, as a box others depend on starts filled; one kept from before comes back above */ if (kWas === 'resource' && f.kind !== 'resource') hpPoolLeave(f.id); if (f.kind === 'resource') hpPoolFill(f.id); markDirty(); renderAll(); return; }
        if (c.indexOf('sys-edit') >= 0) f.edit = t.value;
        else if (c.indexOf('sys-vis') >= 0) f.vis = t.value;
        else if (c.indexOf('sys-hover-chk') >= 0) f.hover = t.checked;
        else if (c.indexOf('sys-live-sel') >= 0) { if (t.value === 'on') f.live = true; else if (t.value === 'off') f.live = false; else delete f.live; }   // the sheet's lock
        else if (c.indexOf('sys-tile-chk') >= 0) { if (t.checked) f.tile = true; else delete f.tile; }   // Stage 3: stat-tile display
        else if (c.indexOf('sys-sign-chk') >= 0) { if (t.checked) f.sign = true; else delete f.sign; }   // Stage 5g: color by sign
        else if (c.indexOf('sys-capat') >= 0) { if (t.value === 'info' || t.value === 'making') f.capAt = t.value; else delete f.capAt; }   // 1.6.3: where the caption shows
        else if (c.indexOf('sys-badge-chk') >= 0) { if (t.checked) f.badge = true; else delete f.badge; markDirty(); renderAll(); return; }   // L7: the tones row follows
        else if (t.classList.contains('sys-roundto')) { if (Number(t.value) >= 1) f.roundTo = Number(t.value); else delete f.roundTo; }   // clarity package: the place it rounds to (by the whole class: sys-round is a prefix of it and of sys-roundat)
        else if (t.classList.contains('sys-round')) { if (t.value) f.round = t.value; else { delete f.round; delete f.roundTo; } if (t.value !== 'from') delete f.roundAt; markDirty(); renderAll(); return; }   // ... and how: To and Up from follow
        else if (c.indexOf('sys-tone-sel') >= 0) { var tiN = Number(t.dataset.ti), tArr = Array.isArray(f.tones) ? f.tones.slice() : []; if (isFinite(tiN) && tiN >= 0 && tiN < LIMITS.labels) { while (tArr.length <= tiN) tArr.push(''); tArr[tiN] = t.value; while (tArr.length && !tArr[tArr.length - 1]) tArr.pop(); if (tArr.length) f.tones = tArr; else delete f.tones; } }   // L7
        else if (c.indexOf('sys-res-color') >= 0) { markDirty(); renderAll(); return; }   // L7: a color picked — "No color" appears
        else if (c.indexOf('sys-reset-chk') >= 0) { if (t.checked) f.reset = true; else delete f.reset; }   // Fold B: fill-to-max button
        else if (c.indexOf('sys-bar-chk') >= 0) { if (t.checked) delete f.bar; else f.bar = false; }   // Fold B: the bar (absent = shown)
        else if (c.indexOf('sys-negmin-chk') >= 0) { if (t.checked) { f.minNeg = true; delete f.min; } else delete f.minNeg; markDirty(); renderAll(); return; }   // 1.6.0: down to minus its max (the Min box goes while ticked)
        else if (c.indexOf('sys-colorband-chk') >= 0) { if (t.checked) f.colorBand = true; else delete f.colorBand; }   // 1.6.0: the pool's color on the band alone
        else if (c.indexOf('sys-spill-to') >= 0) { if (t.value) f.spill = Object.assign({}, f.spill && typeof f.spill === 'object' ? f.spill : {}, { to: t.value }); else delete f.spill; markDirty(); renderAll(); return; }   // 1.6.0 Spills into: from where follows
        else if (c.indexOf('sys-spill-at') >= 0) { if (f.spill && typeof f.spill === 'object') { if (t.value === 'neg' || t.value === 'f') f.spill.at = t.value; else delete f.spill.at; if (t.value !== 'f') delete f.spill.below; } markDirty(); renderAll(); return; }   // ... and the formula's box
        else if (c.indexOf('sys-slider-chk') >= 0) { if (t.checked) { f.slider = f.slider || {}; delete f.counter; } else delete f.slider; markDirty(); renderAll(); return; }   // Stage 5e: slider on/off (its row of labels and colors appears)
        else if (c.indexOf('sys-trackshape') >= 0) { var tkV = t.value, tkOf = f.track && typeof f.track === 'object' ? f.track.of : undefined; if (!tkV) delete f.track; else { f.track = tkV === 'each' ? { shape: 'boxes', each: true } : { shape: tkV }; if (tkOf) f.track.of = tkOf; else if (tkV === 'each') f.track.of = '4'; delete f.counter; } markDirty(); renderAll(); return; }   // 1.6.2: Shows as (a track takes a counter's place); 1.6.3 (Fulllion, 2026-11-20): boxes marked one by one need Out of, so they start at 4 where none is set
        else if (c.indexOf('sys-counter-chk') >= 0) { if (t.checked) { f.counter = true; delete f.slider; } else delete f.counter; markDirty(); renderAll(); return; }   // HUD frame (HF4a): counter on/off — a number is a counter or a slider, never both (the other's box hides)
        else if (c.indexOf('sys-slider-lowColor') >= 0 || c.indexOf('sys-slider-midColor') >= 0 || c.indexOf('sys-slider-highColor') >= 0) { markDirty(); renderAll(); return; }   // a color picked (the input handler stored it): redraw so "Theme colors" appears
        else if (c.indexOf('sys-itbl-on') >= 0) { if (t.checked) f.table = f.table || { columns: ['category'] }; else delete f.table; markDirty(); renderAll(); return; }   // Stage 4: rich item table on/off (seed one column so it renders)
        else if (c.indexOf('sys-itbl-col-') >= 0) { var col = c.slice(c.indexOf('sys-itbl-col-') + 13).split(/\s/)[0]; f.table = f.table || {}; var arr = Array.isArray(f.table.columns) ? f.table.columns : []; if (t.checked) { if (arr.indexOf(col) < 0) arr.push(col); } else arr = arr.filter(function(x) { return x !== col; }); f.table.columns = arr; }
        else if (c.indexOf('sys-itbl-chips') >= 0) { f.table = f.table || {}; if (t.checked) f.table.chips = true; else delete f.table.chips; }
        else if (c.indexOf('sys-itbl-footer') >= 0) { f.table = f.table || {}; if (t.checked) f.table.footer = true; else delete f.table.footer; }
        else if (c.indexOf('sys-def-bool') >= 0) f.def = t.checked;
        else if (c.indexOf('sys-vnames') >= 0 && f.kind === 'formula' && f.badge) { markDirty(); renderAll(); return; }   // L7: the tones row follows the value names
        else if (c.indexOf('sys-vnames') >= 0) { if (f.kind === 'number') { var rwV = t.closest('.sys-row'), dcV = rwV && rwV.querySelector('.sys-def'), wantCnt = !f.slider && !(Array.isArray(f.labels) && f.labels.length); if (rwV && !!rwV.querySelector('.sys-counter-chk') !== wantCnt) { if (Array.isArray(f.labels) && f.labels.length) delete f.counter; markDirty(); renderAll(); return; } if (dcV) buildDefCell(dcV, f); } markDirty(); patchErrors(); return; }   // HF4a: names given or cleared — the Counter box comes or goes (a named number is never a counter)   // Stage 6: a number's default cell follows (a pick of the names, or its own range back when they are cleared); nothing else in the row moves, so focus stays
        else if (c.indexOf('sys-def-lbl') >= 0) f.def = Number(t.value);
        else if (c.indexOf('sys-unit-text') >= 0) { if (t.value === 'height' || t.value === 'weight') f.unit = t.value; else delete f.unit; }   // 1.5.4: a text field's unit
        else if (c.indexOf('sys-metricshow') >= 0) { if (t.value === 'swap' || t.value === 'bare') f.unitShow = t.value; else delete f.unitShow; }   // 1.5.4: how a measure reads under Metric
        else if (c.indexOf('sys-group-chk') >= 0) { if (t.checked) f.group = true; else delete f.group; }   // 1.5.4: its thousands grouped
        else if (c.indexOf('sys-fieldtest') >= 0) { if (t.value) f.test = t.value; else delete f.test; markDirty(); renderAll(); return; }   // 1.6.2 (backlog 59): it rolls one of the system's tests
        else if (c.indexOf('sys-fielddie') >= 0) { if (t.value) f.rollDie = t.value; else delete f.rollDie; }   // 1.5.8: the die its roll button wears (Save keeps a name of the set)
        else return;
    } else if (r) {
        if (c.indexOf('sys-roll-kind') >= 0) { var rkWas = Array.isArray(r.apply) ? 'apply' : 'roll'; kindKeep(r, rkWas, ROLL_KEEP); if (r.label === 'New roll' && t.value === 'apply') r.label = 'New action'; else if (r.label === 'New action' && t.value !== 'apply') r.label = 'New roll'; if (t.value === 'apply') {   /* 1.6.3: a starting name follows Roll and Apply */ if (!Array.isArray(r.apply)) r.apply = [{ f: '', formula: '' }]; delete r.init; } else { delete r.apply; delete r.round; delete r.each; delete r.by; } kindBack(r, t.value === 'apply' ? 'apply' : 'roll', ROLL_KEEP); markDirty(); renderAll(); return; }   // Stage 6 HUD H7: Roll | Apply (a formula typed before stays in the draft)
        else if (c.indexOf('sys-apply-target') >= 0) { var chT = applyChangeOf(t, r); if (!chT) return; setChangeTarget(chT, t.value); markDirty(); renderAll(); return; }   // 1.6.0: a field, or an effect switched on or off
        else if (c.indexOf('sys-apply-link') >= 0) { var chLk = applyChangeOf(t, r); if (!chLk) return; if (t.value) chLk.link = t.value; else delete chLk.link; }   // 1.6.2 (12)
        else if (c.indexOf('sys-apply-op') >= 0) { var chO = applyChangeOf(t, r); if (!chO) return; delete chO.add; delete chO.set; delete chO.mark; delete chO.loss; if (t.value === 'add') chO.add = true; else if (t.value === 'set') chO.set = true; else if (t.value === 'loss') chO.loss = true; else if (MARK_HOW[t.value]) chO.mark = MARK_HOW[t.value]; }   // 1.6.2: or the fill rule
        else if (c.indexOf('sys-apply-rolled') >= 0) { var chRl = applyChangeOf(t, r); if (!chRl) return; if (t.checked) chRl.roll = true; else delete chRl.roll; }   // 1.5.9: Rolled (Save keeps it only with a target and an amount)
        else if (c.indexOf('sys-apply-when') >= 0) { var chW = applyChangeOf(t, r); if (!chW) return; delete chW.band; if (String(t.value).indexOf('band:') === 0) { chW.band = t.value.slice(5); delete chW.when; } else if (t.value === 'hit' || t.value === 'miss' || t.value === 'malf' || t.value === 'crit' || t.value === 'fumble') chW.when = t.value; else delete chW.when; }   // R1; 1.5.8: a critical success or failure
        else if (c.indexOf('sys-vis') >= 0) r.vis = t.value;
        else if (c.indexOf('sys-roll-tone') >= 0) { if (t.value) r.tone = t.value; else delete r.tone; }   // Stage 6 look fold
        else if (c.indexOf('sys-roll-togm') >= 0) { if (t.value === 'run' || t.value === 'wait') r.toGm = t.value; else delete r.toGm; }   // HR1
        else if (c.indexOf('sys-roll-die') >= 0) { if (t.value) r.die = t.value; else delete r.die; }
        else if (c.indexOf('sys-roll-drawfirst') >= 0) { if (t.value) r.drawFirst = t.value; else { delete r.drawFirst; delete r.drawN; } markDirty(); renderAll(); return; }   // 1.6.2: a card drawn as its die   // 1.5.8: the die its button wears (Save keeps a name of the set)
        else if (c.indexOf('sys-roll-drawn') >= 0) { var drN = Math.floor(Number(t.value)); if (drN >= 2 && drN <= 20) r.drawN = drN; else delete r.drawN; }   // 1.6.2: draw several at once
        else if (c.indexOf('sys-clockn') >= 0) { var ckN = Math.floor(Number(t.value)); if (t.value !== '' && ckN >= 0 && ckN <= 999) r.clockN = ckN; else delete r.clockN; }   // 1.6.2 (G10)
        else if (c.indexOf('sys-costhow') >= 0) { var chN = Math.floor(Number(t.value)); if (chN >= 2 && chN <= LIMITS.costN) r.costN = chN; else delete r.costN; }   // 1.6.2 (G10)
        else if (c.indexOf('sys-roll-cost') >= 0) { if (t.value) r.cost = t.value; else { delete r.cost; delete r.costN; } markDirty(); renderAll(); return; }   // turn-based combat T1
        else if (c.indexOf('sys-roll-near') >= 0) { if (t.value === 'near' || t.value === 'target') r.to = t.value; else delete r.to; }   // 1.5.9: Applies to (Save keeps it only on a roll that is not the initiative)
        else if (c.indexOf('sys-roll-each') >= 0) { delete r.round; if (t.value === 'round' || t.value === 'turn' || t.value === 'turnEnd') { r.each = t.value; if (!Array.isArray(r.apply) && r.by !== 'gm' && r.by !== 'owner') r.by = 'owner'; } else { delete r.each; delete r.by; } markDirty(); renderAll(); return; }   // 1.5.9: a roll is due for its player until another is picked   // Stage 6 HUD G10 + turn-based combat T2b
        else if (c.indexOf('sys-roll-by') >= 0) { if (t.value === 'gm' || t.value === 'owner') r.by = t.value; else delete r.by; }
        else if (c.indexOf('sys-roll-xs') >= 0) { if (crossEdit(r, c, t) === 'all') { markDirty(); renderAll(); return; } }   // 1.5.9 (book es/et plan 4a): When a value crosses
        else if (c.indexOf('sys-roll-evu') >= 0 || c.indexOf('sys-roll-evrest') >= 0 || c.indexOf('sys-roll-evwait') >= 0 || c.indexOf('sys-roll-ifu') >= 0 || c.indexOf('sys-roll-iffresh') >= 0 || c.indexOf('sys-roll-evask') >= 0 || c.indexOf('sys-roll-evhold') >= 0 || c.indexOf('sys-roll-ifhold') >= 0 || c.indexOf('sys-roll-tnote') >= 0) everyEdit(r, c, t);   // item 20 K5; backlog 152, fold 5: Waits in a fight, In a fight's unit and tick, Ask me first; 1.5.5: Only while its needs hold, in both rows
        else if (c.indexOf('sys-roll-mjdmg') >= 0) { if (t.checked) r.dmgMajor = true; else delete r.dmgMajor; }   // 1.6.0: Always a Major Wound
        else if (c.indexOf('sys-dmg-chk') >= 0) { if (t.checked) r.dmg = true; else { delete r.dmg; delete r.dmgMajor; } markDirty(); renderAll(); return; }   // chat cards: a damage roll
        else if (c.indexOf('sys-roll-keepscene') >= 0) { if (t.checked) r.keep = 'scene'; else delete r.keep; }   // 1.6.2 Kept for the scene
        else if (c.indexOf('sys-roll-anytime') >= 0) { if (t.checked) r.free = true; else delete r.free; }   // 1.6.0 Any time
        else if (c.indexOf('sys-roll-rsist') >= 0) { if (t.checked) r.resist = true; else { delete r.resist; delete r.withRow; } markDirty(); renderAll(); return; }   // 1.6.0 (B2): the Resisted by lists follow; 1.6.3: Answered with a row of goes with the tick
        else if (c.indexOf('sys-roll-anslist') >= 0) { if (t.value) r.withRow = t.value; else delete r.withRow; markDirty(); renderAll(); return; }   // 1.6.3 (defense fold 2): Answered with a row of
        else if (c.indexOf('sys-roll-lnddmg') >= 0) { if (t.value) r.landDmg = t.value; else delete r.landDmg; markDirty(); renderAll(); return; }   // 1.6.3 (defense fold 1): Its damage
        else if (c.indexOf('sys-roll-rsby') >= 0) { if (t.value) { r.resistBy = t.value; if (Array.isArray(r.resistOr)) { r.resistOr = r.resistOr.filter(function(x) { return x !== t.value; }); if (!r.resistOr.length) delete r.resistOr; } } else { delete r.resistBy; delete r.resistOr; } markDirty(); renderAll(); return; }   // 1.6.0 (B2)   // 1.6.0 (the core's gap 5): Or resisted by follows it
        else if (c.indexOf('sys-roll-rsor') >= 0) resistOrTick(r, t);   // 1.6.0 (the core's gap 5)
        else if (c.indexOf('sys-roll-hideoff') >= 0) { if (t.checked) r.hideOff = true; else delete r.hideOff; }   // 1.6.0: Hidden until it can be used
        else if (c.indexOf('sys-roll-rsnocrit') >= 0) { if (t.checked) r.noResistOnCrit = true; else delete r.noResistOnCrit; }   // 1.6.0: Not resisted on a critical
        else if (c.indexOf('sys-init-chk') >= 0) { r.init = t.checked; if (t.checked) draft.rolls.forEach(function(o) { if (o !== r) delete o.init; }); markDirty(); renderAll(); return; }
        else return;
    } else return;
    markDirty(); patchErrors();
}
function onClick(e) {
    if (!draft) return;
    var b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (onSwClick(b)) return;   // 1.6.0: an item's or an effect's roll bonuses
    // 1.6.3 (Fulllion's rulings of 2026-11-20: every other box of a field depends on its name, so a new field starts named, its short name following the
    // name until one is typed; the name is selected, so what is typed replaces it)
    if (b.id === 'sysAddField') { if (draft.fields.length >= LIMITS.fields) { toast('At most ' + LIMITS.fields + ' fields.'); return; } var nfF = { id: uid('f_'), key: '', label: 'New field', kind: 'number', def: 0, step: 1, edit: 'owner', vis: 'all', hover: false }; if (typeof keyFromLabel === 'function') { nfF.key = keyFromLabel(nfF.label, nfF); _keyAuto.add(nfF); } draft.fields.push(nfF); markDirty(); renderAll(); var last = ui('sysFieldRows').lastElementChild; if (last) { var k = last.querySelector('input.sys-label'); if (k) { k.focus(); if (k.select) k.select(); } last.scrollIntoView({ block: 'nearest' }); } return; }
    // 1.6.3 (Fulllion's rulings of 2026-11-20: a box others depend on is required, and a new name box starts with a plain name): a roll's name is its button,
    // its card and its place in every list that picks it, so + Roll starts as New roll with the name selected, ready to be typed over
    if (b.id === 'sysAddRoll') { draft.rolls.push({ id: uid('r_'), label: 'New roll', formula: '', vis: 'all' }); markDirty(); renderAll(); var lr = ui('sysRollRows').lastElementChild; if (lr) { var l = lr.querySelector('.sys-label'); if (l) { l.focus(); if (l.select) l.select(); } } return; }
    if (b.id === 'sysAddChar') { addCharAsk(); return; }
    if (b.id === 'sysAddItem') { if (!Array.isArray(draft.items)) draft.items = []; if (draft.items.length >= LIMITS.items) { toast('At most ' + LIMITS.items + ' items.'); return; } draft.items.push({ id: uid('i_'), name: 'New item', category: '', icon: '', notes: '', vis: 'all', area: null, damage: '', cost: '', throwSkill: '' }); markDirty(); renderAll(); var li = ui('sysItemRows').lastElementChild; if (li) { var n = li.querySelector('.sys-item-name'); if (n) { n.focus(); if (n.select) n.select(); } li.scrollIntoView({ block: 'nearest' }); } return; }   // 1.6.3 (Fulllion's rulings of 2026-11-20: a box others depend on starts filled): its name is what every list that picks it says
    if (b.id === 'sysAddList') { if (draft.fields.length >= LIMITS.fields) { toast('At most ' + LIMITS.fields + ' fields.'); return; } var nlF = { id: uid('f_'), key: '', label: 'New list', kind: 'item-list', list: {}, def: 0, edit: 'owner', vis: 'all', hover: false }; if (typeof keyFromLabel === 'function') { nlF.key = keyFromLabel(nlF.label, nlF); _keyAuto.add(nlF); } draft.fields.push(nlF); if (window.wpSysUi && window.wpSysUi.pickSet) window.wpSysUi.pickSet('lists', nlF.id); markDirty(); renderAll(); var nlB = ui('sysListRows') ? ui('sysListRows').querySelector('input.sys-list-name') : null; if (nlB) { nlB.focus(); if (nlB.select) nlB.select(); } return; }   // 1.6.2 (the owner, by prompt: "New list from the Lists tab")
    if (b.id === 'sysAddEffect') { if (!Array.isArray(draft.effects)) draft.effects = []; if (draft.effects.length >= LIMITS.effects) { toast('At most ' + LIMITS.effects + ' effects.'); return; } draft.effects.push({ id: uid('e_'), name: 'New effect', icon: '', tone: '', dur: '', notes: '', vis: 'all', mods: [] }); markDirty(); renderAll(); var lastE = ui('sysEffectRows') && ui('sysEffectRows').lastElementChild; if (lastE) { var ni = lastE.querySelector('.sys-fx-name'); if (ni) { ni.focus(); if (ni.select) ni.select(); } } return; }   // 5h; 1.6.3: it starts named, as + Item does
    if (b.dataset.topic && window.wpSysUi) { window.wpSysUi.topicPress(b.dataset.set, b.dataset.topic); return; }   // 1.6.2: a topic down the side, nothing drawn again
    if (b.dataset.tab) { tabSet(b.dataset.tab); _tabPress = true; try { renderAll(); } finally { _tabPress = false; } sidePrevSync(); return; }
    if (b.id === 'sysPreviewBtn') { sidePrevSet(!_sidePrev); sidePrevSync(); return; }   // 1.6.2: Preview beside any tab
    if (onLayoutClick(b)) return;
    if (!b.dataset.act) return;
    if (turnClick(b)) return;   // turn-based combat T1: the Combat tab's actions and time units
    if (lightClick(b)) return;   // lighting L4: the Combat tab's light presets
    if (sensesClick(b)) return;   // senses S2a: the Combat tab's senses
    if (rangeClick(b)) return;   // range penalties R1: the Combat tab's range table
    if (postureClick(b)) return;   // conditions C3: the Combat tab
    if (heightClick(b)) return;   // item 19 H2: the Combat tab's height table
    if (calendarClick(b)) return;   // item 20 K1: the Calendar tab
    if (budgetClick(b)) return;   // 126: the Lists tab's point budgets
    if (envClick(b)) return;   // 1.6.0: the Environment readings
    if (tableClick(b)) return;   // 1.6.0: the Tables box
    if (barsClick(b)) return;   // backlog 28: the Combat tab's Token bars
    if (linkClick(b)) return;   // 1.6.0: the Linked sheets
    if (damageClick(b)) return;   // 1.5.6: the Taking damage box
    if (typeof coverHitClick === 'function' && coverHitClick(b)) return;   // 1.6.0: where a hit behind cover lands
    if (charRowClick(b)) return;   // 1.6.2 (backlog 59 f)
    var erow = b.closest('.sys-fx-row');   // 5h: a library effect's buttons
    if (erow) {
        if (!b.dataset.act) return;
        var ed = (draft.effects || []).find(function(x) { return x.id === erow.dataset.eid; }); if (!ed) return;
        var ei = draft.effects.indexOf(ed), eact = b.dataset.act;
        if (/^apply(add|up|down|del)$/.test(eact) && b.closest('.sys-fx-endrow')) {   // 1.6.2: an effect's end, its rows
            var eRw = b.closest('.sys-apply-row'), eArr = Array.isArray(ed.end) ? ed.end : (ed.end = []), eI = eRw ? +eRw.dataset.ai : -1;
            if (eact === 'applyadd') { if (eArr.length >= LIMITS.applyChanges) { toast('At most ' + LIMITS.applyChanges + ' changes.'); return; } eArr.push({ f: '', formula: '' }); }
            else if (eact === 'applyup' && eI > 0 && eI < eArr.length) { var eu = eArr[eI]; eArr[eI] = eArr[eI - 1]; eArr[eI - 1] = eu; }
            else if (eact === 'applydown' && eI >= 0 && eI < eArr.length - 1) { var ed2 = eArr[eI]; eArr[eI] = eArr[eI + 1]; eArr[eI + 1] = ed2; }
            else if (eact === 'applydel' && eI >= 0 && eI < eArr.length) eArr.splice(eI, 1);
            if (!eArr.length) delete ed.end;
            markDirty(); renderAll(); return;
        }
        if (eact === 'up' && ei > 0) { draft.effects.splice(ei, 1); draft.effects.splice(ei - 1, 0, ed); }
        else if (eact === 'down' && ei < draft.effects.length - 1) { draft.effects.splice(ei, 1); draft.effects.splice(ei + 1, 0, ed); }
        else if (eact === 'dup') { var dd = clone(ed); dd.id = uid('e_'); if (dd.name) dd.name = dd.name + ' copy'; draft.effects.splice(ei + 1, 0, dd); }
        else if (eact === 'del') { if (typeof usedAsk === 'function') { usedAsk('effect', ed, function() { var j = draft.effects.indexOf(ed); if (j >= 0) draft.effects.splice(j, 1); markDirty(); renderAll(); }); return; } draft.effects.splice(ei, 1); }   // 1.6.3 (finding 9): asked first where something uses it
        else if (eact === 'fxmodadd') {
            var tg = fxTargets(draft)[0]; if (!tg) return; ed.mods = Array.isArray(ed.mods) ? ed.mods : [];
            if (ed.mods.length >= LIMITS.effectMods) { toast('At most ' + LIMITS.effectMods + ' changes per effect.'); return; }
            var tp2 = tg[0].split('|'), nm2 = { f: tp2[0], op: tp2[1] === 'on' ? 'on' : 'add' }; if (nm2.op === 'add') { nm2.v = 1; if (tp2[1] === 'max') nm2.part = 'max'; }
            ed.mods.push(nm2);
        }
        else if (eact === 'fxmoddel') { var dln = b.closest('.sys-fx-mod'); if (dln) (ed.mods || []).splice(+dln.dataset.mi, 1); }
        else return;
        markDirty(); renderAll(); return;
    }
    var irow = b.closest('.sys-item-row');
    if (irow) {
        if (!b.dataset.act) return;
        var iitem = (draft.items || []).find(function(x) { return x.id === irow.dataset.iid; }); if (!iitem) return;
        var ii = draft.items.indexOf(iitem), iact = b.dataset.act;
        if (iact === 'up' && ii > 0) { draft.items.splice(ii, 1); draft.items.splice(ii - 1, 0, iitem); }
        else if (iact === 'down' && ii < draft.items.length - 1) { draft.items.splice(ii, 1); draft.items.splice(ii + 1, 0, iitem); }
        else if (iact === 'dup') { var di = clone(iitem); di.id = uid('i_'); if (di.name) di.name = di.name + ' copy'; draft.items.splice(ii + 1, 0, di); }
        else if (iact === 'del') { if (typeof usedAsk === 'function') { usedAsk('item', iitem, function() { var j = draft.items.indexOf(iitem); if (j >= 0) draft.items.splice(j, 1); markDirty(); renderAll(); }); return; } draft.items.splice(ii, 1); }   // 1.6.3 (finding 9)
        else if (iact === 'itemmodadd') {   // F6
            var tgI = fxTargets(draft)[0]; if (!tgI) return; iitem.mods = Array.isArray(iitem.mods) ? iitem.mods : [];
            if (iitem.mods.length >= LIMITS.effectMods) { toast('At most ' + LIMITS.effectMods + ' changes per item.'); return; }
            var tpI = tgI[0].split('|'), nmI = { f: tpI[0], op: tpI[1] === 'on' ? 'on' : 'add' }; if (nmI.op === 'add') { nmI.v = 1; if (tpI[1] === 'max') nmI.part = 'max'; }
            iitem.mods.push(nmI);
        }
        else if (iact === 'itemmoddel') { var dlI = b.closest('.sys-item-mod'); if (dlI) (iitem.mods || []).splice(+dlI.dataset.mi, 1); }
        else if (iact === 'affadd') {   // 1.5.9 (es): an affliction, at first on the system's first effect, resisted against nothing yet (Save says so under it)
            var fx0 = (draft.effects || []).filter(function(d) { return d && typeof d.id === 'string'; })[0]; if (!iitem.area || !fx0) return;
            var aA = Array.isArray(iitem.area.aff) ? iitem.area.aff : (iitem.area.aff = []); if (aA.length >= (LIMITS.areaAffs || 2)) { toast('At most ' + (LIMITS.areaAffs || 2) + ' afflictions an item.'); return; }
            var aN = { vs: '', fx: fx0.id }; if (!(typeof iitem.damage === 'string' && iitem.damage.trim())) aN.who = 'all'; aA.push(aN);   // 1.6.3: with no Damage it hurts no one, so a new one starts reaching everyone
        }
        else if (iact === 'grantsdel') { var dlS = b.closest('.sys-grant'), slS = b.closest('.sys-grant-sline'), gS2 = dlS && Array.isArray(iitem.grants) ? iitem.grants[+dlS.dataset.gi] : null; if (gS2 && gS2.stats && slS) { delete gS2.stats[slS.dataset.sk]; if (!Object.keys(gS2.stats).length) delete gS2.stats; } }   // 1.6.2 (body fold 1)
        else if (iact === 'grantdel') { var dlG = b.closest('.sys-grant'); if (dlG && Array.isArray(iitem.grants)) { iitem.grants.splice(+dlG.dataset.gi, 1); if (!iitem.grants.length) delete iitem.grants; } }   // 1.6.0 (v2, B4)
        else if (iact === 'affdel') { var dlA = b.closest('.sys-item-aff'), aD = iitem.area && Array.isArray(iitem.area.aff) ? iitem.area.aff : null; if (dlA && aD) { aD.splice(+dlA.dataset.ai, 1); if (!aD.length) delete iitem.area.aff; } }
        else return;
        markDirty(); renderAll(); return;
    }
    var lcb = listOfCard(b);
    if (lcb && /^lapply(add|up|down|del)$/.test(b.dataset.act || '')) {   // Stage 6 HUD H7b: a list action's change buttons (add, move, remove)
        var lsa = lcb.list || {}, aHost = b.closest('.sys-list-applyrow'), aRi = aHost ? +aHost.dataset.ri : +b.dataset.ri, aRoll = Array.isArray(lsa.rolls) ? lsa.rolls[aRi] : null, aK2 = ((aHost && aHost.dataset.k) || b.dataset.k) === 'then' ? 'then' : 'apply'; if (!aRoll || typeof aRoll !== 'object') return;   // R2b: or a roll's consequences
        if (!Array.isArray(aRoll[aK2])) { if (aK2 !== 'then') return; aRoll.then = []; }
        var aArr2 = aRoll[aK2], aAct = b.dataset.act, aJ = aHost ? +aHost.dataset.ai : -1;
        if (aAct === 'lapplyadd') { if (aArr2.length >= LIMITS.applyChanges) { toast('At most ' + LIMITS.applyChanges + ' changes an action.'); return; } aArr2.push({ f: '', formula: '' }); }
        else if (aAct === 'lapplyup' && aJ > 0 && aJ < aArr2.length) { var auT = aArr2[aJ]; aArr2[aJ] = aArr2[aJ - 1]; aArr2[aJ - 1] = auT; }
        else if (aAct === 'lapplydown' && aJ >= 0 && aJ < aArr2.length - 1) { var adT = aArr2[aJ]; aArr2[aJ] = aArr2[aJ + 1]; aArr2[aJ + 1] = adT; }
        else if (aAct === 'lapplydel' && aJ >= 0 && aJ < aArr2.length) aArr2.splice(aJ, 1);
        else return;
        if (aK2 === 'then' && !aArr2.length) delete aRoll.then;   // R2b: no consequences left
        markDirty(); renderAll(); return;
    }
    if (lcb && /^lvlcap(add|del)$/.test(b.dataset.act || '')) {   // 1.6.0 At most at a level: a cap added (at the level a new row starts at, one row) or removed
        var lvC = lcb.list && lcb.list.lvl && typeof lcb.list.lvl === 'object' ? lcb.list.lvl : null; if (!lvC) return;
        var cArr = Array.isArray(lvC.caps) ? lvC.caps : [];
        if (b.dataset.act === 'lvlcapadd') { if (cArr.length >= LIMITS.lvlCaps) { toast('At most ' + LIMITS.lvlCaps + ' caps a list.'); return; } cArr.push({ at: typeof lvC.def === 'number' ? lvC.def : typeof lvC.min === 'number' ? lvC.min : 0, n: 1 }); lvC.caps = cArr; }
        else { var cRw = b.closest('.sys-list-lcap'), cI = cRw ? +cRw.dataset.ci : -1; if (!(cI >= 0 && cI < cArr.length)) return; cArr.splice(cI, 1); }
        if (!cArr.length) delete lvC.caps;
        markDirty(); renderAll(); return;
    }
    if (b.dataset.act === 'holdadd' || b.dataset.act === 'holddel') {   // 1.6.0 Who holds whom: on, with the first effect of the library, or off
        var cmH = draft.combat || (draft.combat = {}), fxH = (Array.isArray(draft.effects) ? draft.effects : []).filter(function(e) { return e && typeof e.id === 'string'; })[0];
        if (b.dataset.act === 'holddel') delete cmH.holds; else if (fxH) cmH.holds = { held: fxH.id };
        markDirty(); renderAll(); return;
    }
    if (lcb && /^feed(add|del)$/.test(b.dataset.act || '')) {   // 1.6.0 Feeds: a Lists card's feed buttons
        var lsf = lcb.list || (lcb.list = {}), fArr = Array.isArray(lsf.feeds) ? lsf.feeds : [];
        if (b.dataset.act === 'feedadd') { if (fArr.length >= FEEDS_MAX) { toast('At most ' + FEEDS_MAX + ' feeds a list.'); return; } var fkN = 1, fkT = {}; fArr.forEach(function(x) { if (x && typeof x.key === 'string') fkT[x.key.toLowerCase()] = 1; }); while (fkT['feed' + fkN]) fkN++; fArr.push({ key: 'Feed' + fkN }); lsf.feeds = fArr; }   // 1.6.3 (finding 17): a new feed's short name is made for it, the first FeedN no other feed of the list holds, and stands out of sight with the other short names
        else { var fRow = b.closest('.sys-list-feed'), fI = fRow ? +fRow.dataset.fi : -1; if (!(fI >= 0 && fI < fArr.length)) return; fArr.splice(fI, 1); }
        if (!fArr.length) delete lsf.feeds;
        markDirty(); renderAll(); return;
    }
    if (lcb && /^roll(add|up|down|del)$/.test(b.dataset.act || '')) {   // Stage 6 F5b: a Lists card's roll buttons (add, move, remove)
        var lsr = lcb.list || (lcb.list = {}), rArr = Array.isArray(lsr.rolls) ? lsr.rolls : [], ract = b.dataset.act, rRow = b.closest('.sys-list-roll'), rI = rRow ? +rRow.dataset.ri : -1;
        if (ract === 'rolladd') { if (rArr.length >= LIMITS.rowRolls) { toast('At most ' + LIMITS.rowRolls + ' rolls a list.'); return; } rArr.push({ label: 'New roll', formula: '' }); lsr.rolls = rArr; }   // 1.6.3: a list's new roll starts with a plain name, as the Rolls tab's does
        else if (ract === 'rollup' && rI > 0 && rI < rArr.length) { var ruS = rArr[rI]; rArr[rI] = rArr[rI - 1]; rArr[rI - 1] = ruS; }
        else if (ract === 'rolldown' && rI >= 0 && rI < rArr.length - 1) { var rdS = rArr[rI]; rArr[rI] = rArr[rI + 1]; rArr[rI + 1] = rdS; }
        else if (ract === 'rolldel' && rI >= 0 && rI < rArr.length) rArr.splice(rI, 1);
        else return;
        if (!rArr.length) delete lsr.rolls;
        markDirty(); renderAll(); return;
    }
    if (lcb && /^ct(add|up|down|del)$/.test(b.dataset.act || '')) {   // Stage 6 HUD R2: a Lists card's counter buttons (add, move, remove)
        var lst = lcb.list || (lcb.list = {}), tArr = Array.isArray(lst.counters) ? lst.counters : [], tact = b.dataset.act, tRow = b.closest('.sys-list-ct'), tI = tRow ? +tRow.dataset.ti : -1;
        if (tact === 'ctadd') { if (tArr.length >= LIMITS.rowCounters) { toast('At most ' + LIMITS.rowCounters + ' counters a list.'); return; } tArr.push({ key: '', label: '' }); lst.counters = tArr; }
        else if (tact === 'ctup' && tI > 0 && tI < tArr.length) { var tuS = tArr[tI]; tArr[tI] = tArr[tI - 1]; tArr[tI - 1] = tuS; }
        else if (tact === 'ctdown' && tI >= 0 && tI < tArr.length - 1) { var tdS = tArr[tI]; tArr[tI] = tArr[tI + 1]; tArr[tI + 1] = tdS; }
        else if (tact === 'ctdel' && tI >= 0 && tI < tArr.length) tArr.splice(tI, 1);
        else return;
        if (!tArr.length) delete lst.counters;
        markDirty(); renderAll(); return;
    }
    if (lcb && /^col(add|up|down|del)$/.test(b.dataset.act || '')) {   // Stage 6 F5a1: a Lists card's column buttons (add, move, remove)
        var lsq = lcb.list || (lcb.list = {}), cArr = Array.isArray(lsq.cols) ? lsq.cols : [], cact = b.dataset.act, cRow = b.closest('.sys-list-col'), cI = cRow ? +cRow.dataset.ci : -1;
        if (cact === 'coladd') { if (cArr.length >= LIMITS.listCols) { toast('At most ' + LIMITS.listCols + ' columns a list.'); return; } cArr.push({ key: '', label: '', formula: '' }); lsq.cols = cArr; }
        else if (cact === 'colup' && cI > 0 && cI < cArr.length) { var cuS = cArr[cI]; cArr[cI] = cArr[cI - 1]; cArr[cI - 1] = cuS; }
        else if (cact === 'coldown' && cI >= 0 && cI < cArr.length - 1) { var cdS = cArr[cI]; cArr[cI] = cArr[cI + 1]; cArr[cI + 1] = cdS; }
        else if (cact === 'coldel' && cI >= 0 && cI < cArr.length) cArr.splice(cI, 1);
        else return;
        if (!cArr.length) delete lsq.cols;
        markDirty(); renderAll(); return;
    }
    if (lcb) {   // Stage 6 F4c1: a Lists card's stat buttons (add, move, remove — a removed price goes with its stat)
        var lsb = lcb.list || (lcb.list = {}), sArr = Array.isArray(lsb.stats) ? lsb.stats : [], sact = b.dataset.act, sRow = b.closest('.sys-list-stat'), sI = sRow ? +sRow.dataset.si : -1;
        if (sact === 'statadd') { if (sArr.length >= LIMITS.listStats) { toast('At most ' + LIMITS.listStats + ' stats a list.'); return; } sArr.push({ key: '', label: '' }); lsb.stats = sArr; }
        else if (sact === 'statup' && sI > 0 && sI < sArr.length) { var su = sArr[sI]; sArr[sI] = sArr[sI - 1]; sArr[sI - 1] = su; }
        else if (sact === 'statdown' && sI >= 0 && sI < sArr.length - 1) { var sdn = sArr[sI]; sArr[sI] = sArr[sI + 1]; sArr[sI + 1] = sdn; }
        else if (sact === 'statdel' && sI >= 0 && sI < sArr.length) { var gone = sArr.splice(sI, 1)[0]; if (gone && typeof gone.key === 'string' && typeof lsb.price === 'string' && lsb.price.toLowerCase() === gone.key.toLowerCase()) delete lsb.price; }
        else return;
        _priceAt.delete(lsb);
        _perAt.delete(lsb); if (sact === 'statdel' && gone && typeof gone.key === 'string' && lsb.on && typeof lsb.on === 'object' && typeof lsb.on.per === 'string' && lsb.on.per.toLowerCase() === gone.key.toLowerCase()) { delete lsb.on.per; lsb.on.one = true; }   // 1.5.4: One at a time by a stat removed goes by the whole list, whether the system was saved in between or not
        if (!sArr.length) { delete lsb.stats; delete lsb.price; }
        markDirty(); renderAll(); return;
    }
    var ctx = fieldOfRow(b); if (!ctx) return;
    var list = ctx.f ? draft.fields : draft.rolls, item = ctx.f || ctx.r; if (!item) return;
    var i = list.indexOf(item), act = b.dataset.act;
    if (ctx.r && /^apply(add|up|down|del)$/.test(act || '')) {   // Stage 6 HUD H7: an apply action's changes (add, move, remove)
        var aRow = b.closest('.sys-apply-row'), aK = ((aRow && aRow.dataset.k) || b.dataset.k) === 'then' ? 'then' : 'apply', aArr = Array.isArray(ctx.r[aK]) ? ctx.r[aK] : (ctx.r[aK] = []), aI = aRow ? +aRow.dataset.ai : -1;   // R1: or a roll's consequences
        if (act === 'applyadd') { if (aArr.length >= LIMITS.applyChanges) { toast('At most ' + LIMITS.applyChanges + ' changes an action.'); return; } aArr.push({ f: '', formula: '' }); }
        else if (act === 'applyup' && aI > 0 && aI < aArr.length) { var auS = aArr[aI]; aArr[aI] = aArr[aI - 1]; aArr[aI - 1] = auS; }
        else if (act === 'applydown' && aI >= 0 && aI < aArr.length - 1) { var adS = aArr[aI]; aArr[aI] = aArr[aI + 1]; aArr[aI + 1] = adS; }
        else if (act === 'applydel' && aI >= 0 && aI < aArr.length) aArr.splice(aI, 1);
        else return;
        if (aK === 'then' && !aArr.length) delete ctx.r.then;   // R1: no consequences left
        markDirty(); renderAll(); return;
    }
    if (act === 'up' && i > 0) { list.splice(i, 1); list.splice(i - 1, 0, item); }
    else if (act === 'down' && i < list.length - 1) { list.splice(i, 1); list.splice(i + 1, 0, item); }
    else if (act === 'dup') { var d = clone(item); d.id = uid(ctx.f ? 'f_' : 'r_'); if (ctx.f) { _keyAuto.add(d); d.key = keyFromLabel(d.label, d) || (d.key ? d.key + '2' : ''); } else if (d.key) d.key = d.key + '2'; list.splice(i + 1, 0, d); }   // 1.6.2: a copied field is a new one, so its short name follows its label as a new field's does
    else if (act === 'del') { if (typeof usedAsk === 'function') { usedAsk(ctx.f ? 'field' : 'roll', item, function() { var j = list.indexOf(item); if (j >= 0) list.splice(j, 1); markDirty(); renderAll(); }); return; } list.splice(i, 1); }   // 1.6.3 (finding 9): a field, a list or a roll other parts use asks first
    else if (act === 'slidercl' && item.slider) { delete item.slider.lowColor; delete item.slider.midColor; delete item.slider.highColor; }   // Stage 5e: the track back to the theme's colors
    else if (act === 'rescolorclr') { delete item.color; delete item.colorBand; }   // Stage 6 look fold (L7): the pool back to the theme's colors
    else return;
    markDirty(); renderAll();
}
function runTest() {
    if (!draft || !F()) return;
    var clean = cleanSystem(draft, { F: F(), gmView: true }); if (!clean) return;
    var all = resolveAll(clean, null, F()), out = ui('sysTestOut'); out.textContent = '';
    // 1.6.3 (the review of the System editor, finding 40): a fault is said through plainMessage with the system first (it was handed the fault alone,
    // and said nothing), and where there are many fields a Find box stands above them, which keeps only the lines that hold its words
    var lines = [];
    clean.fields.forEach(function(f) { var e = all[f.id]; var line = el('div', 'sys-test-line' + (e.error ? ' sys-err-line' : '')); line.textContent = (f.label || f.key) + ': ' + (e.error ? (typeof plainMessage === 'function' ? plainMessage(clean, e.error) : e.error) : e.text); lines.push(line); });
    if (lines.length > 12) { var fnd = el('input', 'field sys-test-find'); fnd.type = 'search'; fnd.placeholder = 'Find a field'; fnd.setAttribute('aria-label', 'Find a field'); fnd.addEventListener('input', function(ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); var q = fnd.value.trim().toLowerCase(); lines.forEach(function(l) { l.hidden = !!q && String(l.textContent).toLowerCase().indexOf(q) < 0; }); }); out.appendChild(fnd); }
    lines.forEach(function(l) { out.appendChild(l); });
    if (!clean.fields.length) out.appendChild(el('div', 'sys-note', 'There is no field to work out yet.'));
}
// [systemcheck:starters-start]
// 1.6.2 (the owner, 2026-11-07, by prompt: "Replace with CORE", "System and all ten packs"): the starters a system can begin from are listed in
// assets/systems/starters.json ({ starters: [{ id, name, packs?: [file] }] }), read once; a starter's packs are fetched with it and kept waiting
// until Save, which writes them into the campaign's library (wpLibrary.starterPacks), since the library cleans each entry against the saved system.
// An id and a pack file are names of the app's own folder only. With no list the page's own options stand
var _starters = null;   // _starterPacks stands beside the editor's state (var draft)
var STARTER_ID = /^[a-z0-9-]{1,40}$/, STARTER_FILE = /^[A-Za-z0-9_-]{1,60}(\/[A-Za-z0-9_.-]{1,80})?\.wppack\.json$/;
function cleanStarters(j) {
    var out = [], seen = Object.create(null), src = j && typeof j === 'object' && Array.isArray(j.starters) ? j.starters : [];
    src.slice(0, 16).forEach(function(s) {
        if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !STARTER_ID.test(s.id) || s.id === 'blank' || seen[s.id]) return;
        var nm = typeof s.name === 'string' ? s.name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : ''; if (!nm) return;
        var ps = (Array.isArray(s.packs) ? s.packs : []).filter(function(p) { return typeof p === 'string' && STARTER_FILE.test(p) && p.indexOf('..') < 0; }).slice(0, 32);
        seen[s.id] = 1; var o = { id: s.id, name: nm }; if (ps.length) o.packs = ps; out.push(o);
    });
    return out;
}
function startersLoad() {
    if (_starters) return Promise.resolve(_starters);
    return fetch('assets/systems/starters.json', { cache: 'no-store' }).then(function(r) { if (!r.ok) throw new Error('missing'); return r.json(); }).then(function(j) { _starters = cleanStarters(j); return _starters; }).catch(function() { return null; });
}
function startersFill(sel, list) {   // the Start from list: Start from, Blank, then each starter by its name, as option elements with text
    if (!sel || !Array.isArray(list) || !list.length) return;
    while (sel.options.length > 2) sel.remove(2);
    list.forEach(function(s) { var o = document.createElement('option'); o.value = s.id; o.textContent = s.name; sel.appendChild(o); });
}
function starterOf(id) { return (_starters || []).filter(function(s) { return s.id === id; })[0] || null; }
function starterPacksGet(st) {   // the starter's packs as text, all or none
    return Promise.all(st.packs.map(function(p) { return fetch('assets/systems/' + p, { cache: 'no-store' }).then(function(r) { if (!r.ok) throw new Error('missing'); return r.text(); }); }));
}
function starterSaved() {   // after Save: the waiting packs written, and said
    var sp = _starterPacks; starterPacksSet(null); if (!sp || !window.wpLibrary || !window.wpLibrary.starterPacks) return;
    window.wpLibrary.starterPacks(sp.texts).then(function(r) {
        if (!r || r.error) { toast((r && r.error) || 'The starter\u2019s packs could not be added.'); return; }
        toast(sp.name + '\u2019s library: ' + r.packs + ' pack' + (r.packs === 1 ? '' : 's') + ', ' + r.add + ' entr' + (r.add === 1 ? 'y' : 'ies') + ' added' + (r.update ? ', ' + r.update + ' updated' : '') + (r.skip ? ', ' + r.skip + ' passed over, their ids already in another pack' : '') + (r.bad ? '. ' + r.bad + ' could not be added' : '') + '.');
        if (typeof renderAll === 'function' && draft) renderAll();
    }).catch(function() { toast('The starter\u2019s packs could not be added.'); });
}
// [systemcheck:starters-end]
// 1.6.3 (Fulllion's rulings of 2026-11-20, lane B batch "damage"): Damage subtracts from (the Combat tab's hpResource) is required, since Full auto
// blasts and the Take damage window take damage off it. So it starts filled: the first pool the draft gets fills it while it is empty (id, the field
// just made a pool), and a starter that holds a pool and names none starts on its first pool (no id). A pick already made is never changed, and a
// system as it was saved is never touched here. An empty one is said under the Taking damage box
// 1.6.3 (the review of the System editor, finding 34; Fulllion's pick of 2026-11-21): the first pool made still becomes the damage pool, and a
// notice says so once a pool, naming where to change it, since a first pool named Mana would otherwise take every wound unseen. hpPoolFill.auto is
// the pool this fill set in this draft: a field the fill made the damage pool that is turned to another kind lets it go again (hpPoolLeave), and the
// next pool, if any, takes its place, so a kind picked by mistake leaves no field that is no pool as the damage pool. hpPoolFill.said holds the pools
// a notice was given for. Both are kept on the function itself, so a suite that runs these two functions alone needs nothing more
function hpPoolFill(id) {
    if (!draft) return; var cm = draft.combat && typeof draft.combat === 'object' && !Array.isArray(draft.combat) ? draft.combat : null; if (cm && cm.hpResource) return;
    var pool = id || ((draft.fields || []).filter(function(f) { return !!f && f.kind === 'resource' && typeof f.id === 'string' && !!f.id; })[0] || {}).id; if (!pool) return;
    if (!cm) cm = draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }; cm.hpResource = pool; hpPoolFill.auto = { d: draft, id: pool };
    var said = hpPoolFill.said || (hpPoolFill.said = Object.create(null)); if (id && !said[pool] && typeof toast === 'function') { said[pool] = 1; var pf = (draft.fields || []).filter(function(f) { return !!f && f.id === pool; })[0]; toast('Damage now comes off ' + ((pf && (pf.label || pf.key)) || 'this pool') + '. Change it on the Combat tab, under Taking damage.'); }
}
// 1.6.3 (the review of the safety batch): the pool the fill made the damage pool, turned to another kind, hands damage to the next pool, and the
// move is said each time it happens, never in silence; where no pool is left, that is said too. A pool picked by hand is never let go
function hpPoolLeave(id) {
    var cm = draft && draft.combat; var au = hpPoolFill.auto; if (!cm || cm.hpResource !== id || !au || au.d !== draft || au.id !== id) return;
    cm.hpResource = ''; hpPoolFill.auto = null;
    var nx = (draft.fields || []).filter(function(f) { return !!f && f.kind === 'resource' && typeof f.id === 'string' && !!f.id && f.id !== id; })[0];
    if (nx) { cm.hpResource = nx.id; hpPoolFill.auto = { d: draft, id: nx.id }; (hpPoolFill.said || (hpPoolFill.said = Object.create(null)))[nx.id] = 1; }
    if (typeof toast === 'function') toast(nx ? 'Damage now comes off ' + (nx.label || nx.key || 'the next pool') + '. Change it on the Combat tab, under Taking damage.' : 'No pool is left for damage to come off. Once you make one, pick it on the Combat tab, under Taking damage.');
}
function startFrom(id) {
    if (!draft) return;
    var apply = function(sys, packs) { draftSet(clone(sys)); draft.updated = 0; hpPoolFill(''); starterPacksSet(packs || null); ui('sysName').value = draft.name || ''; markDirty(); renderAll(); toast(id === 'blank' ? 'Starting from a blank system.' : 'Starting from ' + draft.name + '. Save to keep it' + (packs ? ', with its ' + packs.texts.length + ' library pack' + (packs.texts.length === 1 ? '' : 's') : '') + '.'); };
    var go = function() {
        if (id === 'blank') { apply(emptySystem()); return; }
        var st = starterOf(id);
        fetch('assets/systems/' + id + '.json', { cache: 'no-store' }).then(function(r) { if (!r.ok) throw new Error('missing'); return r.json(); }).then(function(j) {
            var c = cleanSystem(j, { F: F(), gmView: true }); if (!c) throw new Error('bad');
            if (!st || !st.packs) { apply(c); return; }
            return starterPacksGet(st).then(function(texts) { apply(c, { name: st.name, texts: texts }); });
        }).catch(function() { toast('That preset could not be loaded.'); });
    };
    // 1.6.3 (the review of the System editor, findings 12 and 38): asked whenever the draft holds anything, in words that say it replaces all of it,
    // by a button that names the act
    if (draftHolds(draft)) showConfirm(REPLACE_WORDS('this preset'), function(yes) { if (yes) go(); }, { noEnter: true, yes: 'Replace' });
    else go();
}
// [sysedcheck:draftholds-start]
// whether the draft holds anything a replace would lose: anything at all beyond what a blank system, as the editor opens one, holds once cleaned
function draftHolds(d) {
    if (!d) return false;
    if ((d.fields || []).length || (d.rolls || []).length || (d.items || []).length || (d.effects || []).length) return true;
    try {
        var blank = emptySystem(); if (!Array.isArray(blank.fields)) blank.fields = []; if (!Array.isArray(blank.rolls)) blank.rolls = []; if (!blank.sheet || !Array.isArray(blank.sheet.sections)) blank.sheet = { sections: [] }; if (!Array.isArray(blank.items)) blank.items = []; if (!blank.combat || typeof blank.combat !== 'object') blank.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' };
        var a = cleanSystem(d, { F: F(), gmView: true }), b = cleanSystem(blank, { F: F(), gmView: true }); if (!a || !b) return true;
        ['name', 'updated'].forEach(function(k) { delete a[k]; delete b[k]; });
        return JSON.stringify(a) !== JSON.stringify(b);
    } catch (e) { return true; }
}
var REPLACE_WORDS = function(what) { return 'Replace everything in this system with ' + what + '? That is its fields, rolls, items, effects, lists, combat and rules, calendar and layout. Nothing changes until you Save, and Undo brings it back. Values your characters hold for fields the new system does not have stay stored but hidden until such a field exists again.'; };
// [sysedcheck:draftholds-end]
function exportSystem() {
    if (!draft) return;
    var clean = cleanSystem(draft, { F: F(), gmView: true }); if (!clean) return;
    clean.name = (ui('sysName').value || '').trim().slice(0, LIMITS.name) || clean.name;
    var blob = new Blob([JSON.stringify(clean, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (clean.name || 'system').replace(/[^A-Za-z0-9_ -]+/g, '').trim().replace(/ +/g, '_').slice(0, 40) + '.wpsystem.json';
    document.body.appendChild(a); a.click(); setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('System exported.');
}
function importFile(file) {
    if (!file || !draft) return;
    file.text().then(function(text) {
        var j = JSON.parse(text);
        var c = cleanSystem(j, { F: F(), gmView: true }); if (!c) throw new Error('not a system');
        // 1.6.3 (the review of the System editor, finding 5): asked first where the draft holds anything, as Start from asks, and said after how many
        // characters hold values for fields the file does not have, which go out of sight once it is saved
        var put = function() {
        if (!draft) return;
        var v = validateSystem(c, F());
        draftSet(c); draft.updated = 0; ui('sysName').value = draft.name || ''; markDirty(); renderAll();
        var cpI = getActiveCampaign(), hadI = {}, keepI = {}, nHid = 0; ((cpI && cpI.system && cpI.system.fields) || []).forEach(function(f) { if (f && f.id) hadI[f.id] = 1; }); c.fields.forEach(function(f) { if (f && f.id) keepI[f.id] = 1; });
        Object.keys((cpI && cpI.chars) || {}).forEach(function(id) { var vs = cpI.chars[id] && cpI.chars[id].values; if (vs && typeof vs === 'object' && Object.keys(vs).some(function(k) { return hadI[k] && !keepI[k]; })) nHid++; });
        var dr = droppedCounts(j, c), drT = typeof droppedWords === 'function' ? droppedWords(dr) : Object.keys(dr).map(function(k) { return dr[k] + ' ' + (dr[k] === 1 ? k.slice(0, -1) : k); }).join(', ');   // Stage 6 library L0: what the file had that was left out is counted, never cut silently
        var nN = function(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
        toast('Imported ' + (c.name || 'a system') + ': ' + nN(c.fields.length, 'field') + ', ' + nN(c.rolls.length, 'roll') + (c.items && c.items.length ? ', ' + nN(c.items.length, 'item') : '') + (v.ok ? '.' : ', ' + v.errors.length + ' error' + (v.errors.length === 1 ? '' : 's') + ' to fix.') + (drT ? ' Left out (over the limits, or not valid): ' + drT + '.' : ''));
        if (nHid) toast(nHid + (nHid === 1 ? ' character holds values' : ' characters hold values') + ' for fields this file does not have. After Save those stay stored but hidden, until such a field exists again.');
        };
        if (draftHolds(draft)) showConfirm(REPLACE_WORDS('the system in this file'), function(yes) { if (yes) put(); }, { noEnter: true, yes: 'Replace' }); else put();
    }).catch(function() { toast('That file is not a Waypoint system.'); });
}
// [split:body-end]
return { autoBox: autoBox, clockBox: clockBox, costHow: costHow, costOptions: costOptions, drawHow: drawHow, entryNames: entryNames, entryPick: entryPick, errGo: errGo, errSay: errSay, errWhere: errWhere, exportSystem: exportSystem, fieldWord: fieldWord, grantBox: grantBox, grantEntries: grantEntries, grantListFor: grantListFor, grantName: grantName, grantSays: grantSays, importFile: importFile, itemOfRow: itemOfRow, keyWord: keyWord, lvlBoxSays: lvlBoxSays, onChange: onChange, onClick: onClick, onInput: onInput, pickModel: pickModel, pickMove: pickMove, pickOne: pickOne, pickOpen: pickOpen, renderAll: renderAll, rowFocusBack: rowFocusBack, rowFocusOf: rowFocusOf, runTest: runTest, standSays: standSays, startFrom: startFrom, starterSaved: starterSaved, startersFill: startersFill, startersLoad: startersLoad, turnActs: turnActs, turnBox: turnBox, turnHoldSays: turnHoldSays, turnRunSays: turnRunSays };   // [split:glue]
}   // [split:glue]
