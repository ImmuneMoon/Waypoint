/* sheetevery.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 2, time rules; split 2026-11-18 with no change in behavior).
   What it holds: the System editor's Rolls tab rows that set a rule up to run by time, in the [sinkcheck:everyrow-*] lines. By the
   clock (everyRow), In a fight (fightRow), When a value crosses (crossRow, listCrossRow and their edits), Ask me first (askRow), where
   a rule's runs are said (noteRow), and the edits of those boxes (everyEdit, everyBare). The runs themselves live in sheettime.js.
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sheetEvery() at
   its line `// [split:sheetevery.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in sheets.js. */
// [split:of sheets.js]
import { LIMITS, cleanEvery, cleanInFight, draft, el, input, lineUnder, select, tab } from './sheets.js';   // [split:glue]
export function sheetEvery() {   // [split:glue]
// [split:body-start]
// [sinkcheck:everyrow-start]
// Item 20 K5 (the owner's answers of 2026-09-30): a roll or an apply action may also run by the campaign's clock (the Calendar) — every n minutes,
// hours, days, weeks or the system's own time units (the Combat tab's Turns box), during rest only or any time; the GM moves the clock as Rest
// or Active and says which characters' rules run. Its boxes land as values; Save cleans them (systemcore cleanEvery).
// Backlog 152, fold 5 (docs/FIGHT_CLOCK_DESIGN.md 13, the builder's pieces): By the clock's Waits in a fight tick, the In a fight row (every n
// rounds, minutes, hours or the system's own time units, and Each fight starts again) and Ask me first, so that any system can make the time
// rules the fight clock runs. Values and text nodes only; Save cleans them (systemcore cleanEvery, cleanInFight, and Ask me first only beside
// one of the two, in the GM's view alone)
function everyRow(r) {
    var ev = r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : null, row = el('div', 'sys-flags sys-roll-everyrow');
    row.appendChild(el('span', 'sys-num-cap', 'By the clock'));
    var n = el('input', 'field sys-roll-evn'); n.type = 'number'; n.min = '1'; n.max = '1000'; n.step = '1'; n.placeholder = 'Every'; n.value = ev && typeof ev.n === 'number' && isFinite(ev.n) ? String(ev.n) : ''; n.title = 'With the Calendar on, it also runs every so many of the unit beside as the clock moves on (empty: never by the clock)'; row.appendChild(n);
    var tn = draft && draft.combat && draft.combat.turn, tus = tn && typeof tn === 'object' && Array.isArray(tn.units) ? tn.units.filter(function(u) { return u && typeof u.key === 'string' && u.key; }) : [];
    var opts = [['min', 'minutes'], ['hour', 'hours'], ['day', 'days'], ['week', 'weeks']].concat(tus.map(function(u) { return [u.key, typeof u.label === 'string' && u.label ? u.label : u.key]; }));
    var cur = ev && typeof ev.u === 'string' && ev.u ? ev.u : 'day'; if (!opts.some(function(o) { return o[0] === cur; })) opts.push([cur, cur + ' (no such unit)']);
    row.appendChild(select('sys-roll-evu', opts, cur, 'What it counts in: the calendar\u2019s minutes, hours, days and weeks, or one of your time units (the Combat tab\u2019s Turns box)'));
    var rl = el('label', 'sys-hover'), rc = el('input', 'sys-roll-evrest'); rc.type = 'checkbox'; rc.checked = !!(ev && ev.rest === true); rc.title = 'It counts rest only: time the GM moves on as Rest; activity starts its count again'; rl.appendChild(rc); rl.appendChild(document.createTextNode(' During rest only')); row.appendChild(rl);
    var wl = el('label', 'sys-hover'), wc = el('input', 'sys-roll-evwait'); wc.type = 'checkbox'; wc.checked = !!(ev && ev.wait === true); wc.title = 'Its count waits while its character is in a fight, and goes on after it. A fight still breaks a rest.'; wl.appendChild(wc); wl.appendChild(document.createTextNode(' Waits in a fight')); row.appendChild(wl);
    var hl = el('label', 'sys-hover'), hc = el('input', 'sys-roll-evhold'); hc.type = 'checkbox'; hc.checked = !!(ev && ev.whileNeeds === true); hc.title = 'Its count grows only while this rule\u2019s Needs hold for its character, and stands still the rest of the time. Save keeps the tick only beside Needs or a reason.'; hl.appendChild(hc); hl.appendChild(document.createTextNode(' Only while its needs hold')); row.appendChild(hl);   // 1.5.5
    return row;
}
function fightRow(r) {   // In a fight: every n rounds, minutes, hours or the system's own time units of a fight's own time, and whether each fight starts its count again
    var fi = r.inFight && typeof r.inFight === 'object' && !Array.isArray(r.inFight) ? r.inFight : null, row = el('div', 'sys-flags sys-roll-fightrow');
    row.appendChild(el('span', 'sys-num-cap', 'In a fight'));
    var n = el('input', 'field sys-roll-ifn'); n.type = 'number'; n.min = '1'; n.max = '1000'; n.step = '1'; n.placeholder = 'Every'; n.value = fi && typeof fi.n === 'number' && isFinite(fi.n) ? String(fi.n) : ''; n.title = 'It runs every so many of the unit beside while its character is in a fight, by the fight\u2019s own time. Leave it empty and it never runs in a fight.'; row.appendChild(n);
    var tn = draft && draft.combat && draft.combat.turn, tus = tn && typeof tn === 'object' && Array.isArray(tn.units) ? tn.units.filter(function(u) { return u && typeof u.key === 'string' && u.key; }) : [];
    var opts = [['round', 'rounds'], ['min', 'minutes'], ['hour', 'hours']].concat(tus.map(function(u) { return [u.key, typeof u.label === 'string' && u.label ? u.label : u.key]; }));
    var cur = fi && typeof fi.u === 'string' && fi.u ? fi.u : 'round'; if (!opts.some(function(o) { return o[0] === cur; })) opts.push([cur, cur + ' (no such unit)']);
    row.appendChild(select('sys-roll-ifu', opts, cur, 'What it counts in: a fight\u2019s rounds, minutes or hours, or one of your time units from the Combat tab\u2019s Turns box. A round lasts as long as the Turns box says.'));
    var fl = el('label', 'sys-hover'), fc = el('input', 'sys-roll-iffresh'); fc.type = 'checkbox'; fc.checked = !!(fi && fi.fresh === true); fc.title = 'Its count begins again with each fight. Left unticked, its count goes on from one fight to the next.'; fl.appendChild(fc); fl.appendChild(document.createTextNode(' Each fight starts again')); row.appendChild(fl);
    var hl = el('label', 'sys-hover'), hc = el('input', 'sys-roll-ifhold'); hc.type = 'checkbox'; hc.checked = !!(fi && fi.whileNeeds === true); hc.title = 'In a fight, its count grows only while this rule\u2019s Needs hold for its character, and stands still the rest of the time. Save keeps the tick only beside Needs or a reason.'; hl.appendChild(hc); hl.appendChild(document.createTextNode(' Only while its needs hold')); row.appendChild(hl);   // 1.5.5
    return row;
}
// 1.5.9 (docs/BOOK_ES_ET_PLAN.md 4a): When a value crosses, a pool or a number of the system, the step where it first does, how far apart the next are
// and how many, Once however many, and who runs it; every text a value, the fields named as text
function crossRow(r) {
    var cr = r.cross && typeof r.cross === 'object' ? r.cross : null, row = el('div', 'sys-flags sys-roll-xsrow');
    var fl = [['', 'Runs on no value crossing a step']].concat((draft.fields || []).filter(function(f) { return f && (f.kind === 'resource' || f.kind === 'number'); }).map(function(f) { return [f.id, 'When ' + (f.label || f.key) + ' crosses a step']; }));
    row.appendChild(select('sys-roll-xsf', fl, cr ? cr.f : '', 'It also runs when this pool or number passes a step, as a death check when HP falls to minus its most. Set by hand counts too'));
    if (!cr) return row;
    row.appendChild(select('sys-roll-xsd', [['down', 'falling to'], ['up', 'rising to']], cr.dir === 'up' ? 'up' : 'down', 'Falling: from above a step to at or below it. Rising: from below to at or above'));
    var at = input('sys-roll-xsat field', cr.at || '', 'The first step, a formula with no dice, such as -HP.max', 'First at'); at.maxLength = LIMITS.formula; row.appendChild(at);
    var st = input('sys-roll-xsstep field', cr.step || '', 'How far apart the next steps are, such as HP.max. Empty: one step', 'Then every'); st.maxLength = LIMITS.formula; row.appendChild(st);
    if (cr.step) { var cn = input('sys-roll-xsn field', cr.count ? String(cr.count) : '', 'How many steps in all, 2 to 20', 'Steps'); cn.type = 'number'; row.appendChild(cn); var ol = el('label', 'sys-hover'), oc = el('input', 'sys-roll-xsone'); oc.type = 'checkbox'; oc.checked = cr.one === true; ol.appendChild(oc); ol.appendChild(document.createTextNode(' Once however many')); ol.title = 'Runs once when one change passes several steps, not once a step'; row.appendChild(ol); }
    row.appendChild(select('sys-roll-xsby', [['', 'runs at once'], ['owner', 'reminds its player'], ['gm', 'reminds me']], cr.by === 'owner' || cr.by === 'gm' ? cr.by : '', 'At once, as your own press of it, or as a reminder in chat with its button'));
    if (!Array.isArray(r.apply)) {   // 1.6.2 (backlog 242; the CORE Master: a hit's own effects do not apply to the rolls the same hit calls for): a roll's alone
        var bl = el('label', 'sys-hover'), bc = el('input', 'sys-roll-xsblow'); bc.type = 'checkbox'; bc.checked = cr.asAt === true; bl.appendChild(bc); bl.appendChild(document.createTextNode(' Reads the sheet as the blow left it'));
        bl.title = 'Where a hit makes the crossing, the roll leaves out the effects that same hit put on, as a death check leaves out the hit\u2019s own Rattled. It can also read the blow and where it struck. Any other crossing rolls on the sheet as it stands';
        row.appendChild(bl); if (typeof lineUnder === 'function') lineUnder(row, 'A hit\u2019s own effects come after this roll.');
    }
    return row;
}
// 1.6.0: the Lists card's crossing on a row's counter, beside a list's roll or action: shown where the list has a counter (or one is set)
function listCrossRow(rr, ri, cts) {
    var cr = rr && rr.cross && typeof rr.cross === 'object' ? rr.cross : null, ks = (Array.isArray(cts) ? cts : []).filter(function(k) { return k && typeof k === 'object' && typeof k.key === 'string' && k.key; });
    if (!ks.length && !cr) return null;
    var row = el('div', 'sys-flags sys-list-xsrow'); row.dataset.ri = String(ri);
    row.appendChild(select('sys-list-xsct', [['', 'Runs on no counter crossing a step']].concat(ks.map(function(k) { return [k.key, 'When a row\u2019s ' + (k.label || k.key) + ' crosses a step']; })), cr ? cr.ct : '', 'It also runs on a row when that row\u2019s counter passes a step, read with the row\u2019s names, as a cost taken each time a count goes up. Set by hand counts too'));
    if (!cr) return row;
    row.appendChild(select('sys-list-xsd', [['up', 'rising to'], ['down', 'falling to']], cr.dir === 'up' ? 'up' : 'down', 'Rising: from below a step to at or above it. Falling: from above to at or below'));
    var at = input('sys-list-xsat field', cr.at || '', 'The first step, a formula with no dice, such as 1 or Row.Grace', 'First at'); at.maxLength = LIMITS.formula; row.appendChild(at);
    var st = input('sys-list-xsstep field', cr.step || '', 'How far apart the next steps are, such as 1. Empty: one step', 'Then every'); st.maxLength = LIMITS.formula; row.appendChild(st);
    if (cr.step) { var cn = input('sys-list-xsn field', cr.count ? String(cr.count) : '', 'How many steps in all, 2 to 20', 'Steps'); cn.type = 'number'; row.appendChild(cn); var ol = el('label', 'sys-hover'), oc = el('input', 'sys-list-xsone'); oc.type = 'checkbox'; oc.checked = cr.one === true; ol.appendChild(oc); ol.appendChild(document.createTextNode(' Once however many')); ol.title = 'One change that passes several steps runs it once'; row.appendChild(ol); }
    return row;
}
function listCrossEdit(rr, c, t) {
    var cr = rr.cross && typeof rr.cross === 'object' ? rr.cross : null;
    if (c.indexOf('sys-list-xsct') >= 0) { if (t.value) rr.cross = Object.assign({ dir: 'up', at: '1', step: '1', count: 20 }, cr || {}, { ct: t.value }); else delete rr.cross; return 'all'; }
    if (!cr) return '';
    if (c.indexOf('sys-list-xsd') >= 0) { cr.dir = t.value === 'up' ? 'up' : 'down'; return 'one'; }
    if (c.indexOf('sys-list-xsat') >= 0) { cr.at = String(t.value).slice(0, LIMITS.formula); return 'one'; }
    if (c.indexOf('sys-list-xsstep') >= 0) { var sv = String(t.value).slice(0, LIMITS.formula), had = !!cr.step; if (sv.trim()) cr.step = sv; else { delete cr.step; delete cr.count; delete cr.one; } return had !== !!cr.step ? 'all' : 'one'; }
    if (c.indexOf('sys-list-xsn') >= 0) { var nv = Number(t.value); if (String(t.value).trim() && isFinite(nv)) cr.count = nv; else delete cr.count; return 'one'; }
    if (c.indexOf('sys-list-xsone') >= 0) { if (t.checked) cr.one = true; else delete cr.one; return 'one'; }
    return '';
}
function crossEdit(r, c, t) {
    var cr = r.cross && typeof r.cross === 'object' ? r.cross : null;
    if (c.indexOf('sys-roll-xsf') >= 0) { if (t.value) r.cross = Object.assign({ dir: 'down', at: '0' }, cr || {}, { f: t.value }); else delete r.cross; return 'all'; }
    if (!cr) return '';
    if (c.indexOf('sys-roll-xsblow') >= 0) { if (t.checked) cr.asAt = true; else delete cr.asAt; return 'one'; }   // 1.6.2 (242): Reads the sheet as the blow left it
    if (c.indexOf('sys-roll-xsd') >= 0) { cr.dir = t.value === 'up' ? 'up' : 'down'; return 'one'; }
    if (c.indexOf('sys-roll-xsat') >= 0) { cr.at = String(t.value).slice(0, LIMITS.formula); return 'one'; }
    if (c.indexOf('sys-roll-xsstep') >= 0) { var sv = String(t.value).slice(0, LIMITS.formula), had = !!cr.step; if (sv.trim()) cr.step = sv; else { delete cr.step; delete cr.count; delete cr.one; } return had !== !!cr.step ? 'all' : 'one'; }
    if (c.indexOf('sys-roll-xsn') >= 0) { var nv = Number(t.value); if (String(t.value).trim() && isFinite(nv)) cr.count = nv; else delete cr.count; return 'one'; }
    if (c.indexOf('sys-roll-xsone') >= 0) { if (t.checked) cr.one = true; else delete cr.one; return 'one'; }
    if (c.indexOf('sys-roll-xsby') >= 0) { if (t.value === 'owner' || t.value === 'gm') cr.by = t.value; else delete cr.by; return 'one'; }
    return '';
}
function askRow(r) {   // Ask me first: its runs wait for the GM's word
    var row = el('div', 'sys-flags sys-roll-askrow'), al = el('label', 'sys-hover'), ac = el('input', 'sys-roll-evask'); ac.type = 'checkbox'; ac.checked = r.ask === true; ac.title = 'Its runs wait for your word, even when Time rules run at once. With the Calendar on they wait in the Calendar window\u2019s list. With it off they wait in the bell in the top row.'; al.appendChild(ac); al.appendChild(document.createTextNode(' Ask me first')); row.appendChild(al);
    return row;
}
function noteRow(r) {   // 1.6.0, backlog 173: where its runs are said
    var row = el('div', 'sys-flags sys-roll-noterow'), nl = el('label', 'sys-hover'), ns = el('select', 'field sys-roll-tnote'); ns.title = 'Where its runs are said. In chat counts it on the run\u2019s one chat line. Panel only keeps it in the Time rules panel and the Game Record. Players never told: its player is not told of it either.'; [['', 'In chat'], ['panel', 'Panel only'], ['quiet', 'Panel only, players never told']].forEach(function(o) { var op = el('option', '', o[1]); op.value = o[0]; if ((r.notes || '') === o[0]) op.selected = true; ns.appendChild(op); }); nl.appendChild(document.createTextNode('Notes ')); nl.appendChild(ns); row.appendChild(nl);
    return row;
}
function everyBare(r, k, u) { var o = r[k]; if (o && typeof o === 'object' && !Array.isArray(o) && o.u === u && Object.keys(o).length === 1) delete r[k]; }   // a tick taken off a rule that holds nothing but the shown unit takes the rule away, so no line stays under it
function everyEdit(r, c, t) {   // the By the clock, In a fight and Ask me first boxes' edits; a unit or a tick before any number keeps the shown unit
    if (c.indexOf('sys-roll-evn') >= 0) { var v = Number(t.value); r.every = Object.assign({ u: 'day' }, r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : {}); if (String(t.value).trim() && isFinite(v)) r.every.n = v; else delete r.every; return true; }
    if (c.indexOf('sys-roll-evu') >= 0) { r.every = Object.assign({}, r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : {}); r.every.u = String(t.value).slice(0, 24); return true; }
    if (c.indexOf('sys-roll-evrest') >= 0) { r.every = Object.assign({ u: 'day' }, r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : {}); if (t.checked === true) r.every.rest = true; else { delete r.every.rest; everyBare(r, 'every', 'day'); } return true; }
    if (c.indexOf('sys-roll-evwait') >= 0) { r.every = Object.assign({ u: 'day' }, r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : {}); if (t.checked === true) r.every.wait = true; else { delete r.every.wait; everyBare(r, 'every', 'day'); } return true; }   // backlog 152, fold 5
    if (c.indexOf('sys-roll-ifn') >= 0) { var vf = Number(t.value); r.inFight = Object.assign({ u: 'round' }, r.inFight && typeof r.inFight === 'object' && !Array.isArray(r.inFight) ? r.inFight : {}); if (String(t.value).trim() && isFinite(vf)) r.inFight.n = vf; else delete r.inFight; return true; }
    if (c.indexOf('sys-roll-ifu') >= 0) { r.inFight = Object.assign({}, r.inFight && typeof r.inFight === 'object' && !Array.isArray(r.inFight) ? r.inFight : {}); r.inFight.u = String(t.value).slice(0, 24); return true; }
    if (c.indexOf('sys-roll-iffresh') >= 0) { r.inFight = Object.assign({ u: 'round' }, r.inFight && typeof r.inFight === 'object' && !Array.isArray(r.inFight) ? r.inFight : {}); if (t.checked === true) r.inFight.fresh = true; else { delete r.inFight.fresh; everyBare(r, 'inFight', 'round'); } return true; }
    if (c.indexOf('sys-roll-evhold') >= 0) { r.every = Object.assign({ u: 'day' }, r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : {}); if (t.checked === true) r.every.whileNeeds = true; else { delete r.every.whileNeeds; everyBare(r, 'every', 'day'); } return true; }   // 1.5.5: Only while its needs hold
    if (c.indexOf('sys-roll-ifhold') >= 0) { r.inFight = Object.assign({ u: 'round' }, r.inFight && typeof r.inFight === 'object' && !Array.isArray(r.inFight) ? r.inFight : {}); if (t.checked === true) r.inFight.whileNeeds = true; else { delete r.inFight.whileNeeds; everyBare(r, 'inFight', 'round'); } return true; }
    if (c.indexOf('sys-roll-evask') >= 0) { if (t.checked === true) r.ask = true; else delete r.ask; return true; }
    if (c.indexOf('sys-roll-tnote') >= 0) { if (t.value === 'panel' || t.value === 'quiet') r.notes = t.value; else delete r.notes; return true; }   // 1.6.0, backlog 173
    return false;
}
// [sinkcheck:everyrow-end]
// [split:body-end]
return { askRow: askRow, crossEdit: crossEdit, crossRow: crossRow, everyEdit: everyEdit, everyRow: everyRow, fightRow: fightRow, listCrossEdit: listCrossEdit, listCrossRow: listCrossRow, noteRow: noteRow };   // [split:glue]
}   // [split:glue]
