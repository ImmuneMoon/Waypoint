/* sysedrules.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 7, the System editor; split 2026-11-19 with no change in behavior).
   What it holds: the Combat tab's other boxes and the Lists tab's list rules: Keeps paying
   (upkeepBox), When a row is taken off, a switch's changes, arcs, terrain kinds, bodies, darkness, scenes, the map kinds and New maps
   start at, travel, postures, token bars, Who holds whom, Taking damage (damageBox and its rows), light, range with the checks and
   height (up to the [sinkcheck:heightbox2-end] line).
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sysedRules() at
   its line `// [split:sysedrules.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (tools/splitcheck.js holds it): the editor's own state (draft, dirty, tab, layoutView and
   the rest) stands in sheets.js and a part sets it through the setters beside `var draft`. Change the code here as if it still stood
   in sheets.js. */
// [split:of sheets.js]
import { CREW_NONE, DMG_LIM, F, HEIGHT_UNITS, LIGHT_UNITS, LIMITS, RANGE_UNITS, bandBox, cardBox, checkLabel, cleanDamageRules, cleanHeld, cleanOnRemove, crewPick, draft, el, entryNames, entryPick, errorCell, fieldWord, fxTargets, getActiveCampaign, grantEntries, input, labeledNum, labeledSelect, lineUnder, markDirty, numField, numInput, patchErrors, refreshErrors, renderAll, renderCombat, rolled, saveDraft, segPut, select, tab, toast, uid } from './sheets.js';   // [split:glue]
export function sysedRules() {   // [split:glue]
// [split:body-start]
// 1.6.0 (CORE gap 13, a power's "5, then 3 a turn"): Keeps paying, under a list's switch: a row switched on pays an amount, a formula of the
// row, from a pool of the sheet, at its character's turn start, each round of its fight, or every so often of its own game time; ticked, a
// row whose pool holds less switches off. The GM's machine pays it. Save cleans it (systemcore cleanUpkeep)
function upkeepBox(card, sp) {
    var up = sp.upkeep && typeof sp.upkeep === 'object' && !Array.isArray(sp.upkeep) ? sp.upkeep : null, rw = el('div', 'sys-flags sys-list-upkeep');
    rw.appendChild(checkLabel('sys-list-upon', !!up, 'Keeps paying', 'A row switched on keeps paying from a pool, such as 3 MP a turn for a power kept up. The GM\u2019s machine pays it. The first cost, if any, is the row\u2019s own roll or action'));
    if (up) {
        var sl = function(cls, os, cur, title) { var s = el('select', cls); os.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0] === cur) op.selected = true; s.appendChild(op); }); s.value = cur; s.title = title; return s; };   // values and text only
        var pools = (draft.fields || []).filter(function(f) { return f && f.kind === 'resource' && typeof f.id === 'string'; }).map(function(f) { return [f.id, f.label || f.key || f.id]; }), pc = typeof up.pool === 'string' ? up.pool : '';
        if (!pools.some(function(o) { return o[0] === pc; })) pools.unshift([pc, pc ? '(a pool that is gone)' : 'Pick a pool']);
        rw.appendChild(sl('sys-list-uppool', pools, pc, 'The pool it comes off, such as MP'));
        var am = input('sys-list-upamt field', typeof up.amt === 'string' ? up.amt : '', 'How much a row pays each time: a formula of the row, such as 3 or Row.keep. Row names are read. No dice. Whole, and 0 pays nothing', 'Pays (e.g. 3)'); am.maxLength = LIMITS.formula; rw.appendChild(am);
        var ea = up.each === 'round' || up.each === 'clock' ? up.each : 'turn';
        if (up.each === 'turnEnd') ea = 'turnEnd';   // 1.6.2
        rw.appendChild(sl('sys-list-upeach', [['turn', 'At its turn\u2019s start'], ['turnEnd', 'At its turn\u2019s end'], ['round', 'Each round'], ['clock', 'By the clock']], ea, 'When it pays: at its character\u2019s turn start in a fight, at each new round of its fight, or every so often of its character\u2019s own game time'));
        var chs = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.set !== true && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length > 0 : Array.isArray(s.labels) && s.labels.length > 0); }), ebc = typeof up.eachBy === 'string' ? up.eachBy : '';
        if (chs.length || ebc) { var ebo = [['', 'Every row pays so']].concat(chs.map(function(s) { return [s.key, 'Pays when its ' + (s.label || s.key) + ' says']; })); if (ebc && !chs.some(function(s) { return s.key === ebc; })) ebo.push([ebc, '(a choice stat that is gone)']); rw.appendChild(sl('sys-list-upby', ebo, ebc, 'A choice stat of the row may say when that row pays: a value such as Each turn, Each round or By the clock. A row whose value says none of them pays as set beside')); }   // the core handbook session's ask 5 (2026-10-29)
        if (ea === 'clock' || ebc) {
            var pn = el('input', 'field sys-list-upn'); pn.type = 'number'; pn.min = '1'; pn.max = '1000'; pn.step = '1'; pn.placeholder = 'Every'; pn.value = up.per && typeof up.per.n === 'number' ? String(up.per.n) : '1'; pn.title = 'It pays once every so many of the unit beside, 1 to 1000'; rw.appendChild(pn);
            var us = (draft.combat && draft.combat.turn && Array.isArray(draft.combat.turn.units) ? draft.combat.turn.units : []).filter(function(u) { return u && typeof u.key === 'string' && u.key; });
            var uo = [['min', 'minutes'], ['hour', 'hours'], ['day', 'days'], ['week', 'weeks']].concat(us.map(function(u) { return [u.key, typeof u.label === 'string' && u.label ? u.label : u.key]; })), uc = up.per && typeof up.per.u === 'string' && up.per.u ? up.per.u : 'min'; if (!uo.some(function(o) { return o[0] === uc; })) uo.push([uc, uc + ' (no such unit)']);
            rw.appendChild(sl('sys-list-upu', uo, uc, 'What it counts in: the calendar\u2019s minutes, hours, days and weeks, or one of your time units (the Combat tab\u2019s Turns box)'));
        }
        if (ea !== 'clock') {   // 1.6.2: every Nth time, and a rate by the clock while no fight runs (bleeding: every other round in a fight, a minute out of one)
            rw.appendChild(numField('sys-list-upevery', typeof up.every === 'number' ? up.every : 1, 'It pays once every so many of those, 1 to 9. 2 pays every other turn or round, counted from the first after the row comes on', 'Every', 1));
            var uoO = up.out && typeof up.out === 'object' ? up.out : null; rw.appendChild(sl('sys-list-upout', [['', 'Pays nothing out of a fight'], ['on', 'Out of a fight, by the clock']], uoO ? 'on' : '', 'Outside a fight it may pay by the clock instead, such as 1 HP a minute'));
            if (uoO) {
                var poN = el('input', 'field sys-list-upoutn'); poN.type = 'number'; poN.min = '1'; poN.max = '1000'; poN.step = '1'; poN.value = uoO.per && typeof uoO.per.n === 'number' ? String(uoO.per.n) : '1'; poN.title = 'Out of a fight it pays once every so many of the unit beside, 1 to 1000'; rw.appendChild(poN);
                var usO = (draft.combat && draft.combat.turn && Array.isArray(draft.combat.turn.units) ? draft.combat.turn.units : []).filter(function(u) { return u && typeof u.key === 'string' && u.key; });
                var uoL = [['min', 'minutes'], ['hour', 'hours'], ['day', 'days'], ['week', 'weeks']].concat(usO.map(function(u) { return [u.key, typeof u.label === 'string' && u.label ? u.label : u.key]; })), ucO = uoO.per && typeof uoO.per.u === 'string' && uoO.per.u ? uoO.per.u : 'min'; if (!uoL.some(function(o) { return o[0] === ucO; })) uoL.push([ucO, ucO + ' (no such unit)']);
                rw.appendChild(sl('sys-list-upoutu', uoL, ucO, 'What it counts in out of a fight'));
            }
        }
        var cts = (Array.isArray(sp.counters) ? sp.counters : []).filter(function(t) { return t && typeof t.key === 'string' && t.key; }), ctc = typeof up.ct === 'string' ? up.ct : '';
        if (cts.length || ctc) { var cto = [['', 'Counts no payment']].concat(cts.map(function(t) { return [t.key, 'Counts each payment on ' + (t.label || t.key)]; })); if (ctc && !cts.some(function(t) { return t.key === ctc; })) cto.push([ctc, '(a counter that is gone)']); rw.appendChild(sl('sys-list-upct', cto, ctc, 'Each payment adds 1 to this counter of the row. A list roll set to run when that counter crosses a step then follows every payment, such as a Focus roll whose failure switches the row off')); }   // 1.6.0 (CORE gap 13)
        rw.appendChild(checkLabel('sys-list-upstop', up.stop === true, 'Switches off when it cannot pay', 'A row whose pool holds less than it pays switches off and pays nothing. Unticked, it pays anyway, as far as the pool goes'));
    }
    card.appendChild(rw);
}
// [sinkcheck:onremovebox-start]
// 1.6.0: When a row is taken off, on a list's card: a line a change, a field to move, how, and a formula of the row, and one more empty line while
// there is room. A field picked makes the line, No change takes it away. Values and text only. Save cleans them (systemcore cleanOnRemove)
function onRemoveBox(card, sp) {
    var arr = Array.isArray(sp.onRemove) ? sp.onRemove : [], rw = el('div', 'sys-list-onrm');
    rw.appendChild(el('div', 'sys-light-head', 'When a row is taken off'));
    var sl = function(cls, os, cur, title, i) { var s = el('select', cls); os.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0] === cur) op.selected = true; s.appendChild(op); }); s.value = cur; s.title = title; s.dataset.oi = String(i); return s; };
    var tgts = (draft.fields || []).filter(function(f) { return f && typeof f.id === 'string' && (f.kind === 'resource' || f.kind === 'number' || f.kind === 'toggle'); }).map(function(f) { return [f.id, f.label || f.key || f.id]; });
    for (var i = 0; i < arr.length + 1 && i < LIMITS.onRemove; i++) {
        var c = arr[i] && typeof arr[i] === 'object' ? arr[i] : null, cf = c && typeof c.f === 'string' ? c.f : '', ln = el('div', 'sys-flags');
        var os = [['', 'No change']].concat(tgts); if (cf && !tgts.some(function(o) { return o[0] === cf; })) os.push([cf, '(a field that is gone)']);
        ln.appendChild(sl('sys-list-ormf', os, cf, 'The field this moves when a row leaves the list for good. A switch-off moves nothing', i));
        if (c) {
            ln.appendChild(sl('sys-list-ormh', [['add', 'Add'], ['sub', 'Subtract'], ['set', 'Set to']], c.set === true ? 'set' : c.add === true ? 'add' : 'sub', 'What the figure does to the field', i));
            var am = input('sys-list-ormamt field', typeof c.formula === 'string' ? c.formula : '', 'A formula of the row, read before it goes, such as Row.xp. No dice. Each line reads the sheet as the line before left it, so a field may be named twice', 'The figure (e.g. Row.xp)'); am.maxLength = LIMITS.formula; am.dataset.oi = String(i); ln.appendChild(am);
        }
        rw.appendChild(ln);
    }
    card.appendChild(rw);
}
function onRemoveChange(lsc, t, c) {
    var i = +t.dataset.oi, arr = Array.isArray(lsc.onRemove) ? lsc.onRemove : (lsc.onRemove = []);
    if (c.indexOf('sys-list-ormf') >= 0) { if (t.value) { if (arr[i] && typeof arr[i] === 'object') arr[i].f = String(t.value).slice(0, 64); else arr.push({ f: String(t.value).slice(0, 64), formula: '', add: true }); } else arr.splice(i, 1); }
    else if (c.indexOf('sys-list-ormh') >= 0 && arr[i] && typeof arr[i] === 'object') { delete arr[i].add; delete arr[i].set; if (t.value === 'add') arr[i].add = true; else if (t.value === 'set') arr[i].set = true; }
    if (!arr.length) delete lsc.onRemove;
}
// What Save does with each line, as the cleaner reads it
function onRemoveSays(sp, fields, Fe) {
    var arr = Array.isArray(sp.onRemove) ? sp.onRemove : [], out = [], ok = { resource: 1, number: 1, toggle: 1 }; if (!arr.length || typeof cleanOnRemove !== 'function') return out;
    arr.forEach(function(c, i) {
        var f = c && typeof c === 'object' ? (fields || []).filter(function(x) { return x && x.id === c.f; })[0] : null, n = 'When a row is taken off, line ' + (i + 1) + ': ';
        if (i >= LIMITS.onRemove) out.push(n + 'a list keeps ' + LIMITS.onRemove + ' lines. Save drops the rest.');
        else if (!f || ok[f.kind] !== 1) out.push(n + 'it names no pool, number or toggle. Save drops it.');
        else if (!cleanOnRemove([c], Fe)) out.push(n + 'its figure does not read as a formula with no dice. Save drops it.');
    });
    return out;
}
// What Save does with a GM-only stat, as the cleaner reads it: { errs, warns } of lines
function gmStatSays(f, fields) {
    var errs = [], warns = [], sts = f && f.list && Array.isArray(f.list.stats) ? f.list.stats : [], low = function(k) { return String(k).toLowerCase(); };
    sts.forEach(function(s) {
        if (!s || typeof s !== 'object' || s.vis !== 'gm') return; var k = typeof s.key === 'string' ? s.key : '';
        if (s.split === true) errs.push('Stat \u201c' + k + '\u201d: GM only keeps it out of trades, so Save drops Split in trades.');
        (fields || []).forEach(function(x) { if (!x || x === f || !x.list || !Array.isArray(x.list.stats)) return; if (x.list.stats.some(function(t) { return t && typeof t === 'object' && t.vis !== 'gm' && typeof t.key === 'string' && low(t.key) === low(k); })) warns.push('Stat \u201c' + k + '\u201d is GM only here, so players get it on no list, ' + (x.label || x.key || 'that list') + ' among them.'); });
    });
    // what the players' view loses because it names such a stat of any list: the GM keeps it, and a player's copy of the system does not have it
    var gk = {}; (fields || []).forEach(function(x) { if (x && x.list && Array.isArray(x.list.stats)) x.list.stats.forEach(function(s) { if (s && typeof s === 'object' && s.vis === 'gm' && typeof s.key === 'string') gk[low(s.key)] = s.key; }); });
    if (!Object.keys(gk).length || !f || !f.list) return { errs: errs, warns: warns };
    var sp = f.list, obj = function(o) { return o && typeof o === 'object' ? o : {}; }, seen = {}, says = function(what, k) { var n = gk[low(k)]; if (typeof k !== 'string' || !Object.prototype.hasOwnProperty.call(gk, low(k)) || seen[what + '|' + n]) return; seen[what + '|' + n] = 1; warns.push(what + ' names \u201c' + n + '\u201d, a GM only stat, so players do not get it on this list.'); };
    [['Price', sp.price], ['Places split by', sp.placeBy], ['Sets by', sp.sets], ['Money', sp.money], ['One at a time', obj(sp.on).per], ['Where rows meet', obj(sp.on).over], ['Rows carry a look', obj(sp.look).by], ['Stands at a row of', obj(sp.at).by]].forEach(function(p) { says(p[0], p[1]); });
    ['by', 'rank', 'cost', 'free'].forEach(function(k) { says('Counted once', obj(sp.once)[k]); }); ['of', 'by', 'fall', 'dflt', 'cover', 'apart'].forEach(function(k) { says('Specialties', obj(sp.specs)[k]); });
    ['by', 'to'].forEach(function(k) { says('Loads from', obj(sp.load)[k]); says('Chambers from', obj(sp.chamber)[k]); }); says('Chambers from', obj(sp.chamber).capBy);
    (Array.isArray(sp.feeds) ? sp.feeds : []).forEach(function(d) { says('A feed', obj(d).by); says('A feed', obj(d).to); });
    says('Parts', obj(sp.parts).capBy); (Array.isArray(obj(sp.parts).caps) ? sp.parts.caps : []).forEach(function(c) { says('Holds by kind', obj(c).by); says('Holds by kind', obj(c).slot); });
    (Array.isArray(sp.cols) ? sp.cols : []).forEach(function(c) { (Array.isArray(obj(c).plus) ? c.plus : []).forEach(function(k) { says('With stats', k); }); });
    var skip = { stats: 1, label: 1, name: 1, tip: 1, needsText: 1, fumbleAt: 1, critAt: 1, malf: 1, offLabel: 1, category: 1 }, reads = function(t) { (String(t).match(/\b(?:row|host)(?:\.[a-z_][a-z0-9_]*)+/gi) || []).forEach(function(n) { n.split('.').slice(1).forEach(function(k) { if (Object.prototype.hasOwnProperty.call(gk, low(k))) says('A formula', k); }); }); }, walk = function(o, d) { if (d > 8) return; if (typeof o === 'string') { reads(o); return; } if (Array.isArray(o)) { o.forEach(function(x) { walk(x, d + 1); }); return; } if (o && typeof o === 'object') Object.keys(o).forEach(function(k) { if (skip[k] !== 1) walk(o[k], d + 1); }); };
    walk(sp, 0);
    return { errs: errs, warns: warns };
}
// [sinkcheck:onremovebox-end]
// [systemcheck:switchchanges-start]
// 1.6.2 (167 B; the owner, by prompt: "On and off, and from a file too"): When switched on and When switched off, on a list with a switch: a line
// a change as On removal's (a field, how, a formula of the row), one more empty line while there is room. Values and text only. Save cleans
// them (systemcore cleanOnRemove), and the host runs them as a row's switch turns (switchRun)
var SW_WORDS = { switchOn: ['When a row is switched on', 'The field this moves when a row of this list is switched on, by anyone in play or by a character file. Nothing runs while a character is being made'], switchOff: ['When a row is switched off', 'The field this moves when a row of this list is switched off, by anyone in play, by One at a time or by a character file. Nothing runs while a character is being made'] };
function switchChangesBox(card, sp, key) {
    var arr = Array.isArray(sp[key]) ? sp[key] : [], rw = el('div', 'sys-list-swc'), wd = SW_WORDS[key]; if (!wd) return;
    rw.appendChild(el('div', 'sys-light-head', wd[0]));
    var sl = function(cls, os, cur, title, i) { var s = el('select', cls); os.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0] === cur) op.selected = true; s.appendChild(op); }); s.value = cur; s.title = title; s.dataset.oi = String(i); s.dataset.sw = key; return s; };
    var tgts = (draft.fields || []).filter(function(f) { return f && typeof f.id === 'string' && (f.kind === 'resource' || f.kind === 'number' || f.kind === 'toggle'); }).map(function(f) { return [f.id, f.label || f.key || f.id]; });
    for (var i = 0; i < arr.length + 1 && i < LIMITS.onRemove; i++) {
        var c = arr[i] && typeof arr[i] === 'object' ? arr[i] : null, cf = c && typeof c.f === 'string' ? c.f : '', ln = el('div', 'sys-flags');
        var os = [['', 'No change']].concat(tgts); if (cf && !tgts.some(function(o) { return o[0] === cf; })) os.push([cf, '(a field that is gone)']);
        ln.appendChild(sl('sys-list-swcf', os, cf, wd[1], i));
        if (c) {
            ln.appendChild(sl('sys-list-swch', [['add', 'Add'], ['sub', 'Subtract'], ['set', 'Set to']], c.set === true ? 'set' : c.add === true ? 'add' : 'sub', 'What the figure does to the field', i));
            var am = input('sys-list-swcamt field', typeof c.formula === 'string' ? c.formula : '', 'A formula of the row, such as Row.qty. No dice. Each line reads the sheet as the line before left it, so a field may be named twice', 'The figure (e.g. 1)'); am.maxLength = LIMITS.formula; am.dataset.oi = String(i); am.dataset.sw = key; ln.appendChild(am);
        }
        rw.appendChild(ln);
    }
    card.appendChild(rw);
}
function switchChangesChange(lsc, t, c) {
    var key = t.dataset.sw === 'switchOff' ? 'switchOff' : 'switchOn', i = +t.dataset.oi, arr = Array.isArray(lsc[key]) ? lsc[key] : (lsc[key] = []);
    if (c.indexOf('sys-list-swcf') >= 0) { if (t.value) { if (arr[i] && typeof arr[i] === 'object') arr[i].f = String(t.value).slice(0, 64); else arr.push({ f: String(t.value).slice(0, 64), formula: '', add: true }); } else arr.splice(i, 1); }
    else if (c.indexOf('sys-list-swch') >= 0 && arr[i] && typeof arr[i] === 'object') { delete arr[i].add; delete arr[i].set; if (t.value === 'add') arr[i].add = true; else if (t.value === 'set') arr[i].set = true; }
    if (!arr.length) delete lsc[key];
}
// What Save does with each line, as the cleaner reads it
function switchChangesSays(sp, fields, Fe) {
    var out = [], ok = { resource: 1, number: 1, toggle: 1 }; if (typeof cleanOnRemove !== 'function') return out;
    ['switchOn', 'switchOff'].forEach(function(key) {
        var arr = Array.isArray(sp[key]) ? sp[key] : []; if (!arr.length) return;
        if (!sp.on || typeof sp.on !== 'object') { out.push(SW_WORDS[key][0] + ': the list has no switch. Save drops these lines.'); return; }
        arr.forEach(function(c, i) {
            var f = c && typeof c === 'object' ? (fields || []).filter(function(x) { return x && x.id === c.f; })[0] : null, n = SW_WORDS[key][0] + ', line ' + (i + 1) + ': ';
            if (i >= LIMITS.onRemove) out.push(n + 'a list keeps ' + LIMITS.onRemove + ' lines. Save drops the rest.');
            else if (!f || ok[f.kind] !== 1) out.push(n + 'it names no pool, number or toggle. Save drops it.');
            else if (!cleanOnRemove([c], Fe)) out.push(n + 'its figure does not read as a formula with no dice. Save drops it.');
        });
    });
    return out;
}
// [systemcheck:switchchanges-end]
function upkeepChange(lsc, t, c) {
    if (c.indexOf('sys-list-upon') >= 0) { if (t.checked) { var p0 = (draft.fields || []).filter(function(f) { return f && f.kind === 'resource' && typeof f.id === 'string'; })[0]; lsc.upkeep = { pool: p0 ? p0.id : '', amt: '1', each: 'turn' }; } else delete lsc.upkeep; return; }
    var up = lsc.upkeep && typeof lsc.upkeep === 'object' && !Array.isArray(lsc.upkeep) ? lsc.upkeep : null; if (!up) return;
    if (c.indexOf('sys-list-uppool') >= 0) up.pool = String(t.value).slice(0, 64);
    else if (c.indexOf('sys-list-upeach') >= 0) { up.each = t.value === 'round' || t.value === 'clock' || t.value === 'turnEnd' ? t.value : 'turn'; if (up.each === 'clock') { up.per = up.per && typeof up.per === 'object' ? up.per : { n: 1, u: 'min' }; delete up.every; delete up.out; } else if (!up.eachBy) delete up.per; }
    else if (c.indexOf('sys-list-upevery') >= 0) { var evN = Math.round(Number(t.value)); if (isFinite(evN) && evN >= 2) up.every = Math.min(9, evN); else delete up.every; }   // 1.6.2
    else if (c.indexOf('sys-list-upoutn') >= 0) { if (up.out && typeof up.out === 'object') { var oN = Math.round(Number(t.value)); up.out.per = Object.assign({ u: 'min' }, up.out.per, { n: isFinite(oN) && oN >= 1 ? Math.min(1000, oN) : 1 }); } }
    else if (c.indexOf('sys-list-upoutu') >= 0) { if (up.out && typeof up.out === 'object') up.out.per = Object.assign({ n: 1 }, up.out.per, { u: String(t.value).slice(0, 24) }); }
    else if (c.indexOf('sys-list-upout') >= 0) { if (t.value) up.out = { per: { n: 1, u: 'min' } }; else delete up.out; }
    else if (c.indexOf('sys-list-upby') >= 0) { if (t.value) { up.eachBy = String(t.value).slice(0, 64); if (!up.per || typeof up.per !== 'object') up.per = { n: 1, u: 'min' }; } else { delete up.eachBy; if (up.each !== 'clock') delete up.per; } }   // the core handbook session's ask 5
    else if (c.indexOf('sys-list-upu') >= 0) up.per = Object.assign({ n: 1 }, up.per, { u: String(t.value).slice(0, 24) });
    else if (c.indexOf('sys-list-upstop') >= 0) { if (t.checked) up.stop = true; else delete up.stop; }
    else if (c.indexOf('sys-list-upct') >= 0) { if (t.value) up.ct = String(t.value).slice(0, 24); else delete up.ct; }
}
// Conditions C3 (docs/CONDITIONS_PLAN.md): the system's own postures on the Combat tab — how a token can stand, in order. None: posture is
// switched off (1.6.0, backlog 183 (3)). Add postures starts a list of Standing and one more. Each row a name, its chip's tag, a ranged note
// (a whole number a foe's ranged roll takes, shown only: "A ranged note per posture (Recommended)"), notes and changes as an effect's; the first
// is how a token stands with none set and takes neither. Every text lands as a value or a text node. Save cleans them; refreshErrors says what it would drop
// [sinkcheck:posturebox-start]
function postureDraft() { var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); return Array.isArray(cm.postures) ? cm.postures : (cm.postures = []); }
// 1.6.2 (vehicles, fold (b), rebuilt; the owner, by prompt: "Yes, rebuild arcs"): the Combat tab's Arcs, the system's own, each a name and a range of
// whole degrees from a token's facing, clockwise, or all round; they may overlap. Its own listeners, so no handler of the tab reads them. A
// new arc's short name follows its name until the editor is closed, and stays after, so a formula that reads it keeps it
function arcsBox(box, cm) {
    var wrap = el('div', 'sys-holds sys-arcsbox'), list = Array.isArray(cm.arcs) ? cm.arcs : null, SCa = window.wpSystemCore || {}, max = SCa.ARC_MAX || 32, ch = function(re) { markDirty(); if (re) renderCombat(); if (typeof patchErrors === 'function') patchErrors(); };
    var keyFor = function(a, lb) { var k = (typeof SCa.arcKey === 'function' ? SCa.arcKey(lb) : '') || (String(lb || '').trim() ? 'Arc' : ''), base = k, n = 2; while (k && (list || []).some(function(b) { return b !== a && b && typeof b.key === 'string' && b.key.toLowerCase() === k.toLowerCase(); })) k = base + (n++); return k; };   // 1.6.3: a name in another script still gets a short name, Arc and a number, as the cleaner makes one
    wrap.appendChild(el('div', 'sys-light-head', 'Arcs'));
    wrap.appendChild(el('div', 'sys-note', 'Each covers the bearings from its From to its To, clockwise from straight ahead: 0 is ahead, 90 the right, 180 behind and -90 the left. Arcs may overlap. With none named, a token reads the front, side and rear its grid gives.'));
    (list || []).forEach(function(a, i) {
        var rw = el('div', 'sys-flags sys-arcrow'), nm = input('sys-arc-label field', a.label || '', 'Its name, such as Front or Turret', 'Front'), says = el('span', 'sys-note sys-arc-says'), say = function() { says.textContent = arcSays(a); };
        nm.maxLength = LIMITS.label;
        nm.addEventListener('input', function() { a.label = nm.value.slice(0, LIMITS.label); if (a._new || !a.key) a.key = keyFor(a, a.label); say(); ch(); });
        rw.appendChild(nm);
        [['sys-arc-f', 'From', 'f', 'Where the arc begins, in degrees from straight ahead'], ['sys-arc-t', 'To', 't', 'Where the arc ends, clockwise from where it begins']].forEach(function(p) {
            var w = el('label', 'sys-check'), ip = el('input', 'field sys-num ' + p[0]); ip.type = 'number'; ip.min = '-180'; ip.max = '180'; ip.step = '1'; if (typeof a[p[2]] === 'number') ip.value = String(a[p[2]]); ip.disabled = a.all === true;
            ip.addEventListener('input', function() { var v = ip.value === '' ? NaN : Number(ip.value); if (isFinite(v)) a[p[2]] = Math.max(-180, Math.min(180, Math.round(v))); else delete a[p[2]]; say(); ch(); });
            w.appendChild(document.createTextNode(p[1] + ' ')); w.appendChild(ip); w.title = p[3]; rw.appendChild(w);
        });
        var al = checkLabel('sys-arc-all', a.all === true, 'All round', 'It holds every bearing, as a turret does'), alI = al.querySelector('input');
        if (alI) alI.addEventListener('change', function() { if (alI.checked) a.all = true; else delete a.all; ch(true); });
        rw.appendChild(al);
        var rm = el('button', 'tool ghost sys-btn sys-arc-rm', '×'); rm.type = 'button'; rm.title = 'Remove this arc'; rm.addEventListener('click', function() { list.splice(i, 1); if (!list.length) delete cm.arcs; ch(true); }); rw.appendChild(rm);
        rw.appendChild(says); say();
        wrap.appendChild(rw);
    });
    var add = el('button', 'tool ghost sys-btn sys-arc-add', '+ Arc'); add.type = 'button'; add.disabled = !!list && list.length >= max; add.title = 'An arc a hit can come from or a gun can fire into';
    // 1.6.3 (Fulllion's rulings of 2026-11-20): a new arc starts named, ahead from -60 to 60, so a system saved at once keeps it; its name is ready to type over
    add.addEventListener('click', function() { if (!Array.isArray(cm.arcs)) cm.arcs = []; list = cm.arcs; if (list.length >= max) return; var nw = { label: ROW_NEW.arc, f: -60, t: 60, _new: true }; nw.key = keyFor(nw, nw.label); list.push(nw); ch(true); rowNewFocus('.sys-arc-label'); });
    var bar = el('div', 'sys-flags'); bar.appendChild(add); wrap.appendChild(bar);
    box.appendChild(wrap);
}
// 1.6.3 (lane B, the Combat tab; Fulllion's rulings of 2026-11-20: "if there's other gaps where a ruling or field is dependent on another, and the system
// doesn't require that other field to be filled then that should be fixed", and "none isn't a good default substitution"): the name a new row of the
// Combat tab's own lists starts with, and the line each row says under it while Save would drop it. What a row reads (its arc, its cell, its speed, its
// penalty) depends on its name: the cleaner keeps no row without one. A new row's short name is made from this name and follows it while it is new
var ROW_NEW = { arc: 'New arc', kind: 'New map kind', factor: 'New factor', travel: 'New travel mode', dark: 'New step', scene: 'New channel' };
function rowNewFocus(cls) { if (typeof setTimeout !== 'function') return; setTimeout(function() { var nb = typeof document !== 'undefined' && document.querySelectorAll ? document.querySelectorAll('#systemModal ' + cls) : []; var b = nb.length ? nb[nb.length - 1] : null; if (b && b.focus) { b.focus(); if (b.select) b.select(); } }, 0); }   // the new row's name takes the focus, selected, so typing replaces it
function arcSays(a) {   // what Save does with an arc of the draft: '' where it keeps it
    if (!String(a && a.label || '').trim()) return 'Needs a name, or Save drops it.';
    if (a.all !== true && !(typeof a.f === 'number' && isFinite(a.f) && typeof a.t === 'number' && isFinite(a.t))) return 'From and To are needed, or tick All round, or Save drops it.';
    return '';
}
// 1.6.2 (backlog 57): Save settles the campaign's maps where the kinds changed (fogcore terrainSettle): a piece of a kind takes the kind's cost as its
// own stored cost, and a piece whose kind is gone keeps the cost that kind last had and names none. Answers the ids of the maps that changed, which
// saveDraft sends to the table after the system
function terrainSettleAll(camp, prevSys, nextSys) {
    var S = window.wpSystemCore, C = window.wpFogCore, ids = []; if (!S || !S.terrainCosts || !C || !C.terrainSettle || !camp || !camp.items || typeof camp.items !== 'object') return ids;
    var pk = S.terrainCosts(prevSys), nk = S.terrainCosts(nextSys); if (JSON.stringify(pk) === JSON.stringify(nk)) return ids;
    Object.keys(camp.items).forEach(function(id) { var it = camp.items[id]; if (it && it.type === 'map' && Array.isArray(it.whiteboard) && C.terrainSettle(it.whiteboard, pk, nk) > 0) ids.push(id); });
    return ids;
}
// 1.6.2 (backlog 57; the owner, 2026-11-11, by prompt: "Both"): the Combat tab's Terrain, the system's own kinds of difficult ground, each a name and
// what moving into it costs (2 to 10). Its own listeners, so no handler of the tab reads them. A new kind's short name follows its name until the
// editor is closed, and stays after, so the pieces that name it keep it through a rename. A row with no name says that Save drops it
// 1.6.2 (backlog 42, fold 3): the Combat tab's Bodies topic. Can be looted where: a test of an NPC's own names, read on the host, that makes a
// fallen NPC searchable with no tick of the GM's; a form, never typed code
function bodiesBox(box, cm) {
    var wrap = el('div', 'sys-holds sys-lootbox'), lt = cm.loot && typeof cm.loot === 'object' ? cm.loot : null;
    wrap.appendChild(el('div', 'sys-light-head', 'Bodies'));
    wrap.appendChild(el('div', 'sys-note', 'A fallen NPC can be searched like a container. You tick Can be looted on its token or under Characters, or set a test here. A player next to it takes what its lists ticked Tradable hold. Name a Pickpocket roll and a player next to any other NPC may try to pick its pocket. A success shows one row at random.'));
    var rw = el('div', 'sys-flags'), ip = input('sys-loot-if field', lt && typeof lt['if'] === 'string' ? lt['if'] : '', 'When an NPC can be searched, read on its own sheet', '');
    ip.addEventListener('input', function(e) { e.stopPropagation(); var v = String(ip.value || '').slice(0, LIMITS.formula); if (v.trim()) cm.loot = { 'if': v }; else delete cm.loot; markDirty(); if (typeof patchErrors === 'function') patchErrors(); });
    rw.appendChild(ip); wrap.appendChild(rw);
    var srw = el('div', 'sys-flags'), sl = el('select', 'sys-steal-roll'), none = el('option', null, 'No pickpocketing'); none.value = ''; sl.appendChild(none); sl.title = 'The roll a player makes to pick an NPC\u2019s pocket. A success shows them one row at random. Its own Resisted by is the NPC\u2019s roll';
    (Array.isArray(draft && draft.rolls) ? draft.rolls : []).forEach(function(r) { if (!r || typeof r.id !== 'string') return; var o = el('option', null, r.label || 'A roll'); o.value = r.id; if (cm.steal === r.id) o.selected = true; sl.appendChild(o); });
    sl.addEventListener('change', function(e) { e.stopPropagation(); if (sl.value) cm.steal = sl.value; else delete cm.steal; markDirty(); });
    srw.appendChild(el('span', 'sys-note', 'Pickpocket roll')); srw.appendChild(sl); wrap.appendChild(srw);
    if (typeof errorCell === 'function') { var err = errorCell('bodies'); err.dataset.errFor = 'bodies'; wrap.appendChild(err); } box.appendChild(wrap);
}
function terrainBox(box, cm) {
    var wrap = el('div', 'sys-holds sys-tkindbox'), list = Array.isArray(cm.terrain) ? cm.terrain : null, SCt = window.wpSystemCore || {}, max = SCt.TERRAIN_MAX || 48, ch = function(re) { markDirty(); if (re) renderCombat(); if (typeof patchErrors === 'function') patchErrors(); };
    var keyFor = function(a, lb) { var k = (typeof SCt.arcKey === 'function' ? SCt.arcKey(lb) : '') || (String(lb || '').trim() ? 'Kind' : ''), base = k, n = 2; while (k && (list || []).some(function(b) { return b !== a && b && typeof b.key === 'string' && b.key.toLowerCase() === k.toLowerCase(); })) k = base + (n++); return k; };   // a name in another script still gets a short name
    wrap.appendChild(el('div', 'sys-light-head', 'Kinds of terrain'));
    wrap.appendChild(el('div', 'sys-note', 'Name the ground that slows movement in your game, such as Mud or Rubble, and what moving into each costs. The Fill menu and a shape\u2019s Properties then offer them by name. Change a cost here and every piece of that kind follows.'));
    (list || []).forEach(function(a, i) {
        var rw = el('div', 'sys-flags sys-arcrow sys-tkindrow'), nm = input('sys-tkind-label field', a.label || '', 'Its name, such as Mud or Rubble', 'Mud'), says = el('span', 'sys-note sys-tkind-says');
        var say = function() { says.textContent = String(a.label || '').trim() ? '' : 'Needs a name, or Save drops it.'; };
        nm.maxLength = LIMITS.label;
        nm.addEventListener('input', function() { a.label = nm.value.slice(0, LIMITS.label); if (a._new || !a.key) a.key = keyFor(a, a.label); say(); ch(); });
        rw.appendChild(nm);
        var w = el('label', 'sys-check'), ip = el('input', 'field sys-num sys-tkind-cost'); ip.type = 'number'; ip.min = '2'; ip.max = '10'; ip.step = '1'; ip.value = String(typeof a.cost === 'number' && isFinite(a.cost) ? a.cost : 2);
        ip.addEventListener('change', function() { var v = Math.round(Number(ip.value)); a.cost = isFinite(v) ? Math.max(2, Math.min(10, v)) : 2; ip.value = String(a.cost); ch(); });
        w.appendChild(document.createTextNode('Costs \u00d7 ')); w.appendChild(ip); w.title = 'What moving into it costs: this many times as much, 2 to 10'; rw.appendChild(w);
        var rm = el('button', 'tool ghost sys-btn sys-tkind-rm', '\u00d7'); rm.type = 'button'; rm.title = 'Remove this kind. Pieces that name it keep the cost they had'; rm.addEventListener('click', function() { list.splice(i, 1); if (!list.length) delete cm.terrain; ch(true); }); rw.appendChild(rm);
        rw.appendChild(says); say();
        wrap.appendChild(rw);
    });
    var add = el('button', 'tool ghost sys-btn sys-tkind-add', '+ Kind of terrain'); add.type = 'button'; add.disabled = !!list && list.length >= max; add.title = 'A kind of ground that costs more to move into, picked by name in the Fill menu and in a shape\u2019s Properties';
    add.addEventListener('click', function() { if (!Array.isArray(cm.terrain)) cm.terrain = []; list = cm.terrain; if (list.length >= max) return; list.push({ label: '', cost: 2, _new: true }); ch(true); });
    var bar = el('div', 'sys-flags'); bar.appendChild(add); wrap.appendChild(bar);
    box.appendChild(wrap);
}
// 1.6.2 (vehicles, fold (g); the owner: "a toggle that switches any map to a vehicle map", and the core's answers G1 and G2): the system's map kinds,
// each a name, the cell a map of that kind starts at, and the factors formulas read on it. Their own listeners, so no handler of the tab reads them. A
// new kind's or factor's short name follows its name until the editor is closed, and stays after
var MAPKIND_UNITS = [['yd', 'yards'], ['ft', 'feet'], ['m', 'meters'], ['km', 'kilometers'], ['mi', 'miles']];
// 1.6.2 (the owner, by prompt: "The scene carries it"): the channels a scene may be in, each a name whose short name is made once from it
// 1.6.2 (the CORE session's answer 7): darkness steps past lit, each a name and its penalty, lightest first
function darkBox(box) {
    var wrap = el('div', 'sys-holds sys-dark'), list = Array.isArray(draft.dark) ? draft.dark : null, SCk = window.wpSystemCore || {}, max = SCk.DARK_MAX || 8, ch = function(re) { markDirty(); if (re) renderCombat(); if (typeof patchErrors === 'function') patchErrors(); };
    var keyFor = function(a, lb) { return rowKeyFor(list, a, lb, 'Step'); };
    wrap.appendChild(el('div', 'sys-light-head', 'Darkness steps'));
    wrap.appendChild(el('div', 'sys-note', 'Steps of darkness past lit, lightest first, each with its penalty. You set a map’s step from its right-click menu, and a shape can set its own. A cell a light lights is lit. A roll reads the target’s step as TargetDarkPen.'));
    (list || []).forEach(function(s, i) {
        var rw = el('div', 'sys-flags sys-arcrow'), nm = input('sys-dark-label field', s.label || '', 'Its name, such as A moonless night', 'Dark'), says = el('span', 'sys-note sys-dark-says'), say = function() { says.textContent = rowNameSays(s, 'Save drops it, and every step after it moves up one place.'); };
        nm.maxLength = LIMITS.label;
        nm.addEventListener('input', function() { s.label = nm.value.slice(0, LIMITS.label); if (s._new || !s.key) s.key = keyFor(s, s.label); say(); ch(); }); rw.appendChild(nm);
        var pn = el('input', 'field sys-num sys-dark-pen'); pn.type = 'number'; pn.step = '1'; pn.value = typeof s.pen === 'number' ? String(s.pen) : '0'; pn.title = 'Its penalty, such as -2'; pn.addEventListener('input', function() { var v = Number(pn.value); s.pen = isFinite(v) ? Math.round(v) : 0; ch(); }); rw.appendChild(pn);
        var rm = el('button', 'tool ghost sys-btn sys-dark-rm', '×'); rm.type = 'button'; rm.title = 'Remove this step'; rm.addEventListener('click', function() { list.splice(i, 1); if (!list.length) delete draft.dark; ch(true); }); rw.appendChild(rm);
        rw.appendChild(says); say();
        wrap.appendChild(rw);
    });
    var add = el('button', 'tool ghost sys-btn sys-dark-add', '+ Step'); add.type = 'button'; add.disabled = !!list && list.length >= max; add.title = 'A step of darkness, darker than the one before';
    add.addEventListener('click', function() { if (!Array.isArray(draft.dark)) draft.dark = []; list = draft.dark; if (list.length >= max) return; var nw = { label: ROW_NEW.dark, pen: 0, _new: true }; nw.key = keyFor(nw, nw.label); list.push(nw); ch(true); rowNewFocus('.sys-dark-label'); });   // 1.6.3: a new step starts named
    var bar = el('div', 'sys-flags'); bar.appendChild(add); wrap.appendChild(bar);
    box.appendChild(wrap);
}
// 1.6.3 (lane B): the short name a row of the Combat tab's darkness steps, scene channels, map kinds, their factors and travel modes is made from its name.
// It always gives one the cleaner keeps (a letter, then letters, digits or _, 24 at most): a name in another script, or one that begins with a digit, gets
// the word handed in (Step, Channel, Kind, Factor, Mode), and one taken by another row of the same list takes the first free number, cut to fit
function rowKeyFor(arr, a, lb, word) {
    var SCk = window.wpSystemCore || {}, k0 = (typeof SCk.arcKey === 'function' ? SCk.arcKey(lb) : '') || (String(lb || '').trim() ? word : ''), k = k0.slice(0, 24), base = k0.slice(0, 22), n = 2;
    while (k && (arr || []).some(function(b) { return b !== a && b && typeof b.key === 'string' && b.key.toLowerCase() === k.toLowerCase(); })) k = base + (n++);
    return k;
}
// The line a row of those lists says while it has no name, which Save would drop it for: '' once it has one
function rowNameSays(r, what) { return String(r && r.label || '').trim() ? '' : 'Needs a name, or ' + (what || 'Save drops it.'); }
function scenesBox(box) {
    var wrap = el('div', 'sys-holds sys-scenes'), list = Array.isArray(draft.scenes) ? draft.scenes : null, SCk = window.wpSystemCore || {}, max = SCk.SCENE_MAX || 8, ch = function(re) { markDirty(); if (re) renderCombat(); if (typeof patchErrors === 'function') patchErrors(); };
    var keyFor = function(a, lb) { return rowKeyFor(list, a, lb, 'Channel'); };
    wrap.appendChild(el('div', 'sys-light-head', 'Scene channels'));
    wrap.appendChild(el('div', 'sys-note', 'How a scene reaches the one listening, such as In person, Seen, Heard or Written. You pick it from a map’s right-click menu, and a roll reads it. A roll ticked Kept for the scene keeps what it came to on the one it was rolled at, for later rolls.'));
    (list || []).forEach(function(s, i) {
        var rw = el('div', 'sys-flags sys-arcrow'), nm = input('sys-scene-label field', s.label || '', 'Its name, such as In person', 'In person'), says = el('span', 'sys-note sys-scene-says'), say = function() { says.textContent = rowNameSays(s); };
        nm.maxLength = LIMITS.label;
        nm.addEventListener('input', function() { s.label = nm.value.slice(0, LIMITS.label); if (s._new || !s.key) s.key = keyFor(s, s.label); say(); ch(); }); rw.appendChild(nm);
        var rm = el('button', 'tool ghost sys-btn sys-scene-rm', '×'); rm.type = 'button'; rm.title = 'Remove this channel'; rm.addEventListener('click', function() { list.splice(i, 1); if (!list.length) delete draft.scenes; ch(true); }); rw.appendChild(rm);
        rw.appendChild(says); say();
        wrap.appendChild(rw);
    });
    var add = el('button', 'tool ghost sys-btn sys-scene-add', '+ Channel'); add.type = 'button'; add.disabled = !!list && list.length >= max; add.title = 'A way a scene reaches the one listening, such as Heard only';
    add.addEventListener('click', function() { if (!Array.isArray(draft.scenes)) draft.scenes = []; list = draft.scenes; if (list.length >= max) return; var nw = { label: ROW_NEW.scene, _new: true }; nw.key = keyFor(nw, nw.label); list.push(nw); ch(true); rowNewFocus('.sys-scene-label'); });   // 1.6.3: a new channel starts named
    var bar = el('div', 'sys-flags'); bar.appendChild(add); wrap.appendChild(bar);
    box.appendChild(wrap);
}
// [vehiclecheck:mapstart-start]
// 1.6.3 (the owner, 2026-11-16, by prompt: "Only where it starts"): the scale a new map of this system starts at, set above the map kinds on the
// Combat tab. A number and the units the ruler offers (MAPKIND_UNITS, the very list a map kind's own cell uses), and Clear. What is typed is kept on
// the draft as sys.mapStart { per, unit }; Save keeps it through systemcore cleanMapStart, and the line under the row says, as it is typed, when
// Save would leave it out (mapStartSays). Nothing else reads the draft's value: models.js applyMapStart reads the saved system when a map is made.
// Called by mapKindsBox before its own block, so the pinned call of mapKindsBox at tp('mapkinds') stays as it was. Values and text nodes only
function mapStartSays(v) {
    if (v === undefined || v === null) return '';
    var SCk = window.wpSystemCore || {}, ok = typeof SCk.cleanMapStart === 'function' ? SCk.cleanMapStart(v) : v;
    return ok ? '' : 'Save leaves this out: a cell must be more than 0 and at most 1,000,000.';
}
function mapStartBox(box) {
    var wrap = el('div', 'sys-holds sys-mapstart'), st = draft.mapStart && typeof draft.mapStart === 'object' ? draft.mapStart : null, ch = function(re) { markDirty(); if (re) renderCombat(); if (typeof patchErrors === 'function') patchErrors(); };
    wrap.appendChild(el('div', 'sys-light-head', 'New maps start at'));
    wrap.appendChild(el('div', 'sys-note', 'The cell a map starts at when it is made in a campaign of this system, such as 1 yard a square. It can be changed on each map like any scale. Maps that are already there keep their own. Empty: a new map starts as it always did, 5 feet a square or 1 yard a hex.'));
    var rw = el('div', 'sys-flags sys-arcrow'), pw = el('label', 'sys-check'), pi = el('input', 'field sys-num sys-ms-per'); pi.type = 'number'; pi.min = '0'; pi.step = 'any'; if (st && typeof st.per === 'number' && isFinite(st.per)) pi.value = String(st.per);
    pi.title = 'How large one cell of a new map is, in the unit beside it. Empty: a new map starts as it always did';
    var us = select('sys-ms-unit', MAPKIND_UNITS, st && typeof st.unit === 'string' ? st.unit : 'yd', 'The unit of that cell');
    var says = el('div', 'sys-note sys-ms-says', mapStartSays(st)); says.hidden = !says.textContent;
    var clr = el('button', 'tool ghost sys-btn sys-ms-clear', 'Clear'); clr.type = 'button'; clr.title = 'New maps start as they always did'; clr.disabled = !st;
    // Says under the row whether Save keeps what is typed, and keeps Clear live exactly while the draft holds a start scale: the number box changes
    // the draft with no redraw, so Clear follows it here and not only when the row is drawn
    var tell = function() { says.textContent = mapStartSays(draft.mapStart); says.hidden = !says.textContent; clr.disabled = !draft.mapStart; };
    pi.addEventListener('input', function() { var v = pi.value === '' ? NaN : Number(pi.value); if (isFinite(v)) draft.mapStart = { per: v, unit: us.value }; else delete draft.mapStart; tell(); ch(); });
    us.addEventListener('change', function(e) { e.stopPropagation(); if (draft.mapStart && typeof draft.mapStart === 'object') { draft.mapStart.unit = us.value; ch(); } });
    pw.appendChild(document.createTextNode('A cell is ')); pw.appendChild(pi); rw.appendChild(pw); rw.appendChild(us);
    clr.addEventListener('click', function() { delete draft.mapStart; ch(true); }); rw.appendChild(clr);
    wrap.appendChild(rw); wrap.appendChild(says);
    box.appendChild(wrap);
}
// [vehiclecheck:mapstart-end]
function mapKindsBox(box) {
    if (typeof mapStartBox === 'function') mapStartBox(box);   // 1.6.3: the scale a new map starts at, above the map kinds
    var wrap = el('div', 'sys-holds sys-mapkinds'), list = Array.isArray(draft.mapKinds) ? draft.mapKinds : null, SCk = window.wpSystemCore || {}, max = SCk.MAPKIND_MAX || 8, ch = function(re) { markDirty(); if (re) renderCombat(); if (typeof patchErrors === 'function') patchErrors(); };
    var keyFor = function(arr, a, lb, word) { return rowKeyFor(arr, a, lb, word || 'Kind'); };   // 1.6.3: always a short name the cleaner keeps
    wrap.appendChild(el('div', 'sys-light-head', 'Map kinds'));
    wrap.appendChild(el('div', 'sys-note', 'Such as Vehicle or Space. Each sets the cell a map starts at when it is picked, and names factors a rule can read on that map, such as a Speed of 10. A map with no kind is at the personal scale, and every factor reads 1 there.'));
    (list || []).forEach(function(k, i) {
        var card = el('div', 'sys-mapkind'), rw = el('div', 'sys-flags sys-arcrow'), nm = input('sys-mk-label field', k.label || '', 'Its name, such as Vehicle', 'Vehicle'), says = el('span', 'sys-note sys-mk-says'), say = function() { says.textContent = rowNameSays(k, 'Save drops it with its cell and its factors.'); };
        nm.maxLength = LIMITS.label;
        nm.addEventListener('input', function() { k.label = nm.value.slice(0, LIMITS.label); if (k._new || !k.key) k.key = keyFor(list, k, k.label, 'Kind'); say(); ch(); }); rw.appendChild(nm);
        var sc = k.scale && typeof k.scale === 'object' ? k.scale : null, pw = el('label', 'sys-check'), pi = el('input', 'field sys-num sys-mk-per'); pi.type = 'number'; pi.min = '0'; pi.step = 'any'; if (sc && typeof sc.per === 'number') pi.value = String(sc.per);
        pi.addEventListener('input', function() { var v = pi.value === '' ? NaN : Number(pi.value); if (isFinite(v) && v > 0) { k.scale = Object.assign({ unit: 'yd' }, k.scale || {}, { per: v }); } else delete k.scale; ch(); });
        pw.appendChild(document.createTextNode('A cell is ')); pw.appendChild(pi); pw.title = 'The cell a map starts at when it is switched to this kind. Empty: the map keeps its own'; rw.appendChild(pw);
        var us = select('sys-mk-unit', MAPKIND_UNITS, sc && sc.unit ? sc.unit : 'yd', 'The unit of that cell'); us.addEventListener('change', function(e) { e.stopPropagation(); if (k.scale) k.scale.unit = us.value; ch(); }); rw.appendChild(us);
        var tw = el('label', 'sys-check'), tc = el('input', 'sys-mk-travel'); tc.type = 'checkbox'; tc.checked = k.travel === true; tc.addEventListener('change', function(e) { e.stopPropagation(); if (tc.checked) k.travel = true; else delete k.travel; ch(true); }); tw.appendChild(tc); tw.appendChild(document.createTextNode(' Ruler shows travel time')); tw.title = 'On a map of this kind the ruler says how long the trip takes by each travel mode'; rw.appendChild(tw);   // 1.6.2 (backlog 166 a); 1.6.3: drawn again, so the travel modes' line follows the tick
        var rm = el('button', 'tool ghost sys-btn sys-mk-rm', '×'); rm.type = 'button'; rm.title = 'Remove this map kind'; rm.addEventListener('click', function() { list.splice(i, 1); if (!list.length) delete draft.mapKinds; ch(true); }); rw.appendChild(rm);
        rw.appendChild(says); say();
        card.appendChild(rw);
        var fs = Array.isArray(k.factors) ? k.factors : null;
        (fs || []).forEach(function(f, j) {
            var fr = el('div', 'sys-flags sys-arcrow sys-mk-frow'), fn = input('sys-mk-flabel field', f.label || '', 'The factor’s name, such as Speed', 'Speed'), fsays = el('span', 'sys-note sys-mk-fsays');
            var fsay = function() { fsays.textContent = !String(f.label || '').trim() ? 'Needs a name, or Save drops this factor.' : !(typeof f.v === 'number' && isFinite(f.v)) ? 'Needs its number, or Save drops this factor.' : ''; };   // 1.6.3: a factor needs both
            fn.maxLength = LIMITS.label;
            fn.addEventListener('input', function() { f.label = fn.value.slice(0, LIMITS.label); if (f._new || !f.key) f.key = keyFor(fs, f, f.label, 'Factor'); fsay(); ch(); }); fr.appendChild(fn);
            var fv = el('input', 'field sys-num sys-mk-fv'); fv.type = 'number'; fv.step = 'any'; if (typeof f.v === 'number') fv.value = String(f.v); fv.title = 'The number a rule reads on a map of this kind. It must be filled in';
            fv.addEventListener('input', function() { var v = fv.value === '' ? NaN : Number(fv.value); if (isFinite(v)) f.v = v; else delete f.v; fsay(); ch(); }); fr.appendChild(fv);
            var fx = el('button', 'tool ghost sys-btn sys-mk-frm', '×'); fx.type = 'button'; fx.title = 'Remove this factor'; fx.addEventListener('click', function() { fs.splice(j, 1); if (!fs.length) delete k.factors; ch(true); }); fr.appendChild(fx);
            fr.appendChild(fsays); fsay();
            card.appendChild(fr);
        });
        var fa = el('button', 'tool ghost sys-btn sys-mk-fadd', '+ Factor'); fa.type = 'button'; fa.disabled = !!fs && fs.length >= 8; fa.title = 'A number a rule reads on a map of this kind, such as a Speed factor of 10';
        fa.addEventListener('click', function() { if (!Array.isArray(k.factors)) k.factors = []; if (k.factors.length >= 8) return; var nf = { label: ROW_NEW.factor, v: 1, _new: true }; nf.key = keyFor(k.factors, nf, nf.label, 'Factor'); k.factors.push(nf); ch(true); var ki = i; if (typeof setTimeout === 'function') setTimeout(function() { var cs = document.querySelectorAll('#systemModal .sys-mapkind'), fl = cs[ki] ? cs[ki].querySelectorAll('.sys-mk-flabel') : []; if (fl.length) { fl[fl.length - 1].focus(); if (fl[fl.length - 1].select) fl[fl.length - 1].select(); } }, 0); }); card.appendChild(fa);   // 1.6.3: a new factor starts named, at 1
        wrap.appendChild(card);
    });
    var add = el('button', 'tool ghost sys-btn sys-mk-add', '+ Map kind'); add.type = 'button'; add.disabled = !!list && list.length >= max; add.title = 'A scale a map can be switched to, such as Vehicle';
    add.addEventListener('click', function() { if (!Array.isArray(draft.mapKinds)) draft.mapKinds = []; list = draft.mapKinds; if (list.length >= max) return; var nw = { label: ROW_NEW.kind, _new: true }; nw.key = keyFor(list, nw, nw.label, 'Kind'); list.push(nw); ch(true); rowNewFocus('.sys-mk-label'); });   // the new kind's name takes the focus; 1.6.3: it starts named
    var bar = el('div', 'sys-flags'); bar.appendChild(add); wrap.appendChild(bar);
    box.appendChild(wrap);
}
// [vehiclecheck:travelbox-start]
// 1.6.2 (backlog 166 a): the travel modes. A row each: its name, its speed, the unit and the time it counts in, and a sheet's own number field
// read in its place where the ruler starts on a token; then + Travel mode. Names as values and text nodes only
var TRAVEL_PERS = [['round', 'a round'], ['minute', 'a minute'], ['hour', 'an hour'], ['day', 'a day']];
// 1.6.3 (lane B; Fulllion's rulings of 2026-11-20): what Save does with a travel mode of the draft, said under its row: '' where it keeps it. A mode needs
// its name, and a speed above 0 or a number of the sheet read in its place
function travelSays(m, nums) {
    if (!String(m && m.label || '').trim()) return 'Needs a name, or Save drops it.';
    var fOk = typeof m.f === 'string' && m.f && (nums || []).some(function(f) { return f.id === m.f; });
    return (typeof m.n === 'number' && isFinite(m.n) && m.n > 0) || fOk ? '' : 'Needs a speed, or a number of the sheet, or Save drops it.';
}
// ... and the line under every mode, from what the map kinds tick: modes no kind shows, or a kind that shows modes there are none of. '' where all is well
function travelKindSays(kinds, modes) {
    var ticks = (Array.isArray(kinds) ? kinds : []).some(function(k) { return !!k && k.travel === true; }), has = Array.isArray(modes) && modes.length > 0;
    if (has && !ticks) return 'No map kind ticks Ruler shows travel time, so these modes show nowhere yet.';
    if (ticks && !has) return 'A map kind ticks Ruler shows travel time, but there is no travel mode yet, so its ruler shows nothing.';
    return '';
}
function travelBox(box) {
    var wrap = el('div', 'sys-holds sys-travel'), list = Array.isArray(draft.travel) ? draft.travel : null, SCk = window.wpSystemCore || {}, max = SCk.TRAVEL_MAX || 8, ch = function(re) { markDirty(); if (re) renderCombat(); if (typeof patchErrors === 'function') patchErrors(); };
    var keyFor = function(a, lb) { return rowKeyFor(list, a, lb, 'Mode'); };   // 1.6.3: always a short name the cleaner keeps
    var nums = (draft.fields || []).filter(function(f) { return f && (f.kind === 'number' || f.kind === 'formula'); });
    wrap.appendChild(el('div', 'sys-light-head', 'Travel modes'));
    wrap.appendChild(el('div', 'sys-note', 'Such as On foot at 3 miles an hour, or By ship at 100 miles a day. On a map whose kind ticks Ruler shows travel time, the ruler says how long the trip takes by each. A mode may read a number on the sheet instead, so a ruler started on a vehicle or a mount uses its own Speed.'));
    var kSays = travelKindSays(draft.mapKinds, list); if (kSays) wrap.appendChild(el('div', 'sys-note sys-tv-kinds', kSays));
    (list || []).forEach(function(m, i) {
        var rw = el('div', 'sys-flags sys-arcrow sys-tv-row'), nm = input('sys-tv-label field', m.label || '', 'Its name, such as On foot', 'On foot'), says = el('span', 'sys-note sys-tv-says'), say = function() { says.textContent = travelSays(m, nums); };
        nm.maxLength = LIMITS.label;
        nm.addEventListener('input', function() { m.label = nm.value.slice(0, LIMITS.label); if (m._new || !m.key) m.key = keyFor(m, m.label); say(); ch(); }); rw.appendChild(nm);
        var nw = el('label', 'sys-check'), ni = el('input', 'field sys-num sys-tv-n'); ni.type = 'number'; ni.min = '0'; ni.step = 'any'; if (typeof m.n === 'number') ni.value = String(m.n); ni.title = 'How far it goes, in the unit beside it. It needs a speed, or a number of the sheet';
        ni.addEventListener('input', function() { var v = ni.value === '' ? NaN : Number(ni.value); if (isFinite(v) && v > 0) m.n = v; else delete m.n; say(); ch(); }); nw.appendChild(document.createTextNode('Speed ')); nw.appendChild(ni); rw.appendChild(nw);
        var us = select('sys-tv-u', MAPKIND_UNITS, m.u || 'mi', 'The unit of its speed'); us.addEventListener('change', function(e) { e.stopPropagation(); m.u = us.value; ch(); }); rw.appendChild(us);
        var ts = select('sys-tv-t', TRAVEL_PERS, m.t || 'hour', 'The time its speed counts in'); ts.addEventListener('change', function(e) { e.stopPropagation(); m.t = ts.value; ch(); }); rw.appendChild(document.createTextNode(' each ')); rw.appendChild(ts);
        var fw = el('label', 'sys-check'), fs = select('sys-tv-f', [['', 'None']].concat(nums.map(function(f) { return [f.id, typeof fieldWord === 'function' ? fieldWord(f) : (f.label || f.key)]; })), m.f || '', 'A number on the sheet read as this speed where the ruler starts on a token, such as a vehicle’s Speed. The speed beside it stands where none can be read');
        fs.addEventListener('change', function(e) { e.stopPropagation(); if (fs.value) m.f = fs.value; else delete m.f; say(); ch(); }); fw.appendChild(document.createTextNode('Or the sheet’s ')); fw.appendChild(fs); rw.appendChild(fw);
        var rm = el('button', 'tool ghost sys-btn sys-tv-rm', '×'); rm.type = 'button'; rm.title = 'Remove this travel mode'; rm.addEventListener('click', function() { list.splice(i, 1); if (!list.length) delete draft.travel; ch(true); }); rw.appendChild(rm);
        rw.appendChild(says); say();
        wrap.appendChild(rw);
    });
    var add = el('button', 'tool ghost sys-btn sys-tv-add', '+ Travel mode'); add.type = 'button'; add.disabled = !!list && list.length >= max; add.title = 'A way of traveling, such as On foot, Mounted or By ship';
    // 1.6.3 (Fulllion's rulings of 2026-11-20): a new mode starts named, at 3 miles an hour, so a system saved at once keeps it
    add.addEventListener('click', function() { if (!Array.isArray(draft.travel)) draft.travel = []; list = draft.travel; if (list.length >= max) return; var nm0 = { label: ROW_NEW.travel, n: 3, u: 'mi', t: 'hour', _new: true }; nm0.key = keyFor(nm0, nm0.label); list.push(nm0); ch(true); rowNewFocus('.sys-tv-label'); });
    var bar = el('div', 'sys-flags'); bar.appendChild(add); wrap.appendChild(bar);
    box.appendChild(wrap);
}
// [vehiclecheck:travelbox-end]
function postureBox(box, cm) {
    var arr = Array.isArray(cm.postures) ? cm.postures : [], wrap = el('div', 'sys-postures'), targets = fxTargets(draft);
    wrap.appendChild(el('div', 'sys-light-head', 'Postures'));
    wrap.appendChild(el('div', 'sys-note', arr.length ? 'How a token can stand, in order. The first is how a token stands with none set; formulas read Posture as each one\u2019s place (0 for the first), so moving one changes what they read. A posture\u2019s changes apply to the character while its token takes it. ' + (cm.postureOnAttack === true ? 'Its ranged note shows what a foe\u2019s ranged roll takes on the ruler and the token, and a roll can read it.' : 'Its ranged note shows what a foe\u2019s ranged roll takes on the ruler and the token, and is never worked into a roll.') : 'Posture is off for this system: tokens have no posture chip or menu, and Posture reads 0. Add postures to list how a token can stand, each with a ranged note and changes like an effect\u2019s.'));
    if (arr.length && typeof checkLabel === 'function') {   // 1.6.0: an attack reads its target's posture, and what each grade of cover takes off, to compare the two (asked through typeof: a suite runs this box alone)
        wrap.appendChild(checkLabel('sys-combat-postatk', cm.postureOnAttack === true, 'An attack reads its target\u2019s posture', 'A roll can read the ranged note of its target\u2019s posture, or the harsher of that and its cover, never both. Put one in your ranged rolls: any roll that reads them is one. Its card says which counted'));
        if (cm.postureOnAttack === true) { var cmE = cm.cover && typeof cm.cover === 'object' ? cm.cover : {}, cmD = cmE.mods && typeof cmE.mods === 'object' ? cmE.mods : {}; (cmE.style === 'binary' ? [['cover', 'Cover takes']] : [['half', 'Half cover takes'], ['threeq', 'Three-quarters cover takes']]).concat([['total', 'Total cover takes']]).forEach(function(g) { var lb = labeledNum('sys-combat-covmod', g[1], typeof cmD[g[0]] === 'number' ? cmD[g[0]] : '', 'What this grade of cover takes off an attack, a whole number from \u221220 to 20, such as \u22122. Empty: nothing'); lb.lastChild.dataset.grade = g[0]; lb.lastChild.min = '-20'; lb.lastChild.max = '20'; wrap.appendChild(lb); }); }
    }
    arr.forEach(function(p0, i) {
        var p = p0 && typeof p0 === 'object' ? p0 : {}, row = el('div', 'sys-row sys-posture-row'); row.dataset.pi = String(i);
        var top = el('div', 'sys-flags');
        var n = input('sys-posture-name field', typeof p.name === 'string' ? p.name : '', i === 0 ? 'How a token stands with no posture set (Standing)' : 'Its name on a token\u2019s menu and the sheet', 'Name'); n.maxLength = LIMITS.name; top.appendChild(n);
        var tg = input('sys-posture-tag field', typeof p.tag === 'string' ? p.tag : '', 'The chip on the token: up to ' + LIMITS.postureTag + ' characters (empty: the name\u2019s first three letters)', 'Tag'); tg.maxLength = 8; top.appendChild(tg);
        if (i > 0) { var sl = el('label', 'sys-hover'), rv = typeof p.ranged === 'number' ? p.ranged : p.small === true ? -2 : '', sc = numInput('sys-posture-ranged field', rv, 'What a foe\u2019s ranged roll against a token in this posture takes, a whole number from \u221220 to 20, shown on the ruler that ends on it and in its tooltip' + (cm.postureOnAttack === true ? ', and a roll can read it' : ', never worked into a roll') + '. Empty: none', '1'); sc.min = '-20'; sc.max = '20'; sc.style.width = '56px'; sl.appendChild(document.createTextNode('Ranged note ')); sl.appendChild(sc); top.appendChild(sl); if (cm.postureOnAttack === true) top.appendChild(checkLabel('sys-posture-aimed', p.aimed === true, 'Hits land as aimed', 'A roll can tell that this posture counts on an attack, a tie with cover included')); }
        if (i > 0) { var pcG = p.cover && typeof p.cover === 'object' && [1, 2, 3].indexOf(p.cover.g) >= 0 ? String(p.cover.g) : '', pcL = el('label', 'sys-hover', 'Gives cover '); pcL.appendChild(select('sys-posture-cover', [['', 'None'], ['1', 'Half'], ['2', 'Three-quarters'], ['3', 'Total']], pcG, 'A token standing so has this cover, as lying behind a low wall gives. The better of this and the map\u2019s own cover counts')); if (pcG) pcL.appendChild(select('sys-posture-covervs', [['', 'against everyone'], ['far', 'against attacks from further away']], p.cover.vs === 'far' ? 'far' : '', 'Against attacks from further away: only from a token not next to it')); top.appendChild(pcL); }   // 1.6.2
        [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove this posture']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'ps' + bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(top, bb) : top.appendChild(bb)); });
        row.appendChild(top);
        var nr = el('div', 'sys-flags'), nt = input('sys-posture-notes field', typeof p.notes === 'string' ? p.notes : '', 'Shown under the posture on the sheet\u2019s Stance control', 'Notes'); nt.maxLength = LIMITS.postureNotes; nr.appendChild(nt); row.appendChild(nr);
        if (i > 0) {   // the first takes no changes
            var mods = el('div', 'sys-fx-mods');
            (Array.isArray(p.mods) ? p.mods : []).forEach(function(m0, mi) {
                var m = m0 && typeof m0 === 'object' ? m0 : {}, ln = el('div', 'sys-fx-mod sys-posture-mod'); ln.dataset.mi = String(mi);
                var val = m.f + '|' + (m.op === 'on' ? 'on' : m.part === 'max' ? 'max' : 'add'), opts = targets.slice();
                if (!opts.some(function(o) { return o[0] === val; })) opts.unshift([val, '(a field that is gone or changed kind)']);
                ln.appendChild(select('sys-posture-target', opts, val, 'What this change affects'));
                if (m.op !== 'on') { var am = numInput('sys-posture-amt', m.v, 'How much it adds (negative to take away)'); am.step = 'any'; ln.appendChild(am); }
                var db = el('button', 'tool ghost sys-btn', '\u00d7'); db.dataset.act = 'psmoddel'; db.title = 'Remove this change'; ln.appendChild(db);
                mods.appendChild(ln);
            });
            var madd = el('button', 'tool ghost sys-btn', '+ Change'); madd.dataset.act = 'psmodadd'; madd.title = targets.length ? 'Add a number to a field, or switch a toggle on, while a token takes this posture' : 'Add a number, skill, formula, pool or toggle field first'; madd.disabled = !targets.length; mods.appendChild(madd);
            row.appendChild(mods);
        }
        wrap.appendChild(row);
    });
    var bar = el('div', 'sys-flags');
    if (!arr.length) { var own = el('button', 'tool ghost sys-btn sys-posture-own', 'Add postures'); own.dataset.act = 'psown'; own.title = 'Switch posture on for this system: start a list with Standing and one more, then name, reorder and add to them'; bar.appendChild(own); }
    else {
        var ad = el('button', 'tool ghost sys-btn sys-posture-add', '+ Posture'); ad.dataset.act = 'psadd'; ad.disabled = arr.length >= LIMITS.postures; ad.title = ad.disabled ? 'At most ' + LIMITS.postures : 'Another way to stand'; bar.appendChild(ad);
        var bk = el('button', 'tool ghost sys-btn sys-posture-clear', 'Switch posture off'); bk.dataset.act = 'psclear'; bk.title = 'Drop this list: tokens have no posture chip or menu, and Posture reads 0. A token keeps what it had, unseen'; bar.appendChild(bk);
    }
    wrap.appendChild(bar);
    var err = errorCell('postures'); err.dataset.errFor = 'postures'; wrap.appendChild(err);
    box.appendChild(wrap);
}
// [sinkcheck:barsbox-start]
// Backlog 28 (the owner, 2026-10-29, by prompt: the system's bars, a token may change its own): the Combat tab's Token bars box. Bar 1 and Bar 2,
// each a pool of the sheet, who is shown it and its color; every character token takes them unless its Properties give it bars of its own. Add
// token bars starts Bar 1 on the pool damage subtracts from. Every text lands as a value or a text node; Save cleans them (systemcore cleanBars)
function barsBox(box, cm) {
    var S = window.wpSystemCore, words = S && S.BAR_SHOW_WORDS ? S.BAR_SHOW_WORDS : [['owner', 'Its owner and the GM']], cols = S && S.BAR_COLORS ? S.BAR_COLORS : ['#d9534f', '#4f8fd9'];
    var wrap = el('div', 'sys-tokbars'), arr = Array.isArray(cm.bars) ? cm.bars : null, pools = (draft.fields || []).filter(function(f) { return f && f.kind === 'resource' && typeof f.id === 'string'; });
    wrap.appendChild(el('div', 'sys-light-head', 'Token bars'));
    wrap.appendChild(el('div', 'sys-note', arr ? 'A thin ring around every character token: Bar 1 is its left half, Bar 2 its right. Hovering over a bar shows its numbers to whoever may see it. A GM-only pool, or one whose most reads a GM-only value, is shown to the GM alone whatever is picked here. A token\u2019s Properties can give it bars of its own.' : 'Show up to two pools of the sheet, such as HP, as a thin ring around every character token.'));
    if (!arr) {
        var bar = el('div', 'sys-flags'), ad = el('button', 'tool ghost sys-btn sys-tokbars-add', 'Add token bars'); ad.dataset.act = 'tbadd'; ad.disabled = !pools.length; ad.title = pools.length ? 'Bar 1 starts as the pool damage subtracts from, shown to its owner and the GM' : 'Add a resource field (a pool) first'; bar.appendChild(ad);
        wrap.appendChild(bar); box.appendChild(wrap); return;
    }
    [0, 1].forEach(function(i) {
        var b = arr[i] && typeof arr[i] === 'object' ? arr[i] : null, row = el('div', 'sys-flags sys-tokbar-row'); row.dataset.bi = String(i);
        row.appendChild(el('span', 'sys-num-cap', 'Bar ' + (i + 1)));
        var opts = [['', '\u2014 none \u2014']].concat(pools.map(function(f) { return [f.id, (f.label || f.key) + (f.vis === 'gm' ? ' (GM only)' : '')]; }));
        if (b && typeof b.f === 'string' && !pools.some(function(f) { return f.id === b.f; })) opts.push([b.f, '(a pool that is gone)']);
        row.appendChild(select('sys-tokbar-pool', opts, b && typeof b.f === 'string' ? b.f : '', 'The pool this bar shows'));
        if (b) {
            row.appendChild(select('sys-tokbar-show', words, typeof b.show === 'string' ? b.show : 'owner', 'Who sees this bar. The GM always does'));
            var ci = el('input', 'sys-tokbar-color'); ci.type = 'color'; ci.value = typeof b.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : cols[i]; ci.title = 'This bar\u2019s color'; row.appendChild(ci);
        }
        wrap.appendChild(row);
    });
    var off = el('div', 'sys-flags'), rm = el('button', 'tool ghost sys-btn sys-tokbars-clear', 'Remove token bars'); rm.dataset.act = 'tbclear'; rm.title = 'No bars on character tokens. A token with bars of its own keeps them'; off.appendChild(rm); wrap.appendChild(off);
    box.appendChild(wrap);
}
// [sinkcheck:barsbox-end]
// [sinkcheck:holdsbox-start]
// 1.6.0 Who holds whom: combat.holds, off until Add. Every text lands as a value or a text node; Save cleans it (systemcore cleanHolds); refreshErrors says what it would drop, under errorCell('holds')
function holdRollOpts(cur) {
    var o = [['', 'None']], d = typeof draft !== 'undefined' && draft ? draft : {};
    (Array.isArray(d.rolls) ? d.rolls : []).forEach(function(r) { if (r && typeof r.id === 'string' && (!(typeof r.withRow === 'string' && r.withRow) || r.id === cur)) o.push([r.id, (r.label || 'Roll') + (typeof r.withRow === 'string' && r.withRow ? ', made only from a defense card' : '')]); });   // 1.6.3 (the review of defense fold 2, finding 3): never a roll answered with a row, which is made only from a defense card
    (Array.isArray(d.fields) ? d.fields : []).forEach(function(f) { if (f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) f.list.rolls.forEach(function(r, i) { o.push([f.id + '#' + i, (f.label || f.key || 'List') + ': ' + ((r && r.label) || 'Roll')]); }); });
    if (typeof cur === 'string' && cur && !o.some(function(x) { return x[0] === cur; })) o.push([cur, 'A roll that is gone']);
    return o;
}
function holdsBox(box, cm) {
    var wrap = el('div', 'sys-holds'), h = cm.holds && typeof cm.holds === 'object' ? cm.holds : null, fxs = (Array.isArray(draft.effects) ? draft.effects : []).filter(function(e) { return e && typeof e.id === 'string'; });
    wrap.appendChild(el('div', 'sys-light-head', 'Who holds whom'));
    wrap.appendChild(el('div', 'sys-note', h ? 'The host keeps who holds whom in a fight. Each roll below may be a roll of the system or of a list.' : 'Off. The GM keeps who holds whom by hand.'));
    if (!h) { var bar = el('div', 'sys-flags'), ad = el('button', 'tool ghost sys-btn', 'Keep who holds whom'); ad.dataset.act = 'holdadd'; ad.disabled = !fxs.length; ad.title = fxs.length ? 'A hold puts an effect of the library on whoever is held' : 'Add an effect to the library first: a held character wears it'; bar.appendChild(ad); wrap.appendChild(bar); box.appendChild(wrap); return; }
    var fxO = function(none, cur) { var o = none ? [['', none]] : []; fxs.forEach(function(e) { o.push([e.id, e.name || e.id]); }); if (typeof cur === 'string' && cur && !o.some(function(x) { return x[0] === cur; })) o.push([cur, 'An effect that is gone']); return o; };
    var sel = function(k, cap, o, cur, title) { var l = labeledSelect('sys-hold-pick', cap, o, typeof cur === 'string' ? cur : '', title); l.querySelector('select').dataset.k = k; wrap.appendChild(l); };
    sel('held', 'The held wear', fxO('', h.held), h.held, 'The effect a held character wears, once however many hold them');
    sel('pinned', 'The pinned wear', fxO('None', h.pinned), h.pinned, 'The effect a pinned character wears as well');
    sel('holder', 'The holder wears', fxO('None', h.holder), h.holder, 'The effect a character wears while they hold anyone, so a needs formula can tell that they are holding');
    [['take', 'A roll that takes hold', 'A success takes hold of the roller\u2019s target'], ['pin', 'A roll that pins', 'A success pins someone the roller holds'], ['keep', 'The keep', 'One press at the holder\u2019s turn keeps every hold they have. With none, their holds end at its end. None named: holds need no keeping'], ['squeeze', 'A squeeze', 'A damage roll: its blow lands on each one held, with no attack and no resist, and it keeps the holds'], ['free', 'A roll that breaks free', 'The held roll it at the one who holds them. A success ends that hold. One that is resisted ends it once the holder fails']].forEach(function(x) { sel(x[0], x[1], holdRollOpts(h[x[0]]), h[x[0]], x[2]); });
    var alsoW = el('div', 'sys-flags'); alsoW.appendChild(el('span', 'sys-num-cap', 'Attacks that keep too')); holdRollOpts('').slice(1).forEach(function(o) { var l = checkLabel('sys-hold-also', Array.isArray(h.also) && h.also.indexOf(o[0]) >= 0, o[1], 'Aimed at someone held, this roll keeps every hold'); l.querySelector('input').dataset.ref = o[0]; alsoW.appendChild(l); }); wrap.appendChild(alsoW);
    wrap.appendChild(labeledNum('sys-hold-drag', 'Drags, in cells a turn', typeof h.drag === 'number' ? h.drag : '', 'A holder who moves this far or less takes those held along. Further, or blank, and walking off lets go'));
    var drW = el('div', 'sys-flags'); drW.appendChild(checkLabel('sys-hold-drawin', h.drawIn === true, 'A grab draws its target in', 'A hold taken from a distance brings them to a free cell beside the holder. With none, or while someone else holds them, they stay where they are')); wrap.appendChild(drW);
    var eL = el('label', 'sys-combat-item'); eL.appendChild(el('span', 'sys-num-cap', 'All holds end where')); eL.appendChild(input('sys-hold-ends field', typeof h.ends === 'string' ? h.ends : '', 'A formula of the holder\u2019s names, no dice, true while they have lost their action or are down. Then every hold of theirs ends at once', 'Blank: nothing ends them')); wrap.appendChild(eL);
    var dl = el('button', 'tool ghost sys-btn', 'Stop keeping who holds whom'); dl.dataset.act = 'holddel'; wrap.appendChild(dl);
    var err = errorCell('holds'); err.dataset.errFor = 'holds'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function onHoldChange(t) {
    var c = t.className || '', h = draft.combat && draft.combat.holds; if (typeof c !== 'string' || c.indexOf('sys-hold-') < 0 || !h) return false;
    if (c.indexOf('sys-hold-pick') >= 0) { if (t.value) h[t.dataset.k] = t.value; else delete h[t.dataset.k]; }
    else if (c.indexOf('sys-hold-also') >= 0) { var al = Array.isArray(h.also) ? h.also.slice() : [], at = al.indexOf(t.dataset.ref); if (t.checked && at < 0) al.push(t.dataset.ref); if (!t.checked && at >= 0) al.splice(at, 1); if (al.length) h.also = al; else delete h.also; }
    else if (c.indexOf('sys-hold-drawin') >= 0) { if (t.checked) h.drawIn = true; else delete h.drawIn; }
    else return false;
    markDirty(); patchErrors(); return true;
}
function onHoldInput(t) {
    var c = t.className || '', h = draft.combat && draft.combat.holds; if (typeof c !== 'string' || c.indexOf('sys-hold-') < 0 || !h) return false;
    if (c.indexOf('sys-hold-ends') >= 0) { var ev = t.value.slice(0, LIMITS.formula).trim(); if (ev) h.ends = ev; else delete h.ends; }
    else if (c.indexOf('sys-hold-drag') >= 0) { if (String(t.value).trim() === '') delete h.drag; else h.drag = Number(t.value); }
    else return false;
    markDirty(); patchErrors(); return true;
}
// [sinkcheck:holdsbox-end]
function onBarsChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-tokbar-') < 0) return false;
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), arr = Array.isArray(cm.bars) ? cm.bars : (cm.bars = [null, null]);
    var row = t.closest && t.closest('.sys-tokbar-row'), i = row ? +row.dataset.bi : -1; if (i !== 0 && i !== 1) return true;
    var S = window.wpSystemCore, cols = S && S.BAR_COLORS ? S.BAR_COLORS : ['#d9534f', '#4f8fd9'], b = arr[i] && typeof arr[i] === 'object' ? arr[i] : null;
    if (c.indexOf('sys-tokbar-pool') >= 0) { if (!t.value) arr[i] = null; else if (b) b.f = t.value; else arr[i] = { f: t.value, show: 'owner', color: cols[i] }; markDirty(); renderAll(); return true; }
    if (!b) return true;
    if (c.indexOf('sys-tokbar-show') >= 0) b.show = t.value;
    else if (c.indexOf('sys-tokbar-color') >= 0) { if (/^#[0-9a-fA-F]{6}$/.test(t.value)) b.color = t.value.toLowerCase(); }
    else return true;
    markDirty(); patchErrors(); return true;
}
function barsClick(b) {
    var mt = /^tb(add|clear)$/.exec(b.dataset.act || ''); if (!mt) return false;
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), S = window.wpSystemCore, cols = S && S.BAR_COLORS ? S.BAR_COLORS : ['#d9534f', '#4f8fd9'];
    if (mt[1] === 'clear') { delete cm.bars; markDirty(); renderAll(); return true; }
    var pools = (draft.fields || []).filter(function(f) { return f && f.kind === 'resource' && typeof f.id === 'string'; }); if (!pools.length) return true;
    var hp = pools.some(function(f) { return f.id === cm.hpResource; }) ? cm.hpResource : pools[0].id;
    cm.bars = [{ f: hp, show: 'owner', color: cols[0] }, null]; markDirty(); renderAll(); return true;
}
function postureRowOf(t) { var arr = postureDraft(), row = t.closest && t.closest('.sys-posture-row'), i = row ? +row.dataset.pi : -1; return i >= 0 && i < arr.length && Math.floor(i) === i && arr[i] && typeof arr[i] === 'object' ? arr[i] : null; }
function onPostureInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-posture-') < 0) return false;
    if (c.indexOf('sys-posture-target') >= 0) return true;   // its change event does the work
    var p = postureRowOf(t); if (!p) return true;
    if (c.indexOf('sys-posture-name') >= 0) p.name = t.value.slice(0, LIMITS.name);
    else if (c.indexOf('sys-posture-tag') >= 0) { if (t.value.trim()) p.tag = t.value.slice(0, 8); else delete p.tag; }
    else if (c.indexOf('sys-posture-notes') >= 0) { if (t.value.trim()) p.notes = t.value.slice(0, LIMITS.postureNotes); else delete p.notes; }
    else if (c.indexOf('sys-posture-covervs') >= 0) { if (p.cover && typeof p.cover === 'object') { if (t.value === 'far') p.cover.vs = 'far'; else delete p.cover.vs; } }   // 1.6.2 Gives cover
    else if (c.indexOf('sys-posture-cover') >= 0) { var pcN = Number(t.value); if (pcN === 1 || pcN === 2 || pcN === 3) p.cover = Object.assign({}, p.cover && typeof p.cover === 'object' ? p.cover : {}, { g: pcN }); else delete p.cover; }
    else if (c.indexOf('sys-posture-aimed') >= 0) { if (t.checked) p.aimed = true; else delete p.aimed; }   // 1.6.0
    else if (c.indexOf('sys-posture-ranged') >= 0) { var rn = Number(t.value); delete p.small; if (t.value === '' || !isFinite(rn) || Math.round(rn) === 0) delete p.ranged; else p.ranged = Math.max(-20, Math.min(20, Math.round(rn))); }   // 1.6.0: the tick before it goes
    else if (c.indexOf('sys-posture-amt') >= 0) { var ln = t.closest('.sys-posture-mod'), m = ln && Array.isArray(p.mods) ? p.mods[+ln.dataset.mi] : null; if (!m || typeof m !== 'object') return true; var nv = Number(t.value); m.v = t.value === '' || !isFinite(nv) ? 0 : nv; }
    else return true;
    markDirty(); patchErrors(); return true;
}
function onPostureChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-posture-') < 0) return false;
    if (c.indexOf('sys-posture-target') < 0) return true;   // the boxes' change events (their input events did the work)
    var p = postureRowOf(t); if (!p) return true;
    var ln = t.closest('.sys-posture-mod'), m = ln && Array.isArray(p.mods) ? p.mods[+ln.dataset.mi] : null; if (!m || typeof m !== 'object') return true;
    var tp = String(t.value).split('|'); m.f = tp[0];
    if (tp[1] === 'on') { m.op = 'on'; delete m.v; delete m.part; } else { m.op = 'add'; if (typeof m.v !== 'number') m.v = 1; if (tp[1] === 'max') m.part = 'max'; else delete m.part; }
    markDirty(); renderAll(); return true;
}
function postureClick(b) {
    var mt = /^ps(own|add|clear|up|down|del|modadd|moddel)$/.exec(b.dataset.act || ''); if (!mt) return false;
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' });
    if (mt[1] === 'own') { cm.postures = [{ id: 'standing', name: 'Standing' }, { id: uid('p_'), name: '' }]; markDirty(); renderAll(); return true; }   // 1.6.0: posture switched on, the first and one more to name
    if (mt[1] === 'clear') { delete cm.postures; markDirty(); renderAll(); return true; }
    var arr = postureDraft();
    if (mt[1] === 'add') { if (arr.length >= LIMITS.postures) { toast('At most ' + LIMITS.postures + ' postures.'); return true; } arr.push({ id: uid('p_'), name: '' }); markDirty(); renderAll(); return true; }
    var row = b.closest('.sys-posture-row'), i = row ? +row.dataset.pi : -1; if (!(i >= 0 && i < arr.length && Math.floor(i) === i)) return true;
    var p = arr[i] && typeof arr[i] === 'object' ? arr[i] : null;
    if (mt[1] === 'up') { if (i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]); }
    else if (mt[1] === 'down') { if (i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]); }
    else if (mt[1] === 'del') arr.splice(i, 1);
    else if (!p) return true;
    else if (mt[1] === 'modadd') {
        var tg = fxTargets(draft)[0]; if (!tg) return true; p.mods = Array.isArray(p.mods) ? p.mods : [];
        if (p.mods.length >= LIMITS.effectMods) { toast('At most ' + LIMITS.effectMods + ' changes per posture.'); return true; }
        var tp = tg[0].split('|'), nm = { f: tp[0], op: tp[1] === 'on' ? 'on' : 'add' }; if (nm.op === 'add') { nm.v = 1; if (tp[1] === 'max') nm.part = 'max'; }
        p.mods.push(nm);
    } else { var dl = b.closest('.sys-posture-mod'), mi = dl ? +dl.dataset.mi : -1; if (!(Array.isArray(p.mods) && mi >= 0 && mi < p.mods.length)) return true; p.mods.splice(mi, 1); }
    markDirty(); renderAll(); return true;
}
// [sinkcheck:posturebox-end]
// 1.5.6, the damage step (docs/DAMAGE_STEP_DESIGN.md): the Combat tab's Taking damage box. The pool a wound comes off, the Major Wound formula,
// the hit locations (a list, the stat or column that is its DR and the one it cripples at, a vital formula), the damage types, what wears and
// the weapons a blow tests. Every name reaches the box as a value or a text node. Save cleans it (systemcore cleanDamageRules); damageSays says
// under the box what Save drops, judged a part at a time by the cleaner itself
// [sinkcheck:dmgbox-start]
var DBX_LIM = typeof DMG_LIM === 'object' ? DMG_LIM : { types: 320, kinds: 80, layers: 80, weapons: 40, wears: 80, onWound: 60, onMajor: 40 };
var CRIP_BY_LINE = 'What the failure writes, instead of how far it failed. It can read how far it failed, the roll\u2019s bare total and the blow. 0 or below writes nothing';   // 1.6.0 (the core's ruling on gap 7)   // systemcore's DMG_LIM: what the cleaner keeps
// 1.6.0: a damage type's figures a die: its control, its key, its caption, its line, its least and its words
var DBX_DIE = [
    ['sys-dmgr-ydiedr', 'dieDr', 'DR', 'Added to the DR at the location for each die the blow rolled, for this blow alone. A minus takes armor off. -10 to 10', -10, 'its DR a die'],
    ['sys-dmgr-ydiew', 'dieWound', 'Wound', 'Added to a wound that gets through, for each die the blow rolled. -10 to 10', -10, 'its wound a die'],
    ['sys-dmgr-ydiev', 'dieVital', 'Vital wound', 'Added to a wound that gets through at a vital location, for each die the blow rolled. -10 to 10', -10, 'its vital wound a die'],
    ['sys-dmgr-ydiewear', 'dieWear', 'Wear', 'Worn off each layer at the location for good, for each die the blow rolled, whether or not it gets through. 0 to 10', 0, 'its wear a die']
];
function dbxObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
// 1.6.0: onMajor as rows in the editor: a single onMajor is one row, a list its rows. Written back as one object where one row is left (as
// before), a list where two or more are, and none where the one row holds nothing
function majRowsOf(om) { return Array.isArray(om) ? om.filter(dbxObj) : dbxObj(om) ? [om] : []; }
function majWrite(d, rows) { if (rows.length > 1) d.onMajor = rows; else if (rows.length === 1 && Object.keys(rows[0]).length) d.onMajor = rows[0]; else delete d.onMajor; }
function majAt(t) { var rw = t && t.closest ? t.closest('.sys-dmgr-onmajor') : null, i = rw ? Number(rw.dataset.mi) : 0, d = dbxDraft(), rows = majRowsOf(d.onMajor); if (!(i >= 0 && Math.floor(i) === i)) return null; if (i === 0 && !rows.length) rows.push({}); return i < rows.length ? { d: d, rows: rows, row: rows[i] } : null; }
function dbxHas(c, k) { return typeof c === 'string' && (' ' + c + ' ').indexOf(' ' + k + ' ') >= 0; }
// 1.6.3 (finding 27): the locations Unaimed blows land at offers, as [key, name]: the system's own entries (its items and core) and those of the
// campaign's library packs, each in the list's categories, each key once, by name. A GM-only entry, or one of a GM-only pack, is offered with
// (GM only) after its name (the review of damage): it still works for the GM, and a player's own Take damage window then starts on the usual
// location, since the system's cleaner keeps a GM-only name out of the players' view. A pack still loading offers what it has, and Another entry
// takes any name. sys: the system read (absent: the editor's draft). any (dbxLocFinds): every entry of the list's categories, one with no key
// too, as [key or '', its plain name], for the warning below
function dbxLocNames(listId, sys, any) {
    sys = sys || draft; var out = [], seen = Object.create(null);
    var f = (sys && Array.isArray(sys.fields) ? sys.fields : []).filter(function(x) { return !!x && x.id === listId && x.list; })[0], cats = f && Array.isArray(f.list.cats) && f.list.cats.length ? f.list.cats.map(function(s) { return String(s).toLowerCase(); }) : null;
    var put = function(e, gmPack) { if (any) { if (e && (!cats || cats.indexOf(String(e.category || '').toLowerCase()) >= 0)) out.push([typeof e.key === 'string' ? e.key : '', typeof e.name === 'string' ? e.name : '']); return; } if (!e || typeof e.key !== 'string' || !e.key || seen[e.key] || (cats && cats.indexOf(String(e.category || '').toLowerCase()) < 0)) return; seen[e.key] = 1; out.push([e.key, (typeof e.name === 'string' && e.name ? e.name : e.key) + (gmPack || e.vis === 'gm' ? ' (GM only)' : '')]); };
    ((sys && sys.items) || []).concat((sys && sys.core) || []).forEach(function(e) { put(e, false); });
    var LB = typeof window !== 'undefined' ? window.wpLibrary : null, cp = typeof getActiveCampaign === 'function' ? getActiveCampaign() : null, packs = cp && cp.library && Array.isArray(cp.library.packs) ? cp.library.packs : [];
    if (LB && typeof LB.entriesOf === 'function') packs.forEach(function(p) { if (p && typeof p.id === 'string') (LB.entriesOf(p.id) || []).forEach(function(e) { put(e, p.vis === 'gm'); }); });
    return out.sort(function(a, b) { return String(a[1]).localeCompare(String(b[1])); });
}
// 1.6.3 (the review of damage): whether Unaimed blows land at (at) can find a location of the list, by the rule the Take damage window (sheets.js) and a
// blast's shares (wbblast.js) read it with: an entry whose key or name is that, else one whose name holds it. null where it cannot be told yet (a library pack the
// campaign lists is not read), so the editor says nothing then. A character's own row of that name would still be found
function dbxLocFinds(listId, at, sys) {
    var LB = typeof window !== 'undefined' ? window.wpLibrary : null; if (LB && typeof LB.whole === 'function' && !LB.whole()) return null;
    var w = String(at || '').trim().toLowerCase(); if (!w) return true;
    var nm = function(o) { return String(o[1]).trim().toLowerCase(); }, all = dbxLocNames(listId, sys, true);
    return all.some(function(o) { return (!!o[0] && String(o[0]).toLowerCase() === w) || nm(o) === w; }) || all.some(function(o) { return !!nm(o) && nm(o).indexOf(w) >= 0; });
}
function dbxCm() { return draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); }
function dbxDraft() { var cm = dbxCm(); return dbxObj(cm.damage) ? cm.damage : (cm.damage = {}); }
function dbxTidy() { var cm = dbxCm(); if (dbxObj(cm.damage) && !Object.keys(cm.damage).length) delete cm.damage; }
function dbxField(id) { return (draft.fields || []).filter(function(f) { return f && f.id === id; })[0] || null; }
function dbxKeys(listId, numOnly) {   // [key, words]: a list's stats, and its columns unless only number stats are wanted
    var f = dbxField(listId), sp = f && f.kind === 'item-list' && dbxObj(f.list) ? f.list : null, out = []; if (!sp) return out;
    var take = function(s, col) { if (!dbxObj(s) || typeof s.key !== 'string' || !s.key) return; if (numOnly && (col || s.kind === 'pick')) return; out.push([s.key, typeof s.label === 'string' && s.label && s.label.toLowerCase() !== s.key.toLowerCase() ? s.label + ', ' + s.key : typeof s.label === 'string' && s.label ? s.label : s.key]); };
    (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(s) { take(s, false); });
    if (!numOnly) (Array.isArray(sp.cols) ? sp.cols : []).forEach(function(s) { take(s, true); });
    return out;
}
function dbxOpts(first, opts, val) {   // a select's choices, a value that is no choice now kept and said so
    var o = [first].concat(opts); if (typeof val === 'string' && val && !opts.some(function(x) { return x[0] === val; })) o.push([val, 'One that is gone']); return o;
}
function dbxPools() { return (draft.fields || []).filter(function(f) { return f && f.kind === 'resource'; }).map(function(f) { return [f.id, f.label || f.key || f.id]; }); }
function dbxLists() { return (draft.fields || []).filter(function(f) { return f && f.kind === 'item-list'; }).map(function(f) { return [f.id, f.label || f.key || f.id]; }); }
function dbxStr(v) { return typeof v === 'string' ? v : ''; }
function dbxTick(cls, on, text, title) { var l = el('label', 'sys-hover'), c = el('input', cls); c.type = 'checkbox'; c.checked = on === true; l.appendChild(c); l.appendChild(document.createTextNode(' ' + text)); l.title = title; return l; }
function dbxCap(row, text) { row.appendChild(el('span', 'sys-num-cap', text)); }
function dbxNum(cls, v, title, ph) { var n = el('input', 'field ' + cls); n.type = 'number'; n.min = '0'; n.max = '10'; n.step = 'any'; n.value = typeof v === 'number' && isFinite(v) ? String(v) : ''; n.title = title; if (ph) n.placeholder = ph; return n; }
function kindsNamed() { return typeof draft !== 'undefined' && !!draft && !!draft.combat && !!draft.combat.damage && Array.isArray(draft.combat.damage.kinds) && draft.combat.damage.kinds.length > 0; }   // 1.6.0: whether the draft names kinds of blow, so that the roll's Kind boxes come up
function dbxBtn(act, text, title, off) { var b = el('button', 'tool ghost sys-btn', text); b.dataset.act = act; b.title = title; if (off) b.disabled = true; return b; }
function damageBox(box, cm) {
    var d = dbxObj(cm.damage) ? cm.damage : {}, pools = dbxPools(), lists = dbxLists(), wrap = el('div', 'sys-dmgr');
    wrap.appendChild(el('div', 'sys-light-head', 'Taking damage'));
    wrap.appendChild(el('div', 'sys-note', 'How a hit is taken in the Take damage window. It goes through DR at the hit location, comes off a pool, and wears armor and weapons.'));
    var r1 = el('div', 'sys-flags sys-dmgr-top');
    dbxCap(r1, 'Wounds come off'); r1.appendChild(select('sys-dmgr-pool', dbxOpts(['', 'The pool Full auto damage comes off'], pools, d.pool), dbxStr(d.pool), 'The pool a wound comes off. Unset, the one Full auto damage is taken from'));
    dbxCap(r1, 'Taken first from'); r1.appendChild(select('sys-dmgr-first', dbxOpts(['', 'Nothing'], (draft.fields || []).filter(function(f) { return f && f.kind === 'number'; }).map(function(f) { return [f.id, f.label || f.key || f.id]; }).concat((draft.effects || []).filter(function(x) { return !!x && typeof x.id === 'string' && !!x.val; }).map(function(x) { return ['fx:' + x.id, (x.name || 'An effect') + ': its number']; })), d.first), dbxStr(d.first),   /* 1.6.2 (the CORE session): or an effect that holds a number, spent first and ending at 0 */ 'A number a wound to that pool comes off first, down to 0, as temporary hit points. The rest goes to the pool. A Major Wound and every rule after it read the whole wound, unless Not a wound is ticked'));   // 1.6.2 (temporary hit points)
    if (d.first) r1.appendChild(dbxTick('sys-dmgr-soak', d.firstSoaks === true, 'Not a wound', 'Ticked: what it takes is no wound. A Major Wound, the rows On a wound and the blow\u2019s wound read only what gets past it, and a blow it takes whole runs none of them. Unticked: they read the whole wound'));   // 1.6.2 (the CORE session)
    dbxCap(r1, 'Major Wound at'); var mj = input('sys-dmgr-major field', dbxStr(d.major), 'A wound this large or larger in one blow is a Major Wound. No dice. It may read the hit location as Hit. and a name, 0 where no location was struck', 'e.g. HP.max / 2'); mj.maxLength = LIMITS.formula; r1.appendChild(mj);
    dbxCap(r1, 'Wound by'); var wfI = input('sys-dmgr-woundf field', dbxStr(d.woundF), 'How large a wound is, worked out from what got through and the character\u2019s sheet, for every damage type. 0 is no wound. Empty: what gets through, times the type\u2019s multiplier', 'What gets through'); wfI.maxLength = LIMITS.formula; r1.appendChild(wfI);   // 1.6.2
    // 1.6.3 (Fulllion's rulings of 2026-11-20, lane B batch "damage"): A wound of 0 is read only where a Wound by formula gives 0, so the list stands only
    // while one is set, here or on a damage type, or while it is already set to does nothing, so a stored choice is never hidden. dbxShowSig says what
    // is drawn, so leaving a Wound by box draws the box again only where that changes
    if (dbxAnyWF(d) || d.zero === 'none') r1.appendChild(select('sys-dmgr-zero', [['', 'A wound of 0 still wears armor'], ['none', 'A wound of 0 does nothing']], d.zero === 'none' ? 'none' : '', 'When the wound formula gives 0 for damage that got through: armor layers still wear as for a hit, or nothing happens at all'));
    _dbxSig = dbxShowSig(d);
    dbxCap(r1, 'Called'); var mjw = input('sys-dmgr-mjword field', dbxStr(d.majorWord), 'What your game calls this step. The damage lines and the Take damage window say it in place of A Major Wound', 'A Major Wound'); mjw.maxLength = LIMITS.label; r1.appendChild(mjw);
    wrap.appendChild(r1);
    {   // 1.6.0 (B3): what a Major Wound does (kept by Save only beside its formula)
        var mjRows = majRowsOf(d.onMajor), mjMany = mjRows.length > 1;   // 1.6.0: onMajor's rows, the first whose where holds
        var fxs = (draft.effects || []).filter(function(e) { return dbxObj(e) && typeof e.id === 'string'; }).map(function(e) { return [e.id, e.name || e.id]; });
        var rls = (draft.rolls || []).filter(function(r) { return dbxObj(r) && typeof r.id === 'string'; }).map(function(r) { return [r.id, String(r.label || r.id).split('{')[0].trim() || r.id]; });
        var mjL = dbxObj(d.locs) && d.locs.list ? d.locs.list : '';
        (mjRows.length ? mjRows : [{}]).forEach(function(om, mi) { var rM = el('div', 'sys-flags sys-dmgr-onmajor'); rM.dataset.mi = String(mi);
        dbxCap(rM, 'A Major Wound switches on'); rM.appendChild(select('sys-dmgr-mjfx', dbxOpts(['', 'No effect'], fxs, om.fx), dbxStr(om.fx), 'An effect of the library a Major Wound switches on, as an apply action does'));
        dbxCap(rM, 'and asks for'); rM.appendChild(select('sys-dmgr-mjroll', dbxOpts(['', 'No roll'], rls, om.roll), dbxStr(om.roll), 'A roll of the system posted as a reminder to the wounded character\'s player, such as a roll to stay up. Rolled from its card, it reads the blow as Blow. and the location hit as Hit. and a name'));
        var mjL = dbxObj(d.locs) && d.locs.list ? d.locs.list : '';   // 1.6.0 (the core's gap 7): the location its failure cripples
        if (om.roll && mjL) { dbxCap(rM, 'its failure cripples'); rM.appendChild(select('sys-dmgr-mjcrip', dbxOpts(['', 'Nothing'], dbxKeys(mjL, true), om.crip), dbxStr(om.crip), 'Where that roll fails, the location hit gets how far it failed in this number stat, at least 1. A formula can read 1 or more as crippled, and 5 or more as severed')); }
        if (om.roll && mjL && om.crip) { var mjB = input('sys-dmgr-mjcripby field', dbxStr(om.cripBy), CRIP_BY_LINE, 'by, e.g. if(Natural = 18, max(5, Margin), Margin)'); mjB.maxLength = LIMITS.formula; rM.appendChild(mjB); }   // 1.6.0 (the core's ruling on gap 7)
        dbxCap(rM, 'where'); var mjW = input('sys-dmgr-mjif field', dbxStr(om.if), 'True for the Major Wounds this row does something on. Blank: every one. It reads the blow and the location hit as Any wound does. With more rows, the first that holds is the one', 'e.g. Hit.loc = 1'); mjW.maxLength = LIMITS.formula; rM.appendChild(mjW);   // 1.6.0
        if (om.roll && typeof crewPick === 'function') rM.appendChild(crewPick(om, function() { majWrite(d, mjRows); renderCombat(); }));   // 1.6.2 (fold (f))
        if (om.roll) rM.appendChild(dbxTick('sys-dmgr-mjasat', om.asAt === true, 'Its roll reads the sheet as it was here', 'Ticked: the roll it asks for is worked out on the sheet as it stood before this Major Wound\u2019s own effect and every Any wound row. So the roll a heavy hit asks for leaves out the Stunned of the same hit. Off: on the sheet as the whole blow left it'));   // 1.6.2
        if (mjMany) rM.appendChild(dbxBtn('dmgrmjdel', '\u00d7', 'Remove this row'));
        wrap.appendChild(rM); });
        wrap.appendChild(dbxBtn('dmgrmjadd', '+ Another Major Wound', mjRows.length >= DBX_LIM.onMajor ? 'At most ' + DBX_LIM.onMajor : 'Another row of what a Major Wound does, picked by where, such as a crippled limb on an arm and a stun on the head. The first row whose where holds is the one', mjRows.length >= DBX_LIM.onMajor));
        var ows = Array.isArray(d.onWound) ? d.onWound : [];   // 1.6.0 (the core's gap 6): what any wound does
        wrap.appendChild(el('span', 'sys-num-cap', 'Any wound'));
        ows.forEach(function(w0, i) {
            var w = dbxObj(w0) ? w0 : {}, rw = el('div', 'sys-flags sys-dmgr-onwound'); rw.dataset.oi = String(i);
            dbxCap(rw, 'Where'); var wif = input('sys-dmgr-oif field', dbxStr(w.if), 'True for the wounds this does something on. Blank: every wound. It reads the character, the blow as Blow.dmg, Blow.through, Blow.wound, Blow.type, Blow.kind and Blow.cuts, a second part\u2019s own Blow.type2 and Blow.wound2 (type3 to wound4 for a third and a fourth), and the location hit as Hit. and a name', 'e.g. Blow.wound >= HP.max / 3'); wif.maxLength = LIMITS.formula; rw.appendChild(wif);
            dbxCap(rw, 'switches on'); rw.appendChild(select('sys-dmgr-ofx', dbxOpts(['', 'No effect'], fxs, w.fx), dbxStr(w.fx), 'An effect of the library the wound switches on, as an apply action does'));
            dbxCap(rw, 'and asks for'); rw.appendChild(select('sys-dmgr-oroll', dbxOpts(['', 'No roll'], rls, w.roll), dbxStr(w.roll), 'A roll of the system posted as a reminder to the wounded character\'s player. Rolled from its card, it can read the blow and the location hit, such as a roll against shock made harder by the wound'));
            if (w.roll && mjL) { dbxCap(rw, 'its failure cripples'); rw.appendChild(select('sys-dmgr-ocrip', dbxOpts(['', 'Nothing'], dbxKeys(mjL, true), w.crip), dbxStr(w.crip), 'Where that roll fails, the location hit gets how far it failed in this number stat, at least 1')); }
            if (w.roll && typeof crewPick === 'function') rw.appendChild(crewPick(w, function() { renderCombat(); }));   // 1.6.2 (fold (f))
            var owA = dbxObj(w.add) ? w.add : {};   // 1.6.2: and adds a row, such as a bleeding wound, standing where the blow struck
            dbxCap(rw, 'adds a row to'); rw.appendChild(select('sys-dmgr-oalist', dbxOpts(['', 'No list'], dbxLists(), owA.list), dbxStr(owA.list), 'A list the wound adds a row to, such as Bleeding. Where its rows stand at a row of the hit locations\u2019 list, the new row stands at the location struck'));
            if (owA.list) { var oaE = typeof grantEntries === 'function' ? grantEntries() : []; dbxCap(rw, 'of'); rw.appendChild(select('sys-dmgr-oaent', dbxOpts(['', 'Pick an entry'], oaE, owA.entry), dbxStr(owA.entry), 'The entry the new row is, from the system\u2019s items or the library')); }
            if (w.roll && mjL && w.crip) { var owB = input('sys-dmgr-ocripby field', dbxStr(w.cripBy), CRIP_BY_LINE, 'by, e.g. Margin'); owB.maxLength = LIMITS.formula; rw.appendChild(owB); }   // 1.6.0 (the core's ruling on gap 7)
            var owH = dbxObj(w.held) ? w.held : {};   // 1.6.0: what stands where the blow lands
            dbxCap(rw, 'reads what stands there on'); rw.appendChild(select('sys-dmgr-ohlist', dbxOpts(['', 'No list'], dbxLists(), owH.list), dbxStr(owH.list), 'A list whose rows may stand at the struck location. Where then reads how many as Held.count'));
            if (owH.list) {
                dbxCap(rw, 'a row is there where'); var ohA = input('sys-dmgr-ohat field', dbxStr(owH.at), 'True for a row at the struck location. It reads the row as Row. and a name, the location hit as Hit. and a name, the blow as Blow. and a name, and the character', 'e.g. Row.Site = Hit.Site'); ohA.maxLength = LIMITS.formula; rw.appendChild(ohA);
                dbxCap(rw, 'and writes'); rw.appendChild(select('sys-dmgr-ohstat', dbxOpts(['', 'Nothing'], dbxKeys(owH.list, true), owH.stat), dbxStr(owH.stat), 'A number stat written on every row at the location. Pick nothing to read Held.count alone'));
                if (owH.stat) { var ohT = input('sys-dmgr-ohto field', dbxStr(owH.to), 'The figure written on each of those rows. It reads what Where reads, the row as Row. and a name, and Held.count', 'to, e.g. if(Blow.major, 2, 1)'); ohT.maxLength = LIMITS.formula; rw.appendChild(ohT); }
            }
            rw.appendChild(dbxTick('sys-dmgr-oany', w.any === true, 'Also with no wound', 'Ticked: this row also runs on a blow that lands but wounds nobody, as armor that stops the whole injury. Where then reads Blow.dmg, the damage rolled, and Blow.wound is 0. Off: only on a wound'));   // 1.6.2
            if (w.roll) rw.appendChild(dbxTick('sys-dmgr-oasat', w.asAt === true, 'Its roll reads the sheet as it was here', 'Ticked: the roll it asks for is worked out on the sheet as it stood when this row was reached, before this row\u2019s effect and any row below it. So a shock roll put above a Stunned row leaves out the Stunned of the same hit. Off: on the sheet as the whole blow left it'));   // 1.6.2
            rw.appendChild(dbxBtn('dmgrodel', '\u00d7', 'Remove this'));
            wrap.appendChild(rw);
        });
        wrap.appendChild(dbxBtn('dmgroadd', '+ On a wound', ows.length >= DBX_LIM.onWound ? 'At most ' + DBX_LIM.onWound : 'An effect switched on, or a roll asked for, on every wound or on those a formula picks: Stunned, a roll against shock, bleeding', ows.length >= DBX_LIM.onWound));
    }
    var lc = dbxObj(d.locs) ? d.locs : {}, r2 = el('div', 'sys-flags sys-dmgr-locs'), lkeys = dbxKeys(lc.list, false);
    dbxCap(r2, 'Hit locations'); r2.appendChild(select('sys-dmgr-loclist', dbxOpts(['', 'None'], lists, lc.list), dbxStr(lc.list), 'The item list whose rows are the places a hit can land'));
    if (lc.list) {
        dbxCap(r2, 'DR'); r2.appendChild(select('sys-dmgr-locdr', dbxOpts(['', 'No DR'], lkeys, lc.dr), dbxStr(lc.dr), 'The stat or column of that list that is the DR at a location. A column may read the kind and the type of the part of the blow it is judged for'));
        dbxCap(r2, 'Side'); r2.appendChild(select('sys-dmgr-locside', dbxOpts(['', 'No sides'], dbxKeys(lc.list, true), lc.side), dbxStr(lc.side), 'A number stat of that list naming each row’s side: 0 none, 1 left, 2 right. Rules can then read the side struck, and each side’s rows added up. The window names the side beside the location'));   // 1.6.0
        dbxCap(r2, 'Unaimed blows land at'); var lat = input('sys-dmgr-locat field', dbxStr(lc.at), 'Where a blow lands when nothing aimed it: the Take damage window opens on it, and a blast lands there. The usual one: a location named Torso, else the first', 'A location’s name'); lat.maxLength = 60; r2.appendChild(typeof entryPick === 'function' && typeof entryNames === 'function' ? entryPick(lat, dbxLocNames(lc.list), 'The usual one') : lat);   // 1.6.3 (finding 27; Fulllion: "A system setting"): picked by name among the list's entries, Another entry for one a pack holds; cleaned by damagecore cleanDamageRules as locs.at
        dbxCap(r2, 'Cripple above'); r2.appendChild(select('sys-dmgr-loccrip', dbxOpts(['', 'Never'], lkeys, lc.crip), dbxStr(lc.crip), 'The stat or column whose figure a wound must pass to cripple the location. 0 or unset never cripples'));
        dbxCap(r2, 'Vital where'); var vt = input('sys-dmgr-locvital field', dbxStr(lc.vital), 'True at a vital location. It reads the location row as Row', 'e.g. Row.loc = 8'); vt.maxLength = LIMITS.formula; r2.appendChild(vt);
        dbxCap(r2, 'Times there'); var lmx = input('sys-dmgr-locmult field', dbxStr(lc.mult), 'The location\u2019s own multiplier for a wound to the main pool, whatever the type. 0 for none. It reads the location row as Row and the character\u2019s own names', 'e.g. if(Row.loc = 1, 4, 0)'); lmx.maxLength = LIMITS.formula; r2.appendChild(lmx);   // 1.5.6: the skull's x4
        dbxCap(r2, 'A die there adds'); var ldi = input('sys-dmgr-locdie field', dbxStr(lc.die), 'Added to a wound that gets through here, for each die the blow rolled, whatever the type. It reads the location row as Row and the character\u2019s own names', 'e.g. if(Row.loc = 1, 1, 0)'); ldi.maxLength = LIMITS.formula; r2.appendChild(ldi);   // 1.6.0
    }
    wrap.appendChild(r2);
    var types = Array.isArray(d.types) ? d.types : [];
    wrap.appendChild(el('span', 'sys-num-cap', 'Damage types'));
    types.forEach(function(y0, i) {
        var y = dbxObj(y0) ? y0 : {}, tw = el('div', 'sys-dmgr-type'); tw.dataset.yi = String(i);
        var a = el('div', 'sys-flags');
        var k = input('sys-dmgr-ykey field', dbxStr(y.key), 'Its key: a letter, then letters, digits and _', 'Key'); k.maxLength = 24; if (y._new && k.dataset) k.dataset.follow = '1'; a.appendChild(k);   // 1.6.3: a new type's short name follows its name until it is saved
        var lb = input('sys-dmgr-ylabel field', dbxStr(y.label), 'Its name in the Take damage window', 'Name'); lb.maxLength = LIMITS.label; a.appendChild(lb);
        dbxCap(a, 'Times'); a.appendChild(dbxNum('sys-dmgr-ymult', y.mult, 'What gets through is multiplied by this, 0 to 10. Unset is 1', '1'));
        dbxCap(a, 'Vital times'); a.appendChild(dbxNum('sys-dmgr-yvital', y.vital, 'Its multiplier at a vital location. Unset or 0 is as anywhere', ''));
        dbxCap(a, 'Wound by'); var ywI = input('sys-dmgr-ywf field', dbxStr(y.woundF), 'This type\u2019s own wound formula, in place of the one under Taking damage. Empty: that one, or its multiplier where Its multiplier is ticked', 'As the system'); ywI.maxLength = LIMITS.formula; a.appendChild(ywI);   // 1.6.2
        if (!dbxStr(y.woundF) && (dbxStr(d.woundF).trim() || y.byMult === true)) a.appendChild(dbxTick('sys-dmgr-ybymult', y.byMult, 'Its multiplier', 'Ticked: this type wounds by its multiplier, not by the Wound by formula under Taking damage'));   // 1.6.3: it only ever overrides that formula, so it stands only while that formula does, or while it is ticked
        a.appendChild(select('sys-dmgr-ypool', dbxOpts(['', 'The main pool'], pools, y.pool), dbxStr(y.pool), 'The pool this type comes off, where not the main one'));
        a.appendChild(dbxTick('sys-dmgr-ynodr', y.noDr, 'Ignores DR', 'Ticked: DR stops none of it'));
        a.appendChild(dbxTick('sys-dmgr-ynowear', y.noWear, 'Wears nothing', 'Ticked: it wears no armor'));
        a.appendChild(dbxTick('sys-dmgr-ycuts', y.cuts, 'Cuts', 'Ticked: 20 or more over a weapon’s Dur destroys it'));
        a.appendChild(dbxBtn('dmgrydel', '×', 'Remove this type'));
        tw.appendChild(a);
        if (lc.list && lkeys.length) {
            var p = el('div', 'sys-flags sys-dmgr-plus'), pl = Array.isArray(y.plus) ? y.plus.map(function(x) { return String(x).toLowerCase(); }) : [];
            dbxCap(p, 'Adds to DR');
            lkeys.forEach(function(kv) { var t = dbxTick('sys-dmgr-yplus', pl.indexOf(kv[0].toLowerCase()) >= 0, kv[1], 'Ticked: this stat or column of the location is added to its DR against this type'); t.firstChild.dataset.k = kv[0]; p.appendChild(t); });
            tw.appendChild(p);
        }
        [dbxObj(y.alt) ? y.alt : {}].concat(dbxObj(y.alt) && Array.isArray(y.alts) ? y.alts : []).forEach(function(al, ak) {   // 1.6.2 (the CORE session): Instead, if, and Or else, if after it, the first that holds
            var b = el('div', 'sys-flags sys-dmgr-alt'); b.dataset.ai = String(ak);
            dbxCap(b, ak ? 'Or else, if' : 'Instead, if');
            var ai = input('sys-dmgr-aif field', dbxStr(al.if), ak ? 'Where the ones above do not hold and this does, the three after it take the place of the type’s own' : 'Where this holds for the character, the three after it take the place of the type’s own', 'e.g. Robot'); ai.maxLength = LIMITS.formula; b.appendChild(ai);
            b.appendChild(select('sys-dmgr-apool', dbxOpts(['', 'The same pool'], pools, al.pool), dbxStr(al.pool), 'The pool it comes off then'));
            dbxCap(b, 'Times'); b.appendChild(dbxNum('sys-dmgr-amult', al.mult, 'Its multiplier then. Unset is the type’s own', ''));
            b.appendChild(dbxTick('sys-dmgr-anowear', al.noWear, 'Wears nothing', 'Ticked: then it wears no armor'));
            if (ak) b.appendChild(dbxBtn('dmgraltdel', '×', 'Remove this alternative'));
            tw.appendChild(b);
        });
        if (dbxObj(y.alt) && y.alt.if && (Array.isArray(y.alts) ? y.alts.length : 0) < 3) tw.appendChild(dbxBtn('dmgraltnew', '+ Or else, if', 'Another case, asked where Instead, if does not hold, such as a vehicle\u2019s hull. The first that holds wins'));
        var dr = el('div', 'sys-flags sys-dmgr-die');   // 1.6.0: its figures a die, read with the dice the blow rolled
        dbxCap(dr, 'A die adds');
        DBX_DIE.forEach(function(g) { dbxCap(dr, g[2]); var n = dbxNum(g[0], y[g[1]], g[3], '0'); n.min = String(g[4]); dr.appendChild(n); });
        tw.appendChild(dr);
        wrap.appendChild(tw);
    });
    wrap.appendChild(dbxBtn('dmgryadd', '+ Type', types.length >= DBX_LIM.types ? 'At most ' + DBX_LIM.types : 'A kind of damage, such as cutting or heat', types.length >= DBX_LIM.types));
    var kindsD = Array.isArray(d.kinds) ? d.kinds : [];   // 1.6.0: the kinds of blow, named by the system as its types are
    wrap.appendChild(el('span', 'sys-num-cap', 'Kinds of blow'));
    kindsD.forEach(function(y0, i) {
        var y = dbxObj(y0) ? y0 : {}, kw = el('div', 'sys-flags sys-dmgr-kind'); kw.dataset.ki = String(i);
        var kk = input('sys-dmgr-kkey field', dbxStr(y.key), 'Its key: a letter, then letters, digits and _. A formula reads its place as Kind. and this key', 'Key'); kk.maxLength = 24; if (y._new && kk.dataset) kk.dataset.follow = '1'; kw.appendChild(kk);   // 1.6.3: a new kind's short name follows its name until it is saved
        var kl = input('sys-dmgr-klabel field', dbxStr(y.label), 'Its name in the Take damage window', 'Name'); kl.maxLength = LIMITS.label; kw.appendChild(kl);
        kw.appendChild(dbxBtn('dmgrkdel', '\u00d7', 'Remove this kind'));
        wrap.appendChild(kw);
    });
    wrap.appendChild(dbxBtn('dmgrkadd', '+ Kind', kindsD.length >= DBX_LIM.kinds ? 'At most ' + DBX_LIM.kinds : 'A kind of blow of your game. DR at a location and a layer can stop one kind and not another', kindsD.length >= DBX_LIM.kinds));
    var lys = Array.isArray(d.layers) ? d.layers : [];
    wrap.appendChild(el('span', 'sys-num-cap', 'What wears'));
    lys.forEach(function(l0, i) {
        var l = dbxObj(l0) ? l0 : {}, rw = el('div', 'sys-flags sys-dmgr-layer'); rw.dataset.li = String(i);
        rw.appendChild(select('sys-dmgr-llist', dbxOpts(['', 'Pick a list'], lists, l.list), dbxStr(l.list), 'A list whose rows wear when a hit gets through. Only rows switched on count, where it has a switch'));
        var at = input('sys-dmgr-lat field', dbxStr(l.at), 'The row’s listed figure at the hit location. It reads the row as Row and the location as Hit. It is read for each part of a blow, with that part’s own Blow.kind and Blow.type. A part it gives 0 or less for passes this layer by', 'Figure, e.g. Row.DR'); at.maxLength = LIMITS.formula; rw.appendChild(at);
        dbxCap(rw, 'Worn in'); rw.appendChild(select('sys-dmgr-lwear', dbxOpts(['', 'Pick a stat'], dbxKeys(l.list, true), l.wear), dbxStr(l.wear), 'The number stat of that list that holds how much has worn off'));
        rw.appendChild(dbxBtn('dmgrldel', '×', 'Remove this'));
        wrap.appendChild(rw);
        var nkL = dbxKeys(l.list, true);
        if (l.list && nkL.length && l.whole !== true) {   // 1.6.0: the stat it wears picked by where the blow lands (one stat where it is Every location)
            var wh = el('div', 'sys-flags sys-dmgr-layer sys-dmgr-lwhere'), wl = (Array.isArray(l.wears) ? l.wears : []).map(function(x) { return String(x).toLowerCase(); }); wh.dataset.li = String(i);
            dbxCap(wh, 'Or by location');
            var pk = input('sys-dmgr-lpick field', dbxStr(l.pick), 'Which ticked stat wears where the blow lands: 1 for the first ticked, in the list\u2019s order. It reads the row as Row and the location as Hit. Any other figure wears Worn in', 'e.g. Hit.loc'); pk.maxLength = LIMITS.formula; wh.appendChild(pk);
            nkL.forEach(function(kv) { var tk = dbxTick('sys-dmgr-lwears', wl.indexOf(kv[0].toLowerCase()) >= 0, kv[1], 'Ticked: one of the stats this layer may wear, picked by the location'); tk.firstChild.dataset.k = kv[0]; wh.appendChild(tk); });
            wrap.appendChild(wh);
        }
        if (l.list) {   // 1.6.0: what a hit wears, by formula (systemcore layerStep)
            var ww = el('div', 'sys-flags sys-dmgr-layer sys-dmgr-lwearby'); ww.dataset.li = String(i);
            dbxCap(ww, 'Wears on a hit'); var hw = input('sys-dmgr-lhitw field', dbxStr(l.hitWear), 'What an injuring hit that is no Major Wound wears off this layer while it is not broken there. Empty: 1. It reads Row, Hit, Listed, Worn, ToDestroy, the blow and the character', 'e.g. ceil(Blow.wound / 2)'); hw.maxLength = LIMITS.formula; ww.appendChild(hw);
            dbxCap(ww, 'Wears on a Major Wound'); var mw = input('sys-dmgr-lmajw field', dbxStr(l.majorWear), 'What a Major Wound wears off this layer. Empty: a quarter of its figure, rounded up. It reads Row, Hit, Listed (its figure there), Worn (what has worn off), ToDestroy, and the blow: Blow.dmg, Blow.through, Blow.wound, Blow.type and Blow.cuts', 'e.g. ceil(Listed / 4)'); mw.maxLength = LIMITS.formula; ww.appendChild(mw);
            dbxCap(ww, 'Once broken, a hit'); var bw = input('sys-dmgr-lbrkw field', dbxStr(l.brokenWear), 'What an injuring hit wears once this layer is broken there (its figure used up). Empty: 1. ToDestroy destroys the piece', 'e.g. 1'); bw.maxLength = LIMITS.formula; ww.appendChild(bw);
            dbxCap(ww, 'Wears at most'); var wc = input('sys-dmgr-lwcap field', dbxStr(l.wearCap), 'The most wear this layer may hold there, where it is destroyed. Empty: twice its figure, so it wears to minus its figure. It reads what the boxes beside it read', 'e.g. Listed + 2 * Row.Dur'); wc.maxLength = LIMITS.formula; ww.appendChild(wc);
            dbxCap(ww, 'Its own divisor'); var adw = input('sys-dmgr-ladby field', dbxStr(l.adBy), 'How the blow\u2019s armor divisor applies to what this layer gives the DR where it struck: 1 ignores it, Divisor / 2 halves it. Empty: as the rest of the DR', 'e.g. 1'); adw.maxLength = LIMITS.formula; ww.appendChild(adw);   // 1.6.2 (the CORE session, 9)
            dbxCap(ww, 'and a Major Wound'); var bm = input('sys-dmgr-lbrkm field', dbxStr(l.brokenMajorWear), 'What a Major Wound wears once this layer is broken there. Empty: as on a Major Wound above', 'e.g. ceil(Row.Dur / 4)'); bm.maxLength = LIMITS.formula; ww.appendChild(bm);
            ww.appendChild(dbxTick('sys-dmgr-lwhole', l.whole === true, 'Every location', 'Ticked: one figure and one wear stat wherever a blow lands, as a worn field. It wears when a part it stands against takes the main pool, whether or not the damage beat its figure, and a blow with no location wears it too. At its figure it is down, unless Wears at most says otherwise'));   // 1.6.0
            if (l.whole === true) ww.appendChild(dbxTick('sys-dmgr-lpoolany', l.anyPool === true, 'Any pool', 'A part it stands against wears it whichever pool that part took, not only the main pool. A type ticked as wearing nothing still wears nothing'));   // 1.6.0
            if ((draft.fields || []).some(function(f) { return f && f.id === l.list && dbxObj(f.list) && dbxObj(f.list.on); })) ww.appendChild(dbxTick('sys-dmgr-lany', l.anyRow === true, 'Every row', 'Ticked: this layer wears every row of its list, switched on or not. Off: only the rows switched on, as a worn piece of armor is. For a list whose switch means something else, as a location the GM marks by hand.'));   // 1.6.0
            wrap.appendChild(ww);
        }
        if (l.list && nkL.length) {   // 1.6.0: what a row adds against one damage type (systemcore typedAdd)
            var tyL = dbxObj(l.typed) ? l.typed : {}, tw = el('div', 'sys-flags sys-dmgr-layer sys-dmgr-ltyped'); tw.dataset.li = String(i);
            dbxCap(tw, 'Type named by'); tw.appendChild(select('sys-dmgr-ltstat', dbxOpts(['', 'Any type'], nkL, tyL.stat), dbxStr(tyL.stat), 'A number stat of the row that names a damage type by its place in your list, 1 the first and 0 none. For a part of that type the row adds to the DR at the location. On Any type, the rule decides for each part by its type'));
            dbxCap(tw, 'adds'); var tp = input('sys-dmgr-ltplus field', dbxStr(tyL.plus), 'What the row adds to the DR at the location for a part of that type. It never wears, and it stops once the row is broken there. It reads Row, Hit, Listed, Worn, the blow and the character', 'e.g. 1'); tp.maxLength = LIMITS.formula; tw.appendChild(tp);
            wrap.appendChild(tw);
        }
    });
    wrap.appendChild(dbxBtn('dmgrladd', '+ Layer', lys.length >= DBX_LIM.layers ? 'At most ' + DBX_LIM.layers : 'Armor or clothing that wears where a hit gets through', lys.length >= DBX_LIM.layers));
    var wps = Array.isArray(d.weapons) ? d.weapons : [];
    wrap.appendChild(el('span', 'sys-num-cap', 'Weapons a blow tests'));
    wps.forEach(function(w0, i) {
        var w = dbxObj(w0) ? w0 : {}, rw = el('div', 'sys-flags sys-dmgr-weapon'), nk = dbxKeys(w.list, true); rw.dataset.wi = String(i);
        rw.appendChild(select('sys-dmgr-wlist', dbxOpts(['', 'Pick a list'], lists, w.list), dbxStr(w.list), 'A list of weapons a blow may test'));
        var du = input('sys-dmgr-wdur field', dbxStr(w.dur), 'The weapon’s listed Dur. It reads the row as Row', 'Dur, e.g. Row.dur'); du.maxLength = LIMITS.formula; rw.appendChild(du);
        dbxCap(rw, 'Called'); var wwd = input('sys-dmgr-wword field', dbxStr(w.word), 'What the damage line calls this weapon’s durability, such as Dur. The Take damage window says it too. It must be filled in', 'Dur'); wwd.maxLength = LIMITS.label; rw.appendChild(wwd);   // 1.6.3 (Fulllion, 2026-11-20): a required box, said under the box when empty
        dbxCap(rw, 'Worn in'); rw.appendChild(select('sys-dmgr-wwear', dbxOpts(['', 'Pick a stat'], nk, w.wear), dbxStr(w.wear), 'The number stat that holds the Dur worn off'));
        dbxCap(rw, 'Condition in'); rw.appendChild(select('sys-dmgr-wcond', dbxOpts(['', 'Pick a stat'], nk, w.cond), dbxStr(w.cond), 'The number stat that holds its condition: 0 Fine, 1 Damaged, 2 Broken, 3 Destroyed'));
        var wt = el('span', 'sys-dmgr-wpair'), wh = el('span', 'sys-dmgr-wpair');   // a caption and its list wrap together
        dbxCap(wt, 'A blow tests'); wt.appendChild(select('sys-dmgr-wtest', [['', 'The Dur left'], ['listed', 'Its listed Dur']], w.test === 'listed' ? 'listed' : '', 'What a blow must beat: the Dur left after wear, or the weapon\u2019s listed Dur, worn or not')); rw.appendChild(wt);
        dbxCap(wh, 'A heavy blow'); wh.appendChild(select('sys-dmgr-wheavy', [['', 'A condition down'], ['zero', 'Down to 0 left']], w.heavy === 'zero' ? 'zero' : '', 'A blow 11 or more over: a condition down, or the Dur left taken to 0, then 1 a blow down to minus its listed Dur')); rw.appendChild(wh);
        rw.appendChild(dbxBtn('dmgrwdel', '×', 'Remove this'));
        wrap.appendChild(rw);
    });
    wrap.appendChild(dbxBtn('dmgrwadd', '+ Weapon', wps.length >= DBX_LIM.weapons ? 'At most ' + DBX_LIM.weapons : 'A list of weapons whose Dur a blow tests', wps.length >= DBX_LIM.weapons));
    var err = errorCell('damage'); err.dataset.errFor = 'damage'; wrap.appendChild(err);
    box.appendChild(wrap);
}
// 1.6.3 (Fulllion's ruling of 2026-11-20, "it makes sense to have fields be required when other fields depend on them"): the word a new weapon
// rule's Called box starts with. Where its Dur formula reads one stat or column of its list (Row.<key>), that stat's or column's label, else
// Durability. A new rule carries the mark _new (which the cleaner never keeps), and while it does the box follows the Dur and the list as they
// are picked; once the Called box itself is typed in, the mark goes and the word stays as typed. The core reads a saved rule the same way
// when it has no word at all (the damage step's own reader of that word)
function dbxWordOf(w) {
    var m = dbxObj(w) && typeof w.dur === 'string' ? /^\s*Row\.([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(w.dur) : null, f = m ? dbxField(w.list) : null, sp = f && dbxObj(f.list) ? f.list : null;
    var hit = sp ? (Array.isArray(sp.stats) ? sp.stats : []).concat(Array.isArray(sp.cols) ? sp.cols : []).filter(function(s) { return dbxObj(s) && typeof s.key === 'string' && s.key.toLowerCase() === m[1].toLowerCase(); })[0] : null;
    var lb = hit && typeof hit.label === 'string' ? hit.label.trim() : '';
    return lb ? lb.slice(0, LIMITS.label) : 'Durability';
}
function dbxWordFollow(w, t) {   // a new rule's Called box follows its Dur and its list, in the draft and in the row's own box (t: a control of that row)
    if (!dbxObj(w) || !w._new) return; w.word = dbxWordOf(w);
    var rw = t && t.closest ? t.closest('.sys-dmgr-weapon') : null, bx = rw && rw.querySelector ? rw.querySelector('.sys-dmgr-wword') : null; if (bx) bx.value = w.word;
}
// 1.6.3 (Fulllion's rulings of 2026-11-20, lane B batch "damage"): a damage type's and a kind of blow's Name is required, since players read it in the
// damage lines and the Take damage window, and with none the cleaner shows the short name there. So a new one starts named, Damage type 2 or Kind 2
// with its short name made from that name (DamageType2), at the first number that no row of the list already names or holds as its short name. It
// carries the mark _new (which the cleaner never keeps), and while it does its hidden short name follows the Name as it is typed
function dbxNewNamed(arr, word) {
    var taken = {}; (Array.isArray(arr) ? arr : []).forEach(function(y) { if (!dbxObj(y)) return; if (typeof y.key === 'string') taken['k' + y.key.toLowerCase()] = 1; if (typeof y.label === 'string') taken['l' + y.label.trim().toLowerCase()] = 1; });
    for (var n = (Array.isArray(arr) ? arr.length : 0) + 1; n < 100000; n++) {
        var lb = word + ' ' + n, ky = lb.split(' ').map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join('');
        if (!taken['k' + ky.toLowerCase()] && !taken['l' + lb.toLowerCase()]) return { key: ky, label: lb, _new: true };
    }
    return { key: '', label: '' };
}
// 1.6.3: whether a Wound by formula stands, under Taking damage or on any damage type. A wound of 0 and Its multiplier count only beside one
function dbxAnyWF(d) { return dbxObj(d) && (!!dbxStr(d.woundF).trim() || (Array.isArray(d.types) ? d.types : []).some(function(y) { return dbxObj(y) && !!dbxStr(y.woundF).trim(); })); }
// 1.6.3: what the Taking damage box draws by its Wound by formulas: the A wound of 0 list, and each type's Its multiplier tick. damageBox notes it as it
// draws, and leaving a Wound by box draws the box again only where this has changed, so a press elsewhere is never lost to a redraw it did not need
var _dbxSig = '';
function dbxShowSig(d) {
    if (!dbxObj(d)) return '';
    return (dbxAnyWF(d) || d.zero === 'none' ? 'z' : '-') + (Array.isArray(d.types) ? d.types : []).map(function(y) { return dbxObj(y) && !dbxStr(y.woundF) && (dbxStr(d.woundF).trim() || y.byMult === true) ? 'm' : '-'; }).join('');
}
function dbxRow(t, cls, key, arrKey) {   // the draft's row a control stands in, by its row's index
    var rw = t.closest ? t.closest('.' + cls) : null, i = rw ? Number(rw.dataset[key]) : -1, d = dbxCm().damage, arr = dbxObj(d) && Array.isArray(d[arrKey]) ? d[arrKey] : [];
    return i >= 0 && i < arr.length && Math.floor(i) === i && dbxObj(arr[i]) ? arr[i] : null;
}
// 1.6.3: a short name typed by hand (the box stands only under Short names) stops following the Name. The follow itself writes the box from the Name
// box, which then holds the focus, so only a box that holds the focus as it changes was typed in
function dbxKeyTyped(y, t) { if (typeof document !== 'undefined' && document.activeElement === t) { delete y._new; if (t.dataset) delete t.dataset.follow; } }
function dbxSet(o, k, v) { if (v === '' || v === undefined || v === null || v === false) delete o[k]; else o[k] = v; }
function dbxNumOf(t) { var s = String(t.value === undefined ? '' : t.value).trim(), n = Number(s); return s && isFinite(n) ? n : undefined; }
function onDamageInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-dmgr-') < 0) return false;
    var txt = String(t.value === undefined ? '' : t.value).slice(0, LIMITS.formula);
    if (dbxHas(c, 'sys-dmgr-major')) { dbxSet(dbxDraft(), 'major', txt.trim() ? txt : ''); dbxTidy(); }
    else if (dbxHas(c, 'sys-dmgr-woundf')) { dbxSet(dbxDraft(), 'woundF', txt.trim() ? txt : ''); dbxTidy(); }   // 1.6.2
    else if (dbxHas(c, 'sys-dmgr-ywf')) { var yW = dbxRow(t, 'sys-dmgr-type', 'yi', 'types'); if (!yW) return true; dbxSet(yW, 'woundF', txt.trim() ? txt : ''); if (txt.trim()) delete yW.byMult; }
    if (dbxHas(c, 'sys-dmgr-mjword')) { dbxSet(dbxDraft(), 'majorWord', txt.trim() ? txt : ''); dbxTidy(); }
    else if (dbxHas(c, 'sys-dmgr-locvital')) { var d = dbxDraft(); if (!dbxObj(d.locs)) return true; dbxSet(d.locs, 'vital', txt.trim() ? txt : ''); }
    else if (dbxHas(c, 'sys-dmgr-locmult')) { var dM = dbxDraft(); if (!dbxObj(dM.locs)) return true; dbxSet(dM.locs, 'mult', txt.trim() ? txt : ''); }
    else if (dbxHas(c, 'sys-dmgr-locdie')) { var dD = dbxDraft(); if (!dbxObj(dD.locs)) return true; dbxSet(dD.locs, 'die', txt.trim() ? txt : ''); }   // 1.6.0
    else if (dbxHas(c, 'sys-dmgr-locat')) { var dA = dbxDraft(); if (!dbxObj(dA.locs)) return true; dbxSet(dA.locs, 'at', txt.trim().slice(0, 60)); }   // 1.6.3 (finding 27): Unaimed blows land at, a location's name or entry key
    else if (dbxHas(c, 'sys-dmgr-mjcripby')) { var dB = majAt(t); if (!dB || !dB.row.crip) return true; dbxSet(dB.row, 'cripBy', txt.trim() ? txt : ''); majWrite(dB.d, dB.rows); }   // 1.6.0 (the core's ruling on gap 7)
    else if (dbxHas(c, 'sys-dmgr-mjif')) { var dW = majAt(t); if (!dW) return true; dbxSet(dW.row, 'if', txt.trim() ? txt : ''); majWrite(dW.d, dW.rows); }   // 1.6.0: a Major Wound row's where
    else if (dbxHas(c, 'sys-dmgr-ocripby')) { var oB = dbxRow(t, 'sys-dmgr-onwound', 'oi', 'onWound'); if (!oB) return true; dbxSet(oB, 'cripBy', txt.trim() ? txt : ''); }
    else if (dbxHas(c, 'sys-dmgr-ohat') || dbxHas(c, 'sys-dmgr-ohto')) { var oHt = dbxRow(t, 'sys-dmgr-onwound', 'oi', 'onWound'); if (!oHt || !dbxObj(oHt.held)) return true; dbxSet(oHt.held, dbxHas(c, 'sys-dmgr-ohat') ? 'at' : 'to', txt.trim() ? txt : ''); }   // 1.6.0: what stands where the blow lands
    else if (dbxHas(c, 'sys-dmgr-oif')) { var oI = dbxRow(t, 'sys-dmgr-onwound', 'oi', 'onWound'); if (!oI) return true; dbxSet(oI, 'if', txt.trim() ? txt : ''); }   // 1.6.0 (the core's gap 6)
    else if (DBX_DIE.some(function(g) { return dbxHas(c, g[0]); })) { var yD = dbxRow(t, 'sys-dmgr-type', 'yi', 'types'); if (!yD) return true; DBX_DIE.forEach(function(g) { if (dbxHas(c, g[0])) dbxSet(yD, g[1], dbxNumOf(t)); }); }   // 1.6.0: a figure a die
    else if (dbxHas(c, 'sys-dmgr-kkey') || dbxHas(c, 'sys-dmgr-klabel')) { var kR = dbxRow(t, 'sys-dmgr-kind', 'ki', 'kinds'); if (!kR) return true; if (dbxHas(c, 'sys-dmgr-kkey')) { kR.key = txt.slice(0, 24); dbxKeyTyped(kR, t); } else dbxSet(kR, 'label', txt.slice(0, LIMITS.label)); }   // 1.6.0: a kind of blow
    else if (dbxHas(c, 'sys-dmgr-lpick')) { var lP = dbxRow(t, 'sys-dmgr-layer', 'li', 'layers'); if (!lP) return true; dbxSet(lP, 'pick', txt.trim() ? txt : ''); }   // 1.6.0
    else if (dbxHas(c, 'sys-dmgr-ltplus')) { var lY = dbxRow(t, 'sys-dmgr-layer', 'li', 'layers'); if (!lY) return true; var tyI = dbxObj(lY.typed) ? lY.typed : (lY.typed = {}); dbxSet(tyI, 'plus', txt.trim() ? txt : ''); if (!Object.keys(tyI).length) delete lY.typed; }   // 1.6.0: Type named by
    else if (dbxHas(c, 'sys-dmgr-ladby')) { var lA = dbxRow(t, 'sys-dmgr-layer', 'li', 'layers'); if (!lA) return true; dbxSet(lA, 'adBy', txt.trim() ? txt : ''); }   // 1.6.2 (9)
    else if (dbxHas(c, 'sys-dmgr-lmajw') || dbxHas(c, 'sys-dmgr-lbrkw') || dbxHas(c, 'sys-dmgr-lbrkm') || dbxHas(c, 'sys-dmgr-lwcap') || dbxHas(c, 'sys-dmgr-lhitw')) { var lQ = dbxRow(t, 'sys-dmgr-layer', 'li', 'layers'); if (!lQ) return true; dbxSet(lQ, dbxHas(c, 'sys-dmgr-lhitw') ? 'hitWear' : dbxHas(c, 'sys-dmgr-lmajw') ? 'majorWear' : dbxHas(c, 'sys-dmgr-lbrkw') ? 'brokenWear' : dbxHas(c, 'sys-dmgr-lwcap') ? 'wearCap' : 'brokenMajorWear', txt.trim() ? txt : ''); }   // 1.6.0: what a hit wears
    else if (dbxHas(c, 'sys-dmgr-ykey') || dbxHas(c, 'sys-dmgr-ylabel') || dbxHas(c, 'sys-dmgr-ymult') || dbxHas(c, 'sys-dmgr-yvital') || dbxHas(c, 'sys-dmgr-aif') || dbxHas(c, 'sys-dmgr-amult')) {
        var y = dbxRow(t, 'sys-dmgr-type', 'yi', 'types'); if (!y) return true;
        if (dbxHas(c, 'sys-dmgr-ykey')) { y.key = txt.slice(0, 24); dbxKeyTyped(y, t); }
        else if (dbxHas(c, 'sys-dmgr-ylabel')) dbxSet(y, 'label', txt.slice(0, LIMITS.label));
        else if (dbxHas(c, 'sys-dmgr-ymult')) dbxSet(y, 'mult', dbxNumOf(t));
        else if (dbxHas(c, 'sys-dmgr-yvital')) dbxSet(y, 'vital', dbxNumOf(t));
        else { var al = dbxAltOf(y, t); if (!al) return true; if (dbxHas(c, 'sys-dmgr-aif')) dbxSet(al, 'if', txt.trim() ? txt : ''); else dbxSet(al, 'mult', dbxNumOf(t)); dbxAltTidy(y); }
    } else if (dbxHas(c, 'sys-dmgr-lat')) { var l = dbxRow(t, 'sys-dmgr-layer', 'li', 'layers'); if (!l) return true; dbxSet(l, 'at', txt.trim() ? txt : ''); }
    else if (dbxHas(c, 'sys-dmgr-wdur')) { var w = dbxRow(t, 'sys-dmgr-weapon', 'wi', 'weapons'); if (!w) return true; dbxSet(w, 'dur', txt.trim() ? txt : ''); dbxWordFollow(w, t); }
    else if (dbxHas(c, 'sys-dmgr-wword')) { var wW = dbxRow(t, 'sys-dmgr-weapon', 'wi', 'weapons'); if (!wW) return true; delete wW._new; dbxSet(wW, 'word', txt.trim() ? txt.slice(0, LIMITS.label) : ''); }   // 1.6.3: what the damage line calls its durability; typed, it no longer follows the Dur
    else return true;   // a select or a tick: its change event does the work
    markDirty(); patchErrors(); return true;
}
function onDamageChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-dmgr-') < 0) return false;
    var v = typeof t.value === 'string' ? t.value : '', on = t.checked === true, redraw = false;
    if (dbxHas(c, 'sys-dmgr-pool')) { dbxSet(dbxDraft(), 'pool', v); dbxTidy(); }
    if (dbxHas(c, 'sys-dmgr-first')) { dbxSet(dbxDraft(), 'first', v); if (!v) delete dbxDraft().firstSoaks; dbxTidy(); redraw = true; }   // 1.6.2 (temporary hit points)
    else if (dbxHas(c, 'sys-dmgr-soak')) { dbxSet(dbxDraft(), 'firstSoaks', on); }   // 1.6.2 (the CORE session): what it takes is no wound
    else if (dbxHas(c, 'sys-dmgr-zero')) { dbxSet(dbxDraft(), 'zero', v); }   // 1.6.2
    else if (dbxHas(c, 'sys-dmgr-ybymult')) { var yB = dbxRow(t, 'sys-dmgr-type', 'yi', 'types'); if (!yB) return true; dbxSet(yB, 'byMult', on); }
    else if (dbxHas(c, 'sys-dmgr-mjfx') || dbxHas(c, 'sys-dmgr-mjroll') || dbxHas(c, 'sys-dmgr-mjcrip')) { var mJ = majAt(t); if (!mJ) return true; var oJ = mJ.row; dbxSet(oJ, dbxHas(c, 'sys-dmgr-mjfx') ? 'fx' : dbxHas(c, 'sys-dmgr-mjroll') ? 'roll' : 'crip', v); if (!oJ.roll) delete oJ.crip; if (!oJ.crip) delete oJ.cripBy; majWrite(mJ.d, mJ.rows); redraw = dbxHas(c, 'sys-dmgr-mjroll') || dbxHas(c, 'sys-dmgr-mjcrip'); }   // 1.6.0 (B3)   // 1.6.0 (the core's gap 7): its failure cripples
    else if (dbxHas(c, 'sys-dmgr-ohlist') || dbxHas(c, 'sys-dmgr-ohstat')) { var oHl = dbxRow(t, 'sys-dmgr-onwound', 'oi', 'onWound'); if (!oHl) return true; if (dbxHas(c, 'sys-dmgr-ohlist')) { if (v) { var oHk = dbxObj(oHl.held) ? oHl.held : {}; if (oHk.list !== v) { delete oHk.stat; delete oHk.to; } oHk.list = v; oHl.held = oHk; } else delete oHl.held; } else if (dbxObj(oHl.held)) { dbxSet(oHl.held, 'stat', v); if (!v) delete oHl.held.to; } redraw = true; }   // 1.6.0: what stands where the blow lands
    else if (dbxHas(c, 'sys-dmgr-oalist') || dbxHas(c, 'sys-dmgr-oaent')) { var oA = dbxRow(t, 'sys-dmgr-onwound', 'oi', 'onWound'); if (!oA) return true; if (dbxHas(c, 'sys-dmgr-oalist')) { if (v) oA.add = { list: v }; else delete oA.add; } else { if (!dbxObj(oA.add)) return true; dbxSet(oA.add, 'entry', v); } redraw = true; }   // 1.6.2: a wound adds a row
    else if (dbxHas(c, 'sys-dmgr-ofx') || dbxHas(c, 'sys-dmgr-oroll') || dbxHas(c, 'sys-dmgr-ocrip')) { var oC = dbxRow(t, 'sys-dmgr-onwound', 'oi', 'onWound'); if (!oC) return true; dbxSet(oC, dbxHas(c, 'sys-dmgr-ofx') ? 'fx' : dbxHas(c, 'sys-dmgr-oroll') ? 'roll' : 'crip', v); if (!oC.roll) delete oC.crip; if (!oC.crip) delete oC.cripBy; redraw = dbxHas(c, 'sys-dmgr-oroll') || dbxHas(c, 'sys-dmgr-ocrip'); }   // 1.6.0 (the core's gap 6)
    else if (dbxHas(c, 'sys-dmgr-loclist')) {   // another list: its DR, its cripple key and every type's typed DR belonged to the old one
        var d = dbxDraft(), was = dbxObj(d.locs) ? d.locs : {};
        if (!v) delete d.locs; else if (was.list !== v) { d.locs = { list: v }; if (was.vital) d.locs.vital = was.vital; (Array.isArray(d.types) ? d.types : []).forEach(function(y) { if (dbxObj(y)) delete y.plus; }); }
        dbxTidy(); redraw = true;
    } else if (dbxHas(c, 'sys-dmgr-locdr') || dbxHas(c, 'sys-dmgr-loccrip') || dbxHas(c, 'sys-dmgr-locside')) { var dl = dbxDraft(); if (!dbxObj(dl.locs)) return true; dbxSet(dl.locs, dbxHas(c, 'sys-dmgr-locdr') ? 'dr' : dbxHas(c, 'sys-dmgr-locside') ? 'side' : 'crip', v); }
    else if (dbxHas(c, 'sys-dmgr-ypool') || dbxHas(c, 'sys-dmgr-ynodr') || dbxHas(c, 'sys-dmgr-ynowear') || dbxHas(c, 'sys-dmgr-ycuts') || dbxHas(c, 'sys-dmgr-yplus') || dbxHas(c, 'sys-dmgr-apool') || dbxHas(c, 'sys-dmgr-anowear')) {
        var y = dbxRow(t, 'sys-dmgr-type', 'yi', 'types'); if (!y) return true;
        if (dbxHas(c, 'sys-dmgr-ypool')) dbxSet(y, 'pool', v);
        else if (dbxHas(c, 'sys-dmgr-ynodr')) dbxSet(y, 'noDr', on);
        else if (dbxHas(c, 'sys-dmgr-ynowear')) dbxSet(y, 'noWear', on);
        else if (dbxHas(c, 'sys-dmgr-ycuts')) dbxSet(y, 'cuts', on);
        else if (dbxHas(c, 'sys-dmgr-yplus')) {
            var k = t.dataset && typeof t.dataset.k === 'string' ? t.dataset.k : ''; if (!k) return true;
            var pl = (Array.isArray(y.plus) ? y.plus : []).filter(function(x) { return typeof x === 'string' && x.toLowerCase() !== k.toLowerCase(); }); if (on) pl.push(k);
            if (pl.length) y.plus = pl; else delete y.plus;
        } else { var al = dbxAltOf(y, t); if (!al) return true; if (dbxHas(c, 'sys-dmgr-apool')) dbxSet(al, 'pool', v); else dbxSet(al, 'noWear', on); dbxAltTidy(y); }
    } else if (dbxHas(c, 'sys-dmgr-llist') || dbxHas(c, 'sys-dmgr-lwear')) {
        var l = dbxRow(t, 'sys-dmgr-layer', 'li', 'layers'); if (!l) return true;
        if (dbxHas(c, 'sys-dmgr-llist')) { if (l.list !== v) { delete l.wear; delete l.wears; delete l.typed; } dbxSet(l, 'list', v); redraw = true; } else dbxSet(l, 'wear', v);
    } else if (dbxHas(c, 'sys-dmgr-ltstat')) {   // 1.6.0: Type named by
        var lY = dbxRow(t, 'sys-dmgr-layer', 'li', 'layers'); if (!lY) return true; var tyC = dbxObj(lY.typed) ? lY.typed : (lY.typed = {}); dbxSet(tyC, 'stat', v); if (!Object.keys(tyC).length) delete lY.typed;
    } else if (dbxHas(c, 'sys-dmgr-lwhole')) {   // 1.6.0: Every location: one stat, so what wears by location goes
        var lO = dbxRow(t, 'sys-dmgr-layer', 'li', 'layers'); if (!lO) return true; if (on) { lO.whole = true; delete lO.wears; delete lO.pick; } else { delete lO.whole; delete lO.anyPool; } redraw = true;
    } else if (dbxHas(c, 'sys-dmgr-lpoolany')) {   // 1.6.0: Any pool
        var lPa = dbxRow(t, 'sys-dmgr-layer', 'li', 'layers'); if (!lPa) return true; if (on) lPa.anyPool = true; else delete lPa.anyPool;
    } else if (dbxHas(c, 'sys-dmgr-mjasat')) {   // 1.6.2: a Major Wound row's roll on the sheet as it stood there
        var mA = majAt(t); if (!mA) return true; if (on) mA.row.asAt = true; else delete mA.row.asAt; majWrite(mA.d, mA.rows);
    } else if (dbxHas(c, 'sys-dmgr-oany') || dbxHas(c, 'sys-dmgr-oasat')) {   // 1.6.2: an Any wound row on every blow that lands; its roll on the sheet as it stood there
        var oT = dbxRow(t, 'sys-dmgr-onwound', 'oi', 'onWound'); if (!oT) return true; var oK = dbxHas(c, 'sys-dmgr-oany') ? 'any' : 'asAt'; if (on) oT[oK] = true; else delete oT[oK];
    } else if (dbxHas(c, 'sys-dmgr-lany')) {   // 1.6.0: Every row
        var lA = dbxRow(t, 'sys-dmgr-layer', 'li', 'layers'); if (!lA) return true; if (on) lA.anyRow = true; else delete lA.anyRow;
    } else if (dbxHas(c, 'sys-dmgr-lwears')) {   // 1.6.0: the stats it may wear, kept in the list's own order
        var lW = dbxRow(t, 'sys-dmgr-layer', 'li', 'layers'), kW = t.dataset && typeof t.dataset.k === 'string' ? t.dataset.k.toLowerCase() : ''; if (!lW || !kW) return true;
        var curW = (Array.isArray(lW.wears) ? lW.wears : []).map(function(x) { return String(x).toLowerCase(); });
        var wantW = dbxKeys(lW.list, true).map(function(kv) { return kv[0]; }).filter(function(x) { return x.toLowerCase() === kW ? on : curW.indexOf(x.toLowerCase()) >= 0; });
        if (wantW.length) lW.wears = wantW; else delete lW.wears;
    } else if (dbxHas(c, 'sys-dmgr-wlist') || dbxHas(c, 'sys-dmgr-wwear') || dbxHas(c, 'sys-dmgr-wcond') || dbxHas(c, 'sys-dmgr-wtest') || dbxHas(c, 'sys-dmgr-wheavy')) {
        var w = dbxRow(t, 'sys-dmgr-weapon', 'wi', 'weapons'); if (!w) return true;
        if (dbxHas(c, 'sys-dmgr-wlist')) { if (w.list !== v) { delete w.wear; delete w.cond; } dbxSet(w, 'list', v); dbxWordFollow(w, t); redraw = true; } else dbxSet(w, dbxHas(c, 'sys-dmgr-wwear') ? 'wear' : dbxHas(c, 'sys-dmgr-wtest') ? 'test' : dbxHas(c, 'sys-dmgr-wheavy') ? 'heavy' : 'cond', v);
    } else if (dbxHas(c, 'sys-dmgr-woundf') || dbxHas(c, 'sys-dmgr-ywf')) {   // 1.6.3: a Wound by box left; the A wound of 0 list and Its multiplier follow it
        if (dbxShowSig(dbxCm().damage) === _dbxSig) return true; redraw = true;
    } else return true;   // a text box: its input event did the work
    markDirty(); if (redraw) renderAll(); else patchErrors(); return true;
}
// 1.6.2 (the CORE session): which alternative a row of Instead, if stands for (0 the first, y.alt; n, y.alts[n - 1]), made where it is the first; and an
// empty first takes the rest with it, an empty later one goes
function dbxAltOf(y, t) { var r = t && t.closest ? t.closest('.sys-dmgr-alt') : null, k = r && r.dataset ? Number(r.dataset.ai) : 0; if (!(k >= 0) || Math.floor(k) !== k) return null; if (!k) return dbxObj(y.alt) ? y.alt : (y.alt = {}); return Array.isArray(y.alts) && dbxObj(y.alts[k - 1]) ? y.alts[k - 1] : null; }
function dbxAltTidy(y) { if (dbxObj(y.alt) && !Object.keys(y.alt).length) delete y.alt; if (!dbxObj(y.alt)) delete y.alts; }
function damageClick(b) {
    var mT = /^dmgralt(new|del)$/.exec(b.dataset && b.dataset.act || ''); if (mT) {
        var yT = dbxRow(b, 'sys-dmgr-type', 'yi', 'types'); if (!yT) return true;
        if (mT[1] === 'new') { var lT = Array.isArray(yT.alts) ? yT.alts : (yT.alts = []); if (lT.length >= 3) { toast('At most 3 more alternatives.'); return true; } lT.push({}); }
        else { var rT = b.closest ? b.closest('.sys-dmgr-alt') : null, kT = rT ? Number(rT.dataset.ai) : 0; if (kT >= 1 && Array.isArray(yT.alts)) { yT.alts.splice(kT - 1, 1); if (!yT.alts.length) delete yT.alts; } }
        markDirty(); renderAll(); return true;
    }
    var mA = /^dmgrmj(add|del)$/.exec(b.dataset && b.dataset.act || ''); if (mA) {   // 1.6.0: onMajor's rows
        var dA = dbxDraft(), rA = majRowsOf(dA.onMajor);
        if (mA[1] === 'add') { if (rA.length >= DBX_LIM.onMajor) { toast('At most ' + DBX_LIM.onMajor + ' rows of a Major Wound.'); return true; } if (!rA.length) rA.push({}); rA.push({}); }
        else { var rwA = b.closest ? b.closest('.sys-dmgr-onmajor') : null, iA = rwA ? Number(rwA.dataset.mi) : -1; if (!(iA >= 0 && iA < rA.length && Math.floor(iA) === iA)) return true; rA.splice(iA, 1); }
        majWrite(dA, rA); dbxTidy(); markDirty(); renderAll(); return true;
    }
    var m = /^dmgr(y|l|w|o|k)(add|del)$/.exec(b.dataset && b.dataset.act || ''); if (!m) return false;   // 1.6.0 (the core's gap 6): o, what any wound does; k, a kind of blow
    var key = m[1] === 'y' ? 'types' : m[1] === 'k' ? 'kinds' : m[1] === 'l' ? 'layers' : m[1] === 'o' ? 'onWound' : 'weapons', cap = DBX_LIM[key], words = m[1] === 'y' ? 'damage types' : m[1] === 'k' ? 'kinds of blow' : m[1] === 'l' ? 'layers' : m[1] === 'o' ? 'rows of Any wound' : 'weapon lists';
    if (m[2] === 'add') {
        var d = dbxDraft(), arr = Array.isArray(d[key]) ? d[key] : (d[key] = []);
        if (arr.length >= cap) { toast('At most ' + cap + ' ' + words + '.'); return true; }
        arr.push(m[1] === 'y' ? dbxNewNamed(arr, 'Damage type') : m[1] === 'k' ? dbxNewNamed(arr, 'Kind') : m[1] === 'w' ? { word: dbxWordOf({}), _new: true } : {});   // 1.6.3: a new weapon rule starts with its required Called box filled, and a new type or kind with its required Name
    } else {   // a remove: only a row the draft holds
        var dd = dbxCm().damage, ar = dbxObj(dd) && Array.isArray(dd[key]) ? dd[key] : [], cls = m[1] === 'y' ? 'sys-dmgr-type' : m[1] === 'k' ? 'sys-dmgr-kind' : m[1] === 'l' ? 'sys-dmgr-layer' : m[1] === 'o' ? 'sys-dmgr-onwound' : 'sys-dmgr-weapon', ix = m[1] === 'y' ? 'yi' : m[1] === 'k' ? 'ki' : m[1] === 'l' ? 'li' : m[1] === 'o' ? 'oi' : 'wi';
        var rw = b.closest ? b.closest('.' + cls) : null, i = rw ? Number(rw.dataset[ix]) : -1; if (!(i >= 0 && i < ar.length && Math.floor(i) === i)) return true;
        ar.splice(i, 1); if (!ar.length) delete dd[key]; dbxTidy();
    }
    markDirty(); renderAll(); return true;
}
// What Save drops of the damage rules, said under the box: each part judged by the cleaner itself (cleanDamageRules, with the cleaned GM view's
// fields), so the words agree with Save. A formula Save keeps but cannot read is a warning: it never holds. Returns { errs, warns }
function damageSays(d, sys, Fx) {
    var errs = [], warns = [], say = function(m, p) { errs.push(p ? { message: m, prop: p } : { message: m }); }, warn = function(m, p) { warns.push(p ? { message: m, prop: p } : { message: m }); };   // 1.6.3: p, the box a press on the line lands on (sysui.js PROP_BOX)
    if (!dbxObj(d) || typeof cleanDamageRules !== 'function' || !sys || !Array.isArray(sys.fields)) return { errs: errs, warns: warns };
    var kinds = {}, res = {}, byId = {}; sys.fields.forEach(function(f) { if (!f || typeof f.id !== 'string') return; kinds[f.id] = f.kind; byId[f.id] = f; if (f.kind === 'resource') res[f.id] = 1; });
    var fl = function(id) { return Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null; };
    var piece = function(o) { return cleanDamageRules(Object.assign({ types: [{ key: 'zq' }] }, o), kinds, res, fl, false) || {}; };
    var reads = function(t, what) { if (typeof t !== 'string' || !t.trim() || !Fx || typeof Fx.parse !== 'function') return; var p = Fx.parse(t.trim()); if (!p || !p.ok) warn(what + ': Save keeps the formula, but it cannot be read, so it never holds.'); };
    var low = function(a) { return (Array.isArray(a) ? a : []).map(function(x) { return String(x).toLowerCase(); }); };
    var isList = function(id) { return typeof id === 'string' && kinds[id] === 'item-list'; };
    var numStat = function(listId, k) { var f = fl(listId), sp = f && dbxObj(f.list) ? f.list : null; return !!sp && typeof k === 'string' && (Array.isArray(sp.stats) ? sp.stats : []).some(function(s) { return dbxObj(s) && String(s.key).toLowerCase() === k.toLowerCase() && s.kind !== 'pick'; }); };
    var any = (typeof d.pool === 'string' && d.pool) || (typeof d.major === 'string' && d.major.trim()) || (dbxObj(d.locs) && d.locs.list) || ['types', 'kinds', 'layers', 'weapons', 'onWound'].some(function(k) { return Array.isArray(d[k]) && d[k].length; });
    if (any && !cleanDamageRules(d, kinds, res, fl, false)) say('Taking damage: Save keeps these rules only with a pool, a damage type, hit locations or Any wound, so it drops them.');
    if (typeof d.pool === 'string' && d.pool && !piece({ pool: d.pool }).pool) say('Wounds come off: that pool is gone, so Save drops it.');
    if (typeof d.major === 'string' && d.major.trim()) { if (!piece({ major: d.major }).major) say('Major Wound: the formula is too long or not on one line, so Save drops it.'); else reads(d.major, 'Major Wound'); }
    if (typeof d.woundF === 'string' && d.woundF.trim()) { if (!piece({ woundF: d.woundF }).woundF) say('Wound by: the formula is too long or not on one line, so Save drops it.'); else reads(d.woundF, 'Wound by'); }   // 1.6.2
    (Array.isArray(d.types) ? d.types : []).forEach(function(y) { if (dbxObj(y) && typeof y.woundF === 'string' && y.woundF.trim()) reads(y.woundF, 'Wound by of ' + (y.label || y.key || 'a type')); });
    if (d.zero === 'none' && !dbxAnyWF(d)) warn('A wound of 0 does nothing: it counts only with a Wound by formula, under Taking damage or on a damage type, and none is set.', 'dmgr.zero');   // 1.6.3: Save keeps it, and it does nothing
    if (Array.isArray(d.onMajor)) {   // 1.6.0: onMajor's rows, as the cleaner reads them
        if (d.onMajor.some(function(w) { return dbxObj(w) && (w.fx || w.roll); }) && !(typeof d.major === 'string' && d.major.trim())) say('A Major Wound switches on and asks for: Save keeps them only with a Major Wound formula, so it drops them.');
        d.onMajor.forEach(function(w, i) {
            if (!dbxObj(w)) return; var nth = 'A Major Wound, row ' + (i + 1);
            if (i >= DBX_LIM.onMajor) { if (i === DBX_LIM.onMajor) say('A Major Wound: Save keeps the first ' + DBX_LIM.onMajor + ' rows.'); return; }
            if (!(typeof w.fx === 'string' && w.fx) && !(typeof w.roll === 'string' && w.roll)) say(nth + ': it switches nothing on and asks for nothing, so Save drops it.');
            if (typeof w.if === 'string' && w.if.trim()) reads(w.if, nth);
            if (typeof w.cripBy === 'string' && w.cripBy.trim()) reads(w.cripBy, nth + ', what its failure writes');
            if (typeof w.fx === 'string' && w.fx && !(Array.isArray(sys.effects) ? sys.effects : []).some(function(e) { return dbxObj(e) && e.id === w.fx; })) warn(nth + ': that effect is gone, so it switches nothing on.');
            if (typeof w.roll === 'string' && w.roll && !(Array.isArray(sys.rolls) ? sys.rolls : []).some(function(r) { return dbxObj(r) && r.id === w.roll; })) warn(nth + ': that roll is gone, so it asks for nothing.');
            if (typeof w.crip === 'string' && w.crip && !(dbxObj(d.locs) && numStat(d.locs.list, w.crip))) say(nth + ': its failure cripples a number stat of the hit locations, and that is none, so Save drops it.');
        });
    }
    if (dbxObj(d.onMajor)) {   // 1.6.0 (B3): kept only beside the formula; an effect or a roll that is gone does nothing
        if (!(typeof d.onMajor.fx === 'string' && d.onMajor.fx) && !(typeof d.onMajor.roll === 'string' && d.onMajor.roll)) say('A Major Wound: it switches nothing on and asks for nothing, so Save drops it.', 'dmgr.mjfx.0');   // 1.6.3: a where typed alone, as the list's rows say it
        if (typeof d.onMajor.if === 'string' && d.onMajor.if.trim()) reads(d.onMajor.if, 'A Major Wound, where');   // 1.6.0
        if ((d.onMajor.fx || d.onMajor.roll) && !(typeof d.major === 'string' && d.major.trim())) say('A Major Wound switches on and asks for: Save keeps them only with a Major Wound formula, so it drops them.');
        if (typeof d.onMajor.fx === 'string' && d.onMajor.fx && !(Array.isArray(sys.effects) ? sys.effects : []).some(function(e) { return dbxObj(e) && e.id === d.onMajor.fx; })) warn('A Major Wound switches on: that effect is gone, so it switches nothing on.');
        if (typeof d.onMajor.roll === 'string' && d.onMajor.roll && !(Array.isArray(sys.rolls) ? sys.rolls : []).some(function(r) { return dbxObj(r) && r.id === d.onMajor.roll; })) warn('A Major Wound asks for: that roll is gone, so it asks for nothing.');
        if (typeof d.onMajor.cripBy === 'string' && d.onMajor.cripBy.trim()) reads(d.onMajor.cripBy, 'A Major Wound\u2019s roll, what its failure writes');   // 1.6.0 (the core's ruling on gap 7)
        if (typeof d.onMajor.crip === 'string' && d.onMajor.crip && !(dbxObj(d.locs) && numStat(d.locs.list, d.onMajor.crip))) say('A Major Wound\u2019s roll: its failure cripples a number stat of the hit locations, and that is none, so Save drops it.');   // 1.6.0 (the core's gap 7)
    }
    if (typeof CREW_NONE === 'string') { (typeof majRowsOf === 'function' ? majRowsOf(d.onMajor) : []).forEach(function(o) { if (dbxObj(o) && Array.isArray(o.crew) && !o.crew.length) warn('A Major Wound' + CREW_NONE); }); (Array.isArray(d.onWound) ? d.onWound : []).forEach(function(o) { if (dbxObj(o) && Array.isArray(o.crew) && !o.crew.length) warn('Any wound' + CREW_NONE); }); }   // 1.6.2 (fold (f))
    (Array.isArray(d.onWound) ? d.onWound : []).forEach(function(w, i) {   // 1.6.0 (the core's gap 6)
        if (!dbxObj(w)) return; var nth = 'Any wound, row ' + (i + 1);
        var hld = dbxObj(w.held) ? w.held : null, hlG = hld ? cleanHeld(hld, fl) : null;   // 1.6.0: what stands where the blow lands, as the cleaner reads it
        if (hld && !hlG) say(nth + ': what stands there needs a list and a formula for a row at the location, so Save drops it.');
        if (hlG && (typeof hld.stat === 'string' && hld.stat || typeof hld.to === 'string' && hld.to.trim()) && !hlG.stat) say(nth + ': writing a row needs a number stat of its list and a figure, so Save drops that part.');
        if (hlG) { reads(hlG.at, nth + ', a row there'); if (hlG.to) reads(hlG.to, nth + ', what it writes'); }
        var adW = dbxObj(w.add) ? w.add : null, adOk = adW && typeof adW.entry === 'string' && adW.entry && typeof adW.list === 'string' && adW.list;
        if (adW && !adOk) say(nth + ': adding a row needs a list and an entry, so Save drops that part.');
        if (adOk && dbxObj(d.locs) && d.locs.list) { var adF = (sys.fields || []).filter(function(x) { return dbxObj(x) && x.id === adW.list; })[0]; if (!(adF && dbxObj(adF.list) && dbxObj(adF.list.stand) && adF.list.stand.from === d.locs.list)) warn(nth + ': that list\u2019s rows do not stand at the hit locations, so the row it adds stands nowhere.'); }
        if (!(typeof w.fx === 'string' && w.fx) && !(typeof w.roll === 'string' && w.roll) && !(hlG && hlG.stat) && !adOk) say(nth + ': it switches nothing on, asks for nothing and adds nothing, so Save drops it.');
        if (typeof w.if === 'string' && w.if.trim()) reads(w.if, nth);
        if (typeof w.cripBy === 'string' && w.cripBy.trim()) reads(w.cripBy, nth + ', what its failure writes');
        if (typeof w.fx === 'string' && w.fx && !(Array.isArray(sys.effects) ? sys.effects : []).some(function(e) { return dbxObj(e) && e.id === w.fx; })) warn(nth + ': that effect is gone, so it switches nothing on.');
        if (typeof w.roll === 'string' && w.roll && !(Array.isArray(sys.rolls) ? sys.rolls : []).some(function(r) { return dbxObj(r) && r.id === w.roll; })) warn(nth + ': that roll is gone, so it asks for nothing.');
        if (typeof w.crip === 'string' && w.crip && !(dbxObj(d.locs) && numStat(d.locs.list, w.crip))) say(nth + ': its failure cripples a number stat of the hit locations, and that is none, so Save drops it.');
    });
    if (Array.isArray(d.onWound) && d.onWound.length > DBX_LIM.onWound) say('Any wound: Save keeps the first ' + DBX_LIM.onWound + '.');
    var lk = null;
    if (dbxObj(d.locs) && d.locs.list) {
        lk = piece({ locs: d.locs }).locs || null;
        if (!lk) say('Hit locations: that list is gone, so Save drops them.');
        else {
            if (typeof d.locs.dr === 'string' && d.locs.dr && !lk.dr) say('Hit locations: the DR is no stat or column of the list, so Save drops it.');
            if (typeof d.locs.crip === 'string' && d.locs.crip && !lk.crip) say('Hit locations: Cripple above is no stat or column of the list, so Save drops it.');
            if (typeof d.locs.side === 'string' && d.locs.side && !lk.side) say('Hit locations: Side is no number stat of the list, so Save drops it.');   // 1.6.0
            if (typeof lk.at === 'string' && lk.at && dbxLocFinds(lk.list, lk.at, sys) === false) warn('Unaimed blows land at: no location of that list is named “' + lk.at + '”, so a blow lands on the usual one, a location named Torso, else the first. A character’s own row of that name still counts.');   // 1.6.3 (the review of damage): a typo, or an entry removed, never falls back in silence
            if (typeof d.locs.vital === 'string' && d.locs.vital.trim()) { if (!lk.vital) say('Hit locations: the vital formula is too long or not on one line, so Save drops it.'); else reads(d.locs.vital, 'Vital where'); }
            if (typeof d.locs.mult === 'string' && d.locs.mult.trim()) { if (!lk.mult) say('Hit locations: the Times there formula is too long or not on one line, so Save drops it.'); else reads(d.locs.mult, 'Times there'); }
            if (typeof d.locs.die === 'string' && d.locs.die.trim()) { if (!lk.die) say('Hit locations: the A die there adds formula is too long or not on one line, so Save drops it.'); else reads(d.locs.die, 'A die there adds'); }   // 1.6.0
        }
    }
    var seen = {}, kept = 0, yVital = false;
    (Array.isArray(d.types) ? d.types : []).forEach(function(y, i) {
        var nm = 'Damage type ' + (i + 1) + (dbxObj(y) && typeof y.label === 'string' && y.label.trim() ? ', ' + y.label.trim() : dbxObj(y) && typeof y.key === 'string' && y.key ? ', ' + y.key : '');
        if (!dbxObj(y)) { say(nm + ': Save cannot read it, so it drops it.'); return; }
        var k = typeof y.key === 'string' ? y.key.toLowerCase() : '';
        var yNamed = typeof y.label === 'string' && !!y.label.trim();   // 1.6.3: the Name is required (Fulllion's rulings of 2026-11-20)
        if (!k && !yNamed) { say(nm + ': it needs a name, or Save drops it.', 'dmgr.ylabel.' + i); return; }
        if (!k) { say(nm + ': its name makes no short name, so Save drops it. Use a letter A to Z in its name.', 'dmgr.ylabel.' + i); return; }
        if (!(piece({ types: [{ key: y.key }] }).types || []).length) { say(nm + ': its key must be a letter, then letters, digits and _, so Save drops it.'); return; }
        if (seen[k]) { say(nm + ': another type has this key, so Save drops it.'); return; }
        if (kept >= DBX_LIM.types) { say(nm + ': at most ' + DBX_LIM.types + ' types, so Save drops it.'); return; }
        seen[k] = 1; kept++;
        if (!yNamed) say(nm + ': Name is empty. Name it, such as Cutting, since players read it in the damage lines and the Take damage window.', 'dmgr.ylabel.' + i);
        var cy = (piece({ locs: d.locs, types: [y] }).types || [])[0] || {};
        if (y.mult !== undefined) { if (typeof y.mult !== 'number' || !isFinite(y.mult)) say(nm + ': its multiplier is no number, so Save takes 1.'); else if (cy.mult !== y.mult) say(nm + ': a multiplier is 0 to 10 to the hundredth, so Save keeps ' + cy.mult + '.'); }
        if (y.vital !== undefined && y.vital !== 0) { if (typeof y.vital !== 'number' || !isFinite(y.vital)) say(nm + ': its vital multiplier is no number, so Save drops it.'); else if (!cy.vital) say(nm + ': a vital multiplier is above 0 and at most 10, so Save drops it.'); else if (cy.vital !== y.vital) say(nm + ': a vital multiplier is at most 10 to the hundredth, so Save keeps ' + cy.vital + '.'); }
        var cp = low(cy.plus), lost = [];
        (Array.isArray(y.plus) ? y.plus : []).forEach(function(p) { var s = String(p); if (cp.indexOf(s.toLowerCase()) < 0 && lost.indexOf(s) < 0) lost.push(s); });
        if (lost.length) say(nm + ': ' + (!lk ? 'adding to DR needs hit locations' : 'Adds to DR takes only stats or columns of the location list, 8 at most') + ', so Save drops ' + lost.join(', ') + '.');
        if (typeof y.pool === 'string' && y.pool && !cy.pool) say(nm + ': its pool is gone, so Save drops it.');
        DBX_DIE.forEach(function(g) {   // 1.6.0: its figures a die, as the cleaner reads them
            var v = y[g[1]]; if (v === undefined || v === 0) return;
            if (typeof v !== 'number' || !isFinite(v)) say(nm + ': ' + g[5] + ' is no number, so Save drops it.');
            else if (cy[g[1]] !== v) say(nm + ': ' + g[5] + ' is ' + g[4] + ' to 10 to the hundredth, so Save keeps ' + (cy[g[1]] || 0) + '.');
        });
        if (!lk && ((typeof y.dieDr === 'number' && y.dieDr) || (typeof y.dieVital === 'number' && y.dieVital) || (typeof y.dieWear === 'number' && y.dieWear))) warn(nm + ': its DR, vital wound and wear a die count only at a hit location, so they do nothing here.');
        // 1.6.3 (lane B batch "damage"): Vital times and its vital wound a die count only where Vital where holds at the location struck. Read on the
        // cleaned type, so only figures Save keeps are said. Warnings: Save keeps them, and they do nothing
        if (cy.vital || cy.dieVital) yVital = true;
        if (lk && !lk.vital && (cy.vital || cy.dieVital)) warn(nm + ': Vital times and its vital wound a die count only at a vital location, and Vital where under Hit locations is empty, so they do nothing. Fill Vital where.', 'dmgr.locvital');
        if (!lk && cy.vital) warn(nm + ': Vital times counts only at a hit location, so it does nothing here.');
        if (y.byMult === true && !dbxStr(d.woundF).trim() && !dbxStr(y.woundF).trim()) warn(nm + ': Its multiplier counts only with a Wound by formula under Taking damage, and that is empty.');
        if (dbxObj(y.alt) && Object.keys(y.alt).length) {
            if (!cy.alt) say(nm + ': Instead, if needs a formula Save can keep, so Save drops what it changes.');
            else { if (typeof y.alt.pool === 'string' && y.alt.pool && !cy.alt.pool) say(nm + ': the pool for Instead, if is gone, so Save drops it.'); if (y.alt.mult !== undefined && cy.alt.mult === undefined) say(nm + ': the multiplier for Instead, if is no number, so Save drops it.'); reads(y.alt.if, nm + ', Instead, if'); }
        }
        if (Array.isArray(y.alts)) y.alts.forEach(function(x, xk) { if (!dbxObj(x) || !Object.keys(x).length) return; var cx = cy.alts && cy.alts.filter(function(z) { return z.if === x.if; })[0]; if (!cx) say(nm + ': Or else, if ' + (xk + 2) + ' needs a formula Save can keep, beside an Instead, if, so Save drops it.'); else reads(x.if, nm + ', Or else, if'); });   // 1.6.2
    });
    if (lk && lk.vital && !yVital) warn('Vital where: no damage type has Vital times or a vital wound a die, so it changes nothing.', 'dmgr.locvital');   // 1.6.3: the other way round
    var kSeen = Object.create(null), kKept = 0;   // 1.6.0: the kinds of blow, as the cleaner reads them
    (Array.isArray(d.kinds) ? d.kinds : []).forEach(function(y, i) {
        var nm = 'Kind ' + (i + 1) + (dbxObj(y) && typeof y.label === 'string' && y.label.trim() ? ', ' + y.label.trim() : dbxObj(y) && typeof y.key === 'string' && y.key ? ', ' + y.key : '');
        if (!dbxObj(y)) { say(nm + ': Save cannot read it, so it drops it.'); return; }
        var k = typeof y.key === 'string' ? y.key.toLowerCase() : '';
        var kNamed = typeof y.label === 'string' && !!y.label.trim();   // 1.6.3: the Name is required (Fulllion's rulings of 2026-11-20)
        if (!k && !kNamed) { say(nm + ': it needs a name, or Save drops it.', 'dmgr.klabel.' + i); return; }
        if (!k) { say(nm + ': its name makes no short name, so Save drops it. Use a letter A to Z in its name.', 'dmgr.klabel.' + i); return; }
        if (!(piece({ kinds: [{ key: y.key }] }).kinds || []).length) { say(nm + ': its key must be a letter, then letters, digits and _, so Save drops it.'); return; }
        if (kSeen[k]) { say(nm + ': another kind has this key, so Save drops it.'); return; }
        if (kKept >= DBX_LIM.kinds) { say(nm + ': at most ' + DBX_LIM.kinds + ' kinds, so Save drops it.'); return; }
        kSeen[k] = 1; kKept++;
        if (!kNamed) say(nm + ': Name is empty. Name it, such as Melee, since the Take damage window and a blast’s kind of blow show it.', 'dmgr.klabel.' + i);
    });
    [['layers', 'Layer', 'at', 'its figure', ['wear']], ['weapons', 'Weapon list', 'dur', 'its Dur', ['wear', 'cond']]].forEach(function(g) {
        var n = 0;
        (Array.isArray(d[g[0]]) ? d[g[0]] : []).forEach(function(l, i) {
            var nm = g[1] + ' ' + (i + 1);
            if (n >= DBX_LIM[g[0]]) { say(nm + ': at most ' + DBX_LIM[g[0]] + ', so Save drops it.'); return; }
            var o = {}; o[g[0]] = [l]; if ((piece(o)[g[0]] || []).length) { n++; reads(l[g[2]], nm + ', ' + g[3]); return; }
            if (!dbxObj(l) || !l.list) say(nm + ': pick a list, or Save drops it.');
            else if (!isList(l.list)) say(nm + ': that list is gone, so Save drops it.');
            else if (typeof l[g[2]] !== 'string' || !l[g[2]].trim()) say(nm + ': ' + g[3] + ' needs a formula, so Save drops it.');
            else if (g[4].some(function(k) { return !numStat(l.list, l[k]); })) say(nm + ': pick a number stat of that list for each stat, so Save drops it.');
            else say(nm + ': ' + g[3] + ' is too long or not on one line, so Save drops it.');
        });
    });
    (Array.isArray(d.weapons) ? d.weapons : []).forEach(function(l, i) {   // 1.6.3 (Fulllion, 2026-11-20): Called is required. Save keeps the rule all the same, and the damage line then says the stat's name, else durability
        if (dbxObj(l) && !(typeof l.word === 'string' && l.word.trim())) say('Weapon list ' + (i + 1) + ': Called is empty. Name what the damage line calls its durability, such as Dur.');
    });
    (Array.isArray(d.layers) ? d.layers : []).forEach(function(l, i) {   // 1.6.0: a layer's stat worn by location, as the cleaner reads it
        if (!dbxObj(l) || !((Array.isArray(l.wears) && l.wears.length) || (typeof l.pick === 'string' && l.pick.trim()))) return;
        var cl = (piece({ layers: [l] }).layers || [])[0]; if (!cl) return;   // the layer itself is said above
        var nm = 'Layer ' + (i + 1);
        if (l.whole === true) say(nm + ': Every location wears one stat, so Save drops Or by location.');   // 1.6.0
        else if (!cl.wears) say(nm + ': Or by location needs a formula and a ticked number stat of its list, so Save drops it.');
        else { reads(l.pick, nm + ', Or by location'); if (cl.wears.length < l.wears.length) say(nm + ': Or by location takes number stats of its list, ' + DBX_LIM.wears + ' at most, so Save drops the others.'); }
    });
    (Array.isArray(d.layers) ? d.layers : []).forEach(function(l, i) {   // 1.6.0: what a hit wears, by formula, as the cleaner reads it
        if (!dbxObj(l)) return; var cl = (piece({ layers: [l] }).layers || [])[0]; if (!cl) return;
        if (dbxObj(l.typed) && (l.typed.stat || (typeof l.typed.plus === 'string' && l.typed.plus.trim()))) {   // 1.6.0: Type named by, both or neither, as the cleaner keeps it
            if (!cl.typed) say('Layer ' + (i + 1) + ': Type named by needs a formula, and any stat a number stat of its list, so Save drops it.');
            else { reads(cl.typed.plus, 'Layer ' + (i + 1) + ', Type named by'); if (!(Array.isArray(d.types) && d.types.length)) warn('Layer ' + (i + 1) + ': Type named by names a damage type, and this system has none, so it adds nothing.'); }
        }
        if (cl.whole === true && /(^|[^A-Za-z0-9_.])hit\./i.test(cl.at)) warn('Layer ' + (i + 1) + ': Every location is one figure, and with no location its figure reads Hit. names as 0.');   // 1.6.0
        [['hitWear', 'Wears on a hit'], ['majorWear', 'Wears on a Major Wound'], ['brokenWear', 'Once broken, a hit'], ['brokenMajorWear', 'Once broken, a Major Wound'], ['wearCap', 'Wears at most'], ['adBy', 'Its own divisor']].forEach(function(g) {
            if (typeof l[g[0]] !== 'string' || !l[g[0]].trim()) return;
            if (!cl[g[0]]) say('Layer ' + (i + 1) + ': ' + g[1] + ' is too long or not on one line, so Save drops it.'); else reads(l[g[0]], 'Layer ' + (i + 1) + ', ' + g[1]);
        });
    });
    return { errs: errs, warns: warns };
}
// [sinkcheck:dmgbox-end]
// Lighting L4: the system's light rules on the Combat tab — what it calls a dim and a dark place (the ruler and a target mark show the names)
// and its light presets (a light's Properties offer them; ticked, a player may pick one for their own token). Every text lands as a value or
// a text node. Save cleans them; refreshErrors says what it would drop
// [sinkcheck:lightbox-start]
function lightDraft() { var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); return cm.light && typeof cm.light === 'object' && !Array.isArray(cm.light) ? cm.light : (cm.light = {}); }
function lightBox(box, cm) {
    var lt = cm.light && typeof cm.light === 'object' && !Array.isArray(cm.light) ? cm.light : {}, nm = lt.names && typeof lt.names === 'object' && !Array.isArray(lt.names) ? lt.names : {}, wrap = el('div', 'sys-light');
    wrap.appendChild(el('div', 'sys-light-head', 'Light'));
    wrap.appendChild(el('div', 'sys-note', 'Your game\u2019s light, for fogged maps with Lighting on: what it calls a dim and a dark place (the ruler between two tokens and a target mark show the name, so word its penalty into it), and its lights. A light\u2019s Properties offer these presets; one that is ticked, a player may pick for their own token, from its right-click menu.'));
    var r1 = el('div', 'sys-flags sys-light-names');
    [['dim', 'Dim light is called', 'e.g. Dim light (-2 to see)'], ['dark', 'Darkness is called', 'e.g. Darkness (-9)']].forEach(function(g) {
        var l = el('label', 'sys-combat-item'); l.appendChild(el('span', 'sys-num-cap', g[1]));
        var i = input('sys-light-name field', Object.prototype.hasOwnProperty.call(nm, g[0]) && typeof nm[g[0]] === 'string' ? nm[g[0]] : '', 'Shown on the ruler and at a target mark when the target stands in ' + (g[0] === 'dim' ? 'dim light' : 'the dark') + ', as the token looking sees it; empty: nothing is shown', g[2]); i.maxLength = LIMITS.label; i.dataset.lvl = g[0]; l.appendChild(i); r1.appendChild(l);
    });
    wrap.appendChild(r1);
    var arr = Array.isArray(lt.presets) ? lt.presets : [];
    wrap.appendChild(el('span', 'sys-num-cap', 'Light presets'));
    arr.forEach(function(p0, i) {
        var p = p0 && typeof p0 === 'object' ? p0 : {}, rw = el('div', 'sys-flags sys-light-row'); rw.dataset.li = String(i);
        var n = input('sys-light-pname field', typeof p.name === 'string' ? p.name : '', 'Its name: Torch, Lantern, Lumen rod', 'Name'); n.maxLength = LIMITS.label; rw.appendChild(n);
        [['bright', 'Bright to', 'How far it lights brightly (0: a dim light only)'], ['dim', 'Dim to', 'Its outer edge: dim from the bright radius out to here (the same as bright: no dim fringe)']].forEach(function(g) {
            var nl = el('label', 'sys-num'); nl.appendChild(el('span', 'sys-num-cap', g[1]));
            var ni = el('input', 'field sys-light-p' + g[0]); ni.type = 'number'; ni.min = '0'; ni.max = '1000'; ni.step = 'any'; ni.value = typeof p[g[0]] === 'number' ? String(p[g[0]]) : ''; ni.title = g[2]; nl.appendChild(ni); rw.appendChild(nl);
        });
        rw.appendChild(select('sys-light-punit', [['yd', 'yards'], ['ft', 'feet'], ['m', 'meters'], ['cells', 'grid cells']], typeof p.unit === 'string' && Object.prototype.hasOwnProperty.call(LIGHT_UNITS, p.unit) ? p.unit : 'yd', 'What the two radii count in: each map\u2019s scale converts it (a 20 ft torch on 5 ft squares lights 4 squares)'));
        var pk = el('label', 'sys-hover'), pc = el('input', 'sys-light-ppick'); pc.type = 'checkbox'; pc.checked = p.pick === true; pk.appendChild(pc); pk.appendChild(document.createTextNode(' Players may pick')); pk.title = 'Ticked: a player may pick this light for their own token, from its right-click menu (your machine copies it from this list). Unticked: only you set it, in a token\u2019s Properties'; rw.appendChild(pk);
        [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'lp' + bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
        wrap.appendChild(rw);
    });
    var ad = el('button', 'tool ghost sys-btn sys-light-add', '+ Light preset'); ad.dataset.act = 'lpadd'; ad.disabled = arr.length >= LIMITS.lightPresets; ad.title = ad.disabled ? 'At most ' + LIMITS.lightPresets : 'A light of your game: a torch, a lantern, a lumen rod'; wrap.appendChild(ad);
    var err = errorCell('light'); err.dataset.errFor = 'light'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function onLightInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-light-') < 0) return false;
    if (c.indexOf('sys-light-punit') >= 0 || c.indexOf('sys-light-ppick') >= 0) return true;   // their change events do the work
    var lt = lightDraft(), rw = t.closest('.sys-light-row'), i = rw ? +rw.dataset.li : -1;
    if (c.indexOf('sys-light-name') >= 0) {
        var nm = lt.names && typeof lt.names === 'object' && !Array.isArray(lt.names) ? lt.names : (lt.names = {}), k = t.dataset.lvl === 'dark' ? 'dark' : 'dim';
        if (t.value.trim()) nm[k] = t.value.slice(0, LIMITS.label); else delete nm[k];
        if (!Object.keys(nm).length) delete lt.names;
    } else if (rw) {
        var p = Array.isArray(lt.presets) && lt.presets[i] && typeof lt.presets[i] === 'object' ? lt.presets[i] : null; if (!p) return true;
        if (c.indexOf('sys-light-pname') >= 0) p.name = t.value.slice(0, LIMITS.label);
        else if (c.indexOf('sys-light-pbright') >= 0 || c.indexOf('sys-light-pdim') >= 0) { var nv = Number(t.value), key = c.indexOf('sys-light-pbright') >= 0 ? 'bright' : 'dim'; if (t.value.trim() && isFinite(nv)) p[key] = nv; else delete p[key]; }
        else return true;
    } else return false;
    markDirty(); patchErrors(); return true;
}
function onLightChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-light-') < 0) return false;
    if (c.indexOf('sys-light-punit') < 0 && c.indexOf('sys-light-ppick') < 0) return true;   // the boxes' change events (their input events did the work)
    var lt = lightDraft(), rw = t.closest('.sys-light-row'), i = rw ? +rw.dataset.li : -1, p = Array.isArray(lt.presets) && lt.presets[i] && typeof lt.presets[i] === 'object' ? lt.presets[i] : null; if (!p) return true;
    if (c.indexOf('sys-light-punit') >= 0) { if (typeof t.value === 'string' && Object.prototype.hasOwnProperty.call(LIGHT_UNITS, t.value)) p.unit = t.value; else delete p.unit; }
    else if (t.checked) p.pick = true; else delete p.pick;
    markDirty(); patchErrors(); return true;
}
function lightClick(b) {
    var m = /^lp(add|up|down|del)$/.exec(b.dataset.act || ''); if (!m) return false;
    var lt = lightDraft(), arr = Array.isArray(lt.presets) ? lt.presets : (lt.presets = []);
    var rw = b.closest('.sys-light-row'), i = rw ? +rw.dataset.li : -1;
    if (m[1] === 'add') { if (arr.length >= LIMITS.lightPresets) { toast('At most ' + LIMITS.lightPresets + '.'); return true; } arr.push({ name: '', bright: 5, dim: 10 }); }
    else if (!(i >= 0 && i < arr.length && Math.floor(i) === i)) return true;
    else if (m[1] === 'up') { if (i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]); }
    else if (m[1] === 'down') { if (i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]); }
    else arr.splice(i, 1);
    markDirty(); renderAll(); return true;
}
// [sinkcheck:lightbox-end]
// Range penalties R1 (docs/RANGE_PLAN.md): the system's range rule on the Combat tab — none, a table of distance steps and their modifier, or
// a formula reading Distance — and the unit its distances count in. The ruler and a target mark show the modifier. A formula held as text
// (even empty) is the formula way, anything else the table; the draft keeps what the other way held (_f, _s) until Save, which keeps neither.
// Every text lands as a value or a text node. Save cleans it; refreshErrors says what it would drop
// [sinkcheck:rangebox-start]
function rangeDraft() { var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); return cm.range && typeof cm.range === 'object' && !Array.isArray(cm.range) ? cm.range : (cm.range = {}); }
function rangeBy(rg) { return !rg || typeof rg !== 'object' || Array.isArray(rg) ? '' : typeof rg.formula === 'string' ? 'formula' : 'table'; }
function rangeBox(box, cm) {
    var rg = cm.range && typeof cm.range === 'object' && !Array.isArray(cm.range) ? cm.range : null, by = rangeBy(rg), wrap = el('div', 'sys-range');
    wrap.appendChild(el('div', 'sys-light-head', 'Range'));
    wrap.appendChild(el('div', 'sys-note', 'Your game\u2019s range penalty: a modifier by how far the target is. The ruler shows it, and each target mark beside its cover and light. A table gives each distance\u2019s modifier (up to that distance; past the last row, its modifier holds); or work it out from the distance, in the unit picked here.'));
    var r1 = el('div', 'sys-flags sys-range-top');
    r1.appendChild(labeledSelect('sys-range-by', 'Range penalty', [['', 'None'], ['table', 'By a table'], ['formula', 'By a formula']], by, 'None: no range penalty is shown. A table: a modifier for each distance. A formula: a modifier worked out from Distance.'));
    if (by) r1.appendChild(labeledSelect('sys-range-unit', 'Counts in', [['yd', 'yards'], ['ft', 'feet'], ['m', 'meters'], ['cells', 'grid cells']], typeof rg.unit === 'string' && Object.prototype.hasOwnProperty.call(RANGE_UNITS, rg.unit) ? rg.unit : 'yd', 'What its distances count in: each map\u2019s scale converts it (60 ft on 5 ft squares is 12 squares)'));
    wrap.appendChild(r1);
    if (by === 'formula') {
        var fr = el('div', 'sys-flags sys-range-frow'), fm = input('sys-range-formula field', typeof rg.formula === 'string' ? rg.formula : '', 'The modifier at a distance: Distance is how far the target is, in the unit above; no dice, and no other name', 'Modifier, e.g. -2 * floor(Distance / 30)');
        fm.maxLength = LIMITS.formula; fr.appendChild(fm); wrap.appendChild(fr);
    } else if (by === 'table') {
        var st = Array.isArray(rg.steps) ? rg.steps : [];
        st.forEach(function(s0, i) {
            var s = s0 && typeof s0 === 'object' ? s0 : {}, rw = el('div', 'sys-flags sys-range-row'); rw.dataset.ri = String(i);
            [['to', 'Up to', 'How far this step reaches (from the step before it)'], ['mod', 'Modifier', 'The modifier up to this distance: -4, or 0 for none']].forEach(function(g) {
                var nl = el('label', 'sys-num'); if (i === 0) nl.appendChild(el('span', 'sys-num-cap', g[1]));   // the captions once, over the first row: a long table stays compact
                var ni = el('input', 'field sys-range-s' + g[0]); ni.type = 'number'; ni.step = 'any'; if (g[0] === 'to') { ni.min = '0'; ni.max = '1000000'; } else { ni.min = '-1000'; ni.max = '1000'; }
                ni.value = typeof s[g[0]] === 'number' ? String(s[g[0]]) : ''; ni.title = g[2]; nl.appendChild(ni); rw.appendChild(nl);
            });
            var nml = el('label', 'sys-num'); if (i === 0) nml.appendChild(el('span', 'sys-num-cap', 'Name'));
            var nmi = el('input', 'field sys-range-sname'); nmi.type = 'text'; nmi.maxLength = 30; nmi.placeholder = 'optional'; nmi.value = typeof s.name === 'string' ? s.name : ''; nmi.title = 'A name for this band, as Melee or Far. The ruler shows it where Range shows is set to Band name'; nml.appendChild(nmi); rw.appendChild(nml);   // 1.6.0, backlog 30
            var db = el('button', 'tool ghost sys-btn', '\u00d7'); db.dataset.act = 'rgdel'; db.title = 'Remove this step'; rw.appendChild(db);
            wrap.appendChild(rw);
        });
        var ad = el('button', 'tool ghost sys-btn sys-range-add', '+ Step'); ad.dataset.act = 'rgadd'; ad.disabled = st.length >= LIMITS.rangeSteps; ad.title = ad.disabled ? 'At most ' + LIMITS.rangeSteps : 'A distance and its modifier; Save puts the steps in order'; wrap.appendChild(ad);
    }
    {   // 1.6.0 (a build's combat module): the field of a target's sheet an attack reads as TargetSize, beside TargetDistance
        var szs = (draft.fields || []).filter(function(f) { return f && typeof f.id === 'string' && (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource'); }).map(function(f) { return [f.id, f.label || f.key || f.id]; });
        var cur = typeof cm.targetSize === 'string' ? cm.targetSize : '', ro = [['', 'None']].concat(szs); if (cur && !szs.some(function(o) { return o[0] === cur; })) ro.push([cur, 'One that is gone']);
        var rz = el('div', 'sys-flags sys-range-sizerow'); rz.appendChild(labeledSelect('sys-range-size', 'Target size reads', ro, cur, 'A number of the target\u2019s sheet that a roll can read, as it reads the distance. A field players cannot read Save drops.'));
        var curB = typeof cm.bodySize === 'string' ? cm.bodySize : '', roB = [['', 'As Target size']].concat(szs); if (curB && !szs.some(function(o) { return o[0] === curB; })) roB.push([curB, 'One that is gone']);   // 1.6.2: the size A body in the way judges by, where it is not the one an attack reads
        rz.appendChild(labeledSelect('sys-range-bodysize', 'A body in the way reads', roB, curB, 'The number of each sheet that A body in the way reads as TargetSize and BodySize, such as a size in steps where an attack reads doublings. As Target size: the same field. A field players cannot read Save drops.'));
        wrap.appendChild(rz);
        var rdW = el('div', 'sys-flags sys-range-readsrow'), rdL = el('label', 'sys-combat-item'); rdL.appendChild(el('span', 'sys-num-cap', 'A roll also reads of its target'));
        var rdI = input('sys-targetreads field', (Array.isArray(cm.targetReads) ? cm.targetReads : []).map(function(id) { var f0 = (draft.fields || []).find(function(f) { return f && f.id === id; }); return f0 ? f0.key : id; }).join(', '), 'The short names of up to 6 number fields of the target\u2019s sheet, separated by commas. A field players cannot read Save drops.', 'Maneuver');
        if (rdI.addEventListener) rdI.addEventListener('input', function(e) { e.stopPropagation(); var w = rdI.value.split(',').map(function(x) { return x.trim(); }).filter(Boolean).map(function(k) { var f0 = (draft.fields || []).find(function(f) { return f && typeof f.key === 'string' && f.key.toLowerCase() === k.toLowerCase(); }); return f0 ? f0.id : k; }); if (w.length) draft.combat.targetReads = w; else delete draft.combat.targetReads; markDirty(); patchErrors(); });
        rdL.appendChild(rdI); rdW.appendChild(rdL);
        var rdT = el('div', 'sys-flags sys-targetticks'), rdOn = (Array.isArray(cm.targetReads) ? cm.targetReads : []).slice(0, 6);   // the same, by name: a tick a number of the sheet, so nobody types a short name
        var rdSync = function() { var n = rdOn.length; Array.prototype.forEach.call(rdT.querySelectorAll ? rdT.querySelectorAll('input.sys-targetread') : [], function(cb) { cb.disabled = !cb.checked && n >= 6; }); };
        szs.forEach(function(o) { var tl = checkLabel('sys-targetread', rdOn.indexOf(o[0]) >= 0, o[1], 'A roll can read this number of its target\u2019s sheet. Up to 6'), cb = tl.firstChild; if (cb && cb.dataset) cb.dataset.fid = o[0];
            if (cb && cb.addEventListener) cb.addEventListener('change', function(e) { e.stopPropagation(); var i = rdOn.indexOf(o[0]); if (cb.checked && i < 0 && rdOn.length < 6) rdOn.push(o[0]); else if (!cb.checked && i >= 0) rdOn.splice(i, 1); else if (cb.checked) cb.checked = false;
                if (rdOn.length) draft.combat.targetReads = rdOn.slice(); else delete draft.combat.targetReads; rdI.value = rdOn.map(function(id) { var f0 = (draft.fields || []).find(function(f) { return f && f.id === id; }); return f0 ? f0.key : id; }).join(', '); rdSync(); markDirty(); patchErrors(); });
            rdT.appendChild(tl); });
        rdSync(); rdW.appendChild(rdT); wrap.appendChild(rdW);
    }
    {   // 1.6.0 (B5): the list of a target's sheet whose rows are its hit locations; a roll reads the row its roller picks as Target.Hit.<name>
        var hls = (draft.fields || []).filter(function(f) { return f && typeof f.id === 'string' && f.kind === 'item-list'; }).map(function(f) { return [f.id, f.label || f.key || f.id]; });
        var curH = typeof cm.targetHit === 'string' ? cm.targetHit : '', roH = [['', 'None']].concat(hls); if (curH && !hls.some(function(o) { return o[0] === curH; })) roH.push([curH, 'One that is gone']);
        var rh = el('div', 'sys-flags sys-range-aimrow'); rh.appendChild(labeledSelect('sys-range-hit', 'Called shots read', roH, curH, 'A list of the target\u2019s sheet whose rows are its hit locations. The roller picks one of the target\u2019s own rows, and a roll can read that row\u2019s stats and columns.'));
        wrap.appendChild(rh);
    }
    if (typeof checkLabel === 'function') wrap.appendChild(checkLabel('sys-combat-hideresist', cm.hideResist === true, 'Hide what a defense needs', 'A roll that reads its attacker, how far the attack succeeded or a figure of the attacker\u2019s sheet, goes to the table as its dice and Success or Failure. The figure it needed stays yours. An attack by one of your characters goes the same way, since its margin would give that figure away. Any other roll is as it was. For one NPC, use Hide figures on its sheet'));   // 1.6.2
    var err = errorCell('range'); err.dataset.errFor = 'range'; wrap.appendChild(err);
    box.appendChild(wrap);
}
// 1.6.0 (the v2 sort's B1): under Roll outcomes, the critical range of Criticals at fixed rolls (two formulas of the roller's names, no dice) and a
// success named at a margin, for any rule. Save cleans them (systemcore cleanCombat); refreshErrors says what it drops, under errorCell('checks')
function checksBox(box, cm) {
    var item = function(cap, i, under) { var l = el('label', 'sys-combat-item'); l.appendChild(el('span', 'sys-num-cap', cap)); l.appendChild(i); box.appendChild(l); lineUnder(box, under); };
    if (cm.checks === 'fixed') {
        var up = cm.critHigh === true;   // 1.6.2: which way a game's rolls run
        if (typeof checkLabel === 'function') box.appendChild(checkLabel('sys-checks-high', up, 'High rolls are good', 'A high natural roll is the critical success and a low one the critical failure, as on a d20. Empty boxes then read 20 and 1. Leave it off where low rolls are good'));
        var ca = input('sys-checks-crit field', typeof cm.critAt === 'string' ? cm.critAt : '', up ? 'A natural roll, the dice alone, at or over this is a critical success. Empty: 20, so only a natural 20. A formula of the roller\u2019s names with no dice' : 'A natural roll, the dice alone, at or under this is a critical success. Empty: 3, so only a natural 3. A formula of the roller\u2019s names with no dice', up ? '20' : '3'); ca.maxLength = LIMITS.formula;
        item('Critical at', ca, up ? 'A natural roll at or over this is a critical success. Empty: a natural 20.' : 'A natural roll at or under this is a critical success. Empty: a natural 3.');
        var fa = input('sys-checks-fumble field', typeof cm.fumbleAt === 'string' ? cm.fumbleAt : '', up ? 'A natural roll, the dice alone, at or under this is a critical failure. Empty: 1, so only a natural 1. A formula of the roller\u2019s names with no dice' : 'A natural roll, the dice alone, at or over this is a critical failure. Empty: 18, so only a natural 18. A formula of the roller\u2019s names with no dice', up ? '1' : '18'); fa.maxLength = LIMITS.formula;
        item('Critical failure at', fa, up ? 'A natural roll at or under this is a critical failure. Empty: a natural 1.' : 'A natural roll at or over this is a critical failure. Empty: a natural 18.');
    }
    var tr = cm.tier && typeof cm.tier === 'object' ? cm.tier : {};
    var tn = input('sys-checks-tiername field', typeof tr.name === 'string' ? tr.name : '', 'A name a success wears on its card when it beats its target by the margin beside it or more. Empty: none', 'e.g. Strong success'); tn.maxLength = 30;
    item('Named success', tn, 'A success by the margin beside it or more wears this name on its card.');
    var ta = el('input', 'field sys-checks-tierat'); ta.type = 'number'; ta.min = '1'; ta.max = '1000000'; ta.step = '1'; ta.value = typeof tr.at === 'number' ? String(tr.at) : ''; ta.placeholder = 'e.g. 5'; ta.title = 'How far a success must beat its target to wear the name: 5 means by 5 or more';
    item('By at least', ta, 'How far it must beat its target.');
    if (typeof cardBox === 'function') { box.appendChild(cardBox(function() { return cm.cardActs; }, function(l) { if (l) cm.cardActs = l; else delete cm.cardActs; }, cm)); var cwL = el('label', 'sys-ask-end'); cwL.appendChild(document.createTextNode('A held card lands by itself after ')); var cwI = input('sys-card-wait field', cm.cardWait === undefined ? '60' : String(cm.cardWait), 'How long a roll with card actions waits to be accepted. Never while its roller is away', '60'); cwI.addEventListener('input', function() { var n = Math.floor(Number(cwI.value)); if (n >= 5 && n !== 60) cm.cardWait = Math.min(600, n); else delete cm.cardWait; markDirty(); }); cwL.appendChild(cwI); cwL.appendChild(document.createTextNode(' seconds')); box.appendChild(cwL); var hwL = el('label', 'sys-ask-end sys-help-defwait'); hwL.appendChild(document.createTextNode('A roll waiting for help rolls by itself after ')); var hwI = input('sys-help-defwaitin field', cm.helpWait === undefined ? '30' : String(cm.helpWait), 'How long a roll ticked Others may help waits, unless the roll sets its own. Its roller can press Roll at any time', '30'); hwI.addEventListener('input', function() { var n = Math.floor(Number(hwI.value)); if (n >= 5 && n !== 30) cm.helpWait = Math.min(600, n); else delete cm.helpWait; markDirty(); }); hwL.appendChild(hwI); hwL.appendChild(document.createTextNode(' seconds')); box.appendChild(hwL); }   // 1.6.2; Assist's wait too
    if (typeof bandBox === 'function') box.appendChild(bandBox(function() { return cm.bands; }, function(l) { if (l) cm.bands = l; else delete cm.bands; }, false, function() { if (typeof renderCombat === 'function') renderCombat(); }));   // 1.6.2: result bands
    var err = errorCell('checks'); err.dataset.errFor = 'checks'; box.appendChild(err);
}
function onChecksInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-checks-') < 0) return false;
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), v = t.value;
    if (c.indexOf('sys-checks-high') >= 0) { if (t.checked) cm.critHigh = true; else delete cm.critHigh; markDirty(); patchErrors(); if (typeof renderCombat === 'function') renderCombat(); return true; }
    if (c.indexOf('sys-checks-crit') >= 0) { if (v.trim()) cm.critAt = v.slice(0, LIMITS.formula); else delete cm.critAt; }
    else if (c.indexOf('sys-checks-fumble') >= 0) { if (v.trim()) cm.fumbleAt = v.slice(0, LIMITS.formula); else delete cm.fumbleAt; }
    else if (c.indexOf('sys-checks-tiername') >= 0 || c.indexOf('sys-checks-tierat') >= 0) {
        var tr = cm.tier && typeof cm.tier === 'object' ? cm.tier : (cm.tier = {});
        if (c.indexOf('sys-checks-tiername') >= 0) { if (v.trim()) tr.name = v.slice(0, 30); else delete tr.name; }
        else { var n = Number(v); if (v.trim() && isFinite(n)) tr.at = n; else delete tr.at; }
        if (tr.name === undefined && tr.at === undefined) delete cm.tier;
    } else return false;
    markDirty(); patchErrors(); return true;
}
function onRangeInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-range-') < 0) return false;
    if (c.indexOf('sys-range-by') >= 0 || c.indexOf('sys-range-unit') >= 0 || c.indexOf('sys-range-size') >= 0 || c.indexOf('sys-range-hit') >= 0) return true;   // their change events do the work
    var rg = rangeDraft();
    if (c.indexOf('sys-range-formula') >= 0) rg.formula = t.value.slice(0, LIMITS.formula);
    else {
        var rw = t.closest('.sys-range-row'), i = rw ? +rw.dataset.ri : -1, s = Array.isArray(rg.steps) && rg.steps[i] && typeof rg.steps[i] === 'object' ? rg.steps[i] : null; if (!s) return true;
        if (c.indexOf('sys-range-sname') >= 0) { var nmv = t.value.slice(0, 30); if (nmv.trim()) s.name = nmv; else delete s.name; markDirty(); patchErrors(); return true; }   // 1.6.0, backlog 30
        var key = c.indexOf('sys-range-sto') >= 0 ? 'to' : c.indexOf('sys-range-smod') >= 0 ? 'mod' : ''; if (!key) return true;
        var nv = Number(t.value); if (t.value.trim() && isFinite(nv)) s[key] = nv; else delete s[key];
    }
    markDirty(); patchErrors(); return true;
}
function onRangeChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-range-') < 0) return false;
    if (c.indexOf('sys-range-bodysize') >= 0) { var cmB = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); if (typeof t.value === 'string' && t.value) cmB.bodySize = t.value; else delete cmB.bodySize; markDirty(); patchErrors(); renderCombat(); return true; }   // 1.6.2; 1.6.3: drawn again, so A body in the way hides says at once whether a size is picked
    if (c.indexOf('sys-range-size') >= 0) { var cmZ = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); if (typeof t.value === 'string' && t.value) cmZ.targetSize = t.value; else delete cmZ.targetSize; markDirty(); patchErrors(); renderCombat(); return true; }   // 1.6.0: TargetSize's field; 1.6.3: drawn again, as A body in the way reads is
    if (c.indexOf('sys-range-hit') >= 0) { var cmH = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); if (typeof t.value === 'string' && t.value) cmH.targetHit = t.value; else delete cmH.targetHit; markDirty(); patchErrors(); return true; }   // 1.6.0 (B5): the list of hit locations
    if (c.indexOf('sys-range-by') < 0 && c.indexOf('sys-range-unit') < 0) return true;   // the boxes' change events (their input events did the work)
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' });
    if (c.indexOf('sys-range-unit') >= 0) { var ru = rangeDraft(); if (typeof t.value === 'string' && Object.prototype.hasOwnProperty.call(RANGE_UNITS, t.value)) ru.unit = t.value; else delete ru.unit; markDirty(); patchErrors(); return true; }
    var want = t.value === 'table' || t.value === 'formula' ? t.value : '';
    if (!want) { delete cm.range; markDirty(); renderAll(); return true; }
    var rg = rangeDraft(), was = rangeBy(rg);
    if (want !== was) {   // what the other way held waits in the draft, in case the GM comes back to it before Save
        if (want === 'table') { if (typeof rg.formula === 'string') rg._f = rg.formula; delete rg.formula; if (Array.isArray(rg._s)) rg.steps = rg._s; delete rg._s; }
        else { if (Array.isArray(rg.steps)) rg._s = rg.steps; delete rg.steps; rg.formula = typeof rg._f === 'string' ? rg._f : ''; delete rg._f; }
    }
    markDirty(); renderAll(); return true;
}
function rangeClick(b) {
    var m = /^rg(add|del)$/.exec(b.dataset.act || ''); if (!m) return false;
    if (m[1] === 'add') {
        var rg = rangeDraft(), arr = Array.isArray(rg.steps) ? rg.steps : (rg.steps = []);
        if (arr.length >= LIMITS.rangeSteps) { toast('At most ' + LIMITS.rangeSteps + '.'); return true; }
        var last = arr.length && arr[arr.length - 1] && typeof arr[arr.length - 1].to === 'number' ? arr[arr.length - 1].to : 0; arr.push({ to: last > 0 ? last * 2 : 10, mod: 0 });
    } else {   // a remove: only a row the table holds (it makes no table of its own)
        var rgD = draft.combat && draft.combat.range, st = rgD && Array.isArray(rgD.steps) ? rgD.steps : [], rw = b.closest('.sys-range-row'), i = rw ? +rw.dataset.ri : -1;
        if (!(i >= 0 && i < st.length && Math.floor(i) === i)) return true;
        st.splice(i, 1);
    }
    markDirty(); renderAll(); return true;
}
// [sinkcheck:rangebox-end]
// Item 19 H2 (the owner's answer, 2026-09-30: a table like the Range box): the Combat tab's Height box — a modifier by how much higher the
// roller stands than the target (HeightDiff, negative looking up): a table of signed steps (up to that difference; below the first row its
// modifier, past the last row its modifier) or a formula reading HeightDiff, in yards, feet or meters. Rolls read HeightMod; the ruler and a
// target mark show it. It keeps combat.height's rule (H1) whatever is chosen here. Every text lands as a value or a text node
// Item 19b H4 (the owner's answer of 2026-10-01): its last row is the True 3D sightline (line3d, true only) and, with it, the Standing height
// (eye): how far above its elevation a token's eye sits, shown and typed in the viewer's own unit (wpStance), kept in yards. Unticked, the
// number waits in the draft (_e) as a table waits behind a formula
// [sinkcheck:heightbox2-start]
function heightDraft() { var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); return cm.height && typeof cm.height === 'object' && !Array.isArray(cm.height) ? cm.height : (cm.height = {}); }
function heightBy(hg) { return !hg || typeof hg !== 'object' || Array.isArray(hg) ? '' : typeof hg.formula === 'string' ? 'formula' : Array.isArray(hg.steps) ? 'table' : ''; }
function heightBox(box, cm) {
    var hg = cm.height && typeof cm.height === 'object' && !Array.isArray(cm.height) ? cm.height : null, by = heightBy(hg), wrap = el('div', 'sys-range sys-height');
    wrap.appendChild(el('div', 'sys-light-head', 'Height'));
    wrap.appendChild(el('div', 'sys-note', 'Your game\u2019s height modifier: by how much higher the roller stands than the target (with Token elevation on). Rolls can read it, and the ruler between two character tokens and each target mark show it. A table gives each difference\u2019s modifier, lowest first: a difference below 0 is looking up (up to that difference; below the first row its modifier, past the last row its modifier); or work it out from the difference.'));
    var r1 = el('div', 'sys-flags sys-height-top');
    r1.appendChild(labeledSelect('sys-height-by', 'Height modifier', [['', 'None'], ['table', 'By a table'], ['formula', 'By a formula']], by, 'None: no height modifier. A table: a modifier for each height difference. A formula: a modifier worked out from HeightDiff.'));
    if (by) r1.appendChild(labeledSelect('sys-height-unit', 'Counts in', [['yd', 'yards'], ['ft', 'feet'], ['m', 'meters']], typeof hg.unit === 'string' && Object.prototype.hasOwnProperty.call(HEIGHT_UNITS, hg.unit) ? hg.unit : 'yd', 'What its differences count in: a token\u2019s elevation is converted into it'));
    wrap.appendChild(r1);
    if (by === 'formula') {
        var fr = el('div', 'sys-flags sys-height-frow'), fm = input('sys-height-formula field', typeof hg.formula === 'string' ? hg.formula : '', 'The modifier at a height difference: HeightDiff is how much higher the roller stands than the target, in the unit above (below 0 looking up); no dice, and no other name', 'Modifier, e.g. floor(HeightDiff / 5)');
        fm.maxLength = LIMITS.formula; fr.appendChild(fm); wrap.appendChild(fr);
    } else if (by === 'table') {
        var st = Array.isArray(hg.steps) ? hg.steps : [];
        st.forEach(function(s0, i) {
            var s = s0 && typeof s0 === 'object' ? s0 : {}, rw = el('div', 'sys-flags sys-height-row'); rw.dataset.hi = String(i);
            [['to', 'Up to', 'How much higher (below 0: lower) this step reaches'], ['mod', 'Modifier', 'The modifier up to this difference: +1, -1, or 0 for none']].forEach(function(g) {
                var nl = el('label', 'sys-num'); if (i === 0) nl.appendChild(el('span', 'sys-num-cap', g[1]));
                var ni = el('input', 'field sys-height-s' + g[0]); ni.type = 'number'; ni.step = 'any'; if (g[0] === 'to') { ni.min = '-1000000'; ni.max = '1000000'; } else { ni.min = '-1000'; ni.max = '1000'; }
                ni.value = typeof s[g[0]] === 'number' ? String(s[g[0]]) : ''; ni.title = g[2]; nl.appendChild(ni); rw.appendChild(nl);
            });
            var db = el('button', 'tool ghost sys-btn', '\u00d7'); db.dataset.act = 'htdel'; db.title = 'Remove this step'; rw.appendChild(db);
            wrap.appendChild(rw);
        });
        var ad = el('button', 'tool ghost sys-btn sys-height-add', '+ Step'); ad.dataset.act = 'htadd'; ad.disabled = st.length >= LIMITS.heightSteps; ad.title = ad.disabled ? 'At most ' + LIMITS.heightSteps : 'A height difference and its modifier; Save puts the steps in order'; wrap.appendChild(ad);
    }
    var St = heightStance(), on3 = !!hg && hg.line3d === true, r3 = el('div', 'sys-flags sys-height-3drow'), l3 = el('label', 'sys-hover'), c3 = el('input', 'sys-height-3d'); c3.type = 'checkbox'; c3.checked = on3;
    l3.appendChild(c3); l3.appendChild(document.createTextNode(' True 3D sightline'));
    l3.title = 'With Token elevation on, a piece with a Height (a crate, a low wall, a sight-blocker you gave one) stops a line only where the straight line from the viewer\u2019s eye to the target runs at or below it: in the fog, on the ruler, at target marks and for blasts. A sight-blocker with no Height is full height. It takes the place of Height clears low cover'; r3.appendChild(l3);
    if (on3) {
        var n3 = el('label', 'sys-num'); n3.appendChild(el('span', 'sys-num-cap', 'Standing height (' + (St && St.lenUnit() === 'm' ? 'meters' : 'yards') + ')')); r3.appendChild(n3);
        var e3 = el('input', 'field sys-height-eye'), ev = typeof hg.eye === 'number' && isFinite(hg.eye) ? hg.eye : null; e3.type = 'number'; e3.min = '0'; e3.step = 'any'; e3.placeholder = 'none';
        e3.value = ev === null ? '' : String(Math.round((St ? St.ydOut(ev) : ev) * 100) / 100);
        e3.title = 'How far above its elevation a token\u2019s eye sits. Blank: the eye is at the token\u2019s elevation. The target is judged at its own elevation'; n3.appendChild(e3);
    }
    wrap.appendChild(r3);
    var err = errorCell('height'); err.dataset.errFor = 'height'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function heightStance() { var St = typeof window !== 'undefined' && window && window.wpStance ? window.wpStance : null; return St && typeof St.lenUnit === 'function' && typeof St.ydOut === 'function' && typeof St.ydIn === 'function' ? St : null; }   // the viewer's unit for a height (whiteboard.js); none: yards
function onHeightInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-height-') < 0) return false;
    if (c.indexOf('sys-height-by') >= 0 || c.indexOf('sys-height-unit') >= 0 || c.indexOf('sys-height-3d') >= 0) return true;   // their change events do the work
    var hg = heightDraft();
    if (c.indexOf('sys-height-eye') >= 0) {   // item 19b H4: typed in the viewer's unit, kept in yards; empty or no number: none
        var St = heightStance(), raw = typeof t.value === 'string' ? t.value.trim() : '', ne = raw ? Number(raw) : NaN, yd = isFinite(ne) ? (St ? St.ydIn(ne) : ne) : NaN;
        if (typeof yd === 'number' && isFinite(yd)) hg.eye = yd; else delete hg.eye;
        if (!Object.keys(hg).length) delete draft.combat.height;
        markDirty(); patchErrors(); return true;
    }
    if (c.indexOf('sys-height-formula') >= 0) hg.formula = t.value.slice(0, LIMITS.formula);
    else {
        var rw = t.closest('.sys-height-row'), i = rw ? +rw.dataset.hi : -1, s = Array.isArray(hg.steps) && hg.steps[i] && typeof hg.steps[i] === 'object' ? hg.steps[i] : null; if (!s) return true;
        var key = c.indexOf('sys-height-sto') >= 0 ? 'to' : c.indexOf('sys-height-smod') >= 0 ? 'mod' : ''; if (!key) return true;
        var nv = Number(t.value); if (t.value.trim() && isFinite(nv)) s[key] = nv; else delete s[key];
    }
    markDirty(); patchErrors(); return true;
}
function onHeightChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-height-') < 0) return false;
    if (c.indexOf('sys-height-3d') >= 0) {   // item 19b H4: the True 3D sightline, true only; its standing height waits in the draft while it is off
        var h3 = heightDraft();
        if (t.checked === true) { h3.line3d = true; if (typeof h3._e === 'number') h3.eye = h3._e; delete h3._e; }
        else { delete h3.line3d; if (typeof h3.eye === 'number') h3._e = h3.eye; delete h3.eye; if (!Object.keys(h3).length) delete draft.combat.height; }
        markDirty(); renderAll(); return true;
    }
    if (c.indexOf('sys-height-by') < 0 && c.indexOf('sys-height-unit') < 0) return true;   // the boxes' change events (their input events did the work)
    if (c.indexOf('sys-height-unit') >= 0) { var hu = heightDraft(); if (typeof t.value === 'string' && Object.prototype.hasOwnProperty.call(HEIGHT_UNITS, t.value)) hu.unit = t.value; else delete hu.unit; markDirty(); patchErrors(); return true; }
    var want = t.value === 'table' || t.value === 'formula' ? t.value : '', hg = heightDraft(), was = heightBy(hg);
    if (!want) { ['steps', 'formula', 'unit', '_f', '_s'].forEach(function(k) { delete hg[k]; }); if (!Object.keys(hg).length) delete draft.combat.height; markDirty(); renderAll(); return true; }   // H1's rule stays
    if (want !== was) {   // what the other way held waits in the draft, in case the GM comes back to it before Save
        if (want === 'table') { if (typeof hg.formula === 'string') hg._f = hg.formula; delete hg.formula; hg.steps = Array.isArray(hg._s) ? hg._s : []; delete hg._s; }
        else { if (Array.isArray(hg.steps)) hg._s = hg.steps; delete hg.steps; hg.formula = typeof hg._f === 'string' ? hg._f : ''; delete hg._f; }
    }
    markDirty(); renderAll(); return true;
}
function heightClick(b) {
    var m = /^ht(add|del)$/.exec(b.dataset.act || ''); if (!m) return false;
    if (m[1] === 'add') {
        var hg = heightDraft(), arr = Array.isArray(hg.steps) ? hg.steps : (hg.steps = []);
        if (arr.length >= LIMITS.heightSteps) { toast('At most ' + LIMITS.heightSteps + '.'); return true; }
        var last = arr.length && arr[arr.length - 1] && typeof arr[arr.length - 1].to === 'number' ? arr[arr.length - 1].to : null; arr.push({ to: last === null ? 0 : last + 5, mod: 0 });
    } else {   // a remove: only a row the table holds
        var hgD = draft.combat && draft.combat.height, st = hgD && Array.isArray(hgD.steps) ? hgD.steps : [], rw = b.closest('.sys-height-row'), i = rw ? +rw.dataset.hi : -1;
        if (!(i >= 0 && i < st.length && Math.floor(i) === i)) return true;
        st.splice(i, 1);
    }
    markDirty(); renderAll(); return true;
}
// [sinkcheck:heightbox2-end]
// [split:body-end]
return { arcsBox: arcsBox, barsBox: barsBox, barsClick: barsClick, bodiesBox: bodiesBox, checksBox: checksBox, damageBox: damageBox, damageClick: damageClick, damageSays: damageSays, darkBox: darkBox, dbxBtn: dbxBtn, dbxCap: dbxCap, gmStatSays: gmStatSays, heightBox: heightBox, heightClick: heightClick, holdsBox: holdsBox, kindsNamed: kindsNamed, lightBox: lightBox, lightClick: lightClick, mapKindsBox: mapKindsBox, onBarsChange: onBarsChange, onChecksInput: onChecksInput, onDamageChange: onDamageChange, onDamageInput: onDamageInput, onHeightChange: onHeightChange, onHeightInput: onHeightInput, onHoldChange: onHoldChange, onHoldInput: onHoldInput, onLightChange: onLightChange, onLightInput: onLightInput, onPostureChange: onPostureChange, onPostureInput: onPostureInput, onRangeChange: onRangeChange, onRangeInput: onRangeInput, onRemoveBox: onRemoveBox, onRemoveChange: onRemoveChange, onRemoveSays: onRemoveSays, postureBox: postureBox, postureClick: postureClick, rangeBox: rangeBox, rangeBy: rangeBy, rangeClick: rangeClick, scenesBox: scenesBox, switchChangesBox: switchChangesBox, switchChangesChange: switchChangesChange, switchChangesSays: switchChangesSays, terrainBox: terrainBox, terrainSettleAll: terrainSettleAll, travelBox: travelBox, upkeepBox: upkeepBox, upkeepChange: upkeepChange };   // [split:glue]
}   // [split:glue]
