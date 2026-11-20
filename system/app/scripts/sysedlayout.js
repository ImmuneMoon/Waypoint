/* sysedlayout.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 7, the System editor; split 2026-11-19 with no change in behavior).
   What it holds: the System editor's Layout tab: the sheet's and the HUD's sections, columns and
   placements (renderLayout, its add list and its handlers), a section's Show if notes and its two selects, a list placed once a category
   (the [systemcheck:placecatsui-*] lines), the live preview (renderPreview), and what Arrange is handed (arrHost, arrSet, wireLayoutDrag).
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sysedLayout() at
   its line `// [split:sysedlayout.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (tools/splitcheck.js holds it): the editor's own state (draft, dirty, tab, layoutView and
   the rest) stands in sheets.js and a part sets it through the setters beside `var draft`. Change the code here as if it still stood
   in sheets.js. */
// [split:of sheets.js]
import { BAND_KINDS, F, IDENTITY_KINDS, LEDGER_KINDS, LIMITS, LOOK_PRESETS, PALETTE_KEYS, PAL_CAPS, PIN_GID, _arrChar, applySheetLookTo, arrCharSet, autoLayout, btnRow, buildSections, capBox, catChoices, catHome, catSplits, charById, charList, cleanPlaceCats, cleanSystem, clone, dirty, draft, el, errorCell, errorsById, explainBox, fieldWord, fxLiveSet, getActiveCampaign, glyphButton, headerEdits, hintBox, hudView, input, isClient, layoutView, layoutViewSet, lazySelect, markDirty, open, opt, pageOptions, paletteOf, patchErrors, pinTargetsAll, resolveAll, rollPick, select, sheetLook, showConfirm, startRows, syncFramePad, tab, tabStandIns, toast, tokenCtxFor, ui, uid, validKey, validateSystem } from './sheets.js';   // [split:glue]
export function sysedLayout() {   // [split:glue]
// [split:body-start]
/* ---------- the Layout tab (SB4): sections, columns, placements, a live preview ---------- */
// Stage 6 HUD frame (HF1): the Layout tab edits the sheet's layout or the HUD's (the Sheet | HUD switch). A HUD made by merely looking at
// it is dropped by the cleaner on Save (nothing set).
function layoutRoot() { if (!draft.sheet) draft.sheet = {}; if (layoutView !== 'hud') return draft.sheet; if (!draft.sheet.hud || typeof draft.sheet.hud !== 'object' || Array.isArray(draft.sheet.hud)) draft.sheet.hud = { tabs: [], sections: [] }; return draft.sheet.hud; }
function draftHasHud() { var h = draft && draft.sheet && draft.sheet.hud, ln = function(k) { return !!(h && Array.isArray(h[k]) && h[k].length); }; return !!(h && typeof h === 'object' && (h.title || ln('tabs') || ln('sections') || ln('band') || ln('ledger'))); }   // HF2b: the draft has a HUD with something set
function layoutSections() { var r = layoutRoot(); if (!Array.isArray(r.sections)) r.sections = []; return r.sections; }
function layoutTabs() { var r = layoutRoot(); if (!Array.isArray(r.tabs)) r.tabs = []; return r.tabs; }
function sheetList(key) { return (draft && draft.sheet && Array.isArray(draft.sheet[key])) ? draft.sheet[key].slice() : []; }   // a copy of one of the sheet's id lists (identity / ledger / band), [] when absent
// Stage 6 HUD C8: the validator's own words for one show-if, over the draft as Save reads it (the Layout tab shows them under the box)
// [systemcheck:ifnotes-start] 1.6.0 (found by hand, 2026-10-31: one press on the Layout tab of a large system held the page 67 seconds): what the
// validator says of the show-ifs of the Layout tab is worked out once a draw, for all of them together, never once for each
var _ifNotes = null;
function ifNotesOf() {
    var notes = Object.create(null), texts = [], add = function(t) { var v = typeof t === 'string' ? t.trim() : ''; if (v && !(v in notes)) { notes[v] = ''; texts.push(v); } };
    layoutSections().forEach(function(s) { add(s.showIf); (s.fields || []).forEach(function(p) { if (p) add(p.showIf); }); });
    var clean = texts.length ? cleanSystem(draft, { F: F(), gmView: true }) : null; if (!clean) return notes;
    clean.sheet = { sections: texts.map(function(t, i) { return { id: 's_probe' + i, cols: 1, fields: [], showIf: t }; }) };
    validateSystem(clean, F()).warnings.forEach(function(x) { var m = x.prop === 'showIf' ? /^s_probe(\d+)$/.exec(String(x.id)) : null; if (!m) return; var t = texts[+m[1]]; notes[t] += (notes[t] ? ' ' : '') + x.message; });
    return notes;
}
function showIfNote(text) {
    if (typeof text !== 'string' || !text.trim() || !F()) return '';
    if (!_ifNotes) _ifNotes = ifNotesOf();
    return _ifNotes[text.trim()] || '';
}
// [systemcheck:ifnotes-end]
function placementLabel(pl, byId, rollById) {
    if (pl.id) { var f = byId[pl.id]; return f ? fieldWord(f) : null; }
    if (pl.roll) { var r = rollById[pl.roll]; return r ? rollPick(r) : null; }
    if (pl.kind === 'heading') return 'Heading'; if (pl.kind === 'divider') return 'Divider'; if (pl.kind === 'portrait') return 'Portrait'; if (pl.kind === 'link') return 'Handbook link'; if (pl.kind === 'search') return 'Handbook search'; if (pl.kind === 'text') return 'Rules text'; if (pl.kind === 'roller') return 'Custom roller'; if (pl.kind === 'facing') return 'Facing dial'; if (pl.kind === 'stance') return 'Stance (posture & elevation)'; if (pl.kind === 'pin') return 'Pin button'; if (pl.kind === 'hud') return 'HUD button';
    return null;
}
// [systemcheck:secrow-start]
// 1.5.5: a section's fold. Fixed, Collapsible, or Starts closed: collapsible, and folded when the sheet opens until the reader opens it
function secCollapSel(sec) { return select('sys-sec-collap', [['', 'Fixed'], ['1', 'Collapsible'], ['closed', 'Starts closed']], sec.collapsible ? (sec.open === false ? 'closed' : '1') : '', 'A collapsible section the reader can fold away. Starts closed: folded when the sheet opens, until the reader opens it'); }
// 1.5.5: where a sub-section stands in the section it is under, after that section's own fields or before them; offered only while nested
// as the sheet nests it (buildSections' childParent): its parent a section of this layout that is not itself nested. A parent removed, or
// one itself nested, leaves the section at the top level on the sheet, where its Under list reads Top level and nothing is offered here
function secFirstSel(sec, secs) { var p = sec && sec.parent && Array.isArray(secs) ? secs.find(function(o) { return o && o.id === sec.parent; }) : null; return p && !p.parent ? select('sys-sec-first', [['', 'After its fields'], ['1', 'Before its fields']], sec.first === true ? '1' : '', 'Where this sub-section stands in the section it is under: after that section\u2019s own fields, or before them') : null; }
// 1.5.5: a list whose change draws the Layout tab again keeps the focus: the same list of that section's row, as drawn anew, takes it
// back, so its arrow keys go on stepping through it (a closed list changes at each arrow key). The row is found by comparing its section's
// id, never by putting the id in a selector, and only a section's row is looked in
function secRefocus(root, sid, cls) {
    var rows = root && root.children; if (!rows || typeof sid !== 'string' || typeof cls !== 'string') return null;
    for (var k = 0; k < rows.length; k++) {
        var r = rows[k]; if (!r || !r.dataset || r.dataset.sid !== sid || !r.classList || !r.classList.contains('sys-sec') || typeof r.querySelector !== 'function') continue;
        var s = r.querySelector('select.' + cls); if (!s || typeof s.focus !== 'function') return null;
        try { s.focus({ preventScroll: true }); } catch (e) { s.focus(); }
        return s;
    }
    return null;
}
// [systemcheck:secrow-end]
// [systemcheck:placecatsui-start]
// 1.5.5: a list placed once a category, on the Layout tab, for the sheet and the HUD alike. An item list placed in a section has By category,
// which opens a row of ticks under it: the list's own categories (those its picker offers, else those of the items, the core entries and,
// on the GM's machine, the library's, as a row's form offers them) and any the place names already. A category another place of the same
// list shows is grayed here. What Save keeps of the places is said under each, by the cleaner's own rule (catSplits)
var _plCatOpen = typeof WeakSet === 'function' ? new WeakSet() : null;
function placeCatNames(f, sysD) {
    var out = [], seen = Object.create(null), push = function(x) { var t = typeof x === 'string' ? x.trim() : ''; if (!t || seen[t.toLowerCase()]) return; seen[t.toLowerCase()] = 1; out.push(t); };
    var sp = f && f.list && typeof f.list === 'object' ? f.list : null;
    if (sp && typeof sp.placeBy === 'string' && sp.placeBy) { var pbs = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s.key === 'string' && s.key.toLowerCase() === sp.placeBy.toLowerCase(); })[0]; if (pbs) (pbs.kind === 'pick' ? (pbs.opts || []).map(function(o) { return o && o.label; }) : (pbs.labels || [])).forEach(push); return out; }   // 1.6.0 R13: a list placed by a choice stat ticks its value names
    if (sp && Array.isArray(sp.cats) && sp.cats.length) sp.cats.forEach(push); else if (typeof catChoices === 'function') catChoices(sysD).forEach(push);
    return out;
}
function placeCatBtn(pl, byLabel) {   // shown while the place names no category; one that names some shows its ticks; byLabel (1.6.0 R13): the choice stat the list splits its places by
    if (!pl || (Array.isArray(pl.cats) && pl.cats.length)) return null;
    var open = !!(_plCatOpen && _plCatOpen.has(pl)), b = el('button', 'tool ghost sys-btn sys-pl-cats' + (open ? ' on' : ''), byLabel ? 'By ' + byLabel : 'By category');
    b.dataset.act = 'plcats'; b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.title = 'Show only some of the list\u2019s categories in this place. Place the list again for the others';
    return b;
}
// The categories players never see, by the cleaner's own test of the players' view (systemcore cleanSystem, placeCatsSeen): one that no item,
// core entry or library entry they may see carries, where the library says only GM-only things carry it or cannot say. A test of a name
function placeCatGm(sysD) {
    var vis = Object.create(null), gm = Object.create(null), LBk = window.wpLibrary, lcs = null, put = function(m, c) { var t = typeof c === 'string' ? c.trim().toLowerCase() : ''; if (t) m[t] = 1; };
    if (typeof isClient === 'function' && !isClient() && LBk && typeof LBk.catsFor === 'function') lcs = LBk.catsFor();
    if (!lcs || typeof lcs !== 'object') lcs = null;
    ((sysD && sysD.items) || []).concat((sysD && sysD.core) || []).forEach(function(it) { if (it && typeof it === 'object') put(it.vis === 'gm' ? gm : vis, it.category); });
    if (lcs) { (Array.isArray(lcs.show) ? lcs.show : []).forEach(function(c) { put(vis, c); }); (Array.isArray(lcs.hide) ? lcs.hide : []).forEach(function(c) { put(gm, c); }); }
    return function(c) { var l = typeof c === 'string' ? c.trim().toLowerCase() : ''; return !!l && vis[l] !== 1 && (!lcs || gm[l] === 1); };
}
function placeCatRow(pl, sid, pi, names, taken, home, many, hides, gmCat) {   // taken: the categories another place of this list shows, by lower case; home: the list's home place (catHome), where the rows no place names stand; many: the list stands in more than one place; hides: no place of the list shows every row, so the home place may hide some; gmCat: a test of the names players never see (placeCatGm)
    var row = el('div', 'sys-pl-catrow'); row.dataset.sid = sid; row.dataset.pi = String(pi);
    row.appendChild(el('span', 'sys-num-cap', 'Shows'));
    var mine = (Array.isArray(pl.cats) ? pl.cats : []).filter(function(x) { return typeof x === 'string' && x.trim(); }).map(function(x) { return x.trim(); }), low = mine.map(function(x) { return x.toLowerCase(); }), shown = (names || []).slice();
    mine.forEach(function(x) { if (!shown.some(function(y) { return y.toLowerCase() === x.toLowerCase(); })) shown.push(x); });   // one no item has any more stays tickable
    if (!shown.length) row.appendChild(el('span', 'sys-note', 'Give items a category to choose which rows this place shows.'));
    shown.forEach(function(x) {
        var lx = x.toLowerCase(), on = low.indexOf(lx) >= 0, lb = el('label', 'sys-list-cat'), cb = el('input', 'sys-pl-catcb'); cb.type = 'checkbox'; cb.checked = on; cb.dataset.cat = x;
        if (!on && taken && taken[lx] === 1) { cb.disabled = true; lb.title = 'Another place of this list shows it'; }
        else if (!on && low.length >= LIMITS.placeCats) { cb.disabled = true; lb.title = 'At most ' + LIMITS.placeCats + ' categories a place'; }
        lb.appendChild(cb); lb.appendChild(document.createTextNode(' ' + x));
        if (typeof gmCat === 'function' && gmCat(x)) { lb.appendChild(el('small', 'sys-pl-catgm', 'GM only')); if (!lb.title) lb.title = 'Only GM-only things carry this category, so players do not see it here'; }
        row.appendChild(lb);
    });
    row.appendChild(el('span', 'sys-note', many && home ? 'Rows of a category no place shows stand here.' + (hides ? ' This place may hide some of them.' : '') : !low.length ? 'None ticked: every row.' : 'Place the list again for its other categories.'));
    return row;
}
// A tick: that category on this place, or off it. The last one off leaves no key, so the place shows every row, as before
function placeCatTick(pl, name, on) {
    if (!pl || typeof pl !== 'object' || typeof name !== 'string' || !name.trim()) return;
    var cur = (Array.isArray(pl.cats) ? pl.cats : []).filter(function(x) { return typeof x === 'string'; }), lx = name.trim().toLowerCase(), at = -1;
    cur.forEach(function(x, i) { if (at < 0 && x.trim().toLowerCase() === lx) at = i; });
    if (on && at < 0 && cur.length < LIMITS.placeCats) cur.push(name.trim());
    if (!on && at >= 0) cur.splice(at, 1);
    if (cur.length) pl.cats = cur; else delete pl.cats;
}
// What Save does with the places of each item list of one layout, by the cleaner's own rule: { 'sectionId:index': [{ message }] }. A list
// placed once with no categories, and a list whose places all hold, say nothing
function placeCatSays(secs, fields) {
    var out = {}, kinds = Object.create(null), names = Object.create(null), list = Array.isArray(secs) ? secs : [], by = Object.create(null);
    (Array.isArray(fields) ? fields : []).forEach(function(f) { if (f && typeof f.id === 'string') { kinds[f.id] = f.kind; names[f.id] = f.label || f.key || 'This list'; } });
    var ok = catSplits(list, kinds), say = function(k, m) { (out[k] = out[k] || []).push({ message: m }); };
    list.forEach(function(s) { if (!s || typeof s.id !== 'string') return; (Array.isArray(s.fields) ? s.fields : []).forEach(function(p, pi) { if (p && typeof p.id === 'string' && kinds[p.id] === 'item-list') (by[p.id] = by[p.id] || []).push({ k: s.id + ':' + pi, p: p }); }); });
    Object.keys(by).forEach(function(id) {
        var ps = by[id], nm = names[id];
        ps.forEach(function(x) { var n = Object.create(null), cnt = 0; (Array.isArray(x.p.cats) ? x.p.cats : []).forEach(function(c) { var l = typeof c === 'string' ? c.trim().toLowerCase() : ''; if (l && !n[l]) { n[l] = 1; cnt++; } }); if (cnt > LIMITS.placeCats) say(x.k, 'A place shows at most ' + LIMITS.placeCats + ' categories, so Save keeps the first ' + LIMITS.placeCats + '.'); });
        if (ok[id] === 1 || ps.length < 2) return;
        var cs = ps.map(function(x) { return cleanPlaceCats(x.p.cats); }), why;
        if (cs.some(function(c) { return !c; })) why = 'Each place of ' + nm + ' needs categories of its own.';
        else { var seen = Object.create(null), twice = ''; cs.forEach(function(c) { c.forEach(function(x) { var l = x.toLowerCase(); if (seen[l] && !twice) twice = x; seen[l] = 1; }); }); why = 'Two places of ' + nm + ' show ' + (twice || 'one category') + '.'; }
        ps.forEach(function(x, i) { say(x.k, why + (i === 0 ? ' So Save keeps only this place, and it shows every row.' : ' So Save drops this place.')); });
    });
    return out;
}
// ...under each place, for both layouts, in errorsById ('plc:' and the layout, the section's id and the place's index)
function placeCatErrs() {
    Object.keys(errorsById).forEach(function(k) { if (k.indexOf('plc:') === 0) delete errorsById[k]; });
    if (typeof layoutNameErrs === 'function') layoutNameErrs();   // 1.6.3: a tab's label and a band group's name, said with the places' own lines
    if (!draft) return;
    [['sheet', draft.sheet], ['hud', draft.sheet && draft.sheet.hud]].forEach(function(lv) {
        var lay = lv[1]; if (!lay || typeof lay !== 'object' || !Array.isArray(lay.sections)) return;
        var said = placeCatSays(lay.sections, draft.fields); Object.keys(said).forEach(function(k) { errorsById['plc:' + lv[0] + ':' + k] = said[k]; });
    });
}
// 1.6.3 (Fulllion's rulings of 2026-11-20: "it makes sense to have fields be required when other fields depend on them", "none isn't a good default
// substitution"): a tab's label is what the sheet's or the HUD's tab strip shows, and a band group's name is what its Pin button says. With none they
// show the stand-in words Tab and Pin Group, and several emptied tabs read alike, so an empty one is said under its box. Keys: 'tablbl:' with the
// layout and the tab's id, 'grplbl:' with the group's id. The cleaner keeps them as they are. Asked by placeCatErrs, so the editor's fault check and renderLayout
// both fill them
function layoutNameErrs() {
    Object.keys(errorsById).forEach(function(k) { if (k.indexOf('tablbl:') === 0 || k.indexOf('grplbl:') === 0) delete errorsById[k]; });
    var sh = draft && draft.sheet && typeof draft.sheet === 'object' ? draft.sheet : null; if (!sh) return;
    [['sheet', sh, 'the sheet'], ['hud', sh.hud, 'the HUD']].forEach(function(lv) {
        (lv[1] && typeof lv[1] === 'object' && Array.isArray(lv[1].tabs) ? lv[1].tabs : []).forEach(function(tb, i) { if (tb && typeof tb.id === 'string' && !(typeof tb.label === 'string' && tb.label.trim())) errorsById['tablbl:' + lv[0] + ':' + tb.id] = [{ message: 'A tab needs a label. Until it has one, ' + lv[2] + ' shows Tab.', prop: 'tab.label.' + i }]; });
    });
    (Array.isArray(sh.bandGroups) ? sh.bandGroups : []).forEach(function(g, i) { if (g && typeof g.id === 'string' && !(typeof g.label === 'string' && g.label.trim())) errorsById['grplbl:' + g.id] = [{ message: 'A group needs a name. Until it has one, its Pin button says Pin Group.', prop: 'group.label.' + i }]; });
}
// 1.6.3 (lane B batch "rules"): what a Handbook link's place says while it names no page, or a page that is gone. The GM's sheet draws no button then,
// and the players' view drops the place at Save, so the line says so. The words, or '' where its page is there. pageOptions lists the pages a link may name
function linkPageSays(pl) {
    if (!pl || pl.kind !== 'link') return '';
    if (pl.page && pageOptions('', null).some(function(o) { return o[0] === pl.page; })) return '';
    return pl.page ? 'This page is gone. Pick another, since until then this button shows on no sheet.' : 'Pick a page, since until then this button shows on no sheet.';
}
// The ticks under a place (while it names a category, or By category is open) and what Save does with it
function placeCatPart(host, pl, sec, pi, f, secs) {
    var open = (Array.isArray(pl.cats) && pl.cats.length > 0) || !!(_plCatOpen && _plCatOpen.has(pl));
    if (open) {
        var taken = Object.create(null), firstP = null, n = 0;
        (secs || []).forEach(function(s) { (s && Array.isArray(s.fields) ? s.fields : []).forEach(function(p) { if (!p || p.id !== pl.id) return; n++; if (!firstP) firstP = p; if (p === pl) return; (Array.isArray(p.cats) ? p.cats : []).forEach(function(x) { if (typeof x === 'string' && x.trim()) taken[x.trim().toLowerCase()] = 1; }); }); });
        var specP = f && f.list && typeof f.list === 'object' ? f.list : null, homeP = typeof catHome === 'function' ? catHome(secs, pl.id, specP) : firstP;   // the place the rows no place names stand in, as the sheet reads it
        host.appendChild(placeCatRow(pl, sec.id, pi, placeCatNames(f, draft), taken, homeP === pl, n > 1, typeof catHome === 'function' && catHome(secs, pl.id, specP, true) === null, typeof placeCatGm === 'function' && !(specP && specP.placeBy) ? placeCatGm(draft) : null));   // 1.6.0 R13: a stat's value names are no categories players might not see
    }
    var k = 'plc:' + layoutView + ':' + sec.id + ':' + pi, ec = errorCell(k); ec.dataset.errFor = k; host.appendChild(ec);
}
// A list placed again opens the ticks of each of its places, so that each can name its categories
function placeCatAgain(secs, pl, fields) {
    var f = pl && typeof pl.id === 'string' ? (fields || []).find(function(x) { return x && x.id === pl.id; }) : null; if (!f || f.kind !== 'item-list' || !_plCatOpen) return false;
    var had = false; (secs || []).forEach(function(s) { (s && Array.isArray(s.fields) ? s.fields : []).forEach(function(p) { if (p && p.id === pl.id) { had = true; _plCatOpen.add(p); } }); });
    if (had) _plCatOpen.add(pl);
    return had;
}
// After the tab is drawn again: the same tick takes the focus back (found by comparing, never by a selector), else the first tick, else By category
function placeCatRefocus(root, sid, pi, cat) {
    var rows = root && typeof root.querySelectorAll === 'function' ? root.querySelectorAll('.sys-pl-catrow') : [], hit = null, foc = function(x) { try { x.focus({ preventScroll: true }); } catch (e) { x.focus(); } return x; };
    Array.prototype.forEach.call(rows, function(r) { if (hit || !r.dataset || r.dataset.sid !== sid || r.dataset.pi !== String(pi)) return; var cbs = r.querySelectorAll('input.sys-pl-catcb'); Array.prototype.forEach.call(cbs, function(cb) { if (!hit && !cb.disabled && (typeof cat !== 'string' || cb.dataset.cat === cat)) hit = cb; }); });
    if (hit) return foc(hit);
    var prs = root && typeof root.querySelectorAll === 'function' ? root.querySelectorAll('.sys-pl') : [];
    Array.prototype.forEach.call(prs, function(p) { if (hit || !p.dataset || p.dataset.sid !== sid || p.dataset.pi !== String(pi)) return; hit = p.querySelector('button.sys-pl-cats'); });
    return hit ? foc(hit) : null;
}
// [systemcheck:placecatsui-end]
function renderLayout() {
    var root = ui('sysLayoutSecs'); if (!root || !draft) return;
    _ifNotes = null;   // 1.6.0: this draw's show-ifs, worked out once
    if (typeof placeCatErrs === 'function') placeCatErrs();   // 1.5.5: what Save does with a list's places, as the tab now stands
    var secs = layoutSections(), byId = {}, rollById = {}, placed = {}, onSheet = {}, hudOn = layoutView === 'hud';
    draft.fields.forEach(function(f) { byId[f.id] = f; }); draft.rolls.forEach(function(r) { rollById[r.id] = r; });
    secs.forEach(function(s) { (s.fields || []).forEach(function(p) { if (p.id) placed[p.id] = 1; }); });
    if (hudOn) ((draft.sheet && Array.isArray(draft.sheet.sections)) ? draft.sheet.sections : []).forEach(function(s) { (s.fields || []).forEach(function(p) { if (p && p.id) onSheet[p.id] = 1; }); });
    root.textContent = '';
    // Stage 6 HUD frame (HF1): the Sheet | HUD switch — the toolbar's words follow the view; the HUD's title comes first in its view
    Array.prototype.forEach.call(document.querySelectorAll('#sysLayoutView [data-view]'), function(vb) { vb.classList.toggle('on', vb.dataset.view === layoutView); vb.setAttribute('aria-pressed', vb.dataset.view === layoutView ? 'true' : 'false'); });
    var tbAuto = ui('sysLayoutAuto'), tbClear = ui('sysLayoutClear'), tbNote = ui('sysLayoutNote');
    if (tbAuto) { tbAuto.textContent = hudOn ? 'Copy the sheet\u2019s sections' : 'Start from the automatic layout'; tbAuto.title = hudOn ? 'Put a copy of the sheet\u2019s sections (or the automatic layout\u2019s) on the HUD\u2019s first tab, to trim and re-tab' : 'Copy the automatic layout (one section per kind, then the rolls) as a starting point'; }
    if (tbClear) { tbClear.textContent = hudOn ? 'Remove the HUD' : 'Use the automatic layout'; tbClear.title = hudOn ? 'Take the HUD away (its button goes from every sheet and menu; the sheet is untouched)' : 'Remove your layout and let the sheet arrange itself'; }
    if (tbNote) { if (!tbNote.dataset.sheetText) tbNote.dataset.sheetText = tbNote.textContent; tbNote.textContent = hudOn ? 'The HUD is a second window for each character, with parts of its own. Players get its button once it holds something they can see.' : tbNote.dataset.sheetText; }
    if (hudOn) {
        var hudBox = el('div', 'sys-tabmgr sys-hudbox'); hudBox.appendChild(el('div', 'sys-tabmgr-head', 'HUD title'));
        hudBox.appendChild(input('sys-hud-title field', layoutRoot().title, 'Shown under the name in the HUD\u2019s head (e.g. Combat HUD)', 'HUD'));
        root.appendChild(hudBox);
    }
    // Tabs (optional, Stage 1): group sections into a tab strip on the sheet. No tabs = one stacked page.
    var tabs = layoutTabs();
    var tabBox = el('div', 'sys-tabmgr');
    tabBox.appendChild(el('div', 'sys-tabmgr-head', 'Tabs'));
    if (!tabs.length) tabBox.appendChild(el('div', 'sys-hint', 'No tabs yet, so the sections stack as one page. Add a tab to group them into a tab strip. Each section then picks its tab.'));
    tabs.forEach(function(tb) {
        var tr = el('div', 'sys-row sys-tab'); tr.dataset.tid = tb.id;
        var tmain = el('div', 'sys-row-main');
        var tIcoIn = input('sys-tab-icon field', tb.icon, 'An icon before the label on the sheet \u2014 an emoji or a bundled icon (optional)', 'Icon'); tmain.appendChild(tIcoIn); tmain.appendChild(glyphButton(tIcoIn));   // Stage 5g (Stage 6: the picker)
        tmain.appendChild(input('sys-tab-label field', tb.label, 'This tab\'s label on the sheet. It must be filled in', 'Tab label'));
        var tbErr = 'tablbl:' + layoutView + ':' + tb.id, tbEc = errorCell(tbErr); tbEc.dataset.errFor = tbErr; tmain.appendChild(tbEc);   // 1.6.3: a label it still needs, said under it
        tmain.appendChild(btnRow([['tabup', 'Move this tab left', '&#9650;'], ['tabdown', 'Move this tab right', '&#9660;'], ['tabdel', 'Remove this tab (its sections move to the first tab)', '&times;']]));
        tr.appendChild(tmain);
        tabBox.appendChild(tr);
    });
    var addTab = el('button', 'tool ghost sys-btn', '+ Add tab'); addTab.id = 'sysAddTab';
    tabBox.appendChild(addTab);
    root.appendChild(tabBox);
    // Sheet look (doc theming, 1.5.0): the whole sheet's own font / colors / background picture, over the campaign default.
    // Wired directly (the layout's delegated handlers key on sections and data-act): each control edits draft.sheetStyle.
    var lookBox = el('div', 'sys-tabmgr sys-lookbox');
    lookBox.appendChild(el('div', 'sys-tabmgr-head', 'Sheet look'));
    if (hudOn) lookBox.appendChild(el('div', 'sys-note', 'Shared by the sheet and the HUD (the HUD leaves out sticky titles and the header portrait; its head has its own).'));   // HUD frame HF1
    var look = (draft.sheetStyle && typeof draft.sheetStyle === 'object') ? draft.sheetStyle : null;
    var lookRow = el('div', 'sys-sec-style');
    var FONTS = (window.wpDocRender && window.wpDocRender.DOC_FONTS) || {};
    var fontSel = select('sys-look-font', [['', 'Default font']].concat((window.wpDocRender && window.wpDocRender.docFontOptions ? window.wpDocRender.docFontOptions(look && look.font) : Object.keys(FONTS).map(function(k) { return [k, k]; })).map(function(o) { return [o[0], o[1]]; })), (look && look.font) || '', 'The sheet\'s font, over the campaign default. Waypoint\'s own fonts, so every player sees the same');
    lookRow.appendChild(capBox(fontSel, 'Font'));
    var mkColor = function(key, title, fallback) { var i = el('input', 'sys-look-color'); i.type = 'color'; i.value = (look && look[key]) || fallback; i.title = title; i.dataset.key = key; return i; };
    lookRow.appendChild(el('span', 'sys-sec-style-lbl', 'Text')); lookRow.appendChild(mkColor('textColor', 'Text color', '#e8e2d0'));
    lookRow.appendChild(el('span', 'sys-sec-style-lbl', 'Panel')); lookRow.appendChild(mkColor('bgColor', 'Panel background color', '#181510'));
    var pic = el('button', 'tool ghost sys-btn', (look && look.bgImage) ? 'Change picture\u2026' : 'Background picture\u2026'); pic.dataset.look = 'pic'; pic.title = 'A picture from the image library behind the sheet'; lookRow.appendChild(pic);
    if (look && look.bgImage) { lookRow.appendChild(el('span', 'sys-sec-style-lbl', 'Dim')); var dim = el('input', 'sys-look-dim'); dim.type = 'range'; dim.min = 0; dim.max = 90; dim.step = 5; dim.value = typeof look.bgDim === 'number' ? look.bgDim : 40; dim.title = 'Dim the picture so the text stays readable'; lookRow.appendChild(dim); if (typeof window !== 'undefined' && window.wpUi) window.wpUi.typed(dim, { unit: '%', label: 'Dim in percent' }); }
    if (look) { var lclr = el('button', 'tool ghost sys-btn sys-sec-styleclr', 'Clear'); lclr.dataset.look = 'clear'; lclr.title = 'Back to the campaign default'; lookRow.appendChild(lclr); }
    lookBox.appendChild(lookRow);
    lookBox.appendChild(el('div', 'sys-hint', 'Absent = the campaign default (the Appearance button on a page or planner). Players see the same look on their sheets.'));
    // Stage 5g: the sheet's shape — kept on the layout (draft.sheet.look), not in the doc-theming style: titles, tabs, one accent, the portrait + name
    var themeGold = function() { try { var x = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(); return /^#[0-9a-fA-F]{6}$/.test(x) ? x.toLowerCase() : '#e0a54f'; } catch (er) { return '#e0a54f'; } };
    var shape = (draft.sheet && draft.sheet.look && typeof draft.sheet.look === 'object') ? draft.sheet.look : {};
    var shapeRow = el('div', 'sys-sec-style sys-lookshape');
    var titlesSel = select('sys-look-titles', [['', 'Small titles'], ['headline', 'Headline titles'], ['accordion', 'Accordion titles']], shape.titles || '', 'Section titles: small capitals (as now), bigger headline titles, or accordion titles (a line under each section, a chevron on the ones that fold)');
    var tabsSel = select('sys-look-tabs', [['', 'Underlined tabs'], ['filled', 'Filled tabs'], ['angular', 'Angular tabs']], shape.tabs || '', 'The tab strip: an underline under the open tab (as now), angled tabs with the open one filled in the accent, or angular tabs across the whole strip');
    var labelsSel = select('sys-look-labels', [['', 'Plain labels'], ['caps', 'Capital labels'], ['plain', 'Plain labels, the header too']], shape.labels || '', 'Field labels: as they are, small bold capitals like a printed sheet, or plain everywhere, the header’s labels too');
    var inkSel = select('sys-look-labelink', [['', 'Muted labels'], ['text', 'Labels in text color']], shape.labelInk || '', 'The color of every label: the muted gray (as now), or the sheet’s own text color');
    var lsizeSel = select('sys-look-labelsize', [['', 'Label size as now'], ['13', '13 px labels'], ['14', '14 px labels'], ['16', '16 px labels']], shape.labelSize ? String(shape.labelSize) : '', 'How large a label is drawn on the sheet. The HUD keeps its own small labels');
    // 1.6.3 (improvement week; the owner, 2026-11-16): two swatches beside the tab options, the open tab's color and the other tabs'
    // (shape.tabOn and shape.tabOff, which cleanLook keeps as plain hex colors). A swatch that is not set shows the color those tabs take
    // now (tabStandIns, the review of the first cut) and says so in its tooltip; a pick sets it, and Clear tab colors takes both off, back
    // to the accent and the palette. A color input fires no input event for a pick of the very color it shows, so its change event also
    // writes the value where nothing is set yet, in a browser that fires change for such a pick. tabColorsBox builds them; its listeners
    // are its own, since the layout's delegated handlers key on sections and tabs
    var tabColorsBox = function() {
        var box = el('span', 'sys-look-tabcols'), HEXT = /^#[0-9a-fA-F]{6}$/;
        var themeDim = function() { try { var x = getComputedStyle(document.documentElement).getPropertyValue('--dim').trim(); return HEXT.test(x) ? x.toLowerCase() : '#808080'; } catch (er) { return '#808080'; } };
        var now = tabStandIns(shape, paletteOf(shape), look, { gold: themeGold(), dim: themeDim() });
        [['tabOn', 'Open tab', 'The open tab’s color. Underlined tabs show it as the line under the open tab, filled and angular tabs as its fill, with words in a color that reads on it', now.on],
         ['tabOff', 'Other tabs', 'The other tabs’ color. Underlined tabs show it as the line under each of them, filled and angular tabs as their fill, with words in a color that reads on it', now.off]].forEach(function(p) {
            var sw = el('input', 'sys-look-tabcol'); sw.type = 'color'; sw.dataset.key = p[0]; sw.value = shape[p[0]] || p[3];
            sw.title = shape[p[0]] ? p[2] : p[2] + '. Not set: this shows the color the tabs take now from the accent and the palette';
            var setNow = function() { setShape(p[0], HEXT.test(sw.value) ? sw.value.toLowerCase() : null); };
            sw.addEventListener('input', setNow);
            sw.addEventListener('change', function() { var lk = draft.sheet && draft.sheet.look; if (!(lk && lk[p[0]])) setNow(); renderLayout(); });   // Clear tab colors appears once one is set
            box.appendChild(el('span', 'sys-sec-style-lbl', p[1])); box.appendChild(sw);
        });
        if (shape.tabOn || shape.tabOff) { var tclr = el('button', 'tool ghost sys-btn sys-look-tabclr', 'Clear tab colors'); tclr.title = 'Take both tab colors off: the tabs take their colors from the accent and the palette again'; tclr.addEventListener('click', function() { setShape('tabOn', null); setShape('tabOff', null); renderLayout(); }); box.appendChild(tclr); }
        return box;
    };
    [[titlesSel, 'Section titles'], [tabsSel, 'Tabs'], [labelsSel, 'Labels'], [inkSel, 'Label color'], [lsizeSel, 'Label size']].forEach(function(p) { shapeRow.appendChild(capBox(p[0], p[1])); if (p[0] === tabsSel) shapeRow.appendChild(tabColorsBox()); });
    shapeRow.appendChild(el('span', 'sys-sec-style-lbl', 'Accent'));
    var accentIn = el('input', 'sys-look-accent'); accentIn.type = 'color'; accentIn.value = shape.accent || themeGold(); accentIn.title = 'The sheet\u2019s accent: section titles, the open tab, the name in the header'; shapeRow.appendChild(accentIn);
    var portLbl = el('label', 'sys-hover'); var portChk = el('input', 'sys-look-portrait'); portChk.type = 'checkbox'; portChk.checked = !!shape.portrait; portLbl.appendChild(portChk); portLbl.appendChild(document.createTextNode(' Portrait & name in the header')); portLbl.title = 'The character\u2019s portrait and name lead the header block, with the identity rows and ledger figures beside the picture'; shapeRow.appendChild(portLbl);
    if (shape.accent) { var aclr = el('button', 'tool ghost sys-btn', 'Theme accent'); aclr.title = 'Back to the theme\u2019s gold'; aclr.addEventListener('click', function() { setShape('accent', null); renderLayout(); }); shapeRow.appendChild(aclr); }
    lookBox.appendChild(shapeRow);
    // Stage 6 look fold (L5): the details row — Sticky titles (the later look options join this row)
    var detRow = el('div', 'sys-sec-style sys-lookdetails');
    var stickyLbl = el('label', 'sys-hover'), stickyChk = el('input', 'sys-look-sticky'); stickyChk.type = 'checkbox'; stickyChk.checked = shape.sticky === true; stickyLbl.appendChild(stickyChk); stickyLbl.appendChild(document.createTextNode(' Sticky titles')); stickyLbl.title = 'A section\u2019s title stays at the top, under the band and the tabs, while you scroll through that section';
    var fxSel = select('sys-look-effects', [['', 'Effect lines'], ['cards', 'Effect cards']], shape.effects || '', 'Status effects: a line each (as now), or a card each with a pill per change');   // L6
    var numSel = select('sys-look-numbers', [['', 'Plain numbers'], ['mono', 'Monospaced numbers']], shape.numbers || '', 'Figures on the band, in the header, in captions and tables in a monospaced face (stat tiles stay as they are)');   // L8
    var bandSel = select('sys-look-band', [['', 'Band tiles'], ['inline', 'Inline band'], ['chips', 'Band chips']], shape.band || '', 'The pinned band: small tiles (as now), one inline row of label and value, or a row of rounded chips');
    var stepSel = select('sys-look-steppers', [['', 'Arrows beside'], ['inside', 'Arrows inside']], shape.steppers || '', 'Number boxes: \u2212 and + beside a pool (as now), or small up and down arrows inside the right edge of every number box');
    var valSel = select('sys-look-values', [['', 'Plain results'], ['boxed', 'Boxed results']], shape.values || '', 'Worked-out results in sections: as text (as now), or in a dashed box');
    var rowSel = select('sys-look-rows', [['', 'Plain item rows'], ['cards', 'Item cards']], shape.rows || '', 'Carried items: plain rows (as now), or a small card each');
    [[numSel, 'Numbers'], [bandSel, 'Band'], [stepSel, 'Number boxes'], [valSel, 'Results'], [fxSel, 'Effects'], [rowSel, 'Item rows']].forEach(function(p) { detRow.appendChild(capBox(p[0], p[1])); });
    detRow.appendChild(stickyLbl); lookBox.appendChild(detRow);
    // Stage 6 look fold (L1): a palette — ten colors for every part of the sheet, from a preset or the GM's own swatches
    var pal = paletteOf(shape);
    var presetOf = function(p0) { if (!p0) return ''; var hit = 'custom'; Object.keys(LOOK_PRESETS).forEach(function(pn) { if (hit === 'custom' && PALETTE_KEYS.every(function(k) { return LOOK_PRESETS[pn].palette[k] === p0[k]; })) hit = pn; }); return hit; };
    var curPreset = presetOf(pal), presetOpts = [['', 'No palette']].concat(Object.keys(LOOK_PRESETS).map(function(pn) { return [pn, LOOK_PRESETS[pn].name]; })); if (curPreset === 'custom') presetOpts.push(['custom', 'Custom']);
    var palRow = el('div', 'sys-sec-style sys-lookpalette');
    palRow.appendChild(el('span', 'sys-sec-style-lbl', 'Palette'));
    var presetSel = select('sys-look-preset', presetOpts, curPreset, 'Color every part of the sheet at once: pick a preset, then change any swatch'); palRow.appendChild(presetSel);
    if (pal) {
        PALETTE_KEYS.forEach(function(k) {
            var lb = el('label', 'sys-look-palsw'), sw = el('input', 'sys-look-pal'); sw.type = 'color'; sw.value = pal[k]; sw.dataset.key = k; sw.title = PAL_CAPS[k];
            lb.appendChild(el('span', 'sys-sec-style-lbl', PAL_CAPS[k])); lb.appendChild(sw); palRow.appendChild(lb);
            sw.addEventListener('input', function() { setPalette(k, sw.value); });
            sw.addEventListener('change', function() { renderLayout(); });   // the preset select turns to Custom
        });
        var pclr = el('button', 'tool ghost sys-btn', 'Clear palette'); pclr.title = 'Back to the Text and Panel colors above, and the theme'; pclr.addEventListener('click', function() { setShape('palette', null); renderLayout(); }); palRow.appendChild(pclr);
        Array.prototype.forEach.call(lookRow.querySelectorAll('.sys-look-color'), function(ci) { ci.disabled = true; ci.title = 'The palette sets the sheet\u2019s colors; clear it to use these'; });
    }
    lookBox.appendChild(palRow);
    lookBox.appendChild(el('div', 'sys-hint', 'A palette colors every part of the sheet at once, in place of the Text and Panel colors above and the campaign\u2019s page colors (the font and picture still apply). Players see the same colors, under either theme.'));
    var setPalette = function(k, v) { if (!/^#[0-9a-fA-F]{6}$/.test(v)) return; var lk = (draft.sheet && draft.sheet.look && typeof draft.sheet.look === 'object') ? draft.sheet.look : {}; var np = Object.assign({}, lk.palette || {}); np[k] = v.toLowerCase(); setShape('palette', np); };
    presetSel.addEventListener('change', function() { var pv = presetSel.value; if (pv === 'custom') return; if (!pv) setShape('palette', null); else { var pr = LOOK_PRESETS[pv]; if (!pr) return; setShape('palette', Object.assign({}, pr.palette)); setShape('accent', pr.accent); if (pr.font) setLook('font', pr.font); } renderLayout(); });
    root.appendChild(lookBox);
    var setShape = function(key, val) { if (!draft.sheet) draft.sheet = {}; var lk = (draft.sheet.look && typeof draft.sheet.look === 'object') ? draft.sheet.look : {}; if (val === null || val === '' || val === false || val === undefined) delete lk[key]; else lk[key] = val; if (Object.keys(lk).length) draft.sheet.look = lk; else delete draft.sheet.look; markDirty(); renderPreview(); };
    titlesSel.addEventListener('change', function() { setShape('titles', titlesSel.value); });
    tabsSel.addEventListener('change', function() { setShape('tabs', tabsSel.value); });
    labelsSel.addEventListener('change', function() { setShape('labels', labelsSel.value); });
    inkSel.addEventListener('change', function() { setShape('labelInk', inkSel.value); });   // 1.6.0
    lsizeSel.addEventListener('change', function() { setShape('labelSize', lsizeSel.value ? Number(lsizeSel.value) : null); });   // 1.6.0
    accentIn.addEventListener('input', function() { setShape('accent', accentIn.value); });
    accentIn.addEventListener('change', function() { renderLayout(); });   // the "Theme accent" button appears once one is picked
    portChk.addEventListener('change', function() { setShape('portrait', portChk.checked); });
    stickyChk.addEventListener('change', function() { setShape('sticky', stickyChk.checked); });   // L5
    fxSel.addEventListener('change', function() { setShape('effects', fxSel.value); });   // L6
    [[numSel, 'numbers'], [bandSel, 'band'], [stepSel, 'steppers'], [valSel, 'values'], [rowSel, 'rows']].forEach(function(p) { p[0].addEventListener('change', function() { setShape(p[1], p[0].value); }); });   // L8
    var setLook = function(key, val) { draft.sheetStyle = (draft.sheetStyle && typeof draft.sheetStyle === 'object') ? draft.sheetStyle : {}; if (val === null || val === '' || val === undefined) delete draft.sheetStyle[key]; else draft.sheetStyle[key] = val; if (!Object.keys(draft.sheetStyle).length) delete draft.sheetStyle; markDirty(); renderPreview(); };
    fontSel.addEventListener('change', function() { setLook('font', fontSel.value); });
    Array.prototype.forEach.call(lookRow.querySelectorAll('.sys-look-color'), function(ci) { ci.addEventListener('input', function() { setLook(ci.dataset.key, ci.value); }); });
    var dimEl = lookRow.querySelector('.sys-look-dim'); if (dimEl) dimEl.addEventListener('input', function() { setLook('bgDim', Math.max(0, Math.min(90, Math.round(+dimEl.value || 0)))); });
    pic.addEventListener('click', function() {
        if (!window.wpPickImage) { toast('The image library is not available here.'); return; }
        window.wpPickImage(function(src) { if (typeof src !== 'string' || !/^[/]saves[/]images[/]/.test(src)) return; setLook('bgImage', src); if (!(draft.sheetStyle && typeof draft.sheetStyle.bgDim === 'number')) setLook('bgDim', 40); renderLayout(); });
    });
    var lookClr = lookRow.querySelector('[data-look="clear"]'); if (lookClr) lookClr.addEventListener('click', function() { delete draft.sheetStyle; markDirty(); renderLayout(); renderPreview(); });
    // The header block + the pinned band (Stages 5c/5d): three lists of ids kept outside the sections — identity rows and ledger figures
    // (read-only) and the band (live controls). One builder: chips with left/right/remove, a select of what is not on the list yet, Clear.
    // Wired directly (the delegated handlers key on sections and tabs). What Save would drop is pruned from the draft at render (a field
    // deleted, or switched to a kind the list can't hold) so the chips, the hint and Clear never claim what the preview does not show.
    var sheetGroups = function() { if (!draft.sheet) draft.sheet = {}; if (!Array.isArray(draft.sheet.bandGroups)) draft.sheet.bandGroups = []; return draft.sheet.bandGroups; };   // Stage 6 look fold (L4)
    var grpList = (draft.sheet && Array.isArray(draft.sheet.bandGroups)) ? draft.sheet.bandGroups.filter(function(g) { return g && typeof g.id === 'string' && PIN_GID.test(g.id); }) : [];
    var deleteGroup = function(gid) {   // its figures stay on the band (always shown); its Pin buttons and section-header pins go
        if (!draft.sheet) return;
        draft.sheet.bandGroups = (draft.sheet.bandGroups || []).filter(function(g) { return g && g.id !== gid; }); if (!draft.sheet.bandGroups.length) delete draft.sheet.bandGroups;
        (draft.sheet.band || []).forEach(function(q) { if (q && q.g === gid) delete q.g; });
        (draft.sheet.sections || []).forEach(function(s) { if (s.pin === gid) delete s.pin; if (Array.isArray(s.fields)) s.fields = s.fields.filter(function(p) { return !(p && p.kind === 'pin' && p.g === gid); }); });
        var hd = draft.sheet.hud; if (hd && typeof hd === 'object') {   // HUD frame HF1: the HUD's band and sections too
            (Array.isArray(hd.band) ? hd.band : []).forEach(function(q) { if (q && q.g === gid) delete q.g; });
            (Array.isArray(hd.sections) ? hd.sections : []).forEach(function(s) { if (s.pin === gid) delete s.pin; if (Array.isArray(s.fields)) s.fields = s.fields.filter(function(p) { return !(p && p.kind === 'pin' && p.g === gid); }); });
        }
        markDirty(); renderLayout();
    };
    function pinBox(cfg) {
        var lroot = layoutRoot(), list = Array.isArray(lroot[cfg.key]) ? lroot[cfg.key] : [];   // HUD frame HF1: this view's list
        var keep = list.filter(function(q) { return q && (q.id ? !!(byId[q.id] && cfg.kinds[byId[q.id].kind] === 1) : !!(cfg.rolls && q.roll && rollById[q.roll])); });
        if (keep.length !== list.length) { if (keep.length) lroot[cfg.key] = list = keep; else { delete lroot[cfg.key]; list = []; } }
        var box = el('div', 'sys-tabmgr sys-bandbox'); box.id = cfg.boxId;
        box.appendChild(el('div', 'sys-tabmgr-head', cfg.title));
        box.appendChild(el('div', 'sys-hint', list.length ? cfg.hintFull : cfg.hintEmpty));
        var chips = el('div', 'sys-band-list'), on = {};
        list.forEach(function(q, bi) {
            var text = placementLabel(q, byId, rollById); if (text === null) return;
            on[q.id || q.roll] = 1;
            var chip = el('div', 'sys-band-pl'); chip.dataset.bi = String(bi);
            chip.appendChild(el('span', 'sys-pl-name', text));
            if (cfg.groups && grpList.length) { var gsel = select('sys-band-g', [['', 'Always shown']].concat(grpList.map(function(g) { return [g.id, g.label || 'Group']; })), q.g || '', 'Put this figure in a band group, shown while its viewer has the group pinned'); gsel.addEventListener('change', function(e) { e.stopPropagation(); if (gsel.value) q.g = gsel.value; else delete q.g; markDirty(); renderLayout(); }); chip.appendChild(gsel); }   // Stage 6
            chip.appendChild(btnRow([['pinleft', 'Move left', '&#9664;'], ['pinright', 'Move right', '&#9654;'], ['pindel', cfg.delTitle, '&times;']]));
            chips.appendChild(chip);
        });
        if (chips.childNodes.length) box.appendChild(chips);
        if (cfg.groups) {   // Stage 6 look fold (L4): the band's groups — each gets a Pin button placed beside its figures
            var gline = el('div', 'sys-band-grps'); gline.appendChild(el('span', 'sys-sec-style-lbl', 'Groups'));
            var targetsG = pinTargetsAll(draft.sheet);   // HF1: a Pin in either view
            grpList.forEach(function(g, gi) {
                var gr = el('div', 'sys-band-grp'); gr.dataset.gi = String(gi);
                var gl = input('sys-bgrp-label field', g.label, 'The group\u2019s name (on its Pin button: \u201cPin <name>\u201d). It must be filled in', 'Group name'); gl.addEventListener('input', function(e) { e.stopPropagation(); g.label = gl.value.slice(0, LIMITS.label); markDirty(); renderPreview(); if (typeof patchErrors === 'function') patchErrors(); }); gl.addEventListener('change', function(e) { e.stopPropagation(); }); gr.appendChild(gl);
                var grErr = 'grplbl:' + g.id, grEc = errorCell(grErr); grEc.dataset.errFor = grErr; gr.appendChild(grEc);   // 1.6.3: a name it still needs, said under it
                var where = null; [[draft.sheet && draft.sheet.sections, ''], [draft.sheet && draft.sheet.hud && draft.sheet.hud.sections, 'HUD: ']].forEach(function(lv) { (Array.isArray(lv[0]) ? lv[0] : []).forEach(function(s) { if (where) return; if (s.pin === g.id || (s.fields || []).some(function(p) { return p && p.kind === 'pin' && p.g === g.id; })) where = lv[1] + (s.title || 'a section'); }); });
                gr.appendChild(el('span', 'sys-hint sys-bgrp-note', targetsG[g.id] === 1 ? 'Pin: ' + where : 'No Pin button yet: always shown'));
                var gd = el('button', 'tool ghost sys-btn', '\u00d7'); gd.title = 'Delete this group (its figures stay on the band, always shown; its Pin buttons go)'; gd.addEventListener('click', function(e) { e.stopPropagation(); deleteGroup(g.id); }); gr.appendChild(gd);
                gline.appendChild(gr);
            });
            var gadd = el('button', 'tool ghost sys-btn', '+ Group'); gadd.title = 'A named group of band figures (points, spell slots) that each viewer pins from its Pin button'; gadd.disabled = grpList.length >= LIMITS.bandGroups;
            gadd.addEventListener('click', function(e) { e.stopPropagation(); var gl2 = sheetGroups(); if (gl2.length >= LIMITS.bandGroups) return; gl2.push({ id: uid('g_'), label: 'Group ' + (gl2.length + 1) }); markDirty(); renderLayout(); });
            gline.appendChild(gadd);
            box.appendChild(gline);
            box.appendChild(el('div', 'sys-hint', 'Put figures in a group and give it a Pin button beside where they live (a Pin placement in a section, or Pin in a section\u2019s header). Each viewer pins a group to the band while they scroll, remembered on their own machine for each character. A group with no Pin button, and figures in no group, are always shown.'));
        }
        var opts = [['', cfg.addLabel]];
        draft.fields.forEach(function(f) { if (cfg.kinds[f.kind] === 1 && !on[f.id]) opts.push(['f:' + f.id, fieldWord(f)]); });
        if (cfg.rolls) draft.rolls.forEach(function(r) { if (!on[r.id]) opts.push(['r:' + r.id, rollPick(r)]); });
        var row = el('div', 'sys-row-main sys-band-addrow');
        var add = select('sys-band-add', opts, '', cfg.addTitle); row.appendChild(add);
        if (list.length) { var clr = el('button', 'tool ghost sys-btn', 'Clear'); clr.title = cfg.clearTitle; clr.addEventListener('click', function() { delete layoutRoot()[cfg.key]; markDirty(); renderLayout(); }); row.appendChild(clr); }
        box.appendChild(row);
        var lst = function() { var lr = layoutRoot(); if (!Array.isArray(lr[cfg.key])) lr[cfg.key] = []; return lr[cfg.key]; };
        add.addEventListener('change', function(e) {
            e.stopPropagation();   // the modal's delegated change handler would otherwise look for a field row here
            var v = add.value; add.value = ''; if (!v) return;
            var l = lst(); if (l.length >= cfg.limit) { toast(cfg.capMsg); return; }
            var kind = v.slice(0, 1), id = v.slice(2), q = null;
            if (kind === 'f') { if (draft.fields.some(function(f) { return f.id === id && cfg.kinds[f.kind] === 1; })) q = { id: id }; }
            else if (kind === 'r' && cfg.rolls) { if (draft.rolls.some(function(r) { return r.id === id; })) q = { roll: id }; }
            if (q && !l.some(function(x) { return (x.id || x.roll) === id; })) { l.push(q); markDirty(); renderLayout(); }
        });
        box.addEventListener('click', function(e) {
            var bb = e.target.closest && e.target.closest('[data-act]'); if (!bb) return;
            var chip = bb.closest('.sys-band-pl'); if (!chip) return;
            e.stopPropagation();   // the modal's delegated click handler knows nothing of these acts
            var l = lst(), bi = +chip.dataset.bi, q = l[bi]; if (!q) return;
            var act = bb.dataset.act;
            if (act === 'pinleft' && bi > 0) { l.splice(bi, 1); l.splice(bi - 1, 0, q); }
            else if (act === 'pinright' && bi < l.length - 1) { l.splice(bi, 1); l.splice(bi + 1, 0, q); }
            else if (act === 'pindel') { l.splice(bi, 1); if (!l.length) delete layoutRoot()[cfg.key]; }
            else return;
            markDirty(); renderLayout();
        });
        root.appendChild(box);
    }
    if (!hudOn) pinBox({ key: 'identity', boxId: 'sysIdentityBox', title: 'Identity rows', kinds: IDENTITY_KINDS, rolls: false, limit: LIMITS.identity,
        hintFull: 'Under the name, in columns: a small label over each value; they scroll away with the sheet, leaving the band and the tabs at the top. Text, select, number and yes/no rows are changed right here by whoever may edit them, so they need no second copy in a section; formulas, skills and resources are read-only here. Players see the same rows.',
        hintEmpty: 'No identity rows yet. Pick the fields that say who this is, such as a class or a level. They read as labeled values under the name.',
        addLabel: 'Add an identity row\u2026', addTitle: 'A text, select, number or toggle (changed right there) or a formula, skill or resource (read-only) to show under the name', delTitle: 'Take off the identity rows (the field stays wherever else it is)', clearTitle: 'Take every identity row off', capMsg: 'At most ' + LIMITS.identity + ' identity rows.' });
    pinBox({ key: 'ledger', boxId: 'sysLedgerBox', title: 'Ledger figures', kinds: LEDGER_KINDS, rolls: false, limit: LIMITS.ledger,
        hintFull: 'Figures under the identity rows: a small label over a bold value (a negative reads red). A number is a box whoever may edit it can change right there; formulas, skills and resources are edited in the sections.',
        hintEmpty: 'No ledger yet. Pick a few numbers, such as points spent and points left. They read as bold figures under the name.',
        addLabel: 'Add a figure\u2026', addTitle: 'A number, formula, skill or resource to show as a figure (a number stays editable there)', delTitle: 'Take off the ledger (the field stays wherever else it is)', clearTitle: 'Take every figure off', capMsg: 'At most ' + LIMITS.ledger + ' ledger figures.' });
    pinBox({ key: 'band', boxId: 'sysBandBox', title: 'Pinned band', kinds: BAND_KINDS, rolls: true, limit: LIMITS.band, groups: true,
        hintFull: 'Shown on every tab, just above the tab strip, and it stays at the top with the strip while the sheet scrolls. A field can be here and in a section too.',
        hintEmpty: 'No band yet. Pin a few numbers, resources, toggles or rolls, and they stay in view on every tab, above the tab strip.',
        addLabel: 'Pin to the band\u2026', addTitle: 'A number, formula, skill, resource, toggle or roll to keep in view on every tab', delTitle: 'Take off the band (it stays wherever else it is on the sheet)', clearTitle: 'Take everything off the band', capMsg: 'The band holds at most ' + LIMITS.band + ' items.' });
    if (!secs.length) root.appendChild(el('div', 'sys-empty', hudOn ? 'No HUD yet. Add a section, a band figure or a ledger figure.' : 'No layout of your own yet: the sheet shows the automatic layout (one section per kind, then the rolls). Start from it, or add a section.'));
    var metaOpts = [['', 'No count']].concat(draft.fields.map(function(f) { return [f.id, f.label || f.key || '(field)']; })), topSecs = secs.filter(function(o) { return !o.parent; }), addOpts = layoutAddOpts(placed, hudOn, onSheet, grpList);   // 1.6.2: once for the tab, not once a section
    secs.forEach(function(sec) {
        var row = el('div', 'sys-row sys-sec'); row.dataset.sid = sec.id;
        var top = el('div', 'sys-row-main');
        var sIcoIn = input('sys-sec-icon field', sec.icon, 'An icon before the title \u2014 an emoji or a bundled icon (optional)', 'Icon'); top.appendChild(sIcoIn); top.appendChild(glyphButton(sIcoIn));   // Stage 5g (Stage 6: the picker)
        top.appendChild(input('sys-sec-title field', sec.title, 'The section\'s title on the sheet (empty = none)', 'Section title'));
        top.appendChild(select('sys-sec-cols', [[1, '1 column'], [2, '2 columns'], [3, '3 columns'], [4, '4 columns']], Math.max(1, Math.min(4, sec.cols || 1)), 'Fields per row in this section'));
        if (tabs.length) top.appendChild(select('sys-sec-tab', [['', 'No tab']].concat(tabs.map(function(t) { return [t.id, t.label || 'Tab']; })), sec.tab || '', 'Which tab this section appears on'));
        top.appendChild(secCollapSel(sec));   // 1.5.5: Fixed, Collapsible or Starts closed
        top.appendChild(select('sys-sec-inline', [['', 'Stacked fields'], ['1', 'Inline rows']], sec.inline ? '1' : '', 'Each field on one line: label and value on the left, its Roll on the right (numbers, formulas, skills, toggles, selects, text); their stat tiles draw as rows here (a pool and a slider keep their own look)'));   // HUD frame (HF4a)
        top.appendChild(select('sys-sec-pinned', [['', 'On its tab'], ['1', 'Above the tabs']], sec.pinned ? '1' : '', 'A dashboard section: stays above the tab strip on every tab (and comes first on a stacked sheet)'));
        if (!sec.parent) top.appendChild(select('sys-sec-beside', [['', 'On its own row'], ['1', 'Beside the one before']], sec.beside === true ? '1' : '', 'Stand this section on one row with the section before it. Where the window is too narrow, the two stack again'));   // 1.6.2, backlog 171 (b)
        top.appendChild(lazySelect('sys-sec-meta', metaOpts, sec.meta || '', 'A field whose value shows in the section header (e.g. a running total)'));
        top.appendChild(lazySelect('sys-sec-parent', [['', 'Top level']].concat(topSecs.filter(function(o) { return o.id !== sec.id; }).map(function(o) { return [o.id, 'Under: ' + (o.title || '(untitled)')]; })), sec.parent || '', 'Nest this section under another one (one level)'));
        var secFs = secFirstSel(sec, secs); if (secFs) top.appendChild(secFs);   // 1.5.5: After or Before its fields, only while nested
        top.appendChild(btnRow([['secup', 'Move this section up', '&#9650;'], ['secdown', 'Move this section down', '&#9660;'], ['secdel', 'Remove this section (its fields go back to the list)', '&times;']]));
        row.appendChild(top);
        var styleRow = el('div', 'sys-sec-style');   // Stage 3: per-section colors
        styleRow.appendChild(el('span', 'sys-sec-style-lbl', 'Colors'));
        [['accent', 'Accent', '#e0a54f'], ['bg', 'Panel', '#20202c'], ['border', 'Border', '#3a3a4a']].forEach(function(sp) {
            var wrap = el('label', 'sys-sec-color'); wrap.appendChild(document.createTextNode(sp[1]));
            var ci = el('input', 'sys-sec-' + sp[0]); ci.type = 'color'; ci.value = (sec.style && sec.style[sp[0]]) || sp[2]; ci.title = sp[1] + ' color for this section (drag the section’s Clear to remove)';
            wrap.appendChild(ci); styleRow.appendChild(wrap);
        });
        if (sec.style && sec.style.accent) { var stl = el('label', 'sys-sec-color'); var stc = el('input', 'sys-sec-stripe'); stc.type = 'checkbox'; stc.checked = sec.style.stripe !== false; stl.appendChild(stc); stl.appendChild(document.createTextNode(' Stripe')); stl.title = 'The accent also draws a stripe down the section\u2019s left edge (off: it colors the title only)'; styleRow.appendChild(stl); }   // Stage 5g
        if (sec.style) { var clr = el('button', 'tool ghost sys-btn sys-sec-styleclr', 'Clear'); clr.dataset.act = 'secstyleclr'; clr.title = 'Remove this section’s colors'; styleRow.appendChild(clr); }
        row.appendChild(styleRow);
        var chipOpts = pageOptions(sec.chip || '', 'No chip');
        if (chipOpts.length > 1) {   // Stage 5f: a handbook chip in this section's header (only when the campaign has pages, or one is already set)
            var chipRow = el('div', 'sys-sec-style'); chipRow.appendChild(el('span', 'sys-sec-style-lbl', 'Handbook'));
            chipRow.appendChild(select('sys-sec-chip', chipOpts, sec.chip || '', 'A chip in this section\u2019s header that opens a handbook page (players see it only when they can read the page)'));
            row.appendChild(chipRow);
        }
        if (grpList.length) {   // Stage 6: a band group's Pin in this section's header (as the website's Resource Pools header)
            var pinRow = el('div', 'sys-sec-style'); pinRow.appendChild(el('span', 'sys-sec-style-lbl', 'Pin'));
            pinRow.appendChild(select('sys-sec-pin', [['', 'No pin in the header']].concat(grpList.map(function(g) { return [g.id, 'Pin ' + (g.label || 'Group')]; })), sec.pin || '', 'A Pin button in this section\u2019s header for a band group'));
            row.appendChild(pinRow);
        }
        var canReset = (sec.fields || []).some(function(pl) { var f = pl && pl.id ? draft.fields.find(function(x) { return x.id === pl.id; }) : null; return !!f && (f.kind === 'resource' || (f.counter === true && (f.kind === 'number' || f.kind === 'skill'))); });
        if (canReset || sec.resetAll) {   // HUD frame (HF4b): a Reset all button in this section's header (its own words, e.g. Long rest)
            var rsRow = el('div', 'sys-sec-style'); rsRow.appendChild(el('span', 'sys-sec-style-lbl', 'Reset'));
            var rsl = el('label', 'sys-sec-color'); var rsc = el('input', 'sys-sec-resetall'); rsc.type = 'checkbox'; rsc.checked = !!sec.resetAll; rsl.appendChild(rsc); rsl.appendChild(document.createTextNode(' Reset all'));
            rsl.title = 'A button in this section\u2019s header that fills its pools back to full and sets its counters back to their start'; rsRow.appendChild(rsl);
            if (sec.resetAll) rsRow.appendChild(input('sys-sec-resettext field', sec.resetText, 'The button\u2019s text, e.g. Long rest', 'Reset all'));
            var nRs = (sec.fields || []).filter(function(pl) { var f = pl && pl.id ? draft.fields.find(function(x) { return x.id === pl.id; }) : null; return !!f && (f.kind === 'resource' || (f.counter === true && (f.kind === 'number' || f.kind === 'skill'))); }).length;
            if (sec.resetAll && nRs > LIMITS.editBatch) rsRow.appendChild(el('span', 'sys-warn-line sys-reset-note', 'Reset all resets the first ' + LIMITS.editBatch + ' of these ' + nRs + '.'));   // counted on every draw (validateSystem also warns)
            row.appendChild(rsRow);
        }
        var sifRow = el('div', 'sys-sec-style sys-sec-showifrow'); sifRow.appendChild(el('span', 'sys-sec-style-lbl', 'Show if'));   // Stage 6 HUD C8
        sifRow.appendChild(input('sys-sec-showif field', sec.showIf || '', 'Show this section only while the formula is true (a number other than 0, or yes): Stun > 0, Station == 2, not(Automaton). Empty: always. It only hides \u2014 the values still reach the player (GM only keeps a secret)', 'Always (e.g. Stun > 0)'));
        var sifN = showIfNote(sec.showIf); if (sifN) sifRow.appendChild(el('span', 'sys-warn-line', sifN));
        row.appendChild(sifRow);
        var list = el('div', 'sys-pl-list'); list.dataset.sid = sec.id;
        (sec.fields || []).forEach(function(pl, pi) {
            var text = placementLabel(pl, byId, rollById); if (text === null) return;
            var pr = el('div', 'sys-pl'); pr.dataset.sid = sec.id; pr.dataset.pi = String(pi); pr.draggable = true;
            pr.appendChild(el('span', 'sys-pl-grip', String.fromCharCode(8942)));
            pr.appendChild(el('span', 'sys-pl-name', text));
            if (pl.kind === 'heading') pr.appendChild(input('sys-pl-text field', pl.text, 'The heading\'s text', 'Heading text'));
            if (pl.kind === 'roller') { pr.appendChild(input('sys-pl-text field', pl.text, 'Its name on the roll\u2019s card (blank: Custom roll; the viewer can type their own)', 'Custom roll')); pr.appendChild(input('sys-pl-rformula field', pl.formula, 'The formula its box starts with (the viewer can change it)', '2d6 + 3')); }   // Stage 6 HUD H9
            if (pl.kind === 'text') { var rta = el('textarea', 'sys-pl-rtext field'); rta.value = pl.text || ''; rta.rows = 4; rta.maxLength = LIMITS.ruleText; rta.placeholder = 'The rules, as plain text. Line breaks are kept.'; rta.title = 'Shown as written, up to ' + LIMITS.ruleText + ' characters; players see it too'; rta.spellcheck = true; pr.appendChild(rta); }   // Stage 6 HUD H11
            if (pl.kind === 'pin') {   // Stage 6: which group it pins, and an optional label (blank = "Pin <group>")
                pr.appendChild(select('sys-pl-group', grpList.map(function(g) { return [g.id, g.label || 'Group']; }), pl.g || '', 'The band group this button pins'));
                var pgl = grpList.find(function(g) { return g.id === pl.g; }); pr.appendChild(input('sys-pl-text field', pl.text, 'The button\u2019s label (blank = \u201cPin\u201d and the group\u2019s name)', pgl ? 'Pin ' + (pgl.label || 'Group') : 'Label (optional)'));
            }
            if (pl.kind === 'link') {   // Stage 5f: which page, and an optional label (blank = the page's own title)
                pr.appendChild(select('sys-pl-page', pageOptions(pl.page, pl.page ? null : 'Choose a page\u2026'), pl.page || '', 'The handbook page this button opens'));
                pr.appendChild(input('sys-pl-text field', pl.text, 'The button\'s label (blank = the page\'s title)', 'Label (optional)'));
                var lkSay = typeof linkPageSays === 'function' ? linkPageSays(pl) : ''; if (lkSay) pr.appendChild(el('span', 'sys-warn-line', lkSay));   // 1.6.3: a link with no page, or a page that is gone, shows on no sheet
            }
            if (pl.kind === 'hud') {   // HUD frame (HF2b): the HUD tab it opens (none: the tab it shows if it is open, else its first) and its own words
                var hTabs = (draft.sheet && draft.sheet.hud && Array.isArray(draft.sheet.hud.tabs)) ? draft.sheet.hud.tabs : [], hOpts = [['', 'Its current tab (first when closed)']];
                hTabs.forEach(function(x) { if (x && typeof x.id === 'string') hOpts.push([x.id, 'Tab: ' + (x.label || 'Tab')]); });
                if (pl.tab && !hTabs.some(function(x) { return x && x.id === pl.tab; })) hOpts.push([pl.tab, '(tab not found)']);
                pr.appendChild(select('sys-pl-hudtab', hOpts, pl.tab || '', 'The HUD tab this button opens'));
                pr.appendChild(input('sys-pl-text field', pl.text, 'The button\'s label (blank = Open and the HUD\'s title)', 'Open the HUD'));
            }
            var hasIf = typeof pl.showIf === 'string', ifb = el('button', 'tool ghost sys-btn sys-pl-if' + (hasIf ? ' on' : ''), 'if'); ifb.dataset.act = 'plif'; ifb.title = hasIf ? 'Always show it again' : 'Show it only while a formula is true'; pr.appendChild(ifb);   // Stage 6 HUD C8
            if (hasIf) { pr.appendChild(input('sys-pl-showif field', pl.showIf, 'Shown only while this is true (a number other than 0, or yes); no dice', 'e.g. Stun > 0')); var pifN = showIfNote(pl.showIf); if (pifN) pr.appendChild(el('span', 'sys-warn-line', pifN)); }
            var gmb = el('button', 'tool ghost sys-btn sys-pl-gm' + (pl.gm === true ? ' on' : ''), 'GM'); gmb.dataset.act = 'plgm'; gmb.title = pl.gm === true ? 'Shown on the GM\u2019s sheet alone. Press to show it to players too' : 'Show this on the GM\u2019s sheet alone. A card that asks a player for this roll still reaches them'; pr.appendChild(gmb);   // 1.6.0: the GM's alone
            var wb = el('button', 'tool ghost sys-btn sys-pl-w', pl.w === 'row' ? 'Full row' : '1 column'); wb.dataset.act = 'plw'; wb.title = 'Width: one column of the section, or the full row'; pr.appendChild(wb);
            var plf = pl.id && Object.prototype.hasOwnProperty.call(byId, pl.id) ? byId[pl.id] : null, plOn = plf && plf.kind === 'item-list' && plf.list && plf.list.on && typeof plf.list.on === 'object' ? plf.list.on : null;
            if (plOn || (pl.on && plf && plf.kind === 'item-list')) { var ob = el('button', 'tool ghost sys-btn sys-pl-on', pl.on ? 'Only ' + (plOn ? String(plOn.label || 'on').toLowerCase() : 'switched on') : 'All rows'); ob.dataset.act = 'plon'; ob.title = plOn ? 'Every row of the list, or only the rows switched on (' + (plOn.label || 'On') + '), e.g. the HUD\u2019s readied weapons' : 'Its list has no switch now, so every row shows: click to clear it'; pr.appendChild(ob); }   // F4b (review: kept while set, so it can be cleared)
            if (plf && plf.kind === 'item-list' && typeof placeCatBtn === 'function') { var pbL = plf.list && plf.list.placeBy ? ((plf.list.stats || []).filter(function(s) { return s && typeof s.key === 'string' && s.key.toLowerCase() === String(plf.list.placeBy).toLowerCase(); }).map(function(s) { return s.label || s.key; })[0] || '') : '', pcB = placeCatBtn(pl, pbL); if (pcB) pr.appendChild(pcB); }   // 1.5.5: By category (1.6.0 R13: or by the list's choice stat)
            if (plf && plf.kind === 'item-list') { var cnB = el('button', 'tool ghost sys-btn sys-pl-count' + (pl.count === true ? ' on' : ''), pl.count === true ? 'Rows counted' : 'Count rows'); cnB.dataset.act = 'plcount'; cnB.title = pl.count === true ? 'Its section\u2019s title shows how many rows this place shows. Press to stop counting' : 'Show in its section\u2019s title how many rows this place shows, such as Melee Technique (3)'; pr.appendChild(cnB); }   // 1.6.0, backlog 180 R9
            if (plf && plf.kind === 'item-list') pr.appendChild(input('sys-pl-empty field', pl.empty || '', 'What this place says when it shows no row. Empty: No items.', 'When empty'));   // 191
            if (plf && plf.kind === 'item-list') pr.appendChild(select('sys-pl-tiles', [['', 'Shows as a list'], ['tiles', 'Shows as tiles'], ['tiles+', 'Both, tiles first'], ['list+', 'Both, list first']], typeof pl.show === 'string' ? pl.show : '', 'How this place shows its rows. With both, the sheet has a switch, and each person\u2019s choice is kept on their computer'));   // 1.6.2 (body fold 3)
            pr.appendChild(btnRow([['plup', 'Move up', '&#9650;'], ['pldown', 'Move down', '&#9660;'], ['pldel', 'Take off the sheet (the field stays defined)', '&times;']]));
            list.appendChild(pr);
            if (plf && plf.kind === 'item-list' && typeof placeCatPart === 'function') placeCatPart(list, pl, sec, pi, plf, secs);   // 1.5.5: its categories, and what Save does with it
        });
        row.appendChild(list);
        var addRow = el('div', 'sys-row-main sys-pl-addrow');
        addRow.appendChild(lazySelect('sys-pl-add', addOpts, '', 'A field not yet on the sheet, a roll button, a heading, a divider, the portrait, a facing dial, a stance control or a handbook link'));
        row.appendChild(addRow);
        if (typeof hintBox === 'function') row.appendChild(hintBox(sec));   // 1.6.2 (backlog 218 fold 4)
        if (typeof explainBox === 'function') row.appendChild(explainBox(sec));   // 1.6.2 (backlog 218 fold 3)
        root.appendChild(row);
    });
    if (typeof window !== 'undefined' && window.wpSysUi && window.wpSysUi.layoutDrawn) window.wpSysUi.layoutDrawn(root);   // 1.6.2: its parts down the side, one in view
    renderPreview();
}
// what a section's Add list offers, one list for the tab
function layoutAddOpts(placed, hudOn, onSheet, grpList) {
    var opts = [['', 'Add to this section\u2026']], inHdr = headerEdits(draft, hudOn ? (draft.sheet && draft.sheet.hud) || null : undefined);
    draft.fields.forEach(function(f) { if (placed[f.id] && f.kind === 'item-list') opts.push(['f:' + f.id, (f.label || f.key || '(field)') + ' again, for other categories']); });   // 1.5.5: a list placed once a category
    draft.fields.forEach(function(f) { if (!placed[f.id]) opts.push(['f:' + f.id, fieldWord(f) + (inHdr[f.id] === 1 ? ' (in the header)' : '') + (hudOn && onSheet[f.id] ? ' (on the sheet)' : '')]); });   // Stage 6: the GM is told a field is already edited in the header
    draft.rolls.forEach(function(r) { opts.push(['r:' + r.id, rollPick(r)]); });
    opts.push(['k:heading', 'Heading'], ['k:text', 'Rules text'], ['k:roller', 'Custom roller'], ['k:divider', 'Divider'], ['k:portrait', 'Portrait'], ['k:facing', 'Facing dial'], ['k:stance', 'Stance (posture & elevation)']);
    grpList.forEach(function(g) { opts.push(['p:' + g.id, 'Pin button: ' + (g.label || 'Group')]); });   // Stage 6: a band group's Pin, beside its figures
    if (pageOptions('', null).length) opts.push(['k:link', 'Handbook link'], ['k:search', 'Handbook search']);   // Stage 5f: only when the campaign has pages; H12: a search over them
    if (!hudOn && draftHasHud()) opts.push(['k:hud', 'HUD button']);   // HUD frame (HF2b): on the sheet, once there is a HUD to open
    return opts;
}
function renderPreview() {
    var box = ui('sysLayoutPreview'), pick = ui('sysPreviewChar'); if (!box || !draft || !F()) return;
    var camp = getActiveCampaign();
    if (pick) { var was = _arrChar || pick.value; arrCharSet(null); pick.textContent = ''; pick.appendChild(opt('', 'Defaults')); charList(camp).forEach(function(x) { pick.appendChild(opt(x.id, x.name + (x.npc ? ' (NPC)' : ''))); }); pick.value = Array.prototype.some.call(pick.options, function(o) { return o.value === was; }) ? was : ''; }
    var clean = cleanSystem(draft, { F: F(), gmView: true }); if (!clean) { box.textContent = ''; return; }
    var c = pick && pick.value ? charById(pick.value, camp) : null;
    var pc = c || { id: 'c_preview', name: 'Preview', ownerId: '', npc: false, values: {}, portrait: '' };
    if (!c) startRows(clean, pc, F());   // 1.6.0 Starts with: Defaults shows a character as it is made
    var pv = layoutView === 'hud' ? hudView(clean) : clean;   // Stage 6 HUD frame (HF1): the HUD's own layout, in the shared look
    box.classList.toggle('sys-layout-preview-hud', layoutView === 'hud');
    var arrN = !!(window.wpArrange && window.wpArrange.on());
    if (!pv) { box.textContent = ''; box.appendChild(el('div', 'sys-empty', arrN ? 'No HUD yet. Press + Section, or Copy the sheet\u2019s sections.' : 'No HUD yet: add a section, a band figure or a ledger figure on the left.')); if (arrN) window.wpArrange.sync(box, { sheet: { sections: [] } }); return; }
    fxLiveSet(false); try { buildSections(box, pv, pc, resolveAll(pv, pc, F(), pc && pc.id ? tokenCtxFor(pc.id, camp) : null), true, false, renderPreview, { campId: camp && camp.id, view: layoutView, preview: true, targets: pinTargetsAll(clean.sheet), arrange: !!(window.wpArrange && window.wpArrange.on()) }); } finally { fxLiveSet(true); }   // 5h: the preview's effect controls would act on the saved system, not the draft
    applySheetLookTo(box, sheetLook(camp, clean));   // the preview wears the sheet's look too
    syncFramePad(box);
    Array.prototype.forEach.call(box.children, function(ch) { ch.inert = true; });   // Stage 6: the preview draws a real character's values as the GM — no keyboard edit may reach it (the box itself stays the scroller)
    if (window.wpArrange) window.wpArrange.sync(box, pv);   // 1.6.2: Arrange's grips, on a layer of their own
}
function onLayoutInput(t) {
    var c = t.className || '';
    if (c.indexOf('sys-tab-icon') >= 0) { var itr = t.closest && t.closest('.sys-row.sys-tab'); if (itr) { var tbi = layoutTabs().find(function(x) { return x.id === itr.dataset.tid; }); if (tbi) { if (t.value.trim()) tbi.icon = t.value.slice(0, 32); else delete tbi.icon; markDirty(); renderPreview(); } } return true; }   // Stage 5g (Save trims it to a few code points)
    if (c.indexOf('sys-tab-label') >= 0) { var ltr = t.closest && t.closest('.sys-tab'); if (ltr) { var tb0 = layoutTabs().find(function(x) { return x.id === ltr.dataset.tid; }); if (tb0) { tb0.label = t.value.slice(0, LIMITS.label); markDirty(); renderPreview(); if (typeof patchErrors === 'function') patchErrors(); } } return true; }   // 1.6.3: the line under the label follows it
    if (t.classList && t.classList.contains('sys-hud-title')) { var hr = layoutRoot(); if (t.value.trim()) hr.title = t.value.slice(0, LIMITS.label); else delete hr.title; markDirty(); renderPreview(); return true; }   // HUD frame HF1 (before the section lookup: the title row is outside a section)
    var lsec = t.closest && t.closest('.sys-sec'); if (!lsec) return false;
    var sec = layoutSections().find(function(s) { return s.id === lsec.dataset.sid; }); if (!sec) return true;
    var plr = t.closest('.sys-pl');
    if (plr && c.indexOf('sys-pl-text') >= 0) { var pl = (sec.fields || [])[+plr.dataset.pi]; if (pl) pl.text = t.value.slice(0, LIMITS.label); }
    if (plr && c.indexOf('sys-pl-tiles') >= 0) { var plT = (sec.fields || [])[+plr.dataset.pi]; if (plT) { if (t.value) plT.show = t.value; else delete plT.show; markDirty(); renderPreview(); return true; } }   // 1.6.2 (body fold 3): Shows as
    if (plr && c.indexOf('sys-pl-empty') >= 0) { var ple = (sec.fields || [])[+plr.dataset.pi]; if (ple) { var pev = t.value.slice(0, LIMITS.label); if (pev.trim()) ple.empty = pev; else delete ple.empty; } }   // 191: When empty
    else if (plr && c.indexOf('sys-pl-rformula') >= 0) { var plf = (sec.fields || [])[+plr.dataset.pi]; if (plf) plf.formula = t.value.slice(0, LIMITS.formula); }   // Stage 6 HUD H9
    else if (plr && c.indexOf('sys-pl-rtext') >= 0) { var plt = (sec.fields || [])[+plr.dataset.pi]; if (plt) plt.text = t.value.slice(0, LIMITS.ruleText); }   // Stage 6 HUD H11
    else if (plr && c.indexOf('sys-pl-showif') >= 0) { var pls = (sec.fields || [])[+plr.dataset.pi]; if (pls) pls.showIf = t.value.slice(0, LIMITS.formula); }   // Stage 6 HUD C8 (kept while empty: the box stays)
    else if (t.classList.contains('sys-sec-showif')) { if (t.value.trim()) sec.showIf = t.value.slice(0, LIMITS.formula); else delete sec.showIf; }
    else if (t.classList.contains('sys-sec-title')) sec.title = t.value.slice(0, LIMITS.label);
    else if (t.classList.contains('sys-sec-icon')) { if (t.value.trim()) sec.icon = t.value.slice(0, 32); else delete sec.icon; }   // Stage 5g
    else if (t.classList.contains('sys-sec-resettext')) { if (t.value.trim()) sec.resetText = t.value.slice(0, LIMITS.label); else delete sec.resetText; }   // HUD frame (HF4b): the Reset all button's own words
    else return false;
    markDirty(); renderPreview(); return true;
}
function onLayoutChange(t) {
    var c = t.className || '', lsec = t.closest && t.closest('.sys-sec'); if (!lsec) return false;
    var sec = layoutSections().find(function(s) { return s.id === lsec.dataset.sid; }); if (!sec) return true;
    if (t.classList.contains('sys-sec-showif') || t.classList.contains('sys-pl-showif')) { renderLayout(); return true; }   // Stage 6 HUD C8: its note, once the box is left
    if (t.classList.contains('sys-pl-catcb') && typeof placeCatTick === 'function') { var pcr = t.closest('.sys-pl-catrow'), pcp = pcr ? (sec.fields || [])[+pcr.dataset.pi] : null; if (pcp && typeof t.dataset.cat === 'string') { placeCatTick(pcp, t.dataset.cat, t.checked); if (_plCatOpen) _plCatOpen.add(pcp); markDirty(); renderLayout(); placeCatRefocus(ui('sysLayoutSecs'), sec.id, +pcr.dataset.pi, t.dataset.cat); } return true; }   // 1.5.5: a place's categories
    if (t.classList.contains('sys-sec-tab')) { if (t.value) sec.tab = t.value; else delete sec.tab; markDirty(); renderPreview(); return true; }
    if (t.classList.contains('sys-sec-collap')) { if (t.value) sec.collapsible = true; else delete sec.collapsible; if (t.value === 'closed') sec.open = false; else delete sec.open; markDirty(); renderPreview(); return true; }   // 1.5.5: Starts closed is collapsible with open false; Collapsible and Fixed hold no open key
    if (t.classList.contains('sys-sec-inline')) { if (t.value) sec.inline = true; else delete sec.inline; markDirty(); renderPreview(); return true; }   // HUD frame (HF4a)
    if (t.classList.contains('sys-sec-resetall')) { if (t.checked) sec.resetAll = true; else delete sec.resetAll; markDirty(); renderLayout(); return true; }   // HUD frame (HF4b): its text box comes and goes
    if (t.classList.contains('sys-sec-chip')) { if (t.value) sec.chip = t.value; else delete sec.chip; markDirty(); renderPreview(); return true; }   // Stage 5f
    if (t.classList.contains('sys-sec-pin')) { if (t.value && PIN_GID.test(t.value)) sec.pin = t.value; else delete sec.pin; markDirty(); renderLayout(); return true; }   // Stage 6 (HUD frame HF0: exact class tokens — "sys-sec-pinned" contains "sys-sec-pin", so the Above-the-tabs select used to land here)
    if (c.indexOf('sys-pl-group') >= 0) { var plg = t.closest('.sys-pl'), plq = plg ? (sec.fields || [])[+plg.dataset.pi] : null; if (plq && plq.kind === 'pin' && PIN_GID.test(t.value)) { plq.g = t.value; markDirty(); renderLayout(); } return true; }   // Stage 6: a Pin button's group
    if (t.classList.contains('sys-pl-hudtab')) { var plh = t.closest('.sys-pl'), plx = plh ? (sec.fields || [])[+plh.dataset.pi] : null; if (plx && plx.kind === 'hud') { if (/^t_[A-Za-z0-9_]{1,24}$/.test(t.value)) plx.tab = t.value; else delete plx.tab; markDirty(); renderPreview(); } return true; }   // HF2b: a HUD button's tab
    if (c.indexOf('sys-pl-page') >= 0) { var plp = t.closest('.sys-pl'), plk = plp ? (sec.fields || [])[+plp.dataset.pi] : null; if (plk && plk.kind === 'link') { plk.page = t.value; markDirty(); renderLayout(); } return true; }   // Stage 5f: a link's page
    if (t.classList.contains('sys-sec-pinned')) { if (t.value) sec.pinned = true; else delete sec.pinned; markDirty(); renderPreview(); return true; }
    if (t.classList.contains('sys-sec-beside')) { if (t.value) sec.beside = true; else delete sec.beside; markDirty(); renderPreview(); return true; }   // 1.6.2
    if (t.classList.contains('sys-sec-meta')) { if (t.value) sec.meta = t.value; else delete sec.meta; markDirty(); renderPreview(); return true; }
    if (t.classList.contains('sys-sec-parent')) { var hadF = typeof document !== 'undefined' && !!document && document.activeElement === t; if (t.value) sec.parent = t.value; else { delete sec.parent; delete sec.first; } markDirty(); renderLayout(); if (hadF) secRefocus(ui('sysLayoutSecs'), sec.id, 'sys-sec-parent'); return true; }   // 1.5.5: back at the top level a section holds no first. The tab is drawn again, so After or Before its fields comes and goes and every Under list offers what is top level now, and the Under list takes the focus back, so its arrow keys go on stepping through it
    if (t.classList.contains('sys-sec-first')) { if (t.value && sec.parent) sec.first = true; else delete sec.first; markDirty(); renderPreview(); return true; }   // 1.5.5: Before its fields
    if (t.classList.contains('sys-sec-cols')) { sec.cols = Math.max(1, Math.min(4, Number(t.value) || 1)); markDirty(); renderPreview(); return true; }
    if (t.classList.contains('sys-sec-stripe')) { if (sec.style) { if (t.checked) delete sec.style.stripe; else sec.style.stripe = false; markDirty(); renderPreview(); } return true; }   // Stage 5g
    if (t.classList.contains('sys-sec-accent') || t.classList.contains('sys-sec-bg') || t.classList.contains('sys-sec-border')) {   // Stage 3: per-section colors
        var skey = t.classList.contains('sys-sec-accent') ? 'accent' : t.classList.contains('sys-sec-bg') ? 'bg' : 'border';
        sec.style = sec.style || {}; sec.style[skey] = t.value; markDirty(); renderLayout(); return true;   // renderLayout so the Clear button appears
    }
    if (c.indexOf('sys-pl-add') >= 0) {
        var v = t.value; t.value = ''; if (!v) return true;
        var total = 0; layoutSections().forEach(function(s) { total += (s.fields || []).length; });
        if (total >= LIMITS.placements) { toast('This view holds at most ' + LIMITS.placements + ' placements.'); return true; }
        sec.fields = sec.fields || [];
        var kind = v.slice(0, 1), id = v.slice(2), pl = null;
        if (kind === 'f') { if (draft.fields.some(function(f) { return f.id === id; })) pl = { id: id, w: 1 }; }
        else if (kind === 'r') { if (draft.rolls.some(function(r) { return r.id === id; })) pl = { roll: id, w: 1 }; }
        else if (kind === 'p') { if (PIN_GID.test(id) && (draft.sheet && Array.isArray(draft.sheet.bandGroups) ? draft.sheet.bandGroups : []).some(function(g) { return g && g.id === id; })) pl = { kind: 'pin', g: id, w: 1 }; }   // Stage 6
        else if (kind === 'k') { pl = { kind: id, w: id === 'portrait' || id === 'link' || id === 'facing' || id === 'stance' || id === 'hud' ? 1 : 'row' }; if (id === 'heading' || id === 'hud' || id === 'text') pl.text = ''; if (id === 'link') { var firstPage = pageOptions('', null)[0]; pl.text = ''; pl.page = firstPage ? firstPage[0] : ''; } }
        if (pl && kind === 'f' && typeof placeCatAgain === 'function') placeCatAgain(layoutSections(), pl, draft.fields);   // 1.5.5: a list placed again opens the category ticks of each of its places
        if (pl) { sec.fields.push(pl); markDirty(); renderLayout(); }
        return true;
    }
    return false;
}
function onLayoutClick(b) {
    if (b.closest && b.closest('#sysLayoutView') && (b.dataset.view === 'sheet' || b.dataset.view === 'hud')) { if (layoutView !== b.dataset.view) { layoutViewSet(b.dataset.view); var pvb = ui('sysLayoutPreview'); if (pvb) delete pvb.dataset.wpTab; renderLayout(); } return true; }   // HUD frame HF1: the Sheet | HUD switch (never marks the draft dirty)
    if ((b.id === 'sysAddSection' || b.id === 'sysLayoutAuto') && typeof window !== 'undefined' && window.wpSysUi && window.wpSysUi.topicPress) window.wpSysUi.topicPress('layout', 'sections');   // 1.6.2: what they make is in view
    if (b.id === 'sysLayoutAuto' && layoutView === 'hud') {   // HF1: copy the sheet's sections (or the automatic layout's) onto the HUD's first tab — fresh ids, parents remapped, no tab
        var clH = cleanSystem(draft, { F: F(), gmView: true }) || draft, srcS = (clH.sheet && Array.isArray(clH.sheet.sections) && clH.sheet.sections.length) ? clH.sheet.sections : autoLayout(clH).sections;
        var doCopy = function() {
            var idMap = {}, copies = [];
            srcS.slice(0, LIMITS.sections).forEach(function(s0) { idMap[s0.id] = uid('s_'); });
            srcS.slice(0, LIMITS.sections).forEach(function(s0) { var cp = clone(s0); cp.id = idMap[s0.id]; delete cp.tab; if (cp.parent) { if (idMap[cp.parent]) cp.parent = idMap[cp.parent]; else { delete cp.parent; delete cp.first; } } cp.fields = (cp.fields || []).filter(function(p) { return !(p && p.kind === 'hud'); }); copies.push(cp); });
            layoutRoot().sections = copies; markDirty(); renderLayout(); toast('The HUD now has a copy of the sheet\u2019s sections, on its first tab: trim them, and put them on the HUD\u2019s own tabs.');
        };
        if (layoutSections().length) showConfirm('Replace the HUD\u2019s sections with a copy of the sheet\u2019s? The HUD\u2019s title, tabs, band and ledger are kept.', function(yes) { if (yes) doCopy(); }); else doCopy();
        return true;
    }
    if (b.id === 'sysLayoutClear' && layoutView === 'hud') {   // HF1: take the HUD away (the sheet is untouched)
        if (!draftHasHud()) return true;   // nothing set (the view itself made an empty one)
        showConfirm('Remove the HUD? Its button goes from every sheet and menu; the sheet itself is untouched.', function(yes) { if (yes) { delete draft.sheet.hud; markDirty(); renderLayout(); } });
        return true;
    }
    if (b.id === 'sysAddSection') { var secsA = layoutSections(); if (secsA.length >= LIMITS.sections) { toast('At most ' + LIMITS.sections + ' sections.'); return true; } secsA.push({ id: uid('s_'), title: '', cols: 2, fields: [] }); markDirty(); renderLayout(); var last = ui('sysLayoutSecs').lastElementChild; if (last) { var ti = last.querySelector('.sys-sec-title'); if (ti) ti.focus(); } return true; }
    if (b.id === 'sysLayoutAuto') {   // rebuilds the sections; the tabs and the pinned band are kept (owner's call, Stage 5c) — the sections land on the first tab
        var keepGrp = sheetList('bandGroups'), keepHud = draft.sheet && draft.sheet.hud;   // Stage 6: the band's groups are kept with it (the new sections have no Pin yet, so they show)
        var cl = cleanSystem(draft, { F: F(), gmView: true }), keepId = sheetList('identity'), keepLed = sheetList('ledger'), keepTabs = layoutTabs().slice(), keepBand = (draft.sheet && Array.isArray(draft.sheet.band)) ? draft.sheet.band.slice() : [];
        var keepLook = (draft.sheet && draft.sheet.look && typeof draft.sheet.look === 'object') ? draft.sheet.look : null;   // Stage 5g: the shape lives in the Sheet look box — kept
        draft.sheet = { sections: autoLayout(cl || draft).sections }; if (keepLook) draft.sheet.look = keepLook; if (keepTabs.length) draft.sheet.tabs = keepTabs; if (keepBand.length) draft.sheet.band = keepBand;
        if (keepId.length) draft.sheet.identity = keepId; if (keepLed.length) draft.sheet.ledger = keepLed;   // Stage 5d: the header block is kept as well
        if (keepGrp.length) draft.sheet.bandGroups = keepGrp; if (keepHud) draft.sheet.hud = keepHud;   // HUD frame HF1: the HUD is kept
        var keptAny = keepTabs.length || keepBand.length || keepId.length || keepLed.length;
        markDirty(); renderLayout(); toast(keptAny ? 'The automatic layout is now yours to change; your tabs, header block and band are kept.' : 'The automatic layout is now yours to change.'); return true;
    }
    if (b.id === 'sysLayoutClear') { if (!layoutSections().length && !layoutTabs().length && !(draft.sheet && draft.sheet.band && draft.sheet.band.length) && !sheetList('identity').length && !sheetList('ledger').length) return true; showConfirm('Remove your layout? The sheet goes back to the automatic one (one section per kind, then the rolls), with no tabs, no identity rows or ledger figures and no pinned band (the Sheet look box and the HUD are kept).', function(yes) { if (yes) { var keepHud = draft.sheet && draft.sheet.hud, keepGrp2 = draft.sheet && draft.sheet.bandGroups; var keepShape = draft.sheet && draft.sheet.look; draft.sheet = { sections: [] }; if (keepShape) draft.sheet.look = keepShape; if (keepHud) { draft.sheet.hud = keepHud; if (keepGrp2 && Array.isArray(keepHud.band) && keepHud.band.some(function(q) { return q && q.g; })) draft.sheet.bandGroups = keepGrp2; } markDirty(); renderLayout(); } }); return true; }
    if (b.id === 'sysAddTab') { var tbs0 = layoutTabs(); if (tbs0.length >= LIMITS.tabs) { toast('At most ' + LIMITS.tabs + ' tabs.'); return true; } tbs0.push({ id: uid('t_'), label: 'Tab ' + (tbs0.length + 1) }); markDirty(); renderLayout(); return true; }
    var act = b.dataset.act; if (!act) return false;
    var ltab = b.closest('.sys-row.sys-tab');   // the Tabs manager's rows — every editor pane is a .sys-tab too, and matching the pane swallowed every other data-act button (fields, rolls, items, characters, sections)
    if (ltab) {
        var tbs = layoutTabs(), ti = -1; tbs.forEach(function(x, i) { if (x.id === ltab.dataset.tid) ti = i; }); if (ti < 0) return true;
        var tb = tbs[ti];
        if (act === 'tabup' && ti > 0) { tbs.splice(ti, 1); tbs.splice(ti - 1, 0, tb); }
        else if (act === 'tabdown' && ti < tbs.length - 1) { tbs.splice(ti, 1); tbs.splice(ti + 1, 0, tb); }
        else if (act === 'tabdel') { tbs.splice(ti, 1); layoutSections().forEach(function(s) { if (s.tab === tb.id) delete s.tab; }); }
        else return true;
        markDirty(); renderLayout(); return true;
    }
    var lsec = b.closest('.sys-sec'); if (!lsec) return false;
    var secs = layoutSections(), si = -1; secs.forEach(function(s, i) { if (s.id === lsec.dataset.sid) si = i; }); if (si < 0) return true;
    var sec = secs[si], plr = b.closest('.sys-pl');
    if (act === 'secup' && si > 0) { secs.splice(si, 1); secs.splice(si - 1, 0, sec); }
    else if (act === 'secdown' && si < secs.length - 1) { secs.splice(si, 1); secs.splice(si + 1, 0, sec); }
    else if (act === 'secdel') { secs.splice(si, 1); secs.forEach(function(o) { if (o && o.parent === sec.id) delete o.first; }); }   // 1.5.5: its sub-sections stand at the top level now, and keep no Before its fields
    else if (act === 'secstyleclr') { delete sec.style; }   // Stage 3: remove the section's colors
    else if (plr) {
        var list = sec.fields || [], pi = +plr.dataset.pi, pl = list[pi]; if (!pl) return true;
        if (act === 'plcats' && typeof placeCatRefocus === 'function') { if (_plCatOpen) { if (_plCatOpen.has(pl)) _plCatOpen.delete(pl); else _plCatOpen.add(pl); } renderLayout(); placeCatRefocus(ui('sysLayoutSecs'), sec.id, pi); return true; }   // 1.5.5: By category opens or closes the ticks (the draft is unchanged)
        if (act === 'plw') pl.w = pl.w === 'row' ? 1 : 'row';
        else if (act === 'plif') { if (typeof pl.showIf === 'string') delete pl.showIf; else pl.showIf = ''; }   // Stage 6 HUD C8: a show-if box for this placement
        else if (act === 'plgm') { if (pl.gm === true) delete pl.gm; else pl.gm = true; }   // 1.6.0: on the GM's sheet alone
        else if (act === 'plon') { if (pl.on) delete pl.on; else pl.on = true; }   // F4b: only the rows switched on
        else if (act === 'plcount') { if (pl.count === true) delete pl.count; else pl.count = true; }   // 1.6.0, backlog 180 R9: its rows counted in its section's title
        else if (act === 'plup' && pi > 0) { list.splice(pi, 1); list.splice(pi - 1, 0, pl); }
        else if (act === 'pldown' && pi < list.length - 1) { list.splice(pi, 1); list.splice(pi + 1, 0, pl); }
        else if (act === 'pldel') list.splice(pi, 1);
        else return true;
    } else return true;
    markDirty(); renderLayout(); return true;
}
// [systemcheck:arrhost-start] 1.6.2, backlog 171 (b): what Arrange reads of the draft and how it is told to draw
function arrHost() {
    var nameOfPl = function(pl) { var t = pl ? placementLabel(pl, Object.fromEntries(draft.fields.map(function(f) { return [f.id, f]; })), Object.fromEntries(draft.rolls.map(function(r) { return [r.id, r]; }))) : null; return t || 'this'; };
    var placedNow = function() { var m = {}; layoutSections().forEach(function(s) { (s.fields || []).forEach(function(p) { if (p && p.id) m['f:' + p.id] = 1; if (p && p.roll) m['r:' + p.roll] = 1; }); }); return m; };
    return {
        sections: layoutSections, tabs: layoutTabs, plName: nameOfPl, hud: function() { return layoutView === 'hud'; },
        restore: function(list) { layoutRoot().sections = list; markDirty(); renderPreview(); },
        changed: function() { markDirty(); renderPreview(); },
        full: function() { var n = 0; layoutSections().forEach(function(s) { n += (s.fields || []).length; }); return n >= LIMITS.placements; },
        say: function(words) { toast(words); },
        pl: function(v) { return v.slice(0, 2) === 'f:' ? { id: v.slice(2), w: 1 } : v.slice(0, 2) === 'r:' ? { roll: v.slice(2), w: 1 } : null; },
        unplaced: function() { var m = placedNow(), out = []; draft.fields.forEach(function(f) { if (!m['f:' + f.id]) out.push({ v: 'f:' + f.id, name: f.label || f.key || '(field)' }); }); draft.rolls.forEach(function(r) { if (!m['r:' + r.id]) out.push({ v: 'r:' + r.id, name: 'Roll: ' + (r.label || '(roll)') }); }); return out; },
        showTab: function(id) { var box = ui('sysLayoutPreview'); if (box && box.dataset.wpTab !== id) { box.dataset.wpTab = id; renderPreview(); } }
    };
}
// 1.6.2 (found building a system from nothing): a key is a word a newcomer has no reason to know, so a field with none takes one from its label, and
// follows the label until it is typed by hand
var _keyAuto = new WeakSet();
function keyFromLabel(label, f) {
    var k = String(label || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/ +/).map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join('').replace(/^[0-9]+/, '').slice(0, 24);
    if (!k) return '';
    var taken = {}; draft.fields.forEach(function(o) { if (o !== f && o && typeof o.key === 'string') taken[o.key.toLowerCase()] = 1; });
    var out = k, n = 2; while (taken[out.toLowerCase()]) out = k + (n++);
    return validKey(out, F()) ? out : '';
}
function keyFollows(f, t) {
    if (f.key && !_keyAuto.has(f)) return;
    _keyAuto.add(f); f.key = keyFromLabel(f.label, f);
    var row = t.closest ? t.closest('.sys-row, .sys-pick-open, .sys-open') : null, kb = row && row.querySelector ? row.querySelector('.sys-key') : null; if (kb) kb.value = f.key;
}
function arrSet(on) {
    if (!window.wpArrange) return;
    if (on && !layoutSections().length && layoutView === 'sheet') { var au = ui('sysLayoutAuto'); if (au) au.click(); }   // the automatic layout is no list to arrange: it becomes yours first
    window.wpArrange.set(on); if (!on) renderLayout(); else renderPreview();
}
// [systemcheck:arrhost-end]
function wireLayoutDrag(ls) {   // HTML5 drag between and within sections (the combat roster's pattern)
    var dragPl = null;
    function clearMarks() { ls.querySelectorAll('.drop-before, .drop-end').forEach(function(x) { x.classList.remove('drop-before'); x.classList.remove('drop-end'); }); }
    ls.addEventListener('dragstart', function(e) { var pr = e.target.closest && e.target.closest('.sys-pl'); if (!pr) { e.preventDefault(); return; } dragPl = { sid: pr.dataset.sid, pi: +pr.dataset.pi }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'pl'); } catch (err) {} });
    ls.addEventListener('dragover', function(e) { if (!dragPl) return; var over = e.target.closest && e.target.closest('.sys-pl, .sys-pl-list'); if (!over) return; e.preventDefault(); clearMarks(); over.classList.add(over.classList.contains('sys-pl') ? 'drop-before' : 'drop-end'); });
    ls.addEventListener('drop', function(e) {
        if (!dragPl) return; e.preventDefault();
        var over = e.target.closest && e.target.closest('.sys-pl, .sys-pl-list'), from = dragPl; dragPl = null; clearMarks(); if (!over) return;
        var secs = layoutSections(), src = null, dst = null; secs.forEach(function(s) { if (s.id === from.sid) src = s; if (s.id === over.dataset.sid) dst = s; }); if (!src || !dst) return;
        var pl = (src.fields || []).splice(from.pi, 1)[0]; if (!pl) { renderLayout(); return; }
        dst.fields = dst.fields || [];
        var at = over.classList.contains('sys-pl') ? +over.dataset.pi : dst.fields.length;
        if (over.classList.contains('sys-pl') && src === dst && from.pi < at) at--;
        dst.fields.splice(at, 0, pl);
        markDirty(); renderLayout();
    });
    ls.addEventListener('dragend', function() { dragPl = null; clearMarks(); });
}
// [split:body-end]
return { _keyAuto: _keyAuto, arrHost: arrHost, arrSet: arrSet, keyFollows: keyFollows, keyFromLabel: keyFromLabel, onLayoutChange: onLayoutChange, onLayoutClick: onLayoutClick, onLayoutInput: onLayoutInput, placeCatErrs: placeCatErrs, placeCatNames: placeCatNames, renderLayout: renderLayout, renderPreview: renderPreview, wireLayoutDrag: wireLayoutDrag };   // [split:glue]
}   // [split:glue]
