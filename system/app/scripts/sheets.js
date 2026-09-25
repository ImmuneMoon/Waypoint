/* Character sheets (1.5.0) — the UI half: the System editor (#systemModal — fields, rolls, characters, Start from a
   preset, export / import), the sheet panel over the play map (#sheetPanel), the hover-card and party-strip lines,
   token links (charId, write-through ownership), the feature switch `sheets` (wpSheetsSync), and the hooks net.js
   calls (playerSystem, charChanged, charGone, editResult). The pure half is systemcore.js; the wire is net.js;
   the engine formula.js. Design of record: docs/SHEET_BUILDER_PLAN.md. */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { showConfirm, showPrompt } from './dialogs.js';
import { validPageId, LIMITS, KINDS, STORED, DEF_PROP, BAND_KINDS, IDENTITY_KINDS, LEDGER_KINDS, headerEntry, captionParts, emptySystem, uid, validKey, cleanSystem, cleanChar, validateSystem, resolveAll, hoverLines, autoLayout, applyEdit, applyItemOp, fmtNum, initRoll, aliasFromShadowBase } from './systemcore.js';

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
function playerSystem(camp) { camp = camp || getActiveCampaign(); if (!camp || !camp.system || !F()) return null; return cleanSystem(camp.system, { F: F(), gmView: false, pages: readablePages(camp) }); }
// Stage 5f: the handbook pages players may read in a campaign (the "Players can read" switch: meta.players !== false) — the host's
// filter for chips and links in the players' view of the system (here and in net.js's join snapshot)
function readablePages(camp) { var items = (camp && camp.items) || {}, out = []; Object.keys(items).forEach(function(id) { var it = items[id]; if (it && it.type === 'doc' && !(it.meta && it.meta.players === false)) out.push(id); }); return out; }
// The page a chip or link names, from this machine's copy of the campaign: { title, gmOnly }, or null when it is not here (deleted,
// hidden from this player, or not arrived yet — net.js redraws the sheet when a page arrives or goes)
function pageRef(id) {
    var camp = getActiveCampaign(), items = camp && camp.items; if (!items || typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(items, id)) return null;
    var it = items[id]; if (!it || it.type !== 'doc') return null;
    return { title: String((it.meta && it.meta.title) || 'Page'), gmOnly: !!(it.meta && it.meta.players === false) };
}
// Open a handbook page from the sheet: a player in the reader (pictures, live edits, closes when the GM hides it); the GM in the
// floating doc panel beside the sheet; a pop-out sheet hands it to the main window. Looked up again at click time.
function openPage(id) {
    var camp = getActiveCampaign(), ref = pageRef(id), n = net();
    if (isClient() || (n && n.foreign)) { if (!(window.wpOpenDoc && window.wpOpenDoc(id))) toast('That handbook page isn\u2019t available at this table.'); return; }
    if (!ref) { toast('That handbook page is no longer in this campaign.'); return; }
    if (window.wpPopout) {
        var op = null; try { op = window.opener; } catch (e) {}
        if (op && op.wpDocPanel) {
            var opCamp = null; try { var cs = op.document.getElementById('campaignSelect'); opCamp = cs && cs.value; } catch (e) {}
            if (opCamp && camp && opCamp !== camp.id) { toast('Switch the main window to \u201c' + (camp.name || 'this campaign') + '\u201d to open that page.'); return; }
            try { op.wpDocPanel.open(id); op.focus(); } catch (e) {}
            return;
        }
        try { new BroadcastChannel('waypoint').postMessage({ type: 'dock', kind: 'doc', arg: camp.id + '/' + id }); } catch (e) {}
        return;
    }
    if (!window.wpDocPanel) return;
    window.wpDocPanel.open(id);
    var dp = ui('docPanel'), sp = ui('sheetPanel');
    if (dp && sp && sp.style.display !== 'none') {   // the doc panel opens where the sheet is by default: put it beside the sheet instead
        var a = dp.getBoundingClientRect(), b = sp.getBoundingClientRect();
        var ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)), oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (ox > 0 && oy > 0) {   // any overlap: beside the sheet, left if it fits, else right; where neither fits it stays (it is on top anyway)
            var left = b.left - a.width - 12; if (left < 8) left = (b.right + 12 + a.width <= window.innerWidth - 8) ? b.right + 12 : null;
            if (left !== null) { dp.style.left = Math.round(left) + 'px'; dp.style.right = 'auto'; dp.style.top = Math.round(Math.max(8, b.top)) + 'px'; }
        }
    }
    var si = ui('docPanelSearchInput'); if (si) { try { si.focus({ preventScroll: true }); } catch (e) {} }   // so Esc closes the page before the sheet
}
// What the open sheet's chips and links show (each referenced page: here or not, its title, GM-only), recorded at every live render;
// net.js redraws the sheet only when a page's arrival, change or removal would change it — never for a page the sheet doesn't name,
// and never for a content edit (a rebuild mid-typing would fire the focused input's change)
var _sheetRefSig = '';
function refSig(sys) {
    var ids = [], sh = sys && sys.sheet; if (!sh || !Array.isArray(sh.sections)) return '';
    sh.sections.forEach(function(s) { if (s.chip) ids.push(s.chip); (s.fields || []).forEach(function(p) { if (p && p.kind === 'link' && p.page) ids.push(p.page); }); });
    return ids.map(function(id) { var r = pageRef(id); return id + '=' + (r ? (r.gmOnly ? 'g:' : 'p:') + r.title : '-'); }).join('\n');
}
function sheetRefsChanged() {
    if (!sheetOpen) return false;
    var camp = getActiveCampaign(); return refSig(systemOf(camp)) !== _sheetRefSig;
}
// A handbook chip for a section header (the owner's Foundry chips): a span, not a button, inside the <summary> of a collapsible
// section — the click must not fold the section, so it prevents the default as well as stopping the bubble.
function pageChip(id) {
    var ref = pageRef(id); if (!ref) return null;
    var ch = el('span', 'sheet-sec-chip' + (ref.gmOnly ? ' sheet-chip-gm' : '')); ch.setAttribute('role', 'button'); ch.tabIndex = 0;
    ch.title = 'Open \u201c' + ref.title + '\u201d' + (ref.gmOnly ? ' \u2014 GM only: players don\u2019t see this chip' : ''); ch.setAttribute('aria-label', ch.title);
    ch.appendChild(el('span', 'sheet-chip-ico', '\ud83d\udcd6')); ch.appendChild(el('span', 'sheet-chip-txt', ref.title));
    var go = function(e) { e.preventDefault(); e.stopPropagation(); if (ch.closest('#systemModal')) return; openPage(id); };
    ch.addEventListener('click', go); ch.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
    return ch;
}
// A handbook link placement: a button that opens its page; nothing at all when the page is not here
function linkNode(pl) {
    var ref = pl.page ? pageRef(pl.page) : null; if (!ref) return null;
    var b = el('button', 'tool sheet-roll sheet-link' + (ref.gmOnly ? ' sheet-chip-gm' : ''), '\ud83d\udcd6 ' + (pl.text || ref.title)); b.type = 'button';
    b.title = 'Open \u201c' + ref.title + '\u201d over the map' + (ref.gmOnly ? ' \u2014 GM only: players don\u2019t see this button' : '');
    b.addEventListener('click', function(e) { e.preventDefault(); if (b.closest('#systemModal')) return; openPage(pl.page); });
    var box = el('div', 'sheet-field sheet-kind-link'); box.appendChild(b); return box;
}
// [[id, label]] for the campaign's handbook pages (title order, GM-only marked) — the Layout tab's page pickers; an unknown current
// id stays selectable as "(page not found)" so a system imported from another campaign can be re-pointed rather than silently lost
function pageOptions(cur, none) {
    var camp = getActiveCampaign(), items = (camp && camp.items) || {}, list = [];
    Object.keys(items).forEach(function(id) { var it = items[id]; if (it && it.type === 'doc' && validPageId(id)) list.push([id, String((it.meta && it.meta.title) || 'Page') + (it.meta && it.meta.players === false ? ' (GM only)' : '')]); });   // only ids a chip or link can store (the rest would vanish on Save)
    list.sort(function(a, b) { return a[1].localeCompare(b[1]); });
    var opts = none === null ? list : [['', none]].concat(list);
    if (cur && !list.some(function(o) { return o[0] === cur; })) opts.push([cur, '(page not found)']);
    return opts;
}
function charsOf(camp) { camp = camp || getActiveCampaign(); if (!camp) return {}; if (!camp.chars || typeof camp.chars !== 'object') camp.chars = {}; return camp.chars; }
function charList(camp) { return Object.values(charsOf(camp)).filter(function(c) { return c && typeof c === 'object'; }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name)); }); }
function charById(id, camp) { var cs = charsOf(camp); return id && cs[id] && typeof cs[id] === 'object' ? cs[id] : null; }
function playerNames(camp) {
    var out = Object.create(null);   // keyed by player ids (the host's roster on a player): never a prototype hit
    if (camp && camp.players) Object.keys(camp.players).forEach(function(pid) { out[pid] = camp.players[pid].name || pid; });
    var n = net(); if (n && n.roster) Object.values(n.roster).forEach(function(p) { if (p && p.id) out[p.id] = p.name || p.id; });
    return out;
}
// The owner's name for the sheet's subtitle and the character picker. A player's copy of the table knows only who is at it now
// (camp.players, every name the campaign has seen, never leaves the host): their own character reads with their own name, an owner
// who is not at the table as "a player" — never a bare id. The GM's view is unchanged.
function ownerName(c, camp) {
    if (!c || !c.ownerId) return '';
    var n = net(), away = !!(n && ((n.active && n.role === 'client') || n.foreign));
    if (away && c.ownerId === myId() && n.getProfile) { var pr = n.getProfile(); if (pr && typeof pr.name === 'string' && pr.name.trim()) return pr.name.trim().slice(0, 40); }
    var pn = playerNames(camp);
    return pn[c.ownerId] || (away ? 'a player' : c.ownerId);
}
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
function placeSheet() { var p = ui('sheetPanel'); if (!p) return; try { var pos = JSON.parse(pref('wp_sheetPanel', 'null')); if (pos && isFinite(pos.x) && isFinite(pos.y)) { p.style.left = Math.max(0, Math.min(window.innerWidth - 160, pos.x)) + 'px'; p.style.top = Math.max(0, Math.min(window.innerHeight - 80, pos.y)) + 'px'; p.style.right = 'auto'; } if (pos && isFinite(pos.w) && isFinite(pos.h)) sizePanel(p, pos.w, pos.h); } catch (e) {} }
// Fold B: the panel's own size (its corner grip), clamped to the window; the saved record keeps the position and the size together
function sizePanel(p, w, h) { var r = p.getBoundingClientRect(); w = Math.max(360, Math.min(window.innerWidth - Math.max(0, r.left) - 8, Math.round(w))); h = Math.max(240, Math.min(window.innerHeight - Math.max(0, r.top) - 8, Math.round(h))); p.style.width = w + 'px'; p.style.height = h + 'px'; p.classList.add('sheet-sized'); }   // clamped to the room left of/below where the panel is, so the grip and the last rows stay on screen
function panelPref() { try { var o = JSON.parse(pref('wp_sheetPanel', 'null')); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; } }
function focusKeyOf(root) { var ae = document.activeElement; if (!ae || !root.contains(ae) || !ae.dataset || !ae.dataset.fid) return null; var k = { fid: ae.dataset.fid, part: ae.dataset.part || '', band: !!ae.dataset.band }; try { k.sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) {} return k; }   // band: the pinned band's copy of a field, told from the section's (Stage 5c)
function restoreFocus(root, k) { if (!k) return; var q = root.querySelector('[data-fid="' + k.fid + '"]' + (k.part ? '[data-part="' + k.part + '"]' : ':not([data-part])') + (k.band ? '[data-band]' : ':not([data-band])')); if (q && q.disabled && k.part) q = root.querySelector('[data-fid="' + k.fid + '"]:not([data-part])' + (k.band ? '[data-band]' : ':not([data-band])')); if (q) { try { q.focus({ preventScroll: true }); if (k.sel && k.sel[0] != null && q.setSelectionRange) q.setSelectionRange(k.sel[0], k.sel[1]); } catch (e) {} } }
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
    p.classList.toggle('sheet-has-headportrait', !!(sys.sheet && sys.sheet.look && sys.sheet.look.portrait));   // Stage 5g: the header block carries the portrait, so the title bar's small one steps aside
    var all = resolveAll(sys, c, F());
    _sheetRefSig = refSig(sys);
    buildSections(body, sys, c, all, gm, own, renderSheet);
    p.classList.toggle('sheet-has-table', !!body.querySelector('.sheet-itemtable'));   // Stage 4: a rich item table gets a wider, responsive panel so its columns fit
    syncFramePad(body);   // the width may have changed the sticky frame's height
    // document appearance (1.5.0): the campaign default themes the sheet too. Reset first so turning it off restores the app style.
    applySheetLookTo(body, sheetLook(camp, sys));
    restoreFocus(body, fk);
}
// The campaign default's background picture + readability scrim on a sheet body (same rendering as a page:
// docrender.docBgImage). Tagged data-bgpath/data-bgdim so a client can re-apply it once the picture's bytes
// arrive (the 'wp-asset' event below) — net.assetSrc hands back a placeholder until then.
function applySheetBg(node, style) {
    var DR = window.wpDocRender, v = (DR && DR.docBgImage && style) ? DR.docBgImage(style, imgSrc) : '';
    node.style.backgroundImage = v; node.style.backgroundSize = v ? 'cover' : ''; node.style.backgroundPosition = v ? 'center' : '';
    if (v) { node.dataset.bgpath = style.bgImage; node.dataset.bgdim = String(typeof style.bgDim === 'number' ? style.bgDim : 0); } else { delete node.dataset.bgpath; delete node.dataset.bgdim; }
}
// The look a sheet renders with (doc theming): the system's own sheet look over the campaign default, validated here on
// every machine (a player's copy re-cleans what the host sent).
function sheetLook(camp, sys) { var DR = window.wpDocRender; if (!DR || !DR.cleanDocStyle) return null; return DR.cleanDocStyle(DR.mergeDocStyle ? DR.mergeDocStyle(camp && camp.docStyle, sys && sys.sheetStyle) : (camp && camp.docStyle)); }
function applySheetLookTo(node, style) {
    node.style.fontFamily = ''; node.style.color = ''; node.style.backgroundColor = '';   // reset first so turning a look off restores the app style
    if (style) { var DF = (window.wpDocRender && window.wpDocRender.DOC_FONTS) || {}; if (style.font && DF[style.font]) node.style.fontFamily = DF[style.font]; if (style.textColor) node.style.color = style.textColor; if (style.bgColor) node.style.backgroundColor = style.bgColor; }
    // Stage 5g: the header block and the frame are opaque panels over the body. They wear the look's colours only as a PAIR (a text
    // colour AND a panel colour, plus a muted ink mixed from the two for labels); a look with just one of them leaves both panels in the
    // app theme's own colours, as before — a text colour alone over the app panel (or theme text over a look panel) could be unreadable
    var HEXC = /^#[0-9a-fA-F]{6}$/, pair = !!(style && HEXC.test(style.textColor || '') && HEXC.test(style.bgColor || ''));
    if (pair) { node.style.setProperty('--sheet-ink', style.textColor); node.style.setProperty('--sheet-bg', style.bgColor); node.style.setProperty('--sheet-dim', 'color-mix(in srgb, ' + style.textColor + ' 62%, ' + style.bgColor + ')'); }
    else { node.style.removeProperty('--sheet-ink'); node.style.removeProperty('--sheet-bg'); node.style.removeProperty('--sheet-dim'); }
    applySheetBg(node, style);
}
document.addEventListener('wp-asset', function(e) {
    var p = e.detail && e.detail.path, DR = window.wpDocRender; if (!p || !DR || !DR.docBgImage) return;
    document.querySelectorAll('[data-bgpath]:not(.wrap)').forEach(function(node) {   // sheet bodies (the live panel + a pop-out); page wraps are handbook.js's
        if (node.dataset.bgpath === p) node.style.backgroundImage = DR.docBgImage({ bgImage: p, bgDim: parseFloat(node.dataset.bgdim) || 0 }, imgSrc);
    });
});
// Render a character sheet READ-ONLY into an arbitrary container (the pop-out window; the pop-out never owns
// the save — window.wpPopout no-ops it — so nothing here can write data.json). GM view (full sheet), fields disabled.
function renderSheetInto(container, charId, camp) {
    camp = camp || getActiveCampaign();
    var raw = systemOf(camp), c0 = charById(charId, camp);
    if (!container || !c0 || !raw || !F()) return null;
    // the pop-out renders the RAW save (popout.js reads /api/data unsanitised): clean the system and the character here, as a load does,
    // so every sink below (the look's accent, section colours, icons, the portrait) sees validated values
    var sys = cleanSystem(raw, { F: F(), gmView: true }), c = sys ? cleanChar(c0, sys) : null;
    if (!sys || !c) return null;
    buildSections(container, sys, c, resolveAll(sys, c, F()), true, false, function() { renderSheetInto(container, charId, camp); });
    container.querySelectorAll('input, select, textarea').forEach(function(el) { el.disabled = true; });
    container.querySelectorAll('[contenteditable]').forEach(function(el) { el.setAttribute('contenteditable', 'false'); });
    container.classList.toggle('sheet-has-table', !!container.querySelector('.sheet-itemtable'));
    syncFramePad(container);
    applySheetLookTo(container, sheetLook(camp, sys));
    return { title: c.name || 'Character' };
}
var _secOpen = {};   // remembered collapse state of collapsible sections, keyed by section id (survives re-renders within a session; native <details> handles the visual toggle)
// Where the sticky frame (band + tab strip) sits in the body's flow, in the body's scroll coordinates: the scrollTop at which it
// just starts to stick. Infinity when there is no frame (so nothing counts as stuck).
// The stuck frame covers the top of the scrollport: reserve its height for the browser's scroll-into-view, so a control reached by
// keyboard is scrolled clear of it instead of staying hidden underneath. Re-run when the panel's width changes the frame's height.
function syncFramePad(body) {
    var fr = body.querySelector(':scope > .sheet-frame');
    if (fr) body.style.scrollPaddingTop = fr.offsetHeight + 'px'; else if (body.style.scrollPaddingTop) body.style.scrollPaddingTop = '';
}
function frameFlowTop(body) {
    var fr = body.querySelector(':scope > .sheet-frame'); if (!fr) return Infinity;
    var prev = fr.previousElementSibling; if (!prev) return 0;
    var gap = parseFloat(getComputedStyle(body).rowGap) || 0;
    return Math.max(0, Math.round(prev.getBoundingClientRect().bottom - body.getBoundingClientRect().top + body.scrollTop + gap));
}
// Stage 5d: the header block — identity rows (a small label over a read-only value, in columns) and ledger figures (a small label
// over a bold value), read from sys.sheet like the band and formatted by systemcore.headerEntry so a value reads exactly as the
// sheet prints it below. On a partial character (another player's copy) only hover fields show, since every other value would be
// a default. Stage 5g: with look.portrait the portrait and the name lead the block (the rows sit beside the picture); a ledger
// NUMBER is a live box for whoever may edit it (the section's own rule and commit), everything else stays read-only.
function headerBlocks(head, sys, c, all, gm, own) {
    var sh = sys.sheet; if (!sh) return;
    var byId = {}; sys.fields.forEach(function(f) { byId[f.id] = f; });
    var main = head;
    if (sh.look && sh.look.portrait) {
        var pw = el('div', 'sheet-head-portrait' + (c.portrait ? '' : ' sheet-head-portrait-none'));
        if (c.portrait) { var im = el('img'); im.alt = ''; im.src = imgSrc(c.portrait); pw.appendChild(im); }
        head.appendChild(pw); head.classList.add('sheet-head-grid');
        main = el('div', 'sheet-head-main'); head.appendChild(main);
        var nm = el('div', 'sheet-head-name', c.name || ''); nm.title = c.name || ''; main.appendChild(nm);
    }
    function block(list, cls, itemCls, ledger) {
        if (!Array.isArray(list) || !list.length) return;
        var box = el('div', cls);
        list.forEach(function(q) {
            var f = q && q.id ? byId[q.id] : null; if (!f) return;
            if (c.partial && !f.hover) return;
            var en = headerEntry(f, all[f.id]); if (!en) return;
            var it = el('div', itemCls + (f.vis === 'gm' ? ' sheet-gm' : ''));
            var lab = el('span', 'sheet-label', f.label); lab.title = f.key; it.appendChild(lab);
            var tone = en.neg ? ' sheet-hdr-neg' : en.pos ? ' sheet-hdr-pos' : '';
            if (ledger && f.kind === 'number' && !en.error && !c.partial && (gm || (own && f.edit === 'owner' && f.vis === 'all'))) {
                var raw = c.values ? c.values[f.id] : undefined;
                var inp = el('input', 'field sheet-num sheet-hdr-input' + tone); inp.type = 'number'; inp.dataset.fid = f.id; inp.dataset.part = 'hdr';
                inp.value = raw === undefined ? String(f.def) : String(raw); inp.step = String(f.step || 1); inp.title = f.label + (f.unit ? ' (' + f.unit + ')' : '');
                if (f.min !== undefined) inp.min = String(f.min); if (f.max !== undefined) inp.max = String(f.max);
                inp.addEventListener('change', function() { commit(c, f, Number(inp.value)); });
                var ed = el('span', 'sheet-hdr-val sheet-hdr-edit'); ed.appendChild(inp); if (f.unit) ed.appendChild(el('span', 'sheet-unit', f.unit));
                it.appendChild(ed); box.appendChild(it); return;
            }
            var v = el('span', 'sheet-hdr-val' + (en.chip ? ' sheet-hdr-chip' : '') + (en.error ? ' sheet-err' : '') + tone + (en.empty ? ' sheet-hdr-empty' : ''), en.chip ? 'on' : en.text);
            v.title = en.error ? en.error : en.empty ? f.label + ': not set' : en.text;   // a long value is ellipsised in its box: the tooltip carries the whole of it (the error's reason when there is one)
            it.appendChild(v); box.appendChild(it);
        });
        if (box.childNodes.length) main.appendChild(box);
    }
    block(sh.identity, 'sheet-identity', 'sheet-identity-item', false);
    block(sh.ledger, 'sheet-ledger', 'sheet-ledger-fig', true);
}
// Stage 5g: the text colour for a label on a filled accent (the open filled tab) — near-black or white, whichever reads better
function accentInk(hex) {
    var lin = function(i) { var v = parseInt(hex.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    var L = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
    return (L + 0.05) / 0.0567 >= 1.05 / (L + 0.05) ? '#111318' : '#ffffff';
}
function buildSections(body, sys, c, all, gm, own, rerender) {   // rerender: the caller's own render fn (renderSheet for the live panel, renderPreview for the Layout preview) so a tab click repaints THIS container, not the wrong one
    var sheet = (sys.sheet && sys.sheet.sections && sys.sheet.sections.length) ? sys.sheet : autoLayout(sys);
    var layout = sheet.sections || [];
    var tabs = (sheet.tabs && sheet.tabs.length) ? sheet.tabs : null;   // the auto layout has no tabs
    var byId = {}; sys.fields.forEach(function(f) { byId[f.id] = f; }); var rollById = {}; sys.rolls.forEach(function(r) { rollById[r.id] = r; });
    body.textContent = '';
    var look = (sys.sheet && sys.sheet.look) || {};   // Stage 5g: the sheet's shape — absent = today's look (no class, no variable)
    body.classList.toggle('sheet-titles-headline', look.titles === 'headline');
    body.classList.toggle('sheet-labels-caps', look.labels === 'caps');   // Fold B
    if (typeof look.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(look.accent)) { body.style.setProperty('--sheet-accent', look.accent); body.style.setProperty('--sheet-accent-ink', accentInk(look.accent)); }   // re-checked here: a hex or nothing reaches the variable
    else { body.style.removeProperty('--sheet-accent'); body.style.removeProperty('--sheet-accent-ink'); }
    // The top of the sheet (Stages 5c/5d, reworked after the owner's Foundry note): the header block (identity rows, ledger figures)
    // scrolls away like any content; the pinned band and the tab strip are the sticky FRAME, so the tabs stay reachable and most of the
    // panel is the tab's own content. Order: header block, dashboard sections, frame (band + strip), the tab's sections. Absent config
    // makes no element, and the body is exactly what it was.
    var head = el('div', 'sheet-head');
    headerBlocks(head, sys, c, all, gm, own);   // Stage 5d: identity rows + ledger figures, first under the name (Stage 5g: led by the portrait + name when the look asks)
    if (head.childNodes.length) body.appendChild(head);
    var frame = el('div', 'sheet-frame');
    // Stage 5c: the pinned band — on every tab (and on a stacked sheet). Read from sys.sheet itself (the automatic layout carries no
    // band) and built by the same node factories as a section, so a field's permissions, its −/+ and its roll behave exactly as they
    // do below; the band's inputs carry data-band so focus restore tells the copies apart.
    var bandDef = (sys.sheet && Array.isArray(sys.sheet.band)) ? sys.sheet.band : null;
    if (bandDef && bandDef.length) {
        var bandEl = el('div', 'sheet-band');
        bandDef.forEach(function(q) {
            var node = (q.id && byId[q.id]) ? fieldNode(byId[q.id], c, all[q.id], gm, own, sys) : (q.roll && rollById[q.roll]) ? rollNode(rollById[q.roll], c) : null;
            if (!node) return;
            node.classList.add('sheet-band-item'); node.classList.remove('sheet-tile');   // the band has its own compact look; a stat tile's column layout (and hidden bar) would out-specify it
            node.querySelectorAll('[data-fid]').forEach(function(x) { x.dataset.band = '1'; });
            bandEl.appendChild(node);
        });
        if (bandEl.childNodes.length) frame.appendChild(bandEl);
    }
    var tabIds = tabs ? tabs.map(function(t) { return t.id; }) : null;
    var active = '', stripEl = null;   // active tab lives on the container (body.dataset.wpTab) so the live sheet and the builder preview never bleed into each other; the strip is appended after the dashboard sections
    if (tabs) {
        active = body.dataset.wpTab || '';
        if (tabIds.indexOf(active) < 0) { active = tabIds[0]; body.dataset.wpTab = active; }
        var strip = el('div', 'sheet-tabs' + (look.tabs === 'filled' ? ' sheet-tabs-filled' : ''));   // Stage 5g: angled tabs, the open one filled in the accent
        tabs.forEach(function(t) {
            var tb = el('button', 'sheet-tab' + (t.id === active ? ' active' : '')); if (look.tabs === 'filled') tb.title = t.label || 'Tab';   // a filled tab can ellipsise a long label
            if (t.icon) tb.appendChild(el('span', 'sheet-tab-icon', t.icon));   // Stage 5g
            tb.appendChild(el('span', 'sheet-tab-label', t.label || 'Tab'));
            tb.addEventListener('click', function() {
                if (body.dataset.wpTab === t.id) return;
                var wasStuck = body.scrollTop > frameFlowTop(body);   // the frame was stuck at the top: the new tab should start at its own top, under the strip
                body.dataset.wpTab = t.id; (rerender || renderSheet)();
                if (wasStuck) body.scrollTop = frameFlowTop(body);
            });
            strip.appendChild(tb);
        });
        stripEl = strip;
    }
    var secN = 0, tabN = 0;
    var byIdSec = {}; layout.forEach(function(x) { byIdSec[x.id] = x; });
    // one level of nesting: a section is a sub-section only when its parent exists AND is itself top-level (so a grandchild never vanishes — it falls back to top-level)
    function childParent(sec) { return (sec.parent && byIdSec[sec.parent] && !byIdSec[sec.parent].parent) ? sec.parent : null; }
    var children = {}; layout.forEach(function(sec) { var p = childParent(sec); if (p) (children[p] = children[p] || []).push(sec); });
    // Stage 5d: dashboard sections — flagged "above the tabs" — render before the strip, so they stay on every tab (and come first on a stacked sheet)
    layout.forEach(function(sec) { if (!sec.pinned || childParent(sec)) return; var de = renderOneSection(sec, false); if (de) { de.classList.add('sheet-dash'); body.appendChild(de); secN++; } });
    if (stripEl) frame.appendChild(stripEl);
    if (frame.childNodes.length) body.appendChild(frame);   // the band and the strip: the sticky frame, after the dashboard sections
    function renderOneSection(sec, isChild) {
        var collap = !!sec.collapsible;
        var s = el(collap ? 'details' : 'div', 'sheet-section' + (collap ? ' sheet-collap' : '') + (isChild ? ' sheet-subsection' : ''));
        if (collap) { s.open = (sec.id in _secOpen) ? _secOpen[sec.id] : (sec.open !== false); s.addEventListener('toggle', function () { _secOpen[sec.id] = s.open; }); }
        var stripe = !!(sec.style && sec.style.accent && sec.style.stripe !== false);   // Stage 5g: an accent can colour the title alone
        if (sec.style && (sec.style.bg || sec.style.border || stripe)) {   // Stage 3: per-section colors (padding/radius so the panel reads as a box)
            s.style.padding = '8px 10px'; s.style.borderRadius = '8px';
            if (sec.style.bg) s.style.background = sec.style.bg;
            if (sec.style.border) s.style.border = '1px solid ' + sec.style.border;
            if (stripe) s.style.borderLeft = '3px solid ' + sec.style.accent;
        }
        var mvv = sec.meta ? all[sec.meta] : null, metaText = '';   // a field's resolved value, shown right-aligned in the header
        if (mvv != null) {
            if (typeof mvv === 'object') { if (!mvv.error) { if (mvv.text != null && mvv.text !== '') metaText = String(mvv.text); else if (typeof mvv.value === 'number') metaText = mvv.value + (typeof mvv.max === 'number' ? ' / ' + mvv.max : ''); } }
            else metaText = String(mvv);
        }
        var chipNode = sec.chip ? pageChip(sec.chip) : null;   // Stage 5f: a handbook chip
        if (sec.title || sec.icon || metaText || collap || chipNode) {   // a collapsible section always needs a summary to toggle from
            var head = el(collap ? 'summary' : 'div', 'sheet-sec-title');
            if (sec.icon) head.appendChild(el('span', 'sheet-sec-icon', sec.icon));   // Stage 5g
            var nameSpan = el('span', 'sheet-sec-name', sec.title || ''); if (sec.style && sec.style.accent) nameSpan.style.color = sec.style.accent;
            head.appendChild(nameSpan);
            if (metaText) head.appendChild(el('span', 'sheet-sec-meta', metaText));
            if (chipNode) head.appendChild(chipNode);
            s.appendChild(head);
        }
        var grid = el('div', 'sheet-grid'); grid.style.gridTemplateColumns = 'repeat(' + Math.max(1, Math.min(4, sec.cols || 1)) + ', minmax(0, 1fr))';
        (sec.fields || []).forEach(function(pl) {
            var node = null;
            if (pl.id && byId[pl.id]) node = fieldNode(byId[pl.id], c, all[pl.id], gm, own, sys, all.vars);
            else if (pl.roll && rollById[pl.roll]) node = rollNode(rollById[pl.roll], c);
            else if (pl.kind === 'heading') node = el('div', 'sheet-heading', pl.text || '');
            else if (pl.kind === 'divider') node = el('div', 'sheet-divider');
            else if (pl.kind === 'link') node = linkNode(pl);   // Stage 5f
            else if (pl.kind === 'portrait') { node = el('div', 'sheet-portrait-slot'); if (c.portrait) { var im = el('img'); im.src = imgSrc(c.portrait); im.alt = ''; node.appendChild(im); } }
            if (!node) return;
            if (pl.w === 'row') node.classList.add('sheet-row');
            grid.appendChild(node);
        });
        var hasOwn = grid.childNodes.length > 0;
        if (hasOwn) s.appendChild(grid);
        var kids = 0;
        if (!isChild && children[sec.id]) children[sec.id].forEach(function(ch) { var ce = renderOneSection(ch, true); if (ce) { s.appendChild(ce); kids++; } });   // sub-sections after the parent's own fields
        return (hasOwn || kids) ? s : null;
    }
    layout.forEach(function(sec) {
        if (sec.pinned || childParent(sec)) return;   // a dashboard section (already above the strip) or a sub-section (rendered under its parent)
        if (tabs) { var stab = (sec.tab && tabIds.indexOf(sec.tab) >= 0) ? sec.tab : tabIds[0]; if (stab !== active) return; }   // untabbed/unknown → first tab
        var secEl = renderOneSection(sec, false);
        if (secEl) { body.appendChild(secEl); secN++; tabN++; }
    });
    syncFramePad(body);
    if (tabs ? !tabN : !secN) body.appendChild(el('div', 'sys-empty', tabs ? 'Nothing on this tab yet.' : (sys.fields.length ? 'Nothing placed on the sheet yet.' : 'The system has no fields yet. Open the System editor.')));
}
/* ---------- the Layout tab (SB4): sections, columns, placements, a live preview ---------- */
function layoutSections() { if (!draft.sheet) draft.sheet = {}; if (!Array.isArray(draft.sheet.sections)) draft.sheet.sections = []; return draft.sheet.sections; }
function layoutTabs() { if (!draft.sheet) draft.sheet = {}; if (!Array.isArray(draft.sheet.tabs)) draft.sheet.tabs = []; return draft.sheet.tabs; }
function sheetList(key) { return (draft && draft.sheet && Array.isArray(draft.sheet[key])) ? draft.sheet[key].slice() : []; }   // a copy of one of the sheet's id lists (identity / ledger / band), [] when absent
function placementLabel(pl, byId, rollById) {
    if (pl.id) { var f = byId[pl.id]; return f ? (f.label || f.key || '(field)') + (f.key && f.label ? ' (' + f.key + ')' : '') : null; }
    if (pl.roll) { var r = rollById[pl.roll]; return r ? 'Roll: ' + (r.label || r.formula) : null; }
    if (pl.kind === 'heading') return 'Heading'; if (pl.kind === 'divider') return 'Divider'; if (pl.kind === 'portrait') return 'Portrait'; if (pl.kind === 'link') return 'Handbook link';
    return null;
}
function renderLayout() {
    var root = ui('sysLayoutSecs'); if (!root || !draft) return;
    var secs = layoutSections(), byId = {}, rollById = {}, placed = {};
    draft.fields.forEach(function(f) { byId[f.id] = f; }); draft.rolls.forEach(function(r) { rollById[r.id] = r; });
    secs.forEach(function(s) { (s.fields || []).forEach(function(p) { if (p.id) placed[p.id] = 1; }); });
    root.textContent = '';
    // Tabs (optional, Stage 1): group sections into a tab strip on the sheet. No tabs = one stacked page.
    var tabs = layoutTabs();
    var tabBox = el('div', 'sys-tabmgr');
    tabBox.appendChild(el('div', 'sys-tabmgr-head', 'Tabs (optional)'));
    if (!tabs.length) tabBox.appendChild(el('div', 'sys-hint', 'No tabs — the sections stack as one page. Add a tab to group them into a tab strip on the sheet; each section then picks its tab.'));
    tabs.forEach(function(tb) {
        var tr = el('div', 'sys-row sys-tab'); tr.dataset.tid = tb.id;
        var tmain = el('div', 'sys-row-main');
        tmain.appendChild(input('sys-tab-icon field', tb.icon, 'An icon before the label on the sheet \u2014 an emoji or a symbol (optional)', 'Icon'));   // Stage 5g
        tmain.appendChild(input('sys-tab-label field', tb.label, 'This tab\'s label on the sheet', 'Tab label'));
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
    lookBox.appendChild(el('div', 'sys-tabmgr-head', 'Sheet look (optional)'));
    var look = (draft.sheetStyle && typeof draft.sheetStyle === 'object') ? draft.sheetStyle : null;
    var lookRow = el('div', 'sys-sec-style');
    var FONTS = (window.wpDocRender && window.wpDocRender.DOC_FONTS) || {};
    var fontSel = select('sys-look-font', [['', 'Default font']].concat(Object.keys(FONTS).map(function(k) { return [k, k.charAt(0).toUpperCase() + k.slice(1)]; })), (look && look.font) || '', 'The sheet\'s font, over the campaign default');
    lookRow.appendChild(fontSel);
    var mkColor = function(key, title, fallback) { var i = el('input', 'sys-look-color'); i.type = 'color'; i.value = (look && look[key]) || fallback; i.title = title; i.dataset.key = key; return i; };
    lookRow.appendChild(el('span', 'sys-sec-style-lbl', 'Text')); lookRow.appendChild(mkColor('textColor', 'Text color', '#e8e2d0'));
    lookRow.appendChild(el('span', 'sys-sec-style-lbl', 'Panel')); lookRow.appendChild(mkColor('bgColor', 'Panel background color', '#181510'));
    var pic = el('button', 'tool ghost sys-btn', (look && look.bgImage) ? 'Change picture\u2026' : 'Background picture\u2026'); pic.dataset.look = 'pic'; pic.title = 'A picture from the image library behind the sheet'; lookRow.appendChild(pic);
    if (look && look.bgImage) { lookRow.appendChild(el('span', 'sys-sec-style-lbl', 'Dim')); var dim = el('input', 'sys-look-dim'); dim.type = 'range'; dim.min = 0; dim.max = 90; dim.step = 5; dim.value = typeof look.bgDim === 'number' ? look.bgDim : 40; dim.title = 'Dim the picture so the text stays readable'; lookRow.appendChild(dim); }
    if (look) { var lclr = el('button', 'tool ghost sys-btn sys-sec-styleclr', 'Clear'); lclr.dataset.look = 'clear'; lclr.title = 'Back to the campaign default'; lookRow.appendChild(lclr); }
    lookBox.appendChild(lookRow);
    lookBox.appendChild(el('div', 'sys-hint', 'Absent = the campaign default (the \uD83C\uDFA8 button on a page or planner). Players see the same look on their sheets.'));
    // Stage 5g: the sheet's shape — kept on the layout (draft.sheet.look), not in the doc-theming style: titles, tabs, one accent, the portrait + name
    var themeGold = function() { try { var x = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim(); return /^#[0-9a-fA-F]{6}$/.test(x) ? x.toLowerCase() : '#e0a54f'; } catch (er) { return '#e0a54f'; } };
    var shape = (draft.sheet && draft.sheet.look && typeof draft.sheet.look === 'object') ? draft.sheet.look : {};
    var shapeRow = el('div', 'sys-sec-style sys-lookshape');
    var titlesSel = select('sys-look-titles', [['', 'Small titles'], ['headline', 'Headline titles']], shape.titles || '', 'Section titles: small capitals (as now), or bigger headline titles');
    var tabsSel = select('sys-look-tabs', [['', 'Underlined tabs'], ['filled', 'Filled tabs']], shape.tabs || '', 'The tab strip: an underline under the open tab (as now), or angled tabs with the open one filled in the accent');
    var labelsSel = select('sys-look-labels', [['', 'Plain labels'], ['caps', 'Capital labels']], shape.labels || '', 'Field labels: as they are, or small bold capitals like a printed sheet');
    shapeRow.appendChild(titlesSel); shapeRow.appendChild(tabsSel); shapeRow.appendChild(labelsSel);
    shapeRow.appendChild(el('span', 'sys-sec-style-lbl', 'Accent'));
    var accentIn = el('input', 'sys-look-accent'); accentIn.type = 'color'; accentIn.value = shape.accent || themeGold(); accentIn.title = 'The sheet\u2019s accent: section titles, the open tab, the name in the header'; shapeRow.appendChild(accentIn);
    var portLbl = el('label', 'sys-hover'); var portChk = el('input', 'sys-look-portrait'); portChk.type = 'checkbox'; portChk.checked = !!shape.portrait; portLbl.appendChild(portChk); portLbl.appendChild(document.createTextNode(' Portrait & name in the header')); portLbl.title = 'The character\u2019s portrait and name lead the header block, with the identity rows and ledger figures beside the picture'; shapeRow.appendChild(portLbl);
    if (shape.accent) { var aclr = el('button', 'tool ghost sys-btn', 'Theme accent'); aclr.title = 'Back to the theme\u2019s gold'; aclr.addEventListener('click', function() { setShape('accent', null); renderLayout(); }); shapeRow.appendChild(aclr); }
    lookBox.appendChild(shapeRow);
    root.appendChild(lookBox);
    var setShape = function(key, val) { if (!draft.sheet) draft.sheet = {}; var lk = (draft.sheet.look && typeof draft.sheet.look === 'object') ? draft.sheet.look : {}; if (val === null || val === '' || val === false || val === undefined) delete lk[key]; else lk[key] = val; if (Object.keys(lk).length) draft.sheet.look = lk; else delete draft.sheet.look; markDirty(); renderPreview(); };
    titlesSel.addEventListener('change', function() { setShape('titles', titlesSel.value); });
    tabsSel.addEventListener('change', function() { setShape('tabs', tabsSel.value); });
    labelsSel.addEventListener('change', function() { setShape('labels', labelsSel.value); });
    accentIn.addEventListener('input', function() { setShape('accent', accentIn.value); });
    accentIn.addEventListener('change', function() { renderLayout(); });   // the "Theme accent" button appears once one is picked
    portChk.addEventListener('change', function() { setShape('portrait', portChk.checked); });
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
    function pinBox(cfg) {
        var list = (draft.sheet && Array.isArray(draft.sheet[cfg.key])) ? draft.sheet[cfg.key] : [];
        var keep = list.filter(function(q) { return q && (q.id ? !!(byId[q.id] && cfg.kinds[byId[q.id].kind] === 1) : !!(cfg.rolls && q.roll && rollById[q.roll])); });
        if (keep.length !== list.length) { if (keep.length) draft.sheet[cfg.key] = list = keep; else { delete draft.sheet[cfg.key]; list = []; } }
        var box = el('div', 'sys-tabmgr sys-bandbox'); box.id = cfg.boxId;
        box.appendChild(el('div', 'sys-tabmgr-head', cfg.title));
        box.appendChild(el('div', 'sys-hint', list.length ? cfg.hintFull : cfg.hintEmpty));
        var chips = el('div', 'sys-band-list'), on = {};
        list.forEach(function(q, bi) {
            var text = placementLabel(q, byId, rollById); if (text === null) return;
            on[q.id || q.roll] = 1;
            var chip = el('div', 'sys-band-pl'); chip.dataset.bi = String(bi);
            chip.appendChild(el('span', 'sys-pl-name', text));
            chip.appendChild(btnRow([['pinleft', 'Move left', '&#9664;'], ['pinright', 'Move right', '&#9654;'], ['pindel', cfg.delTitle, '&times;']]));
            chips.appendChild(chip);
        });
        if (chips.childNodes.length) box.appendChild(chips);
        var opts = [['', cfg.addLabel]];
        draft.fields.forEach(function(f) { if (cfg.kinds[f.kind] === 1 && !on[f.id]) opts.push(['f:' + f.id, (f.label || f.key || '(field)') + (f.key ? ' (' + f.key + ')' : '')]); });
        if (cfg.rolls) draft.rolls.forEach(function(r) { if (!on[r.id]) opts.push(['r:' + r.id, 'Roll: ' + (r.label || r.formula)]); });
        var row = el('div', 'sys-row-main sys-band-addrow');
        var add = select('sys-band-add', opts, '', cfg.addTitle); row.appendChild(add);
        if (list.length) { var clr = el('button', 'tool ghost sys-btn', 'Clear'); clr.title = cfg.clearTitle; clr.addEventListener('click', function() { delete draft.sheet[cfg.key]; markDirty(); renderLayout(); }); row.appendChild(clr); }
        box.appendChild(row);
        var lst = function() { if (!draft.sheet) draft.sheet = {}; if (!Array.isArray(draft.sheet[cfg.key])) draft.sheet[cfg.key] = []; return draft.sheet[cfg.key]; };
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
            else if (act === 'pindel') { l.splice(bi, 1); if (!l.length) delete draft.sheet[cfg.key]; }
            else return;
            markDirty(); renderLayout();
        });
        root.appendChild(box);
    }
    pinBox({ key: 'identity', boxId: 'sysIdentityBox', title: 'Identity rows (optional)', kinds: IDENTITY_KINDS, rolls: false, limit: LIMITS.identity,
        hintFull: 'Read-only, under the name, in columns: a small label over each value; they scroll away with the sheet, leaving the band and the tabs at the top. Editing stays in the sections; players see the same rows.',
        hintEmpty: 'No identity rows \u2014 pick the fields that say who this is (ancestry, class, level, homeworld\u2026) and they read as labelled values under the name, in columns.',
        addLabel: 'Add an identity row\u2026', addTitle: 'A text, select, number, formula, skill, resource or toggle to show read-only under the name', delTitle: 'Take off the identity rows (the field stays wherever else it is)', clearTitle: 'Take every identity row off', capMsg: 'At most ' + LIMITS.identity + ' identity rows.' });
    pinBox({ key: 'ledger', boxId: 'sysLedgerBox', title: 'Ledger figures (optional)', kinds: LEDGER_KINDS, rolls: false, limit: LIMITS.ledger,
        hintFull: 'Figures under the identity rows: a small label over a bold value (a negative reads red). A number is a box whoever may edit it can change right there; formulas, skills and resources are edited in the sections.',
        hintEmpty: 'No ledger \u2014 pick a few numbers (points spent, remaining, a total) and they read as bold figures under the name.',
        addLabel: 'Add a figure\u2026', addTitle: 'A number, formula, skill or resource to show as a figure (a number stays editable there)', delTitle: 'Take off the ledger (the field stays wherever else it is)', clearTitle: 'Take every figure off', capMsg: 'At most ' + LIMITS.ledger + ' ledger figures.' });
    pinBox({ key: 'band', boxId: 'sysBandBox', title: 'Pinned band (optional)', kinds: BAND_KINDS, rolls: true, limit: LIMITS.band,
        hintFull: 'Shown on every tab, just above the tab strip, and it stays at the top with the strip while the sheet scrolls. A field can be here and in a section too.',
        hintEmpty: 'No band \u2014 pin a few numbers, resources, toggles or rolls and they stay under the name on every tab, above the tab strip.',
        addLabel: 'Pin to the band\u2026', addTitle: 'A number, formula, skill, resource, toggle or roll to keep in view on every tab', delTitle: 'Take off the band (it stays wherever else it is on the sheet)', clearTitle: 'Take everything off the band', capMsg: 'The band holds at most ' + LIMITS.band + ' items.' });
    if (!secs.length) root.appendChild(el('div', 'sys-empty', 'No layout of your own yet: the sheet shows the automatic layout (one section per kind, then the rolls). Start from it, or add a section.'));
    secs.forEach(function(sec) {
        var row = el('div', 'sys-row sys-sec'); row.dataset.sid = sec.id;
        var top = el('div', 'sys-row-main');
        top.appendChild(input('sys-sec-icon field', sec.icon, 'An icon before the title \u2014 an emoji or a symbol (optional)', 'Icon'));   // Stage 5g
        top.appendChild(input('sys-sec-title field', sec.title, 'The section\'s title on the sheet (empty = none)', 'Section title'));
        top.appendChild(select('sys-sec-cols', [[1, '1 column'], [2, '2 columns'], [3, '3 columns'], [4, '4 columns']], Math.max(1, Math.min(4, sec.cols || 1)), 'Fields per row in this section'));
        if (tabs.length) top.appendChild(select('sys-sec-tab', [['', 'No tab']].concat(tabs.map(function(t) { return [t.id, t.label || 'Tab']; })), sec.tab || '', 'Which tab this section appears on'));
        top.appendChild(select('sys-sec-collap', [['', 'Fixed'], ['1', 'Collapsible']], sec.collapsible ? '1' : '', 'A collapsible section the reader can fold away'));
        top.appendChild(select('sys-sec-pinned', [['', 'On its tab'], ['1', 'Above the tabs']], sec.pinned ? '1' : '', 'A dashboard section: stays above the tab strip on every tab (and comes first on a stacked sheet)'));
        top.appendChild(select('sys-sec-meta', [['', 'No count']].concat(draft.fields.map(function(f) { return [f.id, f.label || f.key || '(field)']; })), sec.meta || '', 'A field whose value shows in the section header (e.g. a running total)'));
        top.appendChild(select('sys-sec-parent', [['', 'Top level']].concat(secs.filter(function(o) { return o.id !== sec.id && !o.parent; }).map(function(o) { return [o.id, 'Under: ' + (o.title || '(untitled)')]; })), sec.parent || '', 'Nest this section under another one (one level)'));
        top.appendChild(btnRow([['secup', 'Move this section up', '&#9650;'], ['secdown', 'Move this section down', '&#9660;'], ['secdel', 'Remove this section (its fields go back to the list)', '&times;']]));
        row.appendChild(top);
        var styleRow = el('div', 'sys-sec-style');   // Stage 3: per-section colors
        styleRow.appendChild(el('span', 'sys-sec-style-lbl', 'Colors'));
        [['accent', 'Accent', '#e0a54f'], ['bg', 'Panel', '#20202c'], ['border', 'Border', '#3a3a4a']].forEach(function(sp) {
            var wrap = el('label', 'sys-sec-color'); wrap.appendChild(document.createTextNode(sp[1]));
            var ci = el('input', 'sys-sec-' + sp[0]); ci.type = 'color'; ci.value = (sec.style && sec.style[sp[0]]) || sp[2]; ci.title = sp[1] + ' color for this section (drag the section’s Clear to remove)';
            wrap.appendChild(ci); styleRow.appendChild(wrap);
        });
        if (sec.style && sec.style.accent) { var stl = el('label', 'sys-sec-color'); var stc = el('input', 'sys-sec-stripe'); stc.type = 'checkbox'; stc.checked = sec.style.stripe !== false; stl.appendChild(stc); stl.appendChild(document.createTextNode(' Stripe')); stl.title = 'The accent also draws a stripe down the section\u2019s left edge (off: it colours the title only)'; styleRow.appendChild(stl); }   // Stage 5g
        if (sec.style) { var clr = el('button', 'tool ghost sys-btn sys-sec-styleclr', 'Clear'); clr.dataset.act = 'secstyleclr'; clr.title = 'Remove this section’s colors'; styleRow.appendChild(clr); }
        row.appendChild(styleRow);
        var chipOpts = pageOptions(sec.chip || '', 'No chip');
        if (chipOpts.length > 1) {   // Stage 5f: a handbook chip in this section's header (only when the campaign has pages, or one is already set)
            var chipRow = el('div', 'sys-sec-style'); chipRow.appendChild(el('span', 'sys-sec-style-lbl', 'Handbook'));
            chipRow.appendChild(select('sys-sec-chip', chipOpts, sec.chip || '', 'A chip in this section\u2019s header that opens a handbook page (players see it only when they can read the page)'));
            row.appendChild(chipRow);
        }
        var list = el('div', 'sys-pl-list'); list.dataset.sid = sec.id;
        (sec.fields || []).forEach(function(pl, pi) {
            var text = placementLabel(pl, byId, rollById); if (text === null) return;
            var pr = el('div', 'sys-pl'); pr.dataset.sid = sec.id; pr.dataset.pi = String(pi); pr.draggable = true;
            pr.appendChild(el('span', 'sys-pl-grip', String.fromCharCode(8942)));
            pr.appendChild(el('span', 'sys-pl-name', text));
            if (pl.kind === 'heading') pr.appendChild(input('sys-pl-text field', pl.text, 'The heading\'s text', 'Heading text'));
            if (pl.kind === 'link') {   // Stage 5f: which page, and an optional label (blank = the page's own title)
                pr.appendChild(select('sys-pl-page', pageOptions(pl.page, pl.page ? null : 'Choose a page\u2026'), pl.page || '', 'The handbook page this button opens'));
                pr.appendChild(input('sys-pl-text field', pl.text, 'The button\'s label (blank = the page\'s title)', 'Label (optional)'));
            }
            var wb = el('button', 'tool ghost sys-btn sys-pl-w', pl.w === 'row' ? 'Full row' : '1 column'); wb.dataset.act = 'plw'; wb.title = 'Width: one column of the section, or the full row'; pr.appendChild(wb);
            pr.appendChild(btnRow([['plup', 'Move up', '&#9650;'], ['pldown', 'Move down', '&#9660;'], ['pldel', 'Take off the sheet (the field stays defined)', '&times;']]));
            list.appendChild(pr);
        });
        row.appendChild(list);
        var addRow = el('div', 'sys-row-main sys-pl-addrow'), opts = [['', 'Add to this section\u2026']];
        draft.fields.forEach(function(f) { if (!placed[f.id]) opts.push(['f:' + f.id, (f.label || f.key || '(field)') + (f.key ? ' (' + f.key + ')' : '')]); });
        draft.rolls.forEach(function(r) { opts.push(['r:' + r.id, 'Roll: ' + (r.label || r.formula)]); });
        opts.push(['k:heading', 'Heading'], ['k:divider', 'Divider'], ['k:portrait', 'Portrait']);
        if (pageOptions('', null).length) opts.push(['k:link', 'Handbook link']);   // Stage 5f: only when the campaign has pages
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
    buildSections(box, clean, pc, resolveAll(clean, pc, F()), true, false, renderPreview);
    applySheetLookTo(box, sheetLook(camp, clean));   // the preview wears the sheet's look too
}
function onLayoutInput(t) {
    var c = t.className || '';
    if (c.indexOf('sys-tab-icon') >= 0) { var itr = t.closest && t.closest('.sys-row.sys-tab'); if (itr) { var tbi = layoutTabs().find(function(x) { return x.id === itr.dataset.tid; }); if (tbi) { if (t.value.trim()) tbi.icon = t.value.slice(0, 32); else delete tbi.icon; markDirty(); renderPreview(); } } return true; }   // Stage 5g (Save trims it to a few code points)
    if (c.indexOf('sys-tab-label') >= 0) { var ltr = t.closest && t.closest('.sys-tab'); if (ltr) { var tb0 = layoutTabs().find(function(x) { return x.id === ltr.dataset.tid; }); if (tb0) { tb0.label = t.value.slice(0, LIMITS.label); markDirty(); renderPreview(); } } return true; }
    var lsec = t.closest && t.closest('.sys-sec'); if (!lsec) return false;
    var sec = layoutSections().find(function(s) { return s.id === lsec.dataset.sid; }); if (!sec) return true;
    var plr = t.closest('.sys-pl');
    if (plr && c.indexOf('sys-pl-text') >= 0) { var pl = (sec.fields || [])[+plr.dataset.pi]; if (pl) pl.text = t.value.slice(0, LIMITS.label); }
    else if (c.indexOf('sys-sec-title') >= 0) sec.title = t.value.slice(0, LIMITS.label);
    else if (c.indexOf('sys-sec-icon') >= 0) { if (t.value.trim()) sec.icon = t.value.slice(0, 32); else delete sec.icon; }   // Stage 5g
    else return false;
    markDirty(); renderPreview(); return true;
}
function onLayoutChange(t) {
    var c = t.className || '', lsec = t.closest && t.closest('.sys-sec'); if (!lsec) return false;
    var sec = layoutSections().find(function(s) { return s.id === lsec.dataset.sid; }); if (!sec) return true;
    if (c.indexOf('sys-sec-tab') >= 0) { if (t.value) sec.tab = t.value; else delete sec.tab; markDirty(); renderPreview(); return true; }
    if (c.indexOf('sys-sec-collap') >= 0) { if (t.value) sec.collapsible = true; else delete sec.collapsible; markDirty(); renderPreview(); return true; }
    if (c.indexOf('sys-sec-chip') >= 0) { if (t.value) sec.chip = t.value; else delete sec.chip; markDirty(); renderPreview(); return true; }   // Stage 5f
    if (c.indexOf('sys-pl-page') >= 0) { var plp = t.closest('.sys-pl'), plk = plp ? (sec.fields || [])[+plp.dataset.pi] : null; if (plk && plk.kind === 'link') { plk.page = t.value; markDirty(); renderLayout(); } return true; }   // Stage 5f: a link's page
    if (c.indexOf('sys-sec-pinned') >= 0) { if (t.value) sec.pinned = true; else delete sec.pinned; markDirty(); renderPreview(); return true; }
    if (c.indexOf('sys-sec-meta') >= 0) { if (t.value) sec.meta = t.value; else delete sec.meta; markDirty(); renderPreview(); return true; }
    if (c.indexOf('sys-sec-parent') >= 0) { if (t.value) sec.parent = t.value; else delete sec.parent; markDirty(); renderPreview(); return true; }
    if (c.indexOf('sys-sec-cols') >= 0) { sec.cols = Math.max(1, Math.min(4, Number(t.value) || 1)); markDirty(); renderPreview(); return true; }
    if (c.indexOf('sys-sec-stripe') >= 0) { if (sec.style) { if (t.checked) delete sec.style.stripe; else sec.style.stripe = false; markDirty(); renderPreview(); } return true; }   // Stage 5g
    if (c.indexOf('sys-sec-accent') >= 0 || c.indexOf('sys-sec-bg') >= 0 || c.indexOf('sys-sec-border') >= 0) {   // Stage 3: per-section colors
        var skey = c.indexOf('sys-sec-accent') >= 0 ? 'accent' : c.indexOf('sys-sec-bg') >= 0 ? 'bg' : 'border';
        sec.style = sec.style || {}; sec.style[skey] = t.value; markDirty(); renderLayout(); return true;   // renderLayout so the Clear button appears
    }
    if (c.indexOf('sys-pl-add') >= 0) {
        var v = t.value; t.value = ''; if (!v) return true;
        var total = 0; layoutSections().forEach(function(s) { total += (s.fields || []).length; });
        if (total >= LIMITS.placements) { toast('The sheet holds at most ' + LIMITS.placements + ' placements.'); return true; }
        sec.fields = sec.fields || [];
        var kind = v.slice(0, 1), id = v.slice(2), pl = null;
        if (kind === 'f') { if (draft.fields.some(function(f) { return f.id === id; })) pl = { id: id, w: 1 }; }
        else if (kind === 'r') { if (draft.rolls.some(function(r) { return r.id === id; })) pl = { roll: id, w: 1 }; }
        else if (kind === 'k') { pl = { kind: id, w: id === 'portrait' || id === 'link' ? 1 : 'row' }; if (id === 'heading') pl.text = ''; if (id === 'link') { var firstPage = pageOptions('', null)[0]; pl.text = ''; pl.page = firstPage ? firstPage[0] : ''; } }
        if (pl) { sec.fields.push(pl); markDirty(); renderLayout(); }
        return true;
    }
    return false;
}
function onLayoutClick(b) {
    if (b.id === 'sysAddSection') { var secsA = layoutSections(); if (secsA.length >= LIMITS.sections) { toast('At most ' + LIMITS.sections + ' sections.'); return true; } secsA.push({ id: uid('s_'), title: '', cols: 2, fields: [] }); markDirty(); renderLayout(); var last = ui('sysLayoutSecs').lastElementChild; if (last) { var ti = last.querySelector('.sys-sec-title'); if (ti) ti.focus(); } return true; }
    if (b.id === 'sysLayoutAuto') {   // rebuilds the sections; the tabs and the pinned band are kept (owner's call, Stage 5c) — the sections land on the first tab
        var cl = cleanSystem(draft, { F: F(), gmView: true }), keepId = sheetList('identity'), keepLed = sheetList('ledger'), keepTabs = layoutTabs().slice(), keepBand = (draft.sheet && Array.isArray(draft.sheet.band)) ? draft.sheet.band.slice() : [];
        var keepLook = (draft.sheet && draft.sheet.look && typeof draft.sheet.look === 'object') ? draft.sheet.look : null;   // Stage 5g: the shape lives in the Sheet look box — kept
        draft.sheet = { sections: autoLayout(cl || draft).sections }; if (keepLook) draft.sheet.look = keepLook; if (keepTabs.length) draft.sheet.tabs = keepTabs; if (keepBand.length) draft.sheet.band = keepBand;
        if (keepId.length) draft.sheet.identity = keepId; if (keepLed.length) draft.sheet.ledger = keepLed;   // Stage 5d: the header block is kept as well
        var keptAny = keepTabs.length || keepBand.length || keepId.length || keepLed.length;
        markDirty(); renderLayout(); toast(keptAny ? 'The automatic layout is now yours to change; your tabs, header block and band are kept.' : 'The automatic layout is now yours to change.'); return true;
    }
    if (b.id === 'sysLayoutClear') { if (!layoutSections().length && !layoutTabs().length && !(draft.sheet && draft.sheet.band && draft.sheet.band.length) && !sheetList('identity').length && !sheetList('ledger').length) return true; showConfirm('Remove your layout? The sheet goes back to the automatic one (one section per kind, then the rolls), with no tabs, no identity rows or ledger figures and no pinned band (the Sheet look box is kept).', function(yes) { if (yes) { var keepShape = draft.sheet && draft.sheet.look; draft.sheet = { sections: [] }; if (keepShape) draft.sheet.look = keepShape; markDirty(); renderLayout(); } }); return true; }
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
    else if (act === 'secdel') { secs.splice(si, 1); }
    else if (act === 'secstyleclr') { delete sec.style; }   // Stage 3: remove the section's colors
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
// ---- item-list widgets (Stage 4: the plain list and the rich table share these) ----
var ITEM_COL_LABEL = { category: 'Category', cost: 'Cost', damage: 'Damage', area: 'Area', notes: 'Notes' };
function itemThrowBtn(def, c) {
    var tb = el('button', 'tool ghost sheet-item-throw', '💥 Throw'); tb.title = 'Throw ' + def.name + ' — then click the map';
    tb.addEventListener('click', function() { if (window.wpArmBlast) { window.wpArmBlast(def.area.ft, def.area.name || def.name, { charId: c.id, itemId: def.id, by: c.name, damage: def.damage || '' }); closeSheet(); } });
    return tb;
}
function itemQtyCell(entry, c, f) {
    var qc = el('span', 'sheet-item-qty');
    var mn = el('button', 'tool ghost sheet-pm', '−'); mn.title = 'One less (removes at zero)'; mn.addEventListener('click', function() { commitItem(c, f, 'setQty', entry.defId, entry.qty - 1); });
    qc.appendChild(mn); qc.appendChild(el('span', 'sheet-item-qtyn', '×' + entry.qty));
    var pl = el('button', 'tool ghost sheet-pm', '+'); pl.title = 'One more'; pl.addEventListener('click', function() { commitItem(c, f, 'add', entry.defId, 1); });
    qc.appendChild(pl); return qc;
}
function itemRmBtn(entry, def, c, f) {
    var rm = el('button', 'tool ghost sheet-item-rm', '×'); rm.title = 'Remove ' + def.name;
    rm.addEventListener('click', function() { commitItem(c, f, 'remove', entry.defId, 0); }); return rm;
}
function itemCellText(col, def) {
    if (col === 'category') return def.category || '';
    if (col === 'cost') return def.cost || '';
    if (col === 'damage') return def.damage || '';
    if (col === 'area') return def.area ? (def.area.ft + ' ft' + (def.area.shape && def.area.shape !== 'circle' ? ' ' + def.area.shape : '')) : '';
    return '';
}
function itemListInto(wrap, f, c, carried, byId, canThrow, editable) {
    carried.forEach(function(entry) {
        var def = byId[entry.defId]; if (!def) return;
        var line = el('div', 'sheet-item');
        if (def.icon) line.appendChild(el('span', 'sheet-item-icon', def.icon));
        var nm = el('span', 'sheet-item-name', def.name); if (def.area) nm.appendChild(el('span', 'sheet-item-area-tag', ' ' + def.area.ft + ' ft')); if (def.notes) nm.title = def.notes; line.appendChild(nm);
        if (def.area && canThrow) line.appendChild(itemThrowBtn(def, c));
        if (editable) { line.appendChild(itemQtyCell(entry, c, f)); line.appendChild(itemRmBtn(entry, def, c, f)); }
        else line.appendChild(el('span', 'sheet-item-qtyn', '×' + entry.qty));
        wrap.appendChild(line);
    });
    if (!carried.length) wrap.appendChild(el('div', 'sheet-empty-note', 'No items.'));
}
function itemTableInto(wrap, f, c, carried, byId, canThrow, editable) {
    var tbl = f.table, cols = (tbl.columns || []).slice();
    if (tbl.chips) cols = cols.filter(function(x) { return x !== 'category'; });   // a chip beside the name replaces the column
    var wantNotes = cols.indexOf('notes') >= 0; cols = cols.filter(function(x) { return x !== 'notes'; });   // notes render as an expandable row, not a column
    var hasAct = editable || canThrow || wantNotes, span = 1 + cols.length + 1 + (hasAct ? 1 : 0);
    var table = el('table', 'sheet-itemtable'), thead = el('thead'), htr = el('tr');
    htr.appendChild(el('th', 'sheet-itcol-name', 'Item'));
    cols.forEach(function(col) { htr.appendChild(el('th', 'sheet-itcol-' + col, ITEM_COL_LABEL[col] || col)); });
    htr.appendChild(el('th', 'sheet-itcol-qty', 'Qty'));
    if (hasAct) htr.appendChild(el('th', 'sheet-itcol-act', ''));
    thead.appendChild(htr); table.appendChild(thead);
    var tbody = el('tbody'), shown = 0, totalQty = 0;
    carried.forEach(function(entry) {
        var def = byId[entry.defId]; if (!def) return;
        shown++; totalQty += entry.qty;
        var tr = el('tr'), nameTd = el('td', 'sheet-itcol-name');
        if (def.icon) nameTd.appendChild(el('span', 'sheet-item-icon', def.icon));
        nameTd.appendChild(document.createTextNode(def.name));
        if (def.area) nameTd.appendChild(el('span', 'sheet-item-area-tag', ' ' + def.area.ft + ' ft'));
        if (tbl.chips && def.category) nameTd.appendChild(el('span', 'sheet-chip', def.category));
        tr.appendChild(nameTd);
        cols.forEach(function(col) { tr.appendChild(el('td', 'sheet-itcol-' + col, itemCellText(col, def))); });
        var qtyTd = el('td', 'sheet-itcol-qty');
        qtyTd.appendChild(editable ? itemQtyCell(entry, c, f) : el('span', 'sheet-item-qtyn', '×' + entry.qty));
        tr.appendChild(qtyTd);
        var notesRow = null;
        if (hasAct) {
            var actTd = el('td', 'sheet-itcol-act');
            if (def.area && canThrow) actTd.appendChild(itemThrowBtn(def, c));
            if (wantNotes && def.notes) {
                notesRow = el('tr', 'sheet-itemtable-notes'); var ntd = el('td', null, def.notes); ntd.colSpan = span; notesRow.appendChild(ntd); notesRow.style.display = 'none';
                var nt = el('button', 'tool ghost sheet-item-notes-t', '📝'); nt.title = 'Notes';
                nt.addEventListener('click', function() { notesRow.style.display = notesRow.style.display === 'none' ? '' : 'none'; });
                actTd.appendChild(nt);
            }
            if (editable) actTd.appendChild(itemRmBtn(entry, def, c, f));
            tr.appendChild(actTd);
        }
        tbody.appendChild(tr);
        if (notesRow) tbody.appendChild(notesRow);
    });
    if (!shown) { var er = el('tr'), ec = el('td', 'sheet-empty-note', 'No items.'); ec.colSpan = span; er.appendChild(ec); tbody.appendChild(er); }
    table.appendChild(tbody);
    if (tbl.footer && shown) {
        var tfoot = el('tfoot'), ftr = el('tr'), fc = el('td', 'sheet-itft', shown + (shown === 1 ? ' item' : ' items')); fc.colSpan = 1 + cols.length; ftr.appendChild(fc);
        ftr.appendChild(el('td', 'sheet-itft-qty', '×' + totalQty));
        if (hasAct) ftr.appendChild(el('td', null, ''));
        tfoot.appendChild(ftr); table.appendChild(tfoot);
    }
    wrap.appendChild(table);
}
// Stage 5g: a value coloured by its sign — only on a field that asks (green above zero, red below; zero and errors stay plain)
function signTone(f, e) { if (!f.sign || !e || e.error || typeof e.value !== 'number') return ''; return e.value < 0 ? ' sheet-neg' : e.value > 0 ? ' sheet-pos' : ''; }
// A field on the sheet: its control, then (Fold B) its caption line — text, with each {formula} worked out for this character, drawn as text
function fieldNode(f, c, e, gm, own, sysArg, vars) {   // vars: the render's resolver (sections pass it; the band shows no captions)
    var box = fieldNodeBody(f, c, e, gm, own, sysArg);
    if (f.caption && sysArg && vars && F()) box.appendChild(captionNode(f.caption, sysArg, c, vars));
    return box;
}
function captionNode(text, sys, c, vars) {
    var line = el('div', 'sheet-caption');
    captionParts(sys, c, F(), text, vars).forEach(function(p) {
        if (p.error) { var s = el('span', 'sheet-caption-val sheet-err', '\u2014'); s.title = p.error; line.appendChild(s); }
        else if (p.value !== undefined) line.appendChild(el('span', 'sheet-caption-val', p.text));
        else line.appendChild(document.createTextNode(p.text));
    });
    return line;
}
function fieldNodeBody(f, c, e, gm, own, sysArg) {   // sysArg: the system being drawn (the pop-out's cleaned copy, the Layout preview's draft); the item list resolves its defs from it
    var box = el('div', 'sheet-field sheet-kind-' + f.kind);
    if (f.tile) box.classList.add('sheet-tile');   // Stage 3: compact stat tile (value big, label small)
    if (f.vis === 'gm') box.classList.add('sheet-gm');
    var lab = el('label', 'sheet-label', f.label); lab.title = f.key + (f.vis === 'gm' ? ' (GM only)' : ''); box.appendChild(lab);
    if (f.roll) { var rb = el('button', 'tool ghost sheet-field-roll', String.fromCharCode(55356, 57266)); rb.title = 'Roll ' + f.roll + ' · shift-click to add a modifier'; rb.disabled = !canRoll(c); rb.addEventListener('click', function(e) { sheetRoll(e, c.id, f.roll, f.label || f.key); }); lab.appendChild(rb); }   // the field's own roll (1.5.0)
    var editable = gm || (own && f.edit === 'owner' && f.vis === 'all');
    var raw = c.values ? c.values[f.id] : undefined;
    var k = f.kind;
    if (k === 'formula') { var v = el('div', 'sheet-value' + (e && e.error ? ' sheet-err' : '') + signTone(f, e), e && e.error ? '—' : e ? e.text + (f.unit && e.text !== '' ? ' ' + f.unit : '') : ''); v.title = e && e.error ? e.error : f.formula || ''; box.appendChild(v); return box; }
    if (k === 'number' || k === 'skill') {
        var row = el('div', 'sheet-ctl');
        var inp = el('input', 'field sheet-num'); inp.type = 'number'; inp.dataset.fid = f.id; inp.value = raw === undefined ? String(f.def) : String(raw);
        if (f.min !== undefined) inp.min = String(f.min); if (f.max !== undefined) inp.max = String(f.max); inp.step = String(f.step || 1); inp.disabled = !editable;
        inp.addEventListener('change', function() { commit(c, f, Number(inp.value)); });
        if (k === 'number' && f.slider && f.min !== undefined && f.max !== undefined) {   // Stage 5e: a gradient slider — the same number as a range on a two-colour track with end labels
            var sw = el('div', 'sheet-slider'); box.classList.add('sheet-has-slider');
            var ends = el('div', 'sheet-slider-ends'); ends.appendChild(el('span', 'sheet-slider-low', f.slider.low || '')); ends.appendChild(el('span', 'sheet-slider-high', f.slider.high || '')); sw.appendChild(ends);
            var rg = el('input', 'sheet-range'); rg.type = 'range'; rg.min = String(f.min); rg.max = String(f.max); rg.step = String(f.step || 1); rg.value = inp.value; rg.disabled = !editable; rg.dataset.fid = f.id; rg.dataset.part = 'range';
            rg.style.background = 'linear-gradient(90deg, ' + (f.slider.lowColor || 'var(--blue)') + ', ' + (f.slider.highColor || 'var(--gold)') + ')';   // colours are hex-validated by cleanSlider
            rg.title = (f.slider.low || String(f.min)) + ' \u2026 ' + (f.slider.high || String(f.max));   // "Dark Side … Light Side", or "-100 … 100"
            // arrow keys fire a change per step: one commit after the last step, so a player's nudges reach the GM as one edit (inside the
            // host's rate gate) and a drag still commits once on release; an unchanged value is never re-sent
            var rgTimer = null, rgSent = rg.value;
            rg.addEventListener('input', function() { inp.value = rg.value; });
            rg.addEventListener('change', function() { clearTimeout(rgTimer); rgTimer = setTimeout(function() { if (rg.value === rgSent) return; rgSent = rg.value; commit(c, f, Number(rg.value)); }, 200); });
            sw.appendChild(rg); row.appendChild(sw);
        }
        if (k === 'number') inp.className += signTone(f, e);   // Stage 5g (a skill colours its total instead)
        row.appendChild(inp);
        if (k === 'skill') { var tot = el('span', 'sheet-total' + (e && e.error ? ' sheet-err' : '') + signTone(f, e), e && e.error ? '—' : '= ' + (e ? e.text : '')); tot.title = e && e.error ? e.error : (f.base ? 'ranks + ' + f.base : 'ranks'); row.appendChild(tot); }
        if (f.unit) row.appendChild(el('span', 'sheet-unit', f.unit));   // Stage 5g
        box.appendChild(row); return box;
    }
    if (k === 'resource') {
        var cur = e && typeof e.value === 'number' ? e.value : 0, max = e && typeof e.max === 'number' ? e.max : null;
        var r = el('div', 'sheet-ctl');
        if (f.icon) r.appendChild(el('span', 'sheet-pool-icon', f.icon));   // Fold B
        if (f.icon || f.reset) r.classList.add('sheet-ctl-wrap');   // the extra controls wrap to a second line in a narrow cell, never into the next column
        var minus = el('button', 'tool ghost sheet-pm', '−'); minus.dataset.fid = f.id; minus.dataset.part = 'minus'; minus.title = 'One less'; minus.disabled = !editable;
        var ci = el('input', 'field sheet-num sheet-cur num-stepped'); ci.type = 'number'; ci.dataset.fid = f.id; ci.value = String(cur); ci.disabled = !editable; if (f.min !== undefined) ci.min = String(f.min); if (max !== null) ci.max = String(max);
        var plus = el('button', 'tool ghost sheet-pm', '+'); plus.dataset.fid = f.id; plus.dataset.part = 'plus'; plus.title = 'One more'; plus.disabled = !editable;
        var mx = el('span', 'sheet-total' + (e && e.error ? ' sheet-err' : ''), '/ ' + (max === null ? '—' : fmtNum(max)) + (f.unit ? ' ' + f.unit : '')); mx.title = e && e.error ? e.error : (f.maxFormula || 'no max');
        minus.addEventListener('click', function() { commit(c, f, { cur: cur - 1 }); });
        plus.addEventListener('click', function() { commit(c, f, { cur: cur + 1 }); });
        ci.addEventListener('change', function() { commit(c, f, { cur: Number(ci.value) }); });
        r.appendChild(minus); r.appendChild(ci); r.appendChild(plus); r.appendChild(mx);
        if (f.reset) {   // Fold B: fill back to the max (the host clamps it like any edit)
            var rs = el('button', 'tool ghost sheet-pm sheet-reset', '\u21bb'); rs.dataset.fid = f.id; rs.dataset.part = 'reset';
            rs.title = max === null ? 'No max to fill to' : 'Back to full (' + fmtNum(max) + ')'; rs.disabled = !editable || max === null || cur === max;
            rs.addEventListener('click', function() { if (max !== null) commit(c, f, { cur: max }); });
            r.appendChild(rs);
        }
        box.appendChild(r);
        if (f.bar === false) return box;   // Fold B: no bar
        var bar = el('div', 'sheet-bar'); var fill = el('div', 'sheet-bar-fill'); var pct = max ? Math.max(0, Math.min(100, (cur - (f.min || 0)) / Math.max(1, max - (f.min || 0)) * 100)) : 0; fill.style.width = pct + '%'; bar.appendChild(fill); box.appendChild(bar);
        return box;
    }
    if (k === 'toggle') { var lb = el('label', 'sheet-toggle'); var cb = el('input'); cb.type = 'checkbox'; cb.dataset.fid = f.id; cb.checked = raw === undefined ? f.def === true : raw === true; cb.disabled = !editable; cb.addEventListener('change', function() { commit(c, f, cb.checked); }); lb.appendChild(cb); lb.appendChild(document.createTextNode(' ' + (cb.checked ? 'on' : 'off'))); box.appendChild(lb); return box; }
    if (k === 'text') { var ti = el('input', 'field sheet-text'); ti.type = 'text'; ti.dataset.fid = f.id; ti.maxLength = f.max || 200; ti.value = raw === undefined ? String(f.def || '') : String(raw); ti.disabled = !editable; ti.addEventListener('change', function() { commit(c, f, ti.value); }); box.appendChild(ti); return box; }
    if (k === 'notes') { var ta = el('textarea', 'field sheet-notes'); ta.dataset.fid = f.id; ta.rows = 4; ta.value = raw === undefined ? '' : String(raw); ta.disabled = !editable; var tmr = null; ta.addEventListener('input', function() { clearTimeout(tmr); tmr = setTimeout(function() { commit(c, f, ta.value); }, 600); }); ta.addEventListener('change', function() { clearTimeout(tmr); commit(c, f, ta.value); }); box.appendChild(ta); return box; }
    if (k === 'select') { var se = el('select', 'field sheet-select'); se.dataset.fid = f.id; (f.options || []).forEach(function(o) { se.appendChild(opt(o, o, (raw === undefined ? f.def : raw) === o)); }); se.disabled = !editable; se.addEventListener('change', function() { commit(c, f, se.value); }); box.appendChild(se); return box; }
    if (k === 'item-list') {
        var sysI = sysArg || systemOf(getActiveCampaign()), carried = Array.isArray(raw) ? raw : [];
        var byId = {}; ((sysI && sysI.items) || []).forEach(function(it) { byId[it.id] = it; });
        var gmThrows = sysI && sysI.combat && sysI.combat.blastRoller === 'gm';
        var canThrow = (gm || (own && !gmThrows)) && !c.partial;   // who-rolls='gm' means only the GM throws
        var wrap = el('div', 'sheet-items' + (f.table ? ' sheet-items-table' : ''));
        if (f.table) itemTableInto(wrap, f, c, carried, byId, canThrow, editable);   // Stage 4: rich table
        else itemListInto(wrap, f, c, carried, byId, canThrow, editable);            // the plain carried list (as before)
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
// A roll from a sheet button: shift/alt-click opens the situational-modifier popover (Stage 5a); a plain click rolls straight away.
function sheetRoll(e, charId, expr, label, opts) {
    if (!window.wpDice) return;
    if ((e.shiftKey || e.altKey) && window.wpDice.rollWithMod) window.wpDice.rollWithMod(charId, expr, label, opts, e.currentTarget);
    else if (window.wpDice.rollFor) window.wpDice.rollFor(charId, expr, label, opts);
}
function rollNode(r, c) {
    var b = el('button', 'tool sheet-roll', r.label); var can = canRoll(c); b.title = r.formula + (can ? ' · shift-click to add a modifier' : ' (dice are off here, or this is not your character)'); b.disabled = !can;
    b.addEventListener('click', function(e) { sheetRoll(e, c.id, r.formula, r.label); });
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
function editResult(rid, ok, reason) { if (!ok) toast(reason === 'off' ? 'Character sheets are off here.' : reason === 'owner' ? 'That sheet is not yours.' : reason === 'field' ? 'That field cannot be edited.' : reason === 'slow' ? 'Slow down a little.' : reason === 'missing' ? 'That character is gone.' : reason === 'timeout' ? 'No answer from the GM; the change was undone.' : reason === 'paused' ? 'The table is paused.' : 'That value was not accepted.'); renderSheet(); }

/* ---------- the editor: fields, rolls, characters ---------- */
var draft = null, dirty = false, tab = 'fields', errorsById = {}, warningsById = {};
var KIND_LABEL = { number: 'Number', formula: 'Formula', resource: 'Resource', skill: 'Skill', toggle: 'Toggle', text: 'Text', notes: 'Notes', select: 'Select', 'item-list': 'Item list' };
var KIND_HELP = { number: 'A stored number (an attribute): default, min, max, step. With a min and a max it can show as a slider on a two-colour track.', formula: 'Computed from other fields; never stored, never edited.', resource: 'A current value with a formula for its max (HP): a bar with - and + on the sheet.', skill: 'Stored ranks plus a base formula; its value is ranks + base.', toggle: 'On or off (a condition); true or false in formulas.', text: 'A short text (up to 200 characters); not a number for formulas.', notes: 'A long text; never read by formulas.', select: 'One of a fixed list of options.', 'item-list': 'A list of items the character carries, filled from the Items library on the sheet.' };
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
    if (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource') { var tl = el('label', 'sys-hover'); var tc = el('input'); tc.type = 'checkbox'; tc.checked = !!f.tile; tc.className = 'sys-tile-chk'; tl.appendChild(tc); tl.appendChild(document.createTextNode(' Tile')); tl.title = 'Show this field as a stat tile (big value, small label)'; flags.appendChild(tl); }   // Stage 3
    if (f.kind === 'number') { var sl = el('label', 'sys-hover'); var sc = el('input'); sc.type = 'checkbox'; sc.checked = !!f.slider; sc.className = 'sys-slider-chk'; sl.appendChild(sc); sl.appendChild(document.createTextNode(' Slider')); sl.title = 'Show this number as a range on a two-colour track with end labels (needs a min and a max)'; flags.appendChild(sl); }   // Stage 5e
    if (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource') flags.appendChild(input('sys-unit field', f.unit, 'A short unit after the value, on the sheet and in the header (pts, kg, ft)', 'Unit'));   // Stage 5g
    if (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill') { var sgl = el('label', 'sys-hover'); var sgc = el('input'); sgc.type = 'checkbox'; sgc.checked = !!f.sign; sgc.className = 'sys-sign-chk'; sgl.appendChild(sgc); sgl.appendChild(document.createTextNode(' \u00b1 colour')); sgl.title = 'Colour the value by its sign: green above zero, red below (points remaining, a modifier)'; flags.appendChild(sgl); }   // Stage 5g
    if (f.kind !== 'notes' && f.kind !== 'text' && f.kind !== 'select' && f.kind !== 'item-list') flags.appendChild(input('sys-roll field', f.roll, 'A roll button for this field (dice allowed): d20 + ' + (f.key || 'Key'), 'Roll (optional)'));
    flags.appendChild(input('sys-caption field', f.caption, 'A line under the field on the sheet \u2014 {formula} shows a value, e.g. Base: {ST * 2}', 'Caption (optional)'));   // Fold B
    if (f.kind === 'resource') {   // Fold B: the pool's icon, a fill-to-max button, the bar
        flags.appendChild(input('sys-res-icon field', f.icon, 'An icon before the value \u2014 an emoji or a symbol', 'Icon'));
        var rsl = el('label', 'sys-hover'); var rsc = el('input'); rsc.type = 'checkbox'; rsc.checked = !!f.reset; rsc.className = 'sys-reset-chk'; rsl.appendChild(rsc); rsl.appendChild(document.createTextNode(' \u21bb Reset')); rsl.title = 'A button that fills the pool back to its max'; flags.appendChild(rsl);
        var bcl = el('label', 'sys-hover'); var bcc = el('input'); bcc.type = 'checkbox'; bcc.checked = f.bar !== false; bcc.className = 'sys-bar-chk'; bcl.appendChild(bcc); bcl.appendChild(document.createTextNode(' Bar')); bcl.title = 'The bar under the value (untick for just the numbers)'; flags.appendChild(bcl);
    }
    flags.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['dup', 'Duplicate', '&#10697;'], ['del', 'Delete this field', '&times;']]));
    row.appendChild(top); row.appendChild(flags);
    if (f.kind === 'number' && f.slider) {   // Stage 5e: the slider's end labels and track colours
        var srow = el('div', 'sys-sec-style sys-slider-row'); srow.appendChild(el('span', 'sys-sec-style-lbl', 'Slider'));
        srow.appendChild(input('sys-slider-low field', f.slider.low, 'The label at the low end (e.g. Dark Side)', 'Low end label'));
        srow.appendChild(input('sys-slider-high field', f.slider.high, 'The label at the high end (e.g. Light Side)', 'High end label'));
        var themeHex = function(v, fb) { try { var x = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); return /^#[0-9a-fA-F]{6}$/.test(x) ? x.toLowerCase() : fb; } catch (er) { return fb; } };   // an unset colour draws the theme's own, so the swatch shows that one
        [['lowColor', 'Low colour', themeHex('--blue', '#4db3d3')], ['highColor', 'High colour', themeHex('--gold', '#e0a54f')]].forEach(function(cd) { var lab = el('label', 'sys-sec-color'); var ci = el('input'); ci.type = 'color'; ci.className = 'sys-slider-' + cd[0]; ci.value = f.slider[cd[0]] || cd[2]; ci.title = cd[1] + ' of the track'; lab.appendChild(ci); lab.appendChild(document.createTextNode(' ' + cd[1])); srow.appendChild(lab); });
        if (f.slider.lowColor || f.slider.highColor) { var slc = el('button', 'tool ghost sys-btn', 'Theme colours'); slc.dataset.act = 'slidercl'; slc.title = 'Back to the theme\u2019s accent and gold'; srow.appendChild(slc); }
        if (f.min === undefined || f.max === undefined) srow.appendChild(el('span', 'sys-note', 'Needs a min and a max to show as a slider; until then it is a plain number box (the labels and colours are kept).'));
        row.appendChild(srow);
    }
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
    else if (k === 'item-list') {
        def.appendChild(el('span', 'sys-note', 'A list the character fills from the Items library on the sheet (a throwable item shows a Throw button).'));
        var itbl = f.table || null;
        var onL = el('label', 'sys-hover'); var onC = el('input'); onC.type = 'checkbox'; onC.className = 'sys-itbl-on'; onC.checked = !!itbl; onL.appendChild(onC); onL.appendChild(document.createTextNode(' Rich table')); onL.title = 'Show carried items as a table with columns, chips and a totals footer instead of a plain list'; def.appendChild(onL);
        if (itbl) {
            var tcols = Array.isArray(itbl.columns) ? itbl.columns : [], box = el('div', 'sys-itbl');
            ['category', 'cost', 'damage', 'area', 'notes'].forEach(function(col) {
                var l = el('label', 'sys-itbl-col'); var cb = el('input'); cb.type = 'checkbox'; cb.className = 'sys-itbl-col-' + col; cb.checked = tcols.indexOf(col) >= 0;
                l.appendChild(cb); l.appendChild(document.createTextNode(' ' + ITEM_COL_LABEL[col]));
                if (col === 'notes') l.title = 'An expandable notes row per item'; else if (col === 'damage' || col === 'cost') l.title = 'GM only on the wire — blank for players';
                box.appendChild(l);
            });
            var chL = el('label', 'sys-itbl-col'); var chC = el('input'); chC.type = 'checkbox'; chC.className = 'sys-itbl-chips'; chC.checked = !!itbl.chips; chL.appendChild(chC); chL.appendChild(document.createTextNode(' Category chips')); chL.title = 'Show the category as a chip beside the name (in place of a category column)'; box.appendChild(chL);
            var ftL = el('label', 'sys-itbl-col'); var ftC = el('input'); ftC.type = 'checkbox'; ftC.className = 'sys-itbl-footer'; ftC.checked = !!itbl.footer; ftL.appendChild(ftC); ftL.appendChild(document.createTextNode(' Totals footer')); ftL.title = 'A footer row with the item count and total quantity'; box.appendChild(ftL);
            def.appendChild(box);
        }
    }
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
    if (!cm.cover || typeof cm.cover !== 'object') cm.cover = { on: false, style: 'graded' };
    box.appendChild(labeledSelect('sys-combat-auto', 'Blast automation', [['full', 'Full auto — roll & apply'], ['roll', 'Roll to chat; apply by hand'], ['measure', 'Measure only']], cm.blastAuto, 'What happens when a blast is thrown: full = roll damage and apply it to tokens in range; roll = post the roll for a human to apply; measure = area only.'));
    box.appendChild(labeledSelect('sys-combat-roller', 'Who rolls', [['owner', 'The character\'s owner'], ['gm', 'Always the GM']], cm.blastRoller, 'Who makes a thrown blast\'s rolls: the owning player, or always the GM.'));
    var resFields = (draft.fields || []).filter(function(f) { return f.kind === 'resource'; });
    box.appendChild(labeledSelect('sys-combat-hp', 'Damage subtracts from', [['', resFields.length ? '— none —' : '— add a resource field —']].concat(resFields.map(function(f) { return [f.id, f.label || f.key]; })), cm.hpResource, 'Which resource full-auto damage reduces (the "health" resource).'));
    box.appendChild(labeledSelect('sys-combat-cover-on', 'Cover from blockers', [['off', 'Off'], ['on', 'On — show cover on the ruler']], cm.cover.on ? 'on' : 'off', 'When on, dragging the ruler between two character tokens shows the cover between them, read from the map\'s sight-blockers (walls, pillars, closed doors, filled cells). Advisory only — you apply the effect by hand.'));
    box.appendChild(labeledSelect('sys-combat-cover-style', 'Cover grades', [['graded', 'Graded — half / three-quarters / total'], ['binary', 'Simple — cover / none']], cm.cover.style === 'binary' ? 'binary' : 'graded', 'Graded uses the corner rule for D&D-style tiers; Simple reports only whether there is cover (for systems that treat cover as one flat penalty or DR). The tier names are built in; custom thresholds come later.'));
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
        else if (c.indexOf('sys-unit') >= 0) { if (t.value.trim()) f.unit = t.value.slice(0, 32); else delete f.unit; }   // Stage 5g (Save cuts it to 8 code points, never half an emoji)
        else if (c.indexOf('sys-caption') >= 0) { if (t.value.trim()) f.caption = t.value.slice(0, 400); else delete f.caption; }   // Fold B (Save cuts it to 200)
        else if (c.indexOf('sys-res-icon') >= 0) { if (t.value.trim()) f.icon = t.value.slice(0, 32); else delete f.icon; }   // Fold B
        else if (c.indexOf('sys-slider-lowColor') >= 0) { f.slider = f.slider || {}; f.slider.lowColor = t.value; }   // Stage 5e (the colour classes before the label ones: 'sys-slider-low' is a prefix of both)
        else if (c.indexOf('sys-slider-highColor') >= 0) { f.slider = f.slider || {}; f.slider.highColor = t.value; }
        else if (c.indexOf('sys-slider-low') >= 0) { f.slider = f.slider || {}; f.slider.low = t.value; }
        else if (c.indexOf('sys-slider-high') >= 0) { f.slider = f.slider || {}; f.slider.high = t.value; }
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
    if (c.indexOf('sys-combat-cover-on') >= 0) { if (!draft.combat.cover) draft.combat.cover = { on: false, style: 'graded' }; draft.combat.cover.on = t.value === 'on'; markDirty(); patchErrors(); return; }
    if (c.indexOf('sys-combat-cover-style') >= 0) { if (!draft.combat.cover) draft.combat.cover = { on: false, style: 'graded' }; draft.combat.cover.style = t.value === 'binary' ? 'binary' : 'graded'; markDirty(); patchErrors(); return; }
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
        else if (c.indexOf('sys-tile-chk') >= 0) { if (t.checked) f.tile = true; else delete f.tile; }   // Stage 3: stat-tile display
        else if (c.indexOf('sys-sign-chk') >= 0) { if (t.checked) f.sign = true; else delete f.sign; }   // Stage 5g: colour by sign
        else if (c.indexOf('sys-reset-chk') >= 0) { if (t.checked) f.reset = true; else delete f.reset; }   // Fold B: fill-to-max button
        else if (c.indexOf('sys-bar-chk') >= 0) { if (t.checked) delete f.bar; else f.bar = false; }   // Fold B: the bar (absent = shown)
        else if (c.indexOf('sys-slider-chk') >= 0) { if (t.checked) f.slider = f.slider || {}; else delete f.slider; markDirty(); renderAll(); return; }   // Stage 5e: slider on/off (its row of labels and colours appears)
        else if (c.indexOf('sys-slider-lowColor') >= 0 || c.indexOf('sys-slider-highColor') >= 0) { markDirty(); renderAll(); return; }   // a colour picked (the input handler stored it): redraw so "Theme colours" appears
        else if (c.indexOf('sys-itbl-on') >= 0) { if (t.checked) f.table = f.table || { columns: ['category'] }; else delete f.table; markDirty(); renderAll(); return; }   // Stage 4: rich item table on/off (seed one column so it renders)
        else if (c.indexOf('sys-itbl-col-') >= 0) { var col = c.slice(c.indexOf('sys-itbl-col-') + 13).split(/\s/)[0]; f.table = f.table || {}; var arr = Array.isArray(f.table.columns) ? f.table.columns : []; if (t.checked) { if (arr.indexOf(col) < 0) arr.push(col); } else arr = arr.filter(function(x) { return x !== col; }); f.table.columns = arr; }
        else if (c.indexOf('sys-itbl-chips') >= 0) { f.table = f.table || {}; if (t.checked) f.table.chips = true; else delete f.table.chips; }
        else if (c.indexOf('sys-itbl-footer') >= 0) { f.table = f.table || {}; if (t.checked) f.table.footer = true; else delete f.table.footer; }
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
    else if (act === 'slidercl' && item.slider) { delete item.slider.lowColor; delete item.slider.highColor; }   // Stage 5e: the track back to the theme's colours
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
    head.addEventListener('pointerup', function() {
        if (!drag) return; drag = null;
        var sized = p.classList.contains('sheet-sized'); if (sized) sizePanel(p, p.offsetWidth, p.offsetHeight);   // a sized panel moved down keeps its bottom on screen
        var r = p.getBoundingClientRect(), o = panelPref(); o.x = Math.round(r.left); o.y = Math.round(r.top); if (sized) { o.w = Math.round(r.width); o.h = Math.round(r.height); }
        setPref('wp_sheetPanel', JSON.stringify(o));
    });
    // Fold B: the corner grip resizes (the panel is anchored at its left while it does); double-click it for the default size
    var grip = ui('sheetResize'), rz = null;
    if (grip) {
        grip.addEventListener('pointerdown', function(e) { e.preventDefault(); e.stopPropagation(); var r = p.getBoundingClientRect(); p.style.left = r.left + 'px'; p.style.top = r.top + 'px'; p.style.right = 'auto'; rz = { x: e.clientX, y: e.clientY, w: r.width, h: r.height }; grip.setPointerCapture(e.pointerId); });
        grip.addEventListener('pointermove', function(e) { if (!rz || (e.clientX === rz.x && e.clientY === rz.y)) return; rz.moved = true; sizePanel(p, rz.w + e.clientX - rz.x, rz.h + e.clientY - rz.y); var sb = ui('sheetBody'); if (sb) syncFramePad(sb); });
        grip.addEventListener('pointerup', function() { if (!rz) return; var moved = rz.moved; rz = null; if (!moved) return; var r = p.getBoundingClientRect(), o = panelPref(); o.x = Math.round(r.left); o.y = Math.round(r.top); o.w = Math.round(r.width); o.h = Math.round(r.height); setPref('wp_sheetPanel', JSON.stringify(o)); });
        grip.addEventListener('dblclick', function() { p.style.width = ''; p.style.height = ''; p.classList.remove('sheet-sized'); var o = panelPref(); delete o.w; delete o.h; setPref('wp_sheetPanel', JSON.stringify(o)); var sb = ui('sheetBody'); if (sb) syncFramePad(sb); });
    }
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
window.wpSheets = { open: open, close: close, playerSystem: playerSystem, readablePages: readablePages, openPage: openPage, sheetRefsChanged: sheetRefsChanged, systemOf: systemOf, save: saveDraft, startFrom: startFrom, sync: sync, draft: function() { return draft; },
    charsOf: charsOf, charList: charList, charById: charById, newCharacter: newCharacter, deleteCharacter: deleteCharacter, linkToken: linkToken, newFromToken: newFromToken, syncOwners: syncOwners, ownerFromToken: ownerFromToken,
    charSelectHtml: charSelectHtml, wireCharSelect: wireCharSelect, hoverLinesForToken: hoverLinesForToken, hoverLinesForTokenId: hoverLinesForTokenId,
    openSheet: openSheet, closeSheet: closeSheet, canOpen: canOpen, renderSheet: renderSheet, renderSheetInto: renderSheetInto, charChanged: charChanged, charGone: charGone, editResult: editResult, sheetOpen: function() { return sheetOpen; }, canRoll: canRoll, hasInitRoll: hasInitRoll, rollInit: rollInit, fromShadowBase: fromShadowBase, LIMITS: LIMITS };

// Pop the open sheet out into its own window (like the doc panel); dock-back there reopens the in-app panel.
(function wireSheetPopout() {
    var pop = document.getElementById('sheetPop');
    if (pop) pop.addEventListener('click', function() {
        var camp = getActiveCampaign(); if (!camp || !sheetOpen) return;
        window.open(location.origin + '/?popout=sheet:' + encodeURIComponent(camp.id) + '/' + encodeURIComponent(sheetOpen), 'wpPopout_sheet_' + sheetOpen, 'width=840,height=1000');
        closeSheet();
    });
    try { new BroadcastChannel('waypoint').addEventListener('message', function(e) {
        if (e.data && e.data.type === 'dock' && e.data.kind === 'sheet') { var a = e.data.arg || ''; openSheet(a.slice(a.indexOf('/') + 1)); }
    }); } catch (e) {}
})();
