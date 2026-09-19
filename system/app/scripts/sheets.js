/* Character sheets (1.5.0) — the UI half: the System editor (#systemModal — fields, rolls, characters, Start from a
   preset, export / import), the sheet panel over the play map (#sheetPanel), the hover-card and party-strip lines,
   token links (charId, write-through ownership), the feature switch `sheets` (wpSheetsSync), and the hooks net.js
   calls (playerSystem, charChanged, charGone, editResult). The pure half is systemcore.js; the wire is net.js;
   the engine formula.js. Design of record: docs/SHEET_BUILDER_PLAN.md. */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { showConfirm, showPrompt } from './dialogs.js';
import { LIMITS, KINDS, STORED, DEF_PROP, emptySystem, uid, validKey, cleanSystem, validateSystem, resolveAll, hoverLines, autoLayout, applyEdit, applyItemOp, fmtNum, initRoll, aliasFromShadowBase } from './systemcore.js';

var ui = function(id) { return document.getElementById(id); };
var NL = String.fromCharCode(10);
function F() { return window.wpFormula || null; }
function net() { return window.wpNet || null; }
function featureOn() { return window.wpVtt ? !!window.wpVtt.on('sheets') : true; }
function canWrite() { return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !window.wpStream; }
function isClient() { var n = net(); return !!(n && n.active && n.role === 'client' && !n.stream); }
function myId() { var n = net(); return n ? n.myId : null; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function opt(value, text, selected) { var o = el('option', null, text); o.value = value; if (selected) o.selected = true; return o; }
function pref(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
function imgSrc(p) { var n = net(); return n && n.assetSrc ? n.assetSrc(p) : p; }

/* ---------- the campaign's system and characters ---------- */
function systemOf(camp) { camp = camp || getActiveCampaign(); return camp && camp.system && typeof camp.system === 'object' ? camp.system : null; }
function playerSystem(camp) { camp = camp || getActiveCampaign(); if (!camp || !camp.system || !F()) return null; return cleanSystem(camp.system, { F: F(), gmView: false }); }
function charsOf(camp) { camp = camp || getActiveCampaign(); if (!camp) return {}; if (!camp.chars || typeof camp.chars !== 'object') camp.chars = {}; return camp.chars; }
function charList(camp) { return Object.values(charsOf(camp)).filter(function(c) { return c && typeof c === 'object'; }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name)); }); }
function charById(id, camp) { var cs = charsOf(camp); return id && cs[id] && typeof cs[id] === 'object' ? cs[id] : null; }
function playerNames(camp) {
    var out = {};
    if (camp && camp.players) Object.keys(camp.players).forEach(function(pid) { out[pid] = camp.players[pid].name || pid; });
    var n = net(); if (n && n.roster) Object.values(n.roster).forEach(function(p) { if (p && p.id) out[p.id] = p.name || p.id; });
    return out;
}
function ownerName(c, camp) { if (!c || !c.ownerId) return ''; var pn = playerNames(camp); return pn[c.ownerId] || c.ownerId; }
// write-through: a character's owner is stamped on every token that points at it (moves, arrival and the party strip keep reading the token)
function syncOwners(camp) {
    camp = camp || getActiveCampaign(); if (!camp) return 0;
    var cs = charsOf(camp), n = 0;
    Object.values(camp.items || {}).forEach(function(m) {
        if (!m || m.type !== 'map') return;
        (m.whiteboard || []).forEach(function(w) {
            if (!w || !w.charId) return;
            var c = cs[w.charId]; if (!c) return;
            if (c.ownerId) { if (w.ownerId !== c.ownerId) { w.ownerId = c.ownerId; n++; } }
            else if (w.ownerId) { delete w.ownerId; n++; }
        });
    });
    return n;
}
function bindPlayer(camp, c) { if (!c.ownerId) return; camp.players = camp.players || {}; camp.players[c.ownerId] = camp.players[c.ownerId] || { name: c.ownerId }; camp.players[c.ownerId].charName = c.name; }
function newCharacter(o) {
    var camp = getActiveCampaign(); if (!camp) return null;
    var c = { id: uid('c_'), name: String(o && o.name || 'New character').slice(0, LIMITS.charName), ownerId: o && o.ownerId ? String(o.ownerId).slice(0, 60) : '', portrait: o && o.portrait || '', npc: !!(o && o.npc), values: {}, updated: Date.now() };
    if (c.npc) c.ownerId = '';
    charsOf(camp)[c.id] = c;
    if (c.ownerId) bindPlayer(camp, c);
    return c;
}
function afterCharChange(c, whole, values) {
    var camp = getActiveCampaign(); if (!camp) return;
    c.updated = Date.now();
    syncOwners(camp);
    save(true);
    var n = net();
    if (n && n.active && n.role === 'host') { if (whole || !values) n.syncChar(c.id); else n.syncCharDelta(c.id, values); }
    if (window.appRender) window.appRender();
    if (sheetOpen === c.id) renderSheet();
}
function deleteCharacter(id) {
    var camp = getActiveCampaign(), c = charById(id, camp); if (!c) return;
    delete charsOf(camp)[id];
    Object.values(camp.items || {}).forEach(function(m) { if (m && m.type === 'map') (m.whiteboard || []).forEach(function(w) { if (w && w.charId === id) delete w.charId; }); });
    save(true);
    var n = net(); if (n && n.active && n.role === 'host') n.syncCharGone(id);
    if (sheetOpen === id) closeSheet();
    if (window.appRender) window.appRender();
}
// Link a token to a character (GM): the token adopts the character's owner, or an ownerless character adopts the token's
function linkToken(w, charId) {
    var camp = getActiveCampaign(); if (!camp || !w) return;
    if (!charId) { delete w.charId; save(true); return; }
    var c = charById(charId, camp); if (!c) return;
    w.charId = c.id;
    if (!w.charName) w.charName = c.name;
    if (!c.ownerId && w.ownerId && !c.npc) { c.ownerId = w.ownerId; bindPlayer(camp, c); afterCharChange(c, true); return; }
    syncOwners(camp); save(true);
}
function newFromToken(w) {
    var camp = getActiveCampaign(); if (!camp || !w) return null;
    var c = newCharacter({ name: w.charName || w.name || 'Character', ownerId: w.ownerId || '', portrait: w.src && /^[/]saves[/]images[/]/.test(w.src) ? w.src : '' });
    w.charId = c.id;
    afterCharChange(c, true);
    return c;
}
function charSelectHtml(w) {
    var camp = getActiveCampaign(); if (!camp) return '';
    var esc = function(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var cur = w.charId && charById(w.charId, camp) ? w.charId : '';
    var opts = '<option value=""' + (cur ? '' : ' selected') + '>' + (w.charId && !cur ? '(missing character)' : '&mdash; none &mdash;') + '</option>';
    charList(camp).forEach(function(c) { opts += '<option value="' + esc(c.id) + '"' + (c.id === cur ? ' selected' : '') + '>' + esc(c.name) + (c.npc ? ' (NPC)' : c.ownerId ? ' (' + esc(ownerName(c, camp)) + ')' : '') + '</option>'; });
    opts += '<option value="__new">New character from this token&hellip;</option>';
    return '<div class="field"><label for="wbCharSel">Character (sheet)</label><select id="wbCharSel">' + opts + '</select>' + (cur ? '<button class="tool ghost" id="wbCharOpen" style="width:100%; margin-top:4px;" title="Open this character\'s sheet over the play map">Open sheet</button>' : '') + '</div>';
}
function wireCharSelect(w, rerender) {
    var sel = ui('wbCharSel'); if (!sel) return;
    sel.addEventListener('change', function() {
        var v = sel.value;
        if (v === '__new') { newFromToken(w); toast('Character created from ' + (w.charName || 'this token') + '.'); }
        else { linkToken(w, v); toast(v ? 'Token linked to ' + (charById(v) || {}).name + '.' : 'Token unlinked from its character.'); }
        if (rerender) rerender();
    });
    var ob = ui('wbCharOpen'); if (ob) ob.addEventListener('click', function() { openSheet(w.charId); });
}

/* ---------- hover lines ---------- */
function hoverLinesForToken(w, camp) {
    if (!w || !w.charId || !featureOn() || !F()) return [];
    camp = camp || getActiveCampaign(); var sys = systemOf(camp), c = charById(w.charId, camp);
    if (!sys || !c) return [];
    if (c.npc && isClient()) return [];
    try { return hoverLines(sys, c, F()); } catch (e) { return []; }
}
function hoverLinesForTokenId(camp, tokId) {
    if (!camp || !tokId) return [];
    var w = null; Object.values(camp.items || {}).some(function(m) { if (!m || m.type !== 'map') return false; w = (m.whiteboard || []).find(function(x) { return x && x.id === tokId; }) || null; return !!w; });
    return w ? hoverLinesForToken(w, camp) : [];
}

/* ---------- the sheet panel ---------- */
var sheetOpen = null, lastChange = null;
function canOpen(charId) {
    if (!featureOn()) return false;
    var c = charById(charId); if (!c) return false;
    if (isClient()) return !!(c.ownerId && c.ownerId === myId());
    return !window.wpStream;
}
function openSheet(charId) {
    if (!canOpen(charId)) { toast(featureOn() ? 'That sheet is not yours to open.' : 'Character sheets are off here.'); return; }
    sheetOpen = charId;
    var p = ui('sheetPanel'); if (!p) return;
    p.style.display = 'flex'; placeSheet(); renderSheet();
}
function closeSheet() { sheetOpen = null; var p = ui('sheetPanel'); if (p) p.style.display = 'none'; }
function placeSheet() { var p = ui('sheetPanel'); if (!p) return; try { var pos = JSON.parse(pref('wp_sheetPanel', 'null')); if (pos && isFinite(pos.x) && isFinite(pos.y)) { p.style.left = Math.max(0, Math.min(window.innerWidth - 160, pos.x)) + 'px'; p.style.top = Math.max(0, Math.min(window.innerHeight - 80, pos.y)) + 'px'; p.style.right = 'auto'; } } catch (e) {} }
function focusKeyOf(root) { var ae = document.activeElement; if (!ae || !root.contains(ae) || !ae.dataset || !ae.dataset.fid) return null; var k = { fid: ae.dataset.fid, part: ae.dataset.part || '' }; try { k.sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) {} return k; }
function restoreFocus(root, k) { if (!k) return; var q = root.querySelector('[data-fid="' + k.fid + '"]' + (k.part ? '[data-part="' + k.part + '"]' : '')); if (q) { try { q.focus({ preventScroll: true }); if (k.sel && k.sel[0] != null && q.setSelectionRange) q.setSelectionRange(k.sel[0], k.sel[1]); } catch (e) {} } }
function renderSheet() {
    var p = ui('sheetPanel'); if (!p || p.style.display === 'none') return;
    var camp = getActiveCampaign(), sys = systemOf(camp), c = charById(sheetOpen, camp);
    var body = ui('sheetBody'), head = ui('sheetTitle'), sub = ui('sheetSub'), fk = focusKeyOf(body);
    if (!c || !sys || !F()) { closeSheet(); return; }
    var gm = !isClient(), own = !!(c.ownerId && c.ownerId === myId());
    head.textContent = c.name;
    sub.textContent = (c.npc ? 'NPC' : c.ownerId ? ownerName(c, camp) : 'unassigned') + (c.partial ? ' · hover fields only' : '') + (gm && lastChange && lastChange.charId === c.id ? '' : '');
    var revert = ui('sheetRevert'); if (revert) revert.style.display = gm && lastChange && lastChange.charId === c.id ? '' : 'none';
    var pick = ui('sheetPick'); if (pick) { pick.textContent = ''; if (gm) { charList(camp).forEach(function(x) { pick.appendChild(opt(x.id, x.name + (x.npc ? ' (NPC)' : ''), x.id === c.id)); }); pick.style.display = ''; } else pick.style.display = 'none'; }
    var por = ui('sheetPortrait'); if (por) { if (c.portrait) { por.src = imgSrc(c.portrait); por.style.display = ''; } else por.style.display = 'none'; }
    var all = resolveAll(sys, c, F());
    buildSections(body, sys, c, all, gm, own);
    restoreFocus(body, fk);
}
function buildSections(body, sys, c, all, gm, own) {   // the sheet's sections into a container: the panel, and the Layout tab's preview
    var layout = sys.sheet && sys.sheet.sections && sys.sheet.sections.length ? sys.sheet.sections : autoLayout(sys).sections;
    var byId = {}; sys.fields.forEach(function(f) { byId[f.id] = f; }); var rollById = {}; sys.rolls.forEach(function(r) { rollById[r.id] = r; });
    body.textContent = '';
    layout.forEach(function(sec) {
        var s = el('div', 'sheet-section');
        if (sec.title) s.appendChild(el('div', 'sheet-sec-title', sec.title));
        var grid = el('div', 'sheet-grid'); grid.style.gridTemplateColumns = 'repeat(' + Math.max(1, Math.min(4, sec.cols || 1)) + ', minmax(0, 1fr))';
        (sec.fields || []).forEach(function(pl) {
            var node = null;
            if (pl.id && byId[pl.id]) node = fieldNode(byId[pl.id], c, all[pl.id], gm, own);
            else if (pl.roll && rollById[pl.roll]) node = rollNode(rollById[pl.roll], c);
            else if (pl.kind === 'heading') node = el('div', 'sheet-heading', pl.text || '');
            else if (pl.kind === 'divider') node = el('div', 'sheet-divider');
            else if (pl.kind === 'portrait') { node = el('div', 'sheet-portrait-slot'); if (c.portrait) { var im = el('img'); im.src = imgSrc(c.portrait); im.alt = ''; node.appendChild(im); } }
            if (!node) return;
            if (pl.w === 'row') node.classList.add('sheet-row');
            grid.appendChild(node);
        });
        if (grid.childNodes.length) { s.appendChild(grid); body.appendChild(s); }
    });
    if (!body.childNodes.length) body.appendChild(el('div', 'sys-empty', sys.fields.length ? 'Nothing placed on the sheet yet.' : 'The system has no fields yet. Open the System editor.'));
}
/* ---------- the Layout tab (SB4): sections, columns, placements, a live preview ---------- */
function layoutSections() { if (!draft.sheet || !Array.isArray(draft.sheet.sections)) draft.sheet = { sections: [] }; return draft.sheet.sections; }
function placementLabel(pl, byId, rollById) {
    if (pl.id) { var f = byId[pl.id]; return f ? (f.label || f.key || '(field)') + (f.key && f.label ? ' (' + f.key + ')' : '') : null; }
    if (pl.roll) { var r = rollById[pl.roll]; return r ? 'Roll: ' + (r.label || r.formula) : null; }
    if (pl.kind === 'heading') return 'Heading'; if (pl.kind === 'divider') return 'Divider'; if (pl.kind === 'portrait') return 'Portrait';
    return null;
}
function renderLayout() {
    var root = ui('sysLayoutSecs'); if (!root || !draft) return;
    var secs = layoutSections(), byId = {}, rollById = {}, placed = {};
    draft.fields.forEach(function(f) { byId[f.id] = f; }); draft.rolls.forEach(function(r) { rollById[r.id] = r; });
    secs.forEach(function(s) { (s.fields || []).forEach(function(p) { if (p.id) placed[p.id] = 1; }); });
    root.textContent = '';
    if (!secs.length) root.appendChild(el('div', 'sys-empty', 'No layout of your own yet: the sheet shows the automatic layout (one section per kind, then the rolls). Start from it, or add a section.'));
    secs.forEach(function(sec) {
        var row = el('div', 'sys-row sys-sec'); row.dataset.sid = sec.id;
        var top = el('div', 'sys-row-main');
        top.appendChild(input('sys-sec-title field', sec.title, 'The section\'s title on the sheet (empty = none)', 'Section title'));
        top.appendChild(select('sys-sec-cols', [[1, '1 column'], [2, '2 columns'], [3, '3 columns'], [4, '4 columns']], Math.max(1, Math.min(4, sec.cols || 1)), 'Fields per row in this section'));
        top.appendChild(btnRow([['secup', 'Move this section up', '&#9650;'], ['secdown', 'Move this section down', '&#9660;'], ['secdel', 'Remove this section (its fields go back to the list)', '&times;']]));
        row.appendChild(top);
        var list = el('div', 'sys-pl-list'); list.dataset.sid = sec.id;
        (sec.fields || []).forEach(function(pl, pi) {
            var text = placementLabel(pl, byId, rollById); if (text === null) return;
            var pr = el('div', 'sys-pl'); pr.dataset.sid = sec.id; pr.dataset.pi = String(pi); pr.draggable = true;
            pr.appendChild(el('span', 'sys-pl-grip', String.fromCharCode(8942)));
            pr.appendChild(el('span', 'sys-pl-name', text));
            if (pl.kind === 'heading') pr.appendChild(input('sys-pl-text field', pl.text, 'The heading\'s text', 'Heading text'));
            var wb = el('button', 'tool ghost sys-btn sys-pl-w', pl.w === 'row' ? 'Full row' : '1 column'); wb.dataset.act = 'plw'; wb.title = 'Width: one column of the section, or the full row'; pr.appendChild(wb);
            pr.appendChild(btnRow([['plup', 'Move up', '&#9650;'], ['pldown', 'Move down', '&#9660;'], ['pldel', 'Take off the sheet (the field stays defined)', '&times;']]));
            list.appendChild(pr);
        });
        row.appendChild(list);
        var addRow = el('div', 'sys-row-main sys-pl-addrow'), opts = [['', 'Add to this section\u2026']];
        draft.fields.forEach(function(f) { if (!placed[f.id]) opts.push(['f:' + f.id, (f.label || f.key || '(field)') + (f.key ? ' (' + f.key + ')' : '')]); });
        draft.rolls.forEach(function(r) { opts.push(['r:' + r.id, 'Roll: ' + (r.label || r.formula)]); });
        opts.push(['k:heading', 'Heading'], ['k:divider', 'Divider'], ['k:portrait', 'Portrait']);
        addRow.appendChild(select('sys-pl-add', opts, '', 'A field not yet on the sheet, a roll button, a heading, a divider or the portrait'));
        row.appendChild(addRow);
        root.appendChild(row);
    });
    renderPreview();
}
function renderPreview() {
    var box = ui('sysLayoutPreview'), pick = ui('sysPreviewChar'); if (!box || !draft || !F()) return;
    var camp = getActiveCampaign();
    if (pick) { var was = pick.value; pick.textContent = ''; pick.appendChild(opt('', 'Defaults')); charList(camp).forEach(function(x) { pick.appendChild(opt(x.id, x.name + (x.npc ? ' (NPC)' : ''))); }); pick.value = Array.prototype.some.call(pick.options, function(o) { return o.value === was; }) ? was : ''; }
    var clean = cleanSystem(draft, { F: F(), gmView: true }); if (!clean) { box.textContent = ''; return; }
    var c = pick && pick.value ? charById(pick.value, camp) : null;
    var pc = c || { id: 'c_preview', name: 'Preview', ownerId: '', npc: false, values: {}, portrait: '' };
    buildSections(box, clean, pc, resolveAll(clean, pc, F()), true, false);
}
function onLayoutInput(t) {
    var c = t.className || '', lsec = t.closest && t.closest('.sys-sec'); if (!lsec) return false;
    var sec = layoutSections().find(function(s) { return s.id === lsec.dataset.sid; }); if (!sec) return true;
    var plr = t.closest('.sys-pl');
    if (plr && c.indexOf('sys-pl-text') >= 0) { var pl = (sec.fields || [])[+plr.dataset.pi]; if (pl) pl.text = t.value.slice(0, LIMITS.label); }
    else if (c.indexOf('sys-sec-title') >= 0) sec.title = t.value.slice(0, LIMITS.label);
    else return false;
    markDirty(); renderPreview(); return true;
}
function onLayoutChange(t) {
    var c = t.className || '', lsec = t.closest && t.closest('.sys-sec'); if (!lsec) return false;
    var sec = layoutSections().find(function(s) { return s.id === lsec.dataset.sid; }); if (!sec) return true;
    if (c.indexOf('sys-sec-cols') >= 0) { sec.cols = Math.max(1, Math.min(4, Number(t.value) || 1)); markDirty(); renderPreview(); return true; }
    if (c.indexOf('sys-pl-add') >= 0) {
        var v = t.value; t.value = ''; if (!v) return true;
        var total = 0; layoutSections().forEach(function(s) { total += (s.fields || []).length; });
        if (total >= LIMITS.placements) { toast('The sheet holds at most ' + LIMITS.placements + ' placements.'); return true; }
        sec.fields = sec.fields || [];
        var kind = v.slice(0, 1), id = v.slice(2), pl = null;
        if (kind === 'f') { if (draft.fields.some(function(f) { return f.id === id; })) pl = { id: id, w: 1 }; }
        else if (kind === 'r') { if (draft.rolls.some(function(r) { return r.id === id; })) pl = { roll: id, w: 1 }; }
        else if (kind === 'k') { pl = { kind: id, w: id === 'portrait' ? 1 : 'row' }; if (id === 'heading') pl.text = ''; }
        if (pl) { sec.fields.push(pl); markDirty(); renderLayout(); }
        return true;
    }
    return false;
}
function onLayoutClick(b) {
    if (b.id === 'sysAddSection') { var secsA = layoutSections(); if (secsA.length >= LIMITS.sections) { toast('At most ' + LIMITS.sections + ' sections.'); return true; } secsA.push({ id: uid('s_'), title: '', cols: 2, fields: [] }); markDirty(); renderLayout(); var last = ui('sysLayoutSecs').lastElementChild; if (last) { var ti = last.querySelector('.sys-sec-title'); if (ti) ti.focus(); } return true; }
    if (b.id === 'sysLayoutAuto') { var cl = cleanSystem(draft, { F: F(), gmView: true }); draft.sheet = { sections: autoLayout(cl || draft).sections }; markDirty(); renderLayout(); toast('The automatic layout is now yours to change.'); return true; }
    if (b.id === 'sysLayoutClear') { if (!layoutSections().length) return true; showConfirm('Remove your layout? The sheet goes back to the automatic one (one section per kind, then the rolls).', function(yes) { if (yes) { draft.sheet = { sections: [] }; markDirty(); renderLayout(); } }); return true; }
    var act = b.dataset.act; if (!act) return false;
    var lsec = b.closest('.sys-sec'); if (!lsec) return false;
    var secs = layoutSections(), si = -1; secs.forEach(function(s, i) { if (s.id === lsec.dataset.sid) si = i; }); if (si < 0) return true;
    var sec = secs[si], plr = b.closest('.sys-pl');
    if (act === 'secup' && si > 0) { secs.splice(si, 1); secs.splice(si - 1, 0, sec); }
    else if (act === 'secdown' && si < secs.length - 1) { secs.splice(si, 1); secs.splice(si + 1, 0, sec); }
    else if (act === 'secdel') { secs.splice(si, 1); }
    else if (plr) {
        var list = sec.fields || [], pi = +plr.dataset.pi, pl = list[pi]; if (!pl) return true;
        if (act === 'plw') pl.w = pl.w === 'row' ? 1 : 'row';
        else if (act === 'plup' && pi > 0) { list.splice(pi, 1); list.splice(pi - 1, 0, pl); }
        else if (act === 'pldown' && pi < list.length - 1) { list.splice(pi, 1); list.splice(pi + 1, 0, pl); }
        else if (act === 'pldel') list.splice(pi, 1);
        else return true;
    } else return true;
    markDirty(); renderLayout(); return true;
}
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
function fieldNode(f, c, e, gm, own) {
    var box = el('div', 'sheet-field sheet-kind-' + f.kind);
    if (f.vis === 'gm') box.classList.add('sheet-gm');
    var lab = el('label', 'sheet-label', f.label); lab.title = f.key + (f.vis === 'gm' ? ' (GM only)' : ''); box.appendChild(lab);
    if (f.roll) { var rb = el('button', 'tool ghost sheet-field-roll', String.fromCharCode(55356, 57266)); rb.title = 'Roll ' + f.roll; rb.disabled = !canRoll(c); rb.addEventListener('click', function() { if (window.wpDice && window.wpDice.rollFor) window.wpDice.rollFor(c.id, f.roll, f.label || f.key); }); lab.appendChild(rb); }   // the field's own roll (1.5.0)
    var editable = gm || (own && f.edit === 'owner' && f.vis === 'all');
    var raw = c.values ? c.values[f.id] : undefined;
    var k = f.kind;
    if (k === 'formula') { var v = el('div', 'sheet-value' + (e && e.error ? ' sheet-err' : ''), e && e.error ? '—' : e ? e.text : ''); v.title = e && e.error ? e.error : f.formula || ''; box.appendChild(v); return box; }
    if (k === 'number' || k === 'skill') {
        var row = el('div', 'sheet-ctl');
        var inp = el('input', 'field sheet-num'); inp.type = 'number'; inp.dataset.fid = f.id; inp.value = raw === undefined ? String(f.def) : String(raw);
        if (f.min !== undefined) inp.min = String(f.min); if (f.max !== undefined) inp.max = String(f.max); inp.step = String(f.step || 1); inp.disabled = !editable;
        inp.addEventListener('change', function() { commit(c, f, Number(inp.value)); });
        row.appendChild(inp);
        if (k === 'skill') { var tot = el('span', 'sheet-total' + (e && e.error ? ' sheet-err' : ''), e && e.error ? '—' : '= ' + (e ? e.text : '')); tot.title = e && e.error ? e.error : (f.base ? 'ranks + ' + f.base : 'ranks'); row.appendChild(tot); }
        box.appendChild(row); return box;
    }
    if (k === 'resource') {
        var cur = e && typeof e.value === 'number' ? e.value : 0, max = e && typeof e.max === 'number' ? e.max : null;
        var r = el('div', 'sheet-ctl');
        var minus = el('button', 'tool ghost sheet-pm', '−'); minus.dataset.fid = f.id; minus.dataset.part = 'minus'; minus.title = 'One less'; minus.disabled = !editable;
        var ci = el('input', 'field sheet-num sheet-cur'); ci.type = 'number'; ci.dataset.fid = f.id; ci.value = String(cur); ci.disabled = !editable; if (f.min !== undefined) ci.min = String(f.min); if (max !== null) ci.max = String(max);
        var plus = el('button', 'tool ghost sheet-pm', '+'); plus.dataset.fid = f.id; plus.dataset.part = 'plus'; plus.title = 'One more'; plus.disabled = !editable;
        var mx = el('span', 'sheet-total' + (e && e.error ? ' sheet-err' : ''), '/ ' + (max === null ? '—' : fmtNum(max))); mx.title = e && e.error ? e.error : (f.maxFormula || 'no max');
        minus.addEventListener('click', function() { commit(c, f, { cur: cur - 1 }); });
        plus.addEventListener('click', function() { commit(c, f, { cur: cur + 1 }); });
        ci.addEventListener('change', function() { commit(c, f, { cur: Number(ci.value) }); });
        r.appendChild(minus); r.appendChild(ci); r.appendChild(plus); r.appendChild(mx); box.appendChild(r);
        var bar = el('div', 'sheet-bar'); var fill = el('div', 'sheet-bar-fill'); var pct = max ? Math.max(0, Math.min(100, (cur - (f.min || 0)) / Math.max(1, max - (f.min || 0)) * 100)) : 0; fill.style.width = pct + '%'; bar.appendChild(fill); box.appendChild(bar);
        return box;
    }
    if (k === 'toggle') { var lb = el('label', 'sheet-toggle'); var cb = el('input'); cb.type = 'checkbox'; cb.dataset.fid = f.id; cb.checked = raw === undefined ? f.def === true : raw === true; cb.disabled = !editable; cb.addEventListener('change', function() { commit(c, f, cb.checked); }); lb.appendChild(cb); lb.appendChild(document.createTextNode(' ' + (cb.checked ? 'on' : 'off'))); box.appendChild(lb); return box; }
    if (k === 'text') { var ti = el('input', 'field sheet-text'); ti.type = 'text'; ti.dataset.fid = f.id; ti.maxLength = f.max || 200; ti.value = raw === undefined ? String(f.def || '') : String(raw); ti.disabled = !editable; ti.addEventListener('change', function() { commit(c, f, ti.value); }); box.appendChild(ti); return box; }
    if (k === 'notes') { var ta = el('textarea', 'field sheet-notes'); ta.dataset.fid = f.id; ta.rows = 4; ta.value = raw === undefined ? '' : String(raw); ta.disabled = !editable; var tmr = null; ta.addEventListener('input', function() { clearTimeout(tmr); tmr = setTimeout(function() { commit(c, f, ta.value); }, 600); }); ta.addEventListener('change', function() { clearTimeout(tmr); commit(c, f, ta.value); }); box.appendChild(ta); return box; }
    if (k === 'select') { var se = el('select', 'field sheet-select'); se.dataset.fid = f.id; (f.options || []).forEach(function(o) { se.appendChild(opt(o, o, (raw === undefined ? f.def : raw) === o)); }); se.disabled = !editable; se.addEventListener('change', function() { commit(c, f, se.value); }); box.appendChild(se); return box; }
    if (k === 'item-list') {
        var sysI = systemOf(getActiveCampaign()), carried = Array.isArray(raw) ? raw : [];
        var byId = {}; ((sysI && sysI.items) || []).forEach(function(it) { byId[it.id] = it; });
        var gmThrows = sysI && sysI.combat && sysI.combat.blastRoller === 'gm';
        var wrap = el('div', 'sheet-items'), canThrow = (gm || (own && !gmThrows)) && !c.partial;   // who-rolls='gm' means only the GM throws
        carried.forEach(function(entry) {
            var def = byId[entry.defId]; if (!def) return;
            var line = el('div', 'sheet-item');
            if (def.icon) line.appendChild(el('span', 'sheet-item-icon', def.icon));
            var nm = el('span', 'sheet-item-name', def.name); if (def.area) nm.appendChild(el('span', 'sheet-item-area-tag', ' ' + def.area.ft + ' ft')); if (def.notes) nm.title = def.notes; line.appendChild(nm);
            if (def.area && canThrow) { var tb = el('button', 'tool ghost sheet-item-throw', '💥 Throw'); tb.title = 'Throw ' + def.name + ' — then click the map'; tb.addEventListener('click', function() { if (window.wpArmBlast) { window.wpArmBlast(def.area.ft, def.area.name || def.name, { charId: c.id, itemId: def.id, by: c.name, damage: def.damage || '' }); closeSheet(); } }); line.appendChild(tb); }
            if (editable) {
                var qc = el('span', 'sheet-item-qty');
                var mn = el('button', 'tool ghost sheet-pm', '−'); mn.title = 'One less (removes at zero)'; mn.addEventListener('click', function() { commitItem(c, f, 'setQty', entry.defId, entry.qty - 1); });
                qc.appendChild(mn); qc.appendChild(el('span', 'sheet-item-qtyn', '×' + entry.qty));
                var pl = el('button', 'tool ghost sheet-pm', '+'); pl.title = 'One more'; pl.addEventListener('click', function() { commitItem(c, f, 'add', entry.defId, 1); });
                qc.appendChild(pl); line.appendChild(qc);
                var rm = el('button', 'tool ghost sheet-item-rm', '×'); rm.title = 'Remove ' + def.name; rm.addEventListener('click', function() { commitItem(c, f, 'remove', entry.defId, 0); }); line.appendChild(rm);
            } else line.appendChild(el('span', 'sheet-item-qtyn', '×' + entry.qty));
            wrap.appendChild(line);
        });
        if (!carried.length) wrap.appendChild(el('div', 'sheet-empty-note', 'No items.'));
        if (editable && sysI && sysI.items && sysI.items.length) {
            var add = el('select', 'field sheet-item-add'); add.appendChild(opt('', '+ Add item…', true));
            sysI.items.forEach(function(it) { add.appendChild(opt(it.id, (it.icon ? it.icon + ' ' : '') + it.name + (it.category ? ' — ' + it.category : ''))); });
            add.addEventListener('change', function() { if (add.value) commitItem(c, f, 'add', add.value, 1); });
            wrap.appendChild(add);
        }
        box.appendChild(wrap); return box;
    }
    return box;
}
function rollNode(r, c) {
    var b = el('button', 'tool sheet-roll', r.label); var can = canRoll(c); b.title = r.formula + (can ? '' : ' (dice are off here, or this is not your character)'); b.disabled = !can;
    b.addEventListener('click', function() { if (window.wpDice && window.wpDice.rollFor) window.wpDice.rollFor(c.id, r.formula, r.label); });
    var box = el('div', 'sheet-field sheet-kind-roll'); box.appendChild(b); return box;
}
// A roll from this character's sheet: the dice feature on, and for a player their own character
function canRoll(c) { if (!c || !window.wpDice || !window.wpDice.rollFor) return false; if (window.wpVtt && !window.wpVtt.on('dice')) return false; if (isClient()) return !!(c.ownerId && c.ownerId === myId() && !c.partial && !c.npc); return true; }
// The combat roster (whiteboard.js): initiative from the system's init roll, made at the table like any roll
function hasInitRoll() { var sys = systemOf(getActiveCampaign()); return !!(sys && initRoll(sys)); }
function rollInit(charId) {
    var camp = getActiveCampaign(), sys = systemOf(camp), c = charById(charId, camp), r = sys ? initRoll(sys) : null;
    if (!c || !r) return { error: 'No initiative roll in this system (tick Initiative on a roll in the System editor).' };
    if (!window.wpDice || !window.wpDice.rollFor) return { error: 'Dice are not available.' };
    if (window.wpVtt && !window.wpVtt.on('dice')) return { error: 'Dice are off for this campaign (Settings > VTT features).' };
    return window.wpDice.rollFor(charId, r.formula, r.label || 'Initiative', { source: 'combat' });
}
// One value changed on the open sheet: the GM applies it here; a player asks the host and shows it meanwhile
function commit(c, f, value) {
    var camp = getActiveCampaign(), sys = systemOf(camp); if (!camp || !sys) return;
    if (isClient()) {
        var n = net(); if (!n || !n.charEdit) return;
        var r = n.charEdit(c.id, f.id, value);
        if (r && r.error) toast(r.error);
        renderSheet();
        return;
    }
    if (!canWrite()) return;
    var res = applyEdit(sys, c, f.id, value, F(), {});
    if (!res.ok) { toast(res.reason === 'field' ? 'That field cannot be edited.' : 'That value is not allowed here.'); renderSheet(); return; }
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, f.id) ? clone(c.values[f.id]) : undefined;
    lastChange = { charId: c.id, fieldId: f.id, prev: prev };
    c.values = c.values || {}; c.values[f.id] = res.value;
    var d = {}; d[f.id] = res.value;
    afterCharChange(c, false, d);
}
// One inventory change on the open sheet (add / remove / setQty). Like commit, but for the item-list kind, which
// travels its own per-entry op (arrays can't ride the scalar char-edit path).
function commitItem(c, f, op, defId, qty) {
    var camp = getActiveCampaign(), sys = systemOf(camp); if (!camp || !sys) return;
    if (isClient()) {
        var n = net(); if (!n || !n.charItem) return;
        var r = n.charItem(c.id, f.id, op, defId, qty);
        if (r && r.error) toast(r.error);
        renderSheet();
        return;
    }
    if (!canWrite()) return;
    var res = applyItemOp(sys, c, f.id, op, defId, qty, {});
    if (!res.ok) { toast(res.reason === 'field' ? 'That list cannot be edited.' : res.reason === 'missing' ? 'That item is gone.' : 'That change is not allowed.'); renderSheet(); return; }
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, f.id) ? clone(c.values[f.id]) : undefined;
    lastChange = { charId: c.id, fieldId: f.id, prev: prev };
    c.values = c.values || {}; c.values[f.id] = res.value;
    var d = {}; d[f.id] = res.value;
    afterCharChange(c, false, d);
}
function revertLast() {
    if (!lastChange || isClient()) return;
    var camp = getActiveCampaign(), c = charById(lastChange.charId, camp); if (!c) { lastChange = null; return; }
    var d = {};
    if (lastChange.prev === undefined) { delete c.values[lastChange.fieldId]; d[lastChange.fieldId] = null; }
    else { c.values[lastChange.fieldId] = lastChange.prev; d[lastChange.fieldId] = lastChange.prev; }
    lastChange = null;
    afterCharChange(c, d[Object.keys(d)[0]] === null, d);
    toast('Reverted.');
}
// The ShadowBase bridge (decision 10g, copy once): the sheet attached to a token gives its attributes, resources and
// skills to a campaign character through the alias table; a token without a character gets one named after it
function fromShadowBase(w) {
    var camp = getActiveCampaign(), sys = systemOf(camp);
    if (!w || !w.sheet) return { error: 'No ShadowBase sheet on this token.' };
    if (!sys || !F()) return { error: 'The campaign has no system yet (System in the Campaign pill).' };
    var r = aliasFromShadowBase(w.sheet, sys, F());
    if (!r.matched) return { error: 'Nothing on the sheet matches the system\'s keys (ST or STR, DX or DEX, HT or CON, IQ or INT, HP, FP, Will, Per, Dodge, Parry, skills by name).' };
    var c = w.charId ? charById(w.charId, camp) : null;
    if (!c) { c = newCharacter({ name: w.charName || w.name || w.sheet.name || 'Character', ownerId: w.ownerId || '' }); linkToken(w, c.id); }
    c.values = c.values || {}; Object.keys(r.values).forEach(function(k) { c.values[k] = r.values[k]; });
    afterCharChange(c, true);
    toast(r.matched + ' value' + (r.matched === 1 ? '' : 's') + ' copied into ' + c.name + '\'s sheet.');
    return { ok: true, charId: c.id, matched: r.matched };
}
// net.js hooks: a character arrived, changed or went
function charChanged(id) { if (sheetOpen && (id === null || sheetOpen === id)) renderSheet(); if (window.appRender) window.appRender(); if (window.wpRenderPartyStrip) window.wpRenderPartyStrip(); if (window.wpDice && window.wpDice.syncChars) window.wpDice.syncChars(); }
// the token's owner select moved (inspector.js): the character follows, and every token of it
function ownerFromToken(w) {
    var camp = getActiveCampaign(), c = w && w.charId ? charById(w.charId, camp) : null; if (!c || c.npc) return;
    if ((c.ownerId || '') === (w.ownerId || '')) return;
    c.ownerId = w.ownerId || ''; if (c.ownerId) bindPlayer(camp, c);
    afterCharChange(c, true);
}
function charGone(id) { if (sheetOpen === id) { closeSheet(); toast('That character is no longer shared with you.'); } if (window.appRender) window.appRender(); }
function editResult(rid, ok, reason) { if (!ok) toast(reason === 'off' ? 'Character sheets are off here.' : reason === 'owner' ? 'That sheet is not yours.' : reason === 'field' ? 'That field cannot be edited.' : reason === 'slow' ? 'Slow down a little.' : reason === 'missing' ? 'That character is gone.' : reason === 'timeout' ? 'No answer from the GM; the change was undone.' : 'That value was not accepted.'); renderSheet(); }

