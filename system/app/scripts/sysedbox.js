/* sysedbox.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 7, the System editor; split 2026-11-19 with no change in behavior).
   What it holds: the System editor's opening and closing (open, close), the forms its formula boxes
   open on (formOn, formCtx, formTrial), and the boxes of a list roll that answer an attempt or a card: a roll's other names (altBox),
   bands, calls, answers and Send on, a switch's words, a job, a tile's boxes and states, a stand's Then, a row's own bonus, the trade
   rules, Holds by kind, Fits where, Starts with and a list's badges; then markDirty, the Preview beside any tab (sidePrevSync),
   reCleanChars and the facing a GM picks (gmFacing).
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sysedBox() at
   its line `// [split:sysedbox.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (tools/splitcheck.js holds it): the editor's own state (draft, dirty, tab, layoutView and
   the rest) stands in sheets.js and a part sets it through the setters beside `var draft`. Change the code here as if it still stood
   in sheets.js. */
// [split:of sheets.js]
import { ALT_MAX, ANS_HALF, ANS_MAX, BADGE_MAX, F, LIMITS, SEND_HOPS_MAX, START_MAX, STORED, _sidePrev, ansShareWord, asksBox, canWrite, cleanBands, charById, charList, charsOf, checkLabel, cleanLooks, cleanRowDef, cleanSystem, cleanValue, clone, crewPick, deckTrial, deckTrialRead, dirty, dirtySet, draft, draftSet, el, emptySystem, errGo, fieldById, getActiveCampaign, glyphButton, grantEntries, grantName, input, isClient, labeledSelect, layKeep, laySync, layoutViewSet, makeResolver, nameAsks, nameWord, needsGmBox, net, numField, numInput, openSync, pageOptions, patchErrors, rangeUnitWord, readsOf, refreshErrors, renderAll, renderPreview, rollName, rollStationBox, rolled, save, select, showConfirm, sidePrevSet, startRows, starterPacksSet, startersFill, startersLoad, state, sysReaders, systemOf, tab, tabSet, toast, ui, valueOpts } from './sheets.js';   // [split:glue]
export function sysedBox() {   // [split:glue]
// [split:body-start]
var KIND_LABEL = { number: 'Number', formula: 'Derived', resource: 'Resource', skill: 'Skill', toggle: 'Toggle', text: 'Text', notes: 'Notes', select: 'Select', 'item-list': 'Item list', effects: 'Status effects' };
var KIND_HELP = { number: 'A stored number (an attribute): default, min, max, step. With a min and a max it can show as a slider on a two-color track.', formula: 'A figure worked out from others: a modifier, a secondary attribute, a derived stat. Worked out from other fields, never stored and never typed.', resource: 'A current value with a formula for its max (HP): a bar with - and + on the sheet.', skill: 'Stored ranks plus a base formula; its value is ranks + base.', toggle: 'On or off (a condition); true or false in formulas.', text: 'A short text (up to 200 characters); not a number for formulas.', notes: 'A long text; never read by formulas.', select: 'One of a fixed list of options.', 'item-list': 'A list of items the character carries, filled from the Items library on the sheet.', effects: 'The status effects the character carries: added from the Effects library in one click, or made on the spot with their own numbers. Each changes its numbers everywhere they are used.' };
// [formcheck:source-start]
// 1.6.2: what a formula's form may offer, and every name in words, for the box it stands over
var FORM_ONLY = { 'sys-ans-share': ['Blow.dmg', 'Blow.type', 'Blow.kind'], 'sys-range-formula': ['Distance'], 'sys-height-formula': ['HeightDiff'], 'sys-combat-bfall': ['BlastDamage', 'BlastDistance', 'BlastDice', 'Direct', 'Centre', 'BlastFills', 'BlastNoDrop', 'BlastScale', 'MapCell', 'HitScale'], 'sys-combat-beach': ['BlastDice', 'BlastDistance', 'Direct', 'Centre', 'BlastFills', 'BlastNoDrop', 'BlastScale', 'MapCell', 'HitScale'], 'sys-combat-bradius': ['BlastRadius', 'MapCell', 'BlastDice', 'BlastScale'], 'sys-combat-cover-body': ['TargetSize', 'BodySize'], 'sys-combat-bscatter': ['Margin', 'ThrowDistance'], 'sys-combat-bhand': ['Natural'], 'sys-combat-fgreach': ['FragDice', 'BlastDice', 'MapCell', 'BlastScale'] };
var FORM_MORE = { 'sys-dmgr-woundf': ['Blow.through', 'Blow.dmg'], 'sys-dmgr-ywf': ['Blow.through', 'Blow.dmg'], 'sys-dmgr-mjcripby': ['Margin', 'Natural'], 'sys-dmgr-ocripby': ['Margin', 'Natural'], 'sys-card-pts': ['RollTotal', 'Natural', 'RollMargin', 'RollCrit', 'RollBig'], 'sys-band-if': ['RollTotal', 'Natural', 'RollMargin', 'RollCrit', 'RollBig'], 'sys-combat-broll': ['ThrowSkill', 'ThrowDistance'], 'sys-combat-resist': ['Resist'], 'sys-dmgr-lat': ['Listed'], 'sys-dmgr-lhitw': ['Listed', 'Worn', 'ToDestroy'], 'sys-dmgr-ladby': ['Listed', 'Worn', 'ToDestroy', 'Divisor'], 'sys-dmgr-lmajw': ['Listed', 'Worn', 'ToDestroy'], 'sys-dmgr-lbrkw': ['Listed', 'Worn', 'ToDestroy'], 'sys-dmgr-lbrkm': ['Listed', 'Worn', 'ToDestroy'], 'sys-dmgr-lwcap': ['Listed', 'Worn', 'ToDestroy'], 'sys-dmgr-ltplus': ['Listed', 'Worn'], 'sys-dmgr-ohto': ['Held.count'] };
// the list a box of the damage step stands on: the list picked in its own row
function formRowList(inp) {
    for (var n = inp, i = 0; n && i < 6; n = n.parentNode, i++) { var s = n.querySelector ? n.querySelector('select.sys-dmgr-llist, select.sys-dmgr-wlist, select.sys-dmgr-ohlist') : null; if (s && s.value) { var f = fieldOf(s.value); return f && f.list ? f.list : undefined; } }
    if (inp.classList && (inp.classList.contains('sys-dmgr-locvital') || inp.classList.contains('sys-dmgr-locmult') || inp.classList.contains('sys-dmgr-locdie') || inp.classList.contains('sys-cvh-where'))) { var dr = draft.combat && draft.combat.damage && draft.combat.damage.locs, l = dr ? fieldOf(dr.list) : null; return l && l.list ? l.list : undefined; }
    return undefined;
}
function fieldOf(id) { var hit = null; (Array.isArray(draft.fields) ? draft.fields : []).forEach(function(x) { if (x && x.id === id) hit = x; }); return hit; }
function formCtx(inp) {
    var cl = inp && inp.classList, own = null, more = null, dmg = false;
    if (cl) { Object.keys(FORM_ONLY).forEach(function(k) { if (cl.contains(k)) own = FORM_ONLY[k]; }); Object.keys(FORM_MORE).forEach(function(k) { if (cl.contains(k)) more = FORM_MORE[k]; }); for (var q = 0; q < cl.length; q++) if (cl[q].indexOf('sys-dmgr-') === 0 || cl[q] === 'sys-cvh-where') dmg = true; }
    if (own && cl && (cl.contains('sys-combat-bfall') || cl.contains('sys-combat-beach') || cl.contains('sys-combat-bradius'))) own = own.concat((Array.isArray(draft.env) ? draft.env : []).filter(function(e) { return e && typeof e.key === 'string' && e.key; }).map(function(e) { return 'Env.' + e.key; }));   // 1.6.2: and the Environment readings where it goes off
    if (own) return { only: own };
    var endRw = inp && inp.closest ? inp.closest('.sys-fx-endrow') : null; if (endRw) { var endFx = inp.closest('.sys-fx-row'), endD = endFx ? (draft.effects || []).filter(function(x) { return !!x && x.id === endFx.dataset.eid; })[0] : null; return { end: true, subject: endD ? (endD.name || '') + ' ends' : 'When it ends' }; }   // 1.6.2: an effect's When it ends reads its number
    if (cl && cl.contains('sys-list-layrif')) { var lyR0 = fieldOf(inp.dataset ? inp.dataset.rl : ''); return { list: lyR0 && lyR0.list ? lyR0.list : undefined, subject: 'A row of ' + (lyR0 && lyR0.label ? lyR0.label : 'the list it lays from') }; }   // 1.6.2: a rule's own Only where, the same rows
    if (cl && cl.contains('sys-list-layif')) { var lyF0 = fieldOf(inp.dataset ? inp.dataset.rl : ''); return { list: lyF0 && lyF0.list ? lyF0.list : undefined, subject: 'A row of ' + (lyF0 && lyF0.label ? lyF0.label : 'the list it lays from') }; }   // 1.6.2 Laid from's Only where: the rows of the list it lays from
    if (cl && (cl.contains('sys-rnd-test') || cl.contains('sys-rnd-next'))) { var rlF = fieldOf(inp.dataset ? inp.dataset.rl : ''); return { list: rlF && rlF.list ? rlF.list : undefined, subject: 'A row picked at random' }; }   // 1.6.2 (fold (f))
    if (cl && cl.contains('sys-item-mamtf')) { var irw = inp.closest ? inp.closest('.sys-row') : null, iid = irw && irw.dataset ? (irw.dataset.iid || irw.dataset.id || '') : '', itF = (Array.isArray(draft.items) ? draft.items : []).filter(function(x) { return x && x.id === iid; })[0], cat = itF && typeof itF.category === 'string' ? itF.category.toLowerCase() : ''; var ilF = (Array.isArray(draft.fields) ? draft.fields : []).filter(function(x) { return x && x.kind === 'item-list' && x.list && (!Array.isArray(x.list.cats) || !x.list.cats.length || x.list.cats.some(function(k) { return String(k).toLowerCase() === cat; })); })[0]; return { list: ilF ? ilF.list : undefined, subject: itF ? itF.name || '' : '' }; }   // 1.6.2 (205): an item's change by a formula reads its row, on the list its category stands on
    if (dmg) return { blow: true, more: more || undefined, list: formRowList(inp) };
    if (more) return { more: more };
    // 1.6.3 (the review of defense fold 2, finding 8): a call's Read on the one who resisted reads the resister and, where its By names a list's roll or a roll
    // answered with a row, that row's names, so its form offers that list's row by name and never the calling roll's own
    if (cl && (cl.contains('sys-ans-if') || cl.contains('sys-ans-hits') || cl.contains('sys-ans-far') || cl.contains('sys-ans-mod') || cl.contains('sys-ans-margin'))) { var anL0 = fieldOf(inp.dataset ? String(inp.dataset.ansl || '') : ''); return { subject: 'The one who defends', list: anL0 && anL0.kind === 'item-list' && anL0.list ? anL0.list : undefined, roll: { id: 'r_answers', resist: true }, then: true }; }   // 1.6.3 (defense fold 3): a line of When it answers an attack reads the defender, their parrying row, the attempt and the roll's own result
    if (cl && cl.contains('sys-call-byif')) { var byB = inp.dataset ? String(inp.dataset.by || '') : '', byM = /^(f_[A-Za-z0-9_]+)#\d+$/.exec(byB), byR = byM ? null : (Array.isArray(draft.rolls) ? draft.rolls : []).filter(function(x) { return x && x.id === byB && x.resist === true && typeof x.withRow === 'string'; })[0], byL = byM ? fieldOf(byM[1]) : byR ? fieldOf(byR.withRow) : null; return { subject: 'The one who resisted', list: byL && byL.kind === 'item-list' && byL.list ? byL.list : undefined }; }
    var rw = inp && inp.closest ? inp.closest('.sys-row') : null, id = rw && rw.dataset ? rw.dataset.id : '', r = null, cs = inp && inp.classList;
    var card = inp && inp.closest ? inp.closest('.sys-list-card') : null, lid = card && card.dataset ? card.dataset.lid : '';
    if (lid) {   // a box of a list: its row's figures, and the roll it belongs to where it belongs to one
        var lf = null; (Array.isArray(draft.fields) ? draft.fields : []).forEach(function(x) { if (x && x.id === lid) lf = x; });
        var sp = lf && lf.list ? lf.list : null, re = inp.closest('.sys-list-roll'), rr = re && sp && Array.isArray(sp.rolls) ? sp.rolls[Number(re.dataset.ri)] : null;
        return { list: sp || undefined, subject: rr ? rr.label || '' : '', roll: rr || undefined, reach: !!cs && cs.contains('sys-list-standreach'), then: !!rr && !Array.isArray(rr.apply) && !!cs && (cs.contains('sys-list-applyformula') || cs.contains('sys-list-applyif')) };
    }
    if (typeof id === 'string' && /^r_/.test(id)) (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(x) { if (x && x.id === id) r = x; });
    // 1.6.2 (the review of backlog 242): a crossing's own steps (First at, Then every) are read on the sheet as it stands before the roll runs, so their
    // form is offered nothing of the roll's own moment (crossStep: no blow, no CrossStep, no answer), as the validator refuses it there
    if (r && cs && (cs.contains('sys-roll-xsat') || cs.contains('sys-roll-xsstep'))) return { roll: r, subject: r.label, crossStep: true };
    var wlC = r && typeof r.withRow === 'string' && r.withRow && r.resist === true && !Array.isArray(r.apply) && !(cs && cs.contains('sys-roll-critok')) ? fieldOf(r.withRow) : null;   // 1.6.3 (defense fold 2)
    if (r) return { roll: r, subject: r.label, list: wlC && wlC.list ? wlC.list : undefined, then: !Array.isArray(r.apply) && !!cs && (cs.contains('sys-apply-formula') || cs.contains('sys-apply-if') || cs.contains('sys-card-n') || cs.contains('sys-card-needs')) };
    var fd = null; if (typeof id === 'string') (Array.isArray(draft.fields) ? draft.fields : []).forEach(function(x) { if (x && x.id === id) fd = x; });
    return fd ? { subject: fd.label || '', list: fd.kind === 'item-list' && fd.list ? fd.list : undefined } : {};
}
// what Try it reads: one of the campaign's characters as this draft would work them out, and a figure given by hand for what depends on the moment
// 1.6.2 (found building a dice pool by hand): Try it offers a question's own answers, the sheet's values by their names and a pick's options by their words, where it asked a bare number
function trialOpts(d, asks, n) {
    var m = /^ask[.]([a-z0-9_]+)$/i.exec(String(n)), a = null; if (!m) return undefined;
    (Array.isArray(asks) ? asks : []).forEach(function(x) { if (!a && x && typeof x.key === 'string' && x.key.toLowerCase() === m[1].toLowerCase()) a = x; });
    if (!a) return undefined;
    if (a.kind === 'field') { var out = []; (Array.isArray(a.fields) ? a.fields : []).forEach(function(id) { var f = fieldById(d, id); if (f && typeof f.key === 'string' && f.key) out.push([f.key, f.label || f.key]); }); return out.length ? out : undefined; }
    if (a.kind !== 'num') { var po = []; (Array.isArray(a.opts) ? a.opts : []).forEach(function(o, i) { if (o && o.label) po.push([typeof o.v === 'number' ? o.v : i + 1, o.label]); }); return po.length ? po : undefined; }
    return undefined;
}
function formTrial(d, ctx) {
    return {
        people: function() { var c = getActiveCampaign(); return c ? charList(c).sort(function(a, b) { return (a.npc ? 1 : 0) - (b.npc ? 1 : 0); }).map(function(x) { return { id: x.id, name: x.name || 'Character' }; }) : []; },
        vars: function(id, over) {
            var c = getActiveCampaign(), chs = c ? charsOf(c) : null, ch = chs && Object.prototype.hasOwnProperty.call(chs, id) ? chs[id] : null, r = ch && F() ? makeResolver(d, ch, F()) : null;
            var rl = ctx && ctx.roll && typeof ctx.roll === 'object' && typeof ctx.roll.drawFirst === 'string' ? ctx.roll : null, tr = null;   // 1.6.2: a roll that draws cards first: each try draws anew
            var fn = function(n) { if (tr && typeof deckTrialRead === 'function') { var dv = deckTrialRead(tr, n); if (dv !== undefined) return dv; } var l = String(n).toLowerCase(), ov = over[l]; if (typeof ov === 'string') l = ov.toLowerCase(); else if (ov !== undefined) return ov; var v = null; try { v = r ? r(l) : null; } catch (e) { v = null; } return typeof v === 'number' && isFinite(v) ? v : v === true ? 1 : 0; };   // 1.6.2: an answer that picks a value of the sheet is tried as that value of the character
            if (rl && typeof deckTrial === 'function') { fn.fresh = function(rnd) { tr = deckTrial(d, rl, rnd); }; var dk0 = deckTrial(d, rl, function() { return 1; }); if (dk0) fn.drawWord = 'draws ' + (dk0.n > 1 ? dk0.n + ' cards' : 'a card') + ' from ' + (dk0.deck.label || 'its deck'); }
            return fn;
        },
        asks: function(text) { var nm = F() ? F().names(text) : [], r0 = ctx && ctx.roll && Array.isArray(ctx.roll.asks) ? ctx.roll.asks : []; return (Array.isArray(nm) ? nm : []).filter(function(n) { return nameAsks(d, n); }).map(function(n) { return { s: n, word: nameWord(d, n), opts: trialOpts(d, r0, n) }; }); }
    };
}
// 1.6.3 (gap 4 of docs/EDITOR_COVERAGE.md): the campaign's library entries, for an option that stands for a row of a list (formbox.js
// dressOpts, through formcore.js optLists), read as grantEntries reads them: every pack the campaign lists, through window.wpLibrary, an entry
// of a GM-only pack marked GM-only as its own key index counts it. Only what a pick needs is handed on: its key, its name, its category and
// whether it is the GM's alone. Nothing where the library is not loaded. The list answered carries waiting, true while a pack the campaign
// lists is not read yet (wpLibrary.ready, else whole), so that formbox.js says an entry it cannot find then is still loading and not gone
// (the review of 2026-11-19)
function formLib() {
    var LB = window.wpLibrary, cp = getActiveCampaign(), packs = cp && cp.library && Array.isArray(cp.library.packs) ? cp.library.packs : [], out = [];
    if (!LB || typeof LB.entriesOf !== 'function') return out;
    packs.forEach(function(p) {
        if (!p || typeof p.id !== 'string') return;
        if (typeof LB.ready === 'function' ? !LB.ready(p.id) : typeof LB.whole === 'function' && !LB.whole()) out.waiting = true;
        // an entry's own stats go along where it has them, so that formcore.js optLists can read which specialties it keeps apart (the typing
        // slip of 2026-11-19); they are only read there, never written
        (LB.entriesOf(p.id) || []).forEach(function(e) { if (e && typeof e.key === 'string') { var o = { key: e.key, name: e.name, category: e.category, vis: p.vis === 'gm' || e.vis === 'gm' ? 'gm' : 'all' }; if (e.stats && typeof e.stats === 'object') o.stats = e.stats; out.push(o); } });
    });
    return out;
}
function formSource(inp) {
    var cF = draft ? null : getActiveCampaign(), d = draft || (cF ? systemOf(cF) : null); if (!d) return null;
    var ctx = inp && /^libF_/.test(inp.id || '') ? {} : formCtx(inp);
    return { sys: d, get lib() { return formLib(); }, subject: ctx.subject || '', trial: formTrial(d, ctx), get groups() { return readsOf(d, ctx); }, get wgroups() { return readsOf(d, Object.assign({}, ctx, { words: true })); }, get wlists() { return Array.isArray(ctx.only) ? [] : (d.fields || []).filter(function(f) { return f && f.kind === 'item-list' && typeof f.key === 'string' && f.key && f.key.indexOf('.') < 0; }).map(function(f) { return [f.key, f.label || f.key]; }); }, word: function(s) { return nameWord(d, s, ctx.list); } };   // wgroups (167 D): what a test of words may read
}
// [formcheck:source-end]
var _formOn = false;
function formOn() { if (_formOn || !window.wpFormBox) return; _formOn = true; window.wpFormBox.setSource(formSource); if (window.wpFormBox.setPicks) window.wpFormBox.setPicks(function(k) { var dm = draft && draft.combat && draft.combat.damage, l = dm && Array.isArray(dm[k]) ? dm[k] : []; return l.filter(function(t) { return !!t && typeof t.key === 'string' && !!t.key; }).map(function(t) { return [t.key, t.label || t.key]; }); }); if (ui('systemModal')) window.wpFormBox.watch(ui('systemModal')); if (ui('libraryModal')) window.wpFormBox.watch(ui('libraryModal')); }
function open(which, topic) {
    if (!canWrite()) { toast('Not while you are at someone else\'s table.'); return; }
    var camp = getActiveCampaign(); if (!camp) return;
    formOn();
    draftSet(clone(systemOf(camp) || emptySystem()));
    if (!Array.isArray(draft.fields)) draft.fields = []; if (!Array.isArray(draft.rolls)) draft.rolls = []; if (!draft.sheet || !Array.isArray(draft.sheet.sections)) draft.sheet = { sections: [] };
    if (!Array.isArray(draft.items)) draft.items = []; if (!draft.combat || typeof draft.combat !== 'object') draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' };
    dirtySet(false); tabSet(which || 'fields'); layoutViewSet('sheet'); sidePrevSet(false);   // 1.6.2: Preview closed whenever the editor opens
    var m = ui('systemModal'); if (!m) return;
    ui('sysCampName').textContent = camp.name || 'Campaign';
    ui('sysName').value = draft.name || '';
    if (ui('sysMakeRolls')) ui('sysMakeRolls').value = draft.makeRolls === 'gm' || draft.makeRolls === 'self' ? draft.makeRolls : '';   // 1.6.3 (finding 22): Rolls while making
    if (ui('sysMark')) { ui('sysMark').value = typeof draft.mark === 'string' ? draft.mark : ''; var mkR = ui('sysMark').closest('.sys-flags'); if (mkR) mkR.hidden = !draft.mark && !sysReaders();   // 1.6.2: a word for an outside reader, which a table without one has no use for
    }
    m.style.display = 'flex';
    starterPacksSet(null); startersLoad().then(function(l) { startersFill(ui('sysStartSel'), l); });   // 1.6.2: the starters from their list, none waiting
    if (window.wpSysUi) window.wpSysUi.pickReset();   // 1.6.2: a list opens on its first row
    if (topic && window.wpSysUi) window.wpSysUi.topicPress(tab, topic);   // the Combat or Rules tab at one topic
    renderAll();
    sidePrevSync();
}
function close(force) {
    var m = ui('systemModal'); if (!m || m.style.display === 'none') return;
    if (dirty && !force) { showConfirm('Close the System editor without saving? Your changes to the fields, rolls and layout since the last Save are lost (characters are saved as you go).', function(yes) { if (yes) { dirtySet(false); close(true); } }, { noEnter: true }); return; }   // 1.6.2: a key pressed for something else never throws the changes away
    if (window.wpArrange && window.wpArrange.on()) window.wpArrange.set(false);
    m.style.display = 'none'; draftSet(null); starterPacksSet(null);
}
// [systemcheck:explainbox-start] 1.6.2 (backlog 218 fold 3): the System editor's What it means, on a field, a roll, a list's stat and column, an effect,
// a section and a link: the words behind the sheet's (i), and a handbook page that says more. Edited in place on the object it is handed, with listeners
// of its own and class names no handler reads; nothing set shows one button, so a row stays short
function explainBox(obj) {
    var box = el('div', 'sys-explain'), cap = typeof LIMITS === 'object' && LIMITS && LIMITS.explain ? LIMITS.explain : 600;
    var draw = function(open) {
        box.textContent = ''; var ex = obj && obj.explain && typeof obj.explain === 'object' ? obj.explain : null;
        if (!ex && !open) {
            var ad = el('button', 'tool ghost sys-btn sys-explain-add', '+ What it means'); ad.type = 'button'; ad.title = 'Words the sheet shows behind a small (i) beside it, and a handbook page that says more';
            ad.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); draw(true); var t = box.querySelector('textarea'); try { if (t) t.focus(); } catch (er) {} });
            box.appendChild(ad); return;
        }
        box.appendChild(el('span', 'sys-num-cap', 'What it means'));
        var ta = el('textarea', 'field sys-explain-says'); ta.rows = 2; ta.maxLength = cap; ta.value = ex && typeof ex.says === 'string' ? ex.says : ''; ta.placeholder = 'Shown behind a small (i) beside it on the sheet'; ta.title = 'Plain words: what it is and how it is used. Players read it where they see the thing';
        var pg = ex && typeof ex.page === 'string' ? ex.page : '', ps = select('sys-explain-page', typeof pageOptions === 'function' ? pageOptions(pg, 'No page') : [['', 'No page']], pg, 'A handbook page the (i) opens to say more. A page players may not read is left off their sheet');
        var put = function() { var says = ta.value.slice(0, cap), p = ps.value; if (!says.trim() && !p) delete obj.explain; else { obj.explain = {}; if (says.trim()) obj.explain.says = says; if (p) obj.explain.page = p; } if (typeof markDirty === 'function') markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
        ta.addEventListener('input', put); ps.addEventListener('change', put);
        var pl = el('label', 'sys-combat-item sys-explain-pagerow'); pl.appendChild(el('span', 'sys-num-cap', 'Read more on')); pl.appendChild(ps);
        box.appendChild(ta); box.appendChild(pl);
    };
    ['input', 'change', 'click'].forEach(function(t) { box.addEventListener(t, function(e) { e.stopPropagation(); }); });   // its own: no handler of a tab reads it
    draw(false); return box;
}
// [systemcheck:explainbox-end]
// [systemcheck:altbox-start]
// 1.6.0: other names for a list roll, an action or a counter (alt: [{ if, label }]), edited in place on the draft object it is handed: a name and a
// formula a pair, + Other name and \u00d7, ALT_MAX at most. Its own listeners, and class names no handler of the Lists tab reads (sys-alt-*)
function altBox(obj, tip) {
    var box = el('div', 'sys-alt'), max = typeof ALT_MAX === 'number' ? ALT_MAX : 40;
    var draw = function() {
        box.textContent = ''; var list = Array.isArray(obj.alt) ? obj.alt : [];
        list.forEach(function(a, j) {
            var rw = el('span', 'sys-alt-row'), nm = input('sys-alt-label field', a && typeof a.label === 'string' ? a.label : '', 'The name shown on rows where its formula holds', 'Other name'), fi = input('sys-alt-if field', a && typeof a.if === 'string' ? a.if : '', tip, 'Where (Row.Kind = 2)');
            nm.maxLength = LIMITS.label; fi.maxLength = LIMITS.formula;
            nm.addEventListener('input', function() { if (obj.alt && obj.alt[j]) { obj.alt[j].label = nm.value.slice(0, LIMITS.label); markDirty(); if (typeof patchErrors === 'function') patchErrors(); } });
            fi.addEventListener('input', function() { if (obj.alt && obj.alt[j]) { obj.alt[j].if = fi.value.slice(0, LIMITS.formula); markDirty(); if (typeof patchErrors === 'function') patchErrors(); } });
            var x = el('button', 'tool ghost sys-btn sys-alt-del', '\u00d7'); x.type = 'button'; x.title = 'Remove this name';
            x.addEventListener('click', function(e) { e.stopPropagation(); if (!Array.isArray(obj.alt)) return; obj.alt.splice(j, 1); if (!obj.alt.length) delete obj.alt; markDirty(); draw(); if (typeof patchErrors === 'function') patchErrors(); });
            rw.appendChild(nm); rw.appendChild(fi); rw.appendChild(x); box.appendChild(rw);
        });
        if (list.length < max) { var ad = el('button', 'tool ghost sys-btn sys-alt-add', '+ Other name'); ad.type = 'button'; ad.title = tip; ad.addEventListener('click', function(e) { e.stopPropagation(); if (!Array.isArray(obj.alt)) obj.alt = []; if (obj.alt.length >= max) return; obj.alt.push({ label: '', if: '' }); markDirty(); draw(); var ins = box.querySelectorAll('.sys-alt-label'); if (ins.length) ins[ins.length - 1].focus(); }); box.appendChild(ad); }
    };
    draw();
    return box;
}
// [systemcheck:altbox-end]
// [systemcheck:bandbox-start] 1.6.2 (backlog 210 (a)): result bands, a name and a formula a row, on the Combat tab's Roll outcomes and on one roll in place of those. Edited in place on the
// list it is handed, with listeners of its own and class names no handler of the Rolls tab reads. get and put read and set the list where it lives, and what Save drops is said by refreshErrors
// 1.6.3 (Fulllion's rulings of 2026-11-20): only the bands the roll will read once saved are offered, as the core reads a roll's bands: the bands Save
// keeps (a name and a test, each name once), the roll's own where it keeps any, else the Combat tab's, and none on a damage roll. A list's roll (r null) reads
// the Combat tab's. A change already set to a band stays offered, so its select still shows it, and the validator says where it never happens
function bandWhens(r, ch) {
    var seen = {}, o = [], put = function(n) { var k = String(n).trim(); if (k && !seen[k.toLowerCase()]) { seen[k.toLowerCase()] = 1; o.push(['band:' + k, 'On ' + k]); } };
    var kept = function(l) { var v = typeof cleanBands === 'function' ? cleanBands(l) : []; return Array.isArray(v) ? v : []; }, own = kept(r ? r.bands : null);
    var read = r && r.dmg === true ? [] : own.length ? own : kept(typeof draft !== 'undefined' && draft && draft.combat ? draft.combat.bands : null);
    read.forEach(function(b) { if (b && typeof b.name === 'string') put(b.name); });
    if (ch && typeof ch.band === 'string' && ch.band) put(ch.band);
    return o;
}
function bandBox(get, put, own, redraw) {
    var box = el('div', 'sys-alt sys-bands'), rows = Array.isArray(get()) ? get() : [];
    box.appendChild(el('div', 'sys-num-cap', own ? 'This roll\u2019s own result bands' : 'Result bands'));
    box.appendChild(el('small', 'sys-line', own ? 'In place of the Combat tab\u2019s, for this roll alone.' : 'Each has a name and a test. The first that holds names the roll on its card, and a change can hang on it.'));
    // 1.6.3 (Fulllion's rulings of 2026-11-20: a band's name and its test each need the other): each row's note says what Save does with it, read by the
    // band cleaner over the rows up to it, so a name another band already holds is said too. Every note follows any name typed, since a later row may then clash
    var notes = [], noteAll = function() { notes.forEach(function(n) { n(); }); };
    // 1.6.3 (the review of rolls): what the card offers, drawn beside this box, says whether a roll has two bands to take a result up through. Typing
    // a band's name or test draws nothing again, so each edit asks every such box on the page (sys-cardacts, which keeps its notes on its element) to say
    // them again. document is asked through typeof, since a suite runs this box on a page of plain objects
    var cardsMoved = function() { if (typeof document === 'undefined' || !document || typeof document.querySelectorAll !== 'function') return; Array.prototype.forEach.call(document.querySelectorAll('.sys-cardacts'), function(c) { if (c && typeof c._wpCardNotes === 'function') c._wpCardNotes(); }); };
    var bandSays = function(i) { var k = function(l) { var v = typeof cleanBands === 'function' ? cleanBands(l) : null; return Array.isArray(v) ? v.length : -1; }, upTo = k(rows.slice(0, i + 1)), before = k(rows.slice(0, i)); if (upTo < 0 || upTo > before) return ''; return k([rows[i]]) > 0 ? 'Save leaves this band out: another band already has this name.' : 'Save leaves this band out until it has a name and a test.'; };
    rows.forEach(function(b, i) {
        var row = el('div', 'sys-flags sys-band-row'), n = input('sys-band-name field', b && typeof b.name === 'string' ? b.name : '', 'What the card calls a roll in this band', 'Name'), f = input('sys-band-if field', b && typeof b.if === 'string' ? b.if : '', 'A formula with no dice that holds for this band. It reads RollTotal, Natural, RollMargin, RollCrit and RollBig beside the roller\u2019s names', 'Such as RollTotal >= 10'), x = el('button', 'tool ghost sys-btn sys-band-rm', '\u00d7');
        n.maxLength = 30; f.maxLength = LIMITS.formula; x.type = 'button'; x.title = 'Take this band away';
        var nt = el('div', 'sys-ask-note sys-band-note'), note = function() { nt.textContent = bandSays(i); }; notes.push(note);
        n.addEventListener('input', function() { rows[i].name = n.value; markDirty(); patchErrors(); noteAll(); cardsMoved(); });
        f.addEventListener('input', function() { rows[i].if = f.value; markDirty(); patchErrors(); note(); cardsMoved(); });
        x.addEventListener('click', function() { rows.splice(i, 1); if (!rows.length) put(null); markDirty(); redraw(); });
        row.appendChild(n); row.appendChild(f); row.appendChild(x); box.appendChild(row); box.appendChild(nt); note();
    });
    var add = el('button', 'tool ghost sys-band-add', '+ Band'); add.type = 'button'; add.title = 'Add a result band, eight at most'; add.disabled = rows.length >= 8;
    // 1.6.3: a new band starts with a plain name no other band of the list holds (Band 1, Band 2), which a Then's On <band> names; its test is the GM's to write
    add.addEventListener('click', function() { var l = Array.isArray(get()) ? get() : [], taken = {}, k = l.length + 1; l.forEach(function(x) { if (x && typeof x.name === 'string') taken[x.name.trim().toLowerCase()] = 1; }); while (taken[('band ' + k)]) k++; l.push({ name: 'Band ' + k, if: '' }); put(l); markDirty(); redraw(); });
    box.appendChild(add);
    return box;
}
// [systemcheck:bandbox-end]
// [systemcheck:callsbox-start] 1.6.0: a roll's or an action's Calls for, edited in place on the draft object it is handed, with listeners of its own
// and class names no handler of the Rolls or Lists tab reads. Every label is an option's text or a value
function callsBox(obj, sys, isApply) {
    var box = el('div', 'sys-alt sys-calls'), max = LIMITS.rollCalls;
    var said = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var rollsOf = function() { return sys && Array.isArray(sys.rolls) ? sys.rolls.filter(function(x) { return x && typeof x.id === 'string'; }) : []; };
    var listRolls = function() { var o = []; (sys && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) f.list.rolls.forEach(function(lr, i) { if (lr && typeof lr.formula === 'string' && lr.formula && !Array.isArray(lr.apply)) o.push([f.id + '#' + i, 'Calls for: ' + (f.label || f.key || 'List') + ': ' + (lr.label || 'Roll') + ' on that row']); }); }); return o; };   // 1.6.2
    var nameOf = function(id) {
        var hit = rollsOf().filter(function(x) { return x.id === id; })[0]; if (hit) return hit.label || 'Roll';
        var m = /^(f_[A-Za-z0-9_]+)#(\d+)$/.exec(String(id)), lf = m && sys && Array.isArray(sys.fields) ? sys.fields.filter(function(x) { return x && x.id === m[1]; })[0] : null, lr = lf && lf.list && Array.isArray(lf.list.rolls) ? lf.list.rolls[+m[2]] : null;
        return lr ? (lf.label || lf.key || 'List') + ': ' + (lr.label || 'Roll') : 'a roll that is gone';
    };
    var dmgOf = function(id) {   // 1.6.3 (defense fold 0): whether the roll a call posts is a damage roll, so whether it has a Lands on
        var hit = rollsOf().filter(function(x) { return x.id === id; })[0]; if (hit) return hit.dmg === true;
        var m = /^(f_[A-Za-z0-9_]+)#(\d+)$/.exec(String(id)), lf = m && sys && Array.isArray(sys.fields) ? sys.fields.filter(function(x) { return x && x.id === m[1]; })[0] : null, lr = lf && lf.list && Array.isArray(lf.list.rolls) ? lf.list.rolls[+m[2]] : null;
        return !!lr && lr.dmg === true;
    };
    var refocus = function(j, cls) {   // after a redraw, the focus back on the control that was changed, so the keys stay on the list
        var rw = box.children[j], k = rw && rw.children ? Array.prototype.slice.call(rw.children).filter(function(x) { return x && typeof x.className === 'string' && x.className.split(' ').indexOf(cls) >= 0; })[0] : null; if (k && k.focus) k.focus();
    };
    var draw = function() {
        box.textContent = ''; var list = Array.isArray(obj.calls) ? obj.calls : [], rolls = rollsOf();
        list.forEach(function(c, j) {
            var toSel = null, rw = el('span', 'sys-alt-row sys-call-row'), opts = rolls.filter(function(x) { return !(typeof x.withRow === 'string' && x.withRow) || x.id === c.roll; }).map(function(x) { return [x.id, 'Calls for: ' + (x.label || 'Roll') + (typeof x.withRow === 'string' && x.withRow ? ', made only from a defense card' : '')]; }).concat(listRolls());   /* 1.6.3 (the review of defense fold 2, finding 3): a roll answered with a row is offered no more, and one picked already says why it posts nothing */ if (!opts.some(function(x) { return x[0] === c.roll; })) opts.push([c.roll, 'Calls for: a roll that is gone']);
            var rs = select('sys-call-roll', opts, c.roll, 'The roll posted as a card to press. It comes only while that roll\u2019s own needs hold. A list\u2019s roll is posted on a row: the row that resisted, or the roller\u2019s own row');
            rs.addEventListener('change', function(e) { e.stopPropagation(); c.roll = rs.value; if (!dmgOf(c.roll)) delete c.on; said(); draw(); refocus(j, 'sys-call-roll'); }); rw.appendChild(rs);   // 1.6.3: drawn anew, since Lands on comes and goes with a damage roll
            if (!isApply) {
                var whs = [['', 'Whatever comes of it'], ['hit', 'On a success'], ['miss', 'On a failure']]; if (typeof obj.resistBy === 'string' || c.when === 'resisted') whs.push(['resisted', 'When it is resisted']);
                var ws = select('sys-call-when', whs, c.when || '', 'When the card comes. When it is resisted: as the target\u2019s roll succeeds, and the card goes to the target');
                ws.addEventListener('change', function(e) { e.stopPropagation(); if (ws.value) c.when = ws.value; else delete c.when; if (c.when !== 'resisted') { delete c.by; delete c.byIf; delete c.to; } delete c.on; said(); draw(); var nw = box.children[j] && box.children[j].children[1]; if (nw && nw.focus) nw.focus(); }); rw.appendChild(ws);   // the box is drawn anew, so the keys stay on the list
                if (c.when === 'resisted') {
                    var bys = [['', 'By any roll']]; [obj.resistBy].concat(Array.isArray(obj.resistOr) ? obj.resistOr : []).forEach(function(id) { if (typeof id === 'string' && id) bys.push([id, 'By ' + nameOf(id)]); }); if (c.by && !bys.some(function(x) { return x[0] === c.by; })) bys.push([c.by, 'By a roll that does not resist it']);
                    var bs = select('sys-call-by', bys, c.by || '', 'Which of the rolls that may resist it brings the card');
                    bs.addEventListener('change', function(e) { e.stopPropagation(); if (bs.value) c.by = bs.value; else delete c.by; var biN = rw.querySelector ? rw.querySelector('.sys-call-byif') : null; if (biN && biN.dataset) biN.dataset.by = c.by || ''; said(); }); rw.appendChild(bs);   // 1.6.3 (the review of defense fold 2, finding 8): its Read on the one who resisted follows the By picked
                    var ts = select('sys-call-to', [['', 'To the one who resisted'], ['self', 'To the roller']], c.to === 'self' ? 'self' : '', 'Who the card goes to. To the roller: on the roller\u2019s own row, so a weapon that was parried can roll for itself');   // 1.6.2
                    ts.addEventListener('change', function(e) { e.stopPropagation(); if (ts.value === 'self') c.to = 'self'; else delete c.to; delete c.on; said(); draw(); refocus(j, 'sys-call-to'); }); toSel = ts;   // drawn last, before x; 1.6.3: Lands on starts again from who the card goes to
                }
            }
            var fi = input('sys-call-if field', typeof c.if === 'string' ? c.if : '', 'Only while this is true, read with the roller\u2019s names. On a list Row.<name> reads its row. No dice', 'Only where (optional)'); fi.maxLength = LIMITS.formula;
            fi.addEventListener('input', function() { if (fi.value.trim()) c.if = fi.value.slice(0, LIMITS.formula); else delete c.if; said(); }); rw.appendChild(fi);
            if (!isApply && c.when === 'resisted') {   // a second condition, on the one who resisted, as their roll succeeds
                var bi = input('sys-call-byif field', typeof c.byIf === 'string' ? c.byIf : '', 'Only while this is true of the one who resisted, read as their roll succeeds with their own names. Where the call names a list\u2019s roll, or a roll answered with a row, Row.<name> reads the row they used. No dice', 'Only where (optional)'), bc = el('label', 'sys-num sys-cap'); bi.maxLength = LIMITS.formula; bi.dataset.by = typeof c.by === 'string' ? c.by : '';   /* 1.6.3 (the review of defense fold 2, finding 8): its form offers the names of the row the By roll is answered with (formCtx) */
                bi.addEventListener('input', function() { if (bi.value.trim()) c.byIf = bi.value.slice(0, LIMITS.formula); else delete c.byIf; said(); });
                bc.appendChild(el('span', 'sys-num-cap', 'Read on the one who resisted')); bc.appendChild(bi); rw.appendChild(bc);
            }
            if (toSel) rw.appendChild(toSel);
            if (!c.crew && dmgOf(c.roll)) {   // 1.6.3 (defense fold 0; Fulllion's decision 7): where a called damage roll lands, The roller or Their target. It starts from When:
                // On a success their target, and on a failure, for an action or whatever comes of it the roller; on a call that waits for it to be resisted the
                // one the card goes to. Only a pick that differs from that start is kept, so a call nobody set reads as systemcore callLandOf says
                var lDef = c.when === 'hit' || (c.when === 'resisted' && c.to !== 'self') ? 'target' : 'roller', lNow = c.on === 'roller' || c.on === 'target' ? c.on : lDef;
                var ls = select('sys-call-on', [['roller', 'Lands on the roller'], ['target', 'Lands on their target']], lNow, 'Who its damage lands on. Their target is the one the roll was aimed at, and on a call that waits for it to be resisted the one who resisted. It is fixed when the card comes, so the damage never moves to whoever is pointed at later' + (obj.area ? '. A roll that hits a line has no one target, so there you aim it when you apply it' : ''));
                ls.addEventListener('change', function(e) { e.stopPropagation(); if (ls.value === lDef) delete c.on; else c.on = ls.value; said(); }); rw.appendChild(ls);
            }
            if (c.to !== 'self' && !/#/.test(String(c.roll || '')) && typeof crewPick === 'function') rw.appendChild(crewPick(c, draw));   // 1.6.2 (fold (f))
            var x = el('button', 'tool ghost sys-btn sys-call-del', '\u00d7'); x.type = 'button'; x.title = 'Stop calling for this roll';
            x.addEventListener('click', function(e) { e.stopPropagation(); if (!Array.isArray(obj.calls)) return; obj.calls.splice(j, 1); if (!obj.calls.length) delete obj.calls; said(); draw(); }); rw.appendChild(x);
            box.appendChild(rw);
        });
        if (list.length < max && (rolls.length || listRolls().length)) { var ad = el('button', 'tool ghost sys-btn sys-call-add', '+ Calls for a roll'); ad.type = 'button'; ad.title = 'Post another roll of the system as a card to press after this one'; ad.addEventListener('click', function(e) { e.stopPropagation(); if (!Array.isArray(obj.calls)) obj.calls = []; if (obj.calls.length >= max) return; obj.calls.push({ roll: rollsOf().length ? rollsOf()[0].id : listRolls()[0][0] }); said(); draw(); }); box.appendChild(ad); }
    };
    draw();
    return box;
}
// [systemcheck:callsbox-end]
// [systemcheck:answersbox-start] 1.6.3 (defense fold 3; docs/DEFENSE_INTERACTIONS_DESIGN.md 5.2, Fulllion's decision 3: "On the defense roll, as short lines
// picked by name"): When it answers an attack, on a roll ticked Resists an attempt, edited in place on the draft roll it is handed (obj.answers), with
// listeners of its own and class names (sys-ans-*) no handler of the Rolls or Lists tab reads. Each line: If, a form ("Always" until opened); Then, a list of
// what the defense does; beside it the type it lands as, picked by name; and the weapon tests, picked by name. rowList: the list the parrying row is a row of
// (a list's roll's own list, or the list a roll of the system is Answered with a row of), none where the defense is made with no row. Every label is an
// option's text or a value, and what Save says of a line comes from the validator through the roll's errors
var ANS_DOES_WORDS = [['stop', 'Then: it stops the attack'], ['thru', 'Then: the parrying row takes it first'], ['share', 'Then: it lets some through'], ['hits', 'Then: it stops a number of hits'], ['send', 'Then: it can be sent on']];   // 1.6.3 (defense fold 4): and Sends it on
function answersBox(obj, sys, rowList) {
    var box = el('div', 'sys-alt sys-answers'), max = typeof ANS_MAX === 'number' ? ANS_MAX : 8;
    var said = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var types = sys && sys.combat && sys.combat.damage && Array.isArray(sys.combat.damage.types) ? sys.combat.damage.types.filter(function(y) { return y && typeof y.key === 'string'; }) : [];
    var listRolls = function(f) { return f && f.list && Array.isArray(f.list.rolls) ? f.list.rolls.map(function(lr, i) { return lr && typeof lr.formula === 'string' && lr.formula && !Array.isArray(lr.apply) ? [f.id + '#' + i, (lr.label || 'Roll')] : null; }).filter(Boolean) : []; };
    var allLists = (sys && Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return f && f.kind === 'item-list'; });
    var refocus = function(j, cls) { var rw = box.querySelectorAll ? box.querySelectorAll('.sys-ans-row')[j] : null, k = rw && rw.querySelector ? rw.querySelector('.' + cls) : null; if (k && k.focus) k.focus(); };
    var draw = function() {
        box.textContent = ''; var list = Array.isArray(obj.answers) ? obj.answers : [];
        box.appendChild(el('div', 'sys-num-cap', 'When it answers an attack'));
        box.appendChild(el('small', 'sys-line', 'What a success does to the attack. The first line that holds is the one that counts. With none, it stops the attack.'));
        list.forEach(function(a, j) {
            if (!a || typeof a !== 'object') return;
            var rw = el('div', 'sys-alt-row sys-ans-row'); rw.dataset.j = String(j);
            var fi = input('sys-ans-if field', typeof a.if === 'string' ? a.if : '', 'Only where this holds, read as the defense succeeds: the one defending, the row they parry with, what the attack is and how far each roll got. No dice. Empty: always', 'If (optional)'); fi.maxLength = LIMITS.formula; fi.dataset.ansl = rowList && rowList.id ? rowList.id : '';
            fi.addEventListener('input', function(e) { e.stopPropagation(); if (fi.value.trim()) a.if = fi.value.slice(0, LIMITS.formula); else delete a.if; said(); }); rw.appendChild(fi);
            var dOpts = ANS_DOES_WORDS.filter(function(x) { return x[0] !== 'thru' || !!rowList || a.does === 'thru'; }), ds = select('sys-ans-does', dOpts, a.does || 'stop', 'What the defense does where this line holds. Stopped, nothing lands. The parrying row takes it first: it lands, and only what is over that row\u2019s figure goes on. Some through: each part is cut to a share before armor. A number of hits: that many hits of a burst are stopped and the rest land');
            ds.addEventListener('change', function(e) { e.stopPropagation(); a.does = ds.value; if (a.does !== 'share') delete a.dice; if (a.does !== 'share') delete a.share; else if (!a.share) a.share = typeof ANS_HALF === 'string' ? ANS_HALF : 'Blow.dmg / 2'; if (a.does !== 'hits') delete a.hits; else if (!a.hits) a.hits = '1'; if (a.does === 'stop' || a.does === 'send') { delete a.type; delete a.all; } if (a.does !== 'send') ['roll', 'noRoll', 'mod', 'margin', 'far', 'back'].forEach(function(k) { delete a[k]; }); said(); draw(); refocus(j, 'sys-ans-does'); }); rw.appendChild(ds);
            if (a.does === 'send') sendOnBox(rw, a, j, sys, rowList, said, draw, refocus);   // 1.6.3 (defense fold 4): the roll it is sent on with, its modifier or Its margin, How far, and May go straight back
            if (a.does === 'share') { var sh = input('sys-ans-share field', typeof a.share === 'string' ? a.share : '', 'How much of each part of the blow gets through, before armor, worked out from the damage rolled. Half of it to start. No dice', 'How much gets through'); sh.maxLength = LIMITS.formula; sh.addEventListener('input', function(e) { e.stopPropagation(); a.share = sh.value.trim() ? sh.value.slice(0, LIMITS.formula) : (typeof ANS_HALF === 'string' ? ANS_HALF : 'Blow.dmg / 2'); said(); }); rw.appendChild(sh);
                // 1.6.3 (Fulllion's ruling of 2026-11-18): Dice counted per die, Every die rolled (no key, as before) or The same share of the dice (dice: 'share')
                var dcS = select('sys-ans-dice', [['', 'Dice counted per die: every die rolled'], ['share', 'Dice counted per die: the same share of the dice']], a.dice === 'share' ? 'share' : '', 'What a figure counted per die reads, such as armor or a wound per die. Every die rolled: as many as the blow rolled. The same share: cut as its damage is, rounded down, at least one where any of it gets through');
                dcS.addEventListener('change', function(e) { e.stopPropagation(); if (dcS.value === 'share') a.dice = 'share'; else delete a.dice; said(); }); rw.appendChild(dcS); }
            if (a.does === 'hits') { var hn = input('sys-ans-hits field', typeof a.hits === 'string' ? a.hits : '', 'How many hits of a burst it stops, worked out as the defense succeeds, such as one more than how far it succeeded by. The rest land. An attack of one hit is stopped where this is 1 or more. No dice', 'How many hits'); hn.maxLength = LIMITS.formula; hn.dataset.ansl = rowList && rowList.id ? rowList.id : ''; hn.addEventListener('input', function(e) { e.stopPropagation(); a.hits = hn.value.trim() ? hn.value.slice(0, LIMITS.formula) : '1'; said(); }); rw.appendChild(hn); }
            if (a.does && a.does !== 'stop' && a.does !== 'send') {
                var tOpts = [['', 'As its own type']].concat(types.map(function(y) { return [y.key, 'As ' + (y.label || 'a type')]; })); if (a.type && !types.some(function(y) { return y.key === a.type; })) tOpts.push([a.type, 'As a type that is gone']);
                var ts = select('sys-ans-type', tOpts, a.type || '', 'The damage type it lands as, from the Combat tab\u2019s types. Its own type: as it was rolled');
                ts.addEventListener('change', function(e) { e.stopPropagation(); if (ts.value) a.type = ts.value; else { delete a.type; delete a.all; } said(); draw(); refocus(j, 'sys-ans-type'); }); rw.appendChild(ts);
                if (a.type) { var al = checkLabel('sys-ans-all', a.all === true, 'Every part', 'Every part of the blow lands as that type. Off: only its first part'), alc = al.querySelector('input'); alc.addEventListener('change', function(e) { e.stopPropagation(); if (alc.checked) a.all = true; else delete a.all; said(); }); rw.appendChild(al); }
            }
            if (rowList || a.test) { var tsO = [['', 'Tests no parrying weapon']].concat(listRolls(rowList).map(function(x) { return [x[0], 'Tests the parrying weapon with ' + x[1]]; })); if (a.test && !tsO.some(function(x) { return x[0] === a.test; })) tsO.push([a.test, 'Tests with a roll that is gone']);
                var tt = select('sys-ans-test', tsO, a.test || '', 'A roll made on the row they parried with, such as a test of whether it holds. How it is made is the Combat tab\u2019s Attacks and defenses');
                tt.addEventListener('change', function(e) { e.stopPropagation(); if (tt.value) a.test = tt.value; else delete a.test; said(); }); rw.appendChild(tt); }
            var taO = [['', 'Tests no attacking weapon']]; allLists.forEach(function(f) { listRolls(f).forEach(function(x) { taO.push([x[0], 'Tests the attacking weapon with ' + (f.label || 'a list') + ': ' + x[1]]); }); }); if (a.testAtk && !taO.some(function(x) { return x[0] === a.testAtk; })) taO.push([a.testAtk, 'Tests with a roll that is gone']);
            if (taO.length > 1 || a.testAtk) { var ta = select('sys-ans-tatk', taO, a.testAtk || '', 'A roll made on the row the attack was made with, where it is a row of that roll\u2019s list. How it is made is the Combat tab\u2019s Attacks and defenses');
                ta.addEventListener('change', function(e) { e.stopPropagation(); if (ta.value) a.testAtk = ta.value; else delete a.testAtk; said(); }); rw.appendChild(ta); }
            var x = el('button', 'tool ghost sys-btn sys-ans-del', '\u00d7'); x.type = 'button'; x.title = 'Take this line away';
            x.addEventListener('click', function(e) { e.stopPropagation(); if (!Array.isArray(obj.answers)) return; obj.answers.splice(j, 1); if (!obj.answers.length) delete obj.answers; said(); draw(); }); rw.appendChild(x);
            box.appendChild(rw);
        });
        if (list.length < max) { var ad = el('button', 'tool ghost sys-btn sys-ans-add', list.length ? '+ Another line' : '+ What a success does'); ad.type = 'button'; ad.title = 'Add a line: where it holds, what the defense does to the attack'; ad.addEventListener('click', function(e) { e.stopPropagation(); if (!Array.isArray(obj.answers)) obj.answers = []; if (obj.answers.length >= max) return; obj.answers.push({ does: 'stop' }); said(); draw(); refocus(obj.answers.length - 1, 'sys-ans-does'); }); box.appendChild(ad); }
    };
    draw();
    return box;
}
// 1.6.3 (defense fold 4; docs/DEFENSE_INTERACTIONS_DESIGN.md 5.2, backlog 243): what a line that sends the attack on holds, edited in place on the line a (its own
// listeners, class names sys-ans-*). The roll they make: a roll of the system, or a roll of the parrying row's own list, by name, or Placed with no roll. Beside
// a roll, a Modifier; beside no roll, Its margin; then How far, in the unit the range counts in; then May go straight back, which the core never allows. The three
// boxes are forms read as the If is (the defender, the parrying row, the attempt and the defense roll's own result), worked out once as the defense succeeds
function sendOnBox(rw, a, j, sys, rowList, said, draw, refocus) {
    var opts = [['', 'Sent on with which roll?']], seen = {};
    (sys && Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) { if (r && typeof r.id === 'string' && typeof r.formula === 'string' && r.formula && !Array.isArray(r.apply) && !r.dmg) { opts.push([r.id, 'Sent on with ' + (r.label || 'a roll') + (r.vis === 'gm' ? ' (GM only)' : '')]); seen[r.id] = 1; } });   // the review of defense fold 4 (finding 2): a roll the GM keeps is said so, as its card is the GM's alone
    (rowList && rowList.list && Array.isArray(rowList.list.rolls) ? rowList.list.rolls : []).forEach(function(r, i) { if (r && typeof r.formula === 'string' && r.formula && !Array.isArray(r.apply) && !r.dmg) { var k = rowList.id + '#' + i; opts.push([k, 'Sent on with ' + (r.label || 'a roll') + ' of the parrying row' + (rowList.vis === 'gm' || r.gm === true ? ' (GM only)' : '')]); seen[k] = 1; } });
    opts.push(['@none', 'Placed with no roll']); if (a.roll && !seen[a.roll]) opts.push([a.roll, 'Sent on with a roll that is gone']);
    var rs = select('sys-ans-sroll', opts, a.noRoll === true ? '@none' : a.roll || '', 'The roll the defender makes to send it on, as themselves, from where they stand, at the one they point at. A roll of the parrying row\u2019s list reads that row. Placed with no roll: it goes on at once');
    rs.addEventListener('change', function(e) { e.stopPropagation(); if (rs.value === '@none') { a.noRoll = true; delete a.roll; delete a.mod; } else { delete a.noRoll; delete a.margin; if (rs.value) a.roll = rs.value; else delete a.roll; } said(); draw(); refocus(j, 'sys-ans-sroll'); }); rw.appendChild(rs);
    var bx = function(cls, key, tip, ph) { var b = input(cls + ' field', typeof a[key] === 'string' ? a[key] : '', tip, ph); b.maxLength = LIMITS.formula; b.dataset.ansl = rowList && rowList.id ? rowList.id : ''; b.addEventListener('input', function(e) { e.stopPropagation(); if (b.value.trim()) a[key] = b.value.slice(0, LIMITS.formula); else delete a[key]; said(); }); rw.appendChild(b); };
    if (a.noRoll === true) bx('sys-ans-margin', 'margin', 'How far it is placed by, as if a roll made it by that much, for the next defense to read. Worked out as the defense succeeds. No dice. Empty: 0', 'Its margin (optional)');
    else bx('sys-ans-mod', 'mod', 'Added to the roll they make, such as less at a lower rank. Worked out as the defense succeeds. No dice. Empty: none', 'Modifier (optional)');
    var unS = typeof rangeUnitWord === 'function' ? rangeUnitWord(sys, 2) : 'the unit the range counts in';   // the review of defense fold 4 (finding 9): the unit, named (the Range box's, else yards)
    bx('sys-ans-far', 'far', 'How far it can be sent, in ' + unS + ' as the range counts them, worked out as the defense succeeds. No dice. Empty: any distance', 'How far (optional)');
    var farB = rw.lastChild; if (farB && farB.dataset) farB.dataset.fbSay = 'In ' + unS + ', as the range counts them. Leave it empty for any distance.';   // formbox's question for this box says the unit too (askOf)
    var bk = checkLabel('sys-ans-back', a.back === true, 'May go straight back', 'It may be sent straight back at the one who sent it. Off: never at them, though another may'), bkc = bk.querySelector('input');
    bkc.addEventListener('change', function(e) { e.stopPropagation(); if (bkc.checked) a.back = true; else delete a.back; said(); }); rw.appendChild(bk);
}
// [systemcheck:answersbox-end]
// [systemcheck:ansview-start] 1.6.3 (defense fold 3; Fulllion's decision 3: "with a read-only overview in the Combat tab"): the Combat tab's Attacks and defenses,
// How a weapon test is made (combat.testBy) and every rule a defense follows when it answers an attack, one sentence a line, each a button that opens its roll's
// row (errGo). The sentences are worked out from the draft (ansOverview), in the sheet's own words, never a formula
function ansCond(sys, text) {
    var FC = typeof window !== 'undefined' ? window.wpFormCore : null, r = FC && text ? FC.readCond(String(text)) : null; if (!r || !r.ok) return 'a test of its own';
    try { return FC.saysCond(r.cond, { name: function(n) { return nameWord(sys, n); } }) || 'a test of its own'; } catch (e) { return 'a test of its own'; }
}
// The review of defense fold 3 (finding 10): a share said by what it comes to (systemcore ansShareWord, read as a formula), so Blow.dmg/2 is half as
// Blow.dmg / 2 is; with no formula engine at hand, half only where its text is half's with its spaces left out
function ansShareSaid(sys, text) {
    var Fw = typeof window !== 'undefined' ? window.wpFormula : null; if (typeof ansShareWord === 'function' && Fw) return ansShareWord(sys, text, Fw);
    return String(text || '').replace(/\s+/g, '').toLowerCase() === 'blow.dmg/2' ? 'half' : '';
}
function ansLineWords(sys, name, a, rowList) {
    var types = sys && sys.combat && sys.combat.damage && Array.isArray(sys.combat.damage.types) ? sys.combat.damage.types : [], ty = a.type ? types.filter(function(y) { return y && y.key === a.type; })[0] : null;
    var rollName = function(ref) { var m = /^(f_[A-Za-z0-9_]+)#(\d+)$/.exec(String(ref || '')), f = m ? (sys.fields || []).filter(function(x) { return x && x.id === m[1]; })[0] : null, lr = f && f.list && Array.isArray(f.list.rolls) ? f.list.rolls[+m[2]] : null; return lr ? (lr.label || 'a roll') : 'a roll that is gone'; };
    var w = 'When ' + (name || 'this roll') + ' answers an attack' + (a.if ? ', where ' + ansCond(sys, a.if) : '') + ', ';
    var sendW = function() { var rr = a.roll && /^r_/.test(a.roll) ? (sys && Array.isArray(sys.rolls) ? sys.rolls : []).filter(function(x) { return x && x.id === a.roll; })[0] : null; return 'it can be sent on at someone else ' + (a.noRoll === true ? 'with no roll' : a.roll ? 'with ' + (rr ? rr.label || 'a roll' : rollName(a.roll)) : 'once a roll is picked') + (a.far ? ', within a reach of its own' : '') + (a.back === true ? ', even straight back' : ''); };   // 1.6.3 (defense fold 4)
    w += a.does === 'send' ? sendW() : a.does === 'thru' ? 'it lands and the parrying row takes it first' : a.does === 'share' ? ({ half: 'half of it gets through', none: 'none of it gets through', all: 'all of it gets through' }[ansShareSaid(sys, a.share)] || 'some of it gets through') + (a.dice === 'share' ? ', its dice counted by the same share' : '') : a.does === 'hits' ? (a.hits === '1' ? 'it stops one hit and the rest land' : 'it stops a number of hits and the rest land') : 'it stops the attack';
    if (ty && a.does !== 'stop' && a.does !== 'send') w += a.all === true ? ', every part as ' + (ty.label || ty.key) : ', as ' + (ty.label || ty.key);
    if (a.test) w += ', and tests the parrying weapon with ' + rollName(a.test);
    if (a.testAtk) w += ', and tests the attacking weapon with ' + rollName(a.testAtk);
    return w + '.';
}
function ansOverview(sys) {
    var out = []; if (!sys) return out;
    (Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(r) {
        if (!r || r.resist !== true || Array.isArray(r.apply) || !Array.isArray(r.answers) || !r.answers.length) return;
        var rl = typeof r.withRow === 'string' ? (sys.fields || []).filter(function(f) { return f && f.id === r.withRow; })[0] : null;
        r.answers.forEach(function(a) { if (a && typeof a === 'object') out.push({ text: ansLineWords(sys, r.label, a, rl), go: r.id, name: r.label || 'the roll' }); });
    });
    (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (!f || f.kind !== 'item-list' || !f.list || !Array.isArray(f.list.rolls)) return;
        f.list.rolls.forEach(function(r) {
            if (!r || r.resist !== true || Array.isArray(r.apply)) return; var nm = (f.label || 'A list') + ': ' + (r.label || 'Roll');
            (Array.isArray(r.answers) ? r.answers : []).forEach(function(a) { if (a && typeof a === 'object') out.push({ text: ansLineWords(sys, nm, a, f), go: 'list:' + f.id, name: f.label || 'the list' }); });
            if (r.thru === true) out.push({ text: 'When ' + nm + ' answers an attack, it lands and the parrying row takes it first, except an attack along a line, which it stops.', go: 'list:' + f.id, name: f.label || 'the list' });   // the review of defense fold 3 (finding 10): the tick never lets a line through
        });
    });
    return out;
}
function defenseOverview(box, cm) {
    box.appendChild(labeledSelect('sys-combat-testby', 'A weapon test a defense calls for', [['', 'Its owner gets a card'], ['now', 'It is rolled at once'], ['both', 'A card, and you may roll it at once']], cm && (cm.testBy === 'now' || cm.testBy === 'both') ? cm.testBy : '', 'A defense that succeeds may test the parrying weapon, or the attacking one, by a line of When it answers an attack. Here: its owner presses a card, it is rolled at once as its owner, or the owner gets a card and you may roll it at once'));
    sendHopsBox(box, cm);   // 1.6.3 (defense fold 4): how many times an attack may be sent on
    var wrap = el('div', 'sys-ansview');
    wrap.appendChild(el('small', 'sys-line', 'Every rule a defense follows when it answers an attack, one sentence each. Press one to open its roll. They are set on each roll ticked Resists an attempt.'));
    var lines = ansOverview(typeof draft !== 'undefined' ? draft : null);
    if (!lines.length) wrap.appendChild(el('div', 'sys-ansview-none', 'No roll says yet what it does when it answers an attack, so a defense that succeeds stops the attack.'));
    lines.forEach(function(l) { var b = el('button', 'tool ghost sys-ansview-go', l.text); b.type = 'button'; b.title = 'Open ' + l.name; b.addEventListener('click', function(e) { e.stopPropagation(); if (typeof errGo === 'function') errGo(l.go); }); wrap.appendChild(b); });
    box.appendChild(wrap);
}
// 1.6.3 (defense fold 4; docs/DEFENSE_INTERACTIONS_DESIGN.md 5.3, the core's answer 5): Can be sent on at most, the app's own counter from 1 to SEND_HOPS_MAX (8).
// At 1, its first figure, no key is kept (once); above it, combat.sendHops. A line of When it answers an attack that sends it on is stopped past it
function sendHopsBox(box, cm) {
    var mx = typeof SEND_HOPS_MAX === 'number' ? SEND_HOPS_MAX : 8, cur = cm && typeof cm.sendHops === 'number' && isFinite(cm.sendHops) ? Math.max(1, Math.min(mx, Math.floor(cm.sendHops))) : 1;
    var tailW = document.createTextNode(cur === 1 ? ' time' : ' times');   // the review of defense fold 4 (finding 10): "1 time", never "1 times"
    var set = function(n) { var v = Math.max(1, Math.min(mx, Math.floor(n))); tailW.nodeValue = v === 1 ? ' time' : ' times'; if (!cm) return; if (v > 1) cm.sendHops = v; else delete cm.sendHops; markDirty(); };
    var row = el('div', 'sys-ask-end sys-combat-sendhopsrow'); row.appendChild(document.createTextNode('An attack can be sent on at most '));
    var Uw = typeof window !== 'undefined' && window.wpUi && window.wpUi.step ? window.wpUi : null;
    var st = Uw ? Uw.step({ value: cur, min: 1, max: mx, step: 1, label: 'Times an attack can be sent on', valCls: 'sys-combat-sendhops', lessTip: 'Once less', moreTip: 'Once more', set: set }) : input('sys-combat-sendhops field', String(cur), 'How many times one attack can be sent on, from 1 to ' + mx, '1');
    if (!Uw) st.addEventListener('input', function() { var n = Math.floor(Number(st.value)); if (n >= 1) set(n); });   // the suites' page, which has no counter
    row.appendChild(st); row.appendChild(tailW); box.appendChild(row);
    box.appendChild(el('small', 'sys-line', 'Where a defense says it can be sent on. Once it has gone that many times, a defense stops it.'));
}
// [systemcheck:ansview-end]
// [systemcheck:rowswitchbox-start] 1.6.0 R6 and R7: the Lists tab's Word while off and Icon beside the switch, and a list roll's Icon and Shows
// figure, each edited in place on the draft object it is handed, with listeners of its own and class names no handler of the Lists tab reads
function swWordsBox(row, sw) {
    var ch = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var off = input('sys-swoff field', typeof sw.offLabel === 'string' ? sw.offLabel : '', 'Its word while off, such as Ready beside Readied. With one the switch is a button that says what the row is now, filled while on', 'Word while off (optional)'); off.maxLength = LIMITS.label;
    off.addEventListener('input', function() { var v = off.value.slice(0, LIMITS.label); if (v.trim()) sw.offLabel = v; else delete sw.offLabel; ch(); });
    var ic = input('sys-swicon field', typeof sw.icon === 'string' ? sw.icon : '', 'An icon on the switch\u2019s button, a bundled icon or an emoji. Empty: a check. It shows only with a word while off, and Save drops it without one', 'Icon');
    ic.addEventListener('input', function() { var v = ic.value.trim().slice(0, 32); if (v) sw.icon = v; else delete sw.icon; ch(); });
    row.appendChild(off); row.appendChild(ic); if (typeof glyphButton === 'function') row.appendChild(glyphButton(ic));
}
function rollExtras(row, rr, sp, isApply) {
    if (typeof asksBox === 'function') row.appendChild(asksBox(rr));
    var ch = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var ic = input('sys-rlicon field', typeof rr.icon === 'string' ? rr.icon : '', isApply ? 'An icon on its button, a bundled icon or an emoji. Empty: a bolt' : 'An icon on its button after its die, a bundled icon or an emoji (optional)', 'Icon');
    ic.addEventListener('input', function() { var v = ic.value.trim().slice(0, 32); if (v) rr.icon = v; else delete rr.icon; ch(); });
    row.appendChild(ic); if (typeof glyphButton === 'function') row.appendChild(glyphButton(ic));
    if (typeof rollStationBox === 'function') { var rsL = rollStationBox(rr); if (rsL) row.appendChild(rsL); }   // 1.6.0
    if (!isApply && typeof needsGmBox === 'function') row.appendChild(needsGmBox(rr));   // 1.6.0
    if (isApply) { if (typeof rollJobBox === 'function') { var jbA = rollJobBox(rr, sp, ch, true); if (jbA) row.appendChild(jbA); } return; }   // 1.6.2 (the CORE session): an action may be a job too
    var s = el('select', 'sys-rlfig'); s.title = 'A figure in a small box at the end of its button. Its figure: a check shows what it rolls against, any other roll its dice with the row\u2019s names worked out. A column shows that column on the row';
    var cur = typeof rr.show === 'string' ? rr.show : '', opts = [['', 'Shows no figure'], ['@fig', 'Shows its figure']];
    (Array.isArray(sp.cols) ? sp.cols : []).forEach(function(cc) { if (cc && typeof cc.key === 'string' && cc.key) opts.push([cc.key, 'Shows ' + (cc.label || cc.key)]); });
    var figAll = function() { var hit = false; s.textContent = ''; opts.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (!hit && o[0].toLowerCase() === cur.toLowerCase()) { op.selected = true; hit = true; } s.appendChild(op); }); if (cur && !hit) { var ox = el('option', null, 'Shows ' + cur + ' (not on this list)'); ox.value = cur; ox.selected = true; s.appendChild(ox); } };
    if (opts.length <= 40) figAll();
    else { var figO = el('option', null, cur || 'Shows no figure'); figO.value = cur; figO.selected = true; s.appendChild(figO); var figOn = function() { if (!figAll) return; var fa = figAll; figAll = null; fa(); }; s.addEventListener('pointerdown', figOn); s.addEventListener('focus', figOn); }   // 1.6.2: a long list holds its choices until it is pressed
    s.addEventListener('change', function(e) { e.stopPropagation(); if (s.value) rr.show = s.value; else delete rr.show; ch(); });
    row.appendChild(s);
    if (typeof rollJobBox === 'function') { var jbB = rollJobBox(rr, sp, ch); if (jbB) row.appendChild(jbB); }   // 1.6.0
    if (sp && sp.lvl && typeof sp.lvl === 'object') { var akL = checkLabel('sys-rlasklvl', rr.askLvl === true, 'Asks the level', 'Pressed, it asks which level to run at, from the list\u2019s lowest to the row\u2019s own, and the roll reads that level. A spell of level 3 cast at level 1'), akC = akL.firstChild; akC.addEventListener('change', function(e) { e.stopPropagation(); if (akC.checked) rr.askLvl = true; else delete rr.askLvl; ch(); }); row.appendChild(akL); }   // 1.6.0, backlog 180 R12
}
// 1.6.0: a job counted across turns on a list roll: how many turns, the counter it counts on, and whether a stop keeps its progress. Only where the list has a counter
function rollJobBox(rr, sp, ch, isApply) {
    var cts = sp && Array.isArray(sp.counters) ? sp.counters.filter(function(t) { return t && typeof t.key === 'string' && t.key; }) : [], jb = rr.job && typeof rr.job === 'object' ? rr.job : null; if (!cts.length && !jb) return null;
    var w = el('span', 'sys-rljob'), put = function() { if (!tI.value.trim() && !cS.value) { delete rr.job; return; } var j = rr.job && typeof rr.job === 'object' ? rr.job : (rr.job = {}); j.turns = tI.value.slice(0, LIMITS.formula); j.ct = cS.value; ch(); };
    var tI = input('sys-rljobturns field', jb && typeof jb.turns === 'string' ? jb.turns : '', isApply ? 'A job of this many turns, a formula with no dice of the row\u2019s names: each press adds one, and its changes are made at the last press. Empty: made at once' : 'A job of this many turns, a formula with no dice of the row\u2019s names: each press adds one, and the roll is made at the last press. Empty: rolled at once', 'Job, in turns'); tI.maxLength = LIMITS.formula;
    var cS = el('select', 'sys-rljobct'); cS.title = 'The counter of this list that keeps the job\u2019s count'; [['', 'Counted on\u2026']].concat(cts.map(function(t) { return [t.key, t.label || t.key]; })).forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (jb && jb.ct === o[0]) op.selected = true; cS.appendChild(op); });
    var kL = checkLabel('sys-rljobkeep', !!jb && jb.keep === true, 'Keeps progress', 'A stop keeps the count. Off: a turn that ends with no press sets it back to 0, a lost action among them'), kC = kL.firstChild;
    tI.addEventListener('input', function(e) { e.stopPropagation(); put(); }); cS.addEventListener('change', function(e) { e.stopPropagation(); put(); });
    if (kC && kC.addEventListener) kC.addEventListener('change', function(e) { e.stopPropagation(); if (rr.job && typeof rr.job === 'object') { if (kC.checked) rr.job.keep = true; else delete rr.job.keep; ch(); } });
    var nL = checkLabel('sys-rljobnow', !!jb && jb.now === true, 'At once out of a fight', isApply ? 'Out of a fight its first press is its last, and its changes are made then. In a fight it still takes one press a turn' : 'Out of a fight its first press is its last, and its roll is made then. In a fight it still takes one press a turn'), nC = nL.firstChild;   // 1.6.2 (the CORE session)
    if (nC && nC.addEventListener) nC.addEventListener('change', function(e) { e.stopPropagation(); if (rr.job && typeof rr.job === 'object') { if (nC.checked) rr.job.now = true; else delete rr.job.now; ch(); } });
    w.appendChild(tI); w.appendChild(cS); w.appendChild(kL); w.appendChild(nL); return w;
}
// [systemcheck:rowswitchbox-end]
// [systemcheck:partcaps-start]
// 205 (5) (the core handbook session's parts brief, 2026-10-29): the Lists tab's Holds by kind box, edited in place on the list's draft parts, with
// its own listeners and class names no handler of the Lists tab reads (sys-pcap-*). A line a cap: the categories it counts, with commas between
// them, and the number stat of this list whose figure caps them; PART_CAPS lines at most. Save keeps a line only once both are set. The core
// handbook session's ask 4 (2026-10-29): where the parts' list has a choice stat (a pick, or a number with value names), a line may count by it
// in place of categories (Counts: the parts whose slot reads one value), its value picked from the stat's own
// 1.6.2 (body fold 4): the boxes a list's tiles offer, each a line. Its key is made once and never shown, so that a name may change
function tileBoxesBox(sp) {
    var box = el('div', 'sys-badges sys-tboxes'), ch = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var draw = function() {
        box.textContent = ''; box.appendChild(el('span', 'sys-num-cap', 'Boxes on a tile')); var list = sp.tiles && Array.isArray(sp.tiles.boxes) ? sp.tiles.boxes : [];
        list.forEach(function(b0, j) {
            var b = b0 && typeof b0 === 'object' ? b0 : {}, rw = el('div', 'sys-flags sys-tbox-row'), txt = function(cls, ph, k, tip) { var i = el('input', 'field ' + cls); i.type = 'text'; i.value = typeof b[k] === 'string' ? b[k] : ''; i.placeholder = ph; i.title = tip; i.spellcheck = false; i.autocomplete = 'off'; i.addEventListener('input', function() { var v = i.value.trim(); if (v) list[j][k] = v; else delete list[j][k]; ch(); }); rw.appendChild(i); };
            txt('sys-tbox-label', 'Its name', 'label', 'What the box is called, such as Held'); txt('sys-tbox-if', 'always', 'if', 'When a tile shows this box. A lost hand shows none'); txt('sys-tbox-taken', 'never', 'taken', 'When the box is tied up with no row in it, as a hand holding someone in a grapple'); if (b.taken) txt('sys-tbox-says', 'Taken', 'takenSays', 'What a box that is tied up says');
            var st = el('label', 'sys-check'), sc = el('input'); sc.type = 'checkbox'; sc.checked = b.strip === true; sc.addEventListener('change', function() { if (sc.checked) list[j].strip = true; else delete list[j].strip; ch(); }); st.appendChild(sc); st.appendChild(document.createTextNode(' In the strip')); st.title = 'A box of its own under the figure that is no part of the body, so nothing there can be hit, such as Stowed'; rw.appendChild(st);
            var x = el('button', 'tool ghost sys-btn', '\u00d7'); x.type = 'button'; x.title = 'Remove this box'; x.addEventListener('click', function() { list.splice(j, 1); if (!list.length && sp.tiles) { delete sp.tiles.boxes; if (!Object.keys(sp.tiles).length) delete sp.tiles; } ch(); draw(); }); rw.appendChild(x); box.appendChild(rw);
        });
        var add = el('button', 'tool ghost sys-btn', '+ Box'); add.type = 'button'; add.title = 'A place a tile offers beyond its own face'; add.disabled = list.length >= 8; add.addEventListener('click', function() { sp.tiles = sp.tiles && typeof sp.tiles === 'object' ? sp.tiles : {}; sp.tiles.boxes = Array.isArray(sp.tiles.boxes) ? sp.tiles.boxes : []; var n = 1; while (sp.tiles.boxes.some(function(b) { return b && b.key === 'box' + n; })) n++; sp.tiles.boxes.push({ key: 'box' + n, label: 'Box ' + n }); ch(); draw(); }); box.appendChild(add);
    };
    draw(); return box;
}
// 1.6.2 (body fold 8): the states of a tile, and what one does to what stands there. Each draws itself, with listeners of its own and classes no handler of the Lists tab reads
function tileStatesBox(sp) {
    var box = el('div', 'sys-badges sys-tstates'), ch = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var draw = function() {
        box.textContent = ''; box.appendChild(el('span', 'sys-num-cap', 'States of a tile')); var list = sp.tiles && Array.isArray(sp.tiles.states) ? sp.tiles.states : [];
        list.forEach(function(s0, j) {
            var s = s0 && typeof s0 === 'object' ? s0 : {}, rw = el('div', 'sys-flags sys-tstate-row'), txt = function(cls, ph, k, tip) { var i = el('input', 'field ' + cls); i.type = 'text'; i.value = typeof s[k] === 'string' ? s[k] : ''; i.placeholder = ph; i.title = tip; i.spellcheck = false; i.autocomplete = 'off'; i.addEventListener('input', function() { var v = i.value.trim(); if (v) list[j][k] = v; else delete list[j][k]; ch(); }); rw.appendChild(i); };
            txt('sys-tstate-label', 'Its name', 'label', 'What a tile in this state says, such as Severed'); txt('sys-tstate-if', 'When (required)', 'if', 'When a tile is in this state. The first state that holds is the one it shows. It must be filled in: with none no tile is ever in it');
            var lk = el('select', 'field sys-tstate-look'); [['warn', 'Looks hurt'], ['bad', 'Looks broken'], ['lost', 'Looks out of play']].forEach(function(p) { var o = el('option', null, p[1]); o.value = p[0]; if ((s.shape || 'warn') === p[0]) o.selected = true; lk.appendChild(o); }); lk.title = 'How the tile is drawn beside its words'; lk.addEventListener('change', function() { list[j].shape = lk.value; ch(); }); rw.appendChild(lk);
            if (sp.hang === true) { var fl = el('label', 'sys-check'), fc = el('input'); fc.type = 'checkbox'; fc.checked = s.follows === true; fc.addEventListener('change', function() { if (fc.checked) list[j].follows = true; else delete list[j].follows; ch(); }); fl.appendChild(fc); fl.appendChild(document.createTextNode(' What hangs from it too')); fl.title = 'A tile that hangs from this one is in this state too, so a lost arm takes its hand with it'; rw.appendChild(fl); }
            var x = el('button', 'tool ghost sys-btn', '\u00d7'); x.type = 'button'; x.title = 'Remove this state'; x.addEventListener('click', function() { list.splice(j, 1); if (!list.length && sp.tiles) { delete sp.tiles.states; if (!Object.keys(sp.tiles).length) delete sp.tiles; } ch(); draw(); }); rw.appendChild(x); box.appendChild(rw);
        });
        var add = el('button', 'tool ghost sys-btn', '+ State'); add.type = 'button'; add.title = 'A state a tile can be in, such as Crippled or Severed'; add.disabled = list.length >= 8; add.addEventListener('click', function() { sp.tiles = sp.tiles && typeof sp.tiles === 'object' ? sp.tiles : {}; sp.tiles.states = Array.isArray(sp.tiles.states) ? sp.tiles.states : []; var n = 1; while (sp.tiles.states.some(function(b) { return b && b.key === 'state' + n; })) n++; sp.tiles.states.push({ key: 'state' + n, label: 'State ' + n }); ch(); draw(); }); box.appendChild(add);
    };
    draw(); return box;
}
function standThenBox(sd, tf, sp) {
    var tl = tf && tf.list && tf.list.tiles ? tf.list.tiles : {}, sts = Array.isArray(tl.states) ? tl.states.filter(function(s) { return !!s && typeof s.key === 'string'; }) : [], bxs = Array.isArray(tl.boxes) ? tl.boxes.filter(function(b) { return !!b && b.strip === true && typeof b.key === 'string'; }) : [], nums = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return !!s && typeof s.key === 'string' && s.key && s.kind !== 'pick' && s.set !== true; });
    if (!sts.length) return null; var box = el('div', 'sys-badges sys-sthen'), ch = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var sel = function(cls, tip, val, opts, on) { var s = el('select', 'field ' + cls); s.title = tip; opts.forEach(function(p) { var o = el('option', null, p[1]); o.value = p[0]; if (val === p[0]) o.selected = true; s.appendChild(o); }); s.addEventListener('change', function() { on(s.value); }); return s; };
    var kind = function(t) { return t.does === 'drops' ? 'drops' : t.does === 'changes' && Array.isArray(t.apply) && t.apply[0] ? (t.apply[0].off === true ? 'off' : 'set') : 'stays'; };
    var draw = function() {
        box.textContent = ''; box.appendChild(el('span', 'sys-num-cap', 'When its place changes state')); var list = Array.isArray(sd.then) ? sd.then : [];
        list.forEach(function(t0, j) {
            var t = t0 && typeof t0 === 'object' ? t0 : {}, rw = el('div', 'sys-flags sys-sthen-row'), k = kind(t);
            rw.appendChild(sel('sys-sthen-state', 'Which state of the place', t.state, sts.map(function(s) { return [s.key, s.label || s.key]; }), function(v) { list[j].state = v; ch(); }));
            var i = el('input', 'field sys-sthen-if'); i.type = 'text'; i.value = typeof t['if'] === 'string' ? t['if'] : ''; i.placeholder = 'always'; i.title = 'Which rows this is for. The first line that holds speaks for a row'; i.spellcheck = false; i.autocomplete = 'off'; i.addEventListener('input', function() { var v = i.value.trim(); if (v) list[j]['if'] = v; else delete list[j]['if']; ch(); }); rw.appendChild(i);
            var ways = [['stays', 'It stays'], ['off', 'It is switched off']]; if (bxs.length) ways.push(['drops', 'It goes to']); if (nums.length) ways.push(['set', 'Its stat is set']);
            rw.appendChild(sel('sys-sthen-does', 'What happens to a row that stands there', k, ways, function(v) { var r = list[j]; delete r.to; delete r.apply; r.does = v === 'drops' ? 'drops' : v === 'stays' ? 'stays' : 'changes'; if (v === 'drops') r.to = bxs[0].key; if (v === 'off') r.apply = [{ off: true }]; if (v === 'set') r.apply = [{ s: nums[0].key, formula: '1', set: true }]; ch(); draw(); }));
            if (k === 'drops') rw.appendChild(sel('sys-sthen-to', 'The box of the strip it goes to', t.to, bxs.map(function(b) { return [b.key, b.label || b.key]; }), function(v) { list[j].to = v; ch(); }));
            if (k === 'set') { var c0 = t.apply[0]; rw.appendChild(sel('sys-sthen-stat', 'The stat that is set', c0.s, nums.map(function(s) { return [s.key, s.label || s.key]; }), function(v) { c0.s = v; ch(); })); var nb = el('input', 'field sys-sthen-num'); nb.type = 'number'; nb.value = String(Number(c0.formula) || 0); nb.title = 'What it is set to'; nb.addEventListener('input', function() { c0.formula = String(Number(nb.value) || 0); ch(); }); rw.appendChild(nb); }
            var x = el('button', 'tool ghost sys-btn', '\u00d7'); x.type = 'button'; x.title = 'Remove this line'; x.addEventListener('click', function() { list.splice(j, 1); if (!list.length) delete sd.then; ch(); draw(); }); rw.appendChild(x); box.appendChild(rw);
        });
        var add = el('button', 'tool ghost sys-btn', '+ When'); add.type = 'button'; add.title = 'What a state of its place does to a row, such as dropping what a lost hand held'; add.disabled = list.length >= 8; add.addEventListener('click', function() { sd.then = Array.isArray(sd.then) ? sd.then : []; sd.then.push({ state: sts[0].key, does: 'stays' }); ch(); draw(); }); box.appendChild(add);
    };
    draw(); return box;
}
// 1.6.2 (G6): the terms on which a row of the character's own offers a roll a bonus under its own name. Its own listeners, and classes no handler of the Lists tab reads
function ownSwBox(sp) {
    var box = el('div', 'sys-flags sys-ownsw'), n = numInput('sys-ownsw-v', sp.ownSw && typeof sp.ownSw.v === 'number' ? sp.ownSw.v : '', 'What each row a player made adds to any roll, ticked in the roll\u2019s \u00b1 window under the row\u2019s own name. Empty: none. Whole, 1 to 99 either way', ''), ch = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var pays = [['', 'It costs nothing']].concat((Array.isArray(draft.rolls) ? draft.rolls : []).filter(function(r) { return !!r && Array.isArray(r.apply) && typeof r.id === 'string'; }).map(function(r) { return [r.id, 'Costs: ' + (r.label || 'Apply')]; })), p = select('sys-ownsw-pay', pays, sp.ownSw && sp.ownSw.pay || '', 'What ticking it spends: one of the system\u2019s actions, run as the roll is made');
    var keep = function() { var v = Math.round(parseFloat(n.value)); if (!isFinite(v) || !v) { delete sp.ownSw; ch(); return; } sp.ownSw = { v: v }; if (p.value) sp.ownSw.pay = p.value; ch(); };
    n.addEventListener('input', keep); p.addEventListener('change', keep); var cap = el('label', 'sys-check'); cap.appendChild(document.createTextNode('Rows of their own add ')); cap.appendChild(n); box.appendChild(cap); box.appendChild(p); return box;
}
// 1.6.2: what a trade does to a row of this list, and the roll it calls for. Its own listeners, and classes no handler of the Lists tab reads
function tradeRulesBox(sp) {
    var box = el('div', 'sys-badges sys-traderules'), ch = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); }, nums = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return !!s && typeof s.key === 'string' && s.key && s.kind !== 'pick' && s.set !== true; }).map(function(s) { return [s.key, s.label || s.key]; });
    var draw = function() {
        box.textContent = ''; box.appendChild(el('span', 'sys-num-cap', 'When traded')); var list = Array.isArray(sp.onTrade) ? sp.onTrade : [];
        list.forEach(function(t, j) {
            // 1.6.3 (Fulllion's rulings of 2026-11-20): moves to needs a stat to move to, another number stat of this list. It is offered only where the list
            // has one (a line already stored as moves to keeps it), its list never holds the line's own stat, and a target that is empty or gone shows as Pick a
            // stat, never as a stat that only looks picked. What Save drops of a line is said under the list, as a fault of the System editor
            var rw = el('div', 'sys-flags sys-tradeline'), how = typeof t.to === 'string' ? 'to' : typeof t.v === 'number' ? 'v' : 'clear', others = nums.filter(function(n) { return n[0] !== t.s; }), s = select('sys-trade-s', nums, t.s, 'The stat of the row'), hows = [['clear', 'is cleared'], ['v', 'is set to']]; if (others.length || how === 'to') hows.push(['to', 'moves to']);
            var h = select('sys-trade-how', hows, how, 'What becomes of it as the row changes hands');
            s.addEventListener('change', function() { t.s = s.value; if (typeof t.to === 'string' && t.to === t.s) t.to = (nums.filter(function(n) { return n[0] !== t.s; })[0] || [''])[0]; ch(); draw(); }); h.addEventListener('change', function() { delete t.to; delete t.v; if (h.value === 'to') t.to = (nums.filter(function(n) { return n[0] !== t.s; })[0] || [''])[0]; if (h.value === 'v') t.v = 0; ch(); draw(); }); rw.appendChild(s); rw.appendChild(h);
            if (how === 'v') { var nb = numInput('sys-trade-v', t.v, 'What it is set to', '0'); nb.addEventListener('input', function() { var n = Number(nb.value); t.v = isFinite(n) ? n : 0; ch(); }); rw.appendChild(nb); }
            if (how === 'to') { var toOk = others.some(function(n) { return n[0] === t.to; }), d = select('sys-trade-to', (toOk ? [] : [['', 'Pick a stat']]).concat(others), toOk ? t.to : '', 'The stat its figure moves to. A GM-only stat leaves the next holder unaware of it'); d.addEventListener('change', function() { t.to = d.value; ch(); }); rw.appendChild(d); }
            var x = el('button', 'tool ghost sys-btn', '\u00d7'); x.type = 'button'; x.title = 'Take this off'; x.addEventListener('click', function() { list.splice(j, 1); if (!list.length) delete sp.onTrade; ch(); draw(); }); rw.appendChild(x); box.appendChild(rw);
        });
        if (nums.length) { var ad = el('button', 'tool ghost sys-btn', '+ When traded'); ad.type = 'button'; ad.title = 'What becomes of a stat of a row as it changes hands'; ad.disabled = list.length >= 4; ad.addEventListener('click', function() { sp.onTrade = Array.isArray(sp.onTrade) ? sp.onTrade : []; sp.onTrade.push({ s: nums[0][0] }); ch(); draw(); }); box.appendChild(ad); }
        var rolls = [['', 'No roll']]; (Array.isArray(sp.rolls) ? sp.rolls : []).forEach(function(r, i) { if (r && !Array.isArray(r.apply)) rolls.push([String(i), r.label || 'A roll']); }); if (rolls.length < 2) return;
        var tr = sp.tradeRoll && typeof sp.tradeRoll === 'object' ? sp.tradeRoll : null, rs = select('sys-trade-roll', rolls, tr ? String(tr.i) : '', 'A roll of this list made for you alone when a row of it changes hands, once both sides confirm. It changes nothing of the trade'); rs.addEventListener('change', function() { if (rs.value === '') delete sp.tradeRoll; else sp.tradeRoll = Object.assign({}, sp.tradeRoll || {}, { i: Number(rs.value) }); ch(); draw(); }); box.appendChild(rs);
        if (tr) { var ti = input('sys-trade-if field', typeof tr['if'] === 'string' ? tr['if'] : '', 'Which rows call for it', 'Every row'); ti.addEventListener('input', function() { var v = ti.value.trim(); if (v) tr['if'] = v.slice(0, LIMITS.formula); else delete tr['if']; ch(); }); box.appendChild(ti); }
    };
    draw(); return box;
}
function partCapsBox(sp) {
    var box = el('div', 'sys-badges sys-pcaps'), max = typeof PART_CAPS === 'number' ? PART_CAPS : 240, ch = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var nums = function() { return (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.kind !== 'pick' && s.set !== true; }); };
    var vals = function(s) { return s.kind === 'pick' ? (Array.isArray(s.opts) ? s.opts.map(function(o) { return o && typeof o === 'object' ? o.label : ''; }) : []).filter(function(x) { return typeof x === 'string' && x; }) : (Array.isArray(s.labels) ? s.labels : []).filter(function(x) { return typeof x === 'string' && x; }); };
    var slots = function() { var fs0 = typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields : [], srcIds = sp.parts ? [sp.parts.from].concat(Array.isArray(sp.parts.also) ? sp.parts.also : []) : [], st = []; fs0.forEach(function(f) { if (f && f.kind === 'item-list' && srcIds.indexOf(f.id) >= 0 && f.list && Array.isArray(f.list.stats)) f.list.stats.forEach(function(s) { if (s && !st.some(function(x) { return x && x.key === s.key; })) st.push(s); }); });   // 1.6.2: the stats of every list the parts come from
        return st.filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.set !== true && vals(s).length > 0; }); };
    var draw = function() {
        box.textContent = ''; box.appendChild(el('span', 'sys-num-cap', 'Holds by kind'));
        var list = sp.parts && Array.isArray(sp.parts.caps) ? sp.parts.caps : [];
        list.forEach(function(k0, j) {
            var k = k0 && typeof k0 === 'object' ? k0 : {}, rw = el('div', 'sys-flags sys-pcap-row'), set = function(key, v) { if (!sp.parts || !Array.isArray(sp.parts.caps) || !sp.parts.caps[j]) return; sp.parts.caps[j][key] = v; ch(); };
            var sls = slots(), slCur = typeof k.slot === 'string' ? k.slot.toLowerCase() : '', slSt = null, lead = [];
            if (sls.length || slCur) {   // ask 4: Counts by category, or by a choice stat of the parts
                var sS = el('select', 'sys-pcap-slot'); sS.title = 'Count the parts by their category, or by a choice stat of the parts, such as their Slot';
                var oc = el('option', null, 'Counts parts by category'); oc.value = ''; sS.appendChild(oc);
                sls.forEach(function(s) { var o = el('option', null, 'Counts parts by their ' + (s.label || s.key)); o.value = s.key; if (slCur && !slSt && s.key.toLowerCase() === slCur) { o.selected = true; slSt = s; } sS.appendChild(o); });
                if (slCur && !slSt) { var oxs = el('option', null, k.slot + ' (not a choice stat of the parts)'); oxs.value = k.slot; oxs.selected = true; sS.appendChild(oxs); }
                sS.addEventListener('change', function(e) { e.stopPropagation(); if (!sp.parts || !Array.isArray(sp.parts.caps) || !sp.parts.caps[j]) return; var cj = sp.parts.caps[j]; if (sS.value) { cj.slot = sS.value; cj.is = ''; delete cj.cats; } else { delete cj.slot; delete cj.is; cj.cats = []; } ch(); draw(); });
                lead.push(sS);
            }
            var cI, isMore = [];
            if (slCur) {
                var isOf = function(w) { return Array.isArray(w) ? w.slice() : [typeof w === 'string' ? w : '']; }, isL = isOf(k.is);   // 1.6.2: a line may count parts of any of several values
                isL.forEach(function(iv, ii) {
                    var iS = el('select', 'sys-pcap-is'); iS.title = ii ? 'A further value this line counts. Pick the first choice to take it away' : 'The value of that stat this line counts, such as Arm'; var isCur = typeof iv === 'string' ? iv.toLowerCase() : '', isHit = false;
                    var oi0 = el('option', null, ii ? 'or\u2026' : 'that read\u2026'); oi0.value = ''; iS.appendChild(oi0);
                    (slSt ? vals(slSt) : []).forEach(function(v) { var o = el('option', null, (ii ? 'or ' : 'that read ') + v); o.value = v; if (!isHit && isCur && v.toLowerCase() === isCur) { o.selected = true; isHit = true; } iS.appendChild(o); });
                    if (isCur && !isHit) { var oxi = el('option', null, iv + ' (not one of its values)'); oxi.value = iv; oxi.selected = true; iS.appendChild(oxi); }
                    iS.addEventListener('change', function(e) { e.stopPropagation(); if (!sp.parts || !Array.isArray(sp.parts.caps) || !sp.parts.caps[j]) return; var nl = isOf(sp.parts.caps[j].is), was = nl.length; if (iS.value || nl.length === 1) nl[ii] = iS.value; else nl.splice(ii, 1); set('is', nl.length > 1 ? nl : nl[0]); if (nl.length !== was) draw(); });
                    if (!ii) cI = iS; else isMore.push(iS);
                });
                if (isL.length < (typeof PART_IS === 'number' ? PART_IS : 240)) { var isO = el('button', 'tool ghost sys-btn sys-pcap-or', '+ Or'); isO.type = 'button'; isO.title = 'Count parts of another value on this line too, such as one integrated, overlay or underlay part'; isO.addEventListener('click', function(e) { e.stopPropagation(); if (!sp.parts || !Array.isArray(sp.parts.caps) || !sp.parts.caps[j]) return; var nw = isOf(sp.parts.caps[j].is); if (!nw[nw.length - 1]) return; sp.parts.caps[j].is = nw.concat(['']); ch(); draw(); }); isMore.push(isO); }
            } else {
            cI = input('sys-pcap-cats field', Array.isArray(k.cats) ? k.cats.join(', ') : '', 'The categories of parts this line counts, with commas between them, such as Arm', 'Arm, Leg'); cI.maxLength = LIMITS.text;
            cI.addEventListener('input', function(e) { e.stopPropagation(); set('cats', String(cI.value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean)); });
            cI.addEventListener('change', function(e) { e.stopPropagation(); });
            }
            var fI = input('sys-pcap-f field', typeof k.f === 'string' ? k.f : '', 'Or a formula that says how many, read on the row: its own names as Row.*, such as Row.parts.max.Slots, and the character\u2019s. It takes the place of the stat. Where it gives no number there is no limit', 'or a formula'); fI.maxLength = LIMITS.formula;
            fI.addEventListener('input', function(e) { e.stopPropagation(); var fv = String(fI.value || '').trim(); if (!sp.parts || !Array.isArray(sp.parts.caps) || !sp.parts.caps[j]) return; if (fv) sp.parts.caps[j].f = fv; else delete sp.parts.caps[j].f; ch(); });
            fI.addEventListener('change', function(e) { e.stopPropagation(); });
            var ifI = input('sys-pcap-if field', typeof k['if'] === 'string' ? k['if'] : '', 'Only where this formula holds, read on the row as the figure is, does the line count. Elsewhere it holds no limit and the sheet says nothing of it. One that cannot be worked out does not hold', 'only where'); ifI.maxLength = LIMITS.formula;
            ifI.addEventListener('input', function(e) { e.stopPropagation(); var fv = String(ifI.value || '').trim(); if (!sp.parts || !Array.isArray(sp.parts.caps) || !sp.parts.caps[j]) return; if (fv) sp.parts.caps[j]['if'] = fv; else delete sp.parts.caps[j]['if']; ch(); });
            ifI.addEventListener('change', function(e) { e.stopPropagation(); });
            var lbI = input('sys-pcap-label field', typeof k.label === 'string' ? k.label : '', 'A short name for this line, which the sheet and a refusal use in place of the list of what it counts', 'short name'); lbI.maxLength = LIMITS.label;
            lbI.addEventListener('input', function(e) { e.stopPropagation(); var lv = String(lbI.value || '').trim(); if (!sp.parts || !Array.isArray(sp.parts.caps) || !sp.parts.caps[j]) return; if (lv) sp.parts.caps[j].label = lv; else delete sp.parts.caps[j].label; ch(); });
            lbI.addEventListener('change', function(e) { e.stopPropagation(); });
            var bS = el('select', 'sys-pcap-by'), cur = typeof k.by === 'string' ? k.by.toLowerCase() : '', hit = false; bS.title = 'A row holds as many parts of those categories as its figure in this stat reads';
            var o0 = el('option', null, 'as many as the row\u2019s\u2026'); o0.value = ''; bS.appendChild(o0);
            nums().forEach(function(s) { var o = el('option', null, 'as many as the row\u2019s ' + (s.label || s.key)); o.value = s.key; if (!hit && cur && s.key.toLowerCase() === cur) { o.selected = true; hit = true; } bS.appendChild(o); });
            if (cur && !hit) { var ox = el('option', null, k.by + ' (not a number stat of this list)'); ox.value = k.by; ox.selected = true; bS.appendChild(ox); }
            bS.addEventListener('change', function(e) { e.stopPropagation(); set('by', bS.value); });
            var x = el('button', 'tool ghost sys-btn sys-pcap-del', '\u00d7'); x.type = 'button'; x.title = 'Remove this line';
            x.addEventListener('click', function(e) { e.stopPropagation(); if (!sp.parts || !Array.isArray(sp.parts.caps)) return; sp.parts.caps.splice(j, 1); if (!sp.parts.caps.length) delete sp.parts.caps; ch(); draw(); });
            lead.concat([cI], isMore, [bS, fI, ifI, lbI, x]).forEach(function(n) { rw.appendChild(n); }); box.appendChild(rw);
        });
        var ad = el('button', 'tool ghost sys-btn sys-pcap-add', '+ Kind'); ad.type = 'button'; ad.disabled = list.length >= max; ad.title = ad.disabled ? 'At most ' + max + ' kinds a list' : 'Cap how many parts of some categories a row holds, such as 2 arms, by one of its own stats';
        ad.addEventListener('click', function(e) { e.stopPropagation(); if (!sp.parts) return; if (!Array.isArray(sp.parts.caps)) sp.parts.caps = []; if (sp.parts.caps.length >= max) return; var n0 = nums()[0]; sp.parts.caps.push({ cats: [], by: n0 ? n0.key : '' }); ch(); draw(); var ins = box.querySelectorAll('.sys-pcap-cats'); if (ins.length) ins[ins.length - 1].focus(); }); box.appendChild(ad);   // 1.6.3: a new line starts on the list's first number stat, its How many
    };
    draw();
    return box;
}
// 1.6.2: further rules of Fits where, each with its own words, so that one sentence need not cover three refusals. A part must meet them all, and the first that fails speaks
// 1.6.3 (Fulllion's rulings of 2026-11-20): a rule's Refused with is required beside its test, so it starts filled with these words as the test is first
// typed (the Lists tab's own Fits where starts with the same words, in sysedtabs.js), and an emptied one is said under the list
var PFIT_WORDS = 'That part does not fit there.';
function partFitsBox(sp) {
    var box = el('div', 'sys-badges sys-pfits'), max = typeof PART_FITS === 'number' ? PART_FITS : 240, ch = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var draw = function() {
        box.textContent = ''; var list = sp.parts && Array.isArray(sp.parts.fitMore) ? sp.parts.fitMore : [];
        list.forEach(function(r0, j) {
            var r = r0 && typeof r0 === 'object' ? r0 : {}, rw = el('div', 'sys-flags sys-pfit-row'), set = function(key, v) { if (!sp.parts || !Array.isArray(sp.parts.fitMore) || !sp.parts.fitMore[j]) return; if (v) sp.parts.fitMore[j][key] = v; else delete sp.parts.fitMore[j][key]; ch(); };
            var iI = input('sys-pfit-if field', typeof r['if'] === 'string' ? r['if'] : '', 'Another formula a part must meet, read as Fits where is', 'and fits where'); iI.maxLength = LIMITS.formula;
            iI.addEventListener('input', function(e) { e.stopPropagation(); var rj = sp.parts && Array.isArray(sp.parts.fitMore) ? sp.parts.fitMore[j] : null, was = !!(rj && typeof rj['if'] === 'string' && rj['if'].trim()), v = String(iI.value || '').trim(), sv = rj && typeof rj.says === 'string' ? rj.says : '';
                if (rj && v && !was && !sv.trim()) { rj.says = PFIT_WORDS; sI.value = PFIT_WORDS; } else if (rj && !v && sv === PFIT_WORDS) { delete rj.says; sI.value = ''; }   // 1.6.3: its Refused with starts filled, and goes with the test it was filled for
                set('if', v); }); iI.addEventListener('change', function(e) { e.stopPropagation(); });
            var sI = input('sys-pfit-says field', typeof r.says === 'string' ? r.says : '', 'The words a player is told when this rule stops a part. It must be filled in while the rule has a test', 'Refused with'); sI.maxLength = LIMITS.needsWords;
            sI.addEventListener('input', function(e) { e.stopPropagation(); set('says', String(sI.value || '').trim()); }); sI.addEventListener('change', function(e) { e.stopPropagation(); });
            var x = el('button', 'tool ghost sys-btn sys-pfit-del', '\u00d7'); x.type = 'button'; x.title = 'Remove this rule';
            x.addEventListener('click', function(e) { e.stopPropagation(); if (!sp.parts || !Array.isArray(sp.parts.fitMore)) return; sp.parts.fitMore.splice(j, 1); if (!sp.parts.fitMore.length) delete sp.parts.fitMore; ch(); draw(); });
            [iI, sI, x].forEach(function(n) { rw.appendChild(n); }); box.appendChild(rw);
        });
        var ad = el('button', 'tool ghost sys-btn sys-pfit-add', '+ Another rule'); ad.type = 'button'; ad.disabled = list.length >= max; ad.title = ad.disabled ? 'At most ' + max + ' more rules a list' : 'Another rule a part must meet, with words of its own for the player it stops';
        ad.addEventListener('click', function(e) { e.stopPropagation(); if (!sp.parts) return; if (!Array.isArray(sp.parts.fitMore)) sp.parts.fitMore = []; if (sp.parts.fitMore.length >= max) return; sp.parts.fitMore.push({ 'if': '' }); ch(); draw(); var ins = box.querySelectorAll('.sys-pfit-if'); if (ins.length) ins[ins.length - 1].focus(); }); box.appendChild(ad);
    };
    draw();
    return box;
}
// [systemcheck:partcaps-end]
// [systemcheck:startsbox-start]
// 1.6.0 Starts with: the Lists tab's box beside the list, edited in place on the list's draft, with its own listeners and class names no handler
// of the Lists tab reads (sys-start-*). A line an entry: its name, how many (not on a list with no quantity) and \u00d7. The picker below offers the
// system's items and the library, as a grant's, those of the list's categories, each once. startsSay says what Save does with it
function startsBox(f) {
    var box = el('div', 'sys-badges sys-starts'), ch = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var sp = function() { return f.list && typeof f.list === 'object' ? f.list : {}; }, rows = function() { return Array.isArray(sp().starts) ? sp().starts : []; };
    var fits = function(id) { var cs = Array.isArray(sp().cats) ? sp().cats : []; return !cs.length || startCatIn(cs, id); };
    var draw = function() {
        box.textContent = ''; box.appendChild(el('span', 'sys-num-cap', 'Starts with'));
        var list = rows(), held = Object.create(null);
        list.forEach(function(s, i) {
            if (!s || typeof s !== 'object') return; held[s.entry] = 1;
            var rw = el('div', 'sys-flags sys-start-row'); rw.appendChild(el('span', 'sys-start-name', grantName(s.entry) || 'An entry that is not here'));
            if (sp().noQty !== true) { var q = numField('sys-start-qty', typeof s.qty === 'number' ? s.qty : 1, 'How many a new character begins with', 'how many', '1'); q.querySelector('input').addEventListener('input', function(e) { e.stopPropagation(); if (e.target.validity && e.target.validity.badInput) return; if (String(e.target.value).trim() === '') delete s.qty; else s.qty = Number(e.target.value); ch(); }); rw.appendChild(q); }
            var x = el('button', 'tool ghost sys-btn sys-start-del', '\u00d7'); x.type = 'button'; x.title = 'A new character no longer begins with this';
            x.addEventListener('click', function(e) { e.stopPropagation(); list.splice(i, 1); if (!list.length) delete sp().starts; ch(); draw(); }); rw.appendChild(x);
            box.appendChild(rw);
        });
        var full = list.length >= START_MAX, ad = select('sys-start-add', [['', '+ Starts with\u2026']].concat(grantEntries().filter(function(o) { return !held[o[0]] && fits(o[0]); })), '', full ? 'At most ' + START_MAX + ' entries a list' : 'Pick an entry every new character begins holding on this list, free. It takes the list\u2019s level and its switch, and a character that already exists is not changed');
        ad.disabled = full || ad.options.length < 2;
        ad.addEventListener('change', function(e) { e.stopPropagation(); var v = ad.value; if (!v) return; if (!f.list || typeof f.list !== 'object') f.list = {}; if (!Array.isArray(f.list.starts)) f.list.starts = []; f.list.starts.push({ entry: v, qty: 1 }); ch(); draw(); });
        box.appendChild(ad);
    };
    draw();
    return box;
}
function startCatIn(cats, id) {
    var it = (draft.items || []).find(function(x) { return x && x.id === id; }), LBc = window.wpLibrary, e = it || (LBc && typeof LBc.entry === 'function' ? LBc.entry(id) : null), cg = e && typeof e.category === 'string' ? e.category.trim().toLowerCase() : '';
    return !!cg && cats.some(function(x) { return String(x).trim().toLowerCase() === cg; });
}
// What Save does with a list's Starts with, and what a new character would not get, as the cleaner and startRows read them: words, under the list's card
function startsSay(f) {
    var sp = f && f.list && typeof f.list === 'object' ? f.list : null, out = []; if (!sp || !Array.isArray(sp.starts)) return out;
    var seen = Object.create(null), n = 0, LBw = window.wpLibrary, whole = !!(LBw && typeof LBw.whole === 'function' && LBw.whole() === true), cats = Array.isArray(sp.cats) ? sp.cats : [];
    sp.starts.forEach(function(s, i) {
        var w = 'Starts with, line ' + (i + 1) + ': ';
        if (!s || typeof s !== 'object' || typeof s.entry !== 'string' || !s.entry) { out.push(w + 'it names no entry, so Save drops it.'); return; }
        if (seen[s.entry]) { out.push(w + 'it repeats line ' + seen[s.entry] + ', so Save drops it.'); return; } seen[s.entry] = i + 1;
        if (++n > START_MAX) { out.push(w + 'a list starts with ' + START_MAX + ' at most, so Save drops it.'); return; }
        var q = typeof s.qty === 'number' && isFinite(s.qty) ? Math.round(s.qty) : 1; if (s.qty !== undefined && (q < 1 || q > LIMITS.maxQty || q !== s.qty)) out.push(w + 'how many is a whole number from 1 to ' + LIMITS.maxQty + ', so Save keeps ' + Math.max(1, Math.min(LIMITS.maxQty, q || 1)) + '.');
        var nm = grantName(s.entry);
        if (!nm) { if (whole || !(LBw && typeof LBw.entry === 'function')) out.push(w + 'that entry is gone, so it gives nothing until it is back.'); return; }
        if (cats.length && !startCatIn(cats, s.entry)) out.push(w + nm + ' is outside this list\u2019s categories, so a new character does not get it.');
    });
    if (n && sp.lvl && typeof sp.lvl === 'object') {   // a dry run, on a list with levels alone: what its caps would leave out
        var cl = cleanSystem(draft, { F: F(), gmView: true }), dry = cl ? startRows(cl, { id: 'c_preview', name: 'Preview', values: {} }, F()) : null;
        (dry ? dry.left : []).forEach(function(l) { if (l.f === f.id && (l.why === 'cap' || l.why === 'level')) out.push('Starts with: ' + (grantName(l.entry) || 'an entry') + (l.why === 'cap' ? ' is past this list\u2019s At most' : ' may be none of this list\u2019s levels') + ', so a new character does not get it.'); });
    }
    return out;
}
// [systemcheck:startsbox-end]
// [systemcheck:badgebox-start]
// 1.6.0 R4 and R5 (backlog 180): the Lists tab's Badges box and a value name's tone, each edited in place on the draft object it is handed, with its
// own listeners and class names no handler of the Lists tab reads (sys-badge-*, sys-ltone-*). A badge: its words, Shown where (a formula of the
// row), a tone, Pill or Line, Tints its row, Pulses and a tip; BADGE_MAX at most
var BADGE_TONES = [['', 'Plain'], ['good', 'Good (green)'], ['warn', 'Warning (amber)'], ['danger', 'Danger (red)'], ['accent', 'Accent'], ['primary', 'Primary']];
function badgeSel(cls, opts, cur, tip) { var s = el('select', cls); s.title = tip; opts.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0] === (cur || '')) op.selected = true; s.appendChild(op); }); return s; }
function badgeTick(cls, on, words, tip) { var lb = el('label', 'sys-flag'), cb = el('input', cls); cb.type = 'checkbox'; cb.checked = on === true; lb.title = tip; lb.appendChild(cb); lb.appendChild(document.createTextNode(' ' + words)); return { lb: lb, cb: cb }; }
function badgeBox(sp) {
    var box = el('div', 'sys-badges'), max = typeof BADGE_MAX === 'number' ? BADGE_MAX : 120, ch = function() { markDirty(); if (typeof patchErrors === 'function') patchErrors(); };
    var draw = function() {
        box.textContent = ''; box.appendChild(el('span', 'sys-num-cap', 'Badges'));
        var list = Array.isArray(sp.badges) ? sp.badges : [];
        list.forEach(function(b0, j) {
            var b = b0 && typeof b0 === 'object' ? b0 : {}, rw = el('div', 'sys-flags sys-badge-row'), set = function(k, v) { if (!sp.badges || !sp.badges[j]) return; if (v === '' || v === false) delete sp.badges[j][k]; else sp.badges[j][k] = v; ch(); };
            var wI = input('sys-badge-words field', typeof b.words === 'string' ? b.words : '', 'The words the badge says, such as Jammed. A state is always said in words', 'Words'); wI.maxLength = LIMITS.text;
            wI.addEventListener('input', function() { set('words', wI.value.slice(0, LIMITS.text)); });
            var iI = input('sys-badge-if field', typeof b.if === 'string' ? b.if : '', 'It shows on a row only while this holds, no dice: Row.jam > 0. Row.<name> reads the row, any other name the character', 'Shown where (Row.jam > 0)'); iI.maxLength = LIMITS.formula;
            iI.addEventListener('input', function() { set('if', iI.value.slice(0, LIMITS.formula)); });
            var tS = badgeSel('sys-badge-tone', BADGE_TONES, b.tone, 'Its color. Plain is gray'); tS.addEventListener('change', function(e) { e.stopPropagation(); set('tone', tS.value); });
            var kS = badgeSel('sys-badge-kind', [['', 'Pill'], ['line', 'Line']], b.line === true ? 'line' : '', 'Pill: after the name. Line: a sentence under the row, for a longer warning'); kS.addEventListener('change', function(e) { e.stopPropagation(); set('line', kS.value === 'line'); });
            var tt = badgeTick('sys-badge-tint', b.tint, 'Tints its row', 'The row takes the badge\u2019s color as a tint with an edge while it shows. The first badge that tints wins'); tt.cb.addEventListener('change', function(e) { e.stopPropagation(); set('tint', tt.cb.checked); });
            var pt = badgeTick('sys-badge-pulse', b.pulse, 'Pulses', 'The badge pulses slowly, for a state that needs attention now. It stays still where the computer is set to reduce motion'); pt.cb.addEventListener('change', function(e) { e.stopPropagation(); set('pulse', pt.cb.checked); });
            var pI = input('sys-badge-tip field', typeof b.tip === 'string' ? b.tip : '', 'Words shown when the pointer rests on the badge', 'Tip (optional)'); pI.maxLength = LIMITS.text;
            pI.addEventListener('input', function() { set('tip', pI.value.slice(0, LIMITS.noteText)); });
            var x = el('button', 'tool ghost sys-btn sys-badge-del', '\u00d7'); x.type = 'button'; x.title = 'Remove this badge';
            x.addEventListener('click', function(e) { e.stopPropagation(); if (!Array.isArray(sp.badges)) return; sp.badges.splice(j, 1); if (!sp.badges.length) delete sp.badges; ch(); draw(); });
            [wI, iI, tS, kS, tt.lb, pt.lb, pI, x].forEach(function(n) { rw.appendChild(n); }); box.appendChild(rw);
        });
        var ad = el('button', 'tool ghost sys-btn sys-badge-add', '+ Badge'); ad.type = 'button'; ad.disabled = list.length >= max; ad.title = ad.disabled ? 'At most ' + max + ' badges a list' : 'Words a row shows while a test of the row holds, such as Jammed while the row is jammed';
        ad.addEventListener('click', function(e) { e.stopPropagation(); if (!Array.isArray(sp.badges)) sp.badges = []; if (sp.badges.length >= max) return; sp.badges.push({ words: 'Badge ' + (sp.badges.length + 1), if: '' }); ch(); draw(); var ins = box.querySelectorAll('.sys-badge-words'); if (ins.length) { ins[ins.length - 1].focus(); if (ins[ins.length - 1].select) ins[ins.length - 1].select(); } }); box.appendChild(ad);   // 1.6.3: its words start filled and picked, so typing replaces them. Shown where has no sensible start, and its fault says so at once
    };
    draw();
    return box;
}
function toneRow(obj) {   // R5: a tone beside each value name of a stat or a column, as a field's Colors row
    if (!obj || !Array.isArray(obj.labels) || !obj.labels.some(Boolean)) return null;
    var row = el('div', 'sys-flags sys-ltone-row'); row.appendChild(el('span', 'sys-num-cap', 'Colors'));
    obj.labels.forEach(function(nm, ti) { if (!nm || ti >= LIMITS.labels) return; var lab = el('label', 'sys-ltone-lbl'); lab.appendChild(el('span', null, nm + ' '));
        var s = badgeSel('sys-ltone-sel', BADGE_TONES, Array.isArray(obj.tones) ? obj.tones[ti] : '', 'Its color on a row when the value is ' + nm + '. With a color the row shows the label small, then the name as a badge');
        s.addEventListener('change', function(e) { e.stopPropagation(); var a = Array.isArray(obj.tones) ? obj.tones.slice() : []; while (a.length <= ti) a.push(''); a[ti] = s.value; while (a.length && !a[a.length - 1]) a.pop(); if (a.length) obj.tones = a; else delete obj.tones; markDirty(); if (typeof patchErrors === 'function') patchErrors(); });
        lab.appendChild(s); row.appendChild(lab); });
    return row;
}
// [systemcheck:badgebox-end]
function markDirty() { dirtySet(true); var s = ui('sysSaveBtn'); if (s) s.classList.add('on'); if (_sidePrev && tab !== 'layout') { clearTimeout(_sidePrevT); _sidePrevT = setTimeout(function() { if (_sidePrev && draft) renderPreview(); }, 250); } }   // 1.6.2: the preview beside a tab follows each edit
// 1.6.2 (backlog 59; the owner's pick: "A Preview button on every tab"): the Layout tab's preview, moved beside whatever tab is open while Preview is
// pressed, and back home on the Layout tab, which shows it anyway. Closed whenever the editor opens
var _sidePrevT = 0, _prevHome = null;   // _sidePrev stands beside the editor's state (var draft)
function sidePrevSync() {
    var side = ui('sysSidePrev'), pbox = document.querySelector('#systemModal .sys-layout-preview-box'), mb = document.querySelector('#systemModal .sys-box'); if (!side || !pbox || !mb) return;
    if (!_prevHome) _prevHome = pbox.parentNode;
    var away = _sidePrev && tab !== 'layout';
    if (away) { var tabs = mb.querySelector('.sys-tabs'), foot = mb.querySelector('.sys-foot'); if (pbox.parentNode !== side) side.appendChild(pbox); if (tabs) side.style.top = (tabs.offsetTop + tabs.offsetHeight + 6) + 'px'; if (foot) side.style.bottom = (mb.clientHeight - foot.offsetTop + 6) + 'px'; side.hidden = false; renderPreview(); }
    else { if (pbox.parentNode !== _prevHome) _prevHome.appendChild(pbox); side.hidden = true; }
    mb.classList.toggle('sys-prev-on', away);
    var pb = ui('sysPreviewBtn'); if (pb) { pb.setAttribute('aria-pressed', _sidePrev ? 'true' : 'false'); pb.classList.toggle('on', _sidePrev); }
}
// Stage 6: each stored value of a field the saved system still has, checked against it again (a value past new value names, a lowered max,
// a removed library entry) — what a reload does, at once, so the GM's sheet, their formulas and every player agree. Other ids stay as they are.
// 1.5.8 (book handoff 90): the rows other rows open, kept in step for one character after a change from the table, on the machine that owns the
// campaign: changed, it is saved and its owner told the lists that moved. Answers whether anything changed
function openSyncOne(id) {
    if (typeof openSync !== 'function' || isClient() || typeof id !== 'string') return false;
    var camp = getActiveCampaign(), c = camp ? charById(id, camp) : null; if (!c || !camp.system) return false;
    var oc = openSync(camp.system, c).concat(typeof laySync === 'function' ? laySync(camp.system, c, F(), layKeep(c.id)) : []); if (!oc.length) return false;   // 1.6.2: and the rows Laid from lays
    c.updated = Date.now(); save(true);
    var n = net(), vals = {}; oc.forEach(function(fid) { vals[fid] = c.values[fid]; });
    if (n && n.active && n.role === 'host' && n.syncCharDelta) n.syncCharDelta(c.id, vals);
    return true;
}
function reCleanChars(camp, sys) {
    var vo = valueOpts(sys);
    Object.keys(camp.chars || {}).forEach(function(id) {
        var c = camp.chars[id]; if (!c || !c.values || typeof c.values !== 'object') return;
        Object.keys(c.values).forEach(function(fid) {
            var f = fieldById(sys, fid); if (!f || !STORED[f.kind]) return;
            var v = cleanValue(f, c.values[fid], vo);
            if (JSON.stringify(v) === JSON.stringify(c.values[fid])) return;
            if (v === undefined) delete c.values[fid]; else c.values[fid] = v;
            c.updated = Date.now();
        });
        if (typeof openSync === 'function' && openSync(sys, c).length) c.updated = Date.now();   // 1.5.8: the rows other rows open, as the system now has them
        if (typeof laySync === 'function' && laySync(sys, c, F(), layKeep(c.id)).length) c.updated = Date.now();   // 1.6.2 Laid from, as the system now has it
        if (c.looks !== undefined) { var lkR = cleanLooks(c.looks, c.values, sys); if (JSON.stringify(lkR) !== JSON.stringify(c.looks)) { if (lkR) c.looks = lkR; else delete c.looks; c.updated = Date.now(); } }   // item 35: a look whose field went, is no text now, or whose text changed
    });
}
// Stage 6 F4a: what GM-only items and effects look like to the players who carry them (their inline copies)
// [systemcheck:gmfacing-start]
function gmFacing(sys) {
    if (!sys) return '';
    var visK = Object.create(null); (Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (f && f.kind === 'item-list' && f.vis === 'all' && f.list && Array.isArray(f.list.stats)) f.list.stats.forEach(function(s) { if (s && typeof s.key === 'string') visK[s.key.toLowerCase()] = 1; }); });   // F4c1: the stats of visible lists (ignoring case) — a GM-only list's never reach an owner
    var its = (Array.isArray(sys.items) ? sys.items : []).filter(function(it) { return it && it.vis === 'gm'; }).map(function(it) { var d = cleanRowDef(it, false); if (d && d.stats) { var st = {}; Object.keys(d.stats).forEach(function(k) { if (visK[k.toLowerCase()] === 1) st[k] = d.stats[k]; }); if (Object.keys(st).length) d.stats = st; else delete d.stats; } return [it.id, d]; });
    var fx = (Array.isArray(sys.effects) ? sys.effects : []).filter(function(d) { return d && d.vis === 'gm'; });
    return JSON.stringify([its, fx]);
}
// [systemcheck:gmfacing-end]
// [split:body-end]
return { KIND_HELP: KIND_HELP, KIND_LABEL: KIND_LABEL, altBox: altBox, answersBox: answersBox, badgeBox: badgeBox, bandBox: bandBox, bandWhens: bandWhens, callsBox: callsBox, close: close, defenseOverview: defenseOverview, explainBox: explainBox, fieldOf: fieldOf, formOn: formOn, gmFacing: gmFacing, markDirty: markDirty, open: open, openSyncOne: openSyncOne, ownSwBox: ownSwBox, partCapsBox: partCapsBox, partFitsBox: partFitsBox, reCleanChars: reCleanChars, rollExtras: rollExtras, sidePrevSync: sidePrevSync, standThenBox: standThenBox, startsBox: startsBox, startsSay: startsSay, swWordsBox: swWordsBox, tileBoxesBox: tileBoxesBox, tileStatesBox: tileStatesBox, toneRow: toneRow, tradeRulesBox: tradeRulesBox };   // [split:glue]
}   // [split:glue]
