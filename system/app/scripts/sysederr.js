/* sysederr.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 7, the System editor; split 2026-11-19 with no change in behavior).
   What it holds: what Save does and what it says before it: saveDraft, the references a field keeps and the warnings they give
   (refKeys, refCats, refWarns), and refreshErrors, every line the System editor says under a row. The small controls every tab builds
   its rows from (errorCell, errPrefix, patchErrors, input, select, labeledSelect, fieldRow and their kin) stay in sheets.js just after it.
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sysedErr() at
   its line `// [split:sysederr.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (tools/splitcheck.js holds it): the editor's own state (draft, dirty, tab, layoutView and
   the rest) stands in sheets.js and a part sets it through the setters beside `var draft`. Change the code here as if it still stood
   in sheets.js. */
// [split:of sheets.js]
import { CAL_LIMITS, F, FEEDS_MAX, KINDS, LIMITS, TIME_WORDS, callDrops, canWrite, capFOk, catChoices, catNear, catsGone, cleanCalendar, cleanCover, cleanEvery, cleanFieldLock, cleanFieldUnit, cleanFormulaText, cleanInFight, cleanItemKey, cleanListSpec, cleanNeedsWhy, cleanReach, cleanSystem, cleanTier, cleanTurn, clone, coverHitSays, crewDrops, crossFollow, damageSays, defendSays, dirtySet, draft, draftSet, envSays, errorsById, fitIfOk, getActiveCampaign, gmDerivedNames, gmFacing, gmStatSays, gmViewFields, goneRefs, grantSays, hasDice, itemReach, keyFromLabel, keyUseSays, keyUses, keysGone, linkSays, lvlBoxSays, markDirty, modsIfOk, net, onRemoveSays, opt, orphanRows, placeCatErrs, placeCatNames, rangeBy, reCleanChars, renamesCarry, renamesOf, renamesOnChars, renamesSay, renderAll, renderViews, save, secretFieldIds, select, senseArcOf, senseRangeFields, senseSecrets, senseSwitchFields, stampRows, standSays, starterSaved, startsSay, statKey, switchChangesSays, sync, systemOf, tab, tableSays, terrainSettleAll, toast, turnHoldSays, turnRunSays, ui, unheldRolls, unitOf, validKey, validateSystem, warningsById, whyDraftAt, whyDropsAt, withRowDrops, withRowRoll } from './sheets.js';   // [split:glue]
export function sysedErr() {   // [split:glue]
// [split:body-start]
function saveDraft() {
    if (!draft || !canWrite()) return;
    var camp = getActiveCampaign(); if (!camp) return;
    var rnS = typeof renamesCarry === 'function' ? renamesCarry(camp.system, draft) : null;   // 1.6.2 (backlog 208): an option, a station or a list's roll renamed: what names it follows
    draft.name = (ui('sysName').value || '').trim().slice(0, LIMITS.name);
    if (ui('sysMark')) { var mkD = ui('sysMark').value.trim(); if (mkD) draft.mark = mkD; else delete draft.mark; }
    if (ui('sysMakeRolls')) { var mrD = ui('sysMakeRolls').value; if (mrD === 'gm' || mrD === 'self') draft.makeRolls = mrD; else delete draft.makeRolls; }   // 1.6.3 (finding 22): Rolls while making, as the editor shows it   // 1.6.0: a word only; the cleaner keeps it or drops it
    var snD = draft.combat && draft.combat.senses && typeof draft.combat.senses === 'object' && Array.isArray(draft.combat.senses.list) ? draft.combat.senses : null, pendS = snD ? snD.list.filter(function(s) { return !!s && s.unit === '?'; }) : [], src = draft;   // senses S2a: a sense still waiting for its unit is left out (never a silent yards), and stays in the editor
    if (pendS.length) src = Object.assign({}, draft, { combat: Object.assign({}, draft.combat, { senses: Object.assign({}, snD, { list: snD.list.filter(function(s) { return !(s && s.unit === '?'); }) }) }) });
    var clean = cleanSystem(src, { F: F(), gmView: true });
    if (!clean) { toast('The system could not be saved.'); return; }
    var dropped = draft.fields.length - clean.fields.length;
    clean.updated = Date.now();
    var prevSys = camp.system, orphaned = orphanRows(prevSys, clean, camp.chars || {});   // Stage 6 F4a: a copy of a deleted entry keeps it (before the re-check drops unknown rows)
    var terrMaps = typeof terrainSettleAll === 'function' ? terrainSettleAll(camp, prevSys, clean) : [];   // 1.6.2 (backlog 57): pieces of a kind that was re-costed or removed, before the save
    if (terrMaps.length && window.wpHistBarrier) window.wpHistBarrier(terrMaps);   // an undo on one of those maps never brings a cost or a kind from before this Save back
    if (rnS) renamesOnChars(camp.chars || {}, rnS);   // 1.6.2: before the re-check, which would drop a list field's old option and a station's old name
    camp.system = clean;
    reCleanChars(camp, clean);   // Stage 6: before the save and the sync (syncSystem re-sends every character after the system)
    stampRows(clean, camp.chars || {});   // Stage 6: a legacy row of a GM-only item gets its own id (its derived one would name the item)
    var reach = itemReach(prevSys, clean, camp.chars || {}), nR = net(); if (nR && nR.logEvent) reach.lines.forEach(function(l) { nR.logEvent('items', l); });   // Stage 6 F4c2: how far an edit to carried items reaches (after the re-check, so a removed stat's own values are gone), into the session log before the save
    if (window.wpLibrary && window.wpLibrary.refreshCore) { try { if (window.wpLibrary.refreshCore(camp, true)) clean = camp.system; } catch (e) { console.error(e); } }   // Stage 6 library L1d: the core its formulas now address (the draft below carries it); true: the editor's Save
    draftSet(clone(clean)); dirtySet(false); var s = ui('sysSaveBtn'); if (s) s.classList.remove('on');
    if (pendS.length) { var dc = draft.combat || (draft.combat = {}), dsn = dc.senses && typeof dc.senses === 'object' ? dc.senses : (dc.senses = {}); dsn.list = (Array.isArray(dsn.list) ? dsn.list : []).concat(clone(pendS)); markDirty(); }
    save(true);
    starterSaved();   // 1.6.2: a starter's own packs, now that its system is the campaign's
    var n = net(); if (n && n.syncSystem) n.syncSystem();
    if (n && n.active && n.role === 'host' && n.sensesMoved) n.sensesMoved(null);   // Senses S0: a formula or a default only the GM sees may feed Sight, and moves neither view of the system
    if (n && n.active && n.role === 'host' && n.sendItem) terrMaps.forEach(function(id) { n.sendItem(camp.id, id); });   // 1.6.2 (backlog 57): the maps whose pieces were settled, after the system that names the kinds
    if (n && n.active && n.role === 'host' && typeof n.lootMoved === 'function' && JSON.stringify((prevSys && prevSys.combat && prevSys.combat.loot) || null) !== JSON.stringify((clean.combat && clean.combat.loot) || null)) n.lootMoved(null);   /* the review of fold 3a: Bodies is the GM's alone, so syncSystem sees no change; every map's chests follow it */
    if (n && n.active && n.role === 'host' && n.syncChars && gmFacing(prevSys) !== gmFacing(clean)) n.syncChars();   // Stage 6 F4a: an edit to a GM-only item or effect changes what its owner holds inline (the players' view alone would not resend it)
    var rnW = rnS ? renamesSay(rnS) : []; if (nR && nR.logEvent) rnW.forEach(function(l) { nR.logEvent('items', l); });
    var v = validateSystem(clean, F()), goneS = typeof goneRefs === 'function' ? goneRefs(clean, typeof refKeys === 'function' ? refKeys(clean) : null) : [];   // 1.6.2 (backlog 208): what still names something that is gone is said at Save too
    toast((reach.text ? reach.text + ' ' : '') + (orphaned ? orphaned + ' carried cop' + (orphaned === 1 ? 'y' : 'ies') + ' of deleted items kept. ' : '') + 'System saved: ' + clean.fields.length + ' field' + (clean.fields.length === 1 ? '' : 's') + ', ' + clean.rolls.length + ' roll' + (clean.rolls.length === 1 ? '' : 's') + (dropped ? '; ' + dropped + ' with a bad key or kind dropped' : '') + (v.ok ? '.' : '; ' + v.errors.length + ' error' + (v.errors.length === 1 ? '' : 's') + ' to fix.'));
    keysGone(prevSys, clean, typeof refKeys === 'function' ? refKeys(clean) : null).forEach(function(g) { var t = keyUseSays(g.key, keyUses(clean, g.key)); if (t) rnW.push(t); });   // an item's key changed or the item went
    rnW.concat(goneS.slice(0, 3).map(function(g) { return g.message; }), goneS.length > 3 ? [(goneS.length - 3) + ' more name something that is gone, each said under its own box.'] : []).forEach(function(l) { toast(l); });   // each a line in the bell, so none is cut, the last on screen
    renderAll(); renderViews(null);
    if (window.appRender) window.appRender();   // the board and the Properties panel read the system too (a light's presets, the light names): drawn afresh from what was saved
}
// [systemcheck:refwarn-start]
// 1.6.2 (backlog 208, the tracing audit): what the draft leaves that nothing else would say, under the box it belongs to. A rename follows at Save;
// what cannot follow is said. refKeys: the keys an aim at one entry may name, null while the library is not read, since nothing can then be judged
function refKeys(sys) {
    var LBk = window.wpLibrary, c = getActiveCampaign(), packs = c && c.library && Array.isArray(c.library.packs) ? c.library.packs : [], m = Object.create(null), put = function(e) { if (e && typeof e.key === 'string' && e.key) m[e.key.toLowerCase()] = 1; };
    if (packs.length && !(LBk && typeof LBk.whole === 'function' && LBk.whole())) return null;
    ((sys && sys.items) || []).concat((sys && sys.core) || []).forEach(put);
    packs.forEach(function(p) { if (p && LBk && typeof LBk.entriesOf === 'function') LBk.entriesOf(p.id).forEach(put); });
    return m;
}
function refCats(sys) {   // the categories in hand, lower case; null while the library cannot say, or while nothing has one yet
    var LBk = window.wpLibrary, c = getActiveCampaign(), packs = c && c.library && Array.isArray(c.library.packs) ? c.library.packs : [], m = Object.create(null), n = 0;
    if (packs.length && !(LBk && typeof LBk.whole === 'function' && LBk.whole())) return null;
    (typeof catChoices === 'function' ? catChoices(sys) : []).forEach(function(x) { if (typeof x === 'string' && x.trim()) { m[x.trim().toLowerCase()] = 1; n++; } });
    return n ? m : null;
}
function refWarns(saved, clean, camp0) {
    var warn = function(k, m) { (warningsById[k] = warningsById[k] || []).push({ message: m }); }, low = function(x) { return typeof x === 'string' ? x.trim().toLowerCase() : ''; };
    var rn = renamesOf(saved, draft), said = function(k, l, w) { l.forEach(function(p) { var o = {}; o[w] = [p]; warn(k(p), renamesSay(o)[0]); }); }, chars = (camp0 && camp0.chars) || {};
    said(function(p) { return 'list:' + p.f; }, rn.picks, 'picks'); said(function(p) { return 'list:' + p.f; }, rn.vals || [], 'vals'); said(function(p) { return 'list:' + p.f; }, rn.rolls, 'rolls'); said(function(p) { return p.f; }, rn.selects, 'selects'); said(function() { return 'links'; }, rn.stations, 'stations');
    rn.names.forEach(function(p) { renamesSay({ names: [p] }).forEach(function(m) { warn(p.list ? 'list:' + p.f : p.f, m); }); });   // 1.6.2: a number's value names moved: said before Save, since the numbers stored in rows and the library stay as they are
    rn.subjects.forEach(function(p) { renamesSay({ subjects: [p] }).forEach(function(m) { warn('list:' + p.f, m); }); });   // 1.6.2: a list's subjects moved: a word only moved says nothing, since its rows follow
    var fromIn = function(l, f, x) { return l.some(function(p) { return p.f === f && low(p.from) === low(x); }); };
    ((saved && saved.fields) || []).forEach(function(sf) {
        var df = sf ? (draft.fields || []).filter(function(x) { return x && x.id === sf.id; })[0] : null; if (!df || df.kind !== sf.kind) return;
        if (sf.kind === 'select') (Array.isArray(sf.options) ? sf.options : []).forEach(function(o) {   // a character's value of a list field that goes
            if ((Array.isArray(df.options) ? df.options : []).some(function(x) { return low(x) === low(o); }) || fromIn(rn.selects, sf.id, o)) return;
            var n = 0; Object.keys(chars).forEach(function(id) { var c = chars[id]; if (c && c.values && c.values[sf.id] === o) n++; });
            if (n) warn(sf.id, 'Save takes \u201c' + o + '\u201d off ' + n + (n === 1 ? ' character' : ' characters') + ': that option is gone. They read the default.');
        });
        if (sf.kind !== 'item-list' || !sf.list) return;
        var LBk = window.wpLibrary, packs = camp0 && camp0.library && Array.isArray(camp0.library.packs) ? camp0.library.packs : [];
        (Array.isArray(sf.list.stats) ? sf.list.stats : []).forEach(function(s) {   // an entry of the library that holds an option that goes: it can only be told, since a pack is not rewritten at Save
            if (!s || s.kind !== 'pick' || !LBk || typeof LBk.entriesOf !== 'function') return;
            var ds = (df.list && Array.isArray(df.list.stats) ? df.list.stats : []).filter(function(x) { return x && x.kind === 'pick' && low(x.key) === low(s.key); })[0]; if (!ds) return;
            var opt = function(o) { return (Array.isArray(ds.opts) ? ds.opts : []).some(function(x) { return x && low(x.label) === low(o.label); }); }, goes = (Array.isArray(s.opts) ? s.opts : []).filter(function(o) { return o && typeof o.label === 'string' && !opt(o) && !fromIn(rn.picks, sf.id, o.label); }); if (!goes.length) return;
            var n = 0; packs.forEach(function(p) { if (p) LBk.entriesOf(p.id).forEach(function(e) { var v = e && e.stats ? e.stats[s.key] : undefined; if (typeof v === 'string' && goes.some(function(o) { return low(o.label) === low(v); })) n++; }); });
            if (n) warn('list:' + sf.id, n + (n === 1 ? ' library entry holds' : ' library entries hold') + ' an option of ' + (s.label || s.key) + ' that is gone, and ' + (n === 1 ? 'it reads' : 'they read') + ' the default.');
        });
    });
    ((saved && saved.links) || []).forEach(function(sk) {   // a station that goes with no new name
        var dk = sk && sk.kind === 'crew' ? (draft.links || []).filter(function(x) { return x && x.id === sk.id && x.kind === 'crew'; })[0] : null; if (!dk) return;
        (Array.isArray(sk.stations) ? sk.stations : []).forEach(function(st) {
            if ((Array.isArray(dk.stations) ? dk.stations : []).some(function(x) { return low(x) === low(st); }) || fromIn(rn.stations, sk.id, st)) return;
            var n = 0; Object.keys(chars).forEach(function(id) { var c = chars[id], v = c && c.stn ? c.stn[sk.id] : null; if ((Array.isArray(v) ? v : [v]).some(function(x) { return low(x) === low(st); })) n++; });
            if (n) warn('links', (dk.label || dk.key) + ': the station \u201c' + st + '\u201d goes, so ' + n + (n === 1 ? ' character stands' : ' characters stand') + ' at no station.');
        });
    });
    var ky = typeof refKeys === 'function' ? refKeys(clean) : null;
    goneRefs(clean, ky).forEach(function(g) { if (g.k === 'key') warn(g.id, g.message); });   // an effect's and an item's roll bonuses say the rest on their own lines, and the Taking damage box says a wound's
    keysGone(saved, clean, ky).forEach(function(g) { var t = keyUseSays(g.key, keyUses(clean, g.key)); if (t) warn(g.id, t); });   // an item's key changed: what still names the old one
    var cats = typeof refCats === 'function' ? refCats(draft) : null; if (!cats) return;
    (draft.fields || []).forEach(function(f) { if (f && f.kind === 'item-list' && f.list) catsGone(f.list, cats).forEach(function(x) { warn('list:' + f.id, 'No item or library entry has the category \u201c' + x + '\u201d now, so this list finds none of it.'); }); });
    (draft.items || []).forEach(function(it) { var nr = it && it.category ? catNear(draft, it.category) : ''; if (nr) warn(it.id, 'Its category \u201c' + it.category + '\u201d is not quite \u201c' + nr + '\u201d, the one a list takes, so that list does not take it.'); });
    [['sheet', draft.sheet], ['hud', draft.sheet && draft.sheet.hud]].forEach(function(lv) {   // a place that names what no row can be now
        ((lv[1] && lv[1].sections) || []).forEach(function(s) { ((s && s.fields) || []).forEach(function(pl, pi) {
            var f = pl && Array.isArray(pl.cats) && pl.cats.length ? (draft.fields || []).filter(function(x) { return x && x.id === pl.id && x.kind === 'item-list'; })[0] : null; if (!f) return;
            var by = f.list && typeof f.list.placeBy === 'string' && f.list.placeBy, names = by ? placeCatNames(f, draft).map(low) : null;
            pl.cats.forEach(function(x) { if (typeof x !== 'string' || !x.trim() || (names ? names.indexOf(low(x)) >= 0 || fromIn(rn.picks.concat(rn.vals || []), f.id, x) : cats[low(x)])) return; warn('plc:' + lv[0] + ':' + s.id + ':' + pi, (by ? 'No row can be \u201c' : 'No item or library entry has the category \u201c') + x.trim() + (by ? '\u201d now, so this place shows none of it.' : '\u201d now, so this place shows none of it.')); });
        }); });
    });
}
// [systemcheck:refwarn-end]
function refreshErrors() {
    Object.keys(errorsById).forEach(function(k) { delete errorsById[k]; }); Object.keys(warningsById).forEach(function(k) { delete warningsById[k]; });   // 1.6.3: emptied in place (a part may not assign its root's name); nothing keeps either map across this
    if (!draft || !F()) return;
    if (typeof placeCatErrs === 'function') placeCatErrs();   // 1.5.5: what Save does with a list's places in the Layout tab
    var seenKey = Object.create(null);
    // 1.6.3 (the review of fields): what is said of a field with no short name, which Save drops whole. Where its name still makes one, the short name
    // was emptied by hand under Short names, and editing the name makes it follow again; where the name makes none, it holds no letter A to Z (another
    // script, or only marks). The words never begin with "Its name", which the line's own prefix puts before them
    var nameSays = function(f) {
        var lb = typeof f.label === 'string' ? f.label.trim() : '';
        if (!lb) return 'Give it a name, or Save drops this field.';
        var made = typeof keyFromLabel === 'function' ? keyFromLabel(lb, f) : '';
        return made ? 'The short name is empty, so Save drops this field. Type one under Short names, or edit the name and it follows again.' : 'This name makes no short name, so Save drops this field. Use letters A to Z, or tick Short names below and type one.';
    };
    draft.fields.forEach(function(f) {
        var errs = [];
        // 1.6.3 (Fulllion's rulings of 2026-11-20: a box other boxes depend on is required): a field with no short name is dropped whole at Save, with
        // everything typed in its other boxes, so its name is said to be needed under the Label box (the short name follows the name and stays out of sight)
        if (!f.key) errs.push({ prop: 'label', message: nameSays(f) });
        else if (!validKey(f.key, F())) errs.push({ prop: 'key', message: 'Not a usable key: letters, digits, _ and dots; no spaces; not a function, reserved word or dice.' });
        else { var l = String(f.key).toLowerCase(); if (seenKey[l]) errs.push({ prop: 'key', message: 'Another field has this key.' }); seenKey[l] = 1; }
        if (!KINDS[f.kind]) errs.push({ prop: 'kind', message: 'Pick a kind.' });
        if (errs.length) errorsById[f.id] = errs;
    });
    var tnW = draft.combat && draft.combat.turn; if (tnW && typeof tnW === 'object' && typeof cleanTurn === 'function' && typeof turnRunSays === 'function') { var kpW = cleanTurn(tnW); turnRunSays(tnW, kpW).forEach(function(w) { (warningsById.combat = warningsById.combat || []).push({ prop: 'turn.run', message: w }); }); turnHoldSays(tnW, kpW).forEach(function(w) { (warningsById.combat = warningsById.combat || []).push({ prop: 'turn.holdLost', message: w }); }); if (tnW.faceBy === 'turn' && !(kpW && kpW.face)) (warningsById.combat = warningsById.combat || []).push({ prop: 'turn.face', message: 'It names no number, so Save drops what one change is.' }); }   // 1.6.0: what Save does with a move by giving up an action
    if (typeof cleanFieldUnit === 'function') draft.fields.forEach(function(f) {   // 1.5.4: a field's unit as Save reads it: a text field's unit that is not height goes, and a measure spelled so that it is not one stays as words
        var uw = f && typeof f.unit === 'string' ? f.unit.trim() : ''; if (!uw) return;
        if (f.kind === 'text') { if (!cleanFieldUnit(f.unit, 'text')) (errorsById[f.id] = errorsById[f.id] || []).push({ prop: 'unit', message: 'A text field takes the unit height or weight alone, so Save drops \u201c' + uw + '\u201d.' }); return; }
        if (f.kind !== 'number' && f.kind !== 'formula' && f.kind !== 'skill' && f.kind !== 'resource') return;
        if (typeof unitOf === 'function') { uw = unitOf(f.unit); if (!uw) return; }   // the words Save keeps
        var NEAR = { yard: 'yd', yards: 'yd', yd: 'yd', yds: 'yd', foot: 'ft', feet: 'ft', ft: 'ft', inch: 'in', inches: 'in', 'in': 'in', pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb', mile: 'mi', miles: 'mi', mi: 'mi' }, lw = uw.toLowerCase().replace(/\.$/, '');
        if (Object.prototype.hasOwnProperty.call(NEAR, lw) && !cleanFieldUnit(uw, f.kind)) (warningsById[f.id] = warningsById[f.id] || []).push({ prop: 'unit', message: 'Its unit \u201c' + uw + '\u201d is shown as written in both settings. Write ' + NEAR[lw] + ' and Metric shows the figure in metric too.' });
    });
    if (typeof cleanFieldUnit === 'function') draft.fields.forEach(function(f) {   // 1.5.4: what Save does with a field's Metric list, its decimals and its 1,000s, as the cleaner reads them
        if (!f) return;
        var said = [], numK = f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill', uw = typeof unitOf === 'function' ? unitOf(f.unit) : typeof f.unit === 'string' ? f.unit.trim() : '', dec = function(v) { return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(5, Math.round(v))) : null; };
        if ((f.unitShow === 'swap' || f.unitShow === 'bare') && !numK) said.push('Only a number, a formula or a skill takes a Metric list, so Save drops it.');
        else if ((f.unitShow === 'swap' || f.unitShow === 'bare') && !cleanFieldUnit(uw, f.kind)) said.push('Metric ' + (f.unitShow === 'swap' ? 'instead' : 'bare') + ' needs a unit that is a measure, such as lb or yd/s, so Save drops it.');
        if ((f.decMin !== undefined || f.decMax !== undefined) && !numK) said.push('Only a number, a formula or a skill shows decimals, so Save drops them.');
        else if (numK) [['decMin', 'fewest'], ['decMax', 'most']].forEach(function(d) { var v = f[d[0]]; if (v === undefined) return; if (dec(v) === null) said.push('The ' + d[1] + ' decimals is no number, so Save drops it.'); else if (dec(v) !== v) said.push('Decimals are whole numbers from 0 to 5, so Save keeps ' + dec(v) + ' for the ' + d[1] + '.'); });
        if (numK && dec(f.decMin) !== null && dec(f.decMax) !== null && dec(f.decMax) < dec(f.decMin)) said.push('The most decimals is below the fewest, so Save shows ' + dec(f.decMin) + ' always.');
        if (f.group === true && !numK) said.push('Only a number, a formula or a skill groups its thousands, so Save drops 1,000s.');
        if (said.length) said.forEach(function(m) { (warningsById[f.id] = warningsById[f.id] || []).push({ prop: 'fmt', message: m }); });
    });
    draft.fields.forEach(function(f) {   // 1.6.3 (the review of backlog 170): a field's Locked while, as the cleaner reads it (systemcore cleanFieldLock), so what Save drops is said under the row
        var lk = f && f.lock && typeof f.lock === 'object' ? f.lock : null, t = lk && typeof lk['if'] === 'string' ? lk['if'].trim() : ''; if (!t) return;
        var say = '';
        if (f.kind === 'formula' || f.kind === 'item-list' || f.kind === 'effects') say = 'Only a field someone types in can be locked, so Save drops Locked while.';
        else if (typeof cleanFieldLock === 'function' && !cleanFieldLock(lk, F())) { var pk = null; try { pk = F().parse(typeof cleanFormulaText === 'function' ? (cleanFormulaText(t) || t) : t); } catch (er) { pk = null; } say = (pk && pk.ok ? 'Locked while rolls dice' : 'Locked while is no test Save can keep') + ', so Save drops it. The field is then never locked.'; }
        if (say) (errorsById[f.id] = errorsById[f.id] || []).push({ prop: 'lock', message: say });
    });
    // 1.6.3 (Fulllion's rulings of 2026-11-20: "it makes sense to have fields be required when other fields depend on them", and "none isn't a good
    // default substitution"): the boxes of a field that other boxes of it depend on, read as the cleaner in systemcore reads the field, so what Save
    // would drop, or what the sheet would never draw, is said under the row. Nothing here holds Save, and the cleaner keeps what it always kept.
    // Each line names the box it is about (sysui.js PROP_BOX turns the word into that box), so a press on it in the foot's list lands there
    draft.fields.forEach(function(f) {
        if (!f || typeof f !== 'object' || typeof f.id !== 'string') return;
        var err = function(prop, message) { (errorsById[f.id] = errorsById[f.id] || []).push({ prop: prop, message: message }); };
        var trimmed = function(v) { return typeof v === 'string' ? v.trim() : ''; };
        // A number taken from a formula keeps the two formulas only together: one alone is dropped, and the GM's formula with it
        if (f.kind === 'number' && f.override && typeof f.override === 'object') {
            var ovV = trimmed(f.override.value), ovW = trimmed(f.override.when);
            if (ovV && !ovW) err('override.when', 'Taken from needs a While. Until one is written, Save drops Taken from and the number is what is typed.');
            else if (ovW && !ovV) err('override.value', 'While needs a Taken from. Until one is written, Save drops While.');
            else if (ovV && ovW && typeof cleanFormulaText === 'function' && (!cleanFormulaText(ovV) || !cleanFormulaText(ovW))) err(cleanFormulaText(ovV) ? 'override.when' : 'override.value', 'Taken from and While must each be a formula Save can keep, so Save drops both.');
        }
        // Worked out until typed and Typing it fills stand only on a number, a toggle, or a text read as a height or a weight (the cleaner's own test)
        var hasAuto = !!trimmed(f.auto) || (Array.isArray(f.fills) && f.fills.length > 0);
        var measured = f.kind === 'text' && (typeof cleanFieldUnit === 'function' ? !!cleanFieldUnit(f.unit, 'text') : (f.unit === 'height' || f.unit === 'weight'));
        var autoOk = f.kind === 'number' || f.kind === 'toggle' || measured;
        if (hasAuto && !autoOk) {
            if (f.kind === 'text') err('unit', 'Worked out until typed and Typing it fills need Unit: height or weight, so Save drops them.');
            else err('kind', 'Only a number, a toggle, or a text with Unit: height or weight is worked out until typed, so Save drops Worked out until typed and Typing it fills.');
        }
        // Each line of Typing it fills needs the field it fills and what it writes there. Save drops a line with either missing, as it drops a second
        // line for a field already filled (only a line Save keeps counts as filling it)
        if (autoOk && Array.isArray(f.fills)) {
            var filled = Object.create(null);
            f.fills.forEach(function(x, i) {
                if (!x || typeof x !== 'object') return;
                var to = typeof x.f === 'string' ? x.f : '', raw = trimmed(x.formula);
                if (!to) { err('fillTo.' + i, 'Typing it fills: pick the field it fills, or Save drops this line.'); return; }
                if (filled[to]) { err('fillTo.' + i, 'Another line already fills this field, so Save drops this one.'); return; }
                if (!raw) { err('fill.' + i, 'Typing it fills: write what it writes there, or Save drops this line.'); return; }
                var ft = typeof cleanFormulaText === 'function' ? cleanFormulaText(raw) : raw, pf = null; try { pf = ft ? F().parse(ft) : null; } catch (er) { pf = null; }
                if (!pf || !pf.ok || !pf.ast) { err('fill.' + i, 'Typing it fills: what it writes is no figure Save can keep, so Save drops this line.'); return; }
                if (typeof hasDice === 'function' && hasDice(pf.ast.body)) { err('fill.' + i, 'Typing it fills: what it writes rolls dice, so Save drops this line.'); return; }
                filled[to] = 1;   // a field that is gone, or no longer one a fill writes, the validator says itself
            });
        }
        // A number shown as dots, boxes or a clock counts its marks from Out of, else from its Min to its Max. Boxes marked one by one count only
        // from Out of. With nothing to count, the sheet draws its plain box (a track is never kept beside value names or a slider)
        var tk = f.track && typeof f.track === 'object' ? f.track : null;
        if (tk && f.kind === 'number' && !(Array.isArray(f.labels) && f.labels.some(function(x) { return !!trimmed(x); })) && !f.slider && !trimmed(tk.of)) {
            var hasNum = function(v) { return typeof v === 'number' && isFinite(v); };
            if (tk.each === true) err('track', 'Boxes marked one by one need Out of: how many boxes. Until it is filled in, the sheet shows a plain box.');
            else if (!hasNum(f.min) || !hasNum(f.max)) err('track', 'Dots, boxes or a clock need a Min and a Max, or an Out of. Until one is set, the sheet shows a plain box.');
        }
        // A choice needs its options, and its default must be one of them as the cleaner keeps them (cut to an option's length, trimmed, once each)
        if (f.kind === 'select') {
            var seenO = Object.create(null), opts = [], cap = LIMITS.optionChars || 60;
            (Array.isArray(f.options) ? f.options : []).forEach(function(o) { if (typeof o !== 'string') return; o = o.slice(0, cap).replace(/[\u0000-\u001f\u007f]/g, '').trim(); if (!o || seenO[o.toLowerCase()]) return; seenO[o.toLowerCase()] = 1; opts.push(o); });
            var d = typeof f.def === 'string' ? f.def : '', loose = function(s) { return s.toLowerCase().replace(/\s+/g, ' ').trim(); };
            if (!opts.length) err('options', 'A choice needs at least one option. Type them in Options, separated by commas.');
            else if (d && opts.indexOf(d) < 0) {
                var near = opts.filter(function(o) { return loose(o) === loose(d); })[0];
                err('def', near ? 'Write it as \u201c' + near + '\u201d, or Save starts it on the first option.' : '\u201c' + d.trim() + '\u201d is not one of the options, so Save starts it on the first.');
            }
        }
    });
    draft.fields.forEach(function(f) {   // 1.6.0: a pool down to minus its max, as the cleaner reads it
        if (!f || f.minNeg !== true) return;
        if (f.kind !== 'resource') (warningsById[f.id] = warningsById[f.id] || []).push({ prop: 'minNeg', message: 'Only a pool goes down to minus its max, so Save drops that tick.' });
        else if (!(typeof f.maxFormula === 'string' && f.maxFormula.trim())) (warningsById[f.id] = warningsById[f.id] || []).push({ prop: 'minNeg', message: 'It goes down to minus its max, but it has no max formula, so it stops at 0.' });
    });
    draft.fields.forEach(function(f) {   // 1.6.0 Spills into, as the cleaner reads it
        var sp = f && f.kind === 'resource' && f.spill && typeof f.spill === 'object' ? f.spill : null; if (!sp) return;
        var to = draft.fields.filter(function(x) { return x && x.id === sp.to; })[0];
        if (!to || to.kind !== 'resource' || to.id === f.id) (errorsById[f.id] = errorsById[f.id] || []).push({ prop: 'spill', message: 'Spills into names no other pool of this system, so Save drops it.' });
        else {
            if (sp.at === 'f' && !(typeof sp.below === 'string' && sp.below.trim())) (warningsById[f.id] = warningsById[f.id] || []).push({ prop: 'spill', message: 'It spills below a formula, but none is written, so Save spills it below its least value.' });
            if (to.vis === 'gm' && f.vis !== 'gm') (warningsById[f.id] = warningsById[f.id] || []).push({ prop: 'spill', message: (to.label || to.key || 'That pool') + ' is GM only, so players\u2019 own apps do not show the spill. The host still makes it.' });
        }
    });
    (draft.items || []).forEach(function(it) { if (it && it.key && !cleanItemKey(String(it.key), F())) (errorsById[it.id] = errorsById[it.id] || []).push({ prop: 'key', message: 'Not a usable key: a letter, then letters, digits and _ (up to 40); not a word formulas already use (count, qty, on, has, lvl, paid, row; max, min, cur, ranks, base; a function or reserved word such as floor, and, true; constructor). Save drops it.' }); });   // Stage 6 F4b
    if (typeof lvlBoxSays === 'function') (draft.items || []).forEach(function(it) { lvlBoxSays(it).forEach(function(m) { (errorsById[it.id] = errorsById[it.id] || []).push({ message: m }); }); });   // 1.6.0: Levels it may be and By level, as the cleaner reads them
    if (typeof grantSays === 'function') (draft.items || []).forEach(function(it) { var gS = grantSays(it); gS.drop.forEach(function(m) { (errorsById[it.id] = errorsById[it.id] || []).push({ prop: 'grants', message: m }); }); gS.warn.forEach(function(m) { (warningsById[it.id] = warningsById[it.id] || []).push({ prop: 'grants', message: m }); }); });   // 1.6.0 (v2, B4): what Save does with an item's grants
    // Stage 6 F4c1: each list's stats as Save will read them (a key it drops, a repeat, past the cap, a price naming none, another list's spelling),
    // under the list's card; and what Save drops when a saved stat is renamed or removed (a stat's key is its identity)
    var decSaid = function(errs, who, v, measure) {   // 1.5.4: what Save does with a list stat's or column's most decimals (who: its words; v: as typed; measure: its unit is a measure, as Save reads it)
        if (v === undefined) return;
        if (!measure) { errs.push({ message: who + ': decimals need a unit that is a measure, such as lb, so Save drops them.' }); return; }
        var d = typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(5, Math.round(v))) : null;
        if (d === null) errs.push({ message: who + ': the decimals are no number, so Save drops them.' }); else if (d !== v) errs.push({ message: who + ': decimals are whole numbers from 0 to 5, so Save keeps ' + d + '.' });
    };
    var capS = LIMITS.listStats, firstSp = Object.create(null), keptAll = Object.create(null), keptBy = Object.create(null), firstDef = Object.create(null);
    draft.fields.forEach(function(f) {
        if (!f || f.kind !== 'item-list') return;
        var sp = f.list && typeof f.list === 'object' ? f.list : {}, st = Array.isArray(sp.stats) ? sp.stats : [], errs = [], mine = Object.create(null), keptW = Object.create(null), n = 0, nm = f.label || f.key || 'another list';
        st.forEach(function(s, i) {
            var k = s && typeof s === 'object' && typeof s.key === 'string' ? s.key : '';
            if (!k.trim()) { errs.push({ message: 'Stat ' + (i + 1) + ' needs a name: Save drops it.' }); return; }
            if (!statKey(k, F())) { errs.push({ message: 'Stat key "' + k + '" is not usable: a letter, then letters, digits and _ (up to 24, no spaces); not a word formulas already use (count, qty, on, has, lvl, paid, row; max, min, cur, ranks, base; a function or reserved word such as floor, and, true; constructor, toString). Save drops it.' }); return; }
            var l = k.toLowerCase(); if (mine[l]) { errs.push({ message: 'Stat key "' + k + '" repeats "' + mine[l] + '" (keys ignore case): Save keeps the first.' }); return; }
            mine[l] = k; if (++n > capS) return;
            keptW[l] = 1;   // 1.5.4 With: the stats Save keeps of this list
            if (typeof s.def === 'number' && isFinite(s.def) && Math.abs(s.def) > LIMITS.statAbs) errs.push({ message: 'Stat "' + k + '" has a default past ±1,000,000,000: Save drops it.' });
            var suW = typeof unitOf === 'function' ? unitOf(s.unit) : typeof s.unit === 'string' ? s.unit.trim() : '';   // 1.5.4: a stat's unit, its Metric list and its decimals, as the cleaner reads them
            if (suW && s.kind === 'pick') errs.push({ message: 'Stat "' + k + '" is a choice, so Save drops its unit.' });
            if ((s.unitShow === 'swap' || s.unitShow === 'bare') && !(s.kind !== 'pick' && typeof cleanFieldUnit === 'function' && cleanFieldUnit(suW, 'number'))) errs.push({ message: 'Stat "' + k + '": Metric ' + (s.unitShow === 'swap' ? 'instead' : 'bare') + ' needs a unit that is a measure, such as lb or yd/s, so Save drops it.' });
            decSaid(errs, 'Stat "' + k + '"', s.decMax, s.kind !== 'pick' && typeof cleanFieldUnit === 'function' && !!cleanFieldUnit(suW, 'number'));
            keptAll[l] = 1; if (!firstDef[l]) firstDef[l] = s;
            if (!firstSp[l]) firstSp[l] = { key: k, list: nm }; else if (firstSp[l].key !== k) errs.push({ message: 'Stat "' + k + '" is spelled "' + firstSp[l].key + '" on ' + firstSp[l].list + ': Save uses that spelling here too (one key, one spelling).' });
        });
        if (n > capS) errs.push({ message: 'At most ' + capS + ' stats a list: Save keeps the first ' + capS + '.' });
        if (typeof ctKeySays === 'function') ctKeySays(sp, F()).forEach(function(m) { errs.push({ message: m }); });   // the core handbook session's ask (a): a counter's key as the cleaner reads it
        if (typeof sp.price === 'string' && sp.price && !mine[sp.price.toLowerCase()]) errs.push({ message: 'The price names no stat of this list: Save drops it.' });
        var onD = sp.on && typeof sp.on === 'object' && !Array.isArray(sp.on) ? sp.on : null, onPer = onD && typeof onD.per === 'string' ? onD.per.trim() : '';   // 1.5.4 One at a time: a Per stat as Save reads it
        if (onPer && !keptW[onPer.toLowerCase()]) errs.push({ message: 'One at a time goes by "' + onD.per + '", which is no stat of this list. ' + (onD.one === true ? 'Save keeps one row on for the whole list.' : 'Save drops it.') });
        if (onD && typeof onD.needsText === 'string' && onD.needsText.trim() && !(typeof onD.needs === 'string' && onD.needs.trim())) errs.push({ message: 'The switch has words but no Needs to switch on, so Save drops its words.' });   // 1.5.8: as the cleaner reads them (rollNeedsInto keeps the words only beside a formula)
        (Array.isArray(sp.rolls) ? sp.rolls : []).forEach(function(rr, ri) { if (rr && typeof rr === 'object' && !Array.isArray(rr.apply) && typeof rr.ad === 'string' && rr.ad.trim() && rr.dmg !== true) errs.push({ message: 'Roll ' + (ri + 1) + (typeof rr.label === 'string' && rr.label.trim() ? ', ' + rr.label.trim() : '') + ': an armor divisor needs Damage ticked, so Save drops it.' }); });   // 1.6.0: as the cleaner reads it
        if (sp.lvl && typeof sp.lvl === 'object' && Array.isArray(sp.lvl.caps) && typeof cleanListSpec === 'function') {   // 1.6.0 At most at a level, as the cleaner reads it
            var capOne = function(c) { var lk = (cleanListSpec({ lvl: Object.assign({}, sp.lvl, { caps: [c] }) }, true, F()) || {}).lvl; return lk && Array.isArray(lk.caps) ? lk.caps[0] : null; }, capOk = 0;
            sp.lvl.caps.forEach(function(c, ci) { var k = capOne(c); if (!k) { errs.push({ message: 'At most, cap ' + (ci + 1) + ': it needs a number of rows, 0 or more, and a level, so Save drops it.' }); return; } capOk++; if (c.at !== k.at) errs.push({ message: 'At most, cap ' + (ci + 1) + ': ' + c.at + ' is not one of this list\u2019s levels, so Save reads it as ' + k.at + '.' }); else if (c.n !== k.n) errs.push({ message: 'At most, cap ' + (ci + 1) + ': rows are a whole number up to ' + LIMITS.carried + ', so Save keeps ' + k.n + '.' }); });
            var capKept = ((cleanListSpec(sp, true, F()) || {}).lvl || {}).caps || [];
            if (capKept.length < capOk) errs.push({ message: 'At most: a level is capped once, and or higher once, ' + LIMITS.lvlCaps + ' caps at most, so Save keeps ' + capKept.length + '.' });
        }
        if (typeof startsSay === 'function') startsSay(f).forEach(function(m) { errs.push({ message: m }); });   // 1.6.0 Starts with, as the cleaner reads it
        // 1.6.3 (Fulllion's rulings of 2026-11-20: "it makes sense to have fields be required when other fields depend on them", and "none isn't a good
        // default substitution"): a list's rolls and actions, each box that others depend on, read as the cleaner reads it. Said on the list's card, never
        // holding Save: a roll with no name (its button and card say Roll or Apply), needs with no words for the grayed button (a refused press says only
        // Not now), words with no needs and the two ticks with neither needs nor a reason (Save drops them), and Then every with no Steps (only the first runs)
        (Array.isArray(sp.rolls) ? sp.rolls : []).forEach(function(rq, rqi) {
            if (!rq || typeof rq !== 'object') return;
            var isAp = Array.isArray(rq.apply), nmQ = typeof rq.label === 'string' ? rq.label.trim() : '', who = 'Roll ' + (rqi + 1) + (nmQ ? ', \u201c' + nmQ + '\u201d' : '');
            var ndRaw = typeof rq.needs === 'string' && !!rq.needs.trim(), ndK = typeof cleanFormulaText === 'function' ? !!cleanFormulaText(rq.needs) : ndRaw, whyK = typeof cleanNeedsWhy === 'function' && !!cleanNeedsWhy(rq.needsWhy), words = typeof rq.needsText === 'string' && !!rq.needsText.trim();
            if (!nmQ && (isAp ? rq.apply.length > 0 : (typeof rq.formula === 'string' && !!rq.formula.trim()))) errs.push({ message: who + ': it has no name, so its button and its card say ' + (isAp ? 'Apply' : 'Roll') + '. Give it a name.' });
            if (ndK && !words) errs.push({ message: who + ': the words for its grayed button are empty, so a refused press says only Not now. Give the button its words.' });
            if (!ndRaw && words) errs.push({ message: who + ': its Needs are empty, so Save drops the words for its grayed button. Write what it needs, or clear those words.' });
            if (!ndRaw && !whyK && rq.hideOff === true) errs.push({ message: who + ': Hidden until it can be used needs Needs or a reason, so Save drops the tick.' });
            if (!ndRaw && !whyK && rq.needsGm === true) errs.push({ message: who + ': The GM may press past it needs Needs or a reason, so Save drops the tick.' });
            var xq = rq.cross && typeof rq.cross === 'object' ? rq.cross : null, nq = xq ? xq.count : undefined;
            if (xq && typeof xq.step === 'string' && xq.step.trim() && !(typeof nq === 'number' && Math.floor(nq) === nq && nq >= 2 && nq <= 20)) errs.push({ message: who + ': When a counter crosses, Steps needs a whole number from 2 to 20, or only the first step runs.' });
        });
        if (Array.isArray(sp.rolls) && typeof cleanListSpec === 'function') sp.rolls.forEach(function(rj) { if (!rj || typeof rj !== 'object' || !rj.job || typeof rj.job !== 'object') return; var jk = (cleanListSpec({ counters: sp.counters, rolls: [{ label: 'x', formula: '1', job: rj.job }] }, true, F()) || {}).rolls; if (!(jk && jk[0] && jk[0].job)) errs.push({ message: 'Roll \u201c' + (rj.label || 'Roll') + '\u201d: a job needs its turns and a counter of this list, so Save drops it.' }); });   // 1.6.0, as the cleaner reads it
        if (Array.isArray(sp.subject) && typeof cleanListSpec === 'function') { var sjKept = ((cleanListSpec({ subject: sp.subject }, true, F()) || {}).subject || []).length; if (sjKept < sp.subject.length) errs.push({ message: 'Subjects: a word needs a letter or a digit, goes once ignoring case and spaces, and ' + LIMITS.subjects + ' is the most, so Save keeps ' + sjKept + ' of ' + sp.subject.length + '.' }); }   // 1.6.0 Subjects, as the cleaner reads it
        if (sp.once && typeof sp.once === 'object' && typeof cleanListSpec === 'function') {   // 1.5.8 Counted once, as the cleaner reads it
            var onceK = (cleanListSpec(sp, true, F()) || {}).once;
            if (!onceK) errs.push({ message: 'Counted once needs a group stat and what makes a row the higher, each a number stat of this list or its level. Save drops it.' });
            else { if (sp.once.cost && !onceK.cost) errs.push({ message: 'Counted once: its full price names no number stat or column of this list, so Save drops it.' }); if (sp.once.free && !onceK.free) errs.push({ message: 'Counted once: what was given free names no number stat or column of this list, so Save drops it.' }); if (sp.once.across === true && !onceK.across) errs.push({ message: 'Counted once: Across specialties needs a list with Specialties, so Save drops it.' }); }
        }
        (Array.isArray(sp.cols) ? sp.cols : []).forEach(function(cc) {   // 1.5.4: a column's Metric list and its decimals, as the cleaner reads them
            if (!cc || typeof cc !== 'object') return;
            var cnU = (typeof cc.label === 'string' && cc.label) || (typeof cc.key === 'string' && cc.key) || 'A column', cmU = typeof cleanFieldUnit === 'function' && !!cleanFieldUnit(typeof unitOf === 'function' ? unitOf(cc.unit, true) : typeof cc.unit === 'string' ? cc.unit.trim() : '', 'number');
            if ((cc.unitShow === 'swap' || cc.unitShow === 'bare') && !cmU) errs.push({ message: 'Column "' + cnU + '": Metric ' + (cc.unitShow === 'swap' ? 'instead' : 'bare') + ' needs a unit that is a measure, such as lb or yd/s, so Save drops it.' });
            decSaid(errs, 'Column "' + cnU + '"', cc.decMax, cmU);
        });
        (Array.isArray(sp.cols) ? sp.cols : []).forEach(function(cc) {   // 1.5.4 With: what Save drops of a column's With stats, as the cleaner reads them
            if (!cc || typeof cc !== 'object' || !Array.isArray(cc.plus)) return;
            var cn = (typeof cc.label === 'string' && cc.label) || (typeof cc.key === 'string' && cc.key) || 'A column', seenP = Object.create(null), keptP = 0;
            cc.plus.forEach(function(p) {
                var pl = typeof p === 'string' ? p.trim().toLowerCase() : ''; if (!pl) return;
                var ps = null; st.forEach(function(s) { if (!ps && s && typeof s === 'object' && typeof s.key === 'string' && s.key.toLowerCase() === pl) ps = s; });
                if (!ps || !mine[pl]) errs.push({ message: 'Column "' + cn + '": With names "' + p + '", which is no stat of this list. Save drops that name.' });
                else if (!keptW[pl]) errs.push({ message: 'Column "' + cn + '": With names "' + p + '", a stat past the ' + capS + ' Save keeps. Save drops that name.' });
                else if (ps.kind === 'pick') errs.push({ message: 'Column "' + cn + '": With names "' + p + '", which is a choice. Only a number adds to a column. Save drops that name.' });
                else if (seenP[pl]) errs.push({ message: 'Column "' + cn + '": With names "' + p + '" twice. Save keeps the first.' });
                else { seenP[pl] = 1; if (++keptP === LIMITS.colPlus + 1) errs.push({ message: 'Column "' + cn + '": at most ' + LIMITS.colPlus + ' With stats a column. Save keeps the first ' + LIMITS.colPlus + '.' }); }
            });
        });
        if (typeof sp.unheld === 'string') {   // 1.6.0 Rolls unheld entries, as the cleaner reads it
            if (!(sp.lvl && typeof sp.lvl === 'object')) errs.push({ message: 'Rolls unheld entries needs Rows have a level. Save drops it.' });
            else if (!sp.unheld.trim()) errs.push({ message: 'Rolls unheld entries needs an Unheld level. Save drops the tick.' });
            else if (!unheldRolls(sp).length) (warningsById['list:' + f.id] = warningsById['list:' + f.id] || []).push({ message: 'Rolls unheld entries: this list has no roll yet, so Roll unheld has nothing to roll.' });
        }
        if (sp.lvl && typeof sp.lvl === 'object') {   // 1.6.0 Keeps the starting level: Row.startlvl as the resolver reads it
            var slKeyed = (Array.isArray(sp.stats) ? sp.stats : []).concat(Array.isArray(sp.cols) ? sp.cols : []).some(function(x) { return x && typeof x.key === 'string' && x.key.toLowerCase() === 'startlvl'; });
            if (slKeyed && sp.lvl.start === true) (warningsById['list:' + f.id] = warningsById['list:' + f.id] || []).push({ message: 'This list keys a stat or a column startlvl, so Row.startlvl reads that and not the level a row started at.' });
            else if (!slKeyed && sp.lvl.start !== true && /(^|[^A-Za-z0-9_.])Row\.startlvl(?![A-Za-z0-9_])/i.test(JSON.stringify(sp))) (warningsById['list:' + f.id] = warningsById['list:' + f.id] || []).push({ message: 'Row.startlvl reads each row\u2019s level now. Tick Keeps the starting level, and new rows remember the level they start at.' });
        }
        if (sp.load && typeof sp.load === 'object') {   // 1.5.8 Loads from, as the cleaner reads it
            var ldr = sp.load, ldSrc = null, ctsE = Array.isArray(sp.counters) ? sp.counters : [], ldK = typeof ldr.ct === 'string' ? ldr.ct.trim().toLowerCase() : '';
            draft.fields.forEach(function(x) { if (!ldSrc && x && x.id === ldr.from) ldSrc = x; });
            if (!ldSrc || ldSrc.kind !== 'item-list' || ldSrc.id === f.id) errs.push({ message: 'Loads from names no other item list. Save drops it.' });
            else if (!(ldSrc.list && typeof ldSrc.list === 'object' && ldSrc.list.lvl && typeof ldSrc.list.lvl === 'object')) errs.push({ message: 'Loads from ' + (ldSrc.label || ldSrc.key || 'that list') + ', whose rows have no level to hold what they carry. Tick Rows have a level there, or Save drops it.' });
            else if (!ldK || !ctsE.some(function(x) { return x && typeof x.key === 'string' && x.key.toLowerCase() === ldK; })) errs.push({ message: 'Loads from needs one of this list\u2019s counters to hold what is loaded. Save drops it.' });
            else if (ldSrc.vis === 'gm' && f.vis !== 'gm') (warningsById['list:' + f.id] = warningsById['list:' + f.id] || []).push({ message: 'Loads from a GM-only list: players see no Load on their sheet.' });
            if (Array.isArray(ldr.cats) && ldr.cats.length > LIMITS.listCats) errs.push({ message: 'Loads from takes at most ' + LIMITS.listCats + ' categories. Save keeps the first ' + LIMITS.listCats + '.' });
        }
        if (Array.isArray(sp.feeds) && sp.feeds.length) {   // 1.6.0 Feeds, as the cleaner reads them
            var fdCts = Array.isArray(sp.counters) ? sp.counters : [], fdKs = {}, fdUsed = {}; if (sp.load && typeof sp.load === 'object' && typeof sp.load.ct === 'string') fdUsed[sp.load.ct.trim().toLowerCase()] = 1;
            if (sp.feeds.length > FEEDS_MAX) errs.push({ message: 'A list has at most ' + FEEDS_MAX + ' feeds. Save keeps the first ' + FEEDS_MAX + '.' });
            sp.feeds.slice(0, FEEDS_MAX).forEach(function(fd, fi) {
                var who = 'Feed ' + (fi + 1), kk = fd && typeof fd.key === 'string' ? fd.key.trim() : '', ctk = fd && typeof fd.ct === 'string' ? fd.ct.trim().toLowerCase() : '', fsrc = null;
                if (!fd || typeof fd !== 'object') return;
                draft.fields.forEach(function(x) { if (!fsrc && x && x.id === fd.from) fsrc = x; });
                if (!/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(kk) || kk in Object.prototype) { errs.push({ message: who + ' needs a key of letters, digits and _, starting with a letter. Save drops it.' }); return; }
                if (fdKs[kk.toLowerCase()]) { errs.push({ message: who + ' repeats the key ' + kk + '. Save drops it.' }); return; }
                if (!fsrc || fsrc.kind !== 'item-list' || fsrc.id === f.id) { errs.push({ message: who + ' loads from no other item list. Save drops it.' }); return; }
                if (!(fsrc.list && typeof fsrc.list === 'object' && fsrc.list.lvl && typeof fsrc.list.lvl === 'object')) { errs.push({ message: who + ' loads from ' + (fsrc.label || fsrc.key || 'that list') + ', whose rows have no level to hold what they carry. Tick Rows have a level there, or Save drops it.' }); return; }
                if (!ctk || !fdCts.some(function(x) { return x && typeof x.key === 'string' && x.key.toLowerCase() === ctk; })) { errs.push({ message: who + ' needs one of this list\u2019s counters to hold what is loaded. Save drops it.' }); return; }
                if (fdUsed[ctk]) { errs.push({ message: who + ' needs a counter of its own: a load or another feed holds that one. Save drops it.' }); return; }
                fdKs[kk.toLowerCase()] = 1; fdUsed[ctk] = 1;
                if (fsrc.vis === 'gm' && f.vis !== 'gm') (warningsById['list:' + f.id] = warningsById['list:' + f.id] || []).push({ message: who + ' loads from a GM-only list: players see no feed on their sheet.' });
                if (Array.isArray(fd.cats) && fd.cats.length > LIMITS.listCats) errs.push({ message: who + ' takes at most ' + LIMITS.listCats + ' categories. Save keeps the first ' + LIMITS.listCats + '.' });
            });
        }
        if (sp.chamber && typeof sp.chamber === 'object') {   // 1.5.9 Chambers from, as the cleaner reads it
            var chr = sp.chamber, chSrc = null, stsC = Array.isArray(sp.stats) ? sp.stats : [];
            draft.fields.forEach(function(x) { if (!chSrc && x && x.id === chr.from) chSrc = x; });
            if (!chSrc || chSrc.kind !== 'item-list') errs.push({ message: 'Chambers from names no item list. Save drops it.' });
            else if (chSrc.vis === 'gm' && f.vis !== 'gm') (warningsById['list:' + f.id] = warningsById['list:' + f.id] || []).push({ message: 'Chambers from a GM-only list: players see no Chamber on their sheet.' });
            var cBy = typeof chr.by === 'string' ? chr.by.trim().toLowerCase() : '', cTo = typeof chr.to === 'string' ? chr.to.trim() : '';
            if ((cBy && !cTo) || (!cBy && cTo)) errs.push({ message: 'Matched by needs a stat of this list and a stat of the round\u2019s list. Save drops it.' });
            else if (cBy && !stsC.some(function(x) { return x && typeof x.key === 'string' && x.key.toLowerCase() === cBy; })) errs.push({ message: 'Matched by names no stat of this list. Save drops it.' });
            var cCb = typeof chr.capBy === 'string' ? chr.capBy.trim().toLowerCase() : '';   // the review of fold 2, as the cleaner reads it
            if (cCb && !stsC.some(function(x) { return x && typeof x.key === 'string' && x.kind !== 'pick' && x.key.toLowerCase() === cCb; })) errs.push({ message: 'The row\u2019s Holds names no number stat of this list. Save drops it.' });
            if (Array.isArray(chr.cats) && chr.cats.length > LIMITS.listCats) errs.push({ message: 'Chambers from takes at most ' + LIMITS.listCats + ' categories. Save keeps the first ' + LIMITS.listCats + '.' });
            if (typeof chr.reach === 'string' && chr.reach.trim() && typeof cleanReach === 'function' && !cleanReach(chr.reach, F())) errs.push({ message: 'Flies at most does not read as a formula with no dice. Save drops it.' });   // 1.5.9 (es), as the cleaner reads it
        }
        if (typeof onRemoveSays === 'function') onRemoveSays(sp, draft.fields, F()).forEach(function(m) { errs.push({ message: m }); });   // 1.6.0: When a row is taken off, as the cleaner reads it
        if (typeof switchChangesSays === 'function') switchChangesSays(sp, draft.fields, F()).forEach(function(m) { errs.push({ message: m }); });   // 1.6.2 (167 B): a switch's changes, as the cleaner reads them
        if (typeof gmStatSays === 'function') { var gsS = gmStatSays(f, draft.fields); gsS.errs.forEach(function(m) { errs.push({ message: m }); }); gsS.warns.forEach(function(m) { (warningsById['list:' + f.id] = warningsById['list:' + f.id] || []).push({ message: m }); }); }   // 1.6.0: a GM-only stat
        (Array.isArray(sp.rolls) ? sp.rolls : []).forEach(function(rr) { var xc = rr && rr.cross && typeof rr.cross === 'object' && typeof rr.cross.ct === 'string' ? rr.cross.ct.toLowerCase() : ''; if (xc && (Array.isArray(rr.apply) ? rr.apply : Array.isArray(rr.then) ? rr.then : []).some(function(ch) { return !!ch && typeof ch === 'object' && typeof ch.c === 'string' && ch.c.toLowerCase() === xc; })) (warningsById['list:' + f.id] = warningsById['list:' + f.id] || []).push({ message: 'When a value crosses: its own changes move the value it watches, so a run can set off another, at most 3 in a row.' }); });   // 1.6.0: a row's crossing that moves its own counter
        keptBy[f.id] = mine;
        if (errs.length) errorsById['list:' + f.id] = errs;
    });
    // 1.6.3 (the review of fields): a list with no short name is said under its own card on the Lists tab too, since the card shows only what is filed
    // under 'list:' and its id, so a press on the line lands on the card's name box. It comes after the loop above, which sets that entry whole
    draft.fields.forEach(function(f) { if (f && f.kind === 'item-list' && typeof f.id === 'string' && !f.key) (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ prop: 'label', message: nameSays(f) }); });
    var camp0 = getActiveCampaign(), saved = systemOf(camp0), toldI = Object.create(null), hasKey = function(m, l) { return !!m && typeof m === 'object' && !Array.isArray(m) && Object.keys(m).some(function(k) { return k.toLowerCase() === l; }); };
    var valOf = function(m, l) { var out; if (m && typeof m === 'object' && !Array.isArray(m)) Object.keys(m).forEach(function(k) { if (k.toLowerCase() === l) out = m[k]; }); return out; };
    var rnP = typeof renamesOf === 'function' ? renamesOf(saved, draft).picks : [];   // 1.6.2: a label renamed: what holds it follows at Save, and Save drops nothing
    var misfits = function(ds, v) { return v !== undefined && v !== null && (ds.kind === 'pick' ? !(typeof v === 'string' && ((Array.isArray(ds.opts) ? ds.opts : []).some(function(o) { return o && typeof o.label === 'string' && o.label.toLowerCase() === v.trim().toLowerCase(); }) || rnP.some(function(p) { return p.key.toLowerCase() === String(ds.key).toLowerCase() && p.from.toLowerCase() === v.trim().toLowerCase(); }))) : typeof v !== 'number'); };
    var stillOn = function(sf, s, l) {   // a saved stat still on the card: characters' own values its kind or its options no longer take (the items' are said on their rows)
        var df = null, ds = null; (draft.fields || []).forEach(function(x) { if (x && x.id === sf.id) df = x; });
        (df && df.list && Array.isArray(df.list.stats) ? df.list.stats : []).forEach(function(x) { if (!ds && x && typeof x.key === 'string' && x.key.toLowerCase() === l) ds = x; });
        if (!ds) return;
        var nC = 0; Object.keys((camp0 && camp0.chars) || {}).forEach(function(cid) { var ch = camp0.chars[cid], rows = ch && ch.values && Array.isArray(ch.values[sf.id]) ? ch.values[sf.id] : []; if (rows.some(function(r) { return r && misfits(ds, (typeof r.defId !== 'string' && r.lnk !== 1 && r.def) ? valOf(r.def.stats, l) : (typeof r.defId === 'string' && r.ov) ? valOf(r.ov.stats, l) : undefined); })) nC++; });
        if (!nC) return;
        var why = (s.kind === 'pick') !== (ds.kind === 'pick') ? (ds.kind === 'pick' ? 'it is a choice now' : 'it is a number now') : 'an option they name is gone';
        (errorsById['list:' + sf.id] = errorsById['list:' + sf.id] || []).push({ message: 'Save drops the \u201c' + ds.key + '\u201d values of ' + nC + ' character' + (nC === 1 ? '\u2019s copy' : 's\u2019 copies') + ' (' + why + ').' });
    };
    (saved && Array.isArray(saved.fields) ? saved.fields : []).forEach(function(sf) {
        if (!sf || sf.kind !== 'item-list' || !sf.list || !Array.isArray(sf.list.stats)) return;
        var card = keptBy[sf.id];   // a list gone from the draft (or no longer a list) has no card: its items are told on their own rows (F4c1 review)
        sf.list.stats.forEach(function(s) {
            var l = s && typeof s.key === 'string' ? s.key.toLowerCase() : ''; if (!l) return;
            if (card && card[l]) { stillOn(sf, s, l); return; }   // still on this list (another spelling keeps the values) — unless its kind changed or an option is gone (owed review F5a2#6)
            if (!card) { if (!keptAll[l] && !toldI[l]) { toldI[l] = 1; (draft.items || []).forEach(function(it) { if (it && hasKey(it.stats, l)) (errorsById[it.id] = errorsById[it.id] || []).push({ prop: 'stats', message: 'Save drops its “' + s.key + '” value: no list has that stat now (a stat’s key is its identity).' }); }); } return; }
            var nI = 0, nC = 0;
            if (!keptAll[l] && !toldI[l]) { toldI[l] = 1; (draft.items || []).forEach(function(it) { if (it && hasKey(it.stats, l)) nI++; }); }   // an item keeps a stat while any list has it
            Object.keys((camp0 && camp0.chars) || {}).forEach(function(cid) { var ch = camp0.chars[cid], rows = ch && ch.values && Array.isArray(ch.values[sf.id]) ? ch.values[sf.id] : []; if (rows.some(function(r) { return r && ((typeof r.defId !== 'string' && r.lnk !== 1 && r.def && hasKey(r.def.stats, l)) || (typeof r.defId === 'string' && r.ov && hasKey(r.ov.stats, l))); })) nC++; });   // a custom copy keeps its own list's stats only, and a linked copy its own values (critic 8; F4c2 review)
            if (!nI && !nC) return;
            var what = [];
            if (nI) what.push('the “' + s.key + '” values of ' + nI + ' item' + (nI === 1 ? '' : 's'));
            if (nC) what.push((nI ? 'the own values of ' : 'the “' + s.key + '” values of ') + nC + ' character' + (nC === 1 ? '’s copy' : 's’ copies'));
            (errorsById['list:' + sf.id] = errorsById['list:' + sf.id] || []).push({ message: 'Save drops ' + what.join(' and ') + ' (a stat’s key is its identity).' });
        });
    });
    var clean = cleanSystem(draft, { F: F(), gmView: true });
    if (!clean) return;
    draft.fields.forEach(function(f) {   // 1.6.0 Changes apply where, as the cleaner reads it (the validator says the rest)
        if (!f || f.kind !== 'item-list' || !f.list || typeof f.list.modsIf !== 'string' || !f.list.modsIf.trim()) return;
        var cf = (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0]; if (!cf || (cf.list && cf.list.modsIf)) return;
        var pz = null; try { pz = F().parse(f.list.modsIf.trim()); } catch (e) { pz = null; }
        var said = !pz || !pz.ok ? 'is no formula Save can keep, so Save drops it.' : typeof hasDice === 'function' && pz.ast && hasDice(pz.ast.body) ? 'rolls dice, and a gate is read with none, so Save drops it.' : 'reads a GM-only value, here or through what it reads. Your players\u2019 sheets must give the same figures as yours, so Save drops it.';
        (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: 'Changes apply where ' + said + ' The rows then give their changes whatever it says.' });
    });
    draft.fields.forEach(function(f) {   // 1.6.2, the review of backlog 234: Price from, as the cleaner reads it
        if (!f || f.kind !== 'item-list' || !f.list || typeof f.list.priceCol !== 'string' || !f.list.priceCol) return;
        var cf = (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0]; if (!cf || (cf.list && cf.list.priceCol)) return;
        var hasCol = (Array.isArray(f.list.cols) ? f.list.cols : []).some(function(c) { return c && typeof c.key === 'string' && c.key.toLowerCase() === f.list.priceCol.toLowerCase(); }) && !!(cf.list && Array.isArray(cf.list.cols) && cf.list.cols.some(function(c) { return c && typeof c.key === 'string' && c.key.toLowerCase() === f.list.priceCol.toLowerCase(); }));
        var said = !(cf.list && cf.list.price) ? 'needs a Price stat beside it' : !hasCol ? 'names no column of this list' : 'reads a value only the GM sees, here or through what it reads, and a row\u2019s Paid reaches its owner';
        (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: 'Price from ' + said + ', so Save drops it and a row added records the Price stat.' });
    });
    draft.fields.forEach(function(f) {   // 1.6.0 Subject only where, as the cleaner reads it
        if (!f || f.kind !== 'item-list' || !f.list || typeof f.list.subjectIf !== 'string' || !f.list.subjectIf.trim()) return;
        var cf = (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0]; if (!cf || (cf.list && cf.list.subjectIf)) return;
        var pz = null; try { pz = F().parse(f.list.subjectIf.trim()); } catch (e) { pz = null; }
        var said = !Array.isArray(f.list.subject) || !f.list.subject.length ? 'stands beside Subjects, and this list names none, so Save drops it.' : !pz || !pz.ok ? 'is no formula Save can keep, so Save drops it.' : typeof hasDice === 'function' && pz.ast && hasDice(pz.ast.body) ? 'rolls dice, and it is read with none, so Save drops it.' : 'reads a GM-only value, here or through what it reads. Your players\u2019 sheets must give the same figures as yours, so Save drops it.';
        (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: 'Subject only where ' + said + ' Every row then shows the menu.' });
    });
    draft.fields.forEach(function(f) {   // 1.6.0 Fits where (ask 18), as the cleaner reads it: dropped where it is no formula or rolls dice; kept for you and left out of the players' view where it reads a GM-only value
        if (!f || f.kind !== 'item-list' || !f.list || !f.list.parts || typeof f.list.parts.fitIf !== 'string' || !f.list.parts.fitIf.trim()) return;
        var cf = (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0]; if (!cf || !cf.list || !cf.list.parts) return;
        var said = '';
        if (!cf.list.parts.fitIf) { var pzF = null; try { pzF = F().parse(f.list.parts.fitIf.trim()); } catch (e) { pzF = null; } said = !pzF || !pzF.ok ? 'is no formula Save can keep, so Save drops it.' : 'rolls dice, and it is read with none, so Save drops it.'; }
        else if (typeof fitIfOk === 'function' && !fitIfOk({ fields: clean.fields, items: clean.items, core: clean.core, tables: clean.tables }, F(), cf, cf.list.parts.fitIf)) said = 'reads a GM-only value, here or through what it reads, so your players\u2019 sheets keep none of it and their parts are not judged by it. Yours are.';
        if (said) (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: 'Fits where ' + said });
    });
    draft.fields.forEach(function(f) {   // 1.6.2 (body fold 2)
        if (!f || f.kind !== 'item-list' || !f.list || !f.list.stand || typeof f.list.stand !== 'object') return; var cf = (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0], gsS = { fields: clean.fields, items: clean.items, core: clean.core, tables: clean.tables };
        standSays(f.list.stand, cf && cf.list ? cf.list.stand : null, F(), hasDice, function(t) { return modsIfOk(gsS, F(), cf, t); }).forEach(function(w) { (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: w }); });
    });
    draft.fields.forEach(function(f) {   // 1.6.2: a further rule of Fits where and a line of Holds by kind by a formula, as the cleaner reads them
        if (!f || f.kind !== 'item-list' || !f.list || !f.list.parts) return;
        var cf = (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0], cp = cf && cf.list ? cf.list.parts : null; if (!cp) return;
        var gs = { fields: clean.fields, items: clean.items, core: clean.core, tables: clean.tables }, say = function(w) { (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: w }); };
        var bad = function(name, t, rest) { var pz = null; try { pz = F().parse(t); } catch (e) { pz = null; } say(name + (!pz || !pz.ok ? ' is no formula Save can keep, so Save drops it.' : typeof hasDice === 'function' && pz.ast && hasDice(pz.ast.body) ? ' rolls dice, and it is read with none, so Save drops it.' : rest)); };
        (Array.isArray(f.list.parts.fitMore) ? f.list.parts.fitMore : []).forEach(function(r, i) {
            var t = r && typeof r['if'] === 'string' ? r['if'].trim() : '', nm = 'Fits where, rule ' + (i + 2); if (!t) return;
            var kept = (Array.isArray(cp.fitMore) ? cp.fitMore : []).filter(function(x) { return x['if'] === t; })[0];
            if (!kept) bad(nm, t, ' cannot be kept, so Save drops it.');
            else if (typeof fitIfOk === 'function' && !fitIfOk(gs, F(), cf, t)) say(nm + ' reads a GM-only value, here or through what it reads, so your players\u2019 sheets keep none of it and their parts are not judged by it. Yours are.');
        });
        (Array.isArray(f.list.parts.caps) ? f.list.parts.caps : []).forEach(function(k, i) {
            ['f', 'if'].forEach(function(w) {
                var t = k && typeof k[w] === 'string' ? k[w].trim() : '', nm = 'Holds by kind, line ' + (i + 1) + (w === 'if' ? ', Only where' : ''); if (!t) return;
                var kept = (Array.isArray(cp.caps) ? cp.caps : []).filter(function(x) { return x[w] === t; })[0];
                if (!kept) bad(nm, t, ' says nothing of what it counts yet, so Save drops the line.');
                else if (typeof capFOk === 'function' && !capFOk(gs, F(), cf, t)) say(nm + ' reads a GM-only value, here or through what it reads, so your players\u2019 sheets keep none of it and their rows are not limited by it. Yours are.');
            });
        });
    });
    draft.fields.forEach(function(f) {   // 1.6.0 Specialties, as the cleaner reads it: a part that names no stat or column of the list goes
        if (!f || f.kind !== 'item-list' || !f.list || !f.list.specs || typeof f.list.specs !== 'object') return;
        var cf = (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0], cs = cf && cf.list && cf.list.specs ? cf.list.specs : null; if (!cs) return;
        [['by', 'Specialty from names no choice stat of this list'], ['of', 'Parent from names no choice stat of this list'], ['cover', 'Covers names no number stat with value names of this list'], ['apart', 'Stands apart names no number stat with value names of this list'], ['never', 'Never untrained names no number stat or column of this list'], ['pen', 'Untrained shows names no number stat or column of this list'], ['fall', 'Fallback names no number stat or column of this list'], ['dflt', 'Untrained names no column of this list']].forEach(function(p) { var w = f.list.specs[p[0]]; if (typeof w === 'string' && w.trim() && !cs[p[0]]) (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: p[1] + ', so Save drops it.' }); });
    });
    if (typeof whyDropsAt === 'function') {   // 1.6.2: a reason Save drops, as the cleaner reads it
        (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) { if (r && typeof r.id === 'string') whyDropsAt(r).forEach(function(d) { (errorsById[r.id] = errorsById[r.id] || []).push({ prop: 'needsWhy.' + d.at + '.drop', message: d.message }); }); });   // under the reason's own box
        draft.fields.forEach(function(f) { if (f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) f.list.rolls.forEach(function(r) { if (!r || typeof r !== 'object') return; var nm = r.label || (Array.isArray(r.apply) ? 'Apply' : 'Roll'); whyDropsAt(r).forEach(function(d) { (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: 'Roll \u201c' + nm + '\u201d, needs: ' + d.message }); }); }); });
    }
    (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) {   // 1.5.4: a roll's or an apply action's needs that Save cannot keep, as the cleaner reads it (the validator says the rest)
        if (!r || typeof r !== 'object' || typeof r.needs !== 'string' || !r.needs.trim()) return;
        var cr = (clean.rolls || []).filter(function(x) { return x && x.id === r.id; })[0]; if (cr && !cr.needs) (errorsById[r.id] = errorsById[r.id] || []).push({ prop: 'needs', message: 'This is no formula Save can keep, so Save drops it.' });
    });
    // 1.6.3 (Fulllion's rulings of 2026-11-20: "it makes sense to have fields be required when other fields depend on them", and "none isn't a good default
    // substitution"): a roll's or an apply action's boxes that others depend on, read as the cleaner reads them, each said under its own box (sysui.js
    // PROP_BOX). Nothing here holds Save, and the cleaner keeps what it always kept. A roll nobody has typed in (no name and nothing to roll) says nothing
    (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) {
        if (!r || typeof r !== 'object' || typeof r.id !== 'string') return;
        var push = function(p, m) { (errorsById[r.id] = errorsById[r.id] || []).push({ prop: p, message: m }); };
        var isAp = Array.isArray(r.apply), named = typeof r.label === 'string' && !!r.label.trim(), ndRaw = typeof r.needs === 'string' && !!r.needs.trim();
        var ndK = typeof cleanFormulaText === 'function' ? !!cleanFormulaText(r.needs) : ndRaw, whyK = typeof cleanNeedsWhy === 'function' && !!cleanNeedsWhy(r.needsWhy), words = typeof r.needsText === 'string' && !!r.needsText.trim();
        // its name is its button, its card and its place in every list that picks it; with none the cleaner writes the generic Roll or Apply
        if (!named && (isAp ? r.apply.length > 0 : (typeof r.formula === 'string' && !!r.formula.trim()))) push('label', 'It is empty, so its button, its card in Table Chat and every list that picks it say ' + (isAp ? 'Apply' : 'Roll') + '. Give it a name.');
        // the words for the grayed button are what a refused press says, to the player too; with none it says only Not now
        if (ndK && !words) push('needsText', 'The words for the grayed button are empty, so a refused press says only Not now. Give the button its words.');
        // the words, Hidden until it can be used and The GM may press past it are kept only beside needs (the two ticks beside a reason too)
        if (!ndRaw && words) push('needs', 'It is empty, so Save drops the words for the grayed button. Write what it needs, or clear those words.');
        if (!ndRaw && !whyK && r.hideOff === true) push('needs', 'It is empty and there is no reason below, so Save drops Hidden until it can be used.');
        if (!ndRaw && !whyK && r.needsGm === true) push('needs', 'It is empty and there is no reason below, so Save drops The GM may press past it.');
        // a crossing's Then every counts only with Steps, a whole number from 2 to 20 (the cleaner drops any other, and only the first step runs)
        var xc = r.cross && typeof r.cross === 'object' ? r.cross : null, xn = xc ? xc.count : undefined;
        if (xc && typeof xc.step === 'string' && xc.step.trim() && !(typeof xn === 'number' && Math.floor(xn) === xn && xn >= 2 && xn <= 20)) push('cross.count', 'Steps needs a whole number from 2 to 20, or only the first step runs.');
    });
    if (typeof callDrops === 'function') {   // 1.6.0: a call's Read on the one who resisted that Save cannot keep, as the cleaner reads it (the validator says the rest)
        (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) { callDrops(r).forEach(function(m) { (errorsById[r.id] = errorsById[r.id] || []).push({ prop: 'byIf', message: m }); }); });
        if (typeof crewDrops === 'function') (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) { crewDrops(r).forEach(function(m) { (errorsById[r.id] = errorsById[r.id] || []).push({ prop: 'calls', message: m }); }); });   // 1.6.2 (fold (f))
        draft.fields.forEach(function(f) { if (f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) f.list.rolls.forEach(function(r) { callDrops(r).forEach(function(m) { (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: (r.label || 'A roll') + ', read on the one who resisted: ' + m }); }); }); });
    }
    (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) {   // 1.6.0: A Major Wound where that Save cannot keep, as the cleaner reads it (the validator says the rest)
        if (!r || typeof r !== 'object' || r.dmg !== true || typeof r.dmgMajorIf !== 'string' || !r.dmgMajorIf.trim()) return;
        var cm = (clean.rolls || []).filter(function(x) { return x && x.id === r.id; })[0]; if (cm && !cm.dmgMajorIf) (errorsById[r.id] = errorsById[r.id] || []).push({ prop: 'dmgMajorIf', message: 'This is no formula Save can keep, so Save drops it.' });
    });
    var p2Says = function(r, cr, push) {   // 1.6.0 (B3): a second part Save cannot keep, and its type or armor divisor where no part is kept
        if (!r || typeof r !== 'object' || r.dmg !== true || !cr) return;
        var has = function(k) { return typeof r[k] === 'string' && !!r[k].trim(); };
        if (has('hits') && !cr.hits) push('hits', 'This is no formula Save can keep, so Save drops it.');   // 1.6.0 A burst
        if (has('dmg2') && !cr.dmg2) push('dmg2', 'This is no formula Save can keep, so Save drops it.');
        else if (!has('dmg2') && (has('dtype2') || has('ad2'))) push('dmg2', 'A second part\u2019s type and armor divisor need its formula, so Save drops them.');
        else if (has('dtype2') && cr.dmg2 && !cr.dtype2) push('dmg2', 'Its type is no formula Save can keep, so Save drops it.');
        if (has('dkind') && !cr.dkind) push('dkind', 'This is no formula Save can keep, so Save drops it.');   // 1.6.0: its kind of blow, and each part's
        if (has('dkind2') && !has('dmg2')) push('dkind2', 'A second part\u2019s kind needs its formula, so Save drops it.'); else if (has('dkind2') && cr.dmg2 && !cr.dkind2) push('dkind2', 'This is no formula Save can keep, so Save drops it.');
        if (has('ad2') && cr.dmg2 && !cr.ad2) push('ad2', 'This is no formula Save can keep, so Save drops it.');
        [3, 4, 5].forEach(function(k) {   // 1.6.0: a third, a fourth and a fifth part, alike
            var dk = 'dmg' + k, tk = 'dtype' + k, ak = 'ad' + k, kk = 'dkind' + k, nm = k === 3 ? 'third' : k === 4 ? 'fourth' : 'fifth';
            if (has(kk) && !has(dk)) push(kk, 'A ' + nm + ' part\u2019s kind needs its formula, so Save drops it.'); else if (has(kk) && cr[dk] && !cr[kk]) push(kk, 'This is no formula Save can keep, so Save drops it.');
            if (has(dk) && !cr[dk]) push(dk, 'This is no formula Save can keep, so Save drops it.');
            else if (!has(dk) && (has(tk) || has(ak))) push(dk, 'A ' + nm + ' part\u2019s type and armor divisor need its formula, so Save drops them.');
            else if (has(tk) && cr[dk] && !cr[tk]) push(dk, 'Its type is no formula Save can keep, so Save drops it.');
            if (has(ak) && cr[dk] && !cr[ak]) push(ak, 'This is no formula Save can keep, so Save drops it.');
        });
        // 1.6.3 (Fulllion's rulings of 2026-11-20: a box others depend on is required): a part kept with no type is read by the Take damage window as
        // the first type the Combat tab names, with no word of it, so where types are named its type is asked for under the part. The cleaner keeps it.
        // draft is asked through typeof, since a suite runs this helper alone
        var tyN = !!(typeof draft !== 'undefined' && draft && draft.combat && draft.combat.damage && Array.isArray(draft.combat.damage.types) && draft.combat.damage.types.length);
        if (tyN) [2, 3, 4, 5].forEach(function(k) { if (has('dmg' + k) && cr['dmg' + k] && !has('dtype' + k)) push('dmg' + k, 'It has no type, so the Take damage window gives it the first type in the list. Pick its type.'); });
    };
    var arSays = function(r, cr, push) {   // 1.6.0: a line Save cannot keep, as the cleaner reads it
        if (!r || typeof r !== 'object' || !r.area) return;
        if (!cr || !cr.area) { push('area', 'Hits a line: it needs a width above 0 and a reach, so Save drops it.'); return; }
        if (r.resistAll === true && !cr.resistAll) push('area', 'Each one resists: it needs a Resisted by, so Save drops it.');
        var pa = F() && typeof F().parse === 'function' ? F().parse(String(cr.area.reach)) : null; if (pa && !pa.ok) push('area', 'Hits a line: Save keeps the reach, but it cannot be read, so the line goes nowhere.');
    };
    (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) { var cp2 = r && typeof r === 'object' ? (clean.rolls || []).filter(function(x) { return x && x.id === r.id; })[0] : null; arSays(r, cp2, function(p, m) { (errorsById[r.id] = errorsById[r.id] || []).push({ prop: p, message: m }); }); p2Says(r, cp2, function(p, m) { (errorsById[r.id] = errorsById[r.id] || []).push({ prop: p, message: m }); }); });
    draft.fields.forEach(function(f) {   // and a list roll's, alike
        var cf2 = f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls) ? (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0] : null, cr2 = cf2 && cf2.list && Array.isArray(cf2.list.rolls) ? cf2.list.rolls : null;
        if (!cr2 || cr2.length !== f.list.rolls.length) return;
        f.list.rolls.forEach(function(r, i) { arSays(r, cr2[i], function(p, m) { (errorsById[f.id] = errorsById[f.id] || []).push({ prop: 'list.' + p + '.' + i + '.' + (r.label || 'Roll'), message: m }); }); p2Says(r, cr2[i], function(p, m) { (errorsById[f.id] = errorsById[f.id] || []).push({ prop: 'list.' + p + '.' + i + '.' + (r.label || 'Roll'), message: m }); }); });
        f.list.rolls.forEach(function(r, i) {   // 1.6.0: a fire's How many Save cannot keep
            (r && typeof r === 'object' && Array.isArray(r.then) ? r.then : []).forEach(function(c, k) {
                if (!c || (c.fire !== true && c.feed !== true) || typeof c.n !== 'string' || !c.n.trim() || !cr2[i] || !Array.isArray(cr2[i].then)) return;
                var kf = cr2[i].then.filter(function(x) { return x && (c.feed === true ? x.feed === true : x.fire === true) && (x.when || '') === (c.when || ''); })[0];
                if (kf && kf.n !== c.n.trim()) (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: 'Roll \u201c' + (r.label || 'Roll') + '\u201d, then ' + (k + 1) + ': How many is no formula Save can keep, so Save drops it and the row fires one.' });
            });
        });
    });
    draft.fields.forEach(function(f) {   // 1.6.0: a list roll's kind of attempt, alike
        var cfK = f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls) ? (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0] : null, crK = cfK && cfK.list && Array.isArray(cfK.list.rolls) ? cfK.list.rolls : null;
        if (!crK || crK.length !== f.list.rolls.length) return;
        f.list.rolls.forEach(function(r, i) { if (!r || typeof r !== 'object' || typeof r.attemptKey !== 'string' || !r.attemptKey || !crK[i] || crK[i].attemptKey) return; (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: 'Roll \u201c' + (r.label || 'Roll') + '\u201d: a kind of attempt needs Resisted by and a number stat of this list, so Save drops it.' }); });
    });
    if (draft.combat && draft.combat.holds && typeof draft.combat.holds === 'object') {   // 1.6.0 Who holds whom, as the cleaner reads it
        var hdD = draft.combat.holds, hdC = clean.combat && clean.combat.holds, hdE = function(m) { (errorsById.holds = errorsById.holds || []).push({ message: m }); };
        if (!hdC) hdE('Who holds whom needs an effect the held wear. Save drops it.');
        else {
            if (typeof hdD.ends === 'string' && hdD.ends.trim() && hdC.ends !== hdD.ends.trim()) hdE('All holds end where is no formula Save can keep, so Save drops it.');
            if (hdD.drag !== undefined && hdC.drag === undefined) hdE('Drags is no number above 0, so Save drops it.');
            if (window.wpSystemCore && Array.isArray(window.wpSystemCore.HOLD_ROLLS) && typeof withRowRoll === 'function' && window.wpSystemCore.HOLD_ROLLS.concat(['also']).some(function(k) { return (Array.isArray(hdD[k]) ? hdD[k] : [hdD[k]]).some(function(v) { return typeof v === 'string' && withRowRoll(v); }); })) hdE('Who holds whom names a roll answered with a row, which is made only from a defense card, so it cannot be made there.');   // 1.6.3 (the review of defense fold 2, finding 3)
            if (Array.isArray(hdD.also) && hdD.also.length > (hdC.also || []).length) hdE('Attacks that keep too takes ' + (window.wpSystemCore ? window.wpSystemCore.HOLD_ALSO : 80) + ' rolls at most. Save keeps the first ones.');
        }
    }
    draft.fields.forEach(function(f) {   // 1.6.0 Feeds: a Turns to change Save cannot keep
        if (!f || f.kind !== 'item-list' || !f.list || !Array.isArray(f.list.feeds)) return;
        var cfF = (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0], keptF = cfF && cfF.list && Array.isArray(cfF.list.feeds) ? cfF.list.feeds : [];
        f.list.feeds.forEach(function(fd, i) {
            if (!fd || typeof fd !== 'object' || typeof fd.turns !== 'string' || !fd.turns.trim()) return;
            var kf = keptF.filter(function(x) { return x && typeof fd.key === 'string' && x.key === fd.key.trim(); })[0];
            if (kf && kf.turns !== fd.turns.trim()) (errorsById['list:' + f.id] = errorsById['list:' + f.id] || []).push({ message: 'Feed ' + (i + 1) + ': Turns to change is no formula Save can keep, so Save drops it.' });
        });
    });
    draft.fields.forEach(function(f) {   // 1.6.0: a list roll's A Major Wound where, alike
        var cf = f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls) ? (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0] : null, cr = cf && cf.list && Array.isArray(cf.list.rolls) ? cf.list.rolls : null;
        if (!cr || cr.length !== f.list.rolls.length) return;
        f.list.rolls.forEach(function(r, i) { if (!r || typeof r !== 'object' || r.dmg !== true || typeof r.dmgMajorIf !== 'string' || !r.dmgMajorIf.trim() || !cr[i] || cr[i].dmgMajorIf) return; (errorsById[f.id] = errorsById[f.id] || []).push({ prop: 'list.mjif.' + i + '.' + (r.label || 'Roll'), message: 'This is no formula Save can keep, so Save drops it.' }); });
    });
    if (typeof withRowDrops === 'function') (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) { withRowDrops(r, clean).forEach(function(m) { (errorsById[r.id] = errorsById[r.id] || []).push({ prop: 'withRow', message: m }); }); });   // 1.6.3 (the review of defense fold 2, findings 3 and 11): what Save does beside a roll answered with a row, from the draft, as the cleaner reads it
    (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) {   // 1.5.9 (book es/et plan, section 3): Applies to as the cleaner reads it, never on the initiative roll
        if (!r || typeof r !== 'object' || !(r.to === 'near' || r.to === 'target')) return;
        var cn = (clean.rolls || []).filter(function(x) { return x && x.id === r.id; })[0]; if (cn && !(cn.to === 'near' || cn.to === 'target')) (errorsById[r.id] = errorsById[r.id] || []).push({ prop: 'to', message: 'The initiative roll is always its own character\u2019s, so Save drops Applies to.' });
    });
    // F4c1 review: what Save drops of an item's stats with no word otherwise — a value past ±1e9, and past LIMITS.entryStats an item (the first come are kept)
    var cleanById = Object.create(null); (clean.items || []).forEach(function(ci) { if (ci && ci.id) cleanById[ci.id] = ci; });
    (draft.items || []).forEach(function(it) {
        var ci = it && cleanById[it.id]; if (!ci || !it.stats || typeof it.stats !== 'object' || Array.isArray(it.stats)) return;
        var keptL = Object.create(null), big = [], over = [], mis = [];
        Object.keys(ci.stats || {}).forEach(function(k) { keptL[k.toLowerCase()] = 1; });
        Object.keys(it.stats).forEach(function(k) { var sv = it.stats[k], l = k.toLowerCase(); if (!keptAll[l] || keptL[l]) return; if (firstDef[l] && misfits(firstDef[l], sv)) { mis.push([k, firstDef[l], sv]); return; } if (typeof sv !== 'number' || !isFinite(sv)) return; if (Math.abs(sv) > LIMITS.statAbs) big.push(k); else over.push(k); });   // owed review F5a2#6: a value its stat no longer takes is said as that, never as past LIMITS.entryStats
        mis.forEach(function(x) { (errorsById[it.id] = errorsById[it.id] || []).push({ prop: 'stats', message: x[1].kind === 'pick' ? (typeof x[2] === 'string' ? '\u201c' + x[0] + '\u201d has no option \u201c' + x[2] + '\u201d now: Save drops it.' : '\u201c' + x[0] + '\u201d is a choice now: Save drops its number.') : '\u201c' + x[0] + '\u201d is a number now: Save drops its choice.' }); });
        big.forEach(function(k) { (errorsById[it.id] = errorsById[it.id] || []).push({ prop: 'stats', message: '“' + k + '” is past ±1,000,000,000: Save drops it.' }); });
        if (over.length) (errorsById[it.id] = errorsById[it.id] || []).push({ prop: 'stats', message: 'At most ' + LIMITS.entryStats + ' stats an item: Save drops ' + over.map(function(k) { return '“' + k + '”'; }).join(', ') + ' (the first ' + LIMITS.entryStats + ' are kept; clear the ones it does not need).' });
    });
    var v = validateSystem(clean, F());
    (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) {   // 1.6.0: a change on every row of a list, as the cleaner reads it (systemcore applyTargets): a list that is gone, or a stat that is no number stat of it, leaves the amount with nothing to change
        if (!r || typeof r !== 'object') return;
        ['apply', 'then'].forEach(function(k) { (Array.isArray(r[k]) ? r[k] : []).forEach(function(c, i) {
            if (!c || typeof c !== 'object' || typeof c.list !== 'string') return;
            var lf = (clean.fields || []).filter(function(x) { return x && x.id === c.list && x.kind === 'item-list'; })[0];
            if (typeof c.sw === 'boolean') { if (!lf || !lf.list || typeof lf.list.on !== 'object') (errorsById[r.id] = errorsById[r.id] || []).push({ prop: k + '.' + i, message: (lf ? 'Every row of ' + (lf.label || lf.key) + ': it has no switch' : 'Every row of: that list is gone') + ', so Save drops what it changes.' }); return; }   // 1.6.2 (167 A): every row's switch, as the cleaner reads it
            var ok = !!lf && !!(lf.list && Array.isArray(lf.list.stats) ? lf.list.stats : []).filter(function(t) { return t && t.kind !== 'pick' && typeof t.key === 'string' && t.key.toLowerCase() === String(c.s || '').toLowerCase(); })[0];
            if (!ok) (errorsById[r.id] = errorsById[r.id] || []).push({ prop: k + '.' + i, message: (lf ? 'Every row of ' + (lf.label || lf.key) + ': it has no number stat \u201c' + String(c.s || '') + '\u201d' : 'Every row of: that list is gone') + ', so Save keeps the amount and drops what it changes.' });
        }); });
    });
    (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) {   // 1.6.2 (found building a system by hand): a roll you named but left with nothing to roll is said, since Save leaves it out; one nobody has typed in says nothing
        if (!r || typeof r !== 'object' || Array.isArray(r.apply) || typeof r.label !== 'string' || !r.label.trim() || (typeof r.formula === 'string' && r.formula.trim())) return;
        (errorsById[r.id] = errorsById[r.id] || []).push({ prop: 'formula', message: 'It has nothing to roll yet, so Save leaves it out.' });
    });
    var whyRe = function(e) { var m = e && typeof e.prop === 'string' ? /^needsWhy\.(\d+)$/.exec(e.prop) : null, rr = m && typeof whyDraftAt === 'function' ? (draft.rolls || []).filter(function(x) { return x && x.id === e.id; })[0] : null; if (rr) e.prop = 'needsWhy.' + whyDraftAt(rr, +m[1]); };   // 1.6.2: a reason the validator read in the cleaned roll, named by its line in the draft
    // 1.6.3 (the review of fields): the validator counts a field's lines of Typing it fills in the CLEANED field, which has left out the lines Save drops, so
    // its fill.N is turned back into the line's place in the draft by the cleaner's own rule (systemcore cleanField: a field's id that is not this field's,
    // once each, a figure with no dice, at most AUTO_FILLS kept of the first four times that many). A line not found there falls to the row itself
    var fillDraftAt = function(f, k) {
        var cap = (typeof window !== 'undefined' && window.wpSystemCore && window.wpSystemCore.AUTO_FILLS) || 4, seen = Object.create(null), n = -1, ls = Array.isArray(f.fills) ? f.fills.slice(0, cap * 4) : [];
        for (var i = 0; i < ls.length && n < cap - 1; i++) {
            var x = ls[i]; if (!x || typeof x !== 'object' || Array.isArray(x) || typeof x.f !== 'string' || !/^f_[A-Za-z0-9_]{1,24}$/.test(x.f) || x.f === f.id || seen[x.f]) continue;
            var ft = typeof cleanFormulaText === 'function' ? cleanFormulaText(x.formula) : '', p = null; try { p = ft ? F().parse(ft) : null; } catch (er) { p = null; }
            if (!p || !p.ok || !p.ast || (typeof hasDice === 'function' && hasDice(p.ast.body))) continue;
            seen[x.f] = 1; if (++n === k) return i;
        }
        return -1;
    };
    var fillRe = function(e) { var m = e && typeof e.prop === 'string' ? /^fill\.(\d+)$/.exec(e.prop) : null, fd = m ? (draft.fields || []).filter(function(x) { return x && x.id === e.id; })[0] : null, at = fd ? fillDraftAt(fd, +m[1]) : -1; if (m) e.prop = at >= 0 ? 'fill.' + at : 'fills'; };
    v.errors.forEach(function(e) { whyRe(e); fillRe(e); var eid = e.prop === 'list' ? 'list:' + e.id : e.id; (errorsById[eid] = errorsById[eid] || []).push(e); });   // F4c1: a list's own messages sit under its card in Lists
    v.warnings.forEach(function(w) { whyRe(w); fillRe(w); var wid = w.prop === 'list' ? 'list:' + w.id : w.id; (warningsById[wid] = warningsById[wid] || []).push(w); });
    var tnE = draft.combat && draft.combat.turn && typeof draft.combat.turn === 'object' ? draft.combat.turn : null, tErr = [];   // turn-based combat T1: what Save drops from the turn rules, under the Combat tab
    if (tnE) {
        var KEY = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
        if (tnE.secs !== undefined && !(typeof tnE.secs === 'number' && tnE.secs > 0 && tnE.secs <= 86400)) tErr.push({ message: 'A round is more than 0 and at most 86400 seconds: Save drops it.' });
        [['acts', 'Action'], ['units', 'Time unit']].forEach(function(g) {
            var seen = Object.create(null), cap = g[0] === 'acts' ? LIMITS.turnActs : LIMITS.turnUnits;
            (Array.isArray(tnE[g[0]]) ? tnE[g[0]] : []).forEach(function(x, i) {
                var k = x && typeof x.key === 'string' ? x.key : '', nm = g[1] + ' ' + (i + 1);
                if (i >= cap) tErr.push({ message: nm + ': at most ' + cap + ', so Save drops it.' });
                else if (!KEY.test(k)) tErr.push({ message: nm + ' needs a key (a letter, then letters, digits and _): Save drops it.' });
                else if (seen[k.toLowerCase()]) tErr.push({ message: nm + ': another has the key \u201c' + k + '\u201d, so Save drops it.' });
                else if (g[0] === 'units' && TIME_WORDS[k.toLowerCase()] === 1) tErr.push({ message: nm + ': \u201c' + k + '\u201d is already a time word, so Save drops it.' });
                else if (g[0] === 'units' && !(typeof x.secs === 'number' && x.secs > 0 && x.secs <= 1e9)) tErr.push({ message: nm + ' needs its length in seconds: Save drops it.' });
                else if (g[0] === 'acts' && !(typeof x.n === 'number' && Math.floor(x.n) === x.n && x.n >= 1 && x.n <= 9)) tErr.push({ message: nm + ': a turn allows 1 to 9, so Save keeps 1.' });
                if (KEY.test(k)) seen[k.toLowerCase()] = 1;
            });
        });
    }
    if (tErr.length) errorsById.combat = (errorsById.combat || []).concat(tErr);
    var ckE = draft.combat && typeof draft.combat === 'object' ? draft.combat : null, kErr = [];   // 1.6.0 (the v2 sort's B1): what Save drops of the critical range and the named success, as the cleaner reads them
    if (ckE && ckE.checks !== 'fixed' && ((typeof ckE.critAt === 'string' && ckE.critAt.trim()) || (typeof ckE.fumbleAt === 'string' && ckE.fumbleAt.trim()))) kErr.push({ message: 'Roll outcomes is not Criticals at fixed rolls, so Save drops the critical range.' });
    if (ckE && ckE.tier && typeof ckE.tier === 'object' && !cleanTier(ckE.tier)) kErr.push({ message: 'A named success needs a name and a margin, a whole number from 1: Save drops it.' });
    if (kErr.length) errorsById.checks = (errorsById.checks || []).concat(kErr);
    var ltE = draft.combat && draft.combat.light && typeof draft.combat.light === 'object' ? draft.combat.light : null, lErr = [], lKept = 0;   // lighting L4: what Save drops from the light rules, under the Combat tab's Light box — read as the cleaner reads (systemcore cleanLightRules): a name is what is left of it without control characters, a number is finite and no larger than the wire takes, the cap counts the presets kept
    var lCtl = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g'), lNum = function(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e15 ? v : 0; };
    if (ltE) (Array.isArray(ltE.presets) ? ltE.presets : []).forEach(function(p, i) {
        var nm = 'Light preset ' + (i + 1), b = lNum(p && p.bright), d = lNum(p && p.dim);
        var named = !!p && typeof p.name === 'string' && !!Array.from(p.name.slice(0, 256).replace(lCtl, ' ').trim()).filter(function(ch) { return !(ch.length === 1 && ch >= String.fromCharCode(0xD800) && ch <= String.fromCharCode(0xDFFF)); }).join('').trim();
        if (!named) lErr.push({ message: nm + ' needs a name: Save drops it.' });
        else if (!(b > 0) && !(d > 0)) lErr.push({ message: nm + ' needs a radius above 0: Save drops it.' });
        else if (lKept >= LIMITS.lightPresets) lErr.push({ message: nm + ': at most ' + LIMITS.lightPresets + ', so Save drops it.' });
        else {
            lKept++;
            if (b > 1000 || d > 1000 || b < 0 || d < 0) lErr.push({ message: nm + ': a radius is 0 to 1000, so Save keeps the nearest.' });
            else if (d < b) lErr.push({ message: nm + ': dim is the outer edge, so Save makes it ' + b + ' too.' });
        }
    });
    if (lErr.length) errorsById.light = (errorsById.light || []).concat(lErr);
    // range penalties R1: what Save drops from the range rule, under the Combat tab's Range box — read as the cleaner reads (systemcore
    // cleanRangeRules): a formula that reads, rolls no dice and names only Distance; a step whose distance is above 0 and at most 1,000,000, with
    // a modifier, the first of each distance, at most 40 (self-contained: the tests run this function alone)
    var rgE = draft.combat && draft.combat.range && typeof draft.combat.range === 'object' && !Array.isArray(draft.combat.range) ? draft.combat.range : null, rErr = [];
    var byE = !rgE ? '' : typeof rgE.formula === 'string' ? 'formula' : 'table';   // rangeBy's reading
    var rfDice = function(nd) { if (!nd || typeof nd !== 'object') return false; if (nd.t === 'dice') return true; return Object.keys(nd).some(function(k) { return !!nd[k] && typeof nd[k] === 'object' && rfDice(nd[k]); }); };
    if (byE === 'formula') {
        var rfT = typeof rgE.formula === 'string' ? rgE.formula.trim() : '', rfP = rfT && F() ? F().parse(rfT) : null, rfN = rfP && rfP.ok && Array.isArray(rfP.names) ? rfP.names.filter(function(n) { return String(n).toLowerCase() !== 'distance'; }) : [];
        if (!rfT) rErr.push({ message: 'Range: type the formula (it reads Distance), or Save drops the rule.' });
        else if (!rfP || !rfP.ok) rErr.push({ message: 'Range: ' + (rfP && rfP.error && rfP.error.message ? rfP.error.message : 'the formula cannot be read.') + ' Save drops the rule.', prop: 'formula', pos: rfP && rfP.error ? rfP.error.pos : undefined, len: rfP && rfP.error ? rfP.error.len : undefined });
        else if (rfN.length) rErr.push({ message: 'Range: the formula reads only Distance, not ' + rfN[0] + ': Save drops the rule.' });
        else if (rfDice(rfP.ast && rfP.ast.body)) rErr.push({ message: 'Range: the formula cannot roll dice: Save drops the rule.' });
        else if (rfT.length > LIMITS.formula || /[\u0000-\u001f\u007f]/.test(rfT)) rErr.push({ message: 'Range: the formula is at most ' + LIMITS.formula.toLocaleString('en-US') + ' characters, on one line: Save drops the rule.' });
    } else if (byE === 'table') {
        var rsE = Array.isArray(rgE.steps) ? rgE.steps : [], rSeen = Object.create(null), rKept = 0, rNum = function(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e15; };
        rsE.forEach(function(s, i) {
            var nm = 'Range step ' + (i + 1);
            if (!s || typeof s !== 'object' || !rNum(s.to) || !(s.to > 0) || s.to > 1e6) rErr.push({ message: nm + ' needs a distance above 0 and at most 1,000,000: Save drops it.' });
            else if (!rNum(s.mod)) rErr.push({ message: nm + ' needs a modifier (0 for none): Save drops it.' });
            else if (rSeen[String(s.to)]) rErr.push({ message: nm + ': another step already reaches ' + s.to + ', so Save drops it.' });
            else if (rKept >= LIMITS.rangeSteps) rErr.push({ message: nm + ': at most ' + LIMITS.rangeSteps + ', so Save drops it.' });
            else { rSeen[String(s.to)] = 1; rKept++; if (Math.abs(s.mod) > 1000) rErr.push({ message: nm + ': a modifier is -1000 to 1000, so Save keeps the nearest.' }); }
        });
        if (!rKept) rErr.push({ message: 'Range: add a step, or Save drops the rule.' });
    }
    (draft.combat && Array.isArray(draft.combat.targetReads) ? draft.combat.targetReads : []).forEach(function(id, i) { var f0 = (draft.fields || []).find(function(f) { return f && f.id === id; }); if (i >= 6) { if (i === 6) rErr.push({ message: 'A roll also reads of its target: six at most, so Save drops the rest.' }); } else if (!f0 || ['number', 'formula', 'skill', 'resource'].indexOf(f0.kind) < 0) rErr.push({ message: 'A roll also reads of its target: "' + String(id).slice(0, 40) + '" is no number field, so Save drops it.' }); });   // 1.6.0
    var bszE = draft.combat && typeof draft.combat.bodySize === 'string' ? draft.combat.bodySize : '';   // 1.6.2: A body in the way's own field, judged as Target size is
    if (bszE) { var bszF = (draft.fields || []).find(function(f) { return f && f.id === bszE; }), bszSec = null; try { bszSec = typeof secretFieldIds === 'function' ? secretFieldIds({ fields: gmViewFields(draft, F()), items: draft.items, core: draft.core, tables: draft.tables }, F()) : null; } catch (e) { bszSec = null; }
        if (!bszF || ['number', 'formula', 'skill', 'resource'].indexOf(bszF.kind) < 0) rErr.push({ message: 'A body in the way reads: that field is gone or is no number, so Save drops it.' });
        else if (bszSec && Object.prototype.hasOwnProperty.call(bszSec, bszE)) rErr.push({ message: 'A body in the way reads: players cannot read that field, or it is worked out from one they cannot, so Save drops it.' }); }
    var tszE = draft.combat && typeof draft.combat.targetSize === 'string' ? draft.combat.targetSize : '';   // 1.6.0: TargetSize's field, judged as the cleaner judges it (a number its viewer can read truthfully)
    if (tszE) {
        var tszF = (draft.fields || []).find(function(f) { return f && f.id === tszE; }), tszSec = null; try { tszSec = typeof secretFieldIds === 'function' ? secretFieldIds({ fields: gmViewFields(draft, F()), items: draft.items, core: draft.core, tables: draft.tables }, F()) : null; } catch (e) { tszSec = null; }
        if (!tszF || ['number', 'formula', 'skill', 'resource'].indexOf(tszF.kind) < 0) rErr.push({ message: 'Target size reads: that field is gone or is no number, so Save drops it.' });
        else if (tszSec && Object.prototype.hasOwnProperty.call(tszSec, tszE)) rErr.push({ message: 'Target size reads: players cannot read that field, or it is worked out from one they cannot, so Save drops it.' });
    }
    var thE = draft.combat && typeof draft.combat.targetHit === 'string' ? draft.combat.targetHit : '';   // 1.6.0 (B5): the list of hit locations, judged as the cleaner judges it
    if (thE) { var thFe = (draft.fields || []).find(function(f) { return f && f.id === thE; }); if (!thFe || thFe.kind !== 'item-list') rErr.push({ message: 'Called shots read: that list is gone or is no list, so Save drops it.' }); }
    if (rErr.length) errorsById.range = (errorsById.range || []).concat(rErr);
    // item 19 H2: what Save drops of the height modifier, said under the Height box — read as the cleaner reads it
    var hgE = draft.combat && draft.combat.height && typeof draft.combat.height === 'object' && !Array.isArray(draft.combat.height) ? draft.combat.height : null, hErr = [];
    var hbyE = !hgE ? '' : typeof hgE.formula === 'string' ? 'formula' : Array.isArray(hgE.steps) ? 'table' : '';
    if (hbyE === 'formula') {
        var hfT = typeof hgE.formula === 'string' ? hgE.formula.trim() : '', hfP = hfT && F() ? F().parse(hfT) : null, hfN = hfP && hfP.ok && Array.isArray(hfP.names) ? hfP.names.filter(function(n) { return String(n).toLowerCase() !== 'heightdiff'; }) : [];
        if (!hfT) hErr.push({ message: 'Height: say how a difference in height gives the modifier, or Save drops it.' });
        else if (!hfP || !hfP.ok) hErr.push({ message: 'Height: ' + (hfP && hfP.error && hfP.error.message ? hfP.error.message : 'the formula cannot be read.') + ' Save drops it.' });
        else if (hfN.length) hErr.push({ message: 'Height: the formula reads only HeightDiff, not ' + hfN[0] + ': Save drops it.' });
        else if (rfDice(hfP.ast && hfP.ast.body)) hErr.push({ message: 'Height: the formula cannot roll dice: Save drops it.' });
        else if (hfT.length > LIMITS.formula || new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']').test(hfT)) hErr.push({ message: 'Height: the formula is at most ' + LIMITS.formula.toLocaleString('en-US') + ' characters, on one line: Save drops it.' });
    } else if (hbyE === 'table') {
        var hsE = hgE.steps, hSeen = Object.create(null), hKept = 0, hNum = function(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 1e15; };
        hsE.forEach(function(s, i) {
            var nm = 'Height step ' + (i + 1);
            if (!s || typeof s !== 'object' || !hNum(s.to) || Math.abs(s.to) > 1e6) hErr.push({ message: nm + ' needs a height difference within 1,000,000 either way: Save drops it.' });
            else if (!hNum(s.mod)) hErr.push({ message: nm + ' needs a modifier (0 for none): Save drops it.' });
            else if (hSeen[String(s.to)]) hErr.push({ message: nm + ': another step already reaches ' + s.to + ', so Save drops it.' });
            else if (hKept >= LIMITS.heightSteps) hErr.push({ message: nm + ': at most ' + LIMITS.heightSteps + ', so Save drops it.' });
            else { hSeen[String(s.to)] = 1; hKept++; if (Math.abs(s.mod) > 1000) hErr.push({ message: nm + ': a modifier is -1000 to 1000, so Save keeps the nearest.' }); }
        });
        if (!hKept) hErr.push({ message: 'Height: add a step, or Save drops the table.' });
    }
    if (hgE && hgE.line3d === true && hgE.eye !== undefined) {   // item 19b H4: the standing height, as the cleaner reads it (yards)
        if (typeof hgE.eye !== 'number' || !isFinite(hgE.eye) || Math.abs(hgE.eye) > 1e15 || !(Math.round(Math.min(hgE.eye, 100) * 100) / 100 > 0)) hErr.push({ message: 'Standing height needs a number above 0: Save drops it, and the eye is at the token\u2019s elevation.' });
        else if (hgE.eye > 100) hErr.push({ message: 'Standing height: at most 100 yards (91.44 meters), so Save keeps the nearest.' });
    }
    if (hErr.length) errorsById.height = hErr;
    // item 20 K1: what Save drops or changes of the calendar, said under the Calendar tab — each name read by calendarcore cleanCalendar itself
    var calE = draft.calendar && typeof draft.calendar === 'object' && !Array.isArray(draft.calendar) ? draft.calendar : null, cErr = [];
    if (calE) {
        var cWh = function(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi; }, cPs = Array.isArray(calE.periods) ? calE.periods : [], cWk = Array.isArray(calE.week) ? calE.week : [], cOkP = Object.create(null), cOkW = Object.create(null), cKp = 0, cKw = 0;
        cPs.forEach(function(p, i) {
            var nm = 'Period ' + (i + 1), q = p && typeof p === 'object' ? p : {};
            if (!cleanCalendar({ periods: [{ name: q.name, days: 1 }] })) cErr.push({ message: nm + ' needs a name: Save drops it.' });
            else if (!cWh(q.days, 1, CAL_LIMITS.periodDays)) cErr.push({ message: nm + ': its days are a whole number from 1 to ' + CAL_LIMITS.periodDays + ': Save drops it.' });
            else if (cKp >= CAL_LIMITS.periods) cErr.push({ message: nm + ': at most ' + CAL_LIMITS.periods + ', so Save drops it.' });
            else { cOkP[i] = 1; cKp++; }
        });
        cWk.forEach(function(w, i) {
            if (!cleanCalendar({ week: [w] })) cErr.push({ message: 'Weekday ' + (i + 1) + ' needs a name: Save drops it.' });
            else if (cKw >= CAL_LIMITS.week) cErr.push({ message: 'Weekday ' + (i + 1) + ': at most ' + CAL_LIMITS.week + ', so Save drops it.' });
            else { cOkW[i] = 1; cKw++; }
        });
        if (typeof calE.first === 'number' && calE.first > 0 && !cOkW[calE.first]) cErr.push({ message: 'Day 1\u2019s weekday is dropped, so Save starts the week at the first weekday it keeps.' });
        [['hours', 'Hours a day', CAL_LIMITS.hours, 24], ['minutes', 'Minutes an hour', CAL_LIMITS.minutes, 60], ['seconds', 'Seconds a minute', CAL_LIMITS.seconds, 60]].forEach(function(g) {
            if (calE[g[0]] !== undefined && !cWh(calE[g[0]], 1, g[2])) cErr.push({ message: g[1] + ': a whole number from 1 to ' + g[2] + ', so Save keeps ' + g[3] + '.' });
        });
        if (calE.one !== undefined && !cWh(calE.one, -CAL_LIMITS.year, CAL_LIMITS.year)) cErr.push({ message: 'Day 1\u2019s year: a whole number within 10,000,000 either way, so Save keeps 1.' });
        var cLp = calE.leap && typeof calE.leap === 'object' && !Array.isArray(calE.leap) ? calE.leap : null;
        if (cLp) {
            if (!cKp) cErr.push({ message: 'Leap years: add a period first, or Save drops the rule.' });
            else if (!cWh(cLp.every, 2, CAL_LIMITS.leapEvery)) cErr.push({ message: 'Leap years: every 2 to ' + CAL_LIMITS.leapEvery + ' years, or Save drops the rule.' });
            else if (!cWh(cLp.from, -CAL_LIMITS.year, CAL_LIMITS.year)) cErr.push({ message: 'Leap years: the year it counts from is a whole number within 10,000,000 either way, or Save drops the rule.' });
            else if (!cWh(cLp.days, 1, CAL_LIMITS.leapDays)) cErr.push({ message: 'Leap years: 1 to ' + CAL_LIMITS.leapDays + ' days more, or Save drops the rule.' });
            else if (!(typeof cLp.period === 'number' && cOkP[cLp.period])) cErr.push({ message: 'Leap years: the period that gains the days is dropped, so Save drops the rule.' });
        }
        (Array.isArray(calE.others) ? calE.others : []).forEach(function(o, k) {   // 1.6.2 (backlog 60): another calendar keeps its name, and four at most
            var q = o && typeof o === 'object' ? o : {};
            if (k >= CAL_LIMITS.others) cErr.push({ message: 'Calendar ' + (k + 2) + ': at most ' + CAL_LIMITS.others + ' other calendars, so Save drops it.' });
            else if (!cleanCalendar({ others: [{ name: q.name }] })) cErr.push({ message: 'Calendar ' + (k + 2) + ' needs a name: Save drops it.' });
        });
        (Array.isArray(calE.leaps) ? calE.leaps : []).forEach(function(r0, k) {   // 1.6.2 (backlog 60): each rule beside the first, read as cleanCalendar reads it
            var r = r0 && typeof r0 === 'object' ? r0 : {}, nm = 'Leap rule ' + (k + (cLp ? 2 : 1)), tu = Array.isArray(r.periods) ? r.periods : [];
            if (!cKp) cErr.push({ message: nm + ': add a period first, or Save drops it.' });
            else if (k >= CAL_LIMITS.leaps) cErr.push({ message: nm + ': at most ' + CAL_LIMITS.leaps + ' rules beside the first, so Save drops it.' });
            else if (!cWh(r.every, 2, CAL_LIMITS.leapEvery)) cErr.push({ message: nm + ': every 2 to ' + CAL_LIMITS.leapEvery + ' years, or Save drops it.' });
            else if (!cWh(r.from, -CAL_LIMITS.year, CAL_LIMITS.year)) cErr.push({ message: nm + ': the year it counts from is a whole number within 10,000,000 either way, or Save drops it.' });
            else if (!cWh(r.days, 1, CAL_LIMITS.leapDays)) cErr.push({ message: nm + ': 1 to ' + CAL_LIMITS.leapDays + ' days more, or Save drops it.' });
            else { var kept = tu.slice(0, CAL_LIMITS.leapTurns).filter(function(p) { return typeof p === 'number' && cOkP[p]; }).length; if (!kept) cErr.push({ message: nm + ': every period it gives its days to is dropped, so Save drops it.' }); else if (kept < tu.length) cErr.push({ message: nm + ': a period in its turns is dropped, so Save leaves it out of the turns.' }); }
        });
    }
    if (calE) {   // 1.6.2 (backlog 147): a season and a moon, read by calendarcore cleanCalendar itself
        (Array.isArray(calE.seasons) ? calE.seasons : []).forEach(function(s, i) {
            var q = s && typeof s === 'object' ? s : {}, nm = 'Season ' + (i + 1), cp = Array.isArray(calE.periods) ? calE.periods : [];
            if (!cleanCalendar({ moons: [{ name: q.name, cycle: 2 }] })) cErr.push({ message: nm + ' needs a name: Save drops it.' });
            else if (!(typeof q.period === 'number' && cp[q.period])) cErr.push({ message: nm + ': the period it begins in is gone, so Save drops it.' });
            else if (!(typeof q.day === 'number' && Math.floor(q.day) === q.day && q.day >= 1 && cp[q.period] && q.day <= cp[q.period].days)) cErr.push({ message: nm + ': the day it begins on is a day of its period, so Save drops it.' });
        });
        (Array.isArray(calE.moons) ? calE.moons : []).forEach(function(mo, i) {
            var q = mo && typeof mo === 'object' ? mo : {}, nm = 'Moon ' + (i + 1);
            if (!cleanCalendar({ moons: [{ name: q.name, cycle: 2 }] })) cErr.push({ message: nm + ' needs a name: Save drops it.' });
            else if (!(typeof q.cycle === 'number' && q.cycle >= 2 && q.cycle <= CAL_LIMITS.cycle)) cErr.push({ message: nm + ': its cycle is 2 to ' + CAL_LIMITS.cycle + ' days, so Save drops it.' });
            else if (q.at !== undefined && !(typeof q.at === 'number' && q.at >= 0 && q.at < q.cycle)) cErr.push({ message: nm + ': the days in on day 1 are from 0 to under its cycle, so Save starts it at a new moon.' });
        });
    }
    if (cErr.length) errorsById.calendar = cErr;
    // item 20 K5: what Save drops of a roll's clock rule, said under the roll (a unit the Combat tab no longer has: it runs by nothing)
    var evUnits = Object.create(null); (draft.combat && draft.combat.turn && Array.isArray(draft.combat.turn.units) ? draft.combat.turn.units : []).forEach(function(u) { if (u && typeof u.key === 'string') evUnits[u.key.toLowerCase()] = 1; });
    (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) {
        var ev = r && typeof r === 'object' && r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : null, msg = ''; if (!ev) return;
        if (!(typeof ev.n === 'number' && isFinite(ev.n) && Math.floor(ev.n) === ev.n && ev.n >= 1 && ev.n <= 1000)) msg = 'By the clock: every 1 to 1000 (a whole number), or Save drops it.';
        else if (typeof ev.u !== 'string' || !ev.u) msg = 'By the clock: pick what it counts in, or Save drops it.';
        else if (typeof cleanEvery === 'function' && !cleanEvery(ev)) msg = 'By the clock: ' + ev.u + (ev.u.toLowerCase() === 'round' ? ' is In a fight\u2019s unit, so Save drops it.' : ' is no unit it can count in, so Save drops it.');   // backlog 152: as the cleaner reads it since fold 1, a round being In a fight's alone
        else if (['min', 'hour', 'day', 'week'].indexOf(ev.u) < 0 && evUnits[ev.u.toLowerCase()] !== 1) msg = 'By the clock: ' + ev.u + ' is no time unit of yours (the Combat tab\u2019s Turns box), so it runs by nothing and players never see it.';
        if (msg) (errorsById[r.id] = Array.isArray(errorsById[r.id]) ? errorsById[r.id] : []).push({ message: msg });
    });
    // backlog 152, fold 5: what Save drops of a rule's Waits in a fight, In a fight and Ask me first, read by the cleaner itself (systemcore
    // cleanEvery and cleanInFight, and Ask me first kept only beside one of the two), and two warnings that drop nothing: an apply action that
    // also runs each round or at its turn's start and In a fight runs both ways in a fight, and a rule's runs by the clock read CombatRound as 0
    // (not said of a rule whose clock waits in a fight while it also runs In a fight: its runs by the clock fall outside fights alone, where
    // CombatRound is 0 anyway, and its runs In a fight read the round)
    if (typeof cleanEvery === 'function' && typeof cleanInFight === 'function') {
        var fcF = F() && typeof F().names === 'function' ? F() : null, fcOwn = (draft.fields || []).some(function(f) { return f && typeof f.key === 'string' && f.key.toLowerCase() === 'combatround'; });   // a field of your own named CombatRound keeps the name
        var fcReads = function(t) { if (!fcF || fcOwn || typeof t !== 'string' || !t) return false; var ns = []; try { ns = fcF.names(t) || []; } catch (e) { ns = []; } return ns.some(function(nm) { return String(nm).toLowerCase().split('.')[0] === 'combatround'; }); };
        (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) {
            if (!r || typeof r !== 'object' || typeof r.id !== 'string') return;
            var say = function(bag, m) { (bag[r.id] = Array.isArray(bag[r.id]) ? bag[r.id] : []).push({ message: m }); };
            var ndW = (typeof cleanFormulaText === 'function' ? cleanFormulaText(r.needs) : (typeof r.needs === 'string' ? r.needs.trim() : '')) || (((typeof cleanNeedsWhy === 'function' && cleanNeedsWhy(r.needsWhy)) || [{}])[0]['if']) || '';   // 1.6.2: its needs, else its first reason, as the cleaner reads them (systemcore needsOf)
            var ev = r.every, evK = cleanEvery(ev, ndW), fi = r.inFight, fiK = cleanInFight(fi, ndW), fiO = fi && typeof fi === 'object' && !Array.isArray(fi) ? fi : {};
            if (ev && typeof ev === 'object' && ev.wait === true && !evK) say(errorsById, 'Waits in a fight: Save drops the tick with its By the clock.');
            var holds = function(o) { return !!o && typeof o === 'object' && !Array.isArray(o) && o.whileNeeds === true; };   // 1.5.5: Only while its needs hold, read by the cleaner itself: kept only beside its piece and the rule's Needs
            if (holds(ev) && !evK) say(errorsById, 'Only while its needs hold: Save drops the tick with its By the clock.'); else if (holds(ev) && evK.whileNeeds !== true) say(errorsById, 'Only while its needs hold: the rule has no Needs, so Save drops the tick beside By the clock.');
            if (fi !== undefined && fi !== null && !fiK) {
                if (!(typeof fiO.n === 'number' && isFinite(fiO.n) && Math.floor(fiO.n) === fiO.n && fiO.n >= 1 && fiO.n <= 1000)) say(errorsById, 'In a fight: every 1 to 1000, a whole number, or Save drops it.');
                else if (typeof fiO.u !== 'string' || !fiO.u) say(errorsById, 'In a fight: pick what it counts in, or Save drops it.');
                else say(errorsById, 'In a fight: ' + fiO.u + ' is no unit it can count in, so Save drops it.');
            } else if (fiK && ['round', 'min', 'hour'].indexOf(fiK.u) < 0 && evUnits[fiK.u.toLowerCase()] !== 1) say(errorsById, 'In a fight: ' + fiK.u + ' is no time unit of yours in the Combat tab\u2019s Turns box, so it runs by nothing and players never see it.');
            if (holds(fi) && !fiK) say(errorsById, 'Only while its needs hold: Save drops the tick with its In a fight.'); else if (holds(fi) && fiK.whileNeeds !== true) say(errorsById, 'Only while its needs hold: the rule has no Needs, so Save drops the tick beside In a fight.');   // after In a fight's own lines
            if (r.ask === true && !evK && !fiK) say(errorsById, 'Ask me first: set By the clock or In a fight, or Save drops the tick.');
            var eaW = Array.isArray(r.apply) ? (r.each === 'round' || r.each === 'turn' || r.each === 'turnEnd' ? r.each : r.round === true ? 'round' : '') : '';
            if (eaW && fiK) say(warningsById, 'In a fight: it also runs ' + (eaW === 'turn' ? 'at its turn\u2019s start' : eaW === 'turnEnd' ? 'at its turn\u2019s end' : 'each round') + ', so in a fight it runs both ways.');
            var fcTexts = [r.needs, r.malf].concat(Array.isArray(r.needsWhy) ? r.needsWhy.map(function(l) { return l && typeof l === 'object' ? l['if'] : ''; }) : []).concat(Array.isArray(r.apply) ? [] : [r.formula]).concat([r.apply, r.then].reduce(function(a, l) { return a.concat(Array.isArray(l) ? l.map(function(ch) { return ch && typeof ch === 'object' ? ch.formula : ''; }) : []); }, []));
            if (evK && !(evK.wait === true && fiK) && fcTexts.some(fcReads)) say(warningsById, evK.wait === true ? 'By the clock: the round of a fight reads 0 when it runs by the clock. Only runs In a fight read the round.' : 'By the clock: the round of a fight reads 0 when it runs by the clock, even in a fight. Only its runs In a fight read the round.');
        });
    }
    // 1.6.0 (docs/BOOK_ES_ET_PLAN.md 4a, its Risks): a crossing whose own changes move the value it watches can set itself off again. Said, never
    // dropped: the run's depth cap (crossFollow, 3) stops it
    (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) {
        if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.cross || typeof r.cross !== 'object' || typeof r.cross.f !== 'string' || !r.cross.f) return;
        if ((Array.isArray(r.apply) ? r.apply : Array.isArray(r.then) ? r.then : []).some(function(ch) { return !!ch && typeof ch === 'object' && ch.f === r.cross.f; })) (warningsById[r.id] = Array.isArray(warningsById[r.id]) ? warningsById[r.id] : []).push({ message: 'When a value crosses: its own changes move the value it watches, so a run can set off another, at most 3 in a row.' });
    });
    // senses S2a: what Save drops or leaves out of the senses, under the Combat tab's Senses box — read as the cleaner reads (systemcore
    // cleanSenses): a name left once control characters go, a range field of a number, formula, skill or pool its owner can read, a finite number
    var snO = draft.combat && draft.combat.senses && typeof draft.combat.senses === 'object' ? draft.combat.senses : null, snE = snO && Array.isArray(snO.list) ? snO.list : null, sErr = [], sKept = 0;
    var secS = snO ? senseSecrets() : null, swIds = Object.create(null); if (snO) senseSwitchFields().forEach(function(f) { swIds[f.id] = f; });   // senses S3: a sense's switch and the blind switch
    if (snE) {
        var rangeF = Object.create(null); senseRangeFields().forEach(function(f) { rangeF[f.id] = f; });
        snE.forEach(function(s, i) {
            if (!s || typeof s !== 'object') return;
            var nm = 'Sense ' + (i + 1), r = s.range && typeof s.range === 'object' ? s.range : {};
            var named = typeof s.name === 'string' && !!Array.from(s.name.slice(0, 256).replace(lCtl, ' ').trim()).filter(function(ch) { return !(ch.length === 1 && ch >= String.fromCharCode(0xD800) && ch <= String.fromCharCode(0xDFFF)); }).join('').trim();
            if (s.unit === '?') sErr.push({ message: nm + ': pick what its range counts in. Save leaves it out until you do (it stays here).' });
            else if (!named) sErr.push({ message: nm + ' needs a name: Save drops it.' });
            else if (r.by === 'field' && !rangeF[r.field]) sErr.push({ message: nm + ' (' + s.name.trim() + '): pick where its range comes from, Save drops it.' });
            else if (r.by === 'field' && (!secS || secS[r.field])) sErr.push({ message: nm + ' (' + s.name.trim() + ') reads ' + (rangeF[r.field].label || rangeF[r.field].key) + ', which its owner cannot read (a GM-only value, or one worked out from one): Save drops it.' });
            else if (r.by !== 'field' && r.by !== 'eyes' && !(typeof r.n === 'number' && isFinite(r.n))) sErr.push({ message: nm + ' (' + s.name.trim() + ') needs its range: Save drops it.' });
            else if (s.off !== undefined && swIds[s.off && s.off.field] && (!secS || secS[s.off.field])) sErr.push({ message: nm + ' (' + s.name.trim() + ') is switched off by ' + (swIds[s.off.field].label || swIds[s.off.field].key) + ', which its owner cannot read (a GM-only value, or one worked out from one): Save drops it.' });
            else if (sKept >= LIMITS.senses) sErr.push({ message: nm + ': at most ' + LIMITS.senses + ', so Save drops it.' });
            else { sKept++; if (r.by !== 'field' && (r.n < 0 || r.n > 100000)) sErr.push({ message: nm + ' (' + s.name.trim() + '): a range is 0 to 100000, so Save keeps the nearest.' }); if (s.off !== undefined && !swIds[s.off && s.off.field]) sErr.push({ message: nm + ' (' + s.name.trim() + '): its switch is no longer here, so Save keeps it never switched off.' }); }
        });
    }
    if (snO && snO.blind !== undefined) {   // senses S3: the blind switch
        var blF = swIds[snO.blind && snO.blind.field];
        if (!blF) sErr.push({ message: 'The blind switch names no field here: Save leaves it out.' });
        else if (!secS || secS[blF.id]) sErr.push({ message: 'The blind switch reads ' + (blF.label || blF.key) + ', which its owner cannot read (a GM-only value, or one worked out from one): Save drops it.' });
    }
    if (snO && snO.arc !== undefined) {   // the eyes' arc: a number or formula field its owner can read, as the cleaner reads it
        var arcF = senseArcOf(snO.arc);
        if (!arcF) sErr.push({ message: 'The sight arc names no number or formula field here: Save leaves it out.' });
        else if (!secS || secS[arcF.id]) sErr.push({ message: 'The sight arc reads ' + (arcF.label || arcF.key) + ', which its owner cannot read (a GM-only value, or one worked out from one): Save drops it.' });
    }
    if (snO && snO.view && typeof snO.view === 'object' && snO.view.mode === 'arc' && !(typeof snO.view.arc === 'number' && isFinite(snO.view.arc) && Math.round(snO.view.arc) >= 1)) sErr.push({ message: 'A map with no Vision: an arc needs its degrees, 1 to 360. Save leaves it out.' });   // 1.6.0: as the cleaner reads it
    if (snE) snE.forEach(function(s, i) { if (s && typeof s === 'object' && typeof s.arc === 'number' && !(Math.round(s.arc) >= 1)) sErr.push({ message: 'Sense ' + (i + 1) + ': an arc is 1 to 360 degrees. Save gives it the eyes’ arc.' }); else if (s && s.arc && typeof s.arc === 'object') { var af = senseArcOf(s.arc); if (!af) sErr.push({ message: 'Sense ' + (i + 1) + ': its arc names no number or formula field here. Save gives it the eyes’ arc.' }); else if (!secS || secS[af.id]) sErr.push({ message: 'Sense ' + (i + 1) + ': its arc reads ' + (af.label || af.key) + ', which its owner cannot read. Save gives it the eyes’ arc.' }); } });   // 1.6.0: its own arc, as the cleaner reads it
    if (sErr.length) errorsById.senses = sErr;
    // conditions C4: what Save drops of an automatic effect's formula, under the effect's row — read as the cleaner reads it (systemcore
    // cleanEffectDef and the public rule: the owner's "Only public ones"); a token's name read there is 0, a warning
    var auFx = (draft.effects || []).filter(function(d) { return d && typeof d === 'object' && typeof d.id === 'string' && typeof d.auto === 'string' && d.auto.trim(); }), auSys = null, auTok = { posture: 1, elevation: 1, facing: 1, arc: 1, threats: 1, combatround: 1, rangemod: 1, targetdistance: 1 };
    auFx.forEach(function(d) {
        var t0 = d.auto.trim(), pa = F() ? F().parse(t0) : null, msg = null;
        if (d.vis === 'gm') msg = { message: 'Applies itself when: a GM-only effect cannot apply itself (its switching on would give it away): Save drops the formula.' };
        else if (t0.length > LIMITS.formula || new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']').test(t0)) msg = { message: 'Applies itself when: a formula is at most ' + LIMITS.formula.toLocaleString('en-US') + ' characters, on one line: Save drops it.' };
        else if (!pa || !pa.ok) msg = { message: 'Applies itself when: ' + (pa && pa.error && pa.error.message ? pa.error.message : 'the formula cannot be read.') + ' Save drops it.', prop: 'formula', pos: pa && pa.error ? pa.error.pos : undefined, len: pa && pa.error ? pa.error.len : undefined };
        else if (rfDice(pa.ast && pa.ast.body)) msg = { message: 'Applies itself when: the formula cannot roll dice: Save drops it.' };
        else {
            auSys = auSys || { fields: gmViewFields(draft, F()), items: draft.items, core: draft.core, tables: draft.tables };
            var gmN = gmDerivedNames(auSys, F(), Array.isArray(pa.names) ? pa.names : []);
            if (gmN.length) msg = { message: 'Applies itself when: it reads ' + gmN[0] + ', which players cannot read (a GM-only value, or one worked out from one), so its switching on would give it away: Save drops the formula.' };
            else { var tokN = (Array.isArray(pa.names) ? pa.names : []).filter(function(n) { return typeof n === 'string' && auTok[n.toLowerCase().split('.')[0]] === 1 && !(draft.fields || []).some(function(f) { return f && typeof f.key === 'string' && f.key.toLowerCase() === n.toLowerCase().split('.')[0]; }); }); if (tokN.length) warningsById[d.id] = (warningsById[d.id] || []).concat([{ message: 'Applies itself when: ' + tokN[0] + ' reads 0 here: an automatic effect works from the character\u2019s own values, never a token\u2019s.' }]); }
        }
        if (msg) errorsById[d.id] = (errorsById[d.id] || []).concat([msg]);
    });
    // 1.6.0 (CORE gap 12): what Save drops of an effect's change by a formula, under the effect's row, read as the cleaner reads it (systemcore
    // cleanSystem: it parses, rolls no dice and reads no GM-only value, in both views)
    (draft.effects || []).forEach(function(d) {
        if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !Array.isArray(d.mods)) return;
        d.mods.forEach(function(m, mi) {
            if (!m || typeof m !== 'object' || m.op === 'on' || typeof m.vf !== 'string' || !m.vf.trim()) return;
            var t1 = m.vf.trim(), pv = F() ? F().parse(t1) : null, hd = 'Change ' + (mi + 1) + ', by a formula: ', mv = null;
            if (t1.length > LIMITS.formula || new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']').test(t1)) mv = { message: hd + 'a formula is at most ' + LIMITS.formula.toLocaleString('en-US') + ' characters, on one line: Save drops the change.' };
            else if (!pv || !pv.ok) mv = { message: hd + (pv && pv.error && pv.error.message ? pv.error.message : 'the formula cannot be read.') + ' Save drops the change.' };
            else if (rfDice(pv.ast && pv.ast.body)) mv = { message: hd + 'the formula cannot roll dice: Save drops the change.' };
            else {
                auSys = auSys || { fields: gmViewFields(draft, F()), items: draft.items, core: draft.core, tables: draft.tables };
                var gmV = gmDerivedNames(auSys, F(), Array.isArray(pv.names) ? pv.names : []);
                if (gmV.length) mv = { message: hd + 'it reads ' + gmV[0] + ', which players cannot read (a GM-only value, or one worked out from one): Save drops the change, so the GM\u2019s sheet and its player\u2019s agree.' };
            }
            if (mv) errorsById[d.id] = (errorsById[d.id] || []).concat([mv]);
        });
    });
    // 1.6.2 (the review of an effect's Ends with): a pick whose rest Save does not keep (a rest removed, or one Save drops: no name, a length of nothing, a
    // unit it cannot count in). Save takes the pick off, and the effect is then read by its Duration again, which is said here, as the cleaner reads it
    (draft.effects || []).forEach(function(d) {
        if (!d || typeof d !== 'object' || typeof d.id !== 'string' || typeof d.endsRest !== 'string' || !d.endsRest || d.endsRest === '-') return;
        if (clean && Array.isArray(clean.rests) && clean.rests.some(function(x) { return !!x && x.id === d.endsRest; })) return;
        errorsById[d.id] = (errorsById[d.id] || []).concat([{ message: 'Ends with: Save does not keep that rest, so it takes this pick off and the effect is read by its Duration again.' }]);
    });
    // 1.6.2 (205): what Save drops of an item's change by a formula, under the item's row, as the cleaner reads it (its row's own names by the GM-only stats)
    (draft.items || []).forEach(function(it) {
        if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !Array.isArray(it.mods)) return;
        it.mods.forEach(function(m, mi) {
            if (!m || typeof m !== 'object' || m.op === 'on' || typeof m.vf !== 'string' || !m.vf.trim()) return;
            var t2 = m.vf.trim(), pv2 = F() ? F().parse(t2) : null, hd2 = 'Change ' + (mi + 1) + ', by a formula: ', mv2 = null;
            if (!pv2 || !pv2.ok) mv2 = { message: hd2 + (pv2 && pv2.error && pv2.error.message ? pv2.error.message : 'the formula cannot be read.') + ' Save drops the change.' };
            else if (rfDice(pv2.ast && pv2.ast.body)) mv2 = { message: hd2 + 'the formula cannot roll dice: Save drops the change.' };
            else {
                auSys = auSys || { fields: gmViewFields(draft, F()), items: draft.items, core: draft.core, tables: draft.tables };
                var gmI = gmDerivedNames(auSys, F(), (Array.isArray(pv2.names) ? pv2.names : []).filter(function(n) { return !/^row\./i.test(String(n)); }));
                var gsI = (draft.fields || []).some(function(f) { return f && f.kind === 'item-list' && f.list && Array.isArray(f.list.stats) && f.list.stats.some(function(st) { return st && st.vis === 'gm' && (pv2.names || []).some(function(n) { return String(n).toLowerCase() === 'row.' + String(st.key || '').toLowerCase(); }); }); });
                if (gmI.length || gsI) mv2 = { message: hd2 + 'it reads ' + (gmI.length ? gmI[0] : 'a GM-only stat of its row') + ', which players cannot read: Save drops the change, so the GM\u2019s sheet and its player\u2019s agree.' };
            }
            if (mv2) errorsById[it.id] = (errorsById[it.id] || []).concat([mv2]);
        });
    });
    // conditions C3: what Save drops or changes of the postures, under the Combat tab's Postures box — read as systemcore cleanPostures reads
    var psE = draft.combat && Array.isArray(draft.combat.postures) ? draft.combat.postures : null, pErr = [], pKept = 0, pSeen = Object.create(null), kindsP = Object.create(null);
    if (psE && psE.length) {
        (draft.fields || []).forEach(function(f) { if (f && typeof f.id === 'string') kindsP[f.id] = f.kind; });
        psE.forEach(function(p, i) {
            if (!p || typeof p !== 'object') return;
            var nm = 'Posture ' + (i + 1), nmT = typeof p.name === 'string' ? p.name.slice(0, 256).replace(lCtl, ' ').trim() : '', lb = nmT ? ' (' + nmT + ')' : '';
            if (typeof p.id !== 'string' || pSeen[p.id] || !/^(?:p_[A-Za-z0-9_]{1,24}|[a-z][a-z0-9-]{0,23})$/.test(p.id)) { pErr.push({ message: nm + lb + ': its id is not one Save keeps, or another posture has it: Save drops it.' }); return; }
            if (pKept >= LIMITS.postures) { pErr.push({ message: nm + lb + ': at most ' + LIMITS.postures + ', so Save drops it.' }); return; }
            pSeen[p.id] = 1; pKept++;
            if (!nmT) pErr.push({ message: nm + ' has no name: Save calls it Posture.' });
            if (typeof p.tag === 'string' && Array.from(p.tag.replace(lCtl, ' ').trim()).length > LIMITS.postureTag) pErr.push({ message: nm + lb + ': a tag is at most ' + LIMITS.postureTag + ' characters, so Save cuts it.' });
            var mods = Array.isArray(p.mods) ? p.mods : [];
            if (pKept === 1) { if (p.small === true || p.ranged !== undefined || p.aimed === true || mods.length) pErr.push({ message: nm + lb + ' is first, how a token stands with none set: Save drops its ranged note and its changes.' }); return; }
            if (p.ranged !== undefined && !(typeof p.ranged === 'number' && p.ranged === Math.round(p.ranged) && p.ranged !== 0 && Math.abs(p.ranged) <= 20)) pErr.push({ message: nm + lb + ': a ranged note is a whole number from \u221220 to 20, not 0, so Save drops it.' });
            mods.forEach(function(m, mi) {
                var k = m && typeof m === 'object' && typeof m.f === 'string' ? kindsP[m.f] : '';
                var ok = !!k && (m.op === 'on' ? k === 'toggle' : m.op === 'add' && typeof m.v === 'number' && isFinite(m.v) && Math.abs(m.v) <= LIMITS.effectAmount && (m.part === 'max' ? k === 'resource' : (k === 'number' || k === 'skill' || k === 'formula')));
                if (mi >= LIMITS.effectMods) pErr.push({ message: nm + lb + ', change ' + (mi + 1) + ': at most ' + LIMITS.effectMods + ', so Save drops it.' });
                else if (!ok) pErr.push({ message: nm + lb + ', change ' + (mi + 1) + ': a field that is gone or changed kind, or an amount that is no number: Save drops it.' });
            });
        });
        if (pKept < 2) pErr.push({ message: 'A list of postures needs at least two: Save drops it, and posture is switched off.' });
    }
    if (draft.combat && draft.combat.postureOnAttack === true && !(psE && psE.length)) pErr.push({ message: 'An attack reads its target\u2019s posture, but this system lists no postures, so it reads none.' });   // 1.6.0
    var cmRaw = draft.combat && draft.combat.cover && typeof draft.combat.cover === 'object' && draft.combat.cover.mods && typeof draft.combat.cover.mods === 'object' ? draft.combat.cover.mods : null;
    if (cmRaw && typeof cleanCover === 'function') { var cmKeep = cleanCover(draft.combat.cover).mods || {}; Object.keys(cmRaw).forEach(function(k) { if (!Object.prototype.hasOwnProperty.call(cmKeep, k)) pErr.push({ message: 'What cover takes off an attack is a whole number from \u221220 to 20, not 0, so Save drops ' + cmRaw[k] + '.' }); }); }   // 1.6.0, as the cleaner reads it
    if (pErr.length) errorsById.postures = pErr;
    // initiative O2: what Save drops of the tie steps, under the Initiative box — read as the cleaner reads them (a step that reads, of 300
    // characters at most, reading only what players can read)
    var irE = draft.combat && draft.combat.initiative && typeof draft.combat.initiative === 'object' && !Array.isArray(draft.combat.initiative) ? draft.combat.initiative : null, iErr = [], iSys = null;
    (irE && Array.isArray(irE.ties) ? irE.ties : []).slice(0, LIMITS.initTies).forEach(function(t, i) {
        if (typeof t !== 'string' || !t.trim()) return;
        var t0 = t.trim(), nm = 'Tie step ' + (i + 1), pa = F() ? F().parse(t0) : null;
        if (t0.length > LIMITS.formula || new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']').test(t0)) iErr.push({ message: nm + ': a formula is at most ' + LIMITS.formula.toLocaleString('en-US') + ' characters, on one line: Save drops it.' });
        else if (!pa || !pa.ok) iErr.push({ message: nm + ': ' + (pa && pa.error && pa.error.message ? pa.error.message : 'the formula cannot be read.') + ' Save drops it.' });
        else { iSys = iSys || { fields: gmViewFields(draft, F()), items: draft.items, core: draft.core, tables: draft.tables }; var gmI = gmDerivedNames(iSys, F(), Array.isArray(pa.names) ? pa.names : []); if (gmI.length) iErr.push({ message: nm + ': it reads ' + gmI[0] + ', which players cannot read, and the order is public: Save drops it.' }); }
    });
    var sdE = irE && typeof irE.side === 'string' ? irE.side.trim() : '', paS = sdE && F() ? F().parse(sdE) : null;   // initiative O4: the sides' roll, read as the cleaner reads it
    if (sdE && (sdE.length > LIMITS.formula || new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']').test(sdE))) iErr.push({ message: 'Sides roll: a formula is at most ' + LIMITS.formula.toLocaleString('en-US') + ' characters, on one line: Save drops it.' });
    else if (sdE && (!paS || !paS.ok)) iErr.push({ message: 'Sides roll: ' + (paS && paS.error && paS.error.message ? paS.error.message : 'the formula cannot be read.') + ' Save drops it.' });
    else if (sdE && Array.isArray(paS.names) && paS.names.length) iErr.push({ message: 'Sides roll: it reads ' + paS.names[0] + ', but a side rolls it as one, never as one character: Save drops it.' });
    else if (sdE && irE.chosen === true) iErr.push({ message: 'Sides roll: Next is chosen takes the place of sides, so Save drops it. Untick Next is chosen to keep it.' });   // initiative O5, as the cleaner reads it
    if (iErr.length) errorsById.initiative = iErr;
    // 126: what Save drops of the point budgets, under their box, read as the cleaner reads them: a budget with no name, a formula that is
    // missing, too long, unreadable or rolls dice, one that reads what players cannot read, and any budget past the eighth
    var bErr = [], bSys = null, bCtl = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']');
    (Array.isArray(draft.budgets) ? draft.budgets : []).forEach(function(b, i) {
        var nm = 'Budget ' + (i + 1);
        if (i >= LIMITS.budgets) { if (i === LIMITS.budgets) bErr.push({ message: 'At most ' + LIMITS.budgets + ' budgets: Save drops the rest.' }); return; }
        if (!b || typeof b !== 'object') return;
        if (typeof b.name !== 'string' || !b.name.replace(new RegExp(bCtl.source, 'g'), ' ').trim()) { bErr.push({ message: nm + ': it needs a name. Save drops it.' }); return; }
        [['has', 'Has', 'the points a character has'], ['spent', 'Spent', 'the points it has spent']].some(function(g) {
            var t = typeof b[g[0]] === 'string' ? b[g[0]].trim() : '', at = nm + ', ' + g[1] + ': ';
            if (!t) { bErr.push({ message: at + 'a formula is needed for ' + g[2] + '. Save drops the budget.' }); return true; }
            if (t.length > LIMITS.formula || bCtl.test(t)) { bErr.push({ message: at + 'a formula is at most ' + LIMITS.formula.toLocaleString('en-US') + ' characters, on one line. Save drops the budget.' }); return true; }
            var pa = F().parse(t);
            if (!pa || !pa.ok) { bErr.push({ message: at + (pa && pa.error && pa.error.message ? pa.error.message : 'the formula cannot be read.') + ' Save drops the budget.' }); return true; }
            if (rfDice(pa.ast && pa.ast.body)) { bErr.push({ message: at + 'a budget rolls no dice. Save drops the budget.' }); return true; }
            bSys = bSys || { fields: gmViewFields(draft, F()), items: draft.items, core: draft.core, tables: draft.tables };
            var gmB = gmDerivedNames(bSys, F(), Array.isArray(pa.names) ? pa.names : []);
            if (gmB.length) { bErr.push({ message: at + 'it reads ' + gmB[0] + ', which players cannot read, and a player sees their own budget. Save drops the budget.' }); return true; }
            return false;
        });
    });
    if (bErr.length) errorsById.budgets = bErr;
    var lkS = typeof linkSays === 'function' ? linkSays(draft.links, draft.fields, F()) : { errs: [], warns: [] }; if (lkS.errs.length) errorsById.links = lkS.errs; if (lkS.warns.length) warningsById.links = lkS.warns;   // 1.6.0: what Save drops of the linked sheets, as the cleaner reads them
    if (typeof envSays === 'function' && F()) { var eSy = null, eS = envSays(draft.env, draft.fields, F(), function(ns) { eSy = eSy || { fields: gmViewFields(draft, F()), items: draft.items, core: draft.core, tables: draft.tables }; return gmDerivedNames(eSy, F(), ns); }); if (eS.errs.length) errorsById.env = (errorsById.env || []).concat(eS.errs); if (eS.warns.length) warningsById.env = (warningsById.env || []).concat(eS.warns); }   // 1.6.0: what Save does with the environment readings
    if (typeof tableSays === 'function') { var tbSy = tableSays(draft.tables); if (tbSy.errs.length) errorsById.tables = tbSy.errs; }   // 1.6.0: what Save drops of the tables, as the cleaner reads them
    if (typeof defendSays === 'function') { var dfS = defendSays(draft.combat && draft.combat.blast && draft.combat.blast.defend, draft.rolls, draft.combat, draft.fields); if (dfS.errs.length) errorsById.blastdefend = dfS.errs; if (dfS.warns.length) warningsById.blastdefend = dfS.warns; }   // 1.6.0: what Save drops of a blast's own Defense roll, as the cleaner reads it
    if (typeof coverHitSays === 'function') { var cvS = coverHitSays(draft.combat && draft.combat.cover, draft.combat, F()); if (cvS.errs.length) errorsById.coverhit = cvS.errs; if (cvS.warns.length) warningsById.coverhit = cvS.warns; }   // 1.6.0: what Save drops of where a hit behind cover lands, as the cleaner reads it
    if (typeof damageSays === 'function') { var dmS = damageSays(draft.combat && draft.combat.damage, clean, F()); if (dmS.errs.length) errorsById.damage = dmS.errs; if (dmS.warns.length) warningsById.damage = dmS.warns; }   // 1.5.6: what Save drops of the damage rules, as the cleaner reads them
    if (typeof refWarns === 'function') refWarns(saved, clean, camp0);   // 1.6.2 (backlog 208)
}
// [split:body-end]
return { refreshErrors: refreshErrors, saveDraft: saveDraft };   // [split:glue]
}   // [split:glue]