/* ---------- the editor: fields, rolls, characters ---------- */
var draft = null, dirty = false, tab = 'fields', errorsById = {}, warningsById = {};
var KIND_LABEL = { number: 'Number', formula: 'Formula', resource: 'Resource', skill: 'Skill', toggle: 'Toggle', text: 'Text', notes: 'Notes', select: 'Select', 'item-list': 'Item list' };
var KIND_HELP = { number: 'A stored number (an attribute): default, min, max, step.', formula: 'Computed from other fields; never stored, never edited.', resource: 'A current value with a formula for its max (HP): a bar with - and + on the sheet.', skill: 'Stored ranks plus a base formula; its value is ranks + base.', toggle: 'On or off (a condition); true or false in formulas.', text: 'A short text (up to 200 characters); not a number for formulas.', notes: 'A long text; never read by formulas.', select: 'One of a fixed list of options.', 'item-list': 'A list of items the character carries, filled from the Items library on the sheet.' };
function open(which) {
    if (!canWrite()) { toast('Not while you are at someone else\'s table.'); return; }
    var camp = getActiveCampaign(); if (!camp) return;
    draft = clone(systemOf(camp) || emptySystem());
    if (!Array.isArray(draft.fields)) draft.fields = []; if (!Array.isArray(draft.rolls)) draft.rolls = []; if (!draft.sheet || !Array.isArray(draft.sheet.sections)) draft.sheet = { sections: [] };
    if (!Array.isArray(draft.items)) draft.items = []; if (!draft.combat || typeof draft.combat !== 'object') draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' };
    dirty = false; tab = which || 'fields';
    var m = ui('systemModal'); if (!m) return;
    ui('sysCampName').textContent = camp.name || 'Campaign';
    ui('sysName').value = draft.name || '';
    m.style.display = 'flex';
    renderAll();
}
function close(force) {
    var m = ui('systemModal'); if (!m || m.style.display === 'none') return;
    if (dirty && !force) { showConfirm('Close the System editor without saving? Your changes to the fields, rolls and layout since the last Save are lost (characters are saved as you go).', function(yes) { if (yes) { dirty = false; close(true); } }); return; }
    m.style.display = 'none'; draft = null;
}
function markDirty() { dirty = true; var s = ui('sysSaveBtn'); if (s) s.classList.add('on'); }
function saveDraft() {
    if (!draft || !canWrite()) return;
    var camp = getActiveCampaign(); if (!camp) return;
    draft.name = (ui('sysName').value || '').trim().slice(0, LIMITS.name);
    var clean = cleanSystem(draft, { F: F(), gmView: true });
    if (!clean) { toast('The system could not be saved.'); return; }
    var dropped = draft.fields.length - clean.fields.length;
    clean.updated = Date.now();
    camp.system = clean;
    draft = clone(clean); dirty = false; var s = ui('sysSaveBtn'); if (s) s.classList.remove('on');
    save(true);
    var n = net(); if (n && n.syncSystem) n.syncSystem();
    var v = validateSystem(clean, F());
    toast('System saved: ' + clean.fields.length + ' field' + (clean.fields.length === 1 ? '' : 's') + ', ' + clean.rolls.length + ' roll' + (clean.rolls.length === 1 ? '' : 's') + (dropped ? '; ' + dropped + ' with a bad key or kind dropped' : '') + (v.ok ? '.' : '; ' + v.errors.length + ' error' + (v.errors.length === 1 ? '' : 's') + ' to fix.'));
    renderAll(); if (sheetOpen) renderSheet();
}
function refreshErrors() {
    errorsById = {}; warningsById = {};
    if (!draft || !F()) return;
    var seenKey = Object.create(null);
    draft.fields.forEach(function(f) {
        var errs = [];
        if (!validKey(f.key || '', F())) errs.push({ prop: 'key', message: !f.key ? 'A key is needed.' : 'Not a usable key: letters, digits, _ and dots; no spaces; not a function, reserved word or dice.' });
        else { var l = String(f.key).toLowerCase(); if (seenKey[l]) errs.push({ prop: 'key', message: 'Another field has this key.' }); seenKey[l] = 1; }
        if (!KINDS[f.kind]) errs.push({ prop: 'kind', message: 'Pick a kind.' });
        if (errs.length) errorsById[f.id] = errs;
    });
    var clean = cleanSystem(draft, { F: F(), gmView: true });
    if (!clean) return;
    var v = validateSystem(clean, F());
    v.errors.forEach(function(e) { (errorsById[e.id] = errorsById[e.id] || []).push(e); });
    v.warnings.forEach(function(w) { (warningsById[w.id] = warningsById[w.id] || []).push(w); });
}
function errorCell(id) {
    var cell = el('div', 'sys-err');
    (errorsById[id] || []).forEach(function(e) {
        cell.appendChild(el('div', 'sys-err-line', (e.prop && e.prop !== 'formula' && e.prop !== 'rollFormula' ? e.prop + ': ' : '') + e.message));
        if (e.pos !== undefined && e.len > 0) { var src = formulaTextFor(id, e.prop); if (src) { var pre = el('pre', 'dice-caret'); pre.textContent = src + NL + new Array(Math.min(e.pos, src.length) + 1).join(' ') + new Array(Math.min(e.len, 200) + 1).join('^'); cell.appendChild(pre); } }
    });
    (warningsById[id] || []).forEach(function(w) { cell.appendChild(el('div', 'sys-warn-line', w.message)); });
    if (!cell.childNodes.length) cell.style.display = 'none';
    return cell;
}
function formulaTextFor(id, prop) {
    var f = draft.fields.find(function(x) { return x.id === id; });
    if (f) return prop === 'roll' ? f.roll || '' : f[DEF_PROP[f.kind]] || '';
    var r = draft.rolls.find(function(x) { return x.id === id; });
    if (r) return r.formula || '';
    var it = (draft.items || []).find(function(x) { return x.id === id; });
    return it ? (prop === 'cost' ? it.cost || '' : it.damage || '') : '';
}
function patchErrors() {
    refreshErrors();
    document.querySelectorAll('#systemModal [data-err-for]').forEach(function(old) { var id = old.dataset.errFor; var fresh = errorCell(id); fresh.dataset.errFor = id; old.parentNode.replaceChild(fresh, old); });
    var total = Object.keys(errorsById).reduce(function(n, k) { return n + errorsById[k].length; }, 0), warns = Object.keys(warningsById).reduce(function(n, k) { return n + warningsById[k].length; }, 0);
    var foot = ui('sysFoot'); if (foot) foot.textContent = draft.fields.length + ' field' + (draft.fields.length === 1 ? '' : 's') + ' · ' + draft.rolls.length + ' roll' + (draft.rolls.length === 1 ? '' : 's') + (total ? ' · ' + total + ' error' + (total === 1 ? '' : 's') : ' · no errors') + (warns ? ' · ' + warns + ' warning' + (warns === 1 ? '' : 's') : '') + (dirty ? ' · unsaved changes' : '');
}
function input(cls, value, title, placeholder) { var i = el('input', cls); i.type = 'text'; i.value = value === undefined || value === null ? '' : String(value); if (title) i.title = title; if (placeholder) i.placeholder = placeholder; i.spellcheck = false; i.autocomplete = 'off'; return i; }
function numInput(cls, value, title) { var i = el('input', cls); i.type = 'number'; i.value = value === undefined || value === null ? '' : String(value); i.title = title || ''; return i; }
function numField(cls, value, title, cap) { var l = el('label', 'sys-num'); l.appendChild(el('span', 'sys-num-cap', cap)); l.appendChild(numInput(cls, value, title)); return l; }   // a captioned number (Default / Min / Max / Step) so the def row reads without hovering
function select(cls, options, value, title) { var s = el('select', cls); options.forEach(function(o) { s.appendChild(opt(o[0], o[1], o[0] === value)); }); if (title) s.title = title; return s; }
function btnRow(list) { var btns = el('span', 'sys-btns'); list.forEach(function(b) { var x = el('button', 'tool ghost sys-btn'); x.dataset.act = b[0]; x.title = b[1]; x.innerHTML = b[2]; btns.appendChild(x); }); return btns; }
function labeledSelect(cls, cap, options, value, title) { var l = el('label', 'sys-combat-item'); l.appendChild(el('span', 'sys-num-cap', cap)); l.appendChild(select(cls, options, value, title)); return l; }
function fieldRow(f) {
    var row = el('div', 'sys-row'); row.dataset.id = f.id;
    var top = el('div', 'sys-row-main');
    top.appendChild(input('sys-key field', f.key, 'The name formulas use: STR, Skill.Stealth. Letters, digits, _ and dots.', 'Key'));
    top.appendChild(input('sys-label field', f.label, 'Shown on the sheet', 'Label'));
    top.appendChild(select('sys-kind', Object.keys(KIND_LABEL).map(function(k) { return [k, KIND_LABEL[k]]; }), f.kind, KIND_HELP[f.kind] || ''));
    var def = el('div', 'sys-def'); top.appendChild(def); buildDefCell(def, f);
    var flags = el('div', 'sys-flags');
    if (STORED[f.kind]) flags.appendChild(select('sys-edit', [['owner', 'Player may edit'], ['gm', 'GM edits']], f.edit || 'owner', 'Who may change the value at the table'));
    flags.appendChild(select('sys-vis', [['all', 'Visible to players'], ['gm', 'GM only']], f.vis || 'all', 'GM only: the field and its value never leave your machine'));
    var hov = el('label', 'sys-hover'); var hc = el('input'); hc.type = 'checkbox'; hc.checked = !!f.hover; hc.className = 'sys-hover-chk'; hov.appendChild(hc); hov.appendChild(document.createTextNode(' Hover')); hov.title = 'Show on the token\'s hover card and the party strip'; flags.appendChild(hov);
    if (f.kind !== 'notes' && f.kind !== 'text' && f.kind !== 'select' && f.kind !== 'item-list') flags.appendChild(input('sys-roll field', f.roll, 'A roll button for this field (dice allowed): d20 + ' + (f.key || 'Key'), 'Roll (optional)'));
    flags.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['dup', 'Duplicate', '&#10697;'], ['del', 'Delete this field', '&times;']]));
    row.appendChild(top); row.appendChild(flags);
    var err = errorCell(f.id); err.dataset.errFor = f.id; row.appendChild(err);
    return row;
}
function buildDefCell(def, f) {
    def.textContent = '';
    var k = f.kind;
    if (k === 'number' || k === 'skill') {
        if (k === 'skill') def.appendChild(input('sys-formula field', f.base, 'The base added to the ranks (a formula, no dice): DEXmod. Empty = ranks alone.', 'Base formula (optional)'));
        def.appendChild(numField('sys-def-num', f.def, k === 'skill' ? 'Default ranks' : 'Default value', k === 'skill' ? 'Ranks' : 'Default'));
        def.appendChild(numField('sys-min', f.min, 'Minimum (empty = none)', 'Min'));
        def.appendChild(numField('sys-max', f.max, 'Maximum (empty = none)', 'Max'));
        def.appendChild(numField('sys-step', f.step === undefined ? 1 : f.step, 'Step', 'Step'));
    } else if (k === 'formula') def.appendChild(input('sys-formula field', f.formula, 'Computed from other fields; no dice here: floor((STR - 10) / 2)', 'Formula'));
    else if (k === 'resource') {
        def.appendChild(input('sys-formula field', f.maxFormula, 'The maximum, as a formula (no dice): 10 + CONmod * 2', 'Max formula'));
        def.appendChild(input('sys-def-res field', f.def === 'max' || f.def === undefined ? 'max' : f.def, 'Starting value: a number, or "max" for full', 'Default'));
        def.appendChild(numField('sys-min', f.min === undefined ? 0 : f.min, 'Minimum', 'Min'));
    } else if (k === 'toggle') { var t = el('label', 'sys-toggle-def'); var c = el('input'); c.type = 'checkbox'; c.className = 'sys-def-bool'; c.checked = f.def === true; t.appendChild(c); t.appendChild(document.createTextNode(' On by default')); def.appendChild(t); }
    else if (k === 'text') { def.appendChild(input('sys-def-text field', f.def, 'Default text', 'Default')); def.appendChild(numField('sys-max', f.max === undefined ? 200 : f.max, 'Most characters (up to 200)', 'Chars')); }
    else if (k === 'notes') def.appendChild(el('span', 'sys-note', 'A long text on the sheet; not read by formulas.'));
    else if (k === 'item-list') def.appendChild(el('span', 'sys-note', 'A list the character fills from the Items library on the sheet (a throwable item shows a Throw button).'));
    else if (k === 'select') { def.appendChild(input('sys-options field', (f.options || []).join(', '), 'The options, separated by commas', 'Options, separated by commas')); def.appendChild(input('sys-def-text field', f.def, 'Default option', 'Default')); }
}
function rollRow(r) {
    var row = el('div', 'sys-row'); row.dataset.id = r.id;
    var top = el('div', 'sys-row-main');
    top.appendChild(input('sys-label field', r.label, 'The button\'s label', 'Label'));
    top.appendChild(input('sys-formula field', r.formula, 'The roll: d20 + STRmod, 3d6 <= Skill.Stealth', 'Roll formula'));
    top.appendChild(select('sys-vis', [['all', 'Visible to players'], ['gm', 'GM only']], r.vis || 'all', 'GM only: players never see this roll'));
    var il = el('label', 'sys-hover'); var ic = el('input'); ic.type = 'checkbox'; ic.className = 'sys-init-chk'; ic.checked = !!r.init; il.appendChild(ic); il.appendChild(document.createTextNode(' Initiative')); il.title = 'The combat roster rolls this for initiative'; top.appendChild(il);
    top.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['del', 'Delete this roll', '&times;']]));
    row.appendChild(top);
    var err = errorCell(r.id); err.dataset.errFor = r.id; row.appendChild(err);
    return row;
}
function charRow(c, camp) {
    var row = el('div', 'sys-row sys-char-row'); row.dataset.cid = c.id;
    var top = el('div', 'sys-row-main');
    var nm = input('sys-char-name field', c.name, 'The character\'s name', 'Name'); top.appendChild(nm);
    var pn = playerNames(camp), owner = select('sys-char-owner', [['', '— unassigned —']].concat(Object.keys(pn).map(function(pid) { return [pid, pn[pid]]; })), c.ownerId || '', 'The player who plays this character (their token moves and their sheet edits)'); owner.disabled = !!c.npc; top.appendChild(owner);
    var npcL = el('label', 'sys-hover'); var npc = el('input'); npc.type = 'checkbox'; npc.className = 'sys-char-npc'; npc.checked = !!c.npc; npcL.appendChild(npc); npcL.appendChild(document.createTextNode(' NPC')); npcL.title = 'An NPC has no player and never reaches players'; top.appendChild(npcL);
    var por = el('button', 'tool ghost sys-btn sys-char-portrait', c.portrait ? 'Portrait ✓' : 'Portrait…'); por.title = c.portrait ? c.portrait + ' (click to change, right-click to clear)' : 'Pick a picture from the Image Library'; por.dataset.act = 'portrait'; top.appendChild(por);
    var openB = el('button', 'tool ghost sys-btn', 'Open sheet'); openB.dataset.act = 'open'; openB.title = 'Open this character\'s sheet over the play map'; top.appendChild(openB);
    top.appendChild(btnRow([['delchar', 'Delete this character (tokens keep their name, lose the link)', '&times;']]));
    row.appendChild(top);
    var tokens = 0; Object.values(camp.items || {}).forEach(function(m) { if (m && m.type === 'map') (m.whiteboard || []).forEach(function(w) { if (w && w.charId === c.id) tokens++; }); });
    row.appendChild(el('div', 'sys-note', (tokens ? tokens + ' token' + (tokens === 1 ? '' : 's') + ' on the maps' : 'No token yet: pick this character in a token\'s Properties, or drop it from the Cast') + (c.ownerId ? ' · played by ' + (pn[c.ownerId] || c.ownerId) : c.npc ? ' · NPC' : ' · unassigned (players cannot see it until a player is set)')));
    return row;
}
function itemRow(it) {
    var row = el('div', 'sys-row sys-item-row'); row.dataset.iid = it.id;
    var top = el('div', 'sys-row-main');
    top.appendChild(input('sys-item-name field', it.name, 'The item name shown on the sheet', 'Name'));
    top.appendChild(input('sys-item-cat field', it.category, 'A group, e.g. Explosives, Sidearms', 'Category'));
    var area = el('div', 'sys-item-area');
    area.appendChild(select('sys-item-shape', [['', 'No blast'], ['circle', 'Blast (circle)']], it.area ? (it.area.shape || 'circle') : '', 'A thrown blast: a circular area, thrown from the sheet'));
    var ftw = numField('sys-item-ft', it.area ? it.area.ft : '', 'Blast radius in feet', 'ft'); if (!it.area) ftw.style.opacity = '0.5'; area.appendChild(ftw);
    top.appendChild(area);
    top.appendChild(input('sys-item-damage field', it.damage, 'Damage roll (dice allowed): 3d6, 2d6 + STRmod', 'Damage (optional)'));
    var flags = el('div', 'sys-flags');
    flags.appendChild(input('sys-item-cost field', it.cost, 'Point/credit cost (a formula, no dice) — used by budgets in a later slice', 'Cost (optional)'));
    flags.appendChild(input('sys-item-throw field', it.throwSkill, 'Optional: a field whose roll is posted as the to-hit', 'Throw skill (optional)'));
    flags.appendChild(input('sys-item-icon field', it.icon, 'A single emoji shown on the row', 'Icon'));
    flags.appendChild(select('sys-item-vis', [['all', 'Visible to players'], ['gm', 'GM only']], it.vis || 'all', 'GM only: the item and its formulas never leave your machine'));
    flags.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['dup', 'Duplicate', '&#10697;'], ['del', 'Delete this item', '&times;']]));
    row.appendChild(top); row.appendChild(flags);
    var nrow = el('div', 'sys-item-notes-row'); nrow.appendChild(input('sys-item-notes field', it.notes, 'Notes shown on the sheet', 'Notes (optional)')); row.appendChild(nrow);
    var err = errorCell(it.id); err.dataset.errFor = it.id; row.appendChild(err);
    return row;
}
function renderCombat() {
    var box = ui('sysCombatBox'); if (!box) return; box.textContent = '';
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' });
    box.appendChild(labeledSelect('sys-combat-auto', 'Blast automation', [['full', 'Full auto — roll & apply'], ['roll', 'Roll to chat; apply by hand'], ['measure', 'Measure only']], cm.blastAuto, 'What happens when a blast is thrown: full = roll damage and apply it to tokens in range; roll = post the roll for a human to apply; measure = area only.'));
    box.appendChild(labeledSelect('sys-combat-roller', 'Who rolls', [['owner', 'The character\'s owner'], ['gm', 'Always the GM']], cm.blastRoller, 'Who makes a thrown blast\'s rolls: the owning player, or always the GM.'));
    var resFields = (draft.fields || []).filter(function(f) { return f.kind === 'resource'; });
    box.appendChild(labeledSelect('sys-combat-hp', 'Damage subtracts from', [['', resFields.length ? '— none —' : '— add a resource field —']].concat(resFields.map(function(f) { return [f.id, f.label || f.key]; })), cm.hpResource, 'Which resource full-auto damage reduces (the "health" resource).'));
}
function renderAll() {
    if (!draft) return;
    refreshErrors();
    document.querySelectorAll('#systemModal .sys-tabs button').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
    ui('sysFields').style.display = tab === 'fields' ? '' : 'none';
    ui('sysRolls').style.display = tab === 'rolls' ? '' : 'none';
    var sc = ui('sysChars'); if (sc) sc.style.display = tab === 'chars' ? '' : 'none';
    var siEl = ui('sysItems'); if (siEl) siEl.style.display = tab === 'items' ? '' : 'none';
    var sl = ui('sysLayout'); if (sl) { sl.style.display = tab === 'layout' ? '' : 'none'; if (tab === 'layout') renderLayout(); }
    var fr = ui('sysFieldRows'); fr.textContent = '';
    if (!draft.fields.length) fr.appendChild(el('div', 'sys-empty', 'No fields yet. Add one, or Start from a preset.'));
    draft.fields.forEach(function(f) { fr.appendChild(fieldRow(f)); });
    var rr = ui('sysRollRows'); rr.textContent = '';
    if (!draft.rolls.length) rr.appendChild(el('div', 'sys-empty', 'No rolls yet. A roll is a formula with dice, as a button on the sheet: d20 + STRmod.'));
    draft.rolls.forEach(function(r) { rr.appendChild(rollRow(r)); });
    var itr = ui('sysItemRows'); if (itr) { itr.textContent = ''; if (!draft.items || !draft.items.length) itr.appendChild(el('div', 'sys-empty', 'No items yet. Add weapons, gear or explosives your characters can carry — an item with a blast area can be thrown from the sheet.')); (draft.items || []).forEach(function(it) { itr.appendChild(itemRow(it)); }); renderCombat(); }
    var cr = ui('sysCharRows'); if (cr) { cr.textContent = ''; var camp = getActiveCampaign(), list = charList(camp); if (!list.length) cr.appendChild(el('div', 'sys-empty', 'No characters yet. New character here, or "New character from this token" in a token\'s Properties.')); list.forEach(function(c) { cr.appendChild(charRow(c, camp)); }); }
    var note = ui('sysFeatureNote'); if (note) note.style.display = featureOn() ? 'none' : '';
    patchErrors();
}
function fieldOfRow(target) { var row = target.closest('.sys-row'); if (!row || row.dataset.cid || row.dataset.iid) return null; return { row: row, f: draft.fields.find(function(x) { return x.id === row.dataset.id; }), r: draft.rolls.find(function(x) { return x.id === row.dataset.id; }) }; }
function itemOfRow(target) { var row = target.closest && target.closest('.sys-item-row'); if (!row) return null; return (draft.items || []).find(function(x) { return x.id === row.dataset.iid; }) || null; }
function onInput(e) {
    if (!draft) return;
    var t = e.target; if (onLayoutInput(t)) return;
    var it = itemOfRow(t);
    if (it) {
        var ic = t.className || '';
        if (ic.indexOf('sys-item-name') >= 0) it.name = t.value.slice(0, LIMITS.name);
        else if (ic.indexOf('sys-item-cat') >= 0) it.category = t.value.slice(0, LIMITS.category);
        else if (ic.indexOf('sys-item-ft') >= 0) { if (it.area) it.area.ft = t.value === '' ? 0 : Number(t.value); }
        else if (ic.indexOf('sys-item-damage') >= 0) it.damage = t.value;
        else if (ic.indexOf('sys-item-cost') >= 0) it.cost = t.value;
        else if (ic.indexOf('sys-item-throw') >= 0) it.throwSkill = t.value.trim();
        else if (ic.indexOf('sys-item-icon') >= 0) it.icon = t.value.slice(0, 8);
        else if (ic.indexOf('sys-item-notes') >= 0) it.notes = t.value.slice(0, LIMITS.text);
        else return;
        markDirty(); patchErrors(); return;
    }
    var ctx = fieldOfRow(t); if (!ctx) return;
    var f = ctx.f, r = ctx.r, c = t.className || '';
    if (f) {
        if (c.indexOf('sys-key') >= 0) f.key = t.value.trim();
        else if (c.indexOf('sys-label') >= 0) f.label = t.value.slice(0, LIMITS.label);
        else if (c.indexOf('sys-formula') >= 0) { var p = DEF_PROP[f.kind]; if (p) f[p] = t.value; }
        else if (c.indexOf('sys-roll') >= 0) f.roll = t.value.trim() || undefined;
        else if (c.indexOf('sys-def-num') >= 0) f.def = t.value === '' ? 0 : Number(t.value);
        else if (c.indexOf('sys-def-res') >= 0) f.def = t.value.trim().toLowerCase() === 'max' ? 'max' : Number(t.value) || 0;
        else if (c.indexOf('sys-def-text') >= 0) f.def = t.value;
        else if (c.indexOf('sys-min') >= 0) { if (t.value === '') delete f.min; else f.min = Number(t.value); }
        else if (c.indexOf('sys-max') >= 0) { if (t.value === '') delete f.max; else f.max = Number(t.value); }
        else if (c.indexOf('sys-step') >= 0) f.step = Number(t.value) || 1;
        else if (c.indexOf('sys-options') >= 0) f.options = t.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        else return;
    } else if (r) {
        if (c.indexOf('sys-label') >= 0) r.label = t.value.slice(0, LIMITS.label);
        else if (c.indexOf('sys-formula') >= 0) r.formula = t.value;
        else return;
    } else return;
    markDirty(); patchErrors();
}
function onChange(e) {
    if (!draft) return;
    var t = e.target, c = t.className || '';
    if (onLayoutChange(t)) return;
    if (c.indexOf('sys-combat-auto') >= 0) { draft.combat.blastAuto = t.value; markDirty(); patchErrors(); return; }
    if (c.indexOf('sys-combat-roller') >= 0) { draft.combat.blastRoller = t.value; markDirty(); patchErrors(); return; }
    if (c.indexOf('sys-combat-hp') >= 0) { draft.combat.hpResource = t.value; markDirty(); patchErrors(); return; }
    var iit = itemOfRow(t);
    if (iit) {
        if (c.indexOf('sys-item-vis') >= 0) { iit.vis = t.value; markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-item-shape') >= 0) { if (t.value === '') iit.area = null; else iit.area = { ft: iit.area ? iit.area.ft : 12, shape: 'circle', name: iit.area ? iit.area.name : '' }; markDirty(); renderAll(); return; }
        return;
    }
    var crow = t.closest && t.closest('.sys-char-row');
    if (crow) {   // characters save as you go
        var camp = getActiveCampaign(), ch = charById(crow.dataset.cid, camp); if (!ch) return;
        if (c.indexOf('sys-char-name') >= 0) { ch.name = t.value.trim().slice(0, LIMITS.charName) || ch.name; t.value = ch.name; if (ch.ownerId) bindPlayer(camp, ch); afterCharChange(ch, true); }
        else if (c.indexOf('sys-char-owner') >= 0) { ch.ownerId = t.value; if (ch.ownerId) { ch.npc = false; bindPlayer(camp, ch); } afterCharChange(ch, true); renderAll(); }
        else if (c.indexOf('sys-char-npc') >= 0) { ch.npc = t.checked; if (ch.npc) ch.ownerId = ''; afterCharChange(ch, true); renderAll(); }
        return;
    }
    var ctx = fieldOfRow(t); if (!ctx) return;
    var f = ctx.f, r = ctx.r;
    if (f) {
        if (c.indexOf('sys-kind') >= 0) { f.kind = t.value; delete f.formula; delete f.maxFormula; delete f.base; delete f.options; f.def = f.kind === 'toggle' ? false : f.kind === 'text' || f.kind === 'select' ? '' : f.kind === 'resource' ? 'max' : 0; if (f.kind === 'resource' && f.min === undefined) f.min = 0; markDirty(); renderAll(); return; }
        if (c.indexOf('sys-edit') >= 0) f.edit = t.value;
        else if (c.indexOf('sys-vis') >= 0) f.vis = t.value;
        else if (c.indexOf('sys-hover-chk') >= 0) f.hover = t.checked;
        else if (c.indexOf('sys-def-bool') >= 0) f.def = t.checked;
        else return;
    } else if (r) {
        if (c.indexOf('sys-vis') >= 0) r.vis = t.value;
        else if (c.indexOf('sys-init-chk') >= 0) { r.init = t.checked; if (t.checked) draft.rolls.forEach(function(o) { if (o !== r) delete o.init; }); markDirty(); renderAll(); return; }
        else return;
    } else return;
    markDirty(); patchErrors();
}
function onClick(e) {
    if (!draft) return;
    var b = e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.id === 'sysAddField') { draft.fields.push({ id: uid('f_'), key: '', label: '', kind: 'number', def: 0, step: 1, edit: 'owner', vis: 'all', hover: false }); markDirty(); renderAll(); var last = ui('sysFieldRows').lastElementChild; if (last) { var k = last.querySelector('.sys-key'); if (k) k.focus(); last.scrollIntoView({ block: 'nearest' }); } return; }
    if (b.id === 'sysAddRoll') { draft.rolls.push({ id: uid('r_'), label: '', formula: '', vis: 'all' }); markDirty(); renderAll(); var lr = ui('sysRollRows').lastElementChild; if (lr) { var l = lr.querySelector('.sys-label'); if (l) l.focus(); } return; }
    if (b.id === 'sysAddChar') { showPrompt('Name the character', 'New character', function(name) { if (name === null) return; var c = newCharacter({ name: String(name || '').trim() || 'New character' }); afterCharChange(c, true); renderAll(); }); return; }
    if (b.id === 'sysAddItem') { if (!Array.isArray(draft.items)) draft.items = []; if (draft.items.length >= LIMITS.items) { toast('At most ' + LIMITS.items + ' items.'); return; } draft.items.push({ id: uid('i_'), name: '', category: '', icon: '', notes: '', vis: 'all', area: null, damage: '', cost: '', throwSkill: '' }); markDirty(); renderAll(); var li = ui('sysItemRows').lastElementChild; if (li) { var n = li.querySelector('.sys-item-name'); if (n) n.focus(); li.scrollIntoView({ block: 'nearest' }); } return; }
    if (b.dataset.tab) { tab = b.dataset.tab; renderAll(); return; }
    if (onLayoutClick(b)) return;
    if (!b.dataset.act) return;
    var crow = b.closest('.sys-char-row');
    if (crow) {
        var camp = getActiveCampaign(), ch = charById(crow.dataset.cid, camp); if (!ch) return;
        if (b.dataset.act === 'open') { openSheet(ch.id); return; }
        if (b.dataset.act === 'delchar') { showConfirm('Delete ' + ch.name + '? Its values are gone; tokens keep their name and lose the link.', function(yes) { if (yes) { deleteCharacter(ch.id); renderAll(); } }); return; }
        if (b.dataset.act === 'portrait') { if (!window.wpPickImage) return; window.wpPickImage(function(src) { if (typeof src === 'string' && /^[/]saves[/]images[/]/.test(src)) { ch.portrait = src; afterCharChange(ch, true); renderAll(); } }); return; }
        return;
    }
    var irow = b.closest('.sys-item-row');
    if (irow) {
        if (!b.dataset.act) return;
        var iitem = (draft.items || []).find(function(x) { return x.id === irow.dataset.iid; }); if (!iitem) return;
        var ii = draft.items.indexOf(iitem), iact = b.dataset.act;
        if (iact === 'up' && ii > 0) { draft.items.splice(ii, 1); draft.items.splice(ii - 1, 0, iitem); }
        else if (iact === 'down' && ii < draft.items.length - 1) { draft.items.splice(ii, 1); draft.items.splice(ii + 1, 0, iitem); }
        else if (iact === 'dup') { var di = clone(iitem); di.id = uid('i_'); if (di.name) di.name = di.name + ' copy'; draft.items.splice(ii + 1, 0, di); }
        else if (iact === 'del') { draft.items.splice(ii, 1); }
        else return;
        markDirty(); renderAll(); return;
    }
    var ctx = fieldOfRow(b); if (!ctx) return;
    var list = ctx.f ? draft.fields : draft.rolls, item = ctx.f || ctx.r; if (!item) return;
    var i = list.indexOf(item), act = b.dataset.act;
    if (act === 'up' && i > 0) { list.splice(i, 1); list.splice(i - 1, 0, item); }
    else if (act === 'down' && i < list.length - 1) { list.splice(i, 1); list.splice(i + 1, 0, item); }
    else if (act === 'dup') { var d = clone(item); d.id = uid(ctx.f ? 'f_' : 'r_'); if (d.key) d.key = d.key + '2'; list.splice(i + 1, 0, d); }
    else if (act === 'del') { list.splice(i, 1); }
    else return;
    markDirty(); renderAll();
}
function runTest() {
    if (!draft || !F()) return;
    var clean = cleanSystem(draft, { F: F(), gmView: true }); if (!clean) return;
    var all = resolveAll(clean, null, F()), out = ui('sysTestOut'); out.textContent = '';
    clean.fields.forEach(function(f) { var e = all[f.id]; var line = el('div', 'sys-test-line' + (e.error ? ' sys-err-line' : '')); line.textContent = f.key + ' = ' + (e.error ? 'error: ' + e.error : e.text); out.appendChild(line); });
    if (!clean.fields.length) out.appendChild(el('div', 'sys-note', 'Nothing to compute yet.'));
}
function startFrom(id) {
    if (!draft) return;
    var apply = function(sys) { draft = clone(sys); draft.updated = 0; ui('sysName').value = draft.name || ''; markDirty(); renderAll(); toast(id === 'blank' ? 'Starting from a blank system.' : 'Starting from ' + draft.name + '. Save to keep it.'); };
    var go = function() {
        if (id === 'blank') { apply(emptySystem()); return; }
        fetch('assets/systems/' + id + '.json', { cache: 'no-store' }).then(function(r) { if (!r.ok) throw new Error('missing'); return r.json(); }).then(function(j) { var c = cleanSystem(j, { F: F(), gmView: true }); if (!c) throw new Error('bad'); apply(c); }).catch(function() { toast('That preset could not be loaded.'); });
    };
    if (draft.fields.length || draft.rolls.length) showConfirm('Replace the current fields, rolls and layout with this preset? Values your characters keep under other field ids stay stored but hidden until a field with that id exists again.', function(yes) { if (yes) go(); });
    else go();
}
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
        var v = validateSystem(c, F());
        draft = c; draft.updated = 0; ui('sysName').value = draft.name || ''; markDirty(); renderAll();
        toast('Imported ' + (c.name || 'a system') + ': ' + c.fields.length + ' fields, ' + c.rolls.length + ' rolls' + (v.ok ? '.' : ', ' + v.errors.length + ' error' + (v.errors.length === 1 ? '' : 's') + ' to fix.'));
    }).catch(function() { toast('That file is not a Waypoint system.'); });
}
/* ---------- wiring ---------- */
(function wire() {
    var m = ui('systemModal'); if (!m) return;
    var b = ui('systemBtn'); if (b) b.addEventListener('click', function() { open(); });
    var c = ui('sysClose'); if (c) c.addEventListener('click', function() { close(false); });
    var s = ui('sysSaveBtn'); if (s) s.addEventListener('click', saveDraft);
    var nm = ui('sysName'); if (nm) nm.addEventListener('input', function() { markDirty(); patchErrors(); });
    m.addEventListener('input', onInput);
    m.addEventListener('change', onChange);
    m.addEventListener('click', onClick);
    m.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(false); } });
    var t = ui('sysTestBtn'); if (t) t.addEventListener('click', runTest);
    var st = ui('sysStartSel'); if (st) st.addEventListener('change', function() { var v = st.value; st.value = ''; if (v) startFrom(v); });
    var ex = ui('sysExportBtn'); if (ex) ex.addEventListener('click', exportSystem);
    var im = ui('sysImportBtn'), fi = ui('sysImportFile'); if (im && fi) { im.addEventListener('click', function() { fi.value = ''; fi.click(); }); fi.addEventListener('change', function() { importFile(fi.files && fi.files[0]); }); }
    var ls = ui('sysLayoutSecs'); if (ls) wireLayoutDrag(ls);
    var pv = ui('sysPreviewChar'); if (pv) pv.addEventListener('change', renderPreview);
    // the sheet panel
    var p = ui('sheetPanel'), head = ui('sheetHead'); if (!p || !head) return;
    p.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); closeSheet(); } });
    var sc = ui('sheetClose'); if (sc) sc.addEventListener('click', closeSheet);
    var rv = ui('sheetRevert'); if (rv) rv.addEventListener('click', revertLast);
    var pk = ui('sheetPick'); if (pk) pk.addEventListener('change', function() { if (pk.value) openSheet(pk.value); });
    var drag = null;
    head.addEventListener('pointerdown', function(e) { if (e.target.closest('button, select')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; });
    head.addEventListener('pointerup', function() { if (!drag) return; drag = null; var r = p.getBoundingClientRect(); setPref('wp_sheetPanel', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); });
})();
function sync() {
    var b = ui('systemBtn'); if (b) b.style.display = canWrite() ? '' : 'none';
    var note = ui('sysFeatureNote'); if (note) note.style.display = featureOn() ? 'none' : '';
    if (!featureOn() && sheetOpen) closeSheet();
    else if (sheetOpen) renderSheet();
}
var _lastCamp = null;
setInterval(function() { var c = getActiveCampaign(), id = c ? c.id : null; if (_lastCamp !== null && id !== _lastCamp && sheetOpen) closeSheet(); _lastCamp = id; }, 1000);
window.wpSheetsSync = sync;
setTimeout(sync, 0);
window.wpSheets = { open: open, close: close, playerSystem: playerSystem, systemOf: systemOf, save: saveDraft, startFrom: startFrom, sync: sync, draft: function() { return draft; },
    charsOf: charsOf, charList: charList, charById: charById, newCharacter: newCharacter, deleteCharacter: deleteCharacter, linkToken: linkToken, newFromToken: newFromToken, syncOwners: syncOwners, ownerFromToken: ownerFromToken,
    charSelectHtml: charSelectHtml, wireCharSelect: wireCharSelect, hoverLinesForToken: hoverLinesForToken, hoverLinesForTokenId: hoverLinesForTokenId,
    openSheet: openSheet, closeSheet: closeSheet, canOpen: canOpen, renderSheet: renderSheet, charChanged: charChanged, charGone: charGone, editResult: editResult, sheetOpen: function() { return sheetOpen; }, canRoll: canRoll, hasInitRoll: hasInitRoll, rollInit: rollInit, fromShadowBase: fromShadowBase, LIMITS: LIMITS };
