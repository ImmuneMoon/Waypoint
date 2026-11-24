/* sysedroll.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 7, the System editor; split 2026-11-19 with no change in behavior).
   What it holds: the Rolls tab's rows and what a roll's or an action's change may aim at:
   rounding (roundCells), applyEditor, the change's target list (setChangeTarget and the every-row, deck, random-row and result
   targets), a roll's reasons (whyBox), rollRow, the Characters tab's row, an effect's row and its end, roll bonuses (swBox and its
   handlers), Flies, an item's row with its area, afflictions, its changes and its stats.
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sysedRoll() at
   its line `// [split:sysedroll.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (tools/splitcheck.js holds it): the editor's own state (draft, dirty, tab, layoutView and
   the rest) stands in sheets.js and a part sets it through the setters beside `var draft`. Change the code here as if it still stood
   in sheets.js. */
// [split:of sheets.js]
import { APPLY_KINDS, F, LIMITS, NEEDS_WHY, STAT_KEY, _asPlayer, activeCharOf, answersBox, areaBox, askRow, asksBox, bandBox, bandWhens, btnRow, callsBox, cardBox, catChoices, checkLabel, cleanListSpec, cleanNeedsWhy, cleanRollSw, clockBox, costHow, costOptions, crossRow, dbxLocNames, dieSel, draft, drawHow, el, entryNames, entryPick, errorCell, everyRow, explainBox, fieldOf, fightRow, fxHolds, fxTargets, glyphButton, grantBox, handKept, helpBox, lastsSays, hudFor, input, itemOfRow, keepPlace, kindsNamed, labeledSelect, landDmgSel, lazySelect, lossOpts, lvlOnlyText, markDirty, markOpts, markVal, modHowSel, modTiersText, modVal, needsGmBox, noteRow, numField, numInput, opVal, open, patchErrors, picPicker, playableChars, playerNames, postureList, renderAll, resistBySel, resistOrBox, rollNeedsFails, rollStationBox, rolled, rowAimInto, rowFocusOf, segPut, select, swDice, swGone, tab, toast, turnActs, twinNamer, ui, usedByBox, withRowSel } from './sheets.js';   // [split:glue]
export function sysedRoll() {   // [split:glue]
// [split:body-start]
// Clarity package: how a formula's value is rounded, picked from a list so a GM never writes the arithmetic (systemcore roundBy works it, so
// Up only from .95 is exact where mod(x, 1) >= 0.95 is not). To shows once it rounds; Up from only for Up only from
var ROUND_WORDS = [['', 'None'], ['near', 'Normally'], ['down', 'Down'], ['up', 'Up'], ['from', 'Up only from…']];
function roundCells(def, f) {
    var how = ROUND_WORDS.some(function(o) { return o[0] && o[0] === f.round; }) ? f.round : '';
    def.appendChild(labeledSelect('sys-round', 'Rounding', ROUND_WORDS, how, 'How the value is rounded. None: as it works out. Normally: half up, as round() does. Down and Up: always that way. Up only from: up only when what lies past the place is at least the point you set, as .95 for a Dodge'));
    if (!how) return;
    def.appendChild(labeledSelect('sys-roundto', 'To', [['0', 'whole numbers'], ['1', 'tenths'], ['2', 'hundredths'], ['3', 'thousandths']], String(f.roundTo >= 1 && f.roundTo <= 3 ? f.roundTo : 0), 'The place it is rounded to'));
    if (how === 'from') def.appendChild(numField('sys-roundat', typeof f.roundAt === 'number' ? f.roundAt : 0.5, 'Up only when what lies past the place is this much or more, 0.01 to 0.99: at .95, 7.94 stays 7 and 7.95 becomes 8', 'Up from', '0.01'));
}
// Stage 6 HUD H7: an apply action's changes — each a pool or a number, Subtract or Add, and the amount (a formula, no dice); LIMITS.applyChanges at most
function applyEditor(r, key) {   // key (R1): 'apply' — an apply action's changes; 'then' — a roll's consequences (each with its When); 1.6.2: 'end' — an effect's When it ends (a pool, a number or an effect switched)
    key = key === 'then' ? 'then' : key === 'end' ? 'end' : 'apply';
    var box = el('div', 'sys-apply' + (key === 'then' ? ' sys-then' : '')), list = Array.isArray(r[key]) ? r[key] : [];
    var fldN = (typeof twinNamer === 'function' ? twinNamer : function(l, nm) { return nm; })(draft.fields, function(x) { return x ? x.label || x.key || x.id : ''; }, function(x) { return x ? x.key : ''; });   // 1.6.3 (finding 24): two fields of one name told apart
    var targets = draft.fields.filter(function(f) { return f && APPLY_KINDS[f.kind] === 1; }).map(function(f) { return [f.id, fldN(f) + (f.kind === 'resource' ? ' (pool)' : '')]; });
    // 1.6.3 (the review of the System editor speed): an effect has no short name, so two effects of one name read with which of them it is,
    // Bleeding (1) and Bleeding (2), in the order they stand on the Items tab. Counted once for every row of this box
    var fxAll = Array.isArray(draft.effects) ? draft.effects : [], fxNth = new Map(), fxSeen = Object.create(null), fxWord = function(d) { return d ? d.name || 'An effect with no name' : ''; };
    fxAll.forEach(function(d) { if (!d) return; var w = fxWord(d); fxSeen[w] = (fxSeen[w] || 0) + 1; fxNth.set(d, String(fxSeen[w])); });
    var fxNm = (typeof twinNamer === 'function' ? twinNamer : function(l, nm) { return nm; })(fxAll, fxWord, function(d) { return fxNth.get(d) || ''; });
    list.forEach(function(ch0, i) {
        var ch = ch0 && typeof ch0 === 'object' ? ch0 : {}, rw = el('div', 'sys-flags sys-apply-row'); rw.dataset.ai = String(i); rw.dataset.k = key;
        if (key === 'then') rw.appendChild(select('sys-apply-when', [['', 'Always'], ['hit', 'On success'], ['crit', 'On a critical success'], ['miss', 'On failure'], ['fumble', 'On a critical failure'], ['malf', 'On malfunction']].concat(typeof bandWhens === 'function' ? bandWhens(r, ch) : []), ch.band ? 'band:' + ch.band : ch.when || '', 'When the roll makes this change: always, or only when its test succeeds or fails. A critical success is a success too, and a critical failure a failure'));
        if (key === 'then') { var ifI = input('sys-apply-if field', typeof ch.if === 'string' ? ch.if : '', 'Only where: a formula with no dice this change also needs, reading how the roll went, such as RollMargin >= 3. Empty: nothing more', 'Only where'); ifI.maxLength = LIMITS.formula; rw.appendChild(ifI); }   // 1.6.2
        var fxT = []; fxAll.forEach(function(d) { if (d && typeof d.id === 'string') fxT.push(['fx+:' + d.id, 'Switch on: ' + fxNm(d)], ['fx-:' + d.id, 'Switch off: ' + fxNm(d)]); });   // 1.6.0: an effect switched on or off
        var allT = [].concat(allRowTargets(), typeof randTargets === 'function' ? randTargets(ch) : []), allV = typeof ch.list === 'string' ? allRowValue(ch, allT) : typeof ch.rand === 'string' ? 'rnd:' + ch.rand : '';   // 1.6.0: one number stat on every row of a list; 1.6.2 (fold (f)): a row picked at random
        var opts = [['', 'Pick a pool, number or effect\u2026']].concat(targets, fxT, key === 'end' ? [] : allT);   // 1.6.2: an effect's end moves a pool or a number, or switches an effect if (allV && !allT.some(function(o) { return o[0] === allV; })) opts.push([allV, 'A list or stat that is gone']); if (typeof ch.fx === 'string' && !fxT.some(function(o) { return o[0].slice(4) === ch.fx; })) opts.push([(ch.on === false ? 'fx-:' : 'fx+:') + ch.fx, 'An effect that is gone']); if (ch.f && !targets.some(function(o) { return o[0] === ch.f; })) opts.push([ch.f, 'A field that is gone']);
        if (key !== 'end') opts.push(['setoff', 'Set off the placed blast nearest it']);   // 1.6.2 (the CORE session's batch 6, 10)
        if (key !== 'end' && typeof resultTargets === 'function') resultTargets(ch).forEach(function(o) { opts.push(o); });   // 1.6.2 (G7)
        rw.appendChild((typeof lazySelect === 'function' ? lazySelect : select)('sys-apply-target', opts, ch.setOff === true ? 'setoff' : allV ? allV : typeof ch.deck === 'string' ? (ch.shuffle === true ? 'ds:' : 'dk:') + ch.deck : typeof ch.shared === 'string' ? 'val:' + ch.shared : typeof ch.table === 'string' ? 'tbl:' + ch.table : typeof ch.tag === 'string' ? (ch.shake === true ? 'tg~:' : ch.on === false ? 'tg-:' : 'tg+:') + ch.tag : typeof ch.fx === 'string' ? (ch.on === false ? 'fx-:' : 'fx+:') + ch.fx : (ch.f || ''), 'What this change moves: a pool\u2019s current value, a number, or an effect it switches on or off (on the character it is used on). Every row of a list sets one of its number stats on each of the list\u2019s rows', 'Find what it changes'));
        if (ch.setOff === true) { /* 1.6.2 (10): no amount */ } else
        if (typeof ch.rand === 'string') rw.appendChild(randBox(ch)); else
        if (typeof ch.deck === 'string') rw.appendChild(deckBox(ch)); else
        if (typeof ch.table === 'string') rw.appendChild(resultByBox(ch)); else
        if (typeof ch.fx !== 'string' && typeof ch.tag !== 'string' && typeof ch.rand !== 'string' && typeof ch.sw !== 'boolean') {   // 1.6.0: an effect switched has no amount; 1.6.2: nor a mark, nor a row picked at random, nor every row's switch (167 A)
        var mkF = typeof markOpts === 'function' ? markOpts(ch) : [];   // 1.6.2: a number shown as boxes marked one by one
        rw.appendChild(select('sys-apply-op', mkF.length ? mkF : (typeof lossOpts === 'function' ? lossOpts(ch) : [['sub', 'Subtract'], ['add', 'Add'], ['set', 'Set to']]), mkF.length ? markVal(ch) : (typeof opVal === 'function' ? opVal(ch) : (ch.set ? 'set' : ch.add ? 'add' : 'sub')), 'Subtract (a cost, a wound), add (rest, healing) or set it to the amount (back to 0); never past the field\u2019s min and max'));
        var fm = input('sys-apply-formula field', typeof ch.formula === 'string' ? ch.formula : '', 'The amount, worked out when pressed: no dice unless Rolled is ticked (3, FPCost, max(0, Incoming - DR)); below 0 counts as 0', 'Amount'); fm.maxLength = LIMITS.formula; rw.appendChild(fm);
        var rlL = el('label', 'sys-hover'), rlC = el('input'); rlC.type = 'checkbox'; rlC.className = 'sys-apply-rolled'; rlC.checked = ch.roll === true; rlL.appendChild(rlC); rlL.appendChild(el('span', null, ' Rolled')); rlL.title = 'Rolled: the amount may roll dice, such as 1d6. The host rolls it each time, and the card shows the dice'; rw.appendChild(rlL);   // 1.5.9 (book es/et plan, section 0)
        if (typeof ch.f === 'string' && ch.f && Array.isArray(draft.links) && draft.links.length) rw.appendChild(select('sys-apply-link', [['', 'On this sheet']].concat(draft.links.filter(function(k) { return k && typeof k.id === 'string'; }).map(function(k) { return [k.id, 'On the ' + (k.label || k.key || 'linked') + ' sheet']; })), typeof ch.link === 'string' ? ch.link : '', 'Which sheet the change lands on: this one, or the one a link holds, such as the vehicle a crew member is at'));   // 1.6.2 (the CORE session's batch 6, 12)
        }
        if (typeof ch.list === 'string') { var rwsI = input('sys-apply-rows field', typeof ch.rows === 'string' ? ch.rows : '', 'Only rows where: a test of each row, which may read the location a blow struck, such as Row.Hand = Hit.Hand. Empty: every row', 'Only rows where'); rwsI.maxLength = LIMITS.formula; rw.appendChild(rwsI); }   // 1.6.2 (the CORE session, 3)
        if (typeof ch.fx === 'string' && ch.on !== false && typeof fxHolds === 'function' && fxHolds(ch.fx)) { var fxnI = input('sys-apply-fxn field', typeof ch.n === 'string' ? ch.n : '', 'The number the effect goes on with, as Bleeding 3. Empty: its own start. Added again while it is on, the effect\u2019s rule says what happens', 'With number'); fxnI.maxLength = LIMITS.formula; rw.appendChild(fxnI); }   // 1.6.2: an effect that holds a number
        [['applyup', '\u25b2', 'Move up'], ['applydown', '\u25bc', 'Move down'], ['applydel', '\u00d7', 'Remove this change']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
        box.appendChild(rw);
    });
    var addB = el('button', 'tool ghost sys-btn sys-apply-add', key === 'then' ? '+ Then\u2026' : key === 'end' ? '+ When it ends' : '+ Change'); addB.dataset.act = 'applyadd'; addB.dataset.k = key; addB.disabled = list.length >= LIMITS.applyChanges; addB.title = addB.disabled ? 'At most ' + LIMITS.applyChanges + ' changes' : key === 'then' ? 'A change this roll makes to the character: always, on success or on failure (a pending hit, spent ammo, a stun cleared)' : 'Another pool or number this button moves (Apply costs: FP and EP together)'; box.appendChild(addB);
    return box;
}
// 1.6.0: what a change's target select names, written on the change: a field, a counter (c:), Fire, an effect switched on or off (fx+: / fx-:),
// the row's quantity (q) or one of its own stats (s:). An effect switched has no amount
// 1.6.0: a system entry's change may name one number stat on every row of an item list (all:<list id>:<stat key>)
// 1.6.3 (the improvement week's review of the System editor, finding 24): two lists of one name, or two stats of one name in a list, are told
// apart by their short names (sheets.js twinNamer), as a field in a list of fields is, so "Every row of Weapons" never stands twice
function allRowTargets() { var o = [], fsA = typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields : [], lfN = (typeof twinNamer === 'function' ? twinNamer : function(l, nm) { return nm; })(fsA, function(x) { return x ? x.label || x.key || x.id : ''; }, function(x) { return x ? x.key : ''; }); fsA.forEach(function(lf) { if (!lf || lf.kind !== 'item-list' || !lf.list || !Array.isArray(lf.list.stats)) return; var stN = (typeof twinNamer === 'function' ? twinNamer : function(l, nm) { return nm; })(lf.list.stats, function(x) { return x ? x.label || x.key : ''; }, function(x) { return x ? x.key : ''; }); lf.list.stats.forEach(function(t) { if (t && t.kind !== 'pick' && typeof t.key === 'string' && t.key) o.push(['all:' + lf.id + ':' + t.key, 'Every row of ' + lfN(lf) + ': ' + stN(t)]); }); if (lf.list.on && typeof lf.list.on === 'object') { var swN = lf.list.on.label ? ' (' + lf.list.on.label + ')' : ''; o.push(['swoff:' + lf.id, 'Every row of ' + lfN(lf) + ': switch off' + swN], ['swon:' + lf.id, 'Every row of ' + lfN(lf) + ': switch on' + swN]); } }); return o; }   // 1.6.2 (167 A): every row's switch too
function allRowValue(ch, allT) { if (typeof ch.sw === 'boolean') return (ch.sw ? 'swon:' : 'swoff:') + ch.list; var v = 'all:' + ch.list + ':' + String(ch.s || ''), lv = v.toLowerCase(), hit = (allT || []).filter(function(o) { return o[0].toLowerCase() === lv; })[0]; return hit ? hit[0] : v; }
// 1.6.2 (G7): what a change may read, and where on a table. Its own listener, and a class no handler of the Rolls tab reads
function deckTargets(ch) { var o = []; (Array.isArray(draft.decks) ? draft.decks : []).filter(function(d) { return !!d && typeof d.key === 'string'; }).forEach(function(d) { o.push(['dk:' + d.key, 'Draw from: ' + (d.label || 'A deck')], ['ds:' + d.key, 'Shuffle: ' + (d.label || 'A deck')]); }); if (ch && typeof ch.deck === 'string' && !o.some(function(x) { return x[0].slice(3) === ch.deck; })) o.push([(ch.shuffle === true ? 'ds:' : 'dk:') + ch.deck, 'A deck that is gone']); return o; }
// 1.6.2 (G9): a hand on the GM's own screen shows how many, and an NPC's or one the system lets the GM see shows whole. As player reads as the GM, since the GM is who is looking
function handShut(f, c, gm) { return !!f.list && handKept(f.list, c) && (gm || (typeof _asPlayer !== 'undefined' && !!_asPlayer)); }
function handFan(wrap) {   // the rows themselves, each keeping its controls: a fan is how they look, and rows are what they are
    if (!wrap.querySelectorAll) return; var rows = wrap.querySelectorAll('.sheet-item'); if (!rows.length || !wrap.insertBefore) return; var fan = el('div', 'sheet-fan'), n = rows.length; wrap.insertBefore(fan, rows[0]);
    for (var i = 0; i < n; i++) { rows[i].style.setProperty('--fan', String(i - (n - 1) / 2)); fan.appendChild(rows[i]); }
}
// 1.6.2 (vehicles, fold (f); the owner, by prompt: "Rows where a test holds, and the builder ticks whether rows already off can be picked. If one
// is picked, the call says what happens: nothing, or its next step"): a row of a list with a switch picked at random. Its own listeners, and
// classes no handler of the Rolls tab reads
function randTargets(ch) {
    // 1.6.3 (the review of the System editor speed): two lists of one name are told apart by their short names, as allRowTargets does
    var fsR = Array.isArray(draft.fields) ? draft.fields : [], rnN = (typeof twinNamer === 'function' ? twinNamer : function(l, nm) { return nm; })(fsR, function(x) { return x ? x.label || 'A list' : ''; }, function(x) { return x ? x.key : ''; });
    var o = []; fsR.forEach(function(f) { if (f && f.kind === 'item-list' && f.list && f.list.on) o.push(['rnd:' + f.id, 'A row picked at random: ' + rnN(f)]); });
    if (ch && typeof ch.rand === 'string' && !o.some(function(x) { return x[0] === 'rnd:' + ch.rand; })) o.push(['rnd:' + ch.rand, 'A list that is gone, or has no switch']); return o;
}
function randBox(ch) {
    var w = el('span', 'sys-rnd'), said = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); }, lf = fieldOf(ch.rand), sp = lf && lf.list ? lf.list : null;
    var tc = el('label', 'sys-num sys-cap'), t = input('sys-rnd-test field', typeof ch.test === 'string' ? ch.test : '', 'Which rows may be picked. Empty: any row', 'Any row'); t.maxLength = LIMITS.formula; t.dataset.rl = ch.rand;
    t.addEventListener('input', function() { var v = t.value.trim(); if (v) ch.test = v.slice(0, LIMITS.formula); else delete ch.test; said(); }); tc.appendChild(el('span', 'sys-num-cap', 'Picked among')); tc.appendChild(t); w.appendChild(tc);
    var ol = el('label', 'sys-hover'), oc = el('input', 'sys-rnd-off'); oc.type = 'checkbox'; oc.checked = ch.offToo === true; ol.appendChild(oc); ol.appendChild(document.createTextNode(' Rows already off may be picked')); ol.title = 'Ticked: a row already off may be picked too, and then takes its next step, or nothing. Off: only rows that are on, so each pick switches one off';
    oc.addEventListener('change', function(e) { e.stopPropagation(); if (oc.checked) ch.offToo = true; else { delete ch.offToo; delete ch.next; } said(); renderAll(); }); w.appendChild(ol);
    if (ch.offToo === true) {
        var nx = ch.next && typeof ch.next === 'object' ? ch.next : null, stats = sp && Array.isArray(sp.stats) ? sp.stats.filter(function(x) { return x && x.kind !== 'pick' && typeof x.key === 'string' && x.key; }) : [];
        var ns = select('sys-rnd-nexts', [['', 'Then nothing more happens']].concat(stats.map(function(x) { return [x.key, 'Then its ' + (x.label || 'stat') + ' changes']; })), nx ? nx.s : '', 'What happens to a row already off when it is picked: nothing, or one of its number stats changes, such as disabled to destroyed');
        ns.addEventListener('change', function(e) { e.stopPropagation(); if (ns.value) { ch.next = Object.assign({ formula: '1', set: true }, nx || {}, { s: ns.value }); } else delete ch.next; said(); renderAll(); }); w.appendChild(ns);   // renderAll keeps the focus on this list (rowFocusOf)
        if (nx) {
            var no = select('sys-rnd-nexto', [['set', 'Set to'], ['add', 'Add'], ['sub', 'Subtract']], nx.set ? 'set' : nx.add ? 'add' : 'sub', 'How the stat changes');
            no.addEventListener('change', function(e) { e.stopPropagation(); delete nx.set; delete nx.add; if (no.value === 'set') nx.set = true; else if (no.value === 'add') nx.add = true; said(); }); w.appendChild(no);
            var nf = input('sys-rnd-next field', typeof nx.formula === 'string' ? nx.formula : '', 'The figure, read on the row picked', '1'); nf.maxLength = LIMITS.formula; nf.dataset.rl = ch.rand;
            nf.addEventListener('input', function() { nx.formula = nf.value.trim().slice(0, LIMITS.formula); said(); }); w.appendChild(nf);
        }
    }
    return w;
}
// 1.6.2 (vehicles, fold (f); the owner, by prompt: "a call names one or more stations, or All crew. Everyone linked at a named station gets one
// card"): who a call's card goes to, on a system with a Crew link. Its own listeners, so no handler of the tab reads it
function crewStations() { var o = []; (Array.isArray(draft.links) ? draft.links : []).forEach(function(k) { if (k && k.kind === 'crew' && Array.isArray(k.stations)) k.stations.forEach(function(s) { if (typeof s === 'string' && s && o.indexOf(s) < 0) o.push(s); }); }); return o; }
var _crewFocus = null;   // the call whose list had the focus as its box was drawn again, so the keys stay on that list
function crewPick(obj, redraw) {
    var w = el('span', 'sys-crew'), has = (Array.isArray(draft.links) ? draft.links : []).some(function(k) { return k && k.kind === 'crew'; }); if (!has && !obj.crew) return w;
    var stn = crewStations(), mode = obj.crew === 'all' ? 'all' : Array.isArray(obj.crew) ? 'stn' : '', said = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var s = select('sys-crew-to', [['', 'Card to the character'], ['all', 'Card to all its crew']].concat(stn.length || mode === 'stn' ? [['stn', 'Card to the crew at…']] : []), mode, 'Who gets the card: the character itself, or the crew linked to it by a Crew link, each with a card of their own that reads their station and the blow');
    s.addEventListener('change', function(e) { e.stopPropagation(); if (s.value === 'all') obj.crew = 'all'; else if (s.value === 'stn') obj.crew = []; else delete obj.crew; said(); _crewFocus = obj; redraw(); _crewFocus = null; }); w.appendChild(s);
    if (_crewFocus === obj) setTimeout(function() { if (s.isConnected && s.focus) s.focus(); }, 0);
    if (mode === 'stn') stn.concat(obj.crew.filter(function(x) { return stn.indexOf(x) < 0; })).forEach(function(nm) {
        var l = el('label', 'sys-hover'), c = el('input', 'sys-crew-stn'); c.type = 'checkbox'; c.checked = obj.crew.indexOf(nm) >= 0; l.appendChild(c); l.appendChild(document.createTextNode(' ' + nm + (stn.indexOf(nm) < 0 ? ' (gone)' : ''))); l.title = 'Everyone at the ' + nm + ' station gets a card';
        c.addEventListener('change', function(e) { e.stopPropagation(); var i = obj.crew.indexOf(nm); if (c.checked && i < 0) obj.crew.push(nm); else if (!c.checked && i >= 0) obj.crew.splice(i, 1); said(); }); w.appendChild(l);
    });
    return w;
}
function deckBox(ch) {   // How many and who sees it. Its own listeners, and classes no handler of the Rolls tab reads
    var w = el('span', 'sys-deck-draw'); if (ch.shuffle === true) return w; var n = input('sys-deck-n field', typeof ch.formula === 'string' ? ch.formula : '1', 'How many cards to draw', '1'); n.addEventListener('input', function() { var v = n.value.trim(); ch.formula = v.slice(0, LIMITS.formula); markDirty(); if (typeof patchErrors === 'function') patchErrors(); });
    var s = select('sys-deck-show', [['', 'Everyone sees it'], ['self', 'Only who drew and you']], ch.show === 'self' ? 'self' : '', 'Who sees what was drawn'); s.addEventListener('change', function() { if (s.value) ch.show = 'self'; else delete ch.show; markDirty(); }); w.appendChild(n); w.appendChild(s);
    var hands = (Array.isArray(draft.fields) ? draft.fields : []).filter(function(f) { return !!f && f.kind === 'item-list' && !!f.list && !!f.list.hand; });
    if (hands.length) { var hs = select('sys-deck-to', [['', 'To the table']].concat(hands.map(function(f) { return [f.id, 'To the hand: ' + (f.label || 'A hand')]; })), typeof ch.to === 'string' ? ch.to : '', 'Where what is drawn goes. A hand keeps it until it is discarded'); hs.addEventListener('change', function() { if (hs.value) ch.to = hs.value; else delete ch.to; markDirty(); }); w.appendChild(hs); }
    return w;
}
function resultTargets(ch) { var o = (Array.isArray(draft.values) ? draft.values : []).filter(function(t) { return !!t && typeof t.key === 'string'; }).map(function(t) { return ['val:' + t.key, 'Shared: ' + (t.label || 'A value')]; });
    (Array.isArray(draft.tags) ? draft.tags : []).forEach(function(t) { if (t && typeof t.key === 'string') o.push(['tg+:' + t.key, 'Mark the target: ' + (t.label || 'A mark')], ['tg-:' + t.key, 'Take off the target: ' + (t.label || 'A mark')], ['tg~:' + t.key, 'Shake off: ' + (t.label || 'A mark')]); });   // 1.6.2 (vehicles, fold (c))
    if (ch && typeof ch.tag === 'string' && !o.some(function(x) { return x[0].slice(4) === ch.tag; })) o.push([(ch.shake === true ? 'tg~:' : ch.on === false ? 'tg-:' : 'tg+:') + ch.tag, 'A mark that is gone']); if (typeof deckTargets === 'function') o = deckTargets(ch).concat(o); if (ch && typeof ch.shared === 'string' && !o.some(function(x) { return x[0] === 'val:' + ch.shared; })) o.push(['val:' + ch.shared, 'A shared value that is gone']); o = o.concat((Array.isArray(draft.results) ? draft.results : []).filter(function(t) { return !!t && typeof t.key === 'string'; }).map(function(t) { return ['tbl:' + t.key, 'Roll on: ' + (t.label || 'A table')]; })); if (ch && typeof ch.table === 'string' && !o.some(function(x) { return x[0] === 'tbl:' + ch.table; })) o.push(['tbl:' + ch.table, 'A table that is gone']); return o; }
function resultByBox(ch) { var i = input('sys-res-by field', typeof ch.by === 'string' ? ch.by : '', 'Which row it reads. Empty: it rolls the table\u2019s own dice', 'Its own dice'); i.addEventListener('input', function() { var v = i.value.trim(); if (v) ch.by = v.slice(0, LIMITS.formula); else delete ch.by; markDirty(); if (typeof patchErrors === 'function') patchErrors(); }); return i; }
function setChangeTarget(ch, v) {
    v = String(v || ''); ['f', 'c', 'fire', 'feed', 'launch', 'setOff', 'n', 'off', 'fx', 'on', 'q', 's', 'list', 'sw', 'money', 'mark', 'tag', 'shake', 'rand', 'test', 'offToo', 'next'].forEach(function(k) { delete ch[k]; });
    if (v.indexOf('rnd:') === 0) { ch.rand = v.slice(4); delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; return; }   // 1.6.2 (fold (f)): a row picked at random, no amount
    delete ch.discard; delete ch.to; delete ch.deck; delete ch.shuffle; delete ch.show; delete ch.shared; delete ch.table; delete ch.by; if (v.indexOf('dk:') === 0 || v.indexOf('ds:') === 0) { ch.deck = v.slice(3); delete ch.add; delete ch.set; delete ch.roll; if (v.charAt(1) === 's') { ch.shuffle = true; delete ch.formula; } else if (typeof ch.formula !== 'string' || !ch.formula) ch.formula = '1'; return; } if (v.indexOf('val:') === 0) { ch.shared = v.slice(4); if (typeof ch.formula !== 'string') ch.formula = ''; return; } if (v.indexOf('tbl:') === 0) { ch.table = v.slice(4); delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; return; }   // 1.6.2 (G7): a roll on a result table, no amount
    if (v === 'money') { ch.money = ''; delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; }   // 1.6.0: the sheet's money, a figure of its own
    else if (v === 'discard') { ch.discard = true; delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; }   // 1.6.2 (G9)
    else if (v === 'off') { ch.off = true; delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; }   // 1.6.0 (CORE gap 13): this row switched off, no amount
    else if (v === 'fire') ch.fire = true;
    else if (v === 'setoff') { ch.setOff = true; delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; }   // 1.6.2 (10): the nearest placed blast goes off; no amount
    else if (v === 'launch') { ch.launch = true; delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; }   // 1.6.2 (vehicles, fold (d)): what it fired, else the row's own entry, launched at the target; no amount
    else if (v === 'feed') { ch.feed = true; delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; }   // 1.6.0 Feeds: a shot from every feed, no amount
    else if (v.indexOf('tg~:') === 0) { ch.tag = v.slice(4); ch.shake = true; delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; }   // part two: shaken off the one who rolls
    else if (v.indexOf('tg+:') === 0 || v.indexOf('tg-:') === 0) { ch.tag = v.slice(4); ch.on = v.charAt(2) === '+'; delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; }   // 1.6.2 (vehicles, fold (c)): a mark on the target, or taken off it; no amount
    else if (v.indexOf('fx+:') === 0 || v.indexOf('fx-:') === 0) { ch.fx = v.slice(4); ch.on = v.charAt(2) === '+'; delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; }
    else if (v === 'q') ch.q = true;
    else if (v.indexOf('swoff:') === 0 || v.indexOf('swon:') === 0) { ch.sw = v.indexOf('swon:') === 0; ch.list = v.slice(ch.sw ? 5 : 6); delete ch.formula; delete ch.add; delete ch.set; delete ch.roll; }   // 1.6.2 (167 A): every row's switch, no amount
    else if (v.indexOf('all:') === 0) { var aP = v.slice(4), aC = aP.indexOf(':'); ch.list = aC > 0 ? aP.slice(0, aC) : aP; ch.s = aC > 0 ? aP.slice(aC + 1) : ''; }   // 1.6.0: every row of a list
    else if (v.indexOf('s:') === 0) ch.s = v.slice(2);
    else if (v.indexOf('c:') === 0) ch.c = v.slice(2);
    else { ch.f = v; if (typeof markOpts === 'function' && markOpts(ch).length) { ch.mark = 'on'; delete ch.add; delete ch.set; } }   // 1.6.2: a number of boxes marked one by one is marked, never summed
    if (typeof ch.fx !== 'string' && typeof ch.sw !== 'boolean' && typeof ch.formula !== 'string' && ch.fire !== true && ch.feed !== true && ch.off !== true && typeof ch.money !== 'string') ch.formula = '';
}
function applyChangeOf(t, r) { var rw = t.closest('.sys-apply-row'), i = rw ? +rw.dataset.ai : -1, k = rw && rw.dataset.k === 'then' ? 'then' : rw && rw.dataset.k === 'end' ? 'end' : 'apply'; return r && Array.isArray(r[k]) && i >= 0 && i < r[k].length && r[k][i] && typeof r[k][i] === 'object' ? r[k][i] : null; }
// [systemcheck:whybox-start]
// 1.6.2 (a system build's ask, 2026-11-14): a Needs row's reasons, each a test and the words the grayed button and a refusal say when that one
// fails (systemcore needsWhy, judged after the single needs and in order, by rollNeedsFails). kind 'list' for a list's roll or action, whose
// test reads the row's names. Its own listeners and classes no handler of the Rolls tab or a list card reads; text only, never markup
function whyBox(r, kind) {
    var w = el('div', 'sys-flags sys-why'), most = typeof NEEDS_WHY === 'number' ? NEEDS_WHY : 12;
    var lines = function() { return Array.isArray(r.needsWhy) ? r.needsWhy : []; };
    var edited = function() { if (typeof markDirty === 'function') markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var mk = function(act, tip, glyph) { var b = el('button', 'tool ghost sys-btn', glyph); b.type = 'button'; b.dataset.act = act; b.title = tip; return b; };
    var draw = function(focusAt) {
        while (w.firstChild) w.removeChild(w.firstChild);
        var ls = lines();
        w.appendChild(el('span', 'sys-num-cap sys-offered', 'Reasons it cannot be used'));
        ls.forEach(function(l, i) {
            if (!l || typeof l !== 'object') return;
            var ln = el('div', 'sys-why-line'); ln.dataset.wi = String(i);
            var t = input((kind === 'list' ? 'sys-lwhy-if' : 'sys-rwhy-if') + ' field', typeof l['if'] === 'string' ? l['if'] : '', 'It can be used only while this holds. When it does not, the button grays out and says the words beside it. No dice', 'When can they use this?'); t.maxLength = LIMITS.formula;
            t.addEventListener('input', function(e) { e.stopPropagation(); l['if'] = t.value.slice(0, LIMITS.formula); edited(); });
            t.addEventListener('change', function(e) { e.stopPropagation(); });
            var s = input('sys-why-says field', typeof l.says === 'string' ? l.says : '', 'What the grayed button says when this one does not hold', 'Such as: The forge is cold'); s.maxLength = LIMITS.needsWords;
            s.addEventListener('input', function(e) { e.stopPropagation(); l.says = s.value.slice(0, LIMITS.needsWords); edited(); });
            s.addEventListener('change', function(e) { e.stopPropagation(); });
            ln.appendChild(t); ln.appendChild(s);
            var bs = el('span', 'sys-btns'), mv = el('span', 'ui-seg sys-moves'), up = mk('whyup', 'Move this reason up', '\u25b2'), dn = mk('whydown', 'Move this reason down', '\u25bc');   // the app's joined pair, as segPut joins a row's moves
            up.disabled = i === 0; dn.disabled = i === ls.length - 1; mv.appendChild(up); mv.appendChild(dn); bs.appendChild(mv); bs.appendChild(mk('whydel', 'Remove this reason', '\u00d7'));
            ln.appendChild(bs); w.appendChild(ln);
        });
        var add = mk('whyadd', ls.length >= most ? 'A roll keeps at most ' + most + ' reasons' : 'Add a reason: a test and the words the grayed button says when it fails', '+ Reason'); add.className += ' sys-why-add'; if (ls.length >= most) add.disabled = true; w.appendChild(add);
    };
    w.addEventListener('click', function(e) {
        var b = e.target && typeof e.target.closest === 'function' ? e.target.closest('button') : null; if (!b || !b.dataset || !/^why/.test(b.dataset.act || '')) return;
        e.stopPropagation(); if (typeof e.preventDefault === 'function') e.preventDefault();
        var a = b.dataset.act, ls = Array.isArray(r.needsWhy) ? r.needsWhy : (r.needsWhy = []), at = -1;
        if (a === 'whyadd') { if (ls.length >= most) return; ls.push({ 'if': '', says: '' }); at = ls.length - 1; }
        else { var ln = typeof b.closest === 'function' ? b.closest('.sys-why-line') : null, i = ln ? +ln.dataset.wi : -1; if (!(i >= 0 && i < ls.length)) return; if (a === 'whydel') ls.splice(i, 1); else { var j = a === 'whyup' ? i - 1 : i + 1; if (j < 0 || j >= ls.length) return; var x = ls[i]; ls[i] = ls[j]; ls[j] = x; } }
        if (!ls.length) delete r.needsWhy;
        edited();
        var kp = typeof keepPlace === 'function' ? keepPlace : (typeof window !== 'undefined' && typeof window.wpKeepPlace === 'function' ? window.wpKeepPlace : null);
        if (at < 0) { if (kp) kp(w, function() { draw(); }); else draw(); return; }   // a move or a remove: the focus to the control now standing where the pressed one stood
        draw(); whyFocus(at);   // + Reason: the new line's test, as its form once dressed
    });
    var whyFocus = function(at) {
        var fb = typeof window !== 'undefined' && window.wpFormBox && typeof window.wpFormBox.sweep === 'function' ? window.wpFormBox : null; if (fb) { try { fb.sweep(w); } catch (e) {} }
        var ln = Array.prototype.filter.call(w.querySelectorAll('.sys-why-line'), function(x) { return x.dataset && +x.dataset.wi === at; })[0]; if (!ln) return;
        var go = ln.querySelector('.fb-go'), t = ln.querySelector(kind === 'list' ? '.sys-lwhy-if' : '.sys-rwhy-if'), to = go || t; if (to && typeof to.focus === 'function') { try { to.focus(); } catch (e) {} }
    };
    draw(); return w;
}
// The reasons Save drops, as the cleaner reads them (cleanNeedsWhy): a line with no test or no words, and one past the most
function whyDrops(r) { return whyDropsAt(r).map(function(d) { return d.message; }); }
// The same, each with the place of its line in the roll (at), so the editor says it under that reason's own box
function whyDropsAt(r) {
    var out = [], ls = r && Array.isArray(r.needsWhy) ? r.needsWhy : [], most = typeof NEEDS_WHY === 'number' ? NEEDS_WHY : 12, kept = 0;
    ls.forEach(function(l, i) {
        if (!l || typeof l !== 'object') return; var t = typeof l['if'] === 'string' ? l['if'].trim() : '', s = typeof l.says === 'string' ? l.says.trim() : '', n = 'Reason ' + (i + 1);
        var put = function(m) { out.push({ at: i, message: m }); };
        if (!t && !s) { put(n + ' is empty, so Save drops it.'); return; }
        if (!t) { put(n + ' has words but no test, so Save drops it.'); return; }
        if (!s) { put(n + ' has a test but no words to say, so Save drops it.'); return; }
        if (typeof cleanNeedsWhy === 'function' && !cleanNeedsWhy([l])) { put(n + ' is no test Save can keep, so Save drops it.'); return; }
        kept++; if (kept > most) put(n + ' is past the ' + most + ' a roll keeps, so Save drops it.');
    });
    return out;
}
// The line in the draft of the k-th reason the cleaner keeps: the validator reads the cleaned roll, the editor draws the draft's lines
function whyDraftAt(r, k) {
    var ls = r && Array.isArray(r.needsWhy) ? r.needsWhy : [], n = -1;
    for (var i = 0; i < ls.length; i++) { if (typeof cleanNeedsWhy === 'function' ? !!cleanNeedsWhy([ls[i]]) : !!(ls[i] && typeof ls[i] === 'object')) { n++; if (n === k) return i; } }
    return k;
}
// [systemcheck:whybox-end]
function rollRow(r) {
    var row = el('div', 'sys-row'); row.dataset.id = r.id;
    var top = el('div', 'sys-row-main');
    top.appendChild(input('sys-label field', r.label, 'The button\u2019s label; {formula} shows a value: Attack ({\u00b1AtkBonus})', 'Label'));
    var isApply = Array.isArray(r.apply);   // Stage 6 HUD H7: the second kind — changes in place of a formula, never the initiative
    top.appendChild(select('sys-roll-kind', [['roll', 'Roll'], ['apply', 'Apply']], isApply ? 'apply' : 'roll', 'Roll: dice at the table. Apply: a button that moves pools or numbers by an amount (Apply costs, Apply wounds)'));
    if (typeof window !== 'undefined' && window.wpTexList && window.wpTexList.keys) window.wpTexList.keys(top.lastChild);   // 1.6.3 (finding 6): an arrow key opens the list, never steps it
    if (!isApply) top.appendChild(input('sys-formula field', r.formula, 'The roll', 'The roll'));
    if (!isApply && ((typeof draft !== 'undefined' && draft && Array.isArray(draft.decks) && draft.decks.length) || r.drawFirst)) { var dkR = (draft && Array.isArray(draft.decks) ? draft.decks : []).filter(function(d) { return d && typeof d.key === 'string' && /^D[1-9][0-9]{0,2}$/.test(d.key); }), dkO = [['', 'Rolls dice']].concat(dkR.map(function(d) { return [d.key, 'Draws a card from ' + (d.label || 'a deck') + ' first']; })); if (r.drawFirst && !dkR.some(function(d) { return d.key === r.drawFirst; })) dkO.push([r.drawFirst, 'A deck that is gone']); top.appendChild(select('sys-roll-drawfirst', dkO, r.drawFirst || '', 'Draws a card first: as the button is pressed one card is drawn from the deck, then the roll is worked out, so it reads that card’s numbers. One press, and the roll’s card names the card')); if (r.drawFirst) top.appendChild(drawHow(r.drawN)); }   // 1.6.2 (the owner, by prompt: "Yes, build it")   // 1.6.2 (the builder trial): first under How it rolls, before Jam and heavy hit
    if (!isApply) { var mfIn = input('sys-roll-malf field', r.malf || '', 'Malf: a natural total (the dice alone) at or past this malfunctions: a failure, and its On malfunction changes (no dice; empty: never)', 'Malf'); mfIn.maxLength = LIMITS.formula; top.appendChild(mfIn); }   // Stage 6 HUD R3
    if (!isApply && ((typeof draft !== 'undefined' && draft && draft.combat && draft.combat.checks === 'fixed') || r.critAt || r.fumbleAt)) [['sys-roll-critat', 'critAt', 'Critical at: this roll\u2019s own critical success range for the dice alone, read as the Combat tab reads it (no dice; empty: the Combat tab\u2019s)', 'Critical at'], ['sys-roll-fumbleat', 'fumbleAt', 'Critical failure at: this roll\u2019s own for the dice alone, read as the Combat tab reads it (no dice; empty: the Combat tab\u2019s)', 'Critical failure at']].forEach(function(g) { var ci = input(g[0] + ' field', typeof r[g[1]] === 'string' ? r[g[1]] : '', g[2], g[3]); ci.maxLength = LIMITS.formula; top.appendChild(ci); });   // 1.6.0 (the v2 sort's B1): a technique that widens the range
    if (!isApply) { var bgIn = input('sys-roll-bigat field', typeof r.bigAt === 'string' ? r.bigAt : '', 'Lands as a heavy hit: a success whose natural roll, the dice alone, is at or under this is marked a heavy hit. It is no critical. Its Then reads RollBig (no dice; empty: never)', 'Heavy hit at'); bgIn.maxLength = LIMITS.formula; top.appendChild(bgIn); }   // 1.6.0 (the book's ruling of 2026-10-29)
    top.appendChild(select('sys-vis', [['all', 'Visible to players'], ['gm', 'GM only']], r.vis || 'all', 'GM only: players never see this roll'));
    if (!isApply) top.appendChild(select('sys-roll-togm', [['', 'The player sees it'], ['run', 'Goes to the GM'], ['wait', 'Goes to the GM, Then waits']], r.toGm || '', 'Goes to the GM: the player sees only that it was sent, and you get the roll privately. Its Then runs at once, or waits for your Apply'));   // HR1
    top.appendChild(select('sys-roll-tone', [['', 'Plain button'], ['primary', 'Filled'], ['danger', 'Red'], ['neutral', 'Gray'], ['outline', 'Outline']], r.tone || '', 'How the button looks on the sheet'));   // Stage 6 look fold
    if (typeof window !== 'undefined' && window.wpSoundOn && r.id) { var snR = window.wpSoundOn.btn({ k: 'roll', r: r.id }, isApply ? 'A sound on this action' : 'A sound on this roll'); if (snR) top.appendChild(snR); }   // 1.6.2: adds to the list under the Sound panel
    if (!isApply && typeof dieSel === 'function') top.appendChild(dieSel('sys-roll-die', r.die, 'The die its button wears on the sheet and the HUD. From its formula: the die it rolls, so 3d6 shows three dice and d20 a d20'));   // 1.5.8, backlog 149
    var actsR = turnActs(); if (actsR.length || r.cost) top.appendChild(select('sys-roll-cost', costOptions(r.cost, actsR), r.cost || '', 'What one press costs in turn-based combat: one of the actions a turn allows (the Combat tab)'));   // turn-based combat T1
    if (r.cost) top.appendChild(costHow('sys-costhow', r.costN));   // 1.6.2 (G10): how many of it
    if (typeof draft !== 'undefined' && draft && draft.combat && draft.combat.initiative && draft.combat.initiative.clock) top.appendChild(clockBox('sys-clockn', r.clockN));   // 1.6.2 (G10): what it costs on a counting clock
    var roIcoIn = input('sys-roll-icon field', r.icon, 'An icon on the button: an emoji or a bundled icon (optional)', 'Icon'); roIcoIn.type = 'hidden'; top.appendChild(roIcoIn); top.appendChild(glyphButton(roIcoIn, 'Pick an icon from Waypoint\u2019s own icons or the emoji'));   // 1.6.3 (finding 35)
    if (typeof rollStationBox === 'function') { var rsB = rollStationBox(r); if (rsB) top.appendChild(rsB); }   // 1.6.0
    if (isApply) { var ea0 = r.each === 'round' || r.each === 'turn' || r.each === 'turnEnd' ? r.each : r.round === true ? 'round' : ''; top.appendChild(select('sys-roll-each', [['', 'Only when pressed'], ['round', 'Also each round'], ['turn', 'Also at its turn\u2019s start'], ['turnEnd', 'Also at its turn\u2019s end']], ea0, 'Runs during a combat as well: on every new round (every character in it, as parries counted back to 0), or when its character\u2019s turn begins (a bleed, a reaction back); pressed, it runs now')); if (ea0) top.appendChild(select('sys-roll-by', [['', 'automatically'], ['gm', 'when the GM presses it'], ['owner', 'when its player presses it']], r.by === 'gm' || r.by === 'owner' ? r.by : '', 'Automatically, or as a reminder in chat with a Run button: for you, or for the character\u2019s player (yours when they are not at the table, or the action is GM only)')); }   // Stage 6 HUD G10 + turn-based combat T2b
    if (!isApply && !r.init) { var eaR = r.each === 'round' || r.each === 'turn' || r.each === 'turnEnd' ? r.each : ''; top.appendChild(select('sys-roll-each', [['', 'Only when pressed'], ['round', 'Also due each round'], ['turn', 'Also due at its turn\u2019s start'], ['turnEnd', 'Also due at its turn\u2019s end']], eaR, 'Due during a combat as well: a reminder in chat with a Roll button, on every new round or when its character\u2019s turn begins (an HT roll to stay awake, say). It never rolls by itself')); if (eaR) top.appendChild(select('sys-roll-by', [['owner', 'for its player'], ['gm', 'for the GM']], r.by === 'gm' ? 'gm' : 'owner', 'Whose reminder it is: the character\u2019s player (yours when they are not at the table, or the roll is GM only), or yours')); }   // 1.5.9 (book es/et plan 4b): a roll at its turn's start, as a reminder card
    if (!isApply && !r.init && r.resist === true && typeof withRowSel === 'function') top.appendChild(withRowSel('sys-roll-anslist', r.withRow, typeof draft !== 'undefined' ? draft : null));   // 1.6.3 (defense fold 2): Answered with a row of
    if (!isApply && !r.init && typeof checkLabel === 'function') top.appendChild(checkLabel('sys-roll-rsist', r.resist === true, 'Resists an attempt', 'This roll answers an attempt made on its character. It can read how far the attempt succeeded, to be that much harder.'));   // 1.6.0 (B2)
    if (!r.init && typeof checkLabel === 'function' && (r.keep === 'scene' || (Array.isArray(draft.scenes) && draft.scenes.length))) top.appendChild(checkLabel('sys-roll-keepscene', r.keep === 'scene', 'Kept for the scene', 'What it comes to stays on the one it was rolled at, for later rolls to read as Target.Reaction, until the scene ends. Such as a reaction rolled once for a meeting'));   // 1.6.2
    if (!r.init && typeof checkLabel === 'function') top.appendChild(checkLabel('sys-roll-anytime', r.free === true, 'Any time', 'Called for off a character\u2019s turn, whatever Off a character\u2019s turn says, as a check you ask for. A roll that resists, the initiative roll, a roll due at a turn or a round and a roll from a card need no tick'));   // 1.6.0
    if (!isApply && typeof resistBySel === 'function') top.appendChild(resistBySel('sys-roll-rsby', r.resistBy, typeof draft !== 'undefined' ? draft : null));   // 1.6.0 (B2)
    if (!isApply && !r.init && r.dmg !== true && !r.area && typeof landDmgSel === 'function') top.appendChild(landDmgSel('sys-roll-lnddmg', r.landDmg, (draft.rolls || []).filter(function(x) { return x && x.dmg === true && x.id !== r.id && !Array.isArray(x.apply); }).map(function(x) { return [x.id, x.label || 'Roll']; }), null));   // 1.6.3 (defense fold 1): Its damage
    if (!isApply && !r.init && typeof areaBox === 'function') top.appendChild(areaBox(r, (draft.rolls || []).filter(function(x) { return x && x.dmg === true && x.id !== r.id; }).map(function(x) { return [x.id, x.label || x.id]; })));   // 1.6.0: a line it hits
    if (!isApply && r.resistBy && typeof resistOrBox === 'function') top.appendChild(resistOrBox('sys-roll-rsor', r.resistBy, r.resistOr, typeof draft !== 'undefined' ? draft : null));   // 1.6.0 (the core's gap 5)
    if (!isApply && r.resist === true && typeof input === 'function') { var ckI = input('sys-roll-critok field', typeof r.critOk === 'string' ? r.critOk : '', 'Where an attack that is not resisted on a critical is a critical, this defense is still offered while this holds for the one defending, such as Attempt.kind = 2. No dice. Empty: never', 'Answers a critical where'); ckI.maxLength = LIMITS.formula; top.appendChild(ckI); }   // 1.6.2 (the CORE session)
    if (!isApply && r.resistBy && typeof checkLabel === 'function') top.appendChild(checkLabel('sys-roll-rsnocrit', r.noResistOnCrit === true, 'Not resisted on a critical', 'A critical success sends its target nothing to resist. Leave it off where a critical is resisted as any success is'));   // 1.6.0
    if (!isApply) { var dl = el('label', 'sys-hover'); var dc = el('input'); dc.type = 'checkbox'; dc.className = 'sys-dmg-chk'; dc.checked = r.dmg === true; dl.appendChild(dc); dl.appendChild(document.createTextNode(' Damage')); dl.title = 'A damage roll: its card in Table Chat takes the damage color, a larger total and a damage tag'; top.appendChild(dl); }   // chat cards (owner 2026-09-27)
    if (!isApply && r.dmg === true && typeof input === 'function') { var htI = input('sys-roll-hits field', typeof r.hits === 'string' ? r.hits : '', 'Hits it rolls for: how many times this damage rolls, on one card with one Apply, such as Row.bursthits. Each hit is its own blow at the same location, and each reads its own round as Row.fired. No dice. Empty: once', 'Hits it rolls for'); htI.maxLength = LIMITS.formula; top.appendChild(htI); }   // 1.6.0 A burst
    if (!isApply && r.dmg === true && typeof input === 'function') { var mjI = input('sys-roll-mjif field', typeof r.dmgMajorIf === 'string' ? r.dmgMajorIf : '', 'A Major Wound where: Apply to target on its card lands the blow as a Major Wound while this formula of the roller\u2019s names is true, such as Edge >= 3. No dice. Always a Major Wound wins', 'A Major Wound where'); mjI.maxLength = LIMITS.formula; top.appendChild(mjI); }   // 1.6.0
    if (!isApply && r.dmg === true && typeof input === 'function') { var dtI = input('sys-roll-dtype field', typeof r.dtype === 'string' ? r.dtype : '', 'A damage roll\u2019s type, filled in when you press Apply to target on its card: a type\u2019s key from the Combat tab (stun), or a formula giving its place in that list, 1 for the first. Kept only on a damage roll', 'Damage type'); dtI.maxLength = LIMITS.formula; top.appendChild(dtI); var dkOn = typeof kindsNamed === 'function' && kindsNamed(); if (dkOn || r.dkind) { var dkI = input('sys-roll-dkind field', typeof r.dkind === 'string' ? r.dkind : '', 'The kind of blow: a kind\u2019s key from the Combat tab, or a formula giving its place in that list, 1 for the first. DR at a location and a layer read it as Blow.kind. Kept only on a damage roll', 'Kind'); dkI.maxLength = LIMITS.formula; top.appendChild(dkI); } var p2I = input('sys-roll-p2f field', typeof r.dmg2 === 'string' ? r.dmg2 : '', 'Second part: damage of another type in the same blow, rolled with it, such as 1d6+1. Its own DR is taken off, then both parts are one wound: one Major Wound test, one Any wound and one wear. Empty: none', 'Second part'); p2I.maxLength = LIMITS.formula; top.appendChild(p2I); var p2T = input('sys-roll-p2t field', typeof r.dtype2 === 'string' ? r.dtype2 : '', 'The second part\u2019s type: a type\u2019s key from the Combat tab, or a formula giving its place in that list, 1 for the first. Kept only beside a second part', 'Second part type'); p2T.maxLength = LIMITS.formula; top.appendChild(p2T); if (dkOn || r.dkind2) { var p2K = input('sys-roll-p2k field', typeof r.dkind2 === 'string' ? r.dkind2 : '', 'The second part\u2019s kind of blow: a kind\u2019s key from the Combat tab, or a formula giving its place in that list. Empty: the first part\u2019s kind. Kept only beside a second part', 'Second part kind'); p2K.maxLength = LIMITS.formula; top.appendChild(p2K); } [3, 4, 5].forEach(function(k) { var hasK = function(n) { return typeof r['dmg' + n] === 'string' && !!r['dmg' + n].trim(); }; if (!hasK(k - 1) && !hasK(k)) return; var nmK = k === 3 ? 'Third' : k === 4 ? 'Fourth' : 'Fifth'; var pkI = input('sys-roll-p' + k + 'f field', typeof r['dmg' + k] === 'string' ? r['dmg' + k] : '', nmK + ' part: damage of another type in the same blow, rolled with it. Its own DR is taken off, then every part is one wound. Empty: none', nmK + ' part'); pkI.maxLength = LIMITS.formula; top.appendChild(pkI); var pkT = input('sys-roll-p' + k + 't field', typeof r['dtype' + k] === 'string' ? r['dtype' + k] : '', 'The ' + nmK.toLowerCase() + ' part\u2019s type: a type\u2019s key from the Combat tab, or a formula giving its place in that list, 1 for the first. Kept only beside its part', nmK + ' part type'); pkT.maxLength = LIMITS.formula; top.appendChild(pkT); if (dkOn || r['dkind' + k]) { var pkK = input('sys-roll-p' + k + 'k field', typeof r['dkind' + k] === 'string' ? r['dkind' + k] : '', 'The ' + nmK.toLowerCase() + ' part\u2019s kind of blow: a kind\u2019s key from the Combat tab, or a formula giving its place in that list. Empty: the first part\u2019s kind. Kept only beside its part', nmK + ' part kind'); pkK.maxLength = LIMITS.formula; top.appendChild(pkK); } }); }   // 1.6.0 (B3): a blow of two damage types counts as one blow; and a third and a fourth part, each shown once the part before it has a formula
    if (!isApply && r.dmg === true && typeof checkLabel === 'function') top.appendChild(checkLabel('sys-roll-mjdmg', r.dmgMajor === true, 'Always a Major Wound', 'Apply to target on its card lands the blow as a Major Wound whatever its size, as a strike that always wounds badly'));   // 1.6.0
    top.appendChild(select('sys-roll-near', [['', 'Applies to the user'], ['near', 'Applies to the user or an adjacent character'], ['target', 'Applies to the user or their target']], (r.to === 'near' || r.to === 'target') ? r.to : '', 'Applies to: whom its changes go on. With an adjacent character, a press asks who it is for when someone stands next to you, your target first. With their target, it asks whether it is for your target, at any range, or for you. A row\u2019s own counters stay with the user. Its rules can ask whether it is used on yourself or on another'));   // 1.5.9 (book es/et plan, section 3): Applies to
    if (typeof usedByBox === 'function') top.appendChild(usedByBox('roll', r));   // 1.6.3 (finding 16): what names it, worked out when pressed
    top.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['del', 'Delete this roll', '&times;']]));
    row.appendChild(top);
    var ndR = el('div', 'sys-flags sys-roll-needsrow');   // 1.5.4: what it needs before it may be used, as a list roll's
    var ndI = input('sys-roll-needs field', typeof r.needs === 'string' ? r.needs : '', (isApply ? 'Pressed' : 'Rolled') + ' only while this formula is true for the character, such as Bleeding > 0. It may not hold dice. Leave it empty to ' + (isApply ? 'press' : 'roll') + ' at any time. By the clock and in a fight it is passed over while it is not met.', 'Needs, such as Bleeding > 0'); ndI.maxLength = LIMITS.formula; ndR.appendChild(ndI);
    var ndT = input('sys-roll-needstext field', typeof r.needsText === 'string' ? r.needsText : '', 'What the grayed button says when it cannot be used', 'Words for the grayed button'); ndT.maxLength = LIMITS.needsWords; ndR.appendChild(ndT);
    if (typeof checkLabel === 'function') ndR.appendChild(checkLabel('sys-roll-hideoff', r.hideOff === true, 'Hidden until it can be used', 'The button stands on the sheet only while its needs hold. Off: it stays there, grayed out. Only beside needs'));   // 1.6.0
    row.appendChild(ndR);
    if (typeof whyBox === 'function') row.appendChild(whyBox(r, 'roll'));   // 1.6.2: and each reason, with its own words
    row.appendChild(everyRow(r));   // item 20 K5: by the campaign's clock
    if (!isApply && typeof needsGmBox === 'function') ndR.appendChild(needsGmBox(r));   // 1.6.0
    row.appendChild(fightRow(r));   // backlog 152, fold 5: in a fight
    row.appendChild(askRow(r));   // and whether its runs wait for your word
    if (r.every || r.inFight || r.notes) row.appendChild(noteRow(r));   // 1.6.0, backlog 173: where its runs are said, for a time rule
    if (typeof crossRow === 'function') row.appendChild(crossRow(r));   // 1.5.9 (book es/et plan 4a): when a value crosses a step
    if (typeof asksBox === 'function') row.appendChild(asksBox(r));   // 1.6.2: what it asks when pressed
    if (!isApply && typeof cardBox === 'function') row.appendChild(cardBox(function() { return r.cardActs; }, function(l) { if (l) r.cardActs = l; else delete r.cardActs; }, r, 'roll'));   // 1.6.2: and what its card offers
    if (!isApply && r.init !== true && typeof helpBox === 'function') row.appendChild(helpBox(r));   // 1.6.2 Assist: and whether others may help
    if (typeof callsBox === 'function') row.appendChild(callsBox(r, typeof draft !== 'undefined' ? draft : null, isApply));   // 1.6.0: Calls for
    if (!isApply && !r.init && r.resist === true && typeof answersBox === 'function') row.appendChild(answersBox(r, typeof draft !== 'undefined' ? draft : null, typeof r.withRow === 'string' ? (draft.fields || []).filter(function(f) { return f && f.id === r.withRow && f.kind === 'item-list'; })[0] || null : null));   // 1.6.3 (defense fold 3): When it answers an attack
    if (!isApply && typeof bandBox === 'function') row.appendChild(bandBox(function() { return r.bands; }, function(l) { if (l) r.bands = l; else delete r.bands; }, true, function() { renderAll(); }));   // 1.6.2: result bands
    row.appendChild(applyEditor(r, isApply ? 'apply' : 'then'));   // R1: a roll's consequences under it
    if (typeof explainBox === 'function') row.appendChild(explainBox(r));   // 1.6.2 (backlog 218 fold 3)
    var err = errorCell(r.id); err.dataset.errFor = r.id; row.appendChild(err);
    return row;
}
function charRow(c, camp) {
    var row = el('div', 'sys-row sys-char-row'); row.dataset.cid = c.id;
    var top = el('div', 'sys-row-main');
    var nm = input('sys-char-name field', c.name, 'The character\'s name', 'Name'); top.appendChild(nm);
    if (typeof window !== 'undefined' && window.wpNames) top.appendChild(window.wpNames.button('person', nm));   // 1.6.2 (backlog 147): the name button
    var pn = playerNames(camp), ownOpts = [['', 'No player']].concat(Object.keys(pn).map(function(pid) { return [pid, pn[pid]]; }));
    if (c.ownerId && !Object.prototype.hasOwnProperty.call(pn, c.ownerId)) ownOpts.push([c.ownerId, 'A forgotten player, ' + c.ownerId]);   // so unassigning them is a real change
    var owner = select('sys-char-owner', ownOpts, c.ownerId || '', 'The player who plays this character (their token moves and their sheet edits)'); owner.disabled = !!c.npc; top.appendChild(owner);
    var active = c.ownerId && !c.npc ? activeCharOf(camp, c.ownerId).id : null, several = !!c.ownerId && !c.npc && playableChars(camp, c.ownerId).length > 1;
    if (several) { var plL = el('label', 'sys-hover sys-char-playsl'); var pl = el('input'); pl.type = 'radio'; pl.name = 'sys-plays-' + c.ownerId; pl.className = 'sys-char-plays'; pl.checked = active === c.id; plL.appendChild(pl); plL.appendChild(document.createTextNode(' In play')); plL.title = 'The character this player plays now: their token follows them from map to map. Their other characters are kept: the sheets stay theirs, and you move those tokens.'; top.appendChild(plL); }
    var npcL = el('label', 'sys-hover'); var npc = el('input'); npc.type = 'checkbox'; npc.className = 'sys-char-npc'; npc.checked = !!c.npc; npcL.appendChild(npc); npcL.appendChild(document.createTextNode(' NPC')); npcL.title = 'An NPC has no player and never reaches players'; top.appendChild(npcL);
    var por = el('button', 'tool ghost sys-btn sys-char-portrait', c.portrait ? 'Portrait ✓' : 'Portrait…'); por.title = c.portrait ? c.portrait + ' (click to change, right-click to clear)' : 'Pick a picture from the Image Library (then frame it)'; por.dataset.act = 'portrait'; top.appendChild(por);
    var openB = el('button', 'tool ghost sys-btn', 'Open sheet'); openB.dataset.act = 'open'; openB.title = 'Open this character\'s sheet over the play map'; top.appendChild(openB);
    if (hudFor(c.id)) { var hudB = el('button', 'tool ghost sys-btn', 'HUD'); hudB.dataset.act = 'hud'; hudB.title = 'Open this character\'s HUD over the play map (the saved system\'s)'; top.appendChild(hudB); }   // HUD frame (HF2b)
    top.appendChild(btnRow([['delchar', 'Delete this character (tokens keep their name, lose the link)', '&times;']]));
    row.appendChild(top);
    var tokens = 0; Object.values(camp.items || {}).forEach(function(m) { if (m && m.type === 'map') (m.whiteboard || []).forEach(function(w) { if (w && w.charId === c.id) tokens++; }); });
    row.appendChild(el('div', 'sys-note', (c.making === 1 ? 'Still being made by its player \u00b7 ' : '') + (tokens ? tokens + ' token' + (tokens === 1 ? '' : 's') + ' on the maps' : 'No token yet: pick this character in a token\'s Properties, or drop it from the Cast') + (c.ownerId ? ' · played by ' + (pn[c.ownerId] || c.ownerId) + (several ? (active === c.id ? ' · in play' : ' · kept, so you move its tokens') : '') : c.npc ? ' · NPC' : ' · no player yet, so no player sees it') + (c.making === 1 ? ' · being made by its player, theirs alone until Done' : c.unlocked === 1 ? ' · unlocked for its player' : '') + (c.review === 1 ? ' · new: review it on its sheet' : '')));
    return row;
}
// 5h: one library effect in the editor: name, icon, tone, duration note, its changes (a field and an amount, or a toggle switched on),
// notes, visibility and the usual move / duplicate / delete
function effectRow(d) {
    var row = el('div', 'sys-row sys-fx-row'); row.dataset.eid = d.id;
    var top = el('div', 'sys-row-main');
    var xIcoIn = input('sys-fx-icon field', d.icon, 'An icon (an emoji or a bundled icon)', 'Icon'); xIcoIn.type = 'hidden'; top.appendChild(xIcoIn); top.appendChild(glyphButton(xIcoIn, 'Pick an icon from Waypoint\u2019s own icons or the emoji'));   // 1.6.3 (finding 35)
    top.appendChild(input('sys-fx-name field', d.name, 'The effect\u2019s name on the sheet (Rage, Prone, Blessed\u2026)', 'Name'));
    top.appendChild(select('sys-fx-tone', [['', 'Neutral'], ['buff', 'Buff'], ['debuff', 'Debuff']], d.tone || '', 'Buff or Debuff (a color on the sheet)'));
    var durIn = input('sys-fx-dur field', d.dur, 'How long it lasts: 3 turns, 10 seconds, 1 minute, next turn, or your own unit (2 watches). It then runs out by itself (in a combat on its character\u2019s turns, out of one by the clock); any other note (until dawn) you end by hand', 'Duration'); top.appendChild(durIn);
    // 1.6.3 (the review of the System editor, finding 21): what the note is read as, in a gray line under the row, so a GM sees at once whether the
    // effect runs out by itself or stays on until someone ends it (systemcore lastsSays). It follows the box as it is typed, and says nothing while empty
    // The review of the words (1.6.3): it asks with the effect's Ends with pick too, read from its list as it stands (durRest, made below), so an effect a
    // rest ends says so in a plain line, and only a note that is no time and names no rest that ends it, or names a rest that ends nothing, warns
    var durRest = null, durSay = el('div', 'sys-note sys-fx-durline'), durSync = function() { var rp = durRest && typeof durRest.value === 'string' ? durRest.value : d.endsRest; var w = typeof lastsSays === 'function' ? lastsSays(String(durIn.value || ''), draft, { endsRest: rp }) : ''; durSay.textContent = w; durSay.hidden = !w; if (durSay.classList) durSay.classList.toggle('sys-warn-line', !!w && /^(Not read|Names )/.test(w)); };
    if (durIn.addEventListener) durIn.addEventListener('input', durSync); durSync();
    var mods = el('div', 'sys-fx-mods'), targets = fxTargets(draft, true);
    (d.mods || []).forEach(function(m, mi) {
        var ln = el('div', 'sys-fx-mod'); ln.dataset.mi = String(mi);
        var val = modVal(m), opts = targets.slice();
        if (!opts.some(function(o) { return o[0] === val; })) opts.unshift([val, '(a field that is gone or changed kind)']);
        ln.appendChild((typeof lazySelect === 'function' ? lazySelect : select)('sys-fx-target', opts, val, 'What this change affects', 'Find what it changes'));
        if (val.slice(-4) === '|row') rowAimInto(ln, draft, m, 'sys-fx-', mi);   // 1.5.8
        if (m.op !== 'on') { ln.appendChild(modHowSel('sys-fx-how', m.op)); var am = numInput('sys-fx-amt', m.v, 'How much it adds (negative to take away), or the figure it holds the value at'); am.step = 'any'; ln.appendChild(am);
            var amF = input('sys-fx-amtf field', typeof m.vf === 'string' ? m.vf : '', 'By a formula, in place of the number: the amount it adds or holds the value at, worked out for each character, such as -max(0, -MP) for 1 off each MP below 0. It reads the sheet with no effect applied, rolls no dice, and may not read a GM-only value', 'or by a formula'); amF.maxLength = LIMITS.formula; ln.appendChild(amF); if (typeof m.vf === 'string' && m.vf.trim()) am.disabled = true;
            if (d.val && m.op === 'add') { var pvL = el('label', 'sys-hover'), pvC = el('input'); pvC.type = 'checkbox'; pvC.className = 'sys-fxv-per'; pvC.checked = m.perVal === true; pvL.appendChild(pvC); pvL.appendChild(document.createTextNode(' Times its number')); pvL.title = 'This change is its amount times the effect’s number: Bleeding 3 with −1 here takes 3 off'; ln.appendChild(pvL); }   // 1.6.2
        }   // 1.6.0: Adds, At least or At most; CORE gap 12: by a formula
        if (m.op === 'add') { var stI = input('sys-fx-stack field', typeof m.stack === 'string' ? m.stack : '', 'Doesn\u2019t stack: a word for its kind of bonus. Of the changes on one figure that share it, only the largest bonus counts, as two stims that raise Agility give the larger, never the sum. A penalty still adds. Empty: it adds as ever', 'Doesn\u2019t stack: kind'); stI.maxLength = 24; ln.appendChild(stI); }   // 1.6.2
        ln.appendChild(btnRow([['fxmoddel', 'Remove this change', '&times;']]));
        mods.appendChild(ln);
    });
    var madd = el('button', 'tool ghost sys-btn', '+ Change'); madd.dataset.act = 'fxmodadd'; madd.title = 'Add a number to a field, or switch a toggle on'; if (!targets.length) madd.disabled = true; mods.appendChild(madd);
    var flags = el('div', 'sys-flags');
    flags.appendChild(input('sys-fx-notes field', d.notes, 'Notes shown as the effect\u2019s tooltip on the sheet', 'Notes'));
    flags.appendChild(select('sys-fx-vis', [['all', 'Visible to players'], ['gm', 'GM only']], d.vis || 'all', 'GM only: off the players\u2019 list until you apply it to their character'));
    var agW = el('span', 'sys-hover sys-fx-agbox', 'When added again: '); agW.appendChild(select('sys-fx-again', [['', 'Replace'], ['longer', 'Keep the longer'], ['add', 'Add the times']], d.again === 'longer' || d.again === 'add' ? d.again : '', 'Added again while it is on: Replace gives it the new time, Keep the longer keeps whichever has more time left (no end is the longest), Add the times adds the new time to what was left')); flags.appendChild(agW);   // 1.6.0 (a builder audit)
    var cvW = el('span', 'sys-hover sys-fx-coverbox', 'Gives cover: '), cvG = d.cover && typeof d.cover === 'object' && [1, 2, 3].indexOf(d.cover.g) >= 0 ? String(d.cover.g) : ''; cvW.appendChild(select('sys-fx-cover', [['', 'None'], ['1', 'Half'], ['2', 'Three-quarters'], ['3', 'Total']], cvG, 'While it is on, the token that wears it has this cover, as a ducking or a shield wall gives. The better of this and the map\u2019s own cover counts')); if (cvG) cvW.appendChild(select('sys-fx-covervs', [['', 'against everyone'], ['far', 'against attacks from further away']], d.cover.vs === 'far' ? 'far' : '', 'Against attacks from further away: only from a token not next to it')); flags.appendChild(cvW);   // 1.6.2
    var fvW = el('span', 'sys-hover sys-fxv-box'), fvL = el('label', 'sys-hover'), fvC = el('input'); fvC.type = 'checkbox'; fvC.className = 'sys-fxv-chk'; fvC.checked = !!d.val; fvL.appendChild(fvC); fvL.appendChild(document.createTextNode(' Holds a number')); fvL.title = 'The effect holds a number, as Bleeding 3. Its changes can be ticked Times its number. At 0 the effect ends'; fvW.appendChild(fvL);   // 1.6.2
    if (d.val) {
        fvW.appendChild(document.createTextNode(' Starts at ')); fvW.appendChild(numInput('sys-fxv-start field', d.val.start, 'Its number when it goes on and nothing says another'));
        fvW.appendChild(document.createTextNode(' Added again: ')); fvW.appendChild(select('sys-fxv-again', [['', 'Add the numbers'], ['higher', 'Keep the higher'], ['replace', 'Replace it']], d.val.again === 'higher' || d.val.again === 'replace' ? d.val.again : '', 'Added again while it is on: add the new number to it, keep the higher of the two, or take the new one'));
        fvW.appendChild(document.createTextNode(' Falls by ')); fvW.appendChild(numInput('sys-fxv-by field', d.val.by, 'How much it falls each time. Empty: it stays'));
        fvW.appendChild(select('sys-fxv-each', [['', 'It stays'], ['turn', 'each turn of its character'], ['minute', 'each game minute'], ['hour', 'each game hour']], d.val.by ? d.val.each || '' : '', 'When it falls. In a fight a character has one turn a round, at the start or end its Counts at says. A minute or an hour is on the game clock'));
    }
    flags.appendChild(fvW);
    var enW = el('span', 'sys-hover sys-fx-endsbox', 'Counts at: '); enW.appendChild(select('sys-fx-ends', [['', 'Its turn\u2019s start'], ['turnEnd', 'Its turn\u2019s end']], d.ends === 'turnEnd' ? 'turnEnd' : '', 'When a fight takes a turn off its time. At its turn\u2019s end, an effect of 1 turn lasts through its character\u2019s whole next turn, and one put on during a turn lasts through the turn after')); flags.appendChild(enW);   // 1.6.0
    var rsL = (Array.isArray(draft.rests) ? draft.rests : []).filter(function(x) { return !!x && typeof x.id === 'string' && typeof x.name === 'string' && !!x.name.trim(); }).map(function(x) { return [x.id, x.name.trim()]; });   // 1.6.2 (the owner: "A list on the effect"): the rest that ends it, where the system has rests
    if (typeof d.endsRest === 'string' && d.endsRest && d.endsRest !== '-' && !rsL.some(function(o) { return o[0] === d.endsRest; })) rsL.push([d.endsRest, 'A rest that is gone']);
    if (rsL.length || d.endsRest === '-') { var erW = el('span', 'sys-hover sys-fx-restbox', 'Ends with: '); durRest = select('sys-fx-rest', [['', 'What its Duration says'], ['-', 'No rest']].concat(rsL), typeof d.endsRest === 'string' ? d.endsRest : '', 'The rest that ends this effect for each who rests. Pick a rest and only that rest ends it. No rest: no rest ends it. Either way its Duration is not read for this. What its Duration says: a rest ends it where the Duration names that rest, such as Until a long rest'); erW.appendChild(durRest); flags.appendChild(erW); if (durRest.addEventListener) durRest.addEventListener('change', durSync); durSync(); }   // the Duration line follows a pick at once
    var egW = el('span', 'sys-hover sys-fx-egbox', 'Shares an end: '); egW.appendChild(input('sys-fx-endgroup field', d.endGroup, 'A short word. Effects with the same word end together: when one comes on, an effect of a higher rank that would end sooner takes the later end. Letters, digits, hyphens and underscores', 'none'));
    if (typeof d.endGroup === 'string' && d.endGroup) { egW.appendChild(document.createTextNode(' Rank: ')); egW.appendChild(numInput('sys-fx-endrank field', d.endRank, 'Higher is heavier. Empty counts as 1')); }
    flags.appendChild(egW);   // 1.6.0
    var psL = typeof postureList === 'function' ? postureList(draft) : []; if (psL.length) { flags.appendChild(select('sys-fx-posture', [['', 'Sets no posture']].concat(psL.map(function(p) { return [p.id, 'Sets ' + p.name]; })), typeof d.posture === 'string' ? d.posture : '', 'The posture each token of the character takes the moment the effect comes on, as Down lays a token prone. It stays after the effect ends unless Back when it ends is ticked')); if (d.posture) { var pbL = el('label', 'sys-hover'), pbC = el('input'); pbC.type = 'checkbox'; pbC.className = 'sys-fx-postureback'; pbC.checked = d.postureBack === true; pbL.appendChild(pbC); pbL.appendChild(document.createTextNode(' Back when it ends')); pbL.title = 'When the effect ends, a token still in that posture goes back to the posture it had before'; flags.appendChild(pbL);
        var kpW = el('span', 'sys-hover sys-fx-keepbox', ' Unless already: '); kpW.title = 'A token already in a posture ticked here stays as it is when the effect comes on, as Down leaves a token lying face up';
        psL.forEach(function(p) { if (p.id === d.posture) return; var kl = el('label', 'sys-hover'), kc = el('input'); kc.type = 'checkbox'; kc.className = 'sys-fx-posturekeep'; kc.setAttribute('data-pid', p.id); kc.checked = Array.isArray(d.postureKeep) && d.postureKeep.indexOf(p.id) >= 0; kl.appendChild(kc); kl.appendChild(document.createTextNode(' ' + p.name + ' ')); kpW.appendChild(kl); });
        flags.appendChild(kpW); } }   // 1.6.0: the postures it leaves alone   // 1.5.9 (the owner's O6)
    flags.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['dup', 'Duplicate', '<i class="wib wi-dup"></i>'], ['del', 'Delete this effect', '&times;']]));
    row.appendChild(top); row.appendChild(durSay); row.appendChild(mods); if (typeof swBox === 'function') row.appendChild(swBox(d)); row.appendChild(flags);
    var auR = el('div', 'sys-flags sys-fx-autorow'), auI = input('sys-fx-auto field', typeof d.auto === 'string' ? d.auto : '', 'A formula: while it is true, or a number other than 0, the effect is on by itself for every character, as HP <= 0 turns on Unconscious. It reads the character\u2019s own values with the effects applied by hand (never another automatic effect, and a token\u2019s names read 0). Only a visible effect reading only what players can read applies itself', 'Applies itself when\u2026 (e.g. HP <= 0)'); auI.maxLength = LIMITS.formula; auR.appendChild(auI); row.appendChild(auR);   // conditions C4
    row.appendChild(fxEndBox(d));   // 1.6.2 (the CORE session): what happens when it ends
    if (typeof explainBox === 'function') row.appendChild(explainBox(d));   // 1.6.2 (backlog 218 fold 3)
    var auE = errorCell(d.id); auE.dataset.errFor = d.id; row.appendChild(auE);
    return row;
}
// 1.6.2 (the CORE session: a boost whose crash comes when it runs out, a rage that leaves you tired): an effect's When it ends, its changes in an
// action's own rows (applyEditor, key 'end': a pool, a number or an effect switched), a roll asked of the character, and whether switching it off
// by hand runs them too. Their amounts read the effect's own number as EffectNumber
function fxEndBox(d) {
    var box = el('div', 'sys-fx-endrow'), hd = el('div', 'sys-fx-endhead', 'When it ends'); hd.title = 'What happens once, on the character, when the effect runs out by its time or its number reaching 0. An amount may read the number the effect held, as its own number'; box.appendChild(hd);
    box.appendChild(applyEditor(d, 'end'));
    var fl = el('div', 'sys-flags'), rls = (draft.rolls || []).filter(function(r) { return !!r && typeof r.id === 'string' && !Array.isArray(r.apply); }).map(function(r) { return [r.id, 'Asks for ' + (String(r.label || 'a roll').split('{')[0].trim() || 'a roll')]; });
    if (typeof d.endRoll === 'string' && d.endRoll && !rls.some(function(o) { return o[0] === d.endRoll; })) rls.push([d.endRoll, 'A roll that is gone']);
    fl.appendChild(select('sys-fx-endroll', [['', 'Asks for no roll']].concat(rls), typeof d.endRoll === 'string' ? d.endRoll : '', 'A roll asked of the character as the effect ends: a card to its player, or to you for an NPC, a GM-only roll or a GM-only effect'));
    var ol = el('label', 'sys-hover'), oc = el('input'); oc.type = 'checkbox'; oc.className = 'sys-fx-endoff'; oc.checked = d.endOff === true; ol.appendChild(oc); ol.appendChild(document.createTextNode(' Also when switched off')); ol.title = 'Ticked: it runs when the effect is switched off or taken off by hand too. Unticked: only when it runs out'; fl.appendChild(ol);
    box.appendChild(fl);
    return box;
}
// 1.6.0 roll switches (the owner, by prompt: "In the ± window"): the bonuses an item or an effect offers to rolls, each a line: its name, how
// much it helps, and the rolls it offers itself to (a field's own roll, a system roll, any roll on a list's rows, or only on rows of one entry
// by its key). A roller ticks it in the roll's ± window, and the host checks it is theirs. What Save does with each said under it, the
// cleaner's own reading. Values and text nodes only
function swTargets() {
    var o = [], nm = function(x) { return x.label || x.key || x.id; };
    (draft.fields || []).forEach(function(f) { if (f && typeof f.id === 'string' && f.roll) o.push(['f|' + f.id, 'The roll of ' + nm(f)]); });
    (draft.rolls || []).forEach(function(r) { if (r && typeof r.id === 'string' && !Array.isArray(r.apply) && typeof r.formula === 'string') o.push(['r|' + r.id, 'Roll: ' + (r.label || r.id)]); });
    (draft.fields || []).forEach(function(f) { if (f && typeof f.id === 'string' && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls) && f.list.rolls.some(function(r) { return r && !Array.isArray(r.apply); })) o.push(['l|' + f.id, 'Rolls on ' + nm(f)]); });
    return o;
}
function swToVal(t) { return t && typeof t === 'object' ? (typeof t.f === 'string' ? 'f|' + t.f : typeof t.r === 'string' ? 'r|' + t.r : typeof t.l === 'string' ? 'l|' + t.l : '') : ''; }
function swToOf(v) { var p = String(v || '').split('|'), o = {}; if ((p[0] === 'f' || p[0] === 'r' || p[0] === 'l') && p[1]) { o[p[0]] = p[1]; return o; } return null; }
function swBox(h) {
    var box = el('div', 'sys-fx-mods sys-sw-box'), sws = Array.isArray(h.rollSw) ? h.rollSw : [], tg = swTargets();
    box.appendChild(el('span', 'sys-note', 'Roll bonuses it offers, each a tick in the roll\u2019s \u00b1 window:'));
    sws.forEach(function(s, si) {
        if (!s || typeof s !== 'object') return;
        var ln = el('div', 'sys-fx-mod sys-sw'); ln.dataset.si = String(si);
        ln.appendChild(input('sys-sw-name field', typeof s.name === 'string' ? s.name : '', 'Its name in the roll\u2019s \u00b1 window and on the card, such as Aimed shot', 'Name'));
        ln.appendChild(numInput('sys-sw-v', typeof s.v === 'number' ? s.v : '', 'How much it helps the roll, as the \u00b1 window\u2019s modifier does. A negative one hinders. Whole, 1 to 99 either way, or 0 where it adds dice alone', '1'));
        if ((draft.items || []).indexOf(h) >= 0) ln.appendChild(input('sys-sw-tiers field', typeof s.tiers === 'string' ? s.tiers : typeof modTiersText === 'function' ? modTiersText(s.tiers) : '', 'Its figure by the level of the row that holds it, such as 1: +1, 3: +2. Below the first level it is the figure beside. Blank: the same at every level', 'By level'));   // 1.6.2 (the CORE session, 5c)
        ln.appendChild(input('sys-sw-d field', typeof s.d === 'string' ? s.d : '', 'Dice it adds to the roll, such as +1d6 or +1d6 \u2212 1d4: up to 4, each up to 20 dice. They add to the total and never make a critical. Blank: none', 'Dice it adds'));   // 1.6.2
        var pyO = [['', 'No cost']].concat((Array.isArray(draft.rolls) ? draft.rolls : []).filter(function(r) { return !!r && Array.isArray(r.apply) && typeof r.id === 'string'; }).map(function(r) { return [r.id, 'Costs: ' + (r.label || 'Apply')]; })); if (typeof s.pay === 'string' && s.pay && !pyO.some(function(o) { return o[0] === s.pay; })) pyO.push([s.pay, 'Costs: an action that is gone']); ln.appendChild(select('sys-sw-pay', pyO, typeof s.pay === 'string' ? s.pay : '', 'What ticking it spends: one of the system\u2019s actions, run as the roll is made. A roll it cannot pay for is refused'));
        (Array.isArray(s.to) ? s.to : []).forEach(function(t, ti) {
            var tw = el('span', 'sys-sw-to'), v = swToVal(t), op = tg.slice(); tw.dataset.ti = String(ti);
            if (v && !op.some(function(o) { return o[0] === v; })) op.unshift([v, '(a roll that is gone)']);
            tw.appendChild(select('sys-sw-tosel', op, v, 'A roll it offers itself to'));
            if (t && typeof t.l === 'string') tw.appendChild(entryPick(input('sys-sw-key field', typeof t.key === 'string' ? t.key : '', 'Only on rows of this entry. Blank: on every row of the list', 'Entry (optional)'), entryNames(draft, t.l), 'Every row of the list'));
            if (t && typeof t.l === 'string') { var swR = swRollOpts(t.l, t.roll); tw.appendChild(select('sys-sw-roll', swR.o, swR.v, 'Only this roll of the list, such as its Attack and not its Damage. Any roll: every roll on its rows')); }   // 1.6.0
            tw.appendChild(btnRow([['swtodel', 'Take this roll off', '&times;']]));
            ln.appendChild(tw);
        });
        if (!Array.isArray(s.to) || s.to.length < LIMITS.swTo) { var ta = el('button', 'tool ghost sys-btn', '+ Another roll'); ta.dataset.act = 'swtoadd'; ta.title = 'Another roll it offers itself to'; if (!tg.length) ta.disabled = true; ln.appendChild(ta); }
        ln.appendChild(btnRow([['swdel', 'Remove this bonus', '&times;']]));
        box.appendChild(ln);
        var er = el('div', 'sys-err sys-sw-err'); er.dataset.si = String(si); er.textContent = swSays(s); box.appendChild(er);
    });
    if (sws.length < LIMITS.rollSw) { var add = el('button', 'tool ghost sys-btn', '+ Roll bonus'); add.dataset.act = 'swadd'; add.title = tg.length ? 'A bonus a roller may add to some rolls, ticked in the roll\u2019s \u00b1 window' : 'Give a field a roll, or add a roll, first'; if (!tg.length) add.disabled = true; box.appendChild(add); }
    return box;
}
// 1.6.0: a list target's one roll, by label: Any roll, then each roll of the list that has a label; a label no roll has now kept and said
function swRollOpts(lid, cur) {
    var f = (draft.fields || []).filter(function(x) { return x && x.id === lid; })[0], rs = f && f.list && Array.isArray(f.list.rolls) ? f.list.rolls : [], o = [['', 'Any roll']], v = '';
    rs.forEach(function(r) { if (r && !Array.isArray(r.apply) && typeof r.label === 'string' && r.label.trim() && !o.some(function(x) { return x[0].toLowerCase() === r.label.trim().toLowerCase(); })) o.push([r.label.trim(), r.label.trim()]); });
    if (typeof cur === 'string' && cur.trim()) { var hit = o.filter(function(x) { return x[0] && x[0].toLowerCase() === cur.trim().toLowerCase(); })[0], wasR = hit ? null : rs.filter(function(r) { return r && !Array.isArray(r.apply) && typeof r.label === 'string' && Array.isArray(r.was) && r.was.some(function(x) { return typeof x === 'string' && x.toLowerCase() === cur.trim().toLowerCase(); }); })[0]; if (hit) v = hit[0]; else if (wasR) v = wasR.label.trim(); else { o.push([cur, cur + ' (no roll of that name now)']); v = cur; } }   // 1.6.2: a roll that had that label is that roll
    return { o: o, v: v };
}
function swSays(s) {   // what Save does with one roll bonus: '' where it keeps it whole
    if (!s || typeof s !== 'object') return '';
    if (!(typeof s.name === 'string' && s.name.trim())) return 'Save drops it: it needs a name.';
    var n = typeof s.v === 'number' && isFinite(s.v) ? Math.round(s.v) : 0, dz = typeof swDice === 'function' ? swDice(s.d) : ''; if (dz === null) return 'Save drops its dice: write them as 1d6, or +1d6 \u2212 1d4, up to 4, each up to 20 dice of up to 1000 sides.'; if ((!n && !dz) || n < -99 || n > 99) return 'Save drops it: how much it helps must be a whole number from 1 to 99, or from \u22121 to \u221299, or it must add dice.';
    if (!cleanRollSw([s])) return 'Save drops it: it needs a roll it offers itself to.';
    if (typeof s.pay === 'string' && s.pay && !(Array.isArray(draft.rolls) ? draft.rolls : []).some(function(r) { return !!r && r.id === s.pay && Array.isArray(r.apply); })) return 'It is kept, but the action it costs is gone, so a roll that ticks it is refused. Pick another, or No cost.';
    var gone = (Array.isArray(s.to) ? s.to : []).filter(function(t) { return t && typeof t.l === 'string' && typeof t.roll === 'string' && t.roll.trim() && swRollOpts(t.l, t.roll).o.some(function(x) { return / \(no roll of that name now\)$/.test(x[1]); }); })[0];   // 1.6.0
    if (gone) return 'It is kept, but no roll of that list is named ' + gone.roll.trim() + ' now, so it offers itself to none there.';
    var sgn = typeof swGone === 'function' ? swGone(draft, s) : []; if (sgn.length) return 'It is kept, but ' + sgn[0] + '.';   // 1.6.2 (backlog 208, point 10)
    return '';
}
function swHolder(t) { return fxOfRow(t) || itemOfRow(t); }
function swLine(t, h) { var ln = t && t.closest ? t.closest('.sys-sw') : null; if (!ln || !h || !Array.isArray(h.rollSw)) return null; var s = h.rollSw[+ln.dataset.si]; return s && typeof s === 'object' ? { ln: ln, s: s } : null; }
function swSaysAt(t, s) { var box = t.closest ? t.closest('.sys-sw-box') : null, ln = t.closest ? t.closest('.sys-sw') : null, er = box && ln ? Array.prototype.filter.call(box.querySelectorAll('.sys-sw-err'), function(x) { return x.dataset.si === ln.dataset.si; })[0] : null; if (er) er.textContent = swSays(s); }
function onSwInput(t) {
    var c = t.className || ''; if (!/(^| )sys-sw-(name|v|key|d)( |$)/.test(c)) return false;
    var L = swLine(t, swHolder(t)); if (!L) return true;
    if (/(^| )sys-sw-name( |$)/.test(c)) L.s.name = String(t.value).slice(0, LIMITS.label);
    else if (/(^| )sys-sw-v( |$)/.test(c)) { var n = parseFloat(t.value); if (isFinite(n)) L.s.v = n; else delete L.s.v; }
    else if (/(^| )sys-sw-tiers( |$)/.test(c)) { if (t.value.trim()) L.s.tiers = t.value.slice(0, 400); else delete L.s.tiers; }   // 1.6.2 (5c): kept as typed, read by the cleaner
    else if (/(^| )sys-sw-d( |$)/.test(c)) { var dv = String(t.value).slice(0, 80); if (dv.trim()) L.s.d = dv; else delete L.s.d; }   // 1.6.2
    else { var tw = t.closest('.sys-sw-to'), tt = tw && Array.isArray(L.s.to) ? L.s.to[+tw.dataset.ti] : null; if (tt && typeof tt === 'object') { var k = String(t.value).trim().slice(0, LIMITS.key); if (k) tt.key = k; else delete tt.key; } }
    markDirty(); swSaysAt(t, L.s); return true;
}
function onSwChange(t) {
    if (/(^| )sys-sw-pay( |$)/.test(t.className || '')) { var LP = swLine(t, swHolder(t)); if (!LP) return true; if (t.value) LP.s.pay = t.value; else delete LP.s.pay; markDirty(); swSaysAt(t, LP.s); return true; }   // 1.6.2 (G6)
    if (/(^| )sys-sw-roll( |$)/.test(t.className || '')) {   // 1.6.0: one roll of the list, or any
        var LR = swLine(t, swHolder(t)), twR = t.closest ? t.closest('.sys-sw-to') : null, tR = LR && twR && Array.isArray(LR.s.to) ? LR.s.to[+twR.dataset.ti] : null; if (!tR || typeof tR !== 'object') return true;
        if (t.value) tR.roll = String(t.value).slice(0, LIMITS.label); else delete tR.roll; markDirty(); swSaysAt(t, LR.s); return true;
    }
    if (!/(^| )sys-sw-tosel( |$)/.test(t.className || '')) return false;
    var L = swLine(t, swHolder(t)), tw = t.closest ? t.closest('.sys-sw-to') : null, nt = swToOf(t.value); if (!L || !tw || !nt || !Array.isArray(L.s.to)) return true;
    L.s.to[+tw.dataset.ti] = nt; markDirty(); renderAll(); return true;
}
function onSwClick(b) {
    var a = b.dataset ? b.dataset.act : ''; if (a !== 'swadd' && a !== 'swdel' && a !== 'swtoadd' && a !== 'swtodel') return false;
    var h = swHolder(b); if (!h) return true;
    if (a === 'swadd') { var t0 = swTargets()[0], o0 = t0 ? swToOf(t0[0]) : null; if (!o0) return true; h.rollSw = Array.isArray(h.rollSw) ? h.rollSw : []; if (h.rollSw.length >= LIMITS.rollSw) { toast('At most ' + LIMITS.rollSw + ' roll bonuses each.'); return true; } h.rollSw.push({ name: String((typeof h.name === 'string' && h.name.trim()) || 'Bonus').slice(0, 60), v: 1, to: [o0] }); }   // 1.6.3 (Fulllion's rulings of 2026-11-20): it starts with a name, since Save keeps none without one
    else if (a === 'swdel') { var L = swLine(b, h); if (L) { h.rollSw.splice(+L.ln.dataset.si, 1); if (!h.rollSw.length) delete h.rollSw; } }
    else if (a === 'swtoadd') { var L2 = swLine(b, h), t1 = swTargets()[0], o1 = t1 ? swToOf(t1[0]) : null; if (L2 && o1) { L2.s.to = Array.isArray(L2.s.to) ? L2.s.to : []; if (L2.s.to.length < LIMITS.swTo) L2.s.to.push(o1); } }
    else { var L3 = swLine(b, h), tw = b.closest ? b.closest('.sys-sw-to') : null; if (L3 && tw && Array.isArray(L3.s.to)) L3.s.to.splice(+tw.dataset.ti, 1); }
    markDirty(); renderAll(); return true;
}
// [vehiclecheck:fliesbox-start]
// 1.6.2 (vehicles, fold (d), things in flight): an item that flies once a Launch puts it on the map: a small token of its own with no sheet, its own HP and Protection
function fliesBox(it) {
    var box = el('div', 'sys-fly'), fl = it.flies && typeof it.flies === 'object' ? it.flies : null;
    box.appendChild(checkLabel('sys-fly-on', !!fl, 'Flies once launched', 'A change that launches it puts it on the map as a small token of its own, which flies at its target a number of cells each round of the fight'));
    if (!fl) return box;
    var sp = input('sys-fly-speed field', typeof fl.speed === 'string' ? fl.speed : '', 'How many cells it flies each round, worked out from the launcher\u2019s sheet. It may read the map\u2019s factors', 'Speed in cells a round'); sp.maxLength = LIMITS.formula; box.appendChild(sp);
    box.appendChild(numField('sys-fly-rounds', fl.rounds || '', 'How many rounds it flies before it is spent', 'rounds', '1'));
    box.appendChild(numField('sys-fly-hp', fl.hp || '', 'Its HP. A hit takes a wound off it, worked out by your damage rules against its Protection', 'HP', '1'));
    box.appendChild(numField('sys-fly-pro', fl.pro || '', 'Its Protection, taken off a hit before the wound. Blank for none', 'Protection', '1'));
    box.appendChild(numField('sys-fly-size', fl.size || '', 'Its Size. Blank for none', 'Size', '1'));
    box.appendChild(select('sys-fly-path', [['', 'Homes in on its target'], ['line', 'Flies straight on']], fl.path === 'line' ? 'line' : '', 'Homing: each step goes to the cell nearest its target as the target now stands. Straight: it keeps to the line it was launched on, and misses a target that moves off it'));
    var rl = (typeof draft !== 'undefined' && draft && Array.isArray(draft.rolls) ? draft.rolls : []).filter(function(r) { return r && typeof r.id === 'string' && typeof r.formula === 'string' && !Array.isArray(r.apply); }).map(function(r) { return [r.id, 'On arrival: roll ' + (r.label || 'a roll')]; });
    if (typeof fl.roll === 'string' && fl.roll && !rl.some(function(o) { return o[0] === fl.roll; })) rl.push([fl.roll, 'On arrival: a roll that is gone']);
    box.appendChild(select('sys-fly-roll', [['', 'On arrival: it strikes']].concat(rl), fl.roll || '', 'What happens as it reaches its target. A roll is made as the launcher\u2019s attack, which the target may resist: on a hit its blast or damage lands. With no roll it strikes'));
    box.appendChild(select('sys-fly-end', [['', 'Out of rounds: it is gone'], ['off', 'Out of rounds: it goes off where it stands']], fl.end === 'off' ? 'off' : '', 'What happens when its rounds run out before it arrives. It can go off only where the item has a blast of its own'));
    return box;
}
// [vehiclecheck:fliesbox-end]
function fxOfRow(target) { var row = target.closest && target.closest('.sys-fx-row'); if (!row) return null; return (draft.effects || []).find(function(x) { return x.id === row.dataset.eid; }) || null; }
// 1.6.3 (the review of the System editor and the Library window, finding 35): a one-letter slip in a category leaves an item on no list, so the Items tab's
// Category offers what the system's items, its core and the library's entries already use (sheets.js catChoices, the list every other picker of
// categories reads), each once ignoring case. One datalist a row, beside the box: the tab draws one row at a time, so its id names one element. Text nodes alone
function itemCatList() {
    var dl = el('datalist', 'sys-item-catlist'), seen = Object.create(null); dl.id = 'sysItemCats';   // its class keeps it in the row's head beside the box (sysui GROUPS), never in More
    var cc = typeof catChoices === 'function' ? catChoices(draft) : []; (Array.isArray(cc) ? cc : []).forEach(function(c0) { var c = String(c0 || '').trim(); if (!c || seen[c.toLowerCase()]) return; seen[c.toLowerCase()] = 1; var o = el('option'); o.value = c; dl.appendChild(o); });
    return dl;
}
function itemRow(it) {
    var row = el('div', 'sys-row sys-item-row'); row.dataset.iid = it.id;
    var top = el('div', 'sys-row-main');
    top.appendChild(input('sys-item-name field', it.name, 'The item name shown on the sheet', 'Name'));
    var catIn = input('sys-item-cat field', it.category, 'A group, e.g. Explosives, Sidearms', 'Category'), sDefs = itemStatDefs(it); catIn.dataset.scope = sDefs.map(function(s) { return s.key.toLowerCase(); }).join(','); top.appendChild(catIn); if (catIn.setAttribute) catIn.setAttribute('list', 'sysItemCats'); if (typeof itemCatList === 'function') top.appendChild(itemCatList());   // 1.6.3 (the review of the System editor and the Library window, finding 35): the categories the system, its core and the library already use, offered as it is typed, as the Library window's Category is. F4c1: the lists it can be on decide its stat boxes (a category that changes them redraws the row)
    var area = el('div', 'sys-item-area');
    area.appendChild(select('sys-item-shape', [['', 'No blast'], ['circle', 'Blast (circle)']], it.area ? (it.area.shape || 'circle') : '', 'A thrown blast: a circular area, thrown from the sheet'));
    var ftw = numField('sys-item-ft', it.area ? it.area.ft : '', 'Blast radius in feet', 'ft'); if (!it.area) ftw.style.opacity = '0.5'; area.appendChild(ftw);
    if (it.area) {   // 1.5.8 explosives: its blast's damage type, whether going off uses one up, and whether it is placed, not thrown, with its trigger radius
        var dtys = draft.combat && draft.combat.damage && Array.isArray(draft.combat.damage.types) ? draft.combat.damage.types : [];
        if (dtys.length) area.appendChild(select('sys-item-atype', [['', 'Damage type: none']].concat(dtys.filter(function(y) { return y && typeof y.key === 'string'; }).map(function(y) { return [y.key, 'Damage type: ' + (y.label || y.key)]; })), it.area.type || '', 'The damage type of its blast, as the damage step reads it'));
        // 1.6.2 (the CORE session, 11); 1.6.3 (Fulllion's rulings of 2026-11-20: a box others depend on is required): Strikes at reads the Combat
        // tab's hit locations (Taking damage), so it is picked by name among that list's entries, Another entry for one a pack holds, as Unaimed
        // blows land at is. Where the system names no locations it has nothing to read: drawn only to show and clear a name already stored
        var lkI = draft.combat && draft.combat.damage && draft.combat.damage.locs && typeof draft.combat.damage.locs === 'object' ? draft.combat.damage.locs : null, alc = typeof it.area.loc === 'string' ? it.area.loc : '';
        if ((lkI && lkI.list) || alc) { var aloc = input('sys-item-aloc field', alc, 'The hit location its blast strikes, such as Legs for a mine underfoot. The usual one: where Unaimed blows land, else a location named Torso, else the first', 'Strikes at'); aloc.maxLength = 60; area.appendChild(lkI && lkI.list && typeof dbxLocNames === 'function' ? entryPick(aloc, dbxLocNames(lkI.list), 'Strikes at: the usual one') : aloc); }
        area.appendChild(numField('sys-item-aad', it.area.ad || '', 'Its armor divisor: DR is divided by it (2 for a (2) after the damage). Blank for none', 'divisor', '0.5'));
        area.appendChild(checkLabel('sys-item-ause', it.area.use === true, 'Uses one up', 'Going off takes one off the row it was thrown or placed from, and the row goes at none'));
        area.appendChild(checkLabel('sys-item-aplace', it.area.place === true, 'Placed, not thrown', 'A mine: its button places it on the map, hidden from players. It goes off only when a character steps into it, or by your hand'));
        area.appendChild(input('sys-item-afrag field', typeof it.area.frag === 'string' ? it.area.frag : '', 'Its fragmentation, a dice roll such as 1d6. When the blast goes off the host rolls it for the characters it reaches, as the Combat tab says. Blank: none', 'Fragmentation (optional)'));   // 1.5.9 (es)
        if (dtys.length) area.appendChild(select('sys-item-afragtype', [['', 'Fragmentation type: as the Combat tab says']].concat(dtys.filter(function(y) { return y && typeof y.key === 'string'; }).map(function(y) { return [y.key, 'Fragmentation type: ' + (y.label || y.key)]; })), typeof it.area.fragType === 'string' ? it.area.fragType : '', 'The damage type of its fragmentation, as the damage step reads it'));
        if (it.area.place === true) area.appendChild(numField('sys-item-atrig', it.area.trig || '', 'Trigger radius in yards: a character whose center comes this near sets it off. Fill it in: when it is empty the mine goes off within 2 yards', 'trigger yd', '0.5'));
        else area.appendChild(select('sys-item-aflight', [['', 'On a miss, launched: you place it'], ['scatter', 'On a miss, launched: it scatters, as a throw'], ['line', 'On a miss, launched: it flies straight']], it.area.flight === 'scatter' || it.area.flight === 'line' ? it.area.flight : '', 'How a round fired from a launcher lands when the roll misses. One that scatters lands as a missed throw does. One that flies straight goes off on the first wall or character in its path, or at its farthest'));   // 1.5.9 (es)
    }
    top.appendChild(area);
    top.appendChild(input('sys-item-damage field', it.damage, 'The damage in dice, such as 2d6 + 3', it.area && typeof it.area.frag === 'string' && it.area.frag.trim() ? 'Damage' : 'Damage (optional)'));   // 1.6.3: fragmentation rides on the damage, so with one it is no longer optional
    var flags = el('div', 'sys-flags');
    flags.appendChild(input('sys-item-cost field', it.cost, 'Point/credit cost (a formula, no dice), used by budgets in a later slice', 'Cost (optional)'));
    // 1.6.3 (Fulllion's rulings of 2026-11-20): the throw skill is what the Combat tab's throw roll reads as ThrowSkill, so it is no longer (optional), and
    // with none no throw roll is made (the validator says so under it). Since the review of the System editor and the Library window (finding 31) the
    // box is hidden and picked as a stat's option is (formbox.js dressOpts, one name): a figure of the sheet, or of one row of a list, such as a
    // skill's Target, each by its name and never typed
    // 1.6.3 (the review of items): only an item with a blast is thrown or placed, so the box says it is needed there alone, and optional on any other item
    flags.appendChild(input('sys-item-throw field', it.throwSkill, 'What the Combat tab’s throw roll is made against when it is thrown or placed, such as a skill’s target. With none, no throw roll is made: it lands where it is aimed', it.area ? (it.area.place === true ? 'Placing skill' : 'Throw skill') : 'Throw skill (optional)'));
    var iIcoIn = input('sys-item-icon field', it.icon, 'An emoji or a bundled icon shown on the row', 'Icon'); iIcoIn.type = 'hidden'; flags.appendChild(iIcoIn); flags.appendChild(glyphButton(iIcoIn, 'Pick an icon from Waypoint\u2019s own icons or the emoji'));   // 1.6.3 (finding 35): the box hidden, the picker shows the pick
    var iPicIn = el('input', 'sys-item-pic'); iPicIn.type = 'hidden'; iPicIn.value = typeof it.pic === 'string' ? it.pic : ''; flags.appendChild(iPicIn); if (typeof picPicker === 'function') flags.appendChild(picPicker(iPicIn));   // 1.6.2 (backlog 42): its own picture
    flags.appendChild(select('sys-item-vis', [['all', 'Visible to players'], ['gm', 'GM only']], it.vis || 'all', 'GM only: kept out of the players\u2019 list. One you give a character reaches its owner (name, icon, category and notes); its formulas never leave your machine'));
    flags.appendChild(select('sys-item-rmmode', [['', 'A player may remove it'], ['bound', 'Bound: only the GM removes it'], ['curse', 'Curse on contact: you keep it']], it.rm || '', 'When a player removes it from their character. Bound: it stays on their sheet and they see your message. Curse on contact: it leaves their sheet but stays on the character, out of their sight, until you remove it. Players never see this setting.'));   // Stage 6
    var rmIn = input('sys-item-rmtext field', it.rmMsg || '', 'Shown to the player when they try to remove it', 'Shown when it is Bound or Curse on contact'); rmIn.maxLength = LIMITS.rmMsg; if (!it.rm) rmIn.style.opacity = '0.5'; flags.appendChild(rmIn);
    var anyL = (draft.fields || []).some(function(x) { return x.kind === 'item-list' && x.list && x.list.lvl; }), anyO = (draft.fields || []).some(function(x) { return x.kind === 'item-list' && x.list && x.list.on; });   // Stage 6 F4b
    if (anyO) {
        flags.appendChild(select('sys-item-eqmode', [['', 'A player may switch it off'], ['bound', 'Bound: it stays on'], ['curse', 'Curse on contact: you keep it on']], it.eq || '', 'When a player switches it off (Readied, Equipped\u2026). Bound: it stays on and they see your message; just after it goes on, it still comes off. Curse on contact: it looks off to them but stays on, out of their sight, until you switch it off. Players never see this setting.'));
        var eqIn = input('sys-item-eqtext field', it.eqMsg || '', 'Shown to the player when they try to switch it off', 'Shown when it is Bound or Curse on contact'); eqIn.maxLength = LIMITS.rmMsg; if (!it.eq) eqIn.style.opacity = '0.5'; flags.appendChild(eqIn);
    }
    flags.appendChild(select('sys-item-again', [['', 'Held once'], ['name', 'Held again under another name']], it.again === 'name' ? 'name' : '', 'On a list that holds each item once, a character may hold this one again as another row. Each copy is asked for a name of its own, and two copies of one name are refused'));   // 1.6.0
    flags.appendChild(input('sys-item-key field', it.key || '', 'A short fixed name for it, once in each list it can be on: a letter, then letters, digits and _. Formulas read its row by it: List.key.lvl, List.key.qty', 'Key (optional)'));
    if (anyL) flags.appendChild(numField('sys-item-lvl', it.lvl, 'The level a new row of it starts at (blank: the list\u2019s default)', 'Level'));
    if (anyL) flags.appendChild(input('sys-item-only field', lvlOnlyText(it.lvlOnly), 'The levels it exists at, such as 2, 4 or 3 to 5. A list with named levels takes the names too. A new row starts at the first of them, and a player is refused any other. Blank: any level', 'Levels it may be (optional)'));   // 1.6.0
    flags.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['dup', 'Duplicate', '<i class="wib wi-dup"></i>'], ['del', 'Delete this item', '&times;']]));
    row.appendChild(top); row.appendChild(flags);
    var stBox = itemStatsBox(it, sDefs); if (stBox) row.appendChild(stBox);   // F4c1
    var nrow = el('div', 'sys-item-notes-row'); nrow.appendChild(input('sys-item-notes field', it.notes, 'Notes shown on the sheet', 'Notes (optional)')); row.appendChild(nrow);
    row.appendChild(itemModsBox(it, anyL, anyO));   // Stage 6 F6
    if (typeof grantBox === 'function') row.appendChild(grantBox(it));   // 1.6.0 (v2, B4): the rows it grants
    if (typeof swBox === 'function') row.appendChild(swBox(it));   // 1.6.0: its roll bonuses (asked through typeof: a suite slices this row alone)
    if (typeof fliesBox === 'function') row.appendChild(fliesBox(it));   // 1.6.2 (vehicles, fold (d)): what it is once launched
    if (it.area) row.appendChild(affBox(it));   // 1.5.9 (es): its blast's afflictions
    if (it.area && typeof cloudBox === 'function') row.appendChild(cloudBox(it));   // 1.6.2: the cloud it leaves
    var err = errorCell(it.id); err.dataset.errFor = it.id; row.appendChild(err);
    return row;
}
// 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2, its affliction half): an explosive's afflictions (systemcore cleanAffs), two at most,
// each a line of its own: what it is resisted against, the effect a failure puts on, whom it reaches, Only where, and how long it lasts; what Save
// does with each said under it, the cleaner's own reading. Values and text nodes only
var AFF_WHO = [['', 'Reaches those it hurts'], ['all', 'Reaches everyone in the blast']], AFF_UNITS_ED = [['turns', 'turns'], ['seconds', 'seconds'], ['minutes', 'minutes'], ['hours', 'hours'], ['days', 'days']];
function affBox(it) {
    var box = el('div', 'sys-fx-mods sys-item-affs'), affs = it.area && Array.isArray(it.area.aff) ? it.area.aff : [], effs = (draft.effects || []).filter(function(d) { return d && typeof d.id === 'string'; });
    var tu = draft.combat && draft.combat.turn && Array.isArray(draft.combat.turn.units) ? draft.combat.turn.units.filter(function(u) { return u && typeof u.key === 'string'; }) : [];
    box.appendChild(el('span', 'sys-note', 'Afflictions it puts on those it reaches, each resisted with the Combat tab’s resist roll:'));
    affs.forEach(function(a, ai) {
        if (!a || typeof a !== 'object') return;
        var ln = el('div', 'sys-fx-mod sys-item-aff'); ln.dataset.ai = String(ai);
        ln.appendChild(input('sys-item-affvs field', typeof a.vs === 'string' ? a.vs : '', 'What it is resisted against, read with the character it reaches, such as HT-2. The Combat tab’s resist roll reads it as Resist', 'Resist against, e.g. HT-2'));
        var fxO = [['', 'On a failure: pick an effect']].concat(effs.map(function(d) { return [d.id, 'On a failure: ' + (d.name || 'An effect with no name')]; }));
        if (typeof a.fx === 'string' && a.fx && !effs.some(function(d) { return d.id === a.fx; })) fxO.push([a.fx, 'On a failure: an effect that is gone']);
        ln.appendChild(select('sys-item-afffx', fxO, typeof a.fx === 'string' ? a.fx : '', 'The effect put on a character that fails to resist'));
        ln.appendChild(select('sys-item-affwho', AFF_WHO, a.who === 'all' ? 'all' : '', 'Whom it reaches: those the blast or its fragmentation hurt, or everyone in the blast’s radius'));
        ln.appendChild(input('sys-item-affneeds field', typeof a.needs === 'string' ? a.needs : '', 'A formula of the character it reaches that must hold for it to touch them at all, such as not Robot. Blank: everyone it reaches', 'Only where (optional)'));
        var ls = a.lasts && typeof a.lasts === 'object' ? a.lasts : {};
        ln.appendChild(input('sys-item-afflasts field', typeof ls.n === 'string' ? ls.n : '', 'How long the effect lasts, a formula that may roll dice, such as 1d6. Blank: the effect’s own duration', 'Lasts (optional)'));
        var uO = AFF_UNITS_ED.concat(tu.map(function(u) { return [u.key, u.label || u.key]; })); if (typeof ls.u === 'string' && ls.u && !uO.some(function(o) { return o[0] === ls.u; })) uO.push([ls.u, ls.u]);
        ln.appendChild(select('sys-item-affunit', uO, typeof ls.u === 'string' && ls.u ? ls.u : 'minutes', 'The unit of its Lasts'));
        ln.appendChild(btnRow([['affdel', 'Remove this affliction', '&times;']]));
        box.appendChild(ln);
        var er = el('div', 'sys-err sys-item-afferr'); er.dataset.ai = String(ai); er.textContent = affSays(a, it); box.appendChild(er);
    });
    if (affs.length < (LIMITS.areaAffs || 2)) { var add = el('button', 'tool ghost sys-btn', '+ Affliction'); add.dataset.act = 'affadd'; add.title = effs.length ? 'A resist roll each character it reaches makes, and an effect put on at a failure' : 'Add an effect in the Effects tab first'; if (!effs.length) add.disabled = true; box.appendChild(add); }
    return box;
}
// 1.6.2 (the owner, 2026-11-08): the cloud an explosive leaves where it goes off: how long, in rounds of a fight or the game's time, its radius,
// smoke, an effect while in it and a roll the GM's button makes for everyone in it. Save cleans it (systemcore cleanCloud)
function cloudBox(it) {
    var box = el('div', 'sys-cloud'), cl = it.area && it.area.cloud && typeof it.area.cloud === 'object' ? it.area.cloud : null;
    box.appendChild(checkLabel('sys-cloud-on', !!cl, 'Leaves a cloud', 'Where it goes off it leaves a cloud on the map, a round area that stays put. In a fight it counts rounds of that fight, out of one the game\u2019s time'));
    if (!cl) return box;
    var tu = draft.combat && draft.combat.turn && Array.isArray(draft.combat.turn.units) ? draft.combat.turn.units.filter(function(u) { return u && typeof u.key === 'string'; }) : [];
    var nIn = input('sys-cloud-n field', typeof cl.n === 'string' ? cl.n : '', 'How long it stays, a formula that may roll dice, such as 3 or 1d6+2. Blank: until you clear it', 'Lasts (optional)'); nIn.maxLength = LIMITS.formula; box.appendChild(nIn);
    var uO = [['turns', 'rounds']].concat(AFF_UNITS_ED.filter(function(o) { return o[0] !== 'turns'; }), tu.map(function(u) { return [u.key, u.label || u.key]; })); if (typeof cl.u === 'string' && cl.u && !uO.some(function(o) { return o[0] === cl.u; })) uO.push([cl.u, cl.u]);
    box.appendChild(select('sys-cloud-u', uO, typeof cl.u === 'string' && cl.u ? cl.u : 'turns', 'The unit of its Lasts. Rounds count the fight on its map, and the game\u2019s time out of one'));
    box.appendChild(numField('sys-cloud-r', cl.r || '', 'Its radius in yards. Blank: the blast\u2019s own', 'cloud yd', '0.5'));
    box.appendChild(checkLabel('sys-cloud-smoke', cl.smoke === true, 'Smoke', 'It blocks sight as smoke does, for the eyes and every sense that does not see through smoke'));
    var effs = (draft.effects || []).filter(function(d) { return d && typeof d.id === 'string'; }), fxO = [['', 'While in it: no effect']].concat(effs.map(function(d) { return [d.id, 'While in it: ' + (d.name || 'An effect with no name')]; }));
    if (typeof cl.fx === 'string' && cl.fx && !effs.some(function(d) { return d.id === cl.fx; })) fxO.push([cl.fx, 'While in it: an effect that is gone']);
    box.appendChild(select('sys-cloud-fx', fxO, typeof cl.fx === 'string' ? cl.fx : '', 'An effect put on whoever stands in it, and taken off as they leave'));
    var rl = (Array.isArray(draft.rolls) ? draft.rolls : []).filter(function(r) { return r && typeof r.id === 'string' && typeof r.formula === 'string' && !Array.isArray(r.apply); }).map(function(r) { return [r.id, 'Roll for those in it: ' + (r.label || 'a roll')]; });
    if (typeof cl.roll === 'string' && cl.roll && !rl.some(function(o) { return o[0] === cl.roll; })) rl.push([cl.roll, 'Roll for those in it: a roll that is gone']);
    box.appendChild(select('sys-cloud-roll', [['', 'No roll for those in it']].concat(rl), typeof cl.roll === 'string' ? cl.roll : '', 'A roll its right-click menu makes for everyone standing in it, as a hazard\u2019s'));
    return box;
}
// what Save does with one affliction: '' where it keeps it whole. it (1.6.3, Fulllion's rulings of 2026-11-20: a box others depend on is required),
// the item that holds it, where it is handed in: an affliction set to reach those it hurts needs the item's Damage, since "those it hurts" are those
// its blast's shares and fragmentation wounded, and with no Damage nothing is rolled (fragmentation rides on the damage), so it never lands
function affSays(a, it) {
    var SCa = window.wpSystemCore; if (!a || typeof a !== 'object' || !SCa || typeof SCa.cleanAffs !== 'function') return '';
    if (!(typeof a.vs === 'string' && a.vs.trim())) return 'Save drops it: it needs what it is resisted against.';
    if (!(draft.effects || []).some(function(d) { return d && d.id === a.fx; })) return 'Save drops it: it needs an effect it puts on.';
    var c = SCa.cleanAffs([a]); if (!c) return 'Save drops it: what it is resisted against cannot be worked out.';
    if (typeof a.needs === 'string' && a.needs.trim() && !c[0].needs) return 'Save drops when it applies: that cannot be worked out.';
    if (a.lasts && typeof a.lasts.n === 'string' && a.lasts.n.trim() && !c[0].lasts) return 'Save drops how long it lasts: it needs a figure that can be worked out and a unit.';
    if (it && typeof it === 'object' && a.who !== 'all' && !(typeof it.damage === 'string' && it.damage.trim())) return 'This item has no Damage, so it hurts no one, and an affliction that reaches those it hurts never lands. Give it Damage, or set it to reach everyone in the blast.';
    return '';
}
function affOfRow(t, it) {   // the affliction a control of the Items tab stands in, or null
    var ln = t && t.closest ? t.closest('.sys-item-aff') : null, ai = ln ? Number(ln.dataset.ai) : -1, A = it && it.area && Array.isArray(it.area.aff) ? it.area.aff : null;
    return A && ai >= 0 && ai < A.length && A[ai] && typeof A[ai] === 'object' ? { a: A[ai], ai: ai, ln: ln } : null;
}
// what Save does with one affliction said again under it. A control outside every affliction's line (1.6.3: the item's Damage, which an affliction
// that reaches those it hurts needs) says each affliction of the item's row again
function affSaysAt(t, it, a) {
    var box = t && t.closest ? t.closest('.sys-item-affs') : null, ln = t && t.closest ? t.closest('.sys-item-aff') : null;
    if (!ln) { var rw = t && t.closest ? t.closest('.sys-item-row') : null, A = it && it.area && Array.isArray(it.area.aff) ? it.area.aff : []; if (rw && rw.querySelectorAll) Array.prototype.forEach.call(rw.querySelectorAll('.sys-item-afferr'), function(x) { var y = A[+x.dataset.ai]; if (y && typeof y === 'object') x.textContent = affSays(y, it); }); return; }
    var er = box ? Array.prototype.filter.call(box.querySelectorAll('.sys-item-afferr'), function(x) { return x.dataset.ai === ln.dataset.ai; })[0] : null; if (er) er.textContent = affSays(a, it);
}
// Stage 6 F6: an item's changes to the character carrying it — a status effect's kind of change (a number, skill or formula up or down, a
// pool's max, a toggle switched on); per level once a list has levels, "only while switched on" once a list has a switch
function itemModsBox(it, anyL, anyO) {
    var box = el('div', 'sys-fx-mods sys-item-mods'), targets = fxTargets(draft, true);
    box.appendChild(el('span', 'sys-note', 'Changes to the character carrying it:'));
    (it.mods || []).forEach(function(m, mi) {
        var ln = el('div', 'sys-fx-mod sys-item-mod'); ln.dataset.mi = String(mi);
        var val = modVal(m), opts = targets.slice();
        if (!opts.some(function(o) { return o[0] === val; })) opts.unshift([val, '(a field that is gone or changed kind)']);
        ln.appendChild((typeof lazySelect === 'function' ? lazySelect : select)('sys-item-mtarget', opts, val, 'What this change affects', 'Find what it changes'));   // 1.6.3 (the review of the System editor speed): a long list becomes a search when pressed, as an effect's change list does
        if (val.slice(-4) === '|row') rowAimInto(ln, draft, m, 'sys-item-', mi);   // 1.5.8
        if (m.op !== 'on') { ln.appendChild(modHowSel('sys-item-mhow', m.op)); var am = numInput('sys-item-mamt', m.v, 'How much it adds (negative to take away), or the figure it holds the value at'); am.step = 'any'; ln.appendChild(am); var amIF = input('sys-item-mamtf field', typeof m.vf === 'string' ? m.vf : '', 'By a formula, in place of the number: worked out for each character carrying it, reading the character and this item\u2019s own row, such as its level. It reads the sheet with no change applied, and rolls no dice', 'By a formula'); amIF.maxLength = LIMITS.formula; if (typeof m.vf === 'string' && m.vf) am.disabled = true; ln.appendChild(amIF); /* 1.6.2 (205) */ if (anyL) { ln.appendChild(checkLabel('sys-item-mlvl', m.lvl === true, 'per level', 'Times the row\u2019s level (a trait at level 3: three times)')); ln.appendChild(input('sys-item-mtiers field', modTiersText(m.tiers), 'A figure for each level, such as 1: +2, 2: 0. Each holds from its level up, and below the first the amount beside it counts. It takes the place of per level. Blank: the same figure at every level', 'Figure by level (optional)')); } }
        ln.appendChild(btnRow([['itemmoddel', 'Remove this change', '&times;']]));
        box.appendChild(ln);
    });
    var add = el('button', 'tool ghost sys-btn', '+ Change'); add.dataset.act = 'itemmodadd'; add.title = 'Add a number to a field, or switch a toggle on, while a character carries it'; if (!targets.length) add.disabled = true; box.appendChild(add);
    if (anyO && ((it.mods || []).length || (it.rollSw || []).length)) box.appendChild(checkLabel('sys-item-modson', it.modsOn === true, 'Only while switched on', 'Its changes and its roll bonuses count only while its row is switched on (Readied, Equipped\u2026)'));
    return box;
}
// Stage 6 F4c1: an item's stat boxes — the stats of every list it can be on (its category among the list's, or a list with none), once per key
// ignoring case (the first list's, as Save spells it). A value stored under a key none of those lists has is drawn after, so it can be cleared
function itemStatDefs(it) {
    var out = [], seen = Object.create(null), cat = String((it && it.category) || '').trim().toLowerCase();
    (draft && Array.isArray(draft.fields) ? draft.fields : []).forEach(function(f) {
        if (!f || f.kind !== 'item-list') return;
        var sp = cleanListSpec(f.list, true, F()); if (!sp || !Array.isArray(sp.stats)) return;
        if (Array.isArray(sp.cats) && sp.cats.length && !sp.cats.some(function(x) { return String(x).toLowerCase() === cat; })) return;
        sp.stats.forEach(function(s) { var l = s.key.toLowerCase(); if (seen[l]) return; seen[l] = 1; out.push(s); });
    });
    return out;
}
function itemStatsBox(it, defs) {
    var have = it.stats && typeof it.stats === 'object' && !Array.isArray(it.stats) ? it.stats : {}, box = el('div', 'sys-flags sys-item-stats'), inScope = Object.create(null);
    var valOf = function(k) { var l = k.toLowerCase(), hk = Object.keys(have).filter(function(x) { return x.toLowerCase() === l; })[0]; return hk === undefined ? undefined : have[hk]; };
    defs.forEach(function(s) {
        inScope[s.key.toLowerCase()] = 1;
        var v = valOf(s.key), lb = el('label', 'sys-num'), ctl; lb.appendChild(el('span', 'sys-num-cap', s.label));
        if (s.kind === 'pick') {   // F5a2: a choice — a dropdown of its labels (blank: the default)
            var pv = typeof v === 'string' ? ((s.opts || []).filter(function(o) { return o.label.toLowerCase() === v.toLowerCase(); })[0] || {}).label || '' : '';
            ctl = select('sys-item-stat', [['', '\u2013' + (s.def ? ' (' + s.def + ')' : '')]].concat((s.opts || []).map(function(o) { return [o.label, o.label]; })), pv, s.label); ctl.dataset.pick = '1';
        } else if (s.set === true) {   // 1.6.0 O1: a set of places, a tick a place (its value names name them)
            ctl = el('span', 'sys-places'); var setV = typeof v === 'number' && isFinite(v) ? Math.floor(Math.abs(v)) & 0xFFFF : 0, setL = Array.isArray(s.labels) ? s.labels : [], setN = Math.max(1, Math.min(16, setL.length || 1));
            for (var pbi = 0; pbi < setN; pbi++) { var pbl = el('label', 'sys-hover'), pbc = el('input', 'sys-item-placebit'); pbc.type = 'checkbox'; pbc.checked = ((setV >> pbi) & 1) === 1; pbc.dataset.sk = s.key; pbc.dataset.bit = String(pbi); pbl.appendChild(pbc); pbl.appendChild(document.createTextNode(' ' + (setL[pbi] || 'Place ' + (pbi + 1)))); ctl.appendChild(pbl); }
            ctl.title = s.label + ': the places it takes. Two rows that share a place are never on together';
        } else if (Array.isArray(s.labels) && s.labels.length) {   // a stat with value names: a dropdown (a value past them stays, grayed)
            ctl = select('sys-item-stat', [['', '\u2013']].concat(s.labels.map(function(n, i) { return [String(i), n || String(i)]; })), typeof v === 'number' ? String(v) : '', s.label);
            if (typeof v === 'number' && !(v >= 0 && v < s.labels.length && Math.floor(v) === v)) { var xo = el('option', null, String(v)); xo.value = String(v); xo.selected = true; xo.disabled = true; ctl.appendChild(xo); }
        } else ctl = numInput('sys-item-stat', typeof v === 'number' ? v : '', s.label + ' (blank: ' + (typeof s.def === 'number' ? s.def : 0) + ')', 'any');
        ctl.dataset.sk = s.key; lb.appendChild(ctl); box.appendChild(lb);
    });
    Object.keys(have).forEach(function(k) {
        if (inScope[k.toLowerCase()] || !STAT_KEY.test(k) || (k in Object.prototype) || (k.toLowerCase() in Object.prototype)) return;
        var lb = el('label', 'sys-num sys-stat-off'); lb.appendChild(el('span', 'sys-num-cap', k + ' (not on its lists)'));
        var ni = numInput('sys-item-stat', typeof have[k] === 'number' ? have[k] : '', 'A value under a key no list it can be on has: clear it, or give it a category whose list has this stat (Save keeps it only while some list has it)', 'any'); ni.dataset.sk = k; lb.appendChild(ni); box.appendChild(lb);
    });
    return box.childNodes.length ? box : null;
}
// [split:body-end]
return { affOfRow: affOfRow, affSaysAt: affSaysAt, applyChangeOf: applyChangeOf, charRow: charRow, crewPick: crewPick, effectRow: effectRow, fxOfRow: fxOfRow, handFan: handFan, handShut: handShut, itemRow: itemRow, itemStatDefs: itemStatDefs, onSwChange: onSwChange, onSwClick: onSwClick, onSwInput: onSwInput, rollRow: rollRow, roundCells: roundCells, setChangeTarget: setChangeTarget, whyBox: whyBox, whyDraftAt: whyDraftAt, whyDropsAt: whyDropsAt };   // [split:glue]
}   // [split:glue]
